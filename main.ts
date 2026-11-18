// THE WORLD IN ONE PAGE — a front page of Wednesday 18 November 2026.
//
// Entry for make.fun news-image-20261118: "Sum up 18 November's world news
// in one image". The program draws a newspaper front page, entirely in code
// (Node 22 standard library only, no assets, no network, fully deterministic:
// two runs write byte-identical PNGs), and writes it to entry.png.
//
// The day's news (all reported on 18 November 2026, corroborated across
// Reuters / AP / AFP coverage): Iran strikes U.S. bases in Kuwait and Bahrain
// after the U.S. hit Qeshm Island; Ukraine hits the Kerch Bridge and a road
// span collapses; Xi Jinping meets Vladimir Putin in Shenzhen ahead of a
// summit with Trump; Democrat Mary Peltola wins Alaska and the Democrats take
// the U.S. Senate 56-44; Voyager 1 reaches one light-day from Earth;
// the Ebola outbreak in DR Congo passes 11,000 cases; the United States
// loses its measles-free status after 26 years.
//
// Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------------------
// framebuffer
// ---------------------------------------------------------------------------
type RGB = [number, number, number];
const fb = new Uint8Array(W * H * 3);

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function px(x: number, y: number, c: RGB): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const i = (yi * W + xi) * 3;
  fb[i] = c[0];
  fb[i + 1] = c[1];
  fb[i + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      fb[i] = c[0];
      fb[i + 1] = c[1];
      fb[i + 2] = c[2];
      i += 3;
    }
  }
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
// vertical gradient rectangle
function vgrad(x: number, y: number, w: number, h: number, top: RGB, bottom: RGB): void {
  for (let yy = 0; yy < h; yy++) {
    fillRect(x, y + yy, w, 1, lerpRGB(top, bottom, yy / Math.max(1, h - 1)));
  }
}
function hline(x0: number, x1: number, y: number, c: RGB, th = 1): void {
  fillRect(Math.min(x0, x1), y - Math.floor(th / 2), Math.abs(x1 - x0), th, c);
}
function vline(x: number, y0: number, y1: number, c: RGB, th = 1): void {
  fillRect(x - Math.floor(th / 2), Math.min(y0, y1), th, Math.abs(y1 - y0), c);
}
// Bresenham line, thickness via filled discs. Coordinates are rounded to
// integers first: with float endpoints the x===x1 test can never hit and
// the loop would run forever.
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, th = 1): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  const r = Math.max(1, Math.floor(th / 2));
  for (;;) {
    disc(x, y, r, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  const r2 = r * r;
  for (let yy = -r; yy <= r; yy++) {
    for (let xx = -r; xx <= r; xx++) {
      if (xx * xx + yy * yy <= r2) px(cx + xx, cy + yy, c);
    }
  }
}
function circleOutline(cx: number, cy: number, r: number, c: RGB, th = 1): void {
  const steps = Math.max(24, Math.floor(2 * Math.PI * r));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    disc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, Math.max(1, Math.floor(th / 2)), c);
  }
}
// filled polygon (scanline)
function poly(points: Array<[number, number]>, c: RGB): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      hline(Math.ceil(xs[i]), Math.floor(xs[i + 1]), y, c);
    }
  }
}
function star(cx: number, cy: number, r: number, c: RGB): void {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  poly(pts, c);
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font (uppercase, digits, punctuation). Rows are 5-bit strings.
// ---------------------------------------------------------------------------
const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '+': ['00000', '00100', '00100', '01110', '00100', '00100', '00000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
};

function textWidth(s: string, scale: number): number {
  if (s.length === 0) return 0;
  return s.length * 6 * scale - scale;
}
function drawText(x: number, y: number, s: string, scale: number, c: RGB, align: 'left' | 'center' | 'right' = 'left'): void {
  s = s.toUpperCase(); // the font is capitals-only; lowercase would draw '?'
  const w = textWidth(s, scale);
  let cx = x;
  if (align === 'center') cx = x - Math.floor(w / 2);
  if (align === 'right') cx = x - w;
  for (let ci = 0; ci < s.length; ci++) {
    const g = FONT[s[ci]] ?? FONT['?'];
    const gx = cx + ci * 6 * scale;
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === '1') {
          fillRect(gx + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
  }
}
// wrap text into lines that fit maxWidth px at scale
function wrapLines(s: string, maxWidth: number, scale: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur === '' ? w : cur + ' ' + w;
    if (textWidth(t, scale) <= maxWidth) {
      cur = t;
    } else {
      if (cur !== '') lines.push(cur);
      cur = w;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------------------
// PNG encoder (RGB, 8-bit, filter 0 per row)
// ---------------------------------------------------------------------------
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(fb.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// palette
// ---------------------------------------------------------------------------
const PAPER = hex('#f6f1e3');
const PANEL = hex('#fffdf6');
const INK = hex('#1a1a1a');
const NAVY = hex('#16233f');
const RED = hex('#b3232a');
const GOLD = hex('#c9973f');
const SUB = hex('#3d3d3d');
const WHITE = hex('#ffffff');

// deterministic PRNG for star/dot scatter
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// quadratic bezier point
function qbez(p0: [number, number], p1: [number, number], p2: [number, number], t: number): [number, number] {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
}

// ---------------------------------------------------------------------------
// story pictograms (each draws inside x,y,w,h)
// ---------------------------------------------------------------------------
function drawGulf(x: number, y: number, w: number, h: number): void {
  vgrad(x, y, w, Math.round(h * 0.62), hex('#7c1f1c'), hex('#f2b04d'));
  disc(x + w * 0.8, y + h * 0.2, 20, hex('#ffe9b0'));
  circleOutline(x + w * 0.8, y + h * 0.2, 26, hex('#ffe9b0'), 2);
  fillRect(x, y + h * 0.62, w, h * 0.38, hex('#14384a'));
  const wave = hex('#2e6b7d');
  for (let r = 0; r < 3; r++) {
    const wy = y + h * (0.7 + r * 0.09);
    for (let xx = 0; xx < w; xx += 4) {
      const yy = wy + Math.sin((xx / w) * Math.PI * 3 + r * 1.7) * 3;
      px(x + xx, yy, wave);
      px(x + xx, yy + 1, wave);
    }
  }
  // dark headland, bottom left
  poly(
    [
      [x, y + h],
      [x, y + h * 0.82],
      [x + w * 0.2, y + h * 0.72],
      [x + w * 0.3, y + h],
    ],
    hex('#14141c'),
  );
  // two missile trails arcing up to the right, with smoke and a burst
  const trails: Array<[[number, number], [number, number], [number, number]]> = [
    [
      [x + w * 0.12, y + h * 0.96],
      [x + w * 0.3, y + h * 0.3],
      [x + w * 0.62, y + h * 0.22],
    ],
    [
      [x + w * 0.34, y + h * 0.97],
      [x + w * 0.58, y + h * 0.28],
      [x + w * 0.86, y + h * 0.16],
    ],
  ];
  for (const [p0, p1, p2] of trails) {
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const [bx, by] = qbez(p0, p1, p2, t);
      if (i % 4 === 0) disc(bx, by + 5, 4, hex('#c9c2b4'));
      disc(bx, by, 2, WHITE);
    }
    const [ex, ey] = p2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 2 * Math.PI;
      line(ex, ey, ex + Math.cos(a) * 16, ey + Math.sin(a) * 16, hex('#ffb347'), 3);
    }
    disc(ex, ey, 7, hex('#ffdd66'));
  }
}

function drawKerch(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, hex('#cfe0ea'));
  fillRect(x, y + h * 0.55, w, h * 0.45, hex('#2f6f9f'));
  const wave = hex('#bcd9ea');
  for (let r = 0; r < 2; r++) {
    const wy = y + h * (0.66 + r * 0.14);
    for (let xx = 0; xx < w; xx += 5) {
      const yy = wy + Math.sin((xx / w) * Math.PI * 4 + r * 2) * 2;
      px(x + xx, yy, wave);
    }
  }
  const deckY = y + h * 0.5;
  const dark = hex('#222222');
  // towers
  fillRect(x + w * 0.22, deckY - 42, 6, 42, dark);
  fillRect(x + w * 0.72, deckY - 42, 6, 42, dark);
  // cables
  line(x + w * 0.22 + 3, deckY - 42, x + w * 0.08, deckY, dark, 2);
  line(x + w * 0.22 + 3, deckY - 42, x + w * 0.4, deckY, dark, 2);
  line(x + w * 0.72 + 3, deckY - 42, x + w * 0.58, deckY, dark, 2);
  line(x + w * 0.72 + 3, deckY - 42, x + w * 0.9, deckY, dark, 2);
  // deck: two spans with a collapsed gap in the middle
  hline(x + 8, x + w * 0.42, deckY, dark, 4);
  hline(x + w * 0.58, x + w - 8, deckY, dark, 4);
  line(x + w * 0.42, deckY, x + w * 0.5, deckY + 24, dark, 4);
  line(x + w * 0.58, deckY, x + w * 0.5, deckY + 24, dark, 4);
  // smoke at the gap
  disc(x + w * 0.5, deckY - 8, 8, hex('#9a9a9a'));
  disc(x + w * 0.47, deckY - 14, 6, hex('#b5b5b5'));
  disc(x + w * 0.54, deckY - 14, 6, hex('#b5b5b5'));
}

function drawSummit(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, hex('#e9eef4'));
  // skyline along the bottom
  const sky = hex('#2c3e50');
  const heights = [0.3, 0.48, 0.36, 0.55, 0.4, 0.5, 0.32];
  const bw = w / heights.length;
  for (let i = 0; i < heights.length; i++) {
    const bh = h * heights[i];
    fillRect(x + i * bw + 2, y + h - bh, bw - 4, bh, sky);
  }
  const win = hex('#f6c453');
  const rnd = mulberry32(1811);
  for (let i = 0; i < 26; i++) {
    px(x + 6 + rnd() * (w - 12), y + h * 0.6 + rnd() * h * 0.34, win);
  }
  // three flags on poles above the skyline
  const poles = [0.2, 0.5, 0.8];
  const fy = y + h * 0.12;
  const fh = h * 0.3;
  for (let i = 0; i < 3; i++) {
    const px0 = x + w * poles[i];
    vline(px0, fy, fy + fh, INK, 3);
    disc(px0, fy - 2, 3, GOLD);
    const fx = px0 + 2;
    const fw = 46;
    const fhh = 28;
    if (i === 0) {
      // China
      fillRect(fx, fy, fw, fhh, hex('#de2910'));
      star(fx + 11, fy + 10, 6, hex('#ffde00'));
      disc(fx + 26, fy + 7, 2, hex('#ffde00'));
      disc(fx + 32, fy + 13, 2, hex('#ffde00'));
      disc(fx + 28, fy + 20, 2, hex('#ffde00'));
      disc(fx + 20, fy + 19, 2, hex('#ffde00'));
    } else if (i === 1) {
      // Russia: white / blue / red bands
      fillRect(fx, fy, fw, 9, WHITE);
      fillRect(fx, fy + 9, fw, 10, hex('#0039a6'));
      fillRect(fx, fy + 19, fw, 9, hex('#d52b1e'));
    } else {
      // USA: stripes + canton
      for (let s = 0; s < 7; s++) {
        fillRect(fx, fy + s * 4, fw, 4, s % 2 === 0 ? hex('#b22234') : WHITE);
      }
      fillRect(fx, fy, 19, 15, hex('#3c3b6e'));
      disc(fx + 6, fy + 5, 1, WHITE);
      disc(fx + 13, fy + 5, 1, WHITE);
      disc(fx + 9, fy + 10, 1, WHITE);
    }
  }
}

function drawSenate(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, hex('#dfe9f2'));
  fillRect(x, y + h * 0.82, w, h * 0.18, hex('#4a7c43'));
  const cx = x + w / 2;
  const baseY = y + h * 0.82;
  const white = hex('#f5f2e8');
  const shade = hex('#d8d2bd');
  // steps
  fillRect(cx - 62, baseY - 10, 124, 10, shade);
  fillRect(cx - 52, baseY - 20, 104, 10, white);
  // columns
  for (let i = -2; i <= 2; i++) {
    fillRect(cx + i * 20 - 3, baseY - 52, 6, 32, white);
  }
  fillRect(cx - 56, baseY - 56, 112, 5, white);
  // drum + dome
  fillRect(cx - 26, baseY - 78, 52, 22, white);
  const domePts: Array<[number, number]> = [];
  for (let a = 180; a <= 360; a += 6) {
    const rad = (a * Math.PI) / 180;
    domePts.push([cx + Math.cos(rad) * 34, baseY - 78 + Math.sin(rad) * 30]);
  }
  domePts.push([cx + 34, baseY - 78]);
  poly(domePts, white);
  // lantern + flag
  fillRect(cx - 4, baseY - 112, 8, 8, white);
  vline(cx, baseY - 128, baseY - 104, INK, 2);
  fillRect(cx + 1, baseY - 128, 14, 8, RED);
  // windows on the wings
  for (let i = 0; i < 3; i++) {
    fillRect(cx - 96 + i * 14, baseY - 34, 7, 12, NAVY);
    fillRect(cx + 82 - i * 14, baseY - 34, 7, 12, NAVY);
  }
}

