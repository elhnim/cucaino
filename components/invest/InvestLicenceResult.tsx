"use client";

export default function InvestLicenceResult({ score, passed, onMarket, onLearn, onRetry }: { score: number; passed: boolean; onMarket: () => void; onLearn: () => void; onRetry: () => void }) {
  return (
    <div className={`rounded-[14px] p-6 text-center shadow-sm ${passed ? "bg-gradient-to-br from-slate-800 via-indigo-900 to-indigo-700 text-white" : "border border-slate-200 bg-white text-slate-950"}`}>
      <div className="text-5xl">{passed ? "🏅" : "📚"}</div>
      <h2 className="mt-3 text-2xl font-black">{passed ? "Investor Licence passed" : "Not passed yet"}</h2>
      <p className="mt-2 text-sm font-bold opacity-80">Score: {score}/5</p>
      {passed ? <p className="mt-3 text-sm font-bold">Badge earned · ⚡50 Sparks · 🔓 Buying unlocked</p> : <p className="mt-3 text-sm font-bold text-slate-500">Review the basics and try again. You can retry anytime.</p>}
      <div className="mt-5 grid grid-cols-2 gap-2">
        {passed ? <button onClick={onMarket} className="rounded-xl bg-white px-4 py-3 text-sm font-black text-indigo-700">Start investing</button> : <button onClick={onRetry} className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white">Try again</button>}
        <button onClick={onLearn} className={`rounded-xl px-4 py-3 text-sm font-black ${passed ? "bg-white/10 text-white" : "border border-slate-200 text-slate-700"}`}>Keep learning</button>
      </div>
    </div>
  );
}
