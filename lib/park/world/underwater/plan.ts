// Where everything under the sea goes — pure maths, deterministic, no three.js (tested).
//
// The reef is a ring all round Cucaino Island on the real sea floor (lib/park/registry/terrain):
// sea grass meadows in the sandy lagoon, coral on the reef shelf, kelp along the drop-off. Four
// "reef gardens" are denser showpieces: the Sunken Galleon, the Sunken Temple, the Rainbow Reef
// and the Glow Kelp forest. Items are baked once (a jittered grid, seeded per cell so the result
// never depends on order) and bucketed into angular sectors round the island, so the engine only
// draws the sectors near the kid (the underwater fog hides the rest) — lots of reef for a small,
// fixed triangle budget.
import { coastR } from "../../registry/island";
import { WATER_Y, groundY } from "../../registry/terrain";
import { fbm2, noise2, rngOf, smoothstep } from "../fantasy/noise";
import { seaFloorY } from "../sea/wander";

// ── true size ──
// The Park kid is 2.26 units tall (a real ~1.4 m ten-year-old), so 1 m = UW_M = 1.6 units, and every
// sea creature is drawn at its real size x 1.6. Real nose-to-tail lengths (m) of the reef fish, by
// SPECIES index:
//   clownfish 0.11 · blue tang 0.3 · yellow tang 0.2 · purple anthias 0.12 · sardine 0.2 ·
//   parrotfish 0.9 (a big one) · grouper 1.8 (a giant / Queensland grouper) · butterflyfish 0.15 ·
//   emperor angelfish 0.35 · giant trevally (jack) 1.0
export const UW_M = 1.6;
export const FISH_TRUE_M: readonly number[] = [0.11, 0.3, 0.2, 0.12, 0.2, 0.9, 1.8, 0.15, 0.35, 1.0];
/** the fish model's length at size 1, per species (fishGeometry is 1.3 long, x FISH_SHAPE[sp][2]) */
export const FISH_MODEL_L: readonly number[] = [0.85, 1, 0.9, 1, 1.25, 1, 1, 0.78, 0.95, 1.15].map((z) => 1.3 * z);
/** the school `size` that draws a species at its true length */
export const fishSize = (sp: number) => (UW_M * FISH_TRUE_M[sp]) / FISH_MODEL_L[sp];
/** other sea life (real sizes, m; `model` = the model's size along the same measure at scale 1):
 *  scale = UW_M x real / model */
export const SEA_TRUE: Record<string, { real: number; model: number; what: string }> = {
  manta: { real: 5.5, model: 3.2, what: "wingspan: a giant manta, 5–7 m" },
  turtle: { real: 1.4, model: 2.64, what: "nose to tail: a green sea turtle, ~1.1 m shell" },
  ray: { real: 0.45, model: 1.0, what: "disc width: a blue-spotted stingray" },
  orca: { real: 7.5, model: 6.48, what: "length: a grown orca, 7–8 m (bull 8 m, cows 6.5 m, calf 2.7 m)" },
  jelly: { real: 0.6, model: 1.92, what: "bell width: jellyfish 0.3–1 m across the bell" },
  starfish: { real: 0.25, model: 1.1, what: "arm tip to arm tip" },
  urchin: { real: 0.3, model: 0.99, what: "across its spines" },
  seahorse: { real: 0.25, model: 0.79, what: "height: a big-bellied seahorse" },
  crab: { real: 0.3, model: 1.02, what: "claw tip to claw tip: a reef crab" },
};
export const seaK = (id: keyof typeof SEA_TRUE) => (UW_M * SEA_TRUE[id].real) / SEA_TRUE[id].model;

export const PEARL_COUNT = 15;
/** angular buckets round the island for streaming the reef */
export const SECTORS = 128;

/** metres past the grass line (the coast) — the terrain's sea floor is shaped by this */
export function seaD(x: number, z: number): number {
  return Math.hypot(x, z) - coastR(Math.atan2(x, z));
}

/** world x/z of a point `d` metres out to sea at angle `a` (a = atan2(x, z)) */
export function atSea(a: number, d: number, out: { x: number; z: number } = { x: 0, z: 0 }) {
  const r = coastR(a) + d;
  out.x = Math.sin(a) * r;
  out.z = Math.cos(a) * r;
  return out;
}

export function sectorOf(x: number, z: number, n = SECTORS): number {
  const a = Math.atan2(x, z); // -PI..PI
  const s = Math.floor(((a + Math.PI) / (Math.PI * 2)) * n);
  return ((s % n) + n) % n;
}

// ── reef gardens ──
export type GardenKind = "wreck" | "ruins" | "rainbow" | "glow";
export interface Garden {
  kind: GardenKind;
  /** angle round the island and metres out to sea */
  a: number;
  d: number;
  /** radius of the dense planting */
  r: number;
  x: number;
  z: number;
  /** sea floor at the centre */
  y: number;
}

