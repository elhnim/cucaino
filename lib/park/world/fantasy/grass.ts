// The wind-swept grass field: GPU-instanced tapered, curved blades (dark base -> sun-kissed tip)
// that follow the player. Each blade has a fixed spot in a square patch; the vertex shader wraps
// the patch around `uFocus`, so blades stay put in the world and silently recycle from the far
// side as you walk. Two layers — a dense near layer and a wider, sparser far layer — fade out at
// their edges. A baked mask (mask.ts) shrinks blades to nothing on trails / water / plaza /
// buildings / cliffs, and the terrain height texture sits every blade on the ground. Wind =
// layered sines + the travelling gust wave (shared with the trees), strongest at the tip; gusts
// brighten the blades like light rolling across a meadow. At twilight tips shimmer cyan/violet.
// Plus a third instanced layer of little wildflowers in clumps.
import * as THREE from "three";
import { rngOf } from "./noise";
import { GUST_GLSL, HASH_GLSL, type FantasyUniforms } from "./shaders";
import { MASK_GLSL, TERRAIN_GLSL, type TerrainWindows } from "./terrainWindow";

export interface GrassLayerDef {
  count: number;
  /** side of the square patch (world units) */
  patch: number;
  /** blades fade out towards this radius from the focus */
  radius: number;
  /** ...and fade in from this radius (far layer skips what the near layer covers) */
  inner: number;
  segments: number;
  height: number;
  width: number;
}

export function grassLayers(lowQuality: boolean): GrassLayerDef[] {
  return lowQuality
    ? [
        { count: 9000, patch: 34, radius: 17, inner: 0, segments: 3, height: 0.62, width: 0.2 },
        { count: 6500, patch: 88, radius: 44, inner: 13, segments: 2, height: 0.8, width: 0.42 },
      ]
    : [
        { count: 30000, patch: 42, radius: 21, inner: 0, segments: 4, height: 0.62, width: 0.14 },
        { count: 26000, patch: 116, radius: 58, inner: 16, segments: 3, height: 0.78, width: 0.32 },
      ];
}

