"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type {
  TradingPortfolio,
  TradingHolding,
  TradingTransaction,
  TradingAssetPrice,
  TradingAsset,
} from "@/lib/domain/types";
import GameAudio from "@/components/audio/GameAudio";
import TradingPortfolioTab from "./TradingPortfolioTab";
import TradingMarketTab from "./TradingMarketTab";
import TradingLeaderboardTab, {
  type LeaderboardEntry,
} from "./TradingLeaderboardTab";
import DepositWithdrawModal from "./DepositWithdrawModal";
import AssetDetailSheet from "./AssetDetailSheet";
import TradingOnboarding from "./TradingOnboarding";

interface Props {
  kid: { id: string; name: string; pointsBalance: number } | null;
  portfolio: TradingPortfolio | null;
  holdings: TradingHolding[];
  transactions: TradingTransaction[];
  currentPrices: Record<string, TradingAssetPrice>;
  priceHistoryMap: Record<string, TradingAssetPrice[]>;
  assets: TradingAsset[];
  leaderboard: LeaderboardEntry[];
}

type Tab = "portfolio" | "market" | "leaderboard";

export default function TradingHub({
  kid,
  portfolio,
  holdings,
  transactions,
  currentPrices,
  priceHistoryMap,
  assets,
  leaderboard,
}: Props) {
  const defaultTab: Tab = kid ? "portfolio" : "market";
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [depositMode, setDepositMode] = useState<"deposit" | "withdraw" | null>(
    null
  );
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem("nugget-market-tour-seen");
    if (!seen) setShowOnboarding(true);
  }, []);

  const handleOnboardingDone = () => {
    localStorage.setItem("nugget-market-tour-seen", "1");
    setShowOnboarding(false);
  };

  const tabs: { id: Tab; label: string; onlyWithKid?: boolean }[] = [
    { id: "portfolio", label: "Portfolio", onlyWithKid: true },
    { id: "market", label: "Market" },
    { id: "leaderboard", label: "Rankings" },
  ];

  const visibleTabs = tabs.filter((t) => !t.onlyWithKid || kid != null);

  function handleTabClick(tab: Tab) {
    setActiveTab(tab);
  }

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-100 min-h-full">
      <GameAudio track="market" />
      {showOnboarding && createPortal(
        <div className="fixed inset-0 z-50">
          <TradingOnboarding onDone={handleOnboardingDone} />
        </div>,
        document.body,
      )}
      {/* Page title */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-3">
        <Link
          href={kid ? `/kid/${kid.id}/play` : "/select-kid"}
          className="text-gray-400 hover:text-gray-600 text-sm font-bold flex items-center gap-1"
        >
          ← Games
        </Link>
        <h1 className="text-2xl font-black text-gray-900">📈 Nugget Market</h1>
      </div>

      {/* Tab bar — sticky so it stays visible while scrolling */}
      <div className="sticky top-0 z-10 flex border-b border-gray-200 bg-white px-4">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`py-3 px-4 text-sm font-black border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-green-600 text-green-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <div className="px-4 py-4 pb-8">
        {activeTab === "portfolio" && kid && (
          <TradingPortfolioTab
            portfolio={portfolio}
            holdings={holdings}
            currentPrices={currentPrices}
            priceHistoryMap={priceHistoryMap}
            transactions={transactions}
            kidStarBalance={kid.pointsBalance}
            assets={assets}
            kidId={kid.id}
            onDepositWithdraw={(mode) => setDepositMode(mode)}
            onSelectAsset={(symbol) => setSelectedAsset(symbol)}
          />
        )}
        {activeTab === "market" && (
          <TradingMarketTab
            assets={assets}
            currentPrices={currentPrices}
            priceHistoryMap={priceHistoryMap}
            holdings={holdings}
            onSelectAsset={(symbol) => setSelectedAsset(symbol)}
          />
        )}
        {activeTab === "leaderboard" && (
          <TradingLeaderboardTab
            leaderboard={leaderboard}
            currentKidId={kid?.id ?? null}
          />
        )}
      </div>

      {/* Portals render to document.body — avoids iOS Safari fixed-in-overflow clipping */}
      {depositMode && kid && createPortal(
        <DepositWithdrawModal
          mode={depositMode}
          availableStars={kid.pointsBalance}
          availableNuggets={portfolio?.nuggetsBalance ?? 0}
          kidId={kid.id}
          onClose={() => setDepositMode(null)}
        />,
        document.body,
      )}

      {selectedAsset && (() => {
        const assetForSheet = assets.find((a) => a.symbol === selectedAsset);
        if (!assetForSheet) {
          console.warn(`[TradingHub] unknown symbol: ${selectedAsset}`);
          return null;
        }
        return createPortal(
          <AssetDetailSheet
            asset={assetForSheet}
            priceHistory={priceHistoryMap[selectedAsset] ?? []}
            holding={holdings.find((h) => h.assetSymbol === selectedAsset) ?? null}
            portfolioNuggets={portfolio?.nuggetsBalance ?? 0}
            kidId={kid?.id ?? null}
            onClose={() => setSelectedAsset(null)}
          />,
          document.body,
        );
      })()}
    </div>
  );
}
