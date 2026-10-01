import { describe, expect, it } from "vitest";
import { ASTERN_T, boatCanMove, boatClearance, hullTilt, landingSpot, seaSurfaceY, seaWave, steer, subAltRange, subCanMove, swellDamp, type Helm, type Tilt } from "./craft";
import { BOAT_CAPS, MOUNT_CAPS, SUB_CAPS } from "../../characters/mounts";
import { MOORINGS, RIFT_DOCK, worldFloorY, worldSeaDepth } from "../../registry/harbours";
import { WATER_Y, WRAP_R } from "../../registry/terrain";
import { atSea } from "../underwater/plan";
import { DOCKS } from "../../registry/harbours";
import { VILLAGE_ISLAND } from "../../registry/villageIsland";

const WALK = 7;
const helm = (yaw = 0): Helm => ({ yaw, speed: 0, reverse: false, revT: 0 });
/** a flat sea `d` m deep everywhere, with a wall of land at x > wallX */
const sea = (d: number, wallX = Infinity) => (x: number) => (x > wallX ? -1 : d);

describe("the swell", () => {
  it("matches the ocean shader's waves, and dies away by the beach and round the far islands", () => {
    expect(seaWave(0, 0, 0)).toBeCloseTo(0, 5);
    // calm inside the main island's surf line, full swell out in the deep blue
    expect(swellDamp(0, 150)).toBe(0);
    expect(swellDamp(0, 260)).toBeGreaterThan(0.95);
    // calm by Coralcove's beach
    expect(swellDamp(VILLAGE_ISLAND.x, VILLAGE_ISLAND.z + VILLAGE_ISLAND.r + 2)).toBeLessThan(0.2);
    for (let t = 0; t < 20; t += 1.3) {
      const y = seaSurfaceY(0, 300, t);
      expect(Math.abs(y - WATER_Y)).toBeLessThan(1.2);
    }
  });

  it("a long ship pitches less than a little pedalo on the same swell", () => {
    const a: Tilt = { pitch: 0, roll: 0, y: 0 };
    const b: Tilt = { pitch: 0, roll: 0, y: 0 };
    let small = 0;
    let big = 0;
    for (let t = 0; t < 30; t += 0.37) {
      hullTilt(0, 300, 0.3, 5, 2.6, t, a);
      hullTilt(0, 300, 0.3, 22, 7, t, b);
      small = Math.max(small, Math.abs(a.pitch));
      big = Math.max(big, Math.abs(b.pitch));
      expect(Number.isFinite(a.y + a.pitch + a.roll)).toBe(true);
    }
    expect(small).toBeGreaterThan(big);
    expect(small).toBeLessThan(0.4);
  });
});

describe("boats keep to water deep enough for their hull", () => {
  it("floats in deep water, runs aground in the shallows", () => {
    expect(boatClearance("speedboat", 0, 0, 0, sea(5))).toBeGreaterThan(0);
    expect(boatClearance("ship", 0, 0, 0, sea(1.2))).toBeLessThan(0);
    expect(boatClearance("pedalo", 0, 0, 0, sea(1.2))).toBeGreaterThan(0);
  });

  it("can't drive its bow up a beach / into a jetty, but can always back off one", () => {
    const d = sea(5, 10);
    // heading +x towards the wall: the bow reaches it before the middle does
    const yaw = Math.PI / 2;
    expect(boatCanMove("speedboat", 0, 0, 5, 0, yaw, d)).toBe(true);
    expect(boatCanMove("speedboat", 5, 0, 7, 0, yaw, d)).toBe(false);
    // nudged onto it already: backing away is allowed
    expect(boatCanMove("speedboat", 7, 0, 6, 0, yaw, d)).toBe(true);
  });

  it("the pedalo is a shore boat: out over the deep ocean is out of bounds", () => {
    expect(boatClearance("pedalo", 0, 0, 0, sea(BOAT_CAPS.pedalo.maxSea + 4))).toBeLessThan(0);
    expect(boatClearance("sailboat", 0, 0, 0, sea(30))).toBeGreaterThan(0);
  });

  it("the real moorings and the open sea check out on the world's floor", () => {
    const deep = atSea(0.9, 120);
    expect(boatClearance("ship", deep.x, deep.z, 0, worldSeaDepth)).toBeGreaterThan(0);
    // the main island's beach is no place for a boat
    expect(boatClearance("sailboat", 0, 150, 0, worldSeaDepth)).toBeLessThan(0);
    for (const m of MOORINGS) if (m.kind !== "sub" && m.kind !== "deepsub") expect(boatClearance(m.kind, m.x, m.z, m.yaw, worldSeaDepth), m.id).toBeGreaterThanOrEqual(0);
  });
});

