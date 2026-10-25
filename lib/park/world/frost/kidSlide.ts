// The Park kid on Frostpeak's penguin slides — pure maths, allocation-free per step, no three.js
// (tested). Walk up to a chute's start arch on Slide Top and the HUD offers "🐧 Slide!": the kid
// flops onto their tummy, toboggans down the chute (faster on the steep bits, up to a cap), swings
// out round the bends and leans into them, nudges left / right with the joystick between the chute's
// walls — and SPLASHES into the sea at the bottom, carrying on as a swimmer.
// The penguins take turns with the kid (./colony.ts colonyKidChute): while the kid waits at a chute
// its queue stands aside, and the kid sets off only once the chute's first stretch is clear — and
// then always keeps a safe gap behind any penguin still sliding ahead.
import { FROST_SLIDES, FROST_WATER_Y, SLIDE_HALF, frostSlideSplash } from "../../registry/frostIsland";

/** half the kid's shoulder width lying on their tummy (they stay this far inside the walls) */
export const KID_HALF_W = 0.5;
/** the furthest off the centreline the kid's middle can get */
export const SLIDE_LAT_MAX = SLIDE_HALF - KID_HALF_W;
/** top speed (units/s; the penguins top out at 10) */
export const SLIDE_VMAX = 12;
/** the start zone: this close to a chute's first point, on the terrace side */
export const SLIDE_START_R = 2.6;
/** always this far behind a penguin sliding ahead */
export const SLIDE_GAP = 3.5;

interface Chute {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  /** distance along */
  u: Float32Array;
  /** heading (atan2 convention) and the downhill slope at each sample */
  head: Float32Array;
  slope: Float32Array;
  /** curvature (rad per unit, + = bending left) */
  curv: Float32Array;
  len: number;
  splashS: number;
  name: string;
}
const CHUTES: Chute[] = FROST_SLIDES.map((s) => {
  const n = s.path.length;
  const x = Float32Array.from(s.path, (p) => p.x);
  const y = Float32Array.from(s.path, (p) => p.y);
  const z = Float32Array.from(s.path, (p) => p.z);
  const u = new Float32Array(n);
  for (let i = 1; i < n; i++) u[i] = u[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
  const head = new Float32Array(n);
  const slope = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    head[i] = Math.atan2(x[b] - x[a], z[b] - z[a]);
    slope[i] = (y[a] - y[b]) / (u[b] - u[a] || 1);
  }
  const curv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 2);
    const b = Math.min(n - 1, i + 2);
    let d = head[b] - head[a];
    d = Math.atan2(Math.sin(d), Math.cos(d));
    curv[i] = d / (u[b] - u[a] || 1);
  }
  return { x, y, z, u, head, slope, curv, len: u[n - 1], splashS: u[frostSlideSplash(s)], name: s.name };
});

/** the chute whose start zone (x, z) is in, or -1 (behind its first point, on the terrace) */
export function slideStartAt(x: number, z: number): number {
  for (let c = 0; c < CHUTES.length; c++) {
    const C = CHUTES[c];
    const dx = x - C.x[0];
    const dz = z - C.z[0];
    if (dx * dx + dz * dz > SLIDE_START_R * SLIDE_START_R) continue;
    // (along the chute's first heading: not past the arch)
    const along = dx * Math.sin(C.head[0]) + dz * Math.cos(C.head[0]);
    if (along < 1.4) return c;
  }
  return -1;
}
export const slideName = (c: number) => CHUTES[c]?.name ?? "";
export const slideSplashS = (c: number) => CHUTES[c].splashS;

export interface KidSlide {
  chute: number;
  /** distance down the chute (< 0: the run-up on the terrace, behind the start line) */
  s: number;
  /** offset from the centreline (left +), and its rate */
  lat: number;
  latV: number;
  v: number;
  t: number;
  /** waiting for the chute's first stretch to clear */
  waiting: boolean;
  done: boolean;
  /** where along it the chute meets the sea */
  splashS: number;
  // the pose, out: where the kid's middle is (on the chute's floor), facing, the slope's pitch, lean
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** the slope under the kid (atan, + = nose down) */
  pitch: number;
  /** lean into the bend (+ = leaning left) */
  lean: number;
  /** the downhill direction (unit) */
  dx: number;
  dz: number;
  /** events this step: a snow puff off the side, a bump on a wall, the splash */
  puff: boolean;
  bump: boolean;
  splash: boolean;
  nextPuff: number;
}

