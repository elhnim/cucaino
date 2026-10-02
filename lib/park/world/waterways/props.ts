// Everything that stands still round the waterways, merged into ONE mesh in the fantasy kit's
// layout (so it shares the wind sway and the jungle's see-through cut): the plank-and-rope
// footbridges, the ford's stepping stones, mossy boulders round the plunge pool and along the river,
// reeds and cattails in the shallows, blue water irises on the banks, lily pads with flowers and
// floating lotus on the lake, weed swaying under the water, a weeping willow leaning over the lake,
// the half-sunk log the turtles bask on and the kingfisher's post. Placement is pure + seeded.
import * as THREE from "three";
import { col, merge, part, taperTube, transform, type Fx } from "../fantasy/geo";
import { noise3, rngOf } from "../fantasy/noise";
import { BRIDGES } from "../../registry/island";
import { WATER_Y, groundY } from "../../registry/terrain";
import { DUCK_BAY, FALLS, FORD_STONES, JETTY, LAKE, LAKE_OUTLINE, RIVER_LENGTH, lakeRadius, riverHalfWidth, riverPointAt, waterDepthAt, waterSdf } from "../../registry/waterways";

const _c = new THREE.Color();
const WOOD = col("#a8743e");
const WOOD_D = col("#7a522a");
const ROPE = col("#d8c08a");
const ROCK = col("#8a8a84");
const ROCK_D = col("#6a6a70");
const MOSS = col("#5f9a3a");
const REED = col("#9ac85a");
const REED_D = col("#7ab048");
const CATTAIL = col("#6a3e22");

/** where the critters live (for ./critters.ts) */
export interface WaterSpots {
  /** the turtles' log: centre, heading, length; the top they sit along */
  log: { x: number; z: number; rot: number; len: number; y: number };
  /** the kingfisher's post top */
  post: { x: number; y: number; z: number };
  /** lily pads (x, z, r) the frogs can sit on */
  pads: { x: number; z: number; r: number }[];
  /** reed beds (the dragonflies dart about them, the heron wades by them) */
  reeds: { x: number; z: number }[];
  /** the willow (for the map) */
  willow: { x: number; z: number };
  /** obstacles to walk round (boulders on dry land, the willow's trunk) */
  obstacles: { x: number; z: number; r: number }[];
}

function rock(x: number, y: number, z: number, r: number, seed: number, flat = 0.7): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(1, 0);
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + (noise3(v.x * 1.4 + seed, v.y * 1.4, v.z * 1.4 - seed, 4) - 0.5) * 0.5;
    pos.setXYZ(i, x + v.x * r * k, y + v.y * r * k * flat, z + v.z * r * k * (0.85 + (seed % 3) * 0.1));
  }
  return part(
    g,
    (p, n) => {
      const m = n.y > 0.55 ? 0.7 : 0;
      _c.copy(ROCK).lerp(ROCK_D, noise3(p.x * 0.6, p.y * 0.6, p.z * 0.6, 8) * 0.7);
      return _c.lerp(MOSS, m * (0.4 + noise3(p.x, p.y, p.z, 9) * 0.6));
    },
    [0, 0, 0],
    { faceted: true, faceColor: true },
  );
}

/** a flat blade (a reed, a grass, an iris leaf) from (x, y, z), `h` tall, bending a little */
function blade(x: number, y: number, z: number, h: number, w: number, lean: number, rot: number, c: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = [-w, 0, 0, w, 0, 0, w * 0.5, h * 0.6, lean * 0.4, -w * 0.5, h * 0.6, lean * 0.4, 0, h, lean];
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 3, 2, 4]);
  transform(g, x, y, z, rot);
  return part(g, (p) => _c.copy(c).multiplyScalar(0.75 + Math.min(1, (p.y - y) / h) * 0.4), (p): Fx => [0, Math.max(0, (p.y - y) / h) * 0.7, 0], { faceted: true });
}

