// How sea creatures roam the boundless ocean — pure maths, deterministic, no three.js (tested).
//
// Every creature is a `Swimmer` with its own heading, steered each frame by smooth noise (so it
// meanders like a living thing instead of lapping a circle), turned away from water that's too
// shallow for its size (the island is the only land, so "away" = out to sea), optionally leashed
// to a home (reef fish round their reef), gliding up and down inside a comfortable depth band and
// banking into its turns. The population follows the player: anything left far behind is quietly
// respawned out of sight around (mostly ahead of) the focus, so wherever you swim, sail or fly
// there's always life nearby. When the focus wraps round the world (terrain.wrapWorld) the whole
// neighbourhood jumps with it (`focusJump` + `shiftSwimmers`), so nothing pops.
import { WATER_BOUNDS, waterSdf } from "../../registry/waterways";
import { inWildWater } from "../../registry/wildWater";
import { coastR, seaDist } from "../../registry/island";
import { DEEP_FLOOR, TERRAIN_X0, TERRAIN_X1, TERRAIN_Z0, TERRAIN_Z1, WATER_Y, groundY } from "../../registry/terrain";
import { noise2, smoothstep } from "../fantasy/noise";
import { VILLAGE_ISLAND, villageGroundY, villageSeaFloorY } from "../../registry/villageIsland";
import { abyssFloorY } from "../../registry/abyss";
import { FROST_ISLAND, frostSeaFloorY } from "../../registry/frostIsland";
import { DINO_ISLAND, dinoSeaFloorY, dinoShoreDist } from "../../registry/dinoIsland";

const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
/** wrap an angle difference into -PI..PI */
export const wrapAngle = (a: number) => a - Math.round(a / TAU) * TAU;

/** low sand dunes on the deep plain (m, about ±0.8) */
export function dunes(x: number, z: number): number {
  return (noise2(x / 46, z / 46, 71) - 0.5) * 1.3 + (noise2(x / 13, z / 13, 72) - 0.5) * 0.35;
}

/**
 * The visible sea floor everywhere: the terrain inside its height grid, then (off the grid) a short
 * slope from the grid's edge down to the deep sandy plain at DEEP_FLOOR with low dunes.
 */
export function seaFloorY(x: number, z: number): number {
  // Coralcove Isle's slopes (and its land) count as sea floor too, so creatures steer round them
  const vg = villageGroundY(x, z);
  if (vg !== null) return vg;
  // … and Frostpeak Isle's (its land and slopes; not the floating floes)
  const fs = frostSeaFloorY(x, z);
  if (fs !== null) return Math.max(mainSeaFloorY(x, z), fs);
  // … and Dino Isle's
  const ds = dinoSeaFloorY(x, z);
  if (ds !== null) return Math.max(mainSeaFloorY(x, z), ds);
  const vs = villageSeaFloorY(x, z);
  let f = mainSeaFloorY(x, z);
  // the Midnight Rift: a deep crack in the open ocean floor
  const a = abyssFloorY(x, z);
  if (a !== null) f = Math.min(f, a);
  return vs !== null ? Math.max(f, vs) : f;
}
function mainSeaFloorY(x: number, z: number): number {
  const x0 = TERRAIN_X0 + 0.6;
  const x1 = TERRAIN_X1 - 0.6;
  const z0 = TERRAIN_Z0 + 0.6;
  const z1 = TERRAIN_Z1 - 0.6;
  const ox = Math.max(x0 - x, x - x1);
  const oz = Math.max(z0 - z, z - z1);
  if (ox <= 0 && oz <= 0) return groundY(x, z);
  const d = Math.hypot(Math.max(0, ox), Math.max(0, oz));
  const edge = groundY(clamp(x, x0, x1), clamp(z, z0, z1));
  return edge + (DEEP_FLOOR + dunes(x, z) - edge) * smoothstep(0, 12, d);
}

/** how deep the water is at (x, z) */
export const seaDepth = (x: number, z: number) => (inlandWater(x, z) ? -1 : WATER_Y - seaFloorY(x, z));
/** Rainbow Lake, the river and the plunge pool — and the Wildlands' great river, falls and lake —
 *  are fresh water, not the sea: the sea's creatures never go there */
function inlandWater(x: number, z: number): boolean {
  // (only the park's water box and the Wildlands' have inland water: everything else answers at once)
  const park = x > WATER_BOUNDS.x0 && x < WATER_BOUNDS.x1 && z > WATER_BOUNDS.z0 && z < WATER_BOUNDS.z1;
  if (!park && !inWildWater(x, z)) return false;
  return seaDist(x, z) < -4 && waterSdf(x, z) < 6;
}

