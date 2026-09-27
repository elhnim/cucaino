"use client";

import { useCallback, useEffect, useState } from "react";
import { getQuestBoard, type QuestBoardData } from "@/lib/actions/park-quests";
import AddTaskButton from "@/components/kid/AddTaskButton";
import WeeklyGoals from "@/components/kid/WeeklyGoals";
import { SUBJECTS } from "@/lib/registry/subject-registry";
import { CandySheet } from "../ui/CandySheet";
import { QuestCard } from "./QuestCard";
import { StreakStrip } from "../habits/StreakStrip";

/** The Quest Board: today's chores as quests, the week at a glance, weekly goals, self-add. */
export function QuestBoard({
  kidId,
  accentColor,
  onClose,
  onOpenPage,
  refreshKey,
}: {
  kidId: string;
  accentColor: string;
  onClose: () => void;
  onOpenPage: (src: string, title: string) => void;
  /** bump to reload (e.g. after the Practice Stage window closes) */
  refreshKey?: number;
}) {
  const [dow, setDow] = useState<number | undefined>(undefined);
  const [data, setData] = useState<QuestBoardData | null | "loading">("loading");
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    let cancelled = false;
    getQuestBoard(kidId, dow).then((d) => {
      if (cancelled) return;
      setData(d);
      if (d) setDoneIds(new Set(d.completions.map((c) => c.taskId)));
    });
    return () => {
      cancelled = true;
    };
  }, [kidId, dow]);

  useEffect(load, [load, refreshKey]);

  // track completions live for the progress bar + all-done moment
  useEffect(() => {
    const onDone = () => setTimeout(() => load(), 900);
    window.addEventListener("task-completed", onDone);
    window.addEventListener("task-uncompleted", onDone);
    return () => {
      window.removeEventListener("task-completed", onDone);
      window.removeEventListener("task-uncompleted", onDone);
    };
  }, [load]);

  const all = data && data !== "loading" ? [...data.beforeSchool, ...data.quests] : [];
  const total = all.length;
  const doneCount = all.filter((t) => doneIds.has(t.id)).length;
  const starsLeft = all.filter((t) => !doneIds.has(t.id)).reduce((a, t) => a + t.points, 0);
  const allDone = data && data !== "loading" && data.isToday && total > 0 && doneCount >= total;

  const subtitle =
    data && data !== "loading" ? (
      <div>
        <div style={{ height: 14, borderRadius: 999, background: "rgba(255,255,255,0.35)", overflow: "hidden", marginTop: 6, maxWidth: 360 }}>
          <div style={{ height: "100%", width: `${total ? (doneCount / total) * 100 : 0}%`, background: "linear-gradient(90deg,#fff39a,#ffffff)", borderRadius: 999, transition: "width 300ms ease" }} />
        </div>
        <div style={{ marginTop: 4 }}>
          {data.isToday ? `${doneCount}/${total} quests done${starsLeft > 0 ? ` · ${starsLeft} ⭐ to win` : ""}` : data.isPast ? "Looking back" : "Coming up"}
        </div>
      </div>
    ) : null;

  return (
    <CandySheet title="📋 Quest Board" subtitle={subtitle} color="#ff5fa8" onClose={onClose}>
      <StreakStrip kidId={kidId} refreshKey={refreshKey} />
      {data === "loading" ? (
        <p style={muted}>Loading your quests…</p>
      ) : !data ? (
        <p style={muted}>Couldn&apos;t load your quests.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* week strip */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            {data.days.map((d) => {
              const on = d.dow === data.activeDow;
              return (
                <button
                  key={d.dow}
                  type="button"
                  onClick={() => setDow(d.dow)}
                  style={{
                    flex: "1 0 44px",
                    minWidth: 44,
                    border: "none",
                    borderRadius: 16,
                    padding: "6px 0",
                    background: on ? "linear-gradient(#ff7fbd,#ff4f9e)" : d.isToday ? "#ffe3f1" : "#fff",
                    color: on ? "#fff" : "#7a2e62",
                    boxShadow: on ? "0 4px 0 #d23a82" : "0 3px 0 #f5d3e6",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 11, opacity: 0.85 }}>{d.isToday ? "Today" : d.label}</div>
                  <div style={{ fontSize: 17 }}>{d.date}</div>
                  <div style={{ fontSize: 10 }}>{d.total > 0 ? `${d.total} 📋` : "—"}</div>
                </button>
              );
            })}
          </div>

          {allDone && (
            <div style={allDoneStyle}>
              <div style={{ fontSize: 40 }}>🎆🏆🎆</div>
              <div style={{ fontWeight: 900, fontSize: 20 }}>All quests done!</div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Fireworks are going off in the park — go play! 🎢</div>
            </div>
          )}

          {data.selfAddable.length > 0 && !data.isPast && (
            <AddTaskButton kidId={kidId} availableTasks={data.selfAddable} accentColor={accentColor} date={data.activeDateStr} dayLabel={data.isToday ? "today" : "that day"} />
          )}
          {data.weeklyGoals.length > 0 && <WeeklyGoals goals={data.weeklyGoals} kidId={kidId} accentColor={accentColor} isToday={data.isToday} />}

          {data.beforeSchool.length > 0 && (
            <Section label="🌅 Before school">
              {data.beforeSchool.map((t) => (
                <QuestCard key={t.id} task={t} kidId={kidId} completions={data.completions} isToday={data.isToday} isPast={data.isPast} onOpenPage={onOpenPage} />
              ))}
            </Section>
          )}

          {data.school.length > 0 && (
            <Section label="🏫 School today">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {data.school.map((t) => {
                  const subj = t.subject ? SUBJECTS[t.subject as keyof typeof SUBJECTS] : undefined;
                  return (
                    <span key={t.id} style={{ borderRadius: 999, padding: "5px 12px", fontWeight: 800, fontSize: 13, background: "#eef1ff", color: "#4b5bd6" }}>
                      {t.icon || subj?.icon} {t.name}
                    </span>
                  );
                })}
              </div>
            </Section>
          )}

          <Section label={data.beforeSchool.length > 0 ? "🎈 After school" : "🎈 Quests"}>
            {data.quests.length === 0 ? (
              <p style={muted}>{data.isToday ? "No quests left — free play time! 🎉" : "Nothing planned."}</p>
            ) : (
              data.quests.map((t) => (
                <QuestCard key={t.id} task={t} kidId={kidId} completions={data.completions} isToday={data.isToday} isPast={data.isPast} onOpenPage={onOpenPage} />
              ))
            )}
          </Section>
        </div>
      )}
    </CandySheet>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontWeight: 900, fontSize: 13, letterSpacing: 1, color: "#c26a9f", textTransform: "uppercase", margin: "0 4px 8px" }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

const muted: React.CSSProperties = { textAlign: "center", color: "#b0799f", fontWeight: 800, padding: "18px 0" };
const allDoneStyle: React.CSSProperties = {
  textAlign: "center",
  borderRadius: 24,
  padding: "14px 12px",
  color: "#fff",
  background: "linear-gradient(135deg,#ff7fbd,#a96bff 55%,#36b8ff)",
  boxShadow: "0 6px 0 #8a4fd6",
};
