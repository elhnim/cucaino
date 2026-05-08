"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [done, setDone] = useState(!!initialCompletion);
  const [celebrating, setCelebrating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const info = targetInfo(task);

  useEffect(() => {
    if (!celebrating) return;
    const t = setTimeout(() => setCelebrating(false), 1500);
    return () => clearTimeout(t);
  }, [celebrating]);

  const toggle = () => {
    if (!isToday || isPending) return;
    const next = !done;
    setDone(next);
    if (next) setCelebrating(true);
    startTransition(async () => {
      const result = next
        ? await completeTask(task.id, kidId, task.points, task.familyPointsContribution, task.category)
        : await uncompleteTask(task.id, kidId);
      if (!result.ok) {
        // Revert optimistic update on failure
        setDone(!next);
        setCelebrating(false);
        return;
      }
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!isToday || isPending}
      className={`w-full rounded-2xl shadow-sm p-3 flex items-center gap-3 text-left transition-all duration-300 ${
        isFuture ? "opacity-60" : ""
      } ${isToday ? "active:scale-98 cursor-pointer" : "cursor-default"} ${
        done ? "opacity-80" : ""
      } ${celebrating ? "scale-[1.03] shadow-lg" : ""}`}
      style={{
        backgroundColor: celebrating ? accentColor + "22" : "white",
        borderWidth: celebrating ? 2 : 0,
        borderStyle: "solid",
        borderColor: celebrating ? accentColor : "transparent",
      }}
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
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-all ${celebrating ? "scale-125" : ""}`}
            style={{ background: celebrating ? accentColor + "33" : "#dcfce7" }}
          >
            {celebrating ? "🎉" : "✅"}
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
