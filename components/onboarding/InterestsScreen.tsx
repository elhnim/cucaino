"use client";

import { useState } from "react";

export interface InterestOption {
  key: string;
  emoji: string;
  label: string;
  tag: "task" | "reward" | "both";
}

export const KID_INTEREST_OPTIONS: InterestOption[] = [
  { key: "sports", emoji: "⚽", label: "Sports & fitness", tag: "task" },
  { key: "music", emoji: "🎵", label: "Music", tag: "task" },
  { key: "art", emoji: "🎨", label: "Art & crafts", tag: "task" },
  { key: "reading", emoji: "📚", label: "Reading & books", tag: "task" },
  { key: "gaming", emoji: "🎮", label: "Video games", tag: "both" },
  { key: "cooking", emoji: "🍳", label: "Cooking & baking", tag: "task" },
  { key: "outdoors", emoji: "🌿", label: "Outdoors & nature", tag: "task" },
  { key: "tech", emoji: "💻", label: "Technology & coding", tag: "task" },
  { key: "animals", emoji: "🐾", label: "Animals & pets", tag: "task" },
  { key: "drama", emoji: "🎭", label: "Drama & performance", tag: "task" },
  { key: "treats", emoji: "🍦", label: "Treats & sweets", tag: "reward" },
  { key: "screen_time", emoji: "📱", label: "Screen time & devices", tag: "reward" },
  { key: "movies", emoji: "🎬", label: "Movies & TV shows", tag: "reward" },
  { key: "shopping", emoji: "🛍️", label: "Shopping & new stuff", tag: "reward" },
  { key: "days_out", emoji: "🎡", label: "Days out & adventures", tag: "reward" },
  { key: "other", emoji: "✏️", label: "Something else", tag: "both" },
];

interface InterestsScreenProps {
  kidName: string;
  kidAvatar: string;
  onContinue: (selected: string[], otherText: string) => void;
  onSkip: () => void;
}

export function InterestsScreen({
  kidName,
  kidAvatar,
  onContinue,
  onSkip,
}: InterestsScreenProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [otherText, setOtherText] = useState("");

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
        <div className="text-5xl text-center mb-2">{kidAvatar}</div>
        <h2 className="text-base font-bold text-slate-800 text-center mb-1">
          What are you into? 🤩
        </h2>
        <p className="text-xs text-slate-500 text-center mb-4">
          Pick everything you love!
        </p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {KID_INTEREST_OPTIONS.map((opt) => {
            const isSelected = selected.has(opt.key);
            return (
              <button
                key={opt.key}
                onClick={() => toggle(opt.key)}
                className={`flex flex-col items-center gap-1 px-2 py-3 rounded-xl border-2 transition-colors ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <span className="text-2xl">{opt.emoji}</span>
                <span className="text-xs font-medium text-slate-700 text-center leading-tight">
                  {opt.label}
                </span>
                {isSelected && (
                  <span className="text-indigo-500 text-xs">✓</span>
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
          Next →
        </button>
        <button
          onClick={onSkip}
          className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600 py-1"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
