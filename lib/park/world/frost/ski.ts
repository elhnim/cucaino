// The Penguin Ski Run's skiers — pure maths, deterministic, allocation-free per step, no three.js
// (tested). Real penguins don't ski (they toboggan on their bellies) — Frostpeak's are just having
// fun. The loop:
//   queue     shuffling along the roped lane at the chairlift's bottom station
//   board     a little hop up onto the chair as it swings round behind them
//   lift      riding up, skis dangling, looking round at the view
//   unload    hopping off at the top
//   topwalk   skating over to the start gate's line
//   topq      waiting their turn at the start gate (they set off well spaced)
//   ski       carving S-turns down the slalom course, a spray of snow at every turn; some wobble
//   fall      ...and some fall over: a tumble, a slide off to the edge, a flail, back up, carry on
//   runout    gliding to a stop at the bottom and over to the lift
// Chairs seat two: the skiers ride up in pairs (the front two of the queue board together). The Park
// kid can ride the lift too (kidLift*: they wait on the boarding line, the next chair scoops them up,
// they hop off at the top), and the queue at the start gate stands in its own roped pen beside the
// gate, clear of the start line. Penguins standing about step aside for the kid (skiAside).
// The chicks have the nursery slope: snowploughing slowly down their own lane, then herringboning back
// up it, with an emperor coach watching (and flapping encouragement) at the bottom.
// Each skier is a penguin pose (./colony.ts PenguinPose: drawn by the same renderer) plus its skis.
// Queues are lanes (polylines) everyone shuffles along in order, so nobody ever cuts through anybody.
import { SKI_PEN, CHAIR_DROP, COURSE_AMP, COURSE_S0, COURSE_WAVE, FROST_SKI, LIFT_GAP, frostCableY, frostCourseLat, frostGroundY, frostLandY, frostRng, frostRunPoint } from "../../registry/frostIsland";
import { CHICK, EMPEROR, LITTLE, PENGUIN_K } from "./colony";

const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number) => {
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};
const wrapA = (a: number) => a - Math.round(a / TAU) * TAU;

export const K_QUEUE = 0;
export const K_BOARD = 1;
export const K_LIFT = 2;
export const K_UNLOAD = 3;
export const K_TOPWALK = 4;
export const K_TOPQ = 5;
export const K_SKI = 6;
export const K_FALL = 7;
export const K_RUNOUT = 8;
export const K_NDOWN = 9;
export const K_NUP = 10;
export const K_NREST = 11;
export const K_COACH = 12;
export const SKI_STATE_NAMES = ["queue", "board", "lift", "unload", "topwalk", "topq", "ski", "fall", "runout", "nursery-down", "nursery-up", "nursery-rest", "coach"];

export interface Skier {
  i: number;
  kind: number;
  size: number;
  seed: number;
  state: number;
  t: number;
  // the pose (./colony.ts PenguinPose)
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  belly: number;
  gx: number;
  gz: number;
  headYaw: number;
  headPitch: number;
  flipOut: number;
  flipBack: number;
  /** the skis: +1 snowplough (tips together), -1 herringbone (tails together), 0 parallel */
  splay: number;
  /** skis hanging down off the snow (riding the lift, tumbling) 0..1 */
  dangle: number;
  /** poles: how far each is swung forward (-1 back .. 1 planted ahead): left, right */
  poleL: number;
  poleR: number;
  /** on the piste: distance down it, offset from its centre (left +), speed */
  s: number;
  lat: number;
  v: number;
  /** its own line: a touch wider / narrower than the racing line, and a little offset */
  amp: number;
  off: number;
  /** this run: wobbly? falls at s (-1 = no) */
  wobble: boolean;
  fallAt: number;
  fallSide: number;
  /** riding: its chair, and which of its two seats (0 left, 1 right) */
  chair: number;
  seat: number;
  /** queueing: how far along its queue's lane (0 = the front) */
  qd: number;
  /** a nursery chick's lane; a runout's leg (0 to the queue's end) */
  lane: number;
  /** hops: from (ax, ay, az) to (bx, bz) */
  ax: number;
  az: number;
  ay: number;
  bx: number;
  bz: number;
  /** last turn's direction (for the spray at each turn) */
  turnSign: number;
  runs: number;
}

interface Lane {
  x: Float32Array;
  z: Float32Array;
  u: Float32Array;
  len: number;
}

export interface SkiField {
  skiers: Skier[];
  /** the lift's loop position of chair 0 */
  chairU: number;
  chairs: number;
  /** per chair, two seats: who's riding (chair c seat s at [c * 2 + s]; -1 empty, -2 the Park kid) */
  seatBy: Int16Array;
  /** the Park kid on the chairlift (see kidLiftRequest) */
  kid: KidLift;
  /** the Park kid on the piste: how far down (-99 = not skiing): the start gate holds the penguins */
  kidSkiS: number;
  /** how long the front of the lift queue has let chairs go by, waiting for a partner to ride with */
  pairWait: number;
  /** the chairs' world poses (for drawing): x, y, z, yaw */
  chairPose: Float32Array;
  /** the queues, front first */
  bottomQ: Int16Array;
  bqLen: number;
  topQ: Int16Array;
  tqLen: number;
  lastStart: number;
  /** when the last chair swept past the boarding line */
  lastChairAt: number;
  ev: { buf: Float32Array; n: number };
  rnd: () => number;
  time: number;
  /** stats (tests) */
  runsDone: number;
  falls: number;
  rides: number;
}

const P = FROST_SKI.piste;
const N = FROST_SKI.nursery;
const L = FROST_SKI.lift;
/** the lift's loop: up the right-hand line, round the top wheel, down the left, round the bottom */
const STRAIGHT = L.len + 2 * L.wheel;
const LOOP = 2 * STRAIGHT + TAU * LIFT_GAP;
export const LIFT_LOOP = LOOP;
/** lift speed (units/s) */
export const LIFT_V = 1.7;
/** chairs this far apart round the loop */
const CHAIR_GAP = 4.6;
/** where on the up line (distance from the bottom station) you board, and where you get off */
const BOARD_D = 0.5;
const UNLOAD_D = L.len - 0.8;
const LEFT = { x: L.dz, z: -L.dx };
const START_GAP = 3.4;
/** a chair's two seats sit this far either side of its middle (they fit two emperors side by side) */
export const SEAT_HALF = 0.6;
/** the chair's seat across (world units): wide enough for two */
export const CHAIR_W = 2.3;

