// Where kids FIND things to ride in Cucaino Park (no more summoning from a button): bikes at little
// racks by the plaza and the lands, buggies in small car parks beside the trails, unicorns
// grazing in the meadows, Cloud Dragons beside the trails (the Dragon Roost by the plaza, gentle
// hills, the Candy Harbour beach, and one on a floating mountain), manta rays over the reef gardens
// (and one more comes gliding up to any kid diving in deep water), and boats and submarines moored at the harbours
// (lib/park/registry/harbours). Dolphins and whales aren't placed — they come up to swim with you
// when you're out at sea (lib/park/world/rideables).
//
// Pure data + maths, deterministic. Every spot is searched for once at load: open, level ground
// next to (never on) a trail, clear of every building and its door, off the stream, the Dream Park
// grid and the Sky Coaster track. Tested in rideables.test.ts.
import type { DragonBreed, MountKind } from "../characters/mounts";
import { LANDS, PLACES, SKY_LOOP_N, SPAWN, skyLoopXZ } from "./places";
import { HILLS, POND, STREAM_POINTS, STREAM_WIDTH, TRAIL_POINTS, TRAIL_WIDTH, coastR, seaDist } from "./island";
import { WATER_Y, groundY, slopeAt } from "./terrain";
import { zoneBounds } from "../builder/rules";
import { SKY_ISLANDS, SKY_OBSTACLES, SKY_PADS, SKY_SPOTS, skyBaseY, skyWalkable } from "./skyIslands";
import { GARDENS, FOOTPRINTS, atSea, midWater, type GardenKind } from "../world/underwater/plan";
import { seaFloorY } from "../world/sea/wander";
import { DOCKS, MOORINGS, harbourKeepOut, mooredY } from "./harbours";
import { DINO_JEEPS } from "./dinoIsland";
import { STATIONS, nearRail, railAt } from "./railway";
import { waterSdf } from "./waterways";
import { underCanopy, thicketAt } from "./jungle";

export interface RideableSpot {
  id: string;
  kind: MountKind;
  x: number;
  z: number;
  /** heading (radians about +Y; forward = (sin yaw, cos yaw)) */
  yaw: number;
  /** world height (always set here: ground / sky-island top without its bob / mid-water) */
  y?: number;
  /** stands on this floating mountain (add skyBob(sky, t) to y) */
  sky?: string;
  /** unicorns: how far they wander from home while grazing (m) */
  wander?: number;
  /** boats / subs: the dock they're moored at */
  dock?: string;
  /** keep-clear radius for other placers (m; default RIDEABLE_CLEAR[kind]) */
  clear?: number;
  /** dragons: the breed (each has its own look and temper) */
  breed?: DragonBreed;
  /** dragons: lounging at the Roost (naps / hovers about there; never wanders off) */
  lounge?: boolean;
}

type P2 = [number, number];

// ── the rules for "open ground" ──
const zb = zoneBounds();
const trailPts: P2[] = TRAIL_POINTS.flat();
const skyTrack: P2[] = Array.from({ length: SKY_LOOP_N * 6 }, (_, i) => {
  const a = skyLoopXZ(Math.floor(i / 6));
  const b = skyLoopXZ((Math.floor(i / 6) + 1) % SKY_LOOP_N);
  const u = (i % 6) / 6;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
});

/** distance from (x, z) to the nearest trail sample, and that trail's heading there */
export function trailInfo(x: number, z: number): { d: number; heading: number } {
  let bd = Infinity;
  let heading = 0;
  for (const pts of TRAIL_POINTS)
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i][0] - x) ** 2 + (pts[i][1] - z) ** 2;
      if (d < bd) {
        bd = d;
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        heading = Math.atan2(b[0] - a[0], b[1] - a[1]);
      }
    }
  return { d: Math.sqrt(bd), heading };
}

/** how far (x, z) is from every building's footprint / door circle (negative = inside) */
export function placeClearance(x: number, z: number): number {
  let c = Infinity;
  for (const p of PLACES) {
    if (p.sky) continue;
    c = Math.min(c, Math.hypot(x - p.x, z - p.z) - Math.max(p.radius, p.doorRadius));
  }
  return c;
}

