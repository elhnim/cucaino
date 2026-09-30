// The things to discover on the floating islands (registry/skyIslands.ts SKY_SPOTS): grottoes,
// dragon-egg nests, rune circles, telescopes, sky launchers, hot springs, wishing bells, swings,
// giant glowing flowers, lookouts, shrines, treehouses, sleepy cloudlings and fairy rings.
// Chunky storybook low-poly in the fantasy kit's layout (see fantasy/geo.ts).
//
// buildSpot() returns island-local pieces: static geometry (merged into the islands' one mesh),
// water discs (the waterfall mesh), sprites (mist / glow halos) and placements for the few moving
// parts (eggs, hatched babies, rune caps, bells, swings, floating crystals, cloudlings) that
// sky.ts draws as small instanced meshes (one draw call per kind).
import * as THREE from "three";
import { blob, col, merge, mix, part, taperTube, transform, type Fx } from "../fantasy/geo";
import { noise3, rngOf, smoothstep, type Rng } from "../fantasy/noise";
import { SPRITE_FOREST_MIST, SPRITE_HALO, type SpriteDef } from "../fantasy/particles";
import { buildCrystalGeometry, CRYSTAL_HUES, RUNE_CYAN, RUNE_GOLD, ruinPartGeometry } from "../fantasy/stones";
import { buildTreeGeometry, tintFor } from "../fantasy/trees";
import { RUNE_STONE_RING, SKY_RUNE_STONES, skyIslandById, skyLocalHeight, type SkyIsland, type SkySpot } from "../../registry/skyIslands";

const scratch = new THREE.Color();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const WOOD = col("#9a5d33");
const WOOD_DARK = col("#6b3d22");
const ROPE = col("#d8b27a");
const GOLD = col("#ffc93d");
const BRASS = col("#e0a93a");
const STONE = col("#bdb3c6");
const STONE_DARK = col("#8f86a0");
const ROCK = col("#a79bb8");
const MOSS = col("#5aa83c");
const CAVE_IN = col("#3a2d55");
const PEAK_LIGHT = col("#cdbfd0");
const RED = col("#e8413a");
const CREAM = col("#fff3dc");

export type AnimKind = "egg" | "baby" | "rune" | "bell" | "swing" | "spinner" | "cloudling";
export const ANIM_KINDS: AnimKind[] = ["egg", "baby", "rune", "bell", "swing", "spinner", "cloudling"];

export interface AnimPlacement {
  kind: AnimKind;
  /** the spot it belongs to (+ `#i` for rune stones) */
  key: string;
  /** island-local position (pivot) and yaw */
  x: number;
  y: number;
  z: number;
  rot: number;
  s: number;
}

export interface SpotBuild {
  statics: THREE.BufferGeometry[];
  /** island-local water discs (position + uv + aT) for the waterfall material */
  water: THREE.BufferGeometry[];
  /** island-local sprites (sky.ts fills in the island slot) */
  sprites: Omit<SpriteDef, "isl">[];
  anim: AnimPlacement[];
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.Color, fx: Fx = [0, 0, 0], rotY = 0, rotX = 0, rotZ = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  transform(g, x, y, z, rotY, 1, rotX, rotZ);
  return part(g, c, fx, { faceted: true });
}
function cyl(r0: number, r1: number, h: number, seg: number, x: number, y: number, z: number, c: THREE.Color, fx: Fx = [0, 0, 0]) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg);
  transform(g, x, y + h / 2, z);
  return part(g, c, fx, { faceted: true });
}
function lump(rad: number, x: number, y: number, z: number, c: THREE.Color | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.Color), seed: number, squash = 0.75, detail = 0) {
  const g = new THREE.IcosahedronGeometry(rad, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.8 + noise3(pos.getX(i) * 1.3 + seed, pos.getY(i) * 1.3, pos.getZ(i) * 1.3, 3) * 0.4;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * squash, pos.getZ(i) * k);
  }
  transform(g, x, y, z, seed);
  return part(g, c, [0, 0, 0], { faceted: true, faceColor: true });
}
/** a water disc for the waterfall material (aT = 0: slow, calm water) */
function waterDisc(rad: number, x: number, y: number, z: number, seg = 12): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(rad, seg);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  g.deleteAttribute("normal");
  const flat = g.toNonIndexed();
  g.dispose();
  flat.setAttribute("aT", new THREE.Float32BufferAttribute(new Float32Array(flat.attributes.position.count), 1));
  return flat;
}

/** a tiny oak/pine from the kit, tinted, for a spot (cached per species) */
const treeCache = new Map<string, THREE.BufferGeometry>();
function kitTree(sp: "oak" | "pine", tint: THREE.Color): THREE.BufferGeometry {
  let g = treeCache.get(sp);
  if (!g) {
    g = buildTreeGeometry(sp, true, 5).geometry;
    treeCache.set(sp, g);
  }
  const c = g.clone();
  const colA = c.attributes.color as THREE.BufferAttribute;
  const fx = c.attributes.aFx as THREE.BufferAttribute;
  for (let i = 0; i < colA.count; i++) {
    const w = fx.getX(i);
    colA.setXYZ(i, colA.getX(i) * (1 - w + w * tint.r), colA.getY(i) * (1 - w + w * tint.g), colA.getZ(i) * (1 - w + w * tint.b));
    fx.setX(i, 0);
  }
  return c;
}
export function disposeSpotCaches() {
  for (const g of treeCache.values()) g.dispose();
  treeCache.clear();
}

