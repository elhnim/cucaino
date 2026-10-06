// Chunky low-poly models for the storybook diorama, all in the fantasy kit's vertex layout
// (position, normal, color, aFx — see ../fantasy/geo.ts + shaders.ts) so they share its wind
// sway and per-instance tinting. Everything is faceted (flat per-face normals and colours) so the
// diorama pass's colour steps and ink lines read as facets, like a painted wooden model.
import * as THREE from "three";
import { col, merge, part, weld, type Fx } from "../fantasy/geo";
import { noise3, rngOf } from "../fantasy/noise";
import { KIND_LUMPY, KIND_ROUND, KIND_SPIRE, KIND_TALL } from "./plan";

const WHITE = col("#ffffff");
const WOOD = col("#b07a44");
const _c = new THREE.Color();

/** soft, rounded shading: weld the corners and share one normal between the faces that meet there
 *  (so a canopy reads as a rounded mass of leaves, not a cut gem) */
function smooth(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const w = weld(g);
  w.computeVertexNormals();
  const out = w.toNonIndexed();
  w.dispose();
  return out;
}

/** a lumpy ball of leaves (an icosphere: 80 faces, or 20 for `detail` 0), gently lumpy */
function lump(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, seed: number, amount = 0.16, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  // displace by position (identical corners get identical pushes, so nothing cracks)
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + (noise3(v.x * 1.7 + seed, v.y * 1.7, v.z * 1.7 - seed, 3) - 0.5) * amount * 2;
    const yk = v.y < -0.2 ? 0.8 : 1; // canopies hang: flatter underneath
    pos.setXYZ(i, cx + v.x * rx * k, cy + v.y * ry * k * yk, cz + v.z * rz * k);
  }
  return g;
}

/** a smaller lump: a displaced icosahedron (20 facets) */
function ico(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 0);
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + (noise3(v.x * 1.7 + seed, v.y * 1.7, v.z * 1.7 - seed, 3) - 0.5) * 0.2;
    pos.setXYZ(i, cx + v.x * rx * k, cy + v.y * ry * k * (v.y < -0.2 ? 0.8 : 1), cz + v.z * rz * k);
  }
  return g;
}

/** canopy: white-ish facets (the instance colour gives the hue), brighter on top, shaded below */
function canopy(g: THREE.BufferGeometry, seed: number, top: number, bottom: number, swayFrom = 0.3): THREE.BufferGeometry {
  // (shaded smoothly: lighter on top, darker underneath, with soft dapples that follow the shape —
  //  never a different flat colour per face, which reads as hard edges)
  return part(
    g.attributes.normal ? g : smooth(g),
    (p, n) => {
      const up = n.y * 0.5 + 0.5;
      const k = 0.66 + up * 0.36 + (noise3(p.x * 1.3 + seed, p.y * 1.3, p.z * 1.3, 9) - 0.5) * 0.12;
      return _c.setScalar(Math.min(1, k));
    },
    (p): Fx => [1, swayFrom + Math.max(0, (p.y - bottom) / Math.max(0.01, top - bottom)) * (1 - swayFrom), 0],
  );
}

function trunk(h: number, r0: number, r1: number, color = "#7b5433"): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, h, 8, 1, true);
  g.translate(0, h / 2, 0);
  const c = col(color);
  return part(g, (p) => _c.copy(c).multiplyScalar(0.8 + 0.2 * (p.y / h)), [0, 0, 0]);
}

/**
 * One tree kind at unit scale, standing on y = 0 (a deciduous tree is ~5.5 m, a pine ~7 m).
 * `low` swaps the rounder canopies for fewer facets.
 */
