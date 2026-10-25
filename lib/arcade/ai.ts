/**
 * The one robust model call behind every AI Arcade game (server only — it reads the API key).
 * No auth, no sparks, no Supabase: the server actions (lib/actions/arcade.ts) add those, and
 * the play-test endpoint (app/api/arcade-playtest) calls the same game steps without them.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ImageBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages/messages";
import { extractJsonObject } from "./json";
import { KID_SAFE_SYSTEM } from "./prompts";

// Haiku 4.5 for the fast one-shot generators and live doodle guessing (vision, ~2s).
// Sonnet 5 for games that need real reasoning or consistency (20 Questions deduction, a
// whodunit whose suspects must never contradict the hidden solution). If the Sonnet id is
// ever unavailable we fall back to Haiku instead of breaking the game.
export const MODEL_FAST = "claude-haiku-4-5-20251001";
export const MODEL_SMART = "claude-sonnet-5";

/** Netlify's server handler is killed at 26s (netlify.toml) — stay well inside it. */
export const TOTAL_BUDGET_MS = 21_000;

export const MSG = {
  noKey: "The AI Arcade is having a nap 😴 A grown-up needs to switch it on (it needs an AI key). No sparks were used.",
  busy: "The AI is super busy right now 🐝 Try again in a moment — no sparks were used.",
  slow: "The AI took too long to think 🐢 Try again — no sparks were used.",
  bad: "The AI got its words in a muddle 🤪 Try again — no sparks were used.",
  generic: "Something went wobbly 🙈 Try again — no sparks were used.",
  offline: "Can't reach the AI — check the internet and try again. No sparks were used.",
} as const;

export class ArcadeFail extends Error {
  constructor(public kidMessage: string, detail?: string) {
    super(detail ?? kidMessage);
  }
}

export type PromptPart = { text: string } | { imagePngBase64: string };

export interface CallTrace {
  model: string;
  /** raw text of every attempt, in order (for the play-test endpoint) */
  raw: string[];
  ms: number;
}

/**
 * Strict-JSON prompt, defensive parse, validation, one retry on a bad/transient reply,
 * model fallback on 400/404, hard time budget. Throws ArcadeFail with a kid-friendly message.
 */
export async function callJSON<T>(opts: {
  tag: string;
  models: readonly string[];
  prompt: string | PromptPart[];
  maxTokens: number;
  validate: (json: Record<string, unknown> | null) => T | null;
  budgetMs?: number;
  /** cap on a single attempt, so a slow first model still leaves time for the fallback */
  attemptTimeoutMs?: number;
  /** on a bad or slow reply, retry with the NEXT model rather than the same one */
  fallbackOnFail?: boolean;
  /** filled in as the call goes (the play-test endpoint shows it) */
  trace?: CallTrace;
}): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ArcadeFail(MSG.noKey, "ANTHROPIC_API_KEY is not set");

  const started = Date.now();
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  const deadline = started + Math.min(opts.budgetMs ?? TOTAL_BUDGET_MS, TOTAL_BUDGET_MS);
  const content: string | (TextBlockParam | ImageBlockParam)[] =
    typeof opts.prompt === "string"
      ? opts.prompt
      : opts.prompt.map((p) =>
          "text" in p
            ? ({ type: "text", text: p.text } as TextBlockParam)
            : ({ type: "image", source: { type: "base64", media_type: "image/png", data: p.imagePngBase64 } } as ImageBlockParam),
        );
  let modelIdx = 0;
  let tries = 0;
  let lastFail: string = MSG.generic;

  while (tries < 2 && modelIdx < opts.models.length) {
    const remaining = deadline - Date.now();
    if (remaining < 2_500) break;
    const model = opts.models[modelIdx];
    const isLastModel = modelIdx >= opts.models.length - 1;
    const timeout = opts.attemptTimeoutMs && !isLastModel ? Math.min(remaining, opts.attemptTimeoutMs) : remaining;
    if (opts.trace) opts.trace.model = model;
    try {
      const msg = await client.messages.create(
        {
          model,
          max_tokens: opts.maxTokens,
          system: KID_SAFE_SYSTEM,
          messages: [{ role: "user", content }],
        },
        { timeout },
      );
      const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      if (opts.trace) {
        opts.trace.raw.push(text);
        opts.trace.ms = Date.now() - started;
      }
      const value = opts.validate(extractJsonObject(text));
      if (value !== null) return value;
      console.warn(`[arcade:${opts.tag}] unusable output from ${model} (stop=${msg.stop_reason})`);
      lastFail = MSG.bad;
      tries++;
      if (opts.fallbackOnFail && !isLastModel) modelIdx++;
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
        throw new ArcadeFail(MSG.generic, err instanceof Error ? err.message : String(err));
      }
      console.warn(`[arcade:${opts.tag}] transient error on ${model}:`, err instanceof Error ? err.message : err);
      tries++;
      if (opts.fallbackOnFail && !isLastModel) modelIdx++;
    }
  }
  if (opts.trace) opts.trace.ms = Date.now() - started;
  throw new ArcadeFail(lastFail);
}
