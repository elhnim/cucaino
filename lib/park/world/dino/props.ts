// Dino Isle's things, as chunky faceted storybook models in the fantasy kit's layout (so they share
// its wind sway and night glow), all merged into ONE mesh: the great log park gate with its
// "DINO ISLE" sign, torches, the research hut, the lookout tower, the river hide and the Rex
// lookouts, the tall log fence round the T-rex's valley, rail fences and signposts, nests full of
// speckled eggs, the fossil dig with its half-dug skeleton, the Ice Age camp (mammoth-bone huts, a
// drying rack, a cave-painting rock, a mammoth skull), the ice cave's arch; the understorey —
// cycads, giant ferns and elephant-ear leaves, horsetails, swamp cypresses, ice crystals, rocks —
// plus every deck (jetty, boardwalks, the Rex Bridge across the valley, ramps). The big trees are
// drawn instanced (./trees.ts).
import * as THREE from "three";
import {
  DINO_CAVE,
  DINO_DECKS,
  DINO_FENCE_POSTS,
  DINO_GATE,
  DINO_GATE_SIGN_Y,
  DINO_GLACIER,
  DINO_GORGE,
  DINO_ISLAND,
  DINO_PROPS,
  dinoGroundY,
  dinoLandY,
  dinoRng,
  dinoSeaFloorY,
  dinoSnow,
  type DinoDeck,
  type DinoProp,
} from "../../registry/dinoIsland";
import { ball, box, col, cone, cyl, flat, gem, lump, mergeAll, place, pp, stick, v3, type Fx } from "../village/kit";

const X0 = DINO_ISLAND.x;
const Z0 = DINO_ISLAND.z;
const _c = new THREE.Color();
const PI = Math.PI;

const WOOD = "#9b6a40";
const WOOD_D = "#6e4a2c";
const LOG = "#8a5c36";
const LOG_END = "#d8b07a";
const THATCH = "#d9b060";
const STONE = "#b7a898";
const BONE = "#f4ead2";
const LEAF = ["#3f9a46", "#58b24c", "#2f8a44"];
const LEAF_L = ["#6cc650", "#8ad85a", "#58b84a"];
const SNOWC = "#f6f9ff";
const PINE = ["#2f7a4e", "#3a8a58", "#2a6e48"];

const shade = (hex: string, k: number) => _c.set(hex).multiplyScalar(k).clone();
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** a box turned about x, then y, then z */
function boxR(w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}
const sway = (k: number): ((p: THREE.Vector3) => Fx) => (p) => [0, Math.max(0, p.y) * k, 0];

/** a flat strip leaf/frond from the origin along a curve: `len` long, `w` wide, drooping by `droop` */
function frond(len: number, w: number, droop: number, segs = 4): THREE.BufferGeometry {
  const pos: number[] = [];
  const pt = (u: number) => [0, Math.sin(u * PI * 0.5) * len * 0.35 - u * u * droop, u * len];
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

// ── the park gate and its sign ──

const FONT: Record<string, string[]> = {
  D: ["11110", "10001", "10001", "10001", "11110"],
  I: ["11111", "00100", "00100", "00100", "11111"],
  N: ["10001", "11001", "10101", "10011", "10001"],
  O: ["01110", "10001", "10001", "10001", "01110"],
  S: ["01111", "10000", "01110", "00001", "11110"],
  L: ["10000", "10000", "10000", "10000", "11111"],
  E: ["11111", "10000", "11110", "10000", "11111"],
  " ": ["00000", "00000", "00000", "00000", "00000"],
};

/** chunky pixel letters (runs of blocks) centred at (0, y) in the xy plane at depth z, facing `face` (+1 = +z) */
function letters(text: string, px: number, y: number, z: number, face: number, color: string): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const cw = 6 * px;
  const total = text.length * cw - px;
  for (let i = 0; i < text.length; i++) {
    const glyph = FONT[text[i]] ?? FONT[" "];
    for (let r = 0; r < 5; r++) {
      const row = glyph[r];
      let c0 = -1;
      for (let cI = 0; cI <= 5; cI++) {
        const on = cI < 5 && row[cI] === "1";
        if (on && c0 < 0) c0 = cI;
        if (!on && c0 >= 0) {
          const x0 = -total / 2 + i * cw + c0 * px;
          const w = (cI - c0) * px;
          // (read from behind, the letters run the other way)
          const cx = (x0 + w / 2) * face;
          out.push(pp(box(w, px, px * 0.8, cx, y + (2 - r) * px, z), color, [0, 0, 0.35]));
          c0 = -1;
        }
      }
    }
  }
  return out;
}

function gate(low: boolean): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  const H = DINO_GATE.half + 1.0;
  const seg = low ? 6 : 8;
  for (const s of [-1, 1]) {
    // a tower of bundled logs, a thatched cap and a big torch bowl on top
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * PI * 2 + 0.4;
      const x = s * H + Math.sin(a) * 0.55;
      const z = Math.cos(a) * 0.55;
      P.push(pp(cyl(0.42, 0.48, 8.4, seg, x, -0.3, z), LOG));
      P.push(pp(cyl(0.3, 0.42, 0.5, seg, x, 8.1, z), LOG_END));
    }
    P.push(pp(cyl(1.25, 1.25, 0.35, seg, s * H, 3.2, 0), WOOD_D));
    P.push(pp(cyl(1.25, 1.25, 0.35, seg, s * H, 6.0, 0), WOOD_D));
    P.push(pp(cyl(0.7, 0.45, 0.6, seg, s * H, 8.3, 0), "#5a4a42"));
    // vines draped down the towers
    for (let k = 0; k < 3; k++) P.push(pp(lump(0.55, s * (H + 0.6), 7.4 - k * 1.9, (k - 1) * 0.5, k + (s > 0 ? 3 : 7), 0.7, 1.3, 0.8), LEAF[k % 3], [0, 0.4, 0]));
    // the palisade wall running off into the jungle
    for (let k = 0; k < 7; k++) {
      const x = s * (H + 2.0 + k * 0.8);
      const h = 4.6 - k * 0.22 + ((k * 7) % 3) * 0.2;
      P.push(pp(cyl(0.36, 0.4, h, 6, x, -0.2, 0), k % 2 ? LOG : shade(LOG, 0.9)));
      P.push(pp(cone(0.36, 0.55, 6, x, h - 0.2, 0), LOG_END));
    }
    // a big wooden door, swung wide open (inwards, into the island)
    const hinge = s * (H - 0.9);
    const ang = s * 1.25;
    const dW = DINO_GATE.half - 0.4;
    for (let k = 0; k < 6; k++) {
      const u = (k + 0.5) / 6;
      const g = box(dW / 6 - 0.05, 5.6, 0.22, 0, 2.8, 0);
      P.push(pp(place(g, hinge - s * Math.cos(ang) * u * dW, 0, Math.sin(Math.abs(ang)) * u * dW, ang), k % 2 ? WOOD : shade(WOOD, 0.9)));
    }
    for (const yy of [1.2, 4.4]) {
      const g = box(dW, 0.3, 0.12, 0, yy, 0);
      P.push(pp(place(g, hinge - s * Math.cos(ang) * 0.5 * dW, 0, Math.sin(Math.abs(ang)) * 0.5 * dW, ang), "#4e3624"));
    }
  }
  // the lintel: two great logs across the top, and the sign board hanging from it
  P.push(pp(place(new THREE.CylinderGeometry(0.5, 0.5, H * 2 + 1.6, seg), 0, 7.6, 0, 0, 1, 0, PI / 2), LOG));
  P.push(pp(place(new THREE.CylinderGeometry(0.42, 0.42, H * 2 + 1.0, seg), 0, 8.35, 0, 0, 1, 0, PI / 2), shade(LOG, 0.9)));
  // (sharpened log tips along the top)
  for (let k = -5; k <= 5; k++) P.push(pp(cone(0.3, 0.9, 5, k * 0.9, 8.6, 0), LOG_END));
  const sy = DINO_GATE_SIGN_Y;
  P.push(pp(box(H * 2 - 1.1, 1.6, 0.3, 0, sy, 0), "#5a3a22"));
  P.push(pp(box(H * 2 - 0.7, 0.22, 0.4, 0, sy + 0.86, 0), WOOD));
  P.push(pp(box(H * 2 - 0.7, 0.22, 0.4, 0, sy - 0.86, 0), WOOD));
  for (const s of [-1, 1]) P.push(pp(box(0.12, 1.2, 0.12, s * (H - 1.6), sy + 1.3, 0), "#4e3624"));
  // DINO ISLE, on both faces (readable from outside and in), glowing a little at night
  P.push(...letters("DINO ISLE", 0.15, sy, 0.2, 1, "#ffd84a"));
  P.push(...letters("DINO ISLE", 0.15, sy, -0.2, -1, "#ffd84a"));
  // leafy fronds hanging over the sign's ends
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) P.push(pp(place(frond(2.2, 0.35, 1.4), s * (H - 0.6), 7.9, 0, s * (0.6 + k * 0.5) + (k === 1 ? PI : 0)), LEAF_L[k], sway(0.12)));
  return P;
}