export function buildForestTree(kind: number, low = false): THREE.BufferGeometry {
  // (the main mass is a 12-facet dodecahedron, the smaller lumps 20-facet icosahedra)
  if (kind === KIND_ROUND) {
    const parts = [trunk(2.4, 0.3, 0.2), canopy(lump(0, 3.35, 0, 1.85, 1.6, 1.85, 1.3, 0.16, low ? 0 : 1), 11, 5.2, 1.9)];
    if (!low) parts.push(canopy(ico(0.55, 4.5, -0.35, 1.05, 0.9, 1.05, 4.1), 12, 5.6, 3.6));
    return merge(parts);
  }
  if (kind === KIND_LUMPY) {
    const parts = [trunk(2.2, 0.3, 0.2), canopy(lump(0, 3.15, 0, 1.6, 1.4, 1.6, 2.2, 0.16, low ? 0 : 1), 21, 5.4, 1.9), canopy(ico(1.1, 3.55, 0.45, 1.2, 1.05, 1.2, 5.3), 22, 5.4, 1.9)];
    if (!low) parts.push(canopy(ico(-0.75, 3.95, -0.6, 1.2, 1.1, 1.2, 7.7), 23, 5.4, 1.9));
    return merge(parts);
  }
  if (kind === KIND_TALL) {
    const parts = [trunk(2.6, 0.26, 0.17), canopy(lump(0, 3.5, 0, 1.4, 1.25, 1.4, 3.3, 0.16, low ? 0 : 1), 31, 6.4, 2.2), canopy(ico(0.1, 4.85, 0.05, 1.1, 1.1, 1.1, 6.2), 32, 6.4, 2.2)];
    if (!low) parts.push(canopy(ico(-0.05, 5.85, -0.05, 0.72, 0.8, 0.72, 8.8), 33, 6.6, 2.2));
    return merge(parts);
  }
  // pines: stacked chunky cones (closed underneath so you never see inside), the tips sway most
  const tiers = kind === KIND_SPIRE ? (low ? 3 : 4) : 3;
  const parts = [trunk(kind === KIND_SPIRE ? 2.2 : 1.8, 0.22, 0.14, "#6a4a30")];
  const sides = low ? 7 : 10;
  const r = rngOf(kind * 97 + 5);
  for (let i = 0; i < tiers; i++) {
    const u = i / (tiers - 1);
    const spire = kind === KIND_SPIRE;
    const rad = (spire ? 1.25 : 1.75) * (1 - u * 0.58);
    const h = (spire ? 2.4 : 2.6) * (1 - u * 0.3);
    const y = (spire ? 1.3 : 1.2) + u * (spire ? 4.2 : 3.4);
    // (the cone keeps its own rounded normals: a soft fir, not a faceted pyramid)
    const g = new THREE.ConeGeometry(rad, h, sides, 1, false);
    g.deleteAttribute("uv");
    g.rotateY(r() * Math.PI);
    g.translate(0, y + h / 2, 0);
    // a slight ragged wobble on the rim
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const px = pos.getX(k);
      const pz = pos.getZ(k);
      if (Math.hypot(px, pz) > rad * 0.9) pos.setY(k, pos.getY(k) + (noise3(px * 2, i, pz * 2, 7) - 0.5) * 0.22);
    }
    const top = spire ? 7.6 : 7.0;
    parts.push(canopy(g, 40 + i + kind * 10, top, 1.2, 0.15));
  }
  return merge(parts);
}

/** a cheap stand-in used only to cast the forest's shadows near the player (one per tree) */
export function buildShadowProxy(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 0);
  g.deleteAttribute("uv");
  return g;
}

// ── sheep ──

/** a chunky sheep body (fleece + legs), ~1.5 m long, facing +z, standing on y = 0 */
export function buildSheepBody(): THREE.BufferGeometry {
  const fleece = col("#f7f3ea");
  const leg = col("#3b302b");
  const body = part(lump(0, 0.78, 0, 0.62, 0.48, 0.8, 2.7, 0.14), (p, n) => _c.copy(fleece).multiplyScalar(0.78 + 0.22 * (n.y * 0.5 + 0.5)), [0, 0, 0], { faceted: true, faceColor: true });
  const tail = part(lump(0, 0.85, -0.78, 0.18, 0.16, 0.16, 5.5, 0.1), fleece, [0, 0, 0], { faceted: true });
  const legs = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) => {
      const g = new THREE.BoxGeometry(0.16, 0.52, 0.16);
      g.translate(sx * 0.3, 0.26, sz * 0.45);
      return part(g, leg, [0, 0, 0], { faceted: true });
    }),
  );
  return merge([body, tail, ...legs]);
}

