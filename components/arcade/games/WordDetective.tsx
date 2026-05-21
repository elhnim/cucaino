"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { generateWordDetective } from "@/lib/actions/arcade";

type GameState = "idle" | "loading" | "guessing" | "won" | "lost";

const CONFETTI = ["🎉","🎊","✨","🌟","🎈","🥳","🏆","💫","⭐","🎯","🦄","🎀","🎁","🌈","🎆"];

interface WordDetectiveProps {
  kidId: string | null;
  sparksBalance: number;
}

export default function WordDetective({ kidId, sparksBalance }: WordDetectiveProps) {
  const backHref = `/play/arcade${kidId ? `?kid=${kidId}` : ""}`;
  const [gameState, setGameState] = useState<GameState>("idle");
  const [data, setData] = useState<{ word: string; clues: string[] } | null>(null);
  const [currentClueIndex, setCurrentClueIndex] = useState(0);
  const [guess, setGuess] = useState("");
  const [wrongMessage, setWrongMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handlePlay = useCallback(async () => {
    if (!kidId || sparksBalance < 1) return;
    setError(null);

    setGameState("loading");
    const result = await generateWordDetective(kidId);
    if (!result.ok) {
      setError("Something went wrong, try again");
      setGameState("idle");
      return;
    }

    setData(result.data);
    setCurrentClueIndex(0);
    setGuess("");
    setWrongMessage(null);
    setGameState("guessing");
  }, [kidId, sparksBalance]);

  const handleGuess = useCallback(() => {
    if (!data || !guess.trim()) return;
    const normalised = guess.trim().toLowerCase();
    const answer = data.word.toLowerCase();

    if (normalised === answer) {
      setGameState("won");
      return;
    }

    if (currentClueIndex >= data.clues.length - 1) {
      setGameState("lost");
      return;
    }

    setWrongMessage("Not quite! Try again or get the next clue");
    setGuess("");
  }, [data, guess, currentClueIndex]);

  const handleNextClue = useCallback(() => {
    setCurrentClueIndex((i) => i + 1);
    setWrongMessage(null);
  }, []);

  const handlePlayAgain = useCallback(() => {
    setData(null);
    setGuess("");
    setWrongMessage(null);
    setError(null);
    setCurrentClueIndex(0);
    setGameState("idle");
  }, []);

  if (gameState === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-5xl animate-bounce">🕵️</div>
        <p className="text-lg font-bold text-gray-600">Hiding a mystery word...</p>
      </div>
    );
  }

  if (gameState === "won" && data && isMounted) {
    const confetti = Array.from({ length: 12 }, () =>
      CONFETTI[Math.floor(Math.random() * CONFETTI.length)]
    );
    return createPortal(
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center"
        style={{ background: "linear-gradient(160deg, #f59e0b 0%, #f97316 50%, #fbbf24 100%)" }}
      >
        <Link href={backHref} className="absolute top-3 left-4 text-sm font-bold text-white/90 hover:text-white flex items-center gap-1">
          ← Arcade
        </Link>
        <style>{`
          @keyframes float-wd {
            0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 1; }
            50% { transform: translateY(-20px) rotate(15deg); opacity: 0.8; }
          }
        `}</style>
        <div className="flex flex-wrap justify-center gap-3 mb-6 text-3xl">
          {confetti.map((e, i) => (
            <span
              key={i}
              style={{
                animation: `float-wd ${1.5 + (i % 5) * 0.3}s ease-in-out infinite`,
                animationDelay: `${i * 0.1}s`,
              }}
            >
              {e}
            </span>
          ))}
        </div>
        <h1 className="text-4xl font-black text-white mb-3">🎉 YOU GOT IT! 🎉</h1>
        <p className="text-xl text-white/90 font-bold mb-2">
          You solved it on clue {currentClueIndex + 1}!
        </p>
        <p className="text-white/70 mb-8">The word was: <strong className="text-white">{data.word}</strong></p>
        <button
          type="button"
          onClick={handlePlayAgain}
          className="px-8 py-4 rounded-2xl font-black text-amber-700 text-lg bg-white hover:bg-gray-50 active:scale-95 transition-all"
        >
          Play Again 🎮
        </button>
      </div>,
      document.body,
    );
  }

  if (gameState === "lost" && data) {
    return (
      <div className="max-w-lg mx-auto text-center py-10">
        <div className="text-6xl mb-4">🙈</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">So close!</h2>
        <p className="text-gray-600 mb-4">
          The word was: <strong className="text-gray-900">{data.word}</strong>
        </p>
        <button
          type="button"
          onClick={handlePlayAgain}
          className="px-8 py-4 rounded-2xl font-black text-white text-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 transition-colors"
        >
          Try Again?
        </button>
      </div>
    );
  }

  if (gameState === "guessing" && data) {
    const totalClues = data.clues.length;
    return (
      <div className="max-w-lg mx-auto">
        <p className="text-sm font-bold text-gray-500 text-center mb-1">
          Clue {currentClueIndex + 1} of {totalClues}
        </p>
        <p className="text-xs text-gray-400 text-center mb-4">
          🕵️ I&apos;m thinking of a word... can you figure out what it is from my clues?
        </p>

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-4">
          <p className="text-lg text-gray-800 leading-relaxed">{data.clues[currentClueIndex]}</p>
        </div>

        {wrongMessage && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-sm text-amber-700 text-center">
            {wrongMessage}
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGuess()}
            placeholder="Your guess..."
            className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 font-medium focus:outline-none focus:border-amber-400"
          />
          <button
            type="button"
            onClick={handleGuess}
            disabled={!guess.trim()}
            className="px-5 py-3 rounded-xl font-black text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Guess!
          </button>
        </div>

        {currentClueIndex < totalClues - 1 && (
          <button
            type="button"
            onClick={handleNextClue}
            className="w-full py-3 rounded-xl border-2 border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Next Clue ▶
          </button>
        )}
      </div>
    );
  }

  // idle state
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-black text-center text-gray-900 mb-2">🕵️ Word Detective</h1>
      <p className="text-center text-gray-500 mb-8 text-sm">
        I&apos;m thinking of a word... can you figure out what it is from my clues?
      </p>

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
        className="w-full py-4 rounded-2xl font-black text-white text-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Play — 1 ⚡
      </button>
    </div>
  );
}
