"use server";

// AI Arcade server actions: every call is auth-gated (the caller's own-family kid) and paid
// in sparks (checked BEFORE the AI call, charged only AFTER it succeeded). The AI steps
// themselves live in lib/arcade/engine.ts, shared with the play-test endpoint.
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ArcadeFail, MSG } from "@/lib/arcade/ai";
import {
  cleanStumpTurns,
  runDoodleLook,
  runMysteryAsk,
  runMysteryNew,
  runMysteryReveal,
  runStoryEnd,
  runStoryStart,
  runStump,
  runWhatAmI,
} from "@/lib/arcade/engine";
import { sanitizeKidText } from "@/lib/arcade/json";
import { arcadeSecret, markUsedOnce, openToken, releaseUsed, sealToken } from "@/lib/arcade/token";
import type { ClueRound, StoryEnd, StoryStart, StumpMove } from "@/lib/arcade/validate";
import type { StumpTurn } from "@/lib/arcade/rules";
import {
  coerceDifficulty,
  DOODLE_MAX_CALLS_PER_WORD,
  DOODLE_SPARK_COST,
  DOODLE_WORDS_PER_ROUND,
  findDoodleMatch,
  findDoodleWord,
  pickDoodleRound,
  type DoodleDifficulty,
} from "@/lib/arcade/doodle";
import {
  applyAsk,
  applySearch,
  canAsk,
  checkAccusation,
  coerceMysteryDifficulty,
  foundClues,
  MYSTERY_SPARK_COST,
  newMysteryState,
  publicCase,
  type Clue,
  type FoundClue,
  type MysteryState,
  type PublicCase,
  type Reveal,
  type Suspect,
  type SuspectReply,
} from "@/lib/arcade/mystery";

export type ArcadeResult<T = undefined> =
  | { ok: true; data: T; /** the kid's sparks after this call, when it changed */ sparks?: number }
  | { ok: false; error: string };

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

