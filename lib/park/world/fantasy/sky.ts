// The floating islands (registry/skyIslands.ts): big floating mountains with a rocky peak off one
// side of a wide meadow, and little meadow / ruins / crystal / garden islands — chunky storybook
// low-poly. Each has a grassy top built on EXACTLY the registry's heightfield triangles (so a kid
// who lands stands on the grass), a craggy inverted-cone underside with coloured strata, dangling
// roots, a spring and stream that pours off the edge as a waterfall into mist, trees, rocks,
// ruins, crystals, a shrine or signpost, and a glowing treasure chest.
//
// Draw calls: all islands share ONE mesh (island-local geometry + an `aIsl` slot; the shader moves
// each island by its matrix in uIslMat — they only bob, never turn), one waterfall mesh, and the
// chests are three small instanced meshes (bodies, lids, light beams). Mist + glow halos live in
// the shared sprite layer (particles.ts).
import * as THREE from "three";
import { bakeTint, blob, col, merge, mix, part, taperTube, transform, withConst, type Fx } from "./geo";
import { noise3, rngOf, smoothstep } from "./noise";
import { FOG_FACTOR_GLSL, HASH_GLSL, ISL_SLOTS, fxMaterial, fxPatch, type FantasyUniforms } from "./shaders";
import { buildCrystalGeometry, buildRockGeometry, CRYSTAL_HUES, RUNE_CYAN, RUNE_GOLD, ruinPartGeometry } from "./stones";
import { buildTreeGeometry, tintFor } from "./trees";
import { SPRITE_HALO, SPRITE_MIST, type SpriteDef } from "./particles";
import type { Species } from "./placement";
import { SKY_BRIDGES, SKY_GRID, SKY_ISLANDS, SKY_LIP, SKY_PADS, SKY_PROPS, SKY_RUNE_STONES, SKY_SPOTS, runeStoneAt, skyBaseY, skyBob, skyBridgeY, skyLocalHeight, skyNodeHeight, skyStreamEnd, skyTopY, stonesLit, type SkyBridge, type SkyIsland, type SkyProp } from "../../registry/skyIslands";
import { ANIM_KINDS, animGeometry, buildSpot, disposeSpotCaches, type AnimKind, type AnimPlacement } from "../sky/spots";

const scratch = new THREE.Color();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ── storybook palette ──
const GRASS = [col("#6cc247"), col("#7dcc4f"), col("#60b843"), col("#9ad85a")];
const GRASS_RIM = col("#3f8f34");
const DIRT = col("#a36a45");
const DIRT_DARK = col("#62402e");
const STRATA = [col("#f2c68e"), col("#e08f80"), col("#ab8fd6"), col("#f5dcaa"), col("#8f79c6"), col("#ea8a6a")];
const DEEP = col("#6a5890");
const PEAK_A = col("#b0a2c2");
const PEAK_B = col("#8e82a8");
const PEAK_C = col("#cdbfd0");
const MOSS = col("#5aa83c");
const SNOW = col("#f6f9ff");
const WOOD = col("#9a5d33");
const WOOD_DARK = col("#6b3d22");
const GOLD = col("#ffc93d");

type P3 = THREE.Vector3;

/** triangles from a flat position list (x,y,z per vertex) */
function triGeo(pos: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** push triangle a,b,c with its normal facing away from the (cx, cz) axis (or up, for tops) */
function pushTri(out: number[], a: P3, b: P3, c: P3, face: "up" | { cx: number; cz: number; down?: boolean }) {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  let flip: boolean;
  if (face === "up") flip = ny < 0;
  else {
    const mx = (a.x + b.x + c.x) / 3 - face.cx;
    const mz = (a.z + b.z + c.z) / 3 - face.cz;
    flip = nx * mx + nz * mz < 0;
  }
  if (flip) out.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
  else out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

const ang = (p: P3, cx: number, cz: number) => {
  const a = Math.atan2(p.z - cz, p.x - cx);
  return a < 0 ? a + Math.PI * 2 : a;
};

/** stitch two closed rings (each sorted by angle round (cx, cz)) with a zipper of triangles */
function zipper(out: number[], A: P3[], B: P3[], cx: number, cz: number) {
  const aA = A.map((p) => ang(p, cx, cz));
  const aB = B.map((p) => ang(p, cx, cz));
  const at = (arr: number[], i: number) => arr[i % arr.length] + Math.floor(i / arr.length) * Math.PI * 2;
  let i = 0;
  let j = 0;
  const face = { cx, cz };
  while (i < A.length || j < B.length) {
    const nextA = at(aA, i + 1);
    const nextB = at(aB, j + 1);
    if (j >= B.length || (i < A.length && nextA < nextB)) {
      pushTri(out, A[i % A.length], A[(i + 1) % A.length], B[j % B.length], face);
      i++;
    } else {
      pushTri(out, A[i % A.length], B[(j + 1) % B.length], B[j % B.length], face);
      j++;
    }
  }
}

function sortByAngle(ring: P3[], cx: number, cz: number) {
  return ring.sort((p, q) => ang(p, cx, cz) - ang(q, cx, cz));
}

// ── the top: the registry's grid triangles, clipped to a polygon just past the walkable disc ──
function clipConvex(poly: [number, number][], P: [number, number][]): [number, number][] {
  let out = poly;
  const n = P.length;
  for (let k = 0; k < n && out.length; k++) {
    const [ax, az] = P[k];
    const [bx, bz] = P[(k + 1) % n];
    const side = (x: number, z: number) => (bx - ax) * (z - az) - (bz - az) * (x - ax); // > 0 inside (CCW)
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const p = inp[i];
      const q = inp[(i + 1) % inp.length];
      const sp = side(p[0], p[1]);
      const sq = side(q[0], q[1]);
      if (sp >= 0) out.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
  }
  return out;
}

export interface TopResult {
  geo: THREE.BufferGeometry;
  /** the top's exact boundary (island-local), sorted by angle */
  rim: P3[];
}

/** the grassy top of an island (island-local), exported for tests */
export function buildTop(s: SkyIsland, M: number): TopResult {
  const rm = s.r + SKY_LIP;
  // polygon (CCW in x/z) whose apothem covers the walkable disc
  const R = rm / Math.cos(Math.PI / M);
  const P: [number, number][] = Array.from({ length: M }, (_, k) => {
    const a = (k / M) * Math.PI * 2;
    return [Math.cos(a) * R, Math.sin(a) * R];
  });
  const H = (x: number, z: number) => skyLocalHeight(s, x, z);
  const pos: number[] = [];
  const n = Math.ceil(R / SKY_GRID) + 1;
  const tri = (pts: [number, number][], hs: number[]) => {
    // a grid triangle: its plane gives the height of any clipped vertex exactly
    const inside = pts.every(([x, z]) => Math.hypot(x, z) < rm * 0.999);
    const [p0, p1, p2] = pts;
    const plane = (x: number, z: number) => {
      // barycentric on the triangle in x/z
      const d = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1]);
      const w0 = ((p1[1] - p2[1]) * (x - p2[0]) + (p2[0] - p1[0]) * (z - p2[1])) / d;
      const w1 = ((p2[1] - p0[1]) * (x - p2[0]) + (p0[0] - p2[0]) * (z - p2[1])) / d;
      return w0 * hs[0] + w1 * hs[1] + (1 - w0 - w1) * hs[2];
    };
    const poly = inside ? pts : clipConvex(pts, P);
    if (poly.length < 3) return;
    const vs = poly.map(([x, z]) => V(x, plane(x, z), z));
    for (let k = 1; k + 1 < vs.length; k++) pushTri(pos, vs[0], vs[k], vs[k + 1], "up");
  };
  for (let j = -n; j < n; j++)
    for (let i = -n; i < n; i++) {
      const x0 = i * SKY_GRID;
      const z0 = j * SKY_GRID;
      if (Math.hypot(x0 + SKY_GRID / 2, z0 + SKY_GRID / 2) > R + SKY_GRID) continue;
      const h00 = skyNodeHeight(s, i, j);
      const h10 = skyNodeHeight(s, i + 1, j);
      const h01 = skyNodeHeight(s, i, j + 1);
      const h11 = skyNodeHeight(s, i + 1, j + 1);
      const X1 = x0 + SKY_GRID;
      const Z1 = z0 + SKY_GRID;
      // split along the (i+1, j)–(i, j+1) diagonal, as skyLocalHeight does
      tri([[x0, z0], [X1, z0], [x0, Z1]], [h00, h10, h01]);
      tri([[X1, Z1], [x0, Z1], [X1, z0]], [h11, h01, h10]);
    }
  // the exact rim: polygon vertices + wherever a polygon edge crosses a grid line or diagonal
  const rim: P3[] = [];
  for (let k = 0; k < M; k++) {
    const [ax, az] = P[k];
    const [bx, bz] = P[(k + 1) % M];
    const ts = [0];
    const cross = (v0: number, v1: number) => {
      const lo = Math.min(v0, v1) / SKY_GRID;
      const hi = Math.max(v0, v1) / SKY_GRID;
      for (let q = Math.ceil(lo); q <= Math.floor(hi); q++) {
        const t = (q * SKY_GRID - v0) / (v1 - v0);
        if (t > 1e-6 && t < 1 - 1e-6) ts.push(t);
      }
    };
    if (bx !== ax) cross(ax, bx);
    if (bz !== az) cross(az, bz);
    if (bx + bz !== ax + az) cross(ax + az, bx + bz);
    ts.sort((a, b) => a - b);
    for (const t of ts) {
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      rim.push(V(x, H(x, z), z));
    }
  }
  const geo = part(
    triGeo(pos),
    (p) => {
      const d = Math.hypot(p.x, p.z);
      // big soft meadow patches (the faceting already gives each triangle its own shade)
      const n1 = noise3(p.x * 0.07 + s.seed, 0, p.z * 0.07, 3);
      const n2 = noise3(p.x * 0.3, 1, p.z * 0.3 + s.seed, 4);
      const k = n1 < 0.36 ? 2 : n1 > 0.66 ? 1 : 0;
      scratch.copy(GRASS[k]);
      if (n2 > 0.8) scratch.lerp(GRASS[3], 0.5);
      // a darker rim where the grass rolls over the edge
      scratch.lerp(GRASS_RIM, smoothstep(s.r - 0.5, rm, d) * 0.7);
      // the peak's foot: stony, mossy ground
      if (s.peak) {
        const dp = Math.hypot(s.x + p.x - s.peak.x, s.z + p.z - s.peak.z);
        scratch.lerp(col("#8c9a5a"), (1 - smoothstep(s.peak.r, s.peak.r + 2.2, dp)) * 0.55);
      }
      return scratch;
    },
    [0, 0, 0],
    { faceted: true, faceColor: true },
  );
  return { geo, rim: sortByAngle(rim, 0, 0) };
}

