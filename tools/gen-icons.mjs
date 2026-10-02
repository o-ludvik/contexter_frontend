// Generates the app icons into public/icons/ with no dependencies (Node zlib only).
// Design: two offset rounded "cards" on a blue background = switching contexts.
// Run: npm run icons
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [43, 89, 195];
const BACK = [160, 185, 240];
const FRONT = [255, 255, 255];

// Shapes in unit coordinates (0..1) of the "glyph box".
const cards = [
  { x: 0.30, y: 0.18, w: 0.52, h: 0.56, r: 0.08, c: BACK },
  { x: 0.18, y: 0.28, w: 0.52, h: 0.56, r: 0.08, c: FRONT },
];
const lines = [0.42, 0.52, 0.62].map((y, i) => ({ x: 0.26, y, w: i === 2 ? 0.22 : 0.36, h: 0.04, r: 0.02, c: BG }));

function inRoundRect(px, py, s) {
  const dx = Math.max(s.x + s.r - px, 0, px - (s.x + s.w - s.r));
  const dy = Math.max(s.y + s.r - py, 0, py - (s.y + s.h - s.r));
  if (px < s.x || px > s.x + s.w || py < s.y || py > s.y + s.h) return false;
  return dx * dx + dy * dy <= s.r * s.r;
}

// maskable: full-bleed square, glyph shrunk into the 80% safe zone.
// normal: rounded-square background, glyph fills it.
function render(size, { maskable = false } = {}) {
  const SS = 4;
  const px = new Uint8Array(size * size * 4);
  const bgShape = { x: 0, y: 0, w: 1, h: 1, r: maskable ? 0 : 0.2 };
  const scale = maskable ? 0.72 : 1;
  const off = (1 - scale) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          if (!inRoundRect(u, v, bgShape)) continue;
          let c = BG;
          const gu = (u - off) / scale, gv = (v - off) / scale;
          for (const s of [...cards, ...lines]) if (inRoundRect(gu, gv, s)) c = s.c;
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }
      const n = SS * SS, i = (y * size + x) * 4;
      const cov = a / 255;
      px[i] = cov ? r / cov : 0; px[i + 1] = cov ? g / cov : 0; px[i + 2] = cov ? b / cov : 0; px[i + 3] = a / n;
    }
  }
  return png(size, size, px);
}

function crc32(buf) {
  let c, crc = ~0;
  for (const byte of buf) {
    c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg() {
  const rect = (s, k = 100) =>
    `<rect x="${s.x * k}" y="${s.y * k}" width="${s.w * k}" height="${s.h * k}" rx="${s.r * k}" fill="rgb(${s.c})"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<rect width="100" height="100" rx="20" fill="rgb(${BG})"/>` +
    [...cards, ...lines].map((s) => rect(s)).join('') + `</svg>\n`;
}

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('icon-192.png', out), render(192));
writeFileSync(new URL('icon-512.png', out), render(512));
writeFileSync(new URL('maskable-512.png', out), render(512, { maskable: true }));
writeFileSync(new URL('apple-touch-icon.png', out), render(180, { maskable: true }));
writeFileSync(new URL('icon.svg', out), svg());
console.log('icons written to public/icons/');
