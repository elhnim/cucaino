// Frostpeak's light and sparkle (island-local coordinates):
//   - the aurora: a few long, rippling curtains high over the island — green with a bright lower
//     hem, teal higher up and a pink-violet top, streaked with shimmering vertical rays and pulses
//     of light rolling along them — at night, fading out as you sail away (one additive mesh)
//   - glints (additive points): sun-glitter on the snow by day (a soft blue twinkle at night), lamp,
//     window and campfire halos, the radio mast's blinking light, and glowing ice crystals at night
//   - flakes (points): gentle snowfall round the kid while they're on or near the island, plus a
//     pool of short-lived particles — splash droplets, snow puffs from the sliding penguins, and
//     bubbles rising from swimmers
// Everything is preallocated; update() only writes into existing arrays.
import * as THREE from "three";
import { FROST_ISLAND, FROST_LAMPS, FROST_PROPS, FROST_WATER_Y, FROST_HUT, frostLandY, frostRng, frostGroundY } from "../../registry/frostIsland";

const X0 = FROST_ISLAND.x;
const Z0 = FROST_ISLAND.z;
const WY = FROST_WATER_Y;

export interface FxUniforms {
  uTime: { value: number };
  uAurora: { value: number };
  uGlow: { value: number };
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
}

const FOG = /* glsl */ `
  uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
  float fogK( float d ) { return smoothstep( uFogNear, uFogFar, d ); }
`;

// ── the aurora ──

/** the curtains (island-local): centre x, z, heading, length, base height, height */
export const AURORA_CURTAINS: [number, number, number, number, number, number][] = [
  [-10, -18, 0.35, 230, 64, 58],
  [22, 26, -0.25, 190, 74, 46],
  [-42, 44, 0.95, 170, 58, 62],
  [46, -52, 1.35, 150, 80, 40],
];

