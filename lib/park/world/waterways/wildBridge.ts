// The Victoria Falls Bridge: a candy-coloured steel arch spanning the Batoka Gorge downstream of
// the falls (lib/park/registry/wildWater.ts's VIC_BRIDGE) — a walkable plank deck (protected by the
// engine's invisible railings, same as a settlement's raised decks: see wildBridgeDeckY, ParkWorld's
// raisedDeckAt), two candy-red arch ribs rising above it with a few lattice cross-struts and
// suspenders, and painted rails along the deck's edge. One draw call.
import * as THREE from "three";
import { col, merge, part, taperTube, transform } from "../fantasy/geo";
import { noise3, rngOf } from "../fantasy/noise";
import { fxMaterial, type FantasyUniforms } from "../fantasy/shaders";
import { groundY } from "../../registry/terrain";
import { VIC_BRIDGE, WILD_FALLS_ISLANDS } from "../../registry/wildWater";

const ARCH_RED = col("#e3384f");
const ARCH_RED_D = col("#b8233a");
const DECK_WOOD = col("#c99a5b");
const DECK_WOOD_D = col("#a87a40");
const RAIL_CREAM = col("#fff3df");
const ISL_ROCK = col("#8d8a86");
const ISL_ROCK_D = col("#6d6b6c");
const ISL_MOSS = col("#6fae3f");
const ISL_PALM = col("#3f8f4a");

export interface WildBridge {
  group: THREE.Group;
  tris: number;
  dispose(): void;
}

/** the deck's height at u (0..1 along the span): the same gentle camber as wildBridgeDeckY */
function deckY(u: number): number {
  const b = VIC_BRIDGE;
  return b.y0 + (b.y1 - b.y0) * u + Math.sin(u * Math.PI) * b.rise;
}
// the steel arch springs from the gorge's own rock walls, well below the deck, and rises in a real
// curve to just under it at mid-span — a true arch bridge, not a decorative hoop floating above a
// flat deck. Its feet are planted close to the river (not out by the rim, where the ground is
// already nearly as high as the deck and there'd be no curve left to see).
const ARCH_U0 = 0.22;
const ARCH_U1 = 0.78;
const ARCH_GAP = 2.4; // how close the crown comes to the underside of the deck
const ARCH_RISE = 20; // the crown's own rise above the higher foot (capped so it can't poke through the deck)

