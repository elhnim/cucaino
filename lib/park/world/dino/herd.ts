// How Dino Isle's animals live — pure maths, deterministic, allocation-free per step (tested).
//
// Like a nature documentary: the herds roam the whole island on a daily round (registry
// DINO_ZONES). At dawn and dusk they walk down to drink at the river, the ford and the lagoon
// (where the three-horn and duck-bill herds mix), by day they graze their way from pasture to
// pasture across the open plains and savanna, and at night they bed down at the edge of the woods.
// Long-necks amble from grove to grove and browse the young monkey-puzzles' crowns. Each herd moves
// as a herd: a lead animal out in front, the grown-ups round the outside and the young in the
// middle, finding its way over the land on a navigation grid (round the T-rex's valley, the lava,
// the cliffs and the sea). The Ice Age herds do the same on the tundra: mammoths plodding behind
// their matriarch, woolly rhinos, Irish elk; the sabre-cats lounge on their rocks.
//
// A Swiftclaw pack (friendly-looking feathered raptors) prowls the plains, stalks a herd, and
// chases it for show — the herd stampedes away, the raptors pull up well short (they never catch
// or hurt anything). Compys dart about in packs. Pteranodons soar over the cliffs and the volcano
// and swoop down to skim the sea. A plesiosaur swims round the coast.
//
// The T-rex roams its own walled valley on Rex Ridge (where the kid can't walk: a fenced rim, a
// railed bridge high above): it patrols, drinks at its pool, ROARS (the `roar` event — the whole
// island hears it, and the herds nearby startle), yawns and naps. It never comes towards the kid,
// and walks off if the kid somehow gets close.
//
// Everyone keeps their whole body apart (nose to tail: a capsule each) and steers round the trees
// and rocks. The Park kid is noticed — heads turn, curious little ones trot up to sniff — and
// nobody walks into them: smaller animals step aside, the giants stop and let the kid pass, and
// pushKid() keeps the kid out of their bodies.
import {
  DINO_DECKS,
  DINO_FENCE_E as DINO_FENCE_E_,
  DINO_GORGE,
  DINO_GX0 as DINO_GX0_,
  DINO_GX1,
  DINO_GZ0 as DINO_GZ0_,
  DINO_GZ1,
  DINO_ICE_LINE as DINO_ICE_LINE_,
  DINO_ISLAND,
  DINO_OBSTACLES,
  DINO_PLAZA,
  DINO_GATE,
  DINO_POOL,
  DINO_PROPS,
  DINO_RIVER,
  DINO_TREES,
  DINO_TREE_H,
  DINO_VOLCANO as DINO_VOLCANO_,
  DINO_ZONES,
  dinoDeckYN,
  dinoDeckYQ as dinoDeckYQ_,
  dinoGorgeEQ as dinoGorgeEQ_,
  dinoLandYQ as dinoLandYQ_,
  dinoWaterAtQ as dinoWaterAtQ_,
  DQ as DQ_,
  dinoGorgeE,
  dinoLandY,
  dinoLandYN,
  dinoWaterAtN,
  dinoOutline,
  dinoRng,
  dinoShoreDist,
  dinoWaterAt,
  type DinoZone,
  type DinoSpeciesId,
} from "../../registry/dinoIsland";
// (the per-frame code's imports, held in module constants: a test runner that turns every imported
//  name into a property read on the module would otherwise pay for that on every call)
const DINO_FENCE_E = DINO_FENCE_E_;
const DINO_GX0 = DINO_GX0_;
const DINO_GZ0 = DINO_GZ0_;
const DINO_ICE_LINE = DINO_ICE_LINE_;
const DINO_VOLCANO = DINO_VOLCANO_;
const dinoDeckYQ = dinoDeckYQ_;
const dinoGorgeEQ = dinoGorgeEQ_;
const dinoLandYQ = dinoLandYQ_;
const dinoWaterAtQ = dinoWaterAtQ_;
const DQ = DQ_;


const TAU = Math.PI * 2;
const X0 = DINO_ISLAND.x;
const Z0 = DINO_ISLAND.z;
const wrap = (a: number) => a - Math.round(a / TAU) * TAU;
/** sqrt(x² + z²) — not Math.hypot, which V8 doesn't inline (it boxes its result: garbage every call) */
const hyp = (x: number, z: number) => Math.sqrt(x * x + z * z);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const approach = (v: number, to: number, k: number) => v + (to - v) * (k > 1 ? 1 : k);

export type MeshId = "brachio" | "trike" | "stego" | "para" | "ankylo" | "trex" | "compy" | "raptor" | "ptero" | "plesio" | "mammoth" | "rhino" | "sloth" | "elk" | "sabre" | "bear" | "small" | "smallbeast";

export interface SpeciesDef {
  id: DinoSpeciesId;
  mesh: MeshId;
  /** variant in a mixed mesh */
  variant: number;
  /** body radius for spacing (m, at scale 1) */
  size: number;
  /** the body's capsule (model units, from the animal's origin): nose reach, tail reach, half-width */
  body: [number, number, number];
  walk: number;
  run: number;
  /** metres per step cycle */
  stride: number;
  /** turn rate (rad/s) */
  turn: number;
  /** keep at least this far from the kid (walk round / wait) — 0: not shy */
  personal: number;
  curious: boolean;
  /** a giant: stops and lets the kid pass instead of stepping aside */
  giant?: boolean;
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
  /** (derived, for the per-frame code: no string compares) in the air or the sea (pteranodons,
   *  plesiosaurs), the raptors' prey, a raptor */
  air?: boolean;
  prey?: boolean;
  raptor?: boolean;
}

const SPECIES_STORYBOOK: Omit<SpeciesDef, "body">[] = [
  { id: "brachio", mesh: "brachio", variant: 0, size: 3.2, walk: 1.1, run: 2, stride: 5.5, turn: 0.35, personal: 9, curious: false, giant: true, graze: -0.25, look: 0.9, eyeY: 12.5, scale: [0.9, 1.08], special: [14, 12], wade: true, coats: [["#8fbf6a", "#f0e2b0"], ["#6fb7a6", "#e8f0c8"], ["#a3b06a", "#f4e4b8"], ["#7fa7c9", "#eef0dc"]] },
  { id: "trike", mesh: "trike", variant: 0, size: 1.9, walk: 1.2, run: 3, stride: 2.6, turn: 0.8, personal: 5.5, curious: false, graze: -0.55, look: 0.8, eyeY: 2.1, scale: [0.9, 1.1], special: [18, 2.2], wade: true, coats: [["#c98b52", "#ff7a4a"], ["#8f9f5a", "#ffc14a"], ["#b0794a", "#ff5a7a"], ["#9a8a6a", "#4fc3a1"]] },
  { id: "stego", mesh: "stego", variant: 0, size: 1.9, walk: 1.0, run: 2.4, stride: 2.4, turn: 0.7, personal: 5, curious: false, graze: -0.5, look: 0.7, eyeY: 1.3, scale: [0.9, 1.08], special: [15, 3], wade: true, coats: [["#8fae5a", "#ff8a3c"], ["#6f9a7a", "#ffb04a"], ["#9fa05a", "#e8584a"]] },
  { id: "para", mesh: "para", variant: 0, size: 1.6, walk: 1.3, run: 3.2, stride: 2.4, turn: 0.9, personal: 4.5, curious: false, graze: -0.9, look: 0.9, eyeY: 4.1, scale: [0.88, 1.06], special: [12, 2.4], wade: true, coats: [["#6aa0c0", "#ff8a4a"], ["#8a9fd0", "#ffd05a"], ["#5fb09a", "#ff6a6a"], ["#b08ad0", "#ffc04a"]] },
  { id: "ankylo", mesh: "ankylo", variant: 0, size: 1.6, walk: 0.8, run: 1.8, stride: 1.8, turn: 0.8, personal: 3.8, curious: false, graze: -0.3, look: 0.6, eyeY: 1.2, scale: [0.95, 1.05], special: [10, 2.5], wade: true, coats: [["#b08a5a", "#e8c89a"], ["#8a8a6a", "#d8c8a0"]] },
  { id: "trex", mesh: "trex", variant: 0, size: 2.4, walk: 1.5, run: 3, stride: 3.6, turn: 0.6, personal: 0, curious: false, giant: true, graze: -0.2, look: 1.0, eyeY: 4.6, scale: [1, 1], special: [0, 0], coats: [["#7a9a4a", "#f0dca0"]] },
  { id: "compy", mesh: "compy", variant: 0, size: 0.3, walk: 2.2, run: 5.2, stride: 0.5, turn: 5, personal: 0, curious: true, graze: -0.7, look: 1.2, eyeY: 0.65, scale: [0.9, 1.15], special: [6, 1], coats: [["#6ad05a", "#fff0a0"], ["#4fc3a1", "#fff4c8"], ["#9ad04a", "#ffe08a"]] },
  { id: "raptor", mesh: "raptor", variant: 0, size: 0.5, walk: 1.5, run: 6.5, stride: 0.95, turn: 3.2, personal: 4, curious: false, graze: -0.4, look: 1.1, eyeY: 1.4, scale: [0.94, 1.06], special: [9, 1.6], coats: [["#5aa0e0", "#ffcf3a"], ["#e0705a", "#ffe07a"], ["#7ac05a", "#ff8ad0"], ["#a07ae0", "#7ae0d0"]] },
  { id: "ptero", mesh: "ptero", variant: 0, size: 1, walk: 9, run: 12, stride: 1, turn: 1, personal: 0, curious: false, graze: 0, look: 0.4, eyeY: 0, scale: [0.9, 1.15], special: [0, 0], coats: [["#e87a5a", "#ffd0a0"], ["#d08a4a", "#ff8a5a"], ["#a07ac8", "#ffc0e0"]] },
  { id: "plesio", mesh: "plesio", variant: 0, size: 2, walk: 2, run: 3, stride: 3, turn: 0.4, personal: 0, curious: false, graze: 0, look: 0.6, eyeY: 3.3, scale: [1, 1], special: [0, 0], coats: [["#4a8ab0", "#cfe8f0"]] },
  { id: "mammoth", mesh: "mammoth", variant: 0, size: 2.1, walk: 1.0, run: 2.5, stride: 2.6, turn: 0.6, personal: 7, curious: false, giant: true, graze: -0.3, look: 0.7, eyeY: 3.6, scale: [0.92, 1.08], special: [16, 3], coats: [["#8a5a3a", "#5a3a2a"], ["#a0683e", "#6a4430"], ["#7a4e34", "#4e3226"], ["#9a6a48", "#62402c"]] },
  { id: "rhino", mesh: "rhino", variant: 0, size: 1.4, walk: 0.9, run: 2.6, stride: 1.8, turn: 0.8, personal: 4.5, curious: false, graze: -0.45, look: 0.7, eyeY: 1.4, scale: [0.95, 1.05], special: [14, 2], coats: [["#9a7250", "#6a4a34"], ["#8a6a50", "#5a4030"]] },
  { id: "sloth", mesh: "sloth", variant: 0, size: 1.6, walk: 0.55, run: 1.2, stride: 1.4, turn: 0.6, personal: 3.8, curious: false, graze: -0.2, look: 0.8, eyeY: 2.6, scale: [0.95, 1.05], special: [10, 9], coats: [["#9a7a5a", "#c8a882"], ["#8a6e52", "#bca07a"]] },
  { id: "elk", mesh: "elk", variant: 0, size: 1.2, walk: 1.2, run: 4, stride: 1.8, turn: 1, personal: 6, curious: false, graze: -0.9, look: 0.9, eyeY: 2.5, scale: [0.92, 1.05], special: [12, 3], coats: [["#a0704a", "#e8d8b8"], ["#8a603e", "#dcc8a8"], ["#b07a50", "#f0e0c0"]] },
  { id: "sabre", mesh: "sabre", variant: 0, size: 0.8, walk: 1.1, run: 3.5, stride: 1.2, turn: 1.4, personal: 3.2, curious: false, graze: -0.3, look: 1.1, eyeY: 1.15, scale: [1.2, 1.3], special: [9, 2.6], coats: [["#d8a860", "#f4e8d0"], ["#c89850", "#f0e0c8"]] },
  { id: "bear", mesh: "bear", variant: 0, size: 1.1, walk: 0.9, run: 2.5, stride: 1.4, turn: 0.9, personal: 3.5, curious: false, graze: -0.5, look: 0.9, eyeY: 1.5, scale: [1.05, 1.2], special: [14, 3.5], coats: [["#7a5a42", "#b89878"], ["#6a4e3a", "#a88a6a"]] },
  { id: "dodo", mesh: "small", variant: 0, size: 0.4, walk: 0.8, run: 1.8, stride: 0.45, turn: 3, personal: 0, curious: true, graze: -0.7, look: 1.2, eyeY: 0.9, scale: [0.95, 1.1], special: [8, 1.5], waddle: 0.16, coats: [["#9aa8b8", "#d8dce4"], ["#a8a0b0", "#e0dce8"], ["#8a98a8", "#d0d8e0"]] },
  { id: "moa", mesh: "small", variant: 1, size: 0.6, walk: 1.2, run: 3.4, stride: 1.2, turn: 1.5, personal: 3.2, curious: false, graze: -1.0, look: 1.0, eyeY: 2.6, scale: [0.9, 1.1], special: [10, 2], coats: [["#8a6a4a", "#6a4e36"], ["#9a7a52", "#7a5a3e"], ["#7a5e44", "#5e442e"]] },
  { id: "thylacine", mesh: "smallbeast", variant: 2, size: 0.5, walk: 1.4, run: 3.5, stride: 0.9, turn: 2, personal: 0, curious: true, graze: -0.6, look: 1.1, eyeY: 0.7, scale: [1.05, 1.05], special: [8, 2], coats: [["#c8a070", "#f0e0c0"]] },
  { id: "terror", mesh: "small", variant: 3, size: 0.6, walk: 1.1, run: 3.5, stride: 1.0, turn: 1.8, personal: 0, curious: true, graze: -0.6, look: 1.2, eyeY: 2.1, scale: [1.1, 1.1], special: [7, 2], coats: [["#4a7ac8", "#ffd84a"]] },
  { id: "glypto", mesh: "smallbeast", variant: 4, size: 1.1, walk: 0.5, run: 1, stride: 0.9, turn: 0.8, personal: 0, curious: true, graze: -0.3, look: 0.7, eyeY: 0.65, scale: [0.95, 1.05], special: [0, 0], coats: [["#a88a5a", "#6a5a44"], ["#98804e", "#5e503c"]] },
];

/** each species' body capsule (model units): nose reach, tail reach, half-width (measured from ./species.ts, tested) */
export const BODY: Record<DinoSpeciesId, [number, number, number]> = {
  brachio: [9.85, 13.63, 2.7],
  trike: [4.77, 5.12, 1.62],
  stego: [3.82, 6.02, 1.35],
  para: [3.71, 5.61, 1.32],
  ankylo: [3.35, 5.67, 1.79],
  trex: [5.13, 7.81, 2.0],
  compy: [0.52, 0.85, 0.14],
  raptor: [1.22, 1.75, 0.29],
  ptero: [2.24, 1.1, 3.25],
  plesio: [5.01, 3.6, 3.05],
  mammoth: [5.12, 2.7, 1.68],
  rhino: [3.26, 1.79, 0.92],
  sloth: [2.81, 2.98, 1.4],
  elk: [2.02, 1.29, 2.3],
  sabre: [1.44, 1.03, 0.42],
  bear: [2.22, 1.33, 0.84],
  dodo: [0.76, 0.47, 0.36],
  moa: [1.05, 0.68, 0.48],
  thylacine: [1.06, 1.15, 0.21],
  terror: [1.55, 1.12, 0.47],
  glypto: [1.88, 2.52, 1.07],
};

// ── true size ──
// The Park kid is 2.26 world units tall and stands for a real ~1.4 m ten-year-old, so one real
// metre is DINO_M = 1.6 units. The models (./species.ts) are built roughly in metres; each species'
// scale is set so the animal stands at its real size next to the kid: k = DINO_M x real / model,
// measured along the dimension named (h: height to the top, l: nose to tail, w: wingspan / antler
// span). Speeds scale by k too, so legs keep the same step rate at the bigger size.
export const DINO_M = 1.6;
export const TRUE_SIZE: Record<DinoSpeciesId, { real: number; dim: "h" | "l" | "w"; model: number }> = {
  brachio: { real: 13, dim: "h", model: 14.0 }, // Brachiosaurus: ~13 m tall with its neck up, 22–26 m long
  trike: { real: 8.5, dim: "l", model: 9.89 }, // Triceratops: 8–9 m long, ~3 m tall
  stego: { real: 9, dim: "l", model: 9.84 }, // Stegosaurus: ~9 m long, ~4 m to the top of its plates
  para: { real: 9.5, dim: "l", model: 9.33 }, // Parasaurolophus: ~9.5 m long
  ankylo: { real: 7, dim: "l", model: 9.01 }, // Ankylosaurus: 6–8 m long, ~1.7 m tall
  trex: { real: 12.3, dim: "l", model: 12.95 }, // T. rex: ~12 m long, ~4 m at the hip
  compy: { real: 1.0, dim: "l", model: 1.37 }, // Compsognathus: ~1 m long (mostly tail), chicken-sized
  raptor: { real: 3.0, dim: "l", model: 2.97 }, // the Swiftclaw (Deinonychus-sized): ~3 m nose to tail
  ptero: { real: 6.25, dim: "w", model: 6.5 }, // Pteranodon: 6–7 m wingspan
  plesio: { real: 3.5, dim: "l", model: 8.62 }, // Plesiosaurus: ~3.5 m long
  mammoth: { real: 3.5, dim: "h", model: 4.66 }, // woolly mammoth: ~3.4 m at the shoulder hump
  rhino: { real: 4.2, dim: "l", model: 5.05 }, // woolly rhino: ~3.6 m body + its 0.6 m front horn, 2 m tall
  sloth: { real: 6, dim: "l", model: 5.8 }, // Megatherium: ~6 m long, elephant-sized
  elk: { real: 3.6, dim: "w", model: 4.6 }, // Irish elk: antlers up to 3.6 m across, ~2.1 m at the shoulder
  sabre: { real: 1.1, dim: "h", model: 1.26 }, // Smilodon: ~1.1 m at the shoulder (model: its back)
  bear: { real: 3.0, dim: "l", model: 3.55 }, // cave bear: ~3 m long
  dodo: { real: 0.7, dim: "h", model: 1.01 }, // dodo: ~0.7 m tall
  moa: { real: 3.6, dim: "h", model: 2.73 }, // giant moa: up to 3.6 m with its head raised
  thylacine: { real: 1.8, dim: "l", model: 2.21 }, // thylacine: ~1.8 m nose to tail tip, 0.6 m at the shoulder
  terror: { real: 2.5, dim: "h", model: 2.63 }, // terror bird (Titanis): ~2.5 m tall
  glypto: { real: 3.3, dim: "l", model: 4.4 }, // Glyptodon: ~3.3 m long with its tail, 1.5 m tall
};
/** world units per model unit for a species (its true-size factor) */
export const trueK = (id: DinoSpeciesId) => (DINO_M * TRUE_SIZE[id].real) / TRUE_SIZE[id].model;

