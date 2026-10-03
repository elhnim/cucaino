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
import { WILD_LAKE, wildLakeRadius, wildWaterSdf } from "./wildWater";

/** kept in step with terrain.ts WATER_Y (registry/settlements.ts must not import terrain.ts: that
 *  would be circular, since terrain.ts's stamps() reads SETTLEMENTS to level their ground) */
export const SETTLE_WATER_Y = -0.25;

export type SettlementStyle = "lakeside" | "treehouse" | "mountain" | "town";

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

// ── the shape of one settlement ──

export interface SettlementHut {
  x: number;
  z: number;
  yaw: number;
  kind: string;
  size: number;
  /** a stilt house standing right at the waterline (Lakeside's shore huts), not a land hut */
  shore?: boolean;
}
export interface SettlementProp {
  kind: string;
  x: number;
  z: number;
  yaw: number;
  scale: number;
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
 *  shared crowd module's Anim poses (world/village/crowd.ts), so no new rigging is ever needed */
export type SettlementAct = "home" | "wander" | "fish" | "nets" | "cook" | "dance" | "drum" | "chase" | "look" | "sit";
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

function findLakesideSite(): { x: number; z: number; a: number } {
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

const SITE = findLakesideSite();
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
        const size = 0.82 + r() * 0.35;
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
    trade: { makes: ["fish", "baskets"], wants: ["shells", "bread", "fruit"] },
  };
}

export const SETTLEMENTS: SettlementDef[] = [generateLakeside()];

// ── helpers shared by the terrain stamp, the engine's push-out collision, the renderer and tests ──

/** the settlement whose pad (or pier) (x, z) sits in (within `pad` of its radius), or null */
export function settlementAt(x: number, z: number, pad = 0): SettlementDef | null {
  for (const s of SETTLEMENTS) if (Math.hypot(x - s.x, z - s.z) < s.radius + pad) return s;
  return null;
}
export const inSettlement = (x: number, z: number, pad = 0): boolean => settlementAt(x, z, pad) !== null;

/** every settlement's obstacles, in world coordinates (for the kid's push-out collision) */
export const SETTLEMENT_OBSTACLES: SettlementObstacle[] = SETTLEMENTS.flatMap((s) => s.obstacles);

/** the walkable deck height of a settlement's pier under (x, z), or null (so a kid can walk out
 *  over the water instead of swimming under it) */
export function settlementDeckY(x: number, z: number): number | null {
  let best: number | null = null;
  for (const s of SETTLEMENTS) {
    const p = s.pier;
    if (!p) continue;
    if (Math.abs(x - p.ax) > 40 || Math.abs(z - p.az) > 40) continue;
    const ux = p.bx - p.ax;
    const uz = p.bz - p.az;
    const L2 = ux * ux + uz * uz || 1;
    const t = ((x - p.ax) * ux + (z - p.az) * uz) / L2;
    if (t < -0.08 || t > 1.08) continue;
    const px = p.ax + ux * t - x;
    const pz = p.az + uz * t - z;
    if (px * px + pz * pz > p.half * p.half) continue;
    if (best === null || p.deckY > best) best = p.deckY;
  }
  return best;
}