export interface Swimmer {
  x: number;
  y: number;
  z: number;
  /** heading (radians about +Y; forward = (sin yaw, cos yaw)) */
  yaw: number;
  /** nose down > 0 (three.js Euler x, order YXZ) */
  pitch: number;
  /** bank (Euler z) */
  roll: number;
  speed: number;
  /** current turn rate (rad/s), eased so turns are graceful */
  yawRate: number;
  /** vertical speed (m/s) */
  vy: number;
  /** per-creature noise seed */
  seed: number;
}

export interface SwimStyle {
  /** cruising speed range (m/s) */
  speed: [number, number];
  /** fastest turn (rad/s) */
  turn: number;
  /** how quickly the wander noise changes (1/s) */
  wander: number;
  /** preferred depth below the surface (m): shallowest .. deepest */
  depth: [number, number];
  /** keep this far above the sea floor */
  clear: number;
  /** never swim into water shallower than this */
  need: number;
  /** look-ahead distance for shallow water (m) */
  look: number;
  /** fastest climb / dive (m/s) */
  climb: number;
  /** roll per rad/s of turn */
  bank: number;
  /** reef dwellers: keep this high above the floor (m) instead of the depth band */
  above?: [number, number];
  /** stay round a home (reef residents) */
  home?: { x: number; z: number; r: number };
}

export function makeSwimmer(x: number, y: number, z: number, yaw: number, seed: number, speed = 1): Swimmer {
  return { x, y, z, yaw, pitch: 0, roll: 0, speed, yawRate: 0, vy: 0, seed };
}

/** a smooth signed noise in -1..1 for creature `seed` at time `t` */
export function wiggle(t: number, seed: number, channel = 0): number {
  return noise2(t, seed * 1.37 + channel * 101.3, 9 + channel) * 2 - 1;
}

/** 0 .. 1: how urgently the creature must turn out of shallow water ahead */
export function shallowAhead(s: Swimmer, st: SwimStyle): number {
  const fx = Math.sin(s.yaw);
  const fz = Math.cos(s.yaw);
  const here = seaDepth(s.x, s.z);
  const ahead = Math.min(seaDepth(s.x + fx * st.look, s.z + fz * st.look), seaDepth(s.x + fx * st.look * 0.5, s.z + fz * st.look * 0.5));
  const worst = Math.min(here * 1.15, ahead);
  const margin = st.need * 1.35;
  return worst < margin ? clamp((margin - worst) / (st.need * 0.5), 0, 1) : 0;
}

/** the heading straight out to sea from (x, z): the uphill direction of seaDist's gradient (the
 *  coast isn't a circle round the plaza any more — it's the park's own little shore joined onto
 *  the huge Wildlands away to the east-north-east — so "away from the island" has to follow
 *  whichever coast is actually nearest, not just point away from the origin) */
export function awayFromCoast(x: number, z: number): number {
  const e = 10;
  const dx = seaDist(x + e, z) - seaDist(x - e, z);
  const dz = seaDist(x, z + e) - seaDist(x, z - e);
  return Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : Math.atan2(x, z);
}

/** the way out to deep water: away from Coralcove Isle when near it, else away from the park's
 *  island (from between the two, "away from the park" pointed straight at Coralcove) */
export function deepestHeading(s: { x: number; z: number; yaw: number }): number {
  const vx = s.x - VILLAGE_ISLAND.x;
  const vz = s.z - VILLAGE_ISLAND.z;
  if (vx * vx + vz * vz < (VILLAGE_ISLAND.r + 110) ** 2) return Math.atan2(vx, vz);
  const fx = s.x - FROST_ISLAND.x;
  const fz = s.z - FROST_ISLAND.z;
  if (fx * fx + fz * fz < (FROST_ISLAND.r + 110) ** 2) return Math.atan2(fx, fz);
  // (Dino Isle is long and curved, with only a channel between it and the park's island: look for
  //  the deepest water round about — the shallowest point 20, 40 and 70 m out each way — favouring
  //  the way it's already going)
  if (Math.abs(s.x - DINO_ISLAND.x) < 360 && Math.abs(s.z - DINO_ISLAND.z) < 440 && dinoShoreDist(s.x, s.z) < 170) {
    let best = s.yaw;
    let bestV = -Infinity;
    for (let k = 0; k < 16; k++) {
      const a = s.yaw + (k / 16) * TAU;
      const sx = Math.sin(a);
      const sz = Math.cos(a);
      const d = Math.min(seaDepth(s.x + sx * 20, s.z + sz * 20), seaDepth(s.x + sx * 40, s.z + sz * 40), seaDepth(s.x + sx * 70, s.z + sz * 70));
      const turn = Math.abs(wrapAngle(a - s.yaw));
      const v = Math.min(d, 22) - turn * 0.8;
      if (v > bestV) {
        bestV = v;
        best = a;
      }
    }
    return best;
  }
  // everywhere else: follow the coast's own distance gradient out to sea (the Wildlands made the
  // island's coast far too big and lopsided now for "away from the plaza" to always be right)
  return awayFromCoast(s.x, s.z);
}

