// A small, chunky low-poly flier for the Wildlands: a parrot (variant 0, flitting through the
// rainforest canopy) and an eagle (variant 1, soaring over the Great Ridge) sharing one instanced
// mesh — the same trick lib/park/world/fauna/species.ts uses for the kangaroo + emu and the
// giraffe + elephant (two body plans, picked per instance by a variant bit mask). Built with the
// park's own rigged-part helpers so it animates through the same vertex rig (./sim.ts drives
// WING_L / WING_R via iC.x: fold .. spread .. flap).
import * as THREE from "three";
import { EAR_L, EAR_R, HEAD, TAIL, WING_L, WING_R, box, cone, ell, eyes, only, rp, sh, type V3 } from "../fauna/geometry";
import { merge } from "../fantasy/geo";

function parrotParts(): THREE.BufferGeometry[] {
  const P = only(0);
  const body = sh("#ffffff", 0.3); // (recoloured per instance: reds, blues, greens...)
  const belly = sh("#fff6d8", 0.2);
  const N: V3 = [0, 0.2, 0.17];
  const H = { p: HEAD, piv: N, vm: P, tint: 1 };
  const out: THREE.BufferGeometry[] = [
    rp(ell(0, 0, 0, 0.145, 0.155, 0.24, 1), body, { tint: 1, vm: P }),
    rp(ell(0, -0.04, -0.1, 0.1, 0.09, 0.14), belly, { vm: P }),
    rp(ell(0, 0.17, 0.26, 0.12, 0.115, 0.13, 1), body, { ...H }),
    rp(cone([0, 0.14, 0.4], [0, 0.08, 0.52], 0.055, 5), sh("#e0a030", 0.2), { ...H, tint: 0 }),
    ...eyes(0.065, 0.2, 0.38, 0.02, H),
    rp(ell(0, -0.02, -0.33, 0.045, 0.14, 0.05, 0, [0.15, 0, 0]), body, { p: TAIL, piv: [0, 0, -0.26], tint: 1, vm: P }),
  ];
  for (const s of [-1, 1]) {
    const W = { p: s < 0 ? WING_L : WING_R, piv: [s * 0.12, 0.03, 0] as V3, vm: P, tint: 1 };
    out.push(rp(ell(s * 0.27, 0.02, -0.02, 0.15, 0.045, 0.2, 0, [0, 0, s * -0.1]), body, W));
    const E = { p: s < 0 ? EAR_L : EAR_R, piv: [s * 0.1, 0.19, 0.3] as V3, piv2: N, vm: P, tint: 1 };
    out.push(rp(ell(s * 0.14, 0.26, 0.3, 0.025, 0.07, 0.02), body, E));
  }
  return out;
}

function eagleParts(): THREE.BufferGeometry[] {
  const E = only(1);
  const coat = sh("#ffffff", 0.3); // (recoloured per instance: browns)
  const white = sh("#f6f2e6", 0.15);
  const N: V3 = [0, 0.23, 0.2];
  const H = { p: HEAD, piv: N, vm: E, tint: 0 };
  const out: THREE.BufferGeometry[] = [
    rp(ell(0, 0, 0, 0.17, 0.18, 0.3, 1), coat, { tint: 1, vm: E }),
    rp(ell(0, 0.2, 0.3, 0.12, 0.12, 0.14, 1), white, H),
    rp(cone([0, 0.17, 0.44], [0, 0.1, 0.6], 0.06, 5), sh("#e8c23a", 0.2), { ...H, tint: 0 }),
    ...eyes(0.07, 0.22, 0.4, 0.022, H),
    rp(ell(0, 0.01, -0.42, 0.06, 0.2, 0.07, 0, [0.1, 0, 0]), sh("#2a2320", 0.15), { p: TAIL, piv: [0, 0, -0.32], vm: E }),
  ];
  for (const s of [-1, 1]) {
    const W = { p: s < 0 ? WING_L : WING_R, piv: [s * 0.15, 0.04, 0] as V3, vm: E, tint: 1 };
    out.push(rp(ell(s * 0.55, 0.02, -0.02, 0.4, 0.06, 0.26, 0, [0, 0, s * -0.08]), coat, W));
    out.push(rp(box(s * 0.78, 0.0, -0.04, 0.22, 0.035, 0.12, [0, 0, s * -0.08]), sh("#2a2320"), { ...W, tint: 0 }));
  }
  return out;
}

/** parrot (variant 0) + eagle (variant 1), merged into one instanced mesh */
export function buildFlier(): THREE.BufferGeometry {
  return merge([...parrotParts(), ...eagleParts()]);
}
