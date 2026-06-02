"use client";

import type { InvestAccount, InvestHolding, RealAsset, RealAssetPrice } from "@/lib/domain/types";
import { holdingValueCents, unrealizedPnlCents } from "@/lib/invest/math";

function money(cents: number): string { return `$${(cents / 100).toFixed(2)}`; }

export default function InvestPortfolioTab({
  account,
  holdings,
  prices,
  assets,
  onDepositWithdraw,
  onSelectAsset,
  onGoMarket,
}: {
  account: InvestAccount;
  holdings: InvestHolding[];
  prices: Record<string, RealAssetPrice>;
  assets: RealAsset[];
  onDepositWithdraw: (mode: "deposit" | "withdraw") => void;
  onSelectAsset: (symbol: string) => void;
  onGoMarket: () => void;
}) {
  const rows = holdings.map((h) => ({ holding: h, asset: assets.find((a) => a.symbol === h.assetSymbol), price: prices[h.assetSymbol] })).filter((r) => r.asset);
  const investments = rows.reduce((sum, row) => sum + (row.price ? holdingValueCents(row.holding.quantity, row.price.priceCents) : 0), 0);
  const pnl = rows.reduce((sum, row) => sum + (row.price ? unrealizedPnlCents(row.holding.quantity, row.price.priceCents, row.holding.avgCostCents) : 0), 0);
  const total = account.cashCents + investments;

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] bg-gradient-to-br from-slate-800 via-indigo-900 to-indigo-700 p-5 text-white shadow-sm">
        <p className="text-xs font-black uppercase text-indigo-200">Total value</p>
        <p className="mt-1 text-4xl font-black tabular-nums">{money(total)}</p>
        <p className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-black ${pnl >= 0 ? "bg-emerald-400/15 text-emerald-100" : "bg-red-400/15 text-red-100"}`}>{pnl >= 0 ? "+" : ""}{money(pnl)} open P&L</p>
      </div>
      <div className="grid grid-cols-2 gap-3"><button onClick={() => onDepositWithdraw("deposit")} className="rounded-xl bg-indigo-600 py-3 text-sm font-black text-white">Deposit</button><button onClick={() => onDepositWithdraw("withdraw")} className="rounded-xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-700">Withdraw</button></div>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Account cash" value={money(account.cashCents)} />
        <Metric label="Investments" value={money(investments)} />
        <Metric label="Open P&L" value={`${pnl >= 0 ? "+" : ""}${money(pnl)}`} />
        <Metric label="Deposited" value={money(account.totalDepositedCents)} />
      </div>
      {rows.length === 0 ? (
        <div className="rounded-[14px] border border-slate-200 bg-white p-5 text-center shadow-sm">
          <h2 className="font-black text-slate-950">No investments yet</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Browse the market when you are ready.</p>
          <button onClick={onGoMarket} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white">Go to Market</button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm">
          {rows.map(({ holding, asset, price }) => (
            <button key={holding.assetSymbol} onClick={() => onSelectAsset(holding.assetSymbol)} className="flex w-full items-center gap-3 border-b border-slate-100 p-3 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-xl">{asset!.emoji}</div>
              <div className="flex-1"><p className="text-sm font-black">{asset!.name}</p><p className="text-xs font-bold text-slate-400">{holding.quantity.toFixed(6)} · avg {money(holding.avgCostCents)}</p></div>
              <div className="text-right text-sm font-black tabular-nums">{price ? money(holdingValueCents(holding.quantity, price.priceCents)) : "Unavailable"}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">{label}</p><p className="mt-1 text-lg font-black tabular-nums text-slate-950">{value}</p></div>;
}
