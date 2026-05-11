import Link from "next/link";
import { listAllTasks, listKids } from "@/lib/data/stub";
import { CATEGORIES } from "@/lib/registry/category-registry";
import TaskFilterBar from "@/components/parent/TaskFilterBar";
import type { Task, Kid } from "@/lib/domain/types";

const CATEGORY_ICON_BG: Record<string, { bg: string; color: string }> = {
  chore:          { bg: "#f3f4f6", color: "#374151" },
  exercise:       { bg: "#dcfce7", color: "#15803d" },
  music:          { bg: "#fef3c7", color: "#92400e" },
  activity:       { bg: "#dbeafe", color: "#1d4ed8" },
  personal:       { bg: "#ede9fe", color: "#5b21b6" },
  school_subject: { bg: "#e0e7ff", color: "#3730a3" },
};

function TaskCard({ task, kids }: { task: Task; kids: Kid[] }) {
  const kid = task.kidId ? kids.find((k) => k.id === task.kidId) : null;
  const catMeta = CATEGORIES[task.category];
  const iconStyle = CATEGORY_ICON_BG[task.category] ?? { bg: "#f3f4f6", color: "#374151" };

  const targetLabel = (() => {
    if (task.target === "time" && task.targetDurationMinutes) return `⏱ ${task.targetDurationMinutes} min`;
    if (task.target === "reps" && task.targetReps) return `✕ ${task.targetReps}${task.targetRepLabel ? ` ${task.targetRepLabel}` : " reps"}`;
    if (task.target === "checklist") return "☑ checklist";
    return null;
  })();

  const scheduleLabel = (() => {
    if (task.scheduleType === "daily") return "Every day";
    if (task.scheduleType === "weekdays") return "Weekdays";
    if (task.scheduleType === "specific_days") {
      const days = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      return task.daysOfWeek.map((d) => days[d]).join(", ");
    }
    return task.rule === "flexible" ? "Flexible" : "Scheduled";
  })();

  return (
    <Link
      href={`/parent/tasks/${task.id}/edit`}
      className="bg-white rounded-2xl flex items-center gap-3 p-3.5 hover:shadow-md transition-shadow"
      style={{ border: "1.5px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
    >
      {/* Icon */}
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
        style={{ background: iconStyle.bg }}
      >
        {task.icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="font-bold text-gray-900 truncate text-[14px]">{task.name}</div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {/* Category */}
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: iconStyle.bg, color: iconStyle.color }}
          >
            {catMeta.label}
          </span>
          {/* Rule */}
          {task.category !== "school_subject" && (
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={task.rule === "strict"
                ? { background: "#dbeafe", color: "#1d4ed8" }
                : { background: "#dcfce7", color: "#15803d" }}
            >
              {task.rule === "strict" ? "Strict" : "Flexible"}
            </span>
          )}
          {/* Stars */}
          {task.points > 0 && (
            <span className="text-[10px] text-gray-400 font-semibold">⭐ {task.points}</span>
          )}
          {/* Target */}
          {targetLabel && (
            <span className="text-[10px] text-gray-400">{targetLabel}</span>
          )}
        </div>
        <div className="text-[11px] text-gray-400 mt-1">
          {kid ? kid.name : "All kids"} · {scheduleLabel}
        </div>
      </div>

      {/* Status + arrow */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: task.active ? "#22c55e" : "#d1d5db" }}
        />
        <span className="text-gray-300 text-xl">›</span>
      </div>
    </Link>
  );
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; kid?: string }>;
}) {
  const { category = "", kid: kidId = "" } = await searchParams;
  const [tasks, kids] = await Promise.all([listAllTasks(), listKids()]);

  const filtered = tasks.filter((t) => {
    if (category && t.category !== category) return false;
    if (kidId && t.kidId !== kidId && t.kidId !== null) return false;
    return true;
  });

  return (
    <div className="flex flex-col min-h-full">
      {/* Filter bar */}
      <TaskFilterBar
        category={category}
        kidId={kidId}
        kids={kids.map((k) => ({ id: k.id, name: k.name }))}
      />

      {/* Header + add */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-base font-extrabold text-gray-900">
          {filtered.length} {category ? (CATEGORIES[category as keyof typeof CATEGORIES]?.label ?? category) : "Tasks"}
        </h1>
        <Link
          href="/parent/tasks/new"
          className="bg-indigo-600 text-white rounded-full px-4 py-2 text-sm font-bold hover:bg-indigo-700"
        >
          + Add Task
        </Link>
      </div>

      {/* Task list */}
      <div className="px-4 pb-4 space-y-2.5">
        {filtered.length === 0 ? (
          <p className="text-center text-gray-400 py-16">
            No tasks found. Add your first task! 🎯
          </p>
        ) : (
          filtered.map((task) => (
            <TaskCard key={task.id} task={task} kids={kids} />
          ))
        )}
      </div>
    </div>
  );
}
