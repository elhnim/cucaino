// The rainforest's see-through cut, so the camera never gets stuck in leaves and the kid always
// shows: every jungle fragment (crowns, trunks, ferns, vines) inside a cone from the kid to the
// camera is dropped, and so is anything right round the camera itself (when the camera sits in a
// crown up in the canopy, or among the ferns behind the kid on a forest trail). Layered on top of
// the fantasy kit's fxPatch (wind sway + instance tint), like ../storybook/cutaway.ts.
import * as THREE from "three";

export interface JungleCut {
  uJKid: { value: THREE.Vector3 };
  uJCam: { value: THREE.Vector3 };
  /** cone radius at the kid and at the camera; the clear ball round the camera */
  uJR: { value: THREE.Vector3 };
}

export function makeJungleCut(): JungleCut {
  return { uJKid: { value: new THREE.Vector3(0, -1e4, 0) }, uJCam: { value: new THREE.Vector3(0, -1e4, 0) }, uJR: { value: new THREE.Vector3(2.2, 6.5, 5.5) } };
}

/** the GLSL test (needs vJW: the fragment's world position) */
export const JUNGLE_CUT_GLSL = /* glsl */ `
  {
    vec3 ab = uJCam - uJKid;
    float h = clamp( dot( vJW - uJKid, ab ) / max( dot( ab, ab ), 1e-4 ), 0.0, 1.0 );
    float d = length( vJW - uJKid - ab * h );
    float r = mix( uJR.x, uJR.y, h );
    // (a soft dithered rim so the window's edge isn't a hard hoop)
    float ign = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
    if ( h > 0.03 && vJW.y > uJKid.y + 0.3 && d < r ) discard;
    if ( length( vJW - uJCam ) < uJR.z ) discard;
    ign += 0.0;
  }
`;

export function addJungleCut(mat: THREE.Material, C: JungleCut, opts: { shadeBelow?: boolean } = {}): THREE.Material {
  const base = mat.onBeforeCompile.bind(mat);
  const baseKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${baseKey()}-jungle-cut${opts.shadeBelow ? "-ao" : ""}`;
  mat.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    shader.uniforms.uJKid = C.uJKid;
    shader.uniforms.uJCam = C.uJCam;
    shader.uniforms.uJR = C.uJR;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vJW;").replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      {
        vec4 jw = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          jw = instanceMatrix * jw;
        #endif
        vJW = ( modelMatrix * jw ).xyz;
      }`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vJW;\nuniform vec3 uJKid; uniform vec3 uJCam; uniform vec3 uJR;")
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>\n${JUNGLE_CUT_GLSL}`);
  };
  mat.needsUpdate = true;
  return mat;
}
