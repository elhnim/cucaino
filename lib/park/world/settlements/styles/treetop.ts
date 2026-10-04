// Treetop's look: giant rainforest trees, round treehouses painted with leaf-and-flower bands, a
// porch with a window and a birdhouse, platforms joined by a ramp and TWO rope bridges strung with
// hanging lanterns, hammocks slung between trunks, a ground-level drum circle round a big painted
// totem tree, giant glowing mushrooms and flowers on the forest floor, and fireflies after dark.
import * as THREE from "three";
import type { SettlementDef, SettlementHut, SettlementProp } from "../../../registry/settlements";
import { ball, box, cone, cyl, flat, gem, lump, mergeAll, place, pp, stick, v3 } from "../../village/kit";
import { GLOW, SWAY, WOOD_D, buildBarrel, buildFirepit, buildLantern, buildPathStones, buildPennant, buildWelcomeArch, buildWindow, footed, shade } from "./common";
import { crownBase } from "../canopy";

const BARK = "#6e4a30";
const BARK_D = "#44301e";
const TREEHOUSE_WALL = ["#c9a46a", "#bd9860", "#d2ad73"];
const ROOF_COLORS = ["#8a5a36", "#a8683c", "#7a4228", "#9a5a4a"];
const DECK_WOOD = "#7a5a36";
const DECK_WOOD_LT = "#8d6a40";
const DECK_WOOD_D = "#4e3620";
const ROPE = "#c9b48a";
const LEAF = ["#4a9a4a", "#3f8a52", "#6fae3f"];
const FLOWER = ["#ff6fa0", "#ffd24a", "#ff9a4a"];
const TRIM = ["#ff8a3c", "#e03c8a", "#e8c23c", "#4e9e52"];
const MUSHROOM = ["#e8495f", "#ff8a3c", "#c23ce0"];

/** just the trunk + buttress roots — the crown itself (layered tiers, well clear of the platform,
 *  faded near the kid/camera) is ./canopy.ts's job, built as its own small mesh so it can carry the
 *  jungle's see-through cut; this trunk reaches up just far enough to meet the crown's own lowest
 *  reach (crownBase(t) - a couple of units), no gap between them */
