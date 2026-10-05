// Settlements: villages and towns of fantasy folk out in the Wildlands, one registry entry per
// place. This is the framework (siting, huts, props, paths, work spots, a villager roster, the
// things a kid can do there) plus the FIRST settlement: Lakeside, a little fishing village of the
// Reedling Folk tucked into the Great Lake's north-west shore, near Great Lake Station.
//
// Pure data + maths, deterministic, no three.js (the renderer is lib/park/world/settlements/, the
// villagers' day is lib/park/world/settlements/routine.ts) — same split as Coralcove Isle
// (registry/villageIsland.ts + world/village/**), so the tests, the engine and the renderer all
// read the same numbers.
//
// Adding the next settlement (a style the spec calls for): write a `generate<Style>(site)` function
// below that returns a SettlementDef's huts/props/nodes/edges/work/roster/activities from a seed,
// pick a site with its own deterministic search (see `findLakesideSite`), and push one entry onto
// `SETTLEMENTS`. Nothing else needs to change: the renderer, the routine, the map, the push-out
// collision and the Island destinations all come from this one list.
import { seaDist } from "./island";
import { nearRail, STATIONS } from "./railway";
import { WILD_FALLS, WILD_LAKE, wildLakeRadius, wildRainforestK, wildWaterSdf } from "./wildWater";
import { LONE_PEAK, footprintStats, rawHeight, smoothedHeight } from "./landform";
// Sunnybrook (the market town) is generated in its own file, same discipline as every
// generate<Style>() below — a deterministic site search steered clear of the others (town.ts can't
// import SETTLEMENTS itself: that would be circular, since this is the file that builds it).
import { generateTown } from "./town";
// Everest Base Camp (the "Climb Everest!" wonder) is likewise generated in its own file, same
// discipline as town.ts — see lib/park/registry/everestBaseCamp.ts.
import { generateBaseCamp } from "./everestBaseCamp";

/** kept in step with terrain.ts WATER_Y (registry/settlements.ts must not import terrain.ts: that
 *  would be circular, since terrain.ts's stamps() reads SETTLEMENTS to level their ground) */
export const SETTLE_WATER_Y = -0.25;

export type SettlementStyle = "lakeside" | "treehouse" | "mountain" | "town" | "basecamp";

