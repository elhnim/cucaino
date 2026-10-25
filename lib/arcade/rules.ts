/**
 * Game rules + scoring for the AI Arcade. Pure (tested in rules.test.ts) and shared by
 * the server actions (to enforce limits) and the game components (to show them).
 */

// ---- Clue game (What Am I?) ----------------------------

export const CLUE_COUNT = 5;
/** extra guesses once every clue is showing */
export const FINAL_TRIES = 3;

/**
 * Points for solving on clue `clueNumber` (1-based) after `hintsUsed` letter hints.
 * Clue 1 = 5 pts … clue 5 = 1 pt; each hint costs 1; never below 1 for a win.
 */
export function cluePoints(clueNumber: number, hintsUsed = 0): number {
  const base = CLUE_COUNT + 1 - Math.min(Math.max(clueNumber, 1), CLUE_COUNT);
  return Math.max(1, base - Math.max(0, hintsUsed));
}

/** Friendly rank for a clue-game score. */
export function clueRank(points: number): { title: string; emoji: string } {
  if (points >= 5) return { title: "Genius Detective", emoji: "🧠" };
  if (points >= 4) return { title: "Super Sleuth", emoji: "🕵️" };
  if (points >= 3) return { title: "Sharp Thinker", emoji: "🔍" };
  if (points >= 2) return { title: "Clue Cracker", emoji: "🧩" };
  return { title: "Got There!", emoji: "🐢" };
}

// ---- Stump The AI (20 questions) -----------------------------------------

export const STUMP_MAX_QUESTIONS = 20;
export const STUMP_MAX_GUESSES = 3;

export type StumpAnswer = "Yes" | "No" | "Sometimes" | "Not sure";
export interface StumpTurn {
  kind: "question" | "guess";
  text: string;
  /** the kid's answer ("Yes"/"No"/…); a guess answered "No" is a wrong guess */
  answer: StumpAnswer;
}

export function stumpProgress(turns: readonly StumpTurn[]) {
  const asked = turns.length; // every question and every guess uses one of the 20
  const wrongGuesses = turns.filter((t) => t.kind === "guess" && t.answer !== "Yes").map((t) => t.text);
  const guessesLeft = Math.max(0, STUMP_MAX_GUESSES - wrongGuesses.length);
  const left = Math.max(0, STUMP_MAX_QUESTIONS - asked);
  return {
    asked,
    left,
    wrongGuesses,
    guessesLeft,
    /** the AI's next move must be a guess (last question, or it has run out of questions) */
    mustGuess: left <= 1 && guessesLeft > 0,
    /** the kid has won: AI out of questions or out of guesses */
    kidWon: left === 0 || guessesLeft === 0,
  };
}
