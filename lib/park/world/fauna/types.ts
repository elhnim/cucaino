// The land animals of Cucaino Park: shared types, the species table and the tuning of every kind.
// Pure data, no three.js (the plan and the behaviour steps are tested without a renderer).

/** animal kinds (behaviour) */
export const K_DEER = 0;
export const K_RABBIT = 1;
export const K_FOX = 2;
export const K_SQUIRREL = 3;
export const K_HEDGEHOG = 4;
export const K_HORSE = 5;
export const K_GOAT = 6;
export const K_COW = 7;
export const K_DUCK = 8;
export const K_FROG = 9;
export const K_OWL = 10;
export const K_BEAR = 11;
export const K_TURTLE = 12;
export const KINDS = 13;
export const KIND_NAMES = ["deer", "rabbit", "fox", "squirrel", "hedgehog", "horse", "goat", "cow", "duck", "frog", "owl", "bear", "turtle"];

/** instanced meshes (one draw call each); frogs, turtles and hedgehogs share the "critters" mesh */
export const M_DEER = 0;
export const M_RABBIT = 1;
export const M_FOX = 2;
export const M_SQUIRREL = 3;
export const M_HORSE = 4;
export const M_GOAT = 5;
export const M_COW = 6;
export const M_DUCK = 7;
export const M_OWL = 8;
export const M_BEAR = 9;
export const M_CRITTER = 10;
export const MESHES = 11;
export const MESH_NAMES = ["deer", "rabbits", "foxes", "squirrels", "horses", "goats", "cows", "ducks", "owls", "bears", "critters"];
export const MESH_OF: number[] = [M_DEER, M_RABBIT, M_FOX, M_SQUIRREL, M_CRITTER, M_HORSE, M_GOAT, M_COW, M_DUCK, M_CRITTER, M_OWL, M_BEAR, M_CRITTER];
/** critter mesh variants (which animal of the shared geometry shows) */
export const V_FROG = 1;
export const V_TURTLE = 2;
export const V_HEDGEHOG = 3;

/** roles inside a family / herd */
export const R_NONE = 0;
export const R_STAG = 1; // deer: antlers (variant 1)
export const R_DOE = 2;
export const R_FAWN = 3; // deer: spots (variant 2)
export const R_VIXEN = 4;
export const R_KIT = 5; // fox cub / goat kid
export const R_MOTHER = 6; // bear
export const R_CUB = 7;
export const R_HEN = 8; // duck
export const R_DRAKE = 9;
export const R_DUCKLING = 10;
export const R_FOAL = 11;
export const R_ROAMER = 12; // a fox out on its rounds

/** behaviour states */
export const S_IDLE = 0;
export const S_WALK = 1;
export const S_FLEE = 2;
export const S_CURIOUS = 3;
export const S_HIDE = 4;
export const S_SLEEP = 5;
export const S_CLIMB_UP = 6;
export const S_IN_TREE = 7;
export const S_CLIMB_DOWN = 8;
export const S_FISH = 9;
export const S_PLAY = 10;
export const S_ASHORE = 11;
export const S_CROSS = 12;
export const S_CURL = 13;
export const S_POUNCE = 14;
export const S_CANTER = 15;
export const S_HOP = 16;

