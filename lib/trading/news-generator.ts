import Anthropic from "@anthropic-ai/sdk";
import type { TradingAsset } from "@/lib/domain/types";

export async function generateNews(
  asset: TradingAsset,
  event: { text: string; impact: string },
): Promise<{ headline: string; body: string }> {
  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      messages: [{
        role: "user",
        content: `You write news for a kids stock trading game about ${asset.name} (${asset.industry}).

Event: ${event.text}

Write two things:
1. HEADLINE: A punchy, kid-friendly headline. Under 12 words. End with one relevant emoji. Don't make it obvious if it's good or bad news — kids should have to figure it out.
2. BODY: A 2-sentence news paragraph written like a real newspaper reporter. Describe what happened factually. Don't say whether it's good or bad for the stock price.

Return JSON only, no other text: {"headline": "...", "body": "..."}`,
      }],
    });
    const block = msg.content[0];
    if (block.type !== "text") throw new Error("no text");
    const parsed = JSON.parse(block.text.trim());
    return {
      headline: typeof parsed.headline === "string" ? parsed.headline.trim() : event.text,
      body: typeof parsed.body === "string" ? parsed.body.trim() : "",
    };
  } catch {
    return { headline: event.text, body: "" };
  }
}
