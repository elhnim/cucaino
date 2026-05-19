"use client";

import { useState } from "react";
import { logMood } from "@/lib/actions/mood";

const MOODS = [
  { emoji: "😊", label: "Happy",   bg: "#fde68a" },
  { emoji: "😢", label: "Sad",     bg: "#bfdbfe" },
  { emoji: "😠", label: "Angry",   bg: "#fecaca" },
  { emoji: "😰", label: "Worried", bg: "#e9d5ff" },
  { emoji: "😌", label: "Calm",    bg: "#bbf7d0" },
  { emoji: "🤩", label: "Excited", bg: "#fed7aa" },
];

// Two columns × three rows inside the jar. Left slots use `left`, right slots use `right`.
const SLOTS: Array<{ top: number; left?: number; right?: number }> = [
  { top: 32, left: 18 },
  { top: 32, right: 18 },
  { top: 60, left: 18 },
  { top: 60, right: 18 },
  { top: 88, left: 18 },
  { top: 88, right: 18 },
];

interface MoodJarWidgetProps {
  kidId: string;
  initialCounts: Record<string, number>;
  accent: string;
}

export default function MoodJarWidget({ kidId, initialCounts, accent }: MoodJarWidgetProps) {
  const [counts, setCounts] = useState<Record<string, number>>(initialCounts);

  const totalTaps = Object.values(counts).reduce((s, n) => s + n, 0);
  const fillPct = Math.min(1, totalTaps / 12);
  const JAR_BOTTOM = 130;
  const JAR_HEIGHT = 105;
  const fillY = JAR_BOTTOM - JAR_HEIGHT * fillPct;
  const clipId = `moodJarClip-${kidId}`;

  function handleTap(mood: string) {
    setCounts((prev) => ({ ...prev, [mood]: (prev[mood] ?? 0) + 1 }));
    logMood(kidId, mood);
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col items-center gap-3">
      <div className="w-full flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Mood jar</span>
        {totalTaps > 0 && (
          <span className="text-[11px] text-gray-400 font-semibold">
            {totalTaps} tap{totalTaps !== 1 ? "s" : ""} today
          </span>
        )}
      </div>

      {/* Jar */}
      <div style={{ position: "relative", width: 120, height: 140 }}>
        <svg width="120" height="140" viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Lid */}
          <rect x="30" y="6" width="60" height="10" rx="4" fill={accent} />
          {/* Neck */}
          <rect x="35" y="12" width="50" height="16" rx="5" fill="white" stroke={accent} strokeWidth="2.5" />
          {/* Body */}
          <rect x="15" y="25" width="90" height="105" rx="12" fill="white" stroke={accent} strokeWidth="2.5" />
          {/* Fill level */}
          <clipPath id={clipId}>
            <rect x="16" y="26" width="88" height="103" rx="11" />
          </clipPath>
          <rect
            x="16"
            y={fillY}
            width="88"
            height={JAR_BOTTOM - fillY}
            fill="#fef3c7"
            clipPath={`url(#${clipId})`}
          />
        </svg>

        {/* Emoji bubbles — grow with each tap */}
        {MOODS.map((m, i) => {
          const count = counts[m.emoji] ?? 0;
          if (count === 0) return null;
          const size = Math.min(64, 16 + count * 6);
          const slot = SLOTS[i];
          return (
            <div
              key={m.emoji}
              style={{
                position: "absolute",
                top: slot.top,
                ...(slot.left !== undefined ? { left: slot.left } : { right: slot.right }),
                fontSize: size,
                lineHeight: 1,
                transition: "font-size 0.2s ease",
                filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.12))",
              }}
            >
              {m.emoji}
            </div>
          );
        })}
      </div>

      {/* Tap buttons */}
      <div className="flex gap-2 flex-wrap justify-center">
        {MOODS.map((m) => (
          <button
            key={m.emoji}
            type="button"
            onClick={() => handleTap(m.emoji)}
            style={{ background: m.bg }}
            className="w-11 h-11 rounded-full flex items-center justify-center text-2xl shadow-sm active:scale-90 transition-transform"
            title={m.label}
          >
            {m.emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
