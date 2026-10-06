// The Grand Canyon (Arizona, USA): an immense, winding gorge cut into a high, gently-rolling
// plateau in the Wildlands' far north-west (registry/landform.ts's UPLANDS, well beyond the Great
// Ridge from everything else — see findGrandCanyonSite below). Carved with layered rock bands (red,
// orange, cream, purple-brown), stepped terraces, a few standing buttes and two short side canyons,
// down to a little river at the bottom. The river doesn't join the island's other water systems —
// it's its own thing, a spring-to-sinkhole curiosity, so this stays a pure, self-contained height
// field + a couple of small decorations (lib/park/world/grandCanyonDecor.ts), no plumbing into
// registry/waterways.ts or wildWater.ts.
//
// Pure maths, deterministic, no three.js — registry/terrain.ts's finish() calls grandCanyonGroundY()
// exactly like it calls wildGorgeWallY()/wildShelfY(); world/fantasy/terrainMesh.ts's groundColor()
// calls canyonStrataT()/canyonFootprintWeight() for the strata-banded local palette;
// world/fantasy/{mask,wilds}.ts keep grass and the Wildlands' ordinary trees off its footprint.
import { footprintStats, rawHeight, ridgeAt, LONE_PEAK, EVEREST_PEAK } from "./landform";
import { nearRail, STATIONS } from "./railway";
import { wildWaterSdf, WILD_WATER_BOUNDS, inWildWater } from "./wildWater";
import { nearestOnPolyline, smooth, smoothstep, type P2 } from "./geom2d";
import { seaDist } from "./island";

/** registry/kartTrack.ts's own KART_SITE and registry/everestBaseCamp.ts's own BASE_CAMP_SITE,
 *  copied (not imported: kartTrack.ts pulls in registry/cartRoad.ts, and everestBaseCamp.ts pulls
 *  in registry/settlements.ts — both read SETTLEMENTS at their own module scope, or import a
 *  sibling settlement generator that does, so importing either here would be circular once
 *  settlements.ts's own Canyon Rim Outpost imports this file back — the same reason places.ts
 *  copies KART_SITE instead of importing it). kartTrack.test.ts / everestBaseCamp.ts are the
 *  single source of truth for the real numbers; grandCanyon.test.ts checks these stay in sync. */
const KART_SITE = { x: 279.2, z: -95.4 };
const BASE_CAMP_SITE = { x: 1566.6, z: -1111.7 };

const TAU = Math.PI * 2;

/** a deterministic search for the canyon's own centre: a big, genuinely gentle stretch of the
 *  high north-western uplands (registry/landform.ts's UPLANDS, ~(380,-1500)) — far beyond the
 *  Great Ridge from the railway, the cart road, Cucaino Karts, Everest Base Camp and Everest/the
 *  Lone Peak themselves, with the WHOLE canyon's footprint (checked as a 350-unit-radius disc, half
 *  the canyon's own ~660-unit length) sitting on real, gentle, unlevelled ground
 *  (registry/landform.ts's rawHeight/footprintStats) before any of this file's own raising or
 *  carving touches it. (Deliberately does NOT import registry/settlements.ts's SETTLEMENTS, nor
 *  registry/cartRoad.ts — both would be circular once settlements.ts's own Canyon Rim Outpost
 *  imports this file back (cartRoad.ts itself reads SETTLEMENTS at its own module scope), the same
 *  reason registry/town.ts never imports SETTLEMENTS either. Every settlement and the whole cart
 *  road already sit hundreds of units south of the Great Ridge, on its own side entirely —
 *  grandCanyon.test.ts checks the real distances directly, and this search's own result is
 *  unchanged whether or not they're in the avoid list, since the ridge itself is already the
 *  binding constraint here — verified by re-running the search with them included.) */
export function findGrandCanyonSite(): { x: number; z: number } {
  const UPLANDS = { x: 380, z: -1500 };
  const avoid: { x: number; z: number; r: number }[] = [
    { x: BASE_CAMP_SITE.x, z: BASE_CAMP_SITE.z, r: 450 },
    { x: EVEREST_PEAK.x, z: EVEREST_PEAK.z, r: EVEREST_PEAK.r + 300 },
    { x: LONE_PEAK.x, z: LONE_PEAK.z, r: LONE_PEAK.r + 250 },
    { x: KART_SITE.x, z: KART_SITE.z, r: 300 },
    ...STATIONS.map((s) => ({ x: s.x, z: s.z, r: 200 })),
  ];
  const clearOfWildWater = (x: number, z: number, margin: number) => {
    if (x > WILD_WATER_BOUNDS.x0 - margin && x < WILD_WATER_BOUNDS.x1 + margin && z > WILD_WATER_BOUNDS.z0 - margin && z < WILD_WATER_BOUNDS.z1 + margin) return wildWaterSdf(x, z) > margin;
    return true;
  };
  let best: { x: number; z: number; score: number } | null = null;
  for (let a = 0; a < TAU; a += 0.025) {
    for (let rad = 0; rad <= 420; rad += 10) {
      const x = UPLANDS.x + Math.sin(a) * rad;
      const z = UPLANDS.z + Math.cos(a) * rad;
      if (avoid.some((s) => Math.hypot(x - s.x, z - s.z) < s.r)) continue;
      if (nearRail(x, z, 220)) continue;
      if (!clearOfWildWater(x, z, 150)) continue;
      if (ridgeAt(x, z).d < 350) continue;
      const h = rawHeight(x, z);
      if (h < 10 || h > 55) continue;
      const stats = footprintStats(x, z, 350, 20);
      if (stats.maxSlope > 0.5 || stats.relief > 30) continue;
      const score = -rad * 0.05 - Math.abs(h - 28) * 0.3 - stats.relief * 0.4;
      if (!best || score > best.score) best = { x, z, score };
    }
  }
  if (!best) throw new Error("grandCanyon: no site found in the high uplands");
  return { x: Math.round(best.x * 10) / 10, z: Math.round(best.z * 10) / 10 };
}

/** Frozen as a stored number (TOWN_SITE's own pattern — see grandCanyon.test.ts's "the site stays
 *  frozen"): re-running findGrandCanyonSite() at module load would re-score every candidate against
 *  whatever registry/landform.ts's terrain looks like right now, so a LATER terrain change could
 *  silently move the whole canyon. Captured once from the live search above. */
/** Is the Grand Canyon built into the world? OFF for now: the gorge's interior and the Mule Trail
 *  view aren't good enough to ship yet (see the project notes). While it is off, every hook the rest
 *  of the app calls (nearGrandCanyon, grandCanyonGroundY, the footprint weights, the decks, the
 *  footpath, the outpost settlement, the wonder entry, the decor) reports "nothing here", so the
 *  north-west uplands stay exactly as they were. Flip to true to bring the whole wonder back. */
export const CANYON_OPEN: boolean = true;

export const CANYON_SITE = { x: 388.7, z: -1495.0 };
/** the canyon's own long axis runs due north-south through CANYON_SITE (so "along" = ±z, "lateral"
 *  = ±x) — a free authoring choice (not searched), since every candidate in the verified disc works */
const DIRX = 0;
const DIRZ = 1;
const SIDEX = 1;
const SIDEZ = 0;
/** half the canyon's own length (660 units end to end — the rim pinches to nothing past this) */
export const CANYON_HALF_LEN = 330;
/** how far the plateau's own raise (see plateauRaise) and the strata palette reach, for anything
 *  that wants one cheap "near the canyon at all" box test before doing real work */
export const CANYON_REACH = 520;

/** a point `along` the axis (± CANYON_HALF_LEN, 0 at CANYON_SITE) and `lateral` to the side of it,
 *  in the canyon's own FIXED frame (ignoring the real axis's own gentle wander — exact for anything
 *  authored directly, like the buttes, the trailhead and the viewpoints; the real wandering
 *  centreline the carve itself uses is axisAt() below) */
export function alongToWorld(along: number, lateral: number): { x: number; z: number } {
  return { x: CANYON_SITE.x + DIRX * along + SIDEX * lateral, z: CANYON_SITE.z + DIRZ * along + SIDEZ * lateral };
}

