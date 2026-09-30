// Coralcove Isle's things, as chunky faceted storybook models in the fantasy kit's layout (so
// they share its wind sway and night glow), all merged into ONE mesh: round huts with spiral
// shell roofs, stilt houses on the lagoon, the bakery and its clay oven, the red-and-white
// lighthouse, striped market stalls, palms, glowing moonfruit trees, coral trees, lanterns, washing
// lines, gardens, the fire circle, totems, nets, bunting — plus the jetty and the boardwalks.
import * as THREE from "three";
import {
  BAKERY_CHIMNEY,
  BAKERY_CHIMNEY_TOP,
  HUT_TOP,
  VILLAGE_DECKS,
  VILLAGE_ISLAND,
  VILLAGE_PROPS,
  villageGroundY,
  villageRng,
  villageSeaFloorY,
  type VillageDeck,
  type VillageProp,
} from "../../registry/villageIsland";
import { ball, box, col, cone, cyl, flat, gem, lump, mergeAll, place, pp, stick, v3, type Fx } from "./kit";

const X0 = VILLAGE_ISLAND.x;
const Z0 = VILLAGE_ISLAND.z;
const _c = new THREE.Color();
const NONE: Fx = [0, 0, 0];

// palettes
const WALLS = ["#fff1d6", "#ffd9c9", "#d6f2e4", "#e6dcff", "#fff4b0"];
const ROOFS: [string, string][] = [
  ["#ff8fb0", "#fff3ea"],
  ["#3fc4c0", "#f4fffb"],
  ["#ffc34d", "#ff8a6a"],
  ["#b08cf0", "#fbf4ff"],
  ["#7ad67a", "#fff0c8"],
];
const WOOD = "#9b6a40";
const WOOD_D = "#6e4a2c";
const STONE = "#c9b8a0";
const CLOTH = ["#ff6b6b", "#ffcf4a", "#4fc3a1", "#6a8cff", "#ff9ecb", "#b07ce8"];

const shade = (hex: string, k: number) => _c.set(hex).multiplyScalar(k).clone();

// ── houses ──

/** a round hut with a spiral conch-shell roof, door on +z, standing on y = 0 (roof tip ~HUT_TOP) */
function hut(v: number, seed: number, low: boolean): THREE.BufferGeometry[] {
  const wall = WALLS[v % WALLS.length];
  const [ra, rb] = ROOFS[(v + 1) % ROOFS.length];
  const seg = low ? 8 : 10;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(cyl(2.5, 2.6, 0.28, seg), STONE));
  parts.push(pp(cyl(2.2, 2.3, 2.1, seg, 0, 0.28, 0, true), (p, n) => shade(wall, 0.9 + 0.1 * Math.max(0, n.z) + (Math.sin(p.x * 3 + seed) > 0.6 ? -0.04 : 0))));
  parts.push(pp(cyl(2.32, 2.34, 0.34, seg, 0, 0.28, 0, true), shade(ROOFS[v % ROOFS.length][0], 0.85)));
  // door (an arched wooden door with a frame) and two round glowing windows
  parts.push(pp(box(0.95, 1.45, 0.2, 0, 0.28 + 0.72, 2.22), WOOD_D));
  const arch = new THREE.CylinderGeometry(0.475, 0.475, 0.2, 8, 1, false, -Math.PI / 2, Math.PI);
  arch.rotateX(Math.PI / 2);
  arch.rotateZ(Math.PI / 2);
  parts.push(pp(place(arch, 0, 1.73, 2.22), WOOD_D));
  parts.push(pp(box(1.15, 0.12, 0.26, 0, 0.34, 2.28), WOOD));
  for (const a of [-1.0, 1.05, Math.PI + 0.5]) {
    const f = new THREE.CylinderGeometry(0.36, 0.36, 0.12, 6);
    f.rotateX(Math.PI / 2);
    f.rotateY(a);
    parts.push(pp(place(f, Math.sin(a) * 2.2, 1.55, Math.cos(a) * 2.2), WOOD));
    const w = new THREE.CylinderGeometry(0.27, 0.27, 0.12, 6);
    w.rotateX(Math.PI / 2);
    w.rotateY(a);
    parts.push(pp(place(w, Math.sin(a) * 2.25, 1.55, Math.cos(a) * 2.25), "#ffd27a", [0, 0, 1]));
  }
  // the roof: a turban shell — three ribbed, stacked whorls, each twisted and nudged off-centre
  // so they spiral up to a curled tip, with a scalloped lip round each whorl
  const tiers: [number, number, number, number, number, number][] = [
    // r bottom, r top, y bottom, height, x offset, twist
    [2.95, 1.95, 2.38, 1.0, 0, 0],
    [2.15, 1.2, 3.22, 0.9, 0.12, 0.35],
    [1.35, 0.05, 3.98, 1.02, 0.22, 0.7],
  ];
  const segR = low ? 9 : 12;
  tiers.forEach(([rb0, rt0, y0, th, ox, tw], k) => {
    const g = new THREE.CylinderGeometry(rt0, rb0, th, segR, 1, true);
    g.rotateY(tw);
    g.translate(ox, y0 + th / 2, ox * 0.4);
    const main = k % 2 ? rb : ra;
    const other = k % 2 ? ra : rb;
    parts.push(
      pp(g, (p, n) => {
        const a = Math.atan2(p.x - ox, p.z - ox * 0.4) - tw;
        const rib = Math.floor(((a / (Math.PI * 2) + 1) % 1) * segR) % 2;
        return col(main).multiplyScalar((rib ? 0.9 : 1) * (0.9 + 0.1 * Math.max(0, n.y)));
      }),
    );
    // the scalloped lip, in the other colour
    const fr = k === 0 ? (low ? 8 : 11) : k === 1 && !low ? 8 : 0;
    for (let i = 0; i < fr; i++) {
      const a = (i / fr) * Math.PI * 2 + tw;
      parts.push(pp(place(new THREE.OctahedronGeometry(0.3 - k * 0.06, 0), ox + Math.sin(a) * (rb0 - 0.05), y0 - 0.02, ox * 0.4 + Math.cos(a) * (rb0 - 0.05), a, v3(1.15, 0.55, 0.5)), other));
    }
  });
  // underside of the eave (so you never see into it)
  const under = new THREE.CircleGeometry(2.95, segR);
  under.rotateX(Math.PI / 2);
  parts.push(pp(place(under, 0, 2.38, 0), shade(rb, 0.7)));
  // the curled tip
  const tip = new THREE.ConeGeometry(0.2, 0.7, 5);
  tip.translate(0, 0.35, 0);
  parts.push(pp(place(tip, 0.3, 4.85, 0.1, 0, 1, 0, -0.9), ra));
  // shells over the door, a flower pot
  for (let i = -1; i <= 1; i++) parts.push(pp(gem(0.12, i * 0.32, 2.05 - Math.abs(i) * 0.08, 2.33, 1, 0.8, 0.6), i === 0 ? "#ff9fb7" : "#fff2d8"));
  parts.push(pp(cyl(0.22, 0.17, 0.32, 6, 0.95, 0, 2.05, true), "#d9774e"));
  parts.push(pp(ball(0.28, 0.95, 0.52, 2.05, 0, 1, 0.8, 1), "#58b95a", [0, 0.4, 0]));
  parts.push(pp(gem(0.11, 0.95, 0.76, 2.14), "#ff6fa8", [0, 0.4, 0]));
  return parts;
}