function drawVoyager(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, hex('#05070d'));
  const rnd = mulberry32(20261118);
  for (let i = 0; i < 42; i++) {
    const sx = x + 4 + rnd() * (w - 8);
    const sy = y + 4 + rnd() * (h - 8);
    disc(sx, sy, rnd() > 0.85 ? 2 : 1, rnd() > 0.7 ? hex('#ffe9b0') : WHITE);
  }
  // Earth, bottom left
  disc(x + 30, y + h - 26, 13, hex('#2f6fd0'));
  disc(x + 26, y + h - 30, 5, hex('#7fb5e8'));
  // dashed gold arc: the one-light-day ring
  const ccx = x + w * 0.62;
  const ccy = y + h * 0.48;
  for (let a = 200; a <= 340; a += 7) {
    const rad = (a * Math.PI) / 180;
    disc(ccx + Math.cos(rad) * 62, ccy + Math.sin(rad) * 62, 2, GOLD);
  }
  // the probe: dish + body + boom
  const gold = hex('#d4af37');
  poly(
    [
      [ccx - 4, ccy - 4],
      [ccx + 26, ccy - 22],
      [ccx + 30, ccy - 10],
      [ccx + 2, ccy + 6],
    ],
    gold,
  );
  fillRect(ccx - 10, ccy - 4, 14, 10, gold);
  line(ccx + 4, ccy + 6, ccx + 22, ccy + 20, gold, 2);
  disc(ccx + 24, ccy + 22, 3, gold);
  line(ccx - 8, ccy, ccx - 26, ccy - 12, WHITE, 2);
}