/**
 * Is (x, z) open, level ground on the island where a parked ride (footprint radius `pad`) can sit
 * without blocking anything? (`trailMin` = keep this far from a trail's centre line.)
 */
export function openGround(x: number, z: number, pad: number, trailMin = TRAIL_WIDTH / 2 + 1): boolean {
  const r = Math.hypot(x, z);
  if (seaDist(x, z) > -8) return false; // on the grass, not the beach
  if (r < 13 + pad) return false; // the plaza's paving + fountain
  if (groundY(x, z) < WATER_Y + 0.6) return false;
  // (nothing's parked under the rainforest's canopy, nor anywhere near its thicket)
  if (underCanopy(x, z) || thicketAt(x, z) || underCanopy(x + pad, z) || underCanopy(x - pad, z) || underCanopy(x, z + pad) || underCanopy(x, z - pad)) return false;
  if (slopeAt(x, z) > 0.22 || slopeAt(x + pad * 0.7, z) > 0.3 || slopeAt(x, z + pad * 0.7) > 0.3) return false;
  if (placeClearance(x, z) < pad + 2.5) return false; // well clear of doors
  if (x > zb.minX - pad - 2 && x < zb.maxX + pad + 2 && z > zb.minZ - pad - 2 && z < zb.maxZ + pad + 2) return false;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + pad + 2) return false;
  const sp = (STREAM_WIDTH / 2 + pad + 1.5) ** 2;
  for (const p of STREAM_POINTS) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < sp) return false;
  const tp = (trailMin + pad * 0.6) ** 2;
  for (const p of trailPts) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < tp) return false;
  const kp = (6 + pad) ** 2;
  for (const p of skyTrack) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < kp) return false;
  return true;
}

const taken: { x: number; z: number; r: number }[] = [];
const clearOfOthers = (x: number, z: number, r: number) => taken.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r);

/**
 * The nearest open spot to an anchor, `near` metres off a trail (so it's easy to find), parked
 * along the trail's heading.
 */
function trailside(ax: number, az: number, pad: number, near: [number, number], maxR = 26): { x: number; z: number; yaw: number } {
  for (let ring = 0; ring <= maxR; ring += 1) {
    const n = Math.max(1, Math.round(ring * 2.5));
    let best: { x: number; z: number; yaw: number; s: number } | null = null;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + ring * 0.37;
      const x = ax + Math.sin(a) * ring;
      const z = az + Math.cos(a) * ring;
      const ti = trailInfo(x, z);
      if (ti.d < near[0] || ti.d > near[1]) continue;
      if (!openGround(x, z, pad) || !clearOfOthers(x, z, pad)) continue;
      const s = Math.abs(ti.d - (near[0] + near[1]) / 2);
      if (!best || s < best.s) best = { x, z, yaw: ti.heading, s };
    }
    if (best) return best;
  }
  throw new Error(`rideables: no open trailside spot near ${ax},${az}`);
}

const landOf = (id: string) => LANDS.find((l) => l.id === id)!;
/** a point from a land's centre towards the plaza, `k` x its radius out */
function landEdge(id: string, k = 1.25, turn = 0): P2 {
  const l = landOf(id);
  const a = Math.atan2(-l.x, -l.z) + turn;
  return [l.x + Math.sin(a) * l.radius * k, l.z + Math.cos(a) * l.radius * k];
}

const spots: RideableSpot[] = [];
const add = (s: RideableSpot, r: number) => {
  spots.push(s);
  taken.push({ x: s.x, z: s.z, r });
};