function bakery(low: boolean): THREE.BufferGeometry[] {
  const parts = hut(4, 91, low).map((g) => place(g, 0, 0, 0, 0, 1.12));
  // the stone chimney, puffing away
  const cx = BAKERY_CHIMNEY.x;
  const cz = BAKERY_CHIMNEY.z;
  parts.push(pp(box(0.85, BAKERY_CHIMNEY_TOP - 1.6, 0.85, cx, 1.6 + (BAKERY_CHIMNEY_TOP - 1.6) / 2, cz), (p) => shade(STONE, 0.85 + 0.15 * Math.sin(p.y * 7))));
  parts.push(pp(box(1.0, 0.22, 1.0, cx, BAKERY_CHIMNEY_TOP - 0.1, cz), "#8f7f6d"));
  // an awning over the door and a big bun sign
  const aw = box(2.2, 0.08, 1.1, 0, 2.3, 2.9);
  aw.rotateX(0);
  parts.push(pp(place(aw, 0, 0, 0, 0, 1, 0.25, 0), (p) => (Math.floor((p.x + 5) * 2.2) % 2 ? col("#fff3e0") : col("#ff8a5c"))));
  parts.push(pp(stick(v3(-1.0, 0, 3.35), v3(-1.0, 2.2, 3.35), 0.08), WOOD));
  parts.push(pp(stick(v3(1.0, 0, 3.35), v3(1.0, 2.2, 3.35), 0.08), WOOD));
  parts.push(pp(ball(0.42, 1.55, 3.1, 2.4, 1, 1, 0.75, 0.45), "#e0a050"));
  parts.push(pp(ball(0.2, 1.55, 3.32, 2.55, 0, 1, 0.5, 0.4), "#fff0c0"));
  // loaves on a little shelf
  parts.push(pp(box(1.6, 0.1, 0.5, -1.4, 0.9, 2.55), WOOD));
  for (let i = 0; i < 4; i++) parts.push(pp(lump(0.17, -2.0 + i * 0.4, 1.05, 2.55, i + 3, 1.3, 0.8, 1), i % 2 ? "#d8913e" : "#c47a2f"));
  return parts;
}

function oven(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const dome = new THREE.SphereGeometry(1.0, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  parts.push(pp(place(dome, 0, 0.35, 0, 0, v3(1, 0.95, 1.1)), (p) => shade("#d98b5f", 0.85 + 0.15 * Math.sin(p.x * 5 + p.z * 3))));
  parts.push(pp(cyl(1.1, 1.15, 0.35, 9), STONE));
  // the mouth (glowing embers inside) and its brick arch
  parts.push(pp(box(0.62, 0.5, 0.3, 0, 0.62, 0.98), "#3a1f14"));
  parts.push(pp(box(0.5, 0.18, 0.2, 0, 0.44, 1.02), "#ff7a2a", [0, 0, 1.2]));
  parts.push(pp(box(0.82, 0.14, 0.3, 0, 0.93, 1.02), "#b0603c"));
  parts.push(pp(cyl(0.16, 0.2, 0.55, 6, 0.1, 1.2, -0.25), "#9c6a4f"));
  // a woodpile
  for (let i = 0; i < 5; i++) {
    const l = new THREE.CylinderGeometry(0.11, 0.11, 0.9, 6);
    l.rotateX(Math.PI / 2);
    parts.push(pp(place(l, 1.25 + (i % 3) * 0.23 - (i > 2 ? -0.11 : 0), 0.12 + (i > 2 ? 0.2 : 0), 0.1), i % 2 ? "#8a5a36" : "#a0703f"));
  }
  return parts;
}

function lighthouse(low: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const seg = low ? 8 : 10;
  parts.push(pp(cyl(2.3, 2.5, 0.5, seg), STONE));
  const bands = 4;
  const h = 8;
  for (let i = 0; i < bands; i++) {
    const y0 = 0.5 + (i * h) / bands;
    const r0 = 1.9 - (0.6 * i) / bands;
    const r1 = 1.9 - (0.6 * (i + 1)) / bands;
    parts.push(pp(cyl(r1, r0, h / bands, seg, 0, y0), (p, n) => shade(i % 2 ? "#e8413c" : "#fbf7ef", 0.88 + 0.12 * Math.max(0, n.z))));
  }
  parts.push(pp(box(0.8, 1.4, 0.3, 0, 1.2, 1.8), WOOD_D));
  for (const y of [3.2, 5.6]) parts.push(pp(box(0.4, 0.55, 0.2, 0, y, 1.9 - (0.6 * (y - 0.5)) / h + 0.02), "#ffd27a", [0, 0, 1]));
  // the gallery with its rail
  parts.push(pp(cyl(2.0, 1.7, 0.3, seg, 0, 8.5), "#fbf7ef"));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    parts.push(pp(box(0.07, 0.6, 0.07, Math.sin(a) * 1.9, 9.1, Math.cos(a) * 1.9), "#3b3b4a"));
  }
  parts.push(pp(new THREE.TorusGeometry(1.9, 0.05, 3, 16).rotateX(Math.PI / 2).translate(0, 9.4, 0), "#3b3b4a"));
  // the lantern room (glowing glass) and its red cap
  parts.push(pp(cyl(1.0, 1.0, 1.5, 8, 0, 8.8), "#fff6c0", [0, 0, 1.6]));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    parts.push(pp(box(0.08, 1.5, 0.08, Math.sin(a) * 1.02, 9.55, Math.cos(a) * 1.02), "#3b3b4a"));
  }
  parts.push(pp(cone(1.35, 1.2, 8, 0, 10.3), "#e8413c"));
  parts.push(pp(ball(0.2, 0, 11.6, 0), "#ffd24a"));
  return parts;
}

