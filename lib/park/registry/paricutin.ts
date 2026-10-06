// Parícutin: the cinder-cone volcano that was born in a Mexican farmer's cornfield on 20 February
// 1943 — scientists watched it grow from a crack in the ground to a 336 m mountain in its first
// year alone. Sited on the Sunny Plains, well clear of Sunnybrook (registry/town.ts's TOWN_SITE),
// the Wildlands Railway, the Great Lake's outlet and every other registered place (see
// findParicutinFarmSite below, and paricutin.test.ts, which re-runs the search — the same
// frozen-site discipline as every settlement: registry/town.ts's TOWN_SITE, registry/kartTrack.ts's
// KART_SITE, registry/everestBaseCamp.ts's BASE_CAMP_SITE).
//
// Two things live here:
//  1. Dionisio Pulido's little farmstead — a SettlementDef (style "farm"), generated and rendered
//     exactly like every other settlement (registry/settlements.ts pushes `generateFarm()` onto
//     SETTLEMENTS; the renderer is world/settlements/styles/farm.ts). Its "activity" is
//     "Climb to the crater!", offered right at the trailhead the cone's own flank starts at.
//  2. The volcano's own TERRAIN: a steep cinder cone with a crater bowl and a gently domed lava
//     field at its foot, raised into the real height field by `paricutinY` (used by
//     registry/terrain.ts's finish(), exactly the way registry/wildWater.ts's wildGorgeWallY raises
//     Victoria Falls' gorge walls) — never a separate scene, so the climb (lib/park/registry/
//     paricutinRoute.ts) walks real, sampled ground the whole way up.
//
// Pure data + maths, deterministic, no three.js (the renderer is world/settlements/styles/farm.ts
// and world/paricutinDecor.ts).
import { seaDist } from "./island";
import { nearRail, RAIL_POINTS, STATIONS } from "./railway";
import { wildWaterSdf } from "./wildWater";
import { smoothstep } from "./geom2d";
import { footprintStats, rawHeight, smoothedHeight } from "./landform";
import {
  settlePadHeight,
  type SettlementAct,
  type SettlementActivitySpot,
  type SettlementDef,
  type SettlementFauna,
  type SettlementHut,
  type SettlementNode,
  type SettlementObstacle,
  type SettlementProp,
  type SettlementSlot,
  type SettlementTalkLines,
  type SettlementVillagerDef,
  type SettlementWorkSpot,
} from "./settlements";

const TAU = Math.PI * 2;

/** a seeded xorshift rng (0..1) — the same little generator every settlement generator uses */
function rngOf(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ── a tiny value-noise, just for the cone's own rocky texture (cheap: this runs once per terrain
// sample inside the cone/lava footprint, not over the whole island) ──
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
function fbm2(x: number, y: number, oct = 3): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f);
    f *= 2.05;
    amp *= 0.5;
  }
  return s;
}

const PLAINS_STATION = STATIONS.find((s) => s.id === "plains-station")!;
if (!PLAINS_STATION) throw new Error("paricutin: no plains-station in the railway registry");

export interface ParicutinAvoid {
  x: number;
  z: number;
}

/** a deterministic search for Dionisio Pulido's farmstead: dry, gently rolling Sunny Plains
 *  farmland, clear of the railway and well clear of Sunnybrook (registry/town.ts's TOWN_SITE) and
 *  every other settlement — scored on the REAL, unlevelled ground (registry/landform.ts), the same
 *  discipline as every other settlement's own site search (registry/town.ts's findTownSite,
 *  registry/everestBaseCamp.ts's findBaseCampSite). The cart road (registry/cartRoad.ts) can't be
 *  checked here — importing it would be circular, since cartRoad.ts itself reads SETTLEMENTS, which
 *  this file is built into — so paricutin.test.ts checks the FROZEN site against it directly. */
