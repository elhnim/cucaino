// How Cucaino Park's land animals behave — pure maths, deterministic, allocation-free, no three.js
// (tested). Every animal is a flat `Agent`; `stepFauna` moves the whole population one frame:
//
//   - grazers (deer, rabbits, goats, cows, horses, foxes, hedgehogs) graze, look round, amble to
//     a new spot near their herd leader or home, and keep a comfortable distance from the kid:
//     a running kid startles them (deer bound into the woods, rabbits dart for the trees, horses
//     canter off round the paddock, hedgehogs curl up); a kid standing still draws the curious
//     ones (rabbits, horses, goats, cows, ducks, bear cubs, fox kits) slowly closer
//   - squirrels forage by their tree, dash across the path to their other tree and scamper up
//     and down the trunks; owls sit in the trees at night, turning their heads to follow the kid
//   - the duck family paddles on the pond and now and then waddles ashore, ducklings in a line
//   - frogs hop along the stream banks at twilight and plop away when the kid comes close
//   - the bears fish at the stream (swipes, standing up to look round, waving at the kid) while
//     the cubs tumble about; turtles plod across a trail and pull their heads in when approached
//   - day / night: owls, hedgehogs and frogs come out at dusk; rabbits and deer are out most at
//     dawn and dusk; horses, cows, goats and ducks sleep at night; squirrels and bears turn in
// Animals may walk on trails and meadows; they never step into the sea, the stream or the lands,
// and never walk through the kid.
import { POND } from "../../registry/island";
import { groundY } from "../../registry/terrain";
import { noise2 } from "../fantasy/noise";
import { B_BLOCK, B_LAND, B_OPEN, B_POND, bitsAt, slopeOf, type WalkGrid } from "./ground";
import { canopyOf } from "./plan";
import {
  K_BEAR,
  K_COW,
  K_DEER,
  K_DUCK,
  K_FOX,
  K_FROG,
  K_GOAT,
  K_HEDGEHOG,
  K_HORSE,
  K_OWL,
  K_RABBIT,
  K_SQUIRREL,
  K_TURTLE,
  RUN_SPEED,
  R_CUB,
  R_DUCKLING,
  R_HEN,
  R_KIT,
  R_MOTHER,
  R_ROAMER,
  R_VIXEN,
  S_ASHORE,
  S_CANTER,
  S_CLIMB_DOWN,
  S_CLIMB_UP,
  S_CROSS,
  S_CURIOUS,
  S_CURL,
  S_FISH,
  S_FLEE,
  S_HIDE,
  S_HOP,
  S_IDLE,
  S_IN_TREE,
  S_PLAY,
  S_POUNCE,
  S_SLEEP,
  S_WALK,
  TUNE,
  inPaddock,
  paddockPoint,
  type Agent,
  type KidSense,
  type Paddock,
  type TreeLite,
  type Tune,
} from "./types";

const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const wrapAngle = (a: number) => a - Math.round(a / TAU) * TAU;
/** move `cur` toward `to` by at most `step` */
const toward = (cur: number, to: number, step: number) => (cur < to ? Math.min(to, cur + step) : Math.max(to, cur - step));
/** exponential ease */
const ease = (cur: number, to: number, k: number) => cur + (to - cur) * (k > 1 ? 1 : k);

export interface FaunaEnv {
  g: WalkGrid;
  trees: TreeLite[];
  paddock: Paddock | null;
  agents: Agent[];
  /** pond shore points (x, z pairs) */
  shores: Float32Array;
}

/** the animal's own xorshift (deterministic, allocation-free) */
export function rnd(a: Agent): number {
  let s = a.rs | 0;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  a.rs = s >>> 0 || 1;
  return a.rs / 4294967296;
}

// ── schedules ──

/** is it out and about now (else it goes to its burrow / den / tree / the water) */
export function activeNow(a: Agent, glow: number): boolean {
  switch (a.kind) {
    case K_OWL:
    case K_HEDGEHOG:
    case K_FROG:
      return glow > 0.3 + a.shy * 0.35;
    case K_DEER:
    case K_RABBIT: {
      // out most at dawn and dusk (the golden, half-glowing light)
      const dusk = clamp(1 - Math.abs(glow - 0.55) / 0.45, 0, 1);
      return a.shy < 0.6 + 0.45 * dusk;
    }
    case K_SQUIRREL:
      return glow < 0.7 + a.shy * 0.2;
    case K_BEAR:
      return glow < 0.82 + a.shy * 0.12;
    default:
      return true;
  }
}

/** asleep where it stands (or lies) */
export function sleepyNow(a: Agent, glow: number): boolean {
  switch (a.kind) {
    case K_HORSE:
    case K_COW:
    case K_GOAT:
    case K_DUCK:
      return glow > 0.8 + a.shy * 0.12;
    case K_DEER:
      return glow > 0.9;
    case K_TURTLE:
      return glow > 0.75;
    default:
      return false;
  }
}

// ── movement ──

export function passable(env: FaunaEnv, a: Agent, x: number, z: number): boolean {
  const b = bitsAt(env.g, x, z);
  if (a.kind === K_DUCK) {
    const dx = x - POND.x;
    const dz = z - POND.z;
    const d2 = dx * dx + dz * dz;
    if (b & B_POND) return true;
    if (d2 < (POND.r + 0.35) * (POND.r + 0.35)) return true; // the muddy rim
    if (!(b & B_LAND)) return false;
    return d2 < (POND.r + 6.5) * (POND.r + 6.5) && slopeOf(env.g, x, z) < 0.5;
  }
  if (!(b & B_LAND)) return false;
  // (squirrels run right up to their trunks)
  if (b & B_BLOCK && a.kind !== K_SQUIRREL) return false;
  const T = TUNE[a.kind];
  if (slopeOf(env.g, x, z) > T.maxSlope) return false;
  const p = env.paddock;
  if (a.kind === K_HORSE) return p ? inPaddock(p, x, z, 0.9 * a.s) : true;
  if (T.open && !(b & B_OPEN)) return false;
  if (p && inPaddock(p, x, z, -0.7)) return false; // everyone else stays outside the fence
  const dx = x - a.hx;
  const dz = z - a.hz;
  return dx * dx + dz * dz < a.leash * a.leash;
}

const SIDESTEP = [0, 0.5, -0.5, 1.1, -1.1, 1.8, -1.8, 2.6, -2.6];

/** step forward (sidestepping round whatever's in the way); false if boxed in */
export function moveFwd(env: FaunaEnv, a: Agent, dist: number): boolean {
  if (dist <= 0) return true;
  for (let k = 0; k < SIDESTEP.length; k++) {
    const yaw = a.yaw + SIDESTEP[k];
    const nx = a.x + Math.sin(yaw) * dist;
    const nz = a.z + Math.cos(yaw) * dist;
    if (passable(env, a, nx, nz)) {
      a.x = nx;
      a.z = nz;
      if (k) a.yaw += SIDESTEP[k] * 0.2;
      return true;
    }
  }
  return false;
}

