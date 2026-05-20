"use client";

import type {
  TradingAsset,
  TradingAssetPrice,
  TradingHolding,
} from "@/lib/domain/types";
import PriceSparkline from "./PriceSparkline";

interface Props {
  assets: TradingAsset[];
  currentPrices: Record<string, TradingAssetPrice>;
  priceHistoryMap: Record<string, TradingAssetPrice[]>; // 30-day history per symbol
  holdings: TradingHolding[];
  onSelectAsset: (symbol: string) => void;
}

export default function TradingMarketTab({
  assets,
  currentPrices,
  priceHistoryMap,
  holdings,
  onSelectAsset,
}: Props) {
  const holdingSymbols = new Set(holdings.map((h) => h.assetSymbol));

  return (
    <div>
      <p className="text-sm font-black text-gray-700 mb-3">📰 Today&apos;s Market</p>
      <div className="grid grid-cols-2 gap-3">
        {assets.map((asset) => {
          const priceData = currentPrices[asset.symbol];
          const currentPrice =
            priceData?.priceNuggets ?? asset.basePriceNuggets;

          const history = priceHistoryMap[asset.symbol] ?? [];
          const yesterdayPrice = history[1]?.priceNuggets ?? currentPrice;
          const dayChangePct =
            yesterdayPrice > 0
              ? ((currentPrice - yesterdayPrice) / yesterdayPrice) * 100
              : 0;
          const isPositive = dayChangePct >= 0;

          // 7-day sparkline: take first 7 entries (newest first), reverse to oldest-first
          const sparklinePrices = history
            .slice(0, 7)
            .reverse()
            .map((p) => p.priceNuggets);
          if (sparklinePrices.length === 0) {
            sparklinePrices.push(currentPrice);
          }

          const isOwned = holdingSymbols.has(asset.symbol);

          return (
            <button
              key={asset.symbol}
              onClick={() => onSelectAsset(asset.symbol)}
              className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm text-left cursor-pointer hover:scale-[1.02] hover:shadow transition-all active:scale-100 w-full"
            >
              {/* Top row: emoji + owned badge */}
              <div className="flex items-start justify-between mb-1">
                <span className="text-3xl">{asset.emoji}</span>
                {isOwned && (
                  <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">
                    Owned
                  </span>
                )}
              </div>

              {/* Name */}
              <p className="font-black text-gray-900 text-sm leading-tight mb-1 line-clamp-1">
                {asset.name}
              </p>

              {/* Price */}
              <p className="text-base font-black text-gray-800 mb-0.5">
                🪙 {currentPrice.toLocaleString()}
              </p>

              {/* Day change */}
              <p
                className={`text-xs font-bold mb-2 ${
                  isPositive ? "text-green-600" : "text-red-600"
                }`}
              >
                {isPositive ? "▲" : "▼"} {Math.abs(dayChangePct).toFixed(1)}%
              </p>

              {/* Sparkline */}
              <PriceSparkline
                prices={sparklinePrices}
                width={120}
                height={32}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
