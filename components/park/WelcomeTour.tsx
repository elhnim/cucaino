"use client";

// First visit to Cucaino Park: a few friendly cards explaining the loop — do quests, earn
// stars + tickets, build your park, care for your pet, play rides. Marks the kid's tour as
// seen (existing markKidTourSeen) so it only shows once.
import { useState } from "react";
import { markKidTourSeen } from "@/lib/actions/onboarding";
import { CandySheet, CandyButton } from "./ui/CandySheet";

const STEPS = [
  { emoji: "🍭", title: "Welcome to Cucaino Park!", body: "This is YOUR park. Walk with the joystick or tap where to go. Drag the screen (or use ⟲ ⟳) to look around, pinch to zoom!" },
  { emoji: "📋", title: "Do quests, earn stars", body: "Your chores are quests on the Quest Board. Finish one and you win ⭐ stars and a 🎟️ ticket!" },
  { emoji: "🔨", title: "Build your Dream Park", body: "Spend tickets on lollipops, cupcakes, fountains and rides. Your park grows every day!" },
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
    <CandySheet title={`${step.emoji} ${step.title}`} subtitle={`${i + 1} of ${STEPS.length}`} color="#ff5fa8" onClose={finish}>
      <div style={{ textAlign: "center", padding: "6px 4px 4px" }}>
        <div style={{ fontSize: 76, lineHeight: 1.1 }}>{step.emoji}</div>
        <p style={{ fontWeight: 800, fontSize: 18, color: "#5a2350", lineHeight: 1.45 }}>{step.body}</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, margin: "8px 0 14px" }}>
          {STEPS.map((_, k) => (
            <span key={k} style={{ width: 10, height: 10, borderRadius: 999, background: k === i ? "#ff5fa8" : "#f3d0e3" }} />
          ))}
        </div>
        {i < STEPS.length - 1 ? (
          <CandyButton onClick={() => setI(i + 1)}>Next →</CandyButton>
        ) : (
          <CandyButton color="#2fcf8f" onClick={finish}>
            Let&apos;s play! 🎉
          </CandyButton>
        )}
      </div>
    </CandySheet>
  );
}
