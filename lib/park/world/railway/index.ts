// The Wildlands Railway in 3D (the route: ../../registry/railway.ts; the rails' heights:
// terrain.ts railHeights). The ~4.6 km of track is streamed like the ground: sections of rails,
// sleepers and ballast (red trestles wherever the track runs above the ground — the bridges over
// the Wild River and the outlet) are built a section a frame as the kid nears them and dropped when
// far; the five stations (platform, station house, a name board, lamps) are built when the kid's
// near one. The train — the park's steam engine and three carriages — runs the loop on its own,
// stopping a few seconds at every station; called to a platform it comes there (brought round out
// of sight if it's far off). The engine (ParkWorld) puts a riding kid in the first carriage.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { groundY, railY } from "../../registry/terrain";
import { buildPaintedBuilding } from "../paintedBuilding";
import type { PaintedBuilding } from "../../registry/paintedBuildings";
import { PLATFORM, RAIL_LENGTH, RAIL_POINTS, STATIONS, railAt, type Station } from "../../registry/railway";
import { CAR_COUNT, CAR_GAP, RIDE_CAR, trestleGeometry } from "../steamTrain";
import { createTrainKit } from "../trainModels";
import { labelSprite } from "@/lib/game3d/buildingKit";

/** the train's top speed and how hard it speeds up / brakes (units/s, units/s²) */
export const TRAIN_V = 24;
const ACCEL = 2.6;
const BRAKE = 3.2;
/** how long it waits at a station */
export const DWELL = 6;
/** sections of track (in rail points) and how far off they're drawn */
const SEC = 20;
const SHOW_R = 480;

export interface Railway {
  group: THREE.Group;
  /** the train: where it is along the loop, its speed, the station it's standing at (or null) */
  train: { s: number; v: number; at: Station | null; wait: number };
  /** stream the track round `focus`, run the train */
  update(dt: number, t: number, focus: THREE.Vector3): void;
  /** bring the train to this station and hold it there until `release` */
  call(st: Station): void;
  /** the kid is aboard (or walked away): the train is free to leave again */
  release(): void;
  /** keep the train standing where it is (a kid's boarding) / let it go on */
  hold(on: boolean): void;
  /** where car i (0 = the engine) is, and which way it faces */
  carPose(i: number, out: { x: number; y: number; z: number; yaw: number }): void;
  stats(): { sections: number; triangles: number };
  dispose(): void;
}

const tmpA = { x: 0, z: 0, dx: 0, dz: 1 };

