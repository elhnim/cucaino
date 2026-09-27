import * as THREE from "three";

/** A walk-up interactive prop inside an interior room (task board, store counter, quiz kiosk, ...). */
export interface InteractiveZone {
  key: string;
  position: THREE.Vector3;
  radius: number;
}

/** A small, fixed-size 3D room entered from an exterior landmark. Not chunk-streamed. */
export interface Interior {
  scene: THREE.Scene;
  spawnPoint: THREE.Vector3;
  /** Simple circular walk-bounds radius, centered on the room's local origin. */
  bounds: number;
  /** Optional rectangular walk-bounds (half extents around the room origin); preferred over `bounds` when set. */
  rect?: { halfX: number; halfZ: number };
  zones: InteractiveZone[];
  /** Follow-camera offset for this room (bigger rooms want a higher, wider view). */
  cameraOffset?: THREE.Vector3;
  /** Optional ambient animation hook, mirrors Village.update. */
  update?: (dt: number, playerPos: THREE.Vector3) => void;
  dispose: () => void;
}
