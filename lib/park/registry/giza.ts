// The Giza Plateau: the three great pyramids of Khufu, Khafre and Menkaure, their queens'
// pyramids, the Great Sphinx in its carved enclosure, the temples, the causeways and the rows of
// mastaba tombs, laid out at HALF their real size (GIZA_SCALE) on one shared scale — every
// position, base, height and slope below is the real monument's, from survey, so the whole complex
// keeps its true proportions and its true plan (the famous diagonal line of the three pyramids,
// the Sphinx below them to the east, the causeway running down to it).
//
// The real numbers (metres; "east" and "south" from the centre of the Great Pyramid):
//
//   Khufu      base 230.3 square     146.6 m tall when built, 138.5 m today    51°50′ faces
//   Khafre     base 215.3 square     143.5 m built, 136.4 m today              53°10′ faces
//              stands on bedrock ~10 m higher; still wears its smooth casing near the top
//   Menkaure   base 102.2 × 104.6    65.5 m built, 61 m today                  51°20′ faces
//              lower courses cased in red granite; a great gash cut in its north face (1196)
//   Sphinx     73.5 m long, 19 m wide, 20 m high, facing due east, carved from the bedrock
//
// Plan positions from the monuments' own latitude/longitude (Khufu 29.9792°N 31.1342°E, Khafre
// 29.9761°N 31.1308°E, Menkaure 29.9725°N 31.1283°E, the Sphinx 29.9753°N 31.1378°E).
//
// World axes here: +x is EAST, +z is SOUTH (north is -z — the map's own north-up).
//
// Pure data + maths, deterministic, no three.js. The pyramids, the Sphinx and every building are
// drawn by world/gizaDecor.ts; the plateau's ground is registry/terrain.ts's finish() via
// gizaGroundY(); the solid monuments are ground (worldFloorY via gizaSolidY) the kid can't walk up.
import { smoothstep } from "./geom2d";
import { seaDist } from "./island";

/** the whole complex at half its real size: 1 world unit = 2 real metres */
export const GIZA_SCALE = 0.5;
const S = GIZA_SCALE;

/** the centre of the Great Pyramid's base. Frozen (the settlement-site discipline, CLAUDE.md):
 *  found by a search for a flat, empty stretch big enough for the whole plan — clear of the sea,
 *  water, rails, roads, footpaths, settlements and Mount Everest — and re-checked by giza.test.ts */
export const GIZA_ORIGIN = { x: 2070, z: -1500 };
/** the height of the Great Pyramid's own base (the plateau's level round it) */
export const GIZA_PLATEAU_Y = 24;

/** real metres east/south of the Great Pyramid -> world (x, z) */
export function gizaWorld(east: number, south: number): { x: number; z: number } {
  return { x: GIZA_ORIGIN.x + east * S, z: GIZA_ORIGIN.z + south * S };
}
/** world (x, z) -> real metres east/south of the Great Pyramid */
export function gizaLocal(x: number, z: number): { e: number; s: number } {
  return { e: (x - GIZA_ORIGIN.x) / S, s: (z - GIZA_ORIGIN.z) / S };
}

// ── the plateau's own shape (real metres, relative to Khufu's base) ──
// The pyramids stand on a limestone shelf; Khafre's own bedrock is ~10 m higher (why it looks the
// tallest from most places though Khufu is bigger); the shelf falls away ~40 m to the south-east,
// where the Sphinx was carved out of a pit cut in the lower rock beside the Nile valley.
const KHAFRE_E = -322;
const KHAFRE_S = 339;
const MENKAURE_E = -563;
const MENKAURE_S = 739;
/** the Sphinx's own centre (real metres): its body runs east-west, its head at the east end */
export const SPHINX_E = 348;
export const SPHINX_S = 431;
export const SPHINX_LEN = 73.5;
export const SPHINX_WIDTH = 19;
export const SPHINX_HEIGHT = 20;
/** the Sphinx enclosure: the rectangular pit quarried round it (real metres, its own bounds) */
export const SPHINX_PIT = { e0: SPHINX_E - 50, e1: SPHINX_E + 44, s0: SPHINX_S - 30, s1: SPHINX_S + 30 };
/** the floor of the pit / the low ground the temples stand on, relative to Khufu's base */
export const SPHINX_FLOOR_ELEV = -40;
const LOW_SHELF_ELEV = -32;

