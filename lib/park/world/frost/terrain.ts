// Frostpeak Isle's ground and water, in island-local coordinates (the island's centre at the origin).
//
// Ground: the registry's height grid, triangulated exactly as frostLandY() interpolates it (so feet
// sit on the snow), flat-coloured per face — soft snowfields in broad patches of white and ice-blue,
// packed snow on the penguins' ramp, dark shingle beaches with snow drifts, grey rock on the peak's
// steep faces, banded blue ice on the east coast's cliffs, and underwater: pale gravel shading to
// cold teal and deep blue — then a coarse skirt down the island's flanks to the deep floor.
// Water (one mesh): the frozen pond's ice (aKind 0), the shallows round the beaches (1) riding the
// ocean's own (calmed) swell with foam where it runs up the shingle, and lacy foam collars round
// every ice floe and iceberg (2).
import * as THREE from "three";
import {
  FROST_BERGS,
  FROST_COLONY,
  FROST_EXTENT,
  FROST_FLOES,
  FROST_GRID,
  FROST_ISLAND,
  FROST_N,
  FROST_POND,
  FROST_SEA_R,
  FROST_WATER_Y,
  FROST_CALM_GLSL,
  FROST_ASCENT,
  FROST_SUMMIT,
  frostCalm,
  frostCliffK,
  frostChuteDistance,
  frostCoastR,
  frostFloeR,
  frostGrid,
  frostHeightAt,
  frostOnPond,
  frostPisteAt,
  frostRng,
} from "../../registry/frostIsland";
import { noise2 } from "../fantasy/noise";

const X0 = FROST_ISLAND.x;
const Z0 = FROST_ISLAND.z;
const c = (h: string) => new THREE.Color(h);
const SNOW_A = c("#f3f7ff");
const SNOW_B = c("#e2ecfa");
const SNOW_C = c("#d4e3f7");
const PACKED = c("#dde4ef");
const TRAMPLED = c("#e9ebf1");
const SHINGLE = c("#8f99a8");
const SHINGLE_L = c("#aab3c0");
const ROCK = c("#6f7888");
const ROCK_D = c("#5b6475");
const ICE_A = c("#a6e0ff");
const ICE_B = c("#72c2f2");
const ICE_C = c("#d2f0ff");
const UNDER_GRAVEL = c("#a9c0cc");
const UNDER_TEAL = c("#4d93ad");
const UNDER_DEEP = c("#23527c");
const POND_BED = c("#5c86b0");
const STAR = c("#ff8a5c");
const GROOM_A = c("#f7faff");
const GROOM_B = c("#e6effb");
const GROOM_EDGE = c("#d9e7f8");

const _c = new THREE.Color();
const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const ux = bx - ax;
  const uz = bz - az;
  const t = Math.min(1, Math.max(0, ((px - ax) * ux + (pz - az) * uz) / (ux * ux + uz * uz || 1)));
  return Math.hypot(ax + ux * t - px, az + uz * t - pz);
}
const ASC = FROST_ASCENT.map((p) => ({ x: p.x - X0, z: p.z - Z0 }));
function rampDist(x: number, z: number) {
  let d = Infinity;
  for (let i = 0; i + 1 < ASC.length; i++) d = Math.min(d, segDist(x, z, ASC[i].x, ASC[i].z, ASC[i + 1].x, ASC[i + 1].z));
  return d;
}

