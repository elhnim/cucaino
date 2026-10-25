// The Tidewing Folk's day on Coralcove Isle — pure logic, no three.js (tested).
//
// Every villager has a daily schedule (slots of the park's 24-hour clock: sell at the market,
// bake, fish off the jetty, sweep, garden, hang the washing, play chase and skipping, light the
// lanterns at dusk, drum and dance round the fire at twilight, go home to sleep). They walk
// between places along the village path graph (shortest routes precomputed), then do their thing
// at a work spot. When the Park kid comes near they turn and wave; the ones with something to say
// stop and chat (the engine shows the line in a speech bubble).
//
// `stepVillage()` advances everyone and fills a pose per villager (reused objects, no allocation
// per frame); the renderer (./index.ts) turns poses into instance matrices.
import {
  VILLAGE_FIRE,
  VILLAGE_HOMES,
  VILLAGE_LANTERNS,
  VILLAGE_PATHS,
  VILLAGE_WORK,
  VILLAGERS_TALK,
  villageGroundY,
  villageNode,
  villageRng,
  type VillageWorkSpot,
} from "../../registry/villageIsland";
// Pose/Anim/Tool and the rig they resolve to now live in ./crowd (shared with every settlement's
// folk); re-exported here so nothing importing them from "./routine" has to change.
import { TOOLS, type Anim, type Pose, type Tool } from "./crowd";
export { TOOLS };
export type { Anim, Pose, Tool };

const TAU = Math.PI * 2;
const wrapA = (a: number) => a - Math.round(a / TAU) * TAU;

export type Act =
  | "home"
  | "wander"
  | "shop"
  | "sell"
  | "bake"
  | "sweep"
  | "fish"
  | "nets"
  | "garden"
  | "wash"
  | "lookout"
  | "harbour"
  | "story"
  | "sit"
  | "drum"
  | "flute"
  | "dance"
  | "chase"
  | "skip-turn"
  | "skip-jump"
  | "splash"
  | "light";

/** one schedule slot: from this hour, do `act` (at work spot `spot`, if it has one) */
export interface Slot {
  from: number;
  act: Act;
  spot?: string;
}

export interface VillagerDef {
  id: string;
  name: string;
  role: string;
  kid: boolean;
  elder: boolean;
  seed: number;
  /** index into VILLAGE_HOMES */
  home: number;
  schedule: Slot[];
  /** looks: skin / hair / clothes / wing palette indices, hair + body style */
  skin: number;
  hair: number;
  cloth: number;
  wing: number;
  hairStyle: number;
  body: number;
  /** a VILLAGERS_TALK id when they have things to say */
  talk?: string;
  /** role in a pair game: chase (0 runner / 1 chaser) or skipping (0/1 turners) */
  pair: number;
}

// ── the roster ──

const S = (from: number, act: Act, spot?: string): Slot => ({ from, act, spot });

interface RosterEntry {
  id: string;
  name: string;
  role: string;
  kid?: boolean;
  elder?: boolean;
  talk?: boolean;
  home: string; // a VILLAGE_HOMES hint: village + index ("sh0", "eg2", "st1", "bk")
  sched: Slot[];
  pair?: number;
  look?: Partial<Pick<VillagerDef, "skin" | "hair" | "cloth" | "wing" | "hairStyle" | "body">>;
}

