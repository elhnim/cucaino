// The Lakeside <-> Market Street cart road: split out of registry/trade.ts (which it would
// otherwise form a cycle with) purely so registry/terrain.ts and world/fantasy/{mask,wilds}.ts can
// level and colour it and keep trees off it without pulling in registry/harbours.ts (which needs
// terrain.ts's groundY at its own module scope — terrain.ts -> trade.ts -> harbours.ts ->
// terrain.ts would be circular). trade.ts re-exports everything here, so nothing outside these two
// files needs to know the split exists.
//
// Pure data + maths, deterministic, no three.js. Must NOT import registry/terrain.ts or
// registry/harbours.ts.
import { smooth, nearestOnPolyline, type P2 } from "./geom2d";
import { SETTLEMENTS } from "./settlements";
import { LAND_ENTRANCE } from "./island";
import { RAIL_POINTS, STATIONS, railIndexAt, stationAt } from "./railway";
import { WILD_LAKE, wildWaterSdf } from "./wildWater";

const LAKESIDE = SETTLEMENTS.find((s) => s.id === "lakeside");
if (!LAKESIDE) throw new Error("cartRoad: no lakeside settlement");
const PARK_STATION = STATIONS.find((s) => s.id === "park-station");
const LAKE_STATION = STATIONS.find((s) => s.id === "lake-station");
if (!PARK_STATION || !LAKE_STATION) throw new Error("cartRoad: park-station / lake-station missing from the railway");

// ── Lakeside's road end: the village's edge on the dry, inland side (away from the lake), where
// the cart road arrives — away from the water in every direction the lake actually reaches ──
export const LAKESIDE_ROAD_END: P2 = (() => {
  const dx = LAKESIDE.x - WILD_LAKE.x;
  const dz = LAKESIDE.z - WILD_LAKE.z;
  const l = Math.hypot(dx, dz) || 1;
  const r = LAKESIDE.radius + 10;
  return [LAKESIDE.x + (dx / l) * r, LAKESIDE.z + (dz / l) * r];
})();
export const MARKET_ROAD_END: P2 = LAND_ENTRANCE["market"];

/** the perpendicular (x, z) at point i of a polyline (for offsetting sideways) */
function perpAt(points: P2[], i: number): { px: number; pz: number } {
  const a = points[i];
  const b = points[Math.min(points.length - 1, i + 1)];
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  return { px: dz / l, pz: -dx / l };
}

/** how far the search looks for a dry spot, closest to the previous point's own offset first (so
 *  the road's distance from the rail changes gradually — never a jump — and it only crosses the
 *  rail, offset 0, where that's genuinely the nearest dry ground) */
const OFFSET_DELTAS = (() => {
  const ds = [0];
  for (const d of [1, 2, 3, 5, 8, 12, 18, 25, 35, 45, 60, 75]) ds.push(d, -d);
  return ds;
})();
/** never closer to the rail than this (its ballast is ~1.7 wide; this leaves walking room) */
const MIN_OFFSET = 9;

/** nudge any point the smoothing pass (Catmull-Rom can cut a corner) left too close to the
 *  Wildlands' water back out, climbing the water-distance field until it's dry again — the same
 *  "shrink/nudge till it's dry" idea as settlements.ts's dryPoint, just walking uphill instead */
function pushDry(points: P2[], margin = 4.5, iterations = 60): P2[] {
  return points.map(([x0, z0]) => {
    let x = x0;
    let z = z0;
    for (let i = 0; i < iterations && wildWaterSdf(x, z) < margin; i++) {
      const h = 1.4;
      const gx = wildWaterSdf(x + h, z) - wildWaterSdf(x - h, z);
      const gz = wildWaterSdf(x, z + h) - wildWaterSdf(x, z - h);
      const l = Math.hypot(gx, gz) || 1;
      x += (gx / l) * 1.1;
      z += (gz / l) * 1.1;
    }
    return [x, z] as P2;
  });
}

export interface CartRoad {
  points: P2[];
  /** where the road crosses the rail (switches side) — at most a couple, per the spec */
  crossings: P2[];
}

/** offset a stretch of the railway loop (from rail index i0 to i1) into a dirt road alongside it:
 *  at every point, the nearest dry offset to where the road already was — so its distance from the
 *  rail changes gradually, and it only crosses to the other side (a "level crossing") where that's
 *  genuinely the closest dry ground. On this route that stays a single consistent side the whole
 *  way (just widening where the Wildlands Railway's own trestle crosses the Wild River —
 *  registry/wildWater.ts — since the road can't use a train bridge and has to find its own way
 *  across): the mechanism is kept general so a future route that does need to cross still can. */
function offsetAlongRail(i0: number, i1: number, startOffset: number): CartRoad {
  const dryAt = (x: number, z: number) => wildWaterSdf(x, z) > 4.5 && !stationAt(x, z, 10);
  let offset = startOffset;
  const vias: P2[] = [];
  const crossings: P2[] = [];
  const STEP = 2; // every 2nd rail sample (~6 m): fine enough that the offset never has to leap
  for (let i = i0; i <= i1; i += STEP) {
    const { px, pz } = perpAt(RAIL_POINTS, i);
    const [x, z] = RAIL_POINTS[i];
    let found: P2 | null = null;
    let foundOff = offset;
    for (const d of OFFSET_DELTAS) {
      const cand = offset + d;
      if (Math.abs(cand) < MIN_OFFSET) continue;
      const p: P2 = [x + px * cand, z + pz * cand];
      if (dryAt(p[0], p[1])) {
        found = p;
        foundOff = cand;
        break;
      }
    }
    if (Math.sign(foundOff) !== Math.sign(offset) && found) crossings.push([x, z]);
    offset = foundOff;
    // (every point on this route has a dry spot within OFFSET_DELTAS — fail safe rather than
    // throw, so a future route never crashes the registry on a trickier crossing)
    vias.push(found ?? [x + px * offset, z + pz * offset]);
  }
  return { points: pushDry(smooth(vias, 6)), crossings };
}

function buildCartRoad(): CartRoad {
  const i0 = railIndexAt(PARK_STATION!.s).i;
  const i1 = railIndexAt(LAKE_STATION!.s).i;
  const wild = offsetAlongRail(i0, i1, -12);

  // into the park: Market Street's own trail entrance, straight to where the Wildlands offset
  // begins (the park's own grass here is flat and dry — no need for the full dry-land search).
  // That stretch passes close by the line on its way in, right by Park Station itself — a level
  // crossing there, same as the one by Lake Station at the other end (both are real, ordinary
  // level crossings at a station, not a surprise mid-route one).
  const approach = smooth([MARKET_ROAD_END, wild.points[0]], 6);
  // Lakeside's own road end
  const arrival = smooth([wild.points[wild.points.length - 1], LAKESIDE_ROAD_END], 8);
  const crossings = [...wild.crossings, [PARK_STATION!.x, PARK_STATION!.z] as P2, [LAKE_STATION!.x, LAKE_STATION!.z] as P2];

  return { points: [...approach, ...wild.points.slice(1, -1), ...arrival], crossings };
}
export const CART_ROAD: CartRoad = buildCartRoad();

/** is (x, z) within `pad` of the cart road (its own tread is ~3 m wide) — the Wildlands' trees and
 *  rocks keep off it, same as they keep off the railway */
export function nearCartRoad(x: number, z: number, pad = 0): boolean {
  return nearestOnPolyline(CART_ROAD.points, x, z).d < 2 + pad;
}
