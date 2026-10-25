/**
 * Every AI Arcade game step as a plain server function: sanitise input → prompt → model →
 * parse → validate. NO auth, NO sparks, NO Supabase — the server actions in
 * lib/actions/arcade.ts wrap these with requireSparks/chargeSparks, and the play-test
 * endpoint (app/api/arcade-playtest) calls them directly with synthetic input, so what gets
 * play-tested is exactly what kids play.
 */
import { callJSON, MODEL_FAST, MODEL_SMART, ArcadeFail, type CallTrace } from "./ai";
import { sanitizeKidText } from "./json";
import { freshSeed, MYSTERY_CAST, MYSTERY_PREMISES, pick, sample, STORY_GENRES, STUMP_OPENERS, WHATAMI_FLAVORS } from "./variety";
import { doodlePrompt, mysteryAskPrompt, mysteryCasePrompt, mysteryRevealPrompt, storyEndPrompt, storyStartPrompt, stumpPrompt, whatAmIPrompt } from "./prompts";
import { stumpProgress, type StumpAnswer, type StumpTurn } from "./rules";
import {
  validateClueRound,
  validateStoryEnd,
  validateStoryStart,
  validateStumpMove,
  type ClueRound,
  type StoryEnd,
  type StoryStart,
  type StumpMove,
} from "./validate";
import { DOODLE_MAX_CALLS_PER_WORD, isPngBase64, validateDoodleLook, type DoodleLook } from "./doodle";
import {
  coerceMysteryDifficulty,
  validateCase,
  validateReveal,
  validateSuspectReply,
  fallbackReveal,
  type CaseFile,
  type MysteryDifficulty,
  type Reveal,
  type Statement,
  type SuspectReply,
} from "./mystery";

export { ArcadeFail } from "./ai";
export type { CallTrace } from "./ai";

// ---- Emoji Story -----------------------------------------------------------

export const EMOJI_MAX = 5;

export async function runStoryStart(input: { emojis: unknown; style?: unknown; hero?: unknown }, trace?: CallTrace): Promise<StoryStart> {
  const list = (Array.isArray(input.emojis) ? input.emojis : []).map((e) => sanitizeKidText(e, 8)).filter(Boolean).slice(0, EMOJI_MAX);
  if (list.length < 3) throw new ArcadeFail("Pick at least 3 emojis first!");
  const style = sanitizeKidText(input.style, 40) || pick(STORY_GENRES);
  return callJSON({
    tag: "story-start",
    models: [MODEL_FAST],
    prompt: storyStartPrompt({ emojis: list, style, hero: sanitizeKidText(input.hero, 24), seed: freshSeed() }),
    maxTokens: 900,
    validate: validateStoryStart,
    trace,
  });
}

export async function runStoryEnd(
  input: { emojis?: unknown; title?: unknown; paragraphs?: unknown; choice?: unknown; hero?: unknown },
  trace?: CallTrace,
): Promise<StoryEnd> {
  return callJSON({
    tag: "story-end",
    models: [MODEL_FAST],
    prompt: storyEndPrompt({
      emojis: (Array.isArray(input.emojis) ? input.emojis : []).map((e) => sanitizeKidText(e, 8)).slice(0, EMOJI_MAX),
      title: sanitizeKidText(input.title, 80),
      story: (Array.isArray(input.paragraphs) ? input.paragraphs : []).map((p) => sanitizeKidText(p, 700)).slice(0, 4),
      choice: sanitizeKidText(input.choice, 140),
      hero: sanitizeKidText(input.hero, 24),
    }),
    maxTokens: 700,
    validate: validateStoryEnd,
    trace,
  });
}

// ---- What Am I? ------------------------------------------------------------

const WHATAMI_CATEGORIES = ["animal", "food", "place", "vehicle"] as const;

export async function runWhatAmI(category: unknown, avoid: unknown, trace?: CallTrace): Promise<ClueRound> {
  const cat = typeof category === "string" && (WHATAMI_CATEGORIES as readonly string[]).includes(category) ? category : "animal";
  const flavors = WHATAMI_FLAVORS[cat] ?? [];
  return callJSON({
    tag: "whatami",
    models: [MODEL_FAST],
    prompt: whatAmIPrompt({
      category: cat,
      flavor: flavors.length ? pick(flavors) : "",
      seed: freshSeed(),
      avoid: (Array.isArray(avoid) ? avoid : []).map((a) => sanitizeKidText(a, 40)).filter(Boolean),
    }),
    maxTokens: 700,
    validate: (j) => validateClueRound(j),
    trace,
  });
}

// ---- Stump The AI ----------------------------------------------------------

const STUMP_ANSWERS: readonly StumpAnswer[] = ["Yes", "No", "Sometimes", "Not sure"];
const STUMP_CATEGORIES = ["Animals", "Foods", "Household Items", "Sports & Hobbies", "Cartoon & Story Characters", "Anything!"] as const;

