// How Dino Isle's animals live — pure maths, deterministic, allocation-free per step (tested).
//
// Every land animal belongs to a herd with a home range (registry DINO_RANGES). The herd's centre
// drifts between spots inside it; members keep their own place round it, grazing, strolling and
// now and then doing their thing (a brachiosaur browsing a treetop, a parasaurolophus honking,
// a stegosaur swishing its spiky tail, a mammoth trumpeting, a ground sloth rearing up into a tree,
// a sabre-cat yawning to show off its fangs, a cave bear standing up to wave). They steer round
// each other and the island's obstacles, stay on dry land in their range, rest at night — and
// notice the Park kid: heads turn to look, curious little ones (compys, babies, dodos, the
// mammoth calf...) trot up to sniff and then scamper off, and big ones walk round you.
// The T-rex patrols its paddock, stomps over to the fence when you come by, ROARS (the `roar`
// event), yawns, and flops down for a grumpy nap. Pteranodons soar round the volcano and out over
// the sea; a plesiosaur swims round the island.
import {
  DINO_ISLAND,
  DINO_OBSTACLES,
  DINO_PADDOCK,
  DINO_PROPS,
  DINO_RANGES,
  DINO_VOLCANO,
  dinoCoastR,
  dinoLandY,
  dinoRng,
  dinoWaterAt,
  type DinoRangeId,
  type DinoSpeciesId,
} from "../../registry/dinoIsland";

const TAU = Math.PI * 2;
const X0 = DINO_ISLAND.x;
const Z0 = DINO_ISLAND.z;
const wrap = (a: number) => a - Math.round(a / TAU) * TAU;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const approach = (v: number, to: number, k: number) => v + (to - v) * (k > 1 ? 1 : k);

export type MeshId = "brachio" | "trike" | "stego" | "para" | "ankylo" | "trex" | "compy" | "ptero" | "plesio" | "mammoth" | "rhino" | "sloth" | "elk" | "sabre" | "bear" | "small" | "smallbeast";

export interface SpeciesDef {
  id: DinoSpeciesId;
  mesh: MeshId;
  /** variant in a mixed mesh */
  variant: number;
  range: DinoRangeId;
  /** [standard, low quality] adults, and babies */
  count: [number, number];
  babies?: [number, number];
  /** body radius for spacing (m, at scale 1) */
  size: number;
  walk: number;
  run: number;
  /** metres per step cycle */
  stride: number;
  /** turn rate (rad/s) */
  turn: number;
  /** keep at least this far from the kid (walk round) — 0: not shy */
  personal: number;
  curious: boolean;
  /** head: grazing pitch (down < 0), how far it turns to look, where its eyes are (m) */
  graze: number;
  look: number;
  eyeY: number;
  scale: [number, number];
  /** how often (s) it does its special thing, and for how long */
  special: [number, number];
  /** can it wade (paddle in shallow water)? */
  wade?: boolean;
  /** waddles side to side (dodos, penguins...) */
  waddle?: number;
  /** coat + accent colours to pick from */
  coats: [string, string][];
}