function torch(): THREE.BufferGeometry[] {
  return [
    pp(cyl(0.12, 0.16, 2.3, 6), LOG),
    pp(cyl(0.05, 0.05, 0.3, 4, 0, 1.4, 0), "#4e3624"),
    pp(cyl(0.3, 0.16, 0.35, 7, 0, 2.3, 0), "#5a4a42"),
    pp(cyl(0.22, 0.22, 0.08, 7, 0, 2.6, 0), "#ffb040", [0, 0, 1.2]),
  ];
}

// ── the visitors' side ──

function hut(low: boolean): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  // a raised plank cabin (door on +z), a porch, a green tin roof, an antenna with a little dish
  for (const x of [-2.6, 2.6]) for (const z of [-2.1, 2.1]) P.push(pp(cyl(0.16, 0.18, 0.9, 5, x, -0.3, z), WOOD_D));
  P.push(pp(box(5.6, 0.25, 4.6, 0, 0.7, 0), WOOD));
  P.push(pp(box(5.2, 2.4, 4.2, 0, 2.0, 0), (p, n) => (Math.abs(n.y) > 0.5 ? col(WOOD) : col(Math.floor((p.y + 5) * 2.4) % 2 ? "#e8d4a8" : "#dcc494"))));
  const roof = new THREE.CylinderGeometry(0.01, 3.9, 1.6, 4, 1);
  roof.rotateY(PI / 4);
  roof.scale(1.05, 1, 0.9);
  P.push(pp(place(roof, 0, 3.95, 0), "#5aa860"));
  P.push(pp(box(1.0, 1.8, 0.12, 0, 1.75, 2.12), "#7a4e30"));
  for (const x of [-1.6, 1.6]) P.push(pp(box(0.9, 0.7, 0.1, x, 2.2, 2.12), "#ffe8a0", [0, 0, 0.9]));
  P.push(pp(box(0.9, 0.7, 0.1, 2.62, 2.2, 0), "#ffe8a0", [0, 0, 0.9]).rotateY(0));
  // porch + steps
  P.push(pp(box(5.6, 0.18, 1.6, 0, 0.72, 3.1), WOOD));
  for (let k = 0; k < 3; k++) P.push(pp(box(1.4, 0.16, 0.4, 0, 0.55 - k * 0.2, 4.05 + k * 0.38), WOOD_D));
  for (const x of [-2.6, 2.6]) P.push(pp(cyl(0.08, 0.08, 1.9, 5, x, 0.8, 3.8), WOOD_D));
  P.push(pp(box(5.8, 0.12, 2.0, 0, 2.7, 3.0), "#4a9a58"));
  // a sign board over the door: a friendly dino skull emblem (pale on dark)
  P.push(pp(box(2.2, 0.6, 0.12, 0, 3.0, 2.2), "#5a3a22"));
  P.push(pp(ball(0.18, -0.3, 3.02, 2.28, 0, 1.6, 1, 0.4), BONE));
  P.push(pp(box(0.5, 0.12, 0.05, 0.15, 2.95, 2.3), BONE));
  // the antenna and dish, barrels
  P.push(pp(cyl(0.05, 0.06, 3.0, 4, -2.0, 4.0, -1.2), "#c8c8d0"));
  P.push(pp(place(new THREE.SphereGeometry(0.55, low ? 6 : 8, 3, 0, PI * 2, 0, PI / 2.5), -2.0, 6.7, -1.2, 0.6, 1, -0.7, 0), "#e8e8f0"));
  for (const [x, z] of [
    [3.4, 1.5],
    [3.3, 0.7],
  ])
    P.push(pp(cyl(0.35, 0.35, 0.9, 7, x, 0, z), (p) => (Math.abs(p.y - 0.45) < 0.12 ? col("#3a3a40") : col("#d85a3a"))));
  return P;
}

function kiosk(): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  for (const x of [-1.3, 1.3]) P.push(pp(cyl(0.1, 0.12, 2.6, 5, x, 0, 0), WOOD_D));
  const roof = new THREE.CylinderGeometry(0.2, 2.2, 0.9, 6, 1);
  P.push(pp(place(roof, 0, 3.0, 0), THATCH, [0, 0.05, 0]));
  // the map board: the island in miniature (green blob, blue sea, a red "you are here")
  P.push(pp(box(2.3, 1.4, 0.12, 0, 1.5, 0), "#5a3a22"));
  P.push(pp(box(2.1, 1.2, 0.05, 0, 1.5, 0.08), "#6ac0e0"));
  P.push(pp(ball(0.5, 0, 1.5, 0.12, 0, 1.6, 1.0, 0.1), "#6cc650"));
  P.push(pp(ball(0.14, -0.35, 1.3, 0.16, 0, 1, 1, 0.3), "#8a6a5a"));
  P.push(pp(ball(0.12, -0.25, 1.75, 0.16, 0, 1.2, 0.8, 0.3), SNOWC));
  P.push(pp(gem(0.08, 0.3, 1.65, 0.18), "#ff4a4a", [0, 0, 0.8]));
  return P;
}

/** the round deck a raised prop stands under (the nearest one) */
function deckUnder(p: DinoProp): DinoDeck {
  let best = DINO_DECKS[0];
  let bd = Infinity;
  for (const d of DINO_DECKS) {
    if (d.r === undefined) continue;
    const dd = (d.ax - p.x) ** 2 + (d.az - p.z) ** 2;
    if (dd < bd) {
      bd = dd;
      best = d;
    }
  }
  return best;
}
/** the angle (prop-local) its ramp leaves at */
function rampAngle(d: DinoDeck, p: DinoProp): number {
  if (d.open !== undefined) return d.open - p.rot;
  let best: DinoDeck | null = null;
  let bd = Infinity;
  for (const q of DINO_DECKS) {
    if (q.kind !== "ramp") continue;
    const dd = (q.ax - d.ax) ** 2 + (q.az - d.az) ** 2;
    if (dd < bd) {
      bd = dd;
      best = q;
    }
  }
  return best ? Math.atan2(best.bx - best.ax, best.bz - best.az) - p.rot : 0;
}
/** log legs from the ground up to (and past) a round deck at `up` above the prop's base (prop-local) */
function legs(P: THREE.BufferGeometry[], d: DinoDeck, p: DinoProp, R: number, n: number, over: number, r: number) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * PI * 2 + PI / n;
    const x = Math.sin(a) * R;
    const z = Math.cos(a) * R;
    // (world point of this leg, for the ground under it)
    const wx = p.x + x * Math.cos(p.rot) + z * Math.sin(p.rot);
    const wz = p.z - x * Math.sin(p.rot) + z * Math.cos(p.rot);
    const g = (dinoLandY(wx, wz) ?? d.ya - 3) - p.y;
    P.push(pp(cyl(r, r * 1.25, -g + over, 6, x, g - 0.3, z), LOG));
    const b = ((k + 1) / n) * PI * 2 + PI / n;
    if (-g > 1.5) P.push(pp(stick(v3(x, g + 0.4, z), v3(Math.sin(b) * R, -0.4, Math.cos(b) * R), r * 0.6), WOOD_D));
  }
}
function rail(P: THREE.BufferGeometry[], R: number, ra: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - ra), Math.cos(a - ra))) < 0.45) continue;
    const x = Math.sin(a) * (R + 0.25);
    const z = Math.cos(a) * (R + 0.25);
    P.push(pp(box(0.11, 1.05, 0.11, x, 0.52, z), WOOD_D));
    const b = ((i + 1) / n) * PI * 2;
    if (Math.abs(Math.atan2(Math.sin(b - ra), Math.cos(b - ra))) < 0.45) continue;
    P.push(pp(stick(v3(x, 1.05, z), v3(Math.sin(b) * (R + 0.25), 1.05, Math.cos(b) * (R + 0.25)), 0.1), WOOD));
  }
}

