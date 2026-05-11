"use client";

import { useState, useTransition } from "react";
import { addTaskToDay } from "@/lib/actions/tasks";
import type { Task } from "@/lib/domain/types";

export default function AddTaskButton({
  kidId,
  availableTasks,
  accentColor,
}: {
  kidId: string;
  availableTasks: Task[];
  accentColor: string;
}) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const handleAdd = (task: Task) => {
    if (isPending || added.has(task.id)) return;
    setAdded((prev) => new Set([...prev, task.id]));
    startTransition(async () => {
      await addTaskToDay(task.id, kidId);
    });
    setOpen(false);
  };

  const remaining = availableTasks.filter((t) => !added.has(t.id));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-3 text-sm font-bold text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors"
      >
        + Add a task
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-3xl w-full max-h-[70vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl">
              <h2 className="text-base font-black">Add a task for today</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-2">
              {remaining.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  No more tasks to add today!
                </p>
              ) : (
                remaining.map((task) => (
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
