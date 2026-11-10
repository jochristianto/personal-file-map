// Generates generic sample bills ("YYYYMM Name.ext") into ../../samples.
//   node scripts/make-samples.mjs                 → current year, up to the current month
//   node scripts/make-samples.mjs 2026 11         → a specific year / current month
// Only files this script owns are replaced (YYYYMM-prefixed files and notes.txt).
import PDFDocument from "pdfkit";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../samples");
const now = new Date();
const YEAR = Number(process.argv[2]) || now.getFullYear();
const CUR = Number(process.argv[3]) || now.getMonth() + 1; // "this month" for the samples
const LAST = CUR - 1;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
const except = (list, ...drop) => list.filter((m) => !drop.includes(m));

// name → [months, extension, typical amount (0 = no amount, e.g. income)]
const bills = {
  // General (no shared first word)
  "Rent": [range(1, CUR), "pdf", 1450],
  "Salary": [range(1, CUR), "png", 0],
  "Credit Card": [range(1, LAST), "pdf", 820],
  "Electricity": [except(range(1, LAST), 6), "pdf", 95],
  "Water": [range(1, LAST - 1), "pdf", 40],
  "Phone": [range(1, LAST), "pdf", 35],
  "Streaming": [range(1, LAST), "png", 15],
  "Gym": [range(1, 5), "jpg", 45], // cancelled in May
  "Charity": [[5], "png", 100], // one-off

  // Groups (shared first word)
  "Internet Invoice": [range(3, LAST), "pdf", 60],
  "Internet Payment": [range(3, LAST), "jpg", 60],
  "Internet Receipt": [range(3, LAST - 1), "pdf", 60],
  "Insurance Car": [[1, 4, 7, 10], "pdf", 310], // quarterly
  "Insurance Health": [range(1, LAST), "pdf", 240],
  "Insurance Life": [[1, 7], "pdf", 520], // twice a year
  "Car Loan": [range(2, LAST), "jpg", 380],
  "Mortgage Sent": [range(3, CUR), "jpg", 1900],
  "Mortgage Received": [range(3, LAST), "png", 0],
  "HOA Invoice": [[1, 4, 7, 10], "pdf", 180], // quarterly
  "HOA Payment": [[1, 4, 7], "jpg", 180],
  "Groceries Market": [range(3, 7), "jpg", 210],
  "Groceries Online": [[3, 4, 9], "jpg", 130],
  "Property Tax 1 Assessment": [[1], "pdf", 2400], // yearly, in January
  "Property Tax 2 Payment": [[1], "pdf", 2400],
  "Property Tax 3 Receipt": [[2], "pdf", 2400],
};
for (const p of ["1 Before", "2 After", "3 Receipt"]) {
  bills[`Meter 01 Photo ${p}`] = [except(range(1, LAST), 8), "jpg", 70]; // monthly, August skipped
  bills[`Meter 02 Photo ${p}`] = [[4, 6, 7, 9], "jpg", 30]; // second meter: only some months
}

// ── images (drawn pixel by pixel; no system tools needed) ───────────────────
function canvas(w, h, bg) {
  const data = Buffer.alloc(w * h * 4);
  const rect = (x, y, rw, rh, [r, g, b]) => {
    for (let j = Math.max(0, y); j < Math.min(h, y + rh); j++)
      for (let i = Math.max(0, x); i < Math.min(w, x + rw); i++) data.set([r, g, b, 255], (j * w + i) * 4);
  };
  const circle = (cx, cy, rad, [r, g, b]) => {
    for (let j = cy - rad; j <= cy + rad; j++)
      for (let i = cx - rad; i <= cx + rad; i++)
        if ((i - cx) ** 2 + (j - cy) ** 2 <= rad * rad && i >= 0 && j >= 0 && i < w && j < h) data.set([r, g, b, 255], (j * w + i) * 4);
  };
  rect(0, 0, w, h, bg);
  return { data, rect, circle, w, h };
}

/** A photographed paper receipt (jpg). */
function receiptPhoto(tint) {
  const c = canvas(300, 400, tint);
  c.rect(50, 40, 200, 320, [250, 250, 249]);
  for (let i = 0; i < 6; i++) c.rect(70, 70 + i * 32, 90 + ((i * 37) % 60), 10, [212, 212, 216]);
  c.rect(70, 290, 160, 2, [161, 161, 170]);
  c.rect(170, 304, 60, 14, [82, 82, 91]);
  c.circle(215, 345, 26, [22, 163, 74]);
  return jpeg.encode({ data: c.data, width: c.w, height: c.h }, 80).data;
}