export function findParicutinFarmSite(avoid: ParicutinAvoid[]): { x: number; z: number } {
  let best: { x: number; z: number; score: number } | null = null;
  for (let a = 0; a < TAU; a += 0.02) {
    for (let rad = 150; rad <= 600; rad += 5) {
      const x = PLAINS_STATION.x + Math.sin(a) * rad;
      const z = PLAINS_STATION.z + Math.cos(a) * rad;
      if (seaDist(x, z) > -80) continue;
      if (nearRail(x, z, 25)) continue;
      if (wildWaterSdf(x, z) < 40) continue;
      // a healthy 655 (not just settlements.test.ts's bare 560 pairwise minimum, and more than
      // registry/town.ts's own self-imposed 620): the volcano's own footprint sits a further ~220
      // beyond the farm itself, and Sunnybrook's OWN search (town.test.ts) re-derives its avoid list
      // straight off the live SETTLEMENTS array — if the farm sat any closer than town's own margin,
      // adding it here would silently move Sunnybrook's site too
      if (avoid.some((p) => Math.hypot(x - p.x, z - p.z) < 655)) continue;
      const stats = footprintStats(x, z, 45);
      if (stats.maxSlope > 0.35 || stats.relief > 9) continue;
      const score = -Math.abs(rad - 280) * 0.6 - stats.relief * 0.8 - stats.maxSlope * 15;
      if (!best || score > best.score) best = { x, z, score };
    }
  }
  if (!best) throw new Error("paricutin: no farm site found near Sunny Plains Station");
  return { x: Math.round(best.x * 10) / 10, z: Math.round(best.z * 10) / 10 };
}

/** Frozen as a stored number (TOWN_SITE's own pattern — see CLAUDE.md's note on settlement siting):
 *  re-running findParicutinFarmSite() at module load would re-score every candidate against
 *  whatever the terrain looks like right now, so a later terrain change could silently move the
 *  farm (and the volcano rising right behind it). Captured once from the live search with
 *  Sunnybrook's TOWN_SITE as the avoid list; paricutin.test.ts re-runs the search and checks it
 *  still lands exactly here. */
export const PARICUTIN_FARM_SITE = { x: 1115.5, z: 25.4 };
export const FARM_RADIUS = 24;

/** a deterministic search for the volcano's own site, a healthy distance out from the farm (clear
 *  of its pad — see `coneR`'s own comment) in whatever direction keeps it clear of the railway, the
 *  water and every other settlement, on ground that's gentle across the volcano's WHOLE eventual
 *  footprint (the cone plus its lava field apron) before anything is raised into it. Same discipline
 *  as findParicutinFarmSite (and can't check the cart road either, for the same circular-import
 *  reason); paricutin.test.ts re-runs this against PARICUTIN_CONE. */
/** the nearest the railway loop (registry/railway.ts's RAIL_POINTS, sampled every few points — a
 *  site search doesn't need every one, same reasoning as registry/kartTrack.ts's own
 *  footprintSamples) comes to (x, z) — used to keep the volcano's WHOLE footprint (the cone plus
 *  its lava field apron, not just its own centre) off the rails, not just a small fixed pad */
function minDistToRail(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < RAIL_POINTS.length; i += 4) {
    const [rx, rz] = RAIL_POINTS[i];
    const d = Math.hypot(x - rx, z - rz);
    if (d < best) best = d;
  }
  return best;
}

export function findParicutinConeSite(farmSite: { x: number; z: number }, avoid: ParicutinAvoid[], coneR: number, lavaFieldOut: number): { x: number; z: number } {
  let best: { x: number; z: number; score: number } | null = null;
  // the farm's own pad stays clear of the WHOLE lava field apron (not just the cone's bare base) —
  // otherwise its own huts sit inside the apron's gradual blend and the "flush pad" discipline every
  // settlement is held to (settlements.test.ts) breaks: a +15 margin beyond the apron's own reach
  const minDist = coneR * lavaFieldOut + FARM_RADIUS + 15;
  // the WHOLE footprint (cone + apron) must clear the railway, not just a small fixed pad round the
  // centre — otherwise the apron's own gentle rise reaches the track and the rail "never buried in
  // the ground" discipline (registry/railway.test.ts) breaks, since railHeights() is computed from
  // the land BEFORE this bump is added
  const railClear = coneR * lavaFieldOut + 15;
  for (let a = 0; a < TAU; a += 0.015) {
    for (let dist = minDist; dist <= minDist + 100; dist += 5) {
      const x = farmSite.x + Math.sin(a) * dist;
      const z = farmSite.z + Math.cos(a) * dist;
      if (seaDist(x, z) > -100) continue;
      if (minDistToRail(x, z) < railClear) continue;
      if (wildWaterSdf(x, z) < 30) continue;
      if (avoid.some((p) => Math.hypot(x - p.x, z - p.z) < 590)) continue;
      const stats = footprintStats(x, z, coneR * 1.7, 16);
      if (stats.maxSlope > 0.3 || stats.relief > 20) continue;
      const score = -Math.abs(dist - minDist - 10) * 0.3 - stats.relief - stats.maxSlope * 15;
      if (!best || score > best.score) best = { x, z, score };
    }
  }
  if (!best) throw new Error("paricutin: no cone site found near the farm");
  return { x: Math.round(best.x * 10) / 10, z: Math.round(best.z * 10) / 10 };
}

