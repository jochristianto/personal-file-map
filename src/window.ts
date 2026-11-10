import { randomBytes } from "crypto";
import * as fs from "fs";
import * as http from "http";
import type { AddressInfo } from "net";
import * as path from "path";
import interRegular from "@fontsource/inter/files/inter-latin-400-normal.woff";
import interMedium from "@fontsource/inter/files/inter-latin-500-normal.woff";
import interSemibold from "@fontsource/inter/files/inter-latin-600-normal.woff";
import {
  DEFAULT_FOLDER,
  LOCAL_CONFIG_NAME,
  loadDefaults,
  loadSettings,
  resolveFolder,
  resolveSchedule,
  saveSettings,
  type ScheduleSpec,
} from "./config";
import { checkFolder, FolderError, generate } from "./generate";
import { detectYear, selfName } from "./locate";
import { chooseFolder, isWin, openAppWindow, openFile, openPrivacySettings, revealFile, showAlert, writeLog } from "./platform";
import { scanDirectory } from "./scan";
import page from "./window.html";

/**
 * The settings window: a small page served on 127.0.0.1 and opened as an app window. It edits the same
 * "folder" and "bills" as config.local.json; nothing is written (config or PDF) until the user clicks
 * Generate. Resolves once the window is closed.
 *
 * Only this app can talk to the server: it listens on loopback only, every URL carries a random token,
 * and requests whose Host isn't the loopback address are refused (DNS rebinding).
 */
export interface WindowOptions {
  appDir: string;
  title: string;
  /** Today's date, read on every request so a window left open past midnight stays right. */
  today: () => Date;
  /** Don't open the window, only print its address (testing). */
  noWindow?: boolean;
  /** Don't open the PDF after generating (testing). */
  noOpen?: boolean;
}

const FONTS: Record<string, Uint8Array> = { "400": interRegular, "500": interMedium, "600": interSemibold };
const GRACE_MS = 4000; // a reload reconnects within this; otherwise the window was closed
const FIRST_CONNECT_MS = 60_000;

export async function runSettingsWindow(opts: WindowOptions): Promise<void> {
  const token = randomBytes(18).toString("base64url");
  const base = `/${token}`;
  let port = 0;
  let clients = 0;
  let everConnected = false;
  let busy = false;
  let lastOut: string | null = null;
  let closeTimer: NodeJS.Timeout | null = null;
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => (finish = resolve));

  const scheduleClose = (ms: number) => {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(function check() {
      if (busy) return void (closeTimer = setTimeout(check, 500)); // let a running generate finish
      if (clients === 0) finish();
    }, ms);
  };

  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? "";
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(res, 403, "Forbidden");
      const url = new URL(req.url ?? "/", `http://${host}`);
      if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return send(res, 404, "Not found");
      const route = `${req.method} ${url.pathname.slice(base.length) || "/"}`;

      switch (route) {
        case "GET /":
          return send(res, 200, page, "text/html; charset=utf-8");

        case "GET /api/events": {
          // Open as long as the window is; when it drops for good, the app quits.
          res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
          res.write(": open\n\n");
          clients++;
          everConnected = true;
          if (closeTimer) clearTimeout(closeTimer);
          const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
          req.on("close", () => {
            clearInterval(ping);
            clients--;
            if (clients === 0) scheduleClose(GRACE_MS);
          });
          return;
        }

        case "GET /api/state": {
          const { settings, exists, error } = loadSettings(opts.appDir);
          return json(res, {
            title: opts.title,
            platform: process.platform,
            appDir: opts.appDir,
            configFile: path.join(opts.appDir, LOCAL_CONFIG_NAME),
            configExists: exists,
            configError: error,
            settings,
            defaultBills: Object.keys(loadDefaults().bills ?? {}),
            defaultFolder: DEFAULT_FOLDER,
          });
        }

        case "GET /api/preview":
          return json(res, await preview(opts.appDir, url.searchParams.get("folder") ?? DEFAULT_FOLDER, opts.today()));

        case "POST /api/browse": {
          const { folder } = (await readJson(req)) as { folder?: string };
          let start = resolveFolder(opts.appDir, folder || DEFAULT_FOLDER);
          if (!fs.existsSync(start)) start = opts.appDir;
          const picked = await chooseFolder("Choose the folder with your bill files", start);
          return json(res, picked ? { folder: toSetting(opts.appDir, picked) } : { cancelled: true });
        }

        case "POST /api/generate": {
          if (busy) return json(res, { ok: false, error: "Already generating, one moment." });
          busy = true;
          try {
            const result = await handleGenerate(opts, await readJson(req));
            lastOut = result.out;
            await writeLog(`OK ${new Date().toISOString()}\n${result.out}\n`);
            if (!opts.noOpen) openFile(result.out);
            return json(res, { ok: true, ...result, configFile: path.join(opts.appDir, LOCAL_CONFIG_NAME) });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await writeLog(`ERROR ${new Date().toISOString()}\n${err instanceof Error ? err.stack : message}\n`);
            return json(res, { ok: false, error: message });
          } finally {
            busy = false;
          }
        }

        case "POST /api/open": {
          const { target } = (await readJson(req)) as { target?: string };
          if (target === "privacy") return json(res, { ok: openPrivacySettings() });
          if (lastOut && target === "pdf") openFile(lastOut);
          if (lastOut && target === "folder") revealFile(lastOut);
          return json(res, { ok: Boolean(lastOut) });
        }

        case "POST /api/quit":
          json(res, { ok: true });
          return scheduleClose(300);
      }

      const font = /^GET \/fonts\/inter-(\d{3})\.woff$/.exec(route);
      if (font && FONTS[font[1]]) {
        res.writeHead(200, { "Content-Type": "font/woff", "Cache-Control": "max-age=86400" });
        return res.end(Buffer.from(FONTS[font[1]]));
      }
      send(res, 404, "Not found");
    } catch (err) {
      send(res, 500, err instanceof Error ? err.message : String(err));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  port = (server.address() as AddressInfo).port;
  const address = `http://127.0.0.1:${port}${base}/`;
  console.log(`Settings window: ${address}`);

  if (!opts.noWindow) {
    openAppWindow(address);
    // If no window ever connects (no browser could open it), say where it is instead of hiding forever.
    setTimeout(async () => {
      if (everConnected) return;
      await showAlert(opts.title, `The settings window didn't open. Open this address in a web browser:\n\n${address}`);
      setTimeout(() => !everConnected && finish(), FIRST_CONNECT_MS);
    }, FIRST_CONNECT_MS).unref();
  }

  await done;
  server.closeAllConnections();
  server.close();
}

