import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DOLPHIN_K, DOLPHIN_TRUE_M, M_CIRCLE, M_ESCORT, M_LEAVE, M_PLAY, M_ROAM, DEV_RING, buildDolphinPods, dolphinDepth, dolphinFloor, kidInOpenSea, makePods, stepPods, type PodSim } from "./dolphins";
import { WATER_Y } from "../../registry/terrain";
import { FROST_BERGS, FROST_ISLAND } from "../../registry/frostIsland";

const dt = 1 / 30;
const WY = WATER_Y;

function run(sim: PodSim, secs: number, kid: { x: number; y: number; z: number }, under: boolean, each?: (t: number) => void, vel = { x: 0, z: 0 }) {
  let t = 0;
  for (let k = 0; k < secs / dt; k++) {
    t += dt;
    kid.x += vel.x * dt;
    kid.z += vel.z * dt;
    stepPods(sim, dt, t, kid, under);
    each?.(t);
  }
}

/** every dolphin in the water: never through the floor, never in the shallows or an iceberg (the
 *  first few problems go into `bad`) */
const bad: string[] = [];
function checkWater(sim: PodSim) {
  const fail = (why: string) => bad.length < 5 && bad.push(why);
  for (const p of sim.pods)
    for (const d of p.members) {
      if (!Number.isFinite(d.x + d.y + d.z + d.yaw + d.pitch)) fail("nan");
      if (d.y < dolphinFloor(d.x, d.z) + 0.2) fail(`through the floor ${d.y.toFixed(2)}`);
      if (d.y > WY + 3.5 || (!d.leaping && d.y > WY + 0.3)) fail(`out of the water ${d.y.toFixed(2)}`);
      if (dolphinDepth(d.x, d.z) < 1.5) fail(`in the shallows ${dolphinDepth(d.x, d.z).toFixed(2)}`);
      for (const b of FROST_BERGS) if (Math.hypot(d.x - b.x, d.z - b.z) < b.r + 1) fail("in an iceberg");
    }
}

