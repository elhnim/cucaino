// The animals of Cucaino Park: simple shapes, but softly shaded (every rounded part shares its
// normals across its faces, so a flank reads as a flank, not a cut gem), with jointed legs, and
// with the coats that need them — a giraffe's patches, a zebra's stripes — painted per pixel by
// the rig's material (./rig.ts, the `pat` of a part). Every model faces +z, stands on y = 0 at
// its natural size and carries the vertex rig's attributes (./rig.ts): which part each vertex
// belongs to (head, legs, ears, tail, wings) and where that part pivots.
import * as THREE from "three";
import { col, merge, part, weld } from "../fantasy/geo";
import { noise3 } from "../fantasy/noise";
import { groundY } from "../../registry/terrain";
import type { FaunaPlan } from "./plan";
import { paddockPoint } from "./types";

export type V3 = [number, number, number];
export type Paint = THREE.Color | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.Color);

/** rig parts */
export const BODY = 0;
export const HEAD = 1;
export const LEG_FL = 2;
export const LEG_FR = 3;
export const LEG_BL = 4;
export const LEG_BR = 5;
export const TAIL = 6;
export const EAR_L = 7;
export const EAR_R = 8;
export const WING_L = 9;
export const WING_R = 10;
/** a jaw / trunk: a child of the head, curled by the wing channel */
export const JAW = 11;
/** a prop carried with the animal that never moves (and isn't measured): the owls' branch */
export const PROP = 12;

/** a variant bit mask: the part shows on these variants only */
export const only = (...vs: number[]) => vs.reduce((m, v) => m | (1 << v), 0);
/** ...on every variant but these */
export const allBut = (...vs: number[]) => 0x3fff & ~only(...vs);

export interface PO {
  p?: number;
  piv?: V3;
  /** the head pivot (ears) */
  piv2?: V3;
  /** how much the instance colour tints it (fur 1, eyes / noses 0) */
  tint?: number;
  glow?: number;
  /** variant: k > 0 only on variant k, -k on all but k (or an explicit bit mask in `vm`) */
  v?: number;
  vm?: number;
  tuck?: boolean;
  /** faces whose normal.y is below this are belly (untinted) — use with furBelly() */
  belly?: number;
  /** a coat painted per pixel by the material (rig.ts): PAT_GIRAFFE patches; on a zebra (the
   *  horse's variant 2) PAT_STRIPE_Z / _Y / _NECK stripes across the body / down a leg / round the neck */
  pat?: number;
}
export const PAT_GIRAFFE = 1;
export const PAT_STRIPE_Z = 2;
export const PAT_STRIPE_Y = 3;
export const PAT_STRIPE_NECK = 4;

/** soft shading for a rounded part: weld its corners and share one normal between the faces that
 *  meet there (a box — hooves, a mane's tufts — keeps its crisp faces) */
function soften(g: THREE.BufferGeometry): { geo: THREE.BufferGeometry; smooth: boolean } {
  const n = g.index ? g.index.count : g.attributes.position.count;
  if (n <= 36) return { geo: g, smooth: false };
  g.deleteAttribute("normal");
  const w = weld(g.index ? g.toNonIndexed() : g);
  w.computeVertexNormals();
  const out = w.toNonIndexed();
  w.dispose();
  return { geo: out, smooth: true };
}

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

const maskOf = (o: PO) => (o.vm !== undefined ? o.vm : !o.v ? 0 : o.v > 0 ? only(o.v) : allBut(-o.v));

/** a rigged, faceted part */
export function rp(g: THREE.BufferGeometry, paint: Paint, o: PO = {}): THREE.BufferGeometry {
  const soft = soften(g);
  const out = part(soft.geo, paint, [o.tint ?? 0, o.glow ?? 0, maskOf(o)], soft.smooth ? {} : { faceted: true, faceColor: true });
  const n = out.attributes.position.count;
  if (o.belly !== undefined) {
    // what faces down (the belly / chest) keeps its own pale colour: no instance tint
    const nor = out.attributes.normal as THREE.BufferAttribute;
    const fx = out.attributes.aFx as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) fx.setX(i, nor.getY(i) < o.belly ? 0 : o.tint ?? 1);
  }
  out.setAttribute("aPat", new THREE.BufferAttribute(new Float32Array(n).fill(o.pat ?? 0), 1));
  const rig = new Float32Array(n * 4);
  const p2 = new Float32Array(n * 3);
  const pid = (o.p ?? BODY) + (o.tuck ? 16 : 0);
  const piv = o.piv ?? [0, 0, 0];
  const piv2 = o.piv2 ?? piv;
  for (let i = 0; i < n; i++) {
    rig[i * 4] = pid;
    rig[i * 4 + 1] = piv[0];
    rig[i * 4 + 2] = piv[1];
    rig[i * 4 + 3] = piv[2];
    p2[i * 3] = piv2[0];
    p2[i * 3 + 1] = piv2[1];
    p2[i * 3 + 2] = piv2[2];
  }
  out.setAttribute("aRig", new THREE.BufferAttribute(rig, 4));
  out.setAttribute("aPiv2", new THREE.BufferAttribute(p2, 3));
  return out;
}

/** a colour, shaded a little darker underneath (facets read) */
export function sh(hex: string | number, k = 0.26): Paint {
  const c = col(hex);
  return (_p, n) => _c.copy(c).multiplyScalar(1 - k + k * (n.y * 0.5 + 0.5));
}
/** fur with a lighter belly / chest */
export function furBelly(hex: string | number, belly: string | number, below = -0.35): Paint {
  const c = col(hex);
  const b = col(belly);
  return (_p, n) => (n.y < below ? _c.copy(b) : _c.copy(c).multiplyScalar(0.8 + 0.2 * (n.y * 0.5 + 0.5)));
}

export function place(g: THREE.BufferGeometry, x: number, y: number, z: number, rot?: V3, s?: V3) {
  _e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0, "XYZ");
  _m.compose(_v.set(x, y, z), _q.setFromEuler(_e), _s.set(s?.[0] ?? 1, s?.[1] ?? 1, s?.[2] ?? 1));
  g.applyMatrix4(_m);
  return g;
}
/** faceted ellipsoid (detail 0: 20 faces, 1: 80) */
export function ell(x: number, y: number, z: number, rx: number, ry: number, rz: number, detail = 0, rot?: V3): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute("uv");
  g.scale(rx, ry, rz);
  return place(g, x, y, z, rot);
}
/** rounded box: an icosphere pushed toward a box (cows, bears) */
export function rbox(x: number, y: number, z: number, rx: number, ry: number, rz: number, k = 0.55, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute("uv");
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const f = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), k);
    pos.setXYZ(i, x + f(px) * rx, y + f(py) * ry, z + f(pz) * rz);
  }
  return g;
}
export function box(x: number, y: number, z: number, w: number, h: number, d: number, rot?: V3): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.deleteAttribute("uv");
  return place(g, x, y, z, rot);
}
/** a tapered tube from a (radius r0) to b (radius r1); open-ended (its ends hide in bodies, feet and
 *  heads — and the triangle budget is better spent on more animals) unless `caps` */
export function tube(a: V3, b: V3, r0: number, r1: number, sides = 5, caps = false): THREE.BufferGeometry {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length() || 1e-3;
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, !caps);
  g.deleteAttribute("uv");
  g.translate(0, len / 2, 0);
  g.applyQuaternion(_q.setFromUnitVectors(UP, d.normalize()));
  g.translate(a[0], a[1], a[2]);
  return g;
}
/** a cone with its base round a, tip at b */
export function cone(a: V3, b: V3, r: number, sides = 5): THREE.BufferGeometry {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length() || 1e-3;
  const g = new THREE.ConeGeometry(r, len, sides, 1, false);
  g.deleteAttribute("uv");
  g.translate(0, len / 2, 0);
  g.applyQuaternion(_q.setFromUnitVectors(UP, d.normalize()));
  g.translate(a[0], a[1], a[2]);
  return g;
}

