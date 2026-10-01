// Dino Isle's animals as chunky, faceted storybook models in the rig layout (./rig.ts): each is
// built in metres, facing +z, feet on y = 0, with its neck root, head centre and hips (the rig's
// per-variant pivots). Coats are tinted per instance (slot 1 = coat, slot 2 = belly / accent), so
// one geometry makes a whole herd of different-looking animals.
//
// Dinosaurs: Brachiosaurus, Triceratops, Stegosaurus, Parasaurolophus, Ankylosaurus, T. rex,
// Compsognathus, Pteranodon (a flying reptile), Plesiosaurus (a sea reptile).
// Ice Age: woolly mammoth, woolly rhino, Megatherium (giant ground sloth), Irish elk, Smilodon,
// cave bear. And one mixed mesh of small ones: dodo, moa, thylacine, terror bird, glyptodon.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { noise3 } from "../fantasy/noise";
import { K_ARM, K_BODY, K_EAR, K_JAW, K_LEG, K_NECK, K_TAIL, K_TRUNK, K_WING, along, rp, tube, type RigPart, type V3 } from "./rig";

export interface SpeciesGeo {
  geo: THREE.BufferGeometry;
  neck: V3;
  head: V3;
  hip: V3;
}

const W1 = "#ffffff";
const DARK = "#2a2230";
const IVORY = "#fff2d6";
const HORN = "#f1e2c2";
const CLAW = "#4a3d38";
const PI = Math.PI;
const coat = (k = 1) => new THREE.Color(k, k, k);
/** coat on top, accent (belly) underneath */
const belly = (edge = -0.35) => (_p: THREE.Vector3, n: THREE.Vector3) => (n.y < edge ? 2 : 1);

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = mergeGeometries(parts, false);
  if (!out) throw new Error("dino: mergeGeometries failed (attribute mismatch)");
  for (const p of parts) p.dispose();
  out.computeBoundingSphere();
  return out;
}

/** an ellipsoid (icosphere), optionally tilted about x, lumpy by noise */
function egg(rx: number, ry: number, rz: number, x: number, y: number, z: number, tilt = 0, detail = 1, lumpK = 0, seed = 1): THREE.BufferGeometry {
  // (small parts stay extra chunky: fewer faces where nobody could see them)
  const g = new THREE.IcosahedronGeometry(1, Math.max(rx, ry, rz) < 0.36 ? 0 : detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = lumpK ? 1 + (noise3(v.x * 1.8 + seed, v.y * 1.8, v.z * 1.8 - seed, 5) - 0.5) * lumpK * 2 : 1;
    pos.setXYZ(i, v.x * rx * k, v.y * ry * k, v.z * rz * k);
  }
  if (tilt) g.rotateX(tilt);
  g.translate(x, y, z);
  return g;
}
function coneAt(r: number, h: number, seg: number, from: V3, dir: V3): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  g.translate(0, h / 2, 0);
  const d = new THREE.Vector3(...dir).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
  g.translate(...from);
  return g;
}
function boxAt(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}
function gemAt(r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(r, 0);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}
/** a flat polygon (both faces) in the plane through `o` spanned by u and v */
function sheet(pts: [number, number][], o: V3, u: V3, v: V3): THREE.BufferGeometry {
  const pos: number[] = [];
  const P = (q: [number, number]) => [o[0] + u[0] * q[0] + v[0] * q[1], o[1] + u[1] * q[0] + v[1] * q[1], o[2] + u[2] * q[0] + v[2] * q[1]];
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = P(pts[0]);
    const b = P(pts[i]);
    const c = P(pts[i + 1]);
    pos.push(...a, ...b, ...c, ...a, ...c, ...b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** a pair of eyes (black with a white glint) on the head, looking out sideways-forward */
function eyes(x: number, y: number, z: number, r: number, v = -1, brow = 0, browCol = DARK): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    out.push(rp(gemAt(r * 1.35, s * x, y, z, 0.55, 1, 1), W1, { kind: K_NECK, v }));
    out.push(rp(gemAt(r, s * (x + r * 0.35), y, z + r * 0.15, 0.6, 1, 1), DARK, { kind: K_NECK, v }));
    out.push(rp(gemAt(r * 0.34, s * (x + r * 0.62), y + r * 0.35, z + r * 0.45), W1, { kind: K_NECK, v }));
    // (a grumpy / heavy brow)
    if (brow) out.push(rp(boxAt(r * 2.6, r * 0.7, r * 2.2, s * (x + r * 0.1), y + r * 1.15, z, 0, 0, s * brow), browCol, { kind: K_NECK, v, slot: 1 }));
  }
  return out;
}

interface LegSpec {
  x: number;
  pts: [number, number, number, number][]; // [y, z, rx, ry] from the hip down; x from `x` (+ optional splay)
  hind: boolean;
  phase: number;
  col?: string | THREE.Color;
  slot?: number;
  foot?: { r: number; h: number; col: string; toes?: number };
  seg?: number;
  kind?: number;
  v?: number;
}
function legPair(spec: Omit<LegSpec, "x" | "phase"> & { x: number; phase: [number, number] }): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const [i, s] of [1, -1].entries()) {
    const x = spec.x * s;
    const pts = spec.pts.map(([y, z, rx, ry]) => [x, y, z, rx, ry] as [number, number, number, number, number]);
    const hip: V3 = [pts[0][0], pts[0][1], pts[0][2]];
    const foot: V3 = [pts[pts.length - 1][0], 0, pts[pts.length - 1][2]];
    const o: RigPart = { kind: spec.kind ?? K_LEG, pivot: hip, t: along(hip, foot), p1: spec.phase[i], p2: spec.hind ? 1 : 0, slot: spec.slot ?? 1, v: spec.v };
    out.push(rp(tube(pts, spec.seg ?? 6), spec.col ?? coat(), o));
    if (spec.foot) {
      const f = spec.foot;
      if (f.toes) {
        for (let k = 0; k < f.toes; k++) {
          const a = (k - (f.toes - 1) / 2) * 0.5;
          out.push(rp(coneAt(f.r * 0.45, f.r * 1.6, 4, [foot[0], f.h * 0.5, foot[2]], [Math.sin(a), -0.35, Math.cos(a)]), f.col, { ...o, slot: 0 }));
        }
      } else out.push(rp(new THREE.CylinderGeometry(f.r, f.r * 1.08, f.h, spec.seg ?? 6).translate(foot[0], f.h / 2, foot[2]), f.col, { ...o, slot: 0 }));
    }
  }
  return out;
}

const QUAD: { front: [number, number]; hind: [number, number] } = { front: [0, PI], hind: [PI, 0] };
const BIPED: [number, number] = [0, PI];

// ── dinosaurs ──

export function brachiosaurus(): SpeciesGeo {
  const neck: V3 = [0, 6.9, 3.7];
  const head: V3 = [0, 13.1, 8.3];
  const hip: V3 = [0, 5.1, -2.6];
  const P: THREE.BufferGeometry[] = [];
  // a big body sloping up to the shoulders
  P.push(rp(egg(2.3, 2.5, 4.4, 0, 5.6, 0, -0.2), coat(), { slot: belly(-0.4) }));
  P.push(rp(egg(1.7, 1.2, 2.6, 0, 7.0, 1.6, -0.35), coat(0.86), { slot: 1 }));
  // front legs long (it stands tall at the shoulders), hind legs shorter and thicker
  P.push(...legPair({ x: 1.45, pts: [[6.0, 2.6, 0.95, 0.95], [3.2, 2.8, 0.8, 0.8], [0.4, 2.7, 0.7, 0.7]], hind: false, phase: QUAD.front, foot: { r: 0.8, h: 0.45, col: "#6f6a64" } }));
  P.push(...legPair({ x: 1.55, pts: [[5.4, -2.6, 1.15, 1.15], [2.8, -2.3, 0.85, 0.85], [0.4, -2.6, 0.75, 0.75]], hind: true, phase: QUAD.hind, foot: { r: 0.85, h: 0.45, col: "#6f6a64" } }));
  // the long neck, up to the little head (with its bump over the nose)
  const nt = along(neck, head);
  P.push(rp(tube([[0, 6.4, 3.0, 1.35, 1.5], [0, 8.6, 5.0, 0.95, 1.05], [0, 10.9, 6.8, 0.7, 0.75], [0, 12.6, 7.9, 0.55, 0.6]], 7, false, false), coat(), { kind: K_NECK, t: nt, slot: belly(-0.2) }));
  P.push(rp(egg(0.6, 0.55, 0.95, 0, 13.1, 8.6, 0.1), coat(), { kind: K_NECK, slot: 1 }));
  P.push(rp(egg(0.42, 0.4, 0.5, 0, 13.6, 8.5, 0), coat(0.85), { kind: K_NECK, slot: 1 }));
  P.push(rp(egg(0.5, 0.32, 0.55, 0, 12.85, 9.3, 0), coat(0.95), { kind: K_NECK, slot: 1 }));
  P.push(...eyes(0.45, 13.25, 8.75, 0.13));
  // back ridge spots
  for (let i = 0; i < 6; i++) P.push(rp(gemAt(0.35, 0, 7.4 - i * 0.35, 2.4 - i * 1.3, 1.2, 0.6, 1.5), coat(0.72), { slot: 1 }));
  // the tail
  const tr: V3 = [0, 5.5, -3.9];
  P.push(rp(tube([[0, 5.5, -3.6, 1.1, 1.2], [0, 4.6, -7.0, 0.75, 0.8], [0, 3.4, -10.4, 0.45, 0.45], [0, 2.4, -13.6, 0.12, 0.12]], 6, false, true), coat(), { kind: K_TAIL, pivot: tr, t: along(tr, [0, 2.4, -13.6]), slot: belly(-0.3) }));
  return { geo: merge(P), neck, head, hip };
}

