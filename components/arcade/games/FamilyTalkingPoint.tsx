"use client";

import { useState, useCallback } from "react";
import { generateTalkingPoint } from "@/lib/actions/arcade";
import { recentAnswers, rememberAnswer } from "@/lib/arcade/variety";

type GameState = "idle" | "loading" | "result";

const CATEGORIES = [
  { label: "Funny", emoji: "😄", value: "funny" },
  { label: "Dreams", emoji: "🌈", value: "dreams" },
  { label: "Memories", emoji: "📸", value: "memories" },
  { label: "Big Ideas", emoji: "💡", value: "big-ideas" },
];

interface FamilyTalkingPointProps {
  kidId: string | null;
  sparksBalance: number;
}

export default function FamilyTalkingPoint({ kidId, sparksBalance }: FamilyTalkingPointProps) {
  const [gameState, setGameState] = useState<GameState>("idle");
  const [category, setCategory] = useState("funny");
  const [data, setData] = useState<{ question: string; followups: string[]; together: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePlay = useCallback(async () => {
    if (!kidId || sparksBalance < 1) return;
    setError(null);

    setGameState("loading");
    const result = await generateTalkingPoint(category, kidId, recentAnswers(`talking-point:${category}`));
    if (!result.ok) {
      setError("Something went wrong, try again");
      setGameState("idle");
      return;
    }

    rememberAnswer(`talking-point:${category}`, result.data.question);
    setData(result.data);
    setGameState("result");
  }, [kidId, sparksBalance, category]);

  const handlePlayAgain = useCallback(() => {
    setData(null);
    setError(null);
    setGameState("idle");
  }, []);

  if (gameState === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-5xl animate-bounce">💬</div>
        <p className="text-lg font-bold text-gray-600">Thinking of something to chat about...</p>
      </div>
    );
  }

  if (gameState === "result" && data) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-teal-50 border-2 border-teal-200 rounded-3xl p-6 mb-4 text-center">
          <p className="text-sm font-black uppercase tracking-wider text-teal-500 mb-2">Talking Point</p>
          <p className="text-2xl font-black text-teal-900 leading-snug">{data.question}</p>
        </div>

        {data.followups?.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <p className="text-sm font-bold text-gray-500 mb-3">Keep it going…</p>
            <ul className="flex flex-col gap-2">
              {data.followups.map((f, i) => (
                <li key={i} className="flex gap-2 text-gray-800 leading-relaxed">
                  <span className="text-teal-400 font-black">→</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.together && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🎲</span>
              <span className="font-black text-amber-800">All together</span>
            </div>
            <p className="text-gray-700 leading-relaxed">{data.together}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handlePlayAgain}
          className="w-full py-4 rounded-2xl font-black text-white text-lg bg-teal-500 hover:bg-teal-600 active:bg-teal-700 transition-colors"
        >
          New Talking Point 💬
        </button>
      </div>
    );
  }

  // idle state
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-black text-center text-gray-900 mb-2">💬 Family Talking Point</h1>
      <p className="text-center text-gray-500 mb-6 text-sm">
        Pick a theme — I&apos;ll give your whole family something fun to chat about together.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => setCategory(cat.value)}
            className={`py-4 rounded-2xl font-bold text-base flex flex-col items-center gap-1 border-2 transition-all ${
              category === cat.value
                ? "border-teal-400 bg-teal-50 text-teal-800"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span className="text-2xl">{cat.emoji}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-700 text-center">
          {error}
        </div>
      )}

      {sparksBalance < 1 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-sm text-amber-700 text-center">
          You need ⚡ Sparks to play — get some from the Arcade!
        </div>
      )}

      <button
        type="button"
        onClick={handlePlay}
        disabled={sparksBalance < 1 || !kidId}
        className="w-full py-4 rounded-2xl font-black text-white text-lg bg-teal-500 hover:bg-teal-600 active:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Play — 1 ⚡
      </button>
    </div>
  );
}
