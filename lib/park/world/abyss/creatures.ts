// The Midnight Rift's creatures, procedural and chunky: the rarest deep-sea animals and a few that
// have been extinct for millions of years. Kit layout + aK (./shapes.ts, ./material.ts). Each faces
// +Z (the way it swims), y up, real-ish size in metres (a little bigger than life for the small ones,
// so kids can see them). Friendly faces: big eyes with a glint, smiles rather than snarls.
//
// Each builder returns the geometry plus local "lights": glowing points (lures, photophores) the
// renderer puts halo sprites on.
import * as THREE from "three";
import { merge } from "../fantasy/geo";
import { noise3 } from "../fantasy/noise";
import { K_BOB, K_FLAP, K_JAW, K_LEGS, K_NONE, K_PULSE, K_REACH, K_SWAY, K_SWIM, K_TRAIL } from "./material";
import { ball, body, col, cone, eyePair, fin, lerpC, mk, ss, tube, type KFn } from "./shapes";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

export interface Light {
  /** local position (for moving lights: which z it sits at, so the CPU can follow the body wave) */
  x: number;
  y: number;
  z: number;
  color: THREE.Color;
  size: number;
}
export interface CreatureGeo {
  geo: THREE.BufferGeometry;
  lights: Light[];
  /** swim wave used by this body (to follow the lights on the CPU): amplitude at z = f(z), param */
  wave?: { amp: (z: number) => number; kp: number };
}

/** swim amplitude: 0 over the head, growing to `A` at the tail tip (z = -L/2) */
const swimAmp = (L: number, A: number, head = 0.25) => (z: number) => A * Math.pow(clamp((L * head - z) / (L * (0.5 + head)), 0, 1), 2);

// ── sharks and shark-like fish (one parametric body) ──

interface SharkOpts {
  L: number;
  girth: number;
  /** where it's thickest (0 tail .. 1 nose) */
  tmax: number;
  /** section exponent (lower = blunter, rounder) */
  ex?: number;
  top: THREE.Color;
  belly: THREE.Color;
  /** darker blotches (0..1) */
  mottle?: number;
  dorsal: { h: number; zc: number };
  second?: boolean;
  pect: number;
  tail: { up: number; low: number; sweep?: number };
  eye: { r: number; iris: THREE.Color; glow?: number; z?: number };
  gills: number;
  smile?: boolean;
  teeth?: number;
  amp: number;
  waves?: number;
  seg: number;
  rad: number;
}

function sharkGeometry(o: SharkOpts): { parts: THREE.BufferGeometry[]; rAt: (z: number) => [number, number]; wave: { amp: (z: number) => number; kp: number } } {
  const L = o.L;
  const pw = Math.log(0.5) / Math.log(o.tmax);
  const ex = o.ex ?? 0.7;
  const f = (t: number) => Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(clamp(t, 0, 1), pw))), ex);
  const prof = (t: number): [number, number] => [L * o.girth * f(t) * 0.92, L * o.girth * f(t) * 1.08];
  const rAt = (z: number) => prof(z / L + 0.5);
  const amp = swimAmp(L, o.amp);
  const kp = ((o.waves ?? 0.9) * Math.PI * 2) / L;
  const K: KFn = [K_SWIM, kp];
  const fxOf = (tint = 0, glow = 0) => (p: THREE.Vector3): [number, number, number] => [tint, amp(p.z), glow];
  const parts: THREE.BufferGeometry[] = [];
  const R0 = L * o.girth;
  const colour = (p: THREE.Vector3) => {
    const line = -0.18 * R0 + 0.12 * R0 * Math.sin(p.z * (6 / L) * Math.PI);
    let c = lerpC(o.top, o.belly, ss(line + 0.2 * R0, line - 0.25 * R0, p.y));
    if (o.mottle) {
      const n = noise3(p.x * (9 / L) * 3, p.y * (9 / L) * 3, p.z * (9 / L) * 3, 7);
      if (n > 0.62 && p.y > line) c = c.multiplyScalar(1 - o.mottle * 0.45);
    }
    return c;
  };
  parts.push(mk(body(L, prof, o.seg, o.rad), colour, fxOf(), K));
  // fins (colour of the back; the undersides of pectorals pale)
  const dz = o.dorsal.zc * L;
  const top = rAt(dz)[1] * 0.92;
  const h = o.dorsal.h * L;
  parts.push(
    mk(
      fin(
        [
          [dz + 0.09 * L, top],
          [dz + 0.03 * L, top + h * 0.55],
          [dz - 0.03 * L, top + h * 0.92],
          [dz - 0.065 * L, top + h],
          [dz - 0.05 * L, top + h * 0.7],
          [dz - 0.055 * L, top + h * 0.35],
          [dz - 0.075 * L, top],
        ],
        0.008 * L,
        "yz",
      ),
      o.top,
      fxOf(),
      K,
      true,
    ),
  );
  if (o.second) {
    const z2 = -0.28 * L;
    const t2 = rAt(z2)[1] * 0.85;
    parts.push(mk(fin([[z2 + 0.03 * L, t2], [z2 - 0.03 * L, t2 + h * 0.35], [z2 - 0.05 * L, t2 + h * 0.3], [z2 - 0.035 * L, t2]], 0.008 * L, "yz"), o.top, fxOf(), K, true));
    const b2 = -rAt(z2)[1] * 0.85;
    parts.push(mk(fin([[z2 + 0.02 * L, b2], [z2 - 0.035 * L, b2 - h * 0.3], [z2 - 0.055 * L, b2 - h * 0.26], [z2 - 0.04 * L, b2]], 0.008 * L, "yz"), o.belly, fxOf(), K, true));
  }
  // pectorals: swept back, drooping a little
  for (const sx of [1, -1]) {
    const pz = 0.17 * L;
    const [rx, ry] = rAt(pz);
    const pl = o.pect;
    const g = fin([[0, 0.06 * L], [pl * 0.08 * L, 0.01 * L], [pl * 0.15 * L, -0.07 * L], [pl * 0.2 * L, -0.13 * L], [pl * 0.15 * L, -0.105 * L], [pl * 0.06 * L, -0.06 * L], [0, -0.035 * L]], 0.007 * L, "xz");
    g.rotateZ(-0.28);
    if (sx < 0) g.scale(-1, 1, 1);
    g.translate(sx * rx * 0.72, -ry * 0.42, pz);
    if (sx < 0) flipWinding(g);
    parts.push(mk(g, lerpC(o.top, o.belly, 0.25).clone(), fxOf(), K, true));
    // pelvic fins
    const vz = -0.16 * L;
    const [vrx, vry] = rAt(vz);
    const pg = fin([[0, 0.03 * L], [0.06 * L, -0.04 * L], [0.05 * L, -0.055 * L], [0, -0.02 * L]], 0.007 * L, "xz");
    pg.rotateZ(-0.5);
    if (sx < 0) pg.scale(-1, 1, 1);
    pg.translate(sx * vrx * 0.5, -vry * 0.7, vz);
    if (sx < 0) flipWinding(pg);
    parts.push(mk(pg, o.belly, fxOf(), K, true));
  }
  // the tail (a crescent; heterocercal: the upper lobe longer)
  const up = o.tail.up;
  const low = o.tail.low;
  const sw = o.tail.sweep ?? 1;
  parts.push(
    mk(
      fin(
        [
          [-0.45 * L, 0.025 * L],
          [-0.53 * L * sw, 0.1 * L * up],
          [-0.62 * L * sw, 0.19 * L * up],
          [-0.585 * L * sw, 0.08 * L * up],
          [-0.555 * L, 0],
          [-0.59 * L, -0.13 * L * low],
          [-0.525 * L, -0.075 * L * low],
          [-0.45 * L, -0.025 * L],
        ],
        0.012 * L,
        "yz",
      ),
      o.top,
      fxOf(),
      K,
      true,
    ),
  );
  // eyes
  const ez = (o.eye.z ?? 0.375) * L;
  const [erx, ery] = rAt(ez);
  const ea = 0.42;
  parts.push(...eyePair(erx * Math.cos(ea) * 0.97, ery * Math.sin(ea) * 0.97, ez, o.eye.r, o.eye.iris, K, o.eye.glow ?? 0.5));
  // gill slits
  const dark = lerpC(o.top, col("#000000"), 0.35).clone();
  for (let g = 0; g < o.gills; g++) {
    const gz = (0.2 + (g / Math.max(1, o.gills - 1)) * 0.07) * L;
    const [grx, gry] = rAt(gz);
    for (const sx of [1, -1]) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 3; k++) {
        const a = -0.55 + (k / 3) * 0.95;
        pts.push(V(sx * grx * Math.cos(a) * 1.0, gry * Math.sin(a) * 1.0, gz - k * 0.004 * L));
      }
      parts.push(mk(tube(pts, () => 0.0026 * L, 3, 4), dark, fxOf(), K));
    }
  }
  // a gentle smile along the underside of the snout, and a few small teeth
  if (o.smile) {
    const pts: THREE.Vector3[] = [];
    const mouthC = col("#2a1418");
    for (let k = 0; k <= 8; k++) {
      const u = k / 8 - 0.5; // -0.5..0.5 across
      const z = (0.435 - Math.abs(u) * 0.2) * L;
      const [mrx, mry] = rAt(z);
      const x = u * 2 * mrx * 0.85;
      const y = -mry * Math.sqrt(Math.max(0, 1 - (x / mrx) ** 2)) * 0.97 + Math.abs(u) * 0.05 * L;
      pts.push(V(x, y, z));
    }
    parts.push(mk(tube(pts, () => 0.0045 * L, 4, 16), mouthC, fxOf(), K));
    const n = o.teeth ?? 0;
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n - 0.5;
      const z = (0.435 - Math.abs(u) * 0.2) * L;
      const [mrx, mry] = rAt(z);
      const x = u * 2 * mrx * 0.8;
      const y = -mry * Math.sqrt(Math.max(0, 1 - (x / mrx) ** 2)) * 0.97 + Math.abs(u) * 0.05 * L;
      const tg = cone(0.006 * L, 0.014 * L, 4);
      tg.rotateX(Math.PI);
      tg.translate(x, y, z + 0.004 * L);
      parts.push(mk(tg, col("#fbf6ea"), fxOf(0, 0.1), K));
    }
  }
  return { parts, rAt, wave: { amp, kp } };
}

