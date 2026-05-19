import { notFound } from "next/navigation";
import KidShell from "@/components/kid/KidShell";
import { getKid, listTasksForKid, listCompletionsToday, listBadgeProgress, getFamily } from "@/lib/data/stub";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";
import { KidOnboardingWrapper } from "@/components/onboarding/KidOnboardingWrapper";

export default async function KidLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();

  const family = await getFamily();
  const tz = family?.timezone ?? "Australia/Sydney";
  const dow = isoWeekday(new Date(), tz);

  const [tasks, completions, badges] = await Promise.all([
    listTasksForKid(kid.id),
    listCompletionsToday(kid.id, tz),
    listBadgeProgress(kid.id),
  ]);

  const todayTasks = tasksForDay(tasks, dow);
  const completableTasks = todayTasks.filter((t) => t.requiresCompletion);
  const completedIds = new Set(completions.map((c) => c.taskId));
  const done = completableTasks.filter((t) => completedIds.has(t.id)).length;
  const total = completableTasks.length;

  const familyGoal = family
    ? { name: family.name, emoji: "⭐", current: family.familyPointsBalance, target: 2000 }
    : undefined;

  return (
    <KidShell
      kid={kid}
      todayProgress={total > 0 ? { done, total } : undefined}
      badges={badges}
      familyGoal={familyGoal}
      weatherLocation={
        family?.weatherLat != null && family?.weatherLon != null
          ? { lat: family.weatherLat, lon: family.weatherLon }
          : undefined
      }
    >
      <KidOnboardingWrapper
        tourSeen={kid.tourSeen}
        kidId={kid.id}
        kidName={kid.name}
        kidAvatar={kid.avatar}
        themeId={kid.themeId}
      >
        {children}
      </KidOnboardingWrapper>
    </KidShell>
  );
}
