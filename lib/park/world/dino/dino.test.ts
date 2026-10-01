import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildDinoIsland, dinoMeshStats } from "./index";
import { DINO_ISLAND, DINO_PADDOCK, DINO_RANGES, DINO_SPECIES, DINO_SPOTS, DINO_SPOT_FACTS, dinoGroundY } from "../../registry/dinoIsland";

function worstCase(low: boolean) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 150, 430);
  const w = buildDinoIsland(scene, { lowQuality: low });
  const kid = new THREE.Vector3(DINO_PADDOCK.x - 18, 5, DINO_PADDOCK.z - 12);
  let calls = 0;
  let tris = 0;
  let t = 0;
  for (let h = 0; h < 24; h += 3) {
    for (let k = 0; k < 20; k++) w.update(1 / 20, (t += 1 / 20), { kid, glow: h > 18 || h < 6 ? 1 : 0, hour: h });
    const s = dinoMeshStats(scene.getObjectByName("dino-island")!);
    calls = Math.max(calls, s.drawCalls);
    tris = Math.max(tris, s.triangles);
  }
  w.dispose();
  return { calls, tris, left: scene.children.length };
}

describe("Dino Isle rendering", () => {
  it("stays within budget: ≤ 24 draw calls, ≤ 240k triangles (≤ 120k low quality)", () => {
    const hi = worstCase(false);
    expect(hi.calls).toBeLessThanOrEqual(24);
    expect(hi.tris).toBeLessThanOrEqual(240_000);
    const lo = worstCase(true);
    expect(lo.calls).toBeLessThanOrEqual(24);
    expect(lo.tris).toBeLessThanOrEqual(120_000);
    expect(hi.left).toBe(0);
    expect(lo.left).toBe(0);
  });

  it("hides itself far away, shows from the main island", () => {
    const scene = new THREE.Scene();
    const w = buildDinoIsland(scene, {});
    const group = scene.getObjectByName("dino-island")!;
    const far = new THREE.Vector3(285, 0, -300);
    const r = w.update(1 / 30, 1, { kid: far, glow: 0, hour: 10 });
    expect(r.spot).toBeNull();
    expect(r.roar).toBe(false);
    expect(group.visible).toBe(false);
    w.update(1 / 30, 1.1, { kid: new THREE.Vector3(0, 0, 0), glow: 0, hour: 10 });
    expect(group.visible).toBe(true);
    w.dispose();
  });

  it("the T-rex roars when the kid comes to its fence (roar true on that frame only), then naps", () => {
    const scene = new THREE.Scene();
    const w = buildDinoIsland(scene, {});
    const P = DINO_PADDOCK;
    const kid = new THREE.Vector3(P.x - P.r - 3, 3, P.z);
    let roars = 0;
    let t = 0;
    let streak = 0;
    let maxStreak = 0;
    for (let k = 0; k < 30 * 40; k++) {
      const r = w.update(1 / 30, (t += 1 / 30), { kid, glow: 0, hour: 11 });
      if (r.roar) {
        roars++;
        streak++;
      } else streak = 0;
      maxStreak = Math.max(maxStreak, streak);
    }
    expect(roars).toBeGreaterThanOrEqual(1);
    expect(roars).toBeLessThanOrEqual(3);
    expect(maxStreak).toBe(1);
    w.dispose();
  });

  it("discovers places and animals with real facts when the kid is close", () => {
    const scene = new THREE.Scene();
    const w = buildDinoIsland(scene, {});
    const gate = DINO_SPOTS.find((s) => s.kind === "gate")!;
    let t = 0;
    let spot = null as { id: string; name: string; text: string } | null;
    for (let k = 0; k < 10; k++) spot = w.update(1 / 30, (t += 1 / 30), { kid: new THREE.Vector3(gate.x, dinoGroundY(gate.x, gate.z)!, gate.z), glow: 0, hour: 10 }).spot;
    expect(spot).not.toBeNull();
    expect(spot!.text.length).toBeGreaterThan(10);
    expect([...Object.values(DINO_SPOT_FACTS), ...Object.values(DINO_SPECIES).map((s) => s.fact)]).toContain(spot!.text);
    // walking round the island finds lots of different discoveries (places and animals)
    const found = new Set<string>();
    // (the places, and the middle of a few herds' home ranges)
    const visits = [...DINO_SPOTS, DINO_RANGES.brachio, DINO_RANGES.mammoth, DINO_RANGES.trike];
    for (const s of visits) {
      for (let k = 0; k < 6; k++) {
        const r = w.update(1 / 30, (t += 1 / 30), { kid: new THREE.Vector3(s.x, 3, s.z), glow: 0, hour: 12 });
        if (r.spot) found.add(r.spot.id);
      }
    }
    expect(found.size).toBeGreaterThanOrEqual(10);
    expect([...found].some((id) => id.startsWith("herd-"))).toBe(true);
    // out at sea: nothing
    expect(w.update(1 / 30, (t += 1 / 30), { kid: new THREE.Vector3(DINO_ISLAND.x + 200, 0, DINO_ISLAND.z), glow: 0, hour: 12 }).spot).toBeNull();
    w.dispose();
  });

  it("is deterministic (two islands built and run the same way match)", () => {
    const run = () => {
      const scene = new THREE.Scene();
      const w = buildDinoIsland(scene, {});
      let t = 0;
      for (let k = 0; k < 90; k++) w.update(1 / 30, (t += 1 / 30), { kid: new THREE.Vector3(DINO_ISLAND.x + 20, 3, DINO_ISLAND.z - 10), glow: 0.3, hour: 17 });
      const m = scene.getObjectByName("dino-mammoth") as THREE.InstancedMesh;
      const out = Array.from(m.instanceMatrix.array.slice(0, 32));
      w.dispose();
      return out;
    };
    expect(run()).toEqual(run());
  });
});