/** mirror fix: after scale(-1, 1, 1) the triangles face inwards */
function flipWinding(g: THREE.BufferGeometry) {
  const idx = g.index;
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
  } else {
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 3) {
      const x = pos.getX(i + 1);
      const y = pos.getY(i + 1);
      const z = pos.getZ(i + 1);
      pos.setXYZ(i + 1, pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
      pos.setXYZ(i + 2, x, y, z);
    }
  }
  g.deleteAttribute("normal");
  g.computeVertexNormals();
}

// ── the extinct giants ──

/** MEGALODON: the biggest shark ever (~16 m). Slate-blue, white belly, a friendly smile. */
export function megalodonGeometry(low = false): CreatureGeo {
  const s = sharkGeometry({
    L: 16,
    girth: 0.108,
    tmax: 0.6,
    top: col("#5a6d88"),
    belly: col("#f1f4f5"),
    dorsal: { h: 0.12, zc: 0.02 },
    second: true,
    pect: 1.05,
    tail: { up: 1.05, low: 0.85 },
    eye: { r: 0.26, iris: col("#34445a"), glow: 0.9 },
    gills: 5,
    smile: true,
    teeth: 8,
    amp: 0.85,
    seg: low ? 16 : 26,
    rad: low ? 10 : 14,
  });
  return { geo: merge(s.parts), lights: [], wave: s.wave };
}

/** GREENLAND SHARK: slow, stubby, grey-brown and mottled, with pale eyes */
export function greenlandGeometry(low = false): CreatureGeo {
  const s = sharkGeometry({
    L: 6,
    girth: 0.105,
    tmax: 0.55,
    ex: 0.6,
    top: col("#6a625b"),
    belly: col("#958d86"),
    mottle: 0.8,
    dorsal: { h: 0.05, zc: -0.04 },
    second: true,
    pect: 0.7,
    tail: { up: 0.6, low: 0.35 },
    eye: { r: 0.085, iris: col("#bfe8f2"), glow: 0.8 },
    gills: 5,
    smile: true,
    amp: 0.3,
    seg: low ? 12 : 18,
    rad: low ? 8 : 12,
  });
  return { geo: merge(s.parts), lights: [], wave: s.wave };
}

/** GOBLIN SHARK: pink, a long flat blade of a snout, and a jaw that shoots out */
export function goblinGeometry(low = false): CreatureGeo {
  const L = 3.8;
  const s = sharkGeometry({
    L,
    girth: 0.075,
    tmax: 0.5,
    top: col("#eea2ae"),
    belly: col("#f8d3d8"),
    dorsal: { h: 0.055, zc: -0.1 },
    second: true,
    pect: 0.8,
    tail: { up: 0.75, low: 0.12, sweep: 1.08 },
    eye: { r: 0.06, iris: col("#23283a"), glow: 0.6, z: 0.36 },
    gills: 5,
    amp: 0.22,
    seg: low ? 12 : 18,
    rad: low ? 8 : 10,
  });
  const K: KFn = [K_SWIM, s.wave.kp];
  // the blade snout
  const blade = fin([[-0.045 * L, 0.36 * L], [-0.022 * L, 0.56 * L], [0, 0.6 * L], [0.022 * L, 0.56 * L], [0.045 * L, 0.36 * L]], 0.01 * L, "xz");
  blade.translate(0, s.rAt(0.4 * L)[1] * 0.45, 0);
  s.parts.push(mk(blade, col("#f3b4bd"), [0, 0, 0], K, true));
  // the slingshot jaw (with little teeth) under the snout
  const jaw: THREE.BufferGeometry[] = [];
  const jr = s.rAt(0.38 * L);
  const pts = [V(-jr[0] * 0.7, -jr[1] * 0.6, 0.34 * L), V(0, -jr[1] * 0.95, 0.43 * L), V(jr[0] * 0.7, -jr[1] * 0.6, 0.34 * L)];
  jaw.push(mk(tube(pts, () => 0.016 * L, 5, 10), col("#e98996"), [0, 0.28, 0], [K_JAW, 0]));
  for (let k = 0; k < 7; k++) {
    const u = k / 6 - 0.5;
    const tg = cone(0.006 * L, 0.02 * L, 4);
    tg.translate(u * jr[0] * 1.1, -jr[1] * (0.8 - Math.abs(u) * 0.3), (0.43 - Math.abs(u) * 0.1) * L);
    jaw.push(mk(tg, col("#fff8ee"), [0, 0.28, 0.1], [K_JAW, 0]));
  }
  s.parts.push(...jaw);
  return { geo: merge(s.parts), lights: [], wave: s.wave };
}

/** FRILLED SHARK: eel-like, six frilly gill collars, a wide mouth at the very tip */
export function frilledGeometry(low = false): CreatureGeo {
  const L = 2.6;
  const s = sharkGeometry({
    L,
    girth: 0.046,
    tmax: 0.45,
    ex: 0.45,
    top: col("#7a5c4c"),
    belly: col("#9c7b66"),
    dorsal: { h: 0.025, zc: -0.3 },
    pect: 0.45,
    tail: { up: 0.35, low: 0.3, sweep: 1.05 },
    eye: { r: 0.035, iris: col("#6ff0a8"), glow: 1.2, z: 0.44 },
    gills: 0,
    amp: 0.2,
    waves: 1.7,
    seg: low ? 14 : 22,
    rad: low ? 6 : 8,
  });
  const K: KFn = [K_SWIM, s.wave.kp];
  // frills: ruffled collars round the neck
  for (let g = 0; g < 6; g++) {
    const z = (0.3 + g * 0.018) * L;
    const [rx, ry] = s.rAt(z);
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * Math.PI * 1.7 - Math.PI * 0.85 - Math.PI / 2;
      const w = 1.25 + 0.18 * Math.sin(k * 2.3 + g);
      pts.push(V(Math.cos(a) * rx * w, Math.sin(a) * ry * w, z + Math.sin(k * 1.7) * 0.006 * L));
    }
    s.parts.push(mk(tube(pts, () => 0.006 * L, 3, low ? 12 : 24), col("#b0584e"), (p) => [0, s.wave.amp(p.z), 0], K));
  }
  // the mouth
  const [mx, my] = s.rAt(0.47 * L);
  s.parts.push(mk(ball(0, -my * 0.3, 0.485 * L, mx * 0.75, my * 0.45, 0.012 * L, 8, 4), col("#2a1212"), [0, 0, 0], K));
  return { geo: merge(s.parts), lights: [], wave: s.wave };
}

