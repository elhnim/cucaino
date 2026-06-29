"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Course } from "@/lib/courses/types";
import { completeLesson, type LessonProgress } from "@/lib/actions/course";

type View =
  | { mode: "overview" }
  | { mode: "lesson"; idx: number }
  | { mode: "quiz"; idx: number }
  | { mode: "result"; idx: number; score: number; passed: boolean; starsAwarded: number };

export default function CourseClient({
  course,
  kidId,
  initialProgress,
}: {
  course: Course;
  kidId: string | null;
  initialProgress: LessonProgress[];
}) {
  const backHref = kidId ? `/kid/${kidId}/play` : "/play/learn";
  const [progress, setProgress] = useState<Record<string, LessonProgress>>(
    () => Object.fromEntries(initialProgress.map((p) => [p.lessonId, p])),
  );
  const [view, setView] = useState<View>({ mode: "overview" });

  const isDone = (lessonId: string) => !!progress[lessonId]?.completedAt;
  const isUnlocked = (idx: number) => idx === 0 || isDone(course.lessons[idx - 1].id);
  const doneCount = course.lessons.filter((l) => isDone(l.id)).length;

  if (view.mode === "lesson") {
    const lesson = course.lessons[view.idx];
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-rose-50">
        <div className="max-w-lg mx-auto p-4 pt-5">
          <button onClick={() => setView({ mode: "overview" })} className="text-sm font-bold text-gray-500 mb-4">← Lessons</button>
          <div className="text-center mb-4">
            <div className="text-5xl mb-1">{lesson.emoji}</div>
            <h1 className="text-2xl font-black text-gray-900">{lesson.title}</h1>
            <p className="text-sm text-gray-500">Lesson {view.idx + 1} of {course.lessons.length}</p>
          </div>
          {/* 1. Hook — spark curiosity before teaching */}
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-4 mb-4">
            <p className="text-xs font-black uppercase text-indigo-500 mb-1">🤔 Think about it</p>
            <p className="text-indigo-900 font-semibold">{lesson.hook}</p>
          </div>

          {/* 2. Story — concrete narrative */}
          <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 border-l-4 border-rose-300">
            <p className="text-xs font-black uppercase text-rose-400 mb-1">📖 Story</p>
            <h3 className="font-black text-rose-900 mb-2">{lesson.story.title}</h3>
            <div className="space-y-2">
              {lesson.story.paragraphs.map((p, i) => (
                <p key={i} className="text-gray-700 leading-relaxed">{p}</p>
              ))}
            </div>
            {lesson.story.moral && <p className="mt-3 text-sm font-bold text-rose-700">💡 {lesson.story.moral}</p>}
          </div>

          {/* 3. Big idea — name the principle */}
          <div className="bg-rose-500 text-white rounded-2xl p-4 mb-4 shadow-sm">
            <p className="text-xs font-black uppercase text-rose-100 mb-1">🌟 The big idea</p>
            <p className="font-bold leading-relaxed">{lesson.bigIdea}</p>
          </div>

          {/* 4. Why it works / watch out */}
          <div className="space-y-3 mb-4">
            {lesson.reading.map((b, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-sm p-4">
                {b.heading && <h3 className="font-black text-rose-900 mb-1">{b.heading}</h3>}
                <p className="text-gray-700 leading-relaxed">{b.body}</p>
              </div>
            ))}
          </div>

          {/* 5. Real examples — transfer */}
          {lesson.realExamples.length > 0 && (
            <div className="bg-sky-50 border-2 border-sky-200 rounded-2xl p-4 mb-4">
              <p className="text-xs font-black uppercase text-sky-600 mb-2">🌍 In real life</p>
              <ul className="space-y-1.5">
                {lesson.realExamples.map((e, i) => (
                  <li key={i} className="flex gap-2 text-gray-700 leading-snug"><span className="text-sky-400 font-black">•</span><span>{e}</span></li>
                ))}
              </ul>
            </div>
          )}

          {/* 6. Reflect — metacognition before practice */}
          <div className="bg-violet-50 border-2 border-violet-200 rounded-2xl p-4 mb-4">
            <p className="text-xs font-black uppercase text-violet-500 mb-1">🪞 Pause &amp; reflect</p>
            <p className="text-violet-900 font-semibold">{lesson.reflect}</p>
          </div>

          {/* 7. Try it — real-world action */}
          <div className="bg-amber-100 border-2 border-amber-200 rounded-2xl p-4 mb-5">
            <p className="text-xs font-black uppercase text-amber-600 mb-1">⭐ Try it today</p>
            <p className="text-amber-900 font-semibold">{lesson.tryIt}</p>
          </div>

          <button
            onClick={() => setView({ mode: "quiz", idx: view.idx })}
            className="w-full py-4 rounded-2xl font-black text-white text-lg bg-rose-500 hover:bg-rose-600 active:bg-rose-700 transition-colors"
          >
            Practice quiz 📝
          </button>
        </div>
      </div>
    );
  }

  if (view.mode === "quiz") {
    return (
      <QuizRunner
        course={course}
        idx={view.idx}
        kidId={kidId}
        onCancel={() => setView({ mode: "lesson", idx: view.idx })}
        onDone={(score, passed, starsAwarded, total) => {
          const lesson = course.lessons[view.idx];
          setProgress((prev) => {
            const prevP = prev[lesson.id];
            return {
              ...prev,
              [lesson.id]: {
                lessonId: lesson.id,
                bestScore: Math.max(prevP?.bestScore ?? 0, score),
                total,
                starsAwarded: (prevP?.starsAwarded ?? 0) + starsAwarded,
                completedAt: passed ? new Date().toISOString() : prevP?.completedAt ?? null,
              },
            };
          });
          setView({ mode: "result", idx: view.idx, score, passed, starsAwarded });
        }}
      />
    );
  }

  if (view.mode === "result") {
    const lesson = course.lessons[view.idx];
    const total = lesson.quiz.length;
    const nextIdx = view.idx + 1;
    const hasNext = nextIdx < course.lessons.length;
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-rose-50 flex items-center">
        <div className="max-w-lg mx-auto p-4 w-full text-center">
          <style>{`@keyframes vp-float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-14px) rotate(10deg)}}`}</style>
          <div className="text-6xl mb-3" style={{ animation: view.passed ? "vp-float 1.6s ease-in-out infinite" : undefined }}>
            {view.passed ? "🎉" : "💪"}
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-1">{view.passed ? "Lesson passed!" : "Almost there!"}</h1>
          <p className="text-gray-600 font-semibold mb-4">You scored {view.score} / {total}</p>
          {view.starsAwarded > 0 && (
            <div className="inline-block bg-amber-100 border-2 border-amber-300 rounded-2xl px-5 py-2 mb-4">
              <span className="text-lg font-black text-amber-800">+{view.starsAwarded} ⭐ earned!</span>
            </div>
          )}
          {!view.passed && (
            <p className="text-sm text-gray-500 mb-4">You need {Math.ceil(total * course.passPct)} correct to pass. Give it another go!</p>
          )}
          <div className="space-y-2">
            {!view.passed && (
              <button onClick={() => setView({ mode: "quiz", idx: view.idx })} className="w-full py-3.5 rounded-2xl font-black text-white text-lg bg-rose-500 hover:bg-rose-600 transition-colors">Try again 🔁</button>
            )}
            {view.passed && hasNext && (
              <button onClick={() => setView({ mode: "lesson", idx: nextIdx })} className="w-full py-3.5 rounded-2xl font-black text-white text-lg bg-rose-500 hover:bg-rose-600 transition-colors">Next lesson ▶</button>
            )}
            {view.passed && !hasNext && (
              <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 mb-1">
                <p className="font-black text-emerald-800">🏆 You finished the whole course!</p>
              </div>
            )}
            <button onClick={() => setView({ mode: "overview" })} className="w-full py-3 rounded-2xl font-bold text-gray-600 border-2 border-gray-200 hover:bg-gray-50">Back to lessons</button>
          </div>
        </div>
      </div>
    );
  }

  // overview
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-rose-50">
      <div className="max-w-lg mx-auto p-4 pt-5">
        <div className="flex items-center gap-3 mb-4">
          <Link href={backHref} className="text-sm font-bold text-gray-500 shrink-0">← Back</Link>
          <h1 className="text-2xl font-black text-rose-900 flex-1">{course.emoji} {course.title}</h1>
        </div>

        <div className="bg-white/80 backdrop-blur rounded-3xl p-5 shadow-sm mb-4">
          <p className="text-gray-700 font-semibold mb-3">{course.about}</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full rounded-full bg-rose-500 transition-all" style={{ width: `${(doneCount / course.lessons.length) * 100}%` }} />
            </div>
            <span className="text-xs font-black text-gray-500">{doneCount}/{course.lessons.length}</span>
          </div>
        </div>

        <div className="space-y-2">
          {course.lessons.map((lesson, idx) => {
            const done = isDone(lesson.id);
            const unlocked = isUnlocked(idx);
            const best = progress[lesson.id];
            return (
              <button
                key={lesson.id}
                type="button"
                disabled={!unlocked}
                onClick={() => unlocked && setView({ mode: "lesson", idx })}
                className={`w-full rounded-2xl shadow-sm p-4 flex items-center gap-3 text-left transition-all ${
                  unlocked ? "bg-white active:scale-[0.98]" : "bg-gray-100 opacity-70"
                }`}
              >
                <span className="text-3xl shrink-0">{unlocked ? lesson.emoji : "🔒"}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-gray-900">{idx + 1}. {lesson.title}</div>
                  <div className="text-xs text-gray-500 truncate">{lesson.summary}</div>
                </div>
                {done ? (
                  <span className="shrink-0 text-xs font-black text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1">
                    ✓ {best ? `${best.bestScore}/${best.total}` : "done"}
                  </span>
                ) : unlocked ? (
                  <span className="shrink-0 text-xs font-black text-rose-600">Start →</span>
                ) : (
                  <span className="shrink-0 text-xs font-bold text-gray-400">Locked</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function QuizRunner({
  course,
  idx,
  kidId,
  onDone,
  onCancel,
}: {
  course: Course;
  idx: number;
  kidId: string | null;
  onDone: (score: number, passed: boolean, starsAwarded: number, total: number) => void;
  onCancel: () => void;
}) {
  const lesson = course.lessons[idx];
  const total = lesson.quiz.length;
  const [qi, setQi] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const question = lesson.quiz[qi];
  const answered = picked !== null;

  // Shuffle option order per question so the correct answer is never in a
  // predictable position (and re-tries feel different).
  const shuffled = useMemo(() => {
    const arr = question.options.map((text, i) => ({ text, correct: i === question.answer }));
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi, lesson.id]);

  const choose = (i: number) => {
    if (answered) return;
    setPicked(i);
    if (shuffled[i].correct) setScore((s) => s + 1);
  };

  const next = async () => {
    const finalScore = score; // already includes this question
    if (qi + 1 < total) {
      setQi(qi + 1);
      setPicked(null);
      return;
    }
    // finished
    const passed = total > 0 && finalScore / total >= course.passPct;
    let starsAwarded = 0;
    if (kidId) {
      setSubmitting(true);
      const res = await completeLesson(kidId, course.id, lesson.id, finalScore);
      setSubmitting(false);
      if (res.ok) starsAwarded = res.starsAwarded;
    }
    onDone(finalScore, passed, starsAwarded, total);
  };

  const optionClass = (i: number) => {
    if (!answered) return "border-gray-200 bg-white hover:bg-gray-50";
    if (shuffled[i].correct) return "border-emerald-400 bg-emerald-50";
    if (i === picked) return "border-rose-400 bg-rose-50";
    return "border-gray-200 bg-white opacity-60";
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-rose-50">
      <div className="max-w-lg mx-auto p-4 pt-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onCancel} className="text-sm font-bold text-gray-500">← Lesson</button>
          <span className="text-sm font-black text-gray-500">Question {qi + 1}/{total}</span>
        </div>

        <div className="h-2 rounded-full bg-gray-200 overflow-hidden mb-4">
          <div className="h-full rounded-full bg-rose-500 transition-all" style={{ width: `${(qi / total) * 100}%` }} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
          <p className="text-lg font-black text-gray-900">{question.q}</p>
        </div>

        <div className="space-y-2 mb-4">
          {shuffled.map((opt, i) => (
            <button
              key={i}
              type="button"
              onClick={() => choose(i)}
              disabled={answered}
              className={`w-full text-left rounded-2xl border-2 p-3.5 font-semibold text-gray-800 transition-all ${optionClass(i)}`}
            >
              {opt.text}
              {answered && opt.correct && <span className="ml-2">✅</span>}
              {answered && i === picked && !opt.correct && <span className="ml-2">❌</span>}
            </button>
          ))}
        </div>

        {answered && (
          <>
            {question.explain && <p className="text-sm text-gray-600 mb-3 px-1">{question.explain}</p>}
            <button
              onClick={next}
              disabled={submitting}
              className="w-full py-4 rounded-2xl font-black text-white text-lg bg-rose-500 hover:bg-rose-600 active:bg-rose-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Saving…" : qi + 1 < total ? "Next question ▶" : "Finish & see score 🎯"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
