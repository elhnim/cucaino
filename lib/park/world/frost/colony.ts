// The penguins of Penguin Point — pure maths, deterministic, allocation-free per step, no three.js
// (tested). Each penguin runs a little routine:
//   home      loafing at its spot in the colony: preening, flapping, calling with its head up,
//             looking round (and at the Park kid when they come close)
//   walkout   the colony sends them off in small groups...
//   ascend    ...waddling in a line up the snowy ramp to Slide Top (keeping their spacing; now and
//             then one slips, flops on its belly, slides back a bit and gets up again)
//   queue     waiting their turn behind a chute's start (shuffling forward)
//   slide     belly-tobogganing down the chute, faster on the steep bits, snow spraying — SPLASH
//   swim      porpoising home round the coast: zipping underwater, leaping out to breathe
//   fish      (some) chasing fish in loops underwater in the bay off the colony first
//   hop       leaping out of the water onto the beach
//   walkhome  waddling (with a shake of the flippers) back up to a free spot in the colony
// Stay-at-home emperor parents potter about the colony with their fluffy chicks following close
// behind; other emperors huddle together (the huddle slowly turns); the rest of the chicks crowd
// together in the crèche. `step()` writes the pose each penguin should be drawn in (position, yaw,
// pitch, roll, head, flippers, how much it's lying on its belly) and reports splashes / snow puffs /
// bubbles as events for the effects.
import {
  FROST_ASCENT,
  FROST_COLONY,
  FROST_CRECHE,
  FROST_FISHING,
  FROST_HUDDLE,
  FROST_SHORE,
  FROST_SLIDES,
  FROST_SWIMS,
  FROST_WATER_Y,
  frostGroundY,
  frostLandY,
  frostRng,
  frostSeaFloorY,
  frostSlideSplash,
} from "../../registry/frostIsland";

const TAU = Math.PI * 2;
const WY = FROST_WATER_Y;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const wrapA = (a: number) => a - Math.round(a / TAU) * TAU;
const smooth = (a: number, b: number, x: number) => {
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};

// ── paths ──

export interface Path {
  x: Float32Array;
  z: Float32Array;
  /** heights (slides only) */
  y: Float32Array | null;
  cum: Float32Array;
  n: number;
  len: number;
}
function makePath(pts: { x: number; z: number; y?: number }[], cap = pts.length): Path {
  const p: Path = { x: new Float32Array(cap), z: new Float32Array(cap), y: pts[0]?.y !== undefined ? new Float32Array(cap) : null, cum: new Float32Array(cap), n: 0, len: 0 };
  setPath(p, pts);
  return p;
}
function setPath(p: Path, pts: { x: number; z: number; y?: number }[]) {
  p.n = pts.length;
  for (let i = 0; i < pts.length; i++) {
    p.x[i] = pts[i].x;
    p.z[i] = pts[i].z;
    if (p.y) p.y[i] = pts[i].y ?? 0;
  }
  recum(p);
}
function recum(p: Path) {
  p.cum[0] = 0;
  for (let i = 1; i < p.n; i++) p.cum[i] = p.cum[i - 1] + Math.hypot(p.x[i] - p.x[i - 1], p.z[i] - p.z[i - 1]);
  p.len = p.cum[p.n - 1];
}
/** a two-point path, reusing `p`'s storage (capacity >= 2) */
function setLine(p: Path, ax: number, az: number, bx: number, bz: number) {
  p.n = 2;
  p.x[0] = ax;
  p.z[0] = az;
  p.x[1] = bx;
  p.z[1] = bz;
  recum(p);
}
export interface PathPt {
  x: number;
  z: number;
  y: number;
  /** unit direction along the path */
  dx: number;
  dz: number;
  /** downhill slope (rise over run, > 0 = going down) — slides only */
  slope: number;
}
export function samplePath(p: Path, s: number, out: PathPt): PathPt {
  const d = clamp(s, 0, p.len);
  let k = 1;
  // (paths are short: a linear scan is fine)
  while (k < p.n - 1 && p.cum[k] < d) k++;
  const seg = p.cum[k] - p.cum[k - 1] || 1;
  const f = (d - p.cum[k - 1]) / seg;
  const ax = p.x[k - 1];
  const az = p.z[k - 1];
  out.x = ax + (p.x[k] - ax) * f;
  out.z = az + (p.z[k] - az) * f;
  out.dx = (p.x[k] - ax) / seg;
  out.dz = (p.z[k] - az) / seg;
  if (p.y) {
    out.y = p.y[k - 1] + (p.y[k] - p.y[k - 1]) * f;
    out.slope = (p.y[k - 1] - p.y[k]) / seg;
  } else {
    out.y = 0;
    out.slope = 0;
  }
  return out;
}

// ── penguins ──

export const EMPEROR = 0;
export const CHICK = 1;
export const LITTLE = 2;
export const ROLE_ACTIVE = 0;
export const ROLE_PARENT = 1;
export const ROLE_HUDDLE = 2;
export const ROLE_CHICK = 3;
export const ROLE_CRECHE = 4;

export const S_HOME = 0;
export const S_WALKOUT = 1;
export const S_ASCEND = 2;
export const S_QUEUE = 3;
export const S_SLIDE = 4;
export const S_SWIM = 5;
export const S_FISH = 6;
export const S_HOP = 7;
export const S_WALKHOME = 8;
export const S_SLIP = 9;
export const S_HUDDLE = 10;
export const S_FOLLOW = 11;
export const S_CRECHE = 12;
export const STATE_NAMES = ["home", "walkout", "ascend", "queue", "slide", "swim", "fish", "hop", "walkhome", "slip", "huddle", "follow", "creche"];

