// Procedural geometry for the underwater world, in the fantasy kit's vertex layout
// (position, normal, color, aFx = [tint, motion, glow]; see ../fantasy/geo.ts):
// coral (staghorn, brain, table, sea fans, tube sponges, anemones), sea grass, kelp, starfish,
// urchins, giant clams, fish, mantas, turtles, orcas (with markings), the sunken galleon with its
// treasure chest, and the sunken temple. Vertex colours may go above 1 (brighter than the
// instance tint) — e.g. pale coral tips. Everything faces +Z and sits on y = 0.
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { col, displace, merge, mix, part, taperTube, transform, type Fx } from "../fantasy/geo";
import { noise3, rngOf, smoothstep, type Rng } from "../fantasy/noise";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const tmpC = new THREE.Color();
const grey = (k: number) => tmpC.setRGB(k, k, k);

/** turn a closed surface inside out (for the insides of tubes and bowls) */
function flipInside(g: THREE.BufferGeometry) {
  const geo = g.index ? g.toNonIndexed() : g;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 3) {
    const x = pos.getX(i + 1);
    const y = pos.getY(i + 1);
    const z = pos.getZ(i + 1);
    pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
    pos.setXYZ(i + 2, x, y, z);
  }
  geo.deleteAttribute("normal");
  geo.computeVertexNormals();
  return geo;
}

// ── coral ──

/** staghorn / branching coral: three limbs forking, rounded pale tips that glow */
export function staghornGeometry(seed = 31): THREE.BufferGeometry {
  const r = rngOf(seed);
  const parts: THREE.BufferGeometry[] = [];
  const up = V(0, 1, 0);
  const grow = (from: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    const bend = V((r() - 0.5) * 0.3, 0.15, (r() - 0.5) * 0.3);
    const mid = from.clone().addScaledVector(dir, len * 0.5).addScaledVector(bend, len * 0.3);
    const end = from.clone().addScaledVector(dir, len).addScaledVector(up, len * 0.12);
    const tube = taperTube([from, mid, end], { segs: 2, radial: 4, rx: (t) => rad * (1 - t * 0.3) });
    parts.push(
      part(
        tube,
        (p) => grey(0.74 + 0.36 * smoothstep(0, 1.6, p.y) + (depth === 0 ? 0.1 : 0)),
        (p) => [1, 0.02 + p.y * 0.05, depth === 0 ? smoothstep(0.2, 1, p.distanceTo(from) / len) * 0.9 : 0],
      ),
    );
    if (depth > 0) {
      for (let i = 0; i < 2; i++) {
        const a = i * Math.PI + r() * 1.2;
        const d = dir.clone().multiplyScalar(0.7).add(V(Math.cos(a) * 0.55, 0.45 + r() * 0.3, Math.sin(a) * 0.55)).normalize();
        grow(end.clone().addScaledVector(dir, -len * 0.05), d, len * (0.62 + r() * 0.2), rad * 0.72, depth - 1);
      }
    } else {
      // a pale, rounded, glowing tip
      const tip = new THREE.SphereGeometry(rad * 0.8, 4, 2);
      tip.translate(end.x, end.y, end.z);
      parts.push(part(tip, grey(1.35), [1, 0.02 + end.y * 0.05, 1]));
    }
  };
  // three or four limbs from the base
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r() * 0.6;
    const d = V(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5).normalize();
    grow(V(Math.cos(a) * 0.08, -0.1, Math.sin(a) * 0.08), d, 0.5 + r() * 0.2, 0.1, i === 3 ? 0 : 1);
  }
  return merge(parts);
}

/** brain coral: a lumpy dome (the meandering grooves are drawn by the "brain" pattern) */
export function brainGeometry(): THREE.BufferGeometry {
  const g = displace(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.62), (p) => {
    const k = 1 + (noise3(p.x * 1.4 + 2, p.y * 1.4, p.z * 1.4, 5) - 0.5) * 0.35;
    p.multiplyScalar(k);
    p.y = p.y * 0.72 - 0.18;
  });
  return part(g, (p) => grey(0.75 + 0.35 * smoothstep(-0.1, 0.6, p.y)), [1, 0, 0]);
}

/** table coral: a wide wavy plate on a stalk, with a smaller tier below */
export function tableGeometry(): THREE.BufferGeometry {
  const plate = (rad: number, y: number, ox: number, oz: number, seed: number) => {
    const g = displace(new THREE.CylinderGeometry(rad, rad * 0.88, 0.1, 16, 1), (p) => {
      const a = Math.atan2(p.z, p.x);
      const rr = Math.hypot(p.x, p.z);
      const w = 1 + Math.sin(a * 5 + seed) * 0.08 + (noise3(p.x * 2, 0, p.z * 2, seed) - 0.5) * 0.2;
      p.x *= w;
      p.z *= w;
      p.y += (rr / rad) * (rr / rad) * 0.08 + Math.pow(rr / rad, 4) * 0.2 + Math.sin(a * 3 + seed) * 0.05 * (rr / rad);
    });
    transform(g, ox, y, oz);
    return part(g, (p, n) => grey(n.y > 0.3 ? 0.72 + 0.3 * smoothstep(rad * 0.6, rad, Math.hypot(p.x - ox, p.z - oz)) : 0.45), [1, 0.01, 0.4]);
  };
  const stalk = new THREE.CylinderGeometry(0.1, 0.2, 0.62, 6);
  stalk.translate(0, 0.25, 0);
  return merge([plate(1, 0.58, 0, 0, 1), plate(0.55, 0.3, 0.45, 0.3, 4), part(stalk, grey(0.5), [0.7, 0, 0])]);
}

/** a sea fan: a flat lacy disc on a short stem (the lace is cut by the "lace" pattern) */
export function fanGeometry(): THREE.BufferGeometry {
  const disc = new THREE.CircleGeometry(1, 18);
  disc.scale(0.9, 0.75, 1);
  disc.translate(0, 0.8, 0);
  const stem = new THREE.CylinderGeometry(0.035, 0.06, 0.5, 5);
  stem.translate(0, 0.2, 0);
  return merge([
    part(disc, (p) => grey(0.8 + 0.4 * smoothstep(0.2, 1.4, p.y)), (p) => [1, p.y * 0.07, smoothstep(0.9, 1.5, p.y) * 0.6]),
    part(stem, grey(0.45), [0.9, 0, 0]),
  ]);
}

/** tube sponges: three open tubes, dark inside, with glowing lips */
export function tubeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tubes: [number, number, number, number][] = [
    [0, 0, 0.2, 1.1],
    [0.3, 0.12, 0.15, 0.75],
    [-0.2, 0.25, 0.13, 0.55],
  ];
  for (const [x, z, rad, h] of tubes) {
    const lean = (x + z) * 0.25;
    const outer = new THREE.CylinderGeometry(rad, rad * 0.8, h, 8, 1, true);
    outer.translate(0, h / 2, 0);
    const inner = flipInside(new THREE.CylinderGeometry(rad * 0.78, rad * 0.6, h * 0.96, 8, 1, true));
    inner.translate(0, h / 2 + h * 0.02, 0);
    const lip = new THREE.RingGeometry(rad * 0.78, rad, 8, 1);
    lip.rotateX(-Math.PI / 2);
    lip.translate(0, h, 0);
    const bottom = new THREE.CircleGeometry(rad * 0.62, 8);
    bottom.rotateX(-Math.PI / 2);
    bottom.translate(0, h * 0.25, 0);
    for (const [g, c, glow] of [
      [outer, 0.85, 0],
      [inner, 0.28, 0],
      [lip, 1.3, 1],
      [bottom, 0.15, 0],
    ] as const) {
      transform(g, x, 0, z, 0, 1, lean * 0.5, -lean);
      parts.push(part(g, (p) => grey(c * (g === outer ? 0.7 + 0.4 * smoothstep(0, h, p.y) : 1)), (p) => [1, p.y * 0.04, glow]));
    }
  }
  return merge(parts);
}

/** an anemone: a short column crowned with swaying tentacles (tips glow) */
export function anemoneGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const colG = new THREE.CylinderGeometry(0.3, 0.36, 0.34, 9, 1, true);
  colG.translate(0, 0.14, 0);
  parts.push(part(colG, grey(0.55), [0.6, 0, 0]));
  const disc = new THREE.CircleGeometry(0.3, 9);
  disc.rotateX(-Math.PI / 2);
  disc.translate(0, 0.31, 0);
  parts.push(part(disc, grey(0.7), [1, 0, 0.2]));
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i % 2) * 0.2;
    const ring = i % 2 ? 0.22 : 0.29;
    const len = i % 2 ? 0.55 : 0.7;
    const out = i % 2 ? 0.25 : 0.45;
    const base = V(Math.cos(a) * ring, 0.3, Math.sin(a) * ring);
    const mid = V(Math.cos(a) * (ring + out * 0.5), 0.3 + len * 0.6, Math.sin(a) * (ring + out * 0.5));
    const tip = V(Math.cos(a) * (ring + out), 0.3 + len * 0.85, Math.sin(a) * (ring + out));
    const t = taperTube([base, mid, tip], { segs: 2, radial: 3, rx: (u) => 0.06 * (1 - u * 0.75) });
    parts.push(part(t, (p) => grey(0.85 + 0.55 * smoothstep(0.35, 0.3 + len * 0.85, p.y)), (p) => [1, smoothstep(0.3, 1, p.y) * 0.22, smoothstep(0.55, 0.3 + len * 0.85, p.y)]));
  }
  return merge(parts);
}

/** a sea grass clump: six curved ribbon blades */
export function seagrassGeometry(seed = 5): THREE.BufferGeometry {
  const r = rngOf(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let b = 0; b < 6; b++) {
    const a = (b / 6) * Math.PI * 2 + r();
    const h = 0.6 + r() * 0.5;
    const lean = 0.15 + r() * 0.25;
    const w = 0.05 + r() * 0.02;
    const segs = 3;
    const pos: number[] = [];
    const idx: number[] = [];
    const ox = Math.cos(a) * 0.12;
    const oz = Math.sin(a) * 0.12;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const y = t * h;
      const off = lean * t * t;
      const cx = ox + Math.cos(a) * off;
      const cz = oz + Math.sin(a) * off;
      const ww = w * (1 - t * 0.7);
      // ribbon across (perpendicular to lean direction)
      pos.push(cx - Math.sin(a) * ww, y, cz + Math.cos(a) * ww, cx + Math.sin(a) * ww, y, cz - Math.cos(a) * ww);
      if (i < segs) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(part(g, (p) => grey(0.5 + 0.7 * smoothstep(0, 1, p.y)), (p) => [1, p.y * p.y * 0.35, 0]));
  }
  return merge(parts);
}

