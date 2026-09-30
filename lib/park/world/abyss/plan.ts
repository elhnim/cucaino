// The Midnight Rift's layout and life — pure maths, deterministic, no three.js (tested).
//
// Places (along the crack, s = metres along the centreline):
//   the Whale Fall on the floor, the Old Arch and the giant octopus's grotto on a ledge of the
//   right-hand wall, the black smoker vent field with its tube-worm gardens and yeti crabs, the
//   Rock Bridge right across the rift, glass sponges and sea pens on the ledges, boulders jutting
//   from the cliffs.
// Creatures live in "canyon coordinates" (s along, u across, y) so they follow the winding crack
// and never swim into its walls: `safeHalf` says how far from the middle a creature at height y
// can go before it would touch rock. Behaviours:
//   loop   cruise a long racetrack loop up and down the rift (pure function of time)
//   hover  drift round a home spot (Lissajous)
//   jet    ammonites: pulse along a small loop, shell first
//   crawl  pace a little loop on the floor
//   fixed  the giant octopus in its grotto
//   the megalodon: steers itself (state), cruising its loop, and every so often comes to circle
//   the diving kid (an ellipse along the rift round them, never closer than ~8 m), then leaves.
import { ABYSS_GRID, ABYSS_LENGTH, abyssFloorY, abyssFrame, abyssPlainY, type AbyssFrame } from "../../registry/abyss";
import { rngOf } from "../fantasy/noise";

const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const wrapA = (a: number) => a - Math.round(a / TAU) * TAU;
export const RIFT_L = ABYSS_LENGTH;
/** the plain the rift cuts through (~-22 m) */
export const RIM_Y = -22;

// ── canyon coordinates ──

const fr: AbyssFrame = { x: 0, z: 0, nx: 0, nz: 0 };
export interface V3 {
  x: number;
  y: number;
  z: number;
}
/** world (x, z) of canyon point (s, u) into out.x / out.z */
export function toWorld(s: number, u: number, out: V3): V3 {
  abyssFrame(s, fr);
  out.x = fr.x + fr.nx * u;
  out.z = fr.z + fr.nz * u;
  return out;
}
/** the heading (yaw about +Y, forward = (sin, cos)) of the crack's direction at s */
export function tangentYaw(s: number): number {
  abyssFrame(s, fr);
  // travel direction T = (-nz, nx)
  return Math.atan2(-fr.nz, fr.nx);
}
/** the sea floor (crack or plain) at world (x, z) */
export function floorY(x: number, z: number): number {
  const y = abyssFloorY(x, z);
  return y === null ? abyssPlainY(x, z) : y;
}
const tmp: V3 = { x: 0, y: 0, z: 0 };
/** the sea floor at canyon point (s, u) */
export function floorAt(s: number, u: number): number {
  toWorld(s, u, tmp);
  return floorY(tmp.x, tmp.z);
}

const G = ABYSS_GRID;
const W = G.cols + 1;
const MID = G.cols / 2;
/** how far (m) from the middle, on `side` (+1 right, -1 left), something at height y can be with
 *  `clear` metres of water under it — checked on the grid rows round s. 60 = open water above. */
export function safeHalf(s: number, y: number, side: number, clear: number): number {
  const lim = y - clear;
  if (lim > RIM_Y + 1.2) return 60;
  const fi = (s + 6) / 2;
  let best = 60;
  for (let di = -1; di <= 2; di++) {
    const i = clamp(Math.floor(fi) + di, 0, G.rows - 1);
    let u = G.half[i];
    const hs = G.half[i] / MID; // metres per column
    if (G.y[i * W + MID] > lim) {
      u = 0;
    } else {
      for (let k = 1; k <= MID; k++) {
        const j = MID + side * k;
        const yj = G.y[i * W + j];
        if (yj > lim) {
          const yp = G.y[i * W + j - side];
          const f = (lim - yp) / Math.max(1e-6, yj - yp);
          u = (k - 1 + clamp(f, 0, 1)) * hs;
          break;
        }
      }
    }
    if (u < best) best = u;
  }
  return best;
}

/** the rock face at height y on `side` at exactly s: the last point out from the middle that is
 *  still water (signed u, m) — the rock starts within 0.12 m beyond it */
export function wallU(s: number, y: number, side: number): number {
  const start = Math.max(0, safeHalf(s, y, side, 0) - 4);
  for (let uu = start; uu < 70; uu += 0.12) if (floorAt(s, side * uu) > y) return side * Math.max(0, uu - 0.12);
  return side * 70;
}

// ── places ──

export interface Place {
  id: string;
  s: number;
  u: number;
  x: number;
  y: number;
  z: number;
  /** facing (yaw) */
  yaw: number;
  r: number;
}
function place(id: string, s: number, u: number, y: number, yaw: number, r: number): Place {
  toWorld(s, u, tmp);
  return { id, s, u, x: tmp.x, y, z: tmp.z, yaw, r };
}

