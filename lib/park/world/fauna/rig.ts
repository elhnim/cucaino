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
//   aPat   a coat painted per pixel on this part (geometry.ts PO.pat): 1 a giraffe's patches; 2 / 3 /
//          4 a zebra's stripes across the body / down a leg / round the neck (drawn only on the
//          horse mesh's zebra variant, 2)
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
      .replace("#include <common>", "#include <common>\nattribute float aPat;\nvarying float vFaGlow;\nvarying float vFaHint;\nvarying float vFaPat;\nvarying vec3 vFaP;")
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
        vFaHint = fract( iB.w + 0.0001 ) * 1.1;
        // (the coat pattern is laid out on the animal standing still, so it rides with each limb)
        vFaP = position;
        vFaPat = aPat > 1.5 && abs( floor( iB.w + 0.001 ) - 2.0 ) > 0.5 ? 0.0 : aPat;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFaGlow;\nvarying float vFaHint;\nvarying float vFaPat;\nvarying vec3 vFaP;\nuniform float uEye;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        if ( vFaPat > 0.5 ) {
          if ( vFaPat < 1.5 ) {
            // a giraffe: chestnut patches with a pale net of lines between them (cells of scattered
            // points; a pixel is in the net where its two nearest points are about as near)
            vec3 g = vFaP * 4.4;
            vec3 gi = floor( g );
            vec3 gf = fract( g );
            float d1 = 9.0; float d2 = 9.0; float hue = 0.0;
            for ( int ix = -1; ix <= 1; ix++ ) for ( int iy = -1; iy <= 1; iy++ ) for ( int iz = -1; iz <= 1; iz++ ) {
              vec3 o = vec3( float( ix ), float( iy ), float( iz ) );
              vec3 c = gi + o;
              vec3 h = fract( sin( vec3( dot( c, vec3( 127.1, 311.7, 74.7 ) ), dot( c, vec3( 269.5, 183.3, 246.1 ) ), dot( c, vec3( 113.5, 271.9, 124.6 ) ) ) ) * 43758.5453 );
              vec3 r = o + 0.15 + h * 0.7 - gf;
              float d = dot( r, r );
              if ( d < d1 ) { d2 = d1; d1 = d; hue = h.x; } else if ( d < d2 ) { d2 = d; }
            }
            float net = sqrt( d2 ) - sqrt( d1 );
            vec3 patchCol = mix( vec3( 0.56, 0.31, 0.12 ), vec3( 0.7, 0.42, 0.17 ), hue );
            diffuseColor.rgb = mix( diffuseColor.rgb, patchCol * ( 0.75 + 0.25 * diffuseColor.g ), smoothstep( 0.09, 0.15, net ) );
          } else {
            // a zebra: black stripes down the body, round the neck and face, in hoops down the legs
            float a = vFaPat < 2.5 ? vFaP.z * 23.0 + sin( vFaP.y * 5.0 ) * 0.9 + abs( vFaP.x ) * 2.0
              : vFaPat < 3.5 ? vFaP.y * 32.0 + vFaP.z * 3.0
              : ( vFaP.y * 0.89 + vFaP.z * 0.46 ) * 27.0 + abs( vFaP.x ) * 3.0;
            float st = smoothstep( -0.2, 0.2, sin( a ) );
            diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.09, 0.075, 0.07 ), st );
          }
        }`,
      )
      .replace(
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
