"use client";

import { generateWordDetective } from "@/lib/actions/arcade";
import ClueGame, { type ClueGameConfig } from "../ClueGame";

const CONFIG: ClueGameConfig = {
  key: "word-detective",
  title: "Word Detective",
  emoji: "🕵️",
  intro: "🔎 A secret word is hidden behind the blanks. Crack the case from the clues — buy a letter if you're stuck!",
  loadingLines: ["Hiding a mystery word…", "Writing the case notes…", "Dusting for fingerprints…"],
  tone: "amber",
  gradient: "linear-gradient(160deg,#f59e0b,#f97316 55%,#fbbf24)",
  letterBlanks: true,
  generate: (kidId, _category, avoid) => generateWordDetective(kidId, avoid),
};

interface WordDetectiveProps {
  kidId: string | null;
  sparksBalance: number;
}

export default function WordDetective({ kidId, sparksBalance }: WordDetectiveProps) {
  return <ClueGame kidId={kidId} sparksBalance={sparksBalance} config={CONFIG} />;
}