function turnTo(a: Agent, want: number, rate: number, dt: number) {
  const d = wrapAngle(want - a.yaw);
  a.yaw = wrapAngle(a.yaw + clamp(d, -rate * dt, rate * dt));
}

/** walk / run toward (tx, tz): remaining distance, or -1 if boxed in */
export function goTo(env: FaunaEnv, a: Agent, tx: number, tz: number, speed: number, dt: number, turn = TUNE[a.kind].turn): number {
  const dx = tx - a.x;
  const dz = tz - a.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.15) {
    a.v = ease(a.v, 0, dt * 6);
    return d;
  }
  const want = Math.atan2(dx, dz);
  turnTo(a, want, turn, dt);
  const facing = Math.cos(wrapAngle(want - a.yaw));
  const target = speed * clamp(facing * 1.3, 0.12, 1) * Math.min(1, d / 0.9 + 0.25);
  a.v = ease(a.v, target, dt * 4);
  if (!moveFwd(env, a, Math.min(a.v * dt, d))) {
    a.v = 0;
    return -1;
  }
  return d;
}

/** the kid's personal space: an animal never ends a step inside it */
function avoidKid(env: FaunaEnv, a: Agent, kid: KidSense) {
  if (!kid.ground) return;
  const R = TUNE[a.kind].body * a.s + 0.8;
  const dx = a.x - kid.x;
  const dz = a.z - kid.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= R * R) return;
  const d = Math.sqrt(d2) || 1e-3;
  const ux = d2 > 1e-8 ? dx / d : Math.sin(a.yaw);
  const uz = d2 > 1e-8 ? dz / d : Math.cos(a.yaw);
  // straight out, else round either side
  for (let k = 0; k < 5; k++) {
    const ang = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.7;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const vx = ux * c + uz * s;
    const vz = -ux * s + uz * c;
    const nx = kid.x + vx * R;
    const nz = kid.z + vz * R;
    if (passable(env, a, nx, nz)) {
      a.x = nx;
      a.z = nz;
      return;
    }
  }
}

const kidDist = (a: Agent, kid: KidSense) => {
  const dx = a.x - kid.x;
  const dz = a.z - kid.z;
  return Math.sqrt(dx * dx + dz * dz);
};
const kidYaw = (a: Agent, kid: KidSense) => Math.atan2(kid.x - a.x, kid.z - a.z);

// ── pose targets (set by each behaviour, eased by `finish`) ──
let hp = 0; // head pitch
let hy = 0; // head yaw
let pp = 0; // body pitch (on top of the slope)
let tk = 0; // tuck
let lf = 0; // lift
let rl = 0; // roll
let fw = 0; // forward shift
let slopeFit = true;
let lookKid = false;

function resetPose() {
  hp = 0;
  hy = 0;
  pp = 0;
  tk = 0;
  lf = 0;
  rl = 0;
  fw = 0;
  slopeFit = true;
  lookKid = false;
}

/** ears flick now and then, tails swish (deterministic noise pulses) */
function flick(t: number, seed: number, ch: number): number {
  const p = noise2(t * 0.55, seed * 1.3, 40 + ch);
  return p > 0.72 ? Math.sin(t * 34 + seed) * ((p - 0.72) / 0.28) : 0;
}

function pickWander(env: FaunaEnv, a: Agent, dusk: number) {
  const L = a.lead >= 0 ? env.agents[a.lead] : null;
  let cx = a.hx;
  let cz = a.hz;
  let r = a.hr;
  if (L && L.present > 0.5) {
    cx = L.x;
    cz = L.z;
    r = a.kind === K_DEER ? (L.kind === K_DEER && L.lead >= 0 ? 2.4 : 5) : a.kind === K_COW || a.kind === K_HORSE ? 3.5 : 3;
  } else if (a.kind === K_DEER) {
    // deer come out into the meadow at dawn / dusk, keep to the forest edge by day
    cx += a.ax * (dusk * 8 - 1);
    cz += a.az * (dusk * 8 - 1);
  }
  if (a.kind === K_HORSE && env.paddock) {
    const p = env.paddock;
    paddockPoint(p, (rnd(a) * 2 - 1) * (p.hw - 2), (rnd(a) * 2 - 1) * (p.hd - 2), tmpP);
    a.tx = tmpP.x;
    a.tz = tmpP.z;
    if (L && L.present > 0.5) {
      a.tx = L.x + (rnd(a) - 0.5) * 4;
      a.tz = L.z + (rnd(a) - 0.5) * 4;
    }
    return;
  }
  for (let k = 0; k < 6; k++) {
    const ang = rnd(a) * TAU;
    const d = Math.sqrt(rnd(a)) * r;
    const x = cx + Math.sin(ang) * d;
    const z = cz + Math.cos(ang) * d;
    if (passable(env, a, x, z)) {
      a.tx = x;
      a.tz = z;
      return;
    }
  }
  a.tx = a.hx;
  a.tz = a.hz;
}
const tmpP = { x: 0, z: 0 };

function pickFlee(a: Agent, kid: KidSense) {
  const T = TUNE[a.kind];
  let dx = a.x - kid.x;
  let dz = a.z - kid.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  dx /= d;
  dz /= d;
  // into the woods if they're not back past the kid
  const wx = a.kind === K_RABBIT ? a.ax : a.cx;
  const wz = a.kind === K_RABBIT ? a.az : a.cz;
  const woods = a.kind === K_RABBIT || a.kind === K_DEER || a.kind === K_FOX;
  if (woods) {
    const ex = wx - a.x;
    const ez = wz - a.z;
    const el = Math.sqrt(ex * ex + ez * ez);
    if (el > 1 && (ex * dx + ez * dz) / el > -0.1 && el < T.fleeDist * 1.6) {
      a.tx = wx + (rnd(a) - 0.5) * 3;
      a.tz = wz + (rnd(a) - 0.5) * 3;
      return;
    }
  }
  const side = (rnd(a) - 0.5) * 0.9;
  const c = Math.cos(side);
  const s = Math.sin(side);
  a.tx = a.x + (dx * c + dz * s) * T.fleeDist;
  a.tz = a.z + (-dx * s + dz * c) * T.fleeDist;
}

/** gait bookkeeping: legs cycle with distance travelled */
function gait(a: Agent, T: Tune, dt: number, boundAt: number) {
  const len = T.stride * a.s;
  a.phase += ((a.v * dt) / Math.max(0.05, len)) * TAU;
  if (a.phase > 4000) a.phase -= TAU * 600;
  const st = T.walk > 0 ? clamp((a.v / T.walk) * 0.85, 0, 1.5) : 0;
  a.stride = ease(a.stride, st, dt * 8);
  a.bound = ease(a.bound, a.v > boundAt ? 1 : 0, dt * 4);
}

