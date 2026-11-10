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
      b.cells.forEach((state, i) => {
        const cx = monthX + COL.month * i + COL.month / 2;
        r.glyph(state, cx, cy);
        // Two or more payments/top-ups that month (e.g. "Klaska PLN 01 …" and "Klaska PLN 02 …")
        if (b.transactions[i] > 1) r.text(`${b.transactions[i]}`, cx + 6.2, cy - 4.2, { size: 5.6, weight: "bold", color: C.greenText });
      });
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

// ── Electricity: per meter an overview (monthly usage, how often you top up), the top-ups, the readings ──
function drawElectricityPages(r: Painter, rep: Report, e: Electricity, newPage: () => void) {
  for (const u of e.usages) {
    newPage();
    drawMeterOverview(r, rep, e, u);

    const rows = topUpRows(u);
    const perPage = Math.floor((READINGS_BOTTOM - TABLE_TOP - HEAD_H) / TOPUP_ROW_H);
    for (let i = 0; i < Math.max(rows.length, 1); i += perPage) {
      newPage();
      drawTopUpsPage(r, rep, u, rows.slice(i, i + perPage), i > 0, i + perPage >= rows.length);
    }

    const photos = u.photos;
    const perReadings = Math.floor((READINGS_BOTTOM - TABLE_TOP - HEAD_H) / READING_ROW_H);
    for (let i = 0; i < photos.length; i += perReadings) {
      newPage();
      drawReadingsPage(r, rep, e, u, photos.slice(i, i + perReadings), i > 0);
    }
  }
}

const READING_ROW_H = 15;
const TOPUP_ROW_H = 19;
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
  r.text(sub.join("  ·  "), M, M + 50, { size: 8.5, color: C.muted, maxW: TW - 220 });

  let x = W - M;
  const problems = u.problems + u.events.filter((ev) => ev.problem).length;
  if (u.unread) x -= r.pill(`${u.unread} photo${u.unread === 1 ? "" : "s"} not read`, x, M + 24, { fg: C.amberText, bg: C.amberBg, size: 8, h: 18, align: "right" }) + 6;
  if (problems) r.pill(`${problems} to check`, x, M + 24, { ...roseTone(), size: 8, h: 18 });
  if (!u.unread && !problems) r.pill("All photos read", W - M, M + 24, { ...greenTone("right"), size: 8, h: 18 });

  // KPI cards
  const ky = M + 68;
  const kh = 74;
  const gap = 12;
  const kw = (TW - 3 * gap) / 4;
  const kpi = (i: number, icon: keyof typeof ICONS, label: string, value: string, unit: string, line1: string, line2: string) => {
    const kx = M + i * (kw + gap);
    r.card(kx, ky, kw, kh);
    r.text(label, kx + 14, ky + 15, { size: 8, weight: "medium", color: C.muted });
    r.icon(icon, kx + kw - 26, ky + 9, 12, C.faint);
    const vw = r.text(value, kx + 14, ky + 38, { size: 21, weight: "semibold" });
    if (unit) r.text(` ${unit}`, kx + 14 + vw, ky + 40, { size: 11, weight: "medium", color: C.faint });
    r.text(line1, kx + 14, ky + 54, { size: 7.5, color: C.muted, maxW: kw - 28 });
    r.text(line2, kx + 14, ky + 65, { size: 7.5, color: C.faint, maxW: kw - 28 });
  };
  const f = u.frequency;
  const days = Math.round(u.coveredDays);
  kpi(0, "zap", `Used in ${year}`, u.coveredDays ? kwh(u.totalUsed, 0) : "—", u.coveredDays ? "kWh" : "",
    u.coveredDays ? `measured over ${days} day${days === 1 ? "" : "s"}` : "needs two readings days apart",
    u.perDay !== null ? `about ${kwh(u.perDay * 30.44, 0)} kWh a month` : "");
  kpi(1, "trending", "Average per day", u.perDay !== null ? kwh(u.perDay, 1) : "—", u.perDay !== null ? "kWh" : "",
    u.recentPerDay !== null && u.perDay !== null ? `lately ${kwh(u.recentPerDay, 1)} kWh a day` : "", "");
  kpi(2, "plus", `Top-ups in ${year}`, `${f.count}`, "",
    f.avgDays !== null ? `about every ${Math.round(f.avgDays)} days` : f.count ? "one so far" : "none yet",
    f.count ? `${kwh(u.totalToppedUp, 0)} kWh in total` : "");
  kpi(3, "wallet", "Balance", u.balance ? kwh(u.balance.kwh, 1) : "—", u.balance ? "kWh" : "",
    u.balance ? `at the last photo, ${shortDate(u.balance.at)}` : "no balance photo yet",
    u.runsOut ? `runs out about ${shortDate(u.runsOut)}` : "");

  const top = ky + kh + 12;
  const bottom = H - M - 16;
  const leftW = 486;
  drawMonthlyTable(r, rep, u, M, top, leftW, bottom - top);
  drawFrequency(r, rep, u, M + leftW + 12, top, W - M - (M + leftW + 12), bottom - top);
}

