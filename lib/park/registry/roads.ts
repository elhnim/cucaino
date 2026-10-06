// The island's road network (Agent R): a drivable ring round the Wildlands plus spurs, joining every
// railway station, every settlement, the kart track and the land-bound Natural Wonders — so a kid in
// a jeep can explore the big island by road instead of driving anywhere at all (including straight up
// a mountain). Real-ground routed: every leg below was found by sampling registry/landform.ts's
// rawHeight/smoothedHeight along a hand-walked line (same discipline as registry/cartRoad.ts's own
// offset search), then relaxed with a two-sided grade-capped smoothing pass (the same idea as
// terrain.ts's railHeights(), extended to also cap climbs, not just drops — a one-way mountain
// approach has a real net rise a closed rail loop never does) so no stretch exceeds about a 9.5%
// grade. Two stretches that would have had to climb a genuine mountain (the Great Ridge, right behind
// the park; a real ~50 m shoulder of the Lone Peak on the Highstone spur) are bored as tunnels
// instead; two water crossings (the Wild River — the grand one — and the Great Lake's outlet) are
// bridges.
// The search was run once in a scratch script (scripts/smoke isn't the place for a one-off generator;
// this file's own comments below record the inputs) and its result is frozen here as plain numbers,
// exactly like registry/town.ts's TOWN_SITE or registry/kartTrack.ts's KART_SITE — nothing heavy runs
// at import time. roads.test.ts re-derives every frozen number from the live registries and re-checks
// grades, clearances and connectivity.
//
// LEAF MODULE: only geom2d.ts is imported at top level (for P2 typing and the tiny polyline-distance
// helper). Settlements/wonders/terrain/grandCanyon/paricutin are NOT imported here (that would risk
// the same import-cycle trap registry/settlements.ts warns about) — every destination's frozen
// coordinate below is a plain copied number, cross-checked against the live registries by
// roads.test.ts, exactly the way registry/cartRoad.ts keeps its own copy of the Great Lake Jetty's tip.
import { nearestOnPolyline, type P2 } from "./geom2d";

export type RoadKind = "road" | "bridge" | "tunnel";

/** a frozen, already grade-relaxed road point: y is the LEVELLED bed height (not the natural
 *  ground), ready for terrain.ts to stamp directly — no per-point computation needed at all */
export interface RoadPoint {
  x: number;
  z: number;
  y: number;
}

export interface RoadSeg {
  id: string;
  /** which named road this piece belongs to (for signs/the map; several ids can share one name) */
  road: string;
  kind: "road";
  points: RoadPoint[];
}

export interface RoadBridge {
  id: string;
  name: string;
  road: string;
  style: "grand" | "simple" | "overpass";
  x: number;
  z: number;
  /** heading along the span (radians about +Y; forward = (sin h, cos h)) */
  heading: number;
  span: number;
  half: number;
  y0: number;
  y1: number;
  rise: number;
  piers: number;
}

export interface RoadTunnel {
  id: string;
  name: string;
  road: string;
  x0: number;
  z0: number;
  y0: number;
  x1: number;
  z1: number;
  y1: number;
  half: number;
  /** headroom kept between the deck and the (real, un-carved) ground above it at the crown */
  clear: number;
}

export interface CarPark {
  id: string;
  x: number;
  z: number;
  y: number;
  /** which way the bays face (radians about +Y) */
  heading: number;
  r: number;
  /** destinations this car park serves (for its signboard) */
  serves: string[];
  jeeps: number;
}

export interface RoadJunction {
  id: string;
  x: number;
  z: number;
  /** the roundabout's own flat bed height — terrain.ts stamps the whole ring + island disc to this
   *  (round 4: it never had its own stamp at all, so the ring itself showed real terrain poking
   *  through, "bites out of it") */
  y: number;
  /** names to show on the junction's fingerpost, each with the heading to point along */
  signs: { label: string; heading: number }[];
}

/** half the drivable bed's width (kerb to kerb ~9.2 units — two jeeps pass; CLAUDE.md: a kid is
 *  2.26 units tall, 1 m ~= 1.6 units) */
export const ROAD_HALF = 4.6;
/** the extra sliding room past the kerb before a car is turned back (the "shoulder") */
export const ROAD_SHOULDER = -0.7; // (negative: the car's CENTRE stays this far inside the asphalt edge, so its wheels stay on the road)
/** the full drivable corridor's half-width (kerb + shoulder) */
export const ROAD_CORRIDOR_HALF = ROAD_HALF + ROAD_SHOULDER;

/** how far above the GROUND the road's ribbon is drawn (world/roads drapes it over the real,
 *  rendered ground at every vertex, so this is only a z-fighting clearance) */
export const ROAD_SURFACE_LIFT = 0.09;

/** half the WIDTH of the flat, levelled bed terrain.ts stamps under every road point — wide enough
 *  that the ribbon's own edges (at ROAD_HALF) sit well inside the flat region, with the falloff back
 *  to natural ground pushed out past that (inner = flat, full strength; outer = natural ground) */
export const ROAD_BED_INNER = ROAD_HALF + 3;
export const ROAD_BED_OUTER = ROAD_HALF + 11;

/** every roundabout's own outer/inner radius — wide enough that two roads leaving a hub only ~30
 *  degrees apart (the closest pair, at Park Station) still clear each other's own half-width (4.6)
 *  by the time they reach the ring: at radius 14 a 30-degree gap is only ~7.3 units of arc, narrower
 *  than two roads side by side; 22 gives ~11.5, comfortably clear. Shared by world/roads/index.ts
 *  (the ring/island mesh and the ribbon-trim) and terrain.ts (the ring's own flat-bed stamp). */
export const ROUNDABOUT_OUTER = 22;
export const ROUNDABOUT_INNER = 15;

/** densify a frozen (sparse) road polyline so consecutive points are at most `maxD` apart, by linear
 *  interpolation — shared by terrain.ts (stamping a flat bed under the whole ribbon) and
 *  world/roads/index.ts (the ribbon's own geometry), so the two always agree on exactly which points
 *  the ground is levelled under. Pure, leaf-module safe (no groundY/THREE import). */
export function densifyRoad(raw: readonly RoadPoint[], maxD = 2.5): RoadPoint[] {
  const out: RoadPoint[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1];
    const b = raw[i];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(d / maxD));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

