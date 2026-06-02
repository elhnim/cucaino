import Anthropic from "@anthropic-ai/sdk";

export interface KidNews {
  headline: string;
  body: string;
  url: string | null;
}

type RawNews = { headline: string; summary: string; url?: string };

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function fetchKidNews(args: {
  symbol: string;
  name: string;
  assetType: "stock" | "crypto";
  sourceId: string;
}): Promise<KidNews | null> {
  try {
    const raw = await fetchRawNews(args);
    if (!raw) return null;
    const rewritten = await rewriteForKids(args.name, raw.headline, raw.summary);
    return { headline: rewritten.headline, body: rewritten.body, url: raw.url ?? null };
  } catch {
    return null;
  }
}

async function fetchRawNews(args: {
  symbol: string;
  name: string;
  assetType: "stock" | "crypto";
  sourceId: string;
}): Promise<RawNews | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  const url =
    args.assetType === "crypto"
      ? `https://finnhub.io/api/v1/news?category=crypto&token=${encodeURIComponent(key)}`
      : `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(args.sourceId)}&from=${isoDateOffset(-7)}&to=${isoDateOffset(0)}&token=${encodeURIComponent(key)}`;

  const res = await fetch(url, { next: { revalidate: 60 * 60 * 6 } });
  if (!res.ok) return null;

  const rows = (await res.json()) as Array<{
    headline?: string;
    summary?: string;
    url?: string;
    datetime?: number;
    related?: string;
  }>;

  const terms = [args.symbol.toLowerCase(), args.name.toLowerCase(), args.sourceId.toLowerCase()];
  const candidates = rows
    .filter((row) => row.headline && row.summary)
    .filter((row) => {
      if (args.assetType !== "crypto") return true;
      const haystack = `${row.headline} ${row.summary} ${row.related ?? ""}`.toLowerCase();
      return terms.some((term) => haystack.includes(term));
    })
    .sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0));

  const picked = candidates[0];
  if (!picked?.headline || !picked.summary) return null;
  return { headline: picked.headline, summary: picked.summary, url: picked.url };
}

async function rewriteForKids(
  name: string,
  headline: string,
  summary: string,
): Promise<{ headline: string; body: string }> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 220,
    system:
      "Rewrite business news for children aged 8-12. Keep it factual, calm, kid-safe, and short. Do not give buy/sell advice or say whether the news is good or bad for the price. Return raw JSON only.",
    messages: [
      {
        role: "user",
        content: `Company or asset: ${name}
Headline: ${headline}
Summary: ${summary}

Return JSON exactly like {"headline":"short kid-friendly headline","body":"two simple sentences explaining what happened"}`,
      },
    ],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("No text response");
  const parsed = JSON.parse(block.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  if (!parsed.headline || !parsed.body) throw new Error("Invalid news rewrite");
  return { headline: String(parsed.headline), body: String(parsed.body) };
}
