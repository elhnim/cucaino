// The Park kid skiing the Penguin Ski Run — pure maths, allocation-free per step, no three.js
// (tested). It mirrors the penguin slides (./kidSlide.ts):
//   - grab skis at the start hut (the HUD offers "⛷️ Ski!" there): the kid clicks into a pair of
//     skis, glides out of the hut's side onto the start line and sets off when the top is clear
//   - carve down the piste with the joystick: gentle speed (never faster than the penguins' fastest),
//     side to side between the edges, the yaw following where the skis are going (S-turns); every
//     slalom gate passed between its poles counts; a spray of snow at each turn
//   - at the bottom: a glide to a stop on the run-out and a cheer (with the gates counted)
// then the kid takes the chairlift back up (./ski.ts kidLift*), or walks.
import { FROST_SKI, GATE_HALF, frostGroundY, frostLandY, frostRunPoint } from "../../registry/frostIsland";

const P = FROST_SKI.piste;
/** the kid's top speed on skis (units/s): a gentle cruise */
export const KID_SKI_VMAX = 4.6;
/** standing this close to the start hut offers skis */
export const SKI_HUT_R = 4.4;
/** the kid stays this far inside the piste's edges */
const EDGE = 0.8;
/** behind the start line where the kid clicks in */
const START_BACK = 2.2;

const pt = { x: 0, z: 0, dx: 0, dz: 1 };
const D0 = (() => {
  const dx = P.x[4] - P.x[0];
  const dz = P.z[4] - P.z[0];
  const l = Math.hypot(dx, dz);
  return { x: dx / l, z: dz / l };
})();
const ground = (x: number, z: number) => frostGroundY(x, z) ?? frostLandY(x, z) ?? 3;

/** standing by the start hut? (the HUD offers "⛷️ Ski!") */
export function skiHutAt(x: number, z: number): boolean {
  const h = FROST_SKI.hut;
  return (x - h.x) ** 2 + (z - h.z) ** 2 < SKI_HUT_R * SKI_HUT_R;
}

export interface KidSki {
  /** "start": clicking in on the start line; "run": skiing; "stop": gliding to a stop at the bottom; "done" */
  phase: "start" | "run" | "stop" | "done";
  t: number;
  /** distance down the piste (< 0 behind the start line) and offset from its centre (left +) */
  s: number;
  lat: number;
  latV: number;
  v: number;
  x: number;
  y: number;
  z: number;
  /** facing (where the skis point), the lean into the turn (+ = left), downhill direction */
  yaw: number;
  roll: number;
  dx: number;
  dz: number;
  /** slalom gates passed / gone by (out of FROST_SKI.gates.length) */
  gates: number;
  nextGate: number;
  turnSign: number;
  /** events this step: a spray of snow off the skis (a turn), a gate passed, the finish */
  spray: boolean;
  gate: boolean;
  finish: boolean;
  /** where the run-out glide started */
  ex: number;
  ez: number;
  ehead: number;
}

export function makeKidSki(): KidSki {
  const k: KidSki = { phase: "start", t: 0, s: -START_BACK, lat: 0, latV: 0, v: 0, x: 0, y: 0, z: 0, yaw: Math.atan2(D0.x, D0.z), roll: 0, dx: D0.x, dz: D0.z, gates: 0, nextGate: 0, turnSign: 0, spray: false, gate: false, finish: false, ex: 0, ez: 0, ehead: 0 };
  place(k);
  return k;
}

function place(k: KidSki) {
  if (k.s < 0) {
    k.x = P.x[0] + D0.x * k.s + D0.z * k.lat;
    k.z = P.z[0] + D0.z * k.s - D0.x * k.lat;
    k.dx = D0.x;
    k.dz = D0.z;
  } else {
    frostRunPoint(P, k.s, k.lat, pt);
    k.x = pt.x;
    k.z = pt.z;
    k.dx = pt.dx;
    k.dz = pt.dz;
  }
  k.y = ground(k.x, k.z);
}

/** the piste's slope (drop per unit) at s */
function slopeAt(s: number) {
  if (s < 0) return 0;
  const i = Math.max(0, Math.min(P.u.length - 2, Math.floor(s)));
  let j = i;
  while (j < P.u.length - 2 && P.u[j + 1] < s) j++;
  return (P.y[j] - P.y[j + 1]) / (P.u[j + 1] - P.u[j] || 1);
}

