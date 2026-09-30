// Cucaino Park's floating islands in the sky: big floating mountains (a rocky peak rising off
// one side of a wide walkable meadow, cliffs, pines, a waterfall) and smaller meadow / ruins /
// crystal / garden islands. Kids fly up on a dragon or a manta, land on a top and explore on foot;
// every island hides a treasure chest.
//
// Pure + deterministic (no three.js) so the engine, the renderer (world/fantasy/sky.ts), the Star
// Shards (quests3d via fantasy/placement.ts) and the tests all read the same numbers:
//   - each top is a gentle heightfield sampled on a fixed triangle grid (SKY_GRID) — the mesh uses
//     the very same triangles, so skyTopY() is exactly where the grass is (feet sit on it)
//   - islands only bob up and down (skyBob, never rotate), so standing on one is easy
//   - peaks are not walkable (skyTopY → null there) and are listed in SKY_OBSTACLES, with the
//     trees, rocks, ruins and crystals on the tops
// One entry in DEFS = one island; move it and the mesh, obstacles, treasure and shard follow.

export type SkyIslandKind = "mountain" | "meadow" | "ruins" | "crystal" | "garden";

export interface SkyIsland {
  id: string;
  name: string;
  x: number;
  z: number;
  /** base height of the walkable top (the heightfield wobbles gently around it) */
  y: number;
  /** top radius: the walkable disc */
  r: number;
  kind: SkyIslandKind;
  /** where the treasure chest sits on the walkable top (world x/z) */
  treasure: { x: number; z: number };
  // ── extras for the renderer / engine ──
  /** the rocky peak (mountains): world x/z centre, base radius r (not walkable), height h above y */
  peak?: { x: number; z: number; r: number; h: number };
  /** how far the rocky underside hangs below y (to its tip) */
  depth: number;
  /** the waterfall: a spring on the top (world x/z) that runs off the edge at angle `fall`
   *  (radians, atan2(dx, dz) like the rest of the park) */
  spring: { x: number; z: number };
  fall: number;
  /** a good open landing spot on the top, clear of obstacles (world x/z; Star Shards go here) */
  landing: { x: number; z: number };
  /** a seed for the geometry's little irregularities */
  seed: number;
}

/** heightfield grid spacing (m) — the renderer triangulates the top on exactly this grid */
export const SKY_GRID = 2.5;
/** the top mesh runs this far past the walkable radius before the grassy lip rolls over */
export const SKY_LIP = 1.2;

interface Def {
  id: string;
  name: string;
  kind: SkyIslandKind;
  x: number;
  z: number;
  y: number;
  r: number;
  /** mountains: peak base radius + height; its centre sits `off` * r out towards `peakA` */
  peak?: { r: number; h: number; off: number; a?: number };
  /** treasure: polar offset (angle, fraction of r) from the island centre (or the peak foot) */
  tr: [number, number];
  /** waterfall edge angle (relative to the island's outward direction) */
  fallA: number;
  amp: number;
  seed: number;
}

// angle convention: atan2(x, z) — 0 = +z (south on the map), π = north (the mountain range)
const DEFS: Def[] = [
  // ── the floating mountains ──
  { id: "thunder-peak", name: "Thunder Peak", kind: "mountain", x: 0, z: -132, y: 100, r: 32, peak: { r: 12.5, h: 25, off: 0.47 }, tr: [1.05, 0.62], fallA: -1.1, amp: 1.1, seed: 11 },
  { id: "cloudtop", name: "Cloudtop Mountain", kind: "mountain", x: -102, z: 14, y: 78, r: 26, peak: { r: 10, h: 18, off: 0.48 }, tr: [-1.2, 0.6], fallA: 1.3, amp: 1.0, seed: 23 },
  { id: "dragons-crown", name: "Dragon's Crown", kind: "mountain", x: 122, z: 124, y: 66, r: 22, peak: { r: 8.5, h: 20, off: 0.5 }, tr: [1.25, 0.6], fallA: -1.4, amp: 0.9, seed: 37 },
  { id: "eagle-rock", name: "Eagle Rock", kind: "mountain", x: 152, z: -40, y: 86, r: 20, peak: { r: 7.5, h: 14, off: 0.5 }, tr: [-1.3, 0.58], fallA: 1.5, amp: 0.9, seed: 41 },
  // ── the little sky islands ──
  { id: "buttercup-meadow", name: "Buttercup Meadow", kind: "meadow", x: -12, z: 74, y: 50, r: 11, tr: [2.4, 0.45], fallA: 0.4, amp: 0.55, seed: 53 },
  { id: "sky-temple", name: "Sky Temple", kind: "ruins", x: 46, z: -52, y: 62, r: 13, tr: [0.2, 0.05], fallA: 2.2, amp: 0.4, seed: 67 },
  { id: "crystal-spire", name: "Crystal Spire", kind: "crystal", x: -50, z: -42, y: 72, r: 9, tr: [2.8, 0.4], fallA: -2.2, amp: 0.5, seed: 71 },
  { id: "cloud-garden", name: "Cloud Garden", kind: "garden", x: 58, z: 32, y: 56, r: 12, tr: [-2.5, 0.5], fallA: 1.9, amp: 0.45, seed: 83 },
  { id: "sunset-ruins", name: "Sunset Ruins", kind: "ruins", x: -132, z: 108, y: 60, r: 12, tr: [0.3, 0.05], fallA: -1.9, amp: 0.45, seed: 97 },
  { id: "lantern-isle", name: "Lantern Isle", kind: "garden", x: -62, z: -150, y: 94, r: 10, tr: [2.6, 0.5], fallA: 1.2, amp: 0.45, seed: 101 },
];

