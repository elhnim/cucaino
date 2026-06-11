"use client";

import { useEffect, useRef, useState } from "react";
import { PLAY_SECONDS } from "@/lib/pet/config";
import { playReward, type PetStage } from "@/lib/pet/logic";
import PetSprite from "@/components/pet/PetSprite";

/**
 * Fetch — the skill mini-game behind the Play action. Tap the ball as many
 * times as you can before the timer runs out; the score drives a variable
 * happiness/XP reward (collected server-side by playWithPet).
 */
export default function FetchGame({
  species,
  stage,
  petName,
  accent,
  cost,
  busy,
  onDone,
  onCancel,
}: {
  species: string;
  stage: PetStage;
  petName: string;
  accent: string;
  cost: number;
  busy: boolean;
  onDone: (score: number) => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<"ready" | "playing" | "done">("ready");
  const [secondsLeft, setSecondsLeft] = useState(PLAY_SECONDS);
  const [score, setScore] = useState(0);
  const [ball, setBall] = useState({ top: 40, left: 45 });
  const moveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const moveBall = () => {
    setBall({ top: 10 + Math.random() * 65, left: 8 + Math.random() * 78 });
  };

  // Countdown
  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setPhase("done");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Ball relocates on its own if not caught
  useEffect(() => {
    if (phase !== "playing") return;
    moveTimer.current = setInterval(moveBall, 1400);
    return () => { if (moveTimer.current) clearInterval(moveTimer.current); };
  }, [phase]);

  const catchBall = () => {
    setScore((s) => s + 1);
    moveBall();
    // Reset the auto-move clock so catches feel responsive
    if (moveTimer.current) clearInterval(moveTimer.current);
    moveTimer.current = setInterval(moveBall, 1400);
  };

  const reward = playReward(score);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={phase === "playing" ? undefined : onCancel}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-t-[28px] px-5 pt-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === "ready" && (
          <div className="text-center">
            <div className="text-5xl mb-2">🎾</div>
            <h2 className="text-xl font-black text-gray-900 mb-1">Fetch with {petName}!</h2>
            <p className="text-sm text-gray-500 mb-5">
              Tap the ball as many times as you can in {PLAY_SECONDS} seconds.
              The better you play, the happier {petName} gets!
            </p>
            <button
              type="button"
              onClick={() => setPhase("playing")}
              className="w-full py-4 rounded-2xl font-black text-base text-white active:scale-95 transition-transform"
              style={{ background: accent }}
            >
              Let&apos;s play! · {cost} ⭐
            </button>
            <button type="button" onClick={onCancel} className="mt-2 text-sm font-bold text-gray-400 py-2 w-full">
              Maybe later
            </button>
          </div>
        )}

        {phase === "playing" && (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-black px-3 py-1 rounded-full text-white" style={{ background: accent }}>
                🎾 {score}
              </span>
              <span className={`text-sm font-black px-3 py-1 rounded-full ${secondsLeft <= 5 ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-600"}`}>
                ⏱ {secondsLeft}s
              </span>
            </div>
            <div
              className="relative rounded-3xl overflow-hidden"
              style={{
                height: 320,
                background: "linear-gradient(180deg, #bae6fd 0%, #e0f2fe 50%, #86efac 78%, #4ade80 100%)",
              }}
            >
              <span className="absolute top-3 right-4 text-2xl">☀️</span>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 select-none">
                <PetSprite species={species} mood="happy" stage={stage} size={72} animClass="avatar-bounce" />
              </span>
              <button
                type="button"
                onClick={catchBall}
                className="absolute text-4xl active:scale-75 transition-transform select-none"
                style={{ top: `${ball.top}%`, left: `${ball.left}%`, transition: "top 0.25s ease-out, left 0.25s ease-out" }}
                aria-label="Catch the ball"
              >
                🎾
              </button>
            </div>
          </>
        )}

        {phase === "done" && (
          <div className="text-center">
            <div className="text-5xl mb-2 animate-pop inline-block">{score >= 12 ? "🏆" : score >= 6 ? "🎉" : "💚"}</div>
            <h2 className="text-xl font-black text-gray-900 mb-1">
              {score >= 12 ? "Amazing!" : score >= 6 ? "Great game!" : "Good try!"} {score} catches
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              {petName} gets <span className="font-black text-gray-700">+{reward.happiness} happy</span> and{" "}
              <span className="font-black text-gray-700">+{reward.xp} XP</span>
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDone(score)}
              className="w-full py-4 rounded-2xl font-black text-base text-white active:scale-95 transition-transform disabled:opacity-50"
              style={{ background: accent }}
            >
              {busy ? "Collecting…" : `Collect reward · ${cost} ⭐`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
