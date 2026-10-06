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
const PTS_RING_J_H1: [number, number, number][] = [[553.3,-142.4,5.78],[553.1,-148.3,5.99],[553,-154.2,6.28],[552.9,-160.1,6.5],[552.6,-166,6.54],[552.2,-171.9,6.47],[551.5,-177.8,6.62],[550.7,-183.6,6.75],[549.9,-189.4,6.99],[549.1,-195.3,7.22],[548.4,-201.2,7.28],[547.9,-207,7.52],[547.4,-212.9,7.59],[546.9,-218.8,7.5],[546.6,-224.7,7.63],[546.4,-230.6,7.48],[546.3,-236.5,7.45],[546.4,-242.4,7.66],[546.6,-248.3,7.82],[546.9,-254.2,7.9],[547.1,-260.1,7.96],[547.3,-266,7.91],[547.2,-271.9,7.81],[545.5,-279.4,7.63],[543.1,-286.9,7.56],[540.2,-294.4,7.47],[536.6,-301.9,7.43],[533,-309.4,7.29],[529.8,-316.9,6.86],[527,-324.4,6.5],[524.4,-331.9,6.65],[523.8,-339.4,6.74],[525.6,-346.9,7.07],[530,-354.4,7.39],[536.9,-361.9,7.6],[544.4,-369.1,7.9],[551.9,-376.1,7.98],[559.4,-382.7,7.98],[566.9,-389.1,8.23],[574.4,-394.1,7.89],[581.9,-397.7,7.83],[589.4,-399.6,8],[596.9,-400,8.07],[604.1,-400.9,8.36],[611.1,-403.1,8.74],[617.7,-406.6,8.97],[624.1,-411.3,8.82],[630.1,-416.7,8.68],[635.8,-422.8,8.22],[641.2,-429.5,8.31],[646.3,-436.9,8.43],[651.7,-443.9,8.29],[657.8,-450.3,8.54],[664.5,-456.1,9.13],[671.9,-461.3,9.24],[679.4,-466.3,9.19],[686.9,-471.3,9.26],[694.4,-476.3,9.32],[701.9,-481.3,9.51],[709.4,-484.8,9.56],[717.1,-486.3,9.69],[724.9,-485.8,9.5],[732.7,-483.4,9.27],[741.6,-480,9.67],[746.5,-478.2,9.99],[752.9,-482.9,10.91],[759.1,-487.5,11.79],[765.3,-492.2,12.69],[771.3,-496.9,12.92],[777.3,-501.5,12.45],[783.2,-506.2,11.77],[788.9,-510.8,10.93],[794.5,-515.4,10.12],[800,-520,9.78],[806.4,-525.6,9.33],[812.7,-531.3,9.65],[818.7,-537.2,9.79],[824.6,-543.1,9.82],[830.3,-549,10.68],[835.9,-555,11.63],[841.3,-560.9,12.55],[846.7,-566.7,13.01],[850.6,-571.1,13.13],[854.5,-575.5,13.04],[858.4,-579.9,12.96],[862.3,-584.3,12.91],[866.2,-588.7,12.98],[870.1,-593.1,12.87],[873.9,-597.6,12.67],[877.7,-602,12.36],[881.5,-606.6,12.07],[885.1,-611.2,11.6],[888.6,-615.9,11.2],[892,-620.7,11.05],[895.2,-625.6,11.13],[898.2,-630.7,11.18],[901.1,-635.8,11.33],[904,-640.9,11.66],[906.8,-646.1,11.99],[909.5,-651.3,12.07],[912.1,-656.6,12.28],[914.6,-661.8,12.81],[917.2,-667.1,13.34],[919.8,-672.4,13.87]];
/* prettier-ignore */
const PTS_RING_H0_J: [number, number, number][] = [[150,-112,3.26],[151.2,-104.5,3.18],[152.8,-94,2.9],[154.5,-86.1,2.85],[156.9,-78.3,1.99],[159.8,-70.7,1.13],[163.4,-63.1,0.4],[166.7,-55.6,0.4],[169.4,-48.1,0.4],[171.4,-40.6,0.4],[172.8,-33.1,0.4],[174.5,-25.9,0.4],[176.9,-18.9,0.4],[179.8,-12.3,0.4],[183.4,-5.9,0.4],[189.5,2,0.4],[196.3,7.9,0.4],[203.5,12,0.4],[208.9,16.4,0.4],[212.8,23.4,0.4],[217,29.1,0.4],[224.8,34.7,0.4],[231.9,38.4,0.4],[238.2,42.4,0.4],[244.8,49,0.4],[247.8,56.3,0.4],[251.9,63.1,0.76],[260.5,64.8,1.49],[268.3,62.7,2.28],[278.1,58.4,2.62],[285.5,54.5,2.72],[292.2,49.5,3.01],[298.3,43.7,3.14],[303.8,36.9,3.66],[308.5,29.7,3.96],[312.3,23.8,4.1],[316.3,17.2,4.79],[320.2,9.7,5.67],[324.4,1.3,6.66],[329.1,-5.5,7.53],[336.6,-10.2,7.97],[346.9,-12.8,8.03],[354.4,-14.5,8.27],[361.9,-16.9,9.08],[369.4,-19.8,9.37],[376.9,-23.4,9.46],[384.1,-27,9.42],[391.1,-30.2,8.84],[397.7,-33,8.08],[407,-37.2,7.53],[414.2,-43.8,7.41],[419.4,-53.1,7.2],[422,-60.5,7.21],[425.3,-67.7,7.55],[429.2,-74.5,7.59],[433.8,-80.9,7.51],[438.9,-87,7.25],[444.7,-92,6.93],[451.1,-96.2,6.56],[458.1,-99.4,6.19],[465.6,-102,6.07],[473.1,-105.3,6.21],[480.6,-109.2,6.23],[488.1,-113.8,5.79],[495.6,-118.8,5.68],[501.2,-121.7,5.72],[506.7,-124.5,5.44],[512.4,-127.2,4.97],[518,-129.9,4.98],[523.7,-132.4,5.23],[529.5,-134.9,5.42],[535.3,-137,5.31],[541.3,-138.9,5.26],[547.3,-140.6,5.42],[553.3,-142.4,5.78]];
/* prettier-ignore */
const PTS_RING_H1_H2A: [number, number, number][] = [[919.8,-672.4,13.87],[925.5,-674.5,13.72],[931.2,-676.9,13.66],[936.8,-679.3,13.62],[942.5,-681.5,13.62],[948.3,-683.4,13.49],[954.2,-684.7,13.11],[960.3,-685.1,12.81],[966.4,-684.5,13.04],[972.4,-683.3,13.14],[978.3,-681.8,13.41],[984.2,-680.2,13.48],[990.1,-678.8,13.31],[996.2,-677.9,12.91],[1002.3,-677.6,12.54],[1008.4,-677.8,12.19],[1014.5,-678.1,11.98],[1020.6,-678.3,11.97],[1026.6,-677.8,12.21],[1032.6,-676.3,12.76],[1038.3,-674.2,13.31],[1044,-672,13.86]];
/* prettier-ignore */
const PTS_RING_H1_H2B: [number, number, number][] = [[1168.1,-621.1,4.07],[1175.5,-620.3,3.44],[1183.4,-619.4,3.43],[1191.9,-618.4,4.19],[1200.8,-617.4,4.92],[1209.8,-616.4,4.3],[1218.9,-615.4,4.61],[1227.9,-614.4,4.92],[1236.7,-613.5,4.78],[1245.1,-612.6,4.69],[1252.9,-611.7,4.58],[1260,-611,4.58],[1268.7,-610.1,5.05],[1276.9,-609.4,5.87],[1284.6,-608.7,6.29],[1292.1,-608.1,6.35],[1298.1,-608.3,6.58],[1304.1,-608.6,6.91],[1310.1,-608.9,7.19],[1316,-609.3,7.38],[1322,-609.9,7.63],[1328,-610.7,7.89],[1333.8,-611.7,8.32],[1339.6,-613.3,8.86],[1345.3,-615.3,9.4],[1350.8,-617.6,9.94],[1356.2,-620.2,10.18],[1361.7,-622.7,10.05],[1367.2,-625.1,9.52],[1372.8,-627.3,8.98],[1378.4,-629.2,8.44],[1384.1,-631,7.9],[1389.9,-632.6,7.52],[1395.8,-633.9,6.98],[1401.7,-635,6.44],[1407.6,-635.5,5.91],[1413.6,-635.6,5.4],[1419.6,-635.4,5.44],[1425.6,-635.1,5.66],[1431.6,-635,5.86]];
/* prettier-ignore */
const PTS_RING_H2_H3: [number, number, number][] = [[1431.6,-635,5.86],[1437.5,-635.9,6.4],[1443.4,-636.8,6.93],[1449.2,-637.7,7.47],[1455.1,-638.6,8],[1460.9,-639.8,8.54],[1466.7,-641.2,9.07],[1472.4,-643.1,8.95],[1477.9,-645.3,8.66],[1483.3,-647.7,8.43],[1488.8,-650,8.26],[1494.4,-652,8.4],[1500.1,-653.5,8.83],[1506,-654.8,9.23],[1511.8,-655.8,9.44],[1517.7,-656.2,9.62],[1523.7,-655.8,9.98],[1529.5,-654.6,10.38],[1535.2,-652.8,10.91],[1540.7,-650.6,11.45],[1546.1,-648.2,11.69],[1551.5,-645.6,11.68],[1556.8,-642.9,11.63],[1562,-640.1,11.7],[1567.2,-637.2,11.96],[1572.8,-631.4,12.51],[1578.5,-625.4,13.36],[1584.1,-619.2,13.88],[1589.6,-612.8,13.76],[1594.9,-606.4,13.39],[1600,-600,13.28],[1604.5,-594.1,13.16],[1608.9,-587.9,12.45],[1613.2,-581.6,11.88],[1617.4,-575.2,11.32],[1621.5,-568.6,10.64],[1625.6,-561.9,9.74],[1629.7,-555.1,8.93],[1633.7,-548.1,8.5],[1637.7,-541.2,8.75],[1641.8,-534.1,8.96],[1645.9,-527.1,8.81],[1650,-520,8.66],[1653.9,-513.4,8.85],[1657.8,-506.5,9.35],[1661.7,-499.5,10.27],[1665.7,-492.4,11.2],[1669.7,-485.2,12],[1673.7,-478,11.99],[1677.6,-470.8,11.98],[1681.5,-463.6,11.48],[1685.4,-456.5,11.21],[1689.1,-449.6,11.01],[1692.9,-442.8,10.95],[1695.2,-437.2,10.62],[1697.4,-431.5,10.11],[1699.6,-425.9,9.89],[1701.8,-420.2,9.68],[1704,-414.5,9.51],[1706.2,-408.8,9.25],[1708.3,-403.1,8.75],[1710.5,-397.4,8.6],[1712.6,-391.8,8.55],[1714.8,-386.1,8.58],[1717.1,-380.4,8.48],[1719.2,-374.8,8.34],[1721.2,-369,8.09],[1722.9,-363.2,8.08],[1724.4,-357.3,8.63],[1725.6,-351.3,8.97],[1726.5,-345.3,8.96],[1727.3,-339.3,8.9],[1728,-333.2,9.33],[1728.5,-327.2,9.88],[1728.9,-321.1,10.42],[1729.2,-315,10.6],[1729.5,-309,10.59],[1729.8,-302.9,10.43]];
/* prettier-ignore */
const PTS_RING_H3_H4: [number, number, number][] = [[1729.8,-302.9,10.43],[1729.6,-296.9,10.12],[1729.5,-291,9.86],[1729.3,-285,9.76],[1729.1,-279.1,9.66],[1729,-273.1,9.6],[1729,-267.1,9.68],[1729.1,-261.2,9.66],[1729.2,-255.2,9.46],[1729.3,-249.3,9.33],[1729.2,-243.3,9.32],[1729.1,-237.3,9.3],[1728.7,-231.4,9.25],[1728.1,-225.4,9.18],[1727.3,-219.5,9.11],[1726.5,-213.6,8.9],[1725.8,-207.7,8.9],[1725.1,-201.8,9.12],[1724.5,-195.9,9.37],[1723.9,-189.9,9.12],[1723.3,-184,9.04],[1722.8,-178,8.85],[1722.2,-172.1,8.31],[1721.6,-166.2,8],[1721.1,-160.2,7.94],[1720.5,-154.3,8.16],[1719.9,-148.4,8.62],[1719.3,-142.4,9.05],[1718.6,-136.5,9.04],[1717.9,-130.6,8.96],[1715.6,-122.6,8.81],[1713.3,-114.7,8.36],[1711.2,-106.9,7.44],[1709,-99.3,6.77],[1707,-92,6.58],[1705,-85,6.97],[1702.7,-76.7,7.63],[1700.4,-68.5,7.81],[1698.2,-60.6,7.99],[1696.1,-52.9,7.85],[1694,-45.3,7.37],[1692,-37.8,6.78],[1690,-30.4,6.35],[1688,-23.1,6.14],[1686,-15.9,5.47],[1684.1,-8.6,4.82],[1682.1,-1.4,4.21],[1680.1,5.8,3.91],[1678.1,13.1,3.95],[1676.1,20.5,3.19],[1674,28,3.34],[1671.9,35.5,4.18],[1669.8,43.1,4.42],[1667.7,50.6,4.74],[1665.5,58.1,5.1],[1663.4,65.7,5.54],[1659.9,70.5,5.64],[1656.1,75,5.59],[1652.2,79.5,5.05],[1648.3,84,4.52],[1644.5,88.5,4],[1640.6,93,3.71],[1636.9,97.6,3.53],[1633.3,102.3,3.48],[1629.8,107.1,3.24],[1626.4,111.9,3.01],[1623.1,116.8,2.93],[1619.8,121.8,3.16],[1616.6,126.8,3.42],[1613.5,131.8,3.51],[1610.6,137,3.61],[1607.8,142.2,3.89],[1605.3,147.6,4.08],[1603,153,3.55],[1601,158.6,3.02],[1599.2,164.3,2.48],[1597.6,170,1.95],[1596.1,175.7,1.42],[1594.7,181.5,0.88],[1593.2,187.2,0.54],[1591.8,192.9,0.47],[1590.5,198.7,0.96],[1589.3,204.5,1.49],[1588.2,210.4,2.02],[1587.1,216.2,2.33],[1586,222,2.57]];
/* prettier-ignore */
const PTS_RING_H4_PARWPA: [number, number, number][] = [[1586,222,2.57],[1580.1,222.2,2.62],[1574.3,222.3,2.58],[1568.4,222.4,2.59],[1562.5,222.7,2.89],[1556.7,223.1,3.2],[1550.8,223.9,3.46],[1545.1,224.9,3.72],[1539.3,225.9,3.98],[1533.4,226.5,4.08],[1527.6,226.9,4.36],[1521.7,227,4.43],[1515.8,226.9,4.29],[1509.9,226.8,4.4],[1504.1,226.5,4.25],[1498.2,226.3,3.77],[1492.3,226,3.25],[1486.5,225.6,2.98],[1480.6,225.3,2.68],[1474.8,224.8,2.32],[1468.9,224.4,2.09],[1462,223,2.34],[1452.8,221.1,2.88],[1443.6,219.2,3.95],[1434.6,217.4,4.54],[1426.3,215.6,5.22]];
/* prettier-ignore */
const PTS_RING_H4_PARWPB: [number, number, number][] = [[1358.5,201.4,7.16],[1351.7,199.9,7.58],[1344.3,198.3,7.61],[1336.4,196.7,7.38],[1328.1,194.9,7.97],[1319.5,193,8.14],[1310.6,191.1,7.81],[1301.5,189.2,7.59],[1292.2,187.2,7.21],[1282.7,185.1,6.29],[1273.2,183.1,5.98],[1263.6,181.1,7.07],[1254.1,179,8.19],[1244.7,177,9.3],[1235.4,175,10.39],[1226.3,173.1,11.46],[1217.5,171.2,11.47],[1209,169.4,11.11],[1200.9,167.6,10.16],[1193.1,166,10.23],[1185.9,164.4,9.72],[1179.1,163,9.49],[1173,161.7,9.48],[1167.5,160.5,9.48],[1155.6,158,8.92],[1141.2,155,8.37],[1131.5,153.1,8.62],[1125.3,151.9,8.79],[1121.3,151.2,8.98],[1118.3,150.6,9.14],[1115,150,9.22]];
/* prettier-ignore */
const PTS_RING_PARWP_J: [number, number, number][] = [[1115,150,9.22],[1110.8,149.1,9.2],[1105.9,148,9.01],[1100.3,146.8,8.6],[1094.2,145.5,8.2],[1087.5,144.1,7.94],[1080.3,142.6,8.16],[1072.7,140.9,8.76],[1064.8,139.2,8.75],[1056.5,137.5,8.51],[1048,135.7,7.58],[1039.3,133.8,6.79],[1033,134.2,6.25],[1029.5,137.8,6.06],[1025.7,141.6,5.75],[1021.3,145.7,5.83],[1016.4,150,5.92],[1010.9,154.4,6.3],[1004.9,158.9,6.69],[998.3,163.5,6.96],[990.9,168,7.73],[983,172.4,8.44],[974.4,176.6,9.17],[964.7,180.7,9.83],[954,184.6,10.78],[942.3,187.9,11.31],[929.5,190.7,11.35],[915.7,192.6,11.27],[901.1,193.5,10.31],[885.9,193.2,9.4],[870.3,191.5,8.78],[854.8,188.6,8.14],[839.6,184.3,7.25],[825,178.8,6.15],[811.4,172.4,6.73],[798.9,165.2,5.07],[787.6,157.5,4.01],[777.5,149.6,3.63],[768.6,141.5,3.37],[760.9,133.6,2.93],[754.1,125.8,2.41],[748.4,118.4,2.14],[743.4,111.2,2.24],[739.1,104.5,2.58],[735.3,98.1,2.61],[732.1,92,2.45],[729.4,86.4,2.14],[727,81,1.98],[725,76.2,2.2],[723.3,71.6,2.26],[721.8,67.3,2.23],[719,63.9,2.1],[711,62.2,1.3],[703.1,60.5,0.45],[695.2,58.8,0.4],[687.4,57.2,1.14],[679.7,55.5,2.04],[672.2,53.9,2.72],[664.8,52.3,3.01],[657.5,50.8,2.77],[650.3,49.2,2.91],[643.4,47.7,3.54],[635.6,46,4.45],[627,44.2,5.19],[618.7,42.4,6.17],[610.6,40.6,7.12],[602.8,38.9,8.04],[595.1,37.2,8.95],[587.7,35.5,9.82],[580.3,33.9,10.69],[573.1,32.3,10.3],[565.9,30.7,9.96],[558.7,29.1,9.48],[551.5,27.5,9.22],[544.3,25.9,8.65],[537,24.3,7.87],[529.6,22.7,7.61],[522,21,7.14],[514.4,19.3,6.95],[506.7,17.6,6.04],[514.2,16.1,6.72],[520.3,12.6,7.03],[528,5.2,7.38],[534.1,-1.9,7.53],[539.4,-9.4,8.13],[543.4,-16.9,9.02],[546.3,-24.4,9.35],[547.8,-31.9,9.05],[550.6,-41.3,8.39],[554.8,-47.8,8.61],[560.3,-52.2,8.34],[565.9,-58.8,7.55],[569.7,-64.7,7.03],[571.8,-70.2,6.9],[573.4,-75.9,6.93],[574.3,-81.7,7.03],[574.2,-87.6,6.77],[573.2,-93.4,6.24],[571.7,-99.1,5.71],[569.9,-104.7,5.38],[567.9,-110.2,5.1],[565.8,-115.7,4.84],[563.5,-121.2,4.93],[561,-126.5,5.22],[558.4,-131.8,5.18],[555.8,-137.1,5.42],[553.3,-142.4,5.78]];
/* prettier-ignore */
const PTS_SPUR_PARICUTIN: [number, number, number][] = [[1115,150,9.22],[1115,145.2,8.78],[1115,138.9,8.35],[1115,131.3,7.7],[1115,122.9,6.86],[1115,114,6.52],[1115,105,6.35],[1115,96.2,6.18],[1115,88,5.86],[1115,79.8,5.65],[1115.1,70.9,5.31],[1115.2,61.8,5.09]];
/* prettier-ignore */
const PTS_SPUR_TOWN: [number, number, number][] = [[1586,222,2.57],[1583.8,227.5,2.9],[1581.5,233,3.26],[1579.2,238.5,3.65],[1577,244,4.14],[1574.8,249.6,4.67],[1573,255.2,5.21],[1571.7,261,5.74],[1571.3,266.9,6.15],[1572.1,272.8,6.07],[1573.5,278.6,5.98],[1574.6,284.4,5.7],[1575.6,290.3,5.17],[1577.7,295.9,4.63],[1581.5,300.4,4.1],[1586.3,303.8,3.56],[1591.6,306.5,3.21],[1597.3,308.3,3.66],[1603.2,309,4.11],[1609.1,308.4,4.55],[1614.9,307.1,4.86],[1620.6,305.5,5.09],[1626.3,303.7,5.5],[1632,302,6]];
// The Highstone spur was re-routed to climb past a genuine 50 m shoulder of the Lone Peak (the
// direct H3 -> Highstone line stays under 25 m the whole way — too gentle to need a tunnel — but
// this longer, winding mountain-road alignment is a believable one for a village literally called
// Highstone, and it gives the island its second tunnel on real high ground instead of a flat
// shortcut): H3 climbs the peak's southern flank to a portal at (1826, -460) — the natural ground
// there is 40.3 — bores through (see TUNNELS' "lone-peak-tunnel"), and the far portal at
// (1976, -354) winds back down to Highstone.
/* prettier-ignore */
const PTS_SPUR_HIGHSTONE_A: [number, number, number][] = [[1729.8,-302.9,10.43],[1734.1,-298.7,10.62],[1738.3,-294.5,10.62],[1742.5,-290.3,10.54],[1746.9,-286.2,11.07],[1751.6,-282.5,11.42],[1756.4,-278.9,11.54],[1761.2,-275.3,11.73],[1766.2,-272.1,11.94],[1771.5,-269.4,12.07],[1777.3,-268,12.22],[1783.3,-267.7,12.69],[1789.2,-268.1,13.09],[1795.1,-269.2,13.34],[1800.8,-270.9,13.65],[1806.3,-273.4,13.69],[1811.2,-276.6,13.89],[1815.7,-280.7,14.43],[1819.6,-285.2,14.97],[1823,-290.1,15.49],[1825.9,-295.3,15.93],[1828.2,-300.8,16.47],[1829.9,-306.5,17],[1830.8,-312.4,17.54],[1831.3,-318.4,18.08],[1831.4,-324.4,18.62],[1831.2,-330.3,19.15],[1830.8,-336.3,19.54],[1829.9,-342.2,19],[1826.1,-346.7,19.68],[1819,-351.4,20.66],[1809.9,-356.2,21.57],[1800.5,-361.1,20.67],[1792.2,-365.9,19.57],[1786.6,-370.5,18.74],[1785,-375,18.56],[1787.9,-378.8,19.11],[1794.2,-382.5,19.95],[1802.9,-386.2,21.03],[1812.8,-389.7,22.24],[1822.9,-393.3,23.47],[1832.2,-396.7,24.61],[1839.6,-400.1,25.55],[1844.2,-403.4,26.2],[1844.6,-406.9,26.61],[1839.8,-410.7,27.31],[1831.4,-414.3,28.36],[1820.9,-417.8,29.63],[1810.4,-421.3,30.91],[1801.4,-424.7,29.8],[1795.9,-428.2,29.05],[1795.6,-431.9,28.62],[1800.6,-435.9,28.54],[1809.3,-439.8,29.63],[1819.5,-443.8,30.89],[1829.3,-447.7,32.11],[1836.8,-451.4,33.07],[1840,-455,33.62],[1837.5,-459,34.16],[1830.5,-463.3,35.11],[1821.2,-467.5,36.28],[1811.6,-471.1,37.46],[1803.8,-473.7,37.48],[1800,-475,37.01],[1802.5,-473.4,37.21],[1810.5,-468.7,38.28],[1819.8,-463.5,39.5],[1826,-460,40.32]];
/* prettier-ignore */
const PTS_SPUR_HIGHSTONE_B: [number, number, number][] = [[1976,-354,43.91],[1980,-349.7,43.23],[1986.3,-343.6,42.23],[1993.1,-336.4,41.09],[1998.5,-329.2,40.05],[2000.7,-322.7,39.26],[1998.6,-318.3,38.7],[1993.6,-315.3,38.03],[1986.4,-312.7,37.15],[1977.8,-310.3,36.12],[1968.6,-308,35.03],[1959.6,-305.7,33.97],[1951.4,-303.1,32.98],[1945,-300,32.16],[1937.3,-294.5,31.07],[1930.4,-288.2,30],[1925,-281.8,30.07],[1921.3,-275.5,30.91]];
/* prettier-ignore */
const PTS_SPUR_BASECAMP: [number, number, number][] = [[1431.6,-635,5.86],[1433.4,-640.5,6.33],[1435.1,-646.1,6.86],[1436.9,-651.7,7.25],[1438.9,-657.1,7.32],[1441.1,-662.5,6.97],[1443.5,-667.8,6.59],[1446,-673.1,6.07],[1448.6,-678.3,5.54],[1451.1,-683.5,5.13],[1453.6,-688.8,5.33],[1456,-694.1,5.55],[1458,-701.8,5.81],[1460.1,-709.5,5.92],[1462.1,-717.2,5.12],[1464.2,-724.9,4.6],[1466.3,-732.6,3.9],[1468.4,-740.3,3.66],[1470.5,-748.1,3.82],[1472.6,-755.8,3.48],[1474.7,-763.5,2.72],[1476.7,-771.2,2.34],[1478.8,-778.9,1.94],[1480.9,-786.6,2.2],[1483,-794.3,2.8],[1485,-802,3.72],[1487,-809.7,4.63],[1489.1,-817.3,5.54],[1491.1,-825,6.45],[1493.1,-832.6,6.02],[1495.1,-840.2,5.12],[1497.1,-847.8,4.21],[1499.1,-855.5,3.4],[1501,-863.1,3],[1503,-870.7,2.52],[1505,-878.3,2.42],[1507,-885.9,2.97],[1509,-893.6,3.54],[1511,-901.2,3.33],[1513,-908.9,2.63],[1515.1,-917,1.97],[1517.4,-925.5,2.98],[1519.7,-934.3,4.01],[1522,-943.1,5.05],[1524.3,-952,6.11],[1526.6,-960.8,6.04],[1528.9,-969.3,5.09],[1531,-977.4,5.02],[1533,-985,5.68],[1534.8,-992,6.51],[1536.5,-998.3,7.26],[1537.9,-1003.6,7.89],[1539,-1008,7.95]];
/* prettier-ignore */
/* prettier-ignore */
const PTS_SPUR_TREETOP: [number, number, number][] = [[919.8,-672.4,13.87],[920.1,-678.7,14.43],[920.3,-684.9,15],[920.5,-691.2,15.29],[920.9,-697.5,14.94],[921.4,-703.7,14.76],[922.1,-709.9,14.85],[922.8,-716.2,15.01],[923.5,-722.4,15.29]];
// the road to the Grand Canyon: from Park Station's roundabout over the line and into a cutting to
// the Great Ridge Tunnel's south portal (A); from its north portal across the uplands and up onto
// the canyon's plateau to a car park a short walk from the trailhead (B)
/* prettier-ignore */
const PTS_SPUR_CANYON_A: [number, number, number][] = [[150,-112,3.26],[150,-112.4,3.29],[150.1,-113.3,3.36],[150.2,-114.6,3.46],[150.3,-116.4,3.59],[150.5,-118.6,3.76],[150.7,-121.2,3.96],[150.9,-124.3,4.19],[151.1,-127.8,4.46],[151.5,-131.4,4.74],[151.9,-135.1,5.02],[152.4,-138.9,5.32],[153.1,-142.8,5.62],[153.8,-146.9,5.93],[154.6,-151,6.25],[155.5,-155.3,6.58],[156.5,-159.7,6.93],[157.5,-164.1,7.27],[158.6,-168.5,7.62],[159.7,-173,7.97],[160.8,-177.5,8.32],[162,-182,8.68],[163.2,-186.6,9.03],[164.4,-191.2,9.4],[165.6,-195.8,9.76],[166.8,-200.4,10.12],[168,-204.9,10.48],[169.2,-209.4,10.83],[170.3,-213.9,11.18],[171.3,-218.3,11.52],[172.4,-222.6,11.86],[173.4,-227,12.2],[174.3,-231.2,12.53],[175.2,-235,12.83],[175.9,-238.2,13.08],[176.5,-240.9,13.28],[177,-243,13.45],[177.3,-244.6,13.58],[177.6,-245.7,13.66],[177.7,-246.2,13.7]];
/* prettier-ignore */
const PTS_SPUR_CANYON_B: [number, number, number][] = [[238.1,-586.5,43.68],[238.7,-590.6,43.2],[239.4,-595.1,42.68],[240.2,-600.1,42.1],[241,-605.4,41.48],[241.9,-611.1,40.82],[242.8,-617.1,40.12],[243.8,-623.5,39.37],[244.8,-630.1,38.61],[245.9,-637.1,37.79],[247,-644.4,36.94],[248.2,-651.9,36.07],[249.4,-659.6,35.17],[250.6,-667.6,34.24],[251.9,-675.9,33.28],[253.2,-684.3,32.3],[254.5,-692.9,31.3],[255.9,-701.7,30.27],[257.3,-710.6,29.24],[258.7,-719.7,28.18],[260.1,-728.9,27.11],[261.5,-738.2,26.03],[263,-747.6,24.93],[264.5,-757.1,23.83],[265.9,-766.6,22.72],[267.4,-776.2,21.61],[268.9,-785.8,20.49],[270.4,-795.4,19.37],[271.9,-805.1,18.24],[273.4,-814.7,17.12],[274.9,-824.2,16.02],[276.3,-833.7,14.91],[277.8,-843.2,13.81],[279.2,-852.5,12.73],[280.7,-861.8,11.64],[282.1,-870.9,10.58],[283.5,-879.9,9.54],[284.9,-888.8,8.5],[286.3,-897.5,7.64],[287.6,-906,7.04],[288.9,-914.4,6.86],[290.2,-922.5,6.15],[291.4,-930.4,6.01],[292.6,-938,6.4],[293.8,-945.4,6.04],[294.9,-952.5,5.36],[303.1,-951.7,5.92],[312.2,-950.4,6.64],[318.9,-947.6,6.57],[325.9,-943.1,6.14],[333.1,-936.9,6.09],[340.5,-929.8,6.3],[347.7,-924.7,6.14],[354.5,-921.4,6.04],[364.1,-920,5.89],[373.9,-920.9,6.41],[380.9,-922.3,6.77],[388.1,-924.4,7.06],[395.6,-927,7.29],[403.1,-930.3,7.17],[410.6,-934.2,7.14],[418.1,-938.8,7.17],[425.4,-943.8,7.5],[431.7,-949.2,7.71],[437.1,-954.9,7.71],[441.6,-960.9,8.36],[445.5,-966.7,8.73],[453.3,-971.9,9],[463.1,-972.8,8.95],[470.6,-971.8,8.58],[478.1,-971.7,8.38],[485.6,-972.6,8.56],[493.1,-974.4,8.46],[500.4,-977,8.18],[506.7,-980.3,8.76],[514.5,-986.4,9.41],[520.2,-993.8,10.19],[524.4,-1002,10.23],[527.2,-1010.9,10.56],[530.2,-1019.1,10.13],[536.8,-1023.8,10.98],[546.9,-1025,12.05],[555.3,-1026.4,12.95],[560,-1031.6,13.68],[561.9,-1039.5,14.54],[566.6,-1046.3,15.34],[573.4,-1053.7,15.55],[578.1,-1060.5,15.96],[580,-1068.4,16.82],[575.3,-1074.3,17.61],[566.1,-1074.8,18.58],[557.2,-1072.7,19.54],[550.5,-1070.1,20.3],[543.1,-1066.6,21.15],[535.6,-1063,21.78],[528.1,-1059.8,21.41],[520.6,-1057,22.25],[513.1,-1054.4,23.09],[504.7,-1053,23.98],[500,-1058.4,24.74],[497.7,-1066.6,25.64],[493.3,-1073.6,26.5],[496.7,-1081.4,27.39],[503.6,-1088.8,28.45],[509.7,-1096.3,29.47],[514.4,-1103.8,30.39],[519.1,-1111.7,31.36],[523.8,-1117.8,32.17],[529.7,-1124.5,33.11],[536.9,-1131.9,34.19],[544.4,-1139.4,35.31],[551.9,-1146.9,36.42],[559.4,-1154.4,37.53],[566.9,-1161.9,38.65],[573,-1168.7,39.61],[577.2,-1174.5,40.36],[580,-1181.6,41.16],[582.8,-1190.5,42.14],[587,-1196.3,42.9],[593.1,-1203.1,43.86],[600.2,-1210.4,44.92],[605.3,-1216.7,45.78],[609.5,-1224.5,46.7],[609.5,-1232,47.49],[605.6,-1239.4,48.37],[602.5,-1247.2,49.25],[605.6,-1256.3,50.26],[608.4,-1263.3,51.05],[610,-1271.6,51.94],[610,-1278.6,52.68],[610,-1285.6,53.42],[610,-1293,54.19],[609.8,-1300.2,54.95],[606.7,-1308,55.83],[602.3,-1313.8,56.59],[600.2,-1323,57.59],[600.2,-1332.3,58.56],[602.3,-1342.3,59.64],[604.9,-1349.5,60.43],[608.4,-1356.9,61.29],[612.2,-1364.4,62.17],[615.9,-1371.9,63.06],[619.7,-1379.4,63.94],[623.4,-1386.9,64.82],[626.7,-1393.9,65.63],[630.5,-1403.3,66.69],[632.8,-1411.3,67.56],[631.4,-1419.7,68.46],[627.7,-1426.1,69.24],[621.9,-1433.1,70.2],[614.4,-1440.5,71.31],[606.9,-1447.7,72.39],[599.4,-1454.5,73.45],[591.9,-1460.9,74.49],[584.4,-1467.1,75.51],[576.9,-1473,76.51],[569.4,-1478.5,77.49],[561.9,-1483.8,78.45],[554.4,-1488.5,79.39],[546.9,-1492.3,80.27],[539.4,-1495.2,81.11],[531.9,-1497.2,81.93],[524.7,-1498.8,82.7],[516.3,-1504.2,83.75],[510.6,-1513.1,84.86],[508.3,-1520.6,85.68],[506.6,-1528.1,86.49],[505.5,-1535.6,87.29],[505,-1543.1,88.08],[505.1,-1550.5,88.85],[505.8,-1560.3,89.89],[507.2,-1568.8,90.78],[508.8,-1576.7,91.64],[509.8,-1586.1,92.63],[510,-1593.1,93.37],[510.1,-1600.6,94.15],[510.5,-1608.1,94.94],[511.2,-1615.6,95.73],[512.2,-1623.1,96.53],[513.3,-1630.5,97.31],[513.8,-1637.7,98.06],[513.3,-1647.7,99.12],[512,-1657.1,100.12],[513.6,-1665.8,100.29],[518.8,-1673.8,99.9],[525.8,-1681.3,99.26],[531.4,-1688.8,98.76],[535.6,-1696.3,98.43],[538.4,-1703.3,98.08],[540,-1711.6,97.2],[535.8,-1718.3,96.37],[528.3,-1719.1,95.58],[519.6,-1718.4,94.88],[513.3,-1717.9,94.96]];
/* prettier-ignore */
const PTS_SPUR_KART: [number, number, number][] = [[150,-112,3.26],[153.5,-118.6,3.39],[158.4,-127.8,3.39],[163.2,-135.5,3.21],[168.6,-139.4,3.48],[170.4,-139.1,3.56]];

