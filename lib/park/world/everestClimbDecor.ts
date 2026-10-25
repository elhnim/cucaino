// Small, cheap, STREAMED decorations along the real Climb Everest route (registry/everestRoute.ts):
// Camp 1-4 and the Icefall camp (tents + a flag each), two ladder bridges over crevasse cuts in the
// Icefall, and a short run of fixed-rope stakes on the ridge. Built only once the kid is actually
// near (same BUILD_R/DISPOSE_R idea as the Wildlands settlements, just far lighter: plain static
// meshes, no crowd/routine simulation — these are scenery the kid walks past while climbing, not a
// place villagers live).
import * as THREE from "three";
import { CLIMB_CAMP_U, CLIMB_LADDER_U, CLIMB_RIDGE_U, climbHeadingAtU, climbPointAtU } from "../registry/everestRoute";
import { groundY } from "../registry/terrain";

const BUILD_R = 90;
const DISPOSE_R = 140;

interface Spot {
  id: string;
  x: number;
  z: number;
  build: () => THREE.Object3D;
}

function disposeGroup(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) mat.dispose();
  });
}

const TENT_PAIRS: [string, string][] = [
  ["#e8893c", "#2a6a8a"],
  ["#c0392b", "#f2c23d"],
  ["#2a6a8a", "#e8893c"],
  ["#f2c23d", "#c0392b"],
  ["#e8893c", "#c0392b"],
];

function buildTentCluster(x: number, z: number, heading: number, [c1, c2]: [string, string]): THREE.Group {
  const g = new THREE.Group();
  g.name = "everest-camp";
  const y = groundY(x, z);
  g.position.set(x, y, z);
  g.rotation.y = heading;
  const ledge = new THREE.Mesh(new THREE.CircleGeometry(4.2, 14), new THREE.MeshStandardMaterial({ color: "#eef4fb", roughness: 0.9 }));
  ledge.rotation.x = -Math.PI / 2;
  ledge.position.y = -0.02;
  g.add(ledge);
  for (const [dx, hex] of [
    [-1.5, c1],
    [1.5, c2],
  ] as [number, string][]) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8 }));
    dome.position.set(dx, 0.1, 0.6);
    g.add(dome);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.0, 5), new THREE.MeshStandardMaterial({ color: "#8a6238" }));
  pole.position.set(0, 1.0, -1.4);
  g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.35), new THREE.MeshStandardMaterial({ color: "#e8485f", side: THREE.DoubleSide }));
  flag.position.set(0.33, 1.9, -1.4);
  g.add(flag);
  return g;
}

function buildLadderCrossing(x: number, z: number, heading: number): THREE.Group {
  const g = new THREE.Group();
  g.name = "everest-ladder";
  const y = groundY(x, z);
  g.position.set(x, y, z);
  g.rotation.y = heading;
  const gap = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 1.8), new THREE.MeshStandardMaterial({ color: "#163246" }));
  gap.position.set(0, -0.1, 0);
  g.add(gap);
  const ladderMat = new THREE.MeshStandardMaterial({ color: "#cfcfd6", metalness: 0.5, roughness: 0.4 });
  for (const s of [-0.45, 0.45]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 5), ladderMat);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 0.06, s * 0.55);
    g.add(rail);
  }
  for (let r = -1; r <= 1; r++) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 5), ladderMat);
    rung.rotation.x = Math.PI / 2;
    rung.position.set(r * 0.7, 0.06, 0);
    g.add(rung);
  }
  return g;
}

function buildRidgeStakes(): THREE.Group {
  const g = new THREE.Group();
  g.name = "everest-ridge-rope";
  const stakeMat = new THREE.MeshStandardMaterial({ color: "#8a6238" });
  const ropeMat = new THREE.MeshStandardMaterial({ color: "#e8485f" });
  const N = 8;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const u = CLIMB_RIDGE_U[0] + (CLIMB_RIDGE_U[1] - CLIMB_RIDGE_U[0]) * (i / N);
    const p = climbPointAtU(u);
    const heading = climbHeadingAtU(u);
    const sideX = Math.cos(heading) * 3.4;
    const sideZ = -Math.sin(heading) * 3.4;
    const x = p.x + sideX;
    const z = p.z + sideZ;
    const y = groundY(x, z);
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.4, 5), stakeMat);
    stake.position.set(x, y + 0.7, z);
    g.add(stake);
    pts.push(new THREE.Vector3(x, y + 1.25, z));
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b) || 0.01;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 4), ropeMat);
    rope.position.copy(mid);
    rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(rope);
  }
  return g;
}

function makeSpots(): Spot[] {
  const spots: Spot[] = [];
  for (let i = 1; i < CLIMB_CAMP_U.length - 1; i++) {
    const u = CLIMB_CAMP_U[i];
    const p = climbPointAtU(u);
    const heading = climbHeadingAtU(u);
    const pair = TENT_PAIRS[(i - 1) % TENT_PAIRS.length];
    spots.push({ id: `camp-${i}`, x: p.x, z: p.z, build: () => buildTentCluster(p.x, p.z, heading, pair) });
  }
  for (let i = 0; i < CLIMB_LADDER_U.length; i++) {
    const u = CLIMB_LADDER_U[i];
    const p = climbPointAtU(u);
    const heading = climbHeadingAtU(u) + Math.PI / 2;
    spots.push({ id: `ladder-${i}`, x: p.x, z: p.z, build: () => buildLadderCrossing(p.x, p.z, heading) });
  }
  const ridgeMidU = (CLIMB_RIDGE_U[0] + CLIMB_RIDGE_U[1]) / 2;
  const ridgeMid = climbPointAtU(ridgeMidU);
  spots.push({ id: "ridge-rope", x: ridgeMid.x, z: ridgeMid.z, build: () => buildRidgeStakes() });
  return spots;
}

export interface EverestClimbDecor {
  update(dt: number, t: number, o: { kid: THREE.Vector3 }): void;
  dispose(): void;
}

export function buildEverestClimbDecor(scene: THREE.Scene): EverestClimbDecor {
  const spots = makeSpots();
  const built = new Map<string, THREE.Object3D | null>();
  return {
    update(_dt, _t, o) {
      for (const spot of spots) {
        const d = Math.hypot(o.kid.x - spot.x, o.kid.z - spot.z);
        let obj = built.get(spot.id) ?? null;
        if (!obj && d < BUILD_R) {
          obj = spot.build();
          scene.add(obj);
          built.set(spot.id, obj);
        } else if (obj && d > DISPOSE_R) {
          scene.remove(obj);
          disposeGroup(obj);
          built.set(spot.id, null);
        }
      }
    },
    dispose() {
      for (const obj of built.values()) {
        if (!obj) continue;
        scene.remove(obj);
        disposeGroup(obj);
      }
      built.clear();
    },
  };
}
