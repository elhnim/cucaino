import { notFound } from "next/navigation";
import {
  getKid,
  getFamily,
  getKidPet,
  listTasksForKid,
  listCompletionsToday,
} from "@/lib/data/stub";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";
import type { InitialGameData } from "@/lib/game3d/types";
// Client component; three.js loads only inside its useEffect, so it SSRs to an empty div.
import KidGameApp from "@/components/game/KidGameApp";

export default async function KidWorldPage({ params }: { params: Promise<{ kidId: string }> }) {
  const { kidId } = await params;

  // Everything that doesn't need the family timezone starts straight away, in parallel.
  const petP = getKidPet(kidId);
  const tasksP = listTasksForKid(kidId);
  // mark as handled so an early notFound() doesn't leave an unhandled rejection behind
  petP.catch(() => {});
  tasksP.catch(() => {});
  const [kid, family] = await Promise.all([getKid(kidId), getFamily()]);
  if (!kid) notFound();
  const tz = family?.timezone ?? "Australia/Sydney";
  const dow = isoWeekday(new Date(), tz);

  const [pet, tasks, completions] = await Promise.all([petP, tasksP, listCompletionsToday(kid.id, tz)]);

  const todayTasks = tasksForDay(tasks.filter((t) => t.rule !== "flexible"), dow).filter(
    (t) => t.requiresCompletion,
  );
  const doneTaskIds = new Set(completions.map((c) => c.taskId));

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
      done: todayTasks.filter((t) => doneTaskIds.has(t.id)).length,
    },
  };

  return <KidGameApp data={data} />;
}