export const SPECIES: SpeciesDef[] = [
  { id: "brachio", mesh: "brachio", variant: 0, range: "brachio", count: [4, 2], size: 3.2, walk: 1.1, run: 2, stride: 5.5, turn: 0.35, personal: 9, curious: false, graze: -0.25, look: 0.9, eyeY: 12.5, scale: [0.9, 1.08], special: [14, 12], wade: true, coats: [["#8fbf6a", "#f0e2b0"], ["#6fb7a6", "#e8f0c8"], ["#a3b06a", "#f4e4b8"], ["#7fa7c9", "#eef0dc"]] },
  { id: "trike", mesh: "trike", variant: 0, range: "trike", count: [5, 3], babies: [4, 3], size: 1.9, walk: 1.2, run: 3, stride: 2.6, turn: 0.8, personal: 5.5, curious: false, graze: -0.55, look: 0.8, eyeY: 2.1, scale: [0.9, 1.1], special: [18, 2.2], coats: [["#c98b52", "#ff7a4a"], ["#8f9f5a", "#ffc14a"], ["#b0794a", "#ff5a7a"], ["#9a8a6a", "#4fc3a1"]] },
  { id: "stego", mesh: "stego", variant: 0, range: "stego", count: [3, 2], size: 1.9, walk: 1.0, run: 2.4, stride: 2.4, turn: 0.7, personal: 5, curious: false, graze: -0.5, look: 0.7, eyeY: 1.3, scale: [0.9, 1.08], special: [15, 3], coats: [["#8fae5a", "#ff8a3c"], ["#6f9a7a", "#ffb04a"], ["#9fa05a", "#e8584a"]] },
  { id: "para", mesh: "para", variant: 0, range: "para", count: [4, 2], size: 1.6, walk: 1.3, run: 3.2, stride: 2.4, turn: 0.9, personal: 4.5, curious: false, graze: -0.9, look: 0.9, eyeY: 4.1, scale: [0.88, 1.06], special: [12, 2.4], wade: true, coats: [["#6aa0c0", "#ff8a4a"], ["#8a9fd0", "#ffd05a"], ["#5fb09a", "#ff6a6a"], ["#b08ad0", "#ffc04a"]] },
  { id: "ankylo", mesh: "ankylo", variant: 0, range: "ankylo", count: [2, 1], size: 1.6, walk: 0.8, run: 1.8, stride: 1.8, turn: 0.8, personal: 3.8, curious: false, graze: -0.3, look: 0.6, eyeY: 1.2, scale: [0.95, 1.05], special: [10, 2.5], coats: [["#b08a5a", "#e8c89a"], ["#8a8a6a", "#d8c8a0"]] },
  { id: "trex", mesh: "trex", variant: 0, range: "trex", count: [1, 1], size: 2.4, walk: 1.5, run: 3, stride: 3.6, turn: 0.6, personal: 0, curious: false, graze: -0.2, look: 1.0, eyeY: 4.6, scale: [1, 1], special: [0, 0], coats: [["#7a9a4a", "#f0dca0"]] },
  { id: "compy", mesh: "compy", variant: 0, range: "compy", count: [6, 4], size: 0.3, walk: 2.2, run: 5.2, stride: 0.5, turn: 5, personal: 0, curious: true, graze: -0.7, look: 1.2, eyeY: 0.65, scale: [0.9, 1.15], special: [6, 1], coats: [["#6ad05a", "#fff0a0"], ["#4fc3a1", "#fff4c8"], ["#9ad04a", "#ffe08a"]] },
  { id: "ptero", mesh: "ptero", variant: 0, range: "brachio", count: [5, 3], size: 1, walk: 9, run: 12, stride: 1, turn: 1, personal: 0, curious: false, graze: 0, look: 0.4, eyeY: 0, scale: [0.9, 1.15], special: [0, 0], coats: [["#e87a5a", "#ffd0a0"], ["#d08a4a", "#ff8a5a"], ["#a07ac8", "#ffc0e0"]] },
  { id: "plesio", mesh: "plesio", variant: 0, range: "brachio", count: [1, 1], size: 2, walk: 2, run: 3, stride: 3, turn: 0.4, personal: 0, curious: false, graze: 0, look: 0.6, eyeY: 3.3, scale: [1, 1], special: [0, 0], coats: [["#4a8ab0", "#cfe8f0"]] },
  { id: "mammoth", mesh: "mammoth", variant: 0, range: "mammoth", count: [4, 2], babies: [1, 1], size: 2.1, walk: 1.0, run: 2.5, stride: 2.6, turn: 0.6, personal: 7, curious: false, graze: -0.3, look: 0.7, eyeY: 3.6, scale: [0.92, 1.08], special: [16, 3], coats: [["#8a5a3a", "#5a3a2a"], ["#a0683e", "#6a4430"], ["#7a4e34", "#4e3226"], ["#9a6a48", "#62402c"]] },
  { id: "rhino", mesh: "rhino", variant: 0, range: "rhino", count: [2, 1], size: 1.4, walk: 0.9, run: 2.6, stride: 1.8, turn: 0.8, personal: 4.5, curious: false, graze: -0.45, look: 0.7, eyeY: 1.4, scale: [0.95, 1.05], special: [14, 2], coats: [["#9a7250", "#6a4a34"], ["#8a6a50", "#5a4030"]] },
  { id: "sloth", mesh: "sloth", variant: 0, range: "sloth", count: [2, 1], size: 1.6, walk: 0.55, run: 1.2, stride: 1.4, turn: 0.6, personal: 3.8, curious: false, graze: -0.2, look: 0.8, eyeY: 2.6, scale: [0.95, 1.05], special: [10, 9], coats: [["#9a7a5a", "#c8a882"], ["#8a6e52", "#bca07a"]] },
  { id: "elk", mesh: "elk", variant: 0, range: "elk", count: [3, 2], size: 1.2, walk: 1.2, run: 4, stride: 1.8, turn: 1, personal: 6, curious: false, graze: -0.9, look: 0.9, eyeY: 2.5, scale: [0.92, 1.05], special: [12, 3], coats: [["#a0704a", "#e8d8b8"], ["#8a603e", "#dcc8a8"], ["#b07a50", "#f0e0c0"]] },
  { id: "sabre", mesh: "sabre", variant: 0, range: "sabre", count: [2, 1], babies: [2, 1], size: 0.8, walk: 1.1, run: 3.5, stride: 1.2, turn: 1.4, personal: 3.2, curious: false, graze: -0.3, look: 1.1, eyeY: 1.15, scale: [1.2, 1.3], special: [9, 2.6], coats: [["#d8a860", "#f4e8d0"], ["#c89850", "#f0e0c8"]] },
  { id: "bear", mesh: "bear", variant: 0, range: "bear", count: [2, 1], size: 1.1, walk: 0.9, run: 2.5, stride: 1.4, turn: 0.9, personal: 3.5, curious: false, graze: -0.5, look: 0.9, eyeY: 1.5, scale: [1.05, 1.2], special: [14, 3.5], coats: [["#7a5a42", "#b89878"], ["#6a4e3a", "#a88a6a"]] },
  { id: "dodo", mesh: "small", variant: 0, range: "dodo", count: [5, 3], size: 0.4, walk: 0.8, run: 1.8, stride: 0.45, turn: 3, personal: 0, curious: true, graze: -0.7, look: 1.2, eyeY: 0.9, scale: [0.95, 1.1], special: [8, 1.5], waddle: 0.16, coats: [["#9aa8b8", "#d8dce4"], ["#a8a0b0", "#e0dce8"], ["#8a98a8", "#d0d8e0"]] },
  { id: "moa", mesh: "small", variant: 1, range: "moa", count: [4, 2], size: 0.6, walk: 1.2, run: 3.4, stride: 1.2, turn: 1.5, personal: 3.2, curious: false, graze: -1.0, look: 1.0, eyeY: 2.6, scale: [0.9, 1.1], special: [10, 2], coats: [["#8a6a4a", "#6a4e36"], ["#9a7a52", "#7a5a3e"], ["#7a5e44", "#5e442e"]] },
  { id: "thylacine", mesh: "smallbeast", variant: 2, range: "thylacine", count: [1, 1], size: 0.5, walk: 1.4, run: 3.5, stride: 0.9, turn: 2, personal: 0, curious: true, graze: -0.6, look: 1.1, eyeY: 0.7, scale: [1.05, 1.05], special: [8, 2], coats: [["#c8a070", "#f0e0c0"]] },
  { id: "terror", mesh: "small", variant: 3, range: "terror", count: [1, 1], size: 0.6, walk: 1.1, run: 3.5, stride: 1.0, turn: 1.8, personal: 0, curious: true, graze: -0.6, look: 1.2, eyeY: 2.1, scale: [1.1, 1.1], special: [7, 2], coats: [["#4a7ac8", "#ffd84a"]] },
  { id: "glypto", mesh: "smallbeast", variant: 4, range: "glypto", count: [2, 1], size: 1.1, walk: 0.5, run: 1, stride: 0.9, turn: 0.8, personal: 0, curious: true, graze: -0.3, look: 0.7, eyeY: 0.65, scale: [0.95, 1.05], special: [0, 0], coats: [["#a88a5a", "#6a5a44"], ["#98804e", "#5e503c"]] },
];

// states
const IDLE = 0;
const WALK = 1;
const SNIFF = 2;
const REST = 3;
const SPECIAL = 4;

export interface Animal {
  def: SpeciesDef;
  /** index within its mesh's instances */
  slot: number;
  baby: number;
  scale: number;
  coat: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  phase: number;
  gait: number;
  state: number;
  timer: number;
  tx: number;
  tz: number;
  run: number;
  cool: number;
  /** current head yaw/pitch (relative to the body), jaw, tail swish, rearing, lying, flap/curl, ears, shiver */
  hy: number;
  hp: number;
  jaw: number;
  sway: number;
  rear: number;
  lie: number;
  flap: number;
  ears: number;
  shake: number;
  /** browsing / reaching into this tree (index into TREES) */
  tree: number;
  /** herd place: an offset from the herd's centre */
  ox: number;
  oz: number;
  herd: Herd;
  mother: Animal | null;
  s: number;
  /** flyers/swimmers: their loop */
  fa: number;
  fr: number;
  fcx: number;
  fcz: number;
  fh: number;
  fw: number;
  /** (the T-rex's sub-state) */
  mode: number;
}

