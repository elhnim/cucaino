"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  freshSeed,
  pick,
  sample,
  STORY_GENRES,
  STUMP_OPENERS,
  WHATAMI_FLAVORS,
  WORD_THEMES,
  WYR_TOPICS,
} from "@/lib/arcade/variety";
import { extractJsonObject, sanitizeKidText } from "@/lib/arcade/json";
import {
  KID_SAFE_SYSTEM,
  liePrompt,
  storyEndPrompt,
  storyStartPrompt,
  stumpPrompt,
  whatAmIPrompt,
  wordDetectivePrompt,
  wyrPackPrompt,
} from "@/lib/arcade/prompts";
import { LIE_MAX_QUESTIONS, stumpProgress, WYR_ROUNDS, type StumpAnswer, type StumpTurn } from "@/lib/arcade/rules";
import {
  validateClueRound,
  validateLieMove,
  validateStoryEnd,
  validateStoryStart,
  validateStumpMove,
  validateWyrPack,
  type ClueRound,
  type LieMove,
  type StoryEnd,
  type StoryStart,
  type StumpMove,
  type WyrRound,
} from "@/lib/arcade/validate";

export type ArcadeResult<T = undefined> =
  | { ok: true; data: T; /** the kid's sparks after this call, when it changed */ sparks?: number }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Models
// Haiku 4.5 for the one-shot generators (fast, cheap, plenty for stories/clues).
// Sonnet 5 for the two reasoning games — 20 Questions needs real deduction over a long
// yes/no history (Haiku repeats questions and guesses wildly), and the Lie Detector has to
// weigh a kid's answers. Their replies are tiny, so the extra latency is ~1-2s a turn.
// If the Sonnet id is ever unavailable we fall back to Haiku instead of breaking the game.
// ---------------------------------------------------------------------------
const MODEL_FAST = "claude-haiku-4-5-20251001";
const MODEL_SMART = "claude-sonnet-5";

/** Netlify's server handler is killed at 26s (netlify.toml) — stay well inside it. */
const TOTAL_BUDGET_MS = 21_000;

const MSG = {
  noKey: "The AI Arcade is having a nap 😴 A grown-up needs to switch it on (it needs an AI key). No sparks were used.",
  busy: "The AI is super busy right now 🐝 Try again in a moment — no sparks were used.",
  slow: "The AI took too long to think 🐢 Try again — no sparks were used.",
  bad: "The AI got its words in a muddle 🤪 Try again — no sparks were used.",
  generic: "Something went wobbly 🙈 Try again — no sparks were used.",
  offline: "Can't reach the AI — check the internet and try again. No sparks were used.",
} as const;

class ArcadeFail extends Error {
  constructor(public kidMessage: string, detail?: string) {
    super(detail ?? kidMessage);
  }
}

/**
 * One robust model call: strict-JSON prompt, defensive parse, validation, one retry on a
 * bad/transient reply, model fallback, hard time budget. Throws ArcadeFail with a
 * kid-friendly message.
 */
async function callJSON<T>(opts: {
  tag: string;
  models: readonly string[];
  prompt: string;
  maxTokens: number;
  validate: (json: Record<string, unknown> | null) => T | null;
}): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ArcadeFail(MSG.noKey, "ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey, maxRetries: 0 });
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let modelIdx = 0;
  let tries = 0;
  let lastFail: string = MSG.generic;

  while (tries < 2 && modelIdx < opts.models.length) {
    const remaining = deadline - Date.now();
    if (remaining < 2_500) break;
    const model = opts.models[modelIdx];
    try {
      const msg = await client.messages.create(
        {
          model,
          max_tokens: opts.maxTokens,
          system: KID_SAFE_SYSTEM,
          messages: [{ role: "user", content: opts.prompt }],
        },
        { timeout: remaining },
      );
      const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const value = opts.validate(extractJsonObject(text));
      if (value !== null) return value;
      console.warn(`[arcade:${opts.tag}] unusable output from ${model} (stop=${msg.stop_reason})`);
      lastFail = MSG.bad;
      tries++;
    } catch (err) {
      const canFallBack = modelIdx < opts.models.length - 1;
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        console.error(`[arcade:${opts.tag}] API key rejected (${err.status})`);
        throw new ArcadeFail(MSG.noKey, "API key rejected");
      }
      if ((err instanceof Anthropic.NotFoundError || err instanceof Anthropic.BadRequestError) && canFallBack) {
        console.warn(`[arcade:${opts.tag}] ${model} rejected (${err.status}); falling back`);
        modelIdx++;
        continue;
      }
      if (err instanceof Anthropic.APIConnectionTimeoutError) lastFail = MSG.slow;
      else if (err instanceof Anthropic.APIConnectionError) lastFail = MSG.offline;
      else if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) lastFail = MSG.busy;
      else {
        console.error(`[arcade:${opts.tag}]`, err instanceof Error ? err.message : err);
        throw new ArcadeFail(MSG.generic);
      }
      console.warn(`[arcade:${opts.tag}] transient error on ${model}:`, err instanceof Error ? err.message : err);
      tries++;
    }
  }
  throw new ArcadeFail(lastFail);
}

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof ArcadeFail) return { ok: false, error: err.kidMessage };
  console.error("[arcade]", err instanceof Error ? err.message : err);
  return { ok: false, error: MSG.generic };
}

