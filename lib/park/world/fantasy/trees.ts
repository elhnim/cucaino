// Stylised fantasy trees, each species ONE merged geometry (bark + canopy + glowing bits) in
// the kit layout (see geo.ts / shaders.ts): canopy vertices carry the per-instance tint and sway,
// bark doesn't, glowing seed pods glow. Built at unit scale, standing on y = 0.
//   oak    — Elderoak: a broad, curved trunk and a big lumpy crown of soft blobs
//   pine   — Spirepine: tall, tiers of drooping lumpy boughs, dark teal
//   birch  — Sunbirch: slender pale trunk, airy stacked crown (yellow-green .. autumn gold)
//   spirit — Moonbloom: twisted twin trunk, an umbrella crown (silver-blue or blossom pink)
//            hung with glowing seed pods
// plus the Glow Forest's giant ancient tree (buildGiantTree).
import * as THREE from "three";
import { blob, col, displace, merge, mix, part, taperTube, transform, type Fx } from "./geo";
import { noise3, rngOf, smoothstep } from "./noise";
import type { Species } from "./placement";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const scratch = new THREE.Color();

interface BarkStyle {
  base: THREE.Color;
  top: THREE.Color;
  moss: THREE.Color;
  /** birch: dark flecks */
  flecks?: THREE.Color;
}

function barkColor(style: BarkStyle, height: number) {
  return (p: THREE.Vector3, n: THREE.Vector3) => {
    const t = smoothstep(0, height, p.y);
    mix(style.base, style.top, t, scratch);
    // moss creeps up the lower, upward-facing bark
    const moss = (1 - smoothstep(0.3, height * 0.45, p.y)) * smoothstep(-0.1, 0.6, n.y + 0.25) * smoothstep(0.35, 0.65, noise3(p.x * 1.4, p.y * 1.4, p.z * 1.4, 21));
    scratch.lerp(style.moss, moss * 0.85);
    if (style.flecks) {
      const f = smoothstep(0.62, 0.7, noise3(p.x * 3, p.y * 5, p.z * 3, 5));
      scratch.lerp(style.flecks, f * 0.85);
    }
    // grooves read darker
    scratch.multiplyScalar(0.85 + 0.3 * noise3(p.x * 4, p.y * 2, p.z * 4, 8));
    return scratch;
  };
}

/** canopy vertex colour: a light/shade gradient (the species colour comes from the instance tint) */
function leafShade(centre: THREE.Vector3, halfH: number, spread: number, warm = col("#fff6dc"), cool = col("#7d93a2")) {
  return (p: THREE.Vector3, n: THREE.Vector3) => {
    const up = smoothstep(-halfH, halfH, p.y - centre.y);
    const out = smoothstep(0, spread, Math.hypot(p.x - centre.x, p.z - centre.z));
    const sun = Math.max(0, n.y * 0.6 + n.x * 0.25 + 0.3);
    mix(cool, warm, up * 0.65 + out * 0.2 + sun * 0.25, scratch);
    scratch.multiplyScalar(0.82 + 0.3 * noise3(p.x * 0.9, p.y * 0.9, p.z * 0.9, 13));
    return scratch;
  };
}

const swayBy = (y0: number, y1: number, tint = 1, glow = 0): ((p: THREE.Vector3) => Fx) => (p) => [tint, smoothstep(y0, y1, p.y) * 0.9 + 0.1, glow];

export interface TreeGeometry {
  geometry: THREE.BufferGeometry;
  height: number;
}

