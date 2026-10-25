// Where the Wildlands' wildlife lives: deterministic, seeded per square of land (same square, same
// herd, every time), worked out the first time a square comes near the kid (like
// lib/park/world/fantasy/wilds.ts does for trees). Pure maths, no three.js — tested without a
// renderer.
import { WILD_FROM } from "../fantasy/wilds";
import { seaDist } from "../../registry/island";
import { groundYFar } from "../../registry/terrain";
import { nearRail, stationAt } from "../../registry/railway";
import { inSettlement } from "../../registry/settlements";
import { savannaK } from "../../registry/habitats";
import { WILD_LAKE, wildLakeRadius, wildRainforestK, wildWaterSdf } from "../../registry/wildWater";
import { WS_DEER, WS_DUCK, WS_ELEPHANT, WS_EAGLE, WS_GIRAFFE, WS_GOAT, WS_KANGAROO, WS_PARROT, WS_ZEBRA, WS_ANTELOPE, WILD_SPECIES_DEFS, type WAnimal, type WHerd, rnd01, xorshift } from "./types";

/** a square of the Wildlands given over to grazing herds (bigger than the trees' square: herds want room to wander) */
export const HERD_CELL = 200;
/** the rainforest canopy's square (the same grid the trees use, so a flock's perch sits where the canopy actually is) */
export const BIRD_CELL = 64;

// who lives where (registry/habitats.ts): the green country has deer and kangaroos; the Savanna
// has the safari — zebras, antelope, giraffes and elephants — and a good deal more of it
const PLAINS = [WS_DEER, WS_KANGAROO];
const PLAINS_W = [0.55, 0.45];
const SAFARI = [WS_ZEBRA, WS_ANTELOPE, WS_GIRAFFE, WS_ELEPHANT];

function pickWeighted(r: () => number, ids: number[], w: number[]): number {
  let t = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ids.length; i++) {
    t -= w[i];
    if (t <= 0) return ids[i];
  }
  return ids[ids.length - 1];
}

function slopeAt(x: number, z: number): number {
  const e = 2.5;
  const dx = groundYFar(x + e, z) - groundYFar(x - e, z);
  const dz = groundYFar(x, z + e) - groundYFar(x, z - e);
  return Math.min(1, Math.hypot(dx, dz) / (2 * e) / 1.4);
}

/** a point on dry land toward the lake from (x, z), just short of the water — or null if the lake
 *  is too far for a herd based here to bother walking to it */
function findShore(x: number, z: number): { x: number; z: number } | null {
  const dx = WILD_LAKE.x - x;
  const dz = WILD_LAKE.z - z;
  const d0 = Math.hypot(dx, dz);
  if (d0 < 1 || d0 - wildLakeRadius(Math.atan2(dx, dz)) > 150) return null;
  const ux = dx / d0;
  const uz = dz / d0;
  let px = x;
  let pz = z;
  for (let s = 4; s < 420; s += 4) {
    const nx = x + ux * s;
    const nz = z + uz * s;
    if (wildWaterSdf(nx, nz) < 3) return { x: px, z: pz };
    px = nx;
    pz = nz;
  }
  return null;
}

function makeHerd(id: number, species: number, hx: number, hz: number, seed: number): WHerd {
  const def = WILD_SPECIES_DEFS[species];
  let s = seed >>> 0 || 1;
  const r = () => {
    s = xorshift(s);
    return rnd01(s);
  };
  const n = def.herdN[0] + Math.floor(r() * (def.herdN[1] - def.herdN[0] + 1));
  const hr = def.wander[0] + r() * (def.wander[1] - def.wander[0]);
  const shore = def.biome === "plains" ? findShore(hx, hz) : null;
  const members: WAnimal[] = [];
  // (the giants stand further apart: a giraffe swings a long neck down to graze, an elephant's
  // ears and trunk want room — a tight pack of them would overlap badly)
  const spacing = def.giant ? 3.2 : 1.8;
  // (a real herd: scattered loosely over a patch of ground, not standing in a ring — a sunflower
  //  spiral with a little jitter keeps everyone a body or two apart; every fourth one on the
  //  ground is a youngster, a good deal smaller)
  const landHerd = def.biome === "plains" || def.biome === "ridge";
  const R = Math.max(def.body * spacing, def.body * spacing * Math.sqrt(n) * 0.85);
  for (let i = 0; i < n; i++) {
    const a = landHerd ? i * 2.39996 + r() * 0.5 : (i / n) * Math.PI * 2 + r() * 0.4;
    const k = landHerd ? Math.sqrt((i + 0.5) / n) * (0.9 + r() * 0.2) : 1;
    const young = landHerd && i % 4 === 3;
    members.push({
      species,
      scale: def.scale * (1 - def.spread + r() * def.spread * 2) * (young ? 0.58 + r() * 0.12 : 1),
      coat: def.coats[Math.floor(r() * def.coats.length)],
      ox: i === 0 ? 0 : Math.sin(a) * R * k,
      oz: i === 0 ? R * 1.2 : Math.cos(a) * R * (landHerd ? 1 : 0.7) * k,
      x: hx,
      z: hz,
      y: 0,
      yaw: r() * Math.PI * 2,
      phase: r() * 10,
      stride: 0.08,
      headYaw: 0,
      headPitch: 0,
      ear: 0,
      tail: 0,
      tailLift: 0,
      wing: 0,
      tuck: 0,
      bound: 0,
      rs: Math.floor(r() * 1e9) + 1,
      live: false,
    });
  }
  return {
    id,
    species,
    hx,
    hz,
    hr,
    shoreX: shore?.x ?? null,
    shoreZ: shore?.z ?? null,
    cx: hx,
    cz: hz,
    tx: hx,
    tz: hz,
    heading: r() * Math.PI * 2,
    state: 0,
    timer: 2 + r() * 20,
    members,
    rs: Math.floor(r() * 1e9) + 1,
  };
}

