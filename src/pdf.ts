import PDFDocument from "pdfkit";
import interRegular from "@fontsource/inter/files/inter-latin-400-normal.woff";
import interMedium from "@fontsource/inter/files/inter-latin-500-normal.woff";
import interSemibold from "@fontsource/inter/files/inter-latin-600-normal.woff";
import interBold from "@fontsource/inter/files/inter-latin-700-normal.woff";
import { usd } from "./ailog";
import { aiTotals, type Electricity } from "./meters";
import type { BillRow, CellState, Report } from "./types";
import type { MeterUsage } from "./usage";

// ── Design tokens (shadcn/ui "zinc" theme) ───────────────────────────────────
const C = {
  fg: "#09090b",
  fg2: "#27272a",
  muted: "#71717a",
  faint: "#a1a1aa",
  border: "#e4e4e7",
  line: "#f4f4f5",
  mutedBg: "#f4f4f5",
  subtle: "#fafafa",
  card: "#ffffff",
  bar: "#3f3f46",
  green: "#16a34a",
  greenBg: "#dcfce7",
  greenText: "#15803d",
  amber: "#d97706",
  amberBg: "#fef3c7",
  amberSoft: "#fffbeb",
  amberText: "#b45309",
  amberBorder: "#fde68a",
  rose: "#e11d48",
  roseBg: "#ffe4e6",
  roseText: "#be123c",
  blue: "#2563eb",
};

const W = 841.89; // A4 landscape
const H = 595.28;
const M = 32;
const TW = W - 2 * M;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON = MONTHS.map((m) => m.slice(0, 3));
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Weight = "regular" | "medium" | "semibold" | "bold";
interface TextOpts {
  size: number;
  weight?: Weight;
  color?: string;
  spacing?: number;
  align?: "left" | "right" | "center";
  maxW?: number;
}

// lucide.dev icon paths (24×24 grid)
const ICONS: Record<string, string[]> = {
  calendar: ["M8 2v4", "M16 2v4", "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M3 10h18"],
  alert: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
  trending: ["M22 7 13.5 15.5 8.5 10.5 2 17", "M16 7h6v6"],
  upload: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12"],
  clock: ["M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z", "M12 6v6l4 2"],
  sparkles: ["M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"],
  bars: ["M3 3v16a2 2 0 0 0 2 2h16", "M18 17V9", "M13 17V5", "M8 17v-3"],
  zap: ["M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"],
  wallet: ["M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1", "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"],
  plus: ["M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z", "M8 12h8", "M12 8v8"],
  broom: ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
};

export async function renderPdf(report: Report): Promise<Buffer> {
  const regular = Buffer.from(interRegular);
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    font: regular as unknown as string, // avoids loading the built-in Helvetica files
    info: { Title: `Personal File Map ${report.year}`, Creator: "Personal File Map" },
  });
  doc.registerFont("regular", regular);
  doc.registerFont("medium", Buffer.from(interMedium));
  doc.registerFont("semibold", Buffer.from(interSemibold));
  doc.registerFont("bold", Buffer.from(interBold));

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const r = new Painter(doc);
  const newPage = () => {
    doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    doc.rect(0, 0, W, H).fill(C.card);
  };

  newPage();
  drawOverview(r, report);
  drawMatrixPages(r, report, newPage);
  if (report.electricity) drawElectricityPages(r, report, report.electricity, newPage);

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    drawFooter(r, report, i + 1, range.count);
  }

  doc.end();
  return done;
}

// ── Painter: thin helpers over pdfkit ────────────────────────────────────────
class Painter {
  constructor(readonly doc: PDFKit.PDFDocument) {}

  width(s: string, size: number, weight: Weight = "regular", spacing = 0): number {
    return this.doc.font(weight).fontSize(size).widthOfString(s, { characterSpacing: spacing });
  }

  fit(s: string, maxW: number, size: number, weight: Weight = "regular", spacing = 0): string {
    if (this.width(s, size, weight, spacing) <= maxW) return s;
    let lo = 0;
    let hi = s.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.width(s.slice(0, mid).trimEnd() + "…", size, weight, spacing) <= maxW) lo = mid;
      else hi = mid - 1;
    }
    return lo === 0 ? "…" : s.slice(0, lo).trimEnd() + "…";
  }

  /** Draws one line of text. `y` is the vertical centre of the capitals. Returns width. */
  text(s: string, x: number, y: number, o: TextOpts): number {
    const weight = o.weight ?? "regular";
    const spacing = o.spacing ?? 0;
    const str = o.maxW !== undefined ? this.fit(s, o.maxW, o.size, weight, spacing) : s;
    const w = this.width(str, o.size, weight, spacing);
    const left = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    this.doc
      .font(weight)
      .fontSize(o.size)
      .fillColor(o.color ?? C.fg)
      .text(str, left, y - o.size * 0.6, { lineBreak: false, characterSpacing: spacing });
    return w;
  }

  card(x: number, y: number, w: number, h: number) {
    this.doc.lineWidth(0.75).roundedRect(x, y, w, h, 10).fillAndStroke(C.card, C.border);
  }

  pill(text: string, x: number, cy: number, o: { fg: string; bg: string; border?: string; size?: number; h?: number; align?: "left" | "right" }): number {
    const size = o.size ?? 7;
    const h = o.h ?? 13;
    const w = this.width(text, size, "semibold") + 12;
    const left = o.align === "right" ? x - w : x;
    const d = this.doc.roundedRect(left, cy - h / 2, w, h, h / 2);
    if (o.border) d.lineWidth(0.6).fillAndStroke(o.bg, o.border);
    else d.fill(o.bg);
    this.text(text, left + 6, cy, { size, weight: "semibold", color: o.fg });
    return w;
  }

  progress(x: number, y: number, w: number, ratio: number, color: string, h = 5) {
    this.doc.roundedRect(x, y, w, h, h / 2).fill(C.mutedBg);
    const fw = Math.max(0, Math.min(1, ratio)) * w;
    if (fw > 0) this.doc.roundedRect(x, y, Math.max(fw, h), h, h / 2).fill(color);
  }

  icon(name: keyof typeof ICONS, x: number, y: number, size: number, color: string) {
    const d = this.doc;
    d.save().translate(x, y).scale(size / 24);
    d.lineWidth(2).lineCap("round").lineJoin("round").strokeColor(color);
    for (const p of ICONS[name]) d.path(p).stroke();
    d.restore();
  }

  glyph(state: CellState, cx: number, cy: number, r = 4.6) {
    const d = this.doc;
    if (state === "paid") {
      d.circle(cx, cy, r).fill(C.green);
      d.save().lineWidth(1.15).lineCap("round").lineJoin("round").strokeColor("#ffffff");
      d.moveTo(cx - 0.42 * r, cy + 0.02 * r).lineTo(cx - 0.1 * r, cy + 0.34 * r).lineTo(cx + 0.45 * r, cy - 0.32 * r).stroke();
      d.restore();
    } else if (state === "missing") {
      d.circle(cx, cy, r).fill(C.roseBg);
      const k = 0.3 * r;
      d.save().lineWidth(1.05).lineCap("round").strokeColor(C.rose);
      d.moveTo(cx - k, cy - k).lineTo(cx + k, cy + k).stroke();
      d.moveTo(cx + k, cy - k).lineTo(cx - k, cy + k).stroke();
      d.restore();
    } else if (state === "due") {
      d.save();
      d.circle(cx, cy, r - 0.4).fill(C.amberSoft);
      d.lineWidth(0.8).dash(1.1, { space: 1 }).circle(cx, cy, r - 0.4).stroke(C.amber);
      d.undash().lineWidth(0.9).lineCap("round").strokeColor(C.amber);
      d.moveTo(cx, cy - 0.45 * r).lineTo(cx, cy).lineTo(cx + 0.32 * r, cy + 0.18 * r).stroke();
      d.restore();
    } else if (state === "none") {
      d.circle(cx, cy, 0.8).fill(C.border);
    }
  }
}

