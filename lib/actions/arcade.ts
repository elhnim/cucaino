"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are a friendly, creative assistant for children aged 5–12.
Always follow these rules:
- Keep all content positive, safe, and age-appropriate
- No violence, weapons, scary content, or adult themes
- No mean-spirited humour, bullying, or body shaming
- No political, religious, or controversial topics
- Always end stories and responses on an uplifting note
- Use simple, fun language suitable for children
- Be playful, warm, and encouraging at all times`;

export type ArcadeResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJSON(text: string): any {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(stripped);
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

  // Deduct stars
  const { error: decrErr } = await supabase.rpc("decrement_kid_points", {
    p_kid_id: kidId,
    p_amount: stars,
  });
  if (decrErr) return { ok: false, error: decrErr.message };

  // Credit sparks (5 sparks per star)
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
// spendSparks
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
// generateEmojiStory
// ---------------------------------------------------------------------------

export async function generateEmojiStory(
  emojis: string[],
): Promise<ArcadeResult<{ title: string; paragraphs: string[]; twist: string; moral: string }>> {
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Write a children's book story inspired by these 5 elements: ${emojis.join(" ")}

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
    return { ok: true, data: parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// generateWouldYouRather
// ---------------------------------------------------------------------------

export async function generateWouldYouRather(): Promise<
  ArcadeResult<{ option_a: string; option_b: string }>
> {
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Generate a funny, silly "Would You Rather" dilemma for kids aged 5-12.
Both options must be absurd, harmless, and equally funny — no embarrassing or mean choices.
Topics: food, animals, superpowers, school, space, everyday life.

Return valid JSON only:
{"option_a":"...","option_b":"..."}`,
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
// generateWouldYouRatherArgument
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
// generateWhatAmI
// ---------------------------------------------------------------------------

export async function generateWhatAmI(
  category: string,
): Promise<ArcadeResult<{ answer: string; clues: string[] }>> {
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Think of a ${category} that a child aged 5-12 would know.
Generate 5 clues about it, starting very cryptic and getting progressively more obvious.
The clues should be fun and indirect — don't mention the answer directly in any clue.

Return valid JSON only:
{"answer":"...","clues":["cryptic clue","...","...","...","most obvious clue"]}`,
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
// generateWordDetective
// ---------------------------------------------------------------------------

export async function generateWordDetective(): Promise<
  ArcadeResult<{ word: string; clues: string[] }>
> {
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Think of a fun word that a child aged 5-12 would know (not too easy, not too hard — examples: rainbow, submarine, volcano, telescope, butterfly).
Generate 5 clues that describe this word indirectly, starting very cryptic and getting progressively more obvious.
Never mention the word itself in the clues.

Return valid JSON only:
{"word":"...","clues":["most cryptic","...","...","...","most obvious"]}`,
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
// askStumpQuestion
// ---------------------------------------------------------------------------

export async function askStumpQuestion(
  category: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<ArcadeResult<{ type: "question" | "guess"; content: string }>> {
  try {
    const client = new Anthropic();
    const systemPrompt =
      SYSTEM_PROMPT +
      `\n\nYou are playing 20 questions. A child is thinking of a ${category}. Ask yes/no questions to figure out what it is. When you are confident enough OR have asked 10 questions, make your final guess starting with exactly: "My final guess is:". Otherwise ask one yes/no question. Return valid JSON only: {"type":"question","content":"your yes/no question"} OR {"type":"guess","content":"My final guess is: [answer]"}`;

    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      system: systemPrompt,
      messages,
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
// askLieDetectorQuestion
// ---------------------------------------------------------------------------

export async function askLieDetectorQuestion(
  statements: [string, string, string],
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<
  ArcadeResult<{
    type: "question" | "guess";
    content: string;
    guessedStatement?: 1 | 2 | 3;
  }>
> {
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
      system: systemPrompt,
      messages,
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