// ── frozen leg data (x, z, y) — see the file banner for how these were found ──
/* prettier-ignore */
const PTS_RING_J_H1: [number, number, number][] = [[548.3,-264.4,7.9],[547.2,-271.9,7.81],[545.5,-279.4,7.63],[543.1,-286.9,7.56],[540.2,-294.4,7.47],[536.6,-301.9,7.43],[533,-309.4,7.29],[529.8,-316.9,6.86],[527,-324.4,6.5],[524.4,-331.9,6.65],[523.8,-339.4,6.74],[525.6,-346.9,7.07],[530,-354.4,7.39],[536.9,-361.9,7.6],[544.4,-369.1,7.9],[551.9,-376.1,7.98],[559.4,-382.7,7.98],[566.9,-389.1,8.23],[574.4,-394.1,7.89],[581.9,-397.7,7.83],[589.4,-399.6,8],[596.9,-400,8.07],[604.1,-400.9,8.36],[611.1,-403.1,8.74],[617.7,-406.6,8.97],[624.1,-411.3,8.82],[630.1,-416.7,8.68],[635.8,-422.8,8.22],[641.2,-429.5,8.31],[646.3,-436.9,8.43],[651.7,-443.9,8.29],[657.8,-450.3,8.54],[664.5,-456.1,9.13],[671.9,-461.3,9.24],[679.4,-466.3,9.19],[686.9,-471.3,9.26],[694.4,-476.3,9.32],[701.9,-481.3,9.51],[709.4,-484.8,9.56],[717.1,-486.3,9.69],[724.9,-485.8,9.5],[732.7,-483.4,9.27],[741.6,-480,9.67],[746.5,-478.2,9.99],[752.9,-482.9,10.91],[759.1,-487.5,11.79],[765.3,-492.2,12.69],[771.3,-496.9,12.92],[777.3,-501.5,12.45],[783.2,-506.2,11.77],[788.9,-510.8,10.93],[794.5,-515.4,10.12],[800,-520,9.78],[806.4,-525.6,9.33],[812.7,-531.3,9.65],[818.7,-537.2,9.79],[824.6,-543.1,9.82],[830.3,-549,10.68],[835.9,-555,11.63],[841.3,-560.9,12.55],[846.7,-566.7,13.01],[851.9,-572.4,13.15],[857.1,-577.9,13],[862.3,-583.3,12.86],[867.3,-588.4,12.94],[872.4,-593.3,12.7],[877.5,-597.8,12.47],[883.7,-603,11.86],[891.4,-608.9,11.3],[899.2,-614.4,10.84],[907.1,-619.5,11.04],[914.8,-624.3,10.79],[922.1,-628.6,10.71],[929,-632.6,10.84],[935.3,-636.1,10.86],[940.7,-639.2,11.54],[945.2,-641.9,12.11],[947,-643,12.35],[919.8,-672.4,13.93]];
/* prettier-ignore */
const PTS_RING_H0_J: [number, number, number][] = [[150,-112,3.26],[151.2,-104.5,3.18],[152.8,-94,2.9],[154.5,-86.1,2.85],[156.9,-78.3,1.99],[159.8,-70.7,1.13],[163.4,-63.1,0.4],[166.7,-55.6,0.4],[169.4,-48.1,0.4],[171.4,-40.6,0.4],[172.8,-33.1,0.4],[174.5,-25.9,0.4],[176.9,-18.9,0.4],[179.8,-12.3,0.4],[183.4,-5.9,0.4],[189.5,2,0.4],[196.3,7.9,0.4],[203.5,12,0.4],[208.9,16.4,0.4],[212.8,23.4,0.4],[217,29.1,0.4],[224.8,34.7,0.4],[231.9,38.4,0.4],[238.2,42.4,0.4],[244.8,49,0.4],[247.8,56.3,0.4],[251.9,63.1,0.76],[260.5,64.8,1.49],[268.3,62.7,2.28],[278.1,58.4,2.62],[285.5,54.5,2.72],[292.2,49.5,3.01],[298.3,43.7,3.14],[303.8,36.9,3.66],[308.5,29.7,3.96],[312.3,23.8,4.1],[316.3,17.2,4.79],[320.2,9.7,5.67],[324.4,1.3,6.66],[329.1,-5.5,7.53],[336.6,-10.2,7.97],[346.9,-12.8,8.03],[354.4,-14.5,8.27],[361.9,-16.9,9.08],[369.4,-19.8,9.37],[376.9,-23.4,9.46],[384.1,-27,9.42],[391.1,-30.2,8.84],[397.7,-33,8.08],[407,-37.2,7.53],[414.2,-43.8,7.41],[419.4,-53.1,7.2],[422,-60.5,7.21],[425.3,-67.7,7.55],[429.2,-74.5,7.59],[433.8,-80.9,7.51],[438.9,-87,7.25],[444.7,-92,6.93],[451.1,-96.2,6.56],[458.1,-99.4,6.19],[465.6,-102,6.07],[473.1,-105.3,6.21],[480.6,-109.2,6.23],[488.1,-113.8,5.79],[495.6,-118.8,5.68],[503.1,-123.8,5.62],[510.6,-128.8,4.91],[518.1,-133.8,4.93],[525.2,-138.9,5.16],[530.3,-144.7,5.18],[533.6,-151.1,5.51],[535,-158.1,5.83],[535.1,-165.6,6.16],[535.5,-173.1,6.48],[536.2,-180.6,6.81],[548.9,-195,7.13]];
/* prettier-ignore */
const PTS_RING_H1_H2A: [number, number, number][] = [[919.8,-672.4,13.93],[947,-643,12.346],[951.7,-642.5,11.99],[958.1,-641.7,12.45],[965.6,-640.8,12.25],[974,-639.9,11.99],[982.8,-638.9,12.07],[991.6,-637.9,12.24],[1000,-637,13.02],[1007.2,-636.2,13.75],[1014.5,-635.5,13.84],[1022,-634.7,13.65],[1029.6,-633.9,13.69],[1037.2,-633.2,13.62],[1044.8,-632.4,13.79],[1052.5,-631.7,13.48],[1060,-631,13.03],[1067.9,-630.3,12.12],[1076.4,-629.6,11.19],[1085.1,-628.8,11.24],[1093.8,-628.1,10.5],[1101.9,-627.5,9.57],[1109.2,-626.9,8.73],[1115.4,-626.4,8.01],[1120,-626,7.99]];
/* prettier-ignore */
const PTS_RING_H1_H2B: [number, number, number][] = [[1151.5,-623,5.99],[1156,-622.5,5.47],[1161.6,-621.8,4.82],[1168.1,-621.1,4.07],[1175.5,-620.3,3.44],[1183.4,-619.4,3.43],[1191.9,-618.4,4.19],[1200.8,-617.4,4.92],[1209.8,-616.4,4.3],[1218.9,-615.4,4.61],[1227.9,-614.4,4.92],[1236.7,-613.5,4.78],[1245.1,-612.6,4.69],[1252.9,-611.7,4.58],[1260,-611,4.58],[1268.7,-610.1,5.05],[1276.9,-609.4,5.87],[1284.6,-608.7,6.29],[1292.1,-608.1,6.35],[1299.4,-607.5,6.67],[1306.5,-606.9,6.94],[1313.6,-606.3,7.05],[1320.9,-605.7,6.99],[1328.3,-605.1,7.01],[1336,-604.4,7.3],[1343.8,-603.6,7.73],[1351.9,-602.9,8.66],[1360.6,-602,9.2],[1369.6,-601.1,8.99],[1378.7,-600.2,8.49],[1387.8,-599.3,7.45],[1396.6,-598.4,6.43],[1405,-597.5,5.96],[1412.7,-596.8,5.89],[1419.6,-596.1,5.46],[1425.4,-595.5,4.99],[1430,-595,5.01],[1431.6,-635,5.79]];
/* prettier-ignore */
const PTS_RING_H2_H3: [number, number, number][] = [[1431.6,-635,5.79],[1430,-595,5.01],[1432.7,-599.2,5.36],[1436.4,-605,5.66],[1440.8,-611.9,6.46],[1445.6,-619.4,6.89],[1450.6,-626.9,7.45],[1455.5,-634,8.44],[1460,-640,9.15],[1465.2,-646.9,8.72],[1470.1,-653.7,8.19],[1475,-659.9,7.28],[1480.4,-665.1,6.48],[1486.5,-668.8,6.25],[1493.2,-670.7,6.46],[1500,-671.4,7.2],[1507.3,-671.3,8],[1515.1,-670.3,8.9],[1523.2,-668.1,9.87],[1531.6,-664.7,10.5],[1540,-660,11.26],[1545.1,-656.5,11.46],[1550.4,-652.4,11.74],[1555.9,-647.8,11.75],[1561.5,-642.7,11.67],[1567.2,-637.2,11.96],[1572.8,-631.4,12.51],[1578.5,-625.4,13.36],[1584.1,-619.2,13.88],[1589.6,-612.8,13.76],[1594.9,-606.4,13.39],[1600,-600,13.28],[1604.5,-594.1,13.16],[1608.9,-587.9,12.45],[1613.2,-581.6,11.88],[1617.4,-575.2,11.32],[1621.5,-568.6,10.64],[1625.6,-561.9,9.74],[1629.7,-555.1,8.93],[1633.7,-548.1,8.5],[1637.7,-541.2,8.75],[1641.8,-534.1,8.96],[1645.9,-527.1,8.81],[1650,-520,8.66],[1653.9,-513.4,8.85],[1657.8,-506.5,9.35],[1661.7,-499.5,10.27],[1665.7,-492.4,11.2],[1669.7,-485.2,12],[1673.7,-478,11.99],[1677.6,-470.8,11.98],[1681.5,-463.6,11.48],[1685.4,-456.5,11.21],[1689.1,-449.6,11.01],[1692.9,-442.8,10.95],[1696.5,-436.3,10.51],[1700,-430,9.94],[1704.2,-422.5,9.72],[1708.4,-415.1,9.55],[1712.5,-407.9,9.28],[1716.5,-400.9,8.82],[1720.4,-394.1,8.76],[1724.2,-387.5,9.12],[1727.9,-381,9.93],[1731.5,-374.8,10.21],[1735,-368.7,10.04],[1738.3,-362.9,10.32],[1742.3,-356,10.14],[1747,-348.1,10.84],[1751.6,-340.3,11.21],[1755.9,-332.9,11.95],[1760,-326.1,12.06],[1763.6,-320,11.74],[1766.7,-314.9,11.3578],[1769,-311,11.856],[1729.8,-302.9,10.39]];
/* prettier-ignore */
const PTS_RING_H3_H4: [number, number, number][] = [[1729.8,-302.9,10.39],[1769,-311,11.856],[1767.8,-306.9,11.386],[1766.5,-302,11.04],[1764.9,-296.3,11.07],[1763.1,-289.9,11.13],[1761.1,-282.9,11.52],[1759,-275.4,11.63],[1756.7,-267.3,11.59],[1754.3,-258.7,11.93],[1751.7,-249.8,11.29],[1749.1,-240.5,10.17],[1746.4,-230.9,10.79],[1744.1,-222.9,10.99],[1742.3,-216.4,10.9],[1740.3,-209.6,11.02],[1738.3,-202.4,10.57],[1736.2,-195,10.57],[1734,-187.3,9.9],[1731.8,-179.5,8.97],[1729.5,-171.5,8.53],[1727.2,-163.4,7.97],[1724.9,-155.2,7.96],[1722.5,-147,8.61],[1720.2,-138.8,9.07],[1717.9,-130.6,8.96],[1715.6,-122.6,8.81],[1713.3,-114.7,8.36],[1711.2,-106.9,7.44],[1709,-99.3,6.77],[1707,-92,6.58],[1705,-85,6.97],[1702.7,-76.7,7.63],[1700.4,-68.5,7.81],[1698.2,-60.6,7.99],[1696.1,-52.9,7.85],[1694,-45.3,7.37],[1692,-37.8,6.78],[1690,-30.4,6.35],[1688,-23.1,6.14],[1686,-15.9,5.47],[1684.1,-8.6,4.82],[1682.1,-1.4,4.21],[1680.1,5.8,3.91],[1678.1,13.1,3.95],[1676.1,20.5,3.19],[1674,28,3.34],[1671.9,35.5,4.18],[1669.8,43.1,4.42],[1667.7,50.6,4.74],[1665.5,58.1,5.1],[1663.4,65.7,5.54],[1661.3,73.2,5.5],[1659.1,80.7,5.12],[1657,88.3,4.5],[1654.8,95.8,3.97],[1652.7,103.3,3.48],[1650.6,110.9,2.57],[1648.4,118.4,1.84],[1646.3,125.9,1.58],[1644.1,133.5,2.38],[1642,141,2.55],[1639.8,148.8,2.64],[1637.5,156.9,2.81],[1635.1,165.4,3.05],[1632.6,174.1,3.17],[1630.1,182.9,3.01],[1627.7,191.6,3.17],[1625.2,200.3,4.12],[1622.8,208.8,5.11],[1620.5,216.9,5.98],[1618.3,224.7,6.41],[1616.2,232,6.58],[1614.4,238.6,6.77],[1612.7,244.6,6.58],[1611.2,249.7,6.48],[1610,254,6.29],[1634,286,5.78]];
/* prettier-ignore */
const PTS_RING_H4_PARWPA: [number, number, number][] = [[1634,286,5.78],[1610,254,6.29],[1605.3,253,5.75],[1599.3,251.7,5.32],[1592.1,250.1,4.83],[1584.1,248.3,4.55],[1575.4,246.5,4.37],[1566.4,244.5,4.91],[1557.4,242.5,5.7],[1548.5,240.6,5.85],[1540,238.8,5.24],[1532.1,237.2,4.99],[1524.1,235.5,5.25],[1516,233.9,4.74],[1507.9,232.2,4.4],[1499.8,230.6,3.58],[1491.7,229,2.91],[1483.9,227.4,2.71],[1476.3,225.9,2.35],[1468.9,224.4,2.09],[1462,223,2.34],[1452.8,221.1,2.88],[1443.6,219.2,3.95],[1434.6,217.4,4.54],[1426.3,215.6,5.22],[1419,214.1,6.03],[1412.8,212.8,6.49],[1408.1,211.8,6.5]];
/* prettier-ignore */
const PTS_RING_H4_PARWPB: [number, number, number][] = [[1379.9,206,6.74],[1375.6,205.1,6.6],[1370.6,204,6.44],[1364.9,202.8,6.52],[1358.5,201.4,7.16],[1351.7,199.9,7.58],[1344.3,198.3,7.61],[1336.4,196.7,7.38],[1328.1,194.9,7.97],[1319.5,193,8.14],[1310.6,191.1,7.81],[1301.5,189.2,7.59],[1292.2,187.2,7.21],[1282.7,185.1,6.29],[1273.2,183.1,5.98],[1263.6,181.1,7.07],[1254.1,179,8.19],[1244.7,177,9.3],[1235.4,175,10.39],[1226.3,173.1,11.46],[1217.5,171.2,11.47],[1209,169.4,11.11],[1200.9,167.6,10.16],[1193.1,166,10.23],[1185.9,164.4,9.72],[1179.1,163,9.49],[1173,161.7,9.48],[1167.5,160.5,9.48],[1155.6,158,8.92],[1141.2,155,8.37],[1131.5,153.1,8.62],[1125.3,151.9,8.79],[1121.3,151.2,8.98],[1118.3,150.6,9.14],[1115,150,9.22]];
/* prettier-ignore */
const PTS_RING_PARWP_J: [number, number, number][] = [[1115,150,9.22],[1110.8,149.1,9.2],[1105.9,148,9.01],[1100.3,146.8,8.6],[1094.2,145.5,8.2],[1087.5,144.1,7.94],[1080.3,142.6,8.16],[1072.7,140.9,8.76],[1064.8,139.2,8.75],[1056.5,137.5,8.51],[1048,135.7,7.58],[1039.3,133.8,6.79],[1033,134.2,6.25],[1029.5,137.8,6.06],[1025.7,141.6,5.75],[1021.3,145.7,5.83],[1016.4,150,5.92],[1010.9,154.4,6.3],[1004.9,158.9,6.69],[998.3,163.5,6.96],[990.9,168,7.73],[983,172.4,8.44],[974.4,176.6,9.17],[964.7,180.7,9.83],[954,184.6,10.78],[942.3,187.9,11.31],[929.5,190.7,11.35],[915.7,192.6,11.27],[901.1,193.5,10.31],[885.9,193.2,9.4],[870.3,191.5,8.78],[854.8,188.6,8.14],[839.6,184.3,7.25],[825,178.8,6.15],[811.4,172.4,6.73],[798.9,165.2,5.07],[787.6,157.5,4.01],[777.5,149.6,3.63],[768.6,141.5,3.37],[760.9,133.6,2.93],[754.1,125.8,2.41],[748.4,118.4,2.14],[743.4,111.2,2.24],[739.1,104.5,2.58],[735.3,98.1,2.61],[732.1,92,2.45],[729.4,86.4,2.14],[727,81,1.98],[725,76.2,2.2],[723.3,71.6,2.26],[721.8,67.3,2.23],[719,63.9,2.1],[711,62.2,1.3],[703.1,60.5,0.45],[695.2,58.8,0.4],[687.4,57.2,1.14],[679.7,55.5,2.04],[672.2,53.9,2.72],[664.8,52.3,3.01],[657.5,50.8,2.77],[650.3,49.2,2.91],[643.4,47.7,3.54],[635.6,46,4.45],[627,44.2,5.19],[618.7,42.4,6.17],[610.6,40.6,7.12],[602.8,38.9,8.04],[595.1,37.2,8.95],[587.7,35.5,9.82],[580.3,33.9,10.69],[573.1,32.3,10.3],[565.9,30.7,9.96],[558.7,29.1,9.48],[551.5,27.5,9.22],[544.3,25.9,8.65],[537,24.3,7.87],[529.6,22.7,7.61],[522,21,7.14],[514.4,19.3,6.95],[506.7,17.6,6.04],[514.2,16.1,6.72],[520.3,12.6,7.03],[528,5.2,7.38],[534.1,-1.9,7.53],[539.4,-9.4,8.13],[543.4,-16.9,9.02],[546.3,-24.4,9.35],[547.8,-31.9,9.05],[550.6,-41.3,8.39],[554.8,-47.8,8.61],[560.3,-52.2,8.34],[565.9,-58.8,7.55],[569.7,-64.7,7.03],[573.4,-71.9,6.81],[577.2,-79.4,6.99],[580.9,-86.9,7.14],[584.7,-94.4,6.58],[588.4,-101.9,6.47],[591,-109.4,6.88],[592,-116.9,6.84],[591.5,-124.4,6.58],[589.4,-131.9,6.68],[586.6,-139.4,6.85],[583.6,-146.9,7.19],[580.2,-154.4,7.22],[576.6,-161.9,6.94],[572.3,-168.9,6.97],[567.5,-175.3,6.69],[562,-181.1,6.5],[555.9,-186.3,6.65],[550.9,-191.7,7.08],[547.3,-197.8,7.18],[545.4,-204.5,7.14],[545,-211.9,7.29],[545.2,-219.4,7.27],[545.8,-226.9,7.54],[546.6,-234.4,7.43],[547.8,-241.9,7.69],[548.6,-249.4,7.83],[548.8,-256.9,7.96],[548.3,-264.4,7.9]];
/* prettier-ignore */
const PTS_SPUR_PARICUTIN: [number, number, number][] = [[1115,150,9.22],[1115,145.2,8.78],[1115,138.9,8.35],[1115,131.3,7.7],[1115,122.9,6.86],[1115,114,6.52],[1115,105,6.35],[1115,96.2,6.18],[1115,88,5.86],[1115,79.8,5.65],[1115.1,70.9,5.31],[1115.2,61.8,5.09]];
/* prettier-ignore */
const PTS_SPUR_TOWN: [number, number, number][] = [[1634,286,5.78],[1610,254,6.29],[1613.1,257.5,6.63],[1617.3,262.1,6.71],[1622.3,267.6,6.19],[1627.8,273.7,5.9],[1633.6,280.3,6.02]];
// The Highstone spur was re-routed to climb past a genuine 50 m shoulder of the Lone Peak (the
// direct H3 -> Highstone line stays under 25 m the whole way — too gentle to need a tunnel — but
// this longer, winding mountain-road alignment is a believable one for a village literally called
// Highstone, and it gives the island its second tunnel on real high ground instead of a flat
// shortcut): H3 climbs the peak's southern flank to a portal at (1826, -460) — the natural ground
// there is 40.3 — bores through (see TUNNELS' "lone-peak-tunnel"), and the far portal at
// (1976, -354) winds back down to Highstone.
/* prettier-ignore */
const PTS_SPUR_HIGHSTONE_A: [number, number, number][] = [[1729.8,-302.9,10.39],[1769,-311,11.856],[1774,-313,11.51],[1781.4,-315.7,12.42],[1790.3,-318.9,13.51],[1799.9,-322.4,14.68],[1809.4,-326.2,15.86],[1818,-330.1,16.94],[1824.8,-334.2,17.86],[1829.1,-338.1,18.52],[1829.9,-342.2,19],[1826.1,-346.7,19.68],[1819,-351.4,20.66],[1809.9,-356.2,21.57],[1800.5,-361.1,20.67],[1792.2,-365.9,19.57],[1786.6,-370.5,18.74],[1785,-375,18.56],[1787.9,-378.8,19.11],[1794.2,-382.5,19.95],[1802.9,-386.2,21.03],[1812.8,-389.7,22.24],[1822.9,-393.3,23.47],[1832.2,-396.7,24.61],[1839.6,-400.1,25.55],[1844.2,-403.4,26.2],[1844.6,-406.9,26.61],[1839.8,-410.7,27.31],[1831.4,-414.3,28.36],[1820.9,-417.8,29.63],[1810.4,-421.3,30.91],[1801.4,-424.7,29.8],[1795.9,-428.2,29.05],[1795.6,-431.9,28.62],[1800.6,-435.9,28.54],[1809.3,-439.8,29.63],[1819.5,-443.8,30.89],[1829.3,-447.7,32.11],[1836.8,-451.4,33.07],[1840,-455,33.62],[1837.5,-459,34.16],[1830.5,-463.3,35.11],[1821.2,-467.5,36.28],[1811.6,-471.1,37.46],[1803.8,-473.7,37.48],[1800,-475,37.01],[1802.5,-473.4,37.21],[1810.5,-468.7,38.28],[1819.8,-463.5,39.5],[1826,-460,40.32]];
/* prettier-ignore */
const PTS_SPUR_HIGHSTONE_B: [number, number, number][] = [[1976,-354,43.91],[1980,-349.7,43.23],[1986.3,-343.6,42.23],[1993.1,-336.4,41.09],[1998.5,-329.2,40.05],[2000.7,-322.7,39.26],[1998.6,-318.3,38.7],[1993.6,-315.3,38.03],[1986.4,-312.7,37.15],[1977.8,-310.3,36.12],[1968.6,-308,35.03],[1959.6,-305.7,33.97],[1951.4,-303.1,32.98],[1945,-300,32.16],[1937.3,-294.5,31.07],[1930.4,-288.2,30],[1925,-281.8,30.07],[1921.3,-275.5,30.91]];
/* prettier-ignore */
const PTS_SPUR_BASECAMP: [number, number, number][] = [[1431.6,-635,5.79],[1430,-595,5.01],[1431.1,-599.4,5.29],[1432.5,-604.7,5.58],[1434.2,-610.9,5.74],[1436,-617.9,5.98],[1438,-625.5,6.29],[1440.1,-633.7,6.89],[1442.3,-642.2,7.34],[1444.6,-650.9,7.59],[1446.9,-659.8,6.78],[1449.3,-668.7,5.77],[1451.6,-677.4,5.06],[1453.8,-685.9,5.14],[1456,-694.1,5.55],[1458,-701.8,5.81],[1460.1,-709.5,5.92],[1462.1,-717.2,5.12],[1464.2,-724.9,4.6],[1466.3,-732.6,3.9],[1468.4,-740.3,3.66],[1470.5,-748.1,3.82],[1472.6,-755.8,3.48],[1474.7,-763.5,2.72],[1476.7,-771.2,2.34],[1478.8,-778.9,1.94],[1480.9,-786.6,2.2],[1483,-794.3,2.8],[1485,-802,3.72],[1487,-809.7,4.63],[1489.1,-817.3,5.54],[1491.1,-825,6.45],[1493.1,-832.6,6.02],[1495.1,-840.2,5.12],[1497.1,-847.8,4.21],[1499.1,-855.5,3.4],[1501,-863.1,3],[1503,-870.7,2.52],[1505,-878.3,2.42],[1507,-885.9,2.97],[1509,-893.6,3.54],[1511,-901.2,3.33],[1513,-908.9,2.63],[1515.1,-917,1.97],[1517.4,-925.5,2.98],[1519.7,-934.3,4.01],[1522,-943.1,5.05],[1524.3,-952,6.11],[1526.6,-960.8,6.04],[1528.9,-969.3,5.09],[1531,-977.4,5.02],[1533,-985,5.68],[1534.8,-992,6.51],[1536.5,-998.3,7.26],[1537.9,-1003.6,7.89],[1539,-1008,7.95]];
/* prettier-ignore */
/* prettier-ignore */
const PTS_SPUR_TREETOP: [number, number, number][] = [[919.8,-672.4,13.93],[947,-643,12.346],[948,-648,11.96],[949.6,-655,12.33],[951.5,-663.4,13.05],[953.4,-672.4,12.77],[955,-681.5,12.83],[955.8,-689.9,13.27],[955.6,-697.1,13.63],[953.3,-703.7,13.83],[947.5,-710,14.12],[939.8,-714.8,14.33],[931.9,-718.4,14.6],[925.6,-721.2,15.06],[923.5,-722.4,15.29]];
/* prettier-ignore */
const PTS_SPUR_KART: [number, number, number][] = [[150,-112,3.26],[153.5,-118.6,3.39],[158.4,-127.8,3.39],[163.2,-135.5,3.21],[168.6,-139.4,3.48],[170.4,-139.1,3.56]];

