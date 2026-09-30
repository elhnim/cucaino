// Where Cucaino Park's land animals live — pure maths, seeded, deterministic, no three.js (tested).
//
//   - deer herds (a stag with antlers, does, spotted fawns) at forest edges, facing out into a meadow
//   - rabbit warrens in the meadows, each with burrows and a patch of woods to dart into
//   - a fox den at a forest edge (a vixen and her kits), and foxes out on their rounds
//   - squirrels living in trees beside the trails (with a second tree, across the path if possible)
//   - hedgehogs along the forest edges (dusk and night)
//   - a fenced paddock of horses and ponies (and a foal) near the Pet Meadow
//   - goats high on the rocky hillsides, a few cows (and a calf) on a gentle grassy slope
//   - a duck family on the lily pond (and the shore spots they waddle out to)
//   - frogs on the stream banks, owls perched on trees beside the trails, a bear family fishing
//     at a quiet stretch of the stream, and turtles crossing the trails near the water
import { LANDS } from "../../registry/places";
import { BRIDGES, ISLAND_R, POND, STREAM_POINTS, STREAM_WIDTH, TRAIL_POINTS } from "../../registry/island";
import { groundY } from "../../registry/terrain";
import { fieldAt, openFields, rngOf, type FreeFn, type Meadow, type Rng } from "../storybook/plan";
import { B_BANK, B_BLOCK, B_LAND, B_OPEN, B_TRAIL, bitsAt, shareAround, slopeOf, type WalkGrid } from "./ground";
import {
  K_BEAR,
  K_COW,
  K_DEER,
  K_DUCK,
  K_FOX,
  K_FROG,
  K_GOAT,
  K_HEDGEHOG,
  K_HORSE,
  K_OWL,
  K_RABBIT,
  K_SQUIRREL,
  K_TURTLE,
  MESH_OF,
  MESHES,
  R_CUB,
  R_DOE,
  R_DRAKE,
  R_DUCKLING,
  R_FAWN,
  R_FOAL,
  R_HEN,
  R_KIT,
  R_MOTHER,
  R_NONE,
  R_ROAMER,
  R_STAG,
  R_VIXEN,
  S_CROSS,
  S_FISH,
  S_IDLE,
  S_PLAY,
  V_FROG,
  V_HEDGEHOG,
  V_TURTLE,
  inPaddock,
  paddockPoint,
  type Agent,
  type Paddock,
  type TreeLite,
} from "./types";

const TAU = Math.PI * 2;

export interface FaunaPlan {
  agents: Agent[];
  paddock: Paddock | null;
  /** fox den mound (mouth faces `yaw`) */
  den: { x: number; z: number; yaw: number } | null;
  /** rabbit burrow holes */
  burrows: { x: number; z: number }[];
  /** stepping stones in the stream by the bears' fishing spot */
  rocks: { x: number; z: number; r: number }[];
  /** points on the pond shore the ducks waddle out to (x, z pairs) */
  shores: Float32Array;
  trees: TreeLite[];
  /** where things went (harnesses / debugging) */
  sites: Record<string, [number, number][]>;
  /** instances per mesh */
  counts: number[];
}

export interface FaunaForest {
  trees: TreeLite[];
  meadows: Meadow[];
}

export function makeAgent(kind: number, role: number, x: number, z: number, s: number, variant: number, coat: number, seed: number): Agent {
  return {
    kind,
    role,
    mesh: MESH_OF[kind],
    slot: 0,
    variant,
    coat,
    s,
    x,
    z,
    y: groundY(x, z),
    yaw: (seed * 2.399) % TAU,
    v: 0,
    st: S_IDLE,
    tm: (seed % 7) * 0.5,
    tx: x,
    tz: z,
    hx: x,
    hz: z,
    hr: 6,
    leash: 30,
    cx: x,
    cz: z,
    ax: x,
    az: z,
    bx: x,
    bz: z,
    lead: -1,
    group: -1,
    rs: (Math.imul(seed + 1, 2654435761) >>> 0) || 1,
    seed: (seed * 0.618034) % 1000,
    shy: ((seed * 0.7548776662) % 1 + 1) % 1,
    present: 1,
    want: 1,
    alert: 0,
    calm: 100,
    phase: seed % TAU,
    stride: 0,
    bound: 0,
    headYaw: 0,
    headPitch: 0,
    ear: 0,
    tail: 0,
    tailLift: 0,
    paw: 0,
    wing: 0,
    tuck: 0,
    lift: 0,
    pitch: 0,
    roll: 0,
    fwd: 0,
    tree: -1,
    tree2: -1,
    climb: 0,
    act: 0,
  };
}

// ── spot finding ──

interface Spot {
  x: number;
  z: number;
  /** unit direction out into the open (for forest-edge spots) */
  nx: number;
  nz: number;
}
type Avoid = { x: number; z: number; r: number };

const far = (x: number, z: number, list: Avoid[]) => list.every((o) => Math.hypot(o.x - x, o.z - z) >= o.r);

/** is the ground here clear of the trails, the lands and the places by these margins */
function roomy(x: number, z: number, trail: number, land: number): boolean {
  const f = openFields();
  return fieldAt(f.trail, x, z) >= trail && fieldAt(f.land, x, z) >= land;
}

