import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildGrandCanyonDecor } from "./grandCanyonDecor";

// round-6's own regression: canyon-sage was built with room for 90 instances but its scatter loop
// filled up to 140 of them, and canyon-cactus-flowers was built with room for 70 but filled up to
// 80 — every instance past a mesh's own real capacity reads uninitialized GPU buffer memory as its
// transform matrix, a garbage-scaled/rotated copy of the geometry that can blank the whole frame
// to a flat colour (the "black screen"/"green slab" bug this round traced it to). This test builds
// the REAL decor (three.js object construction needs no WebGL context, so this runs in plain
// vitest) and checks every InstancedMesh in it never asks for more instances than it has room for
// — the same invariant grandCanyonDecor.ts's own setInstanceCount() throws on at runtime, caught
// here instead, at test time, before it ever reaches a kid's screen.
import { CANYON_OPEN } from "../registry/grandCanyon";
describe.skipIf(!CANYON_OPEN)("Grand Canyon decor's instanced meshes", () => {
  it("every InstancedMesh's active count is within its own built capacity", () => {
    const scene = new THREE.Scene();
    const decor = buildGrandCanyonDecor(scene);
    const checked: { name: string; count: number; capacity: number }[] = [];
    scene.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (!m.isInstancedMesh) return;
      checked.push({ name: m.name || "(unnamed)", count: m.count, capacity: m.instanceMatrix.count });
    });
    // a real regression guard, not a vacuous pass: the canyon's own flora must actually be present
    expect(checked.length).toBeGreaterThan(0);
    for (const c of checked) {
      expect(c.count, `${c.name}: count (${c.count}) must not exceed its own built capacity (${c.capacity})`).toBeLessThanOrEqual(c.capacity);
      // and the scatter should actually be using a meaningful chunk of what it built (a capacity
      // wildly bigger than anything ever placed would hide a future mismatch just as easily as a
      // capacity that's too small — this isn't pinned tightly, just sane)
      expect(c.count, `${c.name}: placed 0 of ${c.capacity} — the scatter likely isn't running at all`).toBeGreaterThan(0);
    }
    decor.dispose();
  });
});
