// The land animals of Cucaino Park, all at their TRUE size, roaming the whole island: deer herds,
// kangaroo mobs (a joey in the pouch), an emu dad and his chicks, cows, goats, the farm's sheep and
// lambs, a little safari (giraffes, zebras, an elephant family), foxes, wombats, echidnas and
// hedgehogs on their rounds — and the homebodies: horses and ponies in the paddock by the farm
// corner (chickens round the coop), rabbits, a fox den with kits, squirrels, koalas, kookaburras and
// owls in the trees by the trails, ducks and a platypus on the pond, frogs, bears fishing in the
// stream and turtles plodding across a trail.
//
// Placement is pure and seeded (./plan.ts), the roaming map is ./roam.ts, behaviour is pure,
// deterministic and allocation-free (./brain.ts), all tested. Each body plan is ONE instanced mesh
// whose legs, heads, ears, tails, wings and trunks are posed in the vertex shader (./rig.ts), so the
// whole menagerie is 15 draw calls (+ shadows for the big ones).
import * as THREE from "three";
import { groundY } from "../../registry/terrain";
import { carvePasture, planFlocks, planForest, planMeadows, planPasture, planWindmills, stepFlock, type Flock, type FreeFn, type Meadow, type Pasture } from "../storybook/plan";
import { buildForestTree } from "../storybook/geometry";
import { makeEnv, stepFauna, type FaunaEnv } from "./brain";
import { buildProps, trisOf } from "./geometry";
import { buildWalkGrid } from "./ground";
import { canopyOf, planFauna, sheepKeepOut } from "./plan";
import { rigDepthMaterial, rigMaterial } from "./rig";
import { buildMeshGeometries } from "./species";
import { KIND_NAMES, K_KOOKABURRA, K_OWL, MESHES, MESH_NAMES, M_BEAR, M_COW, M_DEER, M_GOAT, M_HORSE, M_ROO, M_SAFARI, type Agent, type KidSense, type TreeLite } from "./types";

export interface Fauna {
  update(dt: number, t: number, o: { kid: THREE.Vector3; glow: number; hour?: number }): void;
  /** hide while the camera's under the sea / far away */
  setVisible(v: boolean): void;
  /** where the storybook's sheep may not graze (the paddock, the farm corner): carve it out of their pasture */
  sheepKeepOut: (x: number, z: number) => boolean;
  dispose(): void;
}

export interface FaunaStats {
  animals: number;
  byKind: Record<string, number>;
  calls: number;
  /** triangles submitted (every instance draws its whole shared mesh) */
  tris: number;
  trisByMesh: Record<string, number>;
  buildMs: number;
  /** the roaming map */
  nodes: number;
  /** average update cost (ms), measured over the last 120 frames */
  updateMs: number;
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
  /**
   * Is the storybook (and its sheep) in the scene? The animals walk round its grazing flocks:
   * the flocks are re-planned and re-stepped here (deterministically, in step with the storybook's
   * own), so everyone knows where each sheep is without the two modules talking. Default true.
   */
  sheep?: boolean;
}

/**
 * Sit each owl / kookaburra right on top of its tree's crown (the plan only knows the canopy's
 * rough ellipsoid): drop a ray onto the actual storybook tree model, a little way out toward the
 * trail it faces.
 */