// ── bikes: a rack of two on the plaza's edge, then one by each of five lands ──
{
  const a = Math.PI / 4 + 0.2 + Math.PI / 2; // along the plaza-1 trail
  const p = trailside(Math.sin(a) * 17, Math.cos(a) * 17, 0.9, [2.6, 4.2]);
  add({ id: "bike-plaza-1", kind: "bike", x: p.x, z: p.z, yaw: p.yaw, y: groundY(p.x, p.z) }, 0.7);
  // its rack-mate, side by side
  const sx = p.x + Math.cos(p.yaw) * 1.4;
  const sz = p.z - Math.sin(p.yaw) * 1.4;
  const q = openGround(sx, sz, 0.9) && clearOfOthers(sx, sz, 0.7) ? { x: sx, z: sz, yaw: p.yaw } : trailside(sx, sz, 0.9, [2.6, 4.6]);
  add({ id: "bike-plaza-2", kind: "bike", x: q.x, z: q.z, yaw: q.yaw, y: groundY(q.x, q.z) }, 0.9);
  const b = -Math.PI / 4 + 0.2 - Math.PI / 2; // along the plaza-3 trail
  const r = trailside(Math.sin(b) * 18, Math.cos(b) * 18, 0.9, [2.6, 4.2]);
  add({ id: "bike-plaza-3", kind: "bike", x: r.x, z: r.z, yaw: r.yaw, y: groundY(r.x, r.z) }, 0.9);
}
for (const land of ["pets", "market", "friends", "forest", "books"] as const) {
  const [ax, az] = landEdge(land, land === "forest" ? 1.05 : 1.3);
  const p = trailside(ax, az, 0.9, [2.6, 4.4]);
  add({ id: `bike-${land}`, kind: "bike", x: p.x, z: p.z, yaw: p.yaw, y: groundY(p.x, p.z) }, 1);
}

// ── buggies: four little car parks beside the trails ──
for (const [land, k, turn] of [["gate", 2.6, 0.9], ["rides", 1.45, 0.5], ["dream", 1.5, -0.5], ["golf", 1.45, 0.4]] as const) {
  const [ax, az] = landEdge(land, k, turn);
  const p = trailside(ax, az, 2, [4, 6.5], 30);
  add({ id: `car-${land}`, kind: "car", x: p.x, z: p.z, yaw: p.yaw, y: groundY(p.x, p.z) }, 2.6);
}
// ── the safari jeeps: two buggies parked by the trail at Dino Isle's plaza (registry/dinoIsland) ──
for (const j of DINO_JEEPS) add({ id: j.id, kind: "car", x: j.x, z: j.z, yaw: j.yaw, y: j.y }, 2.6);

// ── the Wildlands' jeeps: two waiting behind every station out there (off the train, drive off) ──
for (const st of STATIONS.slice(1)) {
  const p = railAt(st.s);
  // (behind the platform, away from the track, parked side by side facing along it)
  const bx = st.x + p.dz * 9;
  const bz = st.z - p.dx * 9;
  const yaw = Math.atan2(p.dx, p.dz);
  let made = 0;
  for (const along of [-6, 6, -12, 12, 0]) {
    if (made >= 2) break;
    const x = bx + p.dx * along;
    const z = bz + p.dz * along;
    const y = groundY(x, z);
    const sl = Math.hypot(groundY(x + 2, z) - groundY(x - 2, z), groundY(x, z + 2) - groundY(x, z - 2)) / 4;
    if (y < WATER_Y + 0.5 || sl > 0.18 || nearRail(x, z, 2) || waterSdf(x, z) < 6) continue;
    add({ id: `jeep-${st.id}-${made}`, kind: "car", x, z, yaw, y }, 2.6);
    made++;
  }
}

// ── unicorns: grazing in the open meadows (well away from trails) ──
{
  const homes: [string, P2][] = [
    // (the meadows by Pet Meadow are rainforest now, and the south meadow is Rainbow Lake: the
    // unicorns graze on the open ground north of Pet Meadow and east of the lake instead)
    ["pets-a", [-120, -58]],
    ["pets-b", [-88, -50]],
    ["meadow-west", [-34, 32]],
    ["meadow-south", [48, 118]],
    ["meadow-east", [112, 8]],
  ];
  for (const [name, [ax, az]] of homes) {
    let found: P2 | null = null;
    for (let ring = 0; ring <= 30 && !found; ring += 1) {
      const n = Math.max(1, Math.round(ring * 2.5));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + ring * 0.61;
        const x = ax + Math.sin(a) * ring;
        const z = az + Math.cos(a) * ring;
        if (openGround(x, z, 3.5, 6) && clearOfOthers(x, z, 5) && !HILLS.some((h) => Math.hypot(h.x - x, h.z - z) < h.r + 1)) {
          found = [x, z];
          break;
        }
      }
    }
    if (!found) throw new Error(`rideables: no meadow for unicorn ${name}`);
    const [x, z] = found;
    add({ id: `unicorn-${name}`, kind: "unicorn", x, z, yaw: Math.atan2(-x, -z) + 0.6, y: groundY(x, z), wander: 4 }, 5);
  }
}

