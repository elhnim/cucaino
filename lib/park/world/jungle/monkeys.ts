// Monkeys in the rainforest canopy, TRUE size (~0.55 m body, a long tail): troops that run along
// the boughs, swing hand over hand and leap from tree to tree, sit and groom each other, chatter —
// and when a kid walks the jungle trail below they come along through the trees, and one or two
// drop down to hang by their tails and peek at the kid.
//
// The troop brain is pure, deterministic and allocation-free (stepMonkeys, tested: monkeys never
// leave the trees). One instanced mesh; arms, legs, tail and head are posed in the vertex shader.
import * as THREE from "three";
import { groundY } from "../../registry/terrain";
import { underCanopy } from "../../registry/jungle";
import { col, merge, part, taperTube } from "../fantasy/geo";
import { rngOf } from "../fantasy/noise";
import type { JunglePlan } from "./plan";
import { addJungleCut, type JungleCut } from "./cutaway";

export const M_SIT = 0;
export const M_RUN = 1;
export const M_SWING = 2;
export const M_LEAP = 3;
export const M_PEEK = 4;

export interface Monkey {
  troop: number;
  from: number;
  to: number;
  u: number;
  dur: number;
  mode: number;
  wait: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** how far down a peeking monkey hangs (0..1) */
  drop: number;
  /** seconds it's been tagging along after the kid */
  follow: number;
  cool: number;
  chatter: number;
  seed: number;
  scale: number;
}

export interface MonkeyWorld {
  plan: JunglePlan;
  monkeys: Monkey[];
  /** scratch */
  rnd: () => number;
}

/** troops of 4-5, each starting round its own tree */
export function planMonkeys(plan: JunglePlan, opts: { lowQuality?: boolean; seed?: number } = {}): MonkeyWorld {
  const r = rngOf(opts.seed ?? 4411);
  const monkeys: Monkey[] = [];
  const troops = opts.lowQuality ? 2 : 3;
  // troop homes: perches spread over the jungle, near the trails
  const homes: number[] = [];
  const pool = plan.lookouts.length ? plan.lookouts : plan.perches.map((_, i) => i);
  for (let tries = 0; tries < 400 && homes.length < troops; tries++) {
    const p = pool[Math.floor(r() * pool.length)];
    if (homes.some((h) => Math.hypot(plan.perches[h].x - plan.perches[p].x, plan.perches[h].z - plan.perches[p].z) < 40)) continue;
    homes.push(p);
  }
  homes.forEach((h, ti) => {
    const n = 4 + (ti % 2);
    // the home perch's tree and its neighbours
    const near: number[] = [h];
    for (let k = plan.linkStart[h]; k < plan.linkStart[h + 1]; k++) near.push(plan.links[k]);
    for (let i = 0; i < n; i++) {
      const p = near[i % near.length];
      const P = plan.perches[p];
      monkeys.push({ troop: ti, from: p, to: p, u: 1, dur: 1, mode: M_SIT, wait: 1 + r() * 6, x: P.x, y: P.y, z: P.z, yaw: r() * Math.PI * 2, drop: 0, follow: 0, cool: 0, chatter: 0, seed: r() * 1000, scale: i === n - 1 ? 0.62 : 0.9 + r() * 0.2 });
    }
  });
  return { plan, monkeys, rnd: r };
}

const MAX_SWING = 6.5;
/** the model is ~0.94 tall sitting at scale 1: x this = a real ~0.65 m sitting monkey (0.55 m body) */
export const MONKEY_K = 1.6 * 0.66;

/** where a perch is */
const px = (W: MonkeyWorld, i: number) => W.plan.perches[i].x;
const pz = (W: MonkeyWorld, i: number) => W.plan.perches[i].z;
const py = (W: MonkeyWorld, i: number) => W.plan.perches[i].y;

function pickNext(W: MonkeyWorld, m: Monkey, kx: number, kz: number, chase: boolean): number {
  const { linkStart, links } = W.plan;
  const a = m.to;
  const n = linkStart[a + 1] - linkStart[a];
  if (n <= 0) return a;
  if (chase) {
    // the neighbour that gets closest to the kid (a little randomness so they spread out)
    let best = a;
    let bd = (px(W, a) - kx) ** 2 + (pz(W, a) - kz) ** 2;
    for (let k = linkStart[a]; k < linkStart[a + 1]; k++) {
      const b = links[k];
      const d = (px(W, b) - kx) ** 2 + (pz(W, b) - kz) ** 2 + W.rnd() * 30;
      if (d < bd) ((bd = d), (best = b));
    }
    return best;
  }
  // wander: mostly within the tree, now and then over to the next one (the troop keeps together)
  return links[linkStart[a] + Math.floor(W.rnd() * n)];
}

