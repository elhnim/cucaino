"use client";

import { useMemo, useState } from "react";
import type { InvestHolding, InvestLicence, RealAsset, RealAssetPrice } from "@/lib/domain/types";
import { ASSET_CATEGORIES } from "@/lib/invest/assets";
import InvestAssetRow from "@/components/invest/InvestAssetRow";

export default function InvestMarketTab({
  assets,
  prices,
  holdings,
  licence,
  onSelectAsset,
  onGoLearn,
}: {
  assets: RealAsset[];
  prices: Record<string, RealAssetPrice>;
  holdings: InvestHolding[];
  licence: InvestLicence;
  onSelectAsset: (symbol: string) => void;
  onGoLearn: () => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof ASSET_CATEGORIES)[number]["key"]>("all");
  const holdingMap = useMemo(() => Object.fromEntries(holdings.map((h) => [h.assetSymbol, h])), [holdings]);
  const filtered = assets.filter((asset) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || `${asset.name} ${asset.ticker} ${asset.exchange}`.toLowerCase().includes(q);
    const matchesCategory = category === "all" || asset.categories.includes(category);
    return matchesQuery && matchesCategory;
  });
  const noPrices = assets.every((asset) => !prices[asset.symbol]);

  if (noPrices) {
    return (
      <div className="space-y-3">
        <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
        <div className="flex gap-2">{[1, 2, 3].map((i) => <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-slate-200" />)}</div>
        <div className="rounded-[14px] border border-slate-200 bg-white p-5 text-center shadow-sm">
          <h2 className="text-lg font-black text-slate-950">Prices didn't load</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Try again in a moment. Any existing cached prices will appear here.</p>
          <button onClick={() => location.reload()} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stocks or crypto" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-200" />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {ASSET_CATEGORIES.map((chip) => (
          <button key={chip.key} onClick={() => setCategory(chip.key)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${category === chip.key ? "bg-indigo-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>
            {chip.label}
          </button>
        ))}
      </div>
      {!licence.passedAt && (
        <button onClick={onGoLearn} className="w-full rounded-[14px] border border-indigo-100 bg-indigo-50 px-4 py-3 text-left text-sm font-black text-indigo-800">
          🔒 Buying is locked — earn your Investor Licence
        </button>
      )}
      {filtered.length === 0 ? (
        <div className="rounded-[14px] border border-slate-200 bg-white p-5 text-sm font-bold text-slate-500">No matches — try another search or filter.</div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm">
          {filtered.map((asset) => (
            <InvestAssetRow key={asset.symbol} asset={asset} price={prices[asset.symbol]} holding={holdingMap[asset.symbol]} onSelect={() => onSelectAsset(asset.symbol)} />
          ))}
        </div>
      )}
    </div>
  );
}
