// The Giza Plateau, built: the stepped cores of the three great pyramids and their queens (every
// course of them — Khufu's 203, Khafre's 158, Menkaure's 82 — with the course heights thinning
// upward, eroded corners, Khafre's surviving cap of smooth white casing with its ragged lower edge,
// Menkaure's red-granite courses and the great gash in his north face, the real entrances), the
// Great Sphinx sculpted from its real proportions (the lion's body in the weathered layers of the
// bedrock, the paws, the tail curled along its right side, the king's head in the nemes headdress
// with its broken nose, the Dream Stele between the paws), the Valley Temple with its T-shaped
// granite hall, the Sphinx Temple, the mortuary temples (Khufu's black basalt floor), the
// causeways, the boat pits, the streets of mastaba tombs, palms and camels.
//
// Everything sits exactly on registry/giza.ts's numbers: the same course tables the kid stands on
// (gizaSolidY), the same plateau heights the terrain bakes (gizaPlateauY). Built once when the kid
// comes within range (buildPark.ts's lazyNear) — a handful of draw calls: the whole stone complex is
// ONE geometry on ONE shared stone material, whose fragment shader draws the block joints, the
// per-block colour, the weathering and the rock layers.
import * as THREE from "three";
import {
  BOAT_PITS,
  CAUSEWAYS,
  GIZA_ARRIVAL,
  GIZA_SCALE,
  GIZA_VIEWPOINTS,
  MASTABAS,
  PYRAMIDS,
  SPHINX_E,
  SPHINX_PIT_WALLS,
  SPHINX_S,
  TEMPLES,
  gizaPlateauY,
  gizaRng,
  gizaWorld,
  pyramidCourses,
  templeWalls,
  type GizaTemple,
  type PyramidDef,
} from "../registry/giza";
import { groundY } from "../registry/terrain";

const S = GIZA_SCALE;
const TAU = Math.PI * 2;
const smoothstepN = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** what a surface is made of — the stone shader's own switch (aStone.z) */
const K = {
  CORE: 0, // a stepped core course's riser (block joints, per-block tone)
  TREAD: 1, // a course's top (sand-dusted)
  CASING: 2, // smooth white limestone casing
  GRANITE: 3, // red Aswan granite
  MASONRY: 4, // walls/tombs: block pattern from world position
  BEDROCK: 5, // the Sphinx and its pit: weathered horizontal rock layers (+ restoration blocks low down)
  BASALT: 6, // Khufu's black basalt floor
  ALABASTER: 7, // the Valley Temple's white alabaster floor
  DARK: 8, // a doorway, a shaft, a hole
  METAL: 9, // the survey mast on Khufu's top
} as const;

// ── one growing geometry: positions, uvs (uv.y = height within a course) and aStone ──
class Geo {
  pos: number[] = [];
  uv: number[] = [];
  stone: number[] = [];
  private v(p: THREE.Vector3, u: number, vv: number, st: [number, number, number, number]) {
    this.pos.push(p.x, p.y, p.z);
    this.uv.push(u, vv);
    this.stone.push(st[0], st[1], st[2], st[3]);
  }
  /** a quad a-b-c-d (any winding: the material is double-sided). `along` gives each corner's
   *  along-the-face coordinate (block joints), vv its height-in-course fraction */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, kind: number, course: number, along: [number, number, number, number] = [0, 0, 0, 0], vv: [number, number, number, number] = [0, 0, 1, 1], seed = 0) {
    const st = (i: number): [number, number, number, number] => [along[i], course, kind, seed];
    this.v(a, along[0], vv[0], st(0));
    this.v(b, along[1], vv[1], st(1));
    this.v(c, along[2], vv[2], st(2));
    this.v(a, along[0], vv[0], st(0));
    this.v(c, along[2], vv[2], st(2));
    this.v(d, along[3], vv[3], st(3));
  }
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, kind: number, course = 0) {
    for (const p of [a, b, c]) this.v(p, 0, 0.5, [0, course, kind, 0]);
  }
  /** append any three.js geometry, transformed, as one material kind */
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, kind: number, x = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.getAttribute("position");
    const t = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      t.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m);
      this.v(t, 0, 0.5, [x, 0, kind, 0]);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, kind: number, rotY = 0, x = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(sx, sy, sz));
    this.add(new THREE.BoxGeometry(1, 1, 1), m, kind, x);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("aStone", new THREE.Float32BufferAttribute(this.stone, 4));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// ── the stone shader ──