/** HELICOPRION: a shark-like ratfish relative with a spiral "buzz saw" of teeth in its lower jaw */
export function helicoprionGeometry(low = false): CreatureGeo {
  const L = 5;
  const s = sharkGeometry({
    L,
    girth: 0.085,
    tmax: 0.55,
    top: col("#56747e"),
    belly: col("#dbe7ea"),
    dorsal: { h: 0.085, zc: 0.05 },
    second: false,
    pect: 1.0,
    tail: { up: 0.85, low: 0.6 },
    eye: { r: 0.09, iris: col("#28303c"), glow: 0.6 },
    gills: 5,
    amp: 0.35,
    seg: low ? 14 : 20,
    rad: low ? 8 : 12,
  });
  const K: KFn = [K_SWIM, s.wave.kp];
  // the tooth whorl: a spiral in the chin (yz plane), teeth pointing outwards
  const [, ry] = s.rAt(0.38 * L);
  const cy = -ry * 0.9;
  const cz = 0.36 * L;
  const turns = 2.4;
  const n = low ? 22 : 34;
  const cream = col("#f6eed8");
  const gum = col("#b68c7a");
  const spiral: THREE.Vector3[] = [];
  for (let k = 0; k <= n; k++) {
    const th = (k / n) * turns * Math.PI * 2;
    const r = 0.012 * L + (k / n) * 0.06 * L;
    spiral.push(V(0, cy - Math.sin(th) * r * 0.7 - r * 0.3, cz + Math.cos(th) * r));
  }
  s.parts.push(mk(tube(spiral, (t) => 0.006 * L + t * 0.008 * L, 4, n), gum, [0, 0, 0], K));
  for (let k = 3; k <= n; k++) {
    const th = (k / n) * turns * Math.PI * 2;
    const r = 0.012 * L + (k / n) * 0.06 * L;
    const tg = cone(0.006 * L, 0.02 * L * (0.5 + k / n), 4);
    tg.rotateX(Math.PI / 2 - th);
    tg.translate(0, cy - Math.sin(th) * r * 0.7 - r * 0.3, cz + Math.cos(th) * r);
    s.parts.push(mk(tg, cream, [0, 0, 0.12], K));
  }
  return { geo: merge(s.parts), lights: [], wave: s.wave };
}

/** DUNKLEOSTEUS: an armoured fish with a bony helmet and self-sharpening jaw blades */
export function dunkleosteusGeometry(low = false): CreatureGeo {
  const L = 6;
  const s = sharkGeometry({
    L,
    girth: 0.1,
    tmax: 0.68,
    ex: 0.55,
    top: col("#606d76"),
    belly: col("#cfd6d9"),
    dorsal: { h: 0.07, zc: -0.05 },
    pect: 0.8,
    tail: { up: 0.9, low: 0.55 },
    eye: { r: 0.12, iris: col("#e8c05a"), glow: 0.9, z: 0.39 },
    gills: 0,
    amp: 0.35,
    seg: low ? 14 : 20,
    rad: low ? 8 : 12,
  });
  const K: KFn = [K_SWIM, s.wave.kp];
  // the armour: bronze plates over the head and shoulders (faceted, with dark seams), a shell a
  // little bigger than the head from z = 0.13 L to the snout
  const bronze = col("#8f6c46");
  const seam = col("#3d2c1e");
  const z0 = 0.2 * L;
  const zl = 0.31 * L;
  const armour = body(zl, (t) => {
    const [rx, ry] = s.rAt(z0 + t * zl);
    const k = 1.05 + 0.03 * Math.sin(t * 9);
    return [rx * k + 0.01, ry * k + 0.01];
  }, low ? 8 : 12, low ? 8 : 12);
  armour.translate(0, 0.01 * L, z0 + zl / 2);
  s.parts.push(
    mk(
      armour,
      (q, nn) => {
        // plate seams: a ring round the helmet and a line down the cheek
        const zr = (q.z - z0) / zl;
        const line = Math.abs(zr - 0.42) < 0.035 || (Math.abs(q.y) < 0.03 * L && zr < 0.42);
        return line ? seam : lerpC(bronze, col("#c49a64"), nn.y * 0.5 + 0.25);
      },
      [0, 0, 0],
      K,
      true,
    ),
  );
  // the jaw blades: bony beak plates at the front
  const bone = col("#efe4c6");
  const [bx, by] = s.rAt(0.46 * L);
  for (const sy of [1, -1]) {
    const g = fin([[0.42 * L, 0], [0.51 * L, sy * by * 0.15], [0.45 * L, sy * by * 0.6]], 0.02 * L, "yz");
    for (const sx of [1, -1]) {
      const gg = g.clone();
      gg.translate(sx * bx * 0.35, sy * by * 0.05, 0);
      s.parts.push(mk(gg, bone, [0, 0, 0.1], K, true));
    }
    g.dispose();
  }
  return { geo: merge(s.parts), lights: [], wave: s.wave };
}

/** LIOPLEURODON: a stout sea reptile with a long crocodile-like head and four big flippers */
export function liopleurodonGeometry(low = false): CreatureGeo {
  const L = 7;
  const f = (t: number) => {
    const torso = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 1.25))), 0.75);
    const neck = 1 - 0.2 * Math.exp(-(((t - 0.74) / 0.05) ** 2));
    return torso * neck;
  };
  const snout = (t: number) => (t > 0.8 ? 1 - (t - 0.8) * 2.2 : 1);
  const prof = (t: number): [number, number] => [L * 0.1 * f(t) * (t > 0.8 ? 1 - (t - 0.8) * 1.4 : 1), L * 0.1 * f(t) * snout(t)];
  const rAt = (z: number) => prof(z / L + 0.5);
  const amp = swimAmp(L, 0.25, 0.1);
  const kp = (0.7 * Math.PI * 2) / L;
  const K: KFn = [K_SWIM, kp];
  const top = col("#3f6f7e");
  const belly = col("#ece6d2");
  const parts: THREE.BufferGeometry[] = [];
  parts.push(
    mk(
      body(L, prof, low ? 16 : 26, low ? 10 : 14),
      (p) => {
        let c = lerpC(top, belly, ss(0.05, -0.35, p.y));
        if (p.y > 0 && noise3(p.x * 2.2, p.y * 2.2, p.z * 2.2, 3) > 0.66) c = c.multiplyScalar(0.62);
        return c;
      },
      (p) => [0, amp(p.z), 0],
      K,
    ),
  );
  // four flippers (underwater "wings")
  for (const fz of [0.13 * L, -0.12 * L])
    for (const sx of [1, -1]) {
      const [rx, ry] = rAt(fz);
      const sc = fz > 0 ? 1 : 0.9;
      const g = fin([[0, 0.045 * L * sc], [0.08 * L * sc, 0.06 * L * sc], [0.18 * L * sc, 0.03 * L * sc], [0.27 * L * sc, -0.04 * L * sc], [0.25 * L * sc, -0.07 * L * sc], [0.14 * L * sc, -0.06 * L * sc], [0, -0.04 * L * sc]], 0.014 * L, "xz");
      g.rotateZ(-0.12);
      if (sx < 0) {
        g.scale(-1, 1, 1);
        flipWinding(g);
      }
      g.translate(sx * rx * 0.8, -ry * 0.35, fz);
      const x0 = rx * 0.8;
      parts.push(mk(g, lerpC(top, belly, 0.35).clone(), (p) => [0, 0.55 * clamp((Math.abs(p.x) - x0) / (0.27 * L), 0, 1), 0], [K_FLAP, 2.2 / L], true));
    }
  // teeth along the long jaws, eyes on top of the head
  const white = col("#fffaf0");
  for (let k = 0; k < 9; k++) {
    const z = (0.38 + k * 0.012) * L;
    const [rx, ry] = rAt(z);
    for (const sx of [1, -1]) {
      const tg = cone(0.006 * L, 0.018 * L, 4);
      tg.rotateX(Math.PI);
      tg.translate(sx * rx * 0.85, -ry * 0.25, z);
      parts.push(mk(tg, white, [0, 0, 0.1], K));
    }
  }
  const mouth: THREE.Vector3[] = [];
  for (let k = 0; k <= 6; k++) {
    const z = (0.34 + k * 0.026) * L;
    const [rx, ry] = rAt(z);
    mouth.push(V(rx * 0.97, -ry * 0.2, z));
  }
  const mouthL = mouth.map((v) => V(-v.x, v.y, v.z));
  parts.push(mk(tube(mouth, () => 0.006 * L, 3, 10), col("#27161a"), [0, 0, 0], K));
  parts.push(mk(tube(mouthL, () => 0.006 * L, 3, 10), col("#27161a"), [0, 0, 0], K));
  const [erx, ery] = rAt(0.35 * L);
  parts.push(...eyePair(erx * 0.72, ery * 0.62, 0.35 * L, 0.1, col("#e9b04a"), K, 0.8));
  return { geo: merge(parts), lights: [], wave: { amp, kp } };
}

