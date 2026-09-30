// Coralcove Isle's ground and water, in island-local coordinates (the island's centre at the origin).
//
// Ground: the registry's height grid, triangulated exactly as villageLandY() interpolates it (so
// feet sit on the grass), flat-coloured per face — meadow greens, sandy paths and squares, rock on
// the lighthouse hill's cliffs, a golden beach, and underwater: pale sand shading to teal and deep
// blue, with a reef crest dotted with coral — then a coarse skirt down the island's flanks to the
// deep floor.
// Water: the raised lagoon's calm, clear turquoise surface (glowing specks at night), and a
// "shallows" ring over the reef that rides the ocean's own swell (same wave formula as ocean.ts),
// tinting the sea turquoise over the sand and fading out into the deep blue, with foam where the
// swell runs up the beach.
import * as THREE from "three";
import {
  VILLAGE_EXTENT,
  VILLAGE_GRID,
  VILLAGE_ISLAND,
  VILLAGE_LAGOON,
  VILLAGE_N,
  VILLAGE_SEA_R,
  VILLAGE_WATER_Y,
  pathDistance,
  villageCoastR,
  villageGrid,
  villageHeightAt,
  villageInLagoon,
  villageRng,
} from "../../registry/villageIsland";
import { noise2 } from "../fantasy/noise";
import { VILLAGE_CALM_GLSL, villageCalm } from "../../registry/villageIsland";

const X0 = VILLAGE_ISLAND.x;
const Z0 = VILLAGE_ISLAND.z;
const c = (h: string) => new THREE.Color(h);
const GRASS_A = c("#7acb62");
const GRASS_B = c("#9ada6e");
const GRASS_C = c("#6cbf5c");
const MEADOW_FLOWER = c("#c4ea78");
const SAND = c("#f6e3aa");
const SAND_WET = c("#e0c688");
const PATH = c("#f1dca8");
const SQUARE = c("#f4e4bc");
const ROCK = c("#b9aa9a");
const ROCK_D = c("#9d8f83");
const UNDER_SAND = c("#e8d49a");
const UNDER_TEAL = c("#58b8b0");
const UNDER_DEEP = c("#2a5f8a");
const CORAL = [c("#ff7fa0"), c("#ffb35c"), c("#b58cff"), c("#ff9ad8"), c("#6fe0c8")];
const LAGOON_SAND = c("#f3e8c0");

const _c = new THREE.Color();
const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

function faceColor(x: number, y: number, z: number, slope: number, rnd: () => number, out: THREE.Color): THREE.Color {
  // (x, z local)
  const wx = x + X0;
  const wz = z + Z0;
  const d = Math.hypot(x, z);
  const s = d / villageCoastR(Math.atan2(x, z));
  if (villageInLagoon(wx, wz) && y < VILLAGE_LAGOON.waterY + 0.05) return out.copy(LAGOON_SAND).multiplyScalar(0.92 + rnd() * 0.08);
  if (y < VILLAGE_WATER_Y - 0.1) {
    // under the sea: sand -> teal -> deep; a reef crest with coral
    if (s > 1.24 && s < 1.4 && rnd() < 0.45) return out.copy(CORAL[Math.floor(rnd() * CORAL.length)]);
    out.copy(UNDER_SAND).lerp(UNDER_TEAL, smooth(-0.5, -6, y));
    return out.lerp(UNDER_DEEP, smooth(-6, -20, y)).multiplyScalar(0.94 + rnd() * 0.06);
  }
  if (slope > 0.85 && y > 2.5) return out.copy(rnd() < 0.5 ? ROCK : ROCK_D);
  if (y < 1.5 || s > 0.9) return out.copy(y < 0.7 ? SAND_WET : SAND).multiplyScalar(0.95 + rnd() * 0.05);
  const pd = pathDistance(wx, wz);
  if (pd < 0.95) return out.copy(PATH).multiplyScalar(0.94 + rnd() * 0.06);
  // the squares: pale paving
  if (Math.hypot(x + 4, z - 30) < 8.2 || Math.hypot(x + 25, z - 4) < 7.4) return out.copy(SQUARE).multiplyScalar(0.93 + rnd() * 0.07);
  // meadow: soft broad patches of greens (not per-face noise), a few flowery faces
  const k = noise2(x / 11 + 3, z / 11 - 7, 5);
  const k2 = noise2(x / 4.5, z / 4.5, 6);
  out.copy(GRASS_A).lerp(GRASS_B, Math.min(1, Math.max(0, (k - 0.3) * 1.8)));
  if (k2 > 0.72) out.lerp(GRASS_C, 0.5);
  if (s > 0.84) out.lerp(SAND, 0.4);
  if (slope > 0.6) out.lerp(ROCK, 0.35);
  if (rnd() < 0.035) out.copy(MEADOW_FLOWER);
  return out.multiplyScalar(0.98 + rnd() * 0.04);
}

