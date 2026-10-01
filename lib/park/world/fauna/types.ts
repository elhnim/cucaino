// The land animals of Cucaino Park: shared types, the species table, the TRUE-SIZE table and the
// tuning of every kind. Pure data, no three.js (the plan and the behaviour steps are tested
// without a renderer).

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
export const K_KANGAROO = 13;
export const K_EMU = 14;
export const K_KOALA = 15;
export const K_WOMBAT = 16;
export const K_ECHIDNA = 17;
export const K_KOOKABURRA = 18;
export const K_PLATYPUS = 19;
export const K_SHEEP = 20;
export const K_CHICKEN = 21;
export const K_GIRAFFE = 22;
export const K_ZEBRA = 23;
export const K_ELEPHANT = 24;
export const KINDS = 25;
export const KIND_NAMES = [
  "deer",
  "rabbit",
  "fox",
  "squirrel",
  "hedgehog",
  "horse",
  "goat",
  "cow",
  "duck",
  "frog",
  "owl",
  "bear",
  "turtle",
  "kangaroo",
  "emu",
  "koala",
  "wombat",
  "echidna",
  "kookaburra",
  "platypus",
  "sheep",
  "chicken",
  "giraffe",
  "zebra",
  "elephant",
];

/**
 * Instanced meshes (one draw call each). Species that share a body plan share a mesh and show
 * their own parts by variant (see rig.ts): zebras are striped horses, sheep woolly goats, chickens
 * live in the ducks' mesh, kookaburras in the owls', echidnas and the platypus with the critters.
 */
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
export const M_ROO = 11;
export const M_BUSH = 12;
export const M_SAFARI = 13;
export const M_SPIKY = 14;
export const MESHES = 15;
export const MESH_NAMES = ["deer", "rabbits", "foxes", "squirrels", "horses", "goats", "cows", "ducks", "owls", "bears", "critters", "roos", "bush", "safari", "spiky"];
export const MESH_OF: number[] = [
  M_DEER,
  M_RABBIT,
  M_FOX,
  M_SQUIRREL,
  M_SPIKY,
  M_HORSE,
  M_GOAT,
  M_COW,
  M_DUCK,
  M_CRITTER,
  M_OWL,
  M_BEAR,
  M_CRITTER,
  M_ROO,
  M_ROO,
  M_BUSH,
  M_BUSH,
  M_SPIKY,
  M_OWL,
  M_CRITTER,
  M_GOAT,
  M_DUCK,
  M_SAFARI,
  M_HORSE,
  M_SAFARI,
];

/** geometry variants (which animal of a shared mesh shows; see geometry.ts) */
export const V_FROG = 1;
export const V_TURTLE = 2;
export const V_HEDGEHOG = 3;
export const V_ECHIDNA = 4;
export const V_PLATYPUS = 5;
export const V_PONY_LIGHT = 1;
export const V_ZEBRA = 2;
export const V_BILLY = 1;
export const V_SHEEP = 2;
export const V_DRAKE = 1;
export const V_DUCKLING = 2;
export const V_CHICKEN = 3;
export const V_ROOSTER = 4;
export const V_KOOKABURRA = 1;
export const V_JOEY_POUCH = 1;
export const V_EMU = 2;
export const V_KOALA = 1;
export const V_WOMBAT = 2;
export const V_GIRAFFE = 1;
export const V_ELEPHANT = 2;

/** roles inside a family / herd */
export const R_NONE = 0;
export const R_STAG = 1; // deer: antlers (variant 1)
export const R_DOE = 2;
export const R_FAWN = 3; // deer: spots (variant 2)
export const R_VIXEN = 4;
export const R_KIT = 5; // fox cub / goat kid / calf
export const R_MOTHER = 6; // bear
export const R_CUB = 7;
export const R_HEN = 8; // duck / chicken
export const R_DRAKE = 9;
export const R_DUCKLING = 10; // ducklings, chicks
export const R_FOAL = 11;
export const R_ROAMER = 12; // a fox out on its rounds
export const R_JOEY = 13; // a young kangaroo out of the pouch
export const R_LAMB = 14;
export const R_ROOSTER = 15;
export const R_BULL = 16; // the big one at the front of a herd

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
/** travelling along a roaming route (the herd leader), or keeping its place in the moving herd */
export const S_ROAM = 17;
/** tagging along behind the kid for a bit (a lamb, a joey, a fox kit, an emu chick) */
export const S_FOLLOW = 18;
/** at the water's edge, head down, drinking */
export const S_DRINK = 19;
/** a kookaburra's laugh, a rooster's crow */
export const S_CALL = 20;
/** the platypus under water */
export const S_DIVE = 21;

