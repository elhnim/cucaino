// Frostpeak Isle's creatures as chunky faceted models in the village kit's "folk" layout (position,
// normal, color, aSlot, aVar, aGlow — see ../village/kit.ts), so ONE instanced mesh holds several
// variants and each instance picks its own with aSel:
//   - penguin bodies (egg-shaped, belly facing +z, feet at y = 0): emperor / chick / little penguin
//   - penguin heads (pivot at the neck): emperor (golden ear patches, long bill) / chick (black cap,
//     white face mask) / little penguin (slate blue)
//   - flippers + wings (pivot at the shoulder): penguin flippers (hang down, same for both sides)
//     and the terns' wings (right / left, mirrored)
//   - beasts: a seal (lying on its belly, nose +z), a narwhal (tusk +z) and a tern's body
import * as THREE from "three";
import { ball, box, fp, gem, lump, mergeAll, place, stick, v3 } from "../village/kit";

export const P_EMPEROR = 0;
export const P_CHICK = 1;
export const P_LITTLE = 2;
/** where each penguin kind's neck and shoulders are (body-local), and its standing height */
export const PENGUIN_RIG = [
  { neck: 0.84, shoulderX: 0.27, shoulderY: 0.7, height: 1.08, belly: 0.27 },
  { neck: 0.52, shoulderX: 0.22, shoulderY: 0.38, height: 0.68, belly: 0.25 },
  { neck: 0.42, shoulderX: 0.155, shoulderY: 0.33, height: 0.5, belly: 0.16 },
] as const;

export const W_FLIP_EMPEROR = 0;
export const W_FLIP_CHICK = 1;
export const W_FLIP_LITTLE = 2;
export const W_TERN_R = 3;
export const W_TERN_L = 4;

export const B_SEAL = 0;
export const B_NARWHAL = 1;
export const B_TERN = 2;

const BLACK = "#1f2433";
const WHITE = "#fbfcff";
const GOLD = "#ffc23d";
const PALE_GOLD = "#fff0b0";
const SLATE = "#4d6f9f";

/** mirror a geometry in x (keeping its faces pointing out) */
function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = g.index ? g.toNonIndexed() : g.clone();
  m.scale(-1, 1, 1);
  const pos = m.attributes.position as THREE.BufferAttribute;
  for (let f = 0; f < pos.count; f += 3) {
    const x = pos.getX(f + 1);
    const y = pos.getY(f + 1);
    const z = pos.getZ(f + 1);
    pos.setXYZ(f + 1, pos.getX(f + 2), pos.getY(f + 2), pos.getZ(f + 2));
    pos.setXYZ(f + 2, x, y, z);
  }
  return m;
}

// ── penguin bodies ──

function emperorBody(low: boolean): THREE.BufferGeometry[] {
  const v = P_EMPEROR;
  const parts: THREE.BufferGeometry[] = [];
  const body = ball(1, 0, 0.47, 0, low ? 0 : 1, 0.3, 0.43, 0.27);
  parts.push(
    fp(body, (p, n) => {
      // white belly in front, a pale gold bib up top, black back
      if (n.z > 0.25 && Math.abs(p.x) < 0.25) return p.y > 0.66 ? PALE_GOLD : WHITE;
      return BLACK;
    }, 1, v),
  );
  // tail, feet
  parts.push(fp(place(new THREE.ConeGeometry(0.1, 0.25, 4), 0, 0.1, -0.24, 0, 1, -2.2), BLACK, 1, v));
  for (const x of [-0.1, 0.1]) parts.push(fp(box(0.12, 0.05, 0.2, x, 0.025, 0.1), "#3a2f38", 0, v));
  return parts;
}
function chickBody(low: boolean): THREE.BufferGeometry[] {
  const v = P_CHICK;
  // a fluffy grey down-ball
  const parts = [fp(lump(1, 0, 0.3, 0, 7, 0.25, 0.3, 0.24, 0.12, low ? 0 : 1), (_p, n) => (n.z > 0.5 ? "#c4c8d0" : "#a4a9b4"), 1, v)];
  for (const x of [-0.07, 0.07]) parts.push(fp(box(0.08, 0.04, 0.13, x, 0.02, 0.08), "#4a4048", 0, v));
  return parts;
}
function littleBody(low: boolean): THREE.BufferGeometry[] {
  const v = P_LITTLE;
  const body = ball(1, 0, 0.24, 0, low ? 0 : 1, 0.16, 0.23, 0.15);
  const parts = [fp(body, (p, n) => (n.z > 0.2 && Math.abs(p.x) < 0.14 ? WHITE : SLATE), 1, v)];
  parts.push(fp(place(new THREE.ConeGeometry(0.05, 0.14, 4), 0, 0.06, -0.13, 0, 1, -2.2), SLATE, 1, v));
  for (const x of [-0.05, 0.05]) parts.push(fp(box(0.06, 0.03, 0.1, x, 0.015, 0.06), "#f0b8c8", 0, v));
  return parts;
}
export function buildPenguinBody(low: boolean): THREE.BufferGeometry {
  return mergeAll([...emperorBody(low), ...chickBody(low), ...littleBody(low)]);
}

