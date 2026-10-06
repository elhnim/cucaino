// The water of the river, the plunge pool, Rainbow Lake and its outlet: ONE mesh at the sea's level
// (so the engine's swimming and the under-water camera just work), with a flow-mapped shader — the
// ripples, foam streaks and floating leaves travel with the current baked in the waterways registry
// (fast down the river, swirling in the pool, a slow drift across the lake) — clear over the
// shallows so you see the bed and the fish, deeper teal in the middle, the sky mirrored at grazing
// angles, white water where the falls land, and splash rings where a fish jumps. Calm: no swell.
import * as THREE from "three";
import { FOG_FACTOR_GLSL } from "../fantasy/shaders";
import { WATER_Y, groundY } from "../../registry/terrain";
import { FALLS, WATER_BOUNDS, flowAt, waterBodyAt, waterSdf, WATER_BODIES } from "../../registry/waterways";
import { seaDist } from "../../registry/island";

export const MAX_SPLASH = 4;

export interface WaterSurface {
  mesh: THREE.Mesh;
  uniforms: {
    uTime: { value: number };
    uGlow: { value: number };
    uSky: { value: THREE.Color };
    uSplash: { value: THREE.Vector4[] };
  };
  tris: number;
  dispose(): void;
}

type SurfaceOpts = { lowQuality?: boolean; bounds?: { x0: number; x1: number; z0: number; z1: number }; cell?: number; falls?: { x: number; z: number } };

/** One water surface over `bounds` (default: the park's waterways), `cell` units a quad, with the
 *  white water where `falls` lands (default: Rainbow Falls), built all at once. */
export function buildWaterSurface(opts: SurfaceOpts = {}): WaterSurface {
  const job = waterSurfaceJob(opts);
  let r = job.next();
  while (!r.done) r = job.next();
  return r.value;
}

/** The same, as a job that pauses after every row (step it a little each frame: a big surface
 *  never holds a frame up). */
