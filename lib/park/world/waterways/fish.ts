// Fish in Rainbow Lake and the lower river, TRUE size: koi and carp (~0.6 m: orange, white and
// gold, cruising slowly round the jetty and the ducks' bay), shoals of striped perch (~0.25 m)
// that wheel and dart together, and speckled trout (~0.4 m) holding their place against the
// river's current — and now and then one leaps clean out of the water with a splash.
//
// The swimming is pure, deterministic and allocation-free (stepFish, tested: every fish stays in
// the water). One instanced mesh: the tail beats and the body flexes in the vertex shader, the koi
// patches / perch stripes / trout speckles are painted in the fragment shader.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WATER_Y } from "../../registry/terrain";
import { DUCK_BAY, JETTY, LAKE, RIVER_LENGTH, flowAt, riverPointAt, waterDepthAt, waterSdf } from "../../registry/waterways";
import { rngOf } from "../fantasy/noise";
import { MAX_SPLASH } from "./water";
import { WILD_LAKE, WILD_LAKE_OUTLINE, WILD_OUTLET_POINTS, WILD_RIVER_POINTS } from "../../registry/wildWater";

export const F_KOI = 0;
export const F_PERCH = 1;
export const F_TROUT = 2;
const LEN_M = [0.6, 0.25, 0.4];
export const U = 1.6;

export interface Fish {
  kind: number;
  shoal: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  speed: number;
  ox: number;
  oz: number;
  dart: number;
  /** a leap in progress: 0..1 (-1 = not jumping) */
  jump: number;
  jx: number;
  jz: number;
  /** a trout's lie in the river (where it holds against the current) */
  hx: number;
  hz: number;
  seed: number;
  s: number;
}
export interface Shoal {
  x: number;
  z: number;
  tx: number;
  tz: number;
  depth: number;
  kind: number;
  /** stays near here (koi round the jetty / the bay; perch roam the whole lake) */
  homeX: number;
  homeZ: number;
  homeR: number;
}
export interface FishWorld {
  fish: Fish[];
  shoals: Shoal[];
  /** splashes (x, z, time, strength) for the water shader, a ring of MAX_SPLASH */
  splash: Float32Array;
  nextSplash: number;
  jumpT: number;
  rnd: () => number;
}

/** deep enough for a fish here (a little margin off the bed and the bank) */
export const fishOk = (x: number, z: number) => waterSdf(x, z) < -0.9 && waterDepthAt(x, z) > 0.75;

/** a deep-enough spot in the water near (cx, cz), written into `out` (allocation-free) */
function lakePoint(r: () => number, cx: number, cz: number, R: number, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  for (let k = 0; k < 40; k++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * R;
    const x = cx + Math.sin(a) * d;
    const z = cz + Math.cos(a) * d;
    if (fishOk(x, z) && waterDepthAt(x, z) > 1.2) {
      out.x = x;
      out.z = z;
      return out;
    }
  }
  // (nowhere deep enough round there: its middle)
  out.x = cx;
  out.z = cz;
  return out;
}
const PICK = { x: 0, z: 0 };