/** the real centreline's own sideways wander at `along` (a meander, so the canyon winds rather
 *  than running dead straight — like a real river canyon) */
function axisWander(along: number): number {
  return 14 * Math.sin(along / 140 + 0.6) + 8 * Math.sin(along / 55 - 1.1);
}
/** the canyon's own rim-to-rim half width at `along` (before the ends pinch shut) */
function rawHalfWidth(along: number): number {
  return 74 + 9 * Math.sin(along / 130 + 1.1) + 4 * Math.sin(along / 50 - 0.4);
}
/** 1 inside the canyon's own length, easing to 0 past CANYON_HALF_LEN (both the rim width and the
 *  depth taper out together, so the canyon pinches shut at both ends instead of stopping dead) */
function endTaper(along: number): number {
  return 1 - smoothstep(CANYON_HALF_LEN - 70, CANYON_HALF_LEN, Math.abs(along));
}
/** the canyon's own half width at `along`, tapered at the ends */
export function canyonHalfWidthAt(along: number): number {
  return Math.max(0.5, rawHalfWidth(along) * endTaper(along));
}
/** how deep the MAIN canyon's own river channel is cut below its rim at `along`, tapered at the ends
 *  — kept consistently deep (a small swing, not a wide one) so EVERY viewpoint along the canyon's
 *  own length (the trailhead, the Watchtower, the Skywalk, the river itself) reads as a genuine
 *  look-down-into-it gorge, not just one lucky spot */
export function canyonMaxDepthAt(along: number): number {
  // the river's bed falls gently and steadily from the south end to the north (water never runs
  // uphill), and the depth is simply the rim's reference height above it
  const bed = 18.5 - along * 0.017;
  return Math.max(55, rimRefAt(along) - bed) * endTaper(along);
}
/** the plateau's own broad raise over the natural ground (registry/landform.ts's rawHeight already
 *  gives a gentle ~22-41 there; this is the extra lift that makes it read as a real high tableland,
 *  the real Colorado Plateau's own character, with room to carve a canyon genuinely 50-90 deep
 *  without its floor ever digging below the surrounding Wildlands) */
export function canyonPlateauRaise(x: number, z: number): number {
  const d = Math.hypot(x - CANYON_SITE.x, z - CANYON_SITE.z);
  const R = 480;
  return 68 * (1 - smoothstep(R * 0.55, R, d));
}

// ── the real, wandering centreline: sampled once at module load (cheap — a few hundred sine
// evaluations), so a height lookup just walks this short array instead of re-deriving the wander
// every time (the same "frozen samples, O(n) nearest-point" approach registry/everestRoute.ts and
// registry/geom2d.ts's nearestOnPolyline use for routes this short) ──
interface AxisSample {
  x: number;
  z: number;
  along: number;
  /** the tangent's own sideways normal (unit), for turning an (x, z) into a SIGNED lateral offset */
  nx: number;
  nz: number;
}
const AXIS_START = -CANYON_HALF_LEN - 40;
const AXIS_STEP = 4;
const AXIS: AxisSample[] = (() => {
  const step = AXIS_STEP;
  const pts: { along: number; x: number; z: number }[] = [];
  for (let a = AXIS_START; a <= CANYON_HALF_LEN + 40; a += step) {
    const w = axisWander(a);
    const p = alongToWorld(a, w);
    pts.push({ along: a, x: p.x, z: p.z });
  }
  const out: AxisSample[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[Math.min(pts.length - 1, i + 1)];
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const l = Math.hypot(dx, dz) || 1;
    out.push({ x: pts[i].x, z: pts[i].z, along: pts[i].along, nx: dz / l, nz: -dx / l });
  }
  return out;
})();
const _axisHit = { along: 0, lateral: 0, d: 0 };
/** the nearest point on the real (wandering) centreline to (x, z): its `along` fraction, the
 *  SIGNED lateral offset off it (+ on the SIDEX/SIDEZ side), and the unsigned distance */
function axisNearest(x: number, z: number): typeof _axisHit {
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < AXIS.length; i++) {
    const d = (AXIS[i].x - x) ** 2 + (AXIS[i].z - z) ** 2;
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  const s = AXIS[bi];
  const dx = x - s.x;
  const dz = z - s.z;
  _axisHit.along = s.along;
  _axisHit.d = Math.sqrt(best);
  _axisHit.lateral = dx * s.nx + dz * s.nz;
  return _axisHit;
}
/** the real (wandering) centreline's own point + sideways normal at `along` (interpolated between
 *  AXIS's own samples) — for placing anything that should sit AT a given depth/width fraction on
 *  the real carve (the rim landmarks, the mule trail), so it lands exactly where grandCanyonGroundY
 *  will actually carve it, instead of drifting off by the centreline's own wander (axisWander) */
function axisAt(along: number): { x: number; z: number; nx: number; nz: number } {
  const f = (along - AXIS_START) / AXIS_STEP;
  const i = Math.max(0, Math.min(AXIS.length - 2, Math.floor(f)));
  const t = Math.max(0, Math.min(1, f - i));
  const a = AXIS[i];
  const b = AXIS[i + 1];
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, nx: a.nx + (b.nx - a.nx) * t, nz: a.nz + (b.nz - a.nz) * t };
}
/** The rim's own REFERENCE height at each axis sample: the plateau's height averaged across the
 *  gorge and smoothed along it. Everything inside the gorge (floor, benches, cliffs, the trail)
 *  hangs off this one smooth number, so a bench is level from wall to wall and the river lies flat
 *  — the plateau's own bumps stay up on the plateau. Built on first use. */
let _rimRef: Float64Array | null = null;
function rimRefAt(along: number): number {
  if (!_rimRef) {
    const raw = new Float64Array(AXIS.length);
    for (let i = 0; i < AXIS.length; i++) {
      const a = AXIS[i];
      let sum = 0;
      let n = 0;
      for (const lat of [-90, -60, -30, 0, 30, 60, 90]) {
        const x = a.x + a.nx * lat;
        const z = a.z + a.nz * lat;
        sum += rawHeight(x, z) + canyonPlateauRaise(x, z);
        n++;
      }
      raw[i] = sum / n;
    }
    const out = new Float64Array(AXIS.length);
    const K = 10; // +-40 units along
    for (let i = 0; i < AXIS.length; i++) {
      let sum = 0;
      let n = 0;
      for (let k = -K; k <= K; k++) {
        const j = Math.max(0, Math.min(AXIS.length - 1, i + k));
        sum += raw[j];
        n++;
      }
      out[i] = sum / n;
    }
    _rimRef = out;
  }
  const f = (along - AXIS_START) / AXIS_STEP;
  const i = Math.max(0, Math.min(AXIS.length - 2, Math.floor(f)));
  const t = Math.max(0, Math.min(1, f - i));
  return _rimRef[i] + (_rimRef[i + 1] - _rimRef[i]) * t;
}
/** the rim height to hang the gorge off at a point `u` half-widths from the axis: the level
 *  reference inside, easing out to the plateau's real height where the modelled surface meets the
 *  island's own ground (u -> CANYON_SUNK_EDGE) */
function gorgeRim(along: number, u: number, naturalRim: number): number {
  const k = smoothstep(0.9, 1.26, u);
  return rimRefAt(along) + (naturalRim - rimRefAt(along)) * k;
}
/** the rim height the gorge hangs off at world (x, z) (see gorgeRim) */
export function canyonRimY(x: number, z: number): number {
  const hit = axisNearest(x, z);
  const u = Math.abs(hit.lateral) / canyonHalfWidthAt(hit.along);
  return gorgeRim(hit.along, u, rawHeight(x, z) + canyonPlateauRaise(x, z));
}

/** a point at `along` the real centreline, `uFrac` of the half-width to one `side` (+1/-1) of it —
 *  the frame every rim landmark and the mule trail are placed in */
