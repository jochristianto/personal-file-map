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
  loadApiKeys,
  LOCAL_CONFIG_NAME,
  loadDefaults,
  loadSettings,
  resolveFolder,
  resolveSchedule,
  saveSettings,
  type ScheduleSpec,
} from "./config";
import { countTransactions } from "./analyze";
import { checkFolder, FolderError, generate } from "./generate";
import { detectYear, selfName } from "./locate";
import { LOGS_FOLDER } from "./ailog";
import type { InstanceLock } from "./lock";
import { aiTotals, editReading, electricity, meterPhotos, ReadingStore, READINGS_NAME, validateMeters, type Electricity, type MeterSettings } from "./meters";
import { viewablePhoto } from "./photo";
import { chooseFolder, isWin, openAppWindow, openFile, openPrivacySettings, revealFile, showAlert, writeLog } from "./platform";
import { isProvider, keyStatus, mergeKeys, PROVIDERS, type PendingKeys } from "./reader";
import { scanDirectory } from "./scan";
import { kindOf } from "./usage";
import page from "./window.html";
import { version as APP_VERSION } from "../package.json";

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
  /** API keys typed in the window: used right away, written to config.local.json on Generate. */
  pendingKeys?: PendingKeys;
  /** This copy's single-instance lock (lock.ts): told the window's address once the server is up. */
  lock?: InstanceLock;
}

const FONTS: Record<string, Uint8Array> = { "400": interRegular, "500": interMedium, "600": interSemibold };
const GRACE_MS = 4000; // a reload reconnects within this; otherwise the window was closed
const FIRST_CONNECT_MS = 60_000;

/** The footer's links, opened in the default browser. The page only names one; it can't open any other URL. */
const REPO_URL = "https://github.com/jochristianto/personal-file-map";
const LINKS: Record<string, string> = {
  repo: REPO_URL,
  issues: `${REPO_URL}/issues/new/choose`,
  faq: `${REPO_URL}/blob/main/FAQ.md`,
};

