"use client";

// One chore = one quest card. Same completion rules as the flat TodoTaskCard (same server
// actions, same window events, optimistic with rollback) in the candy park style, plus
// reps/checklist progress that survives a reload.
import { useEffect, useState, useTransition } from "react";
import { completeTask, uncompleteTask } from "@/lib/actions/completions";
import type { Task, TaskCompletion } from "@/lib/domain/types";
import { CandyButton } from "../ui/CandySheet";

export const CATEGORY_COLORS: Record<string, string> = {
  chore: "#ff5fa8",
  exercise: "#ff8a3d",
  music: "#a96bff",
  activity: "#36b8ff",
  personal: "#2fcf8f",
  brainy: "#f5b400",
  school_subject: "#6c8cff",
};

function progressKey(kidId: string, taskId: string) {
  const d = new Date();
  return `cucaino.quest.${kidId}.${taskId}.${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function loadProgress<T>(kidId: string, taskId: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(progressKey(kidId, taskId));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveProgress(kidId: string, taskId: string, value: unknown) {
  try {
    window.localStorage.setItem(progressKey(kidId, taskId), JSON.stringify(value));
  } catch {
    // progress is a convenience; completion itself is saved on the server
  }
}

export function QuestCard({
  task,
  kidId,
  completions,
  isToday,
  isPast,
  onOpenPage,
}: {
  task: Task;
  kidId: string;
  completions: TaskCompletion[];
  isToday: boolean;
  isPast: boolean;
  /** timed / music tasks open the Practice Stage inside the park */
  onOpenPage: (src: string, title: string) => void;
}) {
  const color = CATEGORY_COLORS[task.category] ?? "#ff5fa8";
  const mine = completions.filter((c) => c.taskId === task.id);
  const freq = Math.max(1, task.frequencyPerDay ?? 1);
  const [count, setCount] = useState(Math.min(mine.length, freq));
  const [done, setDone] = useState(mine.length >= freq);
  const [pendingApproval, setPendingApproval] = useState(mine.some((c) => c.pendingParentApproval));
  const [pop, setPop] = useState(false);
  const [isPending, start] = useTransition();
  const [reps, setReps] = useState(0);
  const [checked, setChecked] = useState<number[]>([]);

  useEffect(() => {
    setReps(loadProgress(kidId, task.id, 0));
    setChecked(loadProgress<number[]>(kidId, task.id, []));
  }, [kidId, task.id]);

  useEffect(() => {
    if (!pop) return;
    const t = window.setTimeout(() => setPop(false), 1400);
    return () => window.clearTimeout(t);
  }, [pop]);

  const canAct = isToday && !isPending;

  const complete = () => {
    if (!canAct) return;
    const nextCount = count + 1;
    const finishing = nextCount >= freq;
    if (task.requiresParentApproval) setPendingApproval(true);
    else {
      setCount(nextCount);
      if (finishing) setDone(true);
      setPop(true);
      window.dispatchEvent(new CustomEvent("task-completed", { detail: { points: task.points, name: task.name, icon: task.icon } }));
    }
    start(async () => {
      const result = await completeTask(
        task.id,
        kidId,
        task.points,
        task.familyPointsContribution,
        task.category,
        freq,
        task.cashValueCents,
        task.requiresParentApproval,
      );
      if (!result.ok) {
        // roll back the optimistic update (e.g. RLS / network failure)
        setPendingApproval(false);
        if (!task.requiresParentApproval) {
          setCount(count);
          setDone(count >= freq);
          window.dispatchEvent(new CustomEvent("task-uncompleted", { detail: { points: task.points } }));
        }
        return;
      }
      if (result.newTiers && result.newTiers.length > 0) {
        window.dispatchEvent(new CustomEvent("badge-unlocked", { detail: { badges: result.newTiers } }));
      }
    });
  };

  const undo = () => {
    if (!canAct || freq > 1) return;
    setDone(false);
    setCount(0);
    setReps(0);
    setChecked([]);
    saveProgress(kidId, task.id, 0);
    window.dispatchEvent(new CustomEvent("task-uncompleted", { detail: { points: task.points } }));
    start(async () => {
      await uncompleteTask(task.id, kidId);
    });
  };

  const addRep = () => {
    if (!canAct || done) return;
    const target = task.targetReps ?? 1;
    const next = reps + 1;
    setReps(next);
    saveProgress(kidId, task.id, next);
    if (next >= target) complete();
  };

  const toggleItem = (i: number) => {
    if (!canAct || done) return;
    const items = task.checklistItems ?? [];
    const next = checked.includes(i) ? checked.filter((x) => x !== i) : [...checked, i];
    setChecked(next);
    saveProgress(kidId, task.id, next);
    if (next.length === items.length) complete();
  };

  const timed = (task.target === "time" && task.targetDurationMinutes) || (task.requiresTimer && task.durationMinutes);
  const minutes = task.targetDurationMinutes ?? task.durationMinutes;

  let action: React.ReactNode = null;
  if (pendingApproval) {
    action = <span style={{ ...tag, background: "#fff3c4", color: "#946200" }}>✋ Waiting for a grown-up</span>;
  } else if (done) {
    action = (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ ...tag, background: "#dcfce7", color: "#15803d" }}>✅ +{task.points * freq} ⭐</span>
        {isToday && freq === 1 && (
          <button type="button" onClick={undo} style={undoBtn} aria-label="Undo">
            ↩
          </button>
        )}
      </div>
    );
  } else if (!isToday) {
    action = <span style={{ ...tag, background: "#f3e8f1", color: "#9b7090" }}>{isPast ? "Missed" : "Coming up"}</span>;
  } else if (freq > 1) {
    action = (
      <CandyButton color={color} onClick={complete} disabled={isPending}>
        +1 · {count}/{freq}
      </CandyButton>
    );
  } else if (task.target === "reps" && task.targetReps) {
    action = (
      <CandyButton color={color} onClick={addRep} disabled={isPending}>
        +1 · {reps}/{task.targetReps}
      </CandyButton>
    );
  } else if (timed) {
    action = (
      <CandyButton color={color} onClick={() => onOpenPage(`/kid/${kidId}/practice/${task.id}?from=park`, `${task.icon} ${task.name}`)}>
        ▶ Start
      </CandyButton>
    );
  } else if (!(task.target === "checklist" && task.checklistItems?.length)) {
    action = (
      <CandyButton color={color} onClick={complete} disabled={isPending}>
        Done!
      </CandyButton>
    );
  }

  return (
    <div
      style={{
        ...card,
        borderColor: done ? "#bdf0cf" : `${color}55`,
        background: done ? "#f3fff7" : "#ffffff",
        transform: pop ? "scale(1.04)" : "none",
        boxShadow: pop ? `0 0 0 4px ${color}66, 0 10px 24px ${color}44` : card.boxShadow,
        opacity: !isToday && !done ? 0.75 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ ...iconBubble, background: `${color}22` }}>{pop ? "🎉" : task.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 16, color: done ? "#6b9b7d" : "#5a2350", textDecoration: done ? "line-through" : "none" }}>{task.name}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {!done && <span style={{ ...tag, background: "#fff3c4", color: "#946200" }}>⭐ {task.points}</span>}
            {task.cashValueCents > 0 && <span style={{ ...tag, background: "#e8fbef", color: "#15803d" }}>💵 ${(task.cashValueCents / 100).toFixed(2)}</span>}
            {minutes && timed ? <span style={{ ...tag, background: "#efe6ff", color: "#6b3fc9" }}>⏱ {minutes} min</span> : null}
            {task.description && <span style={{ fontSize: 12, color: "#9b7090", fontWeight: 700 }}>{task.description}</span>}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>{action}</div>
      </div>

      {task.target === "reps" && task.targetReps && !done && isToday && (
        <Bar value={reps / task.targetReps} color={color} label={`${reps} / ${task.targetReps} ${task.targetRepLabel ?? "reps"}`} />
      )}
      {task.target === "checklist" && (task.checklistItems?.length ?? 0) > 0 && !done && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {(task.checklistItems ?? []).map((item, i) => {
            const on = checked.includes(i);
            return (
              <button key={i} type="button" onClick={() => toggleItem(i)} disabled={!canAct} style={{ ...checkRow, background: on ? `${color}18` : "#fff7fb" }}>
                <span style={{ ...checkBox, borderColor: color, background: on ? color : "#fff" }}>{on ? "✓" : ""}</span>
                <span style={{ fontWeight: 800, color: on ? "#9b7090" : "#5a2350", textDecoration: on ? "line-through" : "none" }}>{item}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Bar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ height: 12, borderRadius: 999, background: "#f7e3ef", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(1, value) * 100}%`, borderRadius: 999, background: `linear-gradient(90deg, ${color}, #ffd84a)`, transition: "width 250ms ease" }} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#9b7090", marginTop: 4 }}>{label}</div>
    </div>
  );
}

const card: React.CSSProperties = {
  borderRadius: 22,
  border: "3px solid",
  padding: 12,
  boxShadow: "0 4px 0 #f5d3e6, 0 8px 18px rgba(122,46,98,0.08)",
  transition: "transform 200ms cubic-bezier(.2,1.5,.4,1), box-shadow 200ms ease",
};
const iconBubble: React.CSSProperties = { width: 52, height: 52, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, flexShrink: 0 };
const tag: React.CSSProperties = { borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" };
const undoBtn: React.CSSProperties = { border: "none", background: "#f3e8f1", color: "#9b7090", borderRadius: 999, width: 34, height: 34, fontWeight: 900, cursor: "pointer" };
const checkRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, border: "none", borderRadius: 14, padding: "8px 10px", textAlign: "left", cursor: "pointer" };
const checkBox: React.CSSProperties = { width: 24, height: 24, borderRadius: 8, border: "3px solid", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 14, flexShrink: 0 };
