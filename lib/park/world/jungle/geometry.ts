// Chunky, faceted low-poly models for the rainforest, in the fantasy kit's vertex layout
// (position, normal, color, aFx — see ../fantasy/geo.ts) so they share its wind sway and
// per-instance leaf tint (aFx.x = 1 on leaves: the instance colour picks the green; bark stays bark).
// Each tree type is ONE geometry (trunk + buttresses + boughs + crown + epiphytes) for one instanced
// draw call. Sizes are TRUE size at scale 1 (see ./plan.ts TREE_DIMS).
import * as THREE from "three";
import { col, merge, part, taperTube, transform, weld, type Fx } from "../fantasy/geo";
import { noise3, rngOf } from "../fantasy/noise";
import { TREE_DIMS, T_CANOPY, T_FERN, T_GIANT, T_PALM } from "./plan";

const _c = new THREE.Color();
const BARK = col("#7e7262");
const BARK_DARK = col("#564a3e");
const LICHEN = col("#b8b48e");
const MOSS = col("#5f9a3a");
const MOSS_DARK = col("#3f7a34");

/** a lumpy faceted blob (dodecahedron, or an icosphere with detail) */
function lump(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, seed: number, amount = 0.25, detail = 0): THREE.BufferGeometry {
  const g = detail > 0 ? new THREE.IcosahedronGeometry(1, detail) : new THREE.DodecahedronGeometry(1, 0);
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + (noise3(v.x * 1.7 + seed, v.y * 1.7, v.z * 1.7 - seed, 3) - 0.5) * amount * 2;
    pos.setXYZ(i, cx + v.x * rx * k, cy + v.y * ry * k * (v.y < -0.1 ? 0.7 : 1), cz + v.z * rz * k);
  }
  return g;
}

/** leaves: white-ish facets (the instance colour gives the green), lighter on top, shaded below */
function leaves(g: THREE.BufferGeometry, seed: number, y0: number, y1: number, sway = 1, base = 0.62): THREE.BufferGeometry {
  // (smoothly shaded, like the park's trees: see storybook/geometry.ts)
  const w = weld(g);
  w.computeVertexNormals();
  const sm = w.toNonIndexed();
  w.dispose();
  return part(
    sm,
    (p, n) => _c.setScalar(Math.min(1, base + (n.y * 0.5 + 0.5) * 0.38 + (noise3(p.x * 0.9 + seed, p.y * 0.9, p.z * 0.9, 9) - 0.5) * 0.14)),
    (p): Fx => [1, sway * Math.max(0.15, Math.min(1, (p.y - y0) / Math.max(0.01, y1 - y0))), 0],
  );
}

/** bark: brown with grey lichen streaks, mossy toward the ground */
function bark(g: THREE.BufferGeometry, mossTo: number, seed: number, sway = 0): THREE.BufferGeometry {
  return part(
    g,
    (p) => {
      const n = noise3(p.x * 0.7 + seed, p.y * 0.25, p.z * 0.7, 5);
      _c.copy(BARK).lerp(BARK_DARK, n * 0.6);
      if (n > 0.62) _c.lerp(LICHEN, (n - 0.62) * 2);
      const moss = Math.max(0, 1 - p.y / mossTo) * (0.55 + noise3(p.x * 1.3, p.y * 0.6, p.z * 1.3, 6) * 0.6);
      return _c.lerp(MOSS, Math.min(0.85, moss));
    },
    (p): Fx => [0, sway * Math.max(0, p.y / 60), 0],
  );
}