// ── market ──

function stall(v: number, seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const cloth = CLOTH[v % CLOTH.length];
  for (const [x, z, h] of [
    [-1.12, 0.75, 2.35],
    [1.12, 0.75, 2.35],
    [-1.12, -0.75, 2.7],
    [1.12, -0.75, 2.7],
  ])
    parts.push(pp(box(0.12, h, 0.12, x, h / 2, z), WOOD));
  parts.push(pp(box(2.35, 0.9, 0.7, 0, 0.45, 0.58), (p, n) => (n.z > 0.5 ? shade(cloth, 0.95) : col(WOOD))));
  parts.push(pp(box(2.5, 0.08, 0.85, 0, 0.93, 0.58), "#c9955c"));
  // the striped awning, sloping down to the front, with a scalloped edge
  const aw = new THREE.BoxGeometry(2.7, 0.06, 1.9, 8, 1, 1);
  aw.rotateX(0.2);
  aw.translate(0, 2.55, 0);
  parts.push(pp(aw, (p) => (Math.floor((p.x + 1.35) / 0.3375) % 2 ? col("#fffaf0") : col(cloth))));
  for (let i = 0; i < 8; i++) parts.push(pp(place(new THREE.OctahedronGeometry(0.17, 0), -1.18 + i * 0.3375, 2.33, 0.93, 0, v3(1, 0.6, 0.3)), i % 2 ? col("#fffaf0") : col(cloth)));
  // the goods
  const rnd = villageRng(seed + 11);
  if (v === 0) {
    // fruit: star-fruit, sea-melons, berries
    const fruit = ["#ff7a3c", "#ffd23c", "#8fdc4a", "#ff4f6a", "#b06bff"];
    for (let i = 0; i < 12; i++) parts.push(pp(ball(0.12 + rnd() * 0.06, -0.95 + (i % 6) * 0.38, 1.08, 0.4 + Math.floor(i / 6) * 0.3), fruit[i % fruit.length]));
  } else if (v === 1) {
    for (let i = 0; i < 7; i++) parts.push(pp(lump(0.16, -0.9 + i * 0.3, 1.1, 0.5 + (i % 2) * 0.15, i + seed, 1.3, 0.8, 1), i % 3 ? "#d8913e" : "#e9b35a"));
    parts.push(pp(cyl(0.3, 0.25, 0.3, 7, 0.7, 0.97, 0.5), "#b38450"));
  } else if (v === 2) {
    const sh = ["#ffc2d9", "#fff0c2", "#c9e8ff", "#e6d0ff", "#ffb38a"];
    for (let i = 0; i < 9; i++) parts.push(pp(place(new THREE.ConeGeometry(0.13, 0.32, 5), -0.95 + (i % 5) * 0.47, 1.08, 0.42 + Math.floor(i / 5) * 0.32, rnd() * 3, 1, Math.PI / 2 - 0.3, 0), sh[i % sh.length]));
  } else {
    parts.push(pp(box(2.1, 0.08, 0.65, 0, 0.99, 0.58), "#e8f6ff"));
    for (let i = 0; i < 5; i++) parts.push(pp(lump(0.13, -0.8 + i * 0.4, 1.1, 0.55, i + 30, 2.2, 0.6, 0.9), i % 2 ? "#6fa8d8" : "#8cc0e8"));
  }
  // a hanging sign
  parts.push(pp(box(0.8, 0.35, 0.05, 0, 2.05, 0.95), "#fff6dd"));
  parts.push(pp(ball(0.1, 0, 2.05, 0.99, 0, 1, 1, 0.3), cloth));
  return parts;
}

function well(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(cyl(0.85, 0.9, 0.8, 9), (p) => shade(STONE, 0.85 + 0.15 * Math.sin(p.y * 12 + Math.atan2(p.x, p.z) * 3))));
  const w = new THREE.CircleGeometry(0.7, 9);
  w.rotateX(-Math.PI / 2);
  parts.push(pp(place(w, 0, 0.62, 0), "#3a8fc0"));
  parts.push(pp(box(0.12, 1.9, 0.12, -0.8, 0.95, 0), WOOD));
  parts.push(pp(box(0.12, 1.9, 0.12, 0.8, 0.95, 0), WOOD));
  parts.push(pp(cone(1.2, 0.8, 6, 0, 1.85), (p) => (Math.floor((Math.atan2(p.x, p.z) + 4) * 1.9) % 2 ? col("#ff8fb0") : col("#fff3ea"))));
  parts.push(pp(cyl(0.18, 0.15, 0.25, 6, 0.3, 1.1, 0), "#8a6040"));
  return parts;
}

