// The giant whales' lives — pure maths, deterministic, no three.js (tested).
//
// A whale cruises the open ocean (never the lagoon: it keeps to water 16+ m deep), meandering on
// its own heading. Every half-minute or so it rises to breathe: its back breaks the surface and it
// blows a few times, then either sinks away or lifts its flukes high and dives. Humpbacks
// sometimes breach instead — a dive, a charge upward and two-thirds of a 20 m whale bursting out of
// the sea, twisting onto its side and crashing back. A director keeps the whales round the player
// (respawning them out of sight when left far behind) and now and then sends one to meet you: it
// surfaces or breaches near you, or — when you're diving — glides past at your depth.
import { WATER_Y } from "../../registry/terrain";
import { smoothstep } from "../fantasy/noise";
import { climbTo, desiredTurn, dist2, makeSwimmer, respawn, seaDepth, seaFloorY, shallowAhead, swerve, targetY, wiggle, wrapAngle, type FocusTracker, type Swimmer, type SwimStyle } from "./wander";

export type WhaleKind = "blue" | "humpback";
export const CRUISE = 0;
export const SURFACE = 1;
export const FLUKE = 2;
export const BREACH = 3;

/** events (bit flags) returned by stepWhale */
export const EV_BLOW = 1;
/** breaking out of the water (breach) */
export const EV_EXIT = 2;
/** crashing back in (breach), or the flukes slipping under */
export const EV_ENTER = 4;
/** water streaming off the raised flukes */
export const EV_DRIP = 8;

export interface Whale extends Swimmer {
  kind: WhaleKind;
  /** length (m) */
  len: number;
  /** body radius at its widest (m) */
  girth: number;
  mode: number;
  /** seconds in the current mode */
  mt: number;
  /** until it next rises to breathe */
  wait: number;
  blows: number;
  blowT: number;
  /** shader fluke-beat strength (0..1.5) */
  flap: number;
  /** a mode to start once it's near the focus (-1: none), and how long that invitation lasts */
  cue: number;
  cueT: number;
  /** when sent to meet the kid: pass this many metres to their side (signed) */
  side: number;
  /** hold this height (an underwater fly-by past the kid), NaN = free */
  hold: number;
  holdT: number;
  /** state at the start of a scripted move */
  y0: number;
  p0: number;
  r0: number;
  /** last tail / centre heights (for splash events) */
  lastTail: number;
  lastY: number;
}

export const WHALE_STYLE: Record<WhaleKind, SwimStyle> = {
  blue: { speed: [1.8, 3.4], turn: 0.055, wander: 0.02, depth: [5, 12], clear: 4.5, need: 17, look: 60, climb: 0.8, bank: 4 },
  humpback: { speed: [1.5, 3.0], turn: 0.075, wander: 0.026, depth: [4.5, 11], clear: 4.5, need: 16, look: 48, climb: 1, bank: 4 },
};
/** body radius / length (matches whaleGeometry) */
export const GIRTH_K: Record<WhaleKind, number> = { blue: 0.06, humpback: 0.098 };

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function makeWhale(kind: WhaleKind, len: number, seed: number): Whale {
  return {
    ...makeSwimmer(0, -8, 0, 0, seed, 2),
    kind,
    len,
    girth: len * GIRTH_K[kind],
    mode: CRUISE,
    mt: 0,
    wait: 8 + (seed % 7) * 3,
    blows: 0,
    blowT: 0,
    flap: 1,
    cue: -1,
    cueT: 0,
    side: 30,
    hold: NaN,
    holdT: 0,
    y0: 0,
    p0: 0,
    r0: 0,
    lastTail: -8,
    lastY: -8,
  };
}

/** the whale's back just breaks the surface at this centre height */
export const surfaceY = (w: Whale) => WATER_Y - w.girth * 0.62;

export function startMode(w: Whale, mode: number, rnd: () => number): void {
  w.mode = mode;
  w.mt = 0;
  w.y0 = w.y;
  w.p0 = w.pitch;
  w.r0 = w.roll;
  if (mode === SURFACE) {
    w.blows = 2 + Math.floor(rnd() * 3);
    w.blowT = 0.6;
  }
  if (mode === CRUISE) w.wait = 28 + rnd() * 30;
}

/** what a whale does when it's time to breathe */
export function pickMode(w: Whale, rnd: () => number): number {
  if (w.kind === "humpback" && rnd() < 0.35) return BREACH;
  return SURFACE;
}

