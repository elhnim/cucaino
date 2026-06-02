"use client";

import { useState, useTransition } from "react";
import type { Lesson } from "@/lib/domain/types";
import { completeLesson } from "@/lib/actions/invest";

export default function InvestLessonReader({ kidId, lesson, onDone }: { kidId: string; lesson: Lesson; onDone: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  function done() {
    startTransition(async () => {
      await completeLesson(kidId, lesson.id);
      onDone();
    });
  }
  return (
    <div className="space-y-4">
      <button onClick={onDone} className="text-sm font-black text-slate-400">← Learn</button>
      <div className="rounded-[14px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-4xl">{lesson.emoji}</div>
        <h2 className="mt-2 text-2xl font-black text-slate-950">{lesson.title}</h2>
        <p className="mt-1 text-sm font-bold text-slate-400">{lesson.minutes} min</p>
      </div>
      {lesson.body.map((block, i) => {
        if (block.kind === "para") return <p key={i} className="text-base font-semibold leading-7 text-slate-700">{block.text}</p>;
        if (block.kind === "illustration") return <div key={i} className="rounded-[14px] bg-indigo-50 p-5 text-center"><div className="text-5xl">{block.emoji}</div><p className="mt-2 text-sm font-black text-indigo-900">{block.caption}</p></div>;
        if (block.kind === "keyIdea") return <div key={i} className="rounded-[14px] border border-indigo-100 bg-indigo-50 p-4 text-sm font-black text-indigo-900">Key idea: {block.text}</div>;
        if (block.kind === "example") return <div key={i} className="rounded-[14px] border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700"><span className="mr-2">{block.emoji}</span>{block.text}</div>;
        return <div key={i} className="rounded-[14px] bg-slate-100 p-4 text-sm font-bold text-slate-600">Did you know? {block.text}</div>;
      })}
      {lesson.check && <div className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm"><p className="font-black">{lesson.check.question}</p><div className="mt-3 space-y-2">{lesson.check.options.map((option, index) => <button key={option} onClick={() => setPicked(index)} className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-bold ${picked === index ? "border-indigo-500 bg-indigo-50" : "border-slate-200"}`}>{option}</button>)}</div>{picked !== null && <p className="mt-3 text-sm font-bold text-indigo-700">{lesson.check.correctNote}</p>}</div>}
      <button onClick={done} disabled={pending} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">Mark complete & continue</button>
    </div>
  );
}