/**
 * One step of the troops. `kid` = the kid's position; `kidUnder` = walking under the canopy.
 * Monkeys only ever stand on perches, travel along the links between them, or hang below a
 * perch peeking (never lower than ~4.5 m above the ground). Allocation-free.
 */
export function stepMonkeys(W: MonkeyWorld, dt: number, t: number, kx: number, ky: number, kz: number, kidUnder: boolean): void {
  for (const m of W.monkeys) {
    const near = kidUnder && (m.x - kx) ** 2 + (m.z - kz) ** 2 < 34 * 34;
    if (m.cool > 0) m.cool -= dt;
    m.chatter = Math.max(0, m.chatter - dt * 0.6);
    if (m.mode === M_SIT || m.mode === M_PEEK) {
      m.wait -= dt;
      // a peek: hang down by the tail toward the kid, then climb back up
      if (m.mode === M_PEEK) {
        const want = m.wait > 1.8 ? 1 : 0;
        m.drop += (want - m.drop) * Math.min(1, dt * 1.6);
        m.yaw = Math.atan2(kx - m.x, kz - m.z);
        m.chatter = Math.max(m.chatter, 0.6);
      } else {
        m.drop = Math.max(0, m.drop - dt * 2);
        if (near) m.yaw += (Math.atan2(kx - m.x, kz - m.z) - m.yaw) * 0;
      }
      const P = W.plan.perches[m.to];
      m.x = P.x;
      m.z = P.z;
      const g = groundY(P.x, P.z);
      const lowest = g + 7.2;
      const hang = Math.max(0, Math.min(P.y - lowest, 9)) * m.drop;
      m.y = P.y - hang;
      if (m.wait <= 0) {
        if (m.mode === M_PEEK) m.mode = M_SIT;
        const chase = near && m.follow < 45 && m.cool <= 0;
        if (chase) m.follow += 1;
        else if (!near) m.follow = Math.max(0, m.follow - 2);
        if (m.follow >= 45) m.cool = 30;
        // close above the kid, at a lookout? sometimes drop down to peek
        const dk = Math.hypot(m.x - kx, m.z - kz);
        if (near && dk < 13 && W.rnd() < 0.35 && m.scale > 0.7) {
          m.mode = M_PEEK;
          m.wait = 5 + W.rnd() * 3;
          m.chatter = 1;
          continue;
        }
        const next = pickNext(W, m, kx, kz, chase);
        if (next === m.to) {
          m.wait = 1 + W.rnd() * 3;
          continue;
        }
        const d = Math.hypot(px(W, next) - m.x, pz(W, next) - m.z);
        const sameTree = W.plan.perches[next].tree === W.plan.perches[m.to].tree;
        m.from = m.to;
        m.to = next;
        m.u = 0;
        m.mode = sameTree ? M_RUN : d > 4 ? M_SWING : M_LEAP;
        m.dur = Math.max(0.6, d / (sameTree ? 3.4 : d > 4 ? 5.2 : 4.6)) * (chase ? 0.8 : 1);
        m.yaw = Math.atan2(px(W, next) - m.x, pz(W, next) - m.z);
        if (W.rnd() < 0.25) m.chatter = 1;
      }
      continue;
    }
    // travelling along a link
    m.u = Math.min(1, m.u + dt / m.dur);
    const u = m.u;
    const ax = px(W, m.from);
    const az = pz(W, m.from);
    const ay = py(W, m.from);
    const bx = px(W, m.to);
    const bz = pz(W, m.to);
    const by = py(W, m.to);
    const e = u * u * (3 - 2 * u);
    m.x = ax + (bx - ax) * e;
    m.z = az + (bz - az) * e;
    const d = Math.hypot(bx - ax, bz - az);
    const base = ay + (by - ay) * e;
    m.y = m.mode === M_SWING ? base - Math.sin(Math.PI * u) * Math.min(MAX_SWING, d * 0.32) : m.mode === M_LEAP ? base + Math.sin(Math.PI * u) * 1.3 : base + Math.abs(Math.sin(u * Math.PI * 4)) * 0.12;
    if (u >= 1) {
      m.mode = M_SIT;
      // a little sit, a groom, a look round (shorter when tagging along after the kid)
      m.wait = near && m.follow < 45 ? 0.6 + W.rnd() * 1.4 : 2 + W.rnd() * 7;
    }
  }
  void t;
  void ky;
}

// ── the model ──
const FUR = col("#7a4e2e");
const FUR_DARK = col("#5a3620");
const FACE = col("#e8c49a");

