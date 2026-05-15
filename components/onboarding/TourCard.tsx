// components/onboarding/TourCard.tsx
"use client";

import { useTour } from "./TourContext";

export function TourCard() {
  const { active, currentStep, totalSteps, currentStepData, next, skip } =
    useTour();

  if (!active || !currentStepData) return null;

  const isLast = currentStep === totalSteps - 1;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40 pointer-events-none" />

      {/* Card */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md z-50 bg-white rounded-2xl shadow-2xl p-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Step {currentStep + 1} of {totalSteps}
          </span>
          <button
            onClick={skip}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Skip tour ×
          </button>
        </div>

        <p className="text-sm font-bold text-slate-800 mb-1">
          {currentStepData.label}
        </p>
        <p className="text-xs text-slate-500 mb-3">
          {currentStepData.description}
        </p>

        <div className="flex justify-end">
          <button
            onClick={next}
            className="bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {isLast ? "Done ✓" : "Next →"}
          </button>
        </div>
      </div>
    </>
  );
}