/** the heading a creature wants this frame (without inertia): wander + shallows + home leash */
export function desiredTurn(s: Swimmer, st: SwimStyle, t: number): number {
  // wander: a slowly changing turn rate (two octaves so paths meander, not zig-zag)
  let want = (wiggle(t * st.wander, s.seed) * 0.75 + wiggle(t * st.wander * 2.7, s.seed, 1) * 0.25) * st.turn * 0.7;
  // shallow water ahead: turn towards the deepest water round about (there's more than one
  // island now — "away from the park" pointed straight at Coralcove Isle from between them)
  const urgency = shallowAhead(s, st);
  if (urgency > 0) {
    const out = deepestHeading(s);
    const dy = wrapAngle(out - s.yaw);
    want = want * (1 - urgency) + clamp(dy * 2, -1, 1) * st.turn * urgency;
  }
  // reef residents drift home when they stray
  if (st.home) {
    const hx = st.home.x - s.x;
    const hz = st.home.z - s.z;
    const d = Math.hypot(hx, hz);
    const k = smoothstep(st.home.r * 0.55, st.home.r, d);
    if (k > 0) {
      const dy = wrapAngle(Math.atan2(hx, hz) - s.yaw);
      want = want * (1 - k) + clamp(dy * 1.5, -1, 1) * st.turn * k;
    }
  }
  return want;
}

/** preferred height for the creature right now (inside its depth band, clear of the floor) */
export function targetY(s: Swimmer, st: SwimStyle, t: number): number {
  const u = (wiggle(t * st.wander * 0.6, s.seed, 2) + 1) / 2;
  const ground = seaFloorY(s.x, s.z);
  const floor = ground + st.clear;
  const top = WATER_Y - st.depth[0];
  const want = st.above ? ground + st.above[0] + (st.above[1] - st.above[0]) * u : WATER_Y - (st.depth[0] + (st.depth[1] - st.depth[0]) * u);
  if (floor >= top) return (floor + top) / 2;
  return clamp(want, floor, top);
}

/**
 * One step of free swimming: turn (eased), vary speed, move, glide toward the depth band, and
 * pitch/bank to match. `avoid` (optional) is a point to swerve round (the kid) within `avoidR`.
 */
export function swim(s: Swimmer, st: SwimStyle, dt: number, t: number, avoid?: { x: number; y: number; z: number }, avoidR = 0): void {
  let want = desiredTurn(s, st, t);
  if (avoid && avoidR > 0) want = swerve(s, st, avoid, avoidR, want);
  s.yawRate += (want - s.yawRate) * Math.min(1, dt * 1.6);
  s.yaw = wrapAngle(s.yaw + s.yawRate * dt);
  const u = (wiggle(t * st.wander * 0.8, s.seed, 3) + 1) / 2;
  const vWant = st.speed[0] + (st.speed[1] - st.speed[0]) * u;
  s.speed += (vWant - s.speed) * Math.min(1, dt * 0.6);
  s.x += Math.sin(s.yaw) * s.speed * dt;
  s.z += Math.cos(s.yaw) * s.speed * dt;
  climbTo(s, st, targetY(s, st, t), dt);
  settle(s, st, dt);
}

/** turn away from a point that lies ahead within `r` */
export function swerve(s: Swimmer, st: SwimStyle, p: { x: number; y: number; z: number }, r: number, want: number): number {
  const dx = p.x - s.x;
  const dz = p.z - s.z;
  const d = Math.hypot(dx, dz);
  if (d > r * 2.5 || Math.abs(p.y - s.y) > r * 1.2) return want;
  const rel = wrapAngle(Math.atan2(dx, dz) - s.yaw);
  if (Math.abs(rel) > 1.3) return want; // behind us
  const k = 1 - smoothstep(r, r * 2.5, d);
  return want * (1 - k) + (rel > 0 ? -1 : 1) * st.turn * k;
}