/** a seeded xorshift rng (0..1), the same little generator villageIsland.ts uses */
function rngOf(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const TAU = Math.PI * 2;

/** is the WHOLE footprint of radius `r` round (cx, cz) gentle and flat enough for a village pad,
 *  checked on the REAL, unlevelled ground (registry/landform.ts's footprintStats — this runs at
 *  site-search time, before terrain.ts's stamps ever level anything)? Every hut, work spot and
 *  pasture has to fit inside this one genuinely gentle disc — no cliff is allowed to run through or
 *  above any part of the village, not even its rim. Calibrated against what the real terrain near
 *  the Great Falls and the Lone Peak actually offers (settlements.test.ts checks the chosen sites
 *  against these same numbers): a village sited this way is necessarily a little smaller than one
 *  that merely levels a disc wherever it lands — see TREETOP_RADIUS / HIGHSTONE_RADIUS. */
/** the height a settlement's pad is levelled to (terrain.ts stamps() uses this same function): the
 *  real smoothed ground at its centre. (Lakeside's lake-shore pad sits a touch lower than the bank,
 *  0.6 of it, so its shore huts and pier meet the water; up in the hills the pad must follow the
 *  ground itself, or levelling digs the village into a pit walled by rock.) */
export function settlePadHeight(style: SettlementStyle, x: number, z: number): number {
  return Math.max(smoothedHeight(x, z) * (style === "lakeside" ? 0.6 : 1), SETTLE_WATER_Y + 0.6);
}

function footprintOk(cx: number, cz: number, r: number, maxSlope = 0.4, maxRelief = 7): boolean {
  const s = footprintStats(cx, cz, r);
  return s.maxSlope <= maxSlope && s.relief <= maxRelief;
}

// ── the shape of one settlement ──

export interface SettlementHut {
  x: number;
  z: number;
  yaw: number;
  kind: string;
  size: number;
  /** a stilt house standing right at the waterline (Lakeside's shore huts), not a land hut */
  shore?: boolean;
  /** how high this hut's own floor sits above the ground (Treetop's treehouses, up a giant trunk) —
   *  omitted (0) for every ground-level hut (Lakeside's reed huts, Highstone's cottages) */
  elev?: number;
}
/** a static grazing animal (Highstone's yaks and goats): no SettlementDef fields move it — it just
 *  idles in place (a slow head-dip/sway, worked out from its own seed + the clock) — so it can be a
 *  plain obstacle like a hut, no per-frame simulation needed */
export interface SettlementFauna {
  id: string;
  kind: "yak" | "goat" | "sheep";
  x: number;
  z: number;
  yaw: number;
  scale: number;
}
/** a walkable deck above the ground: a straight sloped walk (a:ramp foot -> b:platform, or a level
 *  rope bridge platform -> platform) or a round platform itself. Generalises SettlementPier (kept
 *  as its own field for Lakeside's water-crossing one — this is the same idea for decks that don't
 *  cross water, e.g. Treetop's treehouse platforms and the ramp/bridge between them). */
export interface SettlementDeckLine {
  kind: "line";
  ax: number;
  az: number;
  ay: number;
  bx: number;
  bz: number;
  by: number;
  half: number;
  tag: "ramp" | "bridge";
}
export interface SettlementDeckCircle {
  kind: "circle";
  x: number;
  z: number;
  y: number;
  r: number;
}
export type SettlementDeckPiece = SettlementDeckLine | SettlementDeckCircle;
export interface SettlementProp {
  kind: string;
  x: number;
  z: number;
  yaw: number;
  scale: number;
  /** an optional height hint a particular prop kind can use however it likes (Treetop's giant trees
   *  read it as the treehouse elevation their own canopy should clear) — omitted everywhere else */
  elev?: number;
}
export interface SettlementNode {
  id: string;
  x: number;
  z: number;
}
/** a place a villager works: a node, which way they face while there, and whether they sit */
export interface SettlementWorkSpot {
  id: string;
  x: number;
  z: number;
  face: number;
  sit?: boolean;
}
/** what a Lakeside (or later, any settlement's) villager can be doing — each maps onto one of the
 *  shared crowd module's Anim poses (world/village/crowd.ts), so no new rigging is ever needed.
 *  "sell" / "busk" / "light" were added for Sunnybrook (a market seller at a stall, a street
 *  musician, a lamplighter) — all three reuse Anim/Tool combinations crowd.ts already had rigging
 *  for (sell, flute, light+pole) but no settlement had used yet */
export type SettlementAct = "home" | "wander" | "fish" | "nets" | "cook" | "dance" | "drum" | "chase" | "look" | "sit" | "sell" | "busk" | "light";
export interface SettlementSlot {
  from: number;
  act: SettlementAct;
  spot?: string;
}
export interface SettlementVillagerDef {
  id: string;
  name: string;
  /** index into SettlementDef.huts */
  home: number;
  kid: boolean;
  elder: boolean;
  seed: number;
  schedule: SettlementSlot[];
  skin: number;
  hair: number;
  cloth: number;
  hairStyle: number;
  body: number;
  /** a SettlementDef.talk id when they have things to say */
  talk?: string;
  /** chase: 0 runner / 1 chaser */
  pair: number;
}
export interface SettlementTalkLines {
  id: string;
  name: string;
  lines: string[];
}
/** something a kid on foot can do here (the fishing spot at the end of Lakeside's pier) */
export interface SettlementActivitySpot {
  id: string;
  x: number;
  z: number;
  r: number;
  label: string;
  emoji: string;
}
export interface SettlementObstacle {
  x: number;
  z: number;
  r: number;
}
/** a walkable deck over water, like harbours.ts's jetties (a straight walk from a to b) */
export interface SettlementPier {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  half: number;
  deckY: number;
}

export interface SettlementDef {
  id: string;
  name: string;
  clan: string;
  emoji: string;
  style: SettlementStyle;
  x: number;
  z: number;
  radius: number;
  /** the flat pad's height (terrain.ts levels the ground here to this) */
  padHeight: number;
  stationId: string;
  huts: SettlementHut[];
  props: SettlementProp[];
  nodes: SettlementNode[];
  edges: [number, number][];
  work: SettlementWorkSpot[];
  roster: SettlementVillagerDef[];
  talk: SettlementTalkLines[];
  activities: SettlementActivitySpot[];
  obstacles: SettlementObstacle[];
  pier: SettlementPier | null;
  /** a couple of loop paths canoes paddle on the water near the village (local-offset points) */
  canoeLoops: { x: number; z: number }[][];
  /** static grazing animals (Highstone's yaks/goats) — empty for every settlement without any */
  fauna: SettlementFauna[];
  /** walkable platforms/ramps/bridges above the ground (Treetop's treehouses) — empty elsewhere */
  decks: SettlementDeckPiece[];
  /** extra area terrain.ts should level, beyond any one hut/work spot's own stamp (Highstone's yak
   *  pasture, which reaches further out) — empty for every settlement that doesn't need one. Levels
   *  flush with the settlement's own shared pad height UNLESS `h` gives its own target height (the
   *  pasture reaches well past the huts, onto ground that may sit a fair bit higher/lower than the
   *  pad — forcing it flush would squeeze that whole height difference into just this patch's own
   *  rIn-to-rOut ring, however wide, and still read as a little cliff; its own locally-smoothed
   *  height keeps the ramp to the pad gentle without giving up a flat pasture floor) */
  levelPatches: { x: number; z: number; rIn: number; rOut: number; h?: number }[];
  /** what this settlement trades (registry/trade.ts turns this into a TRADE_POST automatically —
   *  a new settlement joins the trade network just by filling this in, nothing else to wire up) */
  trade?: { makes: string[]; wants: string[] };
}

// ── siting Lakeside: a deterministic search near the Great Lake's north/north-west shore, close to
// Great Lake Station and its jetty, dry and clear of the rail and the water ──

const LAKE_STATION = STATIONS.find((s) => s.id === "lake-station")!;
if (!LAKE_STATION) throw new Error("settlements: no lake-station in the railway registry");
/** the heading from the lake's centre to its station (very close to due north) */
const A_STATION = Math.atan2(LAKE_STATION.x - WILD_LAKE.x, LAKE_STATION.z - WILD_LAKE.z);
/** the Great Lake Jetty's seaward tip (harbours.ts computes the exact point from the beach's real
 *  ground — settlements.ts can't import harbours.ts, that would be circular, since harbours.ts
 *  reads SETTLEMENTS for its own worldFloorY). Kept in step by a test (settlements.test.ts) that
 *  imports harbours.ts directly and checks this hasn't drifted. */
const GREAT_LAKE_JETTY_HEAD = { x: 1427, z: -511 };

/** how far from (x0, z0) along heading (dx, dz) the lake's water starts (wildWaterSdf < 0) */
function distToWater(x0: number, z0: number, dx: number, dz: number, maxD = 70): number {
  for (let s = 0; s <= maxD; s += 0.5) if (wildWaterSdf(x0 + dx * s, z0 + dz * s) < 0) return s;
  return maxD;
}

export function findLakesideSite(): { x: number; z: number; a: number } {
  let best: { x: number; z: number; a: number; score: number } | null = null;
  // the station sits almost due north of the lake (A_STATION), a hair east of it; sweep from there
  // round towards the north-west (d > 0 rotates west, per the sin/cos heading convention below), so
  // the village sits on the shore north/north-west of the station, clear of the Great Lake Jetty
  // (which runs south from the station, straight towards the lake's middle) — a village right at
  // the water's edge (small toShore) so its stilt huts can stand in the shallows, but its own
  // pier kept a good 30+ m clear of the candy jetty's own tip
  for (let d = -0.3; d <= 1.3; d += 0.01) {
    const a = A_STATION + d;
    const shoreR = wildLakeRadius(a);
    const shoreDirX = -Math.sin(a);
    const shoreDirZ = -Math.cos(a);
    for (let k = 9; k <= 26; k += 1) {
      const r = shoreR + k;
      const x = WILD_LAKE.x + Math.sin(a) * r;
      const z = WILD_LAKE.z + Math.cos(a) * r;
      if (seaDist(x, z) > -40) continue;
      if (nearRail(x, z, 9)) continue;
      const toStation = Math.hypot(x - LAKE_STATION.x, z - LAKE_STATION.z);
      if (toStation > 280) continue;
      const sdf = wildWaterSdf(x, z);
      if (sdf < 11 || sdf > 22) continue;
      const toShore = distToWater(x, z, shoreDirX, shoreDirZ);
      if (toShore > 22) continue;
      // the village's own pier reaches ~15 m past the shore: keep its tip well clear of the jetty
      const pierTipX = x + shoreDirX * (toShore + 15);
      const pierTipZ = z + shoreDirZ * (toShore + 15);
      const toJettyTip = Math.hypot(pierTipX - GREAT_LAKE_JETTY_HEAD.x, pierTipZ - GREAT_LAKE_JETTY_HEAD.z);
      if (toJettyTip < 32) continue;
      const score = -toShore - toStation * 0.08;
      if (!best || score > best.score) best = { x, z, a, score };
    }
  }
  if (!best) throw new Error("settlements: no lakeside site found near the Great Lake");
  return { x: Math.round(best.x * 10) / 10, z: Math.round(best.z * 10) / 10, a: best.a };
}

// ── Lakeside: the Reedling Folk's fishing village ──

// Frozen as stored numbers (TOWN_SITE's own pattern — see settlements.test.ts's "sites stay frozen"
// block): re-running findLakesideSite() at module load would re-score every candidate against
// WHATEVER the terrain (registry/landform.ts) looks like right now, so any later terrain change
// (e.g. a new peak or valley added for a natural wonder) could silently pick a different "best" spot
// and move the whole village. Captured once from the live search before Mount Everest was added to
// the Great Ridge; settlements.test.ts re-runs findLakesideSite() and checks it still lands here.
const SITE = { x: 1462.1, z: -550.5, a: 2.9528270112242874 };
/** the lakeward direction (towards the water) from the village's centre */
const SHORE_DIR = { x: -Math.sin(SITE.a), z: -Math.cos(SITE.a) };

function generateLakeside(): SettlementDef {
  const r = rngOf(90210);
  const cx = SITE.x;
  const cz = SITE.z;
  const radius = 46;
  const toShore = distToWater(cx, cz, SHORE_DIR.x, SHORE_DIR.z);

  // ── huts: a cosy cluster round the fire (not a row) — land huts set back a little, varied sizes
  // and headings, a comfortable 4-7 m gap between neighbours and a clear path through; plus a
  // handful of stilt huts right at the waterline, a short boardwalk's walk from the cluster ──
  const HUT_KINDS = ["reed-round", "reed-round-tall", "reed-round-wide"];
  const inlandA = SITE.a + Math.PI; // away from the lake
  const huts: SettlementHut[] = [];
  const GAP = 4.6; // the least a hut's edge may come to its neighbour's
  // a real, walk-up-to-able hut, not a dollhouse: its own ridge comes out ~3.5-4.5 m tall (1 m ≈
  // 1.6 world units; a 1.4 m child kid stands 2.26 units tall) — world/settlements/styles/
  // lakeside.ts's buildHut is written entirely in terms of `size`, so scaling it here scales the
  // whole hut (and, via the obstacle/spacing maths above, keeps collision and spacing in step)
  const LAKESIDE_HUT_SCALE = 1.7;

  // the lake's edge wobbles (bays, points), so a hut's radius is pulled in, step by step, until
  // the ground under it is dry with at least `margin` to spare — the centre itself is always dry
  // (the site search only ever picked a dry spot), so this always finds somewhere safe
  const dryPoint = (a: number, rad0: number, margin: number): { x: number; z: number } => {
    let rad = rad0;
    for (let tries = 0; tries < 24; tries++) {
      const x = cx + Math.sin(a) * rad;
      const z = cz + Math.cos(a) * rad;
      const sdf = wildWaterSdf(x, z);
      if (sdf > margin) return { x, z };
      rad *= 0.9;
    }
    return { x: cx + Math.sin(a) * rad, z: cz + Math.cos(a) * rad };
  };
  // (progressively relaxed spacing, so a tight site always still ends with every hut placed —
  // never fewer than asked for, just a little cosier when the shore leaves little room)
  const fitsHuts = (x: number, z: number, size: number, gap: number) => huts.every((h) => Math.hypot(h.x - x, h.z - z) > (h.size + size) * 1.15 + gap);
  const placeHuts = (count: number, shore: boolean, angleBase: number, angleSpread: number, radMin: number, radMax: number, margin: number) => {
    for (const gap of [GAP, GAP * 0.7, GAP * 0.45, GAP * 0.25, 0]) {
      let placed = huts.filter((h) => !!h.shore === shore).length;
      for (let tries = 0; placed < count && tries < 600; tries++) {
        const a = angleBase + (r() - 0.5) * angleSpread;
        const rad = radMin + r() * (radMax - radMin);
        const size = (0.82 + r() * 0.35) * LAKESIDE_HUT_SCALE;
        const { x, z } = dryPoint(a, rad, margin);
        if (!fitsHuts(x, z, size, gap)) continue;
        const yaw = Math.atan2(cx - x, cz - z); // face back towards the fire / the lake
        huts.push({ x, z, yaw, kind: HUT_KINDS[huts.length % HUT_KINDS.length], size, shore });
        placed++;
      }
      if (placed >= count) break;
    }
  };
  // land huts: scattered through a wide arc on the inland side, at varied radii, so the cluster
  // reads as a village (gaps to walk through), not a wall
  placeHuts(6, false, inlandA, 4.6, 7, 22, 7);
  // stilt huts: right at the waterline (just a hair of dry margin — their stilts stand in the
  // shallows), spread along the shore-facing arc, close enough to join the cluster
  placeHuts(3, true, Math.atan2(SHORE_DIR.x, SHORE_DIR.z), 2.0, Math.max(4, toShore - 6), Math.max(5, toShore - 0.5), 0.5);

  // ── the fire pit (the hub), the smokehouse, racks, nets, lanterns, canoes on the sand ──
  const fire = { x: cx, z: cz };
  const smoke = { x: cx + Math.sin(inlandA + 0.9) * 7.5, z: cz + Math.cos(inlandA + 0.9) * 7.5 };
  const props: SettlementProp[] = [];
  props.push({ kind: "firepit", x: fire.x, z: fire.z, yaw: 0, scale: 1 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    props.push({ kind: "bench", x: fire.x + Math.sin(a) * 3.1, z: fire.z + Math.cos(a) * 3.1, yaw: a + Math.PI, scale: 1 });
  }
  props.push({ kind: "smokehouse", x: smoke.x, z: smoke.z, yaw: inlandA + 0.9, scale: 1 });

  // the shore strip, between the huts and the water: drying racks, nets on poles, a lookout perch
  const shoreNear = (k: number) => ({ x: cx + SHORE_DIR.x * k, z: cz + SHORE_DIR.z * k });
  const sidewaysOf = { x: SHORE_DIR.z, z: -SHORE_DIR.x };
  const racks: { x: number; z: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const p = shoreNear(toShore * 0.35 + i * 2.6);
    const side = (i % 2 ? 1 : -1) * (6 + (i % 3));
    const x = p.x + sidewaysOf.x * side;
    const z = p.z + sidewaysOf.z * side;
    racks.push({ x, z });
    props.push({ kind: "dryingrack", x, z, yaw: SITE.a, scale: 1 });
  }
  for (let i = 0; i < 3; i++) {
    const p = shoreNear(toShore * 0.5 + i * 3.4);
    const side = (i % 2 ? 1 : -1) * (10 + i * 2);
    props.push({ kind: "netpole", x: p.x + sidewaysOf.x * side, z: p.z + sidewaysOf.z * side, yaw: SITE.a + 0.3, scale: 1 });
  }
  const netsSpotPt = shoreNear(toShore * 0.42);
  const netsSpot = { x: netsSpotPt.x + sidewaysOf.x * 6, z: netsSpotPt.z + sidewaysOf.z * 6 };
  // canoes pulled up on the sand, either side of the pier
  const canoesOnSand: { x: number; z: number; yaw: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const p = shoreNear(toShore * 0.85 + i * 1.6);
    const side = (i % 2 ? 1 : -1) * (4.5 + i * 1.4);
    const x = p.x + sidewaysOf.x * side;
    const z = p.z + sidewaysOf.z * side;
    canoesOnSand.push({ x, z, yaw: SITE.a + Math.PI / 2 });
    props.push({ kind: "canoe-beached", x, z, yaw: SITE.a + Math.PI / 2, scale: 1 });
  }
  // the heron lookout perch, right at the shore
  const perchPt = shoreNear(toShore * 0.95);
  props.push({ kind: "perch", x: perchPt.x + sidewaysOf.x * 3, z: perchPt.z + sidewaysOf.z * 3, yaw: SITE.a, scale: 1 });

  // a boat up on trestles, half-mended, tucked in among the beached canoes
  const repairPt = shoreNear(toShore * 0.78);
  props.push({ kind: "boat-repair", x: repairPt.x + sidewaysOf.x * -8, z: repairPt.z + sidewaysOf.z * -8, yaw: SITE.a + Math.PI / 2, scale: 1 });

  // a reed bed and a scatter of lily pads along the waterline, between the huts and the open water —
  // soft life at the shore instead of bare sand running straight into the cluster
  for (let i = 0; i < 3; i++) {
    const p = shoreNear(toShore * (0.15 + i * 0.1));
    const side = (i % 2 ? 1 : -1) * (13 + i);
    props.push({ kind: "reedbed", x: p.x + sidewaysOf.x * side, z: p.z + sidewaysOf.z * side, yaw: 0, scale: 1 + r() * 0.4 });
  }
  for (let i = 0; i < 5; i++) {
    const p = shoreNear(toShore * (0.55 + i * 0.07));
    const side = (i % 2 ? 1 : -1) * (15 + i * 2);
    props.push({ kind: "lilypad", x: p.x + sidewaysOf.x * side, z: p.z + sidewaysOf.z * side, yaw: r(), scale: 0.8 + r() * 0.5 });
  }

  // ── the pier: from just inland of the shore, straight out over the water, with the fishing spot
  // at its tip ──
  const PIER_LEN = 20;
  const pierBaseD = Math.max(2, toShore - 2.5);
  const pierBase = shoreNear(pierBaseD);
  const pierTip = shoreNear(pierBaseD + PIER_LEN);
  const pier: SettlementPier = { ax: pierBase.x, az: pierBase.z, bx: pierTip.x, bz: pierTip.z, half: 1.2, deckY: SETTLE_WATER_Y + 1.1 };
  props.push({ kind: "pier-post-start", x: pierBase.x, z: pierBase.z, yaw: SITE.a, scale: 1 });

  // ── the chase play spot: a flat patch among the huts ──
  const chase = { x: cx + Math.sin(inlandA) * 10, z: cz + Math.cos(inlandA) * 10 };

  // ── the path graph: a hub at the fire, a spoke to every hut door, the nets, the chase spot and
  // the pier (walking right out along it to the fishing spot) ──
  const nodes: SettlementNode[] = [{ id: "fire", x: fire.x, z: fire.z }];
  const edges: [number, number][] = [];
  const nodeIndex = new Map<string, number>([["fire", 0]]);
  const addNode = (id: string, x: number, z: number) => {
    nodeIndex.set(id, nodes.length);
    nodes.push({ id, x, z });
    return nodes.length - 1;
  };
  huts.forEach((h, i) => {
    const doorX = h.x - Math.sin(h.yaw) * (h.size * 1.3);
    const doorZ = h.z - Math.cos(h.yaw) * (h.size * 1.3);
    const idx = addNode(`home-${i}`, doorX, doorZ);
    edges.push([0, idx]);
  });
  const netsIdx = addNode("nets", netsSpot.x, netsSpot.z);
  edges.push([0, netsIdx]);
  const chaseIdx = addNode("chase", chase.x, chase.z);
  edges.push([0, chaseIdx]);
  const pierBaseIdx = addNode("pier-base", pierBase.x, pierBase.z);
  edges.push([0, pierBaseIdx]);
  const pierTipIdx = addNode("pier-tip", pierTip.x, pierTip.z);
  edges.push([pierBaseIdx, pierTipIdx]);
  const launchIdx = addNode("canoe-launch", canoesOnSand[0].x, canoesOnSand[0].z);
  edges.push([0, launchIdx]);

  // a little boardwalk from each stilt hut back towards the fire, so the shore huts read as part
  // of the village, not stranded
  for (const h of huts) if (h.shore) props.push({ kind: "boardwalk", x: h.x, z: h.z, yaw: Math.atan2(cx - h.x, cz - h.z), scale: Math.hypot(h.x - cx, h.z - cz) });

  // lanterns on posts along every path — lit the path's whole length on a longer stretch, one
  // lantern on a short one — so a kid can always see the way between the huts and the fire at dusk
  for (const [a, b] of edges) {
    const na = nodes[a];
    const nb = nodes[b];
    const d = Math.hypot(nb.x - na.x, nb.z - na.z);
    const n = Math.max(1, Math.round(d / 9));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const lx = na.x + (nb.x - na.x) * t + (r() - 0.5) * 1.2;
      const lz = na.z + (nb.z - na.z) * t + (r() - 0.5) * 1.2;
      props.push({ kind: "lantern", x: lx, z: lz, yaw: 0, scale: 1 });
    }
  }
  // and a couple right by the fire itself
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4;
    props.push({ kind: "lantern", x: fire.x + Math.sin(a) * 4.4, z: fire.z + Math.cos(a) * 4.4, yaw: 0, scale: 1 });
  }

  const work: SettlementWorkSpot[] = [
    { id: "fire", x: fire.x, z: fire.z, face: 0, sit: true },
    { id: "nets", x: netsSpot.x, z: netsSpot.z, face: SITE.a },
    { id: "fishing", x: pierTip.x, z: pierTip.z, face: SITE.a, sit: true },
    { id: "chase", x: chase.x, z: chase.z, face: 0 },
  ];

  // ── the villager roster (the Reedling Folk): ~12, with a few you can talk to ──
  const SKINS_N = 7; // palette sizes mirror world/settlements's palettes (see index.ts)
  const HAIRS_N = 8;
  const CLOTHS_N = 7;
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
    { id: "reeve", name: "Elder Reeve", elder: true, talk: true, home: 0, sched: [S(0, "home"), S(7, "sit", "fire"), S(10, "wander"), S(13, "sit", "fire"), S(16, "look", "nets"), S(18.5, "drum", "fire"), S(23, "home")], look: { hairStyle: 2, body: 2 } },
    { id: "pike", name: "Pike", talk: true, home: 1, sched: [S(0, "home"), S(5, "fish", "fishing"), S(9.5, "nets", "nets"), S(12, "fish", "fishing"), S(16.5, "nets", "nets"), S(18.6, "dance", "fire"), S(22.4, "home")] },
    { id: "sedge", name: "Sedge", talk: true, home: 2, sched: [S(0, "home"), S(6, "cook", "fire"), S(10.5, "nets", "nets"), S(14, "cook", "fire"), S(18.4, "dance", "fire"), S(22, "home")], look: { body: 3 } },
    { id: "teal", name: "Teal the Drummer", talk: true, home: 3, sched: [S(0, "home"), S(8, "wander"), S(12, "drum", "fire"), S(15, "wander"), S(17.8, "drum", "fire"), S(22.6, "home")], look: { hairStyle: 1 } },
    { id: "wisp", name: "Wisp", kid: true, talk: true, pair: 0, home: 4, sched: [S(0, "home"), S(7.5, "chase", "chase"), S(11, "wander"), S(14, "chase", "chase"), S(18.2, "dance", "fire"), S(21, "home")] },
    { id: "bramble", name: "Bramble", kid: true, talk: true, pair: 1, home: 5, sched: [S(0, "home"), S(7.8, "chase", "chase"), S(11.2, "wander"), S(14.3, "chase", "chase"), S(18.3, "dance", "fire"), S(21.2, "home")], look: { hairStyle: 0 } },
    { id: "marsh", name: "Marsh", home: 6, sched: [S(0, "home"), S(5.5, "fish", "fishing"), S(11, "nets", "nets"), S(15, "fish", "fishing"), S(18.1, "dance", "fire"), S(22.1, "home")] },
    { id: "fenn", name: "Fenn", home: 1, sched: [S(0, "home"), S(6.4, "nets", "nets"), S(9, "fish", "fishing"), S(13, "nets", "nets"), S(17, "wander"), S(18.5, "dance", "fire"), S(22.5, "home")] },
    { id: "rill", name: "Rill", home: 2, sched: [S(0, "home"), S(7, "cook", "fire"), S(11.5, "wander"), S(15.4, "cook", "fire"), S(18.7, "dance", "fire"), S(22.7, "home")], look: { body: 1 } },
    { id: "heron", name: "Heron", home: 7, sched: [S(0, "home"), S(6.2, "look", "nets"), S(10, "wander"), S(13.5, "look", "nets"), S(17.3, "wander"), S(18.6, "dance", "fire"), S(22.3, "home")] },
    { id: "coot", name: "Coot", home: 8, sched: [S(0, "home"), S(7.3, "wander"), S(9.8, "nets", "nets"), S(12.6, "wander"), S(16, "fish", "fishing"), S(18.2, "dance", "fire"), S(22, "home")] },
    { id: "willow", name: "Willow", home: 0, sched: [S(0, "home"), S(6.8, "wander"), S(9.3, "cook", "fire"), S(13.4, "wander"), S(16.6, "cook", "fire"), S(18.9, "dance", "fire"), S(22.8, "home")], look: { body: 1, hairStyle: 1 } },
  ];
  const roster: SettlementVillagerDef[] = ROSTER.map((e, i) => {
    const seed = 4000 + i * 151;
    const rnd = rngOf(seed);
    const jitter = e.talk ? 0 : (rnd() - 0.5) * 0.6;
    const schedule = e.sched.map((s, k) => ({ ...s, from: k === 0 ? s.from : Math.max(0, Math.min(23.9, s.from + jitter)) }));
    const look = e.look ?? {};
    return {
      id: e.id,
      name: e.name,
      home: e.home,
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
      id: "reeve",
      name: "Elder Reeve",
      lines: [
        "Welcome to Lakeside! We've fished the Great Lake for a hundred years.",
        "Lakes are still water — rain and rivers fill them, and the sun can't see the bottom of the deep ones!",
        "See the reeds by the shore? Ducks and frogs hide their nests right in among them.",
        "A calm lake works like a mirror — on a still morning you can see the clouds in it!",
      ],
    },
    {
      id: "pike",
      name: "Pike",
      lines: [
        "I've fished since sunup! Fish breathe through gills — they pull the air right out of the water.",
        "Cast your line out past the reeds, where the big ones hide in the shade.",
        "A fishing rod bends when a fish bites — that's the rod doing the hard work for you!",
        "Some fish, like carp, can live over twenty years. Older than me, maybe!",
      ],
    },
    {
      id: "sedge",
      name: "Sedge",
      lines: [
        "I'm smoking today's catch — smoke dries the fish slowly so it keeps for weeks!",
        "We cook over reed-wood: it burns slow and sweet, nothing like pine.",
        "Share a bowl of lake stew with us before you go fishing!",
      ],
    },
    {
      id: "teal",
      name: "Teal the Drummer",
      lines: [
        "Every evening we drum round the fire as the sun goes down over the water.",
        "A drum's skin was once a stretched hide — tap it and feel it hum!",
        "Stay for the fire tonight — the whole village dances when the stars come out.",
      ],
    },
    {
      id: "wisp",
      name: "Wisp",
      lines: ["Tag, you're it! Come play chase with us by the huts!", "Bramble can't catch me — I'm the fastest in the village!", "Have you been on the pier? It's the best place to watch the water."],
    },
    {
      id: "bramble",
      name: "Bramble",
      lines: ["I caught a tiny minnow once with just my hands!", "Wisp says she's faster, but I always tag her back!", "Watch the herons on the lookout perch — they stand so still before they dive for fish!"],
    },
  ];

  const activities: SettlementActivitySpot[] = [{ id: "fishing", x: pierTip.x, z: pierTip.z, r: 3.2, label: "Go fishing", emoji: "🎣" }];

  const obstacles: SettlementObstacle[] = [
    ...huts.map((h) => ({ x: h.x, z: h.z, r: h.size * 1.5 })),
    { x: smoke.x, z: smoke.z, r: 1.6 },
    { x: fire.x, z: fire.z, r: 1.9 },
    ...racks.map((p) => ({ x: p.x, z: p.z, r: 1.1 })),
  ];

  // two gentle loops for the paddling canoes, a little way out over the water from the pier
  const canoeLoops: { x: number; z: number }[][] = [0, 1].map((i) => {
    const centre = { x: pierTip.x + SHORE_DIR.x * (10 + i * 6), z: pierTip.z + SHORE_DIR.z * (10 + i * 6) };
    const rad = 9 + i * 4;
    return Array.from({ length: 24 }, (_, k) => {
      const a = (k / 24) * TAU;
      return { x: centre.x + Math.sin(a) * rad, z: centre.z + Math.cos(a) * rad * 0.6 };
    });
  });

  return {
    id: "lakeside",
    name: "Lakeside",
    clan: "the Reedling Folk",
    emoji: "🎣",
    style: "lakeside",
    x: cx,
    z: cz,
    radius,
    padHeight: SETTLE_WATER_Y + 0.35 + Math.min(26, wildWaterSdf(cx, cz)) * 0.07,
    stationId: "lake-station",
    huts,
    props,
    nodes,
    edges,
    work,
    roster,
    talk,
    activities,
    obstacles,
    pier,
    canoeLoops,
    fauna: [],
    decks: [],
    levelPatches: [],
    trade: { makes: ["fish", "baskets"], wants: ["shells", "bread", "fruit"] },
  };
}

