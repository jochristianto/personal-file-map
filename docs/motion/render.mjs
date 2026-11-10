// Renders index.html with Playwright: every frame is window.seek(t), 4 subframes per frame blended by ffmpeg
// (tmix) for motion blur, at 60 fps. Output goes to out/motion/ (git-ignored).
//   node render.mjs --beats          one frame per beat (mid-beat) + a contact sheet, to check before the full render
//   node render.mjs --at 12.5        one frame at t = 12.5 s
//   node render.mjs                  the full loop: out/motion/loop-silent.mp4 (then sound.py adds the audio)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../out/motion");
fs.mkdirSync(out, { recursive: true });
const url = pathToFileURL(path.join(here, "index.html")).href + "?render";
const SIZE = 1440, FPS = 60, SUB = 4;

const shell = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell");
const browser = await chromium.launch(fs.existsSync(shell) ? { executablePath: shell } : {});
async function openPage() {
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
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

const args = process.argv.slice(2);
try {
  const page = await openPage();
  const { T, B, cues } = await page.evaluate(() => ({ T: window.T, B: window.B, cues: window.cues }));
  fs.writeFileSync(path.join(out, "cues.json"), JSON.stringify({ T, B, cues }, null, 1));

  if (args.includes("--at")) {
    const t = Number(args[args.indexOf("--at") + 1]);
    fs.writeFileSync(path.join(out, `at-${t}.png`), await shot(page, t));
    console.log(`out/motion/at-${t}.png`);
  } else if (args.includes("--beats")) {
    const dir = path.join(out, "beats");
    fs.mkdirSync(dir, { recursive: true });
    const frac = args.includes("--frac") ? Number(args[args.indexOf("--frac") + 1]) : 0.45;
    for (let b = 0; b < 64; b++) {
      const name = `b${String(Math.floor(b / 4) + 1).padStart(2, "0")}.${(b % 4) + 1}.png`;
      fs.writeFileSync(path.join(dir, name), await shot(page, (b + frac) * B));
    }
    // contact sheet: 8 × 8 beats, two bars per row
    await new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", ["-y", "-v", "error", "-pattern_type", "glob", "-i", path.join(dir, "b*.png"), "-vf", "scale=360:360,tile=8x8:padding=4:color=white", "-frames:v", "1", path.join(out, "beats.png")]);
      ff.on("exit", (c) => (c ? reject(new Error("ffmpeg " + c)) : resolve()));
    });
    console.log("out/motion/beats/*.png, out/motion/beats.png");
  } else {
    // The loop: N frames over exactly T seconds (frame N would be frame 0 again, so it isn't rendered)
    const N = Math.round(T * FPS);
    const workers = Number(process.env.WORKERS || 4);
    const chunk = Math.ceil(N / workers);
    const parts = [];
    const t0 = Date.now();
    let done = 0;
    await Promise.all(range(workers).map(async (w) => {
      const p = w === 0 ? page : await openPage();
      const from = w * chunk, to = Math.min(N, from + chunk);
      if (from >= to) return;
      const part = path.join(out, `part${w}.mkv`);
      parts[w] = part;
      // subframes at k·T/N + (j − 1.5)/(SUB·FPS): a 360° shutter centred on the frame
      const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(FPS * SUB), "-i", "-",
        "-vf", `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/(${FPS}*TB)`, "-c:v", "ffv1", "-pix_fmt", "yuv444p", part], { stdio: ["pipe", "inherit", "inherit"] });
      const exited = new Promise((resolve, reject) => ff.on("exit", (c) => (c ? reject(new Error("ffmpeg " + c)) : resolve())));
      for (let k = from; k < to; k++) {
        for (let j = 0; j < SUB; j++) {
          const buf = await shot(p, (k * T) / N + (j - (SUB - 1) / 2) / (SUB * FPS));
          if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
        }
        if (++done % 60 === 0) console.log(`${done}/${N} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      }
      ff.stdin.end();
      await exited;
    }));
    fs.writeFileSync(path.join(out, "parts.txt"), parts.filter(Boolean).map((p) => `file '${p}'`).join("\n"));
    await new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", path.join(out, "parts.txt"), "-c", "copy", path.join(out, "loop.mkv")], { stdio: "inherit" });
      ff.on("exit", (c) => (c ? reject(new Error("ffmpeg " + c)) : resolve()));
    });
    for (const p of parts.filter(Boolean)) fs.rmSync(p);
    console.log(`out/motion/loop.mkv (${N} frames, lossless) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
} finally {
  await browser.close();
}
function range(n) { return Array.from({ length: n }, (_, i) => i); }
