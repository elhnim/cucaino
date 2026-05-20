"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ARCADE_GAMES } from "@/lib/arcade/games";
import ConvertSparksModal from "./ConvertSparksModal";

const colorMap: Record<string, string> = {
  violet: "bg-violet-50 border-violet-200 text-violet-900",
  orange: "bg-orange-50 border-orange-200 text-orange-900",
  sky:    "bg-sky-50 border-sky-200 text-sky-900",
  amber:  "bg-amber-50 border-amber-200 text-amber-900",
  green:  "bg-green-50 border-green-200 text-green-900",
  rose:   "bg-rose-50 border-rose-200 text-rose-900",
};

interface ArcadeHubProps {
  kid: {
    id: string;
    name: string;
    sparksBalance: number;
    pointsBalance: number;
  } | null;
}

export default function ArcadeHub({ kid }: ArcadeHubProps) {
  const [showConvert, setShowConvert] = useState(false);

  const needsSparks = !kid || kid.sparksBalance === 0;

  return (
    <div className="max-w-3xl mx-auto p-4 pt-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-black text-gray-900">🕹️ AI Arcade</h1>
        <div className="flex items-center gap-2">
          {kid && (
            <span className="text-sm font-bold text-cyan-700 bg-cyan-100 px-3 py-1 rounded-full">
              ⚡ {kid.sparksBalance}
            </span>
          )}
          {kid && (
            <button
              onClick={() => setShowConvert(true)}
              className="text-sm font-bold text-white bg-cyan-500 hover:bg-cyan-600 active:scale-95 transition-transform px-3 py-1 rounded-full"
            >
              Get Sparks +
            </button>
          )}
        </div>
      </div>

      {/* Game grid */}
      <div className="grid grid-cols-2 gap-3">
        {ARCADE_GAMES.map((game) => {
          const colorClass = colorMap[game.color] ?? "bg-gray-50 border-gray-200 text-gray-900";
          return (
            <Link
              key={game.id}
              href={`/play/arcade/${game.id}${kid ? `?kid=${kid.id}` : ""}`}
              className={`border-2 rounded-3xl p-5 shadow-sm flex flex-col gap-3 active:scale-95 transition-transform ${colorClass}`}
            >
              <div className="text-4xl">{game.emoji}</div>
              <div className="flex-1">
                <div className="text-lg font-black">{game.name}</div>
                <div className="text-xs opacity-70 mt-0.5">{game.tagline}</div>
                {needsSparks && (
                  <div className="text-xs mt-1.5 opacity-60 italic">Need ⚡ Sparks to play</div>
                )}
              </div>
              <div className="self-start text-[11px] font-bold bg-black/10 px-2 py-0.5 rounded-full">
                ⚡ {game.sparkCost}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Convert modal via portal */}
      {showConvert && kid && typeof document !== "undefined" &&
        createPortal(
          <ConvertSparksModal
            kidId={kid.id}
            starBalance={kid.pointsBalance}
            sparksBalance={kid.sparksBalance}
            onClose={() => setShowConvert(false)}
          />,
          document.body,
        )
      }
    </div>
  );
}
