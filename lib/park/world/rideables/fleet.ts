// The boats and submarines moored round the ocean (lib/park/registry/harbours) and everything that
// makes them feel alive, drawn cheaply:
//   - every idle boat / sub: ONE BatchedMesh (all six kinds' frozen rigs, one draw call), bobbing
//     and rocking on the same swell as the ocean surface
//   - the subs' glass bubbles: one InstancedMesh
//   - headlight beams (a soft cone + a pool of light where it meets the rocks): one InstancedMesh,
//     for the sub you're driving (always on under water) and the moored subs at night
//   - the wake behind the boat you're driving (a foam V + churn): one dynamic ribbon mesh
//   - bow spray when you go fast, bubbles from a sub's propeller: one InstancedMesh of droplets
//   - the new docks (Candy Harbour's jetty, Frostpeak's ice dock, the Rift Dock pontoon and its
//     beacon): one merged static mesh on the mounts' toon material
// = 6 draw calls at most, all allocation-free per frame.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MOUNT_BODY, mountMaterial, mountStatueGeometry, type BoatKind, type MountKind, type SubKind, isSub } from "../../characters/mounts";
import { CRAFT_GLASS, CRAFT_LAMPS, CRAFT_PROP, craftGlassMaterial } from "../../characters/boats";
import { HARBOUR_DECKS, MOORINGS, RIFT_DOCK, worldFloorY } from "../../registry/harbours";
import { WATER_Y } from "../../registry/terrain";
import { seaSurfaceY } from "./craft";

export type CraftKind = BoatKind | SubKind;

/** what the fleet needs to know about each idle craft (owned by the rideables) */
export interface CraftView {
  kind: CraftKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  /** drawn (moored / drifting) — false while it's being ridden or away */
  shown: boolean;
}

/** the craft being driven right now (the rig is the engine's; the fleet adds wake, spray, bubbles, beams) */
export interface DrivenCraft {
  kind: MountKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  /** m/s */
  speed: number;
}

export interface Fleet {
  update(dt: number, t: number, o: { crafts: CraftView[]; driven: DrivenCraft | null; glow: number; under: boolean }): void;
  dispose(): void;
}

const CRAFT_KINDS: CraftKind[] = ["pedalo", "sailboat", "speedboat", "ship", "sub", "deepsub"];
const WAKE_N = 40;
const PART_N = 72;
const BEAM_N = 8;

