import { execFile, spawn } from "child_process";
import { existsSync } from "fs";
import * as fsp from "fs/promises";
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
  if (isMac) return path.join(home, "Library", "Application Support", "Personal File Map");
  if (isWin) return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "Personal File Map");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "personal-file-map");
}

/**
 * Opens `url` as a standalone app window: Edge or Chrome in --app mode (no tabs, no address bar) with
 * a profile of its own, so it doesn't touch the user's browser session. Falls back to the default
 * browser when neither is installed. Returns how it was opened.
 */
export function openAppWindow(url: string): "app" | "browser" {
  const browser = findChromium();
  if (browser) {
    const profile = path.join(configDir(), "window-profile");
    const args = [
      `--app=${url}`,
      `--user-data-dir=${profile}`,
      "--window-size=1320,880",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=Translate",
    ];
    try {
      const child = spawn(browser, args, { detached: true, stdio: "ignore" });
      child.on("error", () => openFile(url));
      child.unref();
      return "app";
    } catch {
      /* fall through to the default browser */
    }
  }
  if (isWin) spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  else openFile(url);
  return "browser";
}

function findChromium(): string | null {
  const home = os.homedir();
  const candidates: string[] = [];
  if (isWin) {
    const roots = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean) as string[];
    for (const root of roots) {
      candidates.push(path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"));
      candidates.push(path.join(root, "Google", "Chrome", "Application", "chrome.exe"));
    }
  } else if (isMac) {
    const apps: [string, string][] = [
      ["Google Chrome", "Google Chrome"],
      ["Microsoft Edge", "Microsoft Edge"],
      ["Brave Browser", "Brave Browser"],
      ["Chromium", "Chromium"],
    ];
    for (const dir of ["/Applications", path.join(home, "Applications")]) {
      for (const [app, bin] of apps) candidates.push(path.join(dir, `${app}.app`, "Contents", "MacOS", bin));
    }
  } else {
    for (const bin of ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"]) {
      candidates.push(path.join("/usr/bin", bin));
    }
  }
  return candidates.find((c) => existsSync(c)) ?? null;
}

/** Native "choose folder" dialog. Returns the absolute path, or null if cancelled. */
export async function chooseFolder(prompt: string, start: string): Promise<string | null> {
  if (isMac) {
    const { code, stdout } = await run("osascript", [
      "-e", "on run argv",
      "-e", "activate",
      "-e", "try",
      "-e", "set startAt to ((item 2 of argv) as POSIX file) as alias",
      "-e", "return POSIX path of (choose folder with prompt (item 1 of argv) default location startAt)",
      "-e", "on error number n",
      "-e", "if n is -128 then return \"\"",
      "-e", "return POSIX path of (choose folder with prompt (item 1 of argv))",
      "-e", "end try",
      "-e", "end run",
      prompt,
      start,
    ]);
    const picked = stdout.trim();
    return code === 0 && picked ? picked : null;
  }
  if (isWin) {
    const { stdout } = await powershell(
      "Add-Type -AssemblyName System.Windows.Forms; " +
        "$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }; " +
        "$d = New-Object System.Windows.Forms.FolderBrowserDialog; " +
        "$d.Description = $env:BO_PROMPT; $d.SelectedPath = $env:BO_START; $d.ShowNewFolderButton = $false; " +
        "if ($d.ShowDialog($owner) -eq 'OK') { [Console]::OutputEncoding = [Text.Encoding]::UTF8; $d.SelectedPath }",
      { BO_PROMPT: prompt, BO_START: start }
    );
    return stdout.trim() || null;
  }
  return null;
}

/** Shows `file` selected in Finder / Explorer. */
export function revealFile(file: string): void {
  if (isMac) spawn("open", ["-R", file], { detached: true, stdio: "ignore" }).unref();
  else if (isWin) spawn("explorer.exe", [`/select,${file}`], { detached: true, stdio: "ignore" }).unref();
  else openFile(path.dirname(file));
}

/** Result of the last run (or the error), in last-run.log in the app's settings folder. */
export async function writeLog(text: string): Promise<void> {
  try {
    await fsp.mkdir(configDir(), { recursive: true });
    await fsp.writeFile(path.join(configDir(), "last-run.log"), text);
  } catch {
    /* ignore */
  }
}

/**
 * Windows: the .exe is a console app, so a double-click opens a console window that would stay up as long
 * as the settings window does. Hide it, but only when it was opened for us: when the console is shared
 * with a shell the app was started from (more than this app + the helper attached), it's left alone.
 */
export function hideOwnConsoleWindow(): void {
  if (!isWin) return;
  const script =
    "Add-Type -Name W -Namespace BO -MemberDefinition '" +
    '[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow(); ' +
    '[DllImport("kernel32.dll")] public static extern uint GetConsoleProcessList(uint[] list, uint count); ' +
    '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);' +
    "'; " +
    "if ([BO.W]::GetConsoleProcessList((New-Object uint32[] 16), 16) -le 2) { [void][BO.W]::ShowWindow([BO.W]::GetConsoleWindow(), 0) }";
  try {
    // Not windowsHide: the helper has to share this app's console to find its window.
    spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { stdio: "ignore" }).on("error", () => {});
  } catch {
    /* cosmetic only */
  }
}

/** macOS: opens System Settings → Privacy & Security → Files & Folders. Returns false elsewhere. */
export function openPrivacySettings(): boolean {
  if (!isMac) return false;
  spawn("open", ["x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders"], {
    detached: true,
    stdio: "ignore",
  }).unref();
  return true;
}