/** AMMONITE: a coiled, striped shell with tentacles; jets along shell-first */
export function ammoniteGeometry(low = false): CreatureGeo {
  const parts: THREE.BufferGeometry[] = [];
  const turns = 3.1;
  const n = low ? 26 : 48;
  const a = 0.045;
  const b = Math.log(0.55 / a) / (turns * Math.PI * 2);
  const pts: THREE.Vector3[] = [];
  // the coil lies in the yz plane (axis x); it ends with the opening facing back (-z)
  for (let k = 0; k <= n; k++) {
    const th = (k / n) * turns * Math.PI * 2;
    const r = a * Math.exp(b * th);
    const ang = th + Math.PI * 0.5 - turns * Math.PI * 2;
    pts.push(V(0, Math.sin(ang) * r, Math.cos(ang) * r));
  }
  const cream = col("#f4e7c6");
  const brown = col("#a8683a");
  const tubeG = tube(pts, (t) => 0.4 * a * Math.exp(b * t * turns * Math.PI * 2) + 0.004, low ? 5 : 8, n);
  parts.push(
    mk(
      tubeG,
      (p) => {
        const th = Math.atan2(p.y, p.z);
        const r = Math.hypot(p.y, p.z);
        const band = Math.sin(th * 11 + Math.log(Math.max(0.01, r)) * 9);
        return band > 0.25 ? brown : cream;
      },
      [0, 0, 0.12],
      [K_NONE, 0],
      true,
    ),
  );
  // the soft body in the opening (it faces -z), and its tentacles trailing back
  const end = pts[pts.length - 1];
  const bodyC = col("#d99a8a");
  parts.push(mk(ball(end.x, end.y, end.z - 0.05, 0.18, 0.2, 0.12, 8, 6), bodyC, [0, 0, 0], [K_NONE, 0]));
  const nt = low ? 6 : 10;
  for (let k = 0; k < nt; k++) {
    const ang = (k / nt) * Math.PI * 2;
    const ox = Math.cos(ang) * 0.11;
    const oy = Math.sin(ang) * 0.12;
    const tpts = [V(end.x + ox, end.y + oy, end.z - 0.1), V(end.x + ox * 1.4, end.y + oy * 1.3 - 0.03, end.z - 0.35), V(end.x + ox * 1.1, end.y + oy - 0.06, end.z - 0.62)];
    parts.push(mk(tube(tpts, (t) => 0.028 * (1 - t) + 0.006, 4, 6), bodyC, (p) => [0, 0.08 * clamp((end.z - 0.1 - p.z) / 0.5, 0, 1), 0], [K_TRAIL, 6]));
  }
  parts.push(...eyePair(0.14, end.y + 0.1, end.z - 0.02, 0.05, col("#1c1a22"), [K_NONE, 0], 0.7, -1.2));
  return { geo: merge(parts), lights: [] };
}

/** TRILOBITE: a three-lobed armoured bug with crystal eyes, pattering over the floor */
export function trilobiteGeometry(low = false): CreatureGeo {
  const parts: THREE.BufferGeometry[] = [];
  const amber = col("#a8743f");
  const dark = col("#6a4424");
  const shell = ball(0, 0.05, 0, 0.21, 0.055, 0.34, low ? 10 : 14, low ? 5 : 7);
  parts.push(mk(shell, (p) => (Math.sin(p.z * 60) > 0.55 && p.z < 0.2 ? dark : lerpC(amber, col("#d49a5a"), p.y * 6)), [0, 0, 0], [K_NONE, 0], true));
  // the raised middle lobe
  parts.push(mk(ball(0, 0.085, -0.03, 0.06, 0.05, 0.3, 8, 5), (p) => (Math.sin(p.z * 60) > 0.4 ? dark : amber), [0, 0, 0], [K_NONE, 0], true));
  // head shield + spines
  parts.push(mk(ball(0, 0.07, 0.22, 0.2, 0.06, 0.14, 10, 5), col("#b88050"), [0, 0, 0], [K_NONE, 0], true));
  for (const sx of [1, -1]) {
    const sp = cone(0.025, 0.28, 4);
    sp.rotateX(-Math.PI / 2 - 0.05);
    sp.rotateY(sx * 0.35 + Math.PI);
    sp.translate(sx * 0.19, 0.05, 0.16);
    parts.push(mk(sp, amber, [0, 0, 0], [K_NONE, 0], true));
    // crystal eyes (they shimmer)
    parts.push(mk(ball(sx * 0.1, 0.12, 0.24, 0.035, 0.03, 0.045, 6, 4), col("#9fe8ff"), [0, 0, 1.2], [K_NONE, 0]));
    // legs peeking out
    for (let k = 0; k < 6; k++) {
      const z = 0.15 - k * 0.07;
      const lg = tube([V(sx * 0.12, 0.02, z), V(sx * 0.26, 0.01, z - 0.02), V(sx * 0.3, -0.02, z - 0.04)], () => 0.012, 3, 4);
      parts.push(mk(lg, col("#c88a58"), [0, 0.025, 0], [K_LEGS, 0]));
    }
  }
  return { geo: merge(parts), lights: [] };
}

/** SEA SCORPION (eurypterid): segmented, paddles for swimming, grabbing claws, a spike tail */
export function eurypteridGeometry(low = false): CreatureGeo {
  const parts: THREE.BufferGeometry[] = [];
  const L = 2.2;
  const red = col("#8c4630");
  const band = col("#c47a4e");
  const f = (t: number) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.6) * (1 + 0.06 * Math.sin(t * 60));
  const prof = (t: number): [number, number] => [L * 0.11 * f(t), L * 0.045 * f(t)];
  parts.push(mk(body(L, prof, low ? 20 : 34, low ? 8 : 10), (p) => (Math.sin(p.z * 26) > 0.5 ? band : red), [0, 0, 0], [K_NONE, 0], true));
  // head plate
  parts.push(mk(ball(0, 0.03, 0.78, 0.2, 0.07, 0.26, 10, 5), col("#9a5436"), [0, 0, 0], [K_NONE, 0], true));
  // the spike tail
  const sp = cone(0.05, 0.55, 5);
  sp.rotateX(-Math.PI / 2);
  sp.translate(0, 0.02, -1.08);
  parts.push(mk(sp, col("#6e3624"), [0, 0, 0], [K_NONE, 0], true));
  for (const sx of [1, -1]) {
    // swimming paddles
    const pd = fin([[0, 0.05], [0.3, -0.05], [0.42, -0.2], [0.34, -0.28], [0.2, -0.18], [0, -0.06]], 0.02, "xz");
    if (sx < 0) {
      pd.scale(-1, 1, 1);
      flipWinding(pd);
    }
    pd.translate(sx * 0.16, 0.0, 0.6);
    parts.push(mk(pd, band, (p) => [0, 0.09 * clamp((Math.abs(p.x) - 0.16) / 0.3, 0, 1), 0], [K_FLAP, 3], true));
    // walking legs
    for (let k = 0; k < 4; k++) {
      const z = 0.95 - k * 0.1;
      parts.push(mk(tube([V(sx * 0.12, 0, z), V(sx * 0.32, -0.02, z + 0.05), V(sx * 0.38, -0.1, z + 0.08)], () => 0.018, 3, 4), red, [0, 0.03, 0], [K_LEGS, 0]));
    }
    // grabbing claws in front
    parts.push(mk(tube([V(sx * 0.05, 0.02, 1.0), V(sx * 0.08, 0.04, 1.2), V(sx * 0.06, 0.03, 1.32)], () => 0.02, 4, 5), col("#b05a3a"), [0, 0, 0], [K_NONE, 0]));
    parts.push(mk(ball(sx * 0.1, 0.1, 0.9, 0.04, 0.025, 0.05, 6, 4), col("#14100e"), [0, 0, 0.2], [K_NONE, 0]));
  }
  return { geo: merge(parts), lights: [] };
}

// ── deep-sea squids and octopuses ──

