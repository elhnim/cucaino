// Highstone's look: candy-bright whitewashed/pastel stone cottages — each its own wall/door/roof
// combo — with timber-framed gables, smoking chimneys, flower boxes and hanging baskets, a well
// with a roof and bucket, a little bell tower, cheese wheels drying on racks, a terraced vegetable
// garden walled in stone, firewood stacks, bunting across the square, barrels and crates dotted
// through the yards, and the yak-and-goat (and sheep) pasture behind its fence.
import * as THREE from "three";
import type { SettlementDef, SettlementHut, SettlementProp } from "../../../registry/settlements";
import { box, col, cone, cyl, flat, fp, lump, mergeAll, place, pp, stick, v3 } from "../../village/kit";
import {
  WOOD,
  WOOD_D,
  buildBarrel,
  buildBench,
  buildCrate,
  buildFencePanel,
  buildFirepit,
  buildFlowerBed,
  buildFlowerBox,
  buildHangingBasket,
  buildLantern,
  buildPathStones,
  buildPennant,
  buildSmokePuff,
  buildWelcomeArch,
  buildWindow,
  footed,
  shade,
} from "./common";

/** every cottage picks ONE of these fully-coordinated combos (not a random wall + a random roof +
 *  a random door, which tends to muddy) — whitewash/pastel walls, a deep saturated door, a
 *  slate-blue or terracotta roof, a bright trim: a real candy-bright mountain village, every
 *  building reading as its own little postcard */
const COTTAGE_STYLES = [
  { wall: "#f6efe0", door: "#c0392b", roof: "#3f6ea8", trim: "#f2c23d" },
  { wall: "#eadcc4", door: "#2a4a8a", roof: "#c96a3f", trim: "#5aa852" },
  { wall: "#f2e0e6", door: "#2a7a52", roof: "#3f6ea8", trim: "#e8485f" },
  { wall: "#e3ecd4", door: "#a8323a", roof: "#c96a3f", trim: "#4fb4e8" },
  { wall: "#eef0f4", door: "#8a2a8a", roof: "#c96a3f", trim: "#f2c23d" },
  { wall: "#f4e6cf", door: "#2a4a8a", roof: "#3f6ea8", trim: "#e8485f" },
  { wall: "#e6e0f0", door: "#c0392b", roof: "#c96a3f", trim: "#5aa852" },
];
const STONE_D = "#7a6f5e";
const BUNTING = ["#e8485f", "#ffc23d", "#4fb4e8", "#5aa852", "#a860d6"];
const BLOOM = ["#e8485f", "#ffc23d", "#eef0f4", "#ff8fc9", "#5aa852"];
/** a stone cottage: whitewashed/pastel walls, timber cross-braces over them, a banded roof in
 *  slate-blue or terracotta, a smoking chimney, a window with shutters, a flower box AND a hanging
 *  basket, a stone step up to the door. Built entirely in terms of `hut.size` — registry/settlements.ts
 *  generates Highstone's huts at a size already picked so the ridge comes out ~3.5-4.5 m (1 m ≈
 *  1.6 world units; a 1.4 m child kid stands 2.26 units tall) */