// the Park kid on the chairlift
export const KL_NONE = 0;
export const KL_WAIT = 1;
export const KL_RIDE = 2;
export const KL_OFF = 3;
export const KL_DONE = 4;
export interface KidLift {
  state: number;
  chair: number;
  t: number;
  /** where the kid is (their feet / seat), facing */
  x: number;
  y: number;
  z: number;
  yaw: number;
  ax: number;
  ay: number;
  az: number;
  bx: number;
  bz: number;
}
const VMAX = [6.4, 5.8, 5.4];
/** spacing in the queues */
const QSP = 1.7;
const QV = 1.25;

const MAX_EV = 32;
const pt = { x: 0, z: 0, dx: 0, dz: 1 };
const pt2 = { x: 0, z: 0, dx: 0, dz: 1 };
const cp = { x: 0, y: 0, z: 0, yaw: 0 };
const qp = { x: 0, z: 0 };

function ground(x: number, z: number) {
  return frostGroundY(x, z) ?? frostLandY(x, z) ?? 3;
}
const GE = 0.5;
function slopeAt(k: Skier) {
  k.gx = (ground(k.x + GE, k.z) - ground(k.x - GE, k.z)) / (2 * GE);
  k.gz = (ground(k.x, k.z + GE) - ground(k.x, k.z - GE)) / (2 * GE);
}
function emit(f: SkiField, x: number, y: number, z: number, size: number, kind: number) {
  const e = f.ev;
  if (e.n >= MAX_EV) return;
  const o = e.n * 5;
  e.buf[o] = x;
  e.buf[o + 1] = y;
  e.buf[o + 2] = z;
  e.buf[o + 3] = size;
  e.buf[o + 4] = kind;
  e.n++;
}
const turnTo = (yaw: number, want: number, rate: number, dt: number) => yaw + clamp(wrapA(want - yaw), -rate * dt, rate * dt);

/** a point on the lift's loop (u in 0..LOOP): the chair's seat (x, y, z) and its facing */
export function liftPoint(u: number, out: { x: number; y: number; z: number; yaw: number }) {
  const w = ((u % LOOP) + LOOP) % LOOP;
  let d: number;
  let lat: number;
  let yaw: number;
  const upYaw = Math.atan2(L.dx, L.dz);
  if (w < STRAIGHT) {
    d = -L.wheel + w;
    lat = -LIFT_GAP;
    yaw = upYaw;
  } else if (w < STRAIGHT + Math.PI * LIFT_GAP) {
    const a = (w - STRAIGHT) / LIFT_GAP;
    d = L.len + L.wheel + Math.sin(a) * LIFT_GAP;
    lat = -Math.cos(a) * LIFT_GAP;
    yaw = upYaw - a;
  } else if (w < 2 * STRAIGHT + Math.PI * LIFT_GAP) {
    d = L.len + L.wheel - (w - STRAIGHT - Math.PI * LIFT_GAP);
    lat = LIFT_GAP;
    yaw = upYaw + Math.PI;
  } else {
    const a = (w - 2 * STRAIGHT - Math.PI * LIFT_GAP) / LIFT_GAP;
    d = -L.wheel - Math.sin(a) * LIFT_GAP;
    lat = Math.cos(a) * LIFT_GAP;
    yaw = upYaw + Math.PI - a;
  }
  out.x = L.b.x + L.dx * d + LEFT.x * lat;
  out.z = L.b.z + L.dz * d + LEFT.z * lat;
  out.y = frostCableY(d) - CHAIR_DROP;
  out.yaw = yaw;
  return out;
}

