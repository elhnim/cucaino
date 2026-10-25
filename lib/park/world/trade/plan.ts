// Traders' lives: pure logic, no three.js (tested in plan.test.ts). A trader belongs to a home
// trade post (registry/trade.ts TRADE_POSTS), travels a route (cart or boat) to another post,
// trades there (their cargo becomes what the other post makes) and comes home, every park day
// (PARK_DAY_SECONDS = 15 real minutes — world/atmosphere.ts).
//
// Position is a pure FUNCTION OF TIME + a trader's own schedule (no stepped simulation, no stored
// state): traderStateAtTime(def, t) always returns the same answer for the same t, so a trader far
// from the kid costs nothing, and shows up in the right place however the kid gets there (walking,
// teleporting, the train, a dragon). A few traders at staggered start times keep someone usually on
// the move. Train travellers aren't here — the train's own run is its own stateful thing
// (world/railway/index.ts), so riders are read off its live position instead; see world/trade/index.ts.
import { tradePostOf, tradeRouteOf, goodOf, type TradeMode } from "../../registry/trade";
import { cumLength, smooth, type P2 } from "../../registry/geom2d";
import { PARK_DAY_SECONDS } from "../atmosphere";
import { footpathOf } from "../../registry/footpaths";
import { STATIONS, RAIL_LENGTH } from "../../registry/railway";
import { wildWaterSdf } from "../../registry/wildWater";

/** real seconds per park-hour (a park day is 24 of these) */
export const HOUR_SECONDS = PARK_DAY_SECONDS / 24;

export type TraderPhase = "home" | "outbound" | "trading-away" | "inbound" | "trading-home";

export interface TraderDef {
  id: string;
  name: string;
  /** "cart" or "boat" — which TRADE_ROUTE they travel (never "train": see world/trade/index.ts) */
  mode: Exclude<TradeMode, "train">;
  homeId: string;
  otherId: string;
  /** the good they set out with (one of the home post's `makes`) */
  cargoOut: string;
  /** the good they trade it for at the other post (one of its `makes`) */
  cargoBack: string;
  /** hour of day (0-24) they set off from home each cycle */
  departHour: number;
  /** units per park-hour along the route */
  speed: number;
  /** how long they stand trading at each end before heading back */
  lingerHours: number;
  /** a short, true fact they tell the kid at the stall (<= 140 chars) */
  fact: string;
}

/** units/park-hour for cart ~2-3 m/s and boat ~4-6 m/s (x1.6 units/m), per the spec */
const CART_SPEED = 2.5 * 1.6 * HOUR_SECONDS; // ~150 units/park-hour
const BOAT_SPEED = 5 * 1.6 * HOUR_SECONDS; // ~300 units/park-hour

export const TRADERS: TraderDef[] = [
  {
    id: "pike-cart",
    name: "Pike's cart",
    mode: "cart",
    homeId: "lakeside",
    otherId: "market",
    cargoOut: "fish",
    cargoBack: "bread",
    departHour: 5.5,
    speed: CART_SPEED,
    lingerHours: 1.5,
    fact: "Long ago people traded by swapping goods, no coins at all — that's called bartering!",
  },
  {
    id: "nugget-cart",
    name: "The candy cart",
    mode: "cart",
    homeId: "market",
    otherId: "lakeside",
    cargoOut: "candy",
    cargoBack: "baskets",
    departHour: 8,
    speed: CART_SPEED,
    lingerHours: 1.5,
    fact: "A cart with four wheels rolls easier than a sledge — wheels turn sliding into rolling.",
  },
  {
    id: "marsh-cart",
    name: "Marsh's cart",
    mode: "cart",
    homeId: "lakeside",
    otherId: "market",
    cargoOut: "baskets",
    cargoBack: "toys",
    departHour: 12,
    speed: CART_SPEED,
    lingerHours: 1.5,
    fact: "Reed baskets are woven wet — reeds bend easily when damp, then stiffen as they dry.",
  },
  {
    id: "heron-boat",
    name: "Heron's barge",
    mode: "boat",
    homeId: "lakeside",
    otherId: "coralcove",
    cargoOut: "fish",
    cargoBack: "shells",
    departHour: 6.5,
    speed: BOAT_SPEED,
    lingerHours: 1,
    fact: "Salt was once so prized that Roman soldiers were sometimes paid with it.",
  },
  {
    id: "coot-boat",
    name: "Coot's barge",
    mode: "boat",
    homeId: "coralcove",
    otherId: "lakeside",
    cargoOut: "pearls",
    cargoBack: "baskets",
    departHour: 9.5,
    speed: BOAT_SPEED,
    lingerHours: 1,
    fact: "A pearl grows inside an oyster, layer by layer, round a tiny grain of sand.",
  },
];

