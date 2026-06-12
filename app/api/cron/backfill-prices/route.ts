import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { REAL_ASSETS } from "@/lib/invest/assets";

// One-off (but idempotent) backfill: pulls ~30 days of real daily closes from
// Yahoo Finance for every Invest asset and inserts the days that are missing
// from real_asset_prices, so the 30-day chart has history immediately instead
// of accruing one point per day from today. Safe to call repeatedly — existing
// (symbol, price_date) rows are never touched. News fields stay null; the UI
// falls back to templated stories for past days.
export const dynamic = "force-dynamic";

type DayClose = { date: string; close: number };

async function yahooDaily(symbol: string): Promise<DayClose[]> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`,
      { cache: "no-store" },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const r = json.chart?.result?.[0];
    const ts = (r?.timestamp ?? []) as number[];
    const closes = (r?.indicators?.quote?.[0]?.close ?? []) as Array<number | null>;
    const out: DayClose[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (typeof c === "number" && c > 0) {
        out.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: c });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  }

  try {
    const admin = createAdminClient();
    const start = new Date(Date.now() - 32 * 86_400_000).toISOString().slice(0, 10);

    // Daily USD->AUD rates for the window (nearest earlier rate fills gaps/weekends).
    const fxDays = await yahooDaily("AUDUSD=X");
    const fxFor = (date: string): number | null => {
      let best: DayClose | null = null;
      for (const d of fxDays) if (d.date <= date && (!best || d.date > best.date)) best = d;
      const audUsd = best?.close ?? fxDays.at(-1)?.close;
      return audUsd ? 1 / audUsd : null;
    };

    const { data: existingRows } = await admin
      .from("real_asset_prices")
      .select("symbol, price_date")
      .gte("price_date", start);
    const have = new Set((existingRows ?? []).map((r: { symbol: string; price_date: string }) => `${r.symbol}|${r.price_date}`));

    const rows: Record<string, unknown>[] = [];
    const failed: string[] = [];
    for (const asset of REAL_ASSETS) {
      // Yahoo covers all three sources: ASX ids as-is, US tickers as-is, crypto as TICKER-USD.
      const ySymbol = asset.source === "coingecko" ? `${asset.ticker}-USD` : asset.sourceId;
      const days = await yahooDaily(ySymbol);
      if (days.length === 0) { failed.push(asset.symbol); continue; }
      const isAud = asset.source === "yahoo";
      for (let i = 0; i < days.length; i++) {
        const d = days[i];
        if (have.has(`${asset.symbol}|${d.date}`)) continue;
        const fx = isAud ? 1 : fxFor(d.date);
        if (!fx) continue;
        const prevClose = days[i - 1]?.close ?? d.close;
        const priceCents = Math.round(d.close * fx * 100);
        const prevCents = Math.max(1, Math.round(prevClose * fx * 100));
        rows.push({
          symbol: asset.symbol,
          asset_type: asset.assetType,
          price_cents: priceCents,
          prev_close_cents: prevCents,
          change_pct: Number(((priceCents - prevCents) / prevCents).toFixed(4)),
          quote_currency: isAud ? "AUD" : "USD",
          fx_rate_to_cash: Number(fx.toFixed(8)),
          news_headline: null,
          news_body: null,
          news_url: null,
          news_impact: null,
          market_cap: null,
          price_date: d.date,
        });
      }
      await new Promise((r) => setTimeout(r, 120)); // be polite to Yahoo
    }

    let inserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await admin
        .from("real_asset_prices")
        .upsert(chunk, { onConflict: "symbol,price_date", ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: error.message, inserted }, { status: 500 });
      inserted += chunk.length;
    }

    return NextResponse.json({ ok: true, inserted, assets: REAL_ASSETS.length, failed });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