function buildGiantTree(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const trunkR = 0.85 * p.scale;
  const trunkH = crownBase({ elev: p.elev ?? 8, scale: p.scale }) - 2;
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

/** a little birdhouse lashed to the trunk just below the porch — one or two per village is enough
 *  "small life" to feel lived-in without costing anything to animate */
function buildBirdhouse(x: number, y: number, z: number, yaw: number, seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const nx = Math.sin(yaw);
  const nz = Math.cos(yaw);
  parts.push(pp(box(0.3, 0.32, 0.3, x, y, z, yaw), TRIM[seed % TRIM.length]));
  parts.push(pp(place(new THREE.ConeGeometry(0.26, 0.22, 4), x, y + 0.27, z, yaw + Math.PI / 4), "#6e4a2a"));
  parts.push(pp(cyl(0.035, 0.035, 0.1, 5, x + nx * 0.14, y, z + nz * 0.14), "#3a2a18"));
  return parts;
}

function buildTreehouseCabin(hut: SettlementHut, seed: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const y = hut.elev ?? 0;
  const rad = 1.85 * hut.size;
  const porchR = treehousePorchR(hut.size);
  // scales with hut.size (unlike the old fixed 1.9) so a bigger treehouse also stands taller, not
  // just wider — a real room's worth of headroom, not a dollhouse lid
  const wallH = 1.3 * hut.size;
  const wall = TREEHOUSE_WALL[seed % TREEHOUSE_WALL.length];
  const trim = TRIM[seed % TRIM.length];
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
  // the round wall: clean vertical stripes in the clan's two colours (one segment = one stripe —
  // reads crisply even at this low segment count, unlike a high-frequency painted sine band, which
  // just shows as a couple of huge flat triangles), with a band of small separate leaf + flower
  // SHAPES glued on round the top (not a painted-on pattern, so it never looks like a glitch)
  const segN = 10;
  const accent = LEAF[seed % LEAF.length];
  parts.push(
    pp(cyl(rad, rad * 0.9, wallH, segN, hut.x, y + 0.08, hut.z, true), (pt, n) => {
      const a = Math.atan2(pt.x - hut.x, pt.z - hut.z) + Math.PI;
      const stripe = Math.floor((a / (Math.PI * 2)) * segN) % 2;
      return shade(stripe ? accent : wall, 0.88 + 0.14 * Math.max(0, n.z));
    })
  );
  for (let i = 0; i < segN; i++) {
    const a = (i / segN) * Math.PI * 2 + Math.PI / segN;
    const lx = hut.x + Math.sin(a) * rad * 1.01;
    const lz = hut.z + Math.cos(a) * rad * 1.01;
    const ly = y + 0.08 + wallH * (0.62 + 0.1 * (i % 2));
    if (i % 2 === 0) {
      // a little leaf, flat against the wall
      const leaf = flat([[0, 0], [0.16, 0.12], [0, 0.32], [-0.16, 0.12]]);
      parts.push(pp(place(leaf, lx, ly, lz, a), LEAF[(i + seed) % LEAF.length]));
    } else {
      // a little flower: a gem bloom with a tiny dark centre
      parts.push(pp(gem(0.1, lx, ly, lz, 1, 1, 0.6), FLOWER[(i + seed) % FLOWER.length]));
    }
  }
  const roofH = 0.85 * hut.size;
  parts.push(pp(cone(rad * 1.2, roofH, segN, hut.x, y + 0.08 + wallH, hut.z), (pt, n) => shade(ROOF_COLORS[seed % ROOF_COLORS.length], 0.82 + 0.18 * Math.max(0, n.y))));
  // a ridge cap ring at the roof's foot, in the clan's trim colour — the cottage's "hat band"
  parts.push(pp(cyl(rad * 1.2 * 1.02, rad * 1.2 * 1.02, 0.14, segN, hut.x, y + 0.08 + wallH, hut.z, true), trim));
  // a dark door arch, facing back towards the fire
  const doorX = hut.x + Math.sin(hut.yaw) * rad * 0.98;
  const doorZ = hut.z + Math.cos(hut.yaw) * rad * 0.98;
  parts.push(pp(box(0.75 * hut.size, 0.9 * hut.size, 0.12 * hut.size, doorX, y + 0.08 + 0.46 * hut.size, doorZ, hut.yaw), BARK_D));
  // a round dormer window, a little round birdhouse under the eaves
  const winA = hut.yaw + Math.PI * 0.6;
  parts.push(...buildWindow(hut.x + Math.sin(winA) * rad * 0.99, y + 0.08 + wallH * 0.6, hut.z + Math.cos(winA) * rad * 0.99, winA, trim, 0.46 * hut.size, 0.5 * hut.size));
  const bhA = hut.yaw - Math.PI * 0.45;
  parts.push(...buildBirdhouse(hut.x + Math.sin(bhA) * rad * 1.02, y + 0.08 + wallH * 0.35, hut.z + Math.cos(bhA) * rad * 1.02, bhA, seed));
  return parts;
}

function buildPlatformDeck(d: Extract<SettlementDef["decks"][number], { kind: "circle" }>): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const seg = 16;
  parts.push(
    pp(cyl(d.r, d.r, 0.16, seg, d.x, d.y - 0.14, d.z), (pt, n) => {
      const ring = Math.floor(Math.hypot(pt.x - d.x, pt.z - d.z) / 0.55) % 2;
      return shade(ring ? DECK_WOOD : DECK_WOOD_LT, 0.85 + 0.15 * Math.max(0, n.y));
    })
  );
  for (let i = 0; i < seg; i += 2) {
    const a = (i / seg) * Math.PI * 2;
    parts.push(pp(cyl(0.05, 0.05, 0.85, 5, d.x + Math.sin(a) * d.r * 0.96, d.y, d.z + Math.cos(a) * d.r * 0.96), DECK_WOOD_D));
  }
  parts.push(pp(cyl(d.r * 0.98, d.r * 0.98, 0.05, seg, d.x, d.y + 0.8, d.z, true), DECK_WOOD_D));
  parts.push(pp(cyl(d.r * 0.98, d.r * 0.98, 0.04, seg, d.x, d.y + 0.35, d.z, true), DECK_WOOD_D));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.5;
    parts.push(pp(cyl(0.12, 0.14, Math.max(0.2, d.y), 6, d.x + Math.sin(a) * d.r * 0.7, 0, d.z + Math.cos(a) * d.r * 0.7), BARK_D));
  }
  return parts;
}

