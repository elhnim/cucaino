import { notFound } from "next/navigation";
import KidShell from "@/components/kid/KidShell";
import TimelineView from "@/components/kid/TimelineView";
import SchoolTodaySection from "@/components/kid/sections/SchoolTodaySection";
import {
  getKid,
  getFamily,
  listTasksForKid,
  listCompletionsToday,
  listSchoolItemsForDay,
  listSchoolClasses,
  listKidAddableTasks,
} from "@/lib/data/stub";
import {
  buildTodaySections,
  isoWeekday,
  tomorrowDayName,
} from "@/lib/domain/schedule";
import { getTheme } from "@/lib/themes/presets";

export default async function TodayPage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();

  const now = new Date();
  const dow = isoWeekday(now);
  const tomorrowDow = ((dow % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;

  const [family, tasks, completions, tomorrowItems, todayClasses, addableTasks] = await Promise.all([
    getFamily(),
    listTasksForKid(kid.id),
    listCompletionsToday(kid.id),
    listSchoolItemsForDay(kid.id, tomorrowDow),
    dow <= 5 ? listSchoolClasses(kid.id) : Promise.resolve([]),
    listKidAddableTasks(),
  ]);
  const todaySchoolClasses = todayClasses.filter((c) => c.dayOfWeek === dow);
  const familyGoalCurrent = family?.familyPointsBalance ?? 0;

  const sections = buildTodaySections({
    tasks,
    completions,
    tomorrowItems,
    tomorrowDayName: tomorrowDayName(now),
    now,
  });

  const theme = getTheme(kid.themeId);

  return (
    <KidShell
      kid={kid}
      active="home"
      familyGoal={{
        name: "Movie night",
        emoji: "🎬",
        current: familyGoalCurrent,
        target: 400,
      }}
    >
      <div className="p-4 md:p-5">
        <SchoolTodaySection kidId={kid.id} classes={todaySchoolClasses} />
      </div>
      <TimelineView
        sections={sections}
        completions={completions}
        accent={theme.accent}
        kidId={kid.id}
        addableTasks={addableTasks}
      />
    </KidShell>
  );
}