// ── the fire circle, benches, totems ──

function firepit(seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const ash = new THREE.CircleGeometry(1.05, 10);
  ash.rotateX(-Math.PI / 2);
  parts.push(pp(place(ash, 0, 0.04, 0), "#4a3a34"));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    parts.push(pp(lump(0.3, Math.sin(a) * 1.15, 0.15, Math.cos(a) * 1.15, seed + i, 1.1, 0.7, 1), i % 2 ? "#a79c92" : "#8f857c"));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.3;
    parts.push(pp(stick(v3(Math.sin(a) * 0.75, 0.05, Math.cos(a) * 0.75), v3(Math.sin(a) * 0.1, 0.95, Math.cos(a) * 0.1), 0.17), i % 2 ? "#6b4428" : "#7d5230"));
  }
  return parts;
}

function bench(): THREE.BufferGeometry[] {
  const log = new THREE.CylinderGeometry(0.26, 0.26, 1.7, 7);
  log.rotateZ(Math.PI / 2);
  return [pp(place(log, 0, 0.3, 0), (p, n) => (Math.abs(n.x) > 0.8 ? col("#e0b27a") : col("#8a5a36"))), pp(box(0.2, 0.16, 0.5, -0.55, 0.08, 0), WOOD_D), pp(box(0.2, 0.16, 0.5, 0.55, 0.08, 0), WOOD_D)];
}

function totem(v: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const cols = v ? ["#4fc3a1", "#ffcf4a", "#ff7a6b"] : ["#6a8cff", "#ff9ecb", "#ffcf4a"];
  for (let i = 0; i < 3; i++) {
    const y = i * 0.9;
    parts.push(pp(box(0.72, 0.85, 0.72, 0, y + 0.43, 0), shade(cols[i], 0.95)));
    // a friendly Tidewing face: eyes, a smile, fin ears
    parts.push(pp(box(0.14, 0.18, 0.05, -0.17, y + 0.55, 0.37), "#2b2440"));
    parts.push(pp(box(0.14, 0.18, 0.05, 0.17, y + 0.55, 0.37), "#2b2440"));
    parts.push(pp(box(0.3, 0.06, 0.05, 0, y + 0.3, 0.37), "#2b2440"));
    for (const s of [-1, 1]) {
      const fin = flat([
        [0, 0],
        [0.5, 0.35],
        [0.42, -0.1],
      ]);
      parts.push(pp(place(fin, s * 0.36, y + 0.5, 0, s < 0 ? Math.PI : 0), "#fff3ea"));
    }
  }
  // the top: a sun-fish with spread fins
  parts.push(pp(ball(0.42, 0, 3.0, 0, 0, 1, 0.9, 0.6), "#ffd24a"));
  for (let i = 0; i < 7; i++) {
    const a = -1.3 + (i / 6) * 2.6;
    parts.push(pp(place(new THREE.ConeGeometry(0.12, 0.5, 4), Math.sin(a) * 0.55, 3.0 + Math.cos(a) * 0.55, 0, 0, 1, 0, -a), "#ff8a3c"));
  }
  return parts;
}

// ── harbour bits ──

function netrack(seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(box(0.14, 2.1, 0.14, -1.2, 1.05, 0), WOOD));
  parts.push(pp(box(0.14, 2.1, 0.14, 1.2, 1.05, 0), WOOD));
  parts.push(pp(box(2.7, 0.12, 0.12, 0, 2.0, 0), WOOD));
  // the net: a sagging grid of cords
  for (let i = 0; i <= 6; i++) {
    const x = -1.1 + i * (2.2 / 6);
    parts.push(pp(stick(v3(x, 1.95, 0.02), v3(x + 0.05, 0.4 + Math.abs(x) * 0.25, 0.1), 0.03), "#e8dcc0", [0, 0.35, 0]));
  }
  for (let j = 0; j < 4; j++) {
    const y = 0.7 + j * 0.35;
    parts.push(pp(box(2.25, 0.03, 0.03, 0, y, 0.06), "#e8dcc0", [0, 0.35, 0]));
  }
  const rnd = villageRng(seed);
  for (let i = 0; i < 5; i++) parts.push(pp(ball(0.1, -1 + i * 0.5, 1.9 - rnd() * 0.2, 0.08), i % 2 ? "#ff7a2a" : "#ffd24a", [0, 0.3, 0]));
  return parts;
}

function crates(v: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(box(0.75, 0.7, 0.75, 0, 0.35, 0), (p, n) => (Math.abs(n.y) > 0.5 ? col("#c9955c") : col("#a8743f"))));
  parts.push(pp(box(0.6, 0.55, 0.6, 0.05, 0.98, 0.02, 0.4), (p, n) => (Math.abs(n.y) > 0.5 ? col("#d8a86a") : col("#b0804a"))));
  parts.push(pp(cyl(0.3, 0.3, 0.8, 8, 0.75, 0, -0.1), (p) => (Math.abs(p.y - 0.4) < 0.28 ? col("#9a6a40") : col("#5a4a44"))));
  if (v === 1) for (let i = 0; i < 3; i++) parts.push(pp(lump(0.12, -0.2 + i * 0.2, 1.33, 0, i + 5, 2, 0.5, 0.8), "#7fb0e0"));
  if (v === 2) for (let i = 0; i < 4; i++) parts.push(pp(ball(0.12, -0.15 + (i % 2) * 0.25, 1.35, -0.1 + Math.floor(i / 2) * 0.2), ["#ff7a3c", "#ffd23c", "#8fdc4a", "#ff4f6a"][i]));
  return parts;
}