const STONE_GLSL = /* glsl */ `
varying vec3 vGzW;
varying vec4 vGzStone;
varying vec2 vGzUv;
float gzHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float gzNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( gzHash( i ), gzHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( gzHash( i + vec2( 0.0, 1.0 ) ), gzHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
// a running bond of blocks along a course: returns (block tone, joint darkness)
vec2 gzBlocks( float along, float course, float v, float lenMin, float lenVar ) {
  float L = lenMin + lenVar * gzHash( vec2( course, 3.1 ) );
  float u = ( along + gzHash( vec2( course, 7.7 ) ) * L ) / L;
  float bi = floor( u );
  float bf = fract( u );
  float tone = gzHash( vec2( course * 1.37, bi ) );
  float jv = 1.0 - smoothstep( 0.0, 0.05, bf ) * smoothstep( 1.0, 0.95, bf );
  float jh = 1.0 - smoothstep( 0.0, 0.07, v ) * smoothstep( 1.0, 0.9, v );
  // far off, a joint is thinner than a pixel: fade the pattern out instead of letting it shimmer
  float fw = max( fwidth( u ), fwidth( v ) * 0.6 );
  return vec2( mix( tone, 0.5, smoothstep( 0.15, 0.6, fw ) ), max( jv, jh ) * ( 1.0 - smoothstep( 0.08, 0.35, fw ) ) );
}
vec3 gzStoneColor( vec3 nrm ) {
  float kind = floor( vGzStone.z + 0.5 );
  float course = vGzStone.y;
  float along = vGzStone.x;
  float v = vGzUv.y;
  float grain = gzNoise( vGzW.xz * 2.7 + vGzW.y * 1.9 ) * 0.6 + gzNoise( vGzW.zy * 7.3 + vGzW.x ) * 0.4;
  vec3 c;
  if ( kind < 0.5 ) {
    // a core course: golden-grey limestone blocks, each its own tone, deep joints, chipped edges
    vec2 b = gzBlocks( along, course, v, 0.55, 0.38 );
    c = mix( vec3( 0.96, 0.77, 0.52 ), vec3( 0.84, 0.64, 0.42 ), b.x );
    c = mix( c, vec3( 0.97, 0.89, 0.72 ), step( 0.86, gzHash( vec2( b.x * 91.0, course ) ) ) * 0.7 );
    c *= 1.0 - 0.32 * b.y;
    c *= mix( 0.8, 1.0, smoothstep( 0.0, 0.4, v ) );
    c *= 0.86 + 0.2 * grain;
    if ( vGzStone.w > 0.5 ) c *= 0.6; // down in the gash
  } else if ( kind < 1.5 ) {
    // a course's top: wind-blown sand caught on the step
    vec2 b = gzBlocks( along, course, 0.5, 0.55, 0.38 );
    c = mix( vec3( 0.96, 0.84, 0.62 ), vec3( 0.88, 0.75, 0.54 ), gzNoise( vGzW.xz * 1.3 ) );
    c *= 1.0 - 0.18 * b.y;
    c *= 0.9 + 0.14 * grain;
    if ( vGzStone.w > 0.5 ) c *= 0.66;
  } else if ( kind < 2.5 ) {
    // the smooth casing: pale fine limestone, big dressed blocks, streaked by two thousand years of
    // weather running down the face
    float bu = fract( along / 0.9 + gzHash( vec2( floor( vGzW.y / 0.62 ), 2.0 ) ) );
    float bv = fract( vGzW.y / 0.62 );
    float j = 1.0 - smoothstep( 0.0, 0.03, bu ) * smoothstep( 1.0, 0.97, bu ) * smoothstep( 0.0, 0.05, bv ) * smoothstep( 1.0, 0.95, bv );
    c = vec3( 0.97, 0.92, 0.81 );
    float streak = gzNoise( vec2( along * 3.0, vGzW.y * 0.25 ) );
    c *= 0.82 + 0.18 * streak;
    c = mix( c, vec3( 0.70, 0.62, 0.50 ), smoothstep( 0.62, 0.9, gzNoise( vGzW.xz * 0.9 + vGzW.y * 0.4 ) ) * 0.5 );
    c *= 1.0 - 0.14 * j;
  } else if ( kind < 3.5 ) {
    // red granite: pink-red, speckled black and white
    float sp = gzHash( floor( ( vGzW.xz + vGzW.y ) * 38.0 ) );
    c = vec3( 0.60, 0.34, 0.29 ) * ( 0.88 + 0.2 * grain );
    c = mix( c, vec3( 0.16, 0.13, 0.13 ), step( 0.8, sp ) * 0.7 );
    c = mix( c, vec3( 0.86, 0.80, 0.78 ), step( 0.95, sp ) * 0.6 );
    vec2 b = gzBlocks( along + vGzW.x + vGzW.z, course, v, 0.8, 0.5 );
    c *= 1.0 - 0.3 * b.y * step( 0.01, course + along );
  } else if ( kind < 4.5 ) {
    // masonry walls and tombs: courses of big blocks laid out by world position
    float up = abs( nrm.y );
    float ch = 0.55;
    float row = floor( vGzW.y / ch );
    float a = abs( nrm.x ) > abs( nrm.z ) ? vGzW.z : vGzW.x;
    vec2 b = gzBlocks( a, row, fract( vGzW.y / ch ), 0.9, 0.6 );
    c = mix( vec3( 0.92, 0.79, 0.57 ), vec3( 0.80, 0.67, 0.47 ), b.x );
    c *= 1.0 - 0.3 * b.y * ( 1.0 - up );
    c = mix( c, vec3( 0.95, 0.83, 0.61 ), up * 0.6 );
    c *= 0.86 + 0.2 * grain;
    if ( vGzStone.x > 0.5 ) c = mix( c, vec3( 0.58, 0.34, 0.29 ) * ( 0.9 + 0.2 * grain ), 0.85 );
  } else if ( kind < 5.5 ) {
    // the Sphinx's bedrock: alternating hard (pale, standing proud) and soft (yellow, scooped out)
    // layers, pitted, and the modern restoration blocks wrapped round its lower body and paws
    float layer = sin( vGzW.y * 3.3 + gzNoise( vGzW.xz * 0.35 ) * 2.2 ) + 0.45 * sin( vGzW.y * 9.1 );
    c = mix( vec3( 0.93, 0.80, 0.56 ), vec3( 0.80, 0.63, 0.40 ), smoothstep( -0.4, 0.5, layer ) );
    c *= 0.82 + 0.26 * grain;
    c = mix( c, vec3( 0.55, 0.44, 0.31 ), smoothstep( 0.72, 0.95, gzNoise( vGzW.xz * 3.0 + vGzW.y * 2.0 ) ) * 0.5 );
    if ( vGzW.y < vGzStone.x ) {
      float a = abs( nrm.x ) > abs( nrm.z ) ? vGzW.z : vGzW.x;
      vec2 b = gzBlocks( a, floor( vGzW.y / 0.42 ), fract( vGzW.y / 0.42 ), 0.5, 0.3 );
      c = mix( vec3( 0.88, 0.81, 0.66 ), vec3( 0.80, 0.72, 0.56 ), b.x ) * ( 1.0 - 0.3 * b.y );
    }
  } else if ( kind < 6.5 ) {
    float j = max( 1.0 - smoothstep( 0.0, 0.04, fract( vGzW.x / 1.1 ) ) * smoothstep( 1.0, 0.96, fract( vGzW.x / 1.1 ) ), 1.0 - smoothstep( 0.0, 0.04, fract( vGzW.z / 0.8 ) ) * smoothstep( 1.0, 0.96, fract( vGzW.z / 0.8 ) ) );
    c = vec3( 0.2, 0.19, 0.19 ) * ( 0.8 + 0.4 * grain ) * ( 1.0 - 0.4 * j );
  } else if ( kind < 7.5 ) {
    float j = max( 1.0 - smoothstep( 0.0, 0.03, fract( vGzW.x / 1.3 ) ) * smoothstep( 1.0, 0.97, fract( vGzW.x / 1.3 ) ), 1.0 - smoothstep( 0.0, 0.03, fract( vGzW.z / 1.0 ) ) * smoothstep( 1.0, 0.97, fract( vGzW.z / 1.0 ) ) );
    c = vec3( 0.92, 0.89, 0.82 ) * ( 0.9 + 0.12 * gzNoise( vGzW.xz * 4.0 ) ) * ( 1.0 - 0.2 * j );
  } else if ( kind < 8.5 ) {
    c = vec3( 0.05, 0.04, 0.035 );
  } else {
    c = vec3( 0.32, 0.31, 0.30 );
  }
  return c;
}
`;

let _stoneMat: THREE.MeshStandardMaterial | null = null;
function stoneMaterial(): THREE.MeshStandardMaterial {
  if (_stoneMat) return _stoneMat;
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.94, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aStone;\nvarying vec3 vGzW;\nvarying vec4 vGzStone;\nvarying vec2 vGzUv;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
  vec4 gzW = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
  gzW = instanceMatrix * gzW;
  #endif
  vGzW = ( modelMatrix * gzW ).xyz;
  vGzStone = aStone;
  vGzUv = uv;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${STONE_GLSL}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    vec3 gzN = normalize( cross( dFdx( vGzW ), dFdy( vGzW ) ) );
    diffuseColor.rgb = gzStoneColor( gzN );
  }`,
      )
      // the monuments stand clear of the haze a little longer than the open ground does, so the
      // pyramids still read from across the desert
      .replace(
        "#include <fog_fragment>",
        `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  fogFactor *= 0.55;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,
      );
  };
  _stoneMat = mat;
  return mat;
}

// ── the stepped pyramids ──
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** the four faces: outward normal (nx, nz) and along direction (tx, tz), north first */
const FACES = [
  { id: "n" as const, nx: 0, nz: -1, tx: 1, tz: 0 },
  { id: "e" as const, nx: 1, nz: 0, tx: 0, tz: 1 },
  { id: "s" as const, nx: 0, nz: 1, tx: -1, tz: 0 },
  { id: "w" as const, nx: -1, nz: 0, tx: 0, tz: -1 },
];