export interface Herd {
  range: { x: number; z: number; r: number };
  cx: number;
  cz: number;
  tx: number;
  tz: number;
  timer: number;
  s: number;
}

export interface DinoSim {
  animals: Animal[];
  herds: Herd[];
  trex: Animal;
  /** the T-rex roared this step / is napping (Zzz) */
  roared: boolean;
  napping: boolean;
  roarCool: number;
}

function rnd(o: { s: number }): number {
  let s = o.s | 0 || 1;
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  o.s = s;
  return (s >>> 0) / 4294967296;
}

// ── obstacles: a coarse grid of indices for quick lookups ──
const CELL = 8;
const GN = Math.ceil((DINO_ISLAND.r * 2.6) / CELL);
const G0 = -GN * CELL * 0.5;
const cellOf = (x: number, z: number) => {
  const i = Math.floor((x - X0 - G0) / CELL);
  const j = Math.floor((z - Z0 - G0) / CELL);
  return i < 0 || j < 0 || i >= GN || j >= GN ? -1 : j * GN + i;
};
const OBS_X = new Float32Array(DINO_OBSTACLES.map((o) => o.x));
const OBS_Z = new Float32Array(DINO_OBSTACLES.map((o) => o.z));
const OBS_R = new Float32Array(DINO_OBSTACLES.map((o) => o.r));
const OBS_START = new Int32Array(GN * GN + 1);
const OBS_LIST: Int32Array = (() => {
  const buckets: number[][] = Array.from({ length: GN * GN }, () => []);
  DINO_OBSTACLES.forEach((o, k) => {
    const pad = o.r + 3;
    for (let i = Math.floor((o.x - pad - X0 - G0) / CELL); i <= Math.floor((o.x + pad - X0 - G0) / CELL); i++)
      for (let j = Math.floor((o.z - pad - Z0 - G0) / CELL); j <= Math.floor((o.z + pad - Z0 - G0) / CELL); j++) if (i >= 0 && j >= 0 && i < GN && j < GN) buckets[j * GN + i].push(k);
  });
  const flat: number[] = [];
  buckets.forEach((b, c) => {
    OBS_START[c] = flat.length;
    flat.push(...b);
  });
  OBS_START[GN * GN] = flat.length;
  return new Int32Array(flat);
})();

/** the hatched eggs in the nests (world): where the hatchlings pop out (see props.ts nest(): egg 1 of 5) */
const HATCH = DINO_PROPS.filter((p) => p.kind === "nest").map((p) => {
  const a = (1 / 5) * Math.PI * 2 + p.v;
  const lx = Math.sin(a) * 0.55 * p.s;
  const lz = Math.cos(a) * 0.55 * p.s;
  return { x: p.x + lx * Math.cos(p.rot) + lz * Math.sin(p.rot), z: p.z - lx * Math.sin(p.rot) + lz * Math.cos(p.rot), y: p.y };
});
/** how many of the triceratops babies are still hatching (the rest play round the nests) */
const HATCHLINGS: [number, number] = [2, 1];

/** the trees the browsers browse (monkey-puzzles) and the sloths reach into */
const TREES = DINO_PROPS.filter((p) => p.kind === "araucaria" || p.kind === "jungletree").map((p) => ({ x: p.x, z: p.z, h: p.kind === "araucaria" ? 11.5 * p.s : 6.5 * p.s, r: p.kind === "araucaria" ? 0.7 : 1.1 }));

/** the ground an animal can stand on (dry land, or shallow water for waders) */
function okGround(x: number, z: number, wade: boolean): number | null {
  const y = dinoLandY(x, z);
  if (y === null || y < 1.05) return null;
  if (!wade && dinoWaterAt(x, z) !== null) return null;
  return y;
}

function inRange(h: Herd, x: number, z: number, margin: number) {
  return (x - h.range.x) ** 2 + (z - h.range.z) ** 2 < (h.range.r + margin) ** 2;
}

function pickHerdSpot(h: Herd) {
  for (let k = 0; k < 12; k++) {
    const a = rnd(h) * TAU;
    const r = Math.sqrt(rnd(h)) * h.range.r * 0.8;
    const x = h.range.x + Math.sin(a) * r;
    const z = h.range.z + Math.cos(a) * r;
    if (okGround(x, z, false) !== null) {
      h.tx = x;
      h.tz = z;
      return;
    }
  }
  h.tx = h.range.x;
  h.tz = h.range.z;
}

