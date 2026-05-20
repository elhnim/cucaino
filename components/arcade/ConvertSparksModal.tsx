"use client";

import { useState, useTransition } from "react";
import { convertStarsToSparks } from "@/lib/actions/arcade";

interface ConvertSparksModalProps {
  kidId: string;
  starBalance: number;
  sparksBalance: number;
  onClose: () => void;
}

export default function ConvertSparksModal({
  kidId,
  starBalance,
  sparksBalance,
  onClose,
}: ConvertSparksModalProps) {
  const [stars, setStars] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sparksPreview = stars * 5;

  function handleConvert() {
    setError(null);
    startTransition(async () => {
      const result = await convertStarsToSparks(kidId, stars);
      if (result.ok) {
        const newSparks = sparksBalance + sparksPreview;
        setSuccessMessage(`✅ Done! You now have ${newSparks} ⚡ Sparks`);
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl p-6 shadow-xl">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

        <h2 className="text-xl font-black text-gray-900 mb-4">⚡ Get Sparks</h2>

        <p className="text-sm text-gray-600 mb-4">
          You have <span className="font-bold text-amber-600">⭐ {starBalance} stars</span>
        </p>

        {successMessage ? (
          <div className="text-center py-4 text-lg font-bold text-green-700">
            {successMessage}
          </div>
        ) : (
          <>
            <div className="mb-3">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Stars to convert
              </label>
              <input
                type="number"
                min={1}
                max={starBalance}
                value={stars}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) setStars(Math.max(1, Math.min(val, starBalance)));
                }}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-2 text-lg font-bold text-center focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="text-center text-sm font-bold text-cyan-700 mb-3">
              = {sparksPreview} ⚡ Sparks
            </div>

            <div className="text-xs text-gray-400 mb-4 text-center">
              ⚡ Sparks can only be used in the AI Arcade
            </div>

            {error && (
              <div className="text-sm text-red-600 font-semibold mb-3 text-center">
                {error}
              </div>
            )}

            <button
              onClick={handleConvert}
              disabled={isPending || stars < 1 || stars > starBalance}
              className="w-full bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-lg py-3 rounded-2xl active:scale-95 transition-transform"
            >
              {isPending ? "Converting…" : "Convert"}
            </button>
          </>
        )}
      </div>
    </>
  );
}