/** `wild`: the Wildlands' Great Lake, Wild River and outlet instead of the park's water */
export function planFish(opts: { lowQuality?: boolean; seed?: number; wild?: boolean } = {}): FishWorld {
  const low = !!opts.lowQuality;
  const r = rngOf(opts.seed ?? 6611);
  const shoals: Shoal[] = [];
  const fish: Fish[] = [];
  const addShoal = (kind: number, hx: number, hz: number, hr: number, n: number, depth: number) => {
    const p = lakePoint(r, hx, hz, hr);
    const si = shoals.length;
    shoals.push({ x: p.x, z: p.z, tx: p.x, tz: p.z, depth, kind, homeX: hx, homeZ: hz, homeR: hr });
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = kind === F_PERCH ? 0.6 + r() * 1.6 : 1 + r() * 2.5;
      fish.push({ kind, shoal: si, x: p.x + Math.sin(a) * d * 0.5, y: WATER_Y - depth, z: p.z + Math.cos(a) * d * 0.5, yaw: r() * Math.PI * 2, pitch: 0, speed: 0.5, ox: Math.sin(a) * d, oz: Math.cos(a) * d, dart: r() * 5, jump: -1, jx: 0, jz: 0, hx: 0, hz: 0, seed: r() * 100, s: 0.85 + r() * 0.3 });
    }
  };
  if (opts.wild) {
    // the Great Lake: koi in the warm shallows round the shore, big perch shoals over the deep
    // middle; trout holding in the Wild River and the outlet
    for (let k = 0; k < (low ? 3 : 6); k++) {
      const [sx, sz] = WILD_LAKE_OUTLINE[Math.floor((k / 6) * WILD_LAKE_OUTLINE.length)];
      addShoal(F_KOI, sx + (WILD_LAKE.x - sx) * 0.08, sz + (WILD_LAKE.z - sz) * 0.08, 12, low ? 3 : 5, 0.9);
    }
    for (let k = 0; k < (low ? 2 : 4); k++) addShoal(F_PERCH, WILD_LAKE.x + Math.sin(k * 1.9) * 70, WILD_LAKE.z + Math.cos(k * 1.9) * 70, 40, low ? 6 : 10, 2.2);
    for (const [pts, n] of [
      [WILD_RIVER_POINTS, low ? 4 : 8],
      [WILD_OUTLET_POINTS, low ? 3 : 6],
    ] as const)
      for (let i = 0; i < n; i++) {
        const [x, z] = pts[Math.floor(((i + 0.5) / n) * (pts.length - 1))];
        if (!fishOk(x, z)) continue;
        fish.push({ kind: F_TROUT, shoal: -1, x, y: WATER_Y - 1.1, z, yaw: 0, pitch: 0, speed: 0, ox: 0, oz: 0, dart: r() * 6, jump: -1, jx: 0, jz: 0, hx: x, hz: z, seed: r() * 100, s: 0.85 + r() * 0.3 });
      }
    return { fish, shoals, splash: new Float32Array(MAX_SPLASH * 4).fill(-100), nextSplash: 0, jumpT: 6, rnd: r };
  }
  // koi round the jetty (where kids look down) and in the ducks' bay
  addShoal(F_KOI, JETTY.bx, JETTY.bz, 9, low ? 3 : 5, 0.9);
  addShoal(F_KOI, DUCK_BAY.x, DUCK_BAY.z, 8, low ? 2 : 4, 0.9);
  // perch shoals out over the deeper water
  addShoal(F_PERCH, LAKE.x - 12, LAKE.z + 4, 22, low ? 6 : 10, 1.6);
  addShoal(F_PERCH, LAKE.x + 14, LAKE.z + 6, 18, low ? 5 : 8, 1.4);
  // trout holding in the lower river and the river mouth
  for (let i = 0; i < (low ? 3 : 6); i++) {
    const s = RIVER_LENGTH * (0.62 + (i / 6) * 0.34);
    const [x, z] = riverPointAt(s);
    if (!fishOk(x, z)) continue;
    fish.push({ kind: F_TROUT, shoal: -1, x, y: WATER_Y - 1.1, z, yaw: 0, pitch: 0, speed: 0, ox: 0, oz: 0, dart: r() * 6, jump: -1, jx: 0, jz: 0, hx: x, hz: z, seed: r() * 100, s: 0.85 + r() * 0.3 });
  }
  return { fish, shoals, splash: new Float32Array(MAX_SPLASH * 4).fill(-100), nextSplash: 0, jumpT: 6, rnd: r };
}

const wrap = (a: number) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;
const F = { x: 0, z: 0 };

export function addSplash(W: FishWorld, x: number, z: number, t: number, k: number) {
  const i = W.nextSplash;
  W.splash[i * 4] = x;
  W.splash[i * 4 + 1] = z;
  W.splash[i * 4 + 2] = t;
  W.splash[i * 4 + 3] = k;
  W.nextSplash = (i + 1) % MAX_SPLASH;
}

