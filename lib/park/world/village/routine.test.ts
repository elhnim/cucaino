import { describe, expect, it } from "vitest";
import { LIGHT_FROM, LIGHT_TO, Phase, buildRoster, buildRoutes, makeSim, slotAt, stepVillage, type TalkOut, type VillageSim } from "./routine";
import { VILLAGE_FIRE, VILLAGE_HOMES, VILLAGE_LANTERNS, VILLAGE_MARKET, VILLAGE_PATHS, VILLAGE_WORK, VILLAGERS_TALK, villageGroundY } from "../../registry/villageIsland";

const DAY = 900; // real seconds per park day (atmosphere.PARK_DAY_SECONDS)
const DT = 1 / 20;
const hourAt = (t: number, h0: number) => (h0 + (t / DAY) * 24) % 24;

/** run the village from hour h0 for `secs` real seconds, calling `each` every step */
function run(sim: VillageSim, h0: number, secs: number, each?: (t: number, hour: number) => void, kid: { x: number; z: number } | null = null, t0 = 0) {
  const talk: TalkOut = { id: "", name: "", line: "" };
  let t = t0;
  for (let k = 0; k < secs / DT; k++) {
    t += DT;
    const hour = hourAt(t - t0, h0);
    stepVillage(sim, DT, t, hour, kid, talk);
    each?.(t, hour);
  }
  return t;
}
const visible = (sim: VillageSim) => sim.villagers.filter((v) => v.phase !== Phase.Hidden);

