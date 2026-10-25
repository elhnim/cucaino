// The animals' rig: every species is ONE instanced mesh whose vertices know which "bone" they
// ride on, and a vertex shader bends them per instance — so a whole herd walking, swinging its
// tail, turning its head to look at you, opening its jaws, flapping its wings or swinging its trunk
// costs one draw call and no skinning.
//
// Per vertex (baked by rp()):
//   aSV.x   0 its own colour / 1 the instance colour (the coat) / 2 the instance's second colour (aColB)
//   aSV.y   which variant it belongs to (a mixed mesh holds several small species) — -1 = all
//   aRig    (kind, t, p1, p2):
//             kind 0 body          (rigid; bobs with the gait)
//                  1 neck + head   (t 0 at the neck's root .. 1 = the head: bends progressively)
//                  2 tail          (t 0 root .. 1 tip: sways in a travelling wave)
//                  3 leg           (p1 = step phase offset, p2 = 1 hind leg; t 0 hip .. 1 foot)
//                  4 little arm    (p1 = phase offset; small swing)
//                  5 wing/flipper  (p1 = side ±1; t = along the span)
//                  6 jaw           (on the head; opens about its hinge)
//                  7 trunk         (on the head; swings and curls, t along it)
//                  8 ear           (on the head; flaps, p1 = side)
//   aPivot  the bone's own pivot (hip / shoulder / tail root / wing root / jaw hinge / trunk root / ear root)
// Per variant (uniform arrays, indexed by the instance's variant): the neck's root, the head's centre
// (babies get bigger heads) and the hips (rearing up pivots there).
// Per instance: aColB (second colour + the variant in w), aAnim (walk phase, gait, head yaw, head pitch), aAnim2 (tail sway,
// jaw, baby, flap/curl), aAnim3 (rear, lie down, ears/wing fold, shake).
import * as THREE from "three";

const _c = new THREE.Color();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();

export const K_BODY = 0;
export const K_NECK = 1;
export const K_TAIL = 2;
export const K_LEG = 3;
export const K_ARM = 4;
export const K_WING = 5;
export const K_JAW = 6;
export const K_TRUNK = 7;
export const K_EAR = 8;

export type V3 = [number, number, number];
type PerF<T> = T | ((p: THREE.Vector3, n: THREE.Vector3) => T);

export interface RigPart {
  kind?: number;
  /** position along the bone (per vertex) */
  t?: number | ((p: THREE.Vector3) => number);
  p1?: number;
  p2?: number;
  pivot?: V3;
  slot?: PerF<number>;
  v?: number;
}

/** t along a chain from a to b (0 at a, 1 at b; clamped) */
export function along(a: V3, b: V3, pow = 1): (p: THREE.Vector3) => number {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const L2 = ux * ux + uy * uy + uz * uz || 1;
  return (p) => Math.pow(Math.min(1, Math.max(0, ((p.x - a[0]) * ux + (p.y - a[1]) * uy + (p.z - a[2]) * uz) / L2)), pow);
}

