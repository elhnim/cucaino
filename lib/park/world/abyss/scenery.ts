// The Midnight Rift's rock and still life, in the kit layout + aK (./shapes.ts):
//   canyonChunk   rows i0..i1 of the registry's grid, exactly its triangles (so the floor you swim
//                 down to is the rock you see): layered strata (warm sandstone at the top through
//                 rust, ochre, plum and slate to dark basalt at the bottom), ledges dusted pale with
//                 marine snow, a grey ooze floor, and speckles of glowing crust
//   props         boulders (jutting overhangs), tube-worm clumps, sea pens, glass sponges, barrel
//                 sponges, black smoker chimneys (all local, placed by instance matrices)
//   landmarks     the whale fall, the Old Arch with its rock hood (the octopus's grotto) and the
//                 Rock Bridge, built in world space
//   plumes        the black smokers' smoke columns (for plumeMaterial)
import * as THREE from "three";
import { ABYSS_GRID, abyssVertexX, abyssVertexZ } from "../../registry/abyss";
import { merge } from "../fantasy/geo";
import { noise2, noise3, rngOf } from "../fantasy/noise";
import { K_NONE, K_SWAY } from "./material";
import { ball, col, cone, lerpC, mk, ss, tube } from "./shapes";
import { BRIDGE, CHIMNEYS, GROTTO, WHALE_FALL, floorY, toWorld, type V3 } from "./plan";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const G = ABYSS_GRID;

// strata, top to bottom (y, colour)
const STRATA: [number, THREE.Color][] = [
  [-22, col("#cdb68c")],
  [-30, col("#c2724f")],
  [-40, col("#cf9350")],
  [-52, col("#a65a70")],
  [-64, col("#6c5c96")],
  [-78, col("#4a7282")],
  [-92, col("#3c4460")],
  [-140, col("#2e3248")],
];
const strataTmp = new THREE.Color();
export function strataColor(x: number, y: number, z: number, out = strataTmp): THREE.Color {
  const yy = y + (noise2(x / 23, z / 23, 501) - 0.5) * 7 + (noise2(x / 6, z / 6, 502) - 0.5) * 1.5;
  let k = STRATA.length - 2;
  for (let i = 0; i < STRATA.length - 1; i++)
    if (yy >= STRATA[i + 1][0]) {
      k = i;
      break;
    }
  const [y0, c0] = STRATA[k];
  const [y1, c1] = STRATA[k + 1];
  out.copy(c0).lerp(c1, ss(0.55, 1, (y0 - yy) / (y0 - y1)));
  // thin layers
  const band = Math.sin(yy * 2.2 + noise2(x / 9, z / 9, 503) * 3);
  out.multiplyScalar(0.9 + 0.1 * (band > 0.3 ? 1 : band < -0.5 ? -0.6 : 0));
  return out;
}

const SEDIMENT = col("#9c968e");
const OOZE = col("#6a667e");
/** the colours of the glowing crusts on the cliffs */
export const CRUST_COLS = [col("#5ff0ff"), col("#7dffb0"), col("#b58cff"), col("#ffd36a"), col("#ff8ad8")];