function shellpile(seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const sh = ["#ffc2d9", "#fff0c2", "#c9e8ff", "#e6d0ff", "#ffb38a", "#fff7f0"];
  const rnd = villageRng(seed);
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * 0.7;
    const scallop = new THREE.CylinderGeometry(0.02, 0.45, 0.14, 7, 1, false, 0, Math.PI * 1.1);
    parts.push(pp(place(scallop, Math.sin(a) * r, 0.07 + (i > 4 ? 0.15 : 0), Math.cos(a) * r, rnd() * 6, 1, 0.3, 0), (p) => shade(sh[i % sh.length], 0.85 + 0.15 * Math.sin(Math.atan2(p.x, p.z) * 7))));
  }
  return parts;
}

// ── trees and plants ──

function palm(v: number, seed: number, low: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = villageRng(seed + 1);
  const H = 5.6 + rnd() * 1.4;
  const lean = 0.5 + rnd() * 0.5;
  const segs = low ? 3 : 5;
  // the trunk: a chain of ringed segments curving out to sea (+z)
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    pts.push(v3(0, u * H, Math.pow(u, 1.6) * lean * 2.2));
  }
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const r0 = 0.24 - (i / segs) * 0.08;
    const g = new THREE.CylinderGeometry(r0 - 0.03, r0, a.distanceTo(b) + 0.05, 5, 1, true);
    g.translate(0, a.distanceTo(b) / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), b.clone().sub(a).normalize()));
    g.translate(a.x, a.y, a.z);
    parts.push(pp(g, i % 2 ? "#a07850" : "#8a6440", [0, 0.1 * (i / segs), 0]));
  }
  const top = pts[segs];
  const greens = [
    ["#3fae4f", "#7fd45a"],
    ["#2f9c5a", "#6ccf6a"],
    ["#4bb34a", "#a2dc5a"],
  ][v % 3];
  const fronds = low ? 5 : 7;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rnd() * 0.3;
    const L = 2.6 + rnd() * 0.6;
    const n = low ? 2 : 3;
    const pos: number[] = [];
    let prevL: THREE.Vector3 | null = null;
    let prevR: THREE.Vector3 | null = null;
    let prevC: THREE.Vector3 | null = null;
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const dist = u * L;
      const droop = -Math.pow(u, 1.8) * 1.6 + u * 0.55;
      const cx = top.x + Math.sin(a) * dist;
      const cz = top.z + Math.cos(a) * dist;
      const cy = top.y + droop;
      const w = Math.sin(Math.min(1, u * 1.15) * Math.PI) * 0.55 + 0.04;
      const px = Math.cos(a) * w;
      const pz = -Math.sin(a) * w;
      const C = v3(cx, cy + 0.12 * (1 - u), cz);
      const Lp = v3(cx + px, cy - 0.12, cz + pz);
      const Rp = v3(cx - px, cy - 0.12, cz - pz);
      if (prevL && prevR && prevC) {
        for (const [p, q, r] of [
          [prevC, prevL, C],
          [C, prevL, Lp],
          [prevC, C, prevR],
          [C, Rp, prevR],
        ] as [THREE.Vector3, THREE.Vector3, THREE.Vector3][]) {
          pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
          pos.push(p.x, p.y, p.z, r.x, r.y, r.z, q.x, q.y, q.z);
        }
      }
      prevL = Lp;
      prevR = Rp;
      prevC = C;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    parts.push(pp(g, (p) => col(greens[(p.y > top.y - 0.35 ? 1 : 0)]).multiplyScalar(0.9 + (f % 2) * 0.1), (p) => [0, 0.35 + Math.min(1, Math.hypot(p.x - top.x, p.z - top.z) / L) * 0.9, 0]));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    parts.push(pp(gem(0.22, top.x + Math.sin(a) * 0.28, top.y - 0.25, top.z + Math.cos(a) * 0.28), "#7a5230", [0, 0.2, 0]));
  }
  return parts;
}

function moontree(v: number, seed: number, low: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = villageRng(seed + 5);
  parts.push(pp(stick(v3(0, 0, 0), v3(0.25, 2.2, 0.1), 0.32), "#6a4f78"));
  parts.push(pp(stick(v3(0.25, 2.1, 0.1), v3(-0.2, 3.1, -0.05), 0.24), "#6a4f78"));
  const canopy = [
    ["#6f78e8", "#8f9cf5"],
    ["#5aa8e0", "#86c8f2"],
    ["#9a78e8", "#b89cf5"],
  ][v % 3];
  const blobs: [number, number, number, number][] = [
    [0, 3.7, 0, 1.6],
    [0.9, 3.3, 0.4, 1.1],
    [-0.8, 3.4, -0.4, 1.15],
  ];
  if (!low) blobs.push([0.1, 4.6, -0.2, 0.9]);
  blobs.forEach(([x, y, z, r], i) => parts.push(pp(lump(r, x, y, z, seed + i, 1, 0.85, 1), (p, n) => col(canopy[n.y > 0.3 ? 1 : 0]).multiplyScalar(0.85 + 0.15 * (n.y * 0.5 + 0.5)), [0, 0.5 + (y - 3) * 0.2, 0])));
  // hanging moonfruit that glow at night
  const pods = low ? 4 : 6;
  for (let i = 0; i < pods; i++) {
    const a = (i / pods) * Math.PI * 2 + rnd() * 0.5;
    const r = 1.0 + rnd() * 0.5;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    const y = 2.55 + rnd() * 0.3;
    parts.push(pp(stick(v3(x, y + 0.2, z), v3(x, y + 0.75, z), 0.03), "#5a4a70", [0, 0.6, 0]));
    parts.push(pp(gem(0.21, x, y, z, 0.9, 1.35, 0.9), i % 2 ? "#fff3a0" : "#b8fff0", [0, 0.6, 1.4]));
  }
  return parts;
}

