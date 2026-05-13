import { notFound } from "next/navigation";
import { getKid, listKidHistory } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";
import type { HistoryEntry } from "@/lib/domain/types";

function groupByDate(entries: HistoryEntry[]): { date: string; entries: HistoryEntry[] }[] {
  const map = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const group = map.get(e.date) ?? [];
    group.push(e);
    map.set(e.date, group);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, entries]) => ({ date, entries }));
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

function netStars(entries: HistoryEntry[]): number {
  return entries.reduce((sum, e) => {
    if (e.kind === "task") return sum + e.pointsAwarded;
    return sum - e.pointsSpent;
  }, 0);
}

export default async function KidHistoryPage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const [kid, entries] = await Promise.all([
    getKid(kidId),
    listKidHistory(kidId, 14),
  ]);
  if (!kid) notFound();

  const theme = getTheme(kid.themeId);
  const groups = groupByDate(entries);

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-black">📋 My History</h2>

      {groups.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-16">
          No activity in the last 14 days.
        </div>
      ) : (
        groups.map(({ date, entries: dayEntries }) => {
          const net = netStars(dayEntries);
          return (
            <div key={date}>
              {/* Day header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  {formatDate(date)}
                </span>
                <span
                  className="text-[11px] font-bold"
                  style={{ color: net >= 0 ? "#16a34a" : "#ef4444" }}
                >
                  {net >= 0 ? "+" : ""}{net} ⭐
                </span>
              </div>

              {/* Rows */}
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                {dayEntries.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{
                      borderBottom: i < dayEntries.length - 1 ? "1px solid #f3f4f6" : undefined,
                      background: entry.kind === "reward" ? "#fffbeb" : undefined,
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{
                        background: entry.kind === "reward" ? "#fef3c7" : theme.accentSoft,
                      }}
                    >
                      {entry.kind === "task" ? entry.taskIcon : entry.rewardIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-gray-900 truncate">
                        {entry.kind === "task" ? entry.taskName : entry.rewardName}
                      </div>
                      {entry.kind === "reward" && (
                        <div className="text-[10px] text-gray-400">Reward claimed</div>
                      )}
                    </div>
                    <div
                      className="text-[13px] font-black flex-shrink-0"
                      style={{ color: entry.kind === "task" ? "#16a34a" : "#ef4444" }}
                    >
                      {entry.kind === "task" ? `+${entry.pointsAwarded}` : `−${entry.pointsSpent}`} ⭐
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