// ── penguin heads (pivot at the neck: the head sits above y = 0) ──

function eyes(v: number, r: number, x: number, y: number, z: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    out.push(fp(gem(r, s * x, y, z), "#ffffff", 0, v));
    out.push(fp(gem(r * 0.6, s * x * 1.04, y, z + r * 0.5), "#101018", 0, v));
  }
  return out;
}
export function buildPenguinHead(low: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // emperor: black head, golden ear patches, a long curved bill with an orange stripe
  {
    const v = P_EMPEROR;
    parts.push(
      fp(ball(0.155, 0, 0.1, 0.02, low ? 0 : 1, 1, 1.02, 1.08), (p, n) => (Math.abs(p.x) > 0.07 && n.z < 0.35 && p.y < 0.13 && p.y > -0.02 ? GOLD : BLACK), 1, v),
    );
    const bill = new THREE.ConeGeometry(0.045, 0.24, 5);
    bill.rotateX(Math.PI / 2 + 0.2);
    parts.push(fp(place(bill, 0, 0.07, 0.25), (p) => (p.y < 0.055 ? "#ff8a3a" : "#2a2a33"), 0, v));
    parts.push(...eyes(v, 0.026, 0.075, 0.13, 0.13));
  }
  // chick: black cap, white face mask
  {
    const v = P_CHICK;
    parts.push(fp(ball(0.15, 0, 0.1, 0.01, low ? 0 : 1, 1, 0.95, 1), (p, n) => (n.z > 0.2 && p.y < 0.17 ? WHITE : p.y > 0.12 || n.z < -0.2 ? "#2a2c34" : "#b8bcc6"), 1, v));
    const bill = new THREE.ConeGeometry(0.03, 0.1, 4);
    bill.rotateX(Math.PI / 2);
    parts.push(fp(place(bill, 0, 0.08, 0.17), "#2a2a33", 0, v));
    parts.push(...eyes(v, 0.024, 0.065, 0.12, 0.12));
  }
  // little penguin: slate blue with a white throat
  {
    const v = P_LITTLE;
    parts.push(fp(ball(0.095, 0, 0.06, 0.01, low ? 0 : 1, 1, 1, 1.05), (p, n) => (n.z > 0.3 && p.y < 0.04 ? WHITE : SLATE), 1, v));
    const bill = new THREE.ConeGeometry(0.022, 0.1, 4);
    bill.rotateX(Math.PI / 2 + 0.15);
    parts.push(fp(place(bill, 0, 0.04, 0.13), "#2a2a33", 0, v));
    parts.push(...eyes(v, 0.017, 0.045, 0.08, 0.08));
  }
  return mergeAll(parts);
}

// ── flippers and wings (pivot at the shoulder) ──