function makeLane(pts: { x: number; z: number }[]): Lane {
  const n = pts.length;
  const x = Float32Array.from(pts, (p) => p.x);
  const z = Float32Array.from(pts, (p) => p.z);
  const u = new Float32Array(n);
  for (let i = 1; i < n; i++) u[i] = u[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
  return { x, z, u, len: u[n - 1] };
}
function lanePoint(q: Lane, d: number, out: { x: number; z: number }) {
  const s = clamp(d, 0, q.len);
  let i = 1;
  while (i < q.u.length - 1 && q.u[i] < s) i++;
  const f = (s - q.u[i - 1]) / (q.u[i] - q.u[i - 1] || 1);
  out.x = q.x[i - 1] + (q.x[i] - q.x[i - 1]) * f;
  out.z = q.z[i - 1] + (q.z[i] - q.z[i - 1]) * f;
  return out;
}
/** a point by the lift: d along it from the bottom station, r to the right of its up line */
const byLift = (d: number, r: number) => ({ x: L.b.x + L.dx * d - LEFT.x * (LIFT_GAP + r), z: L.b.z + L.dz * d - LEFT.z * (LIFT_GAP + r) });
/** the bottom station's lane: from the boarding spot (on the up line, where the chairs scoop you up)
 *  out to the right, then back and forth in a little maze */
const BOTTOM_LANE = makeLane([byLift(BOARD_D, 0), byLift(BOARD_D, 1.5), byLift(-7, 1.5), byLift(-7, 3), byLift(BOARD_D, 3)]);
/** where the front of the bottom queue waits (beside the line) until a chair has just gone past */
const BOARD_WAIT = 1.5;
/** the start gate's lane: from the gate out to the right, then back along a second row */
const D0 = (() => {
  const dx = P.x[4] - P.x[0];
  const dz = P.z[4] - P.z[0];
  const l = Math.hypot(dx, dz);
  return { x: dx / l, z: dz / l };
})();
const byStart = (back: number, right: number) => ({ x: P.x[0] - D0.x * back - D0.z * right, z: P.z[0] - D0.z * back + D0.x * right });
/** (the queue stands in its own roped pen to the right of the start gate, not on the start line
 *  where the kid gets going: its front steps across onto the line only when it's that one's turn) */
export const PEN = SKI_PEN;
const TOP_LANE = makeLane([byStart(PEN.back0, PEN.right0), byStart(PEN.back0, PEN.right1), byStart(PEN.back1, PEN.right1), byStart(PEN.back1, PEN.right0)]);
/** the rope posts round the pen (world x, z), for the props */
export function skiPenPosts(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const b0 = PEN.back0 - 0.8;
  const b1 = PEN.back1 + 0.8;
  const r0 = PEN.right0 - 0.9;
  const r1 = PEN.right1 + 0.9;
  for (const [b, r] of [[b0, r0], [b0, (r0 + r1) / 2], [b0, r1], [b1, r1], [b1, (r0 + r1) / 2], [b1, r0]]) out.push(byStart(b, r));
  return out;
}
export const SKI_LANES = { bottom: BOTTOM_LANE, top: TOP_LANE };

export function skiCounts(low: boolean) {
  return low ? { emperors: 3, little: 2, chicks: 2 } : { emperors: 6, little: 4, chicks: 3 };
}

export function makeSkiField(low: boolean, seed = 4321): SkiField {
  const rnd = frostRng(seed);
  const C = skiCounts(low);
  const chairs = Math.max(8, Math.round(LOOP / CHAIR_GAP));
  const nR = C.emperors + C.little;
  const f: SkiField = {
    skiers: [],
    chairU: 0,
    chairs,
    seatBy: new Int16Array(chairs * 2).fill(-1),
    kid: { state: KL_NONE, chair: -1, t: 0, x: 0, y: 0, z: 0, yaw: 0, ax: 0, ay: 0, az: 0, bx: 0, bz: 0 },
    kidSkiS: -99,
    pairWait: 0,
    chairPose: new Float32Array(chairs * 4),
    bottomQ: new Int16Array(nR).fill(-1),
    bqLen: 0,
    topQ: new Int16Array(nR).fill(-1),
    tqLen: 0,
    lastStart: -99,
    lastChairAt: -99,
    ev: { buf: new Float32Array(MAX_EV * 5), n: 0 },
    rnd,
    time: 0,
    runsDone: 0,
    falls: 0,
    rides: 0,
  };
  const add = (kind: number, state: number) => {
    const k: Skier = {
      i: f.skiers.length,
      kind,
      size: PENGUIN_K[kind] * (kind === EMPEROR ? 0.94 + rnd() * 0.12 : 0.9 + rnd() * 0.2),
      seed: Math.floor(rnd() * 100000),
      state,
      t: 0,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      belly: 0,
      gx: 0,
      gz: 0,
      headYaw: 0,
      headPitch: 0,
      flipOut: 0.5,
      flipBack: 0.1,
      splay: 0,
      dangle: 0,
      poleL: 0,
      poleR: 0,
      s: 0,
      lat: 0,
      v: 0,
      amp: 0.85 + rnd() * 0.25,
      off: (rnd() - 0.5) * 0.5,
      wobble: false,
      fallAt: -1,
      fallSide: 1,
      chair: -1,
      seat: 0,
      qd: 0,
      lane: 0,
      ax: 0,
      az: 0,
      ay: 0,
      bx: 0,
      bz: 0,
      turnSign: 0,
      runs: 0,
    };
    f.skiers.push(k);
    return k;
  };
  const racers: Skier[] = [];
  for (let k = 0; k < C.emperors; k++) racers.push(add(EMPEROR, K_QUEUE));
  for (let k = 0; k < C.little; k++) racers.push(add(LITTLE, K_QUEUE));
  // spread round the loop from the first frame: some riding up, some at the top, some at the bottom
  let chairK = 2;
  racers.forEach((k, j) => {
    const u = j / racers.length;
    if (u < 0.35) {
      // (every other chair on the up line)
      const c = (chairK >> 1) % f.chairs;
      const st = chairK & 1;
      chairK += 1;
      f.seatBy[c * 2 + st] = k.i;
      k.chair = c;
      k.seat = st;
      k.state = K_LIFT;
    } else if (u < 0.65) {
      k.state = K_TOPQ;
      k.qd = f.tqLen * QSP;
      f.topQ[f.tqLen++] = k.i;
    } else {
      k.state = K_QUEUE;
      k.qd = BOARD_WAIT + f.bqLen * QSP;
      f.bottomQ[f.bqLen++] = k.i;
    }
  });
  // nursery chicks, one lane each, and their coach
  for (let k = 0; k < C.chicks; k++) {
    const ch = add(CHICK, K_NDOWN);
    ch.lane = (k - (C.chicks - 1) / 2) * 1.35;
    ch.s = (k / C.chicks) * N.len * 0.8;
    ch.t = rnd() * 2;
  }
  add(EMPEROR, K_COACH);
  // (the up line runs from the bottom: put chair 0 just past boarding so the riders spread upward)
  f.chairU = L.wheel + BOARD_D + 1;
  for (const k of f.skiers) place(f, k);
  return f;
}

/** put a skier where its state says (used at the start) */
function place(f: SkiField, k: Skier) {
  if (k.state === K_LIFT) {
    seatPos(f, k);
    k.dangle = 1;
    return;
  }
  if (k.state === K_TOPQ) {
    lanePoint(TOP_LANE, k.qd, qp);
    k.yaw = Math.atan2(D0.x, D0.z);
  } else if (k.state === K_QUEUE) {
    lanePoint(BOTTOM_LANE, k.qd, qp);
    k.yaw = Math.atan2(L.dx, L.dz);
  } else if (k.state === K_NDOWN) {
    frostRunPoint(N, k.s, k.lane, pt);
    qp.x = pt.x;
    qp.z = pt.z;
    k.yaw = Math.atan2(pt.dx, pt.dz);
  } else {
    // the coach: just past the nursery's bottom, off to its side, watching
    frostRunPoint(N, N.len, 0, pt);
    qp.x = pt.x + pt.dx * 2.2 - pt.dz * 1.8;
    qp.z = pt.z + pt.dz * 2.2 + pt.dx * 1.8;
    k.yaw = Math.atan2(-pt.dx, -pt.dz);
  }
  k.x = qp.x;
  k.z = qp.z;
  k.y = ground(k.x, k.z);
  slopeAt(k);
}

/** where seat `seat` of a chair is as it sweeps past the boarding line (the boarder stands under it) */
function boardSpot(seat: number, out: { x: number; z: number }) {
  liftPoint(L.wheel + BOARD_D, cp);
  const o = seatSide(cp.yaw, seat);
  out.x = cp.x + Math.cos(cp.yaw) * o;
  out.z = cp.z - Math.sin(cp.yaw) * o;
  return out;
}

/** did chair c sweep past loop position `at` this step (from prevU) */
function crossed(f: SkiField, prevU: number, c: number, at: number) {
  const a = (prevU + c * (LOOP / f.chairs)) % LOOP;
  const b = chairAt(f, c);
  return a <= b ? a < at && b >= at : a < at || b >= at;
}

/** chair c's place on the loop */
const chairAt = (f: SkiField, c: number) => (f.chairU + c * (LOOP / f.chairs)) % LOOP;

/** the across-the-chair direction (to seat 1's side) for a chair facing yaw */
const seatSide = (yaw: number, seat: number) => (seat ? 1 : -1) * SEAT_HALF;
function seatPos(f: SkiField, k: Skier) {
  liftPoint(chairAt(f, k.chair), cp);
  const o = seatSide(cp.yaw, k.seat);
  k.x = cp.x + Math.cos(cp.yaw) * o;
  k.z = cp.z - Math.sin(cp.yaw) * o;
  k.y = cp.y + 0.02;
  k.yaw = cp.yaw;
  k.gx = k.gz = 0;
}

/** start a fresh run: wobbly? a fall? */
function newRun(f: SkiField, k: Skier) {
  k.wobble = f.rnd() < 0.3;
  k.fallAt = f.rnd() < 0.22 ? P.len * (0.3 + f.rnd() * 0.45) : -1;
  k.amp = 0.85 + f.rnd() * 0.25;
}

function poseStand(k: Skier, t: number, dt: number) {
  const e = Math.min(1, dt * 6);
  k.belly += (0 - k.belly) * e;
  k.pitch += (0.06 - k.pitch) * e;
  k.roll += (0 - k.roll) * e;
  k.flipOut = 0.35 + Math.sin(t * 1.3 + k.seed) * 0.04;
  k.flipBack = 0.05;
  k.headPitch = Math.sin(t * 0.6 + k.seed) * 0.08;
  k.headYaw = Math.sin(t * 0.4 + k.seed) * 0.4;
  k.poleL += (0 - k.poleL) * e;
  k.poleR += (0 - k.poleR) * e;
  k.dangle += (0 - k.dangle) * e;
  k.splay += (0 - k.splay) * e;
}

/** step towards (tx, tz) on skis; true when there */
function glideTo(k: Skier, tx: number, tz: number, v: number, dt: number): boolean {
  const dx = tx - k.x;
  const dz = tz - k.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.06) return true;
  const st = Math.min(d, v * dt);
  k.x += (dx / d) * st;
  k.z += (dz / d) * st;
  if (d > 0.3) k.yaw = turnTo(k.yaw, Math.atan2(dx, dz), 4, dt);
  return d - st < 0.06;
}