function buildCottage(hut: SettlementHut, seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const s = hut.size;
  const w = 1.9 * s;
  const d = 1.7 * s;
  const wallH = 1.7 * s;
  const style = COTTAGE_STYLES[seed % COTTAGE_STYLES.length];
  parts.push(pp(place(box(w, wallH, d), hut.x, wallH / 2, hut.z, hut.yaw), (pt, n) => shade(style.wall, 0.88 + 0.14 * Math.max(0, n.y) + (Math.sin(pt.x * 5 + seed) > 0.7 ? -0.04 : 0))));
  // timber cross-braces on the gable end (the wall facing the fire), a half-timbered look
  const gx = hut.x + Math.sin(hut.yaw) * w * 0.501;
  const gz = hut.z + Math.cos(hut.yaw) * d * 0.501;
  const sideX = Math.sin(hut.yaw + Math.PI / 2);
  const sideZ = Math.cos(hut.yaw + Math.PI / 2);
  for (const ox of [-w * 0.32, w * 0.32]) parts.push(pp(place(box(0.1 * s, wallH * 0.85, 0.07 * s), gx + sideX * ox, wallH * 0.5, gz + sideZ * ox, hut.yaw), WOOD_D));
  parts.push(pp(place(box(w * 0.9, 0.09 * s, 0.07 * s), gx, wallH * 0.62, gz, hut.yaw), WOOD_D));
  // a gabled roof, banded like real slate/tile rows (reuses the deck-ring trick: step colour by
  // height, not one flat cone)
  const roof = place(new THREE.ConeGeometry(Math.hypot(w, d) * 0.62, 1.1 * s, 4), hut.x, wallH + 0.55 * s, hut.z, hut.yaw + Math.PI / 4);
  parts.push(
    pp(roof, (pt, n) => {
      const row = Math.floor((pt.y - wallH) / (0.18 * s)) % 2;
      return shade(style.roof, (row ? 0.8 : 0.96) + 0.16 * Math.max(0, n.y));
    })
  );
  const chimX = hut.x - Math.sin(hut.yaw) * w * 0.3;
  const chimZ = hut.z - Math.cos(hut.yaw) * d * 0.3;
  parts.push(pp(box(0.3 * s, 1.0 * s, 0.3 * s, chimX, wallH + 0.85 * s, chimZ), STONE_D));
  parts.push(...buildSmokePuff(chimX, wallH + 1.55 * s, chimZ, 0.26 * s));
  // door, facing the fire, with a stone step up to it
  const doorX = hut.x + Math.sin(hut.yaw) * w * 0.52;
  const doorZ = hut.z + Math.cos(hut.yaw) * d * 0.52;
  parts.push(pp(box(0.85 * s, 1.5 * s, 0.1 * s, doorX, 0.75 * s, doorZ, hut.yaw), style.door));
  parts.push(pp(box(0.85 * s + 0.14 * s, 1.5 * s + 0.1 * s, 0.07 * s, doorX - Math.sin(hut.yaw) * 0.04 * s, 0.75 * s, doorZ - Math.cos(hut.yaw) * 0.04 * s, hut.yaw), WOOD_D));
  parts.push(pp(place(box(1.1 * s, 0.18 * s, 0.4 * s), doorX + Math.sin(hut.yaw) * 0.32 * s, 0.09 * s, doorZ + Math.cos(hut.yaw) * 0.32 * s, hut.yaw), STONE_D));
  // a window with shutters, a flower box AND a hanging basket, on the side
  const winA = hut.yaw + Math.PI * 0.55;
  const winX = hut.x + Math.sin(winA) * w * 0.52;
  const winZ = hut.z + Math.cos(winA) * d * 0.46;
  parts.push(...buildWindow(winX, wallH * 0.58, winZ, winA, style.trim, 0.46 * s, 0.5 * s));
  parts.push(...buildFlowerBox(winX, wallH * 0.3, winZ, winA, BLOOM, seed));
  const basketA = hut.yaw - Math.PI * 0.6;
  parts.push(...buildHangingBasket(hut.x + Math.sin(basketA) * w * 0.52, wallH * 0.82, hut.z + Math.cos(basketA) * d * 0.46, basketA, BLOOM, seed + 2));
  return parts;
}
function buildTrough(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(place(box(1.6, 0.4, 0.7), p.x, 0.2, p.z, p.yaw), STONE_D));
  parts.push(pp(place(box(1.4, 0.26, 0.5), p.x, 0.3, p.z, p.yaw), "#5fa0c9"));
  return parts;
}
function buildFirewoodStack(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 4; i++) {
      const x = p.x + Math.sin(p.yaw + Math.PI / 2) * (i - 1.5) * 0.3;
      const z = p.z + Math.cos(p.yaw + Math.PI / 2) * (i - 1.5) * 0.3;
      parts.push(pp(place(cyl(0.14, 0.14, 0.8, 6, 0, 0, 0).rotateZ(Math.PI / 2), x, 0.14 + row * 0.26, z, p.yaw), row % 2 ? "#6e4a2a" : "#8a6238"));
    }
  return parts;
}
function buildLoom(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-0.5, 0.5])
    for (const f of [-0.35, 0.35]) parts.push(pp(cyl(0.05, 0.05, 1.5, 5, p.x + Math.sin(p.yaw) * s + Math.sin(p.yaw + Math.PI / 2) * f, 0, p.z + Math.cos(p.yaw) * s + Math.cos(p.yaw + Math.PI / 2) * f), "#5e3f22"));
  parts.push(pp(box(1.1, 0.05, 0.8, p.x, 1.5, p.z, p.yaw), "#8a6238"));
  for (let i = 0; i < 6; i++) {
    const f = (i / 5 - 0.5) * 0.7;
    parts.push(pp(stick(v3(p.x + Math.sin(p.yaw + Math.PI / 2) * f, 0.4, p.z + Math.cos(p.yaw + Math.PI / 2) * f), v3(p.x + Math.sin(p.yaw + Math.PI / 2) * f, 1.48, p.z + Math.cos(p.yaw + Math.PI / 2) * f), 0.02), BUNTING[i % BUNTING.length]));
  }
  return parts;
}
function buildFencePost(p: SettlementProp): THREE.BufferGeometry[] {
  return [pp(cyl(0.07, 0.08, 1.1, 5, p.x, 0, p.z), "#5e4a34")];
}
function buildBunting(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const n = Math.max(2, Math.round(p.scale / 1.1));
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = p.x + Math.sin(p.yaw) * p.scale * t;
    const z = p.z + Math.cos(p.yaw) * p.scale * t;
    const sag = Math.sin(Math.PI * t) * 0.35;
    const flag = flat([[0, 0], [0.22, 0], [0.11, -0.3]]);
    parts.push(pp(place(flag, x, 2.4 - sag, z, p.yaw + Math.PI / 2), BUNTING[i % BUNTING.length]));
  }
  return parts;
}