/** a giant kelp strand ~12 m tall: a thin wavy stipe with long ruffled golden-olive blades that
 *  float upward on little bladders, spreading into a canopy near the top (bladders glow at twilight) */
export function kelpGeometry(seed = 9): THREE.BufferGeometry {
  const r = rngOf(seed);
  const H = 12;
  const parts: THREE.BufferGeometry[] = [];
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push(V(Math.sin(t * 5 + seed) * 0.4 * t, t * H, Math.cos(t * 4 + seed) * 0.35 * t));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const sway = (y: number) => Math.pow(Math.max(0, y) / H, 1.3) * 1.7;
  const stipe = taperTube(pts, { segs: 8, radial: 3, rx: (t) => 0.045 * (1 - t * 0.4) });
  parts.push(part(stipe, (p) => grey(0.45 + 0.3 * (p.y / H)), (p) => [1, sway(p.y), 0]));
  const n = 12;
  for (let i = 0; i < n; i++) {
    const t = 0.1 + (i / (n - 1)) * 0.88;
    const at = curve.getPointAt(t);
    const top = t > 0.8;
    const a = i * 2.39996 + r() * 0.4;
    const len = (top ? 2.2 : 1.5) + r() * 0.7;
    const wid = 0.2 + r() * 0.08;
    const out = V(Math.cos(a), 0, Math.sin(a));
    const dir = out.clone().multiplyScalar(0.55).add(V(0, top ? 0.35 : 0.85, 0)).normalize();
    const pos: number[] = [];
    const idx: number[] = [];
    const segs = 4;
    const c = at.clone();
    const d = dir.clone();
    for (let k = 0; k <= segs; k++) {
      const u = k / segs;
      const w = wid * Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * u * 0.95)), 0.6);
      const perp = V(-d.z, 0, d.x).normalize();
      const ripple = (k % 2 ? 1 : -1) * 0.08 * u;
      pos.push(c.x - perp.x * w, c.y + ripple, c.z - perp.z * w, c.x + perp.x * w, c.y - ripple, c.z + perp.z * w);
      if (k < segs) idx.push(k * 2, k * 2 + 2, k * 2 + 1, k * 2 + 1, k * 2 + 2, k * 2 + 3);
      // the blade streams up, then curls out and over
      c.addScaledVector(d, len / segs);
      d.addScaledVector(out, 0.28).addScaledVector(V(0, -1, 0), 0.22).normalize();
    }
    const blade = new THREE.BufferGeometry();
    blade.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    blade.setIndex(idx);
    blade.computeVertexNormals();
    const y0 = at.y;
    parts.push(part(blade, (p) => grey(0.62 + 0.6 * smoothstep(0, len * 0.9, p.distanceTo(at)) + 0.15 * (y0 / H)), (p) => [1, sway(p.y) + 0.1 + 0.12 * smoothstep(0, len, p.distanceTo(at)), smoothstep(len * 0.55, len, p.distanceTo(at)) * 0.55]));
    if (i % 2 === 0) {
      const bulb = new THREE.OctahedronGeometry(0.075, 0);
      bulb.scale(1, 1.4, 1);
      bulb.translate(at.x + dir.x * 0.08, at.y + 0.02, at.z + dir.z * 0.08);
      parts.push(part(bulb, col("#e8c85a"), (p) => [0.2, sway(p.y), 1]));
    }
  }
  return merge(parts);
}

/** a starfish: five puffy arms */
export function starfishGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const outline: [number, number][] = [];
  const N = 30;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const arm = Math.pow(0.5 + 0.5 * Math.cos(a * 5), 2.2);
    const rr = 0.16 + 0.42 * arm;
    outline.push([Math.sin(a) * rr, Math.cos(a) * rr]);
  }
  const top = 0.1;
  for (let i = 0; i < N; i++) {
    const [x0, z0] = outline[i];
    const [x1, z1] = outline[(i + 1) % N];
    const m0: [number, number, number] = [x0 * 0.5, top * 0.8, z0 * 0.5];
    const m1: [number, number, number] = [x1 * 0.5, top * 0.8, z1 * 0.5];
    // centre -> mid ring
    pos.push(0, top, 0, ...m1, ...m0);
    // mid ring -> outline
    pos.push(...m0, ...m1, x1, 0.03, z1, ...m0, x1, 0.03, z1, x0, 0.03, z0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return part(g, (p) => grey(0.8 + p.y * 3), [1, 0, 0]);
}

/** a sea urchin: a dark ball bristling with spines (tips glow at twilight) */
export function urchinGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.IcosahedronGeometry(0.22, 0);
  body.scale(1, 0.8, 1);
  body.translate(0, 0.14, 0);
  parts.push(part(body, grey(0.7), [1, 0, 0], { faceted: true }));
  const dirs = new THREE.IcosahedronGeometry(1, 0).attributes.position as THREE.BufferAttribute;
  const seen = new Set<string>();
  const q = new THREE.Quaternion();
  const d = new THREE.Vector3();
  for (let i = 0; i < dirs.count; i++) {
    d.fromBufferAttribute(dirs, i).normalize();
    const key = `${d.x.toFixed(2)},${d.y.toFixed(2)},${d.z.toFixed(2)}`;
    if (seen.has(key) || d.y < -0.6) continue;
    seen.add(key);
    const spine = new THREE.ConeGeometry(0.02, 0.42, 3, 1);
    spine.translate(0, 0.21 + 0.16, 0);
    q.setFromUnitVectors(V(0, 1, 0), d);
    spine.applyQuaternion(q);
    spine.translate(0, 0.14, 0);
    parts.push(part(spine, (p) => grey(0.6 + 0.8 * smoothstep(0.3, 0.6, p.distanceTo(V(0, 0.14, 0)))), (p) => [1, 0, smoothstep(0.35, 0.58, p.distanceTo(V(0, 0.14, 0)))]));
  }
  return merge(parts);
}

// ── giant clams + pearls ──

/** a scallop-style shell (a fan of ribs radiating from the hinge at the local origin, opening
 *  toward +z); `up` = +1 domed up (the lid), -1 a bowl (the base) */
function scallop(up: number): THREE.BufferGeometry {
  const nT = 12;
  const nU = 4;
  const pos: number[] = [];
  const P = (i: number, j: number) => {
    const th = (i / nT - 0.5) * Math.PI * 0.86;
    const u = j / nU;
    const R = 1.12 * (1 + 0.035 * Math.cos(th * 20));
    const rr = u * R;
    const rib = 0.035 * Math.abs(Math.cos(th * 10)) * u;
    const depth = 0.3 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.92 + 0.04)), 0.8) * Math.pow(Math.cos(th * 0.9), 0.6);
    return [Math.sin(th) * rr * 0.9, up * (depth + rib), Math.cos(th) * rr];
  };
  for (let i = 0; i < nT; i++)
    for (let j = 0; j < nU; j++) {
      const a = P(i, j);
      const b = P(i + 1, j);
      const c = P(i, j + 1);
      const d = P(i + 1, j + 1);
      const tris = up > 0 ? [a, c, b, b, c, d] : [a, b, c, b, d, c];
      for (const p of tris) pos.push(...p);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** the clam's bottom shell: a ribbed scallop bowl with a vivid spotted mantle and a pink cushion
 *  for the pearl; hinge at the back (local z = -0.55), rim at y = 0.3 */
export function clamBaseGeometry(): THREE.BufferGeometry {
  const shell = scallop(-1);
  shell.translate(0, 0.3, -0.55);
  const outer = part(shell, (p) => grey(0.62 + 0.5 * smoothstep(0.0, 0.3, p.y)), [0.6, 0, 0]);
  const inside = part(flipInside(shell.clone()), col("#f7e4ec"), [0.1, 0, 0.15]);
  // the mantle: a wavy frill just inside the rim, blue-violet with bright spots
  const pts: number[] = [];
  const n = 18;
  for (let i = 0; i < n; i++) {
    for (const [k, h] of [
      [i, 0],
      [i + 1, 0],
      [i, 1],
      [i + 1, 0],
      [i + 1, 1],
      [i, 1],
    ] as const) {
      const th = (k / n - 0.5) * Math.PI * 0.8;
      const rr = 0.95 - h * 0.14;
      pts.push(Math.sin(th) * rr * 0.9, 0.28 + h * 0.04 + Math.sin(k * 1.9) * 0.03, -0.55 + Math.cos(th) * rr);
    }
  }
  const frill = new THREE.BufferGeometry();
  frill.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  frill.computeVertexNormals();
  const man = part(
    frill,
    (p) => {
      const a = Math.atan2(p.x, p.z + 0.55);
      const c = mix(col("#18b8ff"), col("#9a3cff"), 0.5 + 0.5 * Math.sin(a * 5));
      return noise3(p.x * 16, p.y * 16, p.z * 16, 4) > 0.64 ? c.multiplyScalar(1.7) : c;
    },
    [0.15, 0, 0.9],
  );
  const cushion = new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  cushion.scale(0.42, 0.1, 0.34);
  cushion.translate(0, 0.16, 0.02);
  const cush = part(cushion, col("#ff8fc0"), [0.1, 0, 0.5]);
  return merge([outer, inside, man, cush]);
}

/** the clam's lid: the same ribbed scallop, domed up, hinged at the local origin */
export function clamLidGeometry(): THREE.BufferGeometry {
  const shell = scallop(1);
  const outer = part(shell, (p) => grey(0.62 + 0.5 * smoothstep(0.02, 0.3, p.y)), [0.6, 0, 0]);
  const inside = part(flipInside(shell.clone()), col("#f7e4ec"), [0.1, 0, 0.15]);
  return merge([outer, inside]);
}

// ── fish ──

/** one fish for every species (species shape = instance scale; colours = the "fish" pattern).
 *  Nose at +z 0.5, tail fin to -0.78. aFx.x = 1 on fins, aFx.y = pectoral flutter. */
export function fishGeometry(): THREE.BufferGeometry {
  const rings = 7;
  const radial = 6;
  const pos: number[] = [];
  const fx: number[] = [];
  const ring: THREE.Vector3[][] = [];
  const hAt = (t: number) => 0.028 + 0.148 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.85);
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1); // 0 tail stock .. 1 near the nose
    const z = -0.5 + t * 0.94;
    const h = hAt(Math.min(0.97, t));
    const w = h * 0.42;
    const row: THREE.Vector3[] = [];
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const yb = Math.cos(a) * h * (Math.cos(a) < 0 ? 0.9 : 1);
      row.push(V(Math.sin(a) * w, yb, z));
    }
    ring.push(row);
  }
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, f: [number, number, number]) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    fx.push(...f, ...f, ...f);
  };
  for (let i = 0; i + 1 < rings; i++)
    for (let k = 0; k < radial; k++) {
      const a = ring[i][k];
      const b = ring[i][(k + 1) % radial];
      const c = ring[i + 1][k];
      const d = ring[i + 1][(k + 1) % radial];
      tri(a, c, b, [0, 0, 0]);
      tri(b, c, d, [0, 0, 0]);
    }
  // nose and tail-stock caps
  const nose = V(0, 0.01, 0.5);
  const last = ring[rings - 1];
  for (let k = 0; k < radial; k++) tri(last[k], nose, last[(k + 1) % radial], [0, 0, 0]);
  const stock = V(0, 0, -0.52);
  for (let k = 0; k < radial; k++) tri(ring[0][(k + 1) % radial], stock, ring[0][k], [0, 0, 0]);
  const bodyEnd = pos.length;
  const F: [number, number, number] = [1, 0, 0];
  // forked tail fin
  const bt = V(0, 0.03, -0.5);
  const bb = V(0, -0.03, -0.5);
  const tt = V(0, 0.21, -0.8);
  const notch = V(0, 0, -0.66);
  const tb = V(0, -0.21, -0.8);
  tri(bt, tt, notch, F);
  tri(bt, notch, bb, F);
  tri(bb, notch, tb, F);
  // dorsal fin: a sail along the back
  const dz = [0.22, 0.08, -0.08, -0.24, -0.4];
  for (let i = 0; i + 1 < dz.length; i++) {
    const z0 = dz[i];
    const z1 = dz[i + 1];
    const tH = (z: number) => hAt((z + 0.5) / 0.94);
    const up0 = 0.1 * Math.sin(((i + 0.5) / (dz.length - 1)) * Math.PI) + 0.02;
    const up1 = 0.1 * Math.sin(((i + 1.5) / (dz.length - 1)) * Math.PI) + 0.02;
    const a = V(0, tH(z0) * 0.95, z0);
    const b = V(0, tH(z1) * 0.95, z1);
    tri(a, V(0, tH(z0) + up0, z0 - 0.04), b, F);
    tri(b, V(0, tH(z0) + up0, z0 - 0.04), V(0, tH(z1) + up1, z1 - 0.04), F);
  }
  // anal fin
  tri(V(0, -0.1, -0.12), V(0, -0.2, -0.3), V(0, -0.06, -0.38), F);
  // pectoral fins (flutter)
  for (const s of [-1, 1]) {
    const root = V(s * 0.055, -0.03, 0.2);
    tri(root, V(s * 0.13, -0.06, 0.06), V(s * 0.06, -0.07, 0.14), [1, 1, 0]);
  }
  // body smooth-shaded (welded), fins flat
  const mk = (p: number[], f: number[], smooth: boolean) => {
    let g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    if (smooth) {
      g = mergeVertices(g, 1e-5);
      g.computeVertexNormals();
      g = g.toNonIndexed();
    } else g.computeVertexNormals();
    const n = g.attributes.position.count;
    g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    g.setAttribute("aFx", new THREE.Float32BufferAttribute(smooth ? new Float32Array(n * 3) : f, 3));
    return g;
  };
  const g = mergeGeometries([mk(pos.slice(0, bodyEnd), [], true), mk(pos.slice(bodyEnd), fx.slice(bodyEnd), false)], false)!;
  g.computeBoundingSphere();
  return g;
}