/** the canyon mesh for grid rows i0..i1 (inclusive; i1 <= rows - 1) */
export function canyonChunk(i0: number, i1: number): THREE.BufferGeometry {
  const W = G.cols + 1;
  const quads = (i1 - i0) * G.cols;
  const pos = new Float32Array(quads * 18);
  const nor = new Float32Array(quads * 18);
  const colr = new Float32Array(quads * 18);
  const fx = new Float32Array(quads * 18);
  const kk = new Float32Array(quads * 12);
  let o = 0;
  const a = V(0, 0, 0);
  const b = V(0, 0, 0);
  const c = V(0, 0, 0);
  const e1 = V(0, 0, 0);
  const e2 = V(0, 0, 0);
  const n = V(0, 0, 0);
  const cc = new THREE.Color();
  const tri = (ai: number, aj: number, bi: number, bj: number, ci: number, cj: number) => {
    a.set(abyssVertexX(ai, aj), G.y[ai * W + aj], abyssVertexZ(ai, aj));
    b.set(abyssVertexX(bi, bj), G.y[bi * W + bj], abyssVertexZ(bi, bj));
    c.set(abyssVertexX(ci, cj), G.y[ci * W + cj], abyssVertexZ(ci, cj));
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    n.crossVectors(e1, e2).normalize();
    const mx = (a.x + b.x + c.x) / 3;
    const my = (a.y + b.y + c.y) / 3;
    const mz = (a.z + b.z + c.z) / 3;
    strataColor(mx, my, mz, cc);
    // the floor: soft grey ooze; ledges: dusted with marine snow
    const floorK = ss(0.9, 0.99, n.y) * ss(-95, -108, my);
    cc.lerp(OOZE, floorK * 0.8);
    if (n.y > 0.72 && my < -24) cc.lerp(SEDIMENT, 0.4 * ss(0.72, 0.95, n.y));
    // the top plain stays sand-coloured like the deep floor round it
    cc.lerp(col("#d8caa6"), ss(-23.5, -22.3, my) * 0.9);
    const glow = 0;
    for (const v of [a, b, c]) {
      pos[o * 3] = v.x;
      pos[o * 3 + 1] = v.y;
      pos[o * 3 + 2] = v.z;
      nor[o * 3] = n.x;
      nor[o * 3 + 1] = n.y;
      nor[o * 3 + 2] = n.z;
      colr[o * 3] = cc.r;
      colr[o * 3 + 1] = cc.g;
      colr[o * 3 + 2] = cc.b;
      fx[o * 3 + 2] = glow;
      o++;
    }
  };
  for (let i = i0; i < i1; i++)
    for (let j = 0; j < G.cols; j++) {
      tri(i, j, i + 1, j, i, j + 1);
      tri(i, j + 1, i + 1, j, i + 1, j + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(colr, 3));
  g.setAttribute("aFx", new THREE.BufferAttribute(fx, 3));
  g.setAttribute("aK", new THREE.BufferAttribute(kk, 2));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** lumpy faceted rock (unit size, tinted by the instance: aFx.x = 1) */
export function boulderGeometry(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const p = V(0, 0, 0);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const k = 1 + (noise3(p.x * 1.7 + seed, p.y * 1.7, p.z * 1.7, seed) - 0.5) * 0.75;
    pos.setXYZ(i, p.x * k, p.y * k * (p.y < 0 ? 0.7 : 1), p.z * k);
  }
  g.deleteAttribute("uv");
  return mk(g, (q, nn) => lerpC(col("#6e6870"), col("#a8a098"), nn.y * 0.5 + 0.4).clone(), [1, 0, 0], [K_NONE, 0], true);
}

/** a glowing crust: a little cluster of bioluminescent nubs on the rock (tinted per instance) */
export function crustGeometry(seed: number, low = false): THREE.BufferGeometry {
  const r = rngOf(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < (low ? 3 : 5); k++) {
    const rr = 0.07 + r() * 0.12 + (low ? 0.04 : 0);
    parts.push(mk(ball((r() - 0.5) * 0.7, (r() - 0.5) * 0.7, r() * 0.1, rr, rr, rr * 0.7, low ? 4 : 5, low ? 2 : 3), col("#ffffff"), [1, 0, 1.8], [K_NONE, 0]));
  }
  return merge(parts);
}

/** a clump of giant tube worms: white tubes, red plumes (they sway) */
export function tubeWormGeometry(seed: number, low = false): THREE.BufferGeometry {
  const r = rngOf(seed);
  const parts: THREE.BufferGeometry[] = [];
  const white = col("#f3efe4");
  const red = col("#ff3346");
  const n = low ? 4 : 8;
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2;
    const d = r() * 0.45;
    const h = 0.8 + r() * 1.3;
    const bx = Math.cos(a) * d;
    const bz = Math.sin(a) * d;
    const lean = (r() - 0.5) * 0.3;
    const pts = [V(bx, -0.1, bz), V(bx + lean * 0.3, h * 0.5, bz), V(bx + lean, h, bz + lean * 0.5)];
    const ph = r() * 6;
    parts.push(mk(tube(pts, () => 0.045, 5, 4), white, (p) => [0, 0.06 * Math.max(0, p.y) / h, 0], [K_SWAY, ph]));
    const plume = ball(bx + lean, h + 0.12, bz + lean * 0.5, 0.09, 0.16, 0.09, 6, 4);
    parts.push(mk(plume, red, [0, 0.07, 0.35], [K_SWAY, ph]));
  }
  return merge(parts);
}