// ── true size ──
// The Park kid is 2.26 units tall (a real ~1.4 m ten-year-old), so 1 m = FROST_M = 1.6 units. Each
// kind's model (./critters.ts PENGUIN_RIG height) is scaled to its real standing height:
//   emperor penguin   1.15 m  (adult, the tallest penguin)
//   emperor chick     0.6 m   (crèche age: a big grey down-ball)
//   little penguin    0.33 m  (the smallest penguin: "little blue" / fairy penguin)
export const FROST_M = 1.6;
export const PENGUIN_TRUE_M = [1.15, 0.6, 0.33];
const MODEL_H = [1.08, 0.68, 0.5];
/** world units per model unit, per kind (emperor, chick, little) */
export const PENGUIN_K = PENGUIN_TRUE_M.map((m, k) => (FROST_M * m) / MODEL_H[k]);
/** how much bigger than the old storybook penguins (1.3x model) the true-size emperors are: the
 *  colony's spacings (slots, queues, the ascent line) grow by this */
const SP = PENGUIN_K[0] / 1.3;
/** body centre height (standing) and belly half-thickness, per kind */
const CY = [0.47, 0.3, 0.24];
const BR = [0.27, 0.25, 0.16];

export interface Penguin {
  i: number;
  kind: number;
  role: number;
  seed: number;
  /** size multiplier */
  size: number;
  state: number;
  /** time in this state */
  t: number;
  /** how long to stay (home, fish...) */
  dur: number;
  // where it is: x, z; y = the height it stands / lies on (the ground, a chute, or a virtual floor
  // for swimmers: its belly's underside)
  x: number;
  y: number;
  z: number;
  yaw: number;
  // the pose, for drawing
  pitch: number;
  roll: number;
  /** 0 standing .. 1 lying on its belly */
  belly: number;
  headYaw: number;
  headPitch: number;
  /** flipper angles: out from the body (roll), and swept back (pitch) */
  flipOut: number;
  flipBack: number;
  /** waddle phase */
  cycle: number;
  /** under the water */
  under: boolean;
  // routes
  path: Path | null;
  ps: number;
  v: number;
  chute: number;
  ahead: number;
  slot: number;
  lat: number;
  slipAt: number;
  fishing: boolean;
  /** swimming: time since the last leap, time between leaps, leaping now (0..1 through the arc, <0 = no) */
  leapT: number;
  leapEvery: number;
  leapU: number;
  leapY0: number;
  /** idle act at home: 0 stand, 1 preen, 2 flap, 3 call, 4 look round, 5 shuffle */
  act: number;
  actT: number;
  faceYaw: number;
  parent: number;
  /** own scratch path (lines to the fishing bay / the shore) */
  dyn: Path;
}

export interface ColonyEvents {
  /** x, y, z, size, kind (0 big splash, 1 small splash, 2 snow puff, 3 bubbles) per event */
  buf: Float32Array;
  n: number;
}
export const EV_SPLASH = 0;
export const EV_SPLISH = 1;
export const EV_PUFF = 2;
export const EV_BUBBLES = 3;
const MAX_EV = 96;

export interface Colony {
  penguins: Penguin[];
  ev: ColonyEvents;
  /** the slides, their splash distances, and the swims home */
  slides: Path[];
  splashAt: number[];
  swims: Path[];
  ascent: Path;
  /** each chute's queue (penguin indices) */
  queues: Int16Array[];
  qLen: number[];
  lastStart: number[];
  lastSlider: number[];
  lastAscender: number;
  /** colony spots and who's on them */
  slotX: Float32Array;
  slotZ: Float32Array;
  slotBy: Int16Array;
  huddleX: Float32Array;
  huddleZ: Float32Array;
  crecheX: Float32Array;
  crecheZ: Float32Array;
  dispatchT: number;
  rnd: () => number;
  time: number;
  /** stats (for tests): slides finished, splashes, hops ashore */
  slides_done: number;
  hops_done: number;
}

const QUEUE_CAP = 4;
const pt: PathPt = { x: 0, z: 0, y: 0, dx: 0, dz: 1, slope: 0 };
const pt2: PathPt = { x: 0, z: 0, y: 0, dx: 0, dz: 1, slope: 0 };

export function colonyCounts(low: boolean) {
  return low ? { active: 10, parents: 5, huddle: 4, creche: 3, little: 16 } : { active: 22, parents: 10, huddle: 8, creche: 6, little: 34 };
}