export function buildTreeGeometry(species: Species, lowQuality = false, seed = 1): TreeGeometry {
  const detail = lowQuality ? 1 : 2;
  const r = rngOf(seed * 7919 + species.length * 31);
  const parts: THREE.BufferGeometry[] = [];

  if (species === "oak") {
    const bark: BarkStyle = { base: col("#3b2a1f"), top: col("#6b4d36"), moss: col("#4f6b2a") };
    const trunkPts = [V(0, -0.3, 0), V(0.35, 1.8, 0.1), V(-0.25, 3.8, 0.25), V(0.2, 5.6, -0.1), V(0.1, 7.2, 0)];
    const trunk = taperTube(trunkPts, { segs: 14, radial: 9, rx: (t) => 0.78 * Math.pow(1 - t, 0.7) + 0.2 + 0.55 * (1 - smoothstep(0, 0.14, t)), lump: 0.35, seed: 2 });
    parts.push(part(trunk, barkColor(bark, 7), [0.25, 0, 0]));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + r() * 0.6;
      const root = taperTube([V(0, 1.1, 0), V(Math.cos(a) * 0.9, 0.35, Math.sin(a) * 0.9), V(Math.cos(a) * 1.9, -0.2, Math.sin(a) * 1.9)], { segs: 6, radial: 6, rx: (t) => 0.36 * (1 - t) + 0.08, ry: (t) => 0.5 * (1 - t) + 0.08 });
      parts.push(part(root, barkColor(bark, 7), [0.25, 0, 0]));
    }
    // three boughs reaching up into the crown
    const boughs: [number, number, number][] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const end = V(Math.cos(a) * 2.6, 7.6 + r(), Math.sin(a) * 2.6);
      boughs.push([end.x, end.y, end.z]);
      const b = taperTube([V(0, 4.6 + i * 0.5, 0), V(Math.cos(a) * 1.2, 5.8 + i * 0.4, Math.sin(a) * 1.2), end], { segs: 7, radial: 6, rx: (t) => 0.34 * (1 - t) + 0.1 });
      parts.push(part(b, barkColor(bark, 7), [0.25, 0.1, 0]));
    }
    // the crown: one big soft mass of lumps
    const C = V(0.1, 8.4, 0);
    const blobs: [number, number, number, number][] = [[0.1, 8.6, 0, 3.1]];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r() * 0.5;
      const d = 2.4 + r() * 0.9;
      blobs.push([Math.cos(a) * d, 7.5 + r() * 1.3, Math.sin(a) * d, 1.9 + r() * 0.7]);
    }
    blobs.push([0.8, 10.4, 0.4, 2], [-1, 10.1, -0.6, 1.8]);
    for (const [x, y, z, rr] of blobs) {
      const g = blob(x, y, z, rr, rr * 0.82, rr, { detail, lump: 0.42, seed: r() * 50, centre: C, soft: 0.74 });
      parts.push(part(g, leafShade(C, 2.8, 4.5), swayBy(6.2, 11.5)));
    }
    return { geometry: merge(parts), height: 11.5 };
  }

  if (species === "pine") {
    const bark: BarkStyle = { base: col("#2e2119"), top: col("#57402f"), moss: col("#43582a") };
    const trunk = taperTube([V(0, -0.3, 0), V(0.15, 4, 0.05), V(-0.1, 8, 0), V(0, 12.5, 0)], { segs: 12, radial: 7, rx: (t) => 0.5 * (1 - t) + 0.08 + 0.3 * (1 - smoothstep(0, 0.1, t)), lump: 0.3, seed: 4 });
    parts.push(part(trunk, barkColor(bark, 10), [0.2, 0, 0]));
    const tiers = 6;
    for (let k = 0; k < tiers; k++) {
      const u = k / (tiers - 1);
      const y = 2.6 + k * 1.75;
      const R = 3.3 * (1 - u * 0.78) + 0.2;
      const h = 2.9 - u * 0.9;
      const cone = new THREE.ConeGeometry(R, h, lowQuality ? 9 : 13, 3);
      const seedK = r() * 40;
      const g = displace(cone, (p) => {
        const a = Math.atan2(p.z, p.x);
        const rad = Math.hypot(p.x, p.z);
        // drooping, scalloped bough edges
        const scallop = 1 + 0.2 * Math.sin(a * 6 + seedK) + (noise3(p.x * 1.2 + seedK, p.y, p.z * 1.2, 7) - 0.5) * 0.5;
        p.x *= scallop;
        p.z *= scallop;
        p.y -= (rad / R) * (rad / R) * 0.7;
      });
      transform(g, 0, y + h / 2, 0, r() * 6);
      const C = V(0, y + h * 0.3, 0);
      parts.push(
        part(
          g,
          (p, n) => {
            const rim = smoothstep(R * 0.35, R, Math.hypot(p.x, p.z));
            mix(col("#607789"), col("#fff3d6"), rim * 0.6 + Math.max(0, n.y) * 0.35 + u * 0.15, scratch);
            scratch.multiplyScalar(0.85 + 0.25 * noise3(p.x, p.y, p.z, 3));
            return scratch;
          },
          (p) => [1, smoothstep(2, 13, p.y) * 0.8 + smoothstep(0, R, Math.hypot(p.x - C.x, p.z - C.z)) * 0.2, 0],
        ),
      );
    }
    return { geometry: merge(parts), height: 13.6 };
  }

  if (species === "birch") {
    const bark: BarkStyle = { base: col("#8e8a80"), top: col("#e9e5da"), moss: col("#6f7f3a"), flecks: col("#2b2622") };
    const trunk = taperTube([V(0, -0.3, 0), V(0.5, 3, 0.1), V(0.1, 6, -0.2), V(0.6, 9.2, 0)], { segs: 14, radial: 7, rx: (t) => 0.3 * (1 - t) + 0.08 + 0.18 * (1 - smoothstep(0, 0.12, t)), lump: 0.15, seed: 6 });
    parts.push(part(trunk, barkColor(bark, 9), [0, 0.05, 0]));
    const twig = taperTube([V(0.2, 5.4, 0), V(1.3, 6.4, 0.4), V(1.9, 7.4, 0.5)], { segs: 5, radial: 5, rx: (t) => 0.13 * (1 - t) + 0.04 });
    parts.push(part(twig, barkColor(bark, 9), [0, 0.2, 0]));
    const C = V(0.4, 7.6, 0);
    const blobs: [number, number, number, number][] = [
      [0.5, 9.4, 0.1, 1.7],
      [1.6, 7.8, 0.5, 1.6],
      [-0.6, 7.4, -0.5, 1.7],
      [0.6, 6.4, 1.1, 1.35],
      [0.2, 6.2, -1.2, 1.3],
      [-0.7, 8.8, 0.8, 1.4],
    ];
    for (const [x, y, z, rr] of blobs) {
      const g = blob(x, y, z, rr, rr * 1.05, rr, { detail, lump: 0.5, seed: r() * 50, centre: C, soft: 0.7 });
      parts.push(part(g, leafShade(C, 2.4, 2.6), swayBy(5, 10.5)));
    }
    return { geometry: merge(parts), height: 11 };
  }

  // spirit — the Moonbloom
  const bark: BarkStyle = { base: col("#2a2233"), top: col("#5a4b66"), moss: col("#3e6b62") };
  for (let s = 0; s < 2; s++) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const a = s * Math.PI + t * Math.PI * 1.6;
      const rr = 0.42 * (1 - t * 0.5) + (i === 0 ? 0.3 : 0);
      pts.push(V(Math.cos(a) * rr, -0.3 + t * 7, Math.sin(a) * rr));
    }
    const strand = taperTube(pts, { segs: 16, radial: 7, rx: (t) => 0.42 * (1 - t * 0.55) + 0.28 * (1 - smoothstep(0, 0.15, t)), lump: 0.25, seed: 8 + s });
    parts.push(part(strand, barkColor(bark, 7), [0, 0, 0]));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.7;
    const root = taperTube([V(0, 0.9, 0), V(Math.cos(a) * 0.9, 0.2, Math.sin(a) * 0.9), V(Math.cos(a) * 1.7, -0.25, Math.sin(a) * 1.7)], { segs: 6, radial: 6, rx: (t) => 0.3 * (1 - t) + 0.07, ry: (t) => 0.42 * (1 - t) + 0.07 });
    parts.push(part(root, barkColor(bark, 7), [0, 0, 0]));
  }
  const C = V(0, 7.9, 0);
  const crown: [number, number, number, number][] = [[0, 9.1, 0, 2.7], [0.6, 10.3, -0.4, 1.9]];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.4;
    const d = 2.9 + r() * 0.6;
    crown.push([Math.cos(a) * d, 7.6 + r() * 0.7, Math.sin(a) * d, 1.7 + r() * 0.5]);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    const b = taperTube([V(0, 6.2, 0), V(Math.cos(a) * 1.4, 7, Math.sin(a) * 1.4), V(Math.cos(a) * 2.8, 7.7, Math.sin(a) * 2.8)], { segs: 6, radial: 5, rx: (t) => 0.22 * (1 - t) + 0.07 });
    parts.push(part(b, barkColor(bark, 7), [0, 0.15, 0]));
  }
  for (const [x, y, z, rr] of crown) {
    const g = blob(x, y, z, rr, rr * 0.8, rr, { detail, lump: 0.45, seed: r() * 50, centre: C, soft: 0.74, lift: 0.35 });
    // the crown glows faintly at twilight
    parts.push(part(g, leafShade(C, 1.6, 4.5, col("#ffffff"), col("#8a90c0")), swayBy(6.5, 10, 1, 0.12)));
  }
  // glowing seed pods hanging under the crown
  const podCols = [col("#ffd36b"), col("#7ff6ff"), col("#ffe9a8")];
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2;
    const d = 1.2 + r() * 3;
    const top = 7.2 - (d > 3 ? 0.2 : 0);
    const len = 0.5 + r() * 1.2;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const stem = new THREE.CylinderGeometry(0.025, 0.025, len, 3);
    transform(stem, x, top - len / 2, z);
    parts.push(part(stem, col("#3b3548"), [0, 0.8, 0]));
    const pod = new THREE.IcosahedronGeometry(0.2 + r() * 0.1, 1);
    transform(pod, x, top - len - 0.12, z, 0, V(1, 1.35, 1));
    const pc = podCols[i % podCols.length];
    parts.push(part(pod, pc, [0, 1, 1]));
  }
  return { geometry: merge(parts), height: 10.5 };
}

