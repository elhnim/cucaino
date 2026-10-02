// Dino Isle, the Lost World far out in Cucaino Park's ocean: the island (ground, reef shallows, the
// lagoon, swamp, river, ford and waterfall), its places (the park gate, the plaza and research hut,
// the Rex Bridge across the T-rex's walled valley and its lookouts, the plains lookout and the
// river hide, the nests, the fossil dig, the volcano; the Ice Age valley over the land bridge with
// its glacier, ice cave, frozen pond and mammoth-bone camp), its true-size forests (./trees.ts)
// and its animals (./herd.ts): herds roaming the whole island on their daily round.
//
// Cheap by construction: ≤ 24 draw calls — one ground, one water, one merged mesh for every prop
// and deck, four instanced tree meshes, one fx mesh + two point sets, one far-herd mesh (./far.ts),
// and the full rigged species meshes only for the species with animals near the kid (at most
// NEAR_MESHES of them; the rest are drawn as far-herd beasts). Deterministic seeded placement
// (registry/dinoIsland.ts) and an allocation-free update.
import * as THREE from "three";
import { fxMaterial, makeUniforms } from "../fantasy/shaders";
import { DINO_ISLAND, DINO_SEA_R, DINO_SPECIES, DINO_SPOTS, DINO_SPOT_FACTS, dinoShoreDist, type DinoSpeciesId } from "../../registry/dinoIsland";
import { buildGroundGeometry, buildWater, seaWave } from "./terrain";
import { buildPropsGeometry } from "./props";
import { buildTrees } from "./trees";
import { addJungleCut, makeJungleCut } from "../jungle/cutaway";
import { buildFar, farShape, type FarShape } from "./far";
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
  raptor,
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
import { makeSim, pushKid, stepSim, type Animal, type DinoSim, type MeshId } from "./herd";

export interface DinoWorld {
  /**
   * One frame: the animals' day, fire and lava, discoveries. NOTE: it also keeps the kid out of the
   * animals' bodies — it may nudge `o.kid`'s x/z (the engine passes the kid's own position).
   */
  update(dt: number, t: number, o: { kid: THREE.Vector3; glow: number; hour: number }): { roar: boolean; spot: { id: string; name: string; text: string } | null };
  dispose(): void;
  /** the animals' simulation (read it in tests and the smoke harness) */
  readonly sim: DinoSim;
}

export interface DinoStats {
  drawCalls: number;
  triangles: number;
}

const X0 = DINO_ISLAND.x;
const Z0 = DINO_ISLAND.z;
/** hide the whole island when the kid is this far (m) off its coast (past the fog) */
const HIDE_D = 470;
/** how close (m) the kid must be to discover a place */
const SPOT_R = 9;
/** animals nearer than this (m, plus a little per metre of body) get their full rigged mesh */
const NEAR_D = 85;
/** at most this many full species meshes at once (the draw-call budget) */
export const NEAR_MESHES = 11;
/** far-herd beasts out to here (m) */
const FAR_D = 560;