/** the plateau's own elevation (real metres above Khufu's base) at real (e, s) */
export function gizaElevation(e: number, s: number): number {
  let el = 0;
  // Khafre's higher bedrock, and Menkaure's a little higher too
  el += 10 * (1 - smoothstep(170, 330, Math.hypot(e - KHAFRE_E, s - KHAFRE_S)));
  el += 4 * (1 - smoothstep(110, 220, Math.hypot(e - MENKAURE_E, s - MENKAURE_S)));
  // the shelf falls away to the south-east, down to the Sphinx's lower rock — along a wandering
  // edge (bays and spurs of rock), never one ruled line
  const edge = e + 0.35 * s + 38 * Math.sin(s / 95 + 0.7) + 22 * Math.sin(e / 57 - 1.3) + 12 * Math.sin((e + s) / 31);
  el += (LOW_SHELF_ELEV - el) * smoothstep(170, 330, edge);
  // …and on down to the valley floor east of the Sphinx, where the temples stand — a basin round
  // the Sphinx's own valley only (never a straight cliff down the whole plateau's east side)
  // two rounded basins: the temples' ground east of the pit, and the Valley Temple's south of it
  // (each clear of the pit's own west, north and south walls, so those keep their full height)
  const basin = (ce: number, cs: number, re: number, rs: number) => 1 - smoothstep(0.8, 1.05, Math.hypot((e - ce) / re, (s - cs) / rs));
  const low = Math.max(basin(SPHINX_E + 80, SPHINX_S + 10, 90, 85), basin(SPHINX_E - 3, SPHINX_S + 114, 100, 75));
  el += (SPHINX_FLOOR_ELEV - el) * low;
  // the Sphinx's own pit: quarried straight down to the floor round the body (its west, north
  // and south walls stand ~8 m tall; its east side opens onto the temples)
  const inE = smoothstep(SPHINX_PIT.e0 - 3, SPHINX_PIT.e0 + 3, e);
  const inS = smoothstep(SPHINX_PIT.s0 - 3, SPHINX_PIT.s0 + 3, s) * (1 - smoothstep(SPHINX_PIT.s1 - 3, SPHINX_PIT.s1 + 3, s));
  el += (SPHINX_FLOOR_ELEV - el) * inE * inS;
  return el;
}
/** the plateau's world height at real (e, s) */
export function gizaPlateauY(e: number, s: number): number {
  return GIZA_PLATEAU_Y + gizaElevation(e, s) * S;
}

/** The plateau's outline: a rounded, squarish shape (a superellipse, real metres) round the whole
 *  complex whose edge wanders in and out — never a ruled box or a circle (both read as drawn, not
 *  natural, on the map and on the ground). Every monument sits well inside its flat core. */
const PLATEAU = { e: -115, s: 365, aE: 760, aS: 700, p: 4 };
/** how far (world units) (x, z) is outside the plateau's flat core (0 inside) */
function outsideDist(x: number, z: number): number {
  const { e, s } = gizaLocal(x, z);
  const de = (e - PLATEAU.e) / PLATEAU.aE;
  const ds = (s - PLATEAU.s) / PLATEAU.aS;
  const r = Math.pow(Math.abs(de) ** PLATEAU.p + Math.abs(ds) ** PLATEAU.p, 1 / PLATEAU.p);
  const a = Math.atan2(de, ds);
  const wob = 0.028 * Math.sin(3 * a + 1.1) + 0.02 * Math.sin(5 * a + 2.3) + 0.012 * Math.sin(11 * a + 0.4);
  return Math.max(0, r - (0.9 + wob)) * PLATEAU.aS * S;
}
/** how far out from the plateau's flat core it blends back into the natural ground (world) */
export const GIZA_BLEND = 70;
/** a cheap "anywhere near Giza at all" test (world units of extra pad) */
export function nearGiza(x: number, z: number, pad = 0): boolean {
  const c = gizaWorld(PLATEAU.e, PLATEAU.s);
  return Math.abs(x - c.x) < PLATEAU.aE * S + GIZA_BLEND + pad && Math.abs(z - c.z) < PLATEAU.aS * S + GIZA_BLEND + pad;
}