/** the 11 road "junction hubs" every spur and the ring itself meet at — also every road's own
 *  anchor height (matches the leg arrays' own first/last y exactly; frozen together so a drifted
 *  leg or a drifted junction can never silently disagree — roads.test.ts checks both). */
export const H0 = { x: 150, z: -112, y: 3.26 }; // Park Station's roundabout, in the pocket between the station, the rails and the kart circuit
/** the east junction: where the road from Park Station meets the ring (the kart circuit fills the
 *  ground between the rails nearer the park, so the ring closes here instead) */
export const HJ = { x: 548.3, z: -264.4, y: 7.9 };
export const H1 = { x: 947, z: -643, y: 11.73 }; // Great Falls Station
export const H2 = { x: 1430, z: -595, y: 5.01 }; // Great Lake Station
export const H3 = { x: 1769, z: -311, y: 11.23 }; // Lone Peak Station
export const H4 = { x: 1610, z: 254, y: 6.29 }; // Sunny Plains Station
export const PAR_WP = { x: 1115, z: 150, y: 9.22 }; // the ring's own waypoint nearest Parícutin

// round 4 (Agent R): each station's own ROUNDABOUT doesn't sit at the station hub any more — that
// put it right across the railway and the platform (H1-H4 are only ~4 units from the rail; the
// roundabout's own outer radius is 22). Each one moved 40 units out, perpendicular to the rail's own
// tangent there, to clear ring-radius+12 (34) from both the rails and the platform — measured
// directly (registry/railway.ts's nearestRail/railAt), not guessed. PAR_WP never needed this: it
// isn't a station, and nearestRail found no rail anywhere near it. Every road that used to end
// exactly at a hub now runs on a short extra stub from the old hub point out to the matching _RA
// point (see the PTS_* arrays above) — ROAD_JUNCTIONS (the ring + fingerpost) is built here instead.
export const H0_RA = H0;
export const H1_RA = { x: 919.8, z: -672.4, y: 13.93 };
export const H2_RA = { x: 1431.6, z: -635.0, y: 5.79 };
export const H3_RA = { x: 1729.8, z: -302.9, y: 10.39 };
export const H4_RA = { x: 1634.0, z: 286.0, y: 5.78 };