// ── Page 1: overview ─────────────────────────────────────────────────────────
function drawOverview(r: Painter, rep: Report) {
  const { stats } = rep;
  const inYear = rep.currentMonth >= 1 && rep.currentMonth <= 12;
  const monthName = inYear ? MONTHS[rep.currentMonth - 1] : "";

  // Header
  r.text("PERSONAL FILE MAP", M, M + 4, { size: 7.5, weight: "semibold", color: C.muted, spacing: 1.2 });
  r.text(inYear ? `${monthName} ${rep.year}` : `${rep.year}`, M, M + 26, { size: 24, weight: "bold" });
  r.text(
    `${rep.rows.length} bills  ·  ${stats.scheduledCount} scheduled  ·  ${stats.irregularCount} irregular  ·  ${stats.unscheduledCount} not scheduled  ·  ${stats.totalFiles} files`,
    M,
    M + 50,
    { size: 8.5, color: C.muted }
  );

  r.text(`Generated ${formatDateTime(rep.generatedAt)}`, W - M, M + 4, { size: 7.5, color: C.muted, align: "right" });
  const due = stats.dueThisMonth.length;
  const missing = stats.missingCells;
  if (!inYear) {
    r.pill(missing ? `${missing} missing files` : "Complete", W - M, M + 24, missing ? roseTone() : greenTone("right"));
  } else if (due === 0 && missing === 0) {
    r.pill("All caught up", W - M, M + 24, { ...greenTone("right"), size: 8, h: 18 });
  } else {
    let x = W - M;
    if (missing) x -= r.pill(`${missing} missing`, x, M + 24, { ...roseTone(), size: 8, h: 18 }) + 6;
    if (due) r.pill(`${due} due in ${MON[rep.currentMonth - 1]}`, x, M + 24, { fg: C.amberText, bg: C.amberBg, size: 8, h: 18, align: "right" });
  }

  // KPI cards
  const ky = M + 70;
  const kh = 82;
  const gap = 12;
  const kw = (TW - 3 * gap) / 4;
  const kpi = (i: number, icon: keyof typeof ICONS, label: string, draw: (x: number, y: number, w: number) => void) => {
    const x = M + i * (kw + gap);
    r.card(x, ky, kw, kh);
    r.text(label, x + 14, ky + 16, { size: 8, weight: "medium", color: C.muted });
    r.icon(icon, x + kw - 26, ky + 10, 12, C.faint);
    draw(x + 14, ky, kw - 28);
  };

  kpi(0, "calendar", inYear ? `Paid in ${monthName}` : "Scheduled bills", (x, y, w) => {
    if (inYear) {
      const vw = r.text(`${stats.paidThisMonth}`, x, y + 42, { size: 22, weight: "semibold" });
      r.text(` / ${stats.expectedThisMonth}`, x + vw, y + 44, { size: 12, weight: "medium", color: C.faint });
      r.progress(x, y + 57, w, stats.expectedThisMonth ? stats.paidThisMonth / stats.expectedThisMonth : 1, C.green);
      r.text(due ? `${due} still due this month` : "Everything expected is in", x, y + 71, { size: 7.5, color: C.muted, maxW: w });
    } else {
      r.text(`${stats.scheduledCount}`, x, y + 42, { size: 22, weight: "semibold" });
      r.text(`${stats.unscheduledCount} not scheduled`, x, y + 71, { size: 7.5, color: C.muted });
    }
  });

  kpi(1, "alert", "Missing files", (x, y, w) => {
    r.text(`${missing}`, x, y + 42, { size: 22, weight: "semibold", color: missing ? C.roseText : C.fg });
    r.text(
      missing ? `across ${stats.missingBills.length} bill${stats.missingBills.length === 1 ? "" : "s"}` : "nothing overdue",
      x,
      y + 60,
      { size: 7.5, color: C.muted, maxW: w }
    );
    r.text("expected months without a file", x, y + 71, { size: 7.5, color: C.faint, maxW: w });
  });

  kpi(2, "trending", "Year-to-date coverage", (x, y, w) => {
    const pct = stats.coverageExpected ? Math.round((stats.coveragePaid / stats.coverageExpected) * 100) : 100;
    r.text(`${pct}%`, x, y + 42, { size: 22, weight: "semibold" });
    r.progress(x, y + 57, w, pct / 100, pct >= 90 ? C.green : pct >= 70 ? C.amber : C.rose);
    r.text(`${stats.coveragePaid} of ${stats.coverageExpected} expected files`, x, y + 71, { size: 7.5, color: C.muted, maxW: w });
  });

  kpi(3, "upload", "Latest upload", (x, y, w) => {
    const latest = stats.latest;
    r.text(latest ? relativeDay(latest.mtime, rep.generatedAt) : "—", x, y + 42, { size: 18, weight: "semibold", maxW: w });
    if (latest) {
      r.text(latest.name, x, y + 60, { size: 7.5, weight: "medium", color: C.fg2, maxW: w });
      r.text(`${MON[latest.month - 1]} ${rep.year} · .${latest.ext}`, x, y + 71, { size: 7.5, color: C.faint, maxW: w });
    }
  });

  // Lower area
  const top = ky + kh + 12;
  const bottom = H - M - 16;
  const leftW = 476;
  const rightX = M + leftW + 12;
  const rightW = W - M - rightX;

  drawAttention(r, rep, M, top, leftW, bottom - top);
  const chartH = 158;
  drawChart(r, rep, rightX, top, rightW, chartH);
  drawHighlights(r, rep, rightX, top + chartH + 12, rightW, bottom - top - chartH - 12);
}

