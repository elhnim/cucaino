// Geometry helpers + the Kit: the little workshop every chibi design is built with.
// Parts are baked (transform applied to the geometry) and bucketed per (group, material); on
// finish() each bucket is merged into ONE mesh, so a character is a handful of draw calls while
// every animated joint (head, ears, eyes, arms, legs, tail...) stays its own group.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { basicMat, glowMat, toonMat } from "./materials";

export type V3 = [number, number, number];
export interface Xf {
  p?: V3;
  /** euler XYZ */
  r?: V3;
  q?: THREE.Quaternion;
  s?: V3 | number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

export function xf<G extends THREE.BufferGeometry>(g: G, t: Xf = {}): G {
  _p.set(...(t.p ?? [0, 0, 0]));
  if (t.q) _q.copy(t.q);
  else if (t.r) _q.setFromEuler(_e.set(t.r[0], t.r[1], t.r[2]));
  else _q.identity();
  if (typeof t.s === "number") _s.setScalar(t.s);
  else _s.set(...(t.s ?? [1, 1, 1]));
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  return g;
}

/** Ellipsoid of radii r (unit sphere scaled), then transformed by t (t.s multiplies r). */
export function ell(r: V3, t: Xf = {}, seg: [number, number] = [12, 9]): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg[0], seg[1]);
  const sc = typeof t.s === "number" ? [t.s, t.s, t.s] : t.s ?? [1, 1, 1];
  return xf(g, { ...t, s: [r[0] * sc[0], r[1] * sc[1], r[2] * sc[2]] });
}
export function cone(r: number, h: number, t: Xf = {}, seg = 8): THREE.BufferGeometry {
  return xf(new THREE.ConeGeometry(r, h, seg, 1), t);
}
export function cyl(r0: number, r1: number, h: number, t: Xf = {}, seg = 8): THREE.BufferGeometry {
  return xf(new THREE.CylinderGeometry(r1, r0, h, seg, 1), t);
}
export function capsule(r: number, len: number, t: Xf = {}, radial = 8, cap = 3): THREE.BufferGeometry {
  return xf(new THREE.CapsuleGeometry(r, len, cap, radial), t);
}
export function torus(R: number, tube: number, t: Xf = {}, arc = Math.PI * 2, seg: [number, number] = [5, 16]): THREE.BufferGeometry {
  return xf(new THREE.TorusGeometry(R, tube, seg[0], seg[1], arc), t);
}
export function box(w: number, h: number, d: number, t: Xf = {}): THREE.BufferGeometry {
  return xf(new THREE.BoxGeometry(w, h, d), t);
}
/** A tube along points whose radius tapers from r0 to r1. */
export function taperTube(points: V3[], r0: number, r1: number, t: Xf = {}, seg = 12, radial = 6, closed = true): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    curve.getPointAt(u, c);
    const r = r0 + (r1 - r0) * u;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  let out: THREE.BufferGeometry = g;
  if (closed) {
    // round end caps so the tube never looks hollow
    const a = curve.getPointAt(0);
    const b = curve.getPointAt(1);
    out = mergeClean([g, ell([r0, r0, r0], { p: [a.x, a.y, a.z] }, [radial, 5]), ell([r1, r1, r1], { p: [b.x, b.y, b.z] }, [radial, 5])]);
  }
  return xf(out, t);
}

export function mergeClean(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const anyNonIndexed = geos.some((g) => !g.index);
  const clean = geos.map((g) => {
    let h = anyNonIndexed && g.index ? g.toNonIndexed() : g;
    if (h !== g) g.dispose();
    for (const name of Object.keys(h.attributes)) if (name !== "position" && name !== "normal") h.deleteAttribute(name);
    h.morphAttributes = {};
    h.clearGroups();
    return h;
  });
  if (clean.length === 1) return clean[0];
  const merged = mergeGeometries(clean, false);
  for (const g of clean) g.dispose();
  if (!merged) throw new Error("chibi: geometry merge failed");
  return merged;
}

