"use client";

import { WorldPanelShell } from "@/components/game/panels/WorldPanelShell";

// Rides & Games at the station. Phase 1 opens today's games; each becomes a real 3D ride
// (Quiz Coaster, Nugget Market street, Theatre...) in later phases of the park rebuild.
export interface RideEntry {
  id: string;
  emoji: string;
  name: string;
  blurb: string;
  color: string;
  /** "quiz" opens the in-park quiz; otherwise a page route shown in an in-park window */
  route: ((kidId: string) => string) | "quiz";
}

export const RIDES: RideEntry[] = [
  { id: "quiz", emoji: "🎯", name: "Quiz Coaster", blurb: "Answer questions, win stars", color: "#ff5fa8", route: "quiz" },
  { id: "trading", emoji: "📈", name: "Nugget Market", blurb: "Buy low, sell high!", color: "#22c55e", route: (id) => `/play/trading?kid=${id}` },
  { id: "invest", emoji: "🏦", name: "The Bank", blurb: "Grow your money", color: "#4f46e5", route: (id) => `/play/invest?kid=${id}` },
  { id: "arcade", emoji: "🕹️", name: "AI Arcade", blurb: "Emoji stories & brain games", color: "#06b6d4", route: (id) => `/play/arcade?kid=${id}` },
  { id: "money-town", emoji: "💰", name: "Money Town", blurb: "Spin, earn and save", color: "#eab308", route: (id) => `/play/money-town?kid=${id}` },
  { id: "library", emoji: "📖", name: "Story Theatre", blurb: "Read stories, earn stars", color: "#0ea5e9", route: (id) => `/play/library?kid=${id}` },
  { id: "learn", emoji: "🎓", name: "Learn", blurb: "Life-skill adventures", color: "#f43f5e", route: (id) => `/play/learn?kid=${id}` },
];

export function RidesMenu({ onPick, onClose }: { onPick: (ride: RideEntry) => void; onClose: () => void }) {
  return (
    <WorldPanelShell title="🎢 Rides & Games" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
        {RIDES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onPick(r)}
            style={{
              border: "none",
              borderRadius: 22,
              padding: "14px 12px",
              textAlign: "left",
              background: `linear-gradient(160deg, ${r.color}, ${r.color}cc)`,
              color: "#fff",
              boxShadow: `0 6px 0 ${r.color}88, 0 10px 18px rgba(0,0,0,0.12)`,
              cursor: "pointer",
              touchAction: "manipulation",
            }}
          >
            <div style={{ fontSize: 34, lineHeight: 1 }}>{r.emoji}</div>
            <div style={{ fontWeight: 900, fontSize: 16, marginTop: 6 }}>{r.name}</div>
            <div style={{ fontSize: 12, opacity: 0.92, fontWeight: 700 }}>{r.blurb}</div>
          </button>
        ))}
      </div>
    </WorldPanelShell>
  );
}