/** GIANT SQUID: ~11 m with its feeding tentacles; eyes as big as dinner plates. Mantle first (+z). */
export function giantSquidGeometry(low = false): CreatureGeo {
  const parts: THREE.BufferGeometry[] = [];
  const red = col("#c44b40");
  const pale = col("#eca090");
  const skin = (p: THREE.Vector3) => {
    let c = lerpC(red, pale, ss(0.05, -0.4, p.y));
    if (noise3(p.x * 7, p.y * 7, p.z * 7, 9) > 0.7) c = c.multiplyScalar(0.72);
    return c;
  };
  // mantle from z = 0 (the head end) to z = 3.2 (the tip)
  const mantle = body(3.2, (t) => {
    const r = 0.46 * Math.pow(Math.max(0, Math.sin(Math.PI * (0.5 + 0.5 * t))), 0.7) + 0.02;
    return [r * 0.95, r];
  }, low ? 12 : 18, low ? 10 : 14);
  mantle.translate(0, 0, 1.6);
  parts.push(mk(mantle, skin, [0, 0, 0], [K_NONE, 0]));
  // head
  parts.push(mk(ball(0, 0, -0.2, 0.38, 0.36, 0.42, 12, 8), skin, [0, 0, 0], [K_NONE, 0]));
  // the fins at the tip (they flap)
  for (const sx of [1, -1]) {
    const g = fin([[0, 2.25], [0.6, 2.75], [0, 3.2]], 0.03, "xz");
    if (sx < 0) {
      g.scale(-1, 1, 1);
      flipWinding(g);
    }
    parts.push(mk(g, red, (p) => [0, 0.22 * clamp(Math.abs(p.x) / 0.6, 0, 1), 0], [K_FLAP, 1.5], true));
  }
  // the huge eyes
  parts.push(...eyePair(0.33, 0.06, -0.2, 0.19, col("#d8ecff"), [K_NONE, 0], 0.8, 0.1));
  // eight arms trailing back and two long feeding tentacles with clubs
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const pts = [V(ca * 0.22, sa * 0.22, -0.45), V(ca * 0.34, sa * 0.32, -1.1), V(ca * 0.26, sa * 0.24, -1.8), V(ca * 0.14, sa * 0.12, -2.5)];
    parts.push(mk(tube(pts, (t) => 0.1 * (1 - t) + 0.012, low ? 4 : 6, low ? 8 : 12), lerpC(red, pale, 0.3).clone(), (p) => [0, 0.32 * clamp((-p.z - 0.45) / 2, 0, 1), 0], [K_TRAIL, 1.6]));
  }
  for (const sx of [1, -1]) {
    const pts = [V(sx * 0.1, -0.1, -0.5), V(sx * 0.3, -0.25, -2.5), V(sx * 0.35, -0.2, -5), V(sx * 0.25, -0.3, -7.5)];
    parts.push(mk(tube(pts, (t) => 0.045 * (1 - t) + 0.02, 4, low ? 14 : 22), red, (p) => [0, 0.55 * clamp((-p.z - 0.5) / 7, 0, 1), 0], [K_TRAIL, 0.9]));
    parts.push(mk(ball(sx * 0.25, -0.3, -7.9, 0.1, 0.06, 0.42, 8, 5), pale, [0, 0.55, 0.15], [K_TRAIL, 0.9]));
  }
  // (the whole squid is ~11 m nose to club: centre it)
  const g = merge(parts);
  g.translate(0, 0, 2.2);
  return { geo: g, lights: [] };
}

/** VAMPIRE SQUID: a deep-red cloak of webbed arms, big blue eyes, glowing arm tips */
export function vampireSquidGeometry(low = false): CreatureGeo {
  const parts: THREE.BufferGeometry[] = [];
  const wine = col("#6e1a34");
  const cloakC = col("#5a1430");
  parts.push(mk(ball(0, 0.02, 0.12, 0.17, 0.18, 0.26, 12, 8), wine, [0, 0, 0.05], [K_NONE, 0]));
  // the ear-like fins
  for (const sx of [1, -1]) {
    const g = fin([[0, 0.05], [0.12, 0.1], [0.17, 0.02], [0.12, -0.06], [0, -0.03]], 0.02, "xz");
    if (sx < 0) {
      g.scale(-1, 1, 1);
      flipWinding(g);
    }
    g.translate(sx * 0.12, 0.08, 0.26);
    parts.push(mk(g, wine, (p) => [0, 0.06 * clamp((Math.abs(p.x) - 0.12) / 0.15, 0, 1), 0], [K_FLAP, 4], true));
  }
  // the cloak (webbed arms) opening backwards; it pulses open and shut
  const cloak = body(0.42, (t) => {
    const r = 0.1 + 0.26 * Math.pow(1 - t, 1.3);
    return [r, r * 0.95];
  }, low ? 6 : 8, low ? 8 : 12);
  cloak.translate(0, 0, -0.2);
  parts.push(mk(cloak, (p) => lerpC(cloakC, col("#2a0816"), ss(-0.1, -0.4, p.z)), (p) => [0, 0.2 * clamp((-p.z - 0.05) / 0.35, 0, 1), 0], [K_PULSE, 0], true));
  const lights: Light[] = [];
  const blue = col("#6fe0ff");
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const x = Math.cos(a) * 0.35;
    const y = Math.sin(a) * 0.33;
    parts.push(mk(ball(x, y, -0.42, 0.028, 0.028, 0.028, 5, 4), blue, [0, 0.2, 3], [K_PULSE, 0]));
    if (k % 2 === 0) lights.push({ x, y, z: -0.42, color: blue, size: 0.35 });
  }
  parts.push(...eyePair(0.13, 0.06, 0.18, 0.07, col("#3aa8ff"), [K_NONE, 0], 1.2, 0.5));
  return { geo: merge(parts), lights };
}

/** DUMBO OCTOPUS: a round pink head that flaps its ear-fins like an elephant, a short webbed
 *  skirt of arms with little curled tips (upright, facing +z) */
export function dumboGeometry(low = false): CreatureGeo {
  const parts: THREE.BufferGeometry[] = [];
  const deep = col("#f08e86");
  // the head: a soft round dome, a little taller than wide
  parts.push(mk(ball(0, 0.24, 0, 0.25, 0.27, 0.24, low ? 10 : 14, low ? 7 : 10), (p) => lerpC(deep, col("#ffd8cc"), ss(0.05, 0.45, p.y)), [0, 0, 0.12], [K_NONE, 0]));
  // big rounded ear-fins, tilted up (they flap)
  for (const sx of [1, -1]) {
    const pts: [number, number][] = [];
    for (let k = 0; k <= 10; k++) {
      const a = (k / 10) * Math.PI;
      pts.push([Math.sin(a) * 0.2, Math.cos(a) * 0.12]);
    }
    const g = fin(pts, 0.025, "xz");
    g.rotateZ(0.45);
    if (sx < 0) {
      g.scale(-1, 1, 1);
      flipWinding(g);
    }
    g.translate(sx * 0.19, 0.38, -0.02);
    parts.push(mk(g, deep, (p) => [0, 0.1 * clamp((Math.abs(p.x) - 0.18) / 0.18, 0, 1), 0.1], [K_FLAP, 5], true));
  }
  // the webbed skirt: a short, wide, scalloped bell under the head
  const skirt = body(0.16, (t) => {
    const r = 0.33 - 0.12 * t;
    return [r, r];
  }, 3, low ? 12 : 16);
  skirt.rotateX(-Math.PI / 2);
  skirt.translate(0, 0.03, 0);
  parts.push(mk(skirt, (p) => lerpC(deep, col("#d8737a"), ss(0.05, -0.08, p.y)), (p) => [0, 0.14 * clamp((0.05 - p.y) / 0.13, 0, 1), 0.06], [K_PULSE, 0], true));
  // eight little curled arm tips peeking out of the web
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    const x = Math.cos(a) * 0.33;
    const z = Math.sin(a) * 0.33;
    const tip = tube([V(x * 0.9, -0.03, z * 0.9), V(x * 1.12, -0.08, z * 1.12), V(x * 1.05, -0.14, z * 1.05)], (t) => 0.035 * (1 - t) + 0.012, 4, 4);
    parts.push(mk(tip, deep, [0, 0.14, 0.06], [K_PULSE, 0]));
  }
  // big friendly eyes on the front of the head
  parts.push(...eyePair(0.12, 0.27, 0.17, 0.07, col("#241418"), [K_NONE, 0], 0.9, 1.0));
  return { geo: merge(parts), lights: [] };
}

/** GIANT OCTOPUS body (its eight arms are separate instances of octoArmGeometry) */
export function octopusBodyGeometry(low = false): CreatureGeo {
  const parts: THREE.BufferGeometry[] = [];
  const skin = (p: THREE.Vector3) => {
    const n = noise3(p.x * 1.4, p.y * 1.4, p.z * 1.4, 21);
    return n > 0.62 ? col("#b8b0b8") : col("#f4eef2");
  };
  const lump = (g: THREE.BufferGeometry, k: number) => {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const p = V(0, 0, 0);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const s = 1 + (noise3(p.x * 1.8, p.y * 1.8, p.z * 1.8, 5) - 0.5) * k;
      pos.setXYZ(i, p.x * s, p.y * s, p.z * s);
    }
    g.computeVertexNormals();
    return g;
  };
  // the mantle (a great soft sac behind and above the head) and the head
  const mantle = lump(ball(0, 0, 0, 1.3, 1.55, 1.7, low ? 12 : 18, low ? 9 : 13), 0.18);
  mantle.rotateX(0.5);
  mantle.translate(0, 2.0, -1.2);
  parts.push(mk(mantle, skin, [1, 0, 0], [K_NONE, 0]));
  parts.push(mk(lump(ball(0, 0.95, 0.35, 1.1, 0.85, 0.95, low ? 12 : 16, low ? 8 : 11), 0.12), skin, [1, 0, 0], [K_NONE, 0]));
  // brows and big friendly eyes (golden, with a sideways pupil)
  for (const sx of [1, -1]) parts.push(mk(ball(sx * 0.7, 1.35, 0.72, 0.36, 0.2, 0.3, 8, 5), skin, [1, 0, 0], [K_NONE, 0]));
  parts.push(...eyePair(0.72, 1.08, 0.8, 0.27, col("#ffcf4a"), [K_NONE, 0], 0.9, 0.9));
  // the siphon
  parts.push(mk(tube([V(0.9, 0.6, 0.1), V(1.2, 0.5, 0.3), V(1.35, 0.55, 0.5)], (t) => 0.16 - t * 0.05, 6, 5), skin, [1, 0, 0], [K_NONE, 0]));
  return { geo: merge(parts), lights: [] };
}

