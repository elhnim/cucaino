// Dino Isle's fire, lava, light, smoke and weather (island-local coordinates):
//   - one additive mesh: the torches' dancing flames (the gate towers, the trail, the camp fire),
//     the volcano's glowing lava lake and the lava streaks creeping down its gullies (brighter at
//     night), a soft glow rising out of the crater, and the ice cave's blue shimmer
//   - one set of glowing points: torch halos, embers spitting from the crater, fireflies over the
//     swamp and jungle at night, sparks off the camp fire, and the sleepy T-rex's "Zzz" bubbles
//   - one set of soft puffs: the volcano's smoke plume, steaming vents, the waterfall's mist, the
//     camp fire's smoke — and snow drifting down over the Ice Age valley
// Everything is preallocated; update() only writes into existing arrays.
import * as THREE from "three";
import { DINO_CAMP, DINO_CAVE, DINO_ICE, DINO_ISLAND, DINO_PROPS, DINO_SWAMP, DINO_TORCHES, DINO_VOLCANO, DINO_WATERFALL, dinoLandY, dinoRng } from "../../registry/dinoIsland";

const X0 = DINO_ISLAND.x;
const Z0 = DINO_ISLAND.z;

export interface FxUniforms {
  uTime: { value: number };
  uFire: { value: number };
  uLava: { value: number };
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
}

/** write one RGBA (no temporary arrays) */
function set4(a: Float32Array, j: number, r: number, g: number, b: number, w: number) {
  a[j * 4] = r;
  a[j * 4 + 1] = g;
  a[j * 4 + 2] = b;
  a[j * 4 + 3] = w;
}

const FOG = /* glsl */ `
  uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
  float fogK( float d ) { return smoothstep( uFogNear, uFogFar, d ); }
`;

// (flame kinds)
const F_TORCH = 0;
const F_LAVA = 1;
const F_STREAK = 2;
const F_COLUMN = 3;
const F_ICE = 4;

/** the lava streaks: down the volcano's gullies (the valleys of its ridged flanks) */
export function lavaStreakAngles(): number[] {
  const out: number[] = [];
  for (let k = 0; k < 7; k++) out.push((-Math.PI / 2 - 0.5 + Math.PI * 2 * k) / 7);
  return out;
}

