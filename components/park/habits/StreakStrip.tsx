"use client";

// Top of the Quest Board: this week's streak flames (🔥 done, 🛡️ shielded, ○ missed), the run
// so far, and the milestone rewards — claim them right here when you reach them.
import { useEffect, useState } from "react";
import { claimStreakReward, getHabits, type HabitState } from "@/lib/actions/park-habits";
import { STREAK_MILESTONES, claimableMilestones } from "@/lib/park/streak";
import { playSfx } from "@/lib/audio/sound-manager";
import { C, FONT, alpha, cardStyle } from "../ui/theme";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export function StreakStrip({ kidId, refreshKey }: { kidId: string; refreshKey?: number }) {
  const [h, setH] = useState<HabitState | null>(null);
  const [claiming, setClaiming] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getHabits(kidId)
      .then((x) => live && setH(x))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [kidId, refreshKey]);

  // a quest finished while the board is open can start (or extend) today's flame
  useEffect(() => {
    const again = () => getHabits(kidId).then(setH).catch(() => {});
    window.addEventListener("task-completed", again);
    window.addEventListener("task-uncompleted", again);
    return () => {
      window.removeEventListener("task-completed", again);
      window.removeEventListener("task-uncompleted", again);
    };
  }, [kidId]);

  if (!h) return <div style={{ ...card, minHeight: 92 }} />;
  const { streak } = h;
  const ready = claimableMilestones(streak.current, h.claims);
  const next = streak.next;

  const claim = async (days: number) => {
    setClaiming(days);
    const res = await claimStreakReward(kidId, days);
    setClaiming(null);
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    playSfx("win");
    setMsg(`🎉 ${res.title}! Tickets added.`);
    window.dispatchEvent(new CustomEvent("tickets-changed", { detail: { tickets: res.tickets } }));
    setH((x) => (x ? { ...x, claims: [...x.claims, days], tickets: res.tickets } : x));
  };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ textAlign: "center", minWidth: 58 }}>
          <div style={{ fontSize: 30, lineHeight: 1, filter: streak.current ? `drop-shadow(0 0 10px ${alpha(C.fire, 0.9)})` : "grayscale(1) opacity(0.6)" }}>🔥</div>
          <div style={{ fontFamily: FONT.display, fontWeight: 400, fontSize: 26, lineHeight: 1.05, color: streak.current ? "#ffc58a" : C.dim, textShadow: streak.current ? `0 0 12px ${alpha(C.fire, 0.6)}` : undefined }}>{streak.current}</div>
          <div style={{ fontWeight: 800, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.dim }}>day{streak.current === 1 ? "" : "s"}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
            {streak.week.map((d) => {
              const [y, m, dd] = d.date.split("-").map(Number);
              const dow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
              const icon = d.state === "done" ? "🔥" : d.state === "shield" ? "🛡️" : d.state === "today" ? "⭐" : "·";
              const tone = d.state === "done" ? C.fire : d.state === "shield" ? "#4fa8ff" : d.state === "today" ? C.gold : "#6b6f8e";
              return (
                <div key={d.date} style={{ flex: 1, textAlign: "center" }}>
                  <div
                    style={{
                      height: 34,
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: d.state === "missed" ? 22 : 17,
                      color: C.mute,
                      background: d.state === "missed" ? "rgba(255,255,255,0.04)" : alpha(tone, 0.16),
                      border: `1px solid ${alpha(tone, d.state === "missed" ? 0.25 : 0.6)}`,
                      boxShadow: d.state === "today" ? `0 0 10px ${alpha(C.gold, 0.6)}` : d.state === "done" ? `inset 0 0 10px ${alpha(C.fire, 0.25)}` : undefined,
                    }}
                  >
                    {icon}
                  </div>
                  <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.4, color: d.state === "today" ? C.gold : C.mute, marginTop: 3 }}>{d.state === "today" || (d.state === "done" && d === streak.week[6]) ? "TODAY" : DOW[dow]}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontWeight: 800, fontSize: 12.5, color: C.dim, marginTop: 7 }}>
            {!streak.doneToday
              ? streak.current > 0
                ? "Finish a quest today to keep your flame alive!"
                : "Finish a quest today to light your first flame!"
              : next
                ? `${next.days - streak.current} more day${next.days - streak.current === 1 ? "" : "s"} to ${next.emoji} ${next.title} (+${next.tickets} 🎟️)`
                : "You're a streak legend! 👑"}
          </div>
        </div>
      </div>
      {/* the milestone track */}
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {STREAK_MILESTONES.map((m) => {
          const got = h.claims.includes(m.days);
          const can = ready.some((r) => r.days === m.days);
          return (
            <button
              key={m.days}
              type="button"
              disabled={!can || claiming !== null}
              onClick={() => void claim(m.days)}
              className={can ? "gp-press gp-glow" : undefined}
              style={{
                flex: "1 1 70px",
                minHeight: 44,
                borderRadius: 12,
                padding: "5px 4px",
                fontFamily: FONT.display,
                fontWeight: 400,
                fontSize: 13,
                letterSpacing: 0.3,
                lineHeight: 1.15,
                cursor: can ? "pointer" : "default",
                color: can ? C.ink : got ? C.success : C.dim,
                border: `1px solid ${can ? "#fff0b8" : got ? alpha(C.success, 0.5) : "rgba(160,190,255,0.18)"}`,
                background: can ? `linear-gradient(${C.goldHi}, ${C.gold} 50%, ${C.goldDeep})` : got ? alpha(C.success, 0.12) : "rgba(255,255,255,0.04)",
              }}
            >
              {m.emoji} {m.days}d {got ? "✓" : can ? `Claim +${m.tickets}🎟️` : `+${m.tickets}🎟️`}
            </button>
          );
        })}
      </div>
      <div style={{ fontWeight: 700, fontSize: 11.5, color: C.mute, marginTop: 7 }}>🛡️ Each week one missed day is covered by a free shield.</div>
      {msg && <div style={{ fontWeight: 900, fontSize: 13, color: C.gold, marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

const card: React.CSSProperties = {
  ...cardStyle(C.fire, "rgba(40,24,40,0.72)"),
  padding: 12,
  marginBottom: 12,
};
