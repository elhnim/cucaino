// More chunky low-poly animals for Cucaino Park, in the same faceted toon look and vertex rig as
// ./geometry.ts: the Aussie bush (kangaroos with a joey in the pouch, emus, koalas, wombats) and a
// little safari (giraffes and elephants). Every model faces +z and stands on y = 0 at its
// natural size; the true-size table (types.ts SIZES) scales them to real life.
import * as THREE from "three";
import { col, merge } from "../fantasy/geo";
import { noise3 } from "../fantasy/noise";
import {
  BLACK,
  EAR_L,
  EAR_R,
  HEAD,
  JAW,
  LEG_BL,
  LEG_BR,
  LEG_FL,
  LEG_FR,
  TAIL,
  WHITE,
  box,
  buildBear,
  buildCow,
  buildCritters,
  buildDeer,
  buildDuck,
  buildFox,
  buildGoat,
  buildHorse,
  buildOwl,
  buildRabbit,
  buildSpiky,
  buildSquirrel,
  cone,
  ell,
  eyes,
  only,
  rbox,
  rp,
  sh,
  tube,
  type Paint,
  type V3,
} from "./geometry";

const _c = new THREE.Color();

// ── kangaroos (variant 0, 1 = a mother with a joey peeking out of her pouch) and emus (2) ──

export function buildRoo(): THREE.BufferGeometry {
  return merge([...kangarooParts(), ...emuParts()]);
}

function kangarooParts(): THREE.BufferGeometry[] {
  const K = only(0, 1);
  const fur = sh("#ffffff", 0.3);
  const pale = sh("#f1e2cc", 0.2);
  const N: V3 = [0, 1.12, 0.22];
  const H = { p: HEAD, piv: N, vm: K };
  const out: THREE.BufferGeometry[] = [
    // a pear-shaped body leaning forward: big haunches, a slimmer chest
    rp(ell(0, 0.56, -0.08, 0.25, 0.3, 0.33, 1), fur, { tint: 1, vm: K }),
    rp(ell(0, 0.92, 0.12, 0.17, 0.26, 0.17, 0, [0.35, 0, 0]), fur, { tint: 1, vm: K }),
    rp(ell(0, 0.78, 0.2, 0.13, 0.2, 0.08, 0, [0.3, 0, 0]), pale, { vm: K }),
    // the joey in the pouch (variant 1): a little head and ears
    rp(ell(0, 0.8, 0.31, 0.07, 0.07, 0.08), fur, { tint: 1, vm: only(1) }),
    ...[-1, 1].map((s) => rp(ell(s * 0.045, 0.88, 0.3, 0.02, 0.045, 0.015, 0, [0, 0, s * 0.3]), fur, { tint: 1, vm: only(1) })),
    ...eyes(0.035, 0.82, 0.37, 0.011, { vm: only(1) }, false),
    rp(ell(0, 0.79, 0.385, 0.014, 0.012, 0.01), BLACK, { vm: only(1) }),
    // neck and head: a long muzzle, big upright ears
    rp(tube([0, 1.06, 0.18], [0, 1.3, 0.26], 0.09, 0.07, 5), fur, { ...H, tint: 1 }),
    rp(ell(0, 1.38, 0.3, 0.095, 0.1, 0.13), fur, { ...H, tint: 1 }),
    rp(ell(0, 1.34, 0.42, 0.06, 0.06, 0.075), pale, { ...H, tint: 0.4 }),
    rp(ell(0, 1.35, 0.49, 0.025, 0.02, 0.015), BLACK, H),
    ...eyes(0.07, 1.42, 0.37, 0.022, H),
    // little arms (they hang in front of the chest)
    ...[-1, 1].map((s) => rp(tube([s * 0.1, 0.98, 0.22], [s * 0.09, 0.72, 0.32], 0.04, 0.03, 4), fur, { p: s < 0 ? LEG_FL : LEG_FR, piv: [s * 0.1, 0.98, 0.22], tint: 1, vm: K })),
    // the big tail, a third leg to lean on
    rp(tube([0, 0.5, -0.32], [0, 0.18, -0.75], 0.11, 0.07, 5), fur, { p: TAIL, piv: [0, 0.5, -0.32], tint: 1, vm: K }),
    rp(tube([0, 0.18, -0.75], [0, 0.04, -1.1], 0.07, 0.03, 5), fur, { p: TAIL, piv: [0, 0.5, -0.32], tint: 1, vm: K }),
  ];
  for (const s of [-1, 1]) {
    const E = { p: s < 0 ? EAR_L : EAR_R, piv: [s * 0.05, 1.46, 0.27] as V3, piv2: N, tint: 1, vm: K };
    out.push(rp(ell(s * 0.08, 1.58, 0.25, 0.045, 0.13, 0.03, 0, [0, 0, s * -0.25]), fur, E));
    out.push(rp(ell(s * 0.08, 1.58, 0.265, 0.028, 0.1, 0.012, 0, [0, 0, s * -0.25]), col("#e8b8a0"), { ...E, tint: 0 }));
    // hind legs: a big thigh and the long foot flat on the ground
    const B = { p: s < 0 ? LEG_BL : LEG_BR, piv: [s * 0.15, 0.5, -0.05] as V3, tint: 1, vm: K, tuck: true };
    out.push(rp(ell(s * 0.17, 0.4, -0.02, 0.1, 0.24, 0.2, 0, [0.4, 0, 0]), fur, B));
    out.push(rp(tube([s * 0.17, 0.24, -0.14], [s * 0.17, 0.05, -0.12], 0.06, 0.045, 4), fur, B));
    out.push(rp(box(s * 0.17, 0.03, 0.04, 0.08, 0.05, 0.36), sh("#5a4434"), { ...B, tint: 0 }));
  }
  return out;
}

