// Cucaino Karts: the FUN layer on top of the driving — item boxes, coins, drift boosts, the jump.
//
// Everything here is pure (no three.js, no clock, randomness only through the `rnd` you pass in),
// and none of it touches physics.ts: the race loop reads a kart's KartFun and turns it into a
// top-speed multiplier (funPower) or a one-off shove (applyShove), so the driving model and its
// tests stay exactly as they are.
//
//   - item boxes: drive through a spinning "?" box, the item rolls for a moment, tap to use it
//       rocket  a big burst of speed
//       banana  dropped behind you; any kart that hits it spins round
//       shield  a bubble that swallows the next banana or star bump
//       star    a few seconds of rainbow: faster, nothing can spin you, and you spin whoever you touch
//     the further back you are, the better the items (a kid in last place gets rockets and stars)
//   - coins: each one makes the kart a tiny bit faster (up to 10); a spin drops three
//   - drift boost: hold a turn through a corner and sparks build up under the back wheels — blue,
//     then orange; straighten up and you get a little boost (a bigger one for orange)
//   - the jump: a ramp on the main straight; every kart hops it and lands with a little shove
import { trackAt, type KartTrack } from "./track";
import { BOOST_MAX_SPEED, type KartPhysState } from "./physics";

export type KartItem = "rocket" | "banana" | "shield" | "star";
export const KART_ITEMS: readonly KartItem[] = ["rocket", "banana", "shield", "star"];
export const ITEM_EMOJI: Record<KartItem, string> = { rocket: "🚀", banana: "🍌", shield: "🫧", star: "⭐" };
export const ITEM_NAME: Record<KartItem, string> = { rocket: "Rocket", banana: "Banana", shield: "Bubble", star: "Star" };

export interface CourseSpot {
  id: number;
  s: number;
  lateral: number;
  x: number;
  z: number;
}
export interface KartCourse {
  boxes: CourseSpot[];
  coins: CourseSpot[];
  /** the jump: the ramp's lip is at `s`; a kart crossing it fast enough takes off */
  ramp: { s: number; len: number };
}

/** the four rows of item boxes (on the straighter bits), where the coin trails start, the ramp
 *  (distances round the 790 m lap; items.test.ts checks they're all on the road and clear of the
 *  boost pads and each other) */
const BOX_ROWS = [68, 268, 415, 606];
const BOX_LATERALS = [-3.6, -1.2, 1.2, 3.6];
const COIN_TRAILS: [number, number][] = [
  [100, 2.4],
  [150, 1.6],
  [188, -1.5],
  [244, 0],
  [298, 2.2],
  [352, -1.8],
  [384, 1.4],
  [438, -1.6],
  [488, 2.2],
  [548, 0],
  [652, 2.4],
  [702, 1.2],
  [754, 2],
];
const COINS_PER_TRAIL = 5;
const COIN_GAP = 3.6;
const RAMP_S = 16;

function spot(track: KartTrack, id: number, s: number, lateral: number): CourseSpot {
  const at = trackAt(track, s);
  // (track.ts: positive lateral = LEFT of the way the road runs = centre + (-dz, dx) * lateral)
  return { id, s: ((s % track.length) + track.length) % track.length, lateral, x: at.x - at.dz * lateral, z: at.z + at.dx * lateral };
}

export function buildKartCourse(track: KartTrack): KartCourse {
  const k = track.length / 791.59; // (the rows were laid out on the 790 m circuit; scale with it)
  const boxes: CourseSpot[] = [];
  for (const s of BOX_ROWS) for (const lat of BOX_LATERALS) boxes.push(spot(track, boxes.length, s * k, lat));
  const coins: CourseSpot[] = [];
  for (const [s, lat] of COIN_TRAILS) for (let i = 0; i < COINS_PER_TRAIL; i++) coins.push(spot(track, coins.length, s * k + i * COIN_GAP, lat));
  return { boxes, coins, ramp: { s: RAMP_S * k, len: 3.2 } };
}

