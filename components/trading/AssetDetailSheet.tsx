"use client";

import { useState, useTransition } from "react";
import type {
  TradingAsset,
  TradingAssetPrice,
  TradingHolding,
} from "@/lib/domain/types";
import { buyAsset, sellAsset } from "@/lib/actions/trading";
import PriceHistoryChart from "./PriceHistoryChart";

interface Props {
  asset: TradingAsset;
  priceHistory: TradingAssetPrice[]; // 30-day history, newest first
  holding: TradingHolding | null;
  portfolioNuggets: number;
  kidId: string | null;
  onClose: () => void;
}

export default function AssetDetailSheet({
  asset,
  priceHistory,
  holding,
  portfolioNuggets,
  kidId,
  onClose,
}: Props) {
  // Next dividend date for this asset
  const nextDividendDate = asset.paysDividend && asset.dividendDayOfWeek !== undefined
    ? (() => {
        const today = new Date();
        const diff = (asset.dividendDayOfWeek - today.getDay() + 7) % 7 || 7;
        const next = new Date(today);
        next.setDate(today.getDate() + diff);
        return next.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
      })()
    : null;

  // Days held (for 7-day qualifying check)
  const daysHeld = holding
    ? Math.floor((Date.now() - new Date(holding.createdAt).getTime()) / (24 * 60 * 60 * 1000))
    : 0;
  const qualifiesForDividend = daysHeld >= 7;

  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isBuyPending, startBuyTransition] = useTransition();
  const [isSellPending, startSellTransition] = useTransition();

  const currentPrice = priceHistory[0]?.priceNuggets ?? asset.basePriceNuggets;
  const yesterdayPrice = priceHistory[1]?.priceNuggets ?? currentPrice;
  const dayChangePct =
    yesterdayPrice > 0
      ? ((currentPrice - yesterdayPrice) / yesterdayPrice) * 100
      : 0;
  const dayChangePositive = dayChangePct >= 0;

  // News card styling
  const newsImpact = priceHistory[0]?.newsImpact ?? null;
  const newsCardClass =
    newsImpact === "positive"
      ? "bg-green-50 border-green-200"
      : newsImpact === "negative"
      ? "bg-red-50 border-red-200"
      : newsImpact === "mixed"
      ? "bg-amber-50 border-amber-200"
      : "bg-gray-50 border-gray-200";

  // Unrealised P/L
  const unrealisedPL =
    holding != null
      ? (currentPrice - holding.avgCostNuggets) * holding.quantity
      : null;
  const unrealisedPct =
    holding != null && holding.avgCostNuggets > 0
      ? ((currentPrice - holding.avgCostNuggets) / holding.avgCostNuggets) *
        100
      : null;

  // Cost preview
  const buyCost = Math.ceil(quantity * currentPrice) + 1;
  const sellProceeds = Math.max(0, Math.floor(quantity * currentPrice) - 1);

  const canSell =
    holding != null && quantity > 0 && quantity <= holding.quantity;

  function handleBuy() {
    if (!kidId) return;
    setError(null);
    startBuyTransition(async () => {
      const result = await buyAsset(kidId, asset.symbol, quantity);
      if (!result.ok) setError(result.error);
    });
  }

  function handleSell() {
    if (!kidId) return;
    setError(null);
    startSellTransition(async () => {
      const result = await sellAsset(kidId, asset.symbol, quantity);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Centered modal */}
      <div className="relative z-10 w-full max-w-lg bg-white rounded-3xl overflow-y-auto max-h-[90vh] shadow-2xl">
        <div className="px-6 pt-6 pb-8">
          {/* Close button */}
          <div className="flex justify-end mb-2">
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          {/* Header */}
          <div className="flex items-center gap-4 mb-4">
            <span className="text-5xl">{asset.emoji}</span>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-black text-gray-900 leading-tight">
                {asset.name}
              </h2>
              <p className="text-sm text-gray-500">{asset.symbol} · {asset.industry}</p>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-2xl font-black text-gray-900">
                  🪙 {currentPrice.toLocaleString()}
                </span>
                <span
                  className={`text-sm font-bold ${
                    dayChangePositive ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {dayChangePositive ? "▲" : "▼"}{" "}
                  {Math.abs(dayChangePct).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Price history chart */}
          <div className="w-full mb-4">
            <PriceHistoryChart priceHistory={priceHistory} />
          </div>

          {/* Today's news card */}
          {priceHistory[0]?.newsHeadline && (
            <div
              className={`border rounded-2xl px-4 py-3 mb-4 ${newsCardClass}`}
            >
              <p className="text-sm font-bold text-gray-800">
                📰 {priceHistory[0].newsHeadline}
              </p>
              {priceHistory[0]?.newsBody && (
                <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                  {priceHistory[0].newsBody}
                </p>
              )}
            </div>
          )}

          {/* Asset description */}
          <p className="text-sm text-gray-600 mb-4">{asset.description}</p>
          {asset.paysDividend && nextDividendDate && (
            <div className="mb-4 flex flex-wrap gap-2">
              <span className="text-xs text-green-700 bg-green-50 rounded-xl px-3 py-1">
                💰 Pays dividend {nextDividendDate}
              </span>
              {holding ? (
                qualifiesForDividend ? (
                  <span className="text-xs text-green-700 bg-green-50 rounded-xl px-3 py-1">
                    ✅ You qualify ({daysHeld}d held)
                  </span>
                ) : (
                  <span className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-1">
                    ⏳ {7 - daysHeld}d until you qualify
                  </span>
                )
              ) : (
                <span className="text-xs text-gray-500 bg-gray-100 rounded-xl px-3 py-1">
                  Must hold 7 days to qualify
                </span>
              )}
            </div>
          )}

          {/* Current position */}
          {holding != null && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 mb-4">
              <p className="text-sm font-black text-blue-900 mb-2">
                Your Position
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-blue-600">Shares</p>
                  <p className="font-black text-blue-900">{holding.quantity}</p>
                </div>
                <div>
                  <p className="text-xs text-blue-600">Avg cost</p>
                  <p className="font-black text-blue-900">
                    🪙 {holding.avgCostNuggets.toFixed(0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-600">P/L</p>
                  <p
                    className={`font-black ${
                      (unrealisedPL ?? 0) >= 0
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                  >
                    {(unrealisedPL ?? 0) >= 0 ? "+" : ""}
                    {Math.round(unrealisedPL ?? 0).toLocaleString()}{" "}
                    <span className="text-xs">
                      ({(unrealisedPct ?? 0) >= 0 ? "+" : ""}
                      {(unrealisedPct ?? 0).toFixed(1)}%)
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Buy/Sell section */}
          {kidId != null && (
            <div className="border border-gray-200 rounded-2xl px-4 py-4">
              <p className="text-sm font-black text-gray-800 mb-3">
                Trade
              </p>
              <div className="mb-3">
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  Quantity (shares)
                </label>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Math.max(0.1, Number(e.target.value)))
                  }
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-lg font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>

              {/* Cost preview */}
              <div className="bg-gray-50 rounded-2xl px-4 py-3 mb-3 flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Shares cost</span>
                  <span className="font-bold text-gray-900">🪙 {(buyCost - 1).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Transaction fee</span>
                  <span className="font-bold text-gray-500">🪙 1</span>
                </div>
                <div className="border-t border-gray-200 my-0.5" />
                <div className="flex justify-between">
                  <span className="font-black text-gray-800">You pay (buy)</span>
                  <span className="font-black text-gray-900">🪙 {buyCost.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-black text-gray-800">You receive (sell)</span>
                  <span className="font-black text-gray-900">🪙 {sellProceeds.toLocaleString()}</span>
                </div>
              </div>

              {/* Balance */}
              <p className="text-xs text-gray-500 mb-3">
                Balance: 🪙 {portfolioNuggets.toLocaleString()} Nuggets
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">
                  <p className="text-sm text-red-700 font-medium">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleBuy}
                  disabled={
                    isBuyPending ||
                    isSellPending ||
                    quantity <= 0 ||
                    buyCost > portfolioNuggets
                  }
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-black rounded-2xl transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isBuyPending ? "…" : "Buy"}
                </button>
                <button
                  onClick={handleSell}
                  disabled={isSellPending || isBuyPending || !canSell}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-black rounded-2xl transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSellPending ? "…" : "Sell"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
