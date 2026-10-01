// Ground contact: every penguin (and every skier), in every state, drawn exactly as the renderer draws
// it (penguinRoot + the Euler YXZ pose, true-size scale), must rest ON the snow — its lowest point no
// deeper than 0.05 into the ground wherever the ground is above the water — and nobody swims through
// an ice floe.
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PENGUIN_BODY, STATE_NAMES, makeColony, penguinGround, penguinRoot, stepColony, type PenguinPose } from "./colony";
import { SKI_STATE_NAMES, makeSkiField, stepSkiField } from "./ski";
import { FROST_COLONY, FROST_ISLAND, FROST_SEA_R, FROST_WATER_Y, FLOE_TOP, frostFloeAt, frostGroundY, frostLandY } from "../../registry/frostIsland";
import { seaFloorY } from "../sea/wander";
import { buildFrostIsland, cutFrostFloor } from "./index";

const DIRS: THREE.Vector3[] = [];
for (let a = 0; a < 12; a++)
  for (let b = 0; b <= 8; b++) {
    const th = (a / 12) * Math.PI * 2;
    const ph = (b / 8) * Math.PI;
    DIRS.push(new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)));
  }
const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const vp = new THREE.Vector3();
const vs = new THREE.Vector3();
const root = { x: 0, y: 0, z: 0 };
const ground = (x: number, z: number) => frostGroundY(x, z) ?? frostLandY(x, z);

/** how deep (>0) the pose's body + feet go into the ground, and whether it's inside a floe's ice */
function measure(p: PenguinPose): { deep: number; touch: number; inFloe: boolean } {
  penguinRoot(p, root, penguinGround);
  e.set(p.pitch, p.yaw, p.roll, "YXZ");
  m.compose(vp.set(root.x, root.y, root.z), q.setFromEuler(e), vs.set(p.size, p.size, p.size));
  const B = PENGUIN_BODY[p.kind];
  let deep = -9;
  let inFloe = false;
  const test = () => {
    const g = ground(v.x, v.z);
    if (g !== null && g > FROST_WATER_Y + 0.05 && !frostFloeAt(v.x, v.z)) deep = Math.max(deep, g - v.y);
    if (frostFloeAt(v.x, v.z) && v.y > FROST_WATER_Y - 0.75 + 0.02 && v.y < FLOE_TOP - 0.02) inFloe = true;
  };
  for (const d of DIRS) {
    v.set(d.x * B.rx, B.cy + d.y * B.ry, d.z * B.rz).applyMatrix4(m);
    test();
  }
  for (const sx of [-B.foot, B.foot]) {
    v.set(sx, 0, 0).applyMatrix4(m);
    test();
  }
  return { deep, touch: deep, inFloe };
}

