// Today's quests for a kid: the required, scheduled (non-flexible) tasks for today's weekday
// and how many are done. Shared by the park page and the habit actions so "all done" means
// exactly the same thing everywhere.
import { tasksForDay } from "@/lib/domain/schedule";
import type { DayOfWeek, Task, TaskCompletion } from "@/lib/domain/types";

export function questsToday(tasks: Task[], completionsToday: TaskCompletion[], dow: DayOfWeek): { total: number; done: number } {
  const today = tasksForDay(
    tasks.filter((t) => t.rule !== "flexible"),
    dow,
  ).filter((t) => t.requiresCompletion);
  const done = new Set(completionsToday.map((c) => c.taskId));
  return { total: today.length, done: today.filter((t) => done.has(t.id)).length };
}
