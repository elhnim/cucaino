// Geometry helpers for the fantasy kit: tapered tubes with a steady frame (trunks, roots,
// vines), lumpy blobs (canopies), faceted rocks, and `part()` which turns any geometry into the
// kit's standard vertex layout (position, normal, color, aFx) so it can be merged into one mesh.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { noise3 } from "./noise";

export type Fx = [tint: number, sway: number, glow: number];
type PerVertex<T> = T | ((p: THREE.Vector3, n: THREE.Vector3, i: number) => T);

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();

/**
 * Convert `g` into the kit layout: non-indexed, with normal, color and aFx.
 * `color` / `fx` may be constants or functions of (position, normal).
 * `faceted` recomputes normals per face (low-poly stone look).
 */
export function part(g: THREE.BufferGeometry, color: PerVertex<THREE.Color>, fx: PerVertex<Fx>, opts: { faceted?: boolean; faceColor?: boolean } = {}): THREE.BufferGeometry {
  let geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  for (const name of Object.keys(geo.attributes)) if (name !== "position" && name !== "normal") geo.deleteAttribute(name);
  if (opts.faceted || !geo.attributes.normal) {
    geo.deleteAttribute("normal");
    geo.computeVertexNormals();
  }
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const fxa = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    // per-face colour: evaluate at the face centre so a face is one flat colour
    if (opts.faceColor) {
      const f = i - (i % 3);
      _p.set(0, 0, 0);
      _n.set(0, 0, 0);
      for (let k = 0; k < 3; k++) {
        _p.x += pos.getX(f + k) / 3;
        _p.y += pos.getY(f + k) / 3;
        _p.z += pos.getZ(f + k) / 3;
        _n.x += nor.getX(f + k);
        _n.y += nor.getY(f + k);
        _n.z += nor.getZ(f + k);
      }
      _n.normalize();
    } else {
      _p.fromBufferAttribute(pos, i);
      _n.fromBufferAttribute(nor, i);
    }
    const cc = typeof color === "function" ? color(_p, _n, i) : color;
    c.copy(cc);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    const f = typeof fx === "function" ? fx(_p.fromBufferAttribute(pos, i), _n, i) : fx;
    fxa[i * 3] = f[0];
    fxa[i * 3 + 1] = f[1];
    fxa[i * 3 + 2] = f[2];
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aFx", new THREE.BufferAttribute(fxa, 3));
  return geo;
}

/** merge kit-layout parts (disposes the inputs) */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeGeometries(parts, false);
  if (!out) throw new Error("fantasy: mergeGeometries failed (attribute mismatch)");
  for (const p of parts) p.dispose();
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/** add a constant float attribute (e.g. aIsl) */
export function withConst(g: THREE.BufferGeometry, name: string, v: number) {
  g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1));
  return g;
}

/** multiply vertex colours by `tint` where aFx.x says so, then clear aFx.x (for non-instanced use) */
export function bakeTint(g: THREE.BufferGeometry, tint: THREE.Color) {
  const col = g.attributes.color as THREE.BufferAttribute;
  const fx = g.attributes.aFx as THREE.BufferAttribute;
  for (let i = 0; i < col.count; i++) {
    const w = fx.getX(i);
    col.setXYZ(i, col.getX(i) * (1 - w + w * tint.r), col.getY(i) * (1 - w + w * tint.g), col.getZ(i) * (1 - w + w * tint.b));
    fx.setX(i, 0);
  }
  return g;
}

export function transform(g: THREE.BufferGeometry, x: number, y: number, z: number, rotY = 0, s: number | THREE.Vector3 = 1, rotX = 0, rotZ = 0) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, "YXZ")),
    typeof s === "number" ? new THREE.Vector3(s, s, s) : s,
  );
  g.applyMatrix4(m);
  return g;
}

/**
 * A tube along `pts` (Catmull-Rom) whose cross-section is an ellipse rx(t) x ry(t), carried along
 * the curve with parallel transport (no sudden twists). `ry` runs roughly "up" for flat-ish
 * curves, which lets roots be tall buttress fins.
 */
