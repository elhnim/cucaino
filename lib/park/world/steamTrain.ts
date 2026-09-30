// The Sky Railway: the Sky Coaster's track rebuilt as a storybook steam railway — two rails on
// sleepers carried by red timber trestles, a black-and-red steam locomotive puffing smoke, and
// open carriages so you can see who's riding. Procedural and instanced (a handful of draw calls).
// The cars are posed by buildPark (and the ride by the engine) along the same loop curve.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { groundY } from "../registry/terrain";

/** distance between car centres along the track (m) */
export const CAR_GAP = 5.4;
/** how many cars (the locomotive + carriages) */
export const CAR_COUNT = 4;
/** which car the kid rides in (the first carriage, just behind the engine) */
export const RIDE_CAR = 1;

export interface SteamTrain {
  /** index 0 is the locomotive (forward = +z) */
  cars: THREE.Object3D[];
  update(dt: number, t: number, speed: number): void;
  dispose(): void;
}

const smooth01 = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const flat = (c: string, rough = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, flatShading: true });

function part(geo: THREE.BufferGeometry, color: THREE.Color, m?: THREE.Matrix4): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (m) g.applyMatrix4(m);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([color.r, color.g, color.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.deleteAttribute("uv");
  return g;
}
const at = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

function wheels(color: THREE.Color, zs: number[]): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const z of zs) for (const x of [-0.78, 0.78]) out.push(part(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 10), color, at(x, 0.42, z, 0, 0, Math.PI / 2)));
  return out;
}

function locomotiveGeometry(): THREE.BufferGeometry {
  const black = new THREE.Color("#2a2a33");
  const red = new THREE.Color("#c8352b");
  const gold = new THREE.Color("#e8b64a");
  const dark = new THREE.Color("#3a3a44");
  const parts: THREE.BufferGeometry[] = [
    // chassis
    part(new THREE.BoxGeometry(1.7, 0.35, 5.2), dark, at(0, 0.75, 0)),
    // boiler along +z, with red bands
    part(new THREE.CylinderGeometry(0.72, 0.72, 3.3, 12), black, at(0, 1.55, 0.9, Math.PI / 2)),
    ...[0.1, 1.2, 2.3].map((z) => part(new THREE.CylinderGeometry(0.76, 0.76, 0.14, 12), red, at(0, 1.55, z, Math.PI / 2))),
    // smokebox front + chimney (flared) + dome
    part(new THREE.CylinderGeometry(0.74, 0.74, 0.3, 12), dark, at(0, 1.55, 2.6, Math.PI / 2)),
    part(new THREE.CylinderGeometry(0.34, 0.24, 0.9, 10), black, at(0, 2.55, 2.1)),
    part(new THREE.CylinderGeometry(0.44, 0.34, 0.22, 10), black, at(0, 3.05, 2.1)),
    part(new THREE.SphereGeometry(0.34, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), gold, at(0, 2.2, 0.8)),
    // cab with a roof, and a red cowcatcher
    part(new THREE.BoxGeometry(1.75, 1.7, 1.6), red, at(0, 1.75, -1.6)),
    part(new THREE.BoxGeometry(2.0, 0.16, 1.9), black, at(0, 2.68, -1.6)),
    part(new THREE.BoxGeometry(1.2, 0.5, 0.05), new THREE.Color("#ffe9a8"), at(0, 2.0, -0.78)),
    part(new THREE.ConeGeometry(0.9, 0.7, 4), red, at(0, 0.6, 2.85, Math.PI / 2, Math.PI / 4)),
    // headlamp
    part(new THREE.CylinderGeometry(0.18, 0.2, 0.25, 8), gold, at(0, 2.35, 2.72, Math.PI / 2)),
    ...wheels(red, [-1.6, 0.2, 1.6]),
  ];
  return mergeGeometries(parts)!;
}

