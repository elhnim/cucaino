// No-auth smoke harness for the procedural chibi animals (lib/park/characters).
//   ?role=kid|pet|visitor   ?action=walk|wave|...   ?speed=3   ?only=animal-fox
//   ?t=1.2 (simulate that many seconds, render once, set window.__ready)   ?glow=0..1
//   ?yaw=0.6 (orbit the camera)   ?ids=animal-fox,animal-cat (subset)   ?labels=0
import * as THREE from "three";
import { buildChibi, CHIBI_IDS, type ChibiAction, type ChibiRig } from "../../lib/park/characters/chibi";

const q = new URLSearchParams(location.search);
const role = (q.get("role") ?? "kid") as "kid" | "pet" | "visitor";
const action = q.get("action") as ChibiAction | null;
const speed = Number(q.get("speed") ?? 0);
const only = q.get("only");
const glow = Number(q.get("glow") ?? 0);
const fixedT = q.get("t");
const yaw = Number(q.get("yaw") ?? 0);
const pitch = Number(q.get("pitch") ?? (only ? 0.18 : 0.42));
const ids = only ? [only] : q.get("ids") ? q.get("ids")!.split(",") : CHIBI_IDS;

const host = document.getElementById("app")!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(host.clientWidth, host.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// pastel twilight gradient
{
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  if (glow > 0.5) {
    grad.addColorStop(0, "#3b2a6b");
    grad.addColorStop(1, "#8a5fa8");
  } else {
    grad.addColorStop(0, "#bfe3ff");
    grad.addColorStop(0.6, "#ffe1f0");
    grad.addColorStop(1, "#fff4d6");
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}
const night = glow > 0.5;
scene.add(new THREE.HemisphereLight(night ? "#9f8cff" : "#ffffff", night ? "#402a60" : "#ffd9ec", night ? 0.9 : 1.6));
const sun = new THREE.DirectionalLight(night ? "#b9a8ff" : "#fff6e8", night ? 0.8 : 1.9);
sun.position.set(3, 8, 6);
scene.add(sun);

const cols = only ? 1 : Math.min(6, ids.length);
const rows = Math.ceil(ids.length / cols);
const gap = 2.9;
const rigs: { rig: ChibiRig; id: string; pos: THREE.Vector3 }[] = [];
ids.forEach((id, i) => {
  const c = i % cols, r = Math.floor(i / cols);
  const rig = buildChibi(id as never, {
    height: role === "pet" ? 1.25 : 2.1,
    role,
    accent: ["#e5484d", "#4f46e5", "#0ea5e9", "#f97316"][i % 4],
    seed: i + 1,
  });
  const pos = new THREE.Vector3((c - (cols - 1) / 2) * gap, 0, (r - (rows - 1) / 2) * gap * 1.5);
  rig.root.position.copy(pos);
  scene.add(rig.root);
  if (action) rig.play(action, false);
  rig.setGlow(glow);
  rigs.push({ rig, id, pos });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.05, 24), new THREE.MeshBasicMaterial({ color: night ? "#5a3f86" : "#bff0c8" }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.copy(pos).setY(0.002);
  scene.add(disc);
});

const aspect = host.clientWidth / host.clientHeight;
const camera = new THREE.PerspectiveCamera(only ? 30 : 32, aspect, 0.1, 200);
const target = new THREE.Vector3(0, only ? 1.05 : 0.9, 0);
const extent = only ? 4.6 : Math.max((cols * gap) / aspect, rows * gap * 1.5 * 0.7) * 1.95 + 4;
camera.position.set(Math.sin(yaw) * Math.cos(pitch) * extent, target.y + Math.sin(pitch) * extent, Math.cos(yaw) * Math.cos(pitch) * extent);
camera.lookAt(target);

// labels
const labels: HTMLDivElement[] = [];
if (q.get("labels") !== "0" && !only)
  for (const r of rigs) {
    const d = document.createElement("div");
    d.textContent = r.id.replace("animal-", "");
    d.style.cssText = "position:absolute;font:600 12px system-ui;color:#5a3a6e;transform:translate(-50%,0);pointer-events:none";
    host.appendChild(d);
    labels.push(d);
  }
function placeLabels() {
  rigs.forEach((r, i) => {
    if (!labels[i]) return;
    const v = r.pos.clone();
    v.y = -0.15;
    v.project(camera);
    labels[i].style.left = `${((v.x + 1) / 2) * host.clientWidth}px`;
    labels[i].style.top = `${((1 - v.y) / 2) * host.clientHeight}px`;
  });
}

function step(dt: number) {
  for (const r of rigs) r.rig.update(dt, speed);
}
if (fixedT !== null) {
  const T = Number(fixedT);
  for (let t = 0; t < T; t += 1 / 60) step(1 / 60);
  renderer.render(scene, camera);
  placeLabels();
  (window as unknown as Record<string, unknown>).__ready = true;
} else {
  let last = performance.now();
  const loop = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    step(dt);
    renderer.render(scene, camera);
    placeLabels();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  (window as unknown as Record<string, unknown>).__ready = true;
}
(window as unknown as Record<string, unknown>).__rigs = rigs;