/**
 * One step: `steer` -1..1 (the joystick's sideways push: + = to the kid's LEFT), `clear` = the top of
 * the piste is free (nobody setting off), `aheadS` = how far down the nearest penguin skiing ahead is
 * (Infinity: nobody).
 */
export function stepKidSki(k: KidSki, dtIn: number, steer: number, clear: boolean, aheadS: number): KidSki {
  const dt = Math.min(0.1, Math.max(0, dtIn));
  k.spray = false;
  k.gate = false;
  k.finish = false;
  if (k.phase === "done") return k;
  k.t += dt;
  if (k.phase === "start") {
    // clicking in on the start line, then a push off with the poles once the top's clear
    place(k);
    if (k.t > 0.8 && clear) {
      k.phase = "run";
      k.v = 1.4;
      k.spray = true;
    }
    return k;
  }
  if (k.phase === "run") {
    const slope = slopeAt(k.s);
    // gentle: gravity down the fall line, snow friction, a little drag, a push with the poles at the top
    let a = 9.8 * slope * 0.42 - 0.3 - 0.035 * k.v * k.v + (k.s < 1 ? 1.8 : 0);
    // (carving across the slope scrubs speed: turning slows you down, like real skiing)
    a -= Math.abs(k.latV) * 0.5;
    k.v = Math.max(1, Math.min(KID_SKI_VMAX, k.v + a * dt));
    // never into the back of a penguin skiing ahead
    if (aheadS - k.s < 6) k.v = Math.min(k.v, Math.max(0.8, (aheadS - k.s - 2.8) * 1.4));
    // sideways: the joystick carves you across; let go and you run straight down
    k.latV += (steer * 4.2 - k.latV) * Math.min(1, dt * 4);
    const lim = P.hw - EDGE;
    k.lat += k.latV * dt;
    if (k.lat > lim || k.lat < -lim) {
      k.lat = Math.max(-lim, Math.min(lim, k.lat));
      k.latV *= -0.2;
    }
    const s0 = k.s;
    k.s += k.v * dt;
    place(k);
    // the skis point where they're going: down the piste, plus the carve across it
    const head = Math.atan2(k.dx, k.dz);
    const cross = Math.atan2(k.latV, Math.max(0.6, k.v));
    // (left = +lat: a positive carve turns the skis to the left of downhill)
    k.yaw = head + cross;
    const want = Math.max(-0.45, Math.min(0.45, cross * 1.3 + steer * 0.15));
    k.roll += (want - k.roll) * Math.min(1, dt * 7);
    // a spray at each turn (the carve changes side)
    const sign = Math.abs(k.latV) > 0.45 ? Math.sign(k.latV) : 0;
    if (sign !== 0 && sign !== k.turnSign) {
      if (k.turnSign !== 0 || k.s > 2) k.spray = true;
      k.turnSign = sign;
    }
    // the slalom gates: through between the poles counts
    const G = FROST_SKI.gates;
    while (k.nextGate < G.length && s0 < G[k.nextGate].s && k.s >= G[k.nextGate].s) {
      if (Math.abs(k.lat - G[k.nextGate].lat) < GATE_HALF) {
        k.gates++;
        k.gate = true;
      }
      k.nextGate++;
    }
    if (k.s >= P.len - 1) {
      k.phase = "stop";
      k.t = 0;
      k.ex = k.x;
      k.ez = k.z;
      k.ehead = Math.atan2(k.dx, k.dz);
      k.spray = true;
    }
    return k;
  }
  // the run-out: a hockey stop (a big spray) and a glide to a halt
  k.v = Math.max(0, k.v - 3.2 * dt);
  k.x += Math.sin(k.ehead) * k.v * dt;
  k.z += Math.cos(k.ehead) * k.v * dt;
  k.y = ground(k.x, k.z);
  k.yaw += (k.ehead + 1.2 - k.yaw) * Math.min(1, dt * 4);
  k.roll += (0 - k.roll) * Math.min(1, dt * 5);
  if (k.v <= 0.05) {
    k.phase = "done";
    k.finish = true;
  }
  return k;
}