export function cleanStumpTurns(turns: unknown): StumpTurn[] {
  return (Array.isArray(turns) ? turns : []).slice(0, 25).map((t) => ({
    kind: t?.kind === "guess" ? "guess" : "question",
    text: sanitizeKidText(t?.text, 160),
    answer: STUMP_ANSWERS.includes(t?.answer) ? t.answer : "Not sure",
  }));
}

export async function runStump(category: unknown, turns: unknown, trace?: CallTrace): Promise<StumpMove> {
  const cat = typeof category === "string" && (STUMP_CATEGORIES as readonly string[]).includes(category) ? category : "Anything!";
  const history = cleanStumpTurns(turns);
  const progress = stumpProgress(history);
  if (progress.kidWon) throw new ArcadeFail("This game is already over — start a new one!");
  return callJSON({
    tag: "stump",
    models: [MODEL_SMART, MODEL_FAST],
    prompt: stumpPrompt({
      category: cat === "Anything!" ? "anything a kid would know (an animal, object, food, place or character)" : cat,
      turns: history,
      opener: history.length === 0 ? pick(STUMP_OPENERS) : "",
      mustGuess: progress.mustGuess,
    }),
    maxTokens: 300,
    validate: (j) => validateStumpMove(j, progress.mustGuess),
    trace,
  });
}

// ---- Doodle Guess ----------------------------------------------------------

/** One AI look at the drawing. The model is never told the target word. */
export async function runDoodleLook(
  input: { imageBase64: unknown; previous?: unknown; final?: unknown; look?: unknown },
  trace?: CallTrace,
): Promise<DoodleLook> {
  const img = typeof input.imageBase64 === "string" ? input.imageBase64.replace(/^data:image\/png;base64,/, "") : "";
  if (!isPngBase64(img)) throw new ArcadeFail("That drawing didn't come through — try again!");
  const previous = (Array.isArray(input.previous) ? input.previous : []).map((g) => sanitizeKidText(g, 40)).filter(Boolean).slice(0, 8);
  const look = Math.max(1, Math.min(DOODLE_MAX_CALLS_PER_WORD, Number(input.look) || 1));
  return callJSON({
    tag: "doodle",
    models: [MODEL_FAST],
    prompt: [{ imagePngBase64: img }, { text: doodlePrompt({ previous, final: input.final === true, look }) }],
    maxTokens: 220,
    budgetMs: 12_000,
    validate: validateDoodleLook,
    trace,
  });
}

// ---- Mystery Detective -----------------------------------------------------

export async function runMysteryNew(difficulty: unknown, trace?: CallTrace, avoid: string[] = []): Promise<CaseFile> {
  const d: MysteryDifficulty = coerceMysteryDifficulty(difficulty);
  return callJSON({
    tag: "mystery-new",
    // Haiku first: Sonnet couldn't write a whole case inside the function's time limit in
    // play-tests (both attempts timed out); the strict case validator guards the quality
    models: [MODEL_FAST, MODEL_SMART],
    prompt: mysteryCasePrompt({ difficulty: d, premise: pick(MYSTERY_PREMISES), cast: sample(MYSTERY_CAST, 4), seed: freshSeed(), avoid }),
    maxTokens: 1_400,
    attemptTimeoutMs: 13_000,
    fallbackOnFail: true,
    validate: (j) => validateCase(j, d),
    trace,
  });
}

export async function runMysteryAsk(
  input: { caseFile: CaseFile; suspectId: string; question: unknown; log: Statement[] },
  trace?: CallTrace,
): Promise<SuspectReply> {
  const question = sanitizeKidText(input.question, 160);
  if (question.length < 3) throw new ArcadeFail("Type a question for the suspect first!");
  const isCulprit = input.suspectId === input.caseFile.culpritId;
  const culpritName = input.caseFile.suspects.find((s) => s.id === input.caseFile.culpritId)?.name;
  return callJSON({
    tag: "mystery-ask",
    models: [MODEL_SMART, MODEL_FAST],
    prompt: mysteryAskPrompt({ caseFile: input.caseFile, suspectId: input.suspectId, question, log: input.log }),
    maxTokens: 300,
    attemptTimeoutMs: 12_000,
    fallbackOnFail: true,
    validate: (j) => validateSuspectReply(j, isCulprit, culpritName),
    trace,
  });
}

/** The big reveal; falls back to the case file's own explanation if the AI can't answer. */
export async function runMysteryReveal(
  input: { caseFile: CaseFile; accusedId: string; correct: boolean; reason: unknown; found: string[] },
  trace?: CallTrace,
): Promise<Reveal> {
  try {
    return await callJSON({
      tag: "mystery-reveal",
      models: [MODEL_FAST],
      prompt: mysteryRevealPrompt({ ...input, reason: sanitizeKidText(input.reason, 240) }),
      maxTokens: 700,
      budgetMs: 14_000,
      validate: validateReveal,
      trace,
    });
  } catch {
    return fallbackReveal(input.caseFile, input.correct);
  }
}
