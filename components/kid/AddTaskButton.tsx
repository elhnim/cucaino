"use client";

import { useState, useTransition } from "react";
import { addTaskToDay } from "@/lib/actions/tasks";
import { CATEGORIES } from "@/lib/registry/category-registry";
import type { Task, TaskCategory } from "@/lib/domain/types";

export default function AddTaskButton({
  kidId,
  availableTasks,
  accentColor,
  date,
  dayLabel = "today",
}: {
  kidId: string;
  availableTasks: Task[];
  accentColor: string;
  date?: string;
  dayLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<TaskCategory | "all">("all");
  const [isPending, startTransition] = useTransition();

  const handleAdd = (task: Task) => {
    if (isPending || added.has(task.id)) return;
    setAdded((prev) => new Set([...prev, task.id]));
    startTransition(async () => {
      await addTaskToDay(task.id, kidId, date);
    });
    setOpen(false);
  };

  const remaining = availableTasks.filter((t) => !added.has(t.id));

  // Only show categories that have at least one available task
  const presentCategories = Object.values(CATEGORIES).filter((cat) =>
    remaining.some((t) => t.category === cat.id)
  );

  const filtered = filter === "all" ? remaining : remaining.filter((t) => t.category === filter);

  const handleOpen = () => {
    setFilter("all");
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black text-white shadow-sm active:scale-95 transition-transform"
        style={{ background: accentColor }}
      >
        <span className="text-lg leading-none">＋</span>
        {dayLabel === "today" ? "Add a task" : "Schedule a task"}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm flex flex-col shadow-2xl" style={{ height: "clamp(320px, 65dvh, 600px)" }}>
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl shrink-0 rounded-t-3xl">
              <h2 className="text-base font-black">
                {dayLabel === "today" ? "Add a task" : `Schedule a task for ${dayLabel}`}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* Category filter chips */}
            {presentCategories.length > 1 && (
              <div className="px-4 pt-3 pb-0 flex gap-2 overflow-x-auto scrollbar-hide shrink-0">
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
                  style={
                    filter === "all"
                      ? { background: accentColor, color: "white" }
                      : { background: "#f3f4f6", color: "#374151" }
                  }
                >
                  All
                </button>
                {presentCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setFilter(cat.id)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
                    style={
                      filter === cat.id
                        ? { background: accentColor, color: "white" }
                        : { background: "#f3f4f6", color: "#374151" }
                    }
                  >
                    {cat.defaultIcon} {cat.label}
                  </button>
                ))}
              </div>
            )}

            {/* Task list */}
            <div className="p-4 space-y-2 overflow-y-auto flex-1">
              {remaining.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  No more tasks to add today!
                </p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  No {filter !== "all" ? CATEGORIES[filter].label.toLowerCase() : ""} tasks available.
                </p>
              ) : (
                filtered.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => handleAdd(task)}
                    disabled={isPending}
                    className="w-full flex items-center gap-3 bg-gray-50 rounded-2xl p-3 text-left hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    <span className="text-3xl shrink-0">{task.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-gray-800">{task.name}</div>
                      {task.description && (
                        <div className="text-xs text-gray-400 truncate">{task.description}</div>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5 shrink-0">
                      ⭐ {task.points}
                    </span>
                    {task.cashValueCents > 0 && (
                      <span className="text-xs font-semibold rounded-full px-2 py-0.5 shrink-0" style={{ background: "#f0fdf4", color: "#15803d" }}>
                        💵 ${(task.cashValueCents / 100).toFixed(2)}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
