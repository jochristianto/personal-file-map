import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { matchKey } from "./config";
import { writeAiLog, type LogPhoto } from "./ailog";
import { captureDate, preparePhoto } from "./photo";
import {
  defaultModel,
  effectiveKey,
  isProvider,
  PROVIDERS,
  readPhoto,
  ReaderError,
  type ApiKeys,
  type PhotoReading,
  type ProviderId,
  type Usage,
} from "./reader";
import type { BillFile } from "./types";
import { meterUsage, type MeterUsage } from "./usage";

/**
 * Electricity meters: bills whose photos show a prepaid kWh meter. Each photo's kWh is read once (by the
 * AI reader the user picked, or typed in by hand) and kept in personal-file-map.readings.json in the bills
 * folder, so a photo is never sent twice and corrections stick.
 */

/** "meters" in config.local.json. */
export interface MeterSettings {
  /** Bill keys whose photos are meter photos; each key is one meter (e.g. "Klaska PLN"). */
  bills: string[];
  reader: "off" | ProviderId;
  /** Model per provider, so switching back and forth keeps each choice. */
  models: Partial<Record<ProviderId, string>>;
  /** API key per provider. Never sent to the settings window, only whether one is set. */
  apiKeys: ApiKeys;
}

export const DEFAULT_METERS: MeterSettings = { bills: [], reader: "off", models: {}, apiKeys: {} };

export const READINGS_NAME = "personal-file-map.readings.json";
const PHOTO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "heic"]);

/** Checks "meters" from a config file; throws a readable error if it's malformed. */
export function validateMeters(raw: unknown, source: string): MeterSettings {
  if (raw === undefined || raw === null) return { ...DEFAULT_METERS, models: {}, apiKeys: {} };
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error(`"meters" in ${source} must be an object`);
  const { bills, reader, models, apiKeys } = raw as { bills?: unknown; reader?: unknown; models?: unknown; apiKeys?: unknown };
  if (bills !== undefined && (!Array.isArray(bills) || !bills.every((b) => typeof b === "string"))) {
    throw new Error(`"meters.bills" in ${source} must be a list of bill names, e.g. ["Klaska PLN"]`);
  }
  if (reader !== undefined && reader !== "off" && !isProvider(reader)) {
    throw new Error(`"meters.reader" in ${source} must be "off", ${PROVIDERS.map((p) => `"${p.id}"`).join(" or ")}`);
  }
  const m: Partial<Record<ProviderId, string>> = {};
  if (models !== undefined) {
    if (!models || typeof models !== "object" || Array.isArray(models)) throw new Error(`"meters.models" in ${source} must be an object`);
    for (const [k, v] of Object.entries(models)) if (isProvider(k) && typeof v === "string" && v.trim()) m[k] = v.trim();
  }
  const keys: ApiKeys = {};
  if (apiKeys !== undefined) {
    if (!apiKeys || typeof apiKeys !== "object" || Array.isArray(apiKeys)) throw new Error(`"meters.apiKeys" in ${source} must be an object`);
    for (const [k, v] of Object.entries(apiKeys)) if (isProvider(k) && typeof v === "string" && v.trim()) keys[k] = v.trim();
  }
  return {
    bills: (bills as string[] | undefined)?.map((b) => b.trim()).filter(Boolean) ?? [],
    reader: (reader as MeterSettings["reader"]) ?? "off",
    models: m,
    apiKeys: keys,
  };
}

export const modelFor = (s: MeterSettings, p: ProviderId) => s.models[p] || defaultModel(p);

// ── The readings file ────────────────────────────────────────────────────────

export interface StoredReading extends PhotoReading {
  /** SHA-1 of the photo: a changed photo is read again, a renamed one isn't. */
  sha1: string;
  /** "anthropic/claude-haiku-5-5", or "you" for a value typed in. */
  by: string;
  at: string;
  edited?: boolean;
  /** Tokens the AI reading used, and its cost in USD (null: price unknown). Kept when you correct the value. */
  usage?: Usage | null;
  costUsd?: number | null;
}

