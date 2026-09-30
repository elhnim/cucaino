// The storybook train-diorama dressing for Cucaino Park: a dense chunky low-poly forest with
// meadow clearings, flocks of grazing sheep, white windmills on the knolls, striped hot-air
// balloons drifting over the island, little boats on the sea and the pond, puffy low clouds that
// cast soft shadows, and a painted misty horizon of forested ridges. Placement is pure and seeded
// (./plan.ts, tested); models are faceted so the diorama pass's ink + colour steps read (./geometry.ts);
// every repeated thing is instanced and every update loop is allocation-free.
import * as THREE from "three";
import { fxMaterial, makeUniforms } from "../fantasy/shaders";
import { POND, coastR } from "../../registry/island";
import { WATER_Y, groundY } from "../../registry/terrain";
import { makeSwimmer, swim, type SwimStyle, type Swimmer } from "../sea/wander";
import {
  LEAF_GREENS,
  LEAF_YELLOWS,
  PINE_GREENS,
  TREE_KINDS,
  balloonAt,
  cloudAt,
  isPine,
  planBalloons,
  planClouds,
  planFlocks,
  planForest,
  planMeadows,
  planPasture,
  planWindmills,
  rngOf,
  stepFlock,
  trunkObstacles,
  type FreeFn,
} from "./plan";
import { MILL_HUB, buildBalloon, buildCloud, buildForestTree, buildRowboat, buildSailboat, buildShadowProxy, buildSheepBody, buildSheepHead, buildWindmillSails, buildWindmillTower, trisOf } from "./geometry";
import { buildHorizon } from "./horizon";
import { addCutaway, makeCutaway } from "./cutaway";

export interface Storybook {
  update(dt: number, t: number, focus: THREE.Vector3, glow: number): void;
  /** round things to walk around (tree trunks of the dense forest, windmills) */
  obstacles: { x: number; z: number; r: number }[];
  /** hide what shouldn't show under the sea (the painted horizon, balloons) */
  setUnderwater(under: boolean): void;
  dispose(): void;
}

export interface StorybookStats {
  trees: number;
  pines: number;
  forestTris: number;
  forestCalls: number;
  sheep: number;
  flocks: number;
  windmills: number;
  balloons: number;
  boats: number;
  clouds: number;
  obstacles: number;
}

const SHEEP_SCALE = 1.25;
const MILL_SCALE = 1.55;
const SHADOW_NEAR = 78;
const BOAT_STYLE: SwimStyle = { speed: [0.7, 1.5], turn: 0.22, wander: 0.045, depth: [0, 0], clear: 0, need: 1.6, look: 9, climb: 1, bank: 0 };