/** A banking-app screenshot (png). */
function screenshot(accent) {
  const c = canvas(270, 480, [250, 250, 250]);
  c.rect(0, 0, 270, 70, accent);
  c.circle(135, 150, 34, [22, 163, 74]);
  c.rect(75, 210, 120, 16, [39, 39, 42]);
  for (let i = 0; i < 5; i++) {
    c.rect(24, 260 + i * 34, 90, 9, [161, 161, 170]);
    c.rect(150, 260 + i * 34, 96, 9, [212, 212, 216]);
  }
  c.rect(24, 430, 222, 30, accent);
  const png = new PNG({ width: c.w, height: c.h });
  png.data = c.data;
  return PNG.sync.write(png);
}

const photos = [receiptPhoto([214, 211, 209]), receiptPhoto([203, 213, 225]), receiptPhoto([220, 214, 200])];
const shots = [screenshot([37, 99, 235]), screenshot([13, 148, 136]), screenshot([124, 58, 237])];

// ── PDF receipts ────────────────────────────────────────────────────────────
const money = (n) => "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function receiptPdf(file, name, month, amount) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: "A5", margin: 40, info: { Title: `${name} ${MONTHS[month - 1]} ${YEAR}` } });
    const stream = fs.createWriteStream(file);
    stream.on("finish", resolve);
    doc.pipe(stream);
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#09090b").text(name);
    doc.moveDown(0.3).font("Helvetica").fontSize(10).fillColor("#71717a").text(`Billing period: ${MONTHS[month - 1]} ${YEAR}`);
    doc.text(`Reference: INV-${YEAR}${String(month).padStart(2, "0")}-${Math.floor(rand() * 90000 + 10000)}`);
    doc.moveDown(1.5).fontSize(10).text("Amount");
    doc.font("Helvetica-Bold").fontSize(24).fillColor("#09090b").text(amount ? money(amount) : "-");
    doc.moveDown(1).font("Helvetica").fontSize(8).fillColor("#a1a1aa").text("SAMPLE DATA - generated for Bills Overview");
    doc.save().rotate(-12, { origin: [300, 420] });
    doc.roundedRect(220, 390, 150, 48, 8).lineWidth(3).stroke("#16a34a");
    doc.font("Helvetica-Bold").fontSize(26).fillColor("#16a34a").text("PAID", 220, 402, { width: 150, align: "center" });
    doc.restore();
    doc.end();
  });
}

// ── write ───────────────────────────────────────────────────────────────────
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) {
  if (/^\d{6} /.test(f) || f === "notes.txt") fs.rmSync(path.join(out, f));
}

const mm = (m) => String(m).padStart(2, "0");
let count = 0;
let variant = 0;
for (const [name, [months, ext, base]] of Object.entries(bills)) {
  for (const m of months.filter((m) => m >= 1 && m <= CUR)) {
    const file = path.join(out, `${YEAR}${mm(m)} ${name}.${ext}`);
    if (ext === "pdf") await receiptPdf(file, name, m, base * (0.92 + rand() * 0.16));
    else fs.writeFileSync(file, ext === "png" ? shots[variant++ % 3] : photos[variant++ % 3]);
    const day = m === CUR ? Math.min(now.getDate(), 1 + Math.floor(rand() * 9)) : 3 + Math.floor(rand() * 22);
    const when = new Date(YEAR, m - 1, day, 9 + Math.floor(rand() * 10));
    fs.utimesSync(file, when, when);
    count++;
  }
}

// Files that should show up under "Housekeeping" in the report
fs.writeFileSync(path.join(out, `${YEAR}00 Water.pdf`), fs.readFileSync(path.join(out, `${YEAR}01 Water.pdf`))); // month "00"
fs.writeFileSync(path.join(out, `${YEAR - 1}12 Rent.pdf`), fs.readFileSync(path.join(out, `${YEAR}01 Rent.pdf`))); // last year
fs.writeFileSync(path.join(out, "notes.txt"), "Ask the landlord about the deposit receipt.\n"); // unsupported type

console.log(`${count + 3} sample files for ${YEAR} (current month: ${MONTHS[CUR - 1]}) → ${path.relative(process.cwd(), out) || out}`);