describe("penguins rest on the snow (true size, every pose)", { timeout: 180_000 }, () => {
  it("the colony: standing, waddling up the ramp, queueing, the flop, sliding, slipping, hopping out, the huddle, chicks — feet on the ground, never sunk in", () => {
    const col = makeColony(false);
    const worst = new Map<string, number>();
    const floating = new Map<string, number>();
    let floe = 0;
    let t = 0;
    const dt = 1 / 30;
    for (let k = 0; k < 240 / dt; k++) {
      t += dt;
      stepColony(col, dt, t, null);
      if (k % 2) continue;
      for (const p of col.penguins) {
        const r = measure(p);
        if (r.inFloe) floe++;
        const key = STATE_NAMES[p.state];
        worst.set(key, Math.max(worst.get(key) ?? -9, r.deep));
        // standing / walking on land: the lowest point touches (not floating either)
        if (p.state !== 5 && p.state !== 6 && p.state !== 7 && r.deep > -9) floating.set(key, Math.min(floating.get(key) ?? 9, r.deep));
      }
    }
    for (const [k, d] of worst) expect(d, `${k} sunk ${d.toFixed(3)}`).toBeLessThan(0.05);
    // (and on the ground, not hovering: the lowest point is within a hair of the snow)
    for (const s of ["home", "ascend", "queue", "walkhome", "huddle", "follow", "creche", "slip"]) expect(floating.get(s) ?? -1, s).toBeGreaterThan(-0.12);
    expect(floe).toBe(0);
  });

  it("the skiers: carving, falling over, queueing, riding the lift — skis on the snow, never sunk in", () => {
    const sf = makeSkiField(false);
    const worst = new Map<string, number>();
    let t = 0;
    const dt = 1 / 30;
    for (let k = 0; k < 180 / dt; k++) {
      t += dt;
      stepSkiField(sf, dt, t, null);
      if (k % 2) continue;
      for (const p of sf.skiers) {
        const r = measure(p);
        const key = SKI_STATE_NAMES[p.state];
        worst.set(key, Math.max(worst.get(key) ?? -9, r.deep));
      }
    }
    for (const [k, d] of worst) expect(d, `${k} sunk ${d.toFixed(3)}`).toBeLessThan(0.05);
    expect(worst.size).toBeGreaterThan(5);
  });


  it("the ocean's sandy deep floor is cut away over the island (its coarse cells used to bury the colony's feet)", () => {
    // (the deep floor: 6-unit cells following seaFloorY, which counts Frostpeak's land as sea floor)
    const cell = 6;
    const h = (i: number, j: number) => seaFloorY(i * cell, j * cell);
    const sandAt = (x: number, z: number) => {
      const i = Math.floor(x / cell);
      const j = Math.floor(z / cell);
      const u = x / cell - i;
      const v = z / cell - j;
      if (u + v <= 1) return h(i, j) + (h(i + 1, j) - h(i, j)) * u + (h(i, j + 1) - h(i, j)) * v;
      return h(i + 1, j + 1) + (h(i, j + 1) - h(i + 1, j + 1)) * (1 - u) + (h(i + 1, j) - h(i + 1, j + 1)) * (1 - v);
    };
    let buried = 0;
    for (let x = FROST_COLONY.x - 10; x < FROST_COLONY.x + 10; x += 0.5) for (let z = FROST_COLONY.z - 10; z < FROST_COLONY.z + 10; z += 0.5) buried = Math.max(buried, sandAt(x, z) - frostLandY(x, z)!);
    // uncut, the sand rose up to ~0.7 m through Penguin Point's snow - half an emperor penguin
    expect(buried).toBeGreaterThan(0.5);
    // so the island cuts it away over everything it draws itself (its ground + skirt reach FROST_SEA_R + 2)
    const scene = new THREE.Scene();
    const sandMat = new THREE.MeshStandardMaterial();
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sandMat);
    sand.name = "uw-deep-floor";
    scene.add(sand);
    const f = buildFrostIsland(scene, {});
    f.update(1 / 30, 1, { kid: new THREE.Vector3(FROST_COLONY.x, 2, FROST_COLONY.z), glow: 0, hour: 12, under: false });
    expect((sandMat as unknown as { __frostCut?: boolean }).__frostCut).toBe(true);
    const shader = { vertexShader: "void main() {", fragmentShader: "void main() {", uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
    sandMat.onBeforeCompile(shader, null as unknown as THREE.WebGLRenderer);
    const m = /length\( vFrostXZ - vec2\( ([\d.]+), ([\d.]+) \) \) < ([\d.]+) \) discard/.exec(shader.fragmentShader)!;
    expect(Number(m[1])).toBeCloseTo(FROST_ISLAND.x, 1);
    expect(Number(m[2])).toBeCloseTo(FROST_ISLAND.z, 1);
    expect(Number(m[3])).toBeGreaterThan(FROST_SEA_R - 2);
    expect(sandMat.customProgramCacheKey()).toContain("frost-cut");
    // (and only once)
    expect(cutFrostFloor(sandMat)).toBe(sandMat);
    f.dispose();
  });
});
