import { notFound } from "next/navigation";
import Link from "next/link";
import KidShell from "@/components/kid/KidShell";
import {
  getKid,
  listRewardsForKid,
  listKids,
  listBadgeProgress,
  listWeeklyStarsByKid,
} from "@/lib/data/stub";
import type { Reward, Kid, BadgeProgress } from "@/lib/domain/types";

const LEVELS = [
  { min: 0,    max: 99,       emoji: "🌱", name: "Seedling",  color: "#16a34a" },
  { min: 100,  max: 299,      emoji: "🗺️", name: "Explorer",  color: "#2563eb" },
  { min: 300,  max: 599,      emoji: "🏅", name: "Champion",  color: "#d97706" },
  { min: 600,  max: 999,      emoji: "🌟", name: "Legend",    color: "#7c3aed" },
  { min: 1000, max: Infinity, emoji: "🚀", name: "Superstar", color: "#dc2626" },
];

function getLevel(stars: number) {
  return LEVELS.find((l) => stars >= l.min && stars <= l.max) ?? LEVELS[0];
}

function getLevelProgress(stars: number) {
  const idx = LEVELS.findIndex((l) => stars >= l.min && stars <= l.max);
  const level = LEVELS[idx];
  if (idx === LEVELS.length - 1) return { pct: 1, next: null };
  const next = LEVELS[idx + 1];
  const pct = (stars - level.min) / (next.min - level.min);
  return { pct: Math.min(1, pct), next };
}

const BADGE_META: Record<string, { icon: string; label: string }> = {
  hygiene:     { icon: "🦷", label: "Hygiene" },
  physical:    { icon: "🏃", label: "Active" },
  learning:    { icon: "📚", label: "Learning" },
  chores:      { icon: "🧹", label: "Chores" },
  music:       { icon: "🎵", label: "Music" },
  mindfulness: { icon: "🧘", label: "Mindful" },
};

const TIER_ORDER = ["none", "bronze", "silver", "gold"] as const;
const TIER_THRESHOLDS = { bronze: 10, silver: 50, gold: 100 };

function TierBadge({ tier }: { tier: string }) {
  if (tier === "gold")   return <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">🥇 Gold</span>;
  if (tier === "silver") return <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">🥈 Silver</span>;
  if (tier === "bronze") return <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">🥉 Bronze</span>;
  return null;
}

