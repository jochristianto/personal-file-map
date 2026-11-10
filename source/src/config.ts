import * as fs from "fs";
import * as path from "path";

/** Lives next to the app and the bills. */
export const CONFIG_NAME = "bills-overview.config.json";

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

const HELP = [
  "Which months each bill is expected. Bills not listed (or null) are shown but never flagged.",
  'Values: "monthly", "quarterly" (Jan/Apr/Jul/Oct), "irregular", null, {"months": [1, 7]}, {"every": 2, "from": 3, "until": 12}.',
  'A key also covers every bill that starts with it: "Klaska PLN 01" covers "Klaska PLN 01 Photo 1 Before" etc. The longest matching key wins.',
];

/** Reads the config. If there is none, writes a starter listing every bill (unscheduled) and returns it. */
export function loadOrCreateConfig(dir: string, billNames: string[]): { config: BillsConfig; created: boolean } {
  const file = path.join(dir, CONFIG_NAME);
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    const config: BillsConfig = { bills: Object.fromEntries([...billNames].sort().map((n) => [n, null])) };
    fs.writeFileSync(file, JSON.stringify({ _help: HELP, ...config }, null, 2) + "\n");
    return { config, created: true };
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
  return { config: { bills: bills as Record<string, ScheduleSpec> }, created: false };
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