/** Tokens and USD for a set of AI readings. */
export interface AiTotals {
  photos: number;
  usage: Usage;
  costUsd: number;
  /** Readings whose cost isn't known (model without a price in the app). */
  unpriced: number;
}

export function aiTotals(readings: (StoredReading | null | undefined)[]): AiTotals {
  const t: AiTotals = { photos: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, costUsd: 0, unpriced: 0 };
  for (const r of readings) {
    if (!r?.usage) continue;
    t.photos++;
    t.usage.input += r.usage.input;
    t.usage.output += r.usage.output;
    t.usage.cacheRead += r.usage.cacheRead;
    t.usage.cacheWrite += r.usage.cacheWrite;
    if (typeof r.costUsd === "number") t.costUsd += r.costUsd;
    else t.unpriced++;
  }
  return t;
}

interface ReadingsFile {
  _help?: string[];
  photos: Record<string, StoredReading>;
}

const HELP = [
  "kWh that Personal File Map read from your electricity meter photos, one entry per photo, so no photo is sent to the AI reader twice.",
  "To correct one, change \"kwh\" and/or \"kind\" (\"balance\" = credit left on the meter, \"topup\" = kWh just added, \"other\" = ignore) and set \"edited\": true. You can also do this in the settings window.",
  "Delete an entry to have that photo read again.",
];

export class ReadingStore {
  private data: ReadingsFile;
  private byHash = new Map<string, StoredReading>();

  private constructor(readonly dir: string, data: ReadingsFile) {
    this.data = data;
    for (const r of Object.values(data.photos)) if (r && typeof r.sha1 === "string") this.byHash.set(r.sha1, r);
  }

  static load(dir: string): ReadingStore {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, READINGS_NAME), "utf8").replace(/^﻿/, ""));
      if (raw && typeof raw === "object" && raw.photos && typeof raw.photos === "object") return new ReadingStore(dir, raw);
    } catch {
      /* none yet, or broken: start over (photos are read again) */
    }
    return new ReadingStore(dir, { photos: {} });
  }

  /** The reading for this photo: by name if the content is unchanged, else by content (a renamed photo). */
  get(file: string, sha1: string): StoredReading | null {
    const byName = this.data.photos[file];
    if (byName && byName.sha1 === sha1) return byName;
    return this.byHash.get(sha1) ?? null;
  }

  set(file: string, reading: StoredReading) {
    this.data.photos[file] = reading;
    this.byHash.set(reading.sha1, reading);
  }

  /**
   * A photo was converted (HEIC → JPG): its reading moves to the new file and content, so it isn't read
   * again. Returns whether there was a reading to move.
   */
  carryOver(oldSha1: string, newFile: string, newSha1: string): boolean {
    const reading = this.byHash.get(oldSha1);
    if (!reading) return false;
    for (const [name, r] of Object.entries(this.data.photos)) if (r === reading) delete this.data.photos[name];
    this.byHash.delete(oldSha1);
    this.set(newFile, { ...reading, sha1: newSha1 });
    return true;
  }

  save() {
    const photos = Object.fromEntries(Object.entries(this.data.photos).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })));
    const out: ReadingsFile = { _help: HELP, photos };
    fs.writeFileSync(path.join(this.dir, READINGS_NAME), JSON.stringify(out, null, 2) + "\n");
  }
}

// ── Meter photos in the folder ───────────────────────────────────────────────

export type DateSource = "photo" | "file" | "month";

export interface MeterPhoto {
  meter: string; // the bill key, e.g. "Klaska PLN"
  file: string;
  month: number;
  ext: string;
  sha1: string;
  /** When it was taken: the photo's EXIF time, else the file's date if it's in the right month, else mid-month (estimated). */
  takenAt: Date;
  dateSource: DateSource;
  /** "Before" / "Input" / "After" in the file name: what the photo shows (credit left, kWh added, credit left). */
  label: MeterLabel;
  reading: StoredReading | null;
}

