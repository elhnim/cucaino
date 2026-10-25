// The Tidewing Folk and their island's critters as chunky faceted models (the folk layout of
// ./kit.ts: slot tints + variants), so the whole clan is a few instanced meshes:
//   body  — tunic / dress / robe / apron (variants), shell necklace, a little fish-tail fin
//   head  — big round head, shiny eyes, rosy cheeks, fin-shaped ears; hair: bun / seaweed waves /
//           a fin crest / an elder's bun with a shell tiara (variants)
//   limb  — an arm (sleeve + hand) or a leg (shorts + flipper foot) (variants)
//   wing  — a tiny glittery sprite wing (glows softly at night) or a gull's wing (variants)
//   tool  — fishing rod, broom, drum, flute, bun tray, lantern pole, hoe, basket, skipping rope
// plus crabs, bubblepups (little seal-pups that blow glowing bubbles), gulls and outrigger canoes.
// Sizes are for a grown-up (~1.95 m); children are instanced smaller.
import * as THREE from "three";
import { ball, box, col, cyl, flat, fp, gem, lump, mergeAll, place, stick, v3 } from "./kit";

const DARK = "#2b2440";
const WHITE = "#ffffff";
/** hip height of a standing grown-up (the body/leg joint); shoulders and neck above it */
export const HIP = 0.53;
export const SHOULDER = { x: 0.3, y: 0.5 };
export const NECK = 0.64;
export const LEG_X = 0.13;
export const WING_ROOT = { x: 0.08, y: 0.42, z: -0.22 };
export const HAND_Y = -0.47;

export const BODY_TUNIC = 0;
export const BODY_DRESS = 1;
export const BODY_ROBE = 2;
export const BODY_APRON = 3;

/** body: origin at the hips, front +z */
export function buildBody(low: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const seg = low ? 7 : 8;
  const prof = [
    [0.0, -0.02],
    [0.24, -0.02],
    [0.27, 0.12],
    [0.25, 0.3],
    [0.26, 0.44],
    [0.2, 0.57],
    [0.1, NECK + 0.02],
    [0.0, NECK + 0.03],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  parts.push(fp(new THREE.LatheGeometry(prof, seg), (p, n) => col(WHITE).multiplyScalar(0.86 + 0.14 * Math.max(0, n.z)), 1));
  // belt
  parts.push(fp(cyl(0.268, 0.268, 0.07, seg, 0, 0.115, 0, true), "#fff1c8"));
  // the skirts (variants)
  const skirt = (r0: number, y0: number, r1: number, y1: number, v: number) => {
    const g = new THREE.CylinderGeometry(r0, r1, y0 - y1, seg, 1, true);
    g.translate(0, (y0 + y1) / 2, 0);
    parts.push(fp(g, (p) => col(WHITE).multiplyScalar(0.8 + 0.08 * Math.sin(Math.atan2(p.x, p.z) * 4)), 1, v));
  };
  skirt(0.27, 0.13, 0.31, -0.1, BODY_TUNIC);
  skirt(0.27, 0.16, 0.42, -0.3, BODY_DRESS);
  skirt(0.28, 0.22, 0.4, -0.44, BODY_ROBE);
  skirt(0.27, 0.13, 0.31, -0.1, BODY_APRON);
  // the elder's shawl and the baker's apron
  parts.push(fp(cyl(0.17, 0.28, 0.14, seg, 0, 0.47, 0, true), "#fff4e8", 0, BODY_ROBE));
  parts.push(fp(box(0.36, 0.52, 0.03, 0, 0.2, 0.28), "#fffdf6", 0, BODY_APRON));
  parts.push(fp(box(0.18, 0.16, 0.03, 0, 0.5, 0.25), "#fffdf6", 0, BODY_APRON));
  // the shell necklace
  const shells = ["#ffc2d9", "#fff0c2", "#c9e8ff", "#ffb38a", "#e6d0ff"];
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + (i / 4) * 1.8;
    parts.push(fp(new THREE.OctahedronGeometry(0.045, 0).scale(1, 1.2, 0.6).translate(Math.sin(a) * 0.19, 0.555 - Math.cos(a * 0.8) * 0.04, Math.cos(a) * 0.19), shells[i]));
  }
  // a little fish-tail fin peeking out behind
  const fin = flat([
    [0, 0],
    [0.16, -0.22],
    [0, -0.14],
    [-0.16, -0.22],
  ]);
  parts.push(fp(place(fin, 0, 0.02, -0.27, 0, 1, 0.5), col(WHITE).multiplyScalar(0.82), 2));
  return mergeAll(parts);
}

