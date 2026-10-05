// Everest Base Camp's look: bright dome tents (orange/yellow/red/blue — real climbing camps are
// exactly this colourful), bunting strung tent to tent, stacked supply crates, a small stone cairn,
// a painted helipad, a pair of trail-marker flags at the trailhead, and a mess-tent fire with
// benches — all built entirely in terms of `hut.size`/`p.scale`, same discipline as
// lakeside.ts/treetop.ts/mountain.ts.
import * as THREE from "three";
import type { SettlementDef, SettlementHut, SettlementProp } from "../../../registry/settlements";
import { ball, box, col, cyl, flat, lump, mergeAll, place, pp, stick, v3 } from "../../village/kit";
import { WOOD_D, buildBarrel, buildBench, buildCrate, buildFirepit, buildLantern, buildPathStones, footed, shade } from "./common";

/** round-robin through these four — the same palette every real high-altitude expedition camp uses
 *  (easy to spot from a distance, which is the whole point) */
const TENT_COLORS = ["#e8893c", "#f2c23d", "#c0392b", "#2a6a8a"];
const BUNTING = ["#e8485f", "#ffc23d", "#4fb4e8", "#5aa852", "#f2902a"];
const STONE = "#9a8f7c";
const STONE_D = "#7a6f5e";

/** a bright dome tent: a flattened sphere, a darker base skirt, a dark door flap facing the fire,
 *  and four guy-lines pegged out to the ground — reads as a real expedition tent, not a toy pyramid */
function buildTent(hut: SettlementHut, idx: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const s = hut.size;
  const color = TENT_COLORS[idx % TENT_COLORS.length];
  const domeR = 1.05 * s;
  const domeH = 0.64 * domeR;
  parts.push(pp(ball(domeR, hut.x, domeH, hut.z, 1, 1, domeH / domeR, 1), (pt, n) => shade(color, 0.84 + 0.22 * Math.max(0, n.y))));
  parts.push(pp(cyl(domeR * 1.03, domeR * 1.1, 0.16, 10, hut.x, 0.08, hut.z), shade(color, 0.55)));
  // the door flap, facing the fire (hut.yaw already points that way — see everestBaseCamp.ts)
  const doorX = hut.x + Math.sin(hut.yaw) * domeR * 0.92;
  const doorZ = hut.z + Math.cos(hut.yaw) * domeR * 0.92;
  const flap = flat([
    [-0.3 * s, 0],
    [0.3 * s, 0],
    [0, 0.5 * domeH],
  ]);
  parts.push(pp(place(flap, doorX, 0.01, doorZ, hut.yaw + Math.PI / 2), "#2a2420"));
  // four guy-lines from the dome's shoulder out to pegs in the ground
  for (let i = 0; i < 4; i++) {
    const a = hut.yaw + Math.PI / 4 + i * (Math.PI / 2);
    const fromX = hut.x + Math.sin(a) * domeR * 0.85;
    const fromZ = hut.z + Math.cos(a) * domeR * 0.85;
    const pegX = hut.x + Math.sin(a) * domeR * 1.35;
    const pegZ = hut.z + Math.cos(a) * domeR * 1.35;
    parts.push(pp(stick(v3(fromX, domeH * 0.42, fromZ), v3(pegX, 0, pegZ), 0.02), "#d8cdb8"));
  }
  return parts;
}

/** stacked supply crates — a couple of crates plus a barrel, reusing common.ts's builders */
function buildCrates(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(...buildCrate(p.x, p.z, p.yaw));
  parts.push(...buildCrate(p.x + Math.sin(p.yaw + Math.PI / 2) * 0.6, p.z + Math.cos(p.yaw + Math.PI / 2) * 0.6, p.yaw + 0.4, undefined, 0.85));
  parts.push(...buildBarrel(p.x - Math.sin(p.yaw + Math.PI / 2) * 0.55, p.z - Math.cos(p.yaw + Math.PI / 2) * 0.55, p.yaw - 0.3));
  return parts;
}

/** a small stone cairn — three stacked rounded stones, smaller towards the top (real Base Camps
 *  always have one; climbers leave a stone for luck before setting off) */
