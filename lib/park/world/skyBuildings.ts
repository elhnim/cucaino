// Sky buildings: the five magical places that stand on flat pads up on the floating mountains
// (lib/park/registry/skyIslands.ts SKY_PADS) — hand-built, chunky, flat-shaded procedural art in
// the storybook-diorama look, bright enough to read with the ink outlines from a high camera.
//   - arcade        the AI Arcade: a crystal-and-neon games tower with a spinning joystick on top
//   - retro-arcade  an 8-bit voxel castle with pixel banners and a bobbing pixel heart
//   - story-theatre an open-air storybook stage framed by a giant open book
//   - library       a leaning wizard's tower with a starry hat roof and flying, flapping books
//   - learning-tree a giant tree of knowledge with a treehouse classroom and a spiral ladder
// Each building is at most five draw calls: one lit vertex-coloured body, one glow mesh (static
// neon/windows), one twinkle mesh (bulbs whose vertex colours pulse), and up to two animated
// meshes (spinning/bobbing/orbiting). Glow goes a little HDR at twilight (<= 1.35) for bloom.
// Deterministic (seeded), no textures/canvas (safe to build in tests), door faces local +z.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface SkyBuilding {
  group: THREE.Group;
  update(dt: number, t: number, glow: number): void;
  dispose(): void;
}

/** the places that have a sky building */
export const SKY_BUILDING_IDS = ["arcade", "retro-arcade", "story-theatre", "library", "learning-tree"] as const;

// ───────────────────────────── small kit ─────────────────────────────

type Paint = string | THREE.Color | ((x: number, y: number, z: number) => THREE.Color);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** a transform: scale, then rotate (Z, then X, then Y — "tilt, then face a direction"), then move */
function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, "YXZ")), new THREE.Vector3(sx, sy, sz));
}
const mul = (a: THREE.Matrix4, b: THREE.Matrix4) => a.clone().multiply(b);

/** a cylinder spanning two points */
function between(a: [number, number, number], b: [number, number, number], rTop: number, rBot: number, seg: number): [THREE.BufferGeometry, THREE.Matrix4] {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return [new THREE.CylinderGeometry(rTop, rBot, len, seg), new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1))];
}

/** primitive -> plain non-indexed position + colour geometry (the primitive is disposed) */
function bake(geo: THREE.BufferGeometry, paint: Paint, m?: THREE.Matrix4): THREE.BufferGeometry {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const p = src.getAttribute("position");
  const n = p.count;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = p.getX(i);
    pos[i * 3 + 1] = p.getY(i);
    pos[i * 3 + 2] = p.getZ(i);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (m) out.applyMatrix4(m);
  const col = new Float32Array(n * 3);
  const fixed = typeof paint === "function" ? null : typeof paint === "string" ? new THREE.Color(paint) : paint;
  for (let i = 0; i < n; i++) {
    const c = fixed ?? (paint as (x: number, y: number, z: number) => THREE.Color)(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  if (src !== geo) src.dispose();
  geo.dispose();
  return out;
}

/** a bag of baked parts that merge into one geometry (one draw call) */
class Parts {
  list: THREE.BufferGeometry[] = [];
  count = 0;
  add(geo: THREE.BufferGeometry, paint: Paint, m?: THREE.Matrix4): number {
    return this.push(bake(geo, paint, m));
  }
  /** an already-coloured geometry (e.g. voxels); returns its first vertex */
  push(g: THREE.BufferGeometry, m?: THREE.Matrix4): number {
    if (m) g.applyMatrix4(m);
    const start = this.count;
    this.list.push(g);
    this.count += g.getAttribute("position").count;
    return start;
  }
  get empty() {
    return this.list.length === 0;
  }
  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.list, false)!;
    for (const x of this.list) x.dispose();
    this.list = [];
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/** glowing bits whose brightness pulses (vertex colours rewritten each frame) */
class Bulbs extends Parts {
  info: { start: number; count: number; c: THREE.Color; ph: number; sp: number; lo: number }[] = [];
  private attr: THREE.BufferAttribute | null = null;
  bulb(geo: THREE.BufferGeometry, color: string, m: THREE.Matrix4, ph: number, sp = 2.5, lo = 0.35) {
    const c = new THREE.Color(color);
    const start = this.add(geo, c, m);
    this.info.push({ start, count: this.count - start, c, ph, sp, lo });
  }
  build(): THREE.BufferGeometry {
    const g = super.build();
    this.attr = g.getAttribute("color") as THREE.BufferAttribute;
    this.attr.setUsage(THREE.DynamicDrawUsage);
    return g;
  }
  update(t: number, glow: number) {
    const a = this.attr;
    if (!a) return;
    const arr = a.array as Float32Array;
    for (const b of this.info) {
      // at twilight the lights sit higher (less dim-down) as well as brighter overall
      const lo = b.lo + (1 - b.lo) * glow * 0.35;
      const k = lo + (1 - lo) * (0.5 + 0.5 * Math.sin(t * b.sp + b.ph));
      const r = b.c.r * k, gg = b.c.g * k, bb = b.c.b * k;
      for (let i = b.start; i < b.start + b.count; i++) {
        arr[i * 3] = r;
        arr[i * 3 + 1] = gg;
        arr[i * 3 + 2] = bb;
      }
    }
    a.needsUpdate = true;
  }
}

/** a merged mesh whose pieces move independently (positions rewritten from a base copy) */
class Dyn {
  private parts = new Parts();
  private ranges: { start: number; count: number }[] = [];
  private base: Float32Array | null = null;
  private attr: THREE.BufferAttribute | null = null;
  private v = new THREE.Vector3();
  /** add one piece made of baked parts; returns its index */
  piece(fill: (p: Parts) => void): number {
    const p = new Parts();
    fill(p);
    const start = this.parts.push(p.build());
    this.ranges.push({ start, count: this.parts.count - start });
    return this.ranges.length - 1;
  }
  build(center: THREE.Vector3, radius: number): THREE.BufferGeometry {
    const g = this.parts.build();
    this.attr = g.getAttribute("position") as THREE.BufferAttribute;
    this.attr.setUsage(THREE.DynamicDrawUsage);
    this.base = (this.attr.array as Float32Array).slice();
    g.boundingSphere = new THREE.Sphere(center, radius);
    return g;
  }
  set(i: number, m: THREE.Matrix4) {
    const r = this.ranges[i];
    const arr = this.attr!.array as Float32Array;
    for (let k = r.start; k < r.start + r.count; k++) this.v.fromArray(this.base!, k * 3).applyMatrix4(m).toArray(arr, k * 3);
  }
  done() {
    this.attr!.needsUpdate = true;
  }
}

// ── voxels: cubes on a grid, only the faces that show are emitted ──
type Vox = Map<string, THREE.Color>;
const vkey = (i: number, j: number, k: number) => `${i},${j},${k}`;
const FACES: [number[], number[], number[]][] = [
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
];
function voxelGeo(cells: Vox, size: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const h = size / 2;
  for (const [key, c] of cells) {
    const [i, j, k] = key.split(",").map(Number);
    const cx = i * size, cy = j * size, cz = k * size;
    for (const [n, u, v] of FACES) {
      if (cells.has(vkey(i + n[0], j + n[1], k + n[2]))) continue;
      const P = (su: number, sv: number) => [cx + h * (n[0] + su * u[0] + sv * v[0]), cy + h * (n[1] + su * u[1] + sv * v[1]), cz + h * (n[2] + su * u[2] + sv * v[2])];
      const a = P(-1, -1), b = P(1, -1), cc = P(1, 1), d = P(-1, 1);
      pos.push(...a, ...b, ...cc, ...a, ...cc, ...d);
      for (let q = 0; q < 6; q++) col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}
/** a pixel picture (rows top→bottom, '.' = empty) as a voxel slab centred on the origin, facing +z */
function pixelGeo(rows: string[], pal: Record<string, string>, px: number, depthCells = 1): THREE.BufferGeometry {
  const cells: Vox = new Map();
  const cache = new Map<string, THREE.Color>();
  const W = Math.max(...rows.map((r) => r.length));
  const H = rows.length;
  rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === "." || ch === " " || !pal[ch]) return;
      let color = cache.get(ch);
      if (!color) cache.set(ch, (color = new THREE.Color(pal[ch])));
      for (let k = 0; k < depthCells; k++) cells.set(vkey(c, H - 1 - r, k), color);
    }),
  );
  const g = voxelGeo(cells, px);
  g.translate(-((W - 1) * px) / 2, -((H - 1) * px) / 2, -((depthCells - 1) * px) / 2);
  return g;
}
const GLYPHS: Record<string, string[]> = {
  A: [".#.", "#.#", "###", "#.#", "#.#"],
  B: ["##.", "#.#", "##.", "#.#", "##."],
  C: [".##", "#..", "#..", "#..", ".##"],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["##.", "..#", ".#.", "#..", "###"],
  "3": ["##.", "..#", ".#.", "..#", "##."],
  "+": ["...", ".#.", "###", ".#.", "..."],
  "?": ["##.", "..#", ".#.", "...", ".#."],
};
/** a word in the 3×5 pixel font, as pixel rows */
function textRows(s: string): string[] {
  return Array.from({ length: 5 }, (_, r) => [...s].map((ch) => (GLYPHS[ch] ?? GLYPHS["?"])[r]).join("."));
}