/** kWh used per month: measured, per day, days covered, the whole month estimated, topped up. */
function drawMonthlyTable(r: Painter, rep: Report, u: MeterUsage, x: number, y: number, w: number, h: number) {
  r.card(x, y, w, h);
  const px = x + 16;
  const iw = w - 32;
  r.text("kWh used per month", px, y + 19, { size: 10.5, weight: "semibold" });
  r.icon("bars", x + w - 28, y + 12, 12, C.faint);

  const lastMonth = rep.currentMonth >= 1 && rep.currentMonth <= 12 ? rep.currentMonth : 12;
  const active = u.months.map((m, i) => (m.used !== null || m.topUps > 0 ? i : -1)).filter((i) => i >= 0);
  if (active.length === 0) {
    r.text("Needs two balance readings a few days apart.", px, y + 44, { size: 8, color: C.muted });
    return;
  }
  const from = active[0];
  const to = Math.max(active[active.length - 1], Math.min(lastMonth - 1, 11));
  const months = Array.from({ length: to - from + 1 }, (_, k) => from + k);

  // Columns: right edges for numbers
  const col = { month: px, used: px + 88, bar: px + 96, perDay: px + 222, days: px + 290, full: px + 352, topped: px + 402, n: px + iw };
  const head = (s: string, hx: number, align: "left" | "right" = "right") =>
    r.text(s, hx, y + 40, { size: 6.4, weight: "semibold", color: C.muted, spacing: 0.4, align });
  head("MONTH", col.month, "left");
  head("USED", col.used);
  head("PER DAY", col.perDay);
  head("DAYS MEASURED", col.days);
  head("FULL MONTH*", col.full);
  head("TOPPED UP", col.topped);
  head("TOP-UPS", col.n);
  r.doc.moveTo(px, y + 47).lineTo(px + iw, y + 47).lineWidth(0.6).stroke(C.border);

  const rowH = Math.min(18, (h - 100) / (months.length + 1));
  const max = Math.max(1, ...months.map((m) => u.months[m].fullMonth ?? u.months[m].used ?? 0));
  let cy = y + 47 + rowH / 2;
  let totUsed = 0;
  let totDays = 0;
  let totTop = 0;
  let totN = 0;
  for (const m of months) {
    const mu = u.months[m];
    const isNow = m + 1 === rep.currentMonth;
    const inMonth = new Date(rep.year, m + 1, 0).getDate();
    r.text(MONTHS[m], col.month, cy, { size: 8, weight: isNow ? "semibold" : "regular", color: isNow ? C.blue : C.fg2 });
    if (mu.used !== null) {
      r.text(kwh(mu.used, 0), col.used, cy, { size: 8, weight: "semibold", align: "right" });
      const bw = (96 * mu.used) / max;
      const full = mu.fullMonth !== null ? (96 * mu.fullMonth) / max : bw;
      if (full > bw) r.doc.roundedRect(col.bar, cy - 3, full, 6, 2).fill(C.mutedBg);
      if (bw > 0) r.doc.roundedRect(col.bar, cy - 3, Math.max(bw, 2), 6, 2).fill(isNow ? C.blue : C.bar);
      r.text(kwh(mu.used / Math.max(mu.days, 1e-9), 1), col.perDay, cy, { size: 8, color: C.muted, align: "right" });
      const partial = mu.days < inMonth - 0.5;
      r.text(`${Math.round(mu.days)}${partial ? ` of ${inMonth}` : ""}`, col.days, cy, { size: 8, color: partial ? C.amberText : C.muted, align: "right" });
      r.text(mu.fullMonth !== null ? `~${kwh(mu.fullMonth, 0)}` : "", col.full, cy, { size: 8, color: C.muted, align: "right" });
      totUsed += mu.used;
      totDays += mu.days;
    } else {
      r.text("no readings", col.used, cy, { size: 7.5, color: C.faint, align: "right" });
    }
    r.text(mu.toppedUp ? kwh(mu.toppedUp, 0) : "—", col.topped, cy, { size: 8, color: mu.toppedUp ? C.greenText : C.faint, align: "right" });
    r.text(mu.topUps ? `${mu.topUps}` : "—", col.n, cy, { size: 8, weight: mu.topUps > 1 ? "semibold" : "regular", color: mu.topUps ? C.fg2 : C.faint, align: "right" });
    totTop += mu.toppedUp;
    totN += mu.topUps;
    r.doc.moveTo(px, cy + rowH / 2).lineTo(px + iw, cy + rowH / 2).lineWidth(0.4).stroke(C.line);
    cy += rowH;
  }
  // Total
  r.doc.moveTo(px, cy - rowH / 2).lineTo(px + iw, cy - rowH / 2).lineWidth(0.6).stroke(C.border);
  r.text("Total", col.month, cy, { size: 8, weight: "semibold" });
  r.text(kwh(totUsed, 0), col.used, cy, { size: 8, weight: "bold", align: "right" });
  if (totDays >= 1) r.text(kwh(totUsed / totDays, 1), col.perDay, cy, { size: 8, weight: "semibold", color: C.fg2, align: "right" });
  r.text(`${Math.round(totDays)}`, col.days, cy, { size: 8, color: C.muted, align: "right" });
  r.text(kwh(totTop, 0), col.topped, cy, { size: 8, weight: "semibold", color: C.greenText, align: "right" });
  r.text(`${totN}`, col.n, cy, { size: 8, weight: "semibold", align: "right" });

  r.text(
    "Usage between two readings is spread over the days it covers. Days measured: days of the month between readings (amber: part of the month).",
    px, y + h - 22, { size: 6.6, color: C.faint, maxW: iw }
  );
  r.text("* Full month: the measured daily rate over the whole month, for months only partly covered.", px, y + h - 12, { size: 6.6, color: C.faint, maxW: iw });
}

