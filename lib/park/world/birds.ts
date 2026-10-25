// More birds over Cucaino Island (adds to skyLife.ts's high flocks, doesn't replace them):
//   - seagulls circling and gliding over the beaches (flap bursts, then long glides, banking)
//   - flocks of small colourful birds flitting over the meadows (light boids: stepFlock)
//   - two or three eagles soaring in slow thermals over the northern mountains
//   - at twilight, a glowing phoenix looping high over the island with a sparkle trail
// Four draw calls. Wings flap in the vertex shader (per-vertex flap weight, per-instance
// strength + phase), so updates are just instance matrices. Allocation-free per frame.
import * as THREE from "three";
import { coastR, parkShoreA } from "../registry/island";
import { groundY } from "../registry/terrain";
import { col, merge, mix, part } from "./fantasy/geo";
import { rngOf, smoothstep } from "./fantasy/noise";
import { buildGlowSprites } from "./underwater/fx";
import { makeUwUniforms, uwMaterial } from "./underwater/shaders";

export interface Birds {
  update(dt: number, t: number, focus: THREE.Vector3, glow: number): void;
  dispose(): void;
}

// ── flocking (pure, tested) ──
export interface FlockParams {
  /** how hard birds steer to the flock's target */
  seek: number;
  /** keep this far from neighbours */
  sep: number;
  /** cruise and max speed */
  speed: number;
  maxSpeed: number;
}

/**
 * One boids step for `n` birds (flat arrays, n*3). Birds match their neighbours' heading, keep
 * apart, stay together and are drawn toward `target`. O(n²) — fine for flocks of a dozen.
 */
export function stepFlock(pos: Float32Array, vel: Float32Array, n: number, tx: number, ty: number, tz: number, dt: number, p: FlockParams): void {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let ax = 0;
  let ay = 0;
  let az = 0;
  for (let i = 0; i < n; i++) {
    cx += pos[i * 3];
    cy += pos[i * 3 + 1];
    cz += pos[i * 3 + 2];
    ax += vel[i * 3];
    ay += vel[i * 3 + 1];
    az += vel[i * 3 + 2];
  }
  cx /= n;
  cy /= n;
  cz /= n;
  ax /= n;
  ay /= n;
  az /= n;
  const sep2 = p.sep * p.sep;
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    let fx = (tx - pos[k]) * p.seek + (cx - pos[k]) * 0.4 + (ax - vel[k]) * 0.8;
    let fy = (ty - pos[k + 1]) * p.seek * 1.5 + (cy - pos[k + 1]) * 0.4 + (ay - vel[k + 1]) * 0.8;
    let fz = (tz - pos[k + 2]) * p.seek + (cz - pos[k + 2]) * 0.4 + (az - vel[k + 2]) * 0.8;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = pos[k] - pos[j * 3];
      const dy = pos[k + 1] - pos[j * 3 + 1];
      const dz = pos[k + 2] - pos[j * 3 + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < sep2 && d2 > 1e-8) {
        const f = (sep2 - d2) / sep2 / Math.sqrt(d2);
        fx += dx * f * 14;
        fy += dy * f * 14;
        fz += dz * f * 14;
      }
    }
    let vx = vel[k] + fx * dt;
    let vy = vel[k + 1] + fy * dt;
    let vz = vel[k + 2] + fz * dt;
    const sp = Math.hypot(vx, vy, vz);
    // keep cruising: never stall, never rocket
    const want = Math.min(p.maxSpeed, Math.max(p.speed * 0.6, sp));
    if (sp > 1e-6) {
      vx *= want / sp;
      vy *= want / sp;
      vz *= want / sp;
    } else vx = p.speed;
    // small birds climb and dive gently, they don't rocket up and down
    const vmax = want * 0.35;
    if (vy > vmax) vy = vmax;
    else if (vy < -vmax) vy = -vmax;
    vel[k] = vx;
    vel[k + 1] = vy;
    vel[k + 2] = vz;
    pos[k] += vx * dt;
    pos[k + 1] += vy * dt;
    pos[k + 2] += vz * dt;
  }
}