/** a sea pen: a feather-like soft coral that glows green (sways) */
export function seaPenGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stalk = col("#ffb86a");
  const leaf = col("#8affc8");
  parts.push(mk(tube([V(0, -0.05, 0), V(0, 0.4, 0), V(0.02, 0.8, 0)], (t) => 0.03 * (1 - t) + 0.01, 4, 4), stalk, (p) => [0, 0.05 * p.y, 0.3], [K_SWAY, 0]));
  for (let k = 0; k < 8; k++) {
    const y = 0.28 + k * 0.065;
    const w = 0.16 * (1 - k / 10);
    for (const sx of [1, -1]) {
      const l = ball(sx * w * 0.6, y, 0, w * 0.6, 0.02, 0.035, 5, 3);
      l.rotateZ(sx * 0.4);
      parts.push(mk(l, leaf, [0, 0.05 * y, 1.4], [K_SWAY, 0]));
    }
  }
  return merge(parts);
}

/** a glass sponge (Venus's flower basket): a pale lattice vase */
export function glassSpongeGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    pts.push(new THREE.Vector2(0.09 + 0.07 * Math.sin(t * Math.PI * 0.9) + t * t * 0.06, t * 1.0));
  }
  const g = new THREE.LatheGeometry(pts, 9);
  g.deleteAttribute("uv");
  return mk(g, (p) => (Math.sin(p.y * 40) * Math.sin(Math.atan2(p.x, p.z) * 9) > 0.3 ? col("#ffffff") : col("#d8e8e4")).clone(), (p) => [0, 0.02 * p.y, 0.4], [K_SWAY, 0], true);
}

/** a barrel sponge: a chunky pale-yellow vase */
export function barrelSpongeGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k <= 6; k++) {
    const t = k / 6;
    pts.push(new THREE.Vector2(0.35 + 0.18 * Math.sin(t * Math.PI) - (t > 0.9 ? 0.05 : 0), t * 0.9));
  }
  pts.push(new THREE.Vector2(0.22, 0.85));
  pts.push(new THREE.Vector2(0.18, 0.3));
  const g = new THREE.LatheGeometry(pts, 10);
  g.deleteAttribute("uv");
  return mk(g, (p) => lerpC(col("#e8c880"), col("#b8904a"), ss(0.5, 0, p.y)).clone(), [0, 0, 0.15], [K_NONE, 0], true);
}

/** a black smoker chimney (unit height 1 = h metres via instance scale y) */
export function chimneyGeometry(seed: number, low = false): THREE.BufferGeometry {
  const r = rngOf(seed);
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 6; k++) pts.push(V((r() - 0.5) * 0.12, k / 6, (r() - 0.5) * 0.12));
  const g = tube(pts, (t) => 0.9 - t * 0.55 + Math.sin(t * 17 + seed) * 0.08, low ? 7 : 9, low ? 10 : 16);
  const basalt = col("#2c2628");
  const rust = col("#8e4c24");
  const hot = col("#ff7a2a");
  const parts: THREE.BufferGeometry[] = [
    mk(
      g,
      (p) => {
        const n = noise3(p.x * 6, p.y * 14, p.z * 6, seed);
        if (n > 0.72) return hot;
        return lerpC(basalt, rust, ss(0.4, 0.65, n) * 0.8);
      },
      (p) => [0, 0, noise3(p.x * 6, p.y * 14, p.z * 6, seed) > 0.72 ? 1.6 : 0],
      [K_NONE, 0],
      true,
    ),
  ];
  // the glowing mouth
  parts.push(mk(ball(0, 1, 0, 0.3, 0.06, 0.3, 8, 3), col("#ffb040"), [0, 0, 3], [K_NONE, 0]));
  // a flange ledge
  const fl = ball(0, 0.55, 0, 0.75, 0.08, 0.7, 8, 3);
  parts.push(mk(fl, rust, [0, 0, 0], [K_NONE, 0], true));
  // (the instance scales x/z by r and y by h: keep it unit-height here)
  return merge(parts);
}

