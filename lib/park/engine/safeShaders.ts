// Shader guards applied once, before any park material compiles.
//
// Flat shading takes each pixel's normal from screen-space derivatives of its position. On
// sub-pixel-thin or far-away faces (distant branch whorls, needles, fern tips) those derivatives
// can be exactly zero, and normalize(vec3(0)) is NaN. A single NaN pixel then spreads through the
// bloom blur until the whole screen goes black. Fall back to facing the camera instead.
import * as THREE from "three";

const FLAT = "vec3 normal = normalize( cross( fdx, fdy ) );";
const SAFE = "vec3 flatN = cross( fdx, fdy );\n\tvec3 normal = dot( flatN, flatN ) > 0.0 ? normalize( flatN ) : vec3( 0.0, 0.0, 1.0 );";

let applied = false;

export function applySafeShaders(): void {
  if (applied) return;
  applied = true;
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  const src = chunks.normal_fragment_begin;
  if (src.includes(FLAT)) chunks.normal_fragment_begin = src.replace(FLAT, SAFE);
}