/** the ground the terrain should have here because of Giza (null = leave it alone): the plateau,
 *  blending back into the natural land over GIZA_BLEND past the complex's own box.
 *  registry/terrain.ts's finish() applies it as a replacement, like the Grand Canyon's own. */
export function gizaGroundY(x: number, z: number, naturalH: number): number | null {
  if (!nearGiza(x, z)) return null;
  // (faded right out before the shore: the plateau never lifts the beach or the seabed)
  const w = (1 - smoothstep(0, GIZA_BLEND, outsideDist(x, z))) * smoothstep(-15, -70, seaDist(x, z));
  if (w <= 0) return null;
  const { e, s } = gizaLocal(x, z);
  return naturalH + (gizaPlateauY(e, s) - naturalH) * w;
}
/** 0..1 how strongly the ground here reads as bare desert sand (the whole complex and a ragged
 *  margin round it — never grass, never trees) */
export function gizaDesertK(x: number, z: number): number {
  if (!nearGiza(x, z, 120)) return 0;
  // (a softer, wider fade than the ground's own blend, its edge broken up by two wobbles so the
  // sand gives way to the land in drifts and tongues, not along one line)
  const n = Math.sin(x * 0.021 + z * 0.013) * 0.5 + Math.sin(x * 0.057 - z * 0.041 + 1.7) * 0.3;
  return 1 - smoothstep(GIZA_BLEND * 0.5, GIZA_BLEND + 120, outsideDist(x, z) + n * 35);
}

// ── the pyramids ──
export interface PyramidDef {
  id: string;
  name: string;
  /** real centre, metres east/south of Khufu */
  e: number;
  s: number;
  /** real half-base along x (east-west) and z (north-south), metres */
  halfE: number;
  halfS: number;
  /** real height when built, and the height of what stands today (metres) */
  hBuilt: number;
  hNow: number;
  /** real face angle, degrees */
  slopeDeg: number;
  /** how many stone courses the stepped core shows today */
  courses: number;
  /** real course height at the bottom and at the top (they thin out going up), metres */
  courseBottom: number;
  courseTop: number;
  /** how far the stepped core stands back from the original casing face (the casing stones were
   *  stripped away for building stone in the Middle Ages), metres */
  coreInset: number;
  /** the smooth limestone casing still in place above this fraction of today's height (Khafre) */
  casingFrom?: number;
  /** red-granite casing courses at the foot (Menkaure: 16; Khafre: 1), and on which faces */
  graniteCourses?: number;
  graniteFaces?: ("n" | "e" | "s" | "w")[];
  /** a queen's pyramid: smaller, stepped and badly ruined (the top course height fraction left) */
  queen?: boolean;
  /** a north-face entrance: its height above the base and its offset east of the centre line (m) */
  entrances?: { y: number; east: number; kind: "original" | "robbers" | "ground" }[];
}