export const BLACK = col("#1c1512");
export const WHITE = col("#fbf6ec");
export const GLINT = col("#ffffff");

/** two eyes (black, with a tiny white glint) */
export function eyes(x: number, y: number, z: number, r: number, o: PO, glint = true): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    out.push(rp(ell(s * x, y, z, r, r * 1.1, r * 0.8), BLACK, { ...o, tint: 0 }));
    if (glint) out.push(rp(ell(s * (x + r * 0.15), y + r * 0.4, z + r * 0.62, r * 0.35, r * 0.35, r * 0.25), GLINT, { ...o, tint: 0 }));
  }
  return out;
}

/** four legs: hips at (±x, hipY, zf / zb), feet on the ground; hooves / paws in `foot` */
export function legs(x: number, hipY: number, zf: number, zb: number, r0: number, r1: number, fur: Paint, foot: Paint | null, footH: number, sides = 5, o: PO = {}): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const defs: [number, number, number][] = [
    [LEG_FL, -x, zf],
    [LEG_FR, x, zf],
    [LEG_BL, -x, zb],
    [LEG_BR, x, zb],
  ];
  for (const [p, lx, lz] of defs) {
    const piv: V3 = [lx, hipY, lz];
    const po = { ...o, p, piv, tuck: true, tint: o.tint ?? 1 };
    // a jointed leg: a fuller thigh down to a knobbly knee / hock (a touch forward in front, back
    // behind), then a slim cannon down to the foot
    const kneeY = footH + (hipY - footH) * 0.47;
    const kz = lz + (lz >= zb + 1e-6 ? 0.02 : -0.035) * (hipY / 1.0);
    const rk = (r0 + r1) * 0.5;
    out.push(rp(tube([lx, hipY + r0 * 0.5, lz], [lx, kneeY, kz], r0, rk * 0.92, sides + 1), fur, po));
    out.push(rp(ell(lx, kneeY, kz, rk * 1.12, rk * 1.25, rk * 1.12), fur, po));
    out.push(rp(tube([lx, kneeY, kz], [lx, footH * 0.8, lz + 0.01], rk * 0.86, r1, sides + 1), fur, po));
    if (foot) out.push(rp(box(lx, footH / 2, lz + 0.015, r1 * 2.3, footH, r1 * 2.6), foot, { ...po, tint: 0 }));
  }
  return out;
}

// ── deer ──

export function buildDeer(): THREE.BufferGeometry {
  const coat = "#ffffff"; // (the coat colour comes from the instance tint)
  const fur = furBelly(coat, "#f1dfc2");
  const cream = sh("#f4e6cc");
  const N: V3 = [0, 1.12, 0.48];
  const H = { p: HEAD, piv: N, tint: 1 };
  const parts: THREE.BufferGeometry[] = [
    rp(ell(0, 1.02, 0, 0.3, 0.31, 0.6, 1), fur, { tint: 1, belly: -0.35 }),
    rp(ell(0, 1.06, 0.4, 0.25, 0.28, 0.22), fur, { tint: 1, belly: -0.35 }),
    rp(ell(0, 1.05, -0.56, 0.2, 0.22, 0.1), cream),
    // neck + head
    rp(tube([0, 1.08, 0.46], [0, 1.58, 0.74], 0.14, 0.1, 6), sh(coat), H),
    rp(ell(0, 1.66, 0.8, 0.14, 0.14, 0.2, 1), sh(coat), H),
    rp(ell(0, 1.6, 0.98, 0.085, 0.08, 0.1), sh("#f0dcc0"), { ...H, tint: 0.45 }),
    rp(ell(0, 1.62, 1.07, 0.04, 0.035, 0.03), BLACK, { ...H, tint: 0 }),
    ...eyes(0.11, 1.7, 0.88, 0.032, H),
    // antlers (stags only)
    ...[-1, 1].flatMap((s) => {
      const A = { ...H, tint: 0, v: 1 };
      const c = sh("#f0dfb4");
      return [
        rp(tube([s * 0.06, 1.76, 0.76], [s * 0.2, 2.06, 0.68], 0.035, 0.028, 4), c, A),
        rp(tube([s * 0.2, 2.06, 0.68], [s * 0.3, 2.32, 0.5], 0.028, 0.02, 4), c, A),
        rp(tube([s * 0.18, 2.0, 0.69], [s * 0.14, 2.22, 0.84], 0.022, 0.015, 4), c, A),
        rp(tube([s * 0.27, 2.24, 0.56], [s * 0.38, 2.42, 0.62], 0.02, 0.014, 4), c, A),
        rp(tube([s * 0.1, 1.84, 0.76], [s * 0.12, 1.97, 0.92], 0.02, 0.014, 4), c, A),
      ];
    }),
    // fawn spots
    ...[
      [0.12, 1.28, 0.25],
      [-0.1, 1.3, 0.05],
      [0.14, 1.27, -0.18],
      [-0.15, 1.25, -0.32],
      [0.02, 1.32, -0.08],
      [-0.03, 1.31, 0.3],
      [0.2, 1.15, -0.4],
      [-0.2, 1.16, 0.12],
    ].map(([x, y, z]) => rp(ell(x, y, z, 0.05, 0.03, 0.05), WHITE, { v: 2 })),
    // tail: brown on top, a white flag underneath
    rp(ell(0, 1.12, -0.64, 0.06, 0.11, 0.05, 0, [0.5, 0, 0]), sh(coat), { p: TAIL, piv: [0, 1.2, -0.6], tint: 1 }),
    rp(ell(0, 1.08, -0.67, 0.055, 0.09, 0.04, 0, [0.5, 0, 0]), WHITE, { p: TAIL, piv: [0, 1.2, -0.6] }),
    ...legs(0.15, 0.95, 0.42, -0.4, 0.075, 0.045, sh("#e8e2da"), sh("#3a2a20"), 0.08, 5),
    // haunches
    ...[-1, 1].map((s) => rp(ell(s * 0.15, 0.93, -0.38, 0.1, 0.2, 0.15), sh(coat), { p: s < 0 ? LEG_BL : LEG_BR, piv: [s * 0.15, 0.95, -0.4], tint: 1 })),
  ];
  // big ears (part of the head's motion, flicking on their own)
  for (const s of [-1, 1]) {
    const E = { p: s < 0 ? EAR_L : EAR_R, piv: [s * 0.09, 1.76, 0.77] as V3, piv2: N, tint: 1 };
    parts.push(rp(ell(s * 0.21, 1.8, 0.75, 0.13, 0.055, 0.065, 0, [0, 0, s * 0.35]), sh(coat), E));
    parts.push(rp(ell(s * 0.21, 1.8, 0.785, 0.1, 0.035, 0.03, 0, [0, 0, s * 0.35]), sh("#f2c8b0"), { ...E, tint: 0 }));
  }
  return merge(parts);
}

// ── horses and ponies ──

