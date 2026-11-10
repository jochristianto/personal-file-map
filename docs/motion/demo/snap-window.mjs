// Screenshots of the real settings window on the demo folder (run make-demo.mjs first), to check the motion
// components against: out/motion-demo/window/*.png at 1280×1040, the window size the video draws.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { API_KEY } from "./data.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const demo = path.join(root, "out", "motion-demo", "2026");
const shots = path.join(root, "out", "motion-demo", "window");
fs.mkdirSync(shots, { recursive: true });

const mock = spawn("node", [path.join(here, "mock-reader.mjs"), "4312"], { stdio: "ignore" });
const app = spawn("pnpm", ["-s", "dev"], {
  cwd: root,
  env: { ...process.env, BILLS_DIR: demo, BILLS_TODAY: "2026-11-10", BILLS_NO_WINDOW: "1", BILLS_NO_OPEN: "1", ANTHROPIC_API_KEY: API_KEY, BILLS_ANTHROPIC_BASE_URL: "http://127.0.0.1:4312" },
  stdio: ["ignore", "pipe", "inherit"],
});
const base = await new Promise((resolve) => {
  let buf = "";
  app.stdout.on("data", (d) => {
    buf += d;
    const m = /http:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]+\//.exec(buf);
    if (m) resolve(m[0]);
  });
});

const shell = path.join(process.env.HOME, "Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell");
const browser = await chromium.launch(fs.existsSync(shell) ? { executablePath: shell } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 1040 }, deviceScaleFactor: 1, locale: "en-GB", timezoneId: "Asia/Jakarta" });
const snap = async (name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(shots, `${name}.png`) });
  console.log(name);
};
try {
  await page.goto(base);
  await page.waitForFunction(() => !document.body.classList.contains("is-loading"));
  await snap("main");
  await page.click("#openBills");
  await snap("bills");
  await page.evaluate(() => document.querySelector("#rows .row:nth-child(10)")?.scrollIntoView({ block: "center" }));
  await snap("bills-scrolled");
  await page.click("#openSchedules");
  await snap("schedules");
  await page.click("#closeSchedules");
  await page.click("#closeBills");
  await page.click("#openSettings");
  await snap("sheet");
  await page.evaluate(() => document.querySelector("#metersCard")?.scrollIntoView());
  await snap("sheet-meters");
  await page.click("#closeSettings");
  await page.evaluate(() => document.querySelector("#readingsCard")?.scrollIntoView());
  await snap("readings");
  await page.click("table.readings button.file-link >> nth=6");
  await snap("photo");
} finally {
  await browser.close();
  await fetch(base + "api/quit", { method: "POST" }).catch(() => {});
  app.kill();
  mock.kill();
}
