/**
 * Read an uploaded image's real type and size from its bytes — the Worker has
 * no image library, and the browser's MIME type and file name are just claims
 * (CWE-434). Supports the two formats the admin cropper produces: WebP (all
 * three VP8 variants) and baseline/progressive JPEG. Anything else is null.
 */
export interface ImageHeader {
  type: 'webp' | 'jpg';
  width: number;
  height: number;
}

const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len));

function webp(b: Uint8Array): ImageHeader | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8 ') {
    // Lossy: frame tag (3) + start code 9d 01 2a, then 14-bit width/height.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { type: 'webp', width: (b[26]! | (b[27]! << 8)) & 0x3fff, height: (b[28]! | (b[29]! << 8)) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return { type: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    const w = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
    const h = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
    return { type: 'webp', width: w, height: h };
  }
  return null;
}

function jpeg(b: Uint8Array): ImageHeader | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i++;
      continue;
    }
    // Standalone markers carry no length.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const len = (b[i + 2]! << 8) | b[i + 3]!;
    if (len < 2) return null;
    // SOF0–SOF15 except DHT (c4), JPG (c8), DAC (cc): frame header holds the size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { type: 'jpg', height: (b[i + 5]! << 8) | b[i + 6]!, width: (b[i + 7]! << 8) | b[i + 8]! };
    }
    i += 2 + len;
  }
  return null;
}

export function readImageHeader(bytes: Uint8Array): ImageHeader | null {
  const h = webp(bytes) ?? jpeg(bytes);
  return h && h.width > 0 && h.height > 0 ? h : null;
}