function onCanyon(along: number, uFrac: number, side = 1): { x: number; z: number } {
  const ax = axisAt(along);
  const off = side * uFrac * canyonHalfWidthAt(along);
  return { x: ax.x + ax.nx * off, z: ax.z + ax.nz * off };
}
/** a point at `along` the real centreline, `uFrac` of the half-width to one `side` (+1/-1) of it —
 *  for anything that needs to trace the real cross-section itself (world/grandCanyonDecor.ts's
 *  cliff-wall decor, which re-draws the terraces as proper geometry + crisp per-fragment banded
 *  colour, since the shared height-field terrain mesh is too coarse to hold a sharp band on a
 *  near-vertical cliff without the vertex colours themselves smearing diagonally across a triangle) */
export function canyonProfilePoint(along: number, side: 1 | -1, uFrac: number): { x: number; z: number } {
  return onCanyon(along, uFrac, side);
}
/** a point ON the real wandering centreline itself (lateral 0) at `along` — for drawing the river
 *  (world/grandCanyonDecor.ts): the true bottom of the channel, not the fixed-frame approximation */
export function canyonAxisPointAt(along: number): { x: number; z: number } {
  return onCanyon(along, 0);
}
/** the river channel's own half width at `along` (the innermost, always-flooded step of
 *  canyonTerraceFrac's staircase, u in [0, 0.1]) — widened in round 6 (0.1 -> 0.15) so the river
 *  reads as a real, visible ribbon from the rim viewpoints instead of a thin thread easily lost at
 *  distance; still comfortably inside the crisp channel floor's own flat run. */
export function canyonChannelHalfWidthAt(along: number): number {
  return canyonHalfWidthAt(along) * 0.2;
}

/** the cross-section's own stepped terraces, 0 (the rim) .. 1 (the river channel's own floor) — a
 *  staircase of flat shelves (the real canyon's Esplanade and Tonto Platform, kid-simplified to
 *  two) and the cliffs between them, each a smoothstep so nothing has a razor edge. `u` = how far
 *  across the half-width (0 centre .. ~1 rim). */
export function canyonTerraceFrac(u: number): number {
  // flat floor | cliff | Tonto Platform | cliff | the Esplanade | cliff | rim. The cliffs are a few
  // units wide (near-vertical); the benches are truly flat. world/grandCanyonDecor.ts models this
  // exact surface (buildCanyonSurface) and canyonWalkY() below makes it the ground underfoot.
  const steps: [number, number, number, number][] = [
    [0, 0.3, 1, 1],
    [0.3, 0.35, 1, 0.62],
    [0.35, 0.55, 0.62, 0.62],
    [0.55, 0.6, 0.62, 0.35],
    [0.6, 0.82, 0.35, 0.35],
    [0.82, 0.87, 0.35, 0],
  ];
  if (u <= 0) return 1;
  for (const [u0, u1, from, to] of steps) if (u <= u1) return from + (to - from) * smoothstep(u0, u1, u);
  return 0;
}
/** where the three cliffs are, as [foot, top] in u — for the decor's own vertex layout */
export const CANYON_CLIFFS: [number, number][] = [
  [0.3, 0.35],
  [0.55, 0.6],
  [0.82, 0.87],
];
/** What the island's HEIGHT FIELD does inside the canyon: a plain, gently sloped trough that lies
 *  BELOW the crisp surface above everywhere (a few units under the floor and benches, sloping up to
 *  meet the plateau at u = CANYON_SUNK_EDGE). It is never seen and never walked on — the modelled
 *  gorge (world/grandCanyonDecor.ts) covers it completely and canyonWalkY() is the ground — so its
 *  only job is to stay out of the way: the streamed terrain can't hold a near-vertical cliff without
 *  sliver triangles, and now it never has to. */
export const CANYON_SUNK_EDGE = 1.3;
export function canyonTerraceFracSoft(u: number): number {
  const knots: [number, number][] = [
    [0, 1.05],
    [0.35, 1.05],
    [0.6, 0.7],
    [0.87, 0.44],
    [CANYON_SUNK_EDGE, 0],
  ];
  if (u <= 0) return knots[0][1];
  for (let i = 0; i + 1 < knots.length; i++) {
    const [u0, f0] = knots[i];
    const [u1, f1] = knots[i + 1];
    if (u <= u1) return f0 + ((f1 - f0) * (u - u0)) / (u1 - u0);
  }
  return 0;
}

// ── two short side canyons, branching off the main one near its own rim (the real Grand Canyon's
// own tributary canyons) — each its own small, straight, un-wandering cut, so the maths stays
// simple: its own local along'/lateral' frame, its own (smaller) width + depth, tapered at both
// ends exactly like the main canyon (rule 3's "lazy, bucketed" cheapness here is the early
// bounding-box reject below; two branches is little enough work that no further bucketing earns
// its keep) ──
export interface SideCanyon {
  /** the branch's own mouth, in the MAIN canyon's fixed (along, lateral) frame */
  mouthAlong: number;
  mouthLateral: number;
  /** the branch's own heading (radians, same atan2(dx,dz) convention as the main axis) */
  heading: number;
  length: number;
  halfWidth: number;
  depthScale: number;
}
// (none for now: the main gorge is one clean modelled surface; a branch would need its own)
const SIDE_CANYONS: SideCanyon[] = [];
/** read-only access to the two side-canyon definitions, for world/grandCanyonDecor.ts's own side-
 *  canyon wall meshes (it needs the mouth/heading/length/halfWidth to lay out its own sample grid —
 *  the actual HEIGHT at any point it samples still always comes from canyonVisualFloorY, never from
 *  reimplementing the carve here, so a decor-side taper approximation can never desync the shape) */
export const CANYON_SIDE_CANYONS: readonly SideCanyon[] = SIDE_CANYONS;
/** the side canyon's own carved fraction (0 rim .. 1 its own floor) at world (x, z), or null well
 *  outside its own short run */
function sideCanyonFrac(sc: SideCanyon, x: number, z: number): number | null {
  const mouth = alongToWorld(sc.mouthAlong, sc.mouthLateral);
  const dx = Math.sin(sc.heading);
  const dz = Math.cos(sc.heading);
  const sx = Math.cos(sc.heading);
  const sz = -Math.sin(sc.heading);
  const rx = x - mouth.x;
  const rz = z - mouth.z;
  const along = rx * dx + rz * dz;
  const lateral = rx * sx + rz * sz;
  if (along < -20 || along > sc.length) return null;
  const taper = 1 - smoothstep(sc.length - 40, sc.length, Math.max(0, along)) * (along > 0 ? 1 : 0);
  const mouthTaper = smoothstep(-20, 10, along);
  const hw = Math.max(0.5, sc.halfWidth * taper);
  const u = Math.abs(lateral) / hw;
  if (u > 1.4) return null;
  return canyonTerraceFracSoft(u) * sc.depthScale * mouthTaper;
}
/** the same side-canyon cut, but from the CRISP profile — world/grandCanyonDecor.ts's side-canyon
 *  wall meshes are built from this (see canyonVisualFloorY) */
function sideCanyonFracVisual(sc: SideCanyon, x: number, z: number): number | null {
  const mouth = alongToWorld(sc.mouthAlong, sc.mouthLateral);
  const dx = Math.sin(sc.heading);
  const dz = Math.cos(sc.heading);
  const sx = Math.cos(sc.heading);
  const sz = -Math.sin(sc.heading);
  const rx = x - mouth.x;
  const rz = z - mouth.z;
  const along = rx * dx + rz * dz;
  const lateral = rx * sx + rz * sz;
  if (along < -20 || along > sc.length) return null;
  const taper = 1 - smoothstep(sc.length - 40, sc.length, Math.max(0, along)) * (along > 0 ? 1 : 0);
  const mouthTaper = smoothstep(-20, 10, along);
  const hw = Math.max(0.5, sc.halfWidth * taper);
  const u = Math.abs(lateral) / hw;
  if (u > 1.4) return null;
  return canyonTerraceFrac(u) * sc.depthScale * mouthTaper;
}

