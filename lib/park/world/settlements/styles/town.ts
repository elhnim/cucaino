// Sunnybrook, the Sunflower Folk's market town: a cobbled square round a fountain, a clock tower,
// eight distinct shop fronts and eight townhouses, striped market stalls, a bandstand, a windmill
// and its fields — built the same way every settlement's props are (chunky faceted storybook parts,
// ../village/kit.ts's helpers + the fantasy kit's wind-sway/night-glow fx), all merged into ONE mesh
// (buildTownPropsGeometry). Deliberately its OWN module, not ../props.ts (owned by the village
// makeover pass): Sunnybrook shares nothing with Lakeside/Treetop/Highstone's look but the shared
// primitives in ../../village/kit.ts.
//
// The clock tower's hands and the windmill's sails are the only MOVING parts — everything else here
// is static geometry. They're built and animated by buildTownMoving(), its own tiny pair of meshes
// (not merged: they need their own per-frame rotation), sharing the village's wind/glow uniforms so
// they still fade in with the fog and glow at night like everything else.
import type { HouseAtlas, PaintedHouse } from "./paintedHouses";
import * as THREE from "three";
import type { SettlementDef, SettlementProp } from "../../../registry/settlements";
import { ball, box, cone, cyl, flat, gem, lump, mergeAll, place, pp, stick, v3 } from "../../village/kit";
import { groundY } from "../../../registry/terrain";
import { TOWN_BUILDING_REF_W, townStallColor } from "../../../registry/town";
import type { FantasyUniforms } from "../../fantasy/shaders";
import { fxMaterial } from "../../fantasy/shaders";
// reuse the village makeover's shared kit rather than re-inventing windows/flower-boxes/benches/the
// welcome arch (lib/park/world/settlements/styles/common.ts) — Sunnybrook's own look (the building
// shell, shops' signatures, the fountain/clock/stalls/windmill) stays in this file
import { GLOW, SWAY, WOOD, WOOD_D, buildBench, buildFlowerBox, buildPathStones, buildWelcomeArch, buildWindow, footed, shade } from "./common";

// ── the Sunflower Folk's palette: bright yellows, sky blues, poppy reds, leaf greens ──
const WALL = ["#f7d774", "#8fc7e8", "#e8705f", "#7fb86a", "#f2b56b", "#e6e2c8", "#c98fd1", "#f0905a"];
const ROOF = ["#b5493a", "#3a6ea0", "#4a8f57", "#caa23a", "#9a5a9a", "#5a7a9a"];
const TRIM = "#fffaf0";
const DOOR_D = "#5a3a22";
const STONE = "#d8cdb6";
const STONE_D = "#aa9d84";
const COBBLE = "#c9c0a4";

/** units per metre (kept in step with registry/town.ts's own `M` — a kid stands 2.26 units ≈
 *  1.4 m tall, so ~1.6 units/metre): everything below is sized in real metres times this */
const M = 1.6;

type Hut = { x: number; z: number; yaw: number; size: number };
/** a building's real footprint, straight off its `size` (registry/town.ts's TOWN_BUILDING_REF_W is
 *  the very same number the registry divided by, so this always reconstructs the true width) */
const widthOf = (hut: Hut) => TOWN_BUILDING_REF_W * hut.size;
const depthOf = (hut: Hut) => widthOf(hut) * 0.78;
/** a cheap deterministic hash (0..1) off a building's own position — no seed needs storing on the
 *  hut itself, so every building still gets its own look (a bit taller, a bit shorter) for free */