export const HAIR_BUN = 0;
export const HAIR_WAVES = 1;
export const HAIR_CREST = 2;
export const HAIR_ELDER = 3;

/** head: origin at the top of the neck, face +z */
export function buildHead(low: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const cy = 0.36;
  parts.push(fp(ball(0.42, 0, cy, 0, 1, 1, 0.93, 0.96), (p, n) => col(WHITE).multiplyScalar(0.9 + 0.1 * Math.max(0, n.z)), 2));
  // eyes (big, shiny), cheeks, a smile
  for (const s of [-1, 1]) {
    parts.push(fp(ball(0.075, s * 0.15, cy + 0.03, 0.37, 0, 0.9, 1.3, 0.5), DARK));
    parts.push(fp(gem(0.03, s * 0.15 - 0.025, cy + 0.08, 0.405), WHITE));
    parts.push(fp(gem(0.065, s * 0.25, cy - 0.08, 0.31, 1, 0.6, 0.4), "#ff9fb5"));
  }
  parts.push(fp(box(0.1, 0.025, 0.03, 0, cy - 0.12, 0.4), "#b8505e"));
  // fin ears (the hair colour), fanned out and back
  for (const s of [-1, 1]) {
    const ear = flat([
      [0, 0.05],
      [0.2, 0.3],
      [0.3, 0.18],
      [0.34, 0.02],
      [0.26, -0.12],
      [0, -0.06],
    ]);
    place(ear, 0, 0, 0, 0, 1, 0, 0);
    ear.rotateY(-0.55);
    if (s < 0) ear.scale(-1, 1, 1);
    ear.translate(s * 0.37, cy + 0.02, -0.04);
    parts.push(fp(ear, (p) => col(WHITE).multiplyScalar(0.8 + 0.2 * Math.abs(Math.sin(p.y * 22))), 1));
  }
  // hair: a cap everyone has, then the style (variants)
  const cap = new THREE.SphereGeometry(0.445, low ? 7 : 9, 4, 0, Math.PI * 2, 0, 1.25);
  cap.rotateX(-0.35);
  cap.translate(0, cy + 0.02, -0.02);
  parts.push(fp(cap, (p, n) => col(WHITE).multiplyScalar(0.85 + 0.15 * Math.max(0, n.y)), 1));
  // bun + a starfish clip
  parts.push(fp(ball(0.17, 0, cy + 0.47, -0.08, 0), col(WHITE).multiplyScalar(0.92), 1, HAIR_BUN));
  const star: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 0.045 : 0.1;
    star.push([Math.sin(a) * r, Math.cos(a) * r]);
  }
  parts.push(fp(place(flat(star), 0.2, cy + 0.4, 0.14, 0.6), "#ffd24a", 0, HAIR_BUN));
  // seaweed waves down the back + a forehead curl
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.17;
    let prev = v3(x, cy + 0.2, -0.36);
    for (let k = 1; k <= 2; k++) {
      const p = v3(x + Math.sin(k * 1.7 + i) * 0.06, cy + 0.2 - k * 0.24, -0.38 - k * 0.04);
      parts.push(fp(stick(prev, p, 0.11, 0.07), col(WHITE).multiplyScalar(0.85), 1, HAIR_WAVES));
      prev = p;
    }
  }
  parts.push(fp(gem(0.1, 0.08, cy + 0.36, 0.33, 1.2, 0.8, 0.6), col(WHITE).multiplyScalar(0.9), 1, HAIR_WAVES));
  // a fin crest from brow to nape
  const crest = flat([
    [0.3, 0],
    [0.18, 0.28],
    [0.02, 0.2],
    [-0.12, 0.3],
    [-0.3, 0.12],
    [-0.36, -0.05],
  ]);
  crest.rotateY(Math.PI / 2);
  crest.translate(0, cy + 0.38, 0.0);
  parts.push(fp(crest, (p) => col(WHITE).multiplyScalar(0.78 + 0.22 * Math.abs(Math.sin(p.z * 18))), 1, HAIR_CREST));
  // the elder: a big bun and a tiara of shells
  parts.push(fp(ball(0.2, 0, cy + 0.44, -0.14, 0), col(WHITE).multiplyScalar(0.95), 1, HAIR_ELDER));
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 0.45;
    parts.push(fp(place(new THREE.ConeGeometry(0.06, 0.16, 5), Math.sin(a) * 0.36, cy + 0.33, Math.cos(a) * 0.3), ["#ffc2d9", "#fff0c2", "#c9e8ff"][i], 0, HAIR_ELDER, 0.4));
  }
  return mergeAll(parts);
}

