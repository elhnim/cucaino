// Shader plumbing for the underwater world.
//
// `uwMaterial()` upgrades a MeshStandardMaterial with everything that sells "under the sea":
//   - dancing caustics on up-facing surfaces (a tileable caustic texture sampled twice)
//   - colour absorption with depth (reds fade first, so the deep reef turns blue-violet)
//   - a soft blue "scatter" fill so shadowed sides never go black
//   - glow: emissive = vertex colour x aFx.z x instance glow x uGlowK (> 1 blooms at twilight)
//   - optional "film light" for creatures: a soft self-light (`lift`) and a teal-white fresnel rim
//     (`rim`) so whales, orcas, mantas and fish show their colours against the blue, never as
//     silhouettes
//   - optional per-instance culling (`cull`): under water, an instance wholly inside the fog (or,
//     with `cullNear`, right at the camera) is dropped in the vertex shader — so nothing is drawn as
//     a fog-coloured ghost with an ink outline, and a coral head never fills the screen
// and one of several vertex motions:
//   "sway"  the swell rocks coral / sea grass / kelp (amplitude per vertex in aFx.y)
//   "flap"  wings/flippers/flukes: y += sin(phase) * aFx.y (mantas, turtles, orcas, birds)
//   "fish"  a swimming tail wiggle + procedural species patterns (clownfish bands, tang colours...)
//   "scuttle" crabs: the whole body slides sideways and back while the legs (aFx.y) patter
// plus `peek` (octopus, eels): the whole thing slowly rises out of its hole, looks about, sinks back
// Vertex layout is the fantasy kit's (position, normal, color, aFx = tint/motion/glow) plus an
// optional per-instance `aInst` (x = glow or flap strength, y = phase).
import * as THREE from "three";
import { TERRAIN_X0, TERRAIN_Z0, WATER_Y, terrainCoverGrid } from "../../registry/terrain";
import { causticField } from "./plan";

export interface UwUniforms {
  uTime: { value: number };
  uGlow: { value: number };
  /** emissive multiplier for glowing parts */
  uGlowK: { value: number };
  /** caustic strength (sunny day ~1, twilight ~0.3) */
  uCausticK: { value: number };
  uCausticTex: { value: THREE.Texture | null };
}

export function makeUwUniforms(): UwUniforms {
  return { uTime: { value: 0 }, uGlow: { value: 0 }, uGlowK: { value: 0.5 }, uCausticK: { value: 1 }, uCausticTex: { value: null } };
}

