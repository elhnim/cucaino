import * as THREE from "three";
import { createRoomShell } from "./shell";
import { labelSprite, emojiSprite } from "../buildingKit";
import { makeWoodTexture } from "../textures";
import { buildCritter } from "../character";
import { getAnimal } from "../registry/animals";
import type { Interior } from "./types";

const WIDTH = 11;
const DEPTH = 9;
const WALL_HEIGHT = 4;

// Stock on the shelves: [emoji, shelf-row] — rendered as little product boxes/jars with
// an emoji "label" so the shop reads as full of real goodies. Add more freely.
const STOCK = ["🧸", "🍭", "🎨", "⚽", "🧃", "🍪", "🎮", "📚", "🪀", "🧁", "🎲", "🍓", "🚀", "🦖", "🎀", "🍫"];
const PRODUCT_COLORS = ["#ff8fab", "#ffd166", "#80ed99", "#8ecae6", "#cdb4db", "#ffadad", "#fdffb6", "#a0c4ff"];

/** A cosy corner shop: stocked shelves, a counter with a till, and a friendly bear shopkeeper. */
export function buildStoreInterior(accent: string): Interior {
  const room = createRoomShell({
    width: WIDTH,
    depth: DEPTH,
    wallHeight: WALL_HEIGHT,
    wallColor: "#f2d7a8",
    floorTexture: makeWoodTexture("#c79a63"),
    backgroundColor: "#2a2035",
  });
  const { scene, track, floorY } = room;
  const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
    track(new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra }));
  const trackSprite = (s: THREE.Sprite) => {
    const m = s.material as THREE.SpriteMaterial;
    track(m);
    if (m.map) track(m.map);
    return s;
  };

  // striped awning along the back wall
  const stripeGeo = track(new THREE.BoxGeometry(WIDTH / 12, 0.08, 1));
  for (let i = 0; i < 12; i++) {
    const stripe = new THREE.Mesh(stripeGeo, i % 2 ? std("#ffffff") : std(accent));
    stripe.position.set(-WIDTH / 2 + WIDTH / 24 + (i * WIDTH) / 12, floorY + WALL_HEIGHT - 0.4, -DEPTH / 2 + 0.6);
    stripe.rotation.x = 0.35;
    scene.add(stripe);
  }

  // shelves: back wall (3 rows) + both side walls
  const shelfMat = track(new THREE.MeshStandardMaterial({ map: track(makeWoodTexture("#9c6a3a")), roughness: 0.85 }));
  const plankGeo = track(new THREE.BoxGeometry(WIDTH - 1.6, 0.12, 0.7));
  const productGeo = track(new THREE.BoxGeometry(0.42, 0.5, 0.36));
  const jarGeo = track(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 10));
  const jarLidGeo = track(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 10));
  let stockI = 0;
  const bobbers: THREE.Sprite[] = [];
  for (let row = 0; row < 3; row++) {
    const y = floorY + 0.5 + row * 0.95;
    const plank = new THREE.Mesh(plankGeo, shelfMat);
    plank.position.set(0, y, -DEPTH / 2 + 0.55);
    plank.receiveShadow = true;
    scene.add(plank);
    const perRow = 8;
    for (let i = 0; i < perRow; i++) {
      const x = -WIDTH / 2 + 1.3 + (i * (WIDTH - 2.6)) / (perRow - 1);
      const color = PRODUCT_COLORS[(i + row * 3) % PRODUCT_COLORS.length];
      const jar = (i + row) % 3 === 0;
      const item = new THREE.Mesh(jar ? jarGeo : productGeo, std(color));
      item.position.set(x, y + 0.3, -DEPTH / 2 + 0.55);
      item.castShadow = true;
      scene.add(item);
      if (jar) {
        const lid = new THREE.Mesh(jarLidGeo, std("#f4f1e6"));
        lid.position.set(x, y + 0.56, -DEPTH / 2 + 0.55);
        scene.add(lid);
      }
      if ((i + row) % 2 === 0) {
        const tag = trackSprite(emojiSprite(STOCK[stockI++ % STOCK.length], 0.42));
        tag.position.set(x, y + 0.34, -DEPTH / 2 + 0.78);
        scene.add(tag);
      }
    }
  }
  // side display tables with a featured toy spinning on each
  const featured: THREE.Sprite[] = [];
  for (const side of [-1, 1]) {
    const table = new THREE.Mesh(track(new THREE.CylinderGeometry(0.8, 0.8, 0.9, 16)), std("#fff4e0"));
    table.position.set(side * (WIDTH / 2 - 1.3), floorY + 0.45, 0.4);
    table.castShadow = true;
    scene.add(table);
    const toy = trackSprite(emojiSprite(side < 0 ? "🧸" : "🚀", 0.95));
    toy.position.set(table.position.x, floorY + 1.55, 0.4);
    scene.add(toy);
    featured.push(toy);
    const tag = trackSprite(labelSprite(side < 0 ? "✨ New!" : "🔥 Hot"));
    tag.scale.multiplyScalar(0.35);
    tag.position.set(table.position.x, floorY + 2.3, 0.4);
    scene.add(tag);
    bobbers.push(tag);
  }

  // counter + till
  const counter = new THREE.Mesh(track(new THREE.BoxGeometry(3.2, 1.1, 0.8)), track(new THREE.MeshStandardMaterial({ map: track(makeWoodTexture("#a9713f")), roughness: 0.9 })));
  counter.position.set(0, floorY + 0.55, -1.6);
  counter.castShadow = true;
  counter.receiveShadow = true;
  scene.add(counter);
  const counterTop = new THREE.Mesh(track(new THREE.BoxGeometry(3.4, 0.1, 0.95)), std(accent));
  counterTop.position.set(0, floorY + 1.15, -1.6);
  scene.add(counterTop);
  const till = new THREE.Group();
  const tillBody = new THREE.Mesh(track(new THREE.BoxGeometry(0.7, 0.4, 0.5)), std("#5c6b7a", { metalness: 0.3 }));
  tillBody.position.y = 0.2;
  const tillScreen = new THREE.Mesh(track(new THREE.BoxGeometry(0.5, 0.25, 0.05)), std("#1e293b", { emissive: 0x4ade80, emissiveIntensity: 0.6 }));
  tillScreen.position.set(0, 0.52, -0.1);
  tillScreen.rotation.x = -0.4;
  const drawer = new THREE.Mesh(track(new THREE.BoxGeometry(0.66, 0.12, 0.45)), std("#ffd447", { metalness: 0.4 }));
  drawer.position.set(0, 0.06, 0.05);
  till.add(tillBody, tillScreen, drawer);
  till.position.set(1, floorY + 1.2, -1.6);
  scene.add(till);
  const jarCandy = new THREE.Mesh(track(new THREE.SphereGeometry(0.28, 12, 10)), track(new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, roughness: 0.1 })));
  jarCandy.position.set(-1.1, floorY + 1.48, -1.6);
  scene.add(jarCandy);
  const candies = trackSprite(emojiSprite("🍬", 0.4));
  candies.position.copy(jarCandy.position);
  scene.add(candies);

  const sign = trackSprite(labelSprite("🏪 Reward Shop"));
  sign.scale.multiplyScalar(0.8);
  sign.position.set(0, floorY + WALL_HEIGHT + 0.5, -DEPTH / 2 + 0.3);
  scene.add(sign);

  // hanging pendant lamps
  const lampMat = std("#ffe6a0", { emissive: 0xffcf6b, emissiveIntensity: 0.9 });
  const lampGeo = track(new THREE.SphereGeometry(0.2, 10, 8));
  const cordGeo = track(new THREE.CylinderGeometry(0.015, 0.015, 1, 4));
  const cordMat = std("#3a3a3a");
  for (const x of [-3, 0, 3]) {
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(x, floorY + WALL_HEIGHT - 0.6, -0.6);
    const cord = new THREE.Mesh(cordGeo, cordMat);
    cord.position.set(x, floorY + WALL_HEIGHT, -0.6);
    scene.add(lamp, cord);
  }

  // rug to stand on in front of the counter
  const rug = new THREE.Mesh(track(new THREE.CircleGeometry(1.6, 24)), std(accent, { roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, floorY + 0.01, 0.4);
  rug.receiveShadow = true;
  scene.add(rug);

  // the shopkeeper: a friendly bear behind the counter who waves every so often
  const keeper = buildCritter({ bodyColor: "", bellyColor: "", accentColor: "#e5484d", animal: getAnimal("bear"), scale: 1.05 });
  keeper.root.position.set(-0.3, floorY, -2.4);
  keeper.setFacingAngle(0);
  scene.add(keeper.root);
  const keeperBubble = trackSprite(emojiSprite("👋", 0.8));
  keeperBubble.position.set(-0.3, floorY + 3.1, -2.4);
  scene.add(keeperBubble);
  keeper.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) track(m.geometry);
    if (m.material) track(m.material as THREE.Material);
  });

  let t = 0;
  let nextWave = 0.6;
  return {
    scene,
    spawnPoint: room.spawnPoint,
    bounds: room.bounds, rect: room.rect,
    zones: [],
    cameraOffset: new THREE.Vector3(0, 8, 8.6),
    update(dt, playerPos) {
      room.update(dt);
      t += dt;
      keeper.update(dt, false);
      nextWave -= dt;
      if (nextWave <= 0) {
        keeper.wave();
        nextWave = 4 + Math.random() * 3;
      }
      // the shopkeeper turns to look at the kid
      keeper.setFacingAngle(Math.atan2(playerPos.x - keeper.root.position.x, playerPos.z - keeper.root.position.z));
      keeperBubble.position.y = floorY + 3.1 + Math.sin(t * 2.5) * 0.12;
      (keeperBubble.material as THREE.SpriteMaterial).opacity = nextWave > 3 ? 1 : 0.0;
      featured.forEach((f, i) => {
        f.position.y = floorY + 1.55 + Math.sin(t * 2 + i) * 0.1;
        f.material.rotation = Math.sin(t * 1.5 + i) * 0.2;
      });
      bobbers.forEach((b, i) => (b.position.y = floorY + 2.3 + Math.sin(t * 3 + i) * 0.06));
      (tillScreen.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5 + Math.sin(t * 4) * 0.15;
    },
    dispose: room.dispose,
  };
}
