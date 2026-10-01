// Flying a dragon in Cucaino Park: it banks into turns with its wings tilted, noses down into a
// dive (wings swept back, the camera pulling out, wind streaks rushing past) and pulls up with a
// whoosh; it beats its wings when climbing and glides with them held out; it does barrel rolls
// and puffs harmless sparkly fire on a button; and there are puffy candy clouds round the island
// to burst through. The kid leans forward in the saddle. Before take-off it wiggles with joy.
//
// The engine (ParkWorld) hands it the mount each frame; this sets the mount's tilt and the
// dragon rig's wing drive, and draws the clouds and the puffs (2 draw calls). Allocation-free.
import * as THREE from "three";
import { dragonSnout, mountScale, type DragonBreed, type DragonDrive, type MountRig } from "../../characters/mounts";
import { WATER_Y } from "../../registry/terrain";

export interface DragonFlightFrame {
  mount: MountRig;
  /** the kid's rig root (leans forward in the saddle) */
  kidRig: THREE.Object3D | null;
  pos: THREE.Vector3;
  /** heading change this frame (radians) */
  dYaw: number;
  /** height above the ground (the engine's flier altitude) and its rate of change */
  alt: number;
  climb: number;
  moving: boolean;
}

export interface DragonFlight {
  /** a dragon's just been mounted */
  start(breed: DragonBreed): void;
  /** every frame while riding a dragon (before the rig's own update) */
  apply(dt: number, f: DragonFlightFrame): void;
  /** every frame: clouds drift (and burst when flown through), puffs fly */
  update(dt: number, t: number, o: { pos: THREE.Vector3; riding: boolean }): void;
  /** camera distance factor (pulls back in a dive) */
  readonly camBack: number;
  /** "roll": a barrel roll; "fire": a puff of sparkly fire. False if it can't right now. */
  trick(k: "roll" | "fire"): boolean;
  /** the clouds (for tests) */
  readonly clouds: readonly { x: number; y: number; z: number; r: number; pop: number }[];
  dispose(): void;
}

const CLOUD_N = 12;
const PUFF_N = 64;

