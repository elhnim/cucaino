// The island's NATURAL, unlevelled terrain height — the land as it would be if nothing had ever
// flattened a trail, a building pad or a village into it. Split out of terrain.ts as its own leaf
// module (no settlements/trade/rail/places import) so registry/settlements.ts (and footpaths.ts,
// trade.ts) can read REAL ground height and slope when siting a village, without the circular
// import terrain.ts's own stamps() would otherwise force (stamps() reads SETTLEMENTS to level their
// ground, so settlements.ts can't import terrain.ts back). terrain.ts imports `rawHeight`,
// `smooth` and `smoothedHeight` from here and uses them exactly as before — this is a pure
// extraction, not a behaviour change.
//
// Pure maths, deterministic, no three.js.
import { parkCoastR, seaDist } from "./island";

// ── value noise ──
function hash(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, oct = 4) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}
/** smoothstep (0..1), the same little helper terrain.ts has always used (identical to
 *  geom2d.ts's smoothstep — kept local so this module stays a true leaf, no sibling import) */
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** the park's land (the old little island's shape); `sd` = how far out to sea (negative inland) */
function parkHeight(x: number, z: number, sd: number): number {
  // rolling meadow hills
  let h = (fbm(x / 38 + 11, z / 38 - 7) - 0.45) * 11;
  // broad swells
  h += Math.sin(x / 61 + 1.3) * Math.cos(z / 53 - 0.7) * 3.5;
  // mountains with cliffs rising behind the park to the north (z very negative = north on the map),
  // shaped as they always were: they fall away where the park's old shore was, down to the
  // foothills before the Great Ridge rises
  const north = smooth(0.1, 0.9, (-z - 40) / 90) * smooth(-2, -40, Math.max(sd, Math.hypot(x, z) - parkCoastR(Math.atan2(x, z))));
  const ridge = Math.pow(fbm(x / 22 + 40, z / 22 + 3, 5), 1.6) * 60;
  h += north * (14 + ridge);
  // softer highlands in the far west
  const west = smooth(0.2, 1, (-x - 70) / 70) * smooth(0, -30, sd);
  h += west * fbm(x / 30 - 5, z / 30 + 9) * 16;
  return h * smooth(0, -26, sd);
}

/** the Great Ridge's spine: from the mountains behind the park away to the north-east */
const RIDGE: [number, number][] = [
  [-40, -165],
  [180, -380],
  [480, -640],
  [820, -930],
  [1150, -1210],
  [1460, -1470],
  [1760, -1690],
];
const RIDGE_LEN: number[] = (() => {
  const out = [0];
  for (let i = 1; i < RIDGE.length; i++) out.push(out[i - 1] + Math.hypot(RIDGE[i][0] - RIDGE[i - 1][0], RIDGE[i][1] - RIDGE[i - 1][1]));
  return out;
})();
const _rp = { d: 0, u: 0 };
/** distance from (x, z) to the Great Ridge's own spine, and how far along it (0..1) — exported so
 *  landform.test.ts can check Mount Everest's summit genuinely sits ON the ridge, not just somewhere
 *  in the Wildlands */
export function ridgeAt(x: number, z: number): typeof _rp {
  let best = Infinity;
  let bu = 0;
  for (let i = 0; i + 1 < RIDGE.length; i++) {
    const [ax, az] = RIDGE[i];
    const bx = RIDGE[i + 1][0] - ax;
    const bz = RIDGE[i + 1][1] - az;
    const L2 = bx * bx + bz * bz;
    const t = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * bz) / L2));
    const d = Math.hypot(x - ax - bx * t, z - az - bz * t);
    if (d < best) {
      best = d;
      bu = (RIDGE_LEN[i] + Math.sqrt(L2) * t) / RIDGE_LEN[RIDGE_LEN.length - 1];
    }
  }
  _rp.d = best;
  _rp.u = bu;
  return _rp;
}
/** the lone peak out east, and the north-west uplands */
export const LONE_PEAK = { x: 1980, z: -520, r: 260, h: 95 };
const UPLANDS = { x: 380, z: -1500, r: 520, h: 26 };