const RING = 12;
/** forest edges: open meadow ground with the woods close on one side */
function edgeSpots(g: WalkGrid, free: FreeFn, r: Rng, count: number, sep: number, avoid: Avoid[], opts: { trail?: number; ring?: number; near?: { x: number; z: number; r: number } } = {}): Spot[] {
  const out: Spot[] = [];
  const ring = opts.ring ?? 6;
  for (let tries = 0; tries < 6000 && out.length < count; tries++) {
    let x: number;
    let z: number;
    if (opts.near) {
      const a = r() * TAU;
      const d = Math.sqrt(r()) * opts.near.r;
      x = opts.near.x + Math.sin(a) * d;
      z = opts.near.z + Math.cos(a) * d;
    } else {
      const a = r() * TAU;
      const d = 20 + Math.sqrt(r()) * (ISLAND_R - 34);
      x = Math.sin(a) * d;
      z = Math.cos(a) * d;
    }
    const b = bitsAt(g, x, z);
    if ((b & (B_LAND | B_OPEN)) !== (B_LAND | B_OPEN) || b & (B_TRAIL | B_BLOCK)) continue;
    if (slopeOf(g, x, z) > 0.35) continue;
    if (!roomy(x, z, opts.trail ?? 5, 6)) continue;
    let cov = 0;
    let open = 0;
    let nx = 0;
    let nz = 0;
    for (let k = 0; k < RING; k++) {
      const a = (k / RING) * TAU;
      const sx = Math.sin(a);
      const sz = Math.cos(a);
      const bb = bitsAt(g, x + sx * ring, z + sz * ring);
      if (!(bb & B_LAND)) continue;
      if (bb & B_OPEN) {
        open++;
        nx += sx;
        nz += sz;
      } else {
        cov++;
        nx -= sx;
        nz -= sz;
      }
    }
    if (cov < 3 || open < 5) continue;
    const nl = Math.hypot(nx, nz);
    if (nl < 1e-3) continue;
    if (!far(x, z, avoid) || out.some((o) => Math.hypot(o.x - x, o.z - z) < sep)) continue;
    if (!free(x, z, 1.5)) continue;
    out.push({ x, z, nx: nx / nl, nz: nz / nl });
  }
  return out;
}

/** open meadow spots (rabbit warrens, cows) */
function openSpots(g: WalkGrid, free: FreeFn, r: Rng, count: number, sep: number, avoid: Avoid[], test: (x: number, z: number) => boolean): Spot[] {
  const out: Spot[] = [];
  for (let tries = 0; tries < 6000 && out.length < count; tries++) {
    const a = r() * TAU;
    const d = 20 + Math.sqrt(r()) * (ISLAND_R - 32);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const b = bitsAt(g, x, z);
    if ((b & (B_LAND | B_OPEN)) !== (B_LAND | B_OPEN) || b & (B_TRAIL | B_BLOCK)) continue;
    if (!test(x, z)) continue;
    if (!far(x, z, avoid) || out.some((o) => Math.hypot(o.x - x, o.z - z) < sep)) continue;
    if (!free(x, z, 1.5)) continue;
    out.push({ x, z, nx: Math.sin(a), nz: Math.cos(a) });
  }
  return out;
}

/** the nearest ground under the trees (a little way in), or (x, z) itself */
export function coverNear(g: WalkGrid, x: number, z: number, maxR = 30): { x: number; z: number } {
  for (let d = 2; d <= maxR; d += 1.5)
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU + d * 0.37;
      const px = x + Math.sin(a) * d;
      const pz = z + Math.cos(a) * d;
      const b = bitsAt(g, px, pz);
      if (b & B_LAND && !(b & (B_OPEN | B_BLOCK))) {
        const qx = px + Math.sin(a) * 1.5;
        const qz = pz + Math.cos(a) * 1.5;
        const bq = bitsAt(g, qx, qz);
        return bq & B_LAND && !(bq & (B_OPEN | B_BLOCK)) ? { x: qx, z: qz } : { x: px, z: pz };
      }
    }
  return { x, z };
}

/** a point near (x, z) that satisfies `ok` (tries a spiral), or null */
function nearOk(x: number, z: number, maxR: number, ok: (x: number, z: number) => boolean, r: Rng): { x: number; z: number } | null {
  if (ok(x, z)) return { x, z };
  for (let d = 0.8; d <= maxR; d += 0.7)
    for (let k = 0; k < 10; k++) {
      const a = r() * TAU;
      const px = x + Math.sin(a) * d;
      const pz = z + Math.cos(a) * d;
      if (ok(px, pz)) return { x: px, z: pz };
    }
  return null;
}

const landOk = (g: WalkGrid, maxSlope = 0.5, open = false) => (x: number, z: number) => {
  const b = bitsAt(g, x, z);
  return !!(b & B_LAND) && !(b & B_BLOCK) && (!open || !!(b & B_OPEN)) && slopeOf(g, x, z) <= maxSlope;
};

// ── the paddock ──

