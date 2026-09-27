// The candy meadow behind login and the kid picker: each kid stands on their own candy pad as
// their chosen Cube Pets animal — tap one to pick that profile. Light by design: no terrain,
// no shadow maps, DPR capped, pauses while hidden. The camera fits every kid on screen in both
// portrait (phones) and landscape (tablets); many kids wrap onto two rows on narrow screens.
import * as THREE from "three";
import { ParkAssets, type AnimalId } from "../assets/loader";
import { DEFAULT_CANDY } from "../assets/candy";
import { labelSprite } from "@/lib/game3d/buildingKit";
import { makeSparkleTexture } from "@/lib/game3d/textures";

export interface PickerCharacter {
  id: string;
  label: string;
  animal: AnimalId;
  accent: string;
}

export interface PickerOptions {
  characters?: PickerCharacter[];
  onPick?: (id: string) => void;
}

export interface PickerScene {
  dispose(): void;
  /** render one frame now and return it as an image (smoke tests; works in background tabs) */
  snapshot(): string;
}

interface Stand {
  id: string | null;
  root: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  actions: Map<string, THREE.AnimationAction>;
  label: THREE.Sprite | null;
  hop: number;
}

function skyTexture() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const c = cv.getContext("2d")!;
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#b9a6ff");
  g.addColorStop(0.5, "#ffc2e2");
  g.addColorStop(1, "#ffe8d2");
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createPickerScene(container: HTMLElement, opts: PickerOptions = {}): PickerScene {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffd6ea, 30, 90);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd6c8ff, 1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(-6, 10, 8);
  scene.add(sun);
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(120, 20, 14), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false })));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 40), new THREE.MeshToonMaterial({ color: "#6fe8ab" }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "manipulation";
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  const assets = new ParkAssets(DEFAULT_CANDY);

  const chars = opts.characters?.length ? opts.characters : null;
  const stands: Stand[] = [];
  let disposed = false;
  let rows = 1;
  let cols = 1;
  const SPREAD = 3.4;
  const ROW_GAP = 4.2;

  // lay the kids out: one row on wide screens, two rows on narrow phones with lots of kids
  function layout(aspect: number) {
    const n = stands.filter((s) => s.id).length || stands.length;
    rows = aspect < 0.8 && n > 2 ? 2 : 1;
    cols = Math.ceil(n / rows);
    let i = 0;
    for (const s of stands) {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, n - row * cols);
      const col = i % cols;
      const x = (col - (inRow - 1) / 2) * SPREAD;
      const z = rows === 2 ? (row === 0 ? -ROW_GAP / 2 : ROW_GAP / 2) : -Math.abs(col - (inRow - 1) / 2) * 0.4;
      s.root.position.set(x, 0, z);
      i++;
    }
  }

  function fitCamera() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / Math.max(1, h);
    layout(camera.aspect);
    const width = Math.max(4, (cols - 1) * SPREAD + 3.2);
    const depth = rows === 2 ? ROW_GAP + 3 : 3;
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const distW = width / 2 / Math.tan(hfov / 2);
    const distH = (depth + 3) / 2 / Math.tan(vfov / 2);
    const dist = Math.max(distW, distH, 6.5) * 1.02;
    // kids sit in the lower-middle of the screen, leaving room for the title above
    camera.position.set(0, 2.4 + dist * 0.18, dist);
    camera.lookAt(0, chars ? 1.6 : 2.4, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  async function addStand(id: string | null, animal: AnimalId, accent: string, label: string | null) {
    const gltf = await assets.spawnAnimal(animal);
    if (disposed) return;
    const model = gltf.root;
    const box = new THREE.Box3().setFromObject(model);
    model.scale.setScalar(2 / (box.max.y - box.min.y || 1));
    const root = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.35, 0.25, 28), new THREE.MeshToonMaterial({ color: accent }));
    pad.position.y = 0.12;
    root.add(pad);
    model.position.y = 0.25;
    root.add(model);
    root.traverse((o) => (o.userData.standId = id));
    let sprite: THREE.Sprite | null = null;
    if (label) {
      sprite = labelSprite(label);
      sprite.scale.multiplyScalar(0.6);
      sprite.position.y = 3.2;
      root.add(sprite);
    }
    const mixer = gltf.clips.length ? new THREE.AnimationMixer(model) : null;
    const actions = new Map<string, THREE.AnimationAction>();
    for (const c of gltf.clips) if (mixer) actions.set(c.name, mixer.clipAction(c));
    actions.get("idle")?.play();
    scene.add(root);
    stands.push({ id, root, mixer, actions, label: sprite, hop: 0 });
  }

  // candy decor ring behind the kids
  void (async () => {
    const m = (x: number, z: number, s: number, r = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r, 0)), new THREE.Vector3(s, s, s));
    const lollies = [];
    const trees = [];
    const flowers = [];
    for (let i = 0; i < 18; i++) {
      const a = -1.3 + (i / 17) * 2.6;
      lollies.push(m(Math.sin(a) * (16 + (i % 3) * 3), -Math.cos(a) * (12 + (i % 4) * 2.5), 10 + (i % 3) * 2, i));
      trees.push(m(Math.sin(a + 0.08) * (20 + (i % 2) * 5), -Math.cos(a + 0.08) * (16 + (i % 3) * 3), 3 + (i % 2), i));
    }
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 14;
      flowers.push(m(Math.sin(a) * r, Math.cos(a) * r, 2.6, a));
    }
    try {
      const [l, t, f] = await Promise.all([assets.instanced("food", "lollypop", lollies), assets.instanced("nature", "tree_default", trees), assets.instanced("nature", "flower_purpleA", flowers)]);
      if (!disposed) scene.add(l, t, f);
    } catch {
      // decor is optional
    }
  })();

  if (chars) {
    void Promise.all(chars.map((c) => addStand(c.id, c.animal, c.accent, c.label))).then(fitCamera);
  } else {
    const cast: [AnimalId, string][] = [["animal-fox", "#ff9ccf"], ["animal-bunny", "#9ad8ff"], ["animal-panda", "#ffe16b"], ["animal-lion", "#c9a3ff"]];
    void Promise.all(cast.map(([a, col]) => addStand(null, a, col, null))).then(fitCamera);
  }

  // sparkles
  const sparkTex = makeSparkleTexture();
  const sparkMat = new THREE.SpriteMaterial({ map: sparkTex, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparkles: THREE.Sprite[] = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(sparkMat);
    s.scale.setScalar(0.3 + Math.random() * 0.3);
    s.position.set((Math.random() - 0.5) * 14, 0.6 + Math.random() * 4, (Math.random() - 0.5) * 6);
    s.userData.phase = Math.random() * 6;
    scene.add(s);
    sparkles.push(s);
  }

  fitCamera();
  const ro = new ResizeObserver(fitCamera);
  ro.observe(container);

  const ray = new THREE.Raycaster();
  let picked = false;
  function onDown(e: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
    for (const s of stands) {
      if (ray.intersectObject(s.root, true).length === 0) continue;
      s.hop = 0.8;
      const dance = s.actions.get("dance");
      if (dance) {
        dance.reset().setLoop(THREE.LoopOnce, 1).play();
      }
      if (s.id && opts.onPick && !picked) {
        picked = true;
        const id = s.id;
        window.setTimeout(() => {
          picked = false;
          opts.onPick?.(id);
        }, 420);
      }
      return;
    }
  }
  renderer.domElement.addEventListener("pointerdown", onDown);

  renderer.render(scene, camera);
  const clock = new THREE.Clock();
  let frame = 0;
  let nextWave = 1.2;
  function tick() {
    if (disposed) return;
    if (!document.hidden) {
      const dt = Math.min(clock.getDelta(), 1 / 20);
      const t = clock.elapsedTime;
      nextWave -= dt;
      if (nextWave <= 0 && stands.length) {
        const s = stands[Math.floor(Math.random() * stands.length)];
        const g = s.actions.get("gesture-positive");
        if (g) g.reset().setLoop(THREE.LoopOnce, 1).play();
        nextWave = 1.8 + Math.random() * 2;
      }
      for (const s of stands) {
        s.mixer?.update(dt);
        if (s.hop > 0) {
          s.hop = Math.max(0, s.hop - dt);
          s.root.position.y = Math.abs(Math.sin(s.hop * 12)) * 0.5;
        }
        if (s.label) s.label.position.y = 3.2 + Math.sin(t * 2 + s.root.position.x) * 0.08;
      }
      for (const sp of sparkles) sp.position.y += Math.sin((sp.userData.phase as number) + t * 0.6) * dt * 0.2;
      renderer.render(scene, camera);
    } else clock.getDelta();
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);

  return {
    snapshot() {
      for (const st of stands) st.mixer?.update(1 / 30);
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL("image/jpeg", 0.8);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry && !(o as THREE.InstancedMesh).isInstancedMesh) mesh.geometry.dispose();
      });
      assets.dispose();
      sparkMat.dispose();
      sparkTex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
