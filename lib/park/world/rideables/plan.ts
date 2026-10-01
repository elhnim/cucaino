// Pure helpers for the rideables' behaviour (maths only, no scene objects) — tested in rideables.test.ts.
import { WATER_Y } from "../../registry/terrain";
import { MOUNT_BODY, MOUNT_SEA_DRAFT, type MountKind } from "../../characters/mounts";
import { seaDepth, seaFloorY } from "../sea/wander";

/** where a sea friend's rig root floats (its back and fin just out of the water) */
export const SEA_ROOT_Y = { dolphin: WATER_Y - MOUNT_SEA_DRAFT.dolphin!, whale: WATER_Y - MOUNT_SEA_DRAFT.whale! } as const;

/** how deep the water must be for each swimmer to come up (m) */
export const SEA_MIN_DEPTH = { dolphin: 3, whale: 10 } as const;
/** how far from the kid they stop to wait (m) */
export const SEA_WAIT_R = { dolphin: [9, 12], whale: [13, 16] } as const;
/** how far out they start swimming in from (m, beyond the wait spot) */
export const SEA_START_R = 32;
/** seconds out in deep water before the first friend comes up (dolphin first, then the whale) */
export const SEA_FIRST_CALL = { dolphin: 9, whale: 13 } as const;
/** a waiting ride never sits on top of the kid: its side stays at least this far off (m) */
export const MIN_GAP = 0.8;

/** the manta that comes to a diving kid: after `after` s under water (in water `minDepth`+ m
 *  deep) it glides in from `startR` m off and waits `wait` m (middle to kid) beside them */
export const MANTA_CALL = { after: [16, 24], minDepth: 6, startR: 30, wait: 7, stay: 45 } as const;

/**
 * How far (x, z) is from a ride's side: its footprint is a capsule along its heading
 * (MOUNT_BODY: half length, half width, centre offset forward). Negative = inside it.
 */
export function sideGap(kind: MountKind, rx: number, rz: number, yaw: number, x: number, z: number, body?: [number, number, number]): number {
  const [hl, hw, off] = body ?? MOUNT_BODY[kind];
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const ax = x - (rx + fx * off);
  const az = z - (rz + fz * off);
  const along = Math.max(-hl, Math.min(hl, ax * fx + az * fz));
  return Math.hypot(ax - fx * along, az - fz * along) - hw;
}

/**
 * Nudge a ride (in place) so its side is at least `gap` m from (x, z) - it moves, never the kid,
 * and only just enough not to overlap (it doesn't back off).
 */
export function keepGap(r: { kind: MountKind; x: number; z: number; yaw: number }, x: number, z: number, gap = MIN_GAP): void {
  const g = sideGap(r.kind, r.x, r.z, r.yaw, x, z);
  if (g >= gap) return;
  const [hl, , off] = MOUNT_BODY[r.kind];
  const fx = Math.sin(r.yaw);
  const fz = Math.cos(r.yaw);
  const ax = x - (r.x + fx * off);
  const az = z - (r.z + fz * off);
  const along = Math.max(-hl, Math.min(hl, ax * fx + az * fz));
  let nx = ax - fx * along;
  let nz = az - fz * along;
  let nl = Math.hypot(nx, nz);
  if (nl < 1e-4) {
    // right on its middle line: step sideways
    nx = fz;
    nz = -fx;
    nl = 1;
  }
  const push = gap - g;
  r.x -= (nx / nl) * push;
  r.z -= (nz / nl) * push;
}

export interface MantaCall {
  /** where it swims in from (at depth y) */
  sx: number;
  sz: number;
  y: number;
  /** its first wait spot beside the kid */
  x: number;
  z: number;
}

/** mid-water height for a manta near a kid at depth ky (never in the sand, never at the top) */
export function mantaDepth(x: number, z: number, ky: number): number {
  const floor = seaFloorY(x, z);
  const top = WATER_Y - 1.6;
  return Math.max(floor + 1.8, Math.min(top, ky + 0.2));
}

/**
 * Pick where a manta glides in from to visit a diving kid at (kx, ky, kz): `r1` in 0..1 picks
 * the direction. Null if the water's too shallow there or along the way (try again soon).
 */
export function pickMantaCall(kx: number, ky: number, kz: number, r1: number, out: MantaCall): MantaCall | null {
  const a = r1 * Math.PI * 2;
  const sx = kx + Math.sin(a) * MANTA_CALL.startR;
  const sz = kz + Math.cos(a) * MANTA_CALL.startR;
  for (let k = 0; k <= 5; k++) {
    const u = k / 5;
    if (seaDepth(kx + (sx - kx) * u, kz + (sz - kz) * u) < MANTA_CALL.minDepth - 1) return null;
  }
  out.sx = sx;
  out.sz = sz;
  out.x = kx + Math.sin(a) * MANTA_CALL.wait;
  out.z = kz + Math.cos(a) * MANTA_CALL.wait;
  out.y = mantaDepth(sx, sz, ky);
  return out;
}

export interface SeaCall {
  /** where it waits */
  x: number;
  z: number;
  /** where it swims in from */
  sx: number;
  sz: number;
}

/**
 * Pick where a dolphin / whale comes up near a kid out at sea: seaward of the kid (so it swims in
 * from the open ocean), `r1` / `r2` in 0..1 pick the angle and distance. Null if the water there
 * (and all along the way in) isn't deep enough — try again later.
 */
export function pickSeaCall(kx: number, kz: number, kind: "dolphin" | "whale", r1: number, r2: number, out: SeaCall, aim?: number): SeaCall | null {
  // (`aim`: come up round that heading from the kid instead, e.g. the other side from a friend already there)
  const out0 = aim ?? Math.atan2(kx, kz);
  const a = out0 + (r1 - 0.5) * (aim === undefined ? 2.2 : 1.2);
  const [lo, hi] = SEA_WAIT_R[kind];
  const d = lo + (hi - lo) * r2;
  const x = kx + Math.sin(a) * d;
  const z = kz + Math.cos(a) * d;
  const min = SEA_MIN_DEPTH[kind];
  if (seaDepth(x, z) < min) return null;
  const sx = x + Math.sin(a) * SEA_START_R;
  const sz = z + Math.cos(a) * SEA_START_R;
  for (let k = 1; k <= 4; k++) {
    const u = k / 4;
    if (seaDepth(x + (sx - x) * u, z + (sz - z) * u) < min * 0.8) return null;
  }
  out.x = x;
  out.z = z;
  out.sx = sx;
  out.sz = sz;
  return out;
}

/** shortest signed angle from a to b */
export function angleTo(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** turn `yaw` towards `target` by at most `rate * dt` */
export function turnTowards(yaw: number, target: number, rate: number, dt: number): number {
  const d = angleTo(yaw, target);
  const s = rate * dt;
  return yaw + (Math.abs(d) <= s ? d : Math.sign(d) * s);
}
