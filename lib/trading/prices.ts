import type { SupabaseClient } from "@supabase/supabase-js";
import { TRADING_ASSETS } from "./assets";
import { NEWS_TEMPLATES, CATEGORY_WEIGHTS, seededRandom } from "./news-templates";

/** UTC date string YYYY-MM-DD. The price table is global, so we key on UTC. */
function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function ensureDailyPrices(supabase: SupabaseClient): Promise<void> {
  const today = utcDateString(new Date());
  const yesterday = (() => {
    const d = new Date(today + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return utcDateString(d);
  })();

  // Proxy check: if CHOMP already has a row for today, prices are done
  const { data: existing } = await supabase
    .from("trading_asset_prices")
    .select("id")
    .eq("symbol", "CHOMP")
    .eq("price_date", today)
    .maybeSingle();
  if (existing) return;

  // Fetch all yesterday rows in one query
  const { data: yesterdayRows } = await supabase
    .from("trading_asset_prices")
    .select("symbol, price_nuggets, event_pct")
    .eq("price_date", yesterday);

  const yesterdayMap = new Map<string, { price: number; eventPct: number }>();
  for (const row of yesterdayRows ?? []) {
    yesterdayMap.set(row.symbol, {
      price: row.price_nuggets,
      eventPct: row.event_pct ?? 0,
    });
  }

  const rows = TRADING_ASSETS.map((asset) => {
    const prev = yesterdayMap.get(asset.symbol);
    const prevPrice = prev?.price ?? asset.basePriceNuggets;
    const prevEventPct = prev?.eventPct ?? 0;

    // Today's price = yesterday's price × (1 + yesterday's event_pct)
    const rawPrice = prevPrice * (1 + prevEventPct / 100);
    const minPrice = asset.basePriceNuggets * 0.3;
    const maxPrice = asset.basePriceNuggets * 4;
    const todayPrice = Math.round(Math.min(maxPrice, Math.max(minPrice, rawPrice)));

    // Pick today's news event using seeded random (deterministic per asset+day)
    const rng1 = seededRandom(asset.symbol + today + "cat");
    const category = pickCategory(rng1);
    const templates = NEWS_TEMPLATES[category];
    const rng2 = seededRandom(asset.symbol + today + "tmpl");
    const template = templates[Math.floor(rng2 * templates.length)];
    const rng3 = seededRandom(asset.symbol + today + "x");
    const x = Math.floor(rng3 * (template.maxPct - template.minPct + 1)) + template.minPct;
    const headline = template.text.replace(/\{X\}/g, String(x));
    const body = template.body.replace(/\{X\}/g, String(x));

    // Calculate event_pct for today's news (will affect tomorrow's price)
    const rng4 = seededRandom(asset.symbol + today + "pct");
    const rawPct = template.minPct + rng4 * (template.maxPct - template.minPct);
    // mixed: 60% chance positive, 40% chance negative
    const rng5 = seededRandom(asset.symbol + today + "dir");
    const eventPct = template.impact === 'negative' ? -rawPct
      : template.impact === 'neutral' ? (rng4 - 0.5) * 2 * rawPct
      : template.impact === 'mixed' ? (rng5 < 0.60 ? rawPct : -rawPct)
      : rawPct;

    return {
      symbol: asset.symbol,
      price_nuggets: todayPrice,
      price_date: today,
      news_headline: headline,
      news_body: body,
      news_impact: template.impact,
      event_pct: Math.round(eventPct * 100) / 100,
    };
  });

  await supabase
    .from("trading_asset_prices")
    .upsert(rows, { onConflict: "symbol,price_date", ignoreDuplicates: true });
}

function pickCategory(rng: number): string {
  let cumulative = 0;
  for (const [cat, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    cumulative += weight;
    if (rng < cumulative) return cat;
  }
  return "neutral_news";
}