function drawAttention(r: Painter, rep: Report, x: number, y: number, w: number, h: number) {
  const { stats } = rep;
  const inYear = rep.currentMonth >= 1 && rep.currentMonth <= 12;
  r.card(x, y, w, h);
  const px = x + 16;
  const iw = w - 32;
  let cy = y + 20;

  // Still due this month
  if (inYear) {
    const due = stats.dueThisMonth;
    const tw = r.text(`Still due in ${MONTHS[rep.currentMonth - 1]}`, px, cy, { size: 10.5, weight: "semibold" });
    r.pill(`${due.length}`, px + tw + 6, cy, { fg: C.amberText, bg: C.amberBg });
    cy += 13;
    r.text("Scheduled bills with no file for this month yet", px, cy, { size: 7.5, color: C.muted });
    cy += 16;

    if (due.length === 0) {
      r.glyph("paid", px + 5, cy + 2);
      r.text("Every bill scheduled this month has a file.", px + 15, cy + 2, { size: 8, color: C.greenText, weight: "medium" });
      cy += 20;
    } else {
      cy = chipFlow(r, due.map((b) => b.name), px, cy, iw, 5) + 8;
    }
    r.doc.moveTo(px, cy).lineTo(px + iw, cy).lineWidth(0.6).stroke(C.line);
    cy += 18;
  }

  // Missing files
  const missing = [...stats.missingBills].sort((a, b) => b.missingMonths.length - a.missingMonths.length || a.name.localeCompare(b.name));
  const tw = r.text("Missing files", px, cy, { size: 10.5, weight: "semibold" });
  r.pill(`${stats.missingCells}`, px + tw + 6, cy, missing.length ? { fg: C.roseText, bg: C.roseBg } : { fg: C.muted, bg: C.mutedBg });
  cy += 13;
  r.text("Scheduled past months with no file: paid but not uploaded, or not paid?", px, cy, {
    size: 7.5,
    color: C.muted,
    maxW: iw,
  });
  cy += 17;

  if (missing.length === 0) {
    r.glyph("paid", px + 5, cy);
    r.text("No gaps. Every expected month has a file.", px + 15, cy, { size: 8, color: C.greenText, weight: "medium" });
    return;
  }

  const rowH = 13.5;
  const colGap = 20;
  const colW = (iw - colGap) / 2;
  const perCol = Math.max(1, Math.floor((y + h - 10 - cy) / rowH));
  const capacity = perCol * 2;
  const shown = missing.length > capacity ? missing.slice(0, capacity - 1) : missing;
  shown.forEach((b, i) => {
    const col = Math.floor(i / perCol);
    const rx = px + col * (colW + colGap);
    const ry = cy + (i % perCol) * rowH;
    const months = formatMonths(b.missingMonths);
    const mw = r.text(months, rx + colW, ry, { size: 7.5, weight: "semibold", color: C.roseText, align: "right" });
    r.glyph("missing", rx + 3.5, ry, 3.5);
    r.text(b.name, rx + 11, ry, { size: 7.8, weight: "medium", color: C.fg2, maxW: colW - mw - 18 });
  });
  if (shown.length < missing.length) {
    const i = shown.length;
    const rx = px + Math.floor(i / perCol) * (colW + colGap);
    r.text(`+${missing.length - shown.length} more (see the matrix)`, rx + 11, cy + (i % perCol) * rowH, { size: 7.5, color: C.muted });
  }
}

/** Wraps name chips across lines; returns the y after the last line. */
function chipFlow(r: Painter, names: string[], x: number, y: number, w: number, maxLines: number): number {
  const h = 15;
  const gap = 5;
  const size = 7.5;
  const chipW = (s: string) => r.width(s, size, "medium") + 14;

  // Pass 1: lay every chip out
  const placed: { s: string; line: number; x: number }[] = [];
  let cx = x;
  let line = 0;
  for (const name of names) {
    const s = r.fit(name, w - 14, size, "medium");
    const cw = chipW(s);
    if (cx > x && cx + cw > x + w) {
      line++;
      cx = x;
    }
    placed.push({ s, line, x: cx });
    cx += cw + gap;
  }

  // Pass 2: if it overflows, keep what fits and end with a "+N more" chip
  let visible = placed;
  let rest: { s: string; line: number; x: number } | null = null;
  if (placed.length && placed[placed.length - 1].line >= maxLines) {
    visible = placed.filter((p) => p.line < maxLines);
    for (;;) {
      const label = `+${names.length - visible.length} more`;
      const last = visible[visible.length - 1];
      if (!last) {
        rest = { s: label, line: 0, x };
        break;
      }
      const after = last.x + chipW(last.s) + gap;
      if (after + chipW(label) <= x + w) {
        rest = { s: label, line: last.line, x: after };
        break;
      }
      visible = visible.slice(0, -1);
    }
  }

  for (const p of visible) chip(r, p.s, p.x, y + p.line * (h + gap), h, size, false);
  if (rest) chip(r, rest.s, rest.x, y + rest.line * (h + gap), h, size, true);
  const lines = Math.max(rest?.line ?? 0, ...visible.map((p) => p.line)) + 1;
  return y + lines * (h + gap) - gap;
}

function chip(r: Painter, s: string, x: number, y: number, h: number, size: number, muted: boolean) {
  const w = r.width(s, size, "medium") + 14;
  r.doc.lineWidth(0.6).roundedRect(x, y, w, h, h / 2).fillAndStroke(muted ? C.mutedBg : C.amberSoft, muted ? C.border : C.amberBorder);
  r.text(s, x + 7, y + h / 2, { size, weight: "medium", color: muted ? C.muted : C.amberText });
}

