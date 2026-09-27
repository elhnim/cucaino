import { notFound } from "next/navigation";
import { getKid, getFamily, getKidPet, listTasksForKid, listCompletionsToday } from "@/lib/data/stub";
import { isoWeekday } from "@/lib/domain/schedule";
import { questsToday } from "@/lib/park/questsToday";
import type { ParkInitialData } from "@/lib/park/types";
// Client component; three.js only loads inside its effect, so this SSRs to the loading screen.
import ParkApp from "@/components/park/ParkApp";

export default async function ParkPage({ params }: { params: Promise<{ kidId: string }> }) {
  const { kidId } = await params;

  // everything that doesn't need the family timezone starts straight away, in parallel
  const petP = getKidPet(kidId);
  const tasksP = listTasksForKid(kidId);
  petP.catch(() => {});
  tasksP.catch(() => {});
  const [kid, family] = await Promise.all([getKid(kidId), getFamily()]);
  if (!kid) notFound();
  const tz = family?.timezone ?? "Australia/Sydney";
  const dow = isoWeekday(new Date(), tz);
  const [pet, tasks, completions] = await Promise.all([petP, tasksP, listCompletionsToday(kid.id, tz)]);


  const data: ParkInitialData = {
    kid: {
      id: kid.id,
      name: kid.name,
      avatar: kid.avatar,
      themeId: kid.themeId,
      pointsBalance: kid.pointsBalance,
      currentStreak: kid.currentStreak,
      tourSeen: kid.tourSeen,
    },
    pet,
    tasksToday: questsToday(tasks, completions, dow),
  };

  return <ParkApp data={data} />;
}
