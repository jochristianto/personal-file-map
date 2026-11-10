import * as fs from "fs";
import * as os from "os";
import * as path from "path";
// source/config.default.json is compiled into the app: the template for new config.local.json files.
import embeddedDefaults from "../config.default.json";

/**
 * - config.default.json: built into the app (edit source/config.default.json and rebuild).
 *   Template for config.local.json, plus base bill schedules.
 * - config.local.json: next to the app, created on first run from the template. Its "folder" says
 *   where the bills are; its bill keys replace the same keys in the default.
 */
export const DEFAULT_CONFIG_NAME = "config.default.json";
export const LOCAL_CONFIG_NAME = "config.local.json";
export const CONFIG_FILES = [DEFAULT_CONFIG_NAME, LOCAL_CONFIG_NAME];
/** "./": the folder the config file is in. Used if no config sets "folder". */
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

/** The built-in config.default.json. */
export function loadDefaults(): PartialConfig {
  return validate(embeddedDefaults, `built-in ${DEFAULT_CONFIG_NAME}`);
}

/** config.local.json in `dir` (the app's folder); null if it doesn't exist yet. */
export function loadLocal(dir: string): PartialConfig | null {
  return readConfigFile(dir, LOCAL_CONFIG_NAME);
}

/** Bill keys in config.local.json replace the same keys in config.default.json. */
export function mergeConfigs(defaults: PartialConfig, local: PartialConfig | null): BillsConfig {
  return { bills: { ...(defaults.bills ?? {}), ...(local?.bills ?? {}) } };
}

/**
 * Adds bills as "monthly" to config.local.json in `dir`. If the file doesn't exist yet it starts as a
 * copy of the built-in config.default.json. Existing entries, other keys and their order are kept.
 */
export function addBillsToLocalConfig(dir: string, billNames: string[]): PartialConfig {
  const file = path.join(dir, LOCAL_CONFIG_NAME);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as Record<string, unknown>;
  } catch {
    raw = structuredClone(embeddedDefaults) as Record<string, unknown>; // missing (bad JSON was already reported)
  }
  const bills = { ...((raw.bills as Record<string, ScheduleSpec> | undefined) ?? {}) };
  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  for (const name of [...billNames].sort(collator.compare)) bills[name] = "monthly";
  raw.bills = bills;
  fs.writeFileSync(file, JSON.stringify(raw, null, 2) + "\n");
  return validate(raw, LOCAL_CONFIG_NAME);
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
