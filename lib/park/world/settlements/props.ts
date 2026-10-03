// A settlement's props and decks, as chunky faceted storybook models in the fantasy kit's layout
// (shared with Coralcove's props: ../village/kit.ts's `pp()` + fxMaterial's wind sway and night
// glow), all merged into ONE mesh per settlement. Lakeside's look: round reed-thatched huts on
// short stilts, a wooden pier, drying racks hung with fish, nets on poles, a smokehouse with a
// chimney, a fire pit ringed by log benches, lanterns, and a heron's lookout perch.
import * as THREE from "three";
import type { SettlementDef, SettlementFauna, SettlementHut, SettlementProp } from "../../registry/settlements";
import { ball, box, col, cone, cyl, flat, fp, gem, lump, mergeAll, place, pp, stick, v3, type Fx } from "../village/kit";
import { groundY } from "../../registry/terrain";
import { crownBase } from "./canopy";

/** every part, moved up (or down) to the REAL ground at (x, z) — Treetop and Highstone sit much
 *  higher than Lakeside's lake shore, so (unlike Lakeside's props, built assuming y=0 is ~ground)
 *  their own builders below are written in local "ground = 0" space and footed here, each at its
 *  own spot's true height, so a cottage never ends up buried in a hillside or a tree floating over
 *  one */
function footed(parts: THREE.BufferGeometry[], x: number, z: number): THREE.BufferGeometry[] {
  const gy = groundY(x, z);
  for (const g of parts) g.translate(0, gy, 0);
  return parts;
}

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

// ── Treetop: giant rainforest trees, round treehouses up on their trunks, platforms, a rope bridge
// and a ramp, a ground-level drum circle and garden ──

const BARK = "#6e4a30";
const BARK_D = "#44301e";
const TREEHOUSE_WALL = ["#c9a46a", "#bd9860", "#d2ad73"];
const TREEHOUSE_ROOF = "#8a5a36";
const DECK_WOOD = "#7a5a36";
const DECK_WOOD_LT = "#8d6a40";
const DECK_WOOD_D = "#4e3620";
const ROPE = "#c9b48a";
const LEAF = ["#4a9a4a", "#3f8a52", "#6fae3f"];
const FLOWER = ["#ff6fa0", "#ffd24a", "#ff9a4a"];

/** just the trunk + buttress roots — the crown itself (layered tiers, well clear of the platform,
 *  faded near the kid/camera) is ./canopy.ts's job, built as its own small mesh so it can carry the
 *  jungle's see-through cut; this trunk reaches up just far enough to meet the crown's own lowest
 *  reach (crownBase(t) - a couple of units), no gap between them */
function buildGiantTree(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const trunkR = 0.85 * p.scale;
  const trunkH = crownBase({ elev: p.elev ?? 8, scale: p.scale }) - 2;
  // buttress roots fanning out from the base
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + p.yaw;
    parts.push(pp(place(box(0.55, 1.7, 1.15, 0, 0, 0), p.x + Math.sin(a) * trunkR * 0.85, 0.75, p.z + Math.cos(a) * trunkR * 0.85, a), BARK_D));
  }
  parts.push(pp(cyl(trunkR, trunkR * 1.35, trunkH, 9, p.x, 0, p.z), (pt, n) => shade(BARK, 0.82 + 0.18 * Math.max(0, n.x))));
  return parts;
}

/** the porch floor's own radius, beyond the cabin's walls — kept in step with
 *  registry/settlements.ts's platR, so a walkable platform (A/B) lines up exactly with the cabin
 *  built on it, not two mismatched circles */
export function treehousePorchR(hutSize: number): number {
  return 1.85 * hutSize * 1.08;
}