// ── landmarks (world space) ──

const tmp: V3 = { x: 0, y: 0, z: 0 };

/** the whale fall: a great skeleton on the floor, bacterial mats, zombie worms */
export function whaleFallGeometry(low = false): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bone = col("#efe6cc");
  const mat = col("#d9824e");
  const worms = col("#ff5a7a");
  const P = WHALE_FALL;
  const yaw = P.yaw;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const at = (f: number, s: number, dy: number) => {
    const x = P.x + fx * f + rx * s;
    const z = P.z + fz * f + rz * s;
    return V(x, floorY(x, z) + dy, z);
  };
  // spine: vertebrae along a gentle curve, getting smaller towards the tail
  const nv = low ? 14 : 22;
  for (let k = 0; k < nv; k++) {
    const f = 6 - k * 0.8;
    const s = Math.sin(k * 0.25) * 1.2;
    const c = at(f, s, 0.35 - k * 0.008);
    const sz = 0.42 * (1 - k / (nv * 1.3));
    const v = ball(c.x, c.y, c.z, sz, sz * 0.8, sz * 0.55, 6, 4);
    parts.push(mk(v, bone, [0, 0, 0.12], [K_NONE, 0], true));
    // the spine's little wings
    if (k % 2 === 0) {
      const w = tube([at(f, s - sz * 2.2, 0.2), c, at(f, s + sz * 2.2, 0.2)], () => sz * 0.22, 3, 4);
      parts.push(mk(w, bone, [0, 0, 0.12], [K_NONE, 0], true));
    }
  }
  // ribs: arcs over the spine, half-fallen
  for (let k = 0; k < (low ? 8 : 12); k++) {
    const f = 5 - k * 0.55;
    for (const sd of [1, -1]) {
      const lean = sd * (0.4 + (k % 3) * 0.2);
      const base = at(f, sd * 0.5, 0.25);
      const top = at(f - 0.4, sd * (1.6 + Math.abs(lean)), 1.6 - Math.abs(lean) * 0.8);
      const end = at(f - 0.8, sd * 2.6, 0.12);
      parts.push(mk(tube([base, top, end], (t) => 0.12 - t * 0.06, 4, 8), bone, [0, 0, 0.12], [K_NONE, 0], true));
    }
  }
  // skull and jaws
  const skull = at(8.2, 0, 0.7);
  parts.push(mk(ball(skull.x, skull.y, skull.z, 1.4, 0.7, 1.9, 10, 6), bone, [0, 0, 0.12], [K_NONE, 0], true));
  for (const sd of [1, -1]) parts.push(mk(tube([at(7.5, sd * 1.1, 0.3), at(9.8, sd * 1.4, 0.2), at(11.6, sd * 0.6, 0.15)], (t) => 0.22 - t * 0.1, 5, 10), bone, [0, 0, 0.12], [K_NONE, 0], true));
  // flippers' bones
  for (const sd of [1, -1]) parts.push(mk(tube([at(4.6, sd * 1.4, 0.3), at(3.4, sd * 3.2, 0.2), at(2.5, sd * 4.2, 0.1)], (t) => 0.14 - t * 0.08, 4, 6), bone, [0, 0, 0.12], [K_NONE, 0], true));
  // bacterial mats (glowing faintly) and zombie worm fuzz
  const r = rngOf(88);
  for (let k = 0; k < (low ? 8 : 14); k++) {
    const c = at(-6 + r() * 15, (r() - 0.5) * 5, 0.04);
    const m = ball(c.x, c.y, c.z, 0.35 + r() * 0.6, 0.05, 0.3 + r() * 0.5, 7, 2);
    parts.push(mk(m, k % 3 === 0 ? col("#d8d6b8") : mat, [0, 0, 0.18], [K_NONE, 0]));
  }
  for (let k = 0; k < (low ? 20 : 40); k++) {
    const c = at(-4 + r() * 13, (r() - 0.5) * 3, 0.35 + r() * 0.3);
    const w = cone(0.03, 0.14, 3);
    w.translate(c.x, c.y, c.z);
    parts.push(mk(w, worms, [0, 0, 0.8], [K_NONE, 0]));
  }
  return merge(parts);
}