export const PYRAMIDS: PyramidDef[] = [
  {
    id: "khufu",
    name: "The Great Pyramid of Khufu",
    e: 0,
    s: 0,
    halfE: 115.15,
    halfS: 115.15,
    hBuilt: 146.6,
    hNow: 138.5,
    slopeDeg: 51.84,
    courses: 203,
    courseBottom: 1.49,
    courseTop: 0.56,
    coreInset: 1.6,
    // the original entrance (17 m up, 7.3 m east of the middle, under its great gabled chevron
    // stones) and Al-Ma'mun's robbers' tunnel below it (the way visitors go in today)
    entrances: [
      { y: 17, east: 7.3, kind: "original" },
      { y: 7, east: -2.5, kind: "robbers" },
    ],
  },
  {
    id: "khafre",
    name: "The Pyramid of Khafre",
    e: KHAFRE_E,
    s: KHAFRE_S,
    halfE: 107.6,
    halfS: 107.6,
    hBuilt: 143.5,
    hNow: 136.4,
    slopeDeg: 53.13,
    courses: 158,
    courseBottom: 1.3,
    courseTop: 0.6,
    coreInset: 1.4,
    casingFrom: 0.74,
    graniteCourses: 1,
    graniteFaces: ["n", "e", "s", "w"],
    entrances: [
      { y: 11.5, east: 12.6, kind: "original" },
      { y: 0, east: 12.6, kind: "ground" },
    ],
  },
  {
    id: "menkaure",
    name: "The Pyramid of Menkaure",
    e: MENKAURE_E,
    s: MENKAURE_S,
    halfE: 51.1,
    halfS: 52.3,
    hBuilt: 65.5,
    hNow: 61,
    slopeDeg: 51.34,
    courses: 82,
    courseBottom: 1.05,
    courseTop: 0.55,
    coreInset: 1.2,
    graniteCourses: 16,
    graniteFaces: ["n", "e"],
    entrances: [{ y: 4, east: 0, kind: "original" }],
  },
  // Khufu's three queens' pyramids, in a north-south row by his east face (G1-a, G1-b, G1-c)
  { id: "g1a", name: "Queen's pyramid G1-a", e: 180, s: 40, halfE: 24.6, halfS: 24.6, hBuilt: 30.25, hNow: 21, slopeDeg: 51.8, courses: 24, courseBottom: 1.0, courseTop: 0.7, coreInset: 1, queen: true },
  { id: "g1b", name: "Queen's pyramid G1-b", e: 180, s: 92, halfE: 24.4, halfS: 24.4, hBuilt: 30, hNow: 19, slopeDeg: 51.8, courses: 22, courseBottom: 1.0, courseTop: 0.7, coreInset: 1, queen: true },
  { id: "g1c", name: "Queen's pyramid G1-c (Henutsen)", e: 176, s: 141, halfE: 23, halfS: 23, hBuilt: 29.6, hNow: 21.7, slopeDeg: 51.8, courses: 25, courseBottom: 1.0, courseTop: 0.7, coreInset: 1, queen: true },
  // Khafre's own small satellite pyramid, south of him
  { id: "g2a", name: "Khafre's satellite pyramid", e: KHAFRE_E, s: KHAFRE_S + 140, halfE: 10.5, halfS: 10.5, hBuilt: 13, hNow: 4, slopeDeg: 53, courses: 5, courseBottom: 0.9, courseTop: 0.7, coreInset: 0.6, queen: true },
  // Menkaure's three queens, in an east-west row south of him (G3-a still wears some granite)
  { id: "g3a", name: "Queen's pyramid G3-a", e: MENKAURE_E + 62, s: MENKAURE_S + 92, halfE: 22, halfS: 22, hBuilt: 28.4, hNow: 20, slopeDeg: 52.2, courses: 22, courseBottom: 1.0, courseTop: 0.7, coreInset: 0.8, queen: true, graniteCourses: 3, graniteFaces: ["e", "n"] },
  { id: "g3b", name: "Queen's pyramid G3-b", e: MENKAURE_E + 4, s: MENKAURE_S + 92, halfE: 15.7, halfS: 15.7, hBuilt: 21.2, hNow: 18, slopeDeg: 52, courses: 18, courseBottom: 1.1, courseTop: 0.8, coreInset: 0.6, queen: true },
  { id: "g3c", name: "Queen's pyramid G3-c", e: MENKAURE_E - 48, s: MENKAURE_S + 92, halfE: 15.7, halfS: 15.7, hBuilt: 21.2, hNow: 17, slopeDeg: 52, courses: 17, courseBottom: 1.1, courseTop: 0.8, coreInset: 0.6, queen: true },
];

