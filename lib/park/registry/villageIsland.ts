// Coralcove Isle: a little tropical island far out in Cucaino Park's boundless ocean, home of the
// Tidewing Folk — small, cheerful sea-sprites with fin-shaped ears, shell necklaces and tiny
// glittery wings. Three villages share the island:
//   - Shellharbour (south): the market square with its stalls, the bakery and its oven, and the
//     harbour — a jetty where the fishing canoes moor and the fishers sit with their rods
//   - Stiltwater (east): stilt houses over a warm, knee-deep lagoon, joined by boardwalks
//   - Emberglen (west): round shell-roofed huts round the festival fire, gardens, washing lines
// plus a hill in the north with the Coralcove lighthouse and its lookout.
//
// Pure + deterministic (no three.js) so the engine (walking, swimming, landing), the renderer
// (world/village/**), the villagers' routines and the tests all read the same numbers:
//   - the land is a heightfield sampled on a fixed triangle grid (VILLAGE_GRID); the mesh uses the
//     very same triangles, so villageGroundY() is exactly where the grass/sand is
//   - its submerged slopes (villageSeaFloorY) rise from the deep sea floor to a shallow sandy reef
//     ring round the beach, so swimmers can wade ashore
//   - the jetty, the boardwalks and the stilt-house decks are walkable too (VILLAGE_DECKS)
//   - everything round that stands on the island (huts, trees, stalls, rocks...) is in
//     VILLAGE_OBSTACLES; villagers walk along VILLAGE_PATHS (a little graph kept clear of them)
// NOTE: must not import places.ts or terrain.ts (terrain imports places): the few shared numbers
// are repeated here and checked against terrain.ts by the tests.

/** the sea's resting surface (= terrain.WATER_Y) */
export const VILLAGE_WATER_Y = -0.25;
/** the deep sea floor around the island (= terrain.DEEP_FLOOR) */
const DEEP = -22;

export const VILLAGE_ISLAND = { id: "coralcove", name: "Coralcove Isle", clan: "the Tidewing Folk", x: 285, z: -300, r: 58 };
const X0 = VILLAGE_ISLAND.x;
const Z0 = VILLAGE_ISLAND.z;
const R = VILLAGE_ISLAND.r;

/** the lagoon's calm water surface (it's a raised, knee-deep tidal lagoon, fed by a spring) */
export const VILLAGE_LAGOON = { x: X0 + 21, z: Z0 - 4, rx: 13, rz: 10, rot: 0.2, waterY: 1.62 };
/** how far out (from the island centre) the submerged slopes reach the deep floor */
export const VILLAGE_SEA_R = 128;

// ── tiny deterministic noise ──

function hash2(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t: number) => t * t * (3 - 2 * t);
function noise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** a seeded xorshift rng (0..1) */
export function villageRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

// ── the shape of the land (local coordinates: relative to the island centre) ──

/** the coastline's radius (where the beach meets the sea) at angle a = atan2(lx, lz) */
export function villageCoastR(a: number): number {
  return R * (1 + 0.055 * Math.sin(3 * a + 0.7) + 0.035 * Math.sin(5 * a + 2.1) + 0.02 * Math.sin(8 * a + 0.3));
}

// the profile across the coast: s = distance / coast radius -> height
const PROFILE: [number, number][] = [
  [0.8, NaN], // (inland: the rolling meadow)
  [0.885, 1.45], // top of the beach
  [1.0, -0.7], // just under the waterline
  [1.12, -1.7],
  [1.24, -3.1], // the sandy shelf
  [1.31, -2.3], // the reef crest (a shallow ring)
  [1.4, -4.6],
  [2.05, DEEP - 1.2], // down the island's flanks to the deep floor
];

/** the rolling meadow's height: dry land stays above the crests of the ocean's swell (~+0.9) */
const LAND_Y = 2.6;
const HILL = { lx: 0, lz: -31, r: 19, h: 10.5 };
const LH_PAD = { lx: 0, lz: -31, r: 4.6 };
const LAG = { lx: 21, lz: -4, rx: 13, rz: 10, rot: 0.2 };
/** level terraces: [lx, lz, inner r, outer r, height] */
const FLATS: [number, number, number, number, number][] = [
  [-4, 30, 8, 12, 2.45], // Shellharbour market square
  [-25, 4, 7, 11, 2.85], // Emberglen fire circle
  [11, 25, 3.5, 6, 2.5], // the bakery yard
];

function lagoonE(lx: number, lz: number) {
  const dx = lx - LAG.lx;
  const dz = lz - LAG.lz;
  const c = Math.cos(LAG.rot);
  const s = Math.sin(LAG.rot);
  const u = (dx * c - dz * s) / LAG.rx;
  const v = (dx * s + dz * c) / LAG.rz;
  const a = Math.atan2(u, v);
  return Math.hypot(u, v) * (1 + 0.06 * Math.sin(3 * a + 1) + 0.04 * Math.sin(5 * a));
}