/** instance tints per species (canopy colour; `t` 0..1 is the tree's own variation) */
export function tintFor(species: Species, t: number, out = new THREE.Color()): THREE.Color {
  if (species === "oak") return mix(col("#4d8a2e"), col("#2d7a4f"), t, out).lerp(col("#7a9a2a"), t > 0.85 ? 0.6 : 0);
  if (species === "pine") return mix(col("#2f7a5a"), col("#46844a"), t, out);
  if (species === "birch") return t > 0.72 ? mix(col("#e0a53a"), col("#d9772e"), (t - 0.72) / 0.28, out) : mix(col("#8fb83c"), col("#b7c34a"), t / 0.72, out);
  return t < 0.34 ? mix(col("#b79cff"), col("#cdb4ff"), t * 3, out) : t < 0.5 ? mix(col("#86efd9"), col("#a8f5e6"), (t - 0.34) * 6, out) : mix(col("#ff9fcf"), col("#ffc0e4"), (t - 0.5) * 2, out);
}

/**
 * The Glow Forest's giant ancient tree (~33 units tall at scale 1): a trunk of four twisted
 * strands, tall buttress roots, great boughs, three layers of canopy, bracket fungi, and dozens
 * of hanging mossy vines with glowing tips.
 */
export function buildGiantTreeGeometry(lowQuality = false): THREE.BufferGeometry {
  const r = rngOf(4242);
  const detail = lowQuality ? 2 : 3;
  const parts: THREE.BufferGeometry[] = [];
  const bark: BarkStyle = { base: col("#2a2019"), top: col("#5b4636"), moss: col("#3f6b34") };
  const barkC = barkColor(bark, 24);
  // the trunk: four strands twisting round each other
  for (let s = 0; s < 4; s++) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const a = (s / 4) * Math.PI * 2 + t * Math.PI * 1.25;
      const rr = 1.5 * (1 - t) + 0.55 + 1.6 * (1 - smoothstep(0, 0.2, t));
      pts.push(V(Math.cos(a) * rr, -0.5 + t * 25, Math.sin(a) * rr));
    }
    const strand = taperTube(pts, { segs: lowQuality ? 18 : 28, radial: lowQuality ? 7 : 9, rx: (t) => 1.55 * (1 - t * 0.55) + 0.9 * (1 - smoothstep(0, 0.16, t)), lump: 0.3, seed: 30 + s });
    parts.push(part(strand, barkC, (p) => [0.15, smoothstep(18, 26, p.y) * 0.08, 0]));
  }
  // buttress roots: tall fins flaring out to the ground
  const nRoots = 7;
  for (let i = 0; i < nRoots; i++) {
    const a = (i / nRoots) * Math.PI * 2 + r() * 0.4;
    const reach = 7.5 + r() * 3;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const wob = r() - 0.5;
    const root = taperTube(
      [V(ca * 1.6, 7, sa * 1.6), V(ca * 3.2 - sa * wob, 3.2, sa * 3.2 + ca * wob), V(ca * reach * 0.7, 0.6, sa * reach * 0.7), V(ca * reach, -0.6, sa * reach)],
      { segs: 12, radial: 7, rx: (t) => 0.75 * (1 - t) + 0.22, ry: (t) => 2.4 * (1 - t) + 0.3, lump: 0.25, seed: 50 + i },
    );
    parts.push(part(root, barkC, [0.15, 0, 0]));
  }
  // great boughs holding up the canopy layers
  const boughEnds: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.5;
    const d = 7 + r() * 3;
    const y0 = 17 + r() * 5;
    const end = V(Math.cos(a) * d, 25 + r() * 2.5, Math.sin(a) * d);
    boughEnds.push(end);
    const b = taperTube([V(0, y0, 0), V(Math.cos(a) * d * 0.45, y0 + 3.2, Math.sin(a) * d * 0.45), end], { segs: 10, radial: 7, rx: (t) => 0.95 * (1 - t) + 0.28, lump: 0.25, seed: 70 + i });
    parts.push(part(b, barkC, [0.15, 0.15, 0]));
  }
  // bracket fungi on the trunk (they glow softly)
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const y = 2 + r() * 12;
    const rad = 2.1 + 1.6 * (1 - smoothstep(0, 5, y)) - y * 0.03;
    const s = 0.55 + r() * 0.5;
    const g = new THREE.SphereGeometry(1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    transform(g, Math.cos(a) * rad, y, Math.sin(a) * rad, -a, V(s, s * 0.32, s));
    parts.push(part(g, col(i % 2 ? "#7ff0d8" : "#b99bff"), [0, 0, 0.55]));
  }
  // the canopy: three soft layers, darker underneath
  const C = V(0, 28.5, 0);
  const layers: [number, number, number, number, number][] = [
    // count, ring radius, y, blob radius, jitter
    [9, 9.5, 26.2, 5.2, 1.2],
    [7, 6.2, 29.8, 4.8, 1],
    [4, 2.8, 33.2, 4.0, 0.8],
  ];
  const canopyShade = leafShade(C, 5, 12, col("#fbffe6"), col("#6f94a0"));
  for (const [n, ring, y, br, jit] of layers) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.5;
      const d = ring + (r() - 0.5) * jit * 2;
      const rr = br * (0.85 + r() * 0.3);
      const g = blob(Math.cos(a) * d, y + (r() - 0.5) * jit, Math.sin(a) * d, rr, rr * 0.68, rr, { detail, lump: 0.45, seed: r() * 90, centre: C, soft: 0.7, lift: 0.55 });
      parts.push(part(g, canopyShade, (p) => [1, 0.2 + smoothstep(22, 36, p.y) * 0.5, 0.03 + smoothstep(27, 22, p.y) * 0.05]));
    }
  }
  // moss clumps where the boughs meet the canopy
  for (const e of boughEnds) {
    const g = blob(e.x * 0.8, e.y - 1.4, e.z * 0.8, 1.3, 0.8, 1.3, { detail: 1, lump: 0.5, seed: e.x });
    parts.push(part(g, col("#4f7a3a"), [0.6, 0.2, 0]));
  }
  // hanging vines with glowing tips
  const tipCols = [col("#6ff7ff"), col("#b98bff"), col("#ffd36b"), col("#8dffb4")];
  const nVines = lowQuality ? 22 : 40;
  for (let i = 0; i < nVines; i++) {
    const a = r() * Math.PI * 2;
    const d = 3 + Math.sqrt(r()) * 10;
    const top = 25.5 - smoothstep(4, 13, d) * 2.5 + r();
    const len = 5 + r() * 9;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const bend = (r() - 0.5) * 1.4;
    const vine = taperTube([V(x, top, z), V(x + bend * 0.5, top - len * 0.5, z), V(x + bend, top - len, z + bend * 0.3)], { segs: 6, radial: 3, rx: (t) => 0.12 * (1 - t) + 0.05 });
    parts.push(part(vine, (p) => mix(col("#2f4a2c"), col("#6b9a48"), smoothstep(top, top - len, p.y), scratch), (p) => [0.4, 0.3 + smoothstep(top, top - len, p.y) * 1.6, smoothstep(top - len * 0.5, top - len, p.y) * 0.35]));
    const tip = new THREE.IcosahedronGeometry(0.34 + r() * 0.18, 1);
    transform(tip, x + bend, top - len - 0.2, z + bend * 0.3, 0, V(1, 1.5, 1));
    parts.push(part(tip, tipCols[i % tipCols.length], [0, 1.9, 1.0]));
  }
  return merge(parts);
}

