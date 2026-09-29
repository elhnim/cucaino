"use client";

// Once-a-day "How are you feeling?" at the park entrance — saved with the existing logMood
// (parents see it in their overview). Kind, quick, and skippable.
import { logMood } from "@/lib/actions/mood";
import { CandySheet } from "./ui/CandySheet";
import { C, alpha } from "./ui/theme";

const MOODS = [
  { emoji: "😊", label: "Happy", bg: "#ffd36b", reply: "Yay! Let's make it a great day! 🌈" },
  { emoji: "🤩", label: "Excited", bg: "#ff9a3d", reply: "Woohoo! Let's go have fun! 🎢" },
  { emoji: "😌", label: "Calm", bg: "#4fe3a0", reply: "Nice and cosy. Take it easy! 🌸" },
  { emoji: "😢", label: "Sad", bg: "#4fa8ff", reply: "Big hug 🤗 Your pet wants a cuddle too." },
  { emoji: "😰", label: "Worried", bg: "#b06bff", reply: "It's okay. Maybe tell a grown-up? 💜" },
  { emoji: "😠", label: "Angry", bg: "#ff5d73", reply: "Take a big breath... in... and out. 🌬️" },
];

export function MoodCheck({ kidId, name, onDone }: { kidId: string; name: string; onDone: (reply: string | null) => void }) {
  return (
    <CandySheet title={`💭 How are you feeling, ${name}?`} subtitle="Tap one — there's no wrong answer" color={C.violet} onClose={() => onDone(null)}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {MOODS.map((m) => (
          <button
            key={m.label}
            type="button"
            onClick={() => {
              void logMood(kidId, m.emoji);
              onDone(m.reply);
            }}
            className="gp-press"
            style={{
              border: `1.5px solid ${alpha(m.bg, 0.6)}`,
              borderRadius: 16,
              padding: "14px 6px",
              minHeight: 96,
              background: `radial-gradient(circle at 50% 30%, ${alpha(m.bg, 0.32)}, rgba(28,24,70,0.8) 70%)`,
              boxShadow: `0 4px 12px rgba(0,0,0,0.3), inset 0 0 14px ${alpha(m.bg, 0.15)}`,
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 42, lineHeight: 1, filter: `drop-shadow(0 0 8px ${alpha(m.bg, 0.6)})` }}>{m.emoji}</div>
            <div style={{ fontWeight: 900, color: C.text, marginTop: 6 }}>{m.label}</div>
          </button>
        ))}
      </div>
    </CandySheet>
  );
}