/** the Old Arch round the octopus's ledge, with a rock hood over it (the grotto) */
export function archGeometry(low = false): { geo: THREE.BufferGeometry; runes: V3[] } {
  const parts: THREE.BufferGeometry[] = [];
  const stone = col("#8494ae");
  const dark = col("#5a6680");
  const rune = col("#6ff6ff");
  const P = GROTTO;
  // local frame: forward = out of the wall (the octopus faces this way), right = along the wall
  const fx = Math.sin(P.yaw);
  const fz = Math.cos(P.yaw);
  const rx = Math.cos(P.yaw);
  const rz = -Math.sin(P.yaw);
  const at = (f: number, s: number, y: number) => V(P.x + fx * f + rx * s, P.y + y, P.z + fz * f + rz * s);
  const box = (f: number, s: number, y: number, w: number, h: number, d: number, c: THREE.Color, glow = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.deleteAttribute("uv");
    g.rotateY(P.yaw);
    const q = at(f, s, y);
    g.translate(q.x, q.y, q.z);
    parts.push(mk(g, c, [0, 0, glow], [K_NONE, 0], true));
  };
  const runes: V3[] = [];
  // two pillars in front of the ledge's back, a lintel and a keystone
  const span = 6.5;
  for (const sd of [1, -1]) {
    for (let k = 0; k < 5; k++) box(1.5, sd * span, 0.9 + k * 1.75, 1.5 - (k % 2) * 0.12, 1.6, 1.5, k % 2 ? dark : stone);
    box(1.5, sd * span, 0.2, 2.1, 0.5, 2.1, dark);
    // (a foundation down to the rock below, in case the ledge is narrow)
    box(1.5, sd * span, -4.2, 1.8, 8.4, 1.8, dark);
    for (let k = 0; k < 3; k++) {
      box(2.28, sd * span, 1.8 + k * 2.4, 0.5, 0.5, 0.06, rune, 2.2);
      const q = at(2.35, sd * span, 1.8 + k * 2.4);
      runes.push({ x: q.x, y: q.y, z: q.z });
    }
  }
  const lintel = tube([at(1.5, -span - 1, 9.4), at(1.5, 0, 11.3), at(1.5, span + 1, 9.4)], () => 0.95, 6, low ? 8 : 14);
  parts.push(mk(lintel, stone, [0, 0, 0], [K_NONE, 0], true));
  box(1.8, 0, 11.4, 1.5, 1.8, 1.4, dark);
  box(2.58, 0, 11.4, 0.7, 0.7, 0.06, rune, 2.4);
  {
    const q = at(2.62, 0, 11.4);
    runes.push({ x: q.x, y: q.y, z: q.z });
  }
  // a rock hood over the ledge: the grotto's roof, jutting from the cliff behind
  const hood = new THREE.SphereGeometry(1, low ? 10 : 16, low ? 6 : 9, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const hp = hood.attributes.position as THREE.BufferAttribute;
  const p = V(0, 0, 0);
  for (let i = 0; i < hp.count; i++) {
    p.fromBufferAttribute(hp, i);
    const k = 1 + (noise3(p.x * 2, p.y * 2, p.z * 2, 12) - 0.5) * 0.35;
    hp.setXYZ(i, p.x * 9 * k, p.y * 4.5 * k, p.z * 7 * k);
  }
  hood.deleteAttribute("uv");
  hood.rotateY(P.yaw);
  const hq = at(-2.5, 0, 12.5);
  hood.translate(hq.x, hq.y, hq.z);
  parts.push(mk(hood, (q) => strataColor(q.x, q.y, q.z).clone(), [0, 0, 0], [K_NONE, 0], true));
  // the underside of the hood (seen from below)
  const under = new THREE.CircleGeometry(1, low ? 10 : 16);
  const up = under.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < up.count; i++) {
    p.fromBufferAttribute(up, i);
    up.setXYZ(i, p.x * 8.6, 0, p.y * 6.7);
  }
  // ((x, y) -> (x, 0, y) is rotateX(PI / 2): it now lies flat, facing down)
  under.deleteAttribute("uv");
  under.rotateY(P.yaw);
  under.translate(hq.x, hq.y + 0.2, hq.z);
  parts.push(mk(under, col("#3a3450"), [0, 0, 0], [K_NONE, 0], true));
  // rubble and a few fallen stones
  const r = rngOf(55);
  for (let k = 0; k < 8; k++) box(2 + r() * 4, (r() - 0.5) * 12, 0.3, 0.6 + r() * 0.8, 0.5 + r() * 0.5, 0.7 + r() * 0.8, k % 2 ? stone : dark);
  return { geo: merge(parts), runes };
}

