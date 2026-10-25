// The rainforest's birds, TRUE size: scarlet and blue-and-gold macaws (~0.85 m nose to tail) and
// green parrots flying from crown to crown, toucans sitting on the boughs with their huge beaks, little
// birds flitting through the shafts of sunlight, and a flock of parrots that bursts screeching out of
// a giant tree when the kid walks by beneath — circling over the canopy and settling back again.
//
// One instanced mesh: wings flap, tails fan and beaks are coloured in the vertex shader from
// per-instance colours. The flight logic is pure and allocation-free (stepJungleBirds).
import * as THREE from "three";
import { col, merge, part } from "../fantasy/geo";
import { rngOf } from "../fantasy/noise";
import { underCanopy } from "../../registry/jungle";
import { T_GIANT, U, type JunglePlan } from "./plan";

export const JB_MACAW = 0;
export const JB_PARROT = 1;
export const JB_TOUCAN = 2;
export const JB_SMALL = 3;

/** length nose to tail at the model's scale 1 is 1 unit; real lengths (m) */
const LEN_M = [0.85, 0.34, 0.55, 0.13];

export interface JBird {
  kind: number;
  /** 0 perched, 1 flying a hop, 2 flitting round a sunbeam, 3 flock: away circling */
  st: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  // the hop: from a to b over dur seconds, `arc` high
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  u: number;
  dur: number;
  arc: number;
  wait: number;
  /** home spot index (perch / sunbeam) */
  home: number;
  flock: boolean;
  seed: number;
  flap: number;
}

export interface JBirdWorld {
  plan: JunglePlan;
  birds: JBird[];
  /** sitting spots: crown tops and bough perches (x, y, z triples) */
  spots: Float32Array;
  flockTree: number;
  flockCool: number;
  flockAway: number;
  rnd: () => number;
}

export function planJungleBirds(plan: JunglePlan, opts: { lowQuality?: boolean; seed?: number } = {}): JBirdWorld {
  const low = !!opts.lowQuality;
  const r = rngOf(opts.seed ?? 5522);
  const spots: number[] = [];
  for (const t of plan.trees) {
    if (t.type > 1) continue;
    // a few on top of the crown (in the sun) and the bough perches below
    for (let k = 0; k < 3; k++) {
      const a = r() * Math.PI * 2;
      const d = t.crownR * (0.2 + r() * 0.5);
      spots.push(t.x + Math.sin(a) * d, t.y + t.crownY + t.crownR * 0.38, t.z + Math.cos(a) * d);
    }
  }
  for (const p of plan.perches) spots.push(p.x, p.y + 0.1, p.z);
  const nSpots = spots.length / 3;
  const birds: JBird[] = [];
  const make = (kind: number, home: number, flock = false) => {
    const x = spots[home * 3];
    const y = spots[home * 3 + 1];
    const z = spots[home * 3 + 2];
    birds.push({ kind, st: 0, x, y, z, yaw: r() * Math.PI * 2, ax: x, ay: y, az: z, bx: x, by: y, bz: z, u: 1, dur: 1, arc: 0, wait: r() * 8, home, flock, seed: r() * 100, flap: 0 });
  };
  if (!nSpots) return { plan, birds, spots: new Float32Array(spots), flockTree: -1, flockCool: 0, flockAway: 0, rnd: r };
  const pick = () => Math.floor(r() * nSpots);
  for (let i = 0; i < (low ? 3 : 6); i++) make(JB_MACAW, pick());
  for (let i = 0; i < (low ? 2 : 5); i++) make(JB_PARROT, pick());
  for (let i = 0; i < (low ? 2 : 4); i++) make(JB_TOUCAN, nSpots - 1 - Math.floor(r() * plan.perches.length));
  // little birds round the sunbeams
  plan.shafts.forEach((_s, si) => {
    if (si % (low ? 3 : 2)) return;
    for (let k = 0; k < 2; k++) {
      make(JB_SMALL, 0);
      const b = birds[birds.length - 1];
      b.st = 2;
      b.home = si;
    }
  });
  // the flock: in the giant tree nearest a trail
  let flockTree = -1;
  let bd = Infinity;
  plan.trees.forEach((t, i) => {
    if (t.type !== T_GIANT) return;
    let near = Infinity;
    for (const p of plan.lookouts) near = Math.min(near, Math.hypot(plan.perches[p].x - t.x, plan.perches[p].z - t.z));
    if (near < bd) ((bd = near), (flockTree = i));
  });
  if (flockTree >= 0) {
    const t = plan.trees[flockTree];
    for (let k = 0; k < (low ? 6 : 12); k++) {
      const a = (k / 12) * Math.PI * 2;
      const d = t.crownR * (0.3 + (k % 3) * 0.2);
      spots.push(t.x + Math.sin(a) * d, t.y + t.crownY + t.crownR * 0.36, t.z + Math.cos(a) * d);
      make(JB_PARROT, spots.length / 3 - 1, true);
    }
  }
  return { plan, birds, spots: new Float32Array(spots), flockTree, flockCool: 0, flockAway: 0, rnd: r };
}