/** a seeded xorshift rng (0..1) */
export function gizaRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** one pyramid's stepped core in WORLD units: each course's top height above the base and how far
 *  in its riser stands from the original base edge — the decor draws exactly these steps and
 *  gizaSolidY() stands the kid on exactly these steps, so they always agree */
export interface PyramidCourses {
  def: PyramidDef;
  /** world centre and base height */
  cx: number;
  cz: number;
  baseY: number;
  /** world half-base along x and z (the original casing line at the foot) */
  hx: number;
  hz: number;
  /** horizontal run per unit of height (1 / tan(face angle)) */
  run: number;
  /** world: core riser inset at each course's bottom (n), and each course's top height (n) */
  inset: number[];
  top: number[];
  /** the original, cased apex height (world) */
  apexY: number;
}
const _courses = new Map<string, PyramidCourses>();
export function pyramidCourses(def: PyramidDef): PyramidCourses {
  const hit = _courses.get(def.id);
  if (hit) return hit;
  const rng = gizaRng(seedOf(def.id));
  const n = def.courses;
  // course heights: thick at the foot, thinning upward, with the real pyramids' own odd thick
  // "backing" courses every so often (Khufu's 35th course is 1.4 m, almost as deep as the first)
  const raw: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    let h = def.courseTop + (def.courseBottom - def.courseTop) * Math.exp(-t * 4.2);
    if (!def.queen && (i === Math.round(n * 0.17) || i === Math.round(n * 0.33) || i === Math.round(n * 0.44) || i === Math.round(n * 0.59))) h *= 1.9;
    h *= 0.92 + rng() * 0.16;
    raw.push(h);
  }
  const sum = raw.reduce((a, b) => a + b, 0);
  const k = (def.hNow / sum) * S;
  const run = 1 / Math.tan((def.slopeDeg * Math.PI) / 180);
  const inset: number[] = [];
  const top: number[] = [];
  let y = 0;
  const core = def.coreInset * S;
  for (let i = 0; i < n; i++) {
    inset.push(core + y * run);
    y += raw[i] * k;
    top.push(y);
  }
  const p = gizaWorld(def.e, def.s);
  const out: PyramidCourses = { def, cx: p.x, cz: p.z, baseY: gizaPlateauY(def.e, def.s), hx: def.halfE * S, hz: def.halfS * S, run, inset, top, apexY: def.hBuilt * S };
  _courses.set(def.id, out);
  return out;
}

/** the stepped core's own top at (x, z) for one pyramid (world y), or null off it */
function pyramidSurfaceY(pc: PyramidCourses, x: number, z: number): number | null {
  const lx = Math.abs(x - pc.cx);
  const lz = Math.abs(z - pc.cz);
  // inward distance from the original base edge (the nearest face)
  const d = Math.min(pc.hx - lx, pc.hz - lz);
  if (d < pc.inset[0]) return null;
  // the course whose riser is the last one at or outside d
  let lo = 0;
  let hi = pc.inset.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pc.inset[mid] <= d) lo = mid;
    else hi = mid - 1;
  }
  return pc.baseY + pc.top[lo];
}

// ── the other solid things the kid walks round: the Sphinx, the temples, the mastaba tombs ──
export interface GizaBlock {
  id: string;
  /** world centre, half sizes and the height of its top (world y) */
  x: number;
  z: number;
  hx: number;
  hz: number;
  top: number;
}
/** real-metre box -> world block, its top `h` metres above the plateau at its centre */
function block(id: string, e: number, s: number, halfE: number, halfS: number, h: number): GizaBlock {
  const p = gizaWorld(e, s);
  return { id, x: p.x, z: p.z, hx: halfE * S, hz: halfS * S, top: gizaPlateauY(e, s) + h * S };
}

/** the Sphinx's own body, as a few solid blocks: the paws, the chest and head, the long back and
 *  the rump (heights from its real profile) — what the kid stands against */