/** a big buttressed rainforest tree: fins at the foot, a tall straight trunk, boughs, a wide crown */
function broadleaf(seed: number, D: { h: number; crownY: number; crownR: number; trunkR: number }, low: boolean, giant: boolean): THREE.BufferGeometry {
  const r = rngOf(seed);
  const parts: THREE.BufferGeometry[] = [];
  const { h, crownY, crownR, trunkR } = D;
  const top = crownY - crownR * 0.25;
  // the trunk, leaning a touch
  const lean = new THREE.Vector3((r() - 0.5) * trunkR * 1.4, 0, (r() - 0.5) * trunkR * 1.4);
  const trunkPts = [0, 0.25, 0.55, 0.8, 1].map((u) => new THREE.Vector3(lean.x * u * u + Math.sin(u * 5 + seed) * trunkR * 0.2, -1 + u * (top + 1), lean.z * u * u));
  parts.push(bark(taperTube(trunkPts, { segs: low ? 6 : 9, radial: low ? 7 : 9, rx: (t) => trunkR * (1.25 - t * 0.6) * (t < 0.08 ? 1.25 : 1), lump: 0.18, seed }), crownY * 0.35, seed));
  // buttress roots: tall thin fins flaring out from the trunk's foot
  const fins = giant ? 5 : 3;
  for (let k = 0; k < fins; k++) {
    const a = (k / fins) * Math.PI * 2 + r() * 0.6;
    const out = trunkR * (giant ? 4.4 : 3) * (0.8 + r() * 0.4);
    const hy = trunkR * (giant ? 5.2 : 3.4) * (0.8 + r() * 0.4);
    const pts = [
      new THREE.Vector3(Math.sin(a) * trunkR * 0.5, hy, Math.cos(a) * trunkR * 0.5),
      new THREE.Vector3(Math.sin(a) * out * 0.45, hy * 0.42, Math.cos(a) * out * 0.45),
      new THREE.Vector3(Math.sin(a) * out, -0.3, Math.cos(a) * out),
    ];
    parts.push(bark(taperTube(pts, { segs: 5, radial: 5, rx: (t) => trunkR * (0.3 - t * 0.18), ry: (t) => hy * (0.5 - t * 0.42) + 0.15, seed: seed + k }), hy * 1.4, seed + k));
  }
  // boughs reaching out and up to the crown's lobes, and the lobes on them
  const lobes = giant ? (low ? 7 : 11) : low ? 5 : 8;
  for (let k = 0; k < lobes; k++) {
    const a = (k / lobes) * Math.PI * 2 + r() * 0.5;
    const d = crownR * (0.5 + r() * 0.35);
    const ly = crownY + (r() - 0.4) * crownR * 0.3;
    const lx = Math.sin(a) * d + lean.x;
    const lz = Math.cos(a) * d + lean.z;
    const from = new THREE.Vector3(lean.x * 0.8, top - crownR * (0.35 + r() * 0.25), lean.z * 0.8);
    const mid = new THREE.Vector3(lx * 0.55, (from.y + ly) * 0.5 + crownR * 0.05, lz * 0.55);
    parts.push(bark(taperTube([from, mid, new THREE.Vector3(lx, ly - crownR * 0.15, lz)], { segs: 4, radial: 5, rx: (t) => trunkR * (0.42 - t * 0.28), seed: seed + 10 + k }), 0, seed, 0.2));
    const s = crownR * (giant ? 0.34 : 0.38) * (0.85 + r() * 0.35);
    parts.push(leaves(lump(lx, ly, lz, s * 1.15, s * 0.62, s * 1.15, seed + 20 + k, 0.28, !low && giant && k % 3 === 0 ? 1 : 0), seed + k, crownY - crownR * 0.5, crownY + crownR * 0.5, 1, 0.5 + (k % 3) * 0.09));
    // an epiphyte (a red-hearted bromeliad) sitting in the bough's crook
    if (k % 2 === 0 && !low) {
      const ex = mid.x;
      const ez = mid.z;
      const ey = mid.y + trunkR * 0.3;
      parts.push(part(lump(ex, ey, ez, trunkR * 0.55, trunkR * 0.35, trunkR * 0.55, seed + 40 + k, 0.4), k % 4 === 0 ? col("#e8503a") : col("#f0a030"), [0, 0.1, 0], { faceted: true, faceColor: true }));
    }
  }
  // a crowning lobe on top, and a skirt of lower foliage hiding the boughs' joins
  parts.push(leaves(lump(lean.x, crownY + crownR * 0.22, lean.z, crownR * 0.62, crownR * 0.4, crownR * 0.62, seed + 60, 0.3), seed + 61, crownY - crownR * 0.5, crownY + crownR * 0.5));
  parts.push(leaves(lump(lean.x, crownY - crownR * 0.32, lean.z, crownR * 0.72, crownR * 0.28, crownR * 0.72, seed + 62, 0.35), seed + 63, crownY - crownR * 0.5, crownY + crownR * 0.5, 0.6, 0.48));
  void h;
  return merge(parts);
}

