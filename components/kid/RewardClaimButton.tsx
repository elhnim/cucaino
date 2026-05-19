"use client";

import { useState, useTransition } from "react";
import { claimReward } from "@/lib/actions/rewards";

interface Props {
  kidId: string;
  rewardId: string;
  rewardName: string;
  rewardIcon: string;
  costPoints: number;
  costCashCents: number;
  requiresApproval: boolean;
  currentStars: number;
  currentCash: number;
  blockedByStrikes?: number;
}

export default function RewardClaimButton({
  kidId,
  rewardId,
  rewardName,
  rewardIcon,
  costPoints,
  costCashCents,
  requiresApproval,
  currentStars,
  currentCash,
  blockedByStrikes,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [requested, setRequested] = useState(false);
  const [celebration, setCelebration] = useState<{
    newStars: number;
    newCash: number;
    isRequest: boolean;
    usedCash: boolean;
  } | null>(null);

  const hasCash = costCashCents > 0;
  const hasStars = costPoints > 0;
  const [paymentType, setPaymentType] = useState<"stars" | "cash">(
    hasStars ? "stars" : "cash",
  );

  const handleClaim = () => {
    startTransition(async () => {
      const result = await claimReward(kidId, rewardId, paymentType);
      if (result.ok) {
        setCelebration({
          newStars: requiresApproval || paymentType === "cash"
            ? currentStars
            : currentStars - costPoints,
          newCash: requiresApproval || paymentType === "stars"
            ? currentCash
            : currentCash - costCashCents,
          isRequest: requiresApproval,
          usedCash: paymentType === "cash",
        });
        if (requiresApproval) setRequested(true);
      }
    });
  };

  if (blockedByStrikes !== undefined && blockedByStrikes >= 3) {
    return (
      <div className="w-full py-3 rounded-2xl text-sm font-black text-center bg-red-50 border border-red-200 text-red-500">
        ⚡ Rewards locked — clear strikes with a parent
      </div>
    );
  }

  return (
    <>
      {hasCash && hasStars && (
        <div className="flex gap-1 mb-2">
          <button
            type="button"
            onClick={() => setPaymentType("stars")}
            className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
              paymentType === "stars"
                ? "bg-amber-500 text-white border-amber-500"
                : "bg-gray-100 text-gray-500 border-gray-200"
            }`}
          >
            ⭐ {costPoints} stars
          </button>
          <button
            type="button"
            onClick={() => setPaymentType("cash")}
            className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
              paymentType === "cash"
                ? "bg-green-600 text-white border-green-600"
                : "bg-gray-100 text-gray-500 border-gray-200"
            }`}
          >
            💵 ${(costCashCents / 100).toFixed(2)}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={handleClaim}
        disabled={isPending || requested}
        className="w-full rounded-xl text-[11px] text-white font-bold py-1.5 bg-orange-500 disabled:opacity-60"
      >
        {isPending ? "…" : requested ? "Pending ⏳" : requiresApproval ? "Request →" : "Get it! →"}
      </button>

      {celebration && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setCelebration(null)}
        >
          <div
            className="bg-white rounded-3xl p-8 flex flex-col items-center gap-4 max-w-xs w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Big reward icon with pulse ring */}
            <div className="relative flex items-center justify-center">
              <div
                className="absolute w-28 h-28 rounded-full animate-ping opacity-20"
                style={{ background: "#f97316" }}
              />
              <div className="w-24 h-24 rounded-full flex items-center justify-center text-5xl"
                style={{ background: "#fff7ed", border: "3px solid #fed7aa" }}>
                {rewardIcon}
              </div>
            </div>

            {celebration.isRequest ? (
              <>
                <div className="text-2xl font-black text-gray-900 text-center">Request sent! 🙌</div>
                <div className="text-sm text-gray-500 text-center">
                  <span className="font-bold text-gray-700">{rewardName}</span> has been sent to your parent for approval.
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl font-black text-gray-900 text-center">You got it! 🎉</div>
                <div className="text-sm text-gray-500 text-center">
                  <span className="font-bold text-gray-700">{rewardName}</span> is yours!
                </div>
              </>
            )}

            {/* New balance */}
            {celebration.usedCash ? (
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-2xl" style={{ background: "#dcfce7" }}>
                <span className="text-xl">💵</span>
                <div>
                  <div className="text-[10px] font-bold text-green-700 uppercase tracking-wider">Your cash</div>
                  <div className="text-xl font-black text-green-900">
                    ${(celebration.newCash / 100).toFixed(2)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-2xl" style={{ background: "#fef3c7" }}>
                <span className="text-xl">⭐</span>
                <div>
                  <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Your stars</div>
                  <div className="text-xl font-black text-amber-900">{celebration.newStars.toLocaleString()}</div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setCelebration(null)}
              className="w-full py-3 rounded-2xl text-sm font-black text-white"
              style={{ background: "#f97316" }}
            >
              Awesome! 🙌
            </button>
          </div>
        </div>
      )}
    </>
  );
}
