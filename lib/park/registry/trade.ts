// Travelling traders: villagers who carry goods between the island's trade posts by cart, boat and
// train, so the Wildlands feel like one connected place, not a handful of separate dioramas.
//
// A NETWORK, driven by this registry. Every TRADE_POST lists what it makes and what it wants;
// TRADE_ROUTES is worked out from the posts' own road/dock/station ends plus the park's existing
// trails, rails and water. A new settlement (the rainforest treehouse village, a mountain village,
// a market town — all "coming next", per CLAUDE.md) joins the network just by:
//   1. filling in a `trade` field on its SettlementDef (registry/settlements.ts) — makes/wants, done
//   2. if it should have its own cart road or boat run, writing one more route generator below
// Nothing else needs to change: the renderer (world/trade/), the traders' day (world/trade/plan.ts)
// and the tests all just read TRADE_POSTS / TRADE_ROUTES.
//
// The cart road itself (CART_ROAD, LAKESIDE_ROAD_END, MARKET_ROAD_END, nearCartRoad) lives in
// ./cartRoad.ts, re-exported below — it has to be its own module so registry/terrain.ts and
// world/fantasy/{mask,wilds}.ts can level/colour/avoid the road without this file's own
// registry/harbours.ts import becoming circular (harbours.ts needs terrain.ts's groundY at its own
// module scope: terrain.ts -> trade.ts -> harbours.ts -> terrain.ts).
//
// Pure data + maths, deterministic, no three.js (same split as registry/settlements.ts).
import { smooth, cumLength, type P2 } from "./geom2d";
import { SETTLEMENTS } from "./settlements";
import { LANDS } from "./places";
import { STATIONS } from "./railway";
import { WILD_OUTLET_POINTS } from "./wildWater";
import { VILLAGE_MARKET, VILLAGE_ISLAND } from "./villageIsland";
import { DOCKS, MOORINGS, worldSeaDepth } from "./harbours";
import { CART_ROAD, LAKESIDE_ROAD_END, MARKET_ROAD_END, nearCartRoad, type CartRoad } from "./cartRoad";

export { CART_ROAD, nearCartRoad, type CartRoad };

// ── goods: what a crate on a cart, a boat or a station platform looks like ──
export interface Good {
  id: string;
  name: string;
  emoji: string;
  /** the crate/basket colour the renderer paints this good */
  color: string;
}
export const GOODS: Good[] = [
  { id: "fish", name: "smoked fish", emoji: "🐟", color: "#6fa8c9" },
  { id: "baskets", name: "reed baskets", emoji: "🧺", color: "#b08a4e" },
  { id: "shells", name: "shells", emoji: "🐚", color: "#f0d9c0" },
  { id: "bread", name: "bread", emoji: "🍞", color: "#d9a85c" },
  { id: "candy", name: "candy", emoji: "🍬", color: "#ff6fa5" },
  { id: "toys", name: "toys", emoji: "🧸", color: "#7a5cff" },
  { id: "pearls", name: "pearls", emoji: "🦪", color: "#dfeaf0" },
  { id: "coconut", name: "coconut", emoji: "🥥", color: "#8a5a36" },
  { id: "fruit", name: "fruit", emoji: "🍎", color: "#e0503c" },
  { id: "wool", name: "yak wool", emoji: "🧶", color: "#d9c9a8" },
  { id: "cheese", name: "mountain cheese", emoji: "🧀", color: "#f0c457" },
];
const GOODS_BY_ID = new Map(GOODS.map((g) => [g.id, g]));
export const goodOf = (id: string): Good => GOODS_BY_ID.get(id) ?? GOODS[0];

// ── trade posts ──
export type TradeMode = "cart" | "boat" | "train";
export interface TradePost {
  id: string;
  name: string;
  emoji: string;
  /** where traders unload and trade (the stall/market spot) */
  x: number;
  z: number;
  makes: string[];
  wants: string[];
  /** where a cart road reaches this post, if it has cart access */
  road?: P2;
  /** where a boat reaches this post (in the water, clear of any dock), if it has boat access */
  dock?: P2;
  /** the railway station this post's traders walk to/from, if it has train access */
  stationId?: string;
}

