import * as THREE from "three";
import { createRoomShell } from "./shell";
import { makeWoodTexture } from "../textures";
import type { Interior } from "./types";

const WIDTH = 9;
const DEPTH = 8;
const WALL_HEIGHT = 3.8;

export function buildScheduleInterior(accent: string): Interior {
  const room = createRoomShell({
    width: WIDTH,
    depth: DEPTH,
    wallHeight: WALL_HEIGHT,
    wallColor: "#b5432f",
    floorTexture: makeWoodTexture("#a9713f"),
    backgroundColor: "#2a2035",
  });
  const { scene, track } = room;

  // hay bale
  const bale = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.75, 0.75, 1.1, 14)),
    track(new THREE.MeshStandardMaterial({ color: "#e0c069", flatShading: true })),
  );
  bale.rotation.z = Math.PI / 2;
  bale.position.set(2.6, room.floorY + 0.75, -1.8);
  bale.castShadow = true;
  scene.add(bale);

  // corkboard task board
  const board = new THREE.Mesh(
    track(new THREE.PlaneGeometry(1.8, 1.3)),
    track(new THREE.MeshStandardMaterial({ color: "#d9b98a", roughness: 0.9 })),
  );
  board.position.set(-2.4, room.floorY + WALL_HEIGHT * 0.55, -DEPTH / 2 + 0.16);
  scene.add(board);
  for (const [x, y] of [[-0.5, 0.3], [0.4, 0.15], [-0.2, -0.35]] as [number, number][]) {
    const note = new THREE.Mesh(
      track(new THREE.PlaneGeometry(0.32, 0.32)),
      track(new THREE.MeshStandardMaterial({ color: accent })),
    );
    note.position.set(board.position.x + x, board.position.y + y, board.position.z + 0.01);
    scene.add(note);
  }

  return { scene, spawnPoint: room.spawnPoint, bounds: room.bounds, rect: room.rect, zones: [], update: room.update, dispose: room.dispose };
}
