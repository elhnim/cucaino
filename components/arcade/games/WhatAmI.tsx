"use client";

import { generateWhatAmI } from "@/lib/actions/arcade";
import ClueGame, { type ClueGameConfig } from "../ClueGame";

const CONFIG: ClueGameConfig = {
  key: "whatami",
  title: "What Am I?",
  emoji: "❓",
  intro: "🤖 The AI becomes a mystery thing and gives you riddles. Can you work out what it is?",
  loadingLines: ["Turning into something mysterious…", "Writing sneaky riddles…", "No peeking!"],
  tone: "sky",
  gradient: "linear-gradient(160deg,#0ea5e9,#06b6d4 55%,#67e8f9)",
  letterBlanks: false,
  categories: [
    { label: "Animals", emoji: "🐾", value: "animal" },
    { label: "Foods", emoji: "🍕", value: "food" },
    { label: "Places", emoji: "🌍", value: "place" },
    { label: "Vehicles", emoji: "🚗", value: "vehicle" },
  ],
  generate: (kidId, category, avoid) => generateWhatAmI(category, kidId, avoid),
};

interface WhatAmIProps {
  kidId: string | null;
  sparksBalance: number;
}

export default function WhatAmI({ kidId, sparksBalance }: WhatAmIProps) {
  return <ClueGame kidId={kidId} sparksBalance={sparksBalance} config={CONFIG} />;
}