export function buildHorse(): THREE.BufferGeometry {
  const coat = "#ffffff"; // (all coat colour comes from the instance tint)
  const fur = sh(coat, 0.3);
  const N: V3 = [0, 1.42, 0.68];
  const H = { p: HEAD, piv: N, tint: 1 };
  const dark = sh("#3a2a22");
  const light = sh("#f4eee2");
  const parts: THREE.BufferGeometry[] = [
    // (the zebra's stripes are painted on these by the material: see PO.pat)
    rp(ell(0, 1.2, 0, 0.4, 0.42, 0.82, 1), fur, { tint: 1, pat: PAT_STRIPE_Z }),
    rp(ell(0, 1.26, 0.58, 0.34, 0.39, 0.3), fur, { tint: 1, pat: PAT_STRIPE_Z }),
    rp(ell(0, 1.3, -0.56, 0.38, 0.38, 0.34), fur, { tint: 1, pat: PAT_STRIPE_Z }),
    rp(tube([0, 1.34, 0.66], [0, 1.96, 0.98], 0.24, 0.17, 8), fur, { ...H, pat: PAT_STRIPE_NECK }),
    rp(ell(0, 2.02, 1.1, 0.16, 0.17, 0.28), fur, { ...H, pat: PAT_STRIPE_NECK }),
    rp(ell(0, 1.9, 1.36, 0.13, 0.13, 0.14), sh("#d9d0c4"), { ...H, tint: 0.55 }),
    ...[-1, 1].map((s) => rp(ell(s * 0.06, 1.88, 1.48, 0.025, 0.03, 0.02), BLACK, { ...H, tint: 0 })),
    ...eyes(0.15, 2.07, 1.14, 0.035, H),
    ...legs(0.2, 1.02, 0.56, -0.56, 0.1, 0.075, fur, dark, 0.12, 5, { pat: PAT_STRIPE_Y }),
  ];
  // mane (dark on most coats, light on the palomino / greys), forelock and tail
  for (const [v, paint] of [
    [-1, dark],
    [1, light],
  ] as [number, Paint][]) {
    for (let i = 0; i < 5; i++) {
      const u = i / 4;
      parts.push(rp(box(0, 1.62 + u * 0.52, 0.64 + u * 0.36, 0.09, 0.24, 0.16, [-0.55, 0, 0]), paint, { p: HEAD, piv: N, v }));
    }
    parts.push(rp(box(0, 2.18, 1.02, 0.1, 0.12, 0.14, [0.4, 0, 0]), paint, { p: HEAD, piv: N, v }));
    parts.push(rp(ell(0, 1.06, -0.98, 0.1, 0.42, 0.11, 0, [0.28, 0, 0]), paint, { p: TAIL, piv: [0, 1.46, -0.82], v }));
  }
  for (const s of [-1, 1]) parts.push(rp(cone([s * 0.09, 2.14, 1.0], [s * 0.12, 2.36, 0.96], 0.05, 4), fur, { p: s < 0 ? EAR_L : EAR_R, piv: [s * 0.09, 2.14, 1.0], piv2: N, tint: 1 }));
  return merge(parts);
}

// ── cows ──

export function buildCow(): THREE.BufferGeometry {
  // white with patches (the patches take the instance colour: black or brown)
  const patchy = (seed: number): Paint => (p, n) => (noise3(p.x * 3.1 + seed, p.y * 3.1, p.z * 3.1, 7) > 0.56 ? _c.set("#ffffff").multiplyScalar(0.85 + 0.15 * n.y) : _c.set("#f7f3ea").multiplyScalar(0.84 + 0.16 * (n.y * 0.5 + 0.5)));
  const patchTint = (seed: number) => (p: THREE.Vector3) => (noise3(p.x * 3.1 + seed, p.y * 3.1, p.z * 3.1, 7) > 0.56 ? 1 : 0);
  // (tint per face: body faces over a patch take the instance colour)
  const patched = (g: THREE.BufferGeometry, seed: number, o: PO) => {
    const out = rp(g, patchy(seed), o);
    const pos = out.attributes.position as THREE.BufferAttribute;
    const fx = out.attributes.aFx as THREE.BufferAttribute;
    const c = new THREE.Vector3();
    for (let f = 0; f < pos.count; f += 3) {
      c.set(0, 0, 0);
      for (let k = 0; k < 3; k++) c.add(_v.fromBufferAttribute(pos, f + k));
      c.multiplyScalar(1 / 3);
      const w = patchTint(seed)(c);
      for (let k = 0; k < 3; k++) fx.setX(f + k, w);
    }
    return out;
  };
  const N: V3 = [0, 1.22, 0.72];
  const H = { p: HEAD, piv: N };
  const pink = sh("#f2a8a0");
  const parts: THREE.BufferGeometry[] = [
    patched(rbox(0, 1.08, 0, 0.44, 0.4, 0.8, 0.6), 1.3, {}),
    patched(rbox(0, 1.2, 0.86, 0.2, 0.21, 0.23, 0.6, 0), 4.1, H),
    rp(rbox(0, 1.08, 1.08, 0.17, 0.12, 0.1, 0.6, 0), pink, H),
    ...[-1, 1].map((s) => rp(ell(s * 0.07, 1.1, 1.17, 0.03, 0.025, 0.02), col("#6a3a38"), H)),
    ...eyes(0.15, 1.3, 0.98, 0.035, H),
    ...[-1, 1].map((s) => rp(cone([s * 0.12, 1.4, 0.84], [s * 0.3, 1.52, 0.82], 0.045, 5), sh("#f1e6c8"), H)),
    ...[-1, 1].map((s) => rp(ell(s * 0.27, 1.3, 0.8, 0.11, 0.05, 0.07, 0, [0, 0, s * -0.3]), sh("#f7f3ea"), { p: s < 0 ? EAR_L : EAR_R, piv: [s * 0.18, 1.3, 0.8], piv2: N, tint: 1 })),
    rp(ell(0, 0.66, -0.3, 0.16, 0.11, 0.17), pink),
    // a bell on a red strap
    rp(box(0, 1.0, 0.78, 0.36, 0.06, 0.1), col("#c9423a")),
    rp(tube([0, 0.97, 0.84], [0, 0.84, 0.86], 0.07, 0.09, 6), sh("#e8b53a")),
    ...legs(0.27, 0.82, 0.54, -0.54, 0.11, 0.09, sh("#f7f3ea"), sh("#3a2e28"), 0.1, 5, { tint: 0 }),
    rp(tube([0, 1.38, -0.8], [0, 0.72, -0.9], 0.03, 0.025, 4), sh("#f7f3ea"), { p: TAIL, piv: [0, 1.38, -0.8] }),
    rp(ell(0, 0.68, -0.9, 0.06, 0.1, 0.06), sh("#2c2622"), { p: TAIL, piv: [0, 1.38, -0.8], tint: 1 }),
  ];
  return merge(parts);
}

// ── goats ──

export function buildGoat(): THREE.BufferGeometry {
  const fur = sh("#ffffff", 0.3);
  const N: V3 = [0, 0.86, 0.34];
  const H = { p: HEAD, piv: N, tint: 1 };
  const horn = sh("#8c7a62");
  const parts: THREE.BufferGeometry[] = [
    rp(ell(0, 0.74, 0, 0.23, 0.25, 0.42, 1), fur, { tint: 1 }),
    rp(tube([0, 0.82, 0.32], [0, 1.08, 0.5], 0.12, 0.08, 5), fur, H),
    rp(ell(0, 1.12, 0.56, 0.1, 0.11, 0.17), fur, H),
    rp(ell(0, 1.06, 0.7, 0.07, 0.07, 0.07), sh("#d8cbbb"), { ...H, tint: 0.5 }),
    ...eyes(0.085, 1.16, 0.62, 0.025, H),
    // horns sweeping back (goats only: not on the sheep, variant 2)
    ...[-1, 1].flatMap((s) => [
      rp(tube([s * 0.05, 1.2, 0.54], [s * 0.08, 1.34, 0.46], 0.035, 0.03, 4), horn, { ...H, tint: 0, v: -2 }),
      rp(tube([s * 0.08, 1.34, 0.46], [s * 0.11, 1.38, 0.32], 0.03, 0.022, 4), horn, { ...H, tint: 0, v: -2 }),
      rp(tube([s * 0.11, 1.38, 0.32], [s * 0.12, 1.3, 0.24], 0.022, 0.012, 4), horn, { ...H, tint: 0, v: -2 }),
    ]),
    // a sheep (variant 2) is a goat in a big woolly coat (its face and legs take the coat colour)
    ...sheepWool(N),
    // a beard (the billy)
    rp(cone([0, 1.02, 0.66], [0, 0.86, 0.64], 0.045, 4), sh("#efe6d6"), { ...H, v: 1 }),
    ...[-1, 1].map((s) => rp(ell(s * 0.15, 1.16, 0.52, 0.09, 0.03, 0.045, 0, [0, 0, s * -0.35]), fur, { p: s < 0 ? EAR_L : EAR_R, piv: [s * 0.08, 1.16, 0.52], piv2: N, tint: 1 })),
    ...legs(0.12, 0.62, 0.28, -0.28, 0.05, 0.04, fur, sh("#3a2e28"), 0.07, 4),
    rp(ell(0, 0.96, -0.44, 0.04, 0.08, 0.04, 0, [-0.5, 0, 0]), fur, { p: TAIL, piv: [0, 0.88, -0.4], tint: 1 }),
  ];
  return merge(parts);
}

