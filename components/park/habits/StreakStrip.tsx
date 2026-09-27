"use client";

// Top of the Quest Board: this week's streak flames (🔥 done, 🛡️ shielded, ○ missed), the run
// so far, and the milestone rewards — claim them right here when you reach them.
import { useEffect, useState } from "react";
import { claimStreakReward, getHabits, type HabitState } from "@/lib/actions/park-habits";
import { STREAK_MILESTONES, claimableMilestones } from "@/lib/park/streak";
import { playSfx } from "@/lib/audio/sound-manager";

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
        <div style={{ textAlign: "center", minWidth: 64 }}>
          <div style={{ fontSize: 30, lineHeight: 1, filter: streak.current ? undefined : "grayscale(1)" }}>🔥</div>
          <div style={{ fontWeight: 900, fontSize: 20, color: "#c2410c" }}>{streak.current}</div>
          <div style={{ fontWeight: 800, fontSize: 11, color: "#9a6a4a" }}>day{streak.current === 1 ? "" : "s"}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
            {streak.week.map((d) => {
              const [y, m, dd] = d.date.split("-").map(Number);
              const dow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
              const icon = d.state === "done" ? "🔥" : d.state === "shield" ? "🛡️" : d.state === "today" ? "⭐" : "·";
              return (
                <div key={d.date} style={{ flex: 1, textAlign: "center" }}>
                  <div
                    style={{
                      height: 34,
                      borderRadius: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: d.state === "missed" ? 22 : 18,
                      color: "#d6b4a0",
                      background: d.state === "done" ? "#ffe2c2" : d.state === "shield" ? "#dbeafe" : d.state === "today" ? "#fff" : "#f7ede6",
                      boxShadow: d.state === "today" ? "inset 0 0 0 2px #fb923c" : undefined,
                    }}
                  >
                    {icon}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 900, color: "#9a6a4a", marginTop: 2 }}>{d.state === "today" || (d.state === "done" && d === streak.week[6]) ? "TODAY" : DOW[dow]}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontWeight: 800, fontSize: 12, color: "#9a6a4a", marginTop: 6 }}>
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
              className={can ? "quest-wiggle" : undefined}
              style={{
                flex: "1 1 70px",
                border: "none",
                borderRadius: 14,
                padding: "6px 4px",
                fontWeight: 900,
                fontSize: 12,
                cursor: can ? "pointer" : "default",
                color: can ? "#fff" : got ? "#15803d" : "#b08a70",
                background: can ? "linear-gradient(#fb923c, #f97316)" : got ? "#dcfce7" : "#f7ede6",
                boxShadow: can ? "0 3px 0 #c2410c" : undefined,
              }}
            >
              {m.emoji} {m.days}d {got ? "✓" : can ? `Claim +${m.tickets}🎟️` : `+${m.tickets}🎟️`}
            </button>
          );
        })}
      </div>
      <div style={{ fontWeight: 800, fontSize: 11, color: "#9a6a4a", marginTop: 6 }}>🛡️ Each week one missed day is covered by a free shield.</div>
      {msg && <div style={{ fontWeight: 900, fontSize: 13, color: "#c2410c", marginTop: 6 }}>{msg}</div>}
    </div>
  );
}

const card: React.CSSProperties = {
  borderRadius: 22,
  padding: 12,
  marginBottom: 12,
  background: "linear-gradient(#fff7ed, #ffffff)",
  boxShadow: "0 4px 0 #fed7aa",
};
