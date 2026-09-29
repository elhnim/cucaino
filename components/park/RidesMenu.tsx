"use client";

import { CandySheet } from "./ui/CandySheet";
import { C, alpha, display } from "./ui/theme";
import { IconChip } from "./ui/IconChip";

// Rides & Games at the station: real 3D rides (Quiz Coaster, Mini Golf) plus the money,
// reading and brain games, which open inside an in-park window.
export interface RideEntry {
  id: string;
  emoji: string;
  name: string;
  blurb: string;
  color: string;
  /** "coaster" / "golf" are real 3D rides; otherwise a page route shown in an in-park window */
  route: ((kidId: string) => string) | "coaster" | "golf" | "market" | "learn" | "library" | "theatre" | "retro" | "arcade" | "money-town" | "bank";
}

export const RIDES: RideEntry[] = [
  { id: "coaster", emoji: "🎢", name: "Quiz Coaster", blurb: "Ride the rails, answer at every gate!", color: "#ff5fa8", route: "coaster" },
  { id: "golf", emoji: "⛳", name: "Mini Golf", blurb: "18 candy holes · portals, hills & water", color: "#2fcf8f", route: "golf" },
  { id: "trading", emoji: "📈", name: "Nugget Market", blurb: "Buy low, sell high!", color: "#22c55e", route: "market" },
  { id: "invest", emoji: "🏦", name: "The Bank", blurb: "Grow your money", color: "#4f46e5", route: "bank" },
  { id: "arcade", emoji: "🕹️", name: "AI Arcade", blurb: "Emoji stories & brain games", color: "#06b6d4", route: "arcade" },
  { id: "money-town", emoji: "💰", name: "Money Town", blurb: "Spin, earn and save", color: "#eab308", route: "money-town" },
  { id: "retro", emoji: "👾", name: "Retro Arcade", blurb: "20 classic-style pixel games", color: "#9a5cff", route: "retro" },
  { id: "library", emoji: "📚", name: "Library", blurb: "Chapter books, earn stars", color: "#0ea5e9", route: "library" },
  { id: "theatre", emoji: "🎭", name: "Story Theatre", blurb: "Fables, myths & short tales", color: "#e84a8a", route: "theatre" },
  { id: "learn", emoji: "🎓", name: "Learning Tree", blurb: "Life-skill adventures", color: "#f43f5e", route: "learn" },
];

export function RidesMenu({ onPick, onClose }: { onPick: (ride: RideEntry) => void; onClose: () => void }) {
  return (
    <CandySheet title="🎢 Rides & Games" subtitle="Pick an adventure" color={C.violet} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
        {RIDES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onPick(r)}
            className="gp-press"
            style={{
              position: "relative",
              overflow: "hidden",
              border: "1.5px solid transparent",
              borderRadius: 16,
              padding: "12px 12px 14px",
              textAlign: "left",
              background: `radial-gradient(120% 90% at 0% 0%, ${alpha(r.color, 0.4)}, rgba(28,24,70,0.85) 60%) padding-box, linear-gradient(135deg, ${alpha(r.color, 0.95)}, ${alpha(r.color, 0.2)} 55%, ${alpha(C.gold, 0.5)}) border-box`,
              color: C.text,
              boxShadow: `0 6px 16px rgba(0,0,0,0.35), 0 0 14px ${alpha(r.color, 0.25)}`,
              cursor: "pointer",
              touchAction: "manipulation",
              minHeight: 118,
            }}
          >
            <IconChip color={r.color} size={46} style={{ fontSize: 26 }}>
              {r.emoji}
            </IconChip>
            <div style={{ ...display(17), marginTop: 8 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: C.dim, fontWeight: 700, marginTop: 2 }}>{r.blurb}</div>
          </button>
        ))}
      </div>
    </CandySheet>
  );
}
