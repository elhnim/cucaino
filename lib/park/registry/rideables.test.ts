import { describe, expect, it } from "vitest";
import { RIDEABLE_SPOTS, placeClearance, rideableKeepOut, trailInfo } from "./rideables";
import { MOUNT_CAPS, RIDEABLE_KINDS, mountLean, type MountKind } from "../characters/mounts";
import { PLACES } from "./places";
import { TRAIL_WIDTH, coastR, nearStream } from "./island";
import { WATER_Y, groundY } from "./terrain";
import { SKY_PADS, skyBaseY, skyIslandById, skyWalkable } from "./skyIslands";
import { seaDepth, seaFloorY } from "../world/sea/wander";
import { zoneBounds } from "../builder/rules";

const of = (k: MountKind) => RIDEABLE_SPOTS.filter((s) => s.kind === k);
const LAND: MountKind[] = ["bike", "car", "unicorn"];

describe("rideable spots", () => {
  it("has the right mix, with unique ids", () => {
    expect(of("bike").length).toBeGreaterThanOrEqual(6);
    expect(of("bike").length).toBeLessThanOrEqual(8);
    expect(of("car").length).toBeGreaterThanOrEqual(3);
    expect(of("car").length).toBeLessThanOrEqual(4);
    expect(of("unicorn").length).toBeGreaterThanOrEqual(4);
    expect(of("unicorn").length).toBeLessThanOrEqual(6);
    expect(of("dragon").length).toBe(4);
    expect(of("manta").length).toBeGreaterThanOrEqual(4);
    expect(of("manta").length).toBeLessThanOrEqual(6);
    // sea friends come to you, they're never parked
    expect(of("whale").length + of("dolphin").length + of("pony").length).toBe(0);
    expect(new Set(RIDEABLE_SPOTS.map((s) => s.id)).size).toBe(RIDEABLE_SPOTS.length);
  });

  it("land rides stand on dry, open ground off the trails, clear of every door", () => {
    const zb = zoneBounds();
    for (const s of RIDEABLE_SPOTS.filter((q) => LAND.includes(q.kind))) {
      const where = `${s.id} @ ${s.x.toFixed(1)},${s.z.toFixed(1)}`;
      expect(groundY(s.x, s.z), where).toBeGreaterThan(WATER_Y + 0.5);
      expect(seaDepth(s.x, s.z), where).toBeLessThan(0);
      expect(Math.hypot(s.x, s.z), where).toBeLessThan(coastR(Math.atan2(s.x, s.z)) - 6);
      expect(s.y!, where).toBeCloseTo(groundY(s.x, s.z), 3);
      expect(trailInfo(s.x, s.z).d, where).toBeGreaterThan(TRAIL_WIDTH / 2 + 0.8);
      expect(nearStream(s.x, s.z, 0.5), where).toBe(false);
      expect(s.x > zb.minX - 1 && s.x < zb.maxX + 1 && s.z > zb.minZ - 1 && s.z < zb.maxZ + 1, where).toBe(false);
      for (const p of PLACES) {
        if (p.sky) continue;
        expect(Math.hypot(s.x - p.x, s.z - p.z), `${where} vs ${p.id}`).toBeGreaterThan(Math.max(p.radius, p.doorRadius) + 2);
      }
      expect(placeClearance(s.x, s.z), where).toBeGreaterThan(2);
      expect(Number.isFinite(s.yaw)).toBe(true);
    }
  });

  it("bikes and buggies are parked right beside a trail (easy to find)", () => {
    for (const s of [...of("bike"), ...of("car")]) expect(trailInfo(s.x, s.z).d, s.id).toBeLessThan(7.5);
  });

  it("parked rides don't overlap each other", () => {
    const ground = RIDEABLE_SPOTS.filter((s) => !s.sky && s.kind !== "manta");
    for (let i = 0; i < ground.length; i++)
      for (let j = i + 1; j < ground.length; j++) {
        const a = ground[i];
        const b = ground[j];
        expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id} / ${b.id}`).toBeGreaterThan(1.2);
      }
  });

  it("mantas wait under the water, above the reef", () => {
    for (const s of of("manta")) {
      expect(s.y!, s.id).toBeLessThan(WATER_Y - 1.5);
      expect(s.y!, s.id).toBeGreaterThan(seaFloorY(s.x, s.z) + 1.5);
      expect(seaDepth(s.x, s.z), s.id).toBeGreaterThan(4.5);
    }
  });

  it("dragons perch on hilltops, and one on a floating mountain's walkable top", () => {
    const hills = of("dragon").filter((s) => !s.sky);
    const sky = of("dragon").filter((s) => s.sky);
    expect(hills.length).toBe(3);
    expect(sky.length).toBe(1);
    for (const s of hills) {
      expect(s.y!, s.id).toBeGreaterThan(5);
      // the highest point round about
      for (let a = 0; a < 8; a++) expect(groundY(s.x + Math.sin(a) * 5, s.z + Math.cos(a) * 5), s.id).toBeLessThan(s.y! + 0.3);
    }
    const d = sky[0];
    const isl = skyIslandById(d.sky!)!;
    expect(isl).toBeTruthy();
    expect(skyWalkable(isl, d.x, d.z)).toBe(true);
    expect(d.y!).toBeCloseTo(skyBaseY(isl, d.x, d.z), 3);
    for (const p of SKY_PADS) expect(Math.hypot(d.x - p.x, d.z - p.z)).toBeGreaterThan(p.r + 2);
    expect(Math.hypot(d.x - isl.landing.x, d.z - isl.landing.z)).toBeGreaterThan(3.5);
  });

  it("keep-out covers every parked ride (for tree / prop placers)", () => {
    for (const s of RIDEABLE_SPOTS) if (!s.sky && s.kind !== "manta") expect(rideableKeepOut(s.x, s.z, 0), s.id).toBe(true);
    expect(rideableKeepOut(0, 0, 0)).toBe(false);
  });
});

describe("mount capabilities", () => {
  it("every kind knows where it can go", () => {
    for (const k of [...RIDEABLE_KINDS, "pony"] as MountKind[]) {
      const c = MOUNT_CAPS[k];
      expect(c, k).toBeTruthy();
      expect(c.speed).toBeGreaterThan(1);
      expect(c.label.length && c.emoji.length && c.verb.length).toBeTruthy();
    }
    expect(MOUNT_CAPS.bike.medium).toBe("land");
    expect(MOUNT_CAPS.car.medium).toBe("land");
    expect(MOUNT_CAPS.unicorn.medium).toBe("land");
    expect(MOUNT_CAPS.pony.medium).toBe("land");
    expect(MOUNT_CAPS.dragon.medium).toBe("air");
    expect(MOUNT_CAPS.manta.medium).toBe("under");
    expect(MOUNT_CAPS.whale.medium).toBe("sea");
    expect(MOUNT_CAPS.dolphin.medium).toBe("sea");
    expect(MOUNT_CAPS.car.speed).toBeGreaterThan(MOUNT_CAPS.bike.speed);
    expect(MOUNT_CAPS.dolphin.speed).toBeGreaterThan(MOUNT_CAPS.whale.speed);
  });

  it("bikes lean into turns (clamped), buggies barely", () => {
    expect(mountLean("bike", 1, 10)).toBeLessThan(0);
    expect(mountLean("bike", -1, 10)).toBeGreaterThan(0);
    expect(Math.abs(mountLean("bike", 50, 50))).toBeLessThanOrEqual(0.42);
    expect(Math.abs(mountLean("car", 1, 10))).toBeLessThan(Math.abs(mountLean("bike", 1, 10)));
    expect(mountLean("dragon", 1, 10)).toBe(0);
  });
});
