// Fishing boats around the seas: a little fleet of wooden trawlers working the deep water off
// Candy Harbour, Coralcove's Shellharbour Jetty and the mouth of the Wildlands' river — out at
// dawn, home by dusk (a couple fish on by lantern-light instead). Pure logic, no three.js (tested
// here); world/sea/fishingBoats.ts turns it into instanced meshes — same split as
// world/trade/plan.ts + world/trade/index.ts, and for the same reason: a boat's whole day is a
// FUNCTION OF TIME (no stepped simulation, no stored state), so a boat far from the kid costs
// nothing and is always right wherever the kid finds it.
//
// Each boat's own route (home -> its fishing grounds) is worked out once, at import time, by
// walking away from the nearest coast — world/sea/wander.ts's deepestHeading, the very same trick
// the sea creatures use to find open water — until it's deep enough to trawl, so no one has to
// hand-trace a path for every boat and it can never cut across an island, a reef or a dock.
import { DOCKS, MOORINGS } from "../../registry/harbours";
import { VILLAGE_ISLAND } from "../../registry/villageIsland";
import { WILD_OUTLET_POINTS } from "../../registry/wildWater";
import { seaDepth, deepestHeading } from "./wander";
import { cumLength, type P2 } from "../../registry/geom2d";
import { PARK_DAY_SECONDS } from "../atmosphere";

/** real seconds per park-hour (a park day is 24 of these) */
export const HOUR_SECONDS = PARK_DAY_SECONDS / 24;

// ── the fleet's homes: tucked along the coast at Candy Harbour, Coralcove's Shellharbour Jetty and
// the mouth of the Wildlands' river — never right on the kid's own jetties (MOORINGS), just along
// the beach a little either side of them ──
const BOAT_DRAFT_CLEAR = 1.6;
const HOME_GAP = 9;

function clearOfHomes(x: number, z: number, homes: P2[]): boolean {
  for (const m of MOORINGS) if (Math.hypot(m.x - x, m.z - z) < HOME_GAP) return false;
  for (const h of homes) if (Math.hypot(h[0] - x, h[1] - z) < HOME_GAP) return false;
  return true;
}
/** step out from a shoreside point along `heading`, stopping at the first spot deep enough to
 *  float a small fishing boat and clear of every other moored craft (the kid's own, or another
 *  fishing boat's home) */
function anchorPoint(x0: number, z0: number, heading: number, homes: P2[]): P2 {
  for (let d = 3; d <= 90; d += 1) {
    const x = x0 + Math.sin(heading) * d;
    const z = z0 + Math.cos(heading) * d;
    if (seaDepth(x, z) >= BOAT_DRAFT_CLEAR && clearOfHomes(x, z, homes)) return [x, z];
  }
  throw new Error("fishingBoats: no clear anchorage found");
}

const candyDock = DOCKS.find((d) => d.id === "candy-harbour");
if (!candyDock) throw new Error("fishingBoats: no Candy Harbour in harbours.ts");
const coralDock = DOCKS.find((d) => d.id === "coralcove");
if (!coralDock) throw new Error("fishingBoats: no Coralcove dock in harbours.ts");
if (WILD_OUTLET_POINTS.length < 2) throw new Error("fishingBoats: the Wildlands' outlet has too few points");
const outletPrev = WILD_OUTLET_POINTS[WILD_OUTLET_POINTS.length - 2];
const outletMouth = WILD_OUTLET_POINTS[WILD_OUTLET_POINTS.length - 1];

interface Harbour {
  id: string;
  name: string;
  bx: number;
  bz: number;
  /** out to sea, roughly (doesn't need to be exact: anchorPoint and the deep-water walk both
   *  correct for whatever's actually there) */
  heading: number;
}
const HARBOURS: Harbour[] = [
  { id: "candy-harbour", name: "Candy Harbour", bx: candyDock.x, bz: candyDock.z, heading: Math.atan2(candyDock.x, candyDock.z) },
  { id: "coralcove", name: "Shellharbour Jetty", bx: coralDock.x, bz: coralDock.z, heading: Math.atan2(coralDock.x - VILLAGE_ISLAND.x, coralDock.z - VILLAGE_ISLAND.z) },
  { id: "river-mouth", name: "the river mouth", bx: outletMouth[0], bz: outletMouth[1], heading: Math.atan2(outletMouth[0] - outletPrev[0], outletMouth[1] - outletPrev[1]) },
];
const harbourOf = (id: string): Harbour => HARBOURS.find((h) => h.id === id)!;