function mk(a: readonly (readonly [number, number, number])[]): RoadPoint[] {
  return a.map(([x, z, y]) => ({ x, z, y }));
}

export const ROAD_SEGMENTS: RoadSeg[] = [
  { id: "ring-h0-j", road: "ring", kind: "road", points: mk(PTS_RING_H0_J) },
  { id: "ring-j-h1", road: "ring", kind: "road", points: mk(PTS_RING_J_H1) },
  { id: "ring-h1-h2a", road: "ring", kind: "road", points: mk(PTS_RING_H1_H2A) },
  { id: "ring-h1-h2b", road: "ring", kind: "road", points: mk(PTS_RING_H1_H2B) },
  { id: "ring-h2-h3", road: "ring", kind: "road", points: mk(PTS_RING_H2_H3) },
  { id: "ring-h3-h4", road: "ring", kind: "road", points: mk(PTS_RING_H3_H4) },
  { id: "ring-h4-parwpa", road: "ring", kind: "road", points: mk(PTS_RING_H4_PARWPA) },
  { id: "ring-h4-parwpb", road: "ring", kind: "road", points: mk(PTS_RING_H4_PARWPB) },
  { id: "ring-parwp-j", road: "ring", kind: "road", points: mk(PTS_RING_PARWP_J) },
  { id: "spur-paricutin", road: "spur-paricutin", kind: "road", points: mk(PTS_SPUR_PARICUTIN) },
  { id: "spur-town", road: "spur-town", kind: "road", points: mk(PTS_SPUR_TOWN) },
  { id: "spur-highstone-a", road: "spur-highstone", kind: "road", points: mk(PTS_SPUR_HIGHSTONE_A) },
  { id: "spur-highstone-b", road: "spur-highstone", kind: "road", points: mk(PTS_SPUR_HIGHSTONE_B) },
  { id: "spur-basecamp", road: "spur-basecamp", kind: "road", points: mk(PTS_SPUR_BASECAMP) },
  { id: "spur-kart", road: "spur-kart", kind: "road", points: mk(PTS_SPUR_KART) },
  { id: "spur-treetop", road: "spur-treetop", kind: "road", points: mk(PTS_SPUR_TREETOP) },
];