/** a flat ledge on `side` of the row at s with its top between yLo and yHi (u in m), else null */
export function findLedge(s: number, side: number, yLo: number, yHi: number, minRun = 3): { u: number; y: number } | null {
  const i = clamp(Math.round((s + 6) / 2), 0, G.rows - 1);
  const hs = G.half[i] / MID;
  let run = 0;
  for (let k = 2; k < MID - 3; k++) {
    const j = MID + side * k;
    const y0 = G.y[i * W + j];
    const y1 = G.y[i * W + j + side];
    const flat = Math.abs(y1 - y0) < 0.45 && y0 > yLo && y0 < yHi;
    run = flat ? run + 1 : 0;
    if (run >= minRun) {
      const kc = k - Math.floor(minRun / 2);
      return { u: side * kc * hs, y: G.y[i * W + MID + side * kc] };
    }
  }
  return null;
}

/** the floor's middle (lowest part) at s */
const floorMid = (s: number) => floorAt(s, 0);

export const S_WHALE = RIFT_L * 0.3;
export const S_GROTTO = RIFT_L * 0.46;
export const S_VENTS = RIFT_L * 0.63;
export const S_BRIDGE = RIFT_L * 0.8;

export const WHALE_FALL: Place = place("whale-fall", S_WHALE, -1.5, floorMid(S_WHALE), tangentYaw(S_WHALE) + 0.25, 12);
export const VENT_FIELD: Place = place("black-smokers", S_VENTS, 0, floorMid(S_VENTS), tangentYaw(S_VENTS), 14);

/** the octopus's ledge, on the right wall, well down the rift */
export const GROTTO: Place = (() => {
  for (let ds = 0; ds < 40; ds += 2)
    for (const sgn of [1, -1]) {
      const s = S_GROTTO + ds * sgn;
      const l = findLedge(s, 1, -86, -52, 4);
      if (l) return place("grotto", s, l.u, l.y, tangentYaw(s) - Math.PI / 2, 9);
    }
  const s = S_GROTTO;
  const u = safeHalf(s, -70, 1, 0.5) - 1;
  return place("grotto", s, u, floorAt(s, u), tangentYaw(s) - Math.PI / 2, 9);
})();

/** the natural rock bridge: across the rift at ~-50 m, ends buried in the walls */
export const BRIDGE = (() => {
  const s = S_BRIDGE;
  const y = -50;
  const uL = -safeHalf(s, y, -1, 0) - 3.5;
  const uR = safeHalf(s, y, 1, 0) + 3.5;
  const a = place("rock-bridge", s, uL, y, 0, 0);
  const b = place("rock-bridge", s, uR, y, 0, 0);
  return { s, y, uL, uR, a, b, mid: place("rock-bridge", s, (uL + uR) / 2, y + 3, 0, Math.abs(uR - uL) / 2) };
})();

/** the black smoker chimneys (world x, floor y, z, height) */
export const CHIMNEYS: { x: number; y: number; z: number; h: number; r: number }[] = (() => {
  const r = rngOf(9101);
  const out: { x: number; y: number; z: number; h: number; r: number }[] = [];
  const spots: [number, number, number][] = [
    [0, -0.5, 9.5],
    [-7, 2.5, 6.5],
    [6, 2, 7.5],
    [12, -2.5, 5.5],
    [-12, -2, 8],
  ];
  for (const [ds, du, h] of spots) {
    const s = S_VENTS + ds;
    const u = clamp(du, -safeHalf(s, floorMid(s) + 1.5, -1, 0) + 1.5, safeHalf(s, floorMid(s) + 1.5, 1, 0) - 1.5);
    toWorld(s, u, tmp);
    out.push({ x: tmp.x, y: floorY(tmp.x, tmp.z) - 0.4, z: tmp.z, h: h * (0.9 + r() * 0.2), r: 0.8 + r() * 0.3 });
  }
  return out;
})();

export interface Prop {
  kind: "worms" | "pen" | "sponge" | "barrel" | "rock" | "crust";
  x: number;
  y: number;
  z: number;
  yaw: number;
  s: number;
  /** extra: tilt (rocks: into the canyon), colour tint index */
  tilt: number;
  sx: number;
  sy: number;
  sz: number;
}

