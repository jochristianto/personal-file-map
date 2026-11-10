import { createHash } from "crypto";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { configDir, isMac, isWin } from "./platform";

/**
 * One copy of the app per folder. A second launch for the same folder would otherwise open its own window
 * and server, and the two could overwrite each other's config.local.json or generate the PDF at once.
 *
 * The lock is a small file in the app's config folder (not next to the app, which may be synced), named
 * after the app folder, holding the running copy's pid and, once its server is up, its address. It is
 * stale when that pid is gone or nothing listens at that address any more.
 */
export interface InstanceLock {
  /** Records where this copy's window is served, so a later launch can ask it how it's doing. */
  setAddress(port: number, token: string): void;
  /** Removes the lock if it is still this copy's. */
  release(): void;
}

/** What the running copy's window is doing; see "GET /api/ping" in window.ts. */
export type WindowState = "starting" | "open" | "closing";

interface LockInfo {
  pid: number;
  startedAt: number;
  port?: number;
  token?: string;
}

const STARTUP_MS = 30_000; // a copy that hasn't recorded its address by now crashed while starting
const PING_MS = 2000;
const CLOSING_WAIT_MS = 10_000; // a closed window's copy quits within window.ts's GRACE_MS

/** Takes the lock for `appDir`, or returns null when another copy already has that folder open. */
export async function acquireLock(appDir: string): Promise<InstanceLock | null> {
  const dir = path.join(configDir(), "locks");
  fs.mkdirSync(dir, { recursive: true });
  const key = isMac || isWin ? path.resolve(appDir).toLowerCase() : path.resolve(appDir);
  const file = path.join(dir, `${createHash("sha256").update(key).digest("hex").slice(0, 16)}.json`);

  for (let attempt = 0; attempt < 3; attempt++) {
    const mine: LockInfo = { pid: process.pid, startedAt: Date.now() };
    try {
      fs.writeFileSync(file, JSON.stringify(mine), { flag: "wx", mode: 0o600 });
      return ownLock(file, mine);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    const other = readLock(file);
    const state = other && (await runningState(other));
    if (state === "closing") {
      // Its window was just closed and it is about to quit: wait for that, then take over.
      if (!(await exited(other!.pid, CLOSING_WAIT_MS))) return null;
    } else if (state) {
      return null;
    }
    // Stale (or gone by now). Only delete what we read, in case a third launch replaced it meanwhile.
    if (sameLock(readLock(file), other)) fs.rmSync(file, { force: true });
  }
  return null; // another launch keeps winning the race, so a copy is running
}

function ownLock(file: string, mine: LockInfo): InstanceLock {
  return {
    setAddress(port, token) {
      // Write and rename, so a launch reading at the same moment never sees half a file
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ ...mine, port, token }), { mode: 0o600 });
      fs.renameSync(tmp, file);
    },
    release() {
      if (readLock(file)?.pid === mine.pid) fs.rmSync(file, { force: true });
    },
  };
}

function readLock(file: string): LockInfo | null {
  try {
    const info = JSON.parse(fs.readFileSync(file, "utf8")) as LockInfo;
    return typeof info.pid === "number" ? info : null;
  } catch {
    return null;
  }
}

function sameLock(a: LockInfo | null, b: LockInfo | null): boolean {
  return (a === null && b === null) || (a !== null && b !== null && a.pid === b.pid && a.startedAt === b.startedAt);
}

/** How the copy that wrote `info` is doing, or null when it isn't running. */
async function runningState(info: LockInfo): Promise<WindowState | null> {
  if (info.pid === process.pid || !pidAlive(info.pid)) return null;
  if (info.port === undefined || info.token === undefined) {
    return Date.now() - info.startedAt < STARTUP_MS ? "starting" : null;
  }
  const answer = await ping(info.port, info.token);
  // Refused: nothing listens there, so that pid now belongs to another program. No answer in time: the
  // copy is busy (say, generating a large PDF), so it is still running.
  return answer === "refused" ? null : answer === "timeout" ? "open" : answer;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM"; // it exists, it just isn't ours to signal
  }
}

async function exited(pid: number, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (!pidAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return !pidAlive(pid);
}

function ping(port: number, token: string): Promise<WindowState | "refused" | "timeout"> {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: `/${token}/api/ping`, timeout: PING_MS }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (body += chunk));
      res.on("end", () => {
        try {
          const { window } = JSON.parse(body) as { window?: WindowState };
          // Something else on that port (wrong token, not our server): not our copy
          resolve(res.statusCode === 200 && window ? window : "refused");
        } catch {
          resolve("refused");
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve("timeout");
    });
    req.on("error", (err: NodeJS.ErrnoException) => resolve(err.code === "ECONNREFUSED" ? "refused" : "timeout"));
  });
}