/** waiting to join a full queue: how many others in the same spot got there first (each waits a space further out) */
function waitRank(S: Skier[], k: Skier) {
  let w = 0;
  for (let j = 0; j < S.length; j++) {
    const o = S[j];
    if (o !== k && o.state === k.state && o.lane === 0 && (o.t > k.t || (o.t === k.t && o.i < k.i))) w++;
  }
  return w;
}

/** is someone else already stepping into this queue's end */
function stepping(S: Skier[], k: Skier) {
  for (let j = 0; j < S.length; j++) if (S[j] !== k && S[j].state === k.state && S[j].lane === 1) return true;
  return false;
}

/** shuffle a queue along its lane: in order, a space apart, the front held at `hold` */
function shuffle(f: SkiField, Q: Int16Array, j0: number, n: number, lane: Lane, hold: number, faceYaw: number, t: number, dt: number) {
  const S = f.skiers;
  let prev = -Infinity;
  for (let j = j0; j < n; j++) {
    const k = S[Q[j]];
    const want = Math.max(j === j0 ? hold : 0, prev + QSP);
    const before = k.qd;
    if (k.qd > want) k.qd = Math.max(want, k.qd - QV * dt);
    prev = k.qd;
    lanePoint(lane, k.qd, qp);
    const moving = Math.abs(k.qd - before) > 1e-4;
    const dx = qp.x - k.x;
    const dz = qp.z - k.z;
    k.x = qp.x;
    k.z = qp.z;
    k.y = ground(k.x, k.z);
    poseStand(k, t, dt);
    if (moving) {
      k.yaw = turnTo(k.yaw, Math.atan2(dx, dz), 5, dt);
      k.roll = Math.sin(t * 6 + k.seed) * 0.1;
      k.poleL = Math.sin(t * 6 + k.seed);
      k.poleR = -k.poleL;
    } else k.yaw = turnTo(k.yaw, faceYaw, 2, dt);
  }
}
function dequeue(f: SkiField, Q: Int16Array, which: "b" | "t") {
  const n = which === "b" ? f.bqLen : f.tqLen;
  for (let j = 1; j < n; j++) Q[j - 1] = Q[j];
  Q[n - 1] = -1;
  if (which === "b") f.bqLen--;
  else f.tqLen--;
}

/** where a racer is on the piste: (s, lat) -> x, z; returns the heading of its line */
function onPiste(k: Skier) {
  const sAhead = k.s + 0.7;
  frostRunPoint(P, k.s, k.lat, pt);
  const lat2 = frostCourseLat(sAhead) * k.amp + k.off;
  frostRunPoint(P, sAhead, lat2, pt2);
  if (k.s < 0) {
    // (behind the start line: on the line the piste sets off along)
    pt.x = P.x[0] + D0.x * k.s + D0.z * k.lat;
    pt.z = P.z[0] + D0.z * k.s - D0.x * k.lat;
  }
  k.x = pt.x;
  k.z = pt.z;
  return Math.atan2(pt2.x - pt.x, pt2.z - pt.z);
}

/**
 * Advance the ski field by dt at time t. `kid` = the Park kid (or null far away): skiers slow down and
 * swerve round a kid on the piste. Clears and refills `f.ev` (kind 2 = snow spray).
 */