function sheepWool(N: V3): THREE.BufferGeometry[] {
  const wool: Paint = (_p, n) => _c.set("#f6f1e6").multiplyScalar(0.8 + 0.2 * (n.y * 0.5 + 0.5));
  const W = { vm: only(2) };
  const out = [rp(ell(0, 0.8, -0.03, 0.33, 0.31, 0.5, 1), wool, W)];
  // a cloud of puffs over the back and the rump
  const puffs: [number, number, number, number][] = [
    [0, 1.0, 0.22, 0.17],
    [0.15, 0.95, -0.05, 0.16],
    [-0.15, 0.95, -0.05, 0.16],
    [0, 1.0, -0.28, 0.17],
    [0.17, 0.82, 0.25, 0.14],
    [-0.17, 0.82, 0.25, 0.14],
    [0, 0.86, -0.46, 0.16],
  ];
  for (const [x, y, z, r] of puffs) out.push(rp(ell(x, y, z, r, r * 0.85, r), wool, W));
  // a woolly topknot
  out.push(rp(ell(0, 1.24, 0.5, 0.085, 0.06, 0.085), wool, { ...W, p: HEAD, piv: N }));
  return out;
}

// ── foxes ──

export function buildFox(): THREE.BufferGeometry {
  const orange = "#ffffff"; // (the orange comes from the instance tint)
  const white = sh("#f7f0e4");
  const black = sh("#2a1f1a");
  const N: V3 = [0, 0.5, 0.3];
  const H = { p: HEAD, piv: N, tint: 1 };
  const parts: THREE.BufferGeometry[] = [
    rp(ell(0, 0.43, 0, 0.15, 0.16, 0.36, 1), furBelly(orange, "#f7f0e4", -0.25), { tint: 1, belly: -0.25 }),
    rp(ell(0, 0.46, 0.27, 0.12, 0.13, 0.1), white),
    rp(ell(0, 0.57, 0.42, 0.13, 0.11, 0.12), sh(orange), H),
    ...[-1, 1].map((s) => rp(ell(s * 0.075, 0.52, 0.47, 0.07, 0.055, 0.065), white, H)),
    rp(cone([0, 0.54, 0.48], [0, 0.51, 0.68], 0.065, 5), sh(orange), H),
    rp(ell(0, 0.51, 0.68, 0.025, 0.022, 0.02), BLACK, { ...H, tint: 0 }),
    ...eyes(0.07, 0.6, 0.51, 0.022, H),
    ...legs(0.08, 0.4, 0.24, -0.24, 0.035, 0.028, black, null, 0.03, 4, { tint: 0 }),
    // the big bushy tail with its white tip
    rp(ell(0, 0.42, -0.62, 0.1, 0.1, 0.27, 0, [-0.35, 0, 0]), sh(orange), { p: TAIL, piv: [0, 0.47, -0.34], tint: 1 }),
    rp(ell(0, 0.33, -0.86, 0.07, 0.07, 0.08), white, { p: TAIL, piv: [0, 0.47, -0.34] }),
  ];
  for (const s of [-1, 1]) {
    const E = { p: s < 0 ? EAR_L : EAR_R, piv: [s * 0.07, 0.64, 0.4] as V3, piv2: N, tint: 1 };
    parts.push(rp(cone([s * 0.07, 0.64, 0.4], [s * 0.1, 0.82, 0.37], 0.055, 4), sh(orange), E));
    parts.push(rp(cone([s * 0.095, 0.77, 0.37], [s * 0.1, 0.82, 0.37], 0.022, 4), black, { ...E, tint: 0 }));
  }
  return merge(parts);
}

// ── bears ──

export function buildBear(): THREE.BufferGeometry {
  const fur = sh("#ffffff", 0.3);
  const tan = sh("#d0a674");
  const N: V3 = [0, 1.0, 0.58];
  const H = { p: HEAD, piv: N, tint: 1 };
  const parts: THREE.BufferGeometry[] = [
    rp(rbox(0, 0.86, 0, 0.44, 0.44, 0.72, 0.75), fur, { tint: 1 }),
    rp(ell(0, 1.1, 0.34, 0.36, 0.3, 0.3), fur, { tint: 1 }),
    rp(ell(0, 1.08, 0.84, 0.28, 0.25, 0.26, 1), fur, H),
    rp(ell(0, 1.0, 1.07, 0.13, 0.11, 0.12), tan, H),
    rp(ell(0, 1.04, 1.18, 0.05, 0.04, 0.035), BLACK, H),
    ...eyes(0.12, 1.15, 1.02, 0.035, H),
    ...legs(0.26, 0.72, 0.44, -0.44, 0.15, 0.13, fur, sh("#4a3326"), 0.1, 6),
    rp(ell(0, 0.98, -0.72, 0.08, 0.08, 0.06), fur, { p: TAIL, piv: [0, 0.98, -0.7], tint: 1 }),
  ];
  for (const s of [-1, 1]) {
    const E = { p: s < 0 ? EAR_L : EAR_R, piv: [s * 0.18, 1.26, 0.8] as V3, piv2: N, tint: 1 };
    parts.push(rp(ell(s * 0.2, 1.3, 0.8, 0.085, 0.085, 0.05), fur, E));
    parts.push(rp(ell(s * 0.2, 1.3, 0.83, 0.05, 0.05, 0.03), tan, { ...E, tint: 0 }));
  }
  return merge(parts);
}

// ── rabbits ──

export function buildRabbit(): THREE.BufferGeometry {
  const fur = sh("#ffffff", 0.3);
  const N: V3 = [0, 0.4, 0.16];
  const H = { p: HEAD, piv: N, tint: 1 };
  const parts: THREE.BufferGeometry[] = [
    rp(ell(0, 0.28, -0.03, 0.19, 0.2, 0.26, 1), furBelly("#ffffff", "#f7f1e6", -0.4), { tint: 1, belly: -0.4 }),
    rp(ell(0, 0.47, 0.25, 0.125, 0.115, 0.135), fur, H),
    ...[-1, 1].map((s) => rp(ell(s * 0.06, 0.43, 0.33, 0.06, 0.05, 0.05), sh("#f5efe4"), H)),
    rp(ell(0, 0.46, 0.385, 0.025, 0.02, 0.018), col("#f08a9a"), H),
    ...eyes(0.085, 0.5, 0.31, 0.024, H),
    rp(ell(0, 0.33, -0.3, 0.075, 0.075, 0.07), WHITE, { p: TAIL, piv: [0, 0.3, -0.26] }),
  ];
  // long ears (flick on their own)
  for (const s of [-1, 1]) {
    const E = { p: s < 0 ? EAR_L : EAR_R, piv: [s * 0.045, 0.56, 0.2] as V3, piv2: N, tint: 1 };
    parts.push(rp(ell(s * 0.06, 0.74, 0.17, 0.045, 0.19, 0.032, 0, [-0.15, 0, s * -0.14]), fur, E));
    parts.push(rp(ell(s * 0.06, 0.74, 0.192, 0.028, 0.15, 0.015, 0, [-0.15, 0, s * -0.14]), col("#f2b6be"), { ...E, tint: 0 }));
  }
  // big hind feet + haunches, little front paws
  for (const s of [-1, 1]) {
    const B = { p: s < 0 ? LEG_BL : LEG_BR, piv: [s * 0.12, 0.26, -0.1] as V3, tint: 1, tuck: true };
    parts.push(rp(ell(s * 0.12, 0.22, -0.1, 0.1, 0.13, 0.15), fur, B));
    parts.push(rp(box(s * 0.12, 0.035, 0.0, 0.07, 0.05, 0.22), fur, B));
    const F = { p: s < 0 ? LEG_FL : LEG_FR, piv: [s * 0.07, 0.2, 0.14] as V3, tint: 1, tuck: true };
    parts.push(rp(tube([s * 0.07, 0.2, 0.14], [s * 0.07, 0.02, 0.18], 0.035, 0.03, 4), fur, F));
  }
  return merge(parts);
}