function BadgesTab({
  kid,
  allKids,
  badges,
  weeklyStars,
}: {
  kid: Kid;
  allKids: Kid[];
  badges: BadgeProgress[];
  weeklyStars: Record<string, number>;
}) {
  const level = getLevel(kid.totalStarsEarned);
  const { pct: levelPct, next: nextLevel } = getLevelProgress(kid.totalStarsEarned);

  // Sibling leaderboard — rank all kids by this-week stars
  const ranked = allKids
    .map((k) => ({ kid: k, stars: weeklyStars[k.id] ?? 0 }))
    .sort((a, b) => b.stars - a.stars);
  const leader = ranked[0]?.stars ?? 0;

  // Categorise badges
  const earned = badges.filter((b) => b.currentTier !== "none");
  const inProgress = badges
    .filter((b) => b.completionCount > 0)
    .sort((a, b) => {
      const nextA = TIER_THRESHOLDS[TIER_ORDER[TIER_ORDER.indexOf(a.currentTier) + 1] as keyof typeof TIER_THRESHOLDS] ?? Infinity;
      const nextB = TIER_THRESHOLDS[TIER_ORDER[TIER_ORDER.indexOf(b.currentTier) + 1] as keyof typeof TIER_THRESHOLDS] ?? Infinity;
      return (nextA - a.completionCount) - (nextB - b.completionCount);
    })
    .slice(0, 3);

  const earnedCount = earned.length;

  return (
    <div className="space-y-4">
      {/* Level card */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="text-3xl w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: level.color + "22" }}
          >
            {level.emoji}
          </span>
          <div className="flex-1">
            <div className="font-black text-gray-900">{level.name}</div>
            <div className="text-xs text-gray-400">
              {nextLevel
                ? `${nextLevel.min - kid.totalStarsEarned} ⭐ to ${nextLevel.name}`
                : "Maximum level! 🎉"}
            </div>
          </div>
        </div>
        <div className="bg-gray-100 rounded-full h-2.5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.round(levelPct * 100)}%`, background: level.color }}
          />
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Total ⭐", value: kid.totalStarsEarned },
          { label: "🔥 Streak", value: `${kid.currentStreak}d` },
          { label: "Badges", value: earnedCount },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl p-3 shadow-sm text-center">
            <div className="text-xl font-black">{s.value}</div>
            <div className="text-[10px] text-gray-400 font-bold tracking-wider">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Sibling competition */}
      {allKids.length > 1 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-3">🏁 This week&apos;s family race</h3>
          <div className="space-y-2">
            {ranked.map(({ kid: k, stars }, idx) => {
              const isMe = k.id === kid.id;
              const barPct = leader > 0 ? (stars / leader) * 100 : 0;
              const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
              const gap = leader - stars;
              return (
                <div key={k.id} className={`flex items-center gap-2 p-2 rounded-xl ${isMe ? "bg-indigo-50" : ""}`}>
                  <span className="text-lg w-6 text-center">{medal}</span>
                  <span className="text-xl w-8 text-center">{k.avatar}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className={`text-sm font-bold ${isMe ? "text-indigo-700" : "text-gray-700"}`}>
                        {k.name}{isMe && " (you)"}
                      </span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${barPct}%`, background: isMe ? "#4f46e5" : "#d1d5db" }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold">⭐ {stars}</div>
                    {gap > 0 && (
                      <div className="text-[10px] text-gray-400">{gap} behind</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Badges in progress */}
      {inProgress.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-3">⚡ Badges in progress</h3>
          <div className="space-y-3">
            {inProgress.map((b) => {
              const meta = BADGE_META[b.category] ?? { icon: "⭐", label: b.category };
              const tierIdx = TIER_ORDER.indexOf(b.currentTier);
              const nextTierKey = TIER_ORDER[tierIdx + 1] as keyof typeof TIER_THRESHOLDS | undefined;
              const nextThreshold = nextTierKey ? TIER_THRESHOLDS[nextTierKey] : null;
              const pct = nextThreshold ? Math.min(100, (b.completionCount / nextThreshold) * 100) : 100;
              return (
                <div key={b.id} className="flex items-center gap-3">
                  <span className="text-2xl">{meta.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-gray-700">{meta.label}</span>
                      <TierBadge tier={b.currentTier} />
                    </div>
                    <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {b.completionCount}{nextThreshold ? `/${nextThreshold}` : ""} completions
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Earned badges */}
      {earned.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-3">🏆 Earned badges</h3>
          <div className="grid grid-cols-4 gap-3">
            {earned.map((b) => {
              const meta = BADGE_META[b.category] ?? { icon: "⭐", label: b.category };
              return (
                <div key={b.id} className="flex flex-col items-center gap-1">
                  <span className="text-3xl">{meta.icon}</span>
                  <TierBadge tier={b.currentTier} />
                  <span className="text-[10px] text-gray-500 text-center">{meta.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {earned.length === 0 && inProgress.length === 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
          <div className="text-4xl mb-2">🎯</div>
          <p className="text-sm text-gray-500">Complete tasks to earn your first badge!</p>
        </div>
      )}
    </div>
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

  if (canAfford) {
    return (
      <div className="relative bg-white rounded-2xl p-3 shadow">
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

export default async function RewardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ kidId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { kidId } = await params;
  const { tab } = await searchParams;
  const kid = await getKid(kidId);
  if (!kid) notFound();

  const isBadgesTab = tab === "badges";

  const [rewards, allKids, badges, weeklyStars] = await Promise.all([
    listRewardsForKid(kid.id),
    isBadgesTab ? listKids() : Promise.resolve([]),
    isBadgesTab ? listBadgeProgress(kid.id) : Promise.resolve([]),
    isBadgesTab ? listWeeklyStarsByKid() : Promise.resolve({}),
  ]);

  const activeRewards = rewards.filter((r) => r.active);

  return (
    <KidShell kid={kid} active="rewards">
      <div className="p-4 md:p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-black">
              {isBadgesTab ? "🏅 Badges" : "🛒 Reward Shop"}
            </h2>
            <p className="text-sm text-gray-400">⭐ {kid.pointsBalance} stars</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 mb-4">
          <Link
            href={`/kid/${kid.id}/rewards`}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              !isBadgesTab ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            🛒 Shop
          </Link>
          <Link
            href={`/kid/${kid.id}/rewards?tab=badges`}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              isBadgesTab ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            🏅 Badges
          </Link>
        </div>

        {isBadgesTab ? (
          <BadgesTab
            kid={kid}
            allKids={allKids}
            badges={badges}
            weeklyStars={weeklyStars}
          />
        ) : (
          <>
            {/* Reward grid */}
            {activeRewards.length === 0 ? (
              <p className="text-center text-gray-400 py-12">
                No rewards yet — ask a parent to add some! 🎁
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {activeRewards.map((r) => (
                  <RewardCard key={r.id} reward={r} pointsBalance={kid.pointsBalance} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </KidShell>
  );
}
