import { describe, expect, it } from "vitest";
import { LANDS, PLACES } from "./places";
import { KART_SITE, KART_SITE_RADIUS } from "./kartTrack";
import { kartDoorWorld } from "../world/karts";

describe("the 'karts' land and its pit-garage door stay in step with registry/kartTrack.ts", () => {
  it("the land's centre + radius copy KART_SITE / KART_SITE_RADIUS exactly", () => {
    const land = LANDS.find((l) => l.id === "karts")!;
    expect(land).toBeTruthy();
    expect(land.x).toBeCloseTo(KART_SITE.x, 1);
    expect(land.z).toBeCloseTo(KART_SITE.z, 1);
    expect(land.radius).toBe(KART_SITE_RADIUS);
  });

  it("the pit garage door matches lib/park/world/karts/index.ts's own kartDoorWorld()", () => {
    const door = PLACES.find((p) => p.id === "go-karts")!;
    expect(door).toBeTruthy();
    expect(door.action).toBe("karts");
    expect(door.land).toBe("karts");
    const [wx, wz] = kartDoorWorld();
    expect(door.x).toBeCloseTo(wx, 0);
    expect(door.z).toBeCloseTo(wz, 0);
  });
});
