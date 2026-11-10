import { appFolder, isTranslocated, TRANSLOCATED_MESSAGE } from "./locate";
import { hideOwnConsoleWindow, showAlert, writeLog } from "./platform";
import { runSettingsWindow } from "./window";

const TITLE = "Personal File Map";

/**
 * Double-click → the settings window opens with config.local.json's settings (or the defaults, plus every
 * bill found in the folder). The config and the PDF are only written when the user clicks Generate.
 * The app quits when the window is closed.
 */
async function main(): Promise<void> {
  console.log(`${TITLE}\n`);
  // config.local.json sits next to the app; its "folder" says where the bills are ("./" = right here).
  const appDir = process.env.BILLS_DIR || appFolder(); // BILLS_DIR: testing override for the app's folder
  if (isTranslocated(appDir)) throw new Error(TRANSLOCATED_MESSAGE);
  if ((process as { pkg?: unknown }).pkg) hideOwnConsoleWindow(); // Windows only; the window is the UI now

  await runSettingsWindow({
    appDir,
    title: TITLE,
    today: () => (process.env.BILLS_TODAY ? new Date(`${process.env.BILLS_TODAY}T12:00:00`) : new Date()),
    noWindow: Boolean(process.env.BILLS_NO_WINDOW),
    noOpen: Boolean(process.env.BILLS_NO_OPEN),
  });
}

main().catch(async (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  await writeLog(`ERROR ${new Date().toISOString()}\n${err instanceof Error ? err.stack : message}\n`);
  await showAlert(TITLE, message, "error");
  process.exitCode = 1;
});