export type MeterLabel = "before" | "input" | "after";
const LABEL_ORDER: Record<MeterLabel, number> = { before: 0, input: 1, after: 2 };

/** The Before / Input / After word in a meter photo's name, or null: only labelled photos are meter photos. */
export function meterLabel(fullName: string): MeterLabel | null {
  for (const w of fullName.split(" ")) {
    const l = w.toLowerCase();
    if (l === "before" || l === "input" || l === "after") return l;
  }
  return null;
}

/**
 * Photos of a meter bill named "… Before", "… Input" or "… After", oldest first, with what's known about
 * them so far. Other files of the bill (a payment screenshot, a receipt PDF) are ignored: not listed, not read.
 */
export async function meterPhotos(dir: string, year: number, files: BillFile[], meterBills: string[], store: ReadingStore): Promise<MeterPhoto[]> {
  const out: MeterPhoto[] = [];
  const candidates = files
    .filter((f) => PHOTO_EXTENSIONS.has(f.ext))
    .map((f) => ({ f, meter: matchKey(f.name, meterBills), label: meterLabel(f.fullName) }))
    .filter((x): x is { f: BillFile; meter: string; label: MeterLabel } => x.meter !== null && x.label !== null)
    // Month, then top-up (#1, #2), then Before → Input → After: the order photos without a capture date get
    .sort((a, b) => a.f.month - b.f.month || (a.f.txn ?? 0) - (b.f.txn ?? 0) || LABEL_ORDER[a.label] - LABEL_ORDER[b.label] ||
      a.f.file.localeCompare(b.f.file, "en", { numeric: true }));

  for (const [i, { f, meter, label }] of candidates.entries()) {
    const buf = await fs.promises.readFile(path.join(dir, f.file));
    const sha1 = createHash("sha1").update(buf).digest("hex");
    let takenAt = await captureDate(buf);
    let dateSource: DateSource = "photo";
    if (takenAt && (takenAt.getFullYear() < year - 1 || takenAt.getFullYear() > year + 1)) takenAt = null; // camera clock off
    if (!takenAt) {
      const inMonth = f.mtime.getFullYear() === year && f.mtime.getMonth() + 1 === f.month;
      takenAt = inMonth ? f.mtime : new Date(year, f.month - 1, 15, 12, 0, i); // keeps the order above within a month
      dateSource = inMonth ? "file" : "month";
    }
    out.push({ meter, file: f.file, month: f.month, ext: f.ext, sha1, takenAt, dateSource, label, reading: store.get(f.file, sha1) });
  }
  return out.sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime() || LABEL_ORDER[a.label] - LABEL_ORDER[b.label] ||
    a.file.localeCompare(b.file, "en", { numeric: true }));
}

export interface ReadResult {
  read: number;
  failed: { file: string; error: string }[];
  /** Set when reading stopped early (bad key, unknown model, out of credit). */
  stopped: string | null;
  /** Tokens and cost of this run's successful readings. */
  totals: AiTotals;
}

/**
 * Reads every photo that has no reading yet, a few at a time, saving after each one so progress survives
 * an error. `photos` gets the new readings filled in.
 */