/** the volcano itself: a steep cinder cone (real Parícutin is ~424 m tall; this is the park's
 *  kid-sized version) a short walk from the farmstead — real too: the farm sits right where
 *  Dionisio Pulido's actual cornfield was, at the foot of the real volcano. Frozen alongside the
 *  farm site (same test re-runs both): `r` is the cone's own base radius (the lava field reaches a
 *  good deal further, see LAVA_FIELD_OUT), `h` its height above the surrounding plain. The
 *  farm-to-cone gap (~219) is picked so the farm's OWN flat pad (FARM_RADIUS out from its centre)
 *  sits safely outside the WHOLE lava field apron (r * LAVA_FIELD_OUT below), not just the cone's
 *  own bare base — the farmstead stands on ordinary, unraised plain the entire way across its pad. */
// h/r give a true ~35.8° average slope (close to a real cinder cone's own angle of repose,
// 30-33°, and unmistakably steeper than the plains' own gentle rolling hills — see paricutinY's
// own comment for why this reads as a clean, standalone cone instead of "more blotchy hills" now)
export const PARICUTIN_CONE = { x: 897.2, z: 8.5, r: 100, h: 72 };
/** the crater's rim, as a fraction of the cone's own radius (so the bowl is proportioned to the
 *  cone — a bigger cone gets a bigger crater too) */
export const CRATER_U = 0.19;
/** how far down into the summit the crater bowl is carved, below the rim — round 3's own re-check:
 *  looking in from the rim showed nothing but a dark hole (a kid-controlled camera that doesn't
 *  pitch down far needs a shallower bowl to actually SEE the floor/pool without a deliberate look-
 *  down), so this is shallower than round 2's 22 — still a real bowl you walk round and look into. */
export const CRATER_DEPTH = 15;
/** how far out (as a multiple of the cone's own radius) the black lava field reaches past the
 *  cone's own base before a CRISP (not gradual/blotchy) cut back to ordinary farmland */
export const LAVA_FIELD_OUT = 1.7;

const TRAILHEAD_A = Math.atan2(PARICUTIN_CONE.x - PARICUTIN_FARM_SITE.x, PARICUTIN_CONE.z - PARICUTIN_FARM_SITE.z);
/** where the roped-free, tap-to-climb trail up the cone begins — right at the farmstead's own edge,
 *  facing the volcano (the same idea as Everest Base Camp's own trailhead) */
export const PARICUTIN_TRAILHEAD = { x: PARICUTIN_FARM_SITE.x + Math.sin(TRAILHEAD_A) * (FARM_RADIUS - 2), z: PARICUTIN_FARM_SITE.z + Math.cos(TRAILHEAD_A) * (FARM_RADIUS - 2) };
/** the crater's rim, on the side facing the farm/trailhead — where the switchback trail
 *  (registry/paricutinRoute.ts) arrives */
const RIM_R = PARICUTIN_CONE.r * CRATER_U;
export const PARICUTIN_RIM = { x: PARICUTIN_CONE.x - Math.sin(TRAILHEAD_A) * RIM_R, z: PARICUTIN_CONE.z - Math.cos(TRAILHEAD_A) * RIM_R };
/** the angle (from the cone's own centre) of the rim point the trail arrives at — the "near" side
 *  of the rim, facing the trailhead/farm. `paricutinY`'s rim notch (below) is centred here: a real,
 *  guided look-down spot, not a kid blindly tilting the camera down into black. */
export const RIM_NEAR_A = TRAILHEAD_A + Math.PI;

/** the half-buried church of San Juan Parangaricutiro — the real story's most famous image: its
 *  twin towers still poke out of the hardened lava today. Sited out in the lava field, off to one
 *  side of the farm-to-crater line so it reads as its own little discovery, not stacked on the
 *  trail; still an easy walk from the farmstead. */
