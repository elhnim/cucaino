"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { InvestAccount, InvestHolding, InvestLicence, InvestTransaction, RealAsset, RealAssetPrice } from "@/lib/domain/types";
import GameAudio from "@/components/audio/GameAudio";
import InvestMarketTab from "@/components/invest/InvestMarketTab";
import InvestPortfolioTab from "@/components/invest/InvestPortfolioTab";
import InvestActivityTab from "@/components/invest/InvestActivityTab";
import InvestLearnTab from "@/components/invest/InvestLearnTab";
import InvestAssetDetailSheet from "@/components/invest/InvestAssetDetailSheet";
import InvestDepositWithdrawModal from "@/components/invest/InvestDepositWithdrawModal";

type Tab = "market" | "portfolio" | "activity" | "learn";

interface Props {
  kid: { id: string; name: string; cashBalance: number };
  account: InvestAccount;
  licence: InvestLicence;
  holdings: InvestHolding[];
  transactions: InvestTransaction[];
  prices: RealAssetPrice[];
  assets: RealAsset[];
}

export default function InvestHub({ kid, account, licence, holdings, transactions, prices, assets }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("market");
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [cashModal, setCashModal] = useState<"deposit" | "withdraw" | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const priceMap = useMemo(() => Object.fromEntries(prices.map((p) => [p.symbol, p])), [prices]);

  useEffect(() => {
    if (!localStorage.getItem(`invest_onboarding_seen:${kid.id}`)) setShowOnboarding(true);
  }, [kid.id]);

  function startLearning() {
    localStorage.setItem(`invest_onboarding_seen:${kid.id}`, "1");
    setShowOnboarding(false);
    setActiveTab("learn");
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "market", label: "Market" },
    { id: "portfolio", label: "Portfolio" },
    { id: "activity", label: "Activity" },
    { id: "learn", label: "Learn" },
  ];

  const selected = selectedAsset ? assets.find((asset) => asset.symbol === selectedAsset) : null;

  return (
    <div className="min-h-full bg-slate-50 text-slate-950">
      <GameAudio track="invest" />
      <div className="px-4 pt-4 pb-2 flex items-center gap-3">
        <Link href={`/kid/${kid.id}/play`} className="text-sm font-bold text-slate-400 hover:text-slate-600">← Games</Link>
        <h1 className="text-2xl font-black">Invest</h1>
      </div>

      <div className="sticky top-0 z-10 flex border-b border-slate-200 bg-white px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-black border-b-2 transition-colors ${
              activeTab === tab.id ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 pb-10">
        {activeTab === "market" && (
          <InvestMarketTab
            assets={assets}
            prices={priceMap}
            holdings={holdings}
            licence={licence}
            onSelectAsset={setSelectedAsset}
            onGoLearn={() => setActiveTab("learn")}
          />
        )}
        {activeTab === "portfolio" && (
          <InvestPortfolioTab
            account={account}
            holdings={holdings}
            prices={priceMap}
            assets={assets}
            onDepositWithdraw={setCashModal}
            onSelectAsset={setSelectedAsset}
            onGoMarket={() => setActiveTab("market")}
          />
        )}
        {activeTab === "activity" && <InvestActivityTab transactions={transactions} assets={assets} onGoMarket={() => setActiveTab("market")} onDeposit={() => setCashModal("deposit")} />}
        {activeTab === "learn" && <InvestLearnTab kidId={kid.id} licence={licence} onGoMarket={() => setActiveTab("market")} />}
      </div>

      {showOnboarding && createPortal(
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 px-4">
          <div className="w-full max-w-md rounded-[14px] bg-white p-6 shadow-xl">
            <div className="mb-3 text-4xl">📈</div>
            <h2 className="text-2xl font-black text-slate-950">Welcome to Invest</h2>
            <div className="mt-4 space-y-3 text-sm font-semibold text-slate-600">
              <p>Move real cash into an Invest account.</p>
              <p>Earn your Investor Licence before buying.</p>
              <p>Buy small slices of real stocks and crypto at real daily prices.</p>
            </div>
            <button onClick={startLearning} className="mt-6 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white">Start learning →</button>
          </div>
        </div>,
        document.body,
      )}

      {cashModal && createPortal(
        <InvestDepositWithdrawModal
          mode={cashModal}
          kidId={kid.id}
          cashBalance={kid.cashBalance}
          accountCashCents={account.cashCents}
          onClose={() => setCashModal(null)}
        />,
        document.body,
      )}

      {selected && createPortal(
        <InvestAssetDetailSheet
          kidId={kid.id}
          asset={selected}
          price={priceMap[selected.symbol] ?? null}
          priceHistory={prices.filter((p) => p.symbol === selected.symbol)}
          holding={holdings.find((holding) => holding.assetSymbol === selected.symbol) ?? null}
          accountCashCents={account.cashCents}
          licence={licence}
          onClose={() => setSelectedAsset(null)}
          onGoLearn={() => {
            setSelectedAsset(null);
            setActiveTab("learn");
          }}
        />,
        document.body,
      )}
    </div>
  );
}
