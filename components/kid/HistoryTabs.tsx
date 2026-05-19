"use client";

import { useState } from "react";
import type { HistoryEntry, CashTransaction } from "@/lib/domain/types";

type Theme = { accentSoft: string; accent: string };

function groupByDate<T>(
  items: T[],
  getDate: (item: T) => string,
): { date: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const d = getDate(item);
    const group = map.get(d) ?? [];
    group.push(item);
    map.set(d, group);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }));
}

function formatDate(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (dateStr === today) return "Today";
  if (dateStr === yesterday) return "Yesterday";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}

export default function HistoryTabs({
  entries,
  cashTxns,
  theme,
  initialTab = "stars",
  emptyDaysLabel,
  currentStars,
  currentCash,
}: {
  entries: HistoryEntry[];
  cashTxns: CashTransaction[];
  theme: Theme;
  initialTab?: "stars" | "cash";
  emptyDaysLabel: string;
  currentStars?: number;
  currentCash?: number;
}) {
  const [tab, setTab] = useState<"stars" | "cash">(initialTab);

  return (
    <>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("stars")}
          className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${
            tab === "stars"
              ? "border-amber-400 text-amber-700"
              : "bg-gray-100 text-gray-500 border-gray-200"
          }`}
          style={tab === "stars" ? { background: "#fef3c7" } : undefined}
        >
          ⭐ Stars
        </button>
        <button
          type="button"
          onClick={() => setTab("cash")}
          className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${
            tab === "cash"
              ? "border-green-400 text-green-700"
              : "bg-gray-100 text-gray-500 border-gray-200"
          }`}
          style={tab === "cash" ? { background: "#dcfce7" } : undefined}
        >
          💵 Cash
        </button>
      </div>

      {tab === "stars" ? (
        <StarsTab
          entries={entries}
          theme={theme}
          emptyDaysLabel={emptyDaysLabel}
          currentStars={currentStars}
        />
      ) : (
        <CashTab
          txns={cashTxns}
          emptyDaysLabel={emptyDaysLabel}
          currentCash={currentCash}
        />
      )}
    </>
  );
}

function StarsTab({
  entries,
  theme,
  emptyDaysLabel,
  currentStars,
}: {
  entries: HistoryEntry[];
  theme: Theme;
  emptyDaysLabel: string;
  currentStars?: number;
}) {
  // Compute running balance for bank-statement style display.
  // entries are newest-first. Walk from newest to oldest, carrying currentStars
  // down as we go — each row shows the balance AFTER that transaction.
  const withBalance: { entry: HistoryEntry; balance: number | null }[] = [];

  if (currentStars !== undefined) {
    let running = currentStars;
    for (const entry of entries) {
      withBalance.push({ entry, balance: running });
      // undo this entry to get balance before it
      if (entry.kind === "task") running -= entry.pointsAwarded;
      else running += entry.pointsSpent;
    }
  } else {
    for (const entry of entries) {
      withBalance.push({ entry, balance: null });
    }
  }

  const groups = groupByDate(withBalance, (item) => item.entry.date);

  if (groups.length === 0) {
    return (
      <div className="text-center text-sm text-gray-400 py-16">
        No activity in the last {emptyDaysLabel} days.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(({ date, items: dayItems }) => {
        const net = dayItems.reduce((sum, { entry }) =>
          entry.kind === "task" ? sum + entry.pointsAwarded : sum - entry.pointsSpent, 0);
        return (
          <div key={date}>
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
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {dayItems.map(({ entry, balance }, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{
                    borderBottom: i < dayItems.length - 1 ? "1px solid #f3f4f6" : undefined,
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
                    {balance !== null && (
                      <div className="text-[10px] text-gray-400">
                        Balance: {balance.toLocaleString()} ⭐
                      </div>
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
      })}
    </div>
  );
}

function CashTab({
  txns,
  emptyDaysLabel,
  currentCash,
}: {
  txns: CashTransaction[];
  emptyDaysLabel: string;
  currentCash?: number;
}) {
  // Bank-statement style: show running balance after each transaction.
  // txns are newest-first. Carry currentCash down, undoing each txn to get prior balance.
  const withBalance: { txn: CashTransaction; balance: number | null }[] = [];

  if (currentCash !== undefined) {
    let running = currentCash;
    for (const txn of txns) {
      withBalance.push({ txn, balance: running });
      running -= txn.amountCents;
    }
  } else {
    for (const txn of txns) {
      withBalance.push({ txn, balance: null });
    }
  }

  const groups = groupByDate(withBalance, (item) => item.txn.createdAt.slice(0, 10));

  if (groups.length === 0) {
    return (
      <div className="text-center text-sm text-gray-400 py-16">
        No cash activity in the last {emptyDaysLabel} days.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map(({ date, items: dayItems }) => {
        const net = dayItems.reduce((sum, { txn }) => sum + txn.amountCents, 0);
        return (
          <div key={date}>
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                {formatDate(date)}
              </span>
              <span
                className="text-[11px] font-bold"
                style={{ color: net >= 0 ? "#16a34a" : "#ef4444" }}
              >
                {net >= 0 ? "+" : "−"}${(Math.abs(net) / 100).toFixed(2)}
              </span>
            </div>
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {dayItems.map(({ txn, balance }, i) => (
                <div
                  key={txn.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{
                    borderBottom: i < dayItems.length - 1 ? "1px solid #f3f4f6" : undefined,
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{
                      background: txn.type === "credit" ? "#dcfce7" : "#fee2e2",
                    }}
                  >
                    {txn.type === "credit" ? "💵" : "🛒"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-gray-900 truncate">
                      {txn.description}
                    </div>
                    {balance !== null && (
                      <div className="text-[10px] text-gray-400">
                        Balance: ${(balance / 100).toFixed(2)}
                      </div>
                    )}
                  </div>
                  <div
                    className="text-[13px] font-black flex-shrink-0"
                    style={{ color: txn.type === "credit" ? "#16a34a" : "#ef4444" }}
                  >
                    {txn.type === "credit" ? "+" : "−"}${(Math.abs(txn.amountCents) / 100).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
