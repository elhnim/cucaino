// The Wildlands' wildlife: shared types, the species table and the tuning of every kind. Pure
// data (+ a couple of small pure helpers), no three.js — reuses the park's own fauna true-size
// table (lib/park/world/fauna/types.ts) for the species it shares a body plan with (deer, zebra,
// giraffe, elephant, kangaroo, goat, duck), so a Wildlands zebra and a park zebra stand the same
// true size. Parrots and eagles are new (there's no flying bird in the park's fauna kit yet).
import { HEAD_M, K_DEER, K_DUCK, K_ELEPHANT, K_GIRAFFE, K_GOAT, K_KANGAROO, K_ZEBRA, SIZES, TUNE, UNITS_PER_M, V_ELEPHANT, V_GIRAFFE, V_ZEBRA, trueScale } from "../fauna/types";

// ── instanced meshes (one draw call each) ──
export const WM_DEER = 0;
export const WM_HORSE = 1; // zebras (a striped horse, variant V_ZEBRA)
export const WM_SAFARI = 2; // giraffes (V_GIRAFFE) + elephants (V_ELEPHANT)
export const WM_ROO = 3; // kangaroos (variant 0)
export const WM_GOAT = 4; // mountain goats
export const WM_DUCK = 5; // ducks / swans
export const WM_BIRD = 6; // parrots (variant 0) + eagles (variant 1) — a new, simple flier
export const WILD_MESHES = 7;
export const WILD_MESH_NAMES = ["deer", "zebras", "safari", "roos", "goats", "ducks", "birds"];

// ── species (behaviour kinds) ──
export const WS_DEER = 0;
export const WS_ZEBRA = 1;
export const WS_GIRAFFE = 2;
export const WS_ELEPHANT = 3;
export const WS_KANGAROO = 4;
export const WS_GOAT = 5;
export const WS_DUCK = 6;
export const WS_PARROT = 7;
export const WS_EAGLE = 8;
export const WS_ANTELOPE = 9;
export const WILD_SPECIES = 10;
export const WILD_SPECIES_NAMES = ["deer", "zebra", "giraffe", "elephant", "kangaroo", "goat", "duck", "parrot", "eagle", "antelope"];

export type Biome = "plains" | "ridge" | "lake" | "canopy" | "sky";

export interface SpeciesDef {
  mesh: number;
  variant: number;
  walk: number;
  run: number;
  turn: number;
  stride: number;
  /** true-size scale (the instance's uniform scale at its natural size) */
  scale: number;
  /** +- scale jitter (a bit of variety in a herd) */
  spread: number;
  /** spacing radius (world units, at this species' scale) */
  body: number;
  /** head-down pitch while grazing (rad) */
  graze: number;
  /** how high it carries its head, standing tall (world units) — ridge/plains clearance isn't
   *  checked here (unlike the park), but used to lift flockers above the grass a touch */
  headH: number;
  herdN: [number, number];
  wander: [number, number];
  biome: Biome;
  /** doesn't flee — stops and lets the kid pass (the giants) */
  giant: boolean;
  /** keeps clear of the kid at all (0 = never scared) */
  fleeR: number;
  fleeDist: number;
  noticeR: number;
  coats: number[];
}

const S = (d: SpeciesDef) => d;
const M_PER_U = 1 / UNITS_PER_M;
void M_PER_U;

/** TUNE/SIZES-derived fields for a park species sharing this one's body plan */
function from(kind: number, mesh: number, variant: number, extra: Partial<SpeciesDef> & { herdN: [number, number]; wander: [number, number]; biome: Biome; coats: number[] }): SpeciesDef {
  const t = TUNE[kind];
  const sc = trueScale(kind);
  return S({
    mesh,
    variant,
    walk: t.walk,
    run: t.run,
    turn: t.turn,
    stride: t.stride,
    scale: sc,
    spread: SIZES[kind].spread ?? 0.05,
    body: t.body * sc,
    graze: t.graze,
    headH: HEAD_M[kind] * UNITS_PER_M,
    giant: false,
    fleeR: t.fleeR,
    fleeDist: t.fleeDist,
    noticeR: t.noticeR,
    ...extra,
  });
}