/** the bridges: the Wild River crossing is the grand one (a multi-pier viaduct, extended well past
 *  the open water so it reads as a real span over the whole green valley, not just the wet gap) */
export const BRIDGES: RoadBridge[] = [
  // the span's own ends land exactly on the two approach roads' own frozen bank points (ring-h1-h2a's
  // last point and ring-h1-h2b's first) — a grand, many-piered deck over the valley, not just the
  // narrow wet gap, but never further than where the road itself already ends either side of it
  { id: "wild-river-viaduct", name: "Wild River Viaduct", road: "ring", style: "grand", x: 1135.75, z: -624.485, heading: 1.474, span: 31.65, half: 5.2, y0: 7.99, y1: 5.99, rise: 1.8, piers: 4 },
  { id: "lake-outlet-bridge", name: "Outlet Bridge", road: "ring", style: "simple", x: 1394, z: 208.9, heading: -1.776, span: 28.79, half: 4.8, y0: 6.5, y1: 6.74, rise: 0.9, piers: 2 },
  // the third bridge, as asked for in round 2: a road OVERPASS over the Wildlands Railway, replacing
  // one of the two at-grade level crossings — the deck's own camber (the same sin(u*pi)*rise formula
  // every bridge uses) IS the ramp up and back down, so the ordinary road either side needs no
  // separate ramp geometry: y0/y1 match the ordinary road's own frozen height right there (9.53),
  // and the rise (4.33) lifts the crossing point to 3 units clear of the rail (railY there is 11.03)
  { id: "rail-overpass", name: "Rail Overpass", road: "ring", style: "overpass", x: 297, z: 45, heading: 2.2717, span: 38, half: 5.0, y0: 2.28, y1: 3.96, rise: 5.22, piers: 0 },
];

