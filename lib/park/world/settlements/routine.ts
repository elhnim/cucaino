// A settlement's villagers' day — pure logic, no three.js (tested). Generic over any SettlementDef
// (registry/settlements.ts), so a new settlement is just new data: a roster with schedules (slots
// of the park's 24-hour clock), a path graph to walk between home and work, and a few work spots.
// Every act maps onto one of the shared crowd module's Anim poses (world/village/crowd.ts) — the
// very same rig Coralcove's Tidewing Folk use — so a brand new clan never needs new rigging.
//
// `stepSettlement()` advances everyone and fills a pose per villager (reused objects, no
// allocation per frame); the renderer (./index.ts) turns poses into instance matrices via the
// shared crowd module.
import type { SettlementAct, SettlementDef, SettlementVillagerDef, SettlementWorkSpot } from "../../registry/settlements";
import type { Anim, Pose, Tool } from "../village/crowd";

const TAU = Math.PI * 2;
const wrapA = (a: number) => a - Math.round(a / TAU) * TAU;

/** a seeded xorshift rng (0..1) */
export function settlementRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** how an act is drawn, and the dance ring's radius round the fire */
const ACT_ANIM: Record<SettlementAct, Anim> = {
  home: "stand",
  wander: "stand",
  fish: "fish",
  nets: "nets",
  cook: "bake",
  dance: "dance",
  drum: "drum",
  chase: "run",
  look: "look",
  sit: "sit",
  sell: "sell",
  busk: "flute",
  light: "light",
};
const ACT_TOOL: Partial<Record<SettlementAct, Tool>> = { fish: "rod", cook: "tray", drum: "drum", sell: "basket", busk: "flute", light: "pole" };
const FIRE_DANCE_R = 4.2;
const PLAY_R = 2.2;
const WALK = 1.3;
const KID_RUN = 2.5;
const WAVE_R = 7;
const TALK_R = 3.2;

// ── routes: shortest paths on the settlement's path graph (Floyd-Warshall, like Coralcove's) ──

