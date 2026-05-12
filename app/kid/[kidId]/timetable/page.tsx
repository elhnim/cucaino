import { notFound } from "next/navigation";
import KidShell from "@/components/kid/KidShell";
import TimetableEditor from "@/components/kid/TimetableEditor";
import { getKid, listTasksForKid } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";
import type { DayOfWeek } from "@/lib/domain/types";

export default async function TimetablePage({
  params,
  searchParams,
}: {
  params: Promise<{ kidId: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { kidId } = await params;
  const { day } = await searchParams;
  const kid = await getKid(kidId);
  if (!kid) notFound();
  const theme = getTheme(kid.themeId);
  const allTasks = await listTasksForKid(kid.id);
  const schoolTasks = allTasks.filter((t) => t.category === "school_subject");

  const initialDay = day
    ? (Math.max(1, Math.min(7, parseInt(day))) as DayOfWeek)
    : 1;

  return (
    <KidShell kid={kid} active="home">
      <div className="p-4 md:p-6">
        <TimetableEditor
          kidId={kid.id}
          accent={theme.accent}
          initialTasks={schoolTasks}
          initialDay={initialDay}
        />
      </div>
    </KidShell>
  );
}