export function buildWings(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const flipper = (v: number, len: number, w: number, outer: string, inner: string) => {
    // a flat tapered paddle hanging down from the shoulder (symmetric: works for either side)
    const g = new THREE.CylinderGeometry(w * 0.55, w, len, 4, 1);
    g.scale(0.3, 1, 1);
    g.translate(0, -len / 2, 0);
    parts.push(fp(g, (_p, n) => (Math.abs(n.x) > 0.5 && n.z > -0.2 ? outer : inner), 0, v));
  };
  flipper(W_FLIP_EMPEROR, 0.42, 0.1, BLACK, "#e8ecf4");
  flipper(W_FLIP_CHICK, 0.2, 0.07, "#9aa0ab", "#b8bcc6");
  flipper(W_FLIP_LITTLE, 0.2, 0.055, SLATE, "#e8ecf4");
  // tern wings: long and pointed, white below, pale grey above, black tips (extends +x)
  const tern = new THREE.BufferGeometry();
  const pts = [
    [0, 0, 0.07],
    [0.3, 0.01, 0.06],
    [0.62, 0.0, -0.08],
    [0, 0, -0.06],
    [0.28, 0.0, -0.08],
  ];
  const tri = [0, 1, 3, 1, 4, 3, 1, 2, 4];
  const pos: number[] = [];
  for (const i of tri) pos.push(...pts[i]);
  // (and the underside)
  for (let k = tri.length - 1; k >= 0; k--) pos.push(pts[tri[k]][0], pts[tri[k]][1] - 0.012, pts[tri[k]][2]);
  tern.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const right = fp(tern, (p, n) => (p.x > 0.45 ? "#2a2c34" : n.y > 0 ? "#dfe6ee" : "#ffffff"), 0, W_TERN_R);
  parts.push(right);
  const left = mirrorX(tern.clone());
  parts.push(fp(left, (p, n) => (p.x < -0.45 ? "#2a2c34" : n.y > 0 ? "#dfe6ee" : "#ffffff"), 0, W_TERN_L));
  return mergeAll(parts);
}

// ── beasts ──

export function buildBeasts(low: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // a seal: plump spindle lying on its belly (length ~1.9 along z), spotty grey, a whiskery face
  {
    const v = B_SEAL;
    const d = low ? 0 : 1;
    parts.push(
      fp(ball(1, 0, 0.3, 0, d, 0.42, 0.34, 0.95), (p, n) => (n.y < -0.3 ? "#c9ccd4" : Math.sin(p.x * 23 + p.z * 17) > 0.8 ? "#5d6470" : "#8b919d"), 1, v),
    );
    parts.push(fp(ball(0.26, 0, 0.42, 0.95, d, 1, 0.9, 1.1), (p, n) => (n.y < -0.4 ? "#c9ccd4" : "#8b919d"), 1, v));
    parts.push(fp(ball(0.12, 0, 0.38, 1.2, 0, 1.1, 0.8, 1), "#b8bcc6", 0, v));
    parts.push(fp(gem(0.05, 0, 0.41, 1.31), "#1a1a22", 0, v));
    for (const s of [-1, 1]) {
      parts.push(fp(gem(0.055, s * 0.11, 0.53, 1.12), "#101018", 0, v));
      parts.push(fp(box(0.22, 0.005, 0.005, s * 0.18, 0.37, 1.26, s * 0.2), "#f4f4f4", 0, v));
      // fore flippers and the tail flippers
      parts.push(fp(place(box(0.08, 0.3, 0.2), s * 0.38, 0.12, 0.35, 0, 1, 0.3, s * 1.1), "#737986", 1, v));
      parts.push(fp(place(box(0.3, 0.05, 0.34), s * 0.16, 0.25, -1.08, s * 0.5), "#737986", 1, v));
    }
  }
  // a narwhal: ~4 m, mottled grey back, pale belly, a long spiral tusk
  {
    const v = B_NARWHAL;
    const d = low ? 0 : 1;
    parts.push(
      fp(ball(1, 0, 0, 0, d, 0.62, 0.6, 2.0), (p, n) => (n.y < -0.25 ? "#e4e8ee" : Math.sin(p.x * 9 + p.z * 5) * Math.sin(p.z * 7) > 0.35 ? "#4a5462" : "#7a8494"), 1, v),
    );
    parts.push(fp(place(box(1.6, 0.08, 0.6), 0, 0, -2.15), "#5a6472", 1, v));
    for (const s of [-1, 1]) parts.push(fp(place(box(0.5, 0.06, 0.3), s * 0.62, -0.18, 0.9, s * 0.4, 1, 0, s * 0.3), "#5a6472", 1, v));
    const tusk = new THREE.ConeGeometry(0.07, 2.2, 5, 4);
    tusk.rotateX(Math.PI / 2);
    parts.push(fp(place(tusk, 0.1, 0.05, 3.0), (p) => (Math.sin(p.z * 18 + Math.atan2(p.x - 0.1, p.y - 0.05) * 2) > 0 ? "#fff8e0" : "#e8dcb8"), 0, v));
    for (const s of [-1, 1]) parts.push(fp(gem(0.06, s * 0.46, 0.08, 1.55), "#101018", 0, v));
  }
  // a tern's body: white, a black cap, an orange-red bill, a forked tail
  {
    const v = B_TERN;
    parts.push(fp(ball(1, 0, 0, 0, 0, 0.08, 0.075, 0.2), "#ffffff", 0, v));
    parts.push(fp(ball(0.075, 0, 0.04, 0.17, 0, 1, 0.95, 1.1), (p) => (p.y > 0.035 ? "#1c1c24" : "#ffffff"), 0, v));
    const bill = new THREE.ConeGeometry(0.02, 0.12, 4);
    bill.rotateX(Math.PI / 2);
    parts.push(fp(place(bill, 0, 0.03, 0.29), "#ff5a2a", 0, v));
    for (const s of [-1, 1]) parts.push(fp(place(box(0.02, 0.01, 0.2), s * 0.04, 0, -0.26, s * 0.25), "#f0f0f4", 0, v));
  }
  return mergeAll(parts);
}