/** a common "look round / at the kid / graze" head */
function headFor(a: Agent, kid: KidSense, t: number, grazing: boolean) {
  const T = TUNE[a.kind];
  if (lookKid || (a.alert > 0.3 && kid.ground)) {
    hy = clamp(wrapAngle(kidYaw(a, kid) - a.yaw), -1.3, 1.3);
    hp = -0.2 * a.alert;
  } else if (grazing) {
    hp = T.graze * (0.85 + Math.max(0, Math.sin(t * 2.1 + a.seed * 3)) * 0.12);
    hy = (noise2(t * 0.2, a.seed, 3) - 0.5) * 0.6;
    // now and then it lifts its head to look round
    if (noise2(t * 0.13, a.seed, 4) > 0.7) {
      hp = -0.1;
      hy = (noise2(t * 0.35, a.seed, 5) - 0.5) * 2.2;
    }
  } else {
    hp = 0.05 + a.stride * 0.1;
    hy = (noise2(t * 0.3, a.seed, 6) - 0.5) * 0.5;
  }
}

// ── grazers: deer, rabbits, foxes, hedgehogs, horses, goats, cows ──

function stepGrazer(env: FaunaEnv, a: Agent, kid: KidSense, dt: number, t: number, glow: number) {
  const T = TUNE[a.kind];
  const dk = kidDist(a, kid);
  let active = activeNow(a, glow);
  // fox kits dive into the den when the kid comes near (but peek out if they stand still a while)
  if (a.kind === K_FOX && a.role === R_KIT && kid.ground && dk < (kid.still > 5 ? 4.5 : 10)) active = false;
  const running = kid.ground && kid.speed > RUN_SPEED;
  const fleeR = a.role === R_VIXEN ? 6 : T.fleeR;
  const scared = running && dk < fleeR;
  a.calm = scared ? 0 : a.calm + dt;
  a.alert = ease(a.alert, kid.ground && dk < T.noticeR ? (kid.speed > 0.5 ? 1 : 0.6) : 0, dt * 2.5);
  const dusk = clamp(1 - Math.abs(glow - 0.55) / 0.45, 0, 1);

  if (!active && a.st !== S_HIDE && a.st !== S_FLEE) a.st = S_HIDE;
  let grazing = false;
  switch (a.st) {
    case S_HIDE: {
      if (active) {
        a.want = 1;
        if (a.present > 0.95) {
          a.st = S_IDLE;
          a.tm = 1 + rnd(a) * 2;
        }
        a.v = 0;
        break;
      }
      const r = goTo(env, a, a.cx, a.cz, (a.kind === K_FOX && a.role === R_KIT ? T.run * 0.7 : T.walk * 1.8), dt);
      if ((r >= 0 && r < 0.6) || r < 0) {
        a.want = 0;
        a.v = 0;
      }
      break;
    }
    case S_FLEE: {
      a.tm -= dt;
      const r = goTo(env, a, a.tx, a.tz, T.run, dt);
      if (r < 0) pickFlee(a, kid);
      else if (r < 0.8 || a.tm <= 0) {
        if (!scared) {
          a.st = S_IDLE;
          a.tm = T.idleMin + rnd(a) * (T.idleMax - T.idleMin);
        } else pickFlee(a, kid);
      }
      break;
    }
    case S_CURIOUS: {
      if (!kid.ground || kid.still < 0.6 || dk > T.curiousR * 1.4) {
        a.st = S_IDLE;
        a.tm = 2 + rnd(a) * 3;
        break;
      }
      lookKid = true;
      const stop = T.stopR + T.body * a.s;
      if (dk > stop + 0.2) {
        const k = (dk - stop) / dk;
        // (a fence or the water's edge in the way: it just stands there and looks)
        if (goTo(env, a, a.x + (kid.x - a.x) * k, a.z + (kid.z - a.z) * k, T.walk * 0.6, dt) < 0) a.v = 0;
      } else {
        a.v = ease(a.v, 0, dt * 4);
        turnTo(a, kidYaw(a, kid), T.turn * 0.4, dt);
        // a friendly sniff
        hp = 0.25 + Math.max(0, Math.sin(t * 3 + a.seed)) * 0.15;
      }
      break;
    }
    case S_SLEEP: {
      a.v = ease(a.v, 0, dt * 3);
      if (a.kind !== K_HORSE) tk = 0.85;
      hp = a.kind === K_HORSE ? 0.75 : 0.35;
      if (!sleepyNow(a, glow)) {
        a.st = S_IDLE;
        a.tm = 2 + rnd(a) * 2;
      }
      break;
    }
    case S_CURL: {
      // hedgehog: a spiky ball until the kid goes away
      a.v = 0;
      tk = 1;
      hp = 0.9;
      a.tm -= dt;
      if (a.tm <= 0 && dk > 3.5 && !scared) {
        a.st = S_IDLE;
        a.tm = 1.5 + rnd(a) * 2;
      }
      break;
    }
    case S_POUNCE: {
      // a fox's mouse-jump: up, nose down, into the grass
      a.tm -= dt;
      const u = 1 - clamp(a.tm / 0.85, 0, 1);
      lf = Math.sin(Math.PI * u) * 0.55 * a.s;
      pp = -0.5 + u * 1.1;
      slopeFit = false;
      a.v = 1.6 * a.s;
      moveFwd(env, a, a.v * dt);
      if (a.tm <= 0) {
        a.st = S_IDLE;
        a.tm = 1.5 + rnd(a) * 2;
        a.v = 0;
      }
      break;
    }
    case S_CANTER: {
      // horses: a lap or two round the paddock
      const p = env.paddock;
      a.tm -= dt;
      if (!p || sleepyNow(a, glow) || (a.tm <= 0 && noise2(t * 0.02, a.group * 7.1, 5) < 0.76)) {
        a.st = S_IDLE;
        a.tm = 2 + rnd(a) * 3;
        break;
      }
      const c = Math.cos(p.rot);
      const s = Math.sin(p.rot);
      const lx = (a.x - p.x) * c - (a.z - p.z) * s;
      const lz = (a.x - p.x) * s + (a.z - p.z) * c;
      const th = Math.atan2(lx / p.hw, lz / p.hd) + 0.55;
      paddockPoint(p, Math.sin(th) * (p.hw - 2.2), Math.cos(th) * (p.hd - 2.2), tmpP);
      goTo(env, a, tmpP.x, tmpP.z, T.run * (a.role === R_KIT ? 0.8 : 0.72), dt);
      break;
    }
    case S_WALK: {
      a.tm -= dt;
      const sp = a.kind === K_FOX && a.role === R_KIT ? T.run * 0.55 : T.walk;
      const r = goTo(env, a, a.tx, a.tz, sp, dt);
      if (r < 0 || r < 0.45 || a.tm <= 0) {
        a.st = S_IDLE;
        a.tm = T.idleMin + rnd(a) * (T.idleMax - T.idleMin);
        if (a.kind === K_FOX && a.role === R_KIT) a.tm *= 0.4;
      }
      break;
    }
    case S_PLAY:
    default: {
      a.st = S_IDLE;
      a.v = ease(a.v, 0, dt * 3);
      grazing = a.kind !== K_FOX || a.role === R_ROAMER;
      a.tm -= dt;
      // followers keep up with their leader
      const L = a.lead >= 0 ? env.agents[a.lead] : null;
      if (L && L.present > 0.5) {
        const lx = L.x - a.x;
        const lz = L.z - a.z;
        if (lx * lx + lz * lz > 49) a.tm = 0;
      }
      if (a.tm <= 0) {
        if (a.kind === K_FOX && rnd(a) < (a.role === R_KIT ? 0.45 : 0.3)) {
          a.st = S_POUNCE;
          a.tm = 0.85;
        } else {
          pickWander(env, a, dusk);
          a.st = S_WALK;
          a.tm = 25;
        }
      }
      break;
    }
  }

  // what makes it change its mind
  if (a.st !== S_HIDE && a.present > 0.5) {
    if (a.kind === K_HEDGEHOG) {
      if (a.st !== S_CURL && kid.ground && (dk < 2.6 || scared)) {
        a.st = S_CURL;
        a.tm = 4 + rnd(a) * 3;
      }
    } else if (scared && a.st !== S_FLEE) {
      a.st = S_FLEE;
      a.tm = 2.5 + rnd(a) * 2;
      if (a.kind === K_HORSE) {
        a.st = S_CANTER;
        a.tm = 5;
      } else pickFlee(a, kid);
    } else if (a.st === S_IDLE || a.st === S_WALK) {
      const curiousType = T.curiousR > 0 && (a.shy < 0.55 || a.kind === K_HORSE || a.kind === K_COW);
      if (curiousType && kid.ground && kid.still > 2.5 && dk < T.curiousR && dk > T.stopR + T.body * a.s + 0.6 && a.calm > 5) a.st = S_CURIOUS;
      else if (sleepyNow(a, glow)) a.st = S_SLEEP;
      else if (a.kind === K_HORSE && env.paddock && noise2(t * 0.02, a.group * 7.1, 5) > 0.82) {
        a.st = S_CANTER;
        a.tm = 0;
      }
    }
  }

  // pose
  if (a.st !== S_CURIOUS && a.st !== S_SLEEP && a.st !== S_CURL) headFor(a, kid, t, grazing);
  const bounder = a.kind === K_DEER || a.kind === K_RABBIT || a.kind === K_HORSE || a.kind === K_GOAT;
  gait(a, T, dt, bounder ? T.walk * 2.4 : 1e9);
  if (a.kind === K_RABBIT) {
    // rabbits always hop
    a.bound = 1;
    lf += Math.abs(Math.sin(a.phase * 0.5)) * 0.2 * a.s * Math.min(1, a.stride * 1.4);
    if (a.st === S_IDLE && a.alert > 0.5) pp = -0.35; // sits up, ears high
  } else if (a.kind === K_DEER) lf += Math.abs(Math.sin(a.phase * 0.5)) * 0.32 * a.s * a.bound;
  else if (a.kind === K_HORSE || a.kind === K_GOAT) lf += Math.abs(Math.sin(a.phase * 0.5)) * 0.12 * a.s * a.bound;
  a.ear = flick(t, a.seed, 0) * 0.6 + (a.alert > 0.5 ? Math.sin(t * 1.3 + a.seed) * 0.1 : 0);
  if (a.kind === K_HORSE || a.kind === K_COW) a.tail = Math.sin(t * 1.7 + a.seed) * 0.35 + flick(t, a.seed, 1) * 0.5;
  else if (a.kind === K_FOX) a.tail = Math.sin(t * 2.2 + a.seed) * 0.18 + a.stride * Math.sin(a.phase) * 0.15;
  else if (a.kind === K_GOAT || a.kind === K_DEER) a.tail = flick(t, a.seed, 1) * 0.5;
  else a.tail = 0;
  // deer flash their white tails when startled; goats and foxes carry theirs up
  a.tailLift = a.kind === K_DEER ? (a.st === S_FLEE || a.alert > 0.8 ? 1.1 : 0) : a.kind === K_FOX ? 0.15 + a.bound * 0.3 : a.kind === K_GOAT ? 0.4 : 0;
}

