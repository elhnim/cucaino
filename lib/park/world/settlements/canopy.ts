// Treetop's giant-tree crowns: tall emergent rainforest giants whose leafy crowns sit in layered
// tiers well ABOVE the treehouse platforms (registry/settlements.ts — a giant-tree prop's `elev`
// is the platform's height up the trunk), never one low blob round the kid. All four trees' crowns
// are one merged mesh (one draw call) with the jungle's see-through cut (../jungle/cutaway.ts):
// any leaf between the camera and the kid, or round the camera itself, is dropped — so a kid up on
// a platform always shows, whichever tree they're at. The trunks stay in the village's own props
// mesh (./props.ts); the limbs that carry the crown are drawn here, so they're cut away with it.
import * as THREE from "three";
import { fxMaterial, makeUniforms, type FantasyUniforms } from "../fantasy/shaders";
import { addJungleCut, makeJungleCut } from "../jungle/cutaway";
import { col, lump, mergeAll, pp, stick, type Fx } from "../village/kit";
import { groundY } from "../../registry/terrain";

export interface CanopyTree {
  x: number;
  z: number;
  yaw: number;
  scale: number;
  /** the treehouse platform's height up the trunk (above the ground at the trunk's foot) */
  elev: number;
}

export interface Canopy {
  /** the kid's world position, every frame (the camera's is picked up as the mesh renders) */
  update(kid: THREE.Vector3): void;
  dispose(): void;
  /** how many draw calls it adds (one) */
  calls: number;
}

/** how far above the platform the lowest leaves start (clear headroom over the kid and the cabin roof) */
export const CROWN_CLEAR = 7;

const LEAF = ["#2f7a3e", "#3f8f3a", "#2a6e48", "#4f9e32", "#367f2c", "#1f6a44"].map(col);
const BARK = col("#6b4a32");
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** the crown's lowest leaves, relative to the ground at the trunk's foot */
export function crownBase(t: Pick<CanopyTree, "elev" | "scale">): number {
  return t.elev + CROWN_CLEAR * Math.max(0.85, t.scale);
}

/** one giant's crown: three tiers (a broad, flat lower tier, a narrower middle, a small top),
 *  each a ring of leafy lumps round a centre one, with bare limbs reaching up from the trunk */
export function buildCrownGeometry(t: CanopyTree, gy: number, low = false): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const s = t.scale;
  const y0 = gy + crownBase(t);
  const tiers = [
    { dy: 0, r: 6.2, n: low ? 5 : 7, lr: 2.3, sy: 0.42 },
    { dy: 3.4, r: 4.3, n: low ? 4 : 6, lr: 2.0, sy: 0.48 },
    { dy: 6.2, r: 2.2, n: low ? 3 : 4, lr: 1.7, sy: 0.55 },
  ];
  let seed = t.x * 0.13 + t.z * 0.07;
  tiers.forEach((tier, ti) => {
    const y = y0 + tier.dy * s;
    // (a little sway, more the higher up; tinted per leaf colour, no glow)
    const fx: Fx = [0, 0.25 + ti * 0.18, 0];
    parts.push(pp(lump(tier.lr * 1.15 * s, t.x, y + 0.3 * s, t.z, seed++, 1.3, tier.sy * 1.2, 1.3, 0.3), LEAF[ti % LEAF.length], fx));
    for (let i = 0; i < tier.n; i++) {
      const a = t.yaw + (i / tier.n) * Math.PI * 2 + ti * 0.5;
      const rr = tier.r * s * (0.85 + 0.15 * Math.sin(seed * 3.1 + i));
      const lx = t.x + Math.sin(a) * rr;
      const lz = t.z + Math.cos(a) * rr;
      const ly = y + Math.sin(i * 2.3 + seed) * 0.35 * s;
      parts.push(pp(lump(tier.lr * s, lx, ly, lz, seed++, 1.2, tier.sy, 1.2, 0.3), LEAF[(i + ti * 2) % LEAF.length], fx));
      // a limb up to each lower-tier lump (the bare branches you see from underneath)
      if (ti === 0 && i % (low ? 2 : 1) === 0) {
        _a.set(t.x + Math.sin(a) * 0.6 * s, y - 2.6 * s, t.z + Math.cos(a) * 0.6 * s);
        _b.set(t.x + Math.sin(a) * rr * 0.8, ly - 0.2 * s, t.z + Math.cos(a) * rr * 0.8);
        parts.push(pp(stick(_a, _b, 0.32 * s), BARK, [0, 0.05, 0]));
      }
    }
  });
  // the trunk's last stretch up through the crown (props.ts's trunk stops below the lower tier)
  _a.set(t.x, y0 - 3 * s, t.z);
  _b.set(t.x, y0 + 5.5 * s, t.z);
  parts.push(pp(stick(_a, _b, 0.9 * s), BARK, [0, 0, 0]));
  return mergeAll(parts);
}

/** builds every giant's crown into one mesh in `group`; pass the village's own fantasy uniforms so
 *  the leaves sway with everything else (else it makes its own, which never move) */
export function buildCanopy(group: THREE.Group, trees: CanopyTree[], low: boolean, U: FantasyUniforms = makeUniforms()): Canopy {
  const cut = makeJungleCut();
  const geo = mergeAll(trees.map((t) => buildCrownGeometry(t, groundY(t.x, t.z), low)));
  const mat = addJungleCut(fxMaterial(U, { roughness: 0.9, metalness: 0, flatShading: true }), cut);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "treetop-canopy";
  mesh.castShadow = false;
  mesh.receiveShadow = !low;
  mesh.onBeforeRender = (_r, _s, cam) => void cut.uJCam.value.setFromMatrixPosition(cam.matrixWorld);
  group.add(mesh);
  return {
    calls: 1,
    update(kid) {
      cut.uJKid.value.copy(kid);
    },
    dispose() {
      group.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };
}