// ── squirrels ──

export function buildSquirrel(): THREE.BufferGeometry {
  const fur = sh("#ffffff", 0.3);
  const N: V3 = [0, 0.22, 0.1];
  const H = { p: HEAD, piv: N, tint: 1 };
  const parts: THREE.BufferGeometry[] = [
    rp(ell(0, 0.18, 0, 0.08, 0.095, 0.14, 1), furBelly("#ffffff", "#f3e6cc", -0.3), { tint: 1, belly: -0.3 }),
    rp(ell(0, 0.27, 0.17, 0.075, 0.07, 0.08), fur, H),
    rp(ell(0, 0.255, 0.245, 0.014, 0.012, 0.01), BLACK, { ...H, tint: 0 }),
    ...eyes(0.05, 0.29, 0.21, 0.016, H, false),
    ...[-1, 1].map((s) => rp(cone([s * 0.04, 0.32, 0.15], [s * 0.055, 0.41, 0.14], 0.025, 4), fur, { p: s < 0 ? EAR_L : EAR_R, piv: [s * 0.04, 0.32, 0.15], piv2: N, tint: 1 })),
    // the big bushy tail curling up over its back
    rp(ell(0, 0.26, -0.2, 0.07, 0.13, 0.07, 0, [0.5, 0, 0]), fur, { p: TAIL, piv: [0, 0.2, -0.12], tint: 1 }),
    rp(ell(0, 0.42, -0.24, 0.085, 0.11, 0.075), fur, { p: TAIL, piv: [0, 0.2, -0.12], tint: 1 }),
    rp(ell(0, 0.53, -0.16, 0.07, 0.07, 0.065, 0, [-0.6, 0, 0]), fur, { p: TAIL, piv: [0, 0.2, -0.12], tint: 1 }),
    ...legs(0.05, 0.13, 0.09, -0.07, 0.022, 0.018, fur, null, 0.02, 4),
  ];
  return merge(parts);
}

// ── ducks (variants 0 hen, 1 drake, 2 duckling) and chickens (3 hen / chick, 4 rooster) ──

export function buildDuck(): THREE.BufferGeometry {
  const fur = sh("#ffffff", 0.3);
  const orange = sh("#f39a2a");
  const N: V3 = [0, 0.28, 0.17];
  const D = only(0, 1, 2);
  const H = { p: HEAD, piv: N, vm: D };
  const parts: THREE.BufferGeometry[] = [
    rp(ell(0, 0.2, 0, 0.16, 0.13, 0.25, 1), fur, { tint: 1, vm: D }),
    rp(ell(0, 0.23, 0.15, 0.13, 0.13, 0.12), fur, { tint: 1, vm: D }),
    rp(ell(0, 0.27, -0.25, 0.07, 0.05, 0.1, 0, [-0.5, 0, 0]), fur, { p: TAIL, piv: [0, 0.24, -0.2], tint: 1, vm: D }),
    // neck + head: the drake's glossy green head and white collar, everyone else's takes the tint
    rp(tube([0, 0.26, 0.17], [0, 0.4, 0.23], 0.065, 0.055, 5), fur, { ...H, tint: 1, vm: only(0, 2) }),
    rp(ell(0, 0.45, 0.26, 0.09, 0.085, 0.1), fur, { ...H, tint: 1, vm: only(0, 2) }),
    rp(tube([0, 0.26, 0.17], [0, 0.4, 0.23], 0.065, 0.055, 5), sh("#2f8a4a"), { ...H, vm: only(1) }),
    rp(ell(0, 0.45, 0.26, 0.09, 0.085, 0.1), sh("#2f8a4a"), { ...H, vm: only(1) }),
    rp(tube([0, 0.3, 0.19], [0, 0.32, 0.2], 0.07, 0.068, 6), WHITE, { ...H, vm: only(1) }),
    rp(box(0, 0.43, 0.37, 0.09, 0.035, 0.12), orange, H),
    ...eyes(0.07, 0.48, 0.3, 0.018, H, false),
  ];
  for (const s of [-1, 1]) {
    const W = { p: s < 0 ? WING_L : WING_R, piv: [s * 0.13, 0.27, 0.06] as V3, tint: 1, vm: D };
    parts.push(rp(ell(s * 0.145, 0.23, -0.04, 0.05, 0.085, 0.18), sh("#e2ddd4"), W));
    parts.push(rp(box(s * 0.19, 0.22, -0.08, 0.02, 0.04, 0.09), col("#3a5fd0"), { ...W, tint: 0, vm: only(1) }));
    const L = { p: s < 0 ? LEG_BL : LEG_BR, piv: [s * 0.06, 0.12, 0.02] as V3, tuck: true, vm: D };
    parts.push(rp(tube([s * 0.06, 0.12, 0.02], [s * 0.06, 0.015, 0.04], 0.018, 0.015, 4), orange, L));
    parts.push(rp(box(s * 0.06, 0.012, 0.08, 0.07, 0.02, 0.09), orange, L));
  }
  parts.push(...chickenParts());
  return merge(parts);
}

function chickenParts(): THREE.BufferGeometry[] {
  const C = only(3, 4);
  const fur = sh("#ffffff", 0.3);
  const red = sh("#e2382e", 0.2);
  const yellow = sh("#f2b632");
  const N: V3 = [0, 0.4, 0.12];
  const H = { p: HEAD, piv: N, vm: C };
  const out: THREE.BufferGeometry[] = [
    rp(ell(0, 0.3, -0.02, 0.15, 0.15, 0.2, 1), fur, { tint: 1, vm: C }),
    rp(ell(0, 0.34, 0.1, 0.12, 0.13, 0.11), fur, { tint: 1, vm: C }),
    // the hen's perky tail; the rooster's big dark-green sickle feathers
    rp(ell(0, 0.45, -0.2, 0.05, 0.12, 0.08, 0, [-0.45, 0, 0]), fur, { p: TAIL, piv: [0, 0.36, -0.16], tint: 1, vm: only(3) }),
    ...[-0.06, 0, 0.06].map((x, i) => rp(ell(x, 0.5 + i * 0.02, -0.27, 0.035, 0.17, 0.09, 0, [-0.7 - i * 0.12, 0, x * 2]), sh("#1f4a3a", 0.2), { p: TAIL, piv: [0, 0.36, -0.16], vm: only(4) })),
    // neck and head
    rp(tube([0, 0.38, 0.12], [0, 0.5, 0.17], 0.07, 0.06, 5), fur, { ...H, tint: 1 }),
    rp(ell(0, 0.54, 0.19, 0.07, 0.075, 0.075), fur, { ...H, tint: 1 }),
    rp(cone([0, 0.535, 0.25], [0, 0.515, 0.32], 0.028, 4), yellow, H),
    rp(ell(0, 0.48, 0.25, 0.022, 0.035, 0.018), red, H),
    // comb: a little one on the hen, a big floppy one on the rooster
    ...[0.15, 0.2, 0.25].map((z, i) => rp(ell(0, 0.615 - i * 0.008, z, 0.018, 0.032, 0.026), red, { ...H, vm: only(3) })),
    ...[0.13, 0.19, 0.25].map((z, i) => rp(ell(0, 0.64 - i * 0.01, z, 0.022, 0.055, 0.035), red, { ...H, vm: only(4) })),
    ...eyes(0.055, 0.56, 0.23, 0.014, H, false),
  ];
  for (const s of [-1, 1]) {
    out.push(rp(ell(s * 0.15, 0.31, -0.02, 0.04, 0.1, 0.15), fur, { p: s < 0 ? WING_L : WING_R, piv: [s * 0.13, 0.38, 0.04], tint: 1, vm: C }));
    const L = { p: s < 0 ? LEG_BL : LEG_BR, piv: [s * 0.055, 0.2, 0.0] as V3, tuck: true, vm: C };
    out.push(rp(tube([s * 0.055, 0.2, 0.0], [s * 0.055, 0.02, 0.02], 0.02, 0.016, 4), yellow, L));
    out.push(rp(box(s * 0.055, 0.012, 0.05, 0.06, 0.018, 0.08), yellow, L));
  }
  return out;
}