/** free swimming for a whale: slow, majestic turns and attitude changes */
function cruise(w: Whale, st: SwimStyle, dt: number, t: number, yWant: number, speedWant: number, avoid: { x: number; y: number; z: number } | null) {
  let want = desiredTurn(w, st, t);
  if (avoid && (w.cue >= 0 || !Number.isNaN(w.hold))) {
    // sent to meet the kid: head for a point `side` metres beside them (the shallows still win)
    const bx = avoid.x - w.x;
    const bz = avoid.z - w.z;
    const bl = Math.hypot(bx, bz) || 1;
    if (bl > Math.abs(w.side) * 1.2) {
      const dy = wrapAngle(Math.atan2(avoid.x + (bz / bl) * w.side - w.x, avoid.z - (bx / bl) * w.side - w.z) - w.yaw);
      const k = 1 - shallowAhead(w, st);
      want = want * (1 - k) + clamp(dy * 1.5, -1, 1) * st.turn * 2 * k;
    }
  }
  if (avoid) want = swerve(w, st, avoid, w.girth + 7, want);
  w.yawRate += (want - w.yawRate) * Math.min(1, dt * 0.8);
  w.yaw = wrapAngle(w.yaw + w.yawRate * dt);
  const u = (wiggle(t * st.wander * 0.8, w.seed, 3) + 1) / 2;
  const vWant = Number.isNaN(speedWant) ? st.speed[0] + (st.speed[1] - st.speed[0]) * u : speedWant;
  w.speed += (vWant - w.speed) * Math.min(1, dt * 0.4);
  const cp = Math.cos(w.pitch);
  w.x += Math.sin(w.yaw) * w.speed * cp * dt;
  w.z += Math.cos(w.yaw) * w.speed * cp * dt;
  climbTo(w, st, Number.isNaN(yWant) ? targetY(w, st, t) : yWant, dt);
  const pWant = clamp(-Math.atan2(w.vy, Math.max(0.6, w.speed)), -0.35, 0.35);
  w.pitch += (pWant - w.pitch) * Math.min(1, dt * 0.6);
  w.roll += (clamp(-w.yawRate * st.bank, -0.4, 0.4) - w.roll) * Math.min(1, dt * 0.6);
  w.flap += (1 - w.flap) * Math.min(1, dt * 0.5);
}

/** height of the fluke centre (local z = -len/2) */
export const tailY = (w: Whale) => w.y + (w.len / 2) * Math.sin(w.pitch);
/** height of the nose tip */
export const noseY = (w: Whale) => w.y - (w.len / 2) * Math.sin(w.pitch);

/**
 * One step of a whale's life. `avoid` = the kid (the whale swerves round them). Returns EV_* flags.
 */