// ── Cloud Dragons: where kids actually walk ──
// A Dragon Roost (perch + sign) beside a trail just off the plaza, two more on gentle hills a short
// stroll off the trails, one on the sand at Candy Harbour (for kids out at sea) and one on the
// Buttercup Meadow floating mountain. Never on cliff tops: every land dragon stands on open, gentle
// ground that a kid can walk up to from the nearest trail (see strollable()).

/** open ground a parked dragon needs round its middle (m) */
export const DRAGON_PAD = 6;
/** the Dragon Roost's perch: a low round stone the dragon stands on (m proud of the grass) */
export const ROOST_LIFT = 0.06;
/** the Dragon Roost's yard (m) */
export const ROOST_R = 9.5;
/** keep-clear round the Roost's middle for trees and props: the whole yard and its boulder ring */
export const ROOST_CLEAR = ROOST_R + 2;

/** the nearest trail sample to (x, z) */
function nearestTrailPt(x: number, z: number): P2 {
  let best: P2 = trailPts[0];
  let bd = Infinity;
  for (const p of trailPts) {
    const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
    if (d < bd) ((bd = d), (best = p));
  }
  return best;
}

/**
 * Can a kid stroll from the nearest trail (or from `from`) to (x, z)? Dry, gentle ground all the
 * way, never through a building, the stream or the pond.
 */
export function strollable(x: number, z: number, maxSlope = 0.3, from?: P2): boolean {
  const [px, pz] = from ?? nearestTrailPt(x, z);
  const L = Math.hypot(x - px, z - pz);
  const n = Math.max(2, Math.ceil(L / 1.2));
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const sx = px + (x - px) * u;
    const sz = pz + (z - pz) * u;
    if (groundY(sx, sz) < WATER_Y + 0.4) return false;
    if (slopeAt(sx, sz) > maxSlope) return false;
    if (placeClearance(sx, sz) < 0.5) return false;
    if (Math.hypot(sx - POND.x, sz - POND.z) < POND.r + 0.5) return false;
    for (const p of STREAM_POINTS) if ((p[0] - sx) ** 2 + (p[1] - sz) ** 2 < (STREAM_WIDTH / 2 + 0.3) ** 2) return false;
  }
  return true;
}

/** gentle under the dragon's whole body (no ledge under a leg or the tail) */
function level(x: number, z: number, r: number, maxSlope = 0.24, maxStep = 1.1): boolean {
  const y0 = groundY(x, z);
  if (slopeAt(x, z) > maxSlope) return false;
  for (let a = 0; a < 8; a++)
    for (const k of [0.5, 1]) {
      const sx = x + Math.sin(a * 0.785) * r * k;
      const sz = z + Math.cos(a * 0.785) * r * k;
      if (slopeAt(sx, sz) > maxSlope + 0.06 || Math.abs(groundY(sx, sz) - y0) > maxStep * k) return false;
    }
  return true;
}

/** a dragon parked side-on to the trail (its whole silhouette shows), head towards `face` */
function sideOn(x: number, z: number, face: P2): number {
  const h = trailInfo(x, z).heading;
  const fx = face[0] - x;
  const fz = face[1] - z;
  return Math.sin(h) * fx + Math.cos(h) * fz >= 0 ? h : h + Math.PI;
}

/** open, level, strollable ground `near` m off a trail, nearest the anchor */
function dragonGround(ax: number, az: number, near: [number, number], maxR: number, ok: (x: number, z: number) => boolean = () => true): { x: number; z: number } | null {
  for (let ring = 0; ring <= maxR; ring += 1.5) {
    const n = Math.max(1, Math.round(ring * 2));
    let best: { x: number; z: number; s: number } | null = null;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + ring * 0.29;
      const x = ax + Math.sin(a) * ring;
      const z = az + Math.cos(a) * ring;
      const ti = trailInfo(x, z);
      if (ti.d < near[0] || ti.d > near[1]) continue;
      if (!openGround(x, z, DRAGON_PAD, near[0] - DRAGON_PAD * 0.6) || !clearOfOthers(x, z, 13)) continue;
      if (!level(x, z, DRAGON_PAD) || !strollable(x, z) || !ok(x, z)) continue;
      const s = Math.abs(ti.d - (near[0] + near[1]) / 2);
      if (!best || s < best.s) best = { x, z, s };
    }
    if (best) return best;
  }
  return null;
}