function hash01(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
/** every real-scale number a building's shell AND its own per-kind accent need, worked out once so
 *  the two always agree (~7.5 m to the ridge, a touch more or less per building for rhythm) */
function dims(hut: Hut) {
  // (a tall, narrow painted townhouse: its front picture is two wide by three high, so the walls
  //  are one and a half times the width — a touch more or less from house to house)
  const w = widthOf(hut) * 0.64;
  const d = depthOf(hut);
  const heightMul = 0.95 + hash01(hut.x, hut.z) * 0.1;
  const h1 = w * 0.75 * heightMul;
  const h2 = w * 0.75 * heightMul;
  const roofH = 1.5 * M;
  const faceA = Math.sin(hut.yaw);
  const faceB = Math.cos(hut.yaw);
  const chimX = hut.x - faceA * w * 0.3;
  const chimZ = hut.z - faceB * d * 0.3;
  const chimTopY = h1 + h2 + roofH * 0.7 + 1.4 * M;
  return { w, d, h1, h2, roofH, ridgeY: h1 + h2 + roofH, chimX, chimZ, chimTopY };
}

// ── a shared 2-storey building shell: ground floor, a set-back upper floor with a little balcony,
// a gabled roof, a dark door, shuttered windows with flower boxes — every shop/townhouse front
// starts here, then a per-kind accent (a sign, an oven chimney, a striped awning, a loom of toy
// shapes...) makes it read as its own place. Real scale: ~7.5 m to the ridge (a touch more or less
// per building — `heightMul` below — for rhythm along a terraced row), doors ~2.2 m ──
function buildBuildingShell(hut: Hut, wall: string, roof: string, seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const { w, d, h1, h2, roofH, chimX, chimZ, chimTopY } = dims(hut);
  const yaw = hut.yaw;
  const faceA = Math.sin(yaw);
  const faceB = Math.cos(yaw);
  // the walls, roof, door and windows are the painted building standing here (townPainted below,
  // put up by ../index.ts): this shell only adds its chimney and the doorstep
  if (PAINTED) {
    parts.push(pp(box(0.5 * M, 1.4 * M, 0.5 * M, chimX, chimTopY - 0.7 * M, chimZ, yaw), STONE_D));
    parts.push(pp(box(1.5 * M, 0.16, 0.5, hut.x + faceA * (d * 0.5 + 0.3), 0.08, hut.z + faceB * (d * 0.5 + 0.3), yaw), STONE_D));
    void wall;
    void roof;
    void seed;
    void h1;
    void h2;
    void roofH;
    return parts;
  }

  // ground floor
  parts.push(pp(place(box(w, h1, d), hut.x, h1 / 2, hut.z, yaw), (pt, n) => shade(wall, 0.86 + 0.14 * Math.max(0, n.y))));
  // upper floor, set back a little (reads as a storybook 2-storey front)
  parts.push(pp(place(box(w * 0.94, h2, d * 0.9), hut.x, h1 + h2 / 2, hut.z, yaw), (pt, n) => shade(wall, 0.92 + 0.1 * Math.max(0, n.y))));
  // a gabled roof, ridge along the building's own depth
  const roofW = w * 1.1;
  parts.push(pp(place(new THREE.ConeGeometry(Math.hypot(roofW, d * 1.05) * 0.5, roofH, 4), hut.x, h1 + h2 + roofH * 0.42, hut.z, yaw + Math.PI / 4), (pt, n) => shade(roof, 0.82 + 0.18 * Math.max(0, n.y))));
  // the ridge cap
  parts.push(pp(cyl(0.1, 0.1, d * 0.95, 6, hut.x, h1 + h2 + roofH * 0.88, hut.z), shade(roof, 0.6)));
  // a chimney (every building gets one — reads right on a terraced row's skyline) plus a white
  // fascia band between floors
  parts.push(pp(box(0.5 * M, 1.4 * M, 0.5 * M, chimX, chimTopY - 0.7 * M, chimZ, yaw), STONE_D));
  parts.push(pp(place(box(w * 0.98, 0.14, d * 0.98), hut.x, h1 + 0.02, hut.z, yaw), TRIM));

  // the door, facing the square (~2.2 m, a real door's height)
  const doorW = 1.0 * M;
  const doorH = 2.2 * M;
  const doorX = hut.x + faceA * d * 0.5;
  const doorZ = hut.z + faceB * d * 0.5;
  parts.push(pp(box(doorW, doorH, 0.12, doorX, doorH / 2, doorZ, yaw), DOOR_D));
  parts.push(pp(box(doorW * 1.18, 0.14, 0.16, doorX, doorH + 0.04, doorZ, yaw), TRIM));
  // a step
  parts.push(pp(box(doorW * 1.5, 0.16, 0.5, doorX + faceA * 0.3, 0.08, doorZ + faceB * 0.3, yaw), STONE_D));

  // two ground-floor windows either side of the door (common.ts's buildWindow: a dark frame, warm
  // glowing glass at night, trim-coloured shutters), plus a flower box under each
  const sideA = Math.sin(yaw + Math.PI / 2);
  const sideB = Math.cos(yaw + Math.PI / 2);
  const winSize = 0.95 * M;
  for (const side of [-1, 1]) {
    const wx = doorX + sideA * side * w * 0.3;
    const wz = doorZ + sideB * side * w * 0.3;
    parts.push(...buildWindow(wx, 1.35 * M, wz, yaw, TRIM, winSize, winSize));
    parts.push(...buildFlowerBox(wx, 1.0 * M, wz, yaw, FLOWER_COLORS, seed + side));
  }
  // one upper-floor window, lit, with a tiny balcony rail
  const upX = hut.x + faceA * d * 0.46;
  const upZ = hut.z + faceB * d * 0.46;
  parts.push(...buildWindow(upX, h1 + h2 * 0.55, upZ, yaw, TRIM, winSize * 1.1, winSize * 1.1));
  parts.push(pp(box(w * 0.32, 0.5, 0.35, upX + faceA * 0.18, h1 + 0.22, upZ + faceB * 0.18, yaw), WOOD));
  for (let i = 0; i < 4; i++) {
    const t = (i / 3 - 0.5) * w * 0.28;
    parts.push(pp(cyl(0.03, 0.03, 0.45, 5, upX + sideA * t, h1 + 0.5, upZ + sideB * t), WOOD_D));
  }
  return parts;
}

const FLOWER_COLORS = ["#ff6fa0", "#ffd24a", "#ff9a4a", "#e05c8a"];

/** Sunnybrook's houses and shops are painted buildings (real artwork on plain walls) */
const PAINTED = true;
/** which artwork each shop wears (four townhouse fronts between the eight shops, no two alike side by side) */
/** (0 the pink bakery front, 1 the blue florist, 2 the yellow toy shop, 3 the timbered bookshop) */
const SHOP_ART: Record<string, number> = {
  "shop-post": 3,
  "shop-general": 2,
  "shop-bakery": 0,
  "shop-sweet": 1,
  "shop-cafe": 3,
  "shop-toy": 2,
  "shop-grocer": 1,
  "shop-cheesewool": 0,
};

/** the painted buildings of the town: one per house or shop, where its shell would stand
 *  (`y` is filled in by the caller: the ground under each) */
export function townPainted(def: SettlementDef): { houses: PaintedHouse[]; atlas: HouseAtlas } | null {
  if (!PAINTED) return null;
  // (the picture's layout: scripts/village-atlas.mjs `town`)
  const houses = def.huts.map((h, i): PaintedHouse => {
    const { w, d, h1, h2, roofH } = dims(h);
    const art = SHOP_ART[h.kind] ?? i % 4;
    // (red tiles on the pink and yellow houses, slate on the blue and the timbered ones)
    const roof = art === 0 || art === 2 ? 0 : 1;
    return { x: h.x, y: 0, z: h.z, yaw: h.yaw, w, h: h1 + h2, d, roofRise: roofH, front: [art * 512, 0, 512, 768], side: [art * 192, 768, 192, 256], roof: [768 + roof * 256, 768, 256, 256] };
  });
  return { houses, atlas: { name: "town", w: 2048, h: 1024, trim: [1280, 768, 128, 128] } };
}

// ── per-shop signature: a hanging signboard with a theme icon, plus the odd special feature the
// spec calls out (the bakery's giant pretzel + smoking chimney, the café's umbrellas...) ──
function signboard(hut: Hut, color: string): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const { d } = dims(hut);
  const faceA = Math.sin(hut.yaw);
  const faceB = Math.cos(hut.yaw);
  const sx = hut.x + faceA * (d * 0.5 + 0.3 * M) + Math.sin(hut.yaw + Math.PI / 2) * 1.9 * M;
  const sz = hut.z + faceB * (d * 0.5 + 0.3 * M) + Math.cos(hut.yaw + Math.PI / 2) * 1.9 * M;
  parts.push(pp(stick(v3(sx, 1.5 * M, sz), v3(sx, 3.2 * M, sz), 0.07), WOOD_D));
  parts.push(pp(stick(v3(sx, 3.05 * M, sz), v3(sx + faceA * 0.8 * M, 3.05 * M, sz + faceB * 0.8 * M), 0.06), WOOD_D));
  parts.push(pp(place(box(0.8 * M, 0.8 * M, 0.08), sx + faceA * 0.8 * M, 2.5 * M, sz + faceB * 0.8 * M, hut.yaw), color));
  return parts;
}

