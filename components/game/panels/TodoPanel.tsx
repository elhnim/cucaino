"use client";

import { useEffect, useState } from "react";
import { WorldPanelShell } from "./WorldPanelShell";
import { getTodoPanelData, type TodoPanelData } from "@/lib/actions/world-panels";
import TodoTaskCard from "@/components/kid/TodoTaskCard";
import AddTaskButton from "@/components/kid/AddTaskButton";
import WeeklyGoals from "@/components/kid/WeeklyGoals";

export function TodoPanel({
  kidId,
  accentColor,
  onClose,
  onOpenPage,
}: {
  kidId: string;
  accentColor: string;
  onClose: () => void;
  /** open a full app page inside the world (week view, other days, ...) */
  onOpenPage?: (src: string, title: string) => void;
}) {
  const [data, setData] = useState<TodoPanelData | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    getTodoPanelData(kidId).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [kidId]);

  return (
    <WorldPanelShell title="📋 Schedule" onClose={onClose}>
      {data === "loading" ? (
        <p style={{ textAlign: "center", color: "#a06a3c", padding: "24px 0" }}>Loading…</p>
      ) : !data ? (
        <p style={{ textAlign: "center", color: "#a06a3c", padding: "24px 0" }}>Couldn&apos;t load your schedule.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {onOpenPage && (
            <button type="button" style={moreBtnStyle} onClick={() => onOpenPage(`/kid/${kidId}/todo`, "📅 My whole week")}>
              📅 See my whole week
            </button>
          )}
          {data.selfAddableTasks.length > 0 && (
            <AddTaskButton
              kidId={kidId}
              availableTasks={data.selfAddableTasks}
              accentColor={accentColor}
              date={data.activeDateStr}
              dayLabel="today"
            />
          )}
          {data.weeklyGoals.length > 0 && (
            <WeeklyGoals goals={data.weeklyGoals} kidId={kidId} accentColor={accentColor} isToday />
          )}
          {data.todayTasks.length === 0 ? (
            <p style={{ textAlign: "center", color: "#a06a3c", padding: "12px 0" }}>Nothing left today — enjoy! 🎉</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.todayTasks.map((task) => (
                <TodoTaskCard
                  key={task.id}
                  task={task}
                  initialCompletion={data.completions.find((c) => c.taskId === task.id)}
                  initialCompletionCount={data.completions.filter((c) => c.taskId === task.id).length}
                  isToday
                  isPast={false}
                  isFuture={false}
                  kidId={kidId}
                  accentColor={accentColor}
                  initiallyPending={data.completions.some((c) => c.taskId === task.id && c.pendingParentApproval)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </WorldPanelShell>
  );
}

const moreBtnStyle: React.CSSProperties = {
  width: "100%",
  border: "2px dashed #e8c07a",
  borderRadius: 16,
  padding: "10px 14px",
  fontWeight: 800,
  color: "#6b4a1f",
  background: "#fffaf0",
  cursor: "pointer",
};