// the way in from the park: a short road from Park Station's roundabout down the bank to the park's
// own edge (inside the park a buggy roams free; from here on it is on the road network) — without
// it a kid driving out of the park met the Wildlands' "roads only" rule with no road to be on
/* prettier-ignore */
const PTS_SPUR_PARK: [number, number, number][] = [[150,-112,3.26],[145.3,-109.5,3.2],[140.7,-107,2.9],[136,-104.5,2.35],[131.3,-102,1.75],[126.7,-99.5,1.15],[122,-97,0.6]];

/** the 11 road "junction hubs" every spur and the ring itself meet at — also every road's own
 *  anchor height (matches the leg arrays' own first/last y exactly; frozen together so a drifted
 *  leg or a drifted junction can never silently disagree — roads.test.ts checks both). */
export const H0 = { x: 150, z: -112, y: 3.26 }; // Park Station's roundabout, in the pocket between the station, the rails and the kart circuit
/** the east junction: where the road from Park Station meets the ring (the kart circuit fills the
 *  ground between the rails nearer the park, so the ring closes here instead) */
export const HJ = { x: 553.3, z: -142.4, y: 5.78 }; // the east junction's roundabout
export const H1 = { x: 919.8, z: -672.4, y: 13.87 }; // Great Falls Station's roundabout
export const H2 = { x: 1431.6, z: -635, y: 5.86 }; // Great Lake Station's roundabout
export const H3 = { x: 1729.8, z: -302.9, y: 10.43 }; // Lone Peak Station's roundabout
export const H4 = { x: 1586, z: 222, y: 2.57 }; // Sunny Plains Station's roundabout
export const PAR_WP = { x: 1115, z: 150, y: 9.22 }; // the ring's own waypoint nearest Parícutin