// the day: 0 = midnight. Glow (twilight) rises 16.5–19.5, the fire dance is 18–22.5.
const ROSTER: RosterEntry[] = [
  // ── the ones you can talk to ──
  {
    id: "coralie", name: "Grandma Coralie", role: "elder", elder: true, talk: true, home: "eg3",
    sched: [S(0, "home"), S(7, "sit", "sit-1"), S(10, "shop"), S(13, "garden", "garden-1"), S(16, "sit", "bench-lookout"), S(17.6, "story", "sit-0"), S(23.5, "home")],
    look: { hairStyle: 3, body: 2, hair: 7 },
  },
  {
    id: "kip", name: "Kip the Fisher", role: "fisher", talk: true, home: "sh2",
    sched: [S(0, "home"), S(5, "fish", "fish-0"), S(9.5, "sell", "stall-3"), S(12, "fish", "fish-2"), S(16, "nets", "nets-0"), S(18.2, "dance"), S(22.3, "home")],
    look: { hairStyle: 2 },
  },
  {
    id: "melo", name: "Melo the Drummer", role: "musician", talk: true, home: "eg0",
    sched: [S(0, "drum", "drum-0"), S(1.5, "home"), S(8.5, "flute", "flute-market"), S(12.5, "wander"), S(15, "flute", "flute-market"), S(17.5, "drum", "drum-0")],
    look: { hairStyle: 1 },
  },
  {
    id: "bun", name: "Auntie Bun", role: "baker", talk: true, home: "bk",
    sched: [S(0, "home"), S(5, "bake", "oven"), S(11, "sell", "stall-1"), S(15, "bake", "oven"), S(18.4, "dance"), S(22, "home")],
    look: { body: 3, hairStyle: 0 },
  },
  {
    id: "lumen", name: "Lumen the Lantern-Lighter", role: "lantern-lighter", talk: true, home: "st0",
    sched: [S(0, "home"), S(7.5, "lookout", "lookout"), S(11, "sweep", "sweep-spine"), S(13, "lookout", "lookout"), S(15.5, "light"), S(20.5, "dance"), S(23, "home")],
    look: { hairStyle: 2, cloth: 6 },
  },
  {
    id: "pip", name: "Pip", role: "child", kid: true, talk: true, home: "st1", pair: 0,
    sched: [S(0, "home"), S(7.5, "chase", "chase-meadow"), S(10.5, "skip-jump", "skip"), S(13, "splash", "splash"), S(15.5, "chase", "chase-beach"), S(18, "dance"), S(21.2, "home")],
    look: { hairStyle: 0 },
  },
  {
    id: "wren", name: "Wren", role: "child", kid: true, talk: true, home: "sh1", pair: 1,
    sched: [S(0, "home"), S(7.5, "chase", "chase-beach"), S(10.5, "skip-turn", "skip"), S(13, "splash", "splash"), S(15.5, "chase", "chase-beach"), S(18, "dance"), S(21.2, "home")],
    look: { hairStyle: 1 },
  },
  {
    id: "marisol", name: "Marisol", role: "gardener", talk: true, home: "eg1",
    sched: [S(0, "home"), S(6.5, "garden", "garden-0"), S(10, "shop"), S(12, "garden", "garden-2"), S(15.5, "wash", "wash-0"), S(18.3, "dance"), S(22.5, "home")],
    look: { hairStyle: 1, body: 1 },
  },
  {
    id: "tully", name: "Harbourmaster Tully", role: "harbourmaster", talk: true, home: "sh4",
    sched: [S(0, "home"), S(5.5, "harbour", "harbour"), S(12, "nets", "nets-1"), S(14, "harbour", "harbour"), S(18.5, "sit", "sit-2"), S(23, "home")],
    look: { hairStyle: 2 },
  },
  // ── everyone else ──
  { id: "nami", name: "Nami", role: "fruit seller", home: "sh0", sched: [S(0, "home"), S(7.5, "sell", "stall-0"), S(16, "shop"), S(18.6, "dance"), S(22.6, "home")], look: { body: 1 } },
  { id: "shelly", name: "Shelly", role: "shell seller", home: "sh3", sched: [S(0, "home"), S(8, "sell", "stall-2"), S(16.2, "wander"), S(18.2, "dance"), S(22.2, "home")], look: { body: 1, hairStyle: 1 } },
  { id: "crumb", name: "Crumb", role: "baker's helper", home: "bk", sched: [S(0, "home"), S(6, "sell", "stall-1"), S(11, "bake", "oven"), S(13, "wander"), S(17.5, "sit", "sit-3"), S(22, "home")], look: { body: 3 } },
  { id: "reef", name: "Reef", role: "fisher", home: "st2", sched: [S(0, "home"), S(4.8, "fish", "fish-1"), S(11, "nets", "nets-1"), S(12.5, "fish", "fish-1"), S(17, "shop"), S(18.4, "dance"), S(22.4, "home")] },
  { id: "toby", name: "Toby", role: "fisher", home: "st3", sched: [S(0, "home"), S(6, "nets", "nets-0"), S(8, "sell", "stall-3"), S(9.5, "fish", "fish-2"), S(12, "fish", "fish-0"), S(17, "wander"), S(18.8, "dance"), S(22.8, "home")] },
  { id: "boom", name: "Boom", role: "drummer", home: "eg4", sched: [S(0, "drum", "drum-1"), S(1, "home"), S(9, "garden", "garden-3"), S(12, "wander"), S(14.5, "wash", "wash-3"), S(17.5, "drum", "drum-1")], look: { hairStyle: 2 } },
  { id: "tamsin", name: "Old Tamsin", role: "sweeper", elder: true, home: "eg2", sched: [S(0, "home"), S(6.5, "sweep", "sweep-market"), S(10.5, "sit", "sit-1"), S(12, "sweep", "sweep-spine"), S(15, "sit", "sit-3"), S(18.5, "sit", "sit-3"), S(22, "home")], look: { hairStyle: 3, body: 2, hair: 7 } },
  { id: "lottie", name: "Lottie", role: "washer", home: "sh0", sched: [S(0, "home"), S(8, "wash", "wash-2"), S(10.5, "shop"), S(13, "wash", "wash-1"), S(15.5, "wander"), S(18.2, "dance"), S(22.5, "home")], look: { body: 1 } },
  { id: "mo", name: "Mo", role: "washer", home: "st0", sched: [S(0, "home"), S(7, "wash", "wash-3"), S(10, "wander"), S(13, "shop"), S(16, "wash", "wash-1"), S(18.6, "dance"), S(22.8, "home")] },
  { id: "sprout", name: "Sprout", role: "gardener", home: "eg1", sched: [S(0, "home"), S(6.8, "garden", "garden-3"), S(11, "garden", "garden-1"), S(15, "shop"), S(18, "dance"), S(22, "home")], look: { hairStyle: 1 } },
  // wanderers and shoppers (their times are nudged by their seeds)
  { id: "suli", name: "Suli", role: "villager", home: "sh1", sched: [S(0, "home"), S(7, "wander"), S(9, "shop"), S(12, "wander"), S(14.5, "shop"), S(18.1, "dance"), S(22.4, "home")], look: { body: 1 } },
  { id: "oro", name: "Oro", role: "villager", home: "eg0", sched: [S(0, "home"), S(6.6, "wander"), S(10, "shop"), S(12.5, "wander"), S(16, "shop"), S(18.3, "dance"), S(22.2, "home")] },
  { id: "pearl", name: "Pearl", role: "villager", home: "st1", sched: [S(0, "home"), S(7.4, "shop"), S(9.5, "wander"), S(13, "shop"), S(15, "wander"), S(18.4, "dance"), S(22.7, "home")], look: { body: 1, hairStyle: 1 } },
  { id: "kelp", name: "Kelp", role: "villager", home: "st2", sched: [S(0, "home"), S(8, "wander"), S(11, "shop"), S(13.5, "wander"), S(17, "shop"), S(18.9, "dance"), S(23, "home")] },
  { id: "dune", name: "Dune", role: "villager", home: "sh3", sched: [S(0, "home"), S(7.2, "shop"), S(9, "wander"), S(12, "shop"), S(15.2, "wander"), S(18.2, "dance"), S(22.1, "home")] },
  { id: "misty", name: "Misty", role: "villager", home: "eg2", sched: [S(0, "home"), S(6.9, "wander"), S(9.2, "shop"), S(12.2, "wander"), S(16.4, "shop"), S(18.7, "dance"), S(22.6, "home")], look: { body: 1 } },
  { id: "tavi", name: "Tavi", role: "villager", home: "eg4", sched: [S(0, "home"), S(7.8, "wander"), S(10.2, "shop"), S(13.2, "wander"), S(16.8, "shop"), S(18.5, "dance"), S(22.9, "home")] },
  // the children
  { id: "tiki", name: "Tiki", role: "child", kid: true, home: "sh2", pair: 1, sched: [S(0, "home"), S(7.6, "chase", "chase-meadow"), S(10.5, "chase", "chase-beach"), S(13, "splash", "splash"), S(15.5, "chase", "chase-meadow"), S(18, "dance"), S(21, "home")] },
  { id: "bubbles", name: "Bubbles", role: "child", kid: true, home: "st3", pair: 0, sched: [S(0, "home"), S(7.6, "chase", "chase-beach"), S(10.6, "splash", "splash"), S(13, "chase", "chase-meadow"), S(15.5, "chase", "chase-beach"), S(18.1, "dance"), S(21.3, "home")], look: { hairStyle: 1 } },
  { id: "scoot", name: "Scoot", role: "child", kid: true, home: "eg3", pair: 0, sched: [S(0, "home"), S(8, "chase", "chase-meadow"), S(10.5, "skip-turn", "skip"), S(13.2, "chase", "chase-beach"), S(15.6, "splash", "splash"), S(18.2, "dance"), S(21.1, "home")] },
  { id: "minnow", name: "Minnow", role: "child", kid: true, home: "sh4", pair: 1, sched: [S(0, "home"), S(8, "chase", "chase-meadow"), S(10.6, "skip-jump", "skip"), S(13.2, "chase", "chase-beach"), S(15.6, "splash", "splash"), S(18.2, "dance"), S(21.2, "home")], look: { hairStyle: 0 } },
];

