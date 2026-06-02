"use client";

import { useState } from "react";
import type { InvestLicence } from "@/lib/domain/types";
import { GLOSSARY, LESSONS, REQUIRED_LESSON_IDS } from "@/lib/invest/learn";
import InvestLessonReader from "@/components/invest/InvestLessonReader";
import InvestLicenceQuiz from "@/components/invest/InvestLicenceQuiz";
import InvestLicenceResult from "@/components/invest/InvestLicenceResult";

export default function InvestLearnTab({ kidId, licence, onGoMarket }: { kidId: string; licence: InvestLicence; onGoMarket: () => void }) {
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [quiz, setQuiz] = useState(false);
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);
  const completed = REQUIRED_LESSON_IDS.filter((id) => licence.lessonsCompleted.includes(id)).length;
  const selectedLesson = lessonId ? LESSONS.find((lesson) => lesson.id === lessonId) : null;
  if (selectedLesson) return <InvestLessonReader kidId={kidId} lesson={selectedLesson} onDone={() => setLessonId(null)} />;
  if (result) return <InvestLicenceResult score={result.score} passed={result.passed} onMarket={onGoMarket} onLearn={() => setResult(null)} onRetry={() => { setResult(null); setQuiz(true); }} />;
  if (quiz) return <InvestLicenceQuiz kidId={kidId} onResult={(score, passed) => { setQuiz(false); setResult({ score, passed }); }} />;

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] bg-gradient-to-br from-slate-800 via-indigo-900 to-indigo-700 p-5 text-white shadow-sm">
        <p className="text-sm font-black text-indigo-100">🎟️ Investor Licence</p>
        <h2 className="mt-1 text-3xl font-black">{completed}/4 basics</h2>
        <div className="mt-4 h-2 rounded-full bg-white/20"><div className="h-2 rounded-full bg-white" style={{ width: `${(completed / 4) * 100}%` }} /></div>
      </div>
      <Section title="Required · Basics" lessons={LESSONS.filter((l) => l.section === "basics")} completed={licence.lessonsCompleted} onLesson={setLessonId} />
      <button disabled={completed < 4} onClick={() => setQuiz(true)} className="w-full rounded-[14px] border border-indigo-100 bg-indigo-50 p-4 text-left font-black text-indigo-900 disabled:opacity-50">Take the Investor Licence test →</button>
      <Section title="Going deeper" lessons={LESSONS.filter((l) => l.section === "deeper")} completed={licence.lessonsCompleted} onLesson={setLessonId} />
      <Section title="Stay smart & safe" lessons={LESSONS.filter((l) => l.section === "safe")} completed={licence.lessonsCompleted} onLesson={setLessonId} />
      <div className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm"><h3 className="font-black">Money words</h3><div className="mt-3 space-y-2">{GLOSSARY.map((g) => <p key={g.term} className="text-sm text-slate-600"><span className="font-black text-slate-900">{g.term}:</span> {g.definition}</p>)}</div></div>
    </div>
  );
}

function Section({ title, lessons, completed, onLesson }: { title: string; lessons: typeof LESSONS; completed: string[]; onLesson: (id: string) => void }) {
  return <section><h3 className="mb-2 text-xs font-black uppercase text-slate-400">{title}</h3><div className="space-y-2">{lessons.map((lesson) => <button key={lesson.id} onClick={() => onLesson(lesson.id)} className="flex w-full items-center gap-3 rounded-[14px] border border-slate-200 bg-white p-3 text-left shadow-sm"><div className="text-2xl">{lesson.emoji}</div><div className="flex-1"><p className="text-sm font-black">{lesson.title}</p><p className="text-xs font-bold text-slate-400">{lesson.blurb}</p></div><span className="text-sm font-black text-indigo-600">{completed.includes(lesson.id) ? "✓" : "Start"}</span></button>)}</div></section>;
}