/** the grassy lip rolling over the edge + the craggy rocky underside down to a tip */
function buildBody(s: SkyIsland, rim: P3[], low: boolean): THREE.BufferGeometry[] {
  const seed = s.seed;
  const D = s.depth;
  const out: THREE.BufferGeometry[] = [];
  // lip rings share the rim's angles (dense): grass rolling over, then a band of earth
  const ring1 = rim.map((p) => {
    const k = (Math.hypot(p.x, p.z) * 1.02 + 0.35) / Math.hypot(p.x, p.z);
    return V(p.x * k, p.y - 0.6, p.z * k);
  });
  const ring2 = rim.map((p) => {
    const a = Math.atan2(p.z, p.x);
    const k = (Math.hypot(p.x, p.z) * 1.03 + 0.4 + (noise3(Math.cos(a) * 3, 0, Math.sin(a) * 3, seed) - 0.5) * 0.6) / Math.hypot(p.x, p.z);
    return V(p.x * k, p.y - 1.7, p.z * k);
  });
  const lip: number[] = [];
  zipper(lip, rim, ring1, 0, 0);
  const lip2: number[] = [];
  zipper(lip2, ring1, ring2, 0, 0);
  out.push(part(triGeo(lip), () => scratch.copy(GRASS_RIM).lerp(GRASS[2], 0.35), [0, 0, 0], { faceted: true }));
  out.push(part(triGeo(lip2), (p, n) => mix(GRASS_RIM, DIRT, 0.55 + (n.y < 0 ? 0.3 : 0), scratch), [0, 0, 0], { faceted: true, faceColor: true }));

  // the underside: coarse craggy rings (radius factor, depth fraction)
  const M2 = low ? 14 : 22;
  const rm = s.r + SKY_LIP;
  const mountain = s.kind === "mountain";
  const prof: [number, number][] = mountain
    ? [[1.0, 3.2 / D], [0.93, 0.13], [0.82, 0.25], [0.7, 0.37], [0.58, 0.49], [0.46, 0.6], [0.34, 0.71], [0.22, 0.82], [0.11, 0.92]]
    : [[0.99, 2.6 / D], [0.88, 0.2], [0.72, 0.36], [0.55, 0.52], [0.38, 0.67], [0.22, 0.8], [0.1, 0.91]];
  const rings: P3[][] = [ring2];
  // the cone leans off to one side and bulges in lobes, so no two islands share a silhouette
  const leanA = seed * 2.17;
  const lean = [Math.cos(leanA), Math.sin(leanA)];
  const offAt = (f: number, dy: number) => Math.min(dy * rm * 0.3, 0.42 * f * rm);
  prof.forEach(([f, dy], k) => {
    const ring: P3[] = [];
    const off = k === 0 ? 0 : offAt(f, dy);
    for (let i = 0; i < M2; i++) {
      const a = ((i + (k % 2) * 0.5) / M2) * Math.PI * 2 + (noise3(i, k, 1, seed) - 0.5) * 0.15;
      const lobes = 1 + 0.15 * Math.sin(2 * a + seed) + 0.1 * Math.sin(3 * a + seed * 2.3);
      const w = k === 0 ? 1 + (noise3(Math.cos(a) * 2, 0, Math.sin(a) * 2, seed + 1) - 0.5) * 0.12 : lobes * (1 + (noise3(Math.cos(a) * 2.2 + k * 0.4, k * 0.7, Math.sin(a) * 2.2, seed + 2) - 0.5) * 0.55);
      const rr = rm * f * Math.min(w, k === 0 ? 1.1 : 1.02 / f);
      const yy = -dy * D + (k > 0 ? (noise3(Math.cos(a) * 3, k, Math.sin(a) * 3 + seed, 6) - 0.5) * D * 0.1 : 0);
      ring.push(V(Math.cos(a) * rr + lean[0] * off, yy, Math.sin(a) * rr + lean[1] * off));
    }
    rings.push(sortByAngle(ring, 0, 0));
  });
  // one strip per ring pair, each its own stratum: clean, bold horizontal bands
  for (let k = 0; k + 1 < rings.length; k++) {
    const strip: number[] = [];
    zipper(strip, rings[k], rings[k + 1], 0, 0);
    if (k + 2 === rings.length) {
      const last = rings[k + 1];
      const tipOff = offAt(0.1, 1);
      const tip = V(lean[0] * tipOff + (noise3(seed, 0, 0, 1) - 0.5) * 2, -D, lean[1] * tipOff + (noise3(0, seed, 0, 1) - 0.5) * 2);
      for (let i = 0; i < last.length; i++) pushTri(strip, last[i], last[(i + 1) % last.length], tip, { cx: 0, cz: 0 });
    }
    const band = k === 0 ? DIRT : STRATA[(k - 1 + seed) % STRATA.length];
    const deep = smoothstep(1, rings.length - 1, k) * 0.35;
    out.push(
      part(
        triGeo(strip),
        (p) => {
          scratch.copy(band).lerp(DEEP, deep);
          return scratch.multiplyScalar(0.94 + 0.12 * noise3(p.x * 0.3, p.y * 0.3, p.z * 0.3, 5));
        },
        [0, 0, 0],
        { faceted: true, faceColor: true },
      ),
    );
  }

  // secondary lobes: smaller craggy cones hanging beside the main one
  const r = rngOf(seed * 13 + 5);
  const strataAt = (y: number) => {
    const depth = -y;
    if (depth < 3.4) return scratch.copy(DIRT);
    const band = Math.floor(depth / (D / 8) + seed);
    return scratch.copy(STRATA[((band % STRATA.length) + STRATA.length) % STRATA.length]).lerp(DEEP, smoothstep(D * 0.2, D, depth) * 0.35);
  };
  const nLobes = low ? 1 : mountain ? 3 : 2;
  for (let l = 0; l < nLobes; l++) {
    const b = leanA + Math.PI + (l - (nLobes - 1) / 2) * 1.5 + (r() - 0.5) * 0.6;
    const lcx = Math.cos(b) * rm * 0.5;
    const lcz = Math.sin(b) * rm * 0.5;
    const Dl = D * (0.45 + r() * 0.25);
    const lprof: [number, number][] = [[0.38, 2.6], [0.33, Dl * 0.3], [0.24, Dl * 0.55], [0.13, Dl * 0.8]];
    const M3 = low ? 6 : 8;
    const lrings = lprof.map(([f, dy], k) => {
      const ring: P3[] = [];
      for (let i = 0; i < M3; i++) {
        const a = ((i + (k % 2) * 0.5) / M3) * Math.PI * 2;
        const w = 1 + (noise3(Math.cos(a) * 2 + l, k, Math.sin(a) * 2, seed + 11) - 0.5) * 0.6;
        ring.push(V(lcx + Math.cos(a) * rm * f * w, -dy + (k ? (noise3(i, k, l, seed) - 0.5) * Dl * 0.12 : 0), lcz + Math.sin(a) * rm * f * w));
      }
      return sortByAngle(ring, lcx, lcz);
    });
    const pos: number[] = [];
    for (let k = 0; k + 1 < lrings.length; k++) zipper(pos, lrings[k], lrings[k + 1], lcx, lcz);
    const lt = V(lcx + (r() - 0.5) * 2, -Dl, lcz + (r() - 0.5) * 2);
    const last = lrings[lrings.length - 1];
    for (let i = 0; i < last.length; i++) pushTri(pos, last[i], last[(i + 1) % last.length], lt, { cx: lcx, cz: lcz });
    out.push(part(triGeo(pos), (p) => strataAt(p.y).multiplyScalar(0.94 + 0.12 * noise3(p.x * 0.3, p.y * 0.3, p.z * 0.3, 5)), [0, 0, 0], { faceted: true, faceColor: true }));
  }
  // chunks of rock floating free under the island (with a tuft of grass on top)
  const nFloat = low ? 1 : mountain ? 4 : 2;
  for (let k = 0; k < nFloat; k++) {
    const a = r() * Math.PI * 2;
    const d = rm * (0.75 + r() * 0.4);
    const sz = (mountain ? 1.8 : 1.2) + r() * (mountain ? 2.2 : 1.2);
    const y = -D * (0.35 + r() * 0.45);
    // a mini floating islet: a craggy little inverted cone with a grassy top
    const cone = new THREE.ConeGeometry(sz, sz * 2.2, 6, 2);
    cone.rotateX(Math.PI);
    const cp = cone.attributes.position as THREE.BufferAttribute;
    for (let j = 0; j < cp.count; j++) {
      const w = 1 + (noise3(cp.getX(j) * 0.8 + k, cp.getY(j) * 0.8, cp.getZ(j) * 0.8, seed) - 0.5) * 0.5;
      cp.setXYZ(j, cp.getX(j) * w, cp.getY(j), cp.getZ(j) * w);
    }
    transform(cone, Math.cos(a) * d, y - sz * 1.1, Math.sin(a) * d, r() * 6);
    const c0 = STRATA[(k + seed) % STRATA.length];
    out.push(part(cone, (p, n) => (n.y > 0.6 ? GRASS[k % 3] : mix(c0, DEEP, smoothstep(y, y - sz * 2.2, p.y) * 0.5, scratch)), [0, 0, 0], { faceted: true, faceColor: true }));
  }
  // leafy vines trailing from the lip
  const nVines = Math.round((low ? 0.2 : 0.45) * s.r);
  for (let k = 0; k < nVines; k++) {
    const a = r() * Math.PI * 2;
    const rr = rm * (0.99 + r() * 0.04);
    const len = 3 + r() * (mountain ? 8 : 5);
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const vine = taperTube([V(x, -0.9, z), V(x * 1.02, -0.9 - len * 0.5, z * 1.02), V(x * 1.01 + (r() - 0.5), -0.9 - len, z * 1.01 + (r() - 0.5))], { segs: 4, radial: 3, rx: (t) => 0.1 * (1 - t) + 0.05 });
    out.push(part(vine, col("#3f8f34"), [0, 0.25, 0], { faceted: true }));
    for (let j = 1; j < len; j += 1.3) {
      const leaf = new THREE.ConeGeometry(0.28, 0.6, 3);
      transform(leaf, x * 1.03, -0.9 - j, z * 1.03, r() * 6, 1, 0.5, 0.5);
      out.push(part(leaf, j % 2 < 1 ? col("#5fb83a") : col("#8fd14f"), [0, 0.3, 0], { faceted: true }));
    }
  }
  // dangling roots under the lip, and craggy rock spikes hanging off the underside
  const nSpikes = (low ? 0.5 : 1) * (mountain ? 9 : 5);
  for (let k = 0; k < nSpikes; k++) {
    const ringK = 2 + Math.floor(r() * (rings.length - 4));
    const ring = rings[ringK];
    const v = ring[Math.floor(r() * ring.length)];
    const len = (mountain ? 5 : 3) + r() * (mountain ? 9 : 5);
    const rad = (mountain ? 1.6 : 1) + r() * 1.6;
    const cone = new THREE.ConeGeometry(rad, len, 5, 1);
    cone.rotateX(Math.PI);
    transform(cone, v.x * 0.9, v.y + 0.6 - len / 2, v.z * 0.9, r() * 6, 1, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3);
    const c0 = STRATA[(ringK - 1 + seed) % STRATA.length].clone().lerp(DEEP, 0.35);
    out.push(part(cone, (p) => mix(c0, DEEP, smoothstep(v.y, v.y - len, p.y) * 0.6, scratch), [0, 0, 0], { faceted: true, faceColor: true }));
  }
  const nRoots = Math.round((low ? 0.3 : 0.55) * s.r);
  for (let k = 0; k < nRoots; k++) {
    const a = r() * Math.PI * 2;
    const rr = rm * (0.96 + r() * 0.05);
    const len = 2 + r() * (mountain ? 7 : 4.5);
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const y0 = -1.4;
    const root = taperTube([V(x, y0, z), V(x * 1.03, y0 - len * 0.45, z * 1.03), V(x * 0.99 + (r() - 0.5) * 1.2, y0 - len, z * 0.99 + (r() - 0.5) * 1.2)], { segs: 4, radial: 3, rx: (t) => 0.32 * (1 - t) + 0.08 });
    out.push(part(root, (p) => mix(col("#6b4a2e"), col("#4d8a34"), smoothstep(y0 - len * 0.3, y0 - len, p.y), scratch), [0, 0, 0], { faceted: true }));
  }
  return out;
}

