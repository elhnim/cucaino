// The animals' vertex rig: every species is ONE instanced mesh (one draw call) whose legs, head,
// ears, tail and wings are posed in the vertex shader from a few per-instance numbers, so a whole
// herd walks, grazes, looks round and flicks its ears without any skinning or per-animal meshes.
//
// Per vertex:
//   aRig   (part, pivot.xyz)   part: 0 body, 1 head (+ neck, antlers ...), 2..5 legs FL FR BL BR,
//                              6 tail, 7 / 8 ears L / R (children of the head), 9 / 10 wings L / R,
//                              11 jaw / trunk (a child of the head, curled by the wing channel),
//                              12 a prop that never moves (the owls' branch);
//                              part + 16 = "tuckable" (shrinks toward its pivot as `tuck` rises:
//                              legs folding under a lying cow, a turtle pulling its head in)
//   aPiv2  the head's pivot (for ears, which turn with the head)
//   aFx    (tint, glow, mask)   tint: how much the instance colour tints this vertex (fur yes,
//                              eyes no); glow: emissive at night (owls' eyes); mask: 0 always
//                              drawn, else a bit mask of the variants that show it (bit k =
//                              variant k), so species sharing a mesh share some parts
// Per instance:
//   iA  (gait phase, stride, head yaw, head pitch)
//   iB  (ear flick, tail wag, front-right paw raise, variant + 0.9 × hint glow)
//   iC  (wing spread, tail lift, tuck, bound: 0 walk (diagonal legs) .. 1 bound / hop (pairs))
import * as THREE from "three";

export interface RigUniforms {
  /** owls' eyes: 0 by day .. ~2.5 at night */
  uEye: { value: number };
}

export const RIG_ATTRS = ["iA", "iB", "iC"] as const;

const RIG_GLSL = /* glsl */ `
attribute vec3 aFx;
attribute vec4 aRig;
attribute vec3 aPiv2;
attribute vec4 iA;
attribute vec4 iB;
attribute vec4 iC;
mat3 faRX( float a ) { float c = cos( a ); float s = sin( a ); return mat3( 1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c ); }
mat3 faRY( float a ) { float c = cos( a ); float s = sin( a ); return mat3( c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c ); }
mat3 faRZ( float a ) { float c = cos( a ); float s = sin( a ); return mat3( c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0 ); }
void faunaRig( inout vec3 p, inout vec3 n ) {
  float pid = aRig.x;
  float tk = step( 15.5, pid );
  pid -= 16.0 * tk;
  vec3 piv = aRig.yzw;
  float show = 1.0;
  if ( aFx.z > 0.5 ) {
    int vm = int( aFx.z + 0.5 );
    int iv = int( floor( iB.w + 0.001 ) );
    show = float( ( vm >> iv ) & 1 );
  }
  float side = piv.x >= 0.0 ? 1.0 : -1.0;
  mat3 R = mat3( 1.0 );
  mat3 H = mat3( 1.0 );
  float child = 0.0;
  if ( pid < 0.5 ) {
  } else if ( pid < 1.5 ) {
    R = faRY( iA.z ) * faRX( iA.w );
  } else if ( pid < 5.5 ) {
    float front = pid < 3.5 ? 1.0 : 0.0;
    float right = ( pid > 2.5 && pid < 3.5 ) || pid > 4.5 ? 1.0 : 0.0;
    float walkOff = abs( front - right ) < 0.5 ? 3.14159 : 0.0;
    float boundOff = front > 0.5 ? right * 0.35 : 3.14159 + right * 0.35;
    float ang = sin( iA.x + mix( walkOff, boundOff, iC.w ) ) * iA.y * 0.55;
    if ( pid > 2.5 && pid < 3.5 ) ang -= iB.z;
    R = faRX( ang );
  } else if ( pid < 6.5 ) {
    R = faRY( iB.y ) * faRX( iC.y );
  } else if ( pid < 8.5 ) {
    R = faRZ( side * iB.x );
    H = faRY( iA.z ) * faRX( iA.w );
    child = 1.0;
  } else if ( pid < 10.5 ) {
    R = faRZ( side * iC.x );
  } else if ( pid < 11.5 ) {
    R = faRX( -iC.x );
    H = faRY( iA.z ) * faRX( iA.w );
    child = 1.0;
  }
  if ( tk > 0.5 ) p = piv + ( p - piv ) * ( 1.0 - 0.92 * iC.z );
  p = piv + R * ( p - piv );
  n = R * n;
  if ( child > 0.5 ) {
    p = aPiv2 + H * ( p - aPiv2 );
    n = H * n;
  }
  p *= show;
}
`;

function patchVertex(src: string, withNormal: boolean): string {
  let s = src.replace("#include <common>", `#include <common>\n${RIG_GLSL}`);
  if (withNormal)
    s = s.replace(
      "#include <beginnormal_vertex>",
      `#include <beginnormal_vertex>
      { vec3 faP = position; faunaRig( faP, objectNormal ); }`,
    );
  s = s.replace(
    "#include <begin_vertex>",
    `#include <begin_vertex>
    { vec3 faN = vec3( 0.0, 1.0, 0.0 ); faunaRig( transformed, faN ); }`,
  );
  return s;
}

/** the shared toon-ish material for every animal (vertex colours, instance tint on fur, glowing eyes) */
export function rigMaterial(U: RigUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  mat.customProgramCacheKey = () => "fauna-rig";
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uEye = U.uEye;
    shader.vertexShader = patchVertex(shader.vertexShader, true)
      .replace("#include <common>", "#include <common>\nvarying float vFaGlow;\nvarying float vFaHint;")
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
        #endif
        vFaGlow = aFx.y;
        vFaHint = fract( iB.w + 0.0001 ) * 1.1;`,
      );
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vFaGlow;\nvarying float vFaHint;\nuniform float uEye;").replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
        #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          totalEmissiveRadiance += vColor.rgb * vFaGlow * uEye;
          // (a small animal right by the kid glows softly so it reads from the follow camera)
          totalEmissiveRadiance += ( vColor.rgb * 0.55 + vec3( 0.12, 0.1, 0.05 ) ) * vFaHint * 0.6;
        #endif`,
    );
  };
  return mat;
}

/** the matching shadow-caster (the same pose, so shadows walk too) */
export function rigDepthMaterial(): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.customProgramCacheKey = () => "fauna-rig-depth";
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = patchVertex(shader.vertexShader, false);
  };
  return mat;
}
