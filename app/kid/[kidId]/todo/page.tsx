import React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import KidShell from "@/components/kid/KidShell";
import TodoTaskCard from "@/components/kid/TodoTaskCard";
import AddPersonalTaskModal from "@/components/kid/AddPersonalTaskModal";
import {
  getKid,
  listTasksForKid,
  listCompletionsToday,
  listSchoolClasses,
  listKidAddableTasks,
} from "@/lib/data/stub";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";
import { getTheme } from "@/lib/themes/presets";
import type { DayOfWeek, Task, TaskCompletion, SchoolClass } from "@/lib/domain/types";

const DAY_LABELS: Record<DayOfWeek, string> = {
  1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun",
};

function Section({
  label,
  children,
  isEmpty,
  emptyText,
}: {
  label: string;
  children: React.ReactNode;
  isEmpty?: boolean;
  emptyText?: string;
}) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 px-1">
        {label}
      </div>
      {isEmpty ? (
        <div className="text-xs text-gray-400 italic px-1">{emptyText}</div>
      ) : (
        children
      )}
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
        const done = d === today ? completions.length : 0;
        const ratio = total > 0 ? done / total : 0;
        const isToday = d === today;
        const bgColor = total === 0 ? "#e5e7eb" : ratio >= 1 ? "#f59e0b" : ratio > 0 ? "#f97316" : "#e5e7eb";

        return (
          <Link key={d} href={`?day=${d}`} className="flex flex-col items-center gap-1">
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
          </Link>
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

  const [tasks, completions, classes, addableTasks] = await Promise.all([
    listTasksForKid(kid.id),
    listCompletionsToday(kid.id),
    listSchoolClasses(kid.id),
    listKidAddableTasks(),
  ]);

  const theme = getTheme(kid.themeId);
  const isPast = activeDow < today;
  const isFuture = activeDow > today;
  const isToday = activeDow === today;
  const isWeekday = activeDow <= 5;

  const dayTasks = tasksForDay(tasks, activeDow).filter((t) => t.requiresCompletion);
  const beforeSchoolTasks = dayTasks.filter((t) => t.timeBlock === "before_school");
  const afterSchoolTasks = dayTasks.filter((t) => t.timeBlock !== "before_school");
  const todayClasses: SchoolClass[] = classes.filter((c) => c.dayOfWeek === activeDow);

  const getCompletion = (taskId: string) =>
    isToday ? completions.find((c) => c.taskId === taskId) : undefined;

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
                  color: isActive ? "#fff" : isPastDay ? "#9ca3af" : "#374151",
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

        {/* State banner for past/future */}
        {isPast && (
          <div className="mx-4 mt-3 bg-gray-100 rounded-xl px-4 py-2 text-xs text-gray-500 font-semibold text-center">
            Past day — read only
          </div>
        )}
        {isFuture && (
          <div className="mx-4 mt-3 bg-blue-50 rounded-xl px-4 py-2 text-xs text-blue-600 font-semibold text-center">
            Future day — tasks are waiting for you
          </div>
        )}

        {/* Sections */}
        <div className="flex-1 px-4 py-4 space-y-6">

          {/* Before school — weekdays only */}
          {isWeekday && (
            <Section
              label="🌅 Before school"
              isEmpty={beforeSchoolTasks.length === 0}
              emptyText="Nothing before school"
            >
              <div className="space-y-2">
                {beforeSchoolTasks.map((task) => (
                  <TodoTaskCard
                    key={task.id}
                    task={task}
                    initialCompletion={getCompletion(task.id)}
                    isToday={isToday}
                    isPast={isPast}
                    isFuture={isFuture}
                    kidId={kid.id}
                    accentColor={theme.accent}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* School — weekdays only, read-only */}
          {isWeekday && (
            <Section
              label="📚 School"
              isEmpty={todayClasses.length === 0}
              emptyText="School day"
            >
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
            </Section>
          )}

          {/* After school / general tasks */}
          <Section
            label={isWeekday ? "🏠 After school" : "📋 Tasks"}
            isEmpty={afterSchoolTasks.length === 0}
            emptyText="Nothing here — enjoy your day! 🎉"
          >
            <div className="space-y-2">
              {afterSchoolTasks.map((task) => (
                <TodoTaskCard
                  key={task.id}
                  task={task}
                  initialCompletion={getCompletion(task.id)}
                  isToday={isToday}
                  isPast={isPast}
                  isFuture={isFuture}
                  kidId={kid.id}
                  accentColor={theme.accent}
                />
              ))}
            </div>
          </Section>

          {/* Add a task — today and future only */}
          {!isPast && (
            <div className="pt-2">
              <AddPersonalTaskModal
                kidId={kid.id}
                accent={theme.accent}
                addableTasks={addableTasks}
              />
            </div>
          )}
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