/** Checks what the window sent, saves it to config.local.json, then generates the report. */
async function handleGenerate(opts: WindowOptions, body: unknown) {
  const { folder, bills } = (body ?? {}) as { folder?: unknown; bills?: unknown };
  if (typeof folder !== "string" || !folder.trim()) throw new Error("Choose the folder with your bill files.");
  if (!Array.isArray(bills)) throw new Error("The bills list is missing.");

  const entries: [string, ScheduleSpec][] = [];
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const entry of bills) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") throw new Error("The bills list is malformed.");
    const key = entry[0].trim().replace(/\s+/g, " ");
    const spec = entry[1] as ScheduleSpec;
    if (!key) {
      problems.push("A bill has no name.");
      continue;
    }
    if (seen.has(key.toLowerCase())) problems.push(`“${key}” is listed twice.`);
    seen.add(key.toLowerCase());
    const resolved = resolveSchedule(spec);
    if (resolved.kind === "error") problems.push(`“${key}”: ${resolved.message}.`);
    entries.push([key, spec]);
  }
  if (problems.length > 0) throw new Error(problems.join("\n"));

  const setting = folder.trim();
  await checkFolder(resolveFolder(opts.appDir, setting), setting);
  const existed = fs.existsSync(path.join(opts.appDir, LOCAL_CONFIG_NAME));
  saveSettings(opts.appDir, setting, Object.fromEntries(entries));
  console.log(`${existed ? "Saved" : "Created"} ${LOCAL_CONFIG_NAME}`);
  return generate(opts.appDir, opts.today(), !existed);
}

/** Read-only look at a bills folder for the window: which bills are there (nothing is renamed or converted). */
async function preview(appDir: string, folder: string, today: Date) {
  const dir = resolveFolder(appDir, folder.trim() || DEFAULT_FOLDER);
  try {
    await checkFolder(dir, undefined); // the window shows the setting right above the message
  } catch (err) {
    return { ok: false, dir, error: (err as Error).message, blocked: err instanceof FolderError && err.blocked };
  }
  const year = detectYear(dir, today);
  const scan = await scanDirectory(dir, year, selfName());
  const byName = new Map<string, Set<number>>();
  for (const f of scan.files) {
    if (!byName.has(f.name)) byName.set(f.name, new Set());
    byName.get(f.name)!.add(f.month);
  }
  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  const bills = [...byName.entries()]
    .map(([name, months]) => ({ name, months: [...months].sort((a, b) => a - b) }))
    .sort((a, b) => collator.compare(a.name, b.name));
  return { ok: true, dir, year, files: scan.files.length, skipped: scan.ignored.length, bills };
}

/** A picked folder as a "folder" setting: "./" or "./sub" inside the app's folder, else the absolute path. */
function toSetting(appDir: string, picked: string): string {
  const abs = path.resolve(picked.length > 1 ? picked.replace(/[\\/]+$/, "") : picked);
  const rel = path.relative(appDir, abs);
  if (rel === "") return DEFAULT_FOLDER;
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) return `./${rel.split(path.sep).join("/")}`;
  return isWin ? abs.replace(/\\/g, "/") : abs;
}

function send(res: http.ServerResponse, status: number, body: string, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function json(res: http.ServerResponse, data: unknown) {
  send(res, 200, JSON.stringify(data), "application/json; charset=utf-8");
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 1_000_000) {
        reject(new Error("Request too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("Invalid request"));
      }
    });
    req.on("error", reject);
  });
}
