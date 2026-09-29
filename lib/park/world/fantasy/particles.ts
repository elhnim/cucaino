// Soft effects, each ONE draw call:
//   sprites  camera-facing soft billboards with premultiplied alpha, so one mesh mixes
//            normal-blended mist (waterfall spray, forest ground mist) and additive glow halos
//            (crystals, mushrooms, rune altars). Island mist rides its island's matrix (uIslMat).
//   shafts   god-ray light shafts between the Glow Forest's trunks (additive, fresnel-soft)
//   leaves   drifting leaves/petals in the wind around the player (twilight: glowing motes)
import * as THREE from "three";
import { rngOf } from "./noise";
import { FOG_FACTOR_GLSL, GUST_GLSL, HASH_GLSL, ISL_SLOTS, ISL_WORLD, type FantasyUniforms } from "./shaders";
import { TERRAIN_GLSL, TERRAIN_UNIFORMS } from "./terrainMesh";

/** sprite kinds */
export const SPRITE_MIST = 0;
export const SPRITE_HALO = 1;
export const SPRITE_FOREST_MIST = 2;

export interface SpriteDef {
  x: number;
  y: number;
  z: number;
  /** island slot (0..3) or ISL_WORLD */
  isl: number;
  size: number;
  color: THREE.Color;
  kind: number;
}

