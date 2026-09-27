import * as THREE from "three";
import {
  makeDirtPathTexture,
  makeStoneTexture,
  makeSkyGradientTexture,
  makeSparkleTexture,
  makeWaterTexture,
} from "./textures";
import { labelSprite, pyramidRoof, woodBox, flag } from "./buildingKit";
import { LANDMARKS, type LandmarkKey } from "./types";
import { GROUND_BASE_Y as G } from "./terrainMath";
import type { Biome } from "./biomes";
import { ATTRACTIONS, attractionPosition } from "./registry/attractions";

export const ISLAND_RADIUS = 34;
export const LANDMARK_RING = 24;
export const LANDMARK_TRIGGER_RADIUS = 4.2;

export interface LandmarkNode {
  key: LandmarkKey;
  position: THREE.Vector3;
  radius: number;
}

export interface Village {
  landmarks: LandmarkNode[];
  spawnPoint: THREE.Vector3;
  /** advance ambient animation + collectible sparkle pickups; returns how many were collected this tick */
  update(dt: number, playerPos: THREE.Vector3): number;
}

function buildBarn(accent: string): THREE.Group {
  const g = new THREE.Group();
  const body = woodBox(3.1, 2.5, 2.6, "#b5432f");
  body.position.y = 1.25;
  g.add(body);
  const roof = pyramidRoof(2.5, 1.9, "#6b3a2a");
  roof.position.y = 2.5 + 0.95;
  g.add(roof);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(3.15, 0.18, 2.65), new THREE.MeshStandardMaterial({ color: 0xf3e6c8, flatShading: true }));
  trim.position.y = 2.5;
  g.add(trim);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.4), new THREE.MeshStandardMaterial({ color: 0x3d2416 }));
  door.position.set(0, 0.7, 1.31);
  g.add(door);
  const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.1, 10), new THREE.MeshStandardMaterial({ color: 0xd8d2c0, flatShading: true }));
  silo.position.set(-2.2, 1.05, -0.6);
  silo.castShadow = true;
  g.add(silo);
  const siloTop = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.7, 10), new THREE.MeshStandardMaterial({ color: accent, flatShading: true }));
  siloTop.position.set(-2.2, 2.1 + 0.35, -0.6);
  g.add(siloTop);
  const f = flag(accent, 3.4);
  f.position.set(1.9, 2.5, -1.1);
  g.add(f);
  g.userData.flags = [f];
  return g;
}

function buildMarket(accent: string): THREE.Group {
  const g = new THREE.Group();
  const body = woodBox(2.7, 2.1, 2.4, "#d9b98a");
  body.position.y = 1.05;
  g.add(body);
  const roof = pyramidRoof(2.2, 1.5, "#c8483f");
  roof.position.y = 2.1 + 0.72;
  g.add(roof);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(2, 0.08, 1.1), new THREE.MeshStandardMaterial({ color: "#f4f1e6", flatShading: true }));
  awning.rotation.x = -0.35;
  awning.position.set(0, 1.55, 1.5);
  g.add(awning);
  for (let i = -2; i <= 2; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.085, 1.12), new THREE.MeshStandardMaterial({ color: i % 2 ? "#c8483f" : "#f4f1e6" }));
    stripe.rotation.x = -0.35;
    stripe.position.set(i * 0.4, 1.55, 1.5);
    g.add(stripe);
  }
  const cart = new THREE.Group();
  const cartBox = woodBox(1.1, 0.6, 0.7, "#a9713f");
  cartBox.position.y = 0.6;
  cart.add(cartBox);
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x3d2416 }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 0.5, 0.3, 0.32);
    cart.add(wheel);
  }
  cart.position.set(2.1, 0, -1.2);
  cart.rotation.y = 0.4;
  g.add(cart);
  for (const [x, z] of [[-1.9, 1], [-1.5, 1.4]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.65, 10), new THREE.MeshStandardMaterial({ color: 0x8a6a3c, flatShading: true }));
    barrel.position.set(x, 0.32, z);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.03, 6, 12), new THREE.MeshStandardMaterial({ color: accent, flatShading: true }));
    band.rotation.x = Math.PI / 2;
    barrel.add(band);
    barrel.castShadow = true;
    g.add(barrel);
  }
  return g;
}