/** a monkey sitting upright (~0.94 tall at scale 1, see MONKEY_K); aPart tags each limb for the shader */
export function buildMonkeyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tag = (g: THREE.BufferGeometry, id: number) => {
    g.setAttribute("aPart", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(id), 1));
    return g;
  };
  const ball = (x: number, y: number, z: number, rx: number, ry: number, rz: number, c: THREE.Color, id: number, d = 1) => {
    const g = new THREE.IcosahedronGeometry(1, d);
    g.scale(rx, ry, rz);
    g.translate(x, y, z);
    return tag(part(g, c, [0, 0, 0], { faceted: true }), id);
  };
  // body + belly, head with a pale face, ears, a little muzzle
  parts.push(ball(0, 0.42, 0, 0.2, 0.27, 0.17, FUR, 0));
  parts.push(ball(0, 0.4, 0.09, 0.13, 0.19, 0.1, FACE, 0, 0));
  parts.push(ball(0, 0.8, 0.02, 0.15, 0.14, 0.14, FUR, 1));
  parts.push(ball(0, 0.78, 0.11, 0.11, 0.1, 0.07, FACE, 1, 0));
  parts.push(ball(0, 0.74, 0.16, 0.06, 0.045, 0.05, FACE, 1, 0));
  for (const s of [-1, 1]) {
    parts.push(ball(s * 0.15, 0.83, 0.0, 0.05, 0.06, 0.03, FACE, 1, 0));
    parts.push(ball(s * 0.055, 0.82, 0.14, 0.022, 0.022, 0.015, col("#2a1a10"), 1, 0));
  }
  // arms (from the shoulders, hanging down) and legs (from the hips)
  for (const s of [-1, 1]) {
    const arm = taperTube([new THREE.Vector3(s * 0.17, 0.6, 0), new THREE.Vector3(s * 0.22, 0.38, 0.04), new THREE.Vector3(s * 0.21, 0.16, 0.08)], { segs: 3, radial: 5, rx: (t) => 0.05 - t * 0.012 });
    parts.push(tag(part(arm, FUR_DARK, [0, 0, 0], { faceted: true }), s < 0 ? 2 : 3));
    const leg = taperTube([new THREE.Vector3(s * 0.1, 0.24, -0.02), new THREE.Vector3(s * 0.16, 0.16, 0.16), new THREE.Vector3(s * 0.14, 0.02, 0.2)], { segs: 3, radial: 5, rx: (t) => 0.06 - t * 0.015 });
    parts.push(tag(part(leg, FUR_DARK, [0, 0, 0], { faceted: true }), s < 0 ? 4 : 5));
  }
  // the long tail, curling at the tip
  const tail = taperTube(
    [new THREE.Vector3(0, 0.24, -0.15), new THREE.Vector3(0, 0.12, -0.42), new THREE.Vector3(0, 0.22, -0.72), new THREE.Vector3(0, 0.46, -0.82), new THREE.Vector3(0, 0.56, -0.68)],
    { segs: 8, radial: 4, rx: (t) => 0.035 - t * 0.02 },
  );
  parts.push(tag(part(tail, FUR, [0, 0, 0], { faceted: true }), 6));
  return merge(parts);
}