function emuParts(): THREE.BufferGeometry[] {
  const E = only(2);
  // shaggy dark-brown feathers (faceted, a little mottled)
  const shag: Paint = (p, n) => _c.set(noise3(p.x * 9, p.y * 9, p.z * 9, 5) > 0.55 ? "#ffffff" : "#d8d2cc").multiplyScalar(0.78 + 0.22 * (n.y * 0.5 + 0.5));
  const skin = sh("#7c8aa8", 0.2);
  const leg = sh("#7a6a5a", 0.25);
  const N: V3 = [0, 1.06, 0.26];
  const H = { p: HEAD, piv: N, vm: E };
  const out: THREE.BufferGeometry[] = [
    rp(ell(0, 1.0, -0.04, 0.3, 0.29, 0.42, 1), shag, { tint: 1, vm: E }),
    rp(ell(0, 0.86, -0.38, 0.22, 0.22, 0.16), shag, { tint: 1, vm: E }),
    // the long neck (feathered at the base, blue skin near the head) and the little head
    rp(tube([0, 1.04, 0.24], [0, 1.4, 0.36], 0.11, 0.06, 5), shag, { ...H, tint: 1 }),
    rp(tube([0, 1.4, 0.36], [0, 1.6, 0.4], 0.06, 0.05, 5), skin, H),
    rp(ell(0, 1.64, 0.44, 0.07, 0.065, 0.09), skin, H),
    rp(ell(0, 1.69, 0.42, 0.06, 0.03, 0.07), shag, { ...H, tint: 1 }),
    rp(cone([0, 1.625, 0.5], [0, 1.61, 0.6], 0.03, 4), sh("#2e2a28"), H),
    ...eyes(0.05, 1.66, 0.49, 0.016, H),
  ];
  for (const s of [-1, 1]) {
    // long legs with a backward knee, three-toed feet
    const B = { p: s < 0 ? LEG_BL : LEG_BR, piv: [s * 0.12, 0.88, -0.02] as V3, vm: E, tuck: true };
    out.push(rp(ell(s * 0.13, 0.78, -0.02, 0.1, 0.16, 0.12), shag, { ...B, tint: 1 }));
    out.push(rp(tube([s * 0.13, 0.66, -0.02], [s * 0.13, 0.36, -0.1], 0.05, 0.04, 4), leg, B));
    out.push(rp(tube([s * 0.13, 0.36, -0.1], [s * 0.13, 0.04, 0.0], 0.035, 0.03, 4), leg, B));
    out.push(rp(box(s * 0.13, 0.02, 0.07, 0.1, 0.035, 0.16), leg, B));
  }
  return out;
}

// ── the bush: koalas (variant 1) and wombats (2) ──

export function buildBush(): THREE.BufferGeometry {
  return merge([...koalaParts(), ...wombatParts()]);
}