/** Mount Everest: riding the Great Ridge's own crest at u≈0.75 (well clear of the Great Falls/
 *  Treetop end of the ridge and of the Lone Peak/Highstone further east — registry/everest.ts's own
 *  site search checks the real distances), a sharp, craggy massif added ON TOP of the ridge's usual
 *  crest height (`wildHeight` below) so it reads as the ridge's own tallest summit, not a separate
 *  hill stuck beside it. `h` is picked so the total summit height clears the ridge's own highest
 *  crest (~160) and LONE_PEAK (95) by a wide, unmistakable margin — see landform.test.ts's "Everest
 *  is the island's tallest point by a clear margin". Frozen as plain numbers like LONE_PEAK — this
 *  constant IS the site (registry/everest.ts imports it rather than re-deriving a summit position). */
export const EVEREST_PEAK = { x: 1293, z: -1328, r: 330, h: 205 };
/** Mount Everest's TRUE summit: the real local maximum of rawHeight() near EVEREST_PEAK. The peak's
 *  own additive bump (below) is centred at EVEREST_PEAK, but the Great Ridge's own crest underneath
 *  it pulls the actual highest point a little way off-centre, so this is frozen separately (the same
 *  "search once, freeze the number" discipline as every settlement site — see landform.test.ts).
 *  Kept here, not in registry/everest*.ts, so anything wanting "where exactly is the top of the
 *  island" (the summit flag, the climb's final view, the Island map pin) can read it without pulling
 *  in the settlements module graph. */
export const EVEREST_SUMMIT = { x: 1287.3, z: -1307.3, height: 323.3 };

/** the Wildlands' land: plains, the Great Ridge, the lone peak and the uplands */
function wildHeight(x: number, z: number, sd: number): number {
  // broad rolling plains (dry land: the base sits well above the sea) with smaller hills on them
  let h = 7 + (fbm(x / 230 + 31, z / 230 - 17) - 0.45) * 30 + (fbm(x / 64 - 9, z / 64 + 4) - 0.45) * 9;
  // the Great Ridge: a long range of crags and snowy peaks, highest along its middle
  const rp = ridgeAt(x, z);
  const width = 85 + fbm(x / 300 + 4, z / 300 - 8) * 70;
  const along = Math.pow(Math.sin(Math.PI * Math.min(1, rp.u * 1.08)), 0.6);
  const crest = 30 + along * (55 + fbm(x / 160 - 3, z / 160 + 6) * 50);
  const k = Math.exp(-((rp.d / width) ** 2));
  const crag = 1 - Math.abs(2 * fbm(x / 46 + 13, z / 46 - 21, 5) - 1);
  h += k * (crest + crag * crag * 30 * (0.4 + along));
  // the lone peak (a tall cone with gullies down its flanks)
  const ld = Math.hypot(x - LONE_PEAK.x, z - LONE_PEAK.z) / LONE_PEAK.r;
  if (ld < 1.6) h += LONE_PEAK.h * Math.exp(-ld * ld * 2.2) * (0.85 + 0.3 * fbm(x / 35 + 2, z / 35 - 2, 3));
  // Mount Everest: a sharp pyramid summit riding the ridge's own crest. `core` is a clean, strictly
  // radial falloff (steep near the top, per the real mountain's own profile) — its own maximum sits
  // exactly at EVEREST_PEAK, which landform.test.ts relies on (the registered site IS the true
  // summit, not an approximation of wherever noise happens to peak). Craggy rock ridges/faces are
  // layered on as a small ADDITIVE texture, strictly bounded below `core` itself and fading to
  // nothing at the very top (smooth(0.12,0.5,ed)) and again out past the shoulders
  // (1-smooth(0.9,1.4,ed)) — real rock detail on the slopes, never strong enough to out-bid the
  // centre for the summit itself.
  const ed = Math.hypot(x - EVEREST_PEAK.x, z - EVEREST_PEAK.z) / EVEREST_PEAK.r;
  if (ed < 1.4) {
    const core = Math.exp(-Math.pow(ed, 1.9) * 2.6);
    const ea = Math.atan2(x - EVEREST_PEAK.x, z - EVEREST_PEAK.z);
    const faces = 0.5 + 0.5 * Math.cos(ea * 3 + 1.1);
    const crag = 1 - Math.abs(2 * fbm(x / 40 + 21, z / 40 - 33, 5) - 1);
    const texture = smooth(0.12, 0.5, ed) * (1 - smooth(0.9, 1.4, ed)) * (0.22 * faces + 0.3 * crag);
    h += EVEREST_PEAK.h * core * (1 + texture);
  }
  // the north-west uplands: a high rolling plateau with a steep edge
  const ud = Math.hypot(x - UPLANDS.x, z - UPLANDS.z) / UPLANDS.r;
  h += UPLANDS.h * (1 - smooth(0.75, 1.0, ud + (fbm(x / 120, z / 120) - 0.5) * 0.3));
  // down to the coast through wide lowlands
  return h * smooth(0, -70, sd);
}