export function makeColony(low: boolean, seed = 777): Colony {
  const rnd = frostRng(seed);
  const C = colonyCounts(low);
  // colony spots: a hex grid over the terrace (kept off the huddle, the crèche and the path to the beach)
  const sx: number[] = [];
  const sz: number[] = [];
  const sp = 1.2 * SP;
  for (let j = -10; j <= 10; j++)
    for (let i = -10; i <= 10; i++) {
      const x = FROST_COLONY.x + (i + (j % 2 ? 0.5 : 0)) * sp;
      const z = FROST_COLONY.z + j * sp * 0.866;
      if (Math.hypot(x - FROST_COLONY.x, z - FROST_COLONY.z) > FROST_COLONY.r - 0.6) continue;
      if (Math.hypot(x - FROST_HUDDLE.x, z - FROST_HUDDLE.z) < FROST_HUDDLE.r + 1.2) continue;
      if (Math.hypot(x - FROST_CRECHE.x, z - FROST_CRECHE.z) < FROST_CRECHE.r + 1) continue;
      sx.push(x);
      sz.push(z);
    }
  const ring = (cx: number, cz: number, n: number, sp2: number) => {
    const X = new Float32Array(n);
    const Z = new Float32Array(n);
    // a sunflower spiral: a tight, even huddle
    for (let k = 0; k < n; k++) {
      const r = sp2 * Math.sqrt(k + 0.5) * 0.62;
      const a = k * 2.39996;
      X[k] = cx + Math.sin(a) * r;
      Z[k] = cz + Math.cos(a) * r;
    }
    return { X, Z };
  };
  const hud = ring(FROST_HUDDLE.x, FROST_HUDDLE.z, C.huddle, 0.72 * SP);
  const cre = ring(FROST_CRECHE.x, FROST_CRECHE.z, C.creche, 0.5 * SP);
  const slides = FROST_SLIDES.map((s) => makePath(s.path));
  const col: Colony = {
    penguins: [],
    ev: { buf: new Float32Array(MAX_EV * 5), n: 0 },
    slides,
    splashAt: FROST_SLIDES.map((s, i) => slides[i].cum[frostSlideSplash(s)]),
    swims: FROST_SWIMS.map((s) => makePath(s)),
    ascent: makePath(FROST_ASCENT),
    queues: FROST_SLIDES.map(() => new Int16Array(64).fill(-1)),
    qLen: FROST_SLIDES.map(() => 0),
    lastStart: FROST_SLIDES.map(() => -99),
    lastSlider: FROST_SLIDES.map(() => -1),
    lastAscender: -1,
    slotX: Float32Array.from(sx),
    slotZ: Float32Array.from(sz),
    slotBy: new Int16Array(sx.length).fill(-1),
    huddleX: hud.X,
    huddleZ: hud.Z,
    crecheX: cre.X,
    crecheZ: cre.Z,
    dispatchT: 3,
    rnd,
    time: 0,
    slides_done: 0,
    hops_done: 0,
  };
  const add = (kind: number, role: number) => {
    const i = col.penguins.length;
    const p: Penguin = {
      i,
      kind,
      role,
      seed: Math.floor(rnd() * 100000),
      size: PENGUIN_K[kind] * (kind === EMPEROR ? 0.92 + rnd() * 0.16 : kind === CHICK ? 0.85 + rnd() * 0.3 : 0.9 + rnd() * 0.2),
      state: S_HOME,
      t: 0,
      dur: 0,
      x: FROST_COLONY.x,
      y: FROST_COLONY.y,
      z: FROST_COLONY.z,
      yaw: rnd() * TAU,
      pitch: 0,
      roll: 0,
      belly: 0,
      headYaw: 0,
      headPitch: 0,
      flipOut: 0.15,
      flipBack: 0,
      cycle: rnd() * TAU,
      under: false,
      path: null,
      ps: 0,
      v: 0,
      chute: 0,
      ahead: -1,
      slot: -1,
      lat: (rnd() * 2 - 1) * 1,
      slipAt: -1,
      fishing: false,
      leapT: 0,
      leapEvery: 1.4 + rnd() * 1.4,
      leapU: -1,
      leapY0: 0,
      act: 0,
      actT: rnd() * 4,
      faceYaw: rnd() * TAU,
      parent: -1,
      dyn: makePath([{ x: 0, z: 0 }, { x: 0, z: 1 }], 2),
    };
    col.penguins.push(p);
    return p;
  };
  for (let k = 0; k < C.active; k++) add(EMPEROR, ROLE_ACTIVE);
  for (let k = 0; k < C.little; k++) add(LITTLE, ROLE_ACTIVE);
  const parents: Penguin[] = [];
  for (let k = 0; k < C.parents; k++) parents.push(add(EMPEROR, ROLE_PARENT));
  for (let k = 0; k < C.huddle; k++) add(EMPEROR, ROLE_HUDDLE);
  for (const par of parents) {
    const c = add(CHICK, ROLE_CHICK);
    c.parent = par.i;
  }
  for (let k = 0; k < C.creche; k++) add(CHICK, ROLE_CRECHE);

  // starting places: spread through the whole routine so the island is busy from the first frame
  let hk = 0;
  let ck = 0;
  for (const p of col.penguins) {
    if (p.role === ROLE_HUDDLE) {
      p.state = S_HUDDLE;
      p.slot = hk++;
      p.x = col.huddleX[p.slot];
      p.z = col.huddleZ[p.slot];
    } else if (p.role === ROLE_CRECHE) {
      p.state = S_CRECHE;
      p.slot = ck++;
      p.x = col.crecheX[p.slot];
      p.z = col.crecheZ[p.slot];
    } else if (p.role === ROLE_CHICK) {
      p.state = S_FOLLOW;
    } else {
      goHome(col, p, true);
    }
    p.y = ground(p.x, p.z);
  }
  for (const p of col.penguins) {
    if (p.role !== ROLE_CHICK) continue;
    const par = col.penguins[p.parent];
    p.x = par.x + Math.sin(par.yaw + 2.6) * 0.8 * SP;
    p.z = par.z + Math.cos(par.yaw + 2.6) * 0.8 * SP;
    p.y = ground(p.x, p.z);
  }
  // the active ones: some on the ramp, some queueing, some already swimming home
  const actives = col.penguins.filter((p) => p.role === ROLE_ACTIVE);
  actives.forEach((p, k) => {
    const u = k / actives.length;
    if (u < 0.2) {
      freeSlot(col, p);
      startAscend(col, p);
      p.ps = col.ascent.len * (0.9 - u * 4.2);
    } else if (u < 0.3) {
      freeSlot(col, p);
      p.chute = k % col.slides.length;
      joinQueue(col, p);
      const q = queuePos(col, p.chute, col.qLen[p.chute] - 1);
      p.x = q.x;
      p.z = q.z;
    } else if (u < 0.5) {
      freeSlot(col, p);
      p.chute = k % col.slides.length;
      startSwim(col, p, col.swims[p.chute].len * col.rnd() * 0.8);
    } else {
      p.t = col.rnd() * 20;
      p.dur = 8 + col.rnd() * 30;
    }
    p.y = ground(p.x, p.z);
  });
  return col;
}

function ground(x: number, z: number): number {
  return frostGroundY(x, z) ?? frostLandY(x, z) ?? WY;
}

function emit(col: Colony, x: number, y: number, z: number, size: number, kind: number) {
  const e = col.ev;
  if (e.n >= MAX_EV) return;
  const o = e.n * 5;
  e.buf[o] = x;
  e.buf[o + 1] = y;
  e.buf[o + 2] = z;
  e.buf[o + 3] = size;
  e.buf[o + 4] = kind;
  e.n++;
}

function freeSlot(col: Colony, p: Penguin) {
  if (p.slot >= 0 && p.role !== ROLE_HUDDLE && p.role !== ROLE_CRECHE && col.slotBy[p.slot] === p.i) col.slotBy[p.slot] = -1;
  if (p.role !== ROLE_HUDDLE && p.role !== ROLE_CRECHE) p.slot = -1;
}