const homesAcc: P2[] = [];
/** `count` homes spread along the coast either side of a harbour's own point, each its own clear anchorage */
function homesAt(harbourId: string, count: number, gap: number): P2[] {
  const h = harbourOf(harbourId);
  const tangent = h.heading + Math.PI / 2;
  const out: P2[] = [];
  for (let i = 0; i < count; i++) {
    const side = (i - (count - 1) / 2) * gap;
    const bx = h.bx + Math.sin(tangent) * side;
    const bz = h.bz + Math.cos(tangent) * side;
    const p = anchorPoint(bx, bz, h.heading, homesAcc);
    homesAcc.push(p);
    out.push(p);
  }
  return out;
}

// ── fishing grounds: walk away from the coast until it's deep enough to trawl (same trick the sea
// creatures use to find open water), then nudge sideways a little so boats from the same harbour
// don't all end up fishing exactly the same patch ──
const GROUNDS_DEPTH = 12;

/** a few extra steps kept on past the first spot deep enough (so the grounds end up properly out
 *  at sea, well clear of the shore and every other boat's shoreside home — not just barely afloat
 *  the moment the depth test first passes) */
const EXTRA_STEPS = 4;
function walkOutRoute(x0: number, z0: number, minDepth: number, step = 12, maxSteps = 300): P2[] {
  const pts: P2[] = [[x0, z0]];
  let x = x0;
  let z = z0;
  let reachedAt = -1;
  for (let i = 0; i < maxSteps; i++) {
    if (reachedAt < 0 && seaDepth(x, z) >= minDepth) reachedAt = i;
    if (reachedAt >= 0 && i >= reachedAt + EXTRA_STEPS) break;
    const heading = deepestHeading({ x, z, yaw: 0 });
    x += Math.sin(heading) * step;
    z += Math.cos(heading) * step;
    pts.push([x, z]);
  }
  return pts;
}
/** the shared depth every boat leaving a harbour clears before heading its own way — kept shallow
 *  (and so the shared leg short) on purpose: boats leaving the same harbour at the same lateral
 *  spacing as their homes would otherwise be pulled onto the very same deep-water corridor (the
 *  gradient walk doesn't know which boat is asking) and stay funnelled together for the whole trip */
const MD_SHARED = 5;
/** every point from `a` to `b` is at least `minDepth` deep (a straight hop is fine out past the
 *  shallows): the subdivided points if so, else null */
function straightSafe(a: P2, b: P2, minDepth = 3, samples = 24): P2[] | null {
  const pts: P2[] = [];
  for (let k = 0; k <= samples; k++) {
    const t = k / samples;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[1] + (b[1] - a[1]) * t;
    if (seaDepth(x, z) < minDepth) return null;
    pts.push([x, z]);
  }
  return pts;
}
/** the route out to this boat's own fishing grounds (home -> grounds): a short shared leg clearing
 *  the shallows off the harbour, then straight for its own grounds, `drift` m sideways off the deep
 *  water corridor the other boats from this harbour would otherwise all share */
function groundsRoute(home: P2, approachHeading: number, drift: number): P2[] {
  const full = walkOutRoute(home[0], home[1], GROUNDS_DEPTH);
  const last = full[full.length - 1];
  const side = approachHeading + Math.PI / 2;
  let grounds = last;
  for (let d = drift; d > 0; d -= 8) {
    const tx = last[0] + Math.sin(side) * d;
    const tz = last[1] + Math.cos(side) * d;
    if (seaDepth(tx, tz) >= GROUNDS_DEPTH - 1.5) {
      grounds = [tx, tz];
      break;
    }
  }
  let cut = full.findIndex(([x, z]) => seaDepth(x, z) >= MD_SHARED);
  if (cut < 1) cut = 1;
  const head = full.slice(0, cut + 1);
  const straight = straightSafe(head[head.length - 1], grounds);
  if (straight) return [...head, ...straight.slice(1)];
  // the straight hop would cut too close to something: fall back to following the corridor all
  // the way out (still always safe — see walkOutRoute)
  return [...full, grounds];
}

export type FleetId = "candy-harbour" | "coralcove" | "river-mouth";

export interface FishingBoatDef {
  id: string;
  name: string;
  fleet: FleetId;
  hx: number;
  hz: number;
  hyaw: number;
  /** fishes by lantern-light at night instead of by day */
  night: boolean;
  /** hour of day (0-24) it leaves home */
  departHour: number;
  /** how long it stays out on the grounds (a whole number of HAUL_PERIODs, so the slow drift
   *  back-and-forth out there always ends exactly back where it started: see fishingBoatStateAtTime) */
  fishHours: number;
  /** units per park-hour */
  speed: number;
  route: P2[];
  cum: Float64Array;
  arrivalYaw: number;
  crewSeed: number;
}

/** ~2.8 m/s trawling along (x1.6 units/m, same convention as world/trade/plan.ts's boats, a touch
 *  slower: these aren't in a hurry) */