/** ease the vertical speed toward reaching `y`, and never go through the floor or out of the water */
export function climbTo(s: Swimmer, st: SwimStyle, y: number, dt: number): void {
  const want = clamp((y - s.y) * 0.5, -st.climb, st.climb);
  s.vy += (want - s.vy) * Math.min(1, dt * 1.5);
  s.y += s.vy * dt;
  const floor = seaFloorY(s.x, s.z) + st.clear * 0.6;
  if (s.y < floor) {
    s.y = floor;
    if (s.vy < 0) s.vy = 0;
  }
}

/** pitch from the climb, bank from the turn (eased) */
export function settle(s: Swimmer, st: SwimStyle, dt: number): void {
  const pWant = clamp(-Math.atan2(s.vy, Math.max(0.3, s.speed)), -0.6, 0.6);
  s.pitch += (pWant - s.pitch) * Math.min(1, dt * 2);
  const rWant = clamp(-s.yawRate * st.bank, -0.75, 0.75);
  s.roll += (rWant - s.roll) * Math.min(1, dt * 2);
}

/**
 * Follow a leader: steer toward a slot `side` metres to its right and `back` metres behind it,
 * matching its speed and catching up when behind. Keeps to water `need` deep.
 */
export function follow(s: Swimmer, st: SwimStyle, lead: Swimmer, side: number, back: number, dt: number, t: number): void {
  const fx = Math.sin(lead.yaw);
  const fz = Math.cos(lead.yaw);
  const tx = lead.x - fx * back + fz * side;
  const tz = lead.z - fz * back - fx * side;
  const dx = tx - s.x;
  const dz = tz - s.z;
  const d = Math.hypot(dx, dz);
  let want = clamp(wrapAngle(Math.atan2(dx, dz) - s.yaw) * 1.8, -1, 1) * st.turn;
  // a little life of its own
  want += wiggle(t * st.wander * 2, s.seed) * st.turn * 0.15;
  // and still mind the shallows
  const here = seaDepth(s.x + Math.sin(s.yaw) * st.look * 0.5, s.z + Math.cos(s.yaw) * st.look * 0.5);
  if (here < st.need) want = clamp(wrapAngle(awayFromCoast(s.x, s.z) - s.yaw) * 2, -1, 1) * st.turn;
  s.yawRate += (want - s.yawRate) * Math.min(1, dt * 2.5);
  s.yaw = wrapAngle(s.yaw + s.yawRate * dt);
  // along = how far ahead of the slot we are
  const along = -(dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw));
  const vWant = clamp(lead.speed - along * 0.35 + (d > 12 ? 1.5 : 0), lead.speed * 0.5, lead.speed * 1.8 + 1);
  s.speed += (vWant - s.speed) * Math.min(1, dt * 1.2);
  s.x += Math.sin(s.yaw) * s.speed * dt;
  s.z += Math.cos(s.yaw) * s.speed * dt;
  // snap back if left hopelessly behind (e.g. the leader respawned)
  if (d > 60) {
    s.x = tx;
    s.z = tz;
    s.y = lead.y;
    s.yaw = lead.yaw;
  }
}

// ── the population follows the player ──

/** horizontal distance² between a creature and the focus */
export const dist2 = (s: { x: number; z: number }, f: { x: number; z: number }) => (s.x - f.x) ** 2 + (s.z - f.z) ** 2;

/**
 * Put a creature somewhere new, out of sight round the focus: `rMin..rMax` metres away, mostly
 * ahead (within `arc` radians of the direction of travel `dirX, dirZ`; any way if not moving), in
 * water at least `st.need` deep (and inside its home, if it has one), heading so it will cross
 * near the focus. Deterministic for a given rng.
 */
