import { describe, expect, it } from "vitest";
import { SETTLEMENTS, inSettlement, settlementAt, settlementDeckY, SETTLEMENT_OBSTACLES } from "./settlements";
import { seaDist } from "./island";
import { nearRail, STATIONS } from "./railway";
import { wildRainforestK, wildWaterSdf } from "./wildWater";
import { groundY } from "./terrain";
import { footprintStats, naturalSlopeAt } from "./landform";
import { DOCKS } from "./harbours";

describe("settlements: the Wildlands' villages and towns", () => {
  it("Lakeside sits dry, inside the island, clear of the rail and the water, near its station", () => {
    const s = SETTLEMENTS.find((x) => x.id === "lakeside")!;
    expect(s).toBeTruthy();
    expect(seaDist(s.x, s.z)).toBeLessThan(-40);
    expect(nearRail(s.x, s.z, 8)).toBe(false);
    for (const h of s.huts) {
      expect(nearRail(h.x, h.z, 8), `hut at ${h.x},${h.z}`).toBe(false);
      expect(wildWaterSdf(h.x, h.z), `hut at ${h.x},${h.z} should be dry`).toBeGreaterThan(0);
    }
    const station = STATIONS.find((st) => st.id === s.stationId)!;
    expect(station).toBeTruthy();
    expect(Math.hypot(s.x - station.x, s.z - station.z)).toBeLessThanOrEqual(250);
  });

  it("Lakeside's own pier stays well clear of the candy Great Lake Jetty", () => {
    const s = SETTLEMENTS.find((x) => x.id === "lakeside")!;
    const jetty = DOCKS.find((d) => d.id === "great-lake")!;
    expect(jetty).toBeTruthy();
    expect(Math.hypot(s.pier!.bx - jetty.x, s.pier!.bz - jetty.z)).toBeGreaterThanOrEqual(25);
  });

  for (const s of SETTLEMENTS) {
    it(`${s.id}: huts don't overlap`, () => {
      for (let i = 0; i < s.huts.length; i++)
        for (let j = i + 1; j < s.huts.length; j++) {
          const a = s.huts[i];
          const b = s.huts[j];
          expect(Math.hypot(a.x - b.x, a.z - b.z), `huts ${i},${j}`).toBeGreaterThan((a.size + b.size) * 1.3);
        }
    });

    it(`${s.id}: the path graph connects every home and work spot (one walk graph, no island nodes)`, () => {
      const n = s.nodes.length;
      const adj: number[][] = Array.from({ length: n }, () => []);
      for (const [a, b] of s.edges) {
        adj[a].push(b);
        adj[b].push(a);
      }
      const seen = new Set<number>([0]);
      const stack = [0];
      while (stack.length) {
        const at = stack.pop()!;
        for (const nx of adj[at]) if (!seen.has(nx)) {
          seen.add(nx);
          stack.push(nx);
        }
      }
      expect(seen.size).toBe(n);
      // every home door and every work spot is a real node
      for (let i = 0; i < s.huts.length; i++) expect(s.nodes.some((nd) => nd.id === `home-${i}`), `home-${i}`).toBe(true);
      for (const w of s.work) expect(s.nodes.some((nd) => Math.hypot(nd.x - w.x, nd.z - w.z) < 0.6), `work ${w.id} needs a coincident node`).toBe(true);
    });

    it(`${s.id}: villagers' schedules cover the full 24 hours and every line is short and unique`, () => {
      for (const v of s.roster) {
        expect(v.schedule[0].from).toBe(0);
        expect(v.schedule.length).toBeGreaterThanOrEqual(4);
      }
      const seenFacts = new Set<string>();
      for (const t of s.talk)
        for (const line of t.lines) {
          expect(line.length, `${s.id}/${t.id}: ${line}`).toBeLessThanOrEqual(140);
          expect(seenFacts.has(line), `${s.id}/${t.id}: duplicate line "${line}"`).toBe(false);
          seenFacts.add(line);
        }
    });

    it(`${s.id}: activities are placed inside the village`, () => {
      for (const act of s.activities) expect(Math.hypot(act.x - s.x, act.z - s.z), act.id).toBeLessThan(s.radius + 10);
    });

    it(`${s.id}: sits somewhere the REAL, unlevelled ground is actually gentle the whole way out to its own radius (not just levelled to look that way) — no cliff runs through or above any part of the village`, () => {
      // see registry/settlements.ts's footprintOk, which every site search is required to pass over
      // its own full radius (not just a smaller "core") before a site is ever accepted
      const full = footprintStats(s.x, s.z, s.radius);
      expect(full.maxSlope, `${s.id} footprint slope`).toBeLessThanOrEqual(0.4);
      expect(full.relief, `${s.id} footprint relief`).toBeLessThanOrEqual(7);
    });

    it(`${s.id}: every ground-level (non-shore, non-elevated) hut's floor sits flush with the village's own pad — nothing floating or buried`, () => {
      const centerY = groundY(s.x, s.z);
      for (const h of s.huts) {
        if (h.shore || (h.elev ?? 0) > 0) continue; // shore huts and treehouses have their own floor
        expect(Math.abs(groundY(h.x, h.z) - centerY), `${s.id} hut at ${h.x},${h.z}`).toBeLessThan(0.5);
      }
    });
  }

  it("the fishing spot sits on the pier, out over water deep enough to fish in", () => {
    const s = SETTLEMENTS[0];
    const fishing = s.activities.find((a) => a.id === "fishing")!;
    expect(fishing).toBeTruthy();
    expect(s.pier).toBeTruthy();
    const p = s.pier!;
    // the fishing spot is at (or very near) the pier's far end
    expect(Math.hypot(fishing.x - p.bx, fishing.z - p.bz)).toBeLessThan(4);
    // and the pier's tip reaches out over real water
    expect(wildWaterSdf(p.bx, p.bz)).toBeLessThan(0);
    // the deck itself is walkable right along its length
    expect(settlementDeckY((p.ax + p.bx) / 2, (p.az + p.bz) / 2)).not.toBeNull();
    expect(settlementDeckY(p.bx, p.bz)).not.toBeNull();
  });

  it("settlementAt / inSettlement recognise the pad, and obstacles list every hut", () => {
    const s = SETTLEMENTS[0];
    expect(settlementAt(s.x, s.z)?.id).toBe(s.id);
    expect(inSettlement(s.x, s.z)).toBe(true);
    expect(settlementAt(s.x + s.radius + 400, s.z)).toBeNull();
    expect(SETTLEMENT_OBSTACLES.length).toBeGreaterThanOrEqual(s.huts.length);
  });

  it("terrain.ts levels the ground under the fire and every land hut to a gentle slope, never below the waterline", () => {
    const s = SETTLEMENTS[0];
    const spots = [{ x: s.x, z: s.z }, ...s.huts.filter((h) => !h.shore)];
    let maxSlope = 0;
    let minY = Infinity;
    for (const p of spots) {
      const y = groundY(p.x, p.z);
      minY = Math.min(minY, y);
      const e = 1;
      const slope = Math.hypot(groundY(p.x + e, p.z) - groundY(p.x - e, p.z), groundY(p.x, p.z + e) - groundY(p.x, p.z - e)) / (2 * e);
      maxSlope = Math.max(maxSlope, slope);
    }
    expect(maxSlope).toBeLessThan(0.35);
    expect(minY).toBeGreaterThan(-0.25 + 0.5);
  });

  it("levels the ground under the shore huts too, close to the waterline (a little more slope there is fine — they sit right on the natural bank, like a real beach)", () => {
    const s = SETTLEMENTS[0];
    for (const h of s.huts.filter((x) => x.shore)) {
      const y = groundY(h.x, h.z);
      expect(y, `shore hut at ${h.x},${h.z}`).toBeGreaterThan(-0.25 + 0.15);
      const e = 1;
      const slope = Math.hypot(groundY(h.x + e, h.z) - groundY(h.x - e, h.z), groundY(h.x, h.z + e) - groundY(h.x, h.z - e)) / (2 * e);
      expect(slope, `shore hut at ${h.x},${h.z}`).toBeLessThan(0.45);
    }
  });

  it("Treetop sits in the rainforest near the Great Falls, dry, clear of the rail and the river/pool, near falls-station", () => {
    const s = SETTLEMENTS.find((x) => x.id === "treetop")!;
    expect(s).toBeTruthy();
    expect(seaDist(s.x, s.z)).toBeLessThan(-40);
    expect(nearRail(s.x, s.z, 8)).toBe(false);
    expect(wildRainforestK(s.x, s.z)).toBeGreaterThan(0.6);
    expect(wildWaterSdf(s.x, s.z)).toBeGreaterThan(0);
    const station = STATIONS.find((st) => st.id === s.stationId)!;
    expect(station?.id).toBe("falls-station");
    const d = Math.hypot(s.x - station.x, s.z - station.z);
    expect(d).toBeGreaterThanOrEqual(60 - 5);
    expect(d).toBeLessThanOrEqual(220 + 5);
    for (const h of s.huts) expect(nearRail(h.x, h.z, 8), `treehouse at ${h.x},${h.z}`).toBe(false);
  });

  it("Treetop's treehouses sit up their own trunks, and the ramp/bridge/platforms are walkable from the ground", () => {
    const s = SETTLEMENTS.find((x) => x.id === "treetop")!;
    expect(s.huts.every((h) => (h.elev ?? 0) > 0)).toBe(true);
    expect(s.decks.length).toBeGreaterThanOrEqual(4);
    const ramp = s.decks.find((d) => d.kind === "line" && d.tag === "ramp");
    const bridge = s.decks.find((d) => d.kind === "line" && d.tag === "bridge");
    expect(ramp).toBeTruthy();
    expect(bridge).toBeTruthy();
    if (ramp && ramp.kind === "line") {
      expect(settlementDeckY(ramp.ax, ramp.az)).not.toBeNull(); // a ground-level start the kid walks onto
      expect(settlementDeckY(ramp.bx, ramp.bz)).not.toBeNull(); // the platform end
    }
  });

  it("Highstone sits on a gentle shelf below the snow line near the Lone Peak, dry, clear of the rail, near peak-station", () => {
    const s = SETTLEMENTS.find((x) => x.id === "highstone")!;
    expect(s).toBeTruthy();
    expect(seaDist(s.x, s.z)).toBeLessThan(-40);
    expect(nearRail(s.x, s.z, 8)).toBe(false);
    const station = STATIONS.find((st) => st.id === s.stationId)!;
    expect(station?.id).toBe("peak-station");
    const d = Math.hypot(s.x - station.x, s.z - station.z);
    expect(d).toBeGreaterThanOrEqual(40 - 5);
    expect(d).toBeLessThanOrEqual(200 + 5);
  });

  it("Highstone's yaks and goats stay inside their fenced pasture, on flat ground (checked on the REAL terrain, and on the levelled one), and are counted as obstacles", () => {
    const s = SETTLEMENTS.find((x) => x.id === "highstone")!;
    expect(s.fauna.length).toBeGreaterThanOrEqual(5);
    const fence = s.props.filter((p) => p.kind === "fencepost");
    expect(fence.length).toBeGreaterThan(0);
    const cx = fence.reduce((sum, p) => sum + p.x, 0) / fence.length;
    const cz = fence.reduce((sum, p) => sum + p.z, 0) / fence.length;
    const r = Math.max(...fence.map((p) => Math.hypot(p.x - cx, p.z - cz))) + 1;
    expect(s.levelPatches.length).toBeGreaterThan(0); // the pasture is levelled flush with the pad
    const centerY = groundY(s.x, s.z);
    for (const f of s.fauna) {
      expect(Math.hypot(f.x - cx, f.z - cz), f.id).toBeLessThanOrEqual(r);
      expect(naturalSlopeAt(f.x, f.z), `${f.id} natural slope`).toBeLessThan(0.4);
      expect(Math.abs(groundY(f.x, f.z) - centerY), `${f.id} levelled floor vs pad`).toBeLessThan(0.5);
    }
    for (const f of s.fauna) expect(SETTLEMENT_OBSTACLES.some((o) => Math.abs(o.x - f.x) < 0.01 && Math.abs(o.z - f.z) < 0.01)).toBe(true);
  });

  it("every settlement's site stays well clear of every other's (the draw-call budget never doubles up — see world/settlements/index.ts's BUILD_R)", () => {
    for (let i = 0; i < SETTLEMENTS.length; i++)
      for (let j = i + 1; j < SETTLEMENTS.length; j++) {
        const a = SETTLEMENTS[i];
        const b = SETTLEMENTS[j];
        expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id} / ${b.id}`).toBeGreaterThan(560);
      }
  });
});
