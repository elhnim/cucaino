// Dionisio's farmstead's look: a whitewashed adobe farmhouse with a terracotta roof and a wooden
// door, a weathered wood-plank barn, a scarecrow and an idle plough out among straight rows of
// corn, a little volcanologist's instrument hut (the "seismograph"), a firepit with benches, and
// the trailhead flags where "Climb to the crater!" begins — the same low-level-geometry discipline
// as every other style file (lakeside.ts/mountain.ts/basecamp.ts): everything built in terms of
// `hut.size`/`p.scale`.
import * as THREE from "three";
import type { SettlementDef, SettlementHut, SettlementProp } from "../../../registry/settlements";
import { box, cyl, flat, lump, mergeAll, place, pp, stick, v3 } from "../../village/kit";
import { WOOD_D, buildBench, buildFirepit, footed, shade } from "./common";

const ADOBE = "#e0c79a";
const ADOBE_TRIM = "#c0392b";
const ROOF_TILE = "#b5582e";
const BARN_WOOD = "#7a4a2e";
const BARN_WOOD_D = "#5a3620";
const CORN_GREEN = "#5a8f3a";
const CORN_DRY = "#c9a84a";
const STRAW = "#d9b85c";

/** the farmhouse: whitewashed adobe walls, a terracotta tiled roof (banded like Highstone's own
 *  cottage roofs), a red door, one shuttered window, and a little clay chimney */
function buildFarmhouse(hut: SettlementHut): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const s = hut.size;
  const w = 2.0 * s;
  const d = 1.7 * s;
  const wallH = 1.6 * s;
  parts.push(pp(place(box(w, wallH, d), hut.x, wallH / 2, hut.z, hut.yaw), (pt, n) => shade(ADOBE, 0.9 + 0.12 * Math.max(0, n.y))));
  const roof = place(new THREE.ConeGeometry(Math.hypot(w, d) * 0.6, 0.9 * s, 4), hut.x, wallH + 0.45 * s, hut.z, hut.yaw + Math.PI / 4);
  parts.push(
    pp(roof, (pt, n) => {
      const row = Math.floor((pt.y - wallH) / (0.16 * s)) % 2;
      return shade(ROOF_TILE, (row ? 0.82 : 0.98) + 0.14 * Math.max(0, n.y));
    })
  );
  const chimX = hut.x - Math.sin(hut.yaw) * w * 0.28;
  const chimZ = hut.z - Math.cos(hut.yaw) * d * 0.28;
  parts.push(pp(box(0.26 * s, 0.85 * s, 0.26 * s, chimX, wallH + 0.72 * s, chimZ), shade(ADOBE, 0.8)));
  // the door, facing the fire
  const doorX = hut.x + Math.sin(hut.yaw) * w * 0.52;
  const doorZ = hut.z + Math.cos(hut.yaw) * d * 0.52;
  parts.push(pp(box(0.8 * s, 1.45 * s, 0.1 * s, doorX, 0.72 * s, doorZ, hut.yaw), ADOBE_TRIM));
  parts.push(pp(place(box(1.0 * s, 0.16 * s, 0.4 * s), doorX + Math.sin(hut.yaw) * 0.3 * s, 0.08 * s, doorZ + Math.cos(hut.yaw) * 0.3 * s, hut.yaw), "#9a8f7c"));
  // a shuttered window on the side
  const winA = hut.yaw + Math.PI * 0.55;
  const winX = hut.x + Math.sin(winA) * w * 0.52;
  const winZ = hut.z + Math.cos(winA) * d * 0.44;
  parts.push(pp(box(0.5 * s, 0.5 * s, 0.06 * s, winX, wallH * 0.6, winZ, winA), "#4a6a8a"));
  parts.push(pp(box(0.56 * s, 0.56 * s, 0.04 * s, winX, wallH * 0.6, winZ, winA), WOOD_D));
  for (const side of [-1, 1]) parts.push(pp(place(box(0.18 * s, 0.56 * s, 0.05 * s), winX + side * 0.33 * s * Math.cos(winA), wallH * 0.6, winZ - side * 0.33 * s * Math.sin(winA), winA), ADOBE_TRIM));
  return parts;
}