function drawEbola(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, hex('#571018'));
  const rnd = mulberry32(11000);
  const dark = hex('#7c1a20');
  for (let i = 0; i < 18; i++) {
    disc(x + 6 + rnd() * (w - 12), y + 6 + rnd() * (h - 12), 2, dark);
  }
  const balls: Array<[number, number, number]> = [
    [0.28, 0.42, 17],
    [0.62, 0.6, 13],
    [0.74, 0.3, 10],
  ];
  for (const [fx, fy, r] of balls) {
    const cx = x + w * fx;
    const cy = y + h * fy;
    const c = hex('#c0392b');
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * 2 * Math.PI;
      line(cx, cy, cx + Math.cos(a) * (r + 7), cy + Math.sin(a) * (r + 7), c, 2);
    }
    disc(cx, cy, r, c);
    disc(cx - r * 0.3, cy - r * 0.3, Math.max(3, r * 0.35), hex('#e5735f'));
  }
}

function drawMeasles(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, hex('#f3ddd2'));
  const rnd = mulberry32(26);
  const dot = hex('#c0392b');
  for (let i = 0; i < 60; i++) {
    const dx = x + 8 + rnd() * w * 0.5;
    const dy = y + 8 + rnd() * (h - 16);
    disc(dx, dy, 3 + rnd() * 3, dot);
  }
  // "26" badge
  const bx = x + w * 0.58;
  const by = y + h * 0.16;
  const bw = w * 0.36;
  const bh = h * 0.68;
  fillRect(bx, by, bw, bh, WHITE);
  // red border
  hline(bx, bx + bw, by, RED, 3);
  hline(bx, bx + bw, by + bh, RED, 3);
  vline(bx, by, by + bh, RED, 3);
  vline(bx + bw, by, by + bh, RED, 3);
  drawText(bx + bw / 2, by + 10, '26', 5, RED, 'center');
  drawText(bx + bw / 2, by + bh - 26, 'YEARS', 2, RED, 'center');
}