export function buildStorybook(scene: THREE.Scene, opts: { free: FreeFn; lowQuality?: boolean }): Storybook {
  const low = !!opts.lowQuality;
  const free = opts.free;
  const U = makeUniforms();
  U.uSway.value = 0.075;
  U.uGlowK.value = 0;
  const group = new THREE.Group();
  group.name = "storybook";
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const c = new THREE.Color();

  // ── the dense forest ──
  const meadows = planMeadows(free, { count: low ? 6 : 8 });
  const forest = planForest(free, { lowQuality: low, meadows });
  const cut = makeCutaway();
  const leafMat = track(addCutaway(fxMaterial(U, { roughness: 0.92, metalness: 0 }), cut));
  // the camera is only known at render time
  const grabCamera = (_r: THREE.WebGLRenderer, _s: THREE.Scene, cam: THREE.Camera) => void cut.uCutCam.value.setFromMatrixPosition(cam.matrixWorld);
  const hueColor = (h: number, out: THREE.Color) => out.set(h >= 200 ? PINE_GREENS[h - 200] : h >= 100 ? LEAF_YELLOWS[h - 100] : LEAF_GREENS[h]);
  let forestTris = 0;
  let forestCalls = 0;
  for (let kind = 0; kind < TREE_KINDS; kind++) {
    const list = forest.trees.filter((t) => t.kind === kind);
    if (!list.length) continue;
    const geo = track(buildForestTree(kind, low));
    const im = new THREE.InstancedMesh(geo, leafMat, list.length);
    im.name = `storybook-trees-${kind}`;
    im.castShadow = false; // (a cheap proxy casts the shadows near the player, below)
    im.receiveShadow = !low;
    im.onBeforeRender = grabCamera;
    list.forEach((t, i) => {
      e.set(0, t.rot, 0);
      m4.compose(v.set(t.x, t.y - 0.15 * t.s, t.z), q.setFromEuler(e), s3.set(t.s, t.s * t.sy, t.s));
      im.setMatrixAt(i, m4);
      // a touch of per-tree lightness so neighbours of the same green still read apart
      hueColor(t.hue, c).multiplyScalar(0.9 + ((i * 7919) % 100) / 100 * 0.2);
      im.setColorAt(i, c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    group.add(im);
    forestTris += trisOf(geo) * list.length;
    forestCalls++;
  }

  // shadows: a low-poly stand-in for every tree near the player casts them (the full forest
  // would double its triangles in the shadow pass); it draws nothing in the main pass
  const proxyMats = new Float32Array(forest.trees.length * 16);
  forest.trees.forEach((t, i) => {
    const pine = isPine(t.kind);
    const h = (pine ? 4.2 : 3.8) * t.s * t.sy;
    m4.compose(v.set(t.x, t.y + h, t.z), q.identity(), pine ? s3.set(1.45 * t.s, 3.0 * t.s * t.sy, 1.45 * t.s) : s3.set(2.15 * t.s, 1.8 * t.s * t.sy, 2.15 * t.s));
    m4.toArray(proxyMats, i * 16);
  });
  const proxyCap = Math.min(forest.trees.length, low ? 1 : 1100);
  const proxyMat = track(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  const proxy = new THREE.InstancedMesh(track(buildShadowProxy()), proxyMat, Math.max(1, proxyCap));
  proxy.name = "storybook-tree-shadows";
  proxy.castShadow = !low;
  proxy.count = 0;
  proxy.frustumCulled = false;
  proxy.visible = !low;
  group.add(proxy);
  let proxyX = Infinity;
  let proxyZ = Infinity;
  const refreshProxy = (fx: number, fz: number) => {
    proxyX = fx;
    proxyZ = fz;
    const arr = proxy.instanceMatrix.array as Float32Array;
    let n = 0;
    const r2 = SHADOW_NEAR * SHADOW_NEAR;
    for (let i = 0; i < forest.trees.length && n < proxyCap; i++) {
      const t = forest.trees[i];
      if ((t.x - fx) ** 2 + (t.z - fz) ** 2 > r2) continue;
      for (let k = 0; k < 16; k++) arr[n * 16 + k] = proxyMats[i * 16 + k];
      n++;
    }
    proxy.count = n;
    proxy.instanceMatrix.needsUpdate = true;
  };

  // ── pasture, windmills, sheep ──
  const pasture = planPasture(free, forest.covered);
  const startView = { x: 0, z: 30, r: 20 };
  const mills = planWindmills(pasture, { count: low ? 3 : 4, avoid: [startView] });
  const millMat = track(fxMaterial(U, { roughness: 0.85, metalness: 0 }));
  const towers = new THREE.InstancedMesh(track(buildWindmillTower()), millMat, Math.max(1, mills.length));
  const sails = new THREE.InstancedMesh(track(buildWindmillSails()), millMat, Math.max(1, mills.length));
  towers.name = "storybook-windmills";
  sails.name = "storybook-windmill-sails";
  towers.count = sails.count = mills.length;
  towers.castShadow = sails.castShadow = !low;
  towers.receiveShadow = true;
  sails.frustumCulled = false;
  const hubs = mills.map((m) => {
    return { x: m.x + Math.sin(m.face) * MILL_HUB.z * MILL_SCALE, y: m.y - 0.1 + MILL_HUB.y * MILL_SCALE, z: m.z + Math.cos(m.face) * MILL_HUB.z * MILL_SCALE, face: m.face, speed: 0.45 + Math.abs(m.x % 3) * 0.08 };
  });
  mills.forEach((m, i) => {
    e.set(0, m.face, 0);
    m4.compose(v.set(m.x, m.y - 0.1, m.z), q.setFromEuler(e), s3.setScalar(MILL_SCALE));
    towers.setMatrixAt(i, m4);
  });
  towers.instanceMatrix.needsUpdate = true;
  towers.computeBoundingSphere();
  group.add(towers, sails);
  const millObstacles = mills.map((m) => ({ x: m.x, z: m.z, r: 1.7 * MILL_SCALE }));

  const flocks = planFlocks(pasture, { count: low ? 5 : 7, avoid: [...millObstacles.map((o) => ({ ...o, r: o.r + 2 })), startView], sites: meadows });
  const nSheep = flocks.reduce((a, f) => a + f.sheep.length, 0);
  const sheepMat = track(fxMaterial(U, { roughness: 0.95, metalness: 0 }));
  const bodies = new THREE.InstancedMesh(track(buildSheepBody()), sheepMat, Math.max(1, nSheep));
  const heads = new THREE.InstancedMesh(track(buildSheepHead()), sheepMat, Math.max(1, nSheep));
  bodies.name = "storybook-sheep";
  heads.name = "storybook-sheep-heads";
  bodies.count = heads.count = nSheep;
  bodies.castShadow = !low;
  heads.castShadow = false;
  bodies.frustumCulled = heads.frustumCulled = false;
  group.add(bodies, heads);
  const headLocal = new THREE.Matrix4();
  const headRot = new THREE.Matrix4();
  const neck = new THREE.Vector3(0, 0.98, 0.72);

  // ── hot-air balloons ──
  const balloonPaths = planBalloons(low ? 3 : 5);
  const balloonMat = track(fxMaterial(U, { roughness: 0.7, metalness: 0 }));
  const balloons = balloonPaths.map((b) => {
    const mesh = new THREE.Mesh(track(buildBalloon(b.style)), balloonMat);
    mesh.name = "storybook-balloon";
    mesh.castShadow = !low;
    mesh.scale.setScalar(1.15);
    group.add(mesh);
    return mesh;
  });
  const bPos = { x: 0, y: 0, z: 0, yaw: 0 };

  // ── boats: a few on the sea near the shore, one on the pond ──
  const boatMat = track(fxMaterial(U, { roughness: 0.75, metalness: 0 }));
  const nSea = low ? 3 : 5;
  const sailN = Math.ceil(nSea * 0.6);
  const sailboats = new THREE.InstancedMesh(track(buildSailboat()), boatMat, sailN);
  const rowboats = new THREE.InstancedMesh(track(buildRowboat()), boatMat, nSea - sailN + 1);
  sailboats.name = "storybook-sailboats";
  rowboats.name = "storybook-rowboats";
  sailboats.castShadow = rowboats.castShadow = !low;
  sailboats.frustumCulled = rowboats.frustumCulled = false;
  const HULLS = ["#d9483a", "#2f78d0", "#f2b33a", "#3aa06a", "#8a5ad6"];
  const br = rngOf(9191);
  const boats: { s: Swimmer; home: { x: number; z: number; r: number }; style: SwimStyle; sail: boolean; slot: number; scale: number }[] = [];
  for (let i = 0; i < nSea; i++) {
    const a = (i / nSea) * Math.PI * 2 + 0.4 + br() * 0.5;
    const d = coastR(a) + 30 + br() * 10;
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    const sail = i < sailN;
    const home = { x, z, r: 34 };
    boats.push({ s: makeSwimmer(x, WATER_Y, z, a + Math.PI / 2, 300 + i * 17, 1), home, style: { ...BOAT_STYLE, home }, sail, slot: sail ? i : i - sailN, scale: sail ? 1.6 : 1.45 });
  }
  for (const b of boats) (b.sail ? sailboats : rowboats).setColorAt(b.slot, c.set(HULLS[boats.indexOf(b) % HULLS.length]));
  const pondSlot = nSea - sailN;
  rowboats.setColorAt(pondSlot, c.set("#f2b33a"));
  if (sailboats.instanceColor) sailboats.instanceColor.needsUpdate = true;
  if (rowboats.instanceColor) rowboats.instanceColor.needsUpdate = true;
  const pondY = groundY(POND.x, POND.z) + 0.065;
  group.add(sailboats, rowboats);

  // ── clouds ──
  const variants = 3;
  const cloudSpots = planClouds(low ? 14 : 24, variants);
  const cloudMat = track(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color("#4a4a50") }));
  const cloudMeshes = Array.from({ length: variants }, (_, k) => {
    const n = cloudSpots.filter((cs) => cs.variant === k).length;
    const im = new THREE.InstancedMesh(track(buildCloud(k)), cloudMat, Math.max(1, n));
    im.count = n;
    im.name = `storybook-clouds-${k}`;
    // (no cloud shadows: from the sun's angle they fell as big hard dark blotches on the lawns)
    im.castShadow = false;
    im.receiveShadow = false;
    im.frustumCulled = false;
    group.add(im);
    return im;
  });
  const cloudSlot = cloudSpots.map((cs, i) => cloudSpots.slice(0, i).filter((o) => o.variant === cs.variant).length);
  const cPos = { x: 0, z: 0 };
  const cloudLift = new Float32Array(cloudSpots.length);

  // ── the painted horizon ──
  const horizon = buildHorizon({ lowQuality: low });
  track(horizon);
  group.add(horizon.mesh);

  scene.add(group);

  let under = false;
  const stats: StorybookStats = {
    trees: forest.trees.length,
    pines: forest.trees.filter((t) => isPine(t.kind)).length,
    forestTris,
    forestCalls,
    sheep: nSheep,
    flocks: flocks.length,
    windmills: mills.length,
    balloons: balloons.length,
    boats: nSea + 1,
    clouds: cloudSpots.length,
    obstacles: 0,
  };
  const obstacles = [...trunkObstacles(forest.trees, 1400), ...millObstacles];
  stats.obstacles = obstacles.length;
  group.userData.stats = stats;
  // where things went (for harnesses / debugging)
  group.userData.spots = { mills: mills.map((m) => [Math.round(m.x), Math.round(m.z)]), flocks: flocks.map((f) => [Math.round(f.x), Math.round(f.z)]), meadows: meadows.map((m) => [Math.round(m.x), Math.round(m.z), Math.round(m.r)]), boats: boats.map((b) => [Math.round(b.s.x), Math.round(b.s.z)]) };

  const book: Storybook = {
    obstacles,
    setUnderwater(u) {
      under = u;
      horizon.mesh.visible = !u;
      for (const b of balloons) b.visible = !u;
    },
    update(dt, t, focus, glow) {
      U.uTime.value = t;
      U.uGlow.value = glow;
      U.uPulse.value = glow;
      U.uFocus.value.set(focus.x, focus.z);
      cut.uCutKid.value.copy(focus);

      if (!low && (focus.x - proxyX) ** 2 + (focus.z - proxyZ) ** 2 > 36) refreshProxy(focus.x, focus.z);

      // windmill sails
      for (let i = 0; i < hubs.length; i++) {
        const h = hubs[i];
        e.set(0, h.face, -t * h.speed, "YXZ");
        m4.compose(v.set(h.x, h.y, h.z), q.setFromEuler(e), s3.setScalar(MILL_SCALE));
        sails.setMatrixAt(i, m4);
      }
      if (hubs.length) sails.instanceMatrix.needsUpdate = true;

      // sheep: graze, amble, keep together
      const sdt = Math.min(dt, 0.1);
      let k = 0;
      for (const f of flocks) {
        stepFlock(f, pasture, sdt, t);
        for (const s of f.sheep) {
          const gy = groundY(s.x, s.z);
          const trot = Math.abs(Math.sin(t * 9 + s.seed)) * 0.06 * s.walk;
          e.set(0, s.yaw, Math.sin(t * 9 + s.seed) * 0.03 * s.walk, "YXZ");
          m4.compose(v.set(s.x, gy + trot, s.z), q.setFromEuler(e), s3.setScalar(SHEEP_SCALE));
          bodies.setMatrixAt(k, m4);
          // head: down in the grass nibbling (with a bob), up when walking
          const graze = 1 - s.walk;
          const nib = Math.max(0, Math.sin(t * 2.3 + s.seed * 3)) * 0.18;
          const pitch = graze * (0.75 + nib) - s.walk * 0.12 + Math.sin(t * 0.4 + s.seed) * 0.1 * graze;
          headLocal.makeTranslation(neck.x, neck.y, neck.z);
          headRot.makeRotationX(pitch);
          headLocal.multiply(headRot);
          m4.multiply(headLocal);
          heads.setMatrixAt(k, m4);
          k++;
        }
      }
      if (nSheep) {
        bodies.instanceMatrix.needsUpdate = true;
        heads.instanceMatrix.needsUpdate = true;
      }

      // balloons drift in lazy loops, swaying a little
      for (let i = 0; i < balloons.length; i++) {
        balloonAt(balloonPaths[i], t, bPos);
        const b = balloons[i];
        b.position.set(bPos.x, bPos.y, bPos.z);
        b.rotation.set(Math.sin(t * 0.5 + i) * 0.03, bPos.yaw, Math.cos(t * 0.43 + i * 2) * 0.03);
      }

      // boats: wander near their stretch of shore, bobbing and heeling
      for (let i = 0; i < boats.length; i++) {
        const b = boats[i];
        swim(b.s, b.style, sdt, t);
        b.s.y = WATER_Y;
        const bob = Math.sin(t * 1.3 + i * 1.7) * 0.06;
        e.set(Math.sin(t * 0.9 + i) * 0.04, b.s.yaw, (b.sail ? 0.1 : 0) + Math.sin(t * 1.1 + i * 2.1) * 0.05, "YXZ");
        m4.compose(v.set(b.s.x, WATER_Y + 0.02 + bob, b.s.z), q.setFromEuler(e), s3.setScalar(b.scale));
        (b.sail ? sailboats : rowboats).setMatrixAt(b.slot, m4);
      }
      {
        // the pond: a little rowing boat drifting round the lily pads
        const u = t * 0.05;
        const x = POND.x + Math.sin(u) * (POND.r - 1.9);
        const z = POND.z + Math.cos(u) * (POND.r - 1.9);
        e.set(0, u + Math.PI / 2, Math.sin(t * 1.2) * 0.04, "YXZ");
        m4.compose(v.set(x, pondY + Math.sin(t * 1.4) * 0.02, z), q.setFromEuler(e), s3.setScalar(0.78));
        rowboats.setMatrixAt(pondSlot, m4);
      }
      sailboats.instanceMatrix.needsUpdate = true;
      rowboats.instanceMatrix.needsUpdate = true;

      // clouds drift with the wind; ones low over the player rise a little so they never sit
      // between the camera and the kid
      const wx = U.uWindDir.value.x;
      const wz = U.uWindDir.value.y;
      for (let i = 0; i < cloudSpots.length; i++) {
        const cs = cloudSpots[i];
        cloudAt(cs, t, wx, wz, cPos);
        const span = 9 * cs.s;
        const ceil = Math.max(groundY(cPos.x, cPos.z), groundY(cPos.x + span, cPos.z), groundY(cPos.x - span, cPos.z), groundY(cPos.x, cPos.z + span * 0.5), groundY(cPos.x, cPos.z - span * 0.5), 0);
        let y = Math.max(cs.y, ceil + 12);
        const dxz = Math.hypot(cPos.x - focus.x, cPos.z - focus.z);
        const near = 1 - Math.min(1, Math.max(0, (dxz - span - 14) / 22));
        const want = near * Math.max(0, focus.y + 44 - y);
        cloudLift[i] += (want - cloudLift[i]) * Math.min(1, dt * 0.8);
        y += cloudLift[i];
        e.set(0, cs.rot, 0);
        m4.compose(v.set(cPos.x, y, cPos.z), q.setFromEuler(e), s3.set(cs.s, cs.s * 0.9, cs.s));
        cloudMeshes[cs.variant].setMatrixAt(cloudSlot[i], m4);
      }
      for (const im of cloudMeshes) im.instanceMatrix.needsUpdate = true;

      if (!under) horizon.update(focus, scene.fog ? (scene.fog as THREE.Fog).color : null, glow);
    },
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
      group.traverse((o) => {
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
    },
  };
  return book;
}
