// Shader plumbing for the Midnight Rift.
//
// Vertex layout (the fantasy kit's, ../fantasy/geo.ts, plus one attribute):
//   position, normal, color, aFx = [tint weight, motion amplitude, glow], aK = [motion kind, param]
// Everything is drawn through BatchedMeshes (one draw call each). Per instance: the batch colour's
// rgb = tint (applied where aFx.x says so), alpha = the creature's own animation phase (radians,
// accumulated on the CPU and wrapped at 4 PI, so swim/flap rates don't depend on speed).
//
// Motion kinds (aK.x; param = aK.y):
//   0 none            1 sway (tube worms, sea pens: the current rocks them)
//   2 swim   body wave from nose (+z) to tail: x += sin(ph - z * param) * amp
//   3 flap   fins / ear-fins / flippers: y += sin(2 ph - |x| * param) * amp
//   4 trail  trailing arms and tentacles: they undulate along their length (z)
//   5 pulse  bells and umbrellas open and close (radial)
//   6 bob    a lure bobbing on its stalk
//   7 legs   little legs patter (crawlers)
//   8 jaw    a goblin shark's jaw shoots out now and then (z += amp)
//   9 reach  an octopus arm (along +z): curls and uncurls; param = arm length
//
// abyssMaterial: lit (MeshStandardMaterial), dimmed with depth, with a cold rim light, a soft
// "film" self-light, glowing parts (emissive = vertex colour x aFx.z x uGlowK — over 1 blooms),
// and the kid's "lantern": a soft light round the kid so whatever comes close shows its colours
// even at the very bottom. Fragments beyond the fog are discarded (no ghost ink outlines).
// glassMaterial: additive, fresnel-edged see-through bodies (comb jellies with their rainbow
// comb rows, siphonophores, the barreleye's clear head).
// plumeMaterial: the black smokers' billowing, shimmering plumes.
import * as THREE from "three";

export interface AbyssUniforms {
  uTime: { value: number };
  /** the kid's lantern: position and strength (0 above ~20 m) */
  uKid: { value: THREE.Vector3 };
  uLamp: { value: number };
  /** emissive multiplier for glowing parts */
  uGlowK: { value: number };
  /** 0..1: looking down into the rift fades into this dark "void" instead of the fog colour */
  uVoid: { value: number };
  uVoidCol: { value: THREE.Color };
}

export function makeAbyssUniforms(): AbyssUniforms {
  return { uTime: { value: 0 }, uKid: { value: new THREE.Vector3() }, uLamp: { value: 0 }, uGlowK: { value: 1.2 }, uVoid: { value: 0 }, uVoidCol: { value: new THREE.Color("#040a1e") } };
}

/** how much of the void colour a view direction (normalised, y component) gets (GLSL) */
export const VOID_GLSL = /* glsl */ `
float abVoidK( float dirY, float uVoid ) { return uVoid * smoothstep( -0.12, -0.7, dirY ); }
`;

/** the fog, but fading into the dark void below when you look down into the rift */
const FOG_GLSL = /* glsl */ `
#ifdef USE_FOG
  {
    // glowing bits carry further than the fog (points of light down in the dark)
    float abGlowVis = step( 0.5, vAbGlow ) * ( 1.0 - smoothstep( fogFar * 0.7, fogFar * 1.9, vFogDepth ) );
    if ( vFogDepth > fogFar && abGlowVis <= 0.0 ) discard;
    vec3 abDir = normalize( vAbW - cameraPosition );
    float abV = abVoidK( abDir.y, uVoid );
    float abF = smoothstep( fogNear, fogFar, vFogDepth );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( fogColor, uVoidCol, abV ), abF );
    gl_FragColor.rgb += abEmit * abGlowVis * abF * 0.9;
  }
#endif
`;

export const K_NONE = 0;
export const K_SWAY = 1;
export const K_SWIM = 2;
export const K_FLAP = 3;
export const K_TRAIL = 4;
export const K_PULSE = 5;
export const K_BOB = 6;
export const K_LEGS = 7;
export const K_JAW = 8;
export const K_REACH = 9;