export function buildFlames(U: FxUniforms, low: boolean): THREE.Mesh {
  const pos: number[] = [];
  const which: number[] = [];
  const uvh: number[] = [];
  const uvx: number[] = [];
  const v = (x: number, y: number, z: number, k: number, h: number, w: number) => {
    pos.push(x, y, z);
    which.push(k);
    uvh.push(h);
    uvx.push(w);
  };
  const flame = (cx: number, cy: number, cz: number, a: number, w: number, h: number) => {
    const dx = Math.cos(a) * w;
    const dz = -Math.sin(a) * w;
    v(cx, cy, cz, F_TORCH, 0, 0);
    v(cx - dx, cy + h * 0.35, cz - dz, F_TORCH, 0.35, -1);
    v(cx, cy + h, cz, F_TORCH, 1, 0);
    v(cx, cy, cz, F_TORCH, 0, 0);
    v(cx, cy + h, cz, F_TORCH, 1, 0);
    v(cx + dx, cy + h * 0.35, cz + dz, F_TORCH, 0.35, 1);
  };
  const rnd = dinoRng(55);
  const fires = [...DINO_TORCHES.map((t) => ({ x: t.x, y: t.y, z: t.z, big: t.y - (dinoLandY(t.x, t.z) ?? 0) > 5 }))];
  const camp = { x: DINO_CAMP.x, z: DINO_CAMP.z, y: (dinoLandY(DINO_CAMP.x, DINO_CAMP.z) ?? 3) + 0.12 };
  for (const f of fires) {
    const n = f.big ? 6 : 4;
    for (let i = 0; i < n; i++) flame(f.x - X0 + (rnd() - 0.5) * 0.2, f.y - 0.05, f.z - Z0 + (rnd() - 0.5) * 0.2, (i / n) * Math.PI, (f.big ? 0.42 : 0.24) + rnd() * 0.1, (f.big ? 1.6 : 0.95) + rnd() * 0.4);
  }
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2;
    flame(camp.x - X0 + Math.sin(a) * 0.25, camp.y, camp.z - Z0 + Math.cos(a) * 0.25, (i / 7) * Math.PI, 0.35 + rnd() * 0.15, 1.0 + rnd() * 0.7);
  }
  // the lava lake: a disc in the crater
  const V = DINO_VOLCANO;
  const lx = V.x - X0;
  const lz = V.z - Z0;
  const segs = low ? 12 : 18;
  for (let k = 0; k < segs; k++) {
    const a0 = (k / segs) * Math.PI * 2;
    const a1 = ((k + 1) / segs) * Math.PI * 2;
    v(lx, V.lavaY, lz, F_LAVA, 0, 0);
    v(lx + Math.sin(a0) * V.lavaR, V.lavaY, lz + Math.cos(a0) * V.lavaR, F_LAVA, 1, a0);
    v(lx + Math.sin(a1) * V.lavaR, V.lavaY, lz + Math.cos(a1) * V.lavaR, F_LAVA, 1, a1);
  }
  // the lava streaks: ribbons down the gullies, hugging the rock
  const angles = lavaStreakAngles().filter((_, i) => !low || i % 2 === 0);
  for (const a of angles) {
    const steps = 9;
    const r0 = V.craterR + 0.8;
    const r1 = V.r * (0.55 + ((Math.round(a * 100) % 5) / 5) * 0.12);
    const ptsL: number[][] = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const r = r0 + (r1 - r0) * u;
      const wig = Math.sin(u * 7 + a * 3) * 0.6;
      const px = V.x + Math.sin(a) * r + Math.cos(a) * wig;
      const pz = V.z + Math.cos(a) * r - Math.sin(a) * wig;
      const w = 0.75 * (1 - u * 0.55);
      const L = [px - Math.cos(a) * w, pz + Math.sin(a) * w];
      const R = [px + Math.cos(a) * w, pz - Math.sin(a) * w];
      ptsL.push([L[0] - X0, (dinoLandY(L[0], L[1]) ?? 10) + 0.14, L[1] - Z0, R[0] - X0, (dinoLandY(R[0], R[1]) ?? 10) + 0.14, R[1] - Z0, u]);
    }
    for (let i = 0; i < steps; i++) {
      const A = ptsL[i];
      const B = ptsL[i + 1];
      v(A[0], A[1], A[2], F_STREAK, A[6], -1);
      v(B[0], B[1], B[2], F_STREAK, B[6], -1);
      v(A[3], A[4], A[5], F_STREAK, A[6], 1);
      v(A[3], A[4], A[5], F_STREAK, A[6], 1);
      v(B[0], B[1], B[2], F_STREAK, B[6], -1);
      v(B[3], B[4], B[5], F_STREAK, B[6], 1);
    }
  }
  // a soft glow rising out of the crater (crossed quads)
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    const dx = Math.cos(a) * V.craterR * 0.9;
    const dz = -Math.sin(a) * V.craterR * 0.9;
    const y0 = V.lavaY;
    const y1 = V.rimY + 9;
    v(lx - dx, y0, lz - dz, F_COLUMN, 0, -1);
    v(lx + dx, y0, lz + dz, F_COLUMN, 0, 1);
    v(lx - dx * 1.6, y1, lz - dz * 1.6, F_COLUMN, 1, -1);
    v(lx + dx, y0, lz + dz, F_COLUMN, 0, 1);
    v(lx + dx * 1.6, y1, lz + dz * 1.6, F_COLUMN, 1, 1);
    v(lx - dx * 1.6, y1, lz - dz * 1.6, F_COLUMN, 1, -1);
  }
  // the ice cave's shimmer: a soft blue sheet across the inside of the mouth
  {
    const C = DINO_CAVE;
    const fx = Math.sin(C.rot);
    const fz = Math.cos(C.rot);
    const sx = fz;
    const sz = -fx;
    const cx = C.x - X0 - fx * 2.5;
    const cz = C.z - Z0 - fz * 2.5;
    const w = C.half * 0.95;
    const y0 = C.floorY + 0.1;
    const y1 = C.floorY + 2.8;
    v(cx - sx * w, y0, cz - sz * w, F_ICE, 0, -1);
    v(cx + sx * w, y0, cz + sz * w, F_ICE, 0, 1);
    v(cx - sx * w, y1, cz - sz * w, F_ICE, 1, -1);
    v(cx + sx * w, y0, cz + sz * w, F_ICE, 0, 1);
    v(cx + sx * w, y1, cz + sz * w, F_ICE, 1, 1);
    v(cx - sx * w, y1, cz - sz * w, F_ICE, 1, -1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aWhich", new THREE.Float32BufferAttribute(which, 1));
  geo.setAttribute("aH", new THREE.Float32BufferAttribute(uvh, 1));
  geo.setAttribute("aX", new THREE.Float32BufferAttribute(uvx, 1));
  geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aWhich; attribute float aH; attribute float aX;
      uniform float uTime; uniform float uFire; uniform float uLava;
      varying float vH; varying float vX; varying float vWhich; varying float vDist; varying vec3 vP;
      void main() {
        vec3 p = position;
        if ( aWhich < 0.5 ) {
          float ph = position.x * 3.1 + position.z * 2.3;
          float grow = ( 0.5 + 0.5 * uFire ) * ( 0.85 + 0.2 * sin( uTime * 7.0 + ph ) + 0.1 * sin( uTime * 13.0 + ph * 2.0 ) );
          p.y += ( grow - 1.0 ) * aH * 1.4;
          p.x += sin( uTime * 9.0 + ph + p.y * 3.0 ) * 0.1 * aH;
          p.z += cos( uTime * 8.0 + ph - p.y * 2.0 ) * 0.1 * aH;
        } else if ( aWhich < 1.5 ) {
          p.y += sin( uTime * 1.3 + aX * 3.0 ) * 0.08 * aH;
        } else if ( aWhich > 2.5 && aWhich < 3.5 ) {
          p.x += sin( uTime * 0.7 + aH * 2.0 ) * 0.8 * aH;
        }
        vH = aH; vX = aX; vWhich = aWhich; vP = position;
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${FOG}
      uniform float uTime; uniform float uFire; uniform float uLava;
      varying float vH; varying float vX; varying float vWhich; varying float vDist; varying vec3 vP;
      float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      void main() {
        vec3 col; float a;
        if ( vWhich < 0.5 ) {
          col = mix( vec3( 1.0, 0.95, 0.55 ), vec3( 1.0, 0.45, 0.12 ), smoothstep( 0.1, 0.6, vH ) );
          col = mix( col, vec3( 0.9, 0.15, 0.1 ), smoothstep( 0.6, 1.0, vH ) );
          a = ( 1.0 - smoothstep( 0.55, 1.0, vH ) * 0.8 ) * ( 0.3 + 0.7 * uFire );
        } else if ( vWhich < 1.5 ) {
          // bubbling lava: bright cracks between darker crusts, slowly churning
          vec2 q = vP.xz * 1.3 + vec2( sin( uTime * 0.3 ), cos( uTime * 0.23 ) );
          float n = hash( floor( q ) ) * 0.5 + hash( floor( q * 2.1 + uTime * 0.2 ) ) * 0.5;
          col = mix( vec3( 1.0, 0.35, 0.08 ), vec3( 1.0, 0.85, 0.3 ), smoothstep( 0.5, 0.95, n ) );
          a = ( 0.75 + 0.25 * sin( uTime * 2.0 + n * 6.0 ) ) * ( 0.7 + 0.5 * uLava );
        } else if ( vWhich < 2.5 ) {
          // a lava streak: pulses of bright molten rock creeping downhill, cooler at the edges and the toe
          float pulse = 0.55 + 0.45 * sin( vH * 18.0 - uTime * 1.2 );
          float edge = 1.0 - abs( vX );
          col = mix( vec3( 0.9, 0.18, 0.05 ), vec3( 1.0, 0.72, 0.2 ), pulse * edge );
          a = smoothstep( 0.0, 0.5, edge ) * ( 1.0 - smoothstep( 0.7, 1.0, vH ) ) * ( 0.45 + 0.55 * uLava ) * ( 0.7 + 0.3 * pulse );
        } else if ( vWhich < 3.5 ) {
          col = vec3( 1.0, 0.45, 0.15 );
          a = pow( 1.0 - vH, 1.6 ) * ( 1.0 - abs( vX ) ) * ( 0.05 + 0.16 * uLava ) * ( 0.8 + 0.2 * sin( uTime * 1.7 ) );
        } else {
          col = vec3( 0.35, 0.7, 1.0 );
          a = ( 0.12 + 0.1 * sin( uTime * 1.3 + vP.y * 2.0 ) ) * ( 1.0 - vH * 0.7 ) * ( 1.0 - abs( vX ) * 0.6 );
        }
        a *= 1.0 - fogK( vDist );
        gl_FragColor = vec4( col * a, a );
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "dino-flames";
  mesh.renderOrder = 3;
  return mesh;
}

// ── points (glow + puffs) ──

function pointsMaterial(U: FxUniforms, additive: boolean, uPx: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uPx },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aCol; attribute float aSize;
      uniform float uPx;
      varying vec4 vCol; varying float vDist;
      void main() {
        vCol = aCol;
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
        if ( r > 1.0 ) discard;
        float f = 1.0 - fogK( vDist );
        ${
          additive
            ? `float k = pow( 1.0 - r, 2.2 ) + ( 1.0 - smoothstep( 0.0, 0.18, r ) ) * 0.8;
        gl_FragColor = vec4( vCol.rgb * k * vCol.a * f, 1.0 );`
            : `float k = smoothstep( 1.0, 0.55, r ) * ( 0.8 + 0.2 * smoothstep( 0.2, 0.9, q.y + 0.5 ) );
        gl_FragColor = vec4( mix( vCol.rgb, uFogColor, 1.0 - f ), vCol.a * k * f );`
        }
      }`,
  });
}

export interface DinoFx {
  flames: THREE.Mesh;
  glow: THREE.Points;
  smoke: THREE.Points;
  update(dt: number, t: number, o: { glow: number; fire: number; nap: { x: number; y: number; z: number } | null; kid: { x: number; z: number } }): void;
  dispose(): void;
}

export function buildFx(U: FxUniforms, low: boolean): DinoFx {
  const uPx = { value: 600 };
  const vp = new THREE.Vector4();
  const setPx = (r: THREE.WebGLRenderer, _s: THREE.Scene, cam: THREE.Camera) => {
    r.getCurrentViewport(vp);
    const pc = cam as THREE.PerspectiveCamera;
    uPx.value = vp.w / (2 * Math.tan(((pc.fov ?? 45) * Math.PI) / 360));
  };
  const flames = buildFlames(U, low);
  const rnd = dinoRng(909);
  const V = DINO_VOLCANO;

  // ── glow points: torches, crater, embers, fireflies, camp sparks, Zzz ──
  const nT = DINO_TORCHES.length;
  const nEmber = low ? 10 : 20;
  const nFly = low ? 14 : 28;
  const nSpark = low ? 6 : 12;
  const nZ = 3;
  const iCrater = nT;
  const iCamp = nT + 1;
  const iEmber = nT + 2;
  const iFly = iEmber + nEmber;
  const iSpark = iFly + nFly;
  const iZ = iSpark + nSpark;
  const nG = iZ + nZ;
  const gPos = new Float32Array(nG * 3);
  const gCol = new Float32Array(nG * 4);
  const gSize = new Float32Array(nG);
  DINO_TORCHES.forEach((t, i) => gPos.set([t.x - X0, t.y + 0.4, t.z - Z0], i * 3));
  gPos.set([V.x - X0, V.lavaY + 1.5, V.z - Z0], iCrater * 3);
  const campY = (dinoLandY(DINO_CAMP.x, DINO_CAMP.z) ?? 3) + 0.8;
  gPos.set([DINO_CAMP.x - X0, campY, DINO_CAMP.z - Z0], iCamp * 3);
  const ember = Array.from({ length: nEmber }, () => ({ t0: rnd() * 4, sp: 0.5 + rnd() * 0.5, a: rnd() * Math.PI * 2, r: rnd() * 2.5, h: 6 + rnd() * 8 }));
  // fireflies drift over the swamp and the jungle by the lagoon
  const flyHomes: [number, number][] = [
    [DINO_SWAMP.x - X0, DINO_SWAMP.z - Z0],
    [DINO_SWAMP.x - X0 + 8, DINO_SWAMP.z - Z0 + 3],
    [DINO_SWAMP.x - X0 - 8, DINO_SWAMP.z - Z0 - 2],
    [-30, 14],
    [-14, 6],
    [-20, 30],
  ];
  const fly = Array.from({ length: nFly }, (_, i) => {
    const [hx, hz] = flyHomes[i % flyHomes.length];
    return { hx, hz, hy: (dinoLandY(hx + X0, hz + Z0) ?? 2.5) + 0.7, ph: rnd() * 10, r: 2 + rnd() * 4, sp: 0.25 + rnd() * 0.4 };
  });
  const spark = Array.from({ length: nSpark }, () => ({ t0: rnd() * 2, sp: 0.8 + rnd() * 0.8, a: rnd() * Math.PI * 2, r: rnd() * 0.4 }));
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute("position", new THREE.BufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute("aCol", new THREE.BufferAttribute(gCol, 4).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute("aSize", new THREE.BufferAttribute(gSize, 1).setUsage(THREE.DynamicDrawUsage));
  gGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, 0), 130);
  const glow = new THREE.Points(gGeo, pointsMaterial(U, true, uPx));
  glow.name = "dino-glow";
  glow.renderOrder = 4;
  glow.onBeforeRender = setPx;

  // ── puffs: the volcano's plume, vents, the waterfall's mist, camp smoke, snow ──
  const nPlume = low ? 12 : 22;
  const vents = DINO_PROPS.filter((p) => p.kind === "vent");
  const nVent = vents.length * (low ? 2 : 4);
  const nMist = low ? 6 : 12;
  const nCampS = low ? 4 : 6;
  const nSnow = low ? 50 : 110;
  const jPlume = 0;
  const jVent = nPlume;
  const jMist = jVent + nVent;
  const jCamp = jMist + nMist;
  const jSnow = jCamp + nCampS;
  const nS = jSnow + nSnow;
  const sPos = new Float32Array(nS * 3);
  const sCol = new Float32Array(nS * 4);
  const sSize = new Float32Array(nS);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  sGeo.setAttribute("aCol", new THREE.BufferAttribute(sCol, 4).setUsage(THREE.DynamicDrawUsage));
  sGeo.setAttribute("aSize", new THREE.BufferAttribute(sSize, 1).setUsage(THREE.DynamicDrawUsage));
  sGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 30, 0), 140);
  const smoke = new THREE.Points(sGeo, pointsMaterial(U, false, uPx));
  smoke.name = "dino-smoke";
  smoke.renderOrder = 1;
  smoke.onBeforeRender = setPx;
  const snow = Array.from({ length: nSnow }, () => {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * DINO_ICE.r * 0.95;
    return { x: DINO_ICE.x - X0 + Math.sin(a) * r, z: DINO_ICE.z - Z0 + Math.cos(a) * r, ph: rnd() * 30, sp: 0.6 + rnd() * 0.5, w: rnd() * 6 };
  });
  const F = DINO_WATERFALL;
  const mistX = F.x - X0 + Math.sin(F.rot) * 2.2;
  const mistZ = F.z - Z0 + Math.cos(F.rot) * 2.2;
  const mistSeed = Array.from({ length: nMist }, () => ({ a: rnd() * Math.PI * 2, r: rnd() * 2.2, t0: rnd() * 3 }));
  const wind = { x: 0.86, z: 0.5 };

  return {
    flames,
    glow,
    smoke,
    update(_dt, t, o) {
      const g = o.glow;
      // torches: lit at dusk and by night
      for (let i = 0; i < nT; i++) {
        const k = o.fire * (0.85 + 0.15 * Math.sin(t * 7 + i * 1.7)) * (0.4 + 0.6 * g);
        set4(gCol, i, 1, 0.62, 0.3, k);
        gSize[i] = 1.8 + g * 1.4;
      }
      set4(gCol, iCrater, 1, 0.4, 0.1, 0.25 + g * 0.4);
      gSize[iCrater] = 8 + g * 5 + Math.sin(t * 1.7) * 1.2;
      set4(gCol, iCamp, 1, 0.55, 0.2, (0.3 + g * 0.6) * (0.9 + 0.1 * Math.sin(t * 8.3)));
      gSize[iCamp] = 3 + g * 2;
      // embers spitting out of the crater
      for (let i = 0; i < nEmber; i++) {
        const e = ember[i];
        const age = (t * e.sp + e.t0) % 4;
        const u = age / 4;
        const j = iEmber + i;
        gPos[j * 3] = V.x - X0 + Math.sin(e.a) * (e.r + u * 4);
        gPos[j * 3 + 1] = V.lavaY + 1 + Math.sin(u * Math.PI) * e.h;
        gPos[j * 3 + 2] = V.z - Z0 + Math.cos(e.a) * (e.r + u * 4);
        set4(gCol, j, 1, 0.6 - u * 0.3, 0.2, (1 - u) * (0.6 + g * 0.8));
        gSize[j] = 0.45;
      }
      // fireflies (night)
      for (let i = 0; i < nFly; i++) {
        const f = fly[i];
        const j = iFly + i;
        const a = t * f.sp + f.ph;
        gPos[j * 3] = f.hx + Math.sin(a) * f.r + Math.sin(a * 2.3) * 0.6;
        gPos[j * 3 + 1] = f.hy + Math.sin(a * 1.7) * 0.5 + 0.4;
        gPos[j * 3 + 2] = f.hz + Math.cos(a * 0.8) * f.r;
        const blink = Math.max(0, Math.sin(t * 2.2 + f.ph * 3));
        set4(gCol, j, 0.75, 1.0, 0.5, Math.max(0, g - 0.35) * blink * 1.6);
        gSize[j] = 0.45;
      }
      // camp fire sparks
      for (let i = 0; i < nSpark; i++) {
        const s = spark[i];
        const j = iSpark + i;
        const age = (t * s.sp + s.t0) % 2.2;
        gPos[j * 3] = DINO_CAMP.x - X0 + Math.sin(s.a + age) * (s.r + age * 0.3);
        gPos[j * 3 + 1] = campY - 0.4 + age * 1.5;
        gPos[j * 3 + 2] = DINO_CAMP.z - Z0 + Math.cos(s.a + age) * (s.r + age * 0.3);
        set4(gCol, j, 1, 0.7, 0.3, (1 - age / 2.2) * (0.5 + g));
        gSize[j] = 0.3;
      }
      // the napping T-rex: z... z.. Z (three bubbles rising and swelling in turn)
      for (let i = 0; i < nZ; i++) {
        const j = iZ + i;
        const u = (t * 0.45 + i / nZ) % 1;
        if (o.nap) {
          gPos[j * 3] = o.nap.x - X0 + Math.sin(u * 5 + i) * 0.5 + u * 1.2;
          gPos[j * 3 + 1] = o.nap.y + u * 3.2;
          gPos[j * 3 + 2] = o.nap.z - Z0;
          set4(gCol, j, 0.85, 0.92, 1.0, Math.sin(u * Math.PI) * 0.9);
          gSize[j] = 0.5 + u * 0.9;
        } else gCol[j * 4 + 3] = 0;
      }
      gGeo.attributes.position.needsUpdate = true;
      gGeo.attributes.aCol.needsUpdate = true;
      gGeo.attributes.aSize.needsUpdate = true;
      // the volcano's plume: big grey puffs rising high and drifting downwind
      for (let k = 0; k < nPlume; k++) {
        const j = jPlume + k;
        const life = 14;
        const age = (t + (k / nPlume) * life) % life;
        const u = age / life;
        sPos[j * 3] = V.x - X0 + wind.x * age * 1.6 * u + Math.sin(age * 0.7 + k) * 1.2;
        sPos[j * 3 + 1] = V.rimY + 1 + age * 2.2;
        sPos[j * 3 + 2] = V.z - Z0 + wind.z * age * 1.6 * u + Math.cos(age * 0.6 + k) * 1.2;
        const sh = 0.72 - g * 0.45 + (1 - u) * 0.08;
        set4(sCol, j, sh, sh * 0.96, sh * 0.95 + g * 0.05, Math.min(1, u * 5) * (1 - u) * 0.75);
        sSize[j] = 3.5 + u * 9;
      }
      // steaming vents
      for (let e = 0; e < vents.length; e++) {
        const vt = vents[e];
        const per = nVent / vents.length;
        for (let k = 0; k < per; k++) {
          const j = jVent + e * per + k;
          const life = 3.5;
          const age = (t + (k / per) * life + e * 0.7) % life;
          const u = age / life;
          sPos[j * 3] = vt.x - X0 + wind.x * age * 0.5;
          sPos[j * 3 + 1] = vt.y + 0.3 + age * 1.1;
          sPos[j * 3 + 2] = vt.z - Z0 + wind.z * age * 0.5;
          set4(sCol, j, 0.96 - g * 0.5, 0.96 - g * 0.5, 0.94 - g * 0.42, Math.min(1, u * 6) * (1 - u) * 0.55);
          sSize[j] = 0.9 + u * 2.2;
        }
      }
      // the waterfall's mist
      for (let k = 0; k < nMist; k++) {
        const m = mistSeed[k];
        const j = jMist + k;
        const life = 3;
        const age = (t + m.t0) % life;
        const u = age / life;
        sPos[j * 3] = mistX + Math.sin(m.a) * (m.r + u * 1.5);
        sPos[j * 3 + 1] = F.bottom + 0.3 + u * 2.2;
        sPos[j * 3 + 2] = mistZ + Math.cos(m.a) * (m.r + u * 1.5);
        set4(sCol, j, 1, 1, 1, Math.min(1, u * 5) * (1 - u) * 0.5);
        sSize[j] = 1.2 + u * 2;
      }
      // camp fire smoke
      for (let k = 0; k < nCampS; k++) {
        const j = jCamp + k;
        const life = 5;
        const age = (t + (k / nCampS) * life) % life;
        const u = age / life;
        sPos[j * 3] = DINO_CAMP.x - X0 + wind.x * age * 0.5;
        sPos[j * 3 + 1] = campY + 0.5 + age * 0.9;
        sPos[j * 3 + 2] = DINO_CAMP.z - Z0 + wind.z * age * 0.5;
        const sh = 0.9 - g * 0.4;
        set4(sCol, j, sh, sh, sh, Math.min(1, u * 6) * (1 - u) * 0.45 * o.fire);
        sSize[j] = 0.8 + u * 1.8;
      }
      // snow drifting down over the Ice Age valley
      for (let k = 0; k < nSnow; k++) {
        const s = snow[k];
        const j = jSnow + k;
        const fall = 14;
        const u = ((t * s.sp * 0.1 + s.ph / 30) % 1 + 1) % 1;
        const x = s.x + Math.sin(t * 0.5 + s.w) * 1.2;
        const z = s.z + Math.cos(t * 0.4 + s.w) * 1.2;
        const gy = dinoLandY(x + X0, z + Z0) ?? 3;
        sPos[j * 3] = x;
        sPos[j * 3 + 1] = gy + fall * (1 - u);
        sPos[j * 3 + 2] = z;
        set4(sCol, j, 1, 1, 1, Math.min(1, (1 - u) * 6) * Math.min(1, u * 8) * 0.9);
        sSize[j] = 0.16;
      }
      sGeo.attributes.position.needsUpdate = true;
      sGeo.attributes.aCol.needsUpdate = true;
      sGeo.attributes.aSize.needsUpdate = true;
      void o.kid;
    },
    dispose() {
      flames.geometry.dispose();
      (flames.material as THREE.Material).dispose();
      gGeo.dispose();
      (glow.material as THREE.Material).dispose();
      sGeo.dispose();
      (smoke.material as THREE.Material).dispose();
    },
  };
}