/** sessile life and boulders (deterministic) */
export function planProps(lowQuality = false): Prop[] {
  const r = rngOf(4711);
  const out: Prop[] = [];
  const k = lowQuality ? 0.55 : 1;
  // tube worm clumps round the chimneys
  for (let i = 0; i < Math.round(26 * k); i++) {
    const c = CHIMNEYS[i % CHIMNEYS.length];
    const a = r() * TAU;
    const d = 1.6 + r() * 5;
    const x = c.x + Math.sin(a) * d;
    const z = c.z + Math.cos(a) * d;
    const sc = 0.8 + r() * 0.6;
    out.push({ kind: "worms", x, y: floorY(x, z) - 0.1, z, yaw: r() * TAU, s: S_VENTS, tilt: 0, sx: sc, sy: sc * (0.8 + r() * 0.5), sz: sc });
  }
  // glass sponges, barrel sponges and sea pens on ledges and the floor, all along the rift
  for (let s = 40; s < RIFT_L - 40; s += lowQuality ? 9 : 5) {
    for (const side of [1, -1]) {
      if (r() < 0.35) continue;
      const lo = -40 - r() * 70;
      const l = findLedge(s, side, lo - 18, lo + 6, 2);
      if (!l) continue;
      const kind: Prop["kind"] = r() < 0.45 ? "pen" : r() < 0.7 ? "sponge" : "barrel";
      toWorld(s, l.u, tmp);
      const sc = kind === "barrel" ? 0.8 + r() * 0.7 : 0.8 + r() * 0.8;
      out.push({ kind, x: tmp.x, y: floorY(tmp.x, tmp.z) - 0.05, z: tmp.z, yaw: r() * TAU, s, tilt: 0, sx: sc, sy: sc, sz: sc });
    }
    // and a few on the floor
    if (r() < 0.3) {
      const u = (r() - 0.5) * 2 * Math.max(0, safeHalf(s, floorMid(s) + 0.8, 1, 0) - 1);
      toWorld(s, u, tmp);
      const sc = 0.9 + r() * 0.8;
      out.push({ kind: r() < 0.6 ? "pen" : "sponge", x: tmp.x, y: floorY(tmp.x, tmp.z) - 0.05, z: tmp.z, yaw: r() * TAU, s, tilt: 0, sx: sc, sy: sc, sz: sc });
    }
  }
  // glowing crusts dotted over the cliffs, facing out into the rift
  for (let s = 25; s < RIFT_L - 25; s += lowQuality ? 6 : 2.2) {
    const side = r() < 0.5 ? 1 : -1;
    const fl = floorMid(s);
    const y = fl + 2 + r() * (RIM_Y - 8 - fl - 2);
    const u = wallU(s, y, side);
    toWorld(s, u, tmp);
    const sc = 0.7 + r() * 1.1;
    out.push({ kind: "crust", x: tmp.x, y, z: tmp.z, yaw: tangentYaw(s) + (side > 0 ? -Math.PI / 2 : Math.PI / 2), s, tilt: Math.floor(r() * 5), sx: sc, sy: sc, sz: sc });
  }
  // boulders jutting out of the cliffs (overhangs)
  for (let s = 30; s < RIFT_L - 30; s += lowQuality ? 13 : 8.5) {
    const side = r() < 0.5 ? 1 : -1;
    const y = -30 - r() * 75;
    const fl = floorMid(s);
    if (y < fl + 6) continue;
    const u = wallU(s, y, side) + side * 0.6;
    toWorld(s, u, tmp);
    const sc = 2 + r() * 3.2;
    out.push({ kind: "rock", x: tmp.x, y, z: tmp.z, yaw: tangentYaw(s) + (side > 0 ? Math.PI / 2 : -Math.PI / 2), s, tilt: side, sx: sc * 1.3, sy: sc * 0.55, sz: sc });
  }
  return out;
}

// ── creatures ──

export type Species =
  | "megalodon"
  | "greenland"
  | "liopleurodon"
  | "dunkleosteus"
  | "helicoprion"
  | "goblinShark"
  | "frilledShark"
  | "coelacanth"
  | "giantSquid"
  | "gulper"
  | "oarfish"
  | "anglerfish"
  | "vampireSquid"
  | "dumbo"
  | "barreleye"
  | "combJelly"
  | "siphonophore"
  | "ammonite"
  | "trilobite"
  | "eurypterid"
  | "seaPig"
  | "isopod"
  | "yetiCrab"
  | "giantOctopus";

export interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  scale: number;
}
export interface Creature {
  sp: Species;
  kind: "loop" | "hover" | "jet" | "crawl" | "fixed" | "megalodon" | "escort";
  seed: number;
  scale: number;
  /** body radius for spotting and the kid bubble (m, at scale 1) */
  radius: number;
  /** animation phase rate (rad/s) */
  phRate: number;
  // loop / jet: racetrack s0..s1 at +-r across, target height y (+- yAmp), speed (m/s), clear
  s0: number;
  s1: number;
  r: number;
  y: number;
  yAmp: number;
  uAmp: number;
  speed: number;
  clear: number;
  theta0: number;
  // hover / crawl home
  hs: number;
  hu: number;
  hy: number;
  amp: number;
  /** fixed extra pitch (the oarfish swims upright) */
  pitch0: number;
  // live state
  pose: Pose;
  ph: number;
  started: boolean;
}

function make(sp: Species, kind: Creature["kind"], seed: number, o: Partial<Creature>): Creature {
  return {
    sp,
    kind,
    seed,
    scale: 1,
    radius: 1,
    phRate: 3,
    s0: 60,
    s1: RIFT_L - 60,
    r: 5,
    y: -60,
    yAmp: 3,
    uAmp: 2,
    speed: 1,
    clear: 2,
    theta0: 0,
    hs: 0,
    hu: 0,
    hy: 0,
    amp: 1,
    pitch0: 0,
    ...o,
    pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
    ph: seed * 1.7,
    started: false,
  };
}

/** where a floor crawler can walk near s (a u that is on the flat floor) */
function floorU(s: number, r: () => number) {
  const fl = floorMid(s);
  const w = Math.max(0, Math.min(safeHalf(s, fl + 0.9, 1, 0), safeHalf(s, fl + 0.9, -1, 0)) - 2);
  return (r() * 2 - 1) * w;
}