/** the highest point of the northern mountains (eagles circle above it) */
export function northernPeak(): { x: number; y: number; z: number } {
  let best = { x: 0, y: -Infinity, z: -100 };
  for (let z = -180; z < -40; z += 4)
    for (let x = -120; x <= 120; x += 4) {
      const y = groundY(x, z);
      if (y > best.y) best = { x, y, z };
    }
  return best;
}

// ── geometry (facing +z, wings along x; aFx = [tint, flap weight, glow]) ──
type Wing = { span: number; root: number; tip: number; sweep: number; fingers?: number };

function wingGeo(side: number, w: Wing, colour: (u: number, v: number) => THREE.Color, glow: (u: number) => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const cols: number[] = [];
  const fx: number[] = [];
  const segs = 4;
  const pt = (u: number, v: number) => {
    const x = side * (0.06 + u * w.span);
    const chord = w.root + (w.tip - w.root) * u;
    const lead = 0.12 - u * u * w.sweep;
    const z = lead - v * chord;
    const y = Math.sin(u * Math.PI) * 0.03 - v * 0.01;
    return { p: [x, y, z], c: colour(u, v), f: Math.pow(u, 1.25) * w.span * 0.75, g: glow(u) };
  };
  const push = (a: ReturnType<typeof pt>) => {
    pos.push(...a.p);
    cols.push(a.c.r, a.c.g, a.c.b);
    fx.push(1, a.f, a.g);
  };
  for (let i = 0; i < segs; i++) {
    const u0 = i / segs;
    const u1 = (i + 1) / segs;
    const a = pt(u0, 0);
    const b = pt(u1, 0);
    const c = pt(u0, 1);
    const d = pt(u1, 1);
    for (const q of [a, c, b, b, c, d]) push(q);
  }
  if (w.fingers) {
    // splayed primary feathers at the tip (eagles)
    for (let f = 0; f < w.fingers; f++) {
      const v0 = f / w.fingers;
      const v1 = (f + 0.7) / w.fingers;
      const a = pt(1, v0);
      const b = pt(1, v1);
      const ang = (f / (w.fingers - 1) - 0.5) * 0.9;
      const tip = { ...pt(1, (v0 + v1) / 2) };
      tip.p = [tip.p[0] + side * Math.cos(ang) * 0.28, tip.p[1] + 0.02, tip.p[2] - Math.sin(ang) * 0.28 - 0.04];
      tip.f = w.span * 0.75 * 1.25;
      for (const q of [a, tip, b]) push(q);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute("aFx", new THREE.Float32BufferAttribute(fx, 3));
  g.computeVertexNormals();
  return g;
}

function birdBody(o: { len: number; girth: number; body: THREE.Color; belly: THREE.Color; head: THREE.Color; beak: THREE.Color; tail: THREE.Color; tailLen: number; glow?: number }) {
  const parts: THREE.BufferGeometry[] = [];
  const g = o.glow ?? 0;
  const body = new THREE.SphereGeometry(1, 8, 6);
  body.scale(o.girth, o.girth * 0.95, o.len);
  parts.push(part(body, (p) => mix(o.body, o.belly, smoothstep(0.02, -o.girth * 0.6, p.y)), [1, 0, g]));
  const head = new THREE.SphereGeometry(o.girth * 0.78, 7, 5);
  head.translate(0, o.girth * 0.35, o.len * 0.85);
  parts.push(part(head, o.head, [1, 0, g]));
  const beak = new THREE.ConeGeometry(o.girth * 0.25, o.girth * 0.9, 4);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, o.girth * 0.3, o.len * 0.85 + o.girth * 0.95);
  parts.push(part(beak, o.beak, [0, 0, g * 0.5]));
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(o.girth * 0.13, 4, 3);
    eye.translate(s * o.girth * 0.55, o.girth * 0.5, o.len * 0.95);
    parts.push(part(eye, col("#111111"), [0, 0, 0]));
  }
  // tail fan
  const tp = [0, 0.01, -o.len * 0.8, -o.girth * 1.6, 0, -o.len * 0.8 - o.tailLen, o.girth * 1.6, 0, -o.len * 0.8 - o.tailLen];
  const tail = new THREE.BufferGeometry();
  tail.setAttribute("position", new THREE.Float32BufferAttribute(tp, 3));
  tail.computeVertexNormals();
  parts.push(part(tail, o.tail, [1, 0, g]));
  return parts;
}

