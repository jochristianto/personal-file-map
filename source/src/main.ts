import * as fs from "fs/promises";
import * as path from "path";
import { analyze } from "./analyze";
import { DEFAULT_FOLDER, LOCAL_CONFIG_NAME, loadConfigs, mergeConfigs, NEW_LOCAL_FOLDER, resolveFolder, writeLocalConfig } from "./config";
import { appFolder, detectYear, isTranslocated, selfName, TRANSLOCATED_MESSAGE } from "./locate";
import { renderPdf } from "./pdf";
import { configDir, isMac, openFile, showAlert } from "./platform";
import { normalizeDirectory, OUTPUT_NAME, scanDirectory } from "./scan";

const TITLE = "Bills Overview";

async function main(): Promise<void> {
  const today = process.env.BILLS_TODAY ? new Date(`${process.env.BILLS_TODAY}T12:00:00`) : new Date();
  console.log(`${TITLE}\n`);

  // Configs sit next to the app; "folder" says where the bills are (default: right here).
  const appDir = process.env.BILLS_DIR || appFolder(); // BILLS_DIR: testing override for the app's folder
  if (isTranslocated(appDir)) throw new Error(TRANSLOCATED_MESSAGE);
  const { defaults, local } = loadConfigs(appDir);
  // First run: config.local.json will be created with "folder": "./", so scan that folder now too
  // (its bill list then matches the folder it points at).
  const created = local === null;
  let config = mergeConfigs(defaults, created ? { folder: NEW_LOCAL_FOLDER } : local);
  const folderSetting = config.folder;
  const dir = resolveFolder(appDir, folderSetting);
  console.log(`Folder: ${dir}`);

  try {
    await fs.readdir(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const where = folderSetting === DEFAULT_FOLDER ? "" : `\n\n("folder": "${folderSetting}" in the config)`;
    if (code === "ENOENT" || code === "ENOTDIR") throw new Error(`The bills folder doesn't exist:\n${dir}${where}`);
    const hint =
      isMac && (code === "EPERM" || code === "EACCES")
        ? "\n\nmacOS blocked access. Open System Settings → Privacy & Security → Files & Folders and allow “Bills Overview”, then run again."
        : "";
    throw new Error(`Can't open the bills folder:\n${dir}${where}${hint}`);
  }

  const year = detectYear(dir, today);
  const self = selfName();
  const housekeeping = await normalizeDirectory(dir, year, self);
  housekeeping.forEach((a) => console.log(`  ${a.file}: ${a.reason}`));

  const scan = await scanDirectory(dir, year, self);
  if (created) {
    const written = writeLocalConfig(appDir, folderSetting, [...new Set(scan.files.map((f) => f.name))]);
    config = mergeConfigs(defaults, written);
    console.log(`  Created ${LOCAL_CONFIG_NAME} (every bill set to monthly)`);
  }
  const report = analyze(scan, {
    today,
    outputName: OUTPUT_NAME,
    housekeeping,
    config,
    configCreated: created,
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