function buildBakery(hut: Hut): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [...buildBuildingShell(hut, WALL[0], ROOF[2], 1), ...signboard(hut, "#caa23a")];
  const { d, chimX, chimZ, chimTopY } = dims(hut);
  const faceA = Math.sin(hut.yaw);
  const faceB = Math.cos(hut.yaw);
  // the giant pretzel sign, over the door
  const px = hut.x + faceA * (d * 0.5 + 0.55 * M);
  const pz = hut.z + faceB * (d * 0.5 + 0.55 * M);
  const ring = new THREE.TorusGeometry(0.62 * M, 0.16 * M, 6, 10);
  place(ring, px, 2.9 * M, pz, hut.yaw);
  parts.push(pp(ring, "#caa23a"));
  parts.push(pp(gem(0.14 * M, px - 0.2 * M, 2.9 * M, pz, 1, 1, 1), "#efe0b0"));
  // smoke, puffing up from the shell's own chimney
  parts.push(pp(ball(0.4 * M, chimX, chimTopY + 0.3 * M, chimZ, 0, 1, 0.7, 1), "#e8e3d8", SWAY));
  parts.push(pp(ball(0.3 * M, chimX + 0.15 * M, chimTopY + 0.85 * M, chimZ - 0.1 * M, 0, 1, 0.7, 1), "#f0ece2", SWAY));
  return parts;
}
function buildSweetShop(hut: Hut): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [...buildBuildingShell(hut, WALL[2], ROOF[3], 2), ...signboard(hut, "#e8705f")];
  const { d } = dims(hut);
  const faceA = Math.sin(hut.yaw);
  const faceB = Math.cos(hut.yaw);
  const px = hut.x + faceA * (d * 0.5 + 0.6 * M);
  const pz = hut.z + faceB * (d * 0.5 + 0.6 * M);
  // a striped lollipop by the door
  parts.push(pp(stick(v3(px, 0, pz), v3(px, 2.0 * M, pz), 0.08), "#fff"));
  for (let i = 0; i < 4; i++) parts.push(pp(place(new THREE.TorusGeometry((0.34 - i * 0.022) * M, 0.08 * M, 5, 8), px, (2.0 + i * 0.14) * M, pz, 0, 1, Math.PI / 2 + i * 0.5), i % 2 ? "#ff5c82" : "#fff2f5"));
  return parts;
}
function buildCafe(hut: Hut): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [...buildBuildingShell(hut, WALL[4], ROOF[0], 3), ...signboard(hut, "#b5493a")];
  const { d } = dims(hut);
  const faceA = Math.sin(hut.yaw);
  const faceB = Math.cos(hut.yaw);
  const sideA = Math.sin(hut.yaw + Math.PI / 2);
  const sideB = Math.cos(hut.yaw + Math.PI / 2);
  for (const side of [-2.4, 2.4]) {
    const tx = hut.x + faceA * (d * 0.5 + 1.8 * M) + sideA * side;
    const tz = hut.z + faceB * (d * 0.5 + 1.8 * M) + sideB * side;
    parts.push(pp(cyl(0.45 * M, 0.48 * M, 0.08, 8, tx, 0.9 * M, tz), STONE));
    parts.push(pp(cyl(0.06 * M, 0.07 * M, 0.9 * M, 6, tx, 0.45 * M, tz), WOOD_D));
    parts.push(pp(stick(v3(tx, 1.0 * M, tz), v3(tx, 2.4 * M, tz), 0.05), WOOD_D));
    parts.push(pp(place(new THREE.ConeGeometry(1.15 * M, 0.75 * M, 8), tx, 2.75 * M, tz, 0), "#e8705f", GLOW));
  }
  return parts;
}
function buildPostOffice(hut: Hut): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [...buildBuildingShell(hut, WALL[1], ROOF[1], 4), ...signboard(hut, "#3a6ea0")];
  const { d } = dims(hut);
  const faceA = Math.sin(hut.yaw);
  const faceB = Math.cos(hut.yaw);
  const px = hut.x + faceA * (d * 0.5 + 0.6 * M);
  const pz = hut.z + faceB * (d * 0.5 + 0.6 * M);
  parts.push(pp(stick(v3(px, 0, pz), v3(px, 4.0 * M, pz), 0.1), WOOD_D));
  const flag = flat([
    [0, 0],
    [0.75 * M, -0.08 * M],
    [0, -0.6 * M],
  ]);
  parts.push(pp(place(flag, px, 3.85 * M, pz, hut.yaw + Math.PI / 2), "#3a6ea0"));
  // a little stack of parcels by the door
  for (let i = 0; i < 3; i++) parts.push(pp(place(box(0.45 * M, 0.4 * M, 0.45 * M), px - faceA * 0.6 * M + i * 0.12 * M, (0.2 + Math.floor(i / 2) * 0.4) * M, pz - faceB * 0.6 * M, hut.yaw + i), "#cdb78a"));
  return parts;
}
function buildGeneralStore(hut: Hut): THREE.BufferGeometry[] {
  return [...buildBuildingShell(hut, WALL[5], ROOF[4], 5), ...signboard(hut, "#9a5a9a")];
}
function buildToyShop(hut: Hut): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [...buildBuildingShell(hut, WALL[6], ROOF[5], 6), ...signboard(hut, "#7a5cff")];
  const { d } = dims(hut);
  const faceA = Math.sin(hut.yaw);
  const faceB = Math.cos(hut.yaw);
  const px = hut.x + faceA * (d * 0.5 + 0.6 * M);
  const pz = hut.z + faceB * (d * 0.5 + 0.6 * M);
  // a wooden spinning top and a ball by the door
  parts.push(pp(cone(0.34 * M, 0.6 * M, 6, px - 0.45 * M, 0.3 * M, pz), "#e8893c"));
  parts.push(pp(ball(0.3 * M, px + 0.4 * M, 0.3 * M, pz, 0, 1, 1, 1), "#4fb4e8"));
  return parts;
}
function buildGrocer(hut: Hut): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [...buildBuildingShell(hut, WALL[3], ROOF[2], 7), ...signboard(hut, "#e0503c")];
  const { d } = dims(hut);
  const faceA = Math.sin(hut.yaw);
  const faceB = Math.cos(hut.yaw);
  const px = hut.x + faceA * (d * 0.5 + 0.6 * M);
  const pz = hut.z + faceB * (d * 0.5 + 0.6 * M);
  parts.push(pp(place(cyl(0.46 * M, 0.37 * M, 0.62 * M, 8, 0, 0, 0), px, 0.3 * M, pz, 0), "#b08a4e"));
  const fruit = ["#e0503c", "#e8c23c", "#4a8f3c"];
  for (let i = 0; i < 5; i++) parts.push(pp(gem(0.2 * M, px + Math.sin(i) * 0.28 * M, (0.65 + i * 0.03) * M, pz + Math.cos(i) * 0.28 * M, 1, 1, 1), fruit[i % fruit.length]));
  return parts;
}
function buildCheeseWoolShop(hut: Hut): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [...buildBuildingShell(hut, WALL[7], ROOF[3], 8), ...signboard(hut, "#f0c457")];
  const { d } = dims(hut);
  const faceA = Math.sin(hut.yaw);
  const faceB = Math.cos(hut.yaw);
  const px = hut.x + faceA * (d * 0.5 + 0.6 * M);
  const pz = hut.z + faceB * (d * 0.5 + 0.6 * M);
  // a cheese wedge and a wool tuft by the door
  const wedge = flat([
    [0, 0],
    [0.62 * M, 0],
    [0.31 * M, 0.46 * M],
  ]);
  parts.push(pp(place(wedge.rotateX(-Math.PI / 2), px, 0.28 * M, pz, 0), "#f0c457"));
  parts.push(pp(lump(0.3 * M, px + 0.62 * M, 0.3 * M, pz, 2, 1, 0.8, 1, 0.5), "#f3ede0"));
  return parts;
}
function buildTownhouse(hut: Hut, seed: number): THREE.BufferGeometry[] {
  return buildBuildingShell(hut, WALL[(seed + 2) % WALL.length], ROOF[(seed + 1) % ROOF.length], seed);
}