const BOAT_SPEED = 2.8 * 1.6 * HOUR_SECONDS;
const BOAT_NAMES = ["Clementine", "Barnacle Bill", "The Codfather", "Sea Biscuit", "Old Salty", "Herring Gull", "The Lucky Shrimp", "Mackerel Sky", "The Early Catch", "Tidewater", "Kippers", "The Jolly Plaice"];

function fleetDefs(fleet: FleetId, homes: P2[], nightIdxs: number[], idOffset: number, departBase: number, nightDepartBase: number): FishingBoatDef[] {
  const h = harbourOf(fleet);
  return homes.map((home, i) => {
    const night = nightIdxs.includes(i);
    const drift = 40 + i * 30;
    const route = groundsRoute(home, h.heading, drift);
    const cum = cumLength(route);
    const last = route[route.length - 1];
    const prev = route[route.length - 2] ?? home;
    const arrivalYaw = Math.atan2(last[0] - prev[0], last[1] - prev[1]);
    return {
      id: `${fleet}-${i}`,
      name: BOAT_NAMES[(idOffset + i) % BOAT_NAMES.length],
      fleet,
      hx: home[0],
      hz: home[1],
      hyaw: h.heading,
      night,
      departHour: night ? nightDepartBase + i * 0.4 : departBase + i * 0.5,
      fishHours: night ? 9 : 7,
      speed: BOAT_SPEED,
      route,
      cum,
      arrivalYaw,
      crewSeed: idOffset + i,
    };
  });
}

const CANDY_HOMES = homesAt("candy-harbour", 5, 34);
const CORAL_HOMES = homesAt("coralcove", 4, 34);
const RIVER_HOMES = homesAt("river-mouth", 3, 34);

export const FISHING_BOATS: FishingBoatDef[] = [
  ...fleetDefs("candy-harbour", CANDY_HOMES, [4], 0, 5, 17.5),
  ...fleetDefs("coralcove", CORAL_HOMES, [3], 5, 5.5, 18),
  ...fleetDefs("river-mouth", RIVER_HOMES, [], 9, 6, 18.5),
];
export const fishingBoatOf = (id: string): FishingBoatDef | undefined => FISHING_BOATS.find((d) => d.id === id);
export const harbourName = (fleet: FleetId): string => harbourOf(fleet).name;

// ── a boat's day: a pure function of time (traderStateAtTime's own trick) ──

export type FishingPhase = "moored" | "outbound" | "fishing" | "inbound";
export interface FishingBoatState {
  id: string;
  x: number;
  z: number;
  yaw: number;
  phase: FishingPhase;
  /** stopped to haul the nets in right now (a few seconds of net-and-crew animation) */
  hauling: boolean;
  /** 0..1: how far up the net bag has lifted this haul */
  haulLift: number;
  /** fishes by lantern-light (moored or out working at night) */
  lantern: boolean;
}

interface Schedule {
  t0: number;
  t1: number;
  t2: number;
  t3: number;
  cycleHours: number;
}
const scheduleCache = new Map<string, Schedule>();
function scheduleOf(def: FishingBoatDef): Schedule {
  let s = scheduleCache.get(def.id);
  if (s) return s;
  const total = def.cum[def.cum.length - 1];
  const oneWay = total / def.speed;
  const t0 = def.departHour;
  const t1 = t0 + oneWay;
  const t2 = t1 + def.fishHours;
  const t3 = t2 + oneWay;
  const cycleHours = Math.max(24, Math.ceil(t3 / 24) * 24);
  s = { t0, t1, t2, t3, cycleHours };
  scheduleCache.set(def.id, s);
  return s;
}

/** a point `f` (0..1) along a boat's route, home -> grounds, plus the heading there */
function alongRoute(def: FishingBoatDef, f: number): { x: number; z: number; yaw: number } {
  const total = def.cum[def.cum.length - 1];
  const target = Math.min(total, Math.max(0, f * total));
  let lo = 0;
  let hi = def.cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (def.cum[m] <= target) lo = m;
    else hi = m;
  }
  const segLen = def.cum[hi] - def.cum[lo] || 1;
  const t = (target - def.cum[lo]) / segLen;
  const a = def.route[lo];
  const b = def.route[hi];
  const x = a[0] + (b[0] - a[0]) * t;
  const z = a[1] + (b[1] - a[1]) * t;
  const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
  return { x, z, yaw };
}

/** hours per out-and-back drift on the grounds (every boat's fishHours is a whole multiple of
 *  this, so the drift always lands exactly back on the grounds at the end of the day: continuous,
 *  no jump into "inbound") */
const HAUL_PERIOD = 1;
/** how far the boat drifts out on the grounds before easing back (m) */
const GROUNDS_R = 6;
const HAUL_WINDOW = 0.12;