function tower(p: DinoProp, low: boolean): THREE.BufferGeometry[] {
  // the plains lookout: four big log legs from the ground up past the deck, braces, a rail, a thatched roof
  // (the prop's base is the deck itself)
  const d = deckUnder(p);
  const P: THREE.BufferGeometry[] = [];
  const R = (d.r ?? 3) - 0.35;
  const ra = rampAngle(d, p);
  legs(P, d, p, R, 4, 2.9, 0.26);
  const roof = new THREE.ConeGeometry(R + 1.5, 2.2, low ? 6 : 8);
  roof.translate(0, 3.5, 0);
  P.push(pp(roof, THATCH, [0, 0.04, 0]));
  P.push(pp(cone(0.12, 1.2, 4, 0, 4.5, 0), WOOD_D));
  P.push(pp(place(flat([[0, 0], [0.9, -0.25], [0, -0.5]]), 0.03, 5.6, 0), "#ff6b4a", [0, 0.9, 0]));
  rail(P, R, ra, 16);
  // a telescope on a post
  P.push(pp(cyl(0.05, 0.06, 1.1, 4, 0, 0, 0), "#3a3a40"));
  P.push(pp(place(new THREE.CylinderGeometry(0.09, 0.12, 0.7, 6), 0, 1.2, 0.15, 0, 1, -1.2, 0), "#c89a40"));
  return P;
}

function platform(p: DinoProp): THREE.BufferGeometry[] {
  // a Rex lookout on the valley's rim: log legs, a rail, a yellow-and-black "!" warning board facing the valley
  const d = deckUnder(p);
  const P: THREE.BufferGeometry[] = [];
  const R = (d.r ?? 3) - 0.3;
  const ra = rampAngle(d, p);
  legs(P, d, p, R, 6, 0.05, 0.2);
  rail(P, R, ra, 18);
  P.push(pp(box(0.1, 1.6, 0.1, 0, 0, R + 0.2), WOOD_D));
  P.push(pp(box(1.3, 0.9, 0.08, 0, 1.9, R + 0.26), (q) => (Math.floor((q.x + q.y) * 3) % 2 ? col("#ffd84a") : col("#2a2a2e"))));
  P.push(pp(box(0.9, 0.55, 0.06, 0, 1.9, R + 0.32), "#ffd84a"));
  P.push(pp(box(0.1, 0.3, 0.05, 0, 1.97, R + 0.36), "#2a2a2e"));
  P.push(pp(box(0.1, 0.08, 0.05, 0, 1.72, R + 0.36), "#2a2a2e"));
  // a coin telescope
  P.push(pp(cyl(0.06, 0.07, 1.1, 5, 0, 0, R - 0.8), "#3a3a40"));
  P.push(pp(place(new THREE.CylinderGeometry(0.1, 0.13, 0.75, 6), 0, 1.2, R - 0.6, 0, 1, -1.3, 0), "#5aa0e0"));
  return P;
}

function hideHut(p: DinoProp, low: boolean): THREE.BufferGeometry[] {
  // the river hide: a low deck with a thatched, slatted shelter — a long viewing slot facing the ford
  const d = deckUnder(p);
  const P: THREE.BufferGeometry[] = [];
  const R = (d.r ?? 3) - 0.3;
  const ra = rampAngle(d, p);
  legs(P, d, p, R, 6, 0.05, 0.2);
  // (walls round three-quarters of it, open at the ramp; a slot at eye height facing +z, the ford)
  const n = low ? 10 : 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - ra), Math.cos(a - ra))) < 0.6) continue;
    const x = Math.sin(a) * (R + 0.15);
    const z = Math.cos(a) * (R + 0.15);
    const front = Math.cos(a) > 0.55;
    const w = ((PI * 2 * (R + 0.15)) / n) * 1.05;
    const g = box(w, front ? 1.0 : 2.4, 0.14, 0, front ? 0.5 : 1.2, 0);
    P.push(pp(place(g, x, 0, z, a), i % 2 ? WOOD : shade(WOOD, 0.88)));
    if (front) P.push(pp(place(box(w, 0.5, 0.14, 0, 2.15, 0), x, 0, z, a), WOOD));
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * PI * 2 + PI / 4;
    P.push(pp(cyl(0.12, 0.14, 2.7, 5, Math.sin(a) * R, 0, Math.cos(a) * R), LOG));
  }
  const roof = new THREE.ConeGeometry(R + 1.1, 1.5, low ? 6 : 8);
  roof.translate(0, 3.2, 0);
  P.push(pp(roof, THATCH, [0, 0.04, 0]));
  // leafy camouflage on the roof
  for (let k = 0; k < 5; k++) P.push(pp(lump(0.7, Math.sin(k * 1.3) * R * 0.8, 3.0, Math.cos(k * 1.3) * R * 0.8, k + 11, 1.2, 0.5, 1.2), LEAF[k % 3], [0, 0.2, 0]));
  return P;
}

function rimFence(low: boolean): THREE.BufferGeometry[] {
  // (built in island-local coordinates: returned as-is) — tall sharpened logs round the T-rex's valley
  const P: THREE.BufferGeometry[] = [];
  const posts = DINO_FENCE_POSTS;
  const n = posts.length;
  const ys = posts.map((q) => dinoLandY(q.x, q.z) ?? 12);
  for (let i = 0; i < n; i++) {
    const q = posts[i];
    const x = q.x - X0;
    const z = q.z - Z0;
    const y = ys[i];
    const h = 4.6 + ((i * 5) % 3) * 0.2;
    P.push(pp(cyl(0.3, 0.34, h, 4, x, y - 0.3, z, true), i % 2 ? LOG : shade(LOG, 0.9)));
    P.push(pp(cone(0.3, 0.5, 4, x, y + h - 0.3, z), LOG_END));
    const b = posts[(i + 1) % n];
    // (rails only between neighbours: not across the Rex Bridge's gap)
    if (Math.hypot(b.x - q.x, b.z - q.z) > 2.5) continue;
    const yb = ys[(i + 1) % n];
    if (i % 2 === 0) for (const hh of [1.3, 3.1]) P.push(pp(stick(v3(x, y + hh, z), v3((posts[(i + 2) % n].x - X0), ys[(i + 2) % n] + hh, posts[(i + 2) % n].z - Z0), 0.16, 0.12), WOOD));
    void yb;
  }
  // yellow-and-black warning boards every so often (facing out)
  for (let i = 3; i < n; i += 11) {
    const q = posts[i];
    const a = Math.atan2(q.x - DINO_GORGE.x, q.z - DINO_GORGE.z);
    const g = box(1.1, 0.5, 0.06, 0, 0, 0);
    const out = place(g, q.x - X0 + Math.sin(a) * 0.35, ys[i] + 2.8, q.z - Z0 + Math.cos(a) * 0.35, a);
    P.push(pp(out, (pt) => (Math.floor((pt.x + pt.y + pt.z) * 3.5) % 2 ? col("#ffd84a") : col("#2a2a2e"))));
  }
  // down on the valley floor: a giant bone chew-toy (the T-rex's favourite) and some hay
  const cx = DINO_GORGE.x - X0;
  const cz = DINO_GORGE.z - Z0;
  const by = dinoLandY(DINO_GORGE.x - 6, DINO_GORGE.z + 14) ?? 3.3;
  P.push(pp(place(new THREE.CylinderGeometry(0.34, 0.34, 3.6, 6), cx - 6, by + 0.4, cz + 14, 0.6, 1, 0, PI / 2), BONE));
  for (const s of [-1, 1]) for (const k of [-1, 1]) P.push(pp(ball(0.48, cx - 6 + Math.cos(0.6) * s * 1.8 + Math.sin(0.6) * k * 0.3, by + 0.45, cz + 14 - Math.sin(0.6) * s * 1.8 + Math.cos(0.6) * k * 0.3), BONE));
  for (const [dx, dz] of [
    [8, -18],
    [-9, -30],
  ]) {
    const hy = dinoLandY(DINO_GORGE.x + dx, DINO_GORGE.z + dz) ?? 3.3;
    P.push(pp(lump(1.4, cx + dx, hy + 0.4, cz + dz, dx * 3, 1.3, 0.5, 1.1), "#e8c860"));
  }
  return P;
}