/** one GIANT OCTOPUS arm: from its root (origin) out along +z, 7 m, two rows of pale suckers */
export const OCTO_ARM_L = 7;
export function octoArmGeometry(low = false): CreatureGeo {
  const parts: THREE.BufferGeometry[] = [];
  const L = OCTO_ARM_L;
  const n = low ? 14 : 22;
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 6; k++) pts.push(V(0, -Math.sin((k / 6) * Math.PI) * 0.2, (k / 6) * L));
  const r = (t: number) => 0.4 * (1 - t) + 0.04;
  parts.push(mk(tube(pts, r, low ? 6 : 8, n), (p) => (p.y < -0.15 * r(p.z / L) ? col("#f6e8ec") : col("#f2ecf0")), [1, 0.75, 0], [K_REACH, L]));
  const sucker = col("#fff2e8");
  const m = low ? 8 : 13;
  for (let k = 1; k < m; k++) {
    const t = k / m;
    const z = t * L;
    const rr = r(t);
    for (const sx of [1, -1]) {
      const x = sx * rr * 0.45 * (k % 2 === 0 ? 1 : 0.8);
      const y = -Math.sin(t * Math.PI) * 0.2 - rr * 0.82;
      parts.push(mk(ball(x, y, z, rr * 0.22, rr * 0.1, rr * 0.22, 6, 3), sucker, [0.55, 0.75, 0.1], [K_REACH, L]));
    }
  }
  return { geo: merge(parts), lights: [] };
}

// ── deep-sea fish ──

/** ANGLERFISH: round and dark, a big toothy grin, and a glowing lure on a fishing-rod fin */
export function anglerfishGeometry(low = false): CreatureGeo {
  const parts: THREE.BufferGeometry[] = [];
  const L = 0.8;
  const dark = col("#3e3038");
  const belly = col("#5e4852");
  const prof = (t: number): [number, number] => {
    const f = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 1.36))), 0.5);
    return [0.28 * f, 0.33 * f];
  };
  const amp = swimAmp(L, 0.06, 0.1);
  const K: KFn = [K_SWIM, 6];
  parts.push(mk(body(L, prof, low ? 10 : 14, low ? 10 : 14), (p) => lerpC(dark, belly, ss(0, -0.25, p.y)), (p) => [0, amp(p.z), 0], K));
  // the big mouth: a dark inside, a jutting lower jaw, and pointy (but small!) teeth
  parts.push(mk(ball(0, -0.06, 0.33, 0.2, 0.13, 0.07, 10, 6), col("#140a10"), [0, 0, 0], K));
  const jaw = [V(-0.2, -0.05, 0.3), V(-0.12, -0.2, 0.42), V(0.12, -0.2, 0.42), V(0.2, -0.05, 0.3)];
  parts.push(mk(tube(jaw, () => 0.035, 5, 10), dark, [0, 0, 0], K));
  const white = col("#f7f2ff");
  for (let k = 0; k < 9; k++) {
    const u = k / 8 - 0.5;
    const up = cone(0.012, 0.05, 3);
    up.rotateX(Math.PI);
    up.translate(u * 0.34, 0.06 - Math.abs(u) * 0.12, 0.4 - Math.abs(u) * 0.12);
    parts.push(mk(up, white, [0, 0, 0.35], K));
    const dn = cone(0.012, 0.05, 3);
    dn.translate(u * 0.3, -0.19 + Math.abs(u) * 0.1, 0.43 - Math.abs(u) * 0.12);
    parts.push(mk(dn, white, [0, 0, 0.35], K));
  }
  // the rod and its glowing lure
  const rod = [V(0, 0.3, 0.12), V(0, 0.56, 0.3), V(0, 0.58, 0.52), V(0, 0.5, 0.64)];
  const lureAmp = (p: THREE.Vector3) => 0.07 * clamp((p.z - 0.12) / 0.52, 0, 1);
  parts.push(mk(tube(rod, (t) => 0.014 - t * 0.006, 4, 10), dark, (p) => [0, lureAmp(p), 0], [K_BOB, 0]));
  const lureC = col("#a8fbff");
  parts.push(mk(ball(0, 0.47, 0.66, 0.05, 0.06, 0.05, 8, 6), lureC, [0, 0.07, 4], [K_BOB, 0]));
  // fins: little pectorals, a tail fan, a spiny back
  for (const sx of [1, -1]) {
    const g = fin([[0, 0.04], [0.1, 0.0], [0.09, -0.06], [0, -0.03]], 0.01, "xz");
    if (sx < 0) {
      g.scale(-1, 1, 1);
      flipWinding(g);
    }
    g.translate(sx * 0.25, -0.05, 0.02);
    parts.push(mk(g, belly, [0, 0.02, 0], K, true));
  }
  parts.push(mk(fin([[-0.34, 0.04], [-0.5, 0.14], [-0.52, -0.14], [-0.34, -0.04]], 0.012, "yz"), dark, (p) => [0, amp(p.z), 0], K, true));
  parts.push(mk(fin([[-0.05, 0.3], [-0.2, 0.36], [-0.3, 0.2]], 0.01, "yz"), dark, (p) => [0, amp(p.z), 0], K, true));
  parts.push(...eyePair(0.17, 0.12, 0.26, 0.045, col("#c9f0ff"), K, 0.9, 0.6));
  return { geo: merge(parts), lights: [{ x: 0, y: 0.47, z: 0.66, color: lureC, size: 0.9 }] };
}

/** GULPER EEL: a mouth bigger than its body, a long whip of a tail with a glowing pink tip */
export function gulperGeometry(low = false): CreatureGeo {
  const parts: THREE.BufferGeometry[] = [];
  const black = col("#231c2a");
  const pouchC = col("#40344a");
  const amp = (z: number) => 0.22 * Math.pow(clamp((0.5 - z) / 1.6, 0, 1), 1.5);
  const kp = 4.5;
  const K: KFn = [K_SWIM, kp];
  // body: a thin whip from the head (z = 0.55) back to the tail (z = -1.65)
  const whip: THREE.Vector3[] = [];
  for (let k = 0; k <= 8; k++) whip.push(V(0, 0, 0.55 - (k / 8) * 2.2));
  parts.push(mk(tube(whip, (t) => 0.075 * Math.pow(1 - t, 1.2) + 0.006, low ? 5 : 6, low ? 16 : 24), black, (p) => [0, amp(p.z), 0], K));
  // the huge mouth: a thin upper jaw and a great pouch
  parts.push(mk(ball(0, 0.02, 0.85, 0.09, 0.035, 0.35, 8, 5), black, [0, 0, 0], K, true));
  parts.push(mk(ball(0, -0.13, 0.78, 0.17, 0.17, 0.33, 12, 8), (p) => lerpC(pouchC, col("#150f18"), ss(-0.05, -0.28, p.y)), [0, 0, 0], K));
  parts.push(mk(ball(0, -0.05, 1.08, 0.08, 0.06, 0.03, 8, 4), col("#0a0608"), [0, 0, 0], K));
  parts.push(...eyePair(0.05, 0.05, 1.08, 0.022, col("#bfe8ff"), K, 1.0, 0.5));
  const tip = col("#ff5fb4");
  parts.push(mk(ball(0, 0, -1.66, 0.03, 0.03, 0.06, 6, 4), tip, [0, amp(-1.66), 4], K));
  return { geo: merge(parts), lights: [{ x: 0, y: 0, z: -1.66, color: tip, size: 0.7 }], wave: { amp, kp } };
}