function buildPyramid(g: Geo, def: PyramidDef) {
  const pc = pyramidCourses(def);
  const rng = gizaRng(def.id.length * 977 + Math.round(def.e * 13 + def.s * 7) + 5);
  const n = pc.top.length;
  const ruin = def.queen ? 1 : 0;
  const graniteN = def.graniteCourses ?? 0;
  // the gash in Menkaure's north face (Al-Aziz Uthman's son's men, 1196): a deep vertical cut a
  // little west of the middle, from a sixth of the way up to just past half
  const gash = def.id === "menkaure" ? { a0: -0.2 * pc.hx, a1: 0.03 * pc.hx, k0: Math.round(n * 0.16), k1: Math.round(n * 0.56) } : null;
  // per course, per face: the riser's outward offset from the centre in each section, and the
  // eroded chip at each corner
  type Course = { yb: number; yt: number; off: number[][]; chip: number[]; granite: boolean[] };
  const courses: Course[] = [];
  for (let k = 0; k < n; k++) {
    const yb = pc.baseY + (k === 0 ? 0 : pc.top[k - 1]);
    const yt = pc.baseY + pc.top[k];
    const t = k / n;
    const off: number[][] = [];
    const granite: boolean[] = [];
    for (let f = 0; f < 4; f++) {
      const outHalf = f % 2 === 0 ? pc.hz : pc.hx;
      const base = outHalf - pc.inset[k];
      // a little unevenness every course (weathered, robbed, re-set), more on the ruined queens
      // and near the top, where the courses are most broken
      let r = (rng() - 0.5) * 0.1 * S + (rng() < 0.08 ? rng() * 0.35 * S : 0) + ruin * (rng() * 1.3 + t * t * 3.2) * S;
      const isGranite = graniteN > 0 && k < graniteN && (def.graniteFaces ?? []).includes(FACES[f].id);
      if (isGranite) r = -def.coreInset * S * 0.95;
      granite.push(isGranite);
      const secs = [base - r];
      if (gash && f === 0) {
        let deep = 0;
        if (k >= gash.k0 && k <= gash.k1) {
          const u = (k - gash.k0) / (gash.k1 - gash.k0);
          deep = Math.pow(Math.sin(u * Math.PI), 0.6) * 6.5 * S * (0.8 + 0.2 * rng());
        }
        secs.push(base - r - deep, base - r);
      }
      off.push(secs);
    }
    // the corners (arrises) are worn back the most — courses missing their corner blocks
    const chip: number[] = [];
    for (let c = 0; c < 4; c++) chip.push((0.12 + rng() * 0.45 + (rng() < 0.15 ? rng() * 0.9 : 0) + (t > 0.86 ? rng() * 1.6 : 0) + ruin * (rng() * 2.6 + t * 3.2)) * S);
    courses.push({ yb, yt, off, chip, granite });
  }
  // the along-extent of face f at course k: its own end at the corner with the next face
  const alongHalf = (f: number, k: number) => (f % 2 === 0 ? pc.hx : pc.hz) - pc.inset[k];
  const sectionBounds = (f: number, k: number): number[] => {
    const A0 = -(alongHalf(f, k) - courses[k].chip[(f + 3) % 4]);
    const A1 = alongHalf(f, k) - courses[k].chip[f];
    if (gash && f === 0) return [A0, Math.max(A0, Math.min(A1, gash.a0)), Math.max(A0, Math.min(A1, gash.a1)), A1];
    return [A0, A1];
  };
  const P = (f: number, off: number, along: number, y: number) => {
    const F = FACES[f];
    return V(pc.cx + F.nx * off + F.tx * along, y, pc.cz + F.nz * off + F.tz * along);
  };
  const casingK = def.casingFrom !== undefined ? Math.floor(n * def.casingFrom) : n;
  for (let k = 0; k < n; k++) {
    const c = courses[k];
    const next = courses[k + 1];
    for (let f = 0; f < 4; f++) {
      const b = sectionBounds(f, k);
      const kind = c.granite[f] ? K.GRANITE : K.CORE;
      // risers, one per section
      for (let s = 0; s + 1 < b.length; s++) {
        if (b[s + 1] - b[s] < 1e-4) continue;
        const o = c.off[f][s];
        const inGash = gash && f === 0 && s === 1 && c.off[f][1] < c.off[f][0] - 1e-4 ? 1 : 0;
        g.quad(P(f, o, b[s], c.yb), P(f, o, b[s + 1], c.yb), P(f, o, b[s + 1], c.yt), P(f, o, b[s], c.yt), kind, k, [b[s], b[s + 1], b[s + 1], b[s]], undefined, inGash);
        // a step in the face between two sections (the gash's own side walls)
        if (s > 0 && Math.abs(c.off[f][s] - c.off[f][s - 1]) > 1e-4) {
          const o0 = c.off[f][s - 1];
          g.quad(P(f, o0, b[s], c.yb), P(f, o, b[s], c.yb), P(f, o, b[s], c.yt), P(f, o0, b[s], c.yt), K.CORE, k, [0, 0.4, 0.4, 0], undefined, 1);
        }
      }
      // the worn corner between this face's end and the next face's start
      const f2 = (f + 1) % 4;
      const b2 = sectionBounds(f2, k);
      const pEnd = (y: number) => P(f, c.off[f][c.off[f].length - 1], b[b.length - 1], y);
      const pStart = (y: number) => P(f2, c.off[f2][0], b2[0], y);
      g.quad(pEnd(c.yb), pStart(c.yb), pStart(c.yt), pEnd(c.yt), K.CORE, k, [0, 0.6, 0.6, 0]);
      // the tread on top of this course, out to the next course's riser
      if (next) {
        const bn = sectionBounds(f, k + 1);
        for (let s = 0; s + 1 < b.length; s++) {
          const o = c.off[f][s];
          const on = next.off[f][s];
          const tGash = gash && f === 0 && s === 1 && (c.off[f][1] < c.off[f][0] - 1e-4 || next.off[f][1] < next.off[f][0] - 1e-4) ? 1 : 0;
          g.quad(P(f, o, b[s], c.yt), P(f, o, b[s + 1], c.yt), P(f, on, bn[s + 1], c.yt), P(f, on, bn[s], c.yt), K.TREAD, k, [b[s], b[s + 1], bn[s + 1], bn[s]], [1, 1, 1, 1], tGash);
        }
        const bn2 = sectionBounds(f2, k + 1);
        g.quad(pEnd(c.yt), pStart(c.yt), P(f2, next.off[f2][0], bn2[0], c.yt), P(f, next.off[f][next.off[f].length - 1], bn[bn.length - 1], c.yt), K.TREAD, k, [0, 0.6, 0.6, 0], [1, 1, 1, 1]);
      }
    }
    // the top course's own top: the flat platform (Khufu's ~10 m square today)
    if (!next && k < casingK) {
      const ring: THREE.Vector3[] = [];
      for (let f = 0; f < 4; f++) {
        const b = sectionBounds(f, k);
        ring.push(P(f, c.off[f][0], b[0], c.yt), P(f, c.off[f][c.off[f].length - 1], b[b.length - 1], c.yt));
      }
      const mid = V(pc.cx, c.yt, pc.cz);
      for (let i = 0; i < ring.length; i++) g.tri(mid, ring[i], ring[(i + 1) % ring.length], K.TREAD, k);
    }
  }
  // Khafre's casing: the smooth original face from a ragged line about three quarters up, to his
  // broken-off top
  if (def.casingFrom !== undefined) {
    const yTop = pc.baseY + pc.top[n - 1];
    const y0 = pc.baseY + pc.top[n - 1] * def.casingFrom;
    const M = 26;
    const corner: number[] = [0, 1, 2, 3].map(() => y0 + rng() * 3 * S);
    const plane = (f: number, y: number) => ((f % 2 === 0 ? pc.hz : pc.hx) - (y - pc.baseY) * pc.run);
    const ahalf = (f: number, y: number) => ((f % 2 === 0 ? pc.hx : pc.hz) - (y - pc.baseY) * pc.run);
    const core = (f: number, y: number) => plane(f, y) - def.coreInset * S;
    for (let f = 0; f < 4; f++) {
      const starts: number[] = [];
      for (let j = 0; j < M; j++) {
        if (j === 0) starts.push(corner[(f + 3) % 4]);
        else if (j === M - 1) starts.push(corner[f]);
        else starts.push(y0 + (Math.sin(j * 1.7 + f) * 0.5 + 0.5) * 4 * S + rng() * 2.5 * S - (rng() < 0.2 ? rng() * 4 * S : 0));
      }
      for (let j = 0; j < M; j++) {
        const ys = starts[j];
        const fa = j / M;
        const fb = (j + 1) / M;
        const at = (fr: number, y: number) => -ahalf(f, y) + fr * 2 * ahalf(f, y);
        const pA = P(f, plane(f, ys), at(fa, ys), ys);
        const pB = P(f, plane(f, ys), at(fb, ys), ys);
        const pC = P(f, plane(f, yTop), at(fb, yTop), yTop);
        const pD = P(f, plane(f, yTop), at(fa, yTop), yTop);
        g.quad(pA, pB, pC, pD, K.CASING, 0, [at(fa, ys), at(fb, ys), at(fb, yTop), at(fa, yTop)]);
        // the casing's broken lower edge: its thickness, from the face back to the core
        g.quad(P(f, core(f, ys), at(fa, ys), ys), P(f, core(f, ys), at(fb, ys), ys), pB, pA, K.CASING, 0);
        // where the next segment starts lower, the side of this one's thickness shows
        if (j + 1 < M && starts[j + 1] < ys) {
          const yl = starts[j + 1];
          g.quad(P(f, core(f, yl), at(fb, yl), yl), P(f, plane(f, yl), at(fb, yl), yl), pB, P(f, core(f, ys), at(fb, ys), ys), K.CASING, 0);
        }
        if (j > 0 && starts[j - 1] < ys) {
          const yl = starts[j - 1];
          g.quad(P(f, core(f, yl), at(fa, yl), yl), P(f, plane(f, yl), at(fa, yl), yl), pA, P(f, core(f, ys), at(fa, ys), ys), K.CASING, 0);
        }
      }
    }
    // the broken top: a small flat where the apex used to be
    const tr: THREE.Vector3[] = [];
    for (let f = 0; f < 4; f++) tr.push(P(f, plane(f, yTop), -ahalf(f, yTop), yTop));
    g.quad(tr[0], tr[1], tr[2], tr[3], K.CASING, 0);
  }
  return pc;
}