export function stepWhale(w: Whale, dt: number, t: number, rnd: () => number, avoid: { x: number; y: number; z: number } | null): number {
  const st = WHALE_STYLE[w.kind];
  w.mt += dt;
  let ev = 0;
  w.lastY = w.y;
  if (w.mode === CRUISE) {
    let yWant = NaN;
    if (!Number.isNaN(w.hold)) {
      w.holdT -= dt;
      if (w.holdT <= 0) w.hold = NaN;
      else yWant = clamp(w.hold, seaFloorY(w.x, w.z) + st.clear, WATER_Y - w.girth - 2.5);
    }
    cruise(w, st, dt, t, yWant, Number.isNaN(w.hold) ? NaN : st.speed[1], avoid);
    w.wait -= dt;
    if (w.wait <= 0 && w.cue < 0 && Number.isNaN(w.hold)) startMode(w, pickMode(w, rnd), rnd);
  } else if (w.mode === SURFACE) {
    const yS = surfaceY(w);
    cruise(w, st, dt, t, yS, 1.3, avoid);
    // keep it in deep enough water while it lingers
    if (Math.abs(w.y - yS) < 0.4) {
      w.blowT -= dt;
      if (w.blowT <= 0 && w.blows > 0) {
        ev |= EV_BLOW;
        w.blows--;
        w.blowT = 3.6 + rnd() * 2.2;
      }
    }
    if ((w.blows === 0 && w.blowT <= -1.5) || w.mt > 45) {
      const fluke = rnd() < (w.kind === "humpback" ? 0.7 : 0.45);
      startMode(w, fluke ? FLUKE : CRUISE, rnd);
    }
  } else if (w.mode === FLUKE) {
    // arch over and lift the flukes high, then slide down into the deep
    const T = 8;
    const u = Math.min(1, w.mt / T);
    const th = lerp(w.p0, 0.74, smoothstep(0, 0.8, u));
    const yS = surfaceY(w);
    const lift = (w.kind === "humpback" ? 0.17 : 0.11) * w.len;
    const tY = yS + (lift + w.girth * 0.62) * Math.pow(Math.sin(Math.PI * Math.min(1, u / 0.86)), 0.8) - smoothstep(0.75, 1, u) * 2;
    const cy = tY - (w.len / 2) * Math.sin(th);
    w.vy = dt > 0 ? (cy - w.y) / dt : 0;
    w.y = cy;
    w.pitch = th;
    w.roll += (0 - w.roll) * Math.min(1, dt * 1.5);
    w.speed += (1.8 - w.speed) * Math.min(1, dt * 0.8);
    w.yawRate *= 1 - Math.min(1, dt * 1.5);
    w.yaw = wrapAngle(w.yaw + w.yawRate * dt);
    w.x += Math.sin(w.yaw) * w.speed * Math.cos(th) * dt;
    w.z += Math.cos(w.yaw) * w.speed * Math.cos(th) * dt;
    w.flap += (0.12 - w.flap) * Math.min(1, dt * 2);
    const ty = tailY(w);
    if (ty > WATER_Y + 0.6 && u > 0.2 && u < 0.92) ev |= EV_DRIP;
    if (w.lastTail > WATER_Y + 0.2 && ty <= WATER_Y + 0.2) ev |= EV_ENTER;
    if (u >= 1) {
      startMode(w, CRUISE, rnd);
      w.vy = -1;
    }
  } else if (w.mode === BREACH) {
    // dive, charge upward, burst out twisting onto its side, crash back
    const T = 8.4;
    const u = Math.min(1, w.mt / T);
    const prevNose = noseY(w);
    const floorY = seaFloorY(w.x, w.z);
    const yA = Math.max(floorY + st.clear + w.len * 0.18, -15.5);
    const yPeak = WATER_Y + w.len * 0.14;
    let cy: number;
    let th: number;
    let roll = 0;
    let spd: number;
    if (u < 0.36) {
      const a = smoothstep(0, 1, u / 0.36);
      cy = lerp(w.y0, yA, a);
      th = lerp(w.p0, -0.35, a);
      roll = lerp(w.r0, 0, a);
      spd = lerp(2.2, 4.6, a);
      w.flap = lerp(w.flap, 1.6, Math.min(1, dt * 2));
    } else {
      const v = (u - 0.36) / 0.64;
      if (v < 0.4) {
        const a = v / 0.4;
        cy = lerp(yA, yPeak, 1 - (1 - a) * (1 - a));
      } else {
        // falling back: it crashes in on its side while its front is still raised
        const a = Math.min(1, (v - 0.4) / 0.5);
        cy = lerp(yPeak, -6, Math.pow(a, 1.6));
      }
      th = v < 0.15 ? lerp(-0.35, -1.2, smoothstep(0, 1, v / 0.15)) : v < 0.42 ? lerp(-1.2, -0.95, (v - 0.15) / 0.27) : v < 0.8 ? lerp(-0.95, -0.3, smoothstep(0, 1, (v - 0.42) / 0.38)) : lerp(-0.3, 0.2, smoothstep(0, 1, (v - 0.8) / 0.2));
      roll = smoothstep(0.28, 0.72, v) * 1.45 * (w.seed % 2 ? 1 : -1);
      spd = lerp(4.6, 2.2, v);
      w.flap = lerp(w.flap, v < 0.12 ? 1.6 : 0.15, Math.min(1, dt * 3));
    }
    w.vy = dt > 0 ? (cy - w.y) / dt : 0;
    w.y = cy;
    w.pitch = th;
    w.roll = roll;
    w.speed = spd;
    w.yawRate *= 1 - Math.min(1, dt * 2);
    w.yaw = wrapAngle(w.yaw + w.yawRate * dt);
    w.x += Math.sin(w.yaw) * spd * Math.max(0.35, Math.cos(th)) * dt;
    w.z += Math.cos(w.yaw) * spd * Math.max(0.35, Math.cos(th)) * dt;
    const ny = noseY(w);
    if (prevNose < WATER_Y && ny >= WATER_Y && w.vy > 0) ev |= EV_EXIT;
    if (w.lastY > WATER_Y && w.y <= WATER_Y) ev |= EV_ENTER;
    if (u >= 1) {
      startMode(w, CRUISE, rnd);
      w.vy = -1.5;
    }
  }
  w.lastTail = tailY(w);
  return ev;
}

// ── the director: keep whales round the player, and send one to meet them now and then ──

export interface WhaleDirector {
  /** until the next encounter */
  enc: number;
}
export const makeWhaleDirector = (): WhaleDirector => ({ enc: 10 });

/** is the whale hidden (fully under water, not doing anything showy)? */
export const whaleHidden = (w: Whale) => w.mode === CRUISE && w.y + w.girth * 1.3 < WATER_Y - 1;

/**
 * Respawn whales left far behind (out of sight, ahead of the focus) and schedule encounters.
 * `under` = the kid is diving (fly-bys happen at their depth, just beyond the underwater fog).
 * Returns the index of a whale sent to meet the kid this frame, or -1.
 */