export function triceratops(): SpeciesGeo {
  const neck: V3 = [0, 2.1, 2.1];
  const head: V3 = [0, 1.95, 3.25];
  const hip: V3 = [0, 1.9, -1.4];
  const P: THREE.BufferGeometry[] = [];
  P.push(rp(egg(1.35, 1.25, 2.55, 0, 2.0, 0, 0.06, 1, 0.08, 3), coat(), { slot: belly(-0.4) }));
  P.push(...legPair({ x: 0.95, pts: [[1.8, 1.5, 0.5, 0.5], [0.9, 1.65, 0.38, 0.38], [0.25, 1.6, 0.36, 0.36]], hind: false, phase: QUAD.front, foot: { r: 0.4, h: 0.28, col: "#5f5850" } }));
  P.push(...legPair({ x: 1.0, pts: [[1.95, -1.4, 0.62, 0.62], [0.9, -1.25, 0.42, 0.42], [0.25, -1.4, 0.4, 0.4]], hind: true, phase: QUAD.hind, foot: { r: 0.44, h: 0.28, col: "#5f5850" } }));
  // neck + the great head: the frill, three horns and a parrot beak
  P.push(rp(tube([[0, 2.1, 1.9, 0.8, 0.85], [0, 2.0, 2.7, 0.7, 0.72]], 7, false, false), coat(), { kind: K_NECK, t: along(neck, head), slot: 1 }));
  P.push(rp(egg(0.62, 0.62, 0.95, 0, 1.9, 3.35, 0.35), coat(), { kind: K_NECK, slot: 1 }));
  P.push(rp(coneAt(0.32, 0.65, 6, [0, 1.62, 3.95], [0, -0.55, 1]), "#d9c7a0", { kind: K_NECK }));
  // (the frill: a scalloped shield behind the head, accent-coloured, with knobs round the rim)
  const frill = new THREE.CylinderGeometry(1.35, 1.35, 0.14, 12, 1);
  frill.rotateX(PI / 2 - 0.55);
  frill.translate(0, 2.55, 2.75);
  P.push(rp(frill, coat(), { kind: K_NECK, slot: 2 }));
  for (let i = 0; i < 9; i++) {
    const a = -PI * 0.6 + (i / 8) * PI * 1.2;
    const x = Math.sin(a) * 1.35;
    const yz = Math.cos(a) * 1.35;
    P.push(rp(gemAt(0.2, x, 2.55 + yz * Math.cos(0.55), 2.75 - yz * Math.sin(0.55)), HORN, { kind: K_NECK }));
  }
  for (const s of [-1, 1]) P.push(rp(coneAt(0.17, 1.35, 6, [s * 0.32, 2.3, 3.6], [s * 0.18, 0.55, 1]), HORN, { kind: K_NECK }));
  P.push(rp(coneAt(0.14, 0.55, 5, [0, 2.05, 4.0], [0, 0.8, 0.5]), HORN, { kind: K_NECK }));
  P.push(...eyes(0.42, 2.1, 3.55, 0.11, -1, 0.2));
  const tr: V3 = [0, 2.0, -2.3];
  P.push(rp(tube([[0, 2.1, -2.2, 0.6, 0.62], [0, 1.6, -3.7, 0.35, 0.35], [0, 1.1, -5.1, 0.08, 0.08]], 6, false, true), coat(), { kind: K_TAIL, pivot: tr, t: along(tr, [0, 1.1, -5.1]), slot: belly(-0.3) }));
  return { geo: merge(P), neck, head, hip };
}

export function stegosaurus(): SpeciesGeo {
  const neck: V3 = [0, 1.7, 2.0];
  const head: V3 = [0, 1.15, 3.25];
  const hip: V3 = [0, 2.3, -1.2];
  const P: THREE.BufferGeometry[] = [];
  P.push(rp(egg(1.05, 1.35, 2.35, 0, 2.2, -0.2, 0.16), coat(), { slot: belly(-0.4) }));
  P.push(...legPair({ x: 0.72, pts: [[1.6, 1.4, 0.38, 0.38], [0.8, 1.55, 0.3, 0.3], [0.2, 1.45, 0.3, 0.3]], hind: false, phase: QUAD.front, foot: { r: 0.33, h: 0.22, col: "#5f5850" } }));
  P.push(...legPair({ x: 0.8, pts: [[2.4, -1.2, 0.55, 0.55], [1.2, -1.0, 0.4, 0.4], [0.25, -1.2, 0.36, 0.36]], hind: true, phase: QUAD.hind, foot: { r: 0.4, h: 0.24, col: "#5f5850" } }));
  P.push(rp(tube([[0, 1.75, 1.8, 0.5, 0.55], [0, 1.4, 2.6, 0.36, 0.38]], 6, false, false), coat(), { kind: K_NECK, t: along(neck, head), slot: 1 }));
  P.push(rp(egg(0.3, 0.3, 0.55, 0, 1.15, 3.3, 0.35), coat(), { kind: K_NECK, slot: 1 }));
  P.push(...eyes(0.24, 1.3, 3.35, 0.07));
  // two rows of big diamond plates along the back (accent colour), from the neck to the tail
  const tr: V3 = [0, 2.4, -2.3];
  const tailT = along(tr, [0, 1.3, -6.0]);
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    const z = 1.6 - u * 6.6;
    const top = z > -2.3 ? 2.2 + 1.3 * Math.sqrt(Math.max(0, 1 - ((z + 0.3) / 2.4) ** 2)) : 2.4 - (-2.3 - z) * 0.32;
    const hgt = 0.55 + Math.sin(u * PI) * 0.75;
    for (const s of [-1, 1]) {
      const g = sheet([[0, 0], [hgt * 0.5, hgt * 0.55], [0, hgt], [-hgt * 0.5, hgt * 0.55]], [s * 0.12, top - 0.15, z + s * 0.25], [0, 0, 1], [s * 0.18, 1, 0]);
      const o: RigPart = z > -2.3 ? (z > 1.5 ? { kind: K_NECK, t: 0.15 } : { kind: K_BODY }) : { kind: K_TAIL, pivot: tr, t: tailT };
      P.push(rp(g, coat(i % 2 ? 1 : 0.85), { ...o, slot: 2 }));
    }
  }
  P.push(rp(tube([[0, 2.45, -2.2, 0.55, 0.6], [0, 2.0, -4.0, 0.3, 0.32], [0, 1.3, -6.0, 0.08, 0.08]], 6, false, true), coat(), { kind: K_TAIL, pivot: tr, t: tailT, slot: belly(-0.3) }));
  // the thagomizer: four spikes near the tail tip
  for (const s of [-1, 1])
    for (const k of [0, 1]) {
      const z = -5.0 - k * 0.6;
      const y = 1.55 - k * 0.2;
      P.push(rp(coneAt(0.09, 0.9, 5, [s * 0.1, y, z], [s * 0.8, 0.55, -0.15]), HORN, { kind: K_TAIL, pivot: tr, t: tailT }));
    }
  return { geo: merge(P), neck, head, hip };
}

