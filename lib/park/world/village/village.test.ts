import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildVillage, villageMeshStats } from "./index";
import { VILLAGERS_TALK, VILLAGE_ISLAND, VILLAGE_MARKET } from "../../registry/villageIsland";

function worstCase(low: boolean) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 150, 430);
  const v = buildVillage(scene, { lowQuality: low });
  const kid = new THREE.Vector3(VILLAGE_MARKET.x, 2.5, VILLAGE_MARKET.z);
  let calls = 0;
  let tris = 0;
  // sample the day: the busiest moment sets the budget
  let t = 0;
  for (let h = 0; h < 24; h += 1.5) {
    for (let k = 0; k < 20; k++) v.update(1 / 20, (t += 1 / 20), { kid, glow: h > 18 || h < 6 ? 1 : 0, hour: h });
    const s = villageMeshStats(scene.getObjectByName("village-island")!);
    calls = Math.max(calls, s.drawCalls);
    tris = Math.max(tris, s.triangles);
  }
  v.dispose();
  return { calls, tris, left: scene.children.length };
}

describe("Coralcove Isle rendering", () => {
  it("stays within budget: ≤ 16 draw calls, ≤ 160k triangles (≤ 80k low quality)", () => {
    const hi = worstCase(false);
    expect(hi.calls).toBeLessThanOrEqual(16);
    expect(hi.tris).toBeLessThanOrEqual(160_000);
    const lo = worstCase(true);
    expect(lo.calls).toBeLessThanOrEqual(16);
    expect(lo.tris).toBeLessThanOrEqual(80_000);
    // dispose removes everything it added
    expect(hi.left).toBe(0);
    expect(lo.left).toBe(0);
  });

  it("returns a talking villager near the kid, and nothing far away; hides itself far out at sea", () => {
    const scene = new THREE.Scene();
    const v = buildVillage(scene, {});
    const group = scene.getObjectByName("village-island")!;
    // (from the main island it is in view; from the far side of the world it is not)
    const far = new THREE.Vector3(-300, 0, 300);
    expect(v.update(1 / 30, 1, { kid: far, glow: 0, hour: 10 }).talk).toBeNull();
    expect(group.visible).toBe(false);
    v.update(1 / 30, 1.1, { kid: new THREE.Vector3(0, 0, 0), glow: 0, hour: 10 });
    expect(group.visible).toBe(true);
    // at the fire at dusk Grandma Coralie is telling stories: stand beside her
    let talk = null as { id: string; name: string; line: string } | null;
    let t = 2;
    for (let k = 0; k < 40; k++) talk = v.update(1 / 30, (t += 1 / 30), { kid: new THREE.Vector3(VILLAGE_ISLAND.x - 25.2, 3, VILLAGE_ISLAND.z + 4 + 3.3 + 1.5), glow: 1, hour: 21 }).talk ?? talk;
    expect(group.visible).toBe(true);
    // (Grandma Coralie on her bench, or one of the dancers going by)
    expect(VILLAGERS_TALK.map((x) => x.name)).toContain(talk?.name);
    expect(talk?.line.length).toBeGreaterThan(5);
    v.dispose();
  });
});