// ── squirrels ──

function trunkR(t: TreeLite) {
  return 0.24 * t.s;
}
function climbTop(t: TreeLite) {
  const c = canopyOf(t.kind);
  return (c.cy - c.ry * 0.78) * t.s * t.sy - 0.15 * t.s;
}

function stepSquirrel(env: FaunaEnv, a: Agent, kid: KidSense, dt: number, t: number, glow: number) {
  const T = TUNE[K_SQUIRREL];
  const tree = a.tree >= 0 ? env.trees[a.tree] : null;
  const dk = kidDist(a, kid);
  const active = activeNow(a, glow);
  const bother = kid.ground && dk < T.fleeR && kid.speed > 0.8;
  a.alert = ease(a.alert, kid.ground && dk < T.noticeR ? 1 : 0, dt * 3);
  slopeFit = false;
  if (!tree) {
    a.want = 0;
    return;
  }
  const baseY = tree.y - 0.15 * tree.s;
  const R = trunkR(tree) + 0.05;
  const onGround = a.st !== S_CLIMB_UP && a.st !== S_IN_TREE && a.st !== S_CLIMB_DOWN;
  if (onGround && (!active || bother) && a.st !== S_FLEE) {
    a.st = S_FLEE; // run for the trunk
  }
  switch (a.st) {
    case S_FLEE:
    case S_HIDE: {
      const ang = Math.atan2(a.x - tree.x, a.z - tree.z);
      const r = goTo(env, a, tree.x + Math.sin(ang) * (R + 0.15), tree.z + Math.cos(ang) * (R + 0.15), T.run, dt, 12);
      if ((r >= 0 && r < 0.3) || r < 0) {
        a.st = S_CLIMB_UP;
        a.climb = 0;
        a.act = ang;
      }
      break;
    }
    case S_CLIMB_UP: {
      a.v = 0;
      a.climb += dt * (bother ? 2.2 : 1.3);
      a.act += dt * 0.9;
      pp = -Math.PI / 2 + 0.12;
      a.yaw = a.act + Math.PI;
      a.stride = 1;
      a.phase += dt * 14;
      a.bound = 1;
      if (a.climb >= climbTop(tree)) {
        a.st = S_IN_TREE;
        a.want = 0;
        a.tm = 5 + rnd(a) * 10;
      }
      break;
    }
    case S_IN_TREE: {
      pp = -Math.PI / 2;
      a.stride = 0;
      a.tm -= dt;
      if (a.tm <= 0 && active && !(kid.ground && dk < 6)) {
        a.st = S_CLIMB_DOWN;
        a.want = 1;
      }
      break;
    }
    case S_CLIMB_DOWN: {
      if (a.present < 0.9) break;
      a.climb -= dt * 1.1;
      a.act -= dt * 0.7;
      pp = Math.PI / 2 - 0.12;
      a.yaw = a.act;
      a.stride = 1;
      a.phase += dt * 12;
      if (bother) {
        a.st = S_CLIMB_UP;
        break;
      }
      if (a.climb <= 0.02) {
        a.climb = 0;
        a.x = tree.x + Math.sin(a.act) * (R + 0.45);
        a.z = tree.z + Math.cos(a.act) * (R + 0.45);
        if (!passable(env, a, a.x, a.z)) {
          a.x = tree.x + Math.sin(a.act) * (R + 0.2);
          a.z = tree.z + Math.cos(a.act) * (R + 0.2);
        }
        a.yaw = a.act;
        a.st = S_IDLE;
        a.tm = 1 + rnd(a) * 2;
        a.act = 0;
      }
      break;
    }
    case S_CROSS: {
      // dash across the path to the other tree
      const other = env.trees[a.tree2];
      const r = goTo(env, a, other.x + (a.x - other.x) * 0.1, other.z + (a.z - other.z) * 0.1, T.run * 0.85, dt, 10);
      const dx = a.x - other.x;
      const dz = a.z - other.z;
      if (r < 0 || dx * dx + dz * dz < (trunkR(other) + 1.4) ** 2) {
        const k = a.tree;
        a.tree = a.tree2;
        a.tree2 = k;
        a.hx = other.x;
        a.hz = other.z;
        a.st = rnd(a) < 0.6 ? S_FLEE : S_IDLE; // (often straight up the new tree)
        a.tm = 1;
      }
      break;
    }
    case S_WALK: {
      const r = goTo(env, a, a.tx, a.tz, T.walk, dt, 10);
      if (r < 0 || r < 0.2) {
        a.st = S_IDLE;
        a.tm = T.idleMin + rnd(a) * (T.idleMax - T.idleMin);
      }
      break;
    }
    default: {
      a.st = S_IDLE;
      a.v = ease(a.v, 0, dt * 8);
      a.tm -= dt;
      // sits up nibbling, tail flicking
      pp = -0.45;
      hp = 0.2 + Math.max(0, Math.sin(t * 9 + a.seed)) * 0.2;
      if (a.tm <= 0) {
        a.act += 1;
        const roll = rnd(a);
        if (a.act > 3 && roll < 0.35 && a.tree2 >= 0) {
          a.st = S_CROSS;
          a.act = 0;
        } else if (a.act > 2 && roll < 0.55) {
          a.st = S_FLEE; // just for fun: up the tree
          a.act = 0;
        } else {
          const ang = rnd(a) * TAU;
          const d = 1 + rnd(a) * 2.8;
          a.tx = tree.x + Math.sin(ang) * d;
          a.tz = tree.z + Math.cos(ang) * d;
          a.st = S_WALK;
        }
      }
    }
  }
  const onTrunk = a.st === S_CLIMB_UP || a.st === S_IN_TREE || a.st === S_CLIMB_DOWN;
  if (onTrunk) {
    a.x = tree.x + Math.sin(a.act) * R;
    a.z = tree.z + Math.cos(a.act) * R;
    a.y = baseY + a.climb;
    hy = 0;
  } else {
    a.y = groundY(a.x, a.z);
    gait(a, T, dt, 0.5);
    lf = Math.abs(Math.sin(a.phase * 0.5)) * 0.08 * a.s * Math.min(1, a.stride);
    if (a.alert > 0.5 && a.st === S_IDLE) {
      lookKid = true;
      hy = clamp(wrapAngle(kidYaw(a, kid) - a.yaw), -1.2, 1.2);
    }
  }
  a.ear = flick(t, a.seed, 0) * 0.4;
  a.tail = Math.sin(t * 3.1 + a.seed) * 0.2 + flick(t, a.seed, 1) * 0.6;
  a.tailLift = 0.2 + flick(t, a.seed, 2) * 0.5;
}