// ── three standing buttes inside the main trough (mesa remnants the river never quite carved
// away — the real canyon's Zoroaster Temple-style towers), each protecting a little disc of the
// rim's own height from the carve entirely at its centre, easing back to the ordinary carved
// depth over its own radius ──
interface Butte {
  along: number;
  lateral: number;
  r: number;
  /** 1 = the butte's own crown reaches the rim; a bit less for a lower standing hill */
  heightFrac: number;
}
// (each butte's own `lateral` + `r` is kept well clear of the river channel itself — u < ~0.13 of
// the half-width there — so a butte never pokes its protection into the channel and leaves a
// sudden cliff-sized step in the river's own bed; grandCanyon.test.ts's "the river ... well below
// the rim" sweep is what would catch a regression here. The third butte's own lateral moved in
// round 8 — 46 -> 55 — after the terrace profile was re-shaped for the river-visibility fix: 46
// put it right on top of the second cliff's own steep transition there (u~0.57, dead centre of a
// near-vertical step), which — combined with that same spot sitting inside the second side
// canyon's own reach — made the crisp, butte-aware floor read BELOW the plain soft floor by over
// 30 units (the opposite of "stands proud of it"). 55 sits it cleanly on the new upper shelf
// instead, same as the other two buttes already were.)
export const CANYON_BUTTES: Butte[] = [
  { along: -35, lateral: 46, r: 15, heightFrac: 0.92 },
  { along: 55, lateral: -50, r: 14, heightFrac: 0.8 },
  { along: 172, lateral: 55, r: 18, heightFrac: 1 },
];
function butteProtectAt(x: number, z: number): number {
  let best = 0;
  for (const b of CANYON_BUTTES) {
    const ax = axisAt(b.along);
    const p = { x: ax.x + ax.nx * b.lateral, z: ax.z + ax.nz * b.lateral };
    const d = Math.hypot(x - p.x, z - p.z);
    const k = (1 - smoothstep(b.r, b.r + 12, d)) * b.heightFrac;
    if (k > best) best = k;
  }
  return best;
}

/** cheap "anywhere near the canyon at all" box test — every placer (wilds.ts, mask.ts) and the
 *  terrain carve itself gate on this first. CANYON_REACH's own circle round CANYON_SITE reaches far
 *  enough to cross the coast in one direction (the site sits inland but not dead-centre of the
 *  Wildlands) — out past the coast this must stay false, or grandCanyonGroundY's full-replacement
 *  write (registry/terrain.ts's finish()) quietly raises the open sea floor into the beach shallows
 *  (caught by lib/park/world/underwater/underwater.test.ts: a "follow" jelly's own default spot,
 *  deep at sea, sat inside this circle before this guard). */
export function nearGrandCanyon(x: number, z: number, pad = 0): boolean {
  if (!CANYON_OPEN) return false;
  if (seaDist(x, z) > 0) return false;
  return Math.hypot(x - CANYON_SITE.x, z - CANYON_SITE.z) < CANYON_REACH + pad;
}

/** The ground the terrain should have here because of the Grand Canyon (null = leave it alone,
 *  including everywhere outside CANYON_REACH): the plateau's own raise, carved down by the main
 *  canyon and its two side canyons (whichever cuts deepest wins), with the buttes protecting their
 *  own little discs from the carve. registry/terrain.ts's finish() uses this exactly the way it
 *  uses wildGorgeWallY()/wildShelfY() — a full replacement of the sample, not a min()/max() (there's
 *  no other feature out here to combine with: the Great Ridge's own foothills are hundreds of units
 *  away — see findGrandCanyonSite's clearance). */
export function grandCanyonGroundY(x: number, z: number, naturalH: number): number | null {
  if (!nearGrandCanyon(x, z)) return null;
  const hit = axisNearest(x, z);
  const hw = canyonHalfWidthAt(hit.along);
  const uMain = Math.abs(hit.lateral) / hw;
  const rim = uMain < CANYON_SUNK_EDGE && Math.abs(hit.along) <= CANYON_HALF_LEN + 40 ? gorgeRim(hit.along, uMain, naturalH + canyonPlateauRaise(x, z)) : naturalH + canyonPlateauRaise(x, z);
  const frac = uMain <= 1.6 ? canyonTerraceFracSoft(uMain) : 0;
  const depth = canyonMaxDepthAt(hit.along);
  // (…and always a few units under the modelled surface, even where the gorge pinches out)
  let floor = rim - depth * frac - 3.5 * smoothstep(0, 0.12, frac);
  for (const sc of SIDE_CANYONS) {
    const scFrac = sideCanyonFrac(sc, x, z);
    if (scFrac === null || scFrac <= 0) continue;
    const scFloor = rim - depth * scFrac;
    if (scFloor < floor) floor = scFloor;
  }
  // NOTE: buttes are NOT baked into the height field at all any more — a bump here, however smooth,
  // still has to climb from the carved floor back up to near-rim height over a short radius, and on
  // the streamed terrain's fixed grid that is exactly the kind of steep, hard-to-grid-align slope
  // that bakes into dark sliver triangles wherever the decor mesh doesn't sit flush on top. Buttes
  // are now pure decor: world/grandCanyonDecor.ts builds each one as a standalone stacked-mesa mesh
  // (positioned/sized from CANYON_BUTTES, based at canyonVisualFloorY) sitting on this plain carved
  // floor, the same way the cliff walls stand on it rather than being part of it.
  return floor;
}

/** the crisp cross-section ALONE — the stepped terraces and the side canyons, with NO butte bump
 *  at all. This is what world/grandCanyonDecor.ts's cliff walls (and side-canyon walls) actually
 *  loft themselves from (round 7): they represent the terrace steps only, sampled at a handful of
 *  u's clustered tightly round the three real cliff transitions (~0.07-0.1, ~0.4-0.44, ~0.68-0.73)
 *  — nowhere near fine enough to resolve the ADDITIONAL, separately-located bump a butte's own
 *  protected disc used to add on top (butteProtectAt's own reach extends well outside those three
 *  bands, e.g. u~0.2-0.35 near a butte sitting on the lower shelf), so a wall built from the
 *  butte-inclusive canyonVisualFloorY grew a sudden, under-sampled 20-30 unit step exactly where a
 *  butte happened to sit near the main cross-section — "fluting" that read as hard scribbled
 *  lines, and a patch of wall standing proud of the real terrain at the wrong height for its own
 *  position. Buttes are their own standalone decor mesas now (buildButteMesas) with their own
 *  proper, densely-sampled geometry; the wall doesn't need to (and must not) also hug them. */
export function canyonTerraceFloorY(x: number, z: number, naturalH: number): number | null {
  const floor = canyonMainTerraceFloorY(x, z, naturalH);
  if (floor === null) return null;
  const rim = naturalH + canyonPlateauRaise(x, z);
  const depth = canyonMaxDepthAt(axisNearest(x, z).along);
  let best = floor;
  for (const sc of SIDE_CANYONS) {
    const scFrac = sideCanyonFracVisual(sc, x, z);
    if (scFrac === null || scFrac <= 0) continue;
    const scFloor = rim - depth * scFrac;
    if (scFloor < best) best = scFloor;
  }
  return best;
}

/** the MAIN cross-section's own crisp terrace alone — no side canyons blended in at all. The main
 *  cliff wall (buildCliffWalls) uses this directly rather than canyonTerraceFloorY: a side canyon's
 *  own mouth-taper (sideCanyonFracVisual's own smoothstep, spanning its own along' -20..10) is a
 *  second, separately-located transition the main wall's fixed U-sampling — tuned for the three
 *  real terrace cliffs only — was never dense enough to resolve either, which read exactly like the
 *  butte issue above (an under-sampled, jagged step) wherever a side canyon's mouth happened to
 *  sit near the main wall's own cross-section (the first branch's mouth is only 20 units from the
 *  Watchtower). Side canyons get their own dedicated, properly-sampled wall (buildSideCanyonWalls);
 *  the main wall only ever needs to represent the main gorge's own terraces. */
export function canyonMainTerraceFloorY(x: number, z: number, naturalH: number): number | null {
  if (!nearGrandCanyon(x, z)) return null;
  const rim = naturalH + canyonPlateauRaise(x, z);
  const hit = axisNearest(x, z);
  const hw = canyonHalfWidthAt(hit.along);
  const uMain = Math.abs(hit.lateral) / hw;
  const frac = uMain <= 1.6 ? canyonTerraceFrac(uMain) : 0;
  const depth = canyonMaxDepthAt(hit.along);
  return rim - depth * frac;
}