function faceColor(x: number, y: number, z: number, slope: number, rnd: () => number, out: THREE.Color): THREE.Color {
  // (x, z local)
  const wx = x + X0;
  const wz = z + Z0;
  const a = Math.atan2(x, z);
  const s = Math.hypot(x, z) / frostCoastR(a);
  if (frostOnPond(wx, wz)) return out.copy(POND_BED).multiplyScalar(0.92 + rnd() * 0.08);
  if (y < FROST_WATER_Y - 0.1) {
    // under the sea: pale gravel -> cold teal -> deep blue; a few orange sea stars
    if (y > -6 && rnd() < 0.02) return out.copy(STAR);
    out.copy(UNDER_GRAVEL).lerp(UNDER_TEAL, smooth(-0.5, -9, y));
    return out.lerp(UNDER_DEEP, smooth(-9, -24, y) * 0.7).multiplyScalar(0.94 + rnd() * 0.06);
  }
  const ck = frostCliffK(a);
  // the east coast's ice cliffs: banded blue ice
  if (ck > 0.3 && slope > 0.75 && s > 0.88) {
    const band = Math.sin(y * 2.3 + noise2(x / 3, z / 3, 21) * 3);
    return out.copy(band > 0.35 ? ICE_C : band > -0.3 ? ICE_A : ICE_B).multiplyScalar(0.96 + rnd() * 0.05);
  }
  // steep rock (the peak's crags, the hills' faces), streaked with ice high up; snow clings to the rest
  // the ski run: freshly groomed corduroy stripes across the piste, packed edges
  const ps = frostPisteAt(wx, wz);
  if (ps && y > 2) {
    const hw = ps.nursery ? 2.6 : 5;
    if (ps.d < hw - 0.5) return out.copy(Math.floor(ps.s / 1.15) % 2 ? GROOM_A : GROOM_B).multiplyScalar(0.99 + rnd() * 0.015);
    if (ps.d < hw + 0.6) return out.copy(GROOM_EDGE).multiplyScalar(0.98 + rnd() * 0.03);
  }
  const peakD = Math.hypot(x - (FROST_SUMMIT.x - X0), z - (FROST_SUMMIT.z - Z0));
  const built = rampDist(x, z) < 7 || frostChuteDistance(wx, wz) < 7 || (ps !== null && ps.d < 9);
  if (y > 3 && !built && ((slope > 1.2 && peakD < 30) || slope > 1.6)) {
    if (y > 18 && rnd() < 0.3) return out.copy(ICE_A);
    if (y > 30 && rnd() < 0.35) return out.copy(SNOW_C);
    return out.copy(rnd() < 0.55 ? ROCK : ROCK_D).multiplyScalar(0.95 + rnd() * 0.08);
  }
  // the beaches: dark shingle with drifts of snow
  if (ck < 0.5 && (y < 1.25 || s > 0.905)) {
    const drift = noise2(x / 5 + 7, z / 5, 22);
    if (y > 0.55 && drift > 0.55) return out.copy(SNOW_B).multiplyScalar(0.97 + rnd() * 0.03);
    return out.copy(rnd() < 0.5 ? SHINGLE : SHINGLE_L).multiplyScalar(0.94 + rnd() * 0.07);
  }
  // the penguins' ramp, and the colony's trampled snow
  if (rampDist(x, z) < 1.3) return out.copy(PACKED).multiplyScalar(0.97 + rnd() * 0.04);
  if (Math.hypot(wx - FROST_COLONY.x, wz - FROST_COLONY.z) < FROST_COLONY.r + 1) return out.copy(TRAMPLED).multiplyScalar(0.95 + rnd() * 0.06);
  // snowfields: broad soft patches (not per-face noise), bluer on shaded slopes and in hollows
  const k = noise2(x / 12 + 3, z / 12 - 7, 5);
  const k2 = noise2(x / 4.5, z / 4.5, 6);
  out.copy(SNOW_A).lerp(SNOW_B, Math.min(1, Math.max(0, (k - 0.35) * 1.8)));
  if (k2 > 0.74) out.lerp(SNOW_C, 0.55);
  if (slope > 0.55) out.lerp(SNOW_C, 0.5);
  if (slope > 0.9) out.lerp(ICE_A, 0.25);
  return out.multiplyScalar(0.985 + rnd() * 0.03);
}