/** every herd (0 or 1) whose home falls in the land square (ci, cj) — deterministic */
export function herdCell(ci: number, cj: number): WHerd[] {
  const seed = ((ci * 92821) ^ (cj * 689287) ^ 0x9e3779b9) >>> 0;
  let s = seed || 1;
  const r = () => {
    s = xorshift(s);
    return rnd01(s);
  };
  const cx = ci * HERD_CELL + (0.2 + r() * 0.6) * HERD_CELL;
  const cz = cj * HERD_CELL + (0.2 + r() * 0.6) * HERD_CELL;
  // the Savanna: several herds to a square, the kinds taking turns so zebras, antelope, giraffes
  // and elephants graze side by side
  {
    const out: WHerd[] = [];
    const first = Math.abs(ci * 3 + cj * 5) % SAFARI.length;
    for (let k = 0; k < 7; k++) {
      const x = ci * HERD_CELL + (0.08 + r() * 0.84) * HERD_CELL;
      const z = cj * HERD_CELL + (0.08 + r() * 0.84) * HERD_CELL;
      if (savannaK(x, z) < 0.5) continue;
      if (seaDist(x, z) > -16 || wildWaterSdf(x, z) < 22 || nearRail(x, z, 18) || stationAt(x, z, 24) || inSettlement(x, z, 30)) continue;
      const h = groundYFar(x, z);
      if (h < 1 || slopeAt(x, z) > 0.35) continue;
      if (out.some((o) => Math.hypot(o.hx - x, o.hz - z) < 48)) continue;
      const species = SAFARI[(first + out.length) % SAFARI.length];
      out.push(makeHerd(ci * 100003 + cj + (k + 1) * 5000011, species, x, z, seed ^ (0x51ed270b + k * 7919)));
    }
    if (out.length || savannaK(cx, cz) > 0.5) return out;
  }
  if (Math.hypot(cx, cz) < WILD_FROM + 24) return [];
  if (seaDist(cx, cz) > -16) return [];
  if (wildWaterSdf(cx, cz) < 22) return [];
  if (nearRail(cx, cz, 18) || stationAt(cx, cz, 24)) return [];
  if (inSettlement(cx, cz, 30)) return [];
  if (wildRainforestK(cx, cz) > 0.15) return [];
  const h = groundYFar(cx, cz);
  if (h < 1 || h > 70) return [];
  const slope = slopeAt(cx, cz);
  let species: number;
  if (slope > 0.42 && slope < 0.95 && h > 10 && h < 58) {
    species = WS_GOAT;
  } else if (slope < 0.35 && h < 55) {
    species = pickWeighted(r, PLAINS, PLAINS_W);
  } else {
    return [];
  }
  // (sparse: most squares that could hold a herd don't)
  if (r() > 0.5) return [];
  return [makeHerd(ci * 100003 + cj, species, cx, cz, seed ^ 0x51ed270b)];
}

/** parrot flocks perched in the rainforest canopy, one square (the trees') at a time */
export function birdCell(ci: number, cj: number): WHerd[] {
  const x0 = ci * BIRD_CELL;
  const z0 = cj * BIRD_CELL;
  const cx = x0 + BIRD_CELL / 2;
  const cz = z0 + BIRD_CELL / 2;
  if (wildRainforestK(cx, cz) < 0.4) return [];
  const seed = ((ci * 56478913) ^ (cj * 19573) ^ 0x2545f491) >>> 0;
  let s = seed || 1;
  const r = () => {
    s = xorshift(s);
    return rnd01(s);
  };
  if (r() > 0.5) return [];
  const px = cx + (r() - 0.5) * BIRD_CELL * 0.6;
  const pz = cz + (r() - 0.5) * BIRD_CELL * 0.6;
  const herd = makeHerd(ci * 100003 + cj + 777000, WS_PARROT, px, pz, seed ^ 0x6d2b79f5);
  herd.hr = 9 + r() * 7;
  return [herd];
}

/** the two eagles' soaring anchors along the Great Ridge (fixed: there are only a couple of them) */
export function eagleAnchors(): WHerd[] {
  const pts: [number, number][] = [
    [480, -640],
    [1180, -1230],
  ];
  return pts.map(([x, z], i) => {
    const herd = makeHerd(90000 + i, WS_EAGLE, x, z, 0xc0ffee ^ (i * 7919));
    herd.hr = 95 + i * 10;
    return herd;
  });
}

/** the ducks' rafts on the Great Lake's sandy shallows (fixed: the lake doesn't move) */
export function duckRafts(): WHerd[] {
  const out: WHerd[] = [];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.3;
    const rr = wildLakeRadius(a) * 0.82;
    const x = WILD_LAKE.x + Math.sin(a) * rr;
    const z = WILD_LAKE.z + Math.cos(a) * rr;
    if (((i * 2654435761) >>> 0) % 5 === 0) continue; // (not every bay has a raft)
    const herd = makeHerd(80000 + i, WS_DUCK, x, z, (i * 2654435761) >>> 0);
    out.push(herd);
  }
  return out;
}