export function makeSim(low: boolean): DinoSim {
  const animals: Animal[] = [];
  const herds: Herd[] = [];
  const perMesh = new Map<MeshId, number>();
  const rng = dinoRng(2024);
  let trex: Animal | null = null;
  for (const def of SPECIES) {
    const range = DINO_RANGES[def.range];
    const herd: Herd = { range, cx: range.x, cz: range.z, tx: range.x, tz: range.z, timer: 5 + rng() * 10, s: Math.floor(rng() * 1e9) + 1 };
    herds.push(herd);
    const n = def.count[low ? 1 : 0];
    const nb = def.babies ? def.babies[low ? 1 : 0] : 0;
    const mothers: Animal[] = [];
    for (let k = 0; k < n + nb; k++) {
      const baby = k >= n ? 1 : 0;
      const slot = perMesh.get(def.mesh) ?? 0;
      perMesh.set(def.mesh, slot + 1);
      const a0 = (k / Math.max(1, n + nb)) * TAU + rng() * 0.5;
      const spread = Math.min(range.r * 0.7, def.size * 2.2 + 1.5);
      const a: Animal = {
        def,
        slot,
        baby,
        scale: (def.scale[0] + rng() * (def.scale[1] - def.scale[0])) * (baby ? (def.id === "trike" ? 0.27 : def.id === "mammoth" ? 0.48 : 0.55) : 1),
        coat: Math.floor(rng() * def.coats.length),
        x: range.x + Math.sin(a0) * spread,
        z: range.z + Math.cos(a0) * spread,
        y: 2.6,
        yaw: rng() * TAU,
        pitch: 0,
        roll: 0,
        speed: 0,
        phase: rng() * TAU,
        gait: 0,
        state: IDLE,
        timer: 1 + rng() * 6,
        tx: 0,
        tz: 0,
        run: 0,
        cool: rng() * 5,
        hy: 0,
        hp: 0,
        jaw: 0,
        sway: 0,
        rear: 0,
        lie: 0,
        flap: 0,
        ears: 0,
        shake: 0,
        tree: -1,
        ox: Math.sin(a0) * spread,
        oz: Math.cos(a0) * spread,
        herd,
        mother: null,
        s: Math.floor(rng() * 1e9) + 1,
        fa: 0,
        fr: 0,
        fcx: 0,
        fcz: 0,
        fh: 0,
        fw: 0,
        mode: 0,
      };
      a.tx = a.x;
      a.tz = a.z;
      if (baby) {
        // (triceratops babies play at the nests; the others stay by mum)
        const hatching = def.id === "trike" && k >= n + nb - HATCHLINGS[low ? 1 : 0];
        if (hatching) {
          const h = HATCH[(k - n) % HATCH.length];
          a.mode = 1;
          a.x = h.x;
          a.z = h.z;
          a.fcx = h.x;
          a.fcz = h.z;
          a.fh = h.y;
          a.scale = 0.28;
          a.yaw = rng() * TAU;
        } else if (def.id === "trike") {
          const N = DINO_RANGES.nests;
          const ba = (k - n) * 2.1 + 0.4;
          a.x = N.x + Math.sin(ba) * 1.6;
          a.z = N.z + Math.cos(ba) * 1.6;
          a.herd = { range: N, cx: N.x, cz: N.z, tx: N.x, tz: N.z, timer: 4, s: a.s ^ 77 };
          a.ox = Math.sin(ba) * 1.8;
          a.oz = Math.cos(ba) * 1.8;
        } else {
          a.mother = mothers[(k - n) % mothers.length] ?? null;
          if (a.mother) {
            a.x = a.mother.x + 2;
            a.z = a.mother.z;
          }
        }
      } else mothers.push(a);
      if (def.id === "ptero") {
        // loops: round the volcano's smoke, round the whole island, and out over the sea
        const loops: [number, number, number, number, number][] = [
          [DINO_VOLCANO.x, DINO_VOLCANO.z, 26, 44, 0.32],
          [DINO_VOLCANO.x, DINO_VOLCANO.z, 38, 52, -0.24],
          [X0, Z0, 70, 38, 0.13],
          [X0, Z0, 112, 30, -0.1],
          [X0 + 30, Z0 - 10, 50, 34, 0.18],
        ];
        const L = loops[k % loops.length];
        a.fcx = L[0];
        a.fcz = L[1];
        a.fr = L[2];
        a.fh = L[3];
        a.fw = L[4];
        a.fa = rng() * TAU;
      }
      if (def.id === "plesio") {
        a.fa = 2.2;
        a.fw = 0.021;
      }
      if (def.id === "trex") trex = a;
      animals.push(a);
    }
  }
  // settle everyone on the ground
  for (const a of animals) {
    const y = dinoLandY(a.x, a.z);
    a.y = y ?? 2.6;
  }
  return { animals, herds, trex: trex!, roared: false, napping: false, roarCool: 12 };
}

// ── one step ──

const kid = { x: 0, z: 0, near: false };

/**
 * Advance the island's animals by dt. `kx/kz` = where the kid is (world), `kidNear` = the kid is on
 * or close to the island (else nobody reacts). Allocation-free.
 */
export function stepSim(sim: DinoSim, dtIn: number, t: number, hour: number, kx: number, kz: number, kidNear: boolean): void {
  const dt = Math.min(0.1, Math.max(0, dtIn));
  kid.x = kx;
  kid.z = kz;
  kid.near = kidNear;
  sim.roared = false;
  sim.napping = false;
  sim.roarCool -= dt;
  const night = hour >= 21 || hour < 6;
  for (let hi = 0; hi < sim.herds.length; hi++) {
    const h = sim.herds[hi];
    h.timer -= dt;
    if (h.timer <= 0 || (h.cx - h.tx) ** 2 + (h.cz - h.tz) ** 2 < 1) {
      pickHerdSpot(h);
      h.timer = 20 + rnd(h) * 25;
    }
    const d = Math.hypot(h.tx - h.cx, h.tz - h.cz);
    if (d > 0.01) {
      const sp = Math.min(d, (night ? 0.12 : 0.35) * dt);
      h.cx += ((h.tx - h.cx) / d) * sp;
      h.cz += ((h.tz - h.cz) / d) * sp;
    }
  }
  const A = sim.animals;
  for (let i = 0; i < A.length; i++) {
    const a = A[i];
    const id = a.def.id;
    if (id === "ptero") stepFlyer(a, dt, t);
    else if (id === "plesio") stepSwimmer(a, dt, t);
    else if (id === "trex") stepTrex(sim, a, dt, t, night);
    else if (a.mode === 1) stepHatchling(a, dt, t);
    else stepWalker(sim, a, dt, t, night);
  }
}

/** the kid's distance (Infinity when away) */
function kidDist(a: Animal) {
  return kid.near ? Math.hypot(kid.x - a.x, kid.z - a.z) : Infinity;
}

function lookAtKid(a: Animal, dK: number, want: { yaw: number; pitch: number }, dt: number) {
  const reach = 22 + a.def.size * 3;
  let wy = want.yaw;
  let wp = want.pitch;
  if (dK < reach) {
    const rel = wrap(Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw);
    if (Math.abs(rel) < 2.3) {
      const k = 1 - Math.max(0, (dK - 8) / (reach - 8));
      wy = wy + (clamp(rel, -a.def.look, a.def.look) - wy) * k;
      const eye = a.def.eyeY * a.scale;
      wp = wp + (clamp(Math.atan2(1.2 - eye, Math.max(1, dK)) * 0.7, -0.8, 0.5) - wp) * k * 0.8;
    }
  }
  a.hy = approach(a.hy, wy, dt * 3);
  a.hp = approach(a.hp, wp, dt * 2.5);
}
const _want = { yaw: 0, pitch: 0 };