export function makeCausticTexture(): THREE.DataTexture {
  const n = 128;
  const tex = new THREE.DataTexture(causticField(n, 6, 4242), n, n, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export const WATER_Y_GLSL = WATER_Y.toFixed(3);

/** caustics at world xz (0..~1.4), time-animated; needs uniforms uTime, uCausticTex */
export const CAUSTIC_GLSL = /* glsl */ `
float uwCaustic( vec2 p ) {
  vec2 a = p * 0.083 + vec2( uTime * 0.021, uTime * 0.014 );
  vec2 b = mat2( 0.8, -0.6, 0.6, 0.8 ) * p * 0.067 + vec2( -uTime * 0.016, uTime * 0.023 );
  float c1 = texture2D( uCausticTex, a ).r;
  float c2 = texture2D( uCausticTex, b + c1 * 0.035 ).r;
  return pow( min( c1, c2 ), 1.25 ) * 2.2 + max( c1, c2 ) * 0.08;
}
`;

export type UwMotion = "none" | "sway" | "flap" | "fish" | "scuttle";
export interface UwMatOptions {
  motion: UwMotion;
  /** has the per-instance aInst attribute */
  inst?: boolean;
  /** caustics + depth absorption (off for things in the sky) */
  sea?: boolean;
  /** flap: phase speed (rad/s), and phase change per unit along the wing (|x|) or body (z) */
  flapSpeed?: number;
  flapWave?: number;
  flapAxis?: "x" | "z";
  /** extra pattern: brain-coral grooves, sea-fan lace (discard), orca markings (aMark attr),
   *  whale skin (aWh attr: pleats, mouth line, blowholes, mottling), rippled deep-sea sand */
  pattern?: "brain" | "lace" | "orca" | "blue" | "humpback" | "sand";
  /** fresnel rim strength (creatures: ~0.5-1) */
  rim?: number;
  /** self-light (fraction of the albedo added as light) so colours read in the blue */
  lift?: number;
  /** cull instances wholly in the fog, under water; value = instance radius / its x scale */
  cull?: number;
  /** also cull instances within 1.6 m + cullNear x scale of the camera (coral, sea grass) */
  cullNear?: number;
  /** the item's height in local units, for the near cull (default 1.4) */
  cullHeight?: number;
  /** rise out of a hole and sink back now and then (octopus, eels) */
  peek?: boolean;
}

/** where the island's ground is drawn (one texel per terrain tile), so the deep sandy plain can
 *  leave those places to it */
let coverTex: THREE.DataTexture | null = null;
const coverSpan = { x: 1, z: 1 };
function terrainCoverTexture(): THREE.DataTexture {
  if (coverTex) return coverTex;
  const g = terrainCoverGrid();
  const data = new Uint8Array(g.nx * g.nz);
  for (let k = 0; k < data.length; k++) data[k] = g.data[k] ? 255 : 0;
  coverTex = new THREE.DataTexture(data, g.nx, g.nz, THREE.RedFormat, THREE.UnsignedByteType);
  coverTex.minFilter = coverTex.magFilter = THREE.NearestFilter;
  coverTex.wrapS = coverTex.wrapT = THREE.ClampToEdgeWrapping;
  coverTex.needsUpdate = true;
  coverSpan.x = g.nx * g.size;
  coverSpan.z = g.nz * g.size;
  return coverTex;
}

export function uwMaterial(U: UwUniforms, o: UwMatOptions, params: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, ...params });
  const sea = o.sea !== false;
  const key = `uw-${o.motion}-${o.inst ? 1 : 0}-${sea ? 1 : 0}-${o.flapAxis ?? "x"}-${o.pattern ?? ""}-${o.rim ?? ""}-${o.lift ?? ""}-${o.cull ?? ""}-${o.cullNear ?? ""}-${o.cullHeight ?? ""}-${o.peek ? 1 : 0}`;
  const flap = { uFlapSpeed: { value: o.flapSpeed ?? 2 }, uFlapWave: { value: o.flapWave ?? 0.8 } };
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uGlowK = U.uGlowK;
    shader.uniforms.uGlow = U.uGlow;
    shader.uniforms.uCausticK = U.uCausticK;
    shader.uniforms.uCausticTex = U.uCausticTex;
    shader.uniforms.uFlapSpeed = flap.uFlapSpeed;
    shader.uniforms.uFlapWave = flap.uFlapWave;
    if (o.pattern === "sand") {
      shader.uniforms.uTerrCover = { value: terrainCoverTexture() };
      shader.uniforms.uTerrCoverRect = { value: new THREE.Vector4(TERRAIN_X0, TERRAIN_Z0, coverSpan.x, coverSpan.z) };
    }
    const defs = [
      o.inst ? "#define UW_INST" : "",
      sea ? "#define UW_SEA" : "",
      `#define UW_${o.motion.toUpperCase()}`,
      o.flapAxis === "z" ? "#define UW_FLAP_Z" : "",
      o.pattern ? `#define UW_PAT_${o.pattern.toUpperCase()}` : "",
      o.pattern === "blue" || o.pattern === "humpback" ? "#define UW_PAT_WHALE" : "",
      o.rim ? `#define UW_RIM ${o.rim.toFixed(3)}` : "",
      o.lift ? `#define UW_LIFT ${o.lift.toFixed(3)}` : "",
      o.cull && o.inst ? `#define UW_CULL ${o.cull.toFixed(3)}` : "",
      o.cullNear && o.inst ? `#define UW_CULL_NEAR ${o.cullNear.toFixed(3)}\n#define UW_CULL_H ${(o.cullHeight ?? 1.4).toFixed(3)}` : "",
      o.peek ? "#define UW_PEEK" : "",
    ].join("\n");
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `${defs}
        #include <common>
        attribute vec3 aFx;
        #ifdef UW_INST
          attribute vec2 aInst;
        #endif
        #ifdef UW_PAT_ORCA
          attribute vec2 aMark; varying vec2 vMark;
        #endif
        #ifdef UW_PAT_WHALE
          attribute vec3 aWh; varying vec3 vWh;
        #endif
        #if defined( UW_CULL ) && defined( USE_FOG ) && !defined( FOG_EXP2 )
          uniform float fogNear; uniform float fogFar;
        #endif
        uniform float uTime; uniform float uFlapSpeed; uniform float uFlapWave;
        varying vec3 vUwWorld; varying float vUwUp; varying float vUwGlow; varying vec3 vUwLocal; varying float vUwFin; varying float vUwSp; varying float vUwPh;`,
      )
      .replace(
        "#include <color_vertex>",
        `#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          vColor = vec4( 1.0 );
          #ifdef USE_COLOR
            vColor.rgb *= color.rgb;
          #endif
          #ifdef USE_INSTANCING_COLOR
            #ifdef UW_FISH
              vColor.rgb *= instanceColor.rgb;
            #else
              vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, aFx.x );
            #endif
          #endif
        #endif`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float uwCull = 0.0;
        {
          #ifdef USE_INSTANCING
            vec3 uwOrg = instanceMatrix[3].xyz;
          #else
            vec3 uwOrg = vec3( 0.0 );
          #endif
          #ifdef UW_INST
            vec2 uwI = aInst;
          #else
            vec2 uwI = vec2( 1.0, 0.0 );
          #endif
          // moving creatures keep their own phase (else swimming would change the flap rate)
          #if defined( UW_INST ) && ( defined( UW_FLAP ) || defined( UW_FISH ) )
            float uwPh = uwI.y;
          #else
            float uwPh = uwI.y + uwOrg.x * 0.31 + uwOrg.z * 0.17;
          #endif
          vUwLocal = position;
          vUwFin = aFx.x;
          vUwSp = 0.0;
          vUwPh = uwPh;
          #ifdef UW_SWAY
            // the swell: a slow surge back and forth plus a quicker flutter; aFx.y = amplitude
            float sw = uTime * 0.85 + uwOrg.x * 0.045 + uwOrg.z * 0.06;
            vec3 surge = vec3( sin( sw ), 0.0, cos( sw * 0.8 + 1.3 ) * 0.7 ) * 0.8;
            vec3 flut = vec3( sin( uTime * 2.3 + position.y * 2.1 + uwPh ), 0.0, cos( uTime * 1.9 + position.y * 1.7 + uwPh * 1.3 ) ) * 0.3;
            transformed += ( surge + flut ) * aFx.y;
          #endif
          #ifdef UW_PEEK
            // rise out of the hole, look about for a while, sink back (a slow cycle per instance);
            // the hole's rim (untinted: aFx.x < 0.5) stays put
            {
              float cyc = fract( uTime * 0.045 + uwPh * 0.137 );
              float outK = smoothstep( 0.05, 0.2, cyc ) * ( 1.0 - smoothstep( 0.7, 0.86, cyc ) );
              float body = step( 0.5, aFx.x );
              transformed.y -= body * ( 1.0 - outK ) * 0.9 * ( 0.35 + max( 0.0, position.y ) );
              transformed.xz *= mix( 1.0, 0.5 + 0.5 * outK, body );
            }
          #endif
          #ifdef UW_SCUTTLE
            {
              // slide sideways a little way and back, pausing at each end; legs patter while moving
              float sc = sin( uTime * 0.5 + uwPh );
              float go = cos( uTime * 0.5 + uwPh );
              transformed.x += clamp( sc * 1.4, -1.0, 1.0 ) * 0.7;
              float moving = smoothstep( 0.2, 0.6, abs( go ) );
              transformed.y += abs( sin( uTime * 11.0 + position.x * 9.0 + position.z * 5.0 ) ) * aFx.y * moving;
            }
          #endif
          #ifdef UW_FLAP
            #ifdef UW_FLAP_Z
              float fa = -position.z;
            #else
              float fa = abs( position.x );
            #endif
            transformed.y += sin( uTime * uFlapSpeed + uwPh - fa * uFlapWave ) * aFx.y * uwI.x;
          #endif
          #ifdef UW_FISH
            // aInst.x = species (integer part) + 0.5 + wiggle strength (fraction), aInst.y = swim phase (accumulated on the CPU)
            vUwSp = floor( uwI.x );
            float strength = fract( uwI.x );
            float tail = smoothstep( 0.2, -0.55, position.z );
            float wig = sin( uwI.y - position.z * 6.5 );
            transformed.x += wig * ( 0.015 + 0.11 * tail * tail ) * ( 0.4 + strength * 1.2 );
            // pectoral fins flutter
            transformed.y += aFx.y * sin( uwI.y * 1.7 + 1.0 ) * 0.03;
          #endif
          vec4 uwW = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            uwW = instanceMatrix * uwW;
          #endif
          uwW = modelMatrix * uwW;
          vUwWorld = uwW.xyz;
          vec3 uwN = objectNormal;
          #ifdef USE_INSTANCING
            uwN = mat3( instanceMatrix ) * uwN;
          #endif
          vUwUp = normalize( mat3( modelMatrix ) * uwN ).y;
          #ifdef UW_FISH
            vUwGlow = 0.0;
          #else
            vUwGlow = aFx.z * ( 1.0 + 0.35 * sin( uTime * 1.6 + uwPh * 2.0 + position.y ) );
            #ifdef UW_INST
              #ifndef UW_FLAP
                vUwGlow *= uwI.x;
              #endif
            #endif
          #endif
          #ifdef UW_PAT_ORCA
            vMark = aMark;
          #endif
          #ifdef UW_PAT_WHALE
            vWh = aWh;
          #endif
          #ifdef UW_CULL
            if ( cameraPosition.y < ${WATER_Y_GLSL} - 0.05 ) {
              vec3 uwO = ( modelMatrix * vec4( uwOrg, 1.0 ) ).xyz;
              float uwSc = length( instanceMatrix[0].xyz );
              float uwD = distance( cameraPosition, uwO );
              #if defined( USE_FOG ) && !defined( FOG_EXP2 )
                if ( uwD - UW_CULL * uwSc > fogNear + ( fogFar - fogNear ) * 0.96 ) uwCull = 1.0;
              #endif
              #ifdef UW_CULL_NEAR
                // (to the nearest point of the item's upright extent: a tall thicket's top can be
                // right at the camera while its foot is far below)
                vec3 uwNp = vec3( uwO.x, clamp( cameraPosition.y, uwO.y, uwO.y + UW_CULL_H * length( instanceMatrix[1].xyz ) ), uwO.z );
                if ( distance( cameraPosition, uwNp ) < 1.6 + UW_CULL_NEAR * uwSc ) uwCull = 1.0;
              #endif
            }
          #endif
        }`,
      )
      .replace(
        "#include <fog_vertex>",
        `#include <fog_vertex>
        #ifdef UW_CULL
          if ( uwCull > 0.5 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `${defs}
        #include <common>
        uniform float uTime; uniform float uGlowK; uniform float uGlow; uniform float uCausticK; uniform sampler2D uCausticTex;
        #ifdef UW_PAT_SAND
          uniform sampler2D uTerrCover; uniform vec4 uTerrCoverRect;
        #endif
        varying vec3 vUwWorld; varying float vUwUp; varying float vUwGlow; varying vec3 vUwLocal; varying float vUwFin; varying float vUwSp; varying float vUwPh;
        #ifdef UW_PAT_ORCA
          varying vec2 vMark;
        #endif
        #ifdef UW_PAT_WHALE
          varying vec3 vWh;
        #endif
        ${CAUSTIC_GLSL}
        float uwHash( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
        float uwNoise( vec3 p ) {
          vec3 i = floor( p ); vec3 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( mix( uwHash( i ), uwHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( uwHash( i + vec3( 0, 1, 0 ) ), uwHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
                      mix( mix( uwHash( i + vec3( 0, 0, 1 ) ), uwHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( uwHash( i + vec3( 0, 1, 1 ) ), uwHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
        }
        #ifdef UW_FISH
        vec3 fishColor( float sp, vec3 p ) {
          float z = p.z; float y = p.y; float fin = vUwFin;
          vec3 c = vec3( 1.0 );
          if ( sp < 0.5 ) {
            // clownfish: orange with three white bands edged in black
            c = vec3( 1.0, 0.42, 0.06 );
            float b1 = abs( z - 0.27 ) - 0.055; float b2 = abs( z - 0.0 + y * 0.25 ) - 0.07; float b3 = abs( z + 0.36 ) - 0.03;
            float b = min( b1, min( b2, b3 ) );
            c = mix( c, vec3( 0.03 ), smoothstep( 0.02, 0.008, b ) );
            c = mix( c, vec3( 1.0 ), smoothstep( 0.004, -0.004, b ) );
            if ( fin > 0.5 ) c = mix( vec3( 1.0, 0.42, 0.06 ), vec3( 0.03 ), smoothstep( 0.0, 0.03, length( p.yz * vec2( 1.0, 0.5 ) ) - 0.14 ) );
          } else if ( sp < 1.5 ) {
            // blue tang: royal blue, a black "palette" swoosh, a yellow tail
            c = vec3( 0.08, 0.3, 1.0 );
            float sw = abs( y - 0.07 + ( z - 0.05 ) * ( z - 0.05 ) * 1.4 ) - 0.03 * smoothstep( 0.4, 0.0, abs( z - 0.02 ) );
            c = mix( c, vec3( 0.02, 0.03, 0.12 ), smoothstep( 0.012, 0.0, sw ) * step( -0.33, z ) * step( z, 0.33 ) );
            c = mix( c, vec3( 1.0, 0.85, 0.08 ), smoothstep( -0.42, -0.46, z ) );
            if ( fin > 0.5 && z > -0.45 ) c = mix( c, vec3( 0.02, 0.05, 0.25 ), 0.5 );
          } else if ( sp < 2.5 ) {
            // yellow tang: bright lemon, a white spine by the tail
            c = vec3( 1.0, 0.86, 0.1 ) * ( 0.92 + 0.08 * smoothstep( -0.1, 0.1, -y ) );
            c = mix( c, vec3( 1.0 ), smoothstep( 0.03, 0.0, length( vec2( z + 0.36, y * 1.6 ) ) - 0.02 ) );
          } else if ( sp < 3.5 ) {
            // purple anthias: magenta fading to orange, a golden streak under the eye
            c = mix( vec3( 0.78, 0.25, 1.0 ), vec3( 1.0, 0.45, 0.55 ), smoothstep( 0.05, -0.1, y ) );
            float st = abs( y + 0.02 + ( z - 0.3 ) * 0.5 ) - 0.012;
            c = mix( c, vec3( 1.0, 0.8, 0.2 ), smoothstep( 0.01, 0.0, st ) * step( 0.15, z ) );
            if ( fin > 0.5 ) c = mix( c, vec3( 1.0, 0.6, 0.9 ), 0.4 );
          } else if ( sp < 4.5 ) {
            // sardine: dark blue back, a blue line, bright silver sides and belly
            c = mix( vec3( 0.75, 0.84, 0.95 ), vec3( 0.1, 0.22, 0.45 ), smoothstep( 0.0, 0.06, y ) );
            c = mix( c, vec3( 0.2, 0.45, 0.9 ), smoothstep( 0.008, 0.0, abs( y - 0.005 ) - 0.006 ) );
            c = mix( c, vec3( 1.0 ), smoothstep( -0.02, -0.07, y ) * 0.6 );
          } else if ( sp < 5.5 ) {
            // parrotfish: turquoise with a pink scale net, a pink belly and a pale beak
            c = vec3( 0.1, 0.78, 0.66 );
            vec2 q = vec2( z * 22.0, y * 26.0 + z * 11.0 );
            float net = min( abs( fract( q.x + q.y * 0.5 ) - 0.5 ), abs( fract( q.x - q.y * 0.5 ) - 0.5 ) );
            c = mix( c, vec3( 1.0, 0.45, 0.65 ), smoothstep( 0.1, 0.03, net ) * 0.7 );
            c = mix( c, vec3( 1.0, 0.55, 0.7 ), smoothstep( -0.03, -0.1, y ) * 0.7 );
            c = mix( c, vec3( 0.95, 0.9, 0.7 ), smoothstep( 0.44, 0.48, z ) );
            if ( fin > 0.5 ) c = mix( vec3( 0.2, 0.5, 1.0 ), vec3( 1.0, 0.5, 0.8 ), 0.5 + 0.5 * sin( z * 40.0 ) );
          } else if ( sp < 6.5 ) {
            // grouper: warm brown with pale spots and darker saddles
            c = vec3( 0.52, 0.33, 0.22 );
            vec2 q = vec2( z * 16.0, y * 16.0 );
            vec2 cellQ = floor( q ); vec2 f = fract( q ) - 0.5;
            float h = fract( sin( dot( cellQ, vec2( 12.9, 78.2 ) ) ) * 43758.5 );
            c = mix( c, vec3( 0.9, 0.78, 0.55 ), smoothstep( 0.28, 0.18, length( f + ( h - 0.5 ) * 0.3 ) ) * 0.8 );
            c *= 0.8 + 0.2 * step( 0.0, sin( z * 14.0 ) );
          } else if ( sp < 7.5 ) {
            // butterflyfish: sunshine yellow, a white face crossed by a black eye bar, a black
            // "false eye" spot by the tail, fins edged in white
            c = vec3( 1.0, 0.82, 0.05 );
            c = mix( c, vec3( 1.0 ), smoothstep( 0.22, 0.28, z ) * 0.85 );
            c = mix( c, vec3( 0.02 ), smoothstep( 0.02, 0.0, abs( z - 0.34 + y * 0.35 ) - 0.03 ) );
            c = mix( c, vec3( 0.02 ), smoothstep( 0.012, 0.0, length( vec2( z + 0.3, y - 0.05 ) ) - 0.035 ) );
            if ( fin > 0.5 ) c = mix( vec3( 1.0, 0.8, 0.1 ), vec3( 1.0 ), smoothstep( 0.12, 0.2, abs( y ) ) );
          } else if ( sp < 8.5 ) {
            // emperor angelfish: electric blue with curving golden stripes, a golden tail and a
            // black mask edged in blue
            c = vec3( 0.06, 0.2, 0.85 );
            float st = sin( y * 42.0 + z * 14.0 + z * z * 20.0 );
            c = mix( c, vec3( 1.0, 0.86, 0.15 ), smoothstep( 0.35, 0.6, st ) * step( -0.42, z ) );
            c = mix( c, vec3( 1.0, 0.8, 0.1 ), smoothstep( -0.42, -0.47, z ) );
            float mask = smoothstep( 0.02, 0.0, abs( z - 0.34 ) - 0.04 ) * step( -0.02, y );
            c = mix( c, vec3( 0.02, 0.03, 0.1 ), mask );
            c = mix( c, vec3( 0.3, 0.7, 1.0 ), smoothstep( 0.012, 0.0, abs( abs( z - 0.34 ) - 0.045 ) ) * step( -0.02, y ) );
            if ( fin > 0.5 && z > -0.45 ) c = mix( c, vec3( 0.2, 0.55, 1.0 ), 0.6 );
          } else {
            // silver jack: blue-green back, mirror-bright sides, a yellow tail
            c = mix( vec3( 0.85, 0.92, 0.98 ), vec3( 0.12, 0.42, 0.62 ), smoothstep( 0.02, 0.1, y ) );
            c = mix( c, vec3( 1.0, 0.85, 0.2 ), smoothstep( -0.44, -0.5, z ) );
          }
          // eyes: dark pupil, golden ring, a white glint
          float e = length( vec2( z - 0.37, y - 0.035 ) );
          if ( fin < 0.5 && abs( p.x ) > 0.012 ) {
            c = mix( c, vec3( 1.0, 0.85, 0.35 ), smoothstep( 0.037, 0.03, e ) );
            c = mix( c, vec3( 0.01 ), smoothstep( 0.026, 0.02, e ) );
            c = mix( c, vec3( 1.0 ), smoothstep( 0.008, 0.004, length( vec2( z - 0.38, y - 0.045 ) ) ) );
          }
          return c;
        }
        #endif`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        #ifdef UW_FISH
          diffuseColor.rgb *= fishColor( vUwSp, vUwLocal );
        #endif
        #ifdef UW_PAT_BRAIN
          {
            // meandering grooves: ridged noise on the local surface
            float n = uwNoise( vUwLocal * 5.5 ) * 0.65 + uwNoise( vUwLocal * 11.0 + 3.0 ) * 0.35;
            float ridge = abs( n - 0.5 );
            diffuseColor.rgb *= mix( 0.45, 1.08, smoothstep( 0.015, 0.09, ridge ) );
          }
        #endif
        #ifdef UW_PAT_LACE
          {
            // a sea fan's lattice: branching veins in the fan's plane (local x, y); holes discarded
            vec2 q = vUwLocal.xy * vec2( 9.0, 9.0 );
            float a = abs( fract( q.x + sin( q.y * 1.3 ) * 0.35 ) - 0.5 );
            float b = abs( fract( q.y * 0.9 + q.x * 0.35 + sin( q.x * 1.7 ) * 0.2 ) - 0.5 );
            float vein = min( a, b );
            float r = length( vUwLocal.xy - vec2( 0.0, -0.05 ) );
            float rim = smoothstep( 0.86, 0.95, r + uwNoise( vUwLocal * 6.0 ) * 0.12 );
            // (the fan itself has tint weight 1.0; its stem 0.9 and is never cut)
            if ( vUwFin > 0.995 && ( vein > 0.1 || rim > 0.5 ) ) discard;
          }
        #endif
        #ifdef UW_PAT_ORCA
          {
            // crisp markings from signed fields: x = white (belly, eye patch, fluke undersides), y = grey saddle
            float w = smoothstep( -0.012, 0.012, vMark.x );
            float g = smoothstep( -0.02, 0.02, vMark.y ) * ( 1.0 - w );
            // (a glossy blue-black, not a hole in the picture)
            vec3 black = vec3( 0.05, 0.065, 0.1 );
            vec3 oc = mix( black, vec3( 0.55, 0.6, 0.68 ), g );
            oc = mix( oc, vec3( 1.0 ), w );
            diffuseColor.rgb = oc;
          }
        #endif
        #ifdef UW_PAT_WHALE
          {
            // (unit-length whale: nose at z = +0.5) s = 0 on the back .. 1 on the belly
            vec3 L = vUwLocal;
            float s = abs( vWh.x );
            float t = L.z + 0.5;
            // mottling: soft pale dapples (blue whale), a few white scars and patches (humpback)
            float n1 = uwNoise( L * vec3( 120.0, 120.0, 75.0 ) );
            float n2 = uwNoise( L * vec3( 260.0, 260.0, 170.0 ) + 7.0 );
            float spot = smoothstep( 0.55, 0.8, n1 * 0.7 + n2 * 0.4 ) * vWh.z;
            #ifdef UW_PAT_BLUE
              diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * 1.22 + vec3( 0.03, 0.035, 0.04 ), spot );
              float dark = smoothstep( 0.6, 0.8, uwNoise( L * vec3( 60.0, 60.0, 38.0 ) + 3.0 ) ) * vWh.z;
              diffuseColor.rgb *= 1.0 - dark * 0.12;
              float tj = 0.8;
            #else
              float scar = smoothstep( 0.78, 0.84, n1 * 0.6 + n2 * 0.5 ) * smoothstep( 0.3, 0.55, s );
              diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.8, 0.83, 0.86 ), scar * 0.45 * vWh.z );
              float tj = 0.76;
            #endif
            // throat pleats: fine grooves running from the chin to the navel (faded when too fine to see)
            float f = vWh.x * 44.0;
            float w = fwidth( f );
            float g = abs( fract( f ) - 0.5 );
            float pleat = smoothstep( 0.34 - w, 0.47, g ) * ( 1.0 - smoothstep( 0.35, 0.8, w ) ) * vWh.y;
            diffuseColor.rgb *= 1.0 - pleat * 0.5;
            // the mouth line, curving up to the tip of the snout
            float ms = mix( 0.64, 0.5, smoothstep( tj, 1.0, t ) );
            float wm = fwidth( s );
            float mouth = ( 1.0 - smoothstep( 0.006, 0.012 + wm * 1.5, abs( s - ms ) ) ) * smoothstep( tj - 0.01, tj + 0.02, t );
            diffuseColor.rgb *= 1.0 - mouth * 0.75;
            // twin blowholes
            #ifdef UW_PAT_BLUE
              float zb = 0.33;
            #else
              float zb = 0.3;
            #endif
            vec2 bh = vec2( ( abs( L.x ) - 0.0055 ) / 0.0028, ( L.z - zb ) / 0.011 );
            diffuseColor.rgb *= 1.0 - ( 1.0 - smoothstep( 0.6, 1.0, length( bh ) ) ) * step( s, 0.12 ) * 0.8;
          }
        #endif
        #ifdef UW_PAT_SAND
          {
            // the deep sandy plain: long ripples, darker patches, a scatter of pale shell grit
            vec2 p = vUwWorld.xz;
            // (the island's ground draws everything it covers: its land and reef)
            {
              vec2 cuv = ( p - uTerrCoverRect.xy ) / uTerrCoverRect.zw;
              if ( cuv.x > 0.0 && cuv.y > 0.0 && cuv.x < 1.0 && cuv.y < 1.0 && texture2D( uTerrCover, cuv ).r > 0.5 ) discard;
            }
            float warp = uwNoise( vec3( p * 0.02, 1.0 ) ) * 12.0;
            float rip = sin( p.x * 0.55 + p.y * 0.21 + warp );
            float wr = fwidth( p.x * 0.55 + p.y * 0.21 );
            rip *= 1.0 - smoothstep( 0.4, 1.6, wr );
            float sandPatch = uwNoise( vec3( p * 0.035, 5.0 ) ) * 0.65 + uwNoise( vec3( p * 0.11, 9.0 ) ) * 0.35;
            diffuseColor.rgb *= ( 0.9 + rip * 0.07 ) * mix( 0.78, 1.08, smoothstep( 0.3, 0.7, sandPatch ) );
            float grit = step( 0.985, uwHash( floor( vec3( p * 3.0, 0.0 ) ) ) ) * ( 1.0 - smoothstep( 0.2, 0.6, fwidth( p.x * 3.0 ) ) );
            diffuseColor.rgb += grit * 0.12;
          }
        #endif
        #ifdef UW_SEA
          // colour absorption with depth: reds fade first
          {
            float deep = smoothstep( -2.0, -24.0, vUwWorld.y );
            diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.7, 0.88, 1.0 ), deep );
          }
        #endif`,
      )
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
        #ifdef UW_SEA
          {
            float under = smoothstep( ${WATER_Y_GLSL} + 0.3, ${WATER_Y_GLSL} - 0.6, vUwWorld.y );
            float depthK = mix( 1.0, 0.45, smoothstep( -2.0, -22.0, vUwWorld.y ) );
            float up = smoothstep( -0.15, 0.85, vUwUp );
            float cst = uwCaustic( vUwWorld.xz ) * uCausticK * depthK * under * ( 0.15 + 0.85 * up );
            // clear tropical water: sunlight only a little bluer under the sea; caustics dance on top
            reflectedLight.directDiffuse *= mix( vec3( 1.0 ), vec3( 0.82, 0.95, 1.0 ), under );
            reflectedLight.directSpecular *= mix( 1.0, 0.6, under );
            reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3( 0.85, 1.0, 1.0 ) * cst * 0.8;
            // turquoise scatter fill from all around (shadowed sides stay colourful, never black)
            reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3( 0.16, 0.28, 0.32 ) * under * ( 1.0 - uGlow * 0.4 );
            #ifdef UW_LIFT
              // "film light": creatures keep their colours in the blue
              reflectedLight.indirectDiffuse += diffuseColor.rgb * UW_LIFT * mix( 0.35, 1.0, under );
            #endif
            #ifdef UW_RIM
              // a soft teal-white rim picks the silhouette out of the water behind it
              float uwFr = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 3.0 );
              vec3 uwRimC = mix( vec3( 0.55, 0.92, 1.0 ), diffuseColor.rgb * 1.3 + 0.25, 0.35 ) * mix( vec3( 1.0 ), vec3( 0.55, 0.8, 1.25 ), uGlow );
              reflectedLight.indirectDiffuse += uwRimC * uwFr * UW_RIM * mix( 0.3, 1.0, under );
            #endif
          }
        #else
          // in the sky: soft skylight all round, so pale birds stay pale from below
          reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3( 0.34, 0.37, 0.42 ) * ( 1.0 - uGlow * 0.6 );
        #endif`,
      )
      .replace(
        "#include <fog_fragment>",
        `#ifdef UW_SEA
          {
            // seen from above the surface, things under the water fade into the blue with depth
            float below = max( 0.0, ${WATER_Y_GLSL} - vUwWorld.y );
            float k = ( 1.0 - exp( -below / 6.5 ) ) * step( ${WATER_Y_GLSL} + 0.05, cameraPosition.y );
            vec3 deepSea = mix( vec3( 0.06, 0.26, 0.62 ), vec3( 0.025, 0.045, 0.2 ), uGlow );
            gl_FragColor.rgb = mix( gl_FragColor.rgb, deepSea, k * 0.92 );
          }
        #endif
        #include <fog_fragment>`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          totalEmissiveRadiance += diffuseColor.rgb * vUwGlow * uGlowK;
        #endif
        #ifdef UW_FISH
          // silver fish (sardines, jacks) flash as they turn: a bait ball glitters
          if ( abs( vUwSp - 4.0 ) < 0.5 || vUwSp > 8.5 ) {
            float uwFl = smoothstep( 0.82, 1.0, sin( vUwPh * 0.23 + vUwLocal.z * 3.0 ) );
            totalEmissiveRadiance += vec3( 0.8, 0.95, 1.0 ) * uwFl * 0.9 * step( vUwFin, 0.5 );
          }
        #endif`,
      );
  };
  return mat;
}

/** fog as a 0..1 factor (for additive effects that must fade out, not tint) */
export const FOG_K_GLSL = /* glsl */ `
float uwFog() {
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      return 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      return smoothstep( fogNear, fogFar, vFogDepth );
    #endif
  #else
    return 0.0;
  #endif
}
`;

/** uniforms for a ShaderMaterial that uses scene fog + our shared uniforms (shared by reference) */
export function fxUniforms(U: UwUniforms, extra: Record<string, THREE.IUniform> = {}): Record<string, THREE.IUniform> {
  return { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: U.uTime, uGlow: U.uGlow, uGlowK: U.uGlowK, uCausticK: U.uCausticK, uCausticTex: U.uCausticTex, ...extra };
}