function koalaParts(): THREE.BufferGeometry[] {
  const K = only(1);
  const fur = sh("#ffffff", 0.3);
  const pale = sh("#f3ece2", 0.2);
  const N: V3 = [0, 0.36, 0.18];
  const H = { p: HEAD, piv: N, vm: K };
  const out: THREE.BufferGeometry[] = [
    rp(ell(0, 0.27, -0.02, 0.19, 0.2, 0.25, 1), fur, { tint: 1, vm: K }),
    rp(ell(0, 0.22, 0.12, 0.13, 0.14, 0.1), pale, { vm: K }),
    rp(ell(0, 0.46, 0.25, 0.16, 0.14, 0.13, 1), fur, { ...H, tint: 1 }),
    // the big black nose and the fluffy white-edged ears
    rp(ell(0, 0.44, 0.38, 0.045, 0.06, 0.035), sh("#25201e", 0.15), H),
    ...eyes(0.075, 0.49, 0.35, 0.018, H),
    rp(ell(0, 0.26, -0.27, 0.05, 0.05, 0.04), fur, { p: TAIL, piv: [0, 0.26, -0.25], tint: 1, vm: K }),
  ];
  for (const s of [-1, 1]) {
    const E = { p: s < 0 ? EAR_L : EAR_R, piv: [s * 0.12, 0.54, 0.22] as V3, piv2: N, vm: K };
    out.push(rp(ell(s * 0.17, 0.58, 0.21, 0.09, 0.085, 0.035), fur, { ...E, tint: 1 }));
    out.push(rp(ell(s * 0.18, 0.585, 0.235, 0.07, 0.065, 0.015), WHITE, E));
  }
  // stubby legs with dark grippy paws
  const legDef: [number, number, number][] = [
    [LEG_FL, -0.12, 0.12],
    [LEG_FR, 0.12, 0.12],
    [LEG_BL, -0.13, -0.14],
    [LEG_BR, 0.13, -0.14],
  ];
  for (const [p, x, z] of legDef) {
    const L = { p, piv: [x, 0.2, z] as V3, vm: K, tuck: true };
    out.push(rp(tube([x, 0.2, z], [x, 0.04, z + 0.02], 0.055, 0.045, 5), fur, { ...L, tint: 1 }));
    out.push(rp(box(x, 0.025, z + 0.04, 0.09, 0.05, 0.1), sh("#3a3330"), L));
  }
  return out;
}

function wombatParts(): THREE.BufferGeometry[] {
  const W = only(2);
  const fur = sh("#ffffff", 0.3);
  const N: V3 = [0, 0.3, 0.34];
  const H = { p: HEAD, piv: N, vm: W };
  const out: THREE.BufferGeometry[] = [
    // a barrel on short legs
    rp(rbox(0, 0.3, -0.02, 0.25, 0.23, 0.38, 0.65), fur, { tint: 1, vm: W }),
    rp(ell(0, 0.3, 0.42, 0.17, 0.15, 0.16), fur, { ...H, tint: 1 }),
    // the broad, flat, leathery nose
    rp(rbox(0, 0.29, 0.56, 0.1, 0.07, 0.04, 0.6, 0), sh("#3a3432", 0.15), H),
    ...eyes(0.09, 0.36, 0.52, 0.016, H),
    ...[-1, 1].map((s) => rp(cone([s * 0.09, 0.42, 0.38], [s * 0.12, 0.5, 0.36], 0.04, 4), fur, { p: s < 0 ? EAR_L : EAR_R, piv: [s * 0.09, 0.42, 0.38], piv2: N, tint: 1, vm: W })),
  ];
  const legDef: [number, number, number][] = [
    [LEG_FL, -0.15, 0.22],
    [LEG_FR, 0.15, 0.22],
    [LEG_BL, -0.16, -0.24],
    [LEG_BR, 0.16, -0.24],
  ];
  for (const [p, x, z] of legDef) {
    const L = { p, piv: [x, 0.17, z] as V3, vm: W, tuck: true };
    out.push(rp(tube([x, 0.17, z], [x, 0.03, z + 0.02], 0.07, 0.06, 5), fur, { ...L, tint: 1 }));
    out.push(rp(box(x, 0.02, z + 0.05, 0.1, 0.04, 0.11), sh("#3a3432"), L));
  }
  return out;
}

// ── the safari: giraffes (variant 1) and elephants (2) ──

export function buildSafari(): THREE.BufferGeometry {
  return merge([...giraffeParts(), ...elephantParts()]);
}