export const LIMB_ARM = 0;
export const LIMB_LEG = 1;

/** limbs: origin at the shoulder / hip joint, hanging down -y */
export function buildLimb(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(fp(cyl(0.085, 0.078, 0.27, 6, 0, -0.26, 0, true), col(WHITE).multiplyScalar(0.92), 1, LIMB_ARM));
  parts.push(fp(cyl(0.07, 0.064, 0.18, 6, 0, -0.43, 0, true), WHITE, 2, LIMB_ARM));
  parts.push(fp(gem(0.095, 0, HAND_Y, 0.01, 1, 0.9, 1), WHITE, 2, LIMB_ARM));
  parts.push(fp(cyl(0.115, 0.11, 0.21, 6, 0, -0.2, 0, true), col(WHITE).multiplyScalar(0.8), 1, LIMB_LEG));
  parts.push(fp(cyl(0.085, 0.08, 0.31, 6, 0, -0.5, 0, true), WHITE, 2, LIMB_LEG));
  // a flipper foot
  const foot = new THREE.BoxGeometry(0.17, 0.06, 0.3, 1, 1, 1);
  const pos = foot.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > 0) pos.setX(i, pos.getX(i) * 1.6);
  parts.push(fp(place(foot, 0, -0.5, 0.08), col(WHITE).multiplyScalar(0.8), 2, LIMB_LEG));
  return mergeAll(parts);
}

export const WING_SPRITE = 0;
export const WING_GULL = 1;

/** wings: origin at the root, spreading along +x (mirror with a negative x scale) */
export function buildWing(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const upper = flat([
    [0, 0],
    [0.14, 0.2],
    [0.34, 0.38],
    [0.46, 0.36],
    [0.44, 0.2],
    [0.2, 0.02],
  ]);
  const lower = flat([
    [0, -0.02],
    [0.26, -0.1],
    [0.32, -0.22],
    [0.18, -0.22],
    [0.05, -0.1],
  ]);
  for (const g of [upper, lower]) parts.push(fp(g, (p) => col(WHITE).multiplyScalar(0.8 + 0.3 * Math.min(1, Math.hypot(p.x, p.y) * 2)), 1, WING_SPRITE, 0.7));
  // a gull's wing lies flat (XZ), grey with a dark tip
  const gw = flat([
    [0, 0.12],
    [0.3, 0.14],
    [0.62, 0.02],
    [0.72, -0.06],
    [0.4, -0.08],
    [0, -0.12],
  ]);
  gw.rotateX(Math.PI / 2);
  parts.push(fp(gw, (p) => col(p.x > 0.55 ? "#3a3a44" : p.x > 0.3 ? "#c8cdd6" : "#e8ecf2"), 0, WING_GULL));
  return mergeAll(parts);
}

export const TOOL_IDS = { none: 0, rod: 1, broom: 2, drum: 3, flute: 4, tray: 5, pole: 6, hoe: 7, basket: 8, rope: 9 } as const;

/**
 * Tools. "Hand" tools are built in the right hand's frame (the arm hangs along -y from the
 * shoulder; the grip is at the hand), "body" tools in the body's frame (hips at the origin).
 */
