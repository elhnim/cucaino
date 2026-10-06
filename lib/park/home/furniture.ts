// My Home: hand-built chunky low-poly furniture (no model files). Every piece is a handful of
// rounded boxes / cylinders / balls, merged per colour into a few meshes with the park's shared
// toon look. Origin conventions:
//   floor items — centre of the footprint on the floor (y = 0), w along x, d along z, front = +Z
//   wall items  — centre of the item on the wall surface, sticking out along +Z
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { paintedHomeTexture, badgeTexture, clockFaceTexture, posterTexture } from "./textures";

/** shared materials / textures, owned (and disposed) by the room */
export interface FurnitureKit {
  accent: string;
  /** earned badge emoji for the trophy shelf */
  badges: string[];
  toon(color: string): THREE.Material;
  /** unlit, always-bright (bulbs, screens) */
  glow(color: string): THREE.MeshBasicMaterial;
  glass(): THREE.Material;
  texture(key: string, make: () => THREE.Texture): THREE.Texture;
  /** textured, lit plane material (posters, clock face) */
  picture(key: string, make: () => THREE.Texture): THREE.Material;
}

export interface BuiltItem {
  group: THREE.Group;
  /** per-frame animation (fish swimming, clock ticking, lights twinkling) */
  anim?: (t: number, dt: number) => void;
  /** the bit the pet plays with (a ball it bats about, a duck that bobs) */
  toy?: THREE.Object3D;
  dispose(): void;
}

const WOOD = "#e3ab6c";
const WOOD_D = "#b97a45";
const CREAM = "#fff3dc";
const WHITE = "#ffffff";
const PINK = "#ff9cc4";
const MINT = "#8fe3c0";
const SKY = "#8fd0ff";
const LILAC = "#c3a6ff";
const BUTTER = "#ffd978";
const CORAL = "#ff9a7a";
const GREEN = "#6cc873";
const GREEN_D = "#4aa45a";
const DARK = "#4a4163";
const GOLD = "#ffc53d";

export function lighten(hex: string, k: number): string {
  return "#" + new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), k).getHexString();
}
export function darken(hex: string, k: number): string {
  return "#" + new THREE.Color(hex).lerp(new THREE.Color("#2a1830"), k).getHexString();
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

class Parts {
  private byColor = new Map<string, THREE.BufferGeometry[]>();
  readonly group = new THREE.Group();
  private geos: THREE.BufferGeometry[] = [];
  constructor(private kit: FurnitureKit) {}

  private put(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: [number, number, number] = [1, 1, 1]) {
    tmpE.set(rx, ry, rz);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(new THREE.Vector3(x, y, z), tmpQ, new THREE.Vector3(...s));
    geo.applyMatrix4(tmpM);
    const list = this.byColor.get(color) ?? [];
    list.push(geo);
    this.byColor.set(color, list);
  }
  box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, o: { r?: number; rx?: number; ry?: number; rz?: number } = {}) {
    const r = Math.min(o.r ?? 0.05, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    const geo = r > 0.01 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    this.put(geo, color, x, y, z, o.rx, o.ry, o.rz);
  }
  cyl(rt: number, rb: number, h: number, color: string, x: number, y: number, z: number, o: { seg?: number; rx?: number; ry?: number; rz?: number; open?: boolean } = {}) {
    this.put(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 14, 1, o.open ?? false), color, x, y, z, o.rx, o.ry, o.rz);
  }
  ball(r: number, color: string, x: number, y: number, z: number, s: [number, number, number] = [1, 1, 1], o: { rx?: number; ry?: number; rz?: number; seg?: number } = {}) {
    const seg = o.seg ?? 12;
    this.put(new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7))), color, x, y, z, o.rx, o.ry, o.rz, s);
  }
  cone(r: number, h: number, color: string, x: number, y: number, z: number, o: { seg?: number; rx?: number; ry?: number; rz?: number; s?: [number, number, number] } = {}) {
    this.put(new THREE.ConeGeometry(r, h, o.seg ?? 14), color, x, y, z, o.rx, o.ry, o.rz, o.s);
  }
  torus(R: number, r: number, color: string, x: number, y: number, z: number, o: { rx?: number; ry?: number; rz?: number; arc?: number; s?: [number, number, number] } = {}) {
    this.put(new THREE.TorusGeometry(R, r, 8, 20, o.arc ?? Math.PI * 2), color, x, y, z, o.rx, o.ry, o.rz, o.s);
  }
  /** a separate mesh (own material; e.g. glass, a glowing bulb, a picture, a moving part) */
  mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.group): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    this.geos.push(geo);
    parent.add(m);
    return m;
  }
  sub(x = 0, y = 0, z = 0): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.group.add(g);
    return g;
  }
  track(geo: THREE.BufferGeometry) {
    this.geos.push(geo);
    return geo;
  }
  finish(): { group: THREE.Group; dispose: () => void } {
    for (const [color, list] of this.byColor) {
      // RoundedBoxGeometry is non-indexed, the other primitives are indexed: merge them all flat
      const flat = list.length === 1 ? list : list.map((g) => (g.index ? g.toNonIndexed() : g));
      const merged = list.length === 1 ? list[0] : mergeGeometries(flat, false);
      if (list.length > 1) {
        list.forEach((g) => g.dispose());
        flat.forEach((g) => g.dispose());
      }
      if (!merged) continue;
      this.geos.push(merged);
      const m = new THREE.Mesh(merged, this.kit.toon(color));
      this.group.add(m);
    }
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
    });
    const geos = this.geos;
    return { group: this.group, dispose: () => geos.forEach((g) => g.dispose()) };
  }
}

type Builder = (p: Parts, k: FurnitureKit) => { anim?: (t: number, dt: number) => void; toy?: THREE.Object3D } | void;

function legs(p: Parts, w: number, d: number, h: number, color: string, inset = 0.1, r = 0.05) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.cyl(r, r * 0.8, h, color, sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset), { seg: 8 });
}