/** the whole population (deterministic) */
export function planCreatures(lowQuality = false): Creature[] {
  const r = rngOf(2718);
  const L = RIFT_L;
  const c: Creature[] = [];
  let seed = 1;
  const add = (sp: Species, kind: Creature["kind"], o: Partial<Creature>) => c.push(make(sp, kind, seed++, o));
  // the giants
  add("megalodon", "megalodon", { radius: 8, phRate: 1.5, s0: 70, s1: L - 70, r: 9, y: -46, yAmp: 6, uAmp: 2, speed: 3, clear: 6, theta0: 40 });
  add("liopleurodon", "loop", { radius: 3.5, phRate: 1.2, s0: 60, s1: L * 0.62, r: 6, y: -62, yAmp: 8, uAmp: 2, speed: 2.4, clear: 4, theta0: 120 });
  add("dunkleosteus", "loop", { radius: 3, phRate: 2.2, s0: L * 0.4, s1: L - 60, r: 5, y: -78, yAmp: 6, speed: 1.8, clear: 3.5, theta0: 30 });
  add("helicoprion", "loop", { radius: 2.5, phRate: 2.4, s0: 70, s1: L * 0.55, r: 4, y: -38, yAmp: 8, speed: 2.1, clear: 3, theta0: 260 });
  add("greenland", "loop", { radius: 3, phRate: 1.0, s0: 80, s1: L - 80, r: 3, y: -200, yAmp: 1, speed: 0.7, clear: 3.2, theta0: 90 });
  add("giantSquid", "loop", { radius: 5, phRate: 1.4, s0: L * 0.2, s1: L * 0.75, r: 4, y: -92, yAmp: 5, speed: 1.1, clear: 5, theta0: 200 });
  add("goblinShark", "loop", { radius: 1.9, phRate: 3, s0: L * 0.5, s1: L - 65, r: 3.5, y: -100, yAmp: 4, speed: 1.4, clear: 2.2, theta0: 60 });
  for (let i = 0; i < 2; i++) add("frilledShark", "loop", { radius: 1.3, phRate: 4.5, s0: 70 + i * 60, s1: L * 0.5 + i * 60, r: 2.5, y: -95 + i * 10, yAmp: 4, speed: 1.2, clear: 1.8, theta0: 100 * i });
  for (let i = 0; i < 3; i++) add("coelacanth", "loop", { radius: 1, phRate: 3.2, s0: L * 0.3 + i * 12, s1: L * 0.52 + i * 10, r: 2.5 + i, y: -84 + i * 4, yAmp: 3, speed: 0.8, clear: 2, theta0: 25 * i });
  for (let i = 0; i < 2; i++) add("gulper", "loop", { radius: 1.1, phRate: 5, s0: 90 + i * 110, s1: 160 + i * 110, r: 3, y: -70 - i * 12, yAmp: 6, speed: 0.9, clear: 2, theta0: 40 * i });
  add("oarfish", "hover", { radius: 4.5, phRate: 2, hs: L * 0.7, hu: 0, hy: -58, amp: 8, pitch0: -1.3 });
  // the drifters
  const nA = lowQuality ? 3 : 4;
  for (let i = 0; i < nA; i++) {
    const s = L * (0.24 + i * 0.16) + r() * 10;
    const u = floorU(s, r) * 0.6;
    add("anglerfish", "hover", { radius: 0.6, phRate: 2.5, hs: s, hu: u, hy: floorAt(s, u) + 2.5 + r() * 2, amp: 1.2 });
  }
  for (let i = 0; i < 3; i++) {
    const s = L * (0.3 + i * 0.18) + r() * 8;
    add("vampireSquid", "hover", { radius: 0.5, phRate: 2.2, hs: s, hu: (r() - 0.5) * 4, hy: -75 + r() * 15, amp: 2 });
  }
  for (let i = 0; i < 4; i++) {
    const s = L * (0.2 + i * 0.17) + r() * 8;
    const u = floorU(s, r) * 0.5;
    add("dumbo", "hover", { radius: 0.5, phRate: 2, hs: s, hu: u, hy: floorAt(s, u) + 2.2 + r() * 2.5, amp: 1.6 });
  }
  for (let i = 0; i < 3; i++) add("barreleye", "hover", { radius: 0.4, phRate: 5, hs: L * (0.35 + i * 0.13), hu: (r() - 0.5) * 3, hy: -55 - r() * 25, amp: 1.5 });
  const nJ = lowQuality ? 6 : 10;
  for (let i = 0; i < nJ; i++) add("combJelly", "hover", { radius: 0.4, phRate: 1.6, hs: 50 + r() * (L - 100), hu: (r() - 0.5) * 6, hy: -35 - r() * 60, amp: 2.5 });
  for (let i = 0; i < 3; i++) add("siphonophore", "hover", { radius: 5, phRate: 0.5, hs: L * (0.25 + i * 0.22), hu: (r() - 0.5) * 4, hy: -48 - r() * 30, amp: 6 });
  for (let i = 0; i < (lowQuality ? 4 : 6); i++) add("ammonite", "jet", { radius: 0.7, phRate: 2, s0: L * 0.35 + i * 9, s1: L * 0.35 + i * 9 + 18, r: 2 + r() * 2, y: -60 - r() * 25, yAmp: 3, uAmp: 1, speed: 0.9, clear: 2, scale: 0.8 + r() * 0.6, theta0: r() * 50 });
  // the floor crawlers
  const crawl = (sp: Species, n: number, s0: number, s1: number, rr: [number, number], speed: number, radius: number) => {
    for (let i = 0; i < n; i++) {
      const s = s0 + (s1 - s0) * ((i + r()) / n);
      const u = floorU(s, r);
      add(sp, "crawl", { radius, phRate: 4, hs: s, hu: u, r: rr[0] + r() * (rr[1] - rr[0]), speed: speed * (0.7 + r() * 0.6), scale: 0.85 + r() * 0.35, theta0: r() * 20 });
    }
  };
  crawl("trilobite", lowQuality ? 6 : 14, 60, L - 60, [1.2, 3], 0.18, 0.4);
  crawl("isopod", lowQuality ? 5 : 8, S_WHALE - 18, S_WHALE + 18, [1.5, 3.5], 0.14, 0.45);
  // sea pigs in two little herds
  for (const hs of [L * 0.4, L * 0.72]) crawl("seaPig", lowQuality ? 3 : 6, hs - 8, hs + 8, [1.5, 3], 0.08, 0.35);
  crawl("eurypterid", 3, L * 0.3, L * 0.8, [2.5, 4.5], 0.35, 1.1);
  // yeti crabs round the chimneys
  for (let i = 0; i < (lowQuality ? 6 : 16); i++) {
    const ch = CHIMNEYS[i % CHIMNEYS.length];
    const a = r() * TAU;
    const d = 1.2 + r() * 1.3;
    add("yetiCrab", "crawl", { radius: 0.3, phRate: 4, hs: -1, hu: 0, hy: 0, s0: ch.x + Math.sin(a) * d, s1: ch.z + Math.cos(a) * d, r: 0.3 + r() * 0.4, speed: 0.08, scale: 0.9 + r() * 0.4, theta0: r() * 10 });
  }
  add("giantOctopus", "fixed", { radius: 4, phRate: 1.1, hs: GROTTO.s, hu: GROTTO.u, hy: GROTTO.y });
  // escorts: a few rare animals that come to drift round a kid diving in the rift (so there's
  // always something to look at), and wander home again when the kid leaves
  const esc: [Species, number, number][] = [
    ["combJelly", 0.4, 1],
    ["dumbo", 0.5, 1],
    ["vampireSquid", 0.5, 1],
    ["combJelly", 0.4, 1.2],
    ["ammonite", 0.7, 1],
    ["coelacanth", 1, 1],
  ];
  esc.forEach(([sp, radius, scale], i) => {
    const s = L * (0.2 + i * 0.12);
    add(sp, "escort", { radius, scale, phRate: sp === "coelacanth" ? 3 : 2, hs: s, hu: (r() - 0.5) * 4, hy: -50 - r() * 30, amp: 2, r: 6 + (i % 3) * 1.4 });
  });
  // sanity: every loop fits the rift at its height (shrink the lateral radius where it's narrow)
  for (const m of c) {
    if (m.kind !== "loop" && m.kind !== "jet" && m.kind !== "megalodon") continue;
    let minHalf = 60;
    for (let s = m.s0 - m.r; s <= m.s1 + m.r; s += 6) {
      const yy = Math.max(m.y - m.yAmp, floorMid(clamp(s, 0, L)) + m.clear);
      minHalf = Math.min(minHalf, safeHalf(clamp(s, 0, L), yy, 1, m.clear), safeHalf(clamp(s, 0, L), yy, -1, m.clear));
    }
    m.r = clamp(Math.min(m.r, minHalf - m.uAmp - m.radius * 0.3), 0.6, m.r);
  }
  return c;
}