/** instance scale (width, height, length) per species — shape from one geometry */
export const FISH_SHAPE: [number, number, number][] = [
  [1.15, 1.05, 0.85], // clown
  [0.85, 1.5, 1.0], // blue tang
  [0.85, 1.65, 0.9], // yellow tang
  [0.9, 0.95, 1.0], // anthias
  [0.8, 0.6, 1.25], // sardine
  [1.1, 1.1, 1.0], // parrotfish
  [1.35, 1.05, 1.0], // grouper
  [0.7, 1.8, 0.78], // butterflyfish (a tall yellow disc)
  [0.75, 1.75, 0.95], // emperor angelfish
  [0.9, 1.25, 1.15], // silver jack
];

/** a cheap fish (~35 triangles, same frame and fins as fishGeometry) for bait balls and the big
 *  anthias clouds: at a few pixels long the extra rings of the reef fish aren't seen */
export function smallFishGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const fx: number[] = [];
  const tri = (a: number[], b: number[], c: number[], f: [number, number, number]) => {
    pos.push(...a, ...b, ...c);
    fx.push(...f, ...f, ...f);
  };
  const B: [number, number, number] = [0, 0, 0];
  const F: [number, number, number] = [1, 0, 0];
  const zs = [-0.5, -0.18, 0.14, 0.38];
  const hs = [0.035, 0.15, 0.17, 0.11];
  const ring = zs.map((z, i) => [0, 1, 2, 3].map((k) => {
    const a = (k / 4) * Math.PI * 2;
    return [Math.sin(a) * hs[i] * 0.42, Math.cos(a) * hs[i], z];
  }));
  for (let i = 0; i + 1 < ring.length; i++)
    for (let k = 0; k < 4; k++) {
      const a = ring[i][k];
      const b = ring[i][(k + 1) % 4];
      const c = ring[i + 1][k];
      const d = ring[i + 1][(k + 1) % 4];
      tri(a, c, b, B);
      tri(b, c, d, B);
    }
  const last = ring[ring.length - 1];
  for (let k = 0; k < 4; k++) tri(last[k], [0, 0.01, 0.5], last[(k + 1) % 4], B);
  for (let k = 0; k < 4; k++) tri(ring[0][(k + 1) % 4], [0, 0, -0.52], ring[0][k], B);
  // forked tail, dorsal sail (both sides so they never vanish edge-on... the fins are flat)
  tri([0, 0.03, -0.5], [0, 0.21, -0.8], [0, 0, -0.64], F);
  tri([0, -0.03, -0.5], [0, 0, -0.64], [0, -0.21, -0.8], F);
  tri([0, 0.15, 0.1], [0, 0.24, -0.12], [0, 0.12, -0.28], F);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.setAttribute("aFx", new THREE.Float32BufferAttribute(fx, 3));
  g.computeBoundingSphere();
  return g;
}

// ── more reef life (streamed with the coral: all their motion is in the shader) ──

/** a cauliflower / finger coral bush: a knobbly clump of fat fingers with pale glowing tips */
export function bushGeometry(seed = 17): THREE.BufferGeometry {
  const r = rngOf(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.5;
    const rr = i === 0 ? 0.02 : 0.3 + r() * 0.14;
    const h = (0.42 + r() * 0.32) * (i === 0 ? 1.35 : 1);
    const base = V(Math.cos(a) * rr * 0.45, -0.06, Math.sin(a) * rr * 0.45);
    const tip = V(Math.cos(a) * rr, h, Math.sin(a) * rr);
    const t = taperTube([base, tip], { segs: 1, radial: 4, rx: (u) => 0.16 * (1 - u * 0.3) });
    parts.push(part(t, (p) => grey(0.72 + 0.38 * smoothstep(0, h, p.y)), (p) => [1, 0.01 + p.y * 0.03, 0], { faceted: true }));
    const cap = new THREE.OctahedronGeometry(0.15, 0);
    cap.scale(1, 0.8, 1);
    cap.translate(tip.x, tip.y, tip.z);
    parts.push(part(cap, grey(1.3), [1, 0.01 + h * 0.03, 1], { faceted: true }));
  }
  return merge(parts);
}

/** a seahorse (~0.6 m tall, snout toward +z): a curled tail, a pot belly, a crown and a little
 *  back fin; bobs gently in the sea grass */
export function seahorseGeometry(): THREE.BufferGeometry {
  const k = 1.1;
  const pts = [
    V(0, 0.05, -0.02),
    V(0, 0.0, 0.05),
    V(0, 0.06, 0.1),
    V(0, 0.13, 0.05),
    V(0, 0.2, -0.03),
    V(0, 0.33, -0.02),
    V(0, 0.45, 0.03),
    V(0, 0.54, 0.01),
  ].map((p) => p.multiplyScalar(k));
  const parts: THREE.BufferGeometry[] = [];
  const body = taperTube(pts, { segs: 8, radial: 4, rx: (t) => (0.012 + 0.062 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.25) / 0.72))), 0.8)) * k });
  parts.push(part(body, (p) => grey(0.8 + 0.3 * smoothstep(0.1, 0.5, p.y)), (p) => [1, 0.03 + p.y * 0.04, 0], { faceted: true }));
  const snout = taperTube([V(0, 0.585, 0.03).multiplyScalar(k), V(0, 0.57, 0.17).multiplyScalar(k)], { segs: 1, radial: 4, rx: (u) => (0.028 - u * 0.01) * k });
  parts.push(part(snout, grey(0.95), [1, 0.06, 0], { faceted: true }));
  const head = new THREE.OctahedronGeometry(0.06 * k, 0);
  head.scale(1, 1.1, 1.2);
  head.translate(0, 0.6 * k, 0.02 * k);
  parts.push(part(head, grey(1.0), [1, 0.06, 0], { faceted: true }));
  // crown and back fin (both windings: they're flat)
  const fin = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...b.toArray()], 3));
    g.computeVertexNormals();
    return part(g, grey(1.25), [1, 0.05, 0.5]);
  };
  parts.push(fin(V(0, 0.3, -0.06).multiplyScalar(k), V(0, 0.42, -0.12).multiplyScalar(k), V(0, 0.2, -0.1).multiplyScalar(k)));
  parts.push(fin(V(0, 0.64, 0).multiplyScalar(k), V(0, 0.71, -0.03).multiplyScalar(k), V(0, 0.64, -0.05).multiplyScalar(k)));
  for (const s of [-1, 1]) {
    const eye = new THREE.OctahedronGeometry(0.018 * k, 0);
    eye.translate(s * 0.045 * k, 0.615 * k, 0.05 * k);
    parts.push(part(eye, col("#101018"), [0, 0.06, 0]));
  }
  return merge(parts);
}

/** a rocky hole's rim (untinted coralline rock) for the things that live in holes */
function holeRim(r: number, tube: number): THREE.BufferGeometry {
  const t = new THREE.TorusGeometry(r, tube, 3, 7);
  t.rotateX(Math.PI / 2);
  t.scale(1, 0.7, 1);
  t.translate(0, tube * 0.3, 0);
  return part(t, (p) => mix(col("#b98ac8"), col("#e7a0b8"), noise3(p.x * 4, p.y * 4, p.z * 4, 12)), [0, 0, 0], { faceted: true, faceColor: true });
}