/** pick a free colony spot (near `nx, nz` if given) and claim it */
function claimSlot(col: Colony, p: Penguin, nx: number, nz: number, within: number): number {
  const n = col.slotX.length;
  let best = -1;
  let bd = Infinity;
  const off = Math.floor(col.rnd() * n);
  for (let k = 0; k < n; k++) {
    const j = (k + off) % n;
    if (col.slotBy[j] >= 0) continue;
    const d = Math.hypot(col.slotX[j] - nx, col.slotZ[j] - nz);
    // (a bit of randomness so they don't all pack the front row)
    const score = d < within ? d * 0.2 + col.rnd() * 2 : d + 5;
    if (score < bd) {
      bd = score;
      best = j;
    }
  }
  if (best >= 0) col.slotBy[best] = p.i;
  return best;
}

function goHome(col: Colony, p: Penguin, place: boolean) {
  p.slot = claimSlot(col, p, place ? FROST_COLONY.x : p.x, place ? FROST_COLONY.z : p.z, place ? 99 : 5);
  if (place && p.slot >= 0) {
    p.x = col.slotX[p.slot];
    p.z = col.slotZ[p.slot];
    p.state = S_HOME;
    p.t = 0;
    p.dur = 10 + col.rnd() * 35;
  } else {
    p.state = S_WALKHOME;
    p.t = 0;
  }
  p.under = false;
  p.belly = 0;
}

function startAscend(col: Colony, p: Penguin) {
  p.state = S_ASCEND;
  p.t = 0;
  p.path = col.ascent;
  p.ps = 0;
  const a = col.lastAscender;
  p.ahead = a >= 0 && a !== p.i && col.penguins[a].state === S_ASCEND ? a : -1;
  col.lastAscender = p.i;
  p.slipAt = col.rnd() < 0.2 ? col.ascent.len * (0.3 + col.rnd() * 0.55) : -1;
}

const cdOut = { x: 0, z: 0, dx: 0, dz: 1 };
/** a chute's start and its heading there (a shared scratch object) */
function chuteDir(col: Colony, c: number) {
  const s = col.slides[c];
  const dx = s.x[3] - s.x[0];
  const dz = s.z[3] - s.z[0];
  const L = Math.hypot(dx, dz) || 1;
  cdOut.x = s.x[0];
  cdOut.z = s.z[0];
  cdOut.dx = dx / L;
  cdOut.dz = dz / L;
  return cdOut;
}
/** where the j-th penguin in a chute's queue stands (behind its start) */
const qOut = { x: 0, z: 0 };
function queuePos(col: Colony, c: number, j: number) {
  const d = chuteDir(col, c);
  const back = (1.25 + j * 0.8) * SP;
  const side = (j % 2 ? 0.18 : -0.18) * SP;
  qOut.x = d.x - d.dx * back + d.dz * side;
  qOut.z = d.z - d.dz * back - d.dx * side;
  return qOut;
}
function joinQueue(col: Colony, p: Penguin) {
  const q = col.queues[p.chute];
  q[col.qLen[p.chute]++] = p.i;
  p.state = S_QUEUE;
  p.t = 0;
}
function queueIndex(col: Colony, p: Penguin) {
  const q = col.queues[p.chute];
  for (let j = 0; j < col.qLen[p.chute]; j++) if (q[j] === p.i) return j;
  return -1;
}
function leaveQueue(col: Colony, p: Penguin) {
  const q = col.queues[p.chute];
  const n = col.qLen[p.chute];
  let w = 0;
  for (let j = 0; j < n; j++) if (q[j] !== p.i) q[w++] = q[j];
  for (let j = w; j < n; j++) q[j] = -1;
  col.qLen[p.chute] = w;
}

function startSwim(col: Colony, p: Penguin, s0 = 0) {
  p.state = S_SWIM;
  p.t = 0;
  p.under = true;
  p.belly = 1;
  p.v = p.kind === LITTLE ? 4.8 : 4;
  p.leapT = col.rnd() * p.leapEvery;
  p.leapU = -1;
  p.fishing = s0 === 0 && col.rnd() < 0.55;
  if (p.fishing) {
    // off to the bay first: aim at a point on the fishing loop
    const sw = col.swims[p.chute];
    const a = col.rnd() * TAU;
    setLine(p.dyn, sw.x[0], sw.z[0], FROST_FISHING.x + Math.sin(a) * FROST_FISHING.r * 0.7, FROST_FISHING.z + Math.cos(a) * FROST_FISHING.r * 0.7);
    p.path = p.dyn;
  } else p.path = col.swims[p.chute];
  p.ps = s0;
  samplePath(p.path, s0, pt);
  p.x = pt.x;
  p.z = pt.z;
  p.y = WY - 0.9;
}

/** turn `yaw` towards `want` at up to `rate` rad/s */
function turnTo(yaw: number, want: number, rate: number, dt: number) {
  const d = wrapA(want - yaw);
  return yaw + clamp(d, -rate * dt, rate * dt);
}

/** a kind's size against the old storybook penguins (1.3x model): bigger legs walk faster */
const kindK = (p: Penguin) => PENGUIN_K[p.kind] / 1.3;
function waddleSpeed(p: Penguin) {
  return (p.kind === EMPEROR ? 0.75 : p.kind === CHICK ? 0.8 : 0.95) * (0.9 + (p.seed % 7) * 0.03) * kindK(p);
}

/** step towards (tx, tz) on foot; true when arrived */
function walkTo(p: Penguin, tx: number, tz: number, v: number, dt: number): boolean {
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.08) return true;
  const st = Math.min(d, v * dt);
  p.x += (dx / d) * st;
  p.z += (dz / d) * st;
  p.yaw = turnTo(p.yaw, Math.atan2(dx, dz), 5, dt);
  p.cycle += (st * (p.kind === EMPEROR ? 8 : 12)) / kindK(p);
  p.y = ground(p.x, p.z);
  return d - st < 0.08;
}