export function stepSkiField(f: SkiField, dtIn: number, t: number, kid: { x: number; z: number } | null): void {
  const dt = clamp(dtIn, 0, 0.1);
  f.time = t;
  f.ev.n = 0;
  const S = f.skiers;
  // the lift turns
  const prevU = f.chairU;
  f.chairU = (f.chairU + LIFT_V * dt) % LOOP;
  for (let c = 0; c < f.chairs; c++) {
    liftPoint(chairAt(f, c), cp);
    f.chairPose[c * 4] = cp.x;
    f.chairPose[c * 4 + 1] = cp.y;
    f.chairPose[c * 4 + 2] = cp.z;
    f.chairPose[c * 4 + 3] = cp.yaw;
  }
  const boardU = L.wheel + BOARD_D;
  const unloadU = L.wheel + UNLOAD_D;

  // the next chair to reach the boarding line: how long until it does
  let nextIn = Infinity;
  for (let c = 0; c < f.chairs; c++) nextIn = Math.min(nextIn, ((boardU - chairAt(f, c) + LOOP) % LOOP) / LIFT_V);
  for (let c = 0; c < f.chairs; c++) {
    if (crossed(f, prevU, c, unloadU)) {
      for (let st = 0; st < 2; st++) {
        const who = f.seatBy[c * 2 + st];
        if (who === -2) {
          // the Park kid hops off (forward, out to the right, past where the penguins land)
          const kl = f.kid;
          f.seatBy[c * 2 + st] = -1;
          kl.state = KL_OFF;
          kl.t = 0;
          kl.chair = -1;
          kl.ax = kl.x;
          kl.ay = kl.y;
          kl.az = kl.z;
          kl.bx = kl.x + L.dx * 1.4 - LEFT.x * 4.2;
          kl.bz = kl.z + L.dz * 1.4 - LEFT.z * 4.2;
          continue;
        }
        if (who < 0) continue;
        const k = S[who];
        f.seatBy[c * 2 + st] = -1;
        k.state = K_UNLOAD;
        k.t = 0;
        k.chair = -1;
        k.ax = k.x;
        k.az = k.z;
        k.ay = k.y;
        // (hop off forward and out to the right, clear of the chairs swinging round the wheel; the
        // pair side by side)
        const out = st ? 1.8 : 3.2;
        k.bx = k.x + L.dx * 0.6 - LEFT.x * out;
        k.bz = k.z + L.dz * 0.6 - LEFT.z * out;
      }
    }
    if (crossed(f, prevU, c, boardU)) {
      f.lastChairAt = t;
      const free = f.seatBy[c * 2] === -1 && f.seatBy[c * 2 + 1] === -1;
      if (free && f.kid.state === KL_WAIT && f.kid.t > 0.6 && !(f.bqLen && S[f.bottomQ[0]].state === K_BOARD)) {
        // the Park kid's turn: this chair's theirs (they sit in the middle, a seat each side free)
        f.seatBy[c * 2] = -2;
        f.seatBy[c * 2 + 1] = -3;
        f.kid.chair = c;
        f.kid.state = KL_RIDE;
        f.kid.t = 0;
      } else if (free) {
        // the front two board together
        for (let j = 0; j < 2 && f.bqLen; j++) {
          const k = S[f.bottomQ[0]];
          if (k.state !== K_BOARD) break;
          f.seatBy[c * 2 + k.seat] = k.i;
          k.chair = c;
          k.state = K_LIFT;
          k.t = 0;
          f.rides++;
          dequeue(f, f.bottomQ, "b");
        }
      }
    }
    // (the kid's chair: once it's round the top wheel its empty seat marker clears)
    if (f.seatBy[c * 2 + 1] === -3 && f.seatBy[c * 2] !== -2) f.seatBy[c * 2 + 1] = -1;
  }
  // the bottom queue: the front steps onto the boarding line just after a chair has gone by
  const front = f.bqLen ? S[f.bottomQ[0]] : null;
  const go = front !== null && front.state === K_QUEUE && (front.qd < BOARD_WAIT - 0.01 || (t - f.lastChairAt < 0.5 && nextIn > 1.6));
  const kidBoarding = f.kid.state === KL_WAIT;
  // (chairs seat two: if someone's on their way along the queue, or gliding in from a run, the front
  // lets a chair or two go by so they can ride up together)
  if (front && front.state === K_QUEUE && front.qd < 0.02) f.pairWait += dt;
  let partnerComing = false;
  if (f.bqLen > 1 && S[f.bottomQ[1]].state === K_QUEUE && S[f.bottomQ[1]].qd >= QSP + 0.15) partnerComing = true;
  if (f.bqLen === 1) for (let j = 0; j < S.length; j++) if (S[j].state === K_RUNOUT) partnerComing = true;
  const waitForPartner = partnerComing && f.pairWait < 7;
  if (front && front.state === K_QUEUE && front.qd < 0.02 && nextIn < 0.45 && !kidBoarding && !waitForPartner) {
    f.pairWait = 0;
    front.state = K_BOARD;
    front.t = 0;
    front.ay = front.y;
    front.ax = front.x;
    front.az = front.z;
    // (the front takes the far seat; the one behind, coming in from the lane on the right, the near one)
    front.seat = 1;
    // ...and the one behind steps up beside them (chairs seat two)
    const second = f.bqLen > 1 ? S[f.bottomQ[1]] : null;
    if (second && second.state === K_QUEUE && second.qd < QSP + 0.15) {
      second.state = K_BOARD;
      second.t = 0;
      second.ay = second.y;
      second.ax = second.x;
      second.az = second.z;
      second.seat = 0;
    }
  }
  if (f.bqLen) {
    // (shuffle everyone but the boarding front pair)
    let b0 = 0;
    while (b0 < f.bqLen && b0 < 2 && S[f.bottomQ[b0]].state === K_BOARD) b0++;
    shuffle(f, f.bottomQ, b0, f.bqLen, BOTTOM_LANE, b0 ? QSP * b0 : go && !kidBoarding ? 0 : BOARD_WAIT + (kidBoarding ? QSP : 0), Math.atan2(L.dx, L.dz), t, dt);
  }
  // the top queue: off we go when the front's at the gate, the top of the piste is clear, a gap since the last
  let busy = false;
  for (let j = 0; j < S.length; j++) {
    const o = S[j];
    if ((o.state === K_SKI || o.state === K_FALL) && o.s < 8) busy = true;
  }
  if (f.kidSkiS > -50 && f.kidSkiS < 10) busy = true;
  if (f.tqLen) {
    const k = S[f.topQ[0]];
    if (k.qd < 0.02 && !busy && t - f.lastStart > START_GAP && k.t > 1) {
      dequeue(f, f.topQ, "t");
      f.lastStart = t;
      k.state = K_SKI;
      k.t = 0;
      k.s = -PEN.back0;
      k.lat = -PEN.right0;
      k.v = 1.2;
      k.turnSign = 0;
      newRun(f, k);
      emit(f, k.x, k.y + 0.05, k.z, 0.45, 2);
    }
    shuffle(f, f.topQ, 0, f.tqLen, TOP_LANE, 0, Math.atan2(D0.x, D0.z), t, dt);
  }

  for (let i = 0; i < S.length; i++) {
    const k = S[i];
    k.t += dt;
    switch (k.state) {
      case K_QUEUE:
      case K_TOPQ:
        // (moved by shuffle)
        k.splay = 0;
        break;
      case K_BOARD: {
        // a hop up onto the seat as it swings in behind (it scoops us up at the line)
        const u = clamp(k.t / 0.45, 0, 1);
        const seatY = frostCableY(BOARD_D) - CHAIR_DROP + 0.02;
        boardSpot(k.seat, qp);
        k.x = k.ax + (qp.x - k.ax) * Math.min(1, u * 1.6);
        k.z = k.az + (qp.z - k.az) * Math.min(1, u * 1.6);
        k.y = k.ay + (seatY - k.ay) * u + Math.sin(Math.PI * u) * 0.35;
        k.flipOut = 0.9;
        k.dangle = u;
        k.gx = k.gz = 0;
        break;
      }
      case K_LIFT: {
        seatPos(f, k);
        k.pitch += (-0.1 - k.pitch) * Math.min(1, dt * 4);
        k.roll = Math.sin(t * 1.3 + k.seed) * 0.04;
        k.belly = 0;
        k.flipOut = 0.25 + Math.sin(t * 0.8 + k.seed) * 0.05;
        k.headYaw = Math.sin(t * 0.35 + k.seed) * 0.9;
        k.headPitch = 0.1;
        k.dangle += (1 - k.dangle) * Math.min(1, dt * 4);
        k.poleL = k.poleR = -0.6;
        break;
      }
      case K_UNLOAD: {
        const u = clamp(k.t / 0.5, 0, 1);
        k.x = k.ax + (k.bx - k.ax) * u;
        k.z = k.az + (k.bz - k.az) * u;
        const gy = ground(k.bx, k.bz);
        k.y = Math.max(ground(k.x, k.z), k.ay + (gy - k.ay) * u + Math.sin(Math.PI * u) * 0.3);
        k.dangle = 1 - u;
        k.flipOut = 0.9;
        k.gx = k.gz = 0;
        if (u >= 1) {
          k.y = gy;
          k.state = K_TOPWALK;
          k.t = 0;
          emit(f, k.x, k.y + 0.05, k.z, 0.4, 2);
        }
        break;
      }
      case K_TOPWALK: {
        // skate over to just behind the end of the start gate's line, wait for room, step in
        const last = f.tqLen ? S[f.topQ[f.tqLen - 1]] : null;
        const room = !last || last.qd < TOP_LANE.len - QSP;
        lanePoint(TOP_LANE, TOP_LANE.len, qp);
        const w = k.lane === 0 ? waitRank(S, k) : 0;
        const ax = k.lane === 0 ? qp.x - D0.x * (1.6 + 1.4 * w) : qp.x;
        const az = k.lane === 0 ? qp.z - D0.z * (1.6 + 1.4 * w) : qp.z;
        const there = glideTo(k, ax, az, 1.6, dt);
        k.y = ground(k.x, k.z);
        poseStand(k, t, dt);
        k.roll = Math.sin(t * 6 + k.seed) * 0.12;
        k.poleL = Math.sin(t * 6 + k.seed);
        k.poleR = -k.poleL;
        if (there && k.lane === 0 && room && !stepping(S, k)) k.lane = 1;
        else if (there && k.lane === 1 && room) {
          k.lane = 0;
          k.state = K_TOPQ;
          k.t = 0;
          k.qd = TOP_LANE.len;
          f.topQ[f.tqLen++] = k.i;
        }
        break;
      }
      case K_SKI: {
        // gravity down the fall line, a bit of snow friction and air drag
        frostRunPoint(P, k.s, 0, pt);
        const i0 = Math.max(0, Math.min(P.u.length - 2, Math.floor(k.s)));
        const slope = k.s < 0 ? 0 : (P.y[i0] - P.y[i0 + 1]) / (P.u[i0 + 1] - P.u[i0] || 1);
        const vmax = VMAX[k.kind] * (k.wobble ? 0.85 : 1);
        k.v = clamp(k.v + (9.8 * slope * 0.55 - 0.35 - 0.025 * k.v * k.v + (k.s < 0 ? 1.5 : 0)) * dt, 0.8, vmax);
        // keep a safe gap behind anyone ahead on our line (and slow for the Park kid)
        for (let j = 0; j < S.length; j++) {
          const o = S[j];
          if (o === k || (o.state !== K_SKI && o.state !== K_FALL)) continue;
          const ds = o.s - k.s;
          if (ds > 0 && ds < 5.5 && Math.abs(o.lat - k.lat) < 1.15) k.v = Math.min(k.v, Math.max(0.6, (ds - 2.4) * 1.6));
        }
        let dodge = 0;
        if (kid) {
          const dx = kid.x - k.x;
          const dz = kid.z - k.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 16) {
            k.v = Math.min(k.v, 1.5 + Math.sqrt(d2) * 0.6);
            // (swerve away: which side of us is the kid on?)
            const side = dx * pt.dz - dz * pt.dx;
            dodge = (side > 0 ? -1 : 1) * 1.6 * (1 - Math.sqrt(d2) / 4);
          }
        }
        const prevS = k.s;
        k.s += k.v * dt;
        // follow its line through the gates (easing back onto it after a fall)
        const want = clamp(frostCourseLat(k.s) * k.amp + k.off + dodge, -(P.hw - 0.7), P.hw - 0.7);
        k.lat += (want - k.lat) * Math.min(1, dt * 5);
        const head = onPiste(k);
        k.y = ground(k.x, k.z);
        slopeAt(k);
        const prevYaw = k.yaw;
        k.yaw = turnTo(k.yaw, head, 6, dt);
        // lean into the turn (the yaw rate at this speed), crouched forward, poles swinging to plant
        const yawRate = wrapA(k.yaw - prevYaw) / Math.max(dt, 1e-3);
        const lean = -clamp(Math.atan((k.v * yawRate) / 9.8) * 1.1, -0.5, 0.5);
        k.roll += (lean - k.roll) * Math.min(1, dt * 8);
        const ph = ((k.s - COURSE_S0) / COURSE_WAVE) * TAU;
        if (k.wobble) {
          k.roll += Math.sin(t * 9 + k.seed) * 0.16;
          k.flipOut = 0.9 + Math.sin(t * 13 + k.seed) * 0.5;
        } else k.flipOut = 0.62;
        k.pitch += (0.22 - k.pitch) * Math.min(1, dt * 5);
        k.belly += (0 - k.belly) * Math.min(1, dt * 5);
        k.flipBack = 0.15;
        k.headPitch = -0.15;
        k.headYaw = clamp(wrapA(head - k.yaw) * 1.5, -0.6, 0.6);
        k.poleL = Math.cos(ph);
        k.poleR = -Math.cos(ph);
        k.splay = 0;
        k.dangle = 0;
        // a spray of snow off the outside ski at every turn
        const turn = Math.sign(Math.cos(ph));
        if (k.s > 2 && turn !== k.turnSign) {
          // (a big fan of snow off the outside ski: kind 4, see ./fx.ts)
          const sx = Math.cos(k.yaw) * -turn * 0.5;
          const sz = -Math.sin(k.yaw) * -turn * 0.5;
          emit(f, k.x + sx, k.y + 0.08, k.z + sz, 0.9 + k.v * 0.12, 4);
        }
        k.turnSign = turn;
        if (k.fallAt > 0 && prevS < k.fallAt && k.s >= k.fallAt) {
          k.state = K_FALL;
          k.t = 0;
          k.fallSide = k.lat >= 0 ? 1 : -1;
          f.falls++;
          emit(f, k.x, k.y + 0.1, k.z, 0.8, 2);
        }
        if (k.s >= P.len - 1) {
          k.state = K_RUNOUT;
          k.t = 0;
          k.lane = 0;
          k.runs++;
          f.runsDone++;
          emit(f, k.x, k.y + 0.05, k.z, 0.6, 2);
        }
        break;
      }
      case K_FALL: {
        // whoops! a tumble onto its tummy, a slide off to the edge, a flail... and back up
        const u = k.t;
        k.v = Math.max(0, k.v - 5 * dt);
        k.s += k.v * dt;
        const edge = k.fallSide * (COURSE_AMP + 1.7);
        k.lat += (edge - k.lat) * Math.min(1, dt * 2.5);
        onPiste(k);
        k.y = ground(k.x, k.z);
        slopeAt(k);
        if (u < 0.4) k.belly = smooth(0, 0.4, u);
        else if (u > 2.0) k.belly = 1 - smooth(2.0, 2.6, u);
        const down = -(k.gx * Math.sin(k.yaw) + k.gz * Math.cos(k.yaw));
        k.pitch = k.belly * (Math.PI / 2 - 0.1 + Math.atan(down));
        k.roll = Math.sin(t * 8 + k.seed) * 0.15 * k.belly;
        k.flipOut = u > 0.4 && u < 2 ? 1.1 + Math.sin(t * 18 + k.seed) * 0.5 : 0.7;
        k.headPitch = -0.6;
        k.dangle = k.belly;
        k.poleL = 1;
        k.poleR = -1;
        // (back up - but it only steps back onto the course when nobody's coming past)
        let clearToGo = true;
        for (let j = 0; j < S.length; j++) {
          const o = S[j];
          if (o !== k && o.state === K_SKI && Math.abs(o.s - k.s) < 5) clearToGo = false;
        }
        if (u > 2.7 && !clearToGo) k.t = 2.68;
        else if (u > 2.7) {
          k.belly = 0;
          k.state = K_SKI;
          k.t = 0;
          k.v = 1;
          k.fallAt = -1;
        }
        break;
      }
      case K_RUNOUT: {
        // glide to a stop, round the outside of the lift's lane to its end, and join the queue
        k.v = Math.max(1.4, k.v - 2.2 * dt);
        // (never into the back of one who got there first)
        for (let j = 0; j < S.length; j++) {
          const o = S[j];
          if (o === k || o.state !== K_RUNOUT || o.t < k.t) continue;
          const d = Math.hypot(o.x - k.x, o.z - k.z);
          if (d < 2.4) k.v = Math.min(k.v, Math.max(0, (d - 1.3) * 1.5));
        }
        lanePoint(BOTTOM_LANE, BOTTOM_LANE.len, qp);
        // (wait out to the side of the lane's end until there's room)
        const w = k.lane === 0 ? waitRank(S, k) : 0;
        const tx = k.lane === 0 ? qp.x - LEFT.x * (2.6 + 1.4 * w) + L.dx * 0.8 : qp.x;
        const tz = k.lane === 0 ? qp.z - LEFT.z * (2.6 + 1.4 * w) + L.dz * 0.8 : qp.z;
        const there = glideTo(k, tx, tz, k.v, dt);
        k.y = ground(k.x, k.z);
        poseStand(k, t, dt);
        k.roll = Math.sin(t * 5 + k.seed) * 0.08;
        const last = f.bqLen ? S[f.bottomQ[f.bqLen - 1]] : null;
        const room = !last || last.qd < BOTTOM_LANE.len - QSP;
        if (there && k.lane === 0 && room && !stepping(S, k)) k.lane = 1;
        else if (there && k.lane === 1) {
          if (room) {
            k.state = K_QUEUE;
            k.t = 0;
            k.qd = BOTTOM_LANE.len;
            f.bottomQ[f.bqLen++] = k.i;
          }
        }
        break;
      }
      case K_NDOWN: {
        // snowploughing slowly down its lane, flippers out for balance, a wobble now and then
        k.v = 0.75 + Math.sin(t * 0.7 + k.seed) * 0.15;
        k.s += k.v * dt;
        frostRunPoint(N, k.s, k.lane + Math.sin(k.s * 0.9 + k.seed) * 0.25, pt);
        k.x = pt.x;
        k.z = pt.z;
        k.y = ground(k.x, k.z);
        slopeAt(k);
        k.yaw = turnTo(k.yaw, Math.atan2(pt.dx, pt.dz), 3, dt);
        k.splay = 1;
        k.belly = 0;
        k.pitch = 0.12;
        k.roll = Math.sin(t * 3.1 + k.seed) * 0.14;
        k.flipOut = 1.0 + Math.sin(t * 7 + k.seed) * 0.25;
        k.headPitch = 0.25;
        k.headYaw = 0;
        k.dangle = 0;
        if (k.s >= N.len - 0.3) {
          k.state = K_NREST;
          k.t = 0;
          k.s = N.len - 0.3;
          k.bx = 0; // (resting at the bottom)
        }
        break;
      }
      case K_NREST: {
        poseStand(k, t, dt);
        k.splay = k.bx ? -1 : 1;
        // (a happy flap: did it!)
        if (k.t < 1) k.flipOut = 0.9 + Math.sin(t * 16 + k.seed) * 0.5;
        if (k.t > 2.2) {
          k.t = 0;
          if (k.bx) {
            k.state = K_NDOWN;
            k.s = 0.2;
          } else k.state = K_NUP;
        }
        break;
      }
      case K_NUP: {
        // herringboning back up: skis in a V, slow little steps
        k.s -= 0.5 * dt;
        frostRunPoint(N, k.s, k.lane, pt);
        k.x = pt.x;
        k.z = pt.z;
        k.y = ground(k.x, k.z);
        slopeAt(k);
        k.yaw = turnTo(k.yaw, Math.atan2(-pt.dx, -pt.dz), 3, dt);
        k.splay = -1;
        k.pitch = 0.15;
        k.roll = Math.sin(t * 5 + k.seed) * 0.16;
        k.belly = 0;
        k.flipOut = 0.55 + Math.sin(t * 5 + k.seed) * 0.15;
        k.headPitch = 0.1;
        if (k.s <= 0.2) {
          k.state = K_NREST;
          k.t = 0;
          k.bx = 1;
        }
        break;
      }
      case K_COACH: {
        poseStand(k, t, dt);
        // watching the chicks, flapping now and then
        let cx = 0;
        let cz = 0;
        let n = 0;
        for (let j = 0; j < S.length; j++)
          if (S[j].kind === CHICK) {
            cx += S[j].x;
            cz += S[j].z;
            n++;
          }
        if (n) k.yaw = turnTo(k.yaw, Math.atan2(cx / n - k.x, cz / n - k.z), 1, dt);
        if (Math.sin(t * 0.7 + k.seed) > 0.65) {
          k.flipOut = 0.9 + Math.sin(t * 14) * 0.5;
          k.headPitch = -0.5;
        }
        break;
      }
    }
    if (k.state === K_QUEUE || k.state === K_TOPQ || k.state === K_TOPWALK || k.state === K_RUNOUT || k.state === K_COACH || k.state === K_NREST) slopeAt(k);
  }
  // (skaters off the lift / out of a run never skate through each other)
  for (let a = 0; a < S.length; a++) {
    const A = S[a];
    if (A.state !== K_TOPWALK && A.state !== K_RUNOUT) continue;
    for (let b = 0; b < S.length; b++) {
      const B = S[b];
      const still = B.state === K_UNLOAD || B.state === K_TOPQ || B.state === K_QUEUE || B.state === K_BOARD;
      if (B === A || (B.state !== K_TOPWALK && B.state !== K_RUNOUT && !still) || (B.state === A.state && b < a)) continue;
      const dx = A.x - B.x;
      const dz = A.z - B.z;
      const d = Math.hypot(dx, dz);
      const r = (A.size + B.size) * 0.36;
      if (d < r && d > 1e-4) {
        const push = r - d;
        const share = still ? 1 : 0.5;
        A.x += (dx / d) * push * share;
        A.z += (dz / d) * push * share;
        if (share < 1) {
          B.x -= (dx / d) * push * 0.5;
          B.z -= (dz / d) * push * 0.5;
          B.y = ground(B.x, B.z);
        }
        A.y = ground(A.x, A.z);
      }
    }
  }
  stepKidLift(f, dt);
}

