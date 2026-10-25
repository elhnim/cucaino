// A see-through cut in the forest canopy between the camera and the kid: from the diorama's high
// camera the dense woods would otherwise hide the kid whenever they wander in. Leaf fragments
// inside a cylinder round the kid -> camera line are dithered away (an ordered, pixel-art style
// dissolve), so the kid always shows through a little window in the trees. Layered on top of the
// fantasy kit's fxPatch (wind sway + instance tint). Shadows are unaffected (a proxy casts them).
import * as THREE from "three";

export interface CutawayUniforms {
  uCutKid: { value: THREE.Vector3 };
  uCutCam: { value: THREE.Vector3 };
  /** window radius (m); 0 turns the cut off */
  uCutR: { value: number };
}

export function makeCutaway(): CutawayUniforms {
  return { uCutKid: { value: new THREE.Vector3(0, -1e4, 0) }, uCutCam: { value: new THREE.Vector3(0, -1e4, 0) }, uCutR: { value: 3.4 } };
}

/** add the cut to a material already patched by fxPatch (keeps its onBeforeCompile) */
export function addCutaway(mat: THREE.Material, C: CutawayUniforms): THREE.Material {
  const base = mat.onBeforeCompile.bind(mat);
  const baseKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${baseKey()}-storybook-cut`;
  mat.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    shader.uniforms.uCutKid = C.uCutKid;
    shader.uniforms.uCutCam = C.uCutCam;
    shader.uniforms.uCutR = C.uCutR;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vCutW;").replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      {
        vec4 cw = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          cw = instanceMatrix * cw;
        #endif
        vCutW = ( modelMatrix * cw ).xyz;
      }`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCutW;\nuniform vec3 uCutKid; uniform vec3 uCutCam; uniform float uCutR;")
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        if ( uCutR > 0.0 ) {
          vec3 ab = uCutCam - uCutKid;
          float h = clamp( dot( vCutW - uCutKid, ab ) / max( dot( ab, ab ), 1e-4 ), 0.0, 1.0 );
          float d = length( vCutW - uCutKid - ab * h );
          // the window opens just above the kid's head and stays open up to the camera
          float r = uCutR * smoothstep( 0.0, 0.06, h );
          float ign = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
          // a clean-edged window (a dithered edge read as a fuzzy hoop round the kid)
          if ( vCutW.y > uCutKid.y + 1.6 && d < r ) discard;
          ign += 0.0;
        }`,
      );
  };
  mat.needsUpdate = true;
  return mat;
}
