// A settlement's props and decks, as chunky faceted storybook models in the fantasy kit's layout
// (shared with Coralcove's props: ../village/kit.ts's `pp()` + fxMaterial's wind sway and night
// glow), all merged into ONE mesh per settlement. Lakeside's look: round reed-thatched huts on
// short stilts, a wooden pier, drying racks hung with fish, nets on poles, a smokehouse with a
// chimney, a fire pit ringed by log benches, lanterns, and a heron's lookout perch.
import * as THREE from "three";
import type { SettlementDef, SettlementHut, SettlementProp } from "../../registry/settlements";
import { ball, box, col, cone, cyl, flat, gem, mergeAll, place, pp, stick, v3, type Fx } from "../village/kit";

const _c = new THREE.Color();
const SWAY: Fx = [0, 0.25, 0];
const GLOW: Fx = [0, 0, 1];

// palettes (reedy, sun-worn wood — distinct from Coralcove's coral-pink)
const REED_WALL = ["#e8d9a8", "#e3cf98", "#ead9ae"];
const THATCH = ["#b89050", "#a8803f", "#c09a5c"];
const WOOD = "#8a6238";
const WOOD_D = "#5e3f22";
const STONE = "#9a8f7c";

const shade = (hex: string, k: number) => _c.set(hex).multiplyScalar(k).clone();

/** a round reed hut on four short stilts, door facing `hut.yaw`, origin at ground level */
function buildHut(hut: SettlementHut, seed: number, low: boolean): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const r = 1.9 * hut.size;
  const stiltH = 0.55;
  const wallH = 2.0 * hut.size;
  const seg = low ? 8 : 10;
  const wall = REED_WALL[seed % REED_WALL.length];
  const thatch = THATCH[(seed + 1) % THATCH.length];
  // four stilts
  for (const [sx, sz] of [
    [0.75, 0.75],
    [-0.75, 0.75],
    [0.75, -0.75],
    [-0.75, -0.75],
  ]) {
    parts.push(pp(cyl(0.12, 0.14, stiltH, 6, sx * r * 0.62, 0, sz * r * 0.62), WOOD_D));
  }
  // the floor deck
  parts.push(pp(cyl(r + 0.15, r + 0.15, 0.14, seg, 0, stiltH, 0), WOOD));
  // the reed wall
  parts.push(pp(cyl(r, r * 0.92, wallH, seg, 0, stiltH + 0.07, 0, true), (p, n) => shade(wall, 0.88 + 0.12 * Math.max(0, n.z) + (Math.sin(p.x * 4 + seed) > 0.6 ? -0.05 : 0))));
  // the conical thatch roof
  parts.push(pp(cone(r * 1.22, 1.5 * hut.size, seg, 0, stiltH + wallH, 0), (p, n) => shade(thatch, 0.82 + 0.18 * Math.max(0, n.y))));
  parts.push(pp(cyl(0.1, 0.1, 0.28, 5, 0, stiltH + wallH + 1.5 * hut.size, 0), "#6e4a28"));
  // door (a dark arch) facing the fire
  parts.push(pp(box(0.85, 1.3, 0.14, Math.sin(hut.yaw) * r * 0.98, stiltH + 0.72, Math.cos(hut.yaw) * r * 0.98, hut.yaw), WOOD_D));
  // a little step up to the door
  parts.push(pp(box(1.0, stiltH * 0.5, 0.5, Math.sin(hut.yaw) * (r + 0.4), stiltH * 0.25, Math.cos(hut.yaw) * (r + 0.4), hut.yaw), WOOD));
  // (built in the hut's own local space above; move the whole thing out to its world position)
  const merged = mergeAll(parts);
  merged.translate(hut.x, 0, hut.z);
  return [merged];
}

/** the fire pit: a ring of stones, charred logs, dancing flames (bright by day, aglow by night)
 *  and a drift of smoke, with a crossbar for the cooking pot */