function planPaddock(g: WalkGrid, free: FreeFn, trees: TreeLite[], meadows: Meadow[]): Paddock | null {
  const pets = LANDS.find((l) => l.id === "pets");
  if (!pets) return null;
  const near = trees.filter((t) => Math.hypot(t.x - pets.x, t.z - pets.z) < pets.radius + 75);
  const sizes: [number, number][] = [
    [10, 6.5],
    [8.5, 5.5],
    [7, 4.8],
    [6, 4.2],
  ];
  for (const [hw, hd] of sizes) {
    let best: Paddock | null = null;
    let bestScore = Infinity;
    for (let dist = pets.radius + 4; dist <= pets.radius + 60; dist += 2)
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * TAU;
        const x = pets.x + Math.sin(a) * dist;
        const z = pets.z + Math.cos(a) * dist;
        for (let ri = 0; ri < 4; ri++) {
          const rot = a + (ri * Math.PI) / 4;
          const p: Paddock = { x, z, hw, hd, rot, gx: 0, gz: 0 };
          let ok = true;
          let rough = 0;
          const q = { x: 0, z: 0 };
          // inside: open grass; the fence line may brush under a canopy edge, but no trail and no water
          for (let lz = -hd - 0.8; lz <= hd + 0.81 && ok; lz += 1.2)
            for (let lx = -hw - 0.8; lx <= hw + 0.81 && ok; lx += 1.2) {
              paddockPoint(p, lx, lz, q);
              const b = bitsAt(g, q.x, q.z);
              const inner = Math.abs(lx) < hw - 1 && Math.abs(lz) < hd - 1;
              if (!(b & B_LAND) || b & (B_TRAIL | B_BANK | B_BLOCK)) ok = false;
              else if (inner && !(b & B_OPEN)) ok = false;
              else if (!roomy(q.x, q.z, 2.8, 2)) ok = false;
              else {
                const s = slopeOf(g, q.x, q.z);
                if (s > 0.3) ok = false;
                rough = Math.max(rough, s);
              }
            }
          if (!ok) continue;
          if (near.some((t) => inPaddock(p, t.x, t.z, -0.9))) continue;
          const sheep = meadows.some((m) => Math.hypot(m.x - x, m.z - z) < m.r + Math.max(hw, hd) + 3);
          const score = dist + rough * 30 + (sheep ? 40 : 0);
          if (score >= bestScore) continue;
          // the final say: the park's placement rule, round the fence line
          let fine = true;
          for (let u = 0; u < 16 && fine; u++) {
            const w = (u / 16) * TAU;
            paddockPoint(p, Math.sin(w) * hw, Math.cos(w) * hd, q);
            if (!free(q.x, q.z, 0.2)) fine = false;
          }
          if (!fine || !free(x, z, 1)) continue;
          best = p;
          bestScore = score;
        }
      }
    if (best) {
      // the gate: middle of the side facing the Pet Meadow
      const dx = pets.x - best.x;
      const dz = pets.z - best.z;
      const c = Math.cos(best.rot);
      const s = Math.sin(best.rot);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) / best.hw > Math.abs(lz) / best.hd) {
        best.gx = Math.sign(lx) * best.hw;
        best.gz = 0;
      } else {
        best.gx = 0;
        best.gz = Math.sign(lz) * best.hd;
      }
      return best;
    }
  }
  return null;
}

// ── canopy geometry (matches storybook/geometry.ts buildForestTree, unit scale) ──

/** where the round canopy of a deciduous tree sits: centre height and radii (unit scale) */
export function canopyOf(kind: number): { cy: number; rx: number; ry: number; trunk: number } {
  if (kind === 0) return { cy: 3.35, rx: 1.85, ry: 1.6, trunk: 2.4 };
  if (kind === 1) return { cy: 3.15, rx: 1.6, ry: 1.4, trunk: 2.2 };
  return { cy: 3.5, rx: 1.4, ry: 1.25, trunk: 2.6 };
}
export const isLeafy = (t: TreeLite) => t.kind < 3;

/** owl perch on a tree's canopy, facing (sin yaw, cos yaw) */
export function perchOf(t: TreeLite, yaw: number, out: { x: number; y: number; z: number }) {
  const c = canopyOf(t.kind);
  const el = 0.95; // ~55° up the crown
  const h = Math.cos(el) * c.rx * t.s * 0.93;
  out.x = t.x + Math.sin(yaw) * h;
  out.z = t.z + Math.cos(yaw) * h;
  out.y = t.y - 0.15 * t.s + (c.cy + Math.sin(el) * c.ry * 0.93) * t.s * t.sy - 0.12;
  return out;
}

function nearestTrailDir(x: number, z: number): { d: number; yaw: number } {
  let bd = Infinity;
  let yaw = 0;
  for (const pts of TRAIL_POINTS)
    for (const [px, pz] of pts) {
      const d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bd) {
        bd = d;
        yaw = Math.atan2(px - x, pz - z);
      }
    }
  return { d: Math.sqrt(bd), yaw };
}

// ── the plan ──

export interface FaunaOptions {
  lowQuality?: boolean;
  seed?: number;
  /** the park's round obstacles: the big ones (windmills, buildings) are kept well clear of homes */
  obstacles?: readonly { x: number; z: number; r: number }[];
}

