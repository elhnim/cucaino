// Everest Base Camp: the Climbers' Guild's colourful camp at the foot of Mount Everest's glacier,
// written exactly like Sunnybrook (registry/town.ts) and the settlements in registry/settlements.ts
// — a deterministic site search on the REAL, unlevelled ground (registry/landform.ts), then one
// generate<Style>() returning a SettlementDef's huts/props/nodes/edges/work/roster/activities. Kept
// in its own file for the same reason town.ts is: the one-line hook-up in settlements.ts (pushing
// generateBaseCamp() onto SETTLEMENTS) is all that file needs.
//
// Base Camp's "huts" are its bright dome tents; its "activity" is "Climb Everest!" (the ride —
// components/park/EverestClimb.tsx, driven by lib/park/climbing/logic.ts); its "fauna" are yaks
// carrying climbers' packs (the same geometry Highstone's yaks use — world/settlements/styles/
// mountain.ts's buildYakGeometry). No pier, no canoes, no trade (climbers pass through, they don't
// run a market stall).
//
// Pure data + maths, deterministic, no three.js (the renderer is
// world/settlements/styles/basecamp.ts).
import { seaDist } from "./island";
import { nearRail, STATIONS } from "./railway";
import { wildWaterSdf } from "./wildWater";
import { EVEREST_SUMMIT, footprintStats, rawHeight } from "./landform";
import {
  settlePadHeight,
  type SettlementAct,
  type SettlementActivitySpot,
  type SettlementDef,
  type SettlementFauna,
  type SettlementHut,
  type SettlementNode,
  type SettlementObstacle,
  type SettlementProp,
  type SettlementSlot,
  type SettlementTalkLines,
  type SettlementVillagerDef,
  type SettlementWorkSpot,
} from "./settlements";

const TAU = Math.PI * 2;

/** a seeded xorshift rng (0..1) — the same little generator settlements.ts/town.ts use, copied here
 *  so this file has no need to import anything private from either */
function rngOf(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Base Camp's own footprint radius (kept in step with generateBaseCamp's `radius`) — a real, flat
 *  ~40 m shelf at the mountain's foot: the steep glacier flanks above it offer nothing gentler
 *  within an easy reach, which is true to the real Everest Base Camp (also a long trek from the
 *  nearest village) */
export const BASE_CAMP_RADIUS = 20;
/** a healthy margin below the icefall/glacier proper — Base Camp sits on dry, merely mountainous
 *  ground, well clear of the steep snow/ice above it */
const BASE_CAMP_MAX_H = 70;

const LAKE_STATION = STATIONS.find((s) => s.id === "lake-station")!;
if (!LAKE_STATION) throw new Error("everestBaseCamp: no lake-station in the railway registry");

export interface BaseCampAvoid {
  x: number;
  z: number;
}

/** a deterministic search for Base Camp's site: a genuinely flat, dry shelf at the mountain's own
 *  foot, below the glacier, clear of the rail, the water and every other settlement — scored on the
 *  REAL terrain (registry/landform.ts), not an approximation. The mountain's own flanks stay steep
 *  for several hundred metres out (as the real Everest's do), so this search range is wide. */
export function findBaseCampSite(avoid: BaseCampAvoid[]): { x: number; z: number } {
  let best: { x: number; z: number; score: number } | null = null;
  for (let a = 0; a < TAU; a += 0.012) {
    for (let rad = 80; rad <= 360; rad += 3) {
      const x = EVEREST_SUMMIT.x + Math.sin(a) * rad;
      const z = EVEREST_SUMMIT.z + Math.cos(a) * rad;
      if (seaDist(x, z) > -40) continue;
      if (nearRail(x, z, 10)) continue;
      if (wildWaterSdf(x, z) < 10) continue;
      if (avoid.some((s) => Math.hypot(x - s.x, z - s.z) < 570)) continue;
      const h = rawHeight(x, z);
      if (h < 12 || h > BASE_CAMP_MAX_H) continue;
      const stats = footprintStats(x, z, BASE_CAMP_RADIUS);
      // the same bar every settlement's own site search is held to (settlements.ts's footprintOk) —
      // a genuinely flat shelf the WHOLE village's width, not a levelled patch of a steep flank
      if (stats.maxSlope > 0.4 || stats.relief > 7) continue;
      const score = -rad * 0.12 - Math.abs(h - 30) * 0.25;
      if (!best || score > best.score) best = { x, z, score };
    }
  }
  if (!best) throw new Error("everestBaseCamp: no site found at the mountain's foot");
  return { x: Math.round(best.x * 10) / 10, z: Math.round(best.z * 10) / 10 };
}