/** a ramp (ground -> platform) or a rope bridge (platform -> platform): a sloped plank walk with
 *  rope handrails strung between posts along both sides, and (a bridge only) a hanging lantern
 *  every few posts so the crossing glows warm at dusk */
function buildDeckLine(d: Extract<SettlementDef["decks"][number], { kind: "line" }>): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const len = Math.hypot(d.bx - d.ax, d.bz - d.az);
  const yaw = Math.atan2(d.bx - d.ax, d.bz - d.az);
  const isBridge = d.tag === "bridge";
  const sagAmt = isBridge ? Math.min(1.1, len * 0.035) : 0;
  const at = (t: number) => ({
    x: d.ax + (d.bx - d.ax) * t,
    z: d.az + (d.bz - d.az) * t,
    y: d.ay + (d.by - d.ay) * t - Math.sin(Math.PI * t) * sagAmt,
  });
  if (!isBridge) {
    const mx = (d.ax + d.bx) / 2;
    const mz = (d.az + d.bz) / 2;
    const my = (d.ay + d.by) / 2;
    const pitch = -Math.atan2(d.by - d.ay, len);
    parts.push(pp(place(box(d.half * 2, 0.14, len), mx, my, mz, yaw, 1, pitch), (pt, n) => shade(DECK_WOOD, 0.82 + 0.18 * Math.max(0, n.y))));
  } else {
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
    // a lantern hung from the rope rail every other post on a bridge, so the crossing glows at dusk
    if (isBridge && i % 2 === 0 && i > 0 && i < nPosts) parts.push(...buildHangingLantern(p.x + Math.sin(yaw + Math.PI / 2) * (d.half - 0.1), p.y + 1.0, p.z + Math.cos(yaw + Math.PI / 2) * (d.half - 0.1)));
  }
  return parts;
}

/** a lantern hung from a rail or a branch (no post to the ground — unlike common.ts's buildLantern,
 *  which plants one, this is for anything already up in the air: a bridge rail, a porch eave) */
function buildHangingLantern(x: number, y: number, z: number): THREE.BufferGeometry[] {
  return [pp(stick(v3(x, y, z), v3(x, y - 0.22, z), 0.025), WOOD_D), pp(gem(0.12, x, y - 0.32, z, 0.9, 1.3, 0.9), "#ffc569", GLOW)];
}

/** a hammock slung between two trunks, a lazy little catenary of knotted rope-cloth */
function buildHammock(ax: number, az: number, bx: number, bz: number, hang: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const len = Math.hypot(bx - ax, bz - az);
  const yaw = Math.atan2(bx - ax, bz - az);
  const y = hang;
  parts.push(pp(place(flat([[-len / 2, 0], [len / 2, 0], [len / 2 - 0.3, -0.75], [-len / 2 + 0.3, -0.75]]), mx, y, mz, yaw + Math.PI / 2), "#e8c23c", SWAY));
  for (const s of [-1, 1]) parts.push(pp(stick(v3(mx + Math.sin(yaw) * s * (len / 2 - 0.1), y, mz + Math.cos(yaw) * s * (len / 2 - 0.1)), v3(ax + (bx - ax) * (s < 0 ? 0 : 1), y + 0.4, az + (bz - az) * (s < 0 ? 0 : 1)), 0.02), "#c9b48a"));
  return parts;
}

function buildDrumLog(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(pp(place(cyl(0.35, 0.4, 0.95, 8, 0, 0, 0), p.x, 0.48, p.z, p.yaw), (pt, n) => shade(BARK, 0.84 + 0.16 * Math.max(0, n.y))));
  parts.push(pp(cyl(0.36, 0.36, 0.08, 8, p.x, 0.9, p.z), BARK_D));
  return parts;
}

/** the big painted totem tree at the centre of the drum circle: carved rings in bright clan colours */
function buildTotem(x: number, z: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) parts.push(pp(cyl(0.42 - i * 0.03, 0.45 - i * 0.03, 0.62, 8, x, i * 0.62, z), TRIM[i % TRIM.length]));
  parts.push(pp(cone(0.45, 0.7, 8, x, 5 * 0.62, z), "#3f8a3f"));
  return parts;
}