export async function generateEmojiStory(
  emojis: string[],
  kidId: string | null,
  opts?: { style?: string; hero?: string },
): Promise<ArcadeResult<StoryStart>> {
  try {
    const id = await requireSparks(kidId, 1);
    const data = await runStoryStart({ emojis, style: opts?.style, hero: opts?.hero });
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
    const data = await runStoryEnd(input);
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// What Am I? — 1 spark
// ---------------------------------------------------------------------------

export async function generateWhatAmI(
  category: string,
  kidId: string | null,
  avoid?: string[],
): Promise<ArcadeResult<ClueRound>> {
  try {
    const id = await requireSparks(kidId, 1);
    const data = await runWhatAmI(category, avoid);
    const sparks = await chargeSparks(id, 1);
    return { ok: true, data, sparks };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Stump The AI — 20 questions, up to 3 guesses. 3 sparks, charged on the first turn.
// ---------------------------------------------------------------------------

export async function askStumpQuestion(
  category: string,
  turns: StumpTurn[],
  kidId?: string | null,
): Promise<ArcadeResult<StumpMove>> {
  try {
    const isFirstTurn = cleanStumpTurns(turns).length === 0;
    // follow-up turns are free but still need a signed-in family's own kid
    const id = await requireSparks(kidId, isFirstTurn ? 3 : 0);
    const data = await runStump(category, turns);
    const sparks = isFirstTurn ? await chargeSparks(id, 3) : undefined;
    return { ok: true, data, sparks };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Sealed game state (Doodle Guess + Mystery Detective)
// ---------------------------------------------------------------------------

const SETUP_MSG = "This game needs a grown-up to finish setting it up (a server secret is missing). No sparks were used.";

function secretOrFail(): string {
  const secret = arcadeSecret();
  if (!secret) throw new ArcadeFail(SETUP_MSG, "no ARCADE_SECRET / fallback secret");
  return secret;
}

function newId(): string {
  return randomBytes(9).toString("base64url");
}

// ---------------------------------------------------------------------------
// Doodle Guess — rounds of 5 words. 2 sparks per round, charged after the AI's first look.
// The AI may look at most DOODLE_MAX_CALLS_PER_WORD times per word (counted in the token).
// ---------------------------------------------------------------------------

const DOODLE_TTL_MS = 30 * 60 * 1000;

interface DoodleRoundState {
  id: string;
  kid: string;
  words: string[];
  calls: number[];
  charged: boolean;
}

export interface DoodleRoundStart {
  token: string;
  difficulty: DoodleDifficulty;
  words: { word: string; emoji: string }[];
}

export interface DoodleLookResult {
  token: string;
  guesses: string[];
  line: string;
  /** index into `guesses` of the one that named the word, or -1 */
  matchIndex: number;
  looksLeft: number;
}

/** Deal a new round (no AI call yet, so nothing is charged here). */
export async function startDoodleRound(
  kidId: string | null,
  difficulty: string,
  avoid?: string[],
): Promise<ArcadeResult<DoodleRoundStart>> {
  try {
    const secret = secretOrFail();
    const id = await requireSparks(kidId, DOODLE_SPARK_COST);
    const d = coerceDifficulty(difficulty);
    const words = pickDoodleRound(d, (Array.isArray(avoid) ? avoid : []).map((a) => sanitizeKidText(a, 40)).slice(0, 40));
    const state: DoodleRoundState = { id: newId(), kid: id, words: words.map((w) => w.word), calls: words.map(() => 0), charged: false };
    return {
      ok: true,
      data: { token: sealToken(state, secret, "doodle", DOODLE_TTL_MS), difficulty: d, words: words.map((w) => ({ word: w.word, emoji: w.emoji })) },
    };
  } catch (err) {
    return fail(err);
  }
}

/** One live AI look at the drawing for word `wordIndex`. */
export async function lookAtDoodle(input: {
  kidId: string | null;
  token: string;
  wordIndex: number;
  imageBase64: string;
  previous?: string[];
  final?: boolean;
}): Promise<ArcadeResult<DoodleLookResult>> {
  let guard: string | null = null;
  try {
    const secret = secretOrFail();
    const state = openToken<DoodleRoundState>(input?.token, secret, "doodle");
    if (!state) throw new ArcadeFail("This round has expired — start a new one!");
    const wi = Number(input.wordIndex);
    if (!Number.isInteger(wi) || wi < 0 || wi >= Math.min(state.words.length, DOODLE_WORDS_PER_ROUND)) throw new ArcadeFail("That word isn't in this round.");
    const used = state.calls[wi] ?? 0;
    if (used >= DOODLE_MAX_CALLS_PER_WORD) throw new ArcadeFail("The AI has had all its looks at this one — on to the next word!");
    const id = await requireSparks(input.kidId, state.charged ? 0 : DOODLE_SPARK_COST);
    if (id !== state.kid) throw new ArcadeFail("This round belongs to another player.");
    guard = `doodle:${state.id}:${wi}:${used}`;
    if (!markUsedOnce(guard)) {
      guard = null;
      throw new ArcadeFail("The AI is already looking — hang on a sec!");
    }
    const target = findDoodleWord(state.words[wi]);
    if (!target) throw new ArcadeFail("That word isn't in this round.");
    const look = await runDoodleLook({ imageBase64: input.imageBase64, previous: input.previous, final: input.final === true, look: used + 1 });
    const sparks = state.charged ? undefined : await chargeSparks(id, DOODLE_SPARK_COST);
    const next: DoodleRoundState = { ...state, charged: true, calls: state.calls.map((c, i) => (i === wi ? c + 1 : c)) };
    return {
      ok: true,
      data: {
        token: sealToken(next, secret, "doodle", DOODLE_TTL_MS),
        guesses: look.guesses,
        line: look.line,
        matchIndex: findDoodleMatch(look.guesses, target),
        looksLeft: DOODLE_MAX_CALLS_PER_WORD - (used + 1),
      },
      sparks,
    };
  } catch (err) {
    if (guard) releaseUsed(guard);
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Mystery Detective — 3 sparks per case (charged once the case is written). Searching,
// questioning and accusing are free but limited by detective energy (in the sealed token).
// ---------------------------------------------------------------------------

const MYSTERY_TTL_MS = 3 * 60 * 60 * 1000;

export interface MysteryView {
  token: string;
  questionsLeft: number;
  searchesLeft: number;
}

export interface MysteryStart extends MysteryView {
  case: PublicCase;
}

export interface MysteryAccuseResult {
  correct: boolean;
  culprit: Suspect;
  accused: Suspect;
  motive: string;
  reveal: Reveal;
  /** every clue, now with which suspect it pointed at */
  clues: (Clue & { found: boolean })[];
}

function sealMystery(state: MysteryState, secret: string): MysteryView {
  return { token: sealToken(state, secret, "mystery", MYSTERY_TTL_MS), questionsLeft: state.questionsLeft, searchesLeft: state.searchesLeft };
}

/** Open the case token for this kid, or throw a kid-friendly error. */
async function openMystery(kidId: string | null | undefined, token: string): Promise<{ state: MysteryState; secret: string }> {
  const secret = secretOrFail();
  const state = openToken<MysteryState>(token, secret, "mystery");
  if (!state) throw new ArcadeFail("This case file has gone missing (it expired) — start a new case!");
  const id = await requireSparks(kidId, 0);
  if (id !== state.kid) throw new ArcadeFail("This case belongs to another detective.");
  return { state, secret };
}

export async function startMystery(kidId: string | null, difficulty: string): Promise<ArcadeResult<MysteryStart>> {
  try {
    const secret = secretOrFail();
    const id = await requireSparks(kidId, MYSTERY_SPARK_COST);
    const caseFile = await runMysteryNew(coerceMysteryDifficulty(difficulty));
    const state = newMysteryState(newId(), id, caseFile);
    const sparks = await chargeSparks(id, MYSTERY_SPARK_COST);
    return { ok: true, data: { ...sealMystery(state, secret), case: publicCase(caseFile) }, sparks };
  } catch (err) {
    return fail(err);
  }
}

export async function searchMystery(kidId: string | null, token: string, locationId: string): Promise<ArcadeResult<MysteryView & { clue: FoundClue }>> {
  try {
    const { state, secret } = await openMystery(kidId, token);
    const res = applySearch(state, String(locationId ?? ""));
    if (!res.ok) throw new ArcadeFail(res.error);
    // a search that spends energy advances the step; share the ask guard's key so an old
    // case token can't be replayed to search more places than the limit allows
    if (res.state.step !== state.step && !markUsedOnce(`mystery:${state.id}:${state.step}`)) {
      throw new ArcadeFail("That case file is out of date — use your latest one.");
    }
    return { ok: true, data: { ...sealMystery(res.state, secret), clue: res.value } };
  } catch (err) {
    return fail(err);
  }
}

export async function askMystery(
  kidId: string | null,
  token: string,
  suspectId: string,
  question: string,
): Promise<ArcadeResult<MysteryView & { reply: SuspectReply; suspectId: string; question: string }>> {
  let guard: string | null = null;
  try {
    const { state, secret } = await openMystery(kidId, token);
    const check = canAsk(state, String(suspectId ?? ""));
    if (!check.ok) throw new ArcadeFail(check.error);
    guard = `mystery:${state.id}:${state.step}`;
    if (!markUsedOnce(guard)) {
      guard = null;
      throw new ArcadeFail("That question was already asked — use your latest case file.");
    }
    const q = sanitizeKidText(question, 160);
    const reply = await runMysteryAsk({ caseFile: state.caseFile, suspectId, question: q, log: state.log });
    const next = applyAsk(state, { suspectId, question: q, answer: reply.answer, note: reply.note });
    return { ok: true, data: { ...sealMystery(next, secret), reply, suspectId, question: q } };
  } catch (err) {
    if (guard) releaseUsed(guard);
    return fail(err);
  }
}

export async function accuseMystery(
  kidId: string | null,
  token: string,
  suspectId: string,
  reason: string,
): Promise<ArcadeResult<MysteryAccuseResult>> {
  try {
    const { state } = await openMystery(kidId, token);
    if (state.done) throw new ArcadeFail("This case is closed — start a new one!");
    const c = state.caseFile;
    const accused = c.suspects.find((s) => s.id === suspectId);
    if (!accused) throw new ArcadeFail("Pick who you think did it!");
    if (!markUsedOnce(`mystery:${state.id}:accuse`)) throw new ArcadeFail("You've already made your accusation on this case!");
    const correct = checkAccusation(c, accused.id);
    const found = foundClues(state).map((f) => `${f.title}: ${f.text}`);
    const reveal = await runMysteryReveal({ caseFile: c, accusedId: accused.id, correct, reason, found });
    return {
      ok: true,
      data: {
        correct,
        accused,
        culprit: c.suspects.find((s) => s.id === c.culpritId)!,
        motive: c.motive,
        reveal,
        clues: c.clues.map((cl) => ({ ...cl, found: state.searched.includes(cl.location) })),
      },
    };
  } catch (err) {
    return fail(err);
  }
}