function buildFountain(x: number, z: number, scale: number): THREE.BufferGeometry[] {
  const s = scale * M;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(cyl(1.9 * s, 2.0 * s, 0.3 * s, 16, x, 0, z, true), STONE));
  parts.push(pp(cyl(1.8 * s, 1.8 * s, 0.06 * s, 16, x, 0.26 * s, z), (pt, n) => shade("#6fc0d8", 0.85 + 0.15 * Math.max(0, n.y)), SWAY));
  parts.push(pp(cyl(0.32 * s, 0.38 * s, 0.62 * s, 10, x, 0.31 * s, z), STONE_D));
  parts.push(pp(cyl(0.82 * s, 0.82 * s, 0.09 * s, 12, x, 0.93 * s, z), STONE));
  parts.push(pp(cyl(0.72 * s, 0.72 * s, 0.05 * s, 12, x, 0.98 * s, z), (pt, n) => shade("#8fd4e8", 0.9 + 0.1 * Math.max(0, n.y)), SWAY));
  // jets of water, sprayed up from the top bowl's rim
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const jx = x + Math.sin(a) * 0.6 * s;
    const jz = z + Math.cos(a) * 0.6 * s;
    parts.push(pp(stick(v3(jx, 1.0 * s, jz), v3(x, 1.55 * s, z), 0.03 * s), "#bfe9f2", SWAY));
  }
  parts.push(pp(gem(0.14 * s, x, 1.62 * s, z, 1, 1.3, 1), "#dff4fa", SWAY));
  return parts;
}