function stepWalker(sim: DinoSim, a: Animal, dt: number, t: number, night: boolean) {
  const def = a.def;
  const size = def.size * a.scale;
  const dK = kidDist(a);
  a.timer -= dt;
  a.cool -= dt;
  let speedWant = 0;
  _want.yaw = 0;
  _want.pitch = 0;
  let jawWant = 0;
  let rearWant = 0;
  let lieWant = 0;
  let swayWant = 0;
  let flapWant = 0;
  let earsWant = 0;
  const curious = def.curious || a.baby > 0;
  // where it's heading: its place in the herd (a baby: beside mum)
  const m = a.mother;
  const homeX = m ? m.x - Math.sin(m.yaw) * 1.2 + Math.cos(m.yaw) * 1.8 : a.herd.cx + a.ox;
  const homeZ = m ? m.z - Math.cos(m.yaw) * 1.2 - Math.sin(m.yaw) * 1.8 : a.herd.cz + a.oz;

  // the kid: curious ones come to sniff, shy/big ones keep their distance
  if (curious && a.state !== REST && a.state !== SNIFF && a.cool <= 0 && dK < 11 && dK > 2 + size) {
    a.state = WALK;
    a.run = 0;
    a.tx = kid.x + ((a.x - kid.x) / dK) * (1.6 + size);
    a.tz = kid.z + ((a.z - kid.z) / dK) * (1.6 + size);
    a.timer = 6;
    if (Math.hypot(a.tx - a.x, a.tz - a.z) < 0.6) {
      a.state = SNIFF;
      a.timer = 2.5 + rnd(a) * 2;
    }
  }
  if (a.state === REST && dK < (def.personal || 3) + 3 && !a.baby && def.id !== "sabre") {
    a.state = IDLE;
    a.timer = 2;
  }
  switch (a.state) {
    case IDLE: {
      _want.pitch = def.graze * (0.6 + 0.4 * Math.sin(t * 0.7 + a.s * 1e-9));
      if (def.id === "compy" || def.id === "dodo") _want.pitch = def.graze * (0.4 + 0.6 * Math.abs(Math.sin(t * 5 + a.slot)));
      if (a.timer <= 0) {
        const r = rnd(a);
        const farFromHome = (a.x - homeX) ** 2 + (a.z - homeZ) ** 2 > (1.5 + size) ** 2;
        if (night && r < 0.6 && !m) {
          a.state = REST;
          a.timer = 20 + rnd(a) * 30;
        } else if (def.special[0] > 0 && r < 0.3 && !a.baby) {
          startSpecial(a);
        } else if (farFromHome || r < 0.75) {
          a.state = WALK;
          a.run = def.id === "compy" && rnd(a) < 0.5 ? 1 : 0;
          const jit = def.id === "compy" ? 5 : 1.5;
          a.tx = homeX + (rnd(a) - 0.5) * jit;
          a.tz = homeZ + (rnd(a) - 0.5) * jit;
          a.timer = 12;
        } else a.timer = 2 + rnd(a) * 5;
      }
      break;
    }
    case WALK: {
      speedWant = a.run ? def.run : def.walk;
      if (a.baby && m) speedWant = Math.max(def.walk * 1.2, Math.hypot(homeX - a.x, homeZ - a.z) * 0.8);
      if (m) {
        a.tx = homeX;
        a.tz = homeZ;
      }
      const d = Math.hypot(a.tx - a.x, a.tz - a.z);
      if (d < 0.6 + size * 0.3 || a.timer <= 0) {
        if (a.tree >= 0) {
          a.state = SPECIAL;
          a.timer = def.special[1];
        } else {
          a.state = IDLE;
          a.timer = (m ? 0.5 : 2) + rnd(a) * 5;
        }
        a.run = 0;
      } else if (d < 2) speedWant *= d / 2;
      _want.pitch = 0.05;
      break;
    }
    case SNIFF: {
      speedWant = 0;
      // (face the kid, nose down to sniff; dodos and terror birds bob, compys chirp)
      const rel = wrap(Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw);
      a.yaw += clamp(rel, -def.turn * dt, def.turn * dt);
      _want.pitch = -0.35 + Math.sin(t * 9) * 0.12;
      jawWant = Math.max(0, Math.sin(t * 7)) * 0.3;
      if (a.timer <= 0 || dK > 6) {
        a.state = WALK;
        a.cool = 14 + rnd(a) * 14;
        a.run = def.id === "compy" || a.baby ? 1 : 0;
        const ax = dK < Infinity ? (a.x - kid.x) / Math.max(0.1, dK) : 0;
        const az = dK < Infinity ? (a.z - kid.z) / Math.max(0.1, dK) : 0;
        a.tx = homeX + ax * 3;
        a.tz = homeZ + az * 3;
        a.timer = 10;
      }
      break;
    }
    case REST: {
      lieWant = 1;
      _want.pitch = -0.25;
      if (a.timer <= 0 || (!night && def.id !== "sabre" && rnd(a) < dt * 0.05)) {
        a.state = IDLE;
        a.timer = 1 + rnd(a) * 3;
      }
      break;
    }
    case SPECIAL: {
      const u = 1 - a.timer / Math.max(0.01, def.special[1]);
      switch (def.id) {
        case "brachio": {
          // browsing a treetop: neck up high, head turned to the tree, munching
          const tr = a.tree >= 0 ? TREES[a.tree] : null;
          _want.pitch = 0.32;
          if (tr) _want.yaw = clamp(wrap(Math.atan2(tr.x - a.x, tr.z - a.z) - a.yaw), -0.6, 0.6);
          jawWant = 0.12 + Math.abs(Math.sin(t * 3)) * 0.12;
          break;
        }
        case "para":
          // HONK: head thrown back, bill open
          _want.pitch = 0.75;
          jawWant = u < 0.8 ? 0.6 : 0;
          rearWant = 0.12;
          break;
        case "stego":
        case "ankylo":
          swayWant = 0.55;
          break;
        case "trike":
          rearWant = Math.max(0, Math.sin(u * Math.PI)) * 0.12;
          _want.pitch = -0.2 + Math.sin(t * 12) * 0.15;
          a.shake = 0.3;
          break;
        case "mammoth":
          // trumpeting: trunk up, a little rear
          rearWant = 0.18;
          flapWant = 1;
          _want.pitch = 0.35;
          jawWant = 0.35;
          earsWant = 1;
          break;
        case "sloth": {
          const tr = a.tree >= 0 ? TREES[a.tree] : null;
          rearWant = 1.05;
          _want.pitch = 0.35;
          if (tr) _want.yaw = clamp(wrap(Math.atan2(tr.x - a.x, tr.z - a.z) - a.yaw), -0.5, 0.5);
          jawWant = Math.abs(Math.sin(t * 2.5)) * 0.25;
          break;
        }
        case "elk":
          _want.pitch = 0.35;
          earsWant = 1;
          break;
        case "sabre":
          // a big yawn (look at those fangs!)
          jawWant = Math.sin(Math.min(1, u * 1.2) * Math.PI) * 1.25;
          _want.pitch = 0.4 * Math.sin(u * Math.PI);
          lieWant = a.baby ? 0 : 1;
          earsWant = 1;
          break;
        case "bear":
          // standing up tall to wave hello
          rearWant = 0.95 * Math.sin(Math.min(1, u * 1.3) * Math.PI);
          _want.pitch = 0.25;
          break;
        case "moa":
          _want.pitch = 0.4;
          break;
        case "rhino":
          _want.pitch = -0.2 + Math.sin(t * 10) * 0.15;
          break;
        default:
          _want.pitch = 0.3;
          jawWant = 0.4;
          break;
      }
      if (a.timer <= 0) {
        a.state = def.id === "sabre" && !a.baby ? REST : IDLE;
        a.timer = def.id === "sabre" ? 6 + rnd(a) * 8 : 2 + rnd(a) * 4;
        a.tree = -1;
      }
      break;
    }
  }
  // sabre-cat grown-ups spend most of their day lounging
  if (def.id === "sabre" && !a.baby && a.state === IDLE && a.timer > 0 && rnd(a) < dt * 0.3) {
    a.state = REST;
    a.timer = 8 + rnd(a) * 10;
  }
  if (a.state === REST && def.id === "sabre" && !a.baby && a.timer < def.special[1] + 0.5 && a.timer > 0 && rnd(a) < dt * 0.25) {
    a.state = SPECIAL;
    a.timer = def.special[1];
  }
  // the bear waves when you come near
  if (def.id === "bear" && dK < 12 && a.state === IDLE && a.cool <= 0) {
    a.state = SPECIAL;
    a.timer = def.special[1];
    a.cool = 20;
  }
  // big and shy ones walk round the kid
  let steerX = 0;
  let steerZ = 0;
  const personal = def.personal * (a.baby ? 0 : 1);
  if (personal > 0 && dK < personal + size) {
    const ax = (a.x - kid.x) / Math.max(0.1, dK);
    const az = (a.z - kid.z) / Math.max(0.1, dK);
    // (away, and round: whichever side it's already facing)
    const side = Math.sin(a.yaw) * -az + Math.cos(a.yaw) * ax > 0 ? 1 : -1;
    const k = 1 - dK / (personal + size);
    steerX = (ax * 0.7 + -az * side * 0.9) * (1 + k * 2);
    steerZ = (az * 0.7 + ax * side * 0.9) * (1 + k * 2);
    speedWant = Math.max(speedWant, def.walk * (1 + k));
    if (a.state === SPECIAL && def.id !== "sabre") a.timer = Math.min(a.timer, 0.3);
    if (a.state === IDLE || a.state === REST) {
      a.state = WALK;
      a.tx = a.x + steerX * 4;
      a.tz = a.z + steerZ * 4;
      a.timer = 3;
    }
  }
  moveOnGround(sim, a, dt, speedWant, steerX, steerZ);
  // head, jaw, tail, rearing, lying down
  if (a.state !== SNIFF) lookAtKid(a, dK, _want, dt);
  else {
    a.hy = approach(a.hy, 0, dt * 3);
    a.hp = approach(a.hp, _want.pitch, dt * 5);
  }
  a.jaw = approach(a.jaw, jawWant, dt * 5);
  a.rear = approach(a.rear, rearWant, dt * (rearWant > a.rear ? 1.6 : 2.2));
  a.lie = approach(a.lie, lieWant, dt * 1.2);
  a.sway = approach(a.sway, swayWant, dt * 2);
  a.flap = approach(a.flap, flapWant, dt * 1.5);
  a.ears = approach(a.ears, earsWant, dt * 2);
  a.shake = approach(a.shake, 0, dt * 3);
}