export const SPHINX_BLOCKS: GizaBlock[] = [
  block("sphinx-paws", SPHINX_E + 29, SPHINX_S, 7.5, 7.2, 3),
  block("sphinx-chest", SPHINX_E + 16, SPHINX_S, 6.5, 7.5, 20),
  block("sphinx-body", SPHINX_E - 6, SPHINX_S, 16, 9.5, 13.5),
  block("sphinx-rump", SPHINX_E - 29, SPHINX_S, 7.5, 9, 11),
];

/** the temples (real plans, simplified to their standing walls' footprint; their halls are open
 *  to walk into through their doorways — the walls are what's solid) */
export interface GizaTemple {
  id: string;
  name: string;
  e: number;
  s: number;
  halfE: number;
  halfS: number;
  /** real height of its standing walls (metres) */
  wallH: number;
  /** wall thickness (metres) */
  wall: number;
  /** which sides have a doorway (centred) and its width (metres) */
  doors: { side: "n" | "e" | "s" | "w"; width: number }[];
  /** granite-faced (the Valley Temple) or plain limestone ruin */
  granite?: boolean;
}
export const TEMPLES: GizaTemple[] = [
  // Khafre's Valley Temple: a near-square of huge limestone blocks faced in red granite, its
  // T-shaped pillared hall inside, beside the Sphinx's own pit
  { id: "valley-temple", name: "Khafre's Valley Temple", e: SPHINX_E - 6, s: SPHINX_S + 82, halfE: 22.5, halfS: 22.5, wallH: 13, wall: 4.5, doors: [{ side: "e", width: 3 }, { side: "w", width: 3 }], granite: true },
  // the Sphinx Temple, right in front of its paws (never finished, roofless)
  { id: "sphinx-temple", name: "The Sphinx Temple", e: SPHINX_E + 64, s: SPHINX_S - 4, halfE: 22, halfS: 23, wallH: 7, wall: 3.5, doors: [{ side: "e", width: 4 }, { side: "w", width: 6 }] },
  // Khafre's mortuary temple against his east face, the causeway running out of it
  { id: "khafre-mortuary", name: "Khafre's Mortuary Temple", e: KHAFRE_E + 107.6 + 30, s: KHAFRE_S, halfE: 28, halfS: 50, wallH: 5, wall: 4, doors: [{ side: "e", width: 5 }, { side: "w", width: 6 }] },
  // Khufu's mortuary temple: only its black basalt floor and a few wall stubs survive
  { id: "khufu-mortuary", name: "Khufu's Mortuary Temple", e: 115.15 + 20, s: 0, halfE: 20, halfS: 26, wallH: 1.4, wall: 2, doors: [{ side: "e", width: 8 }, { side: "w", width: 10 }] },
  // Menkaure's mortuary temple, east of his pyramid
  { id: "menkaure-mortuary", name: "Menkaure's Mortuary Temple", e: MENKAURE_E + 51.1 + 26, s: MENKAURE_S, halfE: 24, halfS: 28, wallH: 3, wall: 3, doors: [{ side: "e", width: 5 }, { side: "w", width: 6 }] },
];
/** a temple's walls as solid blocks (four sides, each split round its doorway) */
export function templeWalls(t: GizaTemple): GizaBlock[] {
  const out: GizaBlock[] = [];
  const side = (sd: "n" | "e" | "s" | "w") => {
    const door = t.doors.find((d) => d.side === sd);
    const along = sd === "n" || sd === "s" ? t.halfE : t.halfS;
    const off = sd === "n" ? -t.halfS + t.wall / 2 : sd === "s" ? t.halfS - t.wall / 2 : sd === "w" ? -t.halfE + t.wall / 2 : t.halfE - t.wall / 2;
    const pieces: [number, number][] = door ? [[-along, -door.width / 2], [door.width / 2, along]] : [[-along, along]];
    for (const [a0, a1] of pieces) {
      const mid = (a0 + a1) / 2;
      const half = (a1 - a0) / 2;
      if (sd === "n" || sd === "s") out.push(block(`${t.id}-${sd}${mid}`, t.e + mid, t.s + off, half, t.wall / 2, t.wallH));
      else out.push(block(`${t.id}-${sd}${mid}`, t.e + off, t.s + mid, t.wall / 2, half, t.wallH));
    }
  };
  side("n");
  side("e");
  side("s");
  side("w");
  return out;
}

