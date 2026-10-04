// Lakeside's look: round reed-thatched stilt huts painted with wave/fish bands, a wooden pier,
// drying racks hung with fish, nets on poles, a smokehouse with a chimney, a fire pit ringed by
// log benches, a welcome arch, wind chimes, a lookout tower with a flag, a boat on trestles being
// mended, a reed bed and lily pads at the shore, and lanterns throughout.
import * as THREE from "three";
import type { SettlementDef, SettlementHut, SettlementProp } from "../../../registry/settlements";
import { ball, box, col, cone, cyl, flat, gem, mergeAll, place, pp, stick, v3 } from "../../village/kit";
import {
  SWAY,
  WOOD,
  WOOD_D,
  buildBarrel,
  buildBench,
  buildCart,
  buildCrate,
  buildDoorLamp,
  buildFirepit,
  buildFlowerBed,
  buildFlowerBox,
  buildLantern,
  buildPathStones,
  buildPennant,
  buildSmokePuff,
  buildWashingLine,
  buildWelcomeArch,
  buildWindow,
  shade,
} from "./common";

// every hut picks ONE fully-coordinated combo — candy-bright teal, coral or sunny-yellow walls,
// a deep-blue or orange trim, golden-honey thatch — so the cluster reads as a row of postcards,
// not one muddy palette smeared over every roof
const HUT_STYLES = [
  { wall: "#2ab0a3", trim: "#e8893c", thatch: "#e0a847" },
  { wall: "#ff8f6b", trim: "#2a4a8a", thatch: "#e8bd5a" },
  { wall: "#ffd24a", trim: "#2a9d8f", thatch: "#d99a3f" },
  { wall: "#5ab0e8", trim: "#ff6f5a", thatch: "#e8bd5a" },
  { wall: "#ff6fa0", trim: "#2a9d8f", thatch: "#e0a847" },
  { wall: "#5aa852", trim: "#ffc23d", thatch: "#d99a3f" },
];
const STONE = "#c9bca0";
const TRIM = ["#2a4a8a", "#e8893c", "#2a9d8f", "#e8485f"];
const BLOOM = ["#ff6fa0", "#ffd24a", "#ff9a4a", "#ff5a5a", "#eef0f4"];

/** a round reed hut on four short stilts, door facing `hut.yaw`, painted with a wavy band and a
 *  little school of fish near the waterline, a window with shutters, a flower box and a door lamp
 *  (land huts only — stilt huts over the water skip the flower box, nobody waters it) */
