import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildRideables, roostObstacles } from "./index";
import { createDragonFlight } from "./dragonFlight";
import { HINT_AFTER_S, HINT_AFTER_WALK, dragonOverlap, facedGap, hintsReady, propOverlap, separateDragons, type DragonFoot } from "./dragonSpace";
import { DRAGON_ROOST, RIDEABLE_SPOTS } from "../../registry/rideables";
import { DRAGON_BREEDS, DRAGON_BREED_IDS, buildMount, mountBody, mountScale, type DragonAct } from "../../characters/mounts";
import { NAP_POSE, SCRATCH_POSE } from "../../characters/dragons";
import { groundY } from "../../registry/terrain";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const foot = (id: string, x: number, z: number, yaw: number): DragonFoot => {
  const s = RIDEABLE_SPOTS.find((q) => q.id === id)!;
  const [hl, hw, off] = mountBody("dragon", s.breed);
  return { x, z, yaw, hl, hw, off };
};
const roost = (du: number, df: number) => ({ x: DRAGON_ROOST.x + DRAGON_ROOST.u.x * du + DRAGON_ROOST.f.x * df, z: DRAGON_ROOST.z + DRAGON_ROOST.u.z * du + DRAGON_ROOST.f.z * df });

/** a breed's rig after `secs` in a pose, and its skinned vertices in root space */
function posed(b: string, act: DragonAct, secs = 2.5) {
  const rig = buildMount("dragon", "#ff5fa8", "classic", b as never);
  rig.drive!({ mode: "park", act, look: 0, flap: 0, dive: 0 });
  for (let i = 0; i < secs * 20; i++) rig.update(1 / 20, 0, false, 0, 0);
  rig.root.updateMatrixWorld(true);
  const sk = rig.root.getObjectByName("mount-body") as THREE.SkinnedMesh;
  sk.skeleton.update();
  let lo = Infinity;
  const v = new THREE.Vector3();
  for (let i = 0; i < sk.geometry.attributes.position.count; i += 2) {
    sk.getVertexPosition(i, v);
    lo = Math.min(lo, v.applyMatrix4(sk.matrixWorld).y);
  }
  return { rig, sk, lo: lo / mountScale("dragon", b as never) };
}

describe("dragon shapes and poses", () => {
  it("every breed stays within ~8k triangles", () => {
    for (const b of DRAGON_BREED_IDS) {
      const { sk } = posed(b, "stand", 0.1);
      expect(sk.geometry.attributes.position.count / 3, b).toBeLessThanOrEqual(8000);
    }
  });

  it("scratching: sits back and the right hind foot comes up to the right ear, nothing in the ground", () => {
    expect(SCRATCH_POSE.hindRx).toBeLessThan(-1.5);
    for (const b of DRAGON_BREED_IDS) {
      const { rig, lo } = posed(b, "scratch");
      const ear = rig.root.getObjectByName("earR")!.getWorldPosition(new THREE.Vector3());
      const sh = DRAGON_BREEDS[b].shape;
      const foot3 = rig.root.getObjectByName("leg3")!.localToWorld(new THREE.Vector3(0.03, -(sh.H - sh.bh * 0.25) + 0.09, -0.01));
      const S = mountScale("dragon", b);
      // (within about a head's width: the foot is at the ear)
      expect(ear.distanceTo(foot3) / S, b).toBeLessThan(0.55);
      // the foot is out beside the body, not inside it; and up off the ground
      expect(foot3.x / S, b).toBeGreaterThan(sh.bw * 0.75);
      expect(foot3.y / S, b).toBeGreaterThan(0.5);
      expect(lo, b).toBeGreaterThan(-0.025);
    }
  });

  it("napping: lies on the grass with its legs folded on it, never through it", () => {
    expect(NAP_POSE.frontRx).toBeLessThan(-1.3);
    for (const b of DRAGON_BREED_IDS) {
      const { lo } = posed(b, "nap", 4);
      expect(lo, b).toBeGreaterThan(-0.02);
      expect(lo, b).toBeLessThan(0.04);
    }
  });
});

describe("dragons keep their room", () => {
  it("pure: two overlapping dragons and a post are pushed apart", () => {
    const a = foot("dragon-roost", 0, 0, 0);
    const b = foot("dragon-roost-puffwing", 1.5, 1, 0.4);
    const post = { x: -1.2, z: 2, r: 0.5 };
    expect(dragonOverlap(a, b)).toBeGreaterThan(1);
    for (let i = 0; i < 6; i++) separateDragons([a, b], [post], 0.4);
    expect(dragonOverlap(a, b)).toBeLessThan(-0.3);
    expect(propOverlap(a, post)).toBeLessThan(-0.3);
    expect(propOverlap(b, post)).toBeLessThan(-0.3);
  });

  it("at the Roost: no two dragons overlap and none stands in the perches, trough or banner (a minute of their lives, a kid about)", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const ids = ["dragon-roost", "dragon-roost-puffwing", "dragon-roost-zippit"];
    const props = roostObstacles();
    const kid = V(DRAGON_ROOST.x + 30, groundY(DRAGON_ROOST.x + 30, DRAGON_ROOST.z), DRAGON_ROOST.z);
    let worst = -9;
    let worstProp = -9;
    for (let i = 0; i < 1200; i++) {
      // the kid wanders in and out (dragons turn to look, trot about, nap, chase their tails)
      const a = i * 0.004;
      kid.set(DRAGON_ROOST.x + Math.cos(a) * (14 + Math.sin(a * 3) * 8), 0, DRAGON_ROOST.z + Math.sin(a) * 14);
      kid.y = groundY(kid.x, kid.z);
      w.update(0.05, i * 0.05, { kid, under: false, atSea: false, glow: 0 });
      if (i < 40) continue;
      const fs = ids.map((id) => {
        const p = w.peek(id)!;
        return foot(id, p.x, p.z, p.yaw);
      });
      for (let x = 0; x < fs.length; x++) {
        for (let y = x + 1; y < fs.length; y++) worst = Math.max(worst, dragonOverlap(fs[x], fs[y]));
        for (const pr of props) worstProp = Math.max(worstProp, propOverlap(fs[x], pr));
      }
    }
    expect(worst).toBeLessThan(0.05);
    expect(worstProp).toBeLessThan(0.05);
    w.dispose();
  });
});