/** the tunnels: the Great Ridge Tunnel bores straight through the mountains right behind the park
 *  (going over would mean climbing from ~0 to a 115 m crag and back down inside half a kilometre —
 *  a 65%+ grade no jeep could manage); the Lone Peak Tunnel bores through a genuine ~50 m shoulder
 *  of the Lone Peak on the Highstone spur (confirmed against the real, unlevelled terrain: the
 *  straight line between the two portals passes well clear of the peak's own steep crown, with 6+ m
 *  of real rock still overhead through the bored middle — only the two portal FACES themselves
 *  meet the hillside at ~0 clearance, same as any real tunnel mouth). The spur's own winding
 *  approach roads (not a straight line) are what actually climb to each portal at a sane grade. */
export const TUNNELS: RoadTunnel[] = [
  { id: "lone-peak-tunnel", name: "Lone Peak Tunnel", road: "spur-highstone", x0: 1826, z0: -460, y0: 40.32, x1: 1976, z1: -354, y1: 43.91, half: 4.4, clear: 4 },
];

/** every destination's car park. `serves` and the coordinates are plain copied numbers (see the
 *  file banner) — roads.test.ts cross-checks every one against the live registry it came from. */
// every station car park used to sit exactly ON its junction's own hub point — fine for a plain
// stamp, but round 3's roundabout makes that read as "a giant slab under the junction" once the ring
// itself is drawn there. Each one is moved out beside its own road (along the SAME heading that used
// to just orient the apron), clear of the roundabout ring (outer radius 14) with a real margin, and
// a touch smaller (r 12 not 15) so it reads as its own tidy rectangle, not a second junction.
export const CAR_PARKS: CarPark[] = [
  // round 4: re-pinned a SECOND time — offsetting 20 units from the new, moved H#_RA roundabout
  // centre put the car park INSIDE the ring itself (radius 22)! These sit a modest 9 units out from
  // the OLD hub point instead (still a frozen vertex every connecting road genuinely passes through,
  // on its own short stub out to the roundabout), comfortably within r (12) of that real road point.
  { id: "cp-park-station", x: 140.8, z: -81.9, y: 2.85, heading: 0.3, r: 10, serves: ["Park Station"], jeeps: 2 },
  { id: "cp-falls-station", x: 972.2, z: -624.1, y: 11.99, heading: 1.46, r: 12, serves: ["Great Falls Station", "Victoria Falls"], jeeps: 2 },
  { id: "cp-treetop", x: 923.5, z: -722.4, y: 15.29, heading: 0.76, r: 12, serves: ["Treetop"], jeeps: 2 },
  { id: "cp-lake-station", x: 1389.4, z: -615.2, y: 7.45, heading: 1.47, r: 12, serves: ["Great Lake Station", "Lakeside"], jeeps: 3 },
  { id: "cp-peak-station", x: 1784.8, z: -333.9, y: 13.51, heading: 1.92, r: 12, serves: ["Lone Peak Station"], jeeps: 2 },
  { id: "cp-plains-station", x: 1587.3, z: 232.7, y: 4.55, heading: -1.77, r: 12, serves: ["Sunny Plains Station"], jeeps: 2 },
  { id: "cp-highstone", x: 1921.3, z: -275.5, y: 30.91, heading: 2.3, r: 13, serves: ["Highstone"], jeeps: 2 },
  { id: "cp-town", x: 1633.6, z: 280.3, y: 6.02, heading: 0.7, r: 15, serves: ["Sunnybrook"], jeeps: 2 },
  { id: "cp-paricutin", x: 1115.2, z: 61.8, y: 5.09, heading: 0, r: 13, serves: ["Parícutin"], jeeps: 2 },
  // the spur's own drivable road ends at (1539, -1008) — the final ~107 units up to the camp itself
  // are on foot only (fittingly: real Everest Base Camp treks end the same way, walking the last
  // stretch), matching registry/footpaths.ts's own village<->station walks
  { id: "cp-basecamp", x: 1539, z: -1008, y: 7.95, heading: 0.36, r: 13, serves: ["Everest Base Camp", "Mount Everest"], jeeps: 2 },
  // round 3: moved off the canyon's own carved ground (was inside nearGrandCanyon) to
  // grandCanyon.ts's own CANYON_TRAILHEAD — a known-safe rim-side approach point, right where the
  // spur's own last point now lands
  // round 4: "Canyon Lookout" — the spur now stops well short of the canyon (dropped every point
  // inside CANYON_REACH+30 = 550 units of CANYON_SITE; this is the last one still outside it, at
  // 550.5) so nothing here depends on whether the canyon is switched on. Re-frozen straight from
  // rawHeight() (natural ground) the whole way, same as the rest of the network — this stretch was
  // already outside the canyon's 520-unit reach even with the canyon on, so round 3's heights here
  // were never actually canyon-derived. (Round 3 approached from the far south/trailhead side
  // instead; not kept, see the round-4 report — going all the way round the reach circle to reach
  // that side wasn't done given time.)
  { id: "cp-kart", x: 170.4, z: -139.1, y: 3.56, heading: 1.41, r: 11, serves: ["Cucaino Karts"], jeeps: 2 },
];

export const ROAD_JUNCTIONS: RoadJunction[] = [
  { id: "j-h0", x: H0.x, z: H0.z, y: H0.y, signs: [{ label: "Great Falls 💦", heading: 0.1 }, { label: "Sunny Plains 🌻", heading: 1.2 }, { label: "Cucaino Karts 🏎️", heading: 2.5 }] },
  { id: "j-east", x: HJ.x, z: HJ.z, y: HJ.y, signs: [{ label: "Park Station 🎡", heading: -2.2 }, { label: "Great Falls 💦", heading: 2.2 }, { label: "Sunny Plains 🌻", heading: 0.3 }] },
  { id: "j-h1", x: H1_RA.x, z: H1_RA.z, y: H1_RA.y, signs: [{ label: "Park Station \u{1F3A1}", heading: 2.42 + Math.PI }, { label: "Great Lake \u{1F3D6}️", heading: 0.1 }, { label: "Treetop \u{1F333}", heading: 2.94 }] },
  { id: "j-h2", x: H2_RA.x, z: H2_RA.z, y: H2_RA.y, signs: [{ label: "Great Falls \u{1F4A6}", heading: 0.1 + Math.PI }, { label: "Lone Peak \u{1F3D4}️", heading: 0.65 }, { label: "Everest Base Camp ⛰️", heading: 0.03 }] },
  { id: "j-h3", x: H3_RA.x, z: H3_RA.z, y: H3_RA.y, signs: [{ label: "Great Lake \u{1F3D6}️", heading: 0.65 + Math.PI }, { label: "Sunny Plains \u{1F33B}", heading: 1.75 }, { label: "Highstone ⛰️", heading: 1.95 }] },
  { id: "j-h4", x: H4_RA.x, z: H4_RA.z, y: H4_RA.y, signs: [{ label: "Lone Peak \u{1F3D4}️", heading: 1.75 + Math.PI }, { label: "Park Station \u{1F3A1}", heading: -2.2 }, { label: "Sunnybrook \u{1F3EA}", heading: 0.5 }] },
  { id: "j-parwp", x: PAR_WP.x, z: PAR_WP.z, y: PAR_WP.y, signs: [{ label: "Sunny Plains \u{1F33B}", heading: -2.2 + Math.PI }, { label: "Park Station \u{1F3A1}", heading: -2.45 }, { label: "Parícutin \u{1F30B}", heading: 1.57 }] },
];