export function parasaurolophus(): SpeciesGeo {
  const neck: V3 = [0, 3.0, 1.5];
  const head: V3 = [0, 4.05, 2.55];
  const hip: V3 = [0, 2.5, -0.6];
  const P: THREE.BufferGeometry[] = [];
  P.push(rp(egg(0.95, 1.1, 2.0, 0, 2.6, 0, 0.18), coat(), { slot: belly(-0.35) }));
  // big hind legs (it walks upright), little arms
  P.push(...legPair({ x: 0.72, pts: [[2.5, -0.6, 0.6, 0.62], [1.4, 0.1, 0.36, 0.36], [0.55, -0.5, 0.24, 0.24], [0.1, -0.3, 0.2, 0.2]], hind: true, phase: BIPED, foot: { r: 0.3, h: 0.12, col: "#5f5850", toes: 3 } }));
  P.push(...legPair({ x: 0.55, kind: K_ARM, pts: [[2.3, 1.3, 0.16, 0.16], [1.6, 1.6, 0.13, 0.13], [1.25, 1.85, 0.12, 0.12]], hind: false, phase: BIPED }));
  P.push(rp(tube([[0, 2.9, 1.3, 0.52, 0.6], [0, 3.5, 1.9, 0.4, 0.42], [0, 3.95, 2.35, 0.32, 0.34]], 6, false, false), coat(), { kind: K_NECK, t: along(neck, head), slot: belly(-0.2) }));
  // the head: a duck bill, and the famous long crest sweeping back
  P.push(rp(egg(0.36, 0.38, 0.6, 0, 4.05, 2.7, 0.2), coat(), { kind: K_NECK, slot: 1 }));
  P.push(rp(egg(0.27, 0.16, 0.42, 0, 3.82, 3.3, 0.2), "#e8c890", { kind: K_NECK }));
  P.push(rp(tube([[0, 4.3, 2.75, 0.14, 0.2], [0, 4.7, 2.3, 0.15, 0.19], [0, 5.0, 1.55, 0.13, 0.16], [0, 5.08, 0.95, 0.09, 0.1]], 6, true, true), coat(), { kind: K_NECK, slot: 2 }));
  P.push(...eyes(0.3, 4.2, 2.8, 0.085));
  const tr: V3 = [0, 2.7, -1.8];
  P.push(rp(tube([[0, 2.75, -1.7, 0.55, 0.6], [0, 2.5, -3.6, 0.32, 0.36], [0, 2.1, -5.6, 0.08, 0.08]], 6, false, true), coat(), { kind: K_TAIL, pivot: tr, t: along(tr, [0, 2.1, -5.6]), slot: belly(-0.3) }));
  // back stripes
  for (let i = 0; i < 5; i++) P.push(rp(boxAt(1.2, 0.08, 0.28, 0, 3.55 - i * 0.05, 1.0 - i * 0.7, 0.18), coat(0.78), { slot: 1 }));
  return { geo: merge(P), neck, head, hip };
}

export function ankylosaurus(): SpeciesGeo {
  const neck: V3 = [0, 1.25, 2.0];
  const head: V3 = [0, 1.1, 2.75];
  const hip: V3 = [0, 1.1, -1.3];
  const P: THREE.BufferGeometry[] = [];
  P.push(rp(egg(1.4, 0.8, 2.2, 0, 1.3, 0), coat(), { slot: belly(-0.3) }));
  // armour: rows of studs and side spikes (darker), a scalloped skirt
  for (let i = 0; i < 5; i++)
    for (let j = -2; j <= 2; j++) {
      const z = 1.4 - i * 0.7;
      const x = j * 0.5;
      const y = 1.3 + 0.8 * Math.sqrt(Math.max(0, 1 - (x / 1.4) ** 2 - (z / 2.2) ** 2)) - 0.02;
      P.push(rp(coneAt(0.16, 0.22, 5, [x, y, z], [x * 0.3, 1, 0]), coat(0.72), { slot: 1 }));
    }
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) P.push(rp(coneAt(0.13, 0.5, 4, [s * 1.3, 1.25, 1.2 - i * 0.8], [s, 0.1, -0.2]), HORN, {}));
  P.push(...legPair({ x: 0.95, pts: [[1.05, 1.3, 0.34, 0.34], [0.2, 1.4, 0.3, 0.3]], hind: false, phase: QUAD.front, foot: { r: 0.32, h: 0.2, col: "#5f5850" } }));
  P.push(...legPair({ x: 1.0, pts: [[1.05, -1.3, 0.4, 0.4], [0.2, -1.35, 0.33, 0.33]], hind: true, phase: QUAD.hind, foot: { r: 0.35, h: 0.2, col: "#5f5850" } }));
  P.push(rp(tube([[0, 1.25, 1.9, 0.55, 0.45], [0, 1.15, 2.4, 0.5, 0.4]], 6, false, false), coat(), { kind: K_NECK, t: along(neck, head), slot: 1 }));
  P.push(rp(egg(0.55, 0.38, 0.55, 0, 1.1, 2.8, 0.1), coat(), { kind: K_NECK, slot: 1 }));
  for (const s of [-1, 1]) P.push(rp(coneAt(0.1, 0.35, 4, [s * 0.45, 1.3, 2.55], [s, 0.2, -0.6]), HORN, { kind: K_NECK }));
  P.push(...eyes(0.4, 1.2, 3.0, 0.08, -1, 0.25));
  const tr: V3 = [0, 1.25, -2.1];
  const tt = along(tr, [0, 0.85, -5.1]);
  P.push(rp(tube([[0, 1.25, -2.0, 0.5, 0.4], [0, 1.05, -3.6, 0.25, 0.22], [0, 0.88, -5.0, 0.14, 0.13]], 6, false, true), coat(), { kind: K_TAIL, pivot: tr, t: tt, slot: 1 }));
  // the tail club
  P.push(rp(egg(0.5, 0.3, 0.4, 0, 0.86, -5.3, 0, 0, 0.12, 2), coat(0.7), { kind: K_TAIL, pivot: tr, t: tt, slot: 1 }));
  return { geo: merge(P), neck, head, hip };
}

