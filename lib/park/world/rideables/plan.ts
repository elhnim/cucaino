// Pure helpers for the rideables' behaviour (maths only, no scene objects) — tested in rideables.test.ts.
import { WATER_Y } from "../../registry/terrain";
import { MOUNT_SEA_DRAFT } from "../../characters/mounts";
import { seaDepth } from "../sea/wander";

/** where a sea friend's rig root floats (its back and fin just out of the water) */
export const SEA_ROOT_Y = { dolphin: WATER_Y - MOUNT_SEA_DRAFT.dolphin!, whale: WATER_Y - MOUNT_SEA_DRAFT.whale! } as const;

/** how deep the water must be for each swimmer to come up (m) */
export const SEA_MIN_DEPTH = { dolphin: 3, whale: 12 } as const;
/** how far from the kid they stop to wait (m) */
export const SEA_WAIT_R = { dolphin: [9, 12], whale: [11.5, 14] } as const;
/** how far out they start swimming in from (m, beyond the wait spot) */
export const SEA_START_R = 32;

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
export function pickSeaCall(kx: number, kz: number, kind: "dolphin" | "whale", r1: number, r2: number, out: SeaCall): SeaCall | null {
  const out0 = Math.atan2(kx, kz);
  const a = out0 + (r1 - 0.5) * 2.2;
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
