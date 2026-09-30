// Frostpeak Isle's things, as chunky faceted storybook models in the fantasy kit's layout (so they
// share its wind sway and night glow), all merged into ONE mesh: snow-block igloos round a campfire,
// the little red research station with its radio mast and satellite dish, snowy pines, snow-capped
// rocks, glowing ice crystals, a snowman, a sled, lamps, flags and signs, the lookout's telescope,
// the blue ice cave — plus the three icy slide chutes with their start arches, the ice floes and
// the icebergs (their underwater parts too).
import * as THREE from "three";
import {
  FROST_BERGS,
  FROST_CAVE,
  FROST_FLOES,
  FROST_ISLAND,
  FROST_PROPS,
  FROST_SLIDES,
  FROST_WATER_Y,
  SLIDE_FLOOR,
  SLIDE_HALF,
  frostFloeR,
  frostRng,
  frostSlideSplash,
  type FrostProp,
} from "../../registry/frostIsland";
import { ball, box, col, cone, cyl, gem, lump, mergeAll, place, pp, stick, v3, type Fx } from "../village/kit";

const X0 = FROST_ISLAND.x;
const Z0 = FROST_ISLAND.z;
const _c = new THREE.Color();
const SNOW = col("#f4f8ff");
const SNOW_S = col("#dfe9f7");
const ICE = col("#a8e2ff");
const ICE_D = col("#6cbcef");
const ICE_L = col("#d6f2ff");
const WOOD = "#9b6a40";
const WOOD_D = "#6e4a2c";
const PINE = ["#2f6f5c", "#3d7d63", "#2a6158"];
const ROCKC = ["#6f7888", "#7d8697", "#646d7d"];
const NONE: Fx = [0, 0, 0];

/** colour faces that look up white (snow lying on things), the rest `base` */
const snowy = (base: string | THREE.Color, k = 0.55) => (_p: THREE.Vector3, n: THREE.Vector3) => (n.y > k ? SNOW : typeof base === "string" ? _c.set(base) : base);

// ── camp + station ──

/** a snow-block igloo, door (entrance tunnel) on +z, standing on y = 0 */
function igloo(seed: number, low: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const seg = low ? 10 : 14;
  const rings = low ? 4 : 6;
  const R = 2.4;
  // the dome: stacked rings of snow blocks (alternate faces a touch bluer, like block joints)
  const dome = new THREE.SphereGeometry(R, seg, rings, 0, Math.PI * 2, 0, Math.PI / 2);
  parts.push(
    pp(dome, (p) => {
      const row = Math.floor((Math.asin(Math.min(1, p.y / R)) / (Math.PI / 2)) * rings);
      const colK = Math.floor(((Math.atan2(p.x, p.z) + Math.PI) / (Math.PI * 2)) * seg * 0.5 + row * 0.5);
      return (row + colK + seed) % 3 === 0 ? SNOW_S : SNOW;
    }),
  );
  // the entrance tunnel (a half-cylinder) with a dark doorway that glows warm at night
  const tun = new THREE.CylinderGeometry(0.95, 0.95, 1.7, low ? 6 : 8, 1, true, -Math.PI / 2, Math.PI);
  tun.rotateX(-Math.PI / 2);
  parts.push(pp(place(tun, 0, 0, R - 0.1), SNOW));
  const door = new THREE.CircleGeometry(0.72, low ? 6 : 8, 0, Math.PI);
  parts.push(pp(place(door, 0, 0.02, R + 0.72), "#ffcf7a", [0, 0, 1.1]));
  // a little chimney-hole and a pennant on top
  parts.push(pp(cyl(0.18, 0.22, 0.25, 6, 0, R - 0.1, 0), SNOW_S));
  parts.push(pp(stick(v3(0.6, R * 0.8, -0.5), v3(0.6, R * 0.8 + 1.4, -0.5), 0.05), WOOD_D));
  parts.push(pp(place(new THREE.PlaneGeometry(0.6, 0.35), 0.9, R * 0.8 + 1.2, -0.5), ["#ff6b6b", "#ffcf4a", "#4fc3a1"][seed % 3], [0, 1, 0]));
  return parts;
}