/** mover classes for roaming routes (how much room an animal needs) */
export const C_NONE = -1;
export const C_SMALL = 0;
export const C_LARGE = 1;
export const C_GIANT = 2;
export const CLASSES = 3;

/** One animal. Every field is a number so the whole population is a flat, allocation-free state. */
export interface Agent {
  /** its index in the population (the route buffer slice is id × RMAX) */
  id: number;
  kind: number;
  role: number;
  mesh: number;
  /** instance index inside its mesh */
  slot: number;
  /** geometry variant (antlers, spots, drake's green head, which critter ...) */
  variant: number;
  /** coat colour (sRGB hex) — tints the fur / feathers only */
  coat: number;
  /** size (1 = the model's natural size): true size, see SIZES / trueScale */
  s: number;
  x: number;
  z: number;
  /** ground / water / trunk height under it (drawn at y + lift) */
  y: number;
  yaw: number;
  /** current speed (world units / s) */
  v: number;
  st: number;
  /** state timer (s) */
  tm: number;
  tx: number;
  tz: number;
  /** home: where it lives and how far it ambles round it */
  hx: number;
  hz: number;
  hr: number;
  /** it never goes further than this from home (m) — roamers have the whole island */
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
  // ── roaming ──
  /** mover class (C_SMALL / C_LARGE / C_GIANT), C_NONE for animals that stay home */
  cls: number;
  /** route: its slice of the route buffer holds node indices; `rn` long, at `ri` */
  rn: number;
  ri: number;
  /** the node it is heading for (-1 none) and what it'll do there (a TAG_ bit) */
  goal: number;
  doing: number;
  /** seconds left lingering where it is (grazing / drinking / resting) before moving on */
  linger: number;
  /** its place in the moving herd (leader-local offset: right, back) */
  sx: number;
  sz: number;
  /** seconds before the kid "director" may send it on a little show again */
  cool: number;
  /** 0..1: the soft glow a small animal gets when the kid is right next to it */
  hint: number;
  /** the park hour it last had a drink (-99 never) */
  drank: number;
  /** travelling: the closest it has got to the next spot, and seconds since it last got closer */
  prog: number;
  stuck: number;
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
  /** world units per full gait cycle at size 1 */
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
  /** body radius (units at size 1): the kid's personal-space bubble adds to it */
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
TUNE[K_DEER] = T({ walk: 1.5, run: 9, turn: 2.4, stride: 1.5, fleeR: 15, fleeDist: 24, noticeR: 22, curiousR: 0, stopR: 6, body: 0.7, graze: 1.75, maxSlope: 0.6, open: false, idleMin: 4, idleMax: 11, hip: 0.85 });
TUNE[K_RABBIT] = T({ walk: 0.9, run: 6, turn: 5, stride: 0.55, fleeR: 8, fleeDist: 14, noticeR: 10, curiousR: 7, stopR: 2.2, body: 0.3, graze: 0.55, maxSlope: 0.55, open: false, idleMin: 2, idleMax: 7, hip: 0.12 });
TUNE[K_FOX] = T({ walk: 1.8, run: 7, turn: 3.2, stride: 0.95, fleeR: 9, fleeDist: 16, noticeR: 14, curiousR: 7, stopR: 3, body: 0.4, graze: 0.9, maxSlope: 0.6, open: false, idleMin: 2, idleMax: 6, hip: 0.3 });
TUNE[K_SQUIRREL] = T({ walk: 1.3, run: 4.2, turn: 6, stride: 0.45, fleeR: 6, fleeDist: 6, noticeR: 8, curiousR: 0, stopR: 3, body: 0.2, graze: 0.5, maxSlope: 0.7, open: false, idleMin: 1.2, idleMax: 4, hip: 0.08 });
TUNE[K_HEDGEHOG] = T({ walk: 0.5, run: 0.9, turn: 2.2, stride: 0.3, fleeR: 4, fleeDist: 2, noticeR: 5, curiousR: 0, stopR: 2, body: 0.3, graze: 0.45, maxSlope: 0.5, open: false, idleMin: 1.5, idleMax: 5, hip: 0.06 });
TUNE[K_HORSE] = T({ walk: 1.6, run: 7, turn: 1.9, stride: 2.1, fleeR: 7, fleeDist: 9, noticeR: 16, curiousR: 16, stopR: 2.6, body: 0.95, graze: 1.35, maxSlope: 0.45, open: true, idleMin: 5, idleMax: 14, hip: 0.95 });
TUNE[K_GOAT] = T({ walk: 1.0, run: 4.5, turn: 3, stride: 0.9, fleeR: 7, fleeDist: 9, noticeR: 12, curiousR: 11, stopR: 2.4, body: 0.5, graze: 1.05, maxSlope: 0.95, open: false, idleMin: 3, idleMax: 9, hip: 0.55 });
TUNE[K_COW] = T({ walk: 1.1, run: 3.2, turn: 1.4, stride: 1.8, fleeR: 5, fleeDist: 6, noticeR: 14, curiousR: 13, stopR: 2.8, body: 0.95, graze: 1.15, maxSlope: 0.4, open: true, idleMin: 6, idleMax: 16, hip: 0.75 });
TUNE[K_DUCK] = T({ walk: 0.6, run: 1.7, turn: 3.2, stride: 0.45, fleeR: 6, fleeDist: 6, noticeR: 8, curiousR: 7, stopR: 2, body: 0.3, graze: 0.8, maxSlope: 0.5, open: false, idleMin: 2, idleMax: 6, hip: 0.08 });
TUNE[K_FROG] = T({ walk: 0, run: 0, turn: 8, stride: 1, fleeR: 4, fleeDist: 2, noticeR: 5, curiousR: 0, stopR: 2, body: 0.2, graze: 0, maxSlope: 0.9, open: false, idleMin: 2, idleMax: 7, hip: 0.03 });
TUNE[K_OWL] = T({ walk: 0, run: 0, turn: 3, stride: 1, fleeR: 3, fleeDist: 0, noticeR: 22, curiousR: 0, stopR: 0, body: 0.3, graze: 0, maxSlope: 1, open: false, idleMin: 2, idleMax: 6, hip: 0 });
TUNE[K_BEAR] = T({ walk: 1.1, run: 3.4, turn: 1.8, stride: 1.4, fleeR: 0, fleeDist: 0, noticeR: 14, curiousR: 10, stopR: 3.2, body: 0.9, graze: 0.7, maxSlope: 0.6, open: false, idleMin: 3, idleMax: 8, hip: 0.62 });
TUNE[K_TURTLE] = T({ walk: 0.16, run: 0.16, turn: 0.8, stride: 0.35, fleeR: 3.5, fleeDist: 0, noticeR: 4, curiousR: 0, stopR: 0, body: 0.45, graze: 0.2, maxSlope: 0.5, open: false, idleMin: 15, idleMax: 35, hip: 0.07 });
TUNE[K_KANGAROO] = T({ walk: 1.7, run: 9, turn: 2.6, stride: 2.2, fleeR: 11, fleeDist: 20, noticeR: 18, curiousR: 9, stopR: 4, body: 0.68, graze: 1.1, maxSlope: 0.55, open: false, idleMin: 4, idleMax: 10, hip: 0.5 });
TUNE[K_EMU] = T({ walk: 1.6, run: 9, turn: 2.6, stride: 1.4, fleeR: 7, fleeDist: 14, noticeR: 16, curiousR: 14, stopR: 3, body: 0.45, graze: 1.2, maxSlope: 0.55, open: false, idleMin: 3, idleMax: 8, hip: 0.75 });
TUNE[K_KOALA] = T({ walk: 0.7, run: 1.6, turn: 2.4, stride: 0.6, fleeR: 4, fleeDist: 4, noticeR: 12, curiousR: 0, stopR: 3, body: 0.3, graze: 0.4, maxSlope: 0.7, open: false, idleMin: 3, idleMax: 9, hip: 0.18 });
TUNE[K_WOMBAT] = T({ walk: 0.9, run: 3.6, turn: 2, stride: 0.75, fleeR: 5, fleeDist: 6, noticeR: 9, curiousR: 7, stopR: 2.4, body: 0.45, graze: 0.55, maxSlope: 0.55, open: false, idleMin: 3, idleMax: 9, hip: 0.18 });
TUNE[K_ECHIDNA] = T({ walk: 0.5, run: 0.9, turn: 2.2, stride: 0.35, fleeR: 4, fleeDist: 1, noticeR: 5, curiousR: 0, stopR: 2, body: 0.3, graze: 0.6, maxSlope: 0.55, open: false, idleMin: 2, idleMax: 6, hip: 0.07 });
TUNE[K_KOOKABURRA] = T({ walk: 0, run: 0, turn: 3, stride: 1, fleeR: 3, fleeDist: 0, noticeR: 16, curiousR: 0, stopR: 0, body: 0.2, graze: 0, maxSlope: 1, open: false, idleMin: 2, idleMax: 6, hip: 0 });
TUNE[K_PLATYPUS] = T({ walk: 0.7, run: 1.8, turn: 2.6, stride: 0.4, fleeR: 5, fleeDist: 4, noticeR: 7, curiousR: 0, stopR: 3, body: 0.25, graze: 0.4, maxSlope: 0.5, open: false, idleMin: 2, idleMax: 6, hip: 0.04 });
TUNE[K_SHEEP] = T({ walk: 1.0, run: 4.5, turn: 2.6, stride: 0.95, fleeR: 6, fleeDist: 9, noticeR: 12, curiousR: 11, stopR: 2.4, body: 0.5, graze: 1.05, maxSlope: 0.5, open: false, idleMin: 3, idleMax: 9, hip: 0.55 });
TUNE[K_CHICKEN] = T({ walk: 0.7, run: 2.6, turn: 4, stride: 0.42, fleeR: 4, fleeDist: 5, noticeR: 7, curiousR: 6, stopR: 1.8, body: 0.25, graze: 1.0, maxSlope: 0.5, open: false, idleMin: 1.5, idleMax: 5, hip: 0.1 });
TUNE[K_GIRAFFE] = T({ walk: 1.6, run: 6, turn: 1.2, stride: 2.4, fleeR: 6, fleeDist: 12, noticeR: 22, curiousR: 14, stopR: 4, body: 0.75, graze: 0.9, maxSlope: 0.35, open: true, idleMin: 6, idleMax: 14, hip: 1.3 });
TUNE[K_ZEBRA] = T({ walk: 1.6, run: 8, turn: 2, stride: 2.1, fleeR: 8, fleeDist: 14, noticeR: 16, curiousR: 10, stopR: 3.2, body: 0.95, graze: 1.35, maxSlope: 0.45, open: true, idleMin: 5, idleMax: 12, hip: 0.95 });
TUNE[K_ELEPHANT] = T({ walk: 1.5, run: 3.6, turn: 1.0, stride: 1.9, fleeR: 0, fleeDist: 0, noticeR: 18, curiousR: 14, stopR: 4, body: 1.05, graze: 0.5, maxSlope: 0.35, open: true, idleMin: 6, idleMax: 14, hip: 0.95 });

// ── true size ──

/** world units per real metre: the kid is 2.26 units tall and stands for a ~1.4 m 10-year-old */
export const UNITS_PER_M = 2.26 / 1.4;

/**
 * How big each species is in real life (metres), and how its model measures at size 1:
 *   back   the top of the body (its back / shoulders), for animals on four legs
 *   head   the top of the head (standing birds, kangaroos, giraffes, sitting owls)
 *   length nose to rump along the ground (small animals, measured without the tail)
 * `model` is the model's own measure (world units at size 1) — fauna.test.ts measures the built
 * geometry and checks it, so the drawn animals really are their true size.
 */
export interface TrueSize {
  m: number;
  measure: "back" | "head" | "length";
  model: number;
  /** the variant whose parts are measured */
  variant: number;
  /** how big the youngsters / the other sex are (fraction of `m`) by role */
  young?: number;
  /** a variety of sizes inside a herd (±) */
  spread?: number;
}

export const SIZES: TrueSize[] = [];
SIZES[K_DEER] = { m: 0.95, measure: "back", model: 1.33, variant: 0, young: 0.6, spread: 0.05 }; // fallow / roe deer, ~1 m at the shoulder
SIZES[K_RABBIT] = { m: 0.4, measure: "length", model: 0.69, variant: 0, spread: 0.08 }; // ~0.25 m tall, 0.4 m long
SIZES[K_FOX] = { m: 0.4, measure: "back", model: 0.59, variant: 0, young: 0.55 }; // red fox, 0.4 m at the shoulder
SIZES[K_SQUIRREL] = { m: 0.22, measure: "length", model: 0.394, variant: 0 }; // body 0.2-0.25 m (+ the tail)
SIZES[K_HEDGEHOG] = { m: 0.25, measure: "length", model: 0.754, variant: V_HEDGEHOG };
SIZES[K_HORSE] = { m: 1.6, measure: "back", model: 1.623, variant: 0, young: 0.62, spread: 0.04 }; // 1.6 m at the withers (ponies 1.2)
SIZES[K_GOAT] = { m: 0.75, measure: "back", model: 0.99, variant: 0, young: 0.6, spread: 0.05 };
SIZES[K_COW] = { m: 1.4, measure: "back", model: 1.48, variant: 0, young: 0.58, spread: 0.04 };
SIZES[K_DUCK] = { m: 0.4, measure: "head", model: 0.522, variant: 0, young: 0.45 }; // mallard, ~0.4 m (ducklings 0.18)
SIZES[K_FROG] = { m: 0.09, measure: "length", model: 0.295, variant: V_FROG };
SIZES[K_OWL] = { m: 0.45, measure: "head", model: 0.85, variant: 0 }; // tawny owl, 0.4-0.5 m
SIZES[K_BEAR] = { m: 1.2, measure: "back", model: 1.355, variant: 0, young: 0.45 }; // brown bear, ~1.2 m on all fours
SIZES[K_TURTLE] = { m: 0.32, measure: "length", model: 0.859, variant: V_TURTLE };
SIZES[K_KANGAROO] = { m: 1.6, measure: "head", model: 1.465, variant: 0, young: 0.4, spread: 0.06 }; // red kangaroo, 1.5-1.8 m standing
SIZES[K_EMU] = { m: 1.7, measure: "head", model: 1.716, variant: V_EMU, young: 0.45 };
SIZES[K_KOALA] = { m: 0.7, measure: "length", model: 0.68, variant: V_KOALA };
SIZES[K_WOMBAT] = { m: 1.0, measure: "length", model: 0.996, variant: V_WOMBAT };
SIZES[K_ECHIDNA] = { m: 0.4, measure: "length", model: 0.801, variant: V_ECHIDNA };
SIZES[K_KOOKABURRA] = { m: 0.42, measure: "length", model: 0.415, variant: 1 };
SIZES[K_PLATYPUS] = { m: 0.5, measure: "length", model: 0.512, variant: V_PLATYPUS };
SIZES[K_SHEEP] = { m: 0.8, measure: "back", model: 1.123, variant: V_SHEEP, young: 0.6, spread: 0.05 };
SIZES[K_CHICKEN] = { m: 0.42, measure: "head", model: 0.642, variant: V_CHICKEN, young: 0.32 };
SIZES[K_GIRAFFE] = { m: 5.0, measure: "head", model: 4.923, variant: V_GIRAFFE, young: 0.45, spread: 0.06 };
SIZES[K_ZEBRA] = { m: 1.35, measure: "back", model: 1.631, variant: V_ZEBRA, spread: 0.04 };
SIZES[K_ELEPHANT] = { m: 2.8, measure: "back", model: 2.77, variant: V_ELEPHANT, young: 0.42, spread: 0.06 }; // African bush elephant, ~3 m at the shoulder

/** the instance scale that draws this species at its real size (× `young` for the little ones) */
export function trueScale(kind: number, young = false, extra = 1): number {
  const sz = SIZES[kind];
  return ((sz.m * UNITS_PER_M) / sz.model) * (young ? sz.young ?? 1 : 1) * extra;
}

/** the kid, as the animals sense it */
export interface KidSense {
  x: number;
  y: number;
  z: number;
  /** ground speed (units/s, smoothed) */
  speed: number;
  /** unit heading of its movement (smoothed) */
  dx: number;
  dz: number;
  /** seconds standing still */
  still: number;
  /** on (or near) the ground — a kid flying overhead on a mount doesn't bother anyone */
  ground: boolean;
}

/** above this the kid is running (the park's joystick walk is 7 units/s, so any real movement counts) */
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