export function buildVicBridge(uniforms: FantasyUniforms): WildBridge {
  const b = VIC_BRIDGE;
  const hx = Math.sin(b.heading);
  const hz = Math.cos(b.heading);
  const px = Math.cos(b.heading);
  const pz = -Math.sin(b.heading);
  const at = (u: number, side: number, up: number): THREE.Vector3 => {
    const a = (u - 0.5) * b.span;
    return new THREE.Vector3(b.x + hx * a + px * side, deckY(u) + up, b.z + hz * a + pz * side);
  };
  const xz = (u: number, side: number): { x: number; z: number } => {
    const a = (u - 0.5) * b.span;
    return { x: b.x + hx * a + px * side, z: b.z + hz * a + pz * side };
  };
  // each rib's own foot height: sampled right from the gorge wall it's planted in, so it always
  // lands on real rock however the terrain happens to fall away there
  const footY = (side: number) => {
    const p0 = xz(ARCH_U0, (b.half + 0.55) * side);
    const p1 = xz(ARCH_U1, (b.half + 0.55) * side);
    return { f0: groundY(p0.x, p0.z) + 1.2, f1: groundY(p1.x, p1.z) + 1.2 };
  };
  const feet = [-1, 1].map((s) => footY(s));
  const archY = (u: number, side: number): number => {
    const { f0, f1 } = feet[side > 0 ? 1 : 0];
    const uL = Math.max(0, Math.min(1, (u - ARCH_U0) / (ARCH_U1 - ARCH_U0)));
    const base = f0 + (f1 - f0) * uL;
    // a real curve every time: the crown aims for ARCH_RISE above the higher foot, only ever
    // capped back by the deck overhead, never flattened out by the terrain at the feet
    const crown = Math.min(deckY(0.5) - ARCH_GAP, Math.max(f0, f1) + ARCH_RISE);
    const bump = Math.max(0, crown - Math.max(f0, f1)) * 4 * uL * (1 - uL);
    return base + bump;
  };

  const parts: THREE.BufferGeometry[] = [];
  const geos: THREE.BufferGeometry[] = [];

  // ── the deck: planks across two stringers ──
  const n = Math.max(10, Math.round(b.span / 0.65));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const a = (u - 0.5) * b.span;
    const g = new THREE.BoxGeometry(b.half * 2 + 0.1, 0.16, (b.span / n) * 0.9);
    const slope = Math.atan2(deckY(Math.min(1, u + 0.01)) - deckY(Math.max(0, u - 0.01)), b.span * 0.02);
    transform(g, 0, 0, 0, 0, 1, -slope);
    transform(g, b.x + hx * a, deckY(u) - 0.08, b.z + hz * a, b.heading);
    parts.push(part(g, i % 2 === 0 ? DECK_WOOD : DECK_WOOD_D, [0, 0, 0], { faceted: true }));
  }
  // two stringers the planks sit on
  for (const s of [-1, 1]) {
    const pts = Array.from({ length: 9 }, (_, i) => at(i / 8, b.half * 0.72 * s, -0.22));
    geos.push(taperTube(pts, { segs: 24, radial: 5, rx: () => 0.13 }));
  }
  parts.push(part(merge(geos.splice(0, geos.length)), DECK_WOOD_D, [0, 0, 0], { faceted: true }));

  // ── the arch ribs: two candy-red steel arches UNDER the deck, planted into the gorge walls far
  //    below it, rising to just under the deck at mid-span (a real through/deck arch, not a hoop) ──
  const archPt = (u: number, s: number): THREE.Vector3 => {
    const p = xz(u, (b.half + 0.55) * s);
    return new THREE.Vector3(p.x, archY(u, s), p.z);
  };
  const ribPts: THREE.Vector3[][] = [-1, 1].map((s) => Array.from({ length: 17 }, (_, i) => archPt(ARCH_U0 + ((ARCH_U1 - ARCH_U0) * i) / 16, s)));
  for (const pts of ribPts) geos.push(taperTube(pts, { segs: 48, radial: 6, rx: (t) => 0.42 - 0.1 * Math.sin(t * Math.PI) }));
  parts.push(part(merge(geos.splice(0, geos.length)), ARCH_RED, [0, 0, 0], { faceted: true }));

  // ── spandrel posts (arch up to the deck) and a few lattice cross-struts (rib to rib) ──
  const SUSP = 8;
  for (let i = 1; i < SUSP; i++) {
    const u = ARCH_U0 + ((ARCH_U1 - ARCH_U0) * i) / SUSP;
    for (const s of [-1, 1]) {
      const bot = archPt(u, s);
      const top = at(u, b.half * 0.72 * s, -0.05);
      const len = top.distanceTo(bot);
      if (len < 0.3) continue;
      const g = new THREE.CylinderGeometry(0.075, 0.075, len, 5);
      g.translate(0, len / 2, 0);
      g.applyMatrix4(new THREE.Matrix4().lookAt(top, bot, new THREE.Vector3(0, 1, 0)));
      g.rotateX(Math.PI / 2);
      transform(g, bot.x, bot.y, bot.z);
      parts.push(part(g, RAIL_CREAM, [0, 0, 0], { faceted: true }));
    }
    // a cross-strut joining the two ribs (lattice bracing, every other post)
    if (i % 2 === 0) {
      const a = archPt(u, -1);
      const c = archPt(u, 1);
      const g = new THREE.CylinderGeometry(0.08, 0.08, a.distanceTo(c), 5);
      g.translate(0, a.distanceTo(c) / 2, 0);
      g.applyMatrix4(new THREE.Matrix4().lookAt(a, c, new THREE.Vector3(0, 1, 0)));
      g.rotateX(Math.PI / 2);
      transform(g, c.x, c.y, c.z);
      parts.push(part(g, ARCH_RED_D, [0, 0, 0], { faceted: true }));
    }
  }

  // ── painted rails along the deck's edge (cream posts, a candy-red handrail tube) ──
  for (const s of [-1, 1]) {
    const rail: THREE.Vector3[] = [];
    const np = Math.max(5, Math.round(b.span / 2.4));
    for (let i = 0; i <= np; i++) {
      const u = i / np;
      const bot = at(u, b.half * s, -0.05);
      const top = at(u, b.half * s, 1.15);
      const post = new THREE.CylinderGeometry(0.075, 0.09, top.y - bot.y, 5);
      transform(post, bot.x, (top.y + bot.y) / 2, bot.z);
      parts.push(part(post, RAIL_CREAM, [0, 0, 0], { faceted: true }));
      rail.push(top);
    }
    parts.push(part(taperTube(rail, { segs: rail.length * 3, radial: 5, rx: () => 0.08 }), ARCH_RED, [0, 0, 0], { faceted: true }));
  }

  const geo = merge(parts);
  const mat = fxMaterial(uniforms, { roughness: 0.65, metalness: 0.08, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "vic-bridge";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.name = "vic-bridge-group";
  group.add(mesh);

  return {
    group,
    tris: geo.attributes.position.count / 3,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

function islandRock(x: number, y: number, z: number, r: number, seed: number, flat = 0.78): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(1, 0);
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + (noise3(v.x * 1.3 + seed, v.y * 1.3, v.z * 1.3 - seed, 4) - 0.5) * 0.55;
    pos.setXYZ(i, x + v.x * r * k, y + Math.max(-0.15, v.y) * r * k * flat, z + v.z * r * k * (0.9 + (seed % 3) * 0.1));
  }
  return part(
    g,
    (p, n) => {
      const m = n.y > 0.45 ? 0.75 : 0;
      const c = ISL_ROCK.clone().lerp(ISL_ROCK_D, Math.abs(noise3(p.x * 0.6, p.y * 0.6, p.z * 0.6, 8)) * 0.8);
      return c.lerp(ISL_MOSS, m * (0.35 + Math.abs(noise3(p.x, p.y, p.z, 9)) * 0.6));
    },
    [0, 0, 0],
    { faceted: true, faceColor: true },
  );
}

/** the rocky islands between the falls' sections (registry/wildWater.ts's WILD_FALLS_ISLANDS) — a
 *  jagged, mossy rock stack poking out of the lip, with a tuft of spray-fed ferns on top. Victoria
 *  Falls' real Livingstone/Boaruka Islands, kid-scale. One draw call, built once. */
export function buildFallsIslands(uniforms: FantasyUniforms): WildBridge {
  const r = rngOf(4242);
  const parts: THREE.BufferGeometry[] = [];
  WILD_FALLS_ISLANDS.forEach((isl, i) => {
    const base = groundY(isl.x, isl.z);
    parts.push(islandRock(isl.x, base + isl.r * 0.55, isl.z, isl.r, i * 17 + 1));
    parts.push(islandRock(isl.x + isl.r * 0.3, base + isl.r * 1.05, isl.z - isl.r * 0.2, isl.r * 0.62, i * 17 + 2, 0.7));
    parts.push(islandRock(isl.x - isl.r * 0.25, base + isl.r * 1.4, isl.z + isl.r * 0.15, isl.r * 0.4, i * 17 + 3, 0.65));
    // a few spiky ferns on top, bending with the spray
    const top = base + isl.r * 1.6;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + r() * 0.6;
      const fx = isl.x + Math.sin(a) * isl.r * 0.3;
      const fz = isl.z + Math.cos(a) * isl.r * 0.3;
      const h = 1.1 + r() * 0.6;
      const g = new THREE.ConeGeometry(0.14, h, 5, 1, true);
      g.translate(0, h / 2, 0);
      transform(g, fx, top, fz, a, 1, 0.25 + r() * 0.15);
      parts.push(part(g, ISL_PALM, [0, 0, 0], { faceted: true }));
    }
  });
  const geo = merge(parts);
  const mat = fxMaterial(uniforms, { roughness: 0.88, metalness: 0, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "falls-islands";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.name = "falls-islands-group";
  group.add(mesh);
  return {
    group,
    tris: geo.attributes.position.count / 3,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
