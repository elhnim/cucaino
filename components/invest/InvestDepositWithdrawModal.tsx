"use client";

import { useState, useTransition } from "react";
import { depositToInvest, withdrawFromInvest } from "@/lib/actions/invest";
import { MIN_TRADE_CENTS } from "@/lib/invest/assets";

function money(cents: number): string { return `$${(cents / 100).toFixed(2)}`; }

export default function InvestDepositWithdrawModal({
  mode,
  kidId,
  cashBalance,
  accountCashCents,
  onClose,
}: {
  mode: "deposit" | "withdraw";
  kidId: string;
  cashBalance: number;
  accountCashCents: number;
  onClose: () => void;
}) {
  const [active, setActive] = useState(mode);
  const [amount, setAmount] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const max = active === "deposit" ? cashBalance : accountCashCents;
  const validation = amount < MIN_TRADE_CENTS ? "Minimum is $0.50." : amount > max ? "Amount is more than available." : null;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = active === "deposit" ? await depositToInvest(kidId, amount) : await withdrawFromInvest(kidId, amount);
      if (result.ok) onClose();
      else setError(result.error);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50" onClick={(e) => e.currentTarget === e.target && onClose()}>
      <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-950">Move cash</h2>
          <button onClick={onClose} className="text-2xl font-black text-slate-400">×</button>
        </div>
        <div className="mb-4 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
          {(["deposit", "withdraw"] as const).map((m) => <button key={m} onClick={() => setActive(m)} className={`rounded-lg py-2 text-sm font-black capitalize ${active === m ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}>{m}</button>)}
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Cash</p><p className="text-lg font-black tabular-nums">{money(cashBalance)}</p></div>
          <div className="rounded-xl bg-indigo-50 p-3"><p className="text-xs font-black text-indigo-400">Invest</p><p className="text-lg font-black tabular-nums text-indigo-900">{money(accountCashCents)}</p></div>
        </div>
        <input type="number" min="0.5" step="0.5" value={(amount / 100).toString()} onChange={(e) => setAmount(Math.round(Number(e.target.value) * 100))} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-lg font-black outline-none focus:ring-2 focus:ring-indigo-200" />
        <div className="mt-3 flex gap-2">{[100, 200, 500].map((c) => <button key={c} onClick={() => setAmount(c)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black">${c / 100}</button>)}<button onClick={() => setAmount(max)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black">Max</button></div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-600">After: cash {money(active === "deposit" ? cashBalance - amount : cashBalance + amount)} · invest {money(active === "deposit" ? accountCashCents + amount : accountCashCents - amount)}</div>
        {(validation || error) && <p className="mt-3 text-sm font-bold text-red-600">{validation ?? error}</p>}
        <button onClick={submit} disabled={pending || Boolean(validation)} className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{pending ? "Working..." : active === "deposit" ? "Deposit" : "Withdraw"}</button>
      </div>
    </div>
  );
}