/** the clock face's own height up the tower (local "ground = 0" space) — read by buildTownMoving
 *  too, so the hands pivot exactly where the static face sits. Real scale: ~18 m to the finial —
 *  the town's own landmark, well above every roof around it */
export const TOWN_CLOCK_FACE_Y = 13 * M;

function buildClockTowerBase(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(cyl(1.9 * M, 2.15 * M, 1.6 * M, 8, p.x, 0.8 * M, p.z), STONE_D));
  parts.push(pp(cyl(1.5 * M, 1.75 * M, 11 * M, 8, p.x, 1.6 * M + 5.5 * M, p.z), (pt, n) => shade("#d8cdb6", 0.86 + 0.14 * Math.max(0, n.y))));
  // the clock face itself, upright on the tower's side facing the square: built flat in LOCAL space
  // (its own little origin) then placed as one piece with a single rotate-by-yaw, so the ring of
  // ticks stays exactly where it belongs on the disc whichever way the tower faces
  const face: THREE.BufferGeometry[] = [];
  face.push(pp(new THREE.CylinderGeometry(1.8 * M, 1.8 * M, 0.2 * M, 12).rotateX(Math.PI / 2), TRIM));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    face.push(pp(gem(0.1 * M, Math.sin(a) * 1.5 * M, Math.cos(a) * 1.5 * M, 0.17 * M, 1, 0.6, 1), "#2a2420"));
  }
  // (every part above already went through pp() on its own — merging is enough, no second pp() pass)
  parts.push(place(mergeAll(face), p.x, TOWN_CLOCK_FACE_Y, p.z, p.yaw));
  // a little roofed cupola over the face (rotationally symmetric, no yaw needed), and a tall spire
  parts.push(pp(place(new THREE.ConeGeometry(1.8 * M, 2.2 * M, 8), p.x, TOWN_CLOCK_FACE_Y + 1.9 * M, p.z, 0), "#b5493a"));
  parts.push(pp(cyl(0.08 * M, 0.1 * M, 2.0 * M, 6, p.x, TOWN_CLOCK_FACE_Y + 3.0 * M, p.z), "#8a8478"));
  parts.push(pp(gem(0.22 * M, p.x, TOWN_CLOCK_FACE_Y + 5.0 * M, p.z, 1, 1.4, 1), "#f7d774", GLOW));
  return parts;
}

function buildBandstand(p: SettlementProp): THREE.BufferGeometry[] {
  const s = p.scale * M;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(cyl(1.85 * s, 1.85 * s, 0.3 * s, 10, p.x, 0.15 * s, p.z), WOOD));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(pp(cyl(0.045 * s, 0.045 * s, 1.5 * s, 6, p.x + Math.sin(a) * 1.65 * s, 0.3 * s, p.z + Math.cos(a) * 1.65 * s), TRIM));
  }
  parts.push(pp(cyl(1.95 * s, 1.95 * s, 0.08 * s, 10, p.x, 1.8 * s, p.z, true), TRIM));
  parts.push(pp(place(new THREE.ConeGeometry(2.1 * s, 1.25 * s, 10), p.x, 1.85 * s + 0.6 * s, p.z, 0), "#e8705f"));
  parts.push(pp(gem(0.13 * s, p.x, 3.1 * s, p.z, 1, 1.3, 1), "#f7d774"));
  return parts;
}