export function taperTube(pts: THREE.Vector3[], opts: { segs: number; radial: number; rx: (t: number) => number; ry?: (t: number) => number; lump?: number; seed?: number; wobble?: (t: number, a: number) => number }): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const { segs, radial } = opts;
  const pos: number[] = [];
  const idx: number[] = [];
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const P = new THREE.Vector3();
  const prevT = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T).normalize();
    if (i === 0) {
      const ref = Math.abs(T.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up;
      B.crossVectors(T, ref).normalize(); // sideways
      N.crossVectors(B, T).normalize(); // "up" of the section
    } else {
      axis.crossVectors(prevT, T);
      const l = axis.length();
      if (l > 1e-6) {
        axis.divideScalar(l);
        const ang = Math.acos(Math.min(1, Math.max(-1, prevT.dot(T))));
        N.applyAxisAngle(axis, ang);
        B.applyAxisAngle(axis, ang);
      }
    }
    prevT.copy(T);
    const rx = opts.rx(t);
    const ry = opts.ry ? opts.ry(t) : rx;
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      let w = 1;
      if (opts.lump) w += (noise3(P.x * 1.3 + Math.cos(a) * 0.8, P.y * 1.3, P.z * 1.3 + Math.sin(a) * 0.8, opts.seed ?? 0) - 0.5) * opts.lump;
      if (opts.wobble) w *= opts.wobble(t, a);
      const cx = Math.cos(a) * rx * w;
      const cy = Math.sin(a) * ry * w;
      pos.push(P.x + B.x * cx + N.x * cy, P.y + B.y * cx + N.y * cy, P.z + B.z * cx + N.z * cy);
    }
  }
  for (let i = 0; i < segs; i++)
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k;
      const b = i * radial + ((k + 1) % radial);
      const c = (i + 1) * radial + k;
      const d = (i + 1) * radial + ((k + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  // close the far end with a small cap (tips of roots/branches)
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A lumpy blob (for canopies): an icosphere pushed in and out by 3D noise, scaled (rx, ry, rz).
 * Normals are blended towards `centre` so a cluster of blobs shades like one soft mass.
 */
export function blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, opts: { detail: number; lump: number; seed: number; centre?: THREE.Vector3; soft?: number; lift?: number }): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, opts.detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  // IcosahedronGeometry is non-indexed: displace by position so shared corners stay welded
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + (noise3(v.x * 1.6 + opts.seed, v.y * 1.6, v.z * 1.6 - opts.seed, 3) - 0.5) * opts.lump + (noise3(v.x * 4, v.y * 4, v.z * 4, 9) - 0.5) * opts.lump * 0.35;
    // flatten the underside a little (canopies hang, they are not balls)
    const yk = v.y < 0 ? 0.78 : 1;
    pos.setXYZ(i, cx + v.x * rx * k, cy + v.y * ry * k * yk, cz + v.z * rz * k);
  }
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  const idxd = weld(g);
  idxd.computeVertexNormals();
  if (opts.centre) {
    const s = opts.soft ?? 0.55;
    const nor = idxd.attributes.normal as THREE.BufferAttribute;
    const p = idxd.attributes.position as THREE.BufferAttribute;
    const n = new THREE.Vector3();
    const d = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      n.fromBufferAttribute(nor, i);
      d.fromBufferAttribute(p, i).sub(opts.centre);
      d.y *= 1.4;
      d.normalize();
      n.lerp(d, s).normalize();
      n.y += opts.lift ?? 0.25;
      n.normalize();
      nor.setXYZ(i, n.x, n.y, n.z);
    }
  }
  return idxd;
}

/** weld identical positions into an indexed geometry (so noise displacement + smooth normals work) */
export function weld(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const map = new Map<string, number>();
  const out: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    let k = map.get(key);
    if (k === undefined) {
      k = out.length / 3;
      map.set(key, k);
      out.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    idx.push(k);
  }
  g.dispose();
  const w = new THREE.BufferGeometry();
  w.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  w.setIndex(idx);
  return w;
}

/** displace every (welded) vertex of `g` by `fn(position)` — keeps shapes watertight */
export function displace(g: THREE.BufferGeometry, fn: (p: THREE.Vector3) => void): THREE.BufferGeometry {
  let geo = g;
  if (!geo.index) geo = weld(geo);
  else {
    for (const name of Object.keys(geo.attributes)) if (name !== "position") geo.deleteAttribute(name);
    const flat = geo.toNonIndexed();
    geo.dispose();
    geo = weld(flat);
  }
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    fn(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export const col = (hex: string | number) => new THREE.Color(hex);
export const mix = (a: THREE.Color, b: THREE.Color, t: number, out = new THREE.Color()) => out.copy(a).lerp(b, Math.min(1, Math.max(0, t)));
