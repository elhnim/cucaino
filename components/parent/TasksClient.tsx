"use client";

import { useState } from "react";
import TaskFormModal from "@/components/parent/TaskFormModal";
import { getCategory } from "@/lib/registry/category-registry";
import type { Kid, Task } from "@/lib/domain/types";

function scheduleLabel(type: string, days: number[]): string {
  if (type === "daily") return "Every day";
  if (type === "weekdays") return "Weekdays";
  if (type === "weekends") return "Weekends";
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days.map((d) => names[d - 1]).join(", ");
}

export default function TasksClient({
  tasks,
  kids,
}: {
  tasks: Task[];
  kids: Kid[];
}) {
  const [modal, setModal] = useState<"new" | Task | null>(null);
  const kidById = new Map(kids.map((k) => [k.id, k]));

  return (
    <>
      <div className="px-4 pt-4 pb-1 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {tasks.length} task{tasks.length === 1 ? "" : "s"} configured
        </p>
        <button
          type="button"
          onClick={() => setModal("new")}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2 rounded-xl flex items-center gap-1.5"
        >
          + New task
        </button>
      </div>

      <div className="p-4 space-y-2">
        {tasks.map((t) => {
          const cat = getCategory(t.category);
          const audience =
            t.kidIds === null
              ? "All kids"
              : t.kidIds
                  .map((id) => {
                    const k = kidById.get(id);
                    return k ? `${k.avatar} ${k.name}` : "";
                  })
                  .filter(Boolean)
                  .join(", ");
          return (
            <div
              key={t.id}
              className={`bg-white rounded-2xl shadow p-3 border-l-4 ${cat.borderClass}`}
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl">{t.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-bold">{t.name}</div>
                    <span className={`text-xs ${cat.badgeClass} px-2 py-0.5 rounded-full font-bold`}>
                      {cat.label}
                    </span>
                    {!t.requiresCompletion ? (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">
                        info only
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {audience} · {scheduleLabel(t.scheduleType, t.daysOfWeek)}
                    {t.startTime ? ` · ${t.startTime}` : ""}
                  </div>
                  <div className="text-xs text-gray-500">
                    {t.requiresTimer ? `${t.durationMinutes ?? "?"} min · timer · ` : ""}
                    {t.points > 0 ? `+${t.points}⭐` : "0⭐"}
                    {t.familyPointsContribution > 0 ? ` +${t.familyPointsContribution} fam` : ""}
                  </div>
                  {t.location ? (
                    <div className="text-xs text-blue-700 font-bold mt-1">📍 {t.location}</div>
                  ) : null}
                  {t.packingList && t.packingList.length > 0 ? (
                    <div className="text-xs text-blue-700 mt-1">
                      🎒 {t.packingList.join(", ")}
                    </div>
                  ) : null}
                  {t.defaultBpm ? (
                    <div className="text-xs text-amber-700 mt-1">
                      ♩ {t.defaultBpm} BPM · {t.defaultTimeSignature}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setModal(t)}
                  className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-lg font-bold shrink-0"
                >
                  Edit
                </button>
              </div>
            </div>
          );
        })}

        {tasks.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <div className="text-5xl mb-3">📋</div>
            <div className="font-bold">No tasks yet</div>
            <div className="text-sm mt-1">Tap &quot;+ New task&quot; to add one</div>
          </div>
        ) : null}
      </div>

      {modal ? (
        <TaskFormModal
          kids={kids}
          task={modal === "new" ? undefined : modal}
          onClose={() => setModal(null)}
        />
      ) : null}
    </>
  );
}
