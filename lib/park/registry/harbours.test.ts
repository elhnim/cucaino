import { describe, expect, it } from "vitest";
import { DOCKS, HARBOUR_DECKS, HARBOUR_INFO, MOORINGS, RIFT_DOCK, harbourDeckY, harbourKeepOut, mooredY, worldFloorY, worldSeaDepth } from "./harbours";
import { MOUNT_BODY, isBoat, isSub, type BoatKind, type SubKind } from "../characters/mounts";
import { boatClearance, subAltRange } from "../world/rideables/craft";
import { WATER_Y } from "./terrain";
import { TRAIL_POINTS, coastR } from "./island";
import { PLACES } from "./places";
import { FROST_SWIMS, FROST_FLOES, FROST_OBSTACLES } from "./frostIsland";
import { VILLAGE_OBSTACLES } from "./villageIsland";
import { DINO_OBSTACLES } from "./dinoIsland";
import { FOOTPRINTS } from "../world/underwater/plan";
import { seaFloorY } from "../world/sea/wander";

const of = (dock: string) => MOORINGS.filter((m) => m.dock === dock);

describe("harbours", () => {
  it("has five docks with the right boats at each", () => {
    expect(DOCKS.map((d) => d.id).sort()).toEqual(["candy-harbour", "coralcove", "dino", "frost-dock", "rift-dock"]);
    const kinds = (dock: string) => of(dock).map((m) => m.kind).sort();
    expect(kinds("candy-harbour")).toEqual(["pedalo", "pedalo", "sailboat", "ship", "speedboat", "sub"]);
    expect(kinds("coralcove")).toEqual(["pedalo", "sailboat"]);
    expect(kinds("dino")).toEqual(["sailboat", "speedboat"]);
    expect(kinds("frost-dock")).toEqual(["speedboat", "sub"]);
    expect(kinds("rift-dock")).toEqual(["deepsub", "speedboat"]);
    expect(new Set(MOORINGS.map((m) => m.id)).size).toBe(MOORINGS.length);
  });

  it("every boat floats free where it's moored (water under the whole hull)", () => {
    for (const m of MOORINGS) {
      if (isBoat(m.kind)) expect(boatClearance(m.kind as BoatKind, m.x, m.z, m.yaw, worldSeaDepth), m.id).toBeGreaterThanOrEqual(0);
      else {
        const r = subAltRange(m.kind as SubKind, worldFloorY(m.x, m.z), { lo: 0, hi: 0 });
        expect(r.lo, m.id).toBeLessThan(r.hi - 1);
        expect(mooredY(m.kind) - WATER_Y).toBeCloseTo(r.hi, 5);
      }
    }
  });

  it("boats are moored right by a deck (step off the jetty, hop on) and nose-in to it", () => {
    for (const m of MOORINGS) {
      const [hl, hw, off] = MOUNT_BODY[m.kind];
      // the nearest deck point to the hull's capsule
      let best = Infinity;
      const fx = Math.sin(m.yaw);
      const fz = Math.cos(m.yaw);
      for (let a = -1; a <= 1; a += 0.05) {
        const cx = m.x + fx * (off + a * hl);
        const cz = m.z + fz * (off + a * hl);
        for (let r = 0; r <= hw + 4; r += 0.25)
          for (let k = 0; k < 16; k++) {
            const px = cx + Math.sin((k / 16) * Math.PI * 2) * r;
            const pz = cz + Math.cos((k / 16) * Math.PI * 2) * r;
            const deck = harbourDeckY(px, pz) ?? worldFloorY(px, pz);
            if (deck > WATER_Y + 0.5) best = Math.min(best, Math.max(0, r - hw));
          }
      }
      expect(best, m.id).toBeLessThan(2.2);
    }
  });

  it("moored craft don't overlap each other", () => {
    for (let i = 0; i < MOORINGS.length; i++)
      for (let j = i + 1; j < MOORINGS.length; j++) {
        const a = MOORINGS[i];
        const b = MOORINGS[j];
        // sample a along its length against b's capsule
        let min = Infinity;
        for (let u = -1; u <= 1; u += 0.1)
          for (let v = -1; v <= 1; v += 0.1) {
            const ax = a.x + Math.sin(a.yaw) * (MOUNT_BODY[a.kind][2] + u * MOUNT_BODY[a.kind][0]);
            const az = a.z + Math.cos(a.yaw) * (MOUNT_BODY[a.kind][2] + u * MOUNT_BODY[a.kind][0]);
            const bx = b.x + Math.sin(b.yaw) * (MOUNT_BODY[b.kind][2] + v * MOUNT_BODY[b.kind][0]);
            const bz = b.z + Math.cos(b.yaw) * (MOUNT_BODY[b.kind][2] + v * MOUNT_BODY[b.kind][0]);
            min = Math.min(min, Math.hypot(ax - bx, az - bz) - MOUNT_BODY[a.kind][1] - MOUNT_BODY[b.kind][1]);
          }
        expect(min, `${a.id} / ${b.id}`).toBeGreaterThan(0.3);
      }
  });

  it("Candy Harbour's jetty starts on the sand and runs out past the beach (no buildings, no trails)", () => {
    const j = HARBOUR_INFO.main;
    expect(worldFloorY(j.base.x, j.base.z)).toBeGreaterThan(WATER_Y);
    expect(Math.hypot(j.base.x, j.base.z)).toBeGreaterThan(coastR(Math.atan2(j.base.x, j.base.z)) - 2);
    expect(worldSeaDepth(j.head.x + j.dir.x * 4, j.head.z + j.dir.z * 4)).toBeGreaterThan(3.5);
    for (const d of HARBOUR_DECKS.filter((q) => q.dock === "candy-harbour")) {
      for (const p of PLACES) if (!p.sky) expect(Math.hypot(d.ax - p.x, d.az - p.z), p.id).toBeGreaterThan(p.radius + 10);
      for (const t of TRAIL_POINTS) for (const q of t) expect(Math.hypot(q[0] - d.ax, q[1] - d.az)).toBeGreaterThan(20);
    }
    // the reef wreck stays clear
    for (const f of FOOTPRINTS) for (const m of of("candy-harbour")) expect(Math.hypot(f.x - m.x, f.z - m.z), m.id).toBeGreaterThan(f.r + 14);
  });

  it("the decks are walkable: a kid can walk from the beach to the end of each new jetty", () => {
    for (const j of [HARBOUR_INFO.main, HARBOUR_INFO.frost]) {
      let prev = worldFloorY(j.base.x, j.base.z);
      for (let u = 0; u <= 1.001; u += 0.02) {
        const x = j.base.x + (j.end.x - j.base.x) * u;
        const z = j.base.z + (j.end.z - j.base.z) * u;
        const y = worldFloorY(x, z);
        expect(y).toBeGreaterThan(WATER_Y + (u < 0.15 ? 0.1 : 0.4));
        expect(Math.abs(y - prev)).toBeLessThan(0.45); // no steps you'd trip on
        prev = y;
      }
      expect(harbourDeckY(j.head.x, j.head.z)).toBeCloseTo(j.deckY, 3);
    }
    expect(harbourDeckY(RIFT_DOCK.x, RIFT_DOCK.z)).toBeCloseTo(RIFT_DOCK.y, 5);
    expect(harbourDeckY(0, 0)).toBeNull();
  });

  it("the Frostpeak dock keeps clear of the penguins, the floes and the island's things", () => {
    const fr = of("frost-dock");
    for (const d of HARBOUR_DECKS.filter((q) => q.dock === "frost-dock"))
      for (const o of FROST_OBSTACLES) expect(Math.hypot(o.x - d.ax, o.z - d.az) - o.r).toBeGreaterThan(1.5);
    for (const m of fr) {
      for (const route of FROST_SWIMS) for (const p of route) expect(Math.hypot(p.x - m.x, p.z - m.z), m.id).toBeGreaterThan(8);
      for (const f of FROST_FLOES) expect(Math.hypot(f.x - m.x, f.z - m.z), m.id).toBeGreaterThan(f.r + 5);
    }
  });

  it("the island jetties' boats keep clear of the villages' and Dino Isle's things", () => {
    for (const m of [...of("coralcove"), ...of("dino")])
      for (const o of [...VILLAGE_OBSTACLES, ...DINO_OBSTACLES]) expect(Math.hypot(o.x - m.x, o.z - m.z) - o.r, m.id).toBeGreaterThan(MOUNT_BODY[m.kind][1]);
  });

  it("the Rift Dock floats on the lip, and the Deep Explorer waits over the deep", () => {
    const d = MOORINGS.find((m) => m.id === "deepsub-rift")!;
    expect(seaFloorY(RIFT_DOCK.x, RIFT_DOCK.z)).toBeLessThan(WATER_Y - 6);
    expect(seaFloorY(RIFT_DOCK.rift.x, RIFT_DOCK.rift.z)).toBeLessThan(-95);
    // straight down from the Deep Explorer, the rift drops away
    expect(seaFloorY(d.x, d.z)).toBeLessThan(seaFloorY(RIFT_DOCK.x, RIFT_DOCK.z) - 2);
    const r = subAltRange("deepsub", seaFloorY(RIFT_DOCK.rift.x, RIFT_DOCK.rift.z), { lo: 0, hi: 0 });
    expect(r.lo).toBeLessThan(-90);
  });

  it("keep-out covers the decks and the moorings (for beach / prop placers)", () => {
    for (const d of HARBOUR_DECKS) expect(harbourKeepOut(d.ax, d.az, 0), d.id).toBe(true);
    for (const m of MOORINGS) expect(harbourKeepOut(m.x, m.z, 0), m.id).toBe(true);
    expect(harbourKeepOut(0, 0, 0)).toBe(false);
  });

  it("prints the layout", () => {
    for (const d of DOCKS) console.log(d.id, d.x.toFixed(1), d.z.toFixed(1));
    for (const m of MOORINGS) console.log(" ", m.id, m.x.toFixed(1), m.z.toFixed(1), m.yaw.toFixed(2), "depth", worldSeaDepth(m.x, m.z).toFixed(1));
    expect(isSub("sub")).toBe(true);
  });
});
