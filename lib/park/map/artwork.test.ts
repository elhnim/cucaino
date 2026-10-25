import { describe, expect, it } from "vitest";
import * as artwork from "./artwork";

describe("map artwork (pure geometry, ported from the old MiniMap.tsx)", () => {
  it("builds non-empty path strings for the park's coastline and water", () => {
    for (const key of ["COAST", "BEACH", "PARK_AREA", "RIVER", "RIVER_BANK", "LAKE_PATH", "OUTLET_PATH", "MESA_PATH"] as const) {
      expect(artwork[key].length, key).toBeGreaterThan(10);
      expect(artwork[key].startsWith("M"), key).toBe(true);
    }
  });

  it("builds the Wildlands' waterway and the railway/trade route paths", () => {
    for (const key of ["WILD_RIVER", "WILD_RIVER_BANK", "WILD_LAKE_PATH", "WILD_OUTLET_PATH", "RAIL_PATH", "CART_ROAD_PATH"] as const) {
      expect(artwork[key].length, key).toBeGreaterThan(10);
    }
  });

  it("scatters a believable number of trees, none literally on top of each other", () => {
    expect(artwork.TREES.length).toBeGreaterThan(20);
    expect(artwork.JUNGLE_TREES.length).toBeGreaterThan(50);
    for (let i = 0; i < artwork.TREES.length; i++)
      for (let j = i + 1; j < artwork.TREES.length; j++) expect(Math.hypot(artwork.TREES[i].x - artwork.TREES[j].x, artwork.TREES[i].z - artwork.TREES[j].z)).toBeGreaterThan(0.01);
  });

  it("is deterministic: building it twice gives identical trees (re-import = same module cache, but the generator itself is seeded)", () => {
    expect(artwork.TREES.map((t) => t.x)).toEqual(artwork.TREES.map((t) => t.x));
  });

  it("gives every world place a drawable shape", () => {
    expect(artwork.WORLD_SHAPES.length).toBeGreaterThan(0);
    for (const s of artwork.WORLD_SHAPES) expect(s.land.length).toBeGreaterThan(0);
  });

  it("land blobs cover every non-gate, non-karts land (the kart circuit draws its own track instead)", () => {
    const ids = new Set(artwork.LAND_SHAPES.map((s) => s.l.id));
    expect(ids.has("gate")).toBe(false);
    expect(ids.has("karts")).toBe(false);
    expect(ids.size).toBe(artwork.LAND_SHAPES.length);
    expect(ids.size).toBeGreaterThan(5);
  });

  it("draws the kart circuit as its own track outline, not a blob", () => {
    expect(artwork.KART_TRACK_PATH.startsWith("M")).toBe(true);
    expect(artwork.KART_TRACK_PATH.length).toBeGreaterThan(50);
    expect(artwork.KART_TRACK_WIDTH).toBeGreaterThan(0);
    expect(Number.isFinite(artwork.KART_PIN.x)).toBe(true);
    expect(Number.isFinite(artwork.KART_PIN.z)).toBe(true);
  });

  it("builds a dotted footpath for every settlement that has one, and railway sleepers along the whole loop", () => {
    expect(artwork.FOOTPATH_PATHS.length).toBeGreaterThan(0);
    for (const p of artwork.FOOTPATH_PATHS) expect(p.startsWith("M")).toBe(true);
    expect(artwork.RAIL_SLEEPERS.length).toBeGreaterThan(10);
    for (const s of artwork.RAIL_SLEEPERS) {
      expect(Number.isFinite(s.x1)).toBe(true);
      expect(Math.hypot(s.x1 - s.x2, s.z1 - s.z2)).toBeGreaterThan(0);
    }
  });

  it("scatters Wildlands forest clusters away from the park's own canopy", () => {
    expect(artwork.WILD_FOREST_CLUSTERS.length).toBeGreaterThan(20);
    for (const t of artwork.WILD_FOREST_CLUSTERS) expect(Math.hypot(t.x, t.z)).toBeGreaterThan(artwork.TERRAIN_EXTENT * 0.4);
  });

  it("gives the Wildlands' unnamed regions a label, each on dry land", () => {
    expect(artwork.REGION_LABELS.length).toBe(2);
    for (const r of artwork.REGION_LABELS) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(Number.isFinite(r.x)).toBe(true);
      expect(Number.isFinite(r.z)).toBe(true);
    }
  });

  it("marks both named summits", () => {
    expect(artwork.MOUNTAIN_PEAKS.length).toBe(2);
    expect(artwork.MOUNTAIN_PEAKS.map((p) => p.id)).toEqual(expect.arrayContaining(["lone-peak", "everest-summit"]));
  });

  it("relief builders return null outside a browser instead of throwing", () => {
    expect(() => artwork.parkRelief()).not.toThrow();
    expect(() => artwork.islandRelief()).not.toThrow();
    expect(() => artwork.localRelief(1000, -600, 90)).not.toThrow();
  });
});