/** skin tones (sea-sprite pastels), hair, clothes and wing palettes — the renderer's colours */
export const SKINS = ["#9fe3e0", "#c9b8f2", "#ffc9a8", "#a8e6b8", "#f7b6d0", "#b8d8ff", "#ffd9a0"];
export const HAIRS = ["#2f7fd0", "#e2508f", "#1f9e8a", "#f2a53a", "#7a4fd0", "#e8e05a", "#e0603c", "#f4f2ee"];
export const CLOTHS = ["#ff7a6b", "#ffcf4a", "#4fc3a1", "#6a8cff", "#ff9ecb", "#b07ce8", "#3fb5e8", "#f39a3c", "#8fd35a"];
export const WINGS = ["#bff6ff", "#ffd6f5", "#e8ffc7", "#fff2b8", "#d9ccff"];

function homeIndex(hint: string, seed: number): number {
  // map a hint to one of the real doorsteps (sh = Shellharbour huts, eg = Emberglen, st = stilts, bk = bakery)
  const village = hint.startsWith("sh") ? "sh" : hint.startsWith("eg") ? "eg" : hint.startsWith("st") ? "st" : "bk";
  const list = VILLAGE_HOMES.map((h, i) => ({ h, i })).filter(({ h }) => {
    const n = h.node;
    if (village === "bk") return n === "bakery";
    if (village === "st") return n.startsWith("stilt");
    if (village === "eg") return n.startsWith("fire") || n === "ember-e" || n === "gardens" || n === "west-beach";
    return n.startsWith("market") || n === "cross" || n === "sw-beach" || n === "jetty-base";
  });
  if (!list.length) return seed % VILLAGE_HOMES.length;
  const k = Number(hint.slice(2)) || 0;
  return list[k % list.length].i;
}

/** the whole clan (deterministic) */
export function buildRoster(): VillagerDef[] {
  const talkIds = new Set(VILLAGERS_TALK.map((t) => t.id));
  return ROSTER.map((r, i) => {
    const seed = 1000 + i * 131;
    const rnd = villageRng(seed);
    const jitter = r.talk ? 0 : (rnd() - 0.5) * 0.6;
    const schedule = r.sched.map((s, k) => ({ ...s, from: k === 0 ? s.from : Math.max(0, Math.min(23.9, s.from + jitter)) }));
    const look = r.look ?? {};
    return {
      id: r.id,
      name: r.name,
      role: r.role,
      kid: !!r.kid,
      elder: !!r.elder,
      seed,
      home: homeIndex(r.home, seed),
      schedule,
      skin: look.skin ?? i % SKINS.length,
      hair: look.hair ?? (i * 3 + 1) % 7,
      cloth: look.cloth ?? (i * 5 + 2) % CLOTHS.length,
      wing: look.wing ?? i % WINGS.length,
      hairStyle: look.hairStyle ?? (r.kid ? i % 2 : i % 3),
      body: look.body ?? (r.elder ? 2 : 0),
      talk: r.talk && talkIds.has(r.id) ? r.id : undefined,
      pair: r.pair ?? i % 2,
    };
  });
}

/** which slot is running at `hour` (the last one that started, wrapping round midnight) */
export function slotAt(schedule: Slot[], hour: number): number {
  let k = schedule.length - 1;
  for (let i = 0; i < schedule.length; i++) if (schedule[i].from <= hour) k = i;
  return k;
}

// ── routes: shortest paths on the village graph ──

export interface Routes {
  n: number;
  /** next[a * n + b] = the node after a on the way to b (-1 = unreachable, a = there) */
  next: Int16Array;
  dist: Float32Array;
}
export function buildRoutes(): Routes {
  const { nodes, edges } = VILLAGE_PATHS;
  const n = nodes.length;
  const dist = new Float32Array(n * n).fill(Infinity);
  const next = new Int16Array(n * n).fill(-1);
  for (let i = 0; i < n; i++) {
    dist[i * n + i] = 0;
    next[i * n + i] = i;
  }
  for (const [a, b] of edges) {
    const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
    dist[a * n + b] = dist[b * n + a] = d;
    next[a * n + b] = b;
    next[b * n + a] = a;
  }
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const d = dist[i * n + k] + dist[k * n + j];
        if (d < dist[i * n + j]) {
          dist[i * n + j] = d;
          next[i * n + j] = next[i * n + k];
        }
      }
  return { n, next, dist };
}