function buildHut(hut: SettlementHut, seed: number, low: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const s = hut.size;
  const r = 1.9 * s;
  const stiltH = 0.55 * s;
  const wallH = 2.0 * s;
  const seg = low ? 8 : 10;
  const style = HUT_STYLES[seed % HUT_STYLES.length];
  for (const [sx, sz] of [
    [0.75, 0.75],
    [-0.75, 0.75],
    [0.75, -0.75],
    [-0.75, -0.75],
  ]) {
    parts.push(pp(cyl(0.12 * s, 0.14 * s, stiltH, 6, sx * r * 0.62, 0, sz * r * 0.62), WOOD_D));
  }
  parts.push(pp(cyl(r + 0.15, r + 0.15, 0.14 * s, seg, 0, stiltH, 0), WOOD));
  // the reed wall: a clean, solid wall colour (no painted threshold across these few big flat
  // faces — that's exactly what read as a glitch before: huge flat triangles), a single painted
  // WAVE BAND as its own thin ring (not a threshold), and a few small separate decal shapes (a
  // fish, a shell, a wave-crest) glued onto the wall — a storybook cottage never has a blank wall,
  // but the pattern has to be its own little shapes, not a coarse per-face paint job
  const wallY0 = stiltH + 0.07 * s;
  parts.push(pp(cyl(r, r * 0.92, wallH, seg, 0, wallY0, 0, true), (p, n) => shade(style.wall, 0.9 + 0.1 * Math.max(0, n.z))));
  const bandY = wallY0 + wallH * 0.32;
  parts.push(pp(cyl(r * 1.01, r * 0.97, wallH * 0.16, seg, 0, bandY - wallH * 0.08, 0, true), style.trim));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + seed;
    const dx = Math.sin(a) * r * 1.01;
    const dz = Math.cos(a) * r * 1.01;
    const dy = wallY0 + wallH * (i % 2 ? 0.58 : 0.72);
    if (i % 3 === 0) {
      // a little fish: a flat diamond body + a tail triangle
      const fish = flat([[-0.16 * s, 0], [0, 0.09 * s], [0.16 * s, 0], [0, -0.09 * s]]);
      parts.push(pp(place(fish, dx, dy, dz, a), "#cfe3e8"));
      const tail = flat([[0.16 * s, 0], [0.26 * s, 0.08 * s], [0.26 * s, -0.08 * s]]);
      parts.push(pp(place(tail, dx, dy, dz, a), "#9fb8c2"));
    } else if (i % 3 === 1) {
      // a shell: a tiny faceted gem
      parts.push(pp(gem(0.1 * s, dx, dy, dz, 1, 0.8, 0.5), "#ffe2d0"));
    } else {
      // a wave crest: a little painted chevron
      const wave = flat([[-0.18 * s, -0.04 * s], [-0.06 * s, 0.07 * s], [0.06 * s, -0.04 * s], [0.18 * s, 0.07 * s], [0.18 * s, -0.04 * s], [-0.18 * s, -0.08 * s]]);
      parts.push(pp(place(wave, dx, dy, dz, a), style.trim));
    }
  }
  // layered thatch: two stacked cones (a wider skirt, a narrower cap) reads as bundled reed layers —
  // a second-colour fringe band right at the eaves (where the wall meets the thatch) so the skirt
  // doesn't read as one big plain cone, and a proper carved finial at the ridge (not a bare post)
  const eavesY = stiltH + wallH;
  parts.push(pp(cyl(r * 1.36, r * 1.3, 0.12 * s, seg, 0, eavesY, 0, true), (p, n) => shade(style.trim, 0.85 + 0.15 * Math.max(0, n.y))));
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const tip = flat([[-0.09 * s, 0], [0.09 * s, 0], [0, -0.22 * s]]);
    parts.push(pp(place(tip, Math.sin(a) * r * 1.33, eavesY, Math.cos(a) * r * 1.33, a), shade(style.thatch, 0.75)));
  }
  parts.push(pp(cone(r * 1.32, 0.55 * s, seg, 0, eavesY + 0.12 * s, 0), (p, n) => shade(style.thatch, 0.8 + 0.18 * Math.max(0, n.y))));
  parts.push(pp(cone(r * 1.0, 1.1 * s, seg, 0, stiltH + wallH + 0.45 * s + 0.12 * s, 0), (p, n) => shade(style.thatch, 0.88 + 0.2 * Math.max(0, n.y))));
  const finialY = stiltH + wallH + 1.5 * s + 0.12 * s;
  parts.push(pp(cyl(0.09 * s, 0.11 * s, 0.22 * s, 6, 0, finialY, 0), "#6e4a28"));
  parts.push(pp(gem(0.16 * s, 0, finialY + 0.26 * s, 0, 1, 1.2, 1), style.trim));
  // a little fish-pennant on a pole above the finial — every hut a flag of its own trim colour
  const poleY0 = stiltH + wallH + 2.15 * s;
  const poleY1 = stiltH + wallH + 2.5 * s;
  parts.push(pp(stick(v3(0, poleY0, 0), v3(0, poleY1, 0), 0.035 * s), WOOD_D));
  parts.push(pp(place(flat([[0, 0], [0.4 * s, -0.06 * s], [0.08 * s, -0.24 * s]]), 0, poleY1, 0, hut.yaw), style.trim, SWAY));
  // door (a dark arch) facing the fire, with a lamp beside it
  const doorX = Math.sin(hut.yaw) * r * 0.98;
  const doorZ = Math.cos(hut.yaw) * r * 0.98;
  parts.push(pp(box(0.85 * s, 1.5 * s, 0.14 * s, doorX, stiltH + 0.82 * s, doorZ, hut.yaw), WOOD_D));
  parts.push(pp(box(1.0 * s, stiltH * 0.5, 0.5 * s, Math.sin(hut.yaw) * (r + 0.4 * s), stiltH * 0.25, Math.cos(hut.yaw) * (r + 0.4 * s), hut.yaw), WOOD));
  parts.push(...buildDoorLamp(doorX + Math.sin(hut.yaw + Math.PI / 2) * 0.55 * s, doorZ + Math.cos(hut.yaw + Math.PI / 2) * 0.55 * s, hut.yaw));
  // a window on the side, with shutters, and (land huts only) a little flower box under it
  const winA = hut.yaw + Math.PI * 0.55;
  const winX = Math.sin(winA) * r * 0.99;
  const winZ = Math.cos(winA) * r * 0.99;
  parts.push(...buildWindow(winX, stiltH + wallH * 0.55, winZ, winA, style.trim, 0.5 * s, 0.55 * s));
  if (!hut.shore) parts.push(...buildFlowerBox(winX, stiltH + wallH * 0.3, winZ, winA, BLOOM, seed));
  // a little shell wind-chime hanging under the eaves
  parts.push(...buildWindchime(Math.sin(hut.yaw - 0.9) * r * 0.95, stiltH + wallH + 0.1 * s, Math.cos(hut.yaw - 0.9) * r * 0.95, seed, s));
  const merged = mergeAll(parts);
  merged.translate(hut.x, 0, hut.z);
  return [merged];
}