/** a craggy mountain spire rising from the top at island-local (cx, cz) */
function buildSpire(s: SkyIsland, cx: number, cz: number, pr: number, h: number, seed: number, snow: boolean, low: boolean): { geo: THREE.BufferGeometry; tip: THREE.Vector3 } {
  const M = low ? 8 : 10;
  // stepped crags: steep rock walls with grassy (or snowy) shelves between them
  const prof: [number, number][] = [
    [1.0, 0.1],
    [0.94, 0.24],
    [0.78, 0.28],
    [0.72, 0.45],
    [0.55, 0.5],
    [0.5, 0.66],
    [0.35, 0.71],
    [0.28, 0.85],
    [0.12, 0.93],
  ];
  // one craggy radius per angle, shared by every ring, so ridges run up the whole peak
  const crag = Array.from({ length: M }, (_, i) => 0.8 + noise3(i * 0.9, seed, 0, 3) * 0.45);
  const rings: P3[][] = [];
  const base: P3[] = [];
  for (let i = 0; i < M; i++) {
    const a = (i / M) * Math.PI * 2;
    const w = 0.95 + (crag[i] - 1) * 0.12;
    const x = cx + Math.cos(a) * pr * w;
    const z = cz + Math.sin(a) * pr * w;
    base.push(V(x, skyLocalHeight(s, x, z) - 1.2, z));
  }
  rings.push(base);
  const gy = skyLocalHeight(s, cx, cz);
  const lx = Math.cos(seed * 2.3);
  const lz = Math.sin(seed * 2.3);
  prof.forEach(([f, dy], k) => {
    const ring: P3[] = [];
    for (let i = 0; i < M; i++) {
      const a = ((i + (noise3(i, k, seed, 7) - 0.5) * 0.3) / M) * Math.PI * 2;
      const w = crag[i] * (1 + (noise3(i * 1.3, k * 0.8, seed, 4) - 0.5) * 0.25);
      const lean = dy * dy * pr * 0.3;
      // shelves tilt and wander a little, so it reads as a crag, not a cake
      const tilt = Math.sin(a + k * 1.7 + seed) * h * 0.05 + (noise3(i, k, seed, 9) - 0.5) * h * 0.05;
      ring.push(V(cx + Math.cos(a) * pr * f * w + lx * lean, gy + dy * h + tilt, cz + Math.sin(a) * pr * f * w + lz * lean));
    }
    rings.push(sortByAngle(ring, cx, cz));
  });
  const pos: number[] = [];
  for (let k = 0; k + 1 < rings.length; k++) zipper(pos, rings[k], rings[k + 1], cx, cz);
  const lastR = rings[rings.length - 1];
  const tip = V(cx + lx * pr * 0.3, gy + h, cz + lz * pr * 0.3);
  for (let i = 0; i < lastR.length; i++) pushTri(pos, lastR[i], lastR[(i + 1) % lastR.length], tip, { cx, cz });
  const geo = part(
    triGeo(pos),
    (p, n) => {
      const t = (p.y - gy) / h;
      // rock in two tones by height band, the shelves green low down and snowy up high
      const band = Math.floor(t * 4.5);
      scratch.copy(band % 2 === 0 ? PEAK_A : PEAK_C);
      if (n.x * 0.6 + n.z * 0.3 < -0.2) scratch.lerp(PEAK_B, 0.6);
      if (n.y > 0.5) scratch.copy(t < 0.62 ? MOSS : snow ? SNOW : MOSS);
      if (snow && t > 0.8) scratch.copy(SNOW).multiplyScalar(0.92 + 0.08 * Math.max(0, n.y));
      return scratch;
    },
    [0, 0, 0],
    { faceted: true, faceColor: true },
  );
  return { geo, tip };
}