/** the natural Rock Bridge spanning the rift */
export function bridgeGeometry(low = false): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const n = 7;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const u = BRIDGE.uL + (BRIDGE.uR - BRIDGE.uL) * t;
    toWorld(BRIDGE.s + Math.sin(t * Math.PI * 2) * 1.5, u, tmp);
    pts.push(V(tmp.x, BRIDGE.y + Math.sin(t * Math.PI) * 5 - 1, tmp.z));
  }
  const g = tube(pts, (t) => 2.4 + 1.6 * Math.abs(t - 0.5) * 2 + 0.3 * Math.sin(t * 13), low ? 8 : 11, low ? 18 : 30);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const p = V(0, 0, 0);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const k = (noise3(p.x * 0.35, p.y * 0.35, p.z * 0.35, 3) - 0.5) * 2.2;
    pos.setXYZ(i, p.x + k, p.y + k * 0.6, p.z - k);
  }
  g.computeVertexNormals();
  // (glowing moss along its top and speckles on its sides)
  const moss = [col("#5ff0ff"), col("#7dffb0")];
  return mk(
    g,
    (q, nn) => {
      const h = Math.abs((Math.sin(q.x * 3.1 + q.y * 1.7 + q.z * 2.3) * 43758.5) % 1);
      if ((nn.y > 0.55 && h < 0.35) || h < 0.05) return moss[h < 0.17 ? 0 : 1];
      return strataColor(q.x, q.y, q.z).clone();
    },
    (q, nn) => {
      const h = Math.abs((Math.sin(q.x * 3.1 + q.y * 1.7 + q.z * 2.3) * 43758.5) % 1);
      return [0, 0, (nn.y > 0.55 && h < 0.35) || h < 0.05 ? 1.3 : 0];
    },
    [K_NONE, 0],
    true,
  );
}

/** smoke plumes above each chimney: open tubes (attribute aP = height fraction, angle, seed) */
export function plumeGeometry(low = false): THREE.BufferGeometry {
  const radial = low ? 8 : 12;
  const segs = low ? 8 : 12;
  const pos: number[] = [];
  const nor: number[] = [];
  const ap: number[] = [];
  const idx: number[] = [];
  let base = 0;
  CHIMNEYS.forEach((c, ci) => {
    const H = 12 + c.h * 0.8;
    for (let i = 0; i <= segs; i++) {
      const h = i / segs;
      const rr = 0.3 + h * 1.5 + h * h * 1.3;
      for (let k = 0; k <= radial; k++) {
        const a = (k / radial) * Math.PI * 2;
        pos.push(c.x + Math.cos(a) * rr, c.y + c.h + h * H, c.z + Math.sin(a) * rr);
        nor.push(Math.cos(a), 0, Math.sin(a));
        ap.push(h, a, ci * 0.37);
      }
    }
    for (let i = 0; i < segs; i++)
      for (let k = 0; k < radial; k++) {
        const a0 = base + i * (radial + 1) + k;
        const b0 = a0 + radial + 1;
        idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
      }
    base += (segs + 1) * (radial + 1);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("aP", new THREE.Float32BufferAttribute(ap, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

