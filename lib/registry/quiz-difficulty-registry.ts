import type { QuizDifficulty } from "@/lib/domain/types";

export interface QuizDifficultyDisplay {
  id: QuizDifficulty;
  label: string;
  stars: string;
  /** Light background for pill badges */
  bg: string;
  /** Dark text for pill badges */
  color: string;
  /** Solid background when button is active */
  activeBg: string;
}

export const QUIZ_DIFFICULTIES: QuizDifficultyDisplay[] = [
  { id: "easy",   label: "Easy",   stars: "⭐",       bg: "#d1fae5", color: "#065f46", activeBg: "#22c55e" },
  { id: "medium", label: "Medium", stars: "⭐⭐",     bg: "#fef3c7", color: "#92400e", activeBg: "#f59e0b" },
  { id: "hard",   label: "Hard",   stars: "⭐⭐⭐",   bg: "#fee2e2", color: "#991b1b", activeBg: "#ef4444" },
  { id: "genius", label: "Genius", stars: "⭐⭐⭐⭐", bg: "#ede9fe", color: "#4c1d95", activeBg: "#7c3aed" },
];

export function getQuizDifficulty(id: QuizDifficulty): QuizDifficultyDisplay {
  return QUIZ_DIFFICULTIES.find((d) => d.id === id) ?? QUIZ_DIFFICULTIES[0];
}