// Every junction is a real roundabout: each road that meets there ends at the ring's own centre
// (the ribbon is trimmed to the ring's edge) and leaves it radially, so a car drives round the ring
// from one road to the next. The station ones stand ~40 units back from the line, clear of the
// rails and the platform (ring radius + 12, measured with registry/railway.ts's nearestRail); a road
// that has to reach the far side of the line gets a proper level crossing a little way down from
// the platform (see LEVEL_CROSSINGS), never one across the platform itself.
export const H0_RA = H0;
export const H1_RA = H1;
export const H2_RA = H2;
export const H3_RA = H3;
export const H4_RA = H4;

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
  { id: "spur-park", road: "spur-park", kind: "road", points: mk(PTS_SPUR_PARK) },
  { id: "spur-canyon-a", road: "spur-canyon", kind: "road", points: mk(PTS_SPUR_CANYON_A) },
  { id: "spur-canyon-b", road: "spur-canyon", kind: "road", points: mk(PTS_SPUR_CANYON_B) },
  { id: "spur-treetop", road: "spur-treetop", kind: "road", points: mk(PTS_SPUR_TREETOP) },
];

/** the bridges: the Wild River crossing is the grand one (a multi-pier viaduct, extended well past
 *  the open water so it reads as a real span over the whole green valley, not just the wet gap) */