function hop(W: JBirdWorld, b: JBird, tx: number, ty: number, tz: number, speed: number) {
  b.ax = b.x;
  b.ay = b.y;
  b.az = b.z;
  b.bx = tx;
  b.by = ty;
  b.bz = tz;
  const d = Math.hypot(tx - b.x, tz - b.z);
  b.u = 0;
  b.dur = Math.max(0.8, Math.hypot(d, ty - b.y) / speed);
  b.arc = Math.min(8, d * 0.12) + 1;
  b.st = 1;
  void W;
}

/** one step of the jungle's birds (allocation-free) */
export function stepJungleBirds(W: JBirdWorld, dt: number, t: number, kx: number, kz: number, kidUnder: boolean): void {
  const S = W.spots;
  const nS = S.length / 3;
  // the flock bursts out when the kid walks under its tree
  if (W.flockCool > 0) W.flockCool -= dt;
  if (W.flockTree >= 0 && W.flockAway <= 0 && W.flockCool <= 0 && kidUnder) {
    const ft = W.plan.trees[W.flockTree];
    if ((ft.x - kx) ** 2 + (ft.z - kz) ** 2 < (ft.crownR + 8) ** 2) {
      W.flockAway = 16;
      for (const b of W.birds)
        if (b.flock) {
          const a = W.rnd() * Math.PI * 2;
          hop(W, b, ft.x + Math.sin(a) * 26, ft.y + ft.crownY + 16 + W.rnd() * 10, ft.z + Math.cos(a) * 26, 13 + W.rnd() * 4);
          b.wait = 0;
        }
    }
  }
  if (W.flockAway > 0) {
    W.flockAway -= dt;
    if (W.flockAway <= 0) W.flockCool = 25;
  }
  for (const b of W.birds) {
    const sp = b.kind === JB_SMALL ? 5 : b.kind === JB_MACAW ? 9 : 10;
    if (b.st === 2) {
      // flitting round a sunbeam: quick darting loops through the light
      const s = W.plan.shafts[b.home];
      const ph = t * (1.3 + (b.seed % 1) * 0.6) + b.seed;
      const r = 1.6 + Math.sin(ph * 0.7) * 1.1;
      const nx = s.x + Math.sin(ph) * r + Math.sin(ph * 2.7) * 0.6;
      const nz = s.z + Math.cos(ph) * r;
      const ny = s.y + 4.5 + Math.sin(ph * 1.9 + b.seed) * 2.2 + 2.5;
      b.yaw = Math.atan2(nx - b.x, nz - b.z);
      b.x = nx;
      b.y = ny;
      b.z = nz;
      b.flap = 1;
      continue;
    }
    if (b.st === 1) {
      b.u = Math.min(1, b.u + dt / b.dur);
      const u = b.u;
      const e = u * u * (3 - 2 * u);
      const nx = b.ax + (b.bx - b.ax) * e;
      const nz = b.az + (b.bz - b.az) * e;
      const ny = b.ay + (b.by - b.ay) * e + Math.sin(Math.PI * u) * b.arc;
      if ((nx - b.x) ** 2 + (nz - b.z) ** 2 > 1e-6) b.yaw = Math.atan2(nx - b.x, nz - b.z);
      b.x = nx;
      b.y = ny;
      b.z = nz;
      // flap hard taking off and landing, glide in the middle
      b.flap = 0.35 + 0.65 * Math.max(1 - u * 3, u * 3 - 2, 0);
      if (u >= 1) {
        if (b.flock && W.flockAway > 0) {
          // circling high over the canopy until the fuss is over
          const ft = W.plan.trees[W.flockTree];
          const a = Math.atan2(b.x - ft.x, b.z - ft.z) + 0.9;
          hop(W, b, ft.x + Math.sin(a) * 24, ft.y + ft.crownY + 14 + W.rnd() * 8, ft.z + Math.cos(a) * 24, 12);
        } else if (b.flock && Math.hypot(b.x - S[b.home * 3], b.z - S[b.home * 3 + 2]) > 0.5) {
          hop(W, b, S[b.home * 3], S[b.home * 3 + 1], S[b.home * 3 + 2], 11);
        } else {
          b.st = 0;
          b.wait = b.kind === JB_TOUCAN ? 6 + W.rnd() * 10 : 3 + W.rnd() * 9;
        }
      }
      continue;
    }
    // perched: preen, look round, then off to another crown
    b.flap = 0;
    b.wait -= dt;
    if (b.wait <= 0 && !b.flock) {
      let k = Math.floor(W.rnd() * nS);
      // toucans hop between near boughs; parrots and macaws cross the forest
      if (b.kind === JB_TOUCAN) {
        let best = k;
        let bd = Infinity;
        for (let tries = 0; tries < 8; tries++) {
          const c = Math.floor(W.rnd() * nS);
          const d = Math.hypot(S[c * 3] - b.x, S[c * 3 + 2] - b.z);
          if (d > 3 && d < bd) ((bd = d), (best = c));
        }
        k = best;
      }
      hop(W, b, S[k * 3], S[k * 3 + 1], S[k * 3 + 2], sp);
    } else b.yaw += Math.sin(t * 0.9 + b.seed) * dt * 0.8;
  }
}