// ── tiny deterministic noise (same family as terrain.ts) ──
function hash(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s);
  const b = hash(xi + 1, yi, s);
  const c = hash(xi, yi + 1, s);
  const d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ── build the islands ──
const outward = (d: Def) => Math.atan2(d.x, d.z);
const polar = (a: number, dist: number) => ({ x: Math.sin(a) * dist, z: Math.cos(a) * dist });

export const SKY_ISLANDS: SkyIsland[] = DEFS.map((d) => {
  const out = outward(d);
  let peak: SkyIsland["peak"];
  let treasureLocal: { x: number; z: number };
  if (d.peak) {
    // the peak rises off the far side (away from the park), so the meadow faces the view
    const pa = d.peak.a ?? out;
    const pc = polar(pa, d.r * d.peak.off);
    peak = { x: d.x + pc.x, z: d.z + pc.z, r: d.peak.r, h: d.peak.h };
    // the treasure is tucked at the peak's foot, round to one side
    const ta = pa + Math.PI + d.tr[0];
    const t = polar(ta, d.peak.r + 3.2);
    treasureLocal = { x: pc.x + t.x, z: pc.z + t.z };
  } else {
    treasureLocal = polar(out + d.tr[0], d.r * d.tr[1]);
  }
  // the waterfall runs off the edge at fallA from the outward direction; the spring sits inward
  const fall = out + d.fallA;
  const springD = d.peak ? d.r * 0.35 : d.r * 0.32;
  let spring = polar(fall, springD);
  if (d.peak) {
    // mountains: the spring bubbles up at the peak's foot, on the waterfall's side
    const pc = { x: peak!.x - d.x, z: peak!.z - d.z };
    const toward = Math.atan2(Math.sin(fall) * d.r - pc.x, Math.cos(fall) * d.r - pc.z);
    const s = polar(toward, d.peak.r + 1.6);
    spring = { x: pc.x + s.x, z: pc.z + s.z };
  }
  // landing: an open spot ~7 m from the treasure, towards the middle of the meadow
  const tl = treasureLocal;
  const towardMid = d.peak ? Math.atan2(-(peak!.x - d.x), -(peak!.z - d.z)) : Math.atan2(-tl.x, -tl.z);
  let landing = polar(towardMid, 7.5);
  landing = { x: tl.x + landing.x, z: tl.z + landing.z };
  if (Math.hypot(landing.x, landing.z) > d.r - 3) {
    const k = (d.r - 3) / Math.hypot(landing.x, landing.z);
    landing = { x: landing.x * k, z: landing.z * k };
  }
  return {
    id: d.id,
    name: d.name,
    x: d.x,
    z: d.z,
    y: d.y,
    r: d.r,
    kind: d.kind,
    treasure: { x: d.x + tl.x, z: d.z + tl.z },
    peak,
    depth: d.peak ? d.r * 1.25 + 6 : d.r * 1.55,
    spring: { x: d.x + spring.x, z: d.z + spring.z },
    fall,
    landing: { x: d.x + landing.x, z: d.z + landing.z },
    seed: d.seed,
  };
});

const DEF_OF = new Map(DEFS.map((d) => [d.id, d]));
const ISL_OF = new Map(SKY_ISLANDS.map((s) => [s.id, s]));

export function skyIslandById(id: string): SkyIsland | undefined {
  return ISL_OF.get(id);
}

