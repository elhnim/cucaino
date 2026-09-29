"use client";

// First visit to Cucaino Park: a few friendly cards explaining the loop — do quests, earn
// stars + tickets, build your park, care for your pet, play rides. Marks the kid's tour as
// seen (existing markKidTourSeen) so it only shows once.
import { useState } from "react";
import { markKidTourSeen } from "@/lib/actions/onboarding";
import { CandySheet } from "./ui/CandySheet";
import { GameButton } from "./ui/GameButton";
import { C, alpha } from "./ui/theme";

const STEPS = [
  { emoji: "🗺️", title: "Welcome to Cucaino Park!", body: "This is YOUR park. Walk with the joystick or tap where to go. Drag the screen (or use ⟲ ⟳) to look around, pinch to zoom!" },
  { emoji: "📜", title: "Do quests, earn stars", body: "Your chores are quests on the Quest Board. Finish one and you win ⭐ stars and a 🎟️ ticket!" },
  { emoji: "🔨", title: "Build your Dream Park", body: "Spend tickets on new pieces, fountains and rides. Your park grows every day!" },
  { emoji: "🐾", title: "Look after your pet", body: "Visit Pet Meadow to feed, bathe, play fetch and teach tricks. Your pet will love you for it!" },
  { emoji: "🎢", title: "Ride & explore", body: "Try the Quiz Coaster and Mini Golf, spend stars in the Prize Shop, and hunt for treasures 🗺️ hidden every day!" },
];

export function WelcomeTour({ kidId, onDone }: { kidId: string; onDone: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const finish = () => {
    void markKidTourSeen(kidId);
    onDone();
  };
  return (
    <CandySheet title={`${step.emoji} ${step.title}`} subtitle={`Step ${i + 1} of ${STEPS.length}`} color={C.gold} onClose={finish}>
      <div style={{ textAlign: "center", padding: "6px 4px 4px" }}>
        <div key={i} className="gp-popin" style={{ fontSize: 76, lineHeight: 1.1, filter: `drop-shadow(0 0 18px ${alpha(C.gold, 0.55)})` }}>
          {step.emoji}
        </div>
        <p style={{ fontWeight: 700, fontSize: 18, color: C.text, lineHeight: 1.5, maxWidth: 480, margin: "14px auto" }}>{step.body}</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, margin: "8px 0 16px" }}>
          {STEPS.map((_, k) => (
            <span key={k} style={{ width: 10, height: 10, borderRadius: 2, transform: "rotate(45deg)", background: k === i ? C.gold : k < i ? alpha(C.gold, 0.45) : "rgba(255,255,255,0.18)", boxShadow: k === i ? `0 0 10px ${C.gold}` : undefined }} />
          ))}
        </div>
        {i < STEPS.length - 1 ? (
          <GameButton big onClick={() => setI(i + 1)}>
            Next →
          </GameButton>
        ) : (
          <GameButton big variant="success" onClick={finish}>
            Let&apos;s play! 🎉
          </GameButton>
        )}
      </div>
    </CandySheet>
  );
}