// ── the model: 1 unit nose to tail; parts tagged for the shader ──
export function buildBirdGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tag = (g: THREE.BufferGeometry, id: number) => {
    const p = part(g, col("#ffffff"), [0, 0, 0], { faceted: true });
    p.setAttribute("aPart", new THREE.BufferAttribute(new Float32Array(p.attributes.position.count).fill(id), 1));
    return p;
  };
  const body = new THREE.IcosahedronGeometry(1, 0);
  body.scale(0.11, 0.1, 0.24);
  body.translate(0, 0, 0.08);
  parts.push(tag(body, 0));
  const head = new THREE.IcosahedronGeometry(1, 0);
  head.scale(0.08, 0.08, 0.08);
  head.translate(0, 0.07, 0.3);
  parts.push(tag(head, 0));
  // beak (a toucan's grows huge in the shader)
  const beak = new THREE.ConeGeometry(0.035, 0.1, 4);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.055, 0.42);
  parts.push(tag(beak, 4));
  // wings: flat triangles out to the sides from the shoulders
  for (const s of [-1, 1]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([s * 0.06, 0.03, 0.2, s * 0.06, 0.03, -0.05, s * 0.42, 0.02, 0.02, s * 0.06, 0.03, -0.05, s * 0.3, 0.015, -0.14, s * 0.42, 0.02, 0.02], 3));
    parts.push(tag(g, s < 0 ? 1 : 2));
  }
  // the tail: long and tapering (a macaw's streamer)
  const tail = new THREE.BufferGeometry();
  tail.setAttribute("position", new THREE.Float32BufferAttribute([-0.05, 0.02, -0.1, 0.05, 0.02, -0.1, 0, 0.0, -0.62, 0.05, 0.02, -0.1, -0.05, 0.02, -0.1, 0, 0.04, -0.62], 3));
  parts.push(tag(tail, 3));
  return merge(parts);
}

const BIRD_GLSL = /* glsl */ `
  attribute float aPart;
  attribute vec4 aFly; // flap 0..1, phase, beak size, tail size
  attribute vec3 aC1; attribute vec3 aC2; attribute vec3 aC3;
  varying vec3 vBirdCol;
  vec3 birdPose( vec3 p ) {
    float flap = aFly.x;
    float a = ( sin( aFly.y * 15.0 ) * 0.9 * flap + ( 1.0 - flap ) * 0.12 );
    if ( aPart > 0.5 && aPart < 2.5 ) {
      float sd = aPart < 1.5 ? -1.0 : 1.0;
      // fold the wing in a little when perched
      float fold = 1.0 - step( 0.01, flap ) * 0.0;
      float ang = a * sd;
      float c = cos( ang ), s = sin( ang );
      vec3 o = vec3( sd * 0.06, 0.03, 0.0 );
      vec3 q = p - o;
      q = vec3( c * q.x - s * q.y, s * q.x + c * q.y, q.z );
      // perched: wings tucked along the body
      q.x *= mix( 0.35, 1.0, step( 0.01, flap ) );
      p = o + q * fold;
    } else if ( aPart > 3.5 ) {
      p.z = 0.37 + ( p.z - 0.37 ) * aFly.z;
      p.y = 0.055 + ( p.y - 0.055 ) * mix( 1.0, aFly.z * 0.8, step( 1.5, aFly.z ) );
      p.x *= mix( 1.0, aFly.z * 0.7, step( 1.5, aFly.z ) );
    } else if ( aPart > 2.5 ) {
      p.z = -0.1 + ( p.z + 0.1 ) * aFly.w;
    }
    vBirdCol = aPart > 3.5 ? aC3 : aPart > 2.5 ? aC2 : aPart > 0.5 ? aC2 : aC1;
    return p;
  }
`;