function garden(kind: GardenKind, a: number, d: number, r: number, site?: { depth: number; flat: number }): Garden {
  if (site) {
    // landmarks need a flat-ish spot on the shelf, deep enough to stand tall in
    let best = { a, d, score: Infinity };
    for (let da = -0.08; da <= 0.0801; da += 0.01)
      for (let dd = 26; dd <= 35; dd += 1) {
        const p = atSea(a + da, dd);
        let lo = Infinity;
        let hi = -Infinity;
        let sum = 0;
        for (let k = 0; k < 9; k++) {
          const ang = (k / 8) * Math.PI * 2;
          const rr = k === 8 ? 0 : site.flat;
          const y = groundY(p.x + Math.sin(ang) * rr, p.z + Math.cos(ang) * rr);
          lo = Math.min(lo, y);
          hi = Math.max(hi, y);
          sum += y;
        }
        const score = Math.abs(sum / 9 - site.depth) * 2 + (hi - lo) * 0.4 + Math.abs(da) * 4;
        if (score < best.score) best = { a: a + da, d: dd, score };
      }
    a = best.a;
    d = best.d;
  }
  const p = atSea(a, d);
  return { kind, a, d, r, x: p.x, z: p.z, y: groundY(p.x, p.z) };
}

/** the four showpiece gardens. The galleon is just off the Park Gate's beach (south). */
export const GARDENS: Garden[] = [
  garden("wreck", 0.2, 30, 24, { depth: -7, flat: 5 }),
  garden("rainbow", 1.75, 27, 24),
  garden("glow", 3.35, 35, 26),
  garden("ruins", -1.7, 33, 24, { depth: -7.4, flat: 6 }),
];
export const gardenOf = (kind: GardenKind) => GARDENS.find((g) => g.kind === kind)!;

/** 0 outside every garden .. 1 at a garden's heart */
export function gardenBoost(x: number, z: number, kind?: GardenKind): number {
  let b = 0;
  for (const g of GARDENS) {
    if (kind && g.kind !== kind) continue;
    const d = Math.hypot(x - g.x, z - g.z);
    b = Math.max(b, 1 - smoothstep(g.r * 0.45, g.r, d));
  }
  return b;
}

// ── landmarks (placed in their gardens; reef items keep clear of their footprints) ──
export interface Landmark {
  x: number;
  y: number;
  z: number;
  /** heading (radians about +Y) */
  rot: number;
}
/** the galleon lies across the shelf, bow pointing along the coast */
export const WRECK: Landmark = (() => {
  const g = gardenOf("wreck");
  const x = g.x;
  const z = g.z;
  return { x, y: groundY(x, z), z, rot: g.a + Math.PI / 2 + 0.35 };
})();
/** the treasure chest spilled beside the hull */
export const CHEST: Landmark = (() => {
  const off = localToWorld(WRECK, 4.6, -1.5);
  return { x: off.x, y: groundY(off.x, off.z), z: off.z, rot: WRECK.rot - 0.6 };
})();
/** the sunken temple (a ring of columns on a stepped platform + an arch gate) */
export const TEMPLE: Landmark = (() => {
  const g = gardenOf("ruins");
  // sit it a little into the floor on its high side (half-buried, never floating)
  let lo = Infinity;
  for (let k = 0; k < 12; k++) lo = Math.min(lo, groundY(g.x + Math.sin(k * 0.52) * 5, g.z + Math.cos(k * 0.52) * 5));
  return { x: g.x, y: (groundY(g.x, g.z) + lo) / 2, z: g.z, rot: g.a + Math.PI };
})();

/** a point (right, forward) metres in a landmark's own frame -> world x/z */
export function localToWorld(l: { x: number; z: number; rot: number }, right: number, fwd: number) {
  const s = Math.sin(l.rot);
  const c = Math.cos(l.rot);
  // forward = (sin rot, cos rot), right = (cos rot, -sin rot)
  return { x: l.x + s * fwd + c * right, z: l.z + c * fwd - s * right };
}

/** circles (x, z, r) that coral must keep clear of */
export const FOOTPRINTS: { x: number; z: number; r: number }[] = [
  ...[-5, -1.7, 1.7, 5].map((f) => {
    const p = localToWorld(WRECK, 0, f);
    return { x: p.x, z: p.z, r: 3.2 };
  }),
  { x: CHEST.x, z: CHEST.z, r: 2.6 },
  { x: TEMPLE.x, z: TEMPLE.z, r: 9 },
  { ...localToWorld(TEMPLE, 10.5, 0), r: 3.2 },
];
const inFootprint = (x: number, z: number, pad = 0) => FOOTPRINTS.some((f) => (x - f.x) ** 2 + (z - f.z) ** 2 < (f.r + pad) ** 2);

// ── pearls in giant clams ──
export interface Pearl {
  id: number;
  x: number;
  y: number;
  z: number;
  /** clam heading */
  rot: number;
  /** clam size */
  s: number;
}
export const PEARL_Y = 0.44; // pearl centre above the clam's base