function archShape(w: number, h: number): THREE.Shape {
  const r = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return s;
}
function starShape(ro: number, ri: number, n = 5): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? ri : ro;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}
const extrude = (shape: THREE.Shape, depth: number, curveSegments = 6) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments });

/** nudge shared vertices by a hash of their position (keeps faces closed), for organic blobs */
function jitter(geo: THREE.BufferGeometry, amt: number, seed: number): THREE.BufferGeometry {
  const p = geo.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = Math.sin(Math.round(x * 100) * 12.9898 + Math.round(y * 100) * 78.233 + Math.round(z * 100) * 37.719 + seed) * 43758.5453;
    const f = 1 + (h - Math.floor(h) - 0.5) * 2 * amt;
    p.setXYZ(i, x * f, y * f, z * f);
  }
  return geo;
}

interface Anim {
  geo: THREE.BufferGeometry;
  glow: boolean;
  at: [number, number, number];
  update(o: THREE.Object3D, t: number): void;
}
interface Spec {
  body: Parts;
  glow: Parts;
  bulbs: Bulbs;
  anims: Anim[];
  /** extra per-frame work (e.g. flying books) */
  tick?: (t: number) => void;
}
const spec = (): Spec => ({ body: new Parts(), glow: new Parts(), bulbs: new Bulbs(), anims: [] });

function assemble(id: string, s: Spec): SkyBuilding {
  const lit = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78, side: THREE.DoubleSide });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const group = new THREE.Group();
  group.name = `sky-building-${id}`;
  const geos: THREE.BufferGeometry[] = [];
  const mk = (g: THREE.BufferGeometry, m: THREE.Material, shadow: boolean, name: string) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.name = `${group.name}-${name}`;
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    geos.push(g);
    group.add(mesh);
    return mesh;
  };
  mk(s.body.build(), lit, true, "body");
  if (!s.glow.empty) mk(s.glow.build(), glowMat, false, "glow");
  if (!s.bulbs.empty) mk(s.bulbs.build(), glowMat, false, "bulbs");
  const anims = s.anims.map((a, i) => {
    const o = mk(a.geo, a.glow ? glowMat : lit, !a.glow, `anim${i}`);
    o.position.set(...a.at);
    return { o, a };
  });
  const b: SkyBuilding = {
    group,
    update(_dt, t, glow) {
      const g = Math.min(1, Math.max(0, glow));
      glowMat.color.setScalar(0.9 + 0.45 * g); // <= 1.35: blooms a little at twilight
      s.bulbs.update(t, g);
      for (const { o, a } of anims) a.update(o, t);
      s.tick?.(t);
    },
    dispose() {
      group.removeFromParent();
      for (const g of geos) g.dispose();
      lit.dispose();
      glowMat.dispose();
    },
  };
  b.update(0, 0, 0);
  return b;
}

// point on a regular polygon's perimeter (vertex k at angle k*2π/n + off), u in [0,1)
function polyPoint(R: number, n: number, off: number, u: number): [number, number] {
  const f = u * n;
  const k = Math.floor(f);
  const a0 = (k / n) * Math.PI * 2 + off, a1 = ((k + 1) / n) * Math.PI * 2 + off;
  const w = f - k;
  return [R * (Math.sin(a0) * (1 - w) + Math.sin(a1) * w), R * (Math.cos(a0) * (1 - w) + Math.cos(a1) * w)];
}

