import { describe, expect, it } from "vitest";
import { seaDist } from "./island";
import { nearRail, STATIONS } from "./railway";
import { wildWaterSdf } from "./wildWater";
import { footprintStats } from "./landform";
import { SETTLEMENTS } from "./settlements";
import { BASE_CAMP_RADIUS, BASE_CAMP_SITE, findBaseCampSite } from "./everestBaseCamp";

describe("Everest Base Camp's site (registry/everestBaseCamp.ts)", () => {
  it("re-running the search lands exactly on the stored site (the same 'freeze the number' discipline as every other settlement)", () => {
    const others = SETTLEMENTS.filter((s) => s.id !== "basecamp").map((s) => ({ x: s.x, z: s.z }));
    const found = findBaseCampSite(others);
    expect(found).toEqual(BASE_CAMP_SITE);
  });

  it("sits dry, inside the island, clear of the rail, near its station (lake-station)", () => {
    const s = SETTLEMENTS.find((x) => x.id === "basecamp")!;
    expect(s).toBeTruthy();
    expect(seaDist(s.x, s.z)).toBeLessThan(-40);
    expect(nearRail(s.x, s.z, 8)).toBe(false);
    expect(wildWaterSdf(s.x, s.z)).toBeGreaterThan(8);
    const station = STATIONS.find((st) => st.id === s.stationId)!;
    expect(station).toBeTruthy();
    expect(station.id).toBe("lake-station");
  });

  it("sits on genuinely gentle real ground the whole way out to its own radius (not just levelled to look that way)", () => {
    const stats = footprintStats(BASE_CAMP_SITE.x, BASE_CAMP_SITE.z, BASE_CAMP_RADIUS);
    expect(stats.maxSlope).toBeLessThanOrEqual(0.4);
    expect(stats.relief).toBeLessThanOrEqual(7);
  });

  it("every climber's tent and the fire sit well clear of the rail and the water", () => {
    const s = SETTLEMENTS.find((x) => x.id === "basecamp")!;
    for (const h of s.huts) {
      expect(nearRail(h.x, h.z, 8), `tent at ${h.x},${h.z}`).toBe(false);
      expect(wildWaterSdf(h.x, h.z), `tent at ${h.x},${h.z} should be dry`).toBeGreaterThan(0);
    }
  });

  it("offers the \"Climb Everest!\" activity at its trailhead", () => {
    const s = SETTLEMENTS.find((x) => x.id === "basecamp")!;
    const act = s.activities.find((a) => a.id === "climb-everest");
    expect(act).toBeTruthy();
    expect(act!.label).toBe("Climb Everest!");
  });

  it("keeps the helipad clear — no tent, yak or any other obstacle stands on its own landing circle", () => {
    const s = SETTLEMENTS.find((x) => x.id === "basecamp")!;
    const pad = s.props.find((p) => p.kind === "helipad");
    expect(pad).toBeTruthy();
    const HELIPAD_CLEARANCE = 4.5; // a little past the rendered pad's own ~3.3-unit radius
    for (const h of s.huts) expect(Math.hypot(h.x - pad!.x, h.z - pad!.z), `tent at ${h.x},${h.z}`).toBeGreaterThan(HELIPAD_CLEARANCE);
    for (const f of s.fauna) expect(Math.hypot(f.x - pad!.x, f.z - pad!.z), `${f.id} at ${f.x},${f.z}`).toBeGreaterThan(HELIPAD_CLEARANCE);
    for (const o of s.obstacles) expect(Math.hypot(o.x - pad!.x, o.z - pad!.z), `obstacle at ${o.x},${o.z}`).toBeGreaterThan(HELIPAD_CLEARANCE - o.r);
  });
});