export function trex(): SpeciesGeo {
  const neck: V3 = [0, 4.35, 1.9];
  const head: V3 = [0, 5.05, 3.4];
  const hip: V3 = [0, 3.5, -0.4];
  const P: THREE.BufferGeometry[] = [];
  // a big body leaning forward a little (the classic T-rex stance), a chunky chest
  P.push(rp(egg(1.3, 1.55, 2.5, 0, 3.75, 0.2, -0.18, 1, 0.05, 7), coat(), { slot: belly(-0.4) }));
  P.push(rp(egg(1.05, 1.1, 1.1, 0, 4.2, 1.5, 0), coat(), { slot: belly(-0.4) }));
  // back stripes
  for (let i = 0; i < 6; i++) P.push(rp(boxAt(1.95, 0.1, 0.35, 0, 5.2 - i * 0.28, 1.4 - i * 0.7, -0.18), coat(0.72), { slot: 1 }));
  // mighty legs: huge thighs, bird-like shins, three big toes
  P.push(
    ...legPair({ x: 1.0, pts: [[3.6, -0.4, 1.0, 1.1], [2.2, 0.35, 0.62, 0.66], [0.95, -0.5, 0.38, 0.38], [0.2, -0.1, 0.33, 0.33]], hind: true, phase: BIPED, foot: { r: 0.5, h: 0.2, col: "#4f463e", toes: 3 } }),
  );
  // the tiny arms (with two claws each)
  P.push(...legPair({ x: 0.7, kind: K_ARM, pts: [[3.65, 1.95, 0.17, 0.17], [3.15, 2.3, 0.13, 0.13], [2.95, 2.65, 0.11, 0.11]], hind: false, phase: [0.4, PI + 0.4] }));
  for (const s of [-1, 1]) for (const k of [-1, 1]) P.push(rp(coneAt(0.05, 0.22, 4, [s * 0.7 + k * 0.04, 2.95, 2.7], [0, -0.6, 1]), IVORY, { kind: K_ARM, pivot: [s * 0.7, 3.65, 1.95], p1: s > 0 ? 0.4 : PI + 0.4 }));
  P.push(rp(tube([[0, 4.4, 1.75, 0.9, 1.0], [0, 4.85, 2.6, 0.72, 0.8]], 7, false, false), coat(), { kind: K_NECK, t: along(neck, head), slot: belly(-0.3) }));
  // the big head: a boxy skull, a heavy grumpy brow, a lower jaw that opens wide for the ROAR
  P.push(rp(boxAt(1.25, 1.0, 2.0, 0, 5.25, 3.55, -0.08), coat(), { kind: K_NECK, slot: 1 }));
  P.push(rp(boxAt(1.0, 0.62, 0.9, 0, 5.08, 4.65, -0.12), coat(), { kind: K_NECK, slot: 1 }));
  for (const s of [-1, 1]) P.push(rp(gemAt(0.07, s * 0.28, 5.33, 5.05), DARK, { kind: K_NECK }));
  const hinge: V3 = [0, 4.78, 2.9];
  P.push(rp(boxAt(1.05, 0.42, 1.95, 0, 4.55, 3.85, 0.02), coat(), { kind: K_JAW, pivot: hinge, slot: 2 }));
  P.push(rp(boxAt(0.86, 0.1, 1.55, 0, 4.77, 4.0, 0.02), "#d8506a", { kind: K_JAW, pivot: hinge }));
  // teeth: a friendly row along both jaws
  for (const s of [-1, 1])
    for (let i = 0; i < 5; i++) {
      const z = 3.35 + i * 0.32;
      P.push(rp(coneAt(0.06, 0.22, 4, [s * 0.5, 4.76, z], [0, -1, 0.1]), IVORY, { kind: K_NECK }));
      P.push(rp(coneAt(0.055, 0.17, 4, [s * 0.45, 4.74, z + 0.13], [0, 1, 0.1]), IVORY, { kind: K_JAW, pivot: hinge }));
    }
  P.push(...eyes(0.56, 5.55, 3.2, 0.14, -1, 0.35));
  const tr: V3 = [0, 3.8, -2.0];
  P.push(rp(tube([[0, 3.85, -1.9, 1.0, 1.1], [0, 3.55, -4.1, 0.62, 0.64], [0, 3.05, -6.1, 0.3, 0.3], [0, 2.6, -7.8, 0.06, 0.06]], 7, false, true), coat(), { kind: K_TAIL, pivot: tr, t: along(tr, [0, 2.6, -7.8]), slot: belly(-0.3) }));
  return { geo: merge(P), neck, head, hip };
}

export function compy(): SpeciesGeo {
  const neck: V3 = [0, 0.5, 0.18];
  const head: V3 = [0, 0.66, 0.34];
  const hip: V3 = [0, 0.4, -0.05];
  const P: THREE.BufferGeometry[] = [];
  P.push(rp(egg(0.13, 0.15, 0.26, 0, 0.44, 0, 0.2), coat(), { slot: belly(-0.35) }));
  P.push(...legPair({ x: 0.08, pts: [[0.42, -0.05, 0.06, 0.07], [0.22, 0.03, 0.035, 0.035], [0.03, -0.02, 0.03, 0.03]], hind: true, phase: BIPED, seg: 4, foot: { r: 0.04, h: 0.03, col: "#e7a24a", toes: 3 } }));
  P.push(rp(tube([[0, 0.49, 0.16, 0.06, 0.07], [0, 0.6, 0.3, 0.05, 0.05]], 5, false, false), coat(), { kind: K_NECK, t: along(neck, head), slot: 1 }));
  P.push(rp(egg(0.075, 0.07, 0.13, 0, 0.66, 0.4, 0.2, 0), coat(), { kind: K_NECK, slot: 1 }));
  P.push(...eyes(0.055, 0.69, 0.4, 0.028));
  P.push(...legPair({ x: 0.08, kind: K_ARM, pts: [[0.44, 0.15, 0.02, 0.02], [0.36, 0.2, 0.02, 0.02]], hind: false, phase: BIPED, seg: 3 }));
  const tr: V3 = [0, 0.46, -0.22];
  P.push(rp(tube([[0, 0.46, -0.2, 0.08, 0.09], [0, 0.42, -0.5, 0.04, 0.04], [0, 0.36, -0.85, 0.01, 0.01]], 5, false, true), coat(), { kind: K_TAIL, pivot: tr, t: along(tr, [0, 0.36, -0.85]), slot: 1 }));
  for (let i = 0; i < 4; i++) P.push(rp(boxAt(0.2, 0.02, 0.05, 0, 0.58 - i * 0.012, 0.1 - i * 0.12, 0.2), coat(0.6), { slot: 1 }));
  return { geo: merge(P), neck, head, hip };
}

export function pteranodon(): SpeciesGeo {
  const neck: V3 = [0, 0.12, 0.6];
  const head: V3 = [0, 0.25, 1.0];
  const hip: V3 = [0, 0, 0];
  const P: THREE.BufferGeometry[] = [];
  P.push(rp(egg(0.26, 0.24, 0.72, 0, 0, 0), coat(), { slot: belly(-0.3) }));
  P.push(rp(tube([[0, 0.1, 0.55, 0.12, 0.12], [0, 0.22, 0.95, 0.1, 0.1]], 5, false, false), coat(), { kind: K_NECK, t: along(neck, head), slot: 1 }));
  P.push(rp(egg(0.14, 0.16, 0.28, 0, 0.26, 1.05), coat(), { kind: K_NECK, slot: 1 }));
  P.push(rp(coneAt(0.1, 1.05, 5, [0, 0.22, 1.2], [0, -0.1, 1]), "#ffcf5a", { kind: K_NECK }));
  P.push(rp(coneAt(0.07, 0.85, 4, [0, 0.35, 0.95], [0, 0.45, -1]), coat(), { kind: K_NECK, slot: 2 }));
  P.push(...eyes(0.12, 0.32, 1.12, 0.045));
  // the wings: leathery membranes from the body to the long finger, accent-edged
  for (const s of [-1, 1]) {
    const piv: V3 = [s * 0.2, 0.05, 0.15];
    const pts: [number, number][] = [
      [0, 0.45],
      [1.4, 0.55],
      [3.05, 0.1],
      [2.2, -0.35],
      [1.0, -0.55],
      [0, -0.6],
    ];
    const g = sheet(pts, piv, [s, 0.02, 0], [0, 0, 1]);
    P.push(rp(g, coat(), { kind: K_WING, pivot: piv, p1: s, t: (p) => Math.min(1, Math.abs(p.x) / 3), slot: (_p, n) => (Math.abs(n.y) > 0 ? 1 : 1) }));
    P.push(rp(tube([[s * 0.2, 0.08, 0.55, 0.05, 0.05], [s * 1.4, 0.08, 0.7, 0.04, 0.04], [s * 3.05, 0.07, 0.25, 0.02, 0.02]], 4), coat(0.7), { kind: K_WING, pivot: piv, p1: s, t: (p) => Math.min(1, Math.abs(p.x) / 3), slot: 2 }));
  }
  P.push(rp(coneAt(0.08, 0.45, 4, [0, 0, -0.65], [0, 0, -1]), coat(), { slot: 1 }));
  return { geo: merge(P), neck, head, hip };
}

