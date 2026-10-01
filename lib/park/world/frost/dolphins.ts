// Playful bottlenose dolphin pods that roam the whole ocean and come to play with the Park kid.
//
// 2–3 pods (4–7 dolphins each, every pod with a little calf tucked in beside its mum) wander the open
// sea round wherever the kid is (anything left far behind is quietly moved out of sight ahead, like
// the rest of the sea's life — ../sea/wander.ts). When the kid is out in the open sea (swimming at or
// under the surface, or sailing), one pod finds them:
//   seek     it homes in from out of the blue
//   escort   swims alongside the kid (underwater at the kid's depth if they're diving)
//   circle   circles round them, blowing bubble rings
//   play     leaps out of the water all round them, splashing
//   leave    and then it's off on its way again (a while later, another pod may come)
// Roaming pods ride the surface too, leaping in waves one after another. They keep to the water:
// they steer away from shallows (the park's island, Coralcove, Frostpeak's slopes and icebergs) and
// never go through the sea floor.
// Cheap: one instanced mesh (the underwater kit's material: a swimming tail-beat, caustics, rim
// light), one instanced mesh of bubble rings, one set of points for splashes and bubbles — 3 draw
// calls, allocation-free per frame, deterministic.
import * as THREE from "three";
import { WATER_Y } from "../../registry/terrain";
import { FROST_BERGS, FROST_ISLAND, FROST_SEA_R, frostSeaFloorY } from "../../registry/frostIsland";
import { deepestHeading, makeFocusTracker, makeSwimmer, respawn, seaFloorY, shiftSwimmers, trackFocus, wiggle, wrapAngle, type FocusTracker, type Swimmer, type SwimStyle } from "../sea/wander";
import { makeCausticTexture, makeUwUniforms, uwMaterial } from "../underwater/shaders";
import { mergeAll, pp, type Fx } from "../village/kit";
import { pointsMaterial } from "./fx";

const TAU = Math.PI * 2;
const WY = WATER_Y;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const smooth = (a: number, b: number, x: number) => {
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};

// ── where the water is ──

/** the sea floor as a dolphin sees it: the sea's floor (all the islands it knows) and Frostpeak's
 *  slopes. (Frostpeak's icebergs are steered round separately.) */
export function dolphinFloor(x: number, z: number): number {
  const f = seaFloorY(x, z);
  const ff = frostSeaFloorY(x, z);
  return ff !== null && ff > f ? ff : f;
}
/** keep this far from an iceberg's waterline edge / from the kid */
const BERG_PAD = 3;
const KID_PAD = 2.4;
export const dolphinDepth = (x: number, z: number) => WY - dolphinFloor(x, z);

// ── true size ──
// The Park kid is 2.26 units tall (a real ~1.4 m ten-year-old): 1 m = 1.6 units. The model is 2.6
// units nose to fluke; a grown bottlenose dolphin is ~2.5 m, a young calf ~1.2 m.
export const DOLPHIN_TRUE_M = { adult: 2.5, calf: 1.2 } as const;
const MODEL_L = 2.6;
export const DOLPHIN_K = (1.6 * DOLPHIN_TRUE_M.adult) / MODEL_L;
const CALF_K = (1.6 * DOLPHIN_TRUE_M.calf) / MODEL_L;
const LEAP_K = Math.sqrt(DOLPHIN_K);

export const DOLPHIN_STYLE: SwimStyle = { speed: [4.5, 6.5], turn: 0.6, wander: 0.06, depth: [0.8, 3.2], clear: 1.8, need: 6, look: 22, climb: 1.8, bank: 1.3 };
/** the kid counts as "out in the open sea" over water at least this deep */
export const OPEN_SEA_DEPTH = 6;

// ── the pods (pure) ──

export const M_ROAM = 0;
export const M_SEEK = 1;
export const M_ESCORT = 2;
export const M_CIRCLE = 3;
export const M_PLAY = 4;
export const M_LEAVE = 5;
export const MODE_NAMES = ["roam", "seek", "escort", "circle", "play", "leave"];

export interface Dolphin extends Swimmer {
  calf: boolean;
  size: number;
  /** ballistic leap in progress */
  leaping: boolean;
  leapVy: number;
  /** waiting to leap (s; < 0 = not waiting) */
  leapIn: number;
  /** tail-beat phase (for the shader) and strength */
  phase: number;
  beat: number;
  /** formation slot behind/beside the leader (or, for the calf, its mum) */
  side: number;
  back: number;
  lift: number;
  /** was above the water last step (for splashes) */
  above: boolean;
}

export interface Pod {
  members: Dolphin[];
  mode: number;
  t: number;
  dur: number;
  /** until this pod may come and play again */
  cool: number;
  dir: number;
  /** until the next leap wave */
  wave: number;
  /** until the next bubble ring */
  ring: number;
  /** leave heading */
  away: number;
}