export function buildTools(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const T = TOOL_IDS;
  const h = HAND_Y;
  // fishing rod: out forward from the fist, a line down to a red-and-white float
  const tip = v3(0, h - 0.95, 2.1);
  parts.push(fp(stick(v3(0, h + 0.12, -0.25), tip, 0.05), "#8a5a36", 0, T.rod));
  parts.push(fp(stick(tip, v3(0, h - 2.6, 2.3), 0.015), "#f4f4f4", 0, T.rod));
  parts.push(fp(gem(0.08, 0, h - 2.62, 2.3), "#ff5050", 0, T.rod));
  // broom
  parts.push(fp(stick(v3(0, h + 0.35, 0), v3(0, h - 0.75, 0.08), 0.05), "#b88a52", 0, T.broom));
  parts.push(fp(place(new THREE.ConeGeometry(0.2, 0.45, 6), 0, h - 0.95, 0.1, 0, v3(1, 1, 0.5)), "#e8c46a", 0, T.broom));
  // drum (body frame: stands in front of a sitting drummer)
  parts.push(fp(cyl(0.26, 0.22, 0.5, 7, 0, -0.1, 0.52, true), (p) => (Math.abs(Math.sin(Math.atan2(p.x, p.z - 0.52) * 4)) > 0.6 ? col("#ff6b6b") : col("#ffcf4a")), 0, T.drum));
  parts.push(fp(cyl(0.27, 0.27, 0.05, 7, 0, 0.4, 0.52), "#fff3dd", 0, T.drum));
  parts.push(fp(cyl(0.2, 0.18, 0.36, 6, 0.45, -0.1, 0.4, true), "#4fc3a1", 0, T.drum));
  parts.push(fp(cyl(0.21, 0.21, 0.05, 6, 0.45, 0.26, 0.4), "#fff3dd", 0, T.drum));
  // flute (body frame: held at the mouth, out to the right)
  parts.push(fp(stick(v3(-0.05, NECK + 0.22, 0.42), v3(0.5, NECK + 0.14, 0.36), 0.05), "#e8c46a", 0, T.flute));
  // tray of buns (body frame: carried in front)
  parts.push(fp(box(0.62, 0.05, 0.42, 0, 0.32, 0.5), "#b88a52", 0, T.tray));
  for (let i = 0; i < 6; i++) parts.push(fp(gem(0.09, -0.2 + (i % 3) * 0.2, 0.39, 0.4 + Math.floor(i / 3) * 0.2, 1.2, 0.7, 1), "#e0a050", 0, T.tray));
  // lantern pole (body frame: held upright at the right side, a little flame on top)
  parts.push(fp(stick(v3(0.36, -0.2, 0.14), v3(0.36, 2.1, 0.14), 0.05), "#8a5a36", 0, T.pole));
  parts.push(fp(gem(0.1, 0.36, 2.18, 0.14, 0.8, 1.4, 0.8), "#ffb14a", 0, T.pole, 1.6));
  // hoe
  parts.push(fp(stick(v3(0, h + 0.3, 0), v3(0, h - 0.7, 0.05), 0.045), "#b88a52", 0, T.hoe));
  parts.push(fp(box(0.24, 0.05, 0.2, 0, h - 0.72, 0.14), "#8a8f9a", 0, T.hoe));
  // basket (hangs from the hand)
  parts.push(fp(cyl(0.2, 0.15, 0.24, 6, 0, h - 0.38, 0.02), (p) => (Math.sin(p.y * 40) > 0 ? col("#c9955c") : col("#a8743f")), 0, T.basket));
  parts.push(fp(new THREE.TorusGeometry(0.16, 0.02, 3, 5, Math.PI).translate(0, h - 0.14, 0.02), "#a8743f", 0, T.basket));
  for (let i = 0; i < 3; i++) parts.push(fp(gem(0.08, -0.08 + i * 0.08, h - 0.12, 0.02 + (i % 2) * 0.05), ["#ff7a3c", "#8fdc4a", "#ffd23c"][i], 0, T.basket));
  // skipping rope: an arc from x = -1 to 1, bowing down to y = -1 (stretched between the turners)
  let prev = v3(-1, 0, 0);
  for (let k = 1; k <= 7; k++) {
    const u = k / 7;
    const p = v3(-1 + 2 * u, -Math.sin(u * Math.PI), 0);
    parts.push(fp(stick(prev, p, 0.03), "#ff6fa8", 0, T.rope));
    prev = p;
  }
  return mergeAll(parts);
}