const CHURCH_A = TRAILHEAD_A + 1.25;
const CHURCH_R = PARICUTIN_CONE.r * 1.3;
export const PARICUTIN_CHURCH = { x: PARICUTIN_CONE.x + Math.sin(CHURCH_A) * CHURCH_R, z: PARICUTIN_CONE.z + Math.cos(CHURCH_A) * CHURCH_R };

/** is (x, z) within the volcano's own footprint (the cone and its lava field apron), `pad` beyond
 *  it — for keeping the Wildlands' ordinary trees/rocks (world/fantasy/wilds.ts) from growing
 *  through the cone or the lava field */
export function nearParicutin(x: number, z: number, pad = 0): boolean {
  return Math.hypot(x - PARICUTIN_CONE.x, z - PARICUTIN_CONE.z) < PARICUTIN_CONE.r * LAVA_FIELD_OUT + pad;
}

/** 1 well inside the volcano's own footprint, fading to 0 by its outer edge (LAVA_FIELD_OUT) — the
 *  Grand Canyon's own canyonFootprintWeight's own pattern, but with a much NARROWER final fade (the
 *  lava field must read as a distinct black field with a crisp edge against the green plain, never
 *  a wide blotchy gradient — polish round 2). Shared by terrainMesh.ts's colour override and
 *  world/fantasy/mask.ts's grass mask, so the two always agree on exactly where it ends. */
export function paricutinFootprintWeight(x: number, z: number): number {
  const d = Math.hypot(x - PARICUTIN_CONE.x, z - PARICUTIN_CONE.z) / PARICUTIN_CONE.r;
  return 1 - smoothstep(LAVA_FIELD_OUT * 0.94, LAVA_FIELD_OUT, d);
}

/** the real, unlevelled ground right at the cone's own centre — a fixed reference, computed once
 *  (one cheap 8-sample smoothedHeight call, not per-vertex), used to give the cone a level pad of
 *  its own instead of rising and falling with the plains' own rolling noise under it. Without this
 *  the cone's silhouette reads as "more blotchy hills" (polish round 2's own complaint) rather than
 *  one clean, symmetrical shape standing alone on the plain. */
export const PARICUTIN_BASE_H = smoothedHeight(PARICUTIN_CONE.x, PARICUTIN_CONE.z);

/** the volcano's own height, raised into the real terrain (registry/terrain.ts's finish(), exactly
 *  the way registry/wildWater.ts's wildGorgeWallY raises Victoria Falls' gorge) — null outside its
 *  own footprint.
 *
 *  Redesigned for polish round 2 (the first pass read as "blotchy hills", not a cone): the cone's
 *  own footprint sits on a LEVELLED pad (PARICUTIN_BASE_H), blending back to the real local ground
 *  only in the last sliver before the base edge, so the shape itself is clean and symmetrical
 *  rather than wobbling with the plains' own noise. The profile is two straight, linear pieces
 *  meeting at the rim (u = CRATER_U), which is thereby the single highest ring on the whole
 *  cone — crater bowl sloping down to the floor inside it, cone flank sloping down to the base
 *  outside it — so it reads as a real "flat-cut" crater top, not a smooth dome. Texture is a light
 *  multiplicative ripple (±5%), subtle enough to read as rough cinder without breaking the clean
 *  silhouette. Beyond the base, a short, crisp-edged black lava-field dome (zero at both the cone's
 *  own base and the footprint's outer edge, so there's never a visible seam or a long blotchy
 *  fade-out) sits on the same levelled pad, blending back to the real ground only right at its own
 *  outer rim. */