/** a faceted, flat-coloured-per-face animal part in the rig layout */
export function rp(g: THREE.BufferGeometry, color: PerF<THREE.Color | string>, o: RigPart = {}): THREE.BufferGeometry {
  let geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  for (const name of Object.keys(geo.attributes)) if (name !== "position") geo.deleteAttribute(name);
  geo.computeVertexNormals();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const n = pos.count;
  const cA = new Float32Array(n * 3);
  const slotA = new Float32Array(n);
  const rigA = new Float32Array(n * 4);
  const pivA = new Float32Array(n * 3);
  const varA = new Float32Array(n).fill(o.v ?? -1);
  const kind = o.kind ?? K_BODY;
  const piv = o.pivot ?? [0, 0, 0];
  for (let f = 0; f < n; f += 3) {
    _p.set(0, 0, 0);
    _n.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      _p.x += pos.getX(f + k) / 3;
      _p.y += pos.getY(f + k) / 3;
      _p.z += pos.getZ(f + k) / 3;
      _n.x += nor.getX(f + k);
      _n.y += nor.getY(f + k);
      _n.z += nor.getZ(f + k);
    }
    _n.normalize();
    if (typeof color === "function") {
      const r = color(_p, _n);
      if (typeof r === "string") _c.set(r);
      else _c.copy(r);
    } else if (typeof color === "string") _c.set(color);
    else _c.copy(color);
    const slot = typeof o.slot === "function" ? o.slot(_p, _n) : (o.slot ?? 0);
    for (let k = 0; k < 3; k++) {
      const i = f + k;
      cA[i * 3] = _c.r;
      cA[i * 3 + 1] = _c.g;
      cA[i * 3 + 2] = _c.b;
      slotA[i] = slot;
    }
  }
  for (let i = 0; i < n; i++) {
    _p.fromBufferAttribute(pos, i);
    const t = typeof o.t === "function" ? o.t(_p) : (o.t ?? (kind === K_NECK ? 1 : 0));
    rigA[i * 4] = kind;
    rigA[i * 4 + 1] = t;
    rigA[i * 4 + 2] = o.p1 ?? 0;
    rigA[i * 4 + 3] = o.p2 ?? 0;
    pivA[i * 3] = piv[0];
    pivA[i * 3 + 1] = piv[1];
    pivA[i * 3 + 2] = piv[2];
  }
  // (slot + variant share one attribute: WebGL allows only 16 per vertex, and instancing takes 5)
  const sv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    sv[i * 2] = slotA[i];
    sv[i * 2 + 1] = varA[i];
  }
  // (flat shading works the normals out per pixel: no normal attribute needed)
  geo.deleteAttribute("normal");
  geo.setAttribute("color", new THREE.BufferAttribute(cA, 3));
  geo.setAttribute("aSV", new THREE.BufferAttribute(sv, 2));
  geo.setAttribute("aRig", new THREE.BufferAttribute(rigA, 4));
  geo.setAttribute("aPivot", new THREE.BufferAttribute(pivA, 3));
  return geo;
}

/**
 * A tube through control points [x, y, z, rx, ry] (elliptical rings, oriented along the path),
 * capped at both ends: legs, necks, tails, trunks, tusks, horns.
 */
export function tube(pts: [number, number, number, number, number][], seg: number, capA = true, capB = true): THREE.BufferGeometry {
  const rings: THREE.Vector3[][] = [];
  const up = new THREE.Vector3();
  const T = new THREE.Vector3();
  const S = new THREE.Vector3();
  const U = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    up.set(0, 1, 0);
    if (Math.abs(T.dot(up)) > 0.92) up.set(0, 0, 1);
    S.crossVectors(up, T).normalize();
    U.crossVectors(T, S).normalize();
    const [x, y, z, rx, ry] = pts[i];
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k < seg; k++) {
      const th = (k / seg) * Math.PI * 2;
      ring.push(new THREE.Vector3(x + S.x * Math.cos(th) * rx + U.x * Math.sin(th) * ry, y + S.y * Math.cos(th) * rx + U.y * Math.sin(th) * ry, z + S.z * Math.cos(th) * rx + U.z * Math.sin(th) * ry));
    }
    rings.push(ring);
  }
  const pos: number[] = [];
  const push = (p: THREE.Vector3) => pos.push(p.x, p.y, p.z);
  for (let i = 0; i + 1 < rings.length; i++)
    for (let k = 0; k < seg; k++) {
      const a = rings[i][k];
      const b = rings[i][(k + 1) % seg];
      const c = rings[i + 1][k];
      const d = rings[i + 1][(k + 1) % seg];
      push(a), push(c), push(b);
      push(b), push(c), push(d);
    }
  const cap = (ring: THREE.Vector3[], c: [number, number, number, number, number], flip: boolean) => {
    const m = new THREE.Vector3(c[0], c[1], c[2]);
    for (let k = 0; k < seg; k++) {
      const a = ring[k];
      const b = ring[(k + 1) % seg];
      if (flip) push(m), push(a), push(b);
      else push(m), push(b), push(a);
    }
  };
  if (capA) cap(rings[0], pts[0], true);
  if (capB) cap(rings[rings.length - 1], pts[pts.length - 1], false);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

export const trisOf = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;

// ── the shader ──

export const RIG_SLOTS = 8;

export interface RigUniforms {
  uTime: { value: number };
  uNeck: { value: THREE.Vector3[] };
  uHead: { value: THREE.Vector3[] };
  uHip: { value: THREE.Vector3[] };
}

