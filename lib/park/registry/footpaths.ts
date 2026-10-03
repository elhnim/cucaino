// Short dirt footpaths linking a Wildlands settlement straight to its own railway station — split
// out just like ./cartRoad.ts, and for the same reason: registry/terrain.ts and
// world/fantasy/{mask,wilds}.ts need to level/colour/avoid these without pulling in anything that
// would import terrain.ts back (this module only touches settlements.ts, railway.ts and
// wildWater.ts, none of which import terrain.ts, so it stays safely acyclic).
//
// Lakeside doesn't need one of these: its cart road (./cartRoad.ts) already runs a level crossing
// right past Great Lake Station on its way in. Every OTHER settlement with a `stationId` gets a
// plain village-edge -> station path here, walked by the kid and by the new train-riding traders
// (world/trade/plan.ts).
//
// Pure data + maths, deterministic, no three.js.
import { nearestOnPolyline, smooth, type P2 } from "./geom2d";
import { SETTLEMENTS } from "./settlements";
import { STATIONS } from "./railway";
import { wildWaterSdf } from "./wildWater";

/** nudge a path's points clear of the Wildlands' water, climbing the water-distance field uphill
 *  until they're dry again — the same trick cartRoad.ts's pushDry uses */
export function pushPathDry(points: P2[], margin = 3, iterations = 40): P2[] {
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

export interface SettlementFootpath {
  settlementId: string;
  stationId: string;
  points: P2[];
}

export const FOOTPATHS: SettlementFootpath[] = SETTLEMENTS.filter((s) => s.stationId && s.id !== "lakeside").map((s) => {
  const st = STATIONS.find((x) => x.id === s.stationId);
  if (!st) throw new Error(`footpaths: ${s.id} names a station that doesn't exist (${s.stationId})`);
  const dx = st.x - s.x;
  const dz = st.z - s.z;
  const l = Math.hypot(dx, dz) || 1;
  // just outside the village's own pad, straight towards its station
  const edge: P2 = [s.x + (dx / l) * (s.radius + 6), s.z + (dz / l) * (s.radius + 6)];
  const raw = smooth([edge, [st.x, st.z]], 10);
  return { settlementId: s.id, stationId: s.stationId, points: pushPathDry(raw) };
});

export function footpathOf(settlementId: string): SettlementFootpath | undefined {
  return FOOTPATHS.find((f) => f.settlementId === settlementId);
}

/** is (x, z) within `pad` of any settlement's footpath (its own tread is ~2 m wide) */
export function nearFootpath(x: number, z: number, pad = 0): boolean {
  for (const f of FOOTPATHS) if (nearestOnPolyline(f.points, x, z).d < 1.6 + pad) return true;
  return false;
}