/** the little red research station: door on +z, a snowy gable roof, radio mast, dish, weather vane */
function hut(low: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const RED = "#d9483b";
  // on stilts over the snow, with steps up to the door
  for (const [x, z] of [
    [-2.3, -1.7],
    [2.3, -1.7],
    [-2.3, 1.7],
    [2.3, 1.7],
  ])
    parts.push(pp(box(0.25, 0.7, 0.25, x, 0.35, z), WOOD_D));
  parts.push(pp(box(5.2, 0.25, 4, 0, 0.8, 0), WOOD));
  parts.push(pp(box(4.8, 2.4, 3.6, 0, 2.1, 0), (p, n) => (Math.abs(n.y) > 0.5 ? RED : Math.abs(p.y - 2.1) < 0.12 ? "#fff4ea" : RED)));
  // white trim at the corners
  for (const [x, z] of [
    [-2.4, -1.8],
    [2.4, -1.8],
    [-2.4, 1.8],
    [2.4, 1.8],
  ])
    parts.push(pp(box(0.16, 2.45, 0.16, x, 2.1, z), "#fff4ea"));
  // the roof: two slabs, snow on top
  for (const sd of [-1, 1]) {
    const slab = box(5.6, 0.22, 2.35, 0, 0, 0);
    slab.rotateX(sd * 0.5);
    parts.push(pp(place(slab, 0, 3.85, sd * 1.02), snowy("#8c3a32", 0.3)));
  }
  parts.push(pp(box(5.6, 0.3, 0.3, 0, 4.4, 0), SNOW));
  // gable ends
  const gable = new THREE.BufferGeometry();
  gable.setAttribute("position", new THREE.Float32BufferAttribute([-1.9, 0, 0, 1.9, 0, 0, 0, 1.1, 0], 3));
  for (const sx of [-2.4, 2.4]) {
    const g = gable.clone();
    g.rotateY(Math.PI / 2);
    g.translate(sx, 3.3, 0);
    parts.push(pp(g, "#fff4ea"));
    const g2 = gable.clone();
    g2.rotateY(-Math.PI / 2);
    g2.translate(sx, 3.3, 0);
    parts.push(pp(g2, "#fff4ea"));
  }
  gable.dispose();
  // the door, windows (warm glow at night), steps
  parts.push(pp(box(1.0, 1.8, 0.12, -1.0, 1.85, 1.82), "#3a4a66"));
  parts.push(pp(box(0.12, 0.12, 0.06, -0.62, 1.85, 1.9), "#ffd35a"));
  for (const x of [0.9]) parts.push(pp(box(1.1, 0.8, 0.1, x, 2.3, 1.82), "#ffd98a", [0, 0, 1]));
  parts.push(pp(box(0.1, 0.8, 1.1, 2.42, 2.3, 0), "#ffd98a", [0, 0, 1]));
  parts.push(pp(box(0.1, 0.8, 1.1, -2.42, 2.3, 0), "#ffd98a", [0, 0, 1]));
  for (let i = 0; i < 3; i++) parts.push(pp(box(1.2, 0.14, 0.45, -1.0, 0.15 + i * 0.25, 2.55 + (2 - i) * 0.4), WOOD));
  // the radio mast (red and white bands) with a blinking tip
  for (let i = 0; i < 6; i++) parts.push(pp(cyl(0.09, 0.1, 1.0, 5, 1.6, 4.3 + i, -0.8), i % 2 ? "#ffffff" : "#e0503c"));
  parts.push(pp(ball(0.18, 1.6, 10.4, -0.8), "#ff4a4a", [0, 0, 1.4]));
  // the satellite dish
  const dish = new THREE.SphereGeometry(0.85, low ? 8 : 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.42);
  dish.rotateX(-1.1);
  parts.push(pp(place(dish, -1.4, 4.9, -0.6), "#eef2f8"));
  parts.push(pp(stick(v3(-1.4, 4.2, -0.6), v3(-1.4, 4.9, -0.6), 0.1), "#9aa4b4"));
  // a weather vane (cups on a cross)
  parts.push(pp(stick(v3(-2.0, 4.4, 1.2), v3(-2.0, 5.6, 1.2), 0.06), "#9aa4b4"));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    parts.push(pp(ball(0.13, -2.0 + Math.sin(a) * 0.4, 5.6, 1.2 + Math.cos(a) * 0.4, 0, 1, 0.8, 1), "#ffcf4a", [0, 1, 0]));
  }
  return parts;
}

