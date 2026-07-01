"use client";

import { type CardId, DEF, KIND_GRADIENT, KIND_RING, MERC_COST, META } from "@/lib/village/config";

export default function VillageCard({
  card,
  selected = false,
  disabled = false,
  faceDown = false,
  size = "md",
  corner,
  showText = true,
  onClick,
}: {
  card: CardId;
  selected?: boolean;
  disabled?: boolean;
  faceDown?: boolean;
  size?: "sm" | "md";
  corner?: string;
  showText?: boolean;
  onClick?: () => void;
}) {
  if (faceDown) {
    return (
      <div className="relative aspect-[3/4] w-full rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 border-2 border-slate-600 shadow-lg flex items-center justify-center">
        <span className="text-3xl opacity-80">🏰</span>
      </div>
    );
  }

  const kind = DEF[card].kind;
  const meta = META[card];
  const interactive = !!onClick && !disabled;
  const pad = size === "sm" ? "p-2" : "p-3";
  const emojiSize = size === "sm" ? "text-2xl" : "text-4xl";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative aspect-[3/4] w-full rounded-2xl bg-gradient-to-br ${KIND_GRADIENT[kind]} border-2 border-white/40 shadow-lg text-white text-left flex flex-col ${pad} transition-all ${
        interactive ? "active:scale-95 hover:-translate-y-1" : ""
      } ${selected ? `ring-4 ${KIND_RING[kind]} -translate-y-1` : ""} ${disabled ? "opacity-50" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className={emojiSize}>{meta.icon}</span>
        {corner && <span className="text-[10px] font-black bg-black/25 rounded-full px-1.5 py-0.5">{corner}</span>}
        {selected && !corner && <span className="text-base">✅</span>}
      </div>
      <div className="mt-auto">
        <div className={`font-black ${size === "sm" ? "text-xs" : "text-base"} drop-shadow leading-tight`}>{meta.name}</div>
        {showText && size === "md" && <p className="text-[11px] font-semibold leading-tight text-white/90 mt-0.5">{meta.text}</p>}
        {MERC_COST[card] != null && (
          <div className="text-[10px] font-black text-white/90 mt-0.5">🥔 {MERC_COST[card]}</div>
        )}
      </div>
    </button>
  );
}