/** One animal. Every field is a number so the whole population is a flat, allocation-free state. */
export interface Agent {
  kind: number;
  role: number;
  mesh: number;
  /** instance index inside its mesh */
  slot: number;
  /** geometry variant (antlers, spots, drake's green head, which critter ...) */
  variant: number;
  /** coat colour (sRGB hex) — tints the fur / feathers only */
  coat: number;
  /** size (1 = the model's natural size) */
  s: number;
  x: number;
  z: number;
  /** ground / water / trunk height under it (drawn at y + lift) */
  y: number;
  yaw: number;
  /** current speed (m/s) */
  v: number;
  st: number;
  /** state timer (s) */
  tm: number;
  tx: number;
  tz: number;
  /** home: where it lives and how far it roams */
  hx: number;
  hz: number;
  hr: number;
  /** it never goes further than this from home (m) */
  leash: number;
  /** its hiding place (burrow, den, cover under the trees, the water's edge) */
  cx: number;
  cz: number;
  /** spare points: the woods to dart into, a second tree, the far side of a path, a direction */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** index of the animal it follows (a fawn its mother, ducklings in a line), -1 none */
  lead: number;
  group: number;
  /** its own little random generator state (xorshift) */
  rs: number;
  seed: number;
  /** 0..1: how shy it is — decides when it comes out (dawn / dusk / night) */
  shy: number;
  /** 0..1 drawn size (pops in / out of burrows, dens, trees, water) */
  present: number;
  want: number;
  /** 0..1 how alert it is (head up, ears pricked) */
  alert: number;
  /** seconds since the last scare */
  calm: number;
  // ── animation (fed to the vertex rig) ──
  phase: number;
  stride: number;
  bound: number;
  headYaw: number;
  headPitch: number;
  ear: number;
  tail: number;
  tailLift: number;
  paw: number;
  wing: number;
  tuck: number;
  /** body offsets: height (hops), pitch (nose down > 0), roll, forward shift (for pitching round a hind foot) */
  lift: number;
  pitch: number;
  roll: number;
  fwd: number;
  /** tree things: the tree index (-1), height above the ground on the trunk */
  tree: number;
  tree2: number;
  climb: number;
  /** a per-animal counter for one-off actions (pounces, hops, swipes) */
  act: number;
}

export interface Tune {
  walk: number;
  run: number;
  /** turn rate (rad/s) */
  turn: number;
  /** metres per full gait cycle at size 1 */
  stride: number;
  /** a running kid inside this scares it */
  fleeR: number;
  /** how far it runs */
  fleeDist: number;
  /** it lifts its head and watches the kid inside this */
  noticeR: number;
  /** comes over when the kid stands still inside this (0 = never) */
  curiousR: number;
  /** ...and stops this far away */
  stopR: number;
  /** body radius (m at size 1): the kid's personal-space bubble adds to it */
  body: number;
  /** head down while grazing (rad) */
  graze: number;
  maxSlope: number;
  /** only walks outside the woods */
  open: boolean;
  idleMin: number;
  idleMax: number;
  /** hip height at size 1 (how far the body sinks when it lies down / tucks its legs) */
  hip: number;
}