/** start a slide on chute c from where the kid stands (behind the start line: a little run-up) */
export function makeKidSlide(c: number, x: number, z: number): KidSlide {
  const C = CHUTES[c];
  const hx = Math.sin(C.head[0]);
  const hz = Math.cos(C.head[0]);
  const dx = x - C.x[0];
  const dz = z - C.z[0];
  const along = dx * hx + dz * hz;
  // (left = (hz, -hx))
  const side = dx * hz - dz * hx;
  const k: KidSlide = {
    chute: c,
    s: Math.min(0, along),
    lat: Math.max(-SLIDE_LAT_MAX, Math.min(SLIDE_LAT_MAX, side)),
    latV: 0,
    v: 1.6,
    t: 0,
    waiting: true,
    done: false,
    splashS: C.splashS,
    x,
    y: C.y[0],
    z,
    yaw: C.head[0],
    pitch: 0,
    lean: 0,
    dx: hx,
    dz: hz,
    puff: false,
    bump: false,
    splash: false,
    nextPuff: 2,
  };
  place(k);
  return k;
}

function sampleAt(C: Chute, s: number): number {
  // (binary search for the segment)
  let lo = 1;
  let hi = C.u.length - 1;
  const d = Math.min(C.len, Math.max(0, s));
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (C.u[m] < d) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** write the pose for (s, lat) */
function place(k: KidSlide) {
  const C = CHUTES[k.chute];
  if (k.s < 0) {
    const hx = Math.sin(C.head[0]);
    const hz = Math.cos(C.head[0]);
    k.x = C.x[0] + hx * k.s + hz * k.lat;
    k.z = C.z[0] + hz * k.s - hx * k.lat;
    k.y = C.y[0];
    k.dx = hx;
    k.dz = hz;
    k.yaw = C.head[0];
    k.pitch = 0;
    return;
  }
  const i = sampleAt(C, k.s);
  const seg = C.u[i] - C.u[i - 1] || 1;
  const f = (Math.min(C.len, k.s) - C.u[i - 1]) / seg;
  const dx = (C.x[i] - C.x[i - 1]) / seg;
  const dz = (C.z[i] - C.z[i - 1]) / seg;
  k.dx = dx;
  k.dz = dz;
  k.x = C.x[i - 1] + (C.x[i] - C.x[i - 1]) * f + dz * k.lat;
  k.z = C.z[i - 1] + (C.z[i] - C.z[i - 1]) * f - dx * k.lat;
  k.y = C.y[i - 1] + (C.y[i] - C.y[i - 1]) * f;
  k.yaw = Math.atan2(dx, dz);
  k.pitch = Math.atan((C.y[i - 1] - C.y[i]) / seg);
}

/**
 * One step: `steer` -1..1 (the joystick's sideways push: + = to the kid's LEFT), `clear` = the
 * chute's first stretch is free of penguins, `aheadS` = how far down the chute the nearest penguin
 * ahead is (Infinity: nobody). Sets `done` + `splash` on hitting the sea.
 */
export function stepKidSlide(k: KidSlide, dtIn: number, steer: number, clear: boolean, aheadS: number): KidSlide {
  const dt = Math.min(0.1, Math.max(0, dtIn));
  k.puff = false;
  k.bump = false;
  k.splash = false;
  if (k.done) return k;
  k.t += dt;
  const C = CHUTES[k.chute];
  if (k.waiting) {
    // lying ready at the start, wriggling, until the penguin ahead is well on its way
    if (clear && k.t > 0.35) {
      k.waiting = false;
      k.puff = true;
    }
    place(k);
    return k;
  }
  const i = sampleAt(C, Math.max(0, k.s));
  const wet = k.s > C.splashS;
  const slope = k.s < 0 ? 0 : C.slope[i];
  const curv = k.s < 0 ? 0 : C.curv[i];
  // gravity down the slope, a little friction and air drag; a push with the hands on the flat start
  let a = 9.8 * slope * 0.8 - 0.3 - 0.012 * k.v * k.v;
  if (slope < 0.08 && k.v < 4 && !wet) a += 2.4;
  // (in the sea: the water slows you right down)
  if (wet) a = -3 - 0.2 * k.v * k.v;
  // (gliding on at least until the water's deep enough to swim in)
  const deep = k.y < FROST_WATER_Y - 1.15;
  k.v = Math.max(wet ? (deep ? 0 : 1.6) : 1.2, Math.min(SLIDE_VMAX, k.v + a * dt));
  // never closer than SLIDE_GAP to a penguin still sliding ahead
  if (aheadS - k.s < SLIDE_GAP + 3) k.v = Math.min(k.v, Math.max(0.8, (aheadS - k.s - SLIDE_GAP) * 2));
  // sideways: the joystick, and swinging out round the bends (banked: only a little)
  const out = -curv * k.v * k.v * 0.18;
  k.latV += (steer * 7 + out - k.latV * 2.6) * dt;
  k.lat += k.latV * dt;
  // the walls: bump off them (a puff of snow), losing a little speed
  if (k.lat > SLIDE_LAT_MAX || k.lat < -SLIDE_LAT_MAX) {
    k.lat = Math.max(-SLIDE_LAT_MAX, Math.min(SLIDE_LAT_MAX, k.lat));
    if (Math.abs(k.latV) > 1.2) {
      k.bump = true;
      k.v *= 0.97;
    }
    k.latV *= -0.3;
  }
  const s0 = k.s;
  k.s += k.v * dt;
  place(k);
  // lean into the bend (and with the joystick)
  const want = Math.max(-0.55, Math.min(0.55, curv * k.v * k.v * 0.05 + steer * 0.2));
  k.lean += (want - k.lean) * Math.min(1, dt * 6);
  // snow puffs off the sides, faster the faster you go
  if (k.s > k.nextPuff && k.v > 3 && !wet) {
    k.puff = true;
    k.nextPuff = k.s + Math.max(1.4, 6 - k.v * 0.4);
  }
  if (s0 < C.splashS && k.s >= C.splashS) k.splash = true;
  // ...gliding on under the water a moment, then you're swimming
  if (k.s >= C.len - 0.3 || (wet && deep && k.v < 2.2)) k.done = true;
  return k;
}

// ── the pet slides down too, on its tummy, a few metres behind the kid ──

/** how far behind the kid (along the chute) the pet slides */
export const PET_SLIDE_GAP = 3.2;
let petScratch: KidSlide | null = null;
/**
 * Where the pet is on the kid's chute: lying ready just behind the kid while they wait, then sliding
 * the same line PET_SLIDE_GAP behind them (it splashes in just after the kid does). Writes x, y, z
 * (the chute's floor), yaw, pitch; returns its distance down the chute.
 */
export function petSlidePose(k: KidSlide, out: { x: number; y: number; z: number; yaw: number; pitch: number }): number {
  if (!petScratch) petScratch = makeKidSlide(k.chute, CHUTES[k.chute].x[0], CHUTES[k.chute].z[0]);
  const q = petScratch;
  q.chute = k.chute;
  q.s = k.waiting ? Math.min(k.s, 0) - 1.6 : k.s - PET_SLIDE_GAP;
  q.lat = k.waiting ? Math.max(-SLIDE_LAT_MAX, Math.min(SLIDE_LAT_MAX, k.lat - 0.7)) : k.lat * 0.6;
  place(q);
  out.x = q.x;
  out.y = q.y;
  out.z = q.z;
  out.yaw = q.yaw;
  out.pitch = q.pitch;
  return q.s;
}

/** the chutes, for tests */
export const KID_CHUTES = CHUTES;
