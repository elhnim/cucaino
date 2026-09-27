import * as THREE from "three";
import { createRoomShell } from "./shell";
import { makeWoodTexture } from "../textures";
import type { Interior } from "./types";

const WIDTH = 8.5;
const DEPTH = 8;
const WALL_HEIGHT = 3.8;

export function buildFriendsInterior(accent: string): Interior {
  const room = createRoomShell({
    width: WIDTH,
    depth: DEPTH,
    wallHeight: WALL_HEIGHT,
    wallColor: "#8a6a3c",
    floorTexture: makeWoodTexture("#b98a5a"),
    backgroundColor: "#2a2035",
  });
  const { scene, track } = room;

  // round table with two little stools
  const table = new THREE.Mesh(
    track(new THREE.CylinderGeometry(1, 1, 0.12, 20)),
    track(new THREE.MeshStandardMaterial({ map: track(makeWoodTexture("#a9713f")), roughness: 0.85 })),
  );
  table.position.set(0, room.floorY + 0.7, -1.6);
  table.castShadow = true;
  scene.add(table);
  const tableLeg = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.12, 0.14, 0.7, 10)),
    track(new THREE.MeshStandardMaterial({ color: "#6b4a2c", flatShading: true })),
  );
  tableLeg.position.set(0, room.floorY + 0.35, -1.6);
  scene.add(tableLeg);
  for (const [x, z] of [[-1.4, -1.6], [1.4, -1.6]] as [number, number][]) {
    const stool = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.35, 0.38, 0.5, 12)),
      track(new THREE.MeshStandardMaterial({ color: accent, flatShading: true })),
    );
    stool.position.set(x, room.floorY + 0.25, z);
    stool.castShadow = true;
    scene.add(stool);
  }

  // mailbox by the door
  const mailbox = new THREE.Group();
  const post = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.06, 0.06, 1, 6)),
    track(new THREE.MeshStandardMaterial({ color: "#5a3a18" })),
  );
  post.position.y = 0.5;
  mailbox.add(post);
  const box = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.4, 0.28, 0.28)),
    track(new THREE.MeshStandardMaterial({ color: accent, flatShading: true })),
  );
  box.position.y = 1.05;
  mailbox.add(box);
  mailbox.position.set(2.6, room.floorY, 1.6);
  scene.add(mailbox);

  return { scene, spawnPoint: room.spawnPoint, bounds: room.bounds, rect: room.rect, zones: [], update: room.update, dispose: room.dispose };
}