for (const d of TRADERS) {
  const home = tradePostOf(d.homeId);
  const other = tradePostOf(d.otherId);
  if (!home || !other) throw new Error(`plan: trader ${d.id} names a post that doesn't exist`);
  if (!home.makes.includes(d.cargoOut)) throw new Error(`plan: ${d.id} sets out with ${d.cargoOut}, which ${home.name} doesn't make`);
  if (!other.makes.includes(d.cargoBack)) throw new Error(`plan: ${d.id} trades for ${d.cargoBack}, which ${other.name} doesn't make`);
  if (d.fact.length > 140) throw new Error(`plan: ${d.id}'s fact is too long for a speech bubble`);
}

// ── the route each trader walks/sails (points run home -> other; home/other posts share one route
// per mode+pair, so every cart trader between the same two posts reads the same polyline) ──
const ROUTE_ID: Record<string, string> = {
  "lakeside,market,cart": "cart-lakeside-market",
  "market,lakeside,cart": "cart-lakeside-market",
  "lakeside,coralcove,boat": "boat-lakeside-coralcove",
  "coralcove,lakeside,boat": "boat-lakeside-coralcove",
};
interface RouteCache {
  points: P2[];
  cum: Float64Array;
  /** true if this trader's home is the route's own `to` end (so they travel it reversed) */
  reversed: boolean;
}
const routeCache = new Map<string, RouteCache>();
function routeFor(def: TraderDef): RouteCache {
  let c = routeCache.get(def.id);
  if (c) return c;
  const routeId = ROUTE_ID[`${def.homeId},${def.otherId},${def.mode}`];
  const route = routeId ? tradeRouteOf(routeId) : undefined;
  if (!route) throw new Error(`plan: no route for ${def.id} (${def.homeId} -> ${def.otherId}, ${def.mode})`);
  c = { points: route.points, cum: cumLength(route.points), reversed: route.from !== def.homeId };
  routeCache.set(def.id, c);
  return c;
}

/** a point `f` (0..1) along a route, home -> other, plus the heading there */
function alongRoute(r: RouteCache, f: number): { x: number; z: number; yaw: number } {
  const u = r.reversed ? 1 - f : f;
  const total = r.cum[r.cum.length - 1];
  const target = Math.min(total, Math.max(0, u * total));
  let lo = 0;
  let hi = r.cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (r.cum[m] <= target) lo = m;
    else hi = m;
  }
  const segLen = r.cum[hi] - r.cum[lo] || 1;
  const t = (target - r.cum[lo]) / segLen;
  const a = r.points[lo];
  const b = r.points[hi];
  const x = a[0] + (b[0] - a[0]) * t;
  const z = a[1] + (b[1] - a[1]) * t;
  let yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
  if (r.reversed) yaw += Math.PI;
  return { x, z, yaw };
}

// ── each trader's schedule: set off, travel, trade, travel home, trade/rest — a whole round trip
// fits in a cycle of whole park days (24h, or 48h if the round trip itself runs past one day; the
// spec explicitly allows a long trip to span the day and rest overnight at the far end) ──
export interface TraderSchedule {
  /** depart home */
  t0: number;
  /** arrive + start trading at the other post */
  t1: number;
  /** set off home again */
  t2: number;
  /** arrive home + start unloading */
  t3: number;
  /** back to resting at home, ready for the next cycle */
  t4: number;
  cycleHours: number;
}
const scheduleCache = new Map<string, TraderSchedule>();
export function scheduleOf(def: TraderDef): TraderSchedule {
  let s = scheduleCache.get(def.id);
  if (s) return s;
  const route = routeFor(def);
  const oneWay = route.cum[route.cum.length - 1] / def.speed;
  const t0 = def.departHour;
  const t1 = t0 + oneWay;
  const t2 = t1 + def.lingerHours;
  const t3 = t2 + oneWay;
  const t4 = t3 + def.lingerHours;
  const cycleHours = Math.max(24, Math.ceil(t4 / 24) * 24);
  s = { t0, t1, t2, t3, t4, cycleHours };
  scheduleCache.set(def.id, s);
  return s;
}