function railFence(p: DinoProp): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  const len = p.len ?? 5;
  const n = Math.max(1, Math.round(len / 2));
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n - 0.5;
    const wx = p.x + Math.sin(p.rot) * u * len;
    const wz = p.z + Math.cos(p.rot) * u * len;
    ys.push((dinoLandY(wx, wz) ?? p.y) - p.y);
  }
  for (let i = 0; i <= n; i++) {
    const z = (i / n - 0.5) * len;
    P.push(pp(cyl(0.1, 0.12, 1.25, 5, 0, ys[i] - 0.1, z), LOG));
    if (i < n) for (const h of [0.5, 1.0]) P.push(pp(stick(v3(0, ys[i] + h, z), v3(0, ys[i + 1] + h, z + len / n), 0.1, 0.08), WOOD));
  }
  return P;
}

function signpost(v: number): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [pp(cyl(0.08, 0.1, 2.4, 5), WOOD_D)];
  const cols = ["#ff8a4a", "#4fc3a1", "#6a8cff", "#ffcf4a"];
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + v;
    const g = flat([
      [0, 0.16],
      [0.85, 0.16],
      [1.05, 0],
      [0.85, -0.16],
      [0, -0.16],
    ]);
    g.translate(0.05, 0, 0);
    P.push(pp(place(g, 0, 1.6 + k * 0.33, 0, a), cols[(k + v) % 4]));
  }
  return P;
}

function bench(): THREE.BufferGeometry[] {
  return [pp(box(1.8, 0.12, 0.5, 0, 0.5, 0), WOOD), pp(box(1.8, 0.4, 0.1, 0, 0.8, -0.22), WOOD), pp(box(0.12, 0.5, 0.45, -0.75, 0.25, 0), WOOD_D), pp(box(0.12, 0.5, 0.45, 0.75, 0.25, 0), WOOD_D)];
}

function crates(v: number): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  const cc = v ? "#c89a5a" : "#b8844e";
  P.push(pp(box(1.0, 0.9, 1.0, 0, 0.45, 0), cc));
  P.push(pp(box(0.8, 0.7, 0.8, 0.95, 0.35, 0.2, 0.3), shade(cc, 0.9)));
  P.push(pp(box(0.7, 0.6, 0.7, 0.2, 1.2, 0.1, 0.5), shade(cc, 1.05)));
  if (v) P.push(pp(cyl(0.3, 0.3, 0.7, 7, -0.9, 0, 0.3), "#6a8a5a"));
  return P;
}

// ── the nests and the dig ──

function nest(v: number, seed: number, low: boolean): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  const rnd = dinoRng(seed + 11);
  // a ring mound of earth and twigs
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * PI * 2;
    P.push(pp(lump(0.55, Math.sin(a) * 1.05, 0.15, Math.cos(a) * 1.05, seed + k, 1.1, 0.55, 0.9), k % 2 ? "#a07a4a" : "#8a6a40"));
  }
  P.push(pp(cyl(1.0, 1.1, 0.12, 9, 0, 0, 0), "#d8b870"));
  for (let k = 0; k < 6; k++) {
    const a = rnd() * PI * 2;
    P.push(pp(stick(v3(Math.sin(a) * 1.3, 0.35, Math.cos(a) * 1.3), v3(Math.sin(a + 0.8) * 0.9, 0.5, Math.cos(a + 0.8) * 0.9), 0.05), "#7a5a36"));
  }
  // speckled eggs (one of them cracked open: a baby's hatched!)
  const eggCol = ["#f4f0e0", "#dff0e8", "#f0e0f4"][v % 3];
  const n = 5;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * PI * 2 + v;
    const r = k === 0 ? 0 : 0.55;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (k === 1) {
      // the hatched egg: two jagged shell halves
      P.push(pp(place(new THREE.SphereGeometry(0.3, 7, 3, 0, PI * 2, PI / 2, PI / 2), x, 0.42, z, 0, new THREE.Vector3(1, 1.35, 1), PI, 0), eggCol));
      P.push(pp(place(new THREE.SphereGeometry(0.3, 7, 2, 0, PI * 2, 0, PI / 3), x + 0.45, 0.2, z, 0.5, new THREE.Vector3(1, 1.3, 1), 2.3, 0), eggCol));
      continue;
    }
    P.push(pp(ball(0.3, x, 0.45, z, low ? 0 : 1, 1, 1.35, 1), (p) => (Math.sin(p.x * 23 + seed) * Math.sin(p.y * 19) * Math.sin(p.z * 21) > 0.5 ? col("#b8a080") : col(eggCol))));
  }
  return P;
}

function digSite(p: DinoProp): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  const y0 = (dinoLandY(p.x, p.z) ?? p.y) - p.y;
  const R = 4.2;
  // string grid on pegs round the pit
  for (let k = -2; k <= 2; k++) {
    const u = (k / 2) * R * 0.95;
    for (const [ax, az, bx, bz] of [
      [u, -R, u, R],
      [-R, u, R, u],
    ] as [number, number, number, number][]) {
      P.push(pp(stick(v3(ax, 0.35, az), v3(bx, 0.35, bz), 0.025), "#fff0d0"));
      P.push(pp(cyl(0.05, 0.05, 0.45, 4, ax, 0, az), WOOD_D));
      P.push(pp(cyl(0.05, 0.05, 0.45, 4, bx, 0, bz), WOOD_D));
    }
  }
  // a half-dug skeleton in the pit floor: a curving spine, ribs, a big skull, a tail
  const fy = y0 + 0.1;
  const spine: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    spine.push([-3 + u * 5.5, Math.sin(u * 3) * 0.8]);
  }
  spine.forEach(([x, z], i) => P.push(pp(gem(0.16, x, fy, z, 1.3, 0.8, 1), BONE)));
  for (let i = 4; i <= 8; i++) {
    const [x, z] = spine[i];
    for (const s of [-1, 1]) P.push(pp(stick(v3(x, fy, z), v3(x + 0.2, fy + 0.05, z + s * (0.9 - Math.abs(i - 6) * 0.1)), 0.08), BONE));
  }
  const [sx, sz] = spine[12];
  P.push(pp(boxR(0.8, 0.35, 0.55, sx + 0.4, fy + 0.1, sz, 0, 0.3), BONE));
  P.push(pp(boxR(0.5, 0.14, 0.4, sx + 0.9, fy, sz - 0.05, 0, 0.3), BONE));
  P.push(pp(gem(0.1, sx + 0.35, fy + 0.25, sz + 0.2), "#5a4a42"));
  // brushes, a bucket, a spade, a sieve frame, a wheelbarrow at the rim
  P.push(pp(cyl(0.22, 0.18, 0.4, 7, -2.0, fy - 0.1, -2.2), "#4a8ac8"));
  P.push(pp(stick(v3(1.5, fy, -2.3), v3(2.2, fy + 1.0, -2.5), 0.06), WOOD));
  P.push(pp(box(0.3, 0.05, 0.4, 1.45, fy + 0.02, -2.25), "#a0a0a8"));
  P.push(pp(box(1.2, 0.1, 0.9, -R - 0.9, 0.7, 1.0), WOOD));
  P.push(pp(box(1.1, 0.02, 0.8, -R - 0.9, 0.72, 1.0), "#c8c8c8"));
  for (const x of [-R - 1.4, -R - 0.4]) P.push(pp(cyl(0.05, 0.05, 0.7, 4, x, 0, 1.0), WOOD_D));
  P.push(pp(boxR(0.9, 0.4, 1.3, R + 1.2, 0.55, -1.0, 0, 0.3), "#d85a3a"));
  P.push(pp(place(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 8), R + 1.2, 0.3, -0.2, 0.3, 1, 0, PI / 2), "#2a2a2e"));
  return P;
}

function tent(): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  const g = new THREE.CylinderGeometry(0.01, 1.9, 2.3, 4, 1);
  g.rotateY(PI / 4);
  g.scale(1, 1, 1.3);
  P.push(pp(place(g, 0, 1.15, 0), (p, n) => (n.z > 0.3 && Math.abs(p.x) < 0.45 ? col("#5a4030") : col("#e8b060"))));
  P.push(pp(cyl(0.05, 0.05, 2.6, 4, 0, 0, 1.9), WOOD_D));
  P.push(pp(stick(v3(0, 2.3, 0), v3(0, 2.4, 2.2), 0.04), WOOD_D));
  return P;
}

