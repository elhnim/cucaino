import { describe, expect, it } from "vitest";
import { terrainBakedTileCentres } from "./terrain";
import { WATER_Y } from "./terrain";

// (its own file: the check is about what merely IMPORTING the module costs, so nothing else may have
// touched the terrain first)
describe("harbours: load cost", () => {
  it("loading the harbours bakes no terrain out by the Great Lake (its jetty's site is frozen)", async () => {
    expect(terrainBakedTileCentres().length).toBe(0);
    const H = await import("./harbours");
    const jetty = H.DOCKS.find((d) => d.id === "great-lake")!;
    for (const t of terrainBakedTileCentres()) expect(Math.hypot(t.x - jetty.x, t.z - jetty.z), `a tile at (${t.x}, ${t.z}) was baked at load`).toBeGreaterThan(300);

    // the frozen site is still what the real search finds…
    const found = H.greatLakeJettySearch();
    expect(found.shore).toBeCloseTo(H.GREAT_LAKE_JETTY.shore, 1);
    expect(found.len).toBeCloseTo(H.GREAT_LAKE_JETTY.len, 1);
    expect(found.startY).toBeCloseTo(H.GREAT_LAKE_JETTY.startY, 1);
    // …and every boat moored there floats, the frozen pedalo included
    for (const m of H.MOORINGS.filter((q) => q.dock === "great-lake")) expect(WATER_Y - H.worldFloorY(m.x, m.z), m.id).toBeGreaterThan(0.6);
  });
});
