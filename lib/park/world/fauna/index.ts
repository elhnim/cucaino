// The land animals of Cucaino Park: deer herds at the forest edges, rabbits in the meadows, foxes
// (and a den of kits), squirrels up and down the trees, hedgehogs at dusk, horses and ponies in a
// paddock by the Pet Meadow, goats on the hillside, cows on a grassy slope, a duck family on the
// pond, frogs by the stream at twilight, owls with glowing eyes at night, a bear family fishing
// in the stream and turtles plodding across a trail.
//
// Placement is pure and seeded (./plan.ts), behaviour is pure, deterministic and allocation-free
// (./brain.ts), both tested. Each species is ONE instanced mesh whose legs, heads, ears, tails and
// wings are posed in the vertex shader (./rig.ts), so the whole menagerie is a dozen draw calls.
import * as THREE from "three";
import { groundY } from "../../registry/terrain";
import { planForest, planMeadows, type FreeFn, type Meadow } from "../storybook/plan";
import { buildForestTree } from "../storybook/geometry";
import { stepFauna, type FaunaEnv } from "./brain";
import { buildMeshGeometries, buildProps, trisOf } from "./geometry";
import { buildWalkGrid } from "./ground";
import { canopyOf, planFauna } from "./plan";
import { rigDepthMaterial, rigMaterial } from "./rig";
import { KIND_NAMES, K_OWL, MESHES, MESH_NAMES, M_BEAR, M_COW, M_DEER, M_HORSE, M_GOAT, type Agent, type KidSense, type TreeLite } from "./types";

export interface Fauna {
  update(dt: number, t: number, o: { kid: THREE.Vector3; glow: number }): void;
  /** hide while the camera's under the sea / far away */
  setVisible(v: boolean): void;
  dispose(): void;
}

export interface FaunaStats {
  animals: number;
  byKind: Record<string, number>;
  calls: number;
  tris: number;
  trisByMesh: Record<string, number>;
  buildMs: number;
}

export interface FaunaOptions {
  free: FreeFn;
  lowQuality?: boolean;
  /**
   * The storybook forest (trees + canopy grid + meadows), if the caller already has it — otherwise
   * it is re-planned here from `free` (deterministic: the same trees the storybook planted).
   */
  forest?: { trees: TreeLite[]; covered: Uint8Array; meadows: Meadow[] };
  /**
   * The park's round obstacles (tree trunks, windmills, rocks, ruins, buildings — buildPark's
   * `obstacles` list). Animals walk round them and don't make their homes by the big ones.
   */
  obstacles?: readonly { x: number; z: number; r: number }[];
}

/**
 * Sit each owl right on top of its tree's crown (the plan only knows the canopy's rough ellipsoid):
 * drop a ray onto the actual storybook tree model, a little way out toward the trail it faces.
 */
function perchOwls(agents: Agent[], trees: TreeLite[], low: boolean) {
  const models = new Map<number, THREE.Mesh>();
  const rc = new THREE.Raycaster();
  const from = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  for (const a of agents) {
    if (a.kind !== K_OWL || a.tree < 0) continue;
    const t = trees[a.tree];
    let m = models.get(t.kind);
    if (!m) {
      m = new THREE.Mesh(buildForestTree(t.kind, low));
      models.set(t.kind, m);
    }
    const d = canopyOf(t.kind).rx * 0.42;
    const ly = a.yaw - t.rot;
    rc.set(from.set(Math.sin(ly) * d, 30, Math.cos(ly) * d), down);
    const hit = rc.intersectObject(m, false)[0];
    if (!hit) continue;
    a.x = t.x + Math.sin(a.yaw) * d * t.s;
    a.z = t.z + Math.cos(a.yaw) * d * t.s;
    a.hx = a.x;
    a.hz = a.z;
    a.y = t.y - 0.15 * t.s + hit.point.y * t.s * t.sy - 0.06;
  }
  for (const m of models.values()) m.geometry.dispose();
}