function startSpecial(a: Animal) {
  const def = a.def;
  if (def.id === "brachio" || def.id === "sloth") {
    // walk to the nearest tree (within reach of the range), then browse / rear up into it
    let best = -1;
    let bd = Infinity;
    for (let k = 0; k < TREES.length; k++) {
      const tr = TREES[k];
      const d = (tr.x - a.x) ** 2 + (tr.z - a.z) ** 2;
      if (d < bd && inRange(a.herd, tr.x, tr.z, def.id === "brachio" ? 7 : 5)) {
        bd = d;
        best = k;
      }
    }
    if (best >= 0) {
      const tr = TREES[best];
      const off = (def.id === "brachio" ? 6.2 : 2.3) * a.scale + tr.r;
      const d = Math.sqrt(bd) || 1;
      a.tree = best;
      a.state = WALK;
      a.tx = tr.x + ((a.x - tr.x) / d) * off;
      a.tz = tr.z + ((a.z - tr.z) / d) * off;
      a.timer = 25;
      return;
    }
  }
  a.state = SPECIAL;
  a.timer = def.special[1];
}

/** steer towards (tx, tz), round the others and the obstacles; move if the ground ahead is fine */
function moveOnGround(sim: DinoSim, a: Animal, dt: number, speedWant: number, steerX: number, steerZ: number) {
  const def = a.def;
  const size = def.size * a.scale;
  let dx = a.tx - a.x;
  let dz = a.tz - a.z;
  const dl = Math.hypot(dx, dz);
  if (dl > 0.001) {
    dx /= dl;
    dz /= dl;
  }
  let fx = speedWant > 0.01 ? dx : 0;
  let fz = speedWant > 0.01 ? dz : 0;
  fx += steerX;
  fz += steerZ;
  // keep apart from the others (the whole island's animals)
  const A = sim.animals;
  for (let j = 0; j < A.length; j++) {
    const b = A[j];
    if (b === a || b.def.id === "ptero" || b.def.id === "plesio") continue;
    const ox = a.x - b.x;
    const oz = a.z - b.z;
    const want = size + b.def.size * b.scale + 0.5;
    const d2 = ox * ox + oz * oz;
    if (d2 < want * want && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const k = (want - d) / want;
      fx += (ox / d) * k * 2.2;
      fz += (oz / d) * k * 2.2;
      // (a baby near mum doesn't push her about)
      if (a.mother === b) {
        fx -= (ox / d) * k * 1.6;
        fz -= (oz / d) * k * 1.6;
      }
    }
  }
  // and round the kid (nobody treads on you)
  if (kid.near) {
    const ox = a.x - kid.x;
    const oz = a.z - kid.z;
    const want = size + 0.9;
    const d2 = ox * ox + oz * oz;
    if (d2 < want * want && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      fx += (ox / d) * 3;
      fz += (oz / d) * 3;
    }
  }
  // obstacles
  const c = cellOf(a.x, a.z);
  if (c >= 0) {
    for (let q = OBS_START[c]; q < OBS_START[c + 1]; q++) {
      const k = OBS_LIST[q];
      const ox = a.x - OBS_X[k];
      const oz = a.z - OBS_Z[k];
      const want = OBS_R[k] + size * 0.8 + 0.4;
      const d2 = ox * ox + oz * oz;
      if (d2 < want * want && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const w = (want - d) / want;
        fx += (ox / d) * w * 2.5;
        fz += (oz / d) * w * 2.5;
      }
    }
  }
  // (stay in the range: a gentle pull home beyond its edge)
  const h = a.herd;
  const rx = a.x - h.range.x;
  const rz = a.z - h.range.z;
  const rd = Math.hypot(rx, rz);
  const edge = h.range.r + (a.def.id === "compy" ? 5 : 3);
  if (rd > edge) {
    fx -= (rx / rd) * (rd - edge) * 0.5;
    fz -= (rz / rd) * (rd - edge) * 0.5;
  }
  const fl = Math.hypot(fx, fz);
  let sp = a.speed;
  if (fl > 0.05) {
    const want = Math.atan2(fx, fz);
    const turn = def.turn * (a.baby ? 2 : 1) * dt * (0.5 + Math.min(1, fl));
    a.yaw += clamp(wrap(want - a.yaw), -turn, turn);
    // (slow down while turning hard)
    const off = Math.abs(wrap(want - a.yaw));
    speedWant = Math.max(speedWant, fl > 1.2 ? def.walk * 0.7 : 0) * (off > 1.2 ? 0.35 : 1);
  }
  sp = approach(sp, speedWant, dt * 1.8);
  a.speed = sp;
  if (sp > 0.001) {
    const nx = a.x + Math.sin(a.yaw) * sp * dt;
    const nz = a.z + Math.cos(a.yaw) * sp * dt;
    // (the ground a little ahead must be fine too)
    const ahead = size * 0.9;
    const ok = okGround(nx, nz, !!def.wade) !== null && okGround(nx + Math.sin(a.yaw) * ahead, nz + Math.cos(a.yaw) * ahead, !!def.wade) !== null && (inRange(h, nx, nz, edge - h.range.r + 4) || rd > Math.hypot(nx - h.range.x, nz - h.range.z));
    if (ok) {
      a.x = nx;
      a.z = nz;
    } else {
      // blocked: turn back towards home
      a.speed *= 0.5;
      a.yaw += clamp(wrap(Math.atan2(h.cx - a.x, h.cz - a.z) - a.yaw), -def.turn * dt * 2, def.turn * dt * 2);
      if (a.state === WALK && a.timer > 1.5) a.timer = 1.5;
    }
  }
  // hard push out of obstacles (never inside a tree)
  if (c >= 0) {
    for (let q = OBS_START[c]; q < OBS_START[c + 1]; q++) {
      const k = OBS_LIST[q];
      const ox = a.x - OBS_X[k];
      const oz = a.z - OBS_Z[k];
      const want = OBS_R[k] + size * 0.45;
      const d2 = ox * ox + oz * oz;
      if (d2 < want * want && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const nx = OBS_X[k] + (ox / d) * want;
        const nz = OBS_Z[k] + (oz / d) * want;
        if (okGround(nx, nz, true) !== null) {
          a.x = nx;
          a.z = nz;
        }
      }
    }
  }
  settle(a, dt);
}

