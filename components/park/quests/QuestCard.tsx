"use client";

// One chore = one quest card. Same completion rules as the flat TodoTaskCard (same server
// actions, same window events, optimistic with rollback) as a game quest card — rarity edge by
// star value, reward chips, a clear Complete button — plus
// reps/checklist progress that survives a reload.
import { useEffect, useState, useTransition } from "react";
import { completeTask, uncompleteTask } from "@/lib/actions/completions";
import type { Task, TaskCompletion } from "@/lib/domain/types";
import { GameButton } from "../ui/GameButton";
import { Badge } from "../ui/Badge";
import { IconChip } from "../ui/IconChip";
import { ProgressBar } from "../ui/ProgressBar";
import { C, FONT, RARITY, alpha, rarityForStars } from "../ui/theme";
import { TICKETS_PER_QUEST } from "@/lib/park/builder/rules";

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
  const rarity = rarityForStars(task.points);
  const color = RARITY[rarity].color;
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
    action = <Badge color={C.gold}>✋ Waiting for a grown-up</Badge>;
  } else if (done) {
    action = (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Badge color={C.success}>✓ +{task.points * freq} ⭐</Badge>
        {isToday && freq === 1 && (
          <button type="button" onClick={undo} style={undoBtn} aria-label="Undo" className="gp-press">
            ↩
          </button>
        )}
      </div>
    );
  } else if (!isToday) {
    action = <Badge color={C.mute}>{isPast ? "Missed" : "Coming up"}</Badge>;
  } else if (freq > 1) {
    action = (
      <GameButton small onClick={complete} disabled={isPending}>
        +1 · {count}/{freq}
      </GameButton>
    );
  } else if (task.target === "reps" && task.targetReps) {
    action = (
      <GameButton small onClick={addRep} disabled={isPending}>
        +1 · {reps}/{task.targetReps}
      </GameButton>
    );
  } else if (timed) {
    action = (
      <GameButton small variant="magic" onClick={() => onOpenPage(`/kid/${kidId}/practice/${task.id}?from=park`, `${task.icon} ${task.name}`)}>
        ▶ Start
      </GameButton>
    );
  } else if (!(task.target === "checklist" && task.checklistItems?.length)) {
    action = (
      <GameButton small onClick={complete} disabled={isPending}>
        Complete
      </GameButton>
    );
  }

  const edge = done ? C.success : color;
  return (
    <div
      style={{
        ...card,
        background: `linear-gradient(90deg, ${alpha(edge, done ? 0.16 : 0.2)}, rgba(30,27,70,0.78) 38%) padding-box, linear-gradient(135deg, ${alpha(edge, 0.85)}, ${alpha(edge, 0.2)} 50%, ${alpha(edge, 0.55)}) border-box`,
        transform: pop ? "scale(1.03)" : "none",
        boxShadow: pop ? `0 0 0 2px ${alpha(color, 0.7)}, 0 0 28px ${alpha(color, 0.6)}` : `0 4px 14px rgba(0,0,0,0.3)${rarity === "legendary" && !done ? `, 0 0 16px ${alpha(color, 0.35)}` : ""}`,
        opacity: !isToday && !done ? 0.7 : 1,
      }}
    >
      {/* the rarity edge */}
      <span aria-hidden style={{ position: "absolute", left: 0, top: 8, bottom: 8, width: 4, borderRadius: "0 4px 4px 0", background: edge, boxShadow: `0 0 10px ${edge}` }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <IconChip color={done ? C.success : color} size={50} style={{ fontSize: 28, filter: done ? "saturate(0.6)" : undefined }}>
          {pop ? "🎉" : task.icon}
        </IconChip>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {!done && (
              <span style={{ fontFamily: FONT.display, fontWeight: 400, fontSize: 10.5, letterSpacing: 1.2, textTransform: "uppercase", color }}>{RARITY[rarity].label}</span>
            )}
          </div>
          <div style={{ fontWeight: 900, fontSize: 16.5, lineHeight: 1.2, color: done ? C.dim : C.text, textDecoration: done ? "line-through" : "none", textDecorationColor: alpha(C.success, 0.8) }}>{task.name}</div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 5 }}>
            {!done && <Badge color={C.gold}>⭐ {task.points}</Badge>}
            {!done && <Badge color={C.cyan}>🎟️ 1</Badge>}
            {task.cashValueCents > 0 && <Badge color={C.success}>💵 ${(task.cashValueCents / 100).toFixed(2)}</Badge>}
            {minutes && timed ? <Badge color={C.violet}>⏱ {minutes} min</Badge> : null}
            {task.description && <span style={{ fontSize: 12, color: C.dim, fontWeight: 700 }}>{task.description}</span>}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>{action}</div>
      </div>

      {task.target === "reps" && task.targetReps && !done && isToday && (
        <ProgressBar value={reps / task.targetReps} color={color} height={10} style={{ marginTop: 10 }} label={`${reps} / ${task.targetReps} ${task.targetRepLabel ?? "reps"}`} />
      )}
      {task.target === "checklist" && (task.checklistItems?.length ?? 0) > 0 && !done && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {(task.checklistItems ?? []).map((item, i) => {
            const on = checked.includes(i);
            return (
              <button key={i} type="button" onClick={() => toggleItem(i)} disabled={!canAct} className="gp-press" style={{ ...checkRow, background: on ? alpha(C.success, 0.12) : "rgba(255,255,255,0.05)", borderColor: on ? alpha(C.success, 0.5) : "rgba(160,190,255,0.16)" }}>
                <span style={{ ...checkBox, borderColor: on ? C.success : alpha(color, 0.8), background: on ? C.success : "rgba(0,0,0,0.25)", boxShadow: on ? `0 0 8px ${alpha(C.success, 0.7)}` : undefined }}>{on ? "✓" : ""}</span>
                <span style={{ fontWeight: 800, color: on ? C.dim : C.text, textDecoration: on ? "line-through" : "none" }}>{item}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  position: "relative",
  borderRadius: 16,
  border: "1.5px solid transparent",
  padding: "12px 12px 12px 16px",
  color: C.text,
  transition: "transform 200ms cubic-bezier(.2,1.5,.4,1), box-shadow 200ms ease",
};
const undoBtn: React.CSSProperties = {
  border: "1px solid rgba(160,190,255,0.3)",
  background: "rgba(255,255,255,0.08)",
  color: C.dim,
  borderRadius: 999,
  width: 44,
  height: 44,
  fontWeight: 900,
  fontSize: 16,
  cursor: "pointer",
};
const checkRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, border: "1px solid", borderRadius: 12, padding: "9px 10px", minHeight: 44, textAlign: "left", cursor: "pointer" };
const checkBox: React.CSSProperties = { width: 24, height: 24, borderRadius: 7, border: "2px solid", display: "flex", alignItems: "center", justifyContent: "center", color: "#062a19", fontWeight: 900, fontSize: 14, flexShrink: 0 };