function snowman(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(lump(0.75, 0, 0.62, 0, 3, 1, 0.9, 1, 0.06, 1), SNOW));
  parts.push(pp(lump(0.55, 0, 1.55, 0, 4, 1, 0.95, 1, 0.06, 1), SNOW));
  parts.push(pp(lump(0.4, 0, 2.28, 0, 5, 1, 1, 1, 0.05, 1), SNOW));
  // a carrot nose, coal eyes and buttons, a red scarf, stick arms, a bobble hat
  const nose = new THREE.ConeGeometry(0.08, 0.45, 5);
  nose.rotateX(Math.PI / 2);
  parts.push(pp(place(nose, 0, 2.28, 0.58), "#ff8a2a"));
  for (const x of [-0.14, 0.14]) parts.push(pp(gem(0.055, x, 2.42, 0.36), "#2a2a33"));
  for (const y of [1.45, 1.7]) parts.push(pp(gem(0.07, 0, y, 0.54), "#2a2a33"));
  parts.push(pp(cyl(0.46, 0.5, 0.18, 8, 0, 1.92, 0), "#e04848"));
  parts.push(pp(box(0.18, 0.5, 0.06, 0.25, 1.62, 0.44), "#e04848"));
  parts.push(pp(stick(v3(0.45, 1.6, 0), v3(1.2, 2.05, 0.1), 0.06), WOOD_D));
  parts.push(pp(stick(v3(-0.45, 1.6, 0), v3(-1.15, 1.95, -0.1), 0.06), WOOD_D));
  parts.push(pp(cone(0.36, 0.5, 8, 0, 2.52, 0), "#4f7bff"));
  parts.push(pp(ball(0.12, 0, 3.05, 0), "#ffffff"));
  return parts;
}

function sled(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(box(0.9, 0.12, 2.0, 0, 0.38, 0), "#c8482c"));
  for (const x of [-0.42, 0.42]) {
    parts.push(pp(box(0.07, 0.07, 2.2, x, 0.05, -0.05), "#8a93a0"));
    parts.push(pp(stick(v3(x, 0.05, 1.05), v3(x, 0.4, 1.25), 0.07), "#8a93a0"));
    parts.push(pp(stick(v3(x, 0.05, -0.6), v3(x, 0.36, -0.6), 0.07), WOOD_D));
    parts.push(pp(stick(v3(x, 0.05, 0.6), v3(x, 0.36, 0.6), 0.07), WOOD_D));
  }
  parts.push(pp(box(0.7, 0.45, 0.6, 0, 0.66, -0.4), "#c9a36a"));
  parts.push(pp(box(0.55, 0.35, 0.5, 0.05, 0.62, 0.35), "#4fc3a1"));
  return parts;
}

function crates(v: number): THREE.BufferGeometry[] {
  const out = [pp(box(1.0, 0.9, 1.0, 0, 0.45, 0), snowy("#b88a55", 0.7)), pp(box(0.8, 0.7, 0.8, 0.2, 1.25, 0.1, 0.4), snowy("#c9a36a", 0.7))];
  if (v === 1) out.push(pp(cyl(0.4, 0.4, 1.0, 8, -0.95, 0, 0.2), snowy("#4f7bff", 0.7)));
  return out;
}

