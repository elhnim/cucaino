"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTaskToDay } from "@/lib/actions/tasks";

export interface WeeklyGoal {
  id: string;
  name: string;
  icon: string;
  min: number;
  count: number;
  addedToday: boolean;
}

export default function WeeklyGoals({
  goals,
  kidId,
  accentColor,
  isToday,
}: {
  goals: WeeklyGoal[];
  kidId: string;
  accentColor: string;
  isToday: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState<Set<string>>(new Set());

  if (goals.length === 0) return null;

  const addToday = (taskId: string) => {
    setAdded((prev) => new Set(prev).add(taskId));
    startTransition(async () => {
      await addTaskToDay(taskId, kidId);
      router.refresh();
    });
  };

  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 px-1">🎯 This week's goals</div>
      {/* Compact horizontal scroller */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
        {goals.map((g) => {
          const done = g.count >= g.min;
          const pct = Math.min(g.count / g.min, 1) * 100;
          const isAdded = g.addedToday || added.has(g.id);
          const canAdd = isToday && !done && !isAdded;
          return (
            <button
              key={g.id}
              type="button"
              disabled={!canAdd || pending}
              onClick={() => canAdd && addToday(g.id)}
              className={`shrink-0 w-28 bg-white rounded-2xl shadow-sm p-2.5 text-left ${canAdd ? "active:scale-95 transition-transform" : "cursor-default"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">{g.icon}</span>
                <span className="text-[11px] font-black tabular-nums" style={{ color: done ? "#16a34a" : accentColor }}>
                  {g.count}/{g.min}{done ? " ✅" : ""}
                </span>
              </div>
              <div className="mt-1 text-[11px] font-bold text-gray-700 leading-tight line-clamp-2 h-[26px]">{g.name}</div>
              <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: done ? "#22c55e" : accentColor }} />
              </div>
              {canAdd ? (
                <div className="mt-1.5 text-[10px] font-black text-center rounded-full py-0.5" style={{ background: accentColor + "22", color: accentColor }}>+ Today</div>
              ) : (
                <div className="mt-1.5 text-[10px] font-bold text-center text-gray-400 py-0.5">{done ? "Done!" : isAdded ? "Added ✓" : " "}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