// ── nearest-road lookups: every segment's points bucketed in a coarse grid (same discipline as
// registry/railway.ts's nearestRail) ──
const BK = 64;
const allPts: { seg: number; i: number; x: number; z: number }[] = [];
ROAD_SEGMENTS.forEach((seg, si) => seg.points.forEach((p, i) => allPts.push({ seg: si, i, x: p.x, z: p.z })));
const bx0 = Math.min(...allPts.map((p) => p.x)) - 80;
const bz0 = Math.min(...allPts.map((p) => p.z)) - 80;
const BNX = Math.ceil((Math.max(...allPts.map((p) => p.x)) + 80 - bx0) / BK);
const BNZ = Math.ceil((Math.max(...allPts.map((p) => p.z)) + 80 - bz0) / BK);
const BUCKETS: number[][] = (() => {
  const b: number[][] = Array.from({ length: BNX * BNZ }, () => []);
  const R = 80;
  for (const seg of ROAD_SEGMENTS) {
    const pts = seg.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const c = pts[i + 1];
      const x0 = Math.min(a.x, c.x) - R;
      const x1 = Math.max(a.x, c.x) + R;
      const z0 = Math.min(a.z, c.z) - R;
      const z1 = Math.max(a.z, c.z) + R;
      const gi = ROAD_SEGMENTS.indexOf(seg);
      for (let bj = Math.max(0, Math.floor((z0 - bz0) / BK)); bj <= Math.min(BNZ - 1, Math.floor((z1 - bz0) / BK)); bj++)
        for (let bi = Math.max(0, Math.floor((x0 - bx0) / BK)); bi <= Math.min(BNX - 1, Math.floor((x1 - bx0) / BK)); bi++) b[bj * BNX + bi].push(gi * 100000 + i);
    }
  }
  return b;
})();

export interface RoadHit {
  /** distance from the road's own centre-line (negative never happens; 0 = dead centre) */
  d: number;
  roadId: string;
  segId: string;
  /** signed lateral offset (+ to the right of travel) */
  lateral: number;
  heading: number;
  /** the nearest point's own bed height (plain linear interpolation along the segment) */
  deckY: number;
  kind: RoadKind;
}
const _hit: RoadHit = { d: Infinity, roadId: "", segId: "", lateral: 0, heading: 0, deckY: 0, kind: "road" };

/** the nearest ordinary road (not a bridge/tunnel — see roadAt() for those) to (x, z), or d=Infinity
 *  if nothing is within ~80 units */
function nearestOrdinaryRoad(x: number, z: number): RoadHit {
  _hit.d = Infinity;
  const k = Math.floor((x - bx0) / BK);
  const j = Math.floor((z - bz0) / BK);
  if (k < 0 || j < 0 || k >= BNX || j >= BNZ) return _hit;
  let best = Infinity;
  for (const code of BUCKETS[j * BNX + k]) {
    const si = Math.floor(code / 100000);
    const i = code % 100000;
    const seg = ROAD_SEGMENTS[si];
    const a = seg.points[i];
    const c = seg.points[i + 1];
    const ex = c.x - a.x;
    const ez = c.z - a.z;
    const l2 = ex * ex + ez * ez || 1;
    const u = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2));
    const px = a.x + ex * u;
    const pz = a.z + ez * u;
    const dx = px - x;
    const dz = pz - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) {
      best = d2;
      const l = Math.sqrt(l2) || 1;
      const heading = Math.atan2(ex, ez);
      const lateral = (x - px) * (ez / l) - (z - pz) * (ex / l);
      _hit.roadId = seg.road;
      _hit.segId = seg.id;
      _hit.lateral = lateral;
      _hit.heading = heading;
      _hit.deckY = a.y + (c.y - a.y) * u;
      _hit.kind = "road";
    }
  }
  _hit.d = Math.sqrt(best);
  return _hit;
}

/** a bridge's local (along, side) coordinates at (x, z) */
function bridgeLocal(b: RoadBridge, x: number, z: number) {
  const dx = x - b.x;
  const dz = z - b.z;
  const along = dx * Math.sin(b.heading) + dz * Math.cos(b.heading);
  const side = dx * Math.cos(b.heading) - dz * Math.sin(b.heading);
  return { along, side };
}
/** a tunnel's local (along 0..1, side, straight-line y) at (x, z) */
function tunnelLocal(t: RoadTunnel, x: number, z: number) {
  const dx = t.x1 - t.x0;
  const dz = t.z1 - t.z0;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const along = (x - t.x0) * ux + (z - t.z0) * uz;
  const side = (x - t.x0) * uz - (z - t.z0) * ux;
  const u = Math.max(0, Math.min(1, along / len));
  return { along, side, u, len, heading: Math.atan2(dx, dz) };
}

/** the bridge deck height at (x, z) (null off it) */
export function bridgeDeckAt(b: RoadBridge, x: number, z: number): number | null {
  const { along, side } = bridgeLocal(b, x, z);
  if (Math.abs(side) > b.half + 0.15 || Math.abs(along) > b.span / 2) return null;
  const u = along / b.span + 0.5;
  return b.y0 + (b.y1 - b.y0) * u + Math.sin(u * Math.PI) * b.rise;
}
/** the tunnel floor height at (x, z) (null off it) */
export function tunnelDeckAt(t: RoadTunnel, x: number, z: number): number | null {
  const { side, u, len } = tunnelLocal(t, x, z);
  const along = u * len;
  if (along < -2 || along > len + 2 || Math.abs(side) > t.half + 0.15) return null;
  return t.y0 + (t.y1 - t.y0) * u;
}
/** the real ceiling height at (x, z) if it's inside a tunnel (null elsewhere) — world/roads/index.ts's
 *  own visual lining sits at deck + clear + 2.4; this is a touch under that, a safe margin the
 *  camera is kept below so it never pokes through the lining */
export function tunnelCeilingAt(x: number, z: number): number | null {
  for (const t of TUNNELS) {
    const y = tunnelDeckAt(t, x, z);
    if (y !== null) return y + t.clear + 1.7;
  }
  return null;
}

/** every road feature's deck height at (x, z) — bridges and tunnels only (plain ground elsewhere;
 *  terrain.ts's own stamped bed answers for ordinary road) */
export function roadDeckY(x: number, z: number): number | null {
  for (const b of BRIDGES) {
    const y = bridgeDeckAt(b, x, z);
    if (y !== null) return y;
  }
  for (const t of TUNNELS) {
    const y = tunnelDeckAt(t, x, z);
    if (y !== null) return y;
  }
  return null;
}

/** is (x, z) within `pad` of ANY part of the road network (ordinary bed, bridge deck, tunnel floor,
 *  or a car park) — the cheap, allocation-free "is there a road here at all" test other registries
 *  (terrain, the grass mask, the map) use before doing anything heavier */
export function nearRoad(x: number, z: number, pad = 0): boolean {
  const h = nearestOrdinaryRoad(x, z);
  if (h.d < ROAD_HALF + pad) return true;
  for (const b of BRIDGES) if (bridgeDeckAt(b, x, z) !== null) return true;
  for (const t of TUNNELS) if (tunnelDeckAt(t, x, z) !== null) return true;
  for (const cp of CAR_PARKS) if (Math.hypot(x - cp.x, z - cp.z) < cp.r + pad) return true;
  return false;
}

/** the nearest road point to (x, z): ordinary bed, bridge deck or tunnel floor, whichever answers
 *  (bridges/tunnels always win inside their own footprint, since that's the only sensible deck
 *  height there) — see the spec's roadAt() */
export function roadAt(x: number, z: number): RoadHit {
  for (const b of BRIDGES) {
    const y = bridgeDeckAt(b, x, z);
    if (y !== null) {
      const { along, side } = bridgeLocal(b, x, z);
      _hit.d = Math.abs(side);
      _hit.roadId = b.road;
      _hit.segId = b.id;
      _hit.lateral = side;
      _hit.heading = along >= 0 ? b.heading : b.heading + Math.PI;
      _hit.deckY = y;
      _hit.kind = "bridge";
      return _hit;
    }
  }
  for (const t of TUNNELS) {
    const y = tunnelDeckAt(t, x, z);
    if (y !== null) {
      const { side, heading } = tunnelLocal(t, x, z);
      _hit.d = Math.abs(side);
      _hit.roadId = t.road;
      _hit.segId = t.id;
      _hit.lateral = side;
      _hit.heading = heading;
      _hit.deckY = y;
      _hit.kind = "tunnel";
      return _hit;
    }
  }
  return nearestOrdinaryRoad(x, z);
}