/** the village well: a round stone ring, two posts, a little bright-roofed cap, and a bucket on a
 *  rope */
function buildWell(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(cyl(0.75, 0.8, 0.7, 10, p.x, 0, p.z, true), (pt, n) => shade("#eef0f4", 0.85 + 0.2 * Math.max(0, n.y))));
  parts.push(pp(cyl(0.82, 0.82, 0.1, 10, p.x, 0.7, p.z), "#d8cdb8"));
  for (const s of [-1, 1]) parts.push(pp(cyl(0.07, 0.07, 1.4, 6, p.x + s * 0.6, 0.7, p.z), WOOD_D));
  parts.push(pp(place(new THREE.ConeGeometry(1.1, 0.6, 4), p.x, 2.1, p.z, Math.PI / 4), "#3f6ea8"));
  parts.push(pp(stick(v3(p.x, 2.1, p.z), v3(p.x, 1.15, p.z), 0.015), "#3a2a18"));
  parts.push(pp(box(0.26, 0.26, 0.26, p.x, 1.0, p.z), "#6e4a2a"));
  return parts;
}

/** a little bell tower in the square: four timber legs, a bright-roofed cap, a bell that just
 *  hangs (no need to ring it to read as "the village bell"), and a flag on top */
function buildBellTower(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const h = 3.6;
  for (const [sx, sz] of [[0.42, 0.42], [-0.42, 0.42], [0.42, -0.42], [-0.42, -0.42]]) parts.push(pp(cyl(0.1, 0.12, h, 6, p.x + sx, 0, p.z + sz), WOOD_D));
  parts.push(pp(cyl(0.6, 0.6, 0.12, 8, p.x, h, p.z), WOOD));
  parts.push(pp(place(new THREE.ConeGeometry(0.75, 0.9, 8), p.x, h + 0.5, p.z, 0), "#c96a3f"));
  parts.push(pp(cyl(0.22, 0.26, 0.34, 8, p.x, h - 0.5, p.z), "#e8c23d"));
  parts.push(...buildPennant(p.x, p.z, h + 1.05, BUNTING[2]));
  return parts;
}