const LAKESIDE = SETTLEMENTS.find((s) => s.id === "lakeside");
if (!LAKESIDE?.trade || !LAKESIDE.pier) throw new Error("trade: lakeside needs a `trade` field and a pier");
const MARKET_LAND = LANDS.find((l) => l.id === "market");
if (!MARKET_LAND) throw new Error("trade: no Market Street land in the registry");
if (!STATIONS.find((s) => s.id === "park-station") || !STATIONS.find((s) => s.id === "lake-station")) throw new Error("trade: park-station / lake-station missing from the railway");

/** the point `from` out to the first spot along the ray towards `toward` that's deep enough
 *  (>= draft) and clear of everything in `avoid` — used to find where a boat floats just off a
 *  pier or a jetty without needing to hand-place every mooring-safe spot */
function offshoreOf(from: P2, toward: P2, draft: number, avoid: { x: number; z: number; r: number }[], depthAt: (x: number, z: number) => number, maxD = 90): P2 {
  const dx = toward[0] - from[0];
  const dz = toward[1] - from[1];
  const l = Math.hypot(dx, dz) || 1;
  const ux = dx / l;
  const uz = dz / l;
  for (let d = 1; d <= maxD; d += 0.5) {
    const x = from[0] + ux * d;
    const z = from[1] + uz * d;
    if (depthAt(x, z) < draft) continue;
    if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < a.r)) continue;
    return [x, z];
  }
  throw new Error("trade: no safe offshore point found");
}
const norm = (dx: number, dz: number): P2 => {
  const l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
};
const boundingCircle = (pts: { x: number; z: number }[]): { x: number; z: number; r: number } => {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
  const r = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.z - cz))) + 2;
  return { x: cx, z: cz, r };
};

/** a sailboat/barge's draft, plus a safety margin (BOAT_CAPS.sailboat.draft = 1 in characters/mounts) —
 *  generous, since the route is then smoothed (Catmull-Rom can overshoot a hair close to a bank) */
const SAIL_DRAFT = 1.8;

// ── Lakeside's dock: just past the pier tip, out in water deep enough for the trading boat,
// clear of its own canoe loops ──
const lakesideDock: P2 = (() => {
  const pier = LAKESIDE.pier!;
  const [ux, uz] = norm(pier.bx - pier.ax, pier.bz - pier.az);
  const avoid = LAKESIDE.canoeLoops.filter((l) => l.length > 2).map(boundingCircle);
  return offshoreOf([pier.bx, pier.bz], [pier.bx + ux * 100, pier.bz + uz * 100], SAIL_DRAFT, avoid, worldSeaDepth, 70);
})();

// ── Coralcove's dock: out past Shellharbour Jetty, clear of the craft already moored there ──
const CORAL_DOCK_POINT = DOCKS.find((d) => d.id === "coralcove");
if (!CORAL_DOCK_POINT) throw new Error("trade: no coralcove dock in harbours.ts");
const coralcoveDock: P2 = (() => {
  const [ux, uz] = norm(CORAL_DOCK_POINT.x - VILLAGE_ISLAND.x, CORAL_DOCK_POINT.z - VILLAGE_ISLAND.z);
  const avoid = MOORINGS.filter((m) => m.dock === "coralcove").map((m) => ({ x: m.x, z: m.z, r: 8 }));
  return offshoreOf([CORAL_DOCK_POINT.x, CORAL_DOCK_POINT.z], [CORAL_DOCK_POINT.x + ux * 100, CORAL_DOCK_POINT.z + uz * 100], SAIL_DRAFT, avoid, worldSeaDepth, 70);
})();

// Every Wildlands settlement with a `trade` field joins the network automatically, just by being
// in SETTLEMENTS — a new one (Treetop, Highstone, …) needs nothing added here. Lakeside alone also
// gets a cart road and a dock (its own SettlementDef has a pier and sits on the Lakeside<->Market
// cart road); the others reach the network by train and on foot (registry/footpaths.ts), which only
// need a `stationId` — already on every SettlementDef.
const SETTLEMENT_POSTS: TradePost[] = SETTLEMENTS.filter((s): s is typeof s & { trade: { makes: string[]; wants: string[] } } => !!s.trade).map((s) => ({
  id: s.id,
  name: s.name,
  emoji: s.emoji,
  x: s.x,
  z: s.z,
  makes: s.trade.makes,
  wants: s.trade.wants,
  road: s.id === "lakeside" ? LAKESIDE_ROAD_END : undefined,
  dock: s.id === "lakeside" ? lakesideDock : undefined,
  stationId: s.stationId,
}));