/** the island's ground (land + reef + flanks) as one flat-shaded, face-coloured mesh */
export function buildGroundGeometry(low: boolean): THREE.BufferGeometry {
  const N = VILLAGE_N;
  const G = VILLAGE_GRID;
  const E = VILLAGE_EXTENT;
  const g = villageGrid();
  const rnd = villageRng(77);
  const pos: number[] = [];
  const colr: number[] = [];
  const keepR = E - 0.5;
  const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    // slope from the face normal
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
  // the grid (cells split along the (i+1, j) – (i, j+1) diagonal, like villageLandY). Where a
  // 2x2 block is well under the sea (nobody stands there) it's drawn as one coarser cell.
  const deep = (i: number, j: number) => {
    if (i + 2 >= N || j + 2 >= N) return false;
    for (let b = 0; b <= 2; b++) for (let a = 0; a <= 2; a++) if (g[(j + b) * N + i + a] > VILLAGE_WATER_Y - 1.2) return false;
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
  const segs = low ? 72 : 110;
  const rings = low ? 7 : 11;
  const r0 = E - 3;
  const r1 = VILLAGE_SEA_R + 2;
  const ringR = (i: number) => r0 + (r1 - r0) * Math.pow(i / rings, 1.3);
  const hAt = (r: number, a: number) => villageHeightAt(X0 + Math.sin(a) * r, Z0 + Math.cos(a) * r);
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
      tri(p[0][0], p[0][1] - 0.05, p[0][2], p[2][0], p[2][1], p[2][2], p[1][0], p[1][1] - 0.05, p[1][2]);
      tri(p[1][0], p[1][1] - 0.05, p[1][2], p[2][0], p[2][1], p[2][2], p[3][0], p[3][1], p[3][2]);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  geo.computeVertexNormals();
  // (make every face point up — the winding above is chosen for that, this just guards it)
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
/** the same swell in JS (boats bob on it) */
export function seaWave(x: number, z: number, t: number): number {
  return villageCalm(x, z) * rawSeaWave(x, z, t);
}
function rawSeaWave(x: number, z: number, t: number): number {
  return Math.sin(x * 0.08 + t * 0.9) * 0.35 + Math.sin(z * 0.11 - t * 1.1) * 0.28 + Math.sin((x + z) * 0.05 + t * 0.6) * 0.4 + Math.sin(x * 0.13 - z * 0.21 + t * 1.45) * 0.12;
}

export interface WaterUniforms {
  uTime: { value: number };
  uGlow: { value: number };
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
}

/** lagoon (aKind 0) + reef shallows (aKind 1) in one mesh; aFloor = the ground under each vertex */
export function buildWater(low: boolean, U: WaterUniforms): THREE.Mesh {
  const pos: number[] = [];
  const kind: number[] = [];
  const floor: number[] = [];
  const edge: number[] = [];
  const idx: number[] = [];
  // the lagoon: an ellipse fan
  const L = VILLAGE_LAGOON;
  const segs = low ? 28 : 40;
  const rings = low ? 4 : 6;
  const cr = Math.cos(L.rot);
  const sr = Math.sin(L.rot);
  const base = 0;
  pos.push(L.x - X0, L.waterY, L.z - Z0);
  kind.push(0);
  floor.push(villageHeightAt(L.x, L.z));
  edge.push(0);
  for (let i = 1; i <= rings; i++) {
    const e = (1.32 * i) / rings;
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const u = Math.sin(a) * L.rx * e;
      const v = Math.cos(a) * L.rz * e;
      const x = L.x + u * cr + v * sr;
      const z = L.z - u * sr + v * cr;
      pos.push(x - X0, L.waterY, z - Z0);
      kind.push(0);
      floor.push(villageHeightAt(x, z));
      edge.push(e);
    }
  }
  const lr = (i: number, k: number) => base + 1 + (i - 1) * segs + (k % segs);
  for (let k = 0; k < segs; k++) idx.push(base, lr(1, k + 1), lr(1, k));
  for (let i = 1; i < rings; i++)
    for (let k = 0; k < segs; k++) idx.push(lr(i, k), lr(i, k + 1), lr(i + 1, k), lr(i, k + 1), lr(i + 1, k + 1), lr(i + 1, k));
  // the shallows: a ring from under the beach out past the reef
  const sb = pos.length / 3;
  const ss = low ? 90 : 140;
  const sRings = low ? 9 : 14;
  const s0 = 0.84;
  const s1 = 1.62;
  for (let i = 0; i <= sRings; i++) {
    const s = s0 + (s1 - s0) * Math.pow(i / sRings, 1.25);
    for (let k = 0; k < ss; k++) {
      const a = (k / ss) * Math.PI * 2;
      const r = villageCoastR(a) * s;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      pos.push(x, VILLAGE_WATER_Y, z);
      kind.push(1);
      floor.push(villageHeightAt(x + X0, z + Z0));
      edge.push(smooth(1.32, s1, s));
    }
  }
  const sr_ = (i: number, k: number) => sb + i * ss + (k % ss);
  for (let i = 0; i < sRings; i++)
    for (let k = 0; k < ss; k++) idx.push(sr_(i, k), sr_(i, k + 1), sr_(i + 1, k), sr_(i, k + 1), sr_(i + 1, k + 1), sr_(i + 1, k));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
  geo.setAttribute("aFloor", new THREE.Float32BufferAttribute(floor, 1));
  geo.setAttribute("aEdge", new THREE.Float32BufferAttribute(edge, 1));
  // (winding: make the faces point up)
  const p = (j: number) => new THREE.Vector3().fromArray(pos, idx[j] * 3);
  const n = new THREE.Vector3().crossVectors(p(1).sub(p(0)), p(2).sub(p(0)));
  if (n.y < 0) for (let j = 0; j < idx.length; j += 3) [idx[j + 1], idx[j + 2]] = [idx[j + 2], idx[j + 1]];
  const sbI = idx.findIndex((v, j) => j % 3 === 0 && v >= sb);
  if (sbI >= 0) {
    const q = (j: number) => new THREE.Vector3().fromArray(pos, idx[j] * 3);
    const m = new THREE.Vector3().crossVectors(q(sbI + 1).sub(q(sbI)), q(sbI + 2).sub(q(sbI)));
    if (m.y < 0) for (let j = sbI; j < idx.length; j += 3) [idx[j + 1], idx[j + 2]] = [idx[j + 2], idx[j + 1]];
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
      ${VILLAGE_CALM_GLSL}
      void main() {
        vec4 w = modelMatrix * vec4( position, 1.0 );
        float wave = seaWave( w.xz, uTime ) * villageCalm( w.xz );
        vWave = wave;
        if ( aKind > 0.5 ) w.y += wave + 0.1;
        else w.y += sin( w.x * 0.9 + uTime * 1.3 ) * 0.02 + sin( w.z * 1.1 - uTime ) * 0.02;
        vKind = aKind; vFloor = aFloor; vEdge = aEdge; vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uGlow; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
      varying float vKind; varying float vFloor; varying float vEdge; varying vec3 vW; varying float vDist; varying float vWave;
      float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
      void main() {
        float depth = max( 0.0, vW.y - vFloor );
        vec3 col; float a;
        // glints and night specks (world-space cells)
        vec2 q = vW.xz * 0.8; vec2 cell = floor( q );
        float g = hash( cell + floor( uTime * 1.3 ) );
        float dotG = 1.0 - smoothstep( 0.08, 0.24, length( fract( q ) - 0.5 ) );
        if ( vKind < 0.5 ) {
          // the lagoon: clear, bright turquoise over pale sand
          col = mix( vec3( 0.42, 0.9, 0.86 ), vec3( 0.12, 0.66, 0.74 ), smoothstep( 0.1, 0.55, depth ) );
          col = mix( col, vec3( 0.08, 0.22, 0.42 ), uGlow * 0.6 );
          float rip = sin( vW.x * 2.1 + uTime * 1.7 ) * sin( vW.z * 1.7 - uTime * 1.3 );
          col *= 0.95 + rip * 0.05;
          col += step( 0.95, g ) * dotG * vec3( 1.0 ) * 0.5 * ( 1.0 - uGlow );
          // glowing specks at night: the lagoon's little light-fish
          col += uGlow * step( 0.9, hash( cell * 1.7 + floor( uTime * 0.6 ) ) ) * dotG * vec3( 0.3, 1.0, 0.9 ) * 0.9;
          a = mix( 0.55, 0.85, smoothstep( 0.0, 0.5, depth ) );
          // a soft white rim where it laps the banks
          float rim = 1.0 - smoothstep( 0.0, 0.1, depth );
          col = mix( col, vec3( 1.0 ), rim * 0.6 );
          a = max( a, rim * 0.8 );
        } else {
          // the reef shallows: turquoise over sand, teal over the shelf, fading into the ocean's blue
          vec3 shallow = mix( vec3( 0.3, 0.86, 0.8 ), vec3( 0.06, 0.55, 0.62 ), smoothstep( 0.4, 3.5, depth ) );
          shallow = mix( shallow, vec3( 0.07, 0.34, 0.66 ), smoothstep( 3.5, 9.0, depth ) );
          col = mix( shallow, vec3( 0.04, 0.12, 0.34 ), uGlow * 0.7 );
          col *= 0.93 + 0.1 * smoothstep( -0.9, 0.9, vWave );
          col += step( 0.96, g ) * dotG * smoothstep( 0.1, 0.7, vWave ) * vec3( 1.0 ) * 0.6 * ( 1.0 - uGlow );
          // foam where the swell runs up the sand, and a lacy line over the reef crest
          float foam = 1.0 - smoothstep( 0.0, 0.45 + 0.15 * sin( vW.x * 0.7 + uTime * 2.0 ), depth );
          float crest = smoothstep( 0.35, 0.5, vEdge ) * ( 1.0 - smoothstep( 0.5, 0.7, vEdge ) ) * step( 0.55, hash( floor( vW.xz * 0.6 ) + floor( uTime * 0.8 ) ) );
          col = mix( col, vec3( 1.0, 0.99, 0.97 ) * mix( 1.0, 0.55, uGlow ), max( foam * 0.9, crest * 0.4 ) );
          col += uGlow * step( 0.93, hash( cell + floor( uTime * 0.5 ) ) ) * dotG * vec3( 0.3, 1.0, 0.95 ) * 0.6;
          a = mix( 0.8, 0.9, foam ) * ( 1.0 - vEdge );
        }
        float fog = smoothstep( uFogNear, uFogFar, vDist );
        col = mix( col, uFogColor, fog );
        gl_FragColor = vec4( col, a );
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "village-water";
  // (drawn after the ocean, so it tints the sea over the reef)
  mesh.renderOrder = 2;
  return mesh;
}
