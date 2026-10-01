import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { FROST_HIDE_D, buildFrostIsland, frostMeshStats } from "./index";
import { FROST_COLONY, FROST_ISLAND, FROST_SPOTS, frostFacts } from "../../registry/frostIsland";

function worstCase(low: boolean) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 150, 430);
  const f = buildFrostIsland(scene, { lowQuality: low });
  const kid = new THREE.Vector3(FROST_COLONY.x, 2, FROST_COLONY.z);
  let calls = 0;
  let tris = 0;
  let t = 0;
  for (let h = 0; h < 24; h += 3) {
    for (let k = 0; k < 20; k++) f.update(1 / 20, (t += 1 / 20), { kid, glow: h > 18 || h < 6 ? 1 : 0, hour: h, under: false });
    const s = frostMeshStats(scene.getObjectByName("frost-island")!);
    calls = Math.max(calls, s.drawCalls);
    tris = Math.max(tris, s.triangles);
  }
  f.dispose();
  return { calls, tris, left: scene.children.length };
}

describe("Frostpeak Isle rendering", { timeout: 60_000 }, () => {
  it("stays within budget: ≤ 14 draw calls, ≤ 150k triangles (≤ 75k low quality)", () => {
    const hi = worstCase(false);
    expect(hi.calls).toBeLessThanOrEqual(14);
    expect(hi.tris).toBeLessThanOrEqual(150_000);
    const lo = worstCase(true);
    expect(lo.calls).toBeLessThanOrEqual(14);
    expect(lo.tris).toBeLessThanOrEqual(75_000);
    expect(hi.left).toBe(0);
    expect(lo.left).toBe(0);
  });

  it("hides itself far away, shows from nearby, and lights the aurora only at night", () => {
    const scene = new THREE.Scene();
    const f = buildFrostIsland(scene, {});
    const group = scene.getObjectByName("frost-island")!;
    const aurora = scene.getObjectByName("frost-aurora") as THREE.Mesh;
    const aur = () => ((aurora.material as THREE.ShaderMaterial).uniforms.uAurora.value as number);
    f.update(1 / 30, 1, { kid: new THREE.Vector3(FROST_ISLAND.x - FROST_HIDE_D - 20, 0, FROST_ISLAND.z), glow: 1, hour: 22, under: false });
    expect(group.visible).toBe(false);
    f.update(1 / 30, 1.1, { kid: new THREE.Vector3(0, 0, 0), glow: 0, hour: 12, under: false });
    expect(group.visible).toBe(true);
    const near = new THREE.Vector3(FROST_COLONY.x, 2, FROST_COLONY.z);
    f.update(1 / 30, 1.2, { kid: near, glow: 0, hour: 12, under: false });
    expect(aur()).toBe(0);
    f.update(1 / 30, 1.3, { kid: near, glow: 1, hour: 22, under: false });
    expect(aur()).toBeGreaterThan(0.9);
    // (from the park's own island it's too far away to see)
    f.update(1 / 30, 1.4, { kid: new THREE.Vector3(0, 0, 0), glow: 1, hour: 22, under: false });
    expect(aur()).toBeLessThan(0.3);
    f.dispose();
  });

  it("hands back a discovery (with a real fact) near a spot, a new fact each visit, and nothing far away", () => {
    const scene = new THREE.Scene();
    const f = buildFrostIsland(scene, {});
    const colony = FROST_SPOTS.find((s) => s.id === "frost-colony")!;
    const at = new THREE.Vector3(colony.x, 2, colony.z);
    const away = new THREE.Vector3(FROST_ISLAND.x + 20, 30, FROST_ISLAND.z + 200);
    let t = 0;
    const o = (kid: THREE.Vector3) => ({ kid, glow: 0, hour: 12, under: false });
    expect(f.update(1 / 30, (t += 1 / 30), o(away)).spot).toBeNull();
    const first = f.update(1 / 30, (t += 1 / 30), o(at)).spot!;
    expect(first.id).toBe("frost-colony");
    expect(first.name).toBe("Penguin Point");
    expect(frostFacts("frost-colony")).toContain(first.text);
    const text1 = first.text;
    f.update(1 / 30, (t += 1 / 30), o(away));
    const second = f.update(1 / 30, (t += 1 / 30), o(at)).spot!;
    expect(second.text).not.toBe(text1);
    // every spot can be discovered
    for (const s of FROST_SPOTS) {
      f.update(1 / 30, (t += 1 / 30), o(away));
      const r = f.update(1 / 30, (t += 1 / 30), o(new THREE.Vector3(s.x, 2, s.z))).spot;
      expect(r?.id, s.id).toBe(s.id);
    }
    f.dispose();
  });

  it("draws the same thing for the same inputs (deterministic)", () => {
    const snap = () => {
      const scene = new THREE.Scene();
      const f = buildFrostIsland(scene, {});
      const kid = new THREE.Vector3(FROST_COLONY.x, 2, FROST_COLONY.z);
      let t = 0;
      for (let k = 0; k < 300; k++) f.update(1 / 30, (t += 1 / 30), { kid, glow: 0.2, hour: 15, under: false });
      const m = scene.getObjectByName("frost-penguins") as THREE.InstancedMesh;
      const out = Array.from(m.instanceMatrix.array as Float32Array);
      f.dispose();
      return out;
    };
    expect(snap()).toEqual(snap());
  });
});
