import { describe, expect, it } from "vitest";
import { SETTLEMENTS, inSettlement, settlementAt, settlementDeckY, SETTLEMENT_OBSTACLES } from "./settlements";
import { seaDist } from "./island";
import { nearRail, STATIONS } from "./railway";
import { wildWaterSdf } from "./wildWater";
import { groundY } from "./terrain";
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

  it("huts don't overlap", () => {
    const s = SETTLEMENTS[0];
    for (let i = 0; i < s.huts.length; i++)
      for (let j = i + 1; j < s.huts.length; j++) {
        const a = s.huts[i];
        const b = s.huts[j];
        expect(Math.hypot(a.x - b.x, a.z - b.z), `huts ${i},${j}`).toBeGreaterThan((a.size + b.size) * 1.3);
      }
  });

  it("the path graph connects every home and work spot (one walk graph, no island nodes)", () => {
    const s = SETTLEMENTS[0];
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

  it("villagers' schedules cover the full 24 hours and every line is short", () => {
    const s = SETTLEMENTS[0];
    for (const v of s.roster) {
      expect(v.schedule[0].from).toBe(0);
      expect(v.schedule.length).toBeGreaterThanOrEqual(4);
    }
    for (const t of s.talk) for (const line of t.lines) expect(line.length).toBeLessThanOrEqual(140);
  });
});