// ── owls ──

function stepOwl(a: Agent, kid: KidSense, dt: number, t: number, glow: number) {
  const T = TUNE[K_OWL];
  a.want = activeNow(a, glow) ? 1 : 0;
  slopeFit = false;
  const dx = kid.x - a.x;
  const dz = kid.z - a.z;
  const dh = Math.sqrt(dx * dx + dz * dz);
  if (kid.ground && dh < T.noticeR) {
    // owls follow you with their heads (almost all the way round)
    hy = clamp(wrapAngle(Math.atan2(dx, dz) - a.yaw), -2.6, 2.6);
    hp = clamp(Math.atan2(a.y - kid.y - 1, Math.max(1, dh)) * 0.7, -0.2, 0.7);
  } else {
    hy = Math.sin(t * 0.25 + a.seed) * 1.1 + (noise2(t * 0.12, a.seed, 7) > 0.72 ? 2.3 * Math.sign(Math.sin(a.seed)) : 0);
    hp = 0.1;
  }
  // ruffle, or a flurry of wing-flaps if the kid runs right underneath
  if (kid.ground && dh < 5 && kid.speed > RUN_SPEED) a.act = 1.6;
  a.act = Math.max(0, a.act - dt);
  a.wing = a.act > 0 ? 0.3 + Math.abs(Math.sin(t * 13)) * 1.1 : Math.max(0, flick(t, a.seed, 3)) * 0.5;
  lf = Math.sin(t * 1.2 + a.seed) * 0.01;
  a.ear = 0;
  a.tail = 0;
}

// ── ducks ──

