import * as fs from "fs";
import * as os from "os";
import * as path from "path";
// Built into the app, so it still works when only the app is copied somewhere
import embeddedDefaults from "../../config.default.json";

/**
 * Both live next to the app:
 *  - config.default.json: shared, generic defaults (committed). Falls back to the built-in copy.
 *  - config.local.json:   your own settings and bills (created on first run). Overrides the default.
 */
export const DEFAULT_CONFIG_NAME = "config.default.json";
export const LOCAL_CONFIG_NAME = "config.local.json";
export const CONFIG_FILES = [DEFAULT_CONFIG_NAME, LOCAL_CONFIG_NAME];
/** Used only if neither config sets "folder". */
export const DEFAULT_FOLDER = "./";
/** "folder" written into a freshly created config.local.json: the app's own folder. */
export const NEW_LOCAL_FOLDER = "./";

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

/** One config file as written: everything optional. */
export interface PartialConfig {
  folder?: string;
  bills?: Record<string, ScheduleSpec>;
}

const LOCAL_HELP = [
  "Your settings. Overrides config.default.json (same keys). Created automatically with every bill found set to \"monthly\"; adjust as needed.",
  '"folder": where the bill files are ("./" = next to the app; relative, absolute or "~/..." paths work).',
  'Bill values: "monthly", "quarterly", "irregular", null, {"months": [1, 7]}, {"every": 2, "from": 3, "until": 12}. A key also covers bills that start with it; the longest match wins.',
];

/** Reads config.default.json (or the built-in copy) and config.local.json (null if it doesn't exist yet). */
export function loadConfigs(appDir: string): { defaults: PartialConfig; local: PartialConfig | null } {
  const defaults = readConfigFile(appDir, DEFAULT_CONFIG_NAME) ?? validate(embeddedDefaults, DEFAULT_CONFIG_NAME);
  const local = readConfigFile(appDir, LOCAL_CONFIG_NAME);
  return { defaults, local };
}

/** Local wins: its "folder" replaces the default's, its bill keys replace the same keys. */
export function mergeConfigs(defaults: PartialConfig, local: PartialConfig | null): BillsConfig {
  return {
    folder: local?.folder ?? defaults.folder ?? DEFAULT_FOLDER,
    bills: { ...(defaults.bills ?? {}), ...(local?.bills ?? {}) },
  };
}

/** First run: create config.local.json with every bill found set to "monthly". */
export function writeLocalConfig(appDir: string, folder: string, billNames: string[]): PartialConfig {
  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  const bills = Object.fromEntries([...billNames].sort(collator.compare).map((n) => [n, "monthly" as const]));
  const config: PartialConfig = { folder, bills };
  fs.writeFileSync(path.join(appDir, LOCAL_CONFIG_NAME), JSON.stringify({ _help: LOCAL_HELP, ...config }, null, 2) + "\n");
  return config;
}

function readConfigFile(appDir: string, name: string): PartialConfig | null {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(appDir, name), "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^﻿/, ""));
  } catch (err) {
    throw new Error(`${name} isn't valid JSON:\n${(err as Error).message}\n\nFix it and run again.`);
  }
  return validate(parsed, name);
}

function validate(parsed: unknown, name: string): PartialConfig {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object, e.g. { "folder": "./", "bills": { "Rent": "monthly" } }`);
  }
  const { folder, bills } = parsed as { folder?: unknown; bills?: unknown };
  if (folder !== undefined && (typeof folder !== "string" || !folder.trim())) {
    throw new Error(`"folder" in ${name} must be a path, e.g. "./" or "/Users/me/Bills/2026"`);
  }
  if (bills !== undefined && (bills === null || typeof bills !== "object" || Array.isArray(bills))) {
    throw new Error(`"bills" in ${name} must be an object, e.g. { "Rent": "monthly" }`);
  }
  return { folder: folder as string | undefined, bills: bills as Record<string, ScheduleSpec> | undefined };
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