function haulAt(phase: number): { hauling: boolean; lift: number } {
  const d = Math.min(Math.abs(phase - 0.25), Math.abs(phase - 0.75));
  if (d >= HAUL_WINDOW) return { hauling: false, lift: 0 };
  const k = 1 - d / HAUL_WINDOW;
  return { hauling: k > 0.2, lift: Math.max(0, Math.sin((k * Math.PI) / 2)) };
}

/** where a boat is, what it's doing and whether its lantern's lit, at absolute time `t` (seconds)
 *  — a pure function: the same t always gives the same answer, so this costs nothing for a boat
 *  far from the kid, and is correct the instant the kid happens on it. */
export function fishingBoatStateAtTime(def: FishingBoatDef, t: number): FishingBoatState {
  const sch = scheduleOf(def);
  const hours = t / HOUR_SECONDS;
  let cyc = hours % sch.cycleHours;
  if (cyc < 0) cyc += sch.cycleHours;
  const lantern = def.night;
  if (cyc < sch.t0) return { id: def.id, x: def.hx, z: def.hz, yaw: def.hyaw, phase: "moored", hauling: false, haulLift: 0, lantern };
  if (cyc < sch.t1) {
    const f = (cyc - sch.t0) / (sch.t1 - sch.t0);
    const p = alongRoute(def, f);
    return { id: def.id, x: p.x, z: p.z, yaw: p.yaw, phase: "outbound", hauling: false, haulLift: 0, lantern };
  }
  if (cyc < sch.t2) {
    const last = def.route[def.route.length - 1];
    const u = (cyc - sch.t1) / HAUL_PERIOD;
    const phase = u - Math.floor(u);
    const perp = def.arrivalYaw + Math.PI / 2;
    const osc = Math.sin(phase * 2 * Math.PI) * GROUNDS_R;
    const x = last[0] + Math.sin(perp) * osc;
    const z = last[1] + Math.cos(perp) * osc;
    const yaw = Math.cos(phase * 2 * Math.PI) >= 0 ? perp : perp + Math.PI;
    const h = haulAt(phase);
    return { id: def.id, x, z, yaw, phase: "fishing", hauling: h.hauling, haulLift: h.lift, lantern };
  }
  if (cyc < sch.t3) {
    const f = (cyc - sch.t2) / (sch.t3 - sch.t2);
    const p = alongRoute(def, 1 - f);
    return { id: def.id, x: p.x, z: p.z, yaw: p.yaw + Math.PI, phase: "inbound", hauling: false, haulLift: 0, lantern };
  }
  return { id: def.id, x: def.hx, z: def.hz, yaw: def.hyaw, phase: "moored", hauling: false, haulLift: 0, lantern };
}

/** every fishing boat's state at time `t` */
export function allFishingBoatStates(t: number): FishingBoatState[] {
  return FISHING_BOATS.map((d) => fishingBoatStateAtTime(d, t));
}

// ── chat: a friendly line (what they're up to) or a true ocean/fishing fact, alternated by `which` ──

export const FISHING_FACTS: string[] = [
  "Most of the Earth's oxygen comes from tiny ocean plants called phytoplankton.",
  "Fishers use nets with big holes so little fish can swim free and grow.",
  "A shoal of fish can turn together in a flash, almost like one giant animal.",
  "The deepest part of the ocean is deeper than Mount Everest is tall.",
  "Lobsters taste with their feet!",
  "A starfish can grow a whole new arm if it ever loses one.",
  "The ocean covers more than two-thirds of our whole planet.",
  "Salmon swim all the way back to the very stream where they hatched, to lay their own eggs.",
  "Lighthouses once burned whale oil to help sailors find their way home at night.",
  "Dolphins sometimes swim alongside fishing boats, hoping for a stray fish.",
  "The tide goes in and out because of the Moon's gentle pull on the sea.",
  "Barnacles glue themselves to a boat's hull and ride along for free!",
  "Sailors used to read the clouds and the wind to know a storm was coming.",
];
if (FISHING_FACTS.some((f) => f.length > 140)) throw new Error("fishingBoats: a fact is too long for a speech bubble");

function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** the line a boat's crew says when the kid is close enough to chat */
export function fishingBoatLine(def: FishingBoatDef, state: FishingBoatState, which: 0 | 1 = 0): string {
  if (which === 1) return FISHING_FACTS[(seedOf(def.id) + Math.floor(state.phase.length)) % FISHING_FACTS.length];
  const home = harbourName(def.fleet);
  switch (state.phase) {
    case "outbound":
      return "Off to the fishing grounds!";
    case "fishing":
      return state.hauling ? "Hauling in the nets — let's see what we caught!" : "Working the nets out here, nice and slow.";
    case "inbound":
      return "Heading home with the catch!";
    default:
      return `Resting up at ${home} — out again at ${def.night ? "dusk" : "dawn"}!`;
  }
}
