// Shared toon materials for the chibi characters.
// One MeshToonMaterial per colour (+ opacity), cached module-wide so every character shares them.
// Glow materials (eyes, cheeks, markings) are per-rig so each rig can drive its own night glow.
import * as THREE from "three";
import { getToonRamp } from "@/lib/park/assets/loader";

const shared = new Map<string, THREE.Material>();

export function toonMat(color: string, opacity = 1): THREE.MeshToonMaterial {
  const key = `t|${color}|${opacity}`;
  let m = shared.get(key) as THREE.MeshToonMaterial | undefined;
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color: new THREE.Color(color),
      gradientMap: getToonRamp(),
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
    });
    m.name = `chibi:${color}`;
    shared.set(key, m);
  }
  return m;
}

/** Unlit colour (eye sparkles): always bright, whatever the lighting. */
export function basicMat(color: string, opacity = 1): THREE.MeshBasicMaterial {
  const key = `b|${color}|${opacity}`;
  let m = shared.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    m.name = `chibi:basic:${color}`;
    shared.set(key, m);
  }
  return m;
}

/** A per-rig toon material whose emissive fades in with setGlow(). */
export function glowMat(color: string, glow: string, opacity = 1, strength = 1): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: getToonRamp(),
    emissive: new THREE.Color(glow),
    emissiveIntensity: 0,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
  m.name = `chibi:glow:${color}`;
  m.userData.glowStrength = strength;
  return m;
}

export function isSharedMaterial(m: THREE.Material) {
  for (const v of shared.values()) if (v === m) return true;
  return false;
}