// ── per-villager state + pose ──
// (Pose is now ./crowd's; re-exported above)

export const enum Phase {
  Hidden = 0,
  Route = 1,
  Via = 2,
  ToSpot = 3,
  Act = 4,
  Leave = 5,
}

export interface VillagerState {
  def: VillagerDef;
  x: number;
  z: number;
  y: number;
  yaw: number;
  speed: number;
  phase: Phase;
  /** graph: the node we're heading to, the node we came from, the goal */
  node: number;
  from: number;
  goal: number;
  slot: number;
  act: Act;
  spot: VillageWorkSpot | null;
  actT: number;
  /** wandering: where to, and when to pick again */
  wanderGoal: number;
  wanderUntil: number;
  wanderN: number;
  /** dancing round the fire: the angle on the ring */
  ringA: number;
  /** lantern-lighting: the next lantern, and the pause at it */
  lamp: number;
  lampPause: number;
  /** leaving a spot with a waypoint (round a stall counter) */
  leaveVia: boolean;
  viaX: number;
  viaZ: number;
  /** waving at the kid: 0..1 blend, timers */
  wave: number;
  waveT: number;
  waveCool: number;
  lookA: number;
  /** talking */
  talking: boolean;
  line: number;
  lineT: number;
  pose: Pose;
  /** a lane offset so people passing on a path don't walk through each other */
  lane: number;
  rnd: () => number;
}

export interface VillageSim {
  villagers: VillagerState[];
  routes: Routes;
  /** 0/1 per VILLAGE_LANTERNS entry */
  lit: Uint8Array;
  /** the dance: how many are on the ring, reused by the renderer */
  dancers: number;
  started: boolean;
  lastHour: number;
}

// the lantern round: from the lighter's "light" slot to the one after it
const LIGHTER = ROSTER.find((r) => r.sched.some((s) => s.act === "light"))!;
const LIGHT_SLOT = LIGHTER.sched.findIndex((s) => s.act === "light");
export const LIGHT_FROM = LIGHTER.sched[LIGHT_SLOT].from;
export const LIGHT_TO = LIGHTER.sched[(LIGHT_SLOT + 1) % LIGHTER.sched.length].from;

const WALK = 1.35;
const KID_RUN = 2.6;
const HURRY = 2.4;

export function makeSim(): VillageSim {
  const defs = buildRoster();
  const villagers = defs.map((def, i): VillagerState => {
    const h = VILLAGE_HOMES[def.home];
    return {
      def,
      x: h.x,
      z: h.z,
      y: 0,
      yaw: 0,
      speed: 0,
      phase: Phase.Hidden,
      node: villageNode(h.node),
      from: villageNode(h.node),
      goal: villageNode(h.node),
      slot: -1,
      act: "home",
      spot: null,
      actT: 0,
      wanderGoal: -1,
      wanderUntil: 0,
      wanderN: 0,
      ringA: (i / defs.length) * TAU,
      lamp: 0,
      lampPause: 0,
      leaveVia: false,
      viaX: 0,
      viaZ: 0,
      wave: 0,
      waveT: 0,
      waveCool: 0,
      lookA: 0,
      talking: false,
      line: 0,
      lineT: 0,
      pose: { anim: "stand", cycle: 0, gait: 0, wave: 0, look: 0, tool: "none", hidden: true },
      lane: ((i % 3) - 1) * 0.32,
      rnd: villageRng(def.seed + 7),
    };
  });
  return { villagers, routes: buildRoutes(), lit: new Uint8Array(VILLAGE_LANTERNS.length), dancers: 0, started: false, lastHour: 0 };
}

const workById = new Map(VILLAGE_WORK.map((w) => [w.id, w]));
const NODES = VILLAGE_PATHS.nodes;
const FIRE_NODES = ["fire-e", "fire-s", "fire-w", "fire-n"].map(villageNode);
/** the node nearest each lantern (the lighter walks there first) */
const LAMP_NODE = VILLAGE_LANTERNS.map((l) => {
  let best = 0;
  let bd = Infinity;
  NODES.forEach((n, k) => {
    const d = (n.x - l.x) ** 2 + (n.z - l.z) ** 2;
    if (d < bd) {
      bd = d;
      best = k;
    }
  });
  return best;
});
/** where the lighter stands to light lantern k (a step towards its node) */
const LAMP_STAND = VILLAGE_LANTERNS.map((l, k) => {
  const n = NODES[LAMP_NODE[k]];
  const d = Math.hypot(n.x - l.x, n.z - l.z) || 1;
  const s = Math.min(0.85, d);
  return { x: l.x + ((n.x - l.x) / d) * s, z: l.z + ((n.z - l.z) / d) * s };
});
/** the play spots' nodes, for walking out to them */
const PLAY_R = { chase: 2.4, splash: 1.3 };

function toolFor(act: Act, v: VillagerState): Tool {
  switch (act) {
    case "fish":
      return "rod";
    case "sweep":
      return "broom";
    case "drum":
      return "drum";
    case "flute":
      return "flute";
    case "bake":
      return "tray";
    case "light":
      return "pole";
    case "garden":
      return "hoe";
    case "shop":
      return "basket";
    case "wander":
      return v.def.seed % 3 === 0 ? "basket" : "none";
    case "skip-turn":
      return v.def.pair === 0 ? "rope" : "none";
    default:
      return "none";
  }
}

