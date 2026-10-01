// Where kids FIND things to ride in Cucaino Park (no more summoning from a button): bikes at little
// racks by the plaza and the lands, buggies in small car parks beside the trails, unicorns
// grazing in the meadows, Cloud Dragons perched on hilltops (and one on a floating mountain), and
// manta rays waiting over the reef gardens, and boats and submarines moored at the harbours
// (lib/park/registry/harbours). Dolphins and whales aren't placed — they come up to swim with you
// when you're out at sea (lib/park/world/rideables).
//
// Pure data + maths, deterministic. Every spot is searched for once at load: open, level ground
// next to (never on) a trail, clear of every building and its door, off the stream, the Dream Park
// grid and the Sky Coaster track. Tested in rideables.test.ts.
import type { MountKind } from "../characters/mounts";
import { LANDS, PLACES, SKY_LOOP_N, skyLoopXZ } from "./places";
import { HILLS, POND, STREAM_POINTS, STREAM_WIDTH, TRAIL_POINTS, TRAIL_WIDTH, coastR } from "./island";
import { WATER_Y, groundY, slopeAt } from "./terrain";
import { zoneBounds } from "../builder/rules";
import { SKY_ISLANDS, SKY_OBSTACLES, SKY_PADS, SKY_SPOTS, skyBaseY, skyWalkable } from "./skyIslands";
import { GARDENS, FOOTPRINTS, atSea, midWater, type GardenKind } from "../world/underwater/plan";
import { seaFloorY } from "../world/sea/wander";
import { MOORINGS, harbourKeepOut, mooredY } from "./harbours";

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
  if (r > coastR(Math.atan2(x, z)) - 8) return false; // on the grass, not the beach
  if (r < 13 + pad) return false; // the plaza's paving + fountain
  if (groundY(x, z) < WATER_Y + 0.6) return false;
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

// ── unicorns: grazing in the open meadows (well away from trails) ──
{
  const homes: [string, P2][] = [
    ["pets-a", [-74, 42]],
    ["pets-b", [-100, 34]],
    ["meadow-west", [-34, 32]],
    ["meadow-south", [26, 100]],
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

// ── Cloud Dragons: perched on the three highest level hilltops + one floating mountain ──
{
  const cands: { x: number; z: number; y: number }[] = [];
  for (let x = -148; x <= 148; x += 4)
    for (let z = -148; z <= 148; z += 4) {
      const y = groundY(x, z);
      if (y < 5) continue;
      let top = true;
      for (let dx = -8; dx <= 8 && top; dx += 4) for (let dz = -8; dz <= 8; dz += 4) if ((dx || dz) && groundY(x + dx, z + dz) > y) top = false;
      if (top) cands.push({ x, z, y });
    }
  cands.sort((a, b) => b.y - a.y);
  let n = 0;
  for (const c of cands) {
    if (n >= 3) break;
    // settle onto the exact local top
    let { x, z } = c;
    for (let it = 0; it < 12; it++) {
      let bx = x;
      let bz = z;
      let by = groundY(x, z);
      for (let a = 0; a < 8; a++) {
        const tx = x + Math.sin(a * 0.785) * 1;
        const tz = z + Math.cos(a * 0.785) * 1;
        const ty = groundY(tx, tz);
        if (ty > by) ((by = ty), (bx = tx), (bz = tz));
      }
      x = bx;
      z = bz;
    }
    if (slopeAt(x, z) > 0.35 || placeClearance(x, z) < 8 || trailInfo(x, z).d < 4 || !clearOfOthers(x, z, 30)) continue;
    add({ id: `dragon-hill-${n + 1}`, kind: "dragon", x, z, yaw: Math.atan2(x, z), y: groundY(x, z) }, 30);
    n++;
  }
  if (n < 3) throw new Error("rideables: not enough hilltops for dragons");
  // the floating meadow nearest the Park Gate
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
  add({ id: "dragon-sky", kind: "dragon", x: best.x, z: best.z, yaw: Math.atan2(best.x - isl.x, best.z - isl.z), y: skyBaseY(isl, best.x, best.z), sky: isl.id }, 3);
}

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
export const RIDEABLE_CLEAR: Partial<Record<MountKind, number>> = { bike: 2.2, car: 3.6, unicorn: 8, dragon: 9 };
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
    const r = RIDEABLE_CLEAR[s.kind] ?? 3;
    if ((s.x - x) ** 2 + (s.z - z) ** 2 < (r + pad) ** 2) return true;
  }
  return false;
}

/** is (x, z) deep enough for a ride that swims (m of water)? */
export function waterDepthAt(x: number, z: number): number {
  return WATER_Y - seaFloorY(x, z);
}
