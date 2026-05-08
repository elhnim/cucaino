import { notFound } from "next/navigation";
import KidShell from "@/components/kid/KidShell";
import { getKid, listTasksForKid, listSchoolClasses } from "@/lib/data/stub";
import WeekGridClient from "@/components/kid/WeekGridClient";

export default async function WeekPage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();

  const [tasks, classes] = await Promise.all([
    listTasksForKid(kid.id),
    listSchoolClasses(kid.id),
  ]);

  return (
    <KidShell kid={kid} active="todo">
      <WeekGridClient kid={kid} tasks={tasks} classes={classes} />
    </KidShell>
  );
}