// ── the docks: planks, posts, lamps, a striped harbour beacon, the rift pontoon ──
function buildDocks(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const col = new THREE.Color();
  const add = (g: THREE.BufferGeometry, c: string, m: THREE.Matrix4, glow = 0) => {
    const src = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(src.attributes)) if (k !== "position" && k !== "normal") src.deleteAttribute(k);
    src.applyMatrix4(m);
    const n = src.attributes.position.count;
    col.set(c);
    const cc = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) ((cc[i * 3] = col.r), (cc[i * 3 + 1] = col.g), (cc[i * 3 + 2] = col.b));
    src.setAttribute("color", new THREE.BufferAttribute(cc, 3));
    src.setAttribute("glow", new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1));
    parts.push(src);
    if (src !== g) g.dispose();
  };
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const E = new THREE.Euler();
  const S = new THREE.Vector3();
  const at = (x: number, y: number, z: number, yaw = 0, sx = 1, sy = 1, sz = 1, pitch = 0) => {
    E.set(pitch, yaw, 0, "YXZ");
    Q.setFromEuler(E);
    S.set(sx, sy, sz);
    return M.compose(new THREE.Vector3(x, y, z), Q, S);
  };
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 8);
  const ball = new THREE.SphereGeometry(1, 8, 6);
  for (const d of HARBOUR_DECKS) {
    const ice = d.dock === "frost-dock";
    const woodA = ice ? "#dff2ff" : "#e0a860";
    const woodB = ice ? "#bfe0f4" : "#c98a48";
    const postC = ice ? "#9fc8e8" : "#a8703a";
    const capA = ice ? "#ffffff" : "#ff7ab8";
    if (d.r !== undefined) {
      // the Rift Dock: a round deck on barrel floats, a rail of posts, the beacon buoy
      const y = d.ya;
      add(new THREE.CylinderGeometry(d.r, d.r, 0.4, 24), "#e8b878", at(d.ax, y - 0.2, d.az));
      add(new THREE.CylinderGeometry(d.r + 0.08, d.r + 0.08, 0.12, 24), "#ffd36b", at(d.ax, y - 0.02, d.az));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add(cyl, i % 2 ? "#ffd23c" : "#ff5a4a", at(d.ax + Math.sin(a) * (d.r - 0.6), y - 0.75, d.az + Math.cos(a) * (d.r - 0.6), a, 0.55, 0.9, 0.55, Math.PI / 2));
      }
      // the beacon on the home side (out of the way of the moorings)
      const bx = d.ax + Math.sin(RIFT_DOCK.a) * (d.r - 1.0);
      const bz = d.az + Math.cos(RIFT_DOCK.a) * (d.r - 1.0);
      for (let k = 0; k < 6; k++) add(cyl, k % 2 ? "#ffffff" : "#ff4a5a", at(bx, y + 0.45 + k * 0.85, bz, 0, 0.42 - k * 0.02, 0.85, 0.42 - k * 0.02));
      add(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 12), "#3a3040", at(bx, y + 5.6, bz));
      add(ball, "#fff2a0", at(bx, y + 6.1, bz, 0, 0.42, 0.5, 0.42), 1);
      add(new THREE.ConeGeometry(0.55, 0.5, 12), "#ff4a5a", at(bx, y + 6.8, bz));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        add(cyl, "#3a3040", at(bx + Math.sin(a) * 0.45, y + 6.1, bz + Math.cos(a) * 0.45, 0, 0.04, 0.9, 0.04));
      }
      // candy posts round the edge (gaps where the craft moor), and planks across
      const gaps = MOORINGS.filter((m) => m.dock === d.dock).map((m) => Math.atan2(m.x - d.ax, m.z - d.az));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        if (gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.5)) continue;
        const px = d.ax + Math.sin(a) * (d.r - 0.2);
        const pz = d.az + Math.cos(a) * (d.r - 0.2);
        add(cyl, "#a8703a", at(px, y + 0.3, pz, 0, 0.13, 0.6, 0.13));
        add(ball, i % 2 ? "#ff7ab8" : "#ffffff", at(px, y + 0.65, pz, 0, 0.18, 0.13, 0.18));
      }
      for (let i = -3; i <= 3; i++) add(box, "#d89a58", at(d.ax + Math.cos(RIFT_DOCK.a) * i * 1.25, y + 0.005, d.az - Math.sin(RIFT_DOCK.a) * i * 1.25, RIFT_DOCK.a, 0.08, 0.02, Math.sqrt(Math.max(0, d.r * d.r - (i * 1.25) ** 2)) * 2 - 0.2));
      // two lamps on the deck edge, and a sign-flag
      for (const s of [-1, 1]) {
        const a = RIFT_DOCK.a + s * 1.4;
        const lx = d.ax + Math.sin(a) * (d.r - 0.35);
        const lz = d.az + Math.cos(a) * (d.r - 0.35);
        add(cyl, "#3a3040", at(lx, y + 0.8, lz, 0, 0.07, 1.6, 0.07));
        add(ball, "#fff2a0", at(lx, y + 1.7, lz, 0, 0.22, 0.22, 0.22), 1);
      }
      continue;
    }
    // a straight deck: planks across, posts down to the sea floor either side, candy caps
    const ux = d.bx - d.ax;
    const uz = d.bz - d.az;
    const L = Math.hypot(ux, uz);
    const yaw = Math.atan2(ux, uz);
    const slope = Math.atan2(d.yb - d.ya, L);
    const n = Math.max(1, Math.round(L / 0.62));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const x = d.ax + ux * u;
      const z = d.az + uz * u;
      const y = d.ya + (d.yb - d.ya) * u;
      add(box, i % 2 ? woodA : woodB, at(x, y - 0.1, z, yaw, d.half * 2 + 0.05, 0.2, (L / n) * 0.9, -slope));
    }
    // two stringers under the planks
    for (const s of [-1, 1]) {
      const px = Math.cos(yaw) * s * (d.half - 0.15);
      const pz = -Math.sin(yaw) * s * (d.half - 0.15);
      add(box, postC, at(d.ax + ux / 2 + px, (d.ya + d.yb) / 2 - 0.3, d.az + uz / 2 + pz, yaw, 0.18, 0.22, L, -slope));
    }
    const np = Math.max(1, Math.round(L / 3.2));
    for (let i = 0; i <= np; i++) {
      const u = i / np;
      const cx = d.ax + ux * u;
      const cz = d.az + uz * u;
      const y = d.ya + (d.yb - d.ya) * u;
      if (d.kind === "ramp" && i === 0) continue;
      for (const s of [-1, 1]) {
        const px = cx + Math.cos(yaw) * s * (d.half + 0.08);
        const pz = cz - Math.sin(yaw) * s * (d.half + 0.08);
        const fl = Math.min(y - 0.2, worldFloorY(px, pz));
        const top = y + 0.55;
        add(cyl, postC, at(px, (fl + top) / 2, pz, 0, 0.17, top - fl, 0.17));
        add(ball, (i + (s > 0 ? 1 : 0)) % 2 ? capA : "#ffffff", at(px, top + 0.06, pz, 0, 0.22, 0.16, 0.22));
      }
    }
    // lamps at the T-head's ends, and the striped harbour beacon on the end of Candy Harbour
    if (d.kind === "head") {
      for (const s of [-1, 1]) {
        const lx = d.ax + (s > 0 ? ux : 0) + Math.sin(yaw + Math.PI / 2) * 0;
        const lz = d.az + (s > 0 ? uz : 0);
        const px = lx - Math.sin(yaw) * s * 0.3;
        const pz = lz - Math.cos(yaw) * s * 0.3;
        add(cyl, "#3a3040", at(px, d.ya + 1.2, pz, 0, 0.08, 2.4, 0.08));
        add(ball, "#fff2a0", at(px, d.ya + 2.55, pz, 0, 0.26, 0.3, 0.26), 1);
        add(new THREE.ConeGeometry(0.34, 0.3, 8), "#3a3040", at(px, d.ya + 2.9, pz));
      }
      if (d.dock === "candy-harbour") {
        // (a tall candy-striped beacon: you can spot the harbour from far along the beach)
        const fx = Math.sin(yaw + Math.PI / 2);
        const fz = Math.cos(yaw + Math.PI / 2);
        const bx = d.ax + ux / 2 + fx * (d.half - 0.5) * 0;
        const bz = d.az + uz / 2 + fz * 0;
        const cx = bx - Math.cos(yaw) * 0 + Math.sin(yaw) * 0;
        for (let k = 0; k < 8; k++) add(cyl, k % 2 ? "#ffffff" : "#ff5fa8", at(cx, d.ya + 0.5 + k * 0.9, bz, 0, 0.38 - k * 0.015, 0.9, 0.38 - k * 0.015));
        add(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 12), "#3a3040", at(cx, d.ya + 7.7, bz));
        add(ball, "#fff2a0", at(cx, d.ya + 8.25, bz, 0, 0.5, 0.6, 0.5), 1);
        add(new THREE.ConeGeometry(0.7, 0.7, 12), "#ff5fa8", at(cx, d.ya + 9.1, bz));
        add(new THREE.OctahedronGeometry(0.3, 0), "#ffe36b", at(cx, d.ya + 9.75, bz), 1);
      }
    }
    // a candy arch over the start of Candy Harbour's ramp / the ice dock's
    if (d.kind === "ramp") {
      const ax = d.ax + ux * 0.15;
      const az = d.az + uz * 0.15;
      const y0 = d.ya;
      for (const s of [-1, 1]) {
        const px = ax + Math.cos(yaw) * s * (d.half + 0.35);
        const pz = az - Math.sin(yaw) * s * (d.half + 0.35);
        for (let k = 0; k < 4; k++) add(cyl, k % 2 ? "#ffffff" : ice ? "#6cc4ff" : "#ff5fa8", at(px, y0 + 0.45 + k * 0.9, pz, 0, 0.16, 0.9, 0.16));
      }
      add(box, ice ? "#6cc4ff" : "#ff5fa8", at(ax, y0 + 3.85, az, yaw, d.half * 2 + 1.4, 0.4, 0.3));
      add(new THREE.OctahedronGeometry(0.45, 0), "#ffe36b", at(ax, y0 + 4.5, az, yaw), 1);
    }
  }
  box.dispose();
  cyl.dispose();
  ball.dispose();
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

