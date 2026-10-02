// Where the rainforest's things go — pure maths, deterministic, no three.js (tested).
//
// Everything is TRUE size (1 m = 1.6 units; the kid is 2.26 units tall):
//   giants   emergent trees 35-41 m tall, trunks ~2.2 m across on big buttress roots
//   canopy   the main roof, 26-32 m tall, crowns from ~16 m up
//   palms    the understory: palms and tree ferns 6-10 m tall
//   clumps   the thicket's undergrowth (ferns, giant leaves, shrubs) between the trails
//   vines    lianas and hanging vines from the canopy boughs
//   logs     mossy fallen logs; shafts of light through the gaps
//   perches  the monkeys' branch network (perch points on boughs + the links between them)
import { TRAIL_POINTS } from "../../registry/island";
import { groundY } from "../../registry/terrain";
import { BRIDGES } from "../../registry/island";
import { FALLS_CLEARING, thicketAt, thicketSdf, trailDistance, underCanopy } from "../../registry/jungle";
import { FALLS, waterSdf } from "../../registry/waterways";
import { noise2, rngOf } from "../fantasy/noise";

export const U = 1.6; // units per metre

export const T_GIANT = 0;
export const T_CANOPY = 1;
export const T_PALM = 2;
export const T_FERN = 3;
export const TREE_TYPES = 4;

export interface JTree {
  x: number;
  z: number;
  y: number;
  type: number;
  /** scale (1 = the type's model size) and extra height stretch */
  s: number;
  sy: number;
  rot: number;
  /** crown: centre height and radius (world units) — monkeys, birds and the camera use these */
  crownY: number;
  crownR: number;
  trunkR: number;
  /** leaf tint 0..1 (picks a green) */
  hue: number;
}

/** each tree type at scale 1: overall height, crown centre height, crown radius, trunk radius */
export const TREE_DIMS = [
  { h: 38 * U, crownY: 33 * U, crownR: 9 * U, trunkR: 1.1 * U },
  { h: 29 * U, crownY: 24 * U, crownR: 6.2 * U, trunkR: 0.7 * U },
  { h: 8 * U, crownY: 7.4 * U, crownR: 3 * U, trunkR: 0.22 * U },
  { h: 5 * U, crownY: 4.6 * U, crownR: 2.2 * U, trunkR: 0.18 * U },
] as const;

export interface Clump {
  x: number;
  z: number;
  y: number;
  s: number;
  rot: number;
  hue: number;
  /** 0 fern clump, 1 giant leaves, 2 shrub */
  kind: number;
}
export interface Vine {
  /** top (on a bough) and how far it hangs */
  x: number;
  z: number;
  top: number;
  len: number;
  rot: number;
  /** liana: a thick rope curving down to the ground (vs a curtain of leafy strands) */
  liana: boolean;
  tree: number;
}
export interface Log {
  x: number;
  z: number;
  y: number;
  len: number;
  r: number;
  rot: number;
}
export interface Shaft {
  x: number;
  z: number;
  y: number;
  /** beam radius at the ground and its length up toward the sun */
  r: number;
  len: number;
}
export interface Perch {
  x: number;
  y: number;
  z: number;
  tree: number;
}
export interface JunglePlan {
  trees: JTree[];
  clumps: Clump[];
  vines: Vine[];
  logs: Log[];
  shafts: Shaft[];
  perches: Perch[];
  /** CSR links between perches (start index per perch, then the neighbour list) */
  linkStart: Int32Array;
  links: Int32Array;
  /** perches near a trail, low enough to peek down at the kid */
  lookouts: number[];
}

export type KeepFn = (x: number, z: number, pad: number) => boolean;

/** the sun's direction (the atmosphere's sun light sits up at (-30, 50, 25)) */
export const SUN_DIR = (() => {
  const l = Math.hypot(-30, 50, 25);
  return { x: -30 / l, y: 50 / l, z: 25 / l };
})();

const onBridge = (x: number, z: number, pad: number) => BRIDGES.some((b) => Math.hypot(b.x - x, b.z - z) < b.span / 2 + pad);

