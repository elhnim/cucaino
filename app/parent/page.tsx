import Link from "next/link";
import { redirect } from "next/navigation";
import ParentShell from "@/components/parent/ParentShell";
import {
  getFamily,
  listKids,
  listPendingRequests,
  listRewardsForKid,
  listTasksForKid,
  listCompletionsToday,
} from "@/lib/data/stub";
import { isoWeekday, tasksForDay } from "@/lib/domain/schedule";

export default async function ParentOverviewPage() {
  const [family, kids, pending] = await Promise.all([
    getFamily(),
    listKids(),
    listPendingRequests(),
  ]);
  if (!family) redirect("/login");

  const dow = isoWeekday();

  // Build today's progress per kid
  const kidProgress = await Promise.all(
    kids.map(async (kid) => {
      const [tasks, completions, rewards] = await Promise.all([
        listTasksForKid(kid.id),
        listCompletionsToday(kid.id),
        listRewardsForKid(kid.id),
      ]);
      const todays = tasksForDay(tasks, dow).filter((t) => t.requiresCompletion);
      const done = completions.length;
      const total = todays.length;
      return { kid, done, total, rewardsCount: rewards.length };
    }),
  );

  return (
    <ParentShell
      active="overview"
      title="Family overview"
      subtitle={new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      })}
      pendingCount={pending.length}
    >
      <div className="p-4 space-y-4">
        {/* Today progress per kid */}
        <section className="bg-white rounded-2xl shadow p-4">
          <h2 className="text-sm font-bold text-gray-700 mb-3">Today&apos;s progress</h2>
          <div className="space-y-2">
            {kidProgress.map(({ kid, done, total }) => (
              <div key={kid.id} className="flex items-center gap-3 text-sm">
                <span className="text-2xl">{kid.avatar}</span>
                <span className="font-bold flex-1">{kid.name}</span>
                <span
                  className={`font-bold ${
                    done === total
                      ? "text-green-600"
                      : done > 0
                        ? "text-amber-600"
                        : "text-gray-400"
                  }`}
                >
                  {done}/{total}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Family goal */}
        <section className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
          <div className="text-sm font-bold text-purple-900 mb-1">
            🎬 Family goal: Movie night
          </div>
          <div className="bg-white rounded-full h-3 overflow-hidden">
            <div
              className="bg-purple-500 h-full"
              style={{
                width: `${Math.min(100, (family.familyPointsBalance / 400) * 100)}%`,
              }}
            />
          </div>
          <div className="text-xs text-purple-700 mt-1 font-bold">
            {family.familyPointsBalance} / 400
          </div>
        </section>

        {/* Pending requests */}
        {pending.length > 0 ? (
          <section className="bg-amber-50 border border-amber-300 rounded-2xl p-4">
            <div className="text-sm font-bold text-amber-900">
              ⚠️ {pending.length} reward request{pending.length > 1 ? "s" : ""} pending
            </div>
            <Link
              href="/parent/requests"
              className="mt-3 block w-full bg-amber-500 hover:bg-amber-600 text-white text-center font-bold py-2 rounded-lg text-sm"
            >
              Review →
            </Link>
          </section>
        ) : null}

        {/* Quick actions */}
        <section className="grid grid-cols-2 gap-2">
          <Link
            href="/parent/tasks"
            className="bg-white shadow rounded-xl p-3 text-sm font-bold text-center"
          >
            📋 Tasks
          </Link>
          <Link
            href="/parent/rewards"
            className="bg-white shadow rounded-xl p-3 text-sm font-bold text-center"
          >
            🎁 Rewards
          </Link>
          <Link
            href="/parent/quizzes"
            className="bg-white shadow rounded-xl p-3 text-sm font-bold text-center"
          >
            🎮 Quiz banks
          </Link>
          <Link
            href="/parent/kids"
            className="bg-white shadow rounded-xl p-3 text-sm font-bold text-center"
          >
            👶 Kids
          </Link>
          <Link
            href="/parent/feedback"
            className="col-span-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow rounded-xl p-3 text-sm font-bold text-center"
          >
            💡 Feature ideas
          </Link>
        </section>
      </div>
    </ParentShell>
  );
}