function buildStall(p: SettlementProp, good: string): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const color = townStallColor(good);
  const faceA = Math.sin(p.yaw);
  const faceB = Math.cos(p.yaw);
  parts.push(pp(place(box(2.6 * M, 1.1 * M, 1.4 * M), p.x, 0.55 * M, p.z, p.yaw), WOOD));
  // the striped awning: alternating panels over a frame
  for (let i = 0; i < 2; i++) for (const side of [-1, 1]) parts.push(pp(cyl(0.05 * M, 0.05 * M, 1.9 * M, 5, p.x + Math.sin(p.yaw + Math.PI / 2) * side * 1.1 * M - faceA * (0.5 - i) * M, 1.1 * M, p.z + Math.cos(p.yaw + Math.PI / 2) * side * 1.1 * M - faceB * (0.5 - i) * M), WOOD_D));
  const AWN = 6;
  for (let i = 0; i < AWN; i++) {
    const t = (i / AWN - 0.5) * 2.3 * M;
    const ax = p.x + Math.sin(p.yaw + Math.PI / 2) * t - faceA * 1.1 * M;
    const az = p.z + Math.cos(p.yaw + Math.PI / 2) * t - faceB * 1.1 * M;
    parts.push(pp(place(box((2.3 * M) / AWN, 0.08 * M, 1.4 * M), ax, 2.1 * M - (Math.abs(t) / M) * 0.12 * M, az, p.yaw, 1, -0.35), i % 2 ? color : TRIM));
  }
  // piles of the good itself on the counter, in its own colour
  for (let i = 0; i < 5; i++) {
    const gx = p.x + Math.sin(p.yaw + Math.PI / 2) * (i - 2) * 0.42 * M + faceA * 0.4 * M;
    const gz = p.z + Math.cos(p.yaw + Math.PI / 2) * (i - 2) * 0.42 * M + faceB * 0.4 * M;
    parts.push(pp(gem(0.24 * M, gx, (1.2 + (i % 2) * 0.15) * M, gz, 1, 0.9, 1), color));
  }
  return parts;
}

/** real scale: ~14 m to the roof's own tip, big sails (buildTownMoving) mounted on the upper body */
function buildWindmillBase(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(cyl(2.1 * M, 2.9 * M, 8.0 * M, 10, p.x, 4.0 * M, p.z), (pt, n) => shade("#e8e2d0", 0.84 + 0.16 * Math.max(0, n.y))));
  parts.push(pp(place(new THREE.ConeGeometry(2.4 * M, 3.3 * M, 10), p.x, 8.0 * M + 1.65 * M, p.z, p.yaw), "#b5493a"));
  parts.push(pp(box(0.7 * M, 2.0 * M, 0.08, p.x, 3.0 * M, p.z + 2.2 * M, p.yaw), WOOD_D));
  return parts;
}
/** a proper sunflower: a green stem with 2 leaves, a big ring of yellow petals round a small brown
 *  centre, facing straight up at the sky (every petal and the centre are gem() blobs, not a rotated
 *  flat card, so there's no risk of a petal ending up edge-on or pointing the wrong way) */
function buildSunflower(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const topY = 2.3 * M * p.scale;
  parts.push(pp(stick(v3(p.x, 0, p.z), v3(p.x, topY, p.z), 0.08 * M), "#5a8f3c"));
  // two broad leaves partway up the stalk
  for (const s of [-1, 1]) parts.push(pp(gem(0.4 * M * p.scale, p.x + s * 0.22 * M * p.scale, 1.1 * M * p.scale, p.z, s * 1.9, 0.45, 1.2), "#4a8f3c"));
  // the ring of petals — 8, each a wide flat blob, overlapping at the base like real petals do, so
  // the ring reads solid and MUCH bigger across than the centre
  const ringR = 0.62 * M * p.scale;
  const petalR = 0.34 * M * p.scale;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = p.x + Math.sin(a) * ringR;
    const pz = p.z + Math.cos(a) * ringR;
    parts.push(pp(gem(petalR, px, topY, pz, 1.3, 0.3, 1.3), "#f7d774"));
  }
  // the small dark centre, on top so it's never hidden by the petals
  parts.push(pp(gem(0.26 * M * p.scale, p.x, topY + 0.03 * M, p.z, 1, 0.45, 1), "#4a3420"));
  return parts;
}
/** a sheaf of wheat: five golden stalks nodding together, planted close so a row of these reads as
 *  a dense field, not a scatter of single stalks */
