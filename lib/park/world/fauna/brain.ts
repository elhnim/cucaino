// How Cucaino Park's land animals behave — pure maths, deterministic, allocation-free, no three.js
// (tested). Every animal is a flat `Agent`; `stepFauna` moves the whole population one frame.
//
// Roaming: herd leaders and wanderers pick somewhere to go on the roaming map (./roam.ts) by the
// time of day — a drink at the pond, the stream or a lake at dawn and dusk, grazing in the meadows,
// along the trail verges and round the plaza's edges by day, the shade of the trees at midday and
// a rest under them at night — preferring places nobody has been to for a while and where few
// animals are, inside their (big) home range; they travel there along the trails and across them,
// the herd following in a loose file (youngsters at mum's side). A little "director" now and then
// sends an animal across the path just ahead of the kid, or over to a kid standing still, and the
// curious young ones (a lamb, a joey, a fox kit, an emu chick) tag along behind the kid for a bit.
//
// Homebodies keep their old routines: rabbits round their warrens, squirrels up and down their
// trees, koalas dozing in a fork, owls and kookaburras on their branches, ducks and the platypus on
// the pond, frogs on the banks, the bears fishing at the stream, turtles crossing a trail, the
// horses in their paddock and the chickens round the farm.
//
// Everyone keeps a comfortable distance from the kid (a running kid startles them; a kid standing
// still draws the curious ones closer) and from each other (a spatial hash, sheep included), and
// never steps into the sea, the stream, a lake, the lands, the Dream Park or the park's keep-clear
// ground.
import { POND } from "../../registry/island";
import { groundY } from "../../registry/terrain";
import { noise2 } from "../fantasy/noise";
import { B_BLOCK, B_JUNGLE, B_KEEP, B_LAND, B_OPEN, B_POND, B_TRAIL, bitsAt, headroomAt, slopeOf, type WalkGrid } from "./ground";
import { canopyOf, RMAX } from "./plan";
import {
  CLASS_HEAD,
  CLASS_SLOPE,
  CLEAR,
  HCELL,
  HHALF,
  HN,
  P_DAWN,
  P_DUSK,
  P_MIDDAY,
  P_NIGHT,
  TAG_HILL,
  TAG_OPEN,
  TAG_PLAZA,
  TAG_ROOMY,
  TAG_SHADE,
  TAG_TRAIL,
  TAG_WATER,
  hashCell,
  makeHash,
  nearestNode,
  phaseOf,
  route,
  segmentOk,
  type RoamGraph,
  type SpatialHash,
} from "./roam";
import {
  BLOCKS_KID,
  BODY_LEN_MULT,
  C_GIANT,
  C_NONE,
  K_BEAR,
  K_CHICKEN,
  K_COW,
  K_DEER,
  K_DUCK,
  K_ECHIDNA,
  K_ELEPHANT,
  K_EMU,
  K_FOX,
  K_FROG,
  K_GIRAFFE,
  K_GOAT,
  K_HEDGEHOG,
  K_HORSE,
  K_KANGAROO,
  K_KOALA,
  K_KOOKABURRA,
  K_OWL,
  K_PLATYPUS,
  K_RABBIT,
  K_SHEEP,
  K_SQUIRREL,
  K_TURTLE,
  K_WOMBAT,
  K_ZEBRA,
  RUN_SPEED,
  R_CUB,
  R_DUCKLING,
  R_HEN,
  R_JOEY,
  R_KIT,
  R_LAMB,
  R_MOTHER,
  R_ROAMER,
  R_ROOSTER,
  R_VIXEN,
  SIZES,
  S_ASHORE,
  S_CALL,
  S_CANTER,
  S_CLIMB_DOWN,
  S_CLIMB_UP,
  S_CROSS,
  S_CURIOUS,
  S_CURL,
  S_DIVE,
  S_DRINK,
  S_FISH,
  S_FLEE,
  S_FOLLOW,
  S_HIDE,
  S_HOP,
  S_IDLE,
  S_IN_TREE,
  S_PLAY,
  S_POUNCE,
  S_ROAM,
  S_SLEEP,
  S_WALK,
  TUNE,
  inPaddock,
  paddockPoint,
  trueScale,
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
  graph: RoamGraph;
  /** RMAX node indices per animal */
  routes: Int16Array;
  hash: SpatialHash;
  /** the storybook's sheep, live (x, z pairs) — everyone walks round them */
  sheep: Float32Array;
  nSheep: number;
  /** the sheep flocks (x, z, r triples): nobody heads into them */
  flocks: Float32Array;
  nFlocks: number;
  /** the farm corner the sheep and chickens come home to */
  farm: { x: number; z: number } | null;
  /** the park's hour (0..24) and its part of the day (roam.ts P_*) */
  hour: number;
  phase: number;
  /** the park clock (s) */
  t: number;
  /** seconds to the director's next little show; how many are following the kid */
  dirT: number;
  followers: number;
  /** animals per 16 m cell (20 × 20), refreshed every second */
  occ: Uint8Array;
  occT: number;
  /** how far each herd's slowest member is behind its place (by group) */
  lag: Float32Array;
  lagNext: Float32Array;
  rs: number;
}

/** put the roaming bits together round a plan */
export function makeEnv(o: { g: WalkGrid; trees: TreeLite[]; paddock: Paddock | null; agents: Agent[]; shores: Float32Array; graph: RoamGraph; routes: Int16Array; farm?: { x: number; z: number } | null; maxSheep?: number }): FaunaEnv {
  let groups = 1;
  for (const a of o.agents) groups = Math.max(groups, a.group + 2);
  const maxSheep = o.maxSheep ?? 0;
  return {
    g: o.g,
    trees: o.trees,
    paddock: o.paddock,
    agents: o.agents,
    shores: o.shores,
    graph: o.graph,
    routes: o.routes,
    hash: makeHash(o.agents.length + maxSheep),
    sheep: new Float32Array(Math.max(2, maxSheep * 2)),
    nSheep: 0,
    flocks: new Float32Array(48),
    nFlocks: 0,
    farm: o.farm ?? null,
    hour: 12,
    phase: phaseOf(12),
    t: 0,
    dirT: 6,
    followers: 0,
    occ: new Uint8Array(400),
    occT: 0,
    lag: new Float32Array(groups),
    lagNext: new Float32Array(groups),
    rs: 0x9e3779b9,
  };
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
function envRnd(env: FaunaEnv): number {
  let s = env.rs | 0;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  env.rs = s >>> 0 || 1;
  return env.rs / 4294967296;
}

// ── schedules ──

const inHours = (h: number, from: number, to: number) => (from <= to ? h >= from && h < to : h >= from || h < to);

/** is it out and about now (else it goes to its burrow / den / tree / coop / the water) */
export function activeNow(a: Agent, glow: number, hour = 12): boolean {
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
    case K_WOMBAT:
      // dozes in its burrow through the middle of the day
      return !inHours(hour, 10.5 + a.shy, 14.5 + a.shy);
    case K_ECHIDNA:
      return inHours(hour, 5.5 + a.shy, 20.5);
    case K_PLATYPUS:
      return !inHours(hour, 10.5, 14.5);
    case K_CHICKEN:
      return inHours(hour, 5.2 + a.shy * 0.4, 20.6 + a.shy * 0.4);
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
    case K_SHEEP:
    case K_ZEBRA:
      return glow > 0.8 + a.shy * 0.12;
    case K_GIRAFFE:
    case K_ELEPHANT:
      return glow > 0.9 + a.shy * 0.06;
    case K_DEER:
    case K_EMU:
      return glow > 0.9;
    case K_TURTLE:
      return glow > 0.75;
    default:
      return false;
  }
}

/** which roaming spots a species heads for now (TAG_ bits), most wanted first in `goalTag` */
export function wantTags(a: Agent, phase: number, hour: number): number {
  const thirsty = ((hour - a.drank + 48) % 24) > 7;
  const giant = a.cls === C_GIANT;
  const grazeTags = giant ? TAG_ROOMY | TAG_OPEN | TAG_TRAIL : a.kind === K_GOAT ? TAG_HILL | TAG_OPEN : TAG_OPEN | TAG_TRAIL | TAG_PLAZA;
  switch (a.kind) {
    case K_HEDGEHOG:
    case K_WOMBAT:
    case K_FOX:
      // the night-time potterers, out along the verges and the forest edges
      return TAG_TRAIL | TAG_SHADE | TAG_OPEN | (thirsty && phase !== P_NIGHT ? TAG_WATER : 0);
    case K_ECHIDNA:
      return TAG_TRAIL | TAG_SHADE | TAG_OPEN;
    default:
      break;
  }
  if (phase === P_NIGHT) return giant || a.kind === K_KANGAROO ? grazeTags : TAG_SHADE;
  if ((phase === P_DAWN || phase === P_DUSK) && thirsty) return TAG_WATER;
  if (phase === P_MIDDAY && !giant && (a.kind === K_DEER || a.kind === K_KANGAROO || a.kind === K_SHEEP || a.kind === K_EMU)) return TAG_SHADE | TAG_TRAIL;
  return grazeTags;
}

// ── movement ──

const DIRS = [1, 0, 0, 1, -1, 0, 0, -1];