function carriageGeometry(): THREE.BufferGeometry {
  const green = new THREE.Color("#2f6b4f");
  const cream = new THREE.Color("#f3e3bf");
  const red = new THREE.Color("#c8352b");
  const dark = new THREE.Color("#3a3a44");
  const wood = new THREE.Color("#8a5a36");
  // an open "observation" carriage: low walls so riders show, benches inside, a little canopy
  const parts: THREE.BufferGeometry[] = [
    part(new THREE.BoxGeometry(1.8, 0.3, 4.4), dark, at(0, 0.75, 0)),
    part(new THREE.BoxGeometry(1.8, 0.2, 4.4), wood, at(0, 0.95, 0)),
    // side walls (green with a cream band) and end walls
    ...[-0.85, 0.85].flatMap((x) => [part(new THREE.BoxGeometry(0.12, 0.7, 4.4), green, at(x, 1.4, 0)), part(new THREE.BoxGeometry(0.14, 0.14, 4.44), cream, at(x, 1.8, 0))]),
    ...[-2.15, 2.15].map((z) => part(new THREE.BoxGeometry(1.8, 0.7, 0.12), green, at(0, 1.4, z))),
    // benches
    ...[-1.2, 1.2].map((z) => part(new THREE.BoxGeometry(1.4, 0.35, 0.5), red, at(0, 1.2, z))),
    // (no canopy: from the chase camera it hid the riders)
    ...[-0.85, 0.85].flatMap((x) => [-2.15, 2.15].map((z) => part(new THREE.CylinderGeometry(0.07, 0.07, 0.35, 6), cream, at(x, 1.9, z)))),
    ...wheels(red, [-1.4, 1.4]),
  ];
  return mergeGeometries(parts)!;
}

/** A unit-height red trestle (legs splayed, cross beams and X braces), scaled in y to reach the deck. */
function trestleGeometry(): THREE.BufferGeometry {
  const red = new THREE.Color("#b83227");
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    // legs lean outwards towards the bottom
    const leg = new THREE.BoxGeometry(0.14, 1, 0.22);
    parts.push(part(leg, red, at(s * 0.98, 0.5, 0, 0, 0, s * 0.16)));
  }
  for (const y of [0.25, 0.55, 0.85, 1.0]) parts.push(part(new THREE.BoxGeometry(2.2 - y * 0.35, 0.05, 0.16), red, at(0, y, 0)));
  // X braces
  parts.push(part(new THREE.BoxGeometry(0.06, 1.25, 0.1), red, at(0, 0.5, 0, 0, 0, 0.9)));
  parts.push(part(new THREE.BoxGeometry(0.06, 1.25, 0.1), red, at(0, 0.5, 0, 0, 0, -0.9)));
  return mergeGeometries(parts)!;
}

