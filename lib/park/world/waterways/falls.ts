// Rainbow Falls: a spring on top of the mesa runs down a rocky channel and pours ~21 m over the
// cliff into the plunge pool — a curtain of falling water (streaks racing down, ragged edges, a
// thinner veil behind), billowing mist and glittering spray where it lands, and a rainbow hanging
// in the spray on sunny days. Three draw calls; everything animates on the GPU from uTime.
import * as THREE from "three";
import { FOG_FACTOR_GLSL } from "../fantasy/shaders";
import { WATER_Y, groundY } from "../../registry/terrain";
import { FALLS, MESA } from "../../registry/waterways";

/** a waterfall: where it pours over, which way, how wide (top and bottom), and the spring above */
export interface FallsDef {
  lip: { x: number; y: number; z: number };
  heading: number;
  width: number;
  widthBottom: number;
  spring: { x: number; z: number };
}
const RAINBOW_FALLS: FallsDef = { ...FALLS, spring: { x: MESA.x + 4, z: FALLS.lip.z } };

export interface Falls {
  group: THREE.Group;
  update(dt: number, t: number, glow: number, camera: THREE.Vector3 | null): void;
  tris: number;
  dispose(): void;
}

export function buildFalls(opts: { lowQuality?: boolean; def?: FallsDef; name?: string } = {}): Falls {
  const FALLS = opts.def ?? RAINBOW_FALLS;
  const low = !!opts.lowQuality;
  const group = new THREE.Group();
  group.name = opts.name ?? "rainbow-falls";
  const L = FALLS.lip;
  const dx = Math.sin(FALLS.heading);
  const dz = Math.cos(FALLS.heading);
  const sx = Math.cos(FALLS.heading);
  const sz = -Math.sin(FALLS.heading);
  const drop = L.y - WATER_Y;

  // ── the sheet: the channel on top (v < 0), then the fall (0..1), front curtain + a veil behind ──
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const across = low ? 8 : 12;
  const strip = (rows: { x: number; y: number; z: number; w: number; v: number }[], layer: number) => {
    const base = pos.length / 3;
    for (const r of rows)
      for (let i = 0; i <= across; i++) {
        const u = (i / across) * 2 - 1;
        // (the curtain bows out a little in the middle)
        const bow = (1 - u * u) * 0.5 * Math.max(0, r.v) * (layer ? -0.6 : 1);
        pos.push(r.x + sx * u * r.w * 0.5 + dx * bow, r.y, r.z + sz * u * r.w * 0.5 + dz * bow);
        uv.push(u, r.v + layer * 7.3);
      }
    for (let j = 0; j + 1 < rows.length; j++)
      for (let i = 0; i < across; i++) {
        const a = base + j * (across + 1) + i;
        const b = a + 1;
        const c = a + across + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
  };
  const rows: { x: number; y: number; z: number; w: number; v: number }[] = [];
  // the channel from the spring to the lip
  const spring = FALLS.spring;
  const nC = 6;
  for (let k = 0; k <= nC; k++) {
    const u = k / nC;
    const x = spring.x + (L.x - spring.x) * u;
    const z = spring.z + (L.z - spring.z) * u + Math.sin(u * 5) * 0.6 * (1 - u);
    rows.push({ x, y: groundY(x, z) + 0.35 + u * 0.1, z, w: 2.4 + u * (FALLS.width - 2.4), v: -1 + u });
  }
  // the fall: it shoots out a little over the edge, then drops into the pool
  const nF = low ? 10 : 18;
  for (let k = 1; k <= nF; k++) {
    const v = k / nF;
    // (a taller fall throws its water further out from the rock)
    const out = (0.4 + Math.pow(v, 0.6) * 2.4) * Math.max(1, drop / 21);
    rows.push({ x: L.x + dx * out, y: L.y - drop * Math.pow(v, 1.15) + 0.2 * (1 - v), z: L.z + dz * out, w: FALLS.width + (FALLS.widthBottom - FALLS.width) * v, v });
  }
  rows[rows.length - 1].y = WATER_Y - 0.4;
  strip(rows, 0);
  // the veil behind the curtain (only the fall)
  strip(rows.filter((r) => r.v >= 0).map((r) => ({ ...r, x: r.x - dx * 0.6, z: r.z - dz * 0.6, w: r.w * 0.85 })), 1);
  const sheetGeo = new THREE.BufferGeometry();
  sheetGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  sheetGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  sheetGeo.setIndex(idx);
  sheetGeo.computeBoundingSphere();
  const U = { uTime: { value: 0 }, uGlow: { value: 0 } };
  const sheetMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: { ...THREE.UniformsLib.fog, ...U },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4( position, 1.0 );
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uGlow;
      varying vec2 vUv; varying vec3 vW;
      #include <fog_pars_fragment>
      ${FOG_FACTOR_GLSL}
      float h2( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      float vn( vec2 p ) { vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( h2( i ), h2( i + vec2( 1.0, 0.0 ) ), f.x ), mix( h2( i + vec2( 0.0, 1.0 ) ), h2( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
      void main() {
        float u = vUv.x;
        float layer = step( 3.0, vUv.y );
        float v = vUv.y - layer * 7.3;
        float falling = step( 0.0, v );
        // streaks racing down (faster as it falls), lazy ripples in the channel up top
        float speed = mix( 0.6, 2.4 + v * 1.6, falling );
        vec2 q = vec2( u * mix( 3.0, 9.0, falling ), v * mix( 1.5, 5.0, falling ) - uTime * speed );
        float s1 = vn( q ) * 0.6 + vn( q * 2.1 + 5.3 ) * 0.4;
        float streak = smoothstep( 0.35, 0.8, s1 );
        vec3 deepC = vec3( 0.42, 0.78, 0.86 );
        vec3 white = vec3( 0.97, 1.0, 1.0 );
        vec3 col = mix( deepC, white, 0.35 + streak * 0.65 * falling + streak * 0.25 );
        // whiter and frothier toward the bottom, and as it tips over the lip
        float froth = falling * ( smoothstep( 0.55, 1.0, v ) + ( 1.0 - smoothstep( 0.0, 0.12, v ) ) * 0.6 );
        col = mix( col, white, clamp( froth, 0.0, 1.0 ) * 0.7 );
        // ragged, wind-torn edges; a thinner veil behind
        float edge = 1.0 - smoothstep( 0.62 + vn( vec2( v * 7.0 - uTime * 2.0, u * 3.0 ) ) * 0.3, 1.0, abs( u ) );
        float a = edge * mix( 0.72, 0.9, streak ) * mix( 1.0, 0.5, layer );
        a *= mix( 0.85, 1.0, falling );
        col *= mix( 1.0, 0.45, uGlow );
        #ifdef USE_FOG
          col = mix( col, fogColor, fantasyFog() );
        #endif
        gl_FragColor = vec4( col, a );
      }`,
  });
  const sheet = new THREE.Mesh(sheetGeo, sheetMat);
  sheet.name = "falls-sheet";
  sheet.renderOrder = 4;
  group.add(sheet);

  // ── mist billowing up from the pool and spray glittering off the plunge ──
  const N = low ? 140 : 300;
  const seeds = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const h = (k: number) => {
      const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    seeds.set([h(1), h(2), h(3), h(4)], i * 4);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  pGeo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  // (an honest bounding sphere: the particles move in the shader)
  pGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(L.x + dx * 6, WATER_Y + 6, L.z), 22);
  const impact = new THREE.Vector3(L.x + dx * 2.6, WATER_Y, L.z + dz * 2.6);
  const mistMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: { ...THREE.UniformsLib.fog, ...U, uImpact: { value: impact }, uDir: { value: new THREE.Vector3(dx, 0, dz) }, uSide: { value: new THREE.Vector3(sx, 0, sz) }, uW: { value: FALLS.widthBottom }, uPx: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime; uniform vec3 uImpact; uniform vec3 uDir; uniform vec3 uSide; uniform float uW; uniform float uPx;
      varying float vA; varying float vSpray;
      #include <fog_pars_vertex>
      void main() {
        float spray = step( 0.62, aSeed.w );
        float rate = mix( 0.09, 0.55, spray ) * ( 0.8 + aSeed.z * 0.4 );
        float life = fract( uTime * rate + aSeed.x );
        vec3 p = uImpact + uSide * ( aSeed.y - 0.5 ) * uW;
        if ( spray > 0.5 ) {
          // droplets thrown out of the plunge in arcs
          vec3 vel = uDir * ( 2.0 + aSeed.z * 5.0 ) + uSide * ( aSeed.y - 0.5 ) * 4.0 + vec3( 0.0, 5.0 + aSeed.x * 4.0, 0.0 );
          float tt = life * 1.4;
          p += vel * tt + vec3( 0.0, -9.0 * tt * tt * 0.5, 0.0 );
          vA = ( 1.0 - life ) * step( ${WATER_Y.toFixed(2)} , p.y );
        } else {
          // mist rolling out over the pool and rising
          p += uDir * ( life * ( 6.0 + aSeed.z * 6.0 ) ) + uSide * sin( life * 3.0 + aSeed.y * 6.28 ) * 2.0;
          p.y += life * ( 4.0 + aSeed.z * 7.0 ) + 0.3;
          vA = sin( life * 3.14159 ) * 0.075;
        }
        vSpray = spray;
        vec4 mvPosition = viewMatrix * vec4( p, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        float size = mix( 1.6 + life * 3.6, 0.28, spray );
        gl_PointSize = clamp( size * uPx / max( 1.0, -mvPosition.z ), 1.0, 90.0 );
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow;
      varying float vA; varying float vSpray;
      #include <fog_pars_fragment>
      ${FOG_FACTOR_GLSL}
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length( c );
        float soft = 1.0 - smoothstep( mix( 0.1, 0.25, vSpray ), 0.5, d );
        vec3 col = mix( vec3( 0.96, 0.99, 1.0 ), vec3( 1.0 ), vSpray ) * mix( 1.0, 0.5, uGlow );
        float a = soft * vA * mix( 1.0, 1.6, vSpray ) * ( 1.0 - fantasyFog() );
        if ( a < 0.01 ) discard;
        gl_FragColor = vec4( col, a );
      }`,
  });
  const mist = new THREE.Points(pGeo, mistMat);
  mist.name = "falls-mist";
  mist.renderOrder = 5;
  group.add(mist);

  // ── a rainbow in the spray (by day) ──
  const bowGeo = new THREE.RingGeometry(7, 9.2, low ? 24 : 48, 1, 0, Math.PI);
  const bowMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uGlow: U.uGlow, uTime: U.uTime },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow; uniform float uTime;
      varying vec2 vP;
      vec3 hue( float h ) { return clamp( abs( mod( h * 6.0 + vec3( 0.0, 4.0, 2.0 ), 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 ); }
      void main() {
        float r = ( length( vP ) - 7.0 ) / 2.2;
        float band = smoothstep( 0.0, 0.15, r ) * ( 1.0 - smoothstep( 0.85, 1.0, r ) );
        // (it fades out toward the water at both ends, and shimmers with the drifting spray)
        float ends = smoothstep( 0.0, 3.5, vP.y );
        float shimmer = 0.8 + 0.2 * sin( vP.x * 0.9 + uTime * 1.3 );
        vec3 c = hue( 0.82 - r * 0.82 ) * band * ends * shimmer * 0.42 * ( 1.0 - uGlow );
        gl_FragColor = vec4( c, 1.0 );
      }`,
  });
  const bow = new THREE.Mesh(bowGeo, bowMat);
  bow.name = "falls-rainbow";
  bow.position.set(L.x + dx * 8.5, WATER_Y - 0.6, L.z + dz * 8.5);
  bow.renderOrder = 6;
  group.add(bow);

  return {
    group,
    tris: idx.length / 3 + 2 * (low ? 24 : 48),
    update(_dt, t, glow, camera) {
      U.uTime.value = t;
      U.uGlow.value = glow;
      bow.visible = glow < 0.85;
      // the rainbow turns to face whoever's looking (it always hangs in the spray between you and the falls)
      if (camera) bow.rotation.y = Math.atan2(camera.x - bow.position.x, camera.z - bow.position.z);
    },
    dispose() {
      sheetGeo.dispose();
      sheetMat.dispose();
      pGeo.dispose();
      mistMat.dispose();
      bowGeo.dispose();
      bowMat.dispose();
    },
  };
}
