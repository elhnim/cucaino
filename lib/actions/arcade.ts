"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  avoidNote,
  freshSeed,
  pick,
  sample,
  STORY_GENRES,
  STUMP_OPENERS,
  TALKING_POINT_ANGLES,
  WHATAMI_FLAVORS,
  WORD_THEMES,
  WYR_TOPICS,
} from "@/lib/arcade/variety";

const SYSTEM_PROMPT = `You are a friendly, creative assistant for children aged 5–12.
Always follow these rules:
- Keep all content positive, safe, and age-appropriate
- No violence, weapons, scary content, or adult themes
- No mean-spirited humour, bullying, or body shaming
- No political, religious, or controversial topics
- Always end stories and responses on an uplifting note
- Use simple, fun language suitable for children
- Be playful, warm, and encouraging at all times
- Return raw JSON only. Do not wrap your response in markdown code fences.`;

export type ArcadeResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJSON(text: string): any {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(stripped);
}

// Deduct sparks AFTER a successful game call (no validation — UI guards entry)
async function deductSparks(kidId: string, amount: number): Promise<void> {
  const supabase = await createClient();
  const { data: kidRow } = await supabase
    .from("kids")
    .select("sparks_balance")
    .eq("id", kidId)
    .maybeSingle();
  const current: number = (kidRow as any)?.sparks_balance ?? 0;
  await supabase
    .from("kids")
    .update({ sparks_balance: Math.max(0, current - amount) })
    .eq("id", kidId);
  revalidatePath("/play/arcade");
}

// ---------------------------------------------------------------------------
// convertStarsToSparks
// ---------------------------------------------------------------------------