function drawChart(r: Painter, rep: Report, x: number, y: number, w: number, h: number) {
  r.card(x, y, w, h);
  r.text("Bills with a file, per month", x + 16, y + 20, { size: 10.5, weight: "semibold" });
  r.icon("bars", x + w - 28, y + 13, 12, C.faint);
  const busiest = rep.stats.busiestMonth;
  r.text(busiest ? `Peak: ${MONTHS[busiest.month - 1]} with ${busiest.count}` : "No files yet", x + 16, y + 33, { size: 7.5, color: C.muted });

  const px = x + 16;
  const pw = w - 32;
  const base = y + h - 22;
  const plotTop = y + 54;
  const max = Math.max(1, ...rep.monthTotals);
  const slot = pw / 12;
  const bw = Math.min(13, slot * 0.58);
  rep.monthTotals.forEach((v, i) => {
    const cx = px + slot * i + slot / 2;
    const isNow = i + 1 === rep.currentMonth;
    const isFuture = i + 1 > rep.currentMonth;
    const bh = (v / max) * (base - plotTop);
    if (v > 0) r.doc.roundedRect(cx - bw / 2, base - bh, bw, bh, Math.min(2.5, bh / 2)).fill(isNow ? C.blue : C.bar);
    if (v > 0) r.text(`${v}`, cx, base - bh - 7, { size: 6.5, weight: "semibold", color: isNow ? C.blue : C.muted, align: "center" });
    r.text(MON[i][0], cx, base + 10, {
      size: 7,
      weight: isNow ? "bold" : "medium",
      color: isNow ? C.blue : isFuture ? C.border : C.muted,
      align: "center",
    });
  });
  r.doc.moveTo(px, base + 0.5).lineTo(px + pw, base + 0.5).lineWidth(0.6).stroke(C.border);
}

function drawHighlights(r: Painter, rep: Report, x: number, y: number, w: number, h: number) {
  const { stats } = rep;
  r.card(x, y, w, h);
  const px = x + 16;
  const iw = w - 32;
  r.text("Highlights", px, y + 20, { size: 10.5, weight: "semibold" });
  r.icon("sparkles", x + w - 28, y + 13, 12, C.faint);

  const items: [string, string][] = [];
  if (stats.longestStreak && stats.longestStreak.months > 1)
    items.push(["Longest streak", `${stats.longestStreak.row.name} · ${stats.longestStreak.months} months in a row`]);
  items.push(["Up to date", `${stats.upToDate} of ${stats.scheduledCount} scheduled bills`]);
  items.push(["Files this year", `${stats.totalFiles}  (${stats.pdfFiles} PDF · ${stats.imageFiles} images)`]);
  items.push(["Never flagged", `${stats.irregularCount} irregular · ${stats.unscheduledCount} not scheduled`]);

  let cy = y + 38;
  for (const [label, value] of items) {
    const lw = r.text(label, px, cy, { size: 7.8, color: C.muted });
    r.text(value, px + iw, cy, { size: 7.8, weight: "semibold", color: C.fg2, align: "right", maxW: iw - lw - 10 });
    cy += 7;
    r.doc.moveTo(px, cy).lineTo(px + iw, cy).lineWidth(0.5).stroke(C.line);
    cy += 9;
  }

  // Housekeeping: files that didn't make it into the table + clean-up done this run
  // Problems first (files left out of the table), then one line summarising the clean-up
  const notes = [...rep.configNotes, ...rep.ignored];
  if (rep.housekeeping.length) {
    const converted = rep.housekeeping.filter((h) => h.reason.startsWith("converted")).length;
    const renamed = rep.housekeeping.filter((h) => h.reason.startsWith("renamed")).length;
    const failed = rep.housekeeping.length - converted - renamed;
    const bits = [renamed && `${renamed} extension${renamed > 1 ? "s" : ""} lowercased`, converted && `${converted} HEIC converted to JPG`, failed && `${failed} couldn't be converted`];
    notes.push({ file: "Tidied this run", reason: bits.filter(Boolean).join(" · ") });
  }
  cy += 6;
  r.text("Housekeeping", px, cy, { size: 8.5, weight: "semibold", color: C.fg2 });
  if (notes.length) r.pill(`${notes.length}`, px + r.width("Housekeeping", 8.5, "semibold") + 6, cy, { fg: C.muted, bg: C.mutedBg, h: 12, size: 6.5 });
  cy += 13;
  if (notes.length === 0) {
    r.text("All files follow the “YYYYMM Name.ext” pattern.", px, cy, { size: 7.5, color: C.muted });
    return;
  }
  const lineH = 11;
  const fits = Math.max(1, Math.floor((y + h - 8 - cy) / lineH));
  const shown = notes.length > fits ? notes.slice(0, fits - 1) : notes;
  for (const n of shown) {
    const fw = r.text(n.file, px, cy, { size: 7.2, weight: "medium", color: C.fg2, maxW: n.reason ? iw * 0.55 : iw });
    if (n.reason) r.text(`  ${n.reason}`, px + fw, cy, { size: 7.2, color: C.muted, maxW: iw - fw });
    cy += lineH;
  }
  if (shown.length < notes.length) r.text(`+${notes.length - shown.length} more`, px, cy, { size: 7.2, color: C.muted });
}

// ── Pages 2+: the matrix ─────────────────────────────────────────────────────
type Item =
  | { kind: "group"; name: string; rows: BillRow[]; cont: boolean }
  | { kind: "row"; row: BillRow }
  | { kind: "total" };

const COL = { name: 218, month: 34, total: 46 };
const ROW_H = 15;
const GROUP_H = 18;
const TOTAL_H = 20;
const HEAD_H = 26;
const TABLE_TOP = M + 44;
const TABLE_BOTTOM = H - M - 12;

const itemH = (it: Item) => (it.kind === "row" ? ROW_H : it.kind === "group" ? GROUP_H : TOTAL_H);

