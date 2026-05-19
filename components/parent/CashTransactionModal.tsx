"use client";

import { useState, useTransition } from "react";
import { logCashTransaction } from "@/lib/actions/cash";
import type { Kid } from "@/lib/domain/types";

export default function CashTransactionModal({
  kids,
  defaultKidId,
  onClose,
}: {
  kids: Kid[];
  defaultKidId?: string;
  onClose: () => void;
}) {
  const [kidId, setKidId] = useState(defaultKidId ?? kids[0]?.id ?? "");
  const [type, setType] = useState<"credit" | "debit">("credit");
  const [amountStr, setAmountStr] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    const cents = Math.round(parseFloat(amountStr || "0") * 100);
    if (!kidId) { setError("Select a kid."); return; }
    if (cents <= 0) { setError("Amount must be greater than $0.00."); return; }
    if (!description.trim()) { setError("Description is required."); return; }
    setError(null);
    startTransition(async () => {
      const result = await logCashTransaction(kidId, cents, description.trim(), type);
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  };

  const kid = kids.find((k) => k.id === kidId);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-sm shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-lg font-black">💵 Cash transaction</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-bold rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          {kids.length > 1 && (
            <div>
              <label className="text-xs font-bold text-gray-500">Kid</label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {kids.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKidId(k.id)}
                    className={`py-1.5 px-3 rounded-xl text-sm font-bold border transition-colors ${
                      kidId === k.id
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-gray-100 text-gray-500 border-gray-200"
                    }`}
                  >
                    {k.avatar} {k.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-500">Type</label>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => setType("credit")}
                className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${
                  type === "credit"
                    ? "bg-green-600 text-white border-green-600"
                    : "bg-gray-100 text-gray-500 border-gray-200"
                }`}
              >
                ➕ Add money
              </button>
              <button
                type="button"
                onClick={() => setType("debit")}
                className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${
                  type === "debit"
                    ? "bg-red-500 text-white border-red-500"
                    : "bg-gray-100 text-gray-500 border-gray-200"
                }`}
              >
                🛒 Record spend
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500">Amount ($)</label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              placeholder="0.00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500">Description</label>
            <input
              type="text"
              placeholder={type === "credit" ? "Pocket money top-up" : "Kmart toy"}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full mt-1 border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>

          {kid && (
            <div className="text-xs text-gray-400">
              {kid.name} currently has{" "}
              <span className="font-bold text-green-700">
                ${(kid.cashBalance / 100).toFixed(2)}
              </span>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
