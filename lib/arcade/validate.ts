/**
 * Validators that turn untrusted model JSON into the exact shape each game needs.
 * Every validator returns null when the output is unusable, so the server action can
 * retry once and then show a friendly error. Pure (tested in validate.test.ts).
 */
import { cleanEmoji, cleanStr, cleanStrArray } from "./json";
import { leaksAnswer } from "./match";
import { CLUE_COUNT, coerceStatement } from "./rules";

type Json = Record<string, unknown>;

// ---- Emoji Story ----------------------------------------------------------

export interface StoryChoice {
  emoji: string;
  text: string;
}
export interface StoryStart {
  title: string;
  paragraphs: string[];
  question: string;
  choices: [StoryChoice, StoryChoice];
}
export interface StoryEnd {
  paragraphs: string[];
  moral: string;
}

export function validateStoryStart(j: Json | null): StoryStart | null {
  if (!j) return null;
  const title = cleanStr(j.title, 80);
  const paragraphs = cleanStrArray(j.paragraphs, 700).slice(0, 4);
  const question = cleanStr(j.question, 160) ?? "What should happen next?";
  const rawChoices = Array.isArray(j.choices) ? j.choices : [];
  const choices = rawChoices
    .map((c, i): StoryChoice | null => {
      if (typeof c === "string") {
        const text = cleanStr(c, 140);
        return text ? { emoji: i === 0 ? "👉" : "👈", text } : null;
      }
      if (c && typeof c === "object") {
        const text = cleanStr((c as Json).text, 140);
        return text ? { emoji: cleanEmoji((c as Json).emoji, i === 0 ? "👉" : "👈"), text } : null;
      }
      return null;
    })
    .filter((c): c is StoryChoice => c !== null);
  if (!title || paragraphs.length < 2 || choices.length < 2) return null;
  return { title, paragraphs, question, choices: [choices[0], choices[1]] };
}

export function validateStoryEnd(j: Json | null): StoryEnd | null {
  if (!j) return null;
  const paragraphs = cleanStrArray(j.paragraphs, 700).slice(0, 4);
  const moral = cleanStr(j.moral, 200) ?? "";
  if (paragraphs.length < 1) return null;
  return { paragraphs, moral };
}

// ---- Would You Rather -----------------------------------------------------

export interface WyrRound {
  a: string;
  b: string;
  emojiA: string;
  emojiB: string;
  /** the AI's case FOR option A (shown when the kid picks B) */
  forA: string;
  /** the AI's case FOR option B (shown when the kid picks A) */
  forB: string;
}

export function validateWyrPack(j: Json | null, min = 3): WyrRound[] | null {
  if (!j || !Array.isArray(j.rounds)) return null;
  const seen = new Set<string>();
  const rounds: WyrRound[] = [];
  for (const r of j.rounds) {
    if (!r || typeof r !== "object") continue;
    const o = r as Json;
    const a = cleanStr(o.a, 160);
    const b = cleanStr(o.b, 160);
    const forA = cleanStr(o.for_a ?? o.forA, 400);
    const forB = cleanStr(o.for_b ?? o.forB, 400);
    if (!a || !b || !forA || !forB || a.toLowerCase() === b.toLowerCase()) continue;
    const key = `${a}|${b}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rounds.push({ a, b, forA, forB, emojiA: cleanEmoji(o.emoji_a ?? o.emojiA, "🅰️"), emojiB: cleanEmoji(o.emoji_b ?? o.emojiB, "🅱️") });
  }
  return rounds.length >= min ? rounds : null;
}

// ---- What Am I? / Word Detective -------------------------------------------

export interface ClueRound {
  answer: string;
  /** other names we also accept ("sea turtle" for "turtle") */
  aliases: string[];
  /** hardest first, easiest last */
  clues: string[];
  emoji: string;
  funFact: string;
}

/**
 * @param singleWord Word Detective needs one real word (letters only) so the letter
 *   blanks + letter hints work.
 */
export function validateClueRound(j: Json | null, opts: { singleWord?: boolean } = {}): ClueRound | null {
  if (!j) return null;
  const answer = cleanStr(j.answer ?? j.word, 40);
  if (!answer) return null;
  if (opts.singleWord && !/^[A-Za-z]{3,12}$/.test(answer)) return null;
  if (!opts.singleWord && !/^[A-Za-z][A-Za-z '-]{1,38}$/.test(answer)) return null;
  const aliases = cleanStrArray(j.aliases, 40)
    .filter((a) => a.toLowerCase() !== answer.toLowerCase())
    .slice(0, 6);
  const clues = cleanStrArray(j.clues, 220);
  if (clues.length < CLUE_COUNT) return null;
  const five = clues.slice(0, CLUE_COUNT);
  if (five.some((c) => leaksAnswer(c, answer, aliases))) return null;
  return {
    answer,
    aliases,
    clues: five,
    emoji: cleanEmoji(j.emoji, "❓"),
    funFact: cleanStr(j.fun_fact ?? j.funFact, 240) ?? "",
  };
}

// ---- Stump The AI ---------------------------------------------------------

export interface StumpMove {
  type: "question" | "guess";
  /** the question to show ("Does it live in water?") or the guess itself ("a penguin") */
  text: string;
  /** a short in-character reaction to the last answer ("Ooh, interesting!") */
  reaction: string;
}

export function validateStumpMove(j: Json | null, mustGuess: boolean): StumpMove | null {
  if (!j) return null;
  const type = j.type === "guess" ? "guess" : j.type === "question" ? "question" : null;
  if (!type) return null;
  if (mustGuess && type !== "guess") return null;
  let text = cleanStr(type === "guess" ? j.guess ?? j.text ?? j.content : j.text ?? j.content, 160);
  if (!text) return null;
  if (type === "guess") {
    // tolerate "My final guess is: a penguin!" / "Is it a penguin?"
    text = text
      .replace(/^(?:my (?:final )?guess is:?|i (?:think|guess) (?:it'?s|it is)|is it)\s*/i, "")
      .replace(/[.!?]+$/, "")
      .trim();
    if (!text || text.length > 60) return null;
  } else if (!text.endsWith("?")) {
    text = `${text}?`;
  }
  return { type, text, reaction: cleanStr(j.reaction, 80) ?? "" };
}

// ---- AI Lie Detector ------------------------------------------------------

export interface LieMove {
  type: "question" | "guess";
  /** follow-up question, or the dramatic accusation line */
  text: string;
  guess: 1 | 2 | 3 | null;
  /** why the AI picked that one (shown on the reveal) */
  reason: string;
}

/** @param mustAsk reject an early accusation (the caller sets this until 2 questions are answered) */
export function validateLieMove(j: Json | null, mustGuess: boolean, mustAsk = false): LieMove | null {
  if (!j) return null;
  const type = j.type === "guess" ? "guess" : j.type === "question" ? "question" : null;
  if (!type) return null;
  if (mustGuess && type !== "guess") return null;
  if (mustAsk && !mustGuess && type !== "question") return null;
  const text = cleanStr(j.text ?? j.content, 240);
  if (!text) return null;
  if (type === "guess") {
    const guess = coerceStatement(j.guess ?? j.guessedStatement ?? j.statement);
    if (!guess) return null;
    return { type, text, guess, reason: cleanStr(j.reason, 240) ?? "" };
  }
  return { type, text, guess: null, reason: "" };
}