export const SPECIES: SpeciesDef[] = SPECIES_STORYBOOK.map((d) => {
  // (the storybook scale ranges become a +-jitter round the true size)
  const k = trueK(d.id) / ((d.scale[0] + d.scale[1]) / 2);
  // (every species built with the same fields in the same order, so
  //  reading def.size, def.walk... in the per-frame code sees ONE object shape: V8 boxes (allocates)
  //  a double read from many shapes)
  return {
    id: d.id,
    mesh: d.mesh,
    variant: d.variant,
    size: d.size,
    body: BODY[d.id],
    walk: d.walk * trueK(d.id),
    run: d.run * trueK(d.id),
    stride: d.stride,
    turn: d.turn,
    personal: d.personal,
    curious: d.curious,
    giant: !!d.giant,
    graze: d.graze,
    look: d.look,
    eyeY: d.eyeY,
    scale: [d.scale[0] * k, d.scale[1] * k] as [number, number],
    special: d.special,
    wade: !!d.wade,
    waddle: d.waddle ?? 0,
    coats: d.coats,
    air: d.id === "ptero" || d.id === "plesio",
    prey: d.id === "trike" || d.id === "para" || d.id === "stego" || d.id === "ankylo",
    raptor: d.id === "raptor",
  };
});
const SPECIES_OF = new Map(SPECIES.map((s) => [s.id, s]));

// ── the herds: who lives where, and their daily round ──

export interface HerdPlan {
  id: string;
  species: DinoSpeciesId;
  /** [standard, low quality] grown-ups and young */
  n: [number, number];
  young?: [number, number];
  /** zones (registry DINO_ZONES) it grazes by day (in turn), drinks at (dawn + dusk), sleeps at (night) */
  day: string[];
  water?: string[];
  rest?: string[];
  /** how fast (m/s) the herd as a whole moves when it's on the way somewhere */
  travel?: number;
  /** stays put in its first day zone, wandering about it (the small ones, the nest babies) */
  home?: boolean;
}
export const HERD_PLANS: HerdPlan[] = ([
  { id: "brachio-a", species: "brachio", n: [3, 2], young: [1, 0], day: ["grove-n", "plains-mid", "grove-w", "plains-ne"], water: ["river-mid"], rest: ["grove-n"], travel: 1.3 },
  { id: "brachio-b", species: "brachio", n: [3, 0], day: ["grove-e", "savanna-e", "savanna-w"], water: ["river-s"], rest: ["grove-e"], travel: 1.3 },
  { id: "trike-a", species: "trike", n: [5, 3], young: [2, 1], day: ["plains-mid", "plains-ne", "plains-far"], water: ["ford"], rest: ["wood-e"], travel: 2.3 },
  { id: "trike-b", species: "trike", n: [4, 0], young: [1, 0], day: ["savanna-s", "savanna-w", "savanna-e"], water: ["ford", "river-e"], rest: ["wood-s"], travel: 2.3 },
  { id: "para", species: "para", n: [7, 4], day: ["plains-nw", "plains-mid", "plains-far", "savanna-n"], water: ["ford"], rest: ["wood-n"], travel: 2.6 },
  { id: "stego", species: "stego", n: [4, 2], day: ["savanna-w", "savanna-s", "savanna-n"], water: ["river-e"], rest: ["wood-s"], travel: 1.4 },
  { id: "ankylo", species: "ankylo", n: [3, 2], day: ["savanna-s", "savanna-e", "savanna-w"], water: ["river-e"], rest: ["wood-s"], travel: 1.2 },
  { id: "nests", species: "trike", n: [0, 0], young: [4, 2], day: ["nests"], home: true },
  { id: "compy-a", species: "compy", n: [6, 4], day: ["compy-a"], home: true },
  { id: "compy-b", species: "compy", n: [6, 0], day: ["compy-b"], home: true },
  { id: "raptor", species: "raptor", n: [4, 3], day: ["plains-w", "jungle-w"], rest: ["plains-w"], travel: 2.2 },
  { id: "dodo", species: "dodo", n: [5, 3], day: ["dodo-beach"], home: true },
  { id: "moa", species: "moa", n: [4, 2], day: ["moa"], home: true },
  { id: "thylacine", species: "thylacine", n: [1, 1], day: ["jungle-w"], home: true },
  { id: "terror", species: "terror", n: [1, 1], day: ["savanna-w"], home: true },
  { id: "sloth", species: "sloth", n: [2, 1], day: ["jungle-w"], home: true },
  { id: "glypto", species: "glypto", n: [2, 1], day: ["moa"], home: true },
  { id: "mammoth-a", species: "mammoth", n: [5, 3], young: [2, 1], day: ["tundra-e", "tundra-n", "tundra-w", "bridge"], water: ["pond"], rest: ["spruce-w"], travel: 1.3 },
  { id: "mammoth-b", species: "mammoth", n: [4, 0], young: [1, 0], day: ["tundra-n", "tundra-w", "tundra-e"], water: ["pond"], rest: ["spruce-e"], travel: 1.3 },
  { id: "rhino", species: "rhino", n: [3, 2], day: ["tundra-w", "tundra-e", "tundra-n"], rest: ["spruce-e"], travel: 1.2 },
  { id: "elk", species: "elk", n: [4, 2], day: ["elk-glade", "tundra-n", "tundra-w"], rest: ["spruce-w"], travel: 1.8 },
  { id: "sabre", species: "sabre", n: [2, 1], young: [2, 1], day: ["sabre-rocks"], home: true },
  { id: "bear", species: "bear", n: [2, 1], day: ["bear-den"], home: true },
  { id: "trex", species: "trex", n: [1, 1], day: [], home: true },
  { id: "ptero", species: "ptero", n: [7, 4], day: [], home: true },
  { id: "plesio", species: "plesio", n: [1, 1], day: [], home: true },
] as HerdPlan[]).map((p) => ({
  // (all the plans one shape — the same fields in the same order — for the per-frame code)
  id: p.id,
  species: p.species,
  n: p.n,
  young: p.young,
  day: p.day,
  water: p.water,
  rest: p.rest,
  travel: p.travel,
  home: p.home,
}));

const PREY = new Set<DinoSpeciesId>(["trike", "para", "stego", "ankylo"]);
/** how close (m) a raptor may ever come to a prey animal's body */
export const RAPTOR_GAP = 7;

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
  /** its place in the herd's formation (herd-local: +z = the way the herd is heading) */
  ox: number;
  oz: number;
  /** a little personal drift round that place while grazing */
  jx: number;
  jz: number;
  /** 0 the lead, 1 grown-ups round the outside, 2 young in the middle */
  rank: number;
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
  /** (the T-rex's / a flyer's sub-state; 1 = a hatchling in its egg) */
  mode: number;
  /** its capsule (world, this step): tail end a, nose end b, radius */
  cax: number;
  caz: number;
  cbx: number;
  cbz: number;
  cr: number;
  /** half its body's length plus its half-width (a quick bound for spacing) */
  reach: number;
  /** has to mind the raptors (or, for a raptor, its prey) this step */
  wary: boolean;
  /** how long (s) it's been unable to move; its best distance to its place lately, and how long since it got any closer */
  stuck: number;
  best: number;
  bestT: number;
  /** scratch for allocation-free calls (V8 boxes every double passed to a call it doesn't inline):
   *  a candidate step (nx, nz, heading nyaw), its body before a move (oax..obz), a turn (dyaw),
   *  a result (out), and what stepWalker asks of moveOnGround (mvW speed, mvX/mvZ steer) and the kid's distance (dK) */
  nx: number;
  nz: number;
  nyaw: number;
  oax: number;
  oaz: number;
  obx: number;
  obz: number;
  dyaw: number;
  out: number;
  mvW: number;
  mvX: number;
  mvZ: number;
  dK: number;
  /** the heading capsule() last took the sine/cosine of, and those */
  syaw: number;
  sny: number;
  csy: number;
}

export interface Herd {
  plan: HerdPlan;
  realm: "dino" | "ice";
  /** the herd's centre and heading (unit vector) */
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  /** where it's going: a zone (index into DINO_ZONES), and the spot in it */
  zone: number;
  tx: number;
  tz: number;
  /** -1 none / the phase it last planned for (0 dawn, 1 day, 2 dusk, 3 night) */
  phase: number;
  /** which day zone is next, how long until it moves on */
  next: number;
  dwell: number;
  /** on its way (not yet arrived) */
  moving: boolean;
  /** stampeding away from (fx, fz) for this long */
  flee: number;
  fx: number;
  fz: number;
  /** the formation's radius, and its whole footprint's (grazing spread + bodies) */
  R: number;
  F: number;
  timer: number;
  s: number;
  members: Animal[];
  /** a raptor pack (or, for the pack, a prey herd) is close enough to mind */
  wary: boolean;
  /** the raptors' hunt: 0 prowl, 1 stalk, 2 chase, 3 rest; the herd being hunted */
  hunt: number;
  prey: Herd | null;
  huntT: number;
  /** scratch: the speed moveHerdTo / moveHerdAway move it at (no double arguments: see DQ) */
  spd: number;
}

export interface DinoSim {
  animals: Animal[];
  herds: Herd[];
  trex: Animal;
  /** the T-rex roared this step / is napping (Zzz) */
  roared: boolean;
  napping: boolean;
  roarCool: number;
  /** until the T-rex will put on another show for a watcher */
  showCool: number;
  /** seconds simulated, steps taken */
  clock: number;
  frame: number;
  /** the walkers' indices sorted by their bodies' middle z, the sorted keys, the longest reach (for the spacing sweep) */
  byZ: Int32Array;
  zKey: Float32Array;
  maxReach: number;
  /** the raptors and their prey (each only ever minds the other kind) */
  raptors: Animal[];
  prey: Animal[];
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
const OX0 = X0 + DINO_GX0;
const OZ0 = Z0 + DINO_GZ0;
const GNX = Math.ceil((DINO_GX1 - DINO_GX0) / CELL) + 1;
const GNZ = Math.ceil((DINO_GZ1 - DINO_GZ0) / CELL) + 1;
const cellOf = (x: number, z: number) => {
  const i = Math.floor((x - OX0) / CELL);
  const j = Math.floor((z - OZ0) / CELL);
  return i < 0 || j < 0 || i >= GNX || j >= GNZ ? -1 : j * GNX + i;
};
/** what the animals steer round: the island's obstacles, plus soft keep-outs over the decks and ramps
 *  (so a herd ambles round the lookout tower instead of tangling a long neck in its rails) */
const ANIMAL_OBS: { x: number; z: number; r: number }[] = [
  ...DINO_OBSTACLES,
  ...DINO_DECKS.flatMap((d) => {
    // (not the Rex Bridge: it's high over the T-rex's head, and nobody else goes near)
    if (d.id.startsWith("rexbridge")) return [];
    if (d.r !== undefined) return [{ x: d.ax, z: d.az, r: d.r + 1.2 }];
    const L = Math.sqrt((d.bx - d.ax) * (d.bx - d.ax) + (d.bz - d.az) * (d.bz - d.az));
    const n = Math.max(1, Math.ceil(L / 2));
    return Array.from({ length: n + 1 }, (_, i) => ({ x: d.ax + ((d.bx - d.ax) * i) / n, z: d.az + ((d.bz - d.az) * i) / n, r: d.half + 1.2 }));
  }),
];
const OBS_X = new Float32Array(ANIMAL_OBS.map((o) => o.x));
const OBS_Z = new Float32Array(ANIMAL_OBS.map((o) => o.z));
const OBS_R = new Float32Array(ANIMAL_OBS.map((o) => o.r));
const OBS_START = new Int32Array(GNX * GNZ + 1);
/** (each bucket holds the obstacles within this much of the cell: the widest body is ~4.2 m) */
const OBS_PAD = 7;
const OBS_LIST: Int32Array = (() => {
  const buckets: number[][] = Array.from({ length: GNX * GNZ }, () => []);
  ANIMAL_OBS.forEach((o, k) => {
    const pad = o.r + OBS_PAD;
    for (let i = Math.floor((o.x - pad - OX0) / CELL); i <= Math.floor((o.x + pad - OX0) / CELL); i++)
      for (let j = Math.floor((o.z - pad - OZ0) / CELL); j <= Math.floor((o.z + pad - OZ0) / CELL); j++) if (i >= 0 && j >= 0 && i < GNX && j < GNZ) buckets[j * GNX + i].push(k);
  });
  const flat: number[] = [];
  buckets.forEach((b, c) => {
    OBS_START[c] = flat.length;
    flat.push(...b);
  });
  OBS_START[GNX * GNZ] = flat.length;
  return new Int32Array(flat);
})();

/** the obstacles near the animal being moved this step (unique, gathered once per move) */
const NEAR_OBS = new Int32Array(2048);
let NEAR_N = 0;
const OBS_STAMP = new Uint32Array(OBS_X.length);
let stampN = 1;
function gatherObs(a: Animal) {
  stampN++;
  NEAR_N = 0;
  const nS = a.reach > 9 ? 5 : a.reach > 2.5 ? 3 : 1;
  const mx = (a.cax + a.cbx) * 0.5;
  const mz = (a.caz + a.cbz) * 0.5;
  for (let si = 0; si < nS; si++) {
    const u = nS > 1 ? si / (nS - 1) : 0.5;
    const c = cellOf(a.cax + (a.cbx - a.cax) * u, a.caz + (a.cbz - a.caz) * u);
    if (c < 0) continue;
    for (let q = OBS_START[c]; q < OBS_START[c + 1]; q++) {
      const k = OBS_LIST[q];
      if (OBS_STAMP[k] === stampN) continue;
      OBS_STAMP[k] = stampN;
      const dx = OBS_X[k] - mx;
      const dz = OBS_Z[k] - mz;
      const lim = a.reach + OBS_R[k] + 3;
      if (dx * dx + dz * dz < lim * lim && NEAR_N < NEAR_OBS.length) NEAR_OBS[NEAR_N++] = k;
    }
  }
}

/** is (x, z) clear ground for a body of half-width r: dry land, off the decks, no trunk or rock within r */
function pointClear(x: number, z: number, r: number, wade: boolean): boolean {
  DQ[0] = x;
  DQ[1] = z;
  HQ[0] = r;
  return pointClearQ(wade);
}
/** pointClear on DQ[0], DQ[1] with r in HQ[0] (allocation-free) */
function pointClearQ(wade: boolean): boolean {
  const x = DQ[0];
  const z = DQ[1];
  const r = HQ[0];
  if (!okGroundQ(wade)) return false;
  // (nor over the T-rex's valley's rim fence)
  dinoGorgeEQ();
  if (DQ[2] < DINO_FENCE_E + 0.1 + r / 30) return false;
  const c = cellOf(x, z);
  if (c < 0) return false;
  for (let q = OBS_START[c]; q < OBS_START[c + 1]; q++) {
    const k = OBS_LIST[q];
    const rr = OBS_R[k] + r;
    if (((OBS_X[k] - x) * (OBS_X[k] - x)) + ((OBS_Z[k] - z) * (OBS_Z[k] - z)) < rr * rr) return false;
  }
  return true;
}

/** the hatched eggs in the nests (world): where the hatchlings pop out (see props.ts nest(): egg 1 of 5) */
const HATCH = DINO_PROPS.filter((p) => p.kind === "nest").map((p) => {
  const a = (1 / 5) * Math.PI * 2 + p.v;
  const lx = Math.sin(a) * 0.55 * p.s;
  const lz = Math.cos(a) * 0.55 * p.s;
  return { x: p.x + lx * Math.cos(p.rot) + lz * Math.sin(p.rot), z: p.z - lx * Math.sin(p.rot) + lz * Math.cos(p.rot), y: p.y };
});
/** how many of the nest babies are still hatching (the rest play round the nests) */
const HATCHLINGS: [number, number] = [2, 1];

/** the trees the long-necks browse (young monkey-puzzles, crowns at their head height) and the sloths reach into (tree ferns) */
export const BROWSE_TREES = DINO_TREES.filter((t) => (t.kind === "araucaria" && t.s < 0.4) || t.kind === "treefern").map((t) => ({ x: t.x, z: t.z, h: DINO_TREE_H[t.kind] * t.s * (t.kind === "araucaria" ? 0.86 : 0.9), r: t.kind === "araucaria" ? 1.5 * t.s : 0.45 * t.s, fern: t.kind === "treefern" }));
const TREES = BROWSE_TREES;

/** the ground an animal can stand on (dry land, or shallow water for waders) */
/** the ground's height if an animal can stand there, else NaN (never null: no boxing in the hot path) */
function okGround(x: number, z: number, wade: boolean): number {
  DQ[0] = x;
  DQ[1] = z;
  return okGroundQ(wade) ? DQ[3] : NaN;
}
/** extra arguments for the allocation-free calls (see DQ) */
const HQ = new Float64Array(4);
/** okGround on DQ[0], DQ[1]: true if an animal can stand there (its height left in DQ[3]) */
function okGroundQ(wade: boolean): boolean {
  dinoLandYQ();
  const y = DQ[2];
  if (!(y >= 1.3)) return false;
  if (!wade) {
    dinoWaterAtQ();
    if (DQ[2] === DQ[2]) return false;
  }
  // (the decks, ramps and boardwalks are for people — though the T-rex walks under its bridge)
  DQ[3] = y;
  return !onDeckQ();
}
/** a height is real (not NaN) */
const isY = (y: number) => y === y;
/** the decks' boxes (world), for a quick "is this on a deck" */
const DECK_BOX = DINO_DECKS.map((d) => ({ x0: Math.min(d.ax, d.bx) - (d.r ?? d.half) - 1, x1: Math.max(d.ax, d.bx) + (d.r ?? d.half) + 1, z0: Math.min(d.az, d.bz) - (d.r ?? d.half) - 1, z1: Math.max(d.az, d.bz) + (d.r ?? d.half) + 1 }));
/** is DQ[0], DQ[1] on a deck (more than 3 m above the ground there, DQ[3], doesn't count) */
function onDeckQ(): boolean {
  const x = DQ[0];
  const z = DQ[1];
  for (let k = 0; k < DECK_BOX.length; k++) {
    const b = DECK_BOX[k];
    if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) {
      const ground = DQ[3];
      dinoDeckYQ();
      const d = DQ[2];
      return d === d && d - ground < 3;
    }
  }
  return false;
}