export const BRIDGES: RoadBridge[] = [
  // the span's own ends land exactly on the two approach roads' own frozen bank points (ring-h1-h2a's
  // last point and ring-h1-h2b's first) — a grand, many-piered deck over the WHOLE carved valley,
  // bank to bank: each end stands where the real ground is back up at road height (a shorter span
  // left the road dropping 7 units off each end onto the valley floor). It runs north of the rail
  // trestle, clear of it. The Outlet Bridge below is laid out the same way.
  { id: "wild-river-viaduct", name: "Wild River Viaduct", road: "ring", style: "grand", x: 1106.05, z: -646.55, heading: 1.1816, span: 134.133, half: 5.2, y0: 13.86, y1: 4.07, rise: 1.8, piers: 9 },
  { id: "lake-outlet-bridge", name: "Outlet Bridge", road: "ring", style: "simple", x: 1392.4, z: 208.5, heading: -1.7773, span: 69.271, half: 4.8, y0: 5.22, y1: 7.16, rise: 0.9, piers: 5 },
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
  { id: "great-ridge-tunnel", name: "Great Ridge Tunnel", road: "spur-canyon", x0: 177.7, z0: -246.2, y0: 13.7, x1: 238.1, z1: -586.5, y1: 43.68, half: 4.8, clear: 5 },
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
  { id: "cp-falls-station", x: 956, z: -670, y: 12.77, heading: 1.64, r: 12, serves: ["Great Falls Station", "Victoria Falls"], jeeps: 2 },
  { id: "cp-treetop", x: 923.5, z: -722.4, y: 15.29, heading: 0.76, r: 12, serves: ["Treetop"], jeeps: 2 },
  { id: "cp-lake-station", x: 1398.5, z: -619, y: 7.4, heading: 1.76, r: 12, serves: ["Great Lake Station", "Lakeside"], jeeps: 3 },
  { id: "cp-peak-station", x: 1800.5, z: -287, y: 14.08, heading: 2.15, r: 12, serves: ["Lone Peak Station"], jeeps: 2 },
  { id: "cp-plains-station", x: 1590.5, z: 288.5, y: 4.28, heading: 0.7, r: 12, serves: ["Sunny Plains Station"], jeeps: 2 },
  { id: "cp-highstone", x: 1921.3, z: -275.5, y: 30.91, heading: 2.3, r: 13, serves: ["Highstone"], jeeps: 2 },
  { id: "cp-town", x: 1632, z: 302, y: 6, heading: 1.86, r: 15, serves: ["Sunnybrook"], jeeps: 2 },
  { id: "cp-paricutin", x: 1115.2, z: 61.8, y: 5.09, heading: 0, r: 13, serves: ["Parícutin"], jeeps: 2 },
  // the spur's own drivable road ends at (1539, -1008) — the final ~107 units up to the camp itself
  // are on foot only (fittingly: real Everest Base Camp treks end the same way, walking the last
  // stretch), matching registry/footpaths.ts's own village<->station walks
  { id: "cp-basecamp", x: 1539, z: -1008, y: 7.95, heading: 0.36, r: 13, serves: ["Everest Base Camp", "Mount Everest"], jeeps: 2 },
  // the canyon road's end: up on the plateau, a short walk from the mule trail's rim trailhead
  // (inside the wonder's reach, off the gorge itself — roadsRail.test.ts checks)
  { id: "cp-canyon", x: 513.3, z: -1717.9, y: 94.96, heading: -1.49, r: 13, serves: ["Grand Canyon"], jeeps: 3 },
  { id: "cp-kart", x: 170.4, z: -139.1, y: 3.56, heading: 1.41, r: 11, serves: ["Cucaino Karts"], jeeps: 2 },
];