/** the Western Cemetery's rows of mastabas (flat-topped, sloping-sided tombs of Khufu's officials)
 *  west of the Great Pyramid, and the Eastern Cemetery's beyond his queens — a real street grid */
export interface Mastaba {
  e: number;
  s: number;
  halfE: number;
  halfS: number;
  h: number;
}
export const MASTABAS: Mastaba[] = (() => {
  const out: Mastaba[] = [];
  const rng = gizaRng(4711);
  // the Western Cemetery: long tombs, their long axis north-south, in streets (G 4000 / G 2000)
  for (let row = 0; row < 7; row++)
    for (let col = 0; col < 5; col++) {
      if (rng() < 0.14) continue;
      out.push({ e: -205 - col * 46 + (rng() - 0.5) * 4, s: -150 + row * 34 + (rng() - 0.5) * 3, halfE: 9 + rng() * 3, halfS: 11 + rng() * 3, h: 4 + rng() * 3.5 });
    }
  // the Eastern Cemetery (G 7000), east of the queens
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 3; col++) {
      if (rng() < 0.12) continue;
      out.push({ e: 232 + col * 40 + (rng() - 0.5) * 3, s: 82 + row * 34 + (rng() - 0.5) * 3, halfE: 10 + rng() * 3, halfS: 11 + rng() * 3, h: 4 + rng() * 3 });
    }
  return out;
})();
export const MASTABA_BLOCKS: GizaBlock[] = MASTABAS.map((m, i) => block(`mastaba-${i}`, m.e, m.s, m.halfE, m.halfS, m.h));

/** the Sphinx pit's quarried rock walls (west, north and south; the east side opens onto the
 *  temples), standing up to the shelf's own level just outside them */
export const SPHINX_PIT_WALLS: GizaBlock[] = (() => {
  const P = SPHINX_PIT;
  const wallTop = (e: number, s: number) => GIZA_PLATEAU_Y + gizaElevation(e, s) * S;
  const mk = (id: string, e0: number, e1: number, s0: number, s1: number, oe: number, os: number): GizaBlock => {
    const c = gizaWorld((e0 + e1) / 2, (s0 + s1) / 2);
    return { id, x: c.x, z: c.z, hx: ((e1 - e0) / 2) * S, hz: ((s1 - s0) / 2) * S, top: wallTop(oe, os) };
  };
  return [
    mk("sphinx-pit-west", P.e0, P.e0 + 3, P.s0, P.s1, P.e0 - 8, (P.s0 + P.s1) / 2),
    mk("sphinx-pit-north", P.e0, P.e1 - 22, P.s0, P.s0 + 3, (P.e0 + P.e1 - 22) / 2, P.s0 - 8),
    mk("sphinx-pit-south", P.e0, P.e1 - 22, P.s1 - 3, P.s1, (P.e0 + P.e1 - 22) / 2, P.s1 + 8),
  ];
})();

/** every solid block (Sphinx, its pit walls, temple walls, mastabas) — the pyramids on their own */
export const GIZA_BLOCKS: GizaBlock[] = [...SPHINX_BLOCKS, ...SPHINX_PIT_WALLS, ...TEMPLES.flatMap(templeWalls), ...MASTABA_BLOCKS];

/** the ground's top at (x, z) if a monument stands there (world y), else null — what
 *  registry/harbours.ts's worldFloorY() stands the kid on, and what the engine's cliff rule
 *  (inGizaSolid) treats as a wall */