// ── the Park kid on the chairlift ──

/** where the kid waits to be scooped up (on the boarding line, under the chair's middle) */
export function kidLiftSpot(out = { x: 0, z: 0 }) {
  liftPoint(L.wheel + BOARD_D, cp);
  out.x = cp.x;
  out.z = cp.z;
  return out;
}
/** standing by the lift's bottom station, near the boarding line? (the HUD offers "🚡 Chairlift") */
export function kidLiftOffer(x: number, z: number): boolean {
  kidLiftSpot(qp);
  return (x - qp.x) ** 2 + (z - qp.z) ** 2 < 3.2 * 3.2;
}
/** the kid steps onto the boarding line: the next free chair scoops them up */
export function kidLiftRequest(f: SkiField, x: number, z: number): boolean {
  if (f.kid.state !== KL_NONE && f.kid.state !== KL_DONE) return false;
  const kl = f.kid;
  kl.state = KL_WAIT;
  kl.t = 0;
  kl.ax = x;
  kl.az = z;
  kl.ay = ground(x, z);
  return true;
}
/** back to normal (riding done, or called off) */
export function kidLiftReset(f: SkiField) {
  for (let i = 0; i < f.seatBy.length; i++) if (f.seatBy[i] <= -2) f.seatBy[i] = -1;
  f.kid.state = KL_NONE;
  f.kid.chair = -1;
}
function stepKidLift(f: SkiField, dt: number) {
  const kl = f.kid;
  if (kl.state === KL_NONE || kl.state === KL_DONE) return;
  kl.t += dt;
  if (kl.state === KL_WAIT) {
    // walk onto the boarding line, turn uphill, wait for the chair
    kidLiftSpot(qp);
    const u = clamp(kl.t / 0.6, 0, 1);
    kl.x = kl.ax + (qp.x - kl.ax) * u;
    kl.z = kl.az + (qp.z - kl.az) * u;
    kl.y = ground(kl.x, kl.z);
    kl.yaw = Math.atan2(L.dx, L.dz);
  } else if (kl.state === KL_RIDE) {
    liftPoint(chairAt(f, kl.chair), cp);
    kl.x = cp.x;
    kl.z = cp.z;
    // (the seat: a little lift from the boarding line as the chair swings in under the kid)
    const s0 = ground(cp.x, cp.z);
    kl.y = kl.t < 0.45 ? s0 + (cp.y - s0) * (kl.t / 0.45) : cp.y;
    kl.yaw = cp.yaw;
  } else if (kl.state === KL_OFF) {
    const u = clamp(kl.t / 0.7, 0, 1);
    kl.x = kl.ax + (kl.bx - kl.ax) * u;
    kl.z = kl.az + (kl.bz - kl.az) * u;
    const gy = ground(kl.bx, kl.bz);
    kl.y = Math.max(ground(kl.x, kl.z), kl.ay + (gy - kl.ay) * u + Math.sin(Math.PI * u) * 0.5);
    if (u >= 1) {
      kl.y = gy;
      kl.state = KL_DONE;
      emit(f, kl.x, kl.y + 0.05, kl.z, 0.7, 2);
      for (let i = 0; i < f.seatBy.length; i++) if (f.seatBy[i] <= -2) f.seatBy[i] = -1;
    }
  }
}

/** is skier k standing about (queues, walking to them, resting), so it can step aside for the kid */
export function skierStands(k: Skier): boolean {
  return k.state === K_QUEUE || k.state === K_TOPQ || k.state === K_TOPWALK || k.state === K_RUNOUT || k.state === K_COACH || k.state === K_NREST;
}

/** for tests: the skiers' kind constants */
export const SKI_KINDS = { EMPEROR, CHICK, LITTLE };
