"use server";

/**
 * Nugget Market loader for the park-native market (components/park/market/NuggetMarket.tsx).
 * Same data and rules as the flat /play/trading page: makes sure today's prices exist, credits
 * pending dividends, then returns wallet, holdings, today's vs yesterday's prices and a short
 * price history. Trades use the existing lib/actions/trading.ts actions unchanged.
 */
import { createClient } from "@/lib/supabase/server";
import {
  getKid,
  getTradingPortfolio,
  listTradingHoldings,
  listCurrentAndPreviousAssetPrices,
  listAllAssetPriceHistories,
} from "@/lib/data/stub";
import { ensureDailyPrices } from "@/lib/trading/prices";
import { TRADING_ASSETS } from "@/lib/trading/assets";
import { creditPendingDividends } from "@/lib/actions/trading";
import type { TradingHolding, TradingAssetPrice } from "@/lib/domain/types";

export interface MarketData {
  stars: number;
  nuggets: number;
  holdings: TradingHolding[];
  prices: Record<string, { current: TradingAssetPrice; previous: TradingAssetPrice | null }>;
  history: Record<string, number[]>;
}

export async function getNuggetMarket(kidId: string): Promise<MarketData | null> {
  try {
    await ensureDailyPrices(await createClient());
  } catch {
    // best-effort, same as the flat page
  }
  const kid = await getKid(kidId);
  if (!kid) return null;
  await creditPendingDividends(kid.id).catch(() => {});
  const [portfolio, holdings, prices, hist] = await Promise.all([
    getTradingPortfolio(kid.id),
    listTradingHoldings(kid.id),
    listCurrentAndPreviousAssetPrices(),
    listAllAssetPriceHistories(TRADING_ASSETS.map((a) => a.symbol), 14),
  ]);
  const history: Record<string, number[]> = {};
  for (const [sym, rows] of Object.entries(hist)) history[sym] = rows.map((r) => r.priceNuggets);
  return { stars: kid.pointsBalance, nuggets: portfolio?.nuggetsBalance ?? 0, holdings, prices, history };
}