/** cheese wheels drying on a wooden rack, two shelves */
function buildCheeseRack(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (const [sx, sz] of [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]]) parts.push(pp(cyl(0.035, 0.035, 1.1, 5, p.x + Math.sin(p.yaw) * sx + Math.sin(p.yaw + Math.PI / 2) * sz, 0, p.z + Math.cos(p.yaw) * sx + Math.cos(p.yaw + Math.PI / 2) * sz), WOOD_D));
  for (const shelfY of [0.4, 0.85]) {
    parts.push(pp(place(box(1.3, 0.04, 0.9), p.x, shelfY, p.z, p.yaw), WOOD));
    for (let i = 0; i < 3; i++) {
      const t = (i - 1) * 0.4;
      parts.push(pp(cyl(0.22, 0.24, 0.2, 10, p.x + Math.sin(p.yaw + Math.PI / 2) * t, shelfY + 0.1, p.z + Math.cos(p.yaw + Math.PI / 2) * t), "#f2d27a"));
    }
  }
  return parts;
}

/** one terraced bed: a low stone retaining wall holding back a strip of dark earth, a row of
 *  cabbages or a couple of fat pumpkins, a little fence either end */
function buildGardenBed(p: SettlementProp, pumpkin: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const len = p.scale;
  parts.push(pp(place(box(len, 0.45, 0.5), p.x, 0.22, p.z, p.yaw), (pt, n) => shade(STONE_D, 0.86 + 0.18 * Math.max(0, n.y))));
  parts.push(pp(place(box(len * 0.96, 0.18, 0.46), p.x, 0.47, p.z, p.yaw), "#4a3a28"));
  const n = pumpkin ? 3 : 5;
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1) - 0.5) * (len * 0.82);
    const vx = p.x + Math.sin(p.yaw) * t;
    const vz = p.z + Math.cos(p.yaw) * t;
    if (pumpkin) parts.push(pp(lump(0.22, vx, 0.57, vz, i * 3 + 1, 1.15, 0.85, 1.15, 0.22), "#e8893c"));
    else parts.push(pp(lump(0.16, vx, 0.56, vz, i * 5 + 2, 1, 0.9, 1, 0.3), col("#5aa852")));
  }
  const endA = p.x + Math.sin(p.yaw) * (len / 2 + 0.3);
  const endAz = p.z + Math.cos(p.yaw) * (len / 2 + 0.3);
  const endB = p.x - Math.sin(p.yaw) * (len / 2 + 0.3);
  const endBz = p.z - Math.cos(p.yaw) * (len / 2 + 0.3);
  parts.push(...buildFencePanel(endA, endAz, endA + Math.sin(p.yaw + Math.PI / 2) * 1.4, endAz + Math.cos(p.yaw + Math.PI / 2) * 1.4));
  parts.push(...buildFencePanel(endB, endBz, endB - Math.sin(p.yaw + Math.PI / 2) * 1.4, endBz - Math.cos(p.yaw + Math.PI / 2) * 1.4));
  return parts;
}