function buildTower(accent: string): THREE.Group {
  const g = new THREE.Group();
  const stoneTex = makeStoneTexture();
  stoneTex.repeat.set(2, 3);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 4.4, 12), new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.9, flatShading: true }));
  shaft.position.y = 2.2;
  shaft.castShadow = true;
  g.add(shaft);
  const balcony = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.25, 12), new THREE.MeshStandardMaterial({ color: "#8a6a3c", flatShading: true }));
  balcony.position.y = 3.5;
  g.add(balcony);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.7, 12), new THREE.MeshStandardMaterial({ color: accent, flatShading: true }));
  roof.position.y = 4.4 + 0.85;
  roof.castShadow = true;
  g.add(roof);
  const f = flag("#ffffff", 1.2);
  f.position.y = 4.4 + 1.7;
  g.add(f);
  g.userData.flags = [f];
  return g;
}

function buildTent(accent: string): THREE.Group {
  const g = new THREE.Group();
  const wedges = 10;
  const tentHeight = 3.4;
  const colors = [accent, "#ffffff"];
  for (let i = 0; i < wedges; i++) {
    const geo = new THREE.ConeGeometry(2.6, tentHeight, 3, 1, false, (i / wedges) * Math.PI * 2, (Math.PI * 2) / wedges);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: colors[i % 2], flatShading: true }));
    mesh.position.y = tentHeight / 2;
    mesh.castShadow = true;
    g.add(mesh);
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.65, 2.75, 0.5, 16), new THREE.MeshStandardMaterial({ color: "#f4f1e6", flatShading: true }));
  base.position.y = 0.25;
  g.add(base);
  const f = flag(accent, 1.2);
  f.position.y = 3.4;
  g.add(f);
  g.userData.flags = [f];
  return g;
}

function buildCottage(accent: string): { group: THREE.Group; smoke: THREE.Sprite[] } {
  const g = new THREE.Group();
  const body = woodBox(2.6, 1.9, 2.3, "#e7c9a3");
  body.position.y = 0.95;
  g.add(body);
  const roof = pyramidRoof(2.05, 1.4, accent);
  roof.position.y = 1.9 + 0.67;
  g.add(roof);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.35), new THREE.MeshStandardMaterial({ color: "#9c8a78", flatShading: true }));
  chimney.position.set(0.7, 2.35, 0.2);
  g.add(chimney);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), new THREE.MeshStandardMaterial({ color: "#6b3a2a" }));
  door.position.set(0, 0.55, 1.16);
  g.add(door);
  for (const [x, y, r] of [[-0.6, 0.9, 0], [0.5, 0.9, 0]] as [number, number, number][]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshStandardMaterial({ color: "#bfe6ff", emissive: 0x224466, emissiveIntensity: 0.4 }));
    win.position.set(x, y, 1.16);
    win.rotation.y = r;
    g.add(win);
  }
  // little fenced yard
  const fenceR = 2.1;
  for (let i = 0; i <= 6; i++) {
    const a = -0.9 + (i / 6) * 1.8;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 5), new THREE.MeshStandardMaterial({ color: "#8a6a3c" }));
    post.position.set(Math.sin(a) * fenceR, 0.27, Math.cos(a) * fenceR + 0.6);
    g.add(post);
  }
  const sparkTex = makeSparkleTexture();
  const smoke: THREE.Sprite[] = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.SpriteMaterial({ map: sparkTex, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(mat);
    s.scale.set(0.45, 0.45, 1);
    s.position.set(0.7, 2.7 + i * 0.4, 0.2);
    s.userData.phase = i * 1.4;
    g.add(s);
    smoke.push(s);
  }
  return { group: g, smoke };
}