function lamp(): THREE.BufferGeometry[] {
  return [
    pp(cyl(0.08, 0.1, 2.2, 6), "#4a5568"),
    pp(box(0.42, 0.5, 0.42, 0, 2.2, 0), "#4a5568"),
    pp(box(0.32, 0.4, 0.32, 0, 2.25, 0), "#ffe08a", [0, 0, 1.3]),
    pp(cone(0.36, 0.3, 4, 0, 2.7, 0), SNOW),
  ];
}

const FLAG_COLS: [string, string][] = [
  ["#ff5a7a", "#ffffff"],
  ["#e0503c", "#ffffff"],
  ["#4f7bff", "#ffcf4a"],
];
function flag(v: number): THREE.BufferGeometry[] {
  const [a, b] = FLAG_COLS[v % FLAG_COLS.length];
  const h = v === 2 ? 3.2 : 4.2;
  const parts = [pp(cyl(0.06, 0.07, h, 5), "#cfd6e2"), pp(ball(0.12, 0, h + 0.05, 0), "#ffcf4a")];
  const cloth = new THREE.PlaneGeometry(1.5, 0.9, 3, 1);
  parts.push(
    pp(
      place(cloth, 0.78, h - 0.55, 0),
      (p) => (Math.floor((p.x - 0.03) / 0.5) % 2 === 0 ? a : b),
      (p) => [0, Math.max(0, p.x - 0.1) * 0.9, 0],
    ),
  );
  return parts;
}

const SIGN_COLS = ["#4fc3f7", "#ffcf4a", "#b3e5fc", "#b07ce8"];
function sign(v: number): THREE.BufferGeometry[] {
  return [
    pp(box(0.14, 1.5, 0.14, 0, 0.75, 0), WOOD_D),
    pp(box(1.3, 0.7, 0.1, 0, 1.4, 0.08), snowy(SIGN_COLS[v % SIGN_COLS.length], 0.8)),
    pp(box(1.4, 0.1, 0.18, 0, 1.8, 0.08), SNOW),
    // a little penguin painted on it: a dark egg with a white face
    pp(ball(0.16, -0.3, 1.4, 0.15, 0, 0.8, 1.1, 0.3), "#2a2f3a"),
    pp(ball(0.1, -0.3, 1.37, 0.19, 0, 0.8, 1, 0.3), "#ffffff"),
  ];
}

function telescope(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    parts.push(pp(stick(v3(Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5), v3(0, 1.2, 0), 0.06), WOOD_D));
  }
  const tube = new THREE.CylinderGeometry(0.1, 0.16, 1.3, 8);
  tube.rotateX(Math.PI / 2 - 0.45);
  parts.push(pp(place(tube, 0, 1.4, 0.1), "#d4a23c"));
  return parts;
}

function fire(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    parts.push(pp(lump(0.26, Math.sin(a) * 0.75, 0.12, Math.cos(a) * 0.75, k, 1, 0.7, 1, 0.2), "#7d8697"));
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    parts.push(pp(stick(v3(Math.sin(a) * 0.5, 0.08, Math.cos(a) * 0.5), v3(-Math.sin(a) * 0.5, 0.18, -Math.cos(a) * 0.5), 0.14), WOOD));
  }
  // flames (they flicker in the wind sway)
  parts.push(pp(cone(0.36, 0.95, 5, 0, 0.12, 0), "#ffb13d", [0, 0.7, 1.4]));
  parts.push(pp(cone(0.2, 0.6, 5, 0.1, 0.12, 0.05), "#fff07a", [0, 0.9, 1.6]));
  return parts;
}