const T = (t: Tune) => t;
export const TUNE: Tune[] = [];
TUNE[K_DEER] = T({ walk: 0.9, run: 6.5, turn: 2.4, stride: 1.5, fleeR: 15, fleeDist: 22, noticeR: 22, curiousR: 0, stopR: 6, body: 0.7, graze: 1.75, maxSlope: 0.6, open: false, idleMin: 4, idleMax: 11, hip: 0.85 });
TUNE[K_RABBIT] = T({ walk: 0.8, run: 5.2, turn: 5, stride: 0.55, fleeR: 9, fleeDist: 14, noticeR: 11, curiousR: 9, stopR: 2.6, body: 0.3, graze: 0.55, maxSlope: 0.55, open: false, idleMin: 2, idleMax: 7, hip: 0.12 });
TUNE[K_FOX] = T({ walk: 1.5, run: 5.6, turn: 3.2, stride: 0.95, fleeR: 10, fleeDist: 16, noticeR: 15, curiousR: 0, stopR: 5, body: 0.4, graze: 0.9, maxSlope: 0.6, open: false, idleMin: 2, idleMax: 6, hip: 0.3 });
TUNE[K_SQUIRREL] = T({ walk: 1.3, run: 4.2, turn: 6, stride: 0.45, fleeR: 7, fleeDist: 6, noticeR: 9, curiousR: 0, stopR: 3, body: 0.2, graze: 0.5, maxSlope: 0.7, open: false, idleMin: 1.2, idleMax: 4, hip: 0.08 });
TUNE[K_HEDGEHOG] = T({ walk: 0.4, run: 0.8, turn: 2.2, stride: 0.3, fleeR: 5, fleeDist: 2, noticeR: 5, curiousR: 0, stopR: 2, body: 0.3, graze: 0.45, maxSlope: 0.5, open: false, idleMin: 1.5, idleMax: 5, hip: 0.06 });
TUNE[K_HORSE] = T({ walk: 1.1, run: 5.2, turn: 1.9, stride: 2.1, fleeR: 7, fleeDist: 9, noticeR: 16, curiousR: 16, stopR: 2.6, body: 0.95, graze: 1.35, maxSlope: 0.45, open: true, idleMin: 5, idleMax: 14, hip: 0.95 });
TUNE[K_GOAT] = T({ walk: 0.7, run: 3.6, turn: 3, stride: 0.9, fleeR: 8, fleeDist: 9, noticeR: 12, curiousR: 11, stopR: 2.4, body: 0.5, graze: 1.05, maxSlope: 0.95, open: false, idleMin: 3, idleMax: 9, hip: 0.55 });
TUNE[K_COW] = T({ walk: 0.6, run: 2.4, turn: 1.4, stride: 1.8, fleeR: 5, fleeDist: 6, noticeR: 14, curiousR: 13, stopR: 2.8, body: 0.95, graze: 1.15, maxSlope: 0.4, open: true, idleMin: 6, idleMax: 16, hip: 0.75 });
TUNE[K_DUCK] = T({ walk: 0.55, run: 1.6, turn: 3.2, stride: 0.45, fleeR: 6, fleeDist: 6, noticeR: 8, curiousR: 7, stopR: 2.2, body: 0.3, graze: 0.8, maxSlope: 0.5, open: false, idleMin: 2, idleMax: 6, hip: 0.08 });
TUNE[K_FROG] = T({ walk: 0, run: 0, turn: 8, stride: 1, fleeR: 4, fleeDist: 2, noticeR: 5, curiousR: 0, stopR: 2, body: 0.2, graze: 0, maxSlope: 0.9, open: false, idleMin: 2, idleMax: 7, hip: 0.03 });
TUNE[K_OWL] = T({ walk: 0, run: 0, turn: 3, stride: 1, fleeR: 3, fleeDist: 0, noticeR: 22, curiousR: 0, stopR: 0, body: 0.3, graze: 0, maxSlope: 1, open: false, idleMin: 2, idleMax: 6, hip: 0 });
TUNE[K_BEAR] = T({ walk: 0.7, run: 2.6, turn: 1.8, stride: 1.4, fleeR: 0, fleeDist: 0, noticeR: 14, curiousR: 10, stopR: 3.2, body: 0.9, graze: 0.7, maxSlope: 0.6, open: false, idleMin: 3, idleMax: 8, hip: 0.62 });
TUNE[K_TURTLE] = T({ walk: 0.16, run: 0.16, turn: 0.8, stride: 0.35, fleeR: 3.5, fleeDist: 0, noticeR: 4, curiousR: 0, stopR: 0, body: 0.45, graze: 0.2, maxSlope: 0.5, open: false, idleMin: 15, idleMax: 35, hip: 0.07 });

/** the kid, as the animals sense it */
export interface KidSense {
  x: number;
  y: number;
  z: number;
  /** ground speed (m/s, smoothed) */
  speed: number;
  /** seconds standing still */
  still: number;
  /** on (or near) the ground — a kid flying overhead on a mount doesn't bother anyone */
  ground: boolean;
}

/** above this the kid is running (the park's joystick walk is 7 m/s, so any real movement counts) */
export const RUN_SPEED = 3.6;

/** a tree the animals use (the storybook forest's) */
export interface TreeLite {
  x: number;
  z: number;
  y: number;
  kind: number;
  s: number;
  sy: number;
  rot: number;
}

/** the horses' paddock: an oriented rectangle */
export interface Paddock {
  x: number;
  z: number;
  /** half sizes along its own axes */
  hw: number;
  hd: number;
  rot: number;
  /** the gate (a gap in the fence) is on the side facing the Pet Meadow: local x/z of its centre */
  gx: number;
  gz: number;
}

export function inPaddock(p: Paddock, x: number, z: number, pad = 0): boolean {
  const dx = x - p.x;
  const dz = z - p.z;
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) < p.hw - pad && Math.abs(lz) < p.hd - pad;
}

/** paddock-local (lx, lz) to world */
export function paddockPoint(p: Paddock, lx: number, lz: number, out: { x: number; z: number }) {
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  out.x = p.x + lx * c + lz * s;
  out.z = p.z - lx * s + lz * c;
  return out;
}