function giraffeParts(): THREE.BufferGeometry[] {
  const G = only(1);
  // cream with big patches (the patches take the instance colour)
  const patch = (p: THREE.Vector3) => noise3(p.x * 2.6 + 3, p.y * 2.6, p.z * 2.6, 9) > 0.5;
  const coat: Paint = (p, n) => (patch(p) ? _c.set("#ffffff") : _c.set("#f6e7c6")).multiplyScalar(0.82 + 0.18 * (n.y * 0.5 + 0.5));
  const patched = (g: THREE.BufferGeometry, o: object) => {
    const out = rp(g, coat, { vm: G, ...o });
    const pos = out.attributes.position as THREE.BufferAttribute;
    const fx = out.attributes.aFx as THREE.BufferAttribute;
    const c = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let f = 0; f < pos.count; f += 3) {
      c.set(0, 0, 0);
      for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, f + k));
      c.multiplyScalar(1 / 3);
      const w = patch(c) ? 1 : 0;
      for (let k = 0; k < 3; k++) fx.setX(f + k, w);
    }
    return out;
  };
  const N: V3 = [0, 2.35, 0.55];
  const H = { p: HEAD, piv: N };
  const dark = sh("#4a3626");
  const out: THREE.BufferGeometry[] = [
    patched(ell(0, 2.15, 0, 0.42, 0.45, 0.75, 1), {}),
    patched(ell(0, 2.3, 0.5, 0.36, 0.42, 0.32), {}),
    // the long neck up to the head (in the head's part, so it bends down to drink and browse)
    patched(tube([0, 2.35, 0.55], [0, 4.25, 1.25], 0.27, 0.14, 6), H),
    patched(ell(0, 4.45, 1.35, 0.15, 0.17, 0.27), H),
    rp(ell(0, 4.36, 1.6, 0.1, 0.1, 0.1), sh("#e9d6b4"), { ...H, vm: G }),
    ...eyes(0.13, 4.52, 1.42, 0.035, { ...H, vm: G }),
    // ossicones and a dark mane
    ...[-1, 1].map((s) => rp(tube([s * 0.06, 4.58, 1.26], [s * 0.08, 4.86, 1.22], 0.035, 0.03, 4), dark, { ...H, vm: G })),
    ...[-1, 1].map((s) => rp(ell(s * 0.08, 4.88, 1.22, 0.05, 0.05, 0.05), dark, { ...H, vm: G })),
    ...[0.15, 0.35, 0.55, 0.75].map((u) => rp(box(0, 2.35 + 1.9 * u + 0.17, 0.55 + 0.7 * u - 0.12, 0.05, 0.2, 0.12, [-0.35, 0, 0]), dark, { ...H, vm: G })),
    rp(tube([0, 2.25, -0.72], [0, 1.25, -0.82], 0.03, 0.025, 4), sh("#f6e7c6"), { p: TAIL, piv: [0, 2.25, -0.72], vm: G }),
    rp(ell(0, 1.18, -0.83, 0.06, 0.13, 0.06), dark, { p: TAIL, piv: [0, 2.25, -0.72], vm: G }),
  ];
  for (const s of [-1, 1]) out.push(rp(ell(s * 0.17, 4.6, 1.3, 0.1, 0.035, 0.05, 0, [0, 0, s * 0.4]), sh("#f6e7c6"), { p: s < 0 ? EAR_L : EAR_R, piv: [s * 0.1, 4.6, 1.3], piv2: N, vm: G }));
  // very long legs
  const legDef: [number, number, number][] = [
    [LEG_FL, -0.22, 0.48],
    [LEG_FR, 0.22, 0.48],
    [LEG_BL, -0.22, -0.5],
    [LEG_BR, 0.22, -0.5],
  ];
  for (const [p, x, z] of legDef) {
    const L = { p, piv: [x, 1.95, z] as V3, tuck: true };
    out.push(patched(tube([x, 2.0, z], [x, 0.12, z + 0.02], 0.12, 0.07, 5), L));
    out.push(rp(box(x, 0.06, z + 0.03, 0.15, 0.12, 0.17), dark, { ...L, vm: G }));
  }
  return out;
}