// ── siting Treetop: a deterministic search in the rainforest round the Great Falls, close to its
// station (registry/wildWater.ts's wildRainforestK says what counts as rainforest), dry and clear
// of the river/pool and the rail ──

const FALLS_STATION = STATIONS.find((s) => s.id === "falls-station")!;
if (!FALLS_STATION) throw new Error("settlements: no falls-station in the railway registry");

/** Treetop's own footprint radius (kept in step with generateTreetop's `radius`, needed here before
 *  that function runs — the site search must check the ground THIS wide is gentle enough). Smaller
 *  than a village sited on a merely-levelled disc would need: a genuinely flat ~48 m clearing is
 *  what the rainforest near the Great Falls actually offers within an easy walk of the station. */
const TREETOP_RADIUS = 24;

export function findTreetopSite(): { x: number; z: number } {
  let best: { x: number; z: number; score: number } | null = null;
  for (let a = 0; a < TAU; a += 0.04) {
    for (let rad = 60; rad <= 220; rad += 4) {
      const x = FALLS_STATION.x + Math.sin(a) * rad;
      const z = FALLS_STATION.z + Math.cos(a) * rad;
      if (seaDist(x, z) > -40) continue;
      if (nearRail(x, z, 10)) continue;
      if (wildWaterSdf(x, z) < 12) continue; // dry, and well clear of the river/pool
      // settlements built within ~550 units of each other (lib/park/world/settlements/index.ts's
      // BUILD_R) would both stream in at once, busting the per-village draw-call budget — keep
      // every village's own station-side search well clear of Lakeside's
      if (Math.hypot(x - SITE.x, z - SITE.z) < 600) continue;
      const k = wildRainforestK(x, z);
      if (k < 0.6) continue;
      // a real, flat forest floor the whole clearing's width — not a levelled patch of a hillside
      if (!footprintOk(x, z, TREETOP_RADIUS)) continue;
      const toPool = Math.hypot(x - WILD_FALLS.pool.x, z - WILD_FALLS.pool.z);
      // lush (high k), not too far a walk from the station, and a glimpse of the falls' pool
      const score = k * 24 - rad * 0.03 - toPool * 0.015;
      if (!best || score > best.score) best = { x, z, score };
    }
  }
  if (!best) throw new Error("settlements: no treetop site found near the Great Falls");
  return { x: Math.round(best.x * 10) / 10, z: Math.round(best.z * 10) / 10 };
}
// Frozen as stored numbers — same reasoning as SITE above (settlements.test.ts re-runs
// findTreetopSite() and checks it still lands here).
const TREETOP_SITE = { x: 891.8, z: -745.1 };

