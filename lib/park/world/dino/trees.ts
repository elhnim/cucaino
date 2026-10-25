// Dino Isle's trees at TRUE size, drawn instanced (one mesh per kind, so a whole forest is four
// draw calls): giant monkey-puzzles (30–45 m: a tall bare trunk with fissured bark, whorls of
// upturned branches and a flat umbrella crown way up top; their young are the long-necks'
// browse), redwood-like spires (35–50 m: buttress roots, red fibrous bark, an irregular layered
// crown) and the Ice Age's snowy spruces (the same spire, frosted), tree ferns (5–8 m) and
// broadleaf ginkgos (~15 m). Every instance is turned and a little broader or slimmer.
// Built in the fantasy kit's layout so they share its wind sway; each instance gets a tint.
import * as THREE from "three";
import { DINO_ISLAND, DINO_TREES, DINO_TREE_H, dinoRng, type DinoTree, type DinoTreeKind } from "../../registry/dinoIsland";
import { col, cone, cyl, gem, mergeAll, place, pp, stick, v3 } from "../village/kit";

const X0 = DINO_ISLAND.x;
const Z0 = DINO_ISLAND.z;
const PI = Math.PI;

/** a flat two-sided frond from the origin along +z, drooping (a few segments) */
function frond(len: number, w: number, droop: number, segs: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const pt = (u: number) => [0, Math.sin(u * PI * 0.5) * len * 0.3 - u * u * droop, u * len];
  for (let i = 0; i < segs; i++) {
    const u0 = i / segs;
    const u1 = (i + 1) / segs;
    const a = pt(u0);
    const b = pt(u1);
    const w0 = w * Math.sin(Math.max(0.15, u0) * PI) * (1 - u0 * 0.3);
    const w1 = w * Math.sin(Math.max(0.15, u1) * PI) * (1 - u1 * 0.3);
    const q = [
      [a[0] - w0, a[1], a[2]],
      [a[0] + w0, a[1], a[2]],
      [b[0] - w1, b[1], b[2]],
      [b[0] + w1, b[1], b[2]],
    ];
    pos.push(...q[0], ...q[2], ...q[1], ...q[1], ...q[2], ...q[3]);
    pos.push(...q[0], ...q[1], ...q[2], ...q[1], ...q[3], ...q[2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
/** sway grows with height; aFx.x = how much the instance tint shows */
const leafFx = (tint: number, k: number) => (p: THREE.Vector3): [number, number, number] => [tint, Math.max(0, p.y) * k, 0];

/** a thin open 3-sided rod from a to b (branches: 6 triangles) */
function rod(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, 3, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(b, a).normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}
/** a squashed 20-faced blob of leaves (cheaper than the kit's lumps: these trees come by the hundred) */
function blob(r: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const rnd = dinoRng(seed);
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + (rnd() - 0.5) * 0.25;
    pos.setXYZ(i, x + pos.getX(i) * r * sx * k, y + pos.getY(i) * r * sy * k, z + pos.getZ(i) * r * sz * k);
  }
  return g;
}

/** bark: vertical fissures round the trunk (by angle), a little darker at the foot */
const bark = (dark: string, mid: string, light: string, k = 7) => (p: THREE.Vector3): THREE.Color => {
  const a = Math.atan2(p.x, p.z);
  const f = Math.floor(((a / (PI * 2) + 0.5) * k * 2 + Math.floor(p.y / 9)) % 3);
  return col(f === 0 ? dark : f === 1 ? mid : light);
};
/** a leafy pad stretched along a branch (from a to b), fat in the middle */
function pad(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, seed: number, low: boolean): THREE.BufferGeometry {
  const L = a.distanceTo(b);
  const g = low ? new THREE.OctahedronGeometry(1, 0) : blob(1, 0, 0, 0, 1, 1, 1, seed);
  g.scale(w, h, L * 0.62);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3().subVectors(b, a).normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/**
 * The monkey-puzzle, a giant: a tall, straight, barely tapering grey-brown trunk with its bark in
 * fissures and a flared foot, bare for two thirds of its height; then whorls of level branches,
 * each curving up at its tip and clothed in a rope of dark spiky leaves, the whorls narrowing up to
 * a flat-topped umbrella — the silhouette of an ancient Araucaria.
 */
function araucaria(low: boolean): THREE.BufferGeometry {
  const H = DINO_TREE_H.araucaria;
  const P: THREE.BufferGeometry[] = [];
  const rnd = dinoRng(31);
  const seg = low ? 5 : 8;
  P.push(pp(cyl(0.42, 1.25, H * 0.95, seg, 0, 0, 0, true), bark("#5e4a3c", "#76604e", "#8a735e", seg), [0, 0, 0]));
  // (the flared foot)
  P.push(pp(cyl(1.25, 2.3, 2.4, seg, 0, -0.3, 0, true), bark("#54412f", "#6a5442", "#7a6450", seg)));
  const whorls = low ? 3 : 4;
  const per = low ? 4 : 5;
  const leaf = ["#245c3c", "#2c6a44", "#1f5236", "#2a6440"];
  for (let w = 0; w < whorls; w++) {
    const u = w / (whorls - 1);
    const y = H * (0.66 + u * 0.26);
    // (the lowest whorl reaches furthest; the top ones make the flat crown)
    const reach = (11 - u * 6.5) * (0.92 + rnd() * 0.16);
    for (let k = 0; k < per; k++) {
      const a = ((k + w * 0.5) / per) * PI * 2 + (rnd() - 0.5) * 0.35;
      const sx = Math.sin(a);
      const sz = Math.cos(a);
      // out level, then up at the tip
      const mid = v3(sx * reach * 0.62, y + 0.4, sz * reach * 0.62);
      const tip = v3(sx * reach, y + 2.6 + u * 0.8, sz * reach);
      P.push(pp(rod(v3(0, y - 0.3, 0), mid, 0.3, 0.2), "#5a4636", leafFx(0, 0.0015)));
      if (!low) P.push(pp(rod(mid, tip, 0.2, 0.1), "#5a4636", leafFx(0, 0.0018)));
      // (the rope of leaves along it: thick, dark, a little upturned)
      P.push(pp(pad(v3(sx * reach * 0.2, y + 0.2, sz * reach * 0.2), tip, 1.5 - u * 0.3, 1.25, w * 7 + k, low), leaf[(w + k) % 4], leafFx(0.8, 0.0022)));
    }
  }
  // (the flat top of the umbrella)
  P.push(pp(blob(3.6, 0, H * 0.955, 0, 1.6, 0.42, 1.6, 99), "#2a6440", leafFx(0.8, 0.0022)));
  return mergeAll(P);
}

/**
 * A redwood (or, frosted, an Ice Age spruce): a massive, strongly tapering trunk of fibrous red
 * bark on buttress roots, bare for its lower part, then an irregular narrow crown of layered
 * foliage — tiers that wander off-centre, with side clumps breaking the outline — up to a spire.
 * Each tier's cap is white geometry the instance tint turns green on warm land, snowy in the ice.
 */
function spire(low: boolean): THREE.BufferGeometry {
  const H = DINO_TREE_H.spire;
  const P: THREE.BufferGeometry[] = [];
  const rnd = dinoRng(43);
  const seg = low ? 5 : 8;
  P.push(pp(cyl(0.32, 1.7, H * 0.86, seg, 0, 0, 0, true), bark("#6e3424", "#8e4630", "#a85a3c", seg), [0, 0, 0]));
  // (buttress roots: fins down into the ground round the foot)
  const fins = low ? 3 : 5;
  for (let k = 0; k < fins; k++) {
    const a = (k / fins) * PI * 2 + rnd() * 0.4;
    P.push(pp(stick(v3(0, 4.6, 0), v3(Math.sin(a) * 3.6, -0.4, Math.cos(a) * 3.6), 0.6, 1.5), "#7a3c28"));
  }
  const tiers = low ? 4 : 7;
  const green = ["#1f5a3a", "#256644", "#1b5034"];
  for (let k = 0; k < tiers; k++) {
    const u = k / tiers;
    const r = 6.4 * (1 - u * 0.78) * (0.9 + rnd() * 0.2);
    const y = H * 0.4 + u * H * 0.55;
    const h = (H * 0.62) / tiers + 2.8;
    const ox = (rnd() - 0.5) * 1.4 * (1 - u);
    const oz = (rnd() - 0.5) * 1.4 * (1 - u);
    P.push(pp(cone(r, h, 6, ox, y, oz), green[k % 3], leafFx(0.35, 0.0016)));
    P.push(pp(cone(r * 0.62, h * 0.38, 6, ox, y + h * 0.58, oz), "#ffffff", leafFx(1, 0.0016)));
    // (a clump or two off to the side: no two layers alike)
    if (!low && k < tiers - 2) {
      const a = rnd() * PI * 2;
      P.push(pp(gem(r * 0.42, ox + Math.sin(a) * r * 0.78, y + h * 0.3, oz + Math.cos(a) * r * 0.78, 1.25, 0.6, 1.25), green[(k + 1) % 3], leafFx(0.35, 0.0016)));
    }
  }
  P.push(pp(cone(0.9, 5.5, 5, 0, H * 0.94, 0), "#ffffff", leafFx(1, 0.0016)));
  return mergeAll(P);
}

/** a tree fern: a shaggy trunk, a crown of long arching fronds */
function treefern(low: boolean): THREE.BufferGeometry {
  const H = DINO_TREE_H.treefern;
  const P: THREE.BufferGeometry[] = [];
  const rnd = dinoRng(7);
  P.push(pp(cyl(0.32, 0.5, H * 0.8, 5, 0, 0, 0, true), (p) => (Math.floor(p.y * 1.8) % 2 ? col("#6a4a30") : col("#5a3e28")), (q) => [0, q.y * 0.004, 0]));
  const n = low ? 6 : 8;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * PI * 2 + rnd() * 0.2;
    P.push(pp(place(frond(5.2, 0.75, 2.6, 2), 0, H * 0.8, 0, a, 1, -0.2 - (k % 2) * 0.15, 0), ["#3f9a46", "#58b24c", "#2f8a44"][k % 3], leafFx(0.6, 0.012)));
  }
  P.push(pp(gem(0.75, 0, H * 0.8 + 0.1, 0), "#4a7a30", [0.5, 0.01, 0]));
  return mergeAll(P);
}

/** a broadleaf ginkgo / jungle giant: a stout trunk with buttress roots, big leafy blobs, a vine or two */
function broadleaf(low: boolean): THREE.BufferGeometry {
  const H = DINO_TREE_H.broadleaf;
  const P: THREE.BufferGeometry[] = [];
  const rnd = dinoRng(17);
  P.push(pp(cyl(0.6, 1.0, H * 0.7, 6, 0, 0, 0, true), "#7a5a40", [0, 0, 0]));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * PI * 2 + 0.4;
    P.push(pp(stick(v3(0, 2.6, 0), v3(Math.sin(a) * 2.2, -0.2, Math.cos(a) * 2.2), 0.45, 0.25), "#6a4c34"));
  }
  const blobs = low ? 3 : 4;
  for (let k = 0; k < blobs; k++) {
    const a = (k / blobs) * PI * 2 + rnd();
    const r = k === 0 ? 0 : 3.6;
    P.push(pp(blob(4.8 - (k ? 0.9 : 0), Math.sin(a) * r, H * 0.78 + (k ? -1.2 : 1.4), Math.cos(a) * r, 1.25, 0.72, 1.25, k + 5), ["#3f9a46", "#58b24c", "#2f8a44"][k % 3], leafFx(0.7, 0.004)));
  }
  if (!low)
    for (let k = 0; k < 2; k++) {
      const a = rnd() * PI * 2;
      const x = Math.sin(a) * 4.2;
      const z = Math.cos(a) * 4.2;
      P.push(pp(stick(v3(x, H * 0.7, z), v3(x * 1.05, H * 0.7 - 5 - rnd() * 2, z * 1.05), 0.08), "#3a7a30", (q) => [0, (H - q.y) * 0.004, 0]));
      P.push(pp(gem(0.3, x * 1.05, H * 0.7 - 4, z * 1.05), "#ff5a8a", [0, 0.01, 0.3]));
    }
  return mergeAll(P);
}

const BUILDERS: Record<DinoTreeKind, (low: boolean) => THREE.BufferGeometry> = { araucaria, spire, treefern, broadleaf };
/** the instance tints: [warm land x3, snowy] per kind */
const TINT: Record<DinoTreeKind, string[]> = {
  araucaria: ["#ffffff", "#e8f4d8", "#d8ecd0"],
  spire: ["#3a7a4a", "#43875a", "#356f45"],
  treefern: ["#ffffff", "#f0ffd8", "#e0f4e0"],
  broadleaf: ["#ffffff", "#f4ffd0", "#e8f8d8"],
};
const SNOW_TINT = "#f4f8ff";

/** which trees are drawn in low quality (every big tree; half the tree ferns, two thirds of the broadleafs) */
export function treesFor(low: boolean): DinoTree[] {
  if (!low) return DINO_TREES;
  let f = 0;
  let b = 0;
  return DINO_TREES.filter((t) => (t.kind === "treefern" ? f++ % 2 === 0 : t.kind === "broadleaf" ? b++ % 3 !== 2 : true));
}

/** the four instanced tree meshes (island-local: the group sits at the island's centre) */
export function buildTrees(material: THREE.Material, low: boolean): THREE.InstancedMesh[] {
  const out: THREE.InstancedMesh[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();
  const list = treesFor(low);
  for (const kind of Object.keys(BUILDERS) as DinoTreeKind[]) {
    const mine = list.filter((t) => t.kind === kind);
    if (!mine.length) continue;
    const geo = BUILDERS[kind](low);
    const mesh = new THREE.InstancedMesh(geo, material, mine.length);
    mesh.name = `dino-trees-${kind}`;
    mine.forEach((t, i) => {
      e.set(0, t.rot, 0);
      // (no two alike: each one a little broader or slimmer — its height stays true)
      const w = 0.82 + ((Math.sin(t.x * 12.9898 + t.z * 78.233) * 43758.5453) % 1 + 1) % 1 * 0.36;
      m.compose(p.set(t.x - X0, t.y, t.z - Z0), q.setFromEuler(e), sc.set(t.s * w, t.s, t.s * w));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(t.snow ? SNOW_TINT : TINT[kind][t.v % 3]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = !low;
    mesh.receiveShadow = !low;
    out.push(mesh);
  }
  return out;
}