/** a folded leaf strip: a frond from `a` arching out along `dir`, `len` long, `w` wide */
function frond(len: number, w: number, droop: number, segs: number, dir: number, rise: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const x = u * len;
    const y = rise * u - droop * u * u * len;
    const ww = w * Math.sin(Math.min(1, u * 1.15) * Math.PI) * (1 - u * 0.3) + 0.02;
    // a V-fold along the rib (catches the light on one side)
    pos.push(x, y, -ww, x, y + ww * 0.35, 0, x, y, ww);
    if (i > 0) {
      const b = (i - 1) * 3;
      const c = i * 3;
      idx.push(b, c, b + 1, b + 1, c, c + 1, b + 1, c + 1, b + 2, b + 2, c + 1, c + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.rotateY(dir);
  return g;
}

function palm(seed: number, D: { h: number; crownY: number; crownR: number; trunkR: number }, low: boolean): THREE.BufferGeometry {
  const r = rngOf(seed);
  const parts: THREE.BufferGeometry[] = [];
  const bend = D.h * 0.12;
  const pts = [0, 0.4, 0.75, 1].map((u) => new THREE.Vector3(bend * u * u, -0.4 + u * (D.crownY + 0.4), 0));
  parts.push(
    part(
      taperTube(pts, { segs: low ? 5 : 8, radial: 6, rx: (t) => D.trunkR * (1.15 - t * 0.35) }),
      (p) => _c.copy(Math.floor(p.y / 0.9) % 2 ? col("#a08060") : col("#86684c")),
      (p): Fx => [0, Math.max(0, p.y / D.crownY) * 0.4, 0],
      { faceted: true, faceColor: true },
    ),
  );
  const n = low ? 7 : 10;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.3;
    const f = frond(D.crownR * (0.9 + r() * 0.3), D.crownR * 0.17, 0.22 + r() * 0.12, low ? 4 : 6, a, D.crownR * 0.25);
    transform(f, bend, D.crownY, 0);
    parts.push(leaves(f, seed + k, D.crownY - D.crownR, D.crownY + 1, 1, 0.66));
  }
  // coconuts
  if (!low) parts.push(part(lump(bend, D.crownY - 0.45, 0, 0.6, 0.45, 0.6, seed + 30, 0.3), col("#7a5a30"), [0, 0.3, 0], { faceted: true }));
  return merge(parts);
}

function treeFern(seed: number, D: { h: number; crownY: number; crownR: number; trunkR: number }, low: boolean): THREE.BufferGeometry {
  const r = rngOf(seed);
  const parts: THREE.BufferGeometry[] = [];
  const pts = [0, 0.5, 1].map((u) => new THREE.Vector3(Math.sin(u * 2 + seed) * 0.3, -0.3 + u * (D.crownY + 0.3), 0));
  parts.push(bark(taperTube(pts, { segs: 4, radial: 6, rx: (t) => D.trunkR * (1.3 - t * 0.4), lump: 0.4, seed }), D.crownY, seed));
  const n = low ? 7 : 11;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.4;
    const f = frond(D.crownR * (0.95 + r() * 0.25), D.crownR * 0.22, 0.38, low ? 4 : 5, a, D.crownR * 0.42);
    transform(f, pts[2].x, D.crownY, pts[2].z);
    parts.push(leaves(f, seed + k, D.crownY - D.crownR, D.crownY + 1, 0.9, 0.7));
  }
  // the curled fiddlehead in the middle
  parts.push(part(lump(pts[2].x, D.crownY + 0.3, pts[2].z, 0.35, 0.45, 0.35, seed + 9, 0.3), col("#9ac85a"), [0, 0.2, 0], { faceted: true }));
  return merge(parts);
}

export function buildJungleTree(type: number, low = false): THREE.BufferGeometry {
  const D = TREE_DIMS[type];
  if (type === T_GIANT) return broadleaf(101, D, low, true);
  if (type === T_CANOPY) return broadleaf(202, D, low, false);
  if (type === T_PALM) return palm(303, D, low);
  if (type === T_FERN) return treeFern(404, D, low);
  throw new Error(`jungle: no tree type ${type}`);
}

/**
 * One undergrowth clump (~1.6 m across, ~1.2 m tall at scale 1): arching fern fronds, two giant
 * elephant-ear leaves and a little shrub lump. Instanced hundreds of times (rotated, scaled,
 * tinted) it makes the thicket.
 */
