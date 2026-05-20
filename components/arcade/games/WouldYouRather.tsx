"use client";

import { useState, useCallback } from "react";
import { generateWouldYouRather, generateWouldYouRatherArgument } from "@/lib/actions/arcade";

type GameState = "idle" | "loading_dilemma" | "choosing" | "loading_argument" | "result";

interface WouldYouRatherProps {
  kidId: string | null;
  sparksBalance: number;
}

export default function WouldYouRather({ kidId, sparksBalance }: WouldYouRatherProps) {
  const [gameState, setGameState] = useState<GameState>("idle");
  const [dilemma, setDilemma] = useState<{ option_a: string; option_b: string } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [argument, setArgument] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!kidId || sparksBalance < 2) return;
    setError(null);

    setGameState("loading_dilemma");
    const result = await generateWouldYouRather(kidId);
    if (!result.ok) {
      setError("Something went wrong, try again");
      setGameState("idle");
      return;
    }

    setDilemma(result.data);
    setGameState("choosing");
  }, [kidId, sparksBalance]);

  const handleChoice = useCallback(async (chosenOption: string, rejectedOption: string) => {
    if (!dilemma) return;
    setChosen(chosenOption);
    setGameState("loading_argument");

    const result = await generateWouldYouRatherArgument(chosenOption, rejectedOption);
    if (!result.ok) {
      setError("Something went wrong");
      setGameState("choosing");
      return;
    }

    setArgument(result.data.argument);
    setGameState("result");
  }, [dilemma]);

  const handlePlayAgain = useCallback(() => {
    setDilemma(null);
    setChosen(null);
    setArgument(null);
    setError(null);
    setGameState("idle");
  }, []);

  if (gameState === "loading_dilemma") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-5xl animate-bounce">🤷</div>
        <p className="text-lg font-bold text-gray-600">Cooking up a dilemma...</p>
      </div>
    );
  }

  if (gameState === "loading_argument") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-5xl animate-bounce">🤖</div>
        <p className="text-lg font-bold text-gray-600">Building my argument...</p>
      </div>
    );
  }

  if (gameState === "choosing" && dilemma) {
    return (
      <div className="max-w-lg mx-auto">
        <h2 className="text-xl font-black text-center text-gray-900 mb-6">Would you rather...</h2>
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => handleChoice(dilemma.option_a, dilemma.option_b)}
            className="w-full p-6 rounded-3xl bg-orange-100 border-2 border-orange-300 text-orange-900 font-bold text-lg text-left hover:bg-orange-200 active:scale-95 transition-all"
          >
            <span className="block text-sm font-black uppercase tracking-wider text-orange-500 mb-1">Option A</span>
            {dilemma.option_a}
          </button>
          <div className="text-center text-gray-400 font-black text-lg">OR</div>
          <button
            type="button"
            onClick={() => handleChoice(dilemma.option_b, dilemma.option_a)}
            className="w-full p-6 rounded-3xl bg-sky-100 border-2 border-sky-300 text-sky-900 font-bold text-lg text-left hover:bg-sky-200 active:scale-95 transition-all"
          >
            <span className="block text-sm font-black uppercase tracking-wider text-sky-500 mb-1">Option B</span>
            {dilemma.option_b}
          </button>
        </div>
      </div>
    );
  }

  if (gameState === "result" && chosen && argument) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <p className="text-sm font-bold text-gray-500 mb-1">You chose:</p>
          <p className="text-lg font-black text-gray-900">{chosen}</p>
        </div>

        <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">🤖</span>
            <span className="font-black text-orange-800">Actually...</span>
          </div>
          <p className="text-gray-700 leading-relaxed">{argument}</p>
          <p className="text-sm italic text-gray-500 mt-3">I rest my case 😤</p>
        </div>

        <button
          type="button"
          onClick={handlePlayAgain}
          className="w-full py-4 rounded-2xl font-black text-white text-lg bg-orange-500 hover:bg-orange-600 active:bg-orange-700 transition-colors"
        >
          Play Again 🎮
        </button>
      </div>
    );
  }

  // idle state
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-black text-center text-gray-900 mb-2">🤷 Would You Rather</h1>
      <p className="text-center text-gray-500 mb-6">
        Pick an option — then I&apos;ll argue why you chose wrong!
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-700 text-center">
          {error}
        </div>
      )}

      {sparksBalance < 2 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-sm text-amber-700 text-center">
          You need ⚡ Sparks to play — get some from the Arcade!
        </div>
      )}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={sparksBalance < 2 || !kidId}
        className="w-full py-4 rounded-2xl font-black text-white text-lg bg-orange-500 hover:bg-orange-600 active:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Generate — 2 ⚡
      </button>
    </div>
  );
}