/** the node an activity is reached from */
function goalNodeFor(v: VillagerState, sim: VillageSim): number {
  const act = v.act;
  if (act === "home") return villageNode(VILLAGE_HOMES[v.def.home].node);
  if (act === "wander") return v.wanderGoal >= 0 ? v.wanderGoal : v.node;
  if (act === "dance") {
    // the ring node nearest where we are
    let best = FIRE_NODES[0];
    let bd = Infinity;
    for (const k of FIRE_NODES) {
      const d = sim.routes.dist[v.node * sim.routes.n + k];
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }
  if (act === "light") return LAMP_NODE[Math.min(v.lamp, LAMP_NODE.length - 1)];
  if (v.spot) return villageNode(v.spot.node);
  return v.node;
}

/** where the activity wants you right now (dynamic for dancers, chasers, skippers...) */
function actTarget(v: VillagerState, t: number, out: { x: number; z: number; face: number }): void {
  const sp = v.spot;
  switch (v.act) {
    case "dance": {
      const r = VILLAGE_FIRE.danceR + Math.sin(t * 1.3 + v.def.seed) * 0.25;
      out.x = VILLAGE_FIRE.x + Math.sin(v.ringA) * r;
      out.z = VILLAGE_FIRE.z + Math.cos(v.ringA) * r;
      out.face = v.ringA + Math.PI; // (facing the fire, turning as they go)
      return;
    }
    case "chase": {
      // (everyone round the ring at their own place: tag!)
      const a = t * (v.def.kid ? 1.05 : 0.8) + ((v.def.seed * 0.618) % 1) * Math.PI * 2 + (v.def.pair ? -0.95 : 0);
      out.x = (sp?.x ?? v.x) + Math.sin(a) * PLAY_R.chase;
      out.z = (sp?.z ?? v.z) + Math.cos(a) * PLAY_R.chase;
      out.face = a + Math.PI / 2;
      return;
    }
    case "splash": {
      const a = t * 0.7 + (v.def.seed % 7);
      out.x = (sp?.x ?? v.x) + Math.sin(a) * PLAY_R.splash;
      out.z = (sp?.z ?? v.z) + Math.cos(a) * PLAY_R.splash;
      out.face = a + Math.PI / 2;
      return;
    }
    case "skip-turn": {
      const side = v.def.pair === 0 ? -1 : 1;
      out.x = (sp?.x ?? v.x) + side * 1.9;
      out.z = sp?.z ?? v.z;
      out.face = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      return;
    }
    case "skip-jump": {
      // (two jumpers side by side over the rope)
      out.x = sp?.x ?? v.x;
      out.z = (sp?.z ?? v.z) + (v.def.pair ? 0.45 : -0.45);
      out.face = 0;
      return;
    }
    case "light": {
      const k = Math.min(v.lamp, LAMP_STAND.length - 1);
      out.x = LAMP_STAND[k].x;
      out.z = LAMP_STAND[k].z;
      out.face = Math.atan2(VILLAGE_LANTERNS[k].x - out.x, VILLAGE_LANTERNS[k].z - out.z);
      return;
    }
    default:
      if (sp) {
        out.x = sp.x;
        out.z = sp.z;
        out.face = sp.face;
      } else {
        const n = NODES[v.node];
        out.x = n.x + v.lane;
        out.z = n.z;
        out.face = v.yaw;
      }
  }
}

const _tg = { x: 0, z: 0, face: 0 };

const SHOP_SPOTS = VILLAGE_WORK.filter((w) => w.id.startsWith("shop-"));

/** the stall with the fewest shoppers at it (ties broken at random): browsers spread out */
function quietestStall(sim: VillageSim, v: VillagerState): VillageWorkSpot | null {
  let best: VillageWorkSpot | null = null;
  let bestN = Infinity;
  const r0 = v.rnd();
  for (let k = 0; k < SHOP_SPOTS.length; k++) {
    const s = SHOP_SPOTS[(k + Math.floor(r0 * SHOP_SPOTS.length)) % SHOP_SPOTS.length];
    if (s === v.spot) continue;
    let n = 0;
    for (const o of sim.villagers) if (o !== v && o.act === "shop" && o.spot === s) n++;
    if (n < bestN) {
      bestN = n;
      best = s;
    }
  }
  return best ?? v.spot;
}

function pickWander(v: VillagerState, sim: VillageSim, t: number) {
  void t;
  // a new place to stroll to: any node except the hill top and the jetty's far end most of the time
  const n = NODES.length;
  let g = Math.floor(v.rnd() * n);
  if (NODES[g].id === "lookout" && v.rnd() < 0.7) g = villageNode("market");
  if (g === v.node) g = (g + 5) % n;
  v.wanderGoal = g;
  v.wanderN++;
  void sim;
}

/** start (or change to) the slot that's running now */
function enterSlot(v: VillagerState, sim: VillageSim, slot: number, t: number, hour: number, placing: boolean) {
  const s = v.def.schedule[slot];
  // (leaving a spot tucked behind something: go back out the way we came)
  const old = v.spot;
  v.leaveVia = !placing && !!old && !!old.via && (v.phase === Phase.Act || v.phase === Phase.ToSpot);
  if (v.leaveVia && old && old.via) {
    v.viaX = old.via.x;
    v.viaZ = old.via.z;
  }
  v.slot = slot;
  v.act = s.act;
  v.spot = s.spot ? workById.get(s.spot) ?? null : null;
  // (shoppers head for one of the stalls)
  if (v.act === "shop") v.spot = quietestStall(sim, v);
  v.actT = 0;
  if (v.act === "wander") pickWander(v, sim, t);
  if (v.act === "light") {
    // how far through the round should we be by now?
    const end = nextSlotFrom(v.def.schedule, slot);
    const span = ((end - s.from + 24) % 24) || 24;
    const k = Math.floor(Math.max(0, Math.min(1, ((hour - s.from + 24) % 24) / span)) * VILLAGE_LANTERNS.length * 0.9);
    v.lamp = placing ? k : 0;
    for (let i = 0; i < v.lamp; i++) sim.lit[i] = 1;
  }
  v.pose.tool = toolFor(v.act, v);
  if (v.phase === Phase.Act || v.phase === Phase.ToSpot || v.phase === Phase.Via) v.phase = Phase.Leave;
  else if (v.phase !== Phase.Hidden) v.phase = Phase.Route;
  v.goal = goalNodeFor(v, sim);
}

function nextSlotFrom(schedule: Slot[], slot: number) {
  return schedule[(slot + 1) % schedule.length].from;
}

/** put a villager straight where their current activity is (on the first frame, or after a time jump) */
function placeNow(v: VillagerState, sim: VillageSim, t: number) {
  if (v.act === "home") {
    const h = VILLAGE_HOMES[v.def.home];
    v.x = h.x;
    v.z = h.z;
    v.node = v.from = v.goal = villageNode(h.node);
    v.phase = Phase.Hidden;
    return;
  }
  if (v.act === "wander") {
    v.node = v.from = v.goal = v.wanderGoal;
    const n = NODES[v.node];
    v.x = n.x + v.lane;
    v.z = n.z;
    v.phase = Phase.Act;
    return;
  }
  v.node = v.from = v.goal = goalNodeFor(v, sim);
  if (v.act === "dance") v.ringA = (sim.villagers.indexOf(v) / sim.villagers.length) * TAU;
  actTarget(v, t, _tg);
  v.x = _tg.x;
  v.z = _tg.z;
  v.yaw = _tg.face;
  v.phase = Phase.Act;
}

/** move towards (tx, tz) at `speed`; true when there */
function moveTo(v: VillagerState, tx: number, tz: number, speed: number, dt: number): boolean {
  const dx = tx - v.x;
  const dz = tz - v.z;
  const d = Math.hypot(dx, dz);
  const step = speed * dt;
  if (d <= Math.max(0.04, step)) {
    v.x = tx;
    v.z = tz;
    v.speed = d / Math.max(dt, 1e-4);
    return true;
  }
  v.x += (dx / d) * step;
  v.z += (dz / d) * step;
  v.speed = speed;
  turnTo(v, Math.atan2(dx, dz), dt, 7);
  return false;
}

function turnTo(v: VillagerState, a: number, dt: number, rate: number) {
  v.yaw += wrapA(a - v.yaw) * Math.min(1, dt * rate);
}

/** the point on the path we're walking to (the next node, nudged into our lane) */
function laneTarget(v: VillagerState, out: { x: number; z: number; face: number }) {
  const a = NODES[v.from];
  const b = NODES[v.node];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz) || 1;
  // (keep to the right: perpendicular to the direction of travel)
  out.x = b.x + (dz / d) * v.lane;
  out.z = b.z - (dx / d) * v.lane;
}