function ribcage(): THREE.BufferGeometry[] {
  // a giant dinosaur's ribs arching out of the ground: great for walking round
  const P: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const z = -2.2 + i * 0.85;
    const h = 2.8 + Math.sin((i / 5) * PI) * 1.2;
    for (const s of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 4; k++) {
        const u = k / 4;
        pts.push(v3(s * (0.3 + Math.sin(u * PI * 0.9) * 1.6), u * h, z));
      }
      for (let k = 0; k < 4; k++) P.push(pp(stick(pts[k], pts[k + 1], 0.22 - k * 0.03), BONE));
    }
  }
  for (let i = 0; i < 8; i++) P.push(pp(gem(0.28, 0, 3.6 + Math.sin((i / 7) * PI) * 0.9 - 0.4, -2.8 + i * 0.8, 1.2, 0.8, 1), BONE));
  // the skull, resting nearby
  P.push(pp(boxR(1.1, 0.9, 1.9, 1.8, 0.4, 3.4, 0.1, 0.5), BONE));
  P.push(pp(boxR(0.9, 0.3, 1.5, 1.9, -0.05, 3.5, 0.2, 0.5), shade(BONE, 0.92)));
  for (const s of [-1, 1]) P.push(pp(gem(0.18, 1.8 + s * 0.4, 0.6, 3.1), "#5a4a42"));
  return P;
}

// ── the Ice Age camp ──

function bonehut(low: boolean): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  // a dome of hides over a frame of mammoth bones; tusks arch over the door
  const dome = new THREE.SphereGeometry(2.4, low ? 8 : 10, 5, 0, PI * 2, 0, PI / 2);
  dome.scale(1, 0.85, 1);
  P.push(pp(dome, (p) => (Math.floor(Math.atan2(p.x, p.z) * 2.5 + p.y * 1.5) % 2 ? col("#9a6a44") : col("#8a5a3a"))));
  P.push(pp(cyl(0.35, 0.5, 0.5, 6, 0, 1.9, 0), "#6a4a34"));
  P.push(pp(box(0.9, 1.3, 0.3, 0, 0.65, 2.25), "#3a2a22"));
  // jawbones stacked round the base, bones up the sides
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.5) continue;
    P.push(pp(lump(0.32, Math.sin(a) * 2.45, 0.22, Math.cos(a) * 2.45, k, 1.3, 0.7, 0.9), BONE));
    if (k % 2) P.push(pp(stick(v3(Math.sin(a) * 2.45, 0.3, Math.cos(a) * 2.45), v3(Math.sin(a) * 1.4, 1.9, Math.cos(a) * 1.4), 0.12), BONE));
  }
  for (const s of [-1, 1]) {
    const pts = [v3(s * 0.75, 0, 2.55), v3(s * 0.95, 1.2, 2.75), v3(s * 0.6, 2.2, 2.7), v3(s * 0.05, 2.5, 2.55)];
    for (let k = 0; k < 3; k++) P.push(pp(stick(pts[k], pts[k + 1], 0.16 - k * 0.03), BONE));
  }
  // snow on the top
  const cap = new THREE.SphereGeometry(1.5, low ? 7 : 9, 3, 0, PI * 2, 0, PI / 3);
  cap.scale(1, 0.6, 1);
  P.push(pp(place(cap, 0, 1.2, 0), SNOWC));
  return P;
}

function campfire(): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2;
    P.push(pp(lump(0.25, Math.sin(a) * 0.8, 0.12, Math.cos(a) * 0.8, k, 1, 0.7, 1), STONE));
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * PI + 0.3;
    P.push(pp(stick(v3(Math.sin(a) * 0.55, 0.08, Math.cos(a) * 0.55), v3(-Math.sin(a) * 0.55, 0.12, -Math.cos(a) * 0.55), 0.14), "#5a3a26"));
  }
  P.push(pp(cyl(0.4, 0.45, 0.06, 7), "#ff8a3a", [0, 0, 1.4]));
  return P;
}

function rack(): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  for (const x of [-1.3, 1.3]) {
    P.push(pp(stick(v3(x, 0, -0.6), v3(x, 2.1, 0), 0.08), WOOD_D));
    P.push(pp(stick(v3(x, 0, 0.6), v3(x, 2.1, 0), 0.08), WOOD_D));
  }
  P.push(pp(stick(v3(-1.5, 2.0, 0), v3(1.5, 2.0, 0), 0.08), WOOD_D));
  for (const [x, c] of [
    [-0.7, "#9a6a44"],
    [0.6, "#c89a6a"],
  ] as [number, string][]) {
    const g = flat([
      [-0.5, 0],
      [0.5, 0],
      [0.6, -0.6],
      [0.3, -1.3],
      [-0.4, -1.2],
      [-0.6, -0.5],
    ]);
    P.push(pp(place(g, x, 2.0, 0.02), c, [0, 0.35, 0]));
  }
  return P;
}

function paintrock(seed: number): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  // a big grey rock with a flat face (+z), and the Ice Age paintings on it: mammoths, a rhino, a deer, hands
  const rock = lump(3.4, 0, 2.0, -0.6, seed, 1.3, 0.95, 0.7, 0.16, 1);
  const pos = rock.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > 0.6) pos.setZ(i, 0.6 + (pos.getZ(i) - 0.6) * 0.15);
  P.push(pp(rock, (p, n) => (n.y > 0.6 ? col(SNOWC) : col(n.z > 0.7 ? "#c8b8a4" : "#a89888"))));
  const face = (pts: [number, number][], x: number, y: number, s: number, c: string, flip = 1) => {
    const g = flat(pts.map(([a, b]) => [a * s * 1.45 * flip, b * s * 1.45] as [number, number]), false);
    g.translate(x * 1.1, y - 0.3, 0.74);
    P.push(pp(g, c, [0, 0, 0.15]));
  };
  const MAMMOTH: [number, number][] = [
    [-1, -0.1],
    [-0.9, 0.35],
    [-0.4, 0.62],
    [0.2, 0.7],
    [0.65, 0.5],
    [0.95, 0.15],
    [1.05, -0.35],
    [0.9, -0.6],
    [0.75, -0.2],
    [0.55, -0.2],
    [0.5, -0.6],
    [0.3, -0.6],
    [0.3, -0.2],
    [-0.45, -0.2],
    [-0.5, -0.6],
    [-0.7, -0.6],
    [-0.75, -0.2],
  ];
  face(MAMMOTH, -1.4, 3.1, 0.75, "#b8402a");
  face(MAMMOTH, 1.2, 2.3, 0.55, "#b8402a", -1);
  const RHINO: [number, number][] = [
    [-0.9, 0],
    [-0.6, 0.35],
    [0.3, 0.4],
    [0.7, 0.2],
    [1.1, 0.45],
    [0.95, 0],
    [0.7, -0.25],
    [0.5, -0.5],
    [0.35, -0.25],
    [-0.4, -0.25],
    [-0.55, -0.5],
    [-0.7, -0.25],
  ];
  face(RHINO, 0.3, 3.9, 0.6, "#3a2a2a");
  const DEER: [number, number][] = [
    [-0.6, 0],
    [0.3, 0.1],
    [0.5, 0.5],
    [0.8, 0.9],
    [0.65, 0.4],
    [0.7, 0.1],
    [0.4, -0.1],
    [0.35, -0.55],
    [0.2, -0.1],
    [-0.35, -0.1],
    [-0.45, -0.55],
    [-0.55, -0.1],
  ];
  face(DEER, -0.2, 1.7, 0.6, "#c86a30");
  const HAND: [number, number][] = [
    [0, -0.3],
    [0.2, -0.2],
    [0.25, 0.1],
    [0.35, 0.35],
    [0.18, 0.2],
    [0.12, 0.45],
    [0.02, 0.2],
    [-0.08, 0.42],
    [-0.12, 0.15],
    [-0.28, 0.3],
    [-0.2, -0.05],
  ];
  face(HAND, 2.3, 3.6, 0.8, "#b8402a");
  face(HAND, -2.6, 1.9, 0.7, "#3a2a2a");
  return P;
}