function scatterTrees(scene: THREE.Scene, avoid: (x: number, z: number) => boolean) {
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1.1, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: "#8a6a3c", flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({ color: "#4c9a3a", flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, 60);
  const leaves1 = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1.6, 7), leafMat, 60);
  const leaves2 = new THREE.InstancedMesh(new THREE.ConeGeometry(0.75, 1.3, 7), new THREE.MeshStandardMaterial({ color: "#5cb246", flatShading: true }), 60);
  trunks.castShadow = leaves1.castShadow = leaves2.castShadow = true;
  const m = new THREE.Matrix4();
  let count = 0;
  let attempts = 0;
  while (count < 60 && attempts < 600) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * (ISLAND_RADIUS - 12);
    const x = Math.sin(angle) * r, z = Math.cos(angle) * r;
    if (avoid(x, z)) continue;
    const s = 0.85 + Math.random() * 0.5;
    m.compose(new THREE.Vector3(x, G + 0.55 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(count, m);
    m.compose(new THREE.Vector3(x, G + (1.1 + 0.85) * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, 0)), new THREE.Vector3(s, s, s));
    leaves1.setMatrixAt(count, m);
    m.compose(new THREE.Vector3(x, G + (1.1 + 1.55) * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, 0)), new THREE.Vector3(s, s, s));
    leaves2.setMatrixAt(count, m);
    count++;
  }
  trunks.count = leaves1.count = leaves2.count = count;
  scene.add(trunks, leaves1, leaves2);
}