/** OARFISH: a long silver ribbon (~9 m) with a red crest along its back; swims upright */
export function oarfishGeometry(low = false): CreatureGeo {
  const parts: THREE.BufferGeometry[] = [];
  const L = 9;
  const silver = col("#d8e1ea");
  const streak = col("#7f95b0");
  const red = col("#ff4a4e");
  const prof = (t: number): [number, number] => {
    const f = Math.pow(clamp(t * 1.1, 0, 1), 0.35) * (t > 0.97 ? 1 - (t - 0.97) * 12 : 1);
    return [0.07 * f, 0.3 * f];
  };
  const amp = (z: number) => 0.28 * clamp((3.5 - z) / 8, 0, 1);
  const kp = (2.2 * Math.PI * 2) / L;
  const K: KFn = [K_SWIM, kp];
  parts.push(
    mk(
      body(L, prof, low ? 30 : 48, low ? 6 : 8),
      (p) => {
        if (Math.abs(p.y) < 0.04 && Math.sin(p.z * 5) > 0) return streak;
        if (noise3(p.x * 8, p.y * 8, p.z * 3, 2) > 0.72) return col("#51607a");
        return silver;
      },
      (p) => [0, amp(p.z), 0.18],
      K,
    ),
  );
  // the red crest all along its back, taller at the head
  const pts: [number, number][] = [];
  const n = low ? 14 : 24;
  for (let k = 0; k <= n; k++) {
    const z = 4.25 - (k / n) * 8.6;
    const t = z / L + 0.5;
    pts.push([z, prof(t)[1] * 0.9]);
  }
  for (let k = n; k >= 0; k--) {
    const z = 4.25 - (k / n) * 8.6;
    const t = z / L + 0.5;
    pts.push([z - 0.05, prof(t)[1] * 0.9 + 0.12 + (k < 2 ? 0.2 : 0)]);
  }
  parts.push(mk(fin(pts, 0.015, "yz"), red, (p) => [0, amp(p.z), 0.35], K, true));
  // the head plume and the long "oar" fins
  for (let k = 0; k < 5; k++) {
    const g = tube([V(0, 0.3, 4.25 - k * 0.1), V(0, 0.75 + k * 0.08, 4.05 - k * 0.2), V(0, 1.0 + k * 0.1, 3.6 - k * 0.3)], (t) => 0.022 * (1 - t) + 0.006, 3, 6);
    parts.push(mk(g, red, (p) => [0, amp(p.z) + 0.05, 0.4], K));
  }
  for (const sx of [1, -1]) {
    const g = tube([V(sx * 0.03, -0.25, 3.9), V(sx * 0.1, -0.8, 3.5), V(sx * 0.12, -1.3, 2.9)], (t) => 0.018 * (1 - t) + 0.008, 3, 6);
    parts.push(mk(g, red, (p) => [0, amp(p.z) + 0.06, 0.4], K));
  }
  parts.push(...eyePair(0.06, 0.07, 4.2, 0.07, col("#27303c"), K, 0.8, 0.4));
  return { geo: merge(parts), lights: [], wave: { amp, kp } };
}

/** COELACANTH: steel blue with pale blotches, fleshy lobed fins that move like legs, a three-lobed tail */
export function coelacanthGeometry(low = false): CreatureGeo {
  const parts: THREE.BufferGeometry[] = [];
  const L = 1.9;
  const blue = col("#3a5f92");
  const blot = col("#c8d8e8");
  const prof = (t: number): [number, number] => {
    const f = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 1.05))), 0.6);
    return [0.12 * L * f * 0.8, 0.13 * L * f];
  };
  const rAt = (z: number) => prof(z / L + 0.5);
  const amp = swimAmp(L, 0.12);
  const kp = 3.2;
  const K: KFn = [K_SWIM, kp];
  const skin = (p: THREE.Vector3) => (noise3(p.x * 9, p.y * 9, p.z * 9, 17) > 0.68 ? blot : lerpC(blue, col("#2c4a78"), ss(0, 0.2, p.y)));
  parts.push(mk(body(L, prof, low ? 12 : 18, low ? 8 : 12), skin, (p) => [0, amp(p.z), 0], K));
  // lobed fins: a fleshy lobe with a fan at the end (pectorals, pelvics)
  for (const [fz, fy] of [[0.18, -0.35], [-0.12, -0.7]] as [number, number][])
    for (const sx of [1, -1]) {
      const [rx, ry] = rAt(fz * L);
      const lobe = tube([V(sx * rx * 0.8, fy * ry, fz * L), V(sx * (rx + 0.08), fy * ry - 0.03, fz * L - 0.07), V(sx * (rx + 0.14), fy * ry - 0.05, fz * L - 0.14)], (t) => 0.045 - t * 0.02, 5, 5);
      parts.push(mk(lobe, blue, (p) => [0, 0.03 + amp(p.z), 0], [K_FLAP, 4]));
      const fan = fin([[0, 0.02], [0.1, -0.02], [0.08, -0.1], [0, -0.03]], 0.01, "xz");
      if (sx < 0) {
        fan.scale(-1, 1, 1);
        flipWinding(fan);
      }
      fan.translate(sx * (rx + 0.13), fy * ry - 0.05, fz * L - 0.13);
      parts.push(mk(fan, col("#5a7cae"), (p) => [0, 0.05, 0], [K_FLAP, 4], true));
    }
  // dorsal fan, second dorsal + anal lobes, the three-lobed tail
  const top = rAt(0.05 * L)[1];
  parts.push(mk(fin([[0.1 * L, top * 0.9], [0.02 * L, top + 0.16], [-0.04 * L, top + 0.12], [-0.02 * L, top * 0.9]], 0.01, "yz"), blue, (p) => [0, amp(p.z), 0], K, true));
  for (const sy of [1, -1]) {
    const z2 = -0.26 * L;
    const r2 = rAt(z2)[1];
    parts.push(mk(fin([[z2 + 0.05, sy * r2 * 0.8], [z2 - 0.05, sy * (r2 + 0.12)], [z2 - 0.1, sy * (r2 + 0.08)], [z2 - 0.06, sy * r2 * 0.8]], 0.012, "yz"), blue, (p) => [0, amp(p.z), 0], K, true));
  }
  parts.push(
    mk(
      fin(
        [
          [-0.42 * L, 0.05],
          [-0.52 * L, 0.24],
          [-0.6 * L, 0.06],
          [-0.7 * L, 0.035],
          [-0.7 * L, -0.035],
          [-0.6 * L, -0.06],
          [-0.52 * L, -0.24],
          [-0.42 * L, -0.05],
        ],
        0.014,
        "yz",
      ),
      blue,
      (p) => [0, amp(p.z), 0],
      K,
      true,
    ),
  );
  const [erx, ery] = rAt(0.36 * L);
  parts.push(...eyePair(erx * 0.8, ery * 0.35, 0.36 * L, 0.05, col("#b6ffd0"), K, 1.1));
  return { geo: merge(parts), lights: [], wave: { amp, kp } };
}

/** BARRELEYE (opaque part): a small dark fish with big fins and green tube eyes looking up
 *  through its see-through head (the head's glass dome is barreleyeDomeGeometry) */
export function barreleyeGeometry(low = false): CreatureGeo {
  const parts: THREE.BufferGeometry[] = [];
  const L = 0.6;
  const dark = col("#3a3944");
  const prof = (t: number): [number, number] => {
    const f = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.9))), 0.6);
    return [0.06 * f, 0.085 * f];
  };
  const amp = swimAmp(L, 0.04);
  const K: KFn = [K_SWIM, 8];
  parts.push(mk(body(L, prof, low ? 8 : 12, low ? 6 : 8), (p) => lerpC(dark, col("#5a5866"), ss(0, -0.06, p.y)), (p) => [0, amp(p.z), 0], K));
  for (const sx of [1, -1]) {
    const g = fin([[0, 0.03], [0.22, -0.04], [0.2, -0.12], [0, -0.04]], 0.008, "xz");
    if (sx < 0) {
      g.scale(-1, 1, 1);
      flipWinding(g);
    }
    g.translate(sx * 0.05, -0.02, 0.08);
    parts.push(mk(g, col("#7a7a8c"), [0, 0.02, 0.05], [K_FLAP, 8], true));
    // the green tube eyes, pointing up
    const e = tube([V(sx * 0.025, 0.04, 0.17), V(sx * 0.028, 0.09, 0.17), V(sx * 0.03, 0.13, 0.16)], () => 0.022, 6, 4);
    parts.push(mk(e, col("#62ff8e"), [0, 0, 1.4], K));
  }
  parts.push(mk(fin([[-0.26, 0.02], [-0.36, 0.08], [-0.37, -0.08], [-0.26, -0.02]], 0.008, "yz"), dark, (p) => [0, amp(p.z), 0], K, true));
  parts.push(mk(ball(0, -0.01, 0.29, 0.02, 0.015, 0.02, 5, 3), col("#0d0a10"), [0, 0, 0], K));
  const tip = col("#62ff8e");
  return { geo: merge(parts), lights: [{ x: 0, y: 0.12, z: 0.17, color: tip, size: 0.1 }] };
}
export function barreleyeDomeGeometry(): THREE.BufferGeometry {
  const g = ball(0, 0.07, 0.15, 0.075, 0.09, 0.14, 12, 8);
  return mk(g, col("#9fe8ff"), [0, 0, 0.3], [K_SWIM, 8]);
}

/** COMB JELLY (glass): a see-through lemon with 8 rows of rainbow-shimmering combs */
export function combJellyGeometry(low = false): THREE.BufferGeometry {
  const g = body(0.5, (t) => {
    const r = 0.17 * Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.75);
    return [r, r];
  }, low ? 8 : 12, low ? 12 : 16);
  g.rotateX(-Math.PI / 2);
  return mk(g, col("#b8ecff"), (p) => [0, 0.05, 2.0], [K_PULSE, 0]);
}