// ── behaviours ──

const lp: V3 = { x: 0, y: 0, z: 0 };
const lp2: V3 = { x: 0, y: 0, z: 0 };
/** a racetrack loop point: (s, u) at distance theta round the loop */
function racetrack(m: Creature, theta: number, out: { s: number; u: number }) {
  const straight = m.s1 - m.s0;
  const semi = Math.PI * m.r;
  const P = 2 * straight + 2 * semi;
  let d = ((theta % P) + P) % P;
  if (d < straight) {
    out.s = m.s0 + d;
    out.u = m.r;
    return;
  }
  d -= straight;
  if (d < semi) {
    const a = d / m.r;
    out.s = m.s1 + Math.sin(a) * m.r;
    out.u = Math.cos(a) * m.r;
    return;
  }
  d -= semi;
  if (d < straight) {
    out.s = m.s1 - d;
    out.u = -m.r;
    return;
  }
  d -= straight;
  const a = d / m.r;
  out.s = m.s0 - Math.sin(a) * m.r;
  out.u = -Math.cos(a) * m.r;
}

const su = { s: 0, u: 0 };
/** a loop swimmer's target at time t (canyon coords -> world into `out`), kept clear of rock */
export function loopTarget(m: Creature, t: number, out: V3, lead = 0): V3 {
  const th = m.theta0 + m.speed * t + lead;
  racetrack(m, th, su);
  let s = clamp(su.s, 2, RIFT_L - 2);
  let u = su.u + m.uAmp * Math.sin(th * 0.045 + m.seed);
  let y = m.y + m.yAmp * Math.sin(th * 0.033 + m.seed * 2.1);
  const fl = floorAt(s, 0);
  y = Math.max(y, fl + m.clear);
  y = Math.min(y, RIM_Y - 3 + (m.sp === "helicoprion" ? 12 : 0));
  const side = u >= 0 ? 1 : -1;
  const lim = safeHalf(s, y, side, m.clear) - m.radius * 0.25;
  u = side * Math.min(Math.abs(u), Math.max(0, lim));
  s = clamp(s, 2, RIFT_L - 2);
  toWorld(s, u, out);
  out.y = Math.max(y, floorY(out.x, out.z) + m.clear);
  return out;
}