/** the head: a dark face with a fleecy cap and ears; its pivot (the neck) is the origin, facing +z */
export function buildSheepHead(): THREE.BufferGeometry {
  const face = col("#2f2622");
  const fleece = col("#f7f3ea");
  const head = part(lump(0, -0.02, 0.26, 0.2, 0.22, 0.3, 1.1, 0.1), face, [0, 0, 0], { faceted: true, faceColor: true });
  const cap = part(lump(0, 0.16, 0.14, 0.23, 0.14, 0.22, 3.1, 0.12), fleece, [0, 0, 0], { faceted: true, faceColor: true });
  const ears = [-1, 1].map((s) => {
    const g = new THREE.BoxGeometry(0.2, 0.06, 0.1);
    g.translate(s * 0.25, 0.06, 0.12);
    return part(g, face, [0, 0, 0], { faceted: true });
  });
  return merge([head, cap, ...ears]);
}

// ── windmills ──

/** tower + cap (the sails are separate so they can spin), ~7.5 m, door facing +z, on y = 0 */
export function buildWindmillTower(): THREE.BufferGeometry {
  const white = col("#f4f0e4");
  const red = col("#d94b32");
  const tower = new THREE.CylinderGeometry(1.05, 1.55, 5.6, 8, 1, false);
  tower.translate(0, 2.8, 0);
  const cap = new THREE.ConeGeometry(1.42, 1.9, 8, 1, false);
  cap.translate(0, 5.6 + 0.95, 0);
  const rim = new THREE.CylinderGeometry(1.25, 1.25, 0.22, 8, 1, false);
  rim.translate(0, 5.6, 0);
  const door = new THREE.BoxGeometry(0.62, 1.1, 0.2);
  door.translate(0, 0.55, 1.47);
  const win = new THREE.BoxGeometry(0.42, 0.5, 0.2);
  win.translate(0, 3.6, 1.2);
  const base = new THREE.CylinderGeometry(1.8, 1.9, 0.3, 8, 1, false);
  base.translate(0, 0.15, 0);
  return merge([
    part(tower, (p, n) => _c.copy(white).multiplyScalar(0.84 + 0.16 * Math.max(0, n.z)), [0, 0, 0], { faceted: true, faceColor: true }),
    part(base, col("#b9ab93"), [0, 0, 0], { faceted: true }),
    part(cap, red, [0, 0, 0], { faceted: true }),
    part(rim, col("#8a3a28"), [0, 0, 0], { faceted: true }),
    part(door, col("#6b4128"), [0, 0, 0], { faceted: true }),
    part(win, col("#3c5870"), [0, 0, 0], { faceted: true }),
  ]);
}

/** where the sails' hub sits on the tower (local, before the tower's scale/rotation) */
export const MILL_HUB = new THREE.Vector3(0, 5.35, 1.5);

/** four sails round a hub at the origin, in the XY plane (spin about z) */
export function buildWindmillSails(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const hub = new THREE.CylinderGeometry(0.28, 0.28, 0.5, 6);
  hub.rotateX(Math.PI / 2);
  parts.push(part(hub, col("#5a3a26"), [0, 0, 0], { faceted: true }));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const spar = new THREE.BoxGeometry(0.14, 4.4, 0.12);
    spar.translate(0, 2.3, 0.1);
    const sail = new THREE.BoxGeometry(0.95, 3.5, 0.05);
    sail.translate(0.55, 2.7, 0.14);
    const stripe = new THREE.BoxGeometry(0.95, 0.18, 0.07);
    stripe.translate(0.55, 3.2, 0.15);
    for (const g of [spar, sail, stripe]) g.rotateZ(a);
    parts.push(part(spar, col("#7a5234"), [0, 0, 0], { faceted: true }), part(sail, col("#fbf6ea"), [0, 0, 0], { faceted: true }), part(stripe, col("#d94b32"), [0, 0, 0], { faceted: true }));
  }
  return merge(parts);
}