export function paricutinY(x: number, z: number, ground: number): number | null {
  const dx = x - PARICUTIN_CONE.x;
  const dz = z - PARICUTIN_CONE.z;
  const d = Math.hypot(dx, dz);
  const u = d / PARICUTIN_CONE.r;
  if (u > LAVA_FIELD_OUT) return null;
  if (u <= 1) {
    // a level pad under the whole cone (blending back to the real ground only in the last 18% of
    // the radius, so it still meets the surrounding plain smoothly)
    const baseBlend = smoothstep(0.82, 1, u);
    const base = PARICUTIN_BASE_H + (ground - PARICUTIN_BASE_H) * baseBlend;
    const crag = fbm2(x / 15 + 5, z / 15 - 9, 3) - 0.5; // -0.5..0.5, SUBTLE (±5%, not ±7-ish before)
    const textureK = 1 + crag * 0.1;
    // a real, DELIBERATE notch in the rim right where the climb trail arrives (RIM_NEAR_A): round
    // 2's symmetric rim read as a dark hole from the viewpoint because the near lip stood as tall
    // as the far one, blocking the kid's own (mostly level) camera from ever seeing the floor/pool
    // below — lowering the near arc a few units opens a real sightline down into the bowl without
    // touching the camera itself. A smooth, bounded bump (zero beyond ~49° either side, zero away
    // from the rim ring itself), so the cone's silhouette from the farm/plains is untouched.
    const theta = Math.atan2(dx, dz);
    const angDiff = Math.atan2(Math.sin(theta - RIM_NEAR_A), Math.cos(theta - RIM_NEAR_A));
    const angK = 1 - smoothstep(0.35, 0.85, Math.abs(angDiff));
    if (u <= CRATER_U) {
      // inside the crater bowl, on the viewpoint's own side (angK): round 3's own re-check found
      // the camera's forward look-ahead point (a little past the kid, toward the bowl) still dipped
      // BELOW the real terrain a short way in — a rim-only notch lowers the RING but the bowl's own
      // concave wall right behind it was still steep enough to catch the camera's sightline a few
      // units further along, reading as "the dark back side of a surface" (the exact failure mode
      // the Grand Canyon hit too). So here the WHOLE near-side wall tilts down by the same amount as
      // the rim — not just a thin radial band — so there is no sudden wall anywhere behind the
      // viewpoint, however far the look-ahead point drifts toward the centre.
      const notch = 9 * angK;
      const t = u / CRATER_U;
      const bowl = t * t * (3 - 2 * t);
      return base + (PARICUTIN_CONE.h - CRATER_DEPTH) * textureK + CRATER_DEPTH * bowl - notch;
    }
    // the outer flank: a clean, straight slope from the rim down to the base — the real angle of
    // repose, not a curve, so the silhouette reads as a true cone. The notch stays a narrow radial
    // band here (not the bowl's own full-depth tilt) so the cone's silhouette from the farm/plains
    // keeps its clean, symmetric shape.
    const radialK = 1 - smoothstep(0, 0.1, u - CRATER_U);
    const notch = 9 * angK * radialK;
    const t = (u - CRATER_U) / (1 - CRATER_U);
    return base + PARICUTIN_CONE.h * textureK * (1 - t) - notch;
  }
  // the lava field apron: solid and low, zero at the cone's own base (an exact seam match with the
  // cone branch above, both give `ground` there) and zero again by LAVA_FIELD_OUT, with a CRISP
  // cut back to zero well short of the full reach in between (never the slow fade-out that read as
  // a blotchy smear in round 1) — rides the real ground directly (its own bump is zero at both
  // ends, so there's no seam to flatten away)
  const t = (u - 1) / (LAVA_FIELD_OUT - 1);
  const crag2 = fbm2(x / 20 + 5, z / 20 - 9, 3) - 0.5;
  const dome = smoothstep(0, 0.22, t) * (1 - smoothstep(0.62, 0.78, t)); // 0 at both ends, crisp fall
  const apron = (4.5 + crag2 * 2) * dome;
  return ground + apron;
}

// ── the farmstead: Dionisio Pulido's family, a little farmhouse, a barn-red plough standing idle
// in the corn rows, a scarecrow, a geology station the volcanologists set up once the mountain
// started growing, and a firepit the family still gathers round of an evening ──

