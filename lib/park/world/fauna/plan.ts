// Where Cucaino Park's land animals live and roam — pure maths, seeded, deterministic, no three.js
// (tested). Every animal is drawn at its TRUE size (types.ts SIZES).
//
// Roaming herds and wanderers (they travel the whole island along the roaming map, ./roam.ts):
//   - deer herds, two kangaroo mobs (a mother with a joey in her pouch, a joey out and about), an
//     emu dad with his chicks, cows, goats on the hillsides, the farm's sheep and lambs, and a little
//     safari: giraffes, a zebra herd tagging along with them, and an elephant family
//   - foxes on their rounds, wombats, echidnas and hedgehogs pottering about on their own
// Homebodies:
//   - a fenced paddock of horses and ponies, a farm corner beside it (chickens, a coop, hay)
//   - rabbit warrens, a fox den with kits, squirrels, koalas and kookaburras in trees by the
//     trails, owls, ducks and a platypus on the lily pond, frogs on the banks, a bear family
//     fishing at the stream and turtles plodding across the trails
import { LANDS } from "../../registry/places";
import { BRIDGES, ISLAND_R, POND, STREAM_POINTS, STREAM_WIDTH, TRAIL_POINTS } from "../../registry/island";
import { LAKE, LAKE_OUTLINE, riverAt, waterSdf } from "../../registry/waterways";
import { groundY } from "../../registry/terrain";
import { fieldAt, openFields, rngOf, type FreeFn, type Meadow, type Rng } from "../storybook/plan";
import { B_BANK, B_BLOCK, B_KEEP, B_LAND, B_OPEN, B_TRAIL, bitsAt, shareAround, slopeOf, type WalkGrid } from "./ground";
import { TAG_HILL, TAG_OPEN, TAG_PLAZA, TAG_ROOMY, TAG_SHADE, TAG_TRAIL, TAG_WATER, buildRoamGraph, componentSizes, spotOk, type RoamGraph } from "./roam";
import {
  C_GIANT,
  C_LARGE,
  C_NONE,
  C_SMALL,
  K_BEAR,
  K_CHICKEN,
  K_COW,
  K_DEER,
  K_DUCK,
  K_ECHIDNA,
  K_ELEPHANT,
  K_EMU,
  K_FOX,
  K_FROG,
  K_GIRAFFE,
  K_GOAT,
  K_HEDGEHOG,
  K_HORSE,
  K_KANGAROO,
  K_KOALA,
  K_KOOKABURRA,
  K_OWL,
  K_PLATYPUS,
  K_RABBIT,
  K_SHEEP,
  K_SQUIRREL,
  K_TURTLE,
  K_WOMBAT,
  K_ZEBRA,
  MESH_OF,
  MESHES,
  R_BULL,
  R_CUB,
  R_DOE,
  R_DRAKE,
  R_DUCKLING,
  R_FAWN,
  R_FOAL,
  R_HEN,
  R_JOEY,
  R_KIT,
  R_LAMB,
  R_MOTHER,
  R_NONE,
  R_ROAMER,
  R_ROOSTER,
  R_STAG,
  R_VIXEN,
  SIZES,
  S_CROSS,
  S_FISH,
  S_IDLE,
  S_IN_TREE,
  S_PLAY,
  TUNE,
  V_BILLY,
  V_CHICKEN,
  V_DRAKE,
  V_DUCKLING,
  V_ECHIDNA,
  V_ELEPHANT,
  V_EMU,
  V_FROG,
  V_GIRAFFE,
  V_HEDGEHOG,
  V_JOEY_POUCH,
  V_KOALA,
  V_KOOKABURRA,
  V_PLATYPUS,
  V_PONY_LIGHT,
  V_ROOSTER,
  V_SHEEP,
  V_TURTLE,
  V_WOMBAT,
  V_ZEBRA,
  inPaddock,
  paddockPoint,
  trueScale,
  HEAD_M,
  UNITS_PER_M,
  type Agent,
  type Paddock,
  type TreeLite,
} from "./types";

const TAU = Math.PI * 2;

/** route buffer slots per animal (nodes) */
export const RMAX = 40;