// ── hot-air balloons ──

const BALLOON_STYLES: string[][] = [
  ["#ef4a3c", "#f7943a", "#f7d23e", "#6cc24a", "#3f8fe0", "#8a5ad6"], // rainbow gores
  ["#e8423a", "#fbf6ea"], // red / white checks
  ["#f7d23e", "#2f78d0"], // yellow / blue stripes
  ["#ff7fb0", "#fbf6ea", "#61d1b0"], // candy gores
  ["#f7943a", "#f7d23e"], // orange / yellow checks
];

/** a whole balloon (striped/checked envelope, ropes, basket), ~13 m tall, basket at y = 0 */
export function buildBalloon(style: number): THREE.BufferGeometry {
  const pal = BALLOON_STYLES[style % BALLOON_STYLES.length].map((h) => col(h));
  const checks = style % BALLOON_STYLES.length === 1 || style % BALLOON_STYLES.length === 4;
  const stripes = style % BALLOON_STYLES.length === 2;
  const prof = [
    [0.26, 0],
    [0.5, 0.18],
    [0.95, 0.48],
    [1.32, 0.9],
    [1.5, 1.4],
    [1.46, 1.9],
    [1.22, 2.35],
    [0.72, 2.7],
    [0, 2.82],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const gores = 12;
  const env = new THREE.LatheGeometry(prof, gores);
  env.deleteAttribute("uv");
  env.scale(3.4, 3.4, 3.4);
  env.translate(0, 3.2, 0);
  const envPart = part(
    env,
    (p) => {
      const a = (Math.atan2(p.x, p.z) / (Math.PI * 2) + 1) % 1;
      const g = Math.floor(a * gores + 0.5) % gores;
      const row = Math.floor(((p.y - 3.2) / (2.82 * 3.4)) * 8);
      let c: THREE.Color;
      if (checks) c = pal[(g + row) % 2];
      else if (stripes) c = pal[row % 2];
      else c = pal[g % pal.length];
      return c;
    },
    [0, 0, 0],
    { faceted: true, faceColor: true },
  );
  const basket = new THREE.BoxGeometry(1.3, 1.0, 1.3);
  basket.translate(0, 0.5, 0);
  const rimB = new THREE.BoxGeometry(1.42, 0.16, 1.42);
  rimB.translate(0, 1.0, 0);
  const ropes = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) => {
      const from = new THREE.Vector3(sx * 0.6, 1.0, sz * 0.6);
      const to = new THREE.Vector3(sx * 0.62, 3.25, sz * 0.62);
      const g = new THREE.BoxGeometry(0.07, from.distanceTo(to), 0.07);
      g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
      return part(g, col("#5a4636"), [0, 0, 0], { faceted: true });
    }),
  );
  return merge([envPart, part(basket, col("#9a6a3c"), [0, 0, 0], { faceted: true }), part(rimB, col("#6e4a2a"), [0, 0, 0], { faceted: true }), ...ropes]);
}

// ── boats ──

function hull(len: number, width: number, depth: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(width, depth, len, 1, 1, 3);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const y = pos.getY(i);
    const u = z / (len / 2); // -1 stern .. 1 bow
    let x = pos.getX(i);
    if (u > 0.9) x *= 0.08; // pointed bow
    else if (u > 0.2) x *= 0.8;
    if (u < -0.9) x *= 0.72; // flat-ish transom
    if (y < 0) x *= 0.62; // narrower keel
    pos.setX(i, x);
    if (u > 0.9 && y > 0) pos.setY(i, y + 0.12); // a little sheer at the bow
  }
  g.translate(0, depth / 2 - 0.12, 0);
  g.deleteAttribute("uv");
  return g;
}