// ── props ──
const TREE_SPECIES: Partial<Record<SkyProp["kind"], Species>> = { pine: "pine", round: "oak", birch: "birch", blossom: "oak" };
const BLOSSOM = [col("#ff9fcf"), col("#ffc0e4"), col("#f5a3ff")];
const FLOWER_COLS = [col("#ff6fa8"), col("#ffd23f"), col("#ffffff"), col("#c38bff"), col("#ff5a4e"), col("#7fd6ff")];

function box(w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.Color, fx: Fx = [0, 0, 0], rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  transform(g, x, y, z, rotY);
  return part(g, c, fx, { faceted: true });
}

function propGeometry(p: SkyProp, isl: SkyIsland, low: boolean, cache: Map<string, THREE.BufferGeometry>, r: () => number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const sp = TREE_SPECIES[p.kind];
  if (sp && low) {
    out.push(...cheapTree(p.kind, r));
    for (const g of out) transform(g, 0, 0, 0, p.rot, p.s);
    return out;
  }
  if (sp) {
    const variant = Math.floor(r() * 2);
    const key = `${sp}:${variant}`;
    let base = cache.get(key);
    if (!base) {
      // chunky low-detail trees: they're small up here, and it suits the storybook look
      base = buildTreeGeometry(sp, true, 3 + variant * 17).geometry;
      cache.set(key, base);
    }
    const g = base.clone();
    if (p.kind === "blossom") bakeTint(g, BLOSSOM[Math.floor(r() * BLOSSOM.length)]);
    else bakeTint(g, tintFor(sp, sp === "birch" ? (isl.kind === "mountain" ? 0.8 + r() * 0.2 : r() * 0.6) : r()));
    transform(g, 0, -0.15, 0, p.rot, p.s);
    out.push(g);
    return out;
  }
  switch (p.kind) {
    case "rock": {
      const g = buildRockGeometry(low);
      bakeTint(g, col("#e6ddef"));
      transform(g, 0, -0.25 * p.s, 0, p.rot, V(p.s * 1.15, p.s * 0.85, p.s));
      out.push(g);
      break;
    }
    case "bush": {
      const g = blob(0, 0.55 * p.s, 0, 1.05 * p.s, 0.8 * p.s, 1.05 * p.s, { detail: low ? 0 : 1, lump: 0.45, seed: r() * 40 });
      const c1 = r() < 0.5 ? col("#4fb043") : col("#3f9c4a");
      out.push(part(g, (q, n) => mix(c1, col("#a6e05a"), Math.max(0, n.y) * 0.55 + (q.y > 0.8 * p.s ? 0.15 : 0), scratch), [0, 0.15, 0], { faceted: true, faceColor: true }));
      if (r() < 0.45) {
        // a few berries / blossoms on it
        for (let k = 0; k < 4; k++) {
          const a = r() * Math.PI * 2;
          const b = new THREE.IcosahedronGeometry(0.13, 0);
          transform(b, Math.cos(a) * 0.9 * p.s, (0.6 + r() * 0.4) * p.s, Math.sin(a) * 0.9 * p.s);
          out.push(part(b, FLOWER_COLS[(k + (p.x | 0)) % 2 === 0 ? 0 : 4], [0, 0, 0.15]));
        }
      }
      break;
    }
    case "flowers": {
      const n = low ? 5 : 9;
      const c0 = FLOWER_COLS[Math.floor(r() * FLOWER_COLS.length)];
      const c1 = FLOWER_COLS[Math.floor(r() * FLOWER_COLS.length)];
      for (let k = 0; k < n; k++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 1.3;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const hy = skyLocalHeight(isl, p.x - isl.x + x, p.z - isl.z + z) - skyLocalHeight(isl, p.x - isl.x, p.z - isl.z);
        const head = new THREE.OctahedronGeometry(0.22 + r() * 0.08, 0);
        transform(head, x, hy + 0.12, z, r() * 3, V(1, 0.55, 1));
        out.push(part(head, r() < 0.6 ? c0 : c1, [0, 0.4, 0.05], { faceted: true }));
      }
      break;
    }
    case "pillar":
    case "broken":
    case "arch":
    case "altar": {
      const h = p.kind === "pillar" ? 4.2 + r() * 1.2 : p.kind === "broken" ? 1.4 + r() * 1.8 : p.s;
      const gs = ruinPartGeometry({ kind: p.kind, x: 0, y: 0, z: 0, rot: 0, h, seed: Math.floor(r() * 1e6), runes: true }, isl.id === "sunset-ruins" ? RUNE_GOLD : RUNE_CYAN);
      for (const g of gs) {
        transform(g, 0, -0.12, 0, p.rot, p.kind === "arch" ? p.s : 1);
        out.push(g);
      }
      break;
    }
    case "crystal": {
      const g = buildCrystalGeometry(rngOf(Math.floor(r() * 1e6)));
      bakeTint(g, CRYSTAL_HUES[Math.floor(r() * 10) % 3 === 0 ? 1 : 0]);
      transform(g, 0, 0, 0, p.rot, p.s, (r() - 0.5) * 0.2, (r() - 0.5) * 0.2);
      out.push(g);
      break;
    }
    case "shrine": {
      // a little shrine: stone plinth, red posts, a teal pagoda roof, a glowing lantern inside
      out.push(box(3.3, 0.5, 3.3, 0, 0.1, 0, col("#b8aeb8")));
      out.push(box(2.3, 0.25, 0.9, 0, -0.05, 2.0, col("#a8a0aa")));
      for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
        const post = new THREE.CylinderGeometry(0.16, 0.18, 2.4, 6);
        transform(post, x, 1.55, z);
        out.push(part(post, col("#e0463a"), [0, 0, 0], { faceted: true }));
      }
      out.push(box(3.0, 0.22, 3.0, 0, 2.8, 0, col("#e0463a")));
      const roof = new THREE.ConeGeometry(2.55, 1.5, 4);
      transform(roof, 0, 3.65, 0, Math.PI / 4);
      out.push(part(roof, col("#2fb3a0"), [0, 0, 0], { faceted: true }));
      const knob = new THREE.OctahedronGeometry(0.28, 0);
      transform(knob, 0, 4.55, 0);
      out.push(part(knob, GOLD, [0, 0, 0.8], { faceted: true }));
      out.push(box(0.55, 0.7, 0.55, 0, 1.0, 0, col("#ffd36b"), [0, 0, 2.2]));
      for (const g of out) transform(g, 0, 0, 0, p.rot);
      break;
    }
    case "sign": {
      // a wooden signpost pointing out across the top
      out.push(box(0.2, 2.3, 0.2, 0, 1.0, 0, WOOD_DARK));
      out.push(box(1.5, 0.45, 0.12, 0.55, 1.85, 0, col("#f0d49a")));
      out.push(box(1.3, 0.4, 0.12, -0.45, 1.3, 0.02, col("#ffb870"), [0, 0, 0], 0.5));
      const cap = new THREE.ConeGeometry(0.2, 0.3, 4);
      transform(cap, 0, 2.3, 0, Math.PI / 4);
      out.push(part(cap, col("#e0463a"), [0, 0, 0], { faceted: true }));
      for (const g of out) transform(g, 0, 0, 0, p.rot);
      break;
    }
    case "mushroom": {
      // a little cluster of red toadstools with white spots
      const n = 2 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) {
        const a = r() * Math.PI * 2;
        const d = k === 0 ? 0 : 0.5 + r() * 0.3;
        const sz = (k === 0 ? 1 : 0.6 + r() * 0.3) * (0.8 + r() * 0.5);
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const stem = new THREE.CylinderGeometry(0.1 * sz, 0.14 * sz, 0.5 * sz, 5);
        transform(stem, x, 0.22 * sz, z);
        out.push(part(stem, col("#f5ecd8"), [0, 0, 0], { faceted: true }));
        const cap = new THREE.SphereGeometry(0.36 * sz, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2);
        transform(cap, x, 0.42 * sz, z, 0, V(1, 0.75, 1));
        out.push(part(cap, col("#e8413a"), [0, 0, 0.05], { faceted: true }));
        for (let j = 0; j < 3; j++) {
          const b = (j / 3) * Math.PI * 2 + r();
          const dot = new THREE.OctahedronGeometry(0.06 * sz, 0);
          transform(dot, x + Math.cos(b) * 0.22 * sz, 0.62 * sz, z + Math.sin(b) * 0.22 * sz);
          out.push(part(dot, col("#ffffff"), [0, 0, 0], { faceted: true }));
        }
      }
      break;
    }
    case "lantern": {
      out.push(box(0.14, 1.5, 0.14, 0, 0.7, 0, WOOD_DARK));
      out.push(box(0.4, 0.45, 0.4, 0, 1.6, 0, col("#ffd36b"), [0, 0, 2]));
      break;
    }
  }
  return out;
}