function paginate(rep: Report): Item[][] {
  const pages: Item[][] = [[]];
  let used = HEAD_H;
  const room = TABLE_BOTTOM - TABLE_TOP;
  const push = (it: Item) => {
    pages[pages.length - 1].push(it);
    used += itemH(it);
  };
  const breakPage = () => {
    pages.push([]);
    used = HEAD_H;
  };
  for (const g of rep.groups) {
    if (used + GROUP_H + ROW_H > room) breakPage();
    push({ kind: "group", name: g.name, rows: g.rows, cont: false });
    for (const row of g.rows) {
      if (used + ROW_H > room) {
        breakPage();
        push({ kind: "group", name: g.name, rows: g.rows, cont: true });
      }
      push({ kind: "row", row });
    }
  }
  if (used + TOTAL_H > room) breakPage();
  push({ kind: "total" });
  return pages;
}

function drawMatrixPages(r: Painter, rep: Report, newPage: () => void) {
  const pages = paginate(rep);
  pages.forEach((items) => {
    newPage();
    drawMatrixHeader(r, rep);
    drawTable(r, rep, items);
  });
}

function drawMatrixHeader(r: Painter, rep: Report) {
  const tw = r.text("Bill matrix", M, M + 8, { size: 15, weight: "bold" });
  r.text(`${rep.year}`, M + tw + 7, M + 9, { size: 11, weight: "medium", color: C.faint });
  r.text(
    "Expected months come from the app's settings (config.local.json next to the app). Irregular and not-scheduled bills are shown but never flagged.",
    M,
    M + 25,
    { size: 7.2, color: C.muted }
  );

  // Legend (right-aligned)
  const legend: [CellState, string][] = [
    ["paid", "File found"],
    ["due", "Due this month"],
    ["missing", "Missing"],
    ["none", "Not expected"],
  ];
  let x = W - M;
  for (let i = legend.length - 1; i >= 0; i--) {
    const [state, label] = legend[i];
    const lw = r.text(label, x, M + 9, { size: 7.5, color: C.muted, align: "right" });
    x -= lw + 8;
    r.glyph(state, x, M + 9, 4.2);
    x -= 16;
  }
}

function drawTable(r: Painter, rep: Report, items: Item[]) {
  const d = r.doc;
  const x0 = M;
  const monthX = x0 + COL.name;
  const totalX = monthX + COL.month * 12;
  const statusX = totalX + COL.total;
  const tableH = HEAD_H + items.reduce((n, it) => n + itemH(it), 0);
  const top = TABLE_TOP;

  d.save();
  d.roundedRect(x0, top, TW, tableH, 9).clip();
  d.rect(x0, top, TW, HEAD_H).fill(C.subtle);

  // Background bands first (group rows, total row), then the current-month tint on top
  let y = top + HEAD_H;
  for (const it of items) {
    if (it.kind === "group") d.rect(x0, y, TW, GROUP_H).fill(C.mutedBg);
    if (it.kind === "total") d.rect(x0, y, TW, TOTAL_H).fill(C.subtle);
    y += itemH(it);
  }
  if (rep.currentMonth >= 1 && rep.currentMonth <= 12) {
    d.save().fillOpacity(0.07).rect(monthX + (rep.currentMonth - 1) * COL.month, top, COL.month, tableH).fill(C.blue).restore();
  }

  // Header labels
  const hy = top + HEAD_H / 2;
  r.text("BILL", x0 + 14, hy, { size: 6.8, weight: "semibold", color: C.muted, spacing: 0.6 });
  for (let i = 0; i < 12; i++) {
    const cx = monthX + COL.month * i + COL.month / 2;
    const isNow = i + 1 === rep.currentMonth;
    r.text(MON[i].toUpperCase(), cx, isNow ? hy - 3.5 : hy, {
      size: 6.8,
      weight: isNow ? "bold" : "semibold",
      color: isNow ? C.blue : i + 1 > rep.currentMonth ? C.faint : C.muted,
      spacing: 0.4,
      align: "center",
    });
    if (isNow) r.text("NOW", cx, hy + 5.5, { size: 5, weight: "bold", color: C.blue, spacing: 0.5, align: "center" });
  }
  r.text("TOTAL", totalX + COL.total / 2, hy, { size: 6.8, weight: "semibold", color: C.muted, spacing: 0.6, align: "center" });
  r.text("STATUS", statusX + 12, hy, { size: 6.8, weight: "semibold", color: C.muted, spacing: 0.6 });
  d.moveTo(x0, top + HEAD_H).lineTo(x0 + TW, top + HEAD_H).lineWidth(0.75).stroke(C.border);

  y = top + HEAD_H;
  for (const it of items) {
    const h = itemH(it);
    const cy = y + h / 2;
    if (it.kind === "group") {
      const gw = r.text(it.name.toUpperCase(), x0 + 14, cy, { size: 7, weight: "bold", color: C.fg2, spacing: 0.7 });
      r.text(it.cont ? `${it.rows.length} · continued` : `${it.rows.length}`, x0 + 14 + gw + 6, cy, { size: 7, color: C.faint });
      const due = it.rows.filter((b) => b.dueNow).length;
      const miss = it.rows.reduce((n, b) => n + b.missingMonths.length, 0);
      const bits = [due ? `${due} due` : "", miss ? `${miss} missing` : ""].filter(Boolean).join(" · ");
      if (bits) r.text(bits, statusX + 12, cy, { size: 6.8, color: C.muted });
    } else if (it.kind === "row") {
      const b = it.row;
      const cad = b.scheduleLabel;
      const cadW = cad ? r.text(cad, monthX - 10, cy, { size: 6.2, color: C.faint, align: "right" }) + 6 : 0;
      r.text(b.label, x0 + 22, cy, { size: 7.8, color: C.fg2, maxW: COL.name - 34 - cadW });
      b.cells.forEach((state, i) => r.glyph(state, monthX + COL.month * i + COL.month / 2, cy));
      const n = b.paidMonths.length;
      r.text(`${n}`, totalX + COL.total / 2, cy, { size: 7.8, weight: "semibold", color: n ? C.fg : C.faint, align: "center" });
      statusPill(r, b, statusX + 12, cy);
      d.moveTo(x0, y + h).lineTo(x0 + TW, y + h).lineWidth(0.5).stroke(C.line);
    } else {
      d.moveTo(x0, y).lineTo(x0 + TW, y).lineWidth(0.75).stroke(C.border);
      r.text("BILLS WITH A FILE", x0 + 14, cy, { size: 6.8, weight: "semibold", color: C.muted, spacing: 0.6 });
      rep.monthTotals.forEach((v, i) => {
        const isNow = i + 1 === rep.currentMonth;
        r.text(`${v}`, monthX + COL.month * i + COL.month / 2, cy, {
          size: 7.8,
          weight: "semibold",
          color: v === 0 ? C.faint : isNow ? C.blue : C.fg,
          align: "center",
        });
      });
      r.text(`${rep.monthTotals.reduce((a, b) => a + b, 0)}`, totalX + COL.total / 2, cy, { size: 7.8, weight: "bold", align: "center" });
    }
    y += h;
  }

  // Column dividers
  d.lineWidth(0.6).strokeColor(C.border);
  for (const vx of [monthX, totalX, statusX]) d.moveTo(vx, top).lineTo(vx, top + tableH).stroke();
  d.restore();
  d.lineWidth(0.75).roundedRect(x0, top, TW, tableH, 9).stroke(C.border);
}

