import { describe, expect, it } from "vitest";
import { STATIONS, nearRail } from "./railway";
import { DRAGON_BREED_IDS } from "../characters/mounts";
import { DRAGON_PAD, DRAGON_ROOST, RIDEABLE_SPOTS, ROOST_NEAR, placeClearance, rideableKeepOut, strollable, trailInfo } from "./rideables";
import { MOUNT_CAPS, RIDEABLE_KINDS, mountLean, type MountKind } from "../characters/mounts";
import { PLACES, SPAWN } from "./places";
import { TRAIL_POINTS, TRAIL_WIDTH, coastR, nearStream } from "./island";
import { WATER_Y, groundY, slopeAt } from "./terrain";
import { SKY_PADS, skyBaseY, skyIslandById, skyWalkable } from "./skyIslands";
import { seaDepth, seaFloorY } from "../world/sea/wander";
import { zoneBounds } from "../builder/rules";
import { DINO_OBSTACLES, DINO_PLAZA, DINO_TRAIL_HALF, dinoGroundY, dinoTrailDistance } from "./dinoIsland";
import { CAR_PARKS } from "./roads";

/** Dino Isle's safari jeeps (cars parked out on Dino Isle, not the main island: tested on their own below) */
const isDinoJeep = (s: { id: string }) => s.id.startsWith("jeep-dino");
/** the island's road network's own jeeps (Agent R, registry/roads.ts CAR_PARKS) — one car park per
 *  Wildlands station, settlement, land-bound wonder and the kart track; tested on their own below */
const isWildJeep = (s: { id: string }) => s.id.startsWith("jeep-cp-") || (s.id.startsWith("dragon-wild-") && s.id.includes("-station"));
const of = (k: MountKind) => RIDEABLE_SPOTS.filter((s) => s.kind === k && !isDinoJeep(s) && !isWildJeep(s));
const LAND: MountKind[] = ["bike", "car", "unicorn"];

