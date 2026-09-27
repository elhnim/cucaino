"use client";

import { useEffect, useState } from "react";
import { WorldPanelShell } from "./WorldPanelShell";
import { getRewardsPanelData, type RewardsPanelData } from "@/lib/actions/world-panels";
import RewardClaimButton from "@/components/kid/RewardClaimButton";
import type { Reward } from "@/lib/domain/types";

function WorldRewardCard({ reward: r, pointsBalance, cashBalance, kidId, activeStrikeCount }: {
  reward: Reward;
  pointsBalance: number;
  cashBalance: number;
  kidId: string;
  activeStrikeCount: number;
}) {
  const canAfford =
    (r.costPoints > 0 && pointsBalance >= r.costPoints) ||
    (r.costCashCents > 0 && cashBalance >= r.costCashCents);
  const progress = r.costPoints > 0 ? Math.min(100, (pointsBalance / r.costPoints) * 100) : 100;

  return (
    <div
      className="relative rounded-2xl overflow-hidden shadow-sm border flex flex-col h-[150px]"
      style={canAfford ? { background: "#fff7ed", borderColor: "#fed7aa" } : { background: "#f9fafb", borderColor: "#f3f4f6" }}
    >
      <div className="absolute top-2 right-2 flex flex-col items-end gap-0.5">
        {r.costPoints > 0 && (
          <span className="bg-white text-amber-600 text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-sm">⭐{r.costPoints}</span>
        )}
        {r.costCashCents > 0 && (
          <span className="bg-white text-green-700 text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-sm">
            💵${(r.costCashCents / 100).toFixed(2)}
          </span>
        )}
      </div>
      <div className="flex flex-col items-center px-2 pt-6 pb-2.5 flex-1">
        <div className={`text-4xl mb-1.5 ${canAfford ? "" : "opacity-60"}`}>{r.icon}</div>
        <div className={`font-black text-[12px] text-center leading-tight mb-2.5 px-1 ${canAfford ? "text-gray-800" : "text-gray-500"}`}>
          {r.name}
        </div>
        {canAfford ? (
          <RewardClaimButton
            kidId={kidId}
            rewardId={r.id}
            rewardName={r.name}
            rewardIcon={r.icon}
            costPoints={r.costPoints}
            costCashCents={r.costCashCents}
            requiresApproval={r.requiresApproval}
            currentStars={pointsBalance}
            currentCash={cashBalance}
            blockedByStrikes={activeStrikeCount}
          />
        ) : (
          <>
            <div className="w-full bg-gray-200 rounded-full h-1 mb-1.5 mt-auto">
              <div className="h-1 rounded-full bg-orange-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-[10px] text-gray-400">{Math.max(0, r.costPoints - pointsBalance)} more ⭐</div>
          </>
        )}
      </div>
    </div>
  );
}

export function RewardsPanel({
  kidId,
  onClose,
  onOpenPage,
}: {
  kidId: string;
  onClose: () => void;
  /** open a full app page inside the world (badges, wishlist, ...) */
  onOpenPage?: (src: string, title: string) => void;
}) {
  const [data, setData] = useState<RewardsPanelData | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    getRewardsPanelData(kidId).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [kidId]);

  return (
    <WorldPanelShell title="🏪 Store" onClose={onClose}>
      {data === "loading" ? (
        <p style={{ textAlign: "center", color: "#a06a3c", padding: "24px 0" }}>Loading…</p>
      ) : !data ? (
        <p style={{ textAlign: "center", color: "#a06a3c", padding: "24px 0" }}>Couldn&apos;t load the store.</p>
      ) : (
        <>
          {onOpenPage && (
            <button type="button" style={{ ...moreBtnStyle, marginBottom: 12 }} onClick={() => onOpenPage(`/kid/${kidId}/rewards`, "🏅 Badges & wishlist")}>
              🏅 My badges & wishlist
            </button>
          )}
          <p style={{ color: "#a06a3c", fontWeight: 700, margin: "0 0 12px" }}>
            ⭐ {data.pointsBalance} stars{data.cashBalance > 0 ? ` · 💵 $${(data.cashBalance / 100).toFixed(2)}` : ""}
          </p>
          {data.rewards.length === 0 ? (
            <p style={{ textAlign: "center", color: "#a06a3c", padding: "24px 0" }}>No rewards yet — ask a parent to add some! 🎁</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {data.rewards.map((r) => (
                <WorldRewardCard
                  key={r.id}
                  reward={r}
                  pointsBalance={data.pointsBalance}
                  cashBalance={data.cashBalance}
                  kidId={kidId}
                  activeStrikeCount={data.activeStrikeCount}
                />
              ))}
            </div>
          )}
        </>
      )}
    </WorldPanelShell>
  );
}

const moreBtnStyle: React.CSSProperties = {
  width: "100%",
  border: "2px dashed #e8c07a",
  borderRadius: 16,
  padding: "10px 14px",
  fontWeight: 800,
  color: "#6b4a1f",
  background: "#fffaf0",
  cursor: "pointer",
};