/** big animals cast shadows (the small ones' would be a few pixels) */
const SHADOW_MESHES = new Set([M_DEER, M_HORSE, M_COW, M_BEAR, M_GOAT]);

export function buildFauna(scene: THREE.Scene, opts: FaunaOptions): Fauna {
  const t0 = typeof performance !== "undefined" ? performance.now() : 0;
  const low = !!opts.lowQuality;
  const free = opts.free;
  let forest = opts.forest;
  if (!forest) {
    const meadows = planMeadows(free, { count: low ? 6 : 8 });
    const f = planForest(free, { lowQuality: low, meadows });
    forest = { trees: f.trees, covered: f.covered, meadows };
  }
  const grid = buildWalkGrid(forest.covered, opts.obstacles);
  const plan = planFauna(free, grid, { trees: forest.trees, meadows: forest.meadows }, { lowQuality: low, obstacles: opts.obstacles });
  perchOwls(plan.agents, forest.trees, low);
  const env: FaunaEnv = { g: grid, trees: forest.trees, paddock: plan.paddock, agents: plan.agents, shores: plan.shores };

  const group = new THREE.Group();
  group.name = "fauna";
  const U = { uEye: { value: 0 } };
  const mat = rigMaterial(U);
  const depthMat = rigDepthMaterial();
  const geos = buildMeshGeometries();
  const meshes: (THREE.InstancedMesh | null)[] = [];
  const attrs: { a: THREE.InstancedBufferAttribute; b: THREE.InstancedBufferAttribute; c: THREE.InstancedBufferAttribute }[] = [];
  const c = new THREE.Color();
  let calls = 0;
  let tris = 0;
  const trisByMesh: Record<string, number> = {};
  const addRigAttrs = (geo: THREE.BufferGeometry, n: number) => {
    const mk = () => {
      const at = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
      at.setUsage(THREE.DynamicDrawUsage);
      return at;
    };
    const a = mk();
    const b = mk();
    const cc = mk();
    geo.setAttribute("iA", a);
    geo.setAttribute("iB", b);
    geo.setAttribute("iC", cc);
    return { a, b, c: cc };
  };
  for (let m = 0; m < MESHES; m++) {
    const n = plan.counts[m];
    const geo = geos[m];
    if (!n) {
      geo.dispose();
      meshes.push(null);
      attrs.push(null as never);
      continue;
    }
    const at = addRigAttrs(geo, n);
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.name = `fauna-${MESH_NAMES[m]}`;
    im.customDepthMaterial = depthMat;
    im.castShadow = !low && SHADOW_MESHES.has(m);
    im.receiveShadow = !low;
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(im);
    meshes.push(im);
    attrs.push(at);
    calls++;
    tris += trisOf(geo) * n;
    trisByMesh[MESH_NAMES[m]] = trisOf(geo) * n;
  }
  for (const a of plan.agents) {
    const im = meshes[a.mesh];
    if (!im) continue;
    im.setColorAt(a.slot, c.set(a.coat));
    attrs[a.mesh].b.setW(a.slot, a.variant);
  }
  for (const im of meshes) if (im?.instanceColor) im.instanceColor.needsUpdate = true;

  // the paddock fence, the den, burrows, stepping stones: one static draw
  const propGeo = buildProps(plan);
  if (propGeo) {
    addRigAttrs(propGeo, 1);
    const props = new THREE.InstancedMesh(propGeo, mat, 1);
    props.name = "fauna-props";
    props.setMatrixAt(0, new THREE.Matrix4());
    props.customDepthMaterial = depthMat;
    props.castShadow = !low;
    props.receiveShadow = true;
    props.computeBoundingSphere();
    group.add(props);
    calls++;
    tris += trisOf(propGeo);
    trisByMesh.props = trisOf(propGeo);
  }
  scene.add(group);

  const byKind: Record<string, number> = {};
  for (const a of plan.agents) byKind[KIND_NAMES[a.kind]] = (byKind[KIND_NAMES[a.kind]] ?? 0) + 1;
  const stats: FaunaStats = { animals: plan.agents.length, byKind, calls, tris, trisByMesh, buildMs: 0 };
  group.userData.stats = stats;
  group.userData.sites = plan.sites;
  group.userData.agents = plan.agents;

  // the kid, as the animals sense it
  const kid: KidSense = { x: 0, y: 0, z: 0, speed: 0, still: 0, ground: true };
  let kidInit = false;
  let visible = true;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const agents = plan.agents;
  stats.buildMs = typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;

  const fauna: Fauna = {
    update(dtIn, t, o) {
      if (!visible) return;
      const dt = Math.min(Math.max(dtIn, 0), 0.1);
      if (dt <= 0) return;
      // kid speed (smoothed), how long it has stood still, on the ground or flying overhead
      const p = o.kid;
      if (!kidInit) {
        kid.x = p.x;
        kid.z = p.z;
        kidInit = true;
      }
      const dx = p.x - kid.x;
      const dz = p.z - kid.z;
      const moved = Math.sqrt(dx * dx + dz * dz);
      const inst = moved > 15 ? 0 : moved / dt; // (a teleport isn't running)
      kid.speed += (inst - kid.speed) * Math.min(1, dt * 8);
      kid.still = kid.speed < 0.35 ? kid.still + dt : 0;
      kid.x = p.x;
      kid.y = p.y;
      kid.z = p.z;
      kid.ground = p.y - groundY(p.x, p.z) < 2.5;
      const g = o.glow;
      U.uEye.value = Math.min(1, Math.max(0, (g - 0.3) / 0.5)) * 2.6;

      stepFauna(env, kid, dt, t, g);

      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        const im = meshes[a.mesh];
        if (!im) continue;
        const at = attrs[a.mesh];
        const k = a.slot;
        if (a.present < 0.02) {
          im.setMatrixAt(k, ZERO);
          continue;
        }
        // popping out of a burrow / den / the water: grows and rises out of the ground
        const pr = a.present;
        const grow = pr * pr * (3 - 2 * pr);
        const sc = a.s * grow;
        const sy = Math.sin(a.yaw);
        const cy = Math.cos(a.yaw);
        v.set(a.x + sy * a.fwd, a.y + a.lift - (1 - grow) * 0.25 * a.s, a.z + cy * a.fwd);
        e.set(a.pitch, a.yaw, a.roll, "YXZ");
        m4.compose(v, q.setFromEuler(e), s3.set(sc, sc, sc));
        im.setMatrixAt(k, m4);
        const A = at.a.array as Float32Array;
        const B = at.b.array as Float32Array;
        const C = at.c.array as Float32Array;
        const j = k * 4;
        A[j] = a.phase;
        A[j + 1] = a.stride;
        A[j + 2] = a.headYaw;
        A[j + 3] = a.headPitch;
        B[j] = a.ear;
        B[j + 1] = a.tail;
        B[j + 2] = a.paw;
        C[j] = a.wing;
        C[j + 1] = a.tailLift;
        C[j + 2] = a.tuck;
        C[j + 3] = a.bound;
      }
      for (let m = 0; m < meshes.length; m++) {
        const im = meshes[m];
        if (!im) continue;
        im.instanceMatrix.needsUpdate = true;
        const at = attrs[m];
        at.a.needsUpdate = true;
        at.b.needsUpdate = true;
        at.c.needsUpdate = true;
      }
    },
    setVisible(vis) {
      visible = vis;
      group.visible = vis;
    },
    dispose() {
      scene.remove(group);
      group.traverse((o) => {
        const im = o as THREE.InstancedMesh;
        if (im.isInstancedMesh) {
          im.geometry.dispose();
          im.dispose();
        }
      });
      mat.dispose();
      depthMat.dispose();
    },
  };
  return fauna;
}