export const WILD_SPECIES_DEFS: SpeciesDef[] = [
  from(K_DEER, WM_DEER, 0, { herdN: [8, 14], wander: [16, 26], biome: "plains", coats: [0xc9a06a, 0xb98f58, 0xd4ae77] }),
  from(K_ZEBRA, WM_HORSE, V_ZEBRA, { herdN: [8, 14], wander: [20, 32], biome: "plains", coats: [0xf3f1ea, 0xece7da] }),
  from(K_GIRAFFE, WM_SAFARI, V_GIRAFFE, { herdN: [3, 6], wander: [22, 34], biome: "plains", giant: true, coats: [0xf6e7c6, 0xeedcae] }),
  from(K_ELEPHANT, WM_SAFARI, V_ELEPHANT, { herdN: [4, 7], wander: [24, 36], biome: "plains", giant: true, coats: [0x9a9890, 0x8d897f] }),
  from(K_KANGAROO, WM_ROO, 0, { herdN: [6, 12], wander: [14, 22], biome: "plains", coats: [0xc9a877, 0xb89463] }),
  from(K_GOAT, WM_GOAT, 0, { herdN: [5, 8], wander: [12, 20], biome: "ridge", coats: [0xe8e4d8, 0xd9d3c2] }),
  from(K_DUCK, WM_DUCK, 0, { herdN: [3, 6], wander: [6, 10], biome: "lake", coats: [0x8a7452, 0xf2efe6, 0x5a5042] }),
  // the birds: new, no park species to borrow a TUNE from
  S({
    mesh: WM_BIRD,
    variant: 0,
    walk: 0,
    run: 7,
    turn: 3.2,
    stride: 1,
    scale: (0.32 * UNITS_PER_M) / 0.52,
    spread: 0.08,
    body: 0.22,
    graze: 0,
    headH: 0.3 * UNITS_PER_M,
    herdN: [2, 4],
    wander: [8, 16],
    biome: "canopy",
    giant: false,
    fleeR: 0,
    fleeDist: 0,
    noticeR: 0,
    coats: [0xe24b3a, 0x3a7fd9, 0x34b35a, 0xf2c23a, 0x8a4bd9],
  }),
  S({
    mesh: WM_BIRD,
    variant: 1,
    walk: 0,
    run: 11,
    turn: 1.1,
    stride: 1,
    scale: (0.9 * UNITS_PER_M) / 0.65,
    spread: 0.08,
    body: 0.45,
    graze: 0,
    headH: 0.5 * UNITS_PER_M,
    herdN: [1, 1],
    wander: [0, 0],
    biome: "sky",
    giant: false,
    fleeR: 0,
    fleeDist: 0,
    noticeR: 0,
    coats: [0x6b4a34, 0x5a3f2c],
  }),
  // the Savanna's antelope: big, wary herds of slim tan grazers (the deer's body plan, horned)
  from(K_DEER, WM_DEER, 1, { herdN: [10, 16], wander: [22, 34], biome: "plains", coats: [0xc98f4e, 0xd29a58, 0xbb8244] }),
];

// ── behaviour states (shared by herds, rafts and flocks) ──
export const ST_GRAZE = 0;
export const ST_WALK = 1;
export const ST_LOOK = 2;
export const ST_FLEE = 3;
export const ST_DRINK_GO = 4;
export const ST_DRINK = 5;
export const ST_REST = 6;
export const ST_PERCH = 7;
export const ST_FLY = 8;
export const ST_SOAR = 9;

/** one animal: a flat, allocation-free-ish record (every field a number, bar the herd back-ref) */
export interface WAnimal {
  species: number;
  scale: number;
  coat: number;
  /** its place in the herd's loose formation (herd-local: +z = the way the herd is heading) */
  ox: number;
  oz: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
  /** rig channels (see lib/park/world/fauna/rig.ts) */
  phase: number;
  stride: number;
  headYaw: number;
  headPitch: number;
  ear: number;
  tail: number;
  tailLift: number;
  wing: number;
  tuck: number;
  bound: number;
  /** its own small xorshift state (idle jitter, ear flicks) */
  rs: number;
  /** drawn this frame? (set by the streamer; false = out of range) */
  live: boolean;
}

export interface WHerd {
  id: number;
  species: number;
  /** home centre and how far it wanders (world units) */
  hx: number;
  hz: number;
  hr: number;
  /** a precomputed dry spot on the Great Lake's shore within drinking distance (else null) */
  shoreX: number | null;
  shoreZ: number | null;
  /** current flock centre / its walking target */
  cx: number;
  cz: number;
  tx: number;
  tz: number;
  heading: number;
  state: number;
  timer: number;
  members: WAnimal[];
  rs: number;
}

export function xorshift(s: number): number {
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  return s >>> 0;
}
export const rnd01 = (s: number) => (s >>> 0) / 4294967296;