/** Axis-aligned ellipsoid used to place details on a surface (head, body, muzzle...). */
export class Ell {
  c: THREE.Vector3;
  r: THREE.Vector3;
  constructor(c: V3, r: V3) {
    this.c = new THREE.Vector3(...c);
    this.r = new THREE.Vector3(...r);
  }
  /** point on the surface in direction d from the centre (d need not be normalised) */
  dir(dx: number, dy: number, dz: number, lift = 0): Place {
    const { r } = this;
    const t = 1 / Math.sqrt((dx / r.x) ** 2 + (dy / r.y) ** 2 + (dz / r.z) ** 2);
    const lx = dx * t, ly = dy * t, lz = dz * t;
    const n = new THREE.Vector3(lx / r.x ** 2, ly / r.y ** 2, lz / r.z ** 2).normalize();
    const p = new THREE.Vector3(lx, ly, lz).add(this.c).addScaledVector(n, lift);
    return place(p, n);
  }
  /** front (+Z) surface point at offset (x, y) from the centre */
  front(x: number, y: number, lift = 0): Place {
    const { r } = this;
    const k = 1 - (x / r.x) ** 2 - (y / r.y) ** 2;
    const z = r.z * Math.sqrt(Math.max(0.0001, k));
    return this.dir(x, y, z, lift);
  }
  /** back (-Z) surface point */
  back(x: number, y: number, lift = 0): Place {
    const { r } = this;
    const k = 1 - (x / r.x) ** 2 - (y / r.y) ** 2;
    const z = -r.z * Math.sqrt(Math.max(0.0001, k));
    return this.dir(x, y, z, lift);
  }
  /** radii of the cross-section slice at depth z (for stripe bands) */
  sliceAtZ(z: number): [number, number] {
    const k = Math.sqrt(Math.max(0, 1 - ((z - this.c.z) / this.r.z) ** 2));
    return [this.r.x * k, this.r.y * k];
  }
  sliceAtY(y: number): [number, number] {
    const k = Math.sqrt(Math.max(0, 1 - ((y - this.c.y) / this.r.y) ** 2));
    return [this.r.x * k, this.r.z * k];
  }
}

export interface Place {
  p: THREE.Vector3;
  n: THREE.Vector3;
  /** rotation that maps +Z onto the surface normal (keeps "up" as up as much as possible) */
  q: THREE.Quaternion;
  pv: V3;
}
function place(p: THREE.Vector3, n: THREE.Vector3): Place {
  // orient +Z to the normal with +Y staying as close to world-up as possible (no random roll)
  const up = Math.abs(n.y) > 0.95 ? new THREE.Vector3(0, 0, -Math.sign(n.y)) : new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(up, n).normalize();
  const y = new THREE.Vector3().crossVectors(n, x).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, n);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  return { p, n, q, pv: [p.x, p.y, p.z] };
}
/** place.q followed by a roll around the normal and an optional extra local euler */
export function orient(pl: Place, roll = 0, extra?: V3): THREE.Quaternion {
  const q = pl.q.clone();
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, roll));
  if (extra) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...extra)));
  return q;
}

export interface Joint {
  g: THREE.Group;
  p0: THREE.Vector3;
  r0: THREE.Euler;
}
export function joint(parent: THREE.Object3D, name: string, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0]): Joint {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...p);
  g.rotation.set(...r);
  parent.add(g);
  return { g, p0: g.position.clone(), r0: g.rotation.clone() };
}
export function rebase(j: Joint) {
  j.p0.copy(j.g.position);
  j.r0.copy(j.g.rotation);
}

export type Mat = THREE.Material | string;

export const EYE = "#2b1d2e";
export const BLUSH = "#ff9fb8";
export const MOUTH = "#6b2a3f";
export const WHITE = "#ffffff";

/** Workshop + finished structure of one character. */
export class Kit {
  rig: THREE.Group; // scaled container; feet at y=0
  body: Joint;
  head: Joint;
  headE: Ell; // in head-group space
  bodyE: Ell; // in body-group space
  eyeL!: Joint;
  eyeR!: Joint;
  closedL!: Joint;
  closedR!: Joint;
  mouth!: Joint;
  mouthOpen!: Joint;
  armL: Joint | null = null;
  armR: Joint | null = null;
  legL: Joint | null = null;
  legR: Joint | null = null;
  tail: Joint | null = null;
  earL: Joint | null = null;
  earR: Joint | null = null;
  extra: Record<string, Joint> = {};
  glows: THREE.MeshToonMaterial[] = [];
  eyePlaces: [Place, Place] | null = null;
  /** how the rig moves: standing biped, hovering (fish, bee), crawling (caterpillar), scuttling (crab) */
  gait: "biped" | "hover" | "hop" | "crawl" | "scuttle" = "biped";
  /** per-design extra animation, run after the pose is applied */
  animate: ((a: AnimCtx) => void) | null = null;
  /** height of the design in design units (the rig is scaled by height / fit) */
  fit = 1;
  /** where outfits go */
  neck: { at: V3; r: [number, number]; tilt: number; tube: number; vertical?: boolean; bow?: boolean } = { at: [0, 0.225, 0.0], r: [0.115, 0.1], tilt: 0.12, tube: 0.034 };
  back: { at: V3; r?: V3 } = { at: [0, 0.12, -0.13] };
  top = { at: [0, 0.57, 0.01] as V3 }; // head-group space, crown of the head
  hover = 0;
  /** how far the idle look-around turns the head (fish turn their whole body with it) */
  lookScale = 1;
  private buckets = new Map<THREE.Object3D, Map<THREE.Material, THREE.BufferGeometry[]>>();
  private glowCache = new Map<string, THREE.MeshToonMaterial>();