function skull(): THREE.BufferGeometry[] {
  // the camp's gateway: two great mammoth tusks planted in the snow, curving up to meet in an
  // arch, with a mammoth skull resting on a stone beside it
  const P: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 6; k++) {
      const u = k / 6;
      pts.push(v3(s * (1.7 - Math.sin(u * PI * 0.5) * 1.55), Math.sin(u * PI * 0.62) * 4.1 - 0.1, Math.sin(u * PI) * 0.35));
    }
    for (let k = 0; k < 6; k++) P.push(pp(stick(pts[k], pts[k + 1], 0.34 - k * 0.04), k % 2 ? "#fff2d6" : "#f4e6c6"));
  }
  P.push(pp(cyl(0.2, 0.2, 0.3, 6, 0, 3.75, 0.3), "#8a5a3a"));
  P.push(pp(lump(0.55, 2.6, 0.25, 0.6, 5, 1.2, 0.5, 1), STONE));
  P.push(pp(ball(0.42, 2.6, 0.85, 0.6, 1, 1, 0.9, 0.9), BONE));
  for (const s of [-1, 1]) P.push(pp(gem(0.09, 2.6 + s * 0.18, 0.92, 0.95), "#4a3a34"));
  return P;
}

// ── plants ──

function cycad(v: number, seed: number, low: boolean): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  const rnd = dinoRng(seed);
  const H = 1.1 + v * 0.35;
  P.push(pp(cyl(0.34, 0.42, H, 6, 0, 0, 0, true), (p) => (Math.floor(p.y * 5 + Math.atan2(p.x, p.z) * 1.2) % 2 ? col("#8a6a3a") : col("#6e5230"))));
  const n = low ? 6 : 8;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * PI * 2 + rnd() * 0.3;
    P.push(pp(place(frond(1.9, 0.28, 0.5, 2), 0, H, 0, a, 1, -0.35 - (k % 2) * 0.25, 0), LEAF[(k + v + 1) % 3], sway(0.08)));
  }
  P.push(pp(cone(0.25, 0.5, 5, 0, H - 0.05, 0), "#d8a040"));
  return P;
}

function fern(v: number, seed: number): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  const rnd = dinoRng(seed);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * PI * 2 + rnd() * 0.4;
    P.push(pp(place(frond(1.4 + rnd() * 0.4, 0.26, 0.6, 2), 0, 0.05, 0, a, 1, -0.5, 0), LEAF_L[(k + v) % 3], sway(0.3)));
  }
  return P;
}

function bigleaf(v: number, seed: number): THREE.BufferGeometry[] {
  // elephant-ear: huge heart-shaped leaves on long stalks
  const P: THREE.BufferGeometry[] = [];
  const rnd = dinoRng(seed);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * PI * 2 + rnd() * 0.6;
    const h = 1.0 + rnd() * 0.8;
    const tip = v3(Math.sin(a) * 0.5, h, Math.cos(a) * 0.5);
    P.push(pp(stick(v3(0, 0, 0), tip, 0.06), "#5a9a3a", (q) => [0, q.y * 0.1, 0]));
    const g = flat([
      [0, 0],
      [0.55, 0.35],
      [0.75, 0.9],
      [0.35, 1.5],
      [0, 1.7],
      [-0.35, 1.5],
      [-0.75, 0.9],
      [-0.55, 0.35],
    ]);
    g.rotateX(-PI / 2 + 0.55);
    P.push(pp(place(g, tip.x, tip.y, tip.z, a), LEAF[(k + v) % 3], sway(0.25)));
  }
  return P;
}

function reeds(v: number, seed: number): THREE.BufferGeometry[] {
  // horsetails: jointed green stems with dark rings (dinosaur food!)
  const P: THREE.BufferGeometry[] = [];
  const rnd = dinoRng(seed);
  for (let k = 0; k < 4; k++) {
    const a = rnd() * PI * 2;
    const r = rnd() * 0.45;
    const h = 0.9 + rnd() * 0.9 + v * 0.3;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    P.push(pp(cyl(0.035, 0.05, h, 3, x, 0, z, true), (p) => (Math.floor(p.y * 5) % 3 === 0 ? col("#2e5a2a") : col("#6aa84a")), (q) => [0, q.y * 0.25, 0]));
    P.push(pp(cone(0.06, 0.18, 3, x, h, z), "#8a6a3a", [0, h * 0.25, 0]));
  }
  return P;
}

function swamptree(v: number, seed: number, low: boolean): THREE.BufferGeometry[] {
  // a bald cypress: flared base, knobbly "knees" poking out of the water, droopy crown with moss
  const P: THREE.BufferGeometry[] = [];
  const rnd = dinoRng(seed);
  const H = 5.5 + v * 0.6;
  P.push(pp(cyl(0.3, 0.85, 1.4, 7, 0, -0.6, 0), "#6a5a44"));
  P.push(pp(cyl(0.25, 0.32, H, 6, 0, 0.6, 0), "#6a5a44", (q) => [0, q.y * 0.005, 0]));
  for (let k = 0; k < 4; k++) {
    const a = rnd() * PI * 2;
    P.push(pp(cone(0.12, 0.5, 5, Math.sin(a) * 1.4, -0.2, Math.cos(a) * 1.4), "#7a6a52"));
  }
  for (let k = 0; k < (low ? 2 : 4); k++) {
    const a = (k / 4) * PI * 2 + rnd();
    P.push(pp(lump(1.5, Math.sin(a) * 1.1, H + 0.4 - k * 0.3, Math.cos(a) * 1.1, seed + k, 1.3, 0.6, 1.3), ["#5a8a4a", "#6a9a50", "#4e7e44"][(k + v) % 3], sway(0.04)));
    const mx = Math.sin(a) * 1.8;
    const mz = Math.cos(a) * 1.8;
    P.push(pp(flat([[-0.18, 0], [0.18, 0], [0.05, -1.4]]).rotateY(a).translate(mx, H - 0.1, mz), "#a8b890", (q) => [0, (H - q.y) * 0.25, 0]));
  }
  return P;
}

function flowers(v: number, seed: number): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  const rnd = dinoRng(seed);
  const cols = [
    ["#ff5a4a", "#ffb04a"],
    ["#ff7ad0", "#fff08a"],
    ["#ffffff", "#ffd04a"],
  ][v % 3];
  for (let k = 0; k < 4; k++) {
    const a = rnd() * PI * 2;
    const r = rnd() * 0.5;
    const h = 0.4 + rnd() * 0.4;
    P.push(pp(cyl(0.02, 0.02, h, 3, Math.sin(a) * r, 0, Math.cos(a) * r, true), "#3a8a30", (q) => [0, q.y * 0.3, 0]));
    P.push(pp(gem(0.13, Math.sin(a) * r, h + 0.05, Math.cos(a) * r, 1.3, 0.6, 1.3), cols[k % 2], [0, h * 0.3, 0.25]));
  }
  return P;
}

function rock(seed: number, snowy: boolean, lava: boolean): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  P.push(pp(lump(0.9, 0, 0.45, 0, seed, 1.2, 0.8, 1), (_p, n) => (snowy && n.y > 0.55 ? col(SNOWC) : col(lava ? (n.y > 0.4 ? "#4a3a40" : "#3a2e34") : n.y > 0.4 ? "#b0a494" : "#968a7c"))));
  if (lava) P.push(pp(gem(0.18, 0.3, 0.75, 0.3, 1.5, 0.3, 1), "#ff6a2a", [0, 0, 1.2]));
  return P;
}

function boulder(seed: number, snowy: boolean): THREE.BufferGeometry[] {
  return [pp(lump(2.0, 0, 1.0, 0, seed, 1.15, 0.72, 1, 0.22, 1), (_p, n) => (snowy && n.y > 0.5 ? col(SNOWC) : col(n.y > 0.4 ? "#a8a0a0" : "#8c8488")))];
}

function snowbush(seed: number): THREE.BufferGeometry[] {
  return [pp(lump(0.8, 0, 0.45, 0, seed, 1.2, 0.8, 1.1), (_p, n) => (n.y > 0.35 ? col(SNOWC) : col(PINE[seed % 3])))];
}

