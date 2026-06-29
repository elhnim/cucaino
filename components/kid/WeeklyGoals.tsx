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
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 px-1">🎯 This week's goals</div>
      <div className="space-y-2">
        {goals.map((g) => {
          const done = g.count >= g.min;
          const pct = Math.min(g.count / g.min, 1) * 100;
          const isAdded = g.addedToday || added.has(g.id);
          return (
            <div key={g.id} className="bg-white rounded-2xl shadow-sm p-3 flex items-center gap-3">
              <span className="text-2xl shrink-0">{g.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-gray-800 truncate">{g.name}</span>
                  <span className="text-xs font-black shrink-0" style={{ color: done ? "#16a34a" : accentColor }}>
                    {g.count}/{g.min} {done ? "✅" : ""}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: done ? "#22c55e" : accentColor }} />
                </div>
              </div>
              {isToday && !done && (
                isAdded ? (
                  <span className="text-[11px] font-bold text-gray-400 shrink-0">Added ✓</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => addToday(g.id)}
                    disabled={pending}
                    className="shrink-0 text-xs font-black text-white rounded-full px-3 py-1.5 active:scale-95 transition-transform disabled:opacity-50"
                    style={{ background: accentColor }}
                  >
                    + Today
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