/** one step (allocation-free); `kx, kz` = the kid (fish scatter from a swimmer) */
export function stepFish(W: FishWorld, dt: number, t: number, kx: number, kz: number, kidSwimming: boolean): void {
  const r = W.rnd;
  // shoal centres wander inside their home water
  for (const s of W.shoals) {
    const dx = s.tx - s.x;
    const dz = s.tz - s.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.5) {
      const p = lakePoint(r, s.homeX, s.homeZ, s.homeR, PICK);
      s.tx = p.x;
      s.tz = p.z;
    } else {
      const sp = (s.kind === F_KOI ? 0.45 : 0.9) * dt;
      const nx = s.x + (dx / d) * sp;
      const nz = s.z + (dz / d) * sp;
      if (fishOk(nx, nz)) {
        s.x = nx;
        s.z = nz;
      } else {
        s.tx = s.x;
        s.tz = s.z;
      }
    }
  }
  // a leap, every so often
  W.jumpT -= dt;
  if (W.jumpT <= 0) {
    W.jumpT = 7 + r() * 9;
    const f = W.fish[Math.floor(r() * W.fish.length)];
    if (f && f.kind !== F_PERCH && f.jump < 0) {
      f.jump = 0;
      f.jx = f.x;
      f.jz = f.z;
      addSplash(W, f.x, f.z, t, 0.8);
    }
  }
  for (const f of W.fish) {
    if (f.jump >= 0) {
      // out of the water in an arc and back in nose first
      f.jump += dt / 1.25;
      const u = Math.min(1, f.jump);
      const reach = 2.6 * f.s;
      const nx = f.jx + Math.sin(f.yaw) * reach * u;
      const nz = f.jz + Math.cos(f.yaw) * reach * u;
      if (fishOk(nx, nz)) {
        f.x = nx;
        f.z = nz;
      }
      f.y = WATER_Y - 0.4 + Math.sin(u * Math.PI) * (1.6 * f.s);
      f.pitch = -Math.cos(u * Math.PI) * 0.9;
      if (u >= 1) {
        f.jump = -1;
        f.pitch = 0;
        f.y = WATER_Y - 0.6;
        addSplash(W, f.x, f.z, t, 1);
      }
      continue;
    }
    let tx: number;
    let tz: number;
    let want: number;
    if (f.kind === F_TROUT) {
      // hold the lie, nose into the current, sidling a little
      flowAt(f.x, f.z, F);
      const up = Math.atan2(-F.x, -F.z);
      tx = f.hx + Math.sin(t * 0.3 + f.seed) * 1.2;
      tz = f.hz + Math.cos(t * 0.23 + f.seed) * 1.2;
      want = Math.hypot(F.x, F.z) > 0.2 ? up : Math.atan2(tx - f.x, tz - f.z);
      const d = Math.hypot(tx - f.x, tz - f.z);
      f.speed += ((d > 0.5 ? 0.8 : 0.2) - f.speed) * Math.min(1, dt * 2);
      // (it swims upstream as fast as the water comes down, so it moves toward its lie)
      const vx = (tx - f.x) * 0.5;
      const vz = (tz - f.z) * 0.5;
      const nx = f.x + vx * dt;
      const nz = f.z + vz * dt;
      if (fishOk(nx, nz)) {
        f.x = nx;
        f.z = nz;
      }
    } else {
      const s = W.shoals[f.shoal];
      // a perch shoal wheels together; koi drift in loose, lazy circles
      const swirl = f.kind === F_PERCH ? t * 0.6 : t * 0.15;
      const ca = Math.cos(swirl);
      const sa = Math.sin(swirl);
      tx = s.x + f.ox * ca - f.oz * sa;
      tz = s.z + f.ox * sa + f.oz * ca;
      // scatter from a kid swimming close
      if (kidSwimming) {
        const kd = Math.hypot(f.x - kx, f.z - kz);
        if (kd < 5) {
          tx = f.x + ((f.x - kx) / (kd || 1)) * 4;
          tz = f.z + ((f.z - kz) / (kd || 1)) * 4;
          f.dart = 0;
        }
      }
      f.dart -= dt;
      let base = f.kind === F_KOI ? 0.55 : 1.3;
      if (f.dart <= 0) {
        // a sudden dart
        if (f.dart < -0.5) f.dart = 3 + r() * 6;
        base *= 3.2;
      }
      const dx = tx - f.x;
      const dz = tz - f.z;
      const d = Math.hypot(dx, dz);
      want = d > 0.05 ? Math.atan2(dx, dz) : f.yaw;
      f.speed += (Math.min(base * (0.4 + Math.min(1, d / 1.5)), base) - f.speed) * Math.min(1, dt * 3);
    }
    // turn (quicker for the little ones), then swim on if the water ahead is deep enough
    const turn = f.kind === F_PERCH ? 4 : f.kind === F_TROUT ? 2 : 1.4;
    const dy = wrap(want - f.yaw);
    f.yaw = wrap(f.yaw + Math.max(-turn * dt, Math.min(turn * dt, dy)));
    if (f.kind !== F_TROUT) {
      const nx = f.x + Math.sin(f.yaw) * f.speed * dt;
      const nz = f.z + Math.cos(f.yaw) * f.speed * dt;
      if (fishOk(nx, nz)) {
        f.x = nx;
        f.z = nz;
      } else {
        // the bank: turn away toward the middle of the lake
        f.yaw = wrap(f.yaw + Math.PI * 0.5 * dt * 3);
        f.speed *= 0.5;
      }
    }
    // swim at the shoal's depth, never on the bed nor breaking the surface
    const dep = waterDepthAt(f.x, f.z);
    const want_y = WATER_Y - Math.min(dep - 0.35, (f.shoal >= 0 ? W.shoals[f.shoal].depth : 1.1) + Math.sin(t * 0.4 + f.seed) * 0.25);
    f.y += (Math.min(WATER_Y - 0.3, Math.max(WATER_Y - dep + 0.3, want_y)) - f.y) * Math.min(1, dt * 1.5);
    // (and never through the bed as it swims into the shallows)
    f.y = Math.min(WATER_Y - 0.25, Math.max(WATER_Y - dep + 0.25, f.y));
    f.pitch += (0 - f.pitch) * Math.min(1, dt * 3);
  }
}