describe("dolphin pods", { timeout: 60_000 }, () => {
  it("2–3 pods of 4–7, each with one calf", () => {
    for (const low of [false, true]) {
      const sim = makePods(low);
      expect(sim.pods.length).toBeGreaterThanOrEqual(2);
      expect(sim.pods.length).toBeLessThanOrEqual(3);
      for (const p of sim.pods) {
        expect(p.members.length).toBeGreaterThanOrEqual(4);
        expect(p.members.length).toBeLessThanOrEqual(7);
        expect(p.members.filter((d) => d.calf).length).toBe(1);
      }
    }
  });

  it("are true size: ~2.5 m grown-ups (4 units, nearly twice the kid), ~1.2 m calves", () => {
    const sim = makePods(false);
    for (const p of sim.pods)
      for (const d of p.members) {
        const len = 2.6 * d.size;
        if (d.calf) expect(len / 1.6).toBeCloseTo(DOLPHIN_TRUE_M.calf, 1);
        else {
          expect(len / 1.6).toBeGreaterThan(DOLPHIN_TRUE_M.adult * 0.9);
          expect(len / 1.6).toBeLessThan(DOLPHIN_TRUE_M.adult * 1.1);
        }
      }
    // (formation slots: no two grown-ups' slots closer than a body width)
    for (const p of sim.pods) {
      const A = p.members.filter((d) => !d.calf);
      for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) expect(Math.hypot(A[i].side - A[j].side, A[i].back - A[j].back)).toBeGreaterThan(DOLPHIN_K * 1.1);
    }
  });

  it("find a kid out in the open sea, swim with them, circle, blow bubble rings, leap — then roam off", () => {
    const sim = makePods(false);
    const kid = { x: 0, y: -4, z: 420 };
    expect(kidInOpenSea(kid)).toBe(true);
    const modes = new Set<number>();
    let close = 0;
    let rings = 0;
    let leaps = 0;
    let bumped = 0;
    bad.length = 0;
    run(
      sim,
      200,
      kid,
      true,
      () => {
        checkWater(sim);
        for (const p of sim.pods) {
          modes.add(p.mode);
          for (const d of p.members) {
            if (Math.hypot(d.x - kid.x, d.z - kid.z) < 12) close++;
            // (never right into the kid)
            if (Math.hypot(d.x - kid.x, (d.y - kid.y) * 1.4, d.z - kid.z) < 1.2) bumped++;
          }
        }
        for (let e = 0; e < sim.ev.n; e++) {
          if (sim.ev.buf[e * 5 + 4] === DEV_RING) rings++;
          if (sim.ev.buf[e * 5 + 4] === 1) leaps++;
        }
      },
      { x: 0.3, z: 0 },
    );
    expect(bad).toEqual([]);
    expect(bumped).toBe(0);
    for (const m of [M_ROAM, M_CIRCLE, M_PLAY, M_LEAVE]) expect(modes.has(m), `mode ${m}`).toBe(true);
    expect(close * dt).toBeGreaterThan(60);
    expect(rings).toBeGreaterThan(3);
    expect(leaps).toBeGreaterThan(20);
  });

  it("swim alongside a kid on the move", () => {
    const sim = makePods(false);
    const kid = { x: -300, y: WY, z: -250 };
    let escort = 0;
    let lagging = 0;
    bad.length = 0;
    run(sim, 120, kid, false, () => {
      checkWater(sim);
      if (sim.engaged >= 0 && sim.pods[sim.engaged].mode === M_ESCORT) {
        escort += dt;
        const L = sim.pods[sim.engaged].members[0];
        if (sim.pods[sim.engaged].t > 5 && Math.hypot(L.x - kid.x, L.z - kid.z) > 20) lagging++;
      }
    }, { x: 1.4, z: 0.4 });
    expect(bad).toEqual([]);
    expect(escort).toBeGreaterThan(5);
    expect(lagging).toBe(0);
  });

  it("come and play near Frostpeak too, but keep out of its shallows and away from its icebergs", () => {
    const sim = makePods(false);
    const kid = { x: FROST_ISLAND.x - 93, y: -3.6, z: FROST_ISLAND.z - 45 };
    let close = 0;
    bad.length = 0;
    run(sim, 150, kid, true, () => {
      checkWater(sim);
      for (const p of sim.pods) for (const d of p.members) if (Math.hypot(d.x - kid.x, d.z - kid.z) < 12) close++;
    });
    expect(bad).toEqual([]);
    expect(close * dt).toBeGreaterThan(40);
  });

  it("leave a kid on land, or flying high, alone", () => {
    for (const kid of [
      { x: 0, y: 5, z: 0 },
      { x: 0, y: 60, z: 420 },
    ]) {
      const sim = makePods(false);
      expect(kidInOpenSea(kid)).toBe(false);
      let engaged = 0;
      bad.length = 0;
      run(sim, 120, kid, false, () => {
        checkWater(sim);
        if (sim.engaged !== -1) engaged++;
      });
      expect(bad).toEqual([]);
      expect(engaged).toBe(0);
    }
  });

  it("follow the kid across the world wrap without popping", () => {
    const sim = makePods(false);
    const kid = { x: 0, y: -3, z: 600 };
    run(sim, 30, kid, true);
    const before = sim.pods.map((p) => [p.members[0].x - kid.x, p.members[0].z - kid.z]);
    // (the kid wraps to the far side of the world)
    kid.z = -600;
    stepPods(sim, dt, 30 + dt, kid, true);
    sim.pods.forEach((p, i) => {
      expect(Math.abs(p.members[0].x - kid.x - before[i][0])).toBeLessThan(2);
      expect(Math.abs(p.members[0].z - kid.z - before[i][1])).toBeLessThan(2);
    });
  });

  it("is deterministic", () => {
    const a = makePods(false);
    const b = makePods(false);
    run(a, 40, { x: 0, y: -3, z: 420 }, true);
    run(b, 40, { x: 0, y: -3, z: 420 }, true);
    a.pods.forEach((p, i) => p.members.forEach((d, k) => expect(d.x).toBe(b.pods[i].members[k].x)));
  });

  it("costs ≤ 3 draw calls and cleans up after itself", () => {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xffffff, 150, 430);
    const d = buildDolphinPods(scene, {});
    let t = 0;
    for (let k = 0; k < 60; k++) d.update(dt, (t += dt), { kid: new THREE.Vector3(0, -3, 420), under: true });
    let calls = 0;
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) calls++;
    });
    expect(calls).toBeLessThanOrEqual(3);
    d.dispose();
    expect(scene.children.length).toBe(0);
  });
});
