// Low-level shape helpers for the Midnight Rift's procedural art, in the fantasy kit's vertex layout
// plus aK (motion kind + param; see ./material.ts). Everything faces +Z, y up, metres.
import * as THREE from "three";
import { part, type Fx } from "../fantasy/geo";

export type ColFn = THREE.Color | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.Color);
export type FxFn = Fx | ((p: THREE.Vector3, n: THREE.Vector3) => Fx);
export type KFn = [number, number] | ((p: THREE.Vector3) => [number, number]);

const _p = new THREE.Vector3();

/** add the aK attribute (motion kind, param) */
export function withK(g: THREE.BufferGeometry, k: KFn): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const a = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const r = typeof k === "function" ? k(_p.fromBufferAttribute(pos, i)) : k;
    a[i * 2] = r[0];
    a[i * 2 + 1] = r[1];
  }
  g.setAttribute("aK", new THREE.BufferAttribute(a, 2));
  return g;
}

/** kit part + motion */
export function mk(g: THREE.BufferGeometry, c: ColFn, fx: FxFn, k: KFn, faceted = false): THREE.BufferGeometry {
  return withK(part(g, c, fx, { faceted }), k);
}

/**
 * A body of revolution along z (tail t = 0 at z = -len/2 .. nose t = 1 at z = +len/2), with an
 * elliptical section rx(t) x ry(t) and an optional vertical offset of the section centre. Closed
 * at both ends. Smooth normals.
 */
export function body(len: number, prof: (t: number) => [number, number], segs: number, radial: number, yOff?: (t: number) => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const [rx, ry] = prof(t);
    const z = -len / 2 + t * len;
    const yo = yOff ? yOff(t) : 0;
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      pos.push(Math.cos(a) * Math.max(1e-4, rx), yo + Math.sin(a) * Math.max(1e-4, ry), z);
    }
  }
  const R = radial;
  for (let i = 0; i < segs; i++)
    for (let k = 0; k < R; k++) {
      const a = i * R + k;
      const b = i * R + ((k + 1) % R);
      const c = (i + 1) * R + k;
      const d = (i + 1) * R + ((k + 1) % R);
      idx.push(a, b, c, b, d, c);
    }
  // caps
  const tail = pos.length / 3;
  pos.push(0, yOff ? yOff(0) : 0, -len / 2);
  const nose = tail + 1;
  pos.push(0, yOff ? yOff(1) : 0, len / 2);
  for (let k = 0; k < R; k++) {
    idx.push(tail, (k + 1) % R, k);
    idx.push(nose, segs * R + k, segs * R + ((k + 1) % R));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** a flat fin from a 2D outline (a, b), `th` thick. plane "yz": a -> z, b -> y (dorsal, tail);
 *  "xz": a -> x (outward), b -> z (pectorals, flippers). */
export function fin(pts: [number, number][], th: number, plane: "yz" | "xz"): THREE.BufferGeometry {
  const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 2, steps: 1 });
  g.translate(0, 0, -th / 2);
  if (plane === "yz") g.rotateY(-Math.PI / 2);
  else g.rotateX(Math.PI / 2);
  g.deleteAttribute("uv");
  return g;
}

/** a tapered tube along a polyline of points (smooth, closed tip) */
export function tube(pts: THREE.Vector3[], r: (t: number) => number, radial: number, segs = pts.length * 2): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const tg = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = tg.attributes.position as THREE.BufferAttribute;
  const P = new THREE.Vector3();
  const Q = new THREE.Vector3();
  // TubeGeometry lays rings (segs + 1) x (radial + 1): scale each ring about its centre
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    const rr = r(t);
    for (let k = 0; k <= radial; k++) {
      const vi = i * (radial + 1) + k;
      Q.fromBufferAttribute(pos, vi).sub(P).multiplyScalar(rr).add(P);
      pos.setXYZ(vi, Q.x, Q.y, Q.z);
    }
  }
  tg.deleteAttribute("uv");
  tg.computeVertexNormals();
  return tg;
}

/** a sphere / ellipsoid */
export function ball(x: number, y: number, z: number, rx: number, ry = rx, rz = rx, w = 8, h = 6): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  g.deleteAttribute("uv");
  return g;
}

/** a cone pointing +y, base at y = 0 */
export function cone(r: number, h: number, seg = 5): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  g.translate(0, h / 2, 0);
  g.deleteAttribute("uv");
  return g;
}

export const col = (hex: string | number) => new THREE.Color(hex);
const tc = new THREE.Color();
/** mix two colours into a scratch colour (part() copies it straight away) */
export const lerpC = (a: THREE.Color, b: THREE.Color, t: number) => tc.copy(a).lerp(b, Math.min(1, Math.max(0, t)));

/**
 * A cute eye on the side of a head: coloured iris ball, big dark pupil, a white glint that glows a
 * little. (x > 0: right side; mirrored for the left). Motion `k` so it follows the body.
 */
export function eyePair(x: number, y: number, z: number, r: number, iris: THREE.Color, k: KFn, glow = 0.5, fwd = 0.35): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const pupil = col("#07060a");
  const white = col("#ffffff");
  for (const sx of [1, -1]) {
    const ox = sx;
    const ol = Math.hypot(1, fwd);
    const dx = ox / ol;
    const dz = fwd / ol;
    out.push(mk(ball(sx * x, y, z, r, r, r, 7, 5), iris, [0, 0, 0.15], k));
    out.push(mk(ball(sx * x + dx * r * 0.48, y, z + dz * r * 0.48, r * 0.64, r * 0.64, r * 0.64, 6, 4), pupil, [0, 0, 0], k));
    out.push(mk(ball(sx * x + dx * r * 0.95, y + r * 0.32, z + dz * r * 0.95 + r * 0.1, r * 0.2, r * 0.2, r * 0.2, 4, 2), white, [0, 0, glow], k));
  }
  return out;
}

/** smoothstep */
export const ss = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
