"use server";

import Anthropic from "@anthropic-ai/sdk";
import { avoidNote, freshSeed, pick, TALKING_POINT_ANGLES } from "@/lib/arcade/variety";

const SYSTEM_PROMPT = `You are a friendly, creative assistant that helps families chat together. Children aged 5–12 will be playing alongside grown-ups.
Always follow these rules:
- Keep all content positive, safe, and age-appropriate
- No violence, weapons, scary content, or adult themes
- No mean-spirited humour, bullying, or body shaming
- No political, religious, or controversial topics
- Be warm, inclusive, and never embarrassing or sad
- Use simple, fun language everyone can understand
- Return raw JSON only. Do not wrap your response in markdown code fences.`;

export type TalkingPointResult =
  | { ok: true; data: { question: string; followups: string[]; together: string } }
  | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJSON(text: string): any {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(stripped);
}

export async function generateTalkingPoint(
  category: string,
  avoid?: string[],
): Promise<TalkingPointResult> {
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
    return { ok: true, data: parsed };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