/** hover target at time t */
export function hoverTarget(m: Creature, t: number, out: V3): V3 {
  const k = m.seed * 1.37;
  const s = m.hs + Math.sin(t * 0.05 + k) * m.amp * 1.6 + Math.sin(t * 0.13 + k * 2) * m.amp * 0.4;
  let u = m.hu + Math.sin(t * 0.07 + k * 3) * m.amp * 0.6;
  let y = m.hy + Math.sin(t * 0.09 + k * 5) * m.amp * 0.35;
  y = Math.min(y, RIM_Y - 2);
  const side = u >= 0 ? 1 : -1;
  const lim = safeHalf(s, y, side, 1) - 0.4;
  u = side * Math.min(Math.abs(u), Math.max(0, lim));
  toWorld(s, u, out);
  out.y = Math.max(y, floorY(out.x, out.z) + 0.8 + m.radius);
  return out;
}

/** ammonite: a small loop with pulsing jets */
function jetTheta(m: Creature, t: number) {
  const w = 1.4 + (m.seed % 3) * 0.2;
  return m.speed * (t + (0.8 * Math.sin(w * t + m.seed)) / w);
}

/** crawler target: a little loop round its home on the floor */
export function crawlTarget(m: Creature, t: number, out: V3): V3 {
  const a = m.theta0 + (m.speed * t) / m.r;
  if (m.hs < 0) {
    // (yeti crabs: world home in s0, s1)
    out.x = m.s0 + Math.sin(a) * m.r;
    out.z = m.s1 + Math.cos(a) * m.r;
  } else toWorld(m.hs + Math.sin(a) * m.r, m.hu + Math.cos(a) * m.r * 0.6, out);
  out.y = floorY(out.x, out.z) + 0.02;
  return out;
}

/** the kid's canyon position (updated each frame by the renderer) */
export interface KidInfo {
  x: number;
  y: number;
  z: number;
  /** in the strip: canyon coords, else s = NaN */
  s: number;
  u: number;
}

/** the megalodon's memory */
export interface MegState {
  s: number;
  u: number;
  y: number;
  /** heading relative to the rift's direction */
  psi: number;
  speed: number;
  /** 0 cruising, 1 coming to visit, 2 circling */
  mode: number;
  modeT: number;
  cool: number;
  orbitDir: number;
}
export const makeMegState = (m: Creature): MegState => ({ s: m.s0 + 20, u: 0, y: m.y, psi: 0, speed: m.speed, mode: 0, modeT: 0, cool: 12, orbitDir: 1 });

const MEG_VISIT = 26;
/** room across the rift (m either side of the middle, less a margin) for the megalodon at y */
const roomAt = (s: number, y: number) => Math.min(safeHalf(s, y, 1, 4), safeHalf(s, y, -1, 4)) - 2.5;
/**
 * Steer the megalodon one step. It cruises its racetrack; now and then (if the kid is diving in the
 * rift) it comes over and circles them on an ellipse along the rift — 16-20 m along, up to 10 m
 * across, at the kid's height — never closer than ~8 m, then swims off again.
 */
