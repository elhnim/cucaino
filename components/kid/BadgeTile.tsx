import type { BadgeCategory, BadgeTier } from "@/lib/domain/types";
import { BADGE_META, BADGE_THRESHOLDS, getTierFromCount } from "@/lib/domain/badge-config";

const TIER_PALETTE = {
  gold:   { border: "#d4a017", bg: "#fff8e0", glow: "#f59e0b", text: "#92400e" },
  silver: { border: "#9fb8cc", bg: "#f0f6fa", glow: "#94a3b8", text: "#334155" },
  bronze: { border: "#c87941", bg: "#fdf3ec", glow: "#d97706", text: "#7c2d12" },
  none:   { border: "#3d3d52", bg: "#1e1e2e", glow: "transparent", text: "#6b7280" },
};

interface BadgeTileProps {
  category: BadgeCategory;
  completionCount: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  showProgress?: boolean;
}

export default function BadgeTile({
  category,
  completionCount,
  size = "md",
  showLabel = true,
  showProgress = true,
}: BadgeTileProps) {
  const meta = BADGE_META[category];
  const thresholds = BADGE_THRESHOLDS[category];
  const tier = getTierFromCount(category, completionCount);
  const palette = TIER_PALETTE[tier];

  const locked = tier === "none";

  const sizePx = size === "lg" ? 80 : size === "sm" ? 48 : 64;
  const iconSize = size === "lg" ? "text-4xl" : size === "sm" ? "text-2xl" : "text-3xl";
  const labelSize = size === "lg" ? "text-xs" : "text-[9px]";

  // Progress within current tier
  const prevThreshold =
    tier === "gold"   ? thresholds.silver :
    tier === "silver" ? thresholds.bronze :
    tier === "bronze" ? 0 : 0;
  const nextThreshold =
    tier === "gold"   ? thresholds.gold :
    tier === "silver" ? thresholds.gold :
    tier === "bronze" ? thresholds.silver :
    thresholds.bronze;
  const pct = tier === "gold"
    ? 1
    : Math.min(1, (completionCount - prevThreshold) / (nextThreshold - prevThreshold));

  const tierLabel = tier === "none"
    ? "Locked"
    : tier === "gold"   ? `${meta.tierNames.gold} 🥇`
    : tier === "silver" ? `${meta.tierNames.silver} 🥈`
    : `${meta.tierNames.bronze} 🥉`;

  const pixelShadow = locked
    ? `inset 2px 2px 0 #4a4a5e, inset -2px -2px 0 #111118, 0 3px 0 #111118`
    : `inset 2px 2px 0 ${palette.glow}88, inset -2px -2px 0 ${palette.border}88, 0 3px 0 #00000044, 0 0 8px ${palette.glow}66`;

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Tile */}
      <div
        style={{
          width: sizePx,
          height: sizePx,
          background: palette.bg,
          border: `3px solid ${palette.border}`,
          borderRadius: 6,
          boxShadow: pixelShadow,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          flexShrink: 0,
          ...(tier === "gold" ? { animation: "badge-shimmer 3s ease-in-out infinite" } : {}),
        }}
      >
        <span
          className={iconSize}
          style={{ filter: locked ? "grayscale(1) brightness(0.5)" : "none", lineHeight: 1 }}
        >
          {meta.icon}
        </span>
        {/* Tier pip */}
        {!locked && (
          <span
            style={{
              position: "absolute",
              bottom: 2,
              right: 2,
              fontSize: 10,
              lineHeight: 1,
            }}
          >
            {tier === "gold" ? "🥇" : tier === "silver" ? "🥈" : "🥉"}
          </span>
        )}
      </div>

      {showLabel && (
        <div className="text-center" style={{ maxWidth: sizePx + 8 }}>
          <div
            className={`${labelSize} font-black uppercase tracking-wide leading-tight`}
            style={{ color: locked ? "#6b7280" : palette.text }}
          >
            {meta.label}
          </div>
          <div
            className={`${labelSize} font-semibold leading-tight opacity-80`}
            style={{ color: locked ? "#6b7280" : palette.text }}
          >
            {tierLabel}
          </div>
        </div>
      )}

      {showProgress && tier !== "gold" && (
        <div style={{ width: sizePx }} className="space-y-0.5">
          <div className="h-1 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round(pct * 100)}%`,
                background: locked ? "#6b7280" : palette.border,
              }}
            />
          </div>
          <div
            className="text-center leading-tight"
            style={{ fontSize: 10, color: locked ? "#9ca3af" : palette.text, fontWeight: 700 }}
          >
            {(() => {
              const remaining = nextThreshold - completionCount;
              if (tier === "none") return `${remaining} more to unlock Bronze`;
              if (tier === "bronze") return `${remaining} more to reach Silver`;
              return `${remaining} more to reach Gold`;
            })()}
          </div>
        </div>
      )}

      <style>{`
        @keyframes badge-shimmer {
          0%, 100% { filter: brightness(1); }
          50%       { filter: brightness(1.15) saturate(1.3); }
        }
      `}</style>
    </div>
  );
}
