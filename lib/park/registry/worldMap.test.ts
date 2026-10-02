import { describe, expect, it } from "vitest";
import { ISLAND_CENTER, ISLAND_DESTINATIONS, ISLAND_LANDMARKS, ISLAND_VIEW, WORLD_EDGE, WORLD_PLACES } from "./worldMap";
import { TERRAIN_X0, TERRAIN_X1, TERRAIN_Z0, TERRAIN_Z1, WRAP_R } from "./terrain";
import { seaDist } from "./island";
import { STATIONS } from "./railway";

describe("the big island's map destinations (the Island tab)", () => {
  it("has one destination per railway station, each on dry land, each unique", () => {
    expect(ISLAND_DESTINATIONS.length).toBe(STATIONS.length);
    const ids = new Set<string>();
    for (const dest of ISLAND_DESTINATIONS) {
      expect(ids.has(dest.id), `duplicate id ${dest.id}`).toBe(false);
      ids.add(dest.id);
      expect(seaDist(dest.x, dest.z), `${dest.name} (${dest.x},${dest.z})`).toBeLessThan(0);
      expect(dest.name.length).toBeGreaterThan(0);
      expect(dest.emoji.length).toBeGreaterThan(0);
    }
    // Park Station is the one just outside the park; the rest are far out in the Wildlands
    expect(ISLAND_DESTINATIONS.some((d) => d.id === "park-station")).toBe(true);
  });

  it("labels the Great Ridge and the Lone Peak, each on dry land, with unique ids", () => {
    expect(ISLAND_LANDMARKS.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const l of ISLAND_LANDMARKS) {
      expect(ids.has(l.id), `duplicate id ${l.id}`).toBe(false);
      ids.add(l.id);
      expect(seaDist(l.x, l.z), `${l.name} (${l.x},${l.z})`).toBeLessThan(0);
    }
    // landmarks and destinations never clash ids
    for (const d of ISLAND_DESTINATIONS) expect(ids.has(d.id)).toBe(false);
  });

  it("frames the whole island (destinations and landmarks all comfortably inside the Island tab's view)", () => {
    expect(ISLAND_VIEW).toBeGreaterThan(Math.max(TERRAIN_X1 - TERRAIN_X0, TERRAIN_Z1 - TERRAIN_Z0) / 2);
    for (const p of [...ISLAND_DESTINATIONS, ...ISLAND_LANDMARKS]) {
      expect(Math.abs(p.x - ISLAND_CENTER.x)).toBeLessThan(ISLAND_VIEW);
      expect(Math.abs(p.z - ISLAND_CENTER.z)).toBeLessThan(ISLAND_VIEW);
    }
  });

  it("the World tab's edge matches the world's wrap radius", () => {
    expect(WORLD_EDGE).toBe(WRAP_R);
    // every far island/sky/abyss place sits well inside the edge it's drawn against
    for (const w of WORLD_PLACES) expect(Math.hypot(w.x, w.z) + w.r).toBeLessThan(WORLD_EDGE);
  });
});