/** stand on the ground: height, body pitch/roll from the slope, the step cycle */
function settle(a: Animal, dt: number) {
  const size = a.def.size * a.scale;
  a.y = dinoLandY(a.x, a.z) ?? a.y;
  const fx = Math.sin(a.yaw) * size;
  const fz = Math.cos(a.yaw) * size;
  const yf = dinoLandY(a.x + fx, a.z + fz) ?? a.y;
  const yb = dinoLandY(a.x - fx, a.z - fz) ?? a.y;
  a.pitch = approach(a.pitch, clamp(Math.atan2(yb - yf, size * 2), -0.3, 0.3), dt * 4);
  const stride = a.def.stride * a.scale;
  a.phase = (a.phase + (a.speed / stride) * TAU * 0.5 * dt) % (TAU * 1000);
  a.gait = approach(a.gait, clamp(a.speed / a.def.walk, 0, 1.7), dt * 4);
  a.roll = a.def.waddle ? Math.sin(a.phase) * a.def.waddle * Math.min(1, a.gait) : 0;
}

// ── the T-rex ──
// modes: 0 patrol, 1 stomp over to the fence, 2 ROAR, 3 yawn, 4 nap, 5 get up
const T_PATROL = 0;
const T_STOMP = 1;
const T_ROAR = 2;
const T_YAWN = 3;
const T_NAP = 4;
const T_WAKE = 5;

function stepTrex(sim: DinoSim, a: Animal, dt: number, t: number, night: boolean) {
  const P = DINO_PADDOCK;
  const inner = DINO_RANGES.trex.r;
  const dK = kidDist(a);
  const kidToFence = kid.near ? Math.hypot(kid.x - P.x, kid.z - P.z) - P.r : Infinity;
  a.timer -= dt;
  let speedWant = 0;
  _want.yaw = 0;
  _want.pitch = -0.05;
  let jawWant = 0;
  let lieWant = 0;
  let shake = 0;
  let sway = 0;
  let rear = 0;
  switch (a.mode) {
    case T_PATROL: {
      speedWant = a.def.walk;
      const d = Math.hypot(a.tx - a.x, a.tz - a.z);
      if (d < 2 || a.timer <= 0) {
        const ang = rnd(a) * TAU;
        const r = inner * (0.4 + rnd(a) * 0.6);
        a.tx = P.x + Math.sin(ang) * r;
        a.tz = P.z + Math.cos(ang) * r;
        a.timer = 14;
        if (rnd(a) < (night ? 0.7 : 0.18)) {
          a.mode = T_YAWN;
          a.timer = 3;
        }
      }
      // someone's at the fence: stomp over
      if (kidToFence < 10 && sim.roarCool <= 0) {
        a.mode = T_STOMP;
        a.timer = 9;
      }
      // (and now and then a roar at the sky, when someone's about)
      if (kid.near && dK < 90 && sim.roarCool < -40 && rnd(a) < dt * 0.1) {
        a.mode = T_ROAR;
        a.timer = 2.6;
        sim.roared = true;
        sim.roarCool = 25;
      }
      break;
    }
    case T_STOMP: {
      // to the point inside the fence nearest the kid, stomping
      const kx = kid.near ? kid.x - P.x : a.x - P.x;
      const kz = kid.near ? kid.z - P.z : a.z - P.z;
      const kl = Math.hypot(kx, kz) || 1;
      a.tx = P.x + (kx / kl) * inner;
      a.tz = P.z + (kz / kl) * inner;
      speedWant = a.def.run * 0.8;
      shake = 0.2;
      const d = Math.hypot(a.tx - a.x, a.tz - a.z);
      const facing = Math.abs(wrap(Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw)) < 0.5;
      if ((d < 2.2 && facing) || a.timer <= 0) {
        a.mode = T_ROAR;
        a.timer = 2.8;
        sim.roared = true;
        sim.roarCool = 22;
      } else if (d < 2.2) speedWant = 0.3;
      if (kidToFence > 22) {
        a.mode = T_PATROL;
        a.timer = 0;
      }
      break;
    }
    case T_ROAR: {
      // ROOOAR: head up, jaws wide, tail up, shiver
      const u = 1 - a.timer / 2.8;
      jawWant = u < 0.85 ? 1.15 : 0;
      _want.pitch = 0.45 + Math.sin(t * 30) * 0.03;
      rear = 0.12;
      shake = u < 0.85 ? 1 : 0;
      sway = 0.1;
      // (face the kid)
      if (kid.near) a.yaw += clamp(wrap(Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw), -dt, dt);
      if (a.timer <= 0) {
        a.mode = T_YAWN;
        a.timer = 3.4;
      }
      break;
    }
    case T_YAWN: {
      // ...all that roaring is tiring. Yaaawn.
      const u = 1 - a.timer / 3.4;
      jawWant = Math.sin(Math.min(1, u * 1.15) * Math.PI) * 0.9;
      _want.pitch = 0.3 * Math.sin(u * Math.PI);
      rear = 0.06 * Math.sin(u * Math.PI);
      if (a.timer <= 0) {
        a.mode = T_NAP;
        a.timer = (night ? 60 : 18) + rnd(a) * 14;
      }
      break;
    }
    case T_NAP: {
      lieWant = 1;
      _want.pitch = -0.28;
      _want.yaw = 0.35;
      sway = 0.02;
      sim.napping = a.lie > 0.8;
      // (a snort in its sleep)
      if (Math.sin(t * 0.8) > 0.97) jawWant = 0.1;
      // (grumpily woken by a visitor at the fence)
      if ((a.timer <= 0 && !night) || (kidToFence < 3 && sim.roarCool <= 0) || (night && a.timer <= -120)) {
        a.mode = T_WAKE;
        a.timer = 2.2;
      }
      break;
    }
    case T_WAKE: {
      if (a.timer <= 0) {
        a.mode = kidToFence < 10 ? T_STOMP : T_PATROL;
        a.timer = 8;
      }
      break;
    }
  }
  a.shake = approach(a.shake, shake, dt * 6);
  a.sway = approach(a.sway, sway, dt * 3);
  a.rear = approach(a.rear, rear, dt * 3);
  a.lie = approach(a.lie, lieWant, dt * (lieWant > a.lie ? 0.9 : 1.6));
  if (a.lie > 0.3 && a.mode !== T_WAKE) speedWant = 0;
  a.jaw = approach(a.jaw, jawWant, dt * (jawWant > a.jaw ? 7 : 3));
  // move (inside the fence, round obstacles)
  moveOnGround(sim, a, dt, speedWant, 0, 0);
  const dx = a.x - P.x;
  const dz = a.z - P.z;
  const d = Math.hypot(dx, dz);
  if (d > inner + 0.5) {
    a.x = P.x + (dx / d) * (inner + 0.5);
    a.z = P.z + (dz / d) * (inner + 0.5);
  }
  if (a.mode === T_ROAR || a.mode === T_NAP) {
    a.hy = approach(a.hy, _want.yaw, dt * 3);
    a.hp = approach(a.hp, _want.pitch, dt * 4);
  } else lookAtKid(a, dK, _want, dt);
}

