import * as fs from "fs/promises";
import * as path from "path";
import { analyze } from "./analyze";
import {
  addBillsToLocalConfig,
  DEFAULT_FOLDER,
  LOCAL_CONFIG_NAME,
  loadDefaults,
  loadLocal,
  matchKey,
  mergeConfigs,
  resolveFolder,
} from "./config";
import { detectYear, selfName } from "./locate";
import { LOGS_FOLDER } from "./ailog";
import { DEFAULT_METERS, electricity } from "./meters";
import { renderPdf } from "./pdf";
import { isMac } from "./platform";
import { normalizeDirectory, OUTPUT_NAME, scanDirectory } from "./scan";

export interface GenerateResult {
  /** The PDF written. */
  out: string;
  bills: number;
  files: number;
  due: number;
  missing: number;
  /** Bills config.local.json gained this run because no key covered them. */
  added: number;
  /** Meter photos read this run, and problems reading them. */
  meterRead: number;
  meterProblem: string | null;
}

/**
 * One report from the saved config.local.json in `appDir`: tidy the bills folder, scan it, add bills no
 * key covers yet as "monthly", analyze, render, write personal-file-map.output.pdf into the bills folder.
 * `created`: config.local.json was created by this run (the report mentions it).
 */
export async function generate(appDir: string, today: Date, created: boolean): Promise<GenerateResult> {
  const defaults = loadDefaults();
  const local = loadLocal(appDir);
  let config = mergeConfigs(defaults, local);
  const folderSetting = local?.folder ?? defaults.folder ?? DEFAULT_FOLDER;
  const dir = resolveFolder(appDir, folderSetting);
  await checkFolder(dir, folderSetting);
  console.log(`Folder: ${dir}`);

  const year = detectYear(dir, today);
  const self = selfName();
  const housekeeping = await normalizeDirectory(dir, year, self);
  housekeeping.forEach((a) => console.log(`  ${a.file}: ${a.reason}`));

  const scan = await scanDirectory(dir, year, self);

  // Every bill found that no config key covers yet goes into config.local.json as "monthly"
  // (e.g. files added since the settings window scanned the folder). Existing entries are left alone.
  const keys = Object.keys(config.bills);
  const newBills = [...new Set(scan.files.map((f) => f.name))].filter((n) => matchKey(n, keys) === null);
  if (newBills.length > 0) {
    const written = addBillsToLocalConfig(appDir, newBills);
    config = mergeConfigs(defaults, written);
    console.log(`  Updated ${LOCAL_CONFIG_NAME}: ${newBills.length} bill(s) added as monthly`);
  }
  const report = analyze(scan, {
    today,
    outputName: OUTPUT_NAME,
    housekeeping,
    config,
    configCreated: created,
    configAdded: newBills.length,
  });

  // Electricity meters: read new meter photos (if a reader is set up), then work out the usage
  const meters = local?.meters ?? defaults.meters ?? DEFAULT_METERS;
  if (meters.bills.length > 0) {
    report.electricity = await electricity(dir, year, scan.files, meters, {
      read: true,
      logDir: path.join(appDir, LOGS_FOLDER),
      onProgress: (done, total) => console.log(`  Meter photos read: ${done}/${total}`),
    });
    const r = report.electricity.read;
    if (r) console.log(`  Meter photos: ${r.read} read, ${r.failed.length} failed${r.stopped ? ` (stopped: ${r.stopped})` : ""}; logs in ${LOGS_FOLDER}/`);
  }
  const pdf = await renderPdf(report);

  const out = path.join(dir, OUTPUT_NAME);
  try {
    await fs.writeFile(out, pdf);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EBUSY" || code === "EPERM") {
      throw new Error(`“${path.basename(out)}” is open in another app. Close it and try again.`);
    }
    throw err;
  }

  const s = report.stats;
  console.log(
    `\n${report.rows.length} bills · ${s.totalFiles} files · ${s.dueThisMonth.length} due this month · ${s.missingCells} missing\n` +
      `Saved: ${out}`
  );
  return {
    out,
    bills: report.rows.length,
    files: s.totalFiles,
    due: s.dueThisMonth.length,
    missing: s.missingCells,
    added: newBills.length,
    meterRead: report.electricity?.read?.read ?? 0,
    meterProblem: meterProblem(report),
  };
}

/** The bills folder is missing or can't be read. `blocked`: macOS privacy settings denied access. */
export class FolderError extends Error {
  constructor(message: string, readonly blocked = false) {
    super(message);
  }
}

/** Throws a readable FolderError if the bills folder is missing or blocked. */
export async function checkFolder(dir: string, setting: string | undefined) {
  try {
    await fs.readdir(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const where = setting && setting !== DEFAULT_FOLDER ? `\n\n(folder setting: "${setting}")` : "";
    if (code === "ENOENT" || code === "ENOTDIR") throw new FolderError(`The bills folder doesn't exist:\n${dir}${where}`);
    const blocked = isMac && (code === "EPERM" || code === "EACCES");
    const hint = blocked
      ? "\n\nmacOS blocked access. Open System Settings → Privacy & Security → Files & Folders and allow “Personal File Map”, then try again."
      : "";
    throw new FolderError(`Can't open the bills folder:\n${dir}${where}${hint}`, blocked);
  }
}

/** One line for the window about meter photos that couldn't be read this run, or null. */
function meterProblem(report: { electricity: import("./meters").Electricity | null }): string | null {
  const e = report.electricity;
  if (!e) return null;
  if (e.read?.stopped) return e.read.stopped;
  if (e.read && e.read.failed.length > 0) return `${e.read.failed.length} meter photo${e.read.failed.length === 1 ? "" : "s"} couldn't be read: ${e.read.failed[0].error}`;
  if (e.blocked) return e.blocked;
  return null;
}
