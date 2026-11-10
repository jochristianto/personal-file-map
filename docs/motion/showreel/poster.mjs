// The README's poster for the reel: the last frame with a play pill → docs/reel-poster.jpg (1280 wide).
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const png = path.resolve(here, "../../../out/showreel/poster-play.png");
const jpg = path.resolve(here, "../../reel-poster.jpg");
fs.mkdirSync(path.dirname(png), { recursive: true });
const shell = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell");
const browser = await chromium.launch({ ...(fs.existsSync(shell) ? { executablePath: shell } : {}), args: ["--allow-file-access-from-files"] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(path.join(here, "index.html")).href + "?render");
  await page.evaluate(() => window.ready);
  await page.evaluate(() => {
    window.seek(14.95);
    const d = document.createElement("div");
    d.style.cssText = "position:absolute;left:960px;top:700px;transform:translateX(-50%);display:flex;align-items:center;gap:18px;padding:16px 34px 16px 18px;border-radius:999px;background:#fafafa;color:#09090b;font:600 26px/1 Inter;box-shadow:0 20px 60px -10px rgba(22,163,74,.45)";
    d.innerHTML = '<span style="width:52px;height:52px;border-radius:50%;background:#16a34a;display:grid;place-items:center"><svg width="22" height="24" viewBox="0 0 22 24"><path d="M3 2.5v19l17-9.5z" fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg></span>Watch the reel <span style="color:#71717a;font-weight:500">· 0:15 · sound on</span>';
    document.getElementById("frame").appendChild(d);
  });
  await page.screenshot({ path: png });
} finally {
  await browser.close();
}
execFileSync("ffmpeg", ["-y", "-v", "error", "-i", png, "-vf", "scale=1280:-1:flags=lanczos", "-q:v", "3", jpg]);
console.log("docs/reel-poster.jpg");