/** a cluster of little shells on a string, swaying under the eaves */
function buildWindchime(x: number, y: number, z: number, seed: number, s = 1): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(stick(v3(x, y, z), v3(x, y - 0.08 * s, z), 0.02 * s), WOOD_D));
  for (let i = 0; i < 3; i++) {
    const dx = (i - 1) * 0.12 * s;
    parts.push(pp(place(new THREE.ConeGeometry(0.05 * s, 0.16 * s, 5), x + dx, y - (0.3 + (seed % 3) * 0.02) * s, z, Math.PI), i % 2 ? "#f2e6c9" : "#e8caa0", SWAY));
  }
  return parts;
}

function buildSmokehouse(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  // a fair bit bigger than its old dollhouse self, to stand alongside the now much bigger huts
  const k = 1.5;
  parts.push(pp(box(1.6 * k, 2.1 * k, 1.6 * k, p.x, 1.05 * k, p.z, p.yaw), (pt, n) => shade(WOOD, 0.85 + 0.15 * Math.max(0, n.y))));
  parts.push(pp(place(new THREE.ConeGeometry(1.3 * k, 1.0 * k, 4), p.x, 2.6 * k, p.z, p.yaw + Math.PI / 4), "#e0a847"));
  const chimX = p.x + Math.sin(p.yaw) * 0.5 * k;
  const chimZ = p.z + Math.cos(p.yaw) * 0.5 * k;
  parts.push(pp(cyl(0.16 * k, 0.2 * k, 1.1 * k, 6, chimX, 2.1 * k, chimZ), "#7a7064"));
  parts.push(...buildSmokePuff(chimX, 3.3 * k, chimZ, 0.3));
  parts.push(...buildSmokePuff(chimX + 0.15, 3.7 * k, chimZ - 0.1, 0.4));
  return parts;
}

/** a short plank boardwalk from a stilt hut back towards the fire (`p.yaw` points home, `p.scale`
 *  is the hut's own distance from the fire — the walk runs most of the way, not all of it) */
function buildBoardwalk(p: SettlementProp): THREE.BufferGeometry[] {
  const len = Math.max(1, p.scale * 0.6);
  const ex = p.x + Math.sin(p.yaw) * len;
  const ez = p.z + Math.cos(p.yaw) * len;
  const mx = (p.x + ex) / 2;
  const mz = (p.z + ez) / 2;
  const parts: THREE.BufferGeometry[] = [pp(place(box(1.1, 0.14, len), mx, 0.3, mz, p.yaw), (pt, n) => shade(WOOD, 0.82 + 0.18 * Math.max(0, n.y)))];
  const nPosts = Math.max(1, Math.round(len / 2.6));
  for (let i = 0; i <= nPosts; i++) {
    const t = i / nPosts;
    const px = p.x + (ex - p.x) * t;
    const pz = p.z + (ez - p.z) * t;
    for (const s of [-1, 1]) parts.push(pp(cyl(0.07, 0.08, 0.6, 5, px + Math.sin(p.yaw + Math.PI / 2) * s * 0.5, -0.2, pz + Math.cos(p.yaw + Math.PI / 2) * s * 0.5), WOOD_D));
  }
  return parts;
}

