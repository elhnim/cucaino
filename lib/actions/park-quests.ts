"use server";

/**
 * Quest Board loader for Cucaino Park (components/park/quests/*). Same rules as the flat
 * /todo page — scheduled tasks for the chosen weekday + tasks the kid added for that date,
 * weekday "before school" split, weekly goals, self-addable flexible tasks — using the same
 * queries, so the park and the flat page always agree. Completions are tracked for today only
 * (past/future days are read-only previews), exactly like /todo.
 */
import {
  getKid,
  getFamily,
  listTasksForKid,
  listCompletionsToday,
  listKidDailyAdditions,
  countCompletionsThisWeek,
  localDateString,
} from "@/lib/data/stub";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";
import type { DayOfWeek, Task, TaskCompletion } from "@/lib/domain/types";
import {
  listRewardsForKid,
  listBadgeProgress,
  listWishlistItems,
  listCustomBadgeProgress,
  listActiveStrikes,
} from "@/lib/data/stub";
import type { Reward, BadgeProgress, WishlistItem, CustomBadgeProgress } from "@/lib/domain/types";

const DAY_LABELS: Record<DayOfWeek, string> = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun" };

export interface QuestDay {
  dow: DayOfWeek;
  label: string;
  date: number;
  total: number;
  isToday: boolean;
}

export interface QuestBoardData {
  days: QuestDay[];
  activeDow: DayOfWeek;
  activeDateStr: string;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  beforeSchool: Task[];
  quests: Task[];
  school: Task[];
  completions: TaskCompletion[];
  selfAddable: Task[];
  weeklyGoals: { id: string; name: string; icon: string; min: number; count: number; addedToday: boolean }[];
}

export async function getQuestBoard(kidId: string, dow?: number): Promise<QuestBoardData | null> {
  const tasksP = listTasksForKid(kidId);
  tasksP.catch(() => {});
  const [kid, family] = await Promise.all([getKid(kidId), getFamily()]);
  if (!kid) return null;
  const tz = family?.timezone ?? "Australia/Sydney";
  const today = isoWeekday(new Date(), tz);
  const activeDow = (dow ? Math.max(1, Math.min(7, Math.round(dow))) : today) as DayOfWeek;
  const todayStr = localDateString(tz);
  const activeDate = new Date(`${todayStr}T12:00:00Z`);
  activeDate.setUTCDate(activeDate.getUTCDate() - (today - activeDow));
  const activeDateStr = activeDate.toISOString().slice(0, 10);

  const [tasks, completions, added, weekCounts] = await Promise.all([
    tasksP,
    listCompletionsToday(kid.id, tz),
    listKidDailyAdditions(kid.id, activeDateStr),
    countCompletionsThisWeek(kid.id, tz),
  ]);

  const isToday = activeDow === today;
  const isPast = activeDow < today;
  const isFuture = activeDow > today;
  const isWeekday = activeDow <= 5;

  const scheduled = tasksForDay(tasks.filter((t) => t.rule !== "flexible"), activeDow);
  const dayTasks = [...scheduled, ...(isPast ? [] : added)].filter((t) => t.requiresCompletion && t.category !== "school_subject");
  const beforeSchool = isWeekday ? dayTasks.filter((t) => t.timeBlock === "before_school") : [];
  const quests = dayTasks.filter((t) => !(isWeekday && t.timeBlock === "before_school"));
  const school = tasksForDay(tasks.filter((t) => t.category === "school_subject"), activeDow);

  const addedSet = new Set(added.map((t) => t.id));
  const days: QuestDay[] = ([1, 2, 3, 4, 5, 6, 7] as DayOfWeek[]).map((d) => {
    const dt = new Date(`${todayStr}T12:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() - (today - d));
    return {
      dow: d,
      label: DAY_LABELS[d],
      date: dt.getUTCDate(),
      total: tasksForDay(tasks.filter((t) => t.rule !== "flexible"), d).filter((t) => t.requiresCompletion && t.category !== "school_subject").length,
      isToday: d === today,
    };
  });

  return {
    days,
    activeDow,
    activeDateStr,
    isToday,
    isPast,
    isFuture,
    beforeSchool,
    quests,
    school,
    completions: isToday ? completions : [],
    selfAddable: isPast ? [] : tasks.filter((t) => t.rule === "flexible"),
    weeklyGoals: tasks
      .filter((t) => t.rule === "flexible" && (t.flexibleMinPerWeek ?? 0) > 0)
      .map((t) => ({
        id: t.id,
        name: t.name,
        icon: t.icon,
        min: t.flexibleMinPerWeek as number,
        count: weekCounts[t.id] ?? 0,
        addedToday: addedSet.has(t.id),
      })),
  };
}

// ── Prize Shop + Trophy Hall (same queries as the flat /rewards page) ──

export interface PrizeShopData {
  rewards: Reward[];
  wishlist: WishlistItem[];
  badges: BadgeProgress[];
  customBadges: CustomBadgeProgress[];
  stars: number;
  cash: number;
  strikes: number;
  totalStarsEarned: number;
}

export async function getPrizeShop(kidId: string): Promise<PrizeShopData | null> {
  const [kid, rewards, badges, wishlist, custom, strikes] = await Promise.all([
    getKid(kidId),
    listRewardsForKid(kidId),
    listBadgeProgress(kidId),
    listWishlistItems(kidId),
    listCustomBadgeProgress(kidId),
    listActiveStrikes(kidId),
  ]);
  if (!kid) return null;
  return {
    rewards: rewards.filter((r) => r.active && r.who !== "team"),
    wishlist,
    badges,
    customBadges: custom,
    stars: kid.pointsBalance,
    cash: kid.cashBalance,
    strikes: strikes.length,
    totalStarsEarned: kid.totalStarsEarned ?? 0,
  };
}

/** Per-kid "done/total today" for the kid picker — loaded after the picker is on screen. */
export async function getFamilyProgress(kidIds: string[]): Promise<{ kidId: string; done: number; total: number }[]> {
  const family = await getFamily();
  const tz = family?.timezone ?? "Australia/Sydney";
  const dow = isoWeekday(new Date(), tz);
  return Promise.all(
    kidIds.map(async (kidId) => {
      const [tasks, completions] = await Promise.all([listTasksForKid(kidId), listCompletionsToday(kidId, tz)]);
      const today = tasksForDay(tasks.filter((t) => t.rule !== "flexible"), dow).filter((t) => t.requiresCompletion);
      return { kidId, done: completions.length, total: today.length };
    }),
  );
}
