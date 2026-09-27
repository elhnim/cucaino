"use client";

// The Retro Arcade hall: a neon room of game cabinets (lib/retro/registry.ts). Pick one and it
// runs full screen in the RetroPlayer; your best score shows on each cabinet.
import { useEffect, useMemo, useState } from "react";
import { RETRO_GAMES } from "@/lib/retro/registry";
import type { RetroGameDef } from "@/lib/retro/engine";
import { playSfx } from "@/lib/audio/sound-manager";
import { hasFreePlay } from "@/lib/park/freePlays";
import { RetroPlayer, readBest, CREDITS_PER_TICKET } from "./RetroPlayer";

const GENRES = ["All", "Action", "Shooter", "Platformer", "Puzzle", "Classic", "Racing", "Sports", "Adventure"] as const;

/**
 * `pay` (from the park) charges a play: each cabinet's first play of the day is free, then a
 * ticket buys CREDITS_PER_TICKET credits. Without `pay` (smoke harness) credits are unlimited.
 */
export function RetroArcade({ kidId, onClose, pay }: { kidId: string; onClose: () => void; pay?: (game: string, what: string) => Promise<boolean> }) {
  const [playing, setPlaying] = useState<RetroGameDef | null>(null);
  const [genre, setGenre] = useState<(typeof GENRES)[number]>("All");
  const [bests, setBests] = useState<Record<string, number>>({});

  useEffect(() => {
    if (playing) return; // refresh best scores whenever we come back to the hall
    setBests(Object.fromEntries(RETRO_GAMES.map((g) => [g.id, readBest(kidId, g.id)])));
  }, [kidId, playing]);

  const games = useMemo(() => (genre === "All" ? RETRO_GAMES : RETRO_GAMES.filter((g) => g.genre === genre)), [genre]);
  const genres = GENRES.filter((g) => g === "All" || RETRO_GAMES.some((x) => x.genre === g));

  const buy = (g: RetroGameDef) => (pay ? pay(`retro:${g.id}`, `${CREDITS_PER_TICKET} plays of ${g.title}`) : Promise.resolve(true));
  if (playing)
    return <RetroPlayer game={playing} kidId={kidId} onExit={() => setPlaying(null)} credits={pay ? CREDITS_PER_TICKET : Infinity} onBuyCredits={() => buy(playing)} />;

  return (
    <div style={hall}>
      <div style={bar}>
        <button type="button" onClick={onClose} style={backBtn}>
          🎡 Back to the park
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={neonTitle}>RETRO ARCADE</div>
          <div style={{ color: "#9aa0b8", fontWeight: 800, fontSize: 12 }}>{RETRO_GAMES.length} classic-style games · beat your best!</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 14px 10px", flexShrink: 0 }}>
        {genres.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGenre(g)}
            style={{ border: "none", borderRadius: 999, padding: "7px 12px", fontWeight: 900, fontSize: 13, whiteSpace: "nowrap", cursor: "pointer", color: genre === g ? "#0d0b1a" : "#cfd2e6", background: genre === g ? "#5ef2ff" : "#2d2a4d" }}
          >
            {g}
          </button>
        ))}
      </div>
      <div style={grid}>
        {games.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => {
              playSfx("tap");
              void buy(g).then((ok) => {
                if (ok) setPlaying(g);
              });
            }}
            style={{ ...cabinet, boxShadow: `0 0 0 3px ${g.color}55, 0 6px 0 #120f24, 0 0 24px ${g.color}33` }}
          >
            <div style={{ ...marquee, background: g.color }}>{g.title}</div>
            <div style={screenBox}>
              <span style={{ fontSize: 40, filter: "drop-shadow(0 0 8px rgba(255,255,255,0.35))" }}>{g.emoji}</span>
            </div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 12, lineHeight: 1.25, minHeight: 30 }}>{g.blurb}</div>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: 11, fontWeight: 900 }}>
              <span style={{ color: pay && hasFreePlay(kidId, `retro:${g.id}`) ? "#3ecf55" : "#9aa0b8" }}>{pay ? (hasFreePlay(kidId, `retro:${g.id}`) ? "FREE TODAY" : "🎟️ 1") : g.genre}</span>
              <span style={{ color: bests[g.id] ? "#ffe14d" : "#4a4e6a" }}>★ {bests[g.id] ?? 0}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const hall: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 58,
  display: "flex",
  flexDirection: "column",
  background: "radial-gradient(circle at 50% 0%, #3a2470, #0d0b1a 65%)",
};
const bar: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "max(12px, env(safe-area-inset-top)) 14px 10px", flexShrink: 0 };
const backBtn: React.CSSProperties = { border: "none", borderRadius: 999, padding: "9px 14px", fontWeight: 900, color: "#0d0b1a", background: "#ffe14d", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 };
const neonTitle: React.CSSProperties = { fontWeight: 900, fontSize: 24, letterSpacing: 3, color: "#ff6fcf", textShadow: "0 0 10px #ff6fcf, 0 0 22px #9a5cff" };
const grid: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: 14,
  padding: "4px 14px max(20px, env(safe-area-inset-bottom))",
  alignContent: "start",
};
const cabinet: React.CSSProperties = {
  border: "none",
  borderRadius: 18,
  padding: 10,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  background: "linear-gradient(#2d2a4d, #1b1535)",
  cursor: "pointer",
  textAlign: "center",
};
const marquee: React.CSSProperties = { width: "100%", borderRadius: 10, padding: "5px 4px", fontWeight: 900, fontSize: 13, color: "#0d0b1a", letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const screenBox: React.CSSProperties = {
  width: "100%",
  aspectRatio: "256 / 190",
  borderRadius: 10,
  background: "radial-gradient(circle, #26306b, #0d0b1a)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "inset 0 0 0 2px #0d0b1a, inset 0 0 18px rgba(94,242,255,0.25)",
};
