import {
  getKid,
  getTradingPortfolio,
  listTradingHoldings,
  listTradingTransactions,
  listCurrentAssetPrices,
  getAssetPriceHistory,
  listTradingLeaderboard,
} from "@/lib/data/stub";
import { ensureDailyPrices } from "@/lib/trading/prices";
import { TRADING_ASSETS } from "@/lib/trading/assets";
import { creditPendingDividends } from "@/lib/actions/trading";
import { createClient } from "@/lib/supabase/server";
import KidShell from "@/components/kid/KidShell";
import TradingHub from "@/components/trading/TradingHub";
import type { TradingAssetPrice } from "@/lib/domain/types";

export default async function TradingPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;

  const supabase = await createClient();

  // Generate today's prices in the background — don't block page load
  void ensureDailyPrices(supabase);

  // Fetch kid
  const kid = await (kidId ? getKid(kidId) : Promise.resolve(null));

  // Fetch all asset price histories + current prices + leaderboard in parallel
  const [priceHistories, currentPrices, leaderboard] = await Promise.all([
    Promise.all(TRADING_ASSETS.map((a) => getAssetPriceHistory(a.symbol, 30))),
    listCurrentAssetPrices(),
    listTradingLeaderboard(),
  ]);

  // Build price history map
  const priceHistoryMap: Record<string, TradingAssetPrice[]> = {};
  TRADING_ASSETS.forEach((a, i) => {
    priceHistoryMap[a.symbol] = priceHistories[i];
  });

  // Fetch kid-specific data if kid exists
  let portfolio = null;
  let holdings: Awaited<ReturnType<typeof listTradingHoldings>> = [];
  let transactions: Awaited<ReturnType<typeof listTradingTransactions>> = [];

  if (kid) {
    [portfolio, holdings, transactions] = await Promise.all([
      getTradingPortfolio(kid.id),
      listTradingHoldings(kid.id),
      listTradingTransactions(kid.id, 20),
    ]);

    await creditPendingDividends(kid.id);
  }

  const content = (
    <TradingHub
      kid={kid ? { id: kid.id, name: kid.name, pointsBalance: kid.pointsBalance } : null}
      portfolio={portfolio}
      holdings={holdings}
      transactions={transactions}
      currentPrices={currentPrices}
      priceHistoryMap={priceHistoryMap}
      assets={TRADING_ASSETS}
      leaderboard={leaderboard}
    />
  );

  if (kid) {
    return <KidShell kid={kid} active="play">{content}</KidShell>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      {content}
    </div>
  );
}
