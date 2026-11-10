import * as fs from "fs/promises";
import * as path from "path";
import { analyze } from "./analyze";
import { loadOrCreateConfig } from "./config";
import { locateFolder, selfName } from "./locate";
import { renderPdf } from "./pdf";
import { configDir, isMac, openFile, showAlert } from "./platform";
import { normalizeDirectory, outputFileName, scanDirectory } from "./scan";

const TITLE = "Bills Overview";

async function main(): Promise<void> {
  const today = process.env.BILLS_TODAY ? new Date(`${process.env.BILLS_TODAY}T12:00:00`) : new Date();
  console.log(`${TITLE}\n`);
  const located = locateFolder(today);
  if ("error" in located) {
    await showAlert(TITLE, located.error, "error");
    process.exitCode = 1;
    return;
  }
  const { dir, year } = located;
  console.log(`Folder: ${dir}`);

  try {
    await fs.readdir(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const hint =
      isMac && (code === "EPERM" || code === "EACCES")
        ? "\n\nmacOS blocked access. Open System Settings → Privacy & Security → Files & Folders and allow “Bills Overview”, then run again."
        : "";
    throw new Error(`Can't open the bills folder:\n${dir}${hint}`);
  }

  const self = selfName();
  const housekeeping = await normalizeDirectory(dir, year, self);
  housekeeping.forEach((a) => console.log(`  ${a.file}: ${a.reason}`));

  const scan = await scanDirectory(dir, year, self);
  const { config, created } = loadOrCreateConfig(dir, [...new Set(scan.files.map((f) => f.name))]);
  if (created) console.log("  Created bills-overview.config.json (fill in a schedule per bill)");
  const report = analyze(scan, {
    today,
    outputName: outputFileName(year),
    housekeeping,
    config,
    configCreated: created,
  });
  const pdf = await renderPdf(report);

  const out = path.join(dir, outputFileName(year));
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