export function buildRailway(scene: THREE.Scene, opts: { lowQuality?: boolean } = {}): Railway {
  const low = !!opts.lowQuality;
  const group = new THREE.Group();
  group.name = "wild-railway";
  scene.add(group);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, flatShading: true });
  const disposables: { dispose(): void }[] = [mat];

  // ── track sections ──
  const nSec = Math.ceil(RAIL_POINTS.length / SEC);
  const H = (i: number) => railY(railSOf(i));
  const sOf: number[] = [];
  {
    let acc = 0;
    for (let i = 0; i < RAIL_POINTS.length; i++) {
      sOf.push(acc);
      const a = RAIL_POINTS[i];
      const b = RAIL_POINTS[(i + 1) % RAIL_POINTS.length];
      acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
  }
  function railSOf(i: number) {
    return sOf[i % sOf.length];
  }
  const RAIL_COL = new THREE.Color("#6d6f7a");
  const SLEEPER_COL = new THREE.Color("#7a4f30");
  const BALLAST_COL = new THREE.Color("#a59a8a");
  // (every piece: position, normal and colour only, non-indexed, so they all merge)
  const clean = (g: THREE.BufferGeometry) => {
    const out = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(out.attributes)) if (k !== "position" && k !== "normal" && k !== "color") out.deleteAttribute(k);
    return out;
  };
  const paint = (g: THREE.BufferGeometry, c: THREE.Color) => {
    g = clean(g);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) col.set([c.r, c.g, c.b], k * 3);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  };
  const railBox = paint(new THREE.BoxGeometry(0.12, 0.14, 1), RAIL_COL);
  const sleeperBox = paint(new THREE.BoxGeometry(1.7, 0.12, 0.34), SLEEPER_COL);
  const ballast = paint(new THREE.BoxGeometry(3.2, 0.18, 1), BALLAST_COL);
  const trestle = clean(trestleGeometry());
  disposables.push(railBox, sleeperBox, ballast, trestle);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();

  function buildSection(k: number): THREE.Mesh {
    const parts: THREE.BufferGeometry[] = [];
    const put = (g: THREE.BufferGeometry, x: number, y: number, z: number, yaw: number, pitch: number, sx = 1, sy = 1, sz = 1) => {
      e.set(pitch, yaw, 0, "YXZ");
      m4.compose(v.set(x, y, z), q.setFromEuler(e), sc.set(sx, sy, sz));
      parts.push(g.clone().applyMatrix4(m4));
    };
    for (let i = k * SEC; i < Math.min(RAIL_POINTS.length, (k + 1) * SEC); i++) {
      const a = RAIL_POINTS[i];
      const b = RAIL_POINTS[(i + 1) % RAIL_POINTS.length];
      const ya = H(i);
      const yb = H(i + 1);
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const L = Math.hypot(dx, dz) || 1;
      const yaw = Math.atan2(dx, dz);
      const pitch = -Math.atan2(yb - ya, L);
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      const my = (ya + yb) / 2;
      const sx = dz / L;
      const sz = -dx / L;
      // ballast under, sleepers across, two rails on top
      const gy = groundY(mx, mz);
      if (my - gy < 1.2) put(ballast, mx, my - 0.12, mz, yaw, pitch, 1, 1, L + 0.05);
      for (let k2 = 0; k2 < 3; k2++) {
        const u = (k2 + 0.5) / 3;
        put(sleeperBox, a[0] + dx * u, ya + (yb - ya) * u + 0.02, a[1] + dz * u, yaw, 0);
      }
      for (const s of [-0.62, 0.62]) put(railBox, mx + sx * s, my + 0.14, mz + sz * s, yaw, pitch, 1, 1, L + 0.02);
      // up in the air (a bridge, a dip): a trestle every other point
      if (i % 2 === 0 && my - gy > 0.6) put(trestle, mx, gy, mz, yaw, 0, 1 + Math.min(1.2, (my - gy) * 0.03), my - gy, 1);
    }
    const geo = mergeGeometries(parts)!;
    for (const p of parts) p.dispose();
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `rail-section-${k}`;
    mesh.castShadow = !low;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    return mesh;
  }
  const sections = new Map<number, THREE.Mesh>();
  const secMid = Array.from({ length: nSec }, (_, k) => RAIL_POINTS[Math.min(RAIL_POINTS.length - 1, k * SEC + (SEC >> 1))]);

  // ── stations ──
  const STATION_HOUSE: PaintedBuilding = { place: "station", art: "station-house", w: 6.6, h: 4.4, d: 3.6, roofRise: 1.5, trim: "#f3e6cf" };
  const SIGNAL_BOX: PaintedBuilding = { place: "signal-box", art: "signal-box", w: 3.6, h: 3.6, d: 3.0, roofRise: 1.1, trim: "#f3e6cf" };
  const stationMeshes = new Map<string, THREE.Object3D>();
  const WALL = new THREE.Color("#f3e3c4");
  const ROOF = new THREE.Color("#c8452f");
  const PLAT = new THREE.Color("#c9b9a0");
  const POST = new THREE.Color("#5a4a3a");
  const LAMP = new THREE.Color("#ffe9a8");
  let platMat: THREE.MeshStandardMaterial | null = null;
  const platformMat = () => {
    if (platMat) return platMat;
    platMat = new THREE.MeshStandardMaterial({ color: "#d8cbb2", roughness: 0.9 });
    disposables.push(platMat);
    if (typeof document !== "undefined") {
      const t = new THREE.TextureLoader().load("/park-assets/buildings/platform-surface.webp");
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = low ? 2 : 8;
      disposables.push(t);
      platMat.map = t;
      platMat.color.set("#ffffff");
    }
    return platMat;
  };
  function buildStation(st: Station): THREE.Object3D {
    const g = new THREE.Group();
    g.name = `station-${st.id}`;
    const p = railAt(st.s, tmpA);
    const yaw = Math.atan2(p.dx, p.dz);
    const y = railY(st.s);
    const parts: THREE.BufferGeometry[] = [];
    const put = (geo: THREE.BufferGeometry, c: THREE.Color, lx: number, ly: number, lz: number, ry = 0) => {
      const gg = paint(geo, c);
      e.set(0, yaw + ry, 0);
      // (local x across the platform, z along it)
      const wx = st.x + Math.cos(yaw) * lx + Math.sin(yaw) * lz;
      const wz = st.z - Math.sin(yaw) * lx + Math.cos(yaw) * lz;
      m4.compose(v.set(wx, y + ly, wz), q.setFromEuler(e), sc.set(1, 1, 1));
      parts.push(gg.applyMatrix4(m4));
    };
    // the platform (its top level with the levelled ground: you walk straight on), a house at its
    // back with a red roof, lamps along its front, a name board
    put(new THREE.BoxGeometry(PLATFORM.depth, 0.8, PLATFORM.len), PLAT, 0, -0.62, 0);
    for (const lz of [-8, 0, 8]) {
      put(new THREE.CylinderGeometry(0.08, 0.1, 2.8, 6), POST, -1.6, 1.9, lz);
      put(new THREE.SphereGeometry(0.28, 8, 6), LAMP, -1.6, 3.4, lz);
    }
    for (const lz of [-4.5, 4.5]) put(new THREE.BoxGeometry(0.16, 3.2, 0.16), POST, 0.6, 2, lz - 6);
    put(new THREE.BoxGeometry(0.2, 1.1, 9.6), WALL, 0.6, 3.4, -6);
    const geo = mergeGeometries(parts)!;
    for (const pp of parts) pp.dispose();
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = !low;
    mesh.receiveShadow = true;
    g.add(mesh);
    // the station house and a signal box at the platform's back, in real painted artwork (cream
    // boards and crimson trim under a slate roof), their fronts to the track; and the platform's
    // stone flags with a white line along the edge
    const stand = (def: PaintedBuilding, lx: number, lz: number) => {
      const b = buildPaintedBuilding(def, { lowQuality: low });
      disposables.push(b);
      b.group.position.set(st.x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, y - 0.22, st.z - Math.sin(yaw) * lx + Math.cos(yaw) * lz);
      b.group.rotation.y = yaw - Math.PI / 2;
      g.add(b.group);
    };
    stand(STATION_HOUSE, 4.1, 1.6);
    stand(SIGNAL_BOX, 3.8, 8.6);
    {
      const flags = new THREE.PlaneGeometry(PLATFORM.depth, PLATFORM.len);
      flags.rotateX(-Math.PI / 2);
      const pos = flags.getAttribute("position");
      const uv = flags.getAttribute("uv") as THREE.BufferAttribute;
      // (the picture's white line lies along the track edge; it repeats down the platform)
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getZ(i) / PLATFORM.depth, 1 - (pos.getX(i) + PLATFORM.depth / 2) / PLATFORM.depth);
      const top = new THREE.Mesh(flags, platformMat());
      top.position.set(st.x, y - 0.205, st.z);
      top.rotation.y = yaw;
      top.receiveShadow = true;
      g.add(top);
    }
    const sign = labelSprite(`${st.emoji} ${st.name}`);
    sign.position.set(st.x + Math.cos(yaw) * 0.6 - Math.sin(yaw) * 6, y + 4.6, st.z - Math.sin(yaw) * 0.6 - Math.cos(yaw) * 6);
    sign.scale.multiplyScalar(1.3);
    g.add(sign);
    group.add(g);
    return g;
  }

  // ── the train ──
  // (the engine, the open excursion car the kid rides in, then coaches: ../trainModels)
  const trainKit = createTrainKit({ lowQuality: low });
  disposables.push(trainKit);
  const cars: THREE.Object3D[] = [];
  const bodies: THREE.Group[] = [];
  for (let i = 0; i < CAR_COUNT; i++) {
    const mesh = trainKit.build(i === 0 ? "loco" : i === RIDE_CAR ? "open" : "coach");
    bodies.push(mesh);
    mesh.position.y = -0.55;
    const g = new THREE.Group();
    g.add(mesh);
    g.name = i === 0 ? "wild-train-engine" : `wild-train-car-${i}`;
    group.add(g);
    cars.push(g);
  }
  const train = { s: STATIONS[0].s + 20, v: 0, at: null as Station | null, wait: 0 };
  let held = false;
  let calledTo: Station | null = null;
  const nextStation = (s: number) => {
    let best = STATIONS[0];
    let bd = Infinity;
    for (const st of STATIONS) {
      let d = st.s - s;
      if (d < 0.01) d += RAIL_LENGTH;
      if (d < bd) {
        bd = d;
        best = st;
      }
    }
    return { st: best, d: bd };
  };
  const pose = { x: 0, y: 0, z: 0, yaw: 0 };
  const carPose = (i: number, out: typeof pose) => {
    const s = train.s - i * CAR_GAP;
    const p = railAt(s, tmpA);
    out.x = p.x;
    out.z = p.z;
    out.y = railY(s) + 0.35;
    out.yaw = Math.atan2(p.dx, p.dz);
  };

  return {
    group,
    train,
    call(st) {
      calledTo = st;
      // (far off: brought round, out of sight, to come in to the platform)
      let d = st.s - train.s;
      if (d < 0) d += RAIL_LENGTH;
      if (train.at !== st && d > 320) {
        train.s = st.s - 160;
        train.v = TRAIN_V * 0.8;
        train.at = null;
      }
    },
    release() {
      calledTo = null;
    },
    hold(on) {
      held = on;
    },
    carPose,
    update(dt, _t, focus) {
      // run the train
      if (train.at) {
        if (!held) train.wait -= dt;
        if (train.wait <= 0 && !held && calledTo !== train.at) {
          train.at = null;
          train.s += 0.05;
        }
      } else {
        const ns = nextStation(train.s);
        const stopNeeded = ns.d < (train.v * train.v) / (2 * BRAKE) + 0.5;
        if (stopNeeded) train.v = Math.max(1.2, train.v - BRAKE * dt);
        else train.v = Math.min(TRAIN_V, train.v + ACCEL * dt);
        train.s += train.v * dt;
        if (ns.d <= train.v * dt + 0.3) {
          train.s = ns.st.s;
          train.v = 0;
          train.at = ns.st;
          train.wait = DWELL;
          if (calledTo === ns.st) calledTo = null;
        }
      }
      if (train.s > RAIL_LENGTH) train.s -= RAIL_LENGTH;
      if (!train.at) for (const b of bodies) trainKit.roll(b, train.v * dt);
      // place the cars (only matters when anyone could see them)
      for (let i = 0; i < CAR_COUNT; i++) {
        carPose(i, pose);
        cars[i].position.set(pose.x, pose.y, pose.z);
        cars[i].rotation.set(0, pose.yaw, 0);
        cars[i].visible = Math.hypot(pose.x - focus.x, pose.z - focus.z) < SHOW_R;
      }
      // stream the track: one new section a frame, nearest first
      let want = -1;
      let wd = Infinity;
      for (let k = 0; k < nSec; k++) {
        const m = secMid[k];
        const d = Math.hypot(m[0] - focus.x, m[1] - focus.z);
        const mesh = sections.get(k);
        if (d < SHOW_R) {
          if (mesh) mesh.visible = true;
          else if (d < wd) {
            wd = d;
            want = k;
          }
        } else if (mesh) {
          if (d > SHOW_R + 200) {
            group.remove(mesh);
            mesh.geometry.dispose();
            sections.delete(k);
          } else mesh.visible = false;
        }
      }
      if (want >= 0) sections.set(want, buildSection(want));
      // the stations: built when near, hidden when far
      for (const st of STATIONS) {
        const d = Math.hypot(st.x - focus.x, st.z - focus.z);
        let g = stationMeshes.get(st.id);
        if (!g && d < SHOW_R + 40) {
          g = buildStation(st);
          stationMeshes.set(st.id, g);
        }
        if (g) {
          g.visible = d < SHOW_R + 60;
          // (right up close — standing on the platform or sitting in the train at it — the name
          //  board would fill the screen: it is only shown from a little way off)
          for (const o of g.children) if (o instanceof THREE.Sprite) o.visible = Math.hypot(o.position.x - focus.x, o.position.z - focus.z) > 13;
        }
      }
    },
    stats() {
      let t2 = 0;
      for (const m of sections.values()) if (m.visible) t2 += m.geometry.attributes.position.count / 3;
      return { sections: sections.size, triangles: Math.round(t2) };
    },
    dispose() {
      scene.remove(group);
      for (const m of sections.values()) m.geometry.dispose();
      for (const g of stationMeshes.values())
        g.traverse((o) => {
          // (a station's name board is a sprite with its own canvas texture and material)
          if (o instanceof THREE.Sprite) {
            o.material.map?.dispose();
            o.material.dispose();
            return;
          }
          const mm = o as THREE.Mesh;
          if (mm.geometry) mm.geometry.dispose();
        });
      for (const d of disposables) d.dispose();
    },
  };
}
