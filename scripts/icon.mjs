// Draws the app icon as a 1024×1024 PDF: a receipt with a green check badge.
import PDFDocument from "pdfkit";
import fs from "node:fs";

const out = process.argv[2];
const doc = new PDFDocument({ size: [1024, 1024], margin: 0 });
doc.pipe(fs.createWriteStream(out));

// macOS icon grid: 824px rounded square centred on the canvas
const grad = doc.linearGradient(100, 100, 924, 924);
grad.stop(0, "#27272a").stop(1, "#09090b");
doc.roundedRect(100, 100, 824, 824, 185).fill(grad);

// Receipt with a zig-zag bottom edge
const x = 300, y = 230, w = 424, h = 520, teeth = 8, tooth = w / teeth;
doc.moveTo(x, y + 40).quadraticCurveTo(x, y, x + 40, y).lineTo(x + w - 40, y).quadraticCurveTo(x + w, y, x + w, y + 40).lineTo(x + w, y + h);
for (let i = teeth; i > 0; i--) {
  doc.lineTo(x + (i - 0.5) * tooth, y + h - 28).lineTo(x + (i - 1) * tooth, y + h);
}
doc.closePath().fill("#fafafa");

// Lines on the receipt
const lines = [[0.62, 0.22], [0.45, 0.32], [0.55, 0.22], [0.38, 0.3]];
lines.forEach(([a, b], i) => {
  const ly = y + 92 + i * 78;
  doc.roundedRect(x + 56, ly, w * a, 26, 13).fill("#d4d4d8");
  doc.roundedRect(x + w - 56 - w * b * 0.6, ly, w * b * 0.6, 26, 13).fill("#a1a1aa");
});

// Check badge
doc.circle(708, 716, 150).fill("#09090b");
doc.circle(708, 716, 128).fill("#16a34a");
doc.lineWidth(34).lineCap("round").lineJoin("round").strokeColor("#ffffff");
doc.moveTo(650, 718).lineTo(690, 758).lineTo(770, 676).stroke();

doc.end();
