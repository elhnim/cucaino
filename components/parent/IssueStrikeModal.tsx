"use client";

import { useState, useTransition } from "react";
import { issueStrike } from "@/lib/actions/strikes";
import type { Kid } from "@/lib/domain/types";

export default function IssueStrikeModal({
  kid,
  onClose,
}: {
  kid: Kid;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [penaltyStars, setPenaltyStars] = useState(0);
  const [penaltyCash, setPenaltyCash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!reason.trim()) { setError("Please describe the behaviour."); return; }
    setError(null);
    startTransition(async () => {
      const result = await issueStrike({
        kidId: kid.id,
        reason,
        penaltyStars,
        penaltyCashCents: Math.round((parseFloat(penaltyCash) || 0) * 100),
      });
      if (result.ok) onClose();
      else setError(result.error);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm shadow-2xl">
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-gray-900">Issue a strike</h2>
            <p className="text-xs text-gray-400 mt-0.5">{kid.avatar} {kid.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 text-2xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-bold rounded-xl px-3 py-2">{error}</div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-500 block mb-2">What happened?</label>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {[
                "Refused to do tasks",
                "Rude or disrespectful",
                "Being unkind",
                "Didn't follow instructions",
                "Broke a rule",
                "Lied or was dishonest",
                "Hurt someone's feelings",
                "Left out or excluded someone",
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                    reason === preset
                      ? "bg-red-500 text-white border-red-500"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:border-red-300 hover:text-red-600"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              placeholder="Or describe what happened…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:border-red-400 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">⭐ Deduct stars</label>
              <input
                type="number"
                min={0}
                value={penaltyStars}
                onChange={(e) => setPenaltyStars(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full border border-gray-200 rounded-xl p-2.5 text-sm text-center font-bold focus:outline-none focus:border-red-400"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">💵 Deduct cash ($)</label>
              <input
                type="number"
                min={0}
                step={0.50}
                value={penaltyCash}
                placeholder="0.00"
                onChange={(e) => setPenaltyCash(e.target.value)}
                className="w-full border border-gray-200 rounded-xl p-2.5 text-sm text-center font-bold focus:outline-none focus:border-red-400"
              />
            </div>
          </div>

          <p className="text-[11px] text-gray-400 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            ⚠️ At 3 active strikes, {kid.name} won&apos;t be able to claim rewards until you clear them.
          </p>
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-600">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={isPending}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white disabled:opacity-50">
            {isPending ? "Issuing…" : "Issue strike ⚡"}
          </button>
        </div>
      </div>
    </div>
  );
}
