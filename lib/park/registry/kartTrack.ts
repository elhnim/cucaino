// Cucaino Karts' site: just outside the park, near Park Station — open, gentle, dry ground, clear
// of every other place, the railway, the cart road, the trails and the water. Written just like
// registry/town.ts: a deterministic search on the REAL, unlevelled ground (registry/landform.ts),
// run once (by a test, and by this file's own debug script — never at module load: see TOWN_SITE's
// own comment for why), with the result kept as a plain numeric constant below.
//
// The race itself runs entirely in the track's own LOCAL space (lib/park/karts/track.ts) — a
// self-contained light scene, like mini golf's own hole-local coordinates, never world (x, z). This
// file's only job is placing that shape (and its scenery) somewhere real: a site, a rotation, and
// the local -> world transform the outdoor scenery (lib/park/world/karts/index.ts) and the
// "go-karts" door (registry/places.ts) need.
import { buildKartTrackShape } from "../karts/track";
import { seaDist, nearTrail } from "./island";
import { nearRail, STATIONS } from "./railway";
import { nearCartRoad } from "./cartRoad";
import { naturalSlopeAt, smoothedHeight } from "./landform";
import { PLACES, placeFootprint } from "./places";

const TAU = Math.PI * 2;
const PARK_STATION = STATIONS.find((s) => s.id === "park-station");
if (!PARK_STATION) throw new Error("kartTrack: no park-station in the railway registry");

/** how far outside the track's own kerb the run-off (kerbs, tyre walls, hay bales) needs clear
 *  ground — everything this registry keeps clear of the track uses the circuit's edge plus this */
export const KART_RUNOFF = 7;

/** the track's local footprint: its centerline points (lib/park/karts/track.ts), sampled sparsely
 *  (a site search doesn't need every one of ~190 points — every 5th is plenty to catch a corner
 *  poking into something it shouldn't) */
function footprintSamples(): { x: number; z: number }[] {
  const shape = buildKartTrackShape();
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < shape.points.length; i += 5) out.push({ x: shape.points[i][0], z: shape.points[i][1] });
  return out;
}

/** rotate a local (x, z) by `rot` radians and offset it onto the site — plain 2D rotation (this is
 *  a coordinate transform, not a heading, so the ordinary cos/sin-rotation-matrix convention is
 *  used here rather than the park's usual sin=x/cos=z heading convention) */
export function kartLocalToWorld(site: { x: number; z: number }, rot: number, local: { x: number; z: number }): { x: number; z: number } {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return { x: site.x + local.x * c - local.z * s, z: site.z + local.x * s + local.z * c };
}

/** is this candidate site (at this rotation) clear of everything a kart track must avoid? */
function siteIsClear(site: { x: number; z: number }, rot: number, samples: { x: number; z: number }[]): boolean {
  for (const p of samples) {
    const w = kartLocalToWorld(site, rot, p);
    if (seaDist(w.x, w.z) > -25) return false; // solidly dry, a healthy margin from the coast
    if (nearRail(w.x, w.z, 15)) return false;
    if (nearCartRoad(w.x, w.z, 12)) return false;
    if (nearTrail(w.x, w.z, 8)) return false;
    if (naturalSlopeAt(w.x, w.z) > 0.55) return false; // the real ground stays gentle under it
    for (const place of PLACES) {
      if (place.land === "karts") continue; // the track's own land/door — not an obstacle to itself
      const at = placeFootprint(place);
      if (Math.hypot(w.x - at.x, w.z - at.z) < place.radius + 40) return false;
    }
  }
  return true;
}

export interface KartTrackSite {
  x: number;
  z: number;
  /** how the local track is turned to sit on this site (plain 2D rotation, see kartLocalToWorld) */
  rotation: number;
}

/** a deterministic search for the track's site: 190-360 m from the plaza (clearly outside the
 *  park proper), within 190 m of Park Station (an easy walk), with the WHOLE track footprint
 *  (not just its centre) clear of every park place, the railway, the cart road, the trails and
 *  the water, on real ground gentle enough that levelling it reads as natural, not dug out. The
 *  circuit's own footprint (~65 m across) is big enough that the CENTRE clearing everything isn't
 *  enough — a handful of rotations are tried at every candidate centre too, since a track that
 *  doesn't fit facing the station often fits perfectly well turned a little. */
