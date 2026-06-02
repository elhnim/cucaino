"use client";

import type { InvestHolding, RealAsset, RealAssetPrice } from "@/lib/domain/types";

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function InvestAssetRow({
  asset,
  price,
  holding,
  onSelect,
}: {
  asset: RealAsset;
  price: RealAssetPrice | undefined;
  holding: InvestHolding | undefined;
  onSelect: () => void;
}) {
  const up = (price?.changePct ?? 0) >= 0;
  return (
    <button
      onClick={onSelect}
      disabled={!price}
      className="flex w-full items-center gap-3 border-b border-slate-100 bg-white px-3 py-3 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xl">{asset.emoji}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-black text-slate-950">{asset.name}</p>
          {holding && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700">Owned</span>}
        </div>
        <p className="mt-0.5 text-xs font-bold text-slate-400">
          {asset.ticker} · {asset.exchange} {asset.exchange === "ASX" ? "· 🇦🇺 ASX" : ""}
        </p>
      </div>
      <div className="text-right tabular-nums">
        <p className="text-sm font-black text-slate-950">{price ? money(price.priceCents) : "Unavailable"}</p>
        {price && (
          <p className={`mt-1 rounded-full px-2 py-0.5 text-[11px] font-black ${up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {up ? "+" : ""}{(price.changePct * 100).toFixed(1)}%
          </p>
        )}
      </div>
    </button>
  );
}