function buildFirepit(x: number, z: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(cyl(1.35, 1.5, 0.3, 10, x, 0, z, true), STONE));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(pp(stick(v3(x + Math.sin(a) * 0.4, 0.16, z + Math.cos(a) * 0.4), v3(x - Math.sin(a) * 0.4, 0.16, z - Math.cos(a) * 0.4), 0.22), "#4a3426"));
  }
  // the flames: a little cluster of tapered cones, saturated orange/red so it reads as fire in
  // daylight too, not just as a night-time glow
  const flameAt = (fx: number, fz: number, h: number, r: number, hue: string) => pp(place(new THREE.ConeGeometry(r, h, 5), fx, h / 2 + 0.2, fz, 0, v3(1, 1, 1)), hue, GLOW);
  parts.push(flameAt(x, z, 0.75, 0.28, "#ff8a2a"));
  parts.push(flameAt(x + 0.22, z + 0.1, 0.5, 0.2, "#ffcf4a"));
  parts.push(flameAt(x - 0.2, z - 0.15, 0.55, 0.2, "#ff5a2a"));
  // a puff of smoke drifting up (visible by day; doesn't move, but reads fine at a village's scale)
  parts.push(pp(ball(0.45, x + 0.1, 1.5, z - 0.1, 0, 1, 0.8, 1), "#cfcac2"));
  parts.push(pp(ball(0.3, x - 0.15, 1.95, z + 0.1, 0, 1, 0.8, 1), "#d8d4cc"));
  parts.push(pp(stick(v3(x - 1.1, 1.0, z), v3(x + 1.1, 1.0, z), 0.07), WOOD_D));
  return parts;
}
function buildBench(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(place(new THREE.CylinderGeometry(0.18, 0.2, 1.6, 7).rotateZ(Math.PI / 2), p.x, 0.22, p.z, p.yaw), WOOD));
  for (const s of [-0.6, 0.6]) parts.push(pp(cyl(0.08, 0.08, 0.22, 5, p.x + Math.sin(p.yaw) * s, 0, p.z + Math.cos(p.yaw) * s), WOOD_D));
  return parts;
}

function buildSmokehouse(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(box(1.6, 2.1, 1.6, p.x, 1.05, p.z, p.yaw), (pt, n) => shade(WOOD, 0.85 + 0.15 * Math.max(0, n.y))));
  parts.push(pp(place(new THREE.ConeGeometry(1.3, 1.0, 4), p.x, 2.6, p.z, p.yaw + Math.PI / 4), THATCH[0]));
  const chimX = p.x + Math.sin(p.yaw) * 0.5;
  const chimZ = p.z + Math.cos(p.yaw) * 0.5;
  parts.push(pp(cyl(0.16, 0.2, 1.1, 6, chimX, 2.1, chimZ), "#7a7064"));
  // a little smoke drifting from the chimney top
  parts.push(pp(ball(0.3, chimX, 3.3, chimZ, 0, 1, 0.7, 1), "#d4d0c8"));
  parts.push(pp(ball(0.4, chimX + 0.15, 3.7, chimZ - 0.1, 0, 1, 0.7, 1), "#dedad2", SWAY));
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
  // three silvery fish hung to dry
  for (let i = 0; i < 3; i++) {
    const t = (i - 1) * 0.55;
    const fx = p.x + Math.sin(p.yaw) * t;
    const fz = p.z + Math.cos(p.yaw) * t;
    parts.push(pp(ball(0.14, fx, 1.25, fz, 0, 0.55, 1, 2.2), (pt, n) => col(n.y > 0 ? "#cfe3e8" : "#9fb8c2")));
  }
  return parts;
}
function buildNetPole(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(stick(v3(p.x, 0, p.z), v3(p.x, 1.9, p.z), 0.07), WOOD_D));
  // a draped net: a few sagging strands
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const dx = Math.sin(p.yaw + Math.PI / 2) * (0.1 + t * 1.1);
    const dz = Math.cos(p.yaw + Math.PI / 2) * (0.1 + t * 1.1);
    parts.push(pp(stick(v3(p.x, 1.8 - t * 0.2, p.z), v3(p.x + dx, 0.7 - t * 0.35, p.z + dz), 0.025), "#c9b48a", SWAY));
  }
  return parts;
}
function buildPerch(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(stick(v3(p.x, 0, p.z), v3(p.x, 2.3, p.z), 0.09), WOOD_D));
  parts.push(pp(place(flat([[-0.5, 0], [0.5, 0], [0.5, -0.5], [-0.5, -0.5]]).rotateX(-Math.PI / 2), p.x, 2.3, p.z), WOOD));
  return parts;
}
function buildLantern(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(stick(v3(p.x, 0, p.z), v3(p.x, 1.7, p.z), 0.05), WOOD_D));
  parts.push(pp(gem(0.14, p.x, 1.82, p.z, 0.9, 1.4, 0.9), "#ffc569", GLOW));
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
  for (const p of def.props) {
    switch (p.kind) {
      case "firepit":
        parts.push(...buildFirepit(p.x, p.z));
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
        parts.push(...buildPerch(p));
        break;
      case "boardwalk":
        parts.push(...buildBoardwalk(p));
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