/** Build one discovery. Everything comes back in island-local coordinates. */
export function buildSpot(sp: SkySpot, isl: SkyIsland, low: boolean): SpotBuild {
  const r: Rng = rngOf(Math.floor(Math.abs(sp.x * 131 + sp.z * 17)) + 7);
  const statics: THREE.BufferGeometry[] = [];
  const water: THREE.BufferGeometry[] = [];
  const sprites: Omit<SpriteDef, "isl">[] = [];
  const anim: AnimPlacement[] = [];
  const cx = sp.x - isl.x;
  const cz = sp.z - isl.z;
  const cos = Math.cos(sp.rot);
  const sin = Math.sin(sp.rot);
  /** spot-local (lx, lz) → island-local x/z */
  const L = (lx: number, lz: number): [number, number] => [cx + lx * cos + lz * sin, cz - lx * sin + lz * cos];
  const H = (lx: number, lz: number) => {
    const [x, z] = L(lx, lz);
    return skyLocalHeight(isl, x, z);
  };
  const g0 = H(0, 0);
  /** put a geometry built in spot-local space (y relative to the ground at the spot's centre) */
  const put = (g: THREE.BufferGeometry, lx = 0, lz = 0, dy = 0, follow = false) => {
    const [x, z] = L(lx, lz);
    transform(g, x, (follow ? skyLocalHeight(isl, x, z) : g0) + dy, z, sp.rot);
    statics.push(g);
  };
  /** put a geometry whose vertices are in spot-local space (0,0 = centre) and sit on the ground */
  const putLocal = (g: THREE.BufferGeometry) => {
    transform(g, 0, 0, 0, sp.rot);
    transform(g, cx, g0, cz);
    statics.push(g);
  };
  const sprite = (lx: number, dy: number, lz: number, size: number, color: THREE.Color, kind = SPRITE_HALO) => {
    const [x, z] = L(lx, lz);
    sprites.push({ x, y: g0 + dy, z, size, color, kind });
  };
  const animAt = (kind: AnimKind, lx: number, lz: number, dy: number, rot = 0, s = 1, key = sp.id, follow = false) => {
    const [x, z] = L(lx, lz);
    anim.push({ kind, key, x, y: (follow ? skyLocalHeight(isl, x, z) : g0) + dy, z, rot: sp.rot + rot, s });
  };

  switch (sp.kind) {
    case "cave": {
      // a rocky dome grotto set against the peak, cut open at the front (local +z) into an
      // arched cave mouth facing the meadow
      const Z0 = 2.2;
      const na = low ? 12 : 18;
      const ne = low ? 3 : 5;
      const shell = (R: number, inner: boolean) => {
        const pos: number[] = [];
        const P = (ia: number, ie: number) => {
          const a = (ia / na) * Math.PI * 2;
          const e = (ie / ne) * (Math.PI / 2);
          const w = ie === ne ? 1 : 1 + (noise3(Math.cos(a) * 2, e * 2, Math.sin(a) * 2, isl.seed) - 0.5) * (inner ? 0.1 : 0.25);
          const lx = Math.sin(a) * Math.cos(e) * R * w;
          const lz = Math.min(Z0, Math.cos(a) * Math.cos(e) * R * w);
          return V(lx, Math.sin(e) * R * 0.95 * w + (H(lx, lz) - g0) * (1 - ie / ne) - 0.3, lz);
        };
        for (let ia = 0; ia < na; ia++)
          for (let ie = 0; ie < ne; ie++) {
            const a = P(ia, ie);
            const b = P(ia + 1, ie);
            const c = P(ia, ie + 1);
            const d = P(ia + 1, ie + 1);
            // wind each face so the outer shell faces out and the inner one faces in
            for (const [p0, p1, p2] of [
              [a, b, c],
              [b, d, c],
            ]) {
              if (p0.z >= Z0 - 1e-4 && p1.z >= Z0 - 1e-4 && p2.z >= Z0 - 1e-4) continue; // the open front
              const n = new THREE.Vector3().subVectors(p1, p0).cross(new THREE.Vector3().subVectors(p2, p0));
              if (n.lengthSq() < 1e-8) continue;
              const m = new THREE.Vector3().add(p0).add(p1).add(p2).divideScalar(3);
              const outward = n.dot(m) > 0;
              const tri = outward !== inner ? [p0, p1, p2] : [p0, p2, p1];
              for (const v of tri) pos.push(v.x, v.y, v.z);
            }
          }
        return pos;
      };
      const outer = new THREE.BufferGeometry();
      outer.setAttribute("position", new THREE.Float32BufferAttribute(shell(4.4, false), 3));
      putLocal(part(outer, (p, n) => (n.y > 0.65 ? MOSS : mix(ROCK, STONE_DARK, noise3(p.x * 0.5, p.y * 0.5, p.z * 0.5, 2), scratch)), [0, 0, 0], { faceted: true, faceColor: true }));
      const inner = new THREE.BufferGeometry();
      inner.setAttribute("position", new THREE.Float32BufferAttribute(shell(3.35, true), 3));
      putLocal(part(inner, (p) => mix(CAVE_IN, col("#6a4a8a"), smoothstep(0, 3, p.y) * 0.5, scratch), [0, 0, 0.08], { faceted: true, faceColor: true }));
      // the arched rim of the mouth (closing the shell's thickness), studded with rocks
      const rim = new THREE.TorusGeometry(3.15, 0.7, 4, low ? 8 : 12, Math.PI);
      const rp = rim.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < rp.count; i++) rp.setZ(i, rp.getZ(i) * 0.9);
      transform(rim, 0, -0.3, Z0 - 0.05);
      put(part(rim, (p, n) => (n.y > 0.7 ? MOSS : mix(ROCK, PEAK_LIGHT, 0.35 + noise3(p.x, p.y, p.z, 4) * 0.3, scratch)), [0, 0, 0], { faceted: true, faceColor: true }));
      for (let k = 0; k < 4; k++) {
        const a = 0.35 + k * 0.8;
        put(lump(0.5 + r() * 0.3, Math.cos(a) * 3.3, Math.sin(a) * 3.3 - 0.2, Z0 + 0.2, ROCK, isl.seed + k * 3, 0.9));
      }
      // chunky boulders framing the mouth
      for (const sd of [-1, 1]) {
        const a = sd * 1.02;
        put(lump(1.2, 0, 0, 0, ROCK, isl.seed + sd, 0.9), Math.sin(a) * 3.7, Math.cos(a) * 3.7, 0.4, true);
      }
      // glowing crystals inside, a cosy lantern glow
      for (let k = 0; k < (low ? 3 : 5); k++) {
        const g = buildCrystalGeometry(rngOf(isl.seed * 7 + k));
        const colA = g.attributes.color as THREE.BufferAttribute;
        const fx = g.attributes.aFx as THREE.BufferAttribute;
        const hue = CRYSTAL_HUES[k % 3];
        for (let i = 0; i < colA.count; i++) {
          colA.setXYZ(i, colA.getX(i) * hue.r, colA.getY(i) * hue.g, colA.getZ(i) * hue.b);
          fx.setX(i, 0);
        }
        const a = Math.PI + (k - 2) * 0.6;
        transform(g, 0, 0, 0, r() * 6, 0.55 + r() * 0.35, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5);
        put(g, Math.sin(a) * 2.5, Math.cos(a) * 2.5, -0.1, true);
      }
      sprite(0, 1.4, -1.2, 7, col("#ffcf8a"));
      sprite(0, 1.0, -2.2, 4.5, CRYSTAL_HUES[0]);
      break;
    }
    case "nest": {
      // a big twiggy nest with a speckled dragon egg (the egg and the hatchling move)
      const nest = new THREE.TorusGeometry(1.55, 0.6, low ? 4 : 5, low ? 10 : 14);
      nest.rotateX(Math.PI / 2);
      const np = nest.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < np.count; i++) np.setY(i, np.getY(i) * 0.75 + (noise3(np.getX(i) * 2, 0, np.getZ(i) * 2, 5) - 0.5) * 0.3);
      transform(nest, 0, 0.35, 0);
      put(part(nest, (p) => mix(col("#8a5a32"), col("#c08a50"), noise3(p.x * 3, p.y * 3, p.z * 3, 7), scratch), [0, 0, 0], { faceted: true, faceColor: true }));
      const floor = new THREE.CylinderGeometry(1.2, 1.3, 0.3, 10);
      transform(floor, 0, 0.12, 0);
      put(part(floor, col("#7a4e2a"), [0, 0, 0], { faceted: true }));
      for (let k = 0; k < (low ? 5 : 10); k++) {
        const a = (k / 10) * Math.PI * 2 + r();
        const stick = new THREE.BoxGeometry(0.09, 0.09, 1.5 + r());
        transform(stick, Math.sin(a) * 1.9, 0.55 + r() * 0.3, Math.cos(a) * 1.9, a + 1.2 + r(), 1, (r() - 0.5) * 0.8, 0);
        put(part(stick, WOOD, [0, 0, 0], { faceted: true }));
      }
      // soft feathers
      for (let k = 0; k < 3; k++) {
        const f = new THREE.ConeGeometry(0.12, 0.7, 3);
        transform(f, (r() - 0.5) * 3, 0.9, (r() - 0.5) * 3, r() * 6, 1, 0.9, 0.4);
        put(part(f, col(["#ff9fcf", "#8fd6ff", "#ffd23f"][k]), [0, 0, 0], { faceted: true }));
      }
      animAt("egg", 0, 0, 0.3);
      animAt("baby", 0, 0, 0.3);
      sprite(0, 1.2, 0, 3.5, col("#ffe0a0"));
      break;
    }
    case "stones": {
      // a rune altar ringed by five rune stepping stones (their rune caps light up)
      for (const g of ruinPartGeometry({ kind: "altar", x: 0, y: 0, z: 0, rot: 0, h: 0.75, seed: Math.floor(r() * 1e6), runes: true }, isl.kind === "ruins" && isl.id === "sunset-ruins" ? RUNE_GOLD : RUNE_CYAN)) put(g, 0, 0, -0.1);
      for (const st of SKY_RUNE_STONES.filter((s) => s.spot === sp.id)) {
        const lx = (st.x - sp.x) * cos - (st.z - sp.z) * sin;
        const lz = (st.x - sp.x) * sin + (st.z - sp.z) * cos;
        const slab = new THREE.CylinderGeometry(0.78, 0.86, 0.26, 6);
        transform(slab, 0, 0.06, 0, r());
        put(part(slab, (p, n) => (n.y > 0.5 ? STONE : STONE_DARK), [0, 0, 0], { faceted: true, faceColor: true }), lx, lz, 0, true);
        animAt("rune", lx, lz, 0.2, 0, 1, `${sp.id}#${st.i}`, true);
      }
      // a faint ring path joining them
      const ringN = low ? 10 : 20;
      for (let k = 0; k < ringN; k++) {
        const a = (k / ringN) * Math.PI * 2;
        const pebble = new THREE.CylinderGeometry(0.16, 0.2, 0.08, 5);
        put(part(pebble, STONE, [0, 0, 0], { faceted: true }), Math.sin(a) * RUNE_STONE_RING, Math.cos(a) * RUNE_STONE_RING, 0.01, true);
      }
      sprite(0, 1.6, 0, 4, RUNE_CYAN);
      break;
    }
    case "telescope": {
      // a brass telescope on a wooden tripod, aimed at another island
      const t = skyIslandById(sp.target!)!;
      const dist = Math.hypot(t.x - sp.x, t.z - sp.z);
      const pitch = Math.atan2(t.y - (isl.y + g0 + 1.5), dist);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const leg = new THREE.CylinderGeometry(0.05, 0.07, 1.6, 4);
        transform(leg, Math.sin(a) * 0.35, 0.75, Math.cos(a) * 0.35, 0, 1, Math.cos(a) * 0.3, -Math.sin(a) * 0.3);
        put(part(leg, WOOD_DARK, [0, 0, 0], { faceted: true }));
      }
      const tube = new THREE.CylinderGeometry(0.16, 0.24, 1.9, 8);
      tube.rotateX(Math.PI / 2 - pitch);
      transform(tube, 0, 1.55, 0.2);
      put(part(tube, (p, n) => mix(BRASS, col("#fff0b0"), Math.max(0, n.y) * 0.5, scratch), [0, 0, 0.25], { faceted: true, faceColor: true }));
      const rim = new THREE.TorusGeometry(0.26, 0.06, 4, 10);
      rim.rotateX(-pitch);
      transform(rim, 0, 1.55 + Math.sin(pitch) * 0.95, 0.2 + Math.cos(pitch) * 0.95);
      put(part(rim, GOLD, [0, 0, 0.5], { faceted: true }));
      // a little step to stand on
      put(box(0.9, 0.22, 0.6, 0, 0.1, -0.9, WOOD));
      break;
    }
    case "launcher": {
      const cannon = sp.name.includes("Cannon");
      // a springy launch pad (walk onto it to go!)
      const pad = new THREE.CylinderGeometry(1.45, 1.6, 0.22, 10);
      transform(pad, 0, 0.05, 0);
      put(part(pad, (p, n) => (n.y > 0.5 ? (cannon ? col("#6fd0ff") : col("#ff7fbf")) : col("#f5ecd8")), [0, 0, 0.35], { faceted: true, faceColor: true }), 0, 0, 0, true);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.3;
        const dot = new THREE.CylinderGeometry(0.22, 0.22, 0.05, 6);
        transform(dot, Math.sin(a) * 0.85, 0.18, Math.cos(a) * 0.85);
        put(part(dot, CREAM, [0, 0, 0.3], { faceted: true }), 0, 0, 0, true);
      }
      if (cannon) {
        // a candy-striped sky cannon behind the pad, pointing at the target
        const barrel = new THREE.CylinderGeometry(0.42, 0.55, 2.2, 10);
        barrel.rotateX(Math.PI / 2 - 0.7);
        transform(barrel, 0, 1.2, -2.3);
        put(part(barrel, (p) => (Math.floor((p.y + p.z) * 2.2) % 2 === 0 ? RED : CREAM), [0, 0, 0], { faceted: true, faceColor: true }));
        for (const sd of [-1, 1]) {
          const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.18, 8);
          wheel.rotateZ(Math.PI / 2);
          transform(wheel, sd * 0.6, 0.5, -2.6);
          put(part(wheel, WOOD, [0, 0, 0], { faceted: true }));
        }
      } else {
        // bouncy mushrooms round the pad
        for (let k = 0; k < 3; k++) {
          const a = Math.PI * 0.75 + k * 0.4;
          const x = Math.sin(a) * 2.2;
          const z = Math.cos(a) * 2.2;
          const h = 0.8 + k * 0.35;
          put(cyl(0.18, 0.14, h, 6, x, 0, z, CREAM));
          const cap = new THREE.SphereGeometry(0.6 + k * 0.1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);
          transform(cap, x, h - 0.05, z, 0, V(1, 0.7, 1));
          put(part(cap, col("#ff7fbf"), [0, 0, 0.2], { faceted: true }));
        }
      }
      // an arrow sign pointing where you'll fly
      put(box(0.14, 1.6, 0.14, 1.9, 0.75, -0.6, WOOD_DARK));
      put(box(0.9, 0.34, 0.1, 1.9, 1.45, -0.35, col("#ffd23f"), [0, 0, 0], Math.PI / 2));
      const tip = new THREE.ConeGeometry(0.28, 0.4, 3);
      tip.rotateX(Math.PI / 2);
      transform(tip, 1.9, 1.45, 0.3);
      put(part(tip, col("#ffd23f"), [0, 0, 0], { faceted: true }));
      sprite(0, 0.4, 0, 4.5, cannon ? col("#6fd0ff") : col("#ff9fd8"));
      break;
    }
    case "hotspring": {
      // a steaming pool ringed by round stones
      water.push(waterDisc(2.1, cx, g0 + 0.06, cz, low ? 10 : 14));
      const bed = new THREE.CylinderGeometry(2.25, 2.25, 0.1, 14);
      transform(bed, 0, 0.0, 0);
      put(part(bed, col("#2fb3c8"), [0, 0, 0.1], { faceted: true }));
      for (let k = 0; k < (low ? 9 : 14); k++) {
        const a = (k / 14) * Math.PI * 2;
        put(lump(0.42 + r() * 0.2, Math.sin(a) * 2.4, 0.12, Math.cos(a) * 2.4, (p, n) => mix(STONE_DARK, STONE, Math.max(0, n.y), scratch), k + isl.seed));
      }
      for (let k = 0; k < (low ? 4 : 7); k++) sprite((r() - 0.5) * 2.4, 0.9 + r() * 1.4, (r() - 0.5) * 2.4, 3 + r() * 2, col("#ffffff"), SPRITE_FOREST_MIST);
      break;
    }
    case "bell": {
      // a wishing bell hanging from a little roofed frame (the bell sways)
      for (const sd of [-1, 1]) put(box(0.22, 3.2, 0.22, sd * 1.35, 1.6, 0, WOOD_DARK));
      put(box(3.1, 0.24, 0.28, 0, 3.15, 0, WOOD));
      const roof = new THREE.ConeGeometry(2.1, 0.9, 4);
      transform(roof, 0, 3.7, 0, Math.PI / 4, V(1, 1, 0.45));
      put(part(roof, col("#e0463a"), [0, 0, 0], { faceted: true }));
      put(box(0.05, 1.3, 0.05, 0.25, 1.4, 0, ROPE));
      animAt("bell", 0, 0, 3.05);
      break;
    }
    case "swing": {
      // a big old tree by the edge with a rope swing hanging out over the clouds
      const tr = kitTree("oak", tintFor("oak", 0.3 + r() * 0.4));
      transform(tr, 0, -0.15, 0, r() * 6, 0.62);
      put(tr, 0, -0.6);
      const branch = taperTube([V(0, 4.1, -0.6), V(0, 4.9, 0.9), V(0.1, 5.25, 2.6)], { segs: 5, radial: 5, rx: (t) => 0.3 * (1 - t) + 0.1 });
      put(part(branch, WOOD, [0, 0, 0], { faceted: true }));
      animAt("swing", 0, 2.45, 5.2);
      break;
    }
    case "garden": {
      // giant glowing flowers, taller than you
      const n = low ? 4 : 6;
      const hues = [col("#ff6fb0"), col("#ffd23f"), col("#8f7bff"), col("#5fe0ff"), col("#ff8a4a"), col("#b6ff6a")];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r() * 0.5;
        const d = k === 0 ? 0 : 1.6 + r() * 1.2;
        const x = Math.sin(a) * d;
        const z = Math.cos(a) * d;
        const h = 1.8 + r() * 1.6;
        const stem = taperTube([V(x, -0.1, z), V(x + (r() - 0.5) * 0.4, h * 0.5, z + (r() - 0.5) * 0.4), V(x, h, z)], { segs: 4, radial: 4, rx: (t) => 0.12 * (1 - t) + 0.06 });
        put(part(stem, col("#3f9a3a"), [0, 0.3, 0], { faceted: true }), 0, 0, 0, false);
        const hue = hues[(k + (isl.seed % 5)) % hues.length];
        for (let pI = 0; pI < 5; pI++) {
          const pa = (pI / 5) * Math.PI * 2;
          const petal = new THREE.IcosahedronGeometry(0.45, 0);
          transform(petal, x + Math.sin(pa) * 0.5, h + 0.2, z + Math.cos(pa) * 0.5, pa, V(0.75, 0.3, 1.2), -0.55);
          put(part(petal, hue, [0, 0.4, 0.35], { faceted: true }));
        }
        const heart = new THREE.IcosahedronGeometry(0.28, 0);
        transform(heart, x, h + 0.15, z);
        put(part(heart, col("#fff2a0"), [0, 0.4, 1.4], { faceted: true }));
        const leaf = new THREE.ConeGeometry(0.3, 1.1, 3);
        transform(leaf, x + 0.35, h * 0.35, z, a, 1, 0, 1.0);
        put(part(leaf, col("#4fb043"), [0, 0.3, 0], { faceted: true }));
        sprite(x, h + 0.3, z, 3.2, hue);
      }
      break;
    }
    case "lookout": {
      // a wooden railing round a viewpoint at the edge, with a signpost
      const n = 7;
      for (let k = 0; k < n; k++) {
        const a = -1.1 + (k / (n - 1)) * 2.2;
        put(box(0.18, 1.2, 0.18, Math.sin(a) * 2.3, 0.55, Math.cos(a) * 2.3, WOOD_DARK), 0, 0, 0);
        if (k < n - 1) {
          const b = a + 1.1 / (n - 1);
          const seg = 2 * 2.3 * Math.sin(1.1 / (n - 1));
          for (const y of [0.6, 1.1]) put(box(seg + 0.1, 0.1, 0.12, Math.sin(b) * 2.3 * Math.cos(1.1 / (n - 1)), y, Math.cos(b) * 2.3 * Math.cos(1.1 / (n - 1)), WOOD, [0, 0, 0], b));
        }
      }
      put(box(0.16, 2.2, 0.16, -1.2, 1.0, -0.6, WOOD_DARK));
      put(box(1.3, 0.4, 0.1, -1.2, 1.9, -0.6, col("#f0d49a"), [0, 0, 0], 0.3));
      put(box(0.8, 0.12, 0.35, 1.1, 0.45, -0.7, WOOD));
      put(box(0.12, 0.42, 0.3, 0.8, 0.2, -0.7, WOOD_DARK));
      put(box(0.12, 0.42, 0.3, 1.4, 0.2, -0.7, WOOD_DARK));
      break;
    }
    case "shrine": {
      // a tiny shrine; a crystal floats and turns above it
      put(box(2.0, 0.35, 2.0, 0, 0.1, -0.4, STONE));
      for (const [x, z] of [[-0.75, -1.15], [0.75, -1.15], [-0.75, 0.35], [0.75, 0.35]]) put(cyl(0.1, 0.1, 1.5, 5, x, 0.25, z, col("#e0463a")));
      const roof = new THREE.ConeGeometry(1.6, 0.9, 4);
      transform(roof, 0, 2.2, -0.4, Math.PI / 4);
      put(part(roof, col("#8f7bff"), [0, 0, 0], { faceted: true }));
      put(box(0.6, 0.3, 0.6, 0, 0.45, -0.4, GOLD, [0, 0, 0.6]));
      animAt("spinner", 0, -0.4, 1.25);
      sprite(0, 1.3, -0.4, 4, isl.kind === "crystal" ? CRYSTAL_HUES[1] : col("#bfe8ff"));
      break;
    }
    case "treehouse": {
      // a treehouse: a stout trunk, a platform and a little hut in the branches, a ladder down
      const trunk = taperTube([V(0, -0.3, -0.8), V(0.2, 2.5, -0.8), V(-0.1, 5.2, -0.8)], { segs: 6, radial: 7, rx: (t) => 0.75 * (1 - t) + 0.35 + 0.4 * (1 - smoothstep(0, 0.15, t)) });
      put(part(trunk, WOOD, [0, 0, 0], { faceted: true }));
      put(box(3.2, 0.2, 3.0, 0, 3.4, -0.8, WOOD));
      put(box(2.2, 1.5, 1.9, 0, 4.25, -1.0, col("#f0c890")));
      put(box(0.6, 0.9, 0.05, 0, 4.0, -0.03, WOOD_DARK));
      put(box(0.45, 0.4, 0.05, -0.7, 4.4, -0.03, col("#ffd36b"), [0, 0, 1.6]));
      const roof = new THREE.ConeGeometry(1.9, 1.2, 4);
      transform(roof, 0, 5.55, -1.0, Math.PI / 4);
      put(part(roof, col("#e0463a"), [0, 0, 0], { faceted: true }));
      for (const [x, y, z, rr] of [[0.2, 6.6, -1.2, 2.2], [1.6, 5.8, -0.6, 1.5], [-1.5, 6.0, -1.4, 1.6]] as const) {
        const b = blob(x, y, z, rr, rr * 0.8, rr, { detail: 0, lump: 0.4, seed: x * 7 + isl.seed });
        put(part(b, (p, n) => mix(col("#3f9c4a"), col("#8fd65a"), Math.max(0, n.y) * 0.7, scratch), [0, 0.2, 0], { faceted: true, faceColor: true }));
      }
      // the ladder
      for (const sd of [-0.32, 0.32]) put(box(0.08, 3.5, 0.08, sd, 1.7, 0.7, WOOD_DARK, [0, 0, 0], 0, -0.12));
      for (let k = 0; k < 7; k++) put(box(0.7, 0.07, 0.07, 0, 0.3 + k * 0.45, 0.72 - k * 0.055, WOOD));
      sprite(-0.7, 4.4, 0, 3, col("#ffcf5a"));
      break;
    }
    case "cloudling": {
      // a little bed of moss for a sleeping cloud creature (it breathes)
      const bed = new THREE.CylinderGeometry(1.5, 1.7, 0.15, 10);
      put(part(bed, col("#79c24e"), [0, 0, 0], { faceted: true }));
      animAt("cloudling", 0, 0, 0.05);
      sprite(0, 1.3, 0, 4, col("#e8f4ff"));
      break;
    }
    case "mushroomring": {
      // a fairy ring of giant mushrooms with glowing spots
      const n = 7;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = Math.sin(a) * 2.9;
        const z = Math.cos(a) * 2.9;
        const h = 1.0 + ((k * 37) % 5) * 0.25;
        const cap = 0.75 + ((k * 13) % 4) * 0.12;
        const hue = k % 2 ? col("#ff7fbf") : col("#8f7bff");
        const stem = new THREE.CylinderGeometry(0.2, 0.3, h, 6);
        transform(stem, x, h / 2, z);
        put(part(stem, CREAM, [0, 0, 0], { faceted: true }), 0, 0, 0);
        const c = new THREE.SphereGeometry(cap, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);
        transform(c, x, h - 0.05, z, 0, V(1, 0.7, 1));
        put(part(c, hue, [0, 0, 0.25], { faceted: true }));
        for (let j = 0; j < 3; j++) {
          const b = (j / 3) * Math.PI * 2 + k;
          const dot = new THREE.OctahedronGeometry(0.1, 0);
          transform(dot, x + Math.cos(b) * cap * 0.55, h + cap * 0.45, z + Math.sin(b) * cap * 0.55);
          put(part(dot, col("#ffffff"), [0, 0, 1.2], { faceted: true }));
        }
        if (k % 2 === 0) sprite(x, h + 0.4, z, 2.6, hue);
      }
      // tiny glowing mushrooms in the middle
      for (let k = 0; k < 5; k++) {
        const a = r() * Math.PI * 2;
        const d = r() * 1.4;
        put(cyl(0.05, 0.04, 0.25, 4, Math.sin(a) * d, 0, Math.cos(a) * d, CREAM));
        const c = new THREE.SphereGeometry(0.14, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2);
        transform(c, Math.sin(a) * d, 0.24, Math.cos(a) * d);
        put(part(c, col("#7ff6ff"), [0, 0, 1.4], { faceted: true }));
      }
      break;
    }
  }
  return { statics, water, sprites, anim };
}

