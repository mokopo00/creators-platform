/**
 * Upload validation: MIME allow-list, size limits, magic bytes, and removal of
 * EXIF/XMP metadata (which may contain GPS location) from images.
 */
export const MEDIA_TYPES = {
  'image/jpeg': { ext: 'jpg', max: 10 * 1024 * 1024 },
  'image/png': { ext: 'png', max: 10 * 1024 * 1024 },
  'image/webp': { ext: 'webp', max: 10 * 1024 * 1024 },
  'image/gif': { ext: 'gif', max: 10 * 1024 * 1024 },
  'video/mp4': { ext: 'mp4', max: 50 * 1024 * 1024 },
  'video/webm': { ext: 'webm', max: 50 * 1024 * 1024 },
} as const;
export type MediaType = keyof typeof MEDIA_TYPES;

const ascii = (b: Uint8Array, start: number, len: number) =>
  String.fromCharCode(...b.subarray(start, start + len));

export function matchesMagicBytes(type: MediaType, b: Uint8Array): boolean {
  if (b.length < 12) return false;
  switch (type) {
    case 'image/jpeg':
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/png':
      return ascii(b, 0, 8) === '\x89PNG\r\n\x1a\n';
    case 'image/gif':
      return ascii(b, 0, 4) === 'GIF8';
    case 'image/webp':
      return ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP';
    case 'video/mp4':
      return ascii(b, 4, 4) === 'ftyp';
    case 'video/webm':
      return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
  }
}

/** Removes APP1 (EXIF/XMP) and APP13 (IPTC) segments from a JPEG. */
export function stripJpegMetadata(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1]!;
    if (marker === 0xda) break; // start of scan: rest is image data
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    const end = i + 2 + len;
    if (end > b.length) break;
    if (marker !== 0xe1 && marker !== 0xed) out.push(b.subarray(i, end));
    i = end;
  }
  out.push(b.subarray(i));
  return concat(out);
}

/** Removes eXIf, tEXt, iTXt and zTXt chunks from a PNG. */
export function stripPngMetadata(b: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > b.length) break;
    if (!['eXIf', 'tEXt', 'iTXt', 'zTXt'].includes(type)) out.push(b.subarray(i, end));
    i = end;
  }
  if (i < b.length) out.push(b.subarray(i));
  return concat(out);
}

/** Removes EXIF and XMP chunks from a WebP (RIFF) container and fixes sizes/flags. */
export function stripWebpMetadata(b: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const len = b[i + 4]! | (b[i + 5]! << 8) | (b[i + 6]! << 16) | (b[i + 7]! << 24);
    const end = i + 8 + len + (len % 2);
    if (end > b.length + 1) break;
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = b.slice(i, Math.min(end, b.length));
      if (type === 'VP8X') chunk[8] = chunk[8]! & ~0x0c; // clear EXIF + XMP flags
      chunks.push(chunk);
    }
    i = end;
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(b.subarray(0, 12));
  const size = body.length + 4;
  header[4] = size & 0xff;
  header[5] = (size >> 8) & 0xff;
  header[6] = (size >> 16) & 0xff;
  header[7] = (size >> 24) & 0xff;
  return concat([header, body]);
}

export function stripMetadata(type: MediaType, b: Uint8Array): Uint8Array {
  if (type === 'image/jpeg') return stripJpegMetadata(b);
  if (type === 'image/png') return stripPngMetadata(b);
  if (type === 'image/webp') return stripWebpMetadata(b);
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