export interface FaunaPlan {
  agents: Agent[];
  paddock: Paddock | null;
  /** the farm corner (coop, hay, trough) beside the paddock */
  farm: { x: number; z: number; yaw: number } | null;
  /** fox den mound (mouth faces `yaw`) */
  den: { x: number; z: number; yaw: number } | null;
  /** rabbit burrow holes */
  burrows: { x: number; z: number }[];
  /** wombat burrows (bigger mounds) */
  holes: { x: number; z: number; yaw: number }[];
  /** stepping stones in the stream by the bears' fishing spot */
  rocks: { x: number; z: number; r: number }[];
  /** points on the pond shore the ducks waddle out to (x, z pairs) */
  shores: Float32Array;
  trees: TreeLite[];
  /** the roaming map and every animal's slice of the route buffer (RMAX nodes each) */
  graph: RoamGraph;
  routes: Int16Array;
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
    id: 0,
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
    cls: C_NONE,
    rn: 0,
    ri: 0,
    goal: -1,
    doing: 0,
    linger: 4 + ((seed * 0.377) % 1) * 30,
    sx: 0,
    sz: 0,
    cool: 10 + ((seed * 0.211) % 1) * 30,
    hint: 0,
    drank: -99,
    prog: 1e9,
    stuck: 0,
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
    head: (HEAD_M[kind] ?? 1) * UNITS_PER_M * (s / trueScale(kind)),
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
function edgeSpots(g: WalkGrid, free: FreeFn, r: Rng, count: number, sep: number, avoid: Avoid[], opts: { trail?: number; ring?: number } = {}): Spot[] {
  const out: Spot[] = [];
  const ring = opts.ring ?? 6;
  for (let tries = 0; tries < 6000 && out.length < count; tries++) {
    const a = r() * TAU;
    const d = 20 + Math.sqrt(r()) * (ISLAND_R - 34);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const b = bitsAt(g, x, z);
    if ((b & (B_LAND | B_OPEN)) !== (B_LAND | B_OPEN) || b & (B_TRAIL | B_BLOCK | B_KEEP)) continue;
    if (slopeOf(g, x, z) > 0.35) continue;
    if (!roomy(x, z, opts.trail ?? 5, 6)) continue;
    let cov = 0;
    let open = 0;
    let nx = 0;
    let nz = 0;
    for (let k = 0; k < RING; k++) {
      const a2 = (k / RING) * TAU;
      const sx = Math.sin(a2);
      const sz = Math.cos(a2);
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

/** open meadow spots (rabbit warrens) */
function openSpots(g: WalkGrid, free: FreeFn, r: Rng, count: number, sep: number, avoid: Avoid[], test: (x: number, z: number) => boolean): Spot[] {
  const out: Spot[] = [];
  for (let tries = 0; tries < 6000 && out.length < count; tries++) {
    const a = r() * TAU;
    const d = 20 + Math.sqrt(r()) * (ISLAND_R - 32);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const b = bitsAt(g, x, z);
    if ((b & (B_LAND | B_OPEN)) !== (B_LAND | B_OPEN) || b & (B_TRAIL | B_BLOCK | B_KEEP)) continue;
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
      if (b & B_LAND && !(b & (B_OPEN | B_BLOCK | B_KEEP))) {
        const qx = px + Math.sin(a) * 1.5;
        const qz = pz + Math.cos(a) * 1.5;
        const bq = bitsAt(g, qx, qz);
        return bq & B_LAND && !(bq & (B_OPEN | B_BLOCK | B_KEEP)) ? { x: qx, z: qz } : { x: px, z: pz };
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
  return !!(b & B_LAND) && !(b & (B_BLOCK | B_KEEP)) && (!open || !!(b & B_OPEN)) && slopeOf(g, x, z) <= maxSlope;
};

// ── the paddock ──

function planPaddock(g: WalkGrid, free: FreeFn, trees: TreeLite[], meadows: Meadow[], flocks: readonly { x: number; z: number; r: number }[]): Paddock | null {
  const pets = LANDS.find((l) => l.id === "pets");
  if (!pets) return null;
  const near = trees.filter((t) => Math.hypot(t.x - pets.x, t.z - pets.z) < pets.radius + 75);
  // (true-size horses are big: as roomy a paddock as fits)
  const sizes: [number, number][] = [
    [10, 6.5],
    [8.5, 5.5],
    [7, 4.8],
  ];
  // (clear of every flock if it can be; else as far from them as fits — the sheep's pasture is carved round it anyway)
  for (const strict of [true, false])
  for (const [hw, hd] of sizes) {
    let best: Paddock | null = null;
    let bestScore = Infinity;
    for (let dist = pets.radius + 4; dist <= pets.radius + 60; dist += 2)
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * TAU;
        const x = pets.x + Math.sin(a) * dist;
        const z = pets.z + Math.cos(a) * dist;
        // (not in the view from the park gate, not by the plaza, not where the storybook's sheep graze)
        if (Math.hypot(x, z - 30) < 28 || Math.hypot(x, z) < 30) continue;
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
              if (!(b & B_LAND) || b & (B_TRAIL | B_BANK | B_BLOCK | B_KEEP)) ok = false;
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
          // (never on a flock's grazing: the paddock and the farm are carved out of the sheep's pasture)
          if (strict && flocks.some((fl) => Math.hypot(fl.x - x, fl.z - z) < fl.r + Math.hypot(hw, hd) + 4)) continue;
          const sheep = meadows.some((m) => Math.hypot(m.x - x, m.z - z) < m.r + Math.max(hw, hd) + 3);
          const flock = flocks.some((fl) => Math.hypot(fl.x - x, fl.z - z) < fl.r + Math.max(hw, hd) + 14);
          const score = dist + rough * 30 + (sheep ? 40 : 0) + (flock ? 60 : 0);
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

/** the storybook's sheep keep out of the paddock (and a sheep's width round its fence) and the farm corner */
export function sheepKeepOut(plan: Pick<FaunaPlan, "paddock" | "farm">): (x: number, z: number) => boolean {
  const p = plan.paddock;
  const f = plan.farm;
  return (x, z) => (p !== null && inPaddock(p, x, z, -2.2)) || (f !== null && (x - f.x) ** 2 + (z - f.z) ** 2 < 8 * 8);
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
  /** the storybook's sheep flocks (centre, radius): nobody makes a home in them */
  flocks?: readonly { x: number; z: number; r: number }[];
}

/** a herd member: kind, role, variant, coat, is it a youngster, who it follows (index in the herd, -1 = the herd's leader) */
type Member = [kind: number, role: number, variant: number, coat: number, young: boolean, follows: number];

export function planFauna(free: FreeFn, g: WalkGrid, forest: FaunaForest, opts: FaunaOptions = {}): FaunaPlan {
  const low = !!opts.lowQuality;
  const r = rngOf(opts.seed ?? 20261001);
  const agents: Agent[] = [];
  const sites: Record<string, [number, number][]> = {};
  const note = (k: string, x: number, z: number) => (sites[k] ??= []).push([Math.round(x), Math.round(z)]);
  let seed = 1;
  /** true size, with a little variety */
  const sized = (kind: number, young: boolean, extra = 1) => trueScale(kind, young, extra) * (1 + (r() * 2 - 1) * (SIZES[kind].spread ?? 0.03));
  const add = (kind: number, role: number, x: number, z: number, s: number, variant: number, coat: number) => {
    const a = makeAgent(kind, role, x, z, s, variant, coat, seed++ * 37);
    agents.push(a);
    return a;
  };
  const trees = forest.trees;
  const avoid: Avoid[] = [{ x: 0, z: 0, r: 22 }];
  for (const o of opts.obstacles ?? []) if (o.r >= 1.9) avoid.push({ x: o.x, z: o.z, r: o.r + 9 });
  for (const fl of opts.flocks ?? []) avoid.push({ x: fl.x, z: fl.z, r: fl.r + 6 });
  let group = 0;

  // ── the paddock ──
  const paddock = planPaddock(g, free, trees, forest.meadows, opts.flocks ?? []);
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
      paddockPoint(paddock, (r() * 2 - 1) * (paddock.hw - 3), (r() * 2 - 1) * (paddock.hd - 3), q);
      const coat = coats[i % coats.length];
      const light = coat === 0xe8e2d6 || coat === 0xe0b565 || coat === 0xb8b2aa;
      // horses at 1.6 m, a 1.2 m pony, and a foal
      const s = foal ? sized(K_HORSE, true) : i === 2 ? sized(K_HORSE, false, 0.75) : sized(K_HORSE, false);
      const a = add(K_HORSE, foal ? R_FOAL : R_NONE, q.x, q.z, s, light ? V_PONY_LIGHT : 0, foal ? 0xc07a44 : coat);
      a.hx = paddock.x;
      a.hz = paddock.z;
      a.hr = Math.min(paddock.hw, paddock.hd);
      a.group = gid;
      if (i === 0) mare = agents.length - 1;
      if (foal) a.lead = mare;
    }
  }

  // ── the farm corner: just outside the paddock (or near the Pet Meadow) ──
  let farm: FaunaPlan["farm"] = null;
  {
    const pets = LANDS.find((l) => l.id === "pets");
    const cx = paddock ? paddock.x : pets ? pets.x : -60;
    const cz = paddock ? paddock.z : pets ? pets.z : 30;
    // the sheep and chickens come home here but roam tens of metres round it (the herd's home
    // range below is 55 m) — a yard that's merely clear of water within its own few metres can
    // still back straight onto a lake or the stream a short walk further out, so try first for a
    // site with real room off the shore, and only fall back to the tighter check if the ground
    // near the paddock genuinely never offers that (a small island, a tight cove)
    const findFarm = (shoreClear: number) => {
      let found: { x: number; z: number; s: number } | null = null;
      for (let d = paddock ? Math.max(paddock.hw, paddock.hd) + 4 : (pets?.radius ?? 10) + 8; d < 70 && !found; d += 2)
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * TAU + d;
          const x = cx + Math.sin(a) * d;
          const z = cz + Math.cos(a) * d;
          if (paddock && inPaddock(paddock, x, z, -4)) continue;
          if (!landOk(g, 0.35, true)(x, z) || !roomy(x, z, 3.4, 3) || !free(x, z, 1.6)) continue;
          if (shareAround(g, x, z, 4, B_LAND | B_OPEN) < 0.6) continue;
          if (waterSdf(x, z) < shoreClear) continue;
          if ((opts.flocks ?? []).some((fl) => Math.hypot(fl.x - x, fl.z - z) < fl.r + 8)) continue;
          const s = Math.hypot(x - cx, z - cz) + slopeOf(g, x, z) * 20;
          if (!found || s < found.s) found = { x, z, s };
        }
      return found;
    };
    const best = findFarm(20) ?? findFarm(0);
    if (best) {
      farm = { x: best.x, z: best.z, yaw: Math.atan2(cx - best.x, cz - best.z) };
      note("farm", farm.x, farm.z);
      avoid.push({ x: farm.x, z: farm.z, r: 9 });
    }
  }

  // ── the roaming map (not into the paddock or the farmyard's coop) ──
  const noGo: Avoid[] = [];
  if (paddock) noGo.push({ x: paddock.x, z: paddock.z, r: Math.hypot(paddock.hw, paddock.hd) + 1.5 });
  if (farm) noGo.push({ x: farm.x, z: farm.z, r: 3 });
  const graph = buildRoamGraph(g, { avoid: noGo });
  const mainComp = (cls: number, rank = 0) => {
    const sizes = componentSizes(graph, cls);
    if (!sizes.length) return -1;
    const want = sizes[Math.min(rank, sizes.length - 1)];
    const counts = new Map<number, number>();
    for (let i = 0; i < graph.n; i++) if (graph.comp[cls][i] >= 0) counts.set(graph.comp[cls][i], (counts.get(graph.comp[cls][i]) ?? 0) + 1);
    for (const [c, n] of counts) if (n === want) return c;
    return -1;
  };
  const starts: { x: number; z: number }[] = [];
  /** a roaming start well away from the other herds (in that class's connected island) */
  const startNode = (cls: number, tags: number, comp: number, near?: { x: number; z: number; r: number }) => {
    let best = -1;
    let bestS = -Infinity;
    for (let i = 0; i < graph.n; i++) {
      if (!graph.ok[cls][i] || (comp >= 0 && graph.comp[cls][i] !== comp)) continue;
      if (tags && !(graph.tag[i] & tags)) continue;
      const x = graph.x[i];
      const z = graph.z[i];
      if (!far(x, z, avoid.slice(1))) continue;
      if (near && Math.hypot(x - near.x, z - near.z) > near.r) continue;
      let md = 140;
      for (const s of starts) md = Math.min(md, Math.hypot(s.x - x, s.z - z));
      const sc = md + r() * 12 - (near ? Math.hypot(x - near.x, z - near.z) * 0.3 : 0);
      if (sc > bestS) {
        bestS = sc;
        best = i;
      }
    }
    return best;
  };
  /**
   * A roaming herd: the leader at `node`, everyone else round it, each with a place in the moving
   * herd (followers walk in a loose file behind the one they follow; youngsters at mum's side).
   */
  const addHerd = (name: string, cls: number, node: number, members: Member[], homeR: number, home?: { x: number; z: number }) => {
    if (node < 0 || !members.length) return -1;
    const gid = group++;
    const base = agents.length;
    const nx = graph.x[node];
    const nz = graph.z[node];
    note(name, nx, nz);
    starts.push({ x: nx, z: nz });
    const kids = new Map<number, number>();
    members.forEach(([kind, role, variant, coat, young, follows], k) => {
      const s = sized(kind, young);
      const p = k === 0 ? { x: nx, z: nz } : nearOk(nx + (r() - 0.5) * 6, nz + (r() - 0.5) * 6, 7, (x, z) => spotOk(g, cls, x, z), r) ?? { x: nx, z: nz };
      const a = add(kind, role, p.x, p.z, s, variant, coat);
      a.cls = cls;
      a.group = gid;
      a.hx = home?.x ?? nx;
      a.hz = home?.z ?? nz;
      a.hr = homeR;
      a.leash = 1e5;
      a.goal = k === 0 ? node : -1;
      a.yaw = r() * TAU;
      if (k > 0) {
        const li = base + Math.max(0, follows);
        a.lead = li;
        const L = agents[li];
        const n = kids.get(li) ?? 0;
        kids.set(li, n + 1);
        const side = n % 2 ? 1 : -1;
        const row = Math.floor(n / 2) + 1;
        const sp = (TUNE[kind].body * s + TUNE[L.kind].body * L.s) * 1.25 + 0.7;
        if (young && L.kind === kind) {
          a.sx = side * sp * (cls === C_GIANT ? 0.3 : 0.45);
          a.sz = sp * 0.6;
        } else if (cls === C_GIANT) {
          // the big ones walk in single file (the trails are narrow for them)
          a.sx = side * sp * 0.15;
          a.sz = (n + 1) * sp * 1.05;
        } else {
          a.sx = side * sp * (row % 2 ? 0.8 : 0.35);
          a.sz = row * sp * 0.95;
        }
      }
    });
    return base;
  };

  // ── deer herds ──
  const L1 = mainComp(C_LARGE);
  const deerCoat = () => [0xb8743a, 0xc0823f, 0xa86a36][Math.floor(r() * 3)];
  addHerd("deer", C_LARGE, startNode(C_LARGE, TAG_OPEN | TAG_TRAIL, L1), low
    ? [[K_DEER, R_STAG, 1, 0x9a5f30, false, -1], [K_DEER, R_DOE, 0, deerCoat(), false, 0], [K_DEER, R_FAWN, 2, 0xc0823f, true, 1]]
    : [[K_DEER, R_STAG, 1, 0x9a5f30, false, -1], [K_DEER, R_DOE, 0, deerCoat(), false, 0], [K_DEER, R_DOE, 0, deerCoat(), false, 0], [K_DEER, R_FAWN, 2, 0xc0823f, true, 1], [K_DEER, R_FAWN, 2, 0xc89048, true, 2]], 90);
  if (!low)
    addHerd("deer", C_LARGE, startNode(C_LARGE, TAG_OPEN | TAG_SHADE, L1), [[K_DEER, R_DOE, 0, deerCoat(), false, -1], [K_DEER, R_DOE, 0, deerCoat(), false, 0], [K_DEER, R_DOE, 0, deerCoat(), false, 0], [K_DEER, R_FAWN, 2, 0xc0823f, true, 1]], 90);

  // ── kangaroo mobs (a mother with a joey in her pouch, and a joey out and about) ──
  const red = () => [0xc0703e, 0xb8683a, 0xa8754a, 0x9a8a80][Math.floor(r() * 4)];
  addHerd("kangaroos", C_LARGE, startNode(C_LARGE, TAG_OPEN | TAG_TRAIL | TAG_PLAZA, L1), low
    ? [[K_KANGAROO, R_BULL, 0, 0xb8603a, false, -1], [K_KANGAROO, R_MOTHER, V_JOEY_POUCH, red(), false, 0], [K_KANGAROO, R_JOEY, 0, 0xc8804a, true, 1]]
    : [[K_KANGAROO, R_BULL, 0, 0xb8603a, false, -1], [K_KANGAROO, R_MOTHER, V_JOEY_POUCH, red(), false, 0], [K_KANGAROO, R_DOE, 0, red(), false, 0], [K_KANGAROO, R_JOEY, 0, 0xc8804a, true, 1], [K_KANGAROO, R_DOE, 0, 0x9a8a80, false, 2]], 85);
  if (!low)
    addHerd("kangaroos", C_LARGE, startNode(C_LARGE, TAG_OPEN | TAG_TRAIL, L1), [[K_KANGAROO, R_MOTHER, V_JOEY_POUCH, red(), false, -1], [K_KANGAROO, R_DOE, 0, red(), false, 0], [K_KANGAROO, R_JOEY, 0, 0xc8804a, true, 0]], 85);

  // ── an emu dad and his chicks ──
  addHerd("emus", C_LARGE, startNode(C_LARGE, TAG_OPEN | TAG_TRAIL, L1), low ? [[K_EMU, R_BULL, V_EMU, 0x6a5444, false, -1], [K_EMU, R_KIT, V_EMU, 0xa8906a, true, 0]] : [[K_EMU, R_BULL, V_EMU, 0x6a5444, false, -1], [K_EMU, R_KIT, V_EMU, 0xa8906a, true, 0], [K_EMU, R_KIT, V_EMU, 0x9a8460, true, 0]], 90);

  // ── the farm's sheep and lambs (they come home to the farm) ──
  if (farm) {
    // (the farm's own patch of the map if it's a decent size: a farm flock that stays near home)
    const compSize = new Map<number, number>();
    for (let i = 0; i < graph.n; i++) if (graph.comp[C_LARGE][i] >= 0) compSize.set(graph.comp[C_LARGE][i], (compSize.get(graph.comp[C_LARGE][i]) ?? 0) + 1);
    let n0 = -1;
    let bd = 45;
    for (let i = 0; i < graph.n; i++) {
      const c = graph.comp[C_LARGE][i];
      if (!graph.ok[C_LARGE][i] || c < 0 || (compSize.get(c) ?? 0) < 8) continue;
      const d = Math.hypot(graph.x[i] - farm.x, graph.z[i] - farm.z);
      if (d < bd && d > 6) {
        bd = d;
        n0 = i;
      }
    }
    if (n0 < 0) n0 = startNode(C_LARGE, 0, L1, { x: farm.x, z: farm.z, r: 60 });
    const wool = () => [0x3a302a, 0xe8dccb, 0x4a3a30][Math.floor(r() * 3)];
    addHerd("sheep", C_LARGE, n0, low
      ? [[K_SHEEP, R_NONE, V_SHEEP, wool(), false, -1], [K_SHEEP, R_NONE, V_SHEEP, wool(), false, 0], [K_SHEEP, R_LAMB, V_SHEEP, 0xe8dccb, true, 0]]
      : [[K_SHEEP, R_NONE, V_SHEEP, wool(), false, -1], [K_SHEEP, R_NONE, V_SHEEP, wool(), false, 0], [K_SHEEP, R_NONE, V_SHEEP, wool(), false, 0], [K_SHEEP, R_LAMB, V_SHEEP, 0xe8dccb, true, 0], [K_SHEEP, R_LAMB, V_SHEEP, 0x3a302a, true, 1], [K_SHEEP, R_LAMB, V_SHEEP, 0xe8dccb, true, 2]], 55, farm);
  }

  // ── goats on the hillsides ──
  {
    const coats = [0xf2eee6, 0x8a6446, 0xf2eee6, 0x9e9890, 0xe9e1d2, 0x6a5444];
    const m: Member[] = low
      ? [[K_GOAT, R_BULL, V_BILLY, coats[0], false, -1], [K_GOAT, R_NONE, 0, coats[1], false, 0], [K_GOAT, R_KIT, 0, coats[2], true, 1]]
      : [[K_GOAT, R_BULL, V_BILLY, coats[0], false, -1], [K_GOAT, R_NONE, 0, coats[1], false, 0], [K_GOAT, R_NONE, 0, coats[3], false, 0], [K_GOAT, R_NONE, 0, coats[4], false, 0], [K_GOAT, R_KIT, 0, coats[2], true, 1], [K_GOAT, R_KIT, 0, coats[5], true, 2]];
    addHerd("goats", C_LARGE, startNode(C_LARGE, TAG_HILL, L1), m, 60);
  }

  // ── the big ones: cows, and the safari (giraffes, zebras tagging along, an elephant family) ──
  // (the safari lives where it can walk down to drink: the biggest part of the giants' map that
  // reaches the lake or the river)
  const wetComp = (() => {
    const sizes = componentSizes(graph, C_GIANT);
    for (let rank = 0; rank < Math.min(4, sizes.length); rank++) {
      const c = mainComp(C_GIANT, rank);
      if (sizes[rank] < 24) break;
      for (let i = 0; i < graph.n; i++) if (graph.ok[C_GIANT][i] && graph.comp[C_GIANT][i] === c && graph.tag[i] & TAG_WATER) return c;
    }
    return -1;
  })();
  const G0 = wetComp >= 0 ? wetComp : mainComp(C_GIANT, 0);
  const G1 = mainComp(C_GIANT, 0) === G0 ? mainComp(C_GIANT, 1) : mainComp(C_GIANT, 0);
  const safariNode = startNode(C_GIANT, TAG_ROOMY, G0);
  const gi = addHerd("giraffes", C_GIANT, safariNode, low ? [[K_GIRAFFE, R_BULL, V_GIRAFFE, 0xb8743a, false, -1], [K_GIRAFFE, R_KIT, V_GIRAFFE, 0xc8844a, true, 0]] : [[K_GIRAFFE, R_BULL, V_GIRAFFE, 0xa8642e, false, -1], [K_GIRAFFE, R_NONE, V_GIRAFFE, 0xb8743a, false, 0], [K_GIRAFFE, R_KIT, V_GIRAFFE, 0xc8844a, true, 1]], 70);
  if (gi >= 0) {
    // the zebras keep company with the giraffes (their leader follows the giraffes' leader)
    const zb = addHerd("zebras", C_GIANT, safariNode, low ? [[K_ZEBRA, R_NONE, V_ZEBRA, 0xf6f2ea, false, -1], [K_ZEBRA, R_NONE, V_ZEBRA, 0xf2ede4, false, 0], [K_ZEBRA, R_KIT, V_ZEBRA, 0xf6f2ea, true, 1]] : [[K_ZEBRA, R_NONE, V_ZEBRA, 0xf6f2ea, false, -1], [K_ZEBRA, R_NONE, V_ZEBRA, 0xf2ede4, false, 0], [K_ZEBRA, R_NONE, V_ZEBRA, 0xf6f2ea, false, 0], [K_ZEBRA, R_NONE, V_ZEBRA, 0xefeae0, false, 1], [K_ZEBRA, R_KIT, V_ZEBRA, 0xf6f2ea, true, 2]], 70);
    if (zb >= 0) {
      const z0 = agents[zb];
      z0.lead = gi;
      z0.sx = -7;
      z0.sz = 9;
      z0.goal = -1;
    }
    addHerd("elephants", C_GIANT, startNode(C_GIANT, TAG_ROOMY | TAG_OPEN, G0), low ? [[K_ELEPHANT, R_MOTHER, V_ELEPHANT, 0x9c9894, false, -1], [K_ELEPHANT, R_KIT, V_ELEPHANT, 0xa8a4a0, true, 0]] : [[K_ELEPHANT, R_MOTHER, V_ELEPHANT, 0x9c9894, false, -1], [K_ELEPHANT, R_NONE, V_ELEPHANT, 0x8e8a86, false, 0], [K_ELEPHANT, R_KIT, V_ELEPHANT, 0xa8a4a0, true, 0]], 80);
  }
  {
    const comp = G1 >= 0 && componentSizes(graph, C_GIANT)[1] >= 18 ? G1 : G0;
    const coats = [0x2c2622, 0x7a4a2a, 0x2c2622, 0x8a5a36];
    addHerd("cows", C_GIANT, startNode(C_GIANT, TAG_ROOMY | TAG_OPEN, comp), low ? [[K_COW, R_NONE, 0, coats[0], false, -1], [K_COW, R_KIT, 0, coats[1], true, 0]] : [[K_COW, R_NONE, 0, coats[0], false, -1], [K_COW, R_NONE, 1, coats[1], false, 0], [K_COW, R_NONE, 0, coats[2], false, 0], [K_COW, R_KIT, 0, coats[3], true, 0]], 80);
  }

  // ── the fox den (a vixen and her kits) and foxes out on their rounds ──
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
      const a = add(K_FOX, kit ? R_KIT : R_VIXEN, p.x, p.z, sized(K_FOX, kit), 0, kit ? 0xd98a4a : 0xe2702a);
      a.hx = mouthX + d.nx * 2.5;
      a.hz = mouthZ + d.nz * 2.5;
      a.hr = kit ? 4 : 8;
      a.cx = mouthX;
      a.cz = mouthZ;
      const c = coverNear(g, d.x, d.z);
      a.ax = c.x;
      a.az = c.z;
      a.group = gid;
      a.st = kit ? S_PLAY : S_IDLE;
    }
  }
  const S0 = mainComp(C_SMALL);
  /** a small animal pottering about on its own over a big home range */
  const addSolo = (name: string, kind: number, role: number, variant: number, coat: number, tags: number, homeR: number) => {
    const node = startNode(C_SMALL, tags, S0);
    if (node < 0) return null;
    const x = graph.x[node];
    const z = graph.z[node];
    note(name, x, z);
    starts.push({ x, z });
    const a = add(kind, role, x, z, sized(kind, false), variant, coat);
    a.cls = C_SMALL;
    a.hx = x;
    a.hz = z;
    a.hr = homeR;
    a.leash = 1e5;
    a.goal = node;
    const c = coverNear(g, x, z);
    a.cx = a.ax = c.x;
    a.cz = a.az = c.z;
    return a;
  };
  for (let i = 0; i < (low ? 1 : 2); i++) addSolo("fox", K_FOX, R_ROAMER, 0, 0xdc6a28, TAG_TRAIL | TAG_OPEN, 70);

  // ── wombats (with their burrows), echidnas, hedgehogs ──
  const holes: FaunaPlan["holes"] = [];
  for (let i = 0; i < (low ? 2 : 3); i++) {
    const a = addSolo("wombat", K_WOMBAT, R_NONE, V_WOMBAT, [0x8a7a68, 0x7a6a5a, 0x9a8a76][i % 3], TAG_SHADE | TAG_TRAIL, 55);
    if (!a) continue;
    // the burrow: at the forest edge near where it starts
    const c = coverNear(g, a.x, a.z, 14);
    const p = nearOk(c.x, c.z, 4, landOk(g, 0.45), r) ?? { x: a.x, z: a.z };
    a.cx = p.x;
    a.cz = p.z;
    holes.push({ x: p.x, z: p.z, yaw: Math.atan2(a.x - p.x, a.z - p.z) });
  }
  for (let i = 0; i < (low ? 1 : 3); i++) addSolo("echidna", K_ECHIDNA, R_NONE, V_ECHIDNA, 0xe8d29a, TAG_TRAIL | TAG_OPEN | TAG_SHADE, 45);
  for (let i = 0; i < (low ? 2 : 4); i++) addSolo("hedgehog", K_HEDGEHOG, R_NONE, V_HEDGEHOG, 0x7a5a3c, TAG_SHADE | TAG_TRAIL, 35);

  // ── rabbit warrens ──
  const burrows: { x: number; z: number }[] = [];
  const warrens = openSpots(g, free, r, low ? 3 : 5, 30, avoid, (x, z) => roomy(x, z, 4, 4) && slopeOf(g, x, z) < 0.3 && shareAround(g, x, z, 5, B_LAND | B_OPEN) > 0.8);
  // brightened a shade so a true-size rabbit still shows up against the grass
  const rabbitCoats = [0xb08a66, 0xb2ac9e, 0xd9b48a, 0x9a7a5e, 0xf5f1ea, 0xb89c78];
  const nRabbits = low ? 8 : 15;
  let rabbitsLeft = nRabbits;
  warrens.forEach((w, wi) => {
    note("warren", w.x, w.z);
    avoid.push({ x: w.x, z: w.z, r: 8 });
    const hs: { x: number; z: number }[] = [];
    for (let k = 0; k < 2; k++) {
      const p = nearOk(w.x + (k ? 1.4 : -1.4), w.z + (k ? 0.6 : -0.5), 2, landOk(g, 0.35, true), r);
      if (p) hs.push(p);
    }
    if (!hs.length) hs.push({ x: w.x, z: w.z });
    burrows.push(...hs);
    const woods = coverNear(g, w.x, w.z, 34);
    const n = wi === warrens.length - 1 ? rabbitsLeft : Math.min(rabbitsLeft, Math.round(nRabbits / warrens.length));
    rabbitsLeft -= n;
    const gid = group++;
    for (let i = 0; i < n; i++) {
      const p = nearOk(w.x + (r() - 0.5) * 5, w.z + (r() - 0.5) * 5, 3, landOk(g, 0.4), r) ?? { x: w.x, z: w.z };
      // a hair bigger (true size well within the test's margin)
      const a = add(K_RABBIT, R_NONE, p.x, p.z, sized(K_RABBIT, false, 1.02), 0, rabbitCoats[(wi * 3 + i) % rabbitCoats.length]);
      const hole = hs[i % hs.length];
      a.hx = w.x;
      a.hz = w.z;
      a.hr = 8;
      a.cx = hole.x;
      a.cz = hole.z;
      a.ax = woods.x;
      a.az = woods.z;
      a.group = gid;
    }
  });

  // ── trees by the trails: squirrels, koalas, kookaburras, owls ──
  const f = openFields();
  const leafy = trees.filter((t) => isLeafy(t) && t.s > 0.75);
  const usedTrees = new Set<number>();
  /** the big obstacles (windmills, buildings): nobody lives in a tree right next to one */
  const bigObs: Avoid[] = (opts.obstacles ?? []).filter((o) => o.r >= 1.9).map((o) => ({ x: o.x, z: o.z, r: o.r + 5 }));
  const order = leafy.map((_, i) => i).sort((a, b) => ((a * 7919 + 13) % 1009) - ((b * 7919 + 13) % 1009));
  const trailTrees = (n: number, minS: number, td0: number, td1: number, sep: number, list: number[]) => {
    const out: number[] = [];
    for (const i of list) {
      if (out.length >= n) break;
      if (usedTrees.has(i)) continue;
      const t = leafy[i];
      if (t.s < minS) continue;
      const td = fieldAt(f.trail, t.x, t.z);
      if (td < td0 || td > td1 || fieldAt(f.land, t.x, t.z) < 3) continue;
      if (Math.hypot(t.x, t.z) < 20) continue;
      if (!far(t.x, t.z, bigObs)) continue;
      if (out.some((k) => Math.hypot(leafy[k].x - t.x, leafy[k].z - t.z) < sep)) continue;
      out.push(i);
    }
    for (const i of out) usedTrees.add(i);
    return out;
  };
  // squirrels (each with a partner tree, across the path if possible)
  {
    const nSq = low ? 4 : 8;
    let made = 0;
    for (const i of order) {
      if (made >= nSq) break;
      if (usedTrees.has(i)) continue;
      const t = leafy[i];
      const td = fieldAt(f.trail, t.x, t.z);
      if (td < 3.5 || td > 10 || fieldAt(f.land, t.x, t.z) < 3) continue;
      if (!(bitsAt(g, t.x + 1, t.z) & B_LAND)) continue;
      if ([...usedTrees].some((k) => Math.hypot(leafy[k].x - t.x, leafy[k].z - t.z) < 22)) continue;
      if (!far(t.x, t.z, avoid.slice(0, 1)) || !far(t.x, t.z, bigObs)) continue;
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
      usedTrees.add(i);
      made++;
      const u = leafy[best];
      note("squirrel", t.x, t.z);
      // brighter grey option (the red was fine), a touch bigger (true size within the test's margin)
      const a = add(K_SQUIRREL, R_NONE, t.x + 1.2, t.z + 0.4, sized(K_SQUIRREL, false, 1.05), 0, r() < 0.75 ? 0xd06c32 : 0xa29c90);
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
  }
  // koalas (in a fork of the trunk, just under the canopy, facing the trail)
  for (const i of trailTrees(low ? 2 : 4, 0.85, 3.5, 9, 26, order.slice().reverse())) {
    const t = leafy[i];
    note("koala", t.x, t.z);
    const dir = nearestTrailDir(t.x, t.z);
    // (brighter, lighter grey than real koalas so they don't melt into the bark; a touch bigger —
    // still true size within the test's 10% margin — so they read from the trail)
    const a = add(K_KOALA, R_NONE, t.x, t.z, sized(K_KOALA, false, 1.045), V_KOALA, [0xc7c2b6, 0xd6d0c2, 0xb8b2a4][i % 3]);
    a.tree = trees.indexOf(t);
    a.yaw = dir.yaw;
    a.act = dir.yaw;
    a.st = S_IN_TREE;
    a.hx = t.x;
    a.hz = t.z;
    a.hr = 12;
    a.leash = 40;
  }
  // kookaburras (on the crown of a tree beside the trail, like the owls)
  for (const i of trailTrees(low ? 3 : 5, 0.8, 4, 12, 28, order.slice(Math.floor(order.length / 3)))) {
    const t = leafy[i];
    const dir = nearestTrailDir(t.x, t.z);
    const q = { x: 0, y: 0, z: 0 };
    perchOf(t, dir.yaw, q);
    note("kookaburra", t.x, t.z);
    const a = add(K_KOOKABURRA, R_NONE, q.x, q.z, sized(K_KOOKABURRA, false), V_KOOKABURRA, 0xffffff);
    a.y = q.y;
    a.yaw = dir.yaw;
    a.hx = q.x;
    a.hz = q.z;
    a.tree = trees.indexOf(t);
  }
  // owls
  for (const i of trailTrees(low ? 2 : 4, 0.9, 4, 14, 30, order.slice().reverse().slice(Math.floor(order.length / 4)))) {
    const t = leafy[i];
    const dir = nearestTrailDir(t.x, t.z);
    const q = { x: 0, y: 0, z: 0 };
    perchOf(t, dir.yaw, q);
    note("owl", t.x, t.z);
    // a touch bigger (true size within the test's margin) and lighter-coated, since it's only seen
    // against a dark dusk/night canopy
    const a = add(K_OWL, R_NONE, q.x, q.z, sized(K_OWL, false, 1.06), 0, [0xc9a878, 0xd8bb8a, 0xb2906a, 0xe2caa0][agents.length % 4]);
    a.y = q.y;
    a.yaw = dir.yaw;
    a.hx = q.x;
    a.hz = q.z;
    a.tree = trees.indexOf(t);
  }

  // ── the farm's chickens (a rooster, hens and chicks) ──
  if (farm) {
    const gid = group++;
    const roster: [number, number, number, number][] = low
      ? [
          [R_ROOSTER, V_ROOSTER, 0xc4562a, -1],
          [R_HEN, V_CHICKEN, 0xb8743a, -1],
          [R_DUCKLING, V_CHICKEN, 0xf2d24a, 1],
        ]
      : [
          [R_ROOSTER, V_ROOSTER, 0xc4562a, -1],
          [R_HEN, V_CHICKEN, 0xb8743a, -1],
          [R_HEN, V_CHICKEN, 0xf4efe6, -1],
          [R_DUCKLING, V_CHICKEN, 0xf2d24a, 1],
          [R_DUCKLING, V_CHICKEN, 0xf2d24a, 3],
          [R_DUCKLING, V_CHICKEN, 0xf2d86a, 4],
        ];
    const base = agents.length;
    for (const [role, variant, coat, follows] of roster) {
      const p = nearOk(farm.x + (r() - 0.5) * 7, farm.z + (r() - 0.5) * 7, 4, landOk(g, 0.4), r) ?? farm;
      const a = add(K_CHICKEN, role, p.x, p.z, sized(K_CHICKEN, role === R_DUCKLING), variant, coat);
      a.hx = farm.x;
      a.hz = farm.z;
      a.hr = role === R_ROOSTER ? 14 : 10;
      a.leash = 30;
      a.cx = farm.x + Math.sin(farm.yaw) * 1.2;
      a.cz = farm.z + Math.cos(farm.yaw) * 1.2;
      a.group = gid;
      if (follows >= 0) a.lead = base + follows;
    }
  }

  // ── ducks and the platypus on the pond ──
  // (the lake's shore nearest the ducks' bay, a step up the bank from the water)
  const shoreList: number[] = [];
  {
    const cand: { x: number; z: number; d: number }[] = [];
    for (let k = 0; k < LAKE_OUTLINE.length - 1; k += 4) {
      const [ox, oz] = LAKE_OUTLINE[k];
      const dx = ox - LAKE.x;
      const dz = oz - LAKE.z;
      const l = Math.hypot(dx, dz) || 1;
      const x = ox + (dx / l) * 2.6;
      const z = oz + (dz / l) * 2.6;
      const b = bitsAt(g, x, z);
      if (!(b & B_LAND) || b & (B_KEEP | B_BLOCK) || slopeOf(g, x, z) > 0.4) continue;
      cand.push({ x, z, d: Math.hypot(x - POND.x, z - POND.z) });
    }
    cand.sort((a, b) => a.d - b.d);
    for (const c of cand.slice(0, 28)) shoreList.push(c.x, c.z);
  }
  {
    const gid = group++;
    const n = low ? 4 : 6;
    let hen = -1;
    let prev = -1;
    for (let i = 0; i < n; i++) {
      const role = i === 0 ? R_HEN : i === 1 ? R_DRAKE : R_DUCKLING;
      const a0 = r() * TAU;
      const d0 = Math.sqrt(r()) * (POND.r - 1.6);
      const x = POND.x + Math.sin(a0) * d0;
      const z = POND.z + Math.cos(a0) * d0;
      const a = add(K_DUCK, role, x, z, sized(K_DUCK, role === R_DUCKLING), role === R_DRAKE ? V_DRAKE : role === R_DUCKLING ? V_DUCKLING : 0, role === R_DRAKE ? 0xd3cfc6 : role === R_HEN ? 0x9c7a52 : 0xf2d24a);
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
    // a touch bigger and a warmer, richer brown than the real thing so it doesn't vanish into the
    // pond's murk (true size within the test's margin)
    const p = add(K_PLATYPUS, R_NONE, POND.x + 2, POND.z - 1.5, sized(K_PLATYPUS, false, 1.05), V_PLATYPUS, 0xa06c3e);
    p.y = g.pondY;
    p.hx = POND.x;
    p.hz = POND.z;
    p.hr = POND.r - 1.0;
    note("platypus", p.x, p.z);
  }

  // ── frogs on the stream banks (and the pond's edge) ──
  {
    const nF = low ? 3 : 6;
    const spots: { x: number; z: number; yaw: number }[] = [];
    for (let i = 2; i + 2 < STREAM_POINTS.length && spots.length < nF - (low ? 1 : 2); i += 2) {
      const [px, pz] = STREAM_POINTS[i];
      const [qx, qz] = STREAM_POINTS[i + 1];
      const tl = Math.hypot(qx - px, qz - pz) || 1;
      const nx = (qz - pz) / tl;
      const nz = -(qx - px) / tl;
      const side = (i >> 1) % 2 ? 1 : -1; // (alternate banks)
      const half = riverAt(px, pz).half;
      const x = px + nx * side * (half + 0.9);
      const z = pz + nz * side * (half + 0.9);
      const b = bitsAt(g, x, z);
      if (!(b & B_LAND) || !(b & B_BANK) || b & (B_TRAIL | B_BLOCK | B_KEEP)) continue;
      if (BRIDGES.some((br) => Math.hypot(br.x - x, br.z - z) < 6)) continue;
      if (fieldAt(f.land, x, z) < 2 || spots.some((s) => Math.hypot(s.x - x, s.z - z) < 6)) continue;
      spots.push({ x, z, yaw: Math.atan2(-nx * side, -nz * side) });
    }
    // (frogs sit right at the water's edge, a step down from the shore spots)
    const edge = 0.985;
    for (let k = 0; spots.length < nF && k < shoreList.length; k += 6) {
      const x = LAKE.x + (shoreList[k] - LAKE.x) * edge;
      const z = LAKE.z + (shoreList[k + 1] - LAKE.z) * edge;
      if (!(bitsAt(g, x, z) & B_LAND) || bitsAt(g, x, z) & (B_BLOCK | B_KEEP)) continue;
      if (spots.some((q) => Math.hypot(q.x - x, q.z - z) < 6)) continue;
      spots.push({ x, z, yaw: Math.atan2(LAKE.x - x, LAKE.z - z) });
    }
    // brighter, more lime than grass-green so a true-size frog still pops at the water's edge
    const greens = [0x8ad345, 0xa8e34f, 0x72c23a, 0xc3ec5f];
    spots.forEach((s, i) => {
      note("frog", s.x, s.z);
      // a touch bigger (true size within the test's margin)
      const a = add(K_FROG, R_NONE, s.x, s.z, sized(K_FROG, false, 1.06), V_FROG, greens[i % greens.length]);
      a.yaw = s.yaw;
      a.hr = 1.6;
      a.cx = s.x + Math.sin(s.yaw) * 0.6;
      a.cz = s.z + Math.cos(s.yaw) * 0.6;
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
        const x = px + nx * side * (riverAt(px, pz).half + 1.6);
        const z = pz + nz * side * (riverAt(px, pz).half + 1.6);
        if (!(bitsAt(g, x, z) & B_LAND) || bitsAt(g, x, z) & (B_BLOCK | B_KEEP) || slopeOf(g, x, z) > 0.4) continue;
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
      const mx = px + nx * (riverAt(px, pz).half + 1.5);
      const mz = pz + nz * (riverAt(px, pz).half + 1.5);
      note("bears", mx, mz);
      rocks.push({ x: px - nx * 0.2 + tx * 0.6, z: pz - nz * 0.2 + tz * 0.6, r: 0.55 }, { x: px + tx * -1.3 + nx * 0.5, z: pz + tz * -1.3 + nz * 0.5, r: 0.42 }, { x: px - nx * 0.9 - tx * 0.4, z: pz - nz * 0.9 - tz * 0.4, r: 0.36 });
      const gid = group++;
      const mother = add(K_BEAR, R_MOTHER, mx, mz, sized(K_BEAR, false), 0, 0x7a4a2a);
      mother.yaw = Math.atan2(-nx, -nz);
      mother.hx = mx + nx * 3;
      mother.hz = mz + nz * 3;
      mother.hr = 6;
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
        const p = nearOk(mx + nx * (3 + k) + tx * (k ? 2.5 : -2.5), mz + nz * (3 + k) + tz * (k ? 2.5 : -2.5), 3, landOk(g, 0.5), r) ?? { x: mx + nx * 3, z: mz + nz * 3 };
        const cub = add(K_BEAR, R_CUB, p.x, p.z, sized(K_BEAR, true), 0, k ? 0x6a3e22 : 0x845232);
        cub.hx = mx + nx * 3.5;
        cub.hz = mz + nz * 3.5;
        cub.hr = 5;
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
    const nT = low ? 1 : 3;
    const done: { x: number; z: number }[] = [];
    for (const pts of TRAIL_POINTS) {
      for (let i = 1; i + 1 < pts.length && done.length < nT; i += 2) {
        const [px, pz] = pts[i];
        const nearWater = Math.hypot(px - POND.x, pz - POND.z) < 45 || fieldAt(f.stream, px, pz) < 25;
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
        const a = add(K_TURTLE, R_NONE, A.x + (B.x - A.x) * 0.3, A.z + (B.z - A.z) * 0.3, sized(K_TURTLE, false), V_TURTLE, 0x6b8a3a);
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

  // leashes for the homebodies: home range, plus room to reach the hiding places and the second tree / far side
  for (const a of agents) {
    if (a.cls !== C_NONE || a.kind === K_KOALA || a.kind === K_CHICKEN) continue;
    let l = a.hr * 2 + 14;
    l = Math.max(l, Math.hypot(a.cx - a.hx, a.cz - a.hz) + 8);
    if (a.kind === K_RABBIT || a.kind === K_SQUIRREL || a.kind === K_TURTLE || a.kind === K_FOX) l = Math.max(l, Math.hypot(a.ax - a.hx, a.az - a.hz) + 8);
    if (a.kind === K_TURTLE) l = Math.max(l, Math.hypot(a.bx - a.hx, a.bz - a.hz) + 8);
    a.leash = l;
  }
  // slots: instance index inside each mesh (in plan order)
  const counts = new Array(MESHES).fill(0);
  agents.forEach((a, i) => {
    a.slot = counts[a.mesh]++;
    a.id = i;
  });
  const shores = new Float32Array(shoreList);
  return { agents, paddock, farm, den, burrows, holes, rocks, shores, trees, graph, routes: new Int16Array(agents.length * RMAX), sites, counts };
}
