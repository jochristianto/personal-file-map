import * as fs from "fs/promises";
import * as path from "path";
import { CONFIG_FILES } from "./config";
import type { BillFile, IgnoredFile, ScanResult } from "./types";

export const ALLOWED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "heic"]);

/** The report, written into the bills folder and overwritten on every run. */
export const OUTPUT_NAME = "personal-file-map.output.pdf";
const LEGACY_OUTPUT_NAME = "bills-overview.output.pdf";

/** Files we never list or warn about: the app itself, configs, our own output, outputs of older versions, OS clutter. */
function isSilentlyIgnored(file: string, _year: number, self: string | null): boolean {
  if (file.startsWith(".") || file.startsWith("~$")) return true;
  const lower = file.toLowerCase();
  if (self && lower === self.toLowerCase()) return true;
  if (/^personal-file-map.*\.exe$/.test(lower)) return true; // the Windows build sitting next to the Mac app
  if (CONFIG_FILES.includes(lower)) return true;
  if (lower === OUTPUT_NAME) return true;
  // Left behind by the app's earlier name, Bills Overview
  if (lower === LEGACY_OUTPUT_NAME || /^bills-overview.*\.exe$/.test(lower)) return true;
  if (/^presence-map-\d{4}\.png$/.test(lower)) return true; // output of the old file-mapper script
  return ["desktop.ini", "thumbs.db", "icon\r"].includes(lower);
}

/**
 * Same clean-up the old file-mapper did before reading:
 *  1. lowercase uppercase extensions  (IMG.JPG → IMG.jpg)
 *  2. convert .heic photos to .jpg and remove the .heic
 * Returns what was done, for the report's Housekeeping section.
 */
export async function normalizeDirectory(dir: string, year: number, self: string | null): Promise<IgnoredFile[]> {
  const actions: IgnoredFile[] = [];

  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = entry.name;
    if (!entry.isFile() || isSilentlyIgnored(file, year, self)) continue;
    const ext = path.extname(file);
    if (!ext || ext === ext.toLowerCase()) continue;
    const renamed = file.slice(0, -ext.length) + ext.toLowerCase();
    // rename(2) handles case-only renames on case-insensitive volumes (APFS, NTFS)
    await fs.rename(path.join(dir, file), path.join(dir, renamed));
    actions.push({ file, reason: `renamed to ${ext.toLowerCase()}` });
  }

  const heics = (await fs.readdir(dir)).filter((f) => path.extname(f) === ".heic");
  if (heics.length > 0) {
    // Loaded lazily: the HEIC decoder is large and rarely needed.
    const { default: convert } = await import("heic-convert");
    for (const file of heics) {
      const jpg = file.slice(0, -".heic".length) + ".jpg";
      const heicPath = path.join(dir, file);
      const jpgPath = path.join(dir, jpg);
      if (await exists(jpgPath)) continue; // never overwrite; the .heic still counts as present
      try {
        const input = await fs.readFile(heicPath);
        const output = await convert({ buffer: input as unknown as ArrayBuffer, format: "JPEG", quality: 0.95 });
        const buf = Buffer.from(output);
        if (buf.length === 0) throw new Error("empty output");
        await fs.writeFile(jpgPath, buf);
        await fs.unlink(heicPath);
        actions.push({ file, reason: "converted to .jpg" });
      } catch (err) {
        actions.push({ file, reason: `couldn't convert to .jpg (${(err as Error).message}); kept as is` });
      }
    }
  }

  return actions;
}

export async function scanDirectory(dir: string, year: number, self: string | null): Promise<ScanResult> {
  const files: BillFile[] = [];
  const ignored: IgnoredFile[] = [];

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const file = entry.name;
    if (!entry.isFile() || isSilentlyIgnored(file, year, self)) continue;

    const ext = path.extname(file).slice(1).toLowerCase();
    const base = ext ? file.slice(0, -(ext.length + 1)) : file;

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      ignored.push({ file, reason: ext ? `.${ext} files aren't supported` : "no file extension" });
      continue;
    }
    const match = /^(\d{4})(\d{2}) +(.+)$/.exec(base);
    if (!match) {
      ignored.push({ file, reason: "name doesn't start with YYYYMM" });
      continue;
    }
    const fileYear = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) {
      ignored.push({ file, reason: `month "${match[2]}" isn't 01–12` });
      continue;
    }
    if (fileYear !== year) {
      ignored.push({ file, reason: `dated ${fileYear}, not ${year}` });
      continue;
    }
    const name = match[3].replace(/\s+/g, " ").trim();
    const stat = await fs.stat(path.join(dir, file));
    files.push({ file, name, month, ext, mtime: stat.mtime });
  }

  ignored.sort((a, b) => a.file.localeCompare(b.file));
  return { dir, year, files, ignored };
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
