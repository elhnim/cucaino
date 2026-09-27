import * as THREE from "three";
import { woodBox, emojiSprite } from "../buildingKit";
import { makeWoodTexture } from "../textures";
import type { Interior } from "./types";

// A small cozy "dollhouse cutaway" room: floor + back/side walls, open toward the camera,
// so the isometric-style follow camera always has a clear view of the player inside.
const ROOM_WIDTH = 9;
const ROOM_DEPTH = 8;
const WALL_HEIGHT = 3.6;
const FLOOR_Y = 1.5; // matches the exterior village's ground level, for a seamless step-in feel

export function buildPetHomeInterior(accent: string): Interior {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#2a2035");

  const disposables: Array<{ dispose: () => void }> = [];
  function track<T extends { dispose: () => void }>(resource: T): T {
    disposables.push(resource);
    return resource;
  }

  const hemi = new THREE.HemisphereLight(0xfff0d8, 0x40301c, 0.75);
  scene.add(hemi);
  const warm = new THREE.PointLight(0xffcf9a, 1.15, 16);
  warm.position.set(0, WALL_HEIGHT + 0.6, -ROOM_DEPTH / 2 + 1.6);
  // Point-light shadows re-render the room 6x per frame (cube map); one small directional
  // shadow from the ceiling gives the same grounded look for a single cheap pass.
  const keyLight = new THREE.DirectionalLight(0xfff0d8, 0.55);
  keyLight.position.set(2, 9, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(512, 512);
  keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -9;
  keyLight.shadow.camera.right = keyLight.shadow.camera.top = 9;
  keyLight.shadow.bias = -0.002;
  scene.add(track(keyLight));
  scene.add(warm);

  const floorTex = track(makeWoodTexture("#c79a63"));
  floorTex.repeat.set(ROOM_WIDTH / 2.2, ROOM_DEPTH / 2.2);
  const floorMat = track(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92 }));
  const floorGeo = track(new THREE.CylinderGeometry(Math.max(ROOM_WIDTH, ROOM_DEPTH) / 1.8, Math.max(ROOM_WIDTH, ROOM_DEPTH) / 1.8, 0.4, 24));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = FLOOR_Y - 0.2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallColor = "#e7c9a3";
  function trackWall(wall: THREE.Mesh) {
    track(wall.geometry);
    const mat = wall.material as THREE.MeshStandardMaterial;
    track(mat);
    if (mat.map) track(mat.map);
  }

  const backWall = woodBox(ROOM_WIDTH, WALL_HEIGHT, 0.3, wallColor);
  backWall.position.set(0, FLOOR_Y + WALL_HEIGHT / 2, -ROOM_DEPTH / 2);
  scene.add(backWall);
  trackWall(backWall);

  const leftWall = woodBox(0.3, WALL_HEIGHT, ROOM_DEPTH, wallColor);
  leftWall.position.set(-ROOM_WIDTH / 2, FLOOR_Y + WALL_HEIGHT / 2, 0);
  scene.add(leftWall);
  trackWall(leftWall);

  const rightWall = woodBox(0.3, WALL_HEIGHT, ROOM_DEPTH, wallColor);
  rightWall.position.set(ROOM_WIDTH / 2, FLOOR_Y + WALL_HEIGHT / 2, 0);
  scene.add(rightWall);
  trackWall(rightWall);

  // a soft glowing window on the back wall
  const windowGeo = track(new THREE.PlaneGeometry(1.6, 1.2));
  const windowMat = track(new THREE.MeshStandardMaterial({ color: "#bfe6ff", emissive: 0x224466, emissiveIntensity: 0.5 }));
  const window_ = new THREE.Mesh(windowGeo, windowMat);
  window_.position.set(-2.4, FLOOR_Y + WALL_HEIGHT * 0.62, -ROOM_DEPTH / 2 + 0.16);
  scene.add(window_);

  // cozy pet bed: a round cushion with a soft rim
  const bedRimGeo = track(new THREE.TorusGeometry(1, 0.28, 10, 20));
  const bedRimMat = track(new THREE.MeshStandardMaterial({ color: accent, flatShading: true }));
  const bedRim = new THREE.Mesh(bedRimGeo, bedRimMat);
  bedRim.rotation.x = Math.PI / 2;
  bedRim.position.set(2.4, FLOOR_Y + 0.14, -1.6);
  bedRim.castShadow = true;
  scene.add(bedRim);
  const cushionGeo = track(new THREE.CylinderGeometry(0.85, 0.85, 0.22, 20));
  const cushionMat = track(new THREE.MeshStandardMaterial({ color: "#fff2e0", flatShading: true }));
  const cushion = new THREE.Mesh(cushionGeo, cushionMat);
  cushion.position.set(2.4, FLOOR_Y + 0.14, -1.6);
  scene.add(cushion);

  // a little food bowl
  const bowlGeo = track(new THREE.CylinderGeometry(0.4, 0.32, 0.24, 16));
  const bowlMat = track(new THREE.MeshStandardMaterial({ color: "#f4f1e6", flatShading: true }));
  const bowl = new THREE.Mesh(bowlGeo, bowlMat);
  bowl.position.set(-2.6, FLOOR_Y + 0.12, -0.6);
  bowl.castShadow = true;
  scene.add(bowl);

  // little hearts drifting up from the pet bed — this room is all about love for the pet
  const bedX = 2.4, bedZ = -1.6;
  const hearts: THREE.Sprite[] = [];
  for (let i = 0; i < 4; i++) {
    const h = emojiSprite(["💖", "💛", "💜", "💚"][i], 0.55);
    const mat = h.material as THREE.SpriteMaterial;
    track(mat);
    if (mat.map) track(mat.map);
    h.userData.phase = i / 4;
    scene.add(h);
    hearts.push(h);
  }
  let t = 0;

  return {
    scene,
    spawnPoint: new THREE.Vector3(0, FLOOR_Y, ROOM_DEPTH / 2 - 1.4),
    bounds: Math.min(ROOM_WIDTH, ROOM_DEPTH) / 2 - 0.8,
    zones: [],
    update(dt) {
      t += dt;
      for (const h of hearts) {
        const p = (t * 0.25 + (h.userData.phase as number)) % 1;
        h.position.set(bedX + Math.sin(p * 9 + (h.userData.phase as number) * 6) * 0.5, FLOOR_Y + 0.6 + p * 2.4, bedZ);
        (h.material as THREE.SpriteMaterial).opacity = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