/** low quality: a few chunky shapes per tree (~50 tris) instead of the full kit tree */
function cheapTree(kind: SkyProp["kind"], r: () => number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const trunk = (h: number, rad: number, c: THREE.Color) => {
    const g = new THREE.CylinderGeometry(rad * 0.7, rad, h, 5);
    transform(g, 0, h / 2 - 0.2, 0);
    out.push(part(g, c, [0, 0, 0], { faceted: true }));
  };
  if (kind === "pine") {
    trunk(3.5, 0.45, WOOD_DARK);
    const tint = tintFor("pine", r());
    for (let k = 0; k < 3; k++) {
      const cone = new THREE.ConeGeometry(3.2 - k * 0.8, 4.2 - k * 0.5, 6);
      transform(cone, 0, 3.4 + k * 3 + (4.2 - k * 0.5) / 2, 0, k);
      out.push(part(cone, (q, n) => mix(tint.clone().multiplyScalar(0.7), tint, 0.5 + n.y * 0.5, scratch), [0, 0.2, 0], { faceted: true, faceColor: true }));
    }
    return out;
  }
  trunk(kind === "birch" ? 6 : 5, kind === "birch" ? 0.3 : 0.55, kind === "birch" ? col("#e9e5da") : WOOD);
  const c = kind === "blossom" ? BLOSSOM[Math.floor(r() * BLOSSOM.length)] : tintFor(kind === "birch" ? "birch" : "oak", r() * 0.7);
  const lumps: [number, number, number, number][] = kind === "birch" ? [[0, 7.4, 0, 2], [0.8, 6.2, 0.3, 1.5]] : [[0, 7.2, 0, 3.2], [1.8, 6.4, 0.6, 2.2], [-1.5, 6.6, -0.8, 2.3]];
  for (const [x, y, z, rr] of lumps) {
    const g = new THREE.IcosahedronGeometry(rr, 0);
    transform(g, x, y, z, r() * 3);
    out.push(part(g, (q, n) => mix(c.clone().multiplyScalar(0.72), c, 0.5 + n.y * 0.5, scratch), [0, 0.2, 0], { faceted: true, faceColor: true }));
  }
  return out;
}

// ── the treasure chest (unit, sitting on y = 0, front = +z; the lid hinges at the back) ──
function chestBody(): THREE.BufferGeometry {
  const parts = [
    box(1.3, 0.72, 0.86, 0, 0.36, 0, WOOD),
    box(1.34, 0.08, 0.9, 0, 0.7, 0, WOOD_DARK),
    box(0.14, 0.74, 0.9, -0.42, 0.37, 0, GOLD, [0, 0, 0.9]),
    box(0.14, 0.74, 0.9, 0.42, 0.37, 0, GOLD, [0, 0, 0.9]),
    box(0.26, 0.3, 0.08, 0, 0.56, 0.46, GOLD, [0, 0, 1.4]),
    // treasure heaped inside (seen when the lid is open)
    box(1.1, 0.12, 0.66, 0, 0.66, 0, col("#ffd84a"), [0, 0, 1.6]),
  ];
  return merge(parts);
}
function chestLid(): THREE.BufferGeometry {
  const half = new THREE.CylinderGeometry(0.43, 0.43, 1.3, 7, 1, false, 0, Math.PI);
  half.rotateZ(Math.PI / 2);
  half.rotateX(Math.PI / 2);
  // hinge at the origin: the lid's back edge
  half.translate(0, 0, 0.43);
  const parts = [part(half, WOOD, [0, 0, 0], { faceted: true })];
  for (const x of [-0.42, 0.42]) {
    const band = new THREE.CylinderGeometry(0.455, 0.455, 0.14, 7, 1, false, 0, Math.PI);
    band.rotateZ(Math.PI / 2);
    band.rotateX(Math.PI / 2);
    band.translate(x, 0, 0.43);
    parts.push(part(band, GOLD, [0, 0, 0.9], { faceted: true }));
  }
  return merge(parts);
}

export interface SkyIslands {
  mesh: THREE.Mesh;
  falls: THREE.Mesh;
  /** chest bodies, lids and light beams */
  chests: THREE.Object3D[];
  /** sprites for the shared layer: waterfall mist and glow halos (island slots) */
  sprites: SpriteDef[];
  /** which islands' treasure chests are opened (lids up, beams off) */
  setOpened(ids: string[]): void;
  /** discoveries already found (SKY_SPOTS ids): a found nest shows its hatchling; a found rune
   *  circle stays lit */
  setSpotsFound(ids: string[]): void;
  /** the kid's feet each frame: lights rune stones when stood on */
  setKid(x: number, y: number, z: number): void;
  /** the rune circles: how many stones are lit and whether each is solved */
  puzzleState(): { id: string; lit: number; total: number; done: boolean }[];
  update(t: number): void;
  /** triangles drawn (for perf reporting) */
  triangles: number;
  dispose(): void;
}

