"use client";

import { useState } from "react";
import type { HistoryEntry, CashTransaction } from "@/lib/domain/types";

type Theme = { accentSoft: string; accent: string };

function formatRowDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y.slice(2)}`;
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
  if (entries.length === 0) {
    return (
      <div className="text-center text-sm text-gray-400 py-16">
        No activity in the last {emptyDaysLabel} days.
      </div>
    );
  }

  // Compute running balance: entries are newest-first
  let running = currentStars ?? null;
  const rows = entries.map((entry) => {
    const balance = running;
    if (running !== null) {
      running = entry.kind === "task"
        ? running - entry.pointsAwarded
        : running + entry.pointsSpent;
    }
    return { entry, balance };
  });

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
      {rows.map(({ entry, balance }, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-3 py-2.5"
          style={{
            borderBottom: i < rows.length - 1 ? "1px solid #f3f4f6" : undefined,
            background: entry.kind === "reward" ? "#fffbeb" : undefined,
          }}
        >
          <span className="text-[11px] text-gray-400 font-mono w-12 flex-shrink-0">
            {formatRowDate(entry.date)}
          </span>
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-base flex-shrink-0"
            style={{ background: entry.kind === "reward" ? "#fef3c7" : theme.accentSoft }}
          >
            {entry.kind === "task" ? entry.taskIcon : entry.rewardIcon}
          </div>
          <div className="flex-1 min-w-0 text-[12px] font-bold text-gray-800 truncate">
            {entry.kind === "task" ? entry.taskName : entry.rewardName}
          </div>
          <div
            className="text-[12px] font-black flex-shrink-0 w-14 text-right"
            style={{ color: entry.kind === "task" ? "#16a34a" : "#ef4444" }}
          >
            {entry.kind === "task" ? `+${entry.pointsAwarded}` : `−${entry.pointsSpent}`} ⭐
          </div>
          {balance !== null && (
            <div className="text-[11px] text-gray-400 font-semibold flex-shrink-0 w-14 text-right">
              {balance.toLocaleString()} ⭐
            </div>
          )}
        </div>
      ))}
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
  if (txns.length === 0) {
    return (
      <div className="text-center text-sm text-gray-400 py-16">
        No cash activity in the last {emptyDaysLabel} days.
      </div>
    );
  }

  let running = currentCash ?? null;
  const rows = txns.map((txn) => {
    const balance = running;
    if (running !== null) running -= txn.amountCents;
    return { txn, balance };
  });

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
      {rows.map(({ txn, balance }, i) => (
        <div
          key={txn.id}
          className="flex items-center gap-2 px-3 py-2.5"
          style={{ borderBottom: i < rows.length - 1 ? "1px solid #f3f4f6" : undefined }}
        >
          <span className="text-[11px] text-gray-400 font-mono w-12 flex-shrink-0">
            {formatRowDate(txn.createdAt.slice(0, 10))}
          </span>
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-base flex-shrink-0"
            style={{ background: txn.type === "credit" ? "#dcfce7" : "#fee2e2" }}
          >
            {txn.type === "credit" ? "💵" : "🛒"}
          </div>
          <div className="flex-1 min-w-0 text-[12px] font-bold text-gray-800 truncate">
            {txn.description}
          </div>
          <div
            className="text-[12px] font-black flex-shrink-0 w-16 text-right"
            style={{ color: txn.type === "credit" ? "#16a34a" : "#ef4444" }}
          >
            {txn.type === "credit" ? "+" : "−"}${(Math.abs(txn.amountCents) / 100).toFixed(2)}
          </div>
          {balance !== null && (
            <div className="text-[11px] text-gray-400 font-semibold flex-shrink-0 w-14 text-right">
              ${(balance / 100).toFixed(2)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
