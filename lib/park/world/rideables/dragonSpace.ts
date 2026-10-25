// Room for Cucaino Park's dragons (pure maths, no three.js, allocation-free; tested):
// - which dragon "Say hi" / "Fly" means: the one the kid is FACING or walking toward, not merely the
//   nearest (at the Roost a Puffwing napping beside the kid must not steal the Roostwarden ahead)
// - keeping dragons out of each other and out of the Roost's perches, trough and banner (each body is
//   a capsule along its heading, true size, from mounts' mountBody)
// - when the "a dragon!" hints may start: once the kid has walked a few steps and the welcome
//   toasts have had their turn

/** a dragon's footprint: middle (x, z), heading, and its capsule (half length, half width, forward offset) */
export interface DragonFoot {
  x: number;
  z: number;
  yaw: number;
  hl: number;
  hw: number;
  off: number;
}
/** a round obstacle (a post, a pole, a trough end) */
export interface RoundProp {
  x: number;
  z: number;
  r: number;
}

/** how much a target off to the side counts against it (m added at 90 degrees off the facing; twice that behind) */
export const FACE_PENALTY = 5;

/**
 * The effective distance used to pick the dragon a kid means: the gap to its side, plus a penalty
 * that grows as it falls away from where the kid is facing (or heading, if walking).
 */
export function facedGap(gap: number, kx: number, kz: number, facing: number, tx: number, tz: number): number {
  const dx = tx - kx;
  const dz = tz - kz;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) return gap;
  const c = (Math.sin(facing) * dx + Math.cos(facing) * dz) / d;
  return Math.max(0, gap) + FACE_PENALTY * (1 - c);
}

/** closest points between segments p0-p1 and q0-q1 (2D): writes the gap direction, returns the distance */
const seg = { ax: 0, az: 0, bx: 0, bz: 0 };
function segDist(p0x: number, p0z: number, p1x: number, p1z: number, q0x: number, q0z: number, q1x: number, q1z: number): number {
  const ux = p1x - p0x;
  const uz = p1z - p0z;
  const vx = q1x - q0x;
  const vz = q1z - q0z;
  const wx = p0x - q0x;
  const wz = p0z - q0z;
  const a = ux * ux + uz * uz;
  const b = ux * vx + uz * vz;
  const c = vx * vx + vz * vz;
  const d = ux * wx + uz * wz;
  const e = vx * wx + vz * wz;
  const D = a * c - b * b;
  let s = D > 1e-9 ? (b * e - c * d) / D : 0;
  s = Math.max(0, Math.min(1, s));
  let t = c > 1e-9 ? (b * s + e) / c : 0;
  if (t < 0) {
    t = 0;
    s = a > 1e-9 ? Math.max(0, Math.min(1, -d / a)) : 0;
  } else if (t > 1) {
    t = 1;
    s = a > 1e-9 ? Math.max(0, Math.min(1, (b - d) / a)) : 0;
  }
  seg.ax = p0x + ux * s;
  seg.az = p0z + uz * s;
  seg.bx = q0x + vx * t;
  seg.bz = q0z + vz * t;
  return Math.hypot(seg.ax - seg.bx, seg.az - seg.bz);
}

/** the capsule's spine (end points), written into out[0..3] */
function spine(f: DragonFoot, out: Float64Array) {
  const fx = Math.sin(f.yaw);
  const fz = Math.cos(f.yaw);
  const L = Math.max(0, f.hl - f.hw);
  const cx = f.x + fx * f.off;
  const cz = f.z + fz * f.off;
  out[0] = cx - fx * L;
  out[1] = cz - fz * L;
  out[2] = cx + fx * L;
  out[3] = cz + fz * L;
}
const SA = new Float64Array(4);
const SB = new Float64Array(4);

/** how far two dragons' bodies overlap (m; <= 0: clear by that much) */
export function dragonOverlap(a: DragonFoot, b: DragonFoot): number {
  spine(a, SA);
  spine(b, SB);
  return a.hw + b.hw - segDist(SA[0], SA[1], SA[2], SA[3], SB[0], SB[1], SB[2], SB[3]);
}

/** how far a dragon's body overlaps a round prop (m; <= 0 clear) */
export function propOverlap(a: DragonFoot, p: RoundProp): number {
  spine(a, SA);
  return a.hw + p.r - segDist(SA[0], SA[1], SA[2], SA[3], p.x, p.z, p.x, p.z);
}

/**
 * One relaxation pass: push overlapping dragons apart (each half, or all of it onto a `fixed[i]`
 * one's neighbour) and out of the props, keeping `gap` m between. `pinned[i]` dragons don't move
 * (the one the kid is riding / making friends with). Moves x, z in place; returns the worst overlap
 * left (before this pass's pushes).
 */
export function separateDragons(ds: DragonFoot[], props: readonly RoundProp[], gap: number, pinned?: readonly boolean[]): number {
  let worst = 0;
  for (let i = 0; i < ds.length; i++)
    for (let j = i + 1; j < ds.length; j++) {
      const a = ds[i];
      const b = ds[j];
      // (far apart: skip)
      if (Math.abs(a.x - b.x) > a.hl + b.hl + Math.abs(a.off) + Math.abs(b.off) + gap || Math.abs(a.z - b.z) > a.hl + b.hl + Math.abs(a.off) + Math.abs(b.off) + gap) continue;
      const o = dragonOverlap(a, b) + gap;
      if (o <= 0) continue;
      worst = Math.max(worst, o - gap);
      let nx = seg.ax - seg.bx;
      let nz = seg.az - seg.bz;
      let nl = Math.hypot(nx, nz);
      if (nl < 1e-4) {
        nx = a.x - b.x || 1;
        nz = a.z - b.z;
        nl = Math.hypot(nx, nz);
      }
      nx /= nl;
      nz /= nl;
      const pa = pinned?.[i] ? 0 : pinned?.[j] ? 1 : 0.5;
      const pb = pinned?.[j] ? 0 : pinned?.[i] ? 1 : 0.5;
      a.x += nx * o * pa;
      a.z += nz * o * pa;
      b.x -= nx * o * pb;
      b.z -= nz * o * pb;
    }
  for (let i = 0; i < ds.length; i++) {
    if (pinned?.[i]) continue;
    const a = ds[i];
    for (let k = 0; k < props.length; k++) {
      const p = props[k];
      if (Math.abs(a.x - p.x) > a.hl + Math.abs(a.off) + p.r + gap || Math.abs(a.z - p.z) > a.hl + Math.abs(a.off) + p.r + gap) continue;
      const o = propOverlap(a, p) + gap;
      if (o <= 0) continue;
      worst = Math.max(worst, o - gap);
      let nx = seg.ax - p.x;
      let nz = seg.az - p.z;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl;
      nz /= nl;
      a.x += nx * o;
      a.z += nz * o;
    }
  }
  return worst;
}

/** the "a dragon!" hints wait this long after the park opens (the welcome toasts go first) */
export const HINT_AFTER_S = 7.5;
/** ...and until the kid has walked this far */
export const HINT_AFTER_WALK = 3;

/** may the park point out a dragon yet? */
export function hintsReady(sinceReady: number, walked: number): boolean {
  return sinceReady >= HINT_AFTER_S && walked >= HINT_AFTER_WALK;
}
