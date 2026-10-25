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
    if (opacity >= 1) plushify(m);
    shared.set(key, m);
  }
  return m;
}

// ── plush: every character is a soft toy, so its colours carry the fine nap of plush fur — a
//    neutral fur picture (public/park-assets/props/plush-fur.webp, from codex-world-art/props/)
//    laid over the body from three sides and blended by which way the surface faces, lightening and
//    darkening the colour a little. Nothing shows until the picture has arrived. ──
const PLUSH = { uPlush: { value: null as THREE.Texture | null }, uPlushK: { value: 0 } };
let plushAsked = false;
function plushify(m: THREE.MeshToonMaterial) {
  if (typeof document === "undefined") return;
  if (!plushAsked) {
    plushAsked = true;
    const t = new THREE.TextureLoader().load("/park-assets/props/plush-fur.webp", () => (PLUSH.uPlushK.value = 3.4));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    PLUSH.uPlush.value = t;
  }
  m.customProgramCacheKey = () => "chibi-plush";
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPlush = PLUSH.uPlush;
    sh.uniforms.uPlushK = PLUSH.uPlushK;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vPlP;\nvarying vec3 vPlN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPlP = position;\nvPlN = normal;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uPlush;\nuniform float uPlushK;\nvarying vec3 vPlP;\nvarying vec3 vPlN;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          vec3 plW = abs( normalize( vPlN ) );
          plW /= plW.x + plW.y + plW.z;
          float plF = texture2D( uPlush, vPlP.yz * 5.0 ).r * plW.x + texture2D( uPlush, vPlP.xz * 5.0 ).r * plW.y + texture2D( uPlush, vPlP.xy * 5.0 ).r * plW.z;
          diffuseColor.rgb *= 1.0 + ( plF - 0.635 ) * uPlushK;
        }`,
      );
  };
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