function icecrystal(seed: number): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  const rnd = dinoRng(seed);
  for (let k = 0; k < 5; k++) {
    const a = rnd() * PI * 2;
    const h = 0.8 + rnd() * 1.6;
    const g = new THREE.ConeGeometry(0.25 + rnd() * 0.15, h, 5, 1);
    g.translate(0, h / 2, 0);
    g.rotateX((rnd() - 0.5) * 0.7);
    g.rotateZ((rnd() - 0.5) * 0.7);
    P.push(pp(place(g, Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4, a), k % 2 ? "#bfe8ff" : "#8fd0f4", [0, 0, 0.35]));
  }
  return P;
}

function footprints(v: number): THREE.BufferGeometry[] {
  // a line of big three-toed T-rex footprints pressed into the trail
  const P: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const side = k % 2 ? 1 : -1;
    const z = -4 + k * 2;
    const x = side * 0.45;
    for (let t = -1; t <= 1; t++) {
      const g = flat([
        [-0.1, 0],
        [0.1, 0],
        [0, 0.7],
      ]);
      g.rotateX(-PI / 2);
      g.rotateY(t * 0.45);
      g.translate(x, 0.05, z);
      P.push(pp(g, v ? "#8a7050" : "#a08058"));
    }
    P.push(pp(ball(0.22, x, 0.0, z - 0.05, 0, 1, 0.15, 1), v ? "#8a7050" : "#a08058"));
  }
  return P;
}

function vent(seed: number): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2;
    P.push(pp(lump(0.35, Math.sin(a) * 0.6, 0.1, Math.cos(a) * 0.6, seed + k, 1, 0.5, 1), k % 2 ? "#e8d050" : "#c8b040"));
  }
  P.push(pp(cyl(0.45, 0.5, 0.06, 7), "#ff7a2a", [0, 0, 1.3]));
  return P;
}

// ── the ice cave's arch, seracs on the glacier ──

function iceCave(low: boolean): THREE.BufferGeometry[] {
  const P: THREE.BufferGeometry[] = [];
  const C = DINO_CAVE;
  const fx = Math.sin(C.rot);
  const fz = Math.cos(C.rot);
  const sx = fz;
  const sz = -fx;
  const y0 = C.floorY;
  const segs = low ? 6 : 8;
  const steps = low ? 4 : 6;
  // an arched roof of blue ice from the mouth back into the glacier, narrowing and lowering
  for (let i = 0; i < steps; i++) {
    const u0 = i / steps;
    const u1 = (i + 1) / steps;
    const ring = (u: number) => {
      const along = -1.2 + u * (C.depth + 1.2);
      const half = C.half * (1 - 0.35 * Math.max(0, along / C.depth)) + 0.35;
      const h = 3.4 - u * 0.8;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= segs; k++) {
        const a = (k / segs) * PI;
        pts.push(v3(C.x - X0 - fx * along + sx * Math.cos(a) * half, y0 + Math.sin(a) * h, C.z - Z0 - fz * along + sz * Math.cos(a) * half));
      }
      return pts;
    };
    const A = ring(u0);
    const B = ring(u1);
    const pos: number[] = [];
    for (let k = 0; k < segs; k++) {
      const q = [A[k], A[k + 1], B[k], B[k + 1]];
      // (two layers: the inside surface and a thick outer shell)
      pos.push(q[0].x, q[0].y, q[0].z, q[2].x, q[2].y, q[2].z, q[1].x, q[1].y, q[1].z, q[1].x, q[1].y, q[1].z, q[2].x, q[2].y, q[2].z, q[3].x, q[3].y, q[3].z);
      pos.push(q[0].x, q[0].y, q[0].z, q[1].x, q[1].y, q[1].z, q[2].x, q[2].y, q[2].z, q[1].x, q[1].y, q[1].z, q[3].x, q[3].y, q[3].z, q[2].x, q[2].y, q[2].z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    P.push(pp(g, (p, n) => (n.y < -0.2 ? col("#7ec0ec") : col(i % 2 ? "#cfeefc" : "#b8e2f8")), [0, 0, 0.25]));
    // (a thick lip at the mouth)
    if (i === 0) for (let k = 0; k < segs; k++) P.push(pp(stick(A[k], A[k + 1], 0.42), (_p, n) => (n.y > 0.3 ? col(SNOWC) : col("#bfe8fb")), [0, 0, 0.35]));
  }
  // icicles along the mouth, glowing crystals inside
  for (let k = 1; k < segs; k++) {
    const a = (k / segs) * PI;
    const x = C.x - X0 + fx * 1.2 + sx * Math.cos(a) * (C.half + 0.35);
    const z = C.z - Z0 + fz * 1.2 + sz * Math.cos(a) * (C.half + 0.35);
    const y = y0 + Math.sin(a) * 3.4;
    const g = new THREE.ConeGeometry(0.13, 0.9 + (k % 3) * 0.3, 4, 1);
    g.rotateX(PI);
    g.translate(x, y - 0.5, z);
    P.push(pp(g, "#e8f8ff", [0, 0, 0.4]));
  }
  for (let k = 0; k < 4; k++) {
    const along = 3.2 + k * 1.1;
    const s = k % 2 ? 1 : -1;
    const x = C.x - X0 - fx * along + sx * s * (C.half - 0.25);
    const z = C.z - Z0 - fz * along + sz * s * (C.half - 0.25);
    for (const g of icecrystal(k * 13 + 5)) P.push(place(g, x, y0, z, k, 0.7));
  }
  // an ammonite frozen in the ice wall, just inside (spot it!)
  const ax = C.x - X0 - fx * 3.2 + sx * (C.half - 0.1);
  const az = C.z - Z0 - fz * 3.2 + sz * (C.half - 0.1);
  P.push(pp(place(new THREE.TorusGeometry(0.35, 0.14, 4, 10), ax, y0 + 1.6, az, Math.atan2(sx, sz) + PI / 2), "#e8b870", [0, 0, 0.3]));
  // seracs: big ice blocks tumbled along the glacier's edges
  const G = DINO_GLACIER;
  const rnd = dinoRng(515);
  for (let k = 0; k < (low ? 5 : 9); k++) {
    const t = 0.15 + rnd() * 0.75;
    const side = rnd() < 0.5 ? -1 : 1;
    const ux = G.bx - G.ax;
    const uz = G.bz - G.az;
    const L = Math.hypot(ux, uz);
    const w = G.w0 + (G.w1 - G.w0) * t;
    const x = G.ax + ux * t + (-uz / L) * side * (w - 0.8);
    const z = G.az + uz * t + (ux / L) * side * (w - 0.8);
    const y = dinoLandY(x, z) ?? 10;
    P.push(pp(boxR(1.4 + rnd(), 1.2 + rnd() * 1.4, 1.2 + rnd(), x - X0, y + 0.4, z - Z0, rnd() * 0.3, rnd() * 3, rnd() * 0.3), (_p, n) => (n.y > 0.6 ? col(SNOWC) : col("#a8dcf6")), [0, 0, 0.15]));
  }
  return P;
}

// ── decks: planks on posts ──

function deckParts(d: DinoDeck, low: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const toLocal = (x: number, z: number) => [x - X0, z - Z0] as const;
  const postTo = (x: number, z: number, y: number, r: number) => {
    const floor = dinoSeaFloorY(x, z) ?? dinoLandY(x, z) ?? y - 3;
    const [lx, lz] = toLocal(x, z);
    const bottom = Math.min(y - 0.6, floor - 0.4);
    parts.push(pp(cyl(r, r * 1.1, y - bottom, 5, lx, bottom, lz, true), (p) => (p.y < -0.1 ? col("#5a6a58") : col(WOOD_D))));
  };
  if (d.r !== undefined) {
    const n = low ? 10 : 14;
    const [cx, cz] = toLocal(d.ax, d.az);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * PI * 2;
      const g = new THREE.CylinderGeometry(d.r, d.r, 0.2, 2, 1, false, a0 + 0.02, (PI * 2) / n - 0.04);
      parts.push(pp(place(g, cx, d.ya - 0.1, cz), i % 2 ? "#c9955c" : "#b8844e"));
    }
    return parts;
  }
  const L = Math.hypot(d.bx - d.ax, d.bz - d.az);
  const yaw = Math.atan2(d.bx - d.ax, d.bz - d.az);
  const step = 0.55;
  const n = Math.max(1, Math.round(L / step));
  const [ax, az] = toLocal(d.ax, d.az);
  const ux = (d.bx - d.ax) / L;
  const uz = (d.bz - d.az) / L;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const y = d.ya + (d.yb - d.ya) * u;
    const g = box(d.half * 2, 0.16, (L / n) * 0.9, 0, 0, 0);
    parts.push(pp(place(g, ax + ux * L * u, y - 0.08, az + uz * L * u, yaw, 1, Math.atan2(d.ya - d.yb, L), 0), (i * 7 + Math.round(ax)) % 3 ? "#c9955c" : "#b07c48"));
  }
  const pn = Math.max(1, Math.round(L / 2.2));
  const px = uz;
  const pz = -ux;
  const rails = d.kind !== "jetty";
  for (let i = 0; i <= pn; i++) {
    const u = i / pn;
    const y = d.ya + (d.yb - d.ya) * u;
    for (const s of [-1, 1]) {
      const x = d.ax + ux * L * u + px * s * (d.half - 0.1);
      const z = d.az + uz * L * u + pz * s * (d.half - 0.1);
      const ground = dinoLandY(x, z);
      // (the Rex Bridge hangs free over the valley: posts only where the rim's under it)
      const hanging = d.id.startsWith("rexbridge") && (ground === null || ground < y - 3);
      if (!hanging && (ground === null || ground < y - 0.35)) postTo(x, z, y - 0.12, d.kind === "jetty" ? 0.17 : 0.12);
      if (rails && !low) {
        const [lx, lz] = toLocal(x, z);
        parts.push(pp(box(0.09, 0.95, 0.09, lx, y + 0.47, lz), WOOD_D));
      }
    }
  }
  if (rails) {
    for (const s of [-1, 1]) {
      const a = v3(ax + px * s * (d.half - 0.1), d.ya + 0.9, az + pz * s * (d.half - 0.1));
      const b = v3(ax + ux * L + px * s * (d.half - 0.1), d.yb + 0.9, az + uz * L + pz * s * (d.half - 0.1));
      parts.push(pp(stick(a, b, 0.07), d.kind === "boardwalk" ? "#e8dcc0" : WOOD));
    }
  }
  if (d.id.startsWith("rexbridge")) {
    // a suspension bridge: a tall timber tower at its rim end, thick ropes sagging to the middle,
    // hangers down to the deck
    const rimEnd = d.id.endsWith("-a") ? 0 : 1;
    const ex = ax + ux * L * rimEnd;
    const ez = az + uz * L * rimEnd;
    const ey = rimEnd ? d.yb : d.ya;
    const midY = rimEnd ? d.ya : d.yb;
    const sgn = rimEnd ? -1 : 1;
    void sgn;
    for (const s of [-1, 1]) {
      const tx = ex + px * s * (d.half + 0.35) - ux * sgn * 0.6;
      const tz = ez + pz * s * (d.half + 0.35) - uz * sgn * 0.6;
      const ground = dinoLandY(tx + X0, tz + Z0) ?? ey - 0.5;
      parts.push(pp(cyl(0.3, 0.36, ey - ground + 6.4, 6, tx, ground - 0.3, tz), LOG));
      parts.push(pp(cone(0.36, 0.7, 6, tx, ey + 6.1, tz), LOG_END));
      // (the rope: from the tower top, sagging to just above the rails at the bridge's middle)
      let prev = v3(tx, ey + 5.8, tz);
      const steps = low ? 5 : 8;
      const sx0 = rimEnd ? ax + ux * L : ax;
      const sz0 = rimEnd ? az + uz * L : az;
      const mx0 = rimEnd ? ax : ax + ux * L;
      const mz0 = rimEnd ? az : az + uz * L;
      for (let k = 1; k <= steps; k++) {
        const u = k / steps;
        const xx = lerp(sx0, mx0, u) + px * s * (d.half + 0.12);
        const z = lerp(sz0, mz0, u) + pz * s * (d.half + 0.12);
        const y = lerp(ey + 5.8, midY + 1.25, 1 - (1 - u) * (1 - u));
        const p2 = v3(xx, y, z);
        parts.push(pp(stick(prev, p2, 0.09), "#c8a070"));
        if (k < steps) parts.push(pp(stick(p2, v3(xx, lerp(ey, midY, u) + 0.9, z), 0.04), "#b89060"));
        prev = p2;
      }
    }
  }
  if (d.id === "jetty-t") {
    for (const s of [-1, 1]) {
      const [lx, lz] = toLocal(d.ax + ux * (L / 2 + s * (L / 2 - 0.4)), d.az + uz * (L / 2 + s * (L / 2 - 0.4)));
      parts.push(pp(cyl(0.2, 0.22, 0.55, 7, lx, d.ya, lz), "#4a3a34"));
    }
    // a welcome sign at the end of the jetty
    const [mx, mz] = toLocal(d.ax + ux * L * 0.5, d.az + uz * L * 0.5);
    parts.push(pp(box(0.12, 2.2, 0.12, mx - px * 0.9, d.ya + 1.1, mz - pz * 0.9), WOOD_D));
    parts.push(pp(place(box(1.6, 0.7, 0.1, 0, 0, 0), mx - px * 0.9, d.ya + 2.1, mz - pz * 0.9, yaw), "#ffd84a"));
    parts.push(pp(place(box(1.3, 0.12, 0.12, 0, 0, 0), mx - px * 0.9, d.ya + 2.1, mz - pz * 0.9, yaw), "#5a3a22"));
  }
  return parts;
}

