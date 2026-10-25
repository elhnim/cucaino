// No-auth smoke harness for the fantasy nature & landmarks kit (lib/park/world/fantasy).
// Bundle (esbuild) into a folder with an index.html that has <div id="app">, serve it with
// scripts/smoke/serve.mjs, open /index.html?shot=meadow (meadow|forest|ruins|sky|crystals|
// overview|orbit) &glow=1 (twilight) &q=low &bloom=0 &t=<seconds>.
// window.__fantasy = { ready, info: { calls, triangles, ... }, stats } once a few frames are drawn.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { buildFantasyWorld, buildTerrainMesh, defaultFantasyFree } from "../../lib/park/world/fantasy";
import { LAND_ENTRANCE, POND, STREAM_POINTS } from "../../lib/park/registry/island";
import { LANDS, PLACES } from "../../lib/park/registry/places";
import { groundY } from "../../lib/park/registry/terrain";
import { zoneBounds } from "../../lib/park/builder/rules";

const q = new URLSearchParams(location.search);
const glow = Number(q.get("glow") ?? 0);
const low = q.get("q") === "low";
const shot = q.get("shot") ?? "meadow";
const bloomOn = q.get("bloom") !== "0";
const t0 = Number(q.get("t") ?? 4);

const app = document.getElementById("app")!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.setSize(app.clientWidth || innerWidth, app.clientHeight || innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = glow > 0.5 ? 1.1 : 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const skyTop = new THREE.Color(glow > 0.5 ? "#141a4a" : "#3d86d8");
const skyHorizon = new THREE.Color(glow > 0.5 ? "#8a5a9e" : "#cfe6f5");
scene.fog = new THREE.Fog(skyHorizon.clone().multiplyScalar(glow > 0.5 ? 0.7 : 1), shot === "overview" ? 250 : 70, shot === "overview" ? 700 : 360);

// a simple gradient sky dome
scene.add(
  new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: skyTop }, horizon: { value: skyHorizon } },
      vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader:
        "uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(horizon, top, smoothstep(-0.05, 0.55, h)), 1.0); \n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n }",
    }),
  ),
);

const hemi = new THREE.HemisphereLight(glow > 0.5 ? "#6a6ad0" : "#d6ecff", glow > 0.5 ? "#1c2a3a" : "#5a6e3a", glow > 0.5 ? 0.55 : 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(glow > 0.5 ? "#ff9f8a" : "#fff0d6", glow > 0.5 ? 0.7 : 2.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 400;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

// ── ground + stand-ins for the park (so we can judge placement) ──
const world = buildFantasyWorld(scene, { free: defaultFantasyFree(), lowQuality: low });
const terrain = buildTerrainMesh({ lowQuality: low, mask: world.mask, paths: true });
scene.add(terrain);
const standMat = new THREE.MeshStandardMaterial({ color: "#d9cfc0", roughness: 0.8 });
for (const p of PLACES) {
  if (p.radius <= 0) continue;
  const b = new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, 4, 12), standMat);
  b.position.set(p.x, groundY(p.x, p.z) + 2, p.z);
  b.castShadow = true;
  scene.add(b);
}
const water = new THREE.MeshStandardMaterial({ color: "#3a8fd0", roughness: 0.15, metalness: 0.1 });
for (const [x, z] of STREAM_POINTS) {
  const d = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.1, 12), water);
  d.position.set(x, groundY(x, z) + 0.05, z);
  scene.add(d);
}
const pond = new THREE.Mesh(new THREE.CylinderGeometry(POND.r, POND.r, 0.1, 32), water);
pond.position.set(POND.x, groundY(POND.x, POND.z) + 0.08, POND.z);
scene.add(pond);
const sea = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.MeshStandardMaterial({ color: "#2a7fb8", roughness: 0.2 }));
sea.rotation.x = -Math.PI / 2;
sea.position.y = -1.2;
scene.add(sea);
const zb = zoneBounds();
const zone = new THREE.Mesh(new THREE.BoxGeometry(zb.maxX - zb.minX, 0.2, zb.maxZ - zb.minZ), new THREE.MeshStandardMaterial({ color: "#b8e0a0" }));
zone.position.set((zb.minX + zb.maxX) / 2, groundY((zb.minX + zb.maxX) / 2, (zb.minZ + zb.maxZ) / 2) + 0.1, (zb.minZ + zb.maxZ) / 2);
scene.add(zone);
// the kid (a little capsule)
const kid = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.8, 4, 10), new THREE.MeshStandardMaterial({ color: "#ff8a3d", roughness: 0.6 }));
kid.castShadow = true;
scene.add(kid);