// ── owls (variant 0) and kookaburras (variant 1), each on its own bit of branch ──

export function buildOwl(): THREE.BufferGeometry {
  const fur = sh("#ffffff", 0.3);
  // a pale, almost-white face disc — the one part of a real owl that reads brightest at dusk — and
  // it glows a little too (glow: a soft moonlit face even with no direct light reaching it)
  const face = sh("#f7eed8");
  const N: V3 = [0, 0.5, 0];
  const O = allBut(1);
  const H = { p: HEAD, piv: N, vm: O };
  const speckle: Paint = (p, n) => (noise3(p.x * 30, p.y * 30, p.z * 30, 3) > 0.62 ? _c.set("#b89a6a") : _c.set("#e8d6b0")).multiplyScalar(0.85 + 0.15 * (n.y * 0.5 + 0.5));
  const parts: THREE.BufferGeometry[] = [
    // the branch it sits on (runs back into the tree)
    rp(tube([0, 0.02, 0.3], [0.05, -0.02, -0.7], 0.06, 0.08, 5), sh("#6a4a30"), { p: PROP }),
    ...[-1, 1].map((s) => rp(box(s * 0.06, 0.07, 0.08, 0.06, 0.04, 0.08), col("#d8a13a"), { vm: O })),
    rp(ell(0, 0.3, 0, 0.18, 0.25, 0.17, 1), fur, { tint: 1, vm: O }),
    rp(ell(0, 0.28, 0.09, 0.12, 0.17, 0.09), speckle, { vm: O }),
    rp(ell(0, 0.62, 0, 0.19, 0.16, 0.17, 1), fur, { ...H, tint: 1 }),
    rp(ell(0, 0.615, 0.105, 0.185, 0.155, 0.075), face, { ...H, glow: 0.35 }),
    // big, round, glowing eyes (bigger and closer-set than a real tawny owl's — a kid needs to
    // spot them from the trail at night): they glow at night (uEye), and a pale halo a little
    // wider than the eye itself helps them read as two bright dots even at low res / in bloom
    ...[-1, 1].flatMap((s) => [
      // a soft, wider glow halo sitting back into the face disc, so the eye reads as a bright
      // glowing patch even before the pupil and glint register at a distance
      rp(ell(s * 0.078, 0.635, 0.145, 0.11, 0.11, 0.02), col("#fff2c0"), { ...H, glow: 0.6 }),
      rp(ell(s * 0.078, 0.635, 0.17, 0.095, 0.095, 0.045), col("#ffd84a"), { ...H, glow: 1 }),
      rp(ell(s * 0.078, 0.635, 0.205, 0.042, 0.044, 0.02), BLACK, H),
      rp(ell(s * 0.068, 0.655, 0.218, 0.013, 0.013, 0.007), GLINT, H),
    ]),
    rp(cone([0, 0.58, 0.17], [0, 0.53, 0.2], 0.022, 4), col("#d8a13a"), H),
    // ear tufts
    ...[-1, 1].map((s) => rp(cone([s * 0.1, 0.72, 0.02], [s * 0.16, 0.85, 0.0], 0.04, 4), fur, { ...H, tint: 1 })),
    rp(ell(0, 0.1, -0.16, 0.08, 0.1, 0.04, 0, [0.4, 0, 0]), fur, { p: TAIL, piv: [0, 0.14, -0.12], tint: 1, vm: O }),
  ];
  for (const s of [-1, 1]) parts.push(rp(ell(s * 0.17, 0.3, -0.02, 0.055, 0.2, 0.13), sh("#cfc6b8"), { p: s < 0 ? WING_L : WING_R, piv: [s * 0.15, 0.44, 0], tint: 1, vm: O }));
  parts.push(...kookaburraParts());
  return merge(parts);
}

/** the laughing kookaburra: cream head and chest, a dark eye stripe, brown wings with a blue
 *  flash, a big beak (its lower half laughs: the jaw part) and a long barred tail */
function kookaburraParts(): THREE.BufferGeometry[] {
  const K = only(1);
  const cream = sh("#f1e8d4", 0.2);
  const brown = sh("#6b4a30", 0.25);
  const N: V3 = [0, 0.33, 0.02];
  const H = { p: HEAD, piv: N, vm: K };
  const out: THREE.BufferGeometry[] = [
    ...[-1, 1].map((s) => rp(box(s * 0.045, 0.06, 0.06, 0.04, 0.03, 0.06), sh("#6a6460"), { vm: K })),
    rp(ell(0, 0.22, 0, 0.11, 0.14, 0.13, 1), cream, { vm: K }),
    rp(ell(0, 0.26, -0.06, 0.1, 0.11, 0.1), brown, { vm: K, tint: 0.6 }),
    rp(ell(0, 0.42, 0.03, 0.11, 0.1, 0.115, 1), cream, H),
    rp(ell(0, 0.49, -0.01, 0.085, 0.04, 0.09), brown, { ...H, tint: 0.6 }),
    ...[-1, 1].map((s) => rp(ell(s * 0.085, 0.43, 0.04, 0.03, 0.022, 0.06), sh("#4a3020"), H)),
    ...eyes(0.088, 0.445, 0.07, 0.016, H, true),
    rp(cone([0, 0.425, 0.11], [0, 0.395, 0.27], 0.036, 4), sh("#3a3330"), H),
    rp(cone([0, 0.405, 0.11], [0, 0.39, 0.25], 0.026, 4), sh("#e9dcc0"), { p: JAW, piv: [0, 0.41, 0.11], piv2: N, vm: K }),
    rp(ell(0, 0.13, -0.22, 0.045, 0.025, 0.14, 0, [0.55, 0, 0]), (p, n) => (Math.floor(p.z * 30) % 2 ? _c.set("#b8693a") : _c.set("#7a4a2a")).multiplyScalar(0.85 + 0.15 * n.y), { p: TAIL, piv: [0, 0.18, -0.1], vm: K }),
  ];
  for (const s of [-1, 1]) {
    const W = { p: s < 0 ? WING_L : WING_R, piv: [s * 0.1, 0.32, 0] as V3, vm: K };
    out.push(rp(ell(s * 0.105, 0.24, -0.05, 0.04, 0.1, 0.16), brown, { ...W, tint: 0.6 }));
    out.push(rp(ell(s * 0.13, 0.28, 0.03, 0.02, 0.035, 0.05), col("#58a8e0"), W));
  }
  return out;
}

// ── critters: frogs (variant 1), turtles (2) and hedgehogs (3) in one mesh ──

function frogParts(): THREE.BufferGeometry[] {
  const v = 1;
  const green = sh("#ffffff", 0.3);
  const belly = sh("#f2e6a0");
  const parts: THREE.BufferGeometry[] = [
    rp(ell(0, 0.1, 0, 0.12, 0.075, 0.13, 1), (_p, n) => (n.y < -0.3 ? _c.set("#f2e6a0") : _c.set("#ffffff").multiplyScalar(0.8 + 0.2 * n.y)), { tint: 1, v }),
    rp(ell(0, 0.12, 0.08, 0.1, 0.06, 0.08), green, { tint: 1, v }),
    rp(box(0, 0.095, 0.155, 0.12, 0.008, 0.02), col("#2a3a1a"), { v }),
  ];
  for (const s of [-1, 1]) {
    parts.push(rp(ell(s * 0.065, 0.165, 0.09, 0.042, 0.042, 0.042), green, { tint: 1, v }));
    parts.push(rp(ell(s * 0.07, 0.172, 0.115, 0.028, 0.028, 0.022), WHITE, { v }));
    parts.push(rp(ell(s * 0.072, 0.174, 0.131, 0.016, 0.018, 0.01), BLACK, { v }));
    const B = { p: s < 0 ? LEG_BL : LEG_BR, piv: [s * 0.09, 0.08, -0.06] as V3, tint: 1, v };
    parts.push(rp(ell(s * 0.13, 0.06, -0.04, 0.05, 0.04, 0.09), green, B));
    parts.push(rp(box(s * 0.15, 0.012, 0.03, 0.06, 0.02, 0.08), belly, { ...B, tint: 0 }));
    const F = { p: s < 0 ? LEG_FL : LEG_FR, piv: [s * 0.07, 0.07, 0.08] as V3, tint: 1, v };
    parts.push(rp(tube([s * 0.07, 0.07, 0.08], [s * 0.09, 0.01, 0.12], 0.02, 0.016, 4), green, F));
  }
  return parts;
}