function bladeGeometry(def: GrassLayerDef, seed: number): THREE.InstancedBufferGeometry {
  const K = def.segments;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < K; i++) {
    const t = i / K;
    const w = 0.5 * (1 - Math.pow(t, 1.25)) * (i === 0 ? 1 : 1.04);
    pos.push(-w, t, 0, w, t, 0);
  }
  pos.push(0, 1, 0);
  for (let i = 0; i < K - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const last = (K - 1) * 2;
  idx.push(last, last + 1, K * 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  const r = rngOf(seed);
  const inst = new Float32Array(def.count * 4);
  // stratified jitter (not pure random) so the field has no bald patches
  const side = Math.ceil(Math.sqrt(def.count));
  for (let i = 0; i < def.count; i++) {
    const gx = i % side;
    const gz = Math.floor(i / side);
    inst[i * 4] = (gx + r()) / side;
    inst[i * 4 + 1] = (gz + r()) / side;
    inst[i * 4 + 2] = r();
    inst[i * 4 + 3] = r() * Math.PI * 2;
  }
  g.setAttribute("aBlade", new THREE.InstancedBufferAttribute(inst, 4));
  g.instanceCount = def.count;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}

const GRASS_VERTEX_HEAD = /* glsl */ `
attribute vec4 aBlade;
uniform float uTime; uniform float uGlow; uniform vec2 uWindDir; uniform float uGust; uniform vec2 uFocus;
uniform float uPatch; uniform float uRadius; uniform float uInner; uniform float uHeight; uniform float uWidth;
${MASK_GLSL}
varying vec3 vGrassCol; varying vec3 vGrassGlow;
${TERRAIN_GLSL}
${GUST_GLSL}
${HASH_GLSL}
`;

// computes the blade (declared at main scope so begin_vertex can use it)
const GRASS_VERTEX_BODY = /* glsl */ `
  vec2 gOff = aBlade.xy * uPatch;
  vec2 gP = uFocus + mod( gOff - uFocus + 0.5 * uPatch, uPatch ) - 0.5 * uPatch;
  float gSeed = aBlade.z;
  float gD = distance( gP, uFocus );
  float gFade = ( 1.0 - smoothstep( uRadius * 0.7, uRadius, gD ) ) * smoothstep( uInner * 0.65, uInner, gD );
  vec4 gM = grassMaskAt( gP );
  float gAmt = gM.r;
  float gY = terrainY( gP );
  float gClump = fnoise( gP * 0.14 + 7.1 );
  float gVis = step( fract( gSeed * 7.13 ), gAmt * 1.2 - 0.05 );
  float gH = uHeight * ( 0.55 + 0.8 * fract( gSeed * 13.71 ) ) * ( 0.55 + 0.75 * gClump ) * mix( 0.4, 1.0, gM.g );
  gH *= gVis * ( 0.35 + 0.65 * smoothstep( 0.0, 0.7, gAmt ) ) * ( 0.15 + 0.85 * gFade );
  float gW = uWidth * ( 0.7 + 0.6 * fract( gSeed * 3.71 ) ) * step( 0.001, gFade ) * gVis;
  float gRot = aBlade.w;
  vec2 gDir = vec2( cos( gRot ), sin( gRot ) );
  vec2 gSide = vec2( -gDir.y, gDir.x );
  float gGust = fantasyGust( gP );
  float gSw = sin( uTime * 1.9 + gP.x * 0.31 + gP.y * 0.23 + gSeed * 6.2831 ) * 0.2 + sin( uTime * 3.4 + gP.x * 0.83 + gSeed * 3.0 ) * 0.07;
  vec2 gBend = gDir * ( 0.15 + 0.3 * fract( gSeed * 2.9 ) ) + uWindDir * ( 0.22 + gSw + gGust * 0.95 ) + gSide * sin( uTime * 4.1 + gSeed * 23.0 ) * 0.04;
  float gT = position.y;
  float gTT = gT * gT;
  float gShrink = 1.0 - 0.32 * min( 1.0, dot( gBend, gBend ) ) * gTT;
  vec3 gPos = vec3( gP.x + gSide.x * position.x * gW + gBend.x * gTT * gH, gY - 0.04 + gT * gH * gShrink, gP.y + gSide.y * position.x * gW + gBend.y * gTT * gH );
  objectNormal = normalize( vec3( gDir.x * 0.3 + gBend.x * 0.2, 1.0, gDir.y * 0.3 + gBend.y * 0.2 ) );

  // colour: dark base -> sun-kissed tip, meadow-wide patches of warm / cool green
  float gN1 = fnoise( gP * 0.03 + 3.0 );
  float gN2 = fnoise( gP * 0.085 - 5.0 );
  vec3 gBase = vec3( 0.035, 0.085, 0.02 );
  vec3 gTip = mix( vec3( 0.16, 0.4, 0.07 ), vec3( 0.36, 0.5, 0.1 ), smoothstep( 0.45, 0.8, gN1 ) );
  gTip = mix( gTip, vec3( 0.1, 0.34, 0.17 ), smoothstep( 0.52, 0.85, gN2 ) * 0.7 );
  gTip = mix( gTip, vec3( 0.72, 0.68, 0.3 ), step( 0.94, fract( gSeed * 31.7 ) ) * 0.55 );
  vec3 gCol = mix( gBase, gTip, smoothstep( 0.0, 0.95, gT ) );
  gCol *= ( 0.85 + 0.3 * fract( gSeed * 5.3 ) ) * ( 1.0 + gGust * 0.55 * gT );
  vGrassCol = gCol * ( 1.0 - uGlow * 0.25 );
  float gShim = pow( 0.5 + 0.5 * sin( uTime * 2.2 + gSeed * 40.0 + gP.x * 0.3 - gP.y * 0.2 ), 14.0 );
  vGrassGlow = mix( vec3( 0.15, 0.85, 1.0 ), vec3( 0.6, 0.3, 1.0 ), fnoise( gP * 0.05 + uTime * 0.04 ) ) * uGlow * gTT * gT * ( 0.015 + 0.65 * gShim ) * gVis;
`;

function grassMaterial(U: FantasyUniforms, def: GrassLayerDef, win: TerrainWindows) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const own = {
    uPatch: { value: def.patch },
    uRadius: { value: def.radius },
    uInner: { value: def.inner },
    uHeight: { value: def.height },
    uWidth: { value: def.width },
  };
  mat.customProgramCacheKey = () => "fantasy-grass";
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, own, {
      uTime: U.uTime,
      uGlow: U.uGlow,
      uWindDir: U.uWindDir,
      uGust: U.uGust,
      uFocus: U.uFocus,
      ...win.mask,
      ...win.height,
    });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${GRASS_VERTEX_HEAD}`)
      .replace("#include <beginnormal_vertex>", `vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );\n${GRASS_VERTEX_BODY}`)
      .replace("#include <begin_vertex>", "vec3 transformed = gPos;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGrassCol; varying vec3 vGrassGlow;")
      .replace("#include <color_fragment>", "diffuseColor.rgb *= vGrassCol;")
      // both faces lit like the ground (no dark backsides)
      .replace("#include <normal_fragment_begin>", "float faceDirection = 1.0; vec3 normal = normalize( vNormal ); vec3 nonPerturbedNormal = normal;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGrassGlow;");
  };
  return mat;
}

// ── wildflowers: a stem + a 5-petal head, in clumps ──
function flowerGeometry(count: number, seed: number): THREE.InstancedBufferGeometry {
  const pos: number[] = [];
  const kind: number[] = [];
  const idx: number[] = [];
  const v = (x: number, y: number, z: number, k: number) => {
    pos.push(x, y, z);
    kind.push(k);
    return pos.length / 3 - 1;
  };
  // stem: a thin 2-segment ribbon (y 0..1)
  const s0 = v(-0.025, 0, 0, 0);
  const s1 = v(0.025, 0, 0, 0);
  const s2 = v(-0.02, 0.5, 0, 0);
  const s3 = v(0.02, 0.5, 0, 0);
  const s4 = v(0, 1, 0, 0);
  idx.push(s0, s1, s2, s1, s3, s2, s2, s3, s4);
  // head: five petals round a centre, facing up (tilted a touch)
  const c = v(0, 1.02, 0, 2);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const a0 = a - 0.42;
    const a1 = a + 0.42;
    const p0 = v(Math.cos(a0) * 0.07, 1.0, Math.sin(a0) * 0.07, 1);
    const tip = v(Math.cos(a) * 0.17, 1.11, Math.sin(a) * 0.17, 1);
    const p1 = v(Math.cos(a1) * 0.07, 1.0, Math.sin(a1) * 0.07, 1);
    idx.push(c, p0, tip, c, tip, p1);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
  g.setIndex(idx);
  const r = rngOf(seed);
  const inst = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    inst[i * 4] = r();
    inst[i * 4 + 1] = r();
    inst[i * 4 + 2] = r();
    inst[i * 4 + 3] = r() * Math.PI * 2;
  }
  g.setAttribute("aBlade", new THREE.InstancedBufferAttribute(inst, 4));
  g.instanceCount = count;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}

const FLOWER_VERTEX_BODY = /* glsl */ `
  vec2 gOff = aBlade.xy * uPatch;
  vec2 gP = uFocus + mod( gOff - uFocus + 0.5 * uPatch, uPatch ) - 0.5 * uPatch;
  float gSeed = aBlade.z;
  float gD = distance( gP, uFocus );
  float gFade = 1.0 - smoothstep( uRadius * 0.7, uRadius, gD );
  vec4 gM = grassMaskAt( gP );
  float gClump = fnoise( gP * 0.07 + 11.0 ) * 0.75 + fnoise( gP * 0.3 - 2.0 ) * 0.25;
  float gVis = step( 0.56, gClump ) * step( 0.6, gM.r ) * step( 0.001, gFade );
  float gH = uHeight * ( 0.55 + 0.6 * fract( gSeed * 3.3 ) ) * gVis * ( 0.3 + 0.7 * gFade );
  float gS = ( 0.8 + 0.6 * fract( gSeed * 9.1 ) ) * gVis * ( 0.3 + 0.7 * gFade );
  float gY = terrainY( gP );
  vec3 lp = position;
  float gT = lp.y;
  lp.y *= gH;
  lp.xz *= aKind > 0.5 ? gS * 1.3 : gS;
  float gRot = aBlade.w;
  float cr = cos( gRot ); float sr = sin( gRot );
  lp.xz = vec2( lp.x * cr - lp.z * sr, lp.x * sr + lp.z * cr );
  float gGust = fantasyGust( gP );
  float gSw = sin( uTime * 1.9 + gP.x * 0.31 + gP.y * 0.23 + gSeed * 6.2831 ) * 0.2;
  vec2 gBend = uWindDir * ( 0.15 + gSw + gGust * 0.8 ) * gH * 0.6;
  vec3 gPos = vec3( gP.x, gY - 0.03, gP.y ) + lp + vec3( gBend.x, -dot( gBend, gBend ) * 0.3, gBend.y ) * gT * gT;
  objectNormal = vec3( 0.0, 1.0, 0.0 );
  int pi = int( fract( gSeed * 17.3 ) * 5.0 );
  vec3 petal = pi == 0 ? vec3( 0.9, 0.85, 0.95 ) : pi == 1 ? vec3( 1.0, 0.62, 0.08 ) : pi == 2 ? vec3( 0.45, 0.25, 1.0 ) : pi == 3 ? vec3( 0.18, 0.45, 1.0 ) : vec3( 1.0, 0.22, 0.28 );
  vec3 gCol = aKind < 0.5 ? mix( vec3( 0.05, 0.12, 0.03 ), vec3( 0.2, 0.42, 0.1 ), gT ) : aKind < 1.5 ? petal : vec3( 1.0, 0.8, 0.25 );
  vGrassCol = gCol;
  vGrassGlow = aKind > 0.5 ? petal * uGlow * ( 0.35 + 0.35 * sin( uTime * 1.3 + gSeed * 30.0 ) ) : vec3( 0.0 );
