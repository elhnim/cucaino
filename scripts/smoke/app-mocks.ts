// Sample data for the app harness (scripts/smoke/app-build.mjs): any export here whose name
// matches a server action replaces that action's `return null` stub, so panels render real
// looking content in screenshots. Loosely typed on purpose — it's smoke data, not app code.
import type { Task, Reward } from "../../lib/domain/types";

const today = new Date();
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const q = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
const doneN = Number(q.get("done") ?? 1);

function task(id: string, name: string, icon: string, points: number, extra: Partial<Task> = {}): Task {
  return {
    id, familyId: "f", kidIds: null, name, category: "chore", icon, scheduleType: "daily", daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    timeBlock: "afternoon", startTime: null, durationMinutes: null, points, familyPointsContribution: 0, requiresTimer: false,
    requiresCompletion: true, location: null, packingList: null, defaultBpm: null, defaultTimeSignature: null, active: true,
    kidCanAdd: false, rule: "strict", flexibleMinPerWeek: null, timeSlots: [], target: "none", targetDurationMinutes: null,
    targetReps: null, targetRepLabel: null, checklistItems: null, musicEnabled: false, frequencyPerDay: 1, description: null,
    subject: null, customLabel: null, endTime: null, room: null, teacher: null, cashValueCents: 0, requiresParentApproval: false,
    ...extra,
  } as Task;
}

const QUESTS = [
  task("t1", "Make your bed", "🛏️", 2),
  task("t2", "Piano practice", "🎹", 6, { category: "music", target: "time", targetDurationMinutes: 15 }),
  task("t3", "Tidy your room", "🧹", 4, { target: "checklist", checklistItems: ["Toys in the box", "Clothes in the basket", "Books on the shelf"] }),
  task("t4", "Read a chapter", "📖", 10, { category: "brainy", description: "Any book you like", cashValueCents: 50 }),
  task("t5", "Brush teeth", "🪥", 1),
];

export async function getQuestBoard() {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - ((today.getDay() + 6) % 7) + i);
    return { dow: i + 1, label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i], date: d.getDate(), total: 3 + (i % 3), isToday: d.getDate() === today.getDate() };
  });
  const active = days.find((d) => d.isToday)?.dow ?? 1;
  return {
    days, activeDow: active, activeDateStr: ymd(today), isToday: true, isPast: false, isFuture: false,
    beforeSchool: [QUESTS[4]],
    quests: QUESTS.slice(0, 4),
    school: [task("s1", "Maths", "➗", 0, { category: "school_subject" }), task("s2", "Art", "🎨", 0, { category: "school_subject" })],
    completions: QUESTS.slice(4 - Math.max(0, doneN - 1), 5).slice(0, doneN).map((t, i) => ({ id: `c${i}`, taskId: t.id, kidId: "smoke-kid", date: ymd(today), completedAt: today.toISOString(), durationActualSeconds: null, pointsAwarded: t.points, cashAwardedCents: 0, pendingParentApproval: false, parentApprovedAt: null })),
    selfAddable: [],
    weeklyGoals: [],
  };
}

export async function getHabits() {
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - 6 + i);
    return { date: ymd(d), state: i === 6 ? (doneN > 0 ? "done" : "today") : i === 2 ? "shield" : i === 0 ? "missed" : "done" };
  });
  return {
    streak: { current: 5, doneToday: doneN > 0, week, shielded: [week[2].date], next: { days: 7, tickets: 5, title: "Week of wonder", emoji: "🌈" } },
    claims: [],
    chestOpenedToday: q.get("chest") !== "1" ? true : false,
    quests: { total: Number(q.get("quests") ?? 4), done: doneN },
    tickets: 7,
  };
}

export async function getDreamPark() {
  return { tickets: 7, ticketsEarned: 30, layout: [], level: 2, streak: 5 };
}

export async function openMysteryChest() {
  await new Promise((r) => setTimeout(r, 200));
  return { ok: true, prize: { kind: "sticker", sticker: "🦄", text: "A rare unicorn sticker!" }, tickets: 7 };
}

export async function payForPlay() {
  return { ok: true, tickets: 6 };
}

function reward(id: string, name: string, icon: string, cost: number, description: string | null = null): Reward {
  return {
    id, familyId: "f", kidId: null, name, description, icon, costPoints: cost, type: "individual", active: true, rewardType: "treat",
    who: "individual", recurrence: "recurring", redemptionLimit: null, redemptionPeriod: "none", requiresApproval: true, availableTo: [], costCashCents: 0,
  } as unknown as Reward;
}

export async function getPrizeShop() {
  return {
    rewards: [reward("r1", "Ice cream trip", "🍦", 20, "A scoop of your favourite"), reward("r2", "30 min screen time", "🎮", 8), reward("r3", "Movie night pick", "🎬", 40), reward("r4", "New book", "📚", 60)],
    wishlist: [{ id: "w1", kidId: "smoke-kid", rewardId: "r3", addedAt: today.toISOString(), position: 1 }],
    badges: [],
    customBadges: [],
    stars: 12,
    cash: 0,
    strikes: 0,
    totalStarsEarned: 140,
  };
}