/** the island's height at a local point (the smooth truth the grid samples) */
function localHeight(lx: number, lz: number): number {
  const d = Math.hypot(lx, lz);
  const a = Math.atan2(lx, lz);
  const s = d / villageCoastR(a);
  const inland = LAND_Y + (noise(lx / 13 + 5, lz / 13 - 3, 3) - 0.5) * 0.9 + (noise(lx / 5, lz / 5, 4) - 0.5) * 0.18;
  let h: number;
  if (s <= PROFILE[0][0]) h = inland;
  else if (s >= PROFILE[PROFILE.length - 1][0]) h = PROFILE[PROFILE.length - 1][1];
  else {
    let i = 0;
    while (s > PROFILE[i + 1][0]) i++;
    const [s0, h0] = PROFILE[i];
    const [s1, h1] = PROFILE[i + 1];
    const a0 = Number.isNaN(h0) ? inland : h0;
    const k = (s - s0) / (s1 - s0);
    // smooth knees on the land and shelf, a straighter run down the deep flanks
    h = lerp(a0, h1, i >= 5 ? k * 0.35 + fade(k) * 0.65 : fade(k));
  }
  // ripples on the sandy shelf
  if (s > 1.02 && s < 1.4) h += Math.sin(lx * 0.6 + Math.sin(lz * 0.15) * 3) * 0.1 + (noise(lx / 6, lz / 6, 8) - 0.5) * 0.5;
  // the lighthouse hill (its north flank drops into the sea as a cliff)
  const hd = Math.hypot(lx - HILL.lx, lz - HILL.lz) / HILL.r;
  if (hd < 1) {
    const k = Math.pow(1 - fade(hd), 1.25);
    h += HILL.h * k * (0.9 + 0.2 * noise(lx / 4, lz / 4, 11));
  }
  const pd = Math.hypot(lx - LH_PAD.lx, lz - LH_PAD.lz);
  if (pd < LH_PAD.r + 3) {
    const top = LAND_Y + HILL.h + 0.2;
    h = lerp(h, top, 1 - smooth(LH_PAD.r, LH_PAD.r + 3, pd));
  }
  // level terraces
  for (const [fx, fz, r0, r1, fh] of FLATS) {
    const fd = Math.hypot(lx - fx, lz - fz);
    if (fd < r1) h = lerp(h, fh, 1 - smooth(r0, r1, fd));
  }
  // the lagoon: a knee-deep hollow with sandy banks
  const e = lagoonE(lx, lz);
  if (e < 1.35) {
    const floor = 1.2 - 0.18 * (1 - Math.min(1, e));
    h = lerp(h, floor, 1 - smooth(0.88, 1.3, e));
  }
  return h;
}

// ── the height grid (the mesh uses exactly these triangles) ──

/** grid spacing (m) and half-extent (m, local) of the island's land mesh */
export const VILLAGE_GRID = 1.6;
export const VILLAGE_EXTENT = 72;
export const VILLAGE_N = Math.round((VILLAGE_EXTENT * 2) / VILLAGE_GRID) + 1;
let grid: Float32Array | null = null;

/** the baked heights (row-major N x N: rows along z, columns along x, local -EXTENT..EXTENT) */
export function villageGrid(): Float32Array {
  if (grid) return grid;
  const N = VILLAGE_N;
  const g = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) g[j * N + i] = localHeight(-VILLAGE_EXTENT + i * VILLAGE_GRID, -VILLAGE_EXTENT + j * VILLAGE_GRID);
  grid = g;
  return g;
}

/** the land height at a world point, interpolated on the mesh's triangles (null off the grid) */
export function villageLandY(x: number, z: number): number | null {
  const fx = (x - X0 + VILLAGE_EXTENT) / VILLAGE_GRID;
  const fz = (z - Z0 + VILLAGE_EXTENT) / VILLAGE_GRID;
  const N = VILLAGE_N;
  if (!(fx >= 0 && fz >= 0 && fx < N - 1 && fz < N - 1)) return null;
  const g = villageGrid();
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const k = j * N + i;
  // cells are split along the (i+1, j) – (i, j+1) diagonal
  if (u + v <= 1) return g[k] + (g[k + 1] - g[k]) * u + (g[k + N] - g[k]) * v;
  return g[k + N + 1] + (g[k + N] - g[k + N + 1]) * (1 - u) + (g[k + 1] - g[k + N + 1]) * (1 - v);
}

/** the smooth height of the island (land and submerged slopes) at a world point, for the skirt mesh */
export function villageHeightAt(x: number, z: number): number {
  return localHeight(x - X0, z - Z0);
}

// ── decks: the jetty, the boardwalks over the lagoon and the stilt-house decks ──

export interface VillageDeck {
  id: string;
  kind: "jetty" | "boardwalk" | "deck";
  /** a straight plank walk from a to b (half = half its width), sloping from ya to yb; or a round deck (r) */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  half: number;
  ya: number;
  yb: number;
  r?: number;
}

const W = (lx: number, lz: number) => ({ x: X0 + lx, z: Z0 + lz });
const DECK_Y = 2.5;
const JETTY_Y = 1.6;

/** the stilt houses of Stiltwater (local): round decks on the lagoon */
const STILTS: [number, number, number][] = [
  // lx, lz, facing (rot towards the spine)
  [13, -11.5, 0],
  [25.5, -12, 0],
  [17.5, 4, Math.PI],
  [29.5, 3, Math.PI],
];
const SPINE_Z = -4;

function buildDecks(): VillageDeck[] {
  const out: VillageDeck[] = [];
  const seg = (id: string, kind: VillageDeck["kind"], a: { x: number; z: number }, b: { x: number; z: number }, half: number, ya: number, yb: number) =>
    out.push({ id, kind, ax: a.x, az: a.z, bx: b.x, bz: b.z, half, ya, yb });
  // the jetty: a long walk from the beach out into the harbour, with a wide T at the end
  const jb = W(6, 53.5);
  const je = W(6, 71);
  seg("jetty", "jetty", jb, je, 1.25, JETTY_Y, JETTY_Y);
  seg("jetty-t", "jetty", W(1.5, 71), W(10.5, 71), 1.3, JETTY_Y, JETTY_Y);
  // Stiltwater: a boardwalk spine across the lagoon, bank to bank, and a stub out to each house
  const west = W(4.5, SPINE_Z);
  const east = W(38, SPINE_Z);
  const wy = localHeight(4.5, SPINE_Z);
  const ey = localHeight(38, SPINE_Z);
  seg("spine-w", "boardwalk", west, W(10, SPINE_Z), 0.95, wy, DECK_Y - 0.1);
  seg("spine", "boardwalk", W(10, SPINE_Z), W(33, SPINE_Z), 0.95, DECK_Y - 0.1, DECK_Y - 0.1);
  seg("spine-e", "boardwalk", W(33, SPINE_Z), east, 0.95, DECK_Y - 0.1, ey);
  STILTS.forEach(([lx, lz], i) => {
    const toward = lz < SPINE_Z ? 1 : -1;
    seg(`stub-${i}`, "boardwalk", W(lx, lz + toward * 3.0), W(lx, SPINE_Z), 0.8, DECK_Y, DECK_Y - 0.1);
    const c = W(lx, lz);
    out.push({ id: `deck-${i}`, kind: "deck", ax: c.x, az: c.z, bx: c.x, bz: c.z, half: 0, ya: DECK_Y, yb: DECK_Y, r: 3.6 });
  });
  return out;
}
export const VILLAGE_DECKS: VillageDeck[] = buildDecks();