function fishhole(): THREE.BufferGeometry[] {
  const hole = new THREE.CircleGeometry(0.6, 8);
  hole.rotateX(-Math.PI / 2);
  return [
    pp(place(hole, 0, 0.04, 0), "#1d3f6b"),
    pp(stick(v3(0.9, 0.05, 0.2), v3(0.2, 1.1, 0.05), 0.05), WOOD_D),
    pp(stick(v3(0.2, 1.1, 0.05), v3(0.05, 0.05, 0.05), 0.01), "#e8e8e8"),
    pp(cyl(0.25, 0.2, 0.4, 7, 1.1, 0, -0.6), "#4f7bff"),
  ];
}

const GATE_COLS = ["#ff5a7a", "#ffcf4a", "#4fc3a1"];
function slidegate(v: number): THREE.BufferGeometry[] {
  // an arch of ice blocks over the chute's start, with a coloured banner
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k++) parts.push(pp(box(0.5, 0.55, 0.5, sx * 1.6, 0.28 + k * 0.56, 0, k * 0.2), k % 2 ? ICE : ICE_L));
    parts.push(pp(gem(0.28, sx * 1.6, 2.6, 0, 1, 1.6, 1), ICE_D, [0, 0, 0.6]));
  }
  parts.push(pp(box(3.8, 0.55, 0.3, 0, 2.3, 0), GATE_COLS[v % GATE_COLS.length]));
  parts.push(pp(box(3.9, 0.14, 0.4, 0, 2.62, 0), SNOW));
  return parts;
}

/** a snowy pine: stacked cones, snow on every tier */
function pine(v: number, low: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const seg = low ? 6 : 7;
  const green = PINE[v % PINE.length];
  parts.push(pp(cyl(0.16, 0.22, 1.0, 5), WOOD_D));
  const tiers = low ? 3 : 4;
  for (let k = 0; k < tiers; k++) {
    const r = 1.35 - k * 0.3;
    const y = 0.7 + k * 0.95;
    parts.push(pp(cone(r, 1.55, seg, 0, y, 0), (p, n) => (n.y > 0.5 || p.y > y + 1.2 ? SNOW : green), (p) => [0, Math.max(0, p.y - 0.8) * 0.12, 0]));
  }
  return parts;
}

function rock(v: number, seed: number): THREE.BufferGeometry[] {
  return [pp(lump(0.9, 0, 0.35, 0, seed, 1.2, 0.8, 1, 0.3), snowy(ROCKC[v % ROCKC.length], 0.62))];
}

function crystal(seed: number): THREE.BufferGeometry[] {
  const rnd = frostRng(seed * 13 + 5);
  const parts: THREE.BufferGeometry[] = [];
  const n = 3 + Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) {
    const h = 0.8 + rnd() * 1.6;
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(0.22 + rnd() * 0.12, h * 0.5, 0.22 + rnd() * 0.12);
    const a = rnd() * Math.PI * 2;
    const r = k === 0 ? 0 : 0.35 + rnd() * 0.25;
    parts.push(pp(place(g, Math.sin(a) * r, h * 0.42, Math.cos(a) * r, rnd() * 3, 1, (rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.7), (_p, nn) => (nn.y > 0.3 ? ICE_L : k % 2 ? ICE : ICE_D), [0, 0, 0.55]));
  }
  return parts;
}