// ---------------------------------------------------------------------------
// Sparks: check BEFORE the AI call, charge only AFTER it succeeded.
// ---------------------------------------------------------------------------

async function readSparks(kidId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("kids").select("sparks_balance").eq("id", kidId).maybeSingle();
  return data ? (data.sparks_balance ?? 0) : null;
}

/**
 * The caller must be signed in AND the kid must be in the caller's own family. RLS alone is
 * not enough: the "kids: friend read" policy lets a family READ an accepted friend's kid row,
 * so without this check one family could play on another family's sparks (the charge then
 * silently fails RLS and the game is free). Every AI call goes through here (cost 0 for
 * free / follow-up turns) so anonymous callers can't burn the API key either.
 */
async function requireSparks(kidId: string | null | undefined, cost: number): Promise<string> {
  if (!kidId || typeof kidId !== "string") throw new ArcadeFail("Pick your player first, then come back to play!");
  const supabase = await createClient();
  const { data: familyId } = await supabase.rpc("current_family_id");
  if (!familyId) throw new ArcadeFail("Ask a grown-up to sign in, then come back to play!");
  const { data: kid } = await supabase
    .from("kids")
    .select("sparks_balance")
    .eq("id", kidId)
    .eq("family_id", familyId)
    .maybeSingle();
  if (!kid) throw new ArcadeFail("Couldn't find your player — go back and try again.");
  const sparks = kid.sparks_balance ?? 0;
  if (sparks < cost) {
    throw new ArcadeFail(`You need ${cost} ⚡ sparks for this game — swap some ⭐ stars for sparks in the Arcade!`);
  }
  return kidId;
}