/** a candy "coral tree": a pale trunk forking into bright branches, each ending in a round puff */
function coraltree(v: number, seed: number, low: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const pal = [
    ["#ff6f9a", "#ffb0c8", "#ffe0ea"],
    ["#ff8a4a", "#ffc070", "#fff0c0"],
    ["#d96fe0", "#f0a8f2", "#ffe6ff"],
  ][v % 3];
  const rnd = villageRng(seed + 9);
  parts.push(pp(stick(v3(0, 0, 0), v3(0.1, 1.5, 0), 0.3), "#f2d6c8"));
  const n = low ? 3 : 4 + (seed % 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.6;
    const out = 0.9 + rnd() * 0.7;
    const mid = v3(Math.sin(a) * out * 0.5, 2.2 + rnd() * 0.4, Math.cos(a) * out * 0.5);
    const tip = v3(Math.sin(a) * out, 2.9 + rnd() * 1.1, Math.cos(a) * out);
    parts.push(pp(stick(v3(0.1, 1.4, 0), mid, 0.2), pal[0], [0, 0.15, 0]));
    parts.push(pp(stick(mid, tip, 0.16), pal[0], [0, 0.3, 0]));
    const r = 0.5 + rnd() * 0.25;
    parts.push(pp(ball(r, tip.x, tip.y + r * 0.6, tip.z, 1, 1, 0.9, 1), (p, nn) => col(pal[nn.y > 0.35 ? 2 : nn.y > -0.2 ? 1 : 0]), [0, 0.45, 0.12]));
  }
  return parts;
}

function bush(v: number, seed: number, low: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const g = ["#4fb35a", "#5cc46a", "#3fa56a"][v % 3];
  const rnd = villageRng(seed);
  for (let i = 0; i < (low ? 2 : 3); i++) parts.push(pp(lump(0.55 - i * 0.1, (rnd() - 0.5) * 0.8, 0.4, (rnd() - 0.5) * 0.8, seed + i, 1, 0.8, 1), (p, n) => shade(g, 0.85 + 0.2 * (n.y * 0.5 + 0.5)), [0, 0.3, 0]));
  const fl = ["#ff6fa8", "#fff4a8", "#ffffff", "#ff9a5c"][v % 4];
  for (let i = 0; i < 5; i++) parts.push(pp(new THREE.OctahedronGeometry(0.1, 0).translate((rnd() - 0.5) * 1.0, 0.6 + rnd() * 0.3, (rnd() - 0.5) * 1.0), fl, [0, 0.3, 0]));
  return parts;
}

function rock(seed: number): THREE.BufferGeometry[] {
  return [pp(lump(0.9, 0, 0.35, 0, seed, 1.2, 0.75, 1, 0.3), (p, n) => (n.y > 0.75 ? col("#8fcf6a") : shade("#b4a69a", 0.8 + 0.2 * Math.sin(p.x * 4 + p.z * 3))))];
}

function flowers(v: number, seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = villageRng(seed);
  const pal = v ? ["#ff6fa8", "#ffffff", "#ffd24a"] : ["#b06bff", "#ff9a5c", "#fff4a8"];
  for (let i = 0; i < 11; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 1.6;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    parts.push(pp(gem(0.16, x, 0.2, z, 1, 0.7, 1), i % 4 === 3 ? "#5cb84a" : pal[i % 3], [0, 0.5, 0]));
  }
  return parts;
}

// ── homely things ──

function lantern(seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(box(0.12, 2.6, 0.12, 0, 1.3, 0), WOOD_D));
  parts.push(pp(box(0.08, 0.08, 0.55, 0, 2.62, 0.22), WOOD_D));
  const c = ["#ff8a5c", "#ffb14a", "#ff6f8a"][seed % 3];
  const body = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 6, 1, true);
  parts.push(pp(place(body, 0, 2.3, 0.45), c, [0, 0.25, 0]));
  parts.push(pp(cone(0.24, 0.14, 6, 0, 2.47, 0.45), "#4a3a34", [0, 0.25, 0]));
  parts.push(pp(place(cone(0.22, 0.12, 6), 0, 2.13, 0.45, 0, 1, Math.PI, 0), "#4a3a34", [0, 0.25, 0]));
  return parts;
}

/** posts at both ends of `len` (along local z), a sagging line with things hanging off it */
function lineWithPosts(len: number, y0: number, y1: number, h: number, hang: (u: number, p: THREE.Vector3) => THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const za = -len / 2;
  const zb = len / 2;
  parts.push(pp(box(0.12, h + 0.3, 0.12, 0, y0 + (h + 0.3) / 2, za), WOOD));
  parts.push(pp(box(0.12, h + 0.3, 0.12, 0, y1 + (h + 0.3) / 2, zb), WOOD));
  const n = Math.max(4, Math.round(len / 0.7));
  let prev = v3(0, y0 + h, za);
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const p = v3(0, y0 + (y1 - y0) * u + h - Math.sin(u * Math.PI) * 0.35, za + len * u);
    parts.push(pp(stick(prev, p, 0.035), "#f2eee6", [0, 0.3 * Math.sin(u * Math.PI), 0]));
    prev = p;
  }
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const p = v3(0, y0 + (y1 - y0) * u + h - Math.sin(u * Math.PI) * 0.35, za + len * u);
    parts.push(...hang(u, p));
  }
  return parts;
}