describe("rideable spots", () => {
  it("has the right mix, with unique ids", () => {
    expect(of("bike").length).toBeGreaterThanOrEqual(6);
    expect(of("bike").length).toBeLessThanOrEqual(8);
    // (no buggies inside the park: cars wait in the car parks out on the island's roads)
    for (const s of RIDEABLE_SPOTS) if (s.kind === "car") expect(Math.hypot(s.x, s.z), s.id).toBeGreaterThan(150);
    expect(of("unicorn").length).toBeGreaterThanOrEqual(4);
    expect(of("unicorn").length).toBeLessThanOrEqual(6);
    expect(of("dragon").length).toBe(5);
    expect(of("manta").length).toBeGreaterThanOrEqual(4);
    expect(of("manta").length).toBeLessThanOrEqual(6);
    // sea friends come to you, they're never parked
    expect(of("whale").length + of("dolphin").length + of("pony").length).toBe(0);
    expect(new Set(RIDEABLE_SPOTS.map((s) => s.id)).size).toBe(RIDEABLE_SPOTS.length);
  });

  it("land rides stand on dry, open ground off the trails, clear of every door", () => {
    const zb = zoneBounds();
    for (const s of RIDEABLE_SPOTS.filter((q) => LAND.includes(q.kind) && !isDinoJeep(q) && !isWildJeep(q))) {
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

  it("jeeps wait in every road car park (one per Wildlands station, settlement, wonder and the kart track), on dry ground right there", () => {
    expect(CAR_PARKS.length).toBeGreaterThanOrEqual(10);
    for (const cp of CAR_PARKS) {
      const js = RIDEABLE_SPOTS.filter((q) => isWildJeep(q) && q.id.startsWith(`jeep-${cp.id}-`));
      expect(js.length, cp.id).toBe(cp.jeeps);
      for (const j of js) {
        expect(j.kind, j.id).toBe("car");
        expect(Math.hypot(j.x - cp.x, j.z - cp.z), j.id).toBeLessThan(cp.r + 2);
        expect(groundY(j.x, j.z), j.id).toBeGreaterThan(WATER_Y + 0.5);
        expect(Number.isFinite(j.yaw), j.id).toBe(true);
      }
    }
    // the 4 Wildlands stations each get their own car park — round 3: no longer right at the
    // platform (a roundabout now sits at the road hub there; the car park moved beside the road,
    // clear of the ring — registry/roads.ts's CAR_PARKS own comment), so this is "this station's
    // own car park, within a short walk" rather than "at the platform" literally
    for (const st of STATIONS.slice(1)) {
      const cp = CAR_PARKS.find((c) => Math.hypot(c.x - st.x, c.z - st.z) < 60);
      expect(cp, st.id).toBeTruthy();
    }
  });

  it("a dragon waits at every station (so a kid getting off the train can fly), on open, level ground off the track", () => {
    expect(STATIONS.length).toBe(5);
    for (const sid of STATIONS.map((s) => s.id)) {
      const d = RIDEABLE_SPOTS.find((q) => q.id === `dragon-wild-${sid}`)!;
      expect(d, sid).toBeTruthy();
      expect(d.kind).toBe("dragon");
      expect(d.breed).toBeTruthy();
      const st = STATIONS.find((s) => s.id === sid)!;
      expect(Math.hypot(d.x - st.x, d.z - st.z)).toBeLessThan(45);
      expect(nearRail(d.x, d.z, 4)).toBe(false);
      expect(groundY(d.x, d.z)).toBeGreaterThan(WATER_Y + 0.5);
    }
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

  it("dragons stand where kids walk: open, gentle ground a short stroll off a trail (never a cliff top)", () => {
    const land = of("dragon").filter((s) => !s.sky && !s.lounge);
    expect(land.length).toBe(4);
    const zb = zoneBounds();
    for (const s of land) {
      const where = `${s.id} @ ${s.x.toFixed(1)},${s.z.toFixed(1)}`;
      expect(s.y!, where).toBeCloseTo(groundY(s.x, s.z), 0);
      expect(groundY(s.x, s.z), where).toBeGreaterThan(WATER_Y + 0.25);
      // level under its whole body
      expect(slopeAt(s.x, s.z), where).toBeLessThan(0.25);
      for (let a = 0; a < 8; a++) {
        const x = s.x + Math.sin(a) * DRAGON_PAD;
        const z = s.z + Math.cos(a) * DRAGON_PAD;
        expect(Math.abs(groundY(x, z) - groundY(s.x, s.z)), where).toBeLessThan(1.4);
      }
      // clear of every building and door, the Dream Park grid, off the trail itself
      expect(placeClearance(s.x, s.z), where).toBeGreaterThan(DRAGON_PAD + 2);
      expect(s.x > zb.minX - DRAGON_PAD && s.x < zb.maxX + DRAGON_PAD && s.z > zb.minZ - DRAGON_PAD && s.z < zb.maxZ + DRAGON_PAD, where).toBe(false);
      expect(trailInfo(s.x, s.z).d, where).toBeGreaterThan(DRAGON_PAD * 0.6 + 2);
      // the harbour dragon is on the beach by the jetty; the rest a few steps off a trail
      if (s.id !== "dragon-harbour") {
        expect(trailInfo(s.x, s.z).d, where).toBeLessThan(22);
        expect(strollable(s.x, s.z), where).toBe(true);
      }
      // not perched up a crag: no higher than a gentle hill above the trail beside it
      if (s.id !== "dragon-harbour") {
        let bp = TRAIL_POINTS[0][0];
        for (const pts of TRAIL_POINTS) for (const q of pts) if (Math.hypot(q[0] - s.x, q[1] - s.z) < Math.hypot(bp[0] - s.x, bp[1] - s.z)) bp = q;
        expect(Math.abs(groundY(s.x, s.z) - groundY(bp[0], bp[1])), where).toBeLessThan(4);
      }
      expect(Number.isFinite(s.yaw), where).toBe(true);
    }
    // spread round the island (one never far away)
    for (let i = 0; i < land.length; i++) for (let j = i + 1; j < land.length; j++) expect(Math.hypot(land[i].x - land[j].x, land[i].z - land[j].z), `${land[i].id}/${land[j].id}`).toBeGreaterThan(55);
  });

  it("every dragon is one of the breeds, and all five breeds live round the park", () => {
    const ds = of("dragon");
    for (const d of ds) expect(DRAGON_BREED_IDS, d.id).toContain(d.breed);
    expect(new Set(ds.map((d) => d.breed)).size).toBe(DRAGON_BREED_IDS.length);
    expect(ds.find((d) => d.id === "dragon-roost")!.breed).toBe("roostwarden");
    // the land dragons out on their own are all different breeds
    const alone = ds.filter((d) => !d.lounge && d.id !== "dragon-roost");
    expect(new Set(alone.map((d) => d.breed)).size).toBe(alone.length);
  });

  it("the dragons live apart, spread round the island (only the Roostwarden at the Roost)", () => {
    const ds = RIDEABLE_SPOTS.filter((s) => s.kind === "dragon" && !s.sky);
    expect(ds.filter((s) => Math.hypot(s.x - DRAGON_ROOST.x, s.z - DRAGON_ROOST.z) < DRAGON_ROOST.r + 20).map((s) => s.id)).toEqual(["dragon-roost"]);
    for (let i = 0; i < ds.length; i++)
      for (let j = i + 1; j < ds.length; j++) expect(Math.hypot(ds[i].x - ds[j].x, ds[i].z - ds[j].z), `${ds[i].id} / ${ds[j].id}`).toBeGreaterThan(40);
  });

  it("the Dragon Roost is a few steps from where kids start, with its sign by the trail", () => {
    const r = of("dragon").find((s) => s.id === "dragon-roost")!;
    expect(r).toBeTruthy();
    expect(Math.hypot(r.x - ROOST_NEAR.x, r.z - ROOST_NEAR.z)).toBeLessThan(30);
    expect(Math.hypot(r.x - SPAWN.x, r.z - SPAWN.z)).toBeLessThan(45);
    expect(DRAGON_ROOST.x).toBeCloseTo(r.x, 5);
    expect(DRAGON_ROOST.z).toBeCloseTo(r.z, 5);
    const sg = DRAGON_ROOST.sign;
    expect(trailInfo(sg.x, sg.z).d).toBeLessThan(TRAIL_WIDTH / 2 + 2.5);
    expect(trailInfo(sg.x, sg.z).d).toBeGreaterThan(TRAIL_WIDTH / 2);
    expect(Math.hypot(sg.x - r.x, sg.z - r.z)).toBeGreaterThan(DRAGON_PAD);
    expect(sg.y).toBeCloseTo(groundY(sg.x, sg.z), 3);
  });

  it("the harbour dragon waits on the sand by Candy Harbour, a short walk up from the jetty", () => {
    const h = of("dragon").find((s) => s.id === "dragon-harbour")!;
    expect(h).toBeTruthy();
    const r = Math.hypot(h.x, h.z);
    expect(r).toBeGreaterThan(coastR(Math.atan2(h.x, h.z)) - 40);
    expect(Math.abs(Math.atan2(h.x, h.z) - -0.3)).toBeLessThan(0.2);
    expect(rideableKeepOut(h.x, h.z, 0)).toBe(true);
  });

  it("one dragon stands on a floating mountain's walkable top", () => {
    const sky = of("dragon").filter((s) => s.sky);
    expect(sky.length).toBe(1);
    const d = sky[0];
    const isl = skyIslandById(d.sky!)!;
    expect(isl).toBeTruthy();
    expect(skyWalkable(isl, d.x, d.z)).toBe(true);
    expect(d.y!).toBeCloseTo(skyBaseY(isl, d.x, d.z), 3);
    for (const p of SKY_PADS) expect(Math.hypot(d.x - p.x, d.z - p.z)).toBeGreaterThan(p.r + 2);
    expect(Math.hypot(d.x - isl.landing.x, d.z - isl.landing.z)).toBeGreaterThan(3.5);
  });

  it("Dino Isle's two safari jeeps wait by the safari trail at its plaza, on the island's own ground", () => {
    const jeeps = RIDEABLE_SPOTS.filter(isDinoJeep);
    expect(jeeps.length).toBe(2);
    for (const j of jeeps) {
      expect(j.kind).toBe("car");
      const g = dinoGroundY(j.x, j.z);
      expect(g, j.id).not.toBeNull();
      expect(j.y!, j.id).toBeCloseTo(g!, 3);
      expect(g!, j.id).toBeGreaterThan(WATER_Y + 1);
      const d = dinoTrailDistance(j.x, j.z);
      expect(d, j.id).toBeGreaterThan(DINO_TRAIL_HALF + 1);
      expect(d, j.id).toBeLessThan(DINO_TRAIL_HALF + 6);
      expect(Math.hypot(j.x - DINO_PLAZA.x, j.z - DINO_PLAZA.z), j.id).toBeLessThan(30);
      for (const o of DINO_OBSTACLES) expect(Math.hypot(o.x - j.x, o.z - j.z), j.id).toBeGreaterThan(o.r + 2.5);
      expect(Number.isFinite(j.yaw)).toBe(true);
    }
  });

  it("keep-out covers every parked ride (for tree / prop placers)", () => {
    for (const s of RIDEABLE_SPOTS) if (!s.sky && s.kind !== "manta" && !isDinoJeep(s)) expect(rideableKeepOut(s.x, s.z, 0), s.id).toBe(true);
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