export interface KidInfo {
  x: number;
  z: number;
}

export interface TalkOut {
  id: string;
  name: string;
  line: string;
}

const talkLines = new Map(VILLAGERS_TALK.map((t) => [t.id, t]));
const WAVE_R = 7.5;
const TALK_R = 3.2;

/**
 * Advance everyone by dt at park time `hour` (0..24) and animation time t; `kid` = the Park kid
 * (null when far away). Returns the villager index who's talking to the kid (-1 none); their
 * current line is written into `talk`.
 */
export function stepVillage(sim: VillageSim, dtIn: number, t: number, hour: number, kid: KidInfo | null, talk: TalkOut): number {
  const dt = Math.min(0.1, Math.max(0, dtIn));
  const jump = !sim.started || dtIn > 3 || Math.abs(wrapA(((hour - sim.lastHour) / 24) * TAU)) > (1.5 / 24) * TAU;
  // dawn: the lanterns go out; arriving after dusk, they're already lit
  if (hour >= 6.5 && hour < LIGHT_FROM) sim.lit.fill(0);
  else if (hour >= LIGHT_TO || hour < 6.5) sim.lit.fill(1);
  let dancers = 0;
  for (const v of sim.villagers) if (v.act === "dance" && v.phase !== Phase.Hidden) dancers++;
  sim.dancers = dancers;

  let talker = -1;
  let talkD = TALK_R;
  for (let i = 0; i < sim.villagers.length; i++) {
    const v = sim.villagers[i];
    const slot = slotAt(v.def.schedule, hour);
    if (jump) {
      if (v.act === "light" || slot !== v.slot) {
        v.phase = Phase.Route;
        enterSlot(v, sim, slot, t, hour, true);
      }
      placeNow(v, sim, t);
    } else if (slot !== v.slot) enterSlot(v, sim, slot, t, hour, false);
    v.actT += dt;

    // ── the Park kid: wave when they come near, stop and chat if we've things to say ──
    let kd = Infinity;
    if (kid && v.phase !== Phase.Hidden) kd = Math.hypot(kid.x - v.x, kid.z - v.z);
    v.waveCool = Math.max(0, v.waveCool - dt);
    if (kd < WAVE_R && v.waveCool <= 0 && v.waveT <= 0) {
      v.waveT = 2.6;
      v.waveCool = 14 + (v.def.seed % 5);
    }
    v.waveT = Math.max(0, v.waveT - dt);
    v.wave += ((v.waveT > 0 ? 1 : 0) - v.wave) * Math.min(1, dt * 6);
    const canTalk = !!v.def.talk && kd < TALK_R + (v.talking ? 0.8 : 0);
    if (canTalk && kd < talkD) {
      talkD = kd;
      talker = i;
    }
    if (v.talking && !canTalk) {
      v.talking = false;
      v.line++;
    }
    const kidLook = kid && kd < WAVE_R ? wrapA(Math.atan2(kid.x - v.x, kid.z - v.z) - v.yaw) : 0;
    v.lookA += (Math.max(-1.2, Math.min(1.2, kidLook)) - v.lookA) * Math.min(1, dt * 4);

    // ── move ──
    v.speed = 0;
    const hurry = v.def.kid ? KID_RUN * 0.72 : v.act === "light" ? HURRY : v.def.elder ? WALK * 0.75 : WALK;
    if (v.talking || (canTalk && talker === i)) {
      // (stand still and face the kid while chatting)
      if (kid) turnTo(v, Math.atan2(kid.x - v.x, kid.z - v.z), dt, 5);
    } else
      switch (v.phase) {
        case Phase.Hidden:
          if (v.act !== "home") {
            // come out of the front door
            const h = VILLAGE_HOMES[v.def.home];
            v.x = h.x;
            v.z = h.z;
            v.from = v.node = villageNode(h.node);
            v.phase = Phase.Leave;
          }
          break;
        case Phase.Leave: {
          // back to the node we came from (the spot's node / the doorstep's node)
          const n = NODES[v.node];
          if (v.leaveVia) {
            if (moveTo(v, v.viaX, v.viaZ, hurry * 0.8, dt)) v.leaveVia = false;
          } else if (moveTo(v, n.x, n.z, hurry, dt)) {
            v.from = v.node;
            v.goal = goalNodeFor(v, sim);
            v.phase = Phase.Route;
          }
          break;
        }
        case Phase.Route: {
          v.goal = goalNodeFor(v, sim);
          if (v.node === v.goal && Math.hypot(v.x - NODES[v.node].x, v.z - NODES[v.node].z) < 0.8) {
            v.phase = v.spot && v.spot.via ? Phase.Via : Phase.ToSpot;
            break;
          }
          if (v.from === v.node) {
            // at a node: take the next hop
            const nx = sim.routes.next[v.node * sim.routes.n + v.goal];
            if (nx < 0 || nx === v.node) {
              v.phase = Phase.ToSpot;
              break;
            }
            v.node = nx;
          }
          laneTarget(v, _tg);
          if (moveTo(v, _tg.x, _tg.z, hurry, dt)) v.from = v.node;
          break;
        }
        case Phase.Via:
          if (v.spot && v.spot.via) {
            if (moveTo(v, v.spot.via.x, v.spot.via.z, hurry * 0.8, dt)) v.phase = Phase.ToSpot;
          } else v.phase = Phase.ToSpot;
          break;
        case Phase.ToSpot:
          if (v.act === "home") {
            const h = VILLAGE_HOMES[v.def.home];
            if (moveTo(v, h.x, h.z, hurry * 0.8, dt)) v.phase = Phase.Hidden;
            break;
          }
          if (v.act === "wander") {
            v.phase = Phase.Act;
            v.wanderUntil = t + 7 + v.rnd() * 14;
            break;
          }
          if (v.act === "dance") {
            // join the ring where we arrive, then drift round to our place
            v.ringA = Math.atan2(v.x - VILLAGE_FIRE.x, v.z - VILLAGE_FIRE.z);
          }
          if ((v.act === "chase" || v.act === "splash") && v.spot) {
            // (run to the nearest point of the circle, then join the game)
            const r = v.act === "chase" ? PLAY_R.chase : PLAY_R.splash;
            const d = Math.max(0.01, Math.hypot(v.x - v.spot.x, v.z - v.spot.z));
            _tg.x = v.spot.x + ((v.x - v.spot.x) / d) * r;
            _tg.z = v.spot.z + ((v.z - v.spot.z) / d) * r;
          } else actTarget(v, t, _tg);
          if (moveTo(v, _tg.x, _tg.z, hurry * 0.8, dt)) v.phase = Phase.Act;
          break;
        case Phase.Act:
          doAct(v, sim, i, t, hour, dt);
          break;
      }
    // (don't walk through the Park kid)
    if (kid && kd < 3 && v.phase !== Phase.Hidden && !isSitting(v)) {
      const d = Math.max(0.01, Math.hypot(v.x - kid.x, v.z - kid.z));
      if (d < 0.95) {
        // step round them (but never off the jetty or a boardwalk)
        const nx = kid.x + ((v.x - kid.x) / d) * 0.95;
        const nz = kid.z + ((v.z - kid.z) / d) * 0.95;
        if (villageGroundY(nx, nz) !== null) {
          v.x = nx;
          v.z = nz;
        }
      }
    }
    v.y = villageGroundY(v.x, v.z) ?? v.y;
    fillPose(v, t, dt);
  }

  // the chatterbox nearest the kid talks; rotate through their lines
  if (talker >= 0) {
    const v = sim.villagers[talker];
    const entry = talkLines.get(v.def.talk!)!;
    if (!v.talking) {
      v.talking = true;
      v.lineT = 0;
    }
    v.lineT += dt;
    if (v.lineT > 4.5) {
      v.lineT = 0;
      v.line++;
    }
    talk.id = entry.id;
    talk.name = entry.name;
    talk.line = entry.lines[v.line % entry.lines.length];
  }
  for (let i = 0; i < sim.villagers.length; i++) if (i !== talker && sim.villagers[i].talking) {
    sim.villagers[i].talking = false;
    sim.villagers[i].line++;
  }
  separate(sim, dt);
  sim.started = true;
  sim.lastHour = hour;
  return talker;
}