/** canyonTerraceFloorY PLUS the buttes' own protected discs — the exact visual floor every piece
 *  of hand-built decor OTHER than the cliff/side walls measures itself against (the butte mesas'
 *  own base height, scattered props, mule-route/viewpoint placement). The walls use
 *  canyonTerraceFloorY directly instead — see its own docstring for why. */
export function canyonVisualFloorY(x: number, z: number, naturalH: number): number | null {
  const floor = canyonTerraceFloorY(x, z, naturalH);
  if (floor === null) return null;
  const rim = naturalH + canyonPlateauRaise(x, z);
  const hit = axisNearest(x, z);
  const hw = canyonHalfWidthAt(hit.along);
  const uMain = Math.abs(hit.lateral) / hw;
  // a butte never protects the river channel itself (u < 0.32ish — round 8's own wider channel, see
  // canyonTerraceFrac) — the water always wins there, so nothing can leave a sudden cliff-sized
  // step in the river's own bed (a safety clamp on top of CANYON_BUTTES' own placement well clear
  // of the channel)
  const protect = uMain < 0.32 ? 0 : butteProtectAt(x, z);
  return protect > 0 ? floor + (rim - floor) * protect : floor;
}

// ── the strata palette's own driver: a pure, framework-free numeric function so it's unit
// tested on its own (grandCanyon.test.ts) — world/fantasy/terrainMesh.ts's groundColor() AND
// world/grandCanyonDecor.ts's cliff-wall shader both turn CANYON_BAND_STOPS into actual colour,
// weighted by canyonFootprintWeight so the palette blends out to the island's ordinary colours at
// the edge. The real Grand Canyon's own layers, oldest (bottom) to youngest (top), each a genuinely
// distinct rock: Vishnu Basement Rocks (dark, ~1.8 billion years), the Tonto Platform/Tapeats
// Sandstone (greenish-tan), Redwall Limestone (red-purple — really grey, stained red from above),
// the Supai Group/Hermit Shale (deep red), Coconino Sandstone (pale cream) and the Kaibab
// Limestone cap (cream). A function of WORLD HEIGHT ONLY (never xz) so the bands line up
// perfectly horizontally across the whole canyon, like the real thing's own pages of rock — never
// periodic (unlike an earlier draft here): each layer appears exactly once, in order. ──
export interface CanyonBandStop {
  /** the height this band's own colour is fully reached from (the band below eases into it over
   *  CANYON_BAND_EDGE units) */
  h: number;
  color: string;
  name: string;
}
export const CANYON_BAND_STOPS: CanyonBandStop[] = [
  { h: -Infinity, color: "#5b4a47", name: "Vishnu Basement Rocks" },
  { h: 34, color: "#a89c72", name: "Tonto Platform" },
  { h: 50, color: "#6e3d4e", name: "Redwall Limestone" },
  { h: 66, color: "#a1482c", name: "Supai Group / Hermit Shale" },
  { h: 85, color: "#dcc89c", name: "Coconino Sandstone" },
  { h: 100, color: "#eee2c2", name: "Kaibab Limestone" },
];
/** the crisp transition's own half-width (world units) between one band and the next — for the
 *  cliff-wall/butte decor's own PER-FRAGMENT shader only (CANYON_BAND_GLSL), which can afford a
 *  genuinely crisp edge since it's evaluated once per pixel, not once per (sparse, metres apart)
 *  terrain vertex. */
export const CANYON_BAND_EDGE = 1.6;
/** round 8: the SAME bands, but for the ordinary vertex-coloured terrain (world/fantasy/
 *  terrainMesh.ts's groundColor(), which the kid's own feet — and the Mule Trail's ride camera —
 *  are right up against) — a much wider half-width, spanning most of the gap between adjacent
 *  stops (they're ~15-19 units apart), so the blend is genuinely smooth across the terrain's own
 *  coarse vertex spacing instead of collapsing to a de-facto hard per-vertex threshold (CANYON_
 *  BAND_EDGE's own 1.6 units is narrower than the height change between many adjacent terrain
 *  vertices, especially on a gentle bench-to-bench slope, which is exactly what read as a jagged
 *  "saw-tooth" colour edge rather than a soft one). The crisp look stays the wall decor's own job. */
export const CANYON_TERRAIN_BAND_EDGE = 7;
/** how much the band boundary wobbles with xz (a little organic noise, never a ruler-straight
 *  line) — kept under a unit, same spirit as CANYON_BAND_EDGE itself */
export const CANYON_BAND_WOBBLE = 0.8;

/** 0..1: how far up the WHOLE stratigraphic column `h` sits (0 at the bottom band's own start,
 *  1 at the top band) — monotonic, never periodic (kept for anything that just wants a scalar;
 *  the actual colour mixing (terrainMesh.ts / the cliff-wall shader) reads CANYON_BAND_STOPS
 *  directly, since a plain lerp can't reproduce 6 crisp, unevenly-spaced bands) */
export function canyonStrataT(h: number): number {
  const lo = CANYON_BAND_STOPS[1].h; // the lowest FINITE stop (Vishnu has none of its own)
  const hi = CANYON_BAND_STOPS[CANYON_BAND_STOPS.length - 1].h + 12; // a little past the Kaibab cap
  return Math.min(1, Math.max(0, (h - lo) / (hi - lo)));
}
/** GLSL source for a `canyonBandColor(float h)` function reading the exact same CANYON_BAND_STOPS
 *  (so the cliff-wall decor's own per-fragment shader never drifts from terrainMesh.ts's JS-side
 *  colours) — the same "bake the numbers into a GLSL string" trick registry/island.ts's COAST_GLSL
 *  uses. Crisp smoothstep transitions (CANYON_BAND_EDGE wide) read as flat bands, not a gradient. */
export const CANYON_BAND_GLSL: string = (() => {
  const hex = (h: string) => {
    const n = parseInt(h.slice(1), 16);
    return `vec3(${((n >> 16) & 255) / 255}, ${((n >> 8) & 255) / 255}, ${(n & 255) / 255})`;
  };
  const stops = CANYON_BAND_STOPS;
  let body = `vec3 col = ${hex(stops[0].color)};\n`;
  for (let i = 1; i < stops.length; i++) {
    body += `  col = mix(col, ${hex(stops[i].color)}, smoothstep(${(stops[i].h - CANYON_BAND_EDGE).toFixed(2)}, ${(stops[i].h + CANYON_BAND_EDGE).toFixed(2)}, h));\n`;
  }
  return `vec3 canyonBandColor(float h) {\n  ${body}  return col;\n}\n`;
})();
/** 0..1 how strongly the canyon's own local palette/desert ground should apply at (x, z) — 1 well
 *  inside its footprint, easing to 0 at CANYON_REACH (the same "scoped tightly, blending out"
 *  falloff Everest's own local override uses in terrainMesh.ts) */
export function canyonFootprintWeight(x: number, z: number): number {
  if (!CANYON_OPEN) return 0;
  const d = Math.hypot(x - CANYON_SITE.x, z - CANYON_SITE.z);
  return 1 - smoothstep(CANYON_REACH * 0.68, CANYON_REACH, d);
}
/** 0..1 how strongly the ground here should read as bare desert (no grass) — the whole footprint,
 *  not just the carved trench itself (the rim's own tableland is desert too) */
export function canyonDesertK(x: number, z: number): number {
  return canyonFootprintWeight(x, z);
}

// ── landmarks, all authored directly off the fixed frame (none of these were searched for, so
// none need freezing — they're formulas, like WILD_FALLS' lip/pool are formulas off WILD_SHELF) ──
/** the rim trailhead: where "Ride the Mule Trail" is offered, on the canyon's own south-east rim,
 *  near its southern (narrower) end, facing the footpath's own approach from Park Station */