/** an octopus peeking out of its hole: a big round head with goggle eyes, arms curling over the
 *  rim (the whole body rises and sinks: the "peek" motion; the rim stays put) */
export function octopusGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [holeRim(0.5, 0.15)];
  const mantle = new THREE.IcosahedronGeometry(1, 1);
  mantle.scale(0.36, 0.44, 0.4);
  mantle.rotateX(-0.35);
  mantle.translate(0, 0.62, -0.08);
  parts.push(part(mantle, (p) => grey(0.82 + 0.35 * smoothstep(0.4, 1.0, p.y)), (p) => [1, 0.02 + Math.max(0, p.y - 0.4) * 0.05, 0], { faceted: true }));
  for (const s of [-1, 1]) {
    const eye = new THREE.OctahedronGeometry(0.1, 0);
    eye.translate(s * 0.2, 0.46, 0.24);
    parts.push(part(eye, col("#fff8e8"), [0.5, 0.02, 0.2], { faceted: true }));
    const pupil = new THREE.OctahedronGeometry(0.05, 0);
    pupil.scale(1.2, 0.6, 1);
    pupil.translate(s * 0.22, 0.46, 0.32);
    parts.push(part(pupil, col("#15101a"), [0.5, 0.02, 0]));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const arm = taperTube([V(c * 0.18, 0.34, sn * 0.18), V(c * 0.5, 0.22, sn * 0.5), V(c * 0.78, 0.1, sn * 0.78), V(c * 0.86, 0.26, sn * 0.86)], {
      segs: 3,
      radial: 3,
      rx: (u) => 0.1 * (1 - u * 0.7),
    });
    parts.push(part(arm, (p) => grey(0.8 + 0.35 * smoothstep(0.3, 0.9, Math.hypot(p.x, p.z))), (p) => [1, 0.03 + Math.hypot(p.x, p.z) * 0.12, 0], { faceted: true }));
  }
  return merge(parts);
}

/** a moray eel reaching up out of its hole, mouth open (spotted; sways, peeks in and out) */
export function eelGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [holeRim(0.3, 0.1)];
  const pts = [V(0, -0.3, 0), V(0, 0.35, 0.02), V(0, 0.78, 0.12), V(0, 0.98, 0.32)];
  const spots = (p: THREE.Vector3) => mix(col("#8ccf46"), col("#f2e24a"), 0.35).lerp(col("#2b4a1e"), noise3(p.x * 14, p.y * 14, p.z * 14, 21) > 0.62 ? 0.7 : 0);
  const body = taperTube(pts, { segs: 5, radial: 5, rx: (t) => 0.1 + t * 0.03, ry: (t) => 0.12 + t * 0.04 });
  parts.push(part(body, spots, (p) => [0.6, 0.012 + Math.pow(Math.max(0, p.y), 1.5) * 0.09, 0], { faceted: true }));
  const jaw = (up: number) => {
    const j = new THREE.OctahedronGeometry(1, 0);
    j.scale(0.1, 0.05, 0.17);
    j.rotateX(up * 0.25);
    j.translate(0, 1.0 + up * 0.035, 0.44);
    return part(j, up > 0 ? spots(V(0, 1, 0.4)) : col("#e8d870"), [0.6, 0.1, 0], { faceted: true });
  };
  parts.push(jaw(1), jaw(-1));
  for (const s of [-1, 1]) {
    const eye = new THREE.OctahedronGeometry(0.03, 0);
    eye.translate(s * 0.085, 1.06, 0.38);
    parts.push(part(eye, col("#101010"), [0.6, 0.1, 0]));
  }
  return merge(parts);
}

/** a bright red crab (claws up, six legs; the "scuttle" motion slides it sideways) */
export function crabGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const shell = new THREE.IcosahedronGeometry(1, 0);
  shell.scale(0.3, 0.13, 0.22);
  shell.translate(0, 0.17, 0);
  parts.push(part(shell, (p) => grey(0.85 + 0.35 * smoothstep(0.12, 0.28, p.y)), [1, 0, 0], { faceted: true }));
  for (const s of [-1, 1]) {
    const arm = taperTube([V(s * 0.22, 0.16, 0.1), V(s * 0.33, 0.24, 0.2)], { segs: 1, radial: 4, rx: () => 0.035 });
    parts.push(part(arm, grey(0.9), [1, 0.02, 0], { faceted: true }));
    const claw = new THREE.OctahedronGeometry(1, 0);
    claw.scale(0.09, 0.07, 0.13);
    claw.translate(s * 0.35, 0.27, 0.28);
    parts.push(part(claw, grey(1.05), [1, 0.02, 0], { faceted: true }));
    for (let l = 0; l < 3; l++) {
      const z = 0.08 - l * 0.1;
      const leg = taperTube([V(s * 0.24, 0.14, z), V(s * 0.42, 0.16, z - 0.03), V(s * 0.5, 0.0, z - 0.05)], { segs: 2, radial: 3, rx: (u) => 0.025 * (1 - u * 0.5) });
      parts.push(part(leg, grey(0.85), (p) => [1, Math.max(0, Math.abs(p.x) - 0.3) * 0.35, 0], { faceted: true }));
    }
    const eye = new THREE.OctahedronGeometry(0.035, 0);
    eye.translate(s * 0.08, 0.32, 0.17);
    parts.push(part(eye, col("#101010"), [0, 0, 0]));
  }
  return merge(parts);
}

/** a blue-spotted stingray (wingspan ~1 on x, nose +z): golden-tan back with electric blue spots,
 *  a pale belly and a striped tail; the wings ripple (aFx.y) */
export function rayGeometry(): THREE.BufferGeometry {
  const nu = 5;
  const nv = 5;
  const lead = (u: number) => 0.46 - 0.34 * u * u;
  const trail = (u: number) => -0.42 + 0.3 * u * u;
  const thick = (u: number, v: number) => 0.075 * (1 - u) * Math.pow(Math.sin(Math.PI * v), 0.7);
  const tan = col("#dca45c");
  const spot = col("#2f9dff");
  const belly = col("#f6f1e6");
  const pos: number[] = [];
  const colr: number[] = [];
  const fxa: number[] = [];
  const pt = (s: number, u: number, v: number, top: boolean) => {
    const x = s * u * 0.5;
    const z = trail(u) + (lead(u) - trail(u)) * v;
    const t = thick(u, v);
    const y = top ? t : -t * 0.5;
    let c: THREE.Color;
    if (top) c = noise3(x * 9, 0, z * 9, 31) > 0.62 && u > 0.12 ? spot.clone() : tan.clone().multiplyScalar(0.9 + 0.2 * v);
    else c = belly.clone();
    return { p: [x, y, z], c, f: 0.2 * Math.pow(u, 1.5) };
  };
  for (const s of [-1, 1])
    for (const top of [true, false])
      for (let i = 0; i < nu; i++)
        for (let j = 0; j < nv; j++) {
          const a = pt(s, i / nu, j / nv, top);
          const b = pt(s, (i + 1) / nu, j / nv, top);
          const c = pt(s, i / nu, (j + 1) / nv, top);
          const d = pt(s, (i + 1) / nu, (j + 1) / nv, top);
          const tris = (s > 0) === top ? [a, c, b, b, c, d] : [a, b, c, b, d, c];
          for (const q of tris) {
            pos.push(...q.p);
            colr.push(q.c.r, q.c.g, q.c.b);
            fxa.push(0, q.f, 0);
          }
        }
  const body = new THREE.BufferGeometry();
  body.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  body.setAttribute("aFx", new THREE.Float32BufferAttribute(fxa, 3));
  body.computeVertexNormals();
  const tail = new THREE.ConeGeometry(0.03, 0.7, 4, 1);
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0.02, -0.75);
  const parts = [body, part(tail, (p) => (Math.sin(p.z * 40) > 0 ? col("#2f9dff") : tan), (p) => [0, 0.04 + Math.max(0, -p.z - 0.4) * 0.1, 0])];
  for (const s of [-1, 1]) {
    const eye = new THREE.OctahedronGeometry(0.04, 0);
    eye.translate(s * 0.08, 0.07, 0.22);
    parts.push(part(eye, col("#ffd24a"), [0, 0, 0]));
  }
  return merge(parts);
}

// ── manta ray ──

/** a manta ray, wingspan 3.2 (x), dark back with pale shoulder chevrons, white belly */
export function mantaGeometry(): THREE.BufferGeometry {
  const nu = 10;
  const nv = 8;
  const half = 1.6;
  const lead = (u: number) => 0.55 - 0.95 * Math.pow(u, 1.3);
  const trail = (u: number) => -0.6 + 0.2 * u;
  const thick = (u: number, v: number) => 0.17 * Math.pow(1 - u, 1.15) * Math.pow(Math.sin(Math.PI * v), 0.8);
  // (a deep indigo back rather than true black: under water true black reads as a hole)
  const back = col("#2c3a70");
  const chev = col("#dfe8f6");
  const belly = col("#f4f8fc");
  const pos: number[] = [];
  const colr: number[] = [];
  const fxa: number[] = [];
  const pt = (s: number, u: number, v: number, topSide: boolean) => {
    const x = s * u * half;
    const z = trail(u) + (lead(u) - trail(u)) * v;
    const t = thick(u, v);
    const camber = 0.05 * Math.sin(Math.PI * v) * (1 - u);
    const y = topSide ? t * 0.85 + camber : -t * 0.55 + camber;
    let c: THREE.Color;
    if (topSide) {
      // pale chevron patches on the shoulders
      const cx = u - 0.45;
      const cz = z - (0.18 - u * 0.25);
      const chevron = cx * cx / 0.07 + cz * cz / 0.018 < 1 && u > 0.14 ? 1 : 0;
      c = mix(back, chev, chevron * 0.85, new THREE.Color());
    } else {
      c = mix(belly, back, smoothstep(0.75, 1, u) * 0.8 + smoothstep(0.15, 0.02, v) * 0.3, new THREE.Color());
      if (noise3(x * 5, 0, z * 5, 3) > 0.78 && u < 0.6) c.multiplyScalar(0.35);
    }
    return { p: [x, y, z], c, f: 0.42 * Math.pow(u, 1.6) };
  };
  const quad = (a: ReturnType<typeof pt>, b: ReturnType<typeof pt>, c: ReturnType<typeof pt>, d: ReturnType<typeof pt>, flip: boolean) => {
    const tris = flip ? [a, c, b, b, c, d] : [a, b, c, b, d, c];
    for (const q of tris) {
      pos.push(...q.p);
      colr.push(q.c.r, q.c.g, q.c.b);
      fxa.push(0, q.f, 0);
    }
  };
  for (const s of [-1, 1])
    for (const top of [true, false])
      for (let i = 0; i < nu; i++)
        for (let j = 0; j < nv; j++) {
          const u0 = i / nu;
          const u1 = (i + 1) / nu;
          const v0 = j / nv;
          const v1 = (j + 1) / nv;
          quad(pt(s, u0, v0, top), pt(s, u1, v0, top), pt(s, u0, v1, top), pt(s, u1, v1, top), (s > 0) === top);
        }
  const body = new THREE.BufferGeometry();
  body.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  body.setAttribute("aFx", new THREE.Float32BufferAttribute(fxa, 3));
  body.computeVertexNormals();
  // cephalic lobes (the "horns"), a long thin tail
  const parts: THREE.BufferGeometry[] = [body];
  for (const s of [-1, 1]) {
    const lobe = new THREE.ConeGeometry(0.06, 0.34, 5);
    lobe.rotateX(Math.PI / 2 + 0.35);
    lobe.translate(s * 0.22, -0.02, 0.66);
    parts.push(part(lobe, back, [0, 0, 0]));
  }
  const tail = new THREE.ConeGeometry(0.035, 1.3, 4);
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0.02, -1.2);
  parts.push(part(tail, back, [0, 0.05, 0]));
  return merge(parts);
}

