"use client";

import { useState, useTransition } from "react";
import { depositToTrading, withdrawFromTrading } from "@/lib/actions/trading";
import { NUGGETS_PER_STAR } from "@/lib/trading/assets";

interface Props {
  mode: "deposit" | "withdraw";
  availableStars: number;
  availableNuggets: number;
  kidId: string;
  onClose: () => void;
}

export default function DepositWithdrawModal({
  mode,
  availableStars,
  availableNuggets,
  kidId,
  onClose,
}: Props) {
  const [amount, setAmount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDeposit = mode === "deposit";
  const maxAmount = isDeposit
    ? availableStars
    : Math.floor(availableNuggets / NUGGETS_PER_STAR);

  const nuggetEquivalent = amount * NUGGETS_PER_STAR;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = isDeposit
        ? await depositToTrading(kidId, amount)
        : await withdrawFromTrading(kidId, amount);
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Bottom sheet card */}
      <div className="relative z-10 w-full max-w-lg bg-white rounded-t-3xl px-6 pt-6 pb-10 shadow-xl animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-gray-900">
            {isDeposit ? "Deposit Stars" : "Withdraw Stars"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Amount input */}
        <div className="mb-4">
          <label className="block text-sm font-bold text-gray-700 mb-1">
            {isDeposit ? "Stars to deposit" : "Stars to withdraw"}
          </label>
          <input
            type="number"
            min={1}
            max={maxAmount}
            step={1}
            value={amount}
            onChange={(e) => {
              const val = Math.floor(Number(e.target.value));
              setAmount(Math.max(1, Math.min(maxAmount, val)));
            }}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          <p className="mt-2 text-sm text-gray-500">
            {isDeposit
              ? `Max: ⭐ ${availableStars} stars available`
              : `Max: ${maxAmount} stars (🪙 ${availableNuggets.toLocaleString()} available)`}
          </p>
        </div>

        {/* Equivalent */}
        <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-4">
          <p className="text-sm text-gray-600">
            {isDeposit ? "You'll receive:" : "Cost:"}
          </p>
          <p className="text-2xl font-black text-gray-900">
            🪙 {nuggetEquivalent.toLocaleString()} Nuggets
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {NUGGETS_PER_STAR.toLocaleString()} Nuggets per star
          </p>
        </div>

        {/* Deposit warning */}
        {isDeposit && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3 mb-4 flex gap-2 items-start">
            <span className="text-lg">⚠️</span>
            <p className="text-sm text-yellow-800 font-medium">
              Only invest stars you&apos;re okay risking — you could lose them!
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4">
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={isPending || amount < 1 || amount > maxAmount}
          className={`w-full py-4 rounded-2xl font-black text-white text-lg transition-opacity ${
            isDeposit
              ? "bg-green-600 hover:bg-green-700"
              : "bg-blue-600 hover:bg-blue-700"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isPending
            ? "Processing…"
            : isDeposit
            ? `Deposit ⭐ ${amount} stars`
            : `Withdraw ⭐ ${amount} stars`}
        </button>
      </div>
    </div>
  );
}
