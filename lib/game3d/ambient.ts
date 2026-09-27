import * as THREE from "three";
import { buildCritter, type Critter } from "./character";
import { labelSprite } from "./buildingKit";
import { makeGrassTexture, makeSkyGradientTexture, makeSparkleTexture } from "./textures";
import { getAnimal, type AnimalDef } from "./registry/animals";

/**
 * A small, light 3D meadow for the pre-game screens (login, kid-picker). No terrain
 * streaming, no shadow maps, no postprocessing, DPR capped — it must load instantly and
 * never compete with the form on top of it. But it IS interactive: every critter can be
 * tapped (it hops and sparkles), and on the kid-picker each kid stands in the meadow as
 * their chosen animal — tapping one picks that profile.
 */
export interface AmbientCharacter {
  id: string;
  label: string;
  animal: AnimalDef;
  accent: string;
}

export interface AmbientOptions {
  /** kid-picker: one tappable critter per kid; omitted = decorative login critters */
  characters?: AmbientCharacter[];
  onPick?: (id: string) => void;
}

export interface AmbientScene {
  dispose(): void;
}

const MAX_DT = 1 / 20;

export function createAmbientScene(container: HTMLElement, accent: string, opts: AmbientOptions = {}): AmbientScene {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf3e9ff, 18, 60);

  const skyTex = makeSkyGradientTexture("#8fd7ff", "#fdf2ff");
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(80, 16, 12),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  scene.add(sky);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6ea843, 1.05));
  const sun = new THREE.DirectionalLight(0xfff3d8, 0.9);
  sun.position.set(-6, 10, 8);
  scene.add(sun);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3; // ACES greys out whites (bunny, panda, unicorn) at 1.0
  container.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "manipulation";

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

  // meadow: a big grassy disc with flower dots, a few round trees and drifting clouds
  const grass = makeGrassTexture(42);
  grass.repeat.set(8, 8);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 40), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const flowerGeo = new THREE.SphereGeometry(0.09, 5, 4);
  const flowerColors = [0xe85b5b, 0xf2c14e, 0xef8fc0, 0xffffff, 0xb07be0];
  flowerColors.forEach((c, ci) => {
    const inst = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ color: c }), 24);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 14;
      m.makeTranslation(Math.sin(a) * r, 0.08, Math.cos(a) * r - 2 + ci * 0.01);
      inst.setMatrixAt(i, m);
    }
    scene.add(inst);
  });

  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 1.2, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: "#8a6a3c", flatShading: true });
  const leafGeo = new THREE.SphereGeometry(1, 8, 6);
  const leafMats = ["#5cb246", "#4c9a3a", "#7ccf5a"].map((c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true }));
  for (let i = 0; i < 9; i++) {
    const a = -1.2 + (i / 8) * 2.4 + (Math.random() - 0.5) * 0.2;
    const r = 11 + Math.random() * 6;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.6;
    const leaf = new THREE.Mesh(leafGeo, leafMats[i % 3]);
    leaf.position.y = 1.8;
    leaf.scale.setScalar(1 + Math.random() * 0.5);
    tree.add(trunk, leaf);
    tree.position.set(Math.sin(a) * r, 0, -Math.cos(a) * r);
    scene.add(tree);
  }

  const cloudMat = new THREE.MeshStandardMaterial({ color: "#ffffff", flatShading: true, transparent: true, opacity: 0.95 });
  const puffGeo = new THREE.SphereGeometry(1, 8, 6);
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const p = new THREE.Mesh(puffGeo, cloudMat);
      p.position.set(j * 1.1 - 1.6, Math.sin(j * 1.7) * 0.3, 0);
      p.scale.setScalar(0.9 + (j % 2) * 0.4);
      c.add(p);
    }
    c.position.set(-20 + i * 10, 9 + (i % 3) * 1.5, -22 - (i % 2) * 6);
    scene.add(c);
    clouds.push(c);
  }

  // characters
  const tappables: { critter: Critter; id: string | null }[] = [];
  const picking = !!opts.characters?.length;
  const labels: THREE.Sprite[] = [];
  if (picking) {
    const chars = opts.characters!;
    const n = chars.length;
    const spread = Math.min(2.4, 9 / Math.max(1, n));
    chars.forEach((ch, i) => {
      const critter = buildCritter({ bodyColor: "", bellyColor: "", accentColor: ch.accent, animal: ch.animal, scale: 1.1 });
      const x = (i - (n - 1) / 2) * spread;
      const z = -Math.abs(i - (n - 1) / 2) * 0.5; // gentle arc facing the camera
      critter.root.position.set(x, 0, z);
      // little round stage in each kid's colour
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.16, 20), new THREE.MeshStandardMaterial({ color: ch.accent, flatShading: true }));
      pad.position.set(x, 0.08, z);
      scene.add(pad);
      critter.root.position.y = 0.16;
      scene.add(critter.root);
      const label = labelSprite(ch.label);
      label.scale.multiplyScalar(0.55);
      label.position.set(x, 2.85, z);
      scene.add(label);
      labels.push(label);
      tappables.push({ critter, id: ch.id });
    });
    const width = Math.max(4, (n - 1) * spread + 3);
    camera.position.set(0, 2.4, Math.max(6.5, width * 1.05));
  } else {
    // spread wide so the critters peek out either side of / below the centred login card
    const cast: [string, number, number][] = [["fox", -3, 0.6], ["bunny", 3, 0.8], ["panda", -1.4, -1.6], ["unicorn", 1.6, -1.8]];
    for (const [id, x, z] of cast) {
      const critter = buildCritter({ bodyColor: "", bellyColor: "", accentColor: accent, animal: getAnimal(id), scale: id === "panda" ? 0.9 : 1 });
      critter.root.position.set(x, 0, z);
      scene.add(critter.root);
      tappables.push({ critter, id: null });
    }
    camera.position.set(0, 2.2, 7.5);
  }
  const lookY = picking ? 1.2 : 2.3;
  camera.lookAt(0, lookY, 0);
  const camBase = camera.position.clone();

  // sparkles drifting around, plus pooled tap-bursts
  const sparkTex = makeSparkleTexture();
  const sparkles: THREE.Sprite[] = [];
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.SpriteMaterial({ map: sparkTex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(0.25 + Math.random() * 0.3);
    s.position.set((Math.random() - 0.5) * 10, 0.6 + Math.random() * 3, (Math.random() - 0.5) * 4);
    s.userData.phase = Math.random() * Math.PI * 2;
    scene.add(s);
    sparkles.push(s);
  }
  const burstMat = new THREE.PointsMaterial({ map: sparkTex, size: 0.45, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe9a8 });
  const bursts: { pts: THREE.Points; vel: Float32Array; life: number }[] = [];
  function burst(at: THREE.Vector3) {
    const n = 16;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos.set([at.x, at.y, at.z], i * 3);
      vel.set([(Math.random() - 0.5) * 3, Math.random() * 3 + 1.5, (Math.random() - 0.5) * 3], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, burstMat);
    scene.add(pts);
    bursts.push({ pts, vel, life: 0.9 });
  }

  function applySize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / Math.max(1, h);
    // narrow phones: back the camera off so every kid still fits on screen
    const fit = camera.aspect < 0.8 ? 1 / Math.max(0.45, camera.aspect / 0.8) : 1;
    camera.position.copy(camBase).multiplyScalar(1).setZ(camBase.z * fit);
    camera.lookAt(0, lookY, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  applySize();
  const resizeObserver = new ResizeObserver(applySize);
  resizeObserver.observe(container);

  const raycaster = new THREE.Raycaster();
  let picked = false;
  function onPointerDown(e: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    for (const t of tappables) {
      if (raycaster.intersectObject(t.critter.root, true).length === 0) continue;
      t.critter.celebrate();
      burst(t.critter.root.position.clone().setY(1.6));
      if (t.id && opts.onPick && !picked) {
        picked = true; // let the hop play, then hand over (PIN pad etc.)
        const id = t.id;
        window.setTimeout(() => {
          picked = false;
          opts.onPick?.(id);
        }, 450);
      }
      return;
    }
  }
  renderer.domElement.addEventListener("pointerdown", onPointerDown);

  // Paint one frame immediately regardless of tab visibility, so the backdrop is never
  // blank on first mount — the animated loop below still skips work while hidden.
  renderer.render(scene, camera);

  let disposed = false;
  let frameId = 0;
  const clock = new THREE.Clock();
  let nextWave = 1;

  function tick() {
    if (disposed) return;
    if (!document.hidden) {
      const dt = Math.min(clock.getDelta(), MAX_DT);
      const t = clock.elapsedTime;
      for (const tp of tappables) tp.critter.update(dt, false);
      nextWave -= dt;
      if (nextWave <= 0 && tappables.length) {
        tappables[Math.floor(Math.random() * tappables.length)].critter.wave();
        nextWave = 1.6 + Math.random() * 1.8;
      }
      labels.forEach((l, i) => (l.position.y = 2.85 + Math.sin(t * 2 + i) * 0.06));
      for (const s of sparkles) {
        const phase = (s.userData.phase as number) + t * 0.4;
        s.position.y += Math.sin(phase) * dt * 0.15;
      }
      for (const c of clouds) c.position.x = ((c.position.x + dt * 0.4 + 30) % 60) - 30;
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.life -= dt;
        const attr = b.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let k = 0; k < b.vel.length; k += 3) {
          b.vel[k + 1] -= dt * 5;
          arr[k] += b.vel[k] * dt;
          arr[k + 1] += b.vel[k + 1] * dt;
          arr[k + 2] += b.vel[k + 2] * dt;
        }
        attr.needsUpdate = true;
        if (b.life <= 0) {
          scene.remove(b.pts);
          b.pts.geometry.dispose();
          bursts.splice(i, 1);
        }
      }
      camera.position.x = camBase.x + Math.sin(t * 0.08) * 0.8;
      camera.lookAt(0, lookY, 0);
      renderer.render(scene, camera);
    } else {
      clock.getDelta(); // avoid a huge dt spike when the tab becomes visible again
    }
    frameId = requestAnimationFrame(tick);
  }
  frameId = requestAnimationFrame(tick);

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
        for (const m of mats) {
          for (const key of Object.keys(m) as (keyof THREE.Material)[]) {
            const value = m[key];
            if (value instanceof THREE.Texture) value.dispose();
          }
          m.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
    },
  };
}