export const ROAD_JUNCTIONS: RoadJunction[] = [
  { id: "j-h0", x: H0.x, z: H0.z, y: H0.y, signs: [{ label: "Great Falls 💦", heading: 0.1 }, { label: "Sunny Plains 🌻", heading: 1.2 }, { label: "Cucaino Karts 🏎️", heading: 2.5 }, { label: "Grand Canyon 🏜️", heading: 3.0 }, { label: "Cucaino Park 🎡", heading: -1.08 }] },
  { id: "j-east", x: HJ.x, z: HJ.z, y: HJ.y, signs: [{ label: "Park Station 🎡", heading: -1.27 }, { label: "Sunny Plains 🌻", heading: 0.45 }, { label: "Great Falls 💦", heading: -3.11 }] },
  { id: "j-h1", x: H1.x, z: H1.z, y: H1.y, signs: [{ label: "Park Station 🎡", heading: -0.45 }, { label: "Great Lake 🏖️", heading: 2 }, { label: "Treetop 🌳", heading: 3.1 }] },
  { id: "j-h2", x: H2.x, z: H2.z, y: H2.y, signs: [{ label: "Great Falls 💦", heading: -1.59 }, { label: "Lone Peak 🏔️", heading: 1.72 }, { label: "Everest Base Camp ⛰️", heading: 2.82 }] },
  { id: "j-h3", x: H3.x, z: H3.z, y: H3.y, signs: [{ label: "Great Lake 🏖️", heading: -3.09 }, { label: "Sunny Plains 🌻", heading: -0.03 }, { label: "Highstone ⛰️", heading: 0.8 }] },
  { id: "j-h4", x: H4.x, z: H4.z, y: H4.y, signs: [{ label: "Lone Peak 🏔️", heading: 2.95 }, { label: "Park Station 🎡", heading: -1.54 }, { label: "Sunnybrook 🏪", heading: -0.39 }] },
  { id: "j-parwp", x: PAR_WP.x, z: PAR_WP.z, y: PAR_WP.y, signs: [{ label: "Sunny Plains \u{1F33B}", heading: -2.2 + Math.PI }, { label: "Park Station \u{1F3A1}", heading: -2.45 }, { label: "Parícutin \u{1F30B}", heading: 1.57 }] },
];

