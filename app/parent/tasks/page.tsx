import Link from "next/link";
import { listAllTasks, listKids } from "@/lib/data/stub";
import { CATEGORIES } from "@/lib/registry/category-registry";
import TaskFilterBar from "@/components/parent/TaskFilterBar";
import type { Task, Kid } from "@/lib/domain/types";

function TaskCard({ task, kids, editable }: { task: Task; kids: Kid[]; editable: boolean }) {
  const kidIdsList = task.kidIds;
  const assignedKids = kidIdsList ? kids.filter((k) => kidIdsList.includes(k.id)) : [];
  const catMeta = CATEGORIES[task.category];

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

  const inner = (
    <>
      {/* Icon */}
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
        style={{ background: catMeta.bg }}
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
            style={{ background: catMeta.bg, color: catMeta.color }}
          >
            {catMeta.label}
          </span>
          {/* Rule — hidden for activity and school_subject */}
          {task.category !== "school_subject" && task.category !== "activity" && (
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={task.rule === "strict"
                ? { background: "#fef3c7", color: "#92400e" }
                : { background: "#e0f2fe", color: "#075985" }}
            >
              {task.rule === "strict" ? "📌 Strict" : "🔄 Flexible"}
            </span>
          )}
          {/* Stars */}
          {task.points > 0 && (
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: "#fef3c7", color: "#92400e" }}
            >
              {task.points} ⭐
            </span>
          )}
          {/* Cash value */}
          {task.cashValueCents > 0 && (
            <span
              className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: "#f0fdf4", color: "#15803d" }}
            >
              💵 ${(task.cashValueCents / 100).toFixed(2)}
            </span>
          )}
          {/* Target */}
          {targetLabel && (
            <span className="text-[10px] text-gray-400">{targetLabel}</span>
          )}
          {/* Kid + schedule */}
          <span className="text-[10px] text-gray-400 font-medium">
            {assignedKids.length > 0 ? assignedKids.map((k) => k.name).join(", ") : "All kids"} · {scheduleLabel}
          </span>
        </div>
        {/* Activity packing list */}
        {task.category === "activity" && task.packingList && task.packingList.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {task.packingList.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: catMeta.bg, color: catMeta.color }}
              >
                🎒 {item}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Arrow or built-in badge */}
      {editable ? (
        <span className="text-gray-300 text-xl flex-shrink-0">›</span>
      ) : (
        <span className="text-[10px] font-bold text-gray-400 flex-shrink-0 bg-gray-100 px-2 py-1 rounded-full">Built-in</span>
      )}
    </>
  );

  if (!editable) {
    return (
      <div
        className="bg-white rounded-2xl flex items-center gap-3 p-3.5 opacity-80"
        style={{ border: "1.5px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={`/parent/tasks/${task.id}/edit`}
      className="bg-white rounded-2xl flex items-center gap-3 p-3.5 hover:shadow-md transition-shadow"
      style={{ border: "1.5px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
    >
      {inner}
    </Link>
  );
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; kid?: string }>;
}) {
  const { category = "", kid: kidParam = "" } = await searchParams;
  const [tasks, kids] = await Promise.all([listAllTasks(), listKids()]);

  const categories = category ? category.split(",").filter(Boolean) : [];
  const selectedKidIds = kidParam ? kidParam.split(",").filter(Boolean) : [];

  const filtered = tasks.filter((t) => {
    if (t.category === "school_subject") return false;
    if (categories.length > 0 && !categories.includes(t.category)) return false;
    if (selectedKidIds.length > 0 && t.kidIds !== null && !t.kidIds.some((id) => selectedKidIds.includes(id))) return false;
    return true;
  });

  return (
    <div className="flex flex-col min-h-full">
      {/* Header + add */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2.5">
        <h1 className="text-base font-extrabold text-gray-900">📋 Tasks</h1>
        <Link
          href="/parent/tasks/new"
          className="bg-indigo-600 text-white rounded-full px-4 py-2 text-sm font-bold hover:bg-indigo-700"
        >
          + Add Task
        </Link>
      </div>

      {/* Filter bar */}
      <TaskFilterBar
        categories={categories}
        kidIds={selectedKidIds}
        kids={kids.map((k) => ({ id: k.id, name: k.name }))}
      />

      {/* Task list */}
      <div className="px-4 pb-4 space-y-2.5">
        {filtered.length === 0 ? (
          <p className="text-center text-gray-400 py-16">
            No tasks found. Add your first task! 🎯
          </p>
        ) : (
          filtered.map((task) => (
            <TaskCard key={task.id} task={task} kids={kids} editable={!task.isBuiltin} />
          ))
        )}
      </div>
    </div>
  );
}