function buildDryingRack(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const bx = p.x + Math.sin(p.yaw) * s * 0.9;
    const bz = p.z + Math.cos(p.yaw) * s * 0.9;
    parts.push(pp(stick(v3(bx, 0, bz), v3(p.x, 1.6, p.z), 0.06), WOOD_D));
  }
  parts.push(pp(stick(v3(p.x - Math.sin(p.yaw) * 0.9, 1.6, p.z - Math.cos(p.yaw) * 0.9), v3(p.x + Math.sin(p.yaw) * 0.9, 1.6, p.z + Math.cos(p.yaw) * 0.9), 0.04), WOOD_D));
  for (let i = 0; i < 4; i++) {
    const t = (i - 1.5) * 0.42;
    const fx = p.x + Math.sin(p.yaw) * t;
    const fz = p.z + Math.cos(p.yaw) * t;
    parts.push(pp(ball(0.14, fx, 1.25, fz, 0, 0.55, 1, 2.2), (pt, n) => col(n.y > 0 ? "#cfe3e8" : "#9fb8c2"), SWAY));
  }
  return parts;
}
function buildNetPole(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(stick(v3(p.x, 0, p.z), v3(p.x, 1.9, p.z), 0.07), WOOD_D));
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const dx = Math.sin(p.yaw + Math.PI / 2) * (0.1 + t * 1.1);
    const dz = Math.cos(p.yaw + Math.PI / 2) * (0.1 + t * 1.1);
    parts.push(pp(stick(v3(p.x, 1.8 - t * 0.2, p.z), v3(p.x + dx, 0.7 - t * 0.35, p.z + dz), 0.025), "#c9b48a", SWAY));
  }
  return parts;
}

/** the village's lookout tower: a TALL timber structure (well over any hut), a broad platform with
 *  a rail, a ladder, and a bright flag streaming from a mast — meant to be seen from across the
 *  whole village, the way a real lookout would be */
function buildTower(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const h = 5.2;
  for (const [sx, sz] of [[0.75, 0.75], [-0.75, 0.75], [0.75, -0.75], [-0.75, -0.75]]) parts.push(pp(cyl(0.12, 0.15, h, 6, p.x + sx, 0, p.z + sz), WOOD_D));
  // cross-bracing, so the tower's legs read as a braced timber tower, not four bare poles
  for (const hy of [h * 0.35, h * 0.7]) {
    parts.push(pp(place(box(1.5 * Math.SQRT2, 0.06, 0.06), p.x, hy, p.z, Math.PI / 4), WOOD_D));
    parts.push(pp(place(box(1.5 * Math.SQRT2, 0.06, 0.06), p.x, hy, p.z, -Math.PI / 4), WOOD_D));
  }
  parts.push(pp(cyl(1.0, 1.0, 0.14, 8, p.x, h, p.z), WOOD));
  for (let i = 0; i < 8; i += 2) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(pp(cyl(0.05, 0.05, 0.7, 5, p.x + Math.sin(a) * 0.96, h + 0.07, p.z + Math.cos(a) * 0.96), "#e8893c"));
  }
  parts.push(pp(cyl(0.98, 0.98, 0.05, 8, p.x, h + 0.65, p.z, true), "#e8893c"));
  // a little peaked roof over the platform
  parts.push(pp(place(new THREE.ConeGeometry(1.3, 1.1, 8), p.x, h + 0.7, p.z, 0), "#2a9d8f"));
  const mastH = h + 1.9;
  parts.push(pp(stick(v3(p.x, h, p.z), v3(p.x, mastH, p.z), 0.045), WOOD_D));
  const flag = flat([[0, 0], [0.55, -0.1], [0, -0.4]]);
  parts.push(pp(place(flag, p.x, mastH, p.z, p.yaw), TRIM[1], SWAY));
  parts.push(pp(place(flag, p.x, mastH - 0.5, p.z, p.yaw + 1.4), TRIM[3], SWAY));
  return parts;
}

