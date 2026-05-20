"use client";

import type {
  TradingPortfolio,
  TradingHolding,
  TradingAssetPrice,
  TradingTransaction,
  TradingAsset,
} from "@/lib/domain/types";
import { NUGGETS_PER_STAR } from "@/lib/trading/assets";
import PriceSparkline from "./PriceSparkline";

interface Props {
  portfolio: TradingPortfolio | null;
  holdings: TradingHolding[];
  currentPrices: Record<string, TradingAssetPrice>;
  priceHistoryMap: Record<string, TradingAssetPrice[]>;
  transactions: TradingTransaction[];
  kidStarBalance: number;
  assets: TradingAsset[];
  kidId: string;
  onDepositWithdraw: (mode: "deposit" | "withdraw") => void;
  onSelectAsset: (symbol: string) => void;
}

function txIcon(type: TradingTransaction["type"]): string {
  switch (type) {
    case "buy":
      return "📈";
    case "sell":
      return "📉";
    case "deposit":
      return "⭐";
    case "withdraw":
      return "💸";
    case "dividend":
      return "💰";
  }
}

function txLabel(tx: TradingTransaction): string {
  switch (tx.type) {
    case "buy":
      return `Bought ${tx.quantity ?? ""} × ${tx.assetSymbol ?? ""}`;
    case "sell":
      return `Sold ${tx.quantity ?? ""} × ${tx.assetSymbol ?? ""}`;
    case "deposit":
      return "Deposited stars";
    case "withdraw":
      return "Withdrew stars";
    case "dividend":
      return `Dividend from ${tx.assetSymbol ?? ""}`;
  }
}

