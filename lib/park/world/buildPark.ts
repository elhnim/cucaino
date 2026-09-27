// Builds the candy-world theme park scene from the places registry + scattered candy decor.
// Everything repeated is instanced; nothing casts real shadows (soft blob shadows instead).
import * as THREE from "three";
import type { ParkAssets, KitName } from "../assets/loader";
import { PLACES, SPAWN, type PlaceDef } from "../registry/places";
import { labelSprite } from "@/lib/game3d/buildingKit";

export interface BuiltPark {
  /** meshes that can be tapped, tagged with userData.placeId */
  tappables: THREE.Object3D[];
  places: PlaceDef[];
  update(dt: number, t: number): void;
  dispose(): void;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let n = Math.imul(s ^ (s >>> 15), 1 | s);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D) => void, repeat = 1) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  draw(cv.getContext("2d")!);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat !== 1) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
  }
  tex.anisotropy = 4;
  return tex;
}

/** Minty candy meadow with sugar sprinkles. */
function meadowTexture() {
  return canvasTexture(
    256,
    (c) => {
      c.fillStyle = "#6fe8ab";
      c.fillRect(0, 0, 256, 256);
      const r = rng(7);
      // soft lighter/darker mint patches instead of busy blades — calm at a distance
      for (let i = 0; i < 26; i++) {
        c.fillStyle = r() < 0.5 ? "rgba(88,214,150,0.6)" : "rgba(140,245,190,0.6)";
        c.beginPath();
        c.ellipse(r() * 256, r() * 256, 14 + r() * 20, 10 + r() * 14, r() * Math.PI, 0, Math.PI * 2);
        c.fill();
      }
      const sprinkles = ["#ff6fb5", "#ffd84a", "#5ec8ff", "#ffffff", "#b98bff"];
      for (let i = 0; i < 10; i++) {
        c.save();
        c.translate(r() * 256, r() * 256);
        c.rotate(r() * Math.PI);
        c.fillStyle = sprinkles[i % sprinkles.length];
        c.beginPath();
        c.roundRect(-6, -2.2, 12, 4.4, 2.2);
        c.fill();
        c.restore();
      }
    },
    26,
  );
}

/** Strawberry-and-cream checker for the central plaza. */
function plazaTexture() {
  return canvasTexture(
    128,
    (c) => {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          c.fillStyle = (x + y) % 2 ? "#ffb0d5" : "#fff2f8";
          c.fillRect(x * 16, y * 16, 16, 16);
        }
    },
    5,
  );
}

function skyTexture() {
  return canvasTexture(256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#b9a6ff");
    g.addColorStop(0.45, "#ffc2e2");
    g.addColorStop(0.75, "#ffe3cc");
    g.addColorStop(1, "#fff1d9");
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  });
}