/** SIPHONOPHORE (glass): a float, a stack of swimming bells, and a long glowing chain behind (-z) */
export function siphonophoreGeometry(low = false): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const amp = (z: number) => 0.9 * clamp(-z / 12, 0, 1);
  const K: KFn = [K_TRAIL, 0.45];
  parts.push(mk(ball(0, 0, 0.05, 0.09, 0.09, 0.14, 8, 6), col("#ffd6a8"), [0, 0, 1.6], K));
  const nb = low ? 6 : 10;
  for (let k = 0; k < nb; k++) {
    const z = -0.15 - k * 0.13;
    const sx = k % 2 === 0 ? 1 : -1;
    parts.push(mk(ball(sx * 0.06, 0, z, 0.09, 0.08, 0.09, 8, 5), col("#bfe0ff"), (p) => [0, amp(p.z), 0.7], K));
  }
  const stem: THREE.Vector3[] = [];
  for (let k = 0; k <= 10; k++) stem.push(V(Math.sin(k * 1.3) * 0.05, Math.cos(k * 0.9) * 0.04, -1.4 - k * 1.06));
  parts.push(mk(tube(stem, () => 0.014, 3, low ? 30 : 50), col("#9fc8ff"), (p) => [0, amp(p.z), 0.8], K));
  const beadCols = [col("#8fd8ff"), col("#ff9fe0"), col("#b5a0ff")];
  const nbd = low ? 22 : 40;
  for (let k = 0; k < nbd; k++) {
    const z = -1.6 - (k / nbd) * 10.2;
    const i = Math.floor((-z - 1.4) / 1.06);
    const fr = (-z - 1.4) / 1.06 - i;
    const a = stem[Math.min(10, i)];
    const b = stem[Math.min(10, i + 1)];
    parts.push(mk(ball(a.x + (b.x - a.x) * fr, a.y + (b.y - a.y) * fr - 0.03, z, 0.035, 0.05, 0.035, low ? 4 : 5, low ? 3 : 4), beadCols[k % 3], (p) => [0, amp(p.z), 1.4], K));
  }
  return merge(parts);
}

// ── floor crawlers ──

/** SEA PIG: a plump pink sea cucumber that walks on little tube-feet legs */
export function seaPigGeometry(low = false): CreatureGeo {
  const parts: THREE.BufferGeometry[] = [];
  const pink = col("#f7a7bc");
  parts.push(mk(ball(0, 0.13, 0, 0.14, 0.12, 0.32, low ? 10 : 14, low ? 6 : 9), (p) => lerpC(pink, col("#ffd0dc"), ss(0.15, 0.24, p.y)), [1, 0, 0.3], [K_NONE, 0]));
  for (let k = 0; k < 6; k++) {
    const z = 0.2 - k * 0.08;
    for (const sx of [1, -1]) {
      const lg = cone(0.03, 0.09, 4);
      lg.rotateX(Math.PI);
      lg.translate(sx * 0.09, 0.07, z);
      parts.push(mk(lg, col("#f58aa6"), [1, 0.025, 0.2], [K_LEGS, 0]));
    }
  }
  // the "antennae" (papillae) on its back
  for (const [x, z, h] of [[0.05, 0.18, 0.18], [-0.05, 0.18, 0.18], [0.04, 0.08, 0.12], [-0.04, 0.08, 0.12]] as [number, number, number][]) {
    const g = tube([V(x, 0.22, z), V(x * 1.4, 0.22 + h * 0.6, z + 0.03), V(x * 1.8, 0.22 + h, z + 0.08)], (t) => 0.022 * (1 - t) + 0.008, 4, 4);
    parts.push(mk(g, pink, (p) => [1, 0.015 * clamp((p.y - 0.22) / 0.18, 0, 1), 0.3], [K_LEGS, 0]));
  }
  return { geo: merge(parts), lights: [] };
}

/** GIANT ISOPOD: a pill-bug as big as a cat, in lilac armour plates */
export function isopodGeometry(low = false): CreatureGeo {
  const parts: THREE.BufferGeometry[] = [];
  const lilac = col("#bdb2cc");
  const seam = col("#8a7e9c");
  parts.push(mk(ball(0, 0.1, 0, 0.22, 0.13, 0.38, low ? 10 : 14, low ? 6 : 8), (p) => (Math.sin(p.z * 42 + 0.5) > 0.7 ? seam : lerpC(lilac, col("#e2dbee"), ss(0.12, 0.22, p.y))), [0, 0, 0], [K_NONE, 0], true));
  parts.push(mk(ball(0, 0.07, 0.36, 0.13, 0.07, 0.07, 8, 5), lilac, [0, 0, 0], [K_NONE, 0], true));
  for (const sx of [1, -1]) {
    // big dark compound eyes
    parts.push(mk(ball(sx * 0.1, 0.1, 0.38, 0.045, 0.04, 0.035, 6, 4), col("#1e1a26"), [0, 0, 0], [K_NONE, 0]));
    parts.push(mk(ball(sx * 0.115, 0.125, 0.395, 0.012, 0.012, 0.012, 4, 3), col("#ffffff"), [0, 0, 0.5], [K_NONE, 0]));
    // antennae
    parts.push(mk(tube([V(sx * 0.05, 0.09, 0.42), V(sx * 0.2, 0.12, 0.56), V(sx * 0.32, 0.06, 0.66)], () => 0.01, 3, 5), seam, [0, 0.02, 0], [K_LEGS, 0]));
    for (let k = 0; k < 7; k++) {
      const z = 0.25 - k * 0.075;
      parts.push(mk(tube([V(sx * 0.15, 0.03, z), V(sx * 0.25, 0.0, z + 0.02), V(sx * 0.27, -0.03, z + 0.03)], () => 0.014, 3, 3), seam, [0, 0.02, 0], [K_LEGS, 0]));
    }
    const ur = fin([[0, 0], [0.1, -0.08], [0.06, -0.14], [0, -0.05]], 0.012, "xz");
    if (sx < 0) {
      ur.scale(-1, 1, 1);
      flipWinding(ur);
    }
    ur.translate(sx * 0.06, 0.05, -0.34);
    parts.push(mk(ur, lilac, [0, 0, 0], [K_NONE, 0], true));
  }
  return { geo: merge(parts), lights: [] };
}

/** YETI CRAB: a pale crab with fuzzy, hairy arms it waves over the vents (to farm bacteria) */
export function yetiCrabGeometry(low = false): CreatureGeo {
  const parts: THREE.BufferGeometry[] = [];
  const shell = col("#f1ece0");
  const fuzz = col("#fff6d0");
  parts.push(mk(ball(0, 0.08, 0, 0.1, 0.065, 0.12, 8, 6), shell, [0, 0, 0.1], [K_NONE, 0], true));
  for (const sx of [1, -1]) {
    const arm = tube([V(sx * 0.07, 0.08, 0.08), V(sx * 0.14, 0.14, 0.2), V(sx * 0.12, 0.12, 0.3)], () => 0.022, 4, 5);
    parts.push(mk(arm, shell, (p) => [0, 0.03 * clamp((p.z - 0.08) / 0.2, 0, 1), 0.1], [K_BOB, 0]));
    // hairy mitt
    const mitt = ball(sx * 0.12, 0.12, 0.34, 0.05, 0.05, 0.07, 6, 4);
    parts.push(mk(mitt, fuzz, [0, 0.03, 0.06], [K_BOB, 0], true));
    for (let k = 0; k < (low ? 4 : 8); k++) {
      const h = cone(0.008, 0.06, 3);
      h.rotateZ(sx * (0.6 + k * 0.25));
      h.rotateX(0.3 + k * 0.2);
      h.translate(sx * 0.12, 0.12, 0.3 + k * 0.01);
      parts.push(mk(h, fuzz, [0, 0.03, 0.08], [K_BOB, 0]));
    }
    for (let k = 0; k < 3; k++) {
      const z = 0.04 - k * 0.06;
      parts.push(mk(tube([V(sx * 0.08, 0.06, z), V(sx * 0.17, 0.08, z - 0.02), V(sx * 0.21, -0.01, z - 0.04)], () => 0.011, 3, 3), shell, [0, 0.02, 0], [K_LEGS, 0]));
    }
    parts.push(mk(ball(sx * 0.03, 0.13, 0.12, 0.012, 0.012, 0.012, 4, 3), col("#1a1418"), [0, 0, 0], [K_NONE, 0]));
  }
  return { geo: merge(parts), lights: [] };
}

/** a sway motion helper for sessile life (param = phase offset) */
export const swayK = (ph: number): KFn => [K_SWAY, ph];