/** the top's heightfield at a grid node (island-local grid indices), relative to island.y */
function nodeH(isl: SkyIsland, i: number, j: number): number {
  const d = DEF_OF.get(isl.id)!;
  const lx = i * SKY_GRID;
  const lz = j * SKY_GRID;
  const dist = Math.hypot(lx, lz);
  // rolling hummocks
  let h = (vnoise(lx / 11 + d.seed * 1.7, lz / 11 - d.seed, d.seed) - 0.5) * 2 * d.amp;
  h += (vnoise(lx / 5 + 3, lz / 5 + d.seed, d.seed + 7) - 0.5) * 0.35 * d.amp;
  // a gentle dome, and the shoulder rolling down towards the lip
  h += (1 - Math.min(1, (dist / (isl.r + SKY_LIP)) ** 2)) * (0.5 + isl.r * 0.02);
  h -= smooth(isl.r * 0.72, isl.r + SKY_LIP, dist) * 0.55;
  // foothills rising towards the peak (walkable, gentle)
  if (isl.peak) {
    const dp = Math.hypot(isl.x + lx - isl.peak.x, isl.z + lz - isl.peak.z);
    h += (1 - smooth(isl.peak.r * 0.8, isl.peak.r * 2.1, dp)) * 2.2;
  }
  return h;
}

const nodeCache = new Map<string, number>();
function nodeHC(isl: SkyIsland, i: number, j: number): number {
  const k = `${isl.id}:${i}:${j}`;
  let v = nodeCache.get(k);
  if (v === undefined) {
    v = nodeH(isl, i, j);
    nodeCache.set(k, v);
  }
  return v;
}

/**
 * The top's height (relative to island.y, no bob) at island-local (lx, lz), linearly
 * interpolated on the SKY_GRID triangles: every square cell (i..i+1, j..j+1) is split along its
 * (i+1, j)–(i, j+1) diagonal. The renderer builds the grass on exactly these triangles.
 */
export function skyLocalHeight(isl: SkyIsland, lx: number, lz: number): number {
  const gx = lx / SKY_GRID;
  const gz = lz / SKY_GRID;
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const fx = gx - i;
  const fz = gz - j;
  if (fx + fz <= 1) {
    const h00 = nodeHC(isl, i, j);
    return h00 + (nodeHC(isl, i + 1, j) - h00) * fx + (nodeHC(isl, i, j + 1) - h00) * fz;
  }
  const h11 = nodeHC(isl, i + 1, j + 1);
  return h11 + (nodeHC(isl, i, j + 1) - h11) * (1 - fx) + (nodeHC(isl, i + 1, j) - h11) * (1 - fz);
}

/** height of a grid node (for the renderer) */
export function skyNodeHeight(isl: SkyIsland, i: number, j: number): number {
  return nodeHC(isl, i, j);
}

/** small vertical bob (≤ 0.45 m, one slow swell every ~20 s) — islands never rotate */
export function skyBob(id: string, t: number): number {
  const isl = ISL_OF.get(id);
  const ph = isl ? isl.seed * 1.37 : 0;
  return Math.sin(t * 0.31 + ph) * 0.45;
}