function blobTexture() {
  return canvasTexture(64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(120,40,110,0.35)");
    g.addColorStop(1, "rgba(120,40,110,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
}

const m4 = (x: number, y: number, z: number, s: number, rotY = 0, sy = s) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(s, sy, s));

export async function buildPark(scene: THREE.Scene, assets: ParkAssets): Promise<BuiltPark> {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d);
  const toon = (color: string) => track(new THREE.MeshToonMaterial({ color }));

  // ── sky, fog, light ──
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(400, 24, 16)), track(new THREE.MeshBasicMaterial({ map: track(skyTexture()), side: THREE.BackSide, fog: false, depthWrite: false })));
  scene.add(sky);
  scene.fog = new THREE.Fog(0xffd0e6, 130, 380);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd6c8ff, 0.95));
  const sun = new THREE.DirectionalLight(0xffffff, 1.15);
  sun.position.set(-30, 50, 25);
  scene.add(sun);

  // ── ground ──
  const ground = new THREE.Mesh(track(new THREE.CircleGeometry(300, 48)), track(new THREE.MeshToonMaterial({ map: track(meadowTexture()) })));
  ground.rotation.x = -Math.PI / 2;
  ground.name = "ground";
  scene.add(ground);
  const plaza = new THREE.Mesh(track(new THREE.CylinderGeometry(8.5, 8.8, 0.25, 48)), track(new THREE.MeshToonMaterial({ map: track(plazaTexture()) })));
  plaza.position.y = 0.12;
  scene.add(plaza);
  const rim = new THREE.Mesh(track(new THREE.TorusGeometry(8.7, 0.28, 8, 64)), toon("#ff9ccf"));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.26;
  scene.add(rim);

  // ── paths: plaza edge -> every place, and gate -> plaza ──
  const pathMats: THREE.Matrix4[] = [];
  const segments: [number, number, number, number][] = [];
  const TILE = 3;
  const addPath = (x0: number, z0: number, x1: number, z1: number) => {
    segments.push([x0, z0, x1, z1]);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let d = TILE / 2; d < len; d += TILE) {
      const k = d / len;
      pathMats.push(m4(x0 + (x1 - x0) * k, 0.02, z0 + (z1 - z0) * k, TILE, yaw, 1));
    }
  };
  for (const p of PLACES) {
    if (p.id === "gate") continue;
    const len = Math.hypot(p.x, p.z);
    const ux = p.x / len;
    const uz = p.z / len;
    const stop = Math.max(0, len - p.radius - 1.2);
    if (stop > 8.5) addPath(ux * 8.5, uz * 8.5, ux * stop, uz * stop);
  }
  addPath(0, 8.5, 0, 38);
  const paths = await assets.instanced("coaster", "path-straight", pathMats);
  // strawberry-milk paths (the kit's grey stone would read as dull blue in the candy palette)
  const pathMat = toon("#ff9fcd");
  paths.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = pathMat;
  });
  scene.add(paths);

  const nearPath = (x: number, z: number, pad: number) =>
    segments.some(([x0, z0, x1, z1]) => {
      const dx = x1 - x0;
      const dz = z1 - z0;
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t)) < pad;
    });
  const nearPlace = (x: number, z: number, pad: number) => PLACES.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + pad);

  // ── places ──
  const tappables: THREE.Object3D[] = [];
  const blobTex = track(blobTexture());
  const blobMat = track(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  const blobGeo = track(new THREE.PlaneGeometry(1, 1));
  const bobbers: { obj: THREE.Object3D; base: number; phase: number }[] = [];
  for (const p of PLACES) {
    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);
    // face the plaza
    group.rotation.y = Math.atan2(-p.x, -p.z);
    if (p.id === "gate") group.rotation.y = 0;
    for (const m of p.models) {
      const obj = await assets.spawn(m.kit as KitName, m.id);
      obj.scale.setScalar(m.scale);
      if (m.offset) obj.position.set(m.offset[0], 0, m.offset[1]);
      if (m.rotY) obj.rotation.y = m.rotY;
      obj.traverse((o) => (o.userData.placeId = p.id));
      group.add(obj);
      if (p.action !== "none") tappables.push(obj);
    }
    if (p.radius > 0) {
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.rotation.x = -Math.PI / 2;
      blob.scale.setScalar(p.radius * 3);
      blob.position.y = 0.03;
      group.add(blob);
    }
    const sign = labelSprite(`${p.emoji} ${p.label}`);
    sign.scale.multiplyScalar(p.id === "gate" ? 1.3 : 0.95);
    sign.position.set(p.x, p.signY, p.z);
    track(sign.material);
    if ((sign.material as THREE.SpriteMaterial).map) track((sign.material as THREE.SpriteMaterial).map!);
    scene.add(sign);
    bobbers.push({ obj: sign, base: p.signY, phase: p.x * 0.3 });
    scene.add(group);
  }

  // centrepiece fountain with a giant swirl lollipop on top
  const fountain = await assets.spawn("town", "fountain-round-detail");
  fountain.scale.setScalar(3.2);
  fountain.position.y = 0.25;
  scene.add(fountain);
  const lolly = await assets.spawn("food", "lollypop");
  lolly.scale.setScalar(9);
  lolly.position.y = 1.2;
  scene.add(lolly);

  // ── scattered candy decor (deterministic) ──
  const r = rng(20260927);
  type Kind = { kit: KitName; id: string; count: number; s: [number, number]; minR: number; maxR: number; pad: number };
  const KINDS: Kind[] = [
    { kit: "food", id: "lollypop", count: 26, s: [9, 13], minR: 14, maxR: 70, pad: 2.5 },
    { kit: "nature", id: "tree_default", count: 22, s: [2.6, 3.6], minR: 16, maxR: 90, pad: 2.5 },
    { kit: "nature", id: "tree_oak", count: 18, s: [2.8, 3.8], minR: 16, maxR: 90, pad: 2.5 },
    { kit: "nature", id: "tree_fat", count: 18, s: [2.8, 3.6], minR: 18, maxR: 90, pad: 2.5 },
    { kit: "nature", id: "tree_cone", count: 14, s: [2.6, 3.4], minR: 22, maxR: 90, pad: 2.5 },
    { kit: "food", id: "cupcake", count: 9, s: [4, 6], minR: 12, maxR: 45, pad: 3 },
    { kit: "food", id: "donut-sprinkles", count: 10, s: [8, 11], minR: 12, maxR: 50, pad: 3 },
    { kit: "food", id: "ice-cream", count: 7, s: [5, 7], minR: 14, maxR: 55, pad: 2.5 },
    { kit: "food", id: "popsicle", count: 8, s: [6, 8], minR: 14, maxR: 55, pad: 2 },
    { kit: "food", id: "sundae", count: 5, s: [5, 6], minR: 16, maxR: 50, pad: 2 },
    { kit: "nature", id: "mushroom_redGroup", count: 26, s: [3.5, 5], minR: 10, maxR: 60, pad: 1.4 },
    { kit: "nature", id: "plant_bush", count: 40, s: [3.5, 5], minR: 10, maxR: 70, pad: 1.4 },
    { kit: "nature", id: "flower_purpleA", count: 60, s: [2.8, 3.8], minR: 9, maxR: 60, pad: 1 },
    { kit: "nature", id: "flower_redA", count: 60, s: [2.8, 3.8], minR: 9, maxR: 60, pad: 1 },
    { kit: "nature", id: "flower_yellowA", count: 60, s: [2.8, 3.8], minR: 9, maxR: 60, pad: 1 },
    { kit: "nature", id: "grass_large", count: 40, s: [3, 4], minR: 9, maxR: 70, pad: 1 },
    { kit: "holiday", id: "present-a-cube", count: 10, s: [1.6, 2.4], minR: 10, maxR: 40, pad: 1.4 },
  ];
  for (const k of KINDS) {
    const mats: THREE.Matrix4[] = [];
    let tries = 0;
    while (mats.length < k.count && tries++ < k.count * 30) {
      const a = r() * Math.PI * 2;
      const rad = k.minR + r() * (k.maxR - k.minR);
      const x = Math.sin(a) * rad;
      const z = Math.cos(a) * rad;
      if (nearPath(x, z, k.pad + 1.6) || nearPlace(x, z, k.pad + 1.5)) continue;
      mats.push(m4(x, 0, z, k.s[0] + r() * (k.s[1] - k.s[0]), r() * Math.PI * 2));
    }
    scene.add(await assets.instanced(k.kit, k.id, mats));
  }

  // candy canes + lanterns lining the paths
  const caneMats: THREE.Matrix4[] = [];
  const lanternMats: THREE.Matrix4[] = [];
  for (const [x0, z0, x1, z1] of segments) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const nx = -(z1 - z0) / len;
    const nz = (x1 - x0) / len;
    for (let d = 2; d < len; d += 4.5) {
      const k = d / len;
      const cx = x0 + (x1 - x0) * k;
      const cz = z0 + (z1 - z0) * k;
      const side = Math.round(d / 4.5) % 2 ? 1 : -1;
      if (Math.round(d / 4.5) % 3 === 0) lanternMats.push(m4(cx + nx * 2.1 * side, 0, cz + nz * 2.1 * side, 2.2));
      else caneMats.push(m4(cx + nx * 2 * side, 0, cz + nz * 2 * side, 5.5, Math.atan2(nx, nz)));
    }
  }
  scene.add(await assets.instanced("holiday", "candy-cane-red", caneMats));
  scene.add(await assets.instanced("town", "lantern", lanternMats));

  // benches around the plaza
  const benchMats: THREE.Matrix4[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    if (nearPath(Math.sin(a) * 10.5, Math.cos(a) * 10.5, 2)) continue;
    benchMats.push(m4(Math.sin(a) * 10.5, 0, Math.cos(a) * 10.5, 2.6, a + Math.PI));
  }
  scene.add(await assets.instanced("coaster", "bench", benchMats));

  // ── gumdrop hills on the horizon + cotton-candy clouds (make the park feel endless) ──
  const hillGeo = track(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2));
  const hillColors = ["#ffb3d6", "#b3f0d4", "#fff0a3", "#d6c2ff", "#a8dcff", "#ffcfa8"];
  const hills = new THREE.InstancedMesh(hillGeo, track(new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: null })), 34);
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + r() * 0.15;
    const rad = 110 + r() * 60;
    const s = 18 + r() * 26;
    hills.setMatrixAt(i, m4(Math.sin(a) * rad, -1, Math.cos(a) * rad, s, 0, s * (0.55 + r() * 0.35)));
    hills.setColorAt(i, new THREE.Color(hillColors[i % hillColors.length]));
  }
  scene.add(hills);

  const puffGeo = track(new THREE.SphereGeometry(1, 12, 8));
  const clouds = new THREE.InstancedMesh(puffGeo, track(new THREE.MeshToonMaterial({ color: "#ffffff" })), 70);
  const cloudBase: { x: number; y: number; z: number; s: number; speed: number }[] = [];
  for (let c = 0, i = 0; c < 14; c++) {
    const a = r() * Math.PI * 2;
    const rad = 30 + r() * 90;
    const cx = Math.sin(a) * rad;
    const cz = Math.cos(a) * rad;
    const cy = 24 + r() * 14;
    for (let p = 0; p < 5; p++, i++) {
      const s = 2.8 + r() * 2.4;
      cloudBase.push({ x: cx + (p - 2) * 2.6, y: cy + r() * 1.2, z: cz + r() * 1.5, s, speed: 0.6 + r() * 0.4 });
      clouds.setColorAt(i, new THREE.Color(p % 2 ? "#ffffff" : "#ffe3f1"));
    }
  }
  scene.add(clouds);

  const tmp = new THREE.Matrix4();
  return {
    tappables,
    places: PLACES,
    update(dt, t) {
      lolly.rotation.y += dt * 0.5;
      for (const b of bobbers) b.obj.position.y = b.base + Math.sin(t * 2 + b.phase) * 0.18;
      cloudBase.forEach((c, i) => {
        const x = ((c.x + t * c.speed + 150) % 300) - 150;
        clouds.setMatrixAt(i, tmp.compose(new THREE.Vector3(x, c.y, c.z), new THREE.Quaternion(), new THREE.Vector3(c.s * 1.2, c.s * 0.8, c.s)));
      });
      clouds.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