// u=1.35 (not the old 0.9): the real (soft) height field's own last ramp up to the rim now runs all
// the way out to u=1.3 (canyonTerraceFracSoft's own widened last step) before the ground is truly,
// fully flat — a trailhead standing where the crisp visual rim USED to be (u~0.9) would now actually
// be planted partway down that ramp, ~20+ units below the real plateau it's meant to sit on. The
// watchtower's OWN named point happens to double as its own CANYON_DECKS platform's centre (built at
// the true rim height regardless of the ground under it, see WATCHTOWER_Y below), so it alone doesn't
// need moving; the trailhead, the Skywalk's viewpoint sign and the lodge have no such deck under
// their own named point — they need genuinely flat ground, so they're sited a little further back
// from the edge (CANYON_SKYWALK here is the sign/viewpoint on solid ground; the Skywalk's actual
// hanging glass balcony is SKYWALK_BASE/SKYWALK_OUT below, unaffected — those are keyed to
// rimHeightAt, not the carve, and always hang exactly at the true rim height regardless).
export const CANYON_TRAILHEAD = onCanyon(-245, 1.35);
/** the stone watchtower: a short walk along the rim from the trailhead */
export const CANYON_WATCHTOWER = onCanyon(-170, 0.93);
/** the Skywalk's own viewpoint sign, on solid rim ground a short walk back from where the glass
 *  balcony itself hangs out over the gorge (SKYWALK_BASE/SKYWALK_OUT below) */
export const CANYON_SKYWALK = onCanyon(40, 1.0);
/** the rim lodge/visitor hut, just back from the trailhead */
// u=1.35 for the same reason as CANYON_TRAILHEAD above: genuinely flat (soft-profile) ground for a
// building with no deck of its own, not partway down the now-much-wider final ramp to the rim.
export const CANYON_LODGE = onCanyon(-228, 1.35);
/** the river's own two landmarks: where the mule trail meets the water, and its own along-span */
export const CANYON_RIVER_SPAN: [number, number] = [-CANYON_HALF_LEN + 50, CANYON_HALF_LEN - 50];

/** the wonder's own sign-post viewpoints (registry/wonders.ts's own `viewpoints`): the trailhead,
 *  the watchtower and the Skywalk */
export const CANYON_VIEWPOINTS: { x: number; z: number }[] = [CANYON_TRAILHEAD, CANYON_WATCHTOWER, CANYON_SKYWALK];

// ── the watchtower and the Skywalk: two small walkable structures with invisible railings (the
// same idea as every raised deck on the island — harbours.ts's jetties, the Victoria Falls Bridge,
// Treetop's platforms), kept here (not as settlement `decks`, which must sit inside their own
// settlement's radius — these two are far apart along the rim) and plugged straight into
// lib/park/registry/harbours.ts's worldFloorY() and lib/park/engine/ParkWorld.ts's own
// raisedDeckAt() the same way wildBridgeDeckY() is. Pure data + maths, no three.js — the actual
// tower/balcony MESHES are world/grandCanyonDecor.ts's job. ──
const rimHeightAt = (x: number, z: number) => canyonRimY(x, z);
interface CanyonDeckLine {
  kind: "ramp";
  ax: number;
  az: number;
  ay: number;
  bx: number;
  bz: number;
  by: number;
  half: number;
}
interface CanyonDeckCircle {
  kind: "platform";
  x: number;
  z: number;
  y: number;
  r: number;
}
/** the watchtower: climb a short ramp from the rim path up onto a railed viewing platform, a
 *  storey above the ground, a short walk from the trailhead */
const WATCHTOWER_BASE = onCanyon(-170, 1.12);
const WATCHTOWER_Y = rimHeightAt(CANYON_WATCHTOWER.x, CANYON_WATCHTOWER.z) + 7;
/** the Skywalk: walk out from the solid rim onto a railed, glass-floored balcony that hangs out
 *  past the rim's own edge, over the cliffs falling away to the gorge below */
const SKYWALK_BASE = onCanyon(40, 0.9);
const SKYWALK_OUT = onCanyon(40, 0.66);
const SKYWALK_Y = rimHeightAt(SKYWALK_BASE.x, SKYWALK_BASE.z);
/** the Skywalk's own geometry, for the decor that draws it */
export const CANYON_SKYWALK_DECK = { base: SKYWALK_BASE, out: SKYWALK_OUT, y: SKYWALK_Y, r: 9, half: 2.4 };
/** the watchtower's platform height */
export const CANYON_WATCHTOWER_Y = WATCHTOWER_Y;
export const CANYON_DECKS: (CanyonDeckLine | CanyonDeckCircle)[] = [
  { kind: "ramp", ax: WATCHTOWER_BASE.x, az: WATCHTOWER_BASE.z, ay: rimHeightAt(WATCHTOWER_BASE.x, WATCHTOWER_BASE.z), bx: CANYON_WATCHTOWER.x, bz: CANYON_WATCHTOWER.z, by: WATCHTOWER_Y, half: 1.6 },
  { kind: "platform", x: CANYON_WATCHTOWER.x, z: CANYON_WATCHTOWER.z, y: WATCHTOWER_Y, r: 5 },
  { kind: "ramp", ax: SKYWALK_BASE.x, az: SKYWALK_BASE.z, ay: SKYWALK_Y, bx: SKYWALK_OUT.x, bz: SKYWALK_OUT.z, by: SKYWALK_Y, half: 2.4 },
  { kind: "platform", x: SKYWALK_OUT.x, z: SKYWALK_OUT.z, y: SKYWALK_Y, r: 9 },
];
/** the watchtower's/Skywalk's own deck height at (x, z), or null off them (registry/harbours.ts's
 *  worldFloorY() and ParkWorld.ts's raisedDeckAt() both call this) */
export function grandCanyonDeckY(x: number, z: number): number | null {
  if (!CANYON_OPEN) return null;
  let best: number | null = null;
  for (const d of CANYON_DECKS) {
    if (d.kind === "platform") {
      if ((x - d.x) ** 2 + (z - d.z) ** 2 <= d.r * d.r && (best === null || d.y > best)) best = d.y;
      continue;
    }
    const ux = d.bx - d.ax;
    const uz = d.bz - d.az;
    const L2 = ux * ux + uz * uz || 1;
    const t = ((x - d.ax) * ux + (z - d.az) * uz) / L2;
    if (t < -0.05 || t > 1.05) continue;
    const px = d.ax + ux * t - x;
    const pz = d.az + uz * t - z;
    if (px * px + pz * pz > d.half * d.half) continue;
    const y = d.ay + (d.by - d.ay) * Math.max(0, Math.min(1, t));
    if (best === null || y > best) best = y;
  }
  return best;
}

// ── "Ride the Mule Trail": a switchback from the trailhead down the canyon wall to the river,
// authored directly in (along, lateral-fraction-of-half-width) space, so it automatically lies on
// whichever real terrace the terrain carve above actually bakes (the shelves ARE the switchback's
// own flat legs) — the same idea as registry/everestRoute.ts's CONTROL points, just driven by this
// file's own formulas instead of a gentle-ground search (there's nothing to search: the terraces are
// authored, not natural noise) ──
/** the mule trail's own `along` position (it stays on one lateral side the whole way down) —
 *  exported so world/grandCanyonDecor.ts's cliff-wall decor can leave a gap in its own geometry
 *  along the ride's own corridor (the trail already hugs the real terraces closely; the camera
 *  riding behind/above the kid there would otherwise clip straight through the decor wall, which
 *  traces that exact same profile a hair further out) */
export const MULE_ALONG = -245;
const MULE_SIDE = 1; // the trailhead's own side (CANYON_TRAILHEAD's own uFrac is positive)
function muleWorldAt(along: number, uFrac: number): P2 {
  const p = onCanyon(along, uFrac, MULE_SIDE);
  return [p.x, p.z];
}
/** The Bright Angel-style ledge trail: from the trailhead out over the rim's edge, then three long
 *  ramps down the three cliffs — each one a ledge built against the foot of its cliff, running
 *  along the gorge — with a turn on each bench between them, to the river's bank. Authored as
 *  (along, u, depth fraction) nodes; every point of it lies ON or ABOVE the modelled surface (a
 *  ramp starts level with the bench above and ends level with the bench below), so the ground
 *  underfoot is simply max(surface, trail): see canyonWalkY(). The decor draws the ramps as solid
 *  rock causeways (world/grandCanyonDecor.ts buildCanyonTrail). */