function standPose(p: Penguin, dt: number) {
  p.belly += (0 - p.belly) * Math.min(1, dt * 6);
  p.pitch += (0 - p.pitch) * Math.min(1, dt * 6);
  p.roll += (0 - p.roll) * Math.min(1, dt * 6);
}
function walkPose(p: Penguin, t: number, dt: number) {
  standPose(p, dt);
  p.roll = Math.sin(p.cycle) * (p.kind === EMPEROR ? 0.2 : 0.26);
  p.pitch = 0.06;
  p.flipOut = 0.35 + Math.sin(p.cycle * 2) * 0.06;
  p.flipBack = 0.1;
  p.headYaw = Math.sin(t * 0.7 + p.seed) * 0.2;
  p.headPitch = 0.05;
}

/** loafing about at home: idle acts, and a look at the kid when they're near */
function idle(p: Penguin, t: number, dt: number, kidX: number, kidZ: number, kidNear: boolean) {
  standPose(p, dt);
  p.actT -= dt;
  if (p.actT <= 0) {
    const r = ((p.seed * 9301 + Math.floor(t * 3.1) * 49297) % 233280) / 233280;
    p.act = r < 0.3 ? 0 : r < 0.48 ? 1 : r < 0.62 ? 2 : r < 0.74 ? 3 : r < 0.9 ? 4 : 5;
    p.actT = 2.2 + ((p.seed + Math.floor(t)) % 5) * 0.9;
    if (p.act === 5) p.faceYaw = p.yaw + (r - 0.5) * 3;
  }
  const ph = p.seed * 0.37;
  p.flipOut = 0.12 + Math.sin(t * 1.3 + ph) * 0.03;
  p.flipBack = 0;
  p.headPitch = Math.sin(t * 0.6 + ph) * 0.06;
  p.headYaw = Math.sin(t * 0.4 + ph) * 0.25;
  switch (p.act) {
    case 1: // preen: head down and round to the side
      p.headYaw = 0.9 * Math.sin(ph) + Math.sin(t * 5 + ph) * 0.12;
      p.headPitch = 0.55;
      p.roll = 0.08;
      break;
    case 2: // flap
      p.flipOut = 0.9 + Math.sin(t * 16 + ph) * 0.55;
      p.headPitch = -0.15;
      break;
    case 3: // call: head up to the sky, flippers back
      p.headPitch = -1.0;
      p.pitch = -0.18;
      p.flipOut = 0.3;
      p.flipBack = 0.6;
      break;
    case 4: // look round
      p.headYaw = Math.sin(t * 1.1 + ph) * 1.1;
      break;
    case 5: // shuffle round
      p.yaw = turnTo(p.yaw, p.faceYaw, 0.8, dt);
      p.roll = Math.sin(t * 7 + ph) * 0.08;
      break;
  }
  if (kidNear) {
    const want = Math.atan2(kidX - p.x, kidZ - p.z);
    const rel = wrapA(want - p.yaw);
    if (Math.abs(rel) < 1.4) p.headYaw = clamp(rel, -1.2, 1.2);
    else p.yaw = turnTo(p.yaw, want, 1.2, dt);
    p.headPitch = -0.25;
    // excited: a happy flap now and then
    if (Math.sin(t * 0.9 + ph) > 0.7) p.flipOut = 0.8 + Math.sin(t * 15 + ph) * 0.5;
  }
}

/**
 * Advance the colony by dt at time t. `kid` = the Park kid's position (or null when far away).
 * Clears and refills `col.ev` with this step's splashes / puffs / bubbles.
 */