/** the ice cave: a lumpy dome of blue ice with an open front (+z), icicles and glowing crystals */
function cave(low: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const R = FROST_CAVE.r;
  const H = FROST_CAVE.h;
  const seg = low ? 14 : 20;
  const rings = low ? 5 : 7;
  // (a shell: the outside, and the inside turned inward, both with the doorway cut out)
  for (const inner of [false, true]) {
    const g = new THREE.SphereGeometry(1, seg, rings, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
    const pos = g.attributes.position as THREE.BufferAttribute;
    const keep: number[] = [];
    const rr = inner ? 0.86 : 1;
    for (let f = 0; f < pos.count; f += 3) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let k = 0; k < 3; k++) {
        cx += pos.getX(f + k) / 3;
        cy += pos.getY(f + k) / 3;
        cz += pos.getZ(f + k) / 3;
      }
      // the doorway: the front, low down
      if (cz > 0.62 && cy < 0.72) continue;
      for (let k = 0; k < 3; k++) {
        const kk = inner ? 2 - k : k;
        const x = pos.getX(f + kk);
        const y = pos.getY(f + kk);
        const z = pos.getZ(f + kk);
        const lumpK = 1 + Math.sin(x * 7 + z * 5) * 0.05 + Math.sin(y * 9 + x * 3) * 0.04;
        keep.push(x * R * rr * lumpK, y * H * rr * lumpK, z * R * rr * lumpK);
      }
    }
    g.dispose();
    const shell = new THREE.BufferGeometry();
    shell.setAttribute("position", new THREE.Float32BufferAttribute(keep, 3));
    parts.push(pp(shell, (p, n) => (!inner && n.y > 0.75 ? SNOW : Math.sin(p.y * 2.2 + p.x) > 0.3 ? ICE_L : inner ? ICE_D : ICE), inner ? [0, 0, 0.35] : NONE));
  }
  // the doorway's rim: chunky ice blocks, and icicles hanging from the lintel
  for (let k = 0; k <= 8; k++) {
    const a = -1 + (k / 8) * 2;
    const x = Math.sin(a) * R * 0.8;
    const y = Math.cos(a * 1.2) * H * 0.72;
    parts.push(pp(gem(0.55, x, Math.max(0.3, y), R * 0.8, 1.2, 1, 0.8), k % 2 ? ICE : ICE_L));
  }
  for (let k = 0; k < 7; k++) {
    const x = -2 + (k / 6) * 4;
    const ic = new THREE.ConeGeometry(0.12, 0.6 + (k % 3) * 0.3, 4);
    ic.rotateX(Math.PI);
    parts.push(pp(place(ic, x, H * 0.66 - 0.35, R * 0.78), ICE_L, [0, 0, 0.4]));
  }
  // glowing crystals inside
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 1.4 + 2.4;
    for (const g of crystal(k + 50)) parts.push(place(g, Math.sin(a) * R * 0.55, 0, Math.cos(a) * R * 0.55, a, 1.2));
  }
  return parts;
}

function buildProp(p: FrostProp, low: boolean): THREE.BufferGeometry[] {
  switch (p.kind) {
    case "igloo":
      return igloo(p.seed, low);
    case "hut":
      return hut(low);
    case "pine":
      return pine(p.v, low);
    case "rock":
      return rock(p.v, p.seed);
    case "crystal":
      return crystal(p.seed);
    case "snowman":
      return snowman();
    case "sled":
      return sled();
    case "lamp":
      return lamp();
    case "flag":
      return flag(p.v);
    case "sign":
      return sign(p.v);
    case "telescope":
      return telescope();
    case "cave":
      return cave(low);
    case "fishhole":
      return fishhole();
    case "crates":
      return crates(p.v);
    case "slidegate":
      return slidegate(p.v);
    case "fire":
      return fire();
  }
}

// ── hand-built strips (the chutes, the floes): triangles pushed with a facing hint, flat colours ──

class Strip {
  pos: number[] = [];
  cols: THREE.Color[] = [];
  /** a triangle, wound so its normal points along (hx, hy, hz) */
  tri(a: number[], b: number[], c: number[], color: THREE.Color, hx: number, hy: number, hz: number) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    if (nx * hx + ny * hy + nz * hz < 0) this.pos.push(...a, ...c, ...b);
    else this.pos.push(...a, ...b, ...c);
    this.cols.push(color);
  }
  quad(a: number[], b: number[], c: number[], d: number[], color: THREE.Color, hx: number, hy: number, hz: number) {
    this.tri(a, b, c, color, hx, hy, hz);
    this.tri(a, c, d, color, hx, hy, hz);
  }
  geometry(fx: Fx = NONE): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    let f = 0;
    const cols = this.cols;
    return pp(g, () => cols[Math.min(cols.length - 1, f++)], fx);
  }
}

