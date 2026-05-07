"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Countdown timer driven by Date.now() so it stays accurate even when
 * the tab is throttled. Persists "in progress" state in localStorage so
 * the kid doesn't lose their session when they navigate or refresh.
 */
export default function PracticeTimer({
  durationMinutes,
  accent,
  storageKey,
  onComplete,
}: {
  durationMinutes: number;
  accent: string;
  storageKey: string;
  onComplete?: () => void;
}) {
  const totalMs = durationMinutes * 60_000;
  const [remainingMs, setRemainingMs] = useState(totalMs);
  const [running, setRunning] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const baseRemainingRef = useRef<number>(totalMs);
  const tickRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        remainingMs: number;
        startedAt: number | null;
        running: boolean;
      };
      if (saved.running && saved.startedAt) {
        const elapsed = Date.now() - saved.startedAt;
        const next = Math.max(0, saved.remainingMs - elapsed);
        baseRemainingRef.current = saved.remainingMs;
        startedAtRef.current = saved.startedAt;
        setRemainingMs(next);
        if (next > 0) {
          setRunning(true);
        } else {
          // It already finished while away — cleanup
          window.localStorage.removeItem(storageKey);
        }
      } else {
        setRemainingMs(saved.remainingMs);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick loop
  useEffect(() => {
    if (!running) {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = window.setInterval(() => {
      const elapsed = Date.now() - (startedAtRef.current ?? Date.now());
      const next = Math.max(0, baseRemainingRef.current - elapsed);
      setRemainingMs(next);
      if (next === 0 && !completedRef.current) {
        completedRef.current = true;
        beep();
        onComplete?.();
        setRunning(false);
        window.localStorage.removeItem(storageKey);
      }
    }, 200);
    return () => {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [running, storageKey, onComplete]);

  const start = () => {
    completedRef.current = false;
    baseRemainingRef.current = remainingMs;
    startedAtRef.current = Date.now();
    setRunning(true);
    persist(true);
  };

  const pause = () => {
    setRunning(false);
    baseRemainingRef.current = remainingMs;
    startedAtRef.current = null;
    persist(false);
  };

  const reset = () => {
    setRunning(false);
    completedRef.current = false;
    baseRemainingRef.current = totalMs;
    startedAtRef.current = null;
    setRemainingMs(totalMs);
    window.localStorage.removeItem(storageKey);
  };

  const persist = (isRunning: boolean) => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        remainingMs: baseRemainingRef.current,
        startedAt: startedAtRef.current,
        running: isRunning,
      }),
    );
  };

  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  const display = `${pad(minutes)}:${pad(seconds)}`;
  const fraction = totalMs > 0 ? remainingMs / totalMs : 0;
  const dashOffset = 282.7 * (1 - fraction);

  return (
    <div className="bg-white rounded-3xl shadow-xl p-6">
      <div className="text-center text-sm font-bold text-gray-500 mb-2">
        ⏱ PRACTICE TIMER
      </div>
      <div className="relative mx-auto" style={{ width: 220, height: 220 }}>
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
          <circle
            cx={50}
            cy={50}
            r={45}
            fill="none"
            stroke={`${accent}33`}
            strokeWidth={6}
          />
          <circle
            cx={50}
            cy={50}
            r={45}
            fill="none"
            stroke={accent}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={282.7}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 0.3s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            className="text-5xl font-black tabular-nums"
            style={{ color: accent }}
          >
            {display}
          </div>
          <div className="text-sm text-gray-500">
            {remainingMs === 0 ? "done! 🎉" : "remaining"}
          </div>
        </div>
      </div>
      <div className="flex gap-2 justify-center mt-4">
        {!running ? (
          <button
            type="button"
            onClick={start}
            disabled={remainingMs === 0}
            className="text-white font-bold px-6 py-3 rounded-xl disabled:opacity-50"
            style={{ background: accent }}
          >
            ▶ Start
          </button>
        ) : (
          <button
            type="button"
            onClick={pause}
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-6 py-3 rounded-xl"
          >
            ⏸ Pause
          </button>
        )}
        <button
          type="button"
          onClick={reset}
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold px-4 py-3 rounded-xl"
        >
          ↻ Reset
        </button>
      </div>
    </div>
  );
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function beep() {
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1);
    osc.onended = () => ctx.close();
  } catch {
    // ignore
  }
}