describe("the Tidewing Folk's day", () => {
  it("has a clan of 25–40 with the named villagers you can talk to", () => {
    const roster = buildRoster();
    expect(roster.length).toBeGreaterThanOrEqual(25);
    expect(roster.length).toBeLessThanOrEqual(40);
    expect(new Set(roster.map((v) => v.id)).size).toBe(roster.length);
    for (const t of VILLAGERS_TALK) expect(roster.some((v) => v.talk === t.id), t.id).toBe(true);
    expect(roster.filter((v) => v.kid).length).toBeGreaterThanOrEqual(5);
    const workIds = new Set(VILLAGE_WORK.map((w) => w.id));
    for (const v of roster) {
      expect(v.home).toBeGreaterThanOrEqual(0);
      expect(v.home).toBeLessThan(VILLAGE_HOMES.length);
      expect(v.schedule[0].from).toBe(0);
      for (let i = 1; i < v.schedule.length; i++) expect(v.schedule[i].from, v.id).toBeGreaterThan(v.schedule[i - 1].from);
      for (const s of v.schedule) if (s.spot) expect(workIds.has(s.spot), `${v.id} ${s.spot}`).toBe(true);
    }
  });

  it("is deterministic", () => {
    const a = buildRoster();
    const b = buildRoster();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const sa = makeSim();
    const sb = makeSim();
    run(sa, 9, 40);
    run(sb, 9, 40);
    expect(sa.villagers.map((v) => [v.x.toFixed(4), v.z.toFixed(4)])).toEqual(sb.villagers.map((v) => [v.x.toFixed(4), v.z.toFixed(4)]));
  });

  it("slotAt picks the running slot, wrapping round midnight", () => {
    const s = [
      { from: 0, act: "home" as const },
      { from: 7, act: "sell" as const },
      { from: 18, act: "dance" as const },
    ];
    expect(slotAt(s, 3)).toBe(0);
    expect(slotAt(s, 7)).toBe(1);
    expect(slotAt(s, 17.9)).toBe(1);
    expect(slotAt(s, 23)).toBe(2);
  });

  it("routes connect every pair of path nodes, one hop at a time", () => {
    const r = buildRoutes();
    const n = VILLAGE_PATHS.nodes.length;
    for (let a = 0; a < n; a++)
      for (let b = 0; b < n; b++) {
        let at = a;
        let hops = 0;
        while (at !== b && hops < n) {
          const nx = r.next[at * n + b];
          expect(nx).toBeGreaterThanOrEqual(0);
          // (each hop is a real edge)
          expect(VILLAGE_PATHS.edges.some(([p, q]) => (p === at && q === nx) || (q === at && p === nx))).toBe(true);
          at = nx;
          hops++;
        }
        expect(at).toBe(b);
      }
  });

  it("walks a whole day without leaving the island's walkable ground", () => {
    const sim = makeSim();
    let bad = 0;
    run(sim, 5, DAY, () => {
      for (const v of sim.villagers) {
        if (!Number.isFinite(v.x + v.z + v.y + v.yaw)) bad++;
        if (v.phase !== Phase.Hidden && villageGroundY(v.x, v.z) === null) bad++;
      }
    });
    expect(bad).toBe(0);
  });

  it("the market is busy at midday, everyone dances round the fire at twilight, and sleeps at night", () => {
    const sim = makeSim();
    let market = 0;
    let dancers = 0;
    let night = 0;
    run(sim, 5, DAY, (_t, hour) => {
      if (Math.abs(hour - 11.5) < 0.01) market = visible(sim).filter((v) => Math.hypot(v.x - VILLAGE_MARKET.x, v.z - VILLAGE_MARKET.z) < VILLAGE_MARKET.r + 3).length;
      if (Math.abs(hour - 20) < 0.01) dancers = sim.villagers.filter((v) => v.act === "dance" && v.phase === Phase.Act && Math.abs(Math.hypot(v.x - VILLAGE_FIRE.x, v.z - VILLAGE_FIRE.z) - VILLAGE_FIRE.danceR) < 1.2).length;
      if (Math.abs(hour - 2.5) < 0.01) night = visible(sim).length;
    });
    expect(market).toBeGreaterThanOrEqual(6);
    expect(dancers).toBeGreaterThanOrEqual(12);
    expect(night).toBeLessThanOrEqual(4);
  });

  it("different jobs happen at their places: fishing on the jetty, baking at the oven, chase and skipping", () => {
    const sim = makeSim();
    const seen = new Set<string>();
    run(sim, 5, DAY * 0.6, () => {
      for (const v of sim.villagers) if (v.phase === Phase.Act) seen.add(v.pose.anim);
    });
    for (const a of ["fish", "bake", "sell", "sweep", "garden", "wash", "run", "jump", "turn", "flute", "look"]) expect(seen.has(a as never), a).toBe(true);
  });

  it("the lantern-lighter lights the lanterns in order at dusk; they're out by day", () => {
    const sim = makeSim();
    let noonLit = -1;
    let order = true;
    let prev = 0;
    let allLitBy = -1;
    run(sim, 11, DAY * 0.5, (_t, hour) => {
      const lit = sim.lit.reduce((a, b) => a + b, 0);
      if (Math.abs(hour - 12) < 0.01) noonLit = lit;
      if (hour > LIGHT_FROM && hour < LIGHT_TO) {
        // lanterns only ever come on in the lighter's order
        for (let i = 1; i < sim.lit.length; i++) if (sim.lit[i] && !sim.lit[i - 1]) order = false;
        if (lit < prev) order = false;
        prev = lit;
      }
      if (allLitBy < 0 && lit === VILLAGE_LANTERNS.length) allLitBy = hour;
    });
    expect(noonLit).toBe(0);
    expect(order).toBe(true);
    expect(allLitBy).toBeGreaterThan(LIGHT_FROM);
    expect(allLitBy).toBeLessThanOrEqual(LIGHT_TO + 0.05);
    // the lighter gets through most of the round on foot before the rest pop on at the end
    expect(prev).toBeGreaterThanOrEqual(VILLAGE_LANTERNS.length * 0.6);
  });

  it("arriving at night: villagers are already where they should be and the lanterns are lit", () => {
    const sim = makeSim();
    const talk: TalkOut = { id: "", name: "", line: "" };
    stepVillage(sim, DT, 1000, 20.5, null, talk);
    expect(sim.lit.every((l) => l === 1)).toBe(true);
    const dancing = sim.villagers.filter((v) => v.act === "dance" && v.phase === Phase.Act);
    expect(dancing.length).toBeGreaterThanOrEqual(12);
    for (const v of dancing) expect(Math.abs(Math.hypot(v.x - VILLAGE_FIRE.x, v.z - VILLAGE_FIRE.z) - VILLAGE_FIRE.danceR)).toBeLessThan(0.6);
  });

  it("villagers wave when the Park kid comes near, and the chatty ones talk (rotating their lines)", () => {
    const sim = makeSim();
    const talk: TalkOut = { id: "", name: "", line: "" };
    // settle at mid-morning
    let t = run(sim, 9, 20);
    const bun = sim.villagers.find((v) => v.def.id === "bun")!;
    // stand right next to Auntie Bun
    const kid = { x: bun.x + 1.2, z: bun.z + 0.8 };
    const lines = new Set<string>();
    let who = -1;
    let waved = 0;
    for (let k = 0; k < 14 / DT; k++) {
      t += DT;
      who = stepVillage(sim, DT, t, 9.4 + k * 0.0001, kid, talk);
      if (who >= 0) lines.add(talk.line);
      waved = Math.max(waved, ...sim.villagers.filter((v) => Math.hypot(v.x - kid.x, v.z - kid.z) < 6).map((v) => v.pose.wave));
    }
    expect(sim.villagers[who]?.def.id).toBe("bun");
    expect(talk.name).toBe("Auntie Bun");
    expect(lines.size).toBeGreaterThanOrEqual(2);
    expect(waved).toBeGreaterThan(0.8);
    // and she stood still, facing the kid, while chatting
    const face = Math.atan2(kid.x - bun.x, kid.z - bun.z);
    expect(Math.abs(Math.atan2(Math.sin(face - bun.yaw), Math.cos(face - bun.yaw)))).toBeLessThan(0.3);
    // walk away: nobody talks
    t += DT;
    expect(stepVillage(sim, DT, t, 9.5, { x: bun.x + 40, z: bun.z }, talk)).toBe(-1);
  });

  it("nobody walks through the Park kid", () => {
    const sim = makeSim();
    let t = run(sim, 12, 10);
    const talk: TalkOut = { id: "", name: "", line: "" };
    // stand in the middle of the busy market path
    const kid = { x: VILLAGE_MARKET.x, z: VILLAGE_MARKET.z - 6 };
    let close = 0;
    for (let k = 0; k < 30 / DT; k++) {
      t += DT;
      stepVillage(sim, DT, t, 12 + k * 0.001, kid, talk);
      for (const v of sim.villagers) if (v.phase !== Phase.Hidden && v.phase !== Phase.Act && Math.hypot(v.x - kid.x, v.z - kid.z) < 0.9) close++;
    }
    expect(close).toBe(0);
  });
});