/** the motion code (needs: transformed, position, aFx, aK, abPh, abOrg, uTime) */
const MOTION_GLSL = /* glsl */ `
{
  float kd = aK.x;
  float kp = aK.y;
  float amp = aFx.y;
  if ( kd > 0.5 && kd < 1.5 ) {
    float sw = uTime * 0.9 + abOrg.x * 0.13 + abOrg.z * 0.21 + kp;
    transformed.x += sin( sw + position.y * 0.8 ) * amp;
    transformed.z += cos( sw * 0.8 + position.y * 0.6 ) * amp * 0.7;
  } else if ( kd < 2.5 ) {
    transformed.x += sin( abPh - position.z * kp ) * amp;
  } else if ( kd < 3.5 ) {
    transformed.y += sin( abPh * 2.0 - abs( position.x ) * kp ) * amp;
  } else if ( kd < 4.5 ) {
    transformed.x += sin( abPh + position.z * kp ) * amp;
    transformed.y += cos( abPh + position.z * kp * 0.8 ) * amp * 0.6;
  } else if ( kd < 5.5 ) {
    float k = 1.0 + sin( abPh ) * amp;
    transformed.xz *= k;
    transformed.y -= sin( abPh ) * amp * 0.5 * length( position.xz );
  } else if ( kd < 6.5 ) {
    transformed.y += sin( abPh * 2.0 ) * amp;
    transformed.x += sin( abPh ) * amp * 0.5;
  } else if ( kd < 7.5 ) {
    transformed.y += abs( sin( abPh * 3.0 + position.x * 9.0 + position.z * 7.0 ) ) * amp;
  } else if ( kd < 8.5 ) {
    transformed.z += smoothstep( 0.55, 1.0, sin( abPh * 0.5 ) ) * amp;
  } else if ( kd < 9.5 ) {
    // an arm along +z from its root: curls up at the tip and waves (amp grows towards the tip)
    float t = clamp( position.z / max( 0.1, kp ), 0.0, 1.0 );
    float c = sin( abPh + t * 4.0 ) * amp;
    float a = c * t * 2.2;
    float zz = transformed.z;
    transformed.z = zz * cos( a * 0.6 ) - transformed.y * sin( a * 0.6 );
    transformed.y = transformed.y + zz * sin( a * 0.6 ) + sin( abPh * 0.5 + t * 3.0 ) * amp * t * 1.5;
    transformed.x += cos( abPh + t * 5.0 ) * amp * t;
  }
}
`;

const HEAD_GLSL = /* glsl */ `
attribute vec3 aFx;
attribute vec2 aK;
uniform float uTime;
varying vec3 vAbW;
varying vec3 vAbLocal;
varying float vAbGlow;
varying float vAbFx;
`;

/** colour + phase from the batch (replaces <color_vertex>) */
const COLOR_GLSL = /* glsl */ `
float abPh = 0.0;
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
  vColor = vec4( 1.0 );
  #ifdef USE_COLOR
    vColor.rgb *= color.rgb;
  #endif
  #ifdef USE_BATCHING_COLOR
    {
      vec4 abBc = getBatchingColor( getIndirectIndex( gl_DrawID ) );
      vColor.rgb *= mix( vec3( 1.0 ), abBc.rgb, aFx.x );
      abPh = abBc.a;
    }
  #endif
#endif
`;

const BEGIN_GLSL = /* glsl */ `
#include <begin_vertex>
{
  #ifdef USE_BATCHING
    vec3 abOrg = batchingMatrix[3].xyz;
  #else
    vec3 abOrg = vec3( 0.0 );
  #endif
  ${MOTION_GLSL}
  vAbLocal = position;
  vAbFx = aFx.x;
  vAbGlow = aFx.z * ( 0.82 + 0.18 * sin( uTime * 2.1 + abOrg.x * 0.7 + abOrg.z * 0.3 + position.y * 1.3 ) );
  vec4 abW = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    abW = batchingMatrix * abW;
  #endif
  abW = modelMatrix * abW;
  vAbW = abW.xyz;
}
`;

export interface AbyssMatOptions {
  /** faceted shading (rock) */
  flat?: boolean;
  /** fresnel rim strength */
  rim?: number;
  /** self-light (fraction of albedo) */
  lift?: number;
}