/** a cluster of 3-5 glowing mushrooms (caps take the instance tint + glow; stems stay pale) */
export function buildMushroomClusterGeometry(): THREE.BufferGeometry {
  const r = rngOf(77);
  const parts: THREE.BufferGeometry[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const d = i === 0 ? 0 : 0.5 + r() * 0.6;
    const h = i === 0 ? 1.5 : 0.5 + r() * 0.8;
    const cr = i === 0 ? 0.85 : 0.3 + r() * 0.35;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const lean = (r() - 0.5) * 0.4;
    const stem = new THREE.CylinderGeometry(cr * 0.22, cr * 0.34, h, 7, 2);
    transform(stem, x, h / 2, z, 0, 1, lean * 0.5, lean);
    parts.push(part(stem, col("#e8e0cf"), [0, 0, 0.05]));
    const cap = new THREE.SphereGeometry(cr, 11, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    transform(cap, x + lean * h * -0.5, h - 0.05, z + lean * h * 0.25, 0, V(1, 0.6, 1), lean * 0.5, lean);
    parts.push(part(cap, (p, nn) => mix(col("#9aa6b8"), col("#ffffff"), nn.y, scratch), [1, 0, 1]));
    const gill = new THREE.CircleGeometry(cr * 0.95, 11);
    transform(gill, x + lean * h * -0.5, h - 0.06, z + lean * h * 0.25, 0, 1, Math.PI / 2 + lean * 0.5, lean);
    parts.push(part(gill, col("#ffffff"), [1, 0, 1.6]));
  }
  return merge(parts);
}