/** how far inside a ring's outer edge a road's ribbon is carried, so the two always overlap */
export const RING_JOIN_OVERLAP = 1;
/**
 * A stretch of a road's (densified) points with the parts under its own roundabouts cut away: a
 * road is trimmed only at the ring it really ends on (its first / last point), and the cut lands
 * EXACTLY on the join circle (ROUNDABOUT_OUTER - RING_JOIN_OVERLAP) — a new point is interpolated
 * there. Just dropping the samples inside it left the last kept sample up to 2.5 units short of the
 * ring: a bare strip of ground between the road and the roundabout.
 */
export function trimAtRings(seg: RoadSeg, pts: readonly RoadPoint[]): RoadPoint[] {
  const R = ROUNDABOUT_OUTER - RING_JOIN_OVERLAP;
  const junctionAt = (p: RoadPoint) => ROAD_JUNCTIONS.find((j) => Math.hypot(p.x - j.x, p.z - j.z) < 1);
  const jStart = junctionAt(seg.points[0]);
  const jEnd = junctionAt(seg.points[seg.points.length - 1]);
  const rad = (p: RoadPoint, j: { x: number; z: number }) => Math.hypot(p.x - j.x, p.z - j.z);
  // the point where the stretch a -> b crosses the join circle round j (a inside, b outside)
  const cut = (a: RoadPoint, b: RoadPoint, j: { x: number; z: number }): RoadPoint => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const t = (lo + hi) / 2;
      if (Math.hypot(a.x + (b.x - a.x) * t - j.x, a.z + (b.z - a.z) * t - j.z) < R) lo = t;
      else hi = t;
    }
    return { x: a.x + (b.x - a.x) * hi, z: a.z + (b.z - a.z) * hi, y: a.y + (b.y - a.y) * hi };
  };
  let lo = 0;
  if (jStart) for (let i = 0; i < pts.length; i++) if (rad(pts[i], jStart) < R) lo = i + 1;
  let hi = pts.length;
  if (jEnd) for (let i = pts.length - 1; i >= lo; i--) if (rad(pts[i], jEnd) < R) hi = i;
  const out = pts.slice(lo, hi);
  if (jStart && lo > 0 && lo < pts.length) out.unshift(cut(pts[lo - 1], pts[lo], jStart));
  if (jEnd && hi < pts.length && hi > 0 && hi > lo) out.push(cut(pts[hi], pts[hi - 1], jEnd));
  return out;
}

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
  /** the nearest point on the centre-line itself (ordinary road only) */
  px: number;
  pz: number;
  /** the nearest point's own bed height (plain linear interpolation along the segment) */
  deckY: number;
  kind: RoadKind;
}
const _hit: RoadHit = { d: Infinity, roadId: "", segId: "", lateral: 0, heading: 0, px: 0, pz: 0, deckY: 0, kind: "road" };

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
      _hit.px = px;
      _hit.pz = pz;
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
  // (the real distance along, not the clamped 0..1 one: past either portal there is no tunnel)
  const { side, u, len, along } = tunnelLocal(t, x, z);
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
/** how far (x, z) is from the nearest ordinary road's centre-line (Infinity if none is near) */
export function roadCentreDist(x: number, z: number): number {
  return nearestOrdinaryRoad(x, z).d;
}
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

