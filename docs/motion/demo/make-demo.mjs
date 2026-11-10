// Builds the demo folder and runs the real app on it, so every figure in the video is one the app computed.
//   node docs/motion/demo/make-demo.mjs
//
// 1. `pnpm samples 2026 11` into out/, copied to out/motion-demo/2026/ without the samples' "Meter 01 Photo …"
//    files, plus the Home Meter photos and payment screenshots from data.mjs (photos with EXIF capture times).
// 2. Starts the mock reader and the app (BILLS_TODAY=2026-11-10, no window), then does what the window does:
//    Read new photos, correct the misread photo and ignore the glare one, Generate report.
// 3. Writes docs/motion/demo/facts.json (what the window and the report show) and out/motion-demo/pages/*.png
//    (the report's pages, for checking the motion pages against).
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import { PHOTOS, PAYMENTS, BILLS, METERS, API_KEY } from "./data.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const out = path.join(root, "out");
const demo = path.join(out, "motion-demo", "2026");
const pagesDir = path.join(out, "motion-demo", "pages");
const MOCK_PORT = 4311;

// ── 1. The folder ───────────────────────────────────────────────────────────
execFileSync("node", ["scripts/make-samples.mjs", "2026", "11"], { cwd: root, stdio: "inherit" });
fs.rmSync(path.join(out, "motion-demo"), { recursive: true, force: true });
fs.mkdirSync(demo, { recursive: true });
fs.mkdirSync(pagesDir, { recursive: true });
for (const f of fs.readdirSync(out)) {
  if (!/^\d{6} /.test(f) && f !== "notes.txt") continue;
  if (/ Meter 0\d Photo /.test(f)) continue; // replaced by the Home Meter below
  const from = path.join(out, f);
  const to = path.join(demo, f);
  fs.copyFileSync(from, to);
  const st = fs.statSync(from);
  fs.utimesSync(to, st.atime, st.mtime);
}

function image(w, h, seed, draw) {
  const data = Buffer.alloc(w * h * 4);
  const rect = (x, y, rw, rh, [r, g, b]) => {
    for (let j = Math.max(0, y); j < Math.min(h, y + rh); j++)
      for (let i = Math.max(0, x); i < Math.min(w, x + rw); i++) data.set([r, g, b, 255], (j * w + i) * 4);
  };
  draw(rect);
  // A few pixels from the seed, so no two files share a SHA-1 (readings are kept per photo content)
  for (let k = 0; k < 24; k++) rect((seed * 31 + k * 7) % w, h - 2, 1, 1, [seed % 255, (seed * 7) % 255, k * 9]);
  return Buffer.from(jpeg.encode({ data, width: w, height: h }, 85).data);
}