function washline(p: VillageProp): THREE.BufferGeometry[] {
  const len = p.len ?? 5;
  const ends = lineEnds(p);
  const rnd = villageRng(p.seed);
  const clothes = ["#ff6b6b", "#ffffff", "#6a8cff", "#ffcf4a", "#4fc3a1", "#ff9ecb", "#b07ce8"];
  return lineWithPosts(len, ends.ya - p.y, ends.yb - p.y, 2.0, (u, q) => {
    if (rnd() < 0.2) return [];
    const w = 0.4 + rnd() * 0.3;
    const h = 0.45 + rnd() * 0.35;
    const c = clothes[Math.floor(rnd() * clothes.length)];
    const shirt = rnd() < 0.5;
    const pts: [number, number][] = shirt
      ? [
          [-w / 2, 0],
          [-w / 2 - 0.18, -0.15],
          [-w / 2 + 0.02, -0.25],
          [-w / 2 + 0.05, -h],
          [w / 2 - 0.05, -h],
          [w / 2 - 0.02, -0.25],
          [w / 2 + 0.18, -0.15],
          [w / 2, 0],
        ]
      : [
          [-w / 2, 0],
          [-w / 2, -h],
          [w / 2, -h],
          [w / 2, 0],
        ];
    const g = flat(pts);
    g.rotateY(Math.PI / 2);
    g.translate(q.x, q.y, q.z);
    void u;
    return [pp(g, (pp_, n) => shade(c, 0.9 + 0.1 * Math.abs(n.x)), (pt) => [0, 0.5 + (q.y - pt.y) * 1.4, 0])];
  });
}

function bunting(p: VillageProp): THREE.BufferGeometry[] {
  const len = p.len ?? 10;
  const ends = lineEnds(p);
  let k = 0;
  const flags = ["#ff6b6b", "#ffcf4a", "#4fc3a1", "#6a8cff", "#ff9ecb", "#b07ce8"];
  return lineWithPosts(len, ends.ya - p.y, ends.yb - p.y, 3.3, (u, q) => {
    k++;
    if (k % 3 === 0) {
      // a little paper lantern (festival lights: they glow at night)
      return [pp(place(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 6), q.x, q.y - 0.2, q.z), ["#ffb14a", "#ff8a5c", "#fff08a"][k % 3], [0, 0.4, 1.3])];
    }
    const g = flat([
      [-0.2, 0],
      [0, -0.42],
      [0.2, 0],
    ]);
    g.rotateY(Math.PI / 2);
    g.translate(q.x, q.y, q.z);
    void u;
    return [pp(g, flags[k % flags.length], [0, 0.6, 0])];
  });
}

/** a line prop's two ends (world) and their ground heights (posts can stand on decks) */
function lineEnds(p: VillageProp) {
  const len = p.len ?? 5;
  const dx = Math.sin(p.rot) * (len / 2);
  const dz = Math.cos(p.rot) * (len / 2);
  const ya = villageGroundY(p.x - dx, p.z - dz) ?? p.y;
  const yb = villageGroundY(p.x + dx, p.z + dz) ?? p.y;
  return { ya, yb };
}

function garden(p: VillageProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const len = p.len ?? 5;
  const rnd = villageRng(p.seed);
  parts.push(pp(box(1.9, 0.25, len, 0, 0.1, 0), (pt, n) => (n.y > 0.5 ? col("#7a5236") : col("#5e3e28"))));
  // a little picket border
  for (const s of [-1, 1]) for (let i = 0; i <= Math.round(len / 0.9); i++) parts.push(pp(box(0.07, 0.42, 0.07, s * 1.05, 0.21, -len / 2 + (i * len) / Math.round(len / 0.9)), "#fff6e6"));
  const rows = 2;
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < Math.round(len / 0.8); i++) {
      const x = -0.45 + r * 0.9;
      const z = -len / 2 + 0.45 + i * 0.8;
      const kind = (i + r + p.v) % 3;
      if (kind === 0) parts.push(pp(ball(0.28, x, 0.4, z, 0, 1, 0.85, 1), (pt) => (Math.floor(Math.atan2(pt.x - x, pt.z - z) * 2 + 4) % 2 ? col("#5cb84a") : col("#8fdc5a"))));
      else if (kind === 1) parts.push(pp(lump(0.3, x, 0.45, z, p.seed + i, 1, 0.8, 1), "#4aa84f", [0, 0.4, 0]));
      else {
        parts.push(pp(lump(0.2, x, 0.35, z, p.seed + i + 3, 1, 0.8, 1), "#58b95a", [0, 0.4, 0]));
        parts.push(pp(place(new THREE.ConeGeometry(0.12, 0.25, 5), x, 0.62, z, rnd() * 3, 1, Math.PI, 0), "#ff8fc0", [0, 0.4, 0.3]));
      }
    }
  return parts;
}

function canoe(v: number): THREE.BufferGeometry[] {
  // upturned on the beach: hull (keel up) on two little trestles
  const c = ["#ff7a6b", "#4fc3a1", "#ffcf4a"][v % 3];
  const hull = new THREE.CylinderGeometry(0.42, 0.42, 3.4, 8, 1, false, 0, Math.PI);
  hull.rotateX(Math.PI / 2);
  hull.rotateZ(Math.PI / 2);
  const pos = hull.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const k = 1 - Math.pow(Math.abs(z) / 1.7, 3) * 0.85;
    pos.setX(i, pos.getX(i) * k);
    pos.setY(i, pos.getY(i) * k);
  }
  return [pp(place(hull, 0, 0.62, 0, 0, 1, Math.PI, 0), (p, n) => (n.y < -0.3 ? col("#e8d8b8") : col(c))), pp(box(0.9, 0.2, 0.18, 0, 0.1, -0.9), WOOD), pp(box(0.9, 0.2, 0.18, 0, 0.1, 0.9), WOOD)];
}

// ── decks: planks on posts ──