// ── Treetop: the Canopy Folk's treehouse village ──

function generateTreetop(): SettlementDef {
  const r = rngOf(31415);
  const cx = TREETOP_SITE.x;
  const cz = TREETOP_SITE.z;
  const radius = TREETOP_RADIUS;
  // the village's levelled ground: the real (smoothed) natural height at its centre — exactly what
  // terrain.ts levels the pad to (registry/landform.ts, no import cycle), so the walkable decks
  // below sit on it
  const padHeight = settlePadHeight("treehouse", cx, cz);

  // ── the giant rainforest trees: four round the clearing, two of them joined by a reachable
  // platform/ramp/bridge, the other two just for the look of the place (and bed, come nightfall) ──
  const TREE_A = [0.5, 2.35, 3.95, 5.3];
  const TREE_R = [9, 10.5, 8.5, 11.5];
  const TREE_ELEV = [8.5, 9.4, 11.5, 13.2];
  const huts: SettlementHut[] = TREE_A.map((a, i) => {
    const x = cx + Math.sin(a) * TREE_R[i];
    const z = cz + Math.cos(a) * TREE_R[i];
    const yaw = Math.atan2(cx - x, cz - z); // door/ladder facing the fire
    return { x, z, yaw, kind: "treehouse-round", size: 2.2 + (i % 2) * 0.3, elev: TREE_ELEV[i] };
  });

  // ── the ground clearing: the fire, a ring of log drums, a garden of giant leaves and flowers ──
  const fire = { x: cx, z: cz };
  const props: SettlementProp[] = [];
  props.push({ kind: "firepit", x: fire.x, z: fire.z, yaw: 0, scale: 1 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    props.push({ kind: "drumlog", x: fire.x + Math.sin(a) * 3.3, z: fire.z + Math.cos(a) * 3.3, yaw: a + Math.PI, scale: 1 });
  }
  const gardenA = 4.6;
  const garden = { x: cx + Math.sin(gardenA) * 5.5, z: cz + Math.cos(gardenA) * 5.5 };
  for (let i = 0; i < 7; i++) {
    const a = gardenA + (i - 3) * 0.28;
    props.push({ kind: "gardenleaf", x: garden.x + Math.sin(a) * 2, z: garden.z + Math.cos(a) * 2, yaw: a, scale: 0.8 + r() * 0.5 });
  }
  // the giant trees' trunks and canopies themselves
  for (const h of huts) props.push({ kind: "giant-tree", x: h.x, z: h.z, yaw: h.yaw, scale: h.size, elev: h.elev });
  // banana bunches and woven baskets dotted round the clearing
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.7;
    props.push({ kind: "banana-bunch", x: cx + Math.sin(a) * 4, z: cz + Math.cos(a) * 4, yaw: a, scale: 1 });
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 2.1;
    props.push({ kind: "basket", x: cx + Math.sin(a) * 3.3, z: cz + Math.cos(a) * 3.3, yaw: a, scale: 1 });
  }
  // a spot to weave baskets, under the trees
  const weaveA = 1.7;
  const weaveSpot = { x: cx + Math.sin(weaveA) * 4.6, z: cz + Math.cos(weaveA) * 4.6 };
  props.push({ kind: "basket", x: weaveSpot.x, z: weaveSpot.z, yaw: weaveA, scale: 1.2 });
  const fruitA = 3.1;
  const fruitSpot = { x: cx + Math.sin(fruitA) * 5.2, z: cz + Math.cos(fruitA) * 5.2 };
  // the chase play spot
  const chase = { x: cx + Math.sin(0) * 6.7, z: cz + Math.cos(0) * 6.7 };

  // ── decks: a ramp up from the ground to tree A's platform, a rope bridge across to tree B's, and
  // a SECOND rope bridge on from B to tree C's (D stays ambient — just for the look of the place,
  // and bed, come nightfall) ──
  const A = huts[0];
  const B = huts[1];
  const C = huts[2];
  // kept in step with world/settlements/styles/treetop.ts's own treehousePorchR (the cabin's
  // rendered porch radius) — a walkable platform always lines up exactly with the cabin built on it
  const platR = (h: SettlementHut) => 1.85 * h.size * 1.08;
  const rampOutA = A.yaw + Math.PI;
  const rampBaseA = { x: A.x + Math.sin(rampOutA) * (platR(A) + 4), z: A.z + Math.cos(rampOutA) * (platR(A) + 4) };
  const decks: SettlementDeckPiece[] = [
    { kind: "circle", x: A.x, z: A.z, y: padHeight + A.elev!, r: platR(A) },
    { kind: "circle", x: B.x, z: B.z, y: padHeight + B.elev!, r: platR(B) },
    { kind: "circle", x: C.x, z: C.z, y: padHeight + C.elev!, r: platR(C) },
    { kind: "line", ax: rampBaseA.x, az: rampBaseA.z, ay: padHeight, bx: A.x, bz: A.z, by: padHeight + A.elev!, half: 1.1, tag: "ramp" },
    { kind: "line", ax: A.x, az: A.z, ay: padHeight + A.elev!, bx: B.x, bz: B.z, by: padHeight + B.elev!, half: 0.85, tag: "bridge" },
    { kind: "line", ax: B.x, az: B.z, ay: padHeight + B.elev!, bx: C.x, bz: C.z, by: padHeight + C.elev!, half: 0.85, tag: "bridge" },
  ];

  // lanterns and glowing flowers along the ground paths, and up on both platforms
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    props.push({ kind: "lantern", x: fire.x + Math.sin(a) * 4.6, z: fire.z + Math.cos(a) * 4.6, yaw: 0, scale: 1 });
  }
  for (const h of [A, B]) props.push({ kind: "lantern", x: h.x + h.size * 0.6, z: h.z + h.size * 0.6, yaw: 0, scale: 1 });

  // ── the path graph: a hub at the fire, a spoke to every tree's base (villagers climb up out of
  // sight — the platforms/bridge are for the kid, not simulated as part of anyone's walk) ──
  const nodes: SettlementNode[] = [{ id: "fire", x: fire.x, z: fire.z }];
  const edges: [number, number][] = [];
  const addNode = (id: string, x: number, z: number) => {
    nodes.push({ id, x, z });
    return nodes.length - 1;
  };
  huts.forEach((h, i) => {
    const doorX = h.x + Math.sin(h.yaw + Math.PI) * 1.4;
    const doorZ = h.z + Math.cos(h.yaw + Math.PI) * 1.4;
    const idx = addNode(`home-${i}`, doorX, doorZ);
    edges.push([0, idx]);
  });
  const weaveIdx = addNode("weave", weaveSpot.x, weaveSpot.z);
  edges.push([0, weaveIdx]);
  const fruitIdx = addNode("fruit", fruitSpot.x, fruitSpot.z);
  edges.push([0, fruitIdx]);
  const gardenIdx = addNode("garden", garden.x, garden.z);
  edges.push([0, gardenIdx]);
  const chaseIdx = addNode("chase", chase.x, chase.z);
  edges.push([0, chaseIdx]);

  const work: SettlementWorkSpot[] = [
    { id: "fire", x: fire.x, z: fire.z, face: 0, sit: true },
    { id: "weave", x: weaveSpot.x, z: weaveSpot.z, face: weaveA + Math.PI, sit: true },
    { id: "fruit", x: fruitSpot.x, z: fruitSpot.z, face: fruitA + Math.PI },
    { id: "garden", x: garden.x, z: garden.z, face: gardenA + Math.PI },
    { id: "chase", x: chase.x, z: chase.z, face: 0 },
  ];

  // ── the Canopy Folk: ~11, greens/orange/magenta/yellow cloth and flower crowns ──
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
    { id: "canopy-elder", name: "Elder Fern", elder: true, talk: true, home: 2, sched: [S(0, "home"), S(6.5, "sit", "fire"), S(10, "wander"), S(13, "sit", "fire"), S(16, "look", "fruit"), S(18.3, "drum", "fire"), S(23, "home")], look: { hairStyle: 2, body: 2 } },
    { id: "mango", name: "Mango", talk: true, home: 0, sched: [S(0, "home"), S(5.5, "nets", "fruit"), S(9.5, "wander"), S(12, "nets", "fruit"), S(16.4, "nets", "fruit"), S(18.5, "dance", "fire"), S(22.3, "home")] },
    { id: "reed-weaver", name: "Palma", talk: true, home: 1, sched: [S(0, "home"), S(6, "nets", "weave"), S(10.4, "nets", "weave"), S(13.6, "nets", "weave"), S(18.4, "dance", "fire"), S(22, "home")], look: { body: 3 } },
    { id: "tambo", name: "Tambo the Drummer", talk: true, home: 3, sched: [S(0, "home"), S(8, "wander"), S(12, "drum", "fire"), S(15, "wander"), S(17.8, "drum", "fire"), S(22.6, "home")], look: { hairStyle: 1 } },
    { id: "wren", name: "Wren", kid: true, talk: true, pair: 0, home: 0, sched: [S(0, "home"), S(7.5, "chase", "chase"), S(11, "wander"), S(14, "chase", "chase"), S(18.2, "dance", "fire"), S(21, "home")] },
    { id: "sorrel", name: "Sorrel", kid: true, talk: true, pair: 1, home: 1, sched: [S(0, "home"), S(7.8, "chase", "chase"), S(11.2, "wander"), S(14.3, "chase", "chase"), S(18.3, "dance", "fire"), S(21.2, "home")], look: { hairStyle: 0 } },
    { id: "cacao", name: "Cacao", home: 2, sched: [S(0, "home"), S(6.2, "cook", "garden"), S(10.5, "wander"), S(14.5, "cook", "garden"), S(18.1, "dance", "fire"), S(22.1, "home")] },
    { id: "liana", name: "Liana", home: 3, sched: [S(0, "home"), S(6.6, "nets", "weave"), S(9.4, "wander"), S(13.2, "nets", "weave"), S(17, "wander"), S(18.5, "dance", "fire"), S(22.5, "home")] },
    { id: "tamarind", name: "Tamarind", home: 0, sched: [S(0, "home"), S(7, "cook", "garden"), S(11.5, "wander"), S(15.4, "cook", "garden"), S(18.7, "dance", "fire"), S(22.7, "home")], look: { body: 1 } },
    { id: "sloth-watcher", name: "Moss", home: 1, sched: [S(0, "home"), S(6.2, "look", "fruit"), S(10, "wander"), S(13.5, "look", "fruit"), S(17.3, "wander"), S(18.6, "dance", "fire"), S(22.3, "home")] },
    { id: "toucan-watcher", name: "Pip", home: 2, sched: [S(0, "home"), S(7.3, "wander"), S(9.8, "nets", "fruit"), S(12.6, "wander"), S(16, "nets", "weave"), S(18.2, "dance", "fire"), S(22, "home")] },
  ];
  const SKINS_N = 7;
  const HAIRS_N = 8;
  const CLOTHS_N = 7;
  const roster: SettlementVillagerDef[] = ROSTER.map((e, i) => {
    const seed = 6000 + i * 151;
    const rnd = rngOf(seed);
    const jitter = e.talk ? 0 : (rnd() - 0.5) * 0.6;
    const schedule = e.sched.map((s, k) => ({ ...s, from: k === 0 ? s.from : Math.max(0, Math.min(23.9, s.from + jitter)) }));
    const look = e.look ?? {};
    return {
      id: e.id,
      name: e.name,
      home: e.home,
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
      id: "canopy-elder",
      name: "Elder Fern",
      lines: [
        "Welcome to Treetop! We've lived up these giant trees for as long as anyone can remember.",
        "Half of all the world's plants and animals live in rainforests just like this one!",
        "It rains and rains here — over two metres a year! That's why everything grows so big.",
        "A rainforest has layers: the forest floor, the shady understory, the leafy canopy, and the tall emergents on top.",
      ],
    },
    {
      id: "mango",
      name: "Mango",
      lines: [
        "I climb for fruit every morning — mangoes, bananas, whatever's ripe!",
        "Fruit bats and toucans spread seeds as they eat, so new trees grow far from the old one.",
        "The Great Falls' spray drifts all the way here and waters our garden!",
      ],
    },
    {
      id: "reed-weaver",
      name: "Palma",
      lines: [
        "I weave baskets from palm leaves, up here on my platform.",
        "Poison dart frogs are tiny and bright — their colours warn everyone else to stay away.",
        "Many medicines people use come from rainforest plants. This forest is a giant pharmacy!",
      ],
    },
    {
      id: "tambo",
      name: "Tambo the Drummer",
      lines: ["Come drum with us round the fire! Our log drums carry right up through the canopy.", "A sloth moves so slowly that moss grows right on its fur!", "Join the circle tonight — the whole village dances when the drums start."],
    },
    {
      id: "wren",
      name: "Wren",
      lines: ["Race you up the ramp to the platform!", "Sorrel's scared of the rope bridge, but I love it!", "Toucans have huge colourful beaks, but they're surprisingly light!"],
    },
    {
      id: "sorrel",
      name: "Sorrel",
      lines: ["I am NOT scared of the bridge, Wren just goes first!", "I found a frog as bright as a candy wrapper — didn't touch it though!", "Watch the canopy — that's where all the parrots chatter in the morning."],
    },
  ];

  const activities: SettlementActivitySpot[] = [{ id: "drumming", x: fire.x, z: fire.z + 1.6, r: 3.4, label: "Join the drums", emoji: "\u{1F941}" }];

  const obstacles: SettlementObstacle[] = [...huts.map((h) => ({ x: h.x, z: h.z, r: h.size * 1.6 })), { x: fire.x, z: fire.z, r: 1.9 }];

  return {
    id: "treetop",
    name: "Treetop",
    clan: "the Canopy Folk",
    emoji: "\u{1F412}",
    style: "treehouse",
    x: cx,
    z: cz,
    radius,
    padHeight,
    stationId: "falls-station",
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
    decks,
    levelPatches: [],
    trade: { makes: ["fruit", "baskets"], wants: ["fish", "shells", "wool"] },
  };
}