/** an entrance on a pyramid's north face, at its real height and offset */
function buildEntrances(g: Geo, def: PyramidDef) {
  if (!def.entrances) return;
  const pc = pyramidCourses(def);
  for (const en of def.entrances) {
    const x = pc.cx + en.east * S;
    if (en.kind === "ground") {
      // the lower entrance: a passage cut down into the pavement in front of the north face
      const z = pc.cz - pc.hz - 6 * S;
      g.box(x, pc.baseY + 0.02, z, 1.05 * S, 0.06, 3.4 * S, K.DARK);
      g.box(x - 1.0 * S, pc.baseY + 0.12, z, 0.35, 0.3, 3.6 * S, K.MASONRY);
      g.box(x + 1.0 * S, pc.baseY + 0.12, z, 0.35, 0.3, 3.6 * S, K.MASONRY);
      continue;
    }
    const y = pc.baseY + en.y * S;
    // the course at that height and where its riser stands
    let k = 0;
    while (k < pc.top.length - 1 && pc.baseY + pc.top[k] < y) k++;
    const face = pc.hz - pc.inset[k];
    const z = pc.cz - face;
    if (en.kind === "original") {
      // the doorway, ~1.05 m wide and 1.2 m high, under its gabled chevron stones (two pairs of
      // great limestone beams leaning together, Khufu's best-known detail)
      g.box(x, y + 0.3 * S, z - 0.02, 1.05 * S, 1.2 * S, 0.4, K.DARK);
      for (const [lift, span, thick] of def.id === "khufu" ? [[1.7, 4.2, 1.1], [3.2, 5.6, 1.2]] : [[1.2, 2.6, 0.8]]) {
        for (const side of [-1, 1]) {
          const m = new THREE.Matrix4().compose(
            V(x + side * span * 0.25 * S, y + lift * S, z - 0.25),
            new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), side * -0.68),
            V(span * 0.62 * S, thick * S, 1.4 * S),
          );
          g.add(new THREE.BoxGeometry(1, 1, 1), m, K.CASING);
        }
      }
    } else {
      // Al-Ma'mun's robbers' tunnel: a ragged hole forced through the core blocks, with the
      // visitors' stone steps climbing up the face to it
      // (a ragged, forced opening: a squashed rock shape, not a neat circle)
      const hole = new THREE.Matrix4().compose(V(x, y + 0.9 * S, z - 0.05), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.7, 0.2)), V(1.6 * S, 1.3 * S, 0.5));
      g.add(new THREE.DodecahedronGeometry(1, 0), hole, K.DARK);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.4;
        g.box(x + Math.cos(a) * 1.9 * S, y + 0.9 * S + Math.sin(a) * 1.6 * S, z - 0.12, 0.9 * S, 0.7 * S, 0.5, K.CORE, a);
      }
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const sy = pc.baseY + ((i + 1) / steps) * (y - pc.baseY);
        g.box(x - 3.2 * S, sy - (y - pc.baseY) / steps / 2, z - 2.4 - ((steps - i) / steps) * 3.2, 2.2 * S, (y - pc.baseY) / steps, 0.9, K.MASONRY);
      }
    }
  }
}

// ── the Sphinx (built in its own frame, real metres: +x forward/east, +y up, +z south) ──
/** loft rings of points (each ring the same count) into a skin */
function loft(g: Geo, rings: THREE.Vector3[][], m: THREE.Matrix4, kind: number, restY: number, close = false) {
  for (let r = 0; r + 1 < rings.length; r++) {
    const a = rings[r];
    const b = rings[r + 1];
    const cnt = close ? a.length : a.length - 1;
    for (let i = 0; i < cnt; i++) {
      const i2 = (i + 1) % a.length;
      const pts = [a[i], a[i2], b[i2], b[i]].map((p) => p.clone().applyMatrix4(m));
      g.quad(pts[0], pts[1], pts[2], pts[3], kind, 0, [restY, restY, restY, restY]);
    }
  }
}
/** a rounded, flat-bottomed cross-section (half-width w, height h, bottom at y0, centre z0) */
function section(x: number, w: number, h: number, y0: number, z0 = 0, q = 3.2, M = 18, bulge?: (y: number) => number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= M; i++) {
    const a = (i / M) * Math.PI;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const zz = w * Math.sign(c) * Math.pow(Math.abs(c), 2 / q);
    const yy = h * Math.pow(Math.abs(s), 2 / q);
    const extra = bulge ? bulge(yy) : 0;
    pts.push(V(x, y0 + yy, z0 + zz + Math.sign(zz) * extra));
  }
  return pts;
}

