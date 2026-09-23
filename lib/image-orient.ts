import { decode, encode } from "jpeg-js";

const JPEG_DECODE_MB = 256;
const MAX_EDGE = 1600;

/** Read JPEG EXIF orientation (1–8). Returns 1 when missing. */
export function jpegExifOrientation(bytes: Buffer): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    while (offset + 1 < bytes.length && bytes[offset] === 0xff && bytes[offset + 1] === 0xff) {
      offset += 1;
    }
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (size < 2 || offset + 2 + size > bytes.length) break;
    if (marker === 0xe1) {
      const start = offset + 4;
      const end = offset + 2 + size;
      if (
        bytes.toString("ascii", start, start + 4) === "Exif" &&
        bytes[start + 4] === 0 &&
        bytes[start + 5] === 0
      ) {
        return readTiffOrientation(bytes, start + 6, end) || 1;
      }
    }
    offset += 2 + size;
  }
  return 1;
}

function readTiffOrientation(buf: Buffer, tiff: number, end: number): number {
  if (tiff + 8 > end) return 1;
  const le = buf.toString("ascii", tiff, tiff + 2) === "II";
  const be = buf.toString("ascii", tiff, tiff + 2) === "MM";
  if (!le && !be) return 1;
  const u16 = (p: number) => (le ? buf.readUInt16LE(p) : buf.readUInt16BE(p));
  const u32 = (p: number) => (le ? buf.readUInt32LE(p) : buf.readUInt32BE(p));
  if (u16(tiff + 2) !== 42) return 1;
  let ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > buf.length) return 1;
  const count = u16(ifd);
  ifd += 2;
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + i * 12;
    if (entry + 12 > buf.length) break;
    if (u16(entry) !== 0x0112) continue;
    const type = u16(entry + 2);
    const countField = u32(entry + 4);
    let value: number;
    if (type === 3 && countField === 1) {
      value = u16(entry + 8);
    } else if (type === 4 && countField === 1) {
      value = u32(entry + 8);
    } else {
      const valueOffset = tiff + u32(entry + 8);
      if (valueOffset + 2 > buf.length) return 1;
      value = u16(valueOffset);
    }
    return value >= 1 && value <= 8 ? value : 1;
  }
  return 1;
}

function rotatePixels(
  src: Uint8Array,
  width: number,
  height: number,
  orientation: number
): { data: Uint8Array; width: number; height: number } {
  const dstW = orientation >= 5 ? height : width;
  const dstH = orientation >= 5 ? width : height;
  const dst = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const si = (y * width + x) * 4;
      let dx = x;
      let dy = y;
      switch (orientation) {
        case 2:
          dx = width - 1 - x;
          dy = y;
          break;
        case 3:
          dx = width - 1 - x;
          dy = height - 1 - y;
          break;
        case 4:
          dx = x;
          dy = height - 1 - y;
          break;
        case 5:
          dx = y;
          dy = x;
          break;
        case 6:
          dx = height - 1 - y;
          dy = x;
          break;
        case 7:
          dx = height - 1 - y;
          dy = width - 1 - x;
          break;
        case 8:
          dx = y;
          dy = width - 1 - x;
          break;
        default:
          dx = x;
          dy = y;
      }
      const di = (dy * dstW + dx) * 4;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = src[si + 3];
    }
  }
  return { data: dst, width: dstW, height: dstH };
}

function scaleRgba(src: Uint8Array, sw: number, sh: number, maxEdge: number) {
  const edge = Math.max(sw, sh);
  if (edge <= maxEdge) return { data: src, width: sw, height: sh };
  const scale = maxEdge / edge;
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const dst = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y += 1) {
    const sy = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / dh));
    for (let x = 0; x < dw; x += 1) {
      const sx = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / dw));
      const si = (sy * sw + sx) * 4;
      const di = (y * dw + x) * 4;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = src[si + 3];
    }
  }
  return { data: dst, width: dw, height: dh };
}

function packedJpeg(encoded: { data: Buffer | Uint8Array }) {
  return Buffer.from(Uint8Array.from(encoded.data));
}

/** Bake EXIF orientation into pixels and strip the tag so PDF/Discord stay upright. */
export function bakeUprightImage(bytes: Buffer, mime = "image/jpeg"): { bytes: Buffer; mime: string } {
  const kind = (mime || "").toLowerCase();
  const jpeg = kind.includes("jpeg") || kind.includes("jpg") || (bytes[0] === 0xff && bytes[1] === 0xd8);
  if (!jpeg) {
    return { bytes, mime: mime || "image/jpeg" };
  }
  const orientation = jpegExifOrientation(bytes);
  try {
    const decoded = decode(bytes, { maxMemoryUsageInMB: JPEG_DECODE_MB, useTArray: true });
    let data = decoded.data as Uint8Array;
    let width = decoded.width;
    let height = decoded.height;
    if (orientation !== 1) {
      const rotated = rotatePixels(data, width, height, orientation);
      data = rotated.data;
      width = rotated.width;
      height = rotated.height;
    } else if (Math.max(width, height) <= MAX_EDGE) {
      return { bytes, mime: "image/jpeg" };
    }
    const scaled = scaleRgba(data, width, height, MAX_EDGE);
    const encoded = encode(
      { data: Buffer.from(scaled.data), width: scaled.width, height: scaled.height },
      86
    );
    return { bytes: packedJpeg(encoded), mime: "image/jpeg" };
  } catch {
    return { bytes, mime: mime || "image/jpeg" };
  }
}