export interface PodSim {
  pods: Pod[];
  ft: FocusTracker;
  rnd: () => number;
  engaged: number;
  /** until another pod may come (s) */
  wait: number;
  started: boolean;
  slowT: number;
  /** the kid (dolphins swim round them, never through them) */
  kx: number;
  ky: number;
  kz: number;
  /** x, y, z, size, kind (0 splash, 1 small splash, 2 bubbles, 3 bubble ring, 4 blow) */
  ev: { buf: Float32Array; n: number };
}
export const DEV_SPLASH = 0;
export const DEV_SPLISH = 1;
export const DEV_BUBBLES = 2;
export const DEV_RING = 3;
const MAX_EV = 48;

function rngOf(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function makePods(low: boolean, seed = 2024): PodSim {
  const rnd = rngOf(seed);
  const sizes = low ? [5, 4] : [6, 5, 7];
  const pods: Pod[] = sizes.map((n, pi) => {
    const members: Dolphin[] = [];
    for (let k = 0; k < n; k++) {
      const calf = k === n - 1;
      const s = makeSwimmer(0, WY - 1.5, 0, 0, pi * 37 + k * 11 + 3, 5);
      members.push({
        ...s,
        calf,
        size: calf ? CALF_K : DOLPHIN_K * (0.92 + rnd() * 0.16),
        leaping: false,
        leapVy: 0,
        leapIn: -1,
        phase: rnd() * TAU,
        beat: 1,
        // (formation slots: spaced for true-size bodies)
        side: (calf ? 1.1 : k === 0 ? 0 : (k % 2 ? 1 : -1) * (1.8 + Math.floor((k - 1) / 2) * 1.2)) * DOLPHIN_K,
        back: (calf ? 0.5 : k === 0 ? 0 : 1.6 + Math.floor((k - 1) / 2) * 1.9) * DOLPHIN_K,
        lift: (calf ? 0.35 : (rnd() - 0.5) * 0.8) * DOLPHIN_K,
        above: false,
      });
    }
    return { members, mode: M_ROAM, t: 0, dur: 0, cool: 10 + pi * 20, dir: pi % 2 ? 1 : -1, wave: 3 + rnd() * 6, ring: 1, away: 0 };
  });
  return { pods, ft: makeFocusTracker(), rnd, engaged: -1, wait: 6, started: false, slowT: 0, kx: 0, ky: 0, kz: 0, ev: { buf: new Float32Array(MAX_EV * 5), n: 0 } };
}

function emit(sim: PodSim, x: number, y: number, z: number, size: number, kind: number) {
  const e = sim.ev;
  if (e.n >= MAX_EV) return;
  const o = e.n * 5;
  e.buf[o] = x;
  e.buf[o + 1] = y;
  e.buf[o + 2] = z;
  e.buf[o + 3] = size;
  e.buf[o + 4] = kind;
  e.n++;
}

/** the way out to deep water from (x, z): away from Frostpeak when near it, else the sea's own rule */
function awayHeading(s: Swimmer): number {
  const fx = s.x - FROST_ISLAND.x;
  const fz = s.z - FROST_ISLAND.z;
  if (fx * fx + fz * fz < (FROST_SEA_R + 50) ** 2) return Math.atan2(fx, fz);
  return deepestHeading(s);
}

/** 0..1: how urgently `s` must turn away from shallow water ahead */
function shallowUrgency(s: Swimmer, need: number, look: number): number {
  const fx = Math.sin(s.yaw);
  const fz = Math.cos(s.yaw);
  const worst = Math.min(dolphinDepth(s.x, s.z) * 1.15, dolphinDepth(s.x + fx * look, s.z + fz * look), dolphinDepth(s.x + fx * look * 0.5, s.z + fz * look * 0.5));
  const margin = need * 1.35;
  return worst < margin ? clamp((margin - worst) / (need * 0.5), 0, 1) : 0;
}

/** one step: turn towards `wantYaw`, ease to speed `vWant`, glide to height `ty` (or fly a leap) */
function drive(sim: PodSim, d: Dolphin, wantYaw: number, vWant: number, ty: number, dt: number, turn: number, need = DOLPHIN_STYLE.need) {
  // the shallows always win
  const urg = shallowUrgency(d, need, need < DOLPHIN_STYLE.need ? 10 : DOLPHIN_STYLE.look);
  // (headings are blended as directions, not angles — two turns the opposite way round can't cancel)
  let hx = Math.sin(wantYaw);
  let hz = Math.cos(wantYaw);
  if (urg > 0) {
    const aw = awayHeading(d);
    hx = hx * (1 - urg) + Math.sin(aw) * urg * 1.2;
    hz = hz * (1 - urg) + Math.cos(aw) * urg * 1.2;
  }
  // icebergs: slip round them (along whichever side is closer to where we want to go)
  for (let k = 0; k < FROST_BERGS.length; k++) {
    const b = FROST_BERGS[k];
    const bx = d.x - b.x;
    const bz = d.z - b.z;
    const bd = Math.hypot(bx, bz);
    if (bd > b.r + 16) continue;
    const toB = wrapAngle(Math.atan2(-bx, -bz) - d.yaw);
    if (Math.abs(toB) > 1.6 && bd > b.r + BERG_PAD + 1) continue;
    const away = Math.atan2(bx, bz);
    const t1 = away + Math.PI / 2;
    const t2 = away - Math.PI / 2;
    const tan = Math.abs(wrapAngle(t1 - wantYaw)) < Math.abs(wrapAngle(t2 - wantYaw)) ? t1 : t2;
    const k2 = 1 - smooth(b.r + BERG_PAD, b.r + 16, bd);
    const aim = bd < b.r + BERG_PAD + 1 ? away : tan;
    hx = hx * (1 - k2) + Math.sin(aim) * k2;
    hz = hz * (1 - k2) + Math.cos(aim) * k2;
  }
  const dy = wrapAngle(Math.atan2(hx, hz) - d.yaw);
  const want = clamp(dy * 2.2, -1, 1) * turn;
  d.yawRate += (want - d.yawRate) * Math.min(1, dt * 3);
  d.yaw = wrapAngle(d.yaw + d.yawRate * dt);
  d.speed += (vWant - d.speed) * Math.min(1, dt * 1.2);
  d.x += Math.sin(d.yaw) * d.speed * dt;
  d.z += Math.cos(d.yaw) * d.speed * dt;
  const floor = dolphinFloor(d.x, d.z);
  if (d.leaping) {
    d.leapVy -= 9.8 * dt;
    d.y += d.leapVy * dt;
    d.vy = d.leapVy;
    if (d.leapVy < 0 && d.y < WY - 0.7) {
      d.leaping = false;
      d.vy = d.leapVy * 0.35;
    }
  } else {
    const top = WY - 0.55 * d.size;
    const lo = floor + DOLPHIN_STYLE.clear * d.size;
    const target = lo >= top ? (lo + top) / 2 : clamp(ty, lo, top);
    const vw = clamp((target - d.y) * 0.9, -DOLPHIN_STYLE.climb * 1.5, DOLPHIN_STYLE.climb * 1.5);
    d.vy += (vw - d.vy) * Math.min(1, dt * 2.5);
    d.y += d.vy * dt;
    // a leap when asked and near the top
    if (d.leapIn >= 0) {
      d.leapIn -= dt;
      if (d.leapIn < 0) d.leapIn = 0;
      if (d.leapIn === 0 && d.y > WY - 1.8 && dolphinDepth(d.x, d.z) > 3.5) {
        d.leaping = true;
        // (a true-size dolphin clears 1.5–3 m of air)
        d.leapVy = ((d.calf ? 4.6 : 5.4) + sim.rnd() * 1.6) * LEAP_K;
        d.leapIn = -1;
      }
    }
  }
  // never inside an iceberg or the kid
  for (let k = 0; k < FROST_BERGS.length; k++) {
    const b = FROST_BERGS[k];
    const bx = d.x - b.x;
    const bz = d.z - b.z;
    const bd = Math.hypot(bx, bz) || 1;
    if (bd < b.r + 1.5) {
      d.x = b.x + (bx / bd) * (b.r + 1.5);
      d.z = b.z + (bz / bd) * (b.r + 1.5);
    }
  }
  {
    const kx = d.x - sim.kx;
    const ky = (d.y - sim.ky) * 1.4;
    const kz = d.z - sim.kz;
    const kd = Math.hypot(kx, ky, kz);
    const pad = KID_PAD * (0.6 + d.size * 0.5);
    if (kd < pad && kd > 1e-4) {
      const push = (pad - kd) / kd;
      d.x += kx * push;
      d.z += kz * push;
      d.y += (ky / 1.4) * push * 0.5;
    }
  }
  // never through the floor
  const minY = floor + 0.6 * d.size;
  if (d.y < minY) {
    d.y = minY;
    if (d.vy < 0) d.vy = 0;
    if (d.leaping && d.leapVy < 0) d.leaping = false;
  }
  // splashes crossing the surface
  const aboveNow = d.y > WY + 0.1;
  if (aboveNow !== d.above) emit(sim, d.x, WY, d.z, d.size * (aboveNow ? 0.8 : 1.1), aboveNow ? DEV_SPLISH : DEV_SPLASH);
  d.above = aboveNow;
  // pitch from the climb, bank from the turn
  const pWant = clamp(-Math.atan2(d.vy, Math.max(0.5, d.speed)), -1.2, 1.2);
  d.pitch += (pWant - d.pitch) * Math.min(1, dt * (d.leaping ? 8 : 3));
  const rWant = clamp(-d.yawRate * DOLPHIN_STYLE.bank, -0.8, 0.8);
  d.roll += (rWant - d.roll) * Math.min(1, dt * 2.5);
  // tail beat: faster when swimming hard, gliding in the air
  d.beat += ((d.leaping ? 0.1 : 0.6 + d.speed / 8) - d.beat) * Math.min(1, dt * 4);
  d.phase += dt * (3.5 + d.speed * 0.9) * (d.calf ? 1.35 : 1);
}

/** a follower's step: hold its slot beside/behind `lead` */
function holdSlot(sim: PodSim, d: Dolphin, lead: Dolphin, dt: number, t: number, need: number) {
  const fx = Math.sin(lead.yaw);
  const fz = Math.cos(lead.yaw);
  const tx = lead.x - fx * d.back + fz * d.side;
  const tz = lead.z - fz * d.back - fx * d.side;
  const dx = tx - d.x;
  const dz = tz - d.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 60) {
    d.x = tx;
    d.z = tz;
    d.y = lead.y;
    d.yaw = lead.yaw;
    d.leaping = false;
    d.vy = 0;
    return;
  }
  const along = -(dx * Math.sin(d.yaw) + dz * Math.cos(d.yaw));
  const vWant = clamp(lead.speed - along * 0.5 + (dist > 8 ? 2 : 0), 1.5, 11);
  const want = dist > 0.6 ? Math.atan2(dx, dz) : lead.yaw;
  drive(sim, d, want + wiggle(t * 0.3, d.seed) * 0.15, vWant, lead.y + d.lift, dt, 1.4, need);
}