/** the barn: weathered wood planks, a simple gable roof, a big double door */
function buildBarn(hut: SettlementHut): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const s = hut.size;
  const w = 1.9 * s;
  const d = 1.5 * s;
  const wallH = 1.5 * s;
  parts.push(pp(place(box(w, wallH, d), hut.x, wallH / 2, hut.z, hut.yaw), (pt) => shade(BARN_WOOD, 0.85 + 0.1 * (Math.sin(pt.x * 9) > 0 ? 1 : 0))));
  const roofH = 0.75 * s;
  const roofGeo = new THREE.BufferGeometry();
  const hw = w / 2;
  const hd = d / 2;
  roofGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [-hw, 0, -hd, hw, 0, -hd, 0, roofH, -hd, -hw, 0, hd, hw, 0, hd, 0, roofH, hd, -hw, 0, -hd, -hw, 0, hd, 0, roofH, -hd, 0, roofH, -hd, -hw, 0, hd, 0, roofH, hd, hw, 0, -hd, hw, 0, hd, 0, roofH, -hd, 0, roofH, -hd, hw, 0, hd, 0, roofH, hd],
      3
    )
  );
  roofGeo.computeVertexNormals();
  parts.push(pp(place(roofGeo, hut.x, wallH, hut.z, hut.yaw), BARN_WOOD_D));
  // a big double door
  const doorX = hut.x + Math.sin(hut.yaw) * w * 0.502;
  const doorZ = hut.z + Math.cos(hut.yaw) * d * 0.502;
  for (const side of [-1, 1]) parts.push(pp(box(0.5 * s, 1.2 * s, 0.06 * s, doorX + side * 0.26 * s * Math.cos(hut.yaw), 0.6 * s, doorZ - side * 0.26 * s * Math.sin(hut.yaw), hut.yaw), shade(BARN_WOOD_D, 0.9)));
  return parts;
}

/** a scarecrow: a wooden cross-pole, a straw-stuffed sack body, a round head with an "X" stitched
 *  face, a floppy straw hat — the whole story's own little landmark */
function buildScarecrow(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(stick(v3(p.x, 0, p.z), v3(p.x, 1.9, p.z), 0.06), WOOD_D));
  const armSpan = 1.1;
  parts.push(pp(stick(v3(p.x - Math.sin(p.yaw + Math.PI / 2) * armSpan, 1.3, p.z - Math.cos(p.yaw + Math.PI / 2) * armSpan), v3(p.x + Math.sin(p.yaw + Math.PI / 2) * armSpan, 1.3, p.z + Math.cos(p.yaw + Math.PI / 2) * armSpan), 0.045), WOOD_D));
  // a sack body
  parts.push(pp(lump(0.32, p.x, 1.05, p.z, 11, 1.1, 1.5, 1.1, 0.2), STRAW));
  for (const side of [-1, 1]) parts.push(pp(lump(0.1, p.x + Math.sin(p.yaw + Math.PI / 2) * armSpan * side, 1.26, p.z + Math.cos(p.yaw + Math.PI / 2) * armSpan * side, 3 + side, 1.6, 0.6, 1, 0.3), STRAW));
  // the head, a straw hat
  parts.push(pp(lump(0.24, p.x, 1.75, p.z, 7, 1, 1, 1, 0.15), "#e0c79a"));
  parts.push(pp(cyl(0.3, 0.32, 0.05, 10, p.x, 1.95, p.z), STRAW));
  parts.push(pp(cyl(0.14, 0.17, 0.2, 10, p.x, 2.02, p.z), STRAW));
  return parts;
}

