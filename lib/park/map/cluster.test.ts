import { describe, expect, it } from "vitest";
import { clusterMarkers, visibleItems } from "./cluster";

const cam = (view: number) => ({ cx: 0, cz: 0, view });

describe("clusterMarkers", () => {
  it("keeps distinct markers separate when they have room", () => {
    const items = [
      { id: "a", x: -50, z: 0, emoji: "🐉", priority: 5 },
      { id: "b", x: 50, z: 0, emoji: "🐉", priority: 5 },
    ];
    const out = clusterMarkers(items, cam(100), 400, 400, 30);
    expect(out.length).toBe(2);
    expect(out.every((o) => o.count === 1)).toBe(true);
  });

  it("folds same-emoji neighbours that land within minGapPx into one cluster", () => {
    const items = [
      { id: "a", x: 0, z: 0, emoji: "🐉", priority: 9 },
      { id: "b", x: 1, z: 0, emoji: "🐉", priority: 5 },
      { id: "c", x: -1, z: 1, emoji: "🐉", priority: 3 },
    ];
    const out = clusterMarkers(items, cam(100), 400, 400, 30);
    expect(out.length).toBe(1);
    expect(out[0].count).toBe(3);
    expect(out[0].memberIds.sort()).toEqual(["a", "b", "c"]);
    // the cluster is anchored on the highest-priority member's id
    expect(out[0].id).toContain("a");
  });

  it("never folds different emoji together even when they overlap", () => {
    const items = [
      { id: "dragon", x: 0, z: 0, emoji: "🐉", priority: 9 },
      { id: "dock", x: 0.5, z: 0, emoji: "⛵", priority: 9 },
    ];
    const out = clusterMarkers(items, cam(100), 400, 400, 30);
    expect(out.length).toBe(2);
  });

  it("is stable: the same inputs produce the same grouping every time", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, x: Math.sin(i) * 5, z: Math.cos(i) * 5, emoji: "🌳", priority: 1 }));
    const a = clusterMarkers(items, cam(50), 400, 400, 40);
    const b = clusterMarkers(items, cam(50), 400, 400, 40);
    expect(a).toEqual(b);
  });

  it("zooming in (smaller view) spreads markers out in screen px, so a cluster can split", () => {
    const items = [
      { id: "a", x: 0, z: 0, emoji: "🐉", priority: 9 },
      { id: "b", x: 20, z: 0, emoji: "🐉", priority: 5 },
    ];
    const far = clusterMarkers(items, cam(400), 400, 400, 30); // 20 world units ~ 10px: joined
    expect(far.length).toBe(1);
    const near = clusterMarkers(items, cam(40), 400, 400, 30); // 20 world units ~ 100px: split
    expect(near.length).toBe(2);
  });
});

describe("clusterMarkers groupKey", () => {
  it("keeps two same-emoji mystery markers from different categories apart when groupKey differs", () => {
    const items = [
      { id: "wonder-x", x: 0, z: 0, emoji: "❓", priority: 7, groupKey: "mystery:wonder" },
      { id: "island-y", x: 1, z: 0, emoji: "❓", priority: 7, groupKey: "mystery:island" },
    ];
    const out = clusterMarkers(items, cam(100), 400, 400, 30);
    expect(out.length).toBe(2);
  });

  it("still clusters same groupKey mystery markers together", () => {
    const items = [
      { id: "a", x: 0, z: 0, emoji: "❓", priority: 7, groupKey: "mystery:wonder" },
      { id: "b", x: 1, z: 0, emoji: "❓", priority: 7, groupKey: "mystery:wonder" },
    ];
    const out = clusterMarkers(items, cam(100), 400, 400, 30);
    expect(out.length).toBe(1);
    expect(out[0].count).toBe(2);
  });
});

describe("visibleItems", () => {
  it("drops items well outside the padded viewport", () => {
    const items = [{ x: 0, z: 0 }, { x: 10000, z: 10000 }];
    const out = visibleItems(items, cam(100));
    expect(out.length).toBe(1);
  });
});