/** Keep villagers from walking through each other: pairs closer than a body width ease apart
 *  (people sitting or tucked away indoors stay put; a walker gives way to someone at work). */
const PERSONAL = 0.85;
function separate(sim: VillageSim, dt: number) {
  const vs = sim.villagers;
  const k = Math.min(1, dt * 6);
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i];
    if (a.phase === Phase.Hidden) continue;
    for (let j = i + 1; j < vs.length; j++) {
      const b = vs[j];
      if (b.phase === Phase.Hidden) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= PERSONAL * PERSONAL || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = ((PERSONAL - d) / d) * 0.5 * k;
      const aFixed = isSitting(a) || (a.phase === Phase.Act && b.phase !== Phase.Act);
      const bFixed = isSitting(b) || (b.phase === Phase.Act && a.phase !== Phase.Act);
      if (aFixed && bFixed) continue;
      const wa = aFixed ? 0 : bFixed ? 2 : 1;
      const wb = bFixed ? 0 : aFixed ? 2 : 1;
      a.x -= dx * push * wa;
      a.z -= dz * push * wa;
      b.x += dx * push * wb;
      b.z += dz * push * wb;
    }
  }
}

function isSitting(v: VillagerState) {
  return v.phase === Phase.Act && !!v.spot && !!v.spot.sit;
}