export interface Routes {
  n: number;
  next: Int16Array;
  dist: Float32Array;
}
export function buildSettlementRoutes(def: SettlementDef): Routes {
  const n = def.nodes.length;
  const dist = new Float32Array(n * n).fill(Infinity);
  const next = new Int16Array(n * n).fill(-1);
  for (let i = 0; i < n; i++) {
    dist[i * n + i] = 0;
    next[i * n + i] = i;
  }
  for (const [a, b] of def.edges) {
    const d = Math.hypot(def.nodes[a].x - def.nodes[b].x, def.nodes[a].z - def.nodes[b].z);
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

export const enum Phase {
  Hidden = 0,
  Route = 1,
  ToSpot = 2,
  Act = 3,
  Leave = 4,
}

export interface VillagerState {
  def: SettlementVillagerDef;
  x: number;
  z: number;
  y: number;
  yaw: number;
  speed: number;
  phase: Phase;
  node: number;
  from: number;
  goal: number;
  slot: number;
  act: SettlementAct;
  spot: SettlementWorkSpot | null;
  actT: number;
  ringA: number;
  wave: number;
  waveT: number;
  waveCool: number;
  lookA: number;
  talking: boolean;
  line: number;
  lineT: number;
  pose: Pose;
  lane: number;
  rnd: () => number;
}

export interface SettlementSim {
  villagers: VillagerState[];
  routes: Routes;
  dancers: number;
  started: boolean;
  lastHour: number;
}

function nodeIndex(def: SettlementDef, id: string): number {
  const i = def.nodes.findIndex((n) => n.id === id);
  if (i < 0) throw new Error(`settlements routine: no node "${id}"`);
  return i;
}
function workById(def: SettlementDef, id: string): SettlementWorkSpot | null {
  return def.work.find((w) => w.id === id) ?? null;
}

export function makeSettlementSim(def: SettlementDef): SettlementSim {
  const routes = buildSettlementRoutes(def);
  const villagers: VillagerState[] = def.roster.map((rd, i): VillagerState => {
    const home = def.nodes[nodeIndex(def, `home-${rd.home}`)];
    return {
      def: rd,
      x: home.x,
      z: home.z,
      y: 0,
      yaw: 0,
      speed: 0,
      phase: Phase.Hidden,
      node: nodeIndex(def, `home-${rd.home}`),
      from: nodeIndex(def, `home-${rd.home}`),
      goal: nodeIndex(def, `home-${rd.home}`),
      slot: -1,
      act: "home",
      spot: null,
      actT: 0,
      ringA: (i / def.roster.length) * TAU,
      wave: 0,
      waveT: 0,
      waveCool: 0,
      lookA: 0,
      talking: false,
      line: 0,
      lineT: 0,
      pose: { anim: "stand", cycle: 0, gait: 0, wave: 0, look: 0, tool: "none", hidden: true },
      lane: ((i % 3) - 1) * 0.3,
      rnd: settlementRng(rd.seed + 7),
    };
  });
  return { villagers, routes, dancers: 0, started: false, lastHour: 0 };
}

/** which slot is running at `hour` (the last one that started, wrapping round midnight) */
export function settlementSlotAt(schedule: SettlementVillagerDef["schedule"], hour: number): number {
  let k = schedule.length - 1;
  for (let i = 0; i < schedule.length; i++) if (schedule[i].from <= hour) k = i;
  return k;
}

function goalNodeFor(def: SettlementDef, v: VillagerState): number {
  if (v.act === "home") return nodeIndex(def, `home-${v.def.home}`);
  // (wander's destination is picked by pickWander(), which always runs before this is read)
  if (v.act === "wander") return v.goal;
  if (v.act === "dance") return nodeIndex(def, "fire");
  if (v.act === "chase") return nodeIndex(def, "chase");
  if (v.spot) {
    const n = def.nodes.find((nd) => Math.hypot(nd.x - v.spot!.x, nd.z - v.spot!.z) < 0.5);
    if (n) return def.nodes.indexOf(n);
  }
  return v.node;
}

const _tg = { x: 0, z: 0, face: 0 };
function actTarget(def: SettlementDef, v: VillagerState, t: number, out: typeof _tg): void {
  if (v.act === "dance") {
    const a = v.ringA;
    out.x = def.work.find((w) => w.id === "fire")!.x + Math.sin(a) * FIRE_DANCE_R;
    out.z = def.work.find((w) => w.id === "fire")!.z + Math.cos(a) * FIRE_DANCE_R;
    out.face = a + Math.PI;
    return;
  }
  if (v.act === "chase") {
    const node = def.nodes[nodeIndex(def, "chase")];
    const a = t * (v.def.kid ? 1.05 : 0.8) + ((v.def.seed * 0.618) % 1) * TAU + (v.def.pair ? -0.95 : 0);
    out.x = node.x + Math.sin(a) * PLAY_R;
    out.z = node.z + Math.cos(a) * PLAY_R;
    out.face = a + Math.PI / 2;
    return;
  }
  if (v.spot) {
    out.x = v.spot.x;
    out.z = v.spot.z;
    out.face = v.spot.face;
    return;
  }
  const n = def.nodes[v.node];
  out.x = n.x + v.lane;
  out.z = n.z;
  out.face = v.yaw;
}

function enterSlot(def: SettlementDef, v: VillagerState, slot: number) {
  const s = v.def.schedule[slot];
  v.slot = slot;
  v.act = s.act;
  v.spot = s.spot ? workById(def, s.spot) : null;
  v.actT = 0;
  if (v.act === "wander") pickWander(def, v);
  v.pose.tool = ACT_TOOL[v.act] ?? "none";
  if (v.phase === Phase.Act || v.phase === Phase.ToSpot) v.phase = Phase.Leave;
  else if (v.phase !== Phase.Hidden) v.phase = Phase.Route;
  v.goal = goalNodeFor(def, v);
}

function placeNow(def: SettlementDef, v: VillagerState, t: number) {
  if (v.act === "home") {
    const h = def.nodes[nodeIndex(def, `home-${v.def.home}`)];
    v.x = h.x;
    v.z = h.z;
    v.node = v.from = v.goal = nodeIndex(def, `home-${v.def.home}`);
    v.phase = Phase.Hidden;
    return;
  }
  v.node = v.from = v.goal = goalNodeFor(def, v);
  if (v.act === "dance") v.ringA = (v.def.seed % 97) * 0.065;
  actTarget(def, v, t, _tg);
  v.x = _tg.x;
  v.z = _tg.z;
  v.yaw = _tg.face;
  v.phase = Phase.Act;
}

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
function laneTarget(def: SettlementDef, v: VillagerState, out: typeof _tg) {
  const a = def.nodes[v.from];
  const b = def.nodes[v.node];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz) || 1;
  out.x = b.x + (dz / d) * v.lane;
  out.z = b.z - (dx / d) * v.lane;
}

function pickWander(def: SettlementDef, v: VillagerState) {
  const n = def.nodes.length;
  let g = Math.floor(v.rnd() * n);
  if (g === v.node) g = (g + 3) % n;
  v.goal = g;
}

function isSitting(v: VillagerState) {
  return v.phase === Phase.Act && !!v.spot?.sit;
}

export interface KidInfo {
  x: number;
  z: number;
}
export interface TalkOut {
  id: string;
  name: string;
  line: string;
  emoji: string;
}

/**
 * Advance everyone by dt at park time `hour` (0..24) and animation time t; `kid` = the Park kid
 * (null when far away). Returns the villager index who's talking to the kid (-1 none); their
 * current line is written into `talk`.
 */
export function stepSettlement(def: SettlementDef, sim: SettlementSim, dtIn: number, t: number, hour: number, kid: KidInfo | null, talk: TalkOut): number {
  const dt = Math.min(0.1, Math.max(0, dtIn));
  const jump = !sim.started || dtIn > 3 || Math.abs(wrapA(((hour - sim.lastHour) / 24) * TAU)) > (1.5 / 24) * TAU;
  let dancers = 0;
  for (const v of sim.villagers) if (v.act === "dance" && v.phase !== Phase.Hidden) dancers++;
  sim.dancers = dancers;
  const talkLines = new Map(def.talk.map((x) => [x.id, x]));

  let talker = -1;
  let talkD = TALK_R;
  for (let i = 0; i < sim.villagers.length; i++) {
    const v = sim.villagers[i];
    const slot = settlementSlotAt(v.def.schedule, hour);
    if (jump) {
      if (slot !== v.slot) enterSlot(def, v, slot);
      placeNow(def, v, t);
    } else if (slot !== v.slot) enterSlot(def, v, slot);
    v.actT += dt;

    // ── the Park kid: wave when near, chat if they've things to say ──
    let kd = Infinity;
    if (kid && v.phase !== Phase.Hidden) kd = Math.hypot(kid.x - v.x, kid.z - v.z);
    v.waveCool = Math.max(0, v.waveCool - dt);
    if (kd < WAVE_R && v.waveCool <= 0 && v.waveT <= 0) {
      v.waveT = 2.4;
      v.waveCool = 13 + (v.def.seed % 5);
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
    const hurry = v.def.kid ? KID_RUN * 0.72 : v.def.elder ? WALK * 0.8 : WALK;
    if (v.talking || (canTalk && talker === i)) {
      if (kid) turnTo(v, Math.atan2(kid.x - v.x, kid.z - v.z), dt, 5);
    } else
      switch (v.phase) {
        case Phase.Hidden:
          if (v.act !== "home") {
            const h = def.nodes[nodeIndex(def, `home-${v.def.home}`)];
            v.x = h.x;
            v.z = h.z;
            v.from = v.node = nodeIndex(def, `home-${v.def.home}`);
            v.phase = Phase.Leave;
          }
          break;
        case Phase.Leave: {
          const n = def.nodes[v.node];
          if (moveTo(v, n.x, n.z, hurry, dt)) {
            v.from = v.node;
            v.goal = goalNodeFor(def, v);
            v.phase = Phase.Route;
          }
          break;
        }
        case Phase.Route: {
          v.goal = goalNodeFor(def, v);
          if (v.node === v.goal && Math.hypot(v.x - def.nodes[v.node].x, v.z - def.nodes[v.node].z) < 0.8) {
            v.phase = Phase.ToSpot;
            break;
          }
          if (v.from === v.node) {
            const nx = sim.routes.next[v.node * sim.routes.n + v.goal];
            if (nx < 0 || nx === v.node) {
              v.phase = Phase.ToSpot;
              break;
            }
            v.node = nx;
          }
          laneTarget(def, v, _tg);
          if (moveTo(v, _tg.x, _tg.z, hurry, dt)) v.from = v.node;
          break;
        }
        case Phase.ToSpot:
          if (v.act === "home") {
            const h = def.nodes[nodeIndex(def, `home-${v.def.home}`)];
            if (moveTo(v, h.x, h.z, hurry * 0.8, dt)) v.phase = Phase.Hidden;
            break;
          }
          if (v.act === "wander") {
            pickWander(def, v);
            v.phase = Phase.Route;
            v.from = v.node;
            break;
          }
          if (v.act === "dance") v.ringA = Math.atan2(v.x - def.work.find((w) => w.id === "fire")!.x, v.z - def.work.find((w) => w.id === "fire")!.z);
          if (v.act === "chase") {
            // (run to the nearest point of the play circle, then join in — not the orbit point
            // itself, which drifts with t and would never quite be caught)
            const node = def.nodes[nodeIndex(def, "chase")];
            const d = Math.max(0.01, Math.hypot(v.x - node.x, v.z - node.z));
            _tg.x = node.x + ((v.x - node.x) / d) * PLAY_R;
            _tg.z = node.z + ((v.z - node.z) / d) * PLAY_R;
          } else actTarget(def, v, t, _tg);
          if (moveTo(v, _tg.x, _tg.z, hurry * 0.8, dt)) v.phase = Phase.Act;
          break;
        case Phase.Act:
          doAct(def, sim, v, i, t, dt);
          break;
      }
    // (don't walk through the Park kid)
    if (kid && kd < 3 && v.phase !== Phase.Hidden && !isSitting(v)) {
      const d = Math.max(0.01, Math.hypot(v.x - kid.x, v.z - kid.z));
      if (d < 0.95) {
        v.x = kid.x + ((v.x - kid.x) / d) * 0.95;
        v.z = kid.z + ((v.z - kid.z) / d) * 0.95;
      }
    }
    v.y = 0; // the renderer places y from the settlement's flat pad / pier deck
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
    if (v.lineT > 6.5) {
      v.lineT = 0;
      v.line++;
    }
    talk.id = entry.id;
    talk.name = entry.name;
    talk.line = entry.lines[v.line % entry.lines.length];
    talk.emoji = def.emoji;
  }
  for (let i = 0; i < sim.villagers.length; i++)
    if (i !== talker && sim.villagers[i].talking) {
      sim.villagers[i].talking = false;
      sim.villagers[i].line++;
    }
  separate(sim, dt);
  sim.started = true;
  sim.lastHour = hour;
  return talker;
}

const PERSONAL = 0.85;
function separate(sim: SettlementSim, dt: number) {
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

function doAct(def: SettlementDef, sim: SettlementSim, v: VillagerState, i: number, t: number, dt: number) {
  switch (v.act) {
    case "wander": {
      turnTo(v, v.yaw + Math.sin(t * 0.4 + v.def.seed) * 0.8, dt, 0.6);
      if (v.actT > 9 + (v.def.seed % 7)) {
        v.actT = 0;
        pickWander(def, v);
        v.from = v.node;
        v.phase = Phase.Route;
      }
      return;
    }
    case "dance": {
      const n = Math.max(1, sim.dancers);
      let idx = 0;
      for (let j = 0; j < i; j++) if (sim.villagers[j].act === "dance" && sim.villagers[j].phase !== Phase.Hidden) idx++;
      const want = (idx / n) * TAU + t * 0.22;
      v.ringA += (0.2 + Math.max(-0.5, Math.min(0.5, wrapA(want - v.ringA))) * 0.8) * dt;
      actTarget(def, v, t, _tg);
      const px = v.x;
      const pz = v.z;
      v.x += (_tg.x - v.x) * Math.min(1, dt * 5);
      v.z += (_tg.z - v.z) * Math.min(1, dt * 5);
      v.speed = Math.hypot(v.x - px, v.z - pz) / Math.max(dt, 1e-4);
      v.yaw = _tg.face;
      return;
    }
    case "chase": {
      actTarget(def, v, t, _tg);
      const px = v.x;
      const pz = v.z;
      v.x += (_tg.x - v.x) * Math.min(1, dt * 6);
      v.z += (_tg.z - v.z) * Math.min(1, dt * 6);
      v.speed = Math.hypot(v.x - px, v.z - pz) / Math.max(dt, 1e-4);
      turnTo(v, _tg.face, dt, 8);
      return;
    }
    default: {
      actTarget(def, v, t, _tg);
      if (moveTo(v, _tg.x, _tg.z, WALK * 0.5, dt)) {
        v.speed = 0;
        turnTo(v, _tg.face, dt, 5);
      }
    }
  }
}

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
    if (v.act === "wander" && moving) p.anim = "walk";
    if (v.act === "chase" && !moving) p.anim = "stand";
  } else p.anim = moving ? (v.def.kid ? "run" : "walk") : "stand";
  if (p.anim === "walk" || p.anim === "run") {
    p.cycle += v.speed * (p.anim === "run" ? 3.4 : 3.9) * (v.def.kid ? 1.3 : 1) * dt;
    p.gait = Math.min(1, v.speed / 1.2);
  } else {
    p.gait = 0;
    p.cycle = t * 3;
  }
  p.tool = acting ? (ACT_TOOL[v.act] ?? "none") : "none";
}