function deckParts(d: VillageDeck, low: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const toLocal = (x: number, z: number) => [x - X0, z - Z0] as const;
  const postTo = (x: number, z: number, y: number, r: number) => {
    const floor = villageSeaFloorY(x, z) ?? y - 3;
    const [lx, lz] = toLocal(x, z);
    const bottom = Math.min(y - 0.6, floor - 0.4);
    parts.push(pp(cyl(r, r * 1.1, y - bottom, 5, lx, bottom, lz, true), (p) => (p.y < -0.1 ? col("#5a6a58") : col(WOOD_D))));
  };
  if (d.r !== undefined) {
    // a round deck of wedge planks
    const n = low ? 10 : 14;
    const [cx, cz] = toLocal(d.ax, d.az);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const g = new THREE.CylinderGeometry(d.r, d.r, 0.18, 2, 1, false, a0 + 0.02, (Math.PI * 2) / n - 0.04);
      parts.push(pp(place(g, cx, d.ya - 0.09, cz), i % 2 ? "#c9955c" : "#b8844e"));
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      postTo(d.ax + Math.sin(a) * (d.r - 0.4), d.az + Math.cos(a) * (d.r - 0.4), d.ya - 0.15, 0.13);
    }
    // a little rail round the edge, open towards its boardwalk
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = cx + Math.sin(a) * (d.r - 0.12);
      const z = cz + Math.cos(a) * (d.r - 0.12);
      parts.push(pp(box(0.08, 0.75, 0.08, x, d.ya + 0.37, z), WOOD_D));
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
    parts.push(pp(place(g, ax + ux * L * u, y - 0.08, az + uz * L * u, yaw, 1, Math.atan2(d.ya - d.yb, L) * 1, 0), (i * 7 + Math.round(ax)) % 3 ? "#c9955c" : "#b07c48"));
  }
  // posts every ~2.2 m on both sides, and (on the jetty) chunky bollards at the end
  const pn = Math.max(1, Math.round(L / 2.2));
  const px = uz;
  const pz = -ux;
  for (let i = 0; i <= pn; i++) {
    const u = i / pn;
    const y = d.ya + (d.yb - d.ya) * u;
    for (const s of [-1, 1]) {
      const x = d.ax + ux * L * u + px * s * (d.half - 0.1);
      const z = d.az + uz * L * u + pz * s * (d.half - 0.1);
      const floor = villageSeaFloorY(x, z);
      const ground = villageGroundY(x, z);
      // (only where the planks are off the ground)
      if (floor !== null && (ground === null || ground < y - 0.35 || floor < y - 0.6)) postTo(x, z, y - 0.12, d.kind === "jetty" ? 0.16 : 0.12);
      if (d.kind === "boardwalk" && !low) {
        const [lx, lz] = toLocal(x, z);
        parts.push(pp(box(0.08, 0.9, 0.08, lx, y + 0.45, lz), WOOD_D));
      }
    }
  }
  if (d.kind === "boardwalk") {
    // rope rails
    for (const s of [-1, 1]) {
      const a = v3(ax + px * s * (d.half - 0.1), d.ya + 0.85, az + pz * s * (d.half - 0.1));
      const b = v3(ax + ux * L + px * s * (d.half - 0.1), d.yb + 0.85, az + uz * L + pz * s * (d.half - 0.1));
      parts.push(pp(stick(a, b, 0.05), "#e8dcc0"));
    }
  }
  if (d.id === "jetty-t") {
    for (const s of [-1, 1]) {
      const [lx, lz] = toLocal(d.ax + ux * (L / 2 + s * (L / 2 - 0.4)), d.az + uz * (L / 2 + s * (L / 2 - 0.4)));
      parts.push(pp(cyl(0.2, 0.22, 0.55, 7, lx, d.ya, lz + 1.0), "#4a3a34"));
    }
  }
  return parts;
}

// ── assembling ──

function propParts(p: VillageProp, low: boolean): THREE.BufferGeometry[] {
  switch (p.kind) {
    case "hut":
      return hut(p.v, p.seed, low);
    case "bighut": {
      const parts = hut(p.v, p.seed, low).map((g) => place(g, 0, 0, 0, 0, 1.3));
      // a pennant on top: the chief's hut
      parts.push(pp(box(0.07, 1.2, 0.07, 0, HUT_TOP * 1.3, 0), WOOD_D));
      parts.push(pp(place(flat([[0, 0], [0.9, -0.2], [0, -0.45]]), 0.03, HUT_TOP * 1.3 + 1.15, 0), "#ff6b6b", [0, 0.9, 0]));
      return parts;
    }
    case "stilthut":
      return hut(p.v + 2, p.seed, low).map((g) => place(g, 0, 0, 0, 0, 0.86));
    case "bakery":
      return bakery(low);
    case "oven":
      return oven();
    case "lighthouse":
      return lighthouse(low);
    case "stall":
      return stall(p.v, p.seed);
    case "well":
      return well();
    case "firepit":
      return firepit(p.seed);
    case "bench":
      return bench();
    case "totem":
      return totem(p.v);
    case "netrack":
      return netrack(p.seed);
    case "crates":
      return crates(p.v);
    case "shellpile":
      return shellpile(p.seed);
    case "palm":
      return palm(p.v, p.seed, low);
    case "moontree":
      return moontree(p.v, p.seed, low);
    case "coraltree":
      return coraltree(p.v, p.seed, low);
    case "bush":
      return bush(p.v, p.seed, low);
    case "rock":
      return rock(p.seed);
    case "flowers":
      return flowers(p.v, p.seed);
    case "lantern":
      return lantern(p.seed);
    case "washline":
      return washline(p);
    case "bunting":
      return bunting(p);
    case "garden":
      return garden(p);
    case "canoe":
      return canoe(p.v);
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
  for (const p of VILLAGE_PROPS) {
    if (low && (p.kind === "flowers" || (p.kind === "bush" && p.seed % 2 === 0))) continue;
    const parts = propParts(p, low);
    // line props run along local z; everything else faces its front (+z) along rot
    e.set(0, p.rot, 0);
    m.compose(pos.set(p.x - X0, p.y, p.z - Z0), q.setFromEuler(e), sc.setScalar(p.s));
    for (const g of parts) {
      g.applyMatrix4(m);
      all.push(g);
    }
  }
  for (const d of VILLAGE_DECKS) all.push(...deckParts(d, low));
  return mergeAll(all);
}
