"use client";

import { useState, useCallback } from "react";
import { generateEmojiStory } from "@/lib/actions/arcade";

const SAFE_EMOJIS = [
  "🐶","🐱","🐭","🐰","🦊","🐻","🐼","🐨","🐯","🦁",
  "🐮","🐷","🐸","🐵","🐔","🐧","🦆","🦉","🐺","🐴",
  "🦄","🦋","🐛","🦕","🦖","🐢","🦓","🐘","🦒","🦩",
  "🦚","🦜","🍕","🍔","🌮","🍜","🍣","🍩","🍪","🎂",
  "🍭","🍬","🍫","🍿","🍎","🍊","🍋","🍇","🍓","🍒",
  "🍌","🍉","🥑","🥦","🥕","🌸","🌺","🌻","🌈","🌟",
  "🌙","☀️","🌊","🌴","🚀","🛸","🚁","✈️","🚂","🚗",
];

function pickRandom(count: number): string[] {
  const shuffled = [...SAFE_EMOJIS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

type GameState = "idle" | "loading" | "story" | "done";

interface StoryData {
  title: string;
  paragraphs: string[];
  twist: string;
  moral: string;
}

interface EmojiStoryProps {
  kidId: string | null;
  sparksBalance: number;
}

export default function EmojiStory({ kidId, sparksBalance }: EmojiStoryProps) {
  const [gameState, setGameState] = useState<GameState>("idle");
  const [emojis, setEmojis] = useState<string[]>(() => pickRandom(5));
  const [rerolled, setRerolled] = useState(false);
  const [story, setStory] = useState<StoryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReroll = useCallback(() => {
    if (rerolled) return;
    setEmojis(pickRandom(5));
    setRerolled(true);
  }, [rerolled]);

  const handleGenerate = useCallback(async () => {
    if (!kidId || sparksBalance < 1) return;
    setError(null);

    setGameState("loading");

    const result = await generateEmojiStory(emojis, kidId);
    if (!result.ok) {
      setError("Something went wrong, try again");
      setGameState("idle");
      return;
    }

    setStory(result.data);
    setGameState("story");
  }, [kidId, sparksBalance, emojis]);

  const handlePlayAgain = useCallback(() => {
    setEmojis(pickRandom(5));
    setRerolled(false);
    setStory(null);
    setError(null);
    setGameState("idle");
  }, []);

  if (gameState === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-5xl animate-bounce">🎭</div>
        <p className="text-lg font-bold text-gray-600">Writing your story...</p>
        <div className="flex gap-2 text-2xl mt-2">
          {emojis.map((e, i) => (
            <span key={i} className="animate-pulse" style={{ animationDelay: `${i * 0.15}s` }}>{e}</span>
          ))}
        </div>
      </div>
    );
  }

  if (gameState === "story" && story) {
    return (
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-black text-center text-gray-900 mb-4">{story.title}</h1>

        <div className="flex justify-center gap-2 text-3xl mb-6">
          {emojis.map((e, i) => (
            <span key={i}>{e}</span>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          {story.paragraphs.map((para, i) => (
            <p key={i} className="mb-4 leading-relaxed text-gray-800 last:mb-0">
              {para}
            </p>
          ))}
        </div>

        <hr className="border-gray-200 my-4" />

        <div className="bg-violet-50 rounded-2xl p-4 mb-6">
          <p className="italic text-gray-600 leading-relaxed">✨ {story.moral}</p>
        </div>

        <button
          type="button"
          onClick={handlePlayAgain}
          className="w-full py-4 rounded-2xl font-black text-white text-lg bg-violet-500 hover:bg-violet-600 active:bg-violet-700 transition-colors"
        >
          🎮 Play Again
        </button>
      </div>
    );
  }

  // idle state
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-black text-center text-gray-900 mb-2">🎭 Emoji Story</h1>
      <p className="text-center text-gray-500 mb-6 text-sm">Your story ingredients:</p>

      {/* Emoji bubbles */}
      <div className="flex justify-center gap-3 mb-6">
        {emojis.map((e, i) => (
          <div
            key={i}
            className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-3xl"
          >
            {e}
          </div>
        ))}
      </div>

      {/* Re-roll button */}
      <button
        type="button"
        onClick={handleReroll}
        disabled={rerolled}
        className="w-full py-3 rounded-2xl font-bold text-sm mb-3 border-2 border-gray-200 bg-white text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
      >
        {rerolled ? "🔀 Already re-rolled!" : "🔀 Re-roll"}
      </button>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-700 text-center">
          {error}
        </div>
      )}

      {/* Sparks warning */}
      {sparksBalance < 1 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-sm text-amber-700 text-center">
          You need ⚡ Sparks to play — get some from the Arcade!
        </div>
      )}

      {/* Generate button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={sparksBalance < 1 || !kidId}
        className="w-full py-4 rounded-2xl font-black text-white text-lg bg-violet-500 hover:bg-violet-600 active:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Generate Story — 1 ⚡
      </button>
    </div>
  );
}