function buildCairn(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const stack = [
    { r: 0.42, y: 0.2 },
    { r: 0.3, y: 0.52 },
    { r: 0.19, y: 0.76 },
  ];
  stack.forEach((st, i) => parts.push(pp(lump(st.r, p.x, st.y, p.z, i * 5 + 3, 1 + i * 0.1, 0.85, 1 - i * 0.05, 0.3), col(i % 2 ? STONE : STONE_D))));
  return parts;
}

/** the helipad: a round painted pad with a big "H" (three flat bars), set a little apart from the
 *  tents */
function buildHelipad(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(cyl(3.2, 3.3, 0.08, 16, p.x, 0.02, p.z), "#4a4a52"));
  parts.push(pp(cyl(3.3, 3.3, 0.03, 16, p.x, 0.08, p.z, true), "#2a2a30"));
  const bar = (dx: number, dz: number, w: number, d: number) => pp(place(box(w, 0.02, d), p.x + dx, 0.1, p.z + dz, p.yaw), "#f4e8c8");
  parts.push(bar(-0.9, 0, 0.55, 2.6));
  parts.push(bar(0.9, 0, 0.55, 2.6));
  parts.push(bar(0, 0, 2.2, 0.55));
  return parts;
}

/** bunting strung tent to tent (reuses the sag-and-flag maths Highstone's bunting uses) */
function buildBunting(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const n = Math.max(2, Math.round(p.scale / 1.1));
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = p.x + Math.sin(p.yaw) * p.scale * t;
    const z = p.z + Math.cos(p.yaw) * p.scale * t;
    const sag = Math.sin(Math.PI * t) * 0.3;
    const flag = flat([
      [0, 0],
      [0.2, 0],
      [0.1, -0.26],
    ]);
    parts.push(pp(place(flag, x, 2.1 - sag, z, p.yaw + Math.PI / 2), BUNTING[i % BUNTING.length]));
  }
  return parts;
}

/** the trailhead: two tall posts with bright directional pennants either side, marking where the
 *  roped route up through the Icefall begins */
function buildTrailheadFlags(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const side = Math.sin(p.yaw + Math.PI / 2);
  const sideZ = Math.cos(p.yaw + Math.PI / 2);
  for (const s of [-1, 1]) {
    const px = p.x + side * s * 1.4;
    const pz = p.z + sideZ * s * 1.4;
    parts.push(pp(cyl(0.07, 0.08, 2.6, 6, px, 0, pz), WOOD_D));
    const flag = flat([
      [0, 0],
      [0.42, -0.06],
      [0, -0.26],
    ]);
    parts.push(pp(place(flag, px, 2.5, pz, p.yaw + (s > 0 ? Math.PI / 2 : -Math.PI / 2)), BUNTING[s > 0 ? 0 : 2]));
  }
  return parts;
}

export function buildBaseCampPropsGeometry(def: SettlementDef): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // footed() lifts every part to the real ground at its own spot — Base Camp sits high on
  // Everest's own lower slopes, nowhere near sea level
  def.huts.forEach((h, i) => parts.push(...footed(buildTent(h, i), h.x, h.z)));
  parts.push(...footed(buildPathStones(def.x, def.z, 8, 70, 5005, "#b8ada0"), def.x, def.z));

  for (const p of def.props) {
    switch (p.kind) {
      case "firepit":
        parts.push(...footed(buildFirepit(p.x, p.z), p.x, p.z));
        break;
      case "bench":
        parts.push(...footed(buildBench(p), p.x, p.z));
        break;
      case "crates":
        parts.push(...footed(buildCrates(p), p.x, p.z));
        break;
      case "cairn":
        parts.push(...footed(buildCairn(p), p.x, p.z));
        break;
      case "helipad":
        parts.push(...footed(buildHelipad(p), p.x, p.z));
        break;
      case "bunting":
        parts.push(...footed(buildBunting(p), p.x, p.z));
        break;
      case "lantern":
        parts.push(...footed(buildLantern(p), p.x, p.z));
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