export function makeRigUniforms(time: { value: number }, variants: { neck: V3; head: V3; hip: V3 }[]): RigUniforms {
  const v3 = (a: V3 | undefined) => new THREE.Vector3(...(a ?? [0, 0, 0]));
  return {
    uTime: time,
    uNeck: { value: Array.from({ length: RIG_SLOTS }, (_, i) => v3(variants[i]?.neck)) },
    uHead: { value: Array.from({ length: RIG_SLOTS }, (_, i) => v3(variants[i]?.head)) },
    uHip: { value: Array.from({ length: RIG_SLOTS }, (_, i) => v3(variants[i]?.hip)) },
  };
}

const RIG_HEAD = /* glsl */ `
  attribute vec2 aSV; attribute vec4 aRig; attribute vec3 aPivot;
  attribute vec4 aColB; attribute vec4 aAnim; attribute vec4 aAnim2; attribute vec4 aAnim3;
  uniform float uTime;
  uniform vec3 uNeck[ ${RIG_SLOTS} ]; uniform vec3 uHead[ ${RIG_SLOTS} ]; uniform vec3 uHip[ ${RIG_SLOTS} ];
  vec3 rgRotX( vec3 p, float a ) { float c = cos( a ), s = sin( a ); return vec3( p.x, p.y * c - p.z * s, p.y * s + p.z * c ); }
  vec3 rgRotY( vec3 p, float a ) { float c = cos( a ), s = sin( a ); return vec3( p.x * c + p.z * s, p.y, -p.x * s + p.z * c ); }
  vec3 rgRotZ( vec3 p, float a ) { float c = cos( a ), s = sin( a ); return vec3( p.x * c - p.y * s, p.x * s + p.y * c, p.z ); }
  vec3 rigDeform( vec3 p ) {
    int vi = int( aColB.w + 0.5 );
    vec3 neck = uNeck[ vi ];
    vec3 headC = uHead[ vi ];
    vec3 hip = uHip[ vi ];
    float kind = aRig.x;
    float t = aRig.y;
    float ph = aAnim.x;
    float gait = aAnim.y;
    float seed = 0.0;
    #ifdef USE_INSTANCING
      seed = instanceMatrix[ 3 ].x * 0.37 + instanceMatrix[ 3 ].z * 0.23;
    #endif
    bool onHead = kind > 5.5 || ( kind > 0.5 && kind < 1.5 && t > 0.999 );
    // the head's own moving parts
    if ( kind > 5.5 && kind < 6.5 ) p = aPivot + rgRotX( p - aPivot, aAnim2.y * 0.62 );
    else if ( kind > 6.5 && kind < 7.5 ) {
      vec3 d = p - aPivot;
      d = rgRotX( d, -( aAnim2.w * 1.6 + 0.12 * sin( uTime * 0.9 + seed ) ) * t );
      d = rgRotZ( d, ( sin( uTime * 1.1 + seed ) * 0.28 + sin( ph ) * 0.12 * gait ) * t );
      p = aPivot + d;
    } else if ( kind > 7.5 ) p = aPivot + rgRotY( p - aPivot, aRig.z * ( 0.1 + ( 0.28 + 0.22 * sin( uTime * 2.3 + seed ) ) * aAnim3.z ) );
    // babies: big heads
    if ( onHead ) p = headC + ( p - headC ) * ( 1.0 + 0.35 * aAnim2.z );
    // the neck bends progressively; the head (and everything on it) turns with its tip
    if ( onHead || ( kind > 0.5 && kind < 1.5 ) ) {
      float tt = onHead ? 1.0 : t;
      float pitch = aAnim.w + sin( ph * 2.0 ) * 0.035 * gait;
      vec3 d = p - neck;
      d = rgRotX( d, -pitch * tt );
      d = rgRotY( d, aAnim.z * tt );
      p = neck + d;
    }
    // the tail: a travelling wave (livelier when it's walking or swishing)
    if ( kind > 1.5 && kind < 2.5 ) {
      float w = sin( uTime * 1.5 + seed - t * 2.4 ) * ( 0.1 + aAnim2.x ) + sin( ph - t * 1.6 ) * 0.1 * gait;
      vec3 d = p - aPivot;
      d = rgRotY( d, w * t );
      d = rgRotX( d, ( 0.05 * gait + aAnim3.w * 0.25 ) * t );
      p = aPivot + d;
    }
    // legs and little arms: swing about the hip/shoulder, lift the foot on the forward swing
    if ( kind > 2.5 && kind < 4.5 ) {
      bool arm = kind > 3.5;
      float sw = sin( ph + aRig.z ) * gait * ( arm ? 0.3 : 0.48 );
      // (front legs reach up when it rears — a sloth or a bear standing tall)
      if ( aRig.w < 0.5 ) sw -= aAnim3.x * 1.25;
      vec3 d = p - aPivot;
      d = rgRotX( d, sw );
      d.y += max( 0.0, cos( ph + aRig.z ) ) * gait * 0.22 * aPivot.y * t * ( arm ? 0.0 : 1.0 );
      // (folded under when lying down)
      if ( !arm ) d.y *= 1.0 - aAnim3.y * 0.62;
      p = aPivot + d;
    }
    // wings and flippers
    if ( kind > 4.5 && kind < 5.5 ) {
      float a = ( sin( ph ) * aAnim2.w - aAnim3.z ) * aRig.z * ( 0.55 + 0.45 * t );
      vec3 d = p - aPivot;
      d = rgRotZ( d, a );
      d = rgRotY( d, aRig.z * aAnim3.z * 0.9 * t );
      p = aPivot + d;
    }
    // the body bobs with each step (feet stay put); shivers when it roars
    float bob = abs( cos( ph ) ) * 0.028 * hip.y * gait;
    bool leg = kind > 2.5 && kind < 3.5;
    p.y += bob * ( leg ? 1.0 - t : 1.0 );
    if ( !leg ) p.x += sin( uTime * 43.0 ) * 0.035 * aAnim3.w * hip.y * 0.3;
    // rearing up: everything but the hind legs pivots up about the hips
    if ( !( leg && aRig.w > 0.5 ) ) p = hip + rgRotX( p - hip, -aAnim3.x );
    // lying down: the whole body sinks
    p.y -= aAnim3.y * hip.y * 0.52;
    return p;
  }
`;