export function passable(env: FaunaEnv, a: Agent, x: number, z: number): boolean {
  const b = bitsAt(env.g, x, z);
  if (a.kind === K_DUCK || a.kind === K_PLATYPUS) {
    const dx = x - POND.x;
    const dz = z - POND.z;
    const d2 = dx * dx + dz * dz;
    if (b & B_POND) return true;
    if (d2 < (POND.r + 0.35) * (POND.r + 0.35)) return true; // the muddy rim
    if (!(b & B_LAND)) return false;
    return d2 < (POND.r + 6.5) * (POND.r + 6.5) && slopeOf(env.g, x, z) < 0.5;
  }
  if (!(b & B_LAND)) return false;
  // (squirrels run right up to their trunks, koalas only to their own)
  if (b & B_BLOCK && a.kind !== K_SQUIRREL) {
    if (a.kind !== K_KOALA || a.tree < 0) return false;
    const t = env.trees[a.tree];
    if ((x - t.x) ** 2 + (z - t.z) ** 2 > (0.24 * t.s + 0.7) ** 2) return false;
  }
  if (b & B_KEEP) return false;
  const T = TUNE[a.kind];
  const roams = a.cls !== C_NONE;
  const maxS = !roams ? T.maxSlope : a.cls === C_GIANT ? CLASS_SLOPE[C_GIANT] + 0.05 : Math.max(T.maxSlope, CLASS_SLOPE[a.cls] + 0.05);
  if (slopeOf(env.g, x, z) > maxS) return false;
  const p = env.paddock;
  if (a.kind === K_HORSE) return p ? inPaddock(p, x, z, 0.9 * a.s) : true;
  if (a.cls === C_GIANT) {
    if (!(b & (B_OPEN | B_TRAIL)) || b & B_JUNGLE) return false;
  } else if (T.open && !(b & B_OPEN)) return false;
  if (p && inPaddock(p, x, z, -0.7)) return false; // everyone else stays outside the fence
  if (roams) {
    // tagging along right behind the kid (a lamb, a joey, a kit), it's left the roaming map
    // altogether — the kid walks it wherever the kid itself can go, not wherever the whole grown
    // herd's roam graph says there's room, or it can get stuck hunting for herd-sized clearance at
    // the very edge of the ground it's allowed on, falling further and further behind
    if (a.st === S_FOLLOW) return true;
    // the big ones need room either side (no trunks, water or keep-clear ground under them), and
    // head room: the giants keep out from under every crown, the deer and roos under low ones.
    // Every roamer needs this same side-clearance (the roaming map's cellOk/spotOk/segmentOk ask
    // for it even of the small class) — skip it only for headroom, which small roamers duck under
    // freely, or a hedgehog, fox, wombat or echidna could walk itself into a nook between trunks
    // the roaming map doesn't recognise, and never find its way back out (nearestNode would never
    // see a reachable node from in there).
    const head = a.cls === C_GIANT ? CLASS_HEAD[C_GIANT] : a.head + 0.25;
    if (a.cls > 0 && headroomAt(env.g, x, z) < head) return false;
    // a youngster (a lamb, a joey, a chick) is built smaller than the class's clearance assumes —
    // let it need only as much room either side as its own small body does, so it isn't wedged at a
    // gap its grown-up herd (and the roaming map) fits through but it, tagging along off the graph
    // behind its mother, would get boxed in trying to match
    const grown = Math.min(1, Math.max(0.5, a.s / trueScale(a.kind)));
    const c = CLEAR[a.cls] * grown * 0.8;
    for (let k = 0; k < 8; k += 2) {
      const bx = x + DIRS[k] * c;
      const bz = z + DIRS[k + 1] * c;
      const bb = bitsAt(env.g, bx, bz);
      if ((bb & (B_LAND | B_BLOCK | B_KEEP)) !== B_LAND) return false;
      if (a.cls === C_GIANT && headroomAt(env.g, bx, bz) < head) return false;
    }
    return true;
  }
  const dx = x - a.hx;
  const dz = z - a.hz;
  return dx * dx + dz * dz < a.leash * a.leash;
}

const SIDESTEP = [0, 0.5, -0.5, 1.1, -1.1, 1.8, -1.8, 2.6, -2.6, Math.PI];

/** plain walkable ground (no water, lands, trunks or keep-clear ground): the last resort */
function looseOk(env: FaunaEnv, x: number, z: number): boolean {
  return (bitsAt(env.g, x, z) & (B_LAND | B_BLOCK | B_KEEP)) === B_LAND;
}

/** would this step walk an animal further into a sheep it's already brushing past? */
function sheepBlocks(env: FaunaEnv, a: Agent, nx: number, nz: number): boolean {
  const R = TUNE[a.kind].body * a.s;
  if (R < 0.35) return false;
  const R2 = (R + 0.95) * (R + 0.95);
  for (let k = 0; k < env.nSheep; k++) {
    const sx = env.sheep[k * 2];
    const sz = env.sheep[k * 2 + 1];
    const dn = (nx - sx) ** 2 + (nz - sz) ** 2;
    if (dn < R2 && dn < (a.x - sx) ** 2 + (a.z - sz) ** 2) return true;
  }
  return false;
}