export async function readNewPhotos(
  dir: string,
  photos: MeterPhoto[],
  store: ReadingStore,
  provider: ProviderId,
  model: string,
  apiKey: string,
  logDir: string | null,
  onProgress?: (done: number, total: number) => void
): Promise<ReadResult> {
  const todo = photos.filter((p) => !p.reading);
  const result: ReadResult = { read: 0, failed: [], stopped: null, totals: aiTotals([]) };
  const fresh: StoredReading[] = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < todo.length && !result.stopped) {
      const p = todo[next++];
      const log: LogPhoto = { file: p.file, bytes: 0, sha1: p.sha1, sent: null };
      try {
        const original = await fs.promises.readFile(path.join(dir, p.file));
        log.bytes = original.length;
        const image = await preparePhoto(original, p.ext);
        log.sent = { width: image.width, height: image.height, bytes: image.jpeg.length };
        const r = await readPhoto(provider, model, apiKey, image, p.file);
        if (logDir) writeAiLog(logDir, log, r.exchange, r);
        p.reading = { ...r.reading, sha1: p.sha1, by: `${provider}/${model}`, at: new Date().toISOString(), usage: r.usage, costUsd: r.costUsd };
        store.set(p.file, p.reading);
        store.save();
        fresh.push(p.reading);
        result.read++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (logDir && err instanceof ReaderError && err.exchange) writeAiLog(logDir, log, err.exchange, null);
        if (err instanceof ReaderError && err.fatal) result.stopped = message;
        else result.failed.push({ file: p.file, error: message });
      }
      onProgress?.(++done, todo.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  result.totals = aiTotals(fresh);
  return result;
}

/** A value typed in the settings window: replaces what the reader saw, and is never read again. */
export function editReading(store: ReadingStore, photo: MeterPhoto, kind: PhotoReading["kind"], kwh: number): StoredReading {
  const reading: StoredReading = {
    kind,
    kwh: kind === "other" ? 0 : Math.round(kwh * 100) / 100,
    code: photo.reading?.code ?? "",
    confidence: "high",
    note: photo.reading?.note ?? "",
    sha1: photo.sha1,
    by: "you",
    at: new Date().toISOString(),
    edited: true,
    usage: photo.reading?.usage ?? null, // what the AI reading cost stays on record
    costUsd: photo.reading?.costUsd ?? null,
  };
  store.set(photo.file, reading);
  store.save();
  photo.reading = reading;
  return reading;
}

// ── Everything the report and the window need ────────────────────────────────

export interface Electricity {
  usages: MeterUsage[];
  /** "Claude (Anthropic) · claude-haiku-5-5", or null when the reader is off. */
  reader: string | null;
  read: ReadResult | null;
  /** Why photos weren't read (no reader, no key), or null. */
  blocked: string | null;
}

/**
 * The meter photos in `dir`, their readings, and the usage worked out from them. With `read`, photos without
 * a reading are read first (only when a reader and its API key are set; otherwise `blocked` says why not).
 */
export async function electricity(
  dir: string,
  year: number,
  files: BillFile[],
  settings: MeterSettings,
  opts: { read: boolean; logDir?: string | null; onProgress?: (done: number, total: number) => void }
): Promise<Electricity> {
  const store = ReadingStore.load(dir);
  const photos = await meterPhotos(dir, year, files, settings.bills, store);
  const provider = settings.reader === "off" ? null : settings.reader;
  const model = provider ? modelFor(settings, provider) : "";
  const label = provider ? `${PROVIDERS.find((p) => p.id === provider)!.label} · ${model}` : null;
  const unread = photos.filter((p) => !p.reading).length;

  let read: ReadResult | null = null;
  let blocked: string | null = null;
  if (unread > 0) {
    const key = provider ? effectiveKey(provider, settings.apiKeys) : null;
    if (!provider) blocked = "No AI reader is chosen in the settings window, so new meter photos aren't read.";
    else if (!key) blocked = `No API key for ${PROVIDERS.find((p) => p.id === provider)!.label} is saved, so new meter photos aren't read.`;
    else if (opts.read) read = await readNewPhotos(dir, photos, store, provider, model, key, opts.logDir ?? null, opts.onProgress);
  }

  const usages = settings.bills
    .map((meter) => meterUsage(meter, photos.filter((p) => p.meter === meter), year))
    .filter((u) => u.photos.length > 0);
  return { usages, reader: label, read, blocked };
}