function planPearls(): Pearl[] {
  const r = rngOf(1515);
  const spots: [number, number][] = [];
  const push = (x: number, z: number) => spots.push([x, z]);
  // the galleon: one right by the treasure chest, one under the bow, one by the stern, one on the reef
  const w = (right: number, fwd: number) => localToWorld(WRECK, right, fwd);
  for (const [rt, fw] of [
    [6.4, -3.2],
    [-3.8, 6.8],
    [3.6, -7.4],
    [-7.5, -2.2],
  ] as const) {
    const p = w(rt, fw);
    push(p.x, p.z);
  }
  // the temple: at the altar, under the arch, and two among fallen columns
  const tp = (right: number, fwd: number) => localToWorld(TEMPLE, right, fwd);
  for (const [rt, fw] of [
    [0, 1.6],
    [10.5, 0],
    [-8.5, -5.5],
    [-7, 6.5],
  ] as const) {
    const p = tp(rt, fw);
    push(p.x, p.z);
  }
  // the rainbow reef and the glow kelp forest: scattered round the garden
  for (const [kind, n] of [
    ["rainbow", 4],
    ["glow", 3],
  ] as const) {
    const g = gardenOf(kind);
    for (let i = 0; i < n; i++) {
      const a = g.a + ((i + 0.5) / n - 0.5) * (g.r * 1.4) / (coastR(g.a) + g.d) + (r() - 0.5) * 0.01;
      const d = g.d - (kind === "glow" ? 7 : 0) + (i % 2 ? 4 : -4) + (r() - 0.5) * 3;
      const p = atSea(a, d);
      push(p.x, p.z);
    }
  }
  return spots.map(([x, z], id) => ({ id, x, z, y: groundY(x, z), rot: r() * Math.PI * 2, s: 1.05 + r() * 0.25 }));
}
export const PEARLS: Pearl[] = planPearls();

// ── the reef items ──
export const REEF_KINDS = ["staghorn", "brain", "table", "fan", "tube", "anemone", "seagrass", "kelp", "rock", "starfish", "urchin", "bush", "seahorse", "octopus", "eel", "crab"] as const;
export type ReefKind = (typeof REEF_KINDS)[number];

interface KindRule {
  /** band (metres past the coast) */
  d0: number;
  d1: number;
  /** items per m² outside gardens, and the multiplier at a garden's heart */
  dens: number;
  garden: number;
  /** patchiness: noise scale (m) and how clumpy (0 even .. 1 very patchy) */
  patch: number;
  clump: number;
  /** size range */
  s0: number;
  s1: number;
  /** keep this far from landmark footprints */
  pad: number;
  /** fraction that glow at twilight */
  glow: number;
  /** capacity (max drawn at once, standard quality) */
  cap: number;
}

// The whole shelf ring is one packed coral garden (the four showpiece gardens are denser still):
// towering staghorn thickets, big brain corals, huge sea fans, giant anemones, finger-coral bushes,
// sponges, coralline rocks; sea grass meadows (with seahorses) in the lagoon; octopuses and moray
// eels peeking from holes, crabs scuttling. Densities are high on purpose: `cap` is the budget,
// and fillWindow takes the sectors nearest the kid first, so the far edge is what gives.
export const RULES: Record<ReefKind, KindRule> = {
  staghorn: { d0: 15, d1: 42, dens: 0.05, garden: 3.2, patch: 14, clump: 0.55, s0: 1.1, s1: 2.9, pad: 0.5, glow: 0.5, cap: 130 },
  brain: { d0: 15, d1: 40, dens: 0.03, garden: 2.5, patch: 16, clump: 0.45, s0: 0.9, s1: 2.5, pad: 0.5, glow: 0.1, cap: 100 },
  table: { d0: 20, d1: 41, dens: 0.012, garden: 2.5, patch: 16, clump: 0.5, s0: 1.0, s1: 2.2, pad: 0.9, glow: 0.3, cap: 42 },
  fan: { d0: 20, d1: 44, dens: 0.035, garden: 2.5, patch: 12, clump: 0.5, s0: 1.3, s1: 3.0, pad: 0.5, glow: 0.45, cap: 115 },
  tube: { d0: 17, d1: 43, dens: 0.022, garden: 2.5, patch: 12, clump: 0.6, s0: 1.0, s1: 2.1, pad: 0.5, glow: 0.5, cap: 56 },
  anemone: { d0: 13, d1: 38, dens: 0.014, garden: 3, patch: 10, clump: 0.7, s0: 1.1, s1: 2.2, pad: 0.4, glow: 0.7, cap: 46 },
  seagrass: { d0: 8, d1: 26, dens: 0.7, garden: 1.2, patch: 16, clump: 0.85, s0: 1.0, s1: 2.0, pad: 0.2, glow: 0, cap: 360 },
  kelp: { d0: 31, d1: 45, dens: 0.012, garden: 5, patch: 20, clump: 0.8, s0: 0.65, s1: 0.95, pad: 1.2, glow: 0.3, cap: 50 },
  rock: { d0: 11, d1: 46, dens: 0.02, garden: 1.5, patch: 20, clump: 0.5, s0: 0.8, s1: 2.3, pad: 0.8, glow: 0, cap: 96 },
  starfish: { d0: 10, d1: 40, dens: 0.02, garden: 2, patch: 12, clump: 0.5, s0: +(seaK("starfish") * 0.720).toFixed(3), s1: +(seaK("starfish") * 1.280).toFixed(3), pad: 0.1, glow: 0.2, cap: 64 },
  urchin: { d0: 14, d1: 40, dens: 0.01, garden: 2, patch: 10, clump: 0.7, s0: +(seaK("urchin") * 0.706).toFixed(3), s1: +(seaK("urchin") * 1.294).toFixed(3), pad: 0.3, glow: 0.5, cap: 36 },
  bush: { d0: 15, d1: 40, dens: 0.03, garden: 2.5, patch: 12, clump: 0.6, s0: 0.9, s1: 2.2, pad: 0.4, glow: 0.4, cap: 100 },
  seahorse: { d0: 10, d1: 26, dens: 0.006, garden: 1, patch: 16, clump: 0.85, s0: +(seaK("seahorse") * 0.810).toFixed(3), s1: +(seaK("seahorse") * 1.190).toFixed(3), pad: 0.2, glow: 0.3, cap: 14 },
  octopus: { d0: 18, d1: 40, dens: 0.0035, garden: 2, patch: 10, clump: 0.5, s0: 0.9, s1: 1.4, pad: 0.8, glow: 0.2, cap: 8 },
  eel: { d0: 18, d1: 42, dens: 0.004, garden: 2, patch: 10, clump: 0.5, s0: 0.9, s1: 1.3, pad: 0.8, glow: 0, cap: 10 },
  crab: { d0: 12, d1: 40, dens: 0.008, garden: 1.5, patch: 10, clump: 0.5, s0: +(seaK("crab") * 0.762).toFixed(3), s1: +(seaK("crab") * 1.238).toFixed(3), pad: 0.3, glow: 0, cap: 24 },
};