/** How often the meter is topped up: interval, amount, last and next, and a timeline of the year. */
function drawFrequency(r: Painter, rep: Report, u: MeterUsage, x: number, y: number, w: number, h: number) {
  r.card(x, y, w, h);
  const px = x + 16;
  const iw = w - 32;
  r.text("How often you top up", px, y + 19, { size: 10.5, weight: "semibold" });
  r.icon("clock", x + w - 28, y + 12, 12, C.faint);
  const f = u.frequency;
  if (f.count === 0) {
    r.text("No top-up found yet: add photos before and after a top-up.", px, y + 44, { size: 8, color: C.muted, maxW: iw });
    return;
  }
  const today = rep.generatedAt;
  const items: [string, string, string?][] = [];
  items.push([`Top-ups in ${rep.year}`, `${f.count}`]);
  if (f.avgDays !== null) {
    items.push(["Usually every", `${Math.round(f.avgDays)} days`, f.minDays !== null && f.maxDays !== null && Math.round(f.minDays) !== Math.round(f.maxDays) ? `${Math.round(f.minDays)} to ${Math.round(f.maxDays)} days apart` : undefined]);
    items.push(["That's about", `${kwh(f.perMonth ?? 0, 1)} top-up${(f.perMonth ?? 0) >= 1.05 ? "s" : ""} a month`]);
  }
  if (f.avgAmount !== null) items.push(["Usual amount", `${kwh(f.avgAmount, 0)} kWh`, "average per top-up"]);
  if (f.last) items.push(["Last top-up", `${shortDate(f.last.at)} · ${kwh(f.last.amount, 0)} kWh`, `${Math.round((today.getTime() - f.last.at.getTime()) / 86_400_000)} days ago`]);
  if (f.nextAround) {
    const late = Math.round((today.getTime() - f.nextAround.getTime()) / 86_400_000);
    items.push(["Next one, going by the usual gap", `around ${shortDate(f.nextAround)}`, late > 0 ? `${late} days later than usual already` : undefined]);
  }
  if (u.runsOut && u.balance) items.push(["Credit runs out", `about ${shortDate(u.runsOut)}`, `${kwh(u.balance.kwh, 1)} kWh left on ${shortDate(u.balance.at)}`]);

  let cy = y + 42;
  for (const [label, value, note] of items) {
    r.text(label, px, cy, { size: 7.8, color: C.muted, maxW: iw * 0.55 });
    r.text(value, px + iw, cy, { size: 8.2, weight: "semibold", color: C.fg, align: "right" });
    if (note) {
      cy += 10;
      r.text(note, px + iw, cy, { size: 6.8, color: note.includes("later") ? C.amberText : C.faint, align: "right" });
    }
    cy += 7;
    r.doc.moveTo(px, cy).lineTo(px + iw, cy).lineWidth(0.4).stroke(C.line);
    cy += 10;
  }

  // Timeline: one mark per top-up across the year
  const ty = y + h - 30;
  if (ty - cy < 26) return;
  r.text(`TOP-UPS IN ${rep.year}`, px, ty - 22, { size: 6.4, weight: "semibold", color: C.muted, spacing: 0.4 });
  r.doc.moveTo(px, ty).lineTo(px + iw, ty).lineWidth(0.8).stroke(C.border);
  const start = new Date(rep.year, 0, 1).getTime();
  const span = new Date(rep.year + 1, 0, 1).getTime() - start;
  for (let m = 0; m < 12; m++) {
    const mx = px + (iw * (new Date(rep.year, m, 1).getTime() - start)) / span;
    r.doc.moveTo(mx, ty - 2).lineTo(mx, ty + 2).lineWidth(0.6).stroke(C.border);
    r.text(MON[m][0], mx + (iw / 12) / 2, ty + 9, { size: 6, color: C.faint, align: "center" });
  }
  for (const ev of u.events) {
    if (ev.at.getFullYear() !== rep.year) continue;
    const ex = px + (iw * (ev.at.getTime() - start)) / span;
    r.doc.circle(ex, ty, 3.4).fill(ev.problem ? C.rose : C.green);
  }
}

