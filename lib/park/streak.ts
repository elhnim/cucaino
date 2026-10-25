// Park streaks, pure and tested: which days you did a quest, how long your run is, and the
// milestone rewards along the way. A "streak day" is a day with at least one finished quest,
// in the family's timezone. Each calendar week (Mon–Sun) gives one free 🛡️ shield that
// quietly covers a single missed day, so one off day never wipes out a long run.

export const STREAK_MILESTONES: { days: number; tickets: number; title: string; emoji: string }[] = [
  { days: 3, tickets: 3, title: "3-day spark", emoji: "✨" },
  { days: 7, tickets: 5, title: "Week of wonder", emoji: "🌈" },
  { days: 14, tickets: 10, title: "Fortnight flame", emoji: "🔥" },
  { days: 30, tickets: 20, title: "Legend of the month", emoji: "👑" },
];

/** "YYYY-MM-DD" of a date in a timezone. */
export function ymdIn(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Shift a "YYYY-MM-DD" by whole days (calendar maths in UTC, so no DST surprises). */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Monday of the week that `ymd` is in (weeks run Mon–Sun). */
export function weekOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sun
  return addDays(ymd, -((dow + 6) % 7));
}

export type DayState = "done" | "shield" | "missed" | "today" | "future";

export interface StreakInfo {
  /** days in the current run (shielded days don't add, but don't break it) */
  current: number;
  /** today already counts (a quest is done today) */
  doneToday: boolean;
  /** the last 7 days, oldest first, ending today */
  week: { date: string; state: DayState }[];
  /** days that were covered by a shield in the current run */
  shielded: string[];
  /** the next milestone to reach, if any */
  next: (typeof STREAK_MILESTONES)[number] | null;
}

/**
 * Work out the streak from the set of days with a finished quest.
 * Today not being done yet never breaks the run (there's still time!).
 */
export function computeStreak(doneDays: Iterable<string>, today: string): StreakInfo {
  const done = new Set(doneDays);
  const doneToday = done.has(today);
  let current = doneToday ? 1 : 0;
  const shielded: string[] = [];
  const shieldUsed = new Set<string>();
  // walk back from yesterday
  let day = addDays(today, -1);
  for (let i = 0; i < 400; i++) {
    if (done.has(day)) current++;
    else {
      const wk = weekOf(day);
      // a shield only helps if the run continues before this gap
      if (!shieldUsed.has(wk) && done.has(addDays(day, -1)) && current > 0) {
        shieldUsed.add(wk);
        shielded.push(day);
      } else break;
    }
    day = addDays(day, -1);
  }
  const week: StreakInfo["week"] = [];
  for (let k = 6; k >= 0; k--) {
    const d = addDays(today, -k);
    week.push({ date: d, state: d === today ? (doneToday ? "done" : "today") : done.has(d) ? "done" : shielded.includes(d) ? "shield" : "missed" });
  }
  const next = STREAK_MILESTONES.find((m) => m.days > current) ?? null;
  return { current, doneToday, week, shielded, next };
}

/** Milestones reached but not yet claimed. */
export function claimableMilestones(current: number, claimed: number[]): typeof STREAK_MILESTONES {
  return STREAK_MILESTONES.filter((m) => current >= m.days && !claimed.includes(m.days));
}