export function* waterSurfaceJob(opts: SurfaceOpts = {}): Generator<void, WaterSurface> {
  const cell = opts.cell ?? (opts.lowQuality ? 2.2 : 1.5);
  const { x0, x1, z0, z1 } = opts.bounds ?? WATER_BOUNDS;
  const fallsAt = opts.falls ?? { x: FALLS.lip.x + 2.2, z: FALLS.lip.z };
  const nx = Math.ceil((x1 - x0) / cell) + 1;
  const nz = Math.ceil((z1 - z0) / cell) + 1;
  const vid = new Int32Array(nx * nz).fill(-1);
  const pos: number[] = [];
  const flow: number[] = [];
  const dep: number[] = [];
  const kind: number[] = [];
  const idx: number[] = [];
  const f = { x: 0, z: 0 };
  const vertex = (i: number, j: number) => {
    const k = j * nx + i;
    if (vid[k] >= 0) return vid[k];
    const x = x0 + i * cell;
    const z = z0 + j * cell;
    vid[k] = pos.length / 3;
    pos.push(x, WATER_Y, z);
    flowAt(x, z, f);
    flow.push(f.x, f.z);
    dep.push(WATER_Y - groundY(x, z), waterSdf(x, z));
    const b = waterBodyAt(x, z);
    kind.push(b === WATER_BODIES.lake ? 0 : b === WATER_BODIES.pool ? 2 : 1);
    return vid[k];
  };
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const x = x0 + (i + 0.5) * cell;
      const z = z0 + (j + 0.5) * cell;
      // (a pause every few cells: one can bake a tile of the water's fields)
      if ((i & 15) === 0) yield;
      // a cell is drawn if any of it can be wet (the shore fades it out in the shader)
      if (waterSdf(x, z) > cell * 0.9) continue;
      // (the sea takes over beyond the beach)
      if (seaDist(x, z) > 4) continue;
      const a = vertex(i, j);
      const b = vertex(i + 1, j);
      const c = vertex(i, j + 1);
      const d = vertex(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
    yield;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aFlow", new THREE.Float32BufferAttribute(flow, 2));
  geo.setAttribute("aDepth", new THREE.Float32BufferAttribute(dep, 2));
  geo.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const uniforms = {
    uTime: { value: 0 },
    uGlow: { value: 0 },
    uSky: { value: new THREE.Color("#bfe6ff") },
    uSplash: { value: Array.from({ length: MAX_SPLASH }, () => new THREE.Vector4(0, 0, -100, 0)) },
  };
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: { ...THREE.UniformsLib.fog, ...uniforms, uFalls: { value: new THREE.Vector3(fallsAt.x, WATER_Y, fallsAt.z) } },
    vertexShader: /* glsl */ `
      attribute vec2 aFlow; attribute vec2 aDepth; attribute float aKind;
      varying vec2 vFlow; varying vec2 vDepth; varying float vKind; varying vec3 vW;
      #include <fog_pars_vertex>
      uniform float uTime;
      void main() {
        vFlow = aFlow; vDepth = aDepth; vKind = aKind;
        vec4 w = modelMatrix * vec4( position, 1.0 );
        // the surface itself moves a little: a slow, crossing swell on still water and low standing
        // waves where the current runs (small enough that swimming and the banks never notice;
        // nothing right at the shore, so the waterline stays put)
        float sp = length( aFlow );
        float open = smoothstep( 0.3, 1.6, aDepth.x );
        vec2 fd = sp > 0.01 ? aFlow / sp : vec2( 1.0, 0.0 );
        float swell = sin( w.x * 0.55 + w.z * 0.31 + uTime * 1.1 ) * 0.03 + sin( w.x * -0.27 + w.z * 0.62 - uTime * 0.8 ) * 0.025;
        float rapid = sin( dot( w.xz, fd ) * 1.25 - uTime * ( 1.6 + sp ) ) * 0.045 * smoothstep( 0.5, 1.6, sp );
        w.y += ( swell + rapid ) * open;
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uGlow; uniform vec3 uSky; uniform vec4 uSplash[${MAX_SPLASH}]; uniform vec3 uFalls;
      varying vec2 vFlow; varying vec2 vDepth; varying float vKind; varying vec3 vW;
      #include <fog_pars_fragment>
      ${FOG_FACTOR_GLSL}
      float h2( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      float vn( vec2 p ) { vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( h2( i ), h2( i + vec2( 1.0, 0.0 ) ), f.x ), mix( h2( i + vec2( 0.0, 1.0 ) ), h2( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
      float ripples( vec2 p ) { return vn( p ) * 0.55 + vn( p * 2.3 + 3.1 ) * 0.3 + vn( p * 5.1 - 1.7 ) * 0.15; }
      vec2 slope( vec2 p ) {
        float e = 0.12;
        float c = ripples( p );
        return vec2( ripples( p + vec2( e, 0.0 ) ) - c, ripples( p + vec2( 0.0, e ) ) - c ) / e;
      }
      void main() {
        float depth = vDepth.x;
        float sdf = vDepth.y;
        // (beyond the shore the mesh still covers a little dry bank: fade it out right at the edge)
        float wet = smoothstep( 0.02, 0.14, depth );
        if ( wet <= 0.001 ) discard;
        vec2 fl = vFlow;
        float sp = length( fl );
        // flow-map: two phases half a cycle apart, so the ripples ride the current without smearing
        float t0 = fract( uTime * 0.3 );
        float t1 = fract( uTime * 0.3 + 0.5 );
        float wb = abs( 1.0 - 2.0 * t0 );
        vec2 p = vW.xz * 0.42;
        vec2 calm = vec2( uTime * 0.05, -uTime * 0.04 );
        vec2 s0 = slope( p - fl * t0 * 1.4 + calm );
        vec2 s1 = slope( p - fl * t1 * 1.4 + calm + 0.37 );
        // (a breeze crosses still water in patches — "cat's paws" — so the lake is never one even
        // texture: ruffled here, glassy there, the patches drifting slowly)
        float gust = vn( vW.xz * 0.055 + vec2( uTime * 0.045, uTime * 0.03 ) );
        float ruffle = mix( 0.55, 1.5, smoothstep( 0.3, 0.75, gust ) );
        vec2 sl = mix( s0, s1, wb ) * ( 0.05 * ruffle + min( sp, 2.0 ) * 0.05 );
        vec3 N = normalize( vec3( -sl.x, 1.0, -sl.y ) );
        vec3 V = normalize( cameraPosition - vW );
        bool under = !gl_FrontFacing || cameraPosition.y < vW.y;
        // colour: clear over the shallows, teal-green in the deep (the river a little greener)
        float dk = smoothstep( 0.15, 2.6, depth );
        vec3 shallow = mix( vec3( 0.36, 0.74, 0.7 ), vec3( 0.38, 0.7, 0.55 ), step( 0.5, vKind ) );
        vec3 deep = mix( vec3( 0.03, 0.27, 0.36 ), vec3( 0.03, 0.26, 0.24 ), step( 0.5, vKind ) );
        vec3 col = mix( shallow, deep, dk );
        // sunlight dancing on the bed in the shallows: a net of bright lines that drifts and
        // re-knits, carried along by the current (by day; fading with depth)
        {
          vec2 cq = vW.xz * 0.9 - fl * uTime * 0.25;
          float ca = abs( vn( cq + vec2( uTime * 0.21, 0.0 ) ) - vn( cq * 1.35 + vec2( 3.7, -uTime * 0.17 ) ) );
          float cb = abs( vn( cq * 1.9 - vec2( 0.0, uTime * 0.26 ) ) - vn( cq * 2.4 + vec2( uTime * 0.19, 5.1 ) ) );
          float caustic = pow( 1.0 - min( 1.0, ca * 2.6 ), 7.0 ) * 0.7 + pow( 1.0 - min( 1.0, cb * 2.8 ), 7.0 ) * 0.4;
          col += vec3( 0.75, 0.95, 0.8 ) * caustic * ( 1.0 - smoothstep( 0.35, 2.0, depth ) ) * smoothstep( 0.03, 0.2, depth ) * 0.55 * ( 1.0 - uGlow );
        }
        // (clear: you can see the koi from the jetty and the bed in the shallows)
        float alpha = mix( 0.26, mix( 0.6, 0.72, step( 0.5, vKind ) ), dk );
        // the sky mirrored at grazing angles, the sun's glints
        float fres = pow( 1.0 - max( 0.0, abs( dot( N, V ) ) ), 4.0 );
        col = mix( col, uSky * mix( 1.0, 0.45, uGlow ), fres * 0.5 );
        alpha = max( alpha, fres * 0.8 );
        vec3 R = reflect( -V, N );
        float sun = pow( max( 0.0, dot( R, normalize( vec3( -0.45, 0.7, 0.4 ) ) ) ), 420.0 );
        col += vec3( 1.0, 0.96, 0.85 ) * sun * 0.9 * ( 1.0 - uGlow );
        float moon = pow( max( 0.0, dot( R, normalize( vec3( 0.42, 0.3, -0.85 ) ) ) ), 90.0 );
        col += vec3( 0.6, 0.7, 1.0 ) * moon * 0.7 * uGlow;
        // glitter: a scatter of tiny glints that wink on and off as the ripples tilt, thickest down
        // the sun's path and in the ruffled patches
        {
          vec2 gq = vW.xz * 5.5 + sl * 55.0;
          float tw = fract( h2( floor( gq ) ) * 7.0 + uTime * ( 0.6 + h2( floor( gq ) + 9.0 ) ) );
          float glint = step( 0.965, h2( floor( gq ) + 4.0 ) ) * smoothstep( 0.0, 0.12, tw ) * ( 1.0 - smoothstep( 0.12, 0.3, tw ) );
          vec2 gc = fract( gq ) - 0.5;
          glint *= 1.0 - smoothstep( 0.05, 0.3, length( gc ) );
          float path = pow( max( 0.0, dot( R, normalize( vec3( -0.45, 0.7, 0.4 ) ) ) ), 6.0 );
          col += vec3( 1.0, 0.98, 0.9 ) * glint * ( 0.35 + path * 1.6 ) * ruffle * ( 1.0 - uGlow ) * smoothstep( 0.2, 0.8, depth );
          alpha = max( alpha, glint * 0.8 );
        }
        // foam streaks riding the current (stretched along the flow), thicker where it's fast
        vec2 dir = sp > 0.01 ? fl / sp : vec2( 1.0, 0.0 );
        vec2 fp = vec2( dot( vW.xz, dir ), dot( vW.xz, vec2( -dir.y, dir.x ) ) );
        float streak = 0.7 * smoothstep( 0.7, 0.9, vn( vec2( fp.x * 0.22 - uTime * sp * 0.24, fp.y * 1.7 ) ) ) * smoothstep( 0.35, 1.3, sp );
        // white riffles where the river runs fast: short bands of broken water standing across the
        // current, flickering as it pours over them
        vec2 rq = vec2( fp.x * 0.85 - uTime * sp * 0.35, fp.y * 0.55 );
        float riffle = smoothstep( 0.56, 0.74, vn( rq ) * 0.65 + vn( rq * 2.7 + 1.3 ) * 0.35 ) * smoothstep( 0.9, 1.9, sp ) * ( 0.55 + 0.45 * vn( vW.xz * 2.2 + uTime * 2.0 ) );
        streak = max( streak, riffle * 0.8 );
        // a lacy line of foam where the water laps the bank
        // (it breathes in and out, as little waves run up the bank and slide back)
        float lap = 0.5 + 0.5 * sin( uTime * 1.3 + vn( vW.xz * 0.35 ) * 6.283 );
        float rim = ( 1.0 - smoothstep( 0.08 + lap * 0.1, 0.36 + lap * 0.2, depth ) ) * smoothstep( 0.3, 0.62, vn( vW.xz * 1.3 + uTime * 0.25 ) );
        // white water churning where the falls land, with rings rolling out over the pool
        float fd = length( vW.xz - uFalls.xz );
        float churn = ( 1.0 - smoothstep( 1.5, 7.5, fd ) ) * ( 0.55 + 0.45 * vn( vW.xz * 0.9 - vec2( uTime * 1.6, 0.0 ) ) );
        churn += ( 1.0 - smoothstep( 4.0, 11.0, fd ) ) * smoothstep( 0.7, 0.95, sin( fd * 1.4 - uTime * 3.2 ) * 0.5 + 0.5 ) * 0.5;
        // splash rings where a fish jumped
        float rings = 0.0;
        for ( int k = 0; k < ${MAX_SPLASH}; k++ ) {
          float age = uTime - uSplash[k].z;
          if ( age < 0.0 || age > 2.0 ) continue;
          float d = length( vW.xz - uSplash[k].xy );
          rings += smoothstep( 0.22, 0.0, abs( d - age * 1.8 ) ) * ( 1.0 - age / 2.0 ) * uSplash[k].w + smoothstep( 0.18, 0.0, abs( d - age * 1.1 ) ) * ( 1.0 - age / 2.0 ) * 0.6 * uSplash[k].w;
        }
        float foam = clamp( streak * 0.75 + rim * 0.8 + churn + rings, 0.0, 1.0 );
        col = mix( col, vec3( 0.97, 1.0, 1.0 ) * mix( 1.0, 0.55, uGlow ), foam * 0.85 );
        alpha = max( alpha, foam * 0.92 );
        // leaves floating down the river (cells carried by the flow)
        if ( sp > 0.35 ) {
          vec2 q = ( vW.xz - fl * uTime * 0.9 ) * 0.38;
          vec2 cid = floor( q );
          float hh = h2( cid );
          if ( hh > 0.9 ) {
            vec2 lp = fract( q ) - 0.5 + vec2( h2( cid + 3.1 ) - 0.5, h2( cid + 7.3 ) - 0.5 ) * 0.4;
            float a = hh * 40.0 + uTime * 0.3;
            lp = mat2( cos( a ), -sin( a ), sin( a ), cos( a ) ) * lp;
            float leaf = 1.0 - smoothstep( 0.07, 0.1, length( lp * vec2( 1.0, 2.3 ) ) );
            vec3 lc = mix( vec3( 0.42, 0.62, 0.18 ), vec3( 0.86, 0.56, 0.16 ), step( 0.95, hh ) );
            col = mix( col, lc * mix( 1.0, 0.4, uGlow ), leaf );
            alpha = max( alpha, leaf );
          }
        }
        // dusk and night: the water darkens and holds the last of the sky
        col *= mix( 1.0, 0.42, uGlow );
        if ( under ) {
          // from below: the bright, rippling underside of the surface
          col = mix( vec3( 0.35, 0.75, 0.72 ), vec3( 0.75, 0.95, 0.92 ), smoothstep( 0.3, 0.7, ripples( p * 2.0 + uTime * 0.2 ) ) ) * mix( 1.0, 0.35, uGlow );
          alpha = 0.55;
        }
        #ifdef USE_FOG
          col = mix( col, fogColor, fantasyFog() );
        #endif
        gl_FragColor = vec4( col, alpha * wet );
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "waterways-water";
  mesh.renderOrder = 2;
  return {
    mesh,
    uniforms,
    tris: idx.length / 3,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