/** the island's ground (land + shallows + flanks) as one flat-shaded, face-coloured mesh */
export function buildGroundGeometry(low: boolean): THREE.BufferGeometry {
  const N = FROST_N;
  const G = FROST_GRID;
  const E = FROST_EXTENT;
  const g = frostGrid();
  const rnd = frostRng(77);
  const pos: number[] = [];
  const colr: number[] = [];
  const keepR = E - 0.5;
  const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const slope = 1 - Math.abs(ny) / Math.hypot(nx, ny, nz);
    faceColor((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3, slope * 2.2, rnd, _c);
    for (let k = 0; k < 3; k++) colr.push(_c.r, _c.g, _c.b);
  };
  // the grid (cells split along the (i+1, j) – (i, j+1) diagonal, like frostLandY). Where a 2x2
  // block is well under the sea (nobody stands there) it's drawn as one coarser cell; low quality
  // also merges flat-ish snowfield blocks.
  const deep = (i: number, j: number) => {
    if (i + 2 >= N || j + 2 >= N) return false;
    for (let b = 0; b <= 2; b++) for (let a = 0; a <= 2; a++) if (g[(j + b) * N + i + a] > FROST_WATER_Y - 1.2) return false;
    return true;
  };
  for (let j = 0; j < N - 1; j++)
    for (let i = 0; i < N - 1; i++) {
      const x0 = -E + i * G;
      const z0 = -E + j * G;
      if (Math.hypot(x0 + G / 2, z0 + G / 2) > keepR) continue;
      const bi = i - (i % 2);
      const bj = j - (j % 2);
      const block = deep(bi, bj);
      if (block && (i % 2 || j % 2)) continue;
      const S = block ? 2 : 1;
      const x1 = x0 + G * S;
      const z1 = z0 + G * S;
      const k = j * N + i;
      const h00 = g[k];
      const h10 = g[k + S];
      const h01 = g[k + N * S];
      const h11 = g[k + N * S + S];
      tri(x0, h00, z0, x0, h01, z1, x1, h10, z0);
      tri(x1, h11, z1, x1, h10, z0, x0, h01, z1);
    }
  // the skirt: rings from inside the grid's edge down the flanks to the deep floor
  // (many even rings: the ink outlines catch any sudden bend in the slope, seen from under the sea)
  const segs = low ? 72 : 110;
  const rings = low ? 10 : 18;
  const r0 = E - 3;
  const r1 = FROST_SEA_R + 2;
  const ringR = (i: number) => r0 + (r1 - r0) * (i / rings);
  const hAt = (r: number, a: number) => frostHeightAt(X0 + Math.sin(a) * r, Z0 + Math.cos(a) * r);
  for (let i = 0; i < rings; i++)
    for (let k = 0; k < segs; k++) {
      const a0 = (k / segs) * Math.PI * 2;
      const a1 = ((k + 1) / segs) * Math.PI * 2;
      const ra = ringR(i);
      const rb = ringR(i + 1);
      const p = [
        [Math.sin(a0) * ra, hAt(ra, a0), Math.cos(a0) * ra],
        [Math.sin(a1) * ra, hAt(ra, a1), Math.cos(a1) * ra],
        [Math.sin(a0) * rb, hAt(rb, a0), Math.cos(a0) * rb],
        [Math.sin(a1) * rb, hAt(rb, a1), Math.cos(a1) * rb],
      ];
      // (the first ring tucks just under the grid's ragged edge; after that the rings meet exactly —
      // any little step between them shows up as an ink line from under the sea)
      const dA = i <= 1 ? -0.08 : 0;
      const dB = i === 0 ? -0.08 : 0;
      tri(p[0][0], p[0][1] + dA, p[0][2], p[2][0], p[2][1] + dB, p[2][2], p[1][0], p[1][1] + dA, p[1][2]);
      tri(p[1][0], p[1][1] + dA, p[1][2], p[2][0], p[2][1] + dB, p[2][2], p[3][0], p[3][1] + dB, p[3][2]);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  // (the underwater kit's layout: no tint / sway / glow)
  geo.setAttribute("aFx", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 3), 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// ── water ──

/** the ocean's swell (a copy of ocean.ts's seaWave, in world xz) */
export const SEA_WAVE_GLSL = /* glsl */ `
  float seaWave( vec2 p, float t ) {
    return sin( p.x * 0.08 + t * 0.9 ) * 0.35 + sin( p.y * 0.11 - t * 1.1 ) * 0.28 + sin( ( p.x + p.y ) * 0.05 + t * 0.6 ) * 0.4
         + sin( dot( p, vec2( 0.13, -0.21 ) ) + t * 1.45 ) * 0.12;
  }`;
/** the same swell in JS, calmed round Frostpeak (floating things bob on it) */
export function seaWave(x: number, z: number, t: number): number {
  return frostCalm(x, z) * (Math.sin(x * 0.08 + t * 0.9) * 0.35 + Math.sin(z * 0.11 - t * 1.1) * 0.28 + Math.sin((x + z) * 0.05 + t * 0.6) * 0.4 + Math.sin(x * 0.13 - z * 0.21 + t * 1.45) * 0.12);
}

export interface WaterUniforms {
  uTime: { value: number };
  uGlow: { value: number };
  uAurora: { value: number };
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
}

/** pond ice (aKind 0) + beach shallows (1) + foam collars round floes and bergs (2), in one mesh */
export function buildWater(low: boolean, U: WaterUniforms): THREE.Mesh {
  const pos: number[] = [];
  const kind: number[] = [];
  const floor: number[] = [];
  const edge: number[] = [];
  const idx: number[] = [];
  // the pond's ice: an ellipse fan just over the bed
  const P = FROST_POND;
  const segs = low ? 24 : 36;
  const rings = low ? 3 : 5;
  const cr = Math.cos(P.rot);
  const sr = Math.sin(P.rot);
  pos.push(P.x - X0, P.iceY, P.z - Z0);
  kind.push(0);
  floor.push(frostHeightAt(P.x, P.z));
  edge.push(0);
  for (let i = 1; i <= rings; i++) {
    const e = (1.08 * i) / rings;
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const u = Math.sin(a) * P.rx * e;
      const v = Math.cos(a) * P.rz * e;
      const x = P.x + u * cr + v * sr;
      const z = P.z - u * sr + v * cr;
      pos.push(x - X0, P.iceY, z - Z0);
      kind.push(0);
      floor.push(frostHeightAt(x, z));
      edge.push(e / 1.08);
    }
  }
  const lr = (i: number, k: number) => 1 + (i - 1) * segs + (k % segs);
  for (let k = 0; k < segs; k++) idx.push(0, lr(1, k + 1), lr(1, k));
  for (let i = 1; i < rings; i++) for (let k = 0; k < segs; k++) idx.push(lr(i, k), lr(i, k + 1), lr(i + 1, k), lr(i, k + 1), lr(i + 1, k + 1), lr(i + 1, k));
  // the shallows: a ring from under the beach out over the shelf
  const ring = (sb: number, ss: number, sRings: number, rAt: (i: number, k: number) => [number, number], kindV: number, edgeAt: (i: number) => number, y: number) => {
    for (let i = 0; i <= sRings; i++)
      for (let k = 0; k < ss; k++) {
        const [x, z] = rAt(i, k);
        pos.push(x, y, z);
        kind.push(kindV);
        floor.push(frostHeightAt(x + X0, z + Z0));
        edge.push(edgeAt(i));
      }
    const at = (i: number, k: number) => sb + i * ss + (k % ss);
    for (let i = 0; i < sRings; i++) for (let k = 0; k < ss; k++) idx.push(at(i, k), at(i, k + 1), at(i + 1, k), at(i, k + 1), at(i + 1, k + 1), at(i + 1, k));
  };
  {
    const ss = low ? 90 : 150;
    const sRings = low ? 8 : 13;
    const s0 = 0.84;
    const s1 = 1.55;
    const sOf = (i: number) => s0 + (s1 - s0) * Math.pow(i / sRings, 1.25);
    ring(
      pos.length / 3,
      ss,
      sRings,
      (i, k) => {
        const a = (k / ss) * Math.PI * 2;
        const r = frostCoastR(a) * sOf(i);
        return [Math.sin(a) * r, Math.cos(a) * r];
      },
      1,
      (i) => smooth(1.3, s1, sOf(i)),
      FROST_WATER_Y,
    );
  }
  // foam collars: floes (their wobbly outline) and bergs
  const collars: { x: number; z: number; r: (b: number) => number }[] = [
    ...FROST_FLOES.map((f) => ({ x: f.x - X0, z: f.z - Z0, r: (b: number) => frostFloeR(f, b - f.rot) })),
    ...FROST_BERGS.map((b) => ({ x: b.x - X0, z: b.z - Z0, r: (a: number) => b.r * (1.02 + 0.1 * Math.sin(3 * a + b.seed) + 0.06 * Math.sin(5 * a + b.seed * 0.7)) })),
  ];
  for (const cl of collars) {
    const ss = low ? 20 : 30;
    ring(
      pos.length / 3,
      ss,
      2,
      (i, k) => {
        const b = (k / ss) * Math.PI * 2;
        const r = cl.r(b) * (0.94 + i * 0.12) + i * 0.9;
        return [cl.x + Math.sin(b) * r, cl.z + Math.cos(b) * r];
      },
      2,
      (i) => i / 2,
      FROST_WATER_Y,
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
  geo.setAttribute("aFloor", new THREE.Float32BufferAttribute(floor, 1));
  geo.setAttribute("aEdge", new THREE.Float32BufferAttribute(edge, 1));
  // (winding: make every face point up)
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const r = new THREE.Vector3();
  for (let j = 0; j < idx.length; j += 3) {
    p.fromArray(pos, idx[j] * 3);
    q.fromArray(pos, idx[j + 1] * 3).sub(p);
    r.fromArray(pos, idx[j + 2] * 3).sub(p);
    if (q.z * r.x - q.x * r.z < 0) [idx[j + 1], idx[j + 2]] = [idx[j + 2], idx[j + 1]];
  }
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...U },
    vertexShader: /* glsl */ `
      attribute float aKind; attribute float aFloor; attribute float aEdge;
      uniform float uTime;
      varying float vKind; varying float vFloor; varying float vEdge; varying vec3 vW; varying float vDist; varying float vWave;
      ${SEA_WAVE_GLSL}
      ${FROST_CALM_GLSL}
      void main() {
        vec4 w = modelMatrix * vec4( position, 1.0 );
        float wave = seaWave( w.xz, uTime ) * frostCalm( w.xz );
        vWave = wave;
        if ( aKind > 0.5 ) w.y += wave + ( aKind > 1.5 ? 0.12 : 0.1 );
        vKind = aKind; vFloor = aFloor; vEdge = aEdge; vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uGlow; uniform float uAurora; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
      varying float vKind; varying float vFloor; varying float vEdge; varying vec3 vW; varying float vDist; varying float vWave;
      float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      void main() {
        float depth = max( 0.0, vW.y - vFloor );
        vec3 col; float a;
        vec2 q = vW.xz * 0.8; vec2 cell = floor( q );
        float g = hash( cell + floor( uTime * 1.3 ) );
        float dotG = 1.0 - smoothstep( 0.08, 0.24, length( fract( q ) - 0.5 ) );
        vec3 aur = vec3( 0.3, 1.0, 0.7 ) * uAurora;
        if ( vKind < 0.5 ) {
          // the pond's ice: pale, glassy blue with frosty white cracks and sparkles
          col = mix( vec3( 0.72, 0.9, 1.0 ), vec3( 0.5, 0.76, 0.95 ), smoothstep( 0.2, 0.9, vEdge ) );
          vec2 c2 = vW.xz * 0.55;
          float crack = 1.0 - smoothstep( 0.0, 0.06, abs( sin( c2.x * 1.3 + sin( c2.y * 2.1 ) * 1.4 ) * cos( c2.y * 0.9 - c2.x * 0.4 ) ) );
          col = mix( col, vec3( 0.96, 0.99, 1.0 ), crack * 0.55 );
          col += step( 0.93, g ) * dotG * vec3( 1.0 ) * 0.6;
          col = mix( col, vec3( 0.12, 0.2, 0.42 ), uGlow * 0.55 ) + aur * 0.25;
          a = 0.9;
          col = mix( col, vec3( 0.97, 0.99, 1.0 ), smoothstep( 0.85, 1.0, vEdge ) * 0.7 );
        } else if ( vKind < 1.5 ) {
          // the shallows: icy teal over the gravel, fading into the ocean's blue
          vec3 shallow = mix( vec3( 0.36, 0.78, 0.84 ), vec3( 0.1, 0.5, 0.66 ), smoothstep( 0.4, 3.5, depth ) );
          shallow = mix( shallow, vec3( 0.07, 0.32, 0.62 ), smoothstep( 3.5, 9.0, depth ) );
          col = mix( shallow, vec3( 0.04, 0.12, 0.32 ), uGlow * 0.7 ) + aur * 0.12;
          col *= 0.93 + 0.1 * smoothstep( -0.9, 0.9, vWave );
          col += step( 0.96, g ) * dotG * smoothstep( 0.0, 0.5, vWave + 0.3 ) * vec3( 1.0 ) * 0.55 * ( 1.0 - uGlow );
          // foam where the swell runs up the shingle, and a few floating bits of slush ice
          float foam = 1.0 - smoothstep( 0.0, 0.42 + 0.15 * sin( vW.x * 0.7 + uTime * 2.0 ), depth );
          float slush = step( 0.985, hash( floor( vW.xz * 0.9 ) ) ) * ( 1.0 - smoothstep( 0.2, 0.34, length( fract( vW.xz * 0.9 ) - 0.5 ) ) );
          col = mix( col, vec3( 0.97, 0.99, 1.0 ) * mix( 1.0, 0.55, uGlow ), max( foam * 0.9, slush * 0.85 ) );
          a = mix( 0.8, 0.92, max( foam, slush ) ) * ( 1.0 - vEdge );
        } else {
          // lacy foam round the ice
          float lace = step( 0.45, hash( floor( vW.xz * 1.4 ) + floor( uTime * 1.1 ) ) );
          col = vec3( 0.95, 0.99, 1.0 ) * mix( 1.0, 0.55, uGlow ) + aur * 0.2;
          a = ( 1.0 - vEdge ) * ( 0.55 + 0.35 * lace ) * ( 0.8 + 0.2 * sin( uTime * 2.0 + vW.x ) );
        }
        float fog = smoothstep( uFogNear, uFogFar, vDist );
        col = mix( col, uFogColor, fog );
        gl_FragColor = vec4( col, a );
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "frost-water";
  // (drawn after the ocean, so it tints the sea over the shallows)
  mesh.renderOrder = 2;
  return mesh;
}
