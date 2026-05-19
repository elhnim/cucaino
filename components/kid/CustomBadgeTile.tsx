import type { CustomBadgeProgress } from "@/lib/domain/types";

const TIER_COLORS = {
  gold:   { border: "#f59e0b", glow: "#fde68a", emoji: "🥇" },
  silver: { border: "#9ca3af", glow: "#e5e7eb", emoji: "🥈" },
  bronze: { border: "#cd7c3f", glow: "#fde8c8", emoji: "🥉" },
  none:   { border: "#e5e7eb", glow: "transparent", emoji: "" },
};

function isStreakBroken(lastCompletedDate: string | null): boolean {
  if (!lastCompletedDate) return false;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return lastCompletedDate < yesterday.toISOString().slice(0, 10);
}

export default function CustomBadgeTile({
  progress,
  size = "md",
}: {
  progress: CustomBadgeProgress;
  size?: "sm" | "md" | "lg";
}) {
  const { badge, currentCount, currentTier, lastCompletedDate } = progress;
  const { bronzeThreshold, silverThreshold, goldThreshold } = badge;
  const colors = TIER_COLORS[currentTier];
  const streakBroken = badge.trackType === "streak" && isStreakBroken(lastCompletedDate);

  const nextThreshold =
    currentTier === "gold" ? goldThreshold
    : currentTier === "silver" ? goldThreshold
    : currentTier === "bronze" ? silverThreshold
    : bronzeThreshold;

  const prevThreshold =
    currentTier === "gold" ? silverThreshold
    : currentTier === "silver" ? bronzeThreshold
    : 0;

  const pct = currentTier === "gold"
    ? 1
    : Math.min(1, (currentCount - prevThreshold) / (nextThreshold - prevThreshold));

  const iconSize = size === "sm" ? "text-xl" : size === "lg" ? "text-4xl" : "text-2xl";
  const locked = currentTier === "none";

  return (
    <div
      className={`rounded-2xl p-2.5 text-center border-[1.5px] ${locked ? "opacity-50" : ""}`}
      style={{
        background: streakBroken ? "#fff1f2" : locked ? "#f9fafb" : colors.glow + "55",
        borderColor: streakBroken ? "#fda4af" : colors.border,
      }}
    >
      <div className={`${iconSize} mb-1`}>{badge.icon}</div>
      <div
        className="text-[9px] font-black uppercase tracking-wide mb-1.5 truncate px-1"
        style={{ color: streakBroken ? "#e11d48" : "#4b5563" }}
      >
        {badge.name}
      </div>
      {streakBroken ? (
        <div className="text-[9px] font-bold text-rose-500">💔 Streak broken</div>
      ) : (
        <>
          <div className="h-1 rounded-full bg-gray-200 overflow-hidden mb-1">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.round(pct * 100)}%`, background: colors.border }}
            />
          </div>
          <div className="text-[9px] text-gray-400 font-semibold">
            {currentCount} / {nextThreshold} {colors.emoji}
          </div>
        </>
      )}
    </div>
  );
}
