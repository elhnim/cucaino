import Anthropic from "@anthropic-ai/sdk";
import type { TradingAsset } from "@/lib/domain/types";

export async function generateNewsHeadline(
  asset: TradingAsset,
  event: { text: string; impact: string },
): Promise<string> {
  const client = new Anthropic();
  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 40,
      messages: [{
        role: "user",
        content: `You write news headlines for a kids stock trading game. Rewrite this event about ${asset.name} (${asset.industry}) as a playful, kid-friendly headline. Under 12 words. End with one relevant emoji. Important: keep it intriguing — don't make it obvious whether it's good or bad news. Kids should have to think and decide for themselves!\nEvent: ${event.text}\nReturn only the headline.`,
      }],
    });
    return (msg.content[0] as { type: "text"; text: string }).text.trim();
  } catch {
    return event.text;
  }
}