// ───────────────────────────── AI Arcade ─────────────────────────────
// a faceted violet crystal tower: a glowing portal door under a marquee "AI" sign, game screens
// on every facet, neon edges, a gold eave with chasing bulbs, a pink upper tier with a crystal
// crown and a giant joystick spinning on top, circled by holographic stars.
function buildArcade(low: boolean): Spec {
  const s = spec();
  const { body, glow, bulbs } = s;
  const seg = low ? 8 : 10;
  const off = Math.PI / seg; // a flat facet faces the door
  const facet = (k: number) => (k / seg) * Math.PI * 2;
  // stepped base
  body.add(new THREE.CylinderGeometry(4.35, 4.6, 0.35, seg * 2), "#5b4bb0", M(0, 0.175, 0));
  body.add(new THREE.CylinderGeometry(3.7, 3.9, 0.3, seg), "#8470dc", M(0, 0.5, 0, 0, off));
  // tier 1
  const y0 = 0.65, H1 = 5.3, rb = 3.0, rt = 2.7;
  body.add(new THREE.CylinderGeometry(rt, rb, H1, seg), "#8364f0", M(0, y0 + H1 / 2, 0, 0, off));
  const rAt = (y: number) => rb + ((rt - rb) * (y - y0)) / H1;
  const ap = (y: number) => rAt(y) * Math.cos(Math.PI / seg);
  const tilt = Math.atan((rb - rt) / H1);
  const onFacet = (k: number, y: number, out: number) => M(Math.sin(facet(k)) * (ap(y) + out), y, Math.cos(facet(k)) * (ap(y) + out), -tilt, facet(k));
  // game screens on the facets
  const scr = ["#46f0ff", "#ff5fd2", "#8dff5a", "#ffe45c", "#ff8a3d", "#a47bff"];
  for (let k = 1; k < seg; k++)
    for (const [row, y] of [[0, 2.2], [1, 4.2]] as const) {
      if (row === 0 && (k === 1 || k === seg - 1)) continue;
      body.add(new THREE.BoxGeometry(1.2, 0.95, 0.16), "#2b2358", onFacet(k, y, 0.02));
      const c = scr[(k * 2 + row * 3) % scr.length];
      bulbs.bulb(new THREE.PlaneGeometry(1.0, 0.74), c, onFacet(k, y, 0.11), k * 1.7 + row, 1.3 + (k % 3) * 0.7, 0.6);
      // a little game "sprite" on each screen
      const sprite = mul(onFacet(k, y, 0.115), M((((k + row) % 3) - 1) * 0.22, -0.08 + (row ? 0.1 : 0), 0));
      glow.add(new THREE.PlaneGeometry(0.16, 0.16), "#ffffff", sprite);
      glow.add(new THREE.PlaneGeometry(0.34, 0.06), "#1a1440", mul(onFacet(k, y, 0.115), M(0, -0.22, 0)));
    }
  // neon edges on the facet corners (not behind the portal)
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2 + off;
    if (Math.cos(a) > 0.8) continue;
    const r = (rAt(y0 + H1 / 2) + 0.02);
    glow.add(new THREE.BoxGeometry(0.09, H1 - 0.5, 0.09), i % 2 ? "#ff5fd2" : "#46f0ff", M(Math.sin(a) * r, y0 + H1 / 2, Math.cos(a) * r, -tilt, a));
  }
  // the portal door: crystal pillars, a pink arch, a glowing violet portal inside
  const pH = 2.8, pz = 2.95;
  for (const sx of [-1, 1]) {
    body.add(new THREE.BoxGeometry(0.55, pH, 1.1), "#43c6e6", M(sx * 1.4, y0 + pH / 2, pz));
    body.add(new THREE.OctahedronGeometry(0.34, 0), "#9ff4ff", M(sx * 1.4, y0 + pH + 0.05, pz + 0.3, 0, 0, 0, 0.9, 1.3, 0.9));
    glow.add(new THREE.BoxGeometry(0.07, pH, 0.07), "#46f0ff", M(sx * 1.13, y0 + pH / 2, pz + 0.5));
  }
  body.add(new THREE.TorusGeometry(1.4, 0.3, 6, low ? 8 : 12, Math.PI), "#ff5fae", M(0, y0 + pH, pz, 0, 0, 0, 1, 1, 1.8));
  glow.add(new THREE.TorusGeometry(1.12, 0.06, 4, low ? 8 : 12, Math.PI), "#46f0ff", M(0, y0 + pH, pz + 0.5));
  body.add(extrude(archShape(2.25, pH + 1.125), 0.9, low ? 5 : 8), "#1d1540", M(0, y0, 2.45));
  const pinkV = new THREE.Color("#ff6ad5"), violet = new THREE.Color("#4a2bd0");
  const portal = (_x: number, y: number) => violet.clone().lerp(pinkV, Math.max(0, Math.min(1, 1 - (y - y0) / 3.6)));
  glow.add(new THREE.ShapeGeometry(archShape(1.75, pH + 0.8), low ? 5 : 8), portal, M(0, y0, 3.36));
  // marquee sign above the door
  const signY = 5.35;
  body.add(new THREE.BoxGeometry(3.2, 1.05, 0.22), "#ffc94a", M(0, signY, 2.98));
  body.add(new THREE.BoxGeometry(2.9, 0.8, 0.3), "#231a55", M(0, signY, 3.04));
  glow.push(pixelGeo(textRows("AI"), { "#": "#3cc4d4" }, 0.13), M(0, signY, 3.22));
  {
    const n = low ? 12 : 18;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      // around the frame's perimeter
      const per = 2 * (3.2 + 1.05);
      let d = u * per, x = 0, y = 0;
      if (d < 3.2) (x = -1.6 + d), (y = 0.525);
      else if ((d -= 3.2) < 1.05) (x = 1.6), (y = 0.525 - d);
      else if ((d -= 1.05) < 3.2) (x = 1.6 - d), (y = -0.525);
      else (d -= 3.2), (x = -1.6), (y = -0.525 + d);
      bulbs.bulb(new THREE.IcosahedronGeometry(0.07, 0), i % 2 ? "#fff1a8" : "#ff9be0", M(x, signY + y, 3.12), -i * 0.8, 6, 0.25);
    }
  }
  // gold eave with chasing marquee bulbs
  const eaveY = y0 + H1;
  body.add(new THREE.CylinderGeometry(3.5, 2.95, 0.45, seg), "#ffc94a", M(0, eaveY + 0.225, 0, 0, off));
  {
    const n = low ? 20 : 30;
    const bc = ["#fff1a8", "#ff7fd8", "#6ff6ff"];
    for (let i = 0; i < n; i++) {
      const [x, z] = polyPoint(3.52, seg, off, i / n);
      bulbs.bulb(new THREE.IcosahedronGeometry(0.12, 0), bc[i % 3], M(x, eaveY + 0.27, z), -i * 0.9, 5, 0.2);
    }
  }
  // tier 2 with portholes, a neon band and a crystal crown
  const y2 = eaveY + 0.45, H2 = 1.2;
  body.add(new THREE.CylinderGeometry(1.95, 2.25, H2, seg), "#ff6fb5", M(0, y2 + H2 / 2, 0, 0, off));
  const t2 = Math.atan(0.3 / H2);
  for (let k = 0; k < seg; k++) {
    const a = facet(k), r = 2.1 * Math.cos(Math.PI / seg) + 0.03;
    body.add(new THREE.TorusGeometry(0.3, 0.07, 4, 8), "#ffc94a", M(Math.sin(a) * r, y2 + 0.6, Math.cos(a) * r, -t2, a));
    bulbs.bulb(new THREE.CircleGeometry(0.28, 8), k % 2 ? "#6ff6ff" : "#fff1a8", M(Math.sin(a) * (r + 0.01), y2 + 0.6, Math.cos(a) * (r + 0.01), -t2, a), k * 0.9, 1.1, 0.7);
  }
  glow.add(new THREE.CylinderGeometry(1.99, 2.0, 0.14, seg, 1, true), "#46f0ff", M(0, y2 + H2 - 0.07, 0, 0, off));
  for (let k = 0; k < seg; k++) {
    const a = facet(k) + off;
    body.add(new THREE.OctahedronGeometry(0.34, 0), k % 2 ? "#e3adff" : "#8ff0ff", M(Math.sin(a) * 1.8, y2 + H2 + 0.3, Math.cos(a) * 1.8, 0.4, a, 0, 0.62, 1.7, 0.62));
  }
  // pedestal + projector ring
  const pedY = y2 + H2;
  body.add(new THREE.CylinderGeometry(1.25, 1.6, 0.3, seg), "#ffc94a", M(0, pedY + 0.15, 0, 0, off));
  glow.add(new THREE.TorusGeometry(1.2, 0.06, 4, low ? 16 : 24), "#6ff6ff", M(0, pedY + 0.32, 0, Math.PI / 2));
  // crystal clusters round the base
  const cr = rng(11);
  for (const a0 of [0.8, 2.35, 3.93, 5.5]) {
    for (let j = 0; j < (low ? 2 : 3); j++) {
      const a = a0 + (j - 1) * 0.22;
      const r = 3.45 + cr() * 0.25;
      const h = 1.1 + cr() * 1.1;
      body.add(new THREE.OctahedronGeometry(0.3, 0), ["#8ff0ff", "#ff9be0", "#c9a6ff"][(j + Math.round(a0)) % 3], M(Math.sin(a) * r, 0.35 + h * 0.4, Math.cos(a) * r, 0.25 * (j - 1) + 0.2, a, 0, 0.9, h / 0.6 / 1.2, 0.9));
    }
  }
  // the giant joystick on top (spins and bobs)
  const js = new Parts();
  const sg = low ? 7 : 10;
  js.add(new THREE.BoxGeometry(1.7, 0.42, 1.3), "#3d3a9c", M(0, 0.21, 0));
  js.add(new THREE.BoxGeometry(1.78, 0.1, 1.38), "#ffc94a", M(0, 0.44, 0));
  js.add(new THREE.CylinderGeometry(0.1, 0.14, 1.0, 7), "#d6dbe8", M(-0.35, 0.95, 0));
  js.add(new THREE.SphereGeometry(0.46, sg, Math.round(sg * 0.7)), "#ff3355", M(-0.35, 1.5, 0));
  js.add(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 8), "#ffe45c", M(0.35, 0.53, 0.25));
  js.add(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 8), "#46f0ff", M(0.62, 0.53, -0.18));
  js.add(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 8), "#8dff5a", M(0.28, 0.53, -0.32));
  const jy = pedY + 0.45;
  const jsGeo = js.build().scale(1.3, 1.3, 1.3);
  s.anims.push({ geo: jsGeo, glow: false, at: [0, jy, 0], update: (o, t) => ((o.rotation.y = t * 0.7), (o.position.y = jy + Math.sin(t * 1.7) * 0.12)) });
  // holographic stars circling it
  const hs = new Parts();
  const sc = ["#ffe45c", "#6ff6ff", "#ff7fd8"];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    hs.add(extrude(starShape(0.42, 0.18), 0.1, 1), sc[i], M(Math.sin(a) * 1.9, 1.0 + (i % 2) * 0.55, Math.cos(a) * 1.9, 0, a + Math.PI / 2));
  }
  s.anims.push({ geo: hs.build(), glow: true, at: [0, jy, 0], update: (o, t) => ((o.rotation.y = -t * 1.1), (o.position.y = jy + Math.sin(t * 1.7 + 1) * 0.1)) });
  return s;
}

