import React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import KidShell, { KidAvatarMenu } from "@/components/kid/KidShell";
import TodoTaskCard from "@/components/kid/TodoTaskCard";
import AddTaskButton from "@/components/kid/AddTaskButton";
import AllDoneDetector from "@/components/kid/AllDoneDetector";
import {
  getKid,
  listTasksForKid,
  listCompletionsToday,
  listKidDailyAdditions,
} from "@/lib/data/stub";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";
import { getTheme } from "@/lib/themes/presets";
import { SUBJECTS } from "@/lib/registry/subject-registry";
import type { DayOfWeek, Task, TaskCompletion } from "@/lib/domain/types";

const DAY_LABELS: Record<DayOfWeek, string> = {
  1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun",
};

function Section({
  label,
  children,
  isEmpty,
  emptyText,
  headerRight,
}: {
  label: string;
  children?: React.ReactNode;
  isEmpty?: boolean;
  emptyText?: string;
  headerRight?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</div>
        {headerRight}
      </div>
      {isEmpty ? (
        <div className="text-xs text-gray-400 italic px-1">{emptyText}</div>
      ) : (
        children
      )}
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

  const todayStr = new Date().toISOString().slice(0, 10);

  const [tasks, completions, addedTaskIds] = await Promise.all([
    listTasksForKid(kid.id),
    listCompletionsToday(kid.id),
    listKidDailyAdditions(kid.id, todayStr),
  ]);

  const theme = getTheme(kid.themeId);
  const isPast = activeDow < today;
  const isFuture = activeDow > today;
  const isToday = activeDow === today;
  const isWeekday = activeDow <= 5;

  const scheduledTasks = tasksForDay(
    tasks.filter((t) => t.rule !== "flexible"),
    activeDow,
  );

  const addedTasks: Task[] = isToday
    ? addedTaskIds.map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as Task[]
    : [];

  const dayTasks = [...scheduledTasks, ...addedTasks].filter((t) => t.requiresCompletion);
  const beforeSchoolTasks = dayTasks.filter((t) => t.timeBlock === "before_school");
  const afterSchoolTasks = dayTasks.filter((t) => t.timeBlock !== "before_school");

  const schoolSubjectTasks = tasksForDay(
    tasks.filter((t) => t.category === "school_subject"),
    activeDow,
  );

  const addedSet = new Set(addedTaskIds);
  const selfAddableTasks = tasks.filter(
    (t) => t.rule === "flexible" && t.kidCanAdd && !addedSet.has(t.id),
  );

  const getCompletion = (taskId: string) =>
    isToday ? completions.find((c) => c.taskId === taskId) : undefined;
  const getCompletionCount = (taskId: string) =>
    isToday ? completions.filter((c) => c.taskId === taskId).length : 0;

  const days: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];

  // Compute week dates (Mon–Sun of current week)
  const now = new Date();
  const weekDates: Record<DayOfWeek, number> = {} as Record<DayOfWeek, number>;
  for (let d = 1; d <= 7; d++) {
    const dt = new Date(now);
    dt.setDate(now.getDate() - (today - d));
    weekDates[d as DayOfWeek] = dt.getDate();
  }

  // Monday date for "Week of" label
  const mondayDate = new Date(now);
  mondayDate.setDate(now.getDate() - (today - 1));
  const weekLabel = mondayDate.toLocaleDateString(undefined, { day: "numeric", month: "long" });

  // Dot color per day
  const getDotColor = (d: DayOfWeek) => {
    if (d === today) {
      const total = dayTasks.length;
      if (total === 0) return "rgba(255,255,255,0.2)";
      const ratio = completions.length / total;
      if (ratio >= 1) return "#86efac";
      if (ratio > 0) return "#fde047";
      return "rgba(255,255,255,0.2)";
    }
    if (d < today) return "#86efac"; // simplified: assume past days done
    return "rgba(255,255,255,0.2)";
  };

  const scheduleHeader = (
    <div
      className={`bg-gradient-to-br ${theme.headerGradient} flex-shrink-0`}
      style={{ paddingTop: 36, paddingLeft: 20, paddingRight: 20, paddingBottom: 14 }}
    >
      {/* Title row */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[22px] font-black text-white">Schedule 📅</div>
          <div className="text-xs font-semibold text-white/75">Week of {weekLabel} · {kid.name}</div>
        </div>
        <KidAvatarMenu kid={kid} accent={theme.accent} />
      </div>

      {/* Week day strip */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
        {days.map((d) => {
          const isActive = d === activeDow;
          const dotColor = getDotColor(d);
          return (
            <Link
              key={d}
              href={`?day=${d}`}
              className="flex flex-col items-center justify-center gap-0.5 flex-shrink-0 rounded-2xl transition-all"
              style={{
                minWidth: 44,
                height: 60,
                background: isActive ? "white" : "rgba(255,255,255,0.15)",
              }}
            >
              <span
                className="text-[9px] font-bold uppercase tracking-widest"
                style={{ color: isActive ? theme.accent : "rgba(255,255,255,0.8)" }}
              >
                {DAY_LABELS[d]}
              </span>
              <span
                className="text-base font-black"
                style={{ color: isActive ? theme.accent : "white" }}
              >
                {weekDates[d]}
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: isActive ? dotColor : dotColor }}
              />
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <KidShell kid={kid} active="todo" customHeader={scheduleHeader}>
      <div className="flex flex-col min-h-full">

        {/* State banner for past/future */}
        {isPast && (
          <div className="mx-4 mt-3 bg-gray-100 rounded-xl px-4 py-2 text-xs text-gray-500 font-semibold text-center">
            Past day — read only
          </div>
        )}
        {isFuture && (
          <div className="mx-4 mt-3 bg-blue-50 rounded-xl px-4 py-2 text-xs text-blue-700 font-semibold text-center">
            Coming up — plan ahead, tasks unlock on the day 📅
          </div>
        )}

        {/* Sections */}
        <div className="flex-1 px-4 py-4 space-y-5">

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
                    initialCompletionCount={getCompletionCount(task.id)}
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

          {/* School — weekdays only, read-only pills */}
          {isWeekday && (
            <Section
              label="📚 School"
              isEmpty={schoolSubjectTasks.length === 0}
              emptyText="No subjects added"
              headerRight={
                <Link
                  href={`/kid/${kid.id}/timetable`}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-full border-[1.5px]"
                  style={{ color: theme.accent, background: theme.accentSoft, borderColor: theme.accent + "66" }}
                >
                  ✏️ Edit timetable
                </Link>
              }
            >
              <div className="flex flex-wrap gap-2">
                {schoolSubjectTasks.map((t) => {
                  const subj = t.subject && t.subject in SUBJECTS ? SUBJECTS[t.subject as keyof typeof SUBJECTS] : null;
                  return (
                    <span
                      key={t.id}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-white ${subj ? subj.bgClass : ""}`}
                      style={!subj ? { background: theme.accent } : undefined}
                    >
                      {subj?.icon} {t.customLabel ?? subj?.label ?? t.name}
                    </span>
                  );
                })}
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

          {/* Add a task */}
          {selfAddableTasks.length > 0 && (
            <div className="pt-1">
              <AddTaskButton
                kidId={kid.id}
                availableTasks={selfAddableTasks}
                accentColor={theme.accent}
              />
            </div>
          )}
        </div>

        {/* Week summary bar */}
        <div className="flex justify-around items-center px-4 py-2.5 bg-white/80 border-t border-gray-100">
          {days.map((d) => {
            const dayTasksForD = tasksForDay(tasks, d).filter((t) => t.requiresCompletion);
            const total = dayTasksForD.length;
            const done = d === today ? completions.length : 0;
            const ratio = total > 0 ? done / total : 0;
            const isActive = d === activeDow;
            const bgColor = total === 0 ? "#e5e7eb" : ratio >= 1 ? "#22c55e" : ratio > 0 ? "#f59e0b" : "#e5e7eb";
            return (
              <Link key={d} href={`?day=${d}`} className="flex flex-col items-center gap-1">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{
                    background: bgColor,
                    color: ratio > 0 || total === 0 ? "#fff" : "#9ca3af",
                    boxShadow: isActive ? `0 0 0 3px ${theme.accent}44` : "none",
                  }}
                >
                  {total > 0 ? `${done}/${total}` : "·"}
                </div>
                <span
                  className="text-[9px] font-bold uppercase tracking-wider"
                  style={{ color: isActive ? theme.accent : "#9ca3af" }}
                >
                  {DAY_LABELS[d]}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {isToday && (
        <AllDoneDetector
          kidId={kid.id}
          kidName={kid.name}
          kidAvatar={kid.avatar}
          streak={kid.currentStreak}
          total={dayTasks.length}
          initialDone={completions.length}
        />
      )}
    </KidShell>
  );
}
