// Shared shader plumbing for the fantasy kit.
//
// `fxPatch()` upgrades a MeshStandardMaterial so ONE instanced mesh can hold a whole object
// (trunk + canopy + glowing pods, stone + runes ...) via a per-vertex `aFx` attribute:
//   aFx.x  how much the per-instance colour tints this vertex (canopy yes, bark no)
//   aFx.y  how much it sways in the wind (canopy tips most, trunk base not at all)
//   aFx.z  how much it glows (emissive = vertex colour x glow x uGlowK — > 1 blooms)
// With `island: true` vertices are also moved by one of the floating islands' matrices
// (`aIsl` picks which), so every floating island shares one draw call while bobbing on its own;
// `aIsl2` + `aIslMix` blend in a second island's matrix (rope bridges hang between two islands).
import * as THREE from "three";

export interface FantasyUniforms {
  uTime: { value: number };
  uGlow: { value: number };
  /** emissive multiplier for glowing parts: soft by day, blooming at twilight */
  uGlowK: { value: number };
  /** 0..1 how much glowing parts pulse (twilight) */
  uPulse: { value: number };
  uWindDir: { value: THREE.Vector2 };
  uGust: { value: number };
  /** canopy sway amplitude (local units) */
  uSway: { value: number };
  /** the player (grass follows it) */
  uFocus: { value: THREE.Vector2 };
  /** floating island matrices (one slot per sky island; slot ISL_WORLD = identity, the ground) */
  uIslMat: { value: THREE.Matrix4[] };
}

/** one slot per sky island (registry/skyIslands.ts, up to 15) + the ground */
export const ISL_SLOTS = 16;
export const ISL_WORLD = 15;

export function makeUniforms(): FantasyUniforms {
  return {
    uTime: { value: 0 },
    uGlow: { value: 0 },
    uGlowK: { value: 1 },
    uPulse: { value: 0 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.5).normalize() },
    uGust: { value: 1 },
    uSway: { value: 0.35 },
    uFocus: { value: new THREE.Vector2() },
    uIslMat: { value: Array.from({ length: ISL_SLOTS }, () => new THREE.Matrix4()) },
  };
}

/** the travelling gust wave: bands of stronger wind rolling across the island (grass + trees agree) */
export const GUST_GLSL = /* glsl */ `
float fantasyGust(vec2 p) {
  vec2 sideDir = vec2(-uWindDir.y, uWindDir.x);
  float w = dot(p, uWindDir) * 0.07 - uTime * 1.15 + sin(dot(p, sideDir) * 0.045 + uTime * 0.2) * 1.6;
  float g = 0.5 + 0.5 * sin(w);
  float g2 = 0.5 + 0.5 * sin(dot(p, uWindDir) * 0.021 - uTime * 0.37 + 1.3);
  return g * g * g * (0.45 + 0.55 * g2) * uGust;
}
`;

export const HASH_GLSL = /* glsl */ `
float fhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float fnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fhash(i), fhash(i + vec2(1.0, 0.0)), u.x), mix(fhash(i + vec2(0.0, 1.0)), fhash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

/** fog as a 0..1 factor (for additive / premultiplied effects that must fade, not tint) */
export const FOG_FACTOR_GLSL = /* glsl */ `
float fantasyFog() {
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      return 1.0 - exp(- fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      return smoothstep(fogNear, fogFar, vFogDepth);
    #endif
  #else
    return 0.0;
  #endif
}
`;

export function fxPatch(mat: THREE.MeshStandardMaterial, U: FantasyUniforms, opts: { island?: boolean } = {}) {
  const key = `fantasy-fx-${opts.island ? "isl" : "std"}`;
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uGlowK = U.uGlowK;
    shader.uniforms.uPulse = U.uPulse;
    shader.uniforms.uWindDir = U.uWindDir;
    shader.uniforms.uGust = U.uGust;
    shader.uniforms.uSway = U.uSway;
    if (opts.island) shader.uniforms.uIslMat = U.uIslMat;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec3 aFx;
        varying float vFxGlow;
        uniform float uTime; uniform vec2 uWindDir; uniform float uGust; uniform float uPulse; uniform float uSway;
        ${opts.island ? `attribute float aIsl; attribute float aIsl2; attribute float aIslMix; uniform mat4 uIslMat[${ISL_SLOTS}];` : ""}
        ${GUST_GLSL}`,
      )
      .replace(
        "#include <color_vertex>",
        `#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          vColor = vec4( 1.0 );
          #ifdef USE_COLOR
            vColor.rgb *= color.rgb;
          #endif
          #ifdef USE_INSTANCING_COLOR
            vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, aFx.x );
          #endif
        #endif`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
        ${opts.island ? "mat4 islM = uIslMat[ int( aIsl + 0.5 ) ] * ( 1.0 - aIslMix ) + uIslMat[ int( aIsl2 + 0.5 ) ] * aIslMix; objectNormal = mat3( islM ) * objectNormal;" : ""}`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 fxOrg = instanceMatrix[3].xyz;
            vec3 fxW = normalize( ( vec4( uWindDir.x, 0.0, uWindDir.y, 0.0 ) * instanceMatrix ).xyz + vec3( 1e-5 ) );
          #else
            vec3 fxOrg = vec3( 0.0 );
            vec3 fxW = vec3( uWindDir.x, 0.0, uWindDir.y );
          #endif
          float fxG = fantasyGust( fxOrg.xz );
          float fxPh = uTime * 1.25 + fxOrg.x * 0.11 + fxOrg.z * 0.13;
          vec3 fxSide = vec3( -fxW.z, 0.0, fxW.x );
          vec3 fxD = fxW * ( 0.25 + 0.3 * sin( fxPh ) + fxG * 1.1 ) + fxSide * sin( fxPh * 0.71 + 1.3 ) * 0.25;
          fxD += vec3( sin( uTime * 3.1 + position.x * 1.3 + position.y * 0.9 ), 0.5 * sin( uTime * 2.6 + position.z * 1.7 ), cos( uTime * 3.4 + position.z * 1.2 + position.y * 0.7 ) ) * ( 0.18 + fxG * 0.2 );
          transformed += fxD * aFx.y * uSway;
          vFxGlow = aFx.z * ( 1.0 + uPulse * 0.55 * sin( uTime * 1.7 + fxOrg.x * 0.37 + fxOrg.z * 0.23 + position.y * 0.6 ) );
        }
        ${opts.island ? "transformed = ( islM * vec4( transformed, 1.0 ) ).xyz;" : ""}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFxGlow;\nuniform float uGlowK;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          totalEmissiveRadiance += vColor.rgb * vFxGlow * uGlowK;
        #endif`,
      );
  };
  return mat;
}

/** a MeshStandardMaterial ready for fxPatch */
export function fxMaterial(U: FantasyUniforms, params: THREE.MeshStandardMaterialParameters, opts: { island?: boolean } = {}) {
  return fxPatch(new THREE.MeshStandardMaterial({ vertexColors: true, ...params }), U, opts);
}