/** the deck under (x, z), if any: its height */
export function villageDeckY(x: number, z: number): number | null {
  let best: number | null = null;
  for (const d of VILLAGE_DECKS) {
    let y: number | null = null;
    if (d.r !== undefined) {
      if ((x - d.ax) ** 2 + (z - d.az) ** 2 <= d.r * d.r) y = d.ya;
    } else {
      const ux = d.bx - d.ax;
      const uz = d.bz - d.az;
      const L2 = ux * ux + uz * uz;
      const t = ((x - d.ax) * ux + (z - d.az) * uz) / L2;
      if (t >= 0 && t <= 1) {
        const px = d.ax + ux * t - x;
        const pz = d.az + uz * t - z;
        if (px * px + pz * pz <= d.half * d.half) y = d.ya + (d.yb - d.ya) * t;
      }
    }
    if (y !== null && (best === null || y > best)) best = y;
  }
  return best;
}

// ── walkable ground + the sea floor ──

/** land height above the sea where (x,z) is on the island's walkable ground (beach, paths, village
 *  squares, jetty/stilt-house decks, the knee-deep lagoon), else null */
export function villageGroundY(x: number, z: number): number | null {
  const dx = x - X0;
  const dz = z - Z0;
  if (dx * dx + dz * dz > (VILLAGE_EXTENT + 4) ** 2) return null;
  const deck = villageDeckY(x, z);
  if (deck !== null) return deck;
  const land = villageLandY(x, z);
  if (land === null) return null;
  // (the lagoon is knee-deep: you wade through it)
  if (land < VILLAGE_WATER_Y + 0.05 && !villageInLagoon(x, z)) return null;
  return land;
}

/** is (x, z) (world) in the lagoon (under its water) */
export function villageInLagoon(x: number, z: number): boolean {
  return lagoonE(x - X0, z - Z0) < 1.12;
}

/** the island's own sea floor (its submerged slopes rising out of the deep), for swimming near it;
 *  returns null far from it. (It meets the deep floor at the rim, so max() with the sea's floor is seamless.) */
export function villageSeaFloorY(x: number, z: number): number | null {
  const dx = x - X0;
  const dz = z - Z0;
  const d2 = dx * dx + dz * dz;
  if (d2 > VILLAGE_SEA_R * VILLAGE_SEA_R) return null;
  if (Math.abs(dx) < VILLAGE_EXTENT - 1 && Math.abs(dz) < VILLAGE_EXTENT - 1) {
    const g = villageLandY(x, z);
    if (g !== null) return g;
  }
  return localHeight(dx, dz);
}

// ── the villages' things ──

export type VillagePropKind =
  | "hut"
  | "bighut"
  | "stilthut"
  | "bakery"
  | "oven"
  | "lighthouse"
  | "stall"
  | "palm"
  | "moontree"
  | "coraltree"
  | "bush"
  | "rock"
  | "lantern"
  | "washline"
  | "garden"
  | "firepit"
  | "bench"
  | "totem"
  | "netrack"
  | "crates"
  | "bunting"
  | "well"
  | "flowers"
  | "shellpile"
  | "canoe";

export interface VillageProp {
  kind: VillagePropKind;
  x: number;
  z: number;
  /** base height (ground, or deck) */
  y: number;
  /** facing (radians, atan2 convention: the prop's front looks along (sin rot, cos rot)) */
  rot: number;
  s: number;
  seed: number;
  /** a style/colour variant */
  v: number;
  /** a length for washing lines / bunting / gardens (m) */
  len?: number;
  /** which village it belongs to */
  village?: "shellharbour" | "stiltwater" | "emberglen" | "lighthouse";
}

/** obstacle radius of one prop (0 = walk-through) at scale 1 */
const PROP_R: Record<VillagePropKind, number> = {
  hut: 2.5,
  bighut: 3.3,
  stilthut: 2.4,
  bakery: 3.0,
  oven: 1.1,
  lighthouse: 2.4,
  stall: 1.4,
  palm: 0.45,
  moontree: 0.6,
  coraltree: 0.55,
  bush: 0.7,
  rock: 1.0,
  lantern: 0.18,
  washline: 0,
  garden: 0,
  firepit: 1.3,
  bench: 0.5,
  totem: 0.4,
  netrack: 0.8,
  crates: 0.7,
  bunting: 0,
  well: 0.9,
  flowers: 0,
  shellpile: 0,
  canoe: 0.9,
};


/** the fire circle (centre of the festival fire) and the rings round it: benches, dancers */
const FIRE = { lx: -25, lz: 4 };
export const VILLAGE_FIRE = { ...W(FIRE.lx, FIRE.lz), benchR: 3.3, danceR: 5.4 };
const MARKET = { lx: -4, lz: 30 };
export const VILLAGE_MARKET = { ...W(MARKET.lx, MARKET.lz), r: 7.5 };
export const VILLAGE_LIGHTHOUSE = { ...W(LH_PAD.lx, LH_PAD.lz - 0.5), y: LAND_Y + HILL.h + 0.2, h: 11 };
const OVEN_L = { lx: 13.9, lz: 21.6, rot: -2.0 };
export const VILLAGE_OVEN = { ...W(OVEN_L.lx, OVEN_L.lz), rot: OVEN_L.rot };