function scatterSmall(scene: THREE.Scene, avoid: (x: number, z: number) => boolean) {
  const bushGeo = new THREE.SphereGeometry(0.5, 7, 5);
  const bush = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ color: "#5cb246", flatShading: true }), 30);
  const rockGeo = new THREE.DodecahedronGeometry(0.4, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: "#9b9284", flatShading: true }), 16);
  const flowerColors = [0xe85b5b, 0xf2c14e, 0xef8fc0, 0xffffff, 0xb07be0];
  const flowerGeo = new THREE.SphereGeometry(0.13, 6, 5);
  const flowerGroups = flowerColors.map((c) => new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ color: c, flatShading: true }), 20));
  const m = new THREE.Matrix4();
  let bc = 0, rc = 0;
  const fc = flowerColors.map(() => 0);
  let attempts = 0;
  while ((bc < 30 || rc < 16) && attempts < 900) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * (ISLAND_RADIUS - 10);
    const x = Math.sin(angle) * r, z = Math.cos(angle) * r;
    if (avoid(x, z)) continue;
    const roll = Math.random();
    if (roll < 0.5 && bc < 30) {
      const s = 0.7 + Math.random() * 0.6;
      m.compose(new THREE.Vector3(x, G + 0.32 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.8, s));
      bush.setMatrixAt(bc++, m);
    } else if (rc < 16) {
      const s = 0.6 + Math.random() * 0.8;
      m.compose(new THREE.Vector3(x, G + 0.25 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random(), Math.random(), Math.random())), new THREE.Vector3(s, s, s));
      rocks.setMatrixAt(rc++, m);
    }
  }
  // flower patches: little clusters so they read as flower beds, not noise
  let patches = 0, patchAttempts = 0;
  while (patches < 10 && patchAttempts < 200) {
    patchAttempts++;
    const angle = Math.random() * Math.PI * 2;
    const r = 5 + Math.random() * (ISLAND_RADIUS - 10);
    const cx = Math.sin(angle) * r, cz = Math.cos(angle) * r;
    if (avoid(cx, cz)) continue;
    patches++;
    for (let i = 0; i < 5; i++) {
      const gi = Math.floor(Math.random() * flowerGroups.length);
      if (fc[gi] >= 20) continue;
      const x = cx + (Math.random() - 0.5) * 1.4, z = cz + (Math.random() - 0.5) * 1.4;
      m.compose(new THREE.Vector3(x, G + 0.13, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      flowerGroups[gi].setMatrixAt(fc[gi]++, m);
    }
  }
  bush.count = bc;
  rocks.count = rc;
  bush.castShadow = rocks.castShadow = true;
  scene.add(bush, rocks);
  flowerGroups.forEach((g, i) => {
    g.count = fc[i];
    scene.add(g);
  });
}

export interface VillageOptions {
  biome: Biome;
  /** low tier drops the plaza point lights (each one adds per-pixel cost to every lit material) */
  lowQuality?: boolean;
}

export function buildVillage(scene: THREE.Scene, accent: string, opts: VillageOptions): Village {
  const { biome, lowQuality = false } = opts;
  // sky dome
  const skyTex = makeSkyGradientTexture(biome.skyTop, biome.skyBottom);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(biome.fog, 70, 240);

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(6, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff3c0 }),
  );
  sun.position.set(-90, 70, -60);
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0xbfe6ff, 0x6ea843, 0.85);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xfff3d8, 1.35);
  dir.position.set(-40, 55, 24);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.left = -50;
  dir.shadow.camera.right = 50;
  dir.shadow.camera.top = 50;
  dir.shadow.camera.bottom = -50;
  dir.shadow.camera.far = 160;
  dir.shadow.bias = -0.0025;
  scene.add(dir);
  scene.add(dir.target);

  // The ground itself (village clearing + endless countryside beyond it) is owned by
  // terrain.ts now — this module only places the hand-built plaza/landmarks/decor on top of it.

  // distant floating islands for depth/parallax
  for (const [ax, r, s] of [[40, 95, 5], [150, 120, 6.5], [260, 105, 4]] as [number, number, number][]) {
    const rad = (ax * Math.PI) / 180;
    const fi = new THREE.Group();
    fi.position.set(Math.sin(rad) * r, -6 + Math.random() * 4, Math.cos(rad) * r);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(s, s - 1, 1.4, 12), [
      new THREE.MeshStandardMaterial({ color: 0x9b8a6c }),
      new THREE.MeshStandardMaterial({ color: 0x6ea843 }),
      new THREE.MeshStandardMaterial({ color: 0x6b5a3c }),
    ]);
    fi.add(top);
    const treeTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.3, 6), new THREE.MeshStandardMaterial({ color: "#8a6a3c" }));
    treeTrunk.position.y = 1.35;
    fi.add(treeTrunk);
    const treeLeaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2, 7), new THREE.MeshStandardMaterial({ color: "#4c9a3a" }));
    treeLeaf.position.y = 2.6;
    fi.add(treeLeaf);
    scene.add(fi);
  }

  // birds
  const birds: { group: THREE.Group; r: number; speed: number; phase: number; y: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 5), new THREE.MeshStandardMaterial({ color: 0x3a3a3a }));
    body.rotation.x = Math.PI / 2;
    g.add(body);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, side: THREE.DoubleSide }));
      wing.position.x = side * 0.25;
      wing.userData.side = side;
      g.add(wing);
    }
    scene.add(g);
    birds.push({ group: g, r: 20 + i * 6, speed: 0.25 + i * 0.05, phase: i * 1.7, y: 14 + i * 2 });
  }

  // plaza
  const stoneTexPlaza = makeStoneTexture();
  stoneTexPlaza.repeat.set(3, 3);
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.8, 0.6, 24), new THREE.MeshStandardMaterial({ map: stoneTexPlaza, roughness: 0.9 }));
  plaza.position.y = 1.8;
  plaza.receiveShadow = true;
  scene.add(plaza);
  const waterTex = makeWaterTexture();
  const fountainBasin = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.5, 20), new THREE.MeshStandardMaterial({ color: "#d8d2c0", flatShading: true }));
  fountainBasin.position.y = 2.35;
  scene.add(fountainBasin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.05, 20), new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.3, metalness: 0.1 }));
  water.position.y = 2.62;
  scene.add(water);
  const spout = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 10), new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.15, flatShading: true }));
  spout.position.y = 3.2;
  scene.add(spout);

  const lampPositions: [number, number][] = [[4.6, 4.6], [-4.6, 4.6], [4.6, -4.6], [-4.6, -4.6]];
  for (const [x, z] of lampPositions) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6), new THREE.MeshStandardMaterial({ color: "#3a3a3a" }));
    post.position.set(x, 2.9, z);
    scene.add(post);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffe6a0, emissive: 0xffcf6b, emissiveIntensity: 0.9 }));
    glow.position.set(x, 3.95, z);
    scene.add(glow);
    if (!lowQuality) {
      const light = new THREE.PointLight(0xffcf6b, 0.6, 9);
      light.position.set(x, 3.95, z);
      scene.add(light);
    }
  }

  // theme-park bunting: a sagging ring of pennants strung between the plaza lamps.
  // One InstancedMesh with per-instance colours = a single draw call for all of them.
  const PENNANTS = 48;
  const pennantGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.22, 0, 0),
    new THREE.Vector3(0.22, 0, 0),
    new THREE.Vector3(0, -0.5, 0),
  ]);
  pennantGeo.computeVertexNormals();
  const pennants = new THREE.InstancedMesh(pennantGeo, new THREE.MeshStandardMaterial({ color: "#ffffff", side: THREE.DoubleSide, flatShading: true }), PENNANTS);
  const pennantColors = [0xff5d8f, 0xffd447, 0x4ade80, 0x60a5fa, 0xc084fc, 0xfb923c].map((c) => new THREE.Color(c));
  const pm = new THREE.Matrix4();
  for (let i = 0; i < PENNANTS; i++) {
    const a = (i / PENNANTS) * Math.PI * 2;
    const seg = (((a - Math.PI / 4) / (Math.PI / 2)) % 1 + 1) % 1; // 0..1 between neighbouring lamps (at 45°, 135°, ...)
    const sag = Math.sin(seg * Math.PI) * 0.7;
    const r = 6.5;
    pm.compose(
      new THREE.Vector3(Math.sin(a) * r, 4.05 - sag, Math.cos(a) * r),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a + Math.PI / 2, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    pennants.setMatrixAt(i, pm);
    pennants.setColorAt(i, pennantColors[i % pennantColors.length]);
  }
  scene.add(pennants);

  // landmarks laid out around the plaza, joined by paths
  const pathTex = makeDirtPathTexture();
  const landmarks: LandmarkNode[] = [];
  for (const def of LANDMARKS) {
    const rad = (def.angleDeg * Math.PI) / 180;
    const pos = new THREE.Vector3(Math.sin(rad) * LANDMARK_RING, 1.5, Math.cos(rad) * LANDMARK_RING);

    const dist = pos.length();
    const dirN = pos.clone().normalize();
    const startR = 6.2;
    const mid = dirN.clone().multiplyScalar((dist + startR) / 2);
    mid.y = 1.51;
    const len = dist - startR;
    const angle = Math.atan2(pos.x, pos.z);
    const tex = pathTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1.4, Math.max(1, len / 3.4));
    const path = new THREE.Mesh(new THREE.PlaneGeometry(3.4, len), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    path.rotation.x = -Math.PI / 2;
    path.rotation.z = -angle;
    path.position.copy(mid);
    path.receiveShadow = true;
    scene.add(path);

    let group: THREE.Group;
    let radius = 3.4;
    if (def.key === "work") group = buildBarn(accent);
    else if (def.key === "shop") group = buildMarket(accent);
    else if (def.key === "friends") { group = buildTower(accent); radius = 3; }
    else if (def.key === "playground") group = buildTent(accent);
    else {
      const cottage = buildCottage(accent);
      group = cottage.group;
      group.userData.smoke = cottage.smoke;
    }
    group.position.copy(pos);
    group.position.y = 1.5;
    group.lookAt(0, 1.5, 0);
    scene.add(group);

    const label = labelSprite(`${def.emoji} ${def.label}`);
    label.position.copy(pos).setY(pos.y + radius + 2.6);
    scene.add(label);

    landmarks.push({ key: def.key, position: pos.clone().setY(1.5), radius });
  }

  const attractionSpots = ATTRACTIONS.map((a) => ({ p: attractionPosition(a, 0), clear: a.clearance ?? 4 }));
  const nearAttraction = (x: number, z: number, pad: number) =>
    attractionSpots.some(({ p, clear }) => Math.hypot(x - p.x, z - p.z) < Math.max(pad, clear));
  scatterTrees(scene, (x, z) => {
    if (Math.hypot(x, z) < 8 || nearAttraction(x, z, 4)) return true;
    for (const l of landmarks) if (Math.hypot(x - l.position.x, z - l.position.z) < l.radius + 2.2) return true;
    return Math.hypot(x, z) > ISLAND_RADIUS - 3;
  });
  scatterSmall(scene, (x, z) => {
    if (Math.hypot(x, z) < 7.5 || nearAttraction(x, z, 3)) return true;
    for (const l of landmarks) if (Math.hypot(x - l.position.x, z - l.position.z) < l.radius + 1.6) return true;
    return Math.hypot(x, z) > ISLAND_RADIUS - 3;
  });

  // collectible sparkle coins scattered along the paths, for a little bonus fun
  const coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 14);
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd447, emissive: 0xb8860b, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.3 });
  const COIN_Y = G + 0.9;
  const COIN_RESPAWN_S = 25;
  const coins: THREE.Mesh[] = [];
  for (const l of landmarks) {
    const dirN = l.position.clone().setY(0).normalize();
    for (const t of [0.35, 0.65]) {
      const p = dirN.clone().multiplyScalar(6.2 + (l.position.length() - 6.2) * t);
      const coin = new THREE.Mesh(coinGeo, coinMat);
      coin.position.set(p.x + (Math.random() - 0.5) * 1.2, COIN_Y, p.z + (Math.random() - 0.5) * 1.2);
      coin.castShadow = true;
      coin.userData.bobPhase = Math.random() * Math.PI * 2;
      scene.add(coin);
      coins.push(coin);
    }
  }

  const sparkTex = makeSparkleTexture();
  const bursts: { pts: THREE.Points; life: number }[] = [];
  function spawnBurst(pos: THREE.Vector3) {
    const n = 10;
    const positions = new Float32Array(n * 3);
    const velocities: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      velocities.push(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3 + 1, (Math.random() - 0.5) * 3));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ map: sparkTex, size: 0.55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff3c0 });
    const pts = new THREE.Points(geo, mat);
    pts.userData.velocities = velocities;
    scene.add(pts);
    bursts.push({ pts, life: 0.7 });
  }

  // butterflies drifting over the flower beds — two planes each, almost free to draw
  const butterflyColors = [0xff8fc7, 0xffd447, 0x9ad0ff, 0xc9a2ff, 0xffffff, 0xffa24c];
  const wingGeo = new THREE.PlaneGeometry(0.28, 0.2);
  wingGeo.translate(0.14, 0, 0);
  const butterflies: { group: THREE.Group; wings: THREE.Mesh[]; cx: number; cz: number; r: number; speed: number; phase: number }[] = [];
  butterflyColors.forEach((c, i) => {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
    const w1 = new THREE.Mesh(wingGeo, mat);
    const w2 = new THREE.Mesh(wingGeo, mat);
    w1.rotation.x = w2.rotation.x = -Math.PI / 2;
    w2.scale.x = -1;
    g.add(w1, w2);
    const a = (i / butterflyColors.length) * Math.PI * 2 + 0.4;
    const r = 9 + (i % 3) * 3.5;
    scene.add(g);
    butterflies.push({ group: g, wings: [w1, w2], cx: Math.sin(a) * r, cz: Math.cos(a) * r, r: 1.6 + (i % 2), speed: 0.6 + i * 0.07, phase: i * 1.3 });
  });

  let t = 0;
  return {
    landmarks,
    spawnPoint: new THREE.Vector3(0, 1.5, 11),
    update(dt, playerPos) {
      t += dt;
      for (const b of birds) {
        const a = t * b.speed + b.phase;
        b.group.position.set(Math.sin(a) * b.r, b.y + Math.sin(t * 2 + b.phase) * 0.6, Math.cos(a) * b.r);
        b.group.rotation.y = a + Math.PI / 2;
        for (const child of b.group.children) {
          if ((child.userData as { side?: number }).side) {
            child.rotation.z = Math.sin(t * 12 + b.phase) * 0.6;
          }
        }
      }
      for (const child of scene.children) {
        const smoke = (child as THREE.Object3D).userData.smoke as THREE.Sprite[] | undefined;
        if (smoke) {
          for (const s of smoke) {
            const phase = ((t + (s.userData.phase as number)) % 2.4) / 2.4;
            s.position.y = 2.7 + phase * 1.6;
            (s.material as THREE.SpriteMaterial).opacity = 0.5 * (1 - phase);
            s.scale.setScalar(0.4 + phase * 0.5);
          }
        }
        const flags = (child as THREE.Object3D).userData.flags as THREE.Group[] | undefined;
        if (flags) {
          for (const f of flags) {
            const cloth = f.userData.cloth as THREE.Mesh;
            cloth.rotation.y = Math.sin(t * 3) * 0.3;
          }
        }
      }
      let collected = 0;
      for (const coin of coins) {
        if (!coin.visible) {
          // coins grow back so there is always something shiny to chase around the village
          if (t >= (coin.userData.respawnAt as number)) {
            coin.visible = true;
            coin.scale.setScalar(0.01);
          }
          continue;
        }
        if (coin.scale.x < 1) coin.scale.setScalar(Math.min(1, coin.scale.x + dt * 2.5));
        coin.rotation.y += dt * 2.4;
        coin.position.y = COIN_Y + Math.sin(t * 3 + (coin.userData.bobPhase as number)) * 0.12;
        const dx = coin.position.x - playerPos.x;
        const dz = coin.position.z - playerPos.z;
        if (dx * dx + dz * dz < 1.2) {
          coin.visible = false;
          coin.userData.respawnAt = t + COIN_RESPAWN_S;
          spawnBurst(coin.position);
          collected++;
        }
      }
      waterTex.offset.x = (t * 0.03) % 1;
      waterTex.offset.y = (t * 0.018) % 1;
      spout.rotation.y += dt * 0.6;
      for (const b of butterflies) {
        const a = t * b.speed + b.phase;
        b.group.position.set(
          b.cx + Math.sin(a) * b.r,
          G + 0.9 + Math.sin(a * 2.3) * 0.35,
          b.cz + Math.cos(a * 0.8) * b.r,
        );
        b.group.rotation.y = a + Math.PI / 2;
        const flap = Math.sin(t * 22 + b.phase) * 0.9;
        b.wings[0].rotation.y = flap;
        b.wings[1].rotation.y = -flap;
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.life -= dt;
        const pos = b.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
        const vels = b.pts.userData.velocities as THREE.Vector3[];
        for (let vi = 0; vi < vels.length; vi++) {
          vels[vi].y -= dt * 4;
          pos.setXYZ(vi, pos.getX(vi) + vels[vi].x * dt, pos.getY(vi) + vels[vi].y * dt, pos.getZ(vi) + vels[vi].z * dt);
        }
        pos.needsUpdate = true;
        (b.pts.material as THREE.PointsMaterial).opacity = Math.max(0, b.life / 0.7);
        if (b.life <= 0) {
          scene.remove(b.pts);
          b.pts.geometry.dispose();
          bursts.splice(i, 1);
        }
      }
      return collected;
    },
  };
}
