/**
 * Schedule helpers — pure functions, no I/O.
 *
 * These build the data the TimelineView renders. Adding a new section type
 * is mostly: add a builder here, plug the result into the section list.
 */

import type {
  DayOfWeek,
  Task,
  TaskCompletion,
  TimeBlock,
} from "@/lib/domain/types";
import type { SectionInput } from "@/lib/registry/section-registry";
import type { SchoolItem } from "@/lib/domain/types";

const TIME_BLOCK_ORDER: TimeBlock[] = [
  "before_school",
  "morning",
  "after_school",
  "afternoon",
  "evening",
  "anytime",
];

const TIME_BLOCK_LABELS: Record<TimeBlock, { label: string; emoji: string }> = {
  before_school: { label: "BEFORE SCHOOL", emoji: "🌄" },
  morning: { label: "MORNING", emoji: "🌅" },
  after_school: { label: "AFTER SCHOOL", emoji: "🎒" },
  afternoon: { label: "AFTERNOON", emoji: "☀️" },
  evening: { label: "EVENING", emoji: "🌙" },
  anytime: { label: "ANYTIME", emoji: "✨" },
};

export function getTimeBlockLabel(block: TimeBlock) {
  return TIME_BLOCK_LABELS[block];
}

/** ISO weekday: Mon=1..Sun=7. Pass timezone (IANA) for server-side timezone-correct results. */
export function isoWeekday(d: Date = new Date(), timezone?: string): DayOfWeek {
  if (timezone) {
    const dayName = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: timezone }).format(d);
    const map: Record<string, DayOfWeek> = {
      Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7,
    };
    return (map[dayName] ?? 1) as DayOfWeek;
  }
  const js = d.getDay();
  return (js === 0 ? 7 : js) as DayOfWeek;
}

export function tasksForDay(tasks: Task[], dow: DayOfWeek): Task[] {
  return tasks.filter((t) => {
    if (!t.active) return false;
    switch (t.scheduleType) {
      case "daily":
        return true;
      case "weekdays":
        return dow >= 1 && dow <= 5;
      case "weekends":
        return dow === 6 || dow === 7;
      case "specific_days":
        return t.daysOfWeek.includes(dow);
    }
  });
}

/**
 * Build the ordered timeline sections for a kid's "today" view.
 *
 * Order:
 *   1. Time-blocks in chronological order (only those with tasks today)
 *   2. Bedtime "pack tomorrow's bag" reminder (if tomorrow has school items)
 *
 * Why no morning school-bag block: by morning the bag should already be
 * packed and waiting by the door. The packing happens the evening before.
 */
export function buildTodaySections(opts: {
  tasks: Task[];
  completions: TaskCompletion[];
  tomorrowItems: SchoolItem[];
  tomorrowDayName: string;
  now: Date;
}): SectionInput[] {
  const { tasks, completions, tomorrowItems, tomorrowDayName, now } = opts;
  const dow = isoWeekday(now);
  const todays = tasksForDay(tasks, dow);
  const completedTaskIds = new Set(completions.map((c) => c.taskId));

  const sections: SectionInput[] = [];

  // Time blocks
  const currentBlock = currentTimeBlock(now);
  for (const block of TIME_BLOCK_ORDER) {
    const blockTasks = todays
      .filter((t) => t.timeBlock === block)
      .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    if (blockTasks.length === 0) continue;

    const completable = blockTasks.filter((t) => t.requiresCompletion);
    const doneCount = completable.filter((t) => completedTaskIds.has(t.id)).length;
    const summary = completable.length
      ? `${doneCount} of ${completable.length} done`
      : undefined;

    const meta = TIME_BLOCK_LABELS[block];
    sections.push({
      type: "time-block",
      key: block,
      title: meta.label,
      blockEmoji: meta.emoji,
      isCurrent: block === currentBlock,
      summary,
      tasks: blockTasks,
    });
  }

  // Bedtime "pack tomorrow's bag" — shown all day so kids see what's coming
  // and parents can nudge after school. Tomorrow must have items to pack.
  if (tomorrowItems.length > 0) {
    sections.push({
      type: "school-bag",
      title: "Pack tomorrow's bag",
      caption: `${tomorrowDayName} — get it ready before bed!`,
      items: tomorrowItems,
      mode: "evening",
    });
  }

  return sections;
}

function currentTimeBlock(now: Date): TimeBlock {
  const h = now.getHours();
  if (h < 8) return "before_school";
  if (h < 12) return "morning";
  if (h < 15) return "after_school";
  if (h < 18) return "afternoon";
  return "evening";
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function dayName(d: Date): string {
  return DAY_NAMES[d.getDay()];
}

export function tomorrowDayName(now: Date): string {
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  return dayName(t);
}
