import { redirect } from "next/navigation";
import {
  getFamily,
  listKids,
  listPendingRequests,
  listTasksForKid,
  listCompletionsToday,
  listRewardsForKid,
  listPendingCompletions,
  listActiveStrikes,
  listAllStrikes,
  listTodayMoodCounts,
} from "@/lib/data/stub";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";
import { getTheme } from "@/lib/themes/presets";
import type { Task } from "@/lib/domain/types";
import ParentHomeWidgets, { type KidCardData, type HeadsUpItem } from "@/components/parent/ParentHomeWidgets";
import WhatsNewModal from "@/components/WhatsNewModal";

export default async function ParentOverviewPage() {
  const [family, kids, pending, pendingCompletions] = await Promise.all([
    getFamily(),
    listKids(),
    listPendingRequests(),
    listPendingCompletions(),
  ]);
  if (!family) redirect("/login");

  const dow = isoWeekday();
  const today = new Date();
  const todayLabel = today.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  const kidData = await Promise.all(
    kids.map(async (kid) => {
      const [tasks, completions, rewards, activeStrikes, allStrikes, moodCounts] = await Promise.all([
        listTasksForKid(kid.id),
        listCompletionsToday(kid.id),
        listRewardsForKid(kid.id),
        listActiveStrikes(kid.id),
        listAllStrikes(kid.id),
        listTodayMoodCounts(kid.id),
      ]);
      const todayTasks = tasksForDay(tasks, dow).filter((t) => t.requiresCompletion);
      const completedIds = new Set(completions.map((c) => c.taskId));
      const done = todayTasks.filter((t) => completedIds.has(t.id)).length;
      const total = todayTasks.length;
      const activityTasks = tasksForDay(tasks.filter((t) => t.category === "activity"), dow);
      return { kid, todayTasks, completedIds, done, total, activityTasks, rewards, activeStrikes, allStrikes, moodCounts };
    }),
  );

  const rewardById = new Map(kidData.flatMap((d) => d.rewards).map((r) => [r.id, r]));

  // Build per-kid card data
  const kidCards: KidCardData[] = kidData.map(({ kid, done, total, activeStrikes, allStrikes, moodCounts }) => {
    const theme = getTheme(kid.themeId);
    const allDone = total > 0 && done >= total;
    const kidPending = pending.filter((r) => r.kidId === kid.id);
    const req = kidPending[0] ?? null;
    const reward = req ? (rewardById.get(req.rewardId) ?? null) : null;
    const agoMin = req ? Math.round((Date.now() - new Date(req.requestedAt).getTime()) / 60_000) : 0;
    return {
      kid,
      done,
      total,
      allDone,
      themeAccent: theme.accent,
      themeAccentSoft: theme.accentSoft,
      pendingRequest: req,
      pendingReward: reward,
      pendingCompletions: pendingCompletions.filter((c) => c.kidId === kid.id),
      agoMin,
      activeStrikes,
      allStrikes,
      moodCounts,
    };
  });

  // Build heads-up items
  const headsUpBefore: HeadsUpItem[] = [];
  const headsUpAfter: HeadsUpItem[] = [];
  for (const { kid, activityTasks } of kidData) {
    const theme = getTheme(kid.themeId);
    for (const task of activityTasks) {
      if (!task.location && (!task.packingList || task.packingList.length === 0)) continue;
      const item: HeadsUpItem = { kid, task, themeAccent: theme.accent, themeAccentSoft: theme.accentSoft };
      if (task.timeBlock === "before_school") headsUpBefore.push(item);
      else headsUpAfter.push(item);
    }
  }

  return (
    <div className="p-4 space-y-4 pt-5">
      <WhatsNewModal />
      <ParentHomeWidgets
        allKids={kids}
        kidCards={kidCards}
        headsUpBefore={headsUpBefore}
        headsUpAfter={headsUpAfter}
        todayLabel={todayLabel}
      />
    </div>
  );
}
