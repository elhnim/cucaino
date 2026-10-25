import { describe, expect, it } from "vitest";
import { planTrip, TRAIN_SPEED } from "./planner";
import { STATIC_ENTITIES } from "./entities";
import { RAIL_LENGTH, STATIONS } from "../registry/railway";
import { CAR_PARKS, inRoadCorridor } from "../registry/roads";

const ent = (id: string) => STATIC_ENTITIES.find((e) => e.id === id)!;

describe("planTrip: travel the way the world really works", () => {
  it("a train ride is timed the one way the train runs, not the shorter way round", () => {
    const falls = STATIONS.find((s) => s.id === "falls-station")!;
    const park = STATIONS.find((s) => s.id === "park-station")!;
    let forward = park.s - falls.s;
    if (forward < 0) forward += RAIL_LENGTH;
    const train = planTrip({ x: falls.x, z: falls.z }, ent("park-station")).find((o) => o.legs.some((l) => l.mode === "train"))!;
    const ride = train.legs.find((l) => l.mode === "train")!;
    expect(ride.etaSec).toBeGreaterThanOrEqual(forward / TRAIN_SPEED);
    // and the two directions between the same pair add up to (at least) a whole loop
    const back = planTrip({ x: park.x, z: park.z }, ent("falls-station")).find((o) => o.legs.some((l) => l.mode === "train"))!;
    expect(ride.etaSec + back.legs.find((l) => l.mode === "train")!.etaSec).toBeGreaterThanOrEqual(RAIL_LENGTH / TRAIN_SPEED);
  });

  it("standing at the right station already, no train is offered", () => {
    const lake = STATIONS.find((s) => s.id === "lake-station")!;
    const options = planTrip({ x: lake.x + 2, z: lake.z + 2 }, ent("lakeside"));
    expect(options.some((o) => o.legs.some((l) => l.mode === "train"))).toBe(false);
    expect(options.some((o) => o.mode === "walk")).toBe(true);
  });

  it("every jeep leg ends in a car park a jeep can reach, with a walk on to the place itself", () => {
    let jeepTrips = 0;
    for (const to of STATIC_ENTITIES) {
      if (to.remote) continue;
      for (const o of planTrip({ x: 0, z: 0 }, to)) {
        o.legs.forEach((leg, i) => {
          if (leg.mode !== "jeep") return;
          jeepTrips++;
          expect(CAR_PARKS.some((c) => Math.hypot(c.x - leg.x, c.z - leg.z) < 1), `${to.id}: the drive ends off the road`).toBe(true);
          expect(inRoadCorridor(leg.x, leg.z), `${to.id}`).toBe(true);
          // walked to the jeep first, and walks on afterwards
          expect(o.legs[i - 1]?.mode, `${to.id}: no walk to the jeep`).toBe("walk");
          expect(CAR_PARKS.some((c) => Math.hypot(c.x - o.legs[i - 1].x, c.z - o.legs[i - 1].z) < 1), `${to.id}`).toBe(true);
          expect(o.legs[i + 1]?.mode, `${to.id}: no walk on from the car park`).toBe("walk");
        });
      }
    }
    expect(jeepTrips).toBeGreaterThan(0);
  });
});
