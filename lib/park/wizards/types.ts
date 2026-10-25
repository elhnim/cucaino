// Cucaino Park wizards: pure data types (no React, no DOM).

export type WizardId = "sage" | "twinkle" | "tinker" | "marigold" | "nova" | "coral";

export interface LessonQuiz {
  q: string;
  options: [string, string, string];
  answer: 0 | 1 | 2;
  explain: string;
}

export interface Lesson {
  /** Stable, unique, kebab-case, e.g. "sage-kind-words". Never rename: kids' Book of Wisdom stores these. */
  id: string;
  wizard: WizardId;
  /** Short, fun, <= 40 chars. */
  title: string;
  /** One emoji for the card. */
  emoji: string;
  /** What the wizard says: 2-4 short sentences, each <= 140 chars. */
  lines: string[];
  /** A small, safe thing to try today (<= 120 chars). */
  tryIt?: string;
  /** Optional bonus fact (<= 140 chars). */
  funFact?: string;
  /** One easy check question. */
  quiz?: LessonQuiz;
  /** Minimum age the lesson suits (default "5+"). */
  age?: "5+" | "8+";
}

export interface WizardDef {
  id: WizardId;
  name: string;
  title: string;
  emoji: string;
  /** Robe colour, hex. */
  robe: string;
  /** Hat colour, hex. */
  hat: string;
  greeting: string[];
  farewell: string[];
}

/** Lesson as authored in a wizard's file (the wizard id is stamped on by that file). */
export type LessonDraft = Omit<Lesson, "wizard">;
