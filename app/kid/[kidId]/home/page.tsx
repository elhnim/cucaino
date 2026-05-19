import { notFound } from "next/navigation";
import PrefetchRoutes from "@/components/kid/PrefetchRoutes";
import {
  getKid,
  listTasksForKid,
  listCompletionsToday,
  listBadgeProgress,
  listKids,
  listWeeklyStarsByKid,
  listCustomBadgeProgress,
} from "@/lib/data/stub";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";
import { getTheme } from "@/lib/themes/presets";
import { BADGE_META, BADGE_THRESHOLDS, getTierFromCount } from "@/lib/domain/badge-config";
import type { BadgeProgress, DayOfWeek } from "@/lib/domain/types";
import KidHomeWidgets from "@/components/kid/KidHomeWidgets";

const LEVELS = [
  { min: 0,    max: 99,       emoji: "🌱", name: "Seedling",  color: "#16a34a" },
  { min: 100,  max: 299,      emoji: "🗺️", name: "Explorer",  color: "#2563eb" },
  { min: 300,  max: 599,      emoji: "🏅", name: "Champion",  color: "#d97706" },
  { min: 600,  max: 999,      emoji: "🌟", name: "Legend",    color: "#7c3aed" },
  { min: 1000, max: Infinity, emoji: "🚀", name: "Superstar", color: "#dc2626" },
];

const ENCOURAGEMENTS = [
  "Every day counts! 🌟",
  "You're on a roll! 🔥",
  "Amazing effort! 💪",
  "Nothing can stop you! 🚀",
  "Legend in the making! 🏆",
];

const CIRCUMFERENCE = 2 * Math.PI * 20;

export default async function KidHomePage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();

  const now = new Date();
  const dow = isoWeekday(now);

  const [tasks, completions, badges, allKids, weeklyStars, customBadgeProgress] = await Promise.all([
    listTasksForKid(kid.id),
    listCompletionsToday(kid.id),
    listBadgeProgress(kid.id),
    listKids(),
    listWeeklyStarsByKid(),
    listCustomBadgeProgress(kid.id),
  ]);

  const todayTasks = tasksForDay(tasks, dow);
  const completableTasks = todayTasks.filter((t) => t.requiresCompletion);
  const completedIds = new Set(completions.map((c) => c.taskId));
  const done = completableTasks.filter((t) => completedIds.has(t.id)).length;
  const total = completableTasks.length;
  const incompleteTasks = completableTasks.filter((t) => !completedIds.has(t.id));
  const allDone = total > 0 && done >= total;

  const todaySchoolTasks = dow <= 5
    ? tasksForDay(tasks.filter((t) => t.category === "school_subject"), dow)
    : [];

  const tomorrowDow: DayOfWeek = dow < 5 ? ((dow + 1) as DayOfWeek) : 1;
  const tomorrowActivityTasks = tasksForDay(
    tasks.filter((t) => t.category === "activity"),
    tomorrowDow,
  ).filter((t) => t.location || (t.packingList && t.packingList.length > 0));

  const badgesInProgress: BadgeProgress[] = badges
    .filter((b) => b.completionCount > 0)
    .sort((a, b) => {
      const tierOrder = { gold: 3, silver: 2, bronze: 1, none: 0 };
      return tierOrder[b.currentTier] - tierOrder[a.currentTier] || b.completionCount - a.completionCount;
    })
    .slice(0, 3);

  const theme = getTheme(kid.themeId);
  const levelDef = LEVELS.find((l) => kid.totalStarsEarned >= l.min && kid.totalStarsEarned <= l.max) ?? LEVELS[0];
  const levelIdx = LEVELS.indexOf(levelDef);
  const nextLevelDef = levelIdx < LEVELS.length - 1 ? LEVELS[levelIdx + 1] : null;
  const levelPct = nextLevelDef
    ? Math.min(1, (kid.totalStarsEarned - levelDef.min) / (nextLevelDef.min - levelDef.min))
    : 1;

  const ringOffset = CIRCUMFERENCE * (1 - (total > 0 ? done / total : 0));
  const taskPct = total > 0 ? Math.round((done / total) * 100) : 0;
  const encouragement = ENCOURAGEMENTS[kid.currentStreak % 5];

  return (
    <div className="p-4 space-y-3">
      <PrefetchRoutes routes={[`/kid/${kid.id}/todo`, `/kid/${kid.id}/rewards`, `/play`]} />
      <KidHomeWidgets
        kid={kid}
        theme={{ accent: theme.accent, accentSoft: theme.accentSoft, name: theme.name }}
        done={done}
        total={total}
        allDone={allDone}
        ringOffset={ringOffset}
        taskPct={taskPct}
        incompleteTasks={incompleteTasks}
        todaySchoolTasks={todaySchoolTasks}
        tomorrowActivityTasks={tomorrowActivityTasks}
        badgesInProgress={badgesInProgress}
        customBadgeProgress={customBadgeProgress}
        allKids={allKids}
        weeklyStars={weeklyStars}
        level={{
          emoji: levelDef.emoji,
          name: levelDef.name,
          color: levelDef.color,
          pct: levelPct,
          nextMin: nextLevelDef?.min ?? null,
          nextName: nextLevelDef?.name ?? null,
        }}
        encouragement={encouragement}
      />
    </div>
  );
}