/** Compare-and-set so two quick taps can't both spend the same sparks. Returns the new balance. */
async function chargeSparks(kidId: string, cost: number): Promise<number | undefined> {
  const supabase = await createClient();
  for (let i = 0; i < 3; i++) {
    const current = await readSparks(kidId);
    if (current === null) return undefined;
    const next = Math.max(0, current - cost);
    const { data, error } = await supabase
      .from("kids")
      .update({ sparks_balance: next })
      .eq("id", kidId)
      .eq("sparks_balance", current)
      .select("sparks_balance");
    if (error) {
      console.error("[arcade] charge failed:", error.message);
      return undefined;
    }
    if (data && data.length > 0) {
      revalidatePath("/play/arcade");
      return next;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// convertStarsToSparks
// ---------------------------------------------------------------------------

export async function convertStarsToSparks(
  kidId: string,
  stars: number,
): Promise<ArcadeResult> {
  if (!Number.isInteger(stars) || stars < 1) return { ok: false, error: "Enter at least 1 star" };
  try {
    await requireSparks(kidId, 0); // own family's kid only (friends' kid rows are readable)
  } catch (err) {
    return fail(err);
  }

  const supabase = await createClient();

  const { data: kidRow, error: fetchErr } = await supabase
    .from("kids")
    .select("points_balance, sparks_balance")
    .eq("id", kidId)
    .maybeSingle();

  if (fetchErr || !kidRow) return { ok: false, error: "Kid not found" };

  if ((kidRow.points_balance ?? 0) < stars) {
    return { ok: false, error: "Not enough stars" };
  }

  const { error: decrErr } = await supabase.rpc("decrement_kid_points", {
    p_kid_id: kidId,
    p_amount: stars,
  });
  if (decrErr) return { ok: false, error: decrErr.message };

  const currentSparks: number = kidRow.sparks_balance ?? 0;
  const { error: updateErr } = await supabase
    .from("kids")
    .update({ sparks_balance: currentSparks + stars * 5 })
    .eq("id", kidId);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath("/play/arcade");
  return { ok: true, data: undefined };
}

// spendSparks / awardArcadeStars were removed: nothing called them, and as exported server
// actions they let any client spend sparks or mint unlimited stars for any readable kid id.

// ---------------------------------------------------------------------------
// Emoji Story — choose-your-path. Part 1 costs 1 spark; the ending is free.
// ---------------------------------------------------------------------------

const EMOJI_MAX = 5;

export async function generateEmojiStory(
  emojis: string[],
  kidId: string | null,
  opts?: { style?: string; hero?: string },
): Promise<ArcadeResult<StoryStart>> {
  try {
    const id = await requireSparks(kidId, 1);
    const list = (Array.isArray(emojis) ? emojis : []).map((e) => sanitizeKidText(e, 8)).filter(Boolean).slice(0, EMOJI_MAX);
    if (list.length < 3) return { ok: false, error: "Pick at least 3 emojis first!" };
    const style = sanitizeKidText(opts?.style, 40) || pick(STORY_GENRES);
    const data = await callJSON({
      tag: "story-start",
      models: [MODEL_FAST],
      prompt: storyStartPrompt({ emojis: list, style, hero: sanitizeKidText(opts?.hero, 24), seed: freshSeed() }),
      maxTokens: 900,
      validate: validateStoryStart,
    });
    const sparks = await chargeSparks(id, 1);
    return { ok: true, data, sparks };
  } catch (err) {
    return fail(err);
  }
}

export async function continueEmojiStory(input: {
  emojis: string[];
  title: string;
  paragraphs: string[];
  choice: string;
  hero?: string;
  kidId?: string | null;
}): Promise<ArcadeResult<StoryEnd>> {
  try {
    // free, but only for a signed-in family's own kid (stops anonymous API-cost abuse)
    await requireSparks(input?.kidId, 0);
    const data = await callJSON({
      tag: "story-end",
      models: [MODEL_FAST],
      prompt: storyEndPrompt({
        emojis: (input.emojis ?? []).map((e) => sanitizeKidText(e, 8)).slice(0, EMOJI_MAX),
        title: sanitizeKidText(input.title, 80),
        story: (input.paragraphs ?? []).map((p) => sanitizeKidText(p, 700)).slice(0, 4),
        choice: sanitizeKidText(input.choice, 140),
        hero: sanitizeKidText(input.hero, 24),
      }),
      maxTokens: 700,
      validate: validateStoryEnd,
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Would You Rather — one call makes a whole 5-round pack (2 sparks), including the AI's
// counter-arguments, so rounds flow instantly with no waiting between them.
// ---------------------------------------------------------------------------

export async function generateWouldYouRather(
  kidId: string | null,
  avoid?: string[],
): Promise<ArcadeResult<{ rounds: WyrRound[] }>> {
  try {
    const id = await requireSparks(kidId, 2);
    const rounds = await callJSON({
      tag: "wyr",
      models: [MODEL_FAST],
      prompt: wyrPackPrompt({
        topics: sample(WYR_TOPICS, 4),
        seed: freshSeed(),
        avoid: (avoid ?? []).map((a) => sanitizeKidText(a, 80)).filter(Boolean),
        rounds: WYR_ROUNDS,
      }),
      maxTokens: 1600,
      validate: (j) => validateWyrPack(j, 3),
    });
    const sparks = await chargeSparks(id, 2);
    return { ok: true, data: { rounds: rounds.slice(0, WYR_ROUNDS) }, sparks };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// What Am I? — 1 spark
// ---------------------------------------------------------------------------

const WHATAMI_CATEGORIES = ["animal", "food", "place", "vehicle"] as const;

export async function generateWhatAmI(
  category: string,
  kidId: string | null,
  avoid?: string[],
): Promise<ArcadeResult<ClueRound>> {
  try {
    const cat = (WHATAMI_CATEGORIES as readonly string[]).includes(category) ? category : "animal";
    const id = await requireSparks(kidId, 1);
    const flavors = WHATAMI_FLAVORS[cat] ?? [];
    const data = await callJSON({
      tag: "whatami",
      models: [MODEL_FAST],
      prompt: whatAmIPrompt({
        category: cat,
        flavor: flavors.length ? pick(flavors) : "",
        seed: freshSeed(),
        avoid: (avoid ?? []).map((a) => sanitizeKidText(a, 40)).filter(Boolean),
      }),
      maxTokens: 700,
      validate: (j) => validateClueRound(j),
    });
    const sparks = await chargeSparks(id, 1);
    return { ok: true, data, sparks };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Word Detective — 1 spark
// ---------------------------------------------------------------------------

export async function generateWordDetective(
  kidId: string | null,
  avoid?: string[],
): Promise<ArcadeResult<ClueRound & { theme: string }>> {
  try {
    const id = await requireSparks(kidId, 1);
    const theme = pick(WORD_THEMES);
    const data = await callJSON({
      tag: "word",
      models: [MODEL_FAST],
      prompt: wordDetectivePrompt({
        theme,
        seed: freshSeed(),
        avoid: (avoid ?? []).map((a) => sanitizeKidText(a, 40)).filter(Boolean),
      }),
      maxTokens: 700,
      validate: (j) => validateClueRound(j, { singleWord: true }),
    });
    const sparks = await chargeSparks(id, 1);
    return { ok: true, data: { ...data, answer: data.answer.toLowerCase(), theme }, sparks };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Stump The AI — 20 questions, up to 3 guesses. 3 sparks, charged on the first turn.
// ---------------------------------------------------------------------------

const STUMP_ANSWERS: readonly StumpAnswer[] = ["Yes", "No", "Sometimes", "Not sure"];
const STUMP_CATEGORIES =["Animals", "Foods", "Household Items", "Sports & Hobbies", "Cartoon & Story Characters", "Anything!"] as const;

export async function askStumpQuestion(
  category: string,
  turns: StumpTurn[],
  kidId?: string | null,
): Promise<ArcadeResult<StumpMove>> {
  try {
    const cat = (STUMP_CATEGORIES as readonly string[]).includes(category) ? category : "Anything!";
    const history: StumpTurn[] = (Array.isArray(turns) ? turns : []).slice(0, 25).map((t) => ({
      kind: t?.kind === "guess" ? "guess" : "question",
      text: sanitizeKidText(t?.text, 160),
      answer: STUMP_ANSWERS.includes(t?.answer) ? t.answer : "Not sure",
    }));
    const isFirstTurn = history.length === 0;
    const progress = stumpProgress(history);
    if (progress.kidWon) return { ok: false, error: "This game is already over — start a new one!" };
    // follow-up turns are free but still need a signed-in family's own kid
    const id = await requireSparks(kidId, isFirstTurn ? 3 : 0);
    const data = await callJSON({
      tag: "stump",
      models: [MODEL_SMART, MODEL_FAST],
      prompt: stumpPrompt({
        category: cat === "Anything!" ? "anything a kid would know (an animal, object, food, place or character)" : cat,
        turns: history,
        opener: isFirstTurn ? pick(STUMP_OPENERS) : "",
        mustGuess: progress.mustGuess,
      }),
      maxTokens: 300,
      validate: (j) => validateStumpMove(j, progress.mustGuess),
    });
    const sparks = isFirstTurn ? await chargeSparks(id, 3) : undefined;
    return { ok: true, data, sparks };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// AI Lie Detector — up to 3 questions, then an accusation. 2 sparks, charged on the first turn.
// ---------------------------------------------------------------------------

export async function askLieDetectorQuestion(
  statements: [string, string, string],
  qa: { q: string; a: string }[],
  kidId?: string | null,
): Promise<ArcadeResult<LieMove>> {
  try {
    const stmts = (Array.isArray(statements) ? statements : []).map((s) => sanitizeKidText(s, 120));
    if (stmts.length !== 3 || stmts.some((s) => s.length < 3)) {
      return { ok: false, error: "Write all 3 statements first!" };
    }
    const history = (Array.isArray(qa) ? qa : []).slice(0, LIE_MAX_QUESTIONS).map((x) => ({ q: sanitizeKidText(x?.q, 240), a: sanitizeKidText(x?.a, 200) }));
    const isFirstTurn = history.length === 0;
    const mustGuess = history.length >= LIE_MAX_QUESTIONS;
    const id = await requireSparks(kidId, isFirstTurn ? 2 : 0);
    const data = await callJSON({
      tag: "lie",
      models: [MODEL_SMART, MODEL_FAST],
      prompt: liePrompt({ statements: stmts, qa: history, mustGuess }),
      maxTokens: 350,
      validate: (j) => validateLieMove(j, mustGuess, history.length < 2),
    });
    const sparks = isFirstTurn ? await chargeSparks(id, 2) : undefined;
    return { ok: true, data, sparks };
  } catch (err) {
    return fail(err);
  }
}