function stepDuck(env: FaunaEnv, a: Agent, kid: KidSense, dt: number, t: number, glow: number) {
  const T = TUNE[K_DUCK];
  const dk = kidDist(a, kid);
  slopeFit = false;
  const gy = groundY(a.x, a.z);
  const wx = a.x - POND.x;
  const wz = a.z - POND.z;
  const inWater = wx * wx + wz * wz < (POND.r - 0.15) * (POND.r - 0.15);
  const L = a.lead >= 0 ? env.agents[a.lead] : null;
  a.alert = ease(a.alert, kid.ground && dk < T.noticeR ? 1 : 0, dt * 2);
  const sleepy = sleepyNow(a, glow);
  if (a.role === R_DUCKLING && L) {
    // follow the one in front, in a line
    const back = 0.5 * (L.s + a.s) + 0.08;
    const tx = L.x - Math.sin(L.yaw) * back;
    const tz = L.z - Math.cos(L.yaw) * back;
    const dx = tx - a.x;
    const dz = tz - a.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.12) goTo(env, a, tx, tz, clamp(d * 2.2, 0.2, T.run * 1.2), dt, 7);
    else a.v = ease(a.v, 0, dt * 5);
    a.st = L.st === S_SLEEP ? S_SLEEP : S_WALK;
  } else {
    // a pond duck: paddles about, dabbles, now and then leads the family ashore (the hen)
    const scared = kid.ground && (dk < 1.8 || (kid.speed > RUN_SPEED && dk < T.fleeR));
    a.calm = scared ? 0 : a.calm + dt;
    if (sleepy && a.st !== S_SLEEP && inWater) a.st = S_SLEEP;
    switch (a.st) {
      case S_SLEEP: {
        a.v = ease(a.v, 0, dt * 2);
        if (!inWater) {
          a.st = S_FLEE;
          a.tx = POND.x;
          a.tz = POND.z;
        }
        if (!sleepy) {
          a.st = S_IDLE;
          a.tm = 2;
        }
        break;
      }
      case S_ASHORE: {
        if (a.climb < 0.5) {
          const r = goTo(env, a, a.tx, a.tz, T.walk, dt);
          if (r < 0 || r < 0.35) {
            a.climb = 1;
            a.tm = 12 + rnd(a) * 10;
          }
        } else {
          a.v = ease(a.v, 0, dt * 3);
          a.tm -= dt;
          if (a.tm <= 0 || scared || sleepy) {
            a.st = S_FLEE;
            a.tx = POND.x + (a.x - POND.x) * 0.2;
            a.tz = POND.z + (a.z - POND.z) * 0.2;
          }
        }
        if (scared) {
          a.st = S_FLEE;
          a.tx = POND.x;
          a.tz = POND.z;
        }
        break;
      }
      case S_FLEE: {
        const r = goTo(env, a, a.tx, a.tz, T.run, dt);
        if (r < 0 || r < 0.6) {
          a.st = S_IDLE;
          a.tm = 2 + rnd(a) * 3;
        }
        break;
      }
      case S_CURIOUS: {
        if (!kid.ground || kid.still < 0.6 || dk > T.curiousR * 1.3) {
          a.st = S_IDLE;
          a.tm = 2;
          break;
        }
        lookKid = true;
        const stop = T.stopR;
        if (dk > stop + 0.2) {
          const k = (dk - stop) / dk;
          if (goTo(env, a, a.x + (kid.x - a.x) * k, a.z + (kid.z - a.z) * k, T.walk * 0.7, dt) < 0) a.v = 0;
        } else a.v = ease(a.v, 0, dt * 3);
        break;
      }
      case S_WALK: {
        a.tm -= dt;
        const r = goTo(env, a, a.tx, a.tz, T.walk * 0.8, dt);
        if (r < 0 || r < 0.3 || a.tm <= 0) {
          a.st = S_IDLE;
          a.tm = T.idleMin + rnd(a) * (T.idleMax - T.idleMin);
        }
        break;
      }
      default: {
        a.st = S_IDLE;
        a.v = ease(a.v, 0, dt * 2);
        a.tm -= dt;
        a.act += dt;
        if (a.tm <= 0) {
          if (a.role === R_HEN && a.act > 45 && env.shores.length && !sleepy) {
            const k = Math.floor(rnd(a) * (env.shores.length / 2)) * 2;
            a.tx = env.shores[k];
            a.tz = env.shores[k + 1];
            a.st = S_ASHORE;
            a.climb = 0;
            a.act = rnd(a) * 20;
          } else {
            const ang = rnd(a) * TAU;
            const d = Math.sqrt(rnd(a)) * (POND.r - 1.4);
            a.tx = POND.x + Math.sin(ang) * d;
            a.tz = POND.z + Math.cos(ang) * d;
            a.st = S_WALK;
            a.tm = 20;
          }
        }
      }
    }
    if ((a.st === S_IDLE || a.st === S_WALK) && inWater) {
      if (scared && dk < 5) {
        // paddle off to the far side
        const dx = a.x - kid.x;
        const dz = a.z - kid.z;
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        a.tx = POND.x + (dx / d) * (POND.r - 1.5);
        a.tz = POND.z + (dz / d) * (POND.r - 1.5);
        a.st = S_FLEE;
      } else if (kid.ground && kid.still > 2 && dk < T.curiousR && dk > T.stopR + 0.5 && a.calm > 4) a.st = S_CURIOUS;
    }
  }
  a.y = Math.max(gy, env.g.pondY - 0.03);
  const T2 = TUNE[K_DUCK];
  gait(a, T2, dt, 1e9);
  if (inWater) {
    tk = 1; // (feet paddling under the water)
    lf = Math.sin(t * 1.9 + a.seed) * 0.012;
    rl = Math.sin(t * 1.3 + a.seed) * 0.04;
    // bottoms up! a dabbling duck tips over now and then
    if (a.st === S_IDLE && a.role !== R_DUCKLING && noise2(t * 0.18, a.seed, 8) > 0.8) {
      pp = 1.25;
      lf = -0.05;
    }
  } else {
    rl = Math.sin(a.phase) * 0.16 * Math.min(1, a.stride);
    lf = Math.abs(Math.cos(a.phase)) * 0.02;
  }
  if (a.st === S_SLEEP) {
    hp = 0.8;
    hy = 0.5;
  } else if (lookKid || (a.alert > 0.5 && kid.ground)) {
    hy = clamp(wrapAngle(kidYaw(a, kid) - a.yaw), -1.2, 1.2);
    hp = -0.1;
  } else if (!inWater && a.st === S_ASHORE && a.climb > 0.5) {
    hp = 0.9 + Math.max(0, Math.sin(t * 4 + a.seed)) * 0.25; // nibbling the grass
    hy = (noise2(t * 0.4, a.seed, 9) - 0.5) * 0.8;
  } else {
    hp = (noise2(t * 0.3, a.seed, 10) - 0.5) * 0.3;
    hy = (noise2(t * 0.25, a.seed, 11) - 0.5) * 1.2;
  }
  a.tail = Math.sin(t * 5 + a.seed) * 0.25 * Math.max(0, flick(t, a.seed, 1));
  a.wing = Math.max(0, flick(t, a.seed, 2)) * 0.9;
  a.ear = 0;
}

// ── frogs ──

/** the whole hop stays over dry bank */
function hopClear(env: FaunaEnv, a: Agent, tx: number, tz: number): boolean {
  for (let k = 1; k <= 6; k++) {
    const u = k / 6;
    if (!passable(env, a, a.x + (tx - a.x) * u, a.z + (tz - a.z) * u)) return false;
  }
  return true;
}

