"use client";

import type { InvestTransaction, RealAsset } from "@/lib/domain/types";

function money(cents: number): string { return `$${(Math.abs(cents) / 100).toFixed(2)}`; }

export default function InvestActivityTab({ transactions, assets, onGoMarket, onDeposit }: { transactions: InvestTransaction[]; assets: RealAsset[]; onGoMarket: () => void; onDeposit: () => void }) {
  if (transactions.length === 0) {
    return <div className="rounded-[14px] border border-slate-200 bg-white p-5 text-center shadow-sm"><h2 className="font-black">No Invest activity yet</h2><div className="mt-4 flex justify-center gap-2"><button onClick={onDeposit} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white">Deposit</button><button onClick={onGoMarket} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black">Market</button></div></div>;
  }
  return (
    <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm">
      {transactions.map((tx) => {
        const asset = assets.find((a) => a.symbol === tx.assetSymbol);
        const sign = tx.type === "buy" || tx.type === "withdraw" ? "-" : "+";
        const icon = tx.type === "deposit" ? "💵" : tx.type === "withdraw" ? "🏦" : tx.type === "buy" ? "📈" : "📉";
        const label = tx.type === "buy" ? `Bought ${asset?.name ?? tx.assetSymbol}` : tx.type === "sell" ? `Sold ${asset?.name ?? tx.assetSymbol}` : tx.type === "deposit" ? "Deposited from cash" : "Withdrew to cash";
        return <div key={tx.id} className="flex items-center gap-3 border-b border-slate-100 p-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-xl">{icon}</div><div className="flex-1"><p className="text-sm font-black">{label}</p><p className="text-xs font-bold text-slate-400">{new Date(tx.createdAt).toLocaleDateString()}</p></div><p className={`text-sm font-black tabular-nums ${sign === "+" ? "text-emerald-700" : "text-red-700"}`}>{sign}{money(tx.totalCents)}</p></div>;
      })}
      <p className="p-3 text-xs font-bold text-slate-400">Deposits & withdrawals also show in your cash history.</p>
    </div>
  );
}