// ── the herds' navigation grid: open, walkable land per realm, and a distance field to every zone ──
const NAV = 6;
const NNX = Math.ceil((DINO_GX1 - DINO_GX0) / NAV);
const NNZ = Math.ceil((DINO_GZ1 - DINO_GZ0) / NAV);
const navX = (i: number) => X0 + DINO_GX0 + (i + 0.5) * NAV;
const navZ = (j: number) => Z0 + DINO_GZ0 + (j + 0.5) * NAV;
const navCell = (x: number, z: number) => {
  const i = Math.floor((x - X0 - DINO_GX0) / NAV);
  const j = Math.floor((z - Z0 - DINO_GZ0) / NAV);
  return i < 0 || j < 0 || i >= NNX || j >= NNZ ? -1 : j * NNX + i;
};
/** the herds keep out of the visitors' plaza and gate */
const VISITORS = [
  { x: DINO_PLAZA.x, z: DINO_PLAZA.z, r: 26 },
  { x: DINO_GATE.x, z: DINO_GATE.z, r: 20 },
];
/** the ford (the herds cross the river there, and only there) */
const FORD_ZONE = DINO_ZONES.find((q) => q.id === "ford")!;
/** which realm a cell is in (0 none, 1 dino, 2 ice) */
const NAV_REALM: Uint8Array = (() => {
  const m = new Uint8Array(NNX * NNZ);
  const big = DINO_OBSTACLES.filter((o) => o.r >= 2.2);
  for (let j = 0; j < NNZ; j++)
    for (let i = 0; i < NNX; i++) {
      const x = navX(i);
      const z = navZ(j);
      if (dinoShoreDist(x, z) > -7) continue;
      let lo = Infinity;
      let hi = -Infinity;
      let wet = 0;
      let ok = true;
      for (const [dx, dz] of [
        [0, 0],
        [-2.4, -2.4],
        [2.4, -2.4],
        [-2.4, 2.4],
        [2.4, 2.4],
      ]) {
        const y = dinoLandY(x + dx, z + dz);
        if (y === null || y < 1.5) {
          ok = false;
          break;
        }
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
        if (dinoWaterAt(x + dx, z + dz) !== null) wet++;
      }
      if (!ok || hi - lo > 2.6 || lo < 1.8) continue;
      // (water only at the ford, the shallows the herds cross: the river's channel is a barrier elsewhere)
      if (wet > 1 && Math.sqrt((x - FORD_ZONE.x) * (x - FORD_ZONE.x) + (z - FORD_ZONE.z) * (z - FORD_ZONE.z)) > 13) continue;
      if (Math.sqrt((x - FORD_ZONE.x) * (x - FORD_ZONE.x) + (z - FORD_ZONE.z) * (z - FORD_ZONE.z)) > 14 && DINO_RIVER.some((q) => ((q.x - x) * (q.x - x)) + ((q.z - z) * (q.z - z)) < ((q.half + 4.5) * (q.half + 4.5)))) continue;
      if (dinoGorgeE(x, z) < DINO_FENCE_E + 0.45) continue;
      if (Math.sqrt((x - DINO_VOLCANO.x) * (x - DINO_VOLCANO.x) + (z - DINO_VOLCANO.z) * (z - DINO_VOLCANO.z)) < DINO_VOLCANO.r * 0.62) continue;
      if (isY(dinoDeckYN(x, z))) continue;
      if (VISITORS.some((v) => Math.sqrt((x - v.x) * (x - v.x) + (z - v.z) * (z - v.z)) < v.r)) continue;
      if (big.some((o) => Math.sqrt((o.x - x) * (o.x - x) + (o.z - z) * (o.z - z)) < o.r + 1.5)) continue;
      m[j * NNX + i] = z < DINO_ICE_LINE - 6 ? 2 : z > DINO_ICE_LINE + 12 ? 1 : 0;
      // (the land bridge itself is the Ice Age herds' pasture)
      if (z >= DINO_ICE_LINE - 6 && z <= DINO_ICE_LINE + 12) m[j * NNX + i] = 2;
    }
  return m;
})();
/** how many cells each walkable cell is from the nearest unwalkable one (the coast, the valley's
 *  fence, a cliff, the lava...), capped: big herds keep well clear of edges */
const NAV_CLEAR: Uint8Array = (() => {
  const c = new Uint8Array(NNX * NNZ).fill(255);
  const q: number[] = [];
  for (let k = 0; k < c.length; k++)
    if (!NAV_REALM[k]) {
      c[k] = 0;
      q.push(k);
    }
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    const i = k % NNX;
    const j = (k - i) / NNX;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= NNX || nj >= NNZ) continue;
      const n = nj * NNX + ni;
      if (c[n] > c[k] + 1) {
        c[n] = c[k] + 1;
        q.push(n);
      }
    }
  }
  return c;
})();
/** how much clearance (cells) a herd of formation radius R wants */
const clearClass = (R: number) => (R > 15 ? 4 : R > 9 ? 3 : 2);
/** distance (m, x10) along walkable cells to each zone, for each clearance class (lazily built) */
const NAV_FIELDS: (Uint16Array | null)[] = Array.from({ length: DINO_ZONES.length * 5 }, () => null);
const NAV_INF = 65535;
function navField(zi: number, cls = 2): Uint16Array {
  // (the lookup on its own: the builder's closures would make V8 allocate a context on every call)
  return NAV_FIELDS[zi * 5 + cls] ?? buildNavField(zi, cls);
}
function buildNavField(zi: number, cls: number): Uint16Array {
  const Zn = DINO_ZONES[zi];
  const realm = Zn.realm === "ice" ? 2 : 1;
  const f = new Uint16Array(NNX * NNZ).fill(NAV_INF);
  // (a simple Dijkstra over the 8-neighbour grid with a binary heap)
  const heap: number[] = [];
  const push = (c: number, d: number) => {
    f[c] = d;
    heap.push(c);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (f[heap[p]] <= f[heap[i]]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
        if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  for (let j = 0; j < NNZ; j++)
    for (let i = 0; i < NNX; i++) {
      const c = j * NNX + i;
      if (NAV_REALM[c] === realm && hyp(navX(i) - Zn.x, navZ(j) - Zn.z) < Math.max(NAV * 0.8, Zn.r)) push(c, 0);
    }
  // (a zone too small to cover a cell centre: seed its nearest cell)
  if (!heap.length) {
    const c = navCell(Zn.x, Zn.z);
    if (c >= 0) push(c, 0);
  }
  const done = new Uint8Array(NNX * NNZ);
  while (heap.length) {
    const c = pop();
    if (done[c]) continue;
    done[c] = 1;
    const i = c % NNX;
    const j = (c - i) / NNX;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= NNX || nj >= NNZ) continue;
        const n = nj * NNX + ni;
        if (NAV_REALM[n] !== realm || done[n]) continue;
        // (no cutting a corner past a blocked cell)
        if (di && dj && (NAV_REALM[j * NNX + ni] !== realm || NAV_REALM[nj * NNX + i] !== realm)) continue;
        // (cells too near an edge for this herd cost extra: it keeps out in the open where it can)
        const tight = Math.max(0, cls - NAV_CLEAR[n]) * 140;
        const d = Math.min(NAV_INF - 1, f[c] + (di && dj ? 85 : 60) + tight);
        if (d < f[n]) push(n, d);
      }
  }
  NAV_FIELDS[zi * 5 + cls] = f;
  return f;
}
/** is (x, z) on the herds' walkable grid for this realm */
export function herdWalkable(x: number, z: number, realm: "dino" | "ice"): boolean {
  DQ[0] = x;
  DQ[1] = z;
  return herdWalkableQ(realm);
}
/** herdWalkable on DQ[0], DQ[1] (allocation-free) */
function herdWalkableQ(realm: "dino" | "ice"): boolean {
  const i = Math.floor((DQ[0] - X0 - DINO_GX0) / NAV);
  const j = Math.floor((DQ[1] - Z0 - DINO_GZ0) / NAV);
  if (i < 0 || j < 0 || i >= NNX || j >= NNZ) return false;
  return NAV_REALM[j * NNX + i] === (realm === "ice" ? 2 : 1);
}
/** the herds' grid, for tests: cell centres and realms */
export const DINO_NAV = { cell: NAV, nx: NNX, nz: NNZ, realm: NAV_REALM, x: navX, z: navZ };

/** the T-rex's valley: hips must keep its whole body (nose to tail) on the floor */
const G = DINO_GORGE;
const T_FLOOR_E = 0.92;
/** the Rex Bridge's line (world z) and its x span */
const REX_BRIDGE = (() => {
  const a = DINO_DECKS.find((d) => d.id === "rexbridge-a")!;
  const b = DINO_DECKS.find((d) => d.id === "rexbridge-b")!;
  return { z: a.az, x0: Math.min(a.ax, b.bx), x1: Math.max(a.ax, b.bx), y: Math.max(a.yb, b.ya) };
})();

/** the plesiosaur's lap of the island and the pteranodons' fishing spots: out past the reef */
const SEA_LOOP = dinoOutline(26, 140);
const SEA_LOOP_S: Float32Array = (() => {
  const s = new Float32Array(SEA_LOOP.length + 1);
  for (let i = 1; i <= SEA_LOOP.length; i++) s[i] = s[i - 1] + Math.sqrt((SEA_LOOP[i % SEA_LOOP.length].x - SEA_LOOP[i - 1].x) * (SEA_LOOP[i % SEA_LOOP.length].x - SEA_LOOP[i - 1].x) + (SEA_LOOP[i % SEA_LOOP.length].z - SEA_LOOP[i - 1].z) * (SEA_LOOP[i % SEA_LOOP.length].z - SEA_LOOP[i - 1].z));
  return s;
})();
const SEA_LOOP_L = SEA_LOOP_S[SEA_LOOP.length];
/** (the arc length is out.s: no double arguments) */
function seaLoopAt(out: { s: number; x: number; z: number; dx: number; dz: number }) {
  let u = out.s % SEA_LOOP_L;
  if (u < 0) u += SEA_LOOP_L;
  let lo = 0;
  let hi = SEA_LOOP.length;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (SEA_LOOP_S[m] <= u) lo = m;
    else hi = m;
  }
  const a = SEA_LOOP[lo];
  const b = SEA_LOOP[(lo + 1) % SEA_LOOP.length];
  const k = (u - SEA_LOOP_S[lo]) / Math.max(1e-6, SEA_LOOP_S[lo + 1] - SEA_LOOP_S[lo]);
  out.x = a.x + (b.x - a.x) * k;
  out.z = a.z + (b.z - a.z) * k;
  const L = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)) || 1;
  out.dx = (b.x - a.x) / L;
  out.dz = (b.z - a.z) / L;
  return out;
}
const _sl = { s: 0.5, x: 0.5, z: 0.5, dx: 0.5, dz: 0.5 };
/** the pteranodons' soaring circles: over the volcano, Rex Ridge, the falls, the Ice Age peaks, the plains */
const SOAR: [number, number, number, number, number][] = [
  [DINO_VOLCANO.x, DINO_VOLCANO.z, 34, 70, 0.3],
  [DINO_VOLCANO.x, DINO_VOLCANO.z, 52, 84, -0.22],
  [G.x, G.z, 44, 52, 0.2],
  [X0 - 62, Z0 - 36, 30, 44, -0.28],
  [X0 - 10, Z0 - 236, 40, 62, 0.22],
  [X0 + 20, Z0 - 60, 70, 56, -0.15],
  [G.x, G.z + 10, 30, 40, -0.3],
];

const zoneIx = (id: string) => {
  const i = DINO_ZONES.findIndex((q) => q.id === id);
  if (i < 0) throw new Error(`dino: unknown zone ${id}`);
  return i;
};

/** the daily round: 0 dawn (drink), 1 day (graze), 2 dusk (drink), 3 night (sleep) */
export function dayPhase(hour: number): number {
  if (hour >= 5 && hour < 8) return 0;
  if (hour >= 8 && hour < 17) return 1;
  if (hour >= 17 && hour < 20.5) return 2;
  return 3;
}

/** a spot to stand in a zone (on walkable ground) */
function zoneSpot(h: Herd, zi: number) {
  const Zn: DinoZone = DINO_ZONES[zi];
  for (let k = 0; k < 14; k++) {
    const a = rnd(h) * TAU;
    const r = Math.sqrt(rnd(h)) * Zn.r * 0.6;
    const x = Zn.x + Math.sin(a) * r;
    const z = Zn.z + Math.cos(a) * r;
    if (isY(okGround(x, z, false))) {
      h.tx = x;
      h.tz = z;
      return;
    }
  }
  h.tx = Zn.x;
  h.tz = Zn.z;
}

/** the formation: the lead in front, grown-ups round the outside, young in the middle */
function layOut(h: Herd) {
  const M = h.members;
  const adults = M.filter((a) => !a.baby);
  const young = M.filter((a) => a.baby);
  if (!M.length) return;
  const d = adults[0]?.def ?? M[0].def;
  const len = (d.body[0] + d.body[1]) * (adults[0]?.scale ?? M[0].scale);
  const wid = d.body[2] * 2 * (adults[0]?.scale ?? M[0].scale);
  // (big enough that the grown-ups stand side by side round it, nose to tail along the way)
  const R = Math.max(len * (d.giant ? 0.42 : 0.5), (adults.length * (wid + 3.2)) / TAU + wid, 3);
  h.R = R;
  adults.forEach((a, i) => {
    if (i === 0) {
      a.rank = 0;
      a.ox = 0;
      a.oz = R * 1.15;
      return;
    }
    a.rank = 1;
    const n = adults.length - 1;
    const ang = Math.PI * 0.34 + ((i - 1 + 0.5) / n) * (TAU - Math.PI * 0.68);
    a.ox = Math.sin(ang) * R;
    a.oz = Math.cos(ang) * R * 1.25;
  });
  young.forEach((a, i) => {
    a.rank = 2;
    const ang = (i / Math.max(1, young.length)) * TAU + 0.6;
    a.ox = Math.sin(ang) * R * 0.32;
    a.oz = Math.cos(ang) * R * 0.32 - R * 0.1;
    // (mum: the nearest grown-up's place)
    let best: Animal | null = null;
    let bd = Infinity;
    for (const m of adults) {
      const dd = ((m.ox - a.ox) * (m.ox - a.ox)) + ((m.oz - a.oz) * (m.oz - a.oz));
      if (dd < bd) {
        bd = dd;
        best = m;
      }
    }
    a.mother = best;
  });
}

export function makeSim(low: boolean): DinoSim {
  const animals: Animal[] = [];
  const herds: Herd[] = [];
  const perMesh = new Map<MeshId, number>();
  const rng = dinoRng(2024);
  let trex: Animal | null = null;
  for (const plan of HERD_PLANS) {
    const def = SPECIES_OF.get(plan.species)!;
    const n = plan.n[low ? 1 : 0];
    const nb = plan.young ? plan.young[low ? 1 : 0] : 0;
    if (n + nb === 0) continue;
    const z0 = plan.day.length ? zoneIx(plan.day[0]) : -1;
    const Zn = z0 >= 0 ? DINO_ZONES[z0] : null;
    const herd: Herd = {
      plan,
      realm: Zn?.realm ?? "dino",
      cx: Zn?.x ?? X0,
      cz: Zn?.z ?? Z0,
      hx: 0,
      hz: 1,
      zone: z0,
      tx: Zn?.x ?? X0,
      tz: Zn?.z ?? Z0,
      phase: -1,
      next: Math.floor(rng() * Math.max(1, plan.day.length)),
      dwell: 10 + rng() * 40,
      moving: false,
      flee: 0,
      fx: 0,
      fz: 0,
      R: 4,
      F: 6,
      timer: 2 + rng() * 6,
      s: Math.floor(rng() * 1e9) + 1,
      members: [],
      hunt: 0,
      wary: false,
      prey: null,
      huntT: 20 + rng() * 30,
      spd: 0.5,
    };
    herds.push(herd);
    for (let k = 0; k < n + nb; k++) {
      const baby = k >= n ? 1 : 0;
      const slot = perMesh.get(def.mesh) ?? 0;
      perMesh.set(def.mesh, slot + 1);
      const a0 = (k / Math.max(1, n + nb)) * TAU + rng() * 0.5;
      const a: Animal = {
        def,
        slot,
        baby,
        scale: (def.scale[0] + rng() * (def.scale[1] - def.scale[0])) * (baby ? (def.id === "trike" ? (plan.id === "nests" ? 0.27 : 0.42) : def.id === "mammoth" ? 0.48 : def.id === "brachio" ? 0.4 : 0.55) : 1),
        coat: Math.floor(rng() * def.coats.length),
        x: herd.cx,
        z: herd.cz,
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
        ox: 0,
        oz: 0,
        jx: 0,
        jz: 0,
        rank: 1,
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
        cax: 0,
        caz: 0,
        cbx: 0,
        cbz: 0,
        cr: 0,
        reach: 0,
        stuck: 0,
        wary: false,
        best: Infinity,
        bestT: 0,
        nx: 0.5,
        nz: 0.5,
        nyaw: 0.5,
        oax: 0.5,
        oaz: 0.5,
        obx: 0.5,
        obz: 0.5,
        dyaw: 0.5,
        out: 0.5,
        mvW: 0.5,
        mvX: 0.5,
        mvZ: 0.5,
        dK: 0.5,
        syaw: NaN,
        sny: 0.5,
        csy: 0.5,
      };
      herd.members.push(a);
      if (def.id === "ptero") {
        const L = SOAR[k % SOAR.length];
        a.fcx = L[0];
        a.fcz = L[1];
        a.fr = L[2];
        a.fh = L[3];
        a.fw = L[4];
        a.fa = rng() * TAU;
        a.timer = 20 + rng() * 50;
      }
      if (def.id === "plesio") {
        a.fa = rng() * SEA_LOOP_L;
        a.fw = 3.2;
      }
      if (def.id === "trex") {
        trex = a;
        a.x = G.x;
        a.z = G.z - G.rz * 0.3;
        a.tx = a.x;
        a.tz = a.z;
        a.yaw = 0;
      }
      animals.push(a);
    }
    if (plan.home || !plan.day.length) {
      // (home herds: loose offsets round the centre, like the old ranges)
      herd.members.forEach((a, k) => {
        const spread = Math.min(Zn ? Zn.r * 0.7 : 4, a.def.size * a.scale * 2.2 + 1.5);
        const ang = (k / herd.members.length) * TAU + rng() * 0.5;
        a.ox = Math.sin(ang) * spread;
        a.oz = Math.cos(ang) * spread;
      });
      herd.R = Zn ? Zn.r * 0.7 : 4;
    } else layOut(herd);
    {
      const m = herd.members[0];
      herd.F = herd.R * (herd.plan.home ? 1 : 1.35) + (m.def.body[0] + m.def.body[1]) * m.scale * 0.5;
    }
    // place them in formation (spread out a little: grazing), on dry ground, their whole bodies clear of the trees
    const clearBody = (a: Animal) => {
      capsule(a);
      for (let u = 0; u <= 1; u += 0.25) if (!pointClear(a.cax + (a.cbx - a.cax) * u, a.caz + (a.cbz - a.caz) * u, a.cr + 0.3, false)) return false;
      // (and clear of everyone placed so far, with a wide berth between raptors and their prey)
      for (const b of animals) {
        if (b === a || b.def.air || b.mode === 1) continue;
        const wary = (a.def.raptor && b.def.prey) || (b.def.raptor && a.def.prey);
        if (bodyGap(a, b) < (wary ? RAPTOR_GAP + 4 : 1)) return false;
      }
      return true;
    };
    for (const a of herd.members) {
      if (def.air || def.id === "trex") continue;
      const sx = herd.cx + a.ox * 1.2;
      const sz = herd.cz + a.oz * 1.2;
      a.x = sx;
      a.z = sz;
      // (the nearest clear spot to its place: rings out from it — then towards the middle)
      let ok = clearBody(a);
      for (let t = 0; t < 160 && !ok; t++) {
        const ang = rng() * TAU;
        const rr = 1 + (t % 80) * 0.4;
        const cx = t < 80 ? sx : herd.cx;
        const cz = t < 80 ? sz : herd.cz;
        a.x = cx + Math.sin(ang) * rr;
        a.z = cz + Math.cos(ang) * rr;
        a.yaw = rng() * TAU;
        ok = clearBody(a);
      }
      if (!ok) {
        a.x = herd.cx;
        a.z = herd.cz;
      }
      a.fr = 1;
    }
    // the nest babies: some still hatching in their eggs, the rest playing round the nests
    if (plan.id === "nests") {
      const hatching = HATCHLINGS[low ? 1 : 0];
      herd.members.forEach((a, k) => {
        if (k < hatching) {
          const h = HATCH[k % HATCH.length];
          a.mode = 1;
          a.x = h.x;
          a.z = h.z;
          a.fcx = h.x;
          a.fcz = h.z;
          a.fh = h.y;
          a.scale = 0.28 * trueK("trike");
          a.yaw = rng() * TAU;
        }
      });
    }
  }
  // settle everyone on the ground
  for (const a of animals) {
    const y = dinoLandY(a.x, a.z);
    a.y = y ?? 2.6;
    capsule(a);
  }
  // (every herd's way-finding fields, built now rather than on the step a herd first needs one: the
  //  steps themselves allocate nothing)
  // (every zone on its side of the bridge: a herd can be sent anywhere — away from the raptors, say)
  for (const h of herds) {
    if (!h.members.length) continue;
    const cls = clearClass(h.R);
    for (let zi = 0; zi < DINO_ZONES.length; zi++) if (DINO_ZONES[zi].realm === h.realm) navField(zi, cls);
  }
  const byZ = new Int32Array(animals.length);
  for (let i = 0; i < animals.length; i++) byZ[i] = i;
  return { animals, herds, trex: trex!, roared: false, napping: false, roarCool: 12, showCool: 0, clock: 0, frame: 0, byZ, zKey: new Float32Array(animals.length), maxReach: 0, raptors: animals.filter((a) => a.def.raptor), prey: animals.filter((a) => a.def.prey) };
}