/** The same minimal EXIF block the app writes for converted HEIC photos (src/photo.ts withCaptureDate). */
function withCaptureDate(jpg, date) {
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}:${p(date.getMonth() + 1)}:${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}\0`;
  const tiff = Buffer.alloc(8 + 18 + 18 + 20);
  tiff.write("MM", 0, "ascii");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x8769, 10);
  tiff.writeUInt16BE(4, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt32BE(26, 18);
  tiff.writeUInt32BE(0, 22);
  tiff.writeUInt16BE(1, 26);
  tiff.writeUInt16BE(0x9003, 28);
  tiff.writeUInt16BE(2, 30);
  tiff.writeUInt32BE(20, 32);
  tiff.writeUInt32BE(44, 36);
  tiff.writeUInt32BE(0, 40);
  tiff.write(stamp, 44, "ascii");
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpg.subarray(0, 2), header, payload, jpg.subarray(2)]);
}

const meterPhoto = (seed) => image(320, 240, seed, (rect) => {
  rect(0, 0, 320, 240, [63, 63, 70]);
  rect(40, 50, 240, 110, [24, 24, 27]);
  rect(56, 70, 208, 70, [190, 205, 170]); // the LCD
  rect(130, 180, 60, 30, [212, 212, 216]);
});
const paymentShot = (seed) => image(270, 480, seed, (rect) => {
  rect(0, 0, 270, 480, [250, 250, 250]);
  rect(0, 0, 270, 70, [37, 99, 235]);
  rect(75, 210, 120, 16, [39, 39, 42]);
  for (let i = 0; i < 5; i++) rect(24, 260 + i * 34, 222, 9, [212, 212, 216]);
});

// Photos sent through a chat app: no EXIF, and saved on 2 Nov (so the file date isn't in their month either)
const saved = new Date("2026-11-02T08:30:00");
PHOTOS.forEach((ph, i) => {
  const file = path.join(demo, ph.file);
  fs.writeFileSync(file, ph.at ? withCaptureDate(meterPhoto(i + 1), ph.at) : meterPhoto(i + 1));
  const mtime = ph.at ?? saved;
  fs.utimesSync(file, mtime, mtime);
});
PAYMENTS.forEach((pm, i) => {
  const file = path.join(demo, pm.file);
  fs.writeFileSync(file, paymentShot(100 + i));
  const when = new Date(pm.reads.paid_at);
  fs.utimesSync(file, when, when);
});

// ── 2. The app ──────────────────────────────────────────────────────────────
const mock = spawn("node", [path.join(here, "mock-reader.mjs"), String(MOCK_PORT)], { stdio: ["ignore", "pipe", "inherit"] });
mock.stdout.on("data", (d) => process.stdout.write(`  [mock] ${d}`));
const app = spawn("pnpm", ["-s", "dev"], {
  cwd: root,
  env: {
    ...process.env,
    BILLS_DIR: demo,
    BILLS_TODAY: "2026-11-10",
    BILLS_NO_WINDOW: "1",
    BILLS_NO_OPEN: "1",
    ANTHROPIC_API_KEY: API_KEY,
    BILLS_ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
  },
  stdio: ["ignore", "pipe", "inherit"],
});
const base = await new Promise((resolve, reject) => {
  let buf = "";
  app.stdout.on("data", (d) => {
    buf += d;
    const m = /http:\/\/127\.0\.0\.1:\d+\/[A-Za-z0-9_-]+\//.exec(buf);
    if (m) resolve(m[0]);
  });
  app.on("exit", (code) => reject(new Error(`the app exited (${code}) before showing its address:\n${buf}`)));
});

const api = async (p, body) => {
  const res = await fetch(base + "api/" + p, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json();
  if (j.ok === false) throw new Error(`${p}: ${j.error}`);
  return j;
};

try {
  const state = await api("state");
  const preview = await api("preview");
  const settings = { folder: "./", meters: METERS };
  const beforeRead = await api("meters", settings);
  const afterRead = await api("meters/read", settings);
  let afterEdit = afterRead;
  for (const ph of PHOTOS.filter((p) => p.fix)) afterEdit = await api("meters/edit", { ...settings, file: ph.file, ...ph.fix });
  const generated = await api("generate", { ...settings, bills: BILLS });
  const previewAfter = await api("preview");

  fs.writeFileSync(
    path.join(here, "facts.json"),
    JSON.stringify({ today: "2026-11-10", state: { ...state, appDir: "2026" }, preview, previewAfter, beforeRead, afterRead, afterEdit, generated }, null, 1)
      .replaceAll(demo, "/Users/demo/Bills/2026")
      .replaceAll(root, "/repo"),
  );
  const pdf = path.join(demo, "personal-file-map.output.pdf");
  fs.copyFileSync(pdf, path.join(out, "motion-demo", "report.pdf"));
  execFileSync("pdftoppm", ["-png", "-r", "110", pdf, path.join(pagesDir, "page")]);
  console.log(`\nfacts → docs/motion/demo/facts.json\nreport → out/motion-demo/report.pdf, pages → ${path.relative(root, pagesDir)}/`);
} finally {
  await fetch(base + "api/quit", { method: "POST" }).catch(() => {});
  app.kill();
  mock.kill();
}
