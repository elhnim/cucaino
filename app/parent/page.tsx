import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getFamily,
  listKids,
  listPendingRequests,
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

  const kidStats = await Promise.all(
    kids.map(async (kid) => {
      const [tasks, completions] = await Promise.all([
        listTasksForKid(kid.id),
        listCompletionsToday(kid.id),
      ]);
      const todayTasks = tasksForDay(tasks, dow).filter((t) => t.requiresCompletion);
      return { kid, done: completions.length, total: todayTasks.length };
    }),
  );

  const visibleRequests = pending.slice(0, 3);

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Pending Requests */}
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-gray-800">🔔 Pending Requests</span>
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">
              {pending.length}
            </span>
          </div>

          {pending.length === 0 ? (
            <p className="text-sm text-gray-400">✅ All clear! No pending requests.</p>
          ) : (
            <div className="space-y-3">
              {visibleRequests.map((req) => {
                const kid = kids.find((k) => k.id === req.kidId);
                return (
                  <div key={req.id} className="flex items-center gap-2">
                    <span className="text-xl">🎁</span>
                    <span className="text-sm flex-1">Reward request</span>
                    {kid && <span className="text-xl">{kid.avatar}</span>}
                    <button
                      type="button"
                      className="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-lg"
                    >
                      ✓ Approve
                    </button>
                    <button
                      type="button"
                      className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-lg"
                    >
                      ✗ Deny
                    </button>
                  </div>
                );
              })}
              <Link
                href="/parent/requests"
                className="block text-sm text-indigo-600 font-medium mt-1"
              >
                View all requests →
              </Link>
            </div>
          )}
        </div>

        {/* Right: Kids Today */}
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="font-bold text-gray-800 mb-3">👧 Kids Today</div>
          <div className="divide-y divide-gray-100">
            {kidStats.map(({ kid, done, total }) => {
              const pct = Math.round(total > 0 ? (done / total) * 100 : 0);
              return (
                <div key={kid.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-2xl">{kid.avatar}</span>
                    <span className="font-bold text-gray-800 flex-1">{kid.name}</span>
                    <span className="text-sm">⭐ {kid.pointsBalance}</span>
                    <span className="text-sm">🔥 {kid.currentStreak}d</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-20 shrink-0">
                      {done}/{total} tasks
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: "#f97316" }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
    </div>
  );
}