describe("subs dive within their range", () => {
  it("bobs at the surface, dives to just above the floor", () => {
    const r = subAltRange("sub", -20, { lo: 0, hi: 0 });
    expect(r.hi).toBe(SUB_CAPS.sub.surf);
    expect(r.lo).toBeCloseTo(-20 + SUB_CAPS.sub.clear - WATER_Y, 5);
  });

  it("the Bubble Sub stops at its deepest dive; the Deep Explorer reaches the rift floor (~123 m)", () => {
    const floor = -123;
    const a = subAltRange("sub", floor, { lo: 0, hi: 0 });
    const b = subAltRange("deepsub", floor, { lo: 0, hi: 0 });
    expect(a.lo).toBeCloseTo(-SUB_CAPS.sub.maxDepth, 5);
    expect(WATER_Y + b.lo).toBeCloseTo(floor + SUB_CAPS.deepsub.clear, 5);
    expect(WATER_Y + b.lo).toBeLessThan(-118);
    // and the real rift under the Rift Dock is that deep
    expect(worldFloorY(RIFT_DOCK.rift.x, RIFT_DOCK.rift.z)).toBeLessThan(-95);
  });

  it("over water too shallow to dive, it just floats", () => {
    const r = subAltRange("sub", WATER_Y - 2, { lo: 0, hi: 0 });
    expect(r.lo).toBe(r.hi);
  });

  it("can't drive into a wall or up a beach", () => {
    const floor = (x: number) => (x > 10 ? -30 : -100);
    // deep in the rift, the rift's wall at x = 10 is in the way...
    expect(subCanMove("deepsub", -80, 9, 0, floor)).toBe(true);
    expect(subCanMove("deepsub", -80, 11, 0, floor)).toBe(false);
    // ...but up above the lip it can cross
    expect(subCanMove("deepsub", -20, 11, 0, floor)).toBe(true);
    // not onto a beach
    expect(subCanMove("sub", WATER_Y - 0.6, 0, 0, () => WATER_Y - 0.5)).toBe(false);
  });
});

describe("the helm", () => {
  it("speeds up along its heading with momentum, and coasts when you let go", () => {
    const h = helm(0);
    const top = WALK * MOUNT_CAPS.speedboat.speed;
    for (let i = 0; i < 10; i++) steer(h, 0, 1, top, BOAT_CAPS.speedboat.accel, BOAT_CAPS.speedboat.turn, 0.05);
    expect(h.speed).toBeGreaterThan(0);
    expect(h.speed).toBeLessThan(top);
    for (let i = 0; i < 200; i++) steer(h, 0, 1, top, BOAT_CAPS.speedboat.accel, BOAT_CAPS.speedboat.turn, 0.05);
    expect(h.speed).toBeGreaterThan(top * 0.95);
    const v = h.speed;
    steer(h, 0, 0, top, BOAT_CAPS.speedboat.accel, BOAT_CAPS.speedboat.turn, 0.05);
    expect(h.speed).toBeGreaterThan(v * 0.9);
  });

  it("turns at its own pace (the ship slower than the Rocket Boat)", () => {
    const a = helm(0);
    const b = helm(0);
    a.speed = b.speed = 10;
    steer(a, 1, 0, 30, 1, BOAT_CAPS.speedboat.turn, 0.1);
    steer(b, 1, 0, 30, 1, BOAT_CAPS.ship.turn, 0.1);
    expect(a.yaw).toBeGreaterThan(b.yaw);
    expect(a.yaw).toBeLessThan(Math.PI / 2);
  });

  it("from a standstill, pulling the stick behind backs it out of a mooring, then it comes round", () => {
    const h = helm(0);
    let t = 0;
    let minSpeed = 0;
    while (t < ASTERN_T * 0.8) {
      steer(h, 0, -1, 30, 1.3, 2.2, 0.05);
      minSpeed = Math.min(minSpeed, h.speed);
      t += 0.05;
    }
    expect(h.reverse).toBe(true);
    expect(minSpeed).toBeLessThan(-1);
    // (still pointing the same way while backing straight out)
    expect(Math.abs(h.yaw)).toBeLessThan(0.05);
    for (let i = 0; i < 200; i++) steer(h, 0, -1, 30, 1.3, 2.2, 0.05);
    expect(h.reverse).toBe(false);
    expect(h.speed).toBeGreaterThan(5);
    expect(Math.cos(h.yaw - Math.PI)).toBeGreaterThan(0.9);
  });
});

describe("speeds fit the world", () => {
  it("the Rocket Boat crosses the whole ocean in well under a minute; every boat is quicker than swimming", () => {
    const top = WALK * MOUNT_CAPS.speedboat.speed;
    expect((WRAP_R * 2) / top).toBeLessThan(45);
    // the far docks are a short hop away by Rocket Boat
    for (const d of DOCKS) expect(Math.hypot(d.x, d.z) / top, d.id).toBeLessThan(20);
    for (const k of ["pedalo", "sailboat", "ship", "sub", "deepsub"] as const) expect(MOUNT_CAPS[k].speed).toBeGreaterThan(1.05);
    expect(MOUNT_CAPS.speedboat.speed).toBeGreaterThan(MOUNT_CAPS.sailboat.speed);
    expect(MOUNT_CAPS.sailboat.speed).toBeGreaterThan(MOUNT_CAPS.pedalo.speed);
  });
});

describe("stepping off", () => {
  it("finds the jetty beside a boat moored nose-in, and none out at sea", () => {
    const out = { x: 0, z: 0, y: 0 };
    // a deck along x = 6..9 (y 1.2), the boat 4.6 m long nose-in at x = 0 facing +x
    const floor = (x: number, z: number) => (x > 6 && x < 9 && Math.abs(z) < 20 ? 1.2 : -10);
    const at = landingSpot(0, 0, Math.PI / 2, 4.6, 5, floor, out);
    expect(at).not.toBeNull();
    expect(at!.x).toBeGreaterThan(6);
    expect(at!.y).toBeCloseTo(1.2, 5);
    expect(landingSpot(0, 0, 0, 4.6, 5, () => -10, out)).toBeNull();
  });
});