/** is the kid out in the open sea (swimming at or under the surface, or sailing on it) */
export function kidInOpenSea(kid: { x: number; y: number; z: number }): boolean {
  return kid.y < WY + 2.2 && dolphinDepth(kid.x, kid.z) >= OPEN_SEA_DEPTH;
}

export function stepPods(sim: PodSim, dtIn: number, t: number, kid: { x: number; y: number; z: number }, under: boolean): void {
  const dt = clamp(dtIn, 0, 0.1);
  sim.ev.n = 0;
  sim.kx = kid.x;
  sim.ky = kid.y;
  sim.kz = kid.z;
  const ft = sim.ft;
  // the world wrap / a teleport: move everyone along with the kid
  if (trackFocus(ft, kid.x, kid.z, dt)) for (const p of sim.pods) shiftSwimmers(p.members, ft.jx, ft.jz);
  if (!sim.started) {
    sim.started = true;
    sim.pods.forEach((p, i) => placePod(sim, p, kid, 70 + i * 45, 120 + i * 50));
  }
  const open = kidInOpenSea(kid);
  const kidSpeed = Math.hypot(ft.vx, ft.vz);
  sim.slowT = kidSpeed < 0.9 ? sim.slowT + dt : 0;
  sim.wait -= dt;

  // someone come and play?
  if (sim.engaged < 0 && open && sim.wait <= 0) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < sim.pods.length; i++) {
      const p = sim.pods[i];
      if (p.mode !== M_ROAM || p.cool > 0) continue;
      const d = Math.hypot(p.members[0].x - kid.x, p.members[0].z - kid.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) {
      const p = sim.pods[best];
      // (from far away: turn up out of sight, a short swim off, so they arrive soon)
      if (bd > 120) placePod(sim, p, kid, 65, 85);
      p.mode = M_SEEK;
      p.t = 0;
      p.dir = sim.rnd() < 0.5 ? 1 : -1;
      sim.engaged = best;
    }
  }

  for (let pi = 0; pi < sim.pods.length; pi++) {
    const p = sim.pods[pi];
    const L = p.members[0];
    p.t += dt;
    p.cool -= dt;
    const kdx = kid.x - L.x;
    const kdz = kid.z - L.z;
    const kd = Math.hypot(kdx, kdz);
    const engaged = pi === sim.engaged;
    // (the kid swam off into the shallows, climbed out or flew away: off we go)
    if (engaged && !open && p.mode !== M_LEAVE) setMode(sim, p, M_LEAVE, 18);
    // the kid's depth (for swimming alongside), inside the water
    const kidY = under ? clamp(kid.y, dolphinFloor(kid.x, kid.z) + 2, WY - 1) : WY - 1.3;
    let wantYaw = L.yaw;
    let vWant = 5.5;
    let ty = WY - 1.6;
    let turn = DOLPHIN_STYLE.turn;
    // (playing with the kid, a pod follows them into shallower water than it would roam in)
    const need = engaged && p.mode !== M_LEAVE ? clamp(dolphinDepth(kid.x, kid.z) * 0.4, 2.5, 4) : DOLPHIN_STYLE.need;
    switch (p.mode) {
      case M_ROAM: {
        wantYaw = L.yaw + (wiggle(t * DOLPHIN_STYLE.wander, L.seed) * 0.8 + wiggle(t * 0.17, L.seed, 1) * 0.2) * 1.2;
        vWant = 5 + wiggle(t * 0.05, L.seed, 3) * 1.2;
        ty = WY - 1.2 - (wiggle(t * 0.04, L.seed, 2) + 1) * 0.9;
        // left far behind: turn up again somewhere ahead
        if ((L.x - kid.x) ** 2 + (L.z - kid.z) ** 2 > 260 * 260) placePod(sim, p, kid, 150, 230);
        break;
      }
      case M_SEEK: {
        const s = 7 * p.dir;
        const tx = kid.x + (kdz / (kd || 1)) * s;
        const tz = kid.z - (kdx / (kd || 1)) * s;
        wantYaw = Math.atan2(tx - L.x, tz - L.z);
        vWant = 8.5;
        ty = kidY;
        turn = 1.1;
        if (kd < 14) setMode(sim, p, M_ESCORT, 14 + sim.rnd() * 6);
        else if (p.t > 45) setMode(sim, p, M_LEAVE, 15);
        break;
      }
      case M_ESCORT: {
        // alongside: on the kid's side, a little ahead, matching their speed
        const hk = kidSpeed > 0.6 ? Math.atan2(ft.vx, ft.vz) : L.yaw;
        const fx = Math.sin(hk);
        const fz = Math.cos(hk);
        const tx = kid.x + fz * 6 * p.dir + fx * 3;
        const tz = kid.z - fx * 6 * p.dir + fz * 3;
        const dx = tx - L.x;
        const dz = tz - L.z;
        const dd = Math.hypot(dx, dz);
        wantYaw = dd > 2 ? Math.atan2(dx, dz) : hk;
        vWant = clamp(kidSpeed + dd * 0.6, 2.5, 10);
        ty = kidY;
        turn = 1.3;
        if (p.t > p.dur || sim.slowT > 3) setMode(sim, p, M_CIRCLE, 10 + sim.rnd() * 5);
        break;
      }
      case M_CIRCLE: {
        // round and round the kid, blowing bubble rings
        const r = 10;
        const a = Math.atan2(L.x - kid.x, L.z - kid.z) + p.dir * 0.55;
        const tx = kid.x + Math.sin(a) * r;
        const tz = kid.z + Math.cos(a) * r;
        wantYaw = Math.atan2(tx - L.x, tz - L.z);
        vWant = 5.2;
        ty = kidY + Math.sin(t * 0.8) * 0.8;
        turn = 1.4;
        p.ring -= dt;
        if (p.ring <= 0) {
          p.ring = 1.8 + sim.rnd() * 1.6;
          const d = p.members[Math.floor(sim.rnd() * p.members.length)];
          // (not right in the kid's face)
          const near = (d.x - kid.x) ** 2 + (d.z - kid.z) ** 2 < 64;
          if (!d.leaping && !near && d.y < WY - 1.4) emit(sim, d.x + Math.sin(d.yaw) * 1.3 * d.size, d.y + 0.15, d.z + Math.cos(d.yaw) * 1.3 * d.size, d.size, DEV_RING);
        }
        if (p.t > p.dur) setMode(sim, p, M_PLAY, 10 + sim.rnd() * 5);
        break;
      }
      case M_PLAY: {
        // leaping all round the kid at the surface
        const r = 13;
        const a = Math.atan2(L.x - kid.x, L.z - kid.z) + p.dir * 0.45;
        wantYaw = Math.atan2(kid.x + Math.sin(a) * r - L.x, kid.z + Math.cos(a) * r - L.z);
        vWant = 6.5;
        ty = WY - 0.9;
        turn = 1.2;
        p.wave = Math.min(p.wave, 2.6);
        if (p.t > p.dur) setMode(sim, p, M_LEAVE, 18);
        break;
      }
      case M_LEAVE: {
        wantYaw = p.away;
        vWant = 7;
        ty = WY - 1.4;
        if (p.t > p.dur) {
          p.mode = M_ROAM;
          p.t = 0;
          p.cool = 50 + sim.rnd() * 40;
          if (engaged) {
            sim.engaged = -1;
            sim.wait = 12 + sim.rnd() * 14;
          }
        }
        break;
      }
    }
    drive(sim, L, wantYaw, vWant, ty, dt, turn, need);
    // leap waves: the pod arcs out of the water one after another
    p.wave -= dt;
    const leapy = p.mode === M_ROAM || p.mode === M_PLAY || p.mode === M_SEEK;
    if (p.wave <= 0) {
      p.wave = p.mode === M_PLAY ? 2 + sim.rnd() * 1.5 : 7 + sim.rnd() * 9;
      if (leapy) for (let k = 0; k < p.members.length; k++) if (!p.members[k].leaping) p.members[k].leapIn = k * 0.32 + sim.rnd() * 0.15;
    }
    for (let k = 1; k < p.members.length; k++) {
      const d = p.members[k];
      const lead = d.calf && p.members.length > 2 ? p.members[1] : L;
      holdSlot(sim, d, lead, dt, t, need);
      // (fast swimmers trail a few bubbles)
      if (!d.leaping && d.y < WY - 1 && d.speed > 6.5 && Math.floor(t * 3 + k) !== Math.floor((t - dt) * 3 + k)) emit(sim, d.x, d.y + 0.2, d.z, 0.6, DEV_BUBBLES);
    }
  }
}