/** a hull-up boat on a pair of trestles, half-mended (a patch of fresh paint, a pot of pitch) */
function buildBoatRepair(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-0.9, 0.9]) parts.push(pp(place(box(0.9, 0.5, 0.18), p.x + Math.sin(p.yaw) * s, 0.35, p.z + Math.cos(p.yaw) * s, p.yaw + Math.PI / 2), WOOD_D));
  const hull = flat([[-1.6, 0], [1.6, 0], [1.1, 0.5], [-1.1, 0.5]]).rotateX(-Math.PI / 2);
  parts.push(pp(place(hull, p.x, 0.6, p.z, p.yaw), (pt, n) => shade("#b0834a", 0.85 + 0.2 * Math.max(0, n.y))));
  parts.push(pp(place(box(0.6, 0.06, 0.4), p.x, 0.63, p.z, p.yaw), "#e8893c"));
  parts.push(pp(cyl(0.16, 0.18, 0.22, 7, p.x + Math.sin(p.yaw + Math.PI / 2) * 1.3, 0.11, p.z + Math.cos(p.yaw + Math.PI / 2) * 1.3), "#2a2420"));
  return parts;
}

/** reed bed at the shore: tall grass blades, a patch of lily pads with a flower or two — soft life
 *  along the waterline instead of bare sand running straight into the hut cluster */
function buildReedbed(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rx = p.x + Math.sin(a) * 0.5 * p.scale;
    const rz = p.z + Math.cos(a) * 0.5 * p.scale;
    const blade = flat([[0, 0], [0.08, 0], [0, 1.1 + (i % 3) * 0.2]]);
    parts.push(pp(place(blade, rx, 0, rz, a), i % 2 ? "#5e9c4a" : "#4a8f3c", SWAY));
  }
  return parts;
}
function buildLilypad(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(cyl(0.45 * p.scale, 0.45 * p.scale, 0.04, 8, p.x, -0.02, p.z), "#3f8a3f"));
  if (p.yaw > 0.5) parts.push(pp(gem(0.09, p.x + 0.1, 0.05, p.z, 1, 0.7, 1), "#ffe2f0"));
  return parts;
}

/** the pier: posts into the water, a plank deck along it */
function buildPier(def: SettlementDef, low: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const p = def.pier;
  if (!p) return parts;
  const len = Math.hypot(p.bx - p.ax, p.bz - p.az);
  const yaw = Math.atan2(p.bx - p.ax, p.bz - p.az);
  const mx = (p.ax + p.bx) / 2;
  const mz = (p.az + p.bz) / 2;
  parts.push(pp(place(box(p.half * 2, 0.18, len), mx, p.deckY - 0.1, mz, yaw), (pt, n) => shade(WOOD, 0.82 + 0.18 * Math.max(0, n.y))));
  const nPosts = Math.max(3, Math.round(len / 3.2));
  for (let i = 0; i <= nPosts; i++) {
    const t = i / nPosts;
    const x = p.ax + (p.bx - p.ax) * t;
    const z = p.az + (p.bz - p.az) * t;
    for (const s of [-1, 1]) {
      const px = x + Math.sin(yaw + Math.PI / 2) * s * (p.half - 0.15);
      const pz = z + Math.cos(yaw + Math.PI / 2) * s * (p.half - 0.15);
      parts.push(pp(cyl(0.11, 0.13, p.deckY + 1.9, low ? 5 : 6, px, -1.9, pz), "#6e5438"));
    }
  }
  return parts;
}

