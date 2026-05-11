import Link from "next/link";
import { listKids, listRewardsForKid } from "@/lib/data/stub";
import RewardFilterBar from "@/components/parent/RewardFilterBar";
import type { Reward, Kid } from "@/lib/domain/types";

const REWARD_TYPE_STYLE: Record<Reward["rewardType"], { bg: string; color: string; label: string }> = {
  treat:      { bg: "#fce7f3", color: "#9d174d",  label: "🍬 Treat"       },
  privilege:  { bg: "#ede9fe", color: "#5b21b6",  label: "🔓 Privilege"   },
  experience: { bg: "#d1fae5", color: "#065f46",  label: "✨ Experience"  },
  prize:      { bg: "#fef3c7", color: "#92400e",  label: "🎀 Prize"       },
};

function RewardCard({ reward, kids }: { reward: Reward; kids: Kid[] }) {
  const typeStyle = REWARD_TYPE_STYLE[reward.rewardType];
  const kidNames =
    reward.availableTo.length === 0
      ? "All kids"
      : reward.availableTo.map((id) => kids.find((k) => k.id === id)?.name ?? id).join(", ");

  const periodLabel = reward.redemptionPeriod === "day"
    ? "per day" : reward.redemptionPeriod === "week"
    ? "per week" : reward.redemptionPeriod === "month"
    ? "per month" : "";
  const limitStr = reward.redemptionLimit ? `${reward.redemptionLimit}× ${periodLabel}` : "";

  return (
    <Link
      href={`/parent/rewards/${reward.id}/edit`}
      className="flex items-center gap-3 bg-white rounded-2xl p-3.5"
      style={{
        border: "1.5px solid #e5e7eb",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        opacity: reward.active ? 1 : 0.55,
      }}
    >
      {/* Icon */}
      <div
        className="w-11 h-11 rounded-[13px] flex items-center justify-center text-2xl flex-shrink-0"
        style={{ background: typeStyle.bg }}
      >
        {reward.icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="font-extrabold text-gray-900 truncate text-[14px] mb-1">{reward.name}</div>
        <div className="flex flex-wrap gap-1 mb-1">
          <span
            className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ background: typeStyle.bg, color: typeStyle.color }}
          >
            {typeStyle.label}
          </span>
          <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold bg-gray-100 text-gray-600">
            {reward.who === "team" ? "👨‍👩‍👧‍👦 Team" : "👤 Individual"}
          </span>
          {reward.recurrence === "one_off" && (
            <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold bg-amber-100 text-amber-700">🔂 One-off</span>
          )}
          {reward.requiresApproval && (
            <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold bg-gray-100 text-gray-600">Approval needed</span>
          )}
        </div>
        <div className="text-[11px] text-gray-400 font-medium">
          {kidNames}{limitStr ? ` · ${limitStr}` : ""}
        </div>
      </div>

      {/* Cost + arrow */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-[14px] font-extrabold text-amber-500">{reward.costPoints} ⭐</span>
        <span className="text-gray-300 text-xl">›</span>
      </div>
    </Link>
  );
}

export default async function ParentRewardsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; kid?: string }>;
}) {
  const { type = "", kid: kidId = "" } = await searchParams;
  const kids = await listKids();
  const all = (await Promise.all(kids.map((k) => listRewardsForKid(k.id)))).flat();
  const seen = new Set<string>();
  const rewards = all.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  const filtered = rewards.filter((r) => {
    if (type && r.rewardType !== type) return false;
    if (kidId && r.availableTo.length > 0 && !r.availableTo.includes(kidId)) return false;
    return true;
  });

  const active = filtered.filter((r) => r.active);
  const paused = filtered.filter((r) => !r.active);

  return (
    <div className="flex flex-col min-h-full">
      {/* Filter bar */}
      <RewardFilterBar
        type={type}
        kidId={kidId}
        kids={kids.map((k) => ({ id: k.id, name: k.name }))}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-base font-extrabold text-gray-900">🎁 Rewards</h1>
        <Link
          href="/parent/rewards/new"
          className="bg-indigo-600 text-white rounded-full px-4 py-2 text-sm font-bold hover:bg-indigo-700"
        >
          + Add Reward
        </Link>
      </div>

      {/* List */}
      <div className="px-4 pb-4">
        {filtered.length === 0 ? (
          <p className="text-center text-gray-400 py-16">No rewards yet. Add your first! 🎁</p>
        ) : (
          <>
            {active.length > 0 && (
              <>
                <div className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-2">Active</div>
                <div className="space-y-2 mb-4">
                  {active.map((r) => <RewardCard key={r.id} reward={r} kids={kids} />)}
                </div>
              </>
            )}
            {paused.length > 0 && (
              <>
                <div className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-2">Paused</div>
                <div className="space-y-2">
                  {paused.map((r) => <RewardCard key={r.id} reward={r} kids={kids} />)}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