// ── siting Highstone: a deterministic search on a real, gentle shelf near the Lone Peak, below the
// snow line, close to Lone Peak Station — scored on the REAL terrain (registry/landform.ts), not an
// approximation ──

const PEAK_STATION = STATIONS.find((s) => s.id === "peak-station")!;
if (!PEAK_STATION) throw new Error("settlements: no peak-station in the railway registry");
/** the heading from the station out towards the peak itself, so the village can sit between them
 *  (the peak towering behind it, seen from the open slopes) */
const A_PEAK = Math.atan2(LONE_PEAK.x - PEAK_STATION.x, LONE_PEAK.z - PEAK_STATION.z);
/** Highstone's own footprint radius (kept in step with generateHighstone's `radius`) — smaller than
 *  a village sited on a merely-levelled disc would need (see TREETOP_RADIUS's own comment): a
 *  genuinely flat ~56 m shelf is what the slopes near the Lone Peak actually offer */
const HIGHSTONE_RADIUS = 28;
/** a healthy margin under the ~72-unit snow line (lib/park/world/fantasy/terrainMesh.ts) */
const SNOW_LINE_MARGIN = 58;

export function findHighstoneSite(): { x: number; z: number } {
  let best: { x: number; z: number; score: number } | null = null;
  // a full sweep round the station (not just toward the peak): a genuinely flat shelf is scarce
  // enough near the Lone Peak that insisting on one particular heading too often finds nothing at
  // all — "the peak towering behind" is a scoring preference below, not a hard requirement
  for (let a = 0; a < TAU; a += 0.02) {
    for (let rad = 40; rad <= 200; rad += 4) {
      const x = PEAK_STATION.x + Math.sin(a) * rad;
      const z = PEAK_STATION.z + Math.cos(a) * rad;
      if (seaDist(x, z) > -40) continue;
      if (nearRail(x, z, 10)) continue;
      if (wildWaterSdf(x, z) < 8) continue;
      // keep well clear of Lakeside's and Treetop's own build radius (see findTreetopSite) — the
      // Lone Peak and Great Lake stations sit only ~440 apart, so this is the tightest margin the
      // geometry allows (still comfortably over BUILD_R = 550)
      if (Math.hypot(x - SITE.x, z - SITE.z) < 570) continue;
      if (Math.hypot(x - TREETOP_SITE.x, z - TREETOP_SITE.z) < 570) continue;
      const h = rawHeight(x, z);
      if (h > SNOW_LINE_MARGIN) continue;
      // a real, flat shelf the whole village's width — not a levelled patch of a steep flank (the
      // very bug an earlier, approximated version of this search let through)
      if (!footprintOk(x, z, HIGHSTONE_RADIUS)) continue;
      const towardPeak = Math.abs(((a - A_PEAK + Math.PI) % TAU) - Math.PI);
      const score = -Math.abs(rad - 95) * 0.05 - towardPeak * 3;
      if (!best || score > best.score) best = { x, z, score };
    }
  }
  if (!best) throw new Error("settlements: no highstone site found near the Lone Peak");
  return { x: Math.round(best.x * 10) / 10, z: Math.round(best.z * 10) / 10 };
}
// Frozen as stored numbers — same reasoning as SITE above (settlements.test.ts re-runs
// findHighstoneSite() and checks it still lands here).
const HIGHSTONE_SITE = { x: 1961.6, z: -273.7 };