export interface TraderState {
  id: string;
  x: number;
  z: number;
  yaw: number;
  phase: TraderPhase;
  /** the good currently in their cart/hold (always one or the other — never empty-handed) */
  cargo: string;
  /** which post they're standing at right now (home/other), or null while travelling */
  atPostId: string | null;
}

/** where a trader is, what they're carrying and what they're doing, at absolute time `t` (seconds)
 *  — a pure function: same t always gives the same answer, so this costs nothing for a trader far
 *  from the kid, and is correct the instant the kid arrives anywhere near them. */
export function traderStateAtTime(def: TraderDef, t: number): TraderState {
  const sch = scheduleOf(def);
  const route = routeFor(def);
  const hours = t / HOUR_SECONDS;
  let cyc = hours % sch.cycleHours;
  if (cyc < 0) cyc += sch.cycleHours;
  const home = tradePostOf(def.homeId)!;
  const other = tradePostOf(def.otherId)!;

  if (cyc < sch.t0) return { id: def.id, x: home.x, z: home.z, yaw: 0, phase: "home", cargo: def.cargoOut, atPostId: def.homeId };
  if (cyc < sch.t1) {
    const f = (cyc - sch.t0) / (sch.t1 - sch.t0);
    const p = alongRoute(route, f);
    return { id: def.id, x: p.x, z: p.z, yaw: p.yaw, phase: "outbound", cargo: def.cargoOut, atPostId: null };
  }
  if (cyc < sch.t2) return { id: def.id, x: other.x, z: other.z, yaw: 0, phase: "trading-away", cargo: def.cargoBack, atPostId: def.otherId };
  if (cyc < sch.t3) {
    const f = (cyc - sch.t2) / (sch.t3 - sch.t2);
    const p = alongRoute(route, 1 - f);
    return { id: def.id, x: p.x, z: p.z, yaw: p.yaw + Math.PI, phase: "inbound", cargo: def.cargoBack, atPostId: null };
  }
  if (cyc < sch.t4) return { id: def.id, x: home.x, z: home.z, yaw: 0, phase: "trading-home", cargo: def.cargoBack, atPostId: def.homeId };
  return { id: def.id, x: home.x, z: home.z, yaw: 0, phase: "home", cargo: def.cargoOut, atPostId: def.homeId };
}

/** every trader's state at time `t` */
export function allTraderStates(t: number): TraderState[] {
  return TRADERS.map((d) => traderStateAtTime(d, t));
}

// ── train-riding traders: Treetop, Highstone and Market Street are all station villages too far
// apart to cart or sail between — a trader walks home -> their own station (registry/footpaths.ts,
// or a plain straight dry path for Lakeside/Market, already right by theirs), rides the single
// Wildlands Railway train to the other village's station (invisible while "riding" — the train's
// own run is its own stateful thing, read live instead; see world/trade/index.ts's ambient
// carriage riders), then walks in to trade, and back again the same way. Still a pure function of
// time throughout: the ride's length is a fixed nominal duration (the shorter way round the loop,
// at the train's own top speed), not tied to the actual train's position. ──

/** units/s the single Wildlands Railway train runs at (kept in step with world/railway/index.ts's
 *  TRAIN_V — duplicated rather than imported, so this pure logic module never pulls in three.js) */
const NOMINAL_TRAIN_V = 24;
/** a brisk walking pace for a trader on foot, in units per park-hour */
const WALK_TRADER_SPEED = 2.2 * 1.6 * HOUR_SECONDS;

export interface TrainTraderDef {
  id: string;
  name: string;
  mode: "train";
  homeId: string;
  otherId: string;
  cargoOut: string;
  cargoBack: string;
  /** hour of day they set off walking from home each cycle */
  departHour: number;
  /** how long they stand trading at each end before heading back */
  lingerHours: number;
  /** a short, true fact they tell the kid at the stall (<= 140 chars) */
  fact: string;
}