// ── ski gear (the Penguin Ski Run): one instanced mesh, a variant per thing ──

export const G_SKI = 0;
export const G_POLE = 1;
export const G_CHAIR = 2;
/** chair: the seat's top is at y = 0, the hanger runs up to the cable (CHAIR_DROP above) */
export function buildSkiGear(chairDrop: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // a ski (model units, binding at the origin, tip +z, curled up): coloured per instance
  {
    const v = G_SKI;
    parts.push(fp(box(0.11, 0.03, 0.86, 0, 0.015, -0.05), "#ffffff", 1, v));
    const tip = box(0.11, 0.03, 0.16, 0, 0, 0.08);
    tip.rotateX(-0.6);
    parts.push(fp(place(tip, 0, 0.02, 0.36), "#ffffff", 1, v));
  }
  // a pole: grip at the origin, shaft down -y (length 1), a basket near the tip
  {
    const v = G_POLE;
    parts.push(fp(box(0.025, 1, 0.025, 0, -0.5, 0), (p) => (p.y > -0.12 ? "#ff5a7a" : "#cfd6e2"), 0, v));
    parts.push(fp(box(0.11, 0.012, 0.11, 0, -0.9, 0), "#2a2f3a", 0, v));
  }
  // a chair (world units): seat, backrest, the hanger up behind it and over to the cable grip
  {
    const v = G_CHAIR;
    parts.push(fp(box(1.05, 0.1, 0.7, 0, -0.05, 0), "#4fc3f7", 0, v));
    parts.push(fp(box(1.05, 0.62, 0.08, 0, 0.27, -0.36), (p) => (p.y > 0.5 ? "#e0503c" : "#4fc3f7"), 0, v));
    parts.push(fp(box(0.9, 0.05, 0.25, 0, -0.62, 0.38), "#4a5568", 0, v));
    parts.push(fp(stick(v3(0, 0.5, -0.42), v3(0, chairDrop - 0.35, -0.42), 0.07), "#4a5568", 0, v));
    parts.push(fp(stick(v3(0, chairDrop - 0.35, -0.42), v3(0, chairDrop, 0), 0.07), "#4a5568", 0, v));
    parts.push(fp(box(0.22, 0.16, 0.3, 0, chairDrop + 0.02, 0), "#2a2f3a", 0, v));
  }
  return mergeAll(parts);
}

/** a quick look at the penguin kinds' heights (for tests and the harness) */
export function penguinHeight(kind: number): number {
  return PENGUIN_RIG[kind].height;
}
