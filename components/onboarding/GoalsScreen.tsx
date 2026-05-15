// components/onboarding/GoalsScreen.tsx
"use client";

import { useState } from "react";

export interface GoalsOption {
  key: string;
  emoji: string;
  label: string;
}

interface GoalsScreenProps {
  variant: "parent" | "kid";
  familyName?: string;
  kidName?: string;
  kidAvatar?: string;
  options: GoalsOption[];
  onContinue: (selected: string[], otherText: string) => void;
  onSkip?: () => void;
}

export function GoalsScreen({
  variant,
  familyName,
  kidName,
  kidAvatar,
  options,
  onContinue,
  onSkip,
}: GoalsScreenProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [otherText, setOtherText] = useState("");

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const heading =
    variant === "parent"
      ? `What do you want for your family, ${familyName}?`
      : `Hey ${kidName}! What are you here for? 🤩`;

  const subtext =
    variant === "parent" ? "Pick everything that applies." : "Pick everything you love!";

  const ctaLabel = variant === "parent" ? "Continue →" : "Next →";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
        {variant === "kid" && kidAvatar && (
          <div className="text-5xl text-center mb-2">{kidAvatar}</div>
        )}
        <h2 className="text-base font-bold text-slate-800 text-center mb-1">
          {heading}
        </h2>
        <p className="text-xs text-slate-500 text-center mb-4">{subtext}</p>

        <div className="flex flex-col gap-2 mb-4">
          {options.map((opt) => {
            const isSelected = selected.has(opt.key);
            return (
              <button
                key={opt.key}
                onClick={() => toggle(opt.key)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition-colors ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className="text-xl">{opt.emoji}</span>
                <span className="text-sm font-medium text-slate-700">
                  {opt.label}
                </span>
                {isSelected && (
                  <span className="ml-auto text-indigo-500 text-sm">✓</span>
                )}
              </button>
            );
          })}
        </div>

        {selected.has("other") && (
          <input
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Tell us more..."
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        )}

        <button
          onClick={() => onContinue(Array.from(selected), selected.has("other") ? otherText : "")}
          className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 rounded-xl text-sm transition-colors"
        >
          {ctaLabel}
        </button>

        {onSkip && (
          <button
            onClick={onSkip}
            className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600 py-1"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
