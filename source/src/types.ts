/** A file in the year folder that matched `YYYYMM Name.ext`. */
export interface BillFile {
  file: string;
  name: string;
  month: number; // 1..12
  ext: string;
  mtime: Date;
}

/** A file that was skipped, with a human-readable reason. */
export interface IgnoredFile {
  file: string;
  reason: string;
}

export interface ScanResult {
  dir: string;
  year: number;
  files: BillFile[];
  ignored: IgnoredFile[];
}

/**
 * paid    – a file exists for that month
 * missing – the bill is recurring and this past month has no file
 * due     – the bill is recurring and the current month has no file yet
 * none    – nothing expected (one-off bill, off-cadence month, before first file)
 * future  – month hasn't started yet
 */
export type CellState = "paid" | "missing" | "due" | "none" | "future";

export type RowStatus = "ok" | "due" | "missing" | "irregular" | "unscheduled";

export interface BillRow {
  name: string;
  group: string;
  label: string; // name without the group prefix
  cells: CellState[]; // index 0 = January
  paidMonths: number[];
  /** From the config: scheduled (expected months) · irregular · unscheduled (not in config / null) */
  pattern: "scheduled" | "irregular" | "unscheduled";
  scheduleLabel: string; // e.g. "quarterly", "from Mar"; "" for plain monthly
  expectedMonths: number[];
  missingMonths: number[];
  dueNow: boolean;
  longestStreak: number;
  status: RowStatus;
}

export interface BillGroup {
  name: string;
  rows: BillRow[];
}

export interface Report {
  year: number;
  generatedAt: Date;
  /** 1..12 for the current year, 13 for a past year (all months over), 0 for a future year. */
  currentMonth: number;
  dir: string;
  outputName: string;
  groups: BillGroup[];
  rows: BillRow[];
  monthTotals: number[]; // bills with a file, per month
  ignored: IgnoredFile[];
  configNotes: IgnoredFile[]; // problems or reminders about the config files
  housekeeping: IgnoredFile[]; // clean-up done this run (renames / conversions)
  stats: {
    scheduledCount: number;
    irregularCount: number;
    unscheduledCount: number;
    paidThisMonth: number; // scheduled bills with a file this month
    expectedThisMonth: number; // scheduled bills paid + still due this month
    dueThisMonth: BillRow[];
    missingCells: number;
    missingBills: BillRow[];
    coveragePaid: number;
    coverageExpected: number;
    upToDate: number; // scheduled bills with nothing missing
    totalFiles: number;
    pdfFiles: number;
    imageFiles: number;
    latest: BillFile | null;
    longestStreak: { row: BillRow; months: number } | null;
    busiestMonth: { month: number; count: number } | null;
  };
}