/** an idle plough: a wooden frame, two iron blades, resting where it was left */
function buildPlough(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const a = p.yaw;
  const fx = Math.sin(a);
  const fz = Math.cos(a);
  parts.push(pp(place(box(1.6, 0.08, 0.1), p.x, 0.4, p.z, a), WOOD_D));
  for (const t of [-0.5, 0.1, 0.6]) parts.push(pp(stick(v3(p.x + fx * t, 0.42, p.z + fz * t), v3(p.x + fx * t - fx * 0.15, 0.05, p.z + fz * t - fz * 0.15), 0.035), "#5a5a5e"));
  for (const t of [-0.5, 0.6]) parts.push(pp(place(box(0.05, 0.3, 0.22), p.x + fx * t, 0.18, p.z + fz * t, a), "#3a3a3e"));
  // a wheel at the front
  parts.push(pp(cyl(0.22, 0.22, 0.06, 10, p.x + fx * -0.75, 0.22, p.z + fz * -0.75, true), WOOD_D));
  return parts;
}

/** one TALL, leafy corn stalk: a thick cane, five broad fanning leaves spiralling up it, one or two
 *  ripe golden cobs with visible silk — a real plant you'd recognise, not a thin stick (polish
 *  round 2's own complaint: the first pass "read as twigs") */
function buildCornStalk(x: number, z: number, yaw: number, scale: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const h = 2.3 * scale;
  // the cane: thicker, and very slightly jointed (a subtle taper per segment, not one plain cone)
  parts.push(pp(cyl(0.05 * scale, 0.095 * scale, h, 7, x, h / 2, z), CORN_GREEN));
  // five big leaves, fanning right round the stalk and up its height, each one broad and arching
  for (let i = 0; i < 5; i++) {
    const a = yaw + i * 1.4 + 0.3;
    const leafH = h * (0.3 + (i % 3) * 0.16);
    const leaf = flat([
      [0, 0],
      [0.22 * scale, 0.1 * scale],
      [0.3 * scale, 0.42 * scale],
      [0.1 * scale, 0.85 * scale],
      [0, 0.95 * scale],
    ]);
    parts.push(pp(place(leaf, x, leafH, z, a), shade(CORN_GREEN, 0.82 + (i % 3) * 0.07)));
  }
  // one or two ripe cobs, with a pale silk tuft
  const cobN = scale > 1.05 ? 2 : 1;
  for (let c = 0; c < cobN; c++) {
    const cobA = yaw + c * 2.4 + 0.6;
    const cobY = h * (0.55 + c * 0.14);
    const cx = x + Math.sin(cobA) * 0.1 * scale;
    const cz = z + Math.cos(cobA) * 0.1 * scale;
    parts.push(pp(cyl(0.06 * scale, 0.075 * scale, 0.32 * scale, 8, cx, cobY, cz), CORN_DRY));
    parts.push(pp(lump(0.04 * scale, cx, cobY + 0.18 * scale, cz, c + 3, 1, 1.4, 1, 0.3), "#e8dfb0"));
  }
  return parts;
}
/** a corn ROW-SPOT: a small dense clump of 2-3 stalks at slightly jittered offsets, so the field
 *  reads as genuinely thick and leafy without needing more prop entries */
function buildCorn(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const jitter = (seed: number) => (((Math.sin(p.x * 12.9 + p.z * 78.2 + seed) * 43758.5) % 1) + 1) % 1;
  const n = 2 + (jitter(1) > 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const off = (jitter(i * 3 + 2) - 0.5) * 0.5;
    const off2 = (jitter(i * 5 + 7) - 0.5) * 0.5;
    parts.push(...buildCornStalk(p.x + off, p.z + off2, p.yaw + i * 1.9, p.scale * (0.92 + jitter(i * 7 + 11) * 0.22)));
  }
  return parts;
}

/** a short run of farm fence: two wooden posts and two horizontal rails between them — scale is the
 *  run's own length, yaw its direction (registry/paricutin.ts lays these end to end right round the
 *  cornfield's own perimeter, so the field reads as properly fenced, not an open patch) */
