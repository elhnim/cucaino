"use client";

import { useCallback, useEffect, useState } from "react";
import { getQuestBoard, type QuestBoardData } from "@/lib/actions/park-quests";
import AddTaskButton from "@/components/kid/AddTaskButton";
import WeeklyGoals from "@/components/kid/WeeklyGoals";
import { SUBJECTS } from "@/lib/registry/subject-registry";
import { CandySheet } from "../ui/CandySheet";
import { C, FONT, alpha, cardStyle, display, mutedText, sectionLabel } from "../ui/theme";
import { ProgressBar } from "../ui/ProgressBar";
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
        <ProgressBar value={total ? doneCount / total : 0} height={10} shimmer={doneCount < total} style={{ marginTop: 8, maxWidth: 360 }} />
        <div style={{ marginTop: 6 }}>
          {data.isToday ? (
            <>
              <b style={{ fontFamily: FONT.display, fontWeight: 400, color: C.text, fontSize: 15 }}>
                {doneCount}/{total}
              </b>{" "}
              quests done{starsLeft > 0 ? <> · <b style={{ color: C.gold }}>{starsLeft} ⭐</b> to win</> : ""}
            </>
          ) : data.isPast ? (
            "Looking back"
          ) : (
            "Coming up"
          )}
        </div>
      </div>
    ) : null;

  return (
    <CandySheet title="📜 Quest Board" subtitle={subtitle} color={C.gold} onClose={onClose}>
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
                  className="gp-press"
                  style={{
                    ...cardStyle(on ? "gold" : d.isToday ? C.cyan : "soft", on ? "rgba(70,50,14,0.85)" : "rgba(34,30,78,0.6)"),
                    flex: "1 0 44px",
                    minWidth: 44,
                    borderRadius: 12,
                    padding: "6px 0",
                    color: on ? C.goldHi : C.text,
                    boxShadow: on ? `0 0 12px ${alpha(C.gold, 0.45)}, inset 0 1px 0 rgba(255,255,255,0.15)` : undefined,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", color: on ? C.gold : d.isToday ? C.cyan : C.mute }}>{d.isToday ? "Today" : d.label}</div>
                  <div style={{ fontFamily: FONT.display, fontWeight: 400, fontSize: 19, lineHeight: 1.15 }}>{d.date}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{d.total > 0 ? `${d.total} quests` : "—"}</div>
                </button>
              );
            })}
          </div>

          {allDone && (
            <div style={allDoneStyle}>
              <span className="gp-shimmer" />
              <div style={{ fontSize: 40, filter: "drop-shadow(0 0 12px rgba(255,194,61,0.8))" }}>🏆</div>
              <div style={{ ...display(24, C.goldHi), textTransform: "uppercase", letterSpacing: 1 }}>All quests complete!</div>
              <div style={{ fontWeight: 800, fontSize: 14, color: C.dim, marginTop: 4 }}>Fireworks are going off in the park — go play! 🎢</div>
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
                    <span key={t.id} style={{ borderRadius: 999, padding: "5px 12px", fontWeight: 800, fontSize: 13, background: alpha(C.cyan, 0.1), border: `1px solid ${alpha(C.cyan, 0.35)}`, color: "#c9f8ff" }}>
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
      <div style={sectionLabel}>
        <span>{label}</span>
        <span aria-hidden style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${alpha(C.gold, 0.55)}, transparent)` }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

const muted = mutedText;
const allDoneStyle: React.CSSProperties = {
  ...cardStyle("gold", "rgba(70,46,10,0.8)"),
  position: "relative",
  overflow: "hidden",
  textAlign: "center",
  borderRadius: 18,
  padding: "16px 12px",
  boxShadow: `0 0 24px ${alpha("#ffc23d", 0.45)}, inset 0 0 30px ${alpha("#ffc23d", 0.18)}`,
};
