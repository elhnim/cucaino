// Shared chibi body parts: head/body shells, the face (eyes, blush, muzzle, nose, mouth), limbs.
// Designs compose these and then add their signature details.
import * as THREE from "three";
import { BLUSH, EYE, Ell, MOUTH, WHITE, capsule, ell, orient, torus, type Joint, type Kit, type Place, type V3 } from "./parts";

export function headShell(k: Kit, color: string | THREE.Material, seg: [number, number] = [20, 14]) {
  const { c, r } = k.headE;
  k.add(k.head, color, ell([r.x, r.y, r.z], { p: [c.x, c.y, c.z] }, seg));
}
export function bodyShell(k: Kit, color: string | THREE.Material, seg: [number, number] = [14, 10]) {
  const { c, r } = k.bodyE;
  k.add(k.body, color, ell([r.x, r.y, r.z], { p: [c.x, c.y, c.z] }, seg));
}
/** tummy patch on the body front */
export function belly(k: Kit, color: string, r: V3 = [0.11, 0.1, 0.05], y = -0.01) {
  const pl = k.bodyE.front(0, y, -r[2] * 0.62);
  k.add(k.body, color, ell(r, { p: pl.pv, q: pl.q }, [12, 8]));
}

export interface EyeOpts {
  x?: number;
  y?: number;
  size?: number;
  lift?: number;
  /** tilt the eye towards the ground a little (radians) */
  down?: number;
  /** squash/stretch of the iris [w,h] */
  shape?: [number, number];
  /** put the eyes on this ellipsoid instead of the head (e.g. a face mask) */
  on?: Ell;
  /** explicit eye places (crab stalks) instead of the symmetric face layout */
  places?: [Place, Place];
  /** white ball behind the iris (stalk eyes) */
  ball?: string;
  /** iris colour (default: the dark chibi eye) and what it glows at night */
  iris?: string;
  irisGlow?: string;
  irisGlowStrength?: number;
  /** a slit pupil in this colour over the iris (dragon eyes) */
  pupil?: string;
}

/** Big glossy chibi eyes (+ the closed "u u" / happy "^ ^" arcs). */
export function eyes(k: Kit, o: EyeOpts = {}) {
  const x = o.x ?? 0.12, y = o.y ?? -0.025, size = o.size ?? 1;
  const [sw, sh] = o.shape ?? [1, 1];
  const surf = o.on ?? k.headE;
  const iris = k.glow(o.iris ?? EYE, o.irisGlow ?? "#8f6bff", o.irisGlowStrength ?? 0.45);
  const sparkle = k.basic(WHITE);
  const places: [Place, Place] = o.places ?? [surf.front(x, y, o.lift ?? 0), surf.front(-x, y, o.lift ?? 0)];
  k.eyePlaces = places;
  const sides = [1, -1] as const;
  sides.forEach((s, i) => {
    const pl = places[i];
    const q = orient(pl, 0, [o.down ?? 0.12, 0, 0]);
    const e = new THREE.Euler().setFromQuaternion(q);
    const eye = k.joint(s > 0 ? "eyeL" : "eyeR", k.head, pl.pv, [e.x, e.y, e.z]);
    const closed = k.joint(s > 0 ? "closedL" : "closedR", k.head, pl.pv, [e.x, e.y, e.z]);
    if (o.ball) k.add(eye, o.ball, ell([0.07 * size, 0.075 * size, 0.06 * size], { p: [0, 0, -0.035 * size] }, [12, 9]));
    k.add(eye, iris, ell([0.056 * size * sw, 0.07 * size * sh, 0.03 * size], {}, [12, 9]));
    if (o.pupil) k.add(eye, o.pupil, ell([0.02 * size * sw, 0.052 * size * sh, 0.012 * size], { p: [0, -0.004 * size, 0.022 * size] }, [8, 7]));
    // two sparkles, same light direction on both eyes (upper-left as you look at them)
    k.add(eye, sparkle,
      ell([0.022 * size, 0.024 * size, 0.012 * size], { p: [-0.019 * size * sw, 0.024 * size * sh, 0.024 * size] }, [8, 6]),
      ell([0.011 * size, 0.011 * size, 0.008 * size], { p: [0.02 * size * sw, -0.026 * size * sh, 0.024 * size] }, [6, 4]));
    // closed eye: a "u" arc (rotated to "^" for happy)
    k.add(closed, EYE, torus(0.042 * size, 0.0085 * size, { p: [0, 0.012 * size, 0.012], r: [0, 0, Math.PI] }, Math.PI, [4, 10]));
    closed.g.visible = false;
    if (s > 0) {
      k.eyeL = eye;
      k.closedL = closed;
    } else {
      k.eyeR = eye;
      k.closedR = closed;
    }
  });
}