// ── Highstone: the Peakfolk's mountain village ──

function generateHighstone(): SettlementDef {
  const r = rngOf(27182);
  const cx = HIGHSTONE_SITE.x;
  const cz = HIGHSTONE_SITE.z;
  const radius = HIGHSTONE_RADIUS;
  const padHeight = settlePadHeight("mountain", cx, cz);
  const inlandA = A_PEAK + Math.PI; // away from the peak, out towards the open slopes

  // ── cottages: a loose ring, varied radii and headings, like Lakeside's land huts — a real,
  // walk-up-to-able cottage, not a dollhouse: its own ridge comes out ~3.5-4.5 m tall (1 m ≈ 1.6
  // world units; a 1.4 m child kid stands 2.26 units tall), so `size` (the renderer's one scale
  // knob — world/settlements/styles/mountain.ts's buildCottage is written entirely in terms of it)
  // is picked a good deal bigger than the old dollhouse-scale 0.9-1.2 ──
  const HIGHSTONE_HUT_SCALE = 1.9;
  const huts: SettlementHut[] = [];
  const GAP = 3.2;
  const fitsHuts = (x: number, z: number, size: number, gap: number) => huts.every((h) => Math.hypot(h.x - x, h.z - z) > (h.size + size) * 1.15 + gap);
  for (const gap of [GAP, GAP * 0.7, GAP * 0.45, GAP * 0.25, 0]) {
    let placed = huts.length;
    for (let tries = 0; placed < 7 && tries < 600; tries++) {
      const a = r() * TAU;
      const rad = 9 + r() * 13;
      const size = (0.9 + r() * 0.3) * HIGHSTONE_HUT_SCALE;
      const x = cx + Math.sin(a) * rad;
      const z = cz + Math.cos(a) * rad;
      if (!fitsHuts(x, z, size, gap)) continue;
      const yaw = Math.atan2(cx - x, cz - z);
      huts.push({ x, z, yaw, kind: "stone-cottage", size });
      placed++;
    }
    if (placed >= 7) break;
  }

  // ── the hearth, firewood, a water trough, bunting strung cottage to cottage ──
  const fire = { x: cx, z: cz };
  const props: SettlementProp[] = [];
  props.push({ kind: "firepit", x: fire.x, z: fire.z, yaw: 0, scale: 1 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    props.push({ kind: "bench", x: fire.x + Math.sin(a) * 3.1, z: fire.z + Math.cos(a) * 3.1, yaw: a + Math.PI, scale: 1 });
  }
  const troughA = inlandA + 0.6;
  const trough = { x: cx + Math.sin(troughA) * 6, z: cz + Math.cos(troughA) * 6 };
  props.push({ kind: "trough", x: trough.x, z: trough.z, yaw: troughA, scale: 1 });
  for (let i = 0; i < 3; i++) {
    const a = inlandA - 0.9 + i * 0.35;
    props.push({ kind: "firewood", x: cx + Math.sin(a) * 7, z: cz + Math.cos(a) * 7, yaw: a, scale: 1 });
  }
  // bunting strung between neighbouring cottages (reuses the boardwalk encoding: x/z = one end,
  // yaw = heading to the other, scale = the gap between them)
  for (let i = 0; i < huts.length; i++) {
    const a = huts[i];
    const b = huts[(i + 1) % huts.length];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d > 12) continue;
    props.push({ kind: "bunting", x: a.x, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z), scale: d });
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.5;
    props.push({ kind: "lantern", x: fire.x + Math.sin(a) * 4.4, z: fire.z + Math.cos(a) * 4.4, yaw: 0, scale: 1 });
  }

  // ── the craft hut and its loom, facing the pasture ──
  const loomA = inlandA + 2.0;
  const loomSpot = { x: cx + Math.sin(loomA) * 9, z: cz + Math.cos(loomA) * 9 };
  props.push({ kind: "loom", x: loomSpot.x, z: loomSpot.z, yaw: loomA + Math.PI, scale: 1 });

  // the well (with its own little roof) and a small bell tower, right in the square, tucked into
  // the gaps between the ring of benches round the fire (not on top of one)
  const wellA = 0.52;
  props.push({ kind: "well", x: cx + Math.sin(wellA) * 4.6, z: cz + Math.cos(wellA) * 4.6, yaw: 0, scale: 1 });
  const bellA = 2.62;
  props.push({ kind: "belltower", x: cx + Math.sin(bellA) * 4.8, z: cz + Math.cos(bellA) * 4.8, yaw: 0, scale: 1 });
  props.push({ kind: "cheeserack", x: loomSpot.x + Math.sin(loomA + 1.2) * 2.6, z: loomSpot.z + Math.cos(loomA + 1.2) * 2.6, yaw: loomA, scale: 1 });

  // a couple of terraced vegetable beds (cabbages, pumpkins) walled in stone, out towards the open
  // slopes where the sun reaches them
  const gardenA = inlandA + 1.25;
  for (let i = 0; i < 2; i++) {
    const gx = cx + Math.sin(gardenA) * (11 + i * 1.6);
    const gz = cz + Math.cos(gardenA) * (11 + i * 1.6);
    props.push({ kind: "gardenbed", x: gx, z: gz, yaw: gardenA + Math.PI / 2, scale: 2.2 });
  }

  // ── the yak pasture: a fenced oval out past the cottages, 5 yaks, 2 goats and 3 sheep grazing ──
  // picked (not just "away from the peak") by checking the REAL terrain's own slope all round the
  // pasture's footprint — `inlandA`'s own heading happens to point the pasture straight at a real,
  // quite steep little slope just past its fence (up to ~0.65 — well past the ~0.3 where rock
  // colouring kicks in), which no amount of levelPatch blending can hide without just moving the
  // problem further out; this heading's surroundings are genuinely gentle the whole way out past
  // the levelled ring, so it reads as pasture, not a cliff edge
  const pastureA = 4.614;
  // pulled in a little closer to the village centre (real, already-validated-gentle ground), and
  // levelled with a much wider soft ramp (see the levelPatch below) — the old narrow 2-unit ramp
  // squeezed the pad-to-natural height gap into so short a run that it read as an artificial little
  // cliff (rock colouring kicks in past ~0.3 slope), not a grassy pasture
  const pasture = { x: cx + Math.sin(pastureA) * 15, z: cz + Math.cos(pastureA) * 15, r: 8.5 };
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    props.push({ kind: "fencepost", x: pasture.x + Math.sin(a) * pasture.r, z: pasture.z + Math.cos(a) * pasture.r, yaw: a, scale: 1 });
  }
  const fauna: SettlementFauna[] = [];
  const YAK_N = 5;
  for (let i = 0; i < YAK_N; i++) {
    const a = (i / YAK_N) * TAU + 0.4;
    const rad = pasture.r * (0.35 + 0.4 * r());
    fauna.push({ id: `yak-${i}`, kind: "yak", x: pasture.x + Math.sin(a) * rad, z: pasture.z + Math.cos(a) * rad, yaw: r() * TAU, scale: 0.95 + r() * 0.15 });
  }
  for (let i = 0; i < 2; i++) {
    const a = (i / 2) * TAU + 2.6;
    const rad = pasture.r * 0.85;
    fauna.push({ id: `goat-${i}`, kind: "goat", x: pasture.x + Math.sin(a) * rad, z: pasture.z + Math.cos(a) * rad, yaw: r() * TAU, scale: 0.55 });
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 1.3;
    const rad = pasture.r * (0.3 + 0.35 * r());
    fauna.push({ id: `sheep-${i}`, kind: "sheep", x: pasture.x + Math.sin(a) * rad, z: pasture.z + Math.cos(a) * rad, yaw: r() * TAU, scale: 0.7 + r() * 0.1 });
  }

  // the chase play spot, and a herding watch spot by the fence
  const chase = { x: cx + Math.sin(inlandA) * 7, z: cz + Math.cos(inlandA) * 7 };
  const herdSpot = { x: pasture.x + Math.sin(pastureA + Math.PI) * (pasture.r + 2), z: pasture.z + Math.cos(pastureA + Math.PI) * (pasture.r + 2) };

  // ── the path graph ──
  const nodes: SettlementNode[] = [{ id: "fire", x: fire.x, z: fire.z }];
  const edges: [number, number][] = [];
  const addNode = (id: string, x: number, z: number) => {
    nodes.push({ id, x, z });
    return nodes.length - 1;
  };
  huts.forEach((h, i) => {
    const doorX = h.x - Math.sin(h.yaw) * (h.size * 1.3);
    const doorZ = h.z - Math.cos(h.yaw) * (h.size * 1.3);
    const idx = addNode(`home-${i}`, doorX, doorZ);
    edges.push([0, idx]);
  });
  const loomIdx = addNode("loom", loomSpot.x, loomSpot.z);
  edges.push([0, loomIdx]);
  const herdIdx = addNode("herd", herdSpot.x, herdSpot.z);
  edges.push([loomIdx, herdIdx]);
  const chaseIdx = addNode("chase", chase.x, chase.z);
  edges.push([0, chaseIdx]);

  const work: SettlementWorkSpot[] = [
    { id: "fire", x: fire.x, z: fire.z, face: 0, sit: true },
    { id: "loom", x: loomSpot.x, z: loomSpot.z, face: loomA + Math.PI, sit: true },
    { id: "herd", x: herdSpot.x, z: herdSpot.z, face: pastureA },
    { id: "chase", x: chase.x, z: chase.z, face: 0 },
  ];

  // ── the Peakfolk: ~11, warm reds/deep blue/purple/mustard, knitted-cap hair colours ──
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
    { id: "peak-elder", name: "Elder Crag", elder: true, talk: true, home: 0, sched: [S(0, "home"), S(6.5, "sit", "fire"), S(10, "wander"), S(13, "sit", "fire"), S(16, "look", "herd"), S(18.3, "sit", "fire"), S(23, "home")], look: { hairStyle: 2, body: 2 } },
    { id: "shale", name: "Shale", talk: true, home: 1, sched: [S(0, "home"), S(5.6, "look", "herd"), S(9.5, "wander"), S(12, "look", "herd"), S(16.4, "look", "herd"), S(18.5, "dance", "fire"), S(22.3, "home")] },
    { id: "flax", name: "Flax", talk: true, home: 2, sched: [S(0, "home"), S(6, "nets", "loom"), S(10.4, "nets", "loom"), S(13.6, "nets", "loom"), S(18.4, "dance", "fire"), S(22, "home")], look: { body: 3 } },
    { id: "pipit", name: "Pipit the Piper", talk: true, home: 3, sched: [S(0, "home"), S(8, "wander"), S(12, "drum", "fire"), S(15, "wander"), S(17.8, "drum", "fire"), S(22.6, "home")], look: { hairStyle: 1 } },
    { id: "thistle", name: "Thistle", kid: true, talk: true, pair: 0, home: 1, sched: [S(0, "home"), S(7.5, "chase", "chase"), S(11, "wander"), S(14, "chase", "chase"), S(18.2, "dance", "fire"), S(21, "home")] },
    { id: "bramblet", name: "Fell", kid: true, talk: true, pair: 1, home: 2, sched: [S(0, "home"), S(7.8, "chase", "chase"), S(11.2, "wander"), S(14.3, "chase", "chase"), S(18.3, "dance", "fire"), S(21.2, "home")], look: { hairStyle: 0 } },
    { id: "cairn", name: "Cairn", home: 3, sched: [S(0, "home"), S(6.2, "cook", "fire"), S(10.5, "wander"), S(14.5, "cook", "fire"), S(18.1, "dance", "fire"), S(22.1, "home")] },
    { id: "wether", name: "Wether", home: 0, sched: [S(0, "home"), S(6.6, "look", "herd"), S(9.4, "wander"), S(13.2, "look", "herd"), S(17, "wander"), S(18.5, "dance", "fire"), S(22.5, "home")] },
    { id: "ember", name: "Ember", home: 1, sched: [S(0, "home"), S(7, "cook", "fire"), S(11.5, "wander"), S(15.4, "cook", "fire"), S(18.7, "dance", "fire"), S(22.7, "home")], look: { body: 1 } },
    { id: "tansy", name: "Tansy", home: 2, sched: [S(0, "home"), S(6.2, "nets", "loom"), S(10, "wander"), S(13.5, "nets", "loom"), S(17.3, "wander"), S(18.6, "dance", "fire"), S(22.3, "home")] },
    { id: "slate", name: "Slate", home: 3, sched: [S(0, "home"), S(7.3, "wander"), S(9.8, "look", "herd"), S(12.6, "wander"), S(16, "nets", "loom"), S(18.2, "dance", "fire"), S(22, "home")] },
  ];
  const SKINS_N = 7;
  const HAIRS_N = 8;
  const CLOTHS_N = 7;
  const roster: SettlementVillagerDef[] = ROSTER.map((e, i) => {
    const seed = 8000 + i * 151;
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
      id: "peak-elder",
      name: "Elder Crag",
      lines: [
        "Welcome to Highstone! We've herded yaks on these slopes for generations.",
        "The air gets thinner and colder the higher you climb — that's why the peak wears snow all year.",
        "Mount Everest is the tallest mountain above the sea — about 8,849 metres high!",
        "We terrace our slopes into little steps, so the soil stays put and our crops can grow.",
      ],
    },
    {
      id: "shale",
      name: "Shale",
      lines: [
        "Our yaks have thick shaggy coats and big lungs — just right for the thin mountain air.",
        "Yak wool is wonderfully warm. We spin it, weave it, and wear it all winter.",
        "A glacier is really a river of ice — it moves, just far too slowly to see.",
      ],
    },
    {
      id: "flax",
      name: "Flax",
      lines: ["I spin yak wool into yarn, then weave it at my loom.", "Snow never melts off the very highest peaks — it's simply too cold up there, even in summer.", "Come and try the loom with me — over, under, over, under!"],
    },
    {
      id: "pipit",
      name: "Pipit the Piper",
      lines: ["I play my flute by the fire every evening, once the yaks are settled.", "Mountain goats can balance on ledges you'd think no one could stand on!", "Stay for the fire tonight — we love a tune and a dance under the stars."],
    },
    {
      id: "thistle",
      name: "Thistle",
      lines: ["Tag! Catch me if you can, round the cottages!", "Fell always loses — he stops to pat the yaks!", "Have you seen the baby yak calves? They're wobblier than the grown-ups."],
    },
    {
      id: "bramblet",
      name: "Fell",
      lines: ["I'm not slow, I just like saying hello to the yaks.", "Thistle thinks she's fast, but I know all the shortcuts!", "Watch the goats on the rocks — they never slip, not once!"],
    },
  ];

  const activities: SettlementActivitySpot[] = [{ id: "weaving", x: loomSpot.x, z: loomSpot.z, r: 3.2, label: "Weave with the Peakfolk", emoji: "\u{1F9F6}" }];

  const obstacles: SettlementObstacle[] = [...huts.map((h) => ({ x: h.x, z: h.z, r: h.size * 1.5 })), { x: fire.x, z: fire.z, r: 1.9 }, { x: trough.x, z: trough.z, r: 1.1 }, ...fauna.map((f) => ({ x: f.x, z: f.z, r: 0.9 * f.scale }))];

  return {
    id: "highstone",
    name: "Highstone",
    clan: "the Peakfolk",
    emoji: "\u{1F3D4}\u{FE0F}",
    style: "mountain",
    x: cx,
    z: cz,
    radius,
    padHeight,
    stationId: "peak-station",
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
    fauna,
    decks: [],
    // the yak pasture reaches out past any one hut/work spot's own stamp radius — level the whole
    // disc flush with the village's shared pad so the yaks graze on flat ground, not a hillside
    levelPatches: [{ x: pasture.x, z: pasture.z, rIn: pasture.r + 1, rOut: pasture.r + 7 }],
    trade: { makes: ["wool", "cheese"], wants: ["fish", "fruit", "bread"] },
  };
}