`;

function flowerMaterial(U: FantasyUniforms, patch: number, radius: number, win: TerrainWindows) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  mat.customProgramCacheKey = () => "fantasy-flower";
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uPatch: { value: patch },
      uRadius: { value: radius },
      uInner: { value: 0 },
      uHeight: { value: 0.75 },
      uWidth: { value: 1 },
      uTime: U.uTime,
      uGlow: U.uGlow,
      uWindDir: U.uWindDir,
      uGust: U.uGust,
      uFocus: U.uFocus,
      ...win.mask,
      ...win.height,
    });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nattribute float aKind;\n${GRASS_VERTEX_HEAD}`)
      .replace("#include <beginnormal_vertex>", `vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );\n${FLOWER_VERTEX_BODY}`)
      .replace("#include <begin_vertex>", "vec3 transformed = gPos;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGrassCol; varying vec3 vGrassGlow;")
      .replace("#include <color_fragment>", "diffuseColor.rgb *= vGrassCol;")
      .replace("#include <normal_fragment_begin>", "float faceDirection = 1.0; vec3 normal = normalize( vNormal ); vec3 nonPerturbedNormal = normal;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGrassGlow;");
  };
  return mat;
}

export interface GrassField {
  meshes: THREE.Mesh[];
  blades: number;
  dispose(): void;
}

export function buildGrassField(U: FantasyUniforms, win: TerrainWindows, opts: { lowQuality?: boolean; receiveShadow?: boolean }): GrassField {
  const meshes: THREE.Mesh[] = [];
  const disposables: { dispose(): void }[] = [];
  let blades = 0;
  grassLayers(!!opts.lowQuality).forEach((def, i) => {
    const geo = bladeGeometry(def, 101 + i * 7);
    const mat = grassMaterial(U, def, win);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = !!opts.receiveShadow && i === 0;
    mesh.castShadow = false;
    mesh.name = `fantasy-grass-${i}`;
    meshes.push(mesh);
    disposables.push(geo, mat);
    blades += def.count;
  });
  const fCount = opts.lowQuality ? 1400 : 4200;
  const fPatch = opts.lowQuality ? 56 : 76;
  const fGeo = flowerGeometry(fCount, 555);
  const fMat = flowerMaterial(U, fPatch, fPatch / 2, win);
  const flowers = new THREE.Mesh(fGeo, fMat);
  flowers.frustumCulled = false;
  flowers.name = "fantasy-flowers";
  meshes.push(flowers);
  disposables.push(fGeo, fMat);
  return {
    meshes,
    blades,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