const RIG_COLOR = /* glsl */ `
  #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
    vColor = vec4( 1.0 );
    #ifdef USE_COLOR
      vColor.rgb *= color.rgb;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vColor.rgb *= aSV.x > 1.5 ? aColB.rgb : ( aSV.x > 0.5 ? instanceColor.rgb : vec3( 1.0 ) );
    #endif
  #endif
`;
const RIG_COLLAPSE = /* glsl */ `
  transformed = rigDeform( transformed );
  if ( aSV.y > -0.5 && abs( aSV.y - aColB.w ) > 0.5 ) transformed = vec3( 0.0 );
`;

function patch(shader: THREE.WebGLProgramParametersWithUniforms, U: RigUniforms, colour: boolean) {
  shader.uniforms.uTime = U.uTime;
  shader.uniforms.uNeck = U.uNeck;
  shader.uniforms.uHead = U.uHead;
  shader.uniforms.uHip = U.uHip;
  shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${RIG_HEAD}`).replace("#include <begin_vertex>", `#include <begin_vertex>\n${RIG_COLLAPSE}`);
  if (colour) shader.vertexShader = shader.vertexShader.replace("#include <color_vertex>", RIG_COLOR);
}

/** the animals' material (vertex colours + the coat tints), bent by the rig */
export function rigMaterial(U: RigUniforms): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, flatShading: true });
  mat.customProgramCacheKey = () => "dino-rig";
  mat.onBeforeCompile = (shader) => patch(shader, U, true);
  return mat;
}

/** the matching shadow caster */
export function rigDepthMaterial(U: RigUniforms): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.customProgramCacheKey = () => "dino-rig-depth";
  mat.onBeforeCompile = (shader) => patch(shader, U, false);
  return mat;
}

export interface RigInstances {
  /** the second colour (rgb) + which variant (w) */
  colB: THREE.InstancedBufferAttribute;
  anim: THREE.InstancedBufferAttribute;
  anim2: THREE.InstancedBufferAttribute;
  anim3: THREE.InstancedBufferAttribute;
}

/** the per-instance attributes the rig reads */
export function addRigInstanceAttrs(mesh: THREE.InstancedMesh): RigInstances {
  const n = mesh.count;
  const mk = (size: number, fill = 0) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size).fill(fill), size);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  const colB = mk(4, 1);
  const anim = mk(4);
  const anim2 = mk(4);
  const anim3 = mk(4);
  const g = mesh.geometry;
  g.setAttribute("aColB", colB);
  g.setAttribute("aAnim", anim);
  g.setAttribute("aAnim2", anim2);
  g.setAttribute("aAnim3", anim3);
  const c = new THREE.Color(1, 1, 1);
  for (let i = 0; i < n; i++) mesh.setColorAt(i, c);
  return { colB, anim, anim2, anim3 };
}
