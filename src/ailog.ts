import * as fs from "fs";
import * as path from "path";
import { PAYMENT_INSTRUCTIONS, PRICES_CHECKED, PROVIDERS, type Exchange, type PaymentOutcome, type ReadOutcome, type Usage } from "./reader";

/**
 * One Markdown file per AI request in ./logs next to the app: what was asked, what came back, tokens and
 * cost. Readable as plain text or rendered. The image is described, not included; the API key is never
 * part of the request body, so it can't end up here.
 */
export const LOGS_FOLDER = "logs";

export interface LogPhoto {
  file: string;
  bytes: number;
  sha1: string;
  sent: { width: number; height: number; bytes: number } | null;
}

export function writeAiLog(logDir: string, photo: LogPhoto, exchange: Exchange, outcome: ReadOutcome | PaymentOutcome | null): string | null {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const t = exchange.startedAt;
    const p = (v: number, w = 2) => String(v).padStart(w, "0");
    const stamp =
      `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ` +
      `${p(t.getHours())}-${p(t.getMinutes())}-${p(t.getSeconds())}-${p(t.getMilliseconds(), 3)}`;
    const safe = photo.file.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_"); // also valid on Windows
    const file = path.join(logDir, `${stamp} ${exchange.provider} ${safe}.md`);
    fs.writeFileSync(file, render(photo, exchange, outcome));
    return file;
  } catch {
    return null; // a log that can't be written never stops the reading
  }
}

function render(photo: LogPhoto, x: Exchange, o: ReadOutcome | PaymentOutcome | null): string {
  const provider = PROVIDERS.find((p) => p.id === x.provider)?.label ?? x.provider;
  const isPayment = (x.request as { system?: unknown; instructions?: unknown } | null)?.system === PAYMENT_INSTRUCTIONS ||
    (x.request as { instructions?: unknown } | null)?.instructions === PAYMENT_INSTRUCTIONS;
  const r = o && "reading" in o ? o.reading : null;
  const pay = o && "payment" in o ? o.payment : null;
  const result = x.error
    ? `**Failed:** ${x.error}`
    : pay
      ? (pay.paidAt ? `Paid **${pay.paidAt}**` : "No payment date found") +
        (pay.kwh ? ` · **${pay.kwh.toFixed(2)} kWh** bought` : "") +
        (pay.amount ? ` · ${[pay.currency, pay.amount.toLocaleString("en-US")].filter(Boolean).join(" ")}` : "") +
        ` · ${pay.confidence} confidence` +
        (pay.note ? ` · note: ${pay.note}` : "")
    : r
      ? `${r.kind === "balance" ? "Balance (credit left)" : r.kind === "topup" ? "Top-up (kWh added)" : "Other / unreadable"}` +
        (r.kind !== "other" ? ` · **${r.kwh.toFixed(2)} kWh**` : "") +
        (r.code ? ` · display code ${r.code}` : "") +
        ` · ${r.confidence} confidence` +
        (r.note ? ` · note: ${r.note}` : "")
      : "-";
  const rows: [string, string][] = [
    ["Photo", `\`${photo.file}\``],
    ["When", `${x.startedAt.toString().replace(/ \(.*\)$/, "")} (took ${(x.durationMs / 1000).toFixed(1)} s)`],
    ["Provider", provider],
    ["Model", `\`${x.model}\``],
    ["Result", result],
  ];
  if (o?.adjusted.length) rows.push(["Checked by the app", o.adjusted.join("; ")]);
  if (o?.usage) rows.push(["Tokens", tokens(o.usage)]);
  if (o) {
    rows.push([
      "Cost",
      o.costUsd === null ? `unknown (the app has no price for \`${x.model}\`)` : `≈ ${usd(o.costUsd)} (prices checked ${PRICES_CHECKED})`,
    ]);
  }
  rows.push([
    "Image sent",
    photo.sent
      ? `${photo.sent.width}×${photo.sent.height} JPEG, ${kb(photo.sent.bytes)} (original ${kb(photo.bytes)}, SHA-1 \`${photo.sha1.slice(0, 12)}…\`)`
      : `not sent (original ${kb(photo.bytes)})`,
  ]);

  const out = [
    `# ${isPayment ? "Payment date reading" : "Meter photo reading"}: ${photo.file}`,
    "",
    "| | |",
    "|---|---|",
    ...rows.map(([k, v]) => `| ${k} | ${v.replace(/\|/g, "\\|")} |`),
    "",
  ];
  const instructions = extractInstructions(x.request);
  if (instructions) out.push("## Instructions sent (system prompt)", "", "```text", instructions, "```", "");
  out.push(
    "## Request",
    "",
    "The image data is replaced by a description. The API key is sent in a header and isn't logged.",
    "",
    "```json",
    json(withoutInstructions(x.request)),
    "```",
    ""
  );
  out.push("## Response", "", "```json", json(x.response), "```", "");
  return out.join("\n");
}

const tokens = (u: Usage) => `${num(u.input)} in · ${num(u.output)} out · ${num(u.cacheRead)} cache read · ${num(u.cacheWrite)} cache write`;
const num = (v: number) => v.toLocaleString("en-US");
const kb = (b: number) => `${(b / 1024).toFixed(0)} KB`;
/** Small amounts with two significant digits ($0.00033), larger ones in cents. */
export const usd = (v: number) => `$${v < 0.01 ? v.toPrecision(2) : v.toFixed(2)}`;

function extractInstructions(req: unknown): string | null {
  const r = req as { system?: unknown; instructions?: unknown } | null;
  const v = r?.system ?? r?.instructions;
  return typeof v === "string" ? v : null;
}

function withoutInstructions(req: unknown): unknown {
  if (!req || typeof req !== "object") return req;
  const copy: Record<string, unknown> = { ...(req as Record<string, unknown>) };
  if (typeof copy.system === "string") copy.system = "<see Instructions above>";
  if (typeof copy.instructions === "string") copy.instructions = "<see Instructions above>";
  return copy;
}

function json(v: unknown): string {
  try {
    return JSON.stringify(v ?? null, null, 2);
  } catch {
    return String(v);
  }
}