export function abyssMaterial(AU: AbyssUniforms, o: AbyssMatOptions = {}, params: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, flatShading: !!o.flat, ...params });
  const rim = (o.rim ?? 0.4).toFixed(3);
  const lift = (o.lift ?? 0.1).toFixed(3);
  mat.customProgramCacheKey = () => `abyss-${o.flat ? 1 : 0}-${rim}-${lift}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = AU.uTime;
    shader.uniforms.uKid = AU.uKid;
    shader.uniforms.uLamp = AU.uLamp;
    shader.uniforms.uGlowK = AU.uGlowK;
    shader.uniforms.uVoid = AU.uVoid;
    shader.uniforms.uVoidCol = AU.uVoidCol;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${HEAD_GLSL}`)
      .replace("#include <color_vertex>", COLOR_GLSL)
      .replace("#include <begin_vertex>", BEGIN_GLSL);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime; uniform vec3 uKid; uniform float uLamp; uniform float uGlowK; uniform float uVoid; uniform vec3 uVoidCol;
        varying vec3 vAbW; varying vec3 vAbLocal; varying float vAbGlow; varying float vAbFx;
        ${VOID_GLSL}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          // the deep blues everything: reds fade first
          float deep = smoothstep( -20.0, -100.0, vAbW.y );
          diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.72, 0.84, 1.0 ), deep );
        }`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        vec3 abEmit = diffuseColor.rgb * vAbGlow * uGlowK;
        totalEmissiveRadiance += abEmit;`,
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
        {
          // the sunlight hardly reaches down here
          float dk = mix( 1.0, 0.42, smoothstep( -24.0, -105.0, vAbW.y ) );
          reflectedLight.directDiffuse *= dk;
          reflectedLight.directSpecular *= dk * 0.5;
          reflectedLight.indirectDiffuse *= mix( 1.0, 0.7, 1.0 - dk );
          // a cold blue fill so shadowed sides are never pitch black
          reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3( 0.05, 0.09, 0.16 );
          // "film light": colours stay readable
          reflectedLight.indirectDiffuse += diffuseColor.rgb * ${lift};
          // the kid's lantern
          vec3 abL = uKid - vAbW;
          float abD = length( abL );
          vec3 abLv = normalize( ( viewMatrix * vec4( abL, 0.0 ) ).xyz );
          float abWrap = 0.35 + 0.65 * saturate( dot( geometryNormal, abLv ) );
          float abAtt = uLamp / ( 1.0 + abD * abD / 90.0 );
          reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3( 0.8, 0.95, 1.0 ) * abWrap * abAtt * 0.85;
          // a cold rim picks silhouettes out of the dark
          float abFr = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 3.0 );
          reflectedLight.indirectDiffuse += mix( vec3( 0.35, 0.6, 1.0 ), diffuseColor.rgb + 0.2, 0.3 ) * abFr * ${rim} * ( 0.45 + abAtt * 0.8 );
        }`,
      )
      .replace("#include <fog_fragment>", FOG_GLSL);
  };
  return mat;
}

/** see-through glowing bodies (additive): comb jellies, siphonophores, the barreleye's head */
export function glassMaterial(AU: AbyssUniforms): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  mat.customProgramCacheKey = () => "abyss-glass";
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = AU.uTime;
    shader.uniforms.uGlowK = AU.uGlowK;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${HEAD_GLSL}\nvarying vec3 vAbN;`)
      .replace("#include <color_vertex>", COLOR_GLSL)
      .replace(
        "#include <begin_vertex>",
        `${BEGIN_GLSL}
        {
          mat3 abM = mat3( modelMatrix );
          #ifdef USE_BATCHING
            abM = abM * mat3( batchingMatrix );
          #endif
          vAbN = normalize( abM * normal );
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime; uniform float uGlowK;
        varying vec3 vAbW; varying vec3 vAbLocal; varying float vAbGlow; varying float vAbFx; varying vec3 vAbN;
        vec3 abHue( float h ) { return clamp( abs( fract( h + vec3( 0.0, 0.667, 0.333 ) ) * 6.0 - 3.0 ) - 1.0, 0.0, 1.0 ); }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          vec3 V = normalize( cameraPosition - vAbW );
          float fr = pow( 1.0 - abs( dot( normalize( vAbN ), V ) ), 2.0 );
          vec3 c = diffuseColor.rgb * ( 0.12 + fr * 0.9 );
          // comb rows: 8 meridians of beating cilia scattering rainbow light (vAbGlow > 1.5)
          if ( vAbGlow > 1.5 ) {
            float ang = atan( vAbLocal.x, vAbLocal.z );
            float row = smoothstep( 0.75, 0.97, cos( ang * 8.0 ) );
            vec3 rb = abHue( vAbLocal.y * 2.2 - uTime * 0.9 + ang * 0.3 );
            c += rb * row * ( 0.55 + 0.45 * sin( vAbLocal.y * 30.0 - uTime * 9.0 ) ) * 0.9;
          } else {
            c += diffuseColor.rgb * vAbGlow * uGlowK * 0.5;
          }
          diffuseColor.rgb = c;
        }`,
      )
      .replace(
        "#include <fog_fragment>",
        `#ifdef USE_FOG
          gl_FragColor.rgb *= 1.0 - smoothstep( fogNear, fogFar, vFogDepth );
        #endif`,
      );
  };
  return mat;
}

