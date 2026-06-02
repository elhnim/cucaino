"use client";

import { useMemo, useState, useTransition } from "react";
import type { InvestHolding, InvestLicence, RealAsset, RealAssetPrice } from "@/lib/domain/types";
import { buyAsset, sellAsset } from "@/lib/actions/invest";
import { MIN_TRADE_CENTS } from "@/lib/invest/assets";
import { holdingValueCents, quantityForAmount, unrealizedPnlCents } from "@/lib/invest/math";
import InvestAboutSection from "@/components/invest/InvestAboutSection";
import InvestBuyLockedCard from "@/components/invest/InvestBuyLockedCard";
import { assetNews } from "@/lib/invest/news-display";

function money(cents: number): string { return `$${(cents / 100).toFixed(2)}`; }

function formatMarketCap(dollars: number): string {
  if (dollars >= 1e12) return `$${(dollars / 1e12).toFixed(2)}T`;
  if (dollars >= 1e9) return `$${(dollars / 1e9).toFixed(1)}B`;
  if (dollars >= 1e6) return `$${(dollars / 1e6).toFixed(1)}M`;
  return `$${dollars.toLocaleString()}`;
}

export default function InvestAssetDetailSheet({
  kidId,
  asset,
  price,
  priceHistory,
  holding,
  accountCashCents,
  licence,
  onClose,
  onGoLearn,
}: {
  kidId: string;
  asset: RealAsset;
  price: RealAssetPrice | null;
  priceHistory: RealAssetPrice[];
  holding: InvestHolding | null;
  accountCashCents: number;
  licence: InvestLicence;
  onClose: () => void;
  onGoLearn: () => void;
}) {
  const [mode, setMode] = useState<"buy" | "sell">(holding ? "sell" : "buy");
  const [amount, setAmount] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const prices = useMemo(() => [...priceHistory].reverse().map((p) => p.priceCents), [priceHistory]);
  const news = useMemo(() => {
    if (!price) return null;
    // Prefer the real, kid-rewritten article cached on the price row; fall back to the
    // always-available templated story so the card is never empty.
    if (price.newsHeadline && price.newsBody) {
      return { headline: price.newsHeadline, body: price.newsBody, url: price.newsUrl, real: true };
    }
    const t = assetNews(asset.symbol, asset.name, asset.assetType, price.changePct, price.priceDate);
    return { headline: t.headline, body: t.body, url: null as string | null, real: false };
  }, [price, asset.symbol, asset.name, asset.assetType]);
  const ownedValue = holding && price ? holdingValueCents(holding.quantity, price.priceCents) : 0;
  const pnl = holding && price ? unrealizedPnlCents(holding.quantity, price.priceCents, holding.avgCostCents) : 0;
  const canTrade = Boolean(price);
  const buyLocked = !licence.passedAt;

  function submit(all = false) {
    setError(null);
    startTransition(async () => {
      const result = mode === "buy"
        ? await buyAsset(kidId, asset.symbol, amount)
        : await sellAsset(kidId, asset.symbol, { amountCents: amount, all });
      if (result.ok) onClose();
      else setError(result.error);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50" onClick={(e) => e.currentTarget === e.target && onClose()}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-slate-50 p-4 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-2xl">{asset.emoji}</div>
            <div>
              <h2 className="text-xl font-black text-slate-950">{asset.name}</h2>
              <p className="text-xs font-black text-slate-400">{asset.ticker} · {asset.exchange}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-2xl font-black text-slate-400">×</button>
        </div>

        <div className="mb-4 rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-black uppercase text-slate-400">Price</p>
              <p className="text-3xl font-black tabular-nums text-slate-950">{price ? money(price.priceCents) : "Unavailable"}</p>
            </div>
            {price && <span className={`rounded-full px-2 py-1 text-xs font-black ${price.changePct >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{price.changePct >= 0 ? "+" : ""}{(price.changePct * 100).toFixed(1)}%</span>}
          </div>
          <div className="mt-4 h-24 rounded-xl bg-slate-50 p-2">
            {prices.length < 2 ? <p className="grid h-full place-items-center text-xs font-bold text-slate-400">Price history starts today</p> : <Spark prices={prices} />}
          </div>
          {price?.marketCap != null && (
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-xs font-black uppercase text-slate-400">Market cap</span>
              <span className="text-sm font-black tabular-nums text-slate-700">{formatMarketCap(price.marketCap)}</span>
            </div>
          )}
        </div>

        {news && (
          <div className="mb-4 rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-400">{news.real ? "In the news" : "Today's story"}</p>
            <h3 className="mt-1 text-sm font-black text-slate-950">{news.headline}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-600">{news.body}</p>
            {news.real && news.url && (
              <a href={news.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-black text-indigo-600">Read the real story →</a>
            )}
          </div>
        )}

        {holding && (
          <div className="mb-4 rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-400">Your position</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-sm font-black tabular-nums">
              <div><p className="text-slate-400">Qty</p><p>{holding.quantity.toFixed(6)}</p></div>
              <div><p className="text-slate-400">Value</p><p>{money(ownedValue)}</p></div>
              <div><p className="text-slate-400">P&L</p><p className={pnl >= 0 ? "text-emerald-700" : "text-red-700"}>{pnl >= 0 ? "+" : ""}{money(pnl)}</p></div>
            </div>
          </div>
        )}

        <div className="mb-4 rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm">
          {holding && (
            <div className="mb-3 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
              {(["buy", "sell"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`rounded-lg py-2 text-sm font-black capitalize ${mode === m ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}>{m}</button>)}
            </div>
          )}
          {mode === "buy" && buyLocked ? <InvestBuyLockedCard licence={licence} onGoLearn={onGoLearn} /> : (
            <div>
              <label className="text-xs font-black uppercase text-slate-400">{mode === "buy" ? "Amount to invest" : "Amount to sell"}</label>
              <input type="number" min="0.5" step="0.5" value={(amount / 100).toString()} onChange={(e) => setAmount(Math.round(Number(e.target.value) * 100))} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-lg font-black outline-none focus:ring-2 focus:ring-indigo-200" />
              <div className="mt-3 flex gap-2">
                {[100, 200, 500].map((c) => <button key={c} onClick={() => setAmount(c)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black">${c / 100}</button>)}
                {mode === "buy" && <button onClick={() => setAmount(accountCashCents)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black">Max</button>}
                {mode === "sell" && <button onClick={() => submit(true)} disabled={pending || !canTrade} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black">Sell all</button>}
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-500">{price ? `${mode === "buy" ? "Buys" : "Sells"} about ${quantityForAmount(amount, price.priceCents).toFixed(8)} ${asset.ticker}` : "Trading disabled until a server price is available."}</p>
              {amount < MIN_TRADE_CENTS && <p className="mt-2 text-sm font-bold text-red-600">Minimum trade is $0.50.</p>}
              {mode === "buy" && amount > accountCashCents && <p className="mt-2 text-sm font-bold text-red-600">Not enough Invest cash.</p>}
              {error && <p className="mt-2 text-sm font-bold text-red-600">{error}</p>}
              <button onClick={() => submit(false)} disabled={pending || !canTrade || amount < MIN_TRADE_CENTS || (mode === "buy" && amount > accountCashCents)} className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{pending ? "Working..." : mode === "buy" ? "Buy" : "Sell"}</button>
            </div>
          )}
        </div>

        {asset.about && <InvestAboutSection about={asset.about} />}
      </div>
    </div>
  );
}

function Spark({ prices }: { prices: number[] }) {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const points = prices.map((p, i) => `${(i / Math.max(prices.length - 1, 1)) * 100},${50 - ((p - min) / range) * 45}`).join(" ");
  return <svg viewBox="0 0 100 55" className="h-full w-full"><polyline points={points} fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