function buildWheat(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const h = 1.65 * M * p.scale;
  for (let i = 0; i < 5; i++) {
    const ox = (i - 2) * 0.16 * M * p.scale;
    const oz = ((i % 3) - 1) * 0.14 * M * p.scale;
    const lean = ox * 0.35;
    parts.push(pp(stick(v3(p.x + ox, 0, p.z + oz), v3(p.x + ox + lean, h, p.z + oz), 0.045 * M), "#c9a441"));
    parts.push(pp(gem(0.22 * M * p.scale, p.x + ox + lean, h * 0.94, p.z + oz, 0.8, 1.9, 0.8), "#e3c15a"));
  }
  return parts;
}
function buildLampPost(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(cyl(0.12 * M, 0.15 * M, 3.4 * M, 7, p.x, 0, p.z), "#3a3a3a"));
  parts.push(pp(cyl(0.3 * M, 0.27 * M, 0.14 * M, 8, p.x, 3.4 * M, p.z), "#3a3a3a"));
  parts.push(pp(gem(0.28 * M, p.x, 3.75 * M, p.z, 1, 1.2, 1), "#ffd98a", GLOW));
  parts.push(pp(cone(0.36 * M, 0.4 * M, 6, p.x, 4.0 * M, p.z), "#2a2a2a"));
  return parts;
}
function buildPlanter(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(place(box(1.1 * M, 0.5 * M, 1.1 * M), p.x, 0.25 * M, p.z, p.yaw), WOOD_D));
  for (let i = 0; i < 4; i++) parts.push(pp(gem(0.17 * M, p.x + Math.sin(i) * 0.3 * M, 0.58 * M, p.z + Math.cos(i) * 0.3 * M, 1, 1, 1), FLOWER_COLORS[i % FLOWER_COLORS.length], GLOW));
  return parts;
}
function buildBuntingT(p: SettlementProp): THREE.BufferGeometry[] {
  // p.scale is the real distance across the street between the two buildings it's strung from
  const parts: THREE.BufferGeometry[] = [];
  const n = Math.max(3, Math.round(p.scale / (1.3 * M)));
  const colors = ["#f7d774", "#8fc7e8", "#e8705f", "#7fb86a"];
  const hangY = 4.3 * M;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = p.x + Math.sin(p.yaw) * p.scale * t;
    const z = p.z + Math.cos(p.yaw) * p.scale * t;
    const sag = Math.sin(Math.PI * t) * 0.9 * M;
    const flag = flat([
      [0, 0],
      [0.36 * M, 0],
      [0.18 * M, -0.48 * M],
    ]);
    parts.push(pp(place(flag, x, hangY - sag, z, p.yaw + Math.PI / 2), colors[i % colors.length]));
  }
  return parts;
}
function buildCartParked(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(place(box(2.7 * M, 1.05 * M, 1.6 * M), p.x, 1.0 * M, p.z, p.yaw), "#8a6238"));
  for (const side of [-1.0 * M, 1.0 * M]) parts.push(pp(place(new THREE.CylinderGeometry(0.58 * M, 0.58 * M, 0.2 * M, 10).rotateX(Math.PI / 2), p.x + Math.sin(p.yaw) * side, 0.58 * M, p.z + Math.cos(p.yaw) * side, p.yaw), "#3a2a1c"));
  parts.push(pp(place(new THREE.ConeGeometry(2.1 * M, 1.4 * M, 4), p.x, 2.4 * M, p.z, p.yaw + Math.PI / 4), "#e8705f"));
  return parts;
}
export function buildTownPropsGeometry(def: SettlementDef, low: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // the square's own packed-earth plaza colour comes for free (lib/park/world/fantasy/mask.ts
  // carves every settlement's own plaza/path colour, generic over SETTLEMENTS) — scatter real
  // cobblestones across most of the town floor on top of it, so it reads as paved, not bare
  parts.push(...buildPathStones(def.x, def.z, def.radius * 0.68, 150, 50505, COBBLE));
  // the welcome arch at the path in from the station (common.ts works out where that is itself)
  parts.push(...buildWelcomeArch(def, [WALL[0], WALL[1], WALL[2], WALL[3]]));
  def.huts.forEach((h, i) => {
    const seed = i;
    let built: THREE.BufferGeometry[];
    switch (h.kind) {
      case "shop-bakery":
        built = buildBakery(h);
        break;
      case "shop-sweet":
        built = buildSweetShop(h);
        break;
      case "shop-cafe":
        built = buildCafe(h);
        break;
      case "shop-post":
        built = buildPostOffice(h);
        break;
      case "shop-general":
        built = buildGeneralStore(h);
        break;
      case "shop-toy":
        built = buildToyShop(h);
        break;
      case "shop-grocer":
        built = buildGrocer(h);
        break;
      case "shop-cheesewool":
        built = buildCheeseWoolShop(h);
        break;
      default:
        built = buildTownhouse(h, seed);
        break;
    }
    parts.push(...footed(built, h.x, h.z));
  });
  for (const p of def.props) {
    switch (true) {
      case p.kind === "fountain":
        parts.push(...footed(buildFountain(p.x, p.z, p.scale), p.x, p.z));
        break;
      case p.kind === "clocktower":
        parts.push(...footed(buildClockTowerBase(p), p.x, p.z));
        break;
      case p.kind === "bandstand":
        parts.push(...footed(buildBandstand(p), p.x, p.z));
        break;
      case p.kind.startsWith("stall-"):
        parts.push(...footed(buildStall(p, p.kind.slice(6)), p.x, p.z));
        break;
      case p.kind === "windmill":
        parts.push(...footed(buildWindmillBase(p), p.x, p.z));
        break;
      case p.kind === "sunflower":
        parts.push(...footed(buildSunflower(p), p.x, p.z));
        break;
      case p.kind === "wheat":
        parts.push(...footed(buildWheat(p), p.x, p.z));
        break;
      case p.kind === "lamp-post":
        parts.push(...footed(buildLampPost(p), p.x, p.z));
        break;
      case p.kind === "bench":
        parts.push(...footed(buildBench(p, WOOD), p.x, p.z));
        break;
      case p.kind === "planter":
        parts.push(...footed(buildPlanter(p), p.x, p.z));
        break;
      case p.kind === "bunting":
        parts.push(...footed(buildBuntingT(p), p.x, p.z));
        break;
      case p.kind === "cart-parked":
        parts.push(...footed(buildCartParked(p), p.x, p.z));
        break;
      default:
        break;
    }
  }
  return mergeAll(parts);
}