export function buildSteamTrain(scene: THREE.Scene, loop: THREE.CatmullRomCurve3, lowQuality = false): SteamTrain {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d);
  const added: THREE.Object3D[] = [];
  const add = <T extends THREE.Object3D>(o: T) => (scene.add(o), added.push(o), o);
  const vcol = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }));
  const len = loop.getLength();
  const up = new THREE.Vector3(0, 1, 0);

  // ── rails, sleepers and a timber deck, following the loop ──
  const n = Math.round(len / 0.9);
  const pts = loop.getSpacedPoints(n);
  const side = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const railPts: [THREE.Vector3[], THREE.Vector3[]] = [[], []];
  for (let i = 0; i < n; i++) {
    loop.getTangentAt(i / n, tan);
    side.crossVectors(tan, up).normalize();
    railPts[0].push(pts[i].clone().addScaledVector(side, -0.62).setY(pts[i].y + 0.14));
    railPts[1].push(pts[i].clone().addScaledVector(side, 0.62).setY(pts[i].y + 0.14));
  }
  const railMat = track(flat("#6d6f7a", 0.4));
  for (const rp of railPts) {
    const c = new THREE.CatmullRomCurve3(rp, true);
    const m = add(new THREE.Mesh(track(new THREE.TubeGeometry(c, n * 2, 0.07, 5, true)), railMat));
    m.castShadow = true;
  }
  const sleeperGeo = track(new THREE.BoxGeometry(1.7, 0.12, 0.34));
  const sleepers = add(new THREE.InstancedMesh(sleeperGeo, track(flat("#7a4f30")), n));
  const q = new THREE.Quaternion();
  const mat = new THREE.Matrix4();
  const look = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    loop.getTangentAt(i / n, tan);
    look.lookAt(tan, new THREE.Vector3(), up);
    q.setFromRotationMatrix(look);
    mat.compose(pts[i], q, new THREE.Vector3(1, 1, 1));
    sleepers.setMatrixAt(i, mat);
  }
  sleepers.castShadow = true;
  sleepers.receiveShadow = true;

  // ── red trestles down to the ground wherever the track is up in the air ──
  const tGeo = track(trestleGeometry());
  const every = lowQuality ? 9 : 6.5;
  const nt = Math.floor(len / every);
  const trestles = add(new THREE.InstancedMesh(tGeo, track(flat("#b83227", 0.9)), nt));
  let used = 0;
  for (let i = 0; i < nt; i++) {
    const u = i / nt;
    const p = loop.getPointAt(u);
    const gy = groundY(p.x, p.z);
    const h = p.y - 0.05 - gy;
    if (h < 0.6) continue;
    loop.getTangentAt(u, tan);
    look.lookAt(tan, new THREE.Vector3(), up);
    q.setFromRotationMatrix(look);
    mat.compose(new THREE.Vector3(p.x, gy, p.z), q, new THREE.Vector3(1 + Math.min(1.2, h * 0.03), h, 1));
    trestles.setMatrixAt(used++, mat);
  }
  trestles.count = used;
  trestles.castShadow = true;

  // ── the train ──
  const locoGeo = track(locomotiveGeometry());
  const carGeo = track(carriageGeometry());
  const cars: THREE.Object3D[] = [];
  for (let i = 0; i < CAR_COUNT; i++) {
    const mesh = new THREE.Mesh(i === 0 ? locoGeo : carGeo, vcol);
    mesh.castShadow = true;
    mesh.position.y = -0.55; // wheels sit on the rails (the pose point is the rail line)
    const g = new THREE.Group();
    g.add(mesh);
    cars.push(add(g));
  }

  // ── smoke puffs from the chimney ──
  const NP = lowQuality ? 18 : 34;
  const puffGeo = track(new THREE.IcosahedronGeometry(0.42, 0));
  const puffMat = track(new THREE.MeshStandardMaterial({ color: "#f4f4f6", roughness: 1, flatShading: true, transparent: true, opacity: 0.92 }));
  const puffs = add(new THREE.InstancedMesh(puffGeo, puffMat, NP));
  puffs.frustumCulled = false;
  const pp = Array.from({ length: NP }, () => ({ x: 0, y: -999, z: 0, age: 99, life: 2.4, s: 1 }));
  let next = 0;
  let emit = 0;
  const chimney = new THREE.Vector3();
  const sc = new THREE.Vector3();

  return {
    cars,
    update(dt, _t, speed) {
      // puff faster when the train works hard
      emit -= dt;
      if (emit <= 0) {
        emit = Math.max(0.09, 0.32 - speed * 0.008);
        chimney.set(0, 3.2 - 0.55, 2.1).applyMatrix4(cars[0].matrixWorld);
        const p = pp[next];
        next = (next + 1) % NP;
        p.x = chimney.x;
        p.y = chimney.y;
        p.z = chimney.z;
        p.age = 0;
        p.life = 2 + Math.random() * 1.2;
        p.s = 0.45 + Math.random() * 0.35;
      }
      for (let i = 0; i < NP; i++) {
        const p = pp[i];
        p.age += dt;
        const k = p.age / p.life;
        if (k >= 1) {
          mat.makeScale(0, 0, 0);
        } else {
          p.y += dt * (1.4 - k);
          // grow, then shrink away (instanced puffs can't fade individually)
          const s = p.s * (0.6 + k * 1.8) * (1 - smooth01((k - 0.65) / 0.35));
          mat.compose(sc.set(p.x, p.y, p.z), q.identity(), new THREE.Vector3(s, s * 0.85, s));
        }
        puffs.setMatrixAt(i, mat);
      }
      puffs.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const o of added) scene.remove(o);
      for (const d of disposables) d.dispose();
    },
  };
}