export const BOX_RADIUS = 1.9;
export const COIN_RADIUS = 1.8;
export const BANANA_RADIUS = 1.55;
export const STAR_TOUCH = 2.7;
export const BOX_RESPAWN = 3.5;
export const COIN_RESPAWN = 14;
export const MAX_COINS = 10;
const COIN_POWER = 0.006;
const ROLL_TIME = 1.1;
export const SPIN_TIME = 1.15;
const STAR_TIME = 6;
const SHIELD_TIME = 12;
const STAR_POWER = 1.13;

/** what the fun layer remembers about one kart */
export interface KartFun {
  held: KartItem | null;
  /** seconds of "rolling" left before `held` can be used (the HUD spins the slot meanwhile) */
  rollT: number;
  shieldT: number;
  starT: number;
  /** seconds of spinning round left (hit a banana / bumped by a star) */
  spinT: number;
  coins: number;
  /** how long the current turn has been held (s), and which way (-1 / 0 / 1) */
  driftT: number;
  driftDir: number;
  /** in the air: seconds since take-off (-1 = on the ground), flight time and peak height */
  airT: number;
  airDur: number;
  airH: number;
  /** can't be hit again for this long (just after a spin, or just after dropping a banana) */
  safeT: number;
}

export function newKartFun(): KartFun {
  return { held: null, rollT: 0, shieldT: 0, starT: 0, spinT: 0, coins: 0, driftT: 0, driftDir: 0, airT: -1, airDur: 0, airH: 0, safeT: 0 };
}

/** which item a box gives: the further back you are, the better it is. `rnd` in [0, 1). */
export function rollItem(position: number, total: number, rnd: number): KartItem {
  const back = total <= 1 ? 0.5 : (Math.max(1, Math.min(total, position)) - 1) / (total - 1); // 0 = leading, 1 = last
  // weights: [rocket, banana, shield, star]
  const lead = [18, 46, 36, 0];
  const last = [44, 8, 12, 36];
  const w = lead.map((a, i) => a + (last[i] - a) * back);
  let r = Math.max(0, Math.min(0.999999, rnd)) * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r < 0) return KART_ITEMS[i];
  }
  return "rocket";
}

/** the kart's top-speed multiplier from coins / the star / spinning */
export function funPower(f: KartFun): number {
  if (f.spinT > 0) return 0.3;
  return (1 + COIN_POWER * Math.min(MAX_COINS, f.coins)) * (f.starT > 0 ? STAR_POWER : 1);
}

/** counts every timer down by dt (call once per tick, before anything else) */
export function tickFun(f: KartFun, dt: number): KartFun {
  return {
    ...f,
    rollT: Math.max(0, f.rollT - dt),
    shieldT: Math.max(0, f.shieldT - dt),
    starT: Math.max(0, f.starT - dt),
    spinT: Math.max(0, f.spinT - dt),
    safeT: Math.max(0, f.safeT - dt),
    airT: f.airT >= 0 ? (f.airT + dt >= f.airDur ? -1 : f.airT + dt) : -1,
  };
}

/** drove through an item box: starts the roll (nothing happens if already holding one) */
export function takeBox(f: KartFun, item: KartItem): KartFun {
  if (f.held) return f;
  return { ...f, held: item, rollT: ROLL_TIME };
}
export const canUseItem = (f: KartFun) => f.held !== null && f.rollT <= 0 && f.spinT <= 0;

export function addCoin(f: KartFun): KartFun {
  return { ...f, coins: Math.min(MAX_COINS, f.coins + 1) };
}

export type HitResult = "spin" | "shield" | "none";
/** a banana / a star kart got this kart: the star shrugs it off, the bubble pops, otherwise it spins */
export function hitKart(f: KartFun): { fun: KartFun; result: HitResult } {
  if (f.starT > 0 || f.safeT > 0 || f.spinT > 0) return { fun: f, result: "none" };
  if (f.shieldT > 0) return { fun: { ...f, shieldT: 0, safeT: 0.6 }, result: "shield" };
  return { fun: { ...f, spinT: SPIN_TIME, safeT: SPIN_TIME + 1.2, coins: Math.max(0, f.coins - 3), driftT: 0, driftDir: 0 }, result: "spin" };
}