function mattress(p: Parts, k: FurnitureKit, y: number, blanket: string) {
  p.box(1.8, 0.24, 2.7, WHITE, 0, y, 0.05, { r: 0.1 });
  p.box(1.86, 0.14, 1.75, blanket, 0, y + 0.12, 0.5, { r: 0.07 });
  p.box(1.86, 0.1, 0.32, lighten(blanket, 0.45), 0, y + 0.18, -0.38, { r: 0.05 });
  p.box(1.15, 0.22, 0.5, CREAM, 0, y + 0.22, -1.0, { r: 0.1 });
  void k;
}

/** a painted picture as a lit material (see textures.ts paintedHomeTexture); `cut` = it has a
 *  transparent surround to cut away */
function painted(k: FurnitureKit, name: string, cut = false): THREE.Material {
  const m = k.picture(`home-art:${name}`, () => paintedHomeTexture(name)) as THREE.MeshToonMaterial;
  if (cut) m.alphaTest = 0.5;
  return m;
}
const flat = (w: number, d: number) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);

const BUILDERS: Record<string, Builder> = {
  // ── beds ──
  bed(p, k) {
    // a patchwork quilt over the blanket
    p.mesh(flat(1.84, 1.72), painted(k, "quilt"), 0, 0.775, 0.5);
    p.mesh(new THREE.PlaneGeometry(1.84, 0.2), painted(k, "quilt"), 0, 0.68, 1.376);
    p.box(1.95, 0.32, 2.9, WOOD, 0, 0.32, 0, { r: 0.08 });
    legs(p, 1.9, 2.8, 0.18, WOOD_D, 0.12, 0.07);
    mattress(p, k, 0.58, k.accent);
    p.box(1.98, 1.25, 0.18, WOOD, 0, 0.8, -1.42, { r: 0.08 });
    p.box(1.4, 0.55, 0.06, lighten(k.accent, 0.35), 0, 1.02, -1.32, { r: 0.03 });
    for (const sx of [-1, 1]) p.ball(0.13, BUTTER, sx * 0.92, 1.5, -1.42);
    p.box(1.98, 0.62, 0.14, WOOD, 0, 0.5, 1.42, { r: 0.06 });
  },
  "bed-bunk"(p, k) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.box(0.16, 2.75, 0.16, WOOD, sx * 0.92, 1.375, sz * 1.37, { r: 0.04 });
    p.box(1.95, 0.24, 2.9, WOOD, 0, 0.36, 0, { r: 0.06 });
    mattress(p, k, 0.58, k.accent);
    p.box(1.95, 0.24, 2.9, WOOD, 0, 1.72, 0, { r: 0.06 });
    mattress(p, k, 1.94, SKY);
    // top guard rails + ladder at the foot
    p.box(0.1, 0.1, 2.7, WOOD_D, -0.92, 2.4, 0, { r: 0.03 });
    p.box(0.1, 0.1, 1.6, WOOD_D, 0.92, 2.4, -0.55, { r: 0.03 });
    for (const x of [0.35, 0.8]) p.box(0.08, 1.9, 0.08, WOOD_D, x, 1.2, 1.5, { r: 0.03 });
    for (let i = 0; i < 4; i++) p.box(0.5, 0.07, 0.07, WOOD_D, 0.575, 0.5 + i * 0.45, 1.5, { r: 0.02 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.ball(0.12, BUTTER, sx * 0.92, 2.8, sz * 1.37);
  },
  "bed-canopy"(p, k) {
    p.box(1.95, 0.32, 2.9, WHITE, 0, 0.32, 0, { r: 0.08 });
    mattress(p, k, 0.58, PINK);
    p.box(1.98, 1.35, 0.16, WHITE, 0, 0.85, -1.42, { r: 0.08 });
    p.ball(0.3, GOLD, 0, 1.55, -1.38, [1, 0.7, 0.35]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      p.cyl(0.07, 0.07, 2.6, WHITE, sx * 0.92, 1.3, sz * 1.38, { seg: 10 });
      p.cone(0.14, 0.3, GOLD, sx * 0.92, 2.95, sz * 1.38, { seg: 10 });
    }
    p.box(2.1, 0.12, 3.05, PINK, 0, 2.62, 0, { r: 0.05 });
    for (let i = 0; i < 7; i++) {
      const z = -1.4 + (i / 6) * 2.8;
      for (const sx of [-1, 1]) p.ball(0.1, lighten(PINK, 0.3), sx * 1.05, 2.52, z, [1, 0.8, 1]);
    }
    // drapes tied back at the head
    for (const sx of [-1, 1]) p.box(0.14, 1.9, 0.5, lighten(LILAC, 0.25), sx * 0.98, 1.6, -1.1, { r: 0.07 });
  },
  nightstand(p, k) {
    p.box(0.8, 0.66, 0.72, WOOD, 0, 0.36, 0, { r: 0.06 });
    legs(p, 0.8, 0.72, 0.08, WOOD_D, 0.1);
    p.box(0.64, 0.22, 0.05, BUTTER, 0, 0.44, 0.37, { r: 0.02 });
    p.ball(0.045, WOOD_D, 0, 0.44, 0.41);
    p.cyl(0.12, 0.15, 0.08, WHITE, 0.12, 0.73, -0.05);
    p.cyl(0.03, 0.03, 0.26, WHITE, 0.12, 0.88, -0.05, { seg: 6 });
    p.cyl(0.1, 0.19, 0.2, lighten(k.accent, 0.3), 0.12, 1.06, -0.05);
    p.mesh(new THREE.SphereGeometry(0.07, 10, 8), k.glow("#fff2b0"), 0.12, 0.97, -0.05);
    p.box(0.22, 0.05, 0.3, SKY, -0.18, 0.71, 0.06, { r: 0.02, ry: 0.3 });
  },

  // ── comfy ──
  "rug-round"(p, k) {
    // a braided rag rug
    p.mesh(flat(1.96, 1.96), painted(k, "rug-round", true), 0, 0.03, 0);
  },
  "rug-rose"(p, k) {
    p.mesh(flat(2.94, 1.96), painted(k, "rug-long", true), 0, 0.032, 0);
  },
  fireplace(p, k) {
    // a stone hearth with its chimney breast running up to the ceiling; the fire flickers
    p.box(2.5, 1.5, 0.5, "#9a8f84", 0, 0.75, -0.2, { r: 0.04 });
    p.box(2.84, 0.16, 0.86, "#8d8278", 0, 0.08, -0.04, { r: 0.03 });
    p.box(1.7, 2.4, 0.42, "#f6ead6", 0, 2.6, -0.24, { r: 0.03 });
    p.mesh(new THREE.PlaneGeometry(2.9, 1.933), painted(k, "fireplace", true), 0, 0.965, 0.07);
    const glow = p.mesh(new THREE.PlaneGeometry(0.9, 0.6), k.glow("#ff9a3c"), 0, 0.52, 0.08);
    const gm = (glow.material = (glow.material as THREE.MeshBasicMaterial).clone());
    gm.transparent = true;
    gm.opacity = 0.1;
    gm.blending = THREE.AdditiveBlending;
    gm.depthWrite = false;
    const fire = new THREE.PointLight(0xff9a4a, 2.6, 5.5, 1.8);
    fire.position.set(0, 0.7, 0.9);
    p.group.add(fire);
    p.group.userData.extraDispose = () => gm.dispose();
    return {
      anim: (t) => {
        const f = 0.78 + 0.14 * Math.sin(t * 9.1) + 0.08 * Math.sin(t * 23.7 + 1.3);
        fire.intensity = 2.6 * f;
        gm.opacity = 0.05 + 0.07 * f;
      },
    };
  },
  "rug-rainbow"(p) {
    const cols = ["#ff8f8f", "#ffb36b", "#ffe07a", "#8fe39a", "#8fc9ff"];
    cols.forEach((c, i) => p.box(2.9 - i * 0.4, 0.03 + i * 0.004, 1.9 - i * 0.34, c, 0, 0.016 + i * 0.002, 0, { r: Math.max(0.012, 0.3 - i * 0.05) }));
  },
  "rug-paw"(p) {
    p.cyl(0.95, 0.95, 0.035, "#ffe2b8", 0, 0.018, 0, { seg: 30 });
    const paw = (x: number, z: number, s: number) => {
      p.cyl(0.14 * s, 0.14 * s, 0.045, "#c98d52", x, 0.024, z, { seg: 12 });
      for (let i = -1; i <= 1; i++) p.cyl(0.055 * s, 0.055 * s, 0.045, "#c98d52", x + i * 0.11 * s, 0.024, z - 0.17 * s, { seg: 8 });
    };
    paw(-0.35, 0.3, 1);
    paw(0.3, -0.25, 1);
    paw(0.35, 0.45, 0.7);
    paw(-0.3, -0.45, 0.7);
  },
  beanbag(p, k) {
    p.ball(0.46, k.accent, 0, 0.3, 0.05, [1, 0.62, 1]);
    p.ball(0.34, k.accent, 0, 0.52, -0.18, [1, 0.8, 0.7]);
    p.ball(0.18, lighten(k.accent, 0.4), 0.18, 0.52, 0.15, [1, 0.4, 1]);
  },
  armchair(p) {
    legs(p, 0.85, 0.8, 0.14, WOOD_D, 0.1);
    p.box(0.9, 0.36, 0.84, LILAC, 0, 0.32, 0, { r: 0.1 });
    p.box(0.9, 0.72, 0.22, LILAC, 0, 0.76, -0.32, { r: 0.1 });
    for (const sx of [-1, 1]) p.box(0.18, 0.34, 0.84, darken(LILAC, 0.12), sx * 0.4, 0.6, 0, { r: 0.08 });
    p.box(0.58, 0.12, 0.6, CREAM, 0, 0.55, 0.06, { r: 0.05 });
    p.box(0.4, 0.34, 0.1, PINK, 0, 0.78, -0.18, { r: 0.05, rx: -0.2 });
  },
  sofa(p) {
    legs(p, 2.85, 0.85, 0.14, WOOD_D, 0.12);
    p.box(2.9, 0.36, 0.9, SKY, 0, 0.32, 0, { r: 0.1 });
    p.box(2.9, 0.72, 0.24, SKY, 0, 0.8, -0.33, { r: 0.1 });
    for (const sx of [-1, 1]) p.box(0.24, 0.4, 0.9, darken(SKY, 0.12), sx * 1.33, 0.62, 0, { r: 0.1 });
    [PINK, BUTTER, MINT].forEach((c, i) => p.box(0.72, 0.14, 0.62, c, (i - 1) * 0.8, 0.56, 0.08, { r: 0.06 }));
    p.box(0.45, 0.38, 0.12, WHITE, -0.8, 0.84, -0.18, { r: 0.06, rx: -0.2 });
  },

  // ── fun ──
  desk(p, k) {
    p.box(1.9, 0.1, 0.84, WOOD, 0, 0.86, 0, { r: 0.04 });
    for (const sx of [-1, 1]) p.box(0.1, 0.82, 0.1, WOOD_D, sx * 0.86, 0.41, 0.34, { r: 0.03 });
    p.box(0.1, 0.82, 0.1, WOOD_D, -0.86, 0.41, -0.34, { r: 0.03 });
    p.box(0.6, 0.8, 0.8, BUTTER, 0.62, 0.41, 0, { r: 0.05 });
    for (let i = 0; i < 3; i++) {
      p.box(0.5, 0.2, 0.04, lighten(BUTTER, 0.4), 0.62, 0.18 + i * 0.25, 0.41, { r: 0.02 });
      p.ball(0.035, WOOD_D, 0.62, 0.18 + i * 0.25, 0.44);
    }
    [k.accent, SKY, MINT].forEach((c, i) => p.box(0.42, 0.07, 0.3, c, -0.55, 0.95 + i * 0.075, -0.18, { r: 0.015, ry: i * 0.15 }));
    p.cyl(0.08, 0.07, 0.18, CORAL, 0.35, 1.0, -0.2, { seg: 10 });
    for (const [x, c] of [
      [-0.03, "#ffd23f"],
      [0.03, SKY],
    ] as const)
      p.cyl(0.015, 0.015, 0.26, c, 0.35 + x, 1.12, -0.2, { seg: 5, rz: x * 3 });
    p.box(0.5, 0.01, 0.36, WHITE, -0.05, 0.915, 0.12, { r: 0, ry: -0.2 });
  },
  chair(p, k) {
    legs(p, 0.6, 0.6, 0.46, WOOD_D, 0.07, 0.04);
    p.box(0.62, 0.1, 0.6, k.accent, 0, 0.5, 0, { r: 0.04 });
    for (const sx of [-1, 1]) p.box(0.07, 0.6, 0.07, WOOD_D, sx * 0.26, 0.82, -0.27, { r: 0.02 });
    p.box(0.6, 0.32, 0.07, WOOD, 0, 0.95, -0.27, { r: 0.03 });
  },
  "toy-chest"(p) {
    p.box(1.8, 0.62, 0.8, CORAL, 0, 0.33, 0, { r: 0.06 });
    p.box(1.84, 0.12, 0.84, BUTTER, 0, 0.42, 0, { r: 0.04 });
    p.box(1.86, 0.14, 0.86, darken(CORAL, 0.12), 0, 0.7, 0, { r: 0.06 });
    p.ball(0.07, GOLD, 0, 0.55, 0.42);
    // teddy peeking out on top + a block
    p.ball(0.2, "#c98d52", -0.35, 0.95, 0, [1, 0.95, 0.9]);
    for (const sx of [-1, 1]) p.ball(0.08, "#c98d52", -0.35 + sx * 0.15, 1.12, 0);
    p.ball(0.08, "#e8c49a", -0.35, 0.9, 0.16);
    p.box(0.22, 0.22, 0.22, SKY, 0.45, 0.88, 0.05, { r: 0.03, ry: 0.4 });
    p.box(0.18, 0.18, 0.18, MINT, 0.2, 0.86, -0.1, { r: 0.03, ry: 0.8 });
  },
  keyboard(p) {
    for (const sx of [-1, 1]) {
      p.box(0.08, 0.95, 0.08, DARK, sx * 0.7, 0.42, 0, { r: 0.02, rz: 0.35 });
      p.box(0.08, 0.95, 0.08, DARK, sx * 0.7, 0.42, 0, { r: 0.02, rz: -0.35 });
    }
    p.box(1.8, 0.12, 0.5, DARK, 0, 0.86, 0, { r: 0.04 });
    p.box(1.66, 0.05, 0.3, WHITE, 0, 0.94, 0.07, { r: 0.01 });
    for (let i = 0; i < 12; i++) if (i % 7 !== 2 && i % 7 !== 6) p.box(0.07, 0.05, 0.17, "#222030", -0.76 + i * 0.14, 0.97, 0.0, { r: 0.01 });
    p.box(0.9, 0.5, 0.04, DARK, 0, 1.25, -0.2, { r: 0.02, rx: -0.2 });
    p.box(0.3, 0.38, 0.01, WHITE, -0.18, 1.26, -0.17, { r: 0, rx: -0.2 });
    p.box(0.3, 0.38, 0.01, WHITE, 0.18, 1.26, -0.17, { r: 0, rx: -0.2 });
  },
  guitar(p, k) {
    p.box(0.5, 0.06, 0.4, DARK, 0, 0.03, 0, { r: 0.02 });
    p.box(0.06, 0.7, 0.06, DARK, 0, 0.35, -0.12, { r: 0.02 });
    const g = new THREE.Group();
    g.position.set(0, 0.1, 0.02);
    g.rotation.x = -0.25;
    p.group.add(g);
    const body = new Parts(k);
    body.ball(0.28, CORAL, 0, 0.32, 0, [1, 1, 0.45]);
    body.ball(0.21, CORAL, 0, 0.7, 0, [1, 1, 0.45]);
    body.cyl(0.08, 0.08, 0.02, "#5a3020", 0, 0.52, 0.12, { rx: Math.PI / 2 });
    body.box(0.08, 0.8, 0.05, WOOD_D, 0, 1.2, 0, { r: 0.02 });
    body.box(0.14, 0.22, 0.06, WOOD_D, 0, 1.68, 0, { r: 0.03 });
    const b = body.finish();
    g.add(b.group);
    p.group.userData.extraDispose = b.dispose;
  },
  drums(p) {
    p.cyl(0.46, 0.46, 0.38, WHITE, 0, 0.5, 0.15, { rx: Math.PI / 2, seg: 20 });
    p.cyl(0.47, 0.47, 0.06, "#ff6b8a", 0, 0.5, 0.15, { rx: Math.PI / 2, seg: 20 });
    p.cyl(0.47, 0.47, 0.04, BUTTER, 0, 0.5, 0.35, { rx: Math.PI / 2, seg: 20 });
    for (const sx of [-1, 1]) {
      p.cyl(0.2, 0.2, 0.22, "#ff6b8a", sx * 0.25, 1.02, 0.05, { seg: 16, rx: 0.3 });
      p.cyl(0.21, 0.21, 0.03, WHITE, sx * 0.25, 1.14, 0.08, { seg: 16, rx: 0.3 });
    }
    p.cyl(0.02, 0.02, 1.1, "#c8c8d8", 0.75, 0.55, -0.5, { seg: 6 });
    p.cyl(0.32, 0.28, 0.03, GOLD, 0.75, 1.12, -0.5, { seg: 18, rz: 0.15 });
    p.cyl(0.26, 0.26, 0.18, WHITE, -0.7, 0.62, -0.45, { seg: 16 });
    p.cyl(0.02, 0.02, 0.55, "#c8c8d8", -0.7, 0.27, -0.45, { seg: 6 });
    p.cyl(0.2, 0.2, 0.1, DARK, 0, 0.45, -0.75, { seg: 14 });
    p.cyl(0.04, 0.04, 0.42, "#c8c8d8", 0, 0.21, -0.75, { seg: 6 });
  },
  tv(p) {
    p.box(1.9, 0.52, 0.7, WOOD, 0, 0.3, 0, { r: 0.05 });
    for (const sx of [-1, 1]) p.box(0.8, 0.36, 0.04, lighten(WOOD, 0.3), sx * 0.46, 0.3, 0.36, { r: 0.02 });
    p.box(0.1, 0.25, 0.1, DARK, 0, 0.68, -0.12, { r: 0.02 });
    p.box(1.65, 1.0, 0.1, DARK, 0, 1.28, -0.12, { r: 0.05 });
    p.box(0.36, 0.08, 0.22, WHITE, -0.55, 0.6, 0.12, { r: 0.03 });
    p.box(0.24, 0.06, 0.14, SKY, 0.5, 0.59, 0.18, { r: 0.03, ry: 0.4 });
  },
  tent(p, k) {
    p.cone(1.2, 1.9, k.accent, 0, 0.95, 0, { seg: 4, ry: Math.PI / 4, s: [1, 1, 1] });
    p.cone(1.22, 0.5, lighten(k.accent, 0.5), 0, 0.25, 0, { seg: 4, ry: Math.PI / 4 });
    p.cyl(0.025, 0.025, 0.5, WOOD_D, 0, 2.05, 0, { seg: 6 });
    p.box(0.3, 0.2, 0.02, BUTTER, 0.16, 2.2, 0, { r: 0 });
    // the door flap
    p.cone(0.42, 1.0, darken(k.accent, 0.35), 0, 0.5, 0.52, { seg: 3, s: [1, 1, 0.12], ry: 0 });
  },
  telescope(p) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      p.cyl(0.025, 0.03, 1.0, WOOD_D, Math.sin(a) * 0.2, 0.47, Math.cos(a) * 0.2, { seg: 6, rx: Math.cos(a) * 0.35, rz: -Math.sin(a) * 0.35 });
    }
    p.ball(0.07, DARK, 0, 0.95, 0);
    p.cyl(0.09, 0.12, 0.95, SKY, 0, 1.18, -0.12, { rx: -0.9, seg: 14 });
    p.cyl(0.13, 0.13, 0.06, GOLD, 0, 1.47, -0.49, { rx: -0.9, seg: 14 });
    p.cyl(0.1, 0.1, 0.05, GOLD, 0, 0.93, 0.19, { rx: -0.9, seg: 12 });
  },

  // ── decor ──
  lamp(p, k) {
    p.cyl(0.26, 0.3, 0.08, WOOD_D, 0, 0.04, 0, { seg: 16 });
    p.cyl(0.035, 0.035, 1.5, WHITE, 0, 0.8, 0, { seg: 8 });
    p.cyl(0.2, 0.36, 0.42, lighten(k.accent, 0.35), 0, 1.72, 0, { seg: 16 });
    p.mesh(new THREE.SphereGeometry(0.11, 10, 8), k.glow("#fff2b0"), 0, 1.56, 0);
    p.mesh(new THREE.CircleGeometry(0.34, 18), k.glow("#fff6d0"), 0, 1.505, 0).rotation.x = Math.PI / 2;
  },
  plant(p) {
    p.cyl(0.25, 0.19, 0.4, CORAL, 0, 0.2, 0, { seg: 12 });
    p.cyl(0.28, 0.28, 0.07, darken(CORAL, 0.12), 0, 0.4, 0, { seg: 12 });
    p.cyl(0.23, 0.23, 0.02, "#8a5a3a", 0, 0.43, 0, { seg: 12 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      p.ball(0.17, i % 2 ? GREEN : GREEN_D, Math.sin(a) * 0.14, 0.62 + (i % 3) * 0.08, Math.cos(a) * 0.14, [0.7, 1.2, 0.7], { rx: Math.cos(a) * 0.5, rz: -Math.sin(a) * 0.5 });
    }
    p.ball(0.08, PINK, 0.05, 0.9, 0.08);
    p.ball(0.04, BUTTER, 0.05, 0.93, 0.14);
  },
  "plant-big"(p) {
    p.cyl(0.3, 0.24, 0.5, "#8fb7ff", 0, 0.25, 0, { seg: 14 });
    p.cyl(0.33, 0.33, 0.07, darken("#8fb7ff", 0.12), 0, 0.5, 0, { seg: 14 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const h = 1.0 + (i % 3) * 0.3;
      p.cyl(0.02, 0.025, h, GREEN_D, Math.sin(a) * 0.12, 0.5 + h / 2, Math.cos(a) * 0.12, { seg: 5, rx: Math.cos(a) * 0.25, rz: -Math.sin(a) * 0.25 });
      p.ball(0.26, i % 2 ? GREEN : GREEN_D, Math.sin(a) * (0.12 + h * 0.25), 0.5 + h, Math.cos(a) * (0.12 + h * 0.25), [1, 0.25, 0.7], { rx: Math.cos(a) * 0.5, ry: a, rz: -Math.sin(a) * 0.5 });
    }
  },
  bookshelf(p, k) {
    // a painted dresser of books and toys, on a solid mint carcass
    p.box(1.5, 2.2, 0.62, "#a9d3b0", 0, 1.1, -0.08, { r: 0.04 });
    p.mesh(new THREE.PlaneGeometry(1.84, 2.76), painted(k, "bookshelf", true), 0, 1.38, 0.245);
  },
  aquarium(p, k) {
    p.box(1.85, 0.72, 0.72, WOOD, 0, 0.36, 0, { r: 0.05 });
    p.box(1.75, 0.06, 0.62, DARK, 0, 0.75, 0, { r: 0.02 });
    // just a rim on top (a solid lid hides the fish from the camera up above)
    for (const sz of [-1, 1]) p.box(1.75, 0.07, 0.06, DARK, 0, 1.72, sz * 0.29, { r: 0.02 });
    for (const sx of [-1, 1]) p.box(0.06, 0.07, 0.62, DARK, sx * 0.845, 1.72, 0, { r: 0.02 });
    p.box(1.66, 0.12, 0.52, "#ffe0a8", 0, 0.84, 0, { r: 0.03 });
    for (const [x, h] of [
      [-0.6, 0.5],
      [-0.45, 0.35],
      [0.55, 0.45],
    ] as const)
      p.ball(0.08, GREEN, x, 0.9 + h / 2, -0.12, [0.6, h / 0.16, 0.6]);
    p.ball(0.12, CORAL, 0.2, 0.92, 0.05, [1.2, 0.6, 1]);
    const water = p.mesh(new THREE.BoxGeometry(1.64, 0.8, 0.52), k.glass(), 0, 1.3, 0);
    water.renderOrder = 2;
    const fish: THREE.Object3D[] = [];
    const fishCols = ["#ff9a3d", "#ffd23f", "#ff6b8a"];
    for (let i = 0; i < 3; i++) {
      const f = p.sub(0, 1.2 + i * 0.14, 0);
      const fp = new Parts(k);
      fp.ball(0.08, fishCols[i], 0, 0, 0, [1.4, 1, 0.6]);
      fp.cone(0.06, 0.1, fishCols[i], -0.13, 0, 0, { seg: 4, rz: Math.PI / 2 });
      const built = fp.finish();
      f.add(built.group);
      fish.push(f);
      f.userData.dispose = built.dispose;
    }
    p.group.userData.extraDispose = () => fish.forEach((f) => f.userData.dispose());
    return {
      anim: (t) => {
        fish.forEach((f, i) => {
          const a = t * (0.5 + i * 0.17) + i * 2;
          f.position.x = Math.sin(a) * 0.62;
          f.position.z = Math.cos(a * 1.3) * 0.12;
          f.rotation.y = Math.cos(a) > 0 ? 0 : Math.PI;
        });
      },
    };
  },

  // ── pet ──
  "pet-bed"(p, k) {
    p.cyl(0.82, 0.86, 0.14, "#c98d52", 0, 0.07, 0, { seg: 26 });
    p.torus(0.66, 0.2, lighten(k.accent, 0.2), 0, 0.26, 0, { rx: Math.PI / 2, s: [1, 1, 1] });
    p.cyl(0.62, 0.62, 0.14, CREAM, 0, 0.19, 0, { seg: 26 });
    p.box(0.3, 0.08, 0.1, WHITE, 0.6, 0.12, 0.75, { r: 0.04, ry: 0.5 });
    for (const sx of [-1, 1]) p.ball(0.06, WHITE, 0.6 + sx * 0.14 * Math.cos(0.5), 0.12, 0.75 - sx * 0.14 * Math.sin(0.5));
  },
  "pet-castle"(p, k) {
    p.cyl(0.85, 0.88, 0.16, LILAC, 0, 0.08, 0, { seg: 26 });
    p.cyl(0.7, 0.7, 0.18, lighten(PINK, 0.3), 0, 0.24, 0, { seg: 26 });
    p.box(1.8, 1.1, 0.25, lighten(LILAC, 0.2), 0, 0.55, -0.82, { r: 0.08 });
    for (const sx of [-1, 1]) {
      p.cyl(0.2, 0.22, 1.5, LILAC, sx * 0.82, 0.75, -0.8, { seg: 12 });
      p.cone(0.28, 0.5, PINK, sx * 0.82, 1.75, -0.8, { seg: 12 });
      p.ball(0.06, GOLD, sx * 0.82, 2.04, -0.8);
    }
    for (let i = -2; i <= 2; i++) p.box(0.22, 0.2, 0.25, lighten(LILAC, 0.2), i * 0.3, 1.2, -0.82, { r: 0.03 });
    p.ball(0.18, GOLD, 0, 0.8, -0.68, [1, 1, 0.3]);
    void k;
  },
  bowl(p, k) {
    p.cyl(0.3, 0.24, 0.16, k.accent, 0, 0.08, 0, { seg: 18 });
    p.cyl(0.24, 0.24, 0.02, "#7a4a2a", 0, 0.15, 0, { seg: 18 });
    for (let i = 0; i < 7; i++) p.ball(0.05, i % 2 ? "#c98d52" : "#a86b3c", Math.sin(i * 2.4) * 0.13, 0.17, Math.cos(i * 2.4) * 0.13);
  },
  "bowl-fancy"(p) {
    p.box(0.9, 0.16, 0.6, WOOD, 0, 0.16, 0, { r: 0.05 });
    for (const sx of [-1, 1]) p.box(0.1, 0.12, 0.5, WOOD_D, sx * 0.35, 0.05, 0, { r: 0.03 });
    p.cyl(0.18, 0.15, 0.12, PINK, -0.2, 0.3, 0, { seg: 16 });
    p.cyl(0.15, 0.15, 0.02, "#a86b3c", -0.2, 0.36, 0, { seg: 16 });
    p.cyl(0.18, 0.15, 0.12, SKY, 0.2, 0.3, 0, { seg: 16 });
    p.cyl(0.15, 0.15, 0.02, "#7fd6ff", 0.2, 0.36, 0, { seg: 16 });
    p.box(0.26, 0.06, 0.06, WHITE, 0, 0.27, 0.3, { r: 0.03 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.ball(0.04, WHITE, sx * 0.14, 0.27, 0.3 + sz * 0.04);
  },
  "pet-ball"(p, k) {
    const ball = p.sub(0, 0, 0);
    const bp = new Parts(k);
    bp.ball(0.2, "#e6ff5c", 0, 0.2, 0, [1, 1, 1], { seg: 14 });
    bp.torus(0.2, 0.018, WHITE, 0, 0.2, 0, { rx: 0.4 });
    const built = bp.finish();
    ball.add(built.group);
    p.group.userData.extraDispose = built.dispose;
    return { toy: ball };
  },
  ducky(p, k) {
    const duck = p.sub(0, 0, 0);
    const dp = new Parts(k);
    dp.ball(0.2, "#ffe23f", 0, 0.16, 0, [1.2, 0.85, 1]);
    dp.ball(0.13, "#ffe23f", 0, 0.36, 0.1);
    dp.cone(0.05, 0.12, "#ff9a3d", 0, 0.35, 0.25, { rx: Math.PI / 2, seg: 8 });
    for (const sx of [-1, 1]) dp.ball(0.025, "#2a1830", sx * 0.06, 0.4, 0.2);
    const built = dp.finish();
    duck.add(built.group);
    p.group.userData.extraDispose = built.dispose;
    return { toy: duck };
  },
  "scratch-post"(p) {
    p.box(0.85, 0.12, 0.85, LILAC, 0, 0.06, 0, { r: 0.05 });
    p.cyl(0.13, 0.13, 1.25, "#e8cf9f", 0, 0.72, 0, { seg: 12 });
    for (let i = 0; i < 6; i++) p.torus(0.13, 0.02, "#d4b47a", 0, 0.25 + i * 0.18, 0, { rx: Math.PI / 2 });
    p.cyl(0.38, 0.38, 0.1, LILAC, 0, 1.38, 0, { seg: 18 });
    p.cyl(0.32, 0.32, 0.06, lighten(LILAC, 0.4), 0, 1.45, 0, { seg: 18 });
    p.cyl(0.008, 0.008, 0.4, WHITE, 0.3, 1.18, 0, { seg: 4 });
    p.ball(0.07, PINK, 0.3, 0.97, 0);
  },
  "pet-tunnel"(p, k) {
    // its own double-sided material (the shared toon ones are single-sided)
    const inside = (k.toon(lighten(k.accent, 0.1)) as THREE.MeshToonMaterial).clone();
    inside.side = THREE.DoubleSide;
    const tube = p.mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.8, 18, 1, true), inside, 0, 0.42, 0);
    tube.rotation.z = Math.PI / 2;
    p.group.userData.extraDispose = () => inside.dispose();
    for (let i = 0; i < 5; i++) p.torus(0.43, 0.04, i % 2 ? BUTTER : WHITE, -0.85 + i * 0.425, 0.42, 0, { ry: Math.PI / 2 });
  },

  // ── wall items ──
  "poster-star"(p, k) {
    poster(p, k, "⭐", "#ffe27a", "#ff9cc4", "SHINE!", 1);
  },
  "poster-rocket"(p, k) {
    poster(p, k, "🚀", "#3b3a86", "#8f7aff", "BLAST OFF", 1);
  },
  "poster-dino"(p, k) {
    poster(p, k, "🦕", "#bff2c8", "#6cc873", "RAWR!", 1);
  },
  "poster-rainbow"(p, k) {
    poster(p, k, "🌈", "#bfe6ff", "#fff1d6", undefined, 2);
  },
  "wall-shelf"(p, k) {
    p.box(1.8, 0.1, 0.36, WOOD, 0, 0, 0.18, { r: 0.03 });
    for (const sx of [-1, 1]) p.box(0.08, 0.3, 0.28, WOOD_D, sx * 0.7, -0.18, 0.14, { r: 0.02 });
    [k.accent, SKY, BUTTER, MINT].forEach((c, i) => p.box(0.11, 0.36 + (i % 2) * 0.06, 0.26, c, -0.7 + i * 0.13, 0.23 + (i % 2) * 0.03, 0.18, { r: 0.015 }));
    p.cyl(0.1, 0.08, 0.16, CORAL, 0.25, 0.13, 0.18, { seg: 10 });
    p.ball(0.12, GREEN, 0.25, 0.3, 0.18, [1, 0.8, 1]);
    p.ball(0.11, LILAC, 0.62, 0.16, 0.18, [1, 1.1, 1]);
    p.cyl(0.04, 0.04, 0.06, GOLD, 0.62, 0.3, 0.18, { seg: 8 });
  },
  "trophy-shelf"(p, k) {
    p.box(1.8, 0.1, 0.4, WOOD_D, 0, -0.32, 0.2, { r: 0.03 });
    p.box(1.8, 0.8, 0.05, lighten(WOOD, 0.35), 0, 0.08, 0.03, { r: 0.03 });
    for (const sx of [-1, 1]) {
      p.cyl(0.1, 0.06, 0.08, GOLD, sx * 0.72, -0.23, 0.2, { seg: 10 });
      p.cyl(0.03, 0.03, 0.12, GOLD, sx * 0.72, -0.13, 0.2, { seg: 6 });
      p.cyl(0.16, 0.08, 0.24, GOLD, sx * 0.72, 0.05, 0.2, { seg: 14 });
      for (const hx of [-1, 1]) p.torus(0.07, 0.018, GOLD, sx * 0.72 + hx * 0.16, 0.06, 0.2, { ry: 0, s: [1, 1.2, 1] });
    }
    const list = (k.badges.length ? k.badges : ["⭐"]).slice(0, 3);
    list.forEach((b, i) => {
      const x = list.length === 1 ? 0 : -0.36 + (i / (list.length - 1)) * 0.72;
      const m = p.mesh(new THREE.CircleGeometry(0.2, 20), k.picture(`badge:${b}`, () => badgeTexture(b)), x, 0.1, 0.07);
      m.castShadow = false;
    });
  },
  clock(p, k) {
    p.box(0.7, 0.72, 0.22, WOOD, 0, -0.06, 0.11, { r: 0.06 });
    p.box(0.56, 0.1, 0.3, WOOD_D, -0.19, 0.42, 0.13, { r: 0.03, rz: 0.6 });
    p.box(0.56, 0.1, 0.3, WOOD_D, 0.19, 0.42, 0.13, { r: 0.03, rz: -0.6 });
    p.ball(0.07, BUTTER, 0, 0.55, 0.13);
    p.mesh(new THREE.CircleGeometry(0.24, 24), k.picture("clock-face", clockFaceTexture), 0, 0, 0.225);
    const hands = p.sub(0, 0, 0.235);
    const hourHand = p.mesh(new THREE.BoxGeometry(0.03, 0.13, 0.01), k.toon(DARK), 0, 0.055, 0, p.sub(0, 0, 0));
    const minHand = p.mesh(new THREE.BoxGeometry(0.02, 0.19, 0.01), k.toon(DARK), 0, 0.085, 0, p.sub(0, 0, 0));
    hands.add(hourHand.parent!, minHand.parent!);
    const pend = p.sub(0, -0.42, 0.14);
    p.mesh(new THREE.BoxGeometry(0.03, 0.3, 0.02), k.toon(GOLD), 0, -0.15, 0, pend);
    p.mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 14), k.toon(GOLD), 0, -0.32, 0, pend).rotation.x = Math.PI / 2;
    return {
      anim: (t) => {
        const now = new Date();
        const h = (now.getHours() % 12) + now.getMinutes() / 60;
        hourHand.parent!.rotation.z = -(h / 12) * Math.PI * 2;
        minHand.parent!.rotation.z = -(now.getMinutes() / 60) * Math.PI * 2;
        pend.rotation.z = Math.sin(t * 3.2) * 0.35;
      },
    };
  },
  mirror(p, k) {
    p.torus(0.34, 0.06, BUTTER, 0, 0, 0.06, { s: [0.85, 1.25, 1] });
    const glass = p.mesh(new THREE.CircleGeometry(0.34, 24), k.toon("#cdeeff"), 0, 0, 0.05);
    glass.scale.set(0.85, 1.25, 1);
    p.mesh(new THREE.PlaneGeometry(0.06, 0.28), k.glow("#ffffff"), -0.12, 0.12, 0.06).rotation.z = -0.5;
    p.ball(0.07, PINK, 0, 0.5, 0.08);
  },
  bunting(p) {
    const cols = ["#ff8f8f", BUTTER, MINT, SKY, LILAC, PINK];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const x = -1.35 + u * 2.7;
      const sag = -Math.sin(u * Math.PI) * 0.25;
      p.cone(0.14, 0.34, cols[i % cols.length], x, sag - 0.17, 0.05, { seg: 3, rx: Math.PI, s: [1, 1, 0.25] });
    }
    for (let i = 0; i < 12; i++) {
      const u0 = i / 12;
      const u1 = (i + 1) / 12;
      const x0 = -1.4 + u0 * 2.8;
      const x1 = -1.4 + u1 * 2.8;
      const y0 = -Math.sin(u0 * Math.PI) * 0.25;
      const y1 = -Math.sin(u1 * Math.PI) * 0.25;
      p.cyl(0.012, 0.012, Math.hypot(x1 - x0, y1 - y0), WHITE, (x0 + x1) / 2, (y0 + y1) / 2 + 0.02, 0.05, { seg: 4, rz: Math.PI / 2 + Math.atan2(y1 - y0, x1 - x0) });
    }
  },
  "fairy-lights"(p, k) {
    const cols = ["#ffe27a", "#ff9cc4", "#8fe3ff", "#b6ff9c"];
    const mats = cols.map((c) => k.glow(c));
    const n = 14;
    const bulbs: THREE.Mesh[] = [];
    const geo = p.track(new THREE.SphereGeometry(0.055, 8, 6));
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const x = -1.35 + u * 2.7;
      const y = -Math.abs(Math.sin(u * Math.PI * 2)) * 0.2;
      const m = new THREE.Mesh(geo, mats[i % 4]);
      m.position.set(x, y - 0.05, 0.06);
      p.group.add(m);
      bulbs.push(m);
    }
    for (let i = 0; i < 24; i++) {
      const u0 = i / 24;
      const u1 = (i + 1) / 24;
      const x0 = -1.4 + u0 * 2.8;
      const x1 = -1.4 + u1 * 2.8;
      const y0 = -Math.abs(Math.sin(u0 * Math.PI * 2)) * 0.2;
      const y1 = -Math.abs(Math.sin(u1 * Math.PI * 2)) * 0.2;
      p.cyl(0.01, 0.01, Math.hypot(x1 - x0, y1 - y0), "#5a8a4a", (x0 + x1) / 2, (y0 + y1) / 2, 0.05, { seg: 4, rz: Math.PI / 2 + Math.atan2(y1 - y0, x1 - x0) });
    }
    return {
      anim: (t) => {
        bulbs.forEach((b, i) => b.scale.setScalar(0.8 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.6 + i * 1.7))));
      },
    };
  },
};

