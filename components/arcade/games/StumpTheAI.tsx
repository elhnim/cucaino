"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { spendSparks, askStumpQuestion } from "@/lib/actions/arcade";

type GameState = "idle" | "thinking" | "playing" | "ai_won" | "kid_won";

type Message = { role: "user" | "assistant"; content: string };

const CATEGORIES = [
  { label: "Animals", emoji: "🐾", value: "Animals" },
  { label: "Foods", emoji: "🍕", value: "Foods" },
  { label: "Household Items", emoji: "🏠", value: "Household Items" },
  { label: "Hobbies", emoji: "🎨", value: "Hobbies" },
  { label: "Popular Characters", emoji: "⭐", value: "Popular Characters" },
];

const CONFETTI = ["🎉","🎊","✨","🌟","🎈","🥳","🏆","💫","⭐","🎯","🦄","🎀","🎁","🌈","🎆"];

interface StumpTheAIProps {
  kidId: string | null;
  sparksBalance: number;
}

function extractGuess(content: string): string {
  const marker = "My final guess is:";
  const idx = content.indexOf(marker);
  if (idx !== -1) {
    return content.slice(idx + marker.length).trim().replace(/[.!?]+$/, "");
  }
  return content;
}

export default function StumpTheAI({ kidId, sparksBalance }: StumpTheAIProps) {
  const [gameState, setGameState] = useState<GameState>("idle");
  const [category, setCategory] = useState("Animals");
  const [messages, setMessages] = useState<Message[]>([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [aiGuess, setAiGuess] = useState("");
  const [revealAnswer, setRevealAnswer] = useState("");
  const [hasRevealed, setHasRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleStart = useCallback(async () => {
    if (!kidId || sparksBalance < 3) return;
    setError(null);

    const spendResult = await spendSparks(kidId, 3);
    if (!spendResult.ok) {
      setError(spendResult.error);
      return;
    }

    setMessages([]);
    setQuestionCount(0);
    setAiGuess("");
    setRevealAnswer("");
    setHasRevealed(false);
    setGameState("thinking");

    const result = await askStumpQuestion(category, []);
    if (!result.ok) {
      setError("Something went wrong, try again");
      setGameState("idle");
      return;
    }

    const firstMsg: Message = { role: "assistant", content: result.data.content };
    setMessages([firstMsg]);
    setQuestionCount(1);
    setGameState("playing");
  }, [kidId, sparksBalance, category]);

  const handleAnswer = useCallback(async (answer: "Yes" | "No") => {
    if (gameState !== "playing") return;

    const userMsg: Message = { role: "user", content: answer };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setGameState("thinking");

    const result = await askStumpQuestion(category, updatedMessages);
    if (!result.ok) {
      setError("Something went wrong");
      setGameState("playing");
      return;
    }

    const assistantMsg: Message = { role: "assistant", content: result.data.content };

    if (result.data.type === "guess") {
      const guess = extractGuess(result.data.content);
      setAiGuess(guess);
      setMessages([...updatedMessages, assistantMsg]);
      // Show the guess for kid to confirm — handled in a special "guessing" sub-state within playing
      // We'll use ai_won/kid_won as confirmation states. First show the guess via aiGuess state.
      // Keep gameState as playing but set aiGuess — we'll detect this in render.
      setGameState("playing");
      setMessages((prev) => [...prev.slice(0, -1), assistantMsg]);
      // Trigger the guess UI by also updating question count
      setQuestionCount((c) => c + 1);
    } else {
      setMessages([...updatedMessages, assistantMsg]);
      setQuestionCount((c) => c + 1);
      setGameState("playing");
    }
  }, [gameState, messages, category]);

  const handlePlayAgain = useCallback(() => {
    setMessages([]);
    setQuestionCount(0);
    setAiGuess("");
    setRevealAnswer("");
    setHasRevealed(false);
    setError(null);
    setGameState("idle");
  }, []);

  const currentQuestion = messages.length > 0 ? messages[messages.length - 1] : null;
  const isAiGuessing = aiGuess !== "" && gameState === "playing";

  if (gameState === "thinking") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-5xl animate-bounce">🤖</div>
        <p className="text-lg font-bold text-gray-600">Thinking...</p>
      </div>
    );
  }

  if (gameState === "ai_won") {
    return (
      <div className="max-w-lg mx-auto text-center py-10">
        <div className="text-6xl mb-4">🤖</div>
        <h2 className="text-2xl font-black text-gray-900 mb-3">Got you!</h2>
        <p className="text-gray-600 mb-2">I knew it was <strong>{aiGuess}</strong>!</p>
        <p className="text-gray-500 text-sm mb-6">Better luck next time... 😏</p>
        <button
          type="button"
          onClick={handlePlayAgain}
          className="px-8 py-4 rounded-2xl font-black text-white text-lg bg-green-500 hover:bg-green-600 active:bg-green-700 transition-colors"
        >
          Play Again 🎮
        </button>
      </div>
    );
  }

  if (gameState === "kid_won" && isMounted) {
    const confetti = Array.from({ length: 12 }, () =>
      CONFETTI[Math.floor(Math.random() * CONFETTI.length)]
    );
    return createPortal(
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center"
        style={{ background: "linear-gradient(160deg, #16a34a 0%, #22c55e 50%, #86efac 100%)" }}
      >
        <style>{`
          @keyframes float-stump {
            0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 1; }
            50% { transform: translateY(-20px) rotate(15deg); opacity: 0.8; }
          }
        `}</style>
        <div className="flex flex-wrap justify-center gap-3 mb-6 text-3xl">
          {confetti.map((e, i) => (
            <span
              key={i}
              style={{
                animation: `float-stump ${1.5 + (i % 5) * 0.3}s ease-in-out infinite`,
                animationDelay: `${i * 0.1}s`,
              }}
            >
              {e}
            </span>
          ))}
        </div>
        <h1 className="text-4xl font-black text-white mb-3">🎉 YOU STUMPED ME! 🎉</h1>
        <p className="text-lg text-white/90 font-bold mb-2">I had no idea!</p>
        <p className="text-white/70 mb-4">What was it?</p>
        {!hasRevealed ? (
          <div className="flex gap-2 w-full max-w-xs mb-6">
            <input
              type="text"
              value={revealAnswer}
              onChange={(e) => setRevealAnswer(e.target.value)}
              placeholder="The answer was..."
              className="flex-1 px-4 py-3 rounded-xl text-gray-900 font-medium focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setHasRevealed(true)}
              disabled={!revealAnswer.trim()}
              className="px-4 py-3 rounded-xl font-black text-green-700 bg-white hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              Reveal
            </button>
          </div>
        ) : (
          <p className="text-white text-lg font-bold mb-6">
            You were thinking of <strong>{revealAnswer}</strong>! Amazing!
          </p>
        )}
        <button
          type="button"
          onClick={handlePlayAgain}
          className="px-8 py-4 rounded-2xl font-black text-green-700 text-lg bg-white hover:bg-gray-50 active:scale-95 transition-all"
        >
          Play Again 🎮
        </button>
      </div>,
      document.body,
    );
  }

  if (gameState === "playing") {
    // AI is guessing — show confirmation
    if (isAiGuessing) {
      return (
        <div className="max-w-lg mx-auto">
          <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-6 mb-6 text-center">
            <p className="text-sm font-bold text-green-600 mb-2">🤖 My final guess is...</p>
            <p className="text-2xl font-black text-gray-900">{aiGuess}!</p>
          </div>
          <p className="text-center text-gray-500 mb-4 text-sm">Am I right?</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setGameState("ai_won")}
              className="flex-1 py-4 rounded-2xl font-black text-white text-lg bg-green-500 hover:bg-green-600 transition-colors"
            >
              ✅ Yes, you got it!
            </button>
            <button
              type="button"
              onClick={() => setGameState("kid_won")}
              className="flex-1 py-4 rounded-2xl font-black text-white text-lg bg-rose-500 hover:bg-rose-600 transition-colors"
            >
              ❌ Nope, wrong!
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-lg mx-auto">
        <p className="text-sm font-bold text-gray-500 text-center mb-4">
          Question {questionCount} of 10
        </p>

        {currentQuestion && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🤖</span>
              <p className="text-lg text-gray-800 leading-relaxed">{currentQuestion.content}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700 text-center">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handleAnswer("Yes")}
            className="flex-1 py-5 rounded-2xl font-black text-white text-xl bg-green-500 hover:bg-green-600 active:scale-95 transition-all"
          >
            ✅ YES
          </button>
          <button
            type="button"
            onClick={() => handleAnswer("No")}
            className="flex-1 py-5 rounded-2xl font-black text-white text-xl bg-rose-500 hover:bg-rose-600 active:scale-95 transition-all"
          >
            ❌ NO
          </button>
        </div>
      </div>
    );
  }

  // idle state
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-black text-center text-gray-900 mb-2">🐾 Stump The AI</h1>
      <p className="text-center text-gray-500 mb-6 text-sm">
        Think of a {category.toLowerCase()}. I&apos;ll ask yes/no questions to figure out what it is. Can you stump me?
      </p>

      <div className="grid grid-cols-2 gap-2 mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => setCategory(cat.value)}
            className={`py-3 px-2 rounded-xl font-bold text-sm flex items-center gap-2 border-2 transition-all ${
              category === cat.value
                ? "border-green-400 bg-green-50 text-green-800"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span className="text-xl">{cat.emoji}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-700 text-center">
          {error}
        </div>
      )}

      {sparksBalance < 3 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-sm text-amber-700 text-center">
          You need ⚡ Sparks to play — get some from the Arcade!
        </div>
      )}

      <button
        type="button"
        onClick={handleStart}
        disabled={sparksBalance < 3 || !kidId}
        className="w-full py-4 rounded-2xl font-black text-white text-lg bg-green-500 hover:bg-green-600 active:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        I&apos;ve got one! Start — 3 ⚡
      </button>
    </div>
  );
}
