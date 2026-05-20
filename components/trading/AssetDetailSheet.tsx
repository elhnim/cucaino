"use client";

import { useState, useTransition } from "react";
import type {
  TradingAsset,
  TradingAssetPrice,
  TradingHolding,
} from "@/lib/domain/types";
import { buyAsset, sellAsset } from "@/lib/actions/trading";
import PriceSparkline from "./PriceSparkline";

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

  // Sparkline: oldest to newest (reverse)
  const sparklinePrices = [...priceHistory]
    .reverse()
    .map((p) => p.priceNuggets);

  // News card styling
  const newsImpact = priceHistory[0]?.newsImpact ?? null;
  const newsCardClass =
    newsImpact === "positive"
      ? "bg-green-50 border-green-200"
      : newsImpact === "negative"
      ? "bg-red-50 border-red-200"
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

          {/* Sparkline */}
          <div className="w-full mb-4">
            <PriceSparkline
              prices={sparklinePrices}
              width={400}
              height={64}
            />
          </div>

          {/* Today's news card */}
          {priceHistory[0]?.newsHeadline && (
            <div
              className={`border rounded-2xl px-4 py-3 mb-4 ${newsCardClass}`}
            >
              <p className="text-sm font-bold text-gray-800">
                📰 {priceHistory[0].newsHeadline}
              </p>
              <p className="text-xs text-gray-500 mt-1 italic">
                What do you think will happen tomorrow?
              </p>
            </div>
          )}

          {/* Asset description */}
          <p className="text-sm text-gray-600 mb-4">{asset.description}</p>
          {asset.paysDividend && (
            <p className="text-xs text-green-700 bg-green-50 rounded-xl px-3 py-1 inline-block mb-4">
              💰 Pays dividends weekly
            </p>
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
              <div className="flex gap-3 mb-3 text-sm text-gray-600">
                <span>
                  Buy cost:{" "}
                  <span className="font-bold text-gray-900">
                    🪙 {buyCost.toLocaleString()}
                  </span>
                </span>
                <span>·</span>
                <span>
                  Sell proceeds:{" "}
                  <span className="font-bold text-gray-900">
                    🪙 {sellProceeds.toLocaleString()}
                  </span>
                </span>
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