// ── the slide chutes: an icy floor between two low walls, following each slide's path ──

function chuteGeometry(low: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (const [si, s] of FROST_SLIDES.entries()) {
    const P = s.path;
    const step = low ? 2 : 1;
    const st = new Strip();
    const floorC = col("#c4ecff");
    const stripeC = col("#e8f8ff");
    const wallC = col("#86cbf2");
    const wallC2 = col(["#ff9ab8", "#ffd97a", "#8fe3c8"][si]);
    type Ring = { c: number[]; l: number[]; r: number[]; lw: number[]; rw: number[]; lt: number[]; rt: number[]; lo: number[]; ro: number[]; nx: number; nz: number };
    let prev: Ring | null = null;
    // (the chute runs on a little way into the sea, its walls sinking away under the water)
    const splash = frostSlideSplash(s);
    const last = Math.min(P.length - 1, splash + 4);
    for (let i = 0; ; i += step) {
      const k = Math.min(last, i);
      const a = P[Math.max(0, k - 1)];
      const b = P[Math.min(P.length - 1, k + 1)];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const L = Math.hypot(dx, dz) || 1;
      // (n = the chute's left, looking downhill)
      const nx = dz / L;
      const nz = -dx / L;
      const p = P[k];
      const cx = p.x - X0;
      const cz = p.z - Z0;
      const y = p.y - SLIDE_FLOOR;
      const sink = Math.min(1, Math.max(0, (k - (splash - 3)) / 7));
      const wh = 0.5 - sink * 0.75;
      const half = SLIDE_HALF;
      const wt = 0.35;
      const at = (off: number, dy: number) => [cx + nx * off, y + dy, cz + nz * off];
      const ring: Ring = {
        c: at(0, SLIDE_FLOOR - 0.04),
        l: at(half, SLIDE_FLOOR + 0.1),
        r: at(-half, SLIDE_FLOOR + 0.1),
        lw: at(half, wh),
        rw: at(-half, wh),
        lt: at(half + wt, wh),
        rt: at(-half - wt, wh),
        lo: at(half + wt, -0.45),
        ro: at(-half - wt, -0.45),
        nx,
        nz,
      };
      if (prev) {
        const stripe = Math.floor(k / 3) % 2 === 0;
        const rim = Math.floor(k / 4) % 2 ? SNOW : wallC2;
        // the floor (dipping a little in the middle), inner walls, rims, outer walls
        st.quad(prev.l, ring.l, ring.c, prev.c, stripe ? stripeC : floorC, 0, 1, 0);
        st.quad(prev.c, ring.c, ring.r, prev.r, stripe ? floorC : stripeC, 0, 1, 0);
        st.quad(prev.lw, ring.lw, ring.l, prev.l, wallC, -nx, 0, -nz);
        st.quad(prev.r, ring.r, ring.rw, prev.rw, wallC, nx, 0, nz);
        st.quad(prev.lt, ring.lt, ring.lw, prev.lw, rim, 0, 1, 0);
        st.quad(prev.rw, ring.rw, ring.rt, prev.rt, rim, 0, 1, 0);
        st.quad(prev.lo, ring.lo, ring.lt, prev.lt, wallC, nx, 0, nz);
        st.quad(prev.rt, ring.rt, ring.ro, prev.ro, wallC, -nx, 0, -nz);
      }
      prev = ring;
      if (k === last) break;
    }
    parts.push(st.geometry());
    // a start pad on the terrace
    const s0 = P[0];
    const s1 = P[3];
    const rot = Math.atan2(s1.x - s0.x, s1.z - s0.z);
    parts.push(pp(place(box(2.9, 0.3, 2.2), s0.x - X0 - Math.sin(rot) * 0.9, s0.y - 0.1, s0.z - Z0 - Math.cos(rot) * 0.9, rot), ICE_L));
  }
  return parts;
}

