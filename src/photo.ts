import exifr from "exifr";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

/**
 * Photos of the electricity meter: when each was taken (EXIF), and a small upright JPEG of it to send to
 * the AI reader. All pure JS, so it runs inside the packaged app.
 */

/** When the photo was taken, from its EXIF data (camera time, the phone's local time). Null if it has none. */
export async function captureDate(buf: Buffer): Promise<Date | null> {
  try {
    const tags = await exifr.parse(buf, { pick: ["DateTimeOriginal", "CreateDate", "DateTimeDigitized"] });
    const d: unknown = tags?.DateTimeOriginal ?? tags?.CreateDate ?? tags?.DateTimeDigitized;
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  } catch {
    return null; // no EXIF, or a format exifr doesn't know
  }
}

/** Longest side sent to the reader. Both providers scale larger images down to about this anyway. */
const MAX_SIDE = 1600;

/**
 * The photo as an upright JPEG no larger than MAX_SIDE, ready to send. Phone photos are 3–5 MB and often
 * stored sideways with an EXIF "rotate me" flag; re-encoding drops that flag, so the rotation is applied here.
 */
export async function preparePhoto(buf: Buffer, ext: string): Promise<{ jpeg: Buffer; width: number; height: number }> {
  let rgba: { width: number; height: number; data: Uint8Array };
  if (ext === "png") {
    const png = PNG.sync.read(buf);
    rgba = { width: png.width, height: png.height, data: png.data };
  } else {
    if (ext === "heic") {
      const { default: convert } = await import("heic-convert"); // large; only loaded when needed
      buf = Buffer.from(await convert({ buffer: buf as unknown as ArrayBuffer, format: "JPEG", quality: 0.92 }));
    }
    rgba = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024, maxResolutionInMP: 200 });
  }
  const orientation = ext === "heic" ? 1 : await exifOrientation(buf); // heic-convert already applies it
  const small = downscale(rgba, MAX_SIDE);
  const upright = rotate(small, orientation);
  const out = jpeg.encode({ width: upright.width, height: upright.height, data: upright.data }, 85).data;
  return { jpeg: out, width: upright.width, height: upright.height };
}

/**
 * The photo as the window can show it: JPG and PNG as they are (the browser applies the EXIF rotation),
 * HEIC converted to JPEG, since browsers other than Safari can't show it.
 */
export async function viewablePhoto(buf: Buffer, ext: string): Promise<{ body: Buffer; type: string }> {
  if (ext === "png") return { body: buf, type: "image/png" };
  if (ext === "heic") {
    const { default: convert } = await import("heic-convert");
    buf = Buffer.from(await convert({ buffer: buf as unknown as ArrayBuffer, format: "JPEG", quality: 0.9 }));
  }
  return { body: buf, type: "image/jpeg" };
}

async function exifOrientation(buf: Buffer): Promise<number> {
  try {
    const tags = await exifr.parse(buf, { pick: ["Orientation"], translateValues: false });
    return typeof tags?.Orientation === "number" ? tags.Orientation : 1;
  } catch {
    return 1;
  }
}

interface Raster {
  width: number;
  height: number;
  data: Uint8Array; // RGBA
}

/** Box-filter downscale so the longest side is at most `max`: every source pixel counts, so digits stay crisp. */
function downscale(src: Raster, max: number): Raster {
  const scale = Math.max(src.width, src.height) / max;
  if (scale <= 1) return src;
  const width = Math.max(1, Math.round(src.width / scale));
  const height = Math.max(1, Math.round(src.height / scale));
  const out = new Uint8Array(width * height * 4);
  const sx = src.width / width;
  const sy = src.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(src.height, Math.floor((y + 1) * sy)));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.min(src.width, Math.floor((x + 1) * sx)));
      let r = 0, g = 0, b = 0;
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * src.width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, i += 4) {
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const o = (y * width + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}

/** Applies EXIF orientation 3 (180°), 6 (90° clockwise) or 8 (90° counter-clockwise); others are left as is. */
function rotate(src: Raster, orientation: number): Raster {
  if (orientation !== 3 && orientation !== 6 && orientation !== 8) return src;
  const { width: w, height: h } = src;
  const turned = orientation !== 3;
  const width = turned ? h : w;
  const height = turned ? w : h;
  const out = new Uint8Array(width * height * 4);
  for (let oy = 0; oy < height; oy++) {
    for (let ox = 0; ox < width; ox++) {
      const [sx, sy] =
        orientation === 3 ? [w - 1 - ox, h - 1 - oy] : orientation === 6 ? [oy, h - 1 - ox] : [w - 1 - oy, ox];
      const i = (sy * w + sx) * 4;
      const o = (oy * width + ox) * 4;
      out[o] = src.data[i];
      out[o + 1] = src.data[i + 1];
      out[o + 2] = src.data[i + 2];
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}

/**
 * Adds a minimal EXIF block with DateTimeOriginal to a JPEG that has none. Used when a .heic photo is
 * converted to .jpg: the converter drops the metadata, and the capture time is what usage is measured by.
 */
export function withCaptureDate(jpg: Buffer, date: Date): Buffer {
  if (jpg[0] !== 0xff || jpg[1] !== 0xd8) return jpg;
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${date.getFullYear()}:${p(date.getMonth() + 1)}:${p(date.getDate())} ` +
    `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}\0`; // 20 bytes, local time like a camera

  // Big-endian TIFF: IFD0 with one entry (pointer to the Exif IFD), Exif IFD with DateTimeOriginal.
  const tiff = Buffer.alloc(8 + 18 + 18 + 20);
  tiff.write("MM", 0, "ascii");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4); // IFD0 offset
  tiff.writeUInt16BE(1, 8); // IFD0: 1 entry
  tiff.writeUInt16BE(0x8769, 10); // ExifIFDPointer
  tiff.writeUInt16BE(4, 12); // LONG
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt32BE(26, 18); // Exif IFD offset
  tiff.writeUInt32BE(0, 22); // no next IFD
  tiff.writeUInt16BE(1, 26); // Exif IFD: 1 entry
  tiff.writeUInt16BE(0x9003, 28); // DateTimeOriginal
  tiff.writeUInt16BE(2, 30); // ASCII
  tiff.writeUInt32BE(20, 32);
  tiff.writeUInt32BE(44, 36); // value offset
  tiff.writeUInt32BE(0, 40);
  tiff.write(stamp, 44, "ascii");

  const payload = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0); // APP1
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpg.subarray(0, 2), header, payload, jpg.subarray(2)]);
}