/** uses the held item. Bananas are the caller's job to drop (it gets `item` back to know). */
export function useItem(f: KartFun): { fun: KartFun; item: KartItem | null } {
  if (!canUseItem(f)) return { fun: f, item: null };
  const item = f.held!;
  const fun: KartFun = { ...f, held: null };
  if (item === "shield") fun.shieldT = SHIELD_TIME;
  if (item === "star") fun.starT = STAR_TIME;
  if (item === "banana") fun.safeT = Math.max(fun.safeT, 0.9); // (never slip on your own banana as it leaves)
  return { fun, item };
}

/** a one-off burst of speed on top of the driving model (rocket, drift boost, landing the jump) */
export function applyShove(k: KartPhysState, addSpeed: number, boostSeconds: number): KartPhysState {
  return { ...k, speed: Math.min(BOOST_MAX_SPEED, Math.max(k.speed, 0) + addSpeed), boostT: Math.max(k.boostT, boostSeconds) };
}
export const ROCKET_SHOVE: [number, number] = [11, 2.3];
export const DRIFT_SHOVE: [[number, number], [number, number]] = [
  [3.5, 0.65],
  [6.5, 1.25],
];
export const LANDING_SHOVE: [number, number] = [2.5, 0.45];

export const DRIFT_TIER1 = 0.85;
export const DRIFT_TIER2 = 1.75;
/** which spark colour a held turn has earned so far: 0 none, 1 blue, 2 orange */
export const driftTier = (f: KartFun) => (f.driftT >= DRIFT_TIER2 ? 2 : f.driftT >= DRIFT_TIER1 ? 1 : 0);

/** the drift charge: holding a hard turn at speed builds it; letting go (or turning the other way)
 *  cashes it in — `released` is the tier earned (0 = nothing). Slowing right down or leaving the
 *  road loses it. */
export function stepDrift(f: KartFun, steer: number, speed: number, offTrack: boolean, dt: number): { fun: KartFun; released: 0 | 1 | 2 } {
  const dir = Math.abs(steer) > 0.6 ? Math.sign(steer) : 0;
  if (f.spinT > 0 || offTrack || speed < 10) return { fun: f.driftT ? { ...f, driftT: 0, driftDir: 0 } : f, released: 0 };
  if (dir !== 0 && (f.driftDir === 0 || f.driftDir === dir)) return { fun: { ...f, driftT: f.driftT + dt, driftDir: dir }, released: 0 };
  const released = driftTier(f) as 0 | 1 | 2;
  if (!f.driftT && !f.driftDir) return { fun: f, released: 0 };
  return { fun: { ...f, driftT: 0, driftDir: 0 }, released };
}

/** did the kart just drive over the ramp's lip (moving forward, fast enough to take off)? */
export function crossedRamp(course: KartCourse, trackLength: number, sPrev: number, sNow: number, speed: number): boolean {
  if (speed < 9) return false;
  let ds = sNow - sPrev;
  if (ds < -trackLength / 2) ds += trackLength;
  if (ds <= 0 || ds > 6) return false;
  let rel = course.ramp.s - sPrev;
  if (rel < -trackLength / 2) rel += trackLength;
  return rel > 0 && rel <= ds;
}
/** takes off: the faster, the higher and further */
export function takeOff(f: KartFun, speed: number): KartFun {
  return { ...f, airT: 0, airDur: 0.42 + speed / 58, airH: 0.45 + speed * 0.052 };
}
/** how high off the road the kart is right now (0 on the ground) */
export function airHeight(f: KartFun): number {
  if (f.airT < 0 || f.airDur <= 0) return 0;
  const u = f.airT / f.airDur;
  return f.airH * 4 * u * (1 - u);
}
export const inAir = (f: KartFun) => f.airT >= 0;

export interface Banana {
  id: string;
  x: number;
  z: number;
  /** seconds it's been lying there */
  age: number;
}
export const BANANA_LIFE = 45;
export const MAX_BANANAS = 10;
/** where a banana lands: just behind the kart that dropped it */
export function bananaDrop(k: { x: number; z: number; yaw: number }): { x: number; z: number } {
  return { x: k.x - Math.sin(k.yaw) * 2.6, z: k.z - Math.cos(k.yaw) * 2.6 };
}
export const near = (ax: number, az: number, bx: number, bz: number, r: number) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz) < r * r;
