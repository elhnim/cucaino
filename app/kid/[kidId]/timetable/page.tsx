import { notFound } from "next/navigation";
import KidShell from "@/components/kid/KidShell";
import TimetableEditor from "@/components/kid/TimetableEditor";
import { getKid, listTasksForKid } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";

export default async function TimetablePage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();
  const theme = getTheme(kid.themeId);
  const allTasks = await listTasksForKid(kid.id);
  const schoolTasks = allTasks.filter((t) => t.category === "school_subject");

  return (
    <KidShell kid={kid} active="home">
      <div className="p-4 md:p-6">
        <TimetableEditor kidId={kid.id} accent={theme.accent} initialTasks={schoolTasks} />
      </div>
    </KidShell>
  );
}