export function buildSprites(U: FantasyUniforms, defs: SpriteDef[]): THREE.Mesh {
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute("position", quad.attributes.position);
  g.setAttribute("uv", quad.attributes.uv);
  const n = defs.length;
  const aPos = new Float32Array(n * 4);
  const aCol = new Float32Array(n * 4);
  const aSize = new Float32Array(n * 2);
  const r = rngOf(909);
  defs.forEach((d, i) => {
    aPos.set([d.x, d.y, d.z, d.isl], i * 4);
    aCol.set([d.color.r, d.color.g, d.color.b, d.kind], i * 4);
    aSize.set([d.size, r()], i * 2);
  });
  g.setAttribute("aPos", new THREE.InstancedBufferAttribute(aPos, 4));
  g.setAttribute("aCol", new THREE.InstancedBufferAttribute(aCol, 4));
  g.setAttribute("aSize", new THREE.InstancedBufferAttribute(aSize, 2));
  g.instanceCount = n;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: U.uTime, uGlow: U.uGlow, uIslMat: U.uIslMat },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec4 aPos; attribute vec4 aCol; attribute vec2 aSize;
      uniform mat4 uIslMat[${ISL_SLOTS}]; uniform float uTime; uniform float uGlow;
      varying vec2 vUv; varying vec4 vCol; varying float vA; varying float vSeed;
      void main() {
        vUv = uv;
        float seed = aSize.y;
        float kind = aCol.a;
        vec3 p = aPos.xyz;
        float size = aSize.x;
        float a = 1.0;
        vec3 c = aCol.rgb;
        if ( kind < 0.5 ) {
          // waterfall spray: billows downwards and outwards, fading in and out
          float life = fract( uTime * ( 0.05 + seed * 0.05 ) + seed * 7.0 );
          p.y -= life * 5.0;
          p.xz += vec2( sin( seed * 40.0 ), cos( seed * 40.0 ) ) * life * 2.5;
          size *= 0.6 + life * 0.9;
          a = sin( life * 3.14159 ) * 0.32;
          c = mix( c, vec3( 0.6, 0.9, 1.0 ), uGlow * 0.3 );
        } else if ( kind < 1.5 ) {
          // glow halo: faint by day, blooming at twilight, breathing
          float br = 0.85 + 0.15 * sin( uTime * ( 1.2 + seed ) + seed * 20.0 );
          size *= ( 0.55 + 0.75 * uGlow ) * br;
          a = ( 0.1 + 0.4 * uGlow ) * br;
        } else {
          // forest ground mist: slow drift, tinted violet / teal at twilight
          p.x += sin( uTime * 0.05 + seed * 30.0 ) * 3.0;
          p.z += cos( uTime * 0.04 + seed * 17.0 ) * 3.0;
          a = 0.22 + 0.1 * sin( uTime * 0.3 + seed * 12.0 );
          c = mix( c, mix( vec3( 0.32, 0.22, 0.75 ), vec3( 0.12, 0.5, 0.6 ), seed ), uGlow * 0.85 );
          a *= 1.0 - uGlow * 0.3;
        }
        vec4 wp = uIslMat[ int( aPos.w + 0.5 ) ] * vec4( p, 1.0 );
        vec4 mvPosition = viewMatrix * wp;
        mvPosition.xy += position.xy * size;
        gl_Position = projectionMatrix * mvPosition;
        vCol = vec4( c, kind );
        vA = a;
        vSeed = seed;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      varying vec2 vUv; varying vec4 vCol; varying float vA; varying float vSeed;
      ${HASH_GLSL}
      ${FOG_FACTOR_GLSL}
      void main() {
        vec2 q = vUv - 0.5;
        float r = length( q ) * 2.0;
        if ( r > 1.0 ) discard;
        float kind = vCol.a;
        float fade = 1.0 - fantasyFog();
        vec4 outc;
        if ( kind > 0.5 && kind < 1.5 ) {
          // additive halo: a bright core and a soft wide falloff
          float g = pow( 1.0 - r, 2.2 ) * 0.8 + pow( 1.0 - r, 8.0 ) * 1.2;
          outc = vec4( vCol.rgb * g * vA * fade, 0.0 );
        } else {
          // fluffy mist: soft disc broken up by drifting noise
          float n = fnoise( q * 4.0 + vSeed * 13.0 + uTime * 0.05 ) * 0.6 + fnoise( q * 9.0 - vSeed * 7.0 ) * 0.4;
          float m = pow( smoothstep( 1.0, 0.0, r ), 1.6 ) * ( 0.45 + 0.7 * n );
          float al = clamp( m * vA * fade, 0.0, 1.0 );
          outc = vec4( vCol.rgb * al, al );
        }
        gl_FragColor = outc;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.name = "fantasy-sprites";
  return mesh;
}

export interface ShaftDef {
  x: number;
  y: number;
  z: number;
  h: number;
  r: number;
  rot: number;
}

/** god-ray shafts (open tapered cylinders, soft at the silhouette and both ends) */
export function buildShafts(U: FantasyUniforms, defs: ShaftDef[]): THREE.InstancedMesh {
  const geo = new THREE.CylinderGeometry(0.55, 1, 1, 14, 1, true);
  geo.translate(0, -0.5, 0); // top at 0, bottom at -1
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: U.uTime, uGlow: U.uGlow },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying float vEdge; varying float vY; varying float vSeed;
      void main() {
        vec4 wp = modelMatrix * instanceMatrix * vec4( position, 1.0 );
        vec4 mvPosition = viewMatrix * wp;
        vec3 nv = normalize( mat3( viewMatrix ) * mat3( modelMatrix ) * mat3( instanceMatrix ) * normal );
        vEdge = abs( dot( nv, normalize( -mvPosition.xyz ) ) );
        vY = -position.y;
        vSeed = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.29;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform float uGlow;
      varying float vEdge; varying float vY; varying float vSeed;
      ${FOG_FACTOR_GLSL}
      void main() {
        float soft = pow( vEdge, 2.5 );
        float ends = smoothstep( 0.05, 0.45, vY ) * smoothstep( 1.0, 0.6, vY );
        float flick = 0.75 + 0.25 * sin( uTime * 0.5 + vSeed * 9.0 ) * sin( uTime * 0.23 + vSeed * 3.0 );
        vec3 day = vec3( 1.0, 0.86, 0.55 ) * 0.2;
        vec3 dusk = mix( vec3( 0.35, 0.95, 1.0 ), vec3( 0.7, 0.45, 1.0 ), fract( vSeed ) ) * 0.34;
        vec3 c = mix( day, dusk, uGlow ) * soft * ends * flick * ( 1.0 - fantasyFog() );
        gl_FragColor = vec4( c, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, defs.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  // all shafts lean the same way, as if from one sun
  defs.forEach((d, i) => {
    e.set(0.22, d.rot * 0.1 + 0.6, 0.12, "YXZ");
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(d.x, d.y + d.h, d.z), q, new THREE.Vector3(d.r, d.h, d.r));
    mesh.setMatrixAt(i, m);
  });
  mesh.count = defs.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.name = "fantasy-light-shafts";
  return mesh;
}

/** leaves and petals drifting on the wind around the player (a wrapped box that follows uFocus) */
export function buildLeaves(U: FantasyUniforms, heightTex: THREE.Texture, count: number): THREE.Points {
  const r = rngOf(4711);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([r(), r(), r()], i * 3);
    seed[i] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const uPx = { value: 400 };
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: U.uTime,
      uGlow: U.uGlow,
      uWindDir: U.uWindDir,
      uGust: U.uGust,
      uFocus: U.uFocus,
      uPx,
      uHeightTex: { value: heightTex },
      uTerrE: { value: TERRAIN_UNIFORMS.uTerrE },
      uTerrCell: { value: TERRAIN_UNIFORMS.uTerrCell },
      uTerrN: { value: TERRAIN_UNIFORMS.uTerrN },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute float aSeed;
      uniform float uTime; uniform float uGlow; uniform vec2 uWindDir; uniform float uGust; uniform vec2 uFocus; uniform float uPx;
      varying vec3 vCol; varying float vA; varying float vAng; varying float vGlowy;
      ${TERRAIN_GLSL}
      ${GUST_GLSL}
      void main() {
        vec3 box = vec3( 44.0, 9.0, 44.0 );
        float s = aSeed;
        vec3 p = position * box;
        float speed = 2.5 + s * 2.5;
        p.xz += uWindDir * uTime * speed;
        p.xz += vec2( sin( uTime * ( 0.7 + s ) + s * 30.0 ), cos( uTime * ( 0.5 + s * 0.7 ) + s * 11.0 ) ) * 1.5;
        vec2 w = uFocus + mod( p.xz - uFocus + box.xz * 0.5, box.xz ) - box.xz * 0.5;
        float hy = mod( p.y - uTime * ( 0.35 + s * 0.4 ), box.y );
        float ground = terrainY( w );
        vec3 wp = vec3( w.x, ground + 0.3 + hy + sin( uTime * 2.0 + s * 20.0 ) * 0.3, w.y );
        vec4 mvPosition = viewMatrix * vec4( wp, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        float d = distance( w, uFocus );
        vA = ( 1.0 - smoothstep( box.x * 0.3, box.x * 0.5, d ) ) * smoothstep( 0.0, 1.2, hy ) * smoothstep( box.y, box.y - 2.0, hy );
        float leafy = step( 0.45, fract( s * 13.1 ) );
        vec3 leaf = mix( vec3( 0.55, 0.62, 0.12 ), vec3( 0.95, 0.62, 0.15 ), fract( s * 7.7 ) );
        vec3 petal = mix( vec3( 1.0, 0.72, 0.85 ), vec3( 1.0, 0.95, 0.92 ), fract( s * 5.3 ) );
        vCol = mix( petal, leaf, leafy );
        // twilight: they become glowing spores
        vGlowy = uGlow;
        vCol = mix( vCol, mix( vec3( 0.4, 1.4, 1.6 ), vec3( 1.3, 0.8, 2.0 ), fract( s * 3.1 ) ), uGlow * 0.85 );
        vAng = uTime * ( 1.0 + s * 3.0 ) + s * 40.0;
        gl_PointSize = ( 0.08 + 0.07 * s ) * uPx / max( 3.0, -mvPosition.z );
        vA *= smoothstep( 3.5, 8.0, -mvPosition.z );
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      varying vec3 vCol; varying float vA; varying float vAng; varying float vGlowy;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float c = cos( vAng ); float s = sin( vAng );
        q = vec2( q.x * c - q.y * s, q.x * s + q.y * c );
        // a leaf by day (tumbling: its width flutters), a round mote at twilight
        float flutter = 0.35 + 0.65 * abs( sin( vAng * 0.7 ) );
        vec2 lq = vec2( q.x / ( 0.22 * flutter ), q.y / 0.48 );
        float leaf = 1.0 - smoothstep( 0.8, 1.0, length( lq ) );
        float mote = pow( max( 0.0, 1.0 - length( q ) * 2.0 ), 2.0 );
        float a = mix( leaf, mote, vGlowy ) * vA;
        if ( a < 0.02 ) discard;
        gl_FragColor = vec4( vCol, a );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  pts.name = "fantasy-leaves";
  const size = new THREE.Vector2();
  pts.onBeforeRender = (renderer, _scene, camera) => {
    renderer.getDrawingBufferSize(size);
    const proj = (camera as THREE.PerspectiveCamera).projectionMatrix;
    uPx.value = size.y * 0.5 * proj.elements[5];
  };
  return pts;
}

export { ISL_WORLD };