function setMode(sim: PodSim, p: Pod, mode: number, dur: number) {
  p.mode = mode;
  p.t = 0;
  p.dur = dur;
  if (mode === M_LEAVE) {
    const L = p.members[0];
    p.away = wrapAngle(L.yaw + (sim.rnd() - 0.5) * 1.2);
  }
  if (mode === M_PLAY) p.wave = 0.5;
}

/** put a whole pod somewhere new, out of sight round the kid, in deep water */
function placePod(sim: PodSim, p: Pod, kid: { x: number; z: number }, rMin: number, rMax: number) {
  const L = p.members[0];
  for (let k = 0; k < 6; k++) {
    respawn(L, DOLPHIN_STYLE, kid, sim.ft.vx, sim.ft.vz, sim.rnd, rMin, rMax, 1.2);
    if (dolphinDepth(L.x, L.z) > DOLPHIN_STYLE.need * 1.5) break;
  }
  L.y = Math.max(WY - 1.6, dolphinFloor(L.x, L.z) + 2);
  for (let k = 1; k < p.members.length; k++) {
    const d = p.members[k];
    const fx = Math.sin(L.yaw);
    const fz = Math.cos(L.yaw);
    d.x = L.x - fx * d.back + fz * d.side;
    d.z = L.z - fz * d.back - fx * d.side;
    d.y = L.y + d.lift;
    d.yaw = L.yaw;
    d.speed = L.speed;
    d.leaping = false;
    d.vy = 0;
  }
}