// ── the model: 1 unit nose to tail ──
export function buildFishGeometry(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(1, 10, 6);
  body.scale(0.16, 0.2, 0.5);
  body.translate(0, 0, 0.08);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.36, 0, 0.2, -0.56, 0, -0.2, -0.56, 0, 0, -0.36, 0, 0.06, -0.48, 0, -0.06, -0.48], 3));
  tail.setIndex([0, 1, 2]);
  const dorsal = new THREE.BufferGeometry();
  dorsal.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.18, 0.2, 0, 0.3, -0.05, 0, 0.16, -0.15], 3));
  dorsal.setIndex([0, 1, 2]);
  const pecs = new THREE.BufferGeometry();
  pecs.setAttribute("position", new THREE.Float32BufferAttribute([0.12, -0.06, 0.25, 0.28, -0.12, 0.12, 0.12, -0.08, 0.12, -0.12, -0.06, 0.25, -0.12, -0.08, 0.12, -0.28, -0.12, 0.12], 3));
  pecs.setIndex([0, 1, 2, 3, 4, 5]);
  const parts = [body, tail, dorsal, pecs].map((g, i) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.deleteAttribute("uv");
    ng.deleteAttribute("normal");
    ng.computeVertexNormals();
    ng.setAttribute("aPart", new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count).fill(i === 1 ? 1 : i === 0 ? 0 : 2), 1));
    return ng;
  });
  return mergeGeometries(parts)!;
}

const FISH_GLSL = /* glsl */ `
  attribute float aPart;
  attribute vec4 aSwim; // phase, beat speed, pattern, unused
  attribute vec3 aC1; attribute vec3 aC2;
  varying vec3 vLoc; varying float vPat; varying vec3 vC1; varying vec3 vC2;
  vec3 fishPose( vec3 p ) {
    float ph = aSwim.x;
    float beat = aSwim.y;
    // the body flexes in an S, the tail beats hardest
    float k = clamp( ( 0.2 - p.z ) / 0.8, 0.0, 1.0 );
    p.x += sin( ph * beat - p.z * 4.0 ) * 0.07 * k * k * ( 1.0 + step( 0.5, aPart ) * 1.6 );
    return p;
  }
`;