function stepFrog(env: FaunaEnv, a: Agent, kid: KidSense, dt: number, t: number, glow: number) {
  const T = TUNE[K_FROG];
  const dk = kidDist(a, kid);
  const active = activeNow(a, glow);
  const scared = kid.ground && (dk < 2.2 || (dk < T.fleeR && kid.speed > 1));
  a.calm = scared ? 0 : a.calm + dt;
  slopeFit = true;
  a.bound = 1;
  if (a.st === S_HOP) {
    a.tm -= dt;
    const u = 1 - clamp(a.tm / 0.42, 0, 1);
    a.x = a.bx + (a.tx - a.bx) * u;
    a.z = a.bz + (a.tz - a.bz) * u;
    lf = Math.sin(Math.PI * u) * 0.32 * a.s;
    pp = -0.35 * Math.cos(Math.PI * u);
    a.phase = -Math.PI / 2;
    a.stride = 1.6 * Math.sin(Math.PI * u) + 0.2;
    if (a.tm <= 0) {
      a.x = a.tx;
      a.z = a.tz;
      a.st = a.want < 0.5 ? S_HIDE : S_IDLE;
      a.tm = T.idleMin + rnd(a) * (T.idleMax - T.idleMin);
      a.stride = 0;
    }
  } else if (a.st === S_HIDE) {
    if (!(active && a.calm > 8)) a.want = 0;
    a.stride = 0;
    if (active && a.calm > 8 && !(kid.ground && dk < 4)) {
      if (a.want < 0.5 && a.present < 0.05) {
        // back out on the bank
        a.x = a.hx;
        a.z = a.hz;
        a.want = 1;
      }
      if (a.want > 0.5 && a.present > 0.9) {
        a.st = S_IDLE;
        a.tm = 2;
      }
    }
  } else {
    a.stride = ease(a.stride, 0, dt * 6);
    a.tm -= dt;
    // the throat puffs; it turns a little now and then
    hp = -0.05 + Math.max(0, Math.sin(t * 5 + a.seed)) * 0.05;
    const goHide = !active || scared;
    if (goHide || a.tm <= 0) {
      let tx = a.cx;
      let tz = a.cz;
      if (!goHide) {
        const ang = a.yaw + (rnd(a) - 0.5) * 2.6;
        const d = 0.5 + rnd(a) * 0.7;
        tx = a.x + Math.sin(ang) * d;
        tz = a.z + Math.cos(ang) * d;
        const hx = tx - a.hx;
        const hz = tz - a.hz;
        if (hx * hx + hz * hz > a.hr * a.hr || !hopClear(env, a, tx, tz)) {
          tx = a.hx;
          tz = a.hz;
        }
      } else a.want = 0;
      if (!goHide && !hopClear(env, a, tx, tz)) {
        // nowhere dry to hop to from here: just turn round and sit a while
        a.yaw += (rnd(a) - 0.5) * 2;
        a.tm = 1 + rnd(a) * 2;
      } else {
        a.bx = a.x;
        a.bz = a.z;
        a.tx = tx;
        a.tz = tz;
        a.yaw = Math.atan2(tx - a.x, tz - a.z);
        a.st = S_HOP;
        a.tm = 0.42;
      }
    }
  }
  a.y = groundY(a.x, a.z);
  hy = 0;
  a.ear = 0;
  a.tail = 0;
}

// ── bears ──

function stepBear(env: FaunaEnv, a: Agent, kid: KidSense, dt: number, t: number, glow: number) {
  const T = TUNE[K_BEAR];
  const dk = kidDist(a, kid);
  const active = activeNow(a, glow);
  a.alert = ease(a.alert, kid.ground && dk < T.noticeR ? 1 : 0, dt * 2);
  const L = a.lead >= 0 ? env.agents[a.lead] : null;
  if (!active && a.st !== S_HIDE) a.st = S_HIDE;
  let stand = 0;
  switch (a.st) {
    case S_HIDE: {
      if (active) {
        a.want = 1;
        if (a.present > 0.95) a.st = a.role === R_MOTHER ? S_WALK : S_PLAY;
        a.tx = a.bx;
        a.tz = a.bz;
        a.tm = 30;
        break;
      }
      const r = goTo(env, a, a.cx, a.cz, T.walk * 1.4, dt);
      if (r < 0 || r < 0.8) a.want = 0;
      break;
    }
    case S_FISH: {
      // on the bank, watching the water; a swipe now and then; up on its hind legs to look round
      a.v = ease(a.v, 0, dt * 3);
      turnTo(a, Math.atan2(a.ax, a.az), 0.8, dt);
      a.tm -= dt;
      a.act -= dt;
      hp = 0.55 + Math.sin(t * 0.7 + a.seed) * 0.1;
      hy = Math.sin(t * 0.33 + a.seed) * 0.4;
      if (a.act <= 0) a.act = 3 + rnd(a) * 5;
      if (a.act < 0.6) a.paw = Math.sin((a.act / 0.6) * Math.PI) * 1.4;
      else a.paw = ease(a.paw, 0, dt * 6);
      if (noise2(t * 0.06, a.seed, 12) > 0.74) stand = 1;
      if (a.tm <= 0) {
        a.st = S_WALK;
        a.tm = 25;
        const ang = rnd(a) * TAU;
        a.tx = a.hx + Math.sin(ang) * a.hr * 0.8;
        a.tz = a.hz + Math.cos(ang) * a.hr * 0.8;
      }
      break;
    }
    case S_WALK: {
      a.tm -= dt;
      a.paw = ease(a.paw, 0, dt * 6);
      const r = goTo(env, a, a.tx, a.tz, T.walk, dt);
      if (r < 0 || r < 0.5 || a.tm <= 0) {
        if (a.role === R_MOTHER && (a.tx !== a.bx || a.tz !== a.bz) && rnd(a) < 0.7) {
          a.tx = a.bx;
          a.tz = a.bz;
          a.tm = 30;
        } else if (a.role === R_MOTHER) {
          a.st = S_FISH;
          a.tm = 35 + rnd(a) * 35;
        } else {
          a.st = S_PLAY;
          a.tm = 2;
        }
      }
      break;
    }
    case S_CURIOUS: {
      lookKid = true;
      if (!kid.ground || kid.still < 0.6 || dk > T.curiousR * 1.4 || (L && Math.hypot(a.x - L.x, a.z - L.z) > 12)) {
        a.st = S_PLAY;
        a.tm = 1;
        break;
      }
      const stop = T.stopR * a.s + 1.2;
      if (dk > stop + 0.2) {
        const k = (dk - stop) / dk;
        goTo(env, a, a.x + (kid.x - a.x) * k, a.z + (kid.z - a.z) * k, T.walk * 0.9, dt);
      } else {
        a.v = ease(a.v, 0, dt * 3);
        turnTo(a, kidYaw(a, kid), 1.5, dt);
        stand = noise2(t * 0.3, a.seed, 13) > 0.55 ? 0.8 : 0;
      }
      break;
    }
    case S_PLAY:
    default: {
      // cubs: tumble about near their mother
      a.st = S_PLAY;
      a.tm -= dt;
      const cx = L ? L.x - L.ax * 2 : a.hx;
      const cz = L ? L.z - L.az * 2 : a.hz;
      const r = goTo(env, a, a.tx, a.tz, T.run * 0.75, dt);
      if (r < 0 || r < 0.4 || a.tm <= 0) {
        const ang = rnd(a) * TAU;
        const d = 1 + rnd(a) * 3;
        a.tx = cx + Math.sin(ang) * d;
        a.tz = cz + Math.cos(ang) * d;
        a.tm = 1.5 + rnd(a) * 3;
        if (rnd(a) < 0.3) a.act = 1; // a roly-poly tumble
      }
      if (kid.ground && kid.still > 3 && dk < T.curiousR && dk > T.stopR * a.s + 1.6) a.st = S_CURIOUS;
      break;
    }
  }
  // the mother waves at a kid who comes by (friendly bears)
  if (a.role === R_MOTHER && a.st === S_FISH && kid.ground && dk < 10 && dk > 3) {
    stand = 1;
    lookKid = true;
    a.paw = 0.9 + Math.sin(t * 6) * 0.5;
  }
  if (a.role === R_CUB && a.act > 0) {
    a.act = Math.max(0, a.act - dt);
    rl = (1 - a.act) * TAU;
  }
  a.climb = ease(a.climb, stand, dt * 1.8);
  const P = -1.05 * a.climb;
  const zb = 0.55 * a.s;
  pp = P;
  lf = -zb * Math.sin(P);
  fw = -zb * (1 - Math.cos(P));
  slopeFit = a.climb < 0.1;
  if (lookKid || (a.alert > 0.5 && a.st !== S_FISH)) {
    hy = clamp(wrapAngle(kidYaw(a, kid) - a.yaw), -1.2, 1.2);
    hp = -0.1 + a.climb * 0.3;
  } else if (a.st !== S_FISH) {
    hp = 0.15;
    hy = (noise2(t * 0.3, a.seed, 14) - 0.5) * 0.8;
  }
  gait(a, T, dt, 1.6);
  a.ear = flick(t, a.seed, 0) * 0.4;
  a.tail = 0;
}