function gullGeometry() {
  const white = col("#ffffff");
  const grey = col("#b9c3d0");
  const black = col("#1d1f24");
  const w: Wing = { span: 0.72, root: 0.26, tip: 0.1, sweep: 0.25 };
  const colour = (u: number, v: number) => (u > 0.78 ? black : mix(grey, white, smoothstep(0.7, 1, v) * 0.6 + (u < 0.1 ? 0.3 : 0)));
  return merge([
    ...birdBody({ len: 0.3, girth: 0.09, body: white, belly: white, head: white, beak: col("#ffc93a"), tail: white, tailLen: 0.16 }),
    wingGeo(-1, w, colour, () => 0),
    wingGeo(1, w, colour, () => 0),
  ]);
}

function eagleGeometry() {
  const brown = col("#5a3a22");
  const dark = col("#3a2616");
  const white = col("#f4f1ea");
  const w: Wing = { span: 0.95, root: 0.42, tip: 0.3, sweep: 0.08, fingers: 5 };
  const colour = (u: number, v: number) => mix(brown, dark, smoothstep(0.5, 1, u) * 0.6 + v * 0.2);
  return merge([
    ...birdBody({ len: 0.36, girth: 0.12, body: brown, belly: dark, head: white, beak: col("#ffcc33"), tail: white, tailLen: 0.3 }),
    wingGeo(-1, w, colour, () => 0),
    wingGeo(1, w, colour, () => 0),
  ]);
}

