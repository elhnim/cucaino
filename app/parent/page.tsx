import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getFamily,
  listKids,
  listPendingRequests,
  listTasksForKid,
  listCompletionsToday,
  listRewardsForKid,
  listPendingCompletions,
} from "@/lib/data/stub";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";
import { getTheme } from "@/lib/themes/presets";
import RequestActions from "@/components/parent/RequestActions";
import CashTransactionButton from "@/components/parent/CashTransactionButton";
import CompletionActions from "@/components/parent/CompletionActions";
import type { Task, DayOfWeek } from "@/lib/domain/types";

export default async function ParentOverviewPage() {
  const [family, kids, pending, pendingCompletions] = await Promise.all([
    getFamily(),
    listKids(),
    listPendingRequests(),
    listPendingCompletions(),
  ]);
  if (!family) redirect("/login");

  const dow = isoWeekday();
  const today = new Date();
  const todayLabel = today.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

  // Load per-kid data
  const kidData = await Promise.all(
    kids.map(async (kid) => {
      const [tasks, completions, rewards] = await Promise.all([
        listTasksForKid(kid.id),
        listCompletionsToday(kid.id),
        listRewardsForKid(kid.id),
      ]);
      const todayTasks = tasksForDay(tasks, dow).filter((t) => t.requiresCompletion);
      const completedIds = new Set(completions.map((c) => c.taskId));
      const done = todayTasks.filter((t) => completedIds.has(t.id)).length;
      const total = todayTasks.length;
      const activityTasks = tasksForDay(tasks.filter((t) => t.category === "activity"), dow);
      return { kid, todayTasks, completedIds, done, total, activityTasks, rewards };
    }),
  );

  // Build reward lookup from all kids' rewards
  const rewardById = new Map(kidData.flatMap((d) => d.rewards).map((r) => [r.id, r]));

  // Group activity tasks by timeBlock across all kids for Today's Heads-Up
  const headsUpBefore: Array<{ kid: (typeof kids)[0]; task: Task }> = [];
  const headsUpAfter: Array<{ kid: (typeof kids)[0]; task: Task }> = [];

  for (const { kid, activityTasks } of kidData) {
    for (const task of activityTasks) {
      if (!task.location && (!task.packingList || task.packingList.length === 0)) continue;
      if (task.timeBlock === "before_school") {
        headsUpBefore.push({ kid, task });
      } else {
        headsUpAfter.push({ kid, task });
      }
    }
  }

  const hasHeadsUp = headsUpBefore.length > 0 || headsUpAfter.length > 0;

  return (
    <div className="p-4 space-y-4 pt-5">

      {/* TODAY'S HEADS-UP */}
      {hasHeadsUp && (
        <div>
          <div className="flex items-center justify-between mb-2.5 px-1">
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Today&apos;s Heads-Up</span>
            <span className="text-[11px] font-semibold text-gray-400">{todayLabel}</span>
          </div>
          <div className="bg-white rounded-[20px] border-[1.5px] border-gray-200 overflow-hidden" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            {headsUpBefore.length > 0 && (
              <div className="px-3.5 pt-3 pb-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wide text-orange-500 mb-2">🌅 Before school</div>
                <div className="space-y-3">
                  {headsUpBefore.map(({ kid, task }) => (
                    <HeadsUpRow key={`${kid.id}-${task.id}`} kid={kid} task={task} />
                  ))}
                </div>
              </div>
            )}
            {headsUpBefore.length > 0 && headsUpAfter.length > 0 && (
              <div className="h-px bg-gray-100 mx-3.5" />
            )}
            {headsUpAfter.length > 0 && (
              <div className="px-3.5 pt-2.5 pb-3">
                <div className="text-[11px] font-bold uppercase tracking-wide text-violet-500 mb-2">🎒 After school</div>
                <div className="space-y-3">
                  {headsUpAfter.map(({ kid, task }) => (
                    <HeadsUpRow key={`${kid.id}-${task.id}`} kid={kid} task={task} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TODAY — kid cards */}
      <div>
        <div className="flex items-center justify-between mb-2.5 px-1">
          <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Today</span>
          <span className="text-[11px] font-semibold text-gray-400">{kids.length} kids</span>
        </div>
        <div className="space-y-2.5">
          {kidData.map(({ kid, done, total, todayTasks, completedIds, activityTasks }) => {
            const theme = getTheme(kid.themeId);
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const allDone = total > 0 && done >= total;
            const kidPending = pending.filter((r) => r.kidId === kid.id);
            const req = kidPending[0];
            const reward = req ? rewardById.get(req.rewardId) : undefined;
            const agoMin = req
              ? Math.round((Date.now() - new Date(req.requestedAt).getTime()) / 60_000)
              : 0;

            return (
              <div
                key={kid.id}
                className="bg-white rounded-[20px] p-3.5"
                style={{
                  border: `1.5px solid ${theme.accentSoft}`,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                }}
              >
                {/* Top row */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-[22px] flex-shrink-0"
                    style={{ background: theme.accentSoft }}
                  >
                    {kid.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-gray-900 leading-tight" style={{ fontSize: 15 }}>{kid.name}</div>
                    <div className="text-gray-400 font-medium" style={{ fontSize: 11 }}>{theme.name} · Age {kid.age}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "#fef3c7", color: "#92400e" }}>
                      {kid.pointsBalance} ⭐
                    </span>
                    {kid.cashBalance > 0 && (
                      <span
                        className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-black"
                        style={{ background: "#dcfce7", color: "#15803d" }}
                      >
                        💵 ${(kid.cashBalance / 100).toFixed(2)}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "#fff7ed", color: "#9a3412" }}>
                      🔥 {kid.currentStreak}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="flex items-center gap-2.5">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: theme.accent }}
                    />
                  </div>
                  <span className="text-xs font-bold flex-shrink-0" style={{ color: allDone ? "#16a34a" : theme.accent }}>
                    {done} / {total}
                  </span>
                </div>

                {/* All done banner */}
                {allDone && (
                  <div className="mt-2 bg-green-50 rounded-xl px-3 py-1.5 text-xs font-bold text-green-700">
                    🎉 All tasks done!
                  </div>
                )}

                {/* Task breakdown */}
                {(todayTasks.length > 0 || activityTasks.length > 0) && (
                  <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: `1px solid ${theme.accentSoft}` }}>
                    {todayTasks.map((task) => {
                      const isDone = completedIds.has(task.id);
                      return (
                        <div key={task.id} className="flex items-center gap-2">
                          <span className="text-sm leading-none flex-shrink-0">{task.icon}</span>
                          <span
                            className="text-[12px] font-semibold flex-1 min-w-0 truncate"
                            style={{ color: isDone ? "#d1d5db" : "#374151", textDecoration: isDone ? "line-through" : "none" }}
                          >
                            {task.name}
                          </span>
                          {isDone && <span className="text-[10px] text-green-500 flex-shrink-0 font-bold">✓</span>}
                        </div>
                      );
                    })}

                    {activityTasks.length > 0 && (
                      <>
                        {todayTasks.length > 0 && <div className="h-px my-1" style={{ background: theme.accentSoft }} />}
                        {activityTasks.map((task) => (
                          <div key={task.id}>
                            <div className="flex items-center gap-2">
                              <span className="text-sm leading-none flex-shrink-0">{task.icon}</span>
                              <span className="text-[12px] font-semibold text-gray-700 flex-1 min-w-0 truncate">{task.name}</span>
                              {task.location && (
                                <span className="text-[10px] text-gray-400 flex-shrink-0 truncate max-w-[100px]">📍 {task.location}</span>
                              )}
                            </div>
                            {task.packingList && task.packingList.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5 ml-6">
                                {task.packingList.map((item, i) => (
                                  <span
                                    key={i}
                                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                                    style={{ background: theme.accentSoft, color: theme.accent }}
                                  >
                                    {item}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* Inline pending request */}
                {req && reward && (
                  <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${theme.accentSoft}` }}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-lg">{reward.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-bold text-gray-900 truncate">Wants {reward.name}</div>
                        <div className="text-[11px] text-gray-400">
                          Costs {reward.costPoints} ⭐ ·{" "}
                          <span className="text-green-600 font-semibold">Has {kid.pointsBalance} ⭐</span>{" "}
                          · {agoMin < 1 ? "just now" : `${agoMin} min ago`}
                        </div>
                      </div>
                    </div>
                    <RequestActions requestId={req.id} />
                  </div>
                )}

                {/* Pending completions awaiting parent approval */}
                {pendingCompletions.filter((c) => c.kidId === kid.id).map((comp) => {
                  const ago = Math.round(
                    (Date.now() - new Date(comp.completedAt).getTime()) / 60_000,
                  );
                  return (
                    <div
                      key={comp.id}
                      className="mt-3 rounded-xl p-3"
                      style={{ background: "#fffbeb", border: "1px solid #fde68a" }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="text-2xl">{comp.taskIcon}</div>
                        <div className="flex-1">
                          <div className="text-sm font-bold">{comp.taskName}</div>
                          <div className="text-xs text-gray-500">
                            {ago < 2 ? "just now" : `${ago} min ago`}
                            {comp.pointsAwarded > 0 ? ` · +${comp.pointsAwarded} ⭐` : ""}
                            {comp.cashAwardedCents > 0
                              ? ` · +$${(comp.cashAwardedCents / 100).toFixed(2)}`
                              : ""}
                          </div>
                        </div>
                      </div>
                      <CompletionActions completionId={comp.id} />
                    </div>
                  );
                })}

                {/* History link */}
                <div className="mt-3 pt-3 flex items-center" style={{ borderTop: `1px solid ${theme.accentSoft}` }}>
                  <Link
                    href={`/parent/history/${kid.id}`}
                    className="text-[12px] font-bold"
                    style={{ color: theme.accent }}
                  >
                    View history →
                  </Link>
                  <Link
                    href={`/parent/history/${kid.id}?tab=cash`}
                    className="text-[12px] font-bold ml-4"
                    style={{ color: theme.accent }}
                  >
                    Cash history →
                  </Link>
                  <CashTransactionButton kids={kids} defaultKidId={kid.id} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

function HeadsUpRow({ kid, task }: { kid: { avatar: string; name: string; themeId: string }; task: Task }) {
  const theme = getTheme(kid.themeId as Parameters<typeof getTheme>[0]);
  return (
    <div className="flex items-start gap-2.5">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 mt-0.5"
        style={{ background: theme.accentSoft }}
      >
        {kid.avatar}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-gray-900">
          {kid.name} — {task.name}
        </div>
        {(task.location || task.startTime) && (
          <div className="text-[11px] text-gray-400 mt-0.5">
            {task.location && `📍 ${task.location}`}
            {task.location && task.startTime && " · "}
            {task.startTime && task.startTime}
          </div>
        )}
        {task.packingList && task.packingList.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {task.packingList.map((item, i) => (
              <span
                key={i}
                className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                style={{ background: theme.accentSoft, color: theme.accent }}
              >
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
