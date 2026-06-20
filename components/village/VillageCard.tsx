"use client";

import type { CardMeta } from "@/lib/village/config";

const GRADIENT: Record<CardMeta["color"], string> = {
  emerald: "from-emerald-400 to-green-600",
  rose: "from-rose-400 to-pink-600",
  stone: "from-stone-300 to-stone-500",
  amber: "from-amber-300 to-orange-500",
  violet: "from-violet-400 to-purple-600",
};

const RING: Record<CardMeta["color"], string> = {
  emerald: "ring-emerald-300",
  rose: "ring-rose-300",
  stone: "ring-stone-400",
  amber: "ring-amber-300",
  violet: "ring-violet-300",
};

export default function VillageCard({
  card,
  selected = false,
  disabled = false,
  faceDown = false,
  size = "md",
  onClick,
}: {
  card: CardMeta;
  selected?: boolean;
  disabled?: boolean;
  faceDown?: boolean;
  size?: "sm" | "md";
  onClick?: () => void;
}) {
  const pad = size === "sm" ? "p-2" : "p-3";
  const emojiSize = size === "sm" ? "text-3xl" : "text-4xl";

  if (faceDown) {
    return (
      <div
        className={`relative aspect-[3/4] rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 border-2 border-slate-600 shadow-lg flex items-center justify-center ${pad}`}
      >
        <span className="text-3xl opacity-80">🏰</span>
      </div>
    );
  }

  const interactive = !!onClick && !disabled;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative aspect-[3/4] w-full rounded-2xl bg-gradient-to-br ${GRADIENT[card.color]} border-2 border-white/40 shadow-lg text-white text-left flex flex-col ${pad} transition-all ${
        interactive ? "active:scale-95 hover:-translate-y-1" : ""
      } ${selected ? `ring-4 ${RING[card.color]} -translate-y-1` : ""} ${disabled ? "opacity-50" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className={emojiSize}>{card.emoji}</span>
        {selected && <span className="text-lg">✅</span>}
      </div>
      <div className="mt-auto">
        <div className={`font-black ${size === "sm" ? "text-sm" : "text-base"} drop-shadow`}>{card.name}</div>
        {size === "md" && (
          <p className="text-[11px] font-semibold leading-tight text-white/90 mt-0.5">{card.blurb}</p>
        )}
      </div>
    </button>
  );
}