export function plesiosaur(): SpeciesGeo {
  const neck: V3 = [0, 0.2, 1.5];
  const head: V3 = [0, 3.3, 4.2];
  const hip: V3 = [0, 0, 0];
  const P: THREE.BufferGeometry[] = [];
  P.push(rp(egg(1.05, 0.7, 1.9, 0, 0, 0), coat(), { slot: belly(-0.3) }));
  P.push(rp(tube([[0, 0.1, 1.3, 0.55, 0.5], [0, 1.1, 2.4, 0.42, 0.4], [0, 2.2, 3.3, 0.33, 0.32], [0, 3.1, 3.95, 0.26, 0.26]], 6, false, false), coat(), { kind: K_NECK, t: along(neck, head), slot: belly(-0.3) }));
  P.push(rp(egg(0.3, 0.26, 0.5, 0, 3.3, 4.3, 0.25), coat(), { kind: K_NECK, slot: 1 }));
  P.push(rp(egg(0.2, 0.12, 0.3, 0, 3.18, 4.75, 0.25), coat(0.9), { kind: K_NECK, slot: 2 }));
  P.push(...eyes(0.22, 3.42, 4.4, 0.07));
  for (const [z, sz] of [
    [0.9, 1],
    [-1.0, 0.8],
  ] as [number, number][])
    for (const s of [-1, 1]) {
      const piv: V3 = [s * 0.85, -0.1, z];
      const g = sheet(
        [
          [0, 0.3],
          [1.3 * sz, 0.15],
          [2.2 * sz, -0.35],
          [1.1 * sz, -0.35],
          [0, -0.3],
        ],
        piv,
        [s, -0.12, 0],
        [0, 0, 1],
      );
      P.push(rp(g, coat(0.85), { kind: K_WING, pivot: piv, p1: s, t: (p) => Math.min(1, Math.abs(p.x - piv[0]) / 2.2), slot: 1 }));
    }
  const tr: V3 = [0, 0, -1.7];
  P.push(rp(tube([[0, 0, -1.6, 0.5, 0.4], [0, -0.1, -2.8, 0.2, 0.18], [0, -0.2, -3.6, 0.04, 0.04]], 5, false, true), coat(), { kind: K_TAIL, pivot: tr, t: along(tr, [0, -0.2, -3.6]), slot: 1 }));
  for (let i = 0; i < 5; i++) P.push(rp(gemAt(0.18, 0, 0.66, 1.0 - i * 0.55, 1.4, 0.5, 1.3), coat(0.75), { slot: 1 }));
  return { geo: merge(P), neck, head, hip };
}

// ── Ice Age ──

/** shaggy fur: a fringe of hanging flat tufts round an ellipse (darker, accent slot) */
function fringe(cx: number, cy: number, cz: number, rx: number, rz: number, len: number, n: number, kind = K_BODY, extra: RigPart = {}): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    const x = cx + Math.sin(a) * rx;
    const z = cz + Math.cos(a) * rz;
    const w = ((PI * 2 * (rx + rz)) / 2 / n) * 0.75;
    const tx = Math.cos(a);
    const tz = -Math.sin(a);
    const l = len * (0.8 + 0.4 * ((i * 7) % 3) / 2);
    const g = sheet([[-w, 0], [w, 0], [w * 0.2, -l], [-w * 0.5, -l * 0.8]], [x, cy, z], [tx, 0, tz], [Math.sin(a) * 0.25, 1, Math.cos(a) * 0.25]);
    out.push(rp(g, coat(0.8), { kind, slot: 2, ...extra }));
  }
  return out;
}

export function mammoth(): SpeciesGeo {
  const neck: V3 = [0, 3.3, 1.7];
  const head: V3 = [0, 3.55, 2.4];
  const hip: V3 = [0, 2.3, -1.2];
  const P: THREE.BufferGeometry[] = [];
  P.push(rp(egg(1.55, 1.55, 2.2, 0, 2.75, -0.1, 0.06, 1, 0.1, 9), coat(), { slot: 1 }));
  P.push(rp(egg(1.2, 1.1, 1.3, 0, 3.55, 0.9, 0, 1, 0.12, 4), coat(1.05), { slot: 1 }));
  P.push(...fringe(0, 2.0, 0, 1.45, 2.05, 1.0, 16));
  P.push(...legPair({ x: 0.9, pts: [[2.3, 1.2, 0.55, 0.55], [1.1, 1.3, 0.48, 0.48], [0.25, 1.25, 0.46, 0.46]], hind: false, phase: QUAD.front, foot: { r: 0.5, h: 0.26, col: "#4a3a30" } }));
  P.push(...legPair({ x: 0.95, pts: [[2.3, -1.2, 0.6, 0.6], [1.1, -1.15, 0.5, 0.5], [0.25, -1.25, 0.48, 0.48]], hind: true, phase: QUAD.hind, foot: { r: 0.52, h: 0.26, col: "#4a3a30" } }));
  // the high domed head, little furry ears, the trunk and the great curved tusks
  P.push(rp(tube([[0, 3.3, 1.5, 0.95, 1.0], [0, 3.45, 2.1, 0.85, 0.9]], 7, false, false), coat(), { kind: K_NECK, t: along(neck, head), slot: 1 }));
  P.push(rp(egg(0.85, 0.95, 0.85, 0, 3.7, 2.45, 0.2, 1, 0.08, 6), coat(1.05), { kind: K_NECK, slot: 1 }));
  for (const s of [-1, 1]) {
    const piv: V3 = [s * 0.7, 3.75, 2.15];
    P.push(rp(egg(0.12, 0.34, 0.3, s * 0.78, 3.7, 2.05), coat(0.8), { kind: K_EAR, pivot: piv, p1: s, slot: 2 }));
  }
  const troot: V3 = [0, 3.35, 3.05];
  P.push(
    rp(tube([[0, 3.35, 2.95, 0.34, 0.3], [0, 2.7, 3.35, 0.26, 0.24], [0, 1.9, 3.45, 0.2, 0.18], [0, 1.1, 3.4, 0.15, 0.14], [0, 0.55, 3.55, 0.12, 0.12]], 6, false, true), coat(), {
      kind: K_TRUNK,
      pivot: troot,
      t: along(troot, [0, 0.55, 3.55]),
      slot: 1,
    }),
  );
  for (const s of [-1, 1]) P.push(rp(tube([[s * 0.4, 2.95, 2.9, 0.13, 0.13], [s * 0.6, 2.2, 3.4, 0.12, 0.12], [s * 0.6, 1.6, 4.1, 0.1, 0.1], [s * 0.38, 1.75, 4.85, 0.07, 0.07], [s * 0.1, 2.25, 5.1, 0.02, 0.02]], 5, true, true), IVORY, { kind: K_NECK }));
  P.push(...eyes(0.66, 3.55, 2.9, 0.08));
  const tr: V3 = [0, 2.9, -2.2];
  P.push(rp(tube([[0, 2.9, -2.15, 0.15, 0.15], [0, 2.2, -2.45, 0.1, 0.1]], 4), coat(0.8), { kind: K_TAIL, pivot: tr, t: along(tr, [0, 2.2, -2.45]), slot: 2 }));
  P.push(rp(gemAt(0.2, 0, 2.05, -2.5, 1, 1.6, 1), coat(0.7), { kind: K_TAIL, pivot: tr, t: 1, slot: 2 }));
  return { geo: merge(P), neck, head, hip };
}

export function woollyRhino(): SpeciesGeo {
  const neck: V3 = [0, 1.55, 1.35];
  const head: V3 = [0, 1.25, 2.1];
  const hip: V3 = [0, 1.25, -0.9];
  const P: THREE.BufferGeometry[] = [];
  P.push(rp(egg(0.85, 0.9, 1.6, 0, 1.4, 0, 0, 1, 0.1, 5), coat(), { slot: 1 }));
  P.push(rp(egg(0.7, 0.55, 0.8, 0, 1.95, 0.6, 0, 1, 0.12, 2), coat(1.05), { slot: 1 }));
  P.push(...fringe(0, 0.95, 0, 0.8, 1.5, 0.55, 12));
  P.push(...legPair({ x: 0.5, pts: [[1.1, 0.9, 0.3, 0.3], [0.2, 0.95, 0.26, 0.26]], hind: false, phase: QUAD.front, foot: { r: 0.28, h: 0.16, col: "#4a3a30" } }));
  P.push(...legPair({ x: 0.52, pts: [[1.1, -0.9, 0.33, 0.33], [0.2, -0.95, 0.28, 0.28]], hind: true, phase: QUAD.hind, foot: { r: 0.3, h: 0.16, col: "#4a3a30" } }));
  P.push(rp(tube([[0, 1.55, 1.2, 0.55, 0.6], [0, 1.4, 1.75, 0.45, 0.48]], 6, false, false), coat(), { kind: K_NECK, t: along(neck, head), slot: 1 }));
  P.push(rp(egg(0.38, 0.4, 0.75, 0, 1.2, 2.25, 0.35, 1), coat(), { kind: K_NECK, slot: 1 }));
  P.push(rp(coneAt(0.2, 1.05, 6, [0, 1.15, 2.75], [0, 1, 0.55]), HORN, { kind: K_NECK }));
  P.push(rp(coneAt(0.12, 0.42, 5, [0, 1.38, 2.35], [0, 1, 0.2]), HORN, { kind: K_NECK }));
  for (const s of [-1, 1]) P.push(rp(coneAt(0.09, 0.28, 4, [s * 0.22, 1.62, 1.85], [s * 0.4, 1, -0.3]), coat(0.8), { kind: K_EAR, pivot: [s * 0.22, 1.62, 1.85], p1: s, slot: 2 }));
  P.push(...eyes(0.3, 1.38, 2.2, 0.06));
  const tr: V3 = [0, 1.6, -1.55];
  P.push(rp(tube([[0, 1.6, -1.5, 0.08, 0.08], [0, 1.15, -1.75, 0.05, 0.05]], 4), coat(0.8), { kind: K_TAIL, pivot: tr, t: along(tr, [0, 1.15, -1.75]), slot: 2 }));
  return { geo: merge(P), neck, head, hip };
}