export function blush(k: Kit, o: { x?: number; y?: number; lift?: number; on?: Ell; r?: [number, number] } = {}) {
  const x = o.x ?? 0.195, y = o.y ?? -0.1;
  const surf = o.on ?? k.headE;
  const m = k.glow(BLUSH, "#ff6f9f", 0.9, 0.72);
  const [rw, rh] = o.r ?? [0.052, 0.032];
  for (const s of [1, -1]) {
    const pl = surf.front(s * x, y, o.lift ?? 0.002);
    k.add(k.head, m, ell([rw, rh, 0.012], { p: pl.pv, q: pl.q }, [9, 5]));
  }
}

/** a snout/muzzle bump on the lower face; returns its ellipsoid (for nose & mouth placement) */
export function muzzle(k: Kit, color: string, o: { y?: number; r?: V3; sink?: number } = {}): Ell {
  const r = o.r ?? [0.105, 0.072, 0.07];
  const pl = k.headE.front(0, o.y ?? -0.105);
  const c = pl.p.clone().addScaledVector(pl.n, -r[2] * (o.sink ?? 0.5));
  const e = new Ell([c.x, c.y, c.z], r);
  k.add(k.head, color, ell(r, { p: [c.x, c.y, c.z] }, [12, 9]));
  return e;
}

export function nose(k: Kit, on: Ell, color: string, o: { y?: number; r?: V3; lift?: number } = {}) {
  const r = o.r ?? [0.03, 0.021, 0.018];
  const pl = on.front(0, o.y ?? on.r.y * 0.38, o.lift ?? -r[2] * 0.3);
  k.add(k.head, color, ell(r, { p: pl.pv, q: pl.q }, [8, 6]));
  // a tiny shine on the nose
  const sh = on.front(-r[0] * 0.3, (o.y ?? on.r.y * 0.38) + r[1] * 0.35, r[2] * 0.55);
  k.add(k.head, k.basic("#ffffff"), ell([r[0] * 0.28, r[1] * 0.22, 0.004], { p: sh.pv, q: sh.q }, [6, 4]));
}

export type MouthStyle = "smile" | "w" | "none";
/** smile / cat "w" mouth + the open mouth used when eating & cheering */
export function mouth(k: Kit, on: Ell, style: MouthStyle, o: { y?: number; lift?: number; size?: number; tongue?: boolean } = {}) {
  const size = o.size ?? 1;
  const pl = on.front(0, o.y ?? -on.r.y * 0.3, o.lift ?? 0.004);
  const e = new THREE.Euler().setFromQuaternion(pl.q);
  const m = k.joint("mouth", k.head, pl.pv, [e.x, e.y, e.z]);
  const open = k.joint("mouthOpen", k.head, pl.pv, [e.x, e.y, e.z]);
  k.mouth = m;
  k.mouthOpen = open;
  if (style === "smile") k.add(m, MOUTH, torus(0.024 * size, 0.0065 * size, { p: [0, 0.014 * size, 0], r: [0, 0, Math.PI] }, Math.PI, [4, 10]));
  if (style === "w")
    for (const s of [1, -1])
      k.add(m, MOUTH, torus(0.016 * size, 0.006 * size, { p: [s * 0.016 * size, 0.008 * size, 0], r: [0, 0, Math.PI] }, Math.PI, [4, 8]));
  if (o.tongue) k.add(m, "#ff8fab", ell([0.022 * size, 0.028 * size, 0.012], { p: [0.006, -0.022 * size, 0.006], r: [0.2, 0, 0.15] }, [8, 6]));
  k.add(open, MOUTH, ell([0.03 * size, 0.026 * size, 0.012], { p: [0, -0.006, 0] }, [8, 6]));
  k.add(open, "#ff8fab", ell([0.018 * size, 0.01 * size, 0.008], { p: [0, -0.018 * size, 0.008] }, [6, 4]));
  open.g.visible = false;
}

export interface ArmOpts {
  color: string;
  paw?: string;
  x?: number;
  y?: number;
  z?: number;
  r?: number;
  len?: number;
  /** resting outward angle */
  rest?: number;
  shape?: "paw" | "wing" | "fin" | "none";
  /** wing/fin tip colour */
  tip?: string;
}
export function arms(k: Kit, o: ArmOpts) {
  if (o.shape === "none") return;
  const x = o.x ?? 0.14, y = o.y ?? 0.19, z = o.z ?? 0.01;
  const r = o.r ?? 0.042, len = o.len ?? 0.055;
  const rest = o.rest ?? 0.42;
  for (const s of [1, -1]) {
    const j = k.joint(s > 0 ? "armL" : "armR", k.body, [s * x, y, z], [0, 0, s * rest]);
    if (o.shape === "wing") {
      k.add(j, o.color, ell([0.028, 0.1, 0.07], { p: [s * 0.012, -0.075, -0.01], r: [0.1, 0, s * 0.12] }, [10, 8]));
      if (o.tip) k.add(j, o.tip, ell([0.024, 0.045, 0.055], { p: [s * 0.02, -0.14, -0.015], r: [0.1, 0, s * 0.2] }, [8, 6]));
    } else if (o.shape === "fin") {
      k.add(j, o.color, ell([0.016, 0.07, 0.085], { p: [s * 0.02, -0.05, -0.03], r: [0.5, 0, s * 0.2] }, [10, 7]));
    } else {
      k.add(j, o.color, capsule(r, len, { p: [0, -len * 0.5 - r * 0.35, 0] }, 8, 2));
      if (o.paw) k.add(j, o.paw, ell([r * 1.08, r * 0.95, r * 1.08], { p: [0, -len - r * 0.45, 0.002] }, [8, 6]));
    }
    if (s > 0) k.armL = j;
    else k.armR = j;
  }
}

