// Habit hooks: small pure rules that look at the kid's day and decide what the world should
// nudge them towards — beacons over buildings, attraction states, and the greeting toast.
//
// To add a new hook: append a WorldHook to HOOKS. It gets the current HabitState and returns
// whatever effects it wants; effects from all hooks are merged (earlier hooks win on clashes).
// No engine or UI changes are needed for beacon/attraction/greeting effects.
import type { PetMood } from "@/lib/pet/logic";

export interface HabitState {
  kidName: string;
  petName: string | null;
  tasksDone: number;
  tasksTotal: number;
  petMood: PetMood | null;
  /** consecutive days the kid has visited the world (per device) */
  visitStreak: number;
  /** pet care streak from the database */
  petCareStreak: number;
  dailyGiftReady: boolean;
  /** has the kid finished a round of mini golf today (per device) */
  playedGolfToday: boolean;
}

export interface HookEffects {
  /** key = landmark key or attraction id, value = emoji to float above it */
  beacons: Record<string, string>;
  attractionState: Record<string, Record<string, unknown>>;
  greetings: string[];
}

export interface WorldHook {
  id: string;
  evaluate(s: HabitState): Partial<{
    beacons: Record<string, string>;
    attractionState: Record<string, Record<string, unknown>>;
    greeting: string;
  }>;
}

const NEEDY_MOODS = new Set(["starving", "dirty", "tired", "lonely", "sleeping"]);

export const HOOKS: WorldHook[] = [
  {
    id: "chores-left",
    evaluate: (s) =>
      s.tasksDone < s.tasksTotal
        ? { beacons: { work: "❗" }, greeting: `${s.tasksTotal - s.tasksDone} chore${s.tasksTotal - s.tasksDone === 1 ? "" : "s"} waiting at the barn 📋` }
        : {},
  },
  {
    id: "all-chores-fireworks",
    evaluate: (s) => {
      const allDone = s.tasksTotal > 0 && s.tasksDone >= s.tasksTotal;
      return {
        attractionState: { fireworks: { show: allDone } },
        ...(allDone ? { greeting: "All chores done — fireworks for you! 🎆", beacons: { playground: "⭐" } } : {}),
      };
    },
  },
  {
    id: "pet-needs",
    evaluate: (s) =>
      s.petMood && NEEDY_MOODS.has(s.petMood.id)
        ? { beacons: { pet: s.petMood.emoji }, greeting: s.petMood.message }
        : {},
  },
  {
    id: "daily-gift",
    evaluate: (s) => ({
      attractionState: { "daily-gift": { ready: s.dailyGiftReady } },
      ...(s.dailyGiftReady ? { beacons: { "daily-gift": "🎁" }, greeting: "Your daily gift is waiting on the plaza! 🎁" } : {}),
    }),
  },
  {
    id: "try-minigolf",
    evaluate: (s) => (s.playedGolfToday ? {} : { beacons: { minigolf: "⛳" } }),
  },
  {
    id: "visit-streak",
    evaluate: (s) => (s.visitStreak >= 2 ? { greeting: `Welcome back ${s.kidName}! 🔥 ${s.visitStreak} days in a row` } : { greeting: `Hi ${s.kidName}! Let's explore 🌈` }),
  },
];

export function evaluateHooks(s: HabitState): HookEffects {
  const out: HookEffects = { beacons: {}, attractionState: {}, greetings: [] };
  for (const hook of HOOKS) {
    const e = hook.evaluate(s);
    if (e.beacons) for (const [k, v] of Object.entries(e.beacons)) out.beacons[k] ??= v;
    if (e.attractionState) for (const [k, v] of Object.entries(e.attractionState)) out.attractionState[k] ??= v;
    if (e.greeting) out.greetings.push(e.greeting);
  }
  return out;
}

// ── per-device daily bookkeeping (cosmetic, so localStorage — no DB change) ─────────────

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // non-essential
  }
}

/** Records today's visit and returns the consecutive-day streak. */
export function recordVisit(kidId: string): number {
  const key = `cucaino.world.visits.${kidId}`;
  const today = todayStr();
  const raw = read(key);
  let last = "";
  let streak = 0;
  if (raw) [last, streak] = [raw.split("|")[0], Number(raw.split("|")[1]) || 0];
  if (last === today) return streak;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  streak = last === yesterday ? streak + 1 : 1;
  write(key, `${today}|${streak}`);
  return streak;
}

/** Generic "done today?" flag for any daily activity (mini golf round, rides, ...). */
export function doneToday(kidId: string, what: string): boolean {
  return read(`cucaino.world.${what}.${kidId}`) === todayStr();
}

export function markDoneToday(kidId: string, what: string) {
  write(`cucaino.world.${what}.${kidId}`, todayStr());
}

export function isDailyGiftReady(kidId: string): boolean {
  return read(`cucaino.world.gift.${kidId}`) !== todayStr();
}

export function claimDailyGift(kidId: string) {
  write(`cucaino.world.gift.${kidId}`, todayStr());
}

/** Surprise contents for the daily gift — cosmetic sparkles plus a cheerful message. */
export const DAILY_GIFTS = [
  { sparkles: 20, message: "A bag of sparkles! ✨" },
  { sparkles: 15, message: "Your pet found you a shiny pebble! 💎" },
  { sparkles: 25, message: "A rainbow treat! 🌈" },
  { sparkles: 30, message: "Super rare golden sparkles! 🌟" },
  { sparkles: 18, message: "A happy-day cookie! 🍪" },
];
