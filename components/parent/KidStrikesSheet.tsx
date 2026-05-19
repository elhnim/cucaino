"use client";

import { useState, useTransition } from "react";
import { clearStrike } from "@/lib/actions/strikes";
import type { Strike, Kid } from "@/lib/domain/types";

export default function KidStrikesSheet({
  kid,
  strikes,
  onClose,
}: {
  kid: Kid;
  strikes: Strike[];
  onClose: () => void;
}) {
  const activeStrikes = strikes.filter((s) => !s.clearedAt);
  const clearedStrikes = strikes.filter((s) => s.clearedAt);
  const [isPending, startTransition] = useTransition();
  const [clearingId, setClearingId] = useState<string | null>(null);

  const handleClear = (strikeId: string) => {
    setClearingId(strikeId);
    startTransition(async () => {
      await clearStrike(strikeId, kid.id);
      setClearingId(null);
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm shadow-2xl max-h-[85dvh] flex flex-col">
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-black text-gray-900">Strikes</h2>
            <p className="text-xs text-gray-400 mt-0.5">{kid.avatar} {kid.name} · {activeStrikes.length} active</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 text-2xl leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {activeStrikes.length === 0 && clearedStrikes.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No strikes on record.</p>
          )}

          {activeStrikes.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-black uppercase tracking-widest text-gray-400">Active</div>
              {activeStrikes.map((s) => (
                <div key={s.id} className="bg-red-50 border border-red-100 rounded-2xl p-3 flex gap-3 items-start">
                  <span className="text-xl mt-0.5">⚡</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-900">{s.reason || "No reason given"}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {new Date(s.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                      {s.penaltyStars > 0 && ` · −${s.penaltyStars}⭐`}
                      {s.penaltyCashCents > 0 && ` · −$${(s.penaltyCashCents / 100).toFixed(2)}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isPending && clearingId === s.id}
                    onClick={() => handleClear(s.id)}
                    className="text-xs font-bold text-red-500 bg-white border border-red-200 rounded-xl px-3 py-1.5 flex-shrink-0 disabled:opacity-50"
                  >
                    {isPending && clearingId === s.id ? "…" : "Clear"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {clearedStrikes.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-black uppercase tracking-widest text-gray-400 mt-2">Cleared</div>
              {clearedStrikes.slice(0, 5).map((s) => (
                <div key={s.id} className="bg-gray-50 border border-gray-100 rounded-2xl p-3 flex gap-3 items-start opacity-60">
                  <span className="text-xl mt-0.5">✓</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-700">{s.reason || "No reason given"}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {new Date(s.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