const POSE_GLSL = /* glsl */ `
  attribute float aPart;
  attribute vec4 aPose; // mode, phase, chatter, drop
  vec3 rotX( vec3 p, vec3 o, float a ) { p -= o; float c = cos( a ), s = sin( a ); return o + vec3( p.x, c * p.y - s * p.z, s * p.y + c * p.z ); }
  vec3 rotZ( vec3 p, vec3 o, float a ) { p -= o; float c = cos( a ), s = sin( a ); return o + vec3( c * p.x - s * p.y, s * p.x + c * p.y, p.z ); }
  vec3 monkeyPose( vec3 p ) {
    float mode = aPose.x; float ph = aPose.y; float chat = aPose.z;
    float run = step( 0.5, mode ) * step( mode, 1.5 );
    float swing = step( 1.5, mode ) * step( mode, 2.5 );
    float leap = step( 2.5, mode ) * step( mode, 3.5 );
    float peek = step( 3.5, mode );
    float sit = 1.0 - run - swing - leap - peek;
    vec3 shL = vec3( -0.17, 0.6, 0.0 ); vec3 shR = vec3( 0.17, 0.6, 0.0 );
    vec3 hipL = vec3( -0.1, 0.24, -0.02 ); vec3 hipR = vec3( 0.1, 0.24, -0.02 );
    vec3 neck = vec3( 0.0, 0.66, 0.0 ); vec3 tb = vec3( 0.0, 0.24, -0.15 );
    float gait = sin( ph * 9.0 );
    if ( aPart > 1.5 && aPart < 2.5 ) {
      // left arm: grooms the neighbour when sitting, reaches up to swing, strides when running
      float a = sit * ( -0.6 + sin( ph * 2.3 ) * 0.5 ) + run * ( -1.2 + gait * 0.9 ) + swing * ( -2.9 ) + leap * ( -2.2 ) + peek * ( -0.9 + sin( ph * 5.0 ) * 0.6 );
      p = rotX( p, shL, a );
      p = rotZ( p, shL, -swing * 0.2 - peek * 0.5 );
    } else if ( aPart > 2.5 && aPart < 3.5 ) {
      float a = sit * ( -0.3 + sin( ph * 1.7 + 1.0 ) * 0.25 ) + run * ( -1.2 - gait * 0.9 ) + swing * ( -0.4 + sin( ph * 3.0 ) * 0.5 ) + leap * ( -2.2 ) + peek * ( -0.9 - sin( ph * 5.0 ) * 0.6 );
      p = rotX( p, shR, a );
      p = rotZ( p, shR, peek * 0.5 );
    } else if ( aPart > 3.5 && aPart < 5.5 ) {
      float sd = aPart < 4.5 ? 1.0 : -1.0;
      float a = sit * 0.0 + run * ( 0.9 + gait * sd * 0.8 ) + swing * ( 0.6 + sin( ph * 3.0 + sd ) * 0.4 ) + leap * 1.6 + peek * 0.4;
      p = rotX( p, aPart < 4.5 ? hipL : hipR, a );
    } else if ( aPart > 5.5 ) {
      // the tail: swaying, held up and curled while hanging upside down
      float a = sin( ph * 1.3 ) * 0.25 + run * 0.6 + swing * 0.3 + peek * -1.7;
      p = rotX( p, tb, a );
      p = rotZ( p, tb, sin( ph * 0.9 ) * 0.3 * ( 1.0 - peek ) );
    } else if ( aPart > 0.5 ) {
      // the head: looks about, bobs when it chatters
      p = rotX( p, neck, sin( ph * 0.8 ) * 0.2 - run * 0.5 + chat * sin( ph * 22.0 ) * 0.12 );
      p.y += chat * abs( sin( ph * 22.0 ) ) * 0.02;
    }
    return p;
  }
`;

export interface Monkeys {
  count: number;
  tris: number;
  world: MonkeyWorld;
  update(dt: number, t: number, kid: THREE.Vector3): void;
  dispose(): void;
}

export function buildMonkeys(parent: THREE.Object3D, plan: JunglePlan, opts: { lowQuality?: boolean; cut: JungleCut; grabCam: THREE.Object3D["onBeforeRender"] }): Monkeys {
  const W = planMonkeys(plan, { lowQuality: opts.lowQuality });
  const n = W.monkeys.length;
  const geo = buildMonkeyGeometry();
  const pose = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 4), 4);
  pose.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aPose", pose);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const baseCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${POSE_GLSL}`).replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = monkeyPose( transformed );");
  };
  mat.onBeforeCompile = baseCompile;
  mat.customProgramCacheKey = () => "jungle-monkey";
  addJungleCut(mat, opts.cut);
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  im.count = n;
  im.name = "jungle-monkeys";
  im.frustumCulled = false;
  im.castShadow = false;
  im.onBeforeRender = opts.grabCam;
  parent.add(im);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const tris = (geo.attributes.position.count / 3) * n;
  return {
    count: n,
    tris,
    world: W,
    update(dt, t, kid) {
      const under = underCanopy(kid.x, kid.z);
      stepMonkeys(W, Math.min(dt, 0.1), t, kid.x, kid.y, kid.z, under);
      const arr = pose.array as Float32Array;
      for (let i = 0; i < n; i++) {
        const m = W.monkeys[i];
        // hanging by the tail (upside down) when peeking; pitched forward running along a bough
        const pitch = m.mode === M_RUN ? 1.05 : m.mode === M_LEAP ? 0.7 : 0;
        const flip = m.mode === M_PEEK ? Math.PI * Math.min(1, m.drop * 1.6) : 0;
        e.set(pitch + flip, m.yaw, m.mode === M_SWING ? Math.sin(t * 3 + m.seed) * 0.25 : 0, "YXZ");
        // (sit on top of the bough; hang beneath it when swinging; tail up when peeking)
        const lift = m.mode === M_SWING ? -0.95 * m.scale : m.mode === M_PEEK ? -0.2 : 0.05;
        m4.compose(v.set(m.x, m.y + lift, m.z), q.setFromEuler(e), s3.setScalar(m.scale * MONKEY_K));
        im.setMatrixAt(i, m4);
        arr[i * 4] = m.mode;
        arr[i * 4 + 1] = t + m.seed;
        arr[i * 4 + 2] = m.chatter;
        arr[i * 4 + 3] = m.drop;
      }
      im.instanceMatrix.needsUpdate = true;
      pose.needsUpdate = true;
    },
    dispose() {
      parent.remove(im);
      geo.dispose();
      mat.dispose();
      im.dispose();
    },
  };
}
