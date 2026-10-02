import { describe, expect, it } from "vitest";
import { BOAT_CAPS, MOUNT_BODY } from "../../characters/mounts";
import { BUMP_BODY, BUMP_DEEP, HULL_STEP, bodyOverlap, boatClearance, hullBody, moveBoat, steer, type Helm, type SeaBody } from "./craft";

const helm = (yaw: number): Helm => ({ yaw, speed: 0, reverse: false, revT: 0 });
const open = () => 40;
const dt = 1 / 30;

describe("boats keep apart: no sailing through each other, whales or the sea friends", () => {
  it("a Rocket Boat driven flat out at a moored sailboat bumps off it gently and never sails through", () => {
    const moored = hullBody("sailboat", 0, 20, Math.PI / 2, { x: 0, z: 0, r: 0, hl: 0, yaw: 0 });
    const h = helm(0);
    const pos = { x: 0, z: 0 };
    const me: SeaBody = { x: 0, z: 0, r: 0, hl: 0, yaw: 0 };
    const push = { x: 0, z: 0 };
    let bumps = 0;
    let worst = 0;
    let bounced = false;
    for (let i = 0; i < 30 * 12; i++) {
      steer(h, 0, 1, 35, BOAT_CAPS.speedboat.accel, BOAT_CAPS.speedboat.turn, dt);
      const ev = moveBoat("speedboat", h, pos, dt, open, [moored]);
      if (ev === BUMP_BODY) {
        bumps++;
        if (h.speed < 0) bounced = true;
      }
      worst = Math.max(worst, bodyOverlap(hullBody("speedboat", pos.x, pos.z, h.yaw, me), moored, push));
    }
    expect(bumps).toBeGreaterThan(0);
    // (a soft bounce back, then it noses up against it again - but never into it)
    expect(bounced).toBe(true);
    expect(worst).toBeLessThan(0.3);
    expect(pos.z).toBeLessThan(20 - MOUNT_BODY.sailboat[1]);
  });
  it("two boats side by side are pushed apart, not left overlapping", () => {
    const other = hullBody("speedboat", 1.5, 0, 0, { x: 0, z: 0, r: 0, hl: 0, yaw: 0 });
    const pos = { x: 0, z: 0 };
    const h = helm(0);
    moveBoat("speedboat", h, pos, dt, open, [other]);
    const me = hullBody("speedboat", pos.x, pos.z, 0, { x: 0, z: 0, r: 0, hl: 0, yaw: 0 });
    expect(bodyOverlap(me, other, { x: 0, z: 0 })).toBeLessThan(1e-6);
    expect(pos.x).toBeLessThan(0);
  });
  it("a whale's back at the surface is something to bump, too (a 40-unit capsule)", () => {
    const whale: SeaBody = { x: 0, z: 30, r: 4, hl: 14, yaw: Math.PI / 2 };
    const h = helm(0);
    const pos = { x: 0, z: 0 };
    for (let i = 0; i < 30 * 15; i++) {
      steer(h, 0, 1, 18, BOAT_CAPS.ship.accel, BOAT_CAPS.ship.turn, dt);
      moveBoat("ship", h, pos, dt, open, [whale]);
    }
    expect(pos.z + MOUNT_BODY.ship[0] + MOUNT_BODY.ship[2]).toBeLessThan(30 - whale.r + 0.3);
  });
});

describe("the duck pedalo stays near the shore", () => {
  // the shelf deepens steadily out to sea (+x): 15 m deep at x = 30
  const shelf = (x: number) => Math.max(0, x * 0.5);
  it("pedalling straight out to sea, it bounces back gently at its depth limit (and says why)", () => {
    const h = helm(Math.PI / 2);
    const pos = { x: 10, z: 0 };
    let deep = 0;
    let maxX = 0;
    let backs = 0;
    for (let i = 0; i < 30 * 30; i++) {
      steer(h, 1, 0, 8, BOAT_CAPS.pedalo.accel, BOAT_CAPS.pedalo.turn, dt);
      const ev = moveBoat("pedalo", h, pos, dt, (x) => shelf(x), []);
      if (ev === BUMP_DEEP) {
        deep++;
        if (h.speed < 0) backs++;
      }
      maxX = Math.max(maxX, pos.x);
    }
    expect(deep).toBeGreaterThan(0);
    expect(backs).toBe(deep);
    // never out past ~15 m of water
    expect(shelf(maxX)).toBeLessThanOrEqual(BOAT_CAPS.pedalo.maxSea + 0.6);
    // and it got close to the limit (not stopped far short)
    expect(shelf(maxX)).toBeGreaterThan(BOAT_CAPS.pedalo.maxSea - 2);
  });
  it("from out there it can always pedal back in", () => {
    const h = helm(-Math.PI / 2);
    const pos = { x: 30.5, z: 0 };
    for (let i = 0; i < 30 * 4; i++) {
      steer(h, -1, 0, 8, BOAT_CAPS.pedalo.accel, BOAT_CAPS.pedalo.turn, dt);
      moveBoat("pedalo", h, pos, dt, (x) => shelf(x), []);
    }
    expect(pos.x).toBeLessThan(26);
  });
});

describe("hull clearance covers the whole hull", () => {
  it("even a jetty pile (1.6 m) under the Pirate Ship's long side stops it (5 samples used to miss it)", () => {
    const [hl, hw] = MOUNT_BODY.ship;
    // a 0.5-wide post just inside the hull's side, a third of the way back from the middle
    const px = hw * 0.85;
    const pz = -hl * 0.33;
    const depth = (x: number, z: number) => (Math.abs(x - px) < 0.25 + HULL_STEP * 0.5 && Math.abs(z - pz) < 0.25 + HULL_STEP * 0.5 ? -1 : 30);
    expect(boatClearance("ship", 0, 0, 0, depth)).toBeLessThan(0);
    // (and clear water is clear)
    expect(boatClearance("ship", 0, 0, 0, open)).toBeGreaterThan(0);
  });
});