export function buildSkyIslands(U: FantasyUniforms, opts: { lowQuality?: boolean }): SkyIslands {
  const low = !!opts.lowQuality;
  if (SKY_ISLANDS.length >= ISL_SLOTS) throw new Error("sky islands: more islands than uIslMat slots");
  const parts: THREE.BufferGeometry[] = [];
  const fallParts: THREE.BufferGeometry[] = [];
  const sprites: SpriteDef[] = [];
  const white = col("#eaf6ff");
  const treeCache = new Map<string, THREE.BufferGeometry>();
  const animPlaced: (AnimPlacement & { isl: number })[] = [];
  SKY_ISLANDS.forEach((s, i) => {
    const add = (g: THREE.BufferGeometry) => parts.push(withConst(withConst(withConst(g, "aIsl", i), "aIsl2", i), "aIslMix", 0));
    const r = rngOf(s.seed * 31 + 7);
    const top = buildTop(s, low ? 40 : 56);
    add(top.geo);
    for (const g of buildBody(s, top.rim, low)) add(g);
    if (s.peak) {
      const pcx = s.peak.x - s.x;
      const pcz = s.peak.z - s.z;
      const snow = s.peak.h >= 18;
      const main = buildSpire(s, pcx, pcz, s.peak.r, s.peak.h, s.seed, snow, low);
      add(main.geo);
      // a little red pennant flying on the summit
      const pole = new THREE.CylinderGeometry(0.09, 0.09, 3.2, 4);
      transform(pole, main.tip.x, main.tip.y + 1.2, main.tip.z);
      add(part(pole, WOOD_DARK, [0, 0, 0], { faceted: true }));
      const flag = new THREE.BufferGeometry();
      flag.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, -1.1, 0, 2.2, -0.5, 0, 0, 0, 0, 2.2, -0.5, 0, 0, -1.1, 0], 3));
      transform(flag, main.tip.x, main.tip.y + 2.75, main.tip.z, s.seed);
      add(part(flag, col("#ff4a4a"), [0, 0.6, 0], { faceted: true }));
      // shoulder spires: the Crown has three, the others a smaller companion
      const n = s.id === "dragons-crown" ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const a = Math.atan2(pcz, pcx) + (k === 0 ? 1.9 : -1.9);
        const d = s.peak.r * 0.55;
        add(buildSpire(s, pcx + Math.cos(a) * d, pcz + Math.sin(a) * d, s.peak.r * 0.5, s.peak.h * (n > 1 ? 0.7 : 0.55), s.seed + 10 + k, snow && n > 1, low).geo);
      }
    }
    // everything standing on the top
    for (const p of SKY_PROPS) {
      if (p.island !== s.id) continue;
      const lx = p.x - s.x;
      const lz = p.z - s.z;
      const gy = skyLocalHeight(s, lx, lz);
      for (const g of propGeometry(p, s, low, treeCache, r)) {
        transform(g, lx, gy, lz);
        add(g);
      }
      if (p.kind === "crystal" && p.s > 1.2) sprites.push({ x: lx, y: gy + 2.2 * p.s, z: lz, isl: i, size: 7 * p.s, color: CRYSTAL_HUES[0], kind: SPRITE_HALO });
      if (p.kind === "shrine") sprites.push({ x: lx, y: gy + 1.1, z: lz, isl: i, size: 5, color: col("#ffcf5a"), kind: SPRITE_HALO });
      if (p.kind === "altar") sprites.push({ x: lx, y: gy + 2 * p.s, z: lz, isl: i, size: 4.5, color: s.id === "sunset-ruins" ? col("#ffcf5a") : col("#5ff4ff"), kind: SPRITE_HALO });
    }
    // stepping stones from the landing spot to the treasure
    {
      const ax = s.landing.x - s.x;
      const az = s.landing.z - s.z;
      const bx = s.treasure.x - s.x;
      const bz = s.treasure.z - s.z;
      const L = Math.hypot(bx - ax, bz - az);
      const nS = Math.floor((L - 1.6) / 1.35);
      for (let k = 0; k < nS; k++) {
        const u = (k * 1.35 + 0.4) / L;
        const x = ax + (bx - ax) * u + (r() - 0.5) * 0.35;
        const z = az + (bz - az) * u + (r() - 0.5) * 0.35;
        const st = new THREE.CylinderGeometry(0.5 + r() * 0.15, 0.55 + r() * 0.15, 0.2, 6);
        transform(st, x, skyLocalHeight(s, x, z) + 0.02, z, r() * 3);
        add(part(st, col(r() < 0.5 ? "#d9d0c4" : "#c9c0d4"), [0, 0, 0], { faceted: true }));
      }
    }
    // the things to discover
    for (const sp of SKY_SPOTS) {
      if (sp.island !== s.id) continue;
      const b = buildSpot(sp, s, low);
      for (const g of b.statics) add(g);
      for (const w of b.water) fallParts.push(withConst(w, "aIsl", i));
      for (const d of b.sprites) sprites.push({ ...d, isl: i });
      for (const a of b.anim) animPlaced.push({ ...a, isl: i });
    }
    // building pads: a ring of paving round each, and stepping stones from its door to the landing
    for (const pad of SKY_PADS) {
      if (pad.island !== s.id) continue;
      const px = pad.x - s.x;
      const pz = pad.z - s.z;
      const gy = skyLocalHeight(s, px, pz);
      const nP = Math.round((pad.r * Math.PI * 2) / 1.25);
      for (let k = 0; k < nP; k++) {
        const a = (k / nP) * Math.PI * 2;
        const st = new THREE.CylinderGeometry(0.45, 0.5, 0.16, 5);
        transform(st, px + Math.sin(a) * (pad.r + 0.2), gy + 0.02, pz + Math.cos(a) * (pad.r + 0.2), a);
        add(part(st, col(k % 2 ? "#d9d0c4" : "#e6dccb"), [0, 0, 0], { faceted: true }));
      }
      const lx = s.landing.x - s.x;
      const lz = s.landing.z - s.z;
      const L = Math.hypot(lx - px, lz - pz);
      for (let d = pad.r + 1.2; d < L - 2.2; d += 1.35) {
        const x = px + ((lx - px) * d) / L + (r() - 0.5) * 0.3;
        const z = pz + ((lz - pz) * d) / L + (r() - 0.5) * 0.3;
        const st = new THREE.CylinderGeometry(0.5, 0.55, 0.18, 6);
        transform(st, x, skyLocalHeight(s, x, z) + 0.02, z, r() * 3);
        add(part(st, col(r() < 0.5 ? "#d9d0c4" : "#c9c0d4"), [0, 0, 0], { faceted: true }));
      }
    }
    // crystals also grow out of the crystal island's underside
    if (s.kind === "crystal") {
      for (let k = 0; k < (low ? 3 : 6); k++) {
        const g = buildCrystalGeometry(rngOf(s.seed + k * 7));
        bakeTint(g, CRYSTAL_HUES[k % 2 === 0 ? 0 : 1]);
        const a = (k / 6) * Math.PI * 2 + r();
        const d = s.r * (0.35 + r() * 0.35);
        transform(g, Math.cos(a) * d, -s.depth * (0.25 + (1 - d / s.r) * 0.35), Math.sin(a) * d, r() * 6, 1.2 + r() * 0.8, Math.PI + (r() - 0.5) * 0.6, (r() - 0.5) * 0.6);
        add(g);
      }
    }

    // ── the waterfall: spring pool → a stream across the top → over the lip → falling into mist ──
    const sx = s.spring.x - s.x;
    const sz = s.spring.z - s.z;
    const end = skyStreamEnd(s);
    const ex = end.x - s.x;
    const ez = end.z - s.z;
    const path: THREE.Vector3[] = [];
    const L = Math.hypot(ex - sx, ez - sz);
    const nTop = Math.max(3, Math.ceil(L / 0.9));
    for (let k = 0; k < nTop; k++) {
      const u = k / nTop;
      const x = sx + (ex - sx) * u;
      const z = sz + (ez - sz) * u;
      path.push(V(x, skyLocalHeight(s, x, z) + 0.14, z));
    }
    const dir = new THREE.Vector2(Math.sin(s.fall), Math.cos(s.fall));
    const rm = s.r + SKY_LIP;
    const edgeY = skyLocalHeight(s, ex, ez);
    path.push(V(dir.x * (rm + 0.25), edgeY - 0.2, dir.y * (rm + 0.25)));
    path.push(V(dir.x * (rm + 0.9), edgeY - 1.1, dir.y * (rm + 0.9)));
    const fallLen = 28 + s.depth * 0.35 + r() * 6;
    const fallPts = 12;
    for (let k = 1; k <= fallPts; k++) {
      const u = k / fallPts;
      const d = rm + 1.2 + Math.sqrt(u) * 3.4;
      path.push(V(dir.x * d, edgeY - 1.4 - u * fallLen, dir.y * d));
    }
    const topFrac = L / (L + 3 + fallLen);
    fallParts.push(withConst(waterRibbon(path, (u) => (u < topFrac ? 2.1 : 2.2 + ((u - topFrac) / (1 - topFrac)) * (s.kind === "mountain" ? 3.4 : 2.4)), topFrac), "aIsl", i));
    // the spring: a little round pool
    const pool = new THREE.CircleGeometry(1.7, 10);
    pool.rotateX(-Math.PI / 2);
    pool.translate(sx, skyLocalHeight(s, sx, sz) + 0.12, sz);
    pool.setAttribute("aT", new THREE.Float32BufferAttribute(new Float32Array(pool.attributes.position.count), 1));
    pool.deleteAttribute("normal");
    fallParts.push(withConst(pool.toNonIndexed(), "aIsl", i));
    // mist where it dissolves, and a little splash at the lip
    for (let k = 0; k < (low ? 8 : 14); k++) {
      const u = 0.55 + r() * 0.45;
      const d = rm + 1.2 + Math.sqrt(u) * 3.4;
      sprites.push({ x: dir.x * d + (r() - 0.5) * 3, y: edgeY - 1.4 - u * fallLen, z: dir.y * d + (r() - 0.5) * 3, isl: i, size: 6 + r() * 5, color: white, kind: SPRITE_MIST });
    }
    for (let k = 0; k < 3; k++) sprites.push({ x: dir.x * (rm + 1), y: edgeY - 1 - k * 1.2, z: dir.y * (rm + 1), isl: i, size: 2.5 + r() * 1.5, color: white, kind: SPRITE_MIST });
    // a soft glow round the crystal island
    if (s.kind === "crystal") sprites.push({ x: 0, y: 3, z: 0, isl: i, size: 16, color: CRYSTAL_HUES[1], kind: SPRITE_HALO });
  });
  for (const g of treeCache.values()) g.dispose();
  disposeSpotCaches();
  // ── rope bridges: plank decks + rope rails, hanging between two bobbing islands ──
  for (const br of SKY_BRIDGES) parts.push(...buildBridge(br, low));

  const geo = merge(parts);
  const mat = fxPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, emissive: new THREE.Color("#302c46") }), U, { island: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = "fantasy-sky-islands";

  const fallGeo = merge(fallParts);
  const fallMat = waterfallMaterial(U);
  const falls = new THREE.Mesh(fallGeo, fallMat);
  falls.frustumCulled = false;
  falls.renderOrder = 2;
  falls.name = "fantasy-waterfalls";

  // ── treasure chests: bodies + lids (instanced), and a light beam over each unopened one ──
  const n = SKY_ISLANDS.length;
  const chestMat = fxMaterial(U, { roughness: 0.6, metalness: 0.15 });
  const bodyGeo = chestBody();
  const lidGeo = chestLid();
  const bodies = new THREE.InstancedMesh(bodyGeo, chestMat, n);
  const lids = new THREE.InstancedMesh(lidGeo, chestMat, n);
  const beamGeo = new THREE.CylinderGeometry(0.45, 1.3, 20, 10, 1, true);
  beamGeo.translate(0, 10, 0);
  const beamMat = beamMaterial(U);
  const circles = SKY_SPOTS.filter((sp) => sp.kind === "stones");
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, n + circles.length);
  for (const m of [bodies, lids, beams]) {
    m.frustumCulled = false;
    m.name = "fantasy-sky-chests";
  }
  beams.renderOrder = 3;
  const chestAt = SKY_ISLANDS.map((s) => {
    const lx = s.treasure.x - s.x;
    const lz = s.treasure.z - s.z;
    return { lx, lz, y: skyLocalHeight(s, lx, lz), rot: Math.atan2(s.landing.x - s.treasure.x, s.landing.z - s.treasure.z) };
  });
  const opened = new Set<string>();
  const openAmt = new Float32Array(n);

  const m = new THREE.Matrix4();
  const m2 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const hinge = new THREE.Vector3(0, 0.72, -0.43);
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3(1.25, 1.25, 1.25);
  const one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3(0, 0, 0);
  let lastT = 0;

  // ── the moving parts of the discoveries: one small instanced mesh per kind ──
  const animMeshes = new Map<AnimKind, { mesh: THREE.InstancedMesh; list: (AnimPlacement & { isl: number })[] }>();
  const animGeos: THREE.BufferGeometry[] = [];
  for (const kind of ANIM_KINDS) {
    const list = animPlaced.filter((a) => a.kind === kind);
    if (!list.length) continue;
    const g = animGeometry(kind, low);
    animGeos.push(g);
    const im = new THREE.InstancedMesh(g, chestMat, list.length);
    im.frustumCulled = false;
    im.name = `fantasy-sky-${kind}`;
    if (kind === "rune") for (let k = 0; k < list.length; k++) im.setColorAt(k, RUNE_OFF);
    animMeshes.set(kind, { mesh: im, list });
  }
  const found = new Set<string>();
  const stoodOn = new Set<string>();
  const circleIsl = new Map(circles.map((c) => [c.id, SKY_ISLANDS.findIndex((s) => s.id === c.island)]));
  const circleAt = circles.map((c) => ({ c, lx: c.x - SKY_ISLANDS[circleIsl.get(c.id)!].x, lz: c.z - SKY_ISLANDS[circleIsl.get(c.id)!].z, y: skyBaseY(SKY_ISLANDS[circleIsl.get(c.id)!], c.x, c.z) - SKY_ISLANDS[circleIsl.get(c.id)!].y }));
  const circleDone = (id: string) => found.has(id) || stonesLit(id, stoodOn).done;
  const kidAt = new THREE.Vector3(1e6, 0, 1e6);
  let kidT = 0;

  let triangles = geo.attributes.position.count / 3 + fallGeo.attributes.position.count / 3;
  for (const { mesh: im, list } of animMeshes.values()) triangles += (im.geometry.attributes.position.count / 3) * list.length;
  triangles += n * ((bodyGeo.index ? bodyGeo.index.count : bodyGeo.attributes.position.count) / 3 + (lidGeo.index ? lidGeo.index.count : lidGeo.attributes.position.count) / 3 + 20);

  return {
    mesh,
    falls,
    chests: [bodies, lids, beams, ...[...animMeshes.values()].map((a) => a.mesh)],
    sprites,
    triangles,
    setOpened(ids) {
      opened.clear();
      for (const id of ids) opened.add(id);
    },
    setSpotsFound(ids) {
      found.clear();
      for (const id of ids) found.add(id);
    },
    setKid(x, y, z) {
      kidAt.set(x, y, z);
      // stood on a rune stone? (feet on the island, not flying over it)
      const st = runeStoneAt(x, z);
      if (st) {
        const top = skyTopY(x, z, kidT);
        if (top && Math.abs(y - top.y) < 1.2) stoodOn.add(`${st.spot}#${st.i}`);
      }
      // wander off before finishing a circle and its stones go back to sleep
      for (const c of circles)
        if (!circleDone(c.id) && Math.hypot(x - c.x, z - c.z) > 30)
          for (let i = 0; i < 5; i++) stoodOn.delete(`${c.id}#${i}`);
    },
    puzzleState() {
      return circles.map((c) => {
        const st = stonesLit(c.id, stoodOn);
        return found.has(c.id) ? { id: c.id, lit: st.total, total: st.total, done: true } : { id: c.id, ...st };
      });
    },
    update(t) {
      const dt = Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;
      SKY_ISLANDS.forEach((s, i) => {
        const y = s.y + skyBob(s.id, t);
        U.uIslMat.value[i].makeTranslation(s.x, y, s.z);
        const c = chestAt[i];
        const isOpen = opened.has(s.id);
        // the lid swings open (or snaps shut when reset) smoothly
        openAmt[i] += ((isOpen ? 1 : 0) - openAmt[i]) * Math.min(1, dt * 4 + (dt === 0 ? 1 : 0));
        p.set(s.x + c.lx, y + c.y - 0.05, s.z + c.lz);
        q.setFromEuler(e.set(0, c.rot, 0));
        m.compose(p, q, sc);
        bodies.setMatrixAt(i, m);
        // lid: hinge at the back top edge (local y 0.72, z -0.43), swinging back up to ~110°
        m2.compose(hinge, q2.setFromEuler(e.set(-openAmt[i] * 1.9, 0, 0)), one);
        lids.setMatrixAt(i, m2.premultiply(m));
        if (isOpen) beams.setMatrixAt(i, m.compose(p, q, zero));
        else beams.setMatrixAt(i, m.compose(p, q.identity(), sc.set(1, 1 + Math.sin(t * 1.3 + i) * 0.06, 1)));
        sc.setScalar(1.25);
      });
      // a finished rune circle sends a column of light up from its altar
      circleAt.forEach(({ c, lx, lz, y: cy }, k) => {
        const s = SKY_ISLANDS[circleIsl.get(c.id)!];
        const y = s.y + skyBob(s.id, t);
        const done = circleDone(c.id);
        p.set(s.x + lx, y + cy + 1.2, s.z + lz);
        beams.setMatrixAt(n + k, m.compose(p, q.identity(), done ? sc.set(1.6, 1.4 + Math.sin(t * 3 + k) * 0.1, 1.6) : zero));
        sc.setScalar(1.25);
      });
      bodies.instanceMatrix.needsUpdate = true;
      lids.instanceMatrix.needsUpdate = true;
      beams.instanceMatrix.needsUpdate = true;
      kidT = t;
      // the discoveries' moving parts
      for (const [kind, { mesh: im, list }] of animMeshes) {
        list.forEach((a, k) => {
          const s = SKY_ISLANDS[a.isl];
          const by = skyBob(s.id, t);
          const spotId = a.key.split("#")[0];
          const ph = k * 1.7 + a.x * 0.1;
          let rx = 0;
          let rz = 0;
          let ry = a.rot;
          let sy = a.s;
          let sxz = a.s;
          let dy = 0;
          if (kind === "egg") {
            // wobbles now and then (hidden once it has hatched)
            const w = Math.max(0, Math.sin(t * 0.9 + ph)) ** 3;
            rx = Math.sin(t * 9 + ph) * 0.12 * w;
            rz = Math.cos(t * 7 + ph) * 0.1 * w;
            if (found.has(spotId)) sy = sxz = 0;
          } else if (kind === "baby") {
            // the hatchling peeks out and looks about
            if (!found.has(spotId)) sy = sxz = 0;
            dy = Math.max(0, Math.sin(t * 1.3 + ph)) * 0.25 - 0.1;
            ry += Math.sin(t * 0.8 + ph) * 0.6;
          } else if (kind === "rune") {
            const lit = circleDone(spotId) || stoodOn.has(a.key);
            im.setColorAt(k, lit ? RUNE_ON : RUNE_OFF);
            ry += t * (lit ? 0.6 : 0.1);
          } else if (kind === "bell") {
            rx = Math.sin(t * 1.9 + ph) * 0.12;
          } else if (kind === "swing") {
            rx = Math.sin(t * 1.15 + ph) * 0.38;
          } else if (kind === "spinner") {
            ry = t * 1.2 + ph;
            dy = Math.sin(t * 1.6 + ph) * 0.18;
          } else if (kind === "cloudling") {
            // slow sleepy breathing
            const br = Math.sin(t * 1.1 + ph);
            sy = a.s * (1 + br * 0.05);
            sxz = a.s * (1 - br * 0.025);
          }
          p.set(s.x + a.x, s.y + by + a.y + dy, s.z + a.z);
          q.setFromEuler(e.set(rx, ry, rz, "YXZ"));
          im.setMatrixAt(k, m.compose(p, q, sc.set(sxz, sy, sxz)));
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
      sc.setScalar(1.25);
      e.set(0, 0, 0, "XYZ");
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      fallGeo.dispose();
      fallMat.dispose();
      bodyGeo.dispose();
      lidGeo.dispose();
      chestMat.dispose();
      beamGeo.dispose();
      beamMat.dispose();
      bodies.dispose();
      lids.dispose();
      beams.dispose();
      for (const g of animGeos) g.dispose();
      for (const a of animMeshes.values()) a.mesh.dispose();
    },
  };
}

const RUNE_OFF = new THREE.Color("#2a3448");
const RUNE_ON = new THREE.Color("#5ff4ff");

/** a rope bridge: plank deck + rope rails + end posts, world-positioned, its vertices blending the
 *  two islands' matrices by how far along the bridge they are (so it sags and bobs with both) */
function buildBridge(br: SkyBridge, low: boolean): THREE.BufferGeometry[] {
  const ia = SKY_ISLANDS.findIndex((s) => s.id === br.a);
  const ib = SKY_ISLANDS.findIndex((s) => s.id === br.b);
  const A = SKY_ISLANDS[ia];
  const B = SKY_ISLANDS[ib];
  const dx = br.bx - br.ax;
  const dz = br.bz - br.az;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  const px = -uz;
  const pz = ux;
  const yaw = Math.atan2(ux, uz);
  // base deck height (no bob): skyBridgeY minus the blended bob
  const deckY = (u: number) => skyBridgeY(br, u, 0) - (skyBob(A.id, 0) * (1 - u) + skyBob(B.id, 0) * u);
  const out: THREE.BufferGeometry[] = [];
  /** world-space geometry → the blended island frames; `fixedU` keeps a plank rigid */
  const hang = (g: THREE.BufferGeometry, fixedU?: number) => {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const mixA = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const u = fixedU ?? Math.max(0, Math.min(1, ((pos.getX(i) - br.ax) * ux + (pos.getZ(i) - br.az) * uz) / len));
      mixA[i] = u;
      pos.setXYZ(i, pos.getX(i) - (A.x + (B.x - A.x) * u), pos.getY(i) - (A.y + (B.y - A.y) * u), pos.getZ(i) - (A.z + (B.z - A.z) * u));
    }
    withConst(withConst(g, "aIsl", ia), "aIsl2", ib);
    g.setAttribute("aIslMix", new THREE.BufferAttribute(mixA, 1));
    out.push(g);
  };
  // planks (a few missing gaps would be scary — keep them all, slightly uneven)
  const step = 0.62;
  const nPl = Math.floor(len / step);
  for (let k = 0; k <= nPl; k++) {
    const u = k / nPl;
    const x = br.ax + dx * u;
    const z = br.az + dz * u;
    const y = deckY(u);
    const slope = Math.atan2(deckY(Math.min(1, u + 0.02)) - deckY(Math.max(0, u - 0.02)), len * 0.04);
    const g = new THREE.BoxGeometry(br.half * 2 + 0.3, 0.12, 0.5);
    transform(g, x, y - 0.06, z, yaw + ((k * 7) % 3 - 1) * 0.03, 1, -slope, 0);
    hang(part(g, k % 3 === 0 ? WOOD_DARK : WOOD, [0, 0, 0], { faceted: true }), u);
  }
  // rope rails (hand height) and the ropes the planks hang from
  const railPts = (sd: number, h: number) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      const sag = h > 0.5 ? 0.25 * 4 * u * (1 - u) : 0;
      pts.push(V(br.ax + dx * u + px * sd * (br.half + 0.35), deckY(u) + h - sag, br.az + dz * u + pz * sd * (br.half + 0.35)));
    }
    return pts;
  };
  for (const sd of [-1, 1]) {
    for (const h of low ? [1.0] : [1.0, 0.08]) hang(part(taperTube(railPts(sd, h), { segs: 16, radial: 3, rx: () => 0.05 }), ROPE_C, [0, 0, 0], { faceted: true }));
    for (let k = 1; k < 8; k++) {
      const u = k / 8;
      const x = br.ax + dx * u + px * sd * (br.half + 0.35);
      const z = br.az + dz * u + pz * sd * (br.half + 0.35);
      const top = deckY(u) + 1.0 - 0.25 * 4 * u * (1 - u);
      const g = new THREE.BoxGeometry(0.04, top - deckY(u), 0.04);
      transform(g, x, (top + deckY(u)) / 2, z);
      hang(part(g, ROPE_C, [0, 0, 0]), u);
    }
    // stout end posts on each island
    for (const u of [0, 1]) {
      const x = (u ? br.bx : br.ax) + px * sd * (br.half + 0.45);
      const z = (u ? br.bz : br.az) + pz * sd * (br.half + 0.45);
      const g = new THREE.CylinderGeometry(0.16, 0.2, 1.7, 6);
      transform(g, x, deckY(u) + 0.6, z);
      hang(part(g, WOOD_DARK, [0, 0, 0], { faceted: true }), u);
      const knob = new THREE.IcosahedronGeometry(0.2, 0);
      transform(knob, x, deckY(u) + 1.5, z);
      hang(part(knob, col("#ffd23f"), [0, 0, 0.3], { faceted: true }), u);
    }
  }
  return out;
}
const ROPE_C = col("#d8b27a");