// ── sea turtle ──

/** a green sea turtle: domed shell with scutes, long front flippers (aFx.y = flap) */
export function turtleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const scutes: [number, number][] = [
    [0, 0.62],
    [0, 0.22],
    [0, -0.18],
    [0, -0.56],
    [0.5, 0.38],
    [0.58, 0],
    [0.48, -0.4],
    [-0.5, 0.38],
    [-0.58, 0],
    [-0.48, -0.4],
  ];
  const dark = col("#6e5a2c");
  const amber = col("#d6a24a");
  const olive = col("#86963c");
  const dome = new THREE.SphereGeometry(1, 16, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(0.82, 0.4, 1.02);
  parts.push(
    part(
      dome,
      (p) => {
        let f1 = 9;
        let f2 = 9;
        let best = 0;
        scutes.forEach(([sx, sz], i) => {
          const d = Math.hypot(p.x - sx, p.z - sz);
          if (d < f1) {
            f2 = f1;
            f1 = d;
            best = i;
          } else if (d < f2) f2 = d;
        });
        const edge = smoothstep(0.12, 0.02, f2 - f1);
        const base = mix(dark, olive, (best * 0.37) % 1, new THREE.Color());
        return base.lerp(amber, edge * 0.8 + smoothstep(0.35, 0.05, f1) * 0.3);
      },
      [0, 0, 0],
      { faceColor: true },
    ),
  );
  const plastron = new THREE.CircleGeometry(1, 14);
  plastron.rotateX(Math.PI / 2);
  plastron.scale(0.8, 1, 1);
  parts.push(part(plastron, col("#e8d9a0"), [0, 0, 0]));
  const skin = col("#a9d070");
  const head = new THREE.SphereGeometry(1, 9, 6);
  head.scale(0.25, 0.21, 0.33);
  head.translate(0, 0.06, 1.2);
  parts.push(part(head, (p) => mix(skin, col("#e9edc0"), smoothstep(0.0, -0.1, p.y - 0.06)), [0, 0, 0]));
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.045, 5, 4);
    eye.translate(s * 0.16, 0.11, 1.33);
    parts.push(part(eye, col("#111111"), [0, 0, 0]));
  }
  const neck = new THREE.CylinderGeometry(0.16, 0.2, 0.35, 7);
  neck.rotateX(Math.PI / 2);
  neck.translate(0, 0.02, 0.95);
  parts.push(part(neck, skin, [0, 0, 0]));
  const flipper = (s: number, front: boolean) => {
    const f = new THREE.SphereGeometry(1, 9, 4);
    if (front) {
      f.scale(0.78, 0.05, 0.2);
      f.translate(0.72, 0, 0);
      f.rotateY(s > 0 ? 0.55 : -0.55);
      if (s < 0) f.scale(-1, 1, 1);
      f.translate(s * 0.62, -0.02, 0.48);
    } else {
      f.scale(0.34, 0.05, 0.16);
      f.translate(0.3, 0, 0);
      f.rotateY(s > 0 ? -0.6 : 0.6);
      if (s < 0) f.scale(-1, 1, 1);
      f.translate(s * 0.5, -0.02, -0.72);
    }
    if (s < 0) {
      // mirrored: fix winding
      return part(flipInside(f), (p) => mix(skin, col("#dfe8b8"), noise3(p.x * 9, 0, p.z * 9, 2) > 0.6 ? 0.6 : 0), (p) => [0, Math.max(0, Math.abs(p.x) - (front ? 0.55 : 0.45)) * (front ? 0.55 : 0.2), 0]);
    }
    return part(f, (p) => mix(skin, col("#dfe8b8"), noise3(p.x * 9, 0, p.z * 9, 2) > 0.6 ? 0.6 : 0), (p) => [0, Math.max(0, Math.abs(p.x) - (front ? 0.55 : 0.45)) * (front ? 0.55 : 0.2), 0]);
  };
  for (const s of [-1, 1]) parts.push(flipper(s, true), flipper(s, false));
  return merge(parts);
}

// ── orca ──

const ORCA_TAIL = -3.3;
const ORCA_LEN = 6.4;
/** body radius along the orca (t = 0 at the tail stock .. 1 at the nose) */
export function orcaRadius(t: number): number {
  if (t < 0.62) return 0.9 * (0.2 + 0.8 * Math.pow(smoothstep(0, 0.62, t), 0.75));
  return 0.9 * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.62) / 0.38, 2.4)));
}

/** an orca (length 6.4 on z, nose at +3.1). Extra attribute aMark = signed fields (white, grey). */
export function orcaGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bump = (t: number, c: number, w: number) => Math.exp(-(((t - c) / w) ** 2));
  const flapW = (z: number) => 0.34 * Math.pow(smoothstep(-0.2, ORCA_TAIL - 0.9, z), 1.5);
  const bodyMark = (x: number, y: number, z: number) => {
    const t = (z - ORCA_TAIL) / ORCA_LEN;
    const r = Math.max(0.05, orcaRadius(Math.min(0.999, Math.max(0, t))));
    const ny = y / r;
    const nx = x / (r * 0.86);
    // belly line, rising into the flank patch behind the dorsal fin; the whole lower jaw is white
    let b = -0.38 + 0.62 * bump(t, 0.37, 0.075) + 0.3 * smoothstep(0.86, 0.97, t);
    b -= 0.9 * smoothstep(0.26, 0.12, t);
    const belly = (b - ny) * r;
    // the eye patch: a slanted oval above and behind the eye
    const e = Math.hypot((t - 0.86) / 0.062, (ny - 0.2 - (t - 0.86) * 1.2) / 0.15);
    const eye = Math.min((1 - e) * 0.12, (Math.abs(nx) - 0.35) * 0.3);
    const white = Math.max(belly, eye);
    // grey saddle behind the dorsal fin
    const saddle = Math.min((ny - 0.6) * r, (0.065 - Math.abs(t - 0.44)) * 2.2);
    return [white, saddle] as [number, number];
  };
  // body: rings along z
  const rings = 24;
  const radial = 14;
  const pos: number[] = [];
  const idx: number[] = [];
  const ts: number[] = [];
  for (let i = 0; i < rings; i++) {
    const u = i / (rings - 1);
    ts.push(u < 0.7 ? u * 0.93 : 0.651 + (1 - Math.pow(Math.max(0, 1 - (u - 0.7) / 0.3), 1.6)) * 0.349);
  }
  for (let i = 0; i < rings; i++) {
    const t = Math.min(0.995, ts[i]);
    const z = ORCA_TAIL + t * ORCA_LEN;
    const r = orcaRadius(t);
    const wx = 0.86 * (0.55 + 0.45 * smoothstep(0, 0.35, t));
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const cy = Math.cos(a);
      pos.push(Math.sin(a) * r * wx, cy * r * (cy < 0 ? 0.9 : 1) + (t > 0.8 ? -(t - 0.8) * 0.4 : 0), z);
    }
  }
  for (let i = 0; i + 1 < rings; i++)
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k;
      const b = i * radial + ((k + 1) % radial);
      const c = (i + 1) * radial + k;
      const d = (i + 1) * radial + ((k + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  const noseI = pos.length / 3;
  pos.push(0, -0.08, ORCA_TAIL + ORCA_LEN);
  const tailI = noseI + 1;
  pos.push(0, 0, ORCA_TAIL - 0.02);
  for (let k = 0; k < radial; k++) {
    idx.push((rings - 1) * radial + k, noseI, (rings - 1) * radial + ((k + 1) % radial));
    idx.push(k, (k + 1) % radial, tailI);
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  body.setIndex(idx);
  body.computeVertexNormals();
  parts.push(body);
  // dorsal fin: tall, slightly swept back
  const fin = new THREE.Shape();
  fin.moveTo(0.55, 0);
  fin.quadraticCurveTo(0.35, 0.9, -0.12, 1.75);
  fin.quadraticCurveTo(-0.1, 1.0, -0.45, 0);
  fin.lineTo(0.55, 0);
  const finG = new THREE.ExtrudeGeometry(fin, { depth: 0.1, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1, curveSegments: 5 });
  finG.translate(0, 0, -0.05);
  finG.rotateY(-Math.PI / 2); // shape x -> world z
  const finT = 0.53;
  finG.translate(0, orcaRadius(finT) * 0.92, ORCA_TAIL + finT * ORCA_LEN);
  parts.push(finG);
  // pectoral paddles
  for (const s of [-1, 1]) {
    const p = new THREE.SphereGeometry(1, 9, 5);
    p.scale(0.62, 0.07, 0.34);
    p.translate(0.5, 0, 0);
    p.rotateY(s > 0 ? 0.5 : -0.5);
    p.rotateZ(s > 0 ? -0.45 : 0.45);
    if (s < 0) p.scale(-1, 1, 1);
    const t = 0.76;
    p.translate(s * orcaRadius(t) * 0.55, -orcaRadius(t) * 0.55, ORCA_TAIL + t * ORCA_LEN);
    parts.push(s < 0 ? flipInside(p) : p);
  }
  // flukes
  const fl = new THREE.Shape();
  fl.moveTo(0, 0.1);
  fl.quadraticCurveTo(0.5, 0.05, 1.3, -0.55);
  fl.quadraticCurveTo(0.9, -0.62, 0.55, -0.55);
  fl.quadraticCurveTo(0.2, -0.5, 0, -0.35);
  fl.quadraticCurveTo(-0.2, -0.5, -0.55, -0.55);
  fl.quadraticCurveTo(-0.9, -0.62, -1.3, -0.55);
  fl.quadraticCurveTo(-0.5, 0.05, 0, 0.1);
  const flG = new THREE.ExtrudeGeometry(fl, { depth: 0.06, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1, curveSegments: 5 });
  flG.translate(0, 0, -0.03);
  flG.rotateX(-Math.PI / 2); // shape y -> -z
  flG.translate(0, 0, ORCA_TAIL + 0.05);
  parts.push(flG);
  // to the shared layout + marks
  const out: THREE.BufferGeometry[] = [];
  const n = new THREE.Vector3();
  parts.forEach((g, pi) => {
    let geo = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(geo.attributes)) if (name !== "position" && name !== "normal") geo.deleteAttribute(name);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const P = geo.attributes.position as THREE.BufferAttribute;
    const N = geo.attributes.normal as THREE.BufferAttribute;
    const mark = new Float32Array(P.count * 2);
    const fx = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i);
      const y = P.getY(i);
      const z = P.getZ(i);
      n.fromBufferAttribute(N, i);
      let m: [number, number];
      if (pi === 0) m = bodyMark(x, y, z);
      else if (pi === parts.length - 1) m = [-n.y * 0.05 - 0.01, -1]; // flukes: white underneath
      else m = [-1, -1];
      mark[i * 2] = m[0];
      mark[i * 2 + 1] = m[1];
      fx[i * 3 + 1] = flapW(z);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(P.count * 3).fill(1), 3));
    geo.setAttribute("aFx", new THREE.BufferAttribute(fx, 3));
    geo.setAttribute("aMark", new THREE.BufferAttribute(mark, 2));
    out.push(geo);
  });
  const merged = mergeGeometries(out, false)!;
  merged.computeBoundingSphere();
  return merged;
}

