import { notFound } from "next/navigation";
import KidShell from "@/components/kid/KidShell";
import { getKid, listRewardsForKid } from "@/lib/data/stub";
import type { Reward } from "@/lib/domain/types";

export default async function RewardsPage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();

  const rewards = await listRewardsForKid(kid.id);
  const activeRewards = rewards.filter((r) => r.active);

  return (
    <KidShell kid={kid} active="rewards">
      <div className="p-4 md:p-5">
        {/* Header */}
        <h2 className="text-2xl md:text-3xl font-black mb-1">🛒 Reward Shop</h2>
        <p className="text-sm text-gray-400 mb-5">
          You have ⭐ {kid.pointsBalance} stars
        </p>

        {/* Wishlist section */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-700">💛 My Wishlist</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            0/3
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-2xl p-3 min-h-[80px] flex flex-col items-center justify-center gap-1"
              style={{ border: "1.5px dashed #d1d5db" }}
            >
              <span className="text-base">🤍</span>
              <span className="text-xs text-gray-400">Add a reward</span>
            </div>
          ))}
        </div>

        {/* Reward grid */}
        <div className="grid grid-cols-2 gap-3">
          {activeRewards.map((r) => (
            <RewardCard key={r.id} reward={r} pointsBalance={kid.pointsBalance} />
          ))}
        </div>
      </div>
    </KidShell>
  );
}

function RewardCard({
  reward: r,
  pointsBalance,
}: {
  reward: Reward;
  pointsBalance: number;
}) {
  const canAfford = pointsBalance >= r.costPoints;
  const progress = Math.min(100, (pointsBalance / r.costPoints) * 100);

  if (r.who === "team") {
    return (
      <div className="relative bg-white border-l-4 border-purple-400 rounded-2xl p-3 shadow">
        <button
          type="button"
          className="absolute top-2 right-2 text-xs leading-none"
        >
          🤍
        </button>
        <span className="inline-flex items-center bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full mb-2">
          👥 TEAM
        </span>
        <div className="text-4xl text-center mb-1">{r.icon}</div>
        <div className="font-bold text-sm text-center mb-1">{r.name}</div>
        <div className="text-xs text-center mb-2">⭐ {r.costPoints}</div>
        <button
          type="button"
          className="w-full rounded-lg text-sm text-white font-semibold py-1.5"
          style={{ backgroundColor: "#7c3aed" }}
        >
          Contribute ⭐
        </button>
      </div>
    );
  }

  if (r.recurrence === "one_off") {
    return (
      <div className="relative bg-white border-l-4 border-amber-400 rounded-2xl p-3 shadow">
        <button
          type="button"
          className="absolute top-2 right-2 text-xs leading-none"
        >
          🤍
        </button>
        <span className="inline-flex items-center bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full mb-2">
          ✨ ONE-OFF
        </span>
        <div className="text-4xl text-center mb-1">{r.icon}</div>
        <div className="font-bold text-sm text-center mb-1">{r.name}</div>
        <div className="text-xs text-center mb-2">⭐ {r.costPoints}</div>
        <div className={`text-xs text-center mb-1 ${canAfford ? "text-gray-600" : "text-gray-400"}`}>
          {pointsBalance}/{r.costPoints}
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full ${canAfford ? "bg-amber-400" : "bg-gray-300"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  if (canAfford) {
    return (
      <div className="relative bg-white rounded-2xl p-3 shadow">
        <button
          type="button"
          className="absolute top-2 right-2 text-xs leading-none"
        >
          🤍
        </button>
        <div className="text-4xl text-center mb-1">{r.icon}</div>
        <div className="font-bold text-sm text-center mb-1">{r.name}</div>
        <div className="text-center mb-2">
          <span className="inline-block bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
            ⭐ {r.costPoints}
          </span>
        </div>
        <button
          type="button"
          className="w-full rounded-lg text-sm text-white font-semibold py-1.5 bg-orange-500"
        >
          {r.requiresApproval ? "Request →" : "Get it! →"}
        </button>
      </div>
    );
  }

  return (
    <div className="relative bg-white rounded-2xl p-3 shadow opacity-70">
      <button
        type="button"
        className="absolute top-2 right-2 text-xs leading-none"
      >
        🤍
      </button>
      <div className="text-4xl text-center mb-1">{r.icon}</div>
      <div className="font-bold text-sm text-center mb-1">{r.name}</div>
      <div className="text-center mb-1">
        <span className="inline-block bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
          ⭐ {r.costPoints}
        </span>
      </div>
      <div className="text-xs text-center text-gray-400 mb-1">
        Need {r.costPoints - pointsBalance} more ⭐
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2">
        <div
          className="h-1.5 rounded-full bg-orange-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <button
        type="button"
        disabled
        className="w-full rounded-lg text-sm text-gray-500 font-semibold py-1.5 bg-gray-200 cursor-not-allowed"
      >
        Saving up...
      </button>
    </div>
  );
}
