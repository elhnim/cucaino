import { notFound } from "next/navigation";
import {
  getKid,
  getFamily,
  getKidPet,
  listTasksForKid,
  listCompletionsToday,
} from "@/lib/data/stub";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";
import type { InitialGameData } from "@/lib/game/types";
// Client component; Phaser loads only inside its useEffect, so it SSRs to an empty div.
import KidGameApp from "@/components/game/KidGameApp";

export default async function KidWorldPage({
  params,
  searchParams,
}: {
  params: Promise<{ kidId: string }>;
  searchParams: Promise<{ scene?: string }>;
}) {
  const { kidId } = await params;
  const { scene } = await searchParams;

  const kid = await getKid(kidId);
  if (!kid) notFound();

  const family = await getFamily();
  const tz = family?.timezone ?? "Australia/Sydney";
  const dow = isoWeekday(new Date(), tz);

  const [pet, tasks, completions] = await Promise.all([
    getKidPet(kid.id),
    listTasksForKid(kid.id),
    listCompletionsToday(kid.id, tz),
  ]);

  const todayTasks = tasksForDay(tasks.filter((t) => t.rule !== "flexible"), dow).filter(
    (t) => t.requiresCompletion,
  );
  const doneCounts = new Map<string, number>();
  for (const c of completions) doneCounts.set(c.taskId, (doneCounts.get(c.taskId) ?? 0) + 1);

  const taskList = todayTasks.map((t) => {
    const isTimer =
      (t.target === "time" && !!t.targetDurationMinutes) || t.requiresTimer || t.musicEnabled;
    // Frequency takes precedence (simple +1, like the web FrequencyCard); otherwise
    // pick the mechanic from the task's target.
    const mechanic: import("@/lib/game/types").TaskMechanic =
      t.frequencyPerDay > 1
        ? "tap"
        : t.target === "checklist" && t.checklistItems?.length
          ? "checklist"
          : t.target === "reps" && t.targetReps
            ? "reps"
            : isTimer
              ? "timer"
              : "tap";
    const doneCount = doneCounts.get(t.id) ?? 0;
    return {
      id: t.id,
      name: t.name,
      icon: t.icon,
      points: t.points,
      familyPoints: t.familyPointsContribution,
      category: t.category,
      cashValueCents: t.cashValueCents,
      requiresApproval: t.requiresParentApproval,
      done: t.frequencyPerDay > 1 ? doneCount >= t.frequencyPerDay : doneCount > 0,
      mechanic,
      timerMinutes: t.target === "time" ? t.targetDurationMinutes : t.requiresTimer || t.musicEnabled ? (t.durationMinutes ?? null) : null,
      reps: t.targetReps,
      repLabel: t.targetRepLabel,
      checklist: t.checklistItems,
      music: t.musicEnabled,
      bpm: t.defaultBpm,
      timeSignature: t.defaultTimeSignature,
      frequencyPerDay: t.frequencyPerDay,
      doneCount,
    };
  });
  const validScenes = ["pet", "work", "shop", "play", "friends"];

  const data: InitialGameData = {
    kid: {
      id: kid.id,
      name: kid.name,
      pointsBalance: kid.pointsBalance,
      avatar: kid.avatar,
      themeId: kid.themeId,
    },
    pet,
    tasksToday: {
      total: todayTasks.length,
      done: taskList.filter((t) => t.done).length,
    },
    tasks: taskList,
    startScene: scene && validScenes.includes(scene) ? scene : "world",
  };

  return <KidGameApp data={data} />;
}