// ───────────────────────────── Retro Arcade ─────────────────────────────
// an 8-bit castle built from candy voxel blocks: a lavender keep, sky-blue corner towers with
// chunky battlements and pixel flags, a pink donjon with a glowing space invader, pixel banners
// by the door, and a big pixel heart bobbing and spinning above, circled by gold pixel coins.
function buildRetro(low: boolean): Spec {
  const s = spec();
  const { body, glow, bulbs } = s;
  const V = 0.72;
  const R = rng(7);
  const cache = new Map<string, THREE.Color>();
  const C = (h: string) => {
    let c = cache.get(h);
    if (!c) cache.set(h, (c = new THREE.Color(h)));
    return c;
  };
  const pick = (pal: string[], accent: string) => (R() < 0.08 ? C(accent) : C(pal[Math.floor(R() * pal.length)]));
  const keep = ["#a996f5", "#9481ea", "#b8a9ff", "#9f8cf0"];
  const tower = ["#5cc8ec", "#49b4dc", "#78d8f5"];
  const don = ["#ff7fb3", "#f26aa2", "#ff99c6"];
  const gold = "#ffcf4a";
  const cells: Vox = new Map();
  const set = (i: number, j: number, k: number, c: THREE.Color) => cells.set(vkey(i, j, k), c);
  const onTower = (i: number, k: number) => Math.abs(i) >= 2 && Math.abs(k) >= 2;
  // keep 7×7, 6 high (top course gold)
  for (let i = -3; i <= 3; i++) for (let k = -3; k <= 3; k++) for (let j = 0; j <= 5; j++) set(i, j, k, j === 5 ? C(gold) : pick(keep, "#ff8fc8"));
  // corner towers 3×3, 8 high + merlons
  for (const cx of [-3, 3])
    for (const cz of [-3, 3]) {
      for (let i = cx - 1; i <= cx + 1; i++)
        for (let k = cz - 1; k <= cz + 1; k++) {
          for (let j = 0; j <= 7; j++) set(i, j, k, j === 7 ? C(gold) : pick(tower, "#ffffff"));
          if (i !== cx && k !== cz) set(i, 8, k, pick(tower, "#ffffff"));
        }
    }
  // donjon 5×5 on the keep, 4 high + merlons
  for (let i = -2; i <= 2; i++)
    for (let k = -2; k <= 2; k++) {
      for (let j = 6; j <= 9; j++) set(i, j, k, j === 9 ? C(gold) : pick(don, "#ffe45c"));
      if ((Math.abs(i) === 2 || Math.abs(k) === 2) && (i + k) % 2 === 0) set(i, 10, k, pick(don, "#ffe45c"));
    }
  // keep battlements on the ring outside the donjon
  for (let i = -3; i <= 3; i++) for (let k = -3; k <= 3; k++) if ((Math.abs(i) === 3 || Math.abs(k) === 3) && !onTower(i, k) && (i + k) % 2 !== 0) set(i, 6, k, pick(keep, "#ff8fc8"));
  // the doorway: a 3-wide pixel arch, dark inside
  for (const [i, j] of [[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [-1, 2], [0, 2], [1, 2], [0, 3]]) {
    cells.delete(vkey(i, j, 3));
    set(i, j, 2, C("#2a1f4a"));
  }
  body.push(voxelGeo(cells, V), M(0, V / 2, 0));
  // warm light in the doorway
  const dz = 2 * V + V / 2 + 0.012;
  glow.add(new THREE.PlaneGeometry(3 * V, 3 * V), "#ffb44a", M(0, 1.5 * V, dz));
  glow.add(new THREE.PlaneGeometry(V, V), "#ffb44a", M(0, 3.5 * V, dz));
  // checker path to the door
  for (let i = -1; i <= 1; i++) for (const k of [4, 5]) body.add(new THREE.BoxGeometry(V, 0.12, V), (i + k) % 2 ? "#ffd36b" : "#ff8fc8", M(i * V, 0.06, k * V));
  // pixel banners on the front towers
  const banners: [string[], Record<string, string>][] = [
    [["RRRRR", "RRYRR", "RYYYR", "YYYYY", "RYRYR", "RRRRR", "R.R.R"], { R: "#e8323c", Y: "#ffd23a" }],
    [["BBBBB", "BRRRB", "RWRWR", "RRRRR", "BWWWB", "BWBWB", "B.B.B"], { B: "#3a6ad8", R: "#e8323c", W: "#ffffff" }],
  ];
  const tf = 4.5 * V; // front face of the front towers
  [-3, 3].forEach((cx, n) => {
    const [rows, pal] = banners[n];
    body.push(pixelGeo(rows, pal, 0.2), M(cx * V, 4.15, tf + 0.035, 0, 0, 0, 1, 1, 0.3));
    body.add(new THREE.BoxGeometry(1.25, 0.08, 0.08), gold, M(cx * V, 4.9, tf + 0.06));
  });
  // pixel flags on the towers
  [[-3, -3], [3, -3], [-3, 3], [3, 3]].forEach(([cx, cz], n) => {
    const top = 8 * V;
    body.add(new THREE.BoxGeometry(0.09, 1.5, 0.09), "#f4f4f8", M(cx * V, top + 0.75, cz * V));
    const side = cx < 0 ? -1 : 1;
    const fc = ["#ffd23a", "#8dff5a", "#ff5fd2", "#ff8a3d"][n];
    body.push(pixelGeo(["FFFF", "FFF.", "FF.."].map((r) => (side < 0 ? [...r].reverse().join("") : r)), { F: fc }, 0.18), M(cx * V + side * 0.4, top + 1.2, cz * V, 0, 0, 0, 1, 1, 0.35));
  });
  // a glowing space invader on the donjon front
  glow.push(
    pixelGeo(["..#.....#..", "...#...#...", "..#######..", ".##.###.##.", "###########", "#.#######.#", "#.#.....#.#", "...##.##..."], { "#": "#3fb85a" }, 0.19),
    M(0, 5.55, 2.5 * V + 0.03, 0, 0, 0, 1, 1, 0.2),
  );
  // windows that flicker like arcade screens
  const wc = ["#46f0ff", "#ff5fd2", "#ffe45c", "#8dff5a"];
  let wi = 0;
  const win = (x: number, y: number, z: number, ry: number) => bulbs.bulb(new THREE.PlaneGeometry(V * 0.7, V * 1.6), wc[wi % 4], M(x, y, z, 0, ry), wi++ * 1.3, 1.6 + (wi % 3) * 0.6, 0.55);
  const tw = 4.5 * V + 0.012;
  for (const cx of [-3, 3])
    for (const cz of [-3, 3]) {
      win(Math.sign(cx) * tw, 3.6, cz * V, Math.sign(cx) * (Math.PI / 2));
      if (cz < 0) win(cx * V, 3.6, -tw, Math.PI);
      if (!low) win(Math.sign(cx) * tw, 1.4, cz * V, Math.sign(cx) * (Math.PI / 2));
    }
  for (const sx of [-1, 1]) win(sx * (3.5 * V + 0.012), 2.2, 0, sx * (Math.PI / 2));
  for (const cx of [-3, 3]) {
    win(cx * V, 1.55, tw, 0);
    // chasing marquee lights along the front towers' gold course
    for (let i = 0; i < 4; i++) bulbs.bulb(new THREE.BoxGeometry(0.17, 0.17, 0.05), i % 2 ? "#ff7fd8" : "#fff1a8", M(cx * V + (i - 1.5) * 0.5, 7.5 * V, tw + 0.02), -(i + (cx > 0 ? 4 : 0)) * 0.9, 5, 0.2);
  }
  win(0, 2.2, -(3.5 * V + 0.012), Math.PI);
  // the pixel heart (spins, bobs)
  const hy = 9.3;
  const heart = new Parts();
  heart.push(pixelGeo([".RR.RR.", "RWRRRRR", "RWRRRDR", ".RRRDR.", "..RDR..", "...R..."], { R: "#ff3355", W: "#ffffff", D: "#c81e45" }, 0.25, 2));
  s.anims.push({ geo: heart.build(), glow: true, at: [0, hy, 0], update: (o, t) => ((o.rotation.y = t * 1.2), (o.position.y = hy + Math.sin(t * 2) * 0.15)) });
  // gold pixel coins circling it
  const coins = new Parts();
  const nc = low ? 3 : 4;
  for (let i = 0; i < nc; i++) {
    const a = (i / nc) * Math.PI * 2;
    coins.push(pixelGeo([".YYY.", "YYOYY", "YYOYY", "YYOYY", ".YYY."], { Y: "#ffd23a", O: "#e89a18" }, 0.14), M(Math.sin(a) * 1.5, (i % 2 ? 0.35 : -0.35), Math.cos(a) * 1.5, 0, a));
  }
  s.anims.push({ geo: coins.build(), glow: true, at: [0, hy, 0], update: (o, t) => ((o.rotation.y = -t * 0.8), (o.position.y = hy + Math.sin(t * 2 + 1.5) * 0.1)) });
  return s;
}

// ───────────────────────────── Story Theatre ─────────────────────────────
// an open-air stage framed by a giant open book: stacks of books for pillars, the pages arching
// over the stage with a ribbon bookmark and a spinning gold star on the spine, red velvet
// curtains swagged open, a starry night backdrop, footlights, lanterns and little benches.
function buildTheatre(low: boolean): Spec {
  const s = spec();
  const { body, glow, bulbs } = s;
  const seg = low ? 10 : 16;
  const R = rng(3);
  const sz = -0.3; // the stage's front edge
  const top = 0.9; // stage floor height
  // curved stage (the back half of a disc) with a red apron and gold trim, steps up the front
  body.add(new THREE.CylinderGeometry(4.2, 4.3, top, seg, 1, false, Math.PI / 2, Math.PI), "#c98a4b", M(0, top / 2, sz));
  body.add(new THREE.CylinderGeometry(4.0, 4.0, 0.05, seg, 1, false, Math.PI / 2, Math.PI), "#e5a866", M(0, top + 0.02, sz));
  body.add(new THREE.BoxGeometry(8.6, top, 0.12), "#9a2a3a", M(0, top / 2, sz + 0.02));
  body.add(new THREE.BoxGeometry(8.7, 0.12, 0.2), "#ffc94a", M(0, top + 0.02, sz + 0.05));
  body.add(new THREE.BoxGeometry(1.8, 0.3, 0.45), "#d9a066", M(0, 0.15, sz + 0.28));
  body.add(new THREE.BoxGeometry(1.8, 0.6, 0.3), "#d9a066", M(0, 0.3, sz + 0.1));
  // night-sky backdrop: an arc of panels behind the stage, with twinkling stars and a moon
  const nP = low ? 7 : 10;
  const a0 = Math.PI * 0.56, a1 = Math.PI * 1.44;
  const bR = 4.05, bH = 5.2;
  for (let i = 0; i < nP; i++) {
    const a = a0 + ((i + 0.5) / nP) * (a1 - a0);
    const w = 2 * bR * Math.sin((a1 - a0) / nP / 2) + 0.06;
    body.add(new THREE.BoxGeometry(w, bH, 0.22), "#2c2f86", M(Math.sin(a) * bR, top + bH / 2, sz + Math.cos(a) * bR, 0, a));
    body.add(new THREE.BoxGeometry(w, 0.18, 0.28), "#ffc94a", M(Math.sin(a) * bR, top + bH, sz + Math.cos(a) * bR, 0, a));
  }
  const nS = low ? 9 : 16;
  for (let i = 0; i < nS; i++) {
    const a = a0 + 0.12 + R() * (a1 - a0 - 0.24);
    const y = top + 1.6 + R() * 3.2;
    const r = bR - 0.14;
    bulbs.bulb(extrude(starShape(0.16 + R() * 0.1, 0.07), 0.03, 1), R() < 0.3 ? "#bfe8ff" : "#fff1a8", M(Math.sin(a) * r, y, sz + Math.cos(a) * r, 0, a + Math.PI), R() * 6, 1.5 + R() * 2, 0.3);
  }
  {
    // crescent moon painted on the backdrop
    const pts: THREE.Vector2[] = [];
    const n = low ? 6 : 10;
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI;
      pts.push(new THREE.Vector2(Math.cos(a) * 0.65, Math.sin(a) * 0.65));
    }
    for (let i = n - 1; i > 0; i--) {
      const a = -Math.PI / 2 + (i / n) * Math.PI;
      pts.push(new THREE.Vector2(Math.cos(a) * 0.28, Math.sin(a) * 0.62));
    }
    const a = Math.PI * 1.18, r = bR - 0.13;
    glow.add(new THREE.ShapeGeometry(new THREE.Shape(pts)), "#ffe9a0", M(Math.sin(a) * r, top + 3.9, sz + Math.cos(a) * r, 0, a + Math.PI));
  }
  // cardboard trees on the stage
  for (const sx of [-1, 1]) {
    body.add(new THREE.CylinderGeometry(0, 0.9, 2.2, 3), "#4cc26a", M(sx * 2.4, top + 1.7, sz - 2.3, 0, Math.PI / 6 + (sx < 0 ? 0 : Math.PI), 0, 1, 1, 0.18));
    body.add(new THREE.CylinderGeometry(0, 0.7, 1.6, 3), "#6fd66a", M(sx * 2.4, top + 2.6, sz - 2.28, 0, Math.PI / 6, 0, 1, 1, 0.18));
    body.add(new THREE.BoxGeometry(0.22, 0.7, 0.08), "#8a5a36", M(sx * 2.4, top + 0.35, sz - 2.3));
  }
  // ── the open book proscenium ──
  const bz = -0.05; // back of the pages
  const lintel = (grow: number) => {
    const g = grow;
    const sh = new THREE.Shape();
    sh.moveTo(-4.6 - g, 5.0);
    sh.lineTo(-4.6 - g, 6.6 + g);
    sh.bezierCurveTo(-3.8 - g, 7.4 + g, -1.4, 7.7 + g, 0, 6.8 + g * 0.6);
    sh.bezierCurveTo(1.4, 7.7 + g, 3.8 + g, 7.4 + g, 4.6 + g, 6.6 + g);
    sh.lineTo(4.6 + g, 5.0);
    sh.lineTo(3.3 - g * 0.5, 5.0);
    sh.bezierCurveTo(3.0, 6.0 - g, 1.0, 6.2 - g, 0, 6.0 - g);
    sh.bezierCurveTo(-1.0, 6.2 - g, -3.0, 6.0 - g, -3.3 + g * 0.5, 5.0);
    sh.lineTo(-4.6 - g, 5.0);
    return sh;
  };
  body.add(extrude(lintel(0), 0.5, low ? 5 : 10), "#fff3d6", M(0, 0, bz));
  body.add(extrude(lintel(0.22), 0.3, low ? 5 : 10), "#b3302b", M(0, 0, bz - 0.32));
  // page lines on the front
  const fz = bz + 0.52;
  for (const sx of [-1, 1])
    for (const d of low ? [0.3, 0.65] : [0.25, 0.5, 0.75, 1.0]) {
      const c = new THREE.CubicBezierCurve3(
        new THREE.Vector3(sx * 4.35, 6.55 - d * 0.9, fz),
        new THREE.Vector3(sx * 3.6, 7.3 - d, fz),
        new THREE.Vector3(sx * 1.4, 7.55 - d, fz),
        new THREE.Vector3(sx * 0.15, 6.75 - d * 0.55, fz),
      );
      body.add(new THREE.TubeGeometry(c, low ? 6 : 10, 0.028, 3, false), "#d9b98a");
    }
  // gold spine, a ribbon bookmark hanging into the arch
  body.add(new THREE.BoxGeometry(0.18, 1.0, 0.56), "#ffc94a", M(0, 6.4, bz + 0.26));
  body.add(new THREE.BoxGeometry(0.22, 1.3, 0.04), "#e8323c", M(0.12, 5.55, fz + 0.03));
  body.add(new THREE.ConeGeometry(0.16, 0.25, 3), "#e8323c", M(0.12, 4.83, fz + 0.03, 0, 0, Math.PI));
  // pillars: stacks of chunky books
  const bookC = ["#e8453c", "#3a6ad8", "#4cc26a", "#ffb030", "#a064e0", "#2fb8b0", "#ff7fb3"];
  for (const sx of [-1, 1]) {
    let y = 0;
    let n = 0;
    while (y < 5.0) {
      const h = Math.min(0.55 + R() * 0.35, 5.05 - y);
      const w = 1.15 + R() * 0.25, d = 0.95 + R() * 0.2;
      const ry = (R() - 0.5) * 0.3;
      const c = bookC[(n + (sx > 0 ? 3 : 0)) % bookC.length];
      body.add(new THREE.BoxGeometry(w, h, d), c, M(sx * 3.95, y + h / 2, bz + 0.1, 0, ry));
      // page edge (cream) on the stage side, gold band on the front
      body.add(new THREE.BoxGeometry(0.06, h * 0.8, d * 0.9), "#fff3d6", M(sx * 3.95 - sx * (w / 2 + 0.01) * Math.cos(ry), y + h / 2, bz + 0.1 + sx * (w / 2) * Math.sin(ry), 0, ry));
      body.add(new THREE.BoxGeometry(w * 0.9, 0.08, 0.04), "#ffc94a", M(sx * 3.95 + Math.sin(ry) * (d / 2), y + h * 0.3, bz + 0.1 + Math.cos(ry) * (d / 2 + 0.01), 0, ry));
      y += h;
      n++;
    }
  }
  // red velvet curtains, swagged open with gold tiebacks
  const velvet = new THREE.Color("#d8304a"), fold = new THREE.Color("#8a1428");
  const nu = low ? 8 : 14, nv = low ? 6 : 10;
  const tie = 0.38;
  const sm = (x: number) => x * x * (3 - 2 * x);
  for (const sx of [-1, 1]) {
    const g = new THREE.PlaneGeometry(1, 1, nu, nv);
    const p = g.getAttribute("position");
    const cols: THREE.Color[] = [];
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5;
      const inner = v > tie ? -2.75 + (1.45 * sm((v - tie) / (1 - tie))) : -2.35 - 0.4 * sm(v / tie);
      const x = -3.45 + (inner + 3.45) * u;
      const width = inner + 3.45;
      const ph = Math.sin(u * Math.PI * 6);
      p.setXYZ(i, sx * x, top + v * 5.2, -0.2 + ph * 0.14 * Math.min(1, width / 1.2));
      cols.push(fold.clone().lerp(velvet, 0.5 + 0.5 * ph));
    }
    let k = 0;
    const byIndex = cols;
    // colour per vertex (the plane is indexed; bake keeps vertex order through toNonIndexed)
    const idx = g.index!;
    const out = bake(g, () => byIndex[idx.getX(k++)]);
    body.push(out);
    body.add(new THREE.TorusGeometry(0.2, 0.07, 4, 8), "#ffc94a", M(sx * 2.85, top + tie * 5.2, -0.05, 0, Math.PI / 2));
  }
  // scalloped valance under the arch, with gold tassels
  {
    const nx = low ? 18 : 30;
    const g = new THREE.PlaneGeometry(1, 1, nx, 1);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5;
      const x = -3.4 + u * 6.8;
      const arch = 5.0 + 1.0 * Math.sqrt(Math.max(0, 1 - (x / 3.35) ** 2));
      const bot = arch - 0.45 - 0.28 * Math.abs(Math.sin(u * Math.PI * 3));
      p.setXYZ(i, x, v > 0.5 ? 6.3 : bot, -0.12);
    }
    body.add(g, "#c4213a");
    for (let i = 0; i <= (low ? 10 : 20); i++) {
      const u = i / (low ? 10 : 20);
      const x = -3.3 + u * 6.6;
      const arch = 5.0 + 1.0 * Math.sqrt(Math.max(0, 1 - (x / 3.35) ** 2));
      const bot = arch - 0.45 - 0.28 * Math.abs(Math.sin(((x + 3.4) / 6.8) * Math.PI * 3));
      body.add(new THREE.BoxGeometry(0.07, 0.16, 0.07), "#ffc94a", M(x, bot - 0.05, -0.1));
    }
  }
  // footlights along the stage edge
  const nf = low ? 5 : 9;
  for (let i = 0; i < nf; i++) {
    const x = -3.2 + (i / (nf - 1)) * 6.4;
    if (Math.abs(x) < 1.0) continue;
    body.add(new THREE.BoxGeometry(0.34, 0.1, 0.22), "#3a3a44", M(x, top + 0.08, sz - 0.18));
    bulbs.bulb(new THREE.SphereGeometry(0.13, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), "#fff1a8", M(x, top + 0.12, sz - 0.18), i * 0.7, 1.2, 0.75);
  }
  // lantern posts at the front corners, and two paper lanterns hanging from the book
  for (const sx of [-1, 1]) {
    const x = sx * 3.3, z = 2.3;
    body.add(new THREE.CylinderGeometry(0.07, 0.1, 2.5, 6), "#ffc94a", M(x, 1.25, z));
    body.add(new THREE.BoxGeometry(0.5, 0.08, 0.5), "#9a2a3a", M(x, 2.5, z));
    body.add(new THREE.ConeGeometry(0.4, 0.35, 4), "#9a2a3a", M(x, 3.18, z, 0, Math.PI / 4));
    bulbs.bulb(new THREE.BoxGeometry(0.36, 0.5, 0.36), "#ffc86a", M(x, 2.79, z), sx * 2, 3.1, 0.7);
    body.add(new THREE.BoxGeometry(0.02, 0.5, 0.02), "#6b4a2e", M(sx * 2.2, 5.0, 0.35));
    bulbs.bulb(new THREE.IcosahedronGeometry(0.28, 0), sx < 0 ? "#ff9be0" : "#ffb86a", M(sx * 2.2, 4.62, 0.35, 0, 0, 0, 1, 1.25, 1), sx * 1.3 + 1, 2.4, 0.7);
  }
  // little benches for the audience (an aisle down the middle to the stage)
  const benchC = ["#6fbfe8", "#ffb3c7", "#9be38a", "#ffd36b"];
  let bi = 0;
  for (const z of [1.9, 3.3])
    for (const sx of [-1, 1]) {
      const x = sx * 1.55;
      const c = benchC[bi++ % 4];
      body.add(new THREE.BoxGeometry(1.9, 0.14, 0.5), c, M(x, 0.45, z));
      body.add(new THREE.BoxGeometry(1.9, 0.45, 0.1), c, M(x, 0.8, z + 0.28));
      for (const lx of [-0.75, 0.75]) body.add(new THREE.BoxGeometry(0.12, 0.42, 0.4), "#8a5a36", M(x + lx, 0.21, z));
    }
  // the gold star spinning on top of the book
  const star = new Parts();
  star.add(extrude(starShape(0.62, 0.27), 0.2, 1), "#ffc94a", M(0, 0, -0.1));
  star.add(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 5), "#ffc94a", M(0, -0.7, 0));
  const syTop = 7.62;
  s.anims.push({ geo: star.build(), glow: false, at: [0, syTop, bz + 0.26], update: (o, t) => (o.rotation.y = t * 1.3) });
  // glowing stars dangling on strings above the stage, gently swinging
  const hang = new Parts();
  const hangers: [number, number, string][] = [[-1.6, 1.3, "#fff1a8"], [-0.5, 0.9, "#bfe8ff"], [0.6, 1.5, "#ffb3e6"], [1.7, 1.0, "#fff1a8"]];
  for (const [x, len, c] of hangers) {
    hang.add(new THREE.BoxGeometry(0.02, len, 0.02), "#3a2a4a", M(x, -len / 2, 0));
    hang.add(extrude(starShape(0.26, 0.11), 0.05, 1), c, M(x, -len - 0.2, -0.025));
  }
  const hy = 5.9, hz = -1.4;
  s.anims.push({ geo: hang.build(), glow: true, at: [0, hy, hz], update: (o, t) => ((o.rotation.z = Math.sin(t * 0.9) * 0.05), (o.rotation.x = Math.sin(t * 0.7 + 1) * 0.06)) });
  return s;
}