function buildSphinx(g: Geo) {
  const p = gizaWorld(SPHINX_E, SPHINX_S);
  const floor = gizaPlateauY(SPHINX_E, SPHINX_S);
  const m = new THREE.Matrix4().compose(V(p.x, floor, p.z), new THREE.Quaternion(), V(S, S, S));
  // the restoration blocks wrap its lower 2.6 m (world y below this)
  const rest = floor + 2.6 * S;
  // ── the body: rump (x -36.75) to chest (x +9) ──
  const bodyRings: THREE.Vector3[][] = [];
  // the soft layers of the Member II limestone have weathered back into deep horizontal grooves
  // between the harder bands — the Sphinx's sides are ribbed with them above the restoration blocks
  const groove = (y: number) => -0.5 * smoothstepN(0.25, 0.8, 0.5 + 0.5 * Math.sin(y * 1.55 + 0.6)) * smoothstepN(2.6, 3.4, y);
  for (let x = -36.6; x <= 9; x += 1.0) {
    const t = (x + 36.6) / 45.6;
    // the back: the rump's rounded top (~9.6 m), long and nearly flat, rising to the shoulders (~12.8 m)
    const h = x < -33 ? 6 + (x + 36.6) * 1.0 : 9.8 + 0.6 * Math.sin(t * Math.PI * 0.9) + 3.0 * Math.max(0, (x + 8) / 17);
    const w = 8.4 + 1.1 * Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.5);
    // the folded hind leg's haunch bulging out low on each side of the rump
    const haunch = Math.exp(-(((x + 27) / 6.5) ** 2));
    bodyRings.push(section(x, w, h, 0, 0, 6, 22, (y) => haunch * 1.6 * Math.exp(-(((y - 3.5) / 2.6) ** 2)) + groove(y) * (y < h - 0.6 ? 1 : 0)));
  }
  loft(g, bodyRings, m, K.BEDROCK, rest);
  // the rump's rounded end cap
  const rump = bodyRings[0];
  for (let i = 0; i + 1 < rump.length; i++) g.tri(V(-36.9, 3, 0).applyMatrix4(m), rump[i].clone().applyMatrix4(m), rump[i + 1].clone().applyMatrix4(m), K.BEDROCK);
  // ── the chest: from the shoulders forward and down to between the paws ──
  const chest: THREE.Vector3[][] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const x = 9 + t * 4.6;
    chest.push(section(x, 9.5 - t * 3.2, 12.8 - t * 3.5 - t * t * 1.5, 0, 0, 4, 22, groove));
  }
  loft(g, chest, m, K.BEDROCK, rest);
  const cap = chest[chest.length - 1];
  for (let i = 0; i + 1 < cap.length; i++) g.tri(V(13.9, 3.5, 0).applyMatrix4(m), cap[i].clone().applyMatrix4(m), cap[i + 1].clone().applyMatrix4(m), K.BEDROCK);
  // ── the neck, rising behind the head ──
  const neck: THREE.Vector3[][] = [];
  // (worn thin under the head — the real neck is noticeably narrower than the headdress above it)
  for (let i = 0; i <= 5; i++) {
    const y = 10.5 + i * 0.9;
    const ring: THREE.Vector3[] = [];
    for (let j = 0; j <= 16; j++) {
      const a = (j / 16) * TAU;
      ring.push(V(11.4 + Math.cos(a) * 1.9, y, Math.sin(a) * (2.4 - 0.25 * Math.sin((i / 5) * Math.PI))));
    }
    neck.push(ring);
  }
  loft(g, neck, m, K.BEDROCK, rest, true);
  // ── the forelegs, stretched out east ──
  for (const side of [-1, 1]) {
    const legs: THREE.Vector3[][] = [];
    for (let x = 6; x <= 35.6; x += 1.6) {
      const t = (x - 6) / 29.6;
      legs.push(section(x, 2.35 - t * 0.2, 3.5 - t * 1.1, 0, side * 5.3, 3.0, 12));
    }
    loft(g, legs, m, K.BEDROCK, rest);
    // the paw: rounded front, four toes
    const end = legs[legs.length - 1];
    for (let i = 0; i + 1 < end.length; i++) g.tri(V(36.7, 1.0, side * 5.3).applyMatrix4(m), end[i].clone().applyMatrix4(m), end[i + 1].clone().applyMatrix4(m), K.BEDROCK);
    for (let toe = 0; toe < 4; toe++) {
      const tm = new THREE.Matrix4().compose(V(35.6, 0.8, side * 5.3 + (toe - 1.5) * 1.05), new THREE.Quaternion(), V(1.6, 1.4, 0.95));
      g.add(new THREE.SphereGeometry(0.62, 8, 6), new THREE.Matrix4().multiplyMatrices(m, tm), K.BEDROCK, rest);
    }
  }
  // ── the tail, curled round the right (south) haunch and forward along the side ──
  const tailPath = new THREE.CatmullRomCurve3([V(-36.2, 5.5, 2.5), V(-37.2, 2.2, 6.2), V(-33, 0.9, 9.4), V(-24, 0.9, 10.2), V(-17.5, 1.6, 10.0), V(-16.2, 2.6, 9.4)]);
  g.add(new THREE.TubeGeometry(tailPath, 40, 0.55, 7, false), m, K.BEDROCK, rest);
  // ── the hind paws, tucked forward beside the haunches ──
  for (const side of [-1, 1]) {
    const hm = new THREE.Matrix4().compose(V(-17, 0.9, side * 9.0), new THREE.Quaternion(), V(4.2, 1.0, 1.5));
    g.add(new THREE.SphereGeometry(1, 10, 7), new THREE.Matrix4().multiplyMatrices(m, hm), K.BEDROCK, rest);
  }
  // ── the head (chin 14.4 m, top of the headdress 20.2 m, face 4.15 m wide) ──
  const headM = (geo: THREE.BufferGeometry, pos: THREE.Vector3, scale: THREE.Vector3, rot = new THREE.Euler()) => g.add(geo, new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), scale)), K.BEDROCK, rest);
  // the skull behind the face
  headM(new THREE.SphereGeometry(1, 18, 14), V(12.4, 17.3, 0), V(2.3, 2.9, 2.15));
  // the face: a sculpted relief grid on the front of the head
  const FW = 2.08;
  const face: THREE.Vector3[][] = [];
  const gauss = (u: number, v: number, cu: number, cv: number, su: number, sv: number) => Math.exp(-(((u - cu) / su) ** 2) - (((v - cv) / sv) ** 2));
  for (let iv = 0; iv <= 30; iv++) {
    const v = 14.4 + (iv / 30) * 4.5;
    const ring: THREE.Vector3[] = [];
    for (let iu = 0; iu <= 24; iu++) {
      const u = -FW + (iu / 24) * 2 * FW;
      const un = u / FW;
      let d = 14.55 - 0.85 * un ** 2 - 0.5 * un ** 4; // the face's own rounding
      d -= 0.55 * Math.max(0, (v - 18.4) / 0.5) ** 2 * 0.15; // up under the headband
      d -= 0.3 * Math.max(0, (14.9 - v) / 0.5); // the jaw tucking under at the chin
      d += 0.24 * gauss(u, v, 0, 17.95, 1.7, 0.18); // the brow ridge
      for (const ex of [-0.98, 0.98]) {
        d -= 0.42 * gauss(u, v, ex, 17.42, 0.42, 0.24); // the eye sockets
        d += 0.12 * gauss(u, v, ex, 17.4, 0.22, 0.1); // the eyeballs
      }
      // the nose: broken off long ago — a rough flat scar from the bridge down to the lip
      d += 0.3 * gauss(u, v, 0, 17.35, 0.32, 0.25);
      d -= 0.08 * gauss(u, v, 0, 16.5, 0.45, 0.45);
      d += 0.06 * (Math.sin(u * 23 + v * 17) * 0.5 + 0.5) * gauss(u, v, 0, 16.6, 0.5, 0.5);
      // the lips (2.3 m wide) and the line between them, a hint of a smile at the corners
      d += 0.26 * gauss(u, v, 0, 15.66, 1.0, 0.12) - 0.18 * gauss(u, v, 0, 15.5, 1.1, 0.05) + 0.2 * gauss(u, v, 0, 15.32, 0.9, 0.12);
      d += 0.08 * (gauss(u, v, -1.1, 15.6, 0.15, 0.12) + gauss(u, v, 1.1, 15.6, 0.15, 0.12));
      d += 0.22 * gauss(u, v, 0, 14.75, 0.8, 0.25); // the chin
      d -= 0.15 * gauss(Math.abs(u), v, 1.55, 16.6, 0.35, 0.9); // the cheek hollows
      ring.push(V(d, v, u));
    }
    face.push(ring);
  }
  loft(g, face, new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(0, 0, 0)), K.BEDROCK, rest);
  // the ears, either side of the face in front of the headdress
  for (const side of [-1, 1]) {
    headM(new THREE.CylinderGeometry(0.68, 0.68, 0.32, 12, 1, false, 0, Math.PI), V(13.0, 17.3, side * 2.28), V(1, 1, 1), new THREE.Euler(Math.PI / 2, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0));
  }
  // the nemes headdress: the domed top, the broad wings flaring out behind the ears, the two
  // lappets hanging down onto the chest, the headband across the brow and the plait at the back
  headM(new THREE.SphereGeometry(1, 18, 10, 0, TAU, 0, Math.PI * 0.55), V(12.1, 18.5, 0), V(2.75, 1.75, 2.55));
  headM(new THREE.BoxGeometry(1, 1, 1), V(14.25, 18.92, 0), V(0.5, 0.3, 4.4)); // the headband
  headM(new THREE.SphereGeometry(0.28, 8, 6), V(14.55, 19.15, 0), V(1, 1.6, 1)); // the uraeus' broken stump
  /** a closed six-sided solid from its 8 corners (front face a,b,c,d then back face e,f,g,h) */
  const solid = (pts: THREE.Vector3[]) => {
    const q = pts.map((p0) => p0.clone().applyMatrix4(m));
    const [a, b, c, d, e, f, gg, h] = q;
    for (const [p1, p2, p3, p4] of [[a, b, c, d], [e, f, gg, h], [a, b, f, e], [b, c, gg, f], [c, d, h, gg], [d, a, e, h]]) g.quad(p1, p2, p3, p4, K.BEDROCK, 0, [rest, rest, rest, rest]);
  };
  for (const sd of [-1, 1]) {
    // a wing: the cloth falls from the temple, behind the ear, and flares out to the shoulder —
    // narrow at the top (z ±2.4..2.8), broad at the bottom (z ±2.9..4.9): the trapezoid outline
    // that makes the Sphinx's head unmistakable from the front
    solid([
      V(12.85, 18.75, sd * 2.4), V(12.85, 18.75, sd * 2.85), V(12.85, 13.8, sd * 4.9), V(12.85, 13.8, sd * 2.9),
      V(10.3, 18.75, sd * 2.4), V(10.3, 18.75, sd * 2.85), V(10.0, 13.8, sd * 4.9), V(10.0, 13.8, sd * 2.9),
    ]);
    // the lappet: the broad band hanging down in front of the shoulder from under the wing
    solid([
      V(13.55, 14.1, sd * 2.75), V(13.55, 14.1, sd * 4.15), V(13.4, 9.6, sd * 3.85), V(13.4, 9.6, sd * 2.9),
      V(12.4, 14.1, sd * 2.75), V(12.4, 14.1, sd * 4.15), V(12.3, 9.6, sd * 3.85), V(12.3, 9.6, sd * 2.9),
    ]);
  }
  headM(new THREE.CylinderGeometry(0.7, 0.9, 3.4, 10), V(9.4, 15.6, 0), V(1, 1, 1), new THREE.Euler(0, 0, 0.25)); // the plait
  // ── the Dream Stele of Thutmose IV between the paws (granite, 3.6 m tall), and its altar ──
  const stele = new THREE.Matrix4().compose(V(14.6, 1.8, 0), new THREE.Quaternion(), V(0.7, 3.6, 2.4));
  g.add(new THREE.BoxGeometry(1, 1, 1), new THREE.Matrix4().multiplyMatrices(m, stele), K.GRANITE);
  const lun = new THREE.Matrix4().compose(V(14.6, 3.6, 0), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI / 2), V(1.2, 0.7, 1.2));
  g.add(new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, 0, Math.PI), new THREE.Matrix4().multiplyMatrices(m, lun), K.GRANITE);
  g.add(new THREE.BoxGeometry(1, 1, 1), new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().compose(V(19.5, 0.5, 0), new THREE.Quaternion(), V(1.4, 1.0, 1.4))), K.MASONRY);
  // ── the pit's quarried walls (west, north, south) ──
  for (const w of SPHINX_PIT_WALLS) {
    const h = w.top - floor + 0.8;
    g.box(w.x, floor - 0.8 + h / 2, w.z, w.hx * 2, h, w.hz * 2, K.BEDROCK, 0, rest - 100);
  }
}

