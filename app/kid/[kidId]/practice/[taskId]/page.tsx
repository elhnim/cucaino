import { notFound } from "next/navigation";
import Link from "next/link";
import Metronome from "@/components/kid/Metronome";
import PracticeTimer from "@/components/kid/PracticeTimer";
import { getKid, listTasksForKid } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";

export default async function PracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ kidId: string; taskId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { kidId, taskId } = await params;
  const { from = "todo" } = await searchParams;
  const kid = await getKid(kidId);
  if (!kid) notFound();

  const tasks = await listTasksForKid(kid.id);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) notFound();

  const theme = getTheme(kid.themeId);
  const duration = task.durationMinutes ?? 15;
  const isMusic = task.category === "music";
  const isPiano = isMusic && /piano|keyboard/i.test(task.name);
  const backHref = from === "home" ? `/kid/${kid.id}/home` : `/kid/${kid.id}/todo`;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Link
            href={backHref}
            className="text-sm bg-white/70 hover:bg-white px-3 py-1.5 rounded-full shadow"
          >
            ← Schedule
          </Link>
          {isMusic && !isPiano ? (
            <Link
              href={`/kid/${kid.id}/tuner?taskId=${task.id}`}
              className="text-sm font-bold text-white px-3 py-1.5 rounded-full shadow"
              style={{ background: theme.accent }}
            >
              🎵 Tuner →
            </Link>
          ) : null}
        </div>

        <header className="bg-white rounded-3xl shadow-xl p-5 mb-4 flex items-center gap-4">
          <div className="text-5xl">{task.icon}</div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-black truncate">
              {task.name}
            </h1>
            <p className="text-sm text-gray-600">
              {duration} min · +{task.points} ⭐
              {task.familyPointsContribution > 0
                ? ` · +${task.familyPointsContribution} family`
                : ""}
            </p>
          </div>
        </header>

        <div className={`grid gap-4 ${isMusic ? "md:grid-cols-2" : ""}`}>
          <PracticeTimer
            durationMinutes={duration}
            accent={theme.accent}
            storageKey={`cucaino-timer:${kid.id}:${task.id}`}
          />

          {isMusic ? (
            <Metronome
              initialBpm={task.defaultBpm ?? 80}
              initialBeatsPerMeasure={parseTimeSig(task.defaultTimeSignature)}
              accent={theme.accent}
            />
          ) : null}
        </div>

        {isMusic ? (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-3 mt-4 text-sm text-blue-900">
            {isPiano
              ? "💡 Warm up with scales or arpeggios before running the timer."
              : "💡 Tune up first with the tuner above, then run the metronome alongside the timer."}
          </div>
        ) : null}
      </div>
  );
}

function parseTimeSig(sig: string | null): number {
  if (!sig) return 4;
  const match = sig.match(/^(\d+)\/(\d+)$/);
  if (!match) return 4;
  return parseInt(match[1], 10);
}