// ── turtles ──

function stepTurtle(env: FaunaEnv, a: Agent, kid: KidSense, dt: number, t: number, glow: number) {
  const T = TUNE[K_TURTLE];
  const dk = kidDist(a, kid);
  const scared = kid.ground && (dk < T.fleeR || (kid.speed > RUN_SPEED && dk < 6));
  a.calm = scared ? 0 : a.calm + dt;
  const hide = a.calm < 3 || sleepyNow(a, glow);
  if (hide) {
    a.v = ease(a.v, 0, dt * 4);
    tk = 1;
  } else if (a.st === S_CROSS) {
    const r = goTo(env, a, a.tx, a.tz, T.walk, dt);
    if (r < 0 || r < 0.25) {
      a.st = S_IDLE;
      a.tm = T.idleMin + rnd(a) * (T.idleMax - T.idleMin);
    }
  } else {
    a.v = ease(a.v, 0, dt * 2);
    a.tm -= dt;
    if (a.tm <= 0) {
      // plod back across
      const toA = (a.tx - a.ax) ** 2 + (a.tz - a.az) ** 2 < 0.01;
      a.tx = toA ? a.bx : a.ax;
      a.tz = toA ? a.bz : a.az;
      a.st = S_CROSS;
    }
  }
  gait(a, T, dt, 1e9);
  a.stride = Math.min(a.stride, 1);
  hp = hide ? 0 : 0.1 + Math.sin(t * 0.5 + a.seed) * 0.1;
  hy = hide ? 0 : Math.sin(t * 0.4 + a.seed) * 0.45;
  a.ear = 0;
  a.tail = 0;
}

// ── the frame ──

/** ease the pose toward the targets the behaviour set, and stand it on the ground */
function finish(a: Agent, dt: number) {
  const T = TUNE[a.kind];
  a.headPitch = ease(a.headPitch, hp, dt * 4);
  a.headYaw = ease(a.headYaw, hy, dt * (a.kind === K_OWL ? 6 : 3.5));
  a.tuck = ease(a.tuck, tk, dt * 3);
  if (slopeFit && (a.kind === K_DEER || a.kind === K_HORSE || a.kind === K_COW || a.kind === K_GOAT || a.kind === K_BEAR || a.kind === K_FOX || a.kind === K_TURTLE || a.kind === K_HEDGEHOG)) {
    const Lh = 0.55 * a.s * (T.body + 0.3);
    const sx = Math.sin(a.yaw) * Lh;
    const sz = Math.cos(a.yaw) * Lh;
    pp += Math.atan2(groundY(a.x - sx, a.z - sz) - groundY(a.x + sx, a.z + sz), 2 * Lh);
  }
  a.pitch = ease(a.pitch, pp, dt * 7);
  a.roll = a.kind === K_BEAR && a.role === R_CUB ? rl : ease(a.roll, rl, dt * 8);
  a.lift = lf - T.hip * a.s * a.tuck * 0.8;
  a.fwd = fw;
  a.present = toward(a.present, a.want, dt * 1.6);
}

/** step every animal one frame (dt ≤ 0.1 s) */
export function stepFauna(env: FaunaEnv, kid: KidSense, dt: number, t: number, glow: number) {
  const agents = env.agents;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    resetPose();
    switch (a.kind) {
      case K_SQUIRREL:
        stepSquirrel(env, a, kid, dt, t, glow);
        break;
      case K_OWL:
        stepOwl(a, kid, dt, t, glow);
        break;
      case K_DUCK:
        stepDuck(env, a, kid, dt, t, glow);
        break;
      case K_FROG:
        stepFrog(env, a, kid, dt, t, glow);
        break;
      case K_BEAR:
        stepBear(env, a, kid, dt, t, glow);
        break;
      case K_TURTLE:
        stepTurtle(env, a, kid, dt, t, glow);
        break;
      default:
        stepGrazer(env, a, kid, dt, t, glow);
    }
    if (a.kind !== K_OWL && !(a.kind === K_SQUIRREL && a.climb > 0)) {
      avoidKid(env, a, kid);
      if (a.kind !== K_DUCK) a.y = groundY(a.x, a.z);
    }
    finish(a, dt);
  }
  // herd / family members keep a little personal space (families are contiguous in the plan)
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (a.group < 0 || a.present < 0.5) continue;
    const Ra = TUNE[a.kind].body * a.s;
    for (let j = i + 1; j < agents.length && agents[j].group === a.group; j++) {
      const b = agents[j];
      if (b.present < 0.5 || b.kind !== a.kind) continue;
      if (a.kind === K_DUCK && (a.role === R_DUCKLING || b.role === R_DUCKLING)) continue;
      const min = (Ra + TUNE[b.kind].body * b.s) * 0.95;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = ((min - d) / d) * 0.5;
      const ix = a.x - dx * push;
      const iz = a.z - dz * push;
      const jx = b.x + dx * push;
      const jz = b.z + dz * push;
      if (passable(env, a, ix, iz)) {
        a.x = ix;
        a.z = iz;
      }
      if (passable(env, b, jx, jz)) {
        b.x = jx;
        b.z = jz;
      }
    }
  }
}