export function groundSloth(): SpeciesGeo {
  const neck: V3 = [0, 2.5, 1.35];
  const head: V3 = [0, 2.55, 2.1];
  const hip: V3 = [0, 1.45, -0.9];
  const P: THREE.BufferGeometry[] = [];
  P.push(rp(egg(1.2, 1.35, 1.75, 0, 1.95, -0.25, -0.2, 1, 0.12, 8), coat(), { slot: belly(-0.5) }));
  P.push(...fringe(0, 1.0, -0.35, 1.1, 1.5, 0.45, 12));
  P.push(...legPair({ x: 0.85, pts: [[1.45, -0.9, 0.55, 0.55], [0.6, -0.8, 0.45, 0.45], [0.18, -0.85, 0.42, 0.42]], hind: true, phase: QUAD.hind, foot: { r: 0.45, h: 0.18, col: "#4a3a30" } }));
  // long arms with big hooked claws (it walks on its knuckles, and reaches up into trees)
  P.push(...legPair({ x: 0.9, pts: [[2.35, 1.0, 0.36, 0.36], [1.3, 1.3, 0.28, 0.28], [0.3, 1.45, 0.24, 0.24]], hind: false, phase: QUAD.front }));
  for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) P.push(rp(coneAt(0.06, 0.38, 4, [s * 0.9 + k * 0.1, 0.25, 1.55], [0, -0.5, 1]), IVORY, { kind: K_LEG, pivot: [s * 0.9, 2.35, 1.0], t: 1, p1: s > 0 ? QUAD.front[0] : QUAD.front[1], p2: 0 }));
  P.push(rp(tube([[0, 2.45, 1.2, 0.5, 0.55], [0, 2.5, 1.8, 0.4, 0.42]], 6, false, false), coat(), { kind: K_NECK, t: along(neck, head), slot: 1 }));
  P.push(rp(egg(0.38, 0.38, 0.55, 0, 2.55, 2.15, 0.1), coat(), { kind: K_NECK, slot: 1 }));
  P.push(rp(egg(0.24, 0.2, 0.25, 0, 2.45, 2.6), "#5a4636", { kind: K_NECK }));
  P.push(...eyes(0.3, 2.7, 2.35, 0.06));
  const tr: V3 = [0, 1.5, -1.9];
  P.push(rp(tube([[0, 1.5, -1.85, 0.5, 0.45], [0, 0.8, -2.5, 0.3, 0.28], [0, 0.25, -2.9, 0.12, 0.12]], 6, false, true), coat(), { kind: K_TAIL, pivot: tr, t: along(tr, [0, 0.25, -2.9]), slot: 1 }));
  return { geo: merge(P), neck, head, hip };
}

export function irishElk(): SpeciesGeo {
  const neck: V3 = [0, 1.85, 0.85];
  const head: V3 = [0, 2.45, 1.45];
  const hip: V3 = [0, 1.55, -0.75];
  const P: THREE.BufferGeometry[] = [];
  P.push(rp(egg(0.55, 0.6, 1.1, 0, 1.65, 0, -0.05), coat(), { slot: belly(-0.4) }));
  P.push(...legPair({ x: 0.33, pts: [[1.5, 0.75, 0.16, 0.18], [0.8, 0.8, 0.09, 0.09], [0.1, 0.78, 0.07, 0.07]], hind: false, phase: QUAD.front, seg: 5, foot: { r: 0.08, h: 0.1, col: "#3a2e28" } }));
  P.push(...legPair({ x: 0.33, pts: [[1.6, -0.75, 0.2, 0.22], [0.85, -0.85, 0.1, 0.1], [0.1, -0.8, 0.07, 0.07]], hind: true, phase: QUAD.hind, seg: 5, foot: { r: 0.08, h: 0.1, col: "#3a2e28" } }));
  P.push(rp(tube([[0, 1.85, 0.7, 0.3, 0.38], [0, 2.2, 1.1, 0.24, 0.3], [0, 2.45, 1.35, 0.2, 0.22]], 6, false, false), coat(), { kind: K_NECK, t: along(neck, head), slot: belly(-0.2) }));
  P.push(...fringe(0, 2.05, 0.95, 0.16, 0.2, 0.45, 5, K_NECK, { t: 0.4 }));
  P.push(rp(egg(0.17, 0.2, 0.42, 0, 2.5, 1.6, 0.5), coat(), { kind: K_NECK, slot: 1 }));
  P.push(rp(gemAt(0.07, 0, 2.28, 1.95), DARK, { kind: K_NECK }));
  for (const s of [-1, 1]) P.push(rp(coneAt(0.07, 0.25, 4, [s * 0.14, 2.62, 1.45], [s, 0.6, -0.4]), coat(), { kind: K_EAR, pivot: [s * 0.14, 2.62, 1.45], p1: s, slot: 1 }));
  P.push(...eyes(0.15, 2.58, 1.62, 0.04));
  // the giant palmate antlers
  for (const s of [-1, 1]) {
    const o: V3 = [s * 0.12, 2.68, 1.4];
    P.push(rp(tube([[o[0], o[1], o[2], 0.05, 0.05], [s * 0.55, 2.85, 1.35, 0.045, 0.045]], 4), "#d8c49a", { kind: K_NECK }));
    const g = sheet(
      [
        [0, 0],
        [0.5, 0.15],
        [0.9, 0.55],
        [1.15, 0.45],
        [1.3, 0.8],
        [1.5, 0.55],
        [1.65, 0.9],
        [1.75, 0.35],
        [1.4, -0.1],
        [1.6, -0.35],
        [1.1, -0.25],
        [0.6, -0.15],
      ],
      [s * 0.55, 2.85, 1.35],
      [s, 0.25, 0],
      [0, 0.7, -0.7],
    );
    P.push(rp(g, "#e4d2a6", { kind: K_NECK }));
  }
  const tr: V3 = [0, 1.9, -1.1];
  P.push(rp(coneAt(0.08, 0.25, 4, [0, 1.9, -1.05], [0, -0.3, -1]), coat(0.9), { kind: K_TAIL, pivot: tr, t: 1, slot: 2 }));
  return { geo: merge(P), neck, head, hip };
}

export function sabreCat(): SpeciesGeo {
  const neck: V3 = [0, 1.02, 0.62];
  const head: V3 = [0, 1.12, 0.98];
  const hip: V3 = [0, 0.78, -0.5];
  const P: THREE.BufferGeometry[] = [];
  P.push(rp(egg(0.36, 0.38, 0.8, 0, 0.88, 0, -0.1), (p) => (Math.sin(p.x * 17) * Math.sin(p.z * 13) > 0.6 ? coat(0.72) : coat()), { slot: belly(-0.35) }));
  P.push(...legPair({ x: 0.24, pts: [[0.85, 0.5, 0.15, 0.15], [0.45, 0.55, 0.12, 0.12], [0.08, 0.52, 0.11, 0.11]], hind: false, phase: QUAD.front, seg: 5, foot: { r: 0.13, h: 0.08, col: "#e8d8b8" } }));
  P.push(...legPair({ x: 0.25, pts: [[0.85, -0.5, 0.17, 0.17], [0.45, -0.55, 0.12, 0.12], [0.08, -0.5, 0.11, 0.11]], hind: true, phase: QUAD.hind, seg: 5, foot: { r: 0.13, h: 0.08, col: "#e8d8b8" } }));
  P.push(rp(tube([[0, 1.0, 0.55, 0.24, 0.26], [0, 1.08, 0.85, 0.2, 0.21]], 6, false, false), coat(), { kind: K_NECK, t: along(neck, head), slot: 1 }));
  P.push(rp(egg(0.24, 0.22, 0.25, 0, 1.14, 1.05), coat(), { kind: K_NECK, slot: 1 }));
  P.push(rp(egg(0.15, 0.1, 0.14, 0, 1.08, 1.28), coat(), { kind: K_NECK, slot: 2 }));
  P.push(rp(gemAt(0.04, 0, 1.14, 1.4), "#3a2626", { kind: K_NECK }));
  for (const s of [-1, 1]) P.push(rp(coneAt(0.07, 0.12, 4, [s * 0.14, 1.3, 0.98], [s * 0.3, 1, -0.2]), coat(), { kind: K_EAR, pivot: [s * 0.14, 1.3, 0.98], p1: s, slot: 1 }));
  // the sabre teeth (on the upper jaw) and the lower jaw that drops wide open when it yawns
  for (const s of [-1, 1]) P.push(rp(coneAt(0.03, 0.26, 4, [s * 0.06, 1.02, 1.3], [0, -1, 0.1]), IVORY, { kind: K_NECK }));
  const hinge: V3 = [0, 1.02, 1.0];
  P.push(rp(egg(0.12, 0.05, 0.16, 0, 0.98, 1.2), coat(), { kind: K_JAW, pivot: hinge, slot: 2 }));
  P.push(rp(egg(0.09, 0.03, 0.13, 0, 1.02, 1.2), "#d8506a", { kind: K_JAW, pivot: hinge }));
  P.push(...eyes(0.13, 1.2, 1.18, 0.035));
  const tr: V3 = [0, 1.02, -0.78];
  P.push(rp(coneAt(0.07, 0.3, 4, [0, 1.02, -0.75], [0, 0.4, -1]), coat(), { kind: K_TAIL, pivot: tr, t: 1, slot: 1 }));
  return { geo: merge(P), neck, head, hip };
}

