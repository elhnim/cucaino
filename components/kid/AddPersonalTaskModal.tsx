"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createTask } from "@/lib/actions/tasks";
import type { Task } from "@/lib/domain/types";

export default function AddPersonalTaskModal({
  kidId,
  accent,
  addableTasks,
}: {
  kidId: string;
  accent: string;
  addableTasks: Task[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (addableTasks.length === 0) return null;

  function close() {
    setError(null);
    setOpen(false);
  }

  function pick(task: Task) {
    setError(null);
    startTransition(async () => {
      const result = await createTask({
        name: task.name,
        icon: task.icon,
        category: task.category,
        scheduleType: task.scheduleType,
        daysOfWeek: task.daysOfWeek,
        timeBlock: task.timeBlock,
        startTime: task.startTime,
        points: task.points,
        familyPointsContribution: task.familyPointsContribution,
        requiresTimer: task.requiresTimer,
        durationMinutes: task.durationMinutes,
        requiresCompletion: task.requiresCompletion,
        location: task.location,
        packingList: task.packingList,
        defaultBpm: task.defaultBpm,
        defaultTimeSignature: task.defaultTimeSignature,
        kidId,
        kidCanAdd: false,
      });
      if (!result.ok) { setError(result.error); return; }
      close();
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed text-sm font-bold transition-colors"
        style={{ borderColor: accent, color: accent }}
      >
        <span className="text-lg">＋</span> Add a task
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm max-h-[80vh] flex flex-col">
            <div className="p-5 pb-3 border-b border-gray-100">
              <h2 className="text-xl font-black text-gray-800 text-center">Pick a task ✏️</h2>
              <p className="text-sm text-gray-500 text-center mt-1">Choose one to add to your day</p>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {addableTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => pick(task)}
                  disabled={isPending}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border-2 border-gray-100 hover:border-transparent transition-all text-left disabled:opacity-50"
                  style={{ ["--accent" as string]: accent }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = accent)}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
                >
                  <span className="text-3xl shrink-0">{task.icon}</span>
                  <div className="min-w-0">
                    <div className="font-bold text-gray-800 truncate">{task.name}</div>
                    <div className="text-xs text-gray-500">
                      {task.points > 0 ? `${task.points} ⭐` : "No points"}{task.durationMinutes ? ` · ${task.durationMinutes} min` : ""}
                    </div>
                  </div>
                  <span className="ml-auto text-gray-300 text-xl shrink-0">→</span>
                </button>
              ))}
            </div>

            {error && <p className="text-red-500 text-sm text-center font-semibold px-4 pb-2">{error}</p>}

            <div className="p-4 pt-2 border-t border-gray-100">
              <button
                onClick={close}
                className="w-full py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
