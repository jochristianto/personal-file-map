import { execFile, spawn } from "child_process";
import * as os from "os";
import * as path from "path";

export const isMac = process.platform === "darwin";
export const isWin = process.platform === "win32";

function run(cmd: string, args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { env: { ...process.env, ...env }, windowsHide: true }, (err, stdout) => {
      const code = err ? (typeof (err as NodeJS.ErrnoException).code === "number" ? Number((err as any).code) : 1) : 0;
      resolve({ code, stdout: String(stdout ?? "") });
    });
  });
}

// Text goes in through argv/env, never spliced into the script, so names with quotes are safe.
const powershell = (script: string, env: Record<string, string>) =>
  run("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script], env);

export async function showAlert(title: string, message: string, kind: "info" | "error" = "info"): Promise<void> {
  console[kind === "error" ? "error" : "log"](`\n${title}\n${message}\n`);
  if (isMac) {
    await run("osascript", [
      "-e", "on run argv",
      "-e", "activate",
      "-e", `display alert (item 1 of argv) message (item 2 of argv)${kind === "error" ? " as critical" : ""}`,
      "-e", "end run",
      title,
      message,
    ]);
  } else if (isWin) {
    await powershell(
      "Add-Type -AssemblyName PresentationFramework; " +
        `[void][System.Windows.MessageBox]::Show($env:BO_MSG, $env:BO_TITLE, 'OK', '${kind === "error" ? "Error" : "Information"}')`,
      { BO_MSG: message, BO_TITLE: title }
    );
  }
}

export function openFile(file: string): void {
  const opener = isMac ? "open" : isWin ? "explorer.exe" : "xdg-open";
  spawn(opener, [file], { detached: true, stdio: "ignore" }).unref();
}

export function configDir(): string {
  const home = os.homedir();
  if (isMac) return path.join(home, "Library", "Application Support", "Bills Overview");
  if (isWin) return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Bills Overview");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "bills-overview");
}
