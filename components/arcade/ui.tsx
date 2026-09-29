"use client";

// Shared bits for the AI Arcade games: loading, errors, sparks, celebrations.
// Light "candy" skin to match GameStage / the /play/arcade pages; everything is
// thumb-sized (min 48px tall) and single-column so it works at 390px wide.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ArcadeResult } from "@/lib/actions/arcade";

/**
 * Server actions REJECT (not return ok:false) when the network drops or a new deploy
 * invalidates the action id. Turn that into a normal error so no game gets stuck on its
 * "thinking" screen.
 */
export async function safeAction<T>(call: () => Promise<ArcadeResult<T>>): Promise<ArcadeResult<T>> {
  try {
    return await call();
  } catch {
    return { ok: false, error: "Can't reach the Arcade right now — check the internet and try again. No sparks were used." };
  }
}

/** The kid's sparks, kept locally so the counter drops the moment a game is paid for. */
export function useSparks(initial: number): [number, (next: number | undefined) => void] {
  const [sparks, setSparks] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    // parent re-fetched the balance (e.g. after a star swap)
    setPrevInitial(initial);
    setSparks(initial);
  }
  return [sparks, (next) => { if (typeof next === "number") setSparks(next); }];
}

/** A re-entrancy guard for async taps (double taps must never double-charge or double-submit). */
export function useBusy(): [boolean, <T>(fn: () => Promise<T>) => Promise<T | undefined>] {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return [busy, run];
}

export function Thinking({ emoji, lines }: { emoji: string; lines: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (lines.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % lines.length), 1800);
    return () => clearInterval(t);
  }, [lines.length]);
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4" role="status" aria-live="polite">
      <div className="text-6xl animate-bounce">{emoji}</div>
      <p className="text-lg font-black text-gray-700 text-center px-4">{lines[i % lines.length]}</p>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((d) => (
          <span key={d} className="w-2.5 h-2.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: `${d * 0.2}s` }} />
        ))}
      </div>
    </div>
  );
}

export function ErrorBox({ message, onRetry, retryLabel = "Try again" }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 mb-4 text-center" role="alert">
      <p className="text-red-700 font-bold mb-3">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[48px] px-6 rounded-xl font-black text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-all"
        >
          🔁 {retryLabel}
        </button>
      )}
    </div>
  );
}

export function SparkNote({ cost, sparks }: { cost: number; sparks: number }) {
  if (sparks >= cost) {
    return <p className="text-center text-xs font-bold text-gray-500 mt-2">You have ⚡ {sparks} sparks · this costs ⚡ {cost} (only if the AI answers)</p>;
  }
  return (
    <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-3 my-3 text-sm font-bold text-amber-800 text-center">
      You need ⚡ {cost} sparks (you have {sparks}). Swap some ⭐ stars for sparks on the Arcade screen!
    </div>
  );
}

const CONFETTI = ["🎉", "🎊", "✨", "🌟", "🎈", "🥳", "🏆", "💫", "⭐", "🎯", "🌈", "🎆"];

/** Inline win banner (no portal — it must stay inside the park's game window). */
export function Celebrate({ title, children, gradient }: { title: string; children?: ReactNode; gradient: string }) {
  const [bits] = useState(() => Array.from({ length: 10 }, (_, i) => CONFETTI[(i * 7 + Math.floor(Math.random() * 12)) % CONFETTI.length]));
  return (
    <div className="rounded-3xl p-6 text-center text-white shadow-lg mb-4" style={{ background: gradient }}>
      <style>{`@keyframes arcade-float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-14px) rotate(12deg)}}`}</style>
      <div className="flex flex-wrap justify-center gap-2 text-3xl mb-3" aria-hidden>
        {bits.map((e, i) => (
          <span key={i} style={{ display: "inline-block", animation: `arcade-float ${1.4 + (i % 4) * 0.3}s ease-in-out ${i * 0.08}s infinite` }}>
            {e}
          </span>
        ))}
      </div>
      <h2 className="text-3xl font-black mb-2 drop-shadow">{title}</h2>
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  color,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** tailwind bg classes, e.g. "bg-sky-500 hover:bg-sky-600" */
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full min-h-[56px] py-4 rounded-2xl font-black text-white text-lg active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all ${color}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full min-h-[48px] py-3 rounded-2xl border-2 border-gray-200 bg-white font-bold text-gray-700 hover:bg-gray-50 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
    >
      {children}
    </button>
  );
}

/** Small persistent "best score / streak" memory per game (localStorage, client only). */
export function readStat(key: string): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(window.localStorage.getItem(`arcade:stat:${key}`)) || 0;
  } catch {
    return 0;
  }
}
export function writeStat(key: string, value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`arcade:stat:${key}`, String(value));
  } catch {
    // ignore
  }
}
