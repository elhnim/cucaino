import { describe, expect, it } from "vitest";
import { SETTLEMENTS } from "../../registry/settlements";
import { Phase, buildSettlementRoutes, makeSettlementSim, settlementSlotAt, stepSettlement, type SettlementSim, type TalkOut } from "./routine";

const DAY = 900; // real seconds per park day (atmosphere.PARK_DAY_SECONDS)
const DT = 1 / 20;
const hourAt = (t: number, h0: number) => (h0 + (t / DAY) * 24) % 24;
const def = SETTLEMENTS[0];

function run(sim: SettlementSim, h0: number, secs: number, each?: (t: number, hour: number) => void, kid: { x: number; z: number } | null = null, t0 = 0) {
  const talk: TalkOut = { id: "", name: "", line: "", emoji: "" };
  let t = t0;
  for (let k = 0; k < secs / DT; k++) {
    t += DT;
    const hour = hourAt(t - t0, h0);
    stepSettlement(def, sim, DT, t, hour, kid, talk);
    each?.(t, hour);
  }
  return t;
}
const visible = (sim: SettlementSim) => sim.villagers.filter((v) => v.phase !== Phase.Hidden);

describe("a settlement's villagers' day (generic routine, run on Lakeside)", () => {
  it("has a roster of 10-14, every schedule starting at midnight and increasing, spots that exist", () => {
    expect(def.roster.length).toBeGreaterThanOrEqual(10);
    expect(def.roster.length).toBeLessThanOrEqual(14);
    expect(new Set(def.roster.map((v) => v.id)).size).toBe(def.roster.length);
    const workIds = new Set(def.work.map((w) => w.id));
    for (const v of def.roster) {
      expect(v.home).toBeGreaterThanOrEqual(0);
      expect(v.home).toBeLessThan(def.huts.length);
      expect(v.schedule[0].from).toBe(0);
      for (let i = 1; i < v.schedule.length; i++) expect(v.schedule[i].from, v.id).toBeGreaterThan(v.schedule[i - 1].from);
      for (const s of v.schedule) if (s.spot) expect(workIds.has(s.spot), `${v.id} ${s.spot}`).toBe(true);
    }
    // schedules cover the day: someone's asleep at night, and the village is lively by day
    const hours = def.roster.flatMap((v) => v.schedule.map((s) => s.from));
    expect(Math.max(...hours)).toBeGreaterThan(18);
    expect(def.roster.some((v) => v.schedule.some((s) => s.act === "home" && s.from > 20))).toBe(true);
  });

  it("every talk line is kid-friendly length (<= 140 chars)", () => {
    for (const t of def.talk) for (const line of t.lines) expect(line.length, `${t.id}: ${line}`).toBeLessThanOrEqual(140);
  });

  it("is deterministic", () => {
    const sa = makeSettlementSim(def);
    const sb = makeSettlementSim(def);
    run(sa, 9, 40);
    run(sb, 9, 40);
    expect(sa.villagers.map((v) => [v.x.toFixed(4), v.z.toFixed(4)])).toEqual(sb.villagers.map((v) => [v.x.toFixed(4), v.z.toFixed(4)]));
  });

  it("slotAt picks the running slot, wrapping round midnight", () => {
    const s = [
      { from: 0, act: "home" as const },
      { from: 7, act: "fish" as const },
      { from: 18, act: "dance" as const },
    ];
    expect(settlementSlotAt(s, 3)).toBe(0);
    expect(settlementSlotAt(s, 7)).toBe(1);
    expect(settlementSlotAt(s, 17.9)).toBe(1);
    expect(settlementSlotAt(s, 23)).toBe(2);
  });

  it("the path graph connects every node, one hop at a time", () => {
    const r = buildSettlementRoutes(def);
    const n = def.nodes.length;
    for (let a = 0; a < n; a++)
      for (let b = 0; b < n; b++) {
        let at = a;
        let hops = 0;
        while (at !== b && hops < n) {
          const nx = r.next[at * n + b];
          expect(nx).toBeGreaterThanOrEqual(0);
          expect(def.edges.some(([p, q]) => (p === at && q === nx) || (q === at && p === nx))).toBe(true);
          at = nx;
          hops++;
        }
        expect(at).toBe(b);
      }
  });

  it("runs a whole day without producing NaNs or infinities", () => {
    const sim = makeSettlementSim(def);
    let bad = 0;
    run(sim, 5, DAY, () => {
      for (const v of sim.villagers) if (!Number.isFinite(v.x + v.z + v.y + v.yaw)) bad++;
    });
    expect(bad).toBe(0);
  });

  it("the whole village dances at dusk, and most sleep at night", () => {
    const sim = makeSettlementSim(def);
    let dancers = 0;
    let night = 0;
    run(sim, 5, DAY, (_t, hour) => {
      if (Math.abs(hour - 19.2) < 0.01) dancers = sim.villagers.filter((v) => v.act === "dance" && v.phase === Phase.Act).length;
      if (Math.abs(hour - 2.5) < 0.01) night = visible(sim).length;
    });
    expect(dancers).toBeGreaterThanOrEqual(6);
    expect(night).toBeLessThanOrEqual(3);
  });

  it("different jobs happen: fishing off the pier, mending nets, cooking, chasing, drumming", () => {
    const sim = makeSettlementSim(def);
    const seen = new Set<string>();
    run(sim, 5, DAY * 0.6, () => {
      for (const v of sim.villagers) if (v.phase === Phase.Act) seen.add(v.pose.anim);
    });
    for (const a of ["fish", "nets", "bake", "run", "drum", "dance"]) expect(seen.has(a as never), a).toBe(true);
  });

  it("villagers wave when the Park kid comes near, and the chatty ones talk (rotating their lines)", () => {
    const sim = makeSettlementSim(def);
    const talk: TalkOut = { id: "", name: "", line: "", emoji: "" };
    let t = run(sim, 9, 20);
    const pike = sim.villagers.find((v) => v.def.id === "pike")!;
    const kid = { x: pike.x + 1.1, z: pike.z + 0.9 };
    const lines = new Set<string>();
    let who = -1;
    let waved = 0;
    for (let k = 0; k < 16 / DT; k++) {
      t += DT;
      who = stepSettlement(def, sim, DT, t, 9.4 + k * 0.0001, kid, talk);
      if (who >= 0) lines.add(talk.line);
      waved = Math.max(waved, ...sim.villagers.filter((v) => Math.hypot(v.x - kid.x, v.z - kid.z) < 6).map((v) => v.pose.wave));
    }
    expect(sim.villagers[who]?.def.talk).toBeTruthy();
    expect(talk.emoji).toBe(def.emoji);
    expect(lines.size).toBeGreaterThanOrEqual(2);
    expect(waved).toBeGreaterThan(0.8);
    // walk away: nobody talks
    t += DT;
    expect(stepSettlement(def, sim, DT, t, 9.5, { x: pike.x + 40, z: pike.z }, talk)).toBe(-1);
  });

  for (const other of SETTLEMENTS.filter((s) => s.id !== def.id)) {
    it(`${other.id}: the generic routine also runs a whole day without NaNs or infinities`, () => {
      const sim = makeSettlementSim(other);
      const talk: TalkOut = { id: "", name: "", line: "", emoji: "" };
      let t = 0;
      let bad = 0;
      for (let k = 0; k < DAY / DT; k++) {
        t += DT;
        const hour = hourAt(t, 5);
        stepSettlement(other, sim, DT, t, hour, null, talk);
        for (const v of sim.villagers) if (!Number.isFinite(v.x + v.z + v.y + v.yaw)) bad++;
      }
      expect(bad).toBe(0);
    });
  }

  it("nobody walks through the Park kid", () => {
    const sim = makeSettlementSim(def);
    let t = run(sim, 12, 10);
    const talk: TalkOut = { id: "", name: "", line: "", emoji: "" };
    const fire = def.work.find((w) => w.id === "fire")!;
    const kid = { x: fire.x, z: fire.z - 4 };
    let close = 0;
    for (let k = 0; k < 30 / DT; k++) {
      t += DT;
      stepSettlement(def, sim, DT, t, 12 + k * 0.001, kid, talk);
      for (const v of sim.villagers) if (v.phase !== Phase.Hidden && v.phase !== Phase.Act && Math.hypot(v.x - kid.x, v.z - kid.z) < 0.9) close++;
    }
    expect(close).toBe(0);
  });
});