/** the Dragon Roost by the plaza: a little dragon academy (perches, a fish trough, a banner) */
export interface DragonRoost {
  id: string;
  /** the yard's middle (the Roostwarden stands here) */
  x: number;
  z: number;
  y: number;
  /** the yard's radius (m) */
  r: number;
  /** the sign post, between the yard and the trail */
  sign: { x: number; z: number; y: number };
  /** unit vector from the middle towards the trail (the open side), and along it */
  u: { x: number; z: number };
  f: { x: number; z: number };
}
let roost: DragonRoost | null = null;
/** where the Roost's loungers lie, as (u, f) from the yard's middle (u: toward the trail) */
export const ROOST_LOUNGE = { puffwing: [-5.4, -1.5], zippit: [4.6, -3.5] } as const;

{
  // 1. the Dragon Roost: the open ground nearest where kids start, a few steps off a plaza trail
  const r = dragonGround(SPAWN.x, SPAWN.z, [8, 13], 45, (x, z) => Math.hypot(x, z) > 22);
  if (!r) throw new Error("rideables: no open ground for the Dragon Roost");
  const y = groundY(r.x, r.z) + ROOST_LIFT;
  // (the keep-clear covers the whole yard and its boulder ring: no tree grows inside it)
  const yaw0 = sideOn(r.x, r.z, [0, 0]);
  add({ id: "dragon-roost", kind: "dragon", breed: "roostwarden", x: r.x, z: r.z, yaw: yaw0, y, clear: ROOST_CLEAR }, 14);
  const [tx, tz] = nearestTrailPt(r.x, r.z);
  const d = Math.hypot(r.x - tx, r.z - tz) || 1;
  const sx = tx + ((r.x - tx) / d) * (TRAIL_WIDTH / 2 + 1.4);
  const sz = tz + ((r.z - tz) / d) * (TRAIL_WIDTH / 2 + 1.4);
  const u = { x: (tx - r.x) / d, z: (tz - r.z) / d };
  const f = { x: -u.z, z: u.x };
  roost = { id: "dragon-roost", x: r.x, z: r.z, y, r: ROOST_R, sign: { x: sx, z: sz, y: groundY(sx, sz) }, u, f };
  // two dragons lounging in the yard, side by side with the Roostwarden (who lies along the yard's
  // long axis, f): a Puffwing napping on the warm rocks at the back, a Zippit flitting about at the
  // front. Spaced so their whole bodies (true size) stay clear of each other and of the perches,
  // trough and banner (lib/park/world/rideables keeps them apart as they move about too).
  const lounge = (id: string, breed: DragonBreed, du: number, df: number, yaw: number) => {
    const x = r.x + u.x * du + f.x * df;
    const z = r.z + u.z * du + f.z * df;
    add({ id, kind: "dragon", breed, x, z, yaw, y: groundY(x, z), lounge: true, clear: 0 }, 5);
  };
  lounge("dragon-roost-puffwing", "puffwing", ROOST_LOUNGE.puffwing[0], ROOST_LOUNGE.puffwing[1], Math.atan2(f.x, f.z));
  lounge("dragon-roost-zippit", "zippit", ROOST_LOUNGE.zippit[0], ROOST_LOUNGE.zippit[1], Math.atan2(u.x, u.z) - 0.6);

  // 2. two more: on gentle grassy hills (or open meadows) a short stroll off the trails, spread
  // round the island (far from each other and from the Roost) so there's always one not far away
  const cands: { x: number; z: number; hill: boolean }[] = [];
  for (const h of HILLS) {
    if (trailInfo(h.x, h.z).d > 26 || Math.hypot(h.x, h.z) < 30) continue;
    const p = dragonGround(h.x, h.z, [7, 20], Math.min(10, h.r));
    if (p) cands.push({ ...p, hill: true });
  }
  for (const l of LANDS) {
    if (l.id === "gate" || l.id === "dream") continue;
    const [ax, az] = landEdge(l.id, 1.6);
    const p = dragonGround(ax, az, [8, 18], 30);
    if (p) cands.push({ ...p, hill: false });
  }
  let n = 0;
  while (n < 2) {
    const dragons = spots.filter((s) => s.kind === "dragon");
    let pick: { x: number; z: number; s: number } | null = null;
    for (const c of cands) {
      const far = Math.min(...dragons.map((d) => Math.hypot(d.x - c.x, d.z - c.z)));
      if (far < 60 || !clearOfOthers(c.x, c.z, 13)) continue;
      // spread out, prefer a hilltop, and not too far out from the middle
      const sc = Math.min(far, 140) + (c.hill ? 15 : 0) - Math.max(0, Math.hypot(c.x, c.z) - 110);
      if (!pick || sc > pick.s) pick = { x: c.x, z: c.z, s: sc };
    }
    if (!pick) break;
    add({ id: `dragon-hill-${n + 1}`, kind: "dragon", breed: n === 0 ? "skyfin" : "sparkspike", x: pick.x, z: pick.z, yaw: sideOn(pick.x, pick.z, [0, 0]), y: groundY(pick.x, pick.z) }, 14);
    n++;
  }
  if (n < 2) throw new Error("rideables: not enough reachable hills for dragons");

  // 3. on the sand at Candy Harbour, beside the jetty (swim or sail in, walk up the beach, fly off)
  const dock = DOCKS.find((q) => q.id === "candy-harbour");
  if (dock) {
    const a0 = Math.atan2(dock.x, dock.z);
    // where the jetty meets dry sand
    let rb = coastR(a0);
    while (rb > 100 && groundY(Math.sin(a0) * rb, Math.cos(a0) * rb) < WATER_Y + 0.45) rb -= 0.5;
    const ramp: P2 = [Math.sin(a0) * rb, Math.cos(a0) * rb];
    let best: { x: number; z: number; s: number } | null = null;
    for (let da = -0.16; da <= 0.16; da += 0.01)
      for (let dr = -36; dr <= 0; dr += 1) {
        const a = a0 + da;
        const rr = coastR(a) + dr;
        const x = Math.sin(a) * rr;
        const z = Math.cos(a) * rr;
        if (groundY(x, z) < WATER_Y + 0.3 || !level(x, z, DRAGON_PAD * 0.8, 0.26, 1.3)) continue;
        if (harbourKeepOut(x, z, DRAGON_PAD) || placeClearance(x, z) < DRAGON_PAD + 2.5 || !clearOfOthers(x, z, 13)) continue;
        if (trailInfo(x, z).d < DRAGON_PAD * 0.6 + 2) continue;
        if (!strollable(x, z, 0.32, ramp)) continue;
        // on the sand near the ramp, a little way along the beach from it
        const s = Math.abs(Math.abs(da) * rr - 13) + Math.abs(dr + 16) * 0.3;
        if (!best || s < best.s) best = { x, z, s };
      }
    if (best) add({ id: "dragon-harbour", kind: "dragon", breed: "puffwing", x: best.x, z: best.z, yaw: Math.atan2(best.x, best.z) + Math.PI / 2, y: groundY(best.x, best.z) }, 14);
  }

  // 4. the floating meadow nearest the Park Gate
  const isl = SKY_ISLANDS.find((s) => s.id === "buttercup-meadow") ?? SKY_ISLANDS.find((s) => s.kind === "meadow")!;
  let best: { x: number; z: number; s: number } | null = null;
  for (let rr = 2; rr <= isl.r; rr += 0.5)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = isl.landing.x + Math.sin(a) * rr;
      const z = isl.landing.z + Math.cos(a) * rr;
      if (!skyWalkable(isl, x, z)) continue;
      // keep the landing spot (Star Shards) and the treasure free; room round the dragon
      if (Math.hypot(x - isl.landing.x, z - isl.landing.z) < 4 || Math.hypot(x - isl.treasure.x, z - isl.treasure.z) < 3.5) continue;
      if (Math.hypot(x - isl.x, z - isl.z) > isl.r - 2.5) continue;
      if (SKY_PADS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 3)) continue;
      if (SKY_SPOTS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 2)) continue;
      if (SKY_OBSTACLES.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 2)) continue;
      const s = Math.abs(rr - 5);
      if (!best || s < best.s) best = { x, z, s };
    }
  if (!best) throw new Error("rideables: no room for the sky dragon");
  add({ id: "dragon-sky", kind: "dragon", breed: "zippit", x: best.x, z: best.z, yaw: Math.atan2(best.x - isl.x, best.z - isl.z), y: skyBaseY(isl, best.x, best.z), sky: isl.id }, 3);
}

