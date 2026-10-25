// No-auth smoke harness for the Wildlands' wildlife (./index.ts), standing on the real streamed
// terrain (lib/park/world/fantasy/terrainChunks.ts). Bundle with esbuild into a folder with an
// index.html that has <div id="app">, serve with scripts/smoke/serve.mjs, open
// /index.html?shot=plains|safari|ridge|lake|canopy|eagle|overview &q=low &t=<hour, 0-24>.
// window.__wildlife = { ready, info, stats } once a few frames are drawn. (The water plane and the
// canopy blobs here are just harness staging — the real park already draws the lake and the
// rainforest; this harness only needs to judge the animals against them.)
import * as THREE from "three";
import { buildTerrainChunks } from "../fantasy/terrainChunks";
import { groundY, WATER_Y } from "../../registry/terrain";
import { WILD_LAKE, wildLakeRadius } from "../../registry/wildWater";
import { buildWildlife } from "./index";
import { birdCell, duckRafts, eagleAnchors, herdCell } from "./placement";
import { WS_DEER, WS_ELEPHANT, WS_GIRAFFE, WS_GOAT, WS_KANGAROO, WS_ZEBRA, type WHerd } from "./types";

const q = new URLSearchParams(location.search);
const low = q.get("q") === "low";
const shot = q.get("shot") ?? "plains";
const hour = Number(q.get("t") ?? 11);

const app = document.getElementById("app")!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.setSize(app.clientWidth || innerWidth, app.clientHeight || innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#bfe0f2");
scene.fog = new THREE.Fog("#bfe0f2", 140, 620);

const hemi = new THREE.HemisphereLight("#d6ecff", "#5a6e3a", 1.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight("#fff0d6", 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40;
sun.shadow.camera.bottom = -40;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 300;
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

const terrain = buildTerrainChunks({ lowQuality: low });
scene.add(terrain.group);
const wildlife = buildWildlife(scene, { lowQuality: low });

// a flat water plane over the Great Lake (the real park draws proper water; this is just so the
// ducks read as floating rather than standing on bare carved lakebed)
const water = new THREE.Mesh(new THREE.CircleGeometry(Math.max(...Array.from({ length: 32 }, (_, k) => wildLakeRadius((k / 32) * Math.PI * 2))) * 1.05, 48), new THREE.MeshStandardMaterial({ color: "#3a8fd0", roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.92 }));
water.rotation.x = -Math.PI / 2;
water.position.set(WILD_LAKE.x, WATER_Y, WILD_LAKE.z);
scene.add(water);

// a few cheap canopy blobs over the rainforest spot, just so a perched/flitting parrot reads
// against something (the real park's rainforest canopy is lib/park/world/jungle)
const canopyMat = new THREE.MeshStandardMaterial({ color: "#2f7a3e", roughness: 1 });
function addCanopy(cx: number, cz: number) {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = 6 + (i % 3) * 3;
    const x = cx + Math.sin(a) * r;
    const z = cz + Math.cos(a) * r;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(3.5 + (i % 2) * 1.2, 1), canopyMat);
    m.position.set(x, groundY(x, z) + 9 + (i % 3) * 2, z);
    m.castShadow = true;
    scene.add(m);
  }
}

// the kid (a little capsule, true size)
const kid = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.1, 4, 10), new THREE.MeshStandardMaterial({ color: "#ff8a3d", roughness: 0.6 }));
kid.castShadow = true;
scene.add(kid);

// a 1.8 m reference post by the kid (easy to judge true size against)
const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8 * 1.614, 8), new THREE.MeshStandardMaterial({ color: "#8a6a4a" }));
scene.add(post);

// ── find a real example of each species/flock, so the shots land on something ──
function firstHerd(species: number | null, scanBirds = false): WHerd | undefined {
  for (let ci = -2; ci < 26; ci++)
    for (let cj = -22; cj < 8; cj++) {
      const list = scanBirds ? birdCell(ci, cj) : herdCell(ci, cj);
      for (const h of list) if (species === null || h.species === species) return h;
    }
  return undefined;
}
const spots: Record<string, WHerd | undefined> = {
  plains: firstHerd(WS_DEER) ?? firstHerd(WS_ZEBRA) ?? firstHerd(WS_KANGAROO),
  safari: firstHerd(WS_GIRAFFE) ?? firstHerd(WS_ELEPHANT),
  ridge: firstHerd(WS_GOAT),
  canopy: firstHerd(null, true),
};
if (spots.canopy) addCanopy(spots.canopy.hx, spots.canopy.hz);
const lakeDuck = duckRafts()[0];
const eagle = eagleAnchors()[0];

