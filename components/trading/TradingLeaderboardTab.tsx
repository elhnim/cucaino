"use client";

export interface LeaderboardEntry {
  kidId: string;
  name: string;
  avatar: string;
  totalValueNuggets: number;
  totalDepositedStars: number;
  totalWithdrawnStars: number;
}

interface Props {
  leaderboard: LeaderboardEntry[];
  currentKidId: string | null;
}

function calcGainPct(entry: LeaderboardEntry): number {
  if (entry.totalDepositedStars === 0) return 0;
  const deposited = entry.totalDepositedStars * 1000;
  const total = entry.totalValueNuggets + entry.totalWithdrawnStars * 1000;
  return ((total / deposited) - 1) * 100;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export default function TradingLeaderboardTab({
  leaderboard,
  currentKidId,
}: Props) {
  if (leaderboard.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <span className="text-6xl">🚀</span>
        <p className="text-gray-600 font-medium">
          No one has started trading yet. Be the first!
        </p>
      </div>
    );
  }

  // Sort: those with deposits by % gain descending; no deposits go last
  const withDeposits = leaderboard
    .filter((e) => e.totalDepositedStars > 0)
    .sort((a, b) => calcGainPct(b) - calcGainPct(a));
  const withoutDeposits = leaderboard.filter(
    (e) => e.totalDepositedStars === 0
  );

  const sorted = [...withDeposits, ...withoutDeposits];

  return (
    <div>
      <p className="text-sm font-black text-gray-700 mb-3">🏆 Family Rankings</p>
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm divide-y divide-gray-50">
        {sorted.map((entry, i) => {
          const isCurrentKid = entry.kidId === currentKidId;
          const hasStarted = entry.totalDepositedStars > 0;
          const gainPct = hasStarted ? calcGainPct(entry) : null;
          const medal = i < 3 && hasStarted ? MEDALS[i] : null;

          return (
            <div
              key={entry.kidId}
              className={`flex items-center gap-3 px-4 py-3 ${
                isCurrentKid ? "bg-green-50" : ""
              }`}
            >
              {/* Rank */}
              <div className="w-8 text-center">
                {medal ? (
                  <span className="text-xl">{medal}</span>
                ) : hasStarted ? (
                  <span className="text-sm font-black text-gray-400">
                    {i + 1}
                  </span>
                ) : (
                  <span className="text-gray-300">—</span>
                )}
              </div>

              {/* Avatar + name */}
              <span className="text-2xl">{entry.avatar}</span>
              <div className="flex-1 min-w-0">
                <p
                  className={`font-black text-sm ${
                    isCurrentKid ? "text-green-700" : "text-gray-900"
                  } truncate`}
                >
                  {entry.name}
                  {isCurrentKid && (
                    <span className="ml-1 text-xs font-bold text-green-500">
                      (You)
                    </span>
                  )}
                </p>
                {hasStarted ? (
                  <p className="text-xs text-gray-500">
                    🪙 {entry.totalValueNuggets.toLocaleString()}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 italic">
                    Hasn&apos;t started yet
                  </p>
                )}
              </div>

              {/* Gain */}
              {gainPct !== null && (
                <span
                  className={`text-sm font-black ${
                    gainPct >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {gainPct >= 0 ? "+" : ""}
                  {gainPct.toFixed(1)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
