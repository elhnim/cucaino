"use client";

import { useState } from "react";
import RewardFormModal from "@/components/parent/RewardFormModal";
import type { Kid, Reward } from "@/lib/domain/types";

export default function RewardsClient({
  rewards,
  kids,
}: {
  rewards: Reward[];
  kids: Kid[];
}) {
  const [modal, setModal] = useState<"new" | Reward | null>(null);

  return (
    <>
      <div className="px-4 pt-4 pb-1 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {rewards.length} reward{rewards.length === 1 ? "" : "s"} available
        </p>
        <button
          type="button"
          onClick={() => setModal("new")}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2 rounded-xl flex items-center gap-1.5"
        >
          + New reward
        </button>
      </div>

      <div className="p-4 space-y-2">
        {rewards.map((r) => (
          <div key={r.id} className="bg-white rounded-2xl shadow p-3">
            <div className="flex items-start gap-3">
              <div className="text-3xl">{r.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-bold">{r.name}</div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      r.type === "family"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-pink-100 text-pink-700"
                    }`}
                  >
                    {r.type === "family" ? "👨‍👩‍👧‍👦 family" : "👤 individual"}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {r.costPoints} ⭐
                  {r.kidId
                    ? ` · specific kid`
                    : r.type === "individual"
                      ? " · any kid"
                      : " · family pool"}
                </div>
                {r.description ? (
                  <div className="text-xs text-gray-500 mt-1">{r.description}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setModal(r)}
                className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-lg font-bold shrink-0"
              >
                Edit
              </button>
            </div>
          </div>
        ))}

        {rewards.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <div className="text-5xl mb-3">🎁</div>
            <div className="font-bold">No rewards yet</div>
            <div className="text-sm mt-1">Tap &quot;+ New reward&quot; to add one</div>
          </div>
        ) : null}
      </div>

      {modal ? (
        <RewardFormModal
          kids={kids}
          reward={modal === "new" ? undefined : modal}
          onClose={() => setModal(null)}
        />
      ) : null}
    </>
  );
}