/** roughly how tall each kind stands at scale 1 (m); 0 = not limited (kelp reaches for the surface) */
export const ITEM_HEIGHT: Record<ReefKind, number> = {
  staghorn: 1.35,
  brain: 0.75,
  table: 0.75,
  fan: 1.7,
  tube: 1.15,
  anemone: 1.15,
  seagrass: 1.1,
  kelp: 0,
  rock: 1.0,
  starfish: 0,
  urchin: 0,
  bush: 1.0,
  seahorse: 0,
  octopus: 0,
  eel: 0,
  crab: 0,
};

export interface ReefItem {
  x: number;
  y: number;
  z: number;
  s: number;
  rot: number;
  /** lean (radians) and which way */
  tilt: number;
  tiltDir: number;
  /** 0..1 picks the colour from the kind's palette */
  hue: number;
  /** 0 = never glows .. 1 (bioluminescent at twilight) */
  glow: number;
  sector: number;
}

export interface ReefPlan {
  /** per kind, items sorted by sector */
  items: Record<ReefKind, ReefItem[]>;
  /** per kind, index of the first item in each sector (length SECTORS + 1) */
  starts: Record<ReefKind, Int32Array>;
  /** per kind, how many instances the mesh needs (max over all windows, clamped to the cap) */
  capacity: Record<ReefKind, number>;
  /** how many sectors either side of the kid's sector are drawn */
  half: number;
}