export function buildWaterProps(opts: { lowQuality?: boolean } = {}): { geo: THREE.BufferGeometry; spots: WaterSpots } {
  const low = !!opts.lowQuality;
  const r = rngOf(9090);
  const parts: THREE.BufferGeometry[] = [];
  const obstacles: { x: number; z: number; r: number }[] = [];

  // ── the footbridges: planks on two stringers, rope rails on posts, legs down into the water ──
  for (const b of BRIDGES) {
    const hx = Math.sin(b.heading);
    const hz = Math.cos(b.heading);
    const px = Math.cos(b.heading);
    const pz = -Math.sin(b.heading);
    const n = Math.max(6, Math.round(b.span / 0.55));
    const deck = (u: number) => b.y0 + (b.y1 - b.y0) * u + Math.sin(u * Math.PI) * b.rise;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const a = (u - 0.5) * b.span;
      const g = new THREE.BoxGeometry(b.half * 2 + 0.15, 0.14, (b.span / n) * 0.86);
      const slope = Math.atan2(deck(Math.min(1, u + 0.01)) - deck(Math.max(0, u - 0.01)), b.span * 0.02);
      transform(g, 0, 0, 0, 0, 1, -slope);
      transform(g, b.x + hx * a, deck(u) - 0.07, b.z + hz * a, b.heading, 1, 0, (r() - 0.5) * 0.04);
      parts.push(part(g, i % 3 === 0 ? WOOD_D : WOOD, [0, 0, 0], { faceted: true }));
    }
    for (const s of [-1, 1]) {
      const rail: THREE.Vector3[] = [];
      const np = Math.max(3, Math.round(b.span / 2.4));
      for (let i = 0; i <= np; i++) {
        const u = i / np;
        const a = (u - 0.5) * b.span;
        const x = b.x + hx * a + px * s * (b.half + 0.05);
        const z = b.z + hz * a + pz * s * (b.half + 0.05);
        const top = deck(u) + 1.25;
        const bottom = Math.min(deck(u) - 0.2, groundY(x, z));
        const post = new THREE.CylinderGeometry(0.1, 0.13, top - bottom, 5);
        transform(post, x, (top + bottom) / 2, z);
        parts.push(part(post, WOOD_D, [0, 0, 0], { faceted: true }));
        rail.push(new THREE.Vector3(x, top - 0.08 - Math.sin(u * Math.PI) * 0.12 * 0, z));
      }
      // the rope sags a little between the posts
      const sag: THREE.Vector3[] = [];
      for (let i = 0; i + 1 < rail.length; i++) {
        sag.push(rail[i]);
        sag.push(rail[i].clone().lerp(rail[i + 1], 0.5).add(new THREE.Vector3(0, -0.22, 0)));
      }
      sag.push(rail[rail.length - 1]);
      parts.push(part(taperTube(sag, { segs: sag.length * 2, radial: 3, rx: () => 0.055 }), ROPE, [0, 0.05, 0], { faceted: true }));
    }
  }

  // ── the ford's stepping stones ──
  FORD_STONES.forEach((st, i) => parts.push(rock(st.x, st.y - 0.55, st.z, st.r, 300 + i, 0.6)));

  // ── boulders: round the plunge pool and the foot of the falls, along the river, at the outlet ──
  const P = FALLS.pool;
  for (let k = 0; k < (low ? 9 : 16); k++) {
    const a = (k / 16) * Math.PI * 2 + r() * 0.3;
    // (not in front of the falls: the curtain lands there)
    if (Math.cos(a - (FALLS.heading + Math.PI)) > 0.6) continue;
    const d = P.r + (r() - 0.3) * 2.5;
    const x = P.x + Math.sin(a) * d;
    const z = P.z + Math.cos(a) * d;
    const rr = 1.1 + r() * 1.6;
    parts.push(rock(x, groundY(x, z) + rr * 0.15, z, rr, 400 + k));
    if (waterSdf(x, z) > 0.5) obstacles.push({ x, z, r: rr * 0.85 });
  }
  // the big tumbled blocks at the foot of the cliff, either side of the curtain
  for (const s of [-1, 1]) {
    const x = FALLS.lip.x + 2.2 + r();
    const z = FALLS.lip.z + s * (FALLS.widthBottom * 0.5 + 1.5);
    parts.push(rock(x, WATER_Y - 0.5, z, 2.6, 450 + s, 0.9));
  }
  for (let s = 10; s < RIVER_LENGTH - 6; s += low ? 14 : 8) {
    const [cx, cz] = riverPointAt(s);
    const [nx, nz] = riverPointAt(s + 1);
    const h = Math.atan2(nx - cx, nz - cz);
    const side = (Math.floor(s / 8) % 2) * 2 - 1;
    const half = riverHalfWidth(s);
    const o = half * (0.7 + r() * 0.45) * side;
    const x = cx + Math.cos(h) * o;
    const z = cz - Math.sin(h) * o;
    const rr = 0.6 + r() * 1.0;
    parts.push(rock(x, groundY(x, z) + rr * 0.2, z, rr, 500 + s));
    // a smaller one beside it
    if (r() < 0.6) parts.push(rock(x + (r() - 0.5) * 2, groundY(x, z) + 0.1, z + (r() - 0.5) * 2, rr * 0.55, 600 + s));
  }

  // ── reeds and cattails in the lake's shallows and the river mouth ──
  const reeds: { x: number; z: number }[] = [];
  const reedAt = (x: number, z: number, n: number) => {
    reeds.push({ x, z });
    const y = WATER_Y - waterDepthAt(x, z) * 0.6;
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const d = r() * 1.3;
      const bx = x + Math.sin(a) * d;
      const bz = z + Math.cos(a) * d;
      const hh = 2.2 + r() * 1.4;
      parts.push(blade(bx, y, bz, hh, 0.13, (r() - 0.5) * 0.6, r() * Math.PI, k % 2 ? REED : REED_D));
      if (k % 3 === 0) {
        // a cattail: a stalk with a brown velvet head
        const st = new THREE.CylinderGeometry(0.025, 0.03, hh + 0.4, 3);
        transform(st, bx, y + (hh + 0.4) / 2, bz);
        parts.push(part(st, REED_D, (p): Fx => [0, Math.max(0, (p.y - y) / hh) * 0.6, 0]));
        const head = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 5);
        transform(head, bx, y + hh + 0.05, bz);
        parts.push(part(head, CATTAIL, [0, 0.6, 0], { faceted: true }));
      }
    }
  };
  for (let i = 0; i < LAKE_OUTLINE.length - 1; i += low ? 9 : 5) {
    const [ox, oz] = LAKE_OUTLINE[i];
    const a = Math.atan2(ox - LAKE.x, oz - LAKE.z);
    // (not on the beach, nor by the jetty)
    if (Math.hypot(ox - JETTY.ax, oz - JETTY.az) < 16) continue;
    if (noiseKeep(ox, oz) < 0.45) continue;
    const R = lakeRadius(a) - 1.6;
    reedAt(LAKE.x + Math.sin(a) * R, LAKE.z + Math.cos(a) * R, low ? 5 : 8);
  }
  for (let s = RIVER_LENGTH * 0.7; s < RIVER_LENGTH - 2; s += 6) {
    const [cx, cz] = riverPointAt(s);
    const [nx, nz] = riverPointAt(s + 1);
    const h = Math.atan2(nx - cx, nz - cz);
    for (const side of [-1, 1]) {
      const o = (riverHalfWidth(s) - 1.2) * side;
      if (r() < 0.4) reedAt(cx + Math.cos(h) * o, cz - Math.sin(h) * o, 6);
    }
  }

  // ── water irises on the banks (sword leaves, violet-blue flowers) ──
  for (let i = 2; i < LAKE_OUTLINE.length - 1; i += low ? 13 : 7) {
    const [ox, oz] = LAKE_OUTLINE[i];
    if (Math.hypot(ox - JETTY.ax, oz - JETTY.az) < 14 || noiseKeep(ox + 50, oz) < 0.5) continue;
    const a = Math.atan2(ox - LAKE.x, oz - LAKE.z);
    const R = lakeRadius(a) + 0.8;
    const x = LAKE.x + Math.sin(a) * R;
    const z = LAKE.z + Math.cos(a) * R;
    const y = groundY(x, z);
    for (let k = 0; k < 6; k++) parts.push(blade(x + (r() - 0.5) * 0.8, y, z + (r() - 0.5) * 0.8, 1.1 + r() * 0.5, 0.06, (r() - 0.5) * 0.4, r() * Math.PI, col("#4f8a3a")));
    for (let k = 0; k < 3; k++) {
      const fx = x + (r() - 0.5) * 0.7;
      const fz = z + (r() - 0.5) * 0.7;
      const st = new THREE.CylinderGeometry(0.02, 0.025, 1.4, 3);
      transform(st, fx, y + 0.7, fz);
      parts.push(part(st, col("#4f8a3a"), (p): Fx => [0, (p.y - y) * 0.4, 0]));
      const fl = new THREE.ConeGeometry(0.2, 0.32, 3);
      transform(fl, fx, y + 1.5, fz, r() * 3, 1, Math.PI);
      parts.push(part(fl, k % 2 ? col("#6a5ae0") : col("#8a6ae8"), [0, 0.5, 0], { faceted: true }));
      const fall = new THREE.ConeGeometry(0.14, 0.18, 3);
      transform(fall, fx, y + 1.62, fz);
      parts.push(part(fall, col("#f2d23a"), [0, 0.5, 0], { faceted: true }));
    }
  }

  // ── lily pads (some flowering) and floating lotus ──
  const pads: { x: number; z: number; r: number }[] = [];
  const padAt = (x: number, z: number, pr: number, flower: number) => {
    if (pads.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + pr)) return;
    pads.push({ x, z, r: pr });
    const g = new THREE.CircleGeometry(pr, low ? 7 : 10, 0.35, Math.PI * 2 - 0.7);
    g.rotateX(-Math.PI / 2);
    transform(g, x, WATER_Y + 0.03, z, r() * Math.PI * 2);
    parts.push(part(g, r() < 0.5 ? col("#4fb046") : col("#3f9a42"), [0, 0, 0], { faceted: true }));
    if (flower === 1) {
      // a water lily: two rings of pointed petals round a yellow heart
      for (let k = 0; k < 2; k++) {
        const pet = new THREE.ConeGeometry(0.28 - k * 0.08, 0.3, 6, 1, true);
        transform(pet, x, WATER_Y + 0.18 + k * 0.06, z, k * 0.5, 1, Math.PI);
        parts.push(part(pet, k ? col("#ffe8f4") : col("#ff9ac8"), [0, 0, 0], { faceted: true }));
      }
      const heart = new THREE.IcosahedronGeometry(0.09, 0);
      transform(heart, x, WATER_Y + 0.24, z);
      parts.push(part(heart, col("#ffd23a"), [0, 0, 0]));
    } else if (flower === 2) {
      // a lotus: a big pink cup held up off the water
      const st = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 3);
      transform(st, x + pr * 0.2, WATER_Y + 0.3, z);
      parts.push(part(st, col("#4f8a3a"), [0, 0.2, 0]));
      for (let k = 0; k < 3; k++) {
        const pet = new THREE.ConeGeometry(0.42 - k * 0.1, 0.5, 7, 1, true);
        transform(pet, x + pr * 0.2, WATER_Y + 0.82 - k * 0.04, z, k * 0.45, 1, Math.PI);
        parts.push(part(pet, k === 2 ? col("#fff0f6") : k ? col("#ffb0d4") : col("#f06aa8"), [0, 0.15, 0], { faceted: true }));
      }
    }
  };
  // patches in the coves: the ducks' bay, and a few more round the lake
  const patches = [{ x: DUCK_BAY.x + 2, z: DUCK_BAY.z - 3, n: 14 }];
  for (let k = 0; k < (low ? 4 : 7); k++) {
    const a = r() * Math.PI * 2;
    const R = lakeRadius(a) - 5 - r() * 4;
    const x = LAKE.x + Math.sin(a) * R;
    const z = LAKE.z + Math.cos(a) * R;
    if (Math.hypot(x - JETTY.bx, z - JETTY.bz) < 6) continue;
    patches.push({ x, z, n: 8 + Math.floor(r() * 6) });
  }
  for (const p of patches)
    for (let k = 0; k < p.n; k++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 4.5;
      const x = p.x + Math.sin(a) * d;
      const z = p.z + Math.cos(a) * d;
      if (waterSdf(x, z) > -1 || waterDepthAt(x, z) > 3.6) continue;
      padAt(x, z, 0.55 + r() * 0.45, r() < 0.22 ? 1 : r() < 0.08 ? 2 : 0);
    }
  // the lotus patch by the jetty's end, where kids can look straight down at it
  for (let k = 0; k < 5; k++) padAt(JETTY.bx - 4.2 - (k % 3) * 1.7, JETTY.bz - 5 - Math.floor(k / 3) * 1.8, 0.85, 2);

  // ── weed swaying under the water ──
  for (let k = 0; k < (low ? 20 : 46); k++) {
    const a = r() * Math.PI * 2;
    const R = lakeRadius(a) * (0.35 + r() * 0.5);
    const x = LAKE.x + Math.sin(a) * R;
    const z = LAKE.z + Math.cos(a) * R;
    const dep = waterDepthAt(x, z);
    if (dep < 1.1) continue;
    const y = WATER_Y - dep;
    for (let i = 0; i < 4; i++) parts.push(blade(x + (r() - 0.5) * 1.2, y, z + (r() - 0.5) * 1.2, Math.min(dep - 0.4, 1.4 + r() * 1.6), 0.12, (r() - 0.5) * 0.8, r() * Math.PI, r() < 0.5 ? col("#3f8a4a") : col("#5a9a3a")));
  }

  // ── the weeping willow on the north-east shore, leaning out over the water ──
  const wa = 2.05;
  const wR = lakeRadius(wa) + 3.2;
  const willow = { x: LAKE.x + Math.sin(wa) * wR, z: LAKE.z + Math.cos(wa) * wR };
  {
    const wy = groundY(willow.x, willow.z);
    const tx = -Math.sin(wa);
    const tz = -Math.cos(wa);
    const H = 13;
    const trunk = [0, 0.4, 0.75, 1].map((u) => new THREE.Vector3(willow.x + tx * u * u * 4.5, wy - 0.3 + u * H, willow.z + tz * u * u * 4.5));
    parts.push(part(taperTube(trunk, { segs: 6, radial: 7, rx: (t) => 0.95 - t * 0.5, lump: 0.3, seed: 77 }), (p) => _c.copy(col("#6e5a44")).lerp(col("#8a7a5a"), noise3(p.x * 0.5, p.y * 0.3, p.z * 0.5, 3) * 0.6), [0, 0, 0], { faceted: true, faceColor: true }));
    obstacles.push({ x: willow.x, z: willow.z, r: 1.3 });
    const top = trunk[3];
    // the crown: a few soft lumps, then long strands hanging down to the water
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + (k % 2) * 0.3;
      const g = new THREE.IcosahedronGeometry(1, 0);
      g.scale(2.6, 1.5, 2.6);
      const d = k % 3 === 0 ? 1.4 : 3.6;
      transform(g, top.x + Math.sin(a) * d, top.y + (k % 3) * 0.7 - 0.2, top.z + Math.cos(a) * d);
      parts.push(part(g, (_p, n) => _c.copy(col("#8ac04a")).multiplyScalar(0.7 + n.y * 0.25), [0, 0.4, 0], { faceted: true, faceColor: true }));
    }
    const strands = low ? 30 : 64;
    for (let k = 0; k < strands; k++) {
      const a = r() * Math.PI * 2;
      const d = 2.5 + r() * 4.2;
      const x = top.x + Math.sin(a) * d;
      const z = top.z + Math.cos(a) * d;
      const y0 = top.y - 0.4 + r();
      const floor = Math.max(WATER_Y + 0.3, groundY(x, z) + 0.3);
      const len = Math.max(2, y0 - floor - r() * 2);
      const g = new THREE.BufferGeometry();
      const w = 0.32;
      const ps = [-w, 0, 0, w, 0, 0, w * 0.7, -len * 0.5, 0, -w * 0.7, -len * 0.5, 0, 0, -len, 0];
      g.setAttribute("position", new THREE.Float32BufferAttribute(ps, 3));
      g.setIndex([0, 2, 1, 0, 3, 2, 3, 4, 2]);
      transform(g, x, y0, z, a);
      parts.push(part(g, k % 2 ? col("#9ad050") : col("#7ab842"), (p): Fx => [0, Math.max(0, (y0 - p.y) / len) * 1.1, 0], { faceted: true }));
    }
  }

  // ── the turtles' log, half sunk in the south shallows, and the kingfisher's post ──
  const la = 0.35;
  const lR = lakeRadius(la) - 3.5;
  const log = { x: LAKE.x + Math.sin(la) * lR, z: LAKE.z + Math.cos(la) * lR, rot: la + Math.PI / 2, len: 6.5, y: WATER_Y + 0.35 };
  {
    const hx = Math.sin(log.rot);
    const hz = Math.cos(log.rot);
    const pts = [-0.5, 0, 0.5].map((u) => new THREE.Vector3(log.x + hx * u * log.len, WATER_Y - 0.15 + (u + 0.5) * 0.3, log.z + hz * u * log.len));
    parts.push(part(taperTube(pts, { segs: 4, radial: 7, rx: (t) => 0.55 - t * 0.12, lump: 0.25, seed: 5 }), (p) => (p.y > WATER_Y + 0.25 ? col("#5f8a3a") : col("#6a5038")), [0, 0, 0], { faceted: true, faceColor: true }));
    // a stubby branch sticking up
    const br = taperTube([pts[2].clone(), pts[2].clone().add(new THREE.Vector3(0.3, 1.2, 0.2))], { segs: 2, radial: 4, rx: (t) => 0.2 - t * 0.1 });
    parts.push(part(br, col("#6a5038"), [0, 0, 0], { faceted: true }));
  }
  const pa = -2.3;
  const pR = lakeRadius(pa) - 2.4;
  const post = { x: LAKE.x + Math.sin(pa) * pR, y: WATER_Y + 1.9, z: LAKE.z + Math.cos(pa) * pR };
  {
    const g = taperTube([new THREE.Vector3(post.x, WATER_Y - waterDepthAt(post.x, post.z), post.z), new THREE.Vector3(post.x + 0.2, WATER_Y + 1, post.z), new THREE.Vector3(post.x + 0.1, post.y, post.z + 0.1)], { segs: 3, radial: 5, rx: (t) => 0.2 - t * 0.08 });
    parts.push(part(g, col("#7a6248"), [0, 0, 0], { faceted: true }));
    const twig = taperTube([new THREE.Vector3(post.x + 0.1, post.y - 0.4, post.z), new THREE.Vector3(post.x + 1.1, post.y + 0.1, post.z + 0.3)], { segs: 2, radial: 3, rx: () => 0.06 });
    parts.push(part(twig, col("#7a6248"), [0, 0, 0], { faceted: true }));
  }

  return { geo: merge(parts), spots: { log, post, pads, reeds, willow, obstacles } };
}

/** a patchy 0..1 so the reeds and irises come in clumps, not an even fringe */
function noiseKeep(x: number, z: number): number {
  return noise3(x * 0.09, 0, z * 0.09, 12);
}
