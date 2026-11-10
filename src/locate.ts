import * as fs from "fs";
import * as path from "path";

/**
 * The folder the app lives in:
 *  - Windows: the folder containing the .exe
 *  - macOS:   the folder containing the .app bundle (the binary sits in X.app/Contents/MacOS/)
 *  - unpackaged `node bundle.cjs`: the current directory
 */
export function appFolder(): string {
  if (!(process as { pkg?: unknown }).pkg) return process.cwd();
  const dir = path.dirname(process.execPath);
  for (let d = dir; d !== path.dirname(d); d = path.dirname(d)) {
    if (d.endsWith(".app")) return path.dirname(d);
  }
  return dir;
}

/** Name of the app/exe itself, so it's never listed as a stray file. */
export function selfName(): string | null {
  if (!(process as { pkg?: unknown }).pkg) return null;
  for (let d = process.execPath; d !== path.dirname(d); d = path.dirname(d)) {
    if (d.endsWith(".app")) return path.basename(d);
  }
  return path.basename(process.execPath);
}

/** macOS runs quarantined apps from a random read-only copy, where neither the config nor the bills are. */
export const TRANSLOCATED_MESSAGE =
  "macOS is running this app from a temporary location, so it can't see the files next to it.\n\n" +
  "In Finder, drag the app into a different folder and back again, then double-click it once more.";
export const isTranslocated = (dir: string) => dir.includes("/AppTranslocation/");

/** Folder named like "2026" → 2026; otherwise the most common YYYY in the file names; else this year. */
export function detectYear(dir: string, today: Date): number {
  const base = path.basename(dir);
  if (/^\d{4}$/.test(base)) return Number(base);
  const counts = new Map<number, number>();
  try {
    for (const f of fs.readdirSync(dir)) {
      const m = /^(\d{4})(0[1-9]|1[0-2]) /.exec(f);
      if (m) counts.set(Number(m[1]), (counts.get(Number(m[1])) ?? 0) + 1);
    }
  } catch {
    /* unreadable: main() reports it */
  }
  let best = today.getFullYear();
  let bestN = 0;
  for (const [y, n] of counts) if (n > bestN) [best, bestN] = [y, n];
  return best;
}