// ── temples ──
function buildTemple(g: Geo, t: GizaTemple) {
  const base = gizaPlateauY(t.e, t.s);
  for (const b of templeWalls(t)) {
    const h = b.top - base + 0.6;
    // walls built in great courses; the Valley Temple's faced in red granite
    g.box(b.x, base - 0.6 + h / 2, b.z, b.hx * 2, h, b.hz * 2, K.MASONRY, 0, 0);
    // broken tops: a few blocks missing along the wall
    const rng = gizaRng(Math.round(b.x * 31 + b.z * 17));
    const len = Math.max(b.hx, b.hz) * 2;
    const along = b.hx > b.hz;
    for (let i = 0; i < len / 1.4; i++) {
      if (rng() < 0.5) continue;
      const a = -len / 2 + (i + 0.5) * 1.4;
      g.box(along ? b.x + a : b.x, b.top + 0.28, along ? b.z : b.z + a, along ? 1.3 : b.hx * 2 * 0.9, 0.55, along ? b.hz * 2 * 0.9 : 1.3, K.MASONRY);
    }
  }
  const c = gizaWorld(t.e, t.s);
  const inE = (t.halfE - t.wall) * S;
  const inS = (t.halfS - t.wall) * S;
  if (t.id === "valley-temple") {
    // the great limestone walls are lined inside with polished red granite (the outside was
    // meant to be cased too, but the granite was only ever put on the inside)
    const wallH = t.wallH * S - 0.3;
    const lin = 0.12;
    const doorHalf = (Math.max(...t.doors.map((d) => d.width)) / 2) * S + 0.1;
    g.box(c.x, base + wallH / 2, c.z - inS + lin / 2, inE * 2, wallH, lin, K.MASONRY, 0, 1);
    g.box(c.x, base + wallH / 2, c.z + inS - lin / 2, inE * 2, wallH, lin, K.MASONRY, 0, 1);
    for (const sd of [-1, 1]) {
      const len = inS - doorHalf;
      for (const half of [-1, 1]) g.box(c.x + sd * (inE - lin / 2), base + wallH / 2, c.z + half * (doorHalf + len / 2), lin, wallH, len, K.MASONRY, 0, 1);
    }
    // alabaster floor, and the T-shaped hall of red-granite pillars and beams
    g.box(c.x, base + 0.04, c.z, inE * 2, 0.08, inS * 2, K.ALABASTER);
    // (real: 1.05 m square monoliths 4.1 m tall — six across the top of the T, two rows of five
    // down its stem — carrying granite beams; world = metres × S)
    const PH = 4.1 * S;
    const pillar = (e: number, s: number) => g.box(c.x + e * S, base + PH / 2, c.z + s * S, 1.05 * S, PH, 1.05 * S, K.GRANITE);
    const bar: [number, number][] = [];
    for (let i = 0; i < 6; i++) bar.push([7, -13.5 + i * 5.4]);
    for (const row of [-3.6, 3.6]) for (let i = 0; i < 5; i++) bar.push([-1 - i * 4.2, row]);
    for (const [e, s] of bar) pillar(e, s);
    g.box(c.x + 7 * S, base + PH + 0.3 * S, c.z, 1.1 * S, 0.6 * S, 28 * S, K.GRANITE);
    for (const row of [-3.6, 3.6]) g.box(c.x + -9.4 * S, base + PH + 0.3 * S, c.z + row * S, 18 * S, 0.6 * S, 1.1 * S, K.GRANITE);
  } else if (t.id === "khufu-mortuary") {
    // only its black basalt floor survives, a courtyard of it
    g.box(c.x, base + 0.05, c.z, inE * 2, 0.1, inS * 2, K.BASALT);
  } else {
    // courtyard pillar stumps
    const rng = gizaRng(t.id.length * 131);
    const n = 6;
    for (let i = 0; i < n; i++)
      for (const side of [-1, 1]) {
        const e = -t.halfE * 0.5 + (i / (n - 1)) * t.halfE;
        const s = side * t.halfS * 0.42;
        const h = (0.8 + rng() * 2.6) * S;
        g.box(c.x + e * S, base + h / 2, c.z + s * S, 1.2 * S, h, 1.2 * S, K.MASONRY);
      }
    g.box(c.x, base + 0.04, c.z, inE * 2, 0.08, inS * 2, K.MASONRY);
  }
}

