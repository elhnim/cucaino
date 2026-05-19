"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { completeTask, uncompleteTask } from "@/lib/actions/completions";
import { TaskDoneSheet } from "@/components/kid/CelebrationOverlay";
import type { Task, TaskCompletion } from "@/lib/domain/types";

function CompletedBadge({
  points,
  celebrating,
  accentColor,
}: {
  points: number;
  celebrating: boolean;
  accentColor: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex items-center justify-center w-9 h-9 rounded-full transition-all ${celebrating ? "scale-125" : ""}`}
        style={{ background: celebrating ? accentColor + "33" : "#dcfce7" }}
      >
        {celebrating ? "🎉" : "✅"}
      </span>
      <span className="text-xs font-semibold text-green-600 bg-green-50 rounded-full px-2 py-0.5">
        +{points} ⭐ earned!
      </span>
    </div>
  );
}

function RepsCard({
  task,
  done,
  celebrating,
  onComplete,
  onUncomplete,
  isToday,
  isPast,
  isFuture,
  isPending,
  accentColor,
}: {
  task: Task;
  done: boolean;
  celebrating: boolean;
  onComplete: () => void;
  onUncomplete: () => void;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  isPending: boolean;
  accentColor: string;
}) {
  const [count, setCount] = useState(0);
  const target = task.targetReps ?? 1;
  const label = task.targetRepLabel ?? "reps";

  const increment = () => {
    if (!isToday || isPending || done) return;
    const next = count + 1;
    setCount(next);
    if (next >= target) onComplete();
  };

  if (done) {
    return (
      <div
        className={`w-full rounded-2xl shadow-sm bg-white p-3 flex items-center gap-3 transition-all ${celebrating ? "scale-[1.03] shadow-lg" : ""} ${isFuture ? "opacity-60" : ""}`}
        style={{ borderWidth: celebrating ? 2 : 0, borderStyle: "solid", borderColor: celebrating ? accentColor : "transparent", backgroundColor: celebrating ? accentColor + "22" : "white" }}
      >
        <span className="text-3xl shrink-0">{task.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-gray-400 line-through">{task.name}</div>
          <div className="text-xs text-gray-400">{target} {label}</div>
        </div>
        <CompletedBadge points={task.points} celebrating={celebrating} accentColor={accentColor} />
        {isToday && (
          <button type="button" onClick={onUncomplete} disabled={isPending} className="text-xs text-gray-400 hover:text-gray-600 ml-1">↩</button>
        )}
      </div>
    );
  }

  const progress = Math.min(count / target, 1);

  return (
    <div className={`w-full rounded-2xl shadow-sm bg-white p-4 ${isFuture ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl shrink-0">{task.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-gray-800">{task.name}</div>
          {task.description && (
            <div className="text-xs text-gray-400 mt-0.5 truncate">{task.description}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-xs font-semibold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
            ⭐ {task.points}
          </span>
          {task.cashValueCents > 0 && (
            <span className="text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: "#f0fdf4", color: "#15803d" }}>
              💵 ${(task.cashValueCents / 100).toFixed(2)}
            </span>
          )}
        </div>
      </div>

      <div className="h-2 rounded-full bg-gray-100 mb-2 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${progress * 100}%`, background: accentColor }}
        />
      </div>

      <div className="flex items-center justify-between mt-3">
        <div>
          <span
            className="text-2xl font-black"
            style={{ color: count > 0 ? accentColor : "#9ca3af" }}
          >
            {count}
          </span>
          <span className="text-sm text-gray-400 ml-1">/ {target} {label}</span>
        </div>
        {isToday && (
          <button
            type="button"
            onClick={increment}
            disabled={isPending}
            className="w-14 h-14 rounded-full text-white font-black text-xl flex items-center justify-center shadow-md active:scale-95 transition-transform disabled:opacity-50"
            style={{ background: accentColor }}
          >
            +1
          </button>
        )}
        {isPast && (
          <span className="text-xs text-gray-400">Not completed</span>
        )}
      </div>
    </div>
  );
}

function ChecklistCard({
  task,
  done,
  celebrating,
  onComplete,
  onUncomplete,
  isToday,
  isPast,
  isFuture,
  isPending,
  accentColor,
}: {
  task: Task;
  done: boolean;
  celebrating: boolean;
  onComplete: () => void;
  onUncomplete: () => void;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  isPending: boolean;
  accentColor: string;
}) {
  const items = task.checklistItems ?? [];
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const total = items.length;
  const doneCount = checked.size;

  const toggleItem = (i: number) => {
    if (!isToday || isPending || done) return;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
        if (next.size === total) onComplete();
      }
      return next;
    });
  };

  if (done) {
    return (
      <div
        className={`w-full rounded-2xl shadow-sm bg-white p-3 flex items-center gap-3 transition-all ${celebrating ? "scale-[1.03] shadow-lg" : ""} ${isFuture ? "opacity-60" : ""}`}
        style={{ borderWidth: celebrating ? 2 : 0, borderStyle: "solid", borderColor: celebrating ? accentColor : "transparent", backgroundColor: celebrating ? accentColor + "22" : "white" }}
      >
        <span className="text-3xl shrink-0">{task.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-gray-400 line-through">{task.name}</div>
          <div className="text-xs text-gray-400">{total} items done</div>
        </div>
        <CompletedBadge points={task.points} celebrating={celebrating} accentColor={accentColor} />
        {isToday && (
          <button type="button" onClick={onUncomplete} disabled={isPending} className="text-xs text-gray-400 hover:text-gray-600 ml-1">↩</button>
        )}
      </div>
    );
  }

  const progress = total > 0 ? doneCount / total : 0;

  return (
    <div className={`w-full rounded-2xl shadow-sm bg-white p-4 ${isFuture ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3 mb-3">
        <span className="text-3xl shrink-0">{task.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-gray-800">{task.name}</div>
          {task.description && (
            <div className="text-xs text-gray-400 mt-0.5 truncate">{task.description}</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <span className="text-xs font-semibold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
            ⭐ {task.points}
          </span>
          {task.cashValueCents > 0 && (
            <div className="mt-1">
              <span className="text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: "#f0fdf4", color: "#15803d" }}>
                💵 ${(task.cashValueCents / 100).toFixed(2)}
              </span>
            </div>
          )}
          <div className="text-xs text-gray-400 mt-1">{doneCount}/{total}</div>
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-gray-100 mb-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${progress * 100}%`, background: accentColor }}
        />
      </div>

      <div className="space-y-1">
        {items.map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggleItem(i)}
            disabled={!isToday || isPending}
            className={`w-full flex items-center gap-2.5 text-left py-2 px-1 rounded-xl transition-colors ${isToday ? "active:bg-gray-50 cursor-pointer" : "cursor-default"}`}
          >
            <span
              className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 text-xs font-bold transition-colors"
              style={{
                borderColor: checked.has(i) ? accentColor : "#e5e7eb",
                background: checked.has(i) ? accentColor + "22" : "transparent",
                color: checked.has(i) ? accentColor : "transparent",
              }}
            >
              ✓
            </span>
            <span
              className={`text-sm font-medium transition-colors ${checked.has(i) ? "line-through text-gray-400" : "text-gray-700"}`}
            >
              {item}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FrequencyCard({
  task,
  initialCount,
  isToday,
  isFuture,
  accentColor,
  kidId,
}: {
  task: Task;
  initialCount: number;
  isToday: boolean;
  isFuture: boolean;
  accentColor: string;
  kidId: string;
}) {
  const target = task.frequencyPerDay ?? 1;
  const [count, setCount] = useState(Math.min(initialCount, target));
  const [celebrating, setCelebrating] = useState(false);
  const [isPending, startTransition] = useTransition();
  const done = count >= target;

  useEffect(() => {
    if (!celebrating) return;
    const t = setTimeout(() => setCelebrating(false), 1500);
    return () => clearTimeout(t);
  }, [celebrating]);

  const tap = () => {
    if (!isToday || isPending || done) return;
    const next = count + 1;
    setCount(next);
    if (next >= target) {
      setCelebrating(true);
      window.dispatchEvent(new CustomEvent("task-completed", { detail: { points: task.points } }));
    }
    startTransition(async () => {
      const result = await completeTask(task.id, kidId, task.points, task.familyPointsContribution, task.category, target, task.cashValueCents, task.requiresParentApproval);
      if (result.ok && result.newTiers && result.newTiers.length > 0) {
        window.dispatchEvent(new CustomEvent("badge-unlocked", { detail: { badges: result.newTiers } }));
      }
    });
  };

  const progress = count / target;

  return (
    <div
      className={`w-full rounded-2xl shadow-sm bg-white p-3 flex items-center gap-3 transition-all ${celebrating ? "scale-[1.03] shadow-lg" : ""} ${isFuture ? "opacity-60" : ""}`}
      style={{ border: celebrating ? `2px solid ${accentColor}` : "none", backgroundColor: celebrating ? accentColor + "22" : "white" }}
    >
      <span className="text-3xl shrink-0">{task.icon}</span>
      <div className="flex-1 min-w-0">
        <div className={`font-bold text-sm leading-tight ${done ? "line-through text-gray-400" : "text-gray-800"}`}>{task.name}</div>
        <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress * 100}%`, background: accentColor }} />
        </div>
        <div className="text-xs mt-1 font-semibold" style={{ color: done ? "#22c55e" : "#9ca3af" }}>
          {count} / {target} {done ? "✅" : ""}
        </div>
      </div>
      {isToday && !done && (
        <button
          type="button"
          onClick={tap}
          disabled={isPending}
          className="shrink-0 w-12 h-12 rounded-full text-white font-black text-lg flex items-center justify-center shadow active:scale-95 transition-transform disabled:opacity-50"
          style={{ background: accentColor }}
        >
          +1
        </button>
      )}
      {done && (
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="text-xs font-semibold text-green-600 bg-green-50 rounded-full px-2 py-1">
            +{task.points * target} ⭐
          </span>
          {task.cashValueCents > 0 && (
            <span className="text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: "#f0fdf4", color: "#15803d" }}>
              💵 ${(task.cashValueCents / 100).toFixed(2)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function TimerCard({
  task,
  done,
  celebrating,
  onComplete,
  onUncomplete,
  isToday,
  isPast,
  isFuture,
  isPending,
  accentColor,
  kidId,
}: {
  task: Task;
  done: boolean;
  celebrating: boolean;
  onComplete: () => void;
  onUncomplete: () => void;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  isPending: boolean;
  accentColor: string;
  kidId: string;
}) {
  const minutes = task.targetDurationMinutes ?? task.durationMinutes;

  if (done) {
    return (
      <div
        className={`w-full rounded-2xl shadow-sm bg-white p-3 flex items-center gap-3 transition-all ${celebrating ? "scale-[1.03] shadow-lg" : ""} ${isFuture ? "opacity-60" : ""}`}
        style={{ borderWidth: celebrating ? 2 : 0, borderStyle: "solid", borderColor: celebrating ? accentColor : "transparent", backgroundColor: celebrating ? accentColor + "22" : "white" }}
      >
        <span className="text-3xl shrink-0">{task.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-gray-400 line-through">{task.name}</div>
          {minutes && <div className="text-xs text-gray-400">⏱ {minutes} min</div>}
        </div>
        <CompletedBadge points={task.points} celebrating={celebrating} accentColor={accentColor} />
        {isToday && (
          <button type="button" onClick={onUncomplete} disabled={isPending} className="text-xs text-gray-400 hover:text-gray-600 ml-1">↩</button>
        )}
      </div>
    );
  }

  return (
    <div className={`w-full rounded-2xl shadow-sm bg-white p-3 flex items-center gap-3 ${isFuture ? "opacity-60" : ""}`}>
      <span className="text-3xl shrink-0">{task.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm text-gray-800">{task.name}</div>
        {minutes && <div className="text-xs text-gray-500 mt-0.5">⏱ {minutes} min</div>}
        {task.description && (
          <div className="text-xs text-gray-400 mt-0.5 truncate">{task.description}</div>
        )}
        <div className="flex flex-wrap gap-1 mt-1">
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
            ⭐ {task.points}
          </span>
          {task.cashValueCents > 0 && (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: "#f0fdf4", color: "#15803d" }}>
              💵 ${(task.cashValueCents / 100).toFixed(2)}
            </span>
          )}
        </div>
      </div>
      {isToday && (
        <Link
          href={`/kid/${kidId}/practice/${task.id}?from=todo`}
          className="shrink-0 flex items-center gap-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white shadow-sm"
          style={{ background: accentColor }}
        >
          ▶ Start
        </Link>
      )}
    </div>
  );
}

export default function TodoTaskCard({
  task,
  initialCompletion,
  initialCompletionCount,
  isToday,
  isPast,
  isFuture,
  kidId,
  accentColor,
  initiallyPending,
}: {
  task: Task;
  initialCompletion: TaskCompletion | undefined;
  initialCompletionCount?: number;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  kidId: string;
  accentColor: string;
  initiallyPending?: boolean;
}) {
  if ((task.frequencyPerDay ?? 1) > 1) {
    return (
      <FrequencyCard
        task={task}
        initialCount={initialCompletionCount ?? 0}
        isToday={isToday}
        isFuture={isFuture}
        accentColor={accentColor}
        kidId={kidId}
      />
    );
  }
  const [done, setDone] = useState(!!initialCompletion);
  const [celebrating, setCelebrating] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pending, setPending] = useState(initiallyPending ?? false);

  useEffect(() => {
    if (!celebrating) return;
    const t = setTimeout(() => setCelebrating(false), 1500);
    return () => clearTimeout(t);
  }, [celebrating]);

  const complete = () => {
    if (task.requiresParentApproval) {
      setPending(true);
      startTransition(async () => {
        const result = await completeTask(
          task.id, kidId, task.points, task.familyPointsContribution,
          task.category, 1, task.cashValueCents, true,
        );
        if (!result.ok) setPending(false);
      });
    } else {
      setDone(true);
      setCelebrating(true);
      setShowSheet(true);
      window.dispatchEvent(new CustomEvent("task-completed", { detail: { points: task.points } }));
      startTransition(async () => {
        const result = await completeTask(
          task.id, kidId, task.points, task.familyPointsContribution,
          task.category, 1, task.cashValueCents, false,
        );
        if (!result.ok) {
          setDone(false);
          setCelebrating(false);
        } else if (result.newTiers && result.newTiers.length > 0) {
          window.dispatchEvent(new CustomEvent("badge-unlocked", { detail: { badges: result.newTiers } }));
        }
      });
    }
  };

  const uncomplete = () => {
    setDone(false);
    startTransition(async () => {
      await uncompleteTask(task.id, kidId);
    });
  };

  const sharedProps = { task, done, celebrating, onComplete: complete, onUncomplete: uncomplete, isToday, isPast, isFuture, isPending, accentColor };

  if (task.target === "reps" && task.targetReps) {
    return <RepsCard {...sharedProps} />;
  }

  if (task.target === "checklist" && task.checklistItems?.length) {
    return <ChecklistCard {...sharedProps} />;
  }

  if ((task.target === "time" && task.targetDurationMinutes) || (task.requiresTimer && task.durationMinutes)) {
    return <TimerCard {...sharedProps} kidId={kidId} />;
  }

  // Default: simple tap-to-complete
  const toggle = () => {
    if (!isToday || isPending) return;
    if (done) uncomplete();
    else complete();
  };

  return (
    <>
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
        {task.description && (
          <div className="text-xs text-gray-400 mt-0.5 truncate">{task.description}</div>
        )}
        {!done && (
          <div className="flex flex-wrap gap-1 mt-1">
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
              ⭐ {task.points}
            </span>
            {task.cashValueCents > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: "#f0fdf4", color: "#15803d" }}>
                💵 ${(task.cashValueCents / 100).toFixed(2)}
              </span>
            )}
          </div>
        )}
        {done && (
          <div className="flex flex-wrap gap-1 mt-1">
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-green-600 bg-green-50 rounded-full px-2 py-0.5">
              +{task.points} ⭐ earned!
            </span>
            {task.cashValueCents > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: "#f0fdf4", color: "#15803d" }}>
                💵 ${(task.cashValueCents / 100).toFixed(2)}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0">
        {pending ? (
          <div className="flex items-center gap-2">
            <span
              className="flex items-center justify-center w-9 h-9 rounded-full"
              style={{ background: "#fef3c7" }}
            >
              ✋
            </span>
            <span className="text-xs font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
              Pending approval
            </span>
          </div>
        ) : done ? (
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
    {showSheet && (
      <TaskDoneSheet
        taskIcon={task.icon}
        taskName={task.name}
        points={task.points}
        onContinue={() => setShowSheet(false)}
      />
    )}
    </>
  );
}