export async function convertStarsToSparks(
  kidId: string,
  stars: number,
): Promise<ArcadeResult> {
  if (stars < 1) return { ok: false, error: "Enter at least 1 star" };

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

  const currentSparks: number = (kidRow as any).sparks_balance ?? 0;
  const { error: updateErr } = await supabase
    .from("kids")
    .update({ sparks_balance: currentSparks + stars * 5 })
    .eq("id", kidId);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath("/play/arcade");
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// spendSparks (kept for legacy / manual use)
// ---------------------------------------------------------------------------

export async function spendSparks(
  kidId: string,
  amount: number,
): Promise<ArcadeResult> {
  const supabase = await createClient();

  const { data: kidRow, error: fetchErr } = await supabase
    .from("kids")
    .select("sparks_balance")
    .eq("id", kidId)
    .maybeSingle();

  if (fetchErr || !kidRow) return { ok: false, error: "Kid not found" };

  const currentSparks: number = (kidRow as any).sparks_balance ?? 0;
  if (currentSparks < amount) {
    return { ok: false, error: "Not enough Sparks" };
  }

  const { error: updateErr } = await supabase
    .from("kids")
    .update({ sparks_balance: currentSparks - amount })
    .eq("id", kidId);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath("/play/arcade");
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// awardArcadeStars
// ---------------------------------------------------------------------------

export async function awardArcadeStars(
  kidId: string,
  amount: number,
): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("increment_kid_points", {
    p_kid_id: kidId,
    p_amount: amount,
  });
  revalidatePath("/play/arcade");
}

// ---------------------------------------------------------------------------
// generateEmojiStory — deducts 1 spark AFTER success
// ---------------------------------------------------------------------------

export async function generateEmojiStory(
  emojis: string[],
  kidId: string | null,
): Promise<ArcadeResult<{ title: string; paragraphs: string[]; twist: string; moral: string }>> {
  try {
    const client = new Anthropic();
    const genre = pick(STORY_GENRES);
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      temperature: 1,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Write a children's book story inspired by these 5 elements: ${emojis.join(" ")}
Tell it as ${genre}, with fresh characters and an unexpected setting. (variety: ${freshSeed()})

Requirements:
- Title: a fun, catchy name for the story
- Story: exactly 5 paragraphs, each with exactly 2 sentences
- The story should be funny, light-hearted and positive
- Include a surprising twist near the end
- End with a warm moral lesson (one sentence)
- Write in flowing prose like a real children's book — NOT a poem
- Do NOT include the emojis in the story text

Return valid JSON only, no markdown:
{"title":"...","paragraphs":["para1","para2","para3","para4","para5"],"twist":"...","moral":"..."}`,
        },
      ],
    });
    const block = msg.content[0];
    if (block.type !== "text") throw new Error("no text block");
    const parsed = parseJSON(block.text);
    if (kidId) await deductSparks(kidId, 1);
    return { ok: true, data: parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// generateWouldYouRather — deducts 2 sparks AFTER success
// ---------------------------------------------------------------------------

export async function generateWouldYouRather(
  kidId: string | null,
  avoid?: string[],
): Promise<ArcadeResult<{ option_a: string; option_b: string }>> {
  try {
    const client = new Anthropic();
    const [topicA, topicB] = sample(WYR_TOPICS, 2);
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      temperature: 1,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Generate a funny, silly "Would You Rather" dilemma for kids aged 5-12.
Build this one around: ${topicA} and ${topicB}. (variety: ${freshSeed()})
Both options must be absurd, harmless, and equally funny — no embarrassing or mean choices.
Make it fresh and unexpected — not a common or obvious dilemma.${avoidNote(avoid)}

Return valid JSON only:
{"option_a":"...","option_b":"..."}`,
        },
      ],
    });
    const block = msg.content[0];
    if (block.type !== "text") throw new Error("no text block");
    const parsed = parseJSON(block.text);
    if (kidId) await deductSparks(kidId, 2);
    return { ok: true, data: parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// generateWouldYouRatherArgument — free (sparks already charged at step 1)
// ---------------------------------------------------------------------------

export async function generateWouldYouRatherArgument(
  chosen: string,
  rejected: string,
): Promise<ArcadeResult<{ argument: string }>> {
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      temperature: 1,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `A kid chose "${chosen}" over "${rejected}" in a Would You Rather game.
Write a funny 2-3 sentence argument defending "${rejected}" — trying to convince them they made the wrong choice.
Be playful and silly, never mean or insulting.

Return valid JSON only:
{"argument":"..."}`,
        },
      ],
    });
    const block = msg.content[0];
    if (block.type !== "text") throw new Error("no text block");
    const parsed = parseJSON(block.text);
    return { ok: true, data: parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// generateWhatAmI — deducts 1 spark AFTER success
// ---------------------------------------------------------------------------

export async function generateWhatAmI(
  category: string,
  kidId: string | null,
  avoid?: string[],
): Promise<ArcadeResult<{ answer: string; clues: string[] }>> {
  try {
    const client = new Anthropic();
    const flavors = WHATAMI_FLAVORS[category] ?? [];
    const flavor = flavors.length ? pick(flavors) : "";
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      temperature: 1,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Think of a ${category} that a child aged 5-12 would know.
${flavor ? `Lean towards ${flavor}. ` : ""}Surprise me — avoid the most obvious choice. (variety: ${freshSeed()})
Generate 5 clues about it, starting very cryptic and getting progressively more obvious.
The clues should be fun and indirect — don't mention the answer directly in any clue.${avoidNote(avoid)}

Return valid JSON only:
{"answer":"...","clues":["cryptic clue","...","...","...","most obvious clue"]}`,
        },
      ],
    });
    const block = msg.content[0];
    if (block.type !== "text") throw new Error("no text block");
    const parsed = parseJSON(block.text);
    if (kidId) await deductSparks(kidId, 1);
    return { ok: true, data: parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// generateWordDetective — deducts 1 spark AFTER success
// ---------------------------------------------------------------------------

export async function generateWordDetective(
  kidId: string | null,
  avoid?: string[],
): Promise<ArcadeResult<{ word: string; clues: string[] }>> {
  try {
    const client = new Anthropic();
    const theme = pick(WORD_THEMES);
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      temperature: 1,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Think of a fun word that a child aged 5-12 would know (not too easy, not too hard — examples: rainbow, submarine, volcano, telescope, butterfly).
Pick a word connected to: ${theme}. Choose a fresh, surprising one. (variety: ${freshSeed()})
Generate 5 clues that describe this word indirectly, starting very cryptic and getting progressively more obvious.
Never mention the word itself in the clues.${avoidNote(avoid)}

Return valid JSON only:
{"word":"...","clues":["most cryptic","...","...","...","most obvious"]}`,
        },
      ],
    });
    const block = msg.content[0];
    if (block.type !== "text") throw new Error("no text block");
    const parsed = parseJSON(block.text);
    if (kidId) await deductSparks(kidId, 1);
    return { ok: true, data: parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// generateTalkingPoint — deducts 1 spark AFTER success
// A warm family conversation starter (main question + follow-ups + group twist)
// ---------------------------------------------------------------------------

export async function generateTalkingPoint(
  category: string,
  kidId: string | null,
  avoid?: string[],
): Promise<ArcadeResult<{ question: string; followups: string[]; together: string }>> {
  try {
    const client = new Anthropic();
    const angles = TALKING_POINT_ANGLES[category] ?? [];
    const angle = angles.length ? pick(angles) : "";
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 350,
      temperature: 1,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Create a warm, fun "talking point" — a conversation starter a whole family (kids and grown-ups together) can chat about at the dinner table or in the car.
Theme: ${category}.${angle ? ` Lean towards ${angle}.` : ""} Make it fresh and unexpected. (variety: ${freshSeed()})

Requirements:
- One main question everyone can answer — open-ended and easy for a 5-12 year old to understand, but still interesting for grown-ups
- Exactly 3 short follow-up questions to keep the conversation flowing
- One playful "together" idea: a quick group twist (e.g. "Everyone answer in one word first, then explain!")
- Keep it positive, inclusive, and never embarrassing or sad${avoidNote(avoid)}

Return valid JSON only:
{"question":"...","followups":["...","...","..."],"together":"..."}`,
        },
      ],
    });
    const block = msg.content[0];
    if (block.type !== "text") throw new Error("no text block");
    const parsed = parseJSON(block.text);
    if (kidId) await deductSparks(kidId, 1);
    return { ok: true, data: parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// askStumpQuestion — deducts 3 sparks on first turn AFTER success
// Bug fix: injects starter user message when messages is empty (Anthropic requires ≥1 message)
// ---------------------------------------------------------------------------

export async function askStumpQuestion(
  category: string,
  messages: { role: "user" | "assistant"; content: string }[],
  kidId?: string | null,
): Promise<ArcadeResult<{ type: "question" | "guess"; content: string }>> {
  const isFirstTurn = messages.length === 0;
  const apiMessages = isFirstTurn
    ? [{ role: "user" as const, content: `I've thought of a ${category}. Ask your first yes/no question.` }]
    : messages;

  try {
    const client = new Anthropic();
    const opener = isFirstTurn ? pick(STUMP_OPENERS) : "";
    const systemPrompt =
      SYSTEM_PROMPT +
      `\n\nYou are playing 20 questions. A child is thinking of a ${category}. Ask yes/no questions to figure out what it is. When you are confident enough OR have asked 10 questions, make your final guess starting with exactly: "My final guess is:". Otherwise ask one yes/no question.` +
      (opener ? ` For your FIRST question, start by exploring ${opener} — don't always open the same way.` : "") +
      ` Return valid JSON only: {"type":"question","content":"your yes/no question"} OR {"type":"guess","content":"My final guess is: [answer]"}`;

    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      temperature: 1,
      system: systemPrompt,
      messages: apiMessages,
    });
    const block = msg.content[0];
    if (block.type !== "text") throw new Error("no text block");
    const parsed = parseJSON(block.text);
    if (isFirstTurn && kidId) await deductSparks(kidId, 3);
    return { ok: true, data: parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// askLieDetectorQuestion — deducts 2 sparks on first turn AFTER success
// Bug fix: injects starter user message when messages is empty
// ---------------------------------------------------------------------------

export async function askLieDetectorQuestion(
  statements: [string, string, string],
  messages: { role: "user" | "assistant"; content: string }[],
  kidId?: string | null,
): Promise<
  ArcadeResult<{
    type: "question" | "guess";
    content: string;
    guessedStatement?: 1 | 2 | 3;
  }>
> {
  const isFirstTurn = messages.length === 0;
  const apiMessages = isFirstTurn
    ? [{ role: "user" as const, content: "I've entered my three statements. Ask your first question." }]
    : messages;

  try {
    const client = new Anthropic();
    const systemPrompt =
      SYSTEM_PROMPT +
      `\n\nA child has given you 3 statements about themselves, one of which is a lie. Your job is to figure out which one is false by asking follow-up questions. After at most 3 questions you MUST make a guess.

The statements are:
1. ${statements[0]}
2. ${statements[1]}
3. ${statements[2]}

If asking a question: {"type":"question","content":"your follow-up question"}
If guessing: {"type":"guess","content":"I think statement N is the lie!","guessedStatement":N}`;

    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      temperature: 1,
      system: systemPrompt,
      messages: apiMessages,
    });
    const block = msg.content[0];
    if (block.type !== "text") throw new Error("no text block");
    const parsed = parseJSON(block.text);
    if (isFirstTurn && kidId) await deductSparks(kidId, 2);
    return { ok: true, data: parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