export async function runSettingsWindow(opts: WindowOptions): Promise<void> {
  opts = { ...opts, pendingKeys: {} };
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

        case "GET /api/ping": {
          // A second launch asking whether this copy is still running (lock.ts)
          const window = clients > 0 ? "open" : everConnected ? "closing" : "starting";
          return json(res, { ok: true, window });
        }

        case "GET /api/state": {
          const { settings, exists, error } = loadSettings(opts.appDir);
          const { apiKeys: _keys, ...meters } = settings.meters; // the keys stay here; the page only learns whether one is set
          return json(res, {
            title: opts.title,
            version: APP_VERSION,
            links: LINKS,
            platform: process.platform,
            appDir: opts.appDir,
            configFile: path.join(opts.appDir, LOCAL_CONFIG_NAME),
            configExists: exists,
            configError: error,
            settings: { ...settings, meters },
            defaultBills: Object.keys(loadDefaults().bills ?? {}),
            defaultFolder: DEFAULT_FOLDER,
            providers: PROVIDERS,
            keys: keyStatus(loadApiKeys(opts.appDir), opts.pendingKeys!),
            readingsName: READINGS_NAME,
          });
        }

        case "POST /api/keys": {
          // The key itself never goes back to the page; only whether one is saved and its last 4 characters.
          const { provider, key, revert } = (await readJson(req)) as { provider?: unknown; key?: unknown; revert?: unknown };
          if (!isProvider(provider)) return json(res, { ok: false, error: "Unknown provider." });
          if (revert === true) {
            delete opts.pendingKeys![provider];
            return json(res, { ok: true, keys: keyStatus(loadApiKeys(opts.appDir), opts.pendingKeys!) });
          }
          const k = typeof key === "string" ? key.trim() : "";
          if (k && (/\s/.test(k) || k.length < 20)) return json(res, { ok: false, error: "That doesn't look like an API key." });
          const saved = loadApiKeys(opts.appDir);
          if (k) opts.pendingKeys![provider] = k;
          else if (saved[provider]) opts.pendingKeys![provider] = null; // removed from config.local.json on Generate
          else delete opts.pendingKeys![provider];
          return json(res, { ok: true, keys: keyStatus(saved, opts.pendingKeys!) });
        }

        case "POST /api/meters":
        case "POST /api/meters/read":
        case "POST /api/meters/edit": {
          if (busy) return json(res, { ok: false, error: "Busy generating the report, one moment." });
          busy = true;
          try {
            return json(res, await handleMeters(opts, route, await readJson(req)));
          } catch (err) {
            return json(res, { ok: false, error: err instanceof Error ? err.message : String(err) });
          } finally {
            busy = false;
          }
        }

        case "GET /api/meters/photo": {
          // A meter photo for the window's viewer: only photo files inside the bills folder
          const folder = url.searchParams.get("folder")?.trim() || DEFAULT_FOLDER;
          const file = url.searchParams.get("file") ?? "";
          const dir = resolveFolder(opts.appDir, folder);
          const abs = path.resolve(dir, file);
          const rel = path.relative(dir, abs);
          const ext = path.extname(abs).slice(1).toLowerCase();
          if (!file || rel.startsWith("..") || path.isAbsolute(rel) || !["jpg", "jpeg", "png", "heic"].includes(ext)) return send(res, 400, "Not a photo in the bills folder.");
          let buf: Buffer;
          try {
            buf = await fs.promises.readFile(abs);
          } catch {
            return send(res, 404, "That photo isn't in the bills folder any more.");
          }
          const { body, type } = await viewablePhoto(buf, ext);
          res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
          return res.end(body);
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

        case "POST /api/save": {
          // "Save" in the window: config.local.json only, without generating the report
          if (busy) return json(res, { ok: false, error: "Busy generating the report, one moment." });
          busy = true;
          try {
            const { existed } = await saveFromWindow(opts, await readJson(req));
            return json(res, { ok: true, created: !existed, configFile: path.join(opts.appDir, LOCAL_CONFIG_NAME) });
          } catch (err) {
            return json(res, { ok: false, error: err instanceof Error ? err.message : String(err) });
          } finally {
            busy = false;
          }
        }

        case "POST /api/open": {
          const { target } = (await readJson(req)) as { target?: string };
          if (target === "privacy") return json(res, { ok: openPrivacySettings() });
          if (target && Object.hasOwn(LINKS, target)) {
            openFile(LINKS[target]); // in the default browser, not the app window's own profile
            return json(res, { ok: true });
          }
          const keyPage = PROVIDERS.find((p) => target === `keys:${p.id}`);
          if (keyPage) {
            openFile(keyPage.keyUrl); // in the default browser, where the user is signed in
            return json(res, { ok: true });
          }
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
  opts.lock?.setAddress(port, token);

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
/** Saves the window's settings, then generates the report from them. */
async function handleGenerate(opts: WindowOptions, body: unknown) {
  const { existed } = await saveFromWindow(opts, body);
  return generate(opts.appDir, opts.today(), !existed);
}

/**
 * Checks what the window sent and writes it to config.local.json, with any API keys typed since the last
 * save. Nothing else is touched: no folder tidying, no report. `existed`: the file was there before.
 */
async function saveFromWindow(opts: WindowOptions, body: unknown): Promise<{ existed: boolean }> {
  const { folder, bills, meters: rawMeters } = (body ?? {}) as { folder?: unknown; bills?: unknown; meters?: unknown };
  if (typeof folder !== "string" || !folder.trim()) throw new Error("Choose the folder with your bill files.");
  const meters = validateMeters(rawMeters, "the settings window");
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
  saveSettings(opts.appDir, setting, Object.fromEntries(entries), meters, opts.pendingKeys);
  for (const k of Object.keys(opts.pendingKeys!)) delete opts.pendingKeys![k as keyof PendingKeys]; // written now
  console.log(`${existed ? "Saved" : "Created"} ${LOCAL_CONFIG_NAME}`);
  return { existed };
}

/**
 * Meter readings for the window, with the settings as they are in the window (not necessarily saved):
 * list them, read the photos that have no reading yet, or save a value typed in.
 */
async function handleMeters(opts: WindowOptions, route: string, body: unknown) {
  const b = (body ?? {}) as { folder?: unknown; meters?: unknown; file?: unknown; kind?: unknown; kwh?: unknown };
  const folder = typeof b.folder === "string" && b.folder.trim() ? b.folder.trim() : DEFAULT_FOLDER;
  const settings: MeterSettings = validateMeters(b.meters, "the settings window");
  settings.apiKeys = mergeKeys(loadApiKeys(opts.appDir), opts.pendingKeys ?? {}); // the page never has them
  const dir = resolveFolder(opts.appDir, folder);
  await checkFolder(dir, folder);
  const year = detectYear(dir, opts.today());
  const scan = await scanDirectory(dir, year, selfName());

  if (route === "POST /api/meters/edit") {
    const kind = b.kind;
    const kwh = typeof b.kwh === "number" ? b.kwh : Number(b.kwh);
    if (kind !== "balance" && kind !== "topup" && kind !== "other") throw new Error("Unknown reading type.");
    if (kind !== "other" && !(Number.isFinite(kwh) && kwh > 0 && kwh < 100_000)) throw new Error("Enter the kWh shown on the photo, e.g. 78.64");
    const store = ReadingStore.load(dir);
    const photo = (await meterPhotos(dir, year, scan.files, settings.bills, store)).find((p) => p.file === b.file);
    if (!photo) throw new Error("That photo isn't in the bills folder any more.");
    editReading(store, photo, kind, kind === "other" ? 0 : kwh);
  }

  const result = await electricity(dir, year, scan.files, settings, {
    read: route === "POST /api/meters/read",
    logDir: path.join(opts.appDir, LOGS_FOLDER),
  });
  return { ok: true, ...forWindow(result) };
}

/** Electricity results as plain JSON for the page (dates as ISO strings). */
function forWindow(e: Electricity) {
  return {
    reader: e.reader,
    blocked: e.blocked,
    read: e.read,
    meters: e.usages.map((u) => ({
      meter: u.meter,
      totalUsed: u.totalUsed,
      cycles: u.cycles,
      perDay: u.rate?.perDay ?? null,
      rateDays: u.rate?.days ?? null,
      nextTopUp: u.frequency.next?.toISOString() ?? null,
      totalToppedUp: u.totalToppedUp,
      spent: u.spent,
      spentUnknown: u.spentUnknown,
      topUps: u.frequency.count,
      balance: u.balance && { kwh: u.balance.kwh, at: u.balance.at.toISOString() },
      runsOut: u.runsOut?.toISOString() ?? null,
      unread: u.unread,
      /** Payment files still to read: for the amount paid, a date or the kWh bought. */
      unreadPayments: e.paymentsUnread.filter((q) => q.meter === u.meter).length,
      ai: aiTotals([...u.photos.map((p) => p.reading), ...e.payments.filter((q) => q.meter === u.meter).map((q) => q.reading)]),
      problems: u.events.filter((e) => e.problem).map((e) => ({ at: e.at.toISOString(), estimated: e.estimated, problem: e.problem })),
      photos: u.photos.map((p) => ({
        file: p.file,
        takenAt: p.takenAt.toISOString(),
        dateSource: p.dateSource,
        paymentFile: p.paymentFile,
        label: p.label,
        reading: p.reading && {
          kind: kindOf(p) ?? p.reading.kind, // what the numbers use: your correction, else the file's label
          kwh: p.reading.kwh,
          code: p.reading.code,
          confidence: p.reading.confidence,
          note: p.reading.note,
          by: p.reading.by,
          edited: Boolean(p.reading.edited),
          usage: p.reading.usage ?? null,
          costUsd: p.reading.costUsd ?? null,
        },
      })),
    })),
  };
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
  const txns = new Map<string, Set<string>[]>();
  for (const f of scan.files) {
    if (!byName.has(f.name)) byName.set(f.name, new Set());
    byName.get(f.name)!.add(f.month);
    if (!txns.has(f.name)) txns.set(f.name, Array.from({ length: 12 }, () => new Set<string>()));
    txns.get(f.name)![f.month - 1].add(f.txn === null ? "-" : String(f.txn));
  }
  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  const bills = [...byName.entries()]
    .map(([name, months]) => ({ name, months: [...months].sort((a, b) => a - b), transactions: txns.get(name)!.map(countTransactions) }))
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
