import React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import TodoTaskCard from "@/components/kid/TodoTaskCard";
import AddTaskButton from "@/components/kid/AddTaskButton";
import PrefetchDays from "@/components/kid/PrefetchDays";
import AllDoneDetector from "@/components/kid/AllDoneDetector";
import {
  getKid,
  getFamily,
  listTasksForKid,
  listCompletionsToday,
  listKidDailyAdditions,
  localDateString,
} from "@/lib/data/stub";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";
import { getTheme } from "@/lib/themes/presets";
import { SUBJECTS } from "@/lib/registry/subject-registry";
import type { DayOfWeek, Task } from "@/lib/domain/types";

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

  const family = await getFamily();
  const tz = family?.timezone ?? "Australia/Sydney";
  const today = isoWeekday(new Date(), tz);
  const activeDow = day
    ? (Math.max(1, Math.min(7, parseInt(day))) as DayOfWeek)
    : today;

  const todayStr = localDateString(tz);

  // Compute the ISO date string for the active day within the current week
  const activeDateStr = (() => {
    const todayDate = new Date(todayStr + "T12:00:00");
    todayDate.setDate(todayDate.getDate() - (today - activeDow));
    return todayDate.toISOString().slice(0, 10);
  })();

  const [tasks, completions, addedTasks] = await Promise.all([
    listTasksForKid(kid.id),
    listCompletionsToday(kid.id, tz),
    listKidDailyAdditions(kid.id, activeDateStr),
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

  const todayAddedTasks: Task[] = (isToday || isFuture) ? addedTasks : [];

  const dayTasks = [...scheduledTasks, ...todayAddedTasks].filter((t) => t.requiresCompletion);
  const beforeSchoolTasks = dayTasks.filter((t) => t.timeBlock === "before_school");
  const afterSchoolTasks = dayTasks.filter((t) => t.timeBlock !== "before_school");

  const schoolSubjectTasks = tasksForDay(
    tasks.filter((t) => t.category === "school_subject"),
    activeDow,
  );

  const addedSet = new Set(addedTasks.map((t) => t.id));
  const selfAddableTasks = tasks.filter((t) => t.rule === "flexible");

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

  const weekStrip = (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
      {days.map((d) => {
        const isActive = d === activeDow;
        const dayTasksForD = tasksForDay(tasks, d).filter((t) => t.requiresCompletion);
        const total = dayTasksForD.length;
        const done = d === today ? completions.length : 0;
        const allDone = total > 0 && done >= total;
        return (
          <Link
            key={d}
            href={`?day=${d}`}
            className="flex flex-col items-center justify-center gap-0.5 flex-shrink-0 rounded-2xl transition-all"
            style={{
              minWidth: 44,
              height: d === today ? 68 : 60,
              background: isActive ? theme.accent : "#f3f4f6",
            }}
          >
            <span
              className="text-[9px] font-bold uppercase tracking-widest"
              style={{ color: isActive ? "rgba(255,255,255,0.85)" : "#9ca3af" }}
            >
              {DAY_LABELS[d]}
            </span>
            <span
              className="text-base font-black"
              style={{ color: isActive ? "white" : "#1f2937" }}
            >
              {weekDates[d]}
            </span>
            <span
              className="text-[9px] font-black leading-none"
              style={{
                color: isActive
                  ? "rgba(255,255,255,0.9)"
                  : allDone
                  ? "#16a34a"
                  : total === 0
                  ? "#d1d5db"
                  : "#6b7280",
              }}
            >
              {total === 0 ? "·" : `${done}/${total}`}
            </span>
            {d === today && (
              <span
                className="text-[7px] font-black uppercase tracking-widest leading-none mt-0.5"
                style={{ color: isActive ? "rgba(255,255,255,0.9)" : theme.accent }}
              >
                today
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">

        {/* Sections */}
        <div className="flex-1 px-4 py-4 space-y-5">
          <PrefetchDays activeDow={activeDow} />

          {/* Weekday strip — in-page */}
          {weekStrip}

          {/* State banner for past/future */}
          {isPast && (
            <div className="bg-gray-100 rounded-xl px-4 py-2 text-xs text-gray-500 font-semibold text-center">
              Past day — read only
            </div>
          )}

          {/* Add a task — today and future days */}
          {(isToday || isFuture) && selfAddableTasks.length > 0 && (
            <AddTaskButton
              kidId={kid.id}
              availableTasks={selfAddableTasks}
              accentColor={theme.accent}
              date={activeDateStr}
              dayLabel={isToday ? "today" : DAY_LABELS[activeDow]}
            />
          )}

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
                    themeDecoration={theme.decoration}
                    initiallyPending={completions.some(
                      (c) => c.taskId === task.id && c.pendingParentApproval,
                    )}
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
                  href={`/kid/${kid.id}/timetable?day=${activeDow}`}
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
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold ${subj ? `${subj.bgClass} ${subj.textClass}` : "text-white"}`}
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
            headerRight={
              !isWeekday ? (
                <Link
                  href={`/kid/${kid.id}/timetable?day=${activeDow}`}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-full border-[1.5px]"
                  style={{ color: theme.accent, background: theme.accentSoft, borderColor: theme.accent + "66" }}
                >
                  ✏️ Edit timetable
                </Link>
              ) : undefined
            }
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
                  themeDecoration={theme.decoration}
                  initiallyPending={completions.some(
                    (c) => c.taskId === task.id && c.pendingParentApproval,
                  )}
                />
              ))}
            </div>
          </Section>

        </div>

      {isToday && (
        <AllDoneDetector
          kidId={kid.id}
          kidName={kid.name}
          kidAvatar={kid.avatar}
          streak={kid.currentStreak}
          total={dayTasks.length}
          initialDone={completions.length}
          selfAddableTasks={selfAddableTasks}
          accentColor={theme.accent}
          gradient={theme.headerGradient}
          decoration={theme.decoration}
        />
      )}
    </div>
  );
}
