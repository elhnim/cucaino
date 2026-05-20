"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { askLieDetectorQuestion } from "@/lib/actions/arcade";

type GameState = "idle" | "playing" | "result_caught" | "result_fooled";

type Message = { role: "user" | "assistant"; content: string };

const CONFETTI = ["🎉","🎊","✨","🌟","🎈","🥳","🏆","💫","⭐","🎯","🦄","🎀","🎁","🌈","🎆"];

interface AILieDetectorProps {
  kidId: string | null;
  sparksBalance: number;
}

export default function AILieDetector({ kidId, sparksBalance }: AILieDetectorProps) {
  const [gameState, setGameState] = useState<GameState>("idle");
  const [statements, setStatements] = useState<[string, string, string]>(["", "", ""]);
  const [lieIndex, setLieIndex] = useState<1 | 2 | 3 | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [aiGuessedStatement, setAiGuessedStatement] = useState<number | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [isAnswering, setIsAnswering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const canStart =
    statements[0].trim() !== "" &&
    statements[1].trim() !== "" &&
    statements[2].trim() !== "" &&
    lieIndex !== null &&
    sparksBalance >= 2 &&
    !!kidId;

  const handleStart = useCallback(async () => {
    if (!canStart || !kidId) return;
    setError(null);

    setMessages([]);
    setQuestionCount(0);
    setAiGuessedStatement(null);
    setCurrentAnswer("");
    setGameState("playing");

    const stmts: [string, string, string] = [
      statements[0].trim(),
      statements[1].trim(),
      statements[2].trim(),
    ];
    const result = await askLieDetectorQuestion(stmts, [], kidId);
    if (!result.ok) {
      setError("Something went wrong, try again");
      setGameState("idle");
      return;
    }

    const firstMsg: Message = { role: "assistant", content: result.data.content };
    setMessages([firstMsg]);
    setQuestionCount(1);

    if (result.data.type === "guess" && result.data.guessedStatement !== undefined) {
      setAiGuessedStatement(result.data.guessedStatement ?? null);
      const correct = result.data.guessedStatement === lieIndex;
      setGameState(correct ? "result_caught" : "result_fooled");
    }
  }, [canStart, kidId, statements, lieIndex]);

  const handleAnswer = useCallback(async () => {
    if (!currentAnswer.trim() || isAnswering || !lieIndex) return;
    setIsAnswering(true);
    setError(null);

    const userMsg: Message = { role: "user", content: currentAnswer.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setCurrentAnswer("");

    const stmts: [string, string, string] = [
      statements[0].trim(),
      statements[1].trim(),
      statements[2].trim(),
    ];

    const result = await askLieDetectorQuestion(stmts, updatedMessages);
    if (!result.ok) {
      setError("Something went wrong");
      setIsAnswering(false);
      return;
    }

    const assistantMsg: Message = { role: "assistant", content: result.data.content };
    setMessages([...updatedMessages, assistantMsg]);

    if (result.data.type === "guess" && result.data.guessedStatement !== undefined) {
      const guessed = result.data.guessedStatement as number;
      setAiGuessedStatement(guessed);
      const correct = guessed === lieIndex;
      setGameState(correct ? "result_caught" : "result_fooled");
    } else {
      setQuestionCount((c) => c + 1);
    }

    setIsAnswering(false);
  }, [currentAnswer, isAnswering, messages, statements, lieIndex]);

  const handlePlayAgain = useCallback(() => {
    setStatements(["", "", ""]);
    setLieIndex(null);
    setMessages([]);
    setQuestionCount(0);
    setAiGuessedStatement(null);
    setCurrentAnswer("");
    setError(null);
    setGameState("idle");
  }, []);

  if (gameState === "result_caught") {
    return (
      <div className="max-w-lg mx-auto text-center py-10">
        <div className="text-6xl mb-4">🕵️</div>
        <h2 className="text-2xl font-black text-gray-900 mb-3">CAUGHT!</h2>
        <p className="text-gray-600 mb-6">
          I knew Statement {aiGuessedStatement} felt suspicious!
        </p>
        <button
          type="button"
          onClick={handlePlayAgain}
          className="px-8 py-4 rounded-2xl font-black text-white text-lg bg-rose-500 hover:bg-rose-600 active:bg-rose-700 transition-colors"
        >
          Play Again
        </button>
      </div>
    );
  }

  if (gameState === "result_fooled" && isMounted) {
    const confetti = Array.from({ length: 12 }, () =>
      CONFETTI[Math.floor(Math.random() * CONFETTI.length)]
    );
    return createPortal(
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center"
        style={{ background: "linear-gradient(160deg, #e11d48 0%, #f43f5e 50%, #fda4af 100%)" }}
      >
        <style>{`
          @keyframes float-lie {
            0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 1; }
            50% { transform: translateY(-20px) rotate(15deg); opacity: 0.8; }
          }
        `}</style>
        <div className="flex flex-wrap justify-center gap-3 mb-6 text-3xl">
          {confetti.map((e, i) => (
            <span
              key={i}
              style={{
                animation: `float-lie ${1.5 + (i % 5) * 0.3}s ease-in-out infinite`,
                animationDelay: `${i * 0.1}s`,
              }}
            >
              {e}
            </span>
          ))}
        </div>
        <h1 className="text-4xl font-black text-white mb-3">🎉 YOU FOOLED ME! 🎉</h1>
        <p className="text-lg text-white/90 font-bold mb-4">
          I thought it was Statement {aiGuessedStatement} but I was completely wrong!
        </p>
        <p className="text-white/80 mb-8">You&apos;re a master of disguise!</p>
        <button
          type="button"
          onClick={handlePlayAgain}
          className="px-8 py-4 rounded-2xl font-black text-rose-700 text-lg bg-white hover:bg-gray-50 active:scale-95 transition-all"
        >
          Play Again 🎮
        </button>
      </div>,
      document.body,
    );
  }

  if (gameState === "playing") {
    const currentQuestion = messages.length > 0 ? messages[messages.length - 1] : null;
    return (
      <div className="max-w-lg mx-auto">
        {/* Show all 3 statements */}
        <div className="flex flex-col gap-2 mb-5">
          {statements.map((stmt, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border-2 border-gray-200 px-4 py-3"
            >
              <span className="text-xs font-black text-gray-400 uppercase tracking-wider block mb-0.5">
                Statement {i + 1}
              </span>
              <span className="text-gray-800 font-medium">{stmt}</span>
            </div>
          ))}
        </div>

        <p className="text-xs font-bold text-gray-400 text-center mb-3">
          Question {questionCount} of 3
        </p>

        {/* AI question bubble */}
        {currentQuestion && currentQuestion.role === "assistant" && (
          <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 mb-4">
            <div className="flex items-start gap-2">
              <span className="text-xl">🤖</span>
              <p className="text-gray-800 leading-relaxed">{currentQuestion.content}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-700 text-center">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAnswer()}
            placeholder="Your answer..."
            className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 font-medium focus:outline-none focus:border-rose-400"
            disabled={isAnswering}
          />
          <button
            type="button"
            onClick={handleAnswer}
            disabled={!currentAnswer.trim() || isAnswering}
            className="px-5 py-3 rounded-xl font-black text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isAnswering ? "..." : "Answer"}
          </button>
        </div>
      </div>
    );
  }

  // idle state
  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-black text-center text-gray-900 mb-2">🤥 AI Lie Detector</h1>
      <p className="text-center text-gray-500 mb-6 text-sm">
        Enter 3 statements about yourself — 2 truths and 1 lie. I&apos;ll try to catch you out!
      </p>

      <div className="flex flex-col gap-3 mb-5">
        {([0, 1, 2] as const).map((i) => (
          <div key={i}>
            <label className="text-xs font-black text-gray-500 uppercase tracking-wider block mb-1">
              Statement {i + 1}
            </label>
            <input
              type="text"
              value={statements[i]}
              onChange={(e) => {
                const updated: [string, string, string] = [...statements] as [string, string, string];
                updated[i] = e.target.value;
                setStatements(updated);
              }}
              placeholder={`Statement ${i + 1}...`}
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-900 font-medium focus:outline-none focus:border-rose-400"
            />
          </div>
        ))}
      </div>

      <div className="mb-6">
        <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
          Which is your lie?
        </p>
        <div className="flex gap-2">
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setLieIndex(n)}
              className={`flex-1 py-3 rounded-xl font-black text-lg border-2 transition-all ${
                lieIndex === n
                  ? "border-rose-400 bg-rose-50 text-rose-700"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

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
        onClick={handleStart}
        disabled={!canStart}
        className="w-full py-4 rounded-2xl font-black text-white text-lg bg-rose-500 hover:bg-rose-600 active:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Start — 2 ⚡
      </button>
    </div>
  );
}
