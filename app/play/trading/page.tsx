import {
  getKid,
  getTradingPortfolio,
  listTradingHoldings,
  listTradingTransactions,
  listCurrentAssetPrices,
  listAllAssetPriceHistories,
  listTradingLeaderboard,
} from "@/lib/data/stub";
import { ensureDailyPrices } from "@/lib/trading/prices";
import { TRADING_ASSETS } from "@/lib/trading/assets";
import { creditPendingDividends } from "@/lib/actions/trading";
import { createClient } from "@/lib/supabase/server";
import KidShell from "@/components/kid/KidShell";
import TradingHub from "@/components/trading/TradingHub";

export default async function TradingPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;

  const supabase = await createClient();

  // Generate today's prices in the background — don't block page load
  void ensureDailyPrices(supabase);

  const symbols = TRADING_ASSETS.map((a) => a.symbol);

  // Fetch kid + all shared data in parallel (single price-history query for all 10 assets)
  const [kid, priceHistoryMap, currentPrices] = await Promise.all([
    kidId ? getKid(kidId) : Promise.resolve(null),
    listAllAssetPriceHistories(symbols, 30),
    listCurrentAssetPrices(),
  ]);

  // Leaderboard reuses currentPrices already fetched — no extra query
  const leaderboard = await listTradingLeaderboard(currentPrices);

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

    // Fire-and-forget — dividend crediting doesn't affect the page render
    void creditPendingDividends(kid.id);
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