const camera = new THREE.PerspectiveCamera(50, renderer.domElement.width / renderer.domElement.height, 0.3, 3000);
const focus = new THREE.Vector3();
function place(px: number, pz: number, lookX: number, lookZ: number, back = 10, up = 3.6, lift = 1.2) {
  const dx = lookX - px;
  const dz = lookZ - pz;
  const d = Math.hypot(dx, dz) || 1;
  const gy = groundY(px, pz);
  focus.set(px, gy, pz);
  kid.position.set(px, gy + 0.85, pz);
  post.position.set(px + 1.6, gy + 0.9 * 1.614, pz);
  camera.position.set(px - (dx / d) * back, gy + up, pz - (dz / d) * back);
  camera.lookAt(px + (dx / d) * 6, gy + lift, pz + (dz / d) * 6);
  sun.position.set(focus.x + 40, focus.y + 70, focus.z + 25);
  sun.target.position.copy(focus);
}
function setShot() {
  if (shot === "overview") {
    const h = spots.plains ?? spots.safari;
    place((h?.hx ?? 700) - 26, (h?.hz ?? -500) - 20, h?.hx ?? 700, h?.hz ?? -500, 26, 13, 2.5);
    return;
  }
  if (shot === "lake" && lakeDuck) {
    // stand on the dry shore, just outside the lake, looking in at the raft
    const dx = lakeDuck.hx - WILD_LAKE.x;
    const dz = lakeDuck.hz - WILD_LAKE.z;
    const d = Math.hypot(dx, dz) || 1;
    const sx = lakeDuck.hx + (dx / d) * 40;
    const sz = lakeDuck.hz + (dz / d) * 40;
    place(sx, sz, lakeDuck.hx, lakeDuck.hz, 7, 2.4, 0.1);
    return;
  }
  if (shot === "eagle") {
    const gy = groundY(eagle.hx, eagle.hz);
    const flyY = gy + 72;
    focus.set(eagle.hx, flyY, eagle.hz);
    kid.position.set(eagle.hx, gy + 0.85, eagle.hz);
    post.position.set(eagle.hx + 1.6, gy + 0.9 * 1.614, eagle.hz);
    camera.position.set(eagle.hx - eagle.hr - 50, flyY + 10, eagle.hz);
    camera.lookAt(eagle.hx, flyY, eagle.hz);
    sun.position.set(eagle.hx + 60, flyY + 120, eagle.hz + 40);
    sun.target.position.copy(focus);
    return;
  }
  if (shot === "canopy" && spots.canopy) {
    const h = spots.canopy;
    const gy = groundY(h.hx, h.hz);
    const perchY = gy + 13;
    focus.set(h.hx, perchY, h.hz);
    kid.position.set(h.hx, gy + 0.85, h.hz);
    post.position.set(h.hx + 1.6, gy + 0.9 * 1.614, h.hz);
    // (looking down over the canopy's top, so the blobs frame it instead of blocking it)
    camera.position.set(h.hx - 22, perchY + 14, h.hz - 22);
    camera.lookAt(h.hx, perchY - 1, h.hz);
    sun.position.set(h.hx + 40, perchY + 70, h.hz + 25);
    sun.target.position.copy(focus);
    return;
  }
  if (shot === "parrot" && spots.canopy) {
    // a closer, uncluttered look at the bird model itself (true size, perch, colour) — the exact
    // perch height varies a little bird to bird, so this stands back enough to forgive that
    const h = spots.canopy;
    const gy = groundY(h.hx, h.hz);
    const perchY = gy + 13;
    focus.set(h.hx, perchY, h.hz);
    kid.position.set(h.hx - 5, gy + 0.85, h.hz - 5);
    post.position.set(h.hx - 3, gy + 0.9 * 1.614, h.hz - 5);
    camera.position.set(h.hx - 15, perchY + 8, h.hz - 15);
    camera.lookAt(h.hx, perchY, h.hz);
    sun.position.set(h.hx + 20, perchY + 30, h.hz + 15);
    sun.target.position.copy(focus);
    return;
  }
  if (shot === "ridge" && spots.ridge) {
    const h = spots.ridge;
    place(h.hx - 14, h.hz - 2, h.hx, h.hz, 14, 7, 2.2);
    return;
  }
  const h = spots[shot];
  if (h) place(h.hx - 9, h.hz - 9, h.hx, h.hz, 9, 3, 1.4);
  else place(700, -500, 720, -520, 9, 3, 1.4);
}
setShot();

const state: { ready: boolean; frames: number; info: Record<string, number>; stats: ReturnType<typeof wildlife.stats>; spots: Record<string, { x: number; z: number; species: number } | null>; errors: string[] } = {
  ready: false,
  frames: 0,
  info: {},
  stats: wildlife.stats(),
  spots: Object.fromEntries(Object.entries(spots).map(([k, h]) => [k, h ? { x: h.hx, z: h.hz, species: h.species } : null])),
  errors: [],
};
(window as unknown as Record<string, unknown>).__wildlife = state;
window.addEventListener("error", (e) => state.errors.push(String(e.error?.stack ?? e.message)));

let t = hour * 60; // (a slow clock: 1 "hour" of sim time per 60 units of t, so hour = t/60 % 24)
function frame() {
  // force the terrain fully built at this spot before judging anything by it
  for (let i = 0; i < 40; i++) terrain.update(focus, Infinity);
  t += 0.05;
  const h = (hour + state.frames * 0.002) % 24;
  wildlife.update(1 / 20, t, { kid: focus, glow: 0, hour: h });
  renderer.render(scene, camera);
  state.stats = wildlife.stats();
  state.frames++;
  if (state.frames >= 6 && !state.ready) state.ready = true;
  if (state.frames < 90) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