const TRAIL_NODES: [number, number, number][] = [
  [MULE_ALONG, 1.35, 0], // the trailhead
  [MULE_ALONG + 5, 0.95, 0],
  [MULE_ALONG + 5, 0.765, 0], // out over the edge
  [-128, 0.765, 0.35], // ramp 1, down the Kaibab/Coconino cliff
  [-123, 0.64, 0.35], // a turn on the Esplanade
  [-128, 0.505, 0.35],
  [-232, 0.505, 0.62], // ramp 2, down the Redwall
  [-237, 0.4, 0.62], // a turn on the Tonto Platform
  [-232, 0.255, 0.62],
  [-122, 0.255, 1], // ramp 3, down to the river
  [-116, 0.225, 1], // the river's bank
];
export const CANYON_TRAIL_HALF = 3;
export interface CanyonTrailPoint {
  x: number;
  y: number;
  z: number;
  /** on a ramp (true) or on a level stretch that is just the bench itself (false) */
  ramp: boolean;
}
/** the trail, sampled every ~1.5 units */
export const CANYON_TRAIL: CanyonTrailPoint[] = (() => {
  const out: CanyonTrailPoint[] = [];
  for (let i = 0; i + 1 < TRAIL_NODES.length; i++) {
    const [a0, u0, f0] = TRAIL_NODES[i];
    const [a1, u1, f1] = TRAIL_NODES[i + 1];
    const p0 = onCanyon(a0, u0, MULE_SIDE);
    const p1 = onCanyon(a1, u1, MULE_SIDE);
    const n = Math.max(2, Math.ceil(Math.hypot(p1.x - p0.x, p1.z - p0.z) / 1.5));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      const along = a0 + (a1 - a0) * t;
      const p = onCanyon(along, u0 + (u1 - u0) * t, MULE_SIDE);
      const rim = canyonRimY(p.x, p.z);
      out.push({ x: p.x, z: p.z, y: rim - canyonMaxDepthAt(along) * (f0 + (f1 - f0) * t), ramp: f0 !== f1 });
    }
  }
  return out;
})();
/** the trail's own deck height at (x, z), or null off it */
export function canyonTrailY(x: number, z: number): number | null {
  if (!CANYON_OPEN) return null;
  const T = CANYON_TRAIL;
  if (Math.abs(x - T[0].x) > 140 || Math.abs(z - T[0].z) > 200) return null;
  let best = Infinity;
  let y = 0;
  for (let i = 0; i + 1 < T.length; i++) {
    const a = T[i];
    const b = T[i + 1];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez || 1)));
    const d = (x - a.x - ex * t) ** 2 + (z - a.z - ez * t) ** 2;
    if (d < best) {
      best = d;
      y = a.y + (b.y - a.y) * t;
    }
  }
  return best < (CANYON_TRAIL_HALF + 0.4) ** 2 ? y : null;
}
/** the modelled gorge's own surface at (x, z) — floor, benches, cliffs and the rim strip out to
 *  where the height field takes over again — or null outside it */
export function canyonSurfaceY(x: number, z: number): number | null {
  if (!CANYON_OPEN) return null;
  // (a cheap box first: this is asked for every footstep anywhere on the island)
  if (Math.abs(x - CANYON_SITE.x) > 150 || Math.abs(z - CANYON_SITE.z) > CANYON_HALF_LEN + 30) return null;
  const hit = axisNearest(x, z);
  if (Math.abs(hit.along) > CANYON_HALF_LEN + 20) return null;
  const hw = canyonHalfWidthAt(hit.along);
  const u = Math.abs(hit.lateral) / hw;
  if (u > CANYON_SUNK_EDGE) return null;
  return gorgeRim(hit.along, u, rawHeight(x, z) + canyonPlateauRaise(x, z)) - canyonMaxDepthAt(hit.along) * canyonTerraceFrac(u);
}
/** THE GROUND inside the canyon: the modelled surface, or the trail's ledge where that is higher
 *  (registry/harbours.ts's worldFloorY() uses it, so the kid, pets and the ride all stand on it) */
export function canyonWalkY(x: number, z: number): number | null {
  const s = canyonSurfaceY(x, z);
  if (s === null) return null;
  const t = canyonTrailY(x, z);
  return t !== null && t > s ? t : s;
}
export const CANYON_MULE_ROUTE: P2[] = CANYON_TRAIL.map((p) => [p.x, p.z]);

/** (x, z) a fraction `u` (0..1, the rim -> the river) along the mule trail */
export function muleRoutePointAtU(u: number): { x: number; z: number } {
  const n = CANYON_MULE_ROUTE.length;
  const f = Math.max(0, Math.min(1, u)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  const t = f - i;
  const a = CANYON_MULE_ROUTE[i];
  const b = CANYON_MULE_ROUTE[i + 1];
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t };
}
/** the walking heading (atan2(dx, dz) convention) at `u` along the mule trail */
export function muleRouteHeadingAtU(u: number): number {
  const e = 0.01;
  const a = muleRoutePointAtU(Math.max(0, u - e));
  const b = muleRoutePointAtU(Math.min(1, u + e));
  return Math.atan2(b.x - a.x, b.z - a.z);
}

/** which rock layer the mule trail is passing at fraction `u` (0..1): one entry per
 *  CANYON_LAYERS below, evenly spaced along the ride (the trail's own legs were authored to match
 *  these, see MULE_CONTROL's own comments) */
export interface CanyonLayer {
  name: string;
  emoji: string;
  age: string;
  fact: string;
}
export const CANYON_LAYERS: CanyonLayer[] = [
  { name: "The Rim", emoji: "\u{1F3DC}\u{FE0F}", age: "today", fact: "You're starting at the very top of the Grand Canyon's rim!" },
  { name: "Kaibab Limestone", emoji: "\u{1FAA8}", age: "~270 million years old", fact: "Cream-coloured rock from an ancient sea that once covered this land." },
  { name: "Coconino Sandstone", emoji: "\u{1F3DC}\u{FE0F}", age: "~275 million years old", fact: "Made from the sand of a GIANT ancient desert, bigger than Arizona itself!" },
  { name: "The Esplanade", emoji: "\u{1FAA8}", age: "~285 million years old", fact: "A wide rocky shelf of old red mudflats and riverbeds." },
  { name: "Redwall Limestone", emoji: "\u{1F9F1}", age: "~335 million years old", fact: "This cliff is really grey — it just looks red from rock dust washing down from above!" },
  { name: "Tonto Platform", emoji: "\u{1FAA8}", age: "~525 million years old", fact: "An ancient seashore, when this whole area was underwater." },
  { name: "The Colorado River", emoji: "\u{1F4A7}", age: "today", fact: "The river that carved all of this, one tiny grain of sand at a time, over millions of years." },
];

// ── the footpath in from Park Station: the Great Ridge sits squarely between the park and the
// high uplands, so (unlike every settlement's own short footpaths.ts walk) this one has to go
// ROUND the ridge's own south-western tail rather than straight across it — a handful of waypoints
// hugging the gentle ground just west of the ridge (verified against registry/landform.ts's own
// rawHeight/ridgeAt along the whole way), smoothed into one walkable trail. Kept here rather than
// in registry/footpaths.ts (which is keyed to SETTLEMENTS' own `stationId`, not a bare destination
// like a wonder) — registry/terrain.ts, world/fantasy/{mask,wilds}.ts read it directly. ──
const PARK_STATION = STATIONS.find((s) => s.id === "park-station");
if (!PARK_STATION) throw new Error("grandCanyon: no park-station in the railway registry");
const FOOTPATH_WAYPOINTS: P2[] = [
  [PARK_STATION.x, PARK_STATION.z],
  [-20, -300],
  [-120, -650],
  [-60, -1000],
  [120, -1300],
  [CANYON_TRAILHEAD.x, CANYON_TRAILHEAD.z],
];
export const CANYON_FOOTPATH: P2[] = CANYON_OPEN ? smooth(FOOTPATH_WAYPOINTS, 10) : [];
/** is (x, z) within `pad` of the footpath in from Park Station? */
export function nearCanyonFootpath(x: number, z: number, pad = 0): boolean {
  if (!CANYON_OPEN) return false;
  return nearestOnPolyline(CANYON_FOOTPATH, x, z).d < 1.6 + pad;
}