// ───────────────────────────── Library ─────────────────────────────
// a crooked wizard's tower: three leaning stone storeys with glowing round windows, an open
// arched door spilling warm light, a tall floppy starry wizard-hat roof with a pulsing magic
// lamp dangling from its drooping tip — and books flapping round it like birds.
function buildLibrary(low: boolean): Spec {
  const s = spec();
  const { body, glow, bulbs } = s;
  const seg = low ? 8 : 12;
  const R = rng(5);
  body.add(new THREE.CylinderGeometry(2.75, 2.95, 0.35, seg), "#9ba3c4", M(0, 0.175, 0));
  const secs = [
    { h: 2.5, r0: 2.35, r1: 2.2, dx: 0, c: "#eadfc8" },
    { h: 2.2, r0: 2.15, r1: 2.0, dx: 0.22, c: "#ddd0f2" },
    { h: 1.9, r0: 1.95, r1: 1.8, dx: 0.48, c: "#eadfc8" },
  ];
  let y = 0.35;
  const secAt: { y0: number; y1: number; r0: number; r1: number; dx: number }[] = [];
  for (const sc of secs) {
    body.add(new THREE.CylinderGeometry(sc.r1, sc.r0, sc.h, seg), sc.c, M(sc.dx, y + sc.h / 2, 0, 0, 0.13));
    secAt.push({ y0: y, y1: y + sc.h, r0: sc.r0, r1: sc.r1, dx: sc.dx });
    y += sc.h;
    body.add(new THREE.CylinderGeometry(sc.r1 + 0.22, sc.r1 + 0.18, 0.24, seg), "#b89f7e", M(sc.dx, y, 0, 0, 0.13));
  }
  const towerTop = y; // 6.95
  const surf = (a: number, yy: number, out = 0.04) => {
    const sc = secAt.find((q) => yy >= q.y0 && yy <= q.y1) ?? secAt[secAt.length - 1];
    const r = sc.r0 + ((sc.r1 - sc.r0) * (yy - sc.y0)) / (sc.y1 - sc.y0) + out;
    return M(sc.dx + Math.sin(a) * r, yy, Math.cos(a) * r, 0, a);
  };
  // masonry blocks sticking out a little
  for (let i = 0; i < (low ? 16 : 40); i++) {
    const a = R() * Math.PI * 2;
    const yy = 0.6 + R() * (towerTop - 1.0);
    if (Math.cos(a) > 0.8 && yy < 3.0) continue;
    body.add(new THREE.BoxGeometry(0.5 + R() * 0.3, 0.26, 0.14), R() < 0.5 ? "#d4c3a2" : "#f3ead8", surf(a, yy, 0));
  }
  // round glowing windows
  const wins: [number, number][] = [[1.3, 1.7], [-1.4, 1.9], [2.6, 1.5], [-2.6, 1.7], [0.4, 3.8], [-0.9, 4.2], [1.9, 4.0], [3.4, 4.2], [-2.3, 3.9], [0.1, 6.0], [1.2, 6.2], [-1.3, 5.9], [2.6, 6.1]];
  wins.forEach(([a, yy], i) => {
    if (low && i % 3 === 2) return;
    body.add(new THREE.TorusGeometry(0.33, 0.08, 4, 10), "#6b4a2e", surf(a, yy, 0.04));
    body.add(new THREE.BoxGeometry(0.62, 0.05, 0.05), "#6b4a2e", mul(surf(a, yy, 0.06), M()));
    bulbs.bulb(new THREE.CircleGeometry(0.3, 10), i % 4 === 3 ? "#9fe8ff" : "#ffd98a", surf(a, yy, 0.05), i * 1.9, 0.9 + (i % 3) * 0.4, 0.72);
  });
  // the open arched door, warm light inside, and front steps
  const dzf = 2.12;
  body.add(extrude(archShape(1.75, 2.55), 0.32, low ? 5 : 8), "#cfc2a8", M(0, 0.35, dzf));
  body.add(extrude(archShape(1.3, 2.25), 0.04, low ? 5 : 8), "#2a1f3a", M(0, 0.35, dzf + 0.31));
  glow.add(new THREE.ShapeGeometry(archShape(1.08, 2.05), low ? 5 : 8), "#ffcc66", M(0, 0.4, dzf + 0.36));
  {
    const ry = -1.1;
    const hx = -0.65, hz = dzf + 0.36;
    body.add(new THREE.BoxGeometry(0.66, 2.0, 0.1), "#8a5530", M(hx + 0.33 * Math.cos(ry), 1.36, hz - 0.33 * Math.sin(ry), 0, ry));
    body.add(new THREE.SphereGeometry(0.06, 5, 3), "#ffc94a", M(hx + 0.56 * Math.cos(ry), 1.36, hz - 0.56 * Math.sin(ry) + 0.07, 0, ry));
  }
  body.add(new THREE.BoxGeometry(2.0, 0.14, 0.55), "#b8b2c8", M(0, 0.07, 2.78));
  // a pile of books by the door, a quill stuck in the top one
  let py = 0.35;
  for (let i = 0; i < 4; i++) {
    const h = 0.18 + R() * 0.08;
    body.add(new THREE.BoxGeometry(0.62 - i * 0.05, h, 0.45), ["#e8453c", "#3a6ad8", "#4cc26a", "#ffb030"][i], M(1.6, py + h / 2, 2.05, 0, R() - 0.5));
    py += h;
  }
  body.add(new THREE.ConeGeometry(0.06, 0.8, 4), "#ffffff", M(1.6, py + 0.35, 2.05, 0.3, 0, 0.2));
  // wizard-hat roof on a stone lip: a flared brim, a tall floppy cone drooping toward +x, a
  // gold band and twinkling stars, and a pulsing magic lamp dangling from the tip
  const dxT = secs[2].dx;
  body.add(new THREE.CylinderGeometry(2.25, 2.0, 0.25, seg), "#b89f7e", M(dxT, towerTop + 0.125, 0));
  const roofY = towerTop + 0.25;
  body.add(new THREE.CylinderGeometry(2.6, 2.45, 0.16, seg), "#2e3cb8", M(dxT, roofY + 0.08, 0));
  const rH = 3.1, rB = 2.35;
  const rOf = (yl: number) => rB * Math.pow(Math.max(0, 1 - yl / rH), 1.2);
  const bend = (yl: number) => {
    const sN = Math.max(0, (yl - 1.0) / (rH - 1.0));
    return [1.35 * sN * sN, -0.5 * sN * sN * sN] as const;
  };
  {
    const n = low ? 7 : 12;
    const prof = Array.from({ length: n + 1 }, (_, i) => new THREE.Vector2(Math.max(0.001, rOf((i / n) * rH)), (i / n) * rH));
    const g = new THREE.LatheGeometry(prof, low ? 8 : 14);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const yl = p.getY(i);
      const [bx, by] = bend(yl);
      p.setXYZ(i, p.getX(i) + bx, yl + by, p.getZ(i));
    }
    body.add(g, "#3b4bd0", M(dxT, roofY + 0.16, 0));
    body.add(new THREE.CylinderGeometry(rOf(0.4) + 0.04, rOf(0.15) + 0.04, 0.26, low ? 8 : 14), "#ffc94a", M(dxT, roofY + 0.16 + 0.28, 0));
    const nStar = low ? 8 : 16;
    for (let i = 0; i < nStar; i++) {
      const a = R() * Math.PI * 2;
      const yl = 0.65 + R() * 1.7;
      const [bx, by] = bend(yl);
      const r = rOf(yl) + 0.05;
      bulbs.bulb(extrude(starShape(0.19, 0.08), 0.03, 1), R() < 0.3 ? "#bfe8ff" : "#ffe45c", M(dxT + bx + Math.sin(a) * r, roofY + 0.16 + yl + by, Math.cos(a) * r, -0.7, a), R() * 6, 1.4 + R() * 1.6, 0.35);
    }
    const [tx, ty] = bend(rH);
    const tipX = dxT + tx, tipY = roofY + 0.16 + rH + ty;
    body.add(new THREE.BoxGeometry(0.03, 0.4, 0.03), "#6b4a2e", M(tipX, tipY - 0.2, 0));
    body.add(new THREE.ConeGeometry(0.22, 0.18, 6), "#ffc94a", M(tipX, tipY - 0.44, 0));
    const orb = new Parts();
    orb.add(new THREE.IcosahedronGeometry(0.3, low ? 0 : 1), "#ffe9a0");
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      orb.add(new THREE.OctahedronGeometry(0.08, 0), "#9fe8ff", M(Math.sin(a) * 0.55, (i % 2) * 0.2 - 0.1, Math.cos(a) * 0.55));
    }
    const oy = tipY - 0.8;
    s.anims.push({ geo: orb.build(), glow: true, at: [tipX, oy, 0], update: (o, t) => ((o.rotation.y = t * 0.9), o.scale.setScalar(1 + Math.sin(t * 2.2) * 0.1)) });
  }
  // flying books: covers flap like wings as they circle the tower
  const dyn = new Dyn();
  const nb = low ? 7 : 12;
  const cc = ["#e8453c", "#3a6ad8", "#4cc26a", "#ffb030", "#a064e0", "#2fb8b0", "#ff7fb3"];
  const books: { l: number; r: number; rad: number; h: number; w: number; a0: number; fs: number }[] = [];
  for (let i = 0; i < nb; i++) {
    const c = cc[i % cc.length];
    const half = (sx: number) => (p: Parts) => {
      p.add(new THREE.BoxGeometry(0.62, 0.08, 0.86), c, M(sx * 0.31, 0, 0));
      p.add(new THREE.BoxGeometry(0.55, 0.07, 0.78), "#fff3d6", M(sx * 0.28, 0.075, 0));
      if (sx < 0) p.add(new THREE.BoxGeometry(0.09, 0.1, 0.86), "#ffc94a", M(0, -0.01, 0));
    };
    books.push({ l: dyn.piece(half(-1)), r: dyn.piece(half(1)), rad: 3.6 + (i % 3) * 0.38, h: 1.7 + ((i * 0.618) % 1) * 6.4, w: 0.24 + (i % 4) * 0.04, a0: i * 2.4, fs: 4.5 + (i % 3) * 1.1 });
  }
  const dGeo = dyn.build(new THREE.Vector3(0, 5, 0), 7.5);
  const W = new THREE.Matrix4(), F = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), One = new THREE.Vector3(1, 1, 1);
  s.anims.push({
    geo: dGeo,
    glow: false,
    at: [0, 0, 0],
    update: (_o, t) => {
      for (let i = 0; i < books.length; i++) {
        const b = books[i];
        const a = b.a0 + t * b.w;
        P.set(Math.sin(a) * b.rad, b.h + Math.sin(t * 1.3 + i) * 0.3, Math.cos(a) * b.rad);
        const yaw = Math.atan2(Math.cos(a), -Math.sin(a));
        W.compose(P, Q.setFromEuler(E.set(Math.sin(t * 1.3 + i) * 0.15, yaw, Math.sin(t * 0.8 + i) * 0.2, "YXZ")), One);
        const th = 0.95 + 0.45 * Math.sin(t * b.fs + i);
        dyn.set(b.l, F.copy(W).multiply(M(0, 0, 0, 0, 0, -th)));
        dyn.set(b.r, F.copy(W).multiply(M(0, 0, 0, 0, 0, th)));
      }
      dyn.done();
    },
  });
  return s;
}

