import { describe, expect, it } from "vitest";
import { buildKartTrackShape } from "../karts/track";
import { findKartTrackSite, kartLocalToWorld, kartTrackWorld, KART_ROTATION, KART_SITE, nearKartTrack } from "./kartTrack";
import { seaDist, nearTrail } from "./island";
import { nearRail, STATIONS } from "./railway";
import { nearCartRoad } from "./cartRoad";
import { PLACES } from "./places";

const PARK_STATION = STATIONS.find((s) => s.id === "park-station")!;

describe("kart track site", () => {
  it("re-running the search lands exactly on the stored site (TOWN_SITE's own pattern)", () => {
    const found = findKartTrackSite();
    expect(found.x).toBeCloseTo(KART_SITE.x, 5);
    expect(found.z).toBeCloseTo(KART_SITE.z, 5);
    expect(found.rotation).toBeCloseTo(KART_ROTATION, 2);
  });

  it("sits 170-300 m from the plaza", () => {
    const d = Math.hypot(KART_SITE.x, KART_SITE.z);
    expect(d).toBeGreaterThanOrEqual(170);
    expect(d).toBeLessThanOrEqual(300);
  });

  it("sits within 120 m of Park Station", () => {
    const d = Math.hypot(KART_SITE.x - PARK_STATION.x, KART_SITE.z - PARK_STATION.z);
    expect(d).toBeLessThanOrEqual(120);
  });

  it("the whole track footprint clears every OTHER park place by 40 m (the kart track's own land/door are naturally right beside it, not obstacles to themselves)", () => {
    const world = kartTrackWorld();
    for (const p of world.points) {
      for (const place of PLACES) {
        if (place.land === "karts") continue;
        expect(Math.hypot(p.x - place.x, p.z - place.z)).toBeGreaterThanOrEqual(place.radius + 40 - 0.5);
      }
    }
  });

  it("the whole track footprint clears the railway by >15 m", () => {
    const world = kartTrackWorld();
    for (const p of world.points) expect(nearRail(p.x, p.z, 15)).toBe(false);
  });

  it("the whole track footprint clears the cart road by >12 m", () => {
    const world = kartTrackWorld();
    for (const p of world.points) expect(nearCartRoad(p.x, p.z, 12)).toBe(false);
  });

  it("the whole track footprint clears every trail", () => {
    const world = kartTrackWorld();
    for (const p of world.points) expect(nearTrail(p.x, p.z, 8)).toBe(false);
  });

  it("the whole track footprint is solidly dry, well clear of the sea", () => {
    const world = kartTrackWorld();
    for (const p of world.points) expect(seaDist(p.x, p.z)).toBeLessThanOrEqual(-25);
  });

  it("kartLocalToWorld + nearKartTrack agree with the track's own local shape", () => {
    const shape = buildKartTrackShape();
    const samplePoint = shape.points[10];
    const world = kartLocalToWorld(KART_SITE, KART_ROTATION, { x: samplePoint[0], z: samplePoint[1] });
    expect(nearKartTrack(world.x, world.z, 0.5)).toBe(true);
    expect(nearKartTrack(world.x + 500, world.z + 500, 0.5)).toBe(false);
  });

  it("kartTrackWorld is memoised (same reference on repeat calls)", () => {
    expect(kartTrackWorld()).toBe(kartTrackWorld());
  });
});
