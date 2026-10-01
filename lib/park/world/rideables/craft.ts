// Pure rules for the boats and submarines (maths only, no scene objects) - shared by the engine
// (steering, depth, hopping off) and the fleet (bobbing idle boats). Tested in craft.test.ts.
import { WATER_Y } from "../../registry/terrain";
import { villageCalm } from "../../registry/villageIsland";
import { frostCalm } from "../../registry/frostIsland";
import { dinoCalm } from "../../registry/dinoIsland";
import { BOAT_CAPS, MOUNT_BODY, SUB_CAPS, type BoatKind, type SubKind } from "../../characters/mounts";

/** where the main island's sand meets the water (= ocean.SHORE_R: the swell dies away inside it) */
const SHORE_R = 152 + 14;

/** the ocean's long swells (the very same sum as the ocean surface shader's seaWave) */
export function seaWave(x: number, z: number, t: number): number {
  return (
    Math.sin(x * 0.08 + t * 0.9) * 0.35 +
    Math.sin(z * 0.11 - t * 1.1) * 0.28 +
    Math.sin((x + z) * 0.05 + t * 0.6) * 0.4 +
    Math.sin(x * 0.13 - z * 0.21 + t * 1.45) * 0.12
  );
}

/** how much of the swell reaches (x, z): calm by the main island's beach and round the far islands */
export function swellDamp(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const u = Math.min(1, Math.max(0, (r - SHORE_R) / 25));
  return u * u * (3 - 2 * u) * villageCalm(x, z) * frostCalm(x, z) * dinoCalm(x, z);
}

/** the sea surface's height at (x, z) at time t (what floats rides on) */
export function seaSurfaceY(x: number, z: number, t: number): number {
  return WATER_Y + seaWave(x, z, t) * swellDamp(x, z);
}

export interface Tilt {
  /** nose up (-) / down (+), radians about the boat's side axis (Euler x, "YXZ") */
  pitch: number;
  /** roll, radians about its length (Euler z) */
  roll: number;
  /** surface height under the middle */
  y: number;
}

/**
 * How a hull `len` long and `beam` wide sits on the swell at (x, z) facing `yaw`: the surface
 * height, and the pitch / roll from the slopes under its ends and sides (a long ship barely moves,
 * a pedalo bobs). Writes into `out` (no allocation).
 */
export function hullTilt(x: number, z: number, yaw: number, len: number, beam: number, t: number, out: Tilt): Tilt {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const hl = len * 0.42;
  const hb = beam * 0.45;
  const yf = seaSurfaceY(x + fx * hl, z + fz * hl, t);
  const ya = seaSurfaceY(x - fx * hl, z - fz * hl, t);
  const yr = seaSurfaceY(x + fz * hb, z - fx * hb, t);
  const yl = seaSurfaceY(x - fz * hb, z + fx * hb, t);
  out.y = (yf + ya + yr + yl) / 4;
  out.pitch = -Math.atan2(yf - ya, hl * 2) * 0.8;
  out.roll = Math.atan2(yr - yl, hb * 2) * 0.6;
  return out;
}

/**
 * The least spare water under a boat's hull at (x, z) facing `yaw` (m; < 0 = it would run aground),
 * sampled under the bow, the stern, both sides and the middle. `depth(x, z)` = how deep the sea is
 * there (<= 0 on land, beaches, jetties and ice floes). The pedalo also counts the open ocean as
 * out of bounds (it's a shore boat: deeper than its maxSea = "too far out").
 */
export function boatClearance(kind: BoatKind, x: number, z: number, yaw: number, depth: (x: number, z: number) => number): number {
  const [hl, hw, off] = MOUNT_BODY[kind];
  const cap = BOAT_CAPS[kind];
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const cx = x + fx * off;
  const cz = z + fz * off;
  let worst = Infinity;
  // bow, stern, the two sides amidships, and the middle (the bow is pointy: sample it a touch in)
  for (let i = 0; i < 5; i++) {
    const along = i === 0 ? hl * 0.92 : i === 1 ? -hl * 0.95 : i === 4 ? 0 : hl * 0.1;
    const across = i === 2 ? hw * 0.95 : i === 3 ? -hw * 0.95 : 0;
    const px = cx + fx * along + fz * across;
    const pz = cz + fz * along - fx * across;
    const d = depth(px, pz);
    worst = Math.min(worst, d - cap.draft);
    if (i === 4 && d > cap.maxSea) worst = Math.min(worst, cap.maxSea - d);
  }
  return worst;
}

/**
 * Can a boat move from (x0, z0) to (x1, z1) (facing yaw)? Yes if there's water enough under the
 * whole hull there - or if it's stuck already, as long as the move doesn't make things worse (so a
 * boat nudged onto a sandbar can always back off it).
 */
export function boatCanMove(kind: BoatKind, x0: number, z0: number, x1: number, z1: number, yaw: number, depth: (x: number, z: number) => number): boolean {
  const c1 = boatClearance(kind, x1, z1, yaw, depth);
  if (c1 >= 0) return true;
  return c1 > boatClearance(kind, x0, z0, yaw, depth) + 1e-4;
}

