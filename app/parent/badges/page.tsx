import { listCustomBadges, listTasksForFamily, listKids } from "@/lib/data/stub";
import BadgesClient from "./BadgesClient";

export default async function ParentBadgesPage() {
  const [badges, tasks, kids] = await Promise.all([
    listCustomBadges(),
    listTasksForFamily(),
    listKids(),
  ]);
  return <BadgesClient badges={badges} tasks={tasks} kids={kids} />;
}
