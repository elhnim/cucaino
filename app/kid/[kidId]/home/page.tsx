import { notFound } from "next/navigation";
import PrefetchRoutes from "@/components/kid/PrefetchRoutes";
import Link from "next/link";
import {
  getKid,
  listTasksForKid,
  listCompletionsToday,
  listBadgeProgress,
  listKids,
  listWeeklyStarsByKid,
} from "@/lib/data/stub";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";
import { getTheme } from "@/lib/themes/presets";
import { SUBJECTS } from "@/lib/registry/subject-registry";
import { BADGE_META, BADGE_THRESHOLDS, getTierFromCount } from "@/lib/domain/badge-config";
import type { BadgeProgress, DayOfWeek } from "@/lib/domain/types";

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
  return { pct: Math.min(1, (stars - level.min) / (next.min - level.min)), next };
}

const ENCOURAGEMENTS = [
  "Every day counts! 🌟",
  "You're on a roll! 🔥",
  "Amazing effort! 💪",
  "Nothing can stop you! 🚀",
  "Legend in the making! 🏆",
];

const CIRCUMFERENCE = 2 * Math.PI * 20;


export default async function KidHomePage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();

  const now = new Date();
  const dow = isoWeekday(now);

  const [tasks, completions, badges, allKids, weeklyStars] = await Promise.all([
    listTasksForKid(kid.id),
    listCompletionsToday(kid.id),
    listBadgeProgress(kid.id),
    listKids(),
    listWeeklyStarsByKid(),
  ]);

  const todayTasks = tasksForDay(tasks, dow);
  const completableTasks = todayTasks.filter((t) => t.requiresCompletion);
  const completedIds = new Set(completions.map((c) => c.taskId));
  const done = completableTasks.filter((t) => completedIds.has(t.id)).length;
  const total = completableTasks.length;
  const incompleteTasks = completableTasks.filter((t) => !completedIds.has(t.id));

  const todaySchoolTasks = dow <= 5
    ? tasksForDay(tasks.filter((t) => t.category === "school_subject"), dow)
    : [];

  // Tomorrow's reminders
  const tomorrowDow: DayOfWeek = dow < 5 ? ((dow + 1) as DayOfWeek) : 1;
  const tomorrowActivityTasks = tasksForDay(
    tasks.filter((t) => t.category === "activity"),
    tomorrowDow,
  ).filter((t) => t.location || (t.packingList && t.packingList.length > 0));

  // Badge progress (non-zero), capped at 3, sorted by tier then count
  const badgesInProgress: BadgeProgress[] = badges
    .filter((b) => b.completionCount > 0)
    .sort((a, b) => {
      const tierOrder = { gold: 3, silver: 2, bronze: 1, none: 0 };
      return tierOrder[b.currentTier] - tierOrder[a.currentTier] || b.completionCount - a.completionCount;
    })
    .slice(0, 3);

  const theme = getTheme(kid.themeId);
  const level = getLevel(kid.totalStarsEarned);
  const { pct: levelPct, next: nextLevel } = getLevelProgress(kid.totalStarsEarned);
  const ringOffset = CIRCUMFERENCE * (1 - (total > 0 ? done / total : 0));
  const taskPct = total > 0 ? Math.round((done / total) * 100) : 0;
  const encouragement = ENCOURAGEMENTS[kid.currentStreak % 5];
  const allDone = total > 0 && done >= total;

  return (
    <div className="p-4 space-y-3">
        <PrefetchRoutes routes={[`/kid/${kid.id}/todo`, `/kid/${kid.id}/rewards`, `/play`]} />

        {/* 1. Stats grid — 2×2 when cash balance, 3-col otherwise */}
        {kid.cashBalance > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center gap-1">
              <span className="text-xl font-black">⭐ {kid.pointsBalance}</span>
              <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">Stars</span>
            </div>
            <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center gap-1" style={{ background: "#f0fdf4" }}>
              <span className="text-xl font-black" style={{ color: "#15803d" }}>💵 ${(kid.cashBalance / 100).toFixed(2)}</span>
              <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: "#16a34a" }}>Cash</span>
            </div>
            <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center gap-1">
              <span className="text-xl font-black">🔥 {kid.currentStreak}d</span>
              <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">Streak</span>
            </div>
            <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center gap-1">
              <svg width={50} height={50} viewBox="0 0 52 52">
                <circle cx={26} cy={26} r={20} fill="none" stroke="#e5e7eb" strokeWidth={5} />
                {total > 0 && (
                  <circle
                    cx={26} cy={26} r={20}
                    fill="none"
                    stroke={allDone ? "#22c55e" : theme.accent}
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={ringOffset}
                    transform="rotate(-90 26 26)"
                  />
                )}
                <text x={26} y={30} textAnchor="middle" fontSize={11} fontWeight="bold"
                  fill={total > 0 ? (allDone ? "#22c55e" : theme.accent) : "#9ca3af"}>
                  {total > 0 ? `${done}/${total}` : "—"}
                </text>
              </svg>
              <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">Tasks</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center gap-1">
              <span className="text-xl font-black">⭐ {kid.pointsBalance}</span>
              <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">Stars</span>
            </div>
            <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center gap-1">
              <span className="text-xl font-black">🔥 {kid.currentStreak}d</span>
              <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">Streak</span>
            </div>
            <div className="bg-white rounded-2xl p-3 shadow-sm flex flex-col items-center gap-1">
              <svg width={50} height={50} viewBox="0 0 52 52">
                <circle cx={26} cy={26} r={20} fill="none" stroke="#e5e7eb" strokeWidth={5} />
                {total > 0 && (
                  <circle
                    cx={26} cy={26} r={20}
                    fill="none"
                    stroke={allDone ? "#22c55e" : theme.accent}
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={ringOffset}
                    transform="rotate(-90 26 26)"
                  />
                )}
                <text x={26} y={30} textAnchor="middle" fontSize={11} fontWeight="bold"
                  fill={total > 0 ? (allDone ? "#22c55e" : theme.accent) : "#9ca3af"}>
                  {total > 0 ? `${done}/${total}` : "—"}
                </text>
              </svg>
              <span className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">Tasks</span>
            </div>
          </div>
        )}

        {/* 2. Today's tasks */}
        <div className="bg-white rounded-2xl p-4 shadow-sm" style={allDone ? { background: "#f0fdf4", border: "2px solid #86efac" } : {}}>
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-sm font-black text-gray-800">Today&apos;s tasks</div>
            {total > 0 && (
              <span className="text-xs font-bold" style={{ color: allDone ? "#16a34a" : theme.accent }}>
                {done} / {total} done
              </span>
            )}
          </div>
          {total > 0 && (
            <div className="bg-gray-100 rounded-full h-2 overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${taskPct}%`, background: allDone ? "#22c55e" : theme.accent }}
              />
            </div>
          )}

          {incompleteTasks.length > 0 && (
            <div className="space-y-2 mb-3">
              {incompleteTasks.slice(0, 3).map((task) => (
                <div key={task.id} className="flex items-center gap-2.5 px-3 py-2.5 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-lg flex-shrink-0 shadow-sm">
                    {task.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-gray-900 truncate">{task.name}</div>
                    <div className="text-[10px] text-gray-400 font-semibold">
                      {task.points > 0 && `+${task.points} ⭐`}
                      {task.cashValueCents > 0 && ` +$${(task.cashValueCents / 100).toFixed(2)}`}
                    </div>
                  </div>
                  <div className="w-6 h-6 rounded-full border-2 border-gray-200 flex-shrink-0" />
                </div>
              ))}
              {incompleteTasks.length > 3 && (
                <div className="text-xs text-gray-400 font-semibold pl-1">
                  +{incompleteTasks.length - 3} more…
                </div>
              )}
            </div>
          )}

          <Link
            href={`/kid/${kid.id}/todo`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-white text-sm"
            style={{ background: allDone ? "#16a34a" : theme.accent }}
          >
            {allDone ? "All done! 🎉" : "Jump in →"}
          </Link>
        </div>

        {/* 3. School today + Tomorrow's reminders — side by side when both present */}
        {(todaySchoolTasks.length > 0 || tomorrowActivityTasks.length > 0) && (
          <div className={`grid gap-3 ${todaySchoolTasks.length > 0 && tomorrowActivityTasks.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
            {todaySchoolTasks.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="text-sm font-black text-gray-800 mb-3">📚 School today</div>
                <div className="flex flex-wrap gap-1.5">
                  {todaySchoolTasks.map((t) => {
                    const subj = t.subject && t.subject in SUBJECTS ? SUBJECTS[t.subject as keyof typeof SUBJECTS] : null;
                    return (
                      <span
                        key={t.id}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${subj ? `${subj.bgClass} ${subj.textClass}` : "text-white"}`}
                        style={!subj ? { background: theme.accent } : undefined}
                      >
                        {subj?.icon} {t.customLabel ?? subj?.label ?? t.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {tomorrowActivityTasks.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="text-sm font-black text-gray-800 mb-3">🗓 Tomorrow</div>
                <div className="space-y-2.5">
                  {tomorrowActivityTasks.map((t) => (
                    <div key={t.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center text-sm flex-shrink-0">
                          {t.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-black text-gray-900 truncate">{t.name}</div>
                          {(t.location || t.startTime) && (
                            <div className="text-[10px] text-gray-400 font-semibold truncate">
                              {t.startTime && `${t.startTime} · `}{t.location && `📍 ${t.location}`}
                            </div>
                          )}
                        </div>
                      </div>
                      {t.packingList && t.packingList.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5 pl-9">
                          {t.packingList.map((item, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold">
                              {item}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. Badge highlights — top 3 in progress */}
        {badgesInProgress.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-black text-gray-800">🎖 My badges</div>
              <Link
                href={`/kid/${kid.id}/rewards?tab=badges`}
                className="text-xs font-bold"
                style={{ color: theme.accent }}
              >
                See all →
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {badgesInProgress.map((b) => {
                const meta = BADGE_META[b.category];
                const thresholds = BADGE_THRESHOLDS[b.category];
                if (!meta || !thresholds) return null;
                const tier = getTierFromCount(b.category, b.completionCount);
                const prevThreshold = tier === "gold" ? thresholds.silver : tier === "silver" ? thresholds.bronze : 0;
                const nextThreshold = tier === "gold" ? thresholds.gold : tier === "silver" ? thresholds.gold : tier === "bronze" ? thresholds.silver : thresholds.bronze;
                const pct = tier === "gold" ? 1 : Math.min(1, (b.completionCount - prevThreshold) / (nextThreshold - prevThreshold));
                const tierEmoji = tier === "gold" ? "🥇" : tier === "silver" ? "🥈" : tier === "bronze" ? "🥉" : "";
                return (
                  <div
                    key={b.category}
                    className="rounded-2xl p-2.5 text-center border-[1.5px]"
                    style={{ background: theme.accentSoft, borderColor: theme.accent + "44" }}
                  >
                    <div className="text-2xl mb-1">{meta.icon}</div>
                    <div className="text-[9px] font-black uppercase tracking-wide mb-1.5" style={{ color: theme.accent }}>
                      {meta.label}
                    </div>
                    <div className="h-1 rounded-full bg-gray-200 overflow-hidden mb-1">
                      <div className="h-full rounded-full" style={{ width: `${Math.round(pct * 100)}%`, background: theme.accent }} />
                    </div>
                    <div className="text-[9px] text-gray-400 font-semibold">
                      {b.completionCount} / {nextThreshold} {tierEmoji}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 5. Family race this week */}
        {allKids.length > 1 && (() => {
          const ranked = allKids
            .map((k) => ({ kid: k, stars: weeklyStars[k.id] ?? 0 }))
            .sort((a, b) => b.stars - a.stars);
          const leader = ranked[0]?.stars ?? 0;
          return (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <h3 className="text-sm font-black text-gray-800 mb-3">🏁 This week&apos;s family race</h3>
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
                          <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: isMe ? "#4f46e5" : "#d1d5db" }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold">⭐ {stars}</div>
                        {gap > 0 && isMe && <div className="text-[10px] text-gray-400">{gap} behind</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* 6. Profile Level — informational, below the fold */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Profile Level</span>
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black"
              style={{ background: level.color + "20", color: level.color }}
            >
              {level.emoji} {level.name}
            </span>
          </div>
          <div className="bg-gray-100 rounded-full h-2 overflow-hidden mb-1.5">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.round(levelPct * 100)}%`, background: level.color }}
            />
          </div>
          <p className="text-[11px] text-gray-400 font-semibold">
            {nextLevel
              ? `${nextLevel.min - kid.totalStarsEarned} more ⭐ to ${nextLevel.name}`
              : "Maximum level reached! 🎉"}
          </p>
        </div>

        {/* 7. Encouragement */}
        <div className="bg-white/60 rounded-2xl px-4 py-3 text-center text-sm text-gray-500 font-medium">
          {encouragement}
        </div>

      </div>
  );
}