// ── shots ──
const camera = new THREE.PerspectiveCamera(50, renderer.domElement.width / renderer.domElement.height, 0.3, 2000);
const focus = new THREE.Vector3();
const forest = LANDS.find((l) => l.id === "forest")!;
const ring = world.plan.ruins.find((r) => r.kind === "ring") ?? world.plan.ruins[0];
const crystal = world.plan.crystals[Math.floor(world.plan.crystals.length / 2)] ?? { x: 30, z: 30 };
function place(px: number, pz: number, lookX: number, lookZ: number, back = 9, up = 4.6, lift = 1.4) {
  const dx = lookX - px;
  const dz = lookZ - pz;
  const d = Math.hypot(dx, dz) || 1;
  const gy = groundY(px, pz);
  focus.set(px, gy, pz);
  kid.position.set(px, gy + 0.85, pz);
  camera.position.set(px - (dx / d) * back, Math.max(gy, groundY(px - (dx / d) * back, pz - (dz / d) * back)) + up, pz - (dz / d) * back);
  camera.lookAt(px + (dx / d) * 6, gy + lift, pz + (dz / d) * 6);
}
function setShot(time: number) {
  if (shot === "meadow") place(-24, 30, -60, 60);
  else if (shot === "meadow2") place(30, -32, 70, -40, 8, 3.2, 1.8);
  else if (shot === "forest") {
    const [ex, ez] = LAND_ENTRANCE.forest;
    place(ex, ez, forest.x, forest.z, 10, 3.5, 7);
  } else if (shot === "forest-wide") {
    const [ex, ez] = LAND_ENTRANCE.forest;
    place(ex - (forest.x - ex) * 0.6, ez - (forest.z - ez) * 0.6, forest.x, forest.z, 14, 5, 12);
  } else if (shot === "forest-far") {
    place(forest.x - 62, forest.z - 40, forest.x, forest.z, 10, 6, 10);
  } else if (shot === "forest-in") place(forest.x - 6, forest.z - 8, forest.x + 10, forest.z + 14, 8, 2.8, 9);
  else if (shot === "ruins") place(ring.x - 14, ring.z - 14, ring.x, ring.z, 7, 3.6, 2);
  else if (shot === "crystals") place(crystal.x - 9, crystal.z - 9, crystal.x, crystal.z, 7, 3.2, 1.5);
  else if (shot === "sky") {
    const isl = world.plan.islands[Number(q.get("isl") ?? 0)];
    place(isl.x * 0.3, isl.z * 0.3, isl.x, isl.z, 9, 3, 1.4);
    camera.lookAt(isl.x, isl.y - 8, isl.z);
  } else if (shot === "overview") {
    focus.set(0, 0, 20);
    kid.position.set(0, groundY(0, 20) + 0.85, 20);
    camera.position.set(-150, 150, 190);
    camera.lookAt(0, 0, 0);
  } else if (shot === "orbit") {
    const a = time * 0.1;
    place(Math.sin(a) * 40, Math.cos(a) * 40, Math.sin(a + 0.3) * 80, Math.cos(a + 0.3) * 80);
  }
  sun.position.set(focus.x + 60, focus.y + 90, focus.z + 35);
  sun.target.position.copy(focus);
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(renderer.domElement.width, renderer.domElement.height), glow > 0.5 ? 0.7 : 0.45, 0.5, glow > 0.5 ? 0.82 : 0.92);
if (bloomOn) composer.addPass(bloom);
composer.addPass(new OutputPass());

const state: { ready: boolean; frames: number; info: Record<string, number>; stats: typeof world.stats; plan: unknown; errors: string[] } = {
  ready: false,
  frames: 0,
  info: {},
  stats: world.stats,
  plan: { trees: world.plan.trees.length, giants: world.plan.giants.length, rocks: world.plan.rocks.length, crystals: world.plan.crystals.length, ruins: world.plan.ruins.map((r) => r.kind), islands: world.plan.islands.length, obstacles: world.obstacles.length, mushrooms: world.plan.mushrooms.length },
  errors: [],
};
(window as unknown as Record<string, unknown>).__fantasy = state;

const clock = new THREE.Timer();
renderer.info.autoReset = false;
function frame() {
  clock.update();
  const t = t0 + (shot === "orbit" ? clock.getElapsed() : state.frames * 0.016);
  setShot(t);
  world.update(0.016, t, focus, glow);
  // measure the scene alone (main pass + shadow pass), then draw with post
  // (fantasy kit only: hide the harness's own ground / stand-ins / sky for the count)
  const others = scene.children.filter((o) => o !== world.group && o.visible && !(o as THREE.Light).isLight);
  for (const o of others) o.visible = false;
  renderer.info.reset();
  renderer.render(scene, camera);
  for (const o of others) o.visible = true;
  state.info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, points: renderer.info.render.points, lines: renderer.info.render.lines, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length ?? 0 };
  composer.render();
  state.frames++;
  if (state.frames >= 3 && !state.ready) {
    const tris: Record<string, number> = {};
    world.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry as THREE.BufferGeometry & { instanceCount?: number };
      const per = (g.index ? g.index.count : g.attributes.position.count) / 3;
      const n = (m as unknown as THREE.InstancedMesh).isInstancedMesh ? (m as unknown as THREE.InstancedMesh).count : g.instanceCount && g.instanceCount !== Infinity ? g.instanceCount : 1;
      tris[m.name] = Math.round(per * n);
    });
    (state as unknown as Record<string, unknown>).tris = tris;
    state.ready = true;
  }
  if (shot === "orbit" || state.frames < 3) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