function groundAt(x: number, z: number) {
  return villageDeckY(x, z) ?? villageLandY(x, z) ?? 0;
}

// lanterns (local), in the order the lantern-lighter lights them each dusk
const LANTERNS_L: [number, number][] = [
  [4.2, -24.3], // the lookout (the lighter comes down from the lighthouse)
  [-4.4, -21.2], // the hill path
  [-9.6, -14.5],
  [3, -2.2], // the lagoon's west bank
  [16, -3.2], // the boardwalk
  [27.3, -4.85],
  [35.5, -3.2],
  [-1.8, 14.2], // the crossroads
  [-10.5, 5.2], // path to Emberglen
  [-18.2, 9.5], // the fire circle
  [-31.8, -1.5],
  [7.8, 20.5], // the bakery
  [-8.2, 23.3], // the market
  [2.5, 38],
  [4.4, 45.5], // path to the jetty
  [7.0, 56], // the jetty
  [5.0, 64],
  [7.0, 69.8],
];

/** villager walking graph (local): nodes */
const NODES_L: [string, number, number][] = [
  ["market", MARKET.lx, MARKET.lz],
  ["market-n", -4, 21.5],
  ["market-s", -1, 38.5],
  ["market-w", -12.5, 33.5],
  ["jetty-base", 6, 50.5],
  ["jetty-mid", 6, 61],
  ["jetty-end", 6, 70.2],
  ["jetty-t-w", 2.5, 71],
  ["jetty-t-e", 9.5, 71],
  ["bakery", 8.5, 22.5],
  ["cross", -3.5, 12.5],
  ["lagoon-w", 2, -4],
  ["spine-1", 13, SPINE_Z],
  ["spine-2", 17.5, SPINE_Z],
  ["spine-3", 25.5, SPINE_Z],
  ["spine-4", 29.5, SPINE_Z],
  ["lagoon-e", 40, -4],
  ["east-beach", 49, 4],
  ["ember-e", -13, 6],
  ["fire-e", FIRE.lx + 8.4, FIRE.lz],
  ["fire-s", FIRE.lx, FIRE.lz + 8.4],
  ["fire-w", FIRE.lx - 8.4, FIRE.lz],
  ["fire-n", FIRE.lx, FIRE.lz - 8.4],
  ["gardens", -33, -15],
  ["west-beach", -48, 9],
  ["sw-beach", -24, 46],
  ["hill-foot", -8, -12],
  ["hill-mid", -8.5, -21],
  ["lookout", 2.5, -25.5],
  ["south-beach", 20, 51],
  ["stilt-0", 13, -8.5],
  ["stilt-1", 25.5, -9],
  ["stilt-2", 17.5, 1.0],
  ["stilt-3", 29.5, 0],
];
const EDGES_N: [string, string][] = [
  ["market", "market-n"],
  ["market", "market-s"],
  ["market", "market-w"],
  ["market-s", "jetty-base"],
  ["jetty-base", "jetty-mid"],
  ["jetty-mid", "jetty-end"],
  ["jetty-end", "jetty-t-w"],
  ["jetty-end", "jetty-t-e"],
  ["market-n", "bakery"],
  ["market-n", "cross"],
  ["cross", "lagoon-w"],
  ["cross", "ember-e"],
  ["lagoon-w", "spine-1"],
  ["spine-1", "spine-2"],
  ["spine-2", "spine-3"],
  ["spine-3", "spine-4"],
  ["spine-4", "lagoon-e"],
  ["lagoon-e", "east-beach"],
  ["spine-1", "stilt-0"],
  ["spine-3", "stilt-1"],
  ["spine-2", "stilt-2"],
  ["spine-4", "stilt-3"],
  ["ember-e", "fire-e"],
  ["fire-e", "fire-s"],
  ["fire-s", "fire-w"],
  ["fire-w", "fire-n"],
  ["fire-n", "fire-e"],
  ["fire-n", "gardens"],
  ["fire-w", "west-beach"],
  ["market-s", "sw-beach"],
  ["jetty-base", "south-beach"],
  ["lagoon-w", "hill-foot"],
  ["ember-e", "hill-foot"],
  ["hill-foot", "hill-mid"],
  ["hill-mid", "lookout"],
  ["gardens", "hill-foot"],
];

export interface VillagePathNode {
  id: string;
  x: number;
  z: number;
}
export const VILLAGE_PATHS: { nodes: VillagePathNode[]; edges: [number, number][] } = (() => {
  const nodes = NODES_L.map(([id, lx, lz]) => ({ id, ...W(lx, lz) }));
  const ix = (id: string) => {
    const i = nodes.findIndex((n) => n.id === id);
    if (i < 0) throw new Error(`village: unknown path node ${id}`);
    return i;
  };
  return { nodes, edges: EDGES_N.map(([a, b]) => [ix(a), ix(b)] as [number, number]) };
})();
export const villageNode = (id: string) => VILLAGE_PATHS.nodes.findIndex((n) => n.id === id);

function segDist2(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const ux = bx - ax;
  const uz = bz - az;
  const t = Math.min(1, Math.max(0, ((px - ax) * ux + (pz - az) * uz) / (ux * ux + uz * uz || 1)));
  return (ax + ux * t - px) ** 2 + (az + uz * t - pz) ** 2;
}
/** distance (m) from (x, z) (world) to the nearest village path */
export function pathDistance(x: number, z: number): number {
  const { nodes, edges } = VILLAGE_PATHS;
  let best = Infinity;
  for (const [a, b] of edges) best = Math.min(best, segDist2(x, z, nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z));
  return Math.sqrt(best);
}