/**
 * The black smokers' plumes: billowing columns rising from the chimneys, glowing orange at the
 * mouth, shimmering with heat, fading upward. Attribute aP = (height fraction 0..1, angle, seed).
 */
export function plumeMaterial(AU: AbyssUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: AU.uTime },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec3 aP; uniform float uTime;
      varying vec3 vP; varying vec3 vN; varying vec3 vW;
      void main() {
        vec3 p = position;
        float h = aP.x;
        // the plume drifts and wobbles as it rises
        p.x += sin( uTime * 0.7 + h * 5.0 + aP.z * 6.0 ) * h * h * 1.6;
        p.z += cos( uTime * 0.6 + h * 4.0 + aP.z * 3.0 ) * h * h * 1.2;
        vP = aP;
        vN = normalize( normal );
        vec4 w = modelMatrix * vec4( p, 1.0 );
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      varying vec3 vP; varying vec3 vN; varying vec3 vW;
      float h3( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
      float n3( vec3 p ) {
        vec3 i = floor( p ); vec3 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( mix( h3( i ), h3( i + vec3( 1, 0, 0 ) ), f.x ), mix( h3( i + vec3( 0, 1, 0 ) ), h3( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
                    mix( mix( h3( i + vec3( 0, 0, 1 ) ), h3( i + vec3( 1, 0, 1 ) ), f.x ), mix( h3( i + vec3( 0, 1, 1 ) ), h3( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
      }
      void main() {
        float h = vP.x;
        vec3 q = vec3( cos( vP.y ) * 1.5, h * 7.0 - uTime * 1.1, sin( vP.y ) * 1.5 + vP.z * 10.0 );
        float billow = n3( q ) * 0.6 + n3( q * 2.3 + 4.0 ) * 0.4;
        float a = smoothstep( 0.3, 0.75, billow ) * ( 1.0 - smoothstep( 0.55, 1.0, h ) ) * smoothstep( 0.0, 0.04, h );
        vec3 V = normalize( cameraPosition - vW );
        // (soft edges: the column fades out towards its silhouette)
        float side = pow( abs( dot( normalize( vN ), V ) ), 1.6 );
        // smoky grey-blue, glowing orange-red at the mouth, heat shimmer bands near the base
        vec3 smoke = mix( vec3( 0.03, 0.035, 0.05 ), vec3( 0.13, 0.14, 0.18 ), billow );
        vec3 hot = vec3( 1.6, 0.55, 0.12 ) * ( 1.0 - smoothstep( 0.0, 0.16, h ) );
        float shimmer = ( 0.5 + 0.5 * sin( h * 60.0 - uTime * 7.0 + vP.y * 3.0 ) ) * ( 1.0 - smoothstep( 0.03, 0.22, h ) ) * 0.3;
        vec3 c = smoke + hot + vec3( 1.0, 0.7, 0.4 ) * shimmer;
        float fogK = 0.0;
        #ifdef USE_FOG
          fogK = smoothstep( fogNear, fogFar, vFogDepth );
        #endif
        gl_FragColor = vec4( c, a * side * 0.55 * ( 1.0 - fogK ) );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