export function stepMegalodon(m: Creature, st: MegState, kid: KidInfo, dt: number, t: number): void {
  st.modeT += dt;
  st.cool -= dt;
  const kidIn = kid.s === kid.s && kid.y < RIM_Y + 12 && kid.y > -140;
  if (st.mode === 0 && kidIn && st.cool <= 0 && Math.abs(kid.s - st.s) < 170) {
    st.mode = 1;
    st.modeT = 0;
    st.orbitDir = Math.sin(m.seed + t) > 0 ? 1 : -1;
  }
  if (st.mode > 0 && (!kidIn || st.modeT > (st.mode === 1 ? 60 : MEG_VISIT))) {
    st.mode = 0;
    st.modeT = 0;
    st.cool = 30;
  }
  // the target (canyon coords)
  let ts: number;
  let tu: number;
  let ty: number;
  let want = m.speed;
  if (st.mode === 0) {
    loopTarget(m, t, lp, 14);
    const cs = projectS(lp, st.s);
    ts = cs.s;
    tu = cs.u;
    ty = lp.y;
    // catch up with the loop if it's far ahead or behind
    want = m.speed * (1 + clamp(Math.hypot(ts - st.s, tu - st.u) / 40, 0, 0.8));
  } else {
    const A = 20;
    let kidY = clamp(kid.y + 2, -135, RIM_Y + 8);
    // (where the rift is too narrow at the kid's depth, it passes a little above them instead)
    if (roomAt(kid.s, kidY) < 6) kidY = Math.min(RIM_Y + 8, kidY + 7);
    const B = clamp(roomAt(kid.s, kidY), 3, 12);
    // where we are round the kid (angle on the ellipse), and a point a little further round
    const phi = Math.atan2((st.u - kid.u) / B, (st.s - kid.s) / A);
    const dist = Math.hypot(st.s - kid.s, st.u - kid.u);
    if (st.mode === 1 && dist < A * 1.3) {
      st.mode = 2;
      st.modeT = 0;
    }
    const ahead = phi + st.orbitDir * 0.55;
    ts = kid.s + Math.cos(ahead) * A;
    tu = kid.u * 0.3 + Math.sin(ahead) * B;
    ty = kidY + 1;
    want = st.mode === 1 ? m.speed * 1.5 : m.speed * 1.05;
  }
  // turn towards the target (a big fish turns slowly)
  const dsx = ts - st.s;
  const dux = tu - st.u;
  const desired = Math.atan2(dux, dsx);
  const turn = clamp(wrapA(desired - st.psi), -0.4 * dt, 0.4 * dt);
  st.psi = wrapA(st.psi + turn);
  st.speed += (want - st.speed) * Math.min(1, dt * 0.5);
  let ns = st.s + Math.cos(st.psi) * st.speed * dt;
  let nu = st.u + Math.sin(st.psi) * st.speed * dt;
  ns = clamp(ns, 40, RIFT_L - 40);
  // keep its whole body (nose to tail, ~16 m) clear of the kid: sidestep and rise over them
  if (kid.s === kid.s) {
    const as = ns - kid.s;
    const au = nu - kid.u;
    const c = Math.cos(st.psi);
    const sn = Math.sin(st.psi);
    const along = clamp(as * c + au * sn, -7, 7);
    const dk = Math.hypot(as - along * c, au - along * sn, (st.y - kid.y) * 0.9);
    if (dk < 8) {
      const push = (8 - dk) * Math.min(1, dt * 2);
      nu += (au >= 0 ? 1 : -1) * push;
      st.y += push * 0.8;
    }
  }
  st.y += clamp(ty - st.y, -1.2 * dt, 1.2 * dt);
  const fl = floorAt(ns, nu);
  st.y = Math.max(st.y, fl + m.clear);
  const side = nu >= 0 ? 1 : -1;
  const lim = Math.max(0, safeHalf(ns, st.y, side, m.clear) - 1.5);
  if (Math.abs(nu) > lim) {
    nu = side * lim;
    // steer back along the rift
    const along = Math.cos(st.psi) >= 0 ? 0 : Math.PI;
    st.psi = wrapA(st.psi + wrapA(along - st.psi) * Math.min(1, dt * 1.5));
  }
  st.s = ns;
  st.u = nu;
}

/** canyon coords of a world point by searching near s (loop targets are built from canyon coords
 *  anyway; this recovers them cheaply) */