function buildTreehouseCabin(hut: SettlementHut, seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const y = hut.elev ?? 0;
  const rad = 1.85 * hut.size;
  const porchR = treehousePorchR(hut.size);
  const wallH = 1.9;
  const wall = TREEHOUSE_WALL[seed % TREEHOUSE_WALL.length];
  // the floor deck: a little plank porch beyond the walls (banded rings, not one flat disc), with a
  // rail round its edge
  parts.push(
    pp(cyl(porchR, porchR, 0.16, 12, hut.x, y - 0.08, hut.z), (pt, n) => {
      const ring = Math.floor(Math.hypot(pt.x - hut.x, pt.z - hut.z) / 0.5) % 2;
      return shade(ring ? DECK_WOOD : DECK_WOOD_LT, 0.85 + 0.15 * Math.max(0, n.y));
    })
  );
  for (let i = 0; i < 12; i += 2) {
    const a = (i / 12) * Math.PI * 2;
    parts.push(pp(cyl(0.045, 0.05, 0.75, 5, hut.x + Math.sin(a) * porchR * 0.96, y + 0.05, hut.z + Math.cos(a) * porchR * 0.96), DECK_WOOD_D));
  }
  parts.push(pp(cyl(porchR * 0.98, porchR * 0.98, 0.04, 12, hut.x, y + 0.7, hut.z, true), DECK_WOOD_D));
  parts.push(pp(cyl(rad, rad * 0.9, wallH, 10, hut.x, y + 0.08, hut.z, true), (pt, n) => shade(wall, 0.86 + 0.14 * Math.max(0, n.z))));
  parts.push(pp(cone(rad * 1.2, 1.3, 10, hut.x, y + 0.08 + wallH, hut.z), (pt, n) => shade(TREEHOUSE_ROOF, 0.82 + 0.18 * Math.max(0, n.y))));
  // a dark door arch, facing back towards the fire
  parts.push(pp(box(0.8, 1.2, 0.14, hut.x + Math.sin(hut.yaw) * rad * 0.98, y + 0.08 + 0.65, hut.z + Math.cos(hut.yaw) * rad * 0.98, hut.yaw), BARK_D));
  return parts;
}

function buildPlatformDeck(d: Extract<SettlementDef["decks"][number], { kind: "circle" }>): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const seg = 16;
  // the deck itself: concentric plank rings (alternating tone bands, like boards laid in circles
  // round the trunk), not a single flat brown disc
  parts.push(
    pp(cyl(d.r, d.r, 0.16, seg, d.x, d.y - 0.14, d.z), (pt, n) => {
      const ring = Math.floor(Math.hypot(pt.x - d.x, pt.z - d.z) / 0.55) % 2;
      return shade(ring ? DECK_WOOD : DECK_WOOD_LT, 0.85 + 0.15 * Math.max(0, n.y));
    })
  );
  // rail posts, and a continuous rail beam (a thin ring) and a lower kick-rail — a real railing a
  // kid can see, not a few lonely sticks
  for (let i = 0; i < seg; i += 2) {
    const a = (i / seg) * Math.PI * 2;
    parts.push(pp(cyl(0.05, 0.05, 0.85, 5, d.x + Math.sin(a) * d.r * 0.96, d.y, d.z + Math.cos(a) * d.r * 0.96), DECK_WOOD_D));
  }
  parts.push(pp(cyl(d.r * 0.98, d.r * 0.98, 0.05, seg, d.x, d.y + 0.8, d.z, true), DECK_WOOD_D));
  parts.push(pp(cyl(d.r * 0.98, d.r * 0.98, 0.04, seg, d.x, d.y + 0.35, d.z, true), DECK_WOOD_D));
  // support posts down to the ground
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.5;
    parts.push(pp(cyl(0.12, 0.14, Math.max(0.2, d.y), 6, d.x + Math.sin(a) * d.r * 0.7, 0, d.z + Math.cos(a) * d.r * 0.7), BARK_D));
  }
  return parts;
}

/** a ramp (ground -> platform) or a rope bridge (platform -> platform): a sloped plank walk with
 *  rope handrails strung between posts along both sides */