describe("which dragon the kid means", () => {
  it("pure: the faced one wins over one a step nearer behind", () => {
    // ahead 1.2 m off vs behind 0.8 m off
    expect(facedGap(1.2, 0, 0, 0, 0, 3)).toBeLessThan(facedGap(0.8, 0, 0, 0, 0, -3));
  });

  it("at the Roost, standing nearer the Puffwing but facing the Roostwarden: Say hi to the Roostwarden (and the ring is on it)", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const rw = w.peek("dragon-roost")!;
    const pw = w.peek("dragon-roost-puffwing")!;
    // between them, a little nearer the Puffwing
    const [rhl, rhw] = mountBody("dragon", "roostwarden");
    void rhl;
    const [, phw] = mountBody("dragon", "puffwing");
    const pu = -5.4 + phw + 0.7;
    expect(pu).toBeLessThan(-rhw - 0.7);
    const p = roost(pu, 0.4);
    const kid = V(p.x, groundY(p.x, p.z), p.z);
    w.update(0.05, 0.05, { kid, under: false, atSea: false, glow: 0 });
    const towardRw = Math.atan2(DRAGON_ROOST.u.x, DRAGON_ROOST.u.z);
    expect(w.nearest(kid)!.id).toBe("dragon-roost-puffwing");
    expect(w.nearest(kid, undefined, towardRw)!.id).toBe("dragon-roost");
    expect(w.nearest(kid, undefined, towardRw + Math.PI)!.id).toBe("dragon-roost-puffwing");
    void rw;
    void pw;
    // the highlight follows the target
    w.setTarget("dragon-roost");
    w.update(0.05, 0.1, { kid, under: false, atSea: false, glow: 0 });
    const ring = scene.getObjectByName("rideables:target-ring")!;
    expect(ring.visible).toBe(true);
    expect(Math.hypot(ring.position.x - w.peek("dragon-roost")!.x, ring.position.z - w.peek("dragon-roost")!.z)).toBeLessThan(mountBody("dragon", "roostwarden")[2] + 0.5);
    w.setTarget(null);
    w.update(0.05, 0.15, { kid, under: false, atSea: false, glow: 0 });
    expect(ring.visible).toBe(false);
    w.dispose();
  });
});

describe("dragon hints and effects", () => {
  it("hints wait for the welcome toasts and a few steps", () => {
    expect(hintsReady(0.5, 0)).toBe(false);
    expect(hintsReady(HINT_AFTER_S + 5, 0)).toBe(false);
    expect(hintsReady(2, HINT_AFTER_WALK + 10)).toBe(false);
    expect(hintsReady(HINT_AFTER_S, HINT_AFTER_WALK)).toBe(true);
    // (the welcome lines: at 0.5 s and 2.3 s, 3 s each)
    expect(HINT_AFTER_S).toBeGreaterThan(2.3 + 3);
  });

  it("friendship hearts face the camera", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const s = RIDEABLE_SPOTS.find((q) => q.id === "dragon-hill-1")!;
    const kid = V(s.x + Math.cos(s.yaw) * 4, groundY(s.x, s.z), s.z - Math.sin(s.yaw) * 4);
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(kid.x + 9, kid.y + 7, kid.z + 13);
    cam.lookAt(kid);
    cam.updateMatrixWorld();
    w.update(0.05, 0, { kid, under: false, atSea: false, glow: 0, camera: cam });
    expect(w.bond("dragon-hill-1")).toBe(true);
    let t = 0;
    for (let i = 0; i < 90; i++) w.update(0.05, (t += 0.05), { kid, under: false, atSea: false, glow: 0, camera: cam });
    const hearts = scene.getObjectByName("rideables:hearts") as THREE.InstancedMesh;
    expect(hearts.count).toBeGreaterThan(0);
    const M = new THREE.Matrix4();
    const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    for (let i = 0; i < hearts.count; i++) {
      hearts.getMatrixAt(i, M);
      const n = new THREE.Vector3(0, 0, 1).transformDirection(M);
      // (the heart's face points back at the camera)
      expect(n.dot(camFwd)).toBeLessThan(-0.95);
    }
    w.dispose();
  });

  it("diving: plenty of long, thick wind streaks", () => {
    const scene = new THREE.Scene();
    const fx = createDragonFlight(scene, {});
    const rig = buildMount("dragon", "#ff5fa8", "classic", "skyfin");
    fx.start("skyfin");
    const pos = V(0, 60, 0);
    for (let i = 0; i < 60; i++) {
      pos.z += 0.6;
      pos.y -= 0.5;
      fx.apply(1 / 30, { mount: rig, kidRig: null, pos, dYaw: 0, alt: 50, climb: -15, moving: true });
      fx.update(1 / 30, i / 30, { pos, riding: true });
    }
    const puffs = scene.getObjectByName("dragon-flight:puffs") as THREE.InstancedMesh;
    const M = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    let streaks = 0;
    for (let i = 0; i < puffs.count; i++) {
      puffs.getMatrixAt(i, M);
      M.decompose(p, q, sc);
      if (sc.z > 3 && sc.x > 0.06) streaks++;
    }
    expect(streaks).toBeGreaterThan(10);
    fx.dispose();
  });
});
