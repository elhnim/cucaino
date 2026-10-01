// Dino Isle, the Lost World far out in Cucaino Park's ocean: the island (ground, reef shallows, the
// lagoon, swamp, river and waterfall), its places (the park gate, the plaza and research hut, the
// T-rex paddock with its viewing platform, the lookout tower, the nests, the fossil dig, the
// volcano; the Ice Age valley with its glacier, ice cave, frozen pond and mammoth-bone camp) and
// its animals (./herd.ts): herds of long-necks, three-horns, plated and armoured dinosaurs, honking
// crested ones, scampering compys, soaring pteranodons, a plesiosaur round the shore and one big,
// grumpy, sleepy T-rex; woolly mammoths, woolly rhinos, giant ground sloths, glyptodons, Irish elk,
// sabre-toothed cats and cave bears; dodos, moa, a thylacine and a terror bird.
//
// Cheap by construction: ≤ 24 draw calls (one merged mesh for every prop and deck, one instanced
// mesh per species with the rig bending it in the vertex shader, one fx mesh, two point sets),
// deterministic seeded placement (registry/dinoIsland.ts), and an allocation-free update.
import * as THREE from "three";
import { fxMaterial, makeUniforms } from "../fantasy/shaders";
import { DINO_ISLAND, DINO_SEA_R, DINO_SPECIES, DINO_SPOTS, DINO_SPOT_FACTS, type DinoSpeciesId } from "../../registry/dinoIsland";
import { buildGroundGeometry, buildWater, seaWave } from "./terrain";
import { buildPropsGeometry } from "./props";
import { buildFx } from "./fx";
import { addRigInstanceAttrs, makeRigUniforms, rigDepthMaterial, rigMaterial, trisOf, type RigInstances, type V3 } from "./rig";
import {
  ankylosaurus,
  brachiosaurus,
  caveBear,
  compy,
  groundSloth,
  irishElk,
  mammoth,
  parasaurolophus,
  plesiosaur,
  pteranodon,
  sabreCat,
  smallAnimals,
  SMALL_DODO,
  SMALL_GLYPTO,
  SMALL_MOA,
  SMALL_TERROR,
  SMALL_THYLACINE,
  stegosaurus,
  trex,
  triceratops,
  woollyRhino,
  type SpeciesGeo,
} from "./species";
import { makeSim, stepSim, type Animal, type MeshId } from "./herd";

export interface DinoWorld {
  update(dt: number, t: number, o: { kid: THREE.Vector3; glow: number; hour: number }): { roar: boolean; spot: { id: string; name: string; text: string } | null };
  dispose(): void;
}

export interface DinoStats {
  drawCalls: number;
  triangles: number;
}

const X0 = DINO_ISLAND.x;
const Z0 = DINO_ISLAND.z;
/** hide the whole island beyond this distance from its centre (past the fog) */
const HIDE_D = 500;
/** how close (m) the kid must be to discover a place */
const SPOT_R = 9;

const smooth = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

const BUILDERS: Record<Exclude<MeshId, "small" | "smallbeast">, () => SpeciesGeo> = {
  brachio: brachiosaurus,
  trike: triceratops,
  stego: stegosaurus,
  para: parasaurolophus,
  ankylo: ankylosaurus,
  trex,
  compy,
  ptero: pteranodon,
  plesio: plesiosaur,
  mammoth,
  rhino: woollyRhino,
  sloth: groundSloth,
  elk: irishElk,
  sabre: sabreCat,
  bear: caveBear,
};