// ── the look ──

/** a bottlenose dolphin (~2.5 m, nose +z), in the fantasy kit's layout; aFx.y = tail-beat amplitude */
export function dolphinGeometry(low: boolean): THREE.BufferGeometry {
  // (slim and streamlined, a round melon of a forehead, then a short, smiling beak)
  const prof: [number, number][] = [
    [0.0, -1.18],
    [0.06, -1.12],
    [0.09, -0.9],
    [0.17, -0.45],
    [0.24, 0.0],
    [0.265, 0.3],
    [0.255, 0.55],
    [0.225, 0.74],
    [0.18, 0.86],
    [0.11, 0.92],
    [0.07, 0.94],
    [0.065, 1.04],
    [0.05, 1.13],
    [0.0, 1.18],
  ];
  const body = new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(r, y)),
    low ? 7 : 10,
  );
  body.rotateX(Math.PI / 2);
  body.scale(0.88, 1, 1);
  const beat = (p: THREE.Vector3): Fx => [1, 0.3 * smooth(0.25, -1.2, p.z), 0];
  const TOP = new THREE.Color("#3d566e");
  const SIDE = new THREE.Color("#6a86a1");
  const BELLY = new THREE.Color("#dde6ee");
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(body, (p, n) => (n.y < -0.3 || (p.z > 0.95 && n.y < 0.1) ? BELLY : n.y > 0.45 ? TOP : SIDE), beat));
  // a fin: a curved blade with a little thickness, from a root outline (a..b along the body) to a
  // swept tip; `up` = which way it sticks out
  const blade = (root: [number, number, number][], tip: [number, number, number], half: [number, number, number]) => {
    const pos: number[] = [];
    const n = root.length;
    for (const sd of [-1, 1]) {
      for (let k = 0; k + 1 < n; k++) {
        const a = root[k].map((v, j) => v + half[j] * sd);
        const b = root[k + 1].map((v, j) => v + half[j] * sd);
        if (sd > 0) pos.push(...a, ...b, ...tip);
        else pos.push(...a, ...tip, ...b);
      }
    }
    // (close the base edge)
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    return g;
  };
  // the dorsal fin: tall, curved back like a wave
  parts.push(
    pp(
      blade(
        [
          [0, 0.26, 0.3],
          [0, 0.29, 0.12],
          [0, 0.28, -0.08],
          [0, 0.25, -0.22],
        ],
        [0, 0.66, -0.34],
        [0.05, 0, 0],
      ),
      TOP,
      beat,
    ),
  );
  parts.push(pp(blade([[0, 0.28, 0.12], [0, 0.29, -0.02]], [0, 0.52, -0.2], [0.07, 0, 0]), TOP, beat));
  // pectoral fins, and the flukes: a crescent each side of the tail
  for (const sd of [-1, 1]) {
    parts.push(
      pp(
        blade(
          [
            [sd * 0.2, -0.13, 0.55],
            [sd * 0.22, -0.15, 0.36],
          ],
          [sd * 0.55, -0.3, 0.2],
          [0, 0.025, 0],
        ),
        SIDE,
        beat,
      ),
    );
    parts.push(
      pp(
        blade(
          [
            [0, 0.0, -0.98],
            [sd * 0.2, 0.0, -1.14],
            [sd * 0.34, 0.0, -1.24],
          ],
          [sd * 0.58, 0.0, -1.42],
          [0, 0.03, 0],
        ),
        TOP,
        beat,
      ),
    );
    parts.push(pp(blade([[0, 0, -1.2], [sd * 0.34, 0, -1.24]], [sd * 0.58, 0, -1.42], [0, 0.03, 0]), TOP, beat));
  }
  // eyes and a smile
  for (const sd of [-1, 1]) {
    const e = new THREE.OctahedronGeometry(0.045, 0);
    e.translate(sd * 0.19, 0.05, 0.8);
    parts.push(pp(e, "#101820", [0, 0, 0]));
    const glint = new THREE.OctahedronGeometry(0.016, 0);
    glint.translate(sd * 0.215, 0.07, 0.82);
    parts.push(pp(glint, "#ffffff", [0, 0, 0]));
  }
  return mergeAll(parts);
}

