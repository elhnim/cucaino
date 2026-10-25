// Cucaino Retro Arcade — a small pixel-art toolkit shared by the games, so every game can look
// like a 16-bit cartridge (painted parallax backdrops, shaded tiles, outlined sprites) rather
// than flat bands of colour.
//
// The trick that keeps it cheap: big pictures (a whole sky, a mountain range, a jungle wall, a
// tile texture) are BAKED ONCE into a Sprite at module load, from a function of (x, y). The host
// caches every Sprite as a canvas the first time it's drawn, so a 256x160 backdrop afterwards
// costs one drawImage per frame. Bake at load (or lazily once), never inside draw().
//
// Everything here is pure (no DOM), deterministic (seeded), and works with nullGfx in tests.
import { sprite, type Gfx, type Sprite } from "./engine";

// ── colour ──
const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
export function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}
export const toHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
/** blend two colours (t = 0 -> a, 1 -> b) */
export function mixHex(a: string, b: string, t: number) {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
/** lighter (k > 0, towards white) or darker (k < 0, towards a deep blue-black, the way pixel
 *  artists shade — never towards plain grey) */
export const shade = (c: string, k: number) => (k >= 0 ? mixHex(c, "#fff8e8", k) : mixHex(c, "#140c28", -k));
/** a ramp of n colours from dark to light around a base colour (for shading) */
export const ramp = (c: string, n = 4, spread = 0.55) => Array.from({ length: n }, (_, i) => shade(c, -spread + (2 * spread * i) / Math.max(1, n - 1)));

// ── noise ──
/** a fast seeded hash in [0, 1) for integer lattice points */
export function hash2(x: number, y: number, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** smooth value noise in [0, 1) */
export function noise2(x: number, y: number, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** fractal noise (octaves of value noise), in [0, 1) */
export function fbm(x: number, y: number, octaves = 3, seed = 0) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    s += noise2(x * f, y * f, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return s / norm;
}
/** the 4x4 ordered-dither threshold at a pixel, in [0, 1) — pick between two colours with
 *  `value > bayer(x, y)` to get the classic 16-bit dithered blend instead of a hard band */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

// ── baking ──
const KEYS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$%&()*+,-/:;<=>?@[]^_{|}~";
/** Bake a picture from a function giving each pixel's colour (a hex string, or null for
 *  transparent). Any number of distinct colours. Call once (lazily), keep the Sprite. */
export function bake(w: number, h: number, px: (x: number, y: number) => string | null): Sprite {
  const pal: Record<string, string> = {};
  const index = new Map<string, string>();
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const c = px(x, y);
      if (!c) {
        row += ".";
        continue;
      }
      let k = index.get(c);
      if (!k) {
        // past the printable keys, any other single character works as a palette key too
        k = index.size < KEYS.length ? KEYS[index.size] : String.fromCharCode(0x100 + index.size);
        index.set(c, k);
        pal[k] = c;
      }
      row += k;
    }
    rows.push(row);
  }
  return sprite(rows, pal);
}
/** a vertical gradient through the given colours, dithered between steps (a sky, a sea, a cave) */
export function gradientColor(stops: string[], t: number, x: number, y: number) {
  const f = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1);
  const i = Math.floor(f);
  return f - i > bayer(x, y) ? stops[Math.min(stops.length - 1, i + 1)] : stops[i];
}
export const bakeGradient = (w: number, h: number, stops: string[]) => bake(w, h, (x, y) => gradientColor(stops, y / Math.max(1, h - 1), x, y));

/** A horizon silhouette (mountains, hills, a forest edge, a city skyline) as a wrap-around strip
 *  `w` wide: `height(x)` gives each column's height in px; the body is lit from the top-left with
 *  a lighter rim, and `tex` can vary the fill (e.g. tree crowns). */
export function bakeRidge(w: number, h: number, height: (x: number) => number, base: string, opts: { rim?: string; tex?: (x: number, y: number, depth: number) => string | null } = {}) {
  const tops = Array.from({ length: w }, (_, x) => Math.round(h - Math.max(0, Math.min(h, height(x)))));
  return bake(w, h, (x, y) => {
    const top = tops[x];
    if (y < top) return null;
    const depth = y - top;
    const t = opts.tex?.(x, y, depth);
    if (t) return t;
    if (depth < 1 && opts.rim) return opts.rim;
    const slope = tops[(x + 1) % w] - tops[(x - 1 + w) % w];
    return slope > 0 ? shade(base, 0.12) : slope < 0 ? shade(base, -0.12) : base;
  });
}

/** draw a horizontally wrapping strip (a backdrop layer) scrolled by `scroll` px, across the screen */
export function drawStrip(g: Gfx, s: Sprite, scroll: number, y: number, screenW = 256) {
  const w = s.rows[0]?.length ?? 0;
  if (!w) return;
  let x = -(((scroll % w) + w) % w);
  for (; x < screenW; x += w) g.sprite(s, x, y);
}

// ── sprite helpers ──
/** a 1-px dark outline round a sprite's shape (makes small sprites pop against busy backdrops) */
export function outlined(s: Sprite, color = "#140c28"): Sprite {
  const h = s.rows.length;
  const w = s.rows[0]?.length ?? 0;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && s.rows[y][x] !== "." && s.rows[y][x] !== " ";
  const rows: string[] = [];
  for (let y = -1; y <= h; y++) {
    let row = "";
    for (let x = -1; x <= w; x++) {
      if (solid(x, y)) row += s.rows[y][x];
      else row += solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1) ? "§" : ".";
    }
    rows.push(row);
  }
  return sprite(rows, { ...s.pal, "§": color });
}
/** the same sprite in one flat colour (a hit-flash, a shadow, a silhouette) */
export function tinted(s: Sprite, color: string): Sprite {
  const pal: Record<string, string> = {};
  for (const k of Object.keys(s.pal)) pal[k] = color;
  return sprite(s.rows, pal);
}
/** a soft dithered oval shadow, w x h, to sit under characters */
export function bakeShadow(w: number, h: number, color = "#000000") {
  return bake(w, h, (x, y) => {
    const dx = (x + 0.5 - w / 2) / (w / 2);
    const dy = (y + 0.5 - h / 2) / (h / 2);
    const d = dx * dx + dy * dy;
    return d < 1 && 1 - d > bayer(x, y) * 0.9 ? color : null;
  });
}
