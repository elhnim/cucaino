import React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import KidShell from "@/components/kid/KidShell";
import {
  getKid,
  listTasksForKid,
  listCompletionsToday,
  listSchoolClasses,
} from "@/lib/data/stub";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";
import { getTheme } from "@/lib/themes/presets";
import type { DayOfWeek, Task, TaskCompletion, SchoolClass } from "@/lib/domain/types";

const DAY_LABELS: Record<DayOfWeek, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

function targetInfo(task: Task): string | null {
  if (task.target === "time" && task.targetDurationMinutes) {
    return `⏱ ${task.targetDurationMinutes} min`;
  }
  if (task.target === "reps" && task.targetReps) {
    const label = task.targetRepLabel ?? "reps";
    return `✕ ${task.targetReps} ${label}`;
  }
  if (task.target === "checklist" && task.checklistItems) {
    return `☑ ${task.checklistItems.length} items`;
  }
  return null;
}

function TaskCard({
  task,
  completion,
  isPast,
  isFuture,
  accentColor,
}: {
  task: Task;
  completion: TaskCompletion | undefined;
  isPast: boolean;
  isFuture: boolean;
  accentColor: string;
}) {
  const isDone = !!completion;
  const info = targetInfo(task);

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm p-3 flex items-center gap-3 ${isFuture ? "opacity-60" : ""}`}
    >
      <span className="text-3xl shrink-0">{task.icon}</span>

      <div className="flex-1 min-w-0">
        <div className="font-bold text-gray-800 text-sm leading-tight">{task.name}</div>
        {info && (
          <div className="text-xs text-gray-500 mt-0.5">{info}</div>
        )}
        {task.description && (
          <div className="text-xs text-gray-400 mt-0.5 truncate">{task.description}</div>
        )}
        {!isDone && (
          <span className="inline-flex items-center gap-0.5 mt-1 text-xs font-semibold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
            ⭐ {task.points}
          </span>
        )}
      </div>

      <div className="shrink-0 text-2xl">
        {isDone ? (
          <span
            className="flex items-center justify-center w-9 h-9 rounded-full"
            style={{ background: "#dcfce7" }}
          >
            ✅
          </span>
        ) : isPast ? (
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-400 text-xl">
            ○
          </span>
        ) : !isFuture ? (
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-300 text-xl">
            ○
          </span>
        ) : null}
      </div>
    </div>
  );
}

function WeekSummaryBar({
  tasks,
  completions,
  today,
  accentColor,
}: {
  tasks: Task[];
  completions: TaskCompletion[];
  today: DayOfWeek;
  accentColor: string;
}) {
  const days: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="flex justify-around items-center px-4 py-3 bg-white/80 border-t border-gray-100">
      {days.map((d) => {
        const dayTasks = tasksForDay(tasks, d).filter((t) => t.requiresCompletion);
        const total = dayTasks.length;

        let done = 0;
        if (d === today) {
          done = completions.length;
        }

        const ratio = total > 0 ? done / total : 0;
        const isToday = d === today;

        let bgColor = "#e5e7eb";
        if (total === 0) {
          bgColor = "#e5e7eb";
        } else if (ratio >= 1) {
          bgColor = "#f59e0b";
        } else if (ratio > 0) {
          bgColor = "#f97316";
        }

        return (
          <div key={d} className="flex flex-col items-center gap-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isToday ? "ring-2 ring-offset-1" : ""}`}
              style={{
                background: bgColor,
                color: ratio > 0 || total === 0 ? "#fff" : "#9ca3af",
                ...(isToday ? { "--tw-ring-color": accentColor } as React.CSSProperties : {}),
              }}
            >
              {total > 0 ? `${done}/${total}` : "·"}
            </div>
            <span className={`text-[9px] font-bold ${isToday ? "text-gray-800" : "text-gray-400"}`}>
              {DAY_LABELS[d]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default async function TodoPage({
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

  const today = isoWeekday();
  const activeDow = day
    ? (Math.max(1, Math.min(7, parseInt(day))) as DayOfWeek)
    : today;

  const [tasks, completions, classes] = await Promise.all([
    listTasksForKid(kid.id),
    listCompletionsToday(kid.id),
    listSchoolClasses(kid.id),
  ]);

  const theme = getTheme(kid.themeId);
  const isPast = activeDow < today;
  const isFuture = activeDow > today;
  const isToday = activeDow === today;

  const dayTasks = tasksForDay(tasks, activeDow).filter((t) => t.requiresCompletion);

  const todayClasses: SchoolClass[] = classes.filter(
    (c) => c.dayOfWeek === activeDow
  );

  const days: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];

  return (
    <KidShell kid={kid} active="todo">
      <div className="flex flex-col min-h-full">
        {/* Day tab bar */}
        <div className="overflow-x-auto flex gap-2 px-4 py-3 bg-white/80 border-b border-gray-100 scrollbar-hide">
          {days.map((d) => {
            const isActive = d === activeDow;
            const isDayToday = d === today;
            const isPastDay = d < today;

            return (
              <Link
                key={d}
                href={`?day=${d}`}
                className="min-w-[52px] h-[52px] rounded-2xl flex flex-col items-center justify-center text-xs font-bold shrink-0 transition-all relative"
                style={{
                  background: isActive ? theme.accent : "#f3f4f6",
                  color: isActive
                    ? "#fff"
                    : isPastDay
                    ? "#9ca3af"
                    : "#374151",
                }}
              >
                <span>{DAY_LABELS[d]}</span>
                {isDayToday && !isActive && (
                  <span
                    className="absolute bottom-1.5 w-1 h-1 rounded-full"
                    style={{ background: theme.accent }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Main content */}
        <div className="flex-1 px-4 py-4 space-y-4">
          {/* School section for weekdays */}
          {activeDow <= 5 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 px-1">
                📚 School
              </div>
              {todayClasses.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {todayClasses.map((c) => (
                    <span
                      key={c.id}
                      className="px-3 py-1.5 rounded-full text-xs font-bold text-white"
                      style={{ background: theme.accent }}
                    >
                      {c.customLabel ?? c.subject}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-400 italic px-1">School day</div>
              )}
            </div>
          )}

          {/* Tasks section */}
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 px-1">
              Tasks
            </div>

            {dayTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="text-4xl mb-3">🎉</div>
                <div className="text-gray-400 font-semibold">
                  No tasks scheduled for this day
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {dayTasks.map((task) => {
                  const completion = isToday
                    ? completions.find((c) => c.taskId === task.id)
                    : undefined;
                  return (
                    <TaskCard
                      key={task.id}
                      task={task}
                      completion={completion}
                      isPast={isPast}
                      isFuture={isFuture}
                      accentColor={theme.accent}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Week summary bar */}
        <WeekSummaryBar
          tasks={tasks}
          completions={completions}
          today={today}
          accentColor={theme.accent}
        />
      </div>
    </KidShell>
  );
}