function phoenixGeometry() {
  const gold = col("#ffd36b");
  const fire = col("#ff7a2a");
  const rose = col("#ff3f8a");
  const w: Wing = { span: 1.0, root: 0.5, tip: 0.22, sweep: 0.35, fingers: 6 };
  const colour = (u: number, v: number) => mix(mix(gold, fire, u), rose, smoothstep(0.55, 1, u) * 0.6 + v * 0.25);
  const parts = [
    ...birdBody({ len: 0.34, girth: 0.12, body: gold, belly: col("#fff0b0"), head: gold, beak: col("#fff6d0"), tail: fire, tailLen: 0.4, glow: 1 }),
    wingGeo(-1, w, colour, (u) => 0.7 + u * 0.3),
    wingGeo(1, w, colour, (u) => 0.7 + u * 0.3),
  ];
  // three long flowing tail streamers
  for (let k = -1; k <= 1; k++) {
    const pos: number[] = [];
    const cols: number[] = [];
    const fx: number[] = [];
    const segs = 8;
    for (let i = 0; i < segs; i++) {
      for (const [u, side] of [
        [i / segs, -1],
        [(i + 1) / segs, -1],
        [i / segs, 1],
        [(i + 1) / segs, -1],
        [(i + 1) / segs, 1],
        [i / segs, 1],
      ] as const) {
        const z = -0.3 - u * 2.2;
        const x = k * (0.08 + u * 0.35) + Math.sin(u * 5 + k) * 0.12;
        const y = -u * 0.25 + Math.sin(u * 4) * 0.1;
        const wd = 0.07 * (1 - u * 0.5) + (u > 0.85 ? 0.08 : 0);
        pos.push(x + side * wd, y, z);
        const c = mix(fire, rose, u);
        cols.push(c.r, c.g, c.b);
        fx.push(1, 0, 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    g.setAttribute("aFx", new THREE.Float32BufferAttribute(fx, 3));
    g.computeVertexNormals();
    parts.push(g);
  }
  return merge(parts);
}

// ── true size ── (the Park kid is 2.26 units = a real ~1.4 m ten-year-old: 1 m = 1.6 units)
//   gull           ~0.55 m long, ~1 m wingspan (a silver / herring gull)  model 0.85 long, 1.56 span
//   meadow birds   ~0.3 m long (lorikeet-sized: the same model, smaller)   model 0.85 long
//   eagle          ~2.3 m wingspan (a wedge-tailed eagle)                 model 2.6 span
//   (the phoenix is a fairy-tale bird: it keeps its storybook size)
export const BIRD_K = { gull: (1.6 * 0.55) / 0.85, song: (1.6 * 0.3) / 0.85, eagle: (1.6 * 2.3) / 2.6 } as const;

const SONG_COLS = ["#ff5a7a", "#4fb8ff", "#ffd23f", "#7ae05a", "#ff9a3c", "#b77aff"].map((h) => col(h));

export function buildBirds(scene: THREE.Scene, opts: { lowQuality?: boolean }): Birds {
  const low = !!opts.lowQuality;
  const U = makeUwUniforms();
  U.uGlowK.value = 1.2;
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);
  const mat = track(uwMaterial(U, { motion: "flap", inst: true, sea: false, flapSpeed: 0, flapWave: 1.1 }, { side: THREE.DoubleSide, roughness: 0.75 }));
  const r = rngOf(2718);
  const group = new THREE.Group();
  group.name = "birds";
  const inst = (geo: THREE.BufferGeometry, n: number, name: string) => {
    track(geo);
    geo.setAttribute("aInst", new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2));
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.name = name;
    im.frustumCulled = false;
    group.add(im);
    return { im, a: geo.attributes.aInst as THREE.InstancedBufferAttribute };
  };

  // seagulls + songbirds share one mesh (songbirds are small and tinted)
  const nGull = low ? 5 : 9;
  const nFlock = low ? 2 : 3;
  const perFlock = low ? 7 : 11;
  const nSong = nFlock * perFlock;
  const small = inst(gullGeometry(), nGull + nSong, "birds-small");
  const gulls = Array.from({ length: nGull }, (_, i) => {
    // (over the park's own shore; they drift slowly up and down it)
    const a = parkShoreA((i + 0.5) / nGull);
    return { a, off: -2 + r() * 12, rad: 9 + r() * 8, h: 9 + r() * 8, w: (r() < 0.5 ? -1 : 1) * (0.3 + r() * 0.15), ph: r() * 10, phase: r() * 6, flapT: r() * 5 };
  });
  gulls.forEach((_, i) => small.im.setColorAt(i, col("#ffffff")));
  const meadows = [
    [-30, 34],
    [44, -28],
    [-95, -10],
  ];
  const flocks = Array.from({ length: nFlock }, (_, f) => {
    const [mx, mz] = meadows[f];
    const pos = new Float32Array(perFlock * 3);
    const vel = new Float32Array(perFlock * 3);
    for (let k = 0; k < perFlock; k++) {
      pos[k * 3] = mx + (r() - 0.5) * 6;
      pos[k * 3 + 1] = groundY(mx, mz) + 8 + r() * 2;
      pos[k * 3 + 2] = mz + (r() - 0.5) * 6;
      vel[k * 3] = (r() - 0.5) * 4;
      vel[k * 3 + 2] = (r() - 0.5) * 4;
      small.im.setColorAt(nGull + f * perFlock + k, SONG_COLS[(f * 2 + k) % SONG_COLS.length]);
    }
    return { mx, mz, pos, vel, ph: r() * 10, phase: new Float32Array(perFlock).map(() => r() * 6), yaw: new Float32Array(perFlock), roll: new Float32Array(perFlock) };
  });
  const flockP: FlockParams = { seek: 0.9, sep: 1.1, speed: 6, maxSpeed: 9 };

  // eagles over the northern peak
  const peak = northernPeak();
  const nEagle = low ? 2 : 3;
  const eagleM = inst(eagleGeometry(), nEagle, "birds-eagles");
  const eagles = Array.from({ length: nEagle }, (_, i) => ({ rad: 26 + i * 11, h: peak.y + 18 + i * 6, w: (i % 2 ? -1 : 1) * (0.13 + i * 0.02), a: i * 2.1, phase: r() * 6, flapT: 3 + i * 4 }));
  eagles.forEach((_, i) => eagleM.im.setColorAt(i, col("#ffffff")));

  // the phoenix + its sparkle trail
  const phoenix = inst(phoenixGeometry(), 1, "birds-phoenix");
  phoenix.im.setColorAt(0, col("#ffffff"));
  const trailN = low ? 70 : 150;
  const trail = buildGlowSprites(U, trailN);
  track(trail);
  trail.points.name = "birds-phoenix-trail";
  group.add(trail.points);
  const tPos = new Float32Array(trailN * 3);
  const tLife = new Float32Array(trailN);
  const tHue = new Float32Array(trailN);
  let tNext = 0;
  let emitAcc = 0;
  let phPhase = 0;
  let alive = 0;
  const tailV = new THREE.Vector3();

  scene.add(group);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const gold = col("#ffcf5a");
  const rose = col("#ff4f9a");
  const tc = new THREE.Color();

  return {
    update(dtIn, t, _focus, glow) {
      const dt = Math.min(0.1, Math.max(0, dtIn));
      U.uTime.value = t;
      U.uGlow.value = glow;
      U.uGlowK.value = 0.9 + glow * 0.6;
      const day = 1 - smoothstep(0.75, 1, glow);

      // seagulls: lazy circles over the shore, a few flaps, then a long glide
      for (let i = 0; i < nGull; i++) {
        const g = gulls[i];
        g.a = parkShoreA(Math.min(1, Math.max(0, (i + 0.5) / nGull + Math.sin(t * 0.004 + g.ph) * 0.08)));
        const u = t * g.w + g.ph;
        const cr = coastR(g.a) + g.off;
        const cx = Math.sin(g.a) * cr + Math.sin(u) * g.rad;
        const cz = Math.cos(g.a) * cr + Math.cos(u) * g.rad;
        const y = Math.max(groundY(cx, cz), 0) + g.h + Math.sin(u * 0.7) * 1.5;
        const yaw = Math.atan2(Math.cos(u) * g.w, -Math.sin(u) * g.w);
        g.flapT = (g.flapT + dt) % 6;
        const flapping = g.flapT < 1.6 ? 1 : 0.12;
        g.phase += dt * (flapping > 0.5 ? 9 : 1.5);
        e.set(0, yaw, -Math.sign(g.w) * 0.35, "YXZ");
        m.compose(v.set(cx, y, cz), q.setFromEuler(e), s.setScalar(BIRD_K.gull * day + 1e-3));
        small.im.setMatrixAt(i, m);
        small.a.setXY(i, flapping, g.phase);
      }
      // songbird flocks flitting over the meadows
      for (let f = 0; f < nFlock; f++) {
        const fl = flocks[f];
        const u = t * 0.18 + fl.ph;
        const tx = fl.mx + Math.sin(u) * 22 + Math.sin(u * 2.7) * 6;
        const tz = fl.mz + Math.cos(u * 0.8) * 18;
        const ty = groundY(tx, tz) + 5.5 + Math.sin(u * 3.1) * 1.5;
        stepFlock(fl.pos, fl.vel, perFlock, tx, ty, tz, dt, flockP);
        for (let k = 0; k < perFlock; k++) {
          const j = k * 3;
          const vx = fl.vel[j];
          const vz = fl.vel[j + 2];
          const want = Math.atan2(vx, vz);
          let dy = want - fl.yaw[k];
          dy -= Math.round(dy / (Math.PI * 2)) * Math.PI * 2;
          const turn = dy * Math.min(1, dt * 7);
          fl.yaw[k] += turn;
          fl.roll[k] += (Math.max(-0.7, Math.min(0.7, (-turn / Math.max(dt, 1e-3)) * 0.2)) - fl.roll[k]) * Math.min(1, dt * 5);
          const pitch = -Math.atan2(fl.vel[j + 1], Math.hypot(vx, vz)) * 0.7;
          // flit: bursts of fast flapping with tiny glides
          const burst = Math.sin(t * 2.3 + k * 1.7 + f) > -0.3 ? 1 : 0.2;
          fl.phase[k] += dt * (burst > 0.5 ? 24 : 3);
          e.set(pitch, fl.yaw[k], fl.roll[k], "YXZ");
          m.compose(v.set(fl.pos[j], fl.pos[j + 1], fl.pos[j + 2]), q.setFromEuler(e), s.setScalar(BIRD_K.song * day + 1e-3));
          const idx = nGull + f * perFlock + k;
          small.im.setMatrixAt(idx, m);
          small.a.setXY(idx, burst * 0.8, fl.phase[k]);
        }
      }
      small.im.instanceMatrix.needsUpdate = true;
      small.a.needsUpdate = true;

      // eagles: soaring slow thermals, banking, a rare lazy flap
      for (let i = 0; i < nEagle; i++) {
        const eg = eagles[i];
        eg.a += eg.w * dt;
        const x = peak.x + Math.sin(eg.a) * eg.rad;
        const z = peak.z + Math.cos(eg.a) * eg.rad;
        const y = eg.h + Math.sin(t * 0.2 + i) * 3;
        const yaw = eg.a + (eg.w > 0 ? Math.PI / 2 : -Math.PI / 2);
        eg.flapT = (eg.flapT + dt) % 14;
        const flap = eg.flapT < 1.8 ? 0.6 : 0.04;
        eg.phase += dt * (flap > 0.3 ? 4.5 : 0.8);
        e.set(0, yaw, -Math.sign(eg.w) * 0.3, "YXZ");
        m.compose(v.set(x, y, z), q.setFromEuler(e), s.setScalar(BIRD_K.eagle * day + 1e-3));
        eagleM.im.setMatrixAt(i, m);
        eagleM.a.setXY(i, flap, eg.phase);
      }
      eagleM.im.instanceMatrix.needsUpdate = true;
      eagleM.a.needsUpdate = true;

      // the phoenix: a figure-eight high over the island, only at twilight
      const show = smoothstep(0.3, 0.65, glow);
      phoenix.im.visible = show > 0.001;
      trail.points.visible = show > 0.001 || alive > 0;
      if (show > 0.001) {
        const u = t * 0.07;
        const px = Math.sin(u) * 115;
        const pz = Math.sin(u) * Math.cos(u) * 150;
        const py = 62 + Math.sin(u * 3) * 8;
        const u2 = u + 0.02;
        const nx = Math.sin(u2) * 115;
        const nz = Math.sin(u2) * Math.cos(u2) * 150;
        const ny = 62 + Math.sin(u2 * 3) * 8;
        const yaw = Math.atan2(nx - px, nz - pz);
        const u3 = u + 0.04;
        const yaw2 = Math.atan2(Math.sin(u3) * 115 - nx, Math.sin(u3) * Math.cos(u3) * 150 - nz);
        let dyaw = yaw2 - yaw;
        dyaw -= Math.round(dyaw / (Math.PI * 2)) * Math.PI * 2;
        const pitch = -Math.atan2(ny - py, Math.hypot(nx - px, nz - pz));
        phPhase += dt * 3.2;
        e.set(pitch, yaw, Math.max(-0.8, Math.min(0.8, -dyaw * 12)), "YXZ");
        m.compose(v.set(px, py, pz), q.setFromEuler(e), s.setScalar(4.2 * show));
        phoenix.im.setMatrixAt(0, m);
        phoenix.a.setXY(0, 0.7, phPhase);
        phoenix.im.instanceMatrix.needsUpdate = true;
        phoenix.a.needsUpdate = true;
        // sparkles shed from the tail
        emitAcc += dt * 45 * show;
        tailV.set(0, 0, -1.4).applyQuaternion(q).multiplyScalar(4.2).add(v);
        while (emitAcc >= 1) {
          emitAcc -= 1;
          const k = tNext++ % trailN;
          tPos[k * 3] = tailV.x + (r() - 0.5) * 2.2;
          tPos[k * 3 + 1] = tailV.y + (r() - 0.5) * 1.4;
          tPos[k * 3 + 2] = tailV.z + (r() - 0.5) * 2.2;
          tLife[k] = 1;
          tHue[k] = r();
        }
      }
      alive = 0;
      for (let k = 0; k < trailN; k++) {
        if (tLife[k] <= 0) {
          trail.set(k, 0, -999, 0, 0, 0, 0, 0);
          continue;
        }
        tLife[k] -= dt / 2.4;
        alive++;
        tPos[k * 3 + 1] -= dt * 0.8;
        const l = Math.max(0, tLife[k]);
        tc.copy(gold).lerp(rose, tHue[k] * 0.7 + (1 - l) * 0.3).multiplyScalar(1.4 * l * show + 0.001);
        trail.set(k, tPos[k * 3], tPos[k * 3 + 1], tPos[k * 3 + 2], tc.r, tc.g, tc.b, (0.8 + tHue[k] * 1.4) * (0.4 + l * 0.6));
      }
      trail.commit();
    },
    dispose() {
      scene.remove(group);
      group.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose());
      for (const d of disposables) d.dispose();
    },
  };
}
