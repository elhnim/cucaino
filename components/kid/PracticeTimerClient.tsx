"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PracticeTimer from "@/components/kid/PracticeTimer";
import { completeTask } from "@/lib/actions/completions";

export default function PracticeTimerClient({
  taskId,
  kidId,
  points,
  familyPoints,
  category,
  durationMinutes,
  accent,
  storageKey,
  backHref,
  cashValueCents,
  requiresParentApproval,
}: {
  taskId: string;
  kidId: string;
  points: number;
  familyPoints: number;
  category?: string;
  durationMinutes: number;
  accent: string;
  storageKey: string;
  backHref: string;
  cashValueCents: number;
  requiresParentApproval: boolean;
}) {
  const router = useRouter();
  const [completed, setCompleted] = useState(false);

  const handleComplete = async () => {
    setCompleted(true);
    window.dispatchEvent(new CustomEvent("task-completed", { detail: { points } }));
    await completeTask(taskId, kidId, points, familyPoints, category, 1, cashValueCents, requiresParentApproval);
  };

  if (completed) {
    return (
      <div className="bg-white rounded-3xl shadow-xl p-6 flex flex-col items-center gap-4 text-center">
        <div className="text-6xl">🎉</div>
        <div className="font-black text-2xl text-gray-800">All done!</div>
        <div className="text-sm text-gray-500">+{points} ⭐ earned</div>
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="mt-2 text-white font-bold px-8 py-3 rounded-xl text-lg"
          style={{ background: accent }}
        >
          ← Back to schedule
        </button>
      </div>
    );
  }

  return (
    <PracticeTimer
      durationMinutes={durationMinutes}
      accent={accent}
      storageKey={storageKey}
      onComplete={handleComplete}
    />
  );
}