/** which tools hang from the right hand (else they're carried in the body frame) */
export const HAND_TOOLS = new Set<number>([TOOL_IDS.rod, TOOL_IDS.broom, TOOL_IDS.hoe, TOOL_IDS.basket]);

// ── critters ──

/** a little crab, ~0.55 m across at scale 1, sideways-walking along x */
export function buildCrab(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(fp(lump(0.26, 0, 0.2, 0, 3, 1.25, 0.55, 0.95, 0.12), (p, n) => col(WHITE).multiplyScalar(0.78 + 0.22 * Math.max(0, n.y)), 1));
  for (const s of [-1, 1]) {
    parts.push(fp(stick(v3(s * 0.08, 0.26, 0.18), v3(s * 0.1, 0.42, 0.2), 0.03), "#ffb0a0"));
    parts.push(fp(gem(0.055, s * 0.1, 0.45, 0.2), WHITE));
    parts.push(fp(gem(0.03, s * 0.1, 0.46, 0.245), DARK));
    // claws
    parts.push(fp(stick(v3(s * 0.26, 0.2, 0.12), v3(s * 0.38, 0.28, 0.3), 0.06), col(WHITE).multiplyScalar(0.85), 1));
    parts.push(fp(gem(0.11, s * 0.4, 0.3, 0.34, 1, 0.7, 1.2), col(WHITE).multiplyScalar(0.9), 1));
    for (let k = 0; k < 3; k++) parts.push(fp(stick(v3(s * 0.22, 0.16, -0.12 + k * 0.1), v3(s * 0.42, 0.0, -0.16 + k * 0.12), 0.03), col(WHITE).multiplyScalar(0.7), 1));
  }
  return mergeAll(parts);
}

/** a bubblepup: a round little seal-pup with a glowing bubble on its nose, facing +z */
export function buildPup(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // a long, plump seal body with the head as its front end (no neck: a seal pup)
  parts.push(fp(ball(0.34, 0, 0.3, -0.12, 1, 1.05, 0.82, 1.6), (p, n) => col(WHITE).multiplyScalar(0.84 + 0.16 * Math.max(0, n.y)), 1));
  parts.push(fp(ball(0.27, 0, 0.42, 0.32, 1, 1, 0.95, 1.05), (p, n) => col(WHITE).multiplyScalar(0.9 + 0.1 * Math.max(0, n.z)), 1));
  parts.push(fp(ball(0.12, 0, 0.36, 0.54, 0, 1.25, 0.75, 0.8), "#fff6f0"));
  parts.push(fp(gem(0.045, 0, 0.42, 0.63), DARK));
  for (const s of [-1, 1]) {
    parts.push(fp(ball(0.06, s * 0.12, 0.51, 0.52, 0, 1, 1.2, 0.6), DARK));
    parts.push(fp(gem(0.022, s * 0.12 - 0.015, 0.54, 0.555), WHITE));
    const fl = flat([
      [0, 0],
      [0.26, -0.12],
      [0.1, -0.2],
    ]);
    fl.rotateX(Math.PI / 2);
    if (s < 0) fl.scale(-1, 1, 1);
    parts.push(fp(place(fl, s * 0.22, 0.1, 0.2), col(WHITE).multiplyScalar(0.75), 1));
  }
  const tail = flat([
    [0, 0],
    [0.2, -0.16],
    [0, -0.08],
    [-0.2, -0.16],
  ]);
  tail.rotateX(Math.PI / 2);
  parts.push(fp(place(tail, 0, 0.12, -0.45), col(WHITE).multiplyScalar(0.75), 1));
  // the bubble
  parts.push(fp(ball(0.1, 0, 0.74, 0.66, 1), "#bff6ff", 0, -1, 1.4));
  return mergeAll(parts);
}