export function caveBear(): SpeciesGeo {
  const neck: V3 = [0, 1.4, 0.9];
  const head: V3 = [0, 1.45, 1.5];
  const hip: V3 = [0, 1.0, -0.7];
  const P: THREE.BufferGeometry[] = [];
  P.push(rp(egg(0.78, 0.82, 1.2, 0, 1.25, 0, 0, 1, 0.1, 3), coat(), { slot: belly(-0.5) }));
  P.push(rp(egg(0.6, 0.45, 0.6, 0, 1.75, 0.45, 0, 1, 0.1, 1), coat(1.05), { slot: 1 }));
  P.push(...legPair({ x: 0.5, pts: [[1.0, 0.7, 0.28, 0.28], [0.5, 0.75, 0.24, 0.24], [0.1, 0.72, 0.23, 0.23]], hind: false, phase: QUAD.front, foot: { r: 0.25, h: 0.12, col: "#3a2e28" } }));
  P.push(...legPair({ x: 0.52, pts: [[1.0, -0.7, 0.32, 0.32], [0.5, -0.72, 0.26, 0.26], [0.1, -0.7, 0.24, 0.24]], hind: true, phase: QUAD.hind, foot: { r: 0.26, h: 0.12, col: "#3a2e28" } }));
  P.push(rp(tube([[0, 1.4, 0.8, 0.45, 0.48], [0, 1.45, 1.25, 0.38, 0.4]], 6, false, false), coat(), { kind: K_NECK, t: along(neck, head), slot: 1 }));
  P.push(rp(egg(0.4, 0.38, 0.4, 0, 1.5, 1.55), coat(), { kind: K_NECK, slot: 1 }));
  P.push(rp(egg(0.2, 0.17, 0.25, 0, 1.38, 1.92), coat(), { kind: K_NECK, slot: 2 }));
  P.push(rp(gemAt(0.07, 0, 1.45, 2.15), DARK, { kind: K_NECK }));
  for (const s of [-1, 1]) P.push(rp(egg(0.13, 0.13, 0.06, s * 0.3, 1.85, 1.45), coat(), { kind: K_EAR, pivot: [s * 0.3, 1.8, 1.45], p1: s, slot: 1 }));
  P.push(...eyes(0.19, 1.6, 1.82, 0.045));
  const tr: V3 = [0, 1.25, -1.15];
  P.push(rp(gemAt(0.13, 0, 1.3, -1.2), coat(), { kind: K_TAIL, pivot: tr, t: 1, slot: 1 }));
  return { geo: merge(P), neck, head, hip };
}

// ── the small ones: one mixed mesh (variants picked per instance) ──

export const SMALL_DODO = 0;
export const SMALL_MOA = 1;
export const SMALL_THYLACINE = 2;
export const SMALL_TERROR = 3;
export const SMALL_GLYPTO = 4;

