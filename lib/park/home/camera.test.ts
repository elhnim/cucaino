import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { HOME_PAN, homeCamera } from "./camera";
import { ROOMS, SIDE_SPLAY, WALL_H, placedTransform } from "./rules";

/** how face-on a side-wall slot is to the camera: cos of the angle between where it faces and the camera */
function faceOn(cam: { x: number; y: number; z: number }, room: "bedroom" | "den", wall: "left" | "right", along: number, splayed = true) {
  const t = placedTransform({ item: "poster-star", room, gx: Math.max(0, Math.round(along - 0.5)), gz: 0, r: 0, wall });
  const rot = splayed ? t.rotY : wall === "left" ? Math.PI / 2 : -Math.PI / 2;
  const x = splayed ? t.x : wall === "left" ? ROOMS[room].x0 : ROOMS[room].x0 + ROOMS[room].cols;
  const z = splayed ? t.z : ROOMS[room].z0 + Math.max(0, Math.round(along - 0.5)) + 0.5;
  const dx = cam.x - x;
  const dy = cam.y - t.y;
  const dz = cam.z - z;
  return (Math.sin(rot) * dx + Math.cos(rot) * dz) / Math.hypot(dx, dy, dz);
}

describe("My Home's camera and its side walls", () => {
  it("landscape: every side-wall slot faces the camera far more than before (no more edge-on posters)", () => {
    const c = homeCamera({ aspect: 1024 / 720, fov: 38, editing: false, focusX: 0 });
    for (const [room, wall] of [
      ["bedroom", "left"],
      ["den", "right"],
    ] as const)
      for (let a = 0.5; a < ROOMS[room].rows; a += 1) {
        const now = faceOn(c.pos, room, wall, a);
        const was = faceOn(c.pos, room, wall, a, false);
        expect(now, `${room} ${a}`).toBeGreaterThan(0.5);
        expect(now - was, `${room} ${a}`).toBeGreaterThan(0.15);
      }
  });

  it("portrait phone, walking up to a side wall: the camera swings round to look at it face-on enough", () => {
    for (const [room, wall, kx] of [
      ["bedroom", "left", -8.8],
      ["den", "right", 8.8],
    ] as const) {
      const c = homeCamera({ aspect: 390 / 844, fov: 56, editing: false, focusX: kx });
      expect(c.portrait).toBe(true);
      for (let a = 0.5; a < ROOMS[room].rows; a += 1) expect(faceOn(c.pos, room, wall, a), `${room} ${a}`).toBeGreaterThan(0.45);
    }
    // (in the middle of the house it doesn't swing)
    const mid = homeCamera({ aspect: 390 / 844, fov: 56, editing: false, focusX: 0 });
    expect(mid.pos.x).toBeCloseTo(mid.look.x, 5);
  });

  it("landscape: the whole cottage, splayed walls and all, fits on screen", () => {
    const aspect = 1024 / 720;
    const c = homeCamera({ aspect, fov: 38, editing: false, focusX: 0 });
    const cam = new THREE.PerspectiveCamera(38, aspect, 0.1, 600);
    cam.position.set(c.pos.x, c.pos.y, c.pos.z);
    cam.lookAt(c.look.x, c.look.y, c.look.z);
    cam.updateMatrixWorld();
    const front = ROOMS.bedroom.z0 + ROOMS.bedroom.rows;
    const reach = ROOMS.den.x0 + ROOMS.den.cols + ROOMS.den.rows * Math.tan(SIDE_SPLAY);
    expect(reach).toBeLessThan(HOME_PAN + 2.5);
    for (const [x, y, z] of [
      [-reach, 0, front],
      [reach, 0, front],
      [-9.8, WALL_H, ROOMS.bedroom.z0],
      [9.8, WALL_H, ROOMS.bedroom.z0],
    ]) {
      const v = new THREE.Vector3(x, y, z).project(cam);
      expect(Math.abs(v.x), `${x},${z}`).toBeLessThan(1);
      expect(Math.abs(v.y), `${x},${z}`).toBeLessThan(1);
    }
  });
});