/** step forward (sidestepping round whatever's in the way); false if boxed in */
export function moveFwd(env: FaunaEnv, a: Agent, dist: number): boolean {
  if (dist <= 0) return true;
  // (squeezed somewhere it shouldn't be — the kid shooed it there — it may walk out over plain ground)
  const loose = a.cls !== C_NONE && !passable(env, a, a.x, a.z);
  for (let k = 0; k < SIDESTEP.length; k++) {
    const yaw = a.yaw + SIDESTEP[k];
    const nx = a.x + Math.sin(yaw) * dist;
    const nz = a.z + Math.cos(yaw) * dist;
    if ((passable(env, a, nx, nz) || (loose && looseOk(env, nx, nz))) && !sheepBlocks(env, a, nx, nz)) {
      a.x = nx;
      a.z = nz;
      // (it turns toward the way it could go; backed into a corner, it turns right round)
      if (k) a.yaw = wrapAngle(a.yaw + SIDESTEP[k] * (k === SIDESTEP.length - 1 ? 0.5 : 0.2));
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

/** the kid's personal space: animals step aside smoothly, and never end a step inside it */
function avoidKid(env: FaunaEnv, a: Agent, kid: KidSense, dt: number) {
  if (!kid.ground) return;
  const R = TUNE[a.kind].body * a.s + 0.8;
  const soft = R + 1.6;
  const dx = a.x - kid.x;
  const dz = a.z - kid.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= soft * soft) return;
  const d = Math.sqrt(d2) || 1e-3;
  const ux = d2 > 1e-8 ? dx / d : Math.sin(a.yaw);
  const uz = d2 > 1e-8 ? dz / d : Math.cos(a.yaw);
  if (d >= R) {
    // the soft zone: ease out of the way (a curious one standing still doesn't mind so much)
    const push = Math.min(soft - d, (a.st === S_CURIOUS || a.st === S_FOLLOW ? 0.8 : 2.6) * dt);
    const nx = a.x + ux * push;
    const nz = a.z + uz * push;
    if (passable(env, a, nx, nz)) {
      a.x = nx;
      a.z = nz;
    }
    return;
  }
  kidHard(env, a, kid, R, ux, uz);
}

/** out of the kid's bubble at once: straight out, else round either side (or further out; a big
 *  one boxed in may step over plain ground it'd normally keep off) */
function kidHard(env: FaunaEnv, a: Agent, kid: KidSense, R: number, ux: number, uz: number) {
  for (let k = 0; k < 27; k++) {
    const kk = k % 9;
    const ang = kk === 0 ? 0 : (kk % 2 ? 1 : -1) * Math.ceil(kk / 2) * 0.7;
    const rr = k < 9 ? R : R + 1.2;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const vx = ux * c + uz * s;
    const vz = -ux * s + uz * c;
    const nx = kid.x + vx * rr;
    const nz = kid.z + vz * rr;
    if (k < 18 ? passable(env, a, nx, nz) : looseOk(env, nx, nz)) {
      a.x = nx;
      a.z = nz;
      return;
    }
  }
}

/** after the jostle: nobody ends the frame inside the kid's bubble */
function kidClear(env: FaunaEnv, a: Agent, kid: KidSense) {
  if (!kid.ground) return;
  const R = TUNE[a.kind].body * a.s + 0.8;
  const dx = a.x - kid.x;
  const dz = a.z - kid.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= R * R) return;
  const d = Math.sqrt(d2) || 1e-3;
  kidHard(env, a, kid, R, d2 > 1e-8 ? dx / d : Math.sin(a.yaw), d2 > 1e-8 ? dz / d : Math.cos(a.yaw));
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

const tmpP = { x: 0, z: 0 };

function pickWander(env: FaunaEnv, a: Agent, dusk: number) {
  const L = a.lead >= 0 ? env.agents[a.lead] : null;
  let cx = a.hx;
  let cz = a.hz;
  let r = a.hr;
  if (L && L.present > 0.5) {
    cx = L.x;
    cz = L.z;
    r = a.kind === K_DEER ? (L.kind === K_DEER && L.lead >= 0 ? 2.4 : 5) : 2 + TUNE[a.kind].body * a.s * 3;
  } else if (a.cls !== C_NONE) {
    // a roamer grazes round the spot it travelled to
    cx = a.bx;
    cz = a.bz;
    r = 3 + TUNE[a.kind].body * a.s * 3;
  } else if (a.kind === K_DEER) {
    cx += a.ax * (dusk * 8 - 1);
    cz += a.az * (dusk * 8 - 1);
  }
  if (a.kind === K_HORSE && env.paddock) {
    const p = env.paddock;
    paddockPoint(p, (rnd(a) * 2 - 1) * (p.hw - 2.5), (rnd(a) * 2 - 1) * (p.hd - 2.5), tmpP);
    a.tx = tmpP.x;
    a.tz = tmpP.z;
    if (L && L.present > 0.5) {
      a.tx = L.x + (rnd(a) - 0.5) * 5;
      a.tz = L.z + (rnd(a) - 0.5) * 5;
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
  a.tx = a.x;
  a.tz = a.z;
}

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
  const woods = (a.kind === K_RABBIT || a.kind === K_DEER || a.kind === K_FOX) && a.cls === C_NONE;
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

// ── roaming ──

/** how crowded the island is round (x, z): animals in its 16 m cell */
function occAt(env: FaunaEnv, x: number, z: number): number {
  const i = Math.floor((x + 160) / 16);
  const j = Math.floor((z + 160) / 16);
  if (i < 0 || j < 0 || i >= 20 || j >= 20) return 0;
  return env.occ[j * 20 + i];
}

/** the most important tag of a spot, for what the animal will do there */
function doingOf(tag: number, want: number): number {
  const w = tag & want;
  if (w & TAG_WATER) return TAG_WATER;
  if (w & TAG_SHADE) return TAG_SHADE;
  if (w & TAG_HILL) return TAG_HILL;
  if (w & TAG_ROOMY) return TAG_ROOMY;
  if (w & TAG_TRAIL) return TAG_TRAIL;
  if (w & TAG_PLAZA) return TAG_PLAZA;
  return TAG_OPEN;
}

/** choose where a roamer goes next (a node in its class's connected part), or -1 */
export function chooseGoal(env: FaunaEnv, a: Agent, from: number): number {
  const G = env.graph;
  const cls = a.cls;
  const comp = G.comp[cls][from];
  if (comp < 0) return -1;
  let want = wantTags(a, env.phase, env.hour);
  // (sheep and chickens head home to the farm at night)
  const homeBound = a.kind === K_SHEEP && env.phase === P_NIGHT;
  for (let pass = 0; pass < 2; pass++) {
    let best = -1;
    let bestS = -Infinity;
    for (let i = 0; i < G.n; i++) {
      if (i === from || !G.ok[cls][i] || G.comp[cls][i] !== comp) continue;
      const tg = G.tag[i];
      if (!(tg & want)) continue;
      const x = G.x[i];
      const z = G.z[i];
      const dx = x - a.x;
      const dz = z - a.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 9) continue;
      let s = -Math.abs(d - 50) * 0.04;
      s -= occAt(env, x, z) * 0.7;
      s -= G.resv[i] * 4;
      s += Math.min(1, (env.t - G.seen[i]) / 300) * 2.2;
      const hx = x - a.hx;
      const hz = z - a.hz;
      const hd = Math.sqrt(hx * hx + hz * hz);
      const hr = homeBound ? 8 : a.hr;
      if (hd > hr) s -= (hd - hr) * (homeBound ? 0.6 : 0.12);
      for (let f = 0; f < env.nFlocks; f++) {
        const fx = env.flocks[f * 3] - x;
        const fz = env.flocks[f * 3 + 1] - z;
        const fr = env.flocks[f * 3 + 2] + 7;
        if (fx * fx + fz * fz < fr * fr) s -= 6;
      }
      if (tg & TAG_TRAIL) s += 0.9; // (where the kid walks)
      if (a.kind === K_GOAT && tg & TAG_HILL) s += 1.5;
      s += rnd(a) * 2.2;
      if (s > bestS) {
        bestS = s;
        best = i;
      }
    }
    if (best >= 0) {
      a.doing = doingOf(G.tag[best], want);
      return best;
    }
    // nothing of that sort reachable: anywhere open will do
    want = TAG_OPEN | TAG_TRAIL | TAG_ROOMY | TAG_SHADE | TAG_PLAZA | TAG_HILL;
  }
  return -1;
}

/** set a roamer off along a route to `goal` (from the spot nearest it); false if it can't get there */
export function routeTo(env: FaunaEnv, a: Agent, goal: number): boolean {
  const G = env.graph;
  const from = nearestNode(G, env.g, a.cls, a.x, a.z, 32);
  if (from < 0 || goal < 0) return false;
  const off = a.id * RMAX;
  env.routes[off] = from;
  const len = from === goal ? 0 : route(G, a.cls, from, goal, env.routes, off + 1, RMAX - 1);
  if (from !== goal && len === 0) return false;
  if (a.goal >= 0 && a.goal !== goal && G.resv[a.goal] > 0 && a.st === S_ROAM) G.resv[a.goal]--;
  a.rn = len + 1;
  a.ri = 0;
  // (cut the corner: start from the furthest of the first few spots it can walk straight to)
  for (let k = Math.min(3, a.rn - 1); k > 0; k--) {
    const n = env.routes[off + k];
    if (segmentOk(env.g, a.cls, a.x, a.z, G.x[n], G.z[n])) {
      a.ri = k;
      break;
    }
  }
  a.prog = 1e9;
  a.stuck = 0;
  a.goal = goal;
  if (G.resv[goal] < 250) G.resv[goal]++;
  a.st = S_ROAM;
  a.tm = 0;
  return true;
}

export function startRoam(env: FaunaEnv, a: Agent): boolean {
  const G = env.graph;
  const from = nearestNode(G, env.g, a.cls, a.x, a.z, 32);
  if (from < 0) return false;
  const goal = chooseGoal(env, a, from);
  if (goal < 0) return false;
  return routeTo(env, a, goal);
}

/** out and about at night (no resting under the trees for these) */
const nightOwl = (a: Agent) => a.kind === K_HEDGEHOG || a.kind === K_WOMBAT || a.kind === K_FOX || a.kind === K_KANGAROO;

/** how long it stays where it arrived, by what it came for */
function lingerFor(env: FaunaEnv, a: Agent): number {
  const r = rnd(a);
  if (env.phase === P_NIGHT && a.doing === TAG_SHADE && !nightOwl(a)) return 150 + r * 120;
  if (a.doing === TAG_WATER) return 20 + r * 15;
  if (a.doing === TAG_SHADE) return 45 + r * 50;
  if (a.cls === C_GIANT) return 40 + r * 60;
  return 30 + r * 55;
}

function arrive(env: FaunaEnv, a: Agent) {
  const G = env.graph;
  const goal = a.goal;
  if (goal >= 0 && (G.x[goal] - a.x) ** 2 + (G.z[goal] - a.z) ** 2 > 36) {
    // gave up on the way: graze here a little and think again (somewhere else)
    if (G.resv[goal] > 0) G.resv[goal]--;
    G.seen[goal] = env.t;
    a.act = 0;
    a.goal = -1;
    a.rn = 0;
    a.ri = 0;
    a.bx = a.x;
    a.bz = a.z;
    a.linger = 4 + rnd(a) * 6;
    a.st = S_IDLE;
    a.tm = 1;
    return;
  }
  if (goal >= 0) {
    if (G.resv[goal] > 0) G.resv[goal]--;
    G.seen[goal] = env.t;
    a.bx = G.x[goal];
    a.bz = G.z[goal];
  } else {
    a.bx = a.x;
    a.bz = a.z;
  }
  a.rn = 0;
  a.ri = 0;
  a.linger = lingerFor(env, a);
  a.tm = 1 + rnd(a) * 2;
  if (a.doing === TAG_WATER && goal >= 0 && !Number.isNaN(G.face[goal])) {
    a.st = S_DRINK;
    a.tm = 9 + rnd(a) * 8;
    a.act = G.face[goal];
    a.drank = env.hour;
  } else a.st = S_IDLE;
}

/** the leader travels its route */
function travel(env: FaunaEnv, a: Agent, dt: number) {
  const G = env.graph;
  const T = TUNE[a.kind];
  if (a.rn <= 0 || a.ri >= a.rn) {
    arrive(env, a);
    return;
  }
  const node = env.routes[a.id * RMAX + a.ri];
  const last = a.ri >= a.rn - 1;
  // keep the herd together: slow down when someone has fallen behind
  const lag = a.group >= 0 ? env.lag[a.group] : 0;
  const sp = T.walk * (a.cls === C_GIANT ? 1 : 1.15) * (lag > 10 ? 0.35 : lag > 5 ? 0.7 : 1);
  const d = goTo(env, a, G.x[node], G.z[node], sp, dt);
  // getting nowhere (boxed in by another herd, the kid, its own herd on a narrow trail): find another way
  if (d >= 0 && d < a.prog - 0.3) {
    a.prog = d;
    a.stuck = 0;
  } else a.stuck += dt;
  if (a.stuck > 9) {
    a.stuck = 0;
    a.act += 1;
    if (a.act > 2 || !routeTo(env, a, a.goal)) {
      a.act = 0;
      arrive(env, a);
    }
    return;
  }
  if (d >= 0 && d < (last ? 2.2 : 2.8)) {
    a.ri++;
    a.prog = 1e9;
    a.stuck = 0;
    if (a.ri >= a.rn) {
      a.act = 0;
      arrive(env, a);
    }
  }
}

/** a follower's place in the moving herd (leader-local offset) */
function slotOf(L: Agent, a: Agent, out: { x: number; z: number }) {
  const s = Math.sin(L.yaw);
  const c = Math.cos(L.yaw);
  out.x = L.x + c * a.sx - s * a.sz;
  out.z = L.z - s * a.sx - c * a.sz;
  return out;
}

/** a follower keeps its place while the herd travels; -1 boxed in */
function keepPlace(env: FaunaEnv, a: Agent, L: Agent, dt: number): number {
  const T = TUNE[a.kind];
  slotOf(L, a, tmpP);
  const dx = tmpP.x - a.x;
  const dz = tmpP.z - a.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (a.group >= 0 && d > env.lagNext[a.group]) env.lagNext[a.group] = d;
  if (d < 0.5) {
    a.v = ease(a.v, L.v * 0.9, dt * 4);
    turnTo(a, L.yaw, T.turn * 0.5, dt);
    moveFwd(env, a, a.v * dt);
    return d;
  }
  const sp = clamp(L.v * 1.05 + d * 0.5, 0.3, d > 12 ? T.run * 0.85 : T.walk * 2.2);
  if (!passable(env, a, tmpP.x, tmpP.z)) {
    // its place is off the path (a narrow trail): fall in behind instead, in its own row
    const back = a.sz + (a.sx > 0 ? Math.max(1.5, Math.abs(a.sx) * 2.5) : 0);
    tmpP.x = L.x - Math.sin(L.yaw) * back;
    tmpP.z = L.z - Math.cos(L.yaw) * back;
  }
  const r = goTo(env, a, tmpP.x, tmpP.z, sp, dt);
  if (r < 0) return goTo(env, a, L.x, L.z, sp, dt);
  return r;
}

// ── the kid's little shows ──

/** now and then: send an animal across the path just ahead of the kid, or over to a kid standing still */
function director(env: FaunaEnv, kid: KidSense, dt: number) {
  env.dirT -= dt;
  if (env.dirT > 0 || !kid.ground) return;
  env.dirT = 7 + envRnd(env) * 7;
  const G = env.graph;
  const moving = kid.speed > 1.2;
  // the point the show happens at: ~24 m ahead of a walking kid, or round a kid standing still
  const px = moving ? kid.x + kid.dx * 24 : kid.x;
  const pz = moving ? kid.z + kid.dz * 24 : kid.z;
  let best: Agent | null = null;
  let bd = Infinity;
  for (let i = 0; i < env.agents.length; i++) {
    const a = env.agents[i];
    if (a.cls === C_NONE || a.lead >= 0 || a.cool > 0 || a.present < 0.9) continue;
    if (a.st !== S_IDLE && a.st !== S_WALK) continue;
    const dx = a.x - px;
    const dz = a.z - pz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 6 || d > 46) continue;
    if (d < bd) {
      bd = d;
      best = a;
    }
  }
  if (!best) return;
  const a = best;
  const sideA = moving ? kid.dx * (a.z - kid.z) - kid.dz * (a.x - kid.x) : 0;
  let goal = -1;
  let gs = -Infinity;
  const from = nearestNode(G, env.g, a.cls, a.x, a.z, 32);
  if (from < 0) return;
  for (let i = 0; i < G.n; i++) {
    if (!G.ok[a.cls][i] || G.comp[a.cls][i] !== G.comp[a.cls][from] || i === from) continue;
    const x = G.x[i];
    const z = G.z[i];
    const dx = x - px;
    const dz = z - pz;
    const d = Math.sqrt(dx * dx + dz * dz);
    let s: number;
    if (moving) {
      // across the kid's line, a little ahead of the meeting point
      const side = kid.dx * (z - kid.z) - kid.dz * (x - kid.x);
      if (side * sideA > 0 || Math.abs(side) < 4) continue;
      const ahead = kid.dx * (x - kid.x) + kid.dz * (z - kid.z);
      if (ahead < 14 || ahead > 44) continue;
      s = -d * 0.2 - Math.abs(Math.abs(side) - 9) * 0.15;
    } else {
      // round the kid, a friendly distance off
      const dk = Math.hypot(x - kid.x, z - kid.z);
      if (dk < 7 || dk > 16) continue;
      s = -Math.abs(dk - 10) * 0.3;
    }
    s -= G.resv[i] * 2;
    if (s > gs) {
      gs = s;
      goal = i;
    }
  }
  if (goal < 0) return;
  if (routeTo(env, a, goal)) {
    a.doing = TAG_OPEN;
    a.cool = 70 + rnd(a) * 50;
  }
}

/** can this one tag along behind the kid */
const followerType = (a: Agent) => (a.role === R_LAMB || a.role === R_JOEY || (a.role === R_KIT && (a.kind === K_FOX || a.kind === K_EMU || a.kind === K_GOAT))) && a.present > 0.9;

function stepFollow(env: FaunaEnv, a: Agent, kid: KidSense, dt: number, t: number): boolean {
  const T = TUNE[a.kind];
  a.tm -= dt;
  const dk = kidDist(a, kid);
  if (a.tm <= 0 || !kid.ground || dk > 34 || (kid.speed > RUN_SPEED * 1.6 && dk > 14)) {
    a.st = S_WALK;
    a.cool = 50 + rnd(a) * 40;
    env.followers = Math.max(0, env.followers - 1);
    const L = a.lead >= 0 ? env.agents[a.lead] : null;
    a.tx = L ? L.x : a.hx;
    a.tz = L ? L.z : a.hz;
    a.tm = 40;
    return false;
  }
  lookKid = true;
  // a spot just behind the kid's shoulder (its own side)
  const side = a.seed % 2 > 1 ? 1 : -1;
  const back = 2.4 + TUNE[a.kind].body * a.s * 2;
  const hx = kid.speed > 0.6 ? kid.dx : Math.sin(a.yaw);
  const hz = kid.speed > 0.6 ? kid.dz : Math.cos(a.yaw);
  const tx = kid.x - hx * back + hz * side * 1.2;
  const tz = kid.z - hz * back - hx * side * 1.2;
  const d = Math.hypot(tx - a.x, tz - a.z);
  if (d > 0.6) goTo(env, a, tx, tz, clamp(d * 1.6, 0.5, T.run * 0.9), dt);
  else {
    a.v = ease(a.v, 0, dt * 4);
    turnTo(a, kidYaw(a, kid), T.turn, dt);
    // a happy little bounce while it waits
    if (kid.still > 1.5) lf += Math.max(0, Math.sin(t * 5 + a.seed)) * 0.12 * a.s;
  }
  return true;
}

// ── grazers and roamers ──

const GRAZE_BOUNCE = new Set([K_DEER, K_RABBIT, K_HORSE, K_GOAT, K_SHEEP, K_ZEBRA, K_KANGAROO]);

function stepGrazer(env: FaunaEnv, a: Agent, kid: KidSense, dt: number, t: number, glow: number) {
  const T = TUNE[a.kind];
  const dk = kidDist(a, kid);
  let active = activeNow(a, glow, env.hour);
  const L = a.lead >= 0 ? env.agents[a.lead] : null;
  const roams = a.cls !== C_NONE;
  // fox kits dive into the den when the kid comes near (but peek out if they stand still a while)
  if (a.kind === K_FOX && a.role === R_KIT && a.st !== S_FOLLOW && kid.ground && dk < (kid.still > 5 ? 4.5 : 10) && a.shy > 0.5) active = false;
  const running = kid.ground && kid.speed > RUN_SPEED;
  const fleeR = a.role === R_VIXEN ? 6 : T.fleeR * (a.st === S_FOLLOW ? 0 : 1);
  const scared = running && dk < fleeR && kid.speed > RUN_SPEED * (a.cls === C_GIANT ? 1.6 : 1);
  a.calm = scared ? 0 : a.calm + dt;
  a.alert = ease(a.alert, kid.ground && dk < T.noticeR ? (kid.speed > 0.5 ? 1 : 0.6) : 0, dt * 2.5);
  const dusk = clamp(1 - Math.abs(glow - 0.55) / 0.45, 0, 1);

  if (!active && a.st !== S_HIDE && a.st !== S_FLEE) {
    if (a.st === S_ROAM && a.goal >= 0 && env.graph.resv[a.goal] > 0) env.graph.resv[a.goal]--;
    if (a.st === S_FOLLOW) env.followers = Math.max(0, env.followers - 1);
    a.st = S_HIDE;
  }
  let grazing = false;
  switch (a.st) {
    case S_HIDE: {
      if (active) {
        a.want = 1;
        if (a.present > 0.95) {
          a.st = S_IDLE;
          a.tm = 1 + rnd(a) * 2;
          a.bx = a.x;
          a.bz = a.z;
        }
        a.v = 0;
        break;
      }
      const r = goTo(env, a, a.cx, a.cz, a.kind === K_FOX && a.role === R_KIT ? T.run * 0.7 : T.walk * 1.8, dt);
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
          a.bx = a.x;
          a.bz = a.z;
          if (roams && !L) a.linger = Math.min(a.linger, 4 + rnd(a) * 6);
        } else pickFlee(a, kid);
      }
      break;
    }
    case S_FOLLOW: {
      if (!stepFollow(env, a, kid, dt, t)) break;
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
      if (a.kind !== K_HORSE && a.kind !== K_GIRAFFE && a.kind !== K_ELEPHANT && a.kind !== K_EMU) tk = 0.85;
      hp = a.kind === K_HORSE || a.kind === K_ZEBRA ? 0.75 : a.kind === K_GIRAFFE ? 0.3 : 0.35;
      const resting = roams && !L && env.phase === P_NIGHT && a.doing === TAG_SHADE && !nightOwl(a);
      if (!sleepyNow(a, glow) && !resting) {
        a.st = S_IDLE;
        a.tm = 2 + rnd(a) * 2;
      }
      if (roams && !L) {
        a.linger -= dt;
        if (a.linger <= 0 || (resting && env.phase !== P_NIGHT)) {
          a.st = S_IDLE;
          a.linger = 0;
        }
      }
      // followers lie down with their leader, get up with it
      if (L && L.st !== S_SLEEP && !sleepyNow(a, glow)) a.st = S_IDLE;
      break;
    }
    case S_CURL: {
      // hedgehog / echidna: a spiky ball until the kid goes away
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
      paddockPoint(p, Math.sin(th) * (p.hw - 3), Math.cos(th) * (p.hd - 3), tmpP);
      goTo(env, a, tmpP.x, tmpP.z, T.run * (a.role === R_KIT ? 0.8 : 0.72), dt);
      break;
    }
    case S_ROAM: {
      if (!L) travel(env, a, dt);
      else if (L.st !== S_ROAM && L.st !== S_FLEE) {
        // the herd has arrived: graze round the leader
        a.st = S_IDLE;
        a.tm = 0.5 + rnd(a) * 2;
      } else if (keepPlace(env, a, L, dt) < 0) a.v = 0;
      break;
    }
    case S_DRINK: {
      // at the water's edge: face the water, head right down
      a.v = ease(a.v, 0, dt * 4);
      turnTo(a, a.act, T.turn * 0.6, dt);
      a.tm -= dt;
      hp = T.graze * 1.05 + Math.sin(t * 3 + a.seed) * 0.06;
      if (a.kind === K_GIRAFFE) {
        // (a giraffe splays its front legs to reach down)
        hp = 1.1;
        lf = -0.12 * a.s;
      }
      if (a.tm <= 0) {
        a.st = S_IDLE;
        a.tm = 2 + rnd(a) * 3;
      }
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
      if (L && L.present > 0.5) {
        // followers keep up with their leader (and set off when the herd does)
        if (L.st === S_ROAM && roams) {
          a.st = S_ROAM;
          break;
        }
        if (L.st === S_DRINK && roams && a.drank !== env.hour) {
          // drink alongside
          slotOf(L, a, tmpP);
          const s = Math.sin(L.yaw);
          const c = Math.cos(L.yaw);
          const side = a.sx >= 0 ? 1 : -1;
          a.tx = L.x + c * side * (TUNE[a.kind].body * a.s + TUNE[L.kind].body * L.s + 0.6) + s * 0.4;
          a.tz = L.z - s * side * (TUNE[a.kind].body * a.s + TUNE[L.kind].body * L.s + 0.6) + c * 0.4;
          if (Math.hypot(a.tx - a.x, a.tz - a.z) > 0.6) goTo(env, a, a.tx, a.tz, T.walk, dt);
          else {
            hp = T.graze * 1.05;
            turnTo(a, L.yaw, T.turn * 0.5, dt);
            grazing = false;
          }
          break;
        }
        if (L.st === S_SLEEP && sleepyNow(L, glow)) a.st = S_SLEEP;
        const lx = L.x - a.x;
        const lz = L.z - a.z;
        const keep = 4 + TUNE[a.kind].body * a.s * 4;
        if (lx * lx + lz * lz > keep * keep) a.tm = 0;
      } else if (roams) {
        // a leader / wanderer: graze here a while, then move on (sooner if the day has moved on)
        a.linger -= dt;
        const want = wantTags(a, env.phase, env.hour);
        if (!(want & a.doing) && a.linger > 6) a.linger = 3 + rnd(a) * 5;
        if (env.phase === P_NIGHT && a.doing === TAG_SHADE && a.linger > 0 && !nightOwl(a)) a.st = S_SLEEP;
        if (a.linger <= 0) {
          a.linger = 8 + rnd(a) * 8;
          if (startRoam(env, a)) break;
        }
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
  if (a.st !== S_HIDE && a.present > 0.5 && a.st !== S_FOLLOW) {
    const spiky = a.kind === K_HEDGEHOG || a.kind === K_ECHIDNA;
    if (spiky) {
      if (a.st !== S_CURL && kid.ground && (dk < 2.4 || scared)) {
        if (a.st === S_ROAM && a.goal >= 0 && env.graph.resv[a.goal] > 0) env.graph.resv[a.goal]--;
        a.st = S_CURL;
        a.tm = 4 + rnd(a) * 3;
        a.rn = 0;
      }
    } else if (scared && a.st !== S_FLEE && T.fleeR > 0) {
      if (a.st === S_ROAM && a.goal >= 0 && env.graph.resv[a.goal] > 0) env.graph.resv[a.goal]--;
      a.st = S_FLEE;
      a.tm = 2.5 + rnd(a) * 2;
      a.rn = 0;
      if (a.kind === K_HORSE) {
        a.st = S_CANTER;
        a.tm = 5;
      } else pickFlee(a, kid);
    } else if (a.st === S_IDLE || a.st === S_WALK) {
      const curiousType = T.curiousR > 0 && (a.shy < 0.55 || a.kind === K_HORSE || a.kind === K_COW || a.kind === K_EMU);
      if (followerType(a) && env.followers < 2 && kid.ground && dk < 9 && kid.speed < 4.5 && a.calm > 4 && a.cool <= 0 && rnd(a) < dt * 0.25) {
        a.st = S_FOLLOW;
        a.tm = 22 + rnd(a) * 18;
        env.followers++;
      } else if (curiousType && kid.ground && kid.still > 2.5 && dk < T.curiousR && dk > T.stopR + T.body * a.s + 0.6 && a.calm > 5) a.st = S_CURIOUS;
      else if (sleepyNow(a, glow)) a.st = S_SLEEP;
      else if (a.kind === K_HORSE && env.paddock && noise2(t * 0.02, a.group * 7.1, 5) > 0.82) {
        a.st = S_CANTER;
        a.tm = 0;
      }
    }
  }

  // pose
  if (a.st !== S_CURIOUS && a.st !== S_SLEEP && a.st !== S_CURL && a.st !== S_DRINK && !(a.st === S_IDLE && hp !== 0)) headFor(a, kid, t, grazing);
  const bounder = GRAZE_BOUNCE.has(a.kind);
  gait(a, T, dt, bounder ? T.walk * 2.4 : 1e9);
  switch (a.kind) {
    case K_RABBIT:
      // rabbits always hop
      a.bound = 1;
      lf += Math.abs(Math.sin(a.phase * 0.5)) * 0.2 * a.s * Math.min(1, a.stride * 1.4);
      if (a.st === S_IDLE && a.alert > 0.5) pp = -0.35; // sits up, ears high
      break;
    case K_KANGAROO: {
      // kangaroos hop (big hind feet together), lean on the tail to graze, sit up tall to look
      a.bound = 1;
      const hop = Math.min(1, a.stride * 1.2);
      lf += Math.abs(Math.sin(a.phase * 0.5)) * 0.42 * a.s * hop;
      if (hop > 0.15) pp += 0.32 * hop - Math.cos(a.phase) * 0.12 * hop;
      else if (a.st === S_IDLE && a.alert > 0.45) pp -= 0.28; // up on its toes, looking
      else if (grazing) pp += 0.3;
      break;
    }
    case K_DEER:
      lf += Math.abs(Math.sin(a.phase * 0.5)) * 0.32 * a.s * a.bound;
      break;
    case K_HORSE:
    case K_GOAT:
    case K_SHEEP:
    case K_ZEBRA:
      lf += Math.abs(Math.sin(a.phase * 0.5)) * 0.12 * a.s * a.bound;
      // lambs and kids skip about (pronking) when they run
      if ((a.role === R_LAMB || a.role === R_KIT) && a.v > T.walk * 1.4) lf += Math.abs(Math.sin(a.phase * 0.5)) * 0.25 * a.s;
      break;
    case K_EMU:
      // the head bobs back and forth with every step
      hp += Math.sin(a.phase * 2) * 0.16 * Math.min(1, a.stride);
      break;
    case K_WOMBAT:
    case K_ECHIDNA:
    case K_HEDGEHOG:
      // a waddle
      rl = Math.sin(a.phase) * 0.1 * Math.min(1, a.stride);
      break;
    case K_ELEPHANT:
      rl = Math.sin(a.phase) * 0.03 * Math.min(1, a.stride);
      break;
    default:
      break;
  }
  if (a.kind === K_GIRAFFE && a.st === S_IDLE && grazing) {
    // giraffes browse the treetops rather than the grass
    hp = -0.25 + Math.sin(t * 0.8 + a.seed) * 0.12;
  }
  a.ear = flick(t, a.seed, 0) * 0.6 + (a.alert > 0.5 ? Math.sin(t * 1.3 + a.seed) * 0.1 : 0);
  if (a.kind === K_ELEPHANT) {
    // the big ears fan slowly; the trunk sways (and curls up to drink)
    a.ear = 0.15 + Math.sin(t * 0.9 + a.seed) * 0.22;
    a.wing = a.st === S_DRINK ? 0.6 + Math.max(0, Math.sin(t * 0.7 + a.seed)) * 1.2 : Math.sin(t * 0.6 + a.seed) * 0.18 + a.stride * Math.sin(a.phase) * 0.12;
  }
  if (a.kind === K_HORSE || a.kind === K_COW || a.kind === K_ZEBRA || a.kind === K_GIRAFFE || a.kind === K_ELEPHANT) a.tail = Math.sin(t * 1.7 + a.seed) * 0.35 + flick(t, a.seed, 1) * 0.5;
  else if (a.kind === K_FOX) a.tail = Math.sin(t * 2.2 + a.seed) * 0.18 + a.stride * Math.sin(a.phase) * 0.15;
  else if (a.kind === K_GOAT || a.kind === K_DEER || a.kind === K_SHEEP) a.tail = flick(t, a.seed, 1) * 0.5;
  else if (a.kind === K_KANGAROO) a.tail = Math.sin(t * 0.7 + a.seed) * 0.08;
  else a.tail = 0;
  // deer flash their white tails when startled; goats and foxes carry theirs up; a hopping roo's tail swings up
  a.tailLift =
    a.kind === K_DEER ? (a.st === S_FLEE || a.alert > 0.8 ? 1.1 : 0) : a.kind === K_FOX ? 0.15 + a.bound * 0.3 : a.kind === K_GOAT ? 0.4 : a.kind === K_KANGAROO ? -0.15 + Math.min(1, a.stride) * 0.35 : 0;
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
  const active = activeNow(a, glow, env.hour);
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

// ── koalas: dozing in a fork of the trunk all day, waking and munching at dusk ──

/** low in the fork of the trunk, under the canopy's edge, where a kid (and the camera) can see it */
function koalaPerch(t: TreeLite) {
  return Math.min(climbTop(t) * 0.6, 1.55 * t.s);
}

function stepKoala(env: FaunaEnv, a: Agent, kid: KidSense, dt: number, t: number) {
  const tree = a.tree >= 0 ? env.trees[a.tree] : null;
  slopeFit = false;
  if (!tree) return;
  const dk = kidDist(a, kid);
  const awake = env.phase === P_DUSK || env.phase === P_NIGHT || env.phase === P_DAWN;
  a.alert = ease(a.alert, kid.ground && dk < TUNE[K_KOALA].noticeR ? 1 : 0, dt * 1.5);
  // stand it a little proud of the bark (not flattened against it) so its round grey shape reads
  // as its own silhouette instead of a bump on the trunk
  const R = trunkR(tree) + 0.32 * a.s;
  const top = koalaPerch(tree);
  if (a.st === S_IN_TREE) {
    a.climb = ease(a.climb, top, dt * 2);
    a.tm -= dt;
    // now and then (awake) it shuffles round the trunk to face the kid
    if (awake && a.alert > 0.6) a.act = wrapAngle(a.act + clamp(wrapAngle(kidYaw(a, kid) - a.act), -0.2 * dt, 0.2 * dt));
    if (awake && a.tm <= 0 && rnd(a) < 0.0005 * 60 * dt && !(kid.ground && dk < 8)) {
      a.st = S_CLIMB_DOWN;
    }
  } else if (a.st === S_CLIMB_DOWN) {
    a.climb -= dt * 0.45;
    if (a.climb <= 0.05) {
      a.climb = 0;
      a.st = S_WALK;
      // step off the trunk onto clear ground (round the tree if another trunk's in the way)
      for (let k = 0; k < 12; k++) {
        const ang = a.act + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.55;
        const x = tree.x + Math.sin(ang) * (R + 0.9);
        const z = tree.z + Math.cos(ang) * (R + 0.9);
        if (passable(env, a, x, z) && !(bitsAt(env.g, x, z) & B_BLOCK)) {
          a.x = x;
          a.z = z;
          a.act = ang;
          break;
        }
      }
      a.yaw = a.act;
      a.tm = 6 + rnd(a) * 6;
    }
  } else if (a.st === S_WALK) {
    // a little amble round the foot of its tree, then back up
    a.tm -= dt;
    const ang = a.act + Math.sin(t * 0.2 + a.seed) * 1.2;
    goTo(env, a, tree.x + Math.sin(ang) * (R + 1.9), tree.z + Math.cos(ang) * (R + 1.9), TUNE[K_KOALA].walk, dt);
    if (a.tm <= 0 || (kid.ground && dk < 5) || !awake) a.st = S_CLIMB_UP;
  } else {
    // S_CLIMB_UP (and anything else)
    const ang = Math.atan2(a.x - tree.x, a.z - tree.z);
    if (a.climb <= 0.01) {
      const r = goTo(env, a, tree.x + Math.sin(ang) * R, tree.z + Math.cos(ang) * R, TUNE[K_KOALA].run, dt, 6);
      if (r < 0 || r < 0.3) a.climb = 0.02;
      a.act = ang;
      a.st = S_CLIMB_UP;
    } else {
      a.st = S_CLIMB_UP;
      a.climb += dt * 0.55;
      if (a.climb >= top) {
        a.st = S_IN_TREE;
        a.tm = 60 + rnd(a) * 80;
      }
    }
  }
  const onTrunk = a.st !== S_WALK && a.climb > 0.01;
  if (onTrunk) {
    // hugging the trunk, facing it, bottom down
    a.x = tree.x + Math.sin(a.act) * R;
    a.z = tree.z + Math.cos(a.act) * R;
    a.y = tree.y - 0.15 * tree.s + a.climb;
    a.yaw = a.act + Math.PI;
    pp = -Math.PI / 2 + 0.25;
    a.stride = a.st === S_IN_TREE ? 0 : 0.8;
    if (a.st !== S_IN_TREE) a.phase += dt * 5;
    // looking over its shoulder: awake it watches the kid, asleep its head droops
    if (a.st === S_IN_TREE) {
      if (awake && a.alert > 0.3) {
        lookKid = true;
        hy = clamp(wrapAngle(kidYaw(a, kid) - a.yaw), -1.4, 1.4) * 0.8;
        hp = 0.2;
      } else if (awake) {
        // munching gum leaves
        hy = Math.sin(t * 0.4 + a.seed) * 0.6;
        hp = 0.15 + Math.max(0, Math.sin(t * 6 + a.seed)) * 0.08;
      } else {
        hp = 0.7 + Math.sin(t * 0.3 + a.seed) * 0.05;
        hy = 0.5;
      }
    }
  } else {
    a.y = groundY(a.x, a.z);
    gait(a, TUNE[K_KOALA], dt, 1e9);
    rl = Math.sin(a.phase) * 0.08 * Math.min(1, a.stride);
  }
  a.ear = flick(t, a.seed, 0) * 0.3;
  a.tail = 0;
}

// ── owls and kookaburras ──

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

/** kookaburras: by day on a branch above the trail; they laugh at dawn and dusk (and at a kid below) */
function stepKookaburra(env: FaunaEnv, a: Agent, kid: KidSense, dt: number, t: number) {
  const T = TUNE[K_KOOKABURRA];
  a.want = 1;
  slopeFit = false;
  const dx = kid.x - a.x;
  const dz = kid.z - a.z;
  const dh = Math.sqrt(dx * dx + dz * dz);
  const night = env.phase === P_NIGHT;
  a.tm -= dt;
  if (a.st === S_CALL) {
    // the laugh: head thrown back, beak clacking open, tail pumping
    const u = a.tm;
    hp = -0.55 + Math.sin(t * 2.2) * 0.1;
    a.wing = 0.25 + Math.abs(Math.sin(t * 17 + a.seed)) * 0.55;
    a.tail = 0;
    a.tailLift = Math.sin(t * 9) * 0.3;
    if (u <= 0) {
      a.st = S_IDLE;
      a.tm = 8 + rnd(a) * 20;
    }
  } else {
    a.st = S_IDLE;
    if (night) {
      hp = 0.6;
      hy = 0.4;
    } else if (kid.ground && dh < T.noticeR) {
      hy = clamp(wrapAngle(Math.atan2(dx, dz) - a.yaw), -1.6, 1.6);
      hp = clamp(Math.atan2(a.y - kid.y - 1, Math.max(1, dh)) * 0.6, -0.2, 0.6);
    } else {
      hy = Math.sin(t * 0.3 + a.seed) * 0.9;
      hp = 0.15 + Math.sin(t * 0.5 + a.seed) * 0.08;
    }
    a.wing = Math.max(0, flick(t, a.seed, 3)) * 0.3;
    a.tailLift = flick(t, a.seed, 4) * 0.4;
    const chorus = env.phase === P_DAWN || env.phase === P_DUSK;
    if (!night && a.tm <= 0 && (chorus || (kid.ground && dh < 12 && kid.still > 1.5) || rnd(a) < 0.15)) {
      a.st = S_CALL;
      a.tm = 2.2 + rnd(a) * 1.6;
    } else if (a.tm <= 0) a.tm = 6 + rnd(a) * 14;
  }
  lf = Math.sin(t * 1.4 + a.seed) * 0.006;
  a.ear = 0;
}

// ── ducks (and the platypus on the same pond) ──

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
    const back = 0.32 * (L.s + a.s) + 0.08;
    const tx = L.x - Math.sin(L.yaw) * back;
    const tz = L.z - Math.cos(L.yaw) * back;
    const dx = tx - a.x;
    const dz = tz - a.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.1) goTo(env, a, tx, tz, clamp(d * 2.2, 0.2, T.run * 1.2), dt, 7);
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
  gait(a, T, dt, 1e9);
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

/** the platypus: paddles the pond at dawn, dusk and by night, diving for a few seconds at a time */
function stepPlatypus(env: FaunaEnv, a: Agent, kid: KidSense, dt: number, t: number, glow: number) {
  const T = TUNE[K_PLATYPUS];
  const dk = kidDist(a, kid);
  slopeFit = false;
  const active = activeNow(a, glow, env.hour);
  a.tm -= dt;
  if (!active) {
    // tucked up in its bank burrow (under the water's edge)
    a.want = 0;
    a.v = 0;
  } else if (a.st === S_DIVE) {
    a.want = 1;
    const r = goTo(env, a, a.tx, a.tz, T.walk * 1.4, dt);
    if (a.tm <= 0 || r < 0) {
      a.st = S_IDLE;
      a.tm = 4 + rnd(a) * 6;
    }
  } else {
    a.want = 1;
    a.st = a.st === S_WALK ? S_WALK : S_IDLE;
    const scared = kid.ground && (dk < 2.5 || (kid.speed > RUN_SPEED && dk < T.fleeR));
    if (a.st === S_WALK) {
      const r = goTo(env, a, a.tx, a.tz, T.walk, dt);
      if (r < 0 || r < 0.3) {
        a.st = S_IDLE;
        a.tm = 2 + rnd(a) * 4;
      }
    } else a.v = ease(a.v, 0, dt * 2);
    if (a.tm <= 0 || scared) {
      const ang = rnd(a) * TAU;
      const d = Math.sqrt(rnd(a)) * (POND.r - 1.3);
      a.tx = POND.x + Math.sin(ang) * d;
      a.tz = POND.z + Math.cos(ang) * d;
      if (scared || rnd(a) < 0.5) {
        a.st = S_DIVE;
        a.tm = 3 + rnd(a) * 4;
      } else {
        a.st = S_WALK;
        a.tm = 12;
      }
    }
  }
  const dive = a.st === S_DIVE ? 1 : 0;
  a.act = ease(a.act, dive, dt * 3);
  a.y = env.g.pondY - 0.02 - a.act * 0.35;
  gait(a, T, dt, 1e9);
  pp = 0.15 * a.act;
  lf = Math.sin(t * 2 + a.seed) * 0.01;
  rl = Math.sin(a.phase) * 0.12 * Math.min(1, a.stride);
  hy = Math.sin(t * 0.9 + a.seed) * 0.4;
  hp = -0.05;
  a.tail = Math.sin(a.phase * 0.5) * 0.4 * Math.min(1, a.stride + 0.2);
  a.ear = 0;
}

// ── chickens: scratching and pecking round the farm, chicks behind their mother, a rooster at dawn ──

function stepChicken(env: FaunaEnv, a: Agent, kid: KidSense, dt: number, t: number, glow: number) {
  const T = TUNE[K_CHICKEN];
  const dk = kidDist(a, kid);
  const active = activeNow(a, glow, env.hour);
  const L = a.lead >= 0 ? env.agents[a.lead] : null;
  const scared = kid.ground && (dk < 1.6 || (kid.speed > RUN_SPEED && dk < T.fleeR));
  a.calm = scared ? 0 : a.calm + dt;
  a.alert = ease(a.alert, kid.ground && dk < T.noticeR ? 1 : 0, dt * 3);
  let pecking = false;
  if (!active) {
    // into the coop for the night
    const r = goTo(env, a, a.cx, a.cz, T.walk * 1.6, dt);
    if (r < 0 || r < 0.5) a.want = 0;
  } else {
    a.want = 1;
    if (a.present < 0.9) {
      a.v = 0;
    } else if (scared) {
      // a flappy dash away
      if (a.st !== S_FLEE) {
        a.st = S_FLEE;
        pickFlee(a, kid);
        a.tm = 1.5;
      }
    }
    switch (a.st) {
      case S_FLEE: {
        a.tm -= dt;
        const r = goTo(env, a, a.tx, a.tz, T.run, dt);
        a.wing = 0.5 + Math.abs(Math.sin(t * 20)) * 0.8;
        if (r < 0 || r < 0.5 || a.tm <= 0) {
          a.st = S_IDLE;
          a.tm = 1 + rnd(a) * 2;
        }
        break;
      }
      case S_CALL: {
        // cock-a-doodle-doo: up on its toes, head back, wings out
        a.tm -= dt;
        a.v = ease(a.v, 0, dt * 6);
        hp = -0.6;
        lf = 0.05 * a.s;
        a.wing = 0.4 + Math.sin(t * 8) * 0.2;
        if (a.tm <= 0) {
          a.st = S_IDLE;
          a.tm = 3;
        }
        break;
      }
      case S_WALK: {
        a.tm -= dt;
        // a chick's mother doesn't wait for it: keep its target over her own walk too, not just
        // where she stood when it set out, or a long walk cycle can let her amble off far ahead
        if (L) {
          a.tx = L.x + a.sx;
          a.tz = L.z + a.sz;
        }
        const r = goTo(env, a, a.tx, a.tz, L ? clamp(Math.hypot(a.tx - a.x, a.tz - a.z) * 1.5, 0.2, T.run) : T.walk, dt);
        if (r < 0 || r < 0.25 || a.tm <= 0) {
          a.st = S_IDLE;
          a.tm = T.idleMin + rnd(a) * (T.idleMax - T.idleMin);
        }
        break;
      }
      default: {
        a.st = S_IDLE;
        a.v = ease(a.v, 0, dt * 5);
        a.tm -= dt;
        pecking = true;
        if (L) {
          // chicks: never far from mum
          const dx = L.x - a.x;
          const dz = L.z - a.z;
          if (dx * dx + dz * dz > 1.2) a.tm = 0;
        }
        if (a.tm <= 0) {
          if (a.role === R_ROOSTER && (env.phase === P_DAWN || rnd(a) < 0.08)) {
            a.st = S_CALL;
            a.tm = 1.8;
          } else {
            if (L) {
              a.sx = (rnd(a) - 0.5) * 0.9;
              a.sz = (rnd(a) - 0.5) * 0.9;
              a.tx = L.x + a.sx;
              a.tz = L.z + a.sz;
            } else pickWander(env, a, 0);
            a.st = S_WALK;
            a.tm = 10;
          }
        }
      }
    }
  }
  gait(a, T, dt, 1e9);
  // the head jerks forward with every step, and pecks the ground in little bursts
  if (pecking) {
    const burst = noise2(t * 0.5, a.seed, 15) > 0.45;
    hp = burst ? 1.0 + Math.max(0, Math.sin(t * 14 + a.seed)) * 0.35 : -0.05;
    hy = burst ? 0 : (noise2(t * 0.6, a.seed, 16) - 0.5) * 1.2;
  } else if (a.st !== S_CALL) {
    hp = Math.sin(a.phase * 2) * 0.22 * Math.min(1, a.stride);
    if (a.alert > 0.5 && kid.ground) hy = clamp(wrapAngle(kidYaw(a, kid) - a.yaw), -1.3, 1.3);
  }
  if (a.st !== S_FLEE && a.st !== S_CALL) a.wing = Math.max(0, flick(t, a.seed, 2)) * 0.6;
  rl = Math.sin(a.phase) * 0.1 * Math.min(1, a.stride);
  a.tail = flick(t, a.seed, 1) * 0.3;
  a.ear = 0;
  slopeFit = false;
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
  const active = activeNow(a, glow, env.hour);
  const scared = kid.ground && (dk < 2.2 || (dk < T.fleeR && kid.speed > 1));
  a.calm = scared ? 0 : a.calm + dt;
  slopeFit = true;
  a.bound = 1;
  if (a.st === S_HOP) {
    a.tm -= dt;
    const u = 1 - clamp(a.tm / 0.42, 0, 1);
    a.x = a.bx + (a.tx - a.bx) * u;
    a.z = a.bz + (a.tz - a.bz) * u;
    lf = Math.sin(Math.PI * u) * 0.32 * Math.max(a.s, 0.6);
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
        const d = 0.35 + rnd(a) * 0.5;
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
  const active = activeNow(a, glow, env.hour);
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
      if (!kid.ground || kid.still < 0.6 || dk > T.curiousR * 1.4 || (L && Math.hypot(a.x - L.x, a.z - L.z) > 14)) {
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
      const cx = L ? L.x - L.ax * 2.5 : a.hx;
      const cz = L ? L.z - L.az * 2.5 : a.hz;
      const r = goTo(env, a, a.tx, a.tz, T.run * 0.75, dt);
      if (r < 0 || r < 0.4 || a.tm <= 0) {
        const ang = rnd(a) * TAU;
        const d = 1.2 + rnd(a) * 3;
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
  if (a.role === R_MOTHER && a.st === S_FISH && kid.ground && dk < 11 && dk > 3.5) {
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
  gait(a, T, dt, 2.2);
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

const SLOPE_FIT = new Set([K_DEER, K_HORSE, K_COW, K_GOAT, K_BEAR, K_FOX, K_TURTLE, K_HEDGEHOG, K_SHEEP, K_ZEBRA, K_GIRAFFE, K_ELEPHANT, K_WOMBAT, K_ECHIDNA, K_KANGAROO, K_EMU]);
/** small animals (real size under ~0.5 m) glow softly when the kid's right by them; koalas are
 *  bigger but sit up in a tree, a long way from the camera's usual eye line, so they get the same
 *  helping hand */
const SMALL = new Set([K_RABBIT, K_SQUIRREL, K_HEDGEHOG, K_FROG, K_DUCK, K_TURTLE, K_ECHIDNA, K_PLATYPUS, K_CHICKEN, K_KOOKABURRA, K_OWL, K_FOX, K_KOALA]);

/** ease the pose toward the targets the behaviour set, and stand it on the ground */
function finish(a: Agent, kid: KidSense, dt: number) {
  const T = TUNE[a.kind];
  a.headPitch = ease(a.headPitch, hp, dt * 4);
  a.headYaw = ease(a.headYaw, hy, dt * (a.kind === K_OWL ? 6 : 3.5));
  a.tuck = ease(a.tuck, tk, dt * 3);
  if (slopeFit && SLOPE_FIT.has(a.kind)) {
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
  // the little ones' glow when the kid is close (so a true-size frog still reads)
  let h = 0;
  if (SMALL.has(a.kind) && kid.ground && a.present > 0.5) {
    const dx = a.x - kid.x;
    const dz = a.z - kid.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const R = 5 + SIZES[a.kind].m * 6;
    if (d < R) h = (1 - d / R) * 0.9;
  }
  a.hint = ease(a.hint, h, dt * 3);
}

/** rebuild the crowd map (animals per 16 m cell) */
function refreshOcc(env: FaunaEnv) {
  env.occ.fill(0);
  for (let i = 0; i < env.agents.length; i++) {
    const a = env.agents[i];
    if (a.present < 0.5) continue;
    const ci = Math.floor((a.x + 160) / 16);
    const cj = Math.floor((a.z + 160) / 16);
    if (ci < 0 || cj < 0 || ci >= 20 || cj >= 20) continue;
    const k = cj * 20 + ci;
    if (env.occ[k] < 250) env.occ[k]++;
  }
}

/** does it take part in the jostle (on the ground, drawn) */
const jostles = (a: Agent) =>
  a.present > 0.5 && a.kind !== K_OWL && a.kind !== K_KOOKABURRA && a.kind !== K_DUCK && a.kind !== K_PLATYPUS && !(a.kind === K_SQUIRREL && a.climb > 0) && !(a.kind === K_KOALA && a.climb > 0.01) && !(a.kind === K_FROG && a.st === S_HOP);

const PUSH_TURN = [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9];
/** nudge an animal `d` along (ux, uz), or round it if that's blocked (a narrow trail, a fence) */
function pushOut(env: FaunaEnv, a: Agent, ux: number, uz: number, d: number) {
  for (let k = 0; k < PUSH_TURN.length; k++) {
    const c = Math.cos(PUSH_TURN[k]);
    const s = Math.sin(PUSH_TURN[k]);
    const vx = ux * c + uz * s;
    const vz = -ux * s + uz * c;
    const nx = a.x + vx * d;
    const nz = a.z + vz * d;
    if (passable(env, a, nx, nz)) {
      a.x = nx;
      a.z = nz;
      return;
    }
  }
}

/** everyone keeps a little personal space (sheep included, who don't budge) */
function separate(env: FaunaEnv, dt: number) {
  const H = env.hash;
  const agents = env.agents;
  const N = agents.length;
  H.head.fill(-1);
  for (let i = 0; i < N; i++) {
    const a = agents[i];
    if (!jostles(a)) continue;
    const c = hashCell(a.x, a.z);
    if (c < 0) continue;
    H.next[i] = H.head[c];
    H.head[c] = i;
  }
  for (let k = 0; k < env.nSheep; k++) {
    const c = hashCell(env.sheep[k * 2], env.sheep[k * 2 + 1]);
    if (c < 0) continue;
    H.next[N + k] = H.head[c];
    H.head[c] = N + k;
  }
  const kpush = Math.min(0.5, dt * 6);
  const SHEEP_R = 0.95;
  for (let i = 0; i < N; i++) {
    const a = agents[i];
    if (!jostles(a)) continue;
    const Ra = TUNE[a.kind].body * a.s;
    const ci = Math.floor((a.x + HHALF) / HCELL);
    const cj = Math.floor((a.z + HHALF) / HCELL);
    // (the giants reach two cells)
    const reach = Ra > 1.4 ? 2 : 1;
    for (let dj = -reach; dj <= reach; dj++)
      for (let di = -reach; di <= reach; di++) {
        const ii = ci + di;
        const jj = cj + dj;
        if (ii < 0 || jj < 0 || ii >= HN || jj >= HN) continue;
        for (let j = H.head[jj * HN + ii]; j >= 0; j = H.next[j]) {
          if (j === i) continue;
          const sheep = j >= N;
          if (!sheep && j < i) continue; // (each pair once)
          const bx = sheep ? env.sheep[(j - N) * 2] : agents[j].x;
          const bz = sheep ? env.sheep[(j - N) * 2 + 1] : agents[j].z;
          const Rb = sheep ? SHEEP_R : TUNE[agents[j].kind].body * agents[j].s;
          // (a youngster can snuggle right up to its mother)
          const b = sheep ? null : agents[j];
          const family = b && (b.lead === a.id || a.lead === b.id);
          const snug = !family ? 0.92 : a.role === R_DUCKLING || b!.role === R_DUCKLING ? 0.5 : b!.kind === a.kind && (b!.s < a.s * 0.75 || a.s < b!.s * 0.75) ? 0.62 : 0.92;
          const min = (Ra + Rb) * snug;
          const dx = bx - a.x;
          const dz = bz - a.z;
          const d2 = dx * dx + dz * dz;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 1e-3;
          const ux = d2 > 1e-8 ? dx / d : 1;
          const uz = d2 > 1e-8 ? dz / d : 0;
          const over = (min - d) * kpush;
          if (sheep) {
            pushOut(env, a, -ux, -uz, over * 2);
            continue;
          }
          // the smaller one gives way more (round whatever's in the way)
          const wa = Rb / (Ra + Rb);
          pushOut(env, a, -ux, -uz, over * wa * 2);
          pushOut(env, b!, ux, uz, over * (1 - wa) * 2);
        }
      }
  }
}

/** step every animal one frame (dt ≤ 0.1 s); `hour` is the park's time of day (0..24) */
export function stepFauna(env: FaunaEnv, kid: KidSense, dt: number, t: number, glow: number, hour = 12) {
  const agents = env.agents;
  env.t = t;
  env.hour = hour;
  env.phase = phaseOf(hour);
  env.occT -= dt;
  if (env.occT <= 0) {
    env.occT = 1;
    refreshOcc(env);
  }
  // herd lag (measured by the followers last frame)
  for (let k = 0; k < env.lag.length; k++) {
    env.lag[k] = env.lagNext[k];
    env.lagNext[k] = 0;
  }
  director(env, kid, dt);
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    resetPose();
    if (a.cool > 0) a.cool -= dt;
    switch (a.kind) {
      case K_SQUIRREL:
        stepSquirrel(env, a, kid, dt, t, glow);
        break;
      case K_KOALA:
        stepKoala(env, a, kid, dt, t);
        break;
      case K_OWL:
        stepOwl(a, kid, dt, t, glow);
        break;
      case K_KOOKABURRA:
        stepKookaburra(env, a, kid, dt, t);
        break;
      case K_DUCK:
        stepDuck(env, a, kid, dt, t, glow);
        break;
      case K_PLATYPUS:
        stepPlatypus(env, a, kid, dt, t, glow);
        break;
      case K_CHICKEN:
        stepChicken(env, a, kid, dt, t, glow);
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
    const perched = a.kind === K_OWL || a.kind === K_KOOKABURRA || (a.kind === K_SQUIRREL && a.climb > 0) || (a.kind === K_KOALA && a.climb > 0.01);
    if (!perched && a.kind !== K_PLATYPUS) {
      avoidKid(env, a, kid, dt);
      if (a.kind !== K_DUCK) a.y = groundY(a.x, a.z);
    }
    finish(a, kid, dt);
  }
  separate(env, dt);
  // (at a slow frame rate a herd can bunch up in one long step: settle it twice)
  if (dt > 0.07) separate(env, dt);
  // (everyone bigger than a rabbit gets a last look round for sheep: shoved by a herd-mate into a
  // grazing sheep, they step back out of it — the sheep don't budge)
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!jostles(a)) continue;
    const R = TUNE[a.kind].body * a.s;
    if (R < 0.35) continue;
    for (let k = 0; k < env.nSheep; k++) {
      const dx = a.x - env.sheep[k * 2];
      const dz = a.z - env.sheep[k * 2 + 1];
      const min = (R + 0.95) * 0.92;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      pushOut(env, a, dx / d, dz / d, min - d);
    }
  }
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!jostles(a)) continue;
    kidClear(env, a, kid);
    if (a.kind !== K_DUCK) a.y = groundY(a.x, a.z);
  }
}

// ── the kid's body collision ──
// Animals already steer round the kid (avoidKid / the director), but a standing or a fast-walking
// kid can still end up inside a big one's body before it reacts. pushKid() (called by the engine
// every frame, next to its wildTrunkAt() push-out) shoves the kid's point back out of every nearby
// blocking animal's footprint: a circle (TUNE.body × a.s) for the stockier kinds, an ellipse
// stretched along the animal's heading (× BODY_LEN_MULT) for the longer-bodied ones — a cow or an
// elephant blocks broadside just as much as nose-on. Same two-step pattern as the dinosaurs'
// pushKid (lib/park/world/dino/herd.ts): a handful of passes (wedged between two bodies can need
// more than one), then — on the rare chance it's still stuck — a ring search for the nearest clear
// spot. Allocation-free; a cheap squared-distance test (no trig) skips everyone not close enough to
// matter.
function kidBlocked(a: Agent): boolean {
  if (!BLOCKS_KID[a.kind] || a.present < 0.5) return false;
  if (a.kind === K_KOALA && a.climb > 0.01) return false; // (up its tree)
  return true;
}
/** is (px, pz) inside kind `a`'s footprint ellipse, inflated by the kid's own radius */
function kidInEllipse(a: Agent, px: number, pz: number, kidR: number): boolean {
  const dx = px - a.x;
  const dz = pz - a.z;
  const base = TUNE[a.kind].body * a.s;
  const hw = base + kidR;
  const hl = base * (BODY_LEN_MULT[a.kind] ?? 1) + kidR;
  if (dx * dx + dz * dz > hl * hl) return false; // (cheap: no trig for anyone this far off)
  const sy = Math.sin(a.yaw);
  const cy = Math.cos(a.yaw);
  const along = dx * sy + dz * cy;
  const side = dx * cy - dz * sy;
  return (along * along) / (hl * hl) + (side * side) / (hw * hw) < 1;
}
/** is the kid, at radius kidR, inside anybody's footprint (and, if kidY given, at roughly their height) */
export function kidInsideAny(agents: Agent[], px: number, pz: number, kidR: number, kidY?: number): boolean {
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!kidBlocked(a)) continue;
    if (kidY !== undefined && (kidY > a.y + a.head + 0.5 || kidY < a.y - 1.3)) continue;
    if (kidInEllipse(a, px, pz, kidR)) return true;
  }
  return false;
}
/** one pass: push (pos.x, pos.z) out of every blocking animal it's inside; true if it moved anyone */
function pushKidOnce(agents: Agent[], pos: { x: number; z: number }, kidR: number, kidY: number | undefined): boolean {
  let moved = false;
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (!kidBlocked(a)) continue;
    if (kidY !== undefined && (kidY > a.y + a.head + 0.5 || kidY < a.y - 1.3)) continue;
    const dx = pos.x - a.x;
    const dz = pos.z - a.z;
    const base = TUNE[a.kind].body * a.s;
    const hw = base + kidR;
    const hl = base * (BODY_LEN_MULT[a.kind] ?? 1) + kidR;
    if (dx * dx + dz * dz > hl * hl) continue;
    const sy = Math.sin(a.yaw);
    const cy = Math.cos(a.yaw);
    const along = dx * sy + dz * cy;
    const side = dx * cy - dz * sy;
    const k = (along * along) / (hl * hl) + (side * side) / (hw * hw);
    if (k >= 1) continue;
    let along2: number;
    let side2: number;
    if (k < 1e-8) {
      // (dead centre: no direction to push along — out past the nose, an arbitrary but stable escape)
      along2 = hl;
      side2 = 0;
    } else {
      const scale = 1 / Math.sqrt(k);
      along2 = along * scale;
      side2 = side * scale;
    }
    pos.x = a.x + along2 * sy + side2 * cy;
    pos.z = a.z + along2 * cy - side2 * sy;
    moved = true;
  }
  return moved;
}
/**
 * Pushes (pos.x, pos.z) out of every nearby blocking animal's body so the kid can never walk
 * through one. `kidR` is the kid's own body radius; `kidY` (the kid's feet height), if given, lets
 * an animal well above or below the kid (up a slope, down in a dip) be skipped. Allocation-free;
 * cheap enough to call every frame. Returns whether it had to move the point at all.
 */
export function pushKid(agents: Agent[], pos: { x: number; z: number }, kidR: number, kidY?: number): boolean {
  let moved = false;
  let pass = 0;
  for (; pass < 8; pass++) {
    if (!pushKidOnce(agents, pos, kidR, kidY)) break;
    moved = true;
  }
  if (pass < 8) return moved;
  // (wedged between bodies with no room: the nearest free spot, in rings round where it got stuck)
  const x0 = pos.x;
  const z0 = pos.z;
  for (let ring = 1; ring <= 24; ring++) {
    const r = ring * 0.25;
    const n = 8 + ring * 2;
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * TAU;
      pos.x = x0 + Math.sin(ang) * r;
      pos.z = z0 + Math.cos(ang) * r;
      if (!kidInsideAny(agents, pos.x, pos.z, kidR, kidY)) return true;
    }
  }
  pos.x = x0;
  pos.z = z0;
  return moved;
}
