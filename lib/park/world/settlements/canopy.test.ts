import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { buildCanopy, buildCrownGeometry, crownBase, CROWN_CLEAR } from "./canopy";

// (the crowns stand on whatever ground terrain.ts gives; flat here, so the test is about the tree)
vi.mock("../../registry/terrain", () => ({ groundY: () => 0 }));

const tree = { x: 10, z: -4, yaw: 0.3, scale: 1, elev: 9.4 };

describe("Treetop canopy", () => {
  it("every leaf sits well above the platform (headroom over the kid and the cabin)", () => {
    const g = buildCrownGeometry(tree, 0);
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const fx = g.getAttribute("aFx") as THREE.BufferAttribute;
    let minLeaf = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      maxY = Math.max(maxY, pos.getY(i));
      // (leaves sway; the limbs and trunk barely do)
      if (fx.getY(i) > 0.2) minLeaf = Math.min(minLeaf, pos.getY(i));
    }
    expect(minLeaf).toBeGreaterThan(tree.elev + CROWN_CLEAR - 2.5);
    expect(crownBase(tree)).toBeGreaterThanOrEqual(tree.elev + 6);
    // tiered, not one squat blob: the crown is tall as well as wide
    expect(maxY - minLeaf).toBeGreaterThan(6);
  });

  it("is one draw call for every tree, and disposes cleanly", () => {
    const group = new THREE.Group();
    const c = buildCanopy(group, [tree, { ...tree, x: 40, elev: 13.2 }], true);
    expect(c.calls).toBe(1);
    expect(group.children.length).toBe(1);
    c.update(new THREE.Vector3(10, 9.4, -4));
    c.dispose();
    expect(group.children.length).toBe(0);
  });
});