export function planFauna(free: FreeFn, g: WalkGrid, forest: FaunaForest, opts: FaunaOptions = {}): FaunaPlan {
  const low = !!opts.lowQuality;
  const r = rngOf(opts.seed ?? 20261001);
  const agents: Agent[] = [];
  const sites: Record<string, [number, number][]> = {};
  const note = (k: string, x: number, z: number) => (sites[k] ??= []).push([Math.round(x), Math.round(z)]);
  let seed = 1;
  const add = (kind: number, role: number, x: number, z: number, s: number, variant: number, coat: number) => {
    const a = makeAgent(kind, role, x, z, s, variant, coat, seed++ * 37);
    agents.push(a);
    return a;
  };
  const trees = forest.trees;
  const avoid: Avoid[] = [{ x: 0, z: 0, r: 22 }];
  for (const o of opts.obstacles ?? []) if (o.r >= 1.9) avoid.push({ x: o.x, z: o.z, r: o.r + 9 });
  let group = 0;

  // ── the paddock ──
  const paddock = planPaddock(g, free, trees, forest.meadows);
  if (paddock) {
    avoid.push({ x: paddock.x, z: paddock.z, r: Math.max(paddock.hw, paddock.hd) + 6 });
    note("paddock", paddock.x, paddock.z);
    const coats = [0x8a5230, 0xe8e2d6, 0xb0642e, 0x3a302c, 0xe0b565, 0xb8b2aa];
    const n = low ? 3 : 5;
    const q = { x: 0, z: 0 };
    const gid = group++;
    let mare = -1;
    for (let i = 0; i < n; i++) {
      const foal = i === n - 1;
      paddockPoint(paddock, (r() * 2 - 1) * (paddock.hw - 2), (r() * 2 - 1) * (paddock.hd - 2), q);
      const coat = coats[i % coats.length];
      const light = coat === 0xe8e2d6 || coat === 0xe0b565 || coat === 0xb8b2aa;
      const s = foal ? 0.62 : i === 2 ? 0.82 : 0.95 + r() * 0.1; // a pony and a foal
      const a = add(K_HORSE, foal ? R_FOAL : R_NONE, q.x, q.z, s, light ? 1 : 0, foal ? 0xc07a44 : coat);
      a.hx = paddock.x;
      a.hz = paddock.z;
      a.hr = Math.min(paddock.hw, paddock.hd);
      a.group = gid;
      if (i === 0) mare = agents.length - 1;
      if (foal) a.lead = mare;
    }
  }

  // ── deer at the forest edges ──
  const herds = edgeSpots(g, free, r, low ? 1 : 2, 60, avoid, { trail: 7 });
  for (const h of herds) {
    note("deer", h.x, h.z);
    avoid.push({ x: h.x, z: h.z, r: 18 });
    const roles = low ? [R_STAG, R_DOE, R_DOE, R_FAWN, R_FAWN] : [R_STAG, R_DOE, R_DOE, R_DOE, R_FAWN, R_FAWN];
    const gid = group++;
    const cover = coverNear(g, h.x - h.nx * 3, h.z - h.nz * 3);
    let lead = -1;
    const does: number[] = [];
    for (const role of roles) {
      const p = nearOk(h.x + h.nx * 2 + (r() - 0.5) * 6, h.z + h.nz * 2 + (r() - 0.5) * 6, 5, landOk(g, 0.5), r) ?? { x: h.x, z: h.z };
      const coat = role === R_STAG ? 0x9a5f30 : [0xb8743a, 0xc0823f, 0xa86a36][agents.length % 3];
      const a = add(K_DEER, role, p.x, p.z, role === R_STAG ? 1.12 : role === R_FAWN ? 0.6 : 0.95 + r() * 0.08, role === R_STAG ? 1 : role === R_FAWN ? 2 : 0, coat);
      a.hx = h.x;
      a.hz = h.z;
      a.hr = 8;
      a.ax = h.nx;
      a.az = h.nz;
      a.cx = cover.x;
      a.cz = cover.z;
      a.group = gid;
      a.yaw = Math.atan2(h.nx, h.nz) + (r() - 0.5) * 2;
      const idx = agents.length - 1;
      if (role === R_STAG) lead = idx;
      else if (role === R_DOE) {
        a.lead = lead;
        does.push(idx);
      } else a.lead = does.length ? does[(idx + does.length) % does.length] : lead;
    }
  }

  // ── the fox den and foxes on their rounds ──
  const dens = edgeSpots(g, free, r, 1, 1, avoid, { trail: 8 });
  let den: FaunaPlan["den"] = null;
  if (dens.length) {
    const d = dens[0];
    den = { x: d.x - d.nx * 0.6, z: d.z - d.nz * 0.6, yaw: Math.atan2(d.nx, d.nz) };
    note("den", den.x, den.z);
    avoid.push({ x: d.x, z: d.z, r: 14 });
    const gid = group++;
    const mouthX = d.x + d.nx * 0.7;
    const mouthZ = d.z + d.nz * 0.7;
    const kits = low ? 2 : 3;
    for (let i = 0; i <= kits; i++) {
      const kit = i > 0;
      const p = nearOk(mouthX + d.nx * (1.5 + r() * 2) + (r() - 0.5) * 3, mouthZ + d.nz * (1.5 + r() * 2) + (r() - 0.5) * 3, 4, landOk(g, 0.5), r) ?? { x: mouthX, z: mouthZ };
      const a = add(K_FOX, kit ? R_KIT : R_VIXEN, p.x, p.z, kit ? 0.72 : 1.3, 0, kit ? 0xd98a4a : 0xe2702a);
      a.hx = mouthX + d.nx * 2.5;
      a.hz = mouthZ + d.nz * 2.5;
      a.hr = kit ? 4 : 8;
      a.cx = mouthX;
      a.cz = mouthZ;
      a.ax = coverNear(g, d.x, d.z).x;
      a.az = coverNear(g, d.x, d.z).z;
      a.group = gid;
      a.st = kit ? S_PLAY : S_IDLE;
    }
  }
  const roamers = openSpots(g, free, r, low ? 1 : 2, 50, avoid, (x, z) => roomy(x, z, 3, 8) && slopeOf(g, x, z) < 0.35);
  for (const h of roamers) {
    note("fox", h.x, h.z);
    const a = add(K_FOX, R_ROAMER, h.x, h.z, 1.3, 0, 0xdc6a28);
    a.hx = h.x;
    a.hz = h.z;
    a.hr = 24;
    const c = coverNear(g, h.x, h.z);
    a.cx = a.ax = c.x;
    a.cz = a.az = c.z;
  }

  // ── rabbit warrens ──
  const burrows: { x: number; z: number }[] = [];
  const warrens = openSpots(g, free, r, low ? 2 : 4, 26, avoid, (x, z) => roomy(x, z, 4, 4) && slopeOf(g, x, z) < 0.3 && shareAround(g, x, z, 5, B_LAND | B_OPEN) > 0.8);
  const rabbitCoats = [0xa07a58, 0x9a948c, 0xc9a47a, 0x8a6a50, 0xefeae2, 0xa88c6a];
  let rabbitsLeft = low ? 7 : 14;
  warrens.forEach((w, wi) => {
    note("warren", w.x, w.z);
    avoid.push({ x: w.x, z: w.z, r: 8 });
    const holes: { x: number; z: number }[] = [];
    for (let k = 0; k < 2; k++) {
      const p = nearOk(w.x + (k ? 1.4 : -1.4), w.z + (k ? 0.6 : -0.5), 2, landOk(g, 0.35, true), r);
      if (p) holes.push(p);
    }
    if (!holes.length) holes.push({ x: w.x, z: w.z });
    burrows.push(...holes);
    const woods = coverNear(g, w.x, w.z, 34);
    const n = wi === warrens.length - 1 ? rabbitsLeft : Math.min(rabbitsLeft, Math.round((low ? 7 : 14) / warrens.length));
    rabbitsLeft -= n;
    const gid = group++;
    for (let i = 0; i < n; i++) {
      const p = nearOk(w.x + (r() - 0.5) * 5, w.z + (r() - 0.5) * 5, 3, landOk(g, 0.4), r) ?? { x: w.x, z: w.z };
      const a = add(K_RABBIT, R_NONE, p.x, p.z, 1.2 + r() * 0.2, 0, rabbitCoats[(wi * 3 + i) % rabbitCoats.length]);
      const hole = holes[i % holes.length];
      a.hx = w.x;
      a.hz = w.z;
      a.hr = 7;
      a.cx = hole.x;
      a.cz = hole.z;
      a.ax = woods.x;
      a.az = woods.z;
      a.group = gid;
    }
  });

  // ── hedgehogs along the forest edges ──
  const hogs = edgeSpots(g, free, r, low ? 3 : 5, 24, avoid, { trail: 3 });
  for (const h of hogs) {
    note("hedgehog", h.x, h.z);
    const a = add(K_HEDGEHOG, R_NONE, h.x, h.z, 1.7, V_HEDGEHOG, 0x7a5a3c);
    a.hr = 9;
    const c = coverNear(g, h.x, h.z, 12);
    a.cx = c.x;
    a.cz = c.z;
  }

  // ── squirrels in trees by the trails ──
  const f = openFields();
  const leafy = trees.filter((t) => isLeafy(t) && t.s > 0.75);
  const squirrelTrees: number[] = [];
  const nSq = low ? 4 : 8;
  const order = leafy.map((_, i) => i).sort((a, b) => ((a * 7919 + 13) % 1009) - ((b * 7919 + 13) % 1009));
  for (const i of order) {
    if (squirrelTrees.length >= nSq) break;
    const t = leafy[i];
    const td = fieldAt(f.trail, t.x, t.z);
    if (td < 3.5 || td > 10 || fieldAt(f.land, t.x, t.z) < 3) continue;
    if (!(bitsAt(g, t.x + 1, t.z) & B_LAND)) continue;
    if (squirrelTrees.some((k) => Math.hypot(leafy[k].x - t.x, leafy[k].z - t.z) < 22)) continue;
    if (!far(t.x, t.z, avoid.slice(0, 1))) continue;
    // a partner tree: across the path if there is one
    let best = -1;
    let bestScore = -Infinity;
    for (let j = 0; j < leafy.length; j++) {
      if (j === i) continue;
      const u = leafy[j];
      const d = Math.hypot(u.x - t.x, u.z - t.z);
      if (d < 5 || d > 15) continue;
      const mid = fieldAt(f.trail, (u.x + t.x) / 2, (u.z + t.z) / 2);
      const ud = fieldAt(f.trail, u.x, u.z);
      if (ud < 3 || !(bitsAt(g, u.x + 1, u.z) & B_LAND)) continue;
      const score = (mid < 2.5 ? 10 : 0) - Math.abs(d - 9) * 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = j;
      }
    }
    if (best < 0) continue;
    squirrelTrees.push(i);
    const u = leafy[best];
    note("squirrel", t.x, t.z);
    const a = add(K_SQUIRREL, R_NONE, t.x + 1.2, t.z + 0.4, 1.7, 0, r() < 0.75 ? 0xc4602c : 0x8c8680);
    a.tree = trees.indexOf(t);
    a.tree2 = trees.indexOf(u);
    a.hx = t.x;
    a.hz = t.z;
    a.hr = 5;
    a.ax = u.x;
    a.az = u.z;
    const p = nearOk(t.x + 1.3, t.z, 2.5, landOk(g, 0.7), r) ?? { x: t.x + 1.2, z: t.z };
    a.x = p.x;
    a.z = p.z;
    a.y = groundY(p.x, p.z);
  }

  // ── owls on trees beside the trails ──
  const nOwl = low ? 3 : 5;
  const owlTrees: TreeLite[] = [];
  for (const i of order.slice().reverse()) {
    if (owlTrees.length >= nOwl) break;
    const t = leafy[i];
    if (t.s < 0.9) continue;
    const td = fieldAt(f.trail, t.x, t.z);
    if (td < 4 || td > 14 || fieldAt(f.land, t.x, t.z) < 4) continue;
    if (owlTrees.some((o) => Math.hypot(o.x - t.x, o.z - t.z) < 30)) continue;
    if (Math.hypot(t.x, t.z) < 20) continue;
    owlTrees.push(t);
    const dir = nearestTrailDir(t.x, t.z);
    const q = { x: 0, y: 0, z: 0 };
    perchOf(t, dir.yaw, q);
    note("owl", t.x, t.z);
    const a = add(K_OWL, R_NONE, q.x, q.z, 1.8, 0, [0xb8946a, 0xc9a878, 0x9a7a58, 0xd8c098][owlTrees.length % 4]);
    a.y = q.y;
    a.yaw = dir.yaw;
    a.hx = q.x;
    a.hz = q.z;
    a.tree = trees.indexOf(t);
  }

  // ── goats on the rocky hillsides ──
  {
    let best: { x: number; z: number; score: number } | null = null;
    for (let k = 0; k < 5000; k++) {
      const a = r() * TAU;
      const d = 30 + Math.sqrt(r()) * (ISLAND_R - 40);
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      const b = bitsAt(g, x, z);
      if (!(b & B_LAND) || b & B_TRAIL) continue;
      const y = groundY(x, z);
      const s = slopeOf(g, x, z);
      if (y < 5 || s < 0.18 || s > 0.8) continue;
      if (!roomy(x, z, 5, 6) || !far(x, z, avoid)) continue;
      if (shareAround(g, x, z, 6, B_LAND) < 0.85) continue;
      const score = y * 0.3 + s * 6 + shareAround(g, x, z, 6, B_LAND | B_OPEN) * 4 + r();
      if (best && score <= best.score) continue;
      if (!free(x, z, 1)) continue;
      best = { x, z, score };
    }
    if (best) {
      note("goats", best.x, best.z);
      avoid.push({ x: best.x, z: best.z, r: 16 });
      const gid = group++;
      const n = low ? 3 : 6;
      const coats = [0xf2eee6, 0x8a6446, 0xf2eee6, 0x9e9890, 0xe9e1d2, 0x6a5444];
      let billy = -1;
      for (let i = 0; i < n; i++) {
        const kid = i >= n - (low ? 1 : 2);
        const p = nearOk(best.x + (r() - 0.5) * 7, best.z + (r() - 0.5) * 7, 4, landOk(g, 0.9), r) ?? { x: best.x, z: best.z };
        const a = add(K_GOAT, kid ? R_KIT : R_NONE, p.x, p.z, kid ? 0.6 : i === 0 ? 1.1 : 0.95, i === 0 ? 1 : 0, coats[i % coats.length]);
        a.hx = best.x;
        a.hz = best.z;
        a.hr = 9;
        a.group = gid;
        if (i === 0) billy = agents.length - 1;
        else a.lead = kid ? agents.length - 1 - (low ? 1 : 2) : billy;
        const c = coverNear(g, best.x, best.z, 20);
        a.cx = c.x;
        a.cz = c.z;
      }
    }
  }

  // ── cows on a gentle grassy slope ──
  {
    // a sunny slope (not a sheep meadow if there's any other choice)
    const slopeOk = (x: number, z: number, share: number) => {
      const y = groundY(x, z);
      const s = slopeOf(g, x, z);
      return y > 0.8 && y < 12 && s > 0.03 && s < 0.32 && roomy(x, z, 5, 5) && shareAround(g, x, z, 6, B_LAND | B_OPEN) > share;
    };
    let spots = openSpots(g, free, r, 1, 1, avoid, (x, z) => slopeOk(x, z, 0.8) && !forest.meadows.some((m) => Math.hypot(m.x - x, m.z - z) < m.r + 6));
    if (!spots.length) spots = openSpots(g, free, r, 1, 1, avoid, (x, z) => slopeOk(x, z, 0.7));
    for (const h of spots) {
      note("cows", h.x, h.z);
      avoid.push({ x: h.x, z: h.z, r: 16 });
      const gid = group++;
      const n = low ? 2 : 4;
      const coats = [0x2c2622, 0x7a4a2a, 0x2c2622, 0x8a5a36];
      let mum = -1;
      for (let i = 0; i < n; i++) {
        const calf = i === n - 1 && !low;
        const p = nearOk(h.x + (r() - 0.5) * 8, h.z + (r() - 0.5) * 8, 5, landOk(g, 0.35, true), r) ?? { x: h.x, z: h.z };
        const a = add(K_COW, calf ? R_KIT : R_NONE, p.x, p.z, calf ? 0.58 : 0.95 + r() * 0.1, calf ? 0 : i === 1 ? 1 : 0, coats[i % coats.length]);
        a.hx = h.x;
        a.hz = h.z;
        a.hr = 10;
        a.group = gid;
        if (i === 0) mum = agents.length - 1;
        if (calf) a.lead = mum;
      }
    }
  }

  // ── ducks on the pond ──
  const shoreList: number[] = [];
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * TAU;
    const d = POND.r + 2.6;
    const x = POND.x + Math.sin(a) * d;
    const z = POND.z + Math.cos(a) * d;
    const b = bitsAt(g, x, z);
    if (!(b & B_LAND) || slopeOf(g, x, z) > 0.4) continue;
    if (!(bitsAt(g, POND.x + Math.sin(a) * (POND.r + 1), POND.z + Math.cos(a) * (POND.r + 1)) & B_LAND)) continue;
    shoreList.push(x, z);
  }
  {
    const gid = group++;
    const n = low ? 4 : 7;
    let hen = -1;
    let prev = -1;
    for (let i = 0; i < n; i++) {
      const role = i === 0 ? R_HEN : i === 1 ? R_DRAKE : R_DUCKLING;
      const a0 = r() * TAU;
      const d0 = Math.sqrt(r()) * (POND.r - 1.6);
      const x = POND.x + Math.sin(a0) * d0;
      const z = POND.z + Math.cos(a0) * d0;
      const a = add(K_DUCK, role, x, z, role === R_DUCKLING ? 0.6 : 1.4, role === R_DRAKE ? 1 : role === R_DUCKLING ? 2 : 0, role === R_DRAKE ? 0xd3cfc6 : role === R_HEN ? 0x9c7a52 : 0xf2d24a);
      a.y = g.pondY;
      a.hx = POND.x;
      a.hz = POND.z;
      a.hr = POND.r - 1.3;
      a.group = gid;
      if (role === R_HEN) hen = agents.length - 1;
      if (role === R_DUCKLING) {
        a.lead = prev >= 0 ? prev : hen;
        prev = agents.length - 1;
      }
      if (role === R_HEN) prev = -1;
    }
    note("ducks", POND.x, POND.z);
  }

  // ── frogs on the stream banks (and the pond's edge) ──
  {
    const nF = low ? 4 : 8;
    const spots: { x: number; z: number; yaw: number }[] = [];
    for (let i = 2; i + 2 < STREAM_POINTS.length && spots.length < nF - (low ? 1 : 2); i += 2) {
      const [px, pz] = STREAM_POINTS[i];
      const [qx, qz] = STREAM_POINTS[i + 1];
      const tl = Math.hypot(qx - px, qz - pz) || 1;
      const nx = (qz - pz) / tl;
      const nz = -(qx - px) / tl;
      const side = (i >> 1) % 2 ? 1 : -1; // (alternate banks)
      const x = px + nx * side * (STREAM_WIDTH / 2 + 0.75);
      const z = pz + nz * side * (STREAM_WIDTH / 2 + 0.75);
      const b = bitsAt(g, x, z);
      if (!(b & B_LAND) || !(b & B_BANK) || b & (B_TRAIL | B_BLOCK)) continue;
      if (BRIDGES.some((br) => Math.hypot(br.x - x, br.z - z) < 6)) continue;
      if (fieldAt(f.land, x, z) < 2 || spots.some((s) => Math.hypot(s.x - x, s.z - z) < 6)) continue;
      spots.push({ x, z, yaw: Math.atan2(-nx * side, -nz * side) });
    }
    // (and a couple at the pond's edge)
    const edge = (POND.r + 1.7) / (POND.r + 2.6);
    for (let k = 0; spots.length < nF && k < shoreList.length; k += 6) {
      const x = POND.x + (shoreList[k] - POND.x) * edge;
      const z = POND.z + (shoreList[k + 1] - POND.z) * edge;
      if (!(bitsAt(g, x, z) & B_LAND) || bitsAt(g, x, z) & B_BLOCK) continue;
      spots.push({ x, z, yaw: Math.atan2(POND.x - x, POND.z - z) });
    }
    const greens = [0x5fb03c, 0x7cc242, 0x4f9a3a, 0x9ac43c];
    spots.forEach((s, i) => {
      note("frog", s.x, s.z);
      const a = add(K_FROG, R_NONE, s.x, s.z, 1.8, V_FROG, greens[i % greens.length]);
      a.yaw = s.yaw;
      a.hr = 2.2;
      a.cx = s.x + Math.sin(s.yaw) * 0.8;
      a.cz = s.z + Math.cos(s.yaw) * 0.8;
    });
  }

  // ── the bear family, fishing at a quiet stretch of the stream ──
  const rocks: { x: number; z: number; r: number }[] = [];
  {
    let best: { i: number; side: number; score: number } | null = null;
    for (let i = 4; i + 4 < STREAM_POINTS.length; i++) {
      const [px, pz] = STREAM_POINTS[i];
      if (BRIDGES.some((br) => Math.hypot(br.x - px, br.z - pz) < 14)) continue;
      if (fieldAt(f.land, px, pz) < 6) continue;
      const td = fieldAt(f.trail, px, pz);
      if (td < 9) continue;
      const [qx, qz] = STREAM_POINTS[i + 1];
      const tl = Math.hypot(qx - px, qz - pz) || 1;
      const nx = (qz - pz) / tl;
      const nz = -(qx - px) / tl;
      for (const side of [1, -1]) {
        const x = px + nx * side * (STREAM_WIDTH / 2 + 1.2);
        const z = pz + nz * side * (STREAM_WIDTH / 2 + 1.2);
        if (!(bitsAt(g, x, z) & B_LAND) || bitsAt(g, x, z) & B_BLOCK || slopeOf(g, x, z) > 0.4) continue;
        if (shareAround(g, x + nx * side * 3, z + nz * side * 3, 3, B_LAND) < 0.8) continue;
        const score = Math.min(td, 20) + shareAround(g, x, z, 4, B_LAND | B_OPEN) * 5;
        if (!best || score > best.score) best = { i, side, score };
      }
    }
    if (best) {
      const [px, pz] = STREAM_POINTS[best.i];
      const [qx, qz] = STREAM_POINTS[best.i + 1];
      const tl = Math.hypot(qx - px, qz - pz) || 1;
      const tx = (qx - px) / tl;
      const tz = (qz - pz) / tl;
      const nx = tz * best.side;
      const nz = -tx * best.side;
      const mx = px + nx * (STREAM_WIDTH / 2 + 0.95);
      const mz = pz + nz * (STREAM_WIDTH / 2 + 0.95);
      note("bears", mx, mz);
      rocks.push({ x: px - nx * 0.2 + tx * 0.6, z: pz - nz * 0.2 + tz * 0.6, r: 0.55 }, { x: px + tx * -1.3 + nx * 0.5, z: pz + tz * -1.3 + nz * 0.5, r: 0.42 }, { x: px - nx * 0.9 - tx * 0.4, z: pz - nz * 0.9 - tz * 0.4, r: 0.36 });
      const gid = group++;
      const mother = add(K_BEAR, R_MOTHER, mx, mz, 1.3, 0, 0x7a4a2a);
      mother.yaw = Math.atan2(-nx, -nz);
      mother.hx = mx + nx * 2;
      mother.hz = mz + nz * 2;
      mother.hr = 5;
      mother.bx = mx;
      mother.bz = mz;
      mother.ax = -nx; // the way to the water
      mother.az = -nz;
      mother.group = gid;
      mother.st = S_FISH;
      const c = coverNear(g, mx + nx * 3, mz + nz * 3, 30);
      mother.cx = c.x;
      mother.cz = c.z;
      const mi = agents.length - 1;
      for (let k = 0; k < (low ? 1 : 2); k++) {
        const p = nearOk(mx + nx * (2.5 + k) + tx * (k ? 2 : -2), mz + nz * (2.5 + k) + tz * (k ? 2 : -2), 3, landOk(g, 0.5), r) ?? { x: mx + nx * 3, z: mz + nz * 3 };
        const cub = add(K_BEAR, R_CUB, p.x, p.z, 0.62, 0, k ? 0x6a3e22 : 0x845232);
        cub.hx = mx + nx * 2.8;
        cub.hz = mz + nz * 2.8;
        cub.hr = 4.5;
        cub.lead = mi;
        cub.group = gid;
        cub.st = S_PLAY;
        cub.cx = c.x;
        cub.cz = c.z;
      }
    }
  }

  // ── turtles crossing the trails near the water ──
  {
    const nT = low ? 1 : 2;
    const done: { x: number; z: number }[] = [];
    for (const pts of TRAIL_POINTS) {
      for (let i = 1; i + 1 < pts.length && done.length < nT; i += 2) {
        const [px, pz] = pts[i];
        const nearWater = Math.hypot(px - POND.x, pz - POND.z) < 40 || fieldAt(f.stream, px, pz) < 22;
        if (!nearWater || fieldAt(f.land, px, pz) < 5) continue;
        if (BRIDGES.some((br) => Math.hypot(br.x - px, br.z - pz) < 10)) continue;
        if (done.some((d) => Math.hypot(d.x - px, d.z - pz) < 30)) continue;
        const [ax, az] = pts[i - 1];
        const [bx, bz] = pts[i + 1];
        const tl = Math.hypot(bx - ax, bz - az) || 1;
        const nx = (bz - az) / tl;
        const nz = -(bx - ax) / tl;
        const A = { x: px + nx * 3.4, z: pz + nz * 3.4 };
        const B = { x: px - nx * 3.4, z: pz - nz * 3.4 };
        const ok = landOk(g, 0.3);
        if (!ok(A.x, A.z) || !ok(B.x, B.z) || !ok(px, pz)) continue;
        if (!free(A.x, A.z, 0.3) || !free(B.x, B.z, 0.3)) continue;
        done.push({ x: px, z: pz });
        note("turtle", px, pz);
        const a = add(K_TURTLE, R_NONE, A.x + (B.x - A.x) * 0.3, A.z + (B.z - A.z) * 0.3, 1.8, V_TURTLE, 0x6b8a3a);
        a.ax = A.x;
        a.az = A.z;
        a.bx = B.x;
        a.bz = B.z;
        a.hx = px;
        a.hz = pz;
        a.hr = 5;
        a.yaw = Math.atan2(B.x - A.x, B.z - A.z);
        a.tx = B.x;
        a.tz = B.z;
        a.st = S_CROSS;
      }
    }
  }

  // leashes: home range, plus room to reach the hiding places and the second tree / far side
  for (const a of agents) {
    let l = a.hr * 2 + 14;
    l = Math.max(l, Math.hypot(a.cx - a.hx, a.cz - a.hz) + 8);
    if (a.kind === K_RABBIT || a.kind === K_SQUIRREL || a.kind === K_TURTLE || a.kind === K_FOX) l = Math.max(l, Math.hypot(a.ax - a.hx, a.az - a.hz) + 8);
    if (a.kind === K_TURTLE) l = Math.max(l, Math.hypot(a.bx - a.hx, a.bz - a.hz) + 8);
    a.leash = l;
  }
  // slots: instance index inside each mesh (in plan order)
  const counts = new Array(MESHES).fill(0);
  for (const a of agents) a.slot = counts[a.mesh]++;
  const shores = new Float32Array(shoreList);
  return { agents, paddock, den, burrows, rocks, shores, trees, sites, counts };
}