/** the Dragon Roost by the plaza (its perch and sign are drawn by lib/park/world/rideables) */
export const DRAGON_ROOST: DragonRoost = roost!;

// ── mantas: waiting in mid-water over the four reef gardens (two at the Rainbow Reef) ──
{
  const plan: [GardenKind, number][] = [
    ["rainbow", -0.04],
    ["rainbow", 0.05],
    ["wreck", -0.09],
    ["glow", 0.07],
    ["ruins", 0.08],
  ];
  plan.forEach(([kind, turn], i) => {
    const g = GARDENS.find((q) => q.kind === kind)!;
    // round the reef a little from the garden's heart, out on the shelf where the water is
    // deep enough to glide in (5-12 m), clear of the wreck / temple
    let pick: { x: number; z: number; s: number } | null = null;
    for (let da = 0; da <= 0.06 && !pick; da += 0.01)
      for (const sgn of [1, -1])
        for (let d = 22; d <= 40; d += 1) {
          const p = atSea(g.a + turn + da * sgn, d);
          const depth = waterDepthAt(p.x, p.z);
          if (depth < 5 || depth > 12) continue;
          if (FOOTPRINTS.some((f) => Math.hypot(p.x - f.x, p.z - f.z) < f.r + 3)) continue;
          if (!clearOfOthers(p.x, p.z, 3)) continue;
          const s = Math.abs(depth - 7);
          if (!pick || s < pick.s) pick = { x: p.x, z: p.z, s };
        }
    if (!pick) throw new Error(`rideables: no water for manta at ${kind}`);
    const y = midWater(pick.x, pick.z, 0.45, 2.2);
    add({ id: `manta-${kind}-${i}`, kind: "manta", x: pick.x, z: pick.z, yaw: g.a + Math.PI / 2, y }, 4);
  });
}