export default function TradingPortfolioTab({
  portfolio,
  holdings,
  currentPrices,
  priceHistoryMap,
  transactions,
  kidStarBalance,
  assets,
  kidId,
  onDepositWithdraw,
  onSelectAsset,
}: Props) {
  // No account yet
  if (!portfolio) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
        <span className="text-6xl">💫</span>
        <p className="text-gray-600 font-medium max-w-xs">
          You don&apos;t have a trading account yet. Deposit stars to get
          started!
        </p>
        <button
          onClick={() => onDepositWithdraw("deposit")}
          className="bg-green-600 text-white font-black py-3 px-8 rounded-2xl text-lg"
        >
          Deposit Stars ⭐
        </button>
      </div>
    );
  }

  // Broke state
  const isBroke =
    portfolio.nuggetsBalance === 0 && holdings.length === 0;

  // Current total value
  const holdingsValue = holdings.reduce((sum, h) => {
    const price =
      currentPrices[h.assetSymbol]?.priceNuggets ??
      assets.find((a) => a.symbol === h.assetSymbol)?.basePriceNuggets ??
      0;
    return sum + h.quantity * price;
  }, 0);
  const currentTotalValue = portfolio.nuggetsBalance + holdingsValue;

  // Unrealised P/L
  const unrealisedPL = holdings.reduce((sum, h) => {
    const price =
      currentPrices[h.assetSymbol]?.priceNuggets ??
      assets.find((a) => a.symbol === h.assetSymbol)?.basePriceNuggets ??
      0;
    return sum + (price - h.avgCostNuggets) * h.quantity;
  }, 0);

  // Overall P/L: (withdrawnStars×NUGGETS_PER_STAR + currentTotalValue - depositedStars×NUGGETS_PER_STAR)
  const overallPL =
    portfolio.totalWithdrawnStars * NUGGETS_PER_STAR +
    currentTotalValue -
    portfolio.totalDepositedStars * NUGGETS_PER_STAR;

  const recentTx = transactions.slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      {/* Broke warning */}
      {isBroke && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3 flex gap-2 items-start">
          <span className="text-xl">💪</span>
          <p className="text-sm text-yellow-800 font-medium">
            You spent all your Nuggets! Earn more stars from tasks and deposit
            them to get back in the game.
          </p>
        </div>
      )}

      {/* Balance card */}
      <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl px-5 py-5 text-white shadow">
        <p className="text-sm font-bold opacity-80 mb-1">Your Balance</p>
        <p className="text-3xl font-black mb-0.5">
          🪙 {portfolio.nuggetsBalance.toLocaleString()} Nuggets
        </p>
        <p className="text-sm opacity-80 mb-4">
          ⭐ {kidStarBalance} stars available
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => onDepositWithdraw("deposit")}
            className="flex-1 bg-white/20 hover:bg-white/30 text-white font-black py-2.5 rounded-2xl text-sm transition-colors"
          >
            Deposit Stars
          </button>
          <button
            onClick={() => onDepositWithdraw("withdraw")}
            disabled={portfolio.nuggetsBalance < 1000}
            className="flex-1 bg-white/20 hover:bg-white/30 text-white font-black py-2.5 rounded-2xl text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Withdraw Stars
          </button>
        </div>
      </div>

      {/* P/L card */}
      <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm">
        <p className="text-sm font-black text-gray-700 mb-3">Performance</p>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Unrealised P/L</span>
            <span
              className={`font-black text-sm ${
                unrealisedPL >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {unrealisedPL >= 0 ? "+" : ""}
              🪙 {Math.round(unrealisedPL).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">Overall P/L</span>
            <span
              className={`font-black text-sm ${
                overallPL >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {overallPL >= 0 ? "+" : ""}
              🪙 {Math.round(overallPL).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-gray-100">
            <span className="text-xs text-gray-400">Total portfolio value</span>
            <span className="font-black text-sm text-gray-700">
              🪙 {Math.round(currentTotalValue).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Holdings */}
      <div>
        <p className="text-sm font-black text-gray-700 mb-2">Holdings</p>
        {holdings.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl px-5 py-8 text-center shadow-sm">
            <p className="text-4xl mb-2">📈</p>
            <p className="text-sm text-gray-500 font-medium">
              No holdings yet. Head to the Market tab to buy your first shares!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {holdings.map((h) => {
              const asset = assets.find((a) => a.symbol === h.assetSymbol);
              const price =
                currentPrices[h.assetSymbol]?.priceNuggets ??
                asset?.basePriceNuggets ??
                0;
              const gainPct =
                h.avgCostNuggets > 0
                  ? ((price - h.avgCostNuggets) / h.avgCostNuggets) * 100
                  : 0;
              const history = (priceHistoryMap[h.assetSymbol] ?? [])
                .slice(0, 7)
                .map((p) => p.priceNuggets)
                .reverse();
              const sparkPrices =
                history.length > 0
                  ? history
                  : [
                      currentPrices[h.assetSymbol]?.priceNuggets ??
                        asset?.basePriceNuggets ??
                        0,
                    ];

              return (
                <button
                  key={h.assetSymbol}
                  onClick={() => onSelectAsset(h.assetSymbol)}
                  className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3 text-left active:bg-gray-50 active:scale-[0.98] transition-all w-full"
                >
                  <span className="text-3xl">
                    {asset?.emoji ?? "📊"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-gray-900 text-sm truncate">
                      {asset?.name ?? h.assetSymbol}
                    </p>
                    <p className="text-xs text-gray-500">
                      {h.quantity} shares · avg 🪙{h.avgCostNuggets.toFixed(0)}
                    </p>
                    <p className="text-xs text-green-600 font-bold mt-0.5">Tap to trade →</p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="font-black text-gray-900 text-sm">
                      🪙 {price.toLocaleString()}
                    </p>
                    <span
                      className={`text-xs font-bold ${
                        gainPct >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {gainPct >= 0 ? "▲" : "▼"} {Math.abs(gainPct).toFixed(1)}%
                    </span>
                    <PriceSparkline prices={sparkPrices} width={48} height={20} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent transactions */}
      {recentTx.length > 0 && (
        <div>
          <p className="text-sm font-black text-gray-700 mb-2">
            Recent Transactions
          </p>
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm divide-y divide-gray-50">
            {recentTx.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xl">{txIcon(tx.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">
                    {txLabel(tx)}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(tx.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`text-sm font-black ${
                    tx.type === "buy" || tx.type === "withdraw"
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {tx.type === "buy" || tx.type === "withdraw" ? "-" : "+"}
                  🪙{tx.totalNuggets.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
