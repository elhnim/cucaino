"use client";

import { useState, useTransition } from "react";
import { claimReward } from "@/lib/actions/rewards";

interface Props {
  kidId: string;
  rewardId: string;
  rewardName: string;
  rewardIcon: string;
  costPoints: number;
  requiresApproval: boolean;
  currentStars: number;
}

export default function RewardClaimButton({
  kidId,
  rewardId,
  rewardName,
  rewardIcon,
  costPoints,
  requiresApproval,
  currentStars,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [celebration, setCelebration] = useState<{
    newStars: number;
    isRequest: boolean;
  } | null>(null);

  const handleClaim = () => {
    startTransition(async () => {
      const result = await claimReward(kidId, rewardId);
      if (result.ok) {
        setCelebration({
          newStars: requiresApproval ? currentStars : currentStars - costPoints,
          isRequest: requiresApproval,
        });
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClaim}
        disabled={isPending}
        className="w-full rounded-xl text-[11px] text-white font-bold py-1.5 bg-orange-500 disabled:opacity-60"
      >
        {isPending ? "…" : requiresApproval ? "Request →" : "Get it! →"}
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

            {/* New star balance */}
            <div
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl"
              style={{ background: "#fef3c7" }}
            >
              <span className="text-xl">⭐</span>
              <div>
                <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Your stars</div>
                <div className="text-xl font-black text-amber-900">{celebration.newStars.toLocaleString()}</div>
              </div>
            </div>

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