/** the treasure beams: a soft golden column, strongest at the chest, fading upwards and when
 *  the camera is close (so it guides you from afar without washing out the view) */
function beamMaterial(U: FantasyUniforms) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: U.uTime, uGlow: U.uGlow },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying float vH; varying float vNear;
      void main() {
        vH = position.y / 20.0;
        vec4 wp = modelMatrix * instanceMatrix * vec4( position, 1.0 );
        vec4 mvPosition = viewMatrix * wp;
        vNear = smoothstep( 8.0, 30.0, -mvPosition.z );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform float uGlow;
      varying float vH; varying float vNear;
      ${FOG_FACTOR_GLSL}
      void main() {
        float a = ( 1.0 - vH ) * ( 1.0 - vH ) * ( 0.22 + 0.06 * sin( uTime * 2.1 + vH * 8.0 ) + uGlow * 0.15 );
        a *= 0.25 + 0.75 * vNear;
        a *= 1.0 - fantasyFog() * 0.7;
        gl_FragColor = vec4( vec3( 1.0, 0.85, 0.42 ) * a, 1.0 );
      }`,
  });
}

/** a water ribbon along `path` (island local), width w(u); uv.x across, uv.y = distance, aT = 0..1
 *  (remapped so aT = 0.2 is where it tips over the edge: the shader speeds up and dissolves from there) */
function waterRibbon(path: THREE.Vector3[], w: (u: number) => number, topFrac = 0.2): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(path, false, "centripetal");
  const n = 72;
  const len = curve.getLength();
  const pos: number[] = [];
  const uv: number[] = [];
  const at: number[] = [];
  const idx: number[] = [];
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const S = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const lastS = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    curve.getPointAt(u, P);
    curve.getTangentAt(u, T);
    S.crossVectors(T, up);
    if (S.lengthSq() < 1e-6) S.copy(lastS);
    S.normalize();
    lastS.copy(S);
    const hw = w(u) / 2;
    pos.push(P.x - S.x * hw, P.y - S.y * hw, P.z - S.z * hw, P.x + S.x * hw, P.y + S.y * hw, P.z + S.z * hw);
    uv.push(0, u * len, 1, u * len);
    const tt = u < topFrac ? (u / topFrac) * 0.16 : 0.16 + ((u - topFrac) / (1 - topFrac)) * 0.84;
    at.push(tt, tt);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aT", new THREE.Float32BufferAttribute(at, 1));
  g.setIndex(idx);
  return g.toNonIndexed();
}

function waterfallMaterial(U: FantasyUniforms) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: U.uTime, uGlow: U.uGlow, uIslMat: U.uIslMat },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute float aIsl; attribute float aT;
      uniform mat4 uIslMat[${ISL_SLOTS}];
      varying vec2 vUv; varying float vT;
      void main() {
        vUv = uv; vT = aT;
        vec4 wp = uIslMat[ int( aIsl + 0.5 ) ] * vec4( position, 1.0 );
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform float uGlow;
      varying vec2 vUv; varying float vT;
      ${HASH_GLSL}
      ${FOG_FACTOR_GLSL}
      void main() {
        float across = vUv.x;
        float d = vUv.y;
        float edge = smoothstep( 0.0, 0.2, across ) * smoothstep( 1.0, 0.8, across );
        float falling = smoothstep( 0.12, 0.2, vT );
        float speed = mix( 1.5, 9.0, falling );
        float s1 = fnoise( vec2( across * 10.0, d * 0.3 - uTime * speed * 0.3 ) );
        float s2 = fnoise( vec2( across * 26.0 + 3.1, d * 0.9 - uTime * speed * 0.9 ) );
        float foam = smoothstep( 0.5, 0.9, s1 * 0.6 + s2 * 0.55 );
        vec3 deep = vec3( 0.16, 0.55, 0.9 );
        vec3 light = vec3( 0.85, 0.97, 1.0 );
        vec3 col = mix( deep, light, 0.3 + 0.7 * foam );
        col += vec3( 0.2, 0.9, 1.0 ) * uGlow * ( 0.25 + foam * 0.6 );
        float a = edge * ( 0.7 + 0.3 * foam );
        // dissolve into mist on the way down
        float dissolve = smoothstep( 0.45, 1.0, vT );
        a *= 1.0 - smoothstep( s2 * 0.6 + 0.1, s2 * 0.6 + 0.5, dissolve );
        a *= 1.0 - fantasyFog();
        gl_FragColor = vec4( col, a * 0.94 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
