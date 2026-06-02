// Render-time, always-populated kid-safe news for Invest assets.
// No API key required (the AI/Finnhub path needs ANTHROPIC_API_KEY which we don't ship).
// Mirrors the proven templated approach used by Nugget Market (lib/trading/news-templates.ts):
// a deterministic per-(asset, day) pick from a pool, so news is stable within a day and varied
// across assets/days. Reuses the stock pool from trading; adds a small crypto-flavoured pool.

import { NEWS_TEMPLATES, seededRandom } from "@/lib/trading/news-templates";

type Line = { text: string; body: string; minPct: number; maxPct: number };

const CRYPTO_UP: Line[] = [
  { text: "More people start using {NAME}, and interest jumps {X}%", body: "More shops and apps said they would accept {NAME} this week, and lots of people became curious. When more people want something, its price can move quickly.", minPct: 3, maxPct: 18 },
  { text: "Big online community gets excited about {NAME}", body: "A large online community started talking about {NAME} all at once. Crypto can move fast when lots of people pay attention at the same time.", minPct: 3, maxPct: 18 },
  { text: "{NAME} network gets a helpful upgrade", body: "The team behind {NAME} shared an upgrade meant to make it faster or easier to use. News like this can get more builders and fans interested.", minPct: 3, maxPct: 15 },
];
const CRYPTO_DOWN: Line[] = [
  { text: "Some traders sell {NAME}, and the price cools {X}%", body: "After a busy run, some people decided to sell their {NAME}. Crypto prices can drop just as quickly as they rise.", minPct: 3, maxPct: 18 },
  { text: "Nervous mood spreads across crypto, {NAME} dips {X}%", body: "A cautious mood spread across many coins, and {NAME} slipped along with them. Crypto often moves up and down more than most stocks.", minPct: 3, maxPct: 18 },
  { text: "Fewer buyers today leaves {NAME} quieter", body: "There were fewer buyers for {NAME} today, so the price drifted lower. Quiet days are a normal part of how crypto works.", minPct: 3, maxPct: 14 },
];
const CRYPTO_FLAT: Line[] = [
  { text: "A calm day for {NAME} with little change", body: "{NAME} had a calm day without much movement. Not every day is exciting, and that is perfectly normal.", minPct: 0, maxPct: 2 },
  { text: "{NAME} holds steady as the market waits", body: "{NAME} stayed fairly steady while traders waited for bigger news. Sometimes prices pause before they move again.", minPct: 0, maxPct: 2 },
];

const STOCK_POS = ["sales_up", "product_hit"];
const STOCK_NEG = ["sales_down", "product_flop"];
const STOCK_NEU = ["neutral_news", "mixed_news"];

function pick<T>(arr: T[], seed: string): T {
  return arr[Math.floor(seededRandom(seed) * arr.length)] ?? arr[0];
}

export function assetNews(
  symbol: string,
  name: string,
  assetType: "stock" | "crypto",
  changePct: number,
  priceDate: string,
): { headline: string; body: string } {
  const seed = `${symbol}-${priceDate}`;
  const pctNum = Math.abs(Math.round(changePct * 100));

  if (assetType === "crypto") {
    const pool = changePct >= 0.005 ? CRYPTO_UP : changePct <= -0.005 ? CRYPTO_DOWN : CRYPTO_FLAT;
    const line = pick(pool, `${seed}-cl`);
    const x = Math.min(Math.max(pctNum || line.minPct + 1, line.minPct), line.maxPct);
    const fill = (s: string) => s.replace(/\{X\}/g, String(x)).replace(/\{NAME\}/g, name);
    return { headline: fill(line.text), body: fill(line.body) };
  }

  const cats = changePct >= 0.005 ? STOCK_POS : changePct <= -0.005 ? STOCK_NEG : STOCK_NEU;
  const cat = pick(cats, `${seed}-cat`);
  const tpl = pick(NEWS_TEMPLATES[cat], `${seed}-tpl`);
  const x = Math.min(Math.max(pctNum || tpl.minPct + 1, tpl.minPct), tpl.maxPct);
  const fill = (s: string) =>
    s.replace(/\{X\}/g, String(x)).replace(/\bThe company\b/g, name).replace(/\bthe company\b/g, name);
  return { headline: fill(tpl.text), body: fill(tpl.body) };
}