function buildDeckLine(d: Extract<SettlementDef["decks"][number], { kind: "line" }>): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const len = Math.hypot(d.bx - d.ax, d.bz - d.az);
  const yaw = Math.atan2(d.bx - d.ax, d.bz - d.az);
  const isBridge = d.tag === "bridge";
  // a rope bridge sags a little in the middle (planks and rope-rails alike); a ramp is a firm, fixed
  // slope — no sag
  const sagAmt = isBridge ? Math.min(1.1, len * 0.035) : 0;
  const at = (t: number) => ({
    x: d.ax + (d.bx - d.ax) * t,
    z: d.az + (d.bz - d.az) * t,
    y: d.ay + (d.by - d.ay) * t - Math.sin(Math.PI * t) * sagAmt,
  });
  if (!isBridge) {
    // the ramp: one firm sloped plank walk
    const mx = (d.ax + d.bx) / 2;
    const mz = (d.az + d.bz) / 2;
    const my = (d.ay + d.by) / 2;
    const pitch = -Math.atan2(d.by - d.ay, len);
    parts.push(pp(place(box(d.half * 2, 0.14, len), mx, my, mz, yaw, 1, pitch), (pt, n) => shade(DECK_WOOD, 0.82 + 0.18 * Math.max(0, n.y))));
  } else {
    // the bridge: individual plank treads (with a little gap between them) following the sag, so it
    // reads as a rope bridge's boards, not one solid walkway
    const plankLen = 0.85;
    const nPlanks = Math.max(4, Math.round(len / plankLen));
    for (let i = 0; i < nPlanks; i++) {
      const p0 = at(i / nPlanks);
      const p1 = at((i + 0.8) / nPlanks);
      const segLen = Math.hypot(p1.x - p0.x, p1.z - p0.z, p1.y - p0.y);
      const mx = (p0.x + p1.x) / 2;
      const mz = (p0.z + p1.z) / 2;
      const my = (p0.y + p1.y) / 2;
      const localYaw = Math.atan2(p1.x - p0.x, p1.z - p0.z);
      const pitch = -Math.atan2(p1.y - p0.y, Math.hypot(p1.x - p0.x, p1.z - p0.z));
      parts.push(pp(place(box(d.half * 2, 0.1, segLen + 0.05), mx, my, mz, localYaw, 1, pitch), i % 2 ? DECK_WOOD : DECK_WOOD_LT));
    }
  }
  // posts (ramp only — a bridge hangs on its own rope rails instead) and rope hand-rails along both
  // sides, following the very same sag the deck itself follows
  const nPosts = Math.max(2, Math.round(len / 3));
  const prevRope: Record<string, { x: number; y: number; z: number }> = {};
  for (let i = 0; i <= nPosts; i++) {
    const t = i / nPosts;
    const p = at(t);
    for (const s of [-1, 1]) {
      const px = p.x + Math.sin(yaw + Math.PI / 2) * s * (d.half - 0.1);
      const pz = p.z + Math.cos(yaw + Math.PI / 2) * s * (d.half - 0.1);
      if (!isBridge) parts.push(pp(cyl(0.045, 0.05, 1.05, 5, px, p.y, pz), DECK_WOOD_D));
      const key = String(s);
      if (i > 0) parts.push(pp(stick(v3(prevRope[key].x, prevRope[key].y + 1.0, prevRope[key].z), v3(px, p.y + 1.0, pz), 0.035), ROPE));
      prevRope[key] = { x: px, y: p.y, z: pz };
    }
  }
  return parts;
}

function buildDrumLog(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(place(cyl(0.35, 0.4, 0.95, 8, 0, 0, 0), p.x, 0.48, p.z, p.yaw), (pt, n) => shade(BARK, 0.84 + 0.16 * Math.max(0, n.y))));
  parts.push(pp(cyl(0.36, 0.36, 0.08, 8, p.x, 0.9, p.z), BARK_D));
  return parts;
}
function buildGardenLeaf(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const leaf = flat([
    [0, 0],
    [0.45, 0.25],
    [0, 1.3],
    [-0.45, 0.25],
  ]);
  parts.push(pp(place(leaf, p.x, 0, p.z, p.yaw, p.scale), LEAF[Math.floor(p.scale * 7) % LEAF.length]));
  parts.push(pp(gem(0.12 * p.scale, p.x + Math.sin(p.yaw) * 0.3, 1.0 * p.scale, p.z + Math.cos(p.yaw) * 0.3), FLOWER[Math.floor(p.scale * 11) % FLOWER.length], GLOW));
  return parts;
}
function buildBananaBunch(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(stick(v3(p.x, 1.6, p.z), v3(p.x, 0.9, p.z), 0.04), "#5a7a3a"));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(pp(ball(0.14, p.x + Math.sin(a) * 0.18, 0.95 - i * 0.02, p.z + Math.cos(a) * 0.18, 0, 1, 1.6, 1), "#e8d24a"));
  }
  return parts;
}
function buildBasketProp(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(place(cyl(0.3 * p.scale, 0.24 * p.scale, 0.42 * p.scale, 8, 0, 0, 0), p.x, 0.21 * p.scale, p.z, p.yaw), "#b08a4e"));
  parts.push(pp(lump(0.2 * p.scale, p.x, 0.42 * p.scale, p.z, 3, 1, 0.8, 1, 0.3), "#e0503c"));
  return parts;
}

export function buildTreetopPropsGeometry(def: SettlementDef): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // every builder above is written in its own local "ground = 0" space — footed() lifts (or drops)
  // each one to the REAL ground at its own spot, since Treetop sits much higher than Lakeside's lake
  // shore (unlike Lakeside's props, which assume y=0 is already ~ground there)
  def.huts.forEach((h, i) => parts.push(...footed(buildTreehouseCabin(h, i), h.x, h.z)));
  for (const p of def.props) {
    switch (p.kind) {
      case "firepit":
        parts.push(...footed(buildFirepit(p.x, p.z), p.x, p.z));
        break;
      case "drumlog":
        parts.push(...footed(buildDrumLog(p), p.x, p.z));
        break;
      case "gardenleaf":
        parts.push(...footed(buildGardenLeaf(p), p.x, p.z));
        break;
      case "giant-tree":
        parts.push(...footed(buildGiantTree(p), p.x, p.z));
        break;
      case "banana-bunch":
        parts.push(...footed(buildBananaBunch(p), p.x, p.z));
        break;
      case "basket":
        parts.push(...footed(buildBasketProp(p), p.x, p.z));
        break;
      case "lantern":
        parts.push(...footed(buildLantern(p), p.x, p.z));
        break;
      default:
        break;
    }
  }
  // decks are NOT footed: their y is the registry's own walkable height (settlementDeckY reads the
  // very same number), so the platform/ramp/bridge the kid walks on is drawn exactly where they land
  for (const d of def.decks) parts.push(...(d.kind === "circle" ? buildPlatformDeck(d) : buildDeckLine(d)));
  return mergeAll(parts);
}