// ── causeways: raised paved ramps with low kerbs, draped over the ground ──
function buildCauseway(g: Geo, pts: [number, number][], width: number) {
  const [a, b] = pts;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.ceil(len / 4));
  const de = (b[0] - a[0]) / len;
  const ds = (b[1] - a[1]) / len;
  const half = (width / 2) * S;
  let prev: { l: THREE.Vector3; r: THREE.Vector3; kl: THREE.Vector3; kr: THREE.Vector3; along: number } | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = gizaWorld(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
    const y = groundY(p.x, p.z) + 0.35;
    const nx = -ds;
    const nz = de;
    const l = V(p.x + nx * half, y, p.z + nz * half);
    const r = V(p.x - nx * half, y, p.z - nz * half);
    const kl = l.clone().add(V(0, 0.4, 0));
    const kr = r.clone().add(V(0, 0.4, 0));
    const along = t * len * S;
    if (prev) {
      g.quad(prev.l, prev.r, r, l, K.MASONRY, 0);
      g.quad(prev.l, l, kl, prev.kl, K.MASONRY, 0);
      g.quad(prev.r, r, kr, prev.kr, K.MASONRY, 0);
      // the ramp's own sides, down to the sand
      g.quad(V(prev.l.x, prev.l.y - 1.2, prev.l.z), V(l.x, l.y - 1.2, l.z), l, prev.l, K.MASONRY, 0);
      g.quad(V(prev.r.x, prev.r.y - 1.2, prev.r.z), V(r.x, r.y - 1.2, r.z), r, prev.r, K.MASONRY, 0);
    }
    prev = { l, r, kl, kr, along };
  }
}

/** a boat pit: a long boat-shaped trench cut into the rock, edged with dressed stone */
function buildBoatPit(g: Geo, pit: { e: number; s: number; len: number; width: number; angle: number }) {
  const c = gizaWorld(pit.e, pit.s);
  const y = gizaPlateauY(pit.e, pit.s) + 0.03;
  const L = (pit.len / 2) * S;
  const W = (pit.width / 2) * S;
  const ca = Math.cos(pit.angle);
  const sa = Math.sin(pit.angle);
  const at = (u: number, w: number, yy: number) => V(c.x + u * ca - w * sa, yy, c.z + u * sa + w * ca);
  const N = 16;
  const outline: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const u = -L + (i / N) * 2 * L;
    outline.push([u, W * Math.pow(Math.max(0, 1 - (u / L) ** 2), 0.6)]);
  }
  for (let i = 0; i < N; i++) {
    const [u0, w0] = outline[i];
    const [u1, w1] = outline[i + 1];
    g.quad(at(u0, -w0, y - 0.6), at(u1, -w1, y - 0.6), at(u1, w1, y - 0.6), at(u0, w0, y - 0.6), K.DARK, 0);
    for (const sd of [-1, 1]) {
      g.quad(at(u0, sd * w0, y - 0.6), at(u1, sd * w1, y - 0.6), at(u1, sd * w1, y), at(u0, sd * w0, y), K.BEDROCK, 0, [0, 0, 0, 0]);
      g.quad(at(u0, sd * w0, y), at(u1, sd * w1, y), at(u1, sd * (w1 + 0.5), y + 0.06), at(u0, sd * (w0 + 0.5), y + 0.06), K.MASONRY, 0);
    }
  }
}

// ── small life: palms, camels, sign posts ──
const PALM_TRUNK = new THREE.MeshStandardMaterial({ color: "#7a5a3a", roughness: 0.95 });
const PALM_LEAF = new THREE.MeshStandardMaterial({ color: "#4f7a32", roughness: 0.8, side: THREE.DoubleSide });
const CAMEL = new THREE.MeshStandardMaterial({ color: "#c39a68", roughness: 0.9 });
const CAMEL_DARK = new THREE.MeshStandardMaterial({ color: "#8a6646", roughness: 0.9 });
const SADDLE = new THREE.MeshStandardMaterial({ color: "#b0323a", roughness: 0.8 });
const SADDLE_TRIM = new THREE.MeshStandardMaterial({ color: "#e8c050", roughness: 0.7 });
const SIGN_WOOD = new THREE.MeshStandardMaterial({ color: "#8a6238", roughness: 0.85 });
const SIGN_FACE = new THREE.MeshStandardMaterial({ color: "#f2e6c4", roughness: 0.8 });

function buildPalm(rng: () => number): THREE.Group {
  const p = new THREE.Group();
  const h = 4.5 + rng() * 2.5;
  const lean = (rng() - 0.5) * 0.3;
  const path = new THREE.CatmullRomCurve3([V(0, 0, 0), V(lean * h * 0.4, h * 0.5, 0), V(lean * h, h, 0)]);
  p.add(new THREE.Mesh(new THREE.TubeGeometry(path, 8, 0.17, 6, false), PALM_TRUNK));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + rng() * 0.3;
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5, 4, 1), PALM_LEAF);
    const pos = leaf.geometry.getAttribute("position");
    for (let j = 0; j < pos.count; j++) {
      const x = pos.getX(j) + 1.3;
      pos.setXYZ(j, x, -0.12 * x * x + pos.getY(j) * 0.2, pos.getY(j));
    }
    leaf.geometry.computeVertexNormals();
    leaf.position.set(lean * h, h, 0);
    leaf.rotation.y = a;
    p.add(leaf);
  }
  return p;
}

function buildCamel(): THREE.Group {
  const c = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), CAMEL);
  body.scale.set(1.3, 0.62, 0.55);
  body.position.y = 1.9;
  c.add(body);
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), CAMEL);
  hump.scale.set(1.2, 0.9, 0.9);
  hump.position.set(-0.05, 2.45, 0);
  c.add(hump);
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 1.25), SADDLE);
  blanket.position.set(-0.05, 2.62, 0);
  blanket.rotation.z = 0.05;
  c.add(blanket);
  for (const sd of [-1, 1]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.12, 0.05), SADDLE_TRIM);
    trim.position.set(-0.05, 2.38, sd * 0.64);
    c.add(trim);
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.26, 1.35, 8), CAMEL);
  neck.position.set(1.35, 2.35, 0);
  neck.rotation.z = -0.75;
  c.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.3, 0.3), CAMEL);
  head.position.set(1.95, 2.85, 0);
  c.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.24), CAMEL_DARK);
  snout.position.set(2.28, 2.8, 0);
  c.add(snout);
  for (const sd of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 5), CAMEL_DARK);
    ear.position.set(1.75, 3.05, sd * 0.12);
    c.add(ear);
  }
  for (const [lx, lz] of [[0.75, 0.28], [0.75, -0.28], [-0.75, 0.28], [-0.75, -0.28]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 1.6, 6), CAMEL);
    leg.position.set(lx, 0.8, lz);
    c.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.08, 8), CAMEL_DARK);
    foot.position.set(lx, 0.04, lz);
    c.add(foot);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 0.7, 5), CAMEL_DARK);
  tail.position.set(-1.3, 1.75, 0);
  tail.rotation.z = 0.3;
  c.add(tail);
  c.userData.head = head;
  return c;
}

function buildSign(): THREE.Group {
  const s = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 0.14), SIGN_WOOD);
  post.position.y = 0.75;
  s.add(post);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.06), SIGN_FACE);
  board.position.y = 1.35;
  board.rotation.x = -0.25;
  s.add(board);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.68, 0.04), SIGN_WOOD);
  frame.position.set(0, 1.35, -0.02);
  frame.rotation.x = -0.25;
  s.add(frame);
  return s;
}

export interface GizaDecor {
  group: THREE.Group;
  update(dt: number, t: number): void;
  dispose(): void;
}