export function respawn(s: Swimmer, st: SwimStyle, focus: { x: number; z: number }, dirX: number, dirZ: number, rnd: () => number, rMin: number, rMax: number, arc = 1.3): void {
  const moving = dirX * dirX + dirZ * dirZ > 1e-4;
  const base = moving ? Math.atan2(dirX, dirZ) : rnd() * TAU;
  const spread = moving ? arc : Math.PI;
  let x = focus.x;
  let z = focus.z;
  // a little deeper than it strictly needs (the deep plain is ~21.75 m, give or take the dunes)
  const want = Math.min(st.need * 1.3, st.need + 3);
  const walkOutToSea = () => {
    // (far enough to cross the whole island if it has to: the Wildlands are ~3 km across)
    for (let j = 0; j < 600 && seaDepth(x, z) < want; j++) {
      const out = awayFromCoast(x, z);
      const step = Math.max(8, -seaDist(x, z) * 0.5);
      x += Math.sin(out) * step;
      z += Math.cos(out) * step;
    }
  };
  // the focus is so far inland (the kid out in the Wildlands) that nowhere in reach of it is sea:
  // leave the swimmer out at sea where it is (callers ask every frame while the kid's that far
  // off), only fetching one that's somehow on land back out to the water
  if (seaDist(focus.x, focus.z) < -rMax) {
    if (seaDepth(s.x, s.z) >= st.need) return;
    x = s.x;
    z = s.z;
    walkOutToSea();
  } else {
    for (let k = 0; k < 20; k++) {
      // (ahead of the focus first; then all round it — out west, Dino Isle can fill the whole arc ahead)
      const a = k < 10 ? base + (rnd() * 2 - 1) * spread : rnd() * TAU;
      const r = rMin + rnd() * (rMax - rMin);
      x = focus.x + Math.sin(a) * r;
      z = focus.z + Math.cos(a) * r;
      // (deep here, and deep enough on the way in towards the focus: a big whale turning up on the
      //  rim of an island's slopes, heading in, can't turn away in time)
      const ux = (focus.x - x) / r;
      const uz = (focus.z - z) / r;
      const ok = seaDepth(x, z) >= want && seaDepth(x + ux * st.look * 0.5, z + uz * st.look * 0.5) >= st.need && seaDepth(x + ux * st.look, z + uz * st.look) >= st.need;
      // (the tries from any side must have open water all the way in, too)
      if (ok && (k < 10 || (seaDepth(x + ux * r * 0.25, z + uz * r * 0.25) >= st.need && seaDepth(x + ux * r * 0.5, z + uz * r * 0.5) >= st.need && seaDepth(x + ux * r * 0.75, z + uz * r * 0.75) >= st.need))) break;
      if (k === 19) {
        // everywhere nearby is shallow (we're by the island): follow the coast's distance gradient
        // out to sea, step by step (a straight line from the plaza doesn't work any more now the
        // Wildlands has made the coast a huge, lopsided shape instead of a circle round the origin —
        // heading further along a bearing that happens to point into the Wildlands would only run
        // deeper inland, never reach the sea)
        walkOutToSea();
      }
    }
  }
  s.x = x;
  s.z = z;
  // aim to pass near the focus (never straight at it)
  const lateral = (rnd() * 2 - 1) * rMin * 0.45;
  const bx = focus.x - x;
  const bz = focus.z - z;
  const bl = Math.hypot(bx, bz) || 1;
  const ax = focus.x + (bz / bl) * lateral;
  const az = focus.z - (bx / bl) * lateral;
  s.yaw = Math.atan2(ax - x, az - z);
  s.yawRate = 0;
  s.speed = st.speed[0] + (st.speed[1] - st.speed[0]) * 0.5;
  s.y = WATER_Y - (st.depth[0] + st.depth[1]) / 2;
  s.y = Math.max(s.y, seaFloorY(x, z) + st.clear);
  s.vy = 0;
  s.pitch = 0;
  s.roll = 0;
}

/**
 * Tracks the focus between frames: its (smoothed) direction of travel, and big jumps (the world
 * wrap, or a teleport) — returned in `jump` so the caller can shift its whole population along.
 */
export interface FocusTracker {
  x: number;
  z: number;
  /** smoothed velocity (m/s) */
  vx: number;
  vz: number;
  /** set by trackFocus: the jump this frame (0 if none) */
  jx: number;
  jz: number;
  started: boolean;
}
export const makeFocusTracker = (): FocusTracker => ({ x: 0, z: 0, vx: 0, vz: 0, jx: 0, jz: 0, started: false });

/** update the tracker; returns true when the focus jumped (more than `jump` metres in one frame) */
export function trackFocus(f: FocusTracker, x: number, z: number, dt: number, jump = 60): boolean {
  f.jx = f.jz = 0;
  if (!f.started) {
    f.started = true;
    f.x = x;
    f.z = z;
    return false;
  }
  const dx = x - f.x;
  const dz = z - f.z;
  f.x = x;
  f.z = z;
  if (dx * dx + dz * dz > jump * jump) {
    f.jx = dx;
    f.jz = dz;
    return true;
  }
  if (dt > 0) {
    const k = Math.min(1, dt * 1.5);
    f.vx += (dx / dt - f.vx) * k;
    f.vz += (dz / dt - f.vz) * k;
  }
  return false;
}

/** move a whole population by (dx, dz) — keeps the neighbourhood intact across the world wrap */
export function shiftSwimmers(list: { x: number; z: number }[], dx: number, dz: number): void {
  for (const s of list) {
    s.x += dx;
    s.z += dz;
  }
}