function buildGardenLeaf(p: SettlementProp, i: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  if (i % 3 === 2) return buildMushroom(p);
  const leaf = flat([[0, 0], [0.45, 0.25], [0, 1.3], [-0.45, 0.25]]);
  parts.push(pp(place(leaf, p.x, 0, p.z, p.yaw, p.scale), LEAF[Math.floor(p.scale * 7) % LEAF.length]));
  parts.push(pp(gem(0.12 * p.scale, p.x + Math.sin(p.yaw) * 0.3, 1.0 * p.scale, p.z + Math.cos(p.yaw) * 0.3), FLOWER[Math.floor(p.scale * 11) % FLOWER.length], GLOW));
  return parts;
}
/** a giant glowing mushroom (storybook forest-floor colour, soft glow after dusk via GLOW) */
function buildMushroom(p: SettlementProp): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const h = 0.55 * p.scale;
  parts.push(pp(cyl(0.07 * p.scale, 0.09 * p.scale, h, 6, p.x, 0, p.z), "#e8e0c8"));
  parts.push(pp(lump(0.32 * p.scale, p.x, h + 0.12 * p.scale, p.z, p.scale * 7, 1.3, 0.75, 1.3, 0.2), MUSHROOM[Math.floor(p.scale * 5) % MUSHROOM.length], GLOW));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    parts.push(pp(gem(0.045 * p.scale, p.x + Math.sin(a) * 0.2 * p.scale, h + 0.2 * p.scale, p.z + Math.cos(a) * 0.2 * p.scale), "#fff8ea"));
  }
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
  def.huts.forEach((h, i) => parts.push(...footed(buildTreehouseCabin(h, i), h.x, h.z)));
  // a hammock between the first two giant trees, if they're a reasonable span apart
  const trees = def.props.filter((p) => p.kind === "giant-tree");
  if (trees.length >= 2) {
    const a = trees[0];
    const b = trees[1];
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d > 4 && d < 16) parts.push(...footed(buildHammock(a.x, a.z, b.x, b.z, 2.2), (a.x + b.x) / 2, (a.z + b.z) / 2));
  }
  // the totem stands just behind the drum ring (not on top of the fire pit itself), in the gap
  // between two drums
  const totemA = (0.5 / 6) * Math.PI * 2;
  const totemX = def.x + Math.sin(totemA) * 5.4;
  const totemZ = def.z + Math.cos(totemA) * 5.4;
  parts.push(...footed(buildTotem(totemX, totemZ), totemX, totemZ));
  parts.push(...footed(buildPathStones(def.x, def.z, 8, 50, 2002, "#7a6a48"), def.x, def.z));
  // buildWelcomeArch feet itself (it works out its own ground spot, well away from the centre) —
  // wrapping it in footed() again here would lift it a second time, by the village centre's own
  // height, planting the arch high in the air or burying it
  parts.push(...buildWelcomeArch(def, TRIM));
  // a couple of barrels at the foot of the trees, and bright pennants dotted round the clearing —
  // more colour and dressing so the forest floor never reads as bare
  for (const t of trees.slice(0, 3)) {
    const a = t.yaw + 2.0;
    parts.push(...footed(buildBarrel(t.x + Math.sin(a) * (t.scale + 1.2), t.z + Math.cos(a) * (t.scale + 1.2), a), t.x, t.z));
  }
  parts.push(...footed(buildPennant(def.x + Math.sin(2.3) * 7, def.z + Math.cos(2.3) * 7, 2.2, TRIM[1]), def.x + Math.sin(2.3) * 7, def.z + Math.cos(2.3) * 7));
  parts.push(...footed(buildPennant(def.x + Math.sin(5.1) * 7.5, def.z + Math.cos(5.1) * 7.5, 2.4, TRIM[3]), def.x + Math.sin(5.1) * 7.5, def.z + Math.cos(5.1) * 7.5));
  let gi = 0;
  for (const p of def.props) {
    switch (p.kind) {
      case "firepit":
        parts.push(...footed(buildFirepit(p.x, p.z, "#7a6a48"), p.x, p.z));
        break;
      case "drumlog":
        parts.push(...footed(buildDrumLog(p), p.x, p.z));
        break;
      case "gardenleaf":
        parts.push(...footed(buildGardenLeaf(p, gi++), p.x, p.z));
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
