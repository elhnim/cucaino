import { notFound } from "next/navigation";
import Link from "next/link";
import KidShell from "@/components/kid/KidShell";
import {
  getKid,
  getFamily,
  listTasksForKid,
  listCompletionsToday,
  listSchoolClasses,
} from "@/lib/data/stub";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";
import { getTheme } from "@/lib/themes/presets";
import type { DayOfWeek } from "@/lib/domain/types";

const LEVELS = [
  { min: 0,    max: 99,       emoji: "🌱", name: "Seedling",  color: "#16a34a" },
  { min: 100,  max: 299,      emoji: "🗺️", name: "Explorer",  color: "#2563eb" },
  { min: 300,  max: 599,      emoji: "🏅", name: "Champion",  color: "#d97706" },
  { min: 600,  max: 999,      emoji: "🌟", name: "Legend",    color: "#7c3aed" },
  { min: 1000, max: Infinity, emoji: "🚀", name: "Superstar", color: "#dc2626" },
];

function getLevel(stars: number) {
  return LEVELS.find((l) => stars >= l.min && stars <= l.max) ?? LEVELS[0];
}

function getLevelProgress(stars: number) {
  const idx = LEVELS.findIndex((l) => stars >= l.min && stars <= l.max);
  const level = LEVELS[idx];
  if (idx === LEVELS.length - 1) return { pct: 1, next: null };
  const next = LEVELS[idx + 1];
  const pct = (stars - level.min) / (next.min - level.min);
  return { pct: Math.min(1, pct), next };
}

const ENCOURAGEMENTS = [
  "Every day counts! 🌟",
  "You're on a roll! 🔥",
  "Amazing effort! 💪",
  "Nothing can stop you! 🚀",
  "Legend in the making! 🏆",
];

const CIRCUMFERENCE = 2 * Math.PI * 20; // radius=20 → ~125.66

export default async function KidHomePage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();

  const now = new Date();
  const dow = isoWeekday(now);

  const [tasks, completions, allClasses] = await Promise.all([
    listTasksForKid(kid.id),
    listCompletionsToday(kid.id),
    dow <= 5 ? listSchoolClasses(kid.id) : Promise.resolve([]),
  ]);

  const todayTasks = tasksForDay(tasks, dow);
  const completableTasks = todayTasks.filter((t) => t.requiresCompletion);
  const completedIds = new Set(completions.map((c) => c.taskId));
  const done = completableTasks.filter((t) => completedIds.has(t.id)).length;
  const total = completableTasks.length;

  const todayClasses = allClasses.filter((c) => c.dayOfWeek === (dow as DayOfWeek));

  const theme = getTheme(kid.themeId);
  const level = getLevel(kid.totalStarsEarned);
  const { pct: levelPct, next: nextLevel } = getLevelProgress(kid.totalStarsEarned);
  const ringOffset = CIRCUMFERENCE * (1 - (total > 0 ? done / total : 0));
  const taskPct = total > 0 ? Math.round((done / total) * 100) : 0;
  const encouragement = ENCOURAGEMENTS[kid.currentStreak % 5];

  return (
    <KidShell kid={kid} active="home">
      <div className="p-4 space-y-4">

        {/* 1. Level badge strip */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold"
              style={{
                background: level.color + "26",
                color: level.color,
              }}
            >
              {level.emoji} {level.name}
            </span>
          </div>
          <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.round(levelPct * 100)}%`, background: level.color }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            {nextLevel
              ? `${nextLevel.min - kid.totalStarsEarned} more ⭐ to ${nextLevel.name}`
              : "Maximum level! 🎉"}
          </p>
        </div>

        {/* 2. Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center justify-center gap-1">
            <span className="text-2xl font-black">⭐ {kid.pointsBalance}</span>
            <span className="text-[10px] font-bold text-gray-400 tracking-widest">STARS</span>
          </div>

          <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center justify-center gap-1">
            <span className="text-2xl font-black">🔥 {kid.currentStreak}d</span>
            <span className="text-[10px] font-bold text-gray-400 tracking-widest">STREAK</span>
          </div>

          <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center justify-center gap-1">
            <svg width={52} height={52} viewBox="0 0 52 52">
              <circle cx={26} cy={26} r={20} fill="none" stroke="#e5e7eb" strokeWidth={5} />
              {total > 0 && (
                <circle
                  cx={26}
                  cy={26}
                  r={20}
                  fill="none"
                  stroke={theme.accent}
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={ringOffset}
                  transform="rotate(-90 26 26)"
                />
              )}
              <text
                x={26}
                y={30}
                textAnchor="middle"
                fontSize={11}
                fontWeight="bold"
                fill={total > 0 ? theme.accent : "#9ca3af"}
              >
                {total > 0 ? `${done}/${total}` : "—"}
              </text>
            </svg>
            <span className="text-[10px] font-bold text-gray-400 tracking-widest">TASKS</span>
          </div>
        </div>

        {/* 3. School today (weekdays only, when classes exist) */}
        {dow <= 5 && todayClasses.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="font-bold text-gray-700 mb-3">📚 School today</h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {todayClasses.map((cls) => (
                <span
                  key={cls.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap bg-blue-50 text-blue-700"
                >
                  📖 {(cls.customLabel ?? cls.subject).charAt(0).toUpperCase() +
                    (cls.customLabel ?? cls.subject).slice(1)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 4. Task CTA card */}
        <div
          className="rounded-2xl p-4 shadow-sm"
          style={{
            background: theme.accentSoft,
            border: `2px solid ${theme.accent}`,
          }}
        >
          <h2 className="font-bold text-gray-800 mb-1">Your tasks today</h2>
          <p className="text-sm text-gray-600 mb-3">
            {total > 0 ? `${done} of ${total} tasks done` : "No tasks scheduled today"}
          </p>
          {total > 0 && (
            <div className="bg-white/60 rounded-full h-2.5 mb-4 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${taskPct}%`, background: theme.accent }}
              />
            </div>
          )}
          <Link
            href={`/kid/${kid.id}/todo`}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-white text-sm"
            style={{ background: theme.accent }}
          >
            Jump in →
          </Link>
        </div>

        {/* 5. Encouragement */}
        <div className="bg-white/60 rounded-2xl px-4 py-3 text-center text-sm text-gray-500 font-medium">
          {encouragement}
        </div>

      </div>
    </KidShell>
  );
}
