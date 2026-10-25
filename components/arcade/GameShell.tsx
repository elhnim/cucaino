"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import GameAudio from "@/components/audio/GameAudio";
import GameFullscreen from "@/components/games/GameFullscreen";
import type { ArcadeGame } from "@/lib/arcade/games";
import { C, FONT } from "@/components/park/ui/theme";

interface GameShellProps {
  kidId: string | null;
  sparksBalance: number;
  game: ArcadeGame;
  children: ReactNode;
}

// The flat /play/arcade/[game] page: a dark game-window frame (same night-glass look as the
// park's GameStage) around the arcade game, which paints its own starry stage.
const ROUND_BTN = "fixed right-3 z-30 w-10 h-10 rounded-full flex items-center justify-center text-lg text-white bg-[rgba(18,16,44,0.8)] border border-[rgba(160,200,255,0.4)] backdrop-blur shadow-[0_4px_10px_rgba(0,0,0,0.35)] active:scale-95 transition-transform";

export default function GameShell({ kidId, sparksBalance, game, children }: GameShellProps) {
  const backHref = `/play/arcade${kidId ? `?kid=${kidId}` : ""}`;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "radial-gradient(120% 60% at 50% 0%, #2c2572, #120f33 60%)", color: C.text, fontFamily: FONT.body }}>
      <GameAudio track="arcade" className={`${ROUND_BTN} top-16`} />
      <GameFullscreen className={`${ROUND_BTN} top-[112px]`} />
      {/* Sticky header */}
      <header
        className="sticky top-0 z-10 px-3 py-2.5 flex items-center justify-between gap-2"
        style={{ background: "rgba(16,14,42,0.92)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(94,242,255,0.4)", boxShadow: "0 4px 18px rgba(0,0,0,0.45), 0 1px 14px rgba(94,242,255,0.25)" }}
      >
        <Link
          href={backHref}
          className="gp-press shrink-0 flex items-center"
          style={{ minHeight: 44, padding: "0 14px", borderRadius: 12, fontFamily: FONT.display, fontSize: 16, letterSpacing: 0.4, color: C.ink, background: `linear-gradient(${C.goldHi}, ${C.gold} 50%, ${C.goldDeep})`, boxShadow: "0 3px 0 #9a5c00, 0 6px 12px rgba(0,0,0,0.35)" }}
        >
          ← Arcade
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl" aria-hidden>{game.emoji}</span>
          <span className="truncate" style={{ fontFamily: FONT.display, fontSize: 20, letterSpacing: 0.4, textShadow: "0 0 14px rgba(94,242,255,0.5), 0 2px 0 rgba(0,0,0,0.4)" }}>{game.name}</span>
        </div>
        <div className="shrink-0 flex items-center gap-1 px-3 py-1" style={{ borderRadius: 999, fontFamily: FONT.display, fontSize: 16, color: C.cyan, background: "rgba(94,242,255,0.12)", border: "1.5px solid rgba(94,242,255,0.45)", boxShadow: "0 0 10px rgba(94,242,255,0.25)" }}>
          ⚡ {sparksBalance}
        </div>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-4 pb-12 sm:px-4" style={{ maxWidth: 760, margin: "0 auto" }}>{children}</div>
      </div>
    </div>
  );
}