// ── the moving parts: the clock's hour/minute hands and the windmill's spinning sails. Each is its
// own tiny mesh (not merged with the static props — they need their own per-frame rotation), built
// in LOCAL space round a pivot so a plain Y/Z rotation each frame is all `update()` has to do ──
export interface TownMoving {
  update(t: number, hour: number): void;
  dispose(): void;
}

function handGeo(len: number, w: number, thick: number): THREE.BufferGeometry {
  // a thin tapered hand, pivoting at the origin, pointing toward local +y (lying flat against the
  // clock face's own plane — see the pivot's rotation below, which matches buildClockTowerBase's
  // static face so the hands always sit exactly on top of it, whichever way the tower faces)
  const g = box(w, len, thick);
  g.translate(0, len / 2 - w * 0.4, 0.2 * M);
  return g;
}

export function buildTownMoving(group: THREE.Group, def: SettlementDef, low: boolean, U: FantasyUniforms): TownMoving {
  const clockP = def.props.find((p) => p.kind === "clocktower");
  const millP = def.props.find((p) => p.kind === "windmill");
  const mat = fxMaterial(U, { roughness: 0.7, metalness: 0, flatShading: true });
  const dispose: (() => void)[] = [];

  let hourHand: THREE.Mesh | null = null;
  let minHand: THREE.Mesh | null = null;
  if (clockP) {
    const gy = groundY(clockP.x, clockP.z);
    const pivot = new THREE.Group();
    pivot.position.set(clockP.x, gy + TOWN_CLOCK_FACE_Y, clockP.z);
    pivot.rotation.y = clockP.yaw;
    group.add(pivot);
    const hg = pp(handGeo(1.3 * M, 0.17 * M, 0.08 * M), "#2a2420");
    hourHand = new THREE.Mesh(hg, mat);
    hourHand.name = "town-clock-hour";
    pivot.add(hourHand);
    const mg = pp(handGeo(1.9 * M, 0.12 * M, 0.07 * M), "#2a2420");
    minHand = new THREE.Mesh(mg, mat);
    minHand.name = "town-clock-minute";
    pivot.add(minHand);
    dispose.push(() => {
      group.remove(pivot);
      hg.dispose();
      mg.dispose();
    });
  }

  let sails: THREE.Mesh | null = null;
  if (millP) {
    const gy = groundY(millP.x, millP.z);
    // on the tower's upper body, clearly BELOW the roof cone (which starts at 8*M — see
    // buildWindmillBase) so the sails read as mounted on the front face, not buried in the roof
    const hubY = gy + 5.3 * M;
    const pivot = new THREE.Group();
    pivot.position.set(millP.x, hubY, millP.z);
    pivot.rotation.y = millP.yaw;
    group.add(pivot);
    const parts: THREE.BufferGeometry[] = [];
    // a small hub cap, plus 4 big blades (each a tapered double-plank for a storybook "sail" look)
    parts.push(place(new THREE.ConeGeometry(0.45 * M, 0.6 * M, 6), 0, 0, 0, 0, 1, Math.PI / 2));
    for (let i = 0; i < 4; i++) {
      const blade: THREE.BufferGeometry[] = [];
      blade.push(place(box(0.75 * M, 4.3 * M, 0.16 * M), 0, 2.3 * M, 0));
      blade.push(place(box(0.24 * M, 3.8 * M, 0.13 * M), 0, 2.15 * M, 0.14 * M));
      const g = mergeAll(blade);
      g.rotateZ((i * Math.PI) / 2);
      parts.push(g);
    }
    const sailsGeo = pp(mergeAll(parts), "#ead9ae");
    sails = new THREE.Mesh(sailsGeo, mat);
    sails.name = "town-windmill-sails";
    // well clear of the tower's own body (radius ~2.1-2.9 m) so the whole cross reads in front of it
    sails.position.z = 3.3 * M;
    pivot.add(sails);
    dispose.push(() => {
      group.remove(pivot);
      sailsGeo.dispose();
    });
  }

  const TAU = Math.PI * 2;
  return {
    update(t, hour) {
      if (hourHand) hourHand.rotation.z = -((hour % 12) / 12) * TAU;
      if (minHand) minHand.rotation.z = -(((hour * 60) % 60) / 60) * TAU;
      if (sails) sails.rotation.z = t * 0.6;
    },
    dispose() {
      for (const d of dispose) d();
      mat.dispose();
    },
  };
}