/** sqrt(x² + z²) — not Math.hypot, which V8 doesn't inline (it boxes its result: garbage every call) */
const hyp = (x: number, z: number) => Math.sqrt(x * x + z * z);
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
  raptor,
  ptero: pteranodon,
  plesio: plesiosaur,
  mammoth,
  rhino: woollyRhino,
  sloth: groundSloth,
  elk: irishElk,
  sabre: sabreCat,
  bear: caveBear,
};
/** always drawn full (flying high / out at sea, few and cheap) */
const ALWAYS: Set<MeshId> = new Set(["ptero", "plesio"]);

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

  // ── every prop and deck: one mesh; the trees: four instanced meshes ──
  const PU = makeUniforms();
  PU.uSway.value = 0.12;
  const propGeo = track(buildPropsGeometry(low));
  const propMat = track(fxMaterial(PU, { roughness: 0.85, metalness: 0, flatShading: true }));
  const props = new THREE.Mesh(propGeo, propMat);
  props.name = "dino-props";
  props.castShadow = !low;
  props.receiveShadow = !low;
  group.add(props);
  // (the trees are cut away between the camera and the kid, and round the camera itself: the follow
  //  camera never ends up inside a giant's crown, and the kid always shows — the rainforest's cut)
  const cut = makeJungleCut();
  cut.uJR.value.set(2.6, 9, 8);
  const grabCam = (_r: THREE.WebGLRenderer, _s: THREE.Scene, cam: THREE.Camera) => void cut.uJCam.value.setFromMatrixPosition(cam.matrixWorld);
  const treeMat = track(addJungleCut(fxMaterial(PU, { roughness: 0.88, metalness: 0, flatShading: true }), cut));
  const trees = buildTrees(treeMat, low);
  for (const t of trees) {
    t.onBeforeRender = grabCam;
    group.add(t);
    disposables.push(t.geometry, { dispose: () => t.dispose() });
  }

  // ── the animals: one instanced mesh per species (the small ones share one), drawn when near ──
  const sim = makeSim(low);
  const time = { value: 0 };
  interface Herd3D {
    id: MeshId;
    m: THREE.InstancedMesh;
    a: RigInstances;
    animals: Animal[];
    /** each animal's far shape */
    far: FarShape[];
    coat: THREE.Color[];
    acc: THREE.Color[];
    /** this frame: the nearest animal's distance; each animal's near radius */
    near: number;
    nearR: Float32Array;
    full: boolean;
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
    m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
    const far = animals.map((q) => farShape(q.def.id as DinoSpeciesId, variants[id === "small" || id === "smallbeast" ? q.def.variant : 0]));
    const coat = animals.map((q) => new THREE.Color(q.def.coats[q.coat][0]).multiplyScalar(q.baby ? 1.08 : 1));
    const acc = animals.map((q) => new THREE.Color(q.def.coats[q.coat][1]));
    meshes.set(id, { id, m, a, animals, far, coat, acc, near: Infinity, full: false, nearR: new Float32Array(animals.map((q) => NEAR_D + (q.def.body[0] + q.def.body[1]) * q.scale * 0.8)) });
  }
  const HERDS = [...meshes.values()];
  const ORDER = HERDS.slice();
  // the far herds: one mesh
  const farN = sim.animals.filter((a) => !ALWAYS.has(a.def.mesh)).length;
  const FAR = buildFar(farN);
  FAR.mesh.boundingSphere = sphere;
  group.add(FAR.mesh);
  disposables.push(FAR);

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
    sim,
    update(dtIn, t, o) {
      const dt = Math.min(0.1, Math.max(0, dtIn));
      const off = dinoShoreDist(o.kid.x, o.kid.z);
      const visible = off < HIDE_D;
      group.visible = visible;
      result.roar = false;
      result.spot = null;
      if (!visible) {
        current = null;
        // (out of sight: the island's day still goes on, just coarsely)
        stepSim(sim, dtIn, t, o.hour, o.kid.x, o.kid.z, false);
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

      cut.uJKid.value.copy(o.kid);
      // ── the animals' day ──
      const near = off < 40;
      stepSim(sim, dtIn, t, o.hour, o.kid.x, o.kid.z, near, o.kid.y);
      // (they're solid: the kid can't walk into them)
      if (near) pushKid(sim, o.kid, o.kid.y);
      result.roar = sim.roared;
      // which species get their full meshes: the ones with animals nearest the kid
      for (let k = 0; k < HERDS.length; k++) {
        const h = HERDS[k];
        let best = Infinity;
        if (!ALWAYS.has(h.id))
          for (let i = 0; i < h.animals.length; i++) {
            const a = h.animals[i];
            const dx = a.x - o.kid.x;
            const dz = a.z - o.kid.z;
            const r = h.nearR[i];
            const d2 = dx * dx + dz * dz;
            // (only the sign matters: inside its near radius or not, and by how much for the ranking)
            const d = d2 < (r + 400) * (r + 400) ? Math.sqrt(d2) - r : 1e6;
            if (d < best) best = d;
          }
        h.near = ALWAYS.has(h.id) ? -1e9 : best;
      }
      // (insertion sort, allocation-free)
      for (let i = 1; i < ORDER.length; i++) {
        const v = ORDER[i];
        let j = i - 1;
        while (j >= 0 && ORDER[j].near > v.near) {
          ORDER[j + 1] = ORDER[j];
          j--;
        }
        ORDER[j + 1] = v;
      }
      let slots = NEAR_MESHES + ALWAYS.size;
      for (let k = 0; k < ORDER.length; k++) {
        const h = ORDER[k];
        h.full = h.near < 0 && slots > 0;
        if (h.full) slots--;
      }
      let nf = 0;
      for (let k = 0; k < HERDS.length; k++) {
        const h = HERDS[k];
        const A = h.a;
        let n = 0;
        for (let i = 0; i < h.animals.length; i++) {
          const a = h.animals[i];
          let y = a.y;
          if (a.def.id === "plesio") y = Math.max(y + seaWave(a.x, a.z, t) * 0.8, -3);
          const dx = a.x - o.kid.x;
          const dz = a.z - o.kid.z;
          const d2 = dx * dx + dz * dz;
          const full = h.full && (ALWAYS.has(h.id) || d2 < h.nearR[i] * h.nearR[i]);
          if (!full && (ALWAYS.has(h.id) || d2 > FAR_D * FAR_D || nf >= FAR.mesh.instanceMatrix.count)) continue;
          e.set(a.pitch, a.yaw, a.roll, "YXZ");
          m4.compose(vp.set(a.x - X0, y, a.z - Z0), q.setFromEuler(e), vs.setScalar(a.scale));
          if (full) {
            h.m.setMatrixAt(n, m4);
            h.m.setColorAt(n, h.coat[i]);
            const cb = h.acc[i];
            A.colB.setXYZW(n, cb.r, cb.g, cb.b, a.def.variant);
            A.anim.setXYZW(n, a.phase, a.gait, a.hy, a.hp);
            A.anim2.setXYZW(n, a.sway, a.jaw, a.baby, a.flap);
            A.anim3.setXYZW(n, a.rear, a.lie, a.ears, a.shake);
            n++;
          } else {
            // (far: the cheap beast, lying low if it's asleep)
            if (a.lie > 0.5) m4.compose(vp.set(a.x - X0, y - a.def.body[2] * a.scale * 0.3 * a.lie, a.z - Z0), q, vs.setScalar(a.scale));
            FAR.mesh.setMatrixAt(nf, m4);
            FAR.mesh.setColorAt(nf, h.coat[i]);
            const f = h.far[i];
            FAR.fa.setXYZW(nf, f.a[0], f.a[1], f.a[2], f.a[3]);
            FAR.fb.setXYZW(nf, f.b[0], f.b[1], f.b[2], f.b[3]);
            FAR.fc.setXYZW(nf, f.c[0], f.c[1], f.c[2], f.c[3]);
            FAR.fd.setXYZW(nf, f.d[0], f.d[1], f.d[2], f.d[3]);
            nf++;
          }
        }
        h.m.count = n;
        h.m.visible = n > 0;
        if (n) {
          h.m.instanceMatrix.needsUpdate = true;
          h.m.instanceColor!.needsUpdate = true;
          A.colB.needsUpdate = true;
          A.anim.needsUpdate = true;
          A.anim2.needsUpdate = true;
          A.anim3.needsUpdate = true;
        }
      }
      FAR.mesh.count = nf;
      FAR.mesh.visible = nf > 0;
      if (nf) {
        FAR.mesh.instanceMatrix.needsUpdate = true;
        FAR.mesh.instanceColor!.needsUpdate = true;
        FAR.fa.needsUpdate = true;
        FAR.fb.needsUpdate = true;
        FAR.fc.needsUpdate = true;
        FAR.fd.needsUpdate = true;
      }

      // ── fire, lava, smoke ──
      const fire = 0.3 + 0.7 * smooth(0.2, 0.7, glow);
      XU.uFire.value = fire;
      XU.uLava.value = 0.35 + 0.65 * glow;
      const tr = sim.trex;
      let napAt: typeof nap | null = null;
      if (sim.napping) {
        nap.x = tr.x + Math.sin(tr.yaw) * 3.4 * tr.scale;
        nap.y = tr.y + 3.0 * tr.scale;
        nap.z = tr.z + Math.cos(tr.yaw) * 3.4 * tr.scale;
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
          const d = hyp(s.x - o.kid.x, s.z - o.kid.z) - (s.id === current ? 3 : 0);
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
          const d = hyp(a.x - o.kid.x, a.z - o.kid.z) - (current === HERD_ID[a.def.id] ? 3 : 0);
          if (d < reach && d - reach < bestAD) {
            bestAD = d - reach;
            bestA = a;
          }
        }
        // (animals first when they're right there; places otherwise)
        if (bestA && (bestSpot < 0 || bestAD < -4)) {
          const sp = DINO_SPECIES[bestA.def.id];
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

/** the island's simulation, for tests (built the same way as the renderer's) */
export type { DinoSim };

/** draw calls and triangles the island adds right now (visible meshes, instances drawn) — the budget test / the harness */
export function dinoMeshStats(group: THREE.Object3D): DinoStats {
  let drawCalls = 0;
  let triangles = 0;
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh || (o as THREE.Points).isPoints) {
      const n = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
      if (n > 0) {
        drawCalls++;
        if (!(o as THREE.Points).isPoints) triangles += trisOf(m.geometry as THREE.BufferGeometry) * n;
      }
    }
    for (const c of o.children) walk(c);
  };
  walk(group);
  return { drawCalls, triangles };
}