function statusPill(r: Painter, b: BillRow, x: number, cy: number) {
  const o = { size: 6.6, h: 11.5 };
  switch (b.status) {
    case "ok":
      r.pill("Up to date", x, cy, { ...o, fg: C.greenText, bg: C.greenBg });
      break;
    case "due":
      r.pill("Due", x, cy, { ...o, fg: C.amberText, bg: C.amberBg });
      break;
    case "missing": {
      const w = r.pill(`${b.missingMonths.length} missing`, x, cy, { ...o, fg: C.roseText, bg: C.roseBg });
      if (b.dueNow) r.pill("Due", x + w + 4, cy, { ...o, fg: C.amberText, bg: C.amberBg });
      break;
    }
    case "unscheduled":
      r.text("Not scheduled", x + 6, cy, { size: 6.8, color: C.faint });
      break;
    case "irregular":
      r.text("Irregular", x + 6, cy, { size: 6.8, color: C.faint });
  }
}

function drawFooter(r: Painter, rep: Report, page: number, total: number) {
  const y = H - 20;
  const pageLabel = `Page ${page} of ${total}`;
  const pw = r.text(pageLabel, W - M, y, { size: 6.8, color: C.faint, align: "right" });
  const lw = r.text("Source", M, y, { size: 6.8, weight: "semibold", color: C.faint });
  r.text(rep.dir, M + lw + 5, y, { size: 6.8, color: C.faint, maxW: TW - lw - pw - 40 });
}

// ── formatting ───────────────────────────────────────────────────────────────
function greenTone(align?: "left" | "right") {
  return { fg: C.greenText, bg: C.greenBg, align };
}
function roseTone() {
  return { fg: C.roseText, bg: C.roseBg, align: "right" as const };
}

/** [3,4,5,6,8] → "Mar–Jun, Aug" */
export function formatMonths(months: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < months.length; ) {
    let j = i;
    while (j + 1 < months.length && months[j + 1] === months[j] + 1) j++;
    if (j - i >= 2) parts.push(`${MON[months[i] - 1]}–${MON[months[j] - 1]}`);
    else for (let k = i; k <= j; k++) parts.push(MON[months[k] - 1]);
    i = j + 1;
  }
  return parts.join(", ");
}

function formatDateTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()} at ${hh}:${mm}`;
}

function relativeDay(d: Date, now: Date): string {
  const day = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86_400_000;
  const diff = Math.round(day(now) - day(d));
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 14) return `${diff} days ago`;
  if (diff < 60) return `${Math.round(diff / 7)} weeks ago`;
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Electricity: one overview page per meter, then its readings ──────────────
function drawElectricityPages(r: Painter, rep: Report, e: Electricity, newPage: () => void) {
  for (const u of e.usages) {
    newPage();
    drawMeterOverview(r, rep, e, u);
    const rows = u.photos;
    const perPage = Math.floor((READINGS_BOTTOM - TABLE_TOP - HEAD_H) / READING_ROW_H);
    for (let i = 0; i < rows.length; i += perPage) {
      newPage();
      drawReadingsPage(r, rep, e, u, rows.slice(i, i + perPage), i > 0);
    }
  }
}

const READING_ROW_H = 15;
const READINGS_BOTTOM = H - M - 14;

function drawMeterOverview(r: Painter, rep: Report, e: Electricity, u: MeterUsage) {
  const year = rep.year;
  const edited = u.photos.filter((p) => p.reading?.edited).length;
  r.text("ELECTRICITY", M, M + 4, { size: 7.5, weight: "semibold", color: C.muted, spacing: 1.2 });
  r.text(`${u.meter} · ${year}`, M, M + 26, { size: 24, weight: "bold" });
  const sub = [
    `${u.photos.length} meter photo${u.photos.length === 1 ? "" : "s"}`,
    e.reader ? `read by ${e.reader}` : "no AI reader chosen",
    edited ? `${edited} corrected by hand` : "",
    u.estimatedDates ? `${u.estimatedDates} without a capture date (mid-month assumed)` : "",
  ].filter(Boolean);
  r.text(sub.join("  ·  "), M, M + 50, { size: 8.5, color: C.muted, maxW: TW - 200 });

  let x = W - M;
  if (u.unread) x -= r.pill(`${u.unread} photo${u.unread === 1 ? "" : "s"} not read`, x, M + 24, { fg: C.amberText, bg: C.amberBg, size: 8, h: 18, align: "right" }) + 6;
  if (u.problems) r.pill(`${u.problems} to check`, x, M + 24, { ...roseTone(), size: 8, h: 18 });
  if (!u.unread && !u.problems) r.pill("All photos read", W - M, M + 24, { ...greenTone("right"), size: 8, h: 18 });

  // KPI cards
  const ky = M + 70;
  const kh = 82;
  const gap = 12;
  const kw = (TW - 3 * gap) / 4;
  const kpi = (i: number, icon: keyof typeof ICONS, label: string, value: string, unit: string, line1: string, line2: string) => {
    const kx = M + i * (kw + gap);
    r.card(kx, ky, kw, kh);
    r.text(label, kx + 14, ky + 16, { size: 8, weight: "medium", color: C.muted });
    r.icon(icon, kx + kw - 26, ky + 10, 12, C.faint);
    const vw = r.text(value, kx + 14, ky + 42, { size: 22, weight: "semibold" });
    if (unit) r.text(` ${unit}`, kx + 14 + vw, ky + 44, { size: 11, weight: "medium", color: C.faint });
    r.text(line1, kx + 14, ky + 60, { size: 7.5, color: C.muted, maxW: kw - 28 });
    r.text(line2, kx + 14, ky + 71, { size: 7.5, color: C.faint, maxW: kw - 28 });
  };
  const days = Math.round(u.coveredDays);
  kpi(0, "zap", `Used in ${year}`, u.coveredDays ? kwh(u.totalUsed, 0) : "—", u.coveredDays ? "kWh" : "",
    u.coveredDays ? `over ${days} day${days === 1 ? "" : "s"} between readings` : "needs two readings days apart",
    u.problems ? `${u.problems} stretch${u.problems === 1 ? "" : "es"} left out: see the table` : "from before/after top-up photos");
  kpi(1, "trending", "Average per day", u.perDay !== null ? kwh(u.perDay, 1) : "—", u.perDay !== null ? "kWh" : "",
    u.recentPerDay !== null && u.perDay !== null ? `latest stretch: ${kwh(u.recentPerDay, 1)} kWh a day` : "",
    u.perDay !== null ? `about ${kwh(u.perDay * 30, 0)} kWh a month` : "");
  const tops = u.topUps.filter((t) => t.at.getFullYear() === year);
  kpi(2, "plus", "Topped up", kwh(u.totalToppedUp, 0), "kWh",
    `${tops.length} top-up${tops.length === 1 ? "" : "s"} in ${year}`,
    tops.some((t) => t.inferred) ? `${tops.filter((t) => t.inferred).length} worked out from before/after photos` : "");
  kpi(3, "wallet", "Balance", u.balance ? kwh(u.balance.kwh, 1) : "—", u.balance ? "kWh" : "",
    u.balance ? `at the last photo, ${shortDate(u.balance.at)}` : "no balance photo yet",
    u.runsOut ? `at that rate, lasts until about ${shortDate(u.runsOut)}` : "");

  const top = ky + kh + 12;
  const bottom = H - M - 16;
  const leftW = 476;
  drawUsageChart(r, rep, u, M, top, leftW, bottom - top);
  drawPeriods(r, u, M + leftW + 12, top, W - M - (M + leftW + 12), bottom - top);
}

function drawUsageChart(r: Painter, rep: Report, u: MeterUsage, x: number, y: number, w: number, h: number) {
  r.card(x, y, w, h);
  r.text("kWh used per month", x + 16, y + 20, { size: 10.5, weight: "semibold" });
  r.icon("bars", x + w - 28, y + 13, 12, C.faint);
  r.text("Usage between two readings is spread over the days it covers. Green: kWh topped up that month.", x + 16, y + 33, {
    size: 7.5,
    color: C.muted,
    maxW: w - 50,
  });
  const px = x + 16;
  const pw = w - 32;
  const base = y + h - 34;
  const plotTop = y + 60;
  const values = u.months.map((m) => m.used);
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  const slot = pw / 12;
  const bw = Math.min(22, slot * 0.6);
  values.forEach((v, i) => {
    const cx = px + slot * i + slot / 2;
    const isNow = i + 1 === rep.currentMonth;
    const partial = v !== null && u.months[i].days < new Date(rep.year, i + 1, 0).getDate() - 0.5;
    if (v !== null && v > 0) {
      const bh = Math.max(1.5, (v / max) * (base - plotTop));
      r.doc.save();
      if (partial) r.doc.fillOpacity(0.55);
      r.doc.roundedRect(cx - bw / 2, base - bh, bw, bh, Math.min(3, bh / 2)).fill(isNow ? C.blue : C.bar);
      r.doc.restore();
      r.text(kwh(v, 0), cx, base - bh - 7, { size: 6.8, weight: "semibold", color: isNow ? C.blue : C.fg2, align: "center" });
    }
    r.text(MON[i], cx, base + 10, { size: 7, weight: isNow ? "bold" : "medium", color: isNow ? C.blue : v === null ? C.faint : C.muted, align: "center" });
    const t = u.months[i].toppedUp;
    if (t > 0) r.text(`+${kwh(t, 0)}`, cx, base + 21, { size: 6.5, weight: "semibold", color: C.greenText, align: "center" });
  });
  r.doc.moveTo(px, base + 0.5).lineTo(px + pw, base + 0.5).lineWidth(0.6).stroke(C.border);
  r.text("Lighter bars: only part of the month is covered by readings.", px, y + h - 9, { size: 6.5, color: C.faint });
}

function drawPeriods(r: Painter, u: MeterUsage, x: number, y: number, w: number, h: number) {
  r.card(x, y, w, h);
  const px = x + 16;
  const iw = w - 32;
  r.text("Between readings", px, y + 20, { size: 10.5, weight: "semibold" });
  r.icon("clock", x + w - 28, y + 13, 12, C.faint);
  r.text("Balance after one reading + top-ups − balance at the next", px, y + 33, { size: 7.5, color: C.muted, maxW: iw - 20 });

  const periods = u.periods.filter((p) => !p.short || p.problem);
  const cols = { from: px, days: px + iw - 118, used: px + iw - 54, per: px + iw };
  let cy = y + 52;
  r.text("FROM – TO", cols.from, cy, { size: 6.5, weight: "semibold", color: C.muted, spacing: 0.5 });
  r.text("DAYS", cols.days, cy, { size: 6.5, weight: "semibold", color: C.muted, spacing: 0.5, align: "right" });
  r.text("USED", cols.used, cy, { size: 6.5, weight: "semibold", color: C.muted, spacing: 0.5, align: "right" });
  r.text("PER DAY", cols.per, cy, { size: 6.5, weight: "semibold", color: C.muted, spacing: 0.5, align: "right" });
  cy += 7;
  r.doc.moveTo(px, cy).lineTo(px + iw, cy).lineWidth(0.6).stroke(C.border);
  cy += 10;
  if (periods.length === 0) {
    r.text(u.photos.length ? "Needs two balance readings a few days apart." : "No meter photos yet.", px, cy + 2, { size: 8, color: C.muted, maxW: iw });
    return;
  }
  const rowH = 14;
  const problemH = 10;
  const fits = (n: number) => cy + n <= y + h - 12;
  let shown = 0;
  for (const p of periods) {
    const need = rowH + (p.problem ? problemH : 0);
    if (!fits(need + rowH)) break;
    const range = `${shortDate(p.from)} – ${shortDate(p.to)}${p.estimated ? " *" : ""}`;
    r.text(range, cols.from, cy, { size: 7.8, color: C.fg2, maxW: cols.days - cols.from - 40 });
    r.text(p.days >= 1 ? `${Math.round(p.days)}` : `${(p.days * 24).toFixed(1)} h`, cols.days, cy, { size: 7.8, color: C.muted, align: "right" });
    r.text(p.used === null ? "?" : kwh(p.used, 1), cols.used, cy, { size: 7.8, weight: "semibold", color: p.used === null ? C.roseText : C.fg, align: "right" });
    r.text(p.perDay === null ? "—" : kwh(p.perDay, 1), cols.per, cy, { size: 7.8, color: C.muted, align: "right" });
    cy += p.problem ? problemH : 0;
    if (p.problem) r.text(p.problem, cols.from, cy, { size: 6.8, color: C.roseText, maxW: iw });
    cy += 4;
    r.doc.moveTo(px, cy + 3).lineTo(px + iw, cy + 3).lineWidth(0.5).stroke(C.line);
    cy += rowH - 4;
    shown++;
  }
  if (shown < periods.length) r.text(`+${periods.length - shown} more`, px, cy, { size: 7.2, color: C.muted });
  else if (periods.some((p) => p.estimated)) r.text("* date estimated: the photo has no capture time", px, cy, { size: 6.8, color: C.faint });
}

function drawReadingsPage(r: Painter, rep: Report, e: Electricity, u: MeterUsage, rows: MeterUsage["photos"], cont: boolean) {
  const tw = r.text(`${u.meter} readings`, M, M + 8, { size: 15, weight: "bold" });
  r.text(cont ? `${rep.year} · continued` : `${rep.year}`, M + tw + 7, M + 9, { size: 11, weight: "medium", color: C.faint });
  const note = e.blocked && u.unread
    ? e.blocked
    : "Times come from each photo's capture date. To correct a reading, use the settings window or edit personal-file-map.readings.json.";
  r.text(note, M, M + 25, { size: 7.2, color: e.blocked && u.unread ? C.amberText : C.muted, maxW: TW - 260 });
  const ai = aiTotals(u.photos.map((p) => p.reading));
  if (ai.photos) {
    const cost = ai.unpriced === ai.photos ? "cost unknown" : `about ${usd(ai.costUsd)}${ai.unpriced ? ` + ${ai.unpriced} unpriced` : ""}`;
    r.text(`AI reading: ${ai.photos} photo${ai.photos === 1 ? "" : "s"} · ${tok(ai.usage.input + ai.usage.cacheRead + ai.usage.cacheWrite)} tokens in · ${tok(ai.usage.output)} out · ${cost}`,
      W - M, M + 25, { size: 7.2, color: C.muted, align: "right" });
  }

  const d = r.doc;
  const top = TABLE_TOP;
  const tableH = HEAD_H + rows.length * READING_ROW_H;
  const col = { taken: M + 14, photo: M + 96, kind: M + 350, code: M + 404, kwh: M + 484, by: M + 500, cost: M + TW - 14 };
  d.save();
  d.roundedRect(M, top, TW, tableH, 9).clip();
  d.rect(M, top, TW, HEAD_H).fill(C.subtle);
  const hy = top + HEAD_H / 2;
  const head = (s: string, hx: number, align: "left" | "right" = "left") =>
    r.text(s, hx, hy, { size: 6.8, weight: "semibold", color: C.muted, spacing: 0.6, align });
  head("TAKEN", col.taken);
  head("PHOTO", col.photo);
  head("SHOWS", col.kind);
  head("CODE", col.code);
  head("KWH", col.kwh, "right");
  head("READ BY", col.by);
  head("TOKENS IN / OUT / CACHE · USD", col.cost, "right");
  d.moveTo(M, top + HEAD_H).lineTo(M + TW, top + HEAD_H).lineWidth(0.75).stroke(C.border);

  let y = top + HEAD_H;
  for (const p of rows) {
    const cy = y + READING_ROW_H / 2;
    const rd = p.reading;
    r.text(`${shortDate(p.takenAt)} ${hhmm(p.takenAt)}${p.dateSource === "month" ? " *" : ""}`, col.taken, cy, {
      size: 7.5,
      color: p.dateSource === "photo" ? C.fg2 : C.muted,
    });
    r.text(p.file, col.photo, cy, { size: 7.5, color: C.fg2, maxW: col.kind - col.photo - 12 });
    if (!rd) {
      r.pill("Not read", col.kind, cy, { fg: C.amberText, bg: C.amberBg, size: 6.6, h: 11.5 });
    } else {
      const label = rd.kind === "balance" ? "Balance" : rd.kind === "topup" ? "Top-up" : "Ignored";
      const tone = rd.kind === "topup" ? { fg: C.greenText, bg: C.greenBg } : { fg: C.muted, bg: C.mutedBg };
      r.pill(label, col.kind, cy, { ...tone, size: 6.6, h: 11.5 });
      if (rd.code) r.text(rd.code, col.code, cy, { size: 7.5, color: C.muted });
      if (rd.kind !== "other") r.text(kwh(rd.kwh, 2), col.kwh, cy, { size: 7.8, weight: "semibold", align: "right" });
      const by = rd.edited ? "corrected by hand" : rd.by.split("/").pop() ?? rd.by;
      const flag = !rd.edited && rd.confidence !== "high" ? ` · ${rd.confidence} confidence` : "";
      const extra = rd.note ? ` · ${rd.note}` : "";
      r.text(by + flag + extra, col.by, cy, { size: 7.2, color: flag ? C.amberText : C.muted, maxW: col.cost - 150 - col.by });
      if (rd.usage) {
        const u2 = rd.usage;
        const cost = typeof rd.costUsd === "number" ? usd(rd.costUsd) : "?";
        r.text(`${tok(u2.input)} / ${tok(u2.output)} / ${tok(u2.cacheRead + u2.cacheWrite)} · ${cost}`, col.cost, cy, { size: 7.2, color: C.muted, align: "right" });
      }
    }
    d.moveTo(M, y + READING_ROW_H).lineTo(M + TW, y + READING_ROW_H).lineWidth(0.5).stroke(C.line);
    y += READING_ROW_H;
  }
  d.restore();
  d.lineWidth(0.75).roundedRect(M, top, TW, tableH, 9).stroke(C.border);
}

function kwh(n: number, digits: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function shortDate(d: Date): string {
  return `${d.getDate()} ${MON[d.getMonth()]}`;
}
function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function tok(n: number): string {
  return n.toLocaleString("en-US");
}
