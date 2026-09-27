"use client";

import { CandySheet } from "./ui/CandySheet";

// Rides & Games at the station: real 3D rides (Quiz Coaster, Mini Golf) plus the money,
// reading and brain games, which open inside an in-park window.
export interface RideEntry {
  id: string;
  emoji: string;
  name: string;
  blurb: string;
  color: string;
  /** "coaster" / "golf" are real 3D rides; otherwise a page route shown in an in-park window */
  route: ((kidId: string) => string) | "coaster" | "golf" | "market" | "learn" | "library" | "theatre" | "arcade" | "money-town" | "bank";
}

export const RIDES: RideEntry[] = [
  { id: "coaster", emoji: "🎢", name: "Quiz Coaster", blurb: "Ride the rails, answer at every gate!", color: "#ff5fa8", route: "coaster" },
  { id: "golf", emoji: "⛳", name: "Mini Golf", blurb: "18 candy holes · portals, hills & water", color: "#2fcf8f", route: "golf" },
  { id: "trading", emoji: "📈", name: "Nugget Market", blurb: "Buy low, sell high!", color: "#22c55e", route: "market" },
  { id: "invest", emoji: "🏦", name: "The Bank", blurb: "Grow your money", color: "#4f46e5", route: "bank" },
  { id: "arcade", emoji: "🕹️", name: "AI Arcade", blurb: "Emoji stories & brain games", color: "#06b6d4", route: "arcade" },
  { id: "money-town", emoji: "💰", name: "Money Town", blurb: "Spin, earn and save", color: "#eab308", route: "money-town" },
  { id: "library", emoji: "📚", name: "Library", blurb: "Chapter books, earn stars", color: "#0ea5e9", route: "library" },
  { id: "theatre", emoji: "🎭", name: "Story Theatre", blurb: "Fables, myths & short tales", color: "#e84a8a", route: "theatre" },
  { id: "learn", emoji: "🎓", name: "Learning Tree", blurb: "Life-skill adventures", color: "#f43f5e", route: "learn" },
];

export function RidesMenu({ onPick, onClose }: { onPick: (ride: RideEntry) => void; onClose: () => void }) {
  return (
    <CandySheet title="🎢 Rides & Games" color="#a96bff" onClose={onClose}>
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
    </CandySheet>
  );
}
