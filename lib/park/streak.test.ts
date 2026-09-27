import { describe, expect, it } from "vitest";
import { addDays, claimableMilestones, computeStreak, weekOf, ymdIn } from "./streak";

const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));

describe("park streaks", () => {
  it("does date maths across months and years", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(weekOf("2026-09-27")).toBe("2026-09-21"); // a Sunday -> that week's Monday
    expect(weekOf("2026-09-21")).toBe("2026-09-21");
  });

  it("uses the family timezone for 'today'", () => {
    // 9am in Sydney on the 28th is still the 27th in UTC
    const t = new Date("2026-09-27T23:00:00Z");
    expect(ymdIn(t, "Australia/Sydney")).toBe("2026-09-28");
    expect(ymdIn(t, "UTC")).toBe("2026-09-27");
  });

  it("counts a run of days, and today not done yet doesn't break it", () => {
    const today = "2026-09-28";
    const s = computeStreak(days("2026-09-23", 5), today); // 23..27
    expect(s.current).toBe(5);
    expect(s.doneToday).toBe(false);
    expect(s.week[6]).toEqual({ date: today, state: "today" });
    const s2 = computeStreak([...days("2026-09-23", 5), today], today);
    expect(s2.current).toBe(6);
    expect(s2.doneToday).toBe(true);
  });

  it("a weekly shield covers one missed day, a second miss in the same week breaks the run", () => {
    const today = "2026-09-27"; // Sunday
    // Mon 21 .. Sun 27 with Wed 23 missed
    const s = computeStreak(["2026-09-21", "2026-09-22", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"], today);
    expect(s.shielded).toEqual(["2026-09-23"]);
    expect(s.current).toBe(6);
    expect(s.week.find((d) => d.date === "2026-09-23")?.state).toBe("shield");
    // two misses in one week: only the latest gap is shielded, the older one ends the run
    const s2 = computeStreak(["2026-09-21", "2026-09-23", "2026-09-25", "2026-09-26", "2026-09-27"], today);
    expect(s2.current).toBe(4);
  });

  it("two missed days in a row break the run even with a shield", () => {
    const s = computeStreak(["2026-09-20", "2026-09-21", "2026-09-24", "2026-09-25"], "2026-09-25");
    expect(s.current).toBe(2);
  });

  it("offers each milestone once", () => {
    expect(claimableMilestones(8, []).map((m) => m.days)).toEqual([3, 7]);
    expect(claimableMilestones(8, [3]).map((m) => m.days)).toEqual([7]);
    expect(computeStreak(days("2026-09-01", 8), "2026-09-08").next?.days).toBe(14);
  });
});