function perchBirds(agents: Agent[], trees: TreeLite[], low: boolean) {
  const models = new Map<number, THREE.Mesh>();
  const rc = new THREE.Raycaster();
  const from = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  for (const a of agents) {
    if ((a.kind !== K_OWL && a.kind !== K_KOOKABURRA) || a.tree < 0) continue;
    const t = trees[a.tree];
    let m = models.get(t.kind);
    if (!m) {
      m = new THREE.Mesh(buildForestTree(t.kind, low));
      models.set(t.kind, m);
    }
    const d = canopyOf(t.kind).rx * (a.kind === K_OWL ? 0.42 : 0.62);
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
const SHADOW_MESHES = new Set([M_DEER, M_HORSE, M_COW, M_BEAR, M_GOAT, M_ROO, M_SAFARI]);

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
  // the storybook's sheep, re-planned exactly as it plans them (see storybook/index.ts)
  let pasture: Pasture | null = null;
  let flocks: Flock[] = [];
  if (opts.sheep !== false) {
    pasture = planPasture(free, forest.covered);
    const startView = { x: 0, z: 30, r: 20 };
    const mills = planWindmills(pasture, { count: low ? 3 : 4, avoid: [startView] });
    const millObstacles = mills.map((m) => ({ x: m.x, z: m.z, r: 1.7 * 1.55 }));
    flocks = planFlocks(pasture, { count: low ? 5 : 7, avoid: [...millObstacles.map((o) => ({ ...o, r: o.r + 2 })), startView], sites: forest.meadows });
  }
  const nSheep = flocks.reduce((n, f) => n + f.sheep.length, 0);
  const grid = buildWalkGrid(forest.covered, opts.obstacles, free, forest.trees);
  const plan = planFauna(free, grid, { trees: forest.trees, meadows: forest.meadows }, { lowQuality: low, obstacles: opts.obstacles, flocks: flocks.map((f) => ({ x: f.x, z: f.z, r: f.r + 2 })) });
  perchBirds(plan.agents, forest.trees, low);
  // (the sheep stay out of the paddock and the farm: this copy of their pasture, and the storybook's own via sheepKeepOut)
  const keepOut = sheepKeepOut(plan);
  if (pasture) carvePasture(pasture, keepOut, flocks);
  const env: FaunaEnv = makeEnv({ g: grid, trees: forest.trees, paddock: plan.paddock, agents: plan.agents, shores: plan.shores, graph: plan.graph, routes: plan.routes, farm: plan.farm, maxSheep: nSheep });

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

  // the paddock fence, the farm, the den, burrows, stepping stones: one static draw
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
  const stats: FaunaStats = { animals: plan.agents.length, byKind, calls, tris, trisByMesh, buildMs: 0, nodes: plan.graph.n, updateMs: 0 };
  group.userData.stats = stats;
  group.userData.sites = plan.sites;
  group.userData.agents = plan.agents;
  group.userData.env = env;
  /** (harnesses) fast-forward the animals `seconds` of park time with the kid far away, sampling every `every` s */
  group.userData.simulate = (seconds: number, o: { dt?: number; h0?: number; day?: number; every?: number; sample?: (t: number) => void } = {}) => {
    const dt = o.dt ?? 0.1;
    const far: KidSense = { x: 9999, y: 0, z: 9999, speed: 0, dx: 0, dz: 1, still: 0, ground: true };
    let next = 0;
    for (let s = 0; s < seconds; s += dt) {
      const h = ((o.h0 ?? 9) + (s / (o.day ?? 900)) * 24) % 24;
      stepSheep(dt, s);
      stepFauna(env, far, dt, s, h > 19.5 || h < 5.5 ? 1 : h > 17.5 ? 0.55 : 0, h);
      if (o.sample && s >= next) {
        next += o.every ?? 5;
        o.sample(s);
      }
    }
  };

  // the kid, as the animals sense it
  const kid: KidSense = { x: 0, y: 0, z: 0, speed: 0, dx: 0, dz: 1, still: 0, ground: true };
  let kidInit = false;
  let visible = true;
  let sumMs = 0;
  let frames = 0;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const agents = plan.agents;
  stats.buildMs = typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;

  /** keep the sheep in step with the storybook's (and tell the animals where they are) */
  const stepSheep = (dt: number, t: number) => {
    if (!pasture) return;
    let k = 0;
    for (let i = 0; i < flocks.length; i++) {
      const f = flocks[i];
      stepFlock(f, pasture, dt, t);
      if (i < 16) {
        env.flocks[i * 3] = f.x;
        env.flocks[i * 3 + 1] = f.z;
        env.flocks[i * 3 + 2] = f.r + 2;
      }
      for (const s of f.sheep) {
        env.sheep[k * 2] = s.x;
        env.sheep[k * 2 + 1] = s.z;
        k++;
      }
    }
    env.nSheep = k;
    env.nFlocks = Math.min(16, flocks.length);
  };

  const fauna: Fauna = {
    update(dtIn, t, o) {
      const dt = Math.min(Math.max(dtIn, 0), 0.1);
      stepSheep(dt, t);
      if (!visible) return;
      if (dt <= 0) return;
      const tu = typeof performance !== "undefined" ? performance.now() : 0;
      // kid speed (smoothed), heading, how long it has stood still, on the ground or flying overhead
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
      if (moved > 1e-4 && moved < 15) {
        const k = Math.min(1, dt * 5);
        kid.dx += (dx / moved - kid.dx) * k;
        kid.dz += (dz / moved - kid.dz) * k;
        const l = Math.hypot(kid.dx, kid.dz) || 1;
        kid.dx /= l;
        kid.dz /= l;
      }
      kid.still = kid.speed < 0.35 ? kid.still + dt : 0;
      kid.x = p.x;
      kid.y = p.y;
      kid.z = p.z;
      kid.ground = p.y - groundY(p.x, p.z) < 2.5;
      const g = o.glow;
      U.uEye.value = Math.min(1, Math.max(0, (g - 0.3) / 0.5)) * 2.6;

      stepFauna(env, kid, dt, t, g, o.hour ?? 12);

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
        B[j + 3] = a.variant + Math.min(0.9, a.hint * 0.9);
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
      if (tu) {
        sumMs += performance.now() - tu;
        if (++frames >= 120) {
          stats.updateMs = Math.round((sumMs / frames) * 1000) / 1000;
          sumMs = 0;
          frames = 0;
        }
      }
    },
    sheepKeepOut: keepOut,
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