export function findKartTrackSite(): KartTrackSite {
  const samples = footprintSamples();
  let best: { x: number; z: number; rotation: number; score: number } | null = null;
  for (let a = 0; a < TAU; a += 0.025) {
    for (let rad = 190; rad <= 360; rad += 5) {
      const x = Math.sin(a) * rad;
      const z = Math.cos(a) * rad;
      const distToStation = Math.hypot(x - PARK_STATION!.x, z - PARK_STATION!.z);
      if (distToStation > 190) continue;
      const faceStation = Math.atan2(PARK_STATION!.x - x, PARK_STATION!.z - z);
      for (let ri = 0; ri < 24; ri++) {
        const rot = (ri / 24) * TAU;
        if (!siteIsClear({ x, z }, rot, samples)) continue;
        // prefer close to the station, close to the middle of the 170-300 band, and a rotation
        // that leaves the pit/entrance side turned roughly back towards the station (so the
        // footpath in — built from this same site — stays short and makes sense on the ground)
        let misalign = Math.abs(rot - faceStation) % TAU;
        if (misalign > Math.PI) misalign = TAU - misalign;
        const score = -distToStation * 0.6 - Math.abs(rad - 260) * 0.15 - misalign * 12;
        if (!best || score > best.score) best = { x, z, rotation: rot, score };
      }
    }
  }
  if (!best) throw new Error("kartTrack: no site found near Park Station");
  return { x: Math.round(best.x * 10) / 10, z: Math.round(best.z * 10) / 10, rotation: Math.round(best.rotation * 1000) / 1000 };
}

/** the site findKartTrackSite() picks, worked out once and kept here (kartTrack.test.ts re-runs
 *  the search and checks it still lands exactly here — the search itself samples the real ground
 *  at thousands of candidates x rotations and is far too slow to run on every park load, same
 *  reasoning as registry/town.ts's TOWN_SITE) */
export const KART_SITE = { x: 279.2, z: -95.4 };
export const KART_ROTATION = 6.021;

/** the track's own shared "pad" height — like a settlement's settlePadHeight, ONE height for the
 *  whole loop, so a long thin circuit (660 units round) reads as a real, smoothly graded race track
 *  (not perfectly flat to the metre, but one level, like a settlement's pad) rather than either
 *  digging a canyon (forcing the actual world Y to 0 when the site's real ground sits well above it)
 *  or floating (the outdoor ribbon mesh — lib/park/world/karts/index.ts — has no per-vertex height
 *  of its own, so terrain.ts's stamps and the renderer's flat Y must agree on the same one number) */
export const KART_PAD_HEIGHT = smoothedHeight(KART_SITE.x, KART_SITE.z);

/** the track's shape, once, in WORLD space (local points carried through kartLocalToWorld) — used
 *  by the outdoor scenery (lib/park/world/karts/index.ts), terrain levelling and the keep-out
 *  helpers below. Not used by the race itself (it stays in local space, like mini golf's room). */
export interface KartTrackWorld {
  points: { x: number; z: number }[];
  width: number;
  site: { x: number; z: number };
  rotation: number;
}
let _world: KartTrackWorld | null = null;
export function kartTrackWorld(): KartTrackWorld {
  if (_world) return _world;
  const shape = buildKartTrackShape();
  const points = shape.points.map(([x, z]) => kartLocalToWorld(KART_SITE, KART_ROTATION, { x, z }));
  _world = { points, width: shape.width, site: KART_SITE, rotation: KART_ROTATION };
  return _world;
}

/** is (x, z) within `pad` of the kart track's road (its own tread, like nearCartRoad/nearRail) —
 *  for terrain levelling, tree/rock keep-out and the map */
export function nearKartTrack(x: number, z: number, pad = 0): boolean {
  const { points, width } = kartTrackWorld();
  const half = width / 2 + pad;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const l2 = ex * ex + ez * ez || 1;
    const u = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2));
    const dx = a.x + ex * u - x;
    const dz = a.z + ez * u - z;
    if (dx * dx + dz * dz < half * half) return true;
  }
  return false;
}

/** the whole site's outer radius (track footprint + run-off + a little more) — for anything that
 *  just wants a single cheap "is this anywhere near the kart track" disc test (the map pin, far
 *  keep-out checks) instead of nearKartTrack()'s exact-to-the-road one */
export const KART_SITE_RADIUS = 120;