  constructor(root: THREE.Group, L: Layout) {
    this.rig = new THREE.Group();
    this.rig.name = "chibi-rig";
    root.add(this.rig);
    this.body = joint(this.rig, "body", [0, L.bodyY, 0]);
    this.head = joint(this.body.g, "head", [0, L.neckY, L.neckZ ?? 0]);
    this.headE = new Ell(L.headC, L.headR);
    this.bodyE = new Ell(L.bodyC, L.bodyR);
    this.hover = L.hover ?? 0;
  }

  mat(m: Mat, opacity = 1): THREE.Material {
    return typeof m === "string" ? toonMat(m, opacity) : m;
  }
  /** per-rig glowing material (cached per colour within this rig) */
  glow(color: string, glowColor = color, strength = 1, opacity = 1): THREE.MeshToonMaterial {
    const key = `${color}|${glowColor}|${strength}|${opacity}`;
    let m = this.glowCache.get(key);
    if (!m) {
      m = glowMat(color, glowColor, opacity, strength);
      this.glowCache.set(key, m);
      this.glows.push(m);
    }
    return m;
  }
  add(group: THREE.Object3D | Joint, m: Mat, ...geos: THREE.BufferGeometry[]) {
    const g = "g" in group && (group as Joint).g ? (group as Joint).g : (group as THREE.Object3D);
    const mat = this.mat(m);
    let b = this.buckets.get(g);
    if (!b) this.buckets.set(g, (b = new Map()));
    let list = b.get(mat);
    if (!list) b.set(mat, (list = []));
    list.push(...geos);
  }
  joint(name: string, parent: THREE.Object3D | Joint, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0]): Joint {
    const par = "g" in parent && (parent as Joint).g ? (parent as Joint).g : (parent as THREE.Object3D);
    return joint(par, name, p, r);
  }
  /** flat patch (spot, stripe, mask) lying on a surface */
  decal(group: THREE.Object3D | Joint, m: Mat, pl: Place, r: V3, roll = 0, seg: [number, number] = [8, 5]) {
    this.add(group, m, ell(r, { p: pl.pv, q: orient(pl, roll) }, seg));
  }
  basic(color: string) {
    return basicMat(color);
  }

  finish() {
    for (const [g, b] of this.buckets) {
      for (const [mat, geos] of b) {
        const geo = mergeClean(geos);
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = `${g.name}:${mat.name}`;
        mesh.castShadow = mesh.receiveShadow = false;
        g.add(mesh);
      }
    }
    this.buckets.clear();
  }
}

/** what a design's animate hook sees each frame */
export interface AnimCtx {
  t: number;
  dt: number;
  /** locomotion phase (radians) */
  phase: number;
  /** 0 standing .. 1 moving */
  move: number;
  /** 0 walk .. 1 run */
  run: number;
  /** blended weight of each non-locomotion action currently playing */
  w: Record<string, number>;
  /** 0..1 night glow */
  glow: number;
}

export interface Layout {
  bodyY: number;
  bodyC: V3;
  bodyR: V3;
  neckY: number;
  neckZ?: number;
  headC: V3;
  headR: V3;
  hover?: number;
}

export const STD_LAYOUT: Layout = {
  bodyY: 0.1,
  bodyC: [0, 0.11, 0],
  bodyR: [0.165, 0.14, 0.145],
  neckY: 0.23,
  headC: [0, 0.29, 0.01],
  headR: [0.31, 0.28, 0.27],
};
