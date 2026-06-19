import { REAL_ASSETS } from "@/lib/invest/assets";
import { changePct } from "@/lib/invest/math";
import { fetchKidNews } from "@/lib/invest/news";
import type { AssetType, RealAsset } from "@/lib/domain/types";

type SupabaseLike = {
  from: (table: string) => any;
};

type PriceRow = {
  symbol: string;
  asset_type: AssetType;
  price_cents: number;
  prev_close_cents: number;
  change_pct: number;
  quote_currency: string;
  fx_rate_to_cash: number;
  news_headline: string | null;
  news_body: string | null;
  news_url: string | null;
  news_impact: string | null;
  market_cap: number | null;
  price_date: string;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function cents(value: number): number {
  return Math.round(value * 100);
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureDailyRealPrices(supabase: SupabaseLike): Promise<void> {
  try {
    const priceDate = today();
    // Find which symbols already have a row for today, and only fetch the MISSING ones.
    // (A simple "does BTC exist?" check would permanently block stocks from being retried
    // if an earlier run populated crypto/ASX while the Finnhub key was unavailable.)
    const { data: existingRows } = await supabase
      .from("real_asset_prices")
      .select("symbol")
      .eq("price_date", priceDate);
    const have = new Set((existingRows ?? []).map((row: { symbol: string }) => row.symbol));

    const missing = REAL_ASSETS.filter((asset) => !have.has(asset.symbol));

    if (missing.length > 0) {
      const usdToCash = await fetchUsdToAud();
      const rows: PriceRow[] = [];

      const asxAssets = missing.filter((asset) => asset.source === "yahoo");
      const cryptoAssets = missing.filter((asset) => asset.source === "coingecko");
      const usAssets = missing.filter((asset) => asset.source === "finnhub");

      for (const asset of asxAssets) {
        const row = await priceForAsx(asset, priceDate);
        if (row) rows.push(row);
      }

      if (usdToCash !== null) {
        if (cryptoAssets.length > 0) {
          rows.push(...(await pricesForCrypto(cryptoAssets, usdToCash, priceDate)));
        }

        for (const asset of usAssets) {
          // Finnhub (needs FINNHUB_API_KEY) gives price + company news + market cap.
          // When the key is missing or the quote fails, fall back to Yahoo — keyless
          // and already proven to serve US tickers in the backfill route — so stocks
          // keep updating daily instead of freezing at the last backfilled date.
          const row =
            (await priceForFinnhub(asset, usdToCash, priceDate)) ??
            (await priceForUsViaYahoo(asset, usdToCash, priceDate));
          if (row) rows.push(row);
          await delay(250);
        }
      }

      if (rows.length > 0) {
        await supabase
          .from("real_asset_prices")
          .upsert(rows, { onConflict: "symbol,price_date", ignoreDuplicates: true });
      }
    }

    // News self-heal: fill any of today's rows that still lack a kid-rewritten article
    // (e.g. rows created before the API keys were available). Runs every load until filled.
    await fillMissingNews(supabase, priceDate);
  } catch (err) {
    console.error("ensureDailyRealPrices failed:", err);
  }
}

async function fillMissingNews(supabase: SupabaseLike, priceDate: string): Promise<void> {
  try {
    const { data } = await supabase
      .from("real_asset_prices")
      .select("symbol")
      .eq("price_date", priceDate)
      .is("news_headline", null);
    const need = new Set((data ?? []).map((row: { symbol: string }) => row.symbol));
    if (need.size === 0) return;
    // Only US stocks (finnhub) + crypto (coingecko) have a real-news source; ASX news is deferred.
    const targets = REAL_ASSETS.filter((asset) => need.has(asset.symbol) && asset.source !== "yahoo");
    for (const asset of targets) {
      const news = await fetchKidNews({ symbol: asset.symbol, name: asset.name, assetType: asset.assetType, sourceId: asset.sourceId });
      if (news) {
        await supabase
          .from("real_asset_prices")
          .update({ news_headline: news.headline, news_body: news.body, news_url: news.url })
          .eq("symbol", asset.symbol)
          .eq("price_date", priceDate);
      }
      if (asset.source === "finnhub") await delay(250);
    }
  } catch {
    // never throw from the background refresh
  }
}

async function fetchUsdToAud(): Promise<number | null> {
  try {
    const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/AUDUSD=X?range=5d&interval=1d", {
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close as Array<number | null> | undefined;
    const audUsd = closes?.filter((n): n is number => typeof n === "number" && n > 0).at(-1);
    return audUsd ? 1 / audUsd : null;
  } catch {
    return null;
  }
}

/** Latest + previous daily close from Yahoo Finance (keyless). Used for ASX and as the US fallback. */
async function yahooPriceAndPrev(yahooSymbol: string): Promise<{ price: number; prev: number } | null> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=5d&interval=1d`, {
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close as Array<number | null> | undefined;
    const valid = closes?.filter((n): n is number => typeof n === "number" && n > 0) ?? [];
    const price = valid.at(-1);
    const prev = valid.at(-2) ?? price;
    if (!price || !prev) return null;
    return { price, prev };
  } catch {
    return null;
  }
}

async function priceForAsx(asset: RealAsset, priceDate: string): Promise<PriceRow | null> {
  const quote = await yahooPriceAndPrev(asset.sourceId);
  if (!quote) return null;
  return baseRow(asset, cents(quote.price), cents(quote.prev), "AUD", 1, priceDate, null, null);
}

/**
 * Keyless fallback for US stocks when Finnhub is unavailable. Yahoo serves plain US
 * tickers (e.g. "AAPL") directly, in USD — convert to cash with the AUD fx rate. News
 * stays null (Finnhub-only) so the UI's templated story shows; market cap is unavailable.
 */
async function priceForUsViaYahoo(asset: RealAsset, usdToCash: number, priceDate: string): Promise<PriceRow | null> {
  const quote = await yahooPriceAndPrev(asset.sourceId);
  if (!quote) return null;
  return baseRow(asset, cents(quote.price * usdToCash), cents(quote.prev * usdToCash), "USD", usdToCash, priceDate, null, null);
}

async function pricesForCrypto(assets: RealAsset[], usdToCash: number, priceDate: string): Promise<PriceRow[]> {
  try {
    const ids = assets.map((asset) => asset.sourceId).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
      { next: { revalidate: 60 * 60 * 6 } },
    );
    if (!res.ok) return [];
    const json = await res.json();
    const rows: PriceRow[] = [];
    for (const asset of assets) {
      const item = json[asset.sourceId];
      const priceUsd = item?.usd;
      if (typeof priceUsd !== "number" || priceUsd <= 0) continue;
      const pct = typeof item.usd_24h_change === "number" ? item.usd_24h_change / 100 : 0;
      const priceCents = cents(priceUsd * usdToCash);
      const prevCloseCents = Math.max(1, Math.round(priceCents / (1 + pct)));
      const marketCap = typeof item.usd_market_cap === "number" && item.usd_market_cap > 0
        ? Math.round(item.usd_market_cap * usdToCash)
        : null;
      const news = await fetchKidNews({ symbol: asset.symbol, name: asset.name, assetType: asset.assetType, sourceId: asset.sourceId });
      rows.push(baseRow(asset, priceCents, prevCloseCents, "USD", usdToCash, priceDate, news, marketCap));
    }
    return rows;
  } catch {
    return [];
  }
}

async function priceForFinnhub(asset: RealAsset, usdToCash: number, priceDate: string): Promise<PriceRow | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(asset.sourceId)}&token=${encodeURIComponent(key)}`,
      { next: { revalidate: 60 * 60 * 6 } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (typeof json.c !== "number" || json.c <= 0 || typeof json.pc !== "number" || json.pc <= 0) return null;
    const marketCap = await fetchFinnhubMarketCap(asset.sourceId, key, usdToCash);
    const news = await fetchKidNews({ symbol: asset.symbol, name: asset.name, assetType: asset.assetType, sourceId: asset.sourceId });
    return baseRow(asset, cents(json.c * usdToCash), cents(json.pc * usdToCash), "USD", usdToCash, priceDate, news, marketCap);
  } catch {
    return null;
  }
}

async function fetchFinnhubMarketCap(sourceId: string, key: string, usdToCash: number): Promise<number | null> {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sourceId)}&token=${encodeURIComponent(key)}`,
      { next: { revalidate: 60 * 60 * 24 } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    // marketCapitalization is in MILLIONS of the company's reporting currency. Only trust it when
    // that currency is USD (foreign ADRs like NTDOY/SONY report in JPY, which we can't convert here).
    const mcMillions = json?.marketCapitalization;
    if (typeof mcMillions !== "number" || mcMillions <= 0) return null;
    if (json?.currency && json.currency !== "USD") return null;
    return Math.round(mcMillions * 1_000_000 * usdToCash);
  } catch {
    return null;
  }
}

function baseRow(
  asset: RealAsset,
  priceCents: number,
  prevCloseCents: number,
  quoteCurrency: string,
  fxRateToCash: number,
  priceDate: string,
  news: { headline: string; body: string; url: string | null } | null,
  marketCap: number | null,
): PriceRow {
  return {
    symbol: asset.symbol,
    asset_type: asset.assetType,
    price_cents: priceCents,
    prev_close_cents: prevCloseCents,
    change_pct: Number(changePct(priceCents, prevCloseCents).toFixed(4)),
    quote_currency: quoteCurrency,
    fx_rate_to_cash: Number(fxRateToCash.toFixed(8)),
    news_headline: news?.headline ?? null,
    news_body: news?.body ?? null,
    news_url: news?.url ?? null,
    news_impact: null,
    market_cap: marketCap,
    price_date: priceDate,
  };
}
