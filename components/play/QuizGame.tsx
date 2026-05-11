"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getTheme } from "@/lib/themes/presets";
import type { ThemeId } from "@/lib/domain/types";

type Choice = { label: string; isCorrect: boolean };
type Question = {
  id: string;
  prompt: string;
  choices: Choice[];
  timeLimitSeconds: number;
};
type Player = {
  id: string;
  name: string;
  avatar: string;
  themeId: ThemeId;
};
type Mode = "setup" | "playing" | "finished";

const TILE_COLORS = [
  { bg: "#ef4444", hover: "#dc2626", label: "A" },
  { bg: "#3b82f6", hover: "#2563eb", label: "B" },
  { bg: "#f59e0b", hover: "#d97706", label: "C" },
  { bg: "#22c55e", hover: "#16a34a", label: "D" },
];

export default function QuizGame({
  bankName,
  questions,
  players,
  backHref = "/play/quiz",
}: {
  bankName: string;
  questions: Question[];
  players: Player[];
  backHref?: string;
}) {
  const DEFAULT_COUNT = Math.min(10, questions.length);
  const COUNT_OPTIONS = [5, 10, 15, 20].filter((n) => n < questions.length).concat(questions.length);

  const [mode, setMode] = useState<Mode>("setup");
  const [gameMode, setGameMode] = useState<"solo" | "turns">("turns");
  const [activePlayers, setActivePlayers] = useState<Player[]>(players);
  const [questionCount, setQuestionCount] = useState(DEFAULT_COUNT);
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [chosen, setChosen] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  const gameQuestions = mode === "setup" ? [] : activeQuestions;
  const currentQuestion = gameQuestions[questionIndex];
  const currentPlayer =
    gameMode === "solo"
      ? activePlayers[0]
      : activePlayers[questionIndex % activePlayers.length];

  // Timer
  useEffect(() => {
    if (mode !== "playing" || revealed || !currentQuestion) return;
    setSecondsLeft(currentQuestion.timeLimitSeconds);
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          if (!revealed) handleAnswer(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionIndex, mode]);

  const start = () => {
    setActiveQuestions(questions.slice(0, questionCount));
    setMode("playing");
    setQuestionIndex(0);
    setScores(Object.fromEntries(activePlayers.map((p) => [p.id, 0])));
    setChosen(null);
    setRevealed(false);
  };

  const scoreForSpeed = (secondsTaken: number, maxSeconds: number): number => {
    const ratio = secondsTaken / maxSeconds;
    if (ratio <= 0.2) return 20;
    if (ratio <= 0.4) return 18;
    if (ratio <= 0.65) return 12;
    return 5;
  };

  const handleAnswer = (choiceIndex: number | null) => {
    if (revealed) return;
    setChosen(choiceIndex);
    setRevealed(true);
    if (choiceIndex !== null && currentQuestion?.choices[choiceIndex]?.isCorrect) {
      const limit = currentQuestion.timeLimitSeconds;
      const taken = limit - secondsLeft;
      const points = scoreForSpeed(taken, limit);
      setScores((s) => ({
        ...s,
        [currentPlayer!.id]: (s[currentPlayer!.id] ?? 0) + points,
      }));
    }
  };

  const advance = () => {
    if (questionIndex + 1 >= gameQuestions.length) {
      setMode("finished");
      return;
    }
    setQuestionIndex((i) => i + 1);
    setChosen(null);
    setRevealed(false);
  };

  const ranking = useMemo(() => {
    return [...activePlayers]
      .map((p) => ({ player: p, score: scores[p.id] ?? 0 }))
      .sort((a, b) => b.score - a.score);
  }, [scores, activePlayers]);

  // ---------- SETUP ----------
  if (mode === "setup") {
    return (
      <main className="min-h-screen bg-gradient-to-br from-violet-100 via-fuchsia-100 to-orange-100 font-fun p-6">
        <div className="max-w-2xl mx-auto">
          <Link
            href={backHref}
            className="text-sm bg-white/70 hover:bg-white px-4 py-2 rounded-full shadow inline-block mb-4"
          >
            ← Back
          </Link>
          <div className="bg-white rounded-3xl shadow-xl p-6 md:p-8">
            <div className="text-xs font-bold text-fuchsia-600 mb-1">QUIZ</div>
            <h1 className="text-3xl md:text-4xl font-black mb-1">{bankName}</h1>
            <p className="text-sm text-gray-600 mb-6">
              {questions.length} questions in bank · {questions[0]?.timeLimitSeconds ?? 10} sec each
            </p>

            <div className="text-sm font-bold text-gray-700 mb-2">MODE</div>
            <div className="grid grid-cols-2 gap-2 mb-6">
              <button
                type="button"
                onClick={() => setGameMode("turns")}
                className={`rounded-2xl p-4 border-2 transition-colors ${
                  gameMode === "turns"
                    ? "border-fuchsia-500 bg-fuchsia-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="text-3xl mb-1">⚔️</div>
                <div className="font-black">Take turns</div>
                <div className="text-xs text-gray-500">
                  Kids alternate questions, highest score wins
                </div>
              </button>
              <button
                type="button"
                onClick={() => setGameMode("solo")}
                className={`rounded-2xl p-4 border-2 transition-colors ${
                  gameMode === "solo"
                    ? "border-fuchsia-500 bg-fuchsia-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="text-3xl mb-1">🎯</div>
                <div className="font-black">Solo practice</div>
                <div className="text-xs text-gray-500">
                  One player vs the clock
                </div>
              </button>
            </div>

            <div className="text-sm font-bold text-gray-700 mb-2">PLAYERS</div>
            <div className="flex gap-2 flex-wrap mb-6">
              {players.map((p) => {
                const enabled = activePlayers.some((ap) => ap.id === p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (gameMode === "solo") {
                        setActivePlayers([p]);
                      } else {
                        setActivePlayers((prev) =>
                          enabled
                            ? prev.filter((x) => x.id !== p.id)
                            : [...prev, p],
                        );
                      }
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-colors ${
                      enabled
                        ? "border-fuchsia-500 bg-fuchsia-50"
                        : "border-gray-200 opacity-50"
                    }`}
                  >
                    <span className="text-2xl">{p.avatar}</span>
                    <span className="font-bold">{p.name}</span>
                  </button>
                );
              })}
            </div>

            <div className="text-sm font-bold text-gray-700 mb-2">QUESTIONS</div>
            <div className="flex gap-2 flex-wrap mb-6">
              {COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setQuestionCount(n)}
                  className={`px-4 py-2 rounded-xl border-2 font-bold text-sm transition-colors ${
                    questionCount === n
                      ? "border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {n === questions.length ? `All ${n}` : n}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={start}
              disabled={activePlayers.length === 0}
              className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 text-white font-black text-lg py-4 rounded-2xl shadow-lg"
            >
              ▶ Start {questionCount} questions
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ---------- PLAYING ----------
  if (mode === "playing" && currentQuestion && currentPlayer) {
    const theme = getTheme(currentPlayer.themeId);
    return (
      <main className={`min-h-screen bg-gradient-to-br ${theme.pageGradient} font-fun p-4 md:p-8 flex flex-col`}>
        {/* Top bar */}
        <div className="max-w-3xl mx-auto w-full flex items-center justify-between mb-6 gap-2">
          <Link
            href={backHref}
            className="bg-white rounded-full w-10 h-10 shadow flex items-center justify-center text-lg shrink-0"
            title="Quit quiz"
          >
            ✕
          </Link>
          <div className="bg-white rounded-full px-3 py-2 shadow flex items-center gap-2 min-w-0">
            <span className="text-xl">{currentPlayer.avatar}</span>
            <span className="font-bold truncate text-sm md:text-base">{currentPlayer.name}&apos;s turn</span>
          </div>
          <div className="text-xs md:text-sm font-bold bg-white rounded-full px-3 py-2 shadow shrink-0">
            Q {questionIndex + 1}/{gameQuestions.length}
          </div>
          <div
            className="text-2xl md:text-3xl font-black bg-white rounded-full w-12 h-12 md:w-16 md:h-16 flex items-center justify-center shadow shrink-0"
            style={{
              color: secondsLeft <= 3 ? "#dc2626" : theme.accent,
            }}
          >
            {secondsLeft}
          </div>
        </div>

        {/* Question */}
        <div className="max-w-3xl mx-auto w-full bg-white rounded-3xl shadow-xl p-6 md:p-8 mb-6 text-center">
          <p className="text-2xl md:text-3xl font-black">{currentQuestion.prompt}</p>
        </div>

        {/* Tiles */}
        <div className="max-w-3xl mx-auto w-full grid grid-cols-2 gap-3 md:gap-4">
          {currentQuestion.choices.map((choice, i) => {
            const tile = TILE_COLORS[i];
            const isChosen = chosen === i;
            const isCorrect = choice.isCorrect;
            let style: React.CSSProperties = { background: tile.bg };
            if (revealed) {
              if (isCorrect) style = { background: "#16a34a" };
              else if (isChosen) style = { background: "#9ca3af" };
              else style = { background: tile.bg, opacity: 0.5 };
            }
            return (
              <button
                key={choice.label + i}
                type="button"
                disabled={revealed}
                onClick={() => handleAnswer(i)}
                className="text-white font-black text-lg md:text-2xl rounded-2xl p-6 md:p-8 shadow-lg disabled:cursor-not-allowed transition-transform active:scale-95"
                style={style}
              >
                <span className="block text-sm opacity-70 mb-1">
                  {tile.label}
                </span>
                {choice.label}
                {revealed && isCorrect ? (
                  <span className="block text-2xl mt-2">✓</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Reveal panel */}
        {revealed ? (
          <div className="max-w-3xl mx-auto w-full mt-6 bg-white rounded-2xl shadow p-4 flex items-center justify-between">
            <div className="text-sm">
              {chosen !== null && currentQuestion.choices[chosen].isCorrect
                ? `🎉 Correct! +${10 + secondsLeft} ⭐`
                : chosen === null
                  ? "⏰ Time's up!"
                  : "❌ Not quite — try the next one!"}
            </div>
            <button
              type="button"
              onClick={advance}
              className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold px-6 py-2 rounded-xl shadow"
            >
              {questionIndex + 1 >= gameQuestions.length ? "See results →" : "Next →"}
            </button>
          </div>
        ) : null}

        {/* Mini scoreboard */}
        {gameMode === "turns" ? (
          <div className="max-w-3xl mx-auto w-full mt-4 flex justify-center gap-4">
            {activePlayers.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-full px-3 py-1.5 shadow text-sm flex items-center gap-2"
              >
                <span>{p.avatar}</span>
                <span className="font-bold">{scores[p.id] ?? 0} ⭐</span>
              </div>
            ))}
          </div>
        ) : null}
      </main>
    );
  }

  // ---------- FINISHED ----------
  return (
    <main className="min-h-screen bg-gradient-to-br from-violet-100 via-fuchsia-100 to-orange-100 font-fun p-6 flex flex-col items-center justify-center">
      <div className="max-w-xl w-full bg-white rounded-3xl shadow-xl p-8 text-center">
        <div className="text-6xl mb-4">🏆</div>
        <h1 className="text-3xl font-black mb-2">
          {ranking[0] ? `${ranking[0].player.name} wins!` : "Game over!"}
        </h1>
        <p className="text-sm text-gray-600 mb-6">{bankName}</p>

        <div className="space-y-2 mb-6">
          {ranking.map((r, idx) => (
            <div
              key={r.player.id}
              className={`flex items-center gap-3 p-3 rounded-xl ${
                idx === 0
                  ? "bg-yellow-50 border-2 border-yellow-300"
                  : "bg-gray-50"
              }`}
            >
              <span className="text-2xl w-8">{idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}</span>
              <span className="text-3xl">{r.player.avatar}</span>
              <span className="font-bold flex-1 text-left">{r.player.name}</span>
              <span className="font-black text-lg">{r.score} ⭐</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={start}
            className="bg-gray-100 hover:bg-gray-200 font-bold py-3 rounded-xl"
          >
            🔁 Play again
          </button>
          <Link
            href={backHref}
            className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold py-3 rounded-xl text-center"
          >
            New quiz →
          </Link>
        </div>
      </div>
    </main>
  );
}