// ───────────────────────────── Learning Tree ─────────────────────────────
// a giant twisted tree of knowledge: a door in its trunk, a sky-blue treehouse classroom in its
// branches reached by a spiral ladder, glowing leaf-lanterns hanging from a gently swaying
// canopy, a chalkboard sign, and glowing letters and numbers drifting round the treehouse.
function buildTree(low: boolean): Spec {
  const s = spec();
  const { body, glow, bulbs } = s;
  const bark = "#8a5a3a";
  // twisted trunk with bulges
  {
    const tH = 6.4;
    const g = new THREE.CylinderGeometry(0.78, 1.22, tH, low ? 7 : 9, low ? 4 : 6);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), yl = p.getY(i) + tH / 2, z = p.getZ(i);
      const a = Math.atan2(x, z) + yl * 0.28;
      const r = Math.hypot(x, z) * (1 + 0.07 * Math.sin(yl * 2.1 + a * 3));
      p.setXYZ(i, Math.sin(a) * r, yl, Math.cos(a) * r);
    }
    body.add(g, (_x, yy) => new THREE.Color(bark).lerp(new THREE.Color("#a36d45"), Math.min(1, yy / 6)));
  }
  // roots flaring out (none across the door)
  for (let k = 0; k < 5; k++) {
    const a = Math.PI / 5 + (k * Math.PI * 2) / 5;
    body.add(new THREE.ConeGeometry(0.45, 1.9, 5), bark, M(Math.sin(a) * 1.25, 0.31, Math.cos(a) * 1.25, Math.PI / 2 + 0.3, a));
  }
  // door in the trunk, glowing inside
  body.add(extrude(archShape(0.95, 1.7), 0.35, low ? 5 : 7), "#c78c52", M(0, 0, 0.98));
  body.add(extrude(archShape(0.75, 1.55), 0.02, low ? 5 : 7), "#2a1f1a", M(0, 0, 1.33));
  glow.add(new THREE.ShapeGeometry(archShape(0.6, 1.42), low ? 5 : 7), "#ffcc66", M(0, 0.02, 1.36));
  // branches up into the canopy
  const br: [[number, number, number], [number, number, number], number][] = [
    [[0, 5.6, -0.2], [-1.6, 7.3, -0.6], 0.34],
    [[0, 5.6, -0.2], [1.6, 7.4, -0.4], 0.34],
    [[0, 5.9, -0.3], [0, 7.2, -1.8], 0.3],
    [[0.3, 5.0, -0.1], [2.2, 6.9, -0.2], 0.24],
    [[-0.3, 5.0, -0.1], [-2.2, 6.9, -0.2], 0.24],
  ];
  for (const [a, b, r] of br) {
    const [g, m] = between(a, b, r * 0.6, r, 6);
    body.add(g, "#94603c", m);
  }
  // treehouse: platform, struts, walls, door, windows, red roof, porch rail, a bell
  const pY = 4.4;
  body.add(new THREE.BoxGeometry(3.0, 0.2, 2.7), "#b07a48", M(0, pY, 1.4));
  for (const sx of [-1, 1]) {
    const [g, m] = between([sx * 0.5, 2.9, 0.7], [sx * 1.3, pY - 0.1, 2.5], 0.08, 0.08, 5);
    body.add(g, "#8a5a36", m);
  }
  const hz = 1.225, hw = 2.3, hd = 1.75, hh = 1.5, wy = pY + 0.1;
  body.add(new THREE.BoxGeometry(hw, hh, hd), "#7cc8f0", M(0, wy + hh / 2, hz));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) body.add(new THREE.BoxGeometry(0.12, hh, 0.12), "#ffffff", M(sx * (hw / 2), wy + hh / 2, hz + sz * (hd / 2)));
  const hf = hz + hd / 2;
  body.add(extrude(archShape(0.72, 1.12), 0.03, 5), "#2a1f3a", M(0.35, wy, hf));
  glow.add(new THREE.ShapeGeometry(archShape(0.56, 1.0), 5), "#ffcc66", M(0.35, wy + 0.03, hf + 0.035));
  body.add(new THREE.TorusGeometry(0.24, 0.06, 4, 8), "#ffffff", M(-0.55, wy + 0.95, hf + 0.02));
  bulbs.bulb(new THREE.CircleGeometry(0.22, 8), "#ffe27a", M(-0.55, wy + 0.95, hf + 0.03), 0.5, 1.1, 0.75);
  for (const sx of [-1, 1]) {
    body.add(new THREE.BoxGeometry(0.06, 0.62, 0.72), "#ffffff", M(sx * (hw / 2 + 0.02), wy + 0.85, hz));
    bulbs.bulb(new THREE.PlaneGeometry(0.62, 0.5), "#ffe27a", M(sx * (hw / 2 + 0.03), wy + 0.85, hz, 0, sx * (Math.PI / 2)), sx + 2, 1.3, 0.75);
  }
  const roofR = 1.35;
  body.add(new THREE.CylinderGeometry(roofR, roofR, hd + 0.55, 3), "#e8453c", M(0, wy + hh + roofR / 2 - 0.02, hz, -Math.PI / 2));
  // the gable end (wall colour) with a round glowing window
  body.add(new THREE.CylinderGeometry(roofR - 0.2, roofR - 0.2, 0.06, 3), "#7cc8f0", M(0, wy + hh + roofR / 2 - 0.02 - 0.1, hf + 0.02, -Math.PI / 2));
  body.add(new THREE.TorusGeometry(0.2, 0.05, 4, 8), "#ffffff", M(0, wy + hh + 0.4, hf + 0.06));
  bulbs.bulb(new THREE.CircleGeometry(0.18, 8), "#ffe27a", M(0, wy + hh + 0.4, hf + 0.07), 2.2, 1.0, 0.75);
  // little gable flag + bell on the ridge
  body.add(new THREE.BoxGeometry(0.06, 0.7, 0.06), "#ffffff", M(0, wy + hh + roofR * 1.5 + 0.3, hf + 0.1));
  body.add(new THREE.BoxGeometry(0.5, 0.3, 0.03), "#ffd23a", M(0.25, wy + hh + roofR * 1.5 + 0.5, hf + 0.1));
  // porch rail
  for (let i = 0; i < 7; i++) body.add(new THREE.BoxGeometry(0.07, 0.5, 0.07), "#ffffff", M(-1.42 + (i / 6) * 2.84, pY + 0.35, 2.7));
  body.add(new THREE.BoxGeometry(2.95, 0.07, 0.08), "#ffffff", M(0, pY + 0.6, 2.7));
  for (let i = 0; i < 4; i++) body.add(new THREE.BoxGeometry(0.07, 0.5, 0.07), "#ffffff", M(1.45, pY + 0.35, 0.2 + (i / 3) * 2.4));
  body.add(new THREE.BoxGeometry(0.08, 0.07, 2.5), "#ffffff", M(1.45, pY + 0.6, 1.45));
  // spiral ladder round the trunk (front-right, round the back, up onto the platform's left)
  {
    const n = low ? 9 : 12;
    const aS = (50 / 180) * Math.PI, aE = (300 / 180) * Math.PI;
    const rail: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const a = aS + (aE - aS) * u;
      const yy = 0.35 + u * (pY - 0.3 - 0.35);
      body.add(new THREE.BoxGeometry(0.44, 0.1, 0.8), "#c9955e", M(Math.sin(a) * 1.55, yy, Math.cos(a) * 1.55, 0, a));
      if (i % 2 === 0 || i === n - 1) body.add(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 4), "#e0c089", M(Math.sin(a) * 1.9, yy + 0.3, Math.cos(a) * 1.9));
      rail.push(new THREE.Vector3(Math.sin(a) * 1.9, yy + 0.6, Math.cos(a) * 1.9));
    }
    body.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), low ? 16 : 32, 0.035, 3, false), "#e0c089");
  }
  // chalkboard sign by the trunk
  {
    const base = M(-1.85, 0, 2.05, 0, -0.3);
    for (const sz of [-1, 1]) body.add(new THREE.BoxGeometry(0.07, 1.45, 0.07), "#8a5a36", mul(base, M(0, 0.73, sz * 0.18, sz * 0.24, 0)));
    for (const sx of [-1, 1]) body.add(new THREE.BoxGeometry(0.07, 1.45, 0.07), "#8a5a36", mul(base, M(sx * 0.52, 0.73, 0.12, -0.2, 0)));
    const board = mul(base, M(0, 0.95, 0.2, -0.2, 0));
    body.add(new THREE.BoxGeometry(1.1, 0.86, 0.07), "#a0703f", board);
    body.add(new THREE.BoxGeometry(0.96, 0.72, 0.02), "#2f5a45", mul(board, M(0, 0, 0.04)));
    glow.push(pixelGeo(textRows("ABC"), { "#": "#dff0ff" }, 0.07), mul(board, M(0, 0.17, 0.06, 0, 0, 0, 1, 1, 0.3)));
    glow.push(pixelGeo(textRows("123"), { "#": "#ffe27a" }, 0.07), mul(board, M(0, -0.19, 0.06, 0, 0, 0, 1, 1, 0.3)));
  }
  // the canopy (sways gently about the fork)
  const canopy = new Parts();
  const pv = 6.0;
  const blobs: [number, number, number, number, string][] = [
    [0, 8.35, -0.5, 1.95, "#3fc48a"],
    [-1.6, 7.4, -0.6, 1.5, "#2fae7a"],
    [1.6, 7.5, -0.4, 1.5, "#ffc94a"],
    [0, 7.05, -1.9, 1.5, "#2a9c6e"],
    [-1.0, 9.15, 0.4, 1.1, "#7ad86a"],
    [1.1, 9.0, 0.5, 1.1, "#4ccf8e"],
    [-2.25, 6.9, -0.2, 0.95, "#ff9cc4"],
    [2.25, 6.85, -0.2, 0.95, "#3fc48a"],
  ];
  blobs.forEach(([x, yy, z, r, c], i) => {
    canopy.add(jitter(new THREE.IcosahedronGeometry(r, low ? 0 : 1), 0.12, i * 7), c, M(x, yy - pv, z, 0, i * 0.7, 0, 1, 0.86, 1));
  });
  s.anims.push({ geo: canopy.build(), glow: false, at: [0, pv, 0], update: (o, t) => ((o.rotation.z = Math.sin(t * 0.7) * 0.018), (o.rotation.x = Math.sin(t * 0.55 + 1) * 0.014)) });
  // glowing leaf-lanterns hanging under the canopy
  {
    const n = low ? 7 : 12;
    const lc = ["#ffe27a", "#b8ff6a", "#ffb86a", "#9fe8ff"];
    for (let i = 0; i < n; i++) {
      const a = 0.75 + (i / n) * (Math.PI * 2 - 1.5);
      const r = 2.3 + (i % 3) * 0.3;
      const yy = 6.0 + (i % 4) * 0.35;
      const x = Math.sin(a) * r, z = Math.cos(a) * r - 0.3;
      body.add(new THREE.BoxGeometry(0.02, 0.6, 0.02), "#5a3a2a", M(x, yy + 0.5, z));
      bulbs.bulb(new THREE.OctahedronGeometry(0.2, 0), lc[i % 4], M(x, yy, z, 0, a, 0.15, 0.85, 1.4, 0.4), i * 1.1, 1.6 + (i % 3) * 0.5, 0.45);
    }
  }
  // glowing letters and numbers drifting round the treehouse
  const glyphs = new Parts();
  const gs = (low ? "AB12+" : "AB1C2+3?").split("");
  const gc = ["#ffe45c", "#6ff6ff", "#ff7fd8", "#8dff5a", "#ffb86a"];
  gs.forEach((ch, i) => {
    const a = (i / gs.length) * Math.PI * 2;
    glyphs.push(pixelGeo(GLYPHS[ch], { "#": gc[i % gc.length] }, 0.15), M(Math.sin(a) * 3.2, (i % 2) * 0.7, Math.cos(a) * 3.2, 0, a, 0, 1, 1, 0.6));
  });
  const gy = 5.0;
  s.anims.push({ geo: glyphs.build(), glow: true, at: [0, gy, 0], update: (o, t) => ((o.rotation.y = t * 0.3), (o.position.y = gy + Math.sin(t * 1.2) * 0.2)) });
  return s;
}

const BUILDERS: Record<string, (low: boolean) => Spec> = {
  arcade: buildArcade,
  "retro-arcade": buildRetro,
  "story-theatre": buildTheatre,
  library: buildLibrary,
  "learning-tree": buildTree,
};

/** a building for the place (door faces local +z; fits inside radius `r` minus 0.4; base at y=0) or null if none */
export function buildSkyBuilding(placeId: string, r: number, lowQuality = false): SkyBuilding | null {
  const make = BUILDERS[placeId];
  if (!make) return null;
  const b = assemble(placeId, make(lowQuality));
  // designed for the planned pads; on a smaller pad shrink uniformly to fit
  const fit = r - 0.4;
  const need = DESIGN_RADIUS[placeId];
  if (fit < need) b.group.scale.setScalar(Math.max(0.3, fit / need));
  return b;
}

/** the footprint each design needs (max horizontal reach incl. animation), metres */
const DESIGN_RADIUS: Record<string, number> = {
  arcade: 4.65,
  "retro-arcade": 4.6,
  "story-theatre": 4.85,
  library: 5.0,
  "learning-tree": 3.6,
};