/**
 * A sub's allowed altitude range (root height minus WATER_Y): from just above the floor (or its
 * deepest dive) up to bobbing at the surface. `floorY` = the sea floor under it.
 */
export function subAltRange(kind: SubKind, floorY: number, out: { lo: number; hi: number }): { lo: number; hi: number } {
  const c = SUB_CAPS[kind];
  const lo = Math.max(floorY + c.clear - WATER_Y, -c.maxDepth);
  out.hi = c.surf;
  out.lo = Math.min(lo, c.surf);
  return out;
}

/**
 * Can a sub at root height y move to (x, z)? Not into a wall (a floor higher than its keel), nor
 * up a beach. `floorY(x, z)` = the sea floor / ground there.
 */
export function subCanMove(kind: SubKind, y: number, x: number, z: number, floorY: (x: number, z: number) => number): boolean {
  const f = floorY(x, z);
  if (WATER_Y - f < SUB_CAPS[kind].clear - SUB_CAPS[kind].surf + 0.1) return false;
  return f + SUB_CAPS[kind].clear <= y + 0.35;
}

/**
 * Where to step off a boat at (x, z) facing yaw, `hl` long each way from its middle: the nearest
 * dry deck / beach / land within `reach` m of the hull (rings round points along its length, so a
 * boat moored nose-in to a jetty lets you off onto the jetty), or null (then the kid swims).
 * `floorY` = ground height there.
 */
export function landingSpot(x: number, z: number, yaw: number, hl: number, reach: number, floorY: (x: number, z: number) => number, out: { x: number; z: number; y: number }): { x: number; z: number; y: number } | null {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  for (let r = 0.6; r <= reach; r += 0.6) {
    const n = Math.max(8, Math.round(r * 5));
    let best = Infinity;
    let bx = 0;
    let bz = 0;
    let by = 0;
    for (let s = -2; s <= 2; s++) {
      const cx = x + fx * hl * s * 0.5;
      const cz = z + fz * hl * s * 0.5;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = cx + Math.sin(a) * r;
        const pz = cz + Math.cos(a) * r;
        const y = floorY(px, pz);
        // dry; the nearest to the kid (the middle of the boat), lower spots (a deck, the sand) first
        if (y > WATER_Y + 0.15) {
          const score = Math.hypot(px - x, pz - z) + Math.max(0, y - 2) * 2;
          if (score < best) ((best = score), (bx = px), (bz = pz), (by = y));
        }
      }
    }
    if (best < Infinity) {
      out.x = bx;
      out.z = bz;
      out.y = by;
      return out;
    }
  }
  return null;
}

/** ease a velocity towards a target: boats have momentum (they coast, and take a moment to get going) */
export function easeVel(v: number, target: number, accel: number, dt: number): number {
  return v + (target - v) * Math.min(1, dt * accel);
}

/** shortest signed angle from a to b */
const angleTo = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export interface Helm {
  /** heading (radians about +Y) */
  yaw: number;
  /** speed along the heading (m/s; < 0 = going astern) */
  speed: number;
  /** going astern (backing out of a mooring), and for how long */
  reverse: boolean;
  revT: number;
}

/** how long a boat backs out before it comes round and heads off forwards (s) */
export const ASTERN_T = 1.8;

/**
 * A boat's (or sub's) helm, one step: the joystick (jx, jz: a world direction, length <= 1) sets
 * where to go; the bow turns towards it at `turn` rad/s (slower with little way on), speed builds
 * up along the heading (momentum: it coasts when you let go). Pull the stick to behind the boat
 * from (nearly) standing and it backs out first (how you leave a mooring nose-in to a jetty),
 * then comes round and heads off forwards. `top` = full speed (m/s). Updates `h` in place.
 */
export function steer(h: Helm, jx: number, jz: number, top: number, accel: number, turn: number, dt: number): Helm {
  const mag = Math.min(1, Math.hypot(jx, jz));
  let target = 0;
  let want = h.yaw;
  if (mag > 0.05) {
    const dir = Math.atan2(jx, jz);
    const c = Math.cos(dir - h.yaw);
    // (only once per push of the stick: after backing out it comes round under way)
    if (Math.abs(h.speed) < 1.2 && !h.reverse && h.revT <= 0 && c < -0.3) ((h.reverse = true), (h.revT = 1e-6));
    if (h.reverse) {
      h.revT += dt;
      // (stick ahead of the bow again, or backed out long enough: come round and go forwards)
      if (c > 0.3 || h.revT > ASTERN_T) h.reverse = false;
    }
    if (h.reverse) {
      // astern: the stern swings towards the stick
      target = -top * 0.35 * mag;
      want = dir + Math.PI;
    } else {
      // (no full power until the bow comes round)
      target = top * mag * Math.max(0.2, c);
      want = dir;
    }
  } else {
    if (Math.abs(h.speed) < 0.3) h.reverse = false;
    h.revT = 0;
  }
  h.speed = easeVel(h.speed, target, mag > 0.05 ? accel : accel * 0.55, dt);
  const way = 0.35 + 0.65 * Math.min(1, Math.abs(h.speed) / 4);
  const d = angleTo(h.yaw, want);
  const step = turn * way * dt;
  h.yaw += Math.abs(d) <= step ? d : Math.sign(d) * step;
  return h;
}