const LOOKS = [
  [
    ["#ff7a1e", "#fff6ea"],
    ["#fff4e8", "#f04a1e"],
    ["#f2b81e", "#fff0c0"],
    ["#e8321e", "#2a2a2a"],
  ],
  [["#b8c83a", "#3a4a2a"]],
  [["#9ab0b8", "#3a4a3e"]],
];

export interface LakeFish {
  world: FishWorld;
  mesh: THREE.InstancedMesh;
  tris: number;
  update(dt: number, t: number, kid: THREE.Vector3, swimming: boolean): void;
  dispose(): void;
}

export function buildLakeFish(opts: { lowQuality?: boolean; wild?: boolean } = {}): LakeFish {
  const W = planFish(opts);
  const n = W.fish.length;
  const geo = buildFishGeometry();
  const swim = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 4), 4);
  swim.setUsage(THREE.DynamicDrawUsage);
  const c1 = new Float32Array(Math.max(1, n) * 3);
  const c2 = new Float32Array(Math.max(1, n) * 3);
  const c = new THREE.Color();
  W.fish.forEach((f, i) => {
    const L = LOOKS[f.kind][i % LOOKS[f.kind].length];
    c.set(L[0]).toArray(c1, i * 3);
    c.set(L[1]).toArray(c2, i * 3);
    swim.setXYZW(i, f.seed, f.kind === F_PERCH ? 14 : 9, f.kind, 0);
  });
  geo.setAttribute("aSwim", swim);
  geo.setAttribute("aC1", new THREE.InstancedBufferAttribute(c1, 3));
  geo.setAttribute("aC2", new THREE.InstancedBufferAttribute(c2, 3));
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${FISH_GLSL}`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLoc = transformed; vPat = aSwim.z; vC1 = aC1; vC2 = aC2;\ntransformed = fishPose( transformed );");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLoc; varying float vPat; varying vec3 vC1; varying vec3 vC2;\nfloat fh( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          vec3 c = vC1;
          if ( vPat < 0.5 ) {
            // koi: big blotches of the second colour
            float b = sin( vLoc.z * 9.0 + vC1.r * 7.0 ) * sin( vLoc.x * 13.0 + vLoc.y * 7.0 + vC1.g * 5.0 );
            c = mix( vC1, vC2, smoothstep( 0.15, 0.3, b ) );
          } else if ( vPat < 1.5 ) {
            // perch: dark bars down its sides, an orange-tinged belly
            c = mix( vC1, vC2, smoothstep( 0.55, 0.75, sin( vLoc.z * 34.0 ) ) * step( -0.05, vLoc.y ) );
            c = mix( c, vec3( 0.95, 0.75, 0.4 ), smoothstep( -0.05, -0.15, vLoc.y ) );
          } else {
            // trout: silver with dark speckles and a pink stripe
            c = mix( vC1, vC2, step( 0.86, fh( floor( vLoc * 40.0 ) ) ) * step( -0.02, vLoc.y ) );
            c = mix( c, vec3( 0.95, 0.55, 0.6 ), ( 1.0 - smoothstep( 0.0, 0.04, abs( vLoc.y - 0.0 ) ) ) * 0.6 );
          }
          // a pale belly
          c = mix( c, vec3( 0.97, 0.95, 0.9 ), smoothstep( -0.08, -0.18, vLoc.y ) * 0.6 );
          diffuseColor.rgb = c;
        }`,
      );
  };
  mat.customProgramCacheKey = () => "lake-fish";
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  im.name = "lake-fish";
  im.count = n;
  im.frustumCulled = false;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  return {
    world: W,
    mesh: im,
    tris: (geo.attributes.position.count / 3) * n,
    update(dt, t, kid, swimming) {
      stepFish(W, Math.min(dt, 0.1), t, kid.x, kid.z, swimming);
      for (let i = 0; i < n; i++) {
        const f = W.fish[i];
        e.set(f.pitch, f.yaw, 0, "YXZ");
        m4.compose(v.set(f.x, f.y, f.z), q.setFromEuler(e), s3.setScalar(LEN_M[f.kind] * U * f.s));
        im.setMatrixAt(i, m4);
        swim.setX(i, t * (0.6 + f.speed * 0.8) + f.seed);
      }
      im.instanceMatrix.needsUpdate = true;
      swim.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      im.dispose();
    },
  };
}