export function buildAurora(U: FxUniforms, low: boolean): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const perp: number[] = [];
  const seedA: number[] = [];
  const idx: number[] = [];
  const curtains = low ? AURORA_CURTAINS.slice(0, 3) : AURORA_CURTAINS;
  const segs = low ? 40 : 72;
  const rows = [0, 0.18, 0.5, 1];
  curtains.forEach(([cx, cz, ang, len, base, h], ci) => {
    const dx = Math.sin(ang);
    const dz = Math.cos(ang);
    const b0 = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const s = (u - 0.5) * len;
      // a lazy S-curve along its length
      const wig = Math.sin(u * 5.2 + ci * 1.7) * 14 + Math.sin(u * 11 + ci) * 4;
      const x = cx + dx * s + dz * wig;
      const z = cz + dz * s - dx * wig;
      // (the local sideways direction, for the folds)
      const du = 1 / segs;
      const wig2 = Math.sin((u + du) * 5.2 + ci * 1.7) * 14 + Math.sin((u + du) * 11 + ci) * 4;
      const tx = dx * len * du + dz * (wig2 - wig);
      const tz = dz * len * du - dx * (wig2 - wig);
      const tl = Math.hypot(tx, tz) || 1;
      for (const v of rows) {
        pos.push(x, base + v * h + Math.sin(u * 7 + ci) * 5 * (1 - v), z);
        uv.push(u, v);
        perp.push(tz / tl, 0, -tx / tl);
        seedA.push(ci * 3.1 + 0.7);
      }
    }
    const R = rows.length;
    for (let i = 0; i < segs; i++)
      for (let r = 0; r < R - 1; r++) {
        const a = b0 + i * R + r;
        const b = b0 + (i + 1) * R + r;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aUV", new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute("aPerp", new THREE.Float32BufferAttribute(perp, 3));
  geo.setAttribute("aSeed", new THREE.Float32BufferAttribute(seedA, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uAurora: U.uAurora },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec2 aUV; attribute vec3 aPerp; attribute float aSeed;
      uniform float uTime;
      varying vec2 vUV; varying float vSeed;
      void main() {
        vec3 p = position;
        float u = aUV.x; float v = aUV.y;
        // the curtain folds and ripples, the top drifting more than the hem
        float fold = sin( u * 17.0 + uTime * 0.32 + aSeed ) * 6.0 + sin( u * 43.0 - uTime * 0.55 + aSeed * 2.0 ) * 1.8;
        p += aPerp * fold * ( 0.55 + 0.45 * v );
        p.y += sin( u * 13.0 + uTime * 0.23 + aSeed ) * 3.5 * ( 1.0 - v );
        vUV = aUV; vSeed = aSeed;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( p, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uAurora;
      varying vec2 vUV; varying float vSeed;
      float h1( float x ) { return fract( sin( x * 127.1 ) * 43758.5453 ); }
      float n1( float x ) { float i = floor( x ); float f = fract( x ); f = f * f * ( 3.0 - 2.0 * f ); return mix( h1( i ), h1( i + 1.0 ), f ); }
      void main() {
        float u = vUV.x; float v = vUV.y;
        // shimmering vertical rays
        float rays = n1( u * 95.0 + uTime * 0.45 + vSeed ) * 0.6 + n1( u * 240.0 - uTime * 1.1 + vSeed * 3.0 ) * 0.4;
        rays = pow( rays, 2.0 );
        // pulses of light rolling along the curtain
        float pulse = 0.5 + 0.5 * sin( u * 9.0 - uTime * 0.65 + vSeed );
        pulse = 0.45 + 0.55 * pulse * pulse;
        // a bright hem, fading upward; soft ends
        float edge = smoothstep( 0.0, 0.05, v ) * pow( 1.0 - v, 1.3 );
        float ends = smoothstep( 0.0, 0.12, u ) * smoothstep( 1.0, 0.86, u );
        vec3 green = vec3( 0.2, 1.0, 0.5 );
        vec3 teal = vec3( 0.15, 0.85, 0.95 );
        vec3 pink = vec3( 0.95, 0.3, 0.85 );
        vec3 col = mix( green, teal, smoothstep( 0.2, 0.6, v ) );
        col = mix( col, pink, smoothstep( 0.55, 0.95, v ) * 0.85 );
        col += vec3( 0.55, 1.0, 0.75 ) * ( 1.0 - smoothstep( 0.02, 0.14, v ) ) * 0.6;
        float k = ( 0.3 + 0.7 * rays ) * pulse * edge * ends * uAurora;
        gl_FragColor = vec4( col * k, k );
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "frost-aurora";
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  return mesh;
}

// ── points ──

/** soft round points with per-point colour/alpha (aCol), size (aSize, world units) and twinkle (aTw);
 *  additive = four-pointed glints, else soft discs (fogged) */
export function pointsMaterial(U: Pick<FxUniforms, "uTime" | "uFogColor" | "uFogNear" | "uFogFar">, additive: boolean, uPx: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uFogColor: U.uFogColor, uFogNear: U.uFogNear, uFogFar: U.uFogFar, uPx },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aCol; attribute float aSize; attribute float aTw;
      uniform float uPx; uniform float uTime;
      varying vec4 vCol; varying float vDist;
      void main() {
        vCol = aCol;
        // twinkle: a quick flash now and then (aTw = its own rate; 0 = steady)
        if ( aTw > 0.0 ) vCol.a *= pow( max( 0.0, sin( uTime * 2.3 * aTw + aTw * 57.0 ) ), 10.0 );
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        vDist = -mv.z;
        gl_PointSize = aSize * uPx / max( 0.5, -mv.z );
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${FOG}
      varying vec4 vCol; varying float vDist;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float r = length( q ) * 2.0;
        if ( r > 1.0 || vCol.a < 0.003 ) discard;
        float f = 1.0 - fogK( vDist );
        ${
          additive
            ? `// a four-pointed glint
        float star = max( 1.0 - smoothstep( 0.0, 0.12, abs( q.x ) ) * 1.0, 1.0 - smoothstep( 0.0, 0.12, abs( q.y ) ) ) * ( 1.0 - r );
        float k = pow( 1.0 - r, 2.4 ) * 0.8 + star * 0.9;
        gl_FragColor = vec4( vCol.rgb * k * vCol.a * f, 1.0 );`
            : `float k = smoothstep( 1.0, 0.6, r );
        gl_FragColor = vec4( mix( vCol.rgb, uFogColor, 1.0 - f ), vCol.a * k * f );`
        }
      }`,
  });
}

export interface FrostFx {
  aurora: THREE.Mesh;
  glints: THREE.Points;
  flakes: THREE.Points;
  /** spawn particles: kind 0 big splash, 1 small splash, 2 snow puff, 3 bubbles (world coords) */
  burst(x: number, y: number, z: number, size: number, kind: number): void;
  update(dt: number, t: number, o: { glow: number; kid: THREE.Vector3; near: boolean; under: boolean }): void;
  dispose(): void;
}

const GLITTER = 260;
const FLAKES = 170;
const POOL = 220;

export function buildFx(U: FxUniforms, low: boolean): FrostFx {
  const uPx = { value: 600 };
  const vp = new THREE.Vector4();
  const setPx = (r: THREE.WebGLRenderer, _s: THREE.Scene, cam: THREE.Camera) => {
    r.getCurrentViewport(vp);
    const pc = cam as THREE.PerspectiveCamera;
    uPx.value = vp.w / (2 * Math.tan(((pc.fov ?? 45) * Math.PI) / 360));
  };
  const aurora = buildAurora(U, low);
  const rnd = frostRng(515);

  // ── glints: snow glitter, halos ──
  const nGlit = low ? GLITTER / 2 : GLITTER;
  const halos: { x: number; y: number; z: number; kind: number }[] = [];
  for (const l of FROST_LAMPS) halos.push({ x: l.x - X0, y: l.y, z: l.z - Z0, kind: 0 });
  const fire = FROST_PROPS.find((p) => p.kind === "fire");
  if (fire) halos.push({ x: fire.x - X0, y: fire.y + 0.7, z: fire.z - Z0, kind: 1 });
  // (the research station's windows and its mast's blinking tip)
  {
    const c = Math.cos(FROST_HUT.rot);
    const s = Math.sin(FROST_HUT.rot);
    const hy = frostLandY(FROST_HUT.x, FROST_HUT.z) ?? 2.7;
    const at = (lx: number, ly: number, lz: number, kind: number) => halos.push({ x: FROST_HUT.x - X0 + lx * c + lz * s, y: hy + ly, z: FROST_HUT.z - Z0 - lx * s + lz * c, kind });
    at(0.9, 2.3, 2.0, 0);
    at(1.6, 10.4, -0.8, 2);
  }
  for (const p of FROST_PROPS) if (p.kind === "crystal" && !(low && p.seed % 2)) halos.push({ x: p.x - X0, y: p.y + 1.1 * p.s, z: p.z - Z0, kind: 3 });
  const nG = nGlit + halos.length;
  const gPos = new Float32Array(nG * 3);
  const gCol = new Float32Array(nG * 4);
  const gSize = new Float32Array(nG);
  const gTw = new Float32Array(nG);
  for (let i = 0; i < nGlit; i++) {
    // sparkles on the snow (anywhere on land above the beach)
    let x = 0;
    let z = 0;
    let y = 0;
    for (let k = 0; k < 30; k++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 64;
      x = Math.sin(a) * r;
      z = Math.cos(a) * r;
      const g = frostGroundY(x + X0, z + Z0);
      if (g !== null && g > 1.4) {
        y = g + 0.12;
        break;
      }
    }
    gPos.set([x, y, z], i * 3);
    gTw[i] = 0.4 + rnd() * 1.6;
    gSize[i] = 0.35 + rnd() * 0.3;
  }
  halos.forEach((h, k) => gPos.set([h.x, h.y, h.z], (nGlit + k) * 3));
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute("position", new THREE.BufferAttribute(gPos, 3));
  gGeo.setAttribute("aCol", new THREE.BufferAttribute(gCol, 4).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute("aSize", new THREE.BufferAttribute(gSize, 1).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute("aTw", new THREE.BufferAttribute(gTw, 1));
  gGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 8, 0), 90);
  const glints = new THREE.Points(gGeo, pointsMaterial(U, true, uPx));
  glints.name = "frost-glints";
  glints.renderOrder = 4;
  glints.onBeforeRender = setPx;

  // ── flakes: snowfall + the particle pool (world-positioned: this mesh lives in the island's
  //    group, so positions are island-local) ──
  const nFlake = low ? FLAKES / 2 : FLAKES;
  const nPool = low ? POOL / 2 : POOL;
  const nF = nFlake + nPool;
  const fPos = new Float32Array(nF * 3);
  const fCol = new Float32Array(nF * 4);
  const fSize = new Float32Array(nF);
  const fTw = new Float32Array(nF);
  const flake = Array.from({ length: nFlake }, () => ({ x: rnd() * 60, y: rnd() * 26, z: rnd() * 60, sp: 0.6 + rnd() * 0.7, ph: rnd() * 10, s: 0.12 + rnd() * 0.1 }));
  // the pool
  const pv = new Float32Array(nPool * 3);
  const pLife = new Float32Array(nPool);
  const pMax = new Float32Array(nPool).fill(1);
  const pKind = new Uint8Array(nPool);
  const pSize = new Float32Array(nPool);
  let pNext = 0;
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute("position", new THREE.BufferAttribute(fPos, 3).setUsage(THREE.DynamicDrawUsage));
  fGeo.setAttribute("aCol", new THREE.BufferAttribute(fCol, 4).setUsage(THREE.DynamicDrawUsage));
  fGeo.setAttribute("aSize", new THREE.BufferAttribute(fSize, 1).setUsage(THREE.DynamicDrawUsage));
  fGeo.setAttribute("aTw", new THREE.BufferAttribute(fTw, 1));
  fGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, 0), 160);
  const flakes = new THREE.Points(fGeo, pointsMaterial(U, false, uPx));
  flakes.name = "frost-flakes";
  flakes.renderOrder = 3;
  flakes.onBeforeRender = setPx;
  let prng = 1234567;
  const r01 = () => ((prng = (prng * 16807) % 2147483647) / 2147483647);

  const spawn = (x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, kind: number) => {
    const i = pNext;
    pNext = (pNext + 1) % nPool;
    const j = (nFlake + i) * 3;
    fPos[j] = x;
    fPos[j + 1] = y;
    fPos[j + 2] = z;
    pv[i * 3] = vx;
    pv[i * 3 + 1] = vy;
    pv[i * 3 + 2] = vz;
    pLife[i] = life;
    pMax[i] = life;
    pKind[i] = kind;
    pSize[i] = size;
  };

  return {
    aurora,
    glints,
    flakes,
    burst(wx, wy, wz, size, kind) {
      const x = wx - X0;
      const z = wz - Z0;
      if (kind <= 1) {
        // a splash: a crown of droplets and a puff of spray
        const n = kind === 0 ? (low ? 9 : 16) : low ? 4 : 7;
        for (let k = 0; k < n; k++) {
          const a = r01() * Math.PI * 2;
          const sp = (0.8 + r01() * 1.8) * size;
          spawn(x + Math.sin(a) * 0.2, wy + 0.05, z + Math.cos(a) * 0.2, Math.sin(a) * sp, (2.2 + r01() * 2.8) * Math.sqrt(size), Math.cos(a) * sp, 0.7 + r01() * 0.4, (0.08 + r01() * 0.08) * (0.7 + size * 0.5), 0);
        }
        spawn(x, wy + 0.2, z, 0, 0.5, 0, 0.6, 0.45 * size + 0.2, 1);
      } else if (kind === 4) {
        // a skier's spray: a big fan of snow thrown up and out from the skis
        const n = low ? 5 : 11;
        for (let k = 0; k < n; k++) {
          const a = r01() * Math.PI * 2;
          const sp = (1.2 + r01() * 2.4) * Math.sqrt(size);
          spawn(x + Math.sin(a) * 0.4, wy + 0.15, z + Math.cos(a) * 0.4, Math.sin(a) * sp, 1.2 + r01() * 1.8, Math.cos(a) * sp, 0.9 + r01() * 0.6, 0.5 * size + 0.35, 1);
        }
      } else if (kind === 2) {
        const n = low ? 2 : 4;
        for (let k = 0; k < n; k++) {
          const a = r01() * Math.PI * 2;
          spawn(x + Math.sin(a) * 0.3, wy + 0.1, z + Math.cos(a) * 0.3, Math.sin(a) * 0.6, 0.5 + r01() * 0.6, Math.cos(a) * 0.6, 0.8 + r01() * 0.5, 0.35 * size + 0.2, 1);
        }
      } else {
        const n = low ? 1 : 3;
        for (let k = 0; k < n; k++) spawn(x + (r01() - 0.5) * 0.3, wy, z + (r01() - 0.5) * 0.3, (r01() - 0.5) * 0.2, 0.8 + r01() * 0.6, (r01() - 0.5) * 0.2, 2.5, 0.05 + r01() * 0.05, 2);
      }
    },
    update(dtIn, t, o) {
      const dt = Math.min(0.1, Math.max(0, dtIn));
      const g = o.glow;
      const day = 1 - g;
      // glitter: bright white sun glints by day, faint blue at night
      for (let i = 0; i < nGlit; i++) {
        gCol[i * 4] = 0.85 + g * 0.1;
        gCol[i * 4 + 1] = 0.95;
        gCol[i * 4 + 2] = 1.0;
        gCol[i * 4 + 3] = 0.7 * day + 0.35 * g;
      }
      for (let k = 0; k < halos.length; k++) {
        const h = halos[k];
        const j = nGlit + k;
        let r = 1;
        let gg = 0.75;
        let b = 0.4;
        let a = 0.25 + 0.9 * g;
        let s = 2 + g;
        if (h.kind === 1) {
          // the campfire
          r = 1;
          gg = 0.55;
          b = 0.2;
          a = (0.4 + 0.9 * g) * (0.85 + 0.15 * Math.sin(t * 9.3) * Math.sin(t * 5.7));
          s = 3.5 + g * 2;
        } else if (h.kind === 2) {
          // the mast's blinking light
          r = 1;
          gg = 0.25;
          b = 0.25;
          a = Math.sin(t * 3) > 0.3 ? 0.6 + g : 0.05;
          s = 1.6;
        } else if (h.kind === 3) {
          // glowing crystals
          r = 0.55;
          gg = 0.9;
          b = 1;
          a = g * (0.5 + 0.3 * Math.sin(t * 1.3 + k));
          s = 1.8;
        }
        gCol[j * 4] = r;
        gCol[j * 4 + 1] = gg;
        gCol[j * 4 + 2] = b;
        gCol[j * 4 + 3] = a;
        gSize[j] = s;
      }
      gGeo.attributes.aCol.needsUpdate = true;
      gGeo.attributes.aSize.needsUpdate = true;
      // snowfall round the kid (wrapped into a box that follows them)
      const kx = o.kid.x - X0;
      const kz = o.kid.z - Z0;
      const ky = Math.max(WY, o.kid.y);
      const BOX = 60;
      for (let i = 0; i < nFlake; i++) {
        const f = flake[i];
        f.y -= f.sp * dt;
        if (f.y < 0) f.y += 26;
        const x = kx - BOX / 2 + ((((f.x + t * 0.35 + Math.sin(t * 0.7 + f.ph) * 0.3 - kx) % BOX) + BOX) % BOX);
        const z = kz - BOX / 2 + ((((f.z + t * 0.2 - kz) % BOX) + BOX) % BOX);
        const y = ky - 4 + f.y;
        fPos[i * 3] = x;
        fPos[i * 3 + 1] = y;
        fPos[i * 3 + 2] = z;
        fCol[i * 4] = 1;
        fCol[i * 4 + 1] = 1;
        fCol[i * 4 + 2] = 1;
        fCol[i * 4 + 3] = o.near && y > WY ? 0.85 : 0;
        fSize[i] = f.s;
      }
      // the particle pool
      for (let i = 0; i < nPool; i++) {
        const j = nFlake + i;
        if (pLife[i] <= 0) {
          fCol[j * 4 + 3] = 0;
          continue;
        }
        pLife[i] -= dt;
        const u = 1 - pLife[i] / pMax[i];
        const k = pKind[i];
        if (k === 0) {
          // droplets: fly and fall; gone when they hit the water
          pv[i * 3 + 1] -= 9.8 * dt;
          fPos[j * 3] += pv[i * 3] * dt;
          fPos[j * 3 + 1] += pv[i * 3 + 1] * dt;
          fPos[j * 3 + 2] += pv[i * 3 + 2] * dt;
          if (fPos[j * 3 + 1] < WY && pv[i * 3 + 1] < 0) pLife[i] = 0;
          fCol[j * 4] = 0.9;
          fCol[j * 4 + 1] = 0.97;
          fCol[j * 4 + 2] = 1;
          fCol[j * 4 + 3] = 0.95 * (1 - u * 0.5);
          fSize[j] = pSize[i];
        } else if (k === 1) {
          // spray / snow puffs: drift, swell and fade
          const drag = Math.max(0, 1 - dt * 2.5);
          pv[i * 3] *= drag;
          pv[i * 3 + 2] *= drag;
          pv[i * 3 + 1] *= drag;
          fPos[j * 3] += pv[i * 3] * dt;
          fPos[j * 3 + 1] += pv[i * 3 + 1] * dt;
          fPos[j * 3 + 2] += pv[i * 3 + 2] * dt;
          fCol[j * 4] = 0.97;
          fCol[j * 4 + 1] = 0.99;
          fCol[j * 4 + 2] = 1;
          fCol[j * 4 + 3] = 0.55 * (1 - u) * Math.min(1, u * 8);
          fSize[j] = pSize[i] * (0.6 + u * 1.0);
        } else {
          // bubbles: wobble up, pop at the surface
          fPos[j * 3] += (pv[i * 3] + Math.sin(t * 7 + i) * 0.15) * dt;
          fPos[j * 3 + 1] += pv[i * 3 + 1] * dt;
          fPos[j * 3 + 2] += pv[i * 3 + 2] * dt;
          if (fPos[j * 3 + 1] > WY - 0.05) pLife[i] = 0;
          fCol[j * 4] = 0.85;
          fCol[j * 4 + 1] = 0.97;
          fCol[j * 4 + 2] = 1;
          fCol[j * 4 + 3] = 0.55;
          fSize[j] = pSize[i];
        }
      }
      // (from under the sea, spray above the water can't be seen; from above, bubbles can't)
      for (let i = 0; i < nPool; i++) {
        const j = nFlake + i;
        if (pLife[i] > 0 && (o.under ? pKind[i] !== 2 && fPos[j * 3 + 1] > WY : pKind[i] === 2)) fCol[j * 4 + 3] = 0;
      }
      fGeo.attributes.position.needsUpdate = true;
      fGeo.attributes.aCol.needsUpdate = true;
      fGeo.attributes.aSize.needsUpdate = true;
    },
    dispose() {
      aurora.geometry.dispose();
      (aurora.material as THREE.Material).dispose();
      gGeo.dispose();
      (glints.material as THREE.Material).dispose();
      fGeo.dispose();
      (flakes.material as THREE.Material).dispose();
    },
  };
}