/** named work spots for the villagers' routines (world): the node they walk to, an optional
 *  waypoint (round a stall counter), where they stand/sit and the way they face */
export interface VillageWorkSpot {
  id: string;
  node: string;
  x: number;
  z: number;
  face: number;
  via?: { x: number; z: number };
  sit?: boolean;
}

/** open ground kept free of trees: [id, lx, lz, r] (play areas, the splash pool) */
const PLAY_L: [string, number, number, number][] = [
  ["chase-meadow", -8, 3, 3.6],
  ["chase-beach", 45.5, 9, 3.6],
  ["skip", -7.5, 34, 3],
  ["splash", 10.5, 1.5, 2],
];

interface Layout {
  props: VillageProp[];
  work: VillageWorkSpot[];
  homes: { x: number; z: number; node: string; prop: number }[];
}

/** local -> world as a tuple (to spread into arguments) */
function wx(lx: number, lz: number): [number, number] {
  return [X0 + lx, Z0 + lz];
}

function buildLayout(): Layout {
  const out: VillageProp[] = [];
  const work: VillageWorkSpot[] = [];
  const add = (kind: VillagePropKind, lx: number, lz: number, rot: number, extra: Partial<VillageProp> = {}) => {
    const p = W(lx, lz);
    out.push({ kind, x: p.x, z: p.z, y: groundAt(p.x, p.z), rot, s: 1, seed: out.length * 7 + 3, v: 0, ...extra });
    return out[out.length - 1];
  };
  const face = (lx: number, lz: number, tx: number, tz: number) => Math.atan2(tx - lx, tz - lz);
  const spot = (id: string, node: string, x: number, z: number, faceA: number, extra: Partial<VillageWorkSpot> = {}) => void work.push({ id, node, x, z, face: faceA, ...extra });

  // ── Shellharbour: the market square, huts round it, the bakery, the harbour ──
  const M = MARKET;
  // four stalls round the square, fronts facing the middle; keepers behind, shoppers in front
  const stalls: [number, number][] = [
    [-6.2, 0],
    [6.2, 0.4],
    [-2.2, -6],
    [4.2, 5.5],
  ];
  stalls.forEach(([ox, oz], i) => {
    const st = add("stall", M.lx + ox, M.lz + oz, face(M.lx + ox, M.lz + oz, M.lx, M.lz), { v: i, village: "shellharbour" });
    const fx = Math.sin(st.rot);
    const fz = Math.cos(st.rot);
    // (side = the front turned a quarter)
    const sx = fz;
    const sz = -fx;
    spot(`stall-${i}`, "market", st.x - fx * 0.3, st.z - fz * 0.3, st.rot, { via: { x: st.x + sx * 2.3 - fx * 0.15, z: st.z + sz * 2.3 - fz * 0.15 } });
    spot(`shop-${i}`, "market", st.x + fx * 2.5 + sx * (i % 2 ? 0.5 : -0.5), st.z + fz * 2.5 + sz * (i % 2 ? 0.5 : -0.5), st.rot + Math.PI);
  });
  add("well", M.lx - 2.6, M.lz - 2.2, 0.3, { village: "shellharbour" });
  add("totem", M.lx - 4.5, M.lz - 4.8, face(M.lx - 4.5, M.lz - 4.8, M.lx, M.lz), { village: "shellharbour" });
  const shHuts: [number, number, number][] = [
    [-17, 26, 0],
    [-16, 37, 1],
    [-6, 44, 2],
    [-14, 20.5, 3],
    [8, 38, 4],
  ];
  shHuts.forEach(([lx, lz, v]) => add("hut", lx, lz, face(lx, lz, M.lx, M.lz), { v, village: "shellharbour", s: 0.95 + (v % 3) * 0.06 }));
  add("bakery", 11, 26.5, face(11, 26.5, M.lx, M.lz), { village: "shellharbour" });
  const oven = add("oven", OVEN_L.lx, OVEN_L.lz, OVEN_L.rot, { village: "shellharbour" });
  spot("oven", "bakery", oven.x + Math.sin(oven.rot) * 1.7, oven.z + Math.cos(oven.rot) * 1.7, oven.rot + Math.PI);
  add("crates", 7.0, 19.2, 0.4, { village: "shellharbour" });
  // lantern strings over the square
  add("bunting", M.lx - 6.5, M.lz - 3.5, Math.PI / 2 + 0.25, { len: 13, village: "shellharbour" });
  add("bunting", M.lx - 3.2, M.lz + 5.5, Math.PI / 2 - 0.1, { len: 9.5, v: 1, village: "shellharbour" });
  spot("sweep-market", "market", ...wx(M.lx + 2, M.lz + 1.5), 0.5);
  spot("flute-market", "market", ...wx(M.lx + 3.2, M.lz - 2.2), face(M.lx + 3.2, M.lz - 2.2, M.lx, M.lz));
  // the harbour: net racks and upturned canoes on the beach by the jetty
  const racks: [number, number, number][] = [
    [14.5, 48.5, 0.2],
    [-3.5, 50, -0.3],
  ];
  racks.forEach(([lx, lz, rot], i) => {
    const r = add("netrack", lx, lz, rot, { village: "shellharbour" });
    spot(`nets-${i}`, "jetty-base", r.x - Math.sin(rot) * 1.4, r.z - Math.cos(rot) * 1.4, rot);
  });
  add("canoe", 13, 54, 1.3, { village: "shellharbour", v: 1 });
  add("canoe", -8, 52.5, 1.9, { village: "shellharbour", v: 2 });
  add("crates", 2.2, 51.6, 0.1, { village: "shellharbour", v: 1 });
  add("shellpile", -12, 49, 0, { village: "shellharbour" });
  add("garden", 17, 36, 0.4, { len: 5, village: "shellharbour" });
  add("flowers", -10, 20, 0, { village: "shellharbour" });
  add("flowers", 3, 42, 0, { village: "shellharbour", v: 1 });
  // fishing: sit on the edge of the jetty's T, legs dangling over the water
  spot("fish-0", "jetty-t-w", ...wx(2.2, 72.05), 0, { sit: true });
  spot("fish-1", "jetty-t-e", ...wx(9.9, 72.05), 0, { sit: true });
  spot("fish-2", "jetty-t-e", ...wx(10.35, 70.6), Math.PI / 2, { sit: true });
  spot("harbour", "jetty-end", ...wx(4.0, 70.4), -2.4);

  // ── Emberglen: huts round the festival fire ──
  const F = FIRE;
  add("firepit", F.lx, F.lz, 0, { village: "emberglen" });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const b = add("bench", F.lx + Math.sin(a) * VILLAGE_FIRE.benchR, F.lz + Math.cos(a) * VILLAGE_FIRE.benchR, a + Math.PI / 2, { village: "emberglen" });
    spot(`sit-${i}`, `fire-${["s", "e", "n", "w"][i]}`, b.x, b.z, a + Math.PI, { sit: true });
  }
  for (let i = 0; i < 2; i++) {
    const a = 0.4 + Math.PI / 4 + i * Math.PI;
    spot(`drum-${i}`, i ? "fire-w" : "fire-e", ...wx(F.lx + Math.sin(a) * 3.0, F.lz + Math.cos(a) * 3.0), a + Math.PI, { sit: true });
  }
  // (the gaps between the huts are where the paths leave the circle: east, north, west, south)
  const egHuts: [number, number][] = [
    [0.78, 12.5],
    [2.36, 12.5],
    [3.93, 13],
    [5.5, 13.2],
    [0, 17.5],
  ];
  egHuts.forEach(([a, r], i) => {
    const lx = F.lx + Math.sin(a) * r;
    const lz = F.lz + Math.cos(a) * r;
    add(i === 3 ? "bighut" : "hut", lx, lz, face(lx, lz, F.lx, F.lz), { v: (i + 2) % 5, village: "emberglen", s: i === 3 ? 1 : 0.92 + (i % 2) * 0.08 });
  });
  add("totem", F.lx + 6.2, F.lz - 4.2, face(F.lx + 6.2, F.lz - 4.2, F.lx, F.lz), { village: "emberglen", v: 1 });
  add("crates", -12.5, 10.5, 0.6, { village: "emberglen", v: 2 });
  const washes: [number, number, number, number, string][] = [
    [-38.5, 5.5, 0.2, 5.5, "fire-w"],
    [-19.5, 17.5, 1.9, 5, "fire-s"],
    [-21.5, 32, 0.25, 5, "market-w"],
    [19.25, -11.75, Math.PI / 2, 6.5, "stilt-0"],
  ];
  washes.forEach(([lx, lz, rot, len, node], i) => {
    const w = add("washline", lx, lz, rot, { len, v: i % 3, village: i === 3 ? "stiltwater" : "emberglen" });
    // (the line runs along (sin rot, cos rot); the washer stands beside it, facing it)
    const sx = Math.cos(rot);
    const sz = -Math.sin(rot);
    if (i === 3) spot(`wash-${i}`, node, w.x - Math.sin(rot) * 2.6, w.z - Math.cos(rot) * 2.6 + 0.9, Math.PI);
    else spot(`wash-${i}`, node, w.x + sx * 0.9 + Math.sin(rot) * 0.6, w.z + sz * 0.9 + Math.cos(rot) * 0.6, rot - Math.PI / 2);
  });
  const gardens: [number, number, number, number][] = [
    [-37, -12, 0.6, 7],
    [-29, -19, 0.5, 6],
    [-43.5, -3, 0.9, 5],
    [40, -12, 1.3, 5],
  ];
  gardens.forEach(([lx, lz, rot, len], i) => {
    const g = add("garden", lx, lz, rot, { len, v: i % 3, village: i === 3 ? "stiltwater" : "emberglen" });
    const sx = Math.cos(rot);
    const sz = -Math.sin(rot);
    spot(`garden-${i}`, i === 3 ? "lagoon-e" : "gardens", g.x + sx * 1.9, g.z + sz * 1.9, rot - Math.PI / 2);
  });
  add("flowers", -17, -8, 0, { village: "emberglen" });
  add("flowers", -34, 16, 0, { village: "emberglen", v: 1 });

  // ── Stiltwater: houses on stilts over the lagoon ──
  STILTS.forEach(([lx, lz, rot], i) => add("stilthut", lx, lz, rot, { v: i, village: "stiltwater" }));
  spot("sweep-spine", "spine-2", ...wx(20.5, SPINE_Z), Math.PI / 2);

  // ── the lighthouse on the hill ──
  add("lighthouse", LH_PAD.lx, LH_PAD.lz - 0.5, Math.PI, { village: "lighthouse" });
  const lb = add("bench", LH_PAD.lx + 3.4, LH_PAD.lz + 2.6, 0.6, { village: "lighthouse" });
  spot("bench-lookout", "lookout", lb.x, lb.z, 0.6 + Math.PI, { sit: true });
  spot("lookout", "lookout", ...wx(1.0, -26.2), Math.PI * 0.8);

  // ── play areas ──
  for (const [id, lx, lz] of PLAY_L) spot(id, id === "chase-beach" ? "east-beach" : id === "splash" ? "lagoon-w" : id === "skip" ? "market" : "cross", ...wx(lx, lz), 0);

  // ── lanterns along the paths, on the jetty and the boardwalks (the lantern-lighter's round) ──
  for (const [lx, lz] of LANTERNS_L) add("lantern", lx, lz, 0);

  // doorsteps: every house's door, joined to the nearest path node
  const homes: Layout["homes"] = [];
  out.forEach((p, i) => {
    if (p.kind !== "hut" && p.kind !== "bighut" && p.kind !== "stilthut" && p.kind !== "bakery") return;
    const r = PROP_R[p.kind] * p.s + 0.55;
    const x = p.x + Math.sin(p.rot) * r;
    const z = p.z + Math.cos(p.rot) * r;
    let best = 0;
    let bd = Infinity;
    VILLAGE_PATHS.nodes.forEach((n, k) => {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    homes.push({ x, z, node: VILLAGE_PATHS.nodes[best].id, prop: i });
  });

  // ── trees: palms round the beach, moonfruit + coral trees inland, bushes, rocks ──
  // (kept off the paths, the doorstep walks, the work spots' approaches and the play areas)
  const rnd = villageRng(4242);
  const discs = out.filter((p) => PROP_R[p.kind] > 0 || p.len).map((p) => ({ x: p.x, z: p.z, r: Math.max(PROP_R[p.kind] * p.s, p.len ? p.len / 2 + 0.6 : 0) }));
  for (const [, lx, lz, r] of PLAY_L) discs.push({ ...W(lx, lz), r });
  discs.push({ x: VILLAGE_FIRE.x, z: VILLAGE_FIRE.z, r: VILLAGE_FIRE.danceR + 1.6 });
  const lines: [number, number, number, number][] = [];
  for (const h of homes) {
    const n = VILLAGE_PATHS.nodes[villageNode(h.node)];
    lines.push([h.x, h.z, n.x, n.z]);
  }
  for (const w of work) {
    const n = VILLAGE_PATHS.nodes[villageNode(w.node)];
    if (w.via) lines.push([n.x, n.z, w.via.x, w.via.z], [w.via.x, w.via.z, w.x, w.z]);
    else lines.push([n.x, n.z, w.x, w.z]);
  }
  const clearOf = (x: number, z: number, pad: number) =>
    discs.every((t) => (t.x - x) ** 2 + (t.z - z) ** 2 > (t.r + pad) ** 2) &&
    villageDeckY(x, z) === null &&
    pathDistance(x, z) > pad + 1.0 &&
    lines.every(([ax, az, bx, bz]) => segDist2(x, z, ax, az, bx, bz) > (pad + 0.8) ** 2) &&
    lagoonE(x - X0, z - Z0) > 1.3;
  const tryPlace = (kind: VillagePropKind, lx: number, lz: number, pad: number, extra: Partial<VillageProp> = {}) => {
    const p = W(lx, lz);
    const y = villageLandY(p.x, p.z);
    if (y === null || y < 1.35) return false;
    if (!clearOf(p.x, p.z, pad)) return false;
    add(kind, lx, lz, rnd() * Math.PI * 2, extra);
    discs.push({ x: p.x, z: p.z, r: PROP_R[kind] * (extra.s ?? 1) });
    return true;
  };
  // palms: a ring along the top of the beach, leaning out to sea
  for (let i = 0, n = 0; i < 110 && n < 30; i++) {
    const a = (i / 110) * Math.PI * 2 + rnd() * 0.05;
    const r = villageCoastR(a) * (0.79 + rnd() * 0.07);
    if (tryPlace("palm", Math.sin(a) * r, Math.cos(a) * r, 2.3, { s: 0.85 + rnd() * 0.35, v: Math.floor(rnd() * 3) })) {
      out[out.length - 1].rot = a; // (lean seawards)
      n++;
    }
  }
  // inland trees: a seeded scatter, kept out of the squares
  const inland: [VillagePropKind, number, number][] = [
    ["moontree", 14, 2.8],
    ["coraltree", 12, 2.6],
    ["bush", 26, 1.3],
    ["rock", 10, 1.6],
  ];
  for (const [kind, count, pad] of inland) {
    let n = 0;
    for (let k = 0; k < 1200 && n < count; k++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * villageCoastR(a) * (kind === "rock" ? 0.93 : 0.8);
      const lx = Math.sin(a) * r;
      const lz = Math.cos(a) * r;
      if (Math.hypot(lx - M.lx, lz - M.lz) < 10 || Math.hypot(lx - LH_PAD.lx, lz - LH_PAD.lz) < 6.5) continue;
      if (tryPlace(kind, lx, lz, pad, { s: kind === "rock" ? 0.7 + rnd() * 0.8 : 0.8 + rnd() * 0.4, v: Math.floor(rnd() * 3) })) n++;
    }
  }
  return { props: out, work, homes };
}

const LAYOUT = buildLayout();
export const VILLAGE_PROPS: VillageProp[] = LAYOUT.props;
export const VILLAGE_WORK: VillageWorkSpot[] = LAYOUT.work;
/** the doorsteps of the houses (world), with the path node each one hangs off */
export const VILLAGE_HOMES: { x: number; z: number; node: string; prop: number }[] = LAYOUT.homes;
export const villageWork = (id: string) => {
  const w = VILLAGE_WORK.find((s) => s.id === id);
  if (!w) throw new Error(`village: unknown work spot ${id}`);
  return w;
};

/** round things to walk around (houses, trees, rocks, stalls) */
export const VILLAGE_OBSTACLES: { x: number; z: number; r: number }[] = VILLAGE_PROPS.filter((p) => PROP_R[p.kind] > 0).map((p) => ({ x: p.x, z: p.z, r: PROP_R[p.kind] * p.s }));

/** the lanterns, in the lantern-lighter's order (world x/z, the lamp's height) */
export const VILLAGE_LANTERNS: { x: number; z: number; y: number }[] = VILLAGE_PROPS.filter((p) => p.kind === "lantern").map((p) => ({ x: p.x, z: p.z, y: p.y + 2.3 }));

/** heights (m above the prop's base) the renderer builds to: hut roof tip, bakery chimney top */
export const HUT_TOP = 5.0;
export const BAKERY_CHIMNEY_TOP = 6.3;
/** where the bakery's chimney stands (bakery-local x, z) */
export const BAKERY_CHIMNEY = { x: -1.5, z: -1.3 };

/** chimneys and smoke holes (world): the bakery's chimney first, then some of the huts' roof tips */
export const VILLAGE_SMOKE: { x: number; y: number; z: number; big: boolean }[] = (() => {
  const out: { x: number; y: number; z: number; big: boolean }[] = [];
  for (const p of VILLAGE_PROPS) {
    if (p.kind === "bakery") {
      // (a prop's local x runs along (cos rot, -sin rot), local z along (sin rot, cos rot))
      const c = Math.cos(p.rot);
      const s = Math.sin(p.rot);
      out.unshift({ x: p.x + BAKERY_CHIMNEY.x * c + BAKERY_CHIMNEY.z * s, z: p.z - BAKERY_CHIMNEY.x * s + BAKERY_CHIMNEY.z * c, y: p.y + BAKERY_CHIMNEY_TOP, big: true });
    } else if ((p.kind === "hut" || p.kind === "bighut" || p.kind === "stilthut") && p.seed % 3 !== 0) {
      out.push({ x: p.x, z: p.z, y: p.y + HUT_TOP * (p.kind === "bighut" ? 1.3 : p.kind === "stilthut" ? 0.86 : 1) * p.s, big: false });
    }
  }
  return out;
})();

// ── named spots (landing, HUD) ──

export const VILLAGE_SPOTS: { id: string; name: string; x: number; z: number; kind: "beach" | "square" | "jetty" | "lookout" | "fire" | "market" }[] = [
  { id: "coralcove-market", name: "Shellharbour Market", ...W(MARKET.lx + 1.5, MARKET.lz + 1.5), kind: "market" },
  { id: "coralcove-jetty", name: "Shellharbour Jetty", ...W(6, 58), kind: "jetty" },
  { id: "coralcove-fire", name: "Emberglen Fire Circle", ...W(FIRE.lx + 7.6, FIRE.lz + 1.5), kind: "fire" },
  { id: "coralcove-stiltwater", name: "Stiltwater Boardwalk", ...W(21.5, SPINE_Z), kind: "square" },
  { id: "coralcove-lookout", name: "Lighthouse Lookout", ...W(2.5, -25), kind: "lookout" },
  { id: "coralcove-south-beach", name: "Sunny Sands", ...W(21, 49), kind: "beach" },
  { id: "coralcove-west-beach", name: "Seaglass Beach", ...W(-48.5, 11), kind: "beach" },
  { id: "coralcove-east-beach", name: "Starfish Beach", ...W(49.5, 3), kind: "beach" },
];

// ── the villagers you can talk to ──

export const VILLAGERS_TALK: { id: string; name: string; role: string; lines: string[] }[] = [
  {
    id: "coralie",
    name: "Grandma Coralie",
    role: "elder",
    lines: [
      "Welcome to Coralcove, little traveller! We're the Tidewing Folk.",
      "Our wings are too tiny to fly — but they sparkle when we're happy!",
      "Come to the Emberglen fire at sunset. There's dancing and drums!",
      "My grandma's grandma found this island riding on a turtle's back.",
    ],
  },
  {
    id: "kip",
    name: "Kip the Fisher",
    role: "fisher",
    lines: [
      "Shhh... the fish are nearly biting!",
      "I once caught a fish that sang a sea shanty. Honest!",
      "We only keep what we need — the rest swim home to their mums.",
      "See the canoes? They sail right round the island and back.",
    ],
  },
  {
    id: "melo",
    name: "Melo the Drummer",
    role: "musician",
    lines: ["Boom-ba-boom! Can you clap along?", "The sea taught us our songs. Listen: shhh-hush, shhh-hush.", "Tonight the whole village dances round the fire!"],
  },
  {
    id: "bun",
    name: "Auntie Bun",
    role: "baker",
    lines: ["Fresh seaweed buns! Still warm from the oven!", "The secret ingredient? A pinch of moonfruit sugar.", "My oven's so old, it was built by a crab named Clive."],
  },
  {
    id: "lumen",
    name: "Lumen the Lantern-Lighter",
    role: "lantern-lighter",
    lines: [
      "When the sun sets, I light every lantern on Coralcove. All eighteen!",
      "The lighthouse helps our canoes find their way home at night.",
      "Moonfruit trees glow at night — they show us the path.",
    ],
  },
  {
    id: "pip",
    name: "Pip",
    role: "child",
    lines: ["Tag! You're it! Hee hee!", "Have you met the bubblepups? They LOVE belly rubs!", "I can jump the skipping rope a hundred times!"],
  },
  {
    id: "wren",
    name: "Wren",
    role: "child",
    lines: ["Did you come on a dragon?! Wooow!", "The lagoon is warm! You can splash in it!", "When I grow up, my wings will be as sparkly as Grandma's!"],
  },
  {
    id: "marisol",
    name: "Marisol",
    role: "gardener",
    lines: ["These are sea-melons. They taste like sunshine!", "Shell-flowers only open when you sing to them.", "Everything grows big here — the rain is extra rainy!"],
  },
  {
    id: "tully",
    name: "Harbourmaster Tully",
    role: "harbourmaster",
    lines: ["Ahoy! Mind the planks — they're a bit squeaky.", "Three canoes out, one canoe in. All is well!", "The gulls here steal buns. Keep an eye on yours!"],
  },
];