function buildFence(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const half = p.scale / 2;
  const dx = Math.sin(p.yaw);
  const dz = Math.cos(p.yaw);
  for (const t of [-half, half]) parts.push(pp(cyl(0.055, 0.07, 0.95, 6, p.x + dx * t, 0.48, p.z + dz * t), WOOD_D));
  for (const railY of [0.3, 0.68]) parts.push(pp(place(box(p.scale, 0.07, 0.07), p.x, railY, p.z, p.yaw), shade(WOOD_D, 1.1)));
  return parts;
}

/** the volcanologist's seismograph station: a little tripod-legged instrument box with a paper
 *  drum and a scratching needle, a small aerial — the "geo" prop */
function buildSeismograph(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) parts.push(pp(stick(v3(p.x, 0.75, p.z), v3(p.x + Math.sin(a) * 0.3, 0, p.z + Math.cos(a) * 0.3), 0.03), WOOD_D));
  parts.push(pp(box(0.4, 0.3, 0.4, p.x, 0.9, p.z), "#4a5a52"));
  parts.push(pp(cyl(0.16, 0.16, 0.18, 10, p.x, 1.14, p.z), "#e8e2d0"));
  parts.push(pp(stick(v3(p.x - 0.14, 1.2, p.z), v3(p.x + 0.12, 1.1, p.z + 0.1), 0.012), "#2a2a2a"));
  parts.push(pp(stick(v3(p.x, 0.3, p.z), v3(p.x, 0.5, p.z), 0.02), "#8a8a8e"));
  return parts;
}

/** the trailhead: two posts with bright flags marking where "Climb to the crater!" begins (the
 *  same idea as Everest Base Camp's own trailhead flags) */
function buildTrailheadFlags(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const side = Math.sin(p.yaw + Math.PI / 2);
  const sideZ = Math.cos(p.yaw + Math.PI / 2);
  const FLAGS = ["#e8485f", "#f2c23d"];
  for (const s of [-1, 1]) {
    const px = p.x + side * s * 1.3;
    const pz = p.z + sideZ * s * 1.3;
    parts.push(pp(cyl(0.06, 0.07, 2.3, 6, px, 0, pz), WOOD_D));
    const flag = flat([
      [0, 0],
      [0.4, -0.06],
      [0, -0.24],
    ]);
    parts.push(pp(place(flag, px, 2.2, pz, p.yaw + (s > 0 ? Math.PI / 2 : -Math.PI / 2)), FLAGS[s > 0 ? 0 : 1]));
  }
  return parts;
}

export function buildFarmPropsGeometry(def: SettlementDef): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const h of def.huts) parts.push(...footed(h.kind === "barn" ? buildBarn(h) : buildFarmhouse(h), h.x, h.z));
  // (no generic fire-plaza hex-stone floor here — a real farmyard is bare dirt, not a ceremonial
  // stone circle; the firepit + benches below are enough of a gathering spot on their own)

  for (const p of def.props) {
    switch (p.kind) {
      case "firepit":
        parts.push(...footed(buildFirepit(p.x, p.z), p.x, p.z));
        break;
      case "bench":
        parts.push(...footed(buildBench(p), p.x, p.z));
        break;
      case "scarecrow":
        parts.push(...footed(buildScarecrow(p), p.x, p.z));
        break;
      case "plough":
        parts.push(...footed(buildPlough(p), p.x, p.z));
        break;
      case "corn":
        parts.push(...footed(buildCorn(p), p.x, p.z));
        break;
      case "fence":
        parts.push(...footed(buildFence(p), p.x, p.z));
        break;
      case "seismograph":
        parts.push(...footed(buildSeismograph(p), p.x, p.z));
        break;
      case "trailhead-flags":
        parts.push(...footed(buildTrailheadFlags(p), p.x, p.z));
        break;
      default:
        break;
    }
  }
  return mergeAll(parts);
}
