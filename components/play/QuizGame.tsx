"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  soloPlayerId,
}: {
  bankName: string;
  questions: Question[];
  players: Player[];
  backHref?: string;
  soloPlayerId?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("setup");
  const [gameMode, setGameMode] = useState<"solo" | "turns">("turns");
  const [activePlayers, setActivePlayers] = useState<Player[]>(players);
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [chosen, setChosen] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          intervalRef.current = null;
          if (!revealed) handleAnswer(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    intervalRef.current = interval;
    return () => { clearInterval(interval); intervalRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionIndex, mode]);

  const start = () => {
    setActiveQuestions(questions);
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
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
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

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("quiz-active", { detail: { active: mode === "playing" } }));
    return () => {
      window.dispatchEvent(new CustomEvent("quiz-active", { detail: { active: false } }));
    };
  }, [mode]);

  const handleQuit = useCallback(() => {
    if (window.confirm("Quit the quiz? Your progress will be lost.")) {
      router.push(backHref);
    }
  }, [router, backHref]);

  // ---------- SETUP ----------
  if (mode === "setup") {
    return (
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <Link href={backHref} className="text-sm font-bold text-gray-600 hover:text-gray-900 flex items-center gap-1">
            ← Back to quizzes
          </Link>
          <span className="font-black text-gray-900 truncate px-2">{bankName}</span>
          <div className="w-24" />
        </header>
        <div className="p-4 pb-6">
        <div className="max-w-2xl mx-auto">
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
                onClick={() => {
                  setGameMode("turns");
                  if (activePlayers.length < 2) setActivePlayers(players);
                }}
                className={`rounded-2xl p-4 border-[3px] transition-all ${
                  gameMode === "turns"
                    ? "border-fuchsia-500 bg-fuchsia-50 shadow-md"
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
                onClick={() => {
                  setGameMode("solo");
                  const solo = soloPlayerId
                    ? (players.find((p) => p.id === soloPlayerId) ?? players[0])
                    : players[0];
                  setActivePlayers([solo]);
                }}
                className={`rounded-2xl p-4 border-[3px] transition-all ${
                  gameMode === "solo"
                    ? "border-fuchsia-500 bg-fuchsia-50 shadow-md"
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

            {/* Hide player picker in solo mode when locked to a specific kid */}
            {!(gameMode === "solo" && soloPlayerId) && (
              <>
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
              </>
            )}

            <button
              type="button"
              onClick={start}
              disabled={activePlayers.length === 0}
              className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 text-white font-black text-lg py-4 rounded-2xl shadow-lg"
            >
              ▶ Start {questions.length} questions
            </button>
          </div>
        </div>
        </div>
      </div>
    );
  }

  // ---------- PLAYING ----------
  if (mode === "playing" && currentQuestion && currentPlayer) {
    const theme = getTheme(currentPlayer.themeId);
    return (
      <div className="p-3 md:p-6 flex flex-col gap-2 md:gap-4">
        {/* Top bar */}
        <div className="max-w-3xl mx-auto w-full flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleQuit}
            className="bg-white/90 hover:bg-white rounded-2xl px-3 py-2 shadow flex items-center gap-1.5 text-sm font-bold text-fuchsia-700 shrink-0 transition-colors"
          >
            ← Quit
          </button>
          <div className="bg-white rounded-full px-3 py-2 shadow flex items-center gap-2 min-w-0">
            <span className="text-xl">{currentPlayer.avatar}</span>
            <span className="font-bold truncate text-sm md:text-base">
              {gameMode === "solo" ? `${currentPlayer.name} 🎯` : `${currentPlayer.name}'s turn`}
            </span>
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
        <div className="max-w-3xl mx-auto w-full bg-white rounded-3xl shadow-xl p-3 md:p-8 text-center">
          <p className="text-xl md:text-3xl font-black">{currentQuestion.prompt}</p>
        </div>

        {/* Tiles */}
        <div className="max-w-3xl mx-auto w-full grid grid-cols-2 gap-2 md:gap-4">
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
                className="text-white font-black text-base md:text-2xl rounded-2xl p-4 md:p-8 shadow-lg disabled:cursor-not-allowed transition-transform active:scale-95"
                style={style}
              >
                <span className="block text-xs md:text-sm opacity-70 mb-0.5 md:mb-1">
                  {tile.label}
                </span>
                {choice.label}
                {revealed && isCorrect ? (
                  <span className="block text-xl md:text-2xl mt-1 md:mt-2">✓</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Reveal panel */}
        {revealed ? (
          <div className="max-w-3xl mx-auto w-full bg-white rounded-2xl shadow p-3 md:p-4 flex items-center justify-between">
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
          <div className="max-w-3xl mx-auto w-full flex justify-center gap-4">
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
      </div>
    );
  }

  // ---------- FINISHED ----------
  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <Link href={backHref} className="text-sm font-bold text-gray-600 hover:text-gray-900 flex items-center gap-1">
          ← Quizzes
        </Link>
        <span className="font-black text-gray-900">{bankName}</span>
        <div className="w-16" />
      </header>
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh]">
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

          <button
            type="button"
            onClick={start}
            className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-black text-lg py-4 rounded-2xl shadow-lg"
          >
            🔁 Play again
          </button>
        </div>
      </div>
    </div>
  );
}