export const TRADE_POSTS: TradePost[] = [
  ...SETTLEMENT_POSTS,
  {
    id: "market",
    name: "Market Street",
    emoji: "🏪",
    x: MARKET_LAND.x,
    z: MARKET_LAND.z,
    makes: ["candy", "bread", "toys"],
    wants: ["fish", "baskets", "shells"],
    road: MARKET_ROAD_END,
    stationId: "park-station",
  },
  {
    id: "coralcove",
    name: "Shellharbour",
    emoji: "🐚",
    x: VILLAGE_MARKET.x,
    z: VILLAGE_MARKET.z,
    makes: ["shells", "pearls", "coconut"],
    wants: ["fish", "baskets", "candy"],
    dock: coralcoveDock,
  },
];
export const tradePostOf = (id: string): TradePost | undefined => TRADE_POSTS.find((p) => p.id === id);

// ── the boat route: Lakeside's pier <-> Coralcove's Shellharbour Jetty, across the Great Lake,
// down its outlet and round the open sea ──

function buildBoatRoute(): P2[] {
  const outletMouth = WILD_OUTLET_POINTS[0];
  // from just off Lakeside's pier (lakesideDock, already checked deep and clear of the canoe
  // loops), across the open lake (deep the whole way — the outlet drains the lake's middle, not a
  // shallow bay) round towards the outlet's mouth
  const lakeLeg = smooth([lakesideDock, outletMouth], 24);
  const outletEnd = WILD_OUTLET_POINTS[WILD_OUTLET_POINTS.length - 1];
  // the open sea, from where the outlet meets it round to Coralcove's jetty
  const seaLeg = smooth([outletEnd, coralcoveDock], 30);
  return [lakesideDock, ...lakeLeg, ...WILD_OUTLET_POINTS.slice(1, -1), ...seaLeg];
}
export const BOAT_ROUTE: P2[] = buildBoatRoute();

// ── routes: generated from the posts + the geometry above ──
export interface TradeRoute {
  id: string;
  from: string;
  to: string;
  mode: TradeMode;
  /** the walkable/sailable polyline, running from `from`'s post to `to`'s (empty for "train": the
   *  train's own timetable drives it) */
  points: P2[];
  length: number;
}
function routeOf(id: string, from: string, to: string, mode: TradeMode, points: P2[]): TradeRoute {
  const len = cumLength(points);
  return { id, from, to, mode, points, length: len[len.length - 1] };
}
export const TRADE_ROUTES: TradeRoute[] = [
  // CART_ROAD.points runs Market Street -> Lakeside (the order it was built in); reversed here so
  // every route's polyline reads `from` -> `to`, same convention regardless of mode
  routeOf("cart-lakeside-market", "lakeside", "market", "cart", [...CART_ROAD.points].reverse()),
  routeOf("boat-lakeside-coralcove", "lakeside", "coralcove", "boat", BOAT_ROUTE),
  routeOf("train-lakeside-market", "lakeside", "market", "train", []),
  // Treetop and Highstone are station villages too (world/trade/plan.ts's train-riding traders walk
  // village <-> their own station on registry/footpaths.ts, then ride the loop to the other end) —
  // a "train" route never carries its own polyline (the single train's own run drives it; see
  // world/trade/index.ts), same as the original Park<->Lake link above
  routeOf("train-treetop-lakeside", "treetop", "lakeside", "train", []),
  routeOf("train-highstone-market", "highstone", "market", "train", []),
  routeOf("train-treetop-highstone", "treetop", "highstone", "train", []),
];
export const tradeRouteOf = (id: string): TradeRoute | undefined => TRADE_ROUTES.find((r) => r.id === id);

/** every post a trader could start from/travel to, reachable (for tests and the renderer) */
export const TRADE_POST_IDS: string[] = TRADE_POSTS.map((p) => p.id);