const CELL = 2;
function cellSeed(i: number, j: number, k: number) {
  let h = (i * 73856093) ^ (j * 19349663) ^ (k * 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0 || 1;
}

/** how many of `kind` per m² at (x, z), `d` metres out */
export function reefDensity(kind: ReefKind, x: number, z: number, d: number): number {
  const R = RULES[kind];
  const edge = smoothstep(R.d0, R.d0 + 3, d) * (1 - smoothstep(R.d1 - 3, R.d1, d));
  if (edge <= 0) return 0;
  // (seahorses live in the sea grass meadows: they share its patches)
  const ki = REEF_KINDS.indexOf(kind === "seahorse" ? "seagrass" : kind);
  const n = fbm2(x / R.patch + ki * 7.1, z / R.patch - ki * 3.3, 3, 40 + ki);
  const patch = Math.max(0, 1 - R.clump + R.clump * smoothstep(0.35, 0.68, n) * 2);
  let boost = 1 + (R.garden - 1) * gardenBoost(x, z);
  // the glow garden is a kelp forest; the rainbow reef is all coral
  if (kind === "kelp") boost *= 1 + 2.5 * gardenBoost(x, z, "glow") - 0.8 * gardenBoost(x, z, "rainbow");
  if (kind === "seagrass" || kind === "seahorse") boost *= 1 - 0.7 * gardenBoost(x, z);
  // coral loves the mounds; sea grass the flat sand
  const y = groundY(x, z);
  const mound = kind === "seagrass" || kind === "seahorse" || kind === "kelp" || kind === "rock" || kind === "crab" ? 1 : 0.6 + 0.8 * smoothstep(-8, -4.5, y);
  return R.dens * edge * patch * boost * mound;
}

export function planReef(opts: { lowQuality?: boolean } = {}): ReefPlan {
  const low = !!opts.lowQuality;
  const items = Object.fromEntries(REEF_KINDS.map((k) => [k, [] as ReefItem[]])) as Record<ReefKind, ReefItem[]>;
  const E = 208;
  const n = Math.ceil((E * 2) / CELL);
  const dScale = low ? 0.55 : 1;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const cx = -E + (i + 0.5) * CELL;
      const cz = -E + (j + 0.5) * CELL;
      const cd = seaD(cx, cz);
      if (cd < 8 || cd > 47) continue;
      REEF_KINDS.forEach((kind, ki) => {
        const R = RULES[kind];
        if (cd < R.d0 - 2 || cd > R.d1 + 2) return;
        const lam = reefDensity(kind, cx, cz, cd) * CELL * CELL * dScale;
        if (lam <= 0) return;
        const r = rngOf(cellSeed(i, j, ki + 1));
        let count = Math.floor(lam);
        if (r() < lam - count) count++;
        for (let c = 0; c < count; c++) {
          const x = cx + (r() - 0.5) * CELL;
          const z = cz + (r() - 0.5) * CELL;
          const d = seaD(x, z);
          if (d < R.d0 || d > R.d1) continue;
          if (inFootprint(x, z, R.pad)) continue;
          if (PEARLS.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 1.6 * 1.6)) continue;
          const y = groundY(x, z);
          if (y > WATER_Y - 1) continue;
          const g = gardenBoost(x, z);
          let s = (R.s0 + (R.s1 - R.s0) * Math.pow(r(), 1.3)) * (1 + g * 0.25);
          // tall coral stays ~2.4 m under the surface: room to swim (and for the camera) over it
          const H = ITEM_HEIGHT[kind];
          if (H > 0) s = Math.min(s, Math.max(R.s0 * 0.7, (WATER_Y - 2.4 - y) / H));
          // the Glow Kelp forest is the bioluminescent showpiece: most things there glow at twilight
          const glowP = R.glow + g * 0.15 + (R.glow > 0 ? gardenBoost(x, z, "glow") * 0.6 : 0);
          items[kind].push({ x, y, z, s, rot: r() * Math.PI * 2, tilt: r() * 0.22, tiltDir: r() * Math.PI * 2, hue: r(), glow: r() < glowP ? 0.6 + r() * 0.4 : 0, sector: sectorOf(x, z) });
        }
      });
    }
  }
  // sectors drawn either side of the kid's (~9 m of reef each at the shelf): the water is clear
  // for ~85 m now, so the window reaches that far (capacity fills nearest-first)
  const half = low ? 6 : 9;
  const starts = {} as Record<ReefKind, Int32Array>;
  const capacity = {} as Record<ReefKind, number>;
  for (const kind of REEF_KINDS) {
    const list = items[kind];
    list.sort((a, b) => a.sector - b.sector);
    const st = new Int32Array(SECTORS + 1);
    let k = 0;
    for (let s = 0; s <= SECTORS; s++) {
      while (k < list.length && list[k].sector < s) k++;
      st[s] = k;
    }
    starts[kind] = st;
    let max = 0;
    for (let s = 0; s < SECTORS; s++) max = Math.max(max, windowCount(st, s, half));
    const cap = low ? Math.ceil(RULES[kind].cap / 2) : RULES[kind].cap;
    capacity[kind] = Math.max(1, Math.min(cap, max));
  }
  return { items, starts, capacity, half };
}

/** items in the window of sectors [centre - half, centre + half] (wrapping) */
export function windowCount(starts: Int32Array, centre: number, half: number): number {
  let n = 0;
  for (let k = -half; k <= half; k++) {
    const s = (((centre + k) % SECTORS) + SECTORS) % SECTORS;
    n += starts[s + 1] - starts[s];
  }
  return n;
}

/**
 * Visit the items of a window nearest-sector-first (centre, +1, -1, +2, -2 ...) until `cap` are
 * taken — so if a window is over budget it is the far edge that drops out (hidden by fog anyway).
 * Calls `fn(itemIndex, slot)`; returns how many were taken. Allocation-free.
 */
export function fillWindow(starts: Int32Array, centre: number, half: number, cap: number, fn: (index: number, slot: number) => void): number {
  let slot = 0;
  for (let k = 0; k <= half * 2 && slot < cap; k++) {
    const off = k === 0 ? 0 : k % 2 ? (k + 1) / 2 : -k / 2;
    const s = (((centre + off) % SECTORS) + SECTORS) % SECTORS;
    for (let i = starts[s]; i < starts[s + 1] && slot < cap; i++) fn(i, slot++);
  }
  return slot;
}

// ── fish schools ──
export const SPECIES = { clown: 0, blueTang: 1, yellowTang: 2, anthias: 3, sardine: 4, parrot: 5, grouper: 6, butterfly: 7, angel: 8, jack: 9 } as const;
/** reef fish a roaming school may turn out to be (re-rolled each time it turns up near the kid) */
export const REEF_POOL: readonly number[] = [SPECIES.yellowTang, SPECIES.blueTang, SPECIES.butterfly, SPECIES.yellowTang, SPECIES.anthias, SPECIES.blueTang];
export interface SchoolDef {
  species: number;
  n: number;
  /** home (the school roams round it) */
  ax: number;
  ay: number;
  az: number;
  /** how far it roams (its leash is ~2.4x this) */
  rad: number;
  /** formation half-size (along, up, across) */
  spread: [number, number, number];
  /** (legacy) path speed — schools now roam freely (../sea/wander.ts) */
  speed: number;
  /** fish size (metres, nose to tail) */
  size: number;
  /** a swirling bait ball instead of a streaming school */
  bait?: boolean;
  /** the "near you" school: its home drifts after the kid so there are always fish about
   *  (it turns up again ahead when left behind: a reef species over the reef, silver fish over the deep) */
  follow?: boolean;
  /** little fish that swarm round the kid wherever they swim */
  buddy?: boolean;
  /** drawn with the cheap small-fish mesh (bait balls, anthias clouds) */
  small?: boolean;
  ph: number;
}