export function createDragonFlight(scene: THREE.Scene, opts: { lowQuality?: boolean } = {}): DragonFlight {
  const low = !!opts.lowQuality;
  const group = new THREE.Group();
  group.name = "dragon-flight";
  scene.add(group);

  // ── puffy candy clouds in the flying band round the island (one draw) ──
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, y, z, r] of [[0, 0, 0, 1], [0.9, -0.15, 0.2, 0.75], [-0.85, -0.2, -0.1, 0.7], [0.3, 0.45, -0.3, 0.65], [-0.4, 0.3, 0.45, 0.6]] as const) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(x, y, z);
    parts.push(g);
  }
  const cloudGeo = mergeParts(parts);
  const cloudMat = new THREE.MeshLambertMaterial({ color: "#fff4fb", emissive: "#ffe3f2", emissiveIntensity: 0.35, flatShading: true });
  const cloudMesh = new THREE.InstancedMesh(cloudGeo, cloudMat, CLOUD_N);
  cloudMesh.name = "dragon-flight:clouds";
  cloudMesh.frustumCulled = false;
  group.add(cloudMesh);
  const tints = ["#fff4fb", "#ffe1f0", "#e8f2ff", "#fff3d6"];
  const col = new THREE.Color();
  const clouds: { x: number; y: number; z: number; r: number; pop: number; a: number; d: number; s: number }[] = [];
  for (let i = 0; i < CLOUD_N; i++) {
    const a = (i / CLOUD_N) * Math.PI * 2 + (i % 3) * 0.3;
    const d = 45 + ((i * 37) % 70);
    const r = 5 + ((i * 13) % 4);
    clouds.push({ a, d, x: Math.sin(a) * d, z: Math.cos(a) * d, y: 26 + ((i * 29) % 26), r, pop: 0, s: 0.004 + (i % 4) * 0.0015 });
    cloudMesh.setColorAt(i, col.set(tints[i % tints.length]));
  }

  // ── puffs: fire breath, wind streaks and burst-cloud bits (one draw, coloured per instance) ──
  const puffGeo = new THREE.IcosahedronGeometry(0.5, 0);
  const puffMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  const puffMesh = new THREE.InstancedMesh(puffGeo, puffMat, PUFF_N);
  puffMesh.name = "dragon-flight:puffs";
  puffMesh.frustumCulled = false;
  puffMesh.count = 0;
  group.add(puffMesh);
  for (let i = 0; i < PUFF_N; i++) puffMesh.setColorAt(i, col.set("#ffffff"));
  interface Puff {
    on: boolean;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    age: number;
    size: number;
    /** 0 fire, 1 streak, 2 cloud bit */
    kind: number;
    yaw: number;
  }
  const puffs: Puff[] = Array.from({ length: PUFF_N }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, age: 0, size: 1, kind: 0, yaw: 0 }));
  const FIRE = ["#ffd257", "#ff9a3c", "#ff6f91", "#fff3a0"];
  const BIT = ["#ffffff", "#ffe1f0", "#e8f2ff"];
  let nextPuff = 0;
  const emit = (x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, kind: number, c: string, yaw = 0) => {
    const i = nextPuff;
    nextPuff = (nextPuff + 1) % PUFF_N;
    const p = puffs[i];
    p.on = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = life;
    p.age = 0;
    p.size = size;
    p.kind = kind;
    p.yaw = yaw;
    puffMesh.setColorAt(i, col.set(c));
    if (puffMesh.instanceColor) puffMesh.instanceColor.needsUpdate = true;
  };

  // ── the ride's state ──
  let breed: DragonBreed = "roostwarden";
  let bank = 0;
  let pitch = 0;
  let rollT = -1;
  let fireT = -1;
  let dive = 0;
  let wasDive = 0;
  let camBack = 1;
  let mountT = 0;
  let flapBurst = 0;
  let velX = 0;
  let velZ = 0;
  const lastPos = { x: 0, y: 0, z: 0, yaw: 0, ok: false };
  const drv: DragonDrive = { mode: "fly", act: "stand", look: 0, flap: 0.6, dive: 0 };
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const E = new THREE.Euler(0, 0, 0, "YXZ");
  const P = new THREE.Vector3();
  const S = new THREE.Vector3();
  const V = new THREE.Vector3();

  return {
    get camBack() {
      return camBack;
    },
    clouds,
    start(b) {
      breed = b;
      bank = pitch = 0;
      rollT = fireT = -1;
      dive = wasDive = 0;
      camBack = 1;
      mountT = 0;
      flapBurst = 0;
    },
    trick(k) {
      if (!lastPos.ok) return false;
      if (k === "roll") {
        if (rollT >= 0) return false;
        rollT = 0;
        return true;
      }
      if (fireT >= 0 && fireT < 0.5) return false;
      fireT = 0;
      return true;
    },
    apply(dt, f) {
      const m = f.mount;
      mountT += dt;
      const flying = f.alt > 0.6;
      const yawRate = f.dYaw / Math.max(dt, 1e-3);
      // banking into turns, the nose down in a dive / up in a climb
      const bankWant = flying ? Math.max(-0.75, Math.min(0.75, yawRate * 0.42)) : 0;
      bank += (bankWant - bank) * Math.min(1, dt * 3.5);
      const diveWant = flying ? Math.max(0, Math.min(1, (-f.climb - 3) / 7)) : 0;
      dive += (diveWant - dive) * Math.min(1, dt * 3);
      const pitchWant = flying ? dive * 0.55 - Math.max(0, Math.min(0.3, f.climb * 0.05)) : 0;
      pitch += (pitchWant - pitch) * Math.min(1, dt * 3);
      // barrel roll: a full turn in a second and a bit, with a little hop up
      let roll = 0;
      if (rollT >= 0) {
        rollT += dt;
        const u = Math.min(1, rollT / 1.15);
        roll = Math.PI * 2 * (u * u * (3 - 2 * u));
        if (u >= 1) rollT = -1;
      }
      m.root.rotation.order = "YXZ";
      m.root.rotation.x = pitch;
      m.root.rotation.z = bank + roll;
      // the wings: beat when climbing or slow, glide when cruising, swept back in a dive; a few
      // big beats now and then while cruising so it never looks stiff
      flapBurst -= dt;
      if (flapBurst < -3.2) flapBurst = 1.6;
      const cruise = f.moving ? (flapBurst > 0 ? 0.75 : 0.08) : 0.55;
      drv.mode = "fly";
      drv.flap = flying ? Math.max(0, Math.min(1, Math.max(cruise, f.climb * 0.18 + 0.2) * (1 - dive))) : 0.6;
      drv.dive = dive;
      // a happy wiggle before take-off
      if (mountT < 0.9 && f.alt < 2.5) {
        drv.mode = "park";
        drv.act = "wiggle";
      }
      m.drive?.(drv);
      // the kid leans forward in the saddle (more in a dive), and banks / rolls with the dragon
      if (f.kidRig) {
        f.kidRig.rotation.x = flying ? 0.28 + dive * 0.25 : 0;
        const kr = f.kidRig.parent;
        if (kr) {
          kr.rotation.order = "YXZ";
          kr.rotation.x = pitch;
          kr.rotation.z = bank + roll;
        }
      }
      camBack += ((1 + dive * 0.45) - camBack) * Math.min(1, dt * 2.5);
      // wind streaks while diving; a whoosh of them as it pulls out of a dive
      const yaw = m.root.rotation.y;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      if (dive > 0.35 && Math.random() < dt * (low ? 10 : 24)) {
        const sx = (Math.random() - 0.5) * 9;
        const sy = (Math.random() - 0.3) * 5;
        emit(f.pos.x + fz * sx + fx * 9, f.pos.y + sy + 2, f.pos.z - fx * sx + fz * 9, -fx * 30, 6, -fz * 30, 0.5, 0.35, 1, "#ffffff", yaw);
      }
      wasDive = Math.max(dive, wasDive - dt * 0.6);
      if (wasDive > 0.55 && dive < 0.25) {
        wasDive = 0;
        for (let i = 0; i < (low ? 6 : 14); i++) {
          const a = (i / 14) * Math.PI * 2;
          emit(f.pos.x + Math.cos(a) * 3, f.pos.y + 3 + Math.sin(a) * 3, f.pos.z, Math.cos(a) * 10 - fx * 12, Math.sin(a) * 10, -fz * 12, 0.6, 0.4, 1, "#ffffff", yaw);
        }
      }
      // (how fast we're going, so the fire streams out ahead of the snout)
      if (lastPos.ok) {
        velX += ((f.pos.x - lastPos.x) / Math.max(dt, 1e-3) - velX) * Math.min(1, dt * 6);
        velZ += ((f.pos.z - lastPos.z) / Math.max(dt, 1e-3) - velZ) * Math.min(1, dt * 6);
      }
      // fire breath: a stream of sparkly puffs from the snout
      if (fireT >= 0) {
        fireT += dt;
        const [sy, sz] = dragonSnout(breed);
        const sc = mountScale("dragon", breed);
        V.set(0, sy * sc, sz * sc + 0.6);
        m.root.localToWorld(V);
        const n = fireT < 1.1 ? (low ? 2 : 4) : 0;
        for (let i = 0; i < n; i++) {
          const spread = 0.25;
          const a = yaw + (Math.random() - 0.5) * spread;
          const sp = 18 + Math.random() * 8;
          emit(V.x, V.y, V.z, velX + Math.sin(a) * sp, (Math.random() - 0.35) * 3 - pitch * 8, velZ + Math.cos(a) * sp, 0.8 + Math.random() * 0.4, 1.5 + Math.random() * 0.9, 0, FIRE[(Math.random() * FIRE.length) | 0]);
        }
        if (fireT > 1.6) fireT = -1;
      }
      lastPos.x = f.pos.x;
      lastPos.y = f.pos.y;
      lastPos.z = f.pos.z;
      lastPos.yaw = yaw;
      lastPos.ok = true;
    },
    update(dt, t, o) {
      if (!o.riding) lastPos.ok = false;
      // clouds drift slowly round; burst when a dragon flies through; puff back up later
      for (let i = 0; i < CLOUD_N; i++) {
        const c = clouds[i];
        c.a += c.s * dt;
        c.x = Math.sin(c.a) * c.d;
        c.z = Math.cos(c.a) * c.d;
        if (c.pop > 0) {
          c.pop += dt;
          if (c.pop > 24) c.pop = 0;
        } else if (o.riding && Math.hypot(o.pos.x - c.x, (o.pos.y - c.y) * 1.3, o.pos.z - c.z) < c.r * 1.6) {
          c.pop = 0.001;
          for (let k = 0; k < (low ? 8 : 18); k++) {
            const a = k * 2.4;
            const e = (k % 5) / 5 - 0.4;
            emit(c.x, c.y, c.z, Math.cos(a) * 9, e * 10, Math.sin(a) * 9, 1.1, 1.2 + (k % 3) * 0.5, 2, BIT[k % BIT.length]);
          }
        }
        // popping: shrink away fast; coming back: grow slowly
        const k = c.pop <= 0 ? 1 : c.pop < 0.35 ? 1 - c.pop / 0.35 : c.pop > 20 ? (c.pop - 20) / 4 : 0;
        const sc = Math.max(0.001, k) * c.r * (1 + Math.sin(t * 0.5 + i) * 0.03);
        P.set(c.x, c.y, c.z);
        E.set(0, c.a * 3 + i, 0);
        Q.setFromEuler(E);
        S.set(sc * 1.3, sc * 0.75, sc);
        M.compose(P, Q, S);
        cloudMesh.setMatrixAt(i, M);
      }
      cloudMesh.instanceMatrix.needsUpdate = true;
      if (cloudMesh.instanceColor) cloudMesh.instanceColor.needsUpdate = true;
      // (clouds out of sight below the sea / when far: always cheap, 1 draw)
      cloudMesh.visible = o.pos.y > WATER_Y - 2;
      let n = 0;
      for (let i = 0; i < PUFF_N; i++) {
        const p = puffs[i];
        if (!p.on) {
          M.makeScale(0, 0, 0);
          puffMesh.setMatrixAt(i, M);
          continue;
        }
        p.age += dt;
        if (p.age >= p.life) {
          p.on = false;
          M.makeScale(0, 0, 0);
          puffMesh.setMatrixAt(i, M);
          continue;
        }
        const drag = p.kind === 0 ? 0.7 : p.kind === 2 ? 2 : 0;
        p.vx -= p.vx * Math.min(1, drag * dt);
        p.vz -= p.vz * Math.min(1, drag * dt);
        p.vy += (p.kind === 0 ? 2.5 : p.kind === 2 ? -1 : 0) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const u = p.age / p.life;
        const grow = p.kind === 0 ? 0.6 + u * 1.8 : p.kind === 2 ? 1 + u * 0.6 : 1;
        const fade = Math.sin(Math.min(1, u * 1.15) * Math.PI) ** 0.6;
        const sc = p.size * grow * fade;
        P.set(p.x, p.y, p.z);
        if (p.kind === 1) {
          E.set(0, p.yaw, 0);
          Q.setFromEuler(E);
          S.set(sc * 0.12, sc * 0.12, sc * 6);
        } else {
          E.set(t * 3 + i, t * 2 + i, 0);
          Q.setFromEuler(E);
          S.set(sc, sc, sc);
        }
        M.compose(P, Q, S);
        puffMesh.setMatrixAt(i, M);
        n++;
      }
      puffMesh.count = PUFF_N;
      puffMesh.visible = n > 0;
      puffMesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      group.removeFromParent();
      cloudGeo.dispose();
      cloudMat.dispose();
      cloudMesh.dispose();
      puffGeo.dispose();
      puffMat.dispose();
      puffMesh.dispose();
    },
  };
}

/** merge a few plain geometries (position + normal only) */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  const flat = parts.map((g) => {
    const f = g.index ? g.toNonIndexed() : g;
    n += f.attributes.position.count;
    return f;
  });
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const f of flat) {
    pos.set(f.attributes.position.array as Float32Array, o * 3);
    nor.set(f.attributes.normal.array as Float32Array, o * 3);
    o += f.attributes.position.count;
  }
  for (const g of parts) g.dispose();
  for (const f of flat) f.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}