/** how far the sea floor sits below the beach, `d` metres out from the grass line */
function seabedDrop(x: number, z: number, d: number): number {
  const lagoon = smooth(12, 24, d) * 3.2; // ~-3 m: bright sand, snorkelling depth
  const shelf = smooth(24, 34, d) * 3.8; // ~-7 m: the reef shelf
  const wall = smooth(37, 46, d) * 15; // ~-22 m: the deep blue beyond the reef
  // coral mounds and sand ripples on the lagoon floor and the shelf
  const mounds = smooth(16, 26, d) * (1 - smooth(36, 43, d)) * (fbm(x / 9 + 3, z / 9 - 8) - 0.45) * 5;
  const ripples = smooth(12, 20, d) * Math.sin(x * 0.7 + Math.sin(z * 0.13) * 3) * 0.12;
  return lagoon + shelf + wall - mounds - ripples;
}

/** the wild land before anything is levelled (no trails, no buildings, no villages) */
export function rawHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const sd = seaDist(x, z);
  // the park's land near the plaza, the Wildlands' beyond (blended over a wide band)
  const wPark = 1 - smooth(190, 340, r);
  let h = wPark > 0 ? parkHeight(x, z, sd) * wPark : 0;
  if (wPark < 1) h += wildHeight(x, z, sd) * (1 - wPark);
  // under the sea: a shallow sandy lagoon, a reef shelf with coral mounds, and a drop-off wall
  // into the deep blue
  const d = sd;
  if (d > 10) h -= seabedDrop(x, z, d);
  return h;
}

/** an 8-point locally-averaged height at (x, z) (kills the metre-to-metre noise, keeps the real
 *  hill/slope) — the exact smoothing terrain.ts's own settlement/road stamps use, so a site search
 *  here and the ground terrain.ts actually bakes always agree */
export function smoothedHeight(x: number, z: number): number {
  let s = rawHeight(x, z) * 2;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    s += rawHeight(x + Math.sin(a) * 3.5, z + Math.cos(a) * 3.5);
  }
  return s / 8;
}

/** how steep the NATURAL (unlevelled) ground is at (x, z): the gradient's magnitude, same units as
 *  terrain.ts's own slopeAt() but on rawHeight instead of the baked/levelled groundY — for siting a
 *  village on ground that's genuinely gentle, not just levelled to look that way afterwards */
export function naturalSlopeAt(x: number, z: number, e = 2): number {
  const dx = rawHeight(x + e, z) - rawHeight(x - e, z);
  const dz = rawHeight(x, z + e) - rawHeight(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

export interface FootprintStats {
  /** the steepest slope found anywhere in the footprint (rawHeight gradient magnitude) */
  maxSlope: number;
  /** highest minus lowest NATURAL height sampled across the footprint (how "stepped" a pad would
   *  need to be to cover it — low relief means one flat pad reads as natural, not built up) */
  relief: number;
  minH: number;
  maxH: number;
}
/** samples a grid of points across a disc of `radius` round (cx, cz) (skipping anything outside
 *  it) and reports the worst slope and the total relief found — used to site a village somewhere
 *  the WHOLE footprint is gentle, not just its own centre point */
export function footprintStats(cx: number, cz: number, radius: number, step = 10): FootprintStats {
  let minH = Infinity;
  let maxH = -Infinity;
  let maxSlope = 0;
  for (let dz = -radius; dz <= radius; dz += step)
    for (let dx = -radius; dx <= radius; dx += step) {
      if (dx * dx + dz * dz > radius * radius) continue;
      const x = cx + dx;
      const z = cz + dz;
      const h = rawHeight(x, z);
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
      const slope = naturalSlopeAt(x, z);
      if (slope > maxSlope) maxSlope = slope;
    }
  return { maxSlope, relief: maxH - minH, minH, maxH };
}
