/**
 * Masque de la fenêtre carrée : un PNG (cadre noir opaque percé d'un carré
 * transparent à coins arrondis) généré UNE SEULE FOIS au démarrage, puis
 * simplement superposé sur chaque plan.
 *
 * L'ancienne version bricolait un filtre `geq` pixel par pixel : illisible,
 * très lent, et le résultat ne correspondait pas au masque du navigateur.
 */
import { deflateSync } from "node:zlib";

import { squareBox } from "./geometry.js";

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtre « none »
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Couverture du pixel par le carré arrondi (anticrénelage simple, 0 → 1). */
function inside(px, py, box) {
  const { x, y, side, radius: r } = box;
  const lx = px - x;
  const ly = py - y;
  if (lx < 0 || ly < 0 || lx > side || ly > side) return 0;
  const dx = Math.max(r - lx, lx - (side - r), 0);
  const dy = Math.max(r - ly, ly - (side - r), 0);
  if (dx === 0 || dy === 0) return 1;
  const d = Math.hypot(dx, dy);
  if (d <= r - 0.5) return 1;
  if (d >= r + 0.5) return 0;
  return r + 0.5 - d;
}

/** Le masque ne dépend que du format : on ne le calcule qu'une fois. */
const cache = new Map();

/** PNG du masque : noir opaque hors du carré, transparent dedans. */
export function buildMaskPng(width, height) {
  const key = `${width}x${height}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const box = squareBox(width, height);
  const rgba = Buffer.alloc(width * height * 4);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const cover = inside(px + 0.5, py + 0.5, box);
      const i = (py * width + px) * 4;
      rgba[i] = 0;
      rgba[i + 1] = 0;
      rgba[i + 2] = 0;
      rgba[i + 3] = Math.round(255 * (1 - cover));
    }
  }
  return encodePng(width, height, rgba);
}
