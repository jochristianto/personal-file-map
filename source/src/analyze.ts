import { CONFIG_NAME, matchKey, resolveSchedule, type BillsConfig } from "./config";
import type { BillGroup, BillRow, CellState, IgnoredFile, Report, RowStatus, ScanResult } from "./types";

const GENERAL = "General";

export interface AnalyzeOptions {
  today: Date;
  outputName: string;
  housekeeping: IgnoredFile[];
  config: BillsConfig;
  configCreated: boolean;
}

/**
 * Nothing is guessed: which months a bill is expected comes only from bills-overview.config.json.
 * A scheduled month without a file is "missing" (past) or "due" (current month).
 */
export function analyze(scan: ScanResult, opts: AnalyzeOptions): Report {
  const { year } = scan;
  const todayYear = opts.today.getFullYear();
  const currentMonth = year < todayYear ? 13 : year > todayYear ? 0 : opts.today.getMonth() + 1;

  const byName = new Map<string, Set<number>>();
  for (const f of scan.files) {
    if (!byName.has(f.name)) byName.set(f.name, new Set());
    byName.get(f.name)!.add(f.month);
  }

  const names = [...byName.keys()];
  const firstWordCount = new Map<string, number>();
  for (const n of names) {
    const w = firstWord(n);
    firstWordCount.set(w, (firstWordCount.get(w) ?? 0) + 1);
  }

  const keys = Object.keys(opts.config.bills);
  const usedKeys = new Set<string>();
  const configNotes: IgnoredFile[] = [];
  const badKeys = new Set<string>();

  const rows: BillRow[] = names.map((name) => {
    const paidMonths = [...byName.get(name)!].sort((a, b) => a - b);
    const key = matchKey(name, keys);
    let schedule = resolveSchedule(key === null ? null : opts.config.bills[key]);
    if (key !== null) usedKeys.add(key);
    if (schedule.kind === "error") {
      if (!badKeys.has(key!)) configNotes.push({ file: `“${key}”`, reason: `${schedule.message}, ignored` });
      badKeys.add(key!);
      schedule = { kind: "none" };
    }

    const cells: CellState[] = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      if (paidMonths.includes(m)) return "paid";
      return m > currentMonth ? "future" : "none";
    });
    if (schedule.kind === "months") {
      for (const m of schedule.months) {
        if (cells[m - 1] === "paid") continue;
        if (m < currentMonth) cells[m - 1] = "missing";
        else if (m === currentMonth) cells[m - 1] = "due";
      }
    }

    const missingMonths = cells.flatMap((c, i) => (c === "missing" ? [i + 1] : []));
    const dueNow = cells.includes("due");
    const pattern: BillRow["pattern"] =
      schedule.kind === "months" ? "scheduled" : schedule.kind === "irregular" ? "irregular" : "unscheduled";
    const status: RowStatus =
      pattern !== "scheduled" ? pattern : missingMonths.length > 0 ? "missing" : dueNow ? "due" : "ok";

    const w = firstWord(name);
    const group = (firstWordCount.get(w) ?? 0) >= 2 ? w : GENERAL;
    const label = group === GENERAL ? name : name.slice(w.length).trim() || name;

    return {
      name,
      group,
      label,
      cells,
      paidMonths,
      pattern,
      scheduleLabel: schedule.kind === "months" ? schedule.label : "",
      expectedMonths: schedule.kind === "months" ? schedule.months : [],
      missingMonths,
      dueNow,
      longestStreak: longestRun(paidMonths),
      status,
    };
  });

  for (const key of keys) {
    if (!usedKeys.has(key)) configNotes.push({ file: `“${key}”`, reason: "in config but matches no bill" });
  }
  const unscheduled = rows.filter((r) => r.pattern === "unscheduled");
  if (opts.configCreated) {
    configNotes.unshift({ file: CONFIG_NAME, reason: "created: set a schedule for each bill" });
  } else if (unscheduled.length > 0) {
    configNotes.unshift({ file: CONFIG_NAME, reason: `${unscheduled.length} bill${unscheduled.length > 1 ? "s have" : " has"} no schedule` });
  }

  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  const groupMap = new Map<string, BillRow[]>();
  for (const r of rows) {
    if (!groupMap.has(r.group)) groupMap.set(r.group, []);
    groupMap.get(r.group)!.push(r);
  }
  const groups: BillGroup[] = [...groupMap.entries()]
    .map(([name, rs]) => ({ name, rows: rs.sort((a, b) => collator.compare(a.label, b.label)) }))
    .sort((a, b) => (a.name === GENERAL ? -1 : b.name === GENERAL ? 1 : collator.compare(a.name, b.name)));
  const orderedRows = groups.flatMap((g) => g.rows);

  const monthTotals = Array.from({ length: 12 }, (_, i) => rows.filter((r) => r.cells[i] === "paid").length);

  const scheduled = orderedRows.filter((r) => r.pattern === "scheduled");
  const cm = currentMonth - 1;
  const inYear = currentMonth >= 1 && currentMonth <= 12;
  const paidThisMonth = inYear ? scheduled.filter((r) => r.cells[cm] === "paid").length : 0;
  const dueThisMonth = inYear ? scheduled.filter((r) => r.cells[cm] === "due") : [];
  const missingBills = scheduled.filter((r) => r.missingMonths.length > 0);
  const missingCells = missingBills.reduce((n, r) => n + r.missingMonths.length, 0);
  // Coverage: scheduled months before this month that have a file
  const coveragePaid = scheduled.reduce(
    (n, r) => n + r.expectedMonths.filter((m) => m < currentMonth && r.cells[m - 1] === "paid").length,
    0
  );

  let longestStreak: Report["stats"]["longestStreak"] = null;
  for (const r of orderedRows) {
    if (!longestStreak || r.longestStreak > longestStreak.months) longestStreak = { row: r, months: r.longestStreak };
  }
  let busiestMonth: Report["stats"]["busiestMonth"] = null;
  monthTotals.forEach((count, i) => {
    if (count > 0 && (!busiestMonth || count > busiestMonth.count)) busiestMonth = { month: i + 1, count };
  });

  const latest = scan.files.reduce<Report["stats"]["latest"]>(
    (best, f) => (!best || f.mtime > best.mtime ? f : best),
    null
  );

  return {
    year,
    generatedAt: opts.today,
    currentMonth,
    dir: scan.dir,
    outputName: opts.outputName,
    groups,
    rows: orderedRows,
    monthTotals,
    ignored: scan.ignored,
    configNotes,
    housekeeping: opts.housekeeping,
    stats: {
      scheduledCount: scheduled.length,
      irregularCount: orderedRows.filter((r) => r.pattern === "irregular").length,
      unscheduledCount: unscheduled.length,
      paidThisMonth,
      expectedThisMonth: paidThisMonth + dueThisMonth.length,
      dueThisMonth,
      missingCells,
      missingBills,
      coveragePaid,
      coverageExpected: coveragePaid + missingCells,
      upToDate: scheduled.filter((r) => r.missingMonths.length === 0).length,
      totalFiles: scan.files.length,
      pdfFiles: scan.files.filter((f) => f.ext === "pdf").length,
      imageFiles: scan.files.filter((f) => f.ext !== "pdf").length,
      latest,
      longestStreak,
      busiestMonth,
    },
  };
}

function firstWord(name: string): string {
  return name.split(" ")[0];
}

function longestRun(months: number[]): number {
  let best = 0;
  let run = 0;
  for (let i = 0; i < months.length; i++) {
    run = i > 0 && months[i] === months[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}