/** the island (if any) whose top footprint (walkable disc, incl. the peak) contains (x, z) */
export function skyIslandAt(x: number, z: number): SkyIsland | null {
  for (const s of SKY_ISLANDS) if ((x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r) return s;
  return null;
}

/** is (x, z) on the walkable part of this island's top (inside the disc, off the peak)? */
export function skyWalkable(s: SkyIsland, x: number, z: number): boolean {
  if ((x - s.x) ** 2 + (z - s.z) ** 2 > s.r * s.r) return false;
  if (s.peak && (x - s.peak.x) ** 2 + (z - s.peak.z) ** 2 < s.peak.r * s.peak.r) return false;
  return true;
}

/** the top's height at (x, z) with no bob (props, chests, shards) */
export function skyBaseY(s: SkyIsland, x: number, z: number): number {
  return s.y + skyLocalHeight(s, x - s.x, z - s.z);
}

/** walkable surface height at (x, z) at time t (includes the gentle bob), or null if (x, z) is
 *  not over a walkable top (off every island, or on a peak) */
export function skyTopY(x: number, z: number, t: number): { y: number; id: string } | null {
  const s = skyIslandAt(x, z);
  if (!s || !skyWalkable(s, x, z)) return null;
  return { y: skyBaseY(s, x, z) + skyBob(s.id, t), id: s.id };
}

// ── what stands on the tops ──
export type SkyPropKind = "pine" | "round" | "birch" | "blossom" | "bush" | "rock" | "pillar" | "broken" | "arch" | "altar" | "crystal" | "shrine" | "sign" | "flowers" | "lantern" | "mushroom";
export interface SkyProp {
  island: string;
  kind: SkyPropKind;
  /** world x/z */
  x: number;
  z: number;
  /** size (trees: scale of the unit tree; rocks/crystals: metres) */
  s: number;
  rot: number;
}

/** obstacle radius of a prop at s = 1 (0 = walk through) */
const PROP_R: Record<SkyPropKind, number> = { pine: 0.9, round: 1.05, birch: 0.7, blossom: 1.1, bush: 1.0, rock: 0.95, pillar: 0.95, broken: 0.95, arch: 0, altar: 1.6, crystal: 1.0, shrine: 2.1, sign: 0.35, flowers: 0, lantern: 0.3, mushroom: 0 };
/** the space a prop needs from others (m, at s = 1) */
const PROP_ROOM: Record<SkyPropKind, number> = { pine: 2.6, round: 4, birch: 2.6, blossom: 4, bush: 1.3, rock: 1.1, pillar: 1.3, broken: 1.3, arch: 4.6, altar: 2.2, crystal: 1.4, shrine: 2.8, sign: 0.8, flowers: 1.6, lantern: 0.6, mushroom: 1.2 };
const IS_TREE = new Set<SkyPropKind>(["pine", "round", "birch", "blossom"]);

/** tree scale → metres (trees are built at unit scale ~11–13 m tall) */
const TREE_S: Partial<Record<SkyPropKind, [number, number]>> = { pine: [0.5, 0.78], round: [0.5, 0.7], birch: [0.5, 0.7], blossom: [0.5, 0.66] };

type Recipe = [SkyPropKind, number][];
const RECIPES: Record<SkyIslandKind, (s: SkyIsland) => Recipe> = {
  mountain: (s) => [
    ["pine", Math.round(s.r * 0.62)],
    ["round", 2],
    ["birch", s.r > 25 ? 2 : 1],
    ["bush", Math.round(s.r * 0.18)],
    ["rock", Math.round(s.r * 0.22)],
    ["flowers", Math.round(s.r * 0.2)],
    ["mushroom", 3],
    ["sign", 1],
  ],
  meadow: () => [["round", 2], ["birch", 2], ["bush", 3], ["rock", 2], ["flowers", 7], ["mushroom", 3], ["sign", 1]],
  ruins: () => [["blossom", 1], ["round", 1], ["pillar", 2], ["broken", 3], ["rock", 3], ["bush", 2], ["flowers", 3]],
  crystal: () => [["shrine", 1], ["crystal", 6], ["pine", 3], ["rock", 3], ["flowers", 2]],
  garden: () => [["shrine", 1], ["blossom", 3], ["bush", 5], ["flowers", 9], ["mushroom", 2], ["lantern", 4]],
};

function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

/** where the waterfall's top stream runs: spring → the lip (world x/z) */
export function skyStreamEnd(s: SkyIsland): { x: number; z: number } {
  return { x: s.x + Math.sin(s.fall) * (s.r + SKY_LIP), z: s.z + Math.cos(s.fall) * (s.r + SKY_LIP) };
}

function planProps(s: SkyIsland): SkyProp[] {
  const r = rng(s.seed * 7717 + 3);
  const out: SkyProp[] = [];
  const room: { x: number; z: number; r: number }[] = [
    { x: s.treasure.x, z: s.treasure.z, r: 2.6 },
    { x: s.landing.x, z: s.landing.z, r: s.r > 15 ? 5 : 3.4 },
  ];
  const put = (kind: SkyPropKind, x: number, z: number, sz: number, rot: number) => {
    out.push({ island: s.id, kind, x, z, s: sz, rot });
    room.push({ x, z, r: PROP_ROOM[kind] * (IS_TREE.has(kind) ? sz * 1.3 : kind === "rock" || kind === "crystal" ? sz : 1) });
  };
  const end = skyStreamEnd(s);
  const ok = (x: number, z: number, need: number, edgePad: number, byLanding = false) => {
    if (!skyWalkable(s, x, z)) return false;
    if (Math.hypot(x - s.x, z - s.z) > s.r - edgePad) return false;
    if (s.peak && Math.hypot(x - s.peak.x, z - s.peak.z) < s.peak.r + 0.8 + need * 0.5) return false;
    if (distToSeg(x, z, s.spring.x, s.spring.z, end.x, end.z) < 1.6 + need * 0.6) return false;
    // keep the stepping-stone path from the landing spot to the treasure clear
    if (!byLanding && distToSeg(x, z, s.landing.x, s.landing.z, s.treasure.x, s.treasure.z) < 1.3 + need * 0.6) return false;
    for (const o of room) if (!(byLanding && o === room[1]) && Math.hypot(o.x - x, o.z - z) < o.r + need) return false;
    return true;
  };
  // ruins: a great broken arch in the middle and an altar under it (the treasure is by the altar)
  if (s.kind === "ruins") {
    // the chest waits under the arch, in front of the altar; you land facing them
    const a = Math.atan2(s.treasure.x - s.landing.x, s.treasure.z - s.landing.z);
    const ax = s.treasure.x + Math.sin(a) * 1.2;
    const az = s.treasure.z + Math.cos(a) * 1.2;
    out.push({ island: s.id, kind: "arch", x: ax, z: az, s: 0.9, rot: a });
    room.push({ x: ax, z: az, r: 3.6 });
    put("altar", s.treasure.x + Math.sin(a) * 4.4, s.treasure.z + Math.cos(a) * 4.4, 0.8, a);
  }
  // crystal: one great crystal in the middle
  if (s.kind === "crystal") put("crystal", s.x, s.z, 2.3, r() * 6);
  for (const [kind, n] of RECIPES[s.kind](s)) {
    for (let k = 0, tries = 0; k < n && tries < 600; tries++) {
      const a = r() * Math.PI * 2;
      // trees and rocks like the peak's foot and the rim; signs stand by the landing spot
      let x: number;
      let z: number;
      if (kind === "sign") {
        const b = r() * Math.PI * 2;
        x = s.landing.x + Math.sin(b) * 3.2;
        z = s.landing.z + Math.cos(b) * 3.2;
      } else if (kind === "lantern") {
        const b = (k / n) * Math.PI * 2 + 0.4;
        x = s.x + Math.sin(b) * s.r * 0.55;
        z = s.z + Math.cos(b) * s.r * 0.55;
      } else if (s.peak && (kind === "pine" || kind === "rock") && r() < 0.55) {
        const dd = s.peak.r + 1.5 + r() * 5;
        x = s.peak.x + Math.sin(a) * dd;
        z = s.peak.z + Math.cos(a) * dd;
      } else {
        const dd = Math.sqrt(r()) * (s.r - 1.5);
        x = s.x + Math.sin(a) * dd;
        z = s.z + Math.cos(a) * dd;
      }
      const tr = TREE_S[kind];
      const sz = tr ? tr[0] + r() * (tr[1] - tr[0]) : kind === "rock" ? 0.9 + r() * 1.1 : kind === "crystal" ? 0.9 + r() * 0.7 : kind === "bush" ? 0.8 + r() * 0.5 : 1;
      const need = PROP_ROOM[kind] * (tr ? sz : kind === "rock" || kind === "crystal" ? sz : 1) * 0.5;
      const edgePad = IS_TREE.has(kind) ? 2.2 : kind === "flowers" ? 0.8 : 1.4;
      if (!ok(x, z, need, edgePad, kind === "sign")) continue;
      put(kind, x, z, sz, kind === "sign" ? Math.atan2(s.landing.x - x, s.landing.z - z) : r() * Math.PI * 2);
      k++;
    }
  }
  return out;
}

/** everything standing on the tops (world x/z), for the renderer */
export const SKY_PROPS: SkyProp[] = SKY_ISLANDS.flatMap(planProps);

/** round things to walk around on the tops (trees, rocks, ruins, crystals, peaks), world x/z;
 *  `id` = the island they stand on */
export const SKY_OBSTACLES: { x: number; z: number; r: number; id: string }[] = [
  ...SKY_ISLANDS.filter((s) => s.peak).map((s) => ({ x: s.peak!.x, z: s.peak!.z, r: s.peak!.r, id: s.id })),
  ...SKY_PROPS.flatMap((p) => {
    if (p.kind === "arch") {
      // the arch's two legs (local x = ±3.2 at scale 1)
      return [-3.2, 3.2].map((lx) => ({ x: p.x + lx * p.s * Math.cos(p.rot), z: p.z - lx * p.s * Math.sin(p.rot), r: 1.0, id: p.island }));
    }
    const base = PROP_R[p.kind];
    if (!base) return [];
    const k = IS_TREE.has(p.kind) || p.kind === "bush" ? p.s : p.kind === "rock" || p.kind === "crystal" ? p.s : 1;
    return [{ x: p.x, z: p.z, r: Math.max(0.3, base * k), id: p.island }];
  }),
];