export const SETTLEMENTS: SettlementDef[] = [generateLakeside(), generateTreetop(), generateHighstone(), generateTown([SITE, TREETOP_SITE, HIGHSTONE_SITE]), generateBaseCamp()];

// ── helpers shared by the terrain stamp, the engine's push-out collision, the renderer and tests ──

/** the settlement whose pad (or pier) (x, z) sits in (within `pad` of its radius), or null */
export function settlementAt(x: number, z: number, pad = 0): SettlementDef | null {
  for (const s of SETTLEMENTS) if (Math.hypot(x - s.x, z - s.z) < s.radius + pad) return s;
  return null;
}
export const inSettlement = (x: number, z: number, pad = 0): boolean => settlementAt(x, z, pad) !== null;

/** every settlement's obstacles, in world coordinates (for the kid's push-out collision) */
export const SETTLEMENT_OBSTACLES: SettlementObstacle[] = SETTLEMENTS.flatMap((s) => s.obstacles);

/** a straight walkable deck's height at (x, z): null if (x, z) isn't over it, else the height,
 *  sloped linearly from (ax, ay) to (bx, by) (flat when ay === by, exactly a pier's own deckY) */
function lineDeckY(ax: number, az: number, ay: number, bx: number, bz: number, by: number, half: number, x: number, z: number): number | null {
  const ux = bx - ax;
  const uz = bz - az;
  const L2 = ux * ux + uz * uz || 1;
  const t = ((x - ax) * ux + (z - az) * uz) / L2;
  if (t < -0.08 || t > 1.08) return null;
  const px = ax + ux * t - x;
  const pz = az + uz * t - z;
  if (px * px + pz * pz > half * half) return null;
  return ay + (by - ay) * Math.max(0, Math.min(1, t));
}
/** the walkable deck height at (x, z), or null (so a kid can walk out over the water instead of
 *  swimming under it, or up a treehouse's platform/ramp/bridge instead of walking through the
 *  trunk) — every settlement's pier (Lakeside) and `decks` (Treetop's platforms/ramp/bridge) */
export function settlementDeckY(x: number, z: number): number | null {
  let best: number | null = null;
  for (const s of SETTLEMENTS) {
    const p = s.pier;
    if (p && Math.abs(x - p.ax) <= 40 + p.half && Math.abs(z - p.az) <= 40 + p.half) {
      const y = lineDeckY(p.ax, p.az, p.deckY, p.bx, p.bz, p.deckY, p.half, x, z);
      if (y !== null && (best === null || y > best)) best = y;
    }
    for (const d of s.decks) {
      if (d.kind === "circle") {
        const dx = x - d.x;
        const dz = z - d.z;
        if (dx * dx + dz * dz <= d.r * d.r && (best === null || d.y > best)) best = d.y;
      } else {
        const y = lineDeckY(d.ax, d.az, d.ay, d.bx, d.bz, d.by, d.half, x, z);
        if (y !== null && (best === null || y > best)) best = y;
      }
    }
  }
  return best;
}