// ---------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------
function panel(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PANEL);
  hline(x, x + w, y, INK, 2);
  hline(x, x + w, y + h, INK, 2);
  vline(x, y, y + h, INK, 2);
  vline(x + w, y, y + h, INK, 2);
}

function storyPanel(
  x: number,
  y: number,
  w: number,
  h: number,
  draw: (x: number, y: number, w: number, h: number) => void,
  kicker: string,
  head: string[],
  sub: string[],
): void {
  panel(x, y, w, h);
  draw(x + 8, y + 8, w - 16, 110);
  drawText(x + 14, y + 126, kicker, 2, RED);
  let hy = y + 148;
  for (const ln of head) {
    drawText(x + 14, hy, ln, 3, INK);
    hy += 26;
  }
  let sy = y + 202;
  for (const ln of sub) {
    drawText(x + 14, sy, ln, 2, SUB);
    sy += 17;
  }
}

function compose(): void {
  fillRect(0, 0, W, H, PAPER);
  // outer frame
  fillRect(0, 0, W, 6, NAVY);
  fillRect(0, H - 6, W, 6, NAVY);
  fillRect(0, 0, 6, H, NAVY);
  fillRect(W - 6, 0, 6, H, NAVY);

  // masthead
  fillRect(14, 14, W - 28, 116, NAVY);
  drawText(W / 2, 30, 'THE WORLD', 10, WHITE, 'center');
  drawText(W / 2, 102, 'WEDNESDAY, 18 NOVEMBER 2026', 3, GOLD, 'center');
  fillRect(14, 136, W - 28, 4, GOLD);

  // lead story: Iran
  panel(22, 146, 980, 294);
  drawGulf(30, 154, 520, 278);
  drawText(572, 168, 'MIDDLE EAST', 2, RED);
  drawText(572, 196, 'IRAN HITS', 5, INK);
  drawText(572, 240, 'U.S. BASES', 5, INK);
  const leadSub = ['Strikes in Kuwait and', 'Bahrain after U.S. hit', 'Qeshm Island.'];
  let ly = 300;
  for (const ln of leadSub) {
    drawText(572, ly, ln, 2, SUB);
    ly += 18;
  }
  hline(572, 990, 372, GOLD, 2);
  drawText(572, 388, 'GULF IN CRISIS', 2, RED);

  fillRect(14, 448, W - 28, 3, GOLD);

  // row 2
  storyPanel(22, 460, 320, 240, drawKerch, 'UKRAINE', ['KERCH BRIDGE', 'HIT BY UKRAINE'], ['Road span collapses', 'in Ukrainian attack']);
  storyPanel(352, 460, 320, 240, drawSummit, 'CHINA', ['XI MEETS PUTIN', 'IN SHENZHEN'], ['Ahead of summit', 'with Trump']);
  storyPanel(682, 460, 320, 240, drawSenate, 'UNITED STATES', ['DEMOCRATS TAKE', 'THE SENATE'], ['Peltola wins Alaska', '56-44 majority']);

  // row 3
  storyPanel(22, 708, 320, 240, drawVoyager, 'SPACE', ['VOYAGER 1', 'ONE LIGHT-DAY'], ['16 billion miles', 'from Earth']);
  storyPanel(352, 708, 320, 240, drawEbola, 'HEALTH', ['EBOLA PASSES', '11,000 CASES'], ['Outbreak surges', 'in DR Congo']);
  storyPanel(682, 708, 320, 240, drawMeasles, 'HEALTH', ['U.S. LOSES', 'MEASLES STATUS'], ['Free status ends', 'after 26 years']);

  // footer
  drawText(W / 2, 962, "WEDNESDAY 18 NOVEMBER 2026 - THE WORLD IN ONE PAGE", 2, INK, 'center');
  drawText(W / 2, 984, 'ALL STORIES REPORTED ON 18 NOVEMBER 2026', 2, SUB, 'center');
}

// ---------------------------------------------------------------------------
compose();
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
const png = encodePNG();
writeFileSync(join(outDir, 'entry.png'), png);
console.log(`wrote ${join(outDir, 'entry.png')} ${png.length} bytes sha256=${createHash('sha256').update(png).digest('hex')}`);