export function directWhales(whales: Whale[], d: WhaleDirector, f: FocusTracker, focusY: number, under: boolean, dt: number, rnd: () => number): number {
  const focus = f;
  let nearest = Infinity;
  for (let i = 0; i < whales.length; i++) {
    const w = whales[i];
    const d2 = dist2(w, focus);
    nearest = Math.min(nearest, d2);
    if ((d2 > 320 * 320 && whaleHidden(w) && w.cue < 0) || d2 > 470 * 470) {
      respawn(w, WHALE_STYLE[w.kind], focus, f.vx, f.vz, rnd, 210, 290, 1.2);
      w.mode = CRUISE;
      w.cue = -1;
      w.hold = NaN;
      w.wait = 6 + rnd() * 30;
      w.lastY = w.lastTail = w.y;
    }
    // (a whale sent to meet a kid who's far inland gives up after a while)
    if (w.cue >= 0 && (w.cueT -= dt) <= 0) w.cue = -1;
    // a cued whale starts its show once it's close
    if (w.cue >= 0 && w.mode === CRUISE && d2 < (w.cue === BREACH ? 95 : 85) ** 2) {
      startMode(w, w.cue, rnd);
      w.cue = -1;
    }
  }
  d.enc -= dt;
  if (d.enc > 0) return -1;
  // only in (or over) deep water, and when no whale is already close. A diving kid out over the
  // deep gets a fly-by every 20-35 s (the water is clear: they see it coming)
  const deep = seaDepth(f.x, f.z);
  const flyby = under && deep > 12;
  d.enc = flyby ? 20 + rnd() * 15 : 40 + rnd() * 35;
  if (nearest < (flyby ? 55 : 110) ** 2) return -1;
  // the whale furthest away (hidden) comes to visit
  let pick = -1;
  let far = -1;
  for (let i = 0; i < whales.length; i++) {
    const d2 = dist2(whales[i], focus);
    if (whaleHidden(whales[i]) && whales[i].cue < 0 && d2 > far) {
      far = d2;
      pick = i;
    }
  }
  if (pick < 0) return -1;
  const w = whales[pick];
  const st = WHALE_STYLE[w.kind];
  if (flyby) {
    // a fly-by at the kid's depth, passing 8-15 m away, starting out in the blue ahead
    respawn(w, st, focus, f.vx, f.vz, rnd, 62, 74, 0.7);
    w.side = aimPast(w, focus, 8 + rnd() * 7, rnd);
    // (a little below the kid: the underwater camera looks down on them)
    w.hold = focusY - 4;
    w.holdT = 50;
    w.y = clamp(w.hold, seaFloorY(w.x, w.z) + st.clear, WATER_Y - w.girth - 2.5);
    w.cue = -1;
  } else {
    respawn(w, st, focus, f.vx, f.vz, rnd, 160, 200, 0.8);
    w.side = aimPast(w, focus, 28 + rnd() * 22, rnd);
    w.cue = w.kind === "humpback" && rnd() < 0.55 ? BREACH : SURFACE;
    w.cueT = 90;
  }
  w.mode = CRUISE;
  w.lastY = w.lastTail = w.y;
  return pick;
}

/** turn a whale to pass `lateral` metres to one side of the focus; returns the signed offset */
export function aimPast(w: Swimmer, focus: { x: number; z: number }, lateral: number, rnd: () => number): number {
  const bx = focus.x - w.x;
  const bz = focus.z - w.z;
  const bl = Math.hypot(bx, bz) || 1;
  const side = rnd() < 0.5 ? -1 : 1;
  const ax = focus.x + (bz / bl) * lateral * side;
  const az = focus.z - (bx / bl) * lateral * side;
  w.yaw = Math.atan2(ax - w.x, az - w.z);
  w.yawRate = 0;
  return lateral * side;
}

/** a point in a creature's own frame (right, up, forward in metres) -> world (Euler YXZ) */
export function bodyToWorld(s: { x: number; y: number; z: number; yaw: number; pitch: number; roll: number }, lx: number, ly: number, lz: number, out: { x: number; y: number; z: number }) {
  const cr = Math.cos(s.roll);
  const sr = Math.sin(s.roll);
  const x1 = lx * cr - ly * sr;
  const y1 = lx * sr + ly * cr;
  const cp = Math.cos(s.pitch);
  const sp = Math.sin(s.pitch);
  const y2 = y1 * cp - lz * sp;
  const z2 = y1 * sp + lz * cp;
  const cy = Math.cos(s.yaw);
  const sy = Math.sin(s.yaw);
  out.x = s.x + x1 * cy + z2 * sy;
  out.y = s.y + y2;
  out.z = s.z - x1 * sy + z2 * cy;
  return out;
}