export function buildDinoIsland(scene: THREE.Scene, opts: { lowQuality?: boolean }): DinoWorld {
  const low = !!opts.lowQuality;
  const group = new THREE.Group();
  group.name = "dino-island";
  group.position.set(X0, 0, Z0);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);
  const sphere = new THREE.Sphere(new THREE.Vector3(0, 10, 0), DINO_SEA_R);

  // ── ground + water ──
  const groundGeo = track(buildGroundGeometry(low));
  const groundMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.96, metalness: 0 }));
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.name = "dino-ground";
  ground.receiveShadow = !low;
  group.add(ground);
  const WU = { uTime: { value: 0 }, uGlow: { value: 0 }, uFogColor: { value: new THREE.Color() }, uFogNear: { value: 150 }, uFogFar: { value: 430 } };
  const water = buildWater(low, WU);
  track(water.geometry);
  track(water.material as THREE.Material);
  group.add(water);

  // ── every prop and deck: one mesh ──
  const PU = makeUniforms();
  PU.uSway.value = 0.12;
  const propGeo = track(buildPropsGeometry(low));
  const propMat = track(fxMaterial(PU, { roughness: 0.85, metalness: 0, flatShading: true }));
  const props = new THREE.Mesh(propGeo, propMat);
  props.name = "dino-props";
  props.castShadow = !low;
  props.receiveShadow = !low;
  group.add(props);

  // ── the animals: one instanced mesh per species (the small ones share one) ──
  const sim = makeSim(low);
  const time = { value: 0 };
  interface Herd3D {
    m: THREE.InstancedMesh;
    a: RigInstances;
    animals: Animal[];
  }
  const meshes = new Map<MeshId, Herd3D>();
  const byMesh = new Map<MeshId, Animal[]>();
  for (const a of sim.animals) {
    const l = byMesh.get(a.def.mesh) ?? [];
    l.push(a);
    byMesh.set(a.def.mesh, l);
  }
  for (const [id, animals] of byMesh) {
    let geo: THREE.BufferGeometry;
    let variants: { neck: V3; head: V3; hip: V3 }[];
    if (id === "small" || id === "smallbeast") {
      const s = smallAnimals(id === "small" ? [SMALL_DODO, SMALL_MOA, SMALL_TERROR] : [SMALL_THYLACINE, SMALL_GLYPTO]);
      geo = s.geo;
      variants = s.variants;
    } else {
      const s = BUILDERS[id]();
      geo = s.geo;
      variants = [s];
    }
    track(geo);
    const U = makeRigUniforms(time, variants);
    const mat = track(rigMaterial(U));
    const m = new THREE.InstancedMesh(geo, mat, animals.length);
    m.name = `dino-${id}`;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = !low && id !== "ptero";
    m.customDepthMaterial = track(rigDepthMaterial(U));
    m.boundingSphere = sphere;
    m.frustumCulled = true;
    const a = addRigInstanceAttrs(m);
    group.add(m);
    meshes.set(id, { m, a, animals });
  }
  const HERDS = [...meshes.values()];
  // looks: per animal colours
  const coatC = new Map<Animal, THREE.Color>();
  const accC = new Map<Animal, THREE.Color>();
  for (const a of sim.animals) {
    const [c0, c1] = a.def.coats[a.coat];
    coatC.set(a, new THREE.Color(c0).multiplyScalar(a.baby ? 1.08 : 1));
    accC.set(a, new THREE.Color(c1));
  }
  // (set once: colours and variants never change)
  for (const h of HERDS) {
    h.animals.forEach((a, i) => {
      h.m.setColorAt(i, coatC.get(a)!);
      const cb = accC.get(a)!;
      h.a.colB.setXYZW(i, cb.r, cb.g, cb.b, a.def.variant);
    });
    if (h.m.instanceColor) h.m.instanceColor.needsUpdate = true;
    h.a.colB.needsUpdate = true;
  }

  // ── fx ──
  const XU = { uTime: { value: 0 }, uFire: { value: 0.3 }, uLava: { value: 0.4 }, uFogColor: { value: new THREE.Color() }, uFogNear: { value: 150 }, uFogFar: { value: 430 } };
  const fx = buildFx(XU, low);
  group.add(fx.flames, fx.glow, fx.smoke);
  disposables.push(fx);

  scene.add(group);

  // ── scratch (allocation-free update) ──
  const m4 = new THREE.Matrix4();
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const vp = new THREE.Vector3();
  const vs = new THREE.Vector3();
  const spot = { id: "", name: "", text: "" };
  const result: { roar: boolean; spot: { id: string; name: string; text: string } | null } = { roar: false, spot: null };
  const nap = { x: 0, y: 0, z: 0 };
  const kidXZ = { x: 0, z: 0 };
  const fxArgs: { glow: number; fire: number; nap: { x: number; y: number; z: number } | null; kid: { x: number; z: number } } = { glow: 0, fire: 0, nap: null, kid: kidXZ };
  let current: string | null = null;
  const FOG_U = [WU, XU];
  const speciesName = (id: DinoSpeciesId) => DINO_SPECIES[id];
  const HERD_ID = {} as Record<DinoSpeciesId, string>;
  for (const id of Object.keys(DINO_SPECIES) as DinoSpeciesId[]) HERD_ID[id] = `herd-${id}`;

  const setSpot = (id: string, name: string, text: string) => {
    spot.id = id;
    spot.name = name;
    spot.text = text;
    result.spot = spot;
    current = id;
  };

  return {
    update(dtIn, t, o) {
      const dt = Math.min(0.1, Math.max(0, dtIn));
      const dKid = Math.hypot(o.kid.x - X0, o.kid.z - Z0);
      const visible = dKid < HIDE_D;
      group.visible = visible;
      result.roar = false;
      result.spot = null;
      if (!visible) {
        current = null;
        return result;
      }
      const glow = o.glow;
      const fog = scene.fog as THREE.Fog | null;
      for (let u = 0; u < FOG_U.length; u++) {
        const U = FOG_U[u];
        if (fog) {
          U.uFogColor.value.copy(fog.color);
          U.uFogNear.value = fog.near;
          U.uFogFar.value = fog.far;
        }
        U.uTime.value = t;
      }
      WU.uGlow.value = glow;
      PU.uTime.value = t;
      PU.uGlowK.value = 0.06 + glow * 1.4;
      PU.uPulse.value = glow;
      time.value = t;

      // ── the animals' day ──
      const near = dKid < DINO_ISLAND.r + 40;
      stepSim(sim, dtIn, t, o.hour, o.kid.x, o.kid.z, near);
      result.roar = sim.roared;
      for (let k = 0; k < HERDS.length; k++) {
        const h = HERDS[k];
        const A = h.a;
        for (let i = 0; i < h.animals.length; i++) {
          const a = h.animals[i];
          let y = a.y;
          if (a.def.id === "plesio") y = Math.max(y + seaWave(a.x, a.z, t) * 0.8, -3);
          e.set(a.pitch, a.yaw, a.roll, "YXZ");
          m4.compose(vp.set(a.x - X0, y, a.z - Z0), q.setFromEuler(e), vs.setScalar(a.scale));
          h.m.setMatrixAt(i, m4);
          A.anim.setXYZW(i, a.phase, a.gait, a.hy, a.hp);
          A.anim2.setXYZW(i, a.sway, a.jaw, a.baby, a.flap);
          A.anim3.setXYZW(i, a.rear, a.lie, a.ears, a.shake);
        }
        h.m.instanceMatrix.needsUpdate = true;
        A.anim.needsUpdate = true;
        A.anim2.needsUpdate = true;
        A.anim3.needsUpdate = true;
      }

      // ── fire, lava, smoke ──
      const fire = 0.3 + 0.7 * smooth(0.2, 0.7, glow);
      XU.uFire.value = fire;
      XU.uLava.value = 0.35 + 0.65 * glow;
      const tr = sim.trex;
      let napAt: typeof nap | null = null;
      if (sim.napping) {
        nap.x = tr.x + Math.sin(tr.yaw) * 3.4;
        nap.y = tr.y + 3.0;
        nap.z = tr.z + Math.cos(tr.yaw) * 3.4;
        napAt = nap;
      }
      kidXZ.x = o.kid.x;
      kidXZ.z = o.kid.z;
      fxArgs.glow = glow;
      fxArgs.fire = fire;
      fxArgs.nap = napAt;
      fx.update(dt, t, fxArgs);

      // ── discoveries: a place, or an animal, close by ──
      if (near) {
        let bestD = Infinity;
        let bestSpot = -1;
        for (let i = 0; i < DINO_SPOTS.length; i++) {
          const s = DINO_SPOTS[i];
          const d = Math.hypot(s.x - o.kid.x, s.z - o.kid.z) - (s.id === current ? 3 : 0);
          if (d < SPOT_R && d < bestD) {
            bestD = d;
            bestSpot = i;
          }
        }
        let bestA: Animal | null = null;
        let bestAD = Infinity;
        for (let i = 0; i < sim.animals.length; i++) {
          const a = sim.animals[i];
          if (a.def.id === "ptero") continue;
          const reach = a.def.size * a.scale * 1.8 + 7;
          const d = Math.hypot(a.x - o.kid.x, a.z - o.kid.z) - (current === HERD_ID[a.def.id] ? 3 : 0);
          if (d < reach && d - reach < bestAD) {
            bestAD = d - reach;
            bestA = a;
          }
        }
        // (animals first when they're right there; places otherwise)
        if (bestA && (bestSpot < 0 || bestAD < -4)) {
          const sp = speciesName(bestA.def.id);
          setSpot(HERD_ID[bestA.def.id], sp.name, sp.fact);
        } else if (bestSpot >= 0) {
          const s = DINO_SPOTS[bestSpot];
          setSpot(s.id, s.name, DINO_SPOT_FACTS[s.id] ?? "");
        } else current = null;
      } else current = null;
      return result;
    },
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
      for (const h of HERDS) h.m.dispose();
    },
  };
}

/** draw calls and triangles the island adds (for the budget test / the harness) */
export function dinoMeshStats(group: THREE.Object3D): DinoStats {
  let drawCalls = 0;
  let triangles = 0;
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!(m as THREE.Mesh).isMesh && !(o as THREE.Points).isPoints) return;
    drawCalls++;
    const g = m.geometry as THREE.BufferGeometry;
    if ((o as THREE.Points).isPoints) return;
    const n = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
    triangles += trisOf(g) * n;
  });
  return { drawCalls, triangles };
}
