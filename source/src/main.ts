import * as fs from "fs/promises";
import * as path from "path";
import { analyze } from "./analyze";
import {
  addBillsToLocalConfig,
  DEFAULT_CONFIG_NAME,
  DEFAULT_FOLDER,
  LOCAL_CONFIG_NAME,
  loadDefaults,
  loadLocal,
  matchKey,
  mergeConfigs,
  resolveFolder,
} from "./config";
import { appFolder, detectYear, isTranslocated, selfName, TRANSLOCATED_MESSAGE } from "./locate";
import { renderPdf } from "./pdf";
import { configDir, isMac, openFile, showAlert } from "./platform";
import { normalizeDirectory, OUTPUT_NAME, scanDirectory } from "./scan";

const TITLE = "Bills Overview";

async function main(): Promise<void> {
  const today = process.env.BILLS_TODAY ? new Date(`${process.env.BILLS_TODAY}T12:00:00`) : new Date();
  console.log(`${TITLE}\n`);

  // config.default.json (next to the app) → bills folder → config.local.json inside it.
  const appDir = process.env.BILLS_DIR || appFolder(); // BILLS_DIR: testing override for the app's folder
  if (isTranslocated(appDir)) throw new Error(TRANSLOCATED_MESSAGE);
  const defaults = loadDefaults(appDir);
  const localDir = resolveFolder(appDir, defaults.folder ?? DEFAULT_FOLDER);
  await checkFolder(localDir, defaults.folder, DEFAULT_CONFIG_NAME);

  // config.local.json may point somewhere else with its own "folder" (relative to itself); new ones use "./".
  const local = loadLocal(localDir);
  const created = local === null;
  let config = mergeConfigs(defaults, local);
  const dir = resolveFolder(localDir, local?.folder ?? DEFAULT_FOLDER);
  if (dir !== localDir) await checkFolder(dir, local?.folder, LOCAL_CONFIG_NAME);
  console.log(`Folder: ${dir}`);

  const year = detectYear(dir, today);
  const self = selfName();
  const housekeeping = await normalizeDirectory(dir, year, self);
  housekeeping.forEach((a) => console.log(`  ${a.file}: ${a.reason}`));

  const scan = await scanDirectory(dir, year, self);

  // Every bill found that no config key covers yet goes into config.local.json as "monthly"
  // (creating the file on first run). Existing entries are left alone.
  const keys = Object.keys(config.bills);
  const newBills = [...new Set(scan.files.map((f) => f.name))].filter((n) => matchKey(n, keys) === null);
  if (created || newBills.length > 0) {
    const written = addBillsToLocalConfig(localDir, newBills, DEFAULT_FOLDER);
    config = mergeConfigs(defaults, written);
    console.log(`  ${created ? "Created" : "Updated"} ${LOCAL_CONFIG_NAME}: ${newBills.length} bill(s) added as monthly`);
  }
  const report = analyze(scan, {
    today,
    outputName: OUTPUT_NAME,
    housekeeping,
    config,
    configCreated: created,
    configAdded: created ? 0 : newBills.length,
  });
  const pdf = await renderPdf(report);

  const out = path.join(dir, OUTPUT_NAME);
  try {
    await fs.writeFile(out, pdf);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EBUSY" || code === "EPERM") {
      throw new Error(`“${path.basename(out)}” is open in another app. Close it and run again.`);
    }
    throw err;
  }

  const s = report.stats;
  console.log(
    `\n${report.rows.length} bills · ${s.totalFiles} files · ${s.dueThisMonth.length} due this month · ${s.missingCells} missing\n` +
      `Saved: ${out}`
  );
  await writeLog(`OK ${new Date().toISOString()}\n${out}\n`);
  if (!process.env.BILLS_NO_OPEN) openFile(out);
}

/** Throws a readable error if a configured folder is missing or blocked. */
async function checkFolder(dir: string, setting: string | undefined, file: string) {
  try {
    await fs.readdir(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const where = setting && setting !== DEFAULT_FOLDER ? `\n\n("folder": "${setting}" in ${file})` : "";
    if (code === "ENOENT" || code === "ENOTDIR") throw new Error(`The bills folder doesn't exist:\n${dir}${where}`);
    const hint =
      isMac && (code === "EPERM" || code === "EACCES")
        ? "\n\nmacOS blocked access. Open System Settings → Privacy & Security → Files & Folders and allow “Bills Overview”, then run again."
        : "";
    throw new Error(`Can't open the bills folder:\n${dir}${where}${hint}`);
  }
}

async function writeLog(text: string) {
  try {
    await fs.mkdir(configDir(), { recursive: true });
    await fs.writeFile(path.join(configDir(), "last-run.log"), text);
  } catch {
    /* ignore */
  }
}

main().catch(async (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  await writeLog(`ERROR ${new Date().toISOString()}\n${err instanceof Error ? err.stack : message}\n`);
  await showAlert(TITLE, message, "error");
  process.exitCode = 1;
});