/** a car park's asphalt apron is a rectangle about its centre, long side along its heading: these
 *  are its half-length and half-width as fractions of the car park's `r` (world/roads draws it from
 *  the same numbers, so what is drawn and what can be driven on are one shape) */
export const CAR_PARK_HALF_LEN = 1.15;
export const CAR_PARK_HALF_WIDTH = 0.82;
/** a car may stray this far past the apron's edge (the verge between it and the road beside it) */
const CAR_PARK_VERGE = 2;
function carParkLocal(cp: CarPark, x: number, z: number) {
  const dx = x - cp.x;
  const dz = z - cp.z;
  return { along: dx * Math.sin(cp.heading) + dz * Math.cos(cp.heading), side: dx * Math.cos(cp.heading) - dz * Math.sin(cp.heading) };
}
/** is (x, z) on a car park's apron (or within `pad` of its edge)? */
export function onCarPark(cp: CarPark, x: number, z: number, pad = CAR_PARK_VERGE): boolean {
  if (Math.abs(x - cp.x) > cp.r * 1.5 + pad || Math.abs(z - cp.z) > cp.r * 1.5 + pad) return false;
  const l = carParkLocal(cp, x, z);
  return Math.abs(l.along) < cp.r * CAR_PARK_HALF_LEN + pad && Math.abs(l.side) < cp.r * CAR_PARK_HALF_WIDTH + pad;
}

/** the nearest car park within `pad` of (x, z), or null */
export function carParkAt(x: number, z: number, pad = 0): CarPark | null {
  for (const cp of CAR_PARKS) if (Math.hypot(x - cp.x, z - cp.z) < cp.r + pad) return cp;
  return null;
}

// ── the driving corridor: a car in the Wildlands may be anywhere within ROAD_CORRIDOR_HALF of a
// road's centre-line, on a bridge deck (within its half), on a tunnel floor (within its half), or
// inside a car park's circle — nowhere else. Pure, allocation-free, tested in roads.test.ts. ──

/** a car's centre keeps to this band of a roundabout's ring (its wheels stay on the asphalt) */
const RING_DRIVE_INNER = ROUNDABOUT_INNER + 0.9;
const RING_DRIVE_OUTER = ROUNDABOUT_OUTER + ROAD_SHOULDER;

/** is (x, z) inside the drivable corridor (road shoulder, bridge deck, tunnel floor, a roundabout's
 *  ring or a car park)? */
export function inRoadCorridor(x: number, z: number): boolean {
  // at a roundabout the only road is the ring: the planted island in the middle is not drivable,
  // even though every road's own centre-line runs on to the junction's centre underneath it
  for (const j of ROAD_JUNCTIONS) {
    const d = Math.hypot(x - j.x, z - j.z);
    if (d < RING_DRIVE_OUTER) return d >= RING_DRIVE_INNER;
  }
  const h = nearestOrdinaryRoad(x, z);
  if (h.d < ROAD_CORRIDOR_HALF) return true;
  for (const b of BRIDGES) {
    const { along, side } = bridgeLocal(b, x, z);
    if (Math.abs(side) < b.half + ROAD_SHOULDER && Math.abs(along) < b.span / 2 + 1) return true;
  }
  for (const t of TUNNELS) {
    const { side, along, len } = tunnelLocal(t, x, z);
    if (Math.abs(side) < t.half + ROAD_SHOULDER && along > -2 && along < len + 2) return true;
  }
  // (a car park's free area is its apron, and a little past it across the verge to the road beside it)
  for (const cp of CAR_PARKS) if (onCarPark(cp, x, z)) return true;
  return false;
}

