/**
 * Game rules + scoring for the AI Arcade. Pure (tested in rules.test.ts) and shared by
 * the server actions (to enforce limits) and the game components (to show them).
 */

// ---- Clue games (What Am I? / Word Detective) ----------------------------

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

/** "R _ _ N _ _ W"-style pattern. Spaces stay as gaps, revealed letters show. */
export function revealPattern(word: string, revealed: ReadonlySet<number>): string[] {
  return [...word].map((ch, i) => (ch === " " ? " " : revealed.has(i) ? ch.toUpperCase() : "_"));
}

/** Index of a hidden letter to reveal next (random among hidden), or -1 when none left. */
export function pickRevealIndex(word: string, revealed: ReadonlySet<number>, rand: () => number = Math.random): number {
  const hidden = [...word].map((ch, i) => (ch !== " " && !revealed.has(i) ? i : -1)).filter((i) => i >= 0);
  // always keep at least one letter hidden, or the hint just gives the answer away
  if (hidden.length <= 1) return -1;
  return hidden[Math.floor(rand() * hidden.length) % hidden.length];
}

/** Letter hints allowed for a word: about a third of its letters, at least 1. */
export function maxLetterHints(word: string): number {
  const letters = [...word].filter((c) => c !== " ").length;
  return Math.max(1, Math.floor(letters / 3));
}

// ---- Would You Rather ----------------------------------------------------

export const WYR_ROUNDS = 5;

export function wyrVerdict(held: number, total: number): { title: string; emoji: string; line: string } {
  if (total <= 0) return { title: "Ready?", emoji: "🤷", line: "" };
  const r = held / total;
  if (r >= 1) return { title: "Unshakeable!", emoji: "🗿", line: "The AI couldn't change your mind even once!" };
  if (r >= 0.6) return { title: "Tough Cookie", emoji: "🍪", line: "You stood your ground most of the time." };
  if (r >= 0.4) return { title: "Open Mind", emoji: "🤔", line: "You listened AND stuck to your guns. Nice balance!" };
  if (r > 0) return { title: "Easily Swayed", emoji: "🌬️", line: "The AI is a sneaky talker… it swayed you a lot!" };
  return { title: "Mind Changer", emoji: "🌀", line: "The AI talked you round every time! Rematch?" };
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

// ---- AI Lie Detector -----------------------------------------------------

export const LIE_MAX_QUESTIONS = 3;

/** Coerce the model's guess ("2", 2, "statement 2") to 1|2|3, else null. */
export function coerceStatement(v: unknown): 1 | 2 | 3 | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number((v.match(/[123]/) ?? [""])[0]) : NaN;
  return n === 1 || n === 2 || n === 3 ? n : null;
}
