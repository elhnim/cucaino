"use client";

import { useState, useTransition } from "react";
import { submitLicenceQuiz } from "@/lib/actions/invest";
import { LICENCE_QUIZ } from "@/lib/invest/learn";

export default function InvestLicenceQuiz({ kidId, onResult }: { kidId: string; onResult: (score: number, passed: boolean) => void }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [pending, startTransition] = useTransition();
  const q = LICENCE_QUIZ[index];
  const selected = answers[index];
  function choose(i: number) {
    const next = [...answers];
    next[index] = i;
    setAnswers(next);
  }
  function next() {
    if (index < LICENCE_QUIZ.length - 1) setIndex(index + 1);
    else startTransition(async () => {
      const result = await submitLicenceQuiz(kidId, answers);
      if (result.ok) onResult(result.score, result.passed);
    });
  }
  return (
    <div className="rounded-[14px] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase text-slate-400">Question {index + 1} of {LICENCE_QUIZ.length} · Get 4 of 5</p>
      <h2 className="mt-3 text-xl font-black text-slate-950">{q.question}</h2>
      <div className="mt-4 space-y-2">{q.options.map((option, i) => <button key={option} onClick={() => choose(i)} className={`w-full rounded-xl border px-3 py-3 text-left text-sm font-black ${selected === i ? "border-indigo-500 bg-indigo-50 text-indigo-800" : "border-slate-200 text-slate-700"}`}>{option}</button>)}</div>
      {selected !== undefined && <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm font-bold text-slate-600">Why? {q.explainer}</div>}
      <button onClick={next} disabled={selected === undefined || pending} className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{index === LICENCE_QUIZ.length - 1 ? "Submit" : "Next"}</button>
    </div>
  );
}