// ── one step ──

const kid = { x: 0, z: 0, y: 0, near: false, onBridge: false };

/**
 * Advance the island's animals by dt. `kx/kz` = where the kid is (world), `kidNear` = the kid is on
 * or close to the island (else nobody reacts), `ky` = the kid's height (for the T-rex's safety
 * margins). Allocation-free.
 */
/**
 * The step's time steps, boxed ONCE a step: V8 allocates a fresh heap number every time a computed
 * double is passed to a call it doesn't inline, but a value loaded from a field that holds heap
 * objects (these start as null) is passed on as it is.
 */
const DTB = { d1: null as unknown as number, d2: null as unknown as number, d4: null as unknown as number };
export function stepSim(sim: DinoSim, dtIn: number, t: number, hour: number, kx: number, kz: number, kidNear: boolean, ky = 3): void {
  const dt = Math.min(0.1, Math.max(0, dtIn));
  // (re-boxed only when the frame time changes)
  if (DTB.d1 !== dt) {
    DTB.d1 = dt;
    DTB.d2 = Math.min(0.2, dt * 2);
    DTB.d4 = Math.min(0.3, dt * 4);
  }
  sim.clock += dt;
  kid.x = kx;
  kid.z = kz;
  kid.y = ky;
  kid.near = kidNear;
  kid.onBridge = kidNear && Math.abs(kz - REX_BRIDGE.z) < 3 && kx > REX_BRIDGE.x0 - 2 && kx < REX_BRIDGE.x1 + 2;
  sim.roared = false;
  sim.napping = false;
  sim.roarCool -= dt;
  sim.showCool -= dt;
  const phase = dayPhase(hour);
  for (let hi = 0; hi < sim.herds.length; hi++) stepHerd(sim, sim.herds[hi], DTB.d1, phase);
  const A = sim.animals;
  for (let i = 0; i < A.length; i++) capsule(A[i]);
  // (re-sort by z: an insertion sort, nearly sorted already)
  {
    const Z = sim.byZ;
    let mr = 0;
    for (let i = 0; i < A.length; i++) mr = Math.max(mr, A[i].reach);
    sim.maxReach = mr;
    for (let i = 1; i < Z.length; i++) {
      const v = Z[i];
      const kv = (A[v].caz + A[v].cbz) * 0.5;
      let j = i - 1;
      while (j >= 0 && (A[Z[j]].caz + A[Z[j]].cbz) * 0.5 > kv) {
        Z[j + 1] = Z[j];
        j--;
      }
      Z[j + 1] = v;
    }
    for (let i = 0; i < Z.length; i++) sim.zKey[i] = (A[Z[i]].caz + A[Z[i]].cbz) * 0.5;
  }
  const night = phase === 3;
  sim.frame++;
  SIM_RAPTORS = sim.raptors;
  SIM_ALL = A;
  SIM_PREY = sim.prey;
  // (who has to mind the raptors this step: every raptor, and each prey animal near a pack)
  for (let i = 0; i < A.length; i++) {
    const a = A[i];
    a.wary = false;
    if (a.def.raptor) a.wary = true;
    else if (a.def.prey)
      for (let k = 0; k < sim.herds.length; k++) {
        const r = sim.herds[k];
        if (r.plan.species !== "raptor" || !r.members.length) continue;
        const lim = r.F + a.reach + 30;
        if (((r.cx - a.x) * (r.cx - a.x)) + ((r.cz - a.z) * (r.cz - a.z)) < lim * lim) a.wary = true;
      }
  }
  for (let i = 0; i < sim.herds.length; i++) sim.herds[i].wary = false;
  for (let i = 0; i < sim.herds.length; i++) {
    const r = sim.herds[i];
    if (r.plan.species !== "raptor" || !r.members.length) continue;
    for (let j = 0; j < sim.herds.length; j++) {
      const o = sim.herds[j];
      if (!PREY.has(o.plan.species) || !o.members.length) continue;
      const lim = r.R + o.R + 60;
      if (((r.cx - o.cx) * (r.cx - o.cx)) + ((r.cz - o.cz) * (r.cz - o.cz)) < lim * lim) {
        o.wary = true;
        r.wary = true;
      }
    }
  }
  for (let i = 0; i < A.length; i++) {
    const a = A[i];
    const id = a.def.id;
    if (id === "ptero") stepFlyer(a, DTB.d1, t);
    else if (id === "plesio") stepSwimmer(a, DTB.d1, t);
    else if (id === "trex") stepTrex(sim, a, DTB.d1, t, hour);
    else if (a.mode === 1) stepHatchling(a, DTB.d1, t);
    else {
      // (the further from the kid, the coarser the steps: every frame close by (28 m), every 2nd out
      // to 88 m, every 4th beyond — a step every 2 frames moves a walking animal a few centimetres,
      // nobody that far off notices; the quick ones — raptors, compys — never skip more than one:
      // they'd skip through things)
      // (no ** and no Infinity here: mixed with a computed double they make V8 box it, every animal, every step)
      const d2 = kid.near ? ((kid.x - a.x) * (kid.x - a.x)) + ((kid.z - a.z) * (kid.z - a.z)) : 1e30;
      const quick = id === "raptor" || id === "compy";
      const every = d2 < 45 * 45 ? 1 : d2 < 140 * 140 || quick ? 2 : 4;
      if (every > 1 && (sim.frame + i) % every) continue;
      // (dt, or min(0.2, 2 dt), or min(0.3, 4 dt))
      stepWalker(sim, a, every === 1 ? DTB.d1 : every === 2 ? DTB.d2 : DTB.d4, t, night, phase);
    }
  }
  relaxPairs(sim);
}

/** can relaxPairs ease this animal to (x, z): its own ground, never a raptor nearer its prey */
function relaxOk(a: Animal): boolean {
  if (a.def.raptor) return false;
  const x = a.nx;
  const z = a.nz;
  if (!inRealm(a, z)) return false;
  DQ[0] = x;
  DQ[1] = z;
  if (!okGroundQ(!!a.def.wade)) return false;
  dinoGorgeEQ();
  if (DQ[2] <= DINO_FENCE_E + 0.05) return false;
  if (a.wary && a.def.prey && !keepsApart(a)) return false;
  // (never eased into a trunk, a rock or a post)
  gatherObs(a);
  keepBody(a);
  return bodyClearAt(a);
}

/** a last pass each step: any two bodies still overlapping are eased apart (the bigger one moves
 *  less), so herds crossing paths never end up inside each other */
function relaxPairs(sim: DinoSim) {
  const A = sim.animals;
  const Z = sim.byZ;
  for (let ii = 0; ii < Z.length; ii++) {
    const a = A[Z[ii]];
    if (a.def.air || a.mode === 1 || a.def.id === "trex") continue;
    const za = (a.caz + a.cbz) * 0.5;
    for (let jj = ii + 1; jj < Z.length; jj++) {
      const b = A[Z[jj]];
      if ((b.caz + b.cbz) * 0.5 - za > a.reach + b.reach) break;
      if (b.def.air || b.mode === 1 || b.def.id === "trex") continue;
      if (a.mother === b || b.mother === a) continue;
      const mx = (a.cax + a.cbx - b.cax - b.cbx) * 0.5;
      const mz = (a.caz + a.cbz - b.caz - b.cbz) * 0.5;
      const lim = a.reach + b.reach;
      if (mx * mx + mz * mz > lim * lim) continue;
      segAB(a, b);
      const g = _cp.d - a.cr - b.cr;
      if (g > -0.05) continue;
      let nx = _cp.ax - _cp.bx;
      let nz = _cp.az - _cp.bz;
      let nl = Math.sqrt(nx * nx + nz * nz);
      if (nl < 1e-4) {
        nx = a.x - b.x;
        nz = a.z - b.z;
        nl = Math.sqrt(nx * nx + nz * nz) || 1;
      }
      nx /= nl;
      nz /= nl;
      const ma = a.cr * a.cr * a.reach;
      const mb = b.cr * b.cr * b.reach;
      const push = Math.min(-g + 0.05, 0.8);
      const ka = mb / (ma + mb);
      a.nx = a.x + nx * push * ka;
      a.nz = a.z + nz * push * ka;
      if (relaxOk(a)) {
        a.x = a.nx;
        a.z = a.nz;
        groundY(a);
        capsule(a);
      }
      b.nx = b.x - nx * push * (1 - ka);
      b.nz = b.z - nz * push * (1 - ka);
      if (relaxOk(b)) {
        b.x = b.nx;
        b.z = b.nz;
        groundY(b);
        capsule(b);
      }
    }
  }
}

/** the animal's body capsule this step (world): its tail end, its nose end, its half-width */
function capsule(a: Animal) {
  const b = a.def.body;
  const s = a.scale;
  const r = b[2] * s;
  // (the heading's sine and cosine, kept until it turns)
  if (a.yaw !== a.syaw) {
    a.syaw = a.yaw;
    a.sny = Math.sin(a.yaw);
    a.csy = Math.cos(a.yaw);
  }
  const fx = a.sny;
  const fz = a.csy;
  const f = Math.max(0, b[0] * s - r);
  const k = Math.max(0, b[1] * s - r);
  a.cbx = a.x + fx * f;
  a.cbz = a.z + fz * f;
  a.cax = a.x - fx * k;
  a.caz = a.z - fz * k;
  a.cr = r;
  a.reach = (f + k) * 0.5 + r;
}

// ── the herds' daily round ──

function stepHerd(sim: DinoSim, h: Herd, dt: number, phase: number) {
  const P = h.plan;
  if (!h.members.length || P.species === "trex" || P.species === "ptero" || P.species === "plesio") return;
  if (P.home) {
    // wander about the home zone: a new spot now and then
    h.timer -= dt;
    if (h.timer <= 0 || ((h.cx - h.tx) * (h.cx - h.tx)) + ((h.cz - h.tz) * (h.cz - h.tz)) < 1) {
      const fast = P.species === "compy";
      zoneSpot(h, h.zone);
      if (fast) {
        // (compys dart about: quick dashes to spots round their patch)
        const Zn = DINO_ZONES[h.zone];
        const a = rnd(h) * TAU;
        const r = Zn.r + rnd(h) * 14;
        const x = Zn.x + Math.sin(a) * r;
        const z = Zn.z + Math.cos(a) * r;
        if (isY(okGround(x, z, false)) && herdWalkable(x, z, "dino")) {
          h.tx = x;
          h.tz = z;
        }
      }
      h.timer = fast ? 3 + rnd(h) * 4 : 20 + rnd(h) * 25;
    }
    const d = Math.sqrt((h.tx - h.cx) * (h.tx - h.cx) + (h.tz - h.cz) * (h.tz - h.cz));
    if (d > 0.01) {
      const sp = Math.min(d, (P.species === "compy" ? 4.5 : phase === 3 ? 0.12 : 0.35) * dt);
      h.cx += ((h.tx - h.cx) / d) * sp;
      h.cz += ((h.tz - h.cz) / d) * sp;
      h.hx = (h.tx - h.cx) / d;
      h.hz = (h.tz - h.cz) / d;
    }
    h.moving = d > 1.5 && P.species === "compy";
    return;
  }
  // the raptors' hunt (stalking and chasing move the pack themselves)
  if (P.species === "raptor") {
    stepHunt(sim, h, dt, phase);
    if (h.hunt === 1 || h.hunt === 2) return;
  }
  // where to go: the phase's place (water at dawn and dusk, the pastures in turn by day, the woods at night)
  h.dwell -= dt;
  if (h.flee <= 0 && h.hunt !== 2) {
    let want = -1;
    if (phase !== h.phase) {
      h.phase = phase;
      if ((phase === 0 || phase === 2) && P.water?.length) want = zoneIx(P.water[Math.floor(rnd(h) * P.water.length)]);
      else if (phase === 3 && P.rest?.length) want = zoneIx(P.rest[0]);
      else want = freePasture(sim, h);
      h.dwell = 30 + rnd(h) * 40;
    } else if (phase === 1 && !h.moving && h.dwell <= 0) {
      // (grazed this patch: on to the next pasture — one no other herd is on)
      h.next++;
      want = freePasture(sim, h);
      h.dwell = 35 + rnd(h) * 55;
    }
    if (want >= 0 && want !== h.zone) {
      h.zone = want;
      zoneSpot(h, want);
      h.moving = true;
    }
  }
  // stragglers: the herd slows down for them (on average: one stuck behind a tree doesn't stop it)
  let lag = 0;
  for (let k = 0; k < h.members.length; k++) {
    const a = h.members[k];
    lag += hyp(a.x - (h.cx + rotX(h, a.ox, a.oz) * a.fr), a.z - (h.cz + rotZ(h, a.ox, a.oz) * a.fr));
  }
  lag /= h.members.length;
  const travel = (P.travel ?? 1.2) * (lag > h.R * 2 ? 0.45 : lag > h.R * 1.2 ? 0.75 : 1);
  if (h.flee > 0) {
    // stampede! away from the danger, over walkable ground
    h.flee -= dt;
    h.spd = travel * 2.4;
    moveHerdAway(h, dt);
    h.moving = true;
    if (h.flee <= 0) {
      h.moving = true;
      zoneSpot(h, h.zone);
    }
    return;
  }
  if (!h.moving) {
    // (settled: shuffle aside if another herd crowds in)
    if (herdRepel(sim, h)) {
      const nx = h.cx + _rep.x * 0.6 * dt;
      const nz = h.cz + _rep.z * 0.6 * dt;
      DQ[0] = nx;
      DQ[1] = nz;
      if (herdWalkableQ(h.realm) && NAV_CLEAR[Math.floor((nz - Z0 - DINO_GZ0) / NAV) * NNX + Math.floor((nx - X0 - DINO_GX0) / NAV)] >= clearClass(h.R) - 1) {
        h.cx = nx;
        h.cz = nz;
      }
    }
    return;
  }
  h.spd = travel;
  moveHerdTo(sim, h, dt);
}

/** the herd's next pasture in its round that no other herd is grazing (or heading for) */
function freePasture(sim: DinoSim, h: Herd): number {
  const D = h.plan.day;
  for (let k = 0; k < D.length; k++) {
    const z = zoneIx(D[(h.next + k) % D.length]);
    let taken = false;
    for (let j = 0; j < sim.herds.length && !taken; j++) {
      const o = sim.herds[j];
      if (o !== h && o.members.length && !o.plan.home && o.realm === h.realm && o.zone === z) taken = true;
    }
    if (!taken) {
      h.next += k;
      return z;
    }
  }
  return zoneIx(D[h.next % D.length]);
}

/** herds keep their distance from each other (and prey from the raptors, and the raptors from prey when not hunting) */
const _rep = { x: 0, z: 0 };
function herdRepel(sim: DinoSim, h: Herd): boolean {
  _rep.x = 0;
  _rep.z = 0;
  let any = false;
  for (let k = 0; k < sim.herds.length; k++) {
    const o = sim.herds[k];
    if (o === h || !o.members.length || o.realm !== h.realm) continue;
    const sp = o.plan.species;
    if (sp === "trex" || sp === "ptero" || sp === "plesio" || o.plan.id === "nests") continue;
    const wary = (h.plan.species === "raptor" && PREY.has(sp) && h.hunt !== 1 && h.hunt !== 2) || (sp === "raptor" && PREY.has(h.plan.species));
    // (at a shared waterhole they mix — like at a real one)
    const water = o.zone === h.zone && h.zone >= 0 && DINO_ZONES[h.zone].kind === "water";
    const want = water && !wary ? (h.F + o.F) * 0.55 : h.F + o.F + (wary ? 24 : 3);
    const dx = h.cx - o.cx;
    const dz = h.cz - o.cz;
    const d2 = dx * dx + dz * dz;
    if (d2 > want * want) continue;
    const d = Math.sqrt(d2) || 0.01;
    const k2 = (want - d) / want;
    _rep.x += (dx / d) * k2 * 2;
    _rep.z += (dz / d) * k2 * 2;
    any = true;
  }
  return any;
}
const rotX = (h: Herd, ox: number, oz: number) => ox * h.hz + oz * h.hx;
const rotZ = (h: Herd, ox: number, oz: number) => -ox * h.hx + oz * h.hz;

/** a straggler's next waypoint (the next cell downhill on its herd's field), or false when it's in the zone already */
const _nav = { x: 0.5, z: 0.5 };
/** (from out.x, out.z: no double arguments; the waypoint comes back in out) */
function navStep(h: Herd, out: { x: number; z: number }): boolean {
  const x = out.x;
  const z = out.z;
  const f = navField(h.zone, clearClass(h.R));
  const c = navCell(x, z);
  if (c < 0 || f[c] === 0) return false;
  const i = c % NNX;
  const j = (c - i) / NNX;
  // (the herd itself: head for it once it's the nearer way)
  let best = f[c] === NAV_INF ? NAV_INF : f[c];
  let bi = -1;
  let bj = -1;
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= NNX || nj >= NNZ) continue;
      const v = f[nj * NNX + ni];
      if (v < best) {
        best = v;
        bi = ni;
        bj = nj;
      }
    }
  if (bi < 0) return false;
  out.x = navX(bi);
  out.z = navZ(bj);
  return true;
}