// ── jellyfish (for the jelly ShaderMaterial: position, normal, aJ = [part, along]) ──

/** a jellyfish: a translucent bell (part 0), long trailing tentacles (1) and frilly oral arms (2) */
export function jellyGeometry(): THREE.BufferGeometry {
  const geos: THREE.BufferGeometry[] = [];
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 7; i++) {
    const u = i / 7;
    const a = u * Math.PI * 0.5;
    pts.push(new THREE.Vector2(Math.sin(a) * (1 - u * 0.04) + 0.001, Math.cos(a) * 0.78 + 0.1));
  }
  pts.push(new THREE.Vector2(0.9, 0.04), new THREE.Vector2(0.76, 0.1));
  const bell = new THREE.LatheGeometry(pts, 12);
  const withJ = (g: THREE.BufferGeometry, partId: number, along: (p: THREE.Vector3) => number) => {
    const geo = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(geo.attributes)) if (name !== "position" && name !== "normal") geo.deleteAttribute(name);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const P = geo.attributes.position as THREE.BufferAttribute;
    const j = new Float32Array(P.count * 2);
    const p = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i);
      j[i * 2] = partId;
      j[i * 2 + 1] = along(p);
    }
    geo.setAttribute("aJ", new THREE.BufferAttribute(j, 2));
    return geo;
  };
  geos.push(withJ(bell, 0, (p) => 1 - p.y / 0.9));
  const ribbon = (x0: number, z0: number, len: number, w: number, segs: number, twist: number, partId: number) => {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const ww = w * (1 - u * 0.6);
      const a = twist * u;
      const cx = x0 * (1 - u * 0.25);
      const cz = z0 * (1 - u * 0.25);
      const y = 0.08 - u * len;
      pos.push(cx - Math.cos(a) * ww, y, cz - Math.sin(a) * ww, cx + Math.cos(a) * ww, y, cz + Math.sin(a) * ww);
      if (i < segs) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return withJ(g, partId, (p) => (0.08 - p.y) / len);
  };
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    geos.push(ribbon(Math.cos(a) * 0.72, Math.sin(a) * 0.72, 2.6 + (i % 3) * 0.7, 0.025, 8, 2 + i, 1));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    geos.push(ribbon(Math.cos(a) * 0.14, Math.sin(a) * 0.14, 1.5, 0.13, 6, 3.5, 2));
  }
  const g = mergeGeometries(geos, false)!;
  for (const x of geos) x.dispose();
  g.computeBoundingSphere();
  return g;
}

// ── the sunken galleon (local frame: bow +z, keel on y = 0) ──

const WOOD_A = col("#6e4b2e");
const WOOD_B = col("#80593a");
const WOOD_DARK = col("#3a2818");
const ALGAE = col("#4f7a4a");
const IRON = col("#2c2f36");
const GOLD = col("#ffc23a");
const CLOTH = col("#c9c2a0");
const TRIM_RED = col("#8e3b2c");
const TRIM_GOLD = col("#e0a848");

function weather(c: THREE.Color, p: THREE.Vector3, amt = 1) {
  // algae and barnacles creeping over old wood
  const n = noise3(p.x * 0.5, p.y * 0.5, p.z * 0.5, 7);
  c.lerp(ALGAE, smoothstep(0.55, 0.8, n) * 0.3 * amt + smoothstep(1.4, 0, p.y) * 0.3 * amt);
  if (noise3(p.x * 6, p.y * 6, p.z * 6, 3) > 0.82) c.lerp(col("#d9d2c0"), 0.35 * amt);
  return c;
}