function elephantParts(): THREE.BufferGeometry[] {
  const E = only(2);
  const skin = sh("#ffffff", 0.32);
  const N: V3 = [0, 2.35, 0.95];
  const H = { p: HEAD, piv: N, vm: E };
  const T = { p: JAW, piv: [0, 2.0, 1.45] as V3, piv2: N, vm: E, tint: 1 };
  const out: THREE.BufferGeometry[] = [
    rp(rbox(0, 1.95, -0.05, 0.82, 0.82, 1.2, 0.62), skin, { tint: 1, vm: E }),
    rp(ell(0, 2.35, 1.12, 0.56, 0.6, 0.5, 1), skin, { ...H, tint: 1 }),
    ...eyes(0.42, 2.48, 1.42, 0.05, H),
    // tusks
    ...[-1, 1].map((s) => rp(cone([s * 0.22, 1.85, 1.45], [s * 0.3, 1.55, 1.95], 0.07, 5), sh("#fbf3e0", 0.15), H)),
    // the trunk: a chain of tapering tubes (the jaw part: it curls up when the wing channel says)
    rp(tube([0, 2.15, 1.5], [0, 1.6, 1.78], 0.24, 0.2, 6), skin, T),
    rp(tube([0, 1.6, 1.78], [0, 1.0, 1.86], 0.2, 0.15, 6), skin, T),
    rp(tube([0, 1.0, 1.86], [0, 0.45, 1.88], 0.15, 0.11, 6), skin, T),
    rp(ell(0, 0.45, 1.88, 0.11, 0.05, 0.11), sh("#8a8682"), T),
    rp(tube([0, 2.25, -1.22], [0, 1.2, -1.32], 0.045, 0.035, 4), skin, { p: TAIL, piv: [0, 2.25, -1.22], tint: 1, vm: E }),
    rp(ell(0, 1.12, -1.33, 0.07, 0.12, 0.07), sh("#3a3432"), { p: TAIL, piv: [0, 2.25, -1.22], vm: E }),
  ];
  // the great flapping ears
  for (const s of [-1, 1]) {
    const Ep = { p: s < 0 ? EAR_L : EAR_R, piv: [s * 0.5, 2.5, 0.95] as V3, piv2: N, vm: E };
    out.push(rp(ell(s * 0.78, 2.3, 0.88, 0.42, 0.6, 0.08, 0, [0, s * -0.35, 0]), skin, { ...Ep, tint: 1 }));
    out.push(rp(ell(s * 0.8, 2.3, 0.93, 0.32, 0.48, 0.03, 0, [0, s * -0.35, 0]), sh("#d7a8a0", 0.15), { ...Ep, tint: 0.5 }));
  }
  // pillar legs with pale toenails
  const legDef: [number, number, number][] = [
    [LEG_FL, -0.48, 0.72],
    [LEG_FR, 0.48, 0.72],
    [LEG_BL, -0.48, -0.75],
    [LEG_BR, 0.48, -0.75],
  ];
  for (const [p, x, z] of legDef) {
    const L = { p, piv: [x, 1.55, z] as V3, vm: E, tuck: true };
    out.push(rp(tube([x, 1.7, z], [x, 0.08, z], 0.33, 0.3, 7), skin, { ...L, tint: 1 }));
    out.push(rp(box(x, 0.06, z + 0.26, 0.4, 0.1, 0.09), sh("#efe6d6"), L));
  }
  return out;
}

/** the geometry for each instanced mesh (in MESH order: types.ts) */
export function buildMeshGeometries(): THREE.BufferGeometry[] {
  return [buildDeer(), buildRabbit(), buildFox(), buildSquirrel(), buildHorse(), buildGoat(), buildCow(), buildDuck(), buildOwl(), buildBear(), buildCritters(), buildRoo(), buildBush(), buildSafari(), buildSpiky()];
}

/**
 * Measure a model the way the true-size table does (types.ts SIZES): only the vertices that show
 * on `variant`, and only the body (`back`), the body + head (`head`: the top of the head, ears
 * not counted) or the body + head along z (`length`: nose to rump, the tail not counted).
 */
export function measureModel(geo: THREE.BufferGeometry, variant: number, measure: "back" | "head" | "length"): number {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const rig = geo.attributes.aRig as THREE.BufferAttribute;
  const fx = geo.attributes.aFx as THREE.BufferAttribute;
  let top = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const m = Math.round(fx.getZ(i));
    if (m && !((m >> variant) & 1)) continue;
    const part = Math.round(rig.getX(i)) % 16;
    if (measure === "back" ? part !== BODY_PART : part !== BODY_PART && part !== HEAD) continue;
    top = Math.max(top, pos.getY(i));
    z0 = Math.min(z0, pos.getZ(i));
    z1 = Math.max(z1, pos.getZ(i));
  }
  return measure === "length" ? z1 - z0 : top;
}
const BODY_PART = 0;
