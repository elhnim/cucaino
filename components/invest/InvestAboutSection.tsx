"use client";

import type { AssetAbout } from "@/lib/domain/types";

export default function InvestAboutSection({ about }: { about: AssetAbout }) {
  return (
    <section className="space-y-4 rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-lg font-black text-slate-950">About</h3>
      <p className="text-sm font-semibold leading-6 text-slate-600">{about.story}</p>
      <div className="grid grid-cols-3 gap-2">
        {about.facts.map((fact) => (
          <div key={fact.label} className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase text-slate-400">{fact.label}</p>
            <p className="mt-1 text-xs font-black text-slate-800">{fact.value}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {about.whyGreat.map((item) => (
          <div key={item.text} className="flex gap-2 text-sm font-semibold text-slate-600"><span>{item.emoji}</span><span>{item.text}</span></div>
        ))}
      </div>
      <div className="rounded-xl bg-indigo-50 p-3 text-sm font-bold text-indigo-900">Did you know? {about.didYouKnow}</div>
    </section>
  );
}