export interface LegOpts {
  color: string;
  foot?: string;
  x?: number;
  /** foot radii */
  r?: V3;
  /** flat bird feet */
  bird?: boolean;
}
export function legs(k: Kit, o: LegOpts) {
  const x = o.x ?? 0.082;
  const r = o.r ?? [0.062, 0.052, 0.074];
  for (const s of [1, -1]) {
    const j = k.joint(s > 0 ? "legL" : "legR", k.rig, [s * x, 0.1, 0]);
    if (o.bird) {
      k.add(j, o.foot ?? o.color, capsule(0.016, 0.05, { p: [0, -0.045, 0] }, 6, 2));
      k.add(j, o.foot ?? o.color, ell([0.06, 0.02, 0.07], { p: [0, -0.082, 0.03] }, [10, 6]));
    } else {
      k.add(j, o.color, capsule(0.046, 0.03, { p: [0, -0.02, 0] }, 7, 2));
      k.add(j, o.foot ?? o.color, ell(r, { p: [0, -0.1 + r[1], 0.016] }, [10, 8]));
    }
    if (s > 0) k.legL = j;
    else k.legR = j;
  }
}

/**
 * A mirrored pair of ear joints on the head. `dir` is the left (+x) direction from the head
 * centre; `rot` the left ear's euler (y & z are mirrored for the right ear). Ears grow along +Y.
 */
export function earPair(k: Kit, dir: V3, rot: V3, build: (ear: Joint, s: 1 | -1) => void, lift = -0.02) {
  for (const s of [1, -1] as const) {
    const pl = k.headE.dir(s * dir[0], dir[1], dir[2], lift);
    const j = k.joint(s > 0 ? "earL" : "earR", k.head, pl.pv, [rot[0], s * rot[1], s * rot[2]]);
    build(j, s);
    if (s > 0) k.earL = j;
    else k.earR = j;
  }
}

export function tailJoint(k: Kit, p: V3 = [0, 0.07, -0.13], r: V3 = [0, 0, 0]): Joint {
  k.tail = k.joint("tail", k.body, p, r);
  return k.tail;
}

/** a ring hugging an ellipsoid at height y (stripe bands, collars) */
export function bandY(on: Ell, y: number, thick: number, grow = 0.006): THREE.BufferGeometry {
  const [rx, rz] = on.sliceAtY(on.c.y + y);
  return ell([rx + grow, thick, rz + grow], { p: [on.c.x, on.c.y + y, on.c.z] }, [14, 4]);
}
export function bandZ(on: Ell, z: number, thick: number, grow = 0.006): THREE.BufferGeometry {
  const [rx, ry] = on.sliceAtZ(on.c.z + z);
  return ell([rx + grow, ry + grow, thick], { p: [on.c.x, on.c.y, on.c.z + z] }, [14, 4]);
}

/** Standard face: eyes + blush + optional muzzle/nose + mouth. */
export interface FaceOpts {
  eyes?: EyeOpts;
  blush?: { x?: number; y?: number; lift?: number; on?: Ell; r?: [number, number] } | false;
  muzzle?: { color: string; y?: number; r?: V3; sink?: number };
  nose?: { color: string; y?: number; r?: V3; lift?: number } | false;
  mouth?: { style: MouthStyle; y?: number; size?: number; tongue?: boolean; lift?: number };
}
export function face(k: Kit, o: FaceOpts = {}) {
  eyes(k, o.eyes);
  if (o.blush !== false) blush(k, o.blush ?? {});
  const mz = o.muzzle ? muzzle(k, o.muzzle.color, o.muzzle) : null;
  const on = mz ?? k.headE;
  if (o.nose) nose(k, on, o.nose.color, mz ? o.nose : { y: o.nose.y ?? -0.07, r: o.nose.r, lift: o.nose.lift });
  const ms = o.mouth ?? { style: "smile" as MouthStyle };
  mouth(k, on, ms.style, { y: ms.y ?? (mz ? -mz.r.y * 0.3 : -0.115), size: ms.size, tongue: ms.tongue, lift: ms.lift });
  return mz;
}

export { EYE, WHITE, MOUTH, BLUSH };