interface TopUpRow {
  kind: "topup" | "now";
  n: number;
  at: Date;
  sincePrevDays: number | null;
  before: number | null;
  amount: number | null;
  amountInferred: boolean;
  after: number | null;
  afterDerived: boolean;
  used: number | null;
  perDay: number | null;
  note: string;
  problem: boolean;
}

/** One row per top-up (before, added, after merged), plus where things stand at the latest photo. */
function topUpRows(u: MeterUsage): TopUpRow[] {
  const rows: TopUpRow[] = u.events.map((ev, i) => {
    const notes: string[] = [];
    if (ev.problem) notes.push(ev.problem);
    if (ev.amountInferred) notes.push("no photo of the amount: after − before");
    if (!ev.after && ev.before) notes.push("no after photo: before + top-up");
    if (!ev.before) notes.push("no before photo");
    if (ev.estimated) notes.push("date estimated");
    return {
      kind: "topup",
      n: i + 1,
      at: ev.at,
      sincePrevDays: ev.sincePrevDays,
      before: ev.before?.kwh ?? null,
      amount: ev.amount,
      amountInferred: ev.amountInferred,
      after: ev.after?.kwh ?? (ev.before ? ev.before.kwh + ev.amount : null),
      afterDerived: !ev.after && Boolean(ev.before),
      used: ev.usedSincePrev,
      perDay: ev.perDay,
      note: notes.join(" · "),
      problem: Boolean(ev.problem),
    };
  });
  // Since the last top-up, up to the latest balance photo
  const last = u.events[u.events.length - 1];
  if (last && u.balance && u.balance.at.getTime() - last.at.getTime() > 6 * 3_600_000) {
    const start = last.after ?? (last.before ? { kwh: last.before.kwh + last.amount, at: last.at } : null);
    const used = start ? start.kwh - u.balance.kwh : null;
    const days = start ? (u.balance.at.getTime() - start.at.getTime()) / 86_400_000 : 0;
    rows.push({
      kind: "now",
      n: 0,
      at: u.balance.at,
      sincePrevDays: (u.balance.at.getTime() - last.at.getTime()) / 86_400_000,
      before: u.balance.kwh,
      amount: null,
      amountInferred: false,
      after: null,
      afterDerived: false,
      used: used !== null && used >= -0.5 ? Math.max(0, used) : null,
      perDay: used !== null && used >= 0 && days >= 0.5 ? used / days : null,
      note: "latest photo: credit left, no top-up yet",
      problem: false,
    });
  }
  return rows;
}