// ── assembling ──

export function propParts(p: DinoProp, low: boolean): THREE.BufferGeometry[] | null {
  const snowy = dinoSnow(p.x, p.z) > 0.4;
  switch (p.kind) {
    case "gate":
      return gate(low);
    case "torch":
      return torch();
    case "hut":
      return hut(low);
    case "kiosk":
      return kiosk();
    case "tower":
      return tower(p, low);
    case "platform":
      return platform(p);
    case "hidehut":
      return hideHut(p, low);
    case "fence":
      return railFence(p);
    case "signpost":
      return signpost(p.v);
    case "bench":
      return bench();
    case "crates":
      return crates(p.v);
    case "tent":
      return tent();
    case "dig":
      return digSite(p);
    case "ribcage":
      return ribcage();
    case "nest":
      return nest(p.v, p.seed, low);
    case "bonehut":
      return bonehut(low);
    case "campfire":
      return campfire();
    case "rack":
      return rack();
    case "paintrock":
      return paintrock(p.seed);
    case "skull":
      return skull();
    case "cycad":
      return cycad(p.v, p.seed, low);
    case "fern":
      return fern(p.v, p.seed);
    case "bigleaf":
      return bigleaf(p.v, p.seed);
    case "reeds":
      return reeds(p.v, p.seed);
    case "swamptree":
      return swamptree(p.v, p.seed, low);
    case "flowers":
      return flowers(p.v, p.seed);
    case "rock":
      return rock(p.seed, snowy, false);
    case "lavarock":
      return rock(p.seed, false, true);
    case "boulder":
      return boulder(p.seed, snowy);
    case "snowbush":
      return snowbush(p.seed);
    case "icecrystal":
      return icecrystal(p.seed);
    case "footprints":
      return footprints(p.v);
    case "vent":
      return vent(p.seed);
  }
}

/** every prop + every deck as one geometry in island-local coordinates (the island's centre at the origin) */
export function buildPropsGeometry(low: boolean): THREE.BufferGeometry {
  const all: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  for (const p of DINO_PROPS) {
    // (low quality: no ground cover — none of it is in anybody's way)
    if (low && (p.kind === "flowers" || p.kind === "fern" || p.kind === "reeds" || ((p.kind === "bigleaf" || p.kind === "snowbush") && p.seed % 2 === 0))) continue;
    const parts = propParts(p, low);
    if (!parts) continue;
    e.set(0, p.rot, 0);
    // (props on sloping ground sink a little so no roots float)
    m.compose(pos.set(p.x - X0, p.y, p.z - Z0), q.setFromEuler(e), sc.setScalar(p.s));
    for (const g of parts) {
      g.applyMatrix4(m);
      all.push(g);
    }
  }
  all.push(...rimFence(low));
  all.push(...iceCave(low));
  for (const d of DINO_DECKS) all.push(...deckParts(d, low));
  void dinoGroundY;
  return mergeAll(all);
}