function turtleParts(): THREE.BufferGeometry[] {
  const v = 2;
  const skin = sh("#9bb069");
  const N: V3 = [0, 0.11, 0.26];
  const shell = new THREE.CylinderGeometry(0.2, 0.3, 0.1, 7, 1, false);
  shell.translate(0, 0.13, 0);
  const dome = new THREE.ConeGeometry(0.2, 0.1, 7, 1, true);
  dome.translate(0, 0.23, 0);
  for (const g of [shell, dome]) g.scale(1, 1, 1.3);
  const plates: Paint = (p, n) => {
    const a = Math.floor(((Math.atan2(p.x, p.z) / (Math.PI * 2) + 1) % 1) * 7);
    return (a % 2 ? _c.set("#ffffff") : _c.set("#dfe8c8")).multiplyScalar(0.72 + 0.28 * (n.y * 0.5 + 0.5));
  };
  const parts: THREE.BufferGeometry[] = [
    rp(shell, plates, { tint: 1, v }),
    rp(dome, plates, { tint: 1, v }),
    rp(place(tube([0, 0.07, 0], [0, 0.09, 0], 0.29, 0.29, 7), 0, 0, 0, undefined, [1, 1, 1.28]), sh("#c8b27a"), { v }),
    rp(tube([0, 0.1, 0.22], [0, 0.13, 0.4], 0.05, 0.045, 5), skin, { p: HEAD, piv: N, v, tuck: true }),
    rp(ell(0, 0.14, 0.44, 0.07, 0.06, 0.08), skin, { p: HEAD, piv: N, v, tuck: true }),
    ...eyes(0.05, 0.16, 0.48, 0.014, { p: HEAD, piv: N, v, tuck: true }, false),
    rp(cone([0, 0.1, -0.34], [0, 0.08, -0.46], 0.035, 4), skin, { p: TAIL, piv: [0, 0.1, -0.34], v, tuck: true }),
  ];
  const legDef: [number, number, number][] = [
    [LEG_FL, -1, 1],
    [LEG_FR, 1, 1],
    [LEG_BL, -1, -1],
    [LEG_BR, 1, -1],
  ];
  for (const [p, sx, sz] of legDef) parts.push(rp(ell(sx * 0.25, 0.06, sz * 0.22, 0.09, 0.04, 0.06, 0, [0, sx * sz * 0.5, 0]), skin, { p, piv: [sx * 0.18, 0.08, sz * 0.18], v, tuck: true }));
  return parts;
}

function hedgehogParts(): THREE.BufferGeometry[] {
  const v = 3;
  const cream = sh("#e9d2a8");
  const N: V3 = [0, 0.1, 0.16];
  // a spiky dome: every facet of an icosphere pulled up into a spike, dark spines with pale tips
  const base = new THREE.IcosahedronGeometry(1, 1);
  const pos = base.attributes.position as THREE.BufferAttribute;
  const spikes: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const m = new THREE.Vector3();
  const nn = new THREE.Vector3();
  const R: V3 = [0.2, 0.15, 0.25];
  for (let f = 0; f < pos.count; f += 3) {
    a.fromBufferAttribute(pos, f);
    b.fromBufferAttribute(pos, f + 1);
    c.fromBufferAttribute(pos, f + 2);
    m.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    if (m.y < -0.25) continue; // (no spines on the tummy)
    nn.copy(m).normalize();
    const S = (p: THREE.Vector3): V3 => [p.x * R[0], Math.max(p.y, -0.25) * R[1] + 0.14, p.z * R[2] - 0.03];
    const tip: V3 = [nn.x * (R[0] + 0.1), nn.y * (R[1] + 0.09) + 0.14, nn.z * (R[2] + 0.1) - 0.03 - 0.04];
    const [pa, pb, pc] = [S(a), S(b), S(c)];
    spikes.push(...pa, ...pb, ...tip, ...pb, ...pc, ...tip, ...pc, ...pa, ...tip);
  }
  base.dispose();
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(spikes, 3));
  const spine: Paint = (p, n) => (p.y > 0.29 || Math.abs(p.x) > 0.27 ? _c.set("#f0dcb4") : _c.set("#9a7650")).multiplyScalar(0.82 + 0.18 * (n.y * 0.5 + 0.5));
  // (the echidna, variant 4, shares the spiky back, the body and the legs)
  const both = only(v, 4);
  const parts: THREE.BufferGeometry[] = [
    rp(sg, spine, { vm: both, tint: 0.4 }),
    rp(ell(0, 0.1, -0.02, 0.18, 0.09, 0.22), cream, { vm: both, tint: 0.35 }),
    rp(cone([0, 0.1, 0.14], [0, 0.07, 0.34], 0.075, 5), cream, { p: HEAD, piv: N, v, tuck: true }),
    rp(ell(0, 0.07, 0.34, 0.022, 0.02, 0.018), BLACK, { p: HEAD, piv: N, v, tuck: true }),
    ...eyes(0.045, 0.13, 0.22, 0.014, { p: HEAD, piv: N, v, tuck: true }, false),
    ...[-1, 1].map((s) => rp(ell(s * 0.07, 0.17, 0.15, 0.025, 0.025, 0.012), sh("#b89878"), { p: HEAD, piv: N, v, tuck: true })),
    ...legs(0.1, 0.07, 0.1, -0.1, 0.025, 0.02, sh("#6a5040"), null, 0.02, 4, { vm: both, tint: 0 }),
    // the echidna's long thin snout, little eyes
    rp(ell(0, 0.1, 0.17, 0.08, 0.07, 0.07), sh("#4a3a30"), { p: HEAD, piv: N, v: 4, tuck: true }),
    rp(tube([0, 0.09, 0.2], [0, 0.04, 0.4], 0.032, 0.012, 5), sh("#3a302a"), { p: HEAD, piv: N, v: 4, tuck: true }),
    ...eyes(0.05, 0.12, 0.215, 0.012, { p: HEAD, piv: N, v: 4, tuck: true }, false),
  ];
  return parts;
}

/** the platypus (variant 5): a furry flat body, a duck's bill, a beaver's tail, webbed feet */
function platypusParts(): THREE.BufferGeometry[] {
  const v = 5;
  const fur = sh("#ffffff", 0.3);
  const bill = sh("#3c3a3a", 0.2);
  const N: V3 = [0, 0.07, 0.13];
  const H = { p: HEAD, piv: N, v };
  const out: THREE.BufferGeometry[] = [
    rp(ell(0, 0.07, 0, 0.11, 0.06, 0.17, 1), fur, { tint: 1, v }),
    rp(ell(0, 0.075, 0.16, 0.07, 0.052, 0.07), fur, { ...H, tint: 1 }),
    rp(ell(0, 0.068, 0.27, 0.07, 0.022, 0.085), bill, H),
    ...eyes(0.045, 0.095, 0.2, 0.011, H, false),
    rp(ell(0, 0.055, -0.24, 0.09, 0.025, 0.11), fur, { p: TAIL, piv: [0, 0.06, -0.15], tint: 0.8, v }),
  ];
  const defs: [number, number, number][] = [
    [LEG_FL, -1, 0.1],
    [LEG_FR, 1, 0.1],
    [LEG_BL, -1, -0.1],
    [LEG_BR, 1, -0.1],
  ];
  for (const [p, sx, z] of defs) out.push(rp(box(sx * 0.12, 0.02, z + 0.03, 0.07, 0.02, 0.07, [0, sx * 0.4, 0]), bill, { p, piv: [sx * 0.09, 0.05, z], v, tuck: true }));
  return out;
}