function doAct(v: VillagerState, sim: VillageSim, i: number, t: number, hour: number, dt: number) {
  switch (v.act) {
    case "wander": {
      if (t > v.wanderUntil) {
        pickWander(v, sim, t);
        v.from = v.node;
        v.phase = Phase.Route;
      } else {
        // pause, look around
        turnTo(v, v.yaw + Math.sin(t * 0.4 + v.def.seed) * 0.8, dt, 0.6);
      }
      return;
    }
    case "shop": {
      // browse: stroll to another stall every little while
      if (v.actT > 9 + (v.def.seed % 7)) {
        v.actT = 0;
        v.spot = quietestStall(sim, v);
      }
      if (v.spot) {
        // (browsers spread round the front of the stall, not in a heap)
        const a = v.spot.face + Math.PI + (((v.def.seed * 0.618) % 1) - 0.5) * 2.4;
        if (moveTo(v, v.spot.x + Math.sin(a) * 0.9, v.spot.z + Math.cos(a) * 0.9, WALK * 0.7, dt)) turnTo(v, v.spot.face, dt, 4);
      }
      return;
    }
    case "light": {
      const k = v.lamp;
      if (k >= VILLAGE_LANTERNS.length) {
        // all lit: stroll to the fire early
        return;
      }
      actTarget(v, t, _tg);
      if (moveTo(v, _tg.x, _tg.z, HURRY, dt)) {
        turnTo(v, _tg.face, dt, 6);
        v.lampPause += dt;
        if (v.lampPause > 1.4) sim.lit[k] = 1;
        if (v.lampPause > 2.1) {
          v.lampPause = 0;
          v.lamp++;
          // (the next lantern hangs off the same node: straight there, else back via the paths)
          if (v.lamp < VILLAGE_LANTERNS.length && LAMP_NODE[v.lamp] !== v.node) {
            v.from = v.node;
            v.phase = Phase.Leave;
          }
        }
      }
      return;
    }
    case "dance": {
      const n = Math.max(1, sim.dancers);
      const idx = danceIndex(sim, i);
      const want = (idx / n) * TAU + t * 0.22;
      v.ringA += (0.22 + Math.max(-0.5, Math.min(0.5, wrapA(want - v.ringA))) * 0.8) * dt;
      actTarget(v, t, _tg);
      const px = v.x;
      const pz = v.z;
      v.x += (_tg.x - v.x) * Math.min(1, dt * 5);
      v.z += (_tg.z - v.z) * Math.min(1, dt * 5);
      v.speed = Math.hypot(v.x - px, v.z - pz) / Math.max(dt, 1e-4);
      // spin now and then, otherwise face the fire
      const spin = Math.max(0, Math.sin(t * 0.9 + v.def.seed * 1.7) - 0.8) * 5;
      v.yaw = _tg.face + spin * t * 3;
      return;
    }
    case "chase":
    case "splash":
    case "skip-turn": {
      actTarget(v, t, _tg);
      const px = v.x;
      const pz = v.z;
      if (v.act === "skip-turn") {
        moveTo(v, _tg.x, _tg.z, WALK, dt);
        turnTo(v, _tg.face, dt, 5);
        v.speed = 0;
      } else {
        v.x += (_tg.x - v.x) * Math.min(1, dt * 6);
        v.z += (_tg.z - v.z) * Math.min(1, dt * 6);
        v.speed = Math.hypot(v.x - px, v.z - pz) / Math.max(dt, 1e-4);
        turnTo(v, _tg.face, dt, 8);
      }
      return;
    }
    default: {
      actTarget(v, t, _tg);
      if (moveTo(v, _tg.x, _tg.z, WALK * 0.6, dt)) {
        v.speed = 0;
        turnTo(v, _tg.face, dt, 5);
      }
      void hour;
    }
  }
}

function danceIndex(sim: VillageSim, i: number) {
  let k = 0;
  for (let j = 0; j < i; j++) {
    const o = sim.villagers[j];
    if (o.act === "dance" && o.phase !== Phase.Hidden) k++;
  }
  return k;
}

const ACT_ANIM: Record<Act, Anim> = {
  home: "stand",
  wander: "stand",
  shop: "stand",
  sell: "sell",
  bake: "bake",
  sweep: "sweep",
  fish: "fish",
  nets: "nets",
  garden: "garden",
  wash: "wash",
  lookout: "look",
  harbour: "look",
  story: "story",
  sit: "sit",
  drum: "drum",
  flute: "flute",
  dance: "dance",
  chase: "run",
  "skip-turn": "turn",
  "skip-jump": "jump",
  splash: "jump",
  light: "light",
};

function fillPose(v: VillagerState, t: number, dt: number) {
  const p = v.pose;
  p.hidden = v.phase === Phase.Hidden;
  p.wave = v.talking && isSitting(v) ? Math.max(v.wave, 0.6) : v.wave;
  p.look = v.lookA;
  const moving = v.speed > 0.15;
  const acting = v.phase === Phase.Act;
  if (v.talking && !isSitting(v)) p.anim = "talk";
  else if (acting) {
    p.anim = ACT_ANIM[v.act];
    if (v.act === "light" && v.lampPause <= 0.05) p.anim = moving ? "walk" : "stand";
    if ((v.act === "wander" || v.act === "shop") && moving) p.anim = "walk";
    if (v.act === "drum" && v.spot && v.spot.sit) p.anim = "drum";
    if (v.act === "chase" && !moving) p.anim = "stand";
  } else p.anim = moving ? (v.def.kid || v.act === "light" ? "run" : "walk") : "stand";
  if (p.anim === "walk" || p.anim === "run") {
    p.cycle += v.speed * (p.anim === "run" ? 3.4 : 3.9) * (v.def.kid ? 1.3 : 1) * dt;
    p.gait = Math.min(1, v.speed / 1.2);
  } else {
    p.gait = 0;
    p.cycle = t * 3;
  }
  // (while walking to a job they carry its tool, except the ones that only make sense there)
  const tool = toolFor(v.act, v);
  p.tool = !acting && (tool === "drum" || tool === "rope") ? "none" : tool;
}

/** the kid-talk helper used by tests: distance-rotated line for a talker */
export function talkerLine(id: string, n: number): string {
  const e = talkLines.get(id);
  return e ? e.lines[n % e.lines.length] : "";
}