export function buildMountainPropsGeometry(def: SettlementDef): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // footed() lifts every part to the REAL ground at its own spot — Highstone sits high on the
  // mountain's own slopes, nowhere near Lakeside's near-sea-level y=0 assumption
  def.huts.forEach((h, i) => parts.push(...footed(buildCottage(h, i), h.x, h.z)));
  parts.push(...footed(buildPathStones(def.x, def.z, 9, 80, 3003, "#c9bca0"), def.x, def.z));
  // a scatter of barrels, crates and flower beds between the cottages — so the yards between
  // buildings read as lived-in, not bare dirt
  const SEEDR = (n: number) => {
    let s = (n * 2654435761) >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  };
  const rd = SEEDR(4007);
  for (let i = 0; i < def.huts.length; i++) {
    const h = def.huts[i];
    const a = h.yaw + Math.PI + (rd() - 0.5) * 1.2;
    const dist = h.size * 1.05 + 1.4;
    const dx = h.x + Math.sin(a) * dist;
    const dz = h.z + Math.cos(a) * dist;
    if (i % 3 === 0) parts.push(...footed(buildBarrel(dx, dz, rd() * Math.PI * 2), dx, dz));
    else if (i % 3 === 1) parts.push(...footed([...buildCrate(dx, dz, rd() * Math.PI * 2), ...buildBarrel(dx + 0.5, dz + 0.3, rd() * Math.PI * 2, undefined, undefined, 0.85)], dx, dz));
    else parts.push(...footed(buildFlowerBed(dx, dz, BLOOM, i * 7 + 3), dx, dz));
  }
  // buildWelcomeArch feet itself at its own spot — don't foot it again here (that would lift it a
  // second time, by the village centre's own height)
  parts.push(...buildWelcomeArch(def, BUNTING));
  let gardenI = 0;
  for (const p of def.props) {
    switch (p.kind) {
      case "firepit":
        parts.push(...footed(buildFirepit(p.x, p.z), p.x, p.z));
        break;
      case "bench":
        parts.push(...footed(buildBench(p), p.x, p.z));
        break;
      case "trough":
        parts.push(...footed(buildTrough(p), p.x, p.z));
        break;
      case "firewood":
        parts.push(...footed(buildFirewoodStack(p), p.x, p.z));
        break;
      case "loom":
        parts.push(...footed(buildLoom(p), p.x, p.z));
        break;
      case "fencepost":
        parts.push(...footed(buildFencePost(p), p.x, p.z));
        break;
      case "bunting":
        parts.push(...footed(buildBunting(p), p.x, p.z));
        break;
      case "lantern":
        parts.push(...footed(buildLantern(p), p.x, p.z));
        break;
      case "well":
        parts.push(...footed(buildWell(p), p.x, p.z));
        break;
      case "belltower":
        parts.push(...footed(buildBellTower(p), p.x, p.z));
        break;
      case "cheeserack":
        parts.push(...footed(buildCheeseRack(p), p.x, p.z));
        break;
      case "gardenbed":
        parts.push(...footed(buildGardenBed(p, gardenI++ % 2 === 0), p.x, p.z));
        break;
      default:
        break;
    }
  }
  return mergeAll(parts);
}

// ── Highstone's yaks, goats and sheep: a shaggy, horned quadruped, built once and instanced,
// sharing the folk crowd's own material (world/settlements/index.ts) — the body takes the instance
// colour (slot 1), so each one can be brown, black, cream or (sheep) creamy-white wool without a
// second geometry ──
export function buildYakGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const WHITE = "#ffffff";
  parts.push(fp(lump(0.62, 0, 0.78, 0, 2, 1.05, 0.92, 1.35, 0.22), WHITE, 1));
  parts.push(fp(lump(0.34, 0, 0.95, 0.72, 5, 1, 1, 1, 0.22), WHITE, 1));
  for (const [sx, sz] of [
    [0.3, 0.5],
    [-0.3, 0.5],
    [0.3, -0.45],
    [-0.3, -0.45],
  ])
    parts.push(fp(cyl(0.09, 0.1, 0.75, 6, sx, 0, sz), WHITE, 1));
  // horns (always ivory, never tinted)
  for (const sx of [-0.16, 0.16]) parts.push(fp(cone(0.06, 0.32, 5, sx, 1.1, 0.78), "#e8dcc0", 0));
  // a tail
  parts.push(fp(stick(v3(0, 0.75, -0.62), v3(0, 0.3, -0.78), 0.05), WHITE, 1));
  return mergeAll(parts);
}