export function stepColony(col: Colony, dtIn: number, t: number, kid: { x: number; z: number } | null): void {
  const dt = clamp(dtIn, 0, 0.1);
  col.time = t;
  col.ev.n = 0;
  const P = col.penguins;
  const kidX = kid ? kid.x : 1e9;
  const kidZ = kid ? kid.z : 1e9;

  // ── send a group from home up the ramp every little while ──
  col.dispatchT -= dt;
  if (col.dispatchT <= 0) {
    col.dispatchT = 5 + col.rnd() * 5;
    // (the ones who've rested longest go first)
    const n = 2 + Math.floor(col.rnd() * 4);
    for (let j = 0; j < n; j++) {
      let best = -1;
      let most = 0;
      for (let k = 0; k < P.length; k++) {
        const p = P[k];
        if (p.role !== ROLE_ACTIVE || p.state !== S_HOME) continue;
        const over = p.t - p.dur;
        if (over > most) {
          most = over;
          best = k;
        }
      }
      if (best < 0) break;
      P[best].state = S_WALKOUT;
      P[best].t = -(j * 0.9);
    }
  }

  for (let k = 0; k < P.length; k++) {
    const p = P[k];
    p.t += dt;
    const kidNear = (p.x - kidX) ** 2 + (p.z - kidZ) ** 2 < 25;
    switch (p.state) {
      case S_HOME: {
        idle(p, t, dt, kidX, kidZ, kidNear);
        if (p.slot >= 0) {
          // (stand on your spot; shuffle back onto it if nudged)
          const dx = col.slotX[p.slot] - p.x;
          const dz = col.slotZ[p.slot] - p.z;
          if (dx * dx + dz * dz > 0.01) walkTo(p, col.slotX[p.slot], col.slotZ[p.slot], waddleSpeed(p) * 0.6, dt);
        }
        // parents potter about the colony now and then (their chick follows)
        if (p.role === ROLE_PARENT && p.t > p.dur) {
          freeSlot(col, p);
          p.slot = claimSlot(col, p, p.x, p.z, 4.5);
          p.state = S_WALKHOME;
          p.t = 0;
        }
        break;
      }
      case S_WALKOUT: {
        if (p.t < 0) {
          idle(p, t, dt, kidX, kidZ, kidNear);
          break;
        }
        freeSlot(col, p);
        walkPose(p, t, dt);
        if (walkTo(p, col.ascent.x[0], col.ascent.z[0], waddleSpeed(p), dt)) startAscend(col, p);
        break;
      }
      case S_ASCEND: {
        walkPose(p, t, dt);
        let v = waddleSpeed(p);
        if (p.ahead >= 0) {
          const a = P[p.ahead];
          if (a.state === S_ASCEND || a.state === S_SLIP) v = Math.min(v, Math.max(0, (a.ps - p.ps - 1.05 * SP) * 1.6));
          else p.ahead = -1;
        }
        // (at the top: wait if every queue is full)
        const atTop = p.ps >= col.ascent.len - 0.05;
        if (atTop) {
          let c = -1;
          let best = QUEUE_CAP;
          for (let j = 0; j < col.slides.length; j++) {
            const jj = (j + p.seed) % col.slides.length;
            if (col.qLen[jj] < best) {
              best = col.qLen[jj];
              c = jj;
            }
          }
          if (c >= 0) {
            p.chute = c;
            joinQueue(col, p);
          } else idle(p, t, dt, kidX, kidZ, kidNear); // (waiting at the top for a free chute)
          break;
        }
        const st = v * dt;
        p.ps = Math.min(col.ascent.len, p.ps + st);
        samplePath(col.ascent, p.ps, pt);
        const lat = Math.sin(p.ps * 0.5 + p.seed) * 0.25;
        p.x = pt.x + pt.dz * lat;
        p.z = pt.z - pt.dx * lat;
        p.y = ground(p.x, p.z);
        if (st > 0) {
          p.yaw = turnTo(p.yaw, Math.atan2(pt.dx, pt.dz), 4, dt);
          p.cycle += (st * (p.kind === EMPEROR ? 8 : 12)) / kindK(p);
        } else standPose(p, dt);
        if (p.slipAt >= 0 && p.ps >= p.slipAt) {
          p.slipAt = -1;
          p.state = S_SLIP;
          p.t = 0;
          emit(col, p.x, p.y + 0.1, p.z, 0.5, EV_PUFF);
        }
        break;
      }
      case S_SLIP: {
        // whoops! flop forward, slide back down a little, lie there a moment, get up
        const u = p.t;
        if (u < 0.35) {
          p.belly = smooth(0, 0.35, u);
          p.pitch = p.belly * 1.45;
        } else if (u < 1.3) {
          p.ps = Math.max(0, p.ps - 1.8 * dt);
          p.flipOut = 1.1 + Math.sin(t * 20 + p.seed) * 0.5;
        } else if (u < 2.1) {
          p.flipOut = 0.5 + Math.sin(t * 3) * 0.2;
          p.headPitch = -0.6;
        } else {
          p.belly = 1 - smooth(2.1, 2.7, u);
          p.pitch = p.belly * 1.45;
          p.flipOut = 0.6;
        }
        samplePath(col.ascent, p.ps, pt);
        p.x = pt.x;
        p.z = pt.z;
        p.y = ground(p.x, p.z);
        p.roll = Math.sin(t * 9 + p.seed) * 0.12 * p.belly;
        if (u > 2.75) {
          p.belly = 0;
          p.pitch = 0;
          p.state = S_ASCEND;
          p.t = 0;
        }
        break;
      }
      case S_QUEUE: {
        const j = queueIndex(col, p);
        const q = queuePos(col, p.chute, Math.max(0, j));
        const there = walkTo(p, q.x, q.z, waddleSpeed(p) * 0.8, dt);
        // (queuePos and chuteDir share scratch objects: read what we need now)
        if (there) {
          idle(p, t, dt, kidX, kidZ, kidNear);
          const d = chuteDir(col, p.chute);
          p.yaw = turnTo(p.yaw, Math.atan2(d.dx, d.dz), 3, dt);
        } else walkPose(p, t, dt);
        const last = col.lastSlider[p.chute];
        const clear = last < 0 || P[last].state !== S_SLIDE || P[last].ps > 9;
        if (j === 0 && there && t - col.lastStart[p.chute] > 1.8 && clear && p.t > 1.2) {
          leaveQueue(col, p);
          col.lastStart[p.chute] = t;
          col.lastSlider[p.chute] = p.i;
          p.state = S_SLIDE;
          p.t = 0;
          p.path = col.slides[p.chute];
          // (from its spot just behind the start line: a run-up, then the flop)
          p.ps = -Math.hypot(p.x - col.slides[p.chute].x[0], p.z - col.slides[p.chute].z[0]);
          p.v = 1.2;
          emit(col, p.x, p.y + 0.2, p.z, 0.6, EV_PUFF);
        }
        break;
      }
      case S_SLIDE: {
        const S = col.slides[p.chute];
        samplePath(S, p.ps, pt);
        const vmax = p.kind === LITTLE ? 8.5 : 10;
        const a = 9.8 * pt.slope * 0.82 - 0.35 - 0.01 * p.v * p.v;
        p.v = clamp(p.v + a * dt, 1.4, vmax);
        // a little push with the feet on the flat bits
        if (pt.slope < 0.06 && p.v < 3.2) p.v += 1.2 * dt;
        const prevPs = p.ps;
        p.ps += p.v * dt;
        samplePath(S, p.ps, pt);
        // (before the start line, on the terrace: along the line the chute starts on)
        const pre = Math.min(0, p.ps);
        p.x = pt.x + pt.dx * pre;
        p.z = pt.z + pt.dz * pre;
        p.y = pt.y;
        p.yaw = turnTo(p.yaw, Math.atan2(pt.dx, pt.dz), 8, dt);
        p.belly = Math.min(1, p.belly + dt * 4);
        p.pitch = Math.PI / 2 + Math.atan(pt.slope) * 0.9;
        p.roll = Math.sin(t * 6 + p.seed) * 0.12;
        p.flipOut = 0.22;
        p.flipBack = 0.1;
        p.headPitch = -0.7;
        p.headYaw = Math.sin(t * 2 + p.seed) * 0.2;
        // snow spray
        if (Math.floor(prevPs / 3.5) !== Math.floor(p.ps / 3.5) && p.v > 3) emit(col, p.x, p.y + 0.1, p.z, 0.35 + p.v * 0.04, EV_PUFF);
        if (p.ps >= col.splashAt[p.chute]) {
          emit(col, p.x, WY, p.z, p.kind === LITTLE ? 0.8 : 1.2, EV_SPLASH);
          col.slides_done++;
          startSwim(col, p);
          p.v = Math.max(p.v * 0.7, 3.5);
        }
        break;
      }
      case S_SWIM:
      case S_FISH: {
        swimStep(col, p, t, dt);
        break;
      }
      case S_HOP: {
        // leap out of the water onto the beach
        const u = clamp(p.t / 0.8, 0, 1);
        const sx = p.dyn.x[0];
        const sz = p.dyn.z[0];
        const ex = p.dyn.x[1];
        const ez = p.dyn.z[1];
        p.x = sx + (ex - sx) * u;
        p.z = sz + (ez - sz) * u;
        const gy = ground(ex, ez);
        p.y = WY - 0.2 + (gy - WY + 0.2) * u + Math.sin(Math.PI * u) * (p.kind === LITTLE ? 0.7 : 0.9);
        p.yaw = turnTo(p.yaw, Math.atan2(ex - sx, ez - sz), 6, dt);
        p.belly = Math.max(0, 1 - u * 1.6);
        p.pitch = p.belly * 1.2 + (1 - p.belly) * 0.25 * (1 - u);
        p.flipOut = 0.9;
        p.flipBack = 0.25;
        p.headPitch = -0.3;
        p.under = false;
        if (u >= 1) {
          col.hops_done++;
          p.belly = 0;
          goHome(col, p, false);
        }
        break;
      }
      case S_WALKHOME: {
        if (p.slot < 0) p.slot = claimSlot(col, p, p.x, p.z, 99);
        const tx = p.slot >= 0 ? col.slotX[p.slot] : FROST_COLONY.x;
        const tz = p.slot >= 0 ? col.slotZ[p.slot] : FROST_COLONY.z;
        walkPose(p, t, dt);
        // (just out of the sea: a good shake of the flippers)
        if (p.role === ROLE_ACTIVE && p.t < 1.1) {
          p.flipOut = 1.0 + Math.sin(t * 22 + p.seed) * 0.5;
          p.roll += Math.sin(t * 26) * 0.1;
        }
        if (walkTo(p, tx, tz, waddleSpeed(p), dt)) {
          p.state = S_HOME;
          p.t = 0;
          p.dur = p.role === ROLE_PARENT ? 18 + col.rnd() * 25 : 10 + col.rnd() * 25;
          p.faceYaw = p.yaw;
        }
        break;
      }
      case S_HUDDLE: {
        // the huddle slowly turns: everyone shuffles round the middle, facing the same way
        const a = t * 0.025;
        const hx = col.huddleX[p.slot] - FROST_HUDDLE.x;
        const hz = col.huddleZ[p.slot] - FROST_HUDDLE.z;
        const tx = FROST_HUDDLE.x + hx * Math.cos(a) + hz * Math.sin(a);
        const tz = FROST_HUDDLE.z - hx * Math.sin(a) + hz * Math.cos(a);
        p.x += (tx - p.x) * Math.min(1, dt * 2);
        p.z += (tz - p.z) * Math.min(1, dt * 2);
        p.y = ground(p.x, p.z);
        p.yaw = turnTo(p.yaw, 2.2 + Math.sin(p.seed) * 0.25, 0.5, dt);
        standPose(p, dt);
        p.roll = Math.sin(t * 1.4 + p.seed) * 0.05;
        p.flipOut = 0.05;
        p.headPitch = 0.3 + Math.sin(t * 0.5 + p.seed) * 0.1;
        p.headYaw = Math.sin(t * 0.3 + p.seed) * 0.3;
        if (kidNear) p.headYaw = clamp(wrapA(Math.atan2(kidX - p.x, kidZ - p.z) - p.yaw), -1, 1);
        break;
      }
      case S_FOLLOW: {
        // a chick toddling after its parent (standing right by it when it stops)
        const par = P[p.parent];
        const moving = par.state === S_WALKHOME;
        const back = (moving ? 0.9 : 0.55) * SP;
        const side = (moving ? 0 : 0.35) * SP;
        const tx = par.x - Math.sin(par.yaw) * back + Math.cos(par.yaw) * side;
        const tz = par.z - Math.cos(par.yaw) * back - Math.sin(par.yaw) * side;
        const d = Math.hypot(tx - p.x, tz - p.z);
        if (d > 0.12) {
          walkPose(p, t, dt);
          walkTo(p, tx, tz, d > 1.5 ? 1.6 : 1.0, dt);
          p.flipOut = 0.5 + Math.sin(t * 9 + p.seed) * 0.2;
        } else {
          idle(p, t, dt, kidX, kidZ, kidNear);
          if (!kidNear) p.yaw = turnTo(p.yaw, Math.atan2(par.x - p.x, par.z - p.z), 2, dt);
          // (begging for food: head up at the parent now and then)
          if (Math.sin(t * 0.8 + p.seed) > 0.6) {
            p.headPitch = -0.7;
            p.flipOut = 0.6 + Math.sin(t * 14) * 0.3;
          }
        }
        break;
      }
      case S_CRECHE: {
        const tx = col.crecheX[p.slot] + Math.sin(t * 0.2 + p.seed) * 0.15;
        const tz = col.crecheZ[p.slot] + Math.cos(t * 0.17 + p.seed) * 0.15;
        p.x += (tx - p.x) * Math.min(1, dt);
        p.z += (tz - p.z) * Math.min(1, dt);
        p.y = ground(p.x, p.z);
        idle(p, t, dt, kidX, kidZ, kidNear);
        break;
      }
    }
  }
}