export interface DolphinPods {
  update(dt: number, t: number, o: { kid: THREE.Vector3; under: boolean }): void;
  dispose(): void;
}

const RINGS = 10;
const PARTS = 140;

export function buildDolphinPods(scene: THREE.Scene, opts: { lowQuality?: boolean }): DolphinPods & { sim: PodSim; group: THREE.Group } {
  const low = !!opts.lowQuality;
  const sim = makePods(low);
  const group = new THREE.Group();
  group.name = "dolphin-pods";
  const N = sim.pods.reduce((a, p) => a + p.members.length, 0);
  const U = makeUwUniforms();
  const caustic = makeCausticTexture();
  U.uCausticTex.value = caustic;
  U.uGlowK.value = 0;
  const geo = dolphinGeometry(low);
  const aInst = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aInst", aInst);
  const mat = uwMaterial(U, { motion: "flap", inst: true, flapAxis: "z", flapSpeed: 0, flapWave: 2.2, rim: 0.3, lift: 0.12, cull: 1.4, cullNear: 1.6, cullHeight: 0.4 }, { roughness: 0.4, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.name = "dolphins";
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  const col = new THREE.Color();
  let k0 = 0;
  for (const p of sim.pods)
    for (const d of p.members) {
      mesh.setColorAt(k0++, col.setScalar(d.calf ? 1.08 : 0.95 + ((d.seed * 7) % 10) / 100));
    }
  group.add(mesh);

  // bubble rings: thin, softly glowing tori that swell and rise
  const ringGeo = new THREE.TorusGeometry(1, 0.05, 4, low ? 12 : 18);
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, RINGS);
  rings.name = "dolphin-rings";
  rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rings.frustumCulled = false;
  const rX = new Float32Array(RINGS);
  const rY = new Float32Array(RINGS);
  const rZ = new Float32Array(RINGS);
  const rLife = new Float32Array(RINGS);
  const rTilt = new Float32Array(RINGS);
  let rNext = 0;
  for (let i = 0; i < RINGS; i++) rings.setColorAt(i, col.setRGB(0, 0, 0));
  group.add(rings);

  // splashes + bubbles
  const PU = { uTime: { value: 0 }, uFogColor: { value: new THREE.Color() }, uFogNear: { value: 150 }, uFogFar: { value: 430 } };
  const uPx = { value: 600 };
  const nP = low ? PARTS / 2 : PARTS;
  const pPos = new Float32Array(nP * 3);
  const pCol = new Float32Array(nP * 4);
  const pSize = new Float32Array(nP);
  const pTw = new Float32Array(nP);
  const pV = new Float32Array(nP * 3);
  const pLife = new Float32Array(nP);
  const pMax = new Float32Array(nP).fill(1);
  const pKind = new Uint8Array(nP);
  let pNext = 0;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute("aCol", new THREE.BufferAttribute(pCol, 4).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute("aSize", new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute("aTw", new THREE.BufferAttribute(pTw, 1));
  const pts = new THREE.Points(pGeo, pointsMaterial(PU, false, uPx));
  pts.name = "dolphin-spray";
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  const vp4 = new THREE.Vector4();
  pts.onBeforeRender = (r, _s, cam) => {
    r.getCurrentViewport(vp4);
    uPx.value = vp4.w / (2 * Math.tan((((cam as THREE.PerspectiveCamera).fov ?? 45) * Math.PI) / 360));
  };
  group.add(pts);
  scene.add(group);

  let seed = 4321;
  const r01 = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spawn = (x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, kind: number) => {
    const i = pNext;
    pNext = (pNext + 1) % nP;
    pPos[i * 3] = x;
    pPos[i * 3 + 1] = y;
    pPos[i * 3 + 2] = z;
    pV[i * 3] = vx;
    pV[i * 3 + 1] = vy;
    pV[i * 3 + 2] = vz;
    pLife[i] = life;
    pMax[i] = life;
    pKind[i] = kind;
    pSize[i] = size;
  };

  const m = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const vp = new THREE.Vector3();
  const vs = new THREE.Vector3();

  return {
    sim,
    group,
    update(dtIn, t, o) {
      const dt = clamp(dtIn, 0, 0.1);
      stepPods(sim, dtIn, t, o.kid, o.under);
      U.uTime.value = t;
      const fog = scene.fog as THREE.Fog | null;
      if (fog) {
        PU.uFogColor.value.copy(fog.color);
        PU.uFogNear.value = fog.near;
        PU.uFogFar.value = fog.far;
      }
      PU.uTime.value = t;
      // events -> particles and rings
      for (let k = 0; k < sim.ev.n; k++) {
        const b = sim.ev.buf;
        const x = b[k * 5];
        const y = b[k * 5 + 1];
        const z = b[k * 5 + 2];
        const s = b[k * 5 + 3];
        const kind = b[k * 5 + 4];
        if (kind === DEV_RING) {
          const i = rNext;
          rNext = (rNext + 1) % RINGS;
          rX[i] = x;
          rY[i] = y;
          rZ[i] = z;
          rLife[i] = 4;
          rTilt[i] = (r01() - 0.5) * 0.5;
        } else if (kind === DEV_BUBBLES) {
          for (let j = 0; j < (low ? 1 : 3); j++) spawn(x + (r01() - 0.5) * 0.4, y, z + (r01() - 0.5) * 0.4, (r01() - 0.5) * 0.3, 0.9 + r01() * 0.7, (r01() - 0.5) * 0.3, 3, 0.06 + r01() * 0.06, 2);
        } else {
          const n = kind === DEV_SPLASH ? (low ? 8 : 14) : low ? 5 : 9;
          for (let j = 0; j < n; j++) {
            const a = r01() * TAU;
            const sp = (0.8 + r01() * 2.2) * s;
            spawn(x + Math.sin(a) * 0.3, WY + 0.05, z + Math.cos(a) * 0.3, Math.sin(a) * sp, (2.5 + r01() * 3.5) * Math.sqrt(s), Math.cos(a) * sp, 0.9, 0.09 + r01() * 0.08, 0);
          }
          spawn(x, WY + 0.25, z, 0, 0.4, 0, 0.7, 0.55 * s, 1);
        }
      }
      // dolphins
      let i = 0;
      for (let pi = 0; pi < sim.pods.length; pi++)
        for (let k = 0; k < sim.pods[pi].members.length; k++) {
          const d = sim.pods[pi].members[k];
          e.set(d.pitch, d.yaw, d.roll, "YXZ");
          m.compose(vp.set(d.x, d.y, d.z), q.setFromEuler(e), vs.set(d.size, d.size, d.size));
          mesh.setMatrixAt(i, m);
          aInst.setXY(i, d.beat, d.phase);
          i++;
        }
      mesh.instanceMatrix.needsUpdate = true;
      aInst.needsUpdate = true;
      // rings
      for (let j = 0; j < RINGS; j++) {
        if (rLife[j] > 0) {
          rLife[j] -= dt;
          rY[j] = Math.min(WY - 0.3, rY[j] + 0.35 * dt);
        }
        const u = 1 - Math.max(0, rLife[j]) / 4;
        const alive = rLife[j] > 0 && rY[j] < WY - 0.35;
        const r = 0.3 + u * 0.8;
        e.set(rTilt[j], 0, rTilt[j] * 0.6, "YXZ");
        m.compose(vp.set(rX[j], rY[j], rZ[j]), q.setFromEuler(e), vs.set(r, alive ? 1 + u * 0.5 : 0.001, r));
        rings.setMatrixAt(j, m);
        const k = alive ? Math.min(1, u * 6) * (1 - u) * 0.5 : 0;
        rings.setColorAt(j, col.setRGB(0.6 * k, 0.9 * k, k));
      }
      rings.instanceMatrix.needsUpdate = true;
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
      // particles
      for (let j = 0; j < nP; j++) {
        if (pLife[j] <= 0) {
          pCol[j * 4 + 3] = 0;
          continue;
        }
        pLife[j] -= dt;
        const u = 1 - pLife[j] / pMax[j];
        const kind = pKind[j];
        if (kind === 0) {
          pV[j * 3 + 1] -= 9.8 * dt;
          if (pPos[j * 3 + 1] < WY && pV[j * 3 + 1] < 0) pLife[j] = 0;
        } else if (kind === 1) {
          pV[j * 3 + 1] *= 1 - Math.min(1, dt * 2);
        } else if (pPos[j * 3 + 1] > WY - 0.05) pLife[j] = 0;
        pPos[j * 3] += pV[j * 3] * dt;
        pPos[j * 3 + 1] += pV[j * 3 + 1] * dt;
        pPos[j * 3 + 2] += pV[j * 3 + 2] * dt;
        pCol[j * 4] = 0.9;
        pCol[j * 4 + 1] = 0.97;
        pCol[j * 4 + 2] = 1;
        pCol[j * 4 + 3] = kind === 1 ? 0.4 * (1 - u) * Math.min(1, u * 8) : kind === 2 ? 0.55 : 0.95 * (1 - u * 0.5);
        // (spray above the water can't be seen from under it, and vice versa for bubbles)
        if (o.under ? kind !== 2 && pPos[j * 3 + 1] > WY : kind === 2) pCol[j * 4 + 3] = 0;
        pSize[j] = kind === 1 ? pSize[j] + dt * 0.4 : pSize[j];
      }
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.aCol.needsUpdate = true;
      pGeo.attributes.aSize.needsUpdate = true;
    },
    dispose() {
      scene.remove(group);
      geo.dispose();
      mat.dispose();
      caustic.dispose();
      mesh.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      rings.dispose();
      pGeo.dispose();
      (pts.material as THREE.Material).dispose();
    },
  };
}