export function buildGizaDecor(scene: THREE.Scene): GizaDecor {
  const root = new THREE.Group();
  root.name = "giza-decor";
  const g = new Geo();
  for (const def of PYRAMIDS) {
    buildPyramid(g, def);
    buildEntrances(g, def);
  }
  // Khufu's own top: the survey mast set up there in 1874 to show how tall he was when new
  {
    const k = pyramidCourses(PYRAMIDS[0]);
    const y0 = k.baseY + k.top[k.top.length - 1];
    const y1 = k.baseY + k.apexY;
    const h = y1 - y0;
    g.box(k.cx, y0 + h / 2, k.cz, 0.12, h, 0.12, K.METAL);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU;
      const leg = new THREE.Matrix4().compose(V(k.cx + Math.cos(a) * 0.7, y0 + h * 0.3, k.cz + Math.sin(a) * 0.7), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a) * -0.4, 0, Math.cos(a) * 0.4)), V(0.08, h * 0.65, 0.08));
      g.add(new THREE.BoxGeometry(1, 1, 1), leg, K.METAL);
    }
    // a few of Khufu's original casing stones still in place at the foot of his north face
    for (let i = -3; i <= 3; i++) {
      const x = k.cx + i * 1.6 * S;
      const z = k.cz - k.hz + 0.7;
      const m = new THREE.Matrix4().compose(V(x, k.baseY + 0.4, z), new THREE.Quaternion(), V(1.55 * S, 0.8, 1.4));
      g.add(new THREE.BoxGeometry(1, 1, 1), m, K.CASING);
    }
  }
  buildSphinx(g);
  for (const t of TEMPLES) buildTemple(g, t);
  for (const c of CAUSEWAYS) buildCauseway(g, c.pts, c.width);
  for (const p of BOAT_PITS) buildBoatPit(g, p);
  const stoneGeo = g.build();
  const stone = new THREE.Mesh(stoneGeo, stoneMaterial());
  stone.name = "giza-stone";
  stone.castShadow = true;
  stone.receiveShadow = true;
  root.add(stone);

  // the mastaba tombs: one instanced battered block, laid out in their streets
  const mg = new Geo();
  {
    const b = 0.5;
    const t = 0.42; // the top is set in from the foot: the sloping (battered) sides
    const corners = (y: number, h: number) => [V(-h, y, -h), V(h, y, -h), V(h, y, h), V(-h, y, h)];
    const lo = corners(0, b);
    const hi = corners(1, t);
    for (let i = 0; i < 4; i++) mg.quad(lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i], K.MASONRY, 0);
    mg.quad(hi[0], hi[1], hi[2], hi[3], K.MASONRY, 0);
  }
  const mastabaMesh = new THREE.InstancedMesh(mg.build(), stoneMaterial(), MASTABAS.length);
  mastabaMesh.name = "giza-mastabas";
  const m4 = new THREE.Matrix4();
  MASTABAS.forEach((ms, i) => {
    const p = gizaWorld(ms.e, ms.s);
    m4.compose(V(p.x, gizaPlateauY(ms.e, ms.s) - 0.3, p.z), new THREE.Quaternion(), V(ms.halfE * 2 * S, ms.h * S + 0.3, ms.halfS * 2 * S));
    mastabaMesh.setMatrixAt(i, m4);
  });
  mastabaMesh.instanceMatrix.needsUpdate = true;
  mastabaMesh.castShadow = true;
  mastabaMesh.receiveShadow = true;
  mastabaMesh.frustumCulled = false;
  root.add(mastabaMesh);

  // desert rocks and limestone rubble round the monuments (never on them)
  const rockGeo = new THREE.DodecahedronGeometry(0.5, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: "#b39c74", roughness: 0.95, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 260);
  rocks.name = "giza-rocks";
  const rr = gizaRng(90210);
  let nRocks = 0;
  for (let tries = 0; tries < 3000 && nRocks < 260; tries++) {
    const e = -760 + rr() * 1250;
    const s = -200 + rr() * 1150;
    const p = gizaWorld(e, s);
    // rubble heaps cluster round the ruined queens' pyramids and along the pyramids' feet
    const nearPyr = PYRAMIDS.some((d) => Math.abs(e - d.e) < d.halfE + 14 && Math.abs(s - d.s) < d.halfS + 14 && !(Math.abs(e - d.e) < d.halfE + 1 && Math.abs(s - d.s) < d.halfS + 1));
    if (!nearPyr && rr() < 0.75) continue;
    if (PYRAMIDS.some((d) => Math.abs(e - d.e) < d.halfE + 1 && Math.abs(s - d.s) < d.halfS + 1)) continue;
    if (TEMPLES.some((t) => Math.abs(e - t.e) < t.halfE + 2 && Math.abs(s - t.s) < t.halfS + 2)) continue;
    if (MASTABAS.some((t) => Math.abs(e - t.e) < t.halfE + 2 && Math.abs(s - t.s) < t.halfS + 2)) continue;
    if (Math.abs(e - SPHINX_E) < 52 && Math.abs(s - SPHINX_S) < 32) continue;
    const sc = 0.4 + rr() * rr() * 2.2;
    m4.compose(V(p.x, groundY(p.x, p.z) + sc * 0.2, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rr() * 3, rr() * 3, rr() * 3)), V(sc, sc * (0.5 + rr() * 0.5), sc));
    rocks.setMatrixAt(nRocks++, m4);
  }
  rocks.count = nRocks;
  rocks.instanceMatrix.needsUpdate = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.frustumCulled = false;
  root.add(rocks);

  // date palms on the valley floor east of the Sphinx, where the village of Nazlet el-Samman is
  const palmRng = gizaRng(31337);
  for (let i = 0; i < 16; i++) {
    const e = SPHINX_E + 125 + palmRng() * 90;
    const s = SPHINX_S - 90 + palmRng() * 220;
    const p = gizaWorld(e, s);
    const palm = buildPalm(palmRng);
    palm.position.set(p.x, groundY(p.x, p.z), p.z);
    palm.rotation.y = palmRng() * TAU;
    root.add(palm);
  }

  // camels, waiting for riders at the Sphinx view, by the Great Pyramid and at the panorama
  const camels: THREE.Group[] = [];
  const camelSpots: [number, number, number][] = [
    [SPHINX_E + 110, SPHINX_S + 22, 2.6],
    [SPHINX_E + 104, SPHINX_S + 30, 2.2],
    [SPHINX_E + 118, SPHINX_S + 34, 2.9],
    [30, -150, 0.4],
    [44, -156, 0.2],
    [-740, 1030, -0.6],
    [-752, 1044, -0.9],
  ];
  for (const [e, s, yaw] of camelSpots) {
    const p = gizaWorld(e, s);
    const c = buildCamel();
    c.position.set(p.x, groundY(p.x, p.z), p.z);
    c.rotation.y = yaw;
    c.scale.setScalar(0.62);
    root.add(c);
    camels.push(c);
  }
  // sign posts at the viewpoints (registry/wonders.ts's "Read the sign")
  for (const vp of GIZA_VIEWPOINTS) {
    const s = buildSign();
    s.position.set(vp.x, groundY(vp.x, vp.z), vp.z);
    s.rotation.y = Math.atan2(GIZA_ARRIVAL.x - vp.x, GIZA_ARRIVAL.z - vp.z);
    root.add(s);
  }

  scene.add(root);
  return {
    group: root,
    update(_dt, t) {
      camels.forEach((c, i) => {
        const head = c.userData.head as THREE.Mesh;
        head.rotation.z = Math.sin(t * 0.7 + i * 1.3) * 0.12;
      });
    },
    dispose() {
      scene.remove(root);
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) if (mat && mat !== _stoneMat) mat.dispose();
        }
      });
      _stoneMat?.dispose();
      _stoneMat = null;
    },
  };
}

/** for tests/harness: how many triangles the stone complex is */
export function gizaStoneTriangles(): number {
  const g = new Geo();
  for (const def of PYRAMIDS) buildPyramid(g, def);
  return g.pos.length / 9;
}