export interface JungleBirds {
  count: number;
  tris: number;
  world: JBirdWorld;
  update(dt: number, t: number, kid: THREE.Vector3, glow: number): void;
  dispose(): void;
}

const LOOKS: Record<number, { c1: string; c2: string; c3: string; beak: number; tail: number }[]> = {
  [JB_MACAW]: [
    { c1: "#e8302a", c2: "#2a6ad8", c3: "#f2ead8", beak: 1.3, tail: 1.3 },
    { c1: "#f2c02a", c2: "#2a8ae0", c3: "#3a3a3a", beak: 1.3, tail: 1.3 },
  ],
  [JB_PARROT]: [
    { c1: "#4cc23a", c2: "#2f9a3a", c3: "#f0b030", beak: 1, tail: 0.75 },
    { c1: "#7ad84a", c2: "#3aa0d0", c3: "#e86a30", beak: 1, tail: 0.75 },
  ],
  [JB_TOUCAN]: [{ c1: "#1e1e24", c2: "#1e1e24", c3: "#ff9a1e", beak: 3.2, tail: 0.55 }],
  [JB_SMALL]: [
    { c1: "#ffd23a", c2: "#3a7ae0", c3: "#3a3a3a", beak: 0.8, tail: 0.6 },
    { c1: "#ff6a8a", c2: "#8a4ad8", c3: "#3a3a3a", beak: 0.8, tail: 0.6 },
    { c1: "#4ae0d0", c2: "#2a6a5a", c3: "#3a3a3a", beak: 0.8, tail: 0.6 },
  ],
};

export function buildJungleBirds(parent: THREE.Object3D, plan: JunglePlan, opts: { lowQuality?: boolean } = {}): JungleBirds {
  const W = planJungleBirds(plan, opts);
  const n = W.birds.length;
  const geo = buildBirdGeometry();
  const fly = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 4), 4);
  fly.setUsage(THREE.DynamicDrawUsage);
  const c1 = new Float32Array(Math.max(1, n) * 3);
  const c2 = new Float32Array(Math.max(1, n) * 3);
  const c3 = new Float32Array(Math.max(1, n) * 3);
  const c = new THREE.Color();
  W.birds.forEach((b, i) => {
    const L = LOOKS[b.kind][i % LOOKS[b.kind].length];
    c.set(L.c1).toArray(c1, i * 3);
    c.set(L.c2).toArray(c2, i * 3);
    c.set(L.c3).toArray(c3, i * 3);
    fly.setXYZW(i, 0, 0, L.beak, L.tail);
  });
  geo.setAttribute("aFly", fly);
  geo.setAttribute("aC1", new THREE.InstancedBufferAttribute(c1, 3));
  geo.setAttribute("aC2", new THREE.InstancedBufferAttribute(c2, 3));
  geo.setAttribute("aC3", new THREE.InstancedBufferAttribute(c3, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${BIRD_GLSL}`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = birdPose( transformed );\nvColor.rgb = vBirdCol;");
  };
  mat.customProgramCacheKey = () => "jungle-birds";
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  im.count = n;
  im.name = "jungle-birds";
  im.frustumCulled = false;
  parent.add(im);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  return {
    count: n,
    tris: (geo.attributes.position.count / 3) * n,
    world: W,
    update(dt, t, kid) {
      stepJungleBirds(W, Math.min(dt, 0.1), t, kid.x, kid.z, underCanopy(kid.x, kid.z));
      for (let i = 0; i < n; i++) {
        const b = W.birds[i];
        const bank = b.st === 1 ? Math.sin(t * 1.3 + b.seed) * 0.25 : 0;
        e.set(b.st === 0 ? -0.35 : 0, b.yaw, bank, "YXZ");
        m4.compose(v.set(b.x, b.y, b.z), q.setFromEuler(e), s3.setScalar(LEN_M[b.kind] * U));
        im.setMatrixAt(i, m4);
        fly.setX(i, b.flap);
        fly.setY(i, t + b.seed);
      }
      im.instanceMatrix.needsUpdate = true;
      fly.needsUpdate = true;
    },
    dispose() {
      parent.remove(im);
      geo.dispose();
      mat.dispose();
      im.dispose();
    },
  };
}