function drawTopUpsPage(r: Painter, rep: Report, u: MeterUsage, rows: TopUpRow[], cont: boolean, isLast: boolean) {
  const tw = r.text(`${u.meter} top-ups`, M, M + 8, { size: 15, weight: "bold" });
  r.text(cont ? `${rep.year} · continued` : `${rep.year}`, M + tw + 7, M + 9, { size: 11, weight: "medium", color: C.faint });
  r.text(
    "Each top-up on one row: the credit just before, the kWh added and the credit just after. Used since last top-up = credit after the previous top-up − credit before this one.",
    M, M + 25, { size: 7.2, color: C.muted, maxW: TW }
  );
  if (rows.length === 0) {
    r.text("No top-ups found yet. Add photos of the meter before and after a top-up (and of the amount added).", M, TABLE_TOP + 14, { size: 9, color: C.muted });
    return;
  }

  const d = r.doc;
  const top = TABLE_TOP;
  const tableH = HEAD_H + rows.length * TOPUP_ROW_H;
  // x positions: text columns left-aligned, numbers right-aligned at the given edge
  const col = { n: M + 14, date: M + 36, since: M + 180, before: M + 262, added: M + 340, after: M + 418, used: M + 530, perDay: M + 600, note: M + 620 };
  d.save();
  d.roundedRect(M, top, TW, tableH, 9).clip();
  d.rect(M, top, TW, HEAD_H).fill(C.subtle);
  const hy = top + HEAD_H / 2;
  const head = (s: string, hx: number, align: "left" | "right" = "right", s2?: string) => {
    r.text(s, hx, s2 ? hy - 4 : hy, { size: 6.6, weight: "semibold", color: C.muted, spacing: 0.4, align });
    if (s2) r.text(s2, hx, hy + 5, { size: 6.6, weight: "semibold", color: C.muted, spacing: 0.4, align });
  };
  head("#", col.n, "left");
  head("TOP-UP DATE", col.date, "left");
  head("DAYS SINCE", col.since, "right", "LAST TOP-UP");
  head("BEFORE", col.before, "right", "KWH");
  head("TOPPED UP", col.added, "right", "KWH");
  head("AFTER", col.after, "right", "KWH");
  head("USED SINCE", col.used, "right", "LAST TOP-UP");
  head("PER DAY", col.perDay, "right", "KWH");
  head("NOTES", col.note, "left");
  d.moveTo(M, top + HEAD_H).lineTo(M + TW, top + HEAD_H).lineWidth(0.75).stroke(C.border);

  let y = top + HEAD_H;
  for (const row of rows) {
    const cy = y + TOPUP_ROW_H / 2;
    if (row.kind === "now") d.rect(M, y, TW, TOPUP_ROW_H).fill(C.subtle);
    const dim = row.kind === "now";
    r.text(row.kind === "now" ? "" : `${row.n}`, col.n, cy, { size: 7.8, color: C.faint });
    r.text(row.kind === "now" ? `Now (${shortDate(row.at)})` : `${DAYS[row.at.getDay()]} ${shortDate(row.at)}`, col.date, cy, { size: 8, weight: "medium", color: dim ? C.muted : C.fg2 });
    r.text(row.sincePrevDays === null ? "—" : `${Math.round(row.sincePrevDays)}`, col.since, cy, { size: 8, weight: "semibold", color: row.sincePrevDays === null ? C.faint : C.fg, align: "right" });
    r.text(row.before === null ? "—" : kwh(row.before, 2), col.before, cy, { size: 8, color: row.before === null ? C.faint : C.fg2, align: "right" });
    if (row.amount !== null) {
      r.text(`+${kwh(row.amount, 2)}${row.amountInferred ? "*" : ""}`, col.added, cy, { size: 8, weight: "semibold", color: C.greenText, align: "right" });
    }
    if (row.after !== null) r.text(`${kwh(row.after, 2)}${row.afterDerived ? "*" : ""}`, col.after, cy, { size: 8, color: C.fg2, align: "right" });
    r.text(row.used === null ? "—" : kwh(row.used, 1), col.used, cy, { size: 8, weight: "semibold", color: row.used === null ? C.faint : C.fg, align: "right" });
    r.text(row.perDay === null ? "—" : kwh(row.perDay, 1), col.perDay, cy, { size: 8, color: C.muted, align: "right" });
    r.text(row.note, col.note, cy, { size: 7, color: row.problem ? C.roseText : C.muted, maxW: M + TW - col.note - 12 });
    d.moveTo(M, y + TOPUP_ROW_H).lineTo(M + TW, y + TOPUP_ROW_H).lineWidth(0.5).stroke(C.line);
    y += TOPUP_ROW_H;
  }
  d.restore();
  d.lineWidth(0.75).roundedRect(M, top, TW, tableH, 9).stroke(C.border);
  if (isLast && rows.some((x) => x.amountInferred || x.afterDerived)) {
    r.text("* worked out from the other photos of that top-up (see notes)", M, top + tableH + 12, { size: 6.8, color: C.faint });
  }
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