/** one step along the navigation grid towards the herd's zone (then straight to its spot) */
/** (at speed h.spd) */
function moveHerdTo(sim: DinoSim, h: Herd, dt: number) {
  let speed = h.spd;
  const f = navField(h.zone, clearClass(h.R));
  const c = navCell(h.cx, h.cz);
  let wx = h.tx - h.cx;
  let wz = h.tz - h.cz;
  if (c >= 0 && f[c] > 0 && f[c] !== NAV_INF) {
    // (downhill on the field: the neighbour nearest the zone)
    const i = c % NNX;
    const j = (c - i) / NNX;
    let best = f[c];
    let bi = -1;
    let bj = -1;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= NNX || nj >= NNZ) continue;
        const v = f[nj * NNX + ni];
        if (v < best) {
          best = v;
          bi = ni;
          bj = nj;
        }
      }
    if (bi >= 0) {
      wx = navX(bi) - h.cx;
      wz = navZ(bj) - h.cz;
    }
  } else if (c >= 0 && f[c] === NAV_INF) {
    // (off the grid somehow: head for the zone directly)
    const Zn = DINO_ZONES[h.zone];
    wx = Zn.x - h.cx;
    wz = Zn.z - h.cz;
  }
  const d = Math.sqrt((h.tx - h.cx) * (h.tx - h.cx) + (h.tz - h.cz) * (h.tz - h.cz));
  if (d < 2.5) {
    h.moving = false;
    return;
  }
  let wl = Math.sqrt(wx * wx + wz * wz) || 1;
  // (round any herd in the way: sidestep it — never pushed back the way it came)
  if (herdRepel(sim, h)) {
    const ux = wx / wl;
    const uz = wz / wl;
    const along = _rep.x * ux + _rep.z * uz;
    const lx = _rep.x - along * ux;
    const lz = _rep.z - along * uz;
    const near = Math.min(1, Math.max(0.25, d / 30));
    wx = ux + lx * near;
    wz = uz + lz * near;
    wl = Math.sqrt(wx * wx + wz * wz) || 1;
    if (along < 0) speed *= Math.min(1, Math.max(0.4, 1 + along * 0.4));
  }
  // (turn the herd gradually: it swings round, it doesn't spin)
  const k = Math.min(1, dt * 0.6);
  h.hx += (wx / wl - h.hx) * k;
  h.hz += (wz / wl - h.hz) * k;
  const hl = Math.sqrt(h.hx * h.hx + h.hz * h.hz) || 1;
  h.hx /= hl;
  h.hz /= hl;
  const sp = Math.min(d, speed * dt);
  const nx = h.cx + h.hx * sp;
  const nz = h.cz + h.hz * sp;
  DQ[0] = nx;
  DQ[1] = nz;
  let go = herdWalkableQ(h.realm);
  if (!go) {
    DQ[0] = h.cx;
    DQ[1] = h.cz;
    go = !herdWalkableQ(h.realm);
  }
  if (go) {
    h.cx = nx;
    h.cz = nz;
  } else {
    // (blocked: slide straight towards the next cell)
    h.cx += (wx / wl) * sp;
    h.cz += (wz / wl) * sp;
  }
}

/** one step of a stampede: the walkable neighbour cell that's furthest from the danger */
/** (away from h.fx, h.fz at speed h.spd) */
function moveHerdAway(h: Herd, dt: number) {
  const fx = h.fx;
  const fz = h.fz;
  const speed = h.spd;
  const c = navCell(h.cx, h.cz);
  let wx = h.cx - fx;
  let wz = h.cz - fz;
  if (c >= 0) {
    const i = c % NNX;
    const j = (c - i) / NNX;
    let best = -Infinity;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= NNX || nj >= NNZ) continue;
        if (NAV_REALM[nj * NNX + ni] !== (h.realm === "ice" ? 2 : 1)) continue;
        const sc = hyp(navX(ni) - fx, navZ(nj) - fz) + (di * h.hx + dj * h.hz) * 2;
        if (sc > best) {
          best = sc;
          wx = navX(ni) - h.cx;
          wz = navZ(nj) - h.cz;
        }
      }
  }
  const wl = Math.sqrt(wx * wx + wz * wz) || 1;
  const k = Math.min(1, dt * 1.5);
  h.hx += (wx / wl - h.hx) * k;
  h.hz += (wz / wl - h.hz) * k;
  const hl = Math.sqrt(h.hx * h.hx + h.hz * h.hz) || 1;
  h.hx /= hl;
  h.hz /= hl;
  const nx = h.cx + h.hx * speed * dt;
  const nz = h.cz + h.hz * speed * dt;
  DQ[0] = nx;
  DQ[1] = nz;
  if (herdWalkableQ(h.realm)) {
    h.cx = nx;
    h.cz = nz;
  }
}

/** startle a herd: it stampedes away from (x, z) for `secs` */
function startle(h: Herd, x: number, z: number, secs: number) {
  if (h.plan.home || h.plan.species === "raptor") return;
  h.flee = Math.max(h.flee, secs);
  h.fx = x;
  h.fz = z;
}

// ── the Swiftclaws' hunt (for show: they never catch anything) ──

function stepHunt(sim: DinoSim, h: Herd, dt: number, phase: number) {
  h.huntT -= dt;
  const lead = h.members[0];
  switch (h.hunt) {
    case 0: {
      // prowl the plains (the daily round does the walking); now and then pick a herd to stalk
      if (h.huntT <= 0 && phase === 1) {
        let best: Herd | null = null;
        let bd = 160;
        for (const o of sim.herds) {
          if (!PREY.has(o.plan.species) || o.realm !== "dino" || !o.members.length || o.plan.home) continue;
          const d = Math.sqrt((o.cx - h.cx) * (o.cx - h.cx) + (o.cz - h.cz) * (o.cz - h.cz));
          if (d < bd) {
            bd = d;
            best = o;
          }
        }
        if (best) {
          h.prey = best;
          h.hunt = 1;
          h.huntT = 40;
        } else h.huntT = 20;
      }
      break;
    }
    case 1: {
      // stalk: creep up to ~20 m of the herd (low and slow)
      const p = h.prey!;
      const d = Math.sqrt((p.cx - h.cx) * (p.cx - h.cx) + (p.cz - h.cz) * (p.cz - h.cz));
      let near = Infinity;
      for (const r of h.members) for (const o of p.members) near = Math.min(near, bodyGap(r, o));
      if (near > 30) {
        const want = 0;
        // (straight at it over walkable ground; slow)
        const sp = Math.min(d - want, 1.6 * dt);
        const nx = h.cx + ((p.cx - h.cx) / d) * sp;
        const nz = h.cz + ((p.cz - h.cz) / d) * sp;
        if (herdWalkable(nx, nz, "dino")) {
          h.cx = nx;
          h.cz = nz;
        }
        h.hx = (p.cx - h.cx) / d;
        h.hz = (p.cz - h.cz) / d;
        h.moving = true;
      } else {
        h.hunt = 2;
        h.huntT = 6.5;
        startle(p, h.cx, h.cz, 9);
      }
      if (h.huntT <= 0) {
        h.hunt = 0;
        h.huntT = 30;
      }
      break;
    }
    case 2: {
      // CHASE! a sprint at the stampeding herd — pulling up short of it (the whole pack does)
      const p = h.prey!;
      let near = Infinity;
      for (const r of h.members) for (const o of p.members) near = Math.min(near, bodyGap(r, o));
      const d = Math.sqrt((p.cx - h.cx) * (p.cx - h.cx) + (p.cz - h.cz) * (p.cz - h.cz)) || 1;
      if (near > RAPTOR_GAP + 8 && h.huntT > 0) {
        const sp = 7.5 * dt;
        const nx = h.cx + ((p.cx - h.cx) / d) * sp;
        const nz = h.cz + ((p.cz - h.cz) / d) * sp;
        if (herdWalkable(nx, nz, "dino")) {
          h.cx = nx;
          h.cz = nz;
        }
        h.hx = (p.cx - h.cx) / d;
        h.hz = (p.cz - h.cz) / d;
      }
      h.moving = true;
      if (h.huntT <= 0 || near < RAPTOR_GAP + 6) {
        h.hunt = 3;
        h.huntT = 25 + rnd(h) * 20;
      }
      break;
    }
    case 3: {
      // puffed out: back home for a rest and a preen, then back to prowling
      if (h.huntT > 24 && h.plan.rest?.length) {
        const home = zoneIx(h.plan.rest[0]);
        if (h.zone !== home) {
          h.zone = home;
          zoneSpot(h, home);
          h.moving = true;
        }
      }
      if (h.huntT <= 0) {
        h.hunt = 0;
        h.huntT = 50 + rnd(h) * 60;
        h.phase = -1;
        h.prey = null;
      }
      break;
    }
  }
}

/** the kid's distance (1e30 when away: not Infinity, see stepSim) */
function kidDist(a: Animal) {
  return kid.near ? Math.sqrt((kid.x - a.x) * (kid.x - a.x) + (kid.z - a.z) * (kid.z - a.z)) : 1e30;
}

function lookAtKid(a: Animal, want: { yaw: number; pitch: number }, dt: number) {
  const dK = a.dK;
  const reach = 22 + a.def.size * a.scale * 3;
  let wy = want.yaw;
  let wp = want.pitch;
  if (dK < reach) {
    const rel = ((Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw) - Math.round((Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw) / TAU) * TAU);
    if (Math.abs(rel) < 2.3) {
      const k = 1 - Math.max(0, (dK - 8) / (reach - 8));
      wy = wy + (Math.min(a.def.look, Math.max(-a.def.look, rel)) - wy) * k;
      const eye = a.def.eyeY * a.scale;
      wp = wp + (Math.min(0.5, Math.max(-0.8, Math.atan2(KID_EYE + kid.y - a.y - eye, Math.max(1, dK)) * 0.7)) - wp) * k * 0.8;
    }
  }
  a.hy = (a.hy + (wy - a.hy) * Math.min(1, dt * 3));
  a.hp = (a.hp + (wp - a.hp) * Math.min(1, dt * 2.5));
}
const _want = { yaw: 0, pitch: 0 };

/** what the special pose sets (in and out: no double arguments) */
const _pose = { u: 0.5, rear: 0.5, flap: 0.5, jaw: 0.5, ears: 0.5, sway: 0.5, lie: 0.5 };
/** a walker's special thing — browsing, honking, trumpeting, a yawn, a wave — as a pose (into _pose, _want) */
function specialPose(a: Animal, t: number) {
  const def = a.def;
  const u = _pose.u;
  switch (def.id) {
    case "brachio": {
      // browsing a treetop: neck up high, head turned to the tree, munching
      const tr = a.tree >= 0 ? TREES[a.tree] : null;
      _want.pitch = tr ? Math.min(0.32, Math.max(-0.55, Math.atan2(tr.h - def.eyeY * a.scale, BROWSE_OFF * a.scale))) : 0.32;
      if (tr) _want.yaw = Math.min(0.6, Math.max(-0.6, ((Math.atan2(tr.x - a.x, tr.z - a.z) - a.yaw) - Math.round((Math.atan2(tr.x - a.x, tr.z - a.z) - a.yaw) / TAU) * TAU)));
      _pose.jaw = 0.12 + Math.abs(Math.sin(t * 3)) * 0.12;
      break;
    }
    case "para":
      // HONK: head thrown back, bill open
      _want.pitch = 0.75;
      _pose.jaw = u < 0.8 ? 0.6 : 0;
      _pose.rear = 0.12;
      break;
    case "stego":
    case "ankylo":
      _pose.sway = 0.55;
      break;
    case "trike":
      _pose.rear = Math.max(0, Math.sin(u * Math.PI)) * 0.12;
      _want.pitch = -0.2 + Math.sin(t * 12) * 0.15;
      a.shake = 0.3;
      break;
    case "raptor":
      // a preen and a chirp: head down to its feathers, then up
      _want.pitch = u < 0.5 ? -0.6 : 0.4;
      _want.yaw = u < 0.5 ? 0.9 : 0;
      _pose.jaw = u > 0.6 ? 0.5 : 0;
      _pose.flap = 0.6;
      break;
    case "mammoth":
      // trumpeting: trunk up, a little rear
      _pose.rear = 0.18;
      _pose.flap = 1;
      _want.pitch = 0.35;
      _pose.jaw = 0.35;
      _pose.ears = 1;
      break;
    case "sloth": {
      const tr = a.tree >= 0 ? TREES[a.tree] : null;
      _pose.rear = 1.05;
      _want.pitch = 0.35;
      if (tr) _want.yaw = Math.min(0.5, Math.max(-0.5, ((Math.atan2(tr.x - a.x, tr.z - a.z) - a.yaw) - Math.round((Math.atan2(tr.x - a.x, tr.z - a.z) - a.yaw) / TAU) * TAU)));
      _pose.jaw = Math.abs(Math.sin(t * 2.5)) * 0.25;
      break;
    }
    case "elk":
      _want.pitch = 0.35;
      _pose.ears = 1;
      break;
    case "sabre":
      // a big yawn (look at those fangs!)
      _pose.jaw = Math.sin(Math.min(1, u * 1.2) * Math.PI) * 1.25;
      _want.pitch = 0.4 * Math.sin(u * Math.PI);
      _pose.lie = a.baby ? 0 : 1;
      _pose.ears = 1;
      break;
    case "bear":
      // standing up tall to wave hello
      _pose.rear = 0.95 * Math.sin(Math.min(1, u * 1.3) * Math.PI);
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
      _pose.jaw = 0.4;
      break;
  }
}

/** the Park kid's eye height (2.26 units tall) */
const KID_EYE = 1.9;
/** the kid's body radius (for pushKid) */
export const KID_R = 0.45;