// ── a hatchling: popping its head out of its egg, looking round, squeaking, popping back in ──
function stepHatchling(a: Animal, dt: number, t: number) {
  const u = (t * 0.16 + a.slot * 0.37) % 1;
  // (up, a good long look round — at you, if you're there — then back down for a rest)
  const up = u < 0.1 ? u / 0.1 : u < 0.75 ? 1 : u < 0.85 ? 1 - (u - 0.75) / 0.1 : 0;
  const k = up * up * (3 - 2 * up);
  a.x = a.fcx;
  a.z = a.fcz;
  a.y = a.fh + 0.1 - (1 - k) * 0.55 + Math.abs(Math.sin(t * 9 + a.slot)) * 0.03 * k;
  const dK = kidDist(a);
  _want.yaw = Math.sin(t * 0.9 + a.slot * 2) * 0.9;
  _want.pitch = 0.25 + Math.sin(t * 1.3) * 0.15;
  if (dK < 10) {
    const rel = wrap(Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw);
    _want.yaw = Math.max(-1.2, Math.min(1.2, rel));
    _want.pitch = 0.35;
  }
  a.hy = approach(a.hy, _want.yaw, dt * 3);
  a.hp = approach(a.hp, _want.pitch, dt * 3);
  a.jaw = k > 0.9 ? Math.max(0, Math.sin(t * 6 + a.slot)) * 0.5 : 0;
  a.speed = 0;
  a.gait = 0;
  a.lie = 0;
  a.pitch = 0;
  a.roll = Math.sin(t * 5 + a.slot) * 0.05 * k;
  a.rear = 0.25 * k;
}

// ── flyers and swimmers ──

function stepFlyer(a: Animal, dt: number, t: number) {
  a.fa += a.fw * dt;
  const wob = Math.sin(t * 0.21 + a.s * 1e-9 * 7) * 0.12;
  const r = a.fr * (1 + wob);
  a.x = a.fcx + Math.sin(a.fa) * r;
  a.z = a.fcz + Math.cos(a.fa) * r;
  const climb = Math.sin(t * 0.33 + a.slot * 1.7);
  a.y = a.fh + climb * 4 + Math.sin(t * 0.9 + a.slot) * 0.6;
  a.yaw = a.fa + (a.fw > 0 ? Math.PI / 2 : -Math.PI / 2);
  a.roll = a.fw > 0 ? -0.35 : 0.35;
  a.pitch = -Math.cos(t * 0.33 + a.slot * 1.7) * 0.15;
  // flap on the way up, glide on the way down
  const flapping = climb < 0.2 || Math.cos(t * 0.33 + a.slot * 1.7) > 0.3;
  a.flap = approach(a.flap, flapping ? 0.75 : 0.06, dt * 2);
  a.phase += dt * (flapping ? 6.5 : 2);
  a.gait = 0;
  a.hy = Math.sin(t * 0.5 + a.slot) * 0.3;
  a.hp = 0;
  a.ears = 0;
}

function stepSwimmer(a: Animal, dt: number, t: number) {
  a.fa += a.fw * dt;
  const r = dinoCoastR(a.fa) * 1.3 + Math.sin(a.fa * 3 + 1) * 4;
  a.x = X0 + Math.sin(a.fa) * r;
  a.z = Z0 + Math.cos(a.fa) * r;
  a.yaw = a.fa + Math.PI / 2;
  // now and then a dive (only the head up) — then back up
  const dive = Math.max(0, Math.sin(t * 0.07 + 1.3) - 0.6) * 2.5;
  a.y = -0.6 - dive * 1.6 + Math.sin(t * 0.8) * 0.12;
  a.pitch = Math.sin(t * 0.8 + 1) * 0.04;
  a.roll = Math.sin(t * 0.5) * 0.05;
  a.phase += dt * 2.2;
  a.flap = 0.5;
  a.gait = 0;
  a.hy = Math.sin(t * 0.3) * 0.4;
  a.hp = -0.05 - dive * 0.35 + Math.sin(t * 0.6) * 0.08;
  // (it looks at you when you swim or sail by)
  const dK = kidDist(a);
  if (dK < 30) a.hy = clamp(wrap(Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw), -0.8, 0.8);
}

/** the T-rex sub-state (for tests / the HUD) */
export const trexMode = (sim: DinoSim) => ["patrol", "stomp", "roar", "yawn", "nap", "wake"][sim.trex.mode];