// ── boats and subs: moored at the docks ──
for (const m of MOORINGS) add({ id: m.id, kind: m.kind, x: m.x, z: m.z, yaw: m.yaw, y: mooredY(m.kind), dock: m.dock }, 0);

export const RIDEABLE_SPOTS: RideableSpot[] = spots;

/** clearing radius kept round each parked ride (m) (the true-size dragon wants a big bald summit) */
export const RIDEABLE_CLEAR: Partial<Record<MountKind, number>> = { bike: 2.2, car: 3.6, unicorn: 8, dragon: 11 };
const AT_SEA = new Set<MountKind>(["manta", "pedalo", "sailboat", "speedboat", "ship", "sub", "deepsub"]);

/**
 * For other placers (the storybook forest, props, sheep): true = keep clear, so every parked ride
 * stands in its own little clearing (the island is mostly dense forest) — add it to buildPark's
 * `free()` predicates. Unicorns get a glade to graze in, hilltop dragons a bald summit.
 */
export function rideableKeepOut(x: number, z: number, pad: number): boolean {
  if (harbourKeepOut(x, z, pad)) return true;
  for (const s of RIDEABLE_SPOTS) {
    if (s.sky || AT_SEA.has(s.kind)) continue;
    const r = s.clear ?? RIDEABLE_CLEAR[s.kind] ?? 3;
    if (r <= 0) continue;
    if ((s.x - x) ** 2 + (s.z - z) ** 2 < (r + pad) ** 2) return true;
  }
  return false;
}

/** is (x, z) deep enough for a ride that swims (m of water)? */
export function waterDepthAt(x: number, z: number): number {
  return WATER_Y - seaFloorY(x, z);
}