function poster(p: Parts, k: FurnitureKit, emoji: string, from: string, to: string, word: string | undefined, cells: number) {
  const w = cells === 2 ? 1.7 : 0.78;
  p.box(w, 1.0, 0.07, WHITE, 0, 0, 0.035, { r: 0.03 });
  p.mesh(new THREE.PlaneGeometry(w - 0.12, 0.88), k.picture(`poster:${emoji}`, () => posterTexture(emoji, from, to, word, cells === 2)), 0, 0, 0.075).castShadow = false;
  p.ball(0.04, "#ff6b8a", 0, 0.46, 0.08);
}

function giftBox(p: Parts, k: FurnitureKit) {
  p.box(0.7, 0.6, 0.7, k.accent, 0, 0.3, 0, { r: 0.05 });
  p.box(0.74, 0.12, 0.74, BUTTER, 0, 0.62, 0, { r: 0.04 });
  p.box(0.12, 0.62, 0.74, BUTTER, 0, 0.3, 0, { r: 0.02 });
}

/** Build one catalogue item's model (a gift box if it has no builder yet). */
export function buildItemModel(itemId: string, kit: FurnitureKit): BuiltItem {
  const p = new Parts(kit);
  const builder = BUILDERS[itemId];
  const extra = builder ? builder(p, kit) : giftBox(p, kit);
  const fin = p.finish();
  const extraDispose = fin.group.userData.extraDispose as (() => void) | undefined;
  return {
    group: fin.group,
    anim: extra ? extra.anim : undefined,
    toy: extra ? extra.toy : undefined,
    dispose() {
      fin.dispose();
      extraDispose?.();
    },
  };
}

export function hasModel(itemId: string): boolean {
  return itemId in BUILDERS;
}
