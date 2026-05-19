"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Task } from "@/lib/domain/types";
import { getCategory } from "@/lib/registry/category-registry";
import { completeTask, uncompleteTask } from "@/lib/actions/completions";

export default function TaskCard({
  task,
  kidId,
  initiallyDone = false,
  accent,
}: {
  task: Task;
  kidId: string;
  initiallyDone?: boolean;
  accent: string;
}) {
  const [done, setDone] = useState(initiallyDone);
  const [isPending, startTransition] = useTransition();
  const category = getCategory(task.category);

  if (task.category === "activity") {
    return <ActivityCard task={task} />;
  }

  const toggle = () => {
    const next = !done;
    setDone(next); // optimistic update
    startTransition(async () => {
      if (next) {
        await completeTask(task.id, kidId, task.points, task.familyPointsContribution, task.category, 1, task.cashValueCents, task.requiresParentApproval);
      } else {
        await uncompleteTask(task.id, kidId);
      }
    });
  };

  return (
    <div
      className={`bg-white border-2 rounded-2xl p-4 flex items-center gap-3 transition-opacity ${
        done ? "opacity-60" : ""
      } ${category.borderClass}`}
    >
      <button
        type="button"
        aria-label={done ? "Mark as not done" : "Mark as done"}
        onClick={toggle}
        disabled={isPending}
        className="w-10 h-10 rounded-xl border-2 flex items-center justify-center text-white font-black text-xl transition-colors disabled:opacity-60"
        style={{
          background: done ? accent : "white",
          borderColor: done ? accent : "#d1d5db",
        }}
      >
        {done ? "✓" : ""}
      </button>
      <div className="text-2xl md:text-3xl">{task.icon}</div>
      <div className="flex-1 min-w-0">
        <div className={`font-bold text-base md:text-lg ${done ? "line-through" : ""}`}>
          {task.name}
        </div>
        <div className="text-xs text-gray-500 truncate">
          {task.startTime ?? "anytime"}
          {task.durationMinutes ? ` · ${task.durationMinutes} min` : ""}
          {task.points ? ` · +${task.points} ⭐` : ""}
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
        {task.category === "music" && kidId && !isPianoTask(task.name) ? (
          <Link
            href={`/kid/${kidId}/tuner`}
            className="bg-purple-100 hover:bg-purple-200 text-purple-800 font-bold px-3 py-1.5 rounded-xl text-sm text-center"
          >
            🎵 Tuner
          </Link>
        ) : null}
        {task.requiresTimer && kidId ? (
          <Link
            href={`/kid/${kidId}/practice/${task.id}?from=todo`}
            className="text-white font-bold px-3 py-1.5 rounded-xl text-sm text-center"
            style={{ background: accent }}
          >
            ▶ {task.category === "music" ? "Practice" : "Timer"}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function isPianoTask(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("piano") || n.includes("keyboard");
}

function ActivityCard({ task }: { task: Task }) {
  const [open, setOpen] = useState(true);
  const [packed, setPacked] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setPacked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const time = task.startTime
    ? `${task.startTime}${task.durationMinutes ? ` (${task.durationMinutes} min)` : ""}`
    : "after school";

  return (
    <div className="bg-white rounded-2xl p-4 border-2 border-dashed border-blue-300">
      <div className="flex items-start gap-3">
        <div className="text-2xl md:text-3xl mt-0.5">{task.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-bold text-base md:text-lg">{task.name}</div>
            {task.location ? (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                📍 {task.location}
              </span>
            ) : null}
            {!task.requiresCompletion ? (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">
                reminder
              </span>
            ) : null}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            {time}
            {task.points ? ` · +${task.points} ⭐ for attending well` : " · just a reminder"}
          </div>
          {task.packingList && task.packingList.length > 0 ? (
            <div className="mt-3 bg-blue-50 rounded-xl p-3">
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="text-xs font-black text-blue-900 mb-1 flex items-center gap-1"
              >
                🎒 Pack your bag {open ? "▲" : "▼"}
              </button>
              {open ? (
                <div className="grid grid-cols-2 gap-1 text-sm mt-1">
                  {task.packingList.map((item, i) => {
                    const isPacked = packed.has(i);
                    return (
                      <label key={item} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isPacked}
                          onChange={() => toggle(i)}
                          className="w-4 h-4 accent-blue-600"
                        />
                        <span className={isPacked ? "line-through text-gray-500" : ""}>{item}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