// ── floes and bergs ──

function floeGeometry(low: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const st = new Strip();
  for (const f of FROST_FLOES) {
    const n = low ? 10 : 14;
    const top = f.top;
    const bot = FROST_WATER_Y - 0.75;
    const pts: [number, number][] = [];
    for (let k = 0; k < n; k++) {
      const b = (k / n) * Math.PI * 2;
      const r = frostFloeR(f, b);
      pts.push([f.x - X0 + Math.sin(b + f.rot) * r, f.z - Z0 + Math.cos(b + f.rot) * r]);
    }
    const cx = f.x - X0;
    const cz = f.z - Z0;
    for (let k = 0; k < n; k++) {
      const [ax, az] = pts[k];
      const [bx, bz] = pts[(k + 1) % n];
      const ox = (ax + bx) / 2 - cx;
      const oz = (az + bz) / 2 - cz;
      // top (a gentle dome of snow), a lip of snow, then the blue ice sides
      st.tri([cx, top + 0.12, cz], [bx, top, bz], [ax, top, az], SNOW, 0, 1, 0);
      st.quad([ax, top, az], [bx, top, bz], [bx, top - 0.22, bz], [ax, top - 0.22, az], SNOW_S, ox, 0, oz);
      st.quad([ax, top - 0.22, az], [bx, top - 0.22, bz], [bx, bot, bz], [ax, bot, az], (k + f.seed) % 3 ? ICE : ICE_L, ox, 0, oz);
    }
  }
  parts.push(st.geometry());
  for (const b of FROST_BERGS) {
    const rnd = frostRng(b.seed);
    // a craggy berg: a few stacked lumps, a spire, and the big hidden part under the water
    const bx = b.x - X0;
    const bz = b.z - Z0;
    const mk = (r: number, y: number, sy: number, ox: number, oz: number, seed: number, detail: number) =>
      pp(place(lump(r, 0, 0, 0, seed, 1, sy, 1, 0.32, detail), bx + ox, y, bz + oz, b.rot + rnd()), (p, nn) => (nn.y > 0.62 ? SNOW : p.y < FROST_WATER_Y ? ICE_D : Math.sin(p.y * 1.6 + p.x * 0.3) > 0.2 ? ICE : ICE_L));
    parts.push(mk(b.r * 1.05, FROST_WATER_Y - b.h * 0.25, b.h * 0.07, 0, 0, b.seed, low ? 0 : 1));
    parts.push(mk(b.r * 0.85, b.h * 0.32, b.h * 0.055, rnd() * 2 - 1, rnd() * 2 - 1, b.seed + 1, low ? 0 : 1));
    parts.push(mk(b.r * 0.5, b.h * 0.72, b.h * 0.07, (rnd() - 0.5) * b.r * 0.6, (rnd() - 0.5) * b.r * 0.6, b.seed + 2, 0));
    // the big hidden part
    parts.push(mk(b.r * 1.35, FROST_WATER_Y - b.h * 0.55, b.h * 0.075, 0, 0, b.seed + 3, 0));
  }
  return parts;
}

/** every prop, the chutes, floes and bergs: one geometry (island-local) */
export function buildPropsGeometry(low: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const p of FROST_PROPS) {
    if (low && p.kind === "crystal" && p.seed % 2) continue;
    for (const g of buildProp(p, low)) parts.push(place(g, p.x - X0, p.y, p.z - Z0, p.rot, p.s));
  }
  parts.push(...chuteGeometry(low));
  parts.push(...floeGeometry(low));
  return mergeAll(parts);
}
