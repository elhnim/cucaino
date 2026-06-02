"use client";

import type { InvestLicence } from "@/lib/domain/types";
import { REQUIRED_LESSON_IDS } from "@/lib/invest/learn";

export default function InvestBuyLockedCard({ licence, onGoLearn }: { licence: InvestLicence; onGoLearn: () => void }) {
  const done = REQUIRED_LESSON_IDS.filter((id) => licence.lessonsCompleted.includes(id)).length;
  return (
    <div className="rounded-[14px] border border-indigo-100 bg-indigo-50 p-4">
      <div className="text-3xl">🔒</div>
      <h3 className="mt-2 text-lg font-black text-indigo-950">Earn your Investor Licence</h3>
      <p className="mt-1 text-sm font-semibold text-indigo-700">{done}/4 basics complete. Buying unlocks after the quiz.</p>
      <button onClick={onGoLearn} className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white">Continue my licence →</button>
    </div>
  );
}