export function galleonGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const r = rngOf(1717);
  const S = 16;
  const J = 7;
  const zStern = -6;
  const zBow = 6.6;
  const halfW = (z: number) => {
    if (z > 0.8) return 2.3 * (1 - Math.pow((z - 0.8) / (zBow - 0.8), 2.1)) + 0.12;
    return 2.3 - Math.pow((0.8 - z) / (0.8 - zStern), 2) * 0.55;
  };
  const deckY = (z: number) => 2.7 + Math.pow(Math.abs(z) / 6.3, 2.2) * (z < 0 ? 0.9 : 0.55);
  const keelY = (z: number) => 0.05 + (z > 4 ? (z - 4) * 0.25 : 0) + (z < -5 ? (-5 - z) * 0.3 : 0);
  const at = (i: number, j: number, s: number) => {
    const z = zStern + (i / S) * (zBow - zStern);
    const phi = (j / J) * Math.PI * 0.5;
    const w = halfW(z);
    const x = s * w * Math.pow(Math.sin(phi), 0.65);
    const y = keelY(z) + (deckY(z) - keelY(z)) * Math.pow(1 - Math.cos(phi), 0.85);
    return V(x, y, z);
  };
  // the hull planks (both sides); a broken hole on the starboard side
  const pos: number[] = [];
  const colr: number[] = [];
  const hole = (i: number, j: number, s: number) => s > 0 && i >= 7 && i <= 9 && j >= 2 && j <= 4 && !(i === 9 && j === 2);
  for (const s of [-1, 1])
    for (let i = 0; i < S; i++)
      for (let j = 0; j < J; j++) {
        if (hole(i, j, s)) continue;
        const a = at(i, j, s);
        const b = at(i + 1, j, s);
        const c = at(i, j + 1, s);
        const d = at(i + 1, j + 1, s);
        const tone = j === J - 1 ? TRIM_GOLD : j === J - 2 ? TRIM_RED : j === 1 ? WOOD_DARK : j % 2 ? WOOD_A : WOOD_B;
        const cc = weather(tone.clone().multiplyScalar(0.96 + r() * 0.08), a);
        const tris = s > 0 ? [a, c, b, b, c, d] : [a, b, c, b, d, c];
        for (const p of tris) {
          pos.push(p.x, p.y, p.z);
          colr.push(cc.r, cc.g, cc.b);
        }
      }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  hull.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  hull.computeVertexNormals();
  hull.setAttribute("aFx", new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(0), 3));
  parts.push(hull);
  // dark insides behind the hole, and splintered planks round it
  const inner = new THREE.PlaneGeometry(2.6, 1.6);
  inner.rotateY(-Math.PI / 2);
  inner.translate(1.3, 1.3, 1.8);
  parts.push(part(inner, col("#120d08"), [0, 0, 0]));
  for (let k = 0; k < 5; k++) {
    const sp = new THREE.BoxGeometry(0.08, 0.14, 0.7 + r() * 0.5);
    sp.rotateX((r() - 0.5) * 0.8);
    sp.rotateY(0.3 + r() * 0.4);
    const p = at(7 + Math.floor(r() * 3), 2 + Math.floor(r() * 3), 1);
    sp.translate(p.x + 0.1, p.y, p.z);
    parts.push(part(sp, WOOD_B, [0, 0, 0]));
  }
  // transom (flat stern) + deck
  const tpos: number[] = [];
  for (let j = 0; j < J; j++) {
    const a = at(0, j, -1);
    const b = at(0, j + 1, -1);
    const c = at(0, j, 1);
    const d = at(0, j + 1, 1);
    tpos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
  }
  const transom = new THREE.BufferGeometry();
  transom.setAttribute("position", new THREE.Float32BufferAttribute(tpos, 3));
  transom.computeVertexNormals();
  parts.push(part(transom, (p) => weather(WOOD_DARK.clone(), p, 0.6), [0, 0, 0]));
  const dpos: number[] = [];
  const dcol: number[] = [];
  const cols = 5;
  for (let i = 0; i < S; i++)
    for (let k = 0; k < cols; k++) {
      const z0 = zStern + (i / S) * (zBow - zStern);
      const z1 = zStern + ((i + 1) / S) * (zBow - zStern);
      if (i >= 8 && i <= 9 && k >= 2 && k <= 3) continue; // a broken hatch
      const x = (z: number, kk: number) => (-1 + (2 * kk) / cols) * halfW(z) * 0.96;
      const y0 = deckY(z0) - 0.12;
      const y1 = deckY(z1) - 0.12;
      const q = [V(x(z0, k), y0, z0), V(x(z0, k + 1), y0, z0), V(x(z1, k), y1, z1), V(x(z1, k + 1), y1, z1)];
      const cc = weather((k % 2 ? WOOD_B : WOOD_A).clone().multiplyScalar(1.1), q[0], 0.8);
      for (const p of [q[0], q[2], q[1], q[1], q[2], q[3]]) {
        dpos.push(p.x, p.y, p.z);
        dcol.push(cc.r, cc.g, cc.b);
      }
    }
  const deck = new THREE.BufferGeometry();
  deck.setAttribute("position", new THREE.Float32BufferAttribute(dpos, 3));
  deck.setAttribute("color", new THREE.Float32BufferAttribute(dcol, 3));
  deck.computeVertexNormals();
  deck.setAttribute("aFx", new THREE.Float32BufferAttribute(new Float32Array(dpos.length).fill(0), 3));
  parts.push(deck);
  // hatch hole (dark)
  const hatch = new THREE.PlaneGeometry(1.7, 0.8);
  hatch.rotateX(-Math.PI / 2);
  hatch.translate(0.45, deckY(0.8) - 0.5, 1.2);
  parts.push(part(hatch, col("#0d0906"), [0, 0, 0]));
  // stern castle with glowing windows
  const castle = new THREE.BoxGeometry(3.3, 1.5, 2.8);
  castle.translate(0, deckY(-5) + 0.6, -4.6);
  parts.push(part(castle, (p, n) => weather((n.y > 0.5 ? WOOD_A : WOOD_B).clone().multiplyScalar(0.95), p, 0.7), [0, 0, 0], { faceColor: true }));
  for (const sx of [-1, 1])
    for (let w = 0; w < 2; w++) {
      const win = new THREE.PlaneGeometry(0.42, 0.42);
      win.rotateY(sx * Math.PI / 2);
      win.translate(sx * 1.66, deckY(-5) + 0.75, -5.4 + w * 1.3);
      parts.push(part(win, col("#ffb347"), [0, 0, 1]));
    }
  for (let w = -1; w <= 1; w++) {
    const win = new THREE.PlaneGeometry(0.5, 0.55);
    win.rotateY(Math.PI);
    win.translate(w * 0.95, deckY(-5) + 0.7, -6.02);
    parts.push(part(win, col("#ffb347"), [0, 0, 1]));
  }
  // railings
  for (const s of [-1, 1]) {
    for (let i = 2; i < S - 1; i += 2) {
      const a = at(i, J, s);
      const post = new THREE.BoxGeometry(0.1, 0.5, 0.1);
      post.translate(a.x * 0.97, a.y + 0.2, a.z);
      parts.push(part(post, WOOD_B, [0, 0, 0]));
    }
  }
  // main mast, snapped off with a jagged top, and a hanging yard with a tattered sail
  const mast = displace(new THREE.CylinderGeometry(0.2, 0.26, 4.6, 7, 2), (p) => {
    if (p.y > 2.2) p.y += (noise3(p.x * 9, 0, p.z * 9, 4) - 0.5) * 1.2;
  });
  mast.translate(0, deckY(0.6) + 2.2, 0.6);
  parts.push(part(mast, (p) => weather(WOOD_B.clone(), p, 0.5), [0, 0, 0]));
  const yard = new THREE.CylinderGeometry(0.1, 0.1, 5.2, 6);
  yard.rotateZ(Math.PI / 2 - 0.35);
  yard.translate(0, deckY(0.6) + 3.4, 0.9);
  parts.push(part(yard, WOOD_A, [0, 0, 0]));
  {
    const sw = 6;
    const sh = 4;
    const sp: number[] = [];
    const sc: number[] = [];
    const sf: number[] = [];
    const vert = (i: number, j: number) => {
      const u = i / sw - 0.5;
      const v = j / sh;
      const x = u * 4.6 * Math.cos(0.35);
      const yTop = deckY(0.6) + 3.4 + u * 4.6 * Math.sin(0.35) * -1;
      const ragged = j === sh ? (noise3(i * 1.7, 0, 0, 5) - 0.3) * 0.8 : 0;
      const y = yTop - v * 2.3 - ragged;
      const z = 1.0 + Math.sin(u * 3) * 0.2 + v * v * 0.5;
      return [x, y, z, v];
    };
    for (let i = 0; i < sw; i++)
      for (let j = 0; j < sh; j++) {
        if ((i === 1 && j === 2) || (i === 4 && j >= 2) || (i === 2 && j === 3)) continue; // holes
        const q = [vert(i, j), vert(i + 1, j), vert(i, j + 1), vert(i + 1, j + 1)];
        for (const p of [q[0], q[2], q[1], q[1], q[2], q[3]]) {
          sp.push(p[0], p[1], p[2]);
          const c = CLOTH.clone().lerp(ALGAE, p[3] * 0.4);
          sc.push(c.r, c.g, c.b);
          sf.push(0, p[3] * 0.18, 0);
        }
      }
    const sail = new THREE.BufferGeometry();
    sail.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    sail.setAttribute("color", new THREE.Float32BufferAttribute(sc, 3));
    sail.setAttribute("aFx", new THREE.Float32BufferAttribute(sf, 3));
    sail.computeVertexNormals();
    parts.push(sail);
  }
  // mizzen stub, fallen foremast lying across the sand, bowsprit
  const miz = displace(new THREE.CylinderGeometry(0.16, 0.2, 1.6, 6, 1), (p) => {
    if (p.y > 0.5) p.y += (noise3(p.x * 9, 1, p.z * 9, 2) - 0.5) * 0.6;
  });
  miz.translate(0, deckY(-4.6) + 1.5 + 0.8, -4.6);
  parts.push(part(miz, WOOD_B, [0, 0, 0]));
  const fore = new THREE.CylinderGeometry(0.16, 0.2, 8.5, 7);
  fore.rotateZ(Math.PI / 2 - 0.12);
  fore.rotateY(0.5);
  fore.translate(4.3, 0.9, 4.2);
  parts.push(part(fore, (p) => weather(WOOD_B.clone(), p, 1), [0, 0, 0]));
  const nest = new THREE.CylinderGeometry(0.55, 0.45, 0.5, 8, 1, true);
  nest.rotateZ(Math.PI / 2 - 0.12);
  nest.rotateY(0.5);
  nest.translate(7.6, 0.55, 2.3);
  parts.push(part(nest, WOOD_DARK, [0, 0, 0]));
  const sprit = new THREE.CylinderGeometry(0.1, 0.16, 3.4, 6);
  sprit.rotateX(Math.PI / 2 - 0.45);
  sprit.translate(0, deckY(6) + 0.6, zBow + 1.2);
  parts.push(part(sprit, WOOD_A, [0, 0, 0]));
  // cannons poking out of the port side
  for (let k = 0; k < 3; k++) {
    const z = -2.4 + k * 1.9;
    const c = new THREE.CylinderGeometry(0.11, 0.14, 0.9, 7);
    c.rotateZ(Math.PI / 2);
    c.translate(-halfW(z) - 0.25, 1.9, z);
    parts.push(part(c, IRON, [0, 0, 0]));
  }
  // rudder, an anchor in the sand, and two barrels
  const rud = new THREE.BoxGeometry(0.16, 2.2, 0.9);
  rud.translate(0, 1.0, zStern - 0.4);
  parts.push(part(rud, WOOD_DARK, [0, 0, 0]));
  const shank = new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6);
  shank.rotateZ(1.2);
  shank.translate(2.8, 0.3, 9.6);
  const arms = new THREE.TorusGeometry(0.7, 0.08, 4, 10, Math.PI);
  arms.rotateX(-Math.PI / 2);
  arms.rotateZ(1.2);
  arms.translate(1.9, 0.2, 9.6);
  const ringA = new THREE.TorusGeometry(0.22, 0.05, 4, 8);
  ringA.translate(3.8, 0.7, 9.6);
  for (const g of [shank, arms, ringA]) parts.push(part(g, (p) => IRON.clone().lerp(col("#8a4a2a"), noise3(p.x * 4, p.y * 4, p.z * 4, 1) * 0.5), [0, 0, 0]));
  for (const [bx, bz, rot] of [
    [-3.6, -3.9, 0.4],
    [-3.4, -5.3, 1.4],
  ] as const) {
    const b = new THREE.CylinderGeometry(0.34, 0.34, 0.85, 9, 3);
    b.rotateZ(Math.PI / 2);
    b.rotateY(rot);
    b.translate(bx, 0.3, bz);
    parts.push(part(b, (p) => ((Math.round(p.y * 10) % 3 === 0 ? IRON : WOOD_B).clone()), [0, 0, 0]));
  }
  return merge(parts);
}

/** the treasure chest (local frame; spilled gold glows) */
export function chestGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const r = rngOf(88);
  const body = new THREE.BoxGeometry(1.1, 0.62, 0.7);
  body.translate(0, 0.31, 0);
  parts.push(part(body, (p) => weather(WOOD_A.clone(), p, 0.4), [0, 0, 0]));
  for (const x of [-0.42, 0.42]) {
    const band = new THREE.BoxGeometry(0.08, 0.64, 0.72);
    band.translate(x, 0.31, 0);
    parts.push(part(band, GOLD, [0, 0, 0.35]));
  }
  // open lid, tipped back
  const lid = new THREE.CylinderGeometry(0.35, 0.35, 1.1, 10, 1, false, 0, Math.PI);
  lid.rotateZ(Math.PI / 2);
  lid.translate(0, 0, 0.35);
  lid.rotateX(-1.9);
  lid.translate(0, 0.62, -0.35);
  parts.push(part(lid, (p) => weather(WOOD_B.clone(), p, 0.4), [0, 0, 0]));
  // heaped gold inside + coins spilled on the sand + gems
  const heap = new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  heap.scale(1, 0.45, 0.62);
  heap.translate(0, 0.58, 0);
  parts.push(part(heap, (p) => GOLD.clone().multiplyScalar(0.85 + noise3(p.x * 12, p.y * 12, p.z * 12, 2) * 0.4), [0, 0, 1]));
  for (let k = 0; k < 14; k++) {
    const c = new THREE.CylinderGeometry(0.075, 0.075, 0.02, 7);
    c.rotateX((r() - 0.5) * 0.5);
    const a = r() * 2.2 - 0.3;
    const d = 0.7 + r() * 0.9;
    c.translate(Math.sin(a) * d * 0.9, 0.02 + r() * 0.03, Math.cos(a) * d);
    parts.push(part(c, GOLD, [0, 0, 0.8]));
  }
  const gems = ["#ff3f6c", "#3fff9c", "#4f8bff", "#c46bff"];
  gems.forEach((g, k) => {
    const o = new THREE.OctahedronGeometry(0.1, 0);
    o.scale(1, 1.4, 1);
    o.translate(-0.3 + k * 0.2, 0.74 + (k % 2) * 0.05, (k % 2 ? 0.1 : -0.12));
    parts.push(part(o, col(g), [0, 0, 1.2], { faceted: true }));
  });
  // a little crown on the heap
  const crown = new THREE.CylinderGeometry(0.16, 0.14, 0.12, 8, 1, true);
  crown.translate(0.2, 0.82, 0.05);
  parts.push(part(crown, GOLD, [0, 0, 1]));
  for (let k = 0; k < 4; k++) {
    const sp = new THREE.ConeGeometry(0.035, 0.12, 4);
    const a = (k / 4) * Math.PI * 2;
    sp.translate(0.2 + Math.cos(a) * 0.15, 0.93, 0.05 + Math.sin(a) * 0.15);
    parts.push(part(sp, GOLD, [0, 0, 1]));
  }
  return merge(parts);
}

