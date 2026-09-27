import * as THREE from "three";
import { woodBox } from "../buildingKit";
import { makeSparkleTexture } from "../textures";

/** Shared "dollhouse cutaway" room shell: floor + back/side walls, open toward the camera. */
export interface RoomShellOptions {
  width: number;
  depth: number;
  wallHeight: number;
  wallColor: string;
  floorTexture: THREE.CanvasTexture;
  backgroundColor: string;
}

export interface RoomShell {
  scene: THREE.Scene;
  floorY: number;
  spawnPoint: THREE.Vector3;
  bounds: number;
  rect: { halfX: number; halfZ: number };
  /** Drifts the room's floating dust-mote sparkles; pass straight through as Interior.update. */
  update: (dt: number) => void;
  /** Registers a disposable (geometry/material/texture) to be cleaned up on dispose(). */
  track: <T extends { dispose: () => void }>(resource: T) => T;
  dispose: () => void;
}

export const ROOM_FLOOR_Y = 1.5; // matches the exterior village's ground level

export function createRoomShell(opts: RoomShellOptions): RoomShell {
  const { width, depth, wallHeight, wallColor, floorTexture, backgroundColor } = opts;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(backgroundColor);

  const disposables: Array<{ dispose: () => void }> = [];
  function track<T extends { dispose: () => void }>(resource: T): T {
    disposables.push(resource);
    return resource;
  }
  track(floorTexture);

  const hemi = new THREE.HemisphereLight(0xfff0d8, 0x40301c, 0.78);
  scene.add(hemi);
  const warm = new THREE.PointLight(0xffcf9a, 1.1, Math.max(width, depth) * 2);
  warm.position.set(0, wallHeight + 0.8, -depth / 2 + 1.6);
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

  floorTexture.repeat.set(width / 2.2, depth / 2.2);
  const floorMat = track(new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.92 }));
  const floorGeo = track(new THREE.CylinderGeometry(Math.max(width, depth) / 1.8, Math.max(width, depth) / 1.8, 0.4, 24));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = ROOM_FLOOR_Y - 0.2;
  floor.receiveShadow = true;
  scene.add(floor);

  function trackWall(wall: THREE.Mesh) {
    track(wall.geometry);
    const mat = wall.material as THREE.MeshStandardMaterial;
    track(mat);
    if (mat.map) track(mat.map);
    scene.add(wall);
  }

  const backWall = woodBox(width, wallHeight, 0.3, wallColor);
  backWall.position.set(0, ROOM_FLOOR_Y + wallHeight / 2, -depth / 2);
  trackWall(backWall);

  const leftWall = woodBox(0.3, wallHeight, depth, wallColor);
  leftWall.position.set(-width / 2, ROOM_FLOOR_Y + wallHeight / 2, 0);
  trackWall(leftWall);

  const rightWall = woodBox(0.3, wallHeight, depth, wallColor);
  rightWall.position.set(width / 2, ROOM_FLOOR_Y + wallHeight / 2, 0);
  trackWall(rightWall);

  // A few dozen warm motes drifting in the lamplight: one Points draw call, makes rooms feel cosy.
  const MOTES = 36;
  const motePos = new Float32Array(MOTES * 3);
  const moteSeed = new Float32Array(MOTES);
  for (let i = 0; i < MOTES; i++) {
    motePos[i * 3] = (Math.random() - 0.5) * (width - 1);
    motePos[i * 3 + 1] = ROOM_FLOOR_Y + 0.4 + Math.random() * (wallHeight - 0.6);
    motePos[i * 3 + 2] = (Math.random() - 0.5) * (depth - 1);
    moteSeed[i] = Math.random() * Math.PI * 2;
  }
  const moteGeo = track(new THREE.BufferGeometry());
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  const moteTex = track(makeSparkleTexture());
  const moteMat = track(new THREE.PointsMaterial({ map: moteTex, size: 0.22, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe2a8 }));
  scene.add(new THREE.Points(moteGeo, moteMat));
  let t = 0;

  return {
    scene,
    floorY: ROOM_FLOOR_Y,
    update(dt: number) {
      t += dt;
      const attr = moteGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < MOTES; i++) {
        let y = attr.getY(i) + dt * 0.12;
        if (y > ROOM_FLOOR_Y + wallHeight) y = ROOM_FLOOR_Y + 0.3;
        attr.setY(i, y);
        attr.setX(i, attr.getX(i) + Math.sin(t * 0.7 + moteSeed[i]) * dt * 0.08);
      }
      attr.needsUpdate = true;
    },
    spawnPoint: new THREE.Vector3(0, ROOM_FLOOR_Y, depth / 2 - 1.4),
    bounds: Math.min(width, depth) / 2 - 0.8,
    rect: { halfX: width / 2 - 0.8, halfZ: depth / 2 - 0.8 },
    track,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
