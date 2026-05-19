import Link from "next/link";
import { listKids, listRewardsForKid, listCustomBadges, listTasksForFamily, listBadgeConfigOverrides } from "@/lib/data/stub";
import RewardFilterBar from "@/components/parent/RewardFilterBar";
import BadgesClient from "@/components/parent/BadgesClient";
import { getRewardType } from "@/lib/registry/reward-type-registry";
import type { Reward, Kid } from "@/lib/domain/types";

function RewardCard({ reward, kids }: { reward: Reward; kids: Kid[] }) {
  const typeStyle = getRewardType(reward.rewardType);
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
      <div
        className="w-11 h-11 rounded-[13px] flex items-center justify-center text-2xl flex-shrink-0"
        style={{ background: typeStyle.bg }}
      >
        {reward.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-extrabold text-gray-900 truncate text-[14px] mb-1">{reward.name}</div>
        <div className="flex flex-wrap gap-1 mb-1">
          <span
            className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ background: typeStyle.bg, color: typeStyle.color }}
          >
            {typeStyle.emoji} {typeStyle.label}
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
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        {reward.costPoints > 0 && (
          <span className="text-[13px] font-extrabold text-amber-500">{reward.costPoints} ⭐</span>
        )}
        {reward.costCashCents > 0 && (
          <span className="text-[13px] font-extrabold text-green-700">💵 ${(reward.costCashCents / 100).toFixed(2)}</span>
        )}
      </div>
      <span className="text-gray-300 text-xl flex-shrink-0">›</span>
    </Link>
  );
}

export default async function ParentRewardsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; kid?: string; tab?: string }>;
}) {
  const { type = "", kid: kidParam = "", tab } = await searchParams;
  const isBadgesTab = tab === "badges";

  const kids = await listKids();

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2.5">
        <h1 className="text-base font-extrabold text-gray-900">
          {isBadgesTab ? "🏅 Badges" : "🎁 Rewards"}
        </h1>
        {!isBadgesTab && (
          <Link
            href="/parent/rewards/new"
            className="bg-indigo-600 text-white rounded-full px-4 py-2 text-sm font-bold hover:bg-indigo-700"
          >
            + Add Reward
          </Link>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 px-4 pb-3">
        <Link
          href="/parent/rewards"
          className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
            !isBadgesTab ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          🎁 Rewards
        </Link>
        <Link
          href="/parent/rewards?tab=badges"
          className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
            isBadgesTab ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          🏅 Badges
        </Link>
      </div>

      {isBadgesTab ? (
        <BadgesTabContent kids={kids} />
      ) : (
        <RewardsTabContent type={type} kidParam={kidParam} kids={kids} />
      )}
    </div>
  );
}

async function BadgesTabContent({ kids }: { kids: Kid[] }) {
  const [badges, tasks, overrides] = await Promise.all([
    listCustomBadges(),
    listTasksForFamily(),
    listBadgeConfigOverrides(),
  ]);
  return <BadgesClient badges={badges} tasks={tasks} kids={kids} overrides={overrides} />;
}

async function RewardsTabContent({
  type,
  kidParam,
  kids,
}: {
  type: string;
  kidParam: string;
  kids: Kid[];
}) {
  const all = (await Promise.all(kids.map((k) => listRewardsForKid(k.id)))).flat();
  const seen = new Set<string>();
  const rewards = all.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  const types = type ? type.split(",").filter(Boolean) : [];
  const kidIds = kidParam ? kidParam.split(",").filter(Boolean) : [];

  const filtered = rewards.filter((r) => {
    if (types.length > 0 && !types.includes(r.rewardType)) return false;
    if (kidIds.length > 0 && r.availableTo.length > 0 && !kidIds.some((id) => r.availableTo.includes(id))) return false;
    return true;
  });

  const active = filtered.filter((r) => r.active);
  const paused = filtered.filter((r) => !r.active);

  return (
    <>
      <RewardFilterBar
        types={types}
        kidIds={kidIds}
        kids={kids.map((k) => ({ id: k.id, name: k.name }))}
      />
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
    </>
  );
}