/**
 * Keep a car's attempted (x, z) inside the drivable corridor: if it's already inside, nothing
 * changes; if it would leave the corridor, the position is projected sideways back onto the
 * corridor's own edge (the same "slide along the edge" idea as the engine's raised-deck railings —
 * never a hard stop, never a teleport back to where the car came from). `prevX/prevZ` are used only
 * as a last-resort fallback, for the rare case (x, z) lands nowhere near any road at all (teleported
 * far away) — then the car simply doesn't move this frame; at a roundabout they also say which way
 * round the car is already going.
 */
export function roadConfine(x: number, z: number, prevX: number, prevZ: number): { x: number; z: number } {
  if (inRoadCorridor(x, z)) return { x, z };
  // driving at a roundabout's island: push straight back out onto the ring, so the car slides round
  // the circle instead of cutting across the middle
  for (const j of ROAD_JUNCTIONS) {
    const d = Math.hypot(x - j.x, z - j.z);
    if (d >= RING_DRIVE_OUTER) continue;
    // the whole step is spent going round (a plain push-out would crawl when driven head-on):
    // turn the way the car is already leaning, or the way the painted arrows point if it's square on
    const rx = prevX - j.x;
    const rz = prevZ - j.z;
    const rl = Math.hypot(rx, rz);
    const step = Math.hypot(x - prevX, z - prevZ);
    if (rl < 0.01 || rl >= RING_DRIVE_OUTER + step + 1) {
      const l = d || 1;
      return { x: j.x + ((x - j.x) / l || 1) * (RING_DRIVE_INNER + 0.02), z: j.z + ((z - j.z) / l) * (RING_DRIVE_INNER + 0.02) };
    }
    const cross = rx * (z - prevZ) - rz * (x - prevX);
    const dir = Math.abs(cross) < 0.2 * rl * step ? 1 : Math.sign(cross);
    const a = Math.atan2(rz, rx) + (dir * step) / RING_DRIVE_INNER;
    return { x: j.x + Math.cos(a) * (RING_DRIVE_INNER + 0.02), z: j.z + Math.sin(a) * (RING_DRIVE_INNER + 0.02) };
  }
  // Everywhere else: the NEAREST point that is on the network — on a road (its rounded end
  // included, so a dead end really is one), a ring, a car park, a bridge deck or a tunnel floor.
  // Nearest means a small step off the edge is answered with a small slide, never a jump.
  let bx = prevX;
  let bz = prevZ;
  let bd = Infinity;
  const take = (cx: number, cz: number) => {
    const d = Math.hypot(cx - x, cz - z);
    if (d < bd && inRoadCorridor(cx, cz)) {
      bd = d;
      bx = cx;
      bz = cz;
    }
  };
  const EPS = 0.02;
  const h = nearestOrdinaryRoad(x, z);
  if (h.d < 500) {
    const k = Math.min(1, (ROAD_CORRIDOR_HALF - EPS) / (h.d || 1));
    take(h.px + (x - h.px) * k, h.pz + (z - h.pz) * k);
  }
  for (const j of ROAD_JUNCTIONS) {
    const d = Math.hypot(x - j.x, z - j.z);
    if (d > RING_DRIVE_OUTER + 60 || d < 0.01) continue;
    const r = Math.max(RING_DRIVE_INNER + EPS, Math.min(RING_DRIVE_OUTER - EPS, d));
    take(j.x + ((x - j.x) / d) * r, j.z + ((z - j.z) / d) * r);
  }
  for (const cp of CAR_PARKS) {
    if (Math.hypot(x - cp.x, z - cp.z) > cp.r + 60) continue;
    const l = carParkLocal(cp, x, z);
    const ha = cp.r * CAR_PARK_HALF_LEN + CAR_PARK_VERGE - EPS;
    const hs = cp.r * CAR_PARK_HALF_WIDTH + CAR_PARK_VERGE - EPS;
    const al = Math.max(-ha, Math.min(ha, l.along));
    const sd = Math.max(-hs, Math.min(hs, l.side));
    take(cp.x + Math.sin(cp.heading) * al + Math.cos(cp.heading) * sd, cp.z + Math.cos(cp.heading) * al - Math.sin(cp.heading) * sd);
  }
  for (const b of BRIDGES) {
    const l = bridgeLocal(b, x, z);
    if (Math.abs(l.along) > b.span / 2 + 60 || Math.abs(l.side) > 60) continue;
    const al = Math.max(-b.span / 2 - 1 + EPS, Math.min(b.span / 2 + 1 - EPS, l.along));
    const sd = Math.max(-(b.half + ROAD_SHOULDER - EPS), Math.min(b.half + ROAD_SHOULDER - EPS, l.side));
    take(b.x + Math.sin(b.heading) * al + Math.cos(b.heading) * sd, b.z + Math.cos(b.heading) * al - Math.sin(b.heading) * sd);
  }
  for (const t of TUNNELS) {
    const l = tunnelLocal(t, x, z);
    if (l.along < -60 || l.along > l.len + 60 || Math.abs(l.side) > 60) continue;
    const ux = (t.x1 - t.x0) / l.len;
    const uz = (t.z1 - t.z0) / l.len;
    const al = Math.max(-2 + EPS, Math.min(l.len + 2 - EPS, l.along));
    const sd = Math.max(-(t.half + ROAD_SHOULDER - EPS), Math.min(t.half + ROAD_SHOULDER - EPS, l.side));
    take(t.x0 + ux * al + uz * sd, t.z0 + uz * al - ux * sd);
  }
  return { x: bx, z: bz };
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
  // the road out of Park Station crosses the line right by the platform
  { id: "park-crossing", x: 170.3, z: -44.7, heading: 0.261, railS: 4269.2 },
  { id: "ridge-crossing", x: 531, z: -314.1, heading: -2.738, railS: 588.1 },
  // the ring road slips across the line between Great Lake and Lone Peak
  { id: "ridgeway-crossing", x: 1658.3, z: -505.6, heading: 0.508, railS: 1874.8 },
  // the road into Sunnybrook crosses the line a little way down from Sunny Plains' platform
  { id: "plains-crossing", x: 1572.3, z: 273.7, heading: 0.237, railS: 2754.5 },
  // the Highstone road crosses the line a little way down from Lone Peak's platform
  { id: "peak-crossing", x: 1772.8, z: -269.1, heading: 1.334, railS: 2145.3 },
  { id: "tunnel-crossing", x: 156.8, z: -161.2, heading: 2.918, railS: 182.7 },
];
/** registry/railway.ts's RAIL_LENGTH and world/railway/index.ts's own TRAIN_V, copied (leaf-safe:
 *  world/railway/index.ts touches three.js, so its TRAIN_V is copied rather than imported — same
 *  reasoning as every other "copy the number" comment in this file) */
export const RAIL_LENGTH_COPY = 4280.77;
export const TRAIN_V_COPY = 24;
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