/** the nearest car park within `pad` of (x, z), or null */
export function carParkAt(x: number, z: number, pad = 0): CarPark | null {
  for (const cp of CAR_PARKS) if (Math.hypot(x - cp.x, z - cp.z) < cp.r + pad) return cp;
  return null;
}

// ── the driving corridor: a car in the Wildlands may be anywhere within ROAD_CORRIDOR_HALF of a
// road's centre-line, on a bridge deck (within its half), on a tunnel floor (within its half), or
// inside a car park's circle — nowhere else. Pure, allocation-free, tested in roads.test.ts. ──

/** is (x, z) inside the drivable corridor (road shoulder, bridge deck, tunnel floor or a car park)? */
export function inRoadCorridor(x: number, z: number): boolean {
  const h = nearestOrdinaryRoad(x, z);
  if (h.d < ROAD_CORRIDOR_HALF) return true;
  for (const b of BRIDGES) {
    const { along, side } = bridgeLocal(b, x, z);
    if (Math.abs(side) < b.half + ROAD_SHOULDER && Math.abs(along) < b.span / 2 + 1) return true;
  }
  for (const t of TUNNELS) {
    const { side, u, len } = tunnelLocal(t, x, z);
    if (Math.abs(side) < t.half + ROAD_SHOULDER && u * len > -2 && u * len < len + 2) return true;
  }
  // (a car park's free area reaches a little past its apron, across the verge to the road beside it)
  for (const cp of CAR_PARKS) if (Math.hypot(x - cp.x, z - cp.z) < cp.r + 3) return true;
  return false;
}

/**
 * Keep a car's attempted (x, z) inside the drivable corridor: if it's already inside, nothing
 * changes; if it would leave the corridor, the position is projected sideways back onto the
 * corridor's own edge (the same "slide along the edge" idea as the engine's raised-deck railings —
 * never a hard stop, never a teleport back to where the car came from). `prevX/prevZ` are used only
 * as a last-resort fallback, for the rare case (x, z) lands nowhere near any road at all (teleported
 * far away) — then the car simply doesn't move this frame.
 */
export function roadConfine(x: number, z: number, prevX: number, prevZ: number): { x: number; z: number } {
  if (inRoadCorridor(x, z)) return { x, z };
  // already free in a car park or on a bridge/tunnel that just failed the FIRST check because it's
  // right at the lengthwise end (about to arrive at the ordinary road beyond it) — try nudging back
  // onto the nearest ordinary road's own corridor first, since that's where every bridge/tunnel and
  // every car park ultimately connects back into the network.
  const h = nearestOrdinaryRoad(x, z);
  if (h.d < 500) {
    // slide along the edge: keep the same "s" (along-road) position implied by the nearest-point
    // search, just pull the lateral offset back inside the corridor
    const clampLat = Math.max(-ROAD_CORRIDOR_HALF, Math.min(ROAD_CORRIDOR_HALF, h.lateral));
    // the perpendicular unit matching nearestOrdinaryRoad's own lateral convention exactly:
    // lateral = (x-px)*(ez/l) - (z-pz)*(ex/l), heading = atan2(ex, ez), so ex/l = sin(heading) and
    // ez/l = cos(heading) — the normal is (cos heading, -sin heading), NOT (-sin, cos)
    const nx = Math.cos(h.heading);
    const nz = -Math.sin(h.heading);
    const px = x - h.lateral * nx;
    const pz = z - h.lateral * nz;
    return { x: px + clampLat * nx, z: pz + clampLat * nz };
  }
  for (const cp of CAR_PARKS) {
    const d = Math.hypot(x - cp.x, z - cp.z);
    if (d < cp.r + 40) {
      const k = cp.r / (d || 1);
      return { x: cp.x + (x - cp.x) * Math.min(1, k), z: cp.z + (z - cp.z) * Math.min(1, k) };
    }
  }
  return { x: prevX, z: prevZ };
}

// ── which landmass (x, z) belongs to: the park's own little island, the big Wildlands landmass, or
// neither (one of the FAR islands out at sea — Coralcove, Frostpeak, Dino Isle — which have no road
// network at all and must never be caught by this). A car's road-bound rule only applies once it's
// genuinely out in the Wildlands; the park's own buggies keep roaming free inside the park, and the
// far islands' jeeps (Dino Isle) keep their own existing behaviour untouched. ──
const PARK_R = 152; // registry/island.ts's ISLAND_R, copied (roads.test.ts checks it matches)
/** registry/island.ts's WILDLANDS, copied (roads.test.ts checks it matches): the big landmass's own
 *  centre and radius, generous enough to cover every road (the furthest, Sunnybrook, sits ~1300
 *  away) while the far sea islands (1700+ away) fall well outside it */
const WILDLANDS_X = 1132.6;
const WILDLANDS_Z = -822.9;
const WILDLANDS_R = 1420;
/** true once (x, z) is unambiguously in the Wildlands (clear of the park's own little island, and
 *  inside the big landmass's own generous radius — never true for the separate far-sea islands) */
export function inWildlandsZone(x: number, z: number): boolean {
  if (Math.hypot(x, z) <= PARK_R + 6) return false;
  return Math.hypot(x - WILDLANDS_X, z - WILDLANDS_Z) < WILDLANDS_R + 40;
}

// ── the one remaining at-grade level crossing (the other became the Rail Overpass above): a real
// boom that lowers when the train is within ~8s and lifts after it's passed. The crossing's own
// (x, z, heading) and its position along the rail loop (railS) are frozen numbers, the same
// discipline as everything else here; roads.test.ts re-derives them from the live railway. ──
export interface LevelCrossing {
  id: string;
  x: number;
  z: number;
  /** the road's own heading through the crossing */
  heading: number;
  /** distance along the Wildlands Railway loop (registry/railway.ts's own `s`) the rails pass it at */
  railS: number;
}
export const LEVEL_CROSSINGS: LevelCrossing[] = [
  { id: "falls-crossing", x: 951.7, z: -642.5, heading: 1.4542, railS: 848.9 },
  // the road out of Park Station crosses the line right by the platform
  { id: "park-crossing", x: 170.3, z: -44.7, heading: 0.304, railS: 4269.2 },
  { id: "ridge-crossing", x: 531, z: -314.1, heading: -2.738, railS: 588.1 },
];
/** registry/railway.ts's RAIL_LENGTH and world/railway/index.ts's own TRAIN_V, copied (leaf-safe:
 *  world/railway/index.ts touches three.js, so its TRAIN_V is copied rather than imported — same
 *  reasoning as every other "copy the number" comment in this file) */
const RAIL_LENGTH_COPY = 4280.77;
const TRAIN_V_COPY = 24;
/** is this crossing's boom down right now, given the train's own position (s) along the loop? Down
 *  from ~8 s before the train reaches it until ~3 s after it's cleared (a toy steam train, not a
 *  precise timetable — this is a kid's park, not a real level crossing's exact safety margin). */
export function crossingBoomDown(c: LevelCrossing, trainS: number): boolean {
  let ahead = c.railS - trainS;
  while (ahead < 0) ahead += RAIL_LENGTH_COPY;
  const secondsAhead = ahead / TRAIN_V_COPY;
  return secondsAhead < 8 || secondsAhead > RAIL_LENGTH_COPY / TRAIN_V_COPY - 3;
}
/** true if (x, z) is on the wrong side of a closed boom right now — ParkWorld uses this to stop a
 *  car at the line (ride up to it, never through it) without needing to know anything about trains
 *  itself */
export function levelCrossingBlocks(x: number, z: number, trainS: number, pad = 5): boolean {
  for (const c of LEVEL_CROSSINGS) if (crossingBoomDown(c, trainS) && Math.hypot(x - c.x, z - c.z) < pad) return true;
  return false;
}

export { nearestOnPolyline };
export type { P2 };