// ── the headlight beam: a soft cone with a pool of light at its end ──
function beamGeometry(): THREE.BufferGeometry {
  const cone = new THREE.ConeGeometry(1, 1, 18, 6, true);
  cone.translate(0, -0.5, 0);
  cone.rotateX(-Math.PI / 2);
  const disc = new THREE.CircleGeometry(1.15, 22);
  disc.rotateY(Math.PI);
  disc.translate(0, 0, 1);
  for (const [g, part] of [[cone, 0], [disc, 1]] as const) {
    g.deleteAttribute("uv");
    g.setAttribute("part", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
  }
  const g = mergeGeometries([cone.toNonIndexed(), disc.toNonIndexed()], false)!;
  cone.dispose();
  disc.dispose();
  return g;
}
function beamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: "craft:beam",
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float part;
      varying float vPart; varying vec3 vL; varying vec3 vC; varying float vF;
      void main() {
        vPart = part; vL = position;
        vC = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
        #endif
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        // soften the cone's silhouette edges (view-facing = brighter core). (Never normalize a
        // zero vector at the tip / the disc's centre: one NaN pixel and the bloom pass smears it
        // over the whole screen.)
        vec3 rd = mat3(modelMatrix) * mat3(instanceMatrix) * vec3(position.x, position.y, 0.0);
        float rl = length(rd);
        vec3 toCam = cameraPosition - wp.xyz;
        float cl = max(length(toCam), 1e-4);
        vF = rl > 1e-5 ? abs(dot(rd / rl, toCam / cl)) : 1.0;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying float vPart; varying vec3 vL; varying vec3 vC; varying float vF;
      void main() {
        float a;
        if (vPart < 0.5) a = pow(1.0 - clamp(vL.z, 0.0, 1.0), 1.4) * (0.15 + 0.85 * vF) * 0.32;
        else { float r = length(vL.xy) / 1.15; a = pow(max(0.0, 1.0 - r), 2.0) * 0.55; }
        gl_FragColor = vec4(vC * vec3(1.0, 0.93, 0.72) * clamp(a, 0.0, 1.0), 1.0);
      }`,
  });
}

export function buildFleet(scene: THREE.Group | THREE.Scene, opts: { lowQuality?: boolean; count: Partial<Record<CraftKind, number>> }): Fleet {
  const low = !!opts.lowQuality;
  const group = new THREE.Group();
  group.name = "fleet";
  scene.add(group);
  const disposables: { dispose(): void }[] = [];

  // ── idle craft: one BatchedMesh ──
  const geos = new Map<CraftKind, THREE.BufferGeometry>();
  let maxV = 0;
  let maxI = 0;
  for (const k of CRAFT_KINDS) {
    const n = opts.count[k] ?? 0;
    if (!n) continue;
    const g = mountStatueGeometry(k, "#ff5fa8");
    geos.set(k, g);
    maxV += g.attributes.position.count;
    maxI += n;
  }
  const batch = new THREE.BatchedMesh(Math.max(1, maxI), Math.max(3, maxV), 0, mountMaterial());
  batch.name = "fleet:craft";
  batch.frustumCulled = false;
  batch.sortObjects = false;
  const geoId = new Map<CraftKind, number>();
  for (const [k, g] of geos) geoId.set(k, batch.addGeometry(g));
  group.add(batch);
  disposables.push(batch);
  /** per craft view index -> instance id (assigned on first sight, then reused) */
  const inst: number[] = [];

  // ── glass bubbles for the moored subs ──
  const nSubs = (opts.count.sub ?? 0) + (opts.count.deepsub ?? 0);
  const glassGeo = new THREE.SphereGeometry(1, 22, 16);
  const glass = new THREE.InstancedMesh(glassGeo, craftGlassMaterial(), Math.max(1, nSubs));
  glass.name = "fleet:glass";
  glass.frustumCulled = false;
  glass.count = 0;
  glass.renderOrder = 3;
  group.add(glass);
  disposables.push(glass, glassGeo);

  // ── headlight beams ──
  const beamGeo = beamGeometry();
  const beamMat = beamMaterial();
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, BEAM_N);
  beams.name = "fleet:beams";
  beams.frustumCulled = false;
  beams.count = 0;
  beams.renderOrder = 4;
  beams.setColorAt(0, new THREE.Color(1, 1, 1));
  group.add(beams);
  disposables.push(beams, beamGeo, beamMat);

  // ── the wake: three ribbons (left arm, right arm, the churn behind) ──
  const wakePos = new Float32Array(WAKE_N * 2 * 3 * 3);
  const wakeCol = new Float32Array(WAKE_N * 2 * 3 * 4);
  const wakeIdx: number[] = [];
  for (let s = 0; s < 3; s++)
    for (let i = 0; i < WAKE_N - 1; i++) {
      const a = (s * WAKE_N + i) * 2;
      wakeIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  const wakeGeo = new THREE.BufferGeometry();
  wakeGeo.setAttribute("position", new THREE.BufferAttribute(wakePos, 3).setUsage(THREE.DynamicDrawUsage));
  wakeGeo.setAttribute("color", new THREE.BufferAttribute(wakeCol, 4).setUsage(THREE.DynamicDrawUsage));
  wakeGeo.setIndex(wakeIdx);
  const wakeMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const wake = new THREE.Mesh(wakeGeo, wakeMat);
  wake.name = "fleet:wake";
  wake.frustumCulled = false;
  wake.renderOrder = 2;
  // (visible until the first update, so the park's start-up shader compile warms it up)
  wake.visible = true;
  group.add(wake);
  disposables.push(wakeGeo, wakeMat);
  // the trail: a ring of stern samples (x, z, yaw, age, half-beam)
  const trail = new Float32Array(WAKE_N * 5);
  let trailHead = 0;
  let trailCount = 0;
  let trailT = 0;

  // ── spray + bubbles ──
  const partGeo = new THREE.IcosahedronGeometry(1, 0);
  const partMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  const parts = new THREE.InstancedMesh(partGeo, partMat, PART_N);
  parts.name = "fleet:droplets";
  parts.frustumCulled = false;
  parts.count = 0;
  parts.setColorAt(0, new THREE.Color(1, 1, 1));
  group.add(parts);
  disposables.push(parts, partGeo, partMat);
  // per particle: x y z vx vy vz life max size kind(0 spray, 1 bubble)
  const P = new Float32Array(PART_N * 10);
  let pNext = 0;
  let spawnAcc = 0;
  let bubbleAcc = 0;
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const spawn = (x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, kind: number) => {
    const o = pNext * 10;
    pNext = (pNext + 1) % PART_N;
    P[o] = x;
    P[o + 1] = y;
    P[o + 2] = z;
    P[o + 3] = vx;
    P[o + 4] = vy;
    P[o + 5] = vz;
    P[o + 6] = life;
    P[o + 7] = life;
    P[o + 8] = size;
    P[o + 9] = kind;
  };

  // ── the docks ──
  const dockGeo = buildDocks();
  const docks = new THREE.Mesh(dockGeo, mountMaterial());
  docks.name = "fleet:docks";
  docks.receiveShadow = true;
  group.add(docks);
  disposables.push(dockGeo);

  // scratch
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const E = new THREE.Euler(0, 0, 0, "YXZ");
  const V = new THREE.Vector3();
  const S = new THREE.Vector3();
  const L = new THREE.Vector3();
  const C = new THREE.Color();
  const WHITE = new THREE.Color(1, 1, 1);
  const BUBBLE = new THREE.Color("#c8f4ff");

  /** world position of a point in a craft's root space */
  const toWorld = (c: { x: number; y: number; z: number; yaw: number; pitch: number; roll: number }, lx: number, ly: number, lz: number, out: THREE.Vector3) => {
    E.set(c.pitch, c.yaw, c.roll, "YXZ");
    Q.setFromEuler(E);
    return out.set(lx, ly, lz).applyQuaternion(Q).add(V.set(c.x, c.y, c.z));
  };

  /** a headlight beam from lamp (lx, ly, lz) of craft c, as long as the water ahead is open */
  const addBeam = (c: { x: number; y: number; z: number; yaw: number; pitch: number; roll: number }, lx: number, ly: number, lz: number, power: number) => {
    if (beams.count >= BEAM_N || power <= 0.01) return;
    toWorld(c, lx, ly, lz, L);
    const sx = L.x;
    const sy = L.y;
    const sz = L.z;
    // aim: straight ahead, tipped down a little
    E.set(c.pitch + 0.16, c.yaw, c.roll, "YXZ");
    Q.setFromEuler(E);
    S.set(0, 0, 1).applyQuaternion(Q);
    const dx = S.x;
    const dy = S.y;
    const dz = S.z;
    let len = 34;
    for (let d = 2; d <= 34; d += 2) {
      const px = sx + dx * d;
      const py = sy + dy * d;
      const pz = sz + dz * d;
      if (py < worldFloorY(px, pz) + 0.3 || py > WATER_Y + 0.4) {
        len = Math.max(2, d - 0.8);
        break;
      }
    }
    const w = 0.5 + len * 0.2;
    E.set(c.pitch + 0.16, c.yaw, c.roll, "YXZ");
    Q.setFromEuler(E);
    V.set(sx, sy, sz);
    S.set(w, w, len);
    M.compose(V, Q, S);
    beams.setMatrixAt(beams.count, M);
    C.setRGB(power, power, power);
    beams.setColorAt(beams.count, C);
    beams.count++;
  };

  const updateWake = (dc: DrivenCraft | null, dt: number, t: number) => {
    // age the samples
    for (let i = 0; i < WAKE_N; i++) trail[i * 5 + 3] += dt;
    const surf = dc && dc.y > WATER_Y - 2.5;
    if (dc && surf && dc.speed > 1.2) {
      trailT -= dt;
      if (trailT <= 0) {
        trailT = 0.07;
        const [hl, hw, off] = MOUNT_BODY[dc.kind];
        const fx = Math.sin(dc.yaw);
        const fz = Math.cos(dc.yaw);
        const o = trailHead * 5;
        trail[o] = dc.x + fx * (off - hl * 0.85);
        trail[o + 1] = dc.z + fz * (off - hl * 0.85);
        trail[o + 2] = dc.yaw;
        trail[o + 3] = 0;
        trail[o + 4] = hw * 0.8 * Math.min(1, dc.speed / 8 + 0.3);
        trailHead = (trailHead + 1) % WAKE_N;
        trailCount = Math.min(WAKE_N, trailCount + 1);
      }
    }
    if (!trailCount) {
      wake.visible = false;
      return;
    }
    const LIFE = 2.6;
    let alive = false;
    // newest first: i = 0 is the latest sample
    for (let i = 0; i < WAKE_N; i++) {
      const si = (trailHead - 1 - i + WAKE_N * 2) % WAKE_N;
      const o = si * 5;
      const valid = i < trailCount;
      const age = valid ? trail[o + 3] : LIFE;
      const k = Math.max(0, 1 - age / LIFE);
      if (k > 0) alive = true;
      const x = trail[o];
      const z = trail[o + 1];
      const yaw = trail[o + 2];
      const hw = trail[o + 4];
      const px = Math.cos(yaw);
      const pz = -Math.sin(yaw);
      const y = valid ? seaSurfaceY(x, z, t) + 0.1 : WATER_Y;
      const spread = hw + age * 2.6;
      for (let s = 0; s < 3; s++) {
        // s 0 / 1: the V's two arms, spreading out as they age; s 2: the churned water right behind
        const side = s === 0 ? -1 : 1;
        const c = s < 2 ? side * spread : 0;
        const w = s < 2 ? 0.35 + age * 0.55 : hw * (0.9 + age * 0.5);
        const vi = (s * WAKE_N + i) * 2;
        const a = s < 2 ? k * k * 0.85 : k * 0.75;
        for (let e = 0; e < 2; e++) {
          const off = c + (e ? w : -w);
          const p = (vi + e) * 3;
          if (valid || i === 0) {
            wakePos[p] = x + px * off;
            wakePos[p + 1] = valid ? y : WATER_Y;
            wakePos[p + 2] = z + pz * off;
          } else {
            // (past the end of the trail: collapse onto the previous vertex)
            wakePos[p] = wakePos[p - 6];
            wakePos[p + 1] = wakePos[p - 5];
            wakePos[p + 2] = wakePos[p - 4];
          }
          const q = (vi + e) * 4;
          wakeCol[q] = 1;
          wakeCol[q + 1] = 1;
          wakeCol[q + 2] = 1;
          // fade at the ribbon's outer edges and its newest end (so it starts under the hull)
          wakeCol[q + 3] = valid ? a * (s < 2 ? (e ? 0.55 : 1) : 1) * Math.min(1, i / 2) : 0;
        }
      }
    }
    wake.visible = alive;
    if (!alive) trailCount = 0;
    (wakeGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (wakeGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  };

  const updateParticles = (dc: DrivenCraft | null, dt: number) => {
    if (dc) {
      const [hl, hw, off] = MOUNT_BODY[dc.kind];
      const fx = Math.sin(dc.yaw);
      const fz = Math.cos(dc.yaw);
      const atSurf = dc.y > WATER_Y - 2.2;
      // bow spray: the faster you go, the more it flies (the Rocket Boat throws up a lot)
      if (atSurf && !isSub(dc.kind) && dc.speed > 5) {
        spawnAcc += dt * Math.min(70, (dc.speed - 5) * (dc.kind === "speedboat" ? 3.2 : 1.6));
        while (spawnAcc >= 1) {
          spawnAcc -= 1;
          const side = rnd() < 0.5 ? -1 : 1;
          const along = off + hl * (0.35 + rnd() * 0.3);
          const bx = dc.x + fx * along + fz * side * hw * 0.9;
          const bz = dc.z + fz * along - fx * side * hw * 0.9;
          const out = 2 + rnd() * 3 + dc.speed * 0.12;
          spawn(bx, WATER_Y + 0.25, bz, fz * side * out - fx * dc.speed * 0.15, 2.4 + rnd() * 2.6 + dc.speed * 0.05, -fx * side * out - fz * dc.speed * 0.15, 0.6 + rnd() * 0.45, 0.08 + rnd() * 0.1, 0);
        }
      }
      // bubbles: from a sub's propeller (more when it's moving), and a few round the hull
      if (dc.y < WATER_Y - 0.5) {
        const pr = CRAFT_PROP[dc.kind as CraftKind];
        bubbleAcc += dt * (isSub(dc.kind) ? 6 + Math.min(20, dc.speed * 2) : 0);
        while (bubbleAcc >= 1 && pr) {
          bubbleAcc -= 1;
          toWorld(dc, pr[0] + (rnd() - 0.5) * 0.5, pr[1] + (rnd() - 0.5) * 0.5, pr[2] - 0.3, L);
          spawn(L.x, L.y, L.z, -fx * (0.5 + dc.speed * 0.2) + (rnd() - 0.5) * 0.4, 0.9 + rnd() * 0.8, -fz * (0.5 + dc.speed * 0.2) + (rnd() - 0.5) * 0.4, 2.2 + rnd() * 1.5, 0.07 + rnd() * 0.12, 1);
        }
      }
    }
    parts.count = 0;
    for (let i = 0; i < PART_N; i++) {
      const o = i * 10;
      if (P[o + 6] <= 0) continue;
      P[o + 6] -= dt;
      const bubble = P[o + 9] > 0.5;
      if (bubble) {
        // rise, wobble, pop at the surface
        P[o + 3] *= 1 - Math.min(1, dt * 1.5);
        P[o + 5] *= 1 - Math.min(1, dt * 1.5);
        P[o + 4] = Math.min(2.6, P[o + 4] + dt * 1.2);
        if (P[o + 1] > WATER_Y - 0.1) P[o + 6] = 0;
      } else {
        P[o + 4] -= 9.8 * dt;
        if (P[o + 1] < WATER_Y - 0.2) P[o + 6] = 0;
      }
      P[o] += P[o + 3] * dt;
      P[o + 1] += P[o + 4] * dt;
      P[o + 2] += P[o + 5] * dt;
      if (P[o + 6] <= 0) continue;
      const u = P[o + 6] / P[o + 7];
      const sc = P[o + 8] * (bubble ? 0.8 + 0.4 * (1 - u) : 0.4 + u * 0.8);
      V.set(P[o], P[o + 1] + (bubble ? Math.sin(P[o + 6] * 9 + i) * 0.03 : 0), P[o + 2]);
      Q.identity();
      S.set(sc, sc, sc);
      M.compose(V, Q, S);
      parts.setMatrixAt(parts.count, M);
      parts.setColorAt(parts.count, bubble ? BUBBLE : WHITE);
      parts.count++;
    }
    parts.visible = parts.count > 0;
    if (parts.count) {
      parts.instanceMatrix.needsUpdate = true;
      if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
    }
  };

  return {
    update(dt, t, o) {
      // ── idle craft ──
      const list = o.crafts;
      glass.count = 0;
      beams.count = 0;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const gid = geoId.get(c.kind);
        if (gid === undefined) continue;
        if (inst[i] === undefined) inst[i] = batch.addInstance(gid);
        const id = inst[i];
        batch.setVisibleAt(id, c.shown);
        if (!c.shown) continue;
        E.set(c.pitch, c.yaw, c.roll, "YXZ");
        Q.setFromEuler(E);
        V.set(c.x, c.y, c.z);
        S.set(1, 1, 1);
        M.compose(V, Q, S);
        batch.setMatrixAt(id, M);
        const gl = CRAFT_GLASS[c.kind];
        if (gl && glass.count < glass.instanceMatrix.count) {
          toWorld(c, gl.x, gl.y, gl.z, L);
          S.set(gl.r, gl.r, gl.r);
          M.compose(L, Q, S);
          glass.setMatrixAt(glass.count++, M);
        }
        // moored subs leave their headlights on at night (pretty across the water) and down deep
        const lamps = CRAFT_LAMPS[c.kind];
        if (lamps && !low) {
          const deep = c.y < WATER_Y - 3 ? 0.8 : 0;
          const pw = Math.max(deep, o.glow > 0.35 ? (o.glow - 0.35) * 0.9 : 0);
          for (const lp of lamps) addBeam(c, lp[0], lp[1], lp[2], pw);
        }
      }
      // ── the craft being driven ──
      const dc = o.driven;
      if (dc) {
        const lamps = CRAFT_LAMPS[dc.kind as CraftKind];
        if (lamps) {
          const under = WATER_Y - dc.y;
          const pw = under > 1.2 ? 0.55 + Math.min(0.6, under / 40) : Math.max(0.15, o.glow * 0.8);
          for (const lp of lamps) addBeam(dc, lp[0], lp[1], lp[2], pw);
        }
      }
      glass.visible = glass.count > 0;
      if (glass.count) glass.instanceMatrix.needsUpdate = true;
      beams.visible = beams.count > 0;
      if (beams.count) {
        beams.instanceMatrix.needsUpdate = true;
        if (beams.instanceColor) beams.instanceColor.needsUpdate = true;
      }
      updateWake(dc && !isSub(dc.kind) ? dc : dc && dc.y > WATER_Y - 1.5 ? dc : null, dt, t);
      updateParticles(dc, dt);
    },
    dispose() {
      group.removeFromParent();
      for (const d of disposables) d.dispose();
      for (const g of geos.values()) g.dispose();
    },
  };
}