/** frogs (variant 1), turtles (2) and the platypus (5) */
export function buildCritters(): THREE.BufferGeometry {
  return merge([...frogParts(), ...turtleParts(), ...platypusParts()]);
}

/** the spiky ones: hedgehogs (variant 3) and echidnas (4) */
export function buildSpiky(): THREE.BufferGeometry {
  return merge(hedgehogParts());
}

// ── props: the paddock fence, trough and hay, the fox den, rabbit burrows, the bears' rocks ──

export function buildProps(plan: FaunaPlan): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const wood = sh("#a9744a");
  const dark = col("#2a1d14");
  const p = plan.paddock;
  if (p) {
    const q = { x: 0, z: 0 };
    const q2 = { x: 0, z: 0 };
    const corners: [number, number][] = [
      [-p.hw, -p.hd],
      [p.hw, -p.hd],
      [p.hw, p.hd],
      [-p.hw, p.hd],
    ];
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k];
      const [bx, bz] = corners[(k + 1) % 4];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(2, Math.round(len / 2.4));
      for (let i = 0; i < n; i++) {
        const u0 = i / n;
        const u1 = (i + 1) / n;
        const lx0 = ax + (bx - ax) * u0;
        const lz0 = az + (bz - az) * u0;
        const lx1 = ax + (bx - ax) * u1;
        const lz1 = az + (bz - az) * u1;
        paddockPoint(p, lx0, lz0, q);
        paddockPoint(p, lx1, lz1, q2);
        const y0 = groundY(q.x, q.z);
        const y1 = groundY(q2.x, q2.z);
        parts.push(rp(box(q.x, y0 + 0.5, q.z, 0.17, 1.15, 0.17, [0, p.rot, 0]), wood));
        // (a gap for the gate on the side facing the Pet Meadow)
        const mx = (lx0 + lx1) / 2;
        const mz = (lz0 + lz1) / 2;
        const gate = Math.hypot(mx - p.gx, mz - p.gz) < 1.3;
        if (gate) continue;
        for (const h of [0.45, 0.88]) parts.push(rp(tube([q.x, y0 + h, q.z], [q2.x, y1 + h, q2.z], 0.055, 0.055, 4), wood));
      }
    }
    // a water trough and a hay bale in the corners
    paddockPoint(p, p.hw - 1.3, -(p.hd - 1.0), q);
    const ty = groundY(q.x, q.z);
    parts.push(rp(box(q.x, ty + 0.25, q.z, 1.5, 0.5, 0.6, [0, p.rot, 0]), wood));
    parts.push(rp(box(q.x, ty + 0.46, q.z, 1.3, 0.06, 0.45, [0, p.rot, 0]), col("#5aa6dc")));
    paddockPoint(p, -(p.hw - 1.3), p.hd - 1.2, q);
    const hy = groundY(q.x, q.z);
    const hay = new THREE.CylinderGeometry(0.45, 0.45, 0.95, 7);
    hay.deleteAttribute("uv");
    place(hay, q.x, hy + 0.4, q.z, [0, p.rot, Math.PI / 2]);
    parts.push(rp(hay, sh("#e2bb52")));
  }
  const d = plan.den;
  if (d) {
    const y = groundY(d.x, d.z);
    const mound = ell(0, 0, 0, 1.3, 0.75, 1.15, 1);
    const hole = ell(0, 0.28, 0.98, 0.42, 0.34, 0.22);
    for (const g of [mound, hole]) place(g, d.x, y - 0.12, d.z, [0, d.yaw, 0]);
    parts.push(rp(mound, (_p, n) => (n.y > 0.72 ? _c.set("#7fb04e") : _c.set("#8b6a45").multiplyScalar(0.8 + 0.2 * n.y))));
    parts.push(rp(hole, dark));
  }
  for (const b of plan.burrows) {
    const y = groundY(b.x, b.z);
    parts.push(rp(ell(b.x, y - 0.02, b.z, 0.5, 0.13, 0.46), sh("#9a7650")));
    parts.push(rp(ell(b.x, y + 0.06, b.z, 0.22, 0.07, 0.2), dark));
  }
  for (const h of plan.holes) {
    // a wombat burrow: a low earthy mound with a big round entrance
    const y = groundY(h.x, h.z);
    const mound = ell(0, 0, 0, 1.0, 0.45, 0.9, 0);
    const hole = ell(0, 0.18, 0.72, 0.42, 0.3, 0.2);
    for (const g of [mound, hole]) place(g, h.x, y - 0.08, h.z, [0, h.yaw, 0]);
    parts.push(rp(mound, (_p, n) => (n.y > 0.75 ? _c.set("#8aae58") : _c.set("#94704a").multiplyScalar(0.8 + 0.2 * n.y))));
    parts.push(rp(hole, dark));
  }
  const fm = plan.farm;
  if (fm) {
    // the farm corner: a red chicken coop on legs with a ramp, hay bales and a feed trough
    const y = groundY(fm.x, fm.z);
    const yaw = fm.yaw;
    const at = (lx: number, lz: number) => ({ x: fm.x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z: fm.z - Math.sin(yaw) * lx + Math.cos(yaw) * lz });
    const red = sh("#c9483a", 0.3);
    const roof = sh("#6a4a3a", 0.3);
    const cream = sh("#f3e6c8", 0.25);
    parts.push(rp(box(fm.x, y + 1.05, fm.z, 1.9, 1.1, 1.5, [0, yaw, 0]), red));
    for (const sx of [-1, 1]) {
      const p = at(sx * 0.48, 0);
      parts.push(rp(box(p.x, y + 1.85, p.z, 1.05, 0.1, 1.75, [0, yaw, sx * -0.62]), roof));
    }
    for (const [lx, lz] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]]) {
      const p = at(lx, lz);
      parts.push(rp(box(p.x, y + 0.25, p.z, 0.14, 0.5, 0.14, [0, yaw, 0]), wood));
    }
    const door = at(0, 0.76);
    parts.push(rp(box(door.x, y + 0.95, door.z, 0.5, 0.6, 0.04, [0, yaw, 0]), dark));
    parts.push(rp(box(door.x, y + 1.45, door.z, 1.2, 0.08, 0.05, [0, yaw, 0]), cream));
    const ramp = at(0, 1.3);
    parts.push(rp(box(ramp.x, y + 0.36, ramp.z, 0.45, 0.05, 1.25, [0.55, yaw, 0]), wood));
    for (const [lx, lz, rot] of [[-2.4, 0.4, 0.3], [-2.2, -1.0, 1.4], [-3.2, -0.3, 0.9]] as [number, number, number][]) {
      const p = at(lx, lz);
      const hay = new THREE.CylinderGeometry(0.5, 0.5, 1.05, 7);
      hay.deleteAttribute("uv");
      place(hay, p.x, groundY(p.x, p.z) + 0.46, p.z, [0, yaw + rot, Math.PI / 2]);
      parts.push(rp(hay, sh("#e2bb52")));
    }
    const tr = at(2.2, 0.6);
    const ty = groundY(tr.x, tr.z);
    parts.push(rp(box(tr.x, ty + 0.22, tr.z, 1.3, 0.44, 0.5, [0, yaw + 0.3, 0]), wood));
    parts.push(rp(box(tr.x, ty + 0.41, tr.z, 1.1, 0.06, 0.36, [0, yaw + 0.3, 0]), sh("#e8c860")));
  }
  for (const r of plan.rocks) {
    const y = groundY(r.x, r.z) + 0.06;
    parts.push(rp(ell(r.x, y + r.r * 0.1, r.z, r.r, r.r * 0.6, r.r * 0.9, 0, [0, r.x, 0]), sh("#a3a39c", 0.35)));
  }
  return parts.length ? merge(parts) : null;
}

export const trisOf = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
