import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** Always lives next to the app. Its "folder" says where the bills are (default: the same folder). */
export const CONFIG_NAME = "bills-overview.config.json";
export const DEFAULT_FOLDER = "./";

/**
 * How often a bill is expected:
 *   "monthly"                  every month
 *   "quarterly"                Jan, Apr, Jul, Oct
 *   "irregular"                some months only; shown but never flagged
 *   null                       not scheduled yet (same as leaving the bill out)
 *   { "months": [1, 7] }       exactly these months
 *   { "every": 2, "from": 3 }  every 2 months starting March
 * "from" / "until" (1–12) can be added to any object form to limit the range.
 */
export type ScheduleSpec =
  | "monthly"
  | "quarterly"
  | "irregular"
  | null
  | { months?: number[]; every?: number; from?: number; until?: number };

export interface BillsConfig {
  /** Folder with the bill files, relative to the config file (or absolute, or ~/…). Default "./". */
  folder: string;
  bills: Record<string, ScheduleSpec>;
}

export type Resolved =
  | { kind: "months"; months: number[]; label: string }
  | { kind: "irregular" }
  | { kind: "none" }
  | { kind: "error"; message: string };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const HELP = [
  '"folder": where the bill files are. "./" = the folder this file is in. Also accepts a relative path ("../2026"), an absolute path, or "~/...". The PDF is written there too.',
  '"bills": which months each bill is expected. Bills not listed (or null) are shown but never flagged.',
  'Values: "monthly", "quarterly" (Jan/Apr/Jul/Oct), "irregular", null, {"months": [1, 7]}, {"every": 2, "from": 3, "until": 12}.',
  'A key also covers every bill that starts with it: "Klaska PLN 01" covers "Klaska PLN 01 Photo 1 Before" etc. The longest matching key wins.',
];

/** Reads the config next to the app. Returns null if there is none yet. */
export function readConfig(appDir: string): BillsConfig | null {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(appDir, CONFIG_NAME), "utf8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^﻿/, ""));
  } catch (err) {
    throw new Error(`${CONFIG_NAME} isn't valid JSON:\n${(err as Error).message}\n\nFix it (or delete it to get a fresh one) and run again.`);
  }
  const bills = (parsed as { bills?: unknown })?.bills;
  if (!bills || typeof bills !== "object" || Array.isArray(bills)) {
    throw new Error(`${CONFIG_NAME} needs a "bills" object, e.g. { "bills": { "PLN": "monthly" } }`);
  }
  const folder = (parsed as { folder?: unknown }).folder ?? DEFAULT_FOLDER;
  if (typeof folder !== "string" || !folder.trim()) {
    throw new Error(`"folder" in ${CONFIG_NAME} must be a path, e.g. "./" or "/Users/me/Bills/2026"`);
  }
  return { folder, bills: bills as Record<string, ScheduleSpec> };
}

/** First run: write a starter config next to the app, listing every bill found as unscheduled. */
export function writeStarterConfig(appDir: string, folder: string, billNames: string[]): BillsConfig {
  const config: BillsConfig = { folder, bills: Object.fromEntries([...billNames].sort().map((n) => [n, null])) };
  fs.writeFileSync(path.join(appDir, CONFIG_NAME), JSON.stringify({ _help: HELP, ...config }, null, 2) + "\n");
  return config;
}

/** "./" → appDir, "../2026" → sibling, "~/Bills" → home, absolute paths as-is. */
export function resolveFolder(appDir: string, folder: string): string {
  const f = folder.trim();
  const expanded = f === "~" || f.startsWith("~/") || f.startsWith("~\\") ? path.join(os.homedir(), f.slice(1)) : f;
  return path.resolve(appDir, expanded);
}

/** Exact name, otherwise the longest key the name starts with (followed by a space). Case-insensitive. */
export function matchKey(name: string, keys: string[]): string | null {
  const n = name.toLowerCase();
  let best: string | null = null;
  for (const key of keys) {
    const k = key.trim().replace(/\s+/g, " ").toLowerCase();
    if (!k) continue;
    if (n === k) return key;
    if (n.startsWith(k + " ") && (!best || k.length > best.trim().length)) best = key;
  }
  return best;
}

export function resolveSchedule(spec: ScheduleSpec | undefined): Resolved {
  if (spec === null || spec === undefined) return { kind: "none" };
  if (spec === "irregular") return { kind: "irregular" };
  if (spec === "monthly") return { kind: "months", months: range(1, 12, 1), label: "" };
  if (spec === "quarterly") return { kind: "months", months: [1, 4, 7, 10], label: "quarterly" };
  if (typeof spec !== "object" || Array.isArray(spec)) {
    return { kind: "error", message: `unknown schedule ${JSON.stringify(spec)}` };
  }

  const { months, every, from = 1, until = 12 } = spec;
  if (!isMonth(from) || !isMonth(until) || from > until) {
    return { kind: "error", message: `"from"/"until" must be months 1–12 with from ≤ until` };
  }
  let list: number[];
  let label: string;
  if (months !== undefined) {
    if (!Array.isArray(months) || months.length === 0 || !months.every(isMonth)) {
      return { kind: "error", message: `"months" must be a list of numbers 1–12` };
    }
    list = [...new Set(months)].sort((a, b) => a - b).filter((m) => m >= from && m <= until);
    label = list.map((m) => MON[m - 1]).join(", ");
  } else if (every !== undefined) {
    if (!Number.isInteger(every) || every < 1 || every > 12) {
      return { kind: "error", message: `"every" must be a whole number of months, 1–12` };
    }
    list = range(from, until, every);
    const base = every === 1 ? "" : every === 3 ? "quarterly" : `every ${every} months`;
    label = [base, from > 1 ? `from ${MON[from - 1]}` : "", until < 12 ? `until ${MON[until - 1]}` : ""].filter(Boolean).join(" ");
  } else {
    return { kind: "error", message: `needs "months" or "every"` };
  }
  return { kind: "months", months: list, label };
}

const isMonth = (m: unknown): m is number => Number.isInteger(m) && (m as number) >= 1 && (m as number) <= 12;
const range = (a: number, b: number, step: number) => {
  const out: number[] = [];
  for (let m = a; m <= b; m += step) out.push(m);
  return out;
};