function stepWalker(sim: DinoSim, a: Animal, dt: number, t: number, night: boolean, phase: number) {
  const def = a.def;
  const size = def.size * a.scale;
  const dK = kidDist(a);
  const h = a.herd;
  const P = h.plan;
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
  const curious = def.curious || (a.baby > 0 && P.id === "nests");
  // its place in the herd (rotated to the herd's heading; spread out to graze when it's settled)
  const settled = !h.moving && h.flee <= 0;
  // (its place pulls in towards the middle where it's blocked: a tree, a deck, the water)
  const spread = (P.home ? 1 : settled ? (phase === 3 ? 0.85 : 1.35) : 1) * a.fr;
  const homeX = h.cx + rotX(h, a.ox, a.oz) * spread + (settled ? a.jx * a.fr : 0);
  const homeZ = h.cz + rotZ(h, a.ox, a.oz) * spread + (settled ? a.jz * a.fr : 0);
  // (checked every few steps: it's not urgent)
  if ((sim.frame + a.slot) % 4 === 0) {
    const fl = a.def.body[0] * a.scale * 0.6;
    const bl = a.def.body[1] * a.scale * 0.6;
    const wade = !!def.wade;
    let ok = ((DQ[0] = homeX), (DQ[1] = homeZ), (HQ[0] = a.cr + 0.4), pointClearQ(wade));
    if (ok) ok = ((DQ[0] = homeX + h.hx * fl), (DQ[1] = homeZ + h.hz * fl), (HQ[0] = a.cr * 0.6), pointClearQ(wade));
    if (ok) ok = ((DQ[0] = homeX - h.hx * bl), (DQ[1] = homeZ - h.hz * bl), (HQ[0] = a.cr * 0.6), pointClearQ(wade));
    a.fr = ok ? Math.min(1, a.fr + dt * 0.2) : Math.max(0.5, a.fr - dt * 2.4);
  }
  const fleeing = h.flee > 0;
  const hunting = P.species === "raptor" && (h.hunt === 1 || h.hunt === 2);

  // the kid: curious ones come to sniff (not while the herd's on the move)
  if (curious && settled && a.state !== REST && a.state !== SNIFF && a.cool <= 0 && dK < 11 && dK > 2 + size) {
    a.state = WALK;
    a.run = 0;
    a.tx = kid.x + ((a.x - kid.x) / dK) * (1.6 + size);
    a.tz = kid.z + ((a.z - kid.z) / dK) * (1.6 + size);
    a.timer = 6;
    if (Math.sqrt((a.tx - a.x) * (a.tx - a.x) + (a.tz - a.z) * (a.tz - a.z)) < 0.6) {
      a.state = SNIFF;
      a.timer = 2.5 + rnd(a) * 2;
    }
  }
  if (a.state === REST && (dK < (def.personal || 3) + 3 + size || !settled) && def.id !== "sabre") {
    a.state = IDLE;
    a.timer = 1;
  }
  // a straggler, a long way behind (round the river, along the coast): it finds its own way back
  // over the herds' grid, then rejoins its place
  const lost = !P.home && h.zone >= 0 && Math.sqrt((homeX - a.x) * (homeX - a.x) + (homeZ - a.z) * (homeZ - a.z)) > h.F + 12;
  if (lost && ((_nav.x = a.x), (_nav.z = a.z), navStep(h, _nav))) {
    if (a.state === REST || a.state === SPECIAL || a.state === SNIFF) a.state = IDLE;
    a.tree = -1;
    a.state = WALK;
    a.tx = _nav.x;
    a.tz = _nav.z;
    speedWant = def.walk * 1.6;
    a.run = 1;
    _want.pitch = 0.05;
  } else if (!settled || hunting) {
    // on the move with the herd (or stampeding): follow its place
    if (a.state === REST || a.state === SPECIAL || a.state === SNIFF) a.state = IDLE;
    a.tree = -1;
    const d = Math.sqrt((homeX - a.x) * (homeX - a.x) + (homeZ - a.z) * (homeZ - a.z));
    a.tx = homeX + h.hx * Math.min(4, h.R * 0.3);
    a.tz = homeZ + h.hz * Math.min(4, h.R * 0.3);
    a.state = WALK;
    const herdSpeed = fleeing ? (P.travel ?? 1.2) * 2.4 : hunting && h.hunt === 2 ? 7.5 : (P.travel ?? 1.2);
    // (keep up: a brisk walk, a trot to catch up when it's fallen behind)
    const cap = fleeing || (hunting && h.hunt === 2) || d > h.R * 0.8 ? def.run : Math.max(def.walk * 1.4, herdSpeed * 1.3);
    speedWant = Math.min(cap, Math.max(0, herdSpeed + (d - 1) * 0.5));
    a.run = speedWant > def.walk * 1.5 ? 1 : 0;
    _want.pitch = hunting && h.hunt === 1 ? -0.35 : 0.05;
    if (fleeing && def.id === "para" && rnd(a) < dt * 0.4) jawWant = 0.6;
  } else
    switch (a.state) {
      case IDLE: {
        _want.pitch = def.graze * (0.6 + 0.4 * Math.sin(t * 0.7 + a.s * 1e-9));
        if (def.id === "compy" || def.id === "dodo") _want.pitch = def.graze * (0.4 + 0.6 * Math.abs(Math.sin(t * 5 + a.slot)));
        if (a.timer <= 0) {
          const r = rnd(a);
          const farFromHome = ((a.x - homeX) * (a.x - homeX)) + ((a.z - homeZ) * (a.z - homeZ)) > ((1.5 + size) * (1.5 + size));
          // (at night the herd lies down — but the lead stands watch)
          if (night && r < 0.7 && (a.rank !== 0 || P.home)) {
            a.state = REST;
            a.timer = 20 + rnd(a) * 30;
          } else if (def.special[0] > 0 && r < 0.3 && !(a.baby && P.id !== "nests")) {
            startSpecial(a);
          } else if (farFromHome || r < 0.6) {
            a.state = WALK;
            a.run = def.id === "compy" && rnd(a) < 0.5 ? 1 : 0;
            // (a step or two to a new mouthful near its place)
            if (!P.home && rnd(a) < 0.5) {
              a.jx = (rnd(a) - 0.5) * h.R * 0.5;
              a.jz = (rnd(a) - 0.5) * h.R * 0.5;
            }
            const jit = def.id === "compy" ? 5 : 1.5;
            a.tx = homeX + (rnd(a) - 0.5) * jit;
            a.tz = homeZ + (rnd(a) - 0.5) * jit;
            a.timer = 14;
          } else a.timer = 2 + rnd(a) * 5;
        }
        break;
      }
      case WALK: {
        speedWant = a.run ? def.run : def.walk;
        const d = Math.sqrt((a.tx - a.x) * (a.tx - a.x) + (a.tz - a.z) * (a.tz - a.z));
        if (d < 0.6 + size * 0.3 || a.timer <= 0) {
          if (a.tree >= 0) {
            a.state = SPECIAL;
            a.timer = def.special[1];
          } else {
            a.state = IDLE;
            a.timer = 2 + rnd(a) * 5;
          }
          a.run = 0;
        } else if (d < 2) speedWant *= d / 2;
        _want.pitch = 0.05;
        break;
      }
      case SNIFF: {
        speedWant = 0;
        // (face the kid, nose down to sniff; dodos and terror birds bob, compys chirp)
        const rel = ((Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw) - Math.round((Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw) / TAU) * TAU);
        a.yaw += Math.min(def.turn * dt, Math.max(-def.turn * dt, rel));
        _want.pitch = -0.35 + Math.sin(t * 9) * 0.12;
        jawWant = Math.max(0, Math.sin(t * 7)) * 0.3;
        if (a.timer <= 0 || dK > 6) {
          a.state = WALK;
          a.cool = 14 + rnd(a) * 14;
          a.run = def.id === "compy" || a.baby ? 1 : 0;
          const ax = dK < 1e29 ? (a.x - kid.x) / Math.max(0.1, dK) : 0;
          const az = dK < 1e29 ? (a.z - kid.z) / Math.max(0.1, dK) : 0;
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
        // (each species' special pose lives in its own function: its many rarely-taken branches
        //  would otherwise deoptimise this whole step the first time each one runs)
        _pose.u = 1 - a.timer / Math.max(0.01, def.special[1]);
        _pose.rear = rearWant;
        _pose.flap = flapWant;
        _pose.jaw = jawWant;
        _pose.ears = earsWant;
        _pose.sway = swayWant;
        _pose.lie = lieWant;
        specialPose(a, t);
        rearWant = _pose.rear;
        flapWant = _pose.flap;
        jawWant = _pose.jaw;
        earsWant = _pose.ears;
        swayWant = _pose.sway;
        lieWant = _pose.lie;
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
  // the kid's in the way: giants stop and let them pass; the others step aside, round them
  let steerX = 0;
  let steerZ = 0;
  const personal = def.personal * (a.baby ? 0.4 : 1);
  if (personal > 0 && kid.near) {
    _cp.qx = kid.x;
    _cp.qz = kid.z;
    capDist(a);
    const kd = _cp.d;
    if (kd < personal) {
      const ax = (a.x - kid.x) / Math.max(0.1, dK);
      const az = (a.z - kid.z) / Math.max(0.1, dK);
      const ahead = Math.sin(a.yaw) * -ax + Math.cos(a.yaw) * -az > 0.3;
      if (def.giant) {
        // (a giant waits, looking down at the kid, until they've passed — unless it's right on top of them)
        if (ahead) {
          speedWant = 0;
          waitForKid = true;
        }
        if (kd < 1.5) {
          steerX = ax * 1.5;
          steerZ = az * 1.5;
          speedWant = Math.max(speedWant, def.walk * 0.5);
        }
        if (a.state === SPECIAL) a.timer = Math.min(a.timer, 0.3);
      } else {
        // (away, and round: whichever side it's already facing)
        const side = Math.sin(a.yaw) * -az + Math.cos(a.yaw) * ax > 0 ? 1 : -1;
        const k = 1 - kd / personal;
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
    }
  }
  a.mvW = speedWant;
  a.mvX = steerX;
  a.mvZ = steerZ;
  moveOnGround(sim, a, dt, settled);
  waitForKid = false;
  // (getting nowhere — trapped in a corner of the coast, or behind a tree? then shake free)
  {
    const d = Math.sqrt((a.x - homeX) * (a.x - homeX) + (a.z - homeZ) * (a.z - homeZ));
    if (d < a.best - 0.5 || d < h.R * 0.6 + 2) {
      a.best = d;
      a.bestT = 0;
    } else if (speedWant > 0.1) a.bestT += dt;
    if (a.bestT > 5) {
      a.stuck = Math.max(a.stuck, 4.5);
      a.best = d;
      a.bestT = 0;
    }
  }
  // head, jaw, tail, rearing, lying down
  a.dK = dK;
  if (a.state !== SNIFF) lookAtKid(a, _want, dt);
  else {
    a.hy = (a.hy + (0 - a.hy) * Math.min(1, dt * 3));
    a.hp = (a.hp + (_want.pitch - a.hp) * Math.min(1, dt * 5));
  }
  a.jaw = (a.jaw + (jawWant - a.jaw) * Math.min(1, dt * 5));
  a.rear = (a.rear + (rearWant - a.rear) * Math.min(1, dt * (rearWant > a.rear ? 1.6 : 2.2)));
  a.lie = (a.lie + (lieWant - a.lie) * Math.min(1, dt * 1.2));
  a.sway = (a.sway + (swayWant - a.sway) * Math.min(1, dt * 2));
  a.flap = (a.flap + (flapWant - a.flap) * Math.min(1, dt * 1.5));
  a.ears = (a.ears + (earsWant - a.ears) * Math.min(1, dt * 2));
  a.shake = (a.shake + (0 - a.shake) * Math.min(1, dt * 3));
}

/** (set while a giant waits for the kid to pass, for moveOnGround) */
let waitForKid = false;

/** how far (model m) a brachiosaur stands from the tree it browses (its head reaches ~8 m ahead) */
const BROWSE_OFF = 7.2;

function startSpecial(a: Animal) {
  const def = a.def;
  if (def.id === "brachio" || def.id === "sloth") {
    // walk to the nearest browse tree near the herd, then browse / rear up into it
    let best = -1;
    let bd = Infinity;
    const h = a.herd;
    const reach = def.id === "brachio" ? h.R + 26 : 14;
    for (let k = 0; k < TREES.length; k++) {
      const tr = TREES[k];
      if (tr.fern !== (def.id === "sloth")) continue;
      const d = ((tr.x - a.x) * (tr.x - a.x)) + ((tr.z - a.z) * (tr.z - a.z));
      if (d < bd && ((tr.x - h.cx) * (tr.x - h.cx)) + ((tr.z - h.cz) * (tr.z - h.cz)) < reach * reach) {
        bd = d;
        best = k;
      }
    }
    if (best >= 0) {
      const tr = TREES[best];
      const off = (def.id === "brachio" ? BROWSE_OFF : 2.3) * a.scale + tr.r;
      const d = Math.sqrt(bd) || 1;
      const tx = tr.x + ((a.x - tr.x) / d) * off;
      const tz = tr.z + ((a.z - tr.z) / d) * off;
      if (isY(okGround(tx, tz, false))) {
        a.tree = best;
        a.state = WALK;
        a.tx = tx;
        a.tz = tz;
        a.timer = 25;
        return;
      }
    }
  }
  a.state = SPECIAL;
  a.timer = def.special[1];
}

// ── capsule geometry (allocation-free) ──
const _cp = { ax: 0.5, az: 0.5, bx: 0.5, bz: 0.5, d: 0.5, qx: 0.5, qz: 0.5 };
/** closest points between segments p1-q1 and p2-q2 (2D); returns the distance */
/** segSeg's arguments (allocation-free: p1, q1, p2, q2 in SG[0..7]); the answer in _cp */
const SG = new Float64Array(8);
function segSegQ(): void {
  const p1x = SG[0];
  const p1z = SG[1];
  const q1x = SG[2];
  const q1z = SG[3];
  const p2x = SG[4];
  const p2z = SG[5];
  const q2x = SG[6];
  const q2z = SG[7];
  const d1x = q1x - p1x;
  const d1z = q1z - p1z;
  const d2x = q2x - p2x;
  const d2z = q2z - p2z;
  const rx = p1x - p2x;
  const rz = p1z - p2z;
  const a = d1x * d1x + d1z * d1z;
  const e = d2x * d2x + d2z * d2z;
  const f = d2x * rx + d2z * rz;
  let s = 0;
  let t = 0;
  if (a <= 1e-9 && e <= 1e-9) {
    s = 0;
    t = 0;
  } else if (a <= 1e-9) {
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = d1x * rx + d1z * rz;
    if (e <= 1e-9) {
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = d1x * d2x + d1z * d2z;
      const den = a * e - b * b;
      s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  _cp.ax = p1x + d1x * s;
  _cp.az = p1z + d1z * s;
  _cp.bx = p2x + d2x * t;
  _cp.bz = p2z + d2z * t;
  const ex = _cp.ax - _cp.bx;
  const ez = _cp.az - _cp.bz;
  _cp.d = Math.sqrt(ex * ex + ez * ez);
}
/** the closest points and distance (in _cp) between a's and b's body centre lines */
function segAB(a: Animal, b: Animal): void {
  SG[0] = a.cax;
  SG[1] = a.caz;
  SG[2] = a.cbx;
  SG[3] = a.cbz;
  SG[4] = b.cax;
  SG[5] = b.caz;
  SG[6] = b.cbx;
  SG[7] = b.cbz;
  segSegQ();
}
/** distance from a point to an animal's body capsule's surface (negative inside) */
/** (the point is _cp.qx, _cp.qz: no double arguments; the closest point on the centre line is left in _cp.ax/az) */
function capDist(a: Animal): void {
  const x = _cp.qx;
  const z = _cp.qz;
  const ux = a.cbx - a.cax;
  const uz = a.cbz - a.caz;
  const L2 = ux * ux + uz * uz;
  const t = L2 > 1e-9 ? Math.min(1, Math.max(0, ((x - a.cax) * ux + (z - a.caz) * uz) / L2)) : 0;
  _cp.ax = a.cax + ux * t;
  _cp.az = a.caz + uz * t;
  const ex = x - _cp.ax;
  const ez = z - _cp.az;
  _cp.d = Math.sqrt(ex * ex + ez * ez) - a.cr;
}
/** the gap (m) between two animals' bodies, nose to tail (negative = overlapping) */
export function bodyGap(a: Animal, b: Animal): number {
  segAB(a, b);
  return _cp.d - a.cr - b.cr;
}
export function bodyCapsule(a: Animal): { ax: number; az: number; bx: number; bz: number; r: number } {
  return { ax: a.cax, az: a.caz, bx: a.cbx, bz: a.cbz, r: a.cr };
}

/** steer towards (tx, tz), round the others (whole bodies) and the obstacles; move if the ground ahead is fine */
/** move the animal along: its wanted speed and steer are a.mvW, a.mvX, a.mvZ */
function moveOnGround(sim: DinoSim, a: Animal, dt: number, settled: boolean) {
  if (a.def.id === "trex") {
    moveOnGround1(sim, a, dt, settled);
    return;
  }
  // (the whole step is undone if it would push the body deeper into a trunk, a rock or a post —
  // or bring a raptor and its prey too close)
  const wary = a.def.raptor || a.def.prey;
  const x0 = a.x;
  const z0 = a.z;
  const yaw0 = a.yaw;
  const pax = a.cax;
  const paz = a.caz;
  const pbx = a.cbx;
  const pbz = a.cbz;
  moveOnGround1(sim, a, dt, settled);
  a.oax = pax;
  a.oaz = paz;
  a.obx = pbx;
  a.obz = pbz;
  if (wary && a.wary && !swingApart(a)) {
    a.x = x0;
    a.z = z0;
    a.yaw = yaw0;
    a.speed *= 0.5;
    capsule(a);
    settle(a, dt);
  }
}
function moveOnGround1(sim: DinoSim, a: Animal, dt: number, settled: boolean) {
  const def = a.def;
  let speedWant = a.mvW;
  const steerX = a.mvX;
  const steerZ = a.mvZ;
  // (the trunks, rocks and posts round about, gathered once for this move)
  if (def.id === "trex") NEAR_N = 0;
  else gatherObs(a);
  const size = def.size * a.scale;
  let dx = a.tx - a.x;
  let dz = a.tz - a.z;
  const dl = Math.sqrt(dx * dx + dz * dz);
  if (dl > 0.001) {
    dx /= dl;
    dz /= dl;
  }
  let fx = speedWant > 0.01 ? dx : 0;
  let fz = speedWant > 0.01 ? dz : 0;
  fx += steerX;
  fz += steerZ;
  // keep apart from the others: whole bodies (necks and tails too)
  const A = sim.animals;
  const reachA = a.reach;
  const raptorA = def.raptor;
  // (a sweep along the island's long axis: only the animals within reach in z)
  const ZS = sim.byZ;
  const zA = (a.caz + a.cbz) * 0.5;
  const zLim = reachA + sim.maxReach + RAPTOR_GAP + 3;
  let lo = 0;
  let hi = ZS.length;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (sim.zKey[m] < zA - zLim) lo = m;
    else hi = m;
  }
  NEAR_BN = 0;
  for (let jj = lo; jj < ZS.length; jj++) {
    if (sim.zKey[jj] > zA + zLim) break;
    const b = A[ZS[jj]];
    if (b === a || b.def.air || b.mode === 1) continue;
    // (prey and raptors give each other a wide berth; everyone else a body's width)
    // (it's the raptors' job to keep their distance: prey just don't let them come right up)
    const gapWant = raptorA && b.def.prey ? RAPTOR_GAP + 2 : b.def.raptor && def.prey ? 4 : 1.6 + Math.min(a.cr, b.cr) * 0.5;
    const reachB = b.reach;
    const mx = (a.cax + a.cbx - b.cax - b.cbx) * 0.5;
    const mz = (a.caz + a.cbz - b.caz - b.cbz) * 0.5;
    const lim = reachA + reachB + gapWant;
    if (mx * mx + mz * mz > lim * lim) continue;
    // (near enough to matter this step: the hard no-closer rule checks these)
    if (NEAR_BN < NEAR_B.length && a.mother !== b && b.mother !== a) NEAR_B[NEAR_BN++] = ZS[jj];
    segAB(a, b);
    const g = _cp.d - a.cr - b.cr;
    if (g < gapWant) {
      let ox = _cp.ax - _cp.bx;
      let oz = _cp.az - _cp.bz;
      let ol = Math.sqrt(ox * ox + oz * oz);
      if (ol < 1e-4) {
        ox = a.x - b.x;
        oz = a.z - b.z;
        ol = Math.sqrt(ox * ox + oz * oz) || 1;
      }
      const k = Math.min(1.5, Math.max(0, (gapWant - g) / gapWant));
      // (a baby near mum doesn't push her about; the smaller one gives way more)
      const give = b.cr > a.cr * 1.5 ? 1.4 : a.cr > b.cr * 1.5 ? 0.6 : 1;
      fx += (ox / ol) * k * 2.4 * give * (a.mother === b ? 0.4 : 1);
      fz += (oz / ol) * k * 2.4 * give * (a.mother === b ? 0.4 : 1);
      // (hard overlap: shove apart a little right now)
      if (g < 0) {
        const push = Math.min(-g * 0.5 * give, 0.45);
        a.nx = a.x + (ox / ol) * push;
        a.nz = a.z + (oz / ol) * push;
        if (shoveOk(a, !!def.wade, true)) {
          a.x = a.nx;
          a.z = a.nz;
        }
      }
    }
  }
  // and round the kid (nobody treads on you)
  if (kid.near) {
    _cp.qx = kid.x;
    _cp.qz = kid.z;
    capDist(a);
    const kd = _cp.d;
    if (kd < 1.4) {
      let ox = a.x - kid.x;
      let oz = a.z - kid.z;
      const ol = Math.sqrt(ox * ox + oz * oz) || 1;
      ox /= ol;
      oz /= ol;
      fx += ox * 3;
      fz += oz * 3;
    }
  }
  // obstacles (trees, rocks, fences): against the whole body (not the T-rex: down in its valley the
  // only "obstacles" are the Rex Bridge's railings, high over its head)
  let touching = false;
  {
    for (let q = 0; q < NEAR_N; q++) {
      const k = NEAR_OBS[q];
      _cp.qx = OBS_X[k];
      _cp.qz = OBS_Z[k];
      capDist(a);
      const od = _cp.d;
      const want = OBS_R[k] + 0.6;
      if (od < want) {
        if (od + a.cr < OBS_R[k] + 0.4) touching = true;
        let ox = _cp.ax - OBS_X[k];
        let oz = _cp.az - OBS_Z[k];
        const ol = Math.sqrt(ox * ox + oz * oz) || 1;
        ox /= ol;
        oz /= ol;
        const w = Math.min(1, Math.max(0, (want - od) / (want + 1)));
        fx += ox * w * 3.2;
        fz += oz * w * 3.2;
      }
    }
  }
  const fl = Math.sqrt(fx * fx + fz * fz);
  let sp = a.speed;
  if (fl > 0.05) {
    const want = Math.atan2(fx, fz);
    const turn = def.turn * (a.baby ? 2 : 1) * dt * (0.5 + Math.min(1, fl));
    a.dyaw = Math.min(turn, Math.max(-turn, ((want - a.yaw) - Math.round((want - a.yaw) / TAU) * TAU)));
    turnBy(a);
    // (slow down while turning hard)
    const off = Math.abs(((want - a.yaw) - Math.round((want - a.yaw) / TAU) * TAU));
    speedWant = Math.max(speedWant, fl > 1.2 && settled ? def.walk * 0.7 : 0) * (off > 1.2 ? 0.35 : 1);
  }
  // (a giant waiting for the kid to pass stands still, whatever its herd wants)
  if (waitForKid) speedWant = 0;
  sp = (sp + (speedWant - sp) * Math.min(1, dt * (waitForKid ? 3 : 1.8)));
  a.speed = sp;
  if (sp > 0.001) {
    // straight on if it can; else slide round whatever's in the way (a little left or right, then
    // more); a long-stuck animal shakes itself free
    const free = a.stuck > 3;
    let moved = false;
    if (!free)
      for (let k = 0; k < SLIDE.length && !moved; k++) {
        const yy = a.yaw + SLIDE[k];
        const step = sp * dt * (k === 0 ? 1 : 0.6);
        a.nx = a.x + Math.sin(yy) * step;
        a.nz = a.z + Math.cos(yy) * step;
        a.nyaw = yy;
        if (canStand(a, false)) {
          a.x = a.nx;
          a.z = a.nz;
          moved = true;
          if (k > 0) {
            a.dyaw = Math.min(def.turn * dt * 2, Math.max(-def.turn * dt * 2, SLIDE[k]));
            turnBy(a);
          }
        }
      }
    else {
      // (wedged: of the steps back towards its herd, the one that frees its body most)
      const h = a.herd;
      // (out along the push it's getting — away from whoever it's tangled with — or back to its herd)
      const to = fl > 0.3 ? Math.atan2(fx, fz) : Math.atan2(h.cx - a.x, h.cz - a.z);
      let bestK = -1;
      a.nx = a.x;
      a.nz = a.z;
      penetration(a);
      const pen0 = a.out;
      let bestS = Infinity;
      const d0 = Math.sqrt((h.cx - a.x) * (h.cx - a.x) + (h.cz - a.z) * (h.cz - a.z));
      for (let k = 0; k < 12; k++) {
        const yy = to + (k / 12) * TAU;
        const step = Math.max(0.4, sp) * dt;
        const nx = a.x + Math.sin(yy) * step;
        const nz = a.z + Math.cos(yy) * step;
        a.nx = nx;
        a.nz = nz;
        a.nyaw = yy;
        if (!canStand(a, true)) continue;
        penetration(a);
        const pen = a.out;
        if (pen > pen0 + 0.02) continue;
        // (out of the tangle first, then towards the herd)
        const sc = pen * 20 + (Math.sqrt((h.cx - nx) * (h.cx - nx) + (h.cz - nz) * (h.cz - nz)) - d0);
        if (sc < bestS) {
          bestS = sc;
          bestK = k;
        }
      }
      const yaw0 = a.yaw;
      if (bestK >= 0) {
        const yy = to + (bestK / 12) * TAU;
        const step = Math.max(0.4, sp) * dt;
        a.x += Math.sin(yy) * step;
        a.z += Math.cos(yy) * step;
        capsule(a);
        a.dyaw = Math.min(def.turn * dt * 2, Math.max(-def.turn * dt * 2, ((yy - a.yaw) - Math.round((yy - a.yaw) / TAU) * TAU)));
        turnBy(a);
        moved = true;
      } else {
        // (no way out without pushing deeper: swing round on the spot towards the herd and try again —
        //  never deeper into a trunk or anybody's flank)
        a.dyaw = Math.min(def.turn * dt, Math.max(-def.turn * dt, ((to - a.yaw) - Math.round((to - a.yaw) / TAU) * TAU)));
        turnBy(a);
      }
      if (def.raptor || def.prey) {
        const cax = a.cax;
        const caz = a.caz;
        const cbx = a.cbx;
        const cbz = a.cbz;
        capsule(a);
        a.oax = cax;
        a.oaz = caz;
        a.obx = cbx;
        a.obz = cbz;
        if (!swingApart(a)) a.yaw = yaw0;
      }
    }
    if (moved) a.stuck = Math.max(0, a.stuck - dt * 2);
    else {
      a.stuck += dt;
      a.speed *= 0.5;
      const h = a.herd;
      a.dyaw = Math.min(def.turn * dt * 2, Math.max(-def.turn * dt * 2, ((Math.atan2(h.cx - a.x, h.cz - a.z) - a.yaw) - Math.round((Math.atan2(h.cx - a.x, h.cz - a.z) - a.yaw) / TAU) * TAU)));
      turnBy(a);
      if (a.state === WALK && a.timer > 1.5) a.timer = 1.5;
    }
  }
  capsule(a);
  // hard push out of obstacles (never inside a tree): the body's centre line
  for (let pass = 0; NEAR_N > 0 && pass < (touching ? 3 : 1); pass++) {
    for (let q = 0; q < NEAR_N; q++) {
      const k = NEAR_OBS[q];
      // (the body's centre line must never pass through a trunk or a rock)
      _cp.qx = OBS_X[k];
      _cp.qz = OBS_Z[k];
      capDist(a);
      const segD = _cp.d + a.cr;
      if (segD < OBS_R[k] + 0.08) {
        let ox = _cp.ax - OBS_X[k];
        let oz = _cp.az - OBS_Z[k];
        const ol = Math.sqrt(ox * ox + oz * oz) || 1;
        ox /= ol;
        oz /= ol;
        const push = Math.min(OBS_R[k] + 0.1 - segD, 0.6);
        // (straight out — or, if that's off the land, sideways round it)
        // (no array literals here: this runs every frame)
        for (let w = 0; w < 3; w++) {
          const px = w === 0 ? ox : w === 1 ? -oz : oz;
          const pz = w === 0 ? oz : w === 1 ? ox : -ox;
          a.nx = a.x + px * push;
          a.nz = a.z + pz * push;
          if (shoveOk(a, true, false)) {
            a.x = a.nx;
            a.z = a.nz;
            capsule(a);
            break;
          }
        }
      }
    }
  }
  settle(a, dt);
}

/** the closest a raptor and a prey animal's bodies may get (m) */
const HARD_GAP = 3.4;
/** would moving `a` to (x, z) bring a raptor and a prey animal closer than HARD_GAP (and closer than they are)? */
/** a shove of a to a.nx, a.nz: on its ground, its side of the bridge, out of the valley (and with
 *  body = its body clear of the trunks), never a raptor and its prey closer (allocation-free) */
function shoveOk(a: Animal, wade: boolean, body: boolean): boolean {
  const def = a.def;
  if (!inRealm(a, a.nz)) return false;
  DQ[0] = a.nx;
  DQ[1] = a.nz;
  if (!okGroundQ(wade)) return false;
  if (def.id !== "trex") {
    dinoGorgeEQ();
    if (DQ[2] <= DINO_FENCE_E + 0.05) return false;
    if (body) {
      keepBody(a);
      if (!bodyClearAt(a)) return false;
    }
  }
  return (!def.raptor && !def.prey) || !a.wary || keepsApart(a);
}
/** the bodies near the animal being moved this step (indices into the sim's animals), from its spacing sweep */
const NEAR_B = new Int32Array(256);
let NEAR_BN = 0;
/** this step's animals */
let SIM_ALL: Animal[] = [];
/** bodies this close (m between their surfaces) never get any closer: no step or turn may squeeze in */
const BODY_GAP = 0.3;
/** would a, moved to a.nx, a.nz from its body a.oax..obz (and as it is now: a.cax..cbz, maybe turned),
 *  stay out of everyone near it — never closer to anybody it's already within BODY_GAP of? */
function bodiesOk(a: Animal): boolean {
  const dx = a.nx - a.x;
  const dz = a.nz - a.z;
  const A = SIM_ALL;
  for (let q = 0; q < NEAR_BN; q++) {
    const b = A[NEAR_B[q]];
    SG[0] = a.cax + dx;
    SG[1] = a.caz + dz;
    SG[2] = a.cbx + dx;
    SG[3] = a.cbz + dz;
    SG[4] = b.cax;
    SG[5] = b.caz;
    SG[6] = b.cbx;
    SG[7] = b.cbz;
    segSegQ();
    const g1 = _cp.d - a.cr - b.cr;
    if (g1 >= BODY_GAP) continue;
    SG[0] = a.oax;
    SG[1] = a.oaz;
    SG[2] = a.obx;
    SG[3] = a.obz;
    segSegQ();
    const g0 = _cp.d - a.cr - b.cr;
    if (g1 < g0 - 1e-4) return false;
  }
  return true;
}
/** a's body as it is now, as the "before" for bodyClearAt / swingApart */
function keepBody(a: Animal) {
  a.oax = a.cax;
  a.oaz = a.caz;
  a.obx = a.cbx;
  a.obz = a.cbz;
}
/** would moving a to a.nx, a.nz keep it (raptor or prey) from closing on the other kind */
function keepsApart(a: Animal): boolean {
  const dx = a.nx - a.x;
  const dz = a.nz - a.z;
  const isRaptor = a.def.raptor;
  const A = isRaptor ? SIM_PREY : SIM_RAPTORS;
  for (let j = 0; j < A.length; j++) {
    const b = A[j];
    if (b === a || (isRaptor ? !b.def.prey : !b.def.raptor) || b.mode === 1) continue;
    const mx = (a.cax + a.cbx) * 0.5 + dx - (b.cax + b.cbx) * 0.5;
    const mz = (a.caz + a.cbz) * 0.5 + dz - (b.caz + b.cbz) * 0.5;
    const lim = a.reach + b.reach + HARD_GAP;
    if (mx * mx + mz * mz > lim * lim) continue;
    SG[0] = a.cax + dx;
    SG[1] = a.caz + dz;
    SG[2] = a.cbx + dx;
    SG[3] = a.cbz + dz;
    SG[4] = b.cax;
    SG[5] = b.caz;
    SG[6] = b.cbx;
    SG[7] = b.cbz;
    segSegQ();
    const g1 = _cp.d - a.cr - b.cr;
    if (g1 >= HARD_GAP) continue;
    segAB(a, b);
    const g0 = _cp.d - a.cr - b.cr;
    if (g1 < g0 + 1e-4) return false;
  }
  return true;
}
/** this step's raptors and prey (see DinoSim) */
let SIM_RAPTORS: Animal[] = [];
let SIM_PREY: Animal[] = [];
/** a raptor or a prey animal turning: its new body (a's capsule now) mustn't swing closer than HARD_GAP to the other kind than its old one (a.oax..obz) was */
function swingApart(a: Animal): boolean {
  const isRaptor = a.def.raptor;
  const A = isRaptor ? SIM_PREY : SIM_RAPTORS;
  for (let j = 0; j < A.length; j++) {
    const b = A[j];
    if (b === a || (isRaptor ? !b.def.prey : !b.def.raptor) || b.mode === 1) continue;
    const mx = (a.cax + a.cbx - b.cax - b.cbx) * 0.5;
    const mz = (a.caz + a.cbz - b.caz - b.cbz) * 0.5;
    const lim = a.reach + b.reach + HARD_GAP;
    if (mx * mx + mz * mz > lim * lim) continue;
    segAB(a, b);
    const g1 = _cp.d - a.cr - b.cr;
    if (g1 >= HARD_GAP) continue;
    SG[0] = a.oax;
    SG[1] = a.oaz;
    SG[2] = a.obx;
    SG[3] = a.obz;
    SG[4] = b.cax;
    SG[5] = b.caz;
    SG[6] = b.cbx;
    SG[7] = b.cbz;
    segSegQ();
    const g0 = _cp.d - a.cr - b.cr;
    if (g1 < g0 - 1e-4) return false;
  }
  return true;
}

/** turn by dYaw — unless the long body would swing through a trunk, or a raptor and its prey would swing closer */
/** (the turn is a.dyaw) */
function turnBy(a: Animal) {
  const dYaw = a.dyaw;
  if (!dYaw) return;
  const yaw0 = a.yaw;
  a.yaw += dYaw;
  if (a.def.id === "trex") return;
  const cax = a.cax;
  const caz = a.caz;
  const cbx = a.cbx;
  const cbz = a.cbz;
  // (a stuck animal may swing round while wedged, but never deeper into a trunk)
  a.nx = a.x;
  a.nz = a.z;
  let pen0 = 0;
  if (a.reach > 1 && a.stuck > 3) {
    penetration(a);
    pen0 = a.out;
  }
  capsule(a);
  a.oax = cax;
  a.oaz = caz;
  a.obx = cbx;
  a.obz = cbz;
  let clear = true;
  if (a.reach > 1) {
    if (a.stuck <= 3) clear = bodyClearAt(a);
    else {
      penetration(a);
      clear = a.out <= pen0 + 0.02;
    }
  }
  if (clear && NEAR_BN > 0 && !bodiesOk(a)) clear = false;
  if (clear && a.wary && (a.def.raptor || a.def.prey)) clear = swingApart(a);
  if (!clear) {
    a.yaw = yaw0;
    capsule(a);
  }
}

/** each herd keeps to its own side of the land bridge */
const inRealm = (a: Animal, z: number) => (a.herd.realm === "ice" ? z < DINO_ICE_LINE + 14 : z > DINO_ICE_LINE + 8);

/** headings to try (relative) when the way ahead is blocked */
const SLIDE = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6];
/** can the animal step to (x, z) heading yy: its ground (and under its nose), its own side of the bridge, out of the valley and the lava, its body clear */
/** (the step is a.nx, a.nz heading a.nyaw) */
function canStand(a: Animal, free: boolean): boolean {
  const def = a.def;
  const nx = a.nx;
  const nz = a.nz;
  const yy = a.nyaw;
  const size = def.size * a.scale;
  const ahead = Math.max(size * 0.9, def.body[0] * a.scale * 0.8);
  const realmOk = inRealm(a, nz);
  const isRex = def.id === "trex";
  const hx = nx + Math.sin(yy) * ahead;
  const hz = nz + Math.cos(yy) * ahead;
  // (raptors and their prey never close in on each other: a hard rule, they never touch)
  if (a.wary && (def.raptor || def.prey) && !keepsApart(a)) return false;
  if (!realmOk || Math.sqrt((nx - DINO_VOLCANO.x) * (nx - DINO_VOLCANO.x) + (nz - DINO_VOLCANO.z) * (nz - DINO_VOLCANO.z)) <= DINO_VOLCANO.lavaR + 4) return false;
  DQ[0] = nx;
  DQ[1] = nz;
  if (free) {
    // (shaking free: any step over land, out of the valley and the lava)
    dinoLandYQ();
    if (!(DQ[2] > 1.1)) return false;
    if (isRex) return true;
    dinoGorgeEQ();
    if (DQ[2] <= DINO_FENCE_E + 0.05) return false;
    keepBody(a);
    return bodiesOk(a);
  }
  const wade = !!def.wade;
  if (!okGroundQ(wade)) return false;
  DQ[0] = hx;
  DQ[1] = hz;
  if (!okGroundQ(wade)) return false;
  if (isRex) return true;
  dinoGorgeEQ();
  if (DQ[2] <= DINO_FENCE_E + 0.05) return false;
  keepBody(a);
  return bodyClearAt(a) && bodiesOk(a);
}

/** how deep (m, summed) the animal's body centre line, moved to (x, z), sits in trunks, rocks and posts */
/** (moved to a.nx, a.nz; the depth is also left in a.out) */
function penetration(a: Animal): void {
  const dx = a.nx - a.x;
  const dz = a.nz - a.z;
  const ax = a.cax + dx;
  const az = a.caz + dz;
  const ux = a.cbx + dx - ax;
  const uz = a.cbz + dz - az;
  const L2 = ux * ux + uz * uz;
  let pen = 0;
  {
    for (let q = 0; q < NEAR_N; q++) {
      const k = NEAR_OBS[q];
      const t = L2 > 1e-9 ? Math.min(1, Math.max(0, ((OBS_X[k] - ax) * ux + (OBS_Z[k] - az) * uz) / L2)) : 0;
      const d = Math.sqrt((ax + ux * t - OBS_X[k]) * (ax + ux * t - OBS_X[k]) + (az + uz * t - OBS_Z[k]) * (az + uz * t - OBS_Z[k]));
      if (d < OBS_R[k] + 0.06) pen += OBS_R[k] + 0.06 - d;
    }
  }
  a.out = pen;
}

/** would the animal's body centre line, moved to (x, z), stay out of every trunk, rock and post? */
/** (moved to a.nx, a.nz; its body before, a.oax..obz) */
function bodyClearAt(a: Animal): boolean {
  const dx = a.nx - a.x;
  const dz = a.nz - a.z;
  const pax = a.oax;
  const paz = a.oaz;
  const pbx = a.obx;
  const pbz = a.obz;
  const ax = a.cax + dx;
  const az = a.caz + dz;
  const bx = a.cbx + dx;
  const bz = a.cbz + dz;
  const ux = bx - ax;
  const uz = bz - az;
  const L2 = ux * ux + uz * uz;
  {
    for (let q = 0; q < NEAR_N; q++) {
      const k = NEAR_OBS[q];
      const t = L2 > 1e-9 ? Math.min(1, Math.max(0, ((OBS_X[k] - ax) * ux + (OBS_Z[k] - az) * uz) / L2)) : 0;
      const px = ax + ux * t - OBS_X[k];
      const pz = az + uz * t - OBS_Z[k];
      const rr = OBS_R[k] + 0.06;
      if (px * px + pz * pz < rr * rr) {
        // (already inside it: only moves that get it further out are fine)
        const cx = pax + (pbx - pax) * t - OBS_X[k];
        const cz = paz + (pbz - paz) * t - OBS_Z[k];
        if (px * px + pz * pz < cx * cx + cz * cz + 1e-6) return false;
      }
    }
  }
  return true;
}

/** stand on the ground: height, body pitch/roll from the slope, the step cycle */
/** put a on the ground where it stands (if there is ground) */
function groundY(a: Animal) {
  DQ[0] = a.x;
  DQ[1] = a.z;
  dinoLandYQ();
  if (DQ[2] === DQ[2]) a.y = DQ[2];
}
function settle(a: Animal, dt: number) {
  const size = a.def.size * a.scale;
  groundY(a);
  const fx = Math.sin(a.yaw) * size;
  const fz = Math.cos(a.yaw) * size;
  DQ[0] = a.x + fx;
  DQ[1] = a.z + fz;
  dinoLandYQ();
  let yf = DQ[2];
  DQ[0] = a.x - fx;
  DQ[1] = a.z - fz;
  dinoLandYQ();
  let yb = DQ[2];
  if (yf !== yf) yf = a.y;
  if (yb !== yb) yb = a.y;
  a.pitch = (a.pitch + ((Math.min(0.3, Math.max(-0.3, Math.atan2(yb - yf, size * 2)))) - a.pitch) * Math.min(1, dt * 4));
  const stride = a.def.stride * a.scale;
  a.phase = (a.phase + (a.speed / stride) * TAU * 0.5 * dt) % (TAU * 1000);
  a.gait = (a.gait + ((Math.min(1.7, Math.max(0, a.speed / a.def.walk))) - a.gait) * Math.min(1, dt * 4));
  a.roll = a.def.waddle ? Math.sin(a.phase) * a.def.waddle * Math.min(1, a.gait) : 0;
}

// ── pushing the kid out of the animals (they're solid) ──

/**
 * Keep the kid (point p, radius KID_R) out of every animal's body. Returns true if it moved them.
 * Allocation-free; the engine calls it once a frame after the kid moves.
 */
export function pushKid(sim: DinoSim, p: { x: number; z: number }, ky = -Infinity): boolean {
  let moved = false;
  // (a few passes: out of one body can be into the next one in a crowded herd)
  let pass = 0;
  for (; pass < 8; pass++) if (!pushKidOnce(sim, p, ky)) break;
  else moved = true;
  if (pass < 8) return moved;
  // (wedged between bodies with no room: the nearest free spot, in rings round where they are)
  const x0 = p.x;
  const z0 = p.z;
  for (let ring = 1; ring <= 40; ring++) {
    const r = ring * 0.35;
    const n = 8 + ring * 2;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      p.x = x0 + Math.sin(a) * r;
      p.z = z0 + Math.cos(a) * r;
      if (!kidInside(sim, p, ky)) return true;
    }
  }
  p.x = x0;
  p.z = z0;
  return moved;
}
/** is the kid (radius KID_R) at p inside anybody's body */
function kidInside(sim: DinoSim, p: { x: number; z: number }, ky: number): boolean {
  const A = sim.animals;
  for (let i = 0; i < A.length; i++) {
    const a = A[i];
    if (a.def.air || a.mode === 1) continue;
    if (ky > a.y + a.def.eyeY * a.scale + 1) continue;
    _cp.qx = p.x;
    _cp.qz = p.z;
    capDist(a);
    if (_cp.d < KID_R - 0.01) return true;
  }
  return false;
}
function pushKidOnce(sim: DinoSim, p: { x: number; z: number }, ky: number): boolean {
  let moved = false;
  const A = sim.animals;
  for (let i = 0; i < A.length; i++) {
    const a = A[i];
    if (a.def.air || a.mode === 1) continue;
    // (up on a deck or a cliff well above it: no bump)
    if (ky > a.y + a.def.eyeY * a.scale + 1) continue;
    const r = a.cr + KID_R;
    const mx = (a.cax + a.cbx) * 0.5 - p.x;
    const mz = (a.caz + a.cbz) * 0.5 - p.z;
    const reach = Math.sqrt((a.cbx - a.cax) * (a.cbx - a.cax) + (a.cbz - a.caz) * (a.cbz - a.caz)) * 0.5 + r;
    if (mx * mx + mz * mz > reach * reach) continue;
    _cp.qx = p.x;
    _cp.qz = p.z;
    capDist(a);
    const d = _cp.d;
    if (d < KID_R) {
      let ox = p.x - _cp.ax;
      let oz = p.z - _cp.az;
      let ol = Math.sqrt(ox * ox + oz * oz);
      if (ol < 1e-4) {
        ox = Math.cos(a.yaw);
        oz = -Math.sin(a.yaw);
        ol = 1;
      }
      p.x = _cp.ax + (ox / ol) * r;
      p.z = _cp.az + (oz / ol) * r;
      moved = true;
    }
  }
  return moved;
}

// ── the T-rex ──
// modes: 0 patrol, 1 walk over to show off (a display, never towards the kid), 2 ROAR, 3 yawn, 4 nap, 5 get up, 6 drink
const T_PATROL = 0;
const T_DISPLAY = 1;
const T_ROAR = 2;
const T_YAWN = 3;
const T_NAP = 4;
const T_WAKE = 5;
const T_DRINK = 6;
/** the T-rex never comes closer than this (m, 3D) to anywhere the kid can stand */
export const TREX_SAFE = 5;

/** a spot on the valley floor (hips well in from the walls) */
function trexSpot(a: Animal, out: { x: number; z: number }, awayX: number, awayZ: number, awayR: number) {
  let bx = G.x;
  let bz = G.z;
  let bs = -Infinity;
  for (let k = 0; k < 10; k++) {
    const ang = rnd(a) * TAU;
    const r = Math.sqrt(rnd(a)) * 0.72;
    const x = G.x + Math.sin(ang) * G.rx * r * 0.62;
    const z = G.z + Math.cos(ang) * G.rz * r * 0.86;
    // (prefer spots a good walk away; away from the kid / the bridge when asked)
    let sc = Math.sqrt((x - a.x) * (x - a.x) + (z - a.z) * (z - a.z)) * 0.2 + rnd(a) * 4;
    if (awayR > 0) sc += Math.min(awayR, Math.sqrt((x - awayX) * (x - awayX) + (z - awayZ) * (z - awayZ))) * 2;
    if (kid.onBridge) sc += Math.min(30, Math.abs(z - REX_BRIDGE.z)) * 2;
    if (sc > bs) {
      bs = sc;
      bx = x;
      bz = z;
    }
  }
  out.x = bx;
  out.z = bz;
}
const _ts = { x: 0, z: 0 };

function stepTrex(sim: DinoSim, a: Animal, dt: number, t: number, hour: number) {
  const dK = kidDist(a);
  a.cool -= dt;
  const night = hour >= 21 || hour < 5.5;
  const siesta = hour >= 12.5 && hour < 14;
  const thirsty = (hour >= 6 && hour < 7.5) || (hour >= 18 && hour < 19.5);
  // the kid watching from the rim, a lookout or the bridge?
  const ge = kid.near ? dinoGorgeE(kid.x, kid.z) : 99;
  const kidWatching = ge < 2.3;
  const kidInside = ge < DINO_FENCE_E - 0.05 && !kid.onBridge;
  a.timer -= dt;
  let speedWant = 0;
  _want.yaw = 0;
  _want.pitch = -0.05;
  let jawWant = 0;
  let lieWant = 0;
  let shake = 0;
  let sway = 0;
  let rear = 0;
  // (somebody's in the valley with it — off a dragon, say: it walks well away, never towards them)
  if (kidInside && dK < 40 && a.mode !== T_ROAR) {
    if (a.mode === T_NAP) a.mode = T_WAKE;
    else if (a.mode !== T_WAKE) {
      a.mode = T_PATROL;
      trexSpot(a, _ts, kid.x, kid.z, 80);
      a.tx = _ts.x;
      a.tz = _ts.z;
      a.timer = 12;
    }
  }
  switch (a.mode) {
    case T_PATROL: {
      speedWant = a.def.walk;
      const d = Math.sqrt((a.tx - a.x) * (a.tx - a.x) + (a.tz - a.z) * (a.tz - a.z));
      if (thirsty && a.cool <= 0) {
        // (down to the pool for a drink: once each dawn and dusk)
        a.cool = 200;
        a.mode = T_DRINK;
        a.tx = DINO_POOL.x + 9;
        a.tz = DINO_POOL.z - 4;
        a.timer = 40;
        break;
      }
      if (d < 3 || a.timer <= 0) {
        trexSpot(a, _ts, kid.x, kid.z, kidInside ? 80 : 0);
        a.tx = _ts.x;
        a.tz = _ts.z;
        a.timer = 22;
        const r = rnd(a);
        if (r < (night ? 0.7 : siesta ? 0.5 : 0.12)) {
          a.mode = T_YAWN;
          a.timer = 3;
        }
      }
      // someone's come to watch: show off (turn to face them across the valley, and ROAR) — now and then, not non-stop
      if (kidWatching && sim.roarCool <= 0 && sim.showCool <= 0 && !kidInside) {
        sim.showCool = 75;
        a.mode = T_DISPLAY;
        a.timer = 7;
      }
      // (and now and then a roar at the sky: it carries right across the island)
      if (kid.near && sim.roarCool < -45 && rnd(a) < dt * 0.04) {
        a.mode = T_ROAR;
        a.timer = 2.8;
        sim.roared = true;
        sim.roarCool = 25;
      }
      break;
    }
    case T_DISPLAY: {
      // (it stops, turns on the spot to face the kid across the valley — it never walks towards them)
      speedWant = 0;
      shake = 0.15;
      _want.pitch = 0.15;
      a.yaw += Math.min(dt * 0.7, Math.max(-dt * 0.7, ((Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw) - Math.round((Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw) / TAU) * TAU)));
      const facing = Math.abs(((Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw) - Math.round((Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw) / TAU) * TAU)) < 0.5;
      if (facing || a.timer <= 0) {
        a.mode = T_ROAR;
        a.timer = 2.8;
        sim.roared = true;
        sim.roarCool = 24;
      }
      if (!kidWatching) {
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
      if (kid.near && kidWatching) a.yaw += Math.min(dt, Math.max(-dt, ((Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw) - Math.round((Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw) / TAU) * TAU)));
      // (the herds nearby hear it and stampede off)
      if (u < 0.05) for (const h of sim.herds) if (h.realm === "dino" && Math.sqrt((h.cx - a.x) * (h.cx - a.x) + (h.cz - a.z) * (h.cz - a.z)) < 120) startle(h, a.x, a.z, 6);
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
        // (a nap — but not right under the bridge while someone's on it)
        if (kid.onBridge && Math.abs(a.z - REX_BRIDGE.z) < 22) {
          a.mode = T_PATROL;
          a.timer = 0;
        } else {
          a.mode = T_NAP;
          a.timer = (night ? 60 : siesta ? 40 : 18) + rnd(a) * 14;
        }
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
      // (grumpily woken by a visitor at the rim)
      if ((a.timer <= 0 && !night) || (kidWatching && sim.roarCool <= 0 && rnd(a) < dt * 0.25) || (night && a.timer <= -120)) {
        a.mode = T_WAKE;
        a.timer = 2.2;
      }
      break;
    }
    case T_WAKE: {
      if (a.timer <= 0) {
        a.mode = T_PATROL;
        a.timer = 0;
      }
      break;
    }
    case T_DRINK: {
      const d = Math.sqrt((a.tx - a.x) * (a.tx - a.x) + (a.tz - a.z) * (a.tz - a.z));
      if (d > 3) speedWant = a.def.walk;
      else {
        // (nose down to the water; a slurp now and then)
        a.yaw += Math.min(dt * 0.6, Math.max(-dt * 0.6, ((Math.atan2(DINO_POOL.x - a.x, DINO_POOL.z - a.z) - a.yaw) - Math.round((Math.atan2(DINO_POOL.x - a.x, DINO_POOL.z - a.z) - a.yaw) / TAU) * TAU)));
        _want.pitch = -0.6;
        jawWant = Math.max(0, Math.sin(t * 2.2)) * 0.25;
      }
      if (a.timer <= 0) {
        a.mode = T_PATROL;
        a.timer = 0;
      }
      break;
    }
  }
  a.shake = (a.shake + (shake - a.shake) * Math.min(1, dt * 6));
  a.sway = (a.sway + (sway - a.sway) * Math.min(1, dt * 3));
  a.rear = (a.rear + (rear - a.rear) * Math.min(1, dt * 3));
  a.lie = (a.lie + (lieWant - a.lie) * Math.min(1, dt * (lieWant > a.lie ? 0.9 : 1.6)));
  if (a.lie > 0.3 && a.mode !== T_WAKE) speedWant = 0;
  a.jaw = (a.jaw + (jawWant - a.jaw) * Math.min(1, dt * (jawWant > a.jaw ? 7 : 3)));
  // move (on the valley floor, round its trees and rocks)
  a.mvW = speedWant;
  a.mvX = 0;
  a.mvZ = 0;
  moveOnGround(sim, a, dt, true);
  trexKeepIn(a);
  if (a.mode === T_ROAR || a.mode === T_NAP) {
    a.hy = (a.hy + (_want.yaw - a.hy) * Math.min(1, dt * 3));
    a.hp = (a.hp + (_want.pitch - a.hp) * Math.min(1, dt * 4));
  } else {
    a.dK = dK;
    lookAtKid(a, _want, dt);
  }
}

/** keep the T-rex's whole body (nose to tail) on the valley floor */
function trexKeepIn(a: Animal) {
  for (let k = 0; k < 12; k++) {
    capsule(a);
    DQ[0] = a.cax;
    DQ[1] = a.caz;
    dinoGorgeEQ();
    let e = DQ[2];
    DQ[0] = a.cbx;
    DQ[1] = a.cbz;
    dinoGorgeEQ();
    if (DQ[2] > e) e = DQ[2];
    DQ[0] = a.x;
    DQ[1] = a.z;
    dinoGorgeEQ();
    if (DQ[2] > e) e = DQ[2];
    e += a.cr / G.rx;
    if (e < T_FLOOR_E) break;
    a.x += (G.x - a.x) * 0.06;
    a.z += (G.z - a.z) * 0.06;
  }
  capsule(a);
  const y = dinoLandYN(a.x, a.z);
  if (y === y) a.y = y;
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
    const rel = ((Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw) - Math.round((Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw) / TAU) * TAU);
    _want.yaw = Math.max(-1.2, Math.min(1.2, rel));
    _want.pitch = 0.35;
  }
  a.hy = (a.hy + (_want.yaw - a.hy) * Math.min(1, dt * 3));
  a.hp = (a.hp + (_want.pitch - a.hp) * Math.min(1, dt * 3));
  a.jaw = k > 0.9 ? Math.max(0, Math.sin(t * 6 + a.slot)) * 0.5 : 0;
  a.speed = 0;
  a.gait = 0;
  a.lie = 0;
  a.pitch = 0;
  a.roll = Math.sin(t * 5 + a.slot) * 0.05 * k;
  a.rear = 0.25 * k;
}

// ── flyers and swimmers ──
// a pteranodon soars in a circle over the cliffs (mode 0); now and then it swoops down to skim
// the sea for fish (mode 1: glide out and down, 2: skim, 3: climb back up to its circle)

function stepFlyer(a: Animal, dt: number, t: number) {
  a.timer -= dt;
  let tx = 0;
  let tz = 0;
  let ty = 0;
  if (a.mode === 0) {
    a.fa += a.fw * dt;
    const wob = Math.sin(t * 0.21 + a.s * 1e-9 * 7) * 0.12;
    const r = a.fr * (1 + wob);
    tx = a.fcx + Math.sin(a.fa) * r;
    tz = a.fcz + Math.cos(a.fa) * r;
    const climb = Math.sin(t * 0.33 + a.slot * 1.7);
    ty = a.fh + climb * 5 + Math.sin(t * 0.9 + a.slot) * 0.6;
    if (a.timer <= 0) {
      // (off to fish: the nearest bit of sea along the loop round the island)
      let best = 0;
      let bd = Infinity;
      for (let s = 0; s < SEA_LOOP_L; s += SEA_LOOP_L / 48) {
        _sl.s = s;
        seaLoopAt(_sl);
        const d = ((_sl.x - a.x) * (_sl.x - a.x)) + ((_sl.z - a.z) * (_sl.z - a.z));
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      a.tx = best;
      a.mode = 1;
      a.timer = 30;
    }
    a.x = (a.x + (tx - a.x) * Math.min(1, dt * 2));
    a.z = (a.z + (tz - a.z) * Math.min(1, dt * 2));
    a.y = (a.y + (ty - a.y) * Math.min(1, dt * 1.2));
    a.yaw = a.fa + (a.fw > 0 ? Math.PI / 2 : -Math.PI / 2);
    a.roll = a.fw > 0 ? -0.35 : 0.35;
    a.pitch = -Math.cos(t * 0.33 + a.slot * 1.7) * 0.15;
    const flapping = climb < 0.2 || Math.cos(t * 0.33 + a.slot * 1.7) > 0.3;
    a.flap = (a.flap + ((flapping ? 0.75 : 0.06) - a.flap) * Math.min(1, dt * 2));
    a.phase += dt * (flapping ? 6.5 : 2);
  } else {
    // the swoop: fly at the sea spot (moving along the coast while skimming)
    if (a.mode === 2) a.tx += 9 * dt;
    _sl.s = a.tx;
    seaLoopAt(_sl);
    tx = _sl.x;
    tz = _sl.z;
    const d = Math.sqrt((tx - a.x) * (tx - a.x) + (tz - a.z) * (tz - a.z));
    const want = Math.atan2(tx - a.x, tz - a.z);
    a.yaw += Math.min(dt * 1.2, Math.max(-dt * 1.2, ((want - a.yaw) - Math.round((want - a.yaw) / TAU) * TAU)));
    const sp = a.mode === 3 ? 10 : 14;
    a.x += Math.sin(a.yaw) * sp * dt;
    a.z += Math.cos(a.yaw) * sp * dt;
    if (a.mode === 1) {
      a.y = (a.y + ((d > 30 ? Math.max(14, a.y - dt * 6) : 1.6) - a.y) * Math.min(1, dt * (d > 30 ? 0.6 : 1.4)));
      a.pitch = (a.pitch + (0.35 - a.pitch) * Math.min(1, dt * 2));
      a.flap = (a.flap + (0.05 - a.flap) * Math.min(1, dt * 2));
      if (d < 6) {
        a.mode = 2;
        a.timer = 4.5;
      }
    } else if (a.mode === 2) {
      // (skimming, its beak in the water)
      a.y = (a.y + ((0.9 + Math.sin(t * 3) * 0.15) - a.y) * Math.min(1, dt * 3));
      a.pitch = (a.pitch + (0.1 - a.pitch) * Math.min(1, dt * 3));
      a.flap = (a.flap + (0.2 - a.flap) * Math.min(1, dt * 2));
      if (a.timer <= 0) {
        a.mode = 3;
        a.timer = 12;
      }
    } else {
      // (climbing back to its circle over the cliffs)
      const cx = a.fcx + Math.sin(a.fa) * a.fr;
      const cz = a.fcz + Math.cos(a.fa) * a.fr;
      a.yaw += Math.min(dt * 1.0, Math.max(-dt * 1.0, ((Math.atan2(cx - a.x, cz - a.z) - a.yaw) - Math.round((Math.atan2(cx - a.x, cz - a.z) - a.yaw) / TAU) * TAU)));
      a.y = (a.y + (a.fh - a.y) * Math.min(1, dt * 0.35));
      a.pitch = (a.pitch + (-0.3 - a.pitch) * Math.min(1, dt * 2));
      a.flap = (a.flap + (0.85 - a.flap) * Math.min(1, dt * 2));
      if (Math.sqrt((cx - a.x) * (cx - a.x) + (cz - a.z) * (cz - a.z)) < 14 || a.timer <= 0) {
        a.mode = 0;
        a.timer = 40 + rnd(a) * 60;
      }
    }
    a.roll = (a.roll + (0 - a.roll) * Math.min(1, dt * 2));
    a.phase += dt * (a.flap > 0.4 ? 6.5 : 2);
  }
  a.gait = 0;
  a.hy = Math.sin(t * 0.5 + a.slot) * 0.3;
  a.hp = a.mode === 2 ? -0.5 : 0;
  a.ears = 0;
}

function stepSwimmer(a: Animal, dt: number, t: number) {
  a.fa += a.fw * dt;
  _sl.s = a.fa;
  seaLoopAt(_sl);
  a.x = _sl.x;
  a.z = _sl.z;
  a.yaw = Math.atan2(_sl.dx, _sl.dz);
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
  if (dK < 30) a.hy = Math.min(0.8, Math.max(-0.8, ((Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw) - Math.round((Math.atan2(kid.x - a.x, kid.z - a.z) - a.yaw) / TAU) * TAU)));
}

/** the T-rex sub-state (for tests / the HUD) */
export const trexMode = (sim: DinoSim) => ["patrol", "display", "roar", "yawn", "nap", "wake", "drink"][sim.trex.mode];
/** the Rex Bridge (world): for the T-rex's manners and the tests */
export const DINO_REX_BRIDGE = REX_BRIDGE;