// ── the sunken temple (local frame: centre on y = 0, forward = +z toward the island) ──

const MARBLE_A = col("#e0d6c2");
const MARBLE_B = col("#c9c3db");
const RUNE = col("#5ff4ff");
const TEAL_ALGAE = col("#3f8f7f");

function marble(p: THREE.Vector3, n: THREE.Vector3) {
  const c = mix(MARBLE_A, MARBLE_B, noise3(p.x * 0.4, p.y * 0.4, p.z * 0.4, 6), new THREE.Color());
  c.multiplyScalar(0.85 + 0.25 * noise3(p.x * 3, p.y * 3, p.z * 3, 2));
  c.lerp(TEAL_ALGAE, smoothstep(0.55, 0.9, n.y) * smoothstep(0.35, 0.65, noise3(p.x * 0.9, p.y, p.z * 0.9, 9)) * 0.75);
  c.lerp(TEAL_ALGAE, smoothstep(1.4, 0.2, p.y) * 0.3);
  // masonry: courses of blocks, each a slightly different stone
  const course = Math.floor(p.y / 0.45);
  const block = Math.floor(Math.atan2(p.z, p.x) * 3.2 + (course % 2) * 0.5 + Math.hypot(p.x, p.z) * 0.6);
  const h = Math.abs(Math.sin(course * 12.9898 + block * 78.233) * 43758.5453) % 1;
  c.multiplyScalar(0.86 + h * 0.2);
  return c;
}

export interface TempleOptions {
  /** metres available from the floor to just under the surface (the temple is scaled to fit) */
  headroom: number;
  /** the sea floor under a local (x, z), relative to the temple's base height */
  floorAt?: (x: number, z: number) => number;
}

export function templeGeometry(o: TempleOptions): { geometry: THREE.BufferGeometry; glows: [number, number, number][] } {
  const parts: THREE.BufferGeometry[] = [];
  const glows: [number, number, number][] = [];
  const r = rngOf(4040);
  const k = Math.min(1, o.headroom / 6.4);
  const floorAt = o.floorAt ?? (() => 0);
  const stone = (g: THREE.BufferGeometry, glow = 0) => parts.push(part(g, (p, n) => marble(p, n), [0, 0, glow], { faceted: true, faceColor: true }));
  // stepped platform (deep footing so it sits on a sloping floor)
  const t1 = new THREE.CylinderGeometry(7.8, 8.4, 3.0, 24);
  t1.translate(0, -1.2, 0);
  stone(t1);
  const t2 = new THREE.CylinderGeometry(7.0, 7.3, 0.45, 24);
  t2.translate(0, 0.52, 0);
  stone(t2);
  const t3 = new THREE.CylinderGeometry(6.2, 6.5, 0.4, 24);
  t3.translate(0, 0.95, 0);
  stone(t3);
  const top = 1.15;
  // steps up from the island side
  for (let s = 0; s < 3; s++) {
    const st = new THREE.BoxGeometry(3.2, 0.38, 0.8);
    st.translate(0, 0.19 + s * 0.38 - 0.4, 8.6 - s * 0.7);
    stone(st);
  }
  // ring of columns: some standing (with a lintel), some broken, one fallen
  const R = 4.7;
  const colH = 3.7 * k;
  const status = ["tall", "tall", "broken", "fallen", "stump", "tall", "broken", "tall"] as const;
  const column = (x: number, z: number, h: number, capital: boolean, rune: boolean, y0 = top) => {
    const base = new THREE.BoxGeometry(1.2, 0.35, 1.2);
    base.translate(x, y0 + 0.17, z);
    stone(base);
    const shaft = displace(new THREE.CylinderGeometry(0.48, 0.53, h, 14, 2), (p) => {
      const a = Math.atan2(p.z, p.x);
      const f = 1 - 0.09 * Math.pow(0.5 + 0.5 * Math.cos(a * 7), 3);
      p.x *= f;
      p.z *= f;
      if (!capital && p.y > h / 2 - 0.05) p.y += (noise3(p.x * 6 + x, 0, p.z * 6 + z, 3) - 0.6) * 0.7;
    });
    shaft.translate(x, y0 + 0.35 + h / 2, z);
    stone(shaft);
    if (capital) {
      const cap = new THREE.CylinderGeometry(0.72, 0.5, 0.3, 12);
      cap.translate(x, y0 + 0.35 + h + 0.15, z);
      stone(cap);
      const abacus = new THREE.BoxGeometry(1.35, 0.22, 1.35);
      abacus.translate(x, y0 + 0.35 + h + 0.41, z);
      stone(abacus);
    }
    if (rune) {
      const band = new THREE.CylinderGeometry(0.53, 0.53, 0.14, 14, 1, true);
      band.translate(x, y0 + 0.35 + h * 0.55, z);
      parts.push(part(band, RUNE, [0, 0, 1.1]));
      glows.push([x, y0 + 0.35 + h * 0.55, z]);
    }
  };
  const pos = (i: number) => {
    const a = (i / status.length) * Math.PI * 2 + Math.PI / status.length;
    return [Math.sin(a) * R, Math.cos(a) * R] as const;
  };
  status.forEach((s, i) => {
    const [x, z] = pos(i);
    if (s === "tall") column(x, z, colH, true, i % 2 === 1);
    else if (s === "broken") column(x, z, colH * (0.45 + r() * 0.25), false, false);
    else if (s === "stump") column(x, z, 0.7, false, false);
    else {
      // fallen: drums lying on the platform and rolled onto the sand
      const b = new THREE.BoxGeometry(1.0, 0.35, 1.0);
      b.translate(x, top + 0.17, z);
      stone(b);
      for (let d = 0; d < 3; d++) {
        const drum = new THREE.CylinderGeometry(0.4, 0.4, 1.1, 12);
        drum.rotateZ(Math.PI / 2);
        drum.rotateY(0.6 + d * 0.2);
        const out = 1.4 + d * 1.25;
        const dx = x * (1 + out / R);
        const dz = z * (1 + out / R) + d * 0.3;
        const dr = Math.hypot(dx, dz);
        drum.translate(dx, dr < 6.2 ? top + 0.4 : dr < 7.0 ? 1.15 : dr < 7.8 ? 0.7 : floorAt(dx, dz) + 0.3, dz);
        stone(drum);
      }
    }
  });
  // lintel across the first two tall columns
  {
    const [x0, z0] = pos(0);
    const [x1, z1] = pos(1);
    const len = Math.hypot(x1 - x0, z1 - z0) + 1.1;
    const lintel = new THREE.BoxGeometry(len, 0.5, 0.9);
    lintel.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    lintel.translate((x0 + x1) / 2, top + 0.35 + colH + 0.77, (z0 + z1) / 2);
    stone(lintel);
  }
  // the altar with a glowing orb
  const altar = new THREE.BoxGeometry(1.5, 0.9, 1.5);
  altar.translate(0, top + 0.45, 0);
  stone(altar);
  const altar2 = new THREE.BoxGeometry(1.1, 0.25, 1.1);
  altar2.translate(0, top + 1.02, 0);
  stone(altar2);
  const orb = new THREE.IcosahedronGeometry(0.34, 2);
  orb.translate(0, top + 1.5, 0);
  parts.push(part(orb, col("#8ff8ff"), [0, 0, 1.5]));
  glows.push([0, top + 1.5, 0]);
  const ring = new THREE.TorusGeometry(0.62, 0.035, 4, 24);
  ring.rotateX(Math.PI / 2 + 0.3);
  ring.translate(0, top + 1.5, 0);
  parts.push(part(ring, RUNE, [0, 0, 1.2]));
  // a glowing rune circle set into the platform floor round the altar
  const circle = new THREE.RingGeometry(2.45, 2.62, 32, 1);
  circle.rotateX(-Math.PI / 2);
  circle.translate(0, top + 0.02, 0);
  parts.push(part(circle, RUNE, [0, 0, 0.9]));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tile = new THREE.CircleGeometry(0.26, i % 2 ? 3 : 4);
    tile.rotateX(-Math.PI / 2);
    tile.rotateY(a);
    tile.translate(Math.sin(a) * 3.1, top + 0.025, Math.cos(a) * 3.1);
    parts.push(part(tile, RUNE, [0, 0, 1.1]));
  }
  // the arch gate, standing on the sand to the right (+x) of the temple
  {
    const ax = 10.5;
    const span = 1.8;
    const aH = 2.9 * k;
    const ay = Math.min(floorAt(ax, -span), floorAt(ax, span)) - 0.15;
    for (const s of [-1, 1]) column(ax, s * span, aH, true, false, ay);
    const archY = ay + 0.35 + aH + 0.52;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1)) * Math.PI;
      const blk = new THREE.BoxGeometry(0.75, 0.55, ((Math.PI * (span + 0.27)) / n) * 1.04);
      blk.rotateX(a - Math.PI / 2);
      blk.translate(ax, archY + Math.sin(a) * (span + 0.27), Math.cos(a) * (span + 0.27));
      stone(blk);
    }
    const key = new THREE.OctahedronGeometry(0.28, 0);
    key.scale(1, 1.3, 0.5);
    key.rotateY(Math.PI / 2);
    key.translate(ax + 0.34, archY + span, 0);
    parts.push(part(key, RUNE, [0, 0, 1.4], { faceted: true }));
    glows.push([ax + 0.4, archY + span, 0]);
  }
  // scattered blocks
  for (let i = 0; i < 8; i++) {
    const a = r() * Math.PI * 2;
    const d = 8.8 + r() * 4;
    const b = new THREE.BoxGeometry(0.6 + r() * 0.6, 0.4 + r() * 0.3, 0.6 + r() * 0.5);
    b.rotateY(r() * 3);
    b.rotateX((r() - 0.5) * 0.4);
    b.translate(Math.sin(a) * d, floorAt(Math.sin(a) * d, Math.cos(a) * d) + 0.1, Math.cos(a) * d);
    stone(b);
  }
  return { geometry: merge(parts), glows };
}

/** helper: bake a kit-layout geometry into world space with a heading + lean */
export function place(g: THREE.BufferGeometry, x: number, y: number, z: number, rot: number, lean = 0, pitch = 0): THREE.BufferGeometry {
  return transform(g, x, y, z, rot, 1, pitch, lean);
}

export type { Fx, Rng };