/** unit geometry for a moving part, pivot at the origin (see buildSpot's anim placements) */
export function animGeometry(kind: AnimKind, low: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const speckled = (p: THREE.Vector3) => (noise3(p.x * 6, p.y * 6, p.z * 6, 3) > 0.66 ? col("#6fb8ff") : noise3(p.x * 5 + 9, p.y * 5, p.z * 5, 4) > 0.7 ? col("#ff8ac2") : col("#fff0d0"));
  switch (kind) {
    case "egg": {
      const g = new THREE.IcosahedronGeometry(0.62, low ? 1 : 2);
      transform(g, 0, 0.78, 0, 0, V(1, 1.3, 1));
      parts.push(part(g, speckled, [0, 0, 0.12], { faceted: true, faceColor: true }));
      break;
    }
    case "baby": {
      // the bottom half of the shell (zig-zag rim) and a baby dragon peeking out
      const shell = new THREE.SphereGeometry(0.62, 10, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      const sp = shell.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < sp.count; i++) if (sp.getY(i) > -0.01) sp.setY(i, (Math.round(Math.atan2(sp.getZ(i), sp.getX(i)) * 5) % 2 ? 0.18 : -0.04));
      transform(shell, 0, 0.6, 0, 0, V(1, 1.3, 1));
      parts.push(part(shell, speckled, [0, 0, 0.12], { faceted: true, faceColor: true }));
      const skin = col("#7fdc6a");
      const body = new THREE.IcosahedronGeometry(0.42, 1);
      transform(body, 0, 0.95, 0, 0, V(1, 1.1, 0.95));
      parts.push(part(body, skin, [0, 0, 0], { faceted: true }));
      const head = new THREE.IcosahedronGeometry(0.36, 1);
      transform(head, 0, 1.45, 0.08);
      parts.push(part(head, skin, [0, 0, 0], { faceted: true }));
      const snout = new THREE.IcosahedronGeometry(0.2, 0);
      transform(snout, 0, 1.36, 0.36, 0, V(1.1, 0.8, 1));
      parts.push(part(snout, col("#a8ec8e"), [0, 0, 0], { faceted: true }));
      for (const sd of [-1, 1]) {
        const eye = new THREE.IcosahedronGeometry(0.08, 0);
        transform(eye, sd * 0.15, 1.53, 0.35);
        parts.push(part(eye, col("#1d1a2a"), [0, 0, 0], { faceted: true }));
        const horn = new THREE.ConeGeometry(0.07, 0.25, 4);
        transform(horn, sd * 0.16, 1.8, -0.02, 0, 1, -0.3, sd * -0.3);
        parts.push(part(horn, col("#ffd23f"), [0, 0, 0], { faceted: true }));
        const wing = new THREE.ConeGeometry(0.25, 0.5, 3);
        transform(wing, sd * 0.45, 1.05, -0.1, 0, V(0.4, 1, 1), 0, sd * -1.2);
        parts.push(part(wing, col("#ff9fcf"), [0, 0, 0], { faceted: true }));
      }
      break;
    }
    case "rune": {
      // a rune ring + star glyph lying on a stepping stone; the instance colour lights it
      const ring = new THREE.TorusGeometry(0.46, 0.06, 3, 16);
      ring.rotateX(Math.PI / 2);
      parts.push(part(ring, col("#ffffff"), [1, 0, 2.4]));
      for (let k = 0; k < 3; k++) {
        const bar = new THREE.BoxGeometry(0.62, 0.04, 0.08);
        transform(bar, 0, 0, 0, (k / 3) * Math.PI);
        parts.push(part(bar, col("#ffffff"), [1, 0, 2.4]));
      }
      break;
    }
    case "bell": {
      const prof = [V(0, -1.05, 0), V(0.62, -1.05, 0), V(0.56, -0.85, 0), V(0.42, -0.45, 0), V(0.36, -0.12, 0), V(0.2, 0, 0), V(0, 0.02, 0)].map((v) => new THREE.Vector2(v.x, v.y));
      const bell = new THREE.LatheGeometry(prof, low ? 7 : 10);
      parts.push(part(bell, (p, n) => mix(GOLD, col("#fff3a8"), Math.max(0, n.y * 0.5 + n.x * 0.3), scratch), [0, 0, 0.35], { faceted: true, faceColor: true }));
      const clapper = new THREE.IcosahedronGeometry(0.13, 0);
      transform(clapper, 0, -1.1, 0);
      parts.push(part(clapper, col("#b8862a"), [0, 0, 0], { faceted: true }));
      parts.push(box(0.12, 0.18, 0.12, 0, 0.08, 0, WOOD_DARK));
      break;
    }
    case "swing": {
      for (const sd of [-0.45, 0.45]) parts.push(box(0.05, 4.0, 0.05, sd, -2.0, 0, ROPE));
      parts.push(box(1.15, 0.12, 0.42, 0, -4.0, 0, WOOD));
      break;
    }
    case "spinner": {
      const g = new THREE.OctahedronGeometry(0.42, 0);
      g.scale(1, 1.7, 1);
      parts.push(part(g, (p, n) => mix(col("#9ff4ff"), col("#ffffff"), Math.max(0, n.y), scratch), [0, 0, 1.6], { faceted: true, faceColor: true }));
      break;
    }
    case "cloudling": {
      // a round fluffy cloud with a sleepy face
      const white = (p: THREE.Vector3, n: THREE.Vector3) => mix(col("#dfe8ff"), col("#ffffff"), Math.max(0, n.y) * 0.8 + 0.2, scratch);
      for (const [x, y, z, rr] of [[0, 0.75, 0, 0.85], [0.75, 0.55, -0.1, 0.6], [-0.75, 0.55, -0.1, 0.62], [0.3, 1.3, -0.25, 0.55], [-0.35, 1.25, -0.2, 0.5], [0, 0.45, -0.6, 0.6]] as const) {
        const b = blob(x, y, z, rr, rr * 0.9, rr, { detail: low ? 0 : 1, lump: 0.25, seed: x * 9 + y });
        parts.push(part(b, white, [0, 0, 0.05], { faceted: true, faceColor: true }));
      }
      // closed eyes (little arcs), rosy cheeks
      for (const sd of [-1, 1]) {
        const eye = new THREE.TorusGeometry(0.12, 0.025, 3, 8, Math.PI);
        transform(eye, sd * 0.28, 0.95, 0.83, 0, 1, 0, Math.PI);
        parts.push(part(eye, col("#3a3450"), [0, 0, 0]));
        const cheek = new THREE.CircleGeometry(0.1, 6);
        transform(cheek, sd * 0.45, 0.78, 0.8, sd * 0.4);
        parts.push(part(cheek, col("#ff9fcf"), [0, 0, 0]));
      }
      break;
    }
  }
  return merge(parts);
}