export function gizaSolidY(x: number, z: number): number | null {
  if (!nearGiza(x, z)) return null;
  let best: number | null = null;
  for (const def of PYRAMIDS) {
    const pc = pyramidCourses(def);
    if (Math.abs(x - pc.cx) > pc.hx || Math.abs(z - pc.cz) > pc.hz) continue;
    const y = pyramidSurfaceY(pc, x, z);
    if (y !== null && (best === null || y > best)) best = y;
  }
  for (const b of GIZA_BLOCKS) {
    if (Math.abs(x - b.x) > b.hx || Math.abs(z - b.z) > b.hz) continue;
    if (best === null || b.top > best) best = b.top;
  }
  return best;
}
/** true near a monument (within `pad` world units of one): where ParkWorld's cliff rule holds, so
 *  a step up onto a pyramid course, a temple wall or the Sphinx is a wall at every speed */
export function inGizaSolid(x: number, z: number, pad = 1.5): boolean {
  if (!nearGiza(x, z)) return false;
  for (const def of PYRAMIDS) {
    const pc = pyramidCourses(def);
    if (Math.abs(x - pc.cx) < pc.hx + pad && Math.abs(z - pc.cz) < pc.hz + pad) return true;
  }
  for (const b of GIZA_BLOCKS) if (Math.abs(x - b.x) < b.hx + pad && Math.abs(z - b.z) < b.hz + pad) return true;
  return false;
}

// ── the causeways (raised stone ramps), real metres ──
export interface Causeway {
  id: string;
  /** polyline, real (e, s) */
  pts: [number, number][];
  /** real width */
  width: number;
}
export const CAUSEWAYS: Causeway[] = [
  // Khafre's causeway: 494 m from his mortuary temple down to the Valley Temple by the Sphinx
  { id: "khafre-causeway", pts: [[KHAFRE_E + 107.6 + 58, KHAFRE_S - 8], [SPHINX_E - 30, SPHINX_S + 76]], width: 5 },
  // Khufu's causeway: out of his mortuary temple, running ~14° north of east down off the plateau
  { id: "khufu-causeway", pts: [[115.15 + 40, -4], [330, -48]], width: 9 },
  // Menkaure's causeway, east from his temple
  { id: "menkaure-causeway", pts: [[MENKAURE_E + 51.1 + 50, MENKAURE_S - 4], [MENKAURE_E + 300, MENKAURE_S - 30]], width: 4 },
];

/** Khufu's boat pits: long boat-shaped trenches cut in the rock beside him (two south, where the
 *  dismantled cedar "Solar Boat" was found in 1954, and the big ones by his east face) */
export const BOAT_PITS: { e: number; s: number; len: number; width: number; angle: number }[] = [
  { e: -12, s: 127, len: 31, width: 5, angle: 0 }, // south side, east of the axis (the Khufu ship)
  { e: 30, s: 127, len: 31, width: 5, angle: 0 }, // south side, the second boat
  { e: 135, s: -60, len: 44, width: 7, angle: Math.PI / 2 }, // east face, north of the temple
  { e: 130, s: 56, len: 40, width: 7, angle: Math.PI / 2 }, // east face, south of the temple
];

// ── what the kid sees and reads ──
/** the panorama point: the famous viewpoint south-west on the desert where all nine pyramids line
 *  up in one view, and the signs round the complex */
export const GIZA_PANORAMA = gizaWorld(-760, 1050);
export const GIZA_SPHINX_VIEW = gizaWorld(SPHINX_E + 115, SPHINX_S - 6);
export const GIZA_KHUFU_NORTH = gizaWorld(0, -160);
export const GIZA_VIEWPOINTS: { x: number; z: number }[] = [GIZA_SPHINX_VIEW, GIZA_KHUFU_NORTH, gizaWorld(-322 + 150, 339 - 160), GIZA_PANORAMA];
/** the middle of the complex (the wonder's own discovery point and map pin) */
export const GIZA_CENTRE = gizaWorld(-60, 330);
/** where a kid arriving by dragon is set down (in front of the Sphinx, looking west at it) */
export const GIZA_ARRIVAL = gizaWorld(SPHINX_E + 135, SPHINX_S + 30);