function generateFarm(): SettlementDef {
  const r = rngOf(31943);
  const cx = PARICUTIN_FARM_SITE.x;
  const cz = PARICUTIN_FARM_SITE.z;
  const radius = FARM_RADIUS;
  const padHeight = settlePadHeight("farm", cx, cz);
  const towardCone = TRAILHEAD_A;
  const awayFromCone = towardCone + Math.PI;

  const huts: SettlementHut[] = [];
  // the farmhouse, its door facing the dooryard (away from the volcano, towards the lane in) — a
  // real-scale adobe house (ridge well above the kid's own 2.26-unit height, not a shed: polish
  // round 2's own complaint was that the first pass read as "no farmhouse in the shots" at all)
  const houseA = awayFromCone - 0.5;
  const house = { x: cx + Math.sin(houseA) * 12, z: cz + Math.cos(houseA) * 12 };
  huts.push({ x: house.x, z: house.z, yaw: houseA + Math.PI, kind: "farmhouse", size: 2.6 });
  // a little barn beside it
  const barnA = houseA + 0.9;
  const barn = { x: cx + Math.sin(barnA) * 11.5, z: cz + Math.cos(barnA) * 11.5 };
  huts.push({ x: barn.x, z: barn.z, yaw: barnA + Math.PI, kind: "barn", size: 2.1 });

  const props: SettlementProp[] = [];
  const fire = { x: cx, z: cz };
  props.push({ kind: "firepit", x: fire.x, z: fire.z, yaw: 0, scale: 1 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    props.push({ kind: "bench", x: fire.x + Math.sin(a) * 3.3, z: fire.z + Math.cos(a) * 3.3, yaw: a + Math.PI, scale: 1 });
  }

  // the scarecrow, the idle plough and a donkey, out among the corn rows, towards the volcano (the
  // real story: the crack that became Parícutin opened in Dionisio Pulido's own cornfield)
  const fieldA = towardCone;
  const scarecrow = { x: cx + Math.sin(fieldA + 0.5) * 16, z: cz + Math.cos(fieldA + 0.5) * 16 };
  props.push({ kind: "scarecrow", x: scarecrow.x, z: scarecrow.z, yaw: r() * TAU, scale: 1 });
  const plough = { x: cx + Math.sin(fieldA - 0.6) * 14, z: cz + Math.cos(fieldA - 0.6) * 14 };
  props.push({ kind: "plough", x: plough.x, z: plough.z, yaw: fieldA + Math.PI / 2, scale: 1 });
  const donkey = { x: plough.x + Math.sin(fieldA + 1.2) * 2.6, z: plough.z + Math.cos(fieldA + 1.2) * 2.6 };
  // corn rows: dense, straight ranks between the dooryard and the trailhead, like a real ploughed
  // field — tall, leafy plants (world/settlements/styles/farm.ts's buildCorn), tightly packed
  const rowDirA = fieldA + Math.PI / 2;
  const ROWS = [-4, -3, -2, -1, 1, 2, 3, 4]; // leave the centre lane (row 0) clear for the path out
  const STEPS = 7;
  const ROW_GAP = 1.7;
  const STEP_GAP = 1.9;
  for (const row of ROWS) {
    for (let step = 0; step < STEPS; step++) {
      const along = 5 + step * STEP_GAP;
      const x = cx + Math.sin(fieldA) * along + Math.sin(rowDirA) * row * ROW_GAP;
      const z = cz + Math.cos(fieldA) * along + Math.cos(rowDirA) * row * ROW_GAP;
      props.push({ kind: "corn", x, z, yaw: fieldA + (r() - 0.5) * 0.3, scale: 0.95 + r() * 0.3 });
    }
  }
  // a wooden fence running the field's own perimeter (a proper fenced cornfield, not an open patch)
  const fieldNear = 3.5;
  const fieldFar = 3.5 + STEPS * STEP_GAP + 1;
  const fieldHalfW = (Math.max(...ROWS) + 0.5) * ROW_GAP;
  const corner = (along: number, lateral: number) => ({
    x: cx + Math.sin(fieldA) * along + Math.sin(rowDirA) * lateral,
    z: cz + Math.cos(fieldA) * along + Math.cos(rowDirA) * lateral,
  });
  const fenceCorners = [corner(fieldNear, -fieldHalfW), corner(fieldFar, -fieldHalfW), corner(fieldFar, fieldHalfW), corner(fieldNear, fieldHalfW)];
  for (let i = 0; i < fenceCorners.length; i++) {
    const a = fenceCorners[i];
    const b = fenceCorners[(i + 1) % fenceCorners.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const runs = Math.max(1, Math.round(len / 3.2));
    for (let k = 0; k < runs; k++) {
      const t0 = k / runs;
      const t1 = (k + 1) / runs;
      const mx = a.x + dx * (t0 + t1) * 0.5;
      const mz = a.z + dz * (t0 + t1) * 0.5;
      props.push({ kind: "fence", x: mx, z: mz, yaw: Math.atan2(dx, dz), scale: (len / runs) * 0.94 });
    }
  }
  // the geology station: a little instrument hut the volcanologists set up to watch the mountain,
  // off to the side of the farmhouse
  const geoA = houseA - 1.1;
  const geo = { x: cx + Math.sin(geoA) * 13, z: cz + Math.cos(geoA) * 13 };
  props.push({ kind: "seismograph", x: geo.x, z: geo.z, yaw: geoA + Math.PI, scale: 1 });

  // the trailhead flags, right at the farm's own edge, facing the volcano
  const trailhead = PARICUTIN_TRAILHEAD;
  props.push({ kind: "trailhead-flags", x: trailhead.x, z: trailhead.z, yaw: towardCone, scale: 1 });

  const chase = { x: cx + Math.sin(awayFromCone + 2.1) * 9, z: cz + Math.cos(awayFromCone + 2.1) * 9 };

  const nodes: SettlementNode[] = [{ id: "fire", x: fire.x, z: fire.z }];
  const edges: [number, number][] = [];
  const addNode = (id: string, x: number, z: number) => {
    nodes.push({ id, x, z });
    return nodes.length - 1;
  };
  huts.forEach((h, i) => {
    const doorX = h.x - Math.sin(h.yaw) * (h.size * 3.2);
    const doorZ = h.z - Math.cos(h.yaw) * (h.size * 3.2);
    const idx = addNode(`home-${i}`, doorX, doorZ);
    edges.push([0, idx]);
  });
  const geoIdx = addNode("geo", geo.x, geo.z);
  edges.push([0, geoIdx]);
  const scarecrowIdx = addNode("field", scarecrow.x, scarecrow.z);
  edges.push([0, scarecrowIdx]);
  const chaseIdx = addNode("chase", chase.x, chase.z);
  edges.push([0, chaseIdx]);
  const trailIdx = addNode("trailhead", trailhead.x, trailhead.z);
  edges.push([0, trailIdx]);

  const work: SettlementWorkSpot[] = [
    { id: "fire", x: fire.x, z: fire.z, face: 0, sit: true },
    { id: "geo", x: geo.x, z: geo.z, face: geoA },
    { id: "field", x: scarecrow.x, z: scarecrow.z, face: fieldA },
    { id: "chase", x: chase.x, z: chase.z, face: 0 },
  ];

  const S = (from: number, act: SettlementAct, spot?: string): SettlementSlot => ({ from, act, spot });
  interface RosterEntry {
    id: string;
    name: string;
    kid?: boolean;
    elder?: boolean;
    talk?: boolean;
    home: number;
    sched: SettlementSlot[];
    pair?: number;
    look?: Partial<Pick<SettlementVillagerDef, "skin" | "hair" | "cloth" | "hairStyle" | "body">>;
  }
  const ROSTER: RosterEntry[] = [
    { id: "dionisio", name: "Farmer Dionisio", elder: true, talk: true, home: 0, sched: [S(0, "home"), S(5.5, "wander"), S(8, "look", "field"), S(12, "sit", "fire"), S(15, "look", "field"), S(18.2, "sit", "fire"), S(22, "home")], look: { hairStyle: 2, body: 2 } },
    { id: "paula", name: "Paula", talk: true, home: 0, sched: [S(0, "home"), S(6, "cook", "fire"), S(10, "wander"), S(13.4, "cook", "fire"), S(17, "sit", "fire"), S(21.6, "home")] },
    { id: "nina", name: "the volcanologist Nina", talk: true, home: 1, sched: [S(0, "home"), S(7, "look", "geo"), S(11, "look", "geo"), S(14.5, "wander"), S(16.8, "look", "geo"), S(19.2, "sit", "fire"), S(22.2, "home")], look: { body: 1 } },
    { id: "luz", name: "Luz", kid: true, talk: true, pair: 0, home: 0, sched: [S(0, "home"), S(7.5, "chase", "chase"), S(11, "wander"), S(14, "chase", "chase"), S(18.4, "sit", "fire"), S(21, "home")] },
    { id: "tomas", name: "Tomás", kid: true, talk: true, pair: 1, home: 0, sched: [S(0, "home"), S(7.8, "chase", "chase"), S(11.2, "wander"), S(14.3, "chase", "chase"), S(18.5, "sit", "fire"), S(21.2, "home")], look: { hairStyle: 0 } },
  ];
  const SKINS_N = 7;
  const HAIRS_N = 8;
  const CLOTHS_N = 7;
  const roster: SettlementVillagerDef[] = ROSTER.map((e, i) => {
    const seed = 15000 + i * 151;
    const rnd = rngOf(seed);
    const jitter = e.talk ? 0 : (rnd() - 0.5) * 0.6;
    const schedule = e.sched.map((s, k) => ({ ...s, from: k === 0 ? s.from : Math.max(0, Math.min(23.9, s.from + jitter)) }));
    const look = e.look ?? {};
    return {
      id: e.id,
      name: e.name,
      home: e.home % Math.max(1, huts.length),
      kid: !!e.kid,
      elder: !!e.elder,
      seed,
      schedule,
      skin: look.skin ?? i % SKINS_N,
      hair: look.hair ?? (i * 3 + 2) % HAIRS_N,
      cloth: look.cloth ?? (i * 5 + 1) % CLOTHS_N,
      hairStyle: look.hairStyle ?? (e.kid ? i % 2 : i % 3),
      body: look.body ?? (e.elder ? 2 : 0),
      talk: e.talk ? e.id : undefined,
      pair: e.pair ?? i % 2,
    };
  });

  const talk: SettlementTalkLines[] = [
    {
      id: "dionisio",
      name: "Farmer Dionisio",
      lines: [
        "This was my cornfield, right up until the day the ground cracked open!",
        "On 20 February 1943, smoke and ash started pouring out of a crack, right over there.",
        "By the next morning, a little hill of cinders stood taller than my barn!",
        "Everyone from the village got out safely — a volcano is scary, but we had time to go.",
      ],
    },
    {
      id: "paula",
      name: "Paula",
      lines: ["We still grow corn right up to the edge of the old lava — the ash makes the soil rich!", "You can smell the warm, dusty smell of the cone on a still day.", "Try the climb to the crater — Nina will tell you all about it on the way."],
    },
    {
      id: "nina",
      name: "the volcanologist Nina",
      lines: ["I watch the volcano's every mood with my instruments — scientists call that seismology.", "Parícutin grew about 336 m tall in its very first year — astonishingly fast for a mountain!", "It kept erupting for nine whole years, until 1952 — then it finally went quiet."],
    },
    {
      id: "luz",
      name: "Luz",
      lines: ["Race you to the scarecrow!", "Tomás says the volcano is scary, but I think it's exciting!", "Nina let me look through her instruments once — the mountain is always a little bit shaking."],
    },
    {
      id: "tomas",
      name: "Tomás",
      lines: ["I'm not scared, I just like staying close to Mama, that's all!", "There's a whole church tower poking out of the lava — we can walk right up to it!", "Climb to the crater with me — the guide knows the whole story."],
    },
  ];

  const activities: SettlementActivitySpot[] = [{ id: "climb-paricutin", x: trailhead.x, z: trailhead.z, r: 10, label: "Climb to the crater!", emoji: "\u{1F30B}" }];

  const obstacles: SettlementObstacle[] = [
    ...huts.map((h) => ({ x: h.x, z: h.z, r: h.size * 5.2 })),
    { x: fire.x, z: fire.z, r: 1.9 },
    { x: scarecrow.x, z: scarecrow.z, r: 1 },
    { x: plough.x, z: plough.z, r: 1.6 },
    { x: geo.x, z: geo.z, r: 1.4 },
    { x: donkey.x, z: donkey.z, r: 1.1 },
  ];

  return {
    id: "paricutin-farm",
    name: "Dionisio's Farm",
    clan: "the Pulido family",
    emoji: "\u{1F33D}",
    style: "farm",
    x: cx,
    z: cz,
    radius,
    padHeight,
    stationId: "plains-station",
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
    fauna: [{ id: "donkey", kind: "yak", x: donkey.x, z: donkey.z, yaw: fieldA + Math.PI, scale: 0.8 }] as SettlementFauna[],
    decks: [],
    levelPatches: [],
  };
}

export { generateFarm };

/** a quick reference used by tests and the raw-ground facts (the real cone's own facts quote the
 *  real mountain's figures, not these engine units) */
export function paricutinHeightAt(x: number, z: number): number {
  return paricutinY(x, z, rawHeight(x, z)) ?? rawHeight(x, z);
}
