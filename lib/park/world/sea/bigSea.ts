// The sea's big creatures, for the camera and the boats: true-size blue whales (40 units), humpbacks,
// the orca pod, the Midnight Rift's megalodon and giant squid... Each world module that owns some
// (../underwater, ../abyss) lists them here every frame (`setBigSea`); the engine reads them back to
// frame a diving kid together with a giant swimming by (`bigFrame`), and to bump boats off whales
// and orcas at the surface.
//
// Also: `addOccluderFade` makes a creature material dither itself away wherever it comes between
// the camera and the kid (or right up against the lens), so a whale gliding past the camera can't
// black the whole view out. One shared uniform holds the kid (`setOccluderFocus`, every frame).
import * as THREE from "three";

export interface BigBody {
  x: number;
  y: number;
  z: number;
  /** nose to tail (units) */
  len: number;
  /** heading (radians about +Y) */
  yaw: number;
}

const sources = new Map<string, BigBody[]>();

/** this module's big creatures right now (the list is kept, not copied: refill it in place) */
export function setBigSea(source: string, list: BigBody[]): void {
  sources.set(source, list);
}
/** every big creature listed this frame */
export function forEachBigSea(fn: (b: BigBody) => void): void {
  for (const l of sources.values()) for (let i = 0; i < l.length; i++) fn(l[i]);
}

const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/** how far a big creature (centre) can be from the kid and still pull the camera back */
export const bigReach = (len: number) => len * 0.6 + 30;

/**
 * Under water: how far back the camera should sit (and how much wider it should look, degrees)
 * to show the kid and the giants near them whole. `base` = the usual (murky-water) distance, `max`
 * = never further than this. A creature right by the kid wants ~its own length back; the pull
 * fades smoothly as it swims away.
 */
export function bigFrame(kid: { x: number; y: number; z: number }, bodies: Iterable<BigBody>, base: number, max: number, out: { dist: number; fov: number; w: number }): { dist: number; fov: number; w: number } {
  let dist = base;
  let w = 0;
  for (const b of bodies) {
    if (b.len < 8) continue;
    const d = Math.hypot(b.x - kid.x, (b.y - kid.y) * 1.2, b.z - kid.z);
    const reach = bigReach(b.len);
    const k = 1 - smooth(reach - 22, reach, d);
    if (k <= 0) continue;
    // (the creature's length plus its gap from the kid, seen through ~40 degrees)
    const want = Math.min(max, Math.max(base, b.len * 0.9 + Math.min(d, b.len) * 0.3 + 4));
    dist = Math.max(dist, base + (want - base) * k);
    w = Math.max(w, k * Math.min(1, (want - base) / 12));
  }
  out.dist = dist;
  out.fov = 9 * w;
  out.w = w;
  return out;
}

// ── fading creatures out of the way ──
const occU = { uOccKid: { value: new THREE.Vector3(0, -1e5, 0) }, uOccOn: { value: 0 } };

/** where the kid is (world; their middle) and whether the fade is on (1 under water, 0 above) */
export function setOccluderFocus(x: number, y: number, z: number, on: number): void {
  occU.uOccKid.value.set(x, y, z);
  occU.uOccOn.value = on;
}

/** the fade (GLSL, view space): 1 = gone, between the camera and the kid or within ~3 m of the lens */
export const OCCLUDE_GLSL = /* glsl */ `
  float occFade( vec3 p, vec3 kv ) {
    float kd = max( length( kv ), 0.001 );
    vec3 kdir = kv / kd;
    float along = dot( p, kdir );
    float perp = length( p - kdir * along );
    // a cone from the lens to the kid (wide enough round them for the whole kid and a margin)
    float r = 1.1 + 0.8 * clamp( along / kd, 0.0, 1.0 );
    float occ = step( 0.0, along ) * ( 1.0 - smoothstep( kd - 0.4, kd + 0.5, along ) ) * ( 1.0 - smoothstep( r, r + 0.6, perp ) );
    float nearF = 1.0 - smoothstep( 3.0, 4.5, length( p ) );
    return max( occ, nearF );
  }
  float occBayer( vec2 f ) {
    vec2 q = mod( floor( f ), 4.0 );
    float b = mod( q.x * 2.0 + q.y * 3.0 + floor( q.x * 0.5 ) * 5.0 + floor( q.y * 0.5 ) * 7.0, 16.0 );
    return ( b + 0.5 ) / 16.0;
  }`;

/** dither a creature material away between the camera and the kid (chains onto any built-in material) */
export function addOccluderFade<M extends THREE.Material>(mat: M): M {
  const m = mat as M & { __occ?: boolean };
  if (m.__occ) return mat;
  m.__occ = true;
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = function (shader, renderer) {
    prev.call(this, shader, renderer);
    shader.uniforms.uOccKid = occU.uOccKid;
    shader.uniforms.uOccOn = occU.uOccOn;
    shader.vertexShader = shader.vertexShader
      .replace(/void\s+main\s*\(\s*\)\s*\{/, (s) => `varying vec3 vOccV;\n${s}`)
      .replace("#include <project_vertex>", "#include <project_vertex>\n  vOccV = mvPosition.xyz;");
    shader.fragmentShader = shader.fragmentShader.replace(
      /void\s+main\s*\(\s*\)\s*\{/,
      (s) => `varying vec3 vOccV; uniform vec3 uOccKid; uniform float uOccOn;\n${OCCLUDE_GLSL}\n${s}\n  if ( uOccOn > 0.0 && occFade( vOccV, ( viewMatrix * vec4( uOccKid, 1.0 ) ).xyz ) * uOccOn > occBayer( gl_FragCoord.xy ) ) discard;`,
    );
  };
  mat.customProgramCacheKey = function () {
    return prevKey.call(this) + "-occ";
  };
  mat.needsUpdate = true;
  return mat;
}

/** the fade in JS (tests): p and kid relative to the camera */
export function occFade(p: { x: number; y: number; z: number }, kv: { x: number; y: number; z: number }): number {
  const kd = Math.max(Math.hypot(kv.x, kv.y, kv.z), 0.001);
  const dx = kv.x / kd;
  const dy = kv.y / kd;
  const dz = kv.z / kd;
  const along = p.x * dx + p.y * dy + p.z * dz;
  const perp = Math.hypot(p.x - dx * along, p.y - dy * along, p.z - dz * along);
  const r = 1.1 + 0.8 * Math.min(1, Math.max(0, along / kd));
  const occ = (along >= 0 ? 1 : 0) * (1 - smooth(kd - 0.4, kd + 0.5, along)) * (1 - smooth(r, r + 0.6, perp));
  const nearF = 1 - smooth(3.0, 4.5, Math.hypot(p.x, p.y, p.z));
  return Math.max(occ, nearF);
}