/** a gull's body (the wings are separate, in the wing mesh), facing +z */
export function buildGull(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(fp(ball(0.16, 0, 0, 0, 0, 0.8, 0.75, 1.7), (p, n) => col(n.y > 0.5 ? "#d4d9e2" : WHITE)));
  parts.push(fp(ball(0.1, 0, 0.1, 0.22), WHITE));
  parts.push(fp(place(new THREE.ConeGeometry(0.035, 0.14, 4), 0, 0.09, 0.34, 0, 1, Math.PI / 2), "#ffc23c"));
  parts.push(fp(ball(0.018, 0.05, 0.13, 0.28), DARK));
  parts.push(fp(ball(0.018, -0.05, 0.13, 0.28), DARK));
  parts.push(fp(flat([[0, 0], [0.08, -0.18], [-0.08, -0.18]]).rotateX(Math.PI / 2).translate(0, 0.02, -0.25), "#c8cdd6"));
  for (const s of [-1, 1]) parts.push(fp(stick(v3(s * 0.05, -0.08, 0), v3(s * 0.05, -0.2, 0.02), 0.025), "#ff9a3c"));
  return mergeAll(parts);
}

/** an outrigger canoe with a crab-claw sail and a Tidewing sailor, waterline y = 0, bow +z.
 *  Hull = instance colour, sail = aColB. */
export function buildCanoe(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // a closed dugout body: round below, nearly flat on top, tapering to raised ends
  const hull = new THREE.CylinderGeometry(0.5, 0.5, 4.2, 8, 4, false);
  hull.rotateX(Math.PI / 2);
  const pos = hull.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const k = 1 - Math.pow(Math.abs(z) / 2.1, 2.5) * 0.9;
    let y = pos.getY(i);
    y = y > 0 ? y * 0.3 : y * 1.4;
    pos.setX(i, pos.getX(i) * k);
    pos.setY(i, y * Math.max(0.5, k) + (Math.abs(z) > 1.7 ? (Math.abs(z) - 1.7) * 0.6 : 0));
  }
  hull.translate(0, 0.38, 0);
  parts.push(fp(hull, (p, n) => (n.y > 0.6 ? col("#b07c48") : col(WHITE).multiplyScalar(0.8 + 0.2 * Math.max(0, n.y + 0.5))), 1));
  // a pale waterline stripe
  parts.push(fp(place(new THREE.CylinderGeometry(0.515, 0.515, 3.0, 8, 1, true).rotateX(Math.PI / 2), 0, 0.18, 0, 0, v3(1, 0.22, 1)), "#fff6e6"));
  parts.push(fp(box(0.7, 0.04, 3.2, 0, 0.46, 0), "#c9955c"));
  // the outrigger: a float on two booms
  parts.push(fp(place(new THREE.CylinderGeometry(0.13, 0.13, 2.6, 6).rotateX(Math.PI / 2), 1.7, 0.08, 0), "#e8d8b8"));
  for (const z of [-0.8, 0.8]) parts.push(fp(stick(v3(0, 0.55, z), v3(1.7, 0.18, z), 0.07), "#8a5a36"));
  // mast and crab-claw sail
  parts.push(fp(stick(v3(0, 0.45, 0.6), v3(0, 3.8, 0.3), 0.07), "#8a5a36"));
  const sail = flat([
    [0, 0],
    [0.3, 1.2],
    [0.2, 2.6],
    [-0.35, 3.2],
    [-0.1, 2.0],
    [-0.6, 0.5],
  ]);
  sail.rotateY(Math.PI / 2);
  parts.push(fp(place(sail, 0.03, 0.75, 0.55, 0, 1, -0.25), (p) => col(WHITE).multiplyScalar(Math.floor(p.y * 2.2) % 2 ? 1 : 0.8), 2));
  // the sailor (a little seated Tidewing in a sunhat)
  parts.push(fp(cyl(0.2, 0.24, 0.45, 7, 0, 0.48, -0.9), "#ff9ecb"));
  parts.push(fp(ball(0.26, 0, 1.16, -0.9, 1), "#9fe3e0"));
  parts.push(fp(cyl(0.38, 0.38, 0.05, 8, 0, 1.36, -0.9), "#ffe08a"));
  parts.push(fp(cyl(0.18, 0.22, 0.2, 8, 0, 1.38, -0.9), "#ffe08a"));
  parts.push(fp(gem(0.045, -0.1, 1.18, -0.66), DARK));
  parts.push(fp(gem(0.045, 0.1, 1.18, -0.66), DARK));
  parts.push(fp(stick(v3(0.2, 0.73, -0.8), v3(0.55, 0.1, -0.2), 0.05), "#b88a52"));
  return mergeAll(parts);
}