/** a little sailboat (hull tinted per boat, white sail), ~3.6 m long, waterline at y = 0, bow +z */
export function buildSailboat(): THREE.BufferGeometry {
  const h = part(hull(3.6, 1.35, 0.7), (p, n) => (n.y > 0.7 ? WOOD : WHITE), (p, n) => [n.y > 0.7 ? 0 : 1, 0, 0], { faceted: true, faceColor: true });
  const mast = new THREE.CylinderGeometry(0.05, 0.07, 3.8, 5);
  mast.translate(0, 0.55 + 1.9, 0.35);
  const sail = new THREE.BufferGeometry();
  sail.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.9, 0.3, 0, 4.2, 0.36, 0, 0.9, -1.45, 0, 0.9, 0.3, 0, 0.9, -1.45, 0, 4.2, 0.36], 3));
  // a jib in front
  const jib = new THREE.BufferGeometry();
  jib.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.8, 0.45, 0, 0.8, 1.7, 0, 3.6, 0.42, 0, 0.8, 1.7, 0, 0.8, 0.45, 0, 3.6, 0.42], 3));
  return merge([
    h,
    part(mast, col("#6b4a30"), [0, 0, 0], { faceted: true }),
    part(sail, col("#fbf8f0"), [0, 0, 0], { faceted: true }),
    // (the jib takes the hull's colour)
    part(jib, WHITE, [1, 0, 0], { faceted: true }),
  ]);
}

/** a little rowing boat with two seats, ~2.6 m long, waterline at y = 0, bow +z */
export function buildRowboat(): THREE.BufferGeometry {
  const h = part(hull(2.6, 1.1, 0.55), (p, n) => (n.y > 0.7 ? WOOD : WHITE), (p, n) => [n.y > 0.7 ? 0 : 1, 0, 0], { faceted: true, faceColor: true });
  const inner = new THREE.BoxGeometry(0.8, 0.05, 1.9);
  inner.translate(0, 0.3, -0.05);
  const seats = [-0.5, 0.35].map((z) => {
    const g = new THREE.BoxGeometry(0.9, 0.06, 0.26);
    g.translate(0, 0.38, z);
    return part(g, col("#8a5a32"), [0, 0, 0], { faceted: true });
  });
  const oars = [-1, 1].map((s) => {
    const g = new THREE.BoxGeometry(1.7, 0.05, 0.1);
    g.rotateZ(s * -0.35);
    g.translate(s * 0.95, 0.25, -0.1);
    return part(g, col("#b88a52"), [0, 0, 0], { faceted: true });
  });
  return merge([h, part(inner, col("#a8743f"), [0, 0, 0], { faceted: true }), ...seats, ...oars]);
}

// ── clouds ──

/** a puffy low-poly cloud (a cluster of lumps, flat underneath, pale blue-grey below), ~16 m long */
export function buildCloud(variant: number): THREE.BufferGeometry {
  const r = rngOf(variant * 131 + 17);
  const n = 5 + variant * 1 + Math.floor(r() * 2);
  const top = col("#fffdf7");
  const under = col("#d8d8e0");
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1) - 0.5;
    const centre = 1 - Math.abs(u) * 1.4;
    const rad = 2.2 + centre * 2.4 + r() * 0.9;
    const g = lump(u * 15 + (r() - 0.5) * 2, rad * 0.45 + r() * 0.8, (r() - 0.5) * 5, rad * 1.15, rad * 0.9, rad, variant * 10 + i, 0.18, 1);
    // flat bottom
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) if (pos.getY(k) < 0.3) pos.setY(k, 0.3 + (pos.getY(k) - 0.3) * 0.12);
    parts.push(
      part(
        g,
        (p, nn) => {
          const k = Math.min(1, Math.max(0, (p.y - 0.2) / 3.2 + nn.y * 0.35));
          return _c.copy(under).lerp(top, k);
        },
        [0, 0, 0],
        { faceted: true, faceColor: true },
      ),
    );
  }
  return merge(parts);
}

/** vertex count helper (for stats): triangles in a non-indexed geometry */
export const trisOf = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