export const TRAIN_TRADERS: TrainTraderDef[] = [
  {
    id: "canopy-train",
    name: "Mango's basket",
    mode: "train",
    homeId: "treetop",
    otherId: "lakeside",
    cargoOut: "fruit",
    cargoBack: "fish",
    departHour: 7,
    lingerHours: 1.5,
    fact: "The railway runs right round the Wildlands — hop on at any station and ride to the next!",
  },
  {
    id: "peakfolk-train",
    name: "Flax's pack",
    mode: "train",
    homeId: "highstone",
    otherId: "market",
    cargoOut: "wool",
    cargoBack: "candy",
    departHour: 9,
    lingerHours: 1.5,
    fact: "A steam engine boils water to make the pressure that pushes its wheels round.",
  },
  {
    id: "canopy-peak-train",
    name: "Tamarind's basket",
    mode: "train",
    homeId: "treetop",
    otherId: "highstone",
    cargoOut: "baskets",
    cargoBack: "cheese",
    departHour: 13,
    lingerHours: 1.5,
    fact: "The Wildlands Railway climbs from steamy rainforest to snowy mountain in one ride!",
  },
];

for (const d of TRAIN_TRADERS) {
  const home = tradePostOf(d.homeId);
  const other = tradePostOf(d.otherId);
  if (!home || !other) throw new Error(`plan: train trader ${d.id} names a post that doesn't exist`);
  if (!home.stationId || !other.stationId) throw new Error(`plan: train trader ${d.id} needs both ${d.homeId} and ${d.otherId} to have a station`);
  if (!home.makes.includes(d.cargoOut)) throw new Error(`plan: ${d.id} sets out with ${d.cargoOut}, which ${home.name} doesn't make`);
  if (!other.makes.includes(d.cargoBack)) throw new Error(`plan: ${d.id} trades for ${d.cargoBack}, which ${other.name} doesn't make`);
  if (d.fact.length > 140) throw new Error(`plan: ${d.id}'s fact is too long for a speech bubble`);
}

/** nudge a straight line clear of the Wildlands' water (the same "climb the water-distance field
 *  uphill" trick registry/footpaths.ts's pushPathDry uses) — a fallback walk for a post that sits
 *  right by its own station already (Lakeside, Market Street) and so has no dedicated footpath */