// ── Highstone: stone cottages, a yak pasture fence, a loom, firewood, bunting, a water trough ──

const STONE_WALL = ["#9a8f7c", "#8f8470", "#a69a84"];
const SLATE_ROOF = ["#5a6670", "#51606a"];
const STONE_D = "#6e6354";
const BUNTING = ["#e8485f", "#ffc23d", "#4fb4e8", "#5aa852", "#a860d6"];

function buildCottage(hut: SettlementHut, seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const w = 1.9 * hut.size;
  const d = 1.7 * hut.size;
  const wallH = 1.7;
  const wall = STONE_WALL[seed % STONE_WALL.length];
  parts.push(pp(place(box(w, wallH, d), hut.x, wallH / 2, hut.z, hut.yaw), (pt, n) => shade(wall, 0.84 + 0.16 * Math.max(0, n.y) + (Math.sin(pt.x * 5 + seed) > 0.7 ? -0.05 : 0))));
  // a gabled slate roof
  const roof = place(new THREE.ConeGeometry(Math.hypot(w, d) * 0.62, 1.1, 4), hut.x, wallH + 0.55, hut.z, hut.yaw + Math.PI / 4);
  parts.push(pp(roof, (pt, n) => shade(SLATE_ROOF[seed % SLATE_ROOF.length], 0.82 + 0.18 * Math.max(0, n.y))));
  const chimX = hut.x - Math.sin(hut.yaw) * w * 0.3;
  const chimZ = hut.z - Math.cos(hut.yaw) * d * 0.3;
  parts.push(pp(box(0.3, 1.0, 0.3, chimX, wallH + 0.85, chimZ), STONE_D));
  // door, facing the fire
  parts.push(pp(box(0.8, 1.25, 0.1, hut.x + Math.sin(hut.yaw) * w * 0.52, 0.62, hut.z + Math.cos(hut.yaw) * d * 0.52, hut.yaw), "#4a3828"));
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
  // warp threads strung on the frame — a few bright stripes
  for (let i = 0; i < 6; i++) {
    const f = (i / 5 - 0.5) * 0.7;
    parts.push(pp(stick(v3(p.x + Math.sin(p.yaw + Math.PI / 2) * f, 0.4, p.z + Math.cos(p.yaw + Math.PI / 2) * f), v3(p.x + Math.sin(p.yaw + Math.PI / 2) * f, 1.48, p.z + Math.cos(p.yaw + Math.PI / 2) * f), 0.02), BUNTING[i % BUNTING.length]));
  }
  return parts;
}
function buildFencePost(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(cyl(0.07, 0.08, 1.1, 5, p.x, 0, p.z), "#5e4a34"));
  return parts;
}
function buildBunting(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const n = Math.max(2, Math.round(p.scale / 1.1));
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = p.x + Math.sin(p.yaw) * p.scale * t;
    const z = p.z + Math.cos(p.yaw) * p.scale * t;
    const sag = Math.sin(Math.PI * t) * 0.35;
    const flag = flat([
      [0, 0],
      [0.22, 0],
      [0.11, -0.3],
    ]);
    parts.push(pp(place(flag, x, 2.4 - sag, z, p.yaw + Math.PI / 2), BUNTING[i % BUNTING.length]));
  }
  return parts;
}

export function buildMountainPropsGeometry(def: SettlementDef): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // footed() lifts every part to the REAL ground at its own spot — Highstone sits high on the
  // mountain's own slopes, nowhere near Lakeside's near-sea-level y=0 assumption
  def.huts.forEach((h, i) => parts.push(...footed(buildCottage(h, i), h.x, h.z)));
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
      default:
        break;
    }
  }
  return mergeAll(parts);
}

// ── Highstone's yaks and goats: a shaggy, horned quadruped, built once and instanced, sharing the
// folk crowd's own material (world/settlements/index.ts) — the body takes the instance colour (slot
// 1), so each one can be brown, black or cream without a second geometry ──
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