export function buildLakesidePropsGeometry(def: SettlementDef, low: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  def.huts.forEach((h, i) => parts.push(...buildHut(h, i, low)));
  // a washing line strung between the first two land huts, if they're close enough to bother
  const land = def.huts.filter((h) => !h.shore);
  if (land.length >= 2) {
    const a = land[0];
    const b = land[1];
    if (Math.hypot(a.x - b.x, a.z - b.z) < 9) parts.push(...buildWashingLine(a.x + Math.sin(a.yaw + 2) * a.size, a.z + Math.cos(a.yaw + 2) * a.size, b.x + Math.sin(b.yaw + 2) * b.size, b.z + Math.cos(b.yaw + 2) * b.size, ["#2a9d8f", "#e8893c", "#f0d6ab", "#4a8f3c"], 3));
  }
  parts.push(...buildPathStones(def.x, def.z, 9, 70, 1001, STONE));
  parts.push(...buildWelcomeArch(def, TRIM));
  // a scatter of barrels, crates and flower pots round the land huts — so every yard between the
  // huts reads as lived-in, not bare dirt — plus a little trading corner (a cart, crates, barrels)
  // near the fire, standing in for Lakeside's own market
  let rngS = 5009 >>> 0;
  const rnd = () => {
    rngS ^= rngS << 13;
    rngS ^= rngS >>> 17;
    rngS ^= rngS << 5;
    return (rngS >>> 0) / 4294967296;
  };
  land.forEach((h, i) => {
    const a = h.yaw + Math.PI + (rnd() - 0.5) * 1.3;
    const dist = h.size * 1.1 + 1.3;
    const dx = h.x + Math.sin(a) * dist;
    const dz = h.z + Math.cos(a) * dist;
    if (i % 3 === 0) parts.push(...buildBarrel(dx, dz, rnd() * Math.PI * 2));
    else if (i % 3 === 1) parts.push(...buildFlowerBed(dx, dz, BLOOM, i * 11 + 5));
    else parts.push(...buildCrate(dx, dz, rnd() * Math.PI * 2));
  });
  // the market corner sits inland, off to one side of the general direction of the hut cluster
  // (no single "inland angle" is exposed from here — the first land hut's own bearing from the
  // fire is a good enough stand-in, offset round so the cart doesn't land on top of a hut)
  const marketA = (land[0] ? Math.atan2(land[0].x - def.x, land[0].z - def.z) : 0) + 2.3;
  const mx = def.x + Math.sin(marketA) * 7.5;
  const mz = def.z + Math.cos(marketA) * 7.5;
  parts.push(...buildCart(mx, mz, marketA + Math.PI / 2));
  parts.push(...buildCrate(mx + Math.sin(marketA + 1.3) * 1.3, mz + Math.cos(marketA + 1.3) * 1.3, 0.4));
  parts.push(...buildBarrel(mx + Math.sin(marketA + 1.7) * 1.3, mz + Math.cos(marketA + 1.7) * 1.3, 1.1));
  parts.push(...buildBarrel(mx + Math.sin(marketA + 2.0) * 1.6, mz + Math.cos(marketA + 2.0) * 1.1, 0.4, undefined, undefined, 0.85));
  parts.push(...buildPennant(def.x + Math.sin(marketA - 2.1) * 10, def.z + Math.cos(marketA - 2.1) * 10, 2.6, TRIM[2]));
  parts.push(...buildPennant(def.x + Math.sin(marketA + 2.6) * 11, def.z + Math.cos(marketA + 2.6) * 11, 2.4, TRIM[0]));
  for (const p of def.props) {
    switch (p.kind) {
      case "firepit":
        parts.push(...buildFirepit(p.x, p.z, STONE));
        break;
      case "bench":
        parts.push(...buildBench(p));
        break;
      case "smokehouse":
        parts.push(...buildSmokehouse(p));
        break;
      case "dryingrack":
        parts.push(...buildDryingRack(p));
        break;
      case "netpole":
        parts.push(...buildNetPole(p));
        break;
      case "lantern":
        parts.push(...buildLantern(p));
        break;
      case "perch":
        parts.push(...buildTower(p));
        break;
      case "boardwalk":
        parts.push(...buildBoardwalk(p));
        break;
      case "boat-repair":
        parts.push(...buildBoatRepair(p));
        break;
      case "reedbed":
        parts.push(...buildReedbed(p));
        break;
      case "lilypad":
        parts.push(...buildLilypad(p));
        break;
      case "pier-post-start":
      case "canoe-beached":
        // drawn by the instanced canoe mesh / the pier builder instead
        break;
      default:
        break;
    }
  }
  parts.push(...buildPier(def, low));
  return mergeAll(parts);
}