/** a comfy swimming height at (x, z): between the floor and the surface */
export function midWater(x: number, z: number, frac = 0.4, minAbove = 1.6): number {
  const floor = seaFloorY(x, z);
  const top = WATER_Y - 1.2;
  return Math.min(top, Math.max(floor + minAbove, floor + (top - floor) * frac));
}

export function planSchools(opts: { lowQuality?: boolean } = {}): SchoolDef[] {
  const low = !!opts.lowQuality;
  const r = rngOf(777);
  const out: SchoolDef[] = [];
  /** `frac` = how far up the water column (0 floor .. 1 surface), `above` = min height over the floor */
  const add = (species: number, n: number, x: number, z: number, o: Partial<SchoolDef> & { frac?: number; above?: number } = {}) => {
    const { frac = 0.4, above = 1.6, ...rest } = o;
    const nn = Math.max(1, Math.round(low ? n / 2 : n));
    out.push({ species, n: nn, ax: x, ay: midWater(x, z, frac, above), az: z, rad: 5, spread: [2.2, 0.9, 1.6], speed: 0.12, size: 0.55, ph: r() * 10, ...rest });
  };
  const around = (g: Garden, right: number, fwd: number) => localToWorld({ x: g.x, z: g.z, rot: g.a }, right, fwd);
  const W = gardenOf("wreck");
  const Rb = gardenOf("rainbow");
  const Gl = gardenOf("glow");
  const Ru = gardenOf("ruins");
  // the galleon: clownfish at the anemones, a big yellow tang school over the deck, blue tangs,
  // butterflyfish picking at the hull
  for (const a of HERO_ANEMONES.slice(0, 2)) add(SPECIES.clown, 6, a.x, a.z, { rad: 0.5, spread: [0.6, 0.35, 0.6], speed: 0.4, size: fishSize(SPECIES.clown), frac: 0, above: 1.7 });
  add(SPECIES.yellowTang, 34, W.x, W.z, { rad: 7, spread: [2.8, 1.1, 2.1], speed: 0.09, size: fishSize(SPECIES.yellowTang) });
  let p = around(W, 8, -8);
  add(SPECIES.blueTang, 28, p.x, p.z, { rad: 8, spread: [3, 1.1, 2.3], speed: 0.1, size: fishSize(SPECIES.blueTang) });
  p = around(W, -6, 7);
  add(SPECIES.butterfly, 12, p.x, p.z, { rad: 5, spread: [1.8, 0.7, 1.4], speed: 0.08, size: fishSize(SPECIES.butterfly) });
  // the temple: a big cloud of purple anthias over the columns, blue tangs through the arch,
  // a few emperor angelfish
  add(SPECIES.anthias, 70, Ru.x, Ru.z, { rad: 6, spread: [4.6, 2, 3.8], speed: 0.07, size: fishSize(SPECIES.anthias), frac: 0.5, small: true });
  p = around(Ru, -6, 9);
  add(SPECIES.blueTang, 26, p.x, p.z, { rad: 7, spread: [2.8, 1.1, 2.1], speed: 0.11, size: fishSize(SPECIES.blueTang) });
  p = around(Ru, 6, 6);
  add(SPECIES.angel, 6, p.x, p.z, { rad: 5, spread: [1.6, 0.6, 1.2], speed: 0.06, size: fishSize(SPECIES.angel) });
  // the rainbow reef: a huge glittering sardine bait ball, yellow tangs, butterflyfish, angels,
  // clownfish
  p = around(Rb, 0, 12);
  add(SPECIES.sardine, 180, p.x, p.z, { rad: 2.5, spread: [3.2, 2.4, 3.2], speed: 0.05, size: fishSize(SPECIES.sardine), bait: true, frac: 0.55, above: 3.5, small: true });
  p = around(Rb, -7, 4);
  add(SPECIES.yellowTang, 30, p.x, p.z, { rad: 7, spread: [2.6, 1, 2], speed: 0.1, size: fishSize(SPECIES.yellowTang) });
  p = around(Rb, 8, 7);
  add(SPECIES.butterfly, 14, p.x, p.z, { rad: 6, spread: [2, 0.8, 1.6], speed: 0.08, size: fishSize(SPECIES.butterfly) });
  p = around(Rb, -3, 6);
  add(SPECIES.angel, 6, p.x, p.z, { rad: 5, spread: [1.6, 0.6, 1.2], speed: 0.06, size: fishSize(SPECIES.angel) });
  for (const a of HERO_ANEMONES.slice(2)) add(SPECIES.clown, 5, a.x, a.z, { rad: 0.5, spread: [0.6, 0.35, 0.6], speed: 0.4, size: fishSize(SPECIES.clown), frac: 0, above: 1.7 });
  // the glow kelp forest: anthias weaving between the strands
  add(SPECIES.anthias, 56, Gl.x, Gl.z, { rad: 9, spread: [3.6, 1.8, 3], speed: 0.06, size: fishSize(SPECIES.anthias), frac: 0.45, small: true });
  // schools that keep near the kid, wherever they swim: each turns up again ahead when left behind
  // (a reef species over the reef, silver jacks and sardines out over the deep: ../underwater/index.ts)
  add(SPECIES.blueTang, 28, W.x, W.z, { rad: 6, spread: [2.8, 1.1, 2.1], speed: 0.12, size: fishSize(SPECIES.blueTang), follow: true });
  add(SPECIES.yellowTang, 24, W.x, W.z, { rad: 6, spread: [2.5, 1, 1.9], speed: 0.14, size: fishSize(SPECIES.yellowTang), follow: true, ph: 3 });
  for (let i = 0; i < 4; i++) add(REEF_POOL[(i * 2 + 2) % REEF_POOL.length], 22, W.x, W.z, { rad: 6, spread: [2.6, 1, 2], speed: 0.12, size: fishSize(REEF_POOL[(i * 2 + 2) % REEF_POOL.length]), follow: true, ph: 5 + i });
  add(SPECIES.angel, 8, W.x, W.z, { rad: 6, spread: [2, 0.8, 1.6], speed: 0.1, size: fishSize(SPECIES.angel), follow: true, ph: 9 });
  // a travelling bait ball (sardines; it follows the kid too, and turns up over reef and deep alike)
  add(SPECIES.sardine, 140, W.x, W.z, { rad: 2.5, spread: [3, 2.2, 3], speed: 0.05, size: fishSize(SPECIES.sardine), bait: true, follow: true, small: true, frac: 0.55, above: 3 });
  // little fish that swarm round the kid
  add(SPECIES.anthias, 28, W.x, W.z, { rad: 1, spread: [2.4, 1.1, 2.4], speed: 0.2, size: fishSize(SPECIES.anthias), buddy: true, small: true });
  // big fish: groupers lurk by the wreck and temple, parrotfish graze the gardens
  const big: [number, Garden, number, number][] = [
    [SPECIES.grouper, W, -5, 4],
    [SPECIES.grouper, Ru, 7, 2],
    [SPECIES.parrot, Rb, 6, 6],
    [SPECIES.parrot, Rb, -8, -2],
    [SPECIES.parrot, W, 7, 5],
    [SPECIES.grouper, Gl, 2, -5],
    [SPECIES.parrot, Ru, -8, -8],
    [SPECIES.parrot, Gl, -6, 4],
    [SPECIES.parrot, W, -9, -6],
    [SPECIES.parrot, Rb, 2, -9],
    [SPECIES.grouper, Rb, -4, 10],
    [SPECIES.parrot, Ru, 9, 7],
  ];
  big.slice(0, low ? 6 : 12).forEach(([sp, g, rt, fw]) => {
    const q = around(g, rt, fw);
    out.push({ species: sp, n: 1, ax: q.x, ay: midWater(q.x, q.z, 0.2), az: q.z, rad: 6, spread: [0, 0, 0], speed: 0.05 + r() * 0.03, size: fishSize(sp), ph: r() * 10 });
  });
  return out;
}