// ── Canyon Rim Outpost: a tiny ranger/mule-wrangler camp at the trailhead, written as a settlement
// purely so the existing activityOffer plumbing (lib/park/world/settlements/ → ParkWorld.ts →
// ParkApp.tsx, the same one Everest Base Camp and Parícutin's farm use) offers "Ride the Mule
// Trail!" when the kid walks up — see lib/park/registry/settlements.ts's own generateCanyonOutpost()
// import. Reuses the "basecamp" style renderer (bright tents): it doesn't render `decks` at all
// (only Treetop's style does), so the watchtower/Skywalk above stay purely functional, with their
// own look built entirely in world/grandCanyonDecor.ts. Kept tiny (no fauna, a short roster) — this
// is a staging post for the ride, not a village to explore.
import type { SettlementAct, SettlementActivitySpot, SettlementDef, SettlementNode, SettlementProp, SettlementSlot, SettlementTalkLines, SettlementVillagerDef, SettlementWorkSpot } from "./settlements";

function rngOfOutpost(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function generateCanyonOutpost(): SettlementDef {
  const r = rngOfOutpost(55221);
  const cx = CANYON_LODGE.x;
  const cz = CANYON_LODGE.z;
  const radius = 22;
  const padHeight = grandCanyonGroundY(cx, cz, rawHeight(cx, cz)) ?? rimHeightAt(cx, cz);
  const towardCanyon = Math.atan2(CANYON_SITE.x - cx, CANYON_SITE.z - cz);
  const awayFromCanyon = towardCanyon + Math.PI;

  // small tents, tucked in BEHIND the lodge (away from the canyon, out of the main postcard
  // camera's own view) — the lodge/supply shed (world/grandCanyonDecor.ts) are what every camera
  // actually sees; these just give the roster somewhere to sleep
  const huts: SettlementDef["huts"] = [];
  for (let i = 0; i < 3; i++) {
    const a = awayFromCanyon + (i - 1) * 0.5;
    const rad = 15 + i * 1.5;
    const x = cx + Math.sin(a) * rad;
    const z = cz + Math.cos(a) * rad;
    huts.push({ x, z, yaw: Math.atan2(cx - x, cz - z), kind: "tent", size: 0.95 });
  }

  const fire = { x: cx, z: cz };
  const props: SettlementProp[] = [{ kind: "firepit", x: fire.x, z: fire.z, yaw: 0, scale: 1 }];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    props.push({ kind: "bench", x: fire.x + Math.sin(a) * 2.8, z: fire.z + Math.cos(a) * 2.8, yaw: a + Math.PI, scale: 1 });
  }
  const cratesA = awayFromCanyon - 0.8;
  props.push({ kind: "crates", x: cx + Math.sin(cratesA) * 8, z: cz + Math.cos(cratesA) * 8, yaw: cratesA, scale: 1 });
  props.push({ kind: "trailhead-flags", x: CANYON_TRAILHEAD.x, z: CANYON_TRAILHEAD.z, yaw: towardCanyon, scale: 1 });
  // (no bunting between the tents here — this is a ranger outpost, not a climbers' festival camp)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    props.push({ kind: "lantern", x: fire.x + Math.sin(a) * 4, z: fire.z + Math.cos(a) * 4, yaw: 0, scale: 1 });
  }

  const nodes: SettlementNode[] = [{ id: "fire", x: fire.x, z: fire.z }];
  const edges: [number, number][] = [];
  const addNode = (id: string, x: number, z: number) => {
    nodes.push({ id, x, z });
    return nodes.length - 1;
  };
  huts.forEach((h, i) => {
    const doorX = h.x - Math.sin(h.yaw) * (h.size * 1.3);
    const doorZ = h.z - Math.cos(h.yaw) * (h.size * 1.3);
    edges.push([0, addNode(`home-${i}`, doorX, doorZ)]);
  });
  const trailIdx = addNode("trailhead", CANYON_TRAILHEAD.x, CANYON_TRAILHEAD.z);
  edges.push([0, trailIdx]);
  const cratesIdx = addNode("crates", cx + Math.sin(cratesA) * 8, cz + Math.cos(cratesA) * 8);
  edges.push([0, cratesIdx]);

  const work: SettlementWorkSpot[] = [
    { id: "fire", x: fire.x, z: fire.z, face: 0, sit: true },
    { id: "trailhead", x: CANYON_TRAILHEAD.x, z: CANYON_TRAILHEAD.z, face: towardCanyon },
  ];

  const S = (from: number, act: SettlementAct, spot?: string): SettlementSlot => ({ from, act, spot });
  interface RosterEntry {
    id: string;
    name: string;
    elder?: boolean;
    talk?: boolean;
    home: number;
    sched: SettlementSlot[];
  }
  const ROSTER: RosterEntry[] = [
    { id: "ranger", name: "Ranger Mesa", elder: true, talk: true, home: 0, sched: [S(0, "home"), S(6, "sit", "fire"), S(9, "look", "trailhead"), S(13, "sit", "fire"), S(17, "wander"), S(18.5, "sit", "fire"), S(23, "home")] },
    { id: "wrangler", name: "Wrangler Sage", talk: true, home: 1, sched: [S(0, "home"), S(6.5, "look", "trailhead"), S(10, "wander"), S(14, "look", "trailhead"), S(18.4, "dance", "fire"), S(22.3, "home")] },
    { id: "ranger-kid", name: "Pebble", talk: true, home: 2, sched: [S(0, "home"), S(7.5, "wander"), S(11, "sit", "fire"), S(14, "wander"), S(18.2, "dance", "fire"), S(21, "home")] },
  ];
  const roster: SettlementVillagerDef[] = ROSTER.map((e, i) => ({
    id: e.id,
    name: e.name,
    home: e.home % huts.length,
    kid: e.id === "ranger-kid",
    elder: !!e.elder,
    seed: 7700 + i * 151,
    schedule: e.sched,
    skin: i % 7,
    hair: (i * 3 + 2) % 8,
    cloth: (i * 5 + 1) % 7,
    hairStyle: i % 3,
    body: e.elder ? 2 : 0,
    talk: e.talk ? e.id : undefined,
    pair: i % 2,
  }));

  const talk: SettlementTalkLines[] = [
    { id: "ranger", name: "Ranger Mesa", lines: ["Welcome to the rim! The Grand Canyon is about 1.8 km deep at its deepest.", "The rock at the very bottom is nearly 2 billion years old — older than almost anything alive.", "Saddle up at the trailhead flags for a mule ride all the way down to the river!"] },
    { id: "wrangler", name: "Wrangler Sage", lines: ["Our mules are sure-footed — they've walked this trail a thousand times.", "Hold on tight on the switchbacks, and enjoy the view!", "Keep an eye out for condors riding the warm air up from the canyon."] },
    { id: "ranger-kid", name: "Pebble", lines: ["I've ridden the mule trail five times already!", "My favourite part is looking straight down through the Skywalk's glass floor.", "Watch for bighorn sheep on the ledges — they never slip!"] },
  ];

  const activities: SettlementActivitySpot[] = [{ id: "grand-canyon-ride", x: CANYON_TRAILHEAD.x, z: CANYON_TRAILHEAD.z, r: 10, label: "Ride the Mule Trail!", emoji: "\u{1F434}" }];
  const obstacles = [...huts.map((h) => ({ x: h.x, z: h.z, r: h.size * 1.5 })), { x: fire.x, z: fire.z, r: 1.6 }];

  return {
    id: "canyon-outpost",
    name: "Canyon Rim Outpost",
    clan: "the Trail Wranglers",
    emoji: "\u{1F3DC}\u{FE0F}",
    style: "basecamp",
    x: cx,
    z: cz,
    radius,
    padHeight,
    stationId: "park-station",
    huts,
    props,
    nodes,
    edges,
    work,
    roster,
    talk,
    activities,
    obstacles,
    pier: null,
    canoeLoops: [],
    fauna: [],
    decks: [],
    levelPatches: [],
  };
}