/** Frozen as a stored number (TOWN_SITE's own pattern — see settlements.test.ts's "sites stay
 *  frozen" block, and CLAUDE.md's note on settlement siting): re-running findBaseCampSite() at
 *  module load would re-score every candidate against whatever registry/landform.ts's terrain looks
 *  like right now, so a LATER terrain change could silently move the camp. Captured once from the
 *  live search, with Lakeside/Treetop/Highstone as the avoid list. */
export const BASE_CAMP_SITE = { x: 1566.6, z: -1111.7 };

function generateBaseCamp(): SettlementDef {
  const r = rngOf(74123);
  const cx = BASE_CAMP_SITE.x;
  const cz = BASE_CAMP_SITE.z;
  const radius = BASE_CAMP_RADIUS;
  const padHeight = settlePadHeight("mountain", cx, cz);
  // face the mountain (Everest's own true summit) — the camp's whole layout opens towards it
  const towardPeak = Math.atan2(EVEREST_SUMMIT.x - cx, EVEREST_SUMMIT.z - cz);
  const awayFromPeak = towardPeak + Math.PI;
  // the helipad's own spot, worked out FIRST (a real heli needs clear ground all round it, so
  // every tent/fauna placement below actively keeps its own distance, not just a lucky angle) —
  // well clear of the crates/cairn cluster's own angle (awayFromPeak ± ~0.7-1.4)
  const heliA = towardPeak - 1.7;
  const HELIPAD_R = 16;
  const HELIPAD_CLEAR = 6.5;
  const helipad = { x: cx + Math.sin(heliA) * HELIPAD_R, z: cz + Math.cos(heliA) * HELIPAD_R };
  const clearOfHelipad = (x: number, z: number, margin = 0) => Math.hypot(x - helipad.x, z - helipad.z) > HELIPAD_CLEAR + margin;

  // ── tents: bright dome tents in a loose cluster (orange/yellow/red/blue, Nepal's real climbing
  // camps are exactly this colourful — world/settlements/styles/basecamp.ts picks the actual colour
  // by each tent's own index, round-robin through the same 4) — scattered like Highstone's cottage
  // ring, a real gap between neighbours so a kid can walk between them, and clear of the helipad ──
  const BASECAMP_HUT_SCALE = 1.5;
  const huts: SettlementHut[] = [];
  const GAP = 2.6;
  const fitsHuts = (x: number, z: number, size: number, gap: number) => huts.every((h) => Math.hypot(h.x - x, h.z - z) > (h.size + size) * 1.15 + gap);
  for (const gap of [GAP, GAP * 0.7, GAP * 0.45, GAP * 0.25, 0]) {
    let placed = huts.length;
    for (let tries = 0; placed < 9 && tries < 600; tries++) {
      const a = r() * TAU;
      const rad = 8 + r() * 14;
      const size = (0.78 + r() * 0.26) * BASECAMP_HUT_SCALE;
      const x = cx + Math.sin(a) * rad;
      const z = cz + Math.cos(a) * rad;
      if (!clearOfHelipad(x, z, size)) continue;
      if (!fitsHuts(x, z, size, gap)) continue;
      const yaw = Math.atan2(cx - x, cz - z); // doorway facing the heart of camp
      huts.push({ x, z, yaw, kind: "tent", size });
      placed++;
    }
    if (placed >= 9) break;
  }

  // ── the mess tent's fire (the hub), crates, a cairn, the helipad, bunting between tents ──
  const fire = { x: cx, z: cz };
  const props: SettlementProp[] = [];
  props.push({ kind: "firepit", x: fire.x, z: fire.z, yaw: 0, scale: 1 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    props.push({ kind: "bench", x: fire.x + Math.sin(a) * 3.1, z: fire.z + Math.cos(a) * 3.1, yaw: a + Math.PI, scale: 1 });
  }
  // stacked supply crates, a short walk from the fire
  const crateA = awayFromPeak - 0.7;
  const cratesSpot = { x: cx + Math.sin(crateA) * 9, z: cz + Math.cos(crateA) * 9 };
  for (let i = 0; i < 3; i++) {
    const a = crateA + (i - 1) * 0.5;
    props.push({ kind: "crates", x: cx + Math.sin(a) * 9.5, z: cz + Math.cos(a) * 9.5, yaw: a, scale: 1 });
  }
  // a little stone cairn (real Base Camps always have one — climbers leave a stone for luck)
  const cairnA = awayFromPeak + 1.4;
  const cairn = { x: cx + Math.sin(cairnA) * 7.5, z: cz + Math.cos(cairnA) * 7.5 };
  props.push({ kind: "cairn", x: cairn.x, z: cairn.z, yaw: 0, scale: 1 });
  // the helipad itself, painted with a big "H"
  props.push({ kind: "helipad", x: helipad.x, z: helipad.z, yaw: heliA, scale: 1 });
  // bunting strung tent to tent, like Highstone's cottages (bright generic pennants, no symbols)
  for (let i = 0; i < huts.length; i++) {
    const a = huts[i];
    const b = huts[(i + 1) % huts.length];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d > 11) continue;
    props.push({ kind: "bunting", x: a.x, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z), scale: d });
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    props.push({ kind: "lantern", x: fire.x + Math.sin(a) * 4.6, z: fire.z + Math.cos(a) * 4.6, yaw: 0, scale: 1 });
  }

  // ── the trailhead: where the roped route up through the Icefall begins, right at the glacier's
  // foot (towards the real summit) — this is where "Climb Everest!" is offered ──
  const trailheadA = towardPeak;
  const trailhead = { x: cx + Math.sin(trailheadA) * (radius - 3), z: cz + Math.cos(trailheadA) * (radius - 3) };
  props.push({ kind: "trailhead-flags", x: trailhead.x, z: trailhead.z, yaw: trailheadA, scale: 1 });

  // the chase play spot (climbers' kids, same as every other settlement)
  const chase = { x: cx + Math.sin(awayFromPeak + 2.2) * 8, z: cz + Math.cos(awayFromPeak + 2.2) * 8 };

  // ── path graph: a hub at the fire, a spoke to every tent, the crates, the cairn, the helipad and
  // the trailhead ──
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
  const cratesIdx = addNode("crates", cratesSpot.x, cratesSpot.z);
  edges.push([0, cratesIdx]);
  const helipadIdx = addNode("helipad", helipad.x, helipad.z);
  edges.push([0, helipadIdx]);
  const cairnIdx = addNode("cairn", cairn.x, cairn.z);
  edges.push([0, cairnIdx]);
  const trailIdx = addNode("trailhead", trailhead.x, trailhead.z);
  edges.push([0, trailIdx]);
  const chaseIdx = addNode("chase", chase.x, chase.z);
  edges.push([0, chaseIdx]);

  const work: SettlementWorkSpot[] = [
    { id: "fire", x: fire.x, z: fire.z, face: 0, sit: true },
    { id: "crates", x: cratesSpot.x, z: cratesSpot.z, face: crateA },
    { id: "helipad", x: helipad.x, z: helipad.z, face: heliA },
    { id: "cairn", x: cairn.x, z: cairn.z, face: cairnA },
    { id: "chase", x: chase.x, z: chase.z, face: 0 },
  ];

  // ── the Climbers' Guild: ~9 climbers in bright puffy jackets (red/orange/blue/yellow), a Sherpa
  // guide elder who knows the mountain, a couple of kids too young to climb but who love camp life ──
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
    { id: "guide-elder", name: "Guide Ang Dorje", elder: true, talk: true, home: 0, sched: [S(0, "home"), S(6, "sit", "fire"), S(9, "look", "helipad"), S(13, "sit", "fire"), S(16, "wander"), S(18.3, "sit", "fire"), S(23, "home")], look: { hairStyle: 2, body: 2 } },
    { id: "climber-1", name: "Mira", talk: true, home: 1, sched: [S(0, "home"), S(6.5, "wander"), S(10, "look", "crates"), S(14, "wander"), S(18.5, "dance", "fire"), S(22.3, "home")] },
    { id: "climber-2", name: "Ravi", talk: true, home: 2, sched: [S(0, "home"), S(6.8, "look", "crates"), S(11, "wander"), S(15.4, "look", "crates"), S(18.4, "dance", "fire"), S(22, "home")], look: { body: 3 } },
    { id: "climber-3", name: "Hana", talk: true, home: 3, sched: [S(0, "home"), S(8, "wander"), S(12.4, "sit", "fire"), S(16, "wander"), S(18.6, "dance", "fire"), S(22.6, "home")], look: { hairStyle: 1 } },
    { id: "camp-kid-1", name: "Pemba", kid: true, talk: true, pair: 0, home: 4, sched: [S(0, "home"), S(7.5, "chase", "chase"), S(11, "wander"), S(14, "chase", "chase"), S(18.2, "dance", "fire"), S(21, "home")] },
    { id: "camp-kid-2", name: "Nima", kid: true, talk: true, pair: 1, home: 5, sched: [S(0, "home"), S(7.8, "chase", "chase"), S(11.2, "wander"), S(14.3, "chase", "chase"), S(18.3, "dance", "fire"), S(21.2, "home")], look: { hairStyle: 0 } },
    { id: "climber-4", name: "Oskar", home: 6, sched: [S(0, "home"), S(6.2, "look", "helipad"), S(10.5, "wander"), S(14.5, "look", "helipad"), S(18.1, "dance", "fire"), S(22.1, "home")] },
    { id: "climber-5", name: "Tsering", home: 7, sched: [S(0, "home"), S(6.6, "wander"), S(9.4, "sit", "fire"), S(13.2, "wander"), S(17, "wander"), S(18.5, "dance", "fire"), S(22.5, "home")] },
    { id: "climber-6", name: "Asha", home: 8, sched: [S(0, "home"), S(7, "look", "crates"), S(11.5, "wander"), S(15.4, "look", "crates"), S(18.7, "dance", "fire"), S(22.7, "home")], look: { body: 1 } },
  ];
  const SKINS_N = 7;
  const HAIRS_N = 8;
  const CLOTHS_N = 7;
  const roster: SettlementVillagerDef[] = ROSTER.map((e, i) => {
    const seed = 9000 + i * 151;
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
      id: "guide-elder",
      name: "Guide Ang Dorje",
      lines: [
        "Welcome to Everest Base Camp! From here it's a long, roped climb to the very top of the world.",
        "Mount Everest is about 8,849 m tall — the highest point on Earth.",
        "We rest here for days before we climb, so our bodies get used to the thin mountain air.",
        "Tenzing Norgay and Edmund Hillary were the first to reach the summit, back in 1953.",
      ],
    },
    {
      id: "climber-1",
      name: "Mira",
      lines: ["I've dreamed of climbing Everest since I was your age!", "We leave a stone on the cairn for good luck before every climb.", "Try the climb yourself at the trailhead flags — rope up and go!"],
    },
    {
      id: "climber-2",
      name: "Ravi",
      lines: ["Those crates are full of rope, oxygen tanks and warm food for the climb.", "The helicopter lands right there on the helipad when someone needs help fast.", "Yaks carry our heaviest packs partway up — they're sure-footed on the ice!"],
    },
    {
      id: "climber-3",
      name: "Hana",
      lines: ["The Khumbu Icefall is the trickiest part — huge cracks of ice, crossed on ladders!", "Up past 8,000 m is called the \"death zone\" — barely enough air to breathe.", "Every climb starts with a cheer round this fire. Join us tonight!"],
    },
    {
      id: "camp-kid-1",
      name: "Pemba",
      lines: ["Race you round the tents!", "Nima always wins because she knows every shortcut.", "I want to be a guide just like Ang Dorje when I grow up!"],
    },
    {
      id: "camp-kid-2",
      name: "Nima",
      lines: ["I'm not cheating, I just know the camp better than you, Pemba!", "The yaks let me brush their shaggy coats — they love it.", "One day I'll climb all the way to the top, just like my mother did."],
    },
  ];

  const activities: SettlementActivitySpot[] = [{ id: "climb-everest", x: trailhead.x, z: trailhead.z, r: 10, label: "Climb Everest!", emoji: "\u{1F9D7}" }];

  // ── yaks carrying packs, resting near the crates ──
  const fauna: SettlementFauna[] = [];
  const YAK_N = 3;
  for (let i = 0; i < YAK_N; i++) {
    const a = crateA + (i - 1) * 0.9;
    const rad = 13 + i * 1.4;
    fauna.push({ id: `yak-${i}`, kind: "yak", x: cx + Math.sin(a) * rad, z: cz + Math.cos(a) * rad, yaw: r() * TAU, scale: 0.95 + r() * 0.15 });
  }

  const obstacles: SettlementObstacle[] = [...huts.map((h) => ({ x: h.x, z: h.z, r: h.size * 1.5 })), { x: fire.x, z: fire.z, r: 1.9 }, ...fauna.map((f) => ({ x: f.x, z: f.z, r: 0.9 * f.scale }))];

  return {
    id: "basecamp",
    name: "Everest Base Camp",
    clan: "the Climbers' Guild",
    emoji: "\u{26FA}",
    style: "basecamp",
    x: cx,
    z: cz,
    radius,
    padHeight,
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
    pier: null,
    canoeLoops: [],
    fauna,
    decks: [],
    levelPatches: [],
  };
}

export { generateBaseCamp };