export function buildClump(low = false): THREE.BufferGeometry {
  const r = rngOf(505);
  const parts: THREE.BufferGeometry[] = [];
  const n = low ? 4 : 5;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.5;
    const f = frond(1.5 + r() * 0.6, 0.34, 0.42, 3, a, 1.1 + r() * 0.5);
    parts.push(leaves(f, 600 + k, 0, 1.6, 0.8, 0.6));
  }
  for (let k = 0; k < (low ? 2 : 3); k++) {
    // an elephant ear: a big heart-shaped leaf, folded along its rib, on a long stalk
    const a = k * 2.1 + 0.7;
    const L = 1.25 + k * 0.15;
    const base = new THREE.Vector3(Math.sin(a) * 0.45, 1.15 + k * 0.12, Math.cos(a) * 0.45);
    const fwd = new THREE.Vector3(Math.sin(a), 0.18, Math.cos(a)).normalize();
    const side = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    const P = (along: number, across: number, up: number) => base.clone().addScaledVector(fwd, along * L).addScaledVector(side, across * L).add(new THREE.Vector3(0, up * L - along * along * 0.35 * L, 0));
    // outline: the notch at the stalk, two round lobes, the pointed tip; the rib raised a little
    const rib = [P(0, 0, 0.08), P(0.35, 0, 0.12), P(0.7, 0, 0.08), P(1, 0, -0.05)];
    const left = [P(-0.08, -0.32, -0.02), P(0.3, -0.48, 0), P(0.65, -0.32, -0.02)];
    const right = [P(-0.08, 0.32, -0.02), P(0.3, 0.48, 0), P(0.65, 0.32, -0.02)];
    const tri: number[] = [];
    const push = (...vs: THREE.Vector3[]) => vs.forEach((v) => tri.push(v.x, v.y, v.z));
    for (const edge of [left, right]) {
      push(rib[0], edge[0], rib[1]);
      push(edge[0], edge[1], rib[1]);
      push(rib[1], edge[1], rib[2]);
      push(edge[1], edge[2], rib[2]);
      push(rib[2], edge[2], rib[3]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(tri, 3));
    parts.push(leaves(g, 700 + k, 0, 1.8, 0.7, 0.8));
    const stalk = taperTube([new THREE.Vector3(0, 0, 0), base.clone()], { segs: 1, radial: 3, rx: () => 0.05 });
    parts.push(leaves(stalk, 710 + k, 0, 1.8, 0.5, 0.55));
  }
  {
    const g = new THREE.IcosahedronGeometry(1, 0);
    g.scale(0.5, 0.36, 0.5);
    g.translate(0, 0.28, 0);
    parts.push(leaves(g, 721, 0, 1.2, 0.3, 0.42));
  }
  return merge(parts);
}

/** a hanging vine, unit length down from y = 0 to y = -1 (scaled per instance), with leaves */
export function buildVine(low = false): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const segs = low ? 4 : 7;
  const pts = Array.from({ length: segs + 1 }, (_, i) => new THREE.Vector3(Math.sin(i * 1.3) * 0.012, -i / segs, Math.cos(i * 1.7) * 0.012));
  // (a thin rope: its radius is scaled with the instance's x/z, its length with y)
  parts.push(part(taperTube(pts, { segs, radial: 3, rx: () => 0.07 }), col("#6a7a3a"), (p): Fx => [0.4, -p.y, 0], { faceted: true }));
  const r = rngOf(808);
  const nl = low ? 4 : 9;
  for (let k = 0; k < nl; k++) {
    const y = -(k + 0.6) / (nl + 0.5);
    const a = r() * Math.PI * 2;
    const pos = [0, y, 0, Math.sin(a) * 0.22, y - 0.025, Math.cos(a) * 0.22, Math.sin(a + 0.6) * 0.16, y + 0.03, Math.cos(a + 0.6) * 0.16];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    parts.push(leaves(g, 820 + k, -1, 0, 1, 0.7));
  }
  return merge(parts);
}

/** a mossy fallen log with a shelf fungus or two (one merged mesh for all of them) */
export function buildLogs(logs: { x: number; y: number; z: number; len: number; r: number; rot: number }[]): THREE.BufferGeometry | null {
  if (!logs.length) return null;
  const parts: THREE.BufferGeometry[] = [];
  logs.forEach((l, i) => {
    const pts = [new THREE.Vector3(-l.len / 2, l.r * 0.8, 0), new THREE.Vector3(0, l.r * 0.9, 0.2), new THREE.Vector3(l.len / 2, l.r * 0.75, -0.1)];
    const g = bark(taperTube(pts, { segs: 4, radial: 7, rx: (t) => l.r * (1 - t * 0.2), lump: 0.3, seed: i }), 99, i);
    // moss on top
    const cc = g.attributes.color as THREE.BufferAttribute;
    const pp = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pp.count; k++) if (pp.getY(k) > l.r * 1.2) cc.setXYZ(k, MOSS_DARK.r, MOSS_DARK.g, MOSS_DARK.b);
    transform(g, l.x, l.y, l.z, l.rot);
    parts.push(g);
    for (let k = 0; k < 2; k++) {
      const f = part(new THREE.CylinderGeometry(l.r * 0.5, l.r * 0.55, 0.12, 6, 1, false, 0, Math.PI), k ? col("#f0c070") : col("#e89a4a"), [0, 0, 0], { faceted: true });
      transform(f, (k - 0.5) * l.len * 0.5, l.r * (0.6 + k * 0.4), l.r * 0.9, 0);
      transform(f, l.x, l.y, l.z, l.rot);
      parts.push(f);
    }
  });
  return merge(parts);
}

export function trisOf(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.attributes.position.count) / 3;
}
export { T_CANOPY, T_FERN, T_GIANT, T_PALM };
