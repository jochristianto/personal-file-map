// Renders index.html with Playwright: every frame is window.seek(t); SUB subframes per frame are blended by ffmpeg
// (tmix, a 360° shutter centred on the frame) for motion blur. Output goes to out/showreel/ (git-ignored).
//   node render.mjs --sheet         one frame per beat (mid-beat) + a contact sheet, to check before the full render
//   node render.mjs --at 12.5       one frame at t = 12.5 s
//   node render.mjs                 the reel: out/showreel/reel.mkv (lossless; finish.sh adds the sound)
//   node render.mjs --gif           the README's cut: 15 fps, a 180° shutter, no grain or vignette → out/showreel/reel-gif.mkv
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../../out/showreel");
fs.mkdirSync(out, { recursive: true });
const GIF = process.argv.includes("--gif");
const url = pathToFileURL(path.join(here, "index.html")).href + "?render" + (GIF ? "&gif" : "");
const W = 1920, H = 1080, FPS = GIF ? 15 : 60, SUB = Number(process.env.SUB || 4), SHUTTER = GIF ? 0.5 : 1;

const shell = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell");
// file:// fonts (SF Mono) and the report pages under out/ need file access across folders
const browser = await chromium.launch({ ...(fs.existsSync(shell) ? { executablePath: shell } : {}), args: ["--allow-file-access-from-files"] });
async function openPage() {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text()); });
  await page.goto(url);
  await page.evaluate(() => window.ready);
  return page;
}
const shot = async (page, t) => {
  await page.evaluate((tt) => window.seek(tt), t);
  return page.screenshot({ type: "png" });
};
const run = (args) => new Promise((resolve, reject) => {
  const ff = spawn("ffmpeg", args, { stdio: "inherit" });
  ff.on("exit", (c) => (c ? reject(new Error("ffmpeg " + c)) : resolve()));
});

const args = process.argv.slice(2);
try {
  const page = await openPage();
  const { T, B } = await page.evaluate(() => ({ T: window.T, B: window.B }));
  if (!T) throw new Error("the page did not load (see the page error above)");

  if (args.includes("--at")) {
    for (const v of args.slice(args.indexOf("--at") + 1).filter((a) => !a.startsWith("--"))) {
      const t = Number(v);
      fs.writeFileSync(path.join(out, `at-${t}.png`), await shot(page, t));
      console.log(`out/showreel/at-${t}.png`);
    }
  } else if (args.includes("--sheet")) {
    const dir = path.join(out, "sheet");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const frac = args.includes("--frac") ? Number(args[args.indexOf("--frac") + 1]) : 0.5;
    const n = Math.floor(T / B);
    for (let k = 0; k < n; k++) fs.writeFileSync(path.join(dir, `b${String(k).padStart(2, "0")}.png`), await shot(page, (k + frac) * B));
    await run(["-y", "-v", "error", "-pattern_type", "glob", "-i", path.join(dir, "b*.png"), "-vf", "scale=480:270,tile=6x6:padding=4:color=white", "-frames:v", "1", path.join(out, "sheet.png")]);
    console.log("out/showreel/sheet/*.png, out/showreel/sheet.png");
  } else {
    const N = Math.round(T * FPS);
    const workers = Number(process.env.WORKERS || 5);
    const chunk = Math.ceil(N / workers);
    const parts = [];
    const t0 = Date.now();
    let done = 0;
    await Promise.all(Array.from({ length: workers }, async (_, w) => {
      const p = w === 0 ? page : await openPage();
      const from = w * chunk, to = Math.min(N, from + chunk);
      if (from >= to) return;
      const part = path.join(out, `part${w}.mkv`);
      parts[w] = part;
      const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS * SUB), "-i", "-",
        "-vf", `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/(${FPS}*TB)`, "-c:v", "ffv1", "-pix_fmt", "yuv444p", part], { stdio: ["pipe", "inherit", "inherit"] });
      const exited = new Promise((resolve, reject) => ff.on("exit", (c) => (c ? reject(new Error("ffmpeg " + c)) : resolve())));
      for (let k = from; k < to; k++) {
        for (let j = 0; j < SUB; j++) {
          const t = Math.max(0, Math.min(T - 1e-4, k / FPS + ((j - (SUB - 1) / 2) / (SUB * FPS)) * SHUTTER));
          const buf = await shot(p, t);
          if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
        }
        if (++done % 60 === 0) console.log(`${done}/${N} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      }
      ff.stdin.end();
      await exited;
    }));
    fs.writeFileSync(path.join(out, "parts.txt"), parts.filter(Boolean).map((p) => `file '${p}'`).join("\n"));
    await run(["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", path.join(out, "parts.txt"), "-c", "copy", path.join(out, GIF ? "reel-gif.mkv" : "reel.mkv")]);
    for (const p of parts.filter(Boolean)) fs.rmSync(p);
    console.log(`out/showreel/${GIF ? "reel-gif" : "reel"}.mkv (${N} frames, lossless) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
} finally {
  await browser.close();
}
