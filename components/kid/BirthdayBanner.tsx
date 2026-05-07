"use client";

import { useEffect, useMemo, useState } from "react";
import { ageOn, isBirthdayToday } from "@/lib/domain/birthday";

const STORAGE_KEY = "cucaino-bday-dismissed";

export default function BirthdayBanner({
  name,
  dateOfBirth,
  accent,
}: {
  name: string;
  dateOfBirth: string | null;
  accent: string;
}) {
  const isBirthday = useMemo(() => isBirthdayToday(dateOfBirth), [dateOfBirth]);
  const turning = useMemo(() => ageOn(dateOfBirth), [dateOfBirth]);
  const [dismissed, setDismissed] = useState(false);
  const [confettiOn, setConfettiOn] = useState(false);

  // Per-day dismissal via localStorage so the banner doesn't keep popping back
  const dismissalKey = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return `${STORAGE_KEY}:${today}:${name}`;
  }, [name]);

  useEffect(() => {
    if (!isBirthday) return;
    if (window.localStorage.getItem(dismissalKey)) {
      setDismissed(true);
      return;
    }
    setConfettiOn(true);
    const t = setTimeout(() => setConfettiOn(false), 1500);
    return () => clearTimeout(t);
  }, [isBirthday, dismissalKey]);

  if (!isBirthday || dismissed) return null;

  return (
    <div className="px-4 md:px-5 pt-4 relative">
      {confettiOn ? <Confetti /> : null}
      <div
        className="rounded-2xl p-4 md:p-5 text-white shadow-xl relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, #f43f5e 0%, ${accent} 50%, #fbbf24 100%)`,
        }}
      >
        <div className="flex items-start gap-3">
          <div className="text-5xl md:text-6xl shrink-0 animate-bounce">🎂</div>
          <div className="flex-1 min-w-0">
            <div className="text-xl md:text-2xl font-black">
              Happy Birthday, {name}!{" "}
              <span aria-hidden>🎉</span>
            </div>
            <div className="text-sm md:text-base opacity-95">
              {turning !== null
                ? `You're turning ${turning} today — make it amazing!`
                : "Make it an amazing day!"}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="bg-white/30 backdrop-blur rounded-full px-3 py-1 text-xs font-bold">
                🎁 Birthday badge unlocked
              </span>
              <span className="bg-white/30 backdrop-blur rounded-full px-3 py-1 text-xs font-bold">
                ⭐ +50 bonus points
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              window.localStorage.setItem(dismissalKey, "1");
              setDismissed(true);
            }}
            className="text-white/80 hover:text-white text-xl shrink-0"
            aria-label="Dismiss banner"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function Confetti() {
  const colors = ["#f43f5e", "#f97316", "#fbbf24", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];
  const pieces = Array.from({ length: 40 });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
      {pieces.map((_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            background: colors[i % colors.length],
            left: `${Math.random() * 100}%`,
            top: `${-10 - Math.random() * 30}px`,
            animationDelay: `${Math.random() * 0.5}s`,
            animationDuration: `${1 + Math.random() * 1.2}s`,
          }}
        />
      ))}
    </div>
  );
}

