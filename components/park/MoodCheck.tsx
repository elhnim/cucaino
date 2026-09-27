"use client";

// Once-a-day "How are you feeling?" at the park entrance — saved with the existing logMood
// (parents see it in their overview). Kind, quick, and skippable.
import { logMood } from "@/lib/actions/mood";
import { CandySheet } from "./ui/CandySheet";

const MOODS = [
  { emoji: "😊", label: "Happy", bg: "#fde68a", reply: "Yay! Let's make it a great day! 🌈" },
  { emoji: "🤩", label: "Excited", bg: "#fed7aa", reply: "Woohoo! Let's go have fun! 🎢" },
  { emoji: "😌", label: "Calm", bg: "#bbf7d0", reply: "Nice and cosy. Take it easy! 🌸" },
  { emoji: "😢", label: "Sad", bg: "#bfdbfe", reply: "Big hug 🤗 Your pet wants a cuddle too." },
  { emoji: "😰", label: "Worried", bg: "#e9d5ff", reply: "It's okay. Maybe tell a grown-up? 💜" },
  { emoji: "😠", label: "Angry", bg: "#fecaca", reply: "Take a big breath... in... and out. 🌬️" },
];

export function MoodCheck({ kidId, name, onDone }: { kidId: string; name: string; onDone: (reply: string | null) => void }) {
  return (
    <CandySheet title={`💭 How are you feeling, ${name}?`} subtitle="Tap one — there's no wrong answer" color="#a96bff" onClose={() => onDone(null)}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {MOODS.map((m) => (
          <button
            key={m.label}
            type="button"
            onClick={() => {
              void logMood(kidId, m.emoji);
              onDone(m.reply);
            }}
            style={{ border: "none", borderRadius: 22, padding: "14px 6px", background: m.bg, boxShadow: "0 4px 0 rgba(0,0,0,0.08)", cursor: "pointer" }}
          >
            <div style={{ fontSize: 42, lineHeight: 1 }}>{m.emoji}</div>
            <div style={{ fontWeight: 900, color: "#5a2350", marginTop: 4 }}>{m.label}</div>
          </button>
        ))}
      </div>
    </CandySheet>
  );
}