/** the small ones' geometry: only the `keep` variants are built (the variants' pivots are all listed, by variant id) */
export function smallAnimals(keep: number[] = [SMALL_DODO, SMALL_MOA, SMALL_THYLACINE, SMALL_TERROR, SMALL_GLYPTO]): { geo: THREE.BufferGeometry; variants: { neck: V3; head: V3; hip: V3 }[] } {
  const all: THREE.BufferGeometry[] = [];
  let P: THREE.BufferGeometry[] = [];
  const flush = (v: number) => {
    if (keep.includes(v)) all.push(...P);
    else for (const g of P) g.dispose();
    P = [];
  };
  const variants: { neck: V3; head: V3; hip: V3 }[] = [];
  // dodo: a round grey-blue bird, a big hooked beak, a white tail tuft, tiny wings
  {
    const v = SMALL_DODO;
    const neck: V3 = [0, 0.62, 0.18];
    const head: V3 = [0, 0.85, 0.3];
    variants.push({ neck, head, hip: [0, 0.4, 0] });
    P.push(rp(egg(0.33, 0.34, 0.38, 0, 0.5, 0), coat(), { v, slot: belly(-0.3) }));
    P.push(...legPair({ x: 0.12, pts: [[0.3, 0, 0.05, 0.05], [0.05, 0.03, 0.04, 0.04]], hind: true, phase: BIPED, seg: 4, v, col: "#f2c14e", slot: 0, foot: { r: 0.06, h: 0.03, col: "#f2c14e", toes: 3 } }));
    P.push(rp(tube([[0, 0.65, 0.15, 0.13, 0.13], [0, 0.8, 0.27, 0.12, 0.12]], 5, false, false), coat(), { kind: K_NECK, t: along(neck, head), v, slot: 1 }));
    P.push(rp(egg(0.15, 0.15, 0.17, 0, 0.87, 0.32), coat(), { kind: K_NECK, v, slot: 1 }));
    P.push(rp(egg(0.08, 0.08, 0.2, 0, 0.83, 0.52, 0.2), "#e8d060", { kind: K_NECK, v }));
    P.push(rp(coneAt(0.06, 0.1, 4, [0, 0.8, 0.7], [0, -1, 0.4]), "#c8a040", { kind: K_NECK, v }));
    P.push(...eyes(0.1, 0.92, 0.38, 0.035, v));
    for (const s of [-1, 1]) P.push(rp(egg(0.05, 0.12, 0.14, s * 0.32, 0.55, -0.02, 0.4), coat(0.8), { v, slot: 1 }));
    const tr: V3 = [0, 0.6, -0.33];
    P.push(rp(egg(0.12, 0.12, 0.1, 0, 0.66, -0.38), "#fff8ee", { kind: K_TAIL, pivot: tr, t: 1, v }));
  }
  flush(SMALL_DODO);
  // moa: a tall, shaggy, wingless bird with a long neck
  {
    const v = SMALL_MOA;
    const neck: V3 = [0, 1.45, 0.35];
    const head: V3 = [0, 2.6, 0.75];
    variants.push({ neck, head, hip: [0, 1.2, 0] });
    P.push(rp(egg(0.45, 0.48, 0.62, 0, 1.4, 0, 0.1, 1, 0.15, 3), coat(), { v, slot: 1 }));
    P.push(...fringe(0, 1.05, 0, 0.4, 0.55, 0.35, 8, K_BODY, { v }));
    P.push(...legPair({ x: 0.18, pts: [[1.2, 0, 0.12, 0.14], [0.65, 0.12, 0.07, 0.07], [0.05, 0.02, 0.06, 0.06]], hind: true, phase: BIPED, seg: 4, v, col: "#9a8a70", slot: 0, foot: { r: 0.08, h: 0.03, col: "#9a8a70", toes: 3 } }));
    P.push(rp(tube([[0, 1.5, 0.35, 0.14, 0.15], [0, 2.0, 0.55, 0.1, 0.1], [0, 2.55, 0.72, 0.08, 0.08]], 5, false, false), coat(), { kind: K_NECK, t: along(neck, head), v, slot: 1 }));
    P.push(rp(egg(0.1, 0.1, 0.15, 0, 2.62, 0.78), coat(), { kind: K_NECK, v, slot: 1 }));
    P.push(rp(coneAt(0.04, 0.15, 4, [0, 2.6, 0.9], [0, -0.2, 1]), "#d8c89a", { kind: K_NECK, v }));
    P.push(...eyes(0.07, 2.66, 0.82, 0.025, v));
  }
  flush(SMALL_MOA);
  // thylacine: a striped dog-like marsupial with a stiff long tail
  {
    const v = SMALL_THYLACINE;
    const neck: V3 = [0, 0.62, 0.5];
    const head: V3 = [0, 0.66, 0.75];
    variants.push({ neck, head, hip: [0, 0.5, -0.35] });
    const stripes = (p: THREE.Vector3) => (p.z < -0.05 && Math.sin(p.z * 26) > 0.3 && p.y > 0.55 ? coat(0.55) : coat());
    P.push(rp(egg(0.2, 0.22, 0.58, 0, 0.58, 0), stripes, { v, slot: belly(-0.4) }));
    P.push(...legPair({ x: 0.13, pts: [[0.55, 0.35, 0.07, 0.07], [0.28, 0.38, 0.05, 0.05], [0.04, 0.38, 0.045, 0.045]], hind: false, phase: QUAD.front, seg: 4, v }));
    P.push(...legPair({ x: 0.13, pts: [[0.55, -0.35, 0.08, 0.08], [0.28, -0.4, 0.05, 0.05], [0.04, -0.34, 0.045, 0.045]], hind: true, phase: QUAD.hind, seg: 4, v }));
    P.push(rp(tube([[0, 0.62, 0.45, 0.13, 0.14], [0, 0.66, 0.65, 0.11, 0.11]], 5, false, false), coat(), { kind: K_NECK, t: along(neck, head), v, slot: 1 }));
    P.push(rp(egg(0.12, 0.11, 0.22, 0, 0.68, 0.82, 0.1), coat(), { kind: K_NECK, v, slot: 1 }));
    P.push(rp(gemAt(0.03, 0, 0.66, 1.03), DARK, { kind: K_NECK, v }));
    for (const s of [-1, 1]) P.push(rp(coneAt(0.05, 0.1, 4, [s * 0.07, 0.78, 0.75], [s * 0.3, 1, -0.2]), coat(), { kind: K_EAR, pivot: [s * 0.07, 0.78, 0.75], p1: s, v, slot: 1 }));
    P.push(...eyes(0.08, 0.73, 0.88, 0.025, v));
    const tr: V3 = [0, 0.6, -0.55];
    P.push(rp(tube([[0, 0.6, -0.5, 0.07, 0.07], [0, 0.5, -0.85, 0.045, 0.045], [0, 0.42, -1.15, 0.015, 0.015]], 4, false, true), coat(), { kind: K_TAIL, pivot: tr, t: along(tr, [0, 0.42, -1.15]), v, slot: 1 }));
  }
  flush(SMALL_THYLACINE);
  // terror bird: a big-headed, hook-beaked strutter with tiny wings (comical, not scary)
  {
    const v = SMALL_TERROR;
    const neck: V3 = [0, 1.45, 0.45];
    const head: V3 = [0, 2.05, 0.85];
    variants.push({ neck, head, hip: [0, 1.2, -0.05] });
    P.push(rp(egg(0.42, 0.46, 0.7, 0, 1.35, 0, 0.2, 1, 0.1, 5), coat(), { v, slot: belly(-0.3) }));
    P.push(...legPair({ x: 0.2, pts: [[1.2, -0.05, 0.14, 0.16], [0.65, 0.12, 0.08, 0.08], [0.05, 0.0, 0.07, 0.07]], hind: true, phase: BIPED, seg: 4, v, col: "#f0b040", slot: 0, foot: { r: 0.09, h: 0.03, col: "#f0b040", toes: 3 } }));
    P.push(rp(tube([[0, 1.45, 0.4, 0.2, 0.22], [0, 1.8, 0.62, 0.16, 0.17], [0, 2.02, 0.8, 0.15, 0.15]], 5, false, false), coat(), { kind: K_NECK, t: along(neck, head), v, slot: 1 }));
    P.push(rp(egg(0.2, 0.22, 0.28, 0, 2.1, 0.9), coat(), { kind: K_NECK, v, slot: 1 }));
    P.push(rp(egg(0.12, 0.16, 0.3, 0, 2.05, 1.22, 0.25), "#ff9a3c", { kind: K_NECK, v }));
    P.push(rp(coneAt(0.07, 0.14, 4, [0, 1.95, 1.48], [0, -1, 0.3]), "#e07a20", { kind: K_NECK, v }));
    P.push(rp(coneAt(0.12, 0.4, 5, [0, 2.3, 0.85], [0, 1, -0.9]), coat(), { kind: K_NECK, v, slot: 2 }));
    P.push(...eyes(0.15, 2.2, 1.0, 0.045, v, 0.3));
    for (const s of [-1, 1]) P.push(rp(egg(0.06, 0.12, 0.22, s * 0.42, 1.45, 0.05, 0.3), coat(0.8), { kind: K_WING, pivot: [s * 0.4, 1.55, 0.1], p1: s, t: 1, v, slot: 2 }));
    const tr: V3 = [0, 1.4, -0.65];
    P.push(rp(coneAt(0.2, 0.55, 5, [0, 1.42, -0.6], [0, 0.35, -1]), coat(), { kind: K_TAIL, pivot: tr, t: 1, v, slot: 2 }));
  }
  flush(SMALL_TERROR);
  // glyptodon: a giant armadillo under a domed, patterned shell
  {
    const v = SMALL_GLYPTO;
    const neck: V3 = [0, 0.62, 1.2];
    const head: V3 = [0, 0.58, 1.6];
    variants.push({ neck, head, hip: [0, 0.6, -0.8] });
    const hex = (p: THREE.Vector3) => (Math.round(p.x * 3.3 + p.y * 2.9) + Math.round(p.z * 3.1)) % 2 ? coat() : coat(0.78);
    P.push(rp(egg(1.0, 0.85, 1.45, 0, 0.72, 0, 0, 1), hex, { v, slot: (_p, n) => (n.y < -0.2 ? 2 : 1) }));
    P.push(rp(new THREE.TorusGeometry(0.97, 0.1, 4, 16).rotateX(PI / 2).scale(1, 1, 1.45).translate(0, 0.48, 0), coat(0.7), { v, slot: 1 }));
    P.push(...legPair({ x: 0.62, pts: [[0.5, 0.9, 0.16, 0.16], [0.05, 0.95, 0.15, 0.15]], hind: false, phase: QUAD.front, seg: 5, v, slot: 2 }));
    P.push(...legPair({ x: 0.65, pts: [[0.5, -0.8, 0.18, 0.18], [0.05, -0.85, 0.16, 0.16]], hind: true, phase: QUAD.hind, seg: 5, v, slot: 2 }));
    P.push(rp(tube([[0, 0.6, 1.15, 0.25, 0.22], [0, 0.6, 1.45, 0.22, 0.2]], 5, false, false), coat(), { kind: K_NECK, t: along(neck, head), v, slot: 2 }));
    P.push(rp(egg(0.25, 0.2, 0.3, 0, 0.58, 1.62), coat(), { kind: K_NECK, v, slot: 2 }));
    P.push(rp(egg(0.24, 0.1, 0.24, 0, 0.74, 1.55), coat(0.8), { kind: K_NECK, v, slot: 1 }));
    P.push(...eyes(0.19, 0.64, 1.72, 0.035, v));
    const tr: V3 = [0, 0.62, -1.4];
    const tt = along(tr, [0, 0.35, -2.5]);
    P.push(rp(tube([[0, 0.62, -1.35, 0.26, 0.24], [0, 0.5, -1.95, 0.18, 0.17], [0, 0.35, -2.5, 0.1, 0.1]], 6, false, true), (p) => (Math.sin(p.z * 18) > 0 ? coat() : coat(0.75)), { kind: K_TAIL, pivot: tr, t: tt, v, slot: 1 }));
  }
  flush(SMALL_GLYPTO);
  return { geo: merge(all), variants };
}