/** big anemones with resident clownfish (always drawn: they're part of the landmark set) */
export const HERO_ANEMONES: { x: number; y: number; z: number; s: number }[] = (() => {
  const w = [localToWorld(WRECK, 6.0, 5.8), localToWorld(WRECK, -5.4, -6.5)];
  const g = gardenOf("rainbow");
  const rb = [localToWorld({ x: g.x, z: g.z, rot: g.a }, 4, -6), localToWorld({ x: g.x, z: g.z, rot: g.a }, -9, 4)];
  return [...w, ...rb].map((p) => ({ x: p.x, z: p.z, y: groundY(p.x, p.z), s: 1.9 }));
})();

// ── motion maths (allocation-free: callers pass `out`) ──
export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** keep y inside the water: above the sea floor and below the surface by `margin` */
export function clampWater(x: number, z: number, y: number, margin: number): number {
  const floor = seaFloorY(x, z) + margin;
  const top = WATER_Y - 0.6 - margin * 0.5;
  if (floor >= top) return (floor + top) / 2;
  return Math.min(top, Math.max(floor, y));
}

/**
 * Push a point away from the kid: inside `radius` it's shoved out to the radius (fish scatter).
 * Writes the displacement into `out` and returns 0..1 (how scared).
 */
export function avoidKid(px: number, py: number, pz: number, kid: V3, radius: number, out: V3): number {
  const dx = px - kid.x;
  const dy = (py - kid.y) * 1.4;
  const dz = pz - kid.z;
  const d = Math.hypot(dx, dy, dz);
  out.x = out.y = out.z = 0;
  if (d >= radius) return 0;
  const k = 1 - d / radius;
  const inv = d > 1e-4 ? 1 / d : 0;
  const push = (radius - d) * (0.6 + k * 0.8);
  out.x = (d > 1e-4 ? dx * inv : 1) * push;
  out.y = dy * inv * push * 0.4;
  out.z = dz * inv * push;
  return k;
}

