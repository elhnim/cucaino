import Link from "next/link";
import { listKids, listRewardsForKid } from "@/lib/data/stub";
import type { Reward, Kid } from "@/lib/domain/types";

export default async function ParentRewardsPage() {
  const kids = await listKids();
  const all = (await Promise.all(kids.map((k) => listRewardsForKid(k.id)))).flat();
  const seen = new Set<string>();
  const rewards = all.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold text-gray-900">🎁 Rewards</h1>
          <Link
            href="/parent/rewards/new"
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-bold text-white"
          >
            + Add Reward
          </Link>
        </div>

        {rewards.length === 0 ? (
          <p className="text-center text-gray-400 py-16">
            No rewards yet. Add your first reward! 🎁
          </p>
        ) : (
          <div className="space-y-3">
            {rewards.map((reward) => (
              <RewardCard key={reward.id} reward={reward} kids={kids} />
            ))}
          </div>
        )}
    </div>
  );
}

function RewardCard({ reward, kids }: { reward: Reward; kids: Kid[] }) {
  const rewardTypeBadge: Record<Reward["rewardType"], string> = {
    treat:      "bg-pink-100 text-pink-700",
    privilege:  "bg-blue-100 text-blue-700",
    experience: "bg-green-100 text-green-700",
    prize:      "bg-amber-100 text-amber-700",
  };

  const kidNames =
    reward.availableTo.length === 0
      ? "All kids"
      : reward.availableTo
          .map((id) => kids.find((k) => k.id === id)?.name ?? id)
          .join(", ");

  return (
    <Link
      href={`/parent/rewards/${reward.id}/edit`}
      className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3 block hover:shadow-md transition-shadow"
    >
      <div
        className="flex-shrink-0 flex items-center justify-center rounded-full bg-amber-50 text-3xl"
        style={{ width: 48, height: 48 }}
      >
        {reward.icon}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-bold text-gray-900 truncate">{reward.name}</p>

        <div className="flex flex-wrap gap-1 mt-1">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rewardTypeBadge[reward.rewardType]}`}>
            {reward.rewardType.charAt(0).toUpperCase() + reward.rewardType.slice(1)}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${reward.who === "team" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
            {reward.who === "team" ? "Team" : "Individual"}
          </span>
          {reward.recurrence === "one_off" && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
              ✨ One-off
            </span>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-0.5">{kidNames}</p>
        <p className="text-sm text-gray-600 mt-0.5">⭐ {reward.costPoints}</p>

        {reward.requiresApproval && (
          <p className="text-xs text-orange-500 mt-0.5">Requires approval</p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full ${
            reward.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {reward.active ? "Active" : "Paused"}
        </span>
        <span className="text-xl text-gray-300">›</span>
      </div>
    </Link>
  );
}