function straightDryPath(a: P2, b: P2): P2[] {
  return smooth([a, b], 8).map(([x0, z0]) => {
    let x = x0;
    let z = z0;
    for (let i = 0; i < 40 && wildWaterSdf(x, z) < 3; i++) {
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
/** a post -> its own station walk, oriented post -> station (registry/footpaths.ts's own
 *  village-edge -> station polyline, or a plain straight dry walk for a post without one) */
function walkToStation(postId: string): P2[] {
  const fp = footpathOf(postId);
  if (fp) return fp.points;
  const post = tradePostOf(postId)!;
  const st = STATIONS.find((s) => s.id === post.stationId);
  if (!st) throw new Error(`plan: post ${postId} has no station to walk a train trader to`);
  return straightDryPath([post.x, post.z], [st.x, st.z]);
}

interface TrainRouteCache {
  homeFwd: P2[];
  homeFwdCum: Float64Array;
  homeRev: P2[];
  homeRevCum: Float64Array;
  otherFwd: P2[];
  otherFwdCum: Float64Array;
  otherRev: P2[];
  otherRevCum: Float64Array;
  /** the nominal one-way ride, the shorter way round the loop at the train's own top speed */
  rideHours: number;
}
const trainRouteCache = new Map<string, TrainRouteCache>();
function trainRouteFor(def: TrainTraderDef): TrainRouteCache {
  let c = trainRouteCache.get(def.id);
  if (c) return c;
  const home = tradePostOf(def.homeId)!;
  const other = tradePostOf(def.otherId)!;
  const homeSt = STATIONS.find((s) => s.id === home.stationId)!;
  const otherSt = STATIONS.find((s) => s.id === other.stationId)!;
  const homeFwd = walkToStation(def.homeId);
  const otherFwd = walkToStation(def.otherId);
  const dAlong = Math.abs(homeSt.s - otherSt.s);
  const rideHours = Math.min(dAlong, RAIL_LENGTH - dAlong) / NOMINAL_TRAIN_V / HOUR_SECONDS;
  c = {
    homeFwd,
    homeFwdCum: cumLength(homeFwd),
    homeRev: [...homeFwd].reverse(),
    homeRevCum: cumLength([...homeFwd].reverse()),
    otherFwd,
    otherFwdCum: cumLength(otherFwd),
    otherRev: [...otherFwd].reverse(),
    otherRevCum: cumLength([...otherFwd].reverse()),
    rideHours,
  };
  trainRouteCache.set(def.id, c);
  return c;
}

/** a point `f` (0..1) along a plain (non-reversible — always walked the one way it's given) path */
function alongWalk(pts: P2[], cum: Float64Array, f: number): { x: number; z: number; yaw: number } {
  const total = cum[cum.length - 1] || 0;
  const target = Math.min(total, Math.max(0, f * total));
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (cum[m] <= target) lo = m;
    else hi = m;
  }
  const segLen = cum[hi] - cum[lo] || 1;
  const t = (target - cum[lo]) / segLen;
  const a = pts[lo];
  const b = pts[hi];
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

export interface TrainTraderSchedule {
  t0: number; // depart home, walking
  t1a: number; // arrive home station, boards (rides from here)
  t1b: number; // arrives at the other station, walks on
  t1: number; // arrives at the other post, starts trading
  t2: number; // sets off home, walking
  t2a: number; // arrives back at the other station, boards
  t2b: number; // arrives at the home station, walks on
  t3: number; // arrives home, starts trading-home
  t4: number; // back to resting at home
  cycleHours: number;
}
const trainScheduleCache = new Map<string, TrainTraderSchedule>();
export function trainScheduleOf(def: TrainTraderDef): TrainTraderSchedule {
  let s = trainScheduleCache.get(def.id);
  if (s) return s;
  const r = trainRouteFor(def);
  const homeLen = r.homeFwdCum[r.homeFwdCum.length - 1] || 0;
  const otherLen = r.otherFwdCum[r.otherFwdCum.length - 1] || 0;
  const t0 = def.departHour;
  const t1a = t0 + homeLen / WALK_TRADER_SPEED;
  const t1b = t1a + r.rideHours;
  const t1 = t1b + otherLen / WALK_TRADER_SPEED;
  const t2 = t1 + def.lingerHours;
  const t2a = t2 + otherLen / WALK_TRADER_SPEED;
  const t2b = t2a + r.rideHours;
  const t3 = t2b + homeLen / WALK_TRADER_SPEED;
  const t4 = t3 + def.lingerHours;
  const cycleHours = Math.max(24, Math.ceil(t4 / 24) * 24);
  s = { t0, t1a, t1b, t1, t2, t2a, t2b, t3, t4, cycleHours };
  trainScheduleCache.set(def.id, s);
  return s;
}

export type TrainTraderPhase = "home" | "walking-out" | "riding-out" | "walking-in" | "trading-away" | "walking-out2" | "riding-home" | "walking-home" | "trading-home";
export interface TrainTraderState {
  id: string;
  x: number;
  z: number;
  yaw: number;
  phase: TrainTraderPhase;
  cargo: string;
  /** which post they're standing at right now, or null while travelling (including "riding", when
   *  they're aboard the train and not drawn at all — see world/trade/index.ts) */
  atPostId: string | null;
}

/** where a train-riding trader is, what they're carrying and what they're doing, at absolute time
 *  `t` (seconds) — a pure function of time, same as traderStateAtTime: costs nothing far from the
 *  kid, correct the instant the kid arrives anywhere near. */
export function trainTraderStateAtTime(def: TrainTraderDef, t: number): TrainTraderState {
  const sch = trainScheduleOf(def);
  const r = trainRouteFor(def);
  const hours = t / HOUR_SECONDS;
  let cyc = hours % sch.cycleHours;
  if (cyc < 0) cyc += sch.cycleHours;
  const home = tradePostOf(def.homeId)!;
  const other = tradePostOf(def.otherId)!;

  if (cyc < sch.t0) return { id: def.id, x: home.x, z: home.z, yaw: 0, phase: "home", cargo: def.cargoOut, atPostId: def.homeId };
  if (cyc < sch.t1a) {
    const f = (cyc - sch.t0) / (sch.t1a - sch.t0);
    const p = alongWalk(r.homeFwd, r.homeFwdCum, f);
    return { id: def.id, x: p.x, z: p.z, yaw: p.yaw, phase: "walking-out", cargo: def.cargoOut, atPostId: null };
  }
  if (cyc < sch.t1b) {
    const last = r.homeFwd[r.homeFwd.length - 1];
    return { id: def.id, x: last[0], z: last[1], yaw: 0, phase: "riding-out", cargo: def.cargoOut, atPostId: null };
  }
  if (cyc < sch.t1) {
    const f = (cyc - sch.t1b) / (sch.t1 - sch.t1b);
    const p = alongWalk(r.otherRev, r.otherRevCum, f);
    return { id: def.id, x: p.x, z: p.z, yaw: p.yaw, phase: "walking-in", cargo: def.cargoOut, atPostId: null };
  }
  if (cyc < sch.t2) return { id: def.id, x: other.x, z: other.z, yaw: 0, phase: "trading-away", cargo: def.cargoBack, atPostId: def.otherId };
  if (cyc < sch.t2a) {
    const f = (cyc - sch.t2) / (sch.t2a - sch.t2);
    const p = alongWalk(r.otherFwd, r.otherFwdCum, f);
    return { id: def.id, x: p.x, z: p.z, yaw: p.yaw, phase: "walking-out2", cargo: def.cargoBack, atPostId: null };
  }
  if (cyc < sch.t2b) {
    const last = r.otherFwd[r.otherFwd.length - 1];
    return { id: def.id, x: last[0], z: last[1], yaw: 0, phase: "riding-home", cargo: def.cargoBack, atPostId: null };
  }
  if (cyc < sch.t3) {
    const f = (cyc - sch.t2b) / (sch.t3 - sch.t2b);
    const p = alongWalk(r.homeRev, r.homeRevCum, f);
    return { id: def.id, x: p.x, z: p.z, yaw: p.yaw, phase: "walking-home", cargo: def.cargoBack, atPostId: null };
  }
  if (cyc < sch.t4) return { id: def.id, x: home.x, z: home.z, yaw: 0, phase: "trading-home", cargo: def.cargoBack, atPostId: def.homeId };
  return { id: def.id, x: home.x, z: home.z, yaw: 0, phase: "home", cargo: def.cargoOut, atPostId: def.homeId };
}

/** true while this trader is aboard the train (nothing to draw for them — see world/trade/index.ts,
 *  which shows the train's own ambient riders instead while it's actually running) */
export const trainTraderRiding = (state: TrainTraderState): boolean => state.phase === "riding-out" || state.phase === "riding-home";

export function trainTraderLine(def: TrainTraderDef, state: TrainTraderState, which: 0 | 1 = 0): string {
  if (which === 1) return def.fact;
  const home = tradePostOf(def.homeId)!;
  const other = tradePostOf(def.otherId)!;
  switch (state.phase) {
    case "walking-out":
    case "riding-out":
      return `Off to ${other.name} with ${goodOf(def.cargoOut).name} — catching the train!`;
    case "walking-in":
      return `Just off the train at ${other.name}, carrying ${goodOf(def.cargoOut).name}.`;
    case "trading-away":
      return `Just swapped my ${goodOf(def.cargoOut).name} for ${goodOf(def.cargoBack).name} here!`;
    case "walking-out2":
    case "riding-home":
      return `Heading home to ${home.name} with ${goodOf(def.cargoBack).name}!`;
    case "walking-home":
      return `Nearly home to ${home.name}, with ${goodOf(def.cargoBack).name} from ${other.name}.`;
    case "trading-home":
      return `Home again at ${home.name}, unloading the ${goodOf(def.cargoBack).name}.`;
    default:
      return `Resting up at ${home.name} — off to ${other.name} again later!`;
  }
}

/** every train-riding trader's state at time `t` */
export function allTrainTraderStates(t: number): TrainTraderState[] {
  return TRAIN_TRADERS.map((d) => trainTraderStateAtTime(d, t));
}

/** the line a trader says when the kid is close enough to chat (where they're going/from, what
 *  they carry, what they hope to trade it for, or a true fact — alternated by `which`) */
export function traderLine(def: TraderDef, state: TraderState, which: 0 | 1 = 0): string {
  if (which === 1) return def.fact;
  const home = tradePostOf(def.homeId)!;
  const other = tradePostOf(def.otherId)!;
  switch (state.phase) {
    case "outbound":
      return `Off to ${other.name} with ${goodOf(def.cargoOut).name} — hoping to trade for ${goodOf(def.cargoBack).name}!`;
    case "trading-away":
      return `Just swapped my ${goodOf(def.cargoOut).name} for ${goodOf(def.cargoBack).name} here!`;
    case "inbound":
      return `Heading home to ${home.name} with ${goodOf(def.cargoBack).name} from ${other.name}!`;
    case "trading-home":
      return `Home again at ${home.name}, unloading the ${goodOf(def.cargoBack).name}.`;
    default:
      return `Resting up at ${home.name} — off to ${other.name} again in the morning!`;
  }
}