function swimStep(col: Colony, p: Penguin, t: number, dt: number) {
  p.under = true;
  const little = p.kind === LITTLE;
  const vWant = (little ? 5.0 : 4.2) + Math.sin(t * 0.7 + p.seed) * 0.5;
  p.v += (vWant - p.v) * Math.min(1, dt * 1.5);
  const floorAt = (x: number, z: number) => frostSeaFloorY(x, z) ?? -22;
  let hx: number;
  let hz: number;
  let wantY: number;
  let nearShore = false;
  if (p.state === S_FISH) {
    // loops round the bay, zig-zagging after fish, deep down
    const dir = p.seed % 2 ? 1 : -1;
    const r = FROST_FISHING.r * (0.55 + 0.45 * Math.sin(t * 0.23 + p.seed));
    const a = (t * p.v) / FROST_FISHING.r * dir + p.seed;
    const tx = FROST_FISHING.x + Math.sin(a) * r;
    const tz = FROST_FISHING.z + Math.cos(a) * r;
    hx = tx - p.x;
    hz = tz - p.z;
    wantY = WY - 1.6 - 2.4 * (0.5 + 0.5 * Math.sin(t * 0.8 + p.seed * 1.3));
    if (p.t > p.dur) {
      // done: head for the beach
      setLine(p.dyn, p.x, p.z, FROST_SHORE.entry.x + FROST_SHORE.side.x * p.lat * 3, FROST_SHORE.entry.z + FROST_SHORE.side.z * p.lat * 3);
      p.path = p.dyn;
      p.ps = 0;
      p.state = S_SWIM;
      p.fishing = false;
      p.t = 0;
    }
  } else {
    const path = p.path!;
    p.ps += p.v * dt;
    samplePath(path, p.ps + 2.5, pt);
    samplePath(path, p.ps, pt2);
    const lat = p.lat * 1.6 * Math.sin(p.ps * 0.12 + p.seed);
    hx = pt.x + pt.dz * lat - p.x;
    hz = pt.z - pt.dx * lat - p.z;
    nearShore = !p.fishing && path.len - p.ps < 7;
    wantY = WY - 0.55 - 0.45 * (0.5 + 0.5 * Math.sin(t * 1.7 + p.seed));
    const ex = path.x[path.n - 1] - p.x;
    const ez = path.z[path.n - 1] - p.z;
    if (ex * ex + ez * ez < (p.fishing ? 4 : 2.6) || p.ps >= path.len + 6) {
      if (p.fishing) {
        p.state = S_FISH;
        p.t = 0;
        p.dur = 16 + col.rnd() * 18;
      } else {
        // hop out onto the beach
        const side = p.lat * 3.5;
        const lx = FROST_SHORE.land.x + FROST_SHORE.side.x * side;
        const lz = FROST_SHORE.land.z + FROST_SHORE.side.z * side;
        setLine(p.dyn, p.x, p.z, lx, lz);
        p.state = S_HOP;
        p.t = 0;
        emit(col, p.x, WY, p.z, 0.45, EV_SPLISH);
        return;
      }
    }
  }
  // steer (fast turns: zippy)
  const want = Math.atan2(hx, hz);
  const zig = p.state === S_FISH ? Math.sin(t * 3.1 + p.seed) * 0.5 : 0;
  p.yaw = turnTo(p.yaw, want + zig, 4.5, dt);
  const ox = p.x;
  const oz = p.z;
  p.x += Math.sin(p.yaw) * p.v * dt;
  p.z += Math.cos(p.yaw) * p.v * dt;
  // porpoising: now and then a leap out of the water
  const floor = floorAt(p.x, p.z) + 0.35;
  let y: number;
  const oldY = p.y;
  if (p.state === S_SWIM && !nearShore) {
    p.leapT += dt;
    if (p.leapU < 0 && p.leapT > p.leapEvery && oldY > WY - 1.3) {
      p.leapU = 0;
      p.leapT = 0;
      p.leapY0 = oldY;
    }
  }
  if (p.leapU >= 0) {
    p.leapU += dt / 0.62;
    const u = Math.min(1, p.leapU);
    const base = p.leapY0 + (WY - 0.5 - p.leapY0) * Math.min(1, u * 3);
    y = base + Math.sin(Math.PI * u) * (little ? 0.95 : 1.2);
    if (u >= 1) {
      p.leapU = -1;
      p.leapEvery = 1.2 + ((p.seed * 13 + Math.floor(t)) % 9) * 0.2;
    }
  } else {
    y = p.y + (wantY - p.y) * Math.min(1, dt * 2.5);
  }
  y = Math.max(y, floor);
  // splashes crossing the surface, bubbles underwater
  const topNow = y + 0.2;
  const topWas = oldY + 0.2;
  if ((topWas < WY) !== (topNow < WY)) emit(col, p.x, WY, p.z, little ? 0.35 : 0.5, EV_SPLISH);
  else if (topNow < WY - 0.4 && Math.floor(t * 2.3 + p.seed) !== Math.floor((t - dt) * 2.3 + p.seed)) emit(col, p.x, y + 0.2, p.z, 0.3, EV_BUBBLES);
  const vy = (y - oldY) / Math.max(1e-3, dt);
  p.y = y;
  p.under = y + 0.2 < WY;
  const vh = Math.hypot(p.x - ox, p.z - oz) / Math.max(1e-3, dt);
  p.belly = 1;
  // (nose follows the climb/dive)
  p.pitch = Math.PI / 2 - clamp(Math.atan2(vy, Math.max(0.5, vh)), -0.9, 0.9);
  p.roll = clamp(wrapA(want - p.yaw) * 0.6, -0.7, 0.7) + Math.sin(t * 8 + p.seed) * 0.05;
  p.flipOut = 0.55 + Math.sin(t * 14 + p.seed) * 0.5;
  p.flipBack = 0.15;
  p.headPitch = -0.4;
  p.headYaw = 0;
}

/** the pose's body-root (feet) position for drawing: lifts / shifts the body when lying on its belly */
export function penguinRoot(p: Penguin, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const cy = CY[p.kind] * p.size;
  const br = BR[p.kind] * p.size;
  const b = p.belly;
  const s = Math.sin(p.pitch);
  const c = Math.cos(p.pitch);
  // lying: the belly touches the support height; the body's middle sits over (x, z)
  out.x = p.x - Math.sin(p.yaw) * cy * s * b;
  out.z = p.z - Math.cos(p.yaw) * cy * s * b;
  out.y = p.y + b * (br - cy * c);
  return out;
}

/** true for penguins that are part of the busy routine (not the huddle / crèche / chicks) */
export const isTraveller = (p: Penguin) => p.role === ROLE_ACTIVE;