const pj = { s: 0, u: 0 };
function projectS(p: V3, near: number) {
  // step along the centreline for the nearest point (coarse then fine)
  let best = near;
  let bd = Infinity;
  for (let s = 0; s <= RIFT_L; s += 6) {
    toWorld(s, 0, tmp);
    const d = (tmp.x - p.x) ** 2 + (tmp.z - p.z) ** 2;
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  for (let s = best - 6; s <= best + 6; s += 0.5) {
    toWorld(s, 0, tmp);
    const d = (tmp.x - p.x) ** 2 + (tmp.z - p.z) ** 2;
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  abyssFrame(best, fr);
  pj.s = best;
  pj.u = (p.x - fr.x) * fr.nx + (p.z - fr.z) * fr.nz;
  return pj;
}

/** the megalodon's world pose from its state */
export function megPose(st: MegState, out: Pose, dt: number): void {
  toWorld(st.s, st.u, lp);
  // (psi > 0 turns towards +u, the right of the rift's direction: yaw grows)
  const yaw = tangentYaw(st.s) + st.psi;
  easePose(out, lp.x, st.y, lp.z, yaw, dt, 1.2, true);
}

/** ease a pose to a position, heading `yaw`, with pitch from the climb and roll from the turn */
export function easePose(p: Pose, x: number, y: number, z: number, yaw: number, dt: number, rate: number, snap = false): void {
  const k = snap ? 1 : Math.min(1, dt * rate);
  const dy = y - p.y;
  const dh = Math.hypot(x - p.x, z - p.z);
  p.x += (x - p.x) * k;
  p.y += (y - p.y) * k;
  p.z += (z - p.z) * k;
  const dyaw = wrapA(yaw - p.yaw);
  p.yaw = wrapA(p.yaw + dyaw * Math.min(1, dt * rate * 1.5));
  const pw = clamp(-Math.atan2(dy, Math.max(0.05, dh)), -0.5, 0.5);
  p.pitch += (pw - p.pitch) * Math.min(1, dt * 1.5);
  const rw = clamp(-dyaw * 1.2, -0.45, 0.45);
  p.roll += (rw - p.roll) * Math.min(1, dt * 1.2);
}

/** the heading from a to b */
export const yawTo = (ax: number, az: number, bx: number, bz: number) => Math.atan2(bx - ax, bz - az);

/** step a non-megalodon creature: its target now and a little later give its heading */
export function stepCreature(m: Creature, t: number, dt: number): void {
  const p = m.pose;
  p.scale = m.scale;
  if (m.kind === "fixed") {
    toWorld(m.hs, m.hu, lp);
    p.x = lp.x;
    p.y = m.hy;
    p.z = lp.z;
    p.yaw = GROTTO.yaw;
    p.pitch = 0;
    p.roll = 0;
    m.started = true;
    return;
  }
  if (m.kind === "loop") {
    loopTarget(m, t, lp);
    loopTarget(m, t, lp2, 1.5);
  } else if (m.kind === "jet") {
    const th = jetTheta(m, t);
    const saveS = m.speed;
    m.speed = 1;
    loopTarget(m, th, lp);
    loopTarget(m, th + 0.8, lp2);
    m.speed = saveS;
  } else if (m.kind === "hover") {
    hoverTarget(m, t, lp);
    hoverTarget(m, t + 1.5, lp2);
  } else {
    crawlTarget(m, t, lp);
    crawlTarget(m, t + 1, lp2);
  }
  const moving = Math.hypot(lp2.x - lp.x, lp2.z - lp.z) > 0.01;
  const yaw = moving ? yawTo(lp.x, lp.z, lp2.x, lp2.z) : p.yaw;
  easePose(p, lp.x, lp.y, lp.z, yaw, dt, m.kind === "crawl" ? 3 : 1.5, !m.started);
  if (m.kind === "crawl") {
    p.pitch = 0;
    p.roll = 0;
  }
  if (m.pitch0) p.pitch = m.pitch0 + Math.sin(t * 0.2 + m.seed) * 0.08;
  m.started = true;
}

/**
 * An escort: while the kid is down in the rift it drifts round them (6-9 m away, a slow orbit at
 * about their height, kept in the water and off the rock); otherwise it hovers at home. It swims
 * there at a sensible speed (a far one first slips in quietly ~55 m away along the rift).
 */
export function stepEscort(m: Creature, t: number, dt: number, kid: KidInfo): void {
  const p = m.pose;
  p.scale = m.scale;
  const inRift = kid.s === kid.s && kid.y < RIM_Y - 3;
  let tx: number;
  let ty: number;
  let tz: number;
  if (inRift) {
    const dir = m.seed % 2 ? 1 : -1;
    const a = m.seed * 2.39 + t * (0.08 + (m.seed % 3) * 0.02) * dir;
    tx = kid.x + Math.sin(a) * m.r;
    tz = kid.z + Math.cos(a) * m.r;
    ty = kid.y + 0.8 + Math.sin(t * 0.23 + m.seed) * 1.6;
    // keep it in the water: pull it in towards the kid while that spot is inside the rock
    for (let k = 0; k < 8 && floorY(tx, tz) + 0.8 + m.radius > ty; k++) {
      tx = kid.x + (tx - kid.x) * 0.72;
      tz = kid.z + (tz - kid.z) * 0.72;
    }
    ty = Math.max(ty, floorY(tx, tz) + 0.8 + m.radius);
    if (!m.started || Math.hypot(p.x - kid.x, p.z - kid.z) > 90) {
      // (slip in out of sight, along the rift)
      const s = clamp(kid.s + (m.seed % 2 ? 42 : -42), 20, RIFT_L - 20);
      toWorld(s, 0, lp);
      p.x = lp.x;
      p.z = lp.z;
      p.y = Math.max(kid.y, floorAt(s, 0) + 2);
    }
  } else {
    hoverTarget(m, t, lp);
    tx = lp.x;
    ty = lp.y;
    tz = lp.z;
    if (!m.started) {
      p.x = tx;
      p.y = ty;
      p.z = tz;
    }
  }
  m.started = true;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const dz = tz - p.z;
  const d = Math.hypot(dx, dy, dz);
  const step = Math.min(d, Math.min(8, 0.5 + d * 0.3) * dt);
  if (d > 1e-4) {
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
    p.z += (dz / d) * step;
  }
  // stay off the rock on the way
  p.y = Math.max(p.y, floorY(p.x, p.z) + 0.5 + m.radius);
  if (Math.hypot(dx, dz) > 0.05) {
    const yaw = Math.atan2(dx, dz);
    const dyaw = wrapA(yaw - p.yaw);
    p.yaw = wrapA(p.yaw + dyaw * Math.min(1, dt * 1.2));
    p.roll += (clamp(-dyaw * 0.8, -0.35, 0.35) - p.roll) * Math.min(1, dt);
  }
  p.pitch += (clamp(-Math.atan2(dy, Math.max(0.5, Math.hypot(dx, dz))), -0.4, 0.4) - p.pitch) * Math.min(1, dt);
}

/** the giant octopus's mood: how far it reaches towards the kid (0..1) given the distance */
export function octoReach(dist: number): number {
  return clamp(1 - (dist - 7) / 16, 0, 1);
}

