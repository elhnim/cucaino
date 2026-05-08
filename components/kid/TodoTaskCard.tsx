"use client";

import { useState, useTransition } from "react";
import { completeTask, uncompleteTask } from "@/lib/actions/completions";
import type { Task, TaskCompletion } from "@/lib/domain/types";

function targetInfo(task: Task): string | null {
  if (task.target === "time" && task.targetDurationMinutes) {
    return `⏱ ${task.targetDurationMinutes} min`;
  }
  if (task.target === "reps" && task.targetReps) {
    return `✕ ${task.targetReps} ${task.targetRepLabel ?? "reps"}`;
  }
  if (task.target === "checklist" && task.checklistItems) {
    return `☑ ${task.checklistItems.length} items`;
  }
  return null;
}

export default function TodoTaskCard({
  task,
  initialCompletion,
  isToday,
  isPast,
  isFuture,
  kidId,
  accentColor,
}: {
  task: Task;
  initialCompletion: TaskCompletion | undefined;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  kidId: string;
  accentColor: string;
}) {
  const [done, setDone] = useState(!!initialCompletion);
  const [isPending, startTransition] = useTransition();
  const info = targetInfo(task);

  const toggle = () => {
    if (!isToday || isPending) return;
    const next = !done;
    setDone(next);
    startTransition(async () => {
      if (next) {
        await completeTask(task.id, kidId, task.points, task.familyPointsContribution);
      } else {
        await uncompleteTask(task.id, kidId);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!isToday || isPending}
      className={`w-full bg-white rounded-2xl shadow-sm p-3 flex items-center gap-3 text-left transition-all ${
        isFuture ? "opacity-60" : ""
      } ${isToday ? "active:scale-98 cursor-pointer" : "cursor-default"} ${
        done ? "opacity-80" : ""
      }`}
    >
      <span className="text-3xl shrink-0">{task.icon}</span>

      <div className="flex-1 min-w-0">
        <div
          className={`font-bold text-sm leading-tight ${done ? "line-through text-gray-400" : "text-gray-800"}`}
        >
          {task.name}
        </div>
        {info && <div className="text-xs text-gray-500 mt-0.5">{info}</div>}
        {task.description && (
          <div className="text-xs text-gray-400 mt-0.5 truncate">{task.description}</div>
        )}
        {!done && (
          <span className="inline-flex items-center gap-0.5 mt-1 text-xs font-semibold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
            ⭐ {task.points}
          </span>
        )}
        {done && (
          <span className="inline-flex items-center gap-0.5 mt-1 text-xs font-semibold text-green-600 bg-green-50 rounded-full px-2 py-0.5">
            +{task.points} ⭐ earned!
          </span>
        )}
      </div>

      <div className="shrink-0">
        {done ? (
          <span
            className="flex items-center justify-center w-9 h-9 rounded-full"
            style={{ background: "#dcfce7" }}
          >
            ✅
          </span>
        ) : (
          <span
            className="flex items-center justify-center w-9 h-9 rounded-full border-2"
            style={{
              borderColor: isPast || isFuture ? "#e5e7eb" : accentColor,
              background: "transparent",
            }}
          />
        )}
      </div>
    </button>
  );
}
