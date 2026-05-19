import { notFound } from "next/navigation";
import Link from "next/link";
import BadgeTile from "@/components/kid/BadgeTile";
import CustomBadgeTile from "@/components/kid/CustomBadgeTile";
import {
  getKid,
  listRewardsForKid,
  listBadgeProgress,
  listWishlistItems,
  listCustomBadgeProgress,
  listActiveStrikes,
} from "@/lib/data/stub";
import { addToWishlist, removeFromWishlist } from "@/lib/actions/rewards";
import RewardClaimButton from "@/components/kid/RewardClaimButton";
import { BADGE_META } from "@/lib/domain/badge-config";
import type { Reward, Kid, BadgeProgress, WishlistItem, BadgeCategory, CustomBadgeProgress } from "@/lib/domain/types";
// Kid is used in BadgesTab props

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

const ALL_BADGE_CATEGORIES: BadgeCategory[] = [
  "champion", "athlete", "musician", "self_care", "explorer", "scholar",
  "streak", "star_collector", "task_titan",
];

function BadgesTab({
  kid,
  badges,
  customBadgeProgress,
}: {
  kid: Kid;
  badges: BadgeProgress[];
  customBadgeProgress: CustomBadgeProgress[];
}) {
  const level = getLevel(kid.totalStarsEarned);
  const { pct: levelPct, next: nextLevel } = getLevelProgress(kid.totalStarsEarned);

  const progressByCategory = new Map(badges.map((b) => [b.category, b]));
  const earned = badges.filter((b) => b.currentTier !== "none");
  const earnedCustom = customBadgeProgress.filter((p) => p.currentTier !== "none");
  const inProgressCustom = customBadgeProgress.filter((p) => p.currentTier === "none");

  return (
    <div className="space-y-4">
      {/* Profile Level card + all levels horizontal roadmap */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Profile Level</div>

        {/* Current level summary row */}
        <div className="flex items-center gap-3 mb-4">
          <span
            className="text-3xl w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
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
            <div className="bg-gray-100 rounded-full h-2 mt-1.5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.round(levelPct * 100)}%`, background: level.color }}
              />
            </div>
          </div>
        </div>

        {/* Horizontal levels track */}
        <div className="relative flex items-start justify-between gap-1">
          {/* Connecting line */}
          <div className="absolute top-7 left-7 right-7 h-0.5 bg-gray-200 z-0" />
          {/* Filled portion */}
          {(() => {
            const currentIdx = LEVELS.findIndex((l, i) =>
              kid.totalStarsEarned >= l.min && (i === LEVELS.length - 1 || kid.totalStarsEarned < LEVELS[i + 1].min)
            );
            const fillPct = currentIdx === 0
              ? 0
              : `${Math.round((currentIdx / (LEVELS.length - 1)) * 100)}%`;
            return (
              <div
                className="absolute top-7 left-7 h-0.5 z-0"
                style={{ width: fillPct, background: level.color }}
              />
            );
          })()}

          {LEVELS.map((l, idx) => {
            const isUnlocked = kid.totalStarsEarned >= l.min;
            const isCurrent = kid.totalStarsEarned >= l.min && (idx === LEVELS.length - 1 || kid.totalStarsEarned < LEVELS[idx + 1].min);
            return (
              <div key={l.name} className="relative z-10 flex flex-col items-center gap-1 flex-1">
                {/* Node circle */}
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-3xl border-2 transition-all"
                  style={{
                    background: isUnlocked ? l.color + "22" : "#f3f4f6",
                    borderColor: isCurrent ? l.color : isUnlocked ? l.color + "88" : "#e5e7eb",
                    boxShadow: isCurrent ? `0 0 0 3px ${l.color}33` : "none",
                    opacity: isUnlocked ? 1 : 0.5,
                  }}
                >
                  {l.emoji}
                </div>
                {/* Label */}
                <span
                  className="text-[9px] font-black text-center leading-tight"
                  style={{ color: isUnlocked ? l.color : "#9ca3af" }}
                >
                  {l.name}
                </span>
                {/* Star threshold */}
                <span className="text-[8px] text-gray-400 font-semibold">
                  {idx === 0 ? "Start" : `${l.min}⭐`}
                </span>
                {/* "YOU" pin on current */}
                {isCurrent && (
                  <span
                    className="text-[8px] font-black px-1 py-0.5 rounded-full text-white leading-none"
                    style={{ background: l.color }}
                  >
                    YOU
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* My Collection — all earned badges (built-in + custom) */}
      {earned.length > 0 || earnedCustom.length > 0 ? (
        <div
          className="rounded-2xl p-4 shadow-sm"
          style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-white text-sm tracking-wide">✨ My Collection</h3>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
              {earned.length + earnedCustom.length} / {ALL_BADGE_CATEGORIES.length + customBadgeProgress.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-5 justify-center">
            {earned
              .sort((a, b) => {
                const tierOrder = { gold: 0, silver: 1, bronze: 2, none: 3 };
                return tierOrder[a.currentTier] - tierOrder[b.currentTier];
              })
              .map((b) => (
                <BadgeTile
                  key={b.category}
                  category={b.category}
                  completionCount={b.completionCount}
                  size="md"
                  showProgress={false}
                />
              ))}
            {earnedCustom.map((p) => (
              <CustomBadgeTile key={p.badgeId} progress={p} size="md" />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white/60 rounded-2xl px-4 py-6 text-center">
          <div className="text-3xl mb-2">🏅</div>
          <div className="text-sm font-bold text-gray-500">No badges yet</div>
          <div className="text-xs text-gray-400 mt-1">Complete tasks to earn your first badge!</div>
        </div>
      )}

      {/* Full badge grid — task badges */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h3 className="font-bold text-gray-800 mb-4">🏅 Task Badges</h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 justify-items-center">
          {(["champion","athlete","musician","self_care","explorer","scholar"] as BadgeCategory[]).map((cat) => {
            const b = progressByCategory.get(cat);
            return (
              <BadgeTile
                key={cat}
                category={cat}
                completionCount={b?.completionCount ?? 0}
                size="sm"
              />
            );
          })}
        </div>
      </div>

      {/* Streak badge */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h3 className="font-bold text-gray-800 mb-4">🔥 Streak Badge</h3>
        <div className="flex justify-center">
          <BadgeTile
            category="streak"
            completionCount={progressByCategory.get("streak")?.completionCount ?? kid.currentStreak}
            size="md"
          />
        </div>
      </div>

      {/* Milestone badges */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h3 className="font-bold text-gray-800 mb-4">⚡ Milestone Badges</h3>
        <div className="grid grid-cols-2 gap-4 justify-items-center">
          {(["star_collector","task_titan"] as BadgeCategory[]).map((cat) => {
            const b = progressByCategory.get(cat);
            return (
              <BadgeTile
                key={cat}
                category={cat}
                completionCount={b?.completionCount ?? 0}
                size="md"
              />
            );
          })}
        </div>
      </div>

      {inProgressCustom.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-4">🎯 Goal Badges</h3>
          <div className="grid grid-cols-3 gap-3">
            {inProgressCustom.map((p) => (
              <CustomBadgeTile key={p.badgeId} progress={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RewardCard({
  reward: r,
  pointsBalance,
  cashBalance,
  isWishlisted,
  wishlistFull,
  kidId,
  activeStrikeCount,
}: {
  reward: Reward;
  pointsBalance: number;
  cashBalance: number;
  isWishlisted: boolean;
  wishlistFull: boolean;
  kidId: string;
  activeStrikeCount: number;
}) {
  const canAfford =
    (r.costPoints > 0 && pointsBalance >= r.costPoints) ||
    (r.costCashCents > 0 && cashBalance >= r.costCashCents);
  const progress = Math.min(100, (pointsBalance / r.costPoints) * 100);

  if (r.who === "team") {
    return (
      <div className="relative bg-purple-50 rounded-2xl overflow-hidden shadow-sm border border-purple-100 flex flex-col h-[160px]">
        <span className="absolute top-2 right-2 bg-white text-purple-600 text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-sm">
          ⭐{r.costPoints}
        </span>
        <span className="absolute top-2 left-2 text-[9px] font-bold text-purple-400">👥</span>
        <div className="flex flex-col items-center px-2 pt-6 pb-2.5 flex-1">
          <div className="text-4xl mb-1.5">{r.icon}</div>
          <div className="font-black text-[12px] text-center text-gray-800 leading-tight mb-2.5 px-1">{r.name}</div>
          <button type="button" className="w-full rounded-xl text-[11px] text-white font-bold py-1.5 mt-auto" style={{ backgroundColor: "#7c3aed" }}>
            Contribute ⭐
          </button>
        </div>
      </div>
    );
  }

  const heartDisabled = !isWishlisted && wishlistFull;

  const wishlistAction = async () => {
    "use server";
    if (isWishlisted) await removeFromWishlist(kidId, r.id);
    else await addToWishlist(kidId, r.id);
  };

  if (canAfford) {
    return (
      <div className="relative bg-orange-50 rounded-2xl overflow-hidden shadow-sm border border-orange-100 flex flex-col h-[160px]">
        {/* Star cost — top-right */}
        <span className="absolute top-2 right-2 bg-white text-amber-600 text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-sm">
          ⭐{r.costPoints}
        </span>
        {/* Heart — top-left */}
        <form action={wishlistAction} className="absolute top-1.5 left-2">
          <button type="submit" disabled={heartDisabled} className="text-sm leading-none disabled:opacity-30">
            {isWishlisted ? "❤️" : "🤍"}
          </button>
        </form>
        <div className="flex flex-col items-center px-2 pt-6 pb-2.5 flex-1">
          <div className="text-4xl mb-1.5">{r.icon}</div>
          <div className="font-black text-[12px] text-center text-gray-800 leading-tight mb-2.5 px-1">{r.name}</div>
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
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-gray-50 rounded-2xl overflow-hidden shadow-sm border border-gray-100 flex flex-col h-[160px]">
      {/* Star cost — top-right */}
      <span className="absolute top-2 right-2 bg-white text-amber-600 text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-sm">
        ⭐{r.costPoints}
      </span>
      {/* Heart — top-left */}
      <form action={wishlistAction} className="absolute top-1.5 left-2">
        <button type="submit" disabled={heartDisabled} className="text-sm leading-none disabled:opacity-30">
          {isWishlisted ? "❤️" : "🤍"}
        </button>
      </form>
      <div className="flex flex-col items-center px-2 pt-6 pb-2.5 flex-1">
        <div className="text-4xl mb-1.5 opacity-60">{r.icon}</div>
        <div className="font-black text-[12px] text-center text-gray-500 leading-tight mb-1.5 px-1">{r.name}</div>
        <div className="w-full bg-gray-200 rounded-full h-1 mb-1.5">
          <div className="h-1 rounded-full bg-orange-300" style={{ width: `${progress}%` }} />
        </div>
        <div className="text-[10px] text-gray-400 mb-2">{r.costPoints - pointsBalance} more ⭐</div>
        <button type="button" disabled className="w-full rounded-xl text-[11px] text-gray-400 font-bold py-1.5 mt-auto bg-gray-200 cursor-not-allowed">
          Saving up…
        </button>
      </div>
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

  const [rewards, badges, wishlist, customBadgeProgress, activeStrikes] = await Promise.all([
    listRewardsForKid(kid.id),
    listBadgeProgress(kid.id),
    listWishlistItems(kid.id),
    listCustomBadgeProgress(kid.id),
    listActiveStrikes(kid.id),
  ]);

  const activeRewards = rewards.filter((r) => r.active);
  const wishlistRewardIds = new Set(wishlist.map((w) => w.rewardId));
  const wishlistFull = wishlist.length >= 3;

  // Sort wishlist slots 1-3
  const wishlistSlots: (WishlistItem & { reward: Reward | undefined })[] = [1, 2, 3].map((pos) => {
    const item = wishlist.find((w) => w.position === pos);
    return {
      ...(item ?? { id: "", kidId: kid.id, rewardId: "", addedAt: "", position: pos }),
      reward: item ? rewards.find((r) => r.id === item.rewardId) : undefined,
    };
  });

  return (
    <div className="p-4 md:p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-black">
              {isBadgesTab ? "🏅 Badges" : "🎁 Rewards"}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-gray-400">⭐ {kid.pointsBalance} stars</p>
              {kid.cashBalance > 0 && (
                <div
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-black"
                  style={{ background: "#dcfce7", color: "#15803d" }}
                >
                  💵 ${(kid.cashBalance / 100).toFixed(2)}
                </div>
              )}
            </div>
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
            🎁 Rewards
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
            badges={badges}
            customBadgeProgress={customBadgeProgress}
          />
        ) : (
          <>
            {/* Wishlist */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-700">💛 My Wishlist</h3>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{wishlist.length}/3</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {wishlistSlots.map((slot) =>
                slot.reward ? (
                  <div
                    key={slot.position}
                    className="rounded-2xl p-3 min-h-[80px] flex flex-col items-center justify-center gap-1 bg-amber-50 relative"
                    style={{ border: "1.5px solid #fcd34d" }}
                  >
                    <form action={async () => { "use server"; await removeFromWishlist(kid.id, slot.rewardId); }} className="absolute top-1.5 right-1.5">
                      <button type="submit" className="text-xs text-gray-400 hover:text-red-400 leading-none font-bold">×</button>
                    </form>
                    <span className="text-2xl">{slot.reward.icon}</span>
                    <span className="text-[11px] font-bold text-gray-700 text-center leading-tight">{slot.reward.name}</span>
                    <span className="text-[10px] text-amber-600 font-bold">⭐ {slot.reward.costPoints}</span>
                  </div>
                ) : (
                  <div
                    key={slot.position}
                    className="rounded-2xl p-3 min-h-[80px] flex flex-col items-center justify-center gap-1"
                    style={{ border: "1.5px dashed #d1d5db" }}
                  >
                    <span className="text-base">🤍</span>
                    <span className="text-xs text-gray-400">Add a reward</span>
                  </div>
                )
              )}
            </div>

            {/* Reward grid */}
            {activeRewards.length === 0 ? (
              <p className="text-center text-gray-400 py-12">
                No rewards yet — ask a parent to add some! 🎁
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {activeRewards.map((r) => (
                  <RewardCard
                    key={r.id}
                    reward={r}
                    pointsBalance={kid.pointsBalance}
                    cashBalance={kid.cashBalance}
                    isWishlisted={wishlistRewardIds.has(r.id)}
                    wishlistFull={wishlistFull}
                    kidId={kid.id}
                    activeStrikeCount={activeStrikes.length}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
  );
}