/**
 * One fish chasing its target: a damped spring with a speed limit. p, v are flat arrays (n*3).
 * Returns the fish's speed.
 */
export function stepFish(p: Float32Array, v: Float32Array, i: number, tx: number, ty: number, tz: number, dt: number, stiff: number, maxSpeed: number): number {
  const k = i * 3;
  const damp = 2 * Math.sqrt(stiff);
  let vx = v[k] + ((tx - p[k]) * stiff - v[k] * damp) * dt;
  let vy = v[k + 1] + ((ty - p[k + 1]) * stiff - v[k + 1] * damp) * dt;
  let vz = v[k + 2] + ((tz - p[k + 2]) * stiff - v[k + 2] * damp) * dt;
  const sp = Math.hypot(vx, vy, vz);
  if (sp > maxSpeed) {
    const f = maxSpeed / sp;
    vx *= f;
    vy *= f;
    vz *= f;
  }
  v[k] = vx;
  v[k + 1] = vy;
  v[k + 2] = vz;
  p[k] += vx * dt;
  p[k + 1] += vy * dt;
  p[k + 2] += vz * dt;
  return Math.min(sp, maxSpeed);
}

// ── jellyfish blooms ──
export interface JellyDef {
  x: number;
  y: number;
  z: number;
  s: number;
  ph: number;
  hue: number;
  follow: boolean;
}
export function planJellies(n: number): JellyDef[] {
  const r = rngOf(3030);
  const out: JellyDef[] = [];
  // a big bloom in the glow kelp forest, some over the other gardens, a few that drift near the kid
  const share: [GardenKind | "follow", number][] = [
    ["glow", 0.4],
    ["ruins", 0.15],
    ["wreck", 0.15],
    ["rainbow", 0.1],
    ["follow", 0.2],
  ];
  let made = 0;
  share.forEach(([kind, f], si) => {
    const k = si === share.length - 1 ? n - made : Math.round(n * f);
    for (let i = 0; i < k; i++, made++) {
      let x: number;
      let z: number;
      if (kind === "follow") {
        const a = r() * Math.PI * 2;
        const p = atSea(a, 40 + r() * 20);
        x = p.x;
        z = p.z;
      } else {
        const g = gardenOf(kind);
        const a = g.a + (r() - 0.5) * (g.r * 2.2) / (coastR(g.a) + g.d);
        const p = atSea(a, g.d + (r() - 0.3) * 22);
        x = p.x;
        z = p.z;
      }
      const y = midWater(x, z, 0.35 + r() * 0.5, 2.5);
      // (bells 0.3–0.9 m across: true size)
      out.push({ x, y, z, s: seaK("jelly") * (0.5 + r() * 1.0), ph: r() * 10, hue: r(), follow: kind === "follow" });
    }
  });
  return out;
}

/** bubble vents: by the galleon, the chest, the temple and on rocks round the gardens */
export function planVents(n: number): V3[] {
  const r = rngOf(9191);
  const out: V3[] = [];
  const fixed = [localToWorld(WRECK, -1, -5.5), { x: CHEST.x, z: CHEST.z }, localToWorld(TEMPLE, 0, 1.6), localToWorld(TEMPLE, 5, 5)];
  for (const p of fixed) out.push({ x: p.x, y: groundY(p.x, p.z), z: p.z });
  while (out.length < n) {
    const g = GARDENS[out.length % GARDENS.length];
    const a = g.a + (r() - 0.5) * (g.r * 2) / (coastR(g.a) + g.d);
    const p = atSea(a, g.d + (r() - 0.5) * 16);
    out.push({ x: p.x, y: groundY(p.x, p.z), z: p.z });
  }
  return out;
}

/** tileable caustic brightness field (n x n, 0..255): soft cell edges of a jittered Voronoi */
export function causticField(n: number, cells: number, seed: number): Uint8Array {
  const r = rngOf(seed);
  const px = new Float32Array(cells * cells);
  const pz = new Float32Array(cells * cells);
  for (let i = 0; i < cells * cells; i++) {
    px[i] = 0.15 + r() * 0.7;
    pz[i] = 0.15 + r() * 0.7;
  }
  const out = new Uint8Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const u = (i / n) * cells;
      const v = (j / n) * cells;
      const ci = Math.floor(u);
      const cj = Math.floor(v);
      let f1 = 9;
      let f2 = 9;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const gi = ci + di;
          const gj = cj + dj;
          const wi = ((gi % cells) + cells) % cells;
          const wj = ((gj % cells) + cells) % cells;
          const k = wj * cells + wi;
          const d = Math.hypot(gi + px[k] - u, gj + pz[k] - v);
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) f2 = d;
        }
      const e = f2 - f1; // 0 on the cell edges
      const val = Math.pow(Math.max(0, 1 - e / 0.42), 3.2);
      out[j * n + i] = Math.round(Math.min(1, val) * 255);
    }
  return out;
}

/** small helper for geometry noise shared with the builder */
export const reefNoise = noise2;
