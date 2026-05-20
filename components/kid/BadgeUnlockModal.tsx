"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import BadgeTile from "@/components/kid/BadgeTile";
import type { UnlockedBadge } from "@/lib/domain/types";

interface Props {
  badges: UnlockedBadge[];
  onDismiss: () => void;
}

const TIER_COLOR = {
  gold:   "#f59e0b",
  silver: "#94a3b8",
  bronze: "#c87941",
};

export default function BadgeUnlockModal({ badges, onDismiss }: Props) {
  const [idx, setIdx] = useState(0);
  const [countdown, setCountdown] = useState(6);

  const badge = badges[idx];

  // Auto-advance or dismiss after 6 seconds
  useEffect(() => {
    setCountdown(6);
    const tick = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(tick);
          if (idx + 1 < badges.length) {
            setIdx((i) => i + 1);
          } else {
            onDismiss();
          }
          return 6;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [idx, badges.length, onDismiss]);

  if (!badge) return null;

  const color = TIER_COLOR[badge.tier];

  const content = (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}
      onClick={() => {
        if (idx + 1 < badges.length) setIdx((i) => i + 1);
        else onDismiss();
      }}
    >
      {/* Confetti dots */}
      <Confetti color={color} />

      {/* Card */}
      <div
        className="flex flex-col items-center gap-4 px-8 py-10 rounded-3xl shadow-2xl max-w-xs w-full mx-4 animate-bounce-in"
        style={{ background: "#1a1a2e", border: `3px solid ${color}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pixel flash text */}
        <div
          className="text-xs font-black uppercase tracking-[0.3em] animate-pulse"
          style={{ color, fontFamily: "monospace", letterSpacing: "0.3em" }}
        >
          ★ NEW BADGE ★
        </div>

        {/* Big tile */}
        <div style={{ transform: "scale(1.8)", transformOrigin: "center", marginTop: 16, marginBottom: 16 }}>
          <BadgeTile
            category={badge.category}
            completionCount={99999}
            size="md"
            showLabel={false}
            showProgress={false}
          />
        </div>

        {/* Badge name */}
        <div className="text-center mt-2">
          <div className="text-2xl font-black text-white">{badge.tierName}</div>
          <div className="text-sm font-semibold mt-1" style={{ color }}>
            {badge.tier.charAt(0).toUpperCase() + badge.tier.slice(1)} {badge.icon}
          </div>
          {(badge.bonusStars || badge.bonusCashCents) ? (
            <div className="flex gap-3 justify-center text-sm font-black mt-2" style={{ color }}>
              {badge.bonusStars ? <span>+{badge.bonusStars} ⭐</span> : null}
              {badge.bonusCashCents ? <span>+${(badge.bonusCashCents / 100).toFixed(2)} 💵</span> : null}
            </div>
          ) : null}
        </div>

        {/* Countdown bar */}
        <div className="w-full h-1 rounded-full bg-white/20 overflow-hidden mt-2">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${(countdown / 6) * 100}%`,
              background: color,
              transition: "width 1s linear",
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            if (idx + 1 < badges.length) setIdx((i) => i + 1);
            else onDismiss();
          }}
          className="text-xs font-bold px-6 py-2 rounded-full mt-1"
          style={{ background: color + "22", color, border: `1.5px solid ${color}` }}
        >
          {idx + 1 < badges.length ? `Next (${idx + 1}/${badges.length}) →` : "Awesome! ✓"}
        </button>
      </div>

      <style>{`
        @keyframes bounce-in {
          0%   { transform: scale(0.3) translateY(40px); opacity: 0; }
          60%  { transform: scale(1.1) translateY(-10px); opacity: 1; }
          80%  { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
        .animate-bounce-in { animation: bounce-in 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards; }
      `}</style>
    </div>
  );

  return createPortal(content, document.body);
}

function Confetti({ color }: { color: string }) {
  const dots = Array.from({ length: 20 }, (_, i) => ({
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: Math.random() * 8 + 4,
    delay: Math.random() * 2,
    color: i % 3 === 0 ? color : i % 3 === 1 ? "#ffffff" : "#fbbf24",
  }));

  return (
    <>
      {dots.map((d, i) => (
        <div
          key={i}
          style={{
            position: "fixed",
            left: d.left,
            top: d.top,
            width: d.size,
            height: d.size,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            background: d.color,
            animation: `confetti-fall ${1.5 + d.delay}s ease-in forwards`,
            animationDelay: `${d.delay * 0.5}s`,
            opacity: 0.8,
            pointerEvents: "none",
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 0.9; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </>
  );
}