export function planJungle(opts: { lowQuality?: boolean; seed?: number; keep?: KeepFn } = {}): JunglePlan {
  const low = !!opts.lowQuality;
  const r = rngOf(opts.seed ?? 20261002);
  const keep = opts.keep ?? (() => false);
  const trees: JTree[] = [];
  const clash = (x: number, z: number, d: number) => trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < d * d);
  // candidates over the canopy, strongest spots (deep in the woods) first
  const cand: { x: number; z: number; k: number }[] = [];
  for (let z = -160; z < 160; z += 3.2)
    for (let x = -160; x < 160; x += 3.2) {
      const jx = x + (r() - 0.5) * 2.6;
      const jz = z + (r() - 0.5) * 2.6;
      if (!underCanopy(jx, jz)) continue;
      cand.push({ x: jx, z: jz, k: thicketSdf(jx, jz) * -0.1 + r() });
    }
  cand.sort((a, b) => b.k - a.k);
  const place = (type: number, spacing: number, max: number, trailMin: (s: number) => number, sMin: number, sMax: number) => {
    let n = 0;
    for (const c of cand) {
      if (n >= max) break;
      const s = sMin + r() * (sMax - sMin);
      const D = TREE_DIMS[type];
      const tr = D.trunkR * s;
      const { x, z } = c;
      if (trailDistance(x, z, 12) < trailMin(s) + tr) continue;
      if (waterSdf(x, z) < tr + (type <= T_CANOPY ? 2.2 : 0.8)) continue;
      if (Math.hypot(x - FALLS_CLEARING.x, z - FALLS_CLEARING.z) < FALLS_CLEARING.r + tr + 1) continue;
      if (onBridge(x, z, tr + 2) || keep(x, z, tr + (type <= T_CANOPY ? 2 : 0.6))) continue;
      // (no big trees right in front of the falls: they'd hide them from the clearing and from afar)
      if (type <= T_CANOPY && Math.hypot(x - FALLS.lip.x, z - FALLS.lip.z) < (type === T_GIANT ? 26 : 20)) continue;
      // big trees keep their distance from each other; the understory just from trunks
      if (type <= T_CANOPY ? trees.some((t) => t.type <= T_CANOPY && (t.x - x) ** 2 + (t.z - z) ** 2 < (spacing * (0.8 + 0.4 * s) * (t.type === T_GIANT || type === T_GIANT ? 1.25 : 1)) ** 2) : trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < (t.trunkR + tr + spacing) ** 2)) continue;
      const sy = 0.92 + noise2(x * 0.3, z * 0.3, 71) * 0.16;
      trees.push({ x, z, y: groundY(x, z), type, s, sy, rot: r() * Math.PI * 2, crownY: D.crownY * s * sy, crownR: D.crownR * s, trunkR: tr, hue: noise2(x / 18, z / 18, 72) });
      n++;
    }
  };
  // the emergent giants (the trails pass close by some: you walk round their buttresses)
  place(T_GIANT, 21, low ? 9 : 14, () => 4.2, 0.92, 1.08);
  // the canopy roof, packed so its crowns meet over the trails
  place(T_CANOPY, 10.5, low ? 34 : 60, () => 3.0, 0.86, 1.12);
  // the understory
  place(T_PALM, 3.5, low ? 30 : 60, () => 2.9, 0.8, 1.2);
  place(T_FERN, 2.5, low ? 24 : 48, () => 2.6, 0.75, 1.25);

  // ── the undergrowth: clumps on every blocked cell's worth of ground, lining the trails ──
  const clumps: Clump[] = [];
  const step = low ? 3.4 : 2.55;
  for (let z = -160; z < 160; z += step)
    for (let x = -160; x < 160; x += step) {
      const jx = x + (r() - 0.5) * step * 0.9;
      const jz = z + (r() - 0.5) * step * 0.9;
      if (!underCanopy(jx, jz)) continue;
      const sd = thicketSdf(jx, jz);
      // inside the thicket, and a wall of ferns right along its edge (but not on the walk)
      if (sd > -0.2) continue;
      if (waterSdf(jx, jz) < 0.4 || onBridge(jx, jz, 1)) continue;
      if (trees.some((t) => (t.x - jx) ** 2 + (t.z - jz) ** 2 < (t.trunkR + 0.6) ** 2)) continue;
      const kr = noise2(jx * 0.31, jz * 0.31, 73);
      const kind = kr < 0.5 ? 0 : kr < 0.78 ? 1 : 2;
      // (bigger, taller clumps deep in, lower ones at the trail's edge so the trail stays readable)
      const deep = Math.min(1, -sd / 4);
      clumps.push({ x: jx, z: jz, y: groundY(jx, jz), s: (0.75 + deep * 0.6 + r() * 0.35) * (low ? 1.2 : 1), rot: r() * Math.PI * 2, hue: noise2(jx / 9, jz / 9, 74), kind });
    }

  // ── vines: from the canopy boughs, the most of them near the trails where they're seen ──
  const vines: Vine[] = [];
  trees.forEach((t, ti) => {
    if (t.type > T_CANOPY) return;
    const n = t.type === T_GIANT ? 5 : 3;
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const d = t.crownR * (0.45 + r() * 0.45);
      const x = t.x + Math.sin(a) * d;
      const z = t.z + Math.cos(a) * d;
      const top = t.y + t.crownY - t.crownR * 0.55;
      const nearTrail = trailDistance(x, z, 8) < 7;
      if (!nearTrail && r() < 0.5) continue;
      // (never dangling down onto the walk or into the camera's path along a trail)
      const len = trailDistance(x, z, 4) < 3.5 ? (top - t.y) * (0.25 + r() * 0.2) : (top - t.y) * (0.45 + r() * 0.4);
      vines.push({ x, z, top, len, rot: r() * Math.PI * 2, liana: k === 0 && !nearTrail, tree: ti });
    }
  });

  // ── mossy logs lying in the thicket by the trails ──
  const logs: Log[] = [];
  for (let tries = 0; tries < 900 && logs.length < (low ? 8 : 14); tries++) {
    const c = cand[Math.floor(r() * cand.length)];
    if (!c) break;
    const td = trailDistance(c.x, c.z, 10);
    if (td < 3.8 || td > 8 || !thicketAt(c.x, c.z) || waterSdf(c.x, c.z) < 3) continue;
    if (trees.some((t) => (t.x - c.x) ** 2 + (t.z - c.z) ** 2 < (t.trunkR + 3) ** 2) || logs.some((l) => Math.hypot(l.x - c.x, l.z - c.z) < 12)) continue;
    logs.push({ x: c.x, z: c.z, y: groundY(c.x, c.z), len: (5 + r() * 5) * U * 0.6, r: (0.35 + r() * 0.25) * U, rot: r() * Math.PI * 2 });
  }

  // ── light shafts: where the canopy opens above a trail or a clearing ──
  const shafts: Shaft[] = [];
  const gap = (x: number, z: number) => trees.filter((t) => t.type <= T_CANOPY && (t.x - x) ** 2 + (t.z - z) ** 2 < (t.crownR * 0.75) ** 2).length;
  const trailPts = TRAIL_POINTS.flat().filter(([x, z]) => underCanopy(x, z));
  for (let i = 0; i < trailPts.length * 3 && shafts.length < (low ? 10 : 18); i += 2) {
    const [x, z] = trailPts[(i * 7) % trailPts.length];
    if (gap(x, z) > 3 || shafts.some((s) => Math.hypot(s.x - x, s.z - z) < 8)) continue;
    shafts.push({ x: x + (r() - 0.5) * 2, z: z + (r() - 0.5) * 2, y: groundY(x, z), r: (0.9 + r() * 1.3) * U, len: 30 * U });
  }
  shafts.push({ x: FALLS_CLEARING.x - 2, z: FALLS_CLEARING.z + 1, y: groundY(FALLS_CLEARING.x, FALLS_CLEARING.z), r: 2 * U, len: 30 * U });

  // ── the monkeys' branch network: perches round each big crown's underside, linked within a tree
  // and to the neighbouring trees' near perches (swings and leaps) ──
  const perches: Perch[] = [];
  const byTree: number[][] = trees.map(() => []);
  trees.forEach((t, ti) => {
    if (t.type > T_CANOPY) return;
    const n = t.type === T_GIANT ? 7 : 5;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + t.rot;
      const d = t.crownR * (k === 0 ? 0.15 : 0.55 + 0.25 * ((k * 37) % 3) / 2);
      const y = t.y + t.crownY - t.crownR * (k === 0 ? 0.35 : 0.6) - ((k * 13) % 3) * 0.8;
      byTree[ti].push(perches.length);
      perches.push({ x: t.x + Math.sin(a) * d, y, z: t.z + Math.cos(a) * d, tree: ti });
    }
  });
  const nbs: number[][] = perches.map(() => []);
  const link = (a: number, b: number) => {
    if (a === b || nbs[a].includes(b)) return;
    nbs[a].push(b);
    nbs[b].push(a);
  };
  byTree.forEach((ps) => {
    // round the crown, and each to the middle
    for (let k = 1; k < ps.length; k++) {
      link(ps[k], ps[0]);
      link(ps[k], ps[k + 1 < ps.length ? k + 1 : 1]);
    }
  });
  for (let i = 0; i < perches.length; i++)
    for (let j = i + 1; j < perches.length; j++) {
      if (perches[i].tree === perches[j].tree) continue;
      const d = Math.hypot(perches[i].x - perches[j].x, perches[i].z - perches[j].z);
      if (d < 9 * U * 0.8 && Math.abs(perches[i].y - perches[j].y) < 9) link(i, j);
    }
  const linkStart = new Int32Array(perches.length + 1);
  for (let i = 0; i < perches.length; i++) linkStart[i + 1] = linkStart[i] + nbs[i].length;
  const links = new Int32Array(linkStart[perches.length]);
  nbs.forEach((l, i) => l.forEach((v, k) => (links[linkStart[i] + k] = v)));
  const lookouts = perches.map((p, i) => (trailDistance(p.x, p.z, 10) < 8 ? i : -1)).filter((i) => i >= 0);

  return { trees, clumps, vines, logs, shafts, perches, linkStart, links, lookouts };
}
