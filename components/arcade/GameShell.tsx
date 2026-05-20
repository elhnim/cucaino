"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { ArcadeGame } from "@/lib/arcade/games";

interface GameShellProps {
  kidId: string | null;
  sparksBalance: number;
  game: ArcadeGame;
  children: ReactNode;
}

export default function GameShell({ kidId, sparksBalance, game, children }: GameShellProps) {
  const backHref = `/play/arcade${kidId ? `?kid=${kidId}` : ""}`;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <Link
          href={backHref}
          className="text-sm font-bold text-gray-600 hover:text-gray-900 flex items-center gap-1"
        >
          ← Arcade
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xl">{game.emoji}</span>
          <span className="font-black text-gray-900">{game.name}</span>
        </div>
        <div className="flex items-center gap-1 bg-cyan-100 text-cyan-700 text-sm font-bold px-3 py-1 rounded-full">
          ⚡ {sparksBalance}
        </div>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 pb-12">{children}</div>
      </div>
    </div>
  );
}
