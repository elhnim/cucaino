"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { LibraryStory } from "@/lib/stories/types";
import { completeStory, completeStoryRead, type StoryProgress } from "@/lib/actions/stories";

type View =
  | { mode: "shelf" }
  | { mode: "read"; id: string }
  | { mode: "quiz"; id: string }
  | { mode: "result"; id: string; score: number; passed: boolean; starsAwarded: number; total: number };

// Classic hardcover palette — deterministic per book id so covers stay stable across renders.
const COVER_PALETTE = [
  { from: "from-rose-800", to: "to-rose-950", spine: "bg-rose-950" },
  { from: "from-emerald-800", to: "to-emerald-950", spine: "bg-emerald-950" },
  { from: "from-indigo-800", to: "to-indigo-950", spine: "bg-indigo-950" },
  { from: "from-amber-700", to: "to-amber-900", spine: "bg-amber-900" },
  { from: "from-fuchsia-800", to: "to-fuchsia-950", spine: "bg-fuchsia-950" },
  { from: "from-teal-800", to: "to-teal-950", spine: "bg-teal-950" },
  { from: "from-orange-800", to: "to-orange-950", spine: "bg-orange-950" },
  { from: "from-slate-700", to: "to-slate-900", spine: "bg-slate-900" },
];

function coverStyle(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COVER_PALETTE[hash % COVER_PALETTE.length];
}

function BookCover({
  story,
  className = "",
  size = "sm",
  children,
}: {
  story: LibraryStory;
  className?: string;
  size?: "sm" | "lg";
  children?: React.ReactNode;
}) {
  const c = coverStyle(story.id);
  const titleSize = size === "lg" ? "text-xl" : "text-xs";
  const authorSize = size === "lg" ? "text-xs" : "text-[9px]";
  return (
    <div className={`relative rounded-r-lg rounded-l-sm bg-gradient-to-br ${c.from} ${c.to} shadow-md overflow-hidden flex flex-col items-center justify-center text-center px-3 ${className}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-2 ${c.spine} shadow-[inset_-2px_0_3px_rgba(0,0,0,0.4)]`} />
      <div className="absolute right-0 top-1 bottom-1 w-1.5 bg-gradient-to-l from-white/40 to-transparent" />
      <div className="w-8 h-px bg-white/40 mb-2" />
      <p className={`font-serif font-black text-white leading-tight drop-shadow-sm line-clamp-4 ${titleSize}`}>
        {story.title}
      </p>
      <div className="w-8 h-px bg-white/40 mt-2" />
      {story.author && <p className={`${authorSize} font-semibold text-white/70 mt-2 uppercase tracking-wide`}>{story.author}</p>}
      {children}
    </div>
  );
}

export default function StoryLibrary({
  stories,
  kidId,
  initialProgress,
}: {
  stories: LibraryStory[];
  kidId: string | null;
  initialProgress: StoryProgress[];
}) {
  const backHref = kidId ? `/kid/${kidId}/play` : "/select-kid";
  const [progress, setProgress] = useState<Record<string, StoryProgress>>(
    () => Object.fromEntries(initialProgress.map((p) => [p.storyId, p])),
  );
  const [view, setView] = useState<View>({ mode: "shelf" });
  const [chapterIdx, setChapterIdx] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const storyById = (id: string) => stories.find((s) => s.id === id)!;
  const openStory = (id: string) => { setChapterIdx(null); setView({ mode: "read", id }); };

  const finishReading = async (s: LibraryStory) => {
    let starsAwarded = 0;
    if (kidId) {
      setFinishing(true);
      const res = await completeStoryRead(kidId, s.id);
      setFinishing(false);
      if (res.ok) starsAwarded = res.starsAwarded;
    }
    setProgress((prev) => ({
      ...prev,
      [s.id]: {
        storyId: s.id,
        bestScore: 0,
        total: 0,
        starsAwarded: (prev[s.id]?.starsAwarded ?? 0) + starsAwarded,
        completedAt: new Date().toISOString(),
      },
    }));
    setView({ mode: "result", id: s.id, score: 0, passed: true, starsAwarded, total: 0 });
  };

  if (view.mode === "read") {
    const s = storyById(view.id);

    const hasQuiz = (s.quiz?.length ?? 0) > 0;

    // ---- Chapter book ----
    if (s.chapters && s.chapters.length > 0) {
      const chapters = s.chapters;
      if (chapterIdx === null) {
        return (
          <Frame>
            <button onClick={() => setView({ mode: "shelf" })} className="text-sm font-bold text-gray-500 mb-3">← Library</button>
            <div className="bg-white rounded-2xl shadow-sm p-4 mb-4 flex gap-4 items-center">
              <BookCover story={s} size="lg" className="w-24 aspect-[2/3] shrink-0" />
              <div>
                <h1 className="text-xl font-black text-indigo-900 leading-tight">{s.title}</h1>
                {s.author && <p className="text-sm font-bold text-gray-500">by {s.author}</p>}
                <p className="text-xs font-bold text-gray-400 mt-1">{s.level} · {chapters.length} chapters · ~{s.minutes} min</p>
              </div>
            </div>
            <div className="space-y-2">
              {chapters.map((ch, i) => (
                <button key={i} onClick={() => setChapterIdx(i)} className="w-full bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform">
                  <span className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-black text-sm flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="font-bold text-gray-900 flex-1">{ch.title}</span>
                  <span className="text-indigo-400 font-black">→</span>
                </button>
              ))}
            </div>
            {hasQuiz ? (
              <button onClick={() => setView({ mode: "quiz", id: s.id })} className="w-full mt-4 py-3.5 rounded-2xl font-black text-indigo-700 border-2 border-indigo-200 hover:bg-indigo-50 transition-colors">
                Skip to quiz 📝
              </button>
            ) : (
              <button onClick={() => finishReading(s)} disabled={finishing} className="w-full mt-4 py-3.5 rounded-2xl font-black text-indigo-700 border-2 border-indigo-200 hover:bg-indigo-50 transition-colors disabled:opacity-50">
                {finishing ? "Saving…" : "Mark as finished ✅"}
              </button>
            )}
          </Frame>
        );
      }
      const ch = chapters[chapterIdx];
      const isLast = chapterIdx === chapters.length - 1;
      return (
        <Frame>
          <button onClick={() => setChapterIdx(null)} className="text-sm font-bold text-gray-500 mb-3">← Chapters</button>
          <p className="text-xs font-black uppercase tracking-widest text-indigo-400">Chapter {chapterIdx + 1} of {chapters.length}</p>
          <h2 className="text-xl font-black text-indigo-900 mb-3">{ch.title}</h2>
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3 mb-4">
            {ch.paragraphs.map((p, i) => (
              <p key={i} className="text-gray-800 leading-relaxed">{p}</p>
            ))}
          </div>
          <div className="flex gap-2">
            {chapterIdx > 0 && (
              <button onClick={() => setChapterIdx(chapterIdx - 1)} className="flex-1 py-3.5 rounded-2xl font-bold text-gray-600 border-2 border-gray-200 hover:bg-gray-50">← Previous</button>
            )}
            {!isLast ? (
              <button onClick={() => setChapterIdx(chapterIdx + 1)} className="flex-1 py-3.5 rounded-2xl font-black text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 transition-colors">Next chapter →</button>
            ) : hasQuiz ? (
              <button onClick={() => setView({ mode: "quiz", id: s.id })} className="flex-1 py-3.5 rounded-2xl font-black text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 transition-colors">Finish · quiz 📝</button>
            ) : (
              <button onClick={() => finishReading(s)} disabled={finishing} className="flex-1 py-3.5 rounded-2xl font-black text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 transition-colors disabled:opacity-50">
                {finishing ? "Saving…" : "Finish book 🎉"}
              </button>
            )}
          </div>
        </Frame>
      );
    }

    // ---- Single-read story ----
    return (
      <Frame>
        <button onClick={() => setView({ mode: "shelf" })} className="text-sm font-bold text-gray-500 mb-3">← Library</button>
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-4">
          <div className="flex gap-4 items-center mb-4">
            <BookCover story={s} size="lg" className="w-24 aspect-[2/3] shrink-0" />
            <div>
              <h1 className="text-xl font-black text-indigo-900 leading-tight">{s.title}</h1>
              {s.author && <p className="text-sm font-bold text-gray-500">by {s.author}</p>}
              <p className="text-xs font-bold text-gray-400 mt-1">{s.level} · ~{s.minutes} min read</p>
            </div>
          </div>
          <div className="space-y-3">
            {(s.paragraphs ?? []).map((p, i) => (
              <p key={i} className="text-gray-800 leading-relaxed">{p}</p>
            ))}
          </div>
          {s.moral && <p className="mt-4 text-sm font-bold text-indigo-700">💡 {s.moral}</p>}
        </div>
        {hasQuiz ? (
          <button onClick={() => setView({ mode: "quiz", id: s.id })} className="w-full py-4 rounded-2xl font-black text-white text-lg bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 transition-colors">
            Comprehension quiz 📝
          </button>
        ) : (
          <button onClick={() => finishReading(s)} disabled={finishing} className="w-full py-4 rounded-2xl font-black text-white text-lg bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 transition-colors disabled:opacity-50">
            {finishing ? "Saving…" : "I've read this! ✅"}
          </button>
        )}
      </Frame>
    );
  }

  if (view.mode === "quiz") {
    const s = storyById(view.id);
    return (
      <StoryQuiz
        story={s}
        kidId={kidId}
        onCancel={() => setView({ mode: "read", id: s.id })}
        onDone={(score, passed, starsAwarded, total) => {
          if (passed) {
            setProgress((prev) => ({
              ...prev,
              [s.id]: {
                storyId: s.id,
                bestScore: Math.max(prev[s.id]?.bestScore ?? 0, score),
                total,
                starsAwarded: (prev[s.id]?.starsAwarded ?? 0) + starsAwarded,
                completedAt: new Date().toISOString(),
              },
            }));
          }
          setView({ mode: "result", id: s.id, score, passed, starsAwarded, total });
        }}
      />
    );
  }

  if (view.mode === "result") {
    return (
      <Frame center>
        <div className="text-center">
          <style>{`@keyframes vp-float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-12px) rotate(8deg)}}`}</style>
          <div className="text-6xl mb-3" style={{ animation: view.passed ? "vp-float 1.6s ease-in-out infinite" : undefined }}>{view.passed ? "🌟" : "📖"}</div>
          <h1 className="text-3xl font-black text-gray-900 mb-1">{view.passed ? "Nice reading!" : "Give it another read"}</h1>
          <p className="text-gray-600 font-semibold mb-4">You scored {view.score} / {view.total}</p>
          {view.starsAwarded > 0 && (
            <div className="inline-block bg-amber-100 border-2 border-amber-300 rounded-2xl px-5 py-2 mb-4">
              <span className="text-lg font-black text-amber-800">+{view.starsAwarded} ⭐ earned!</span>
            </div>
          )}
          <div className="space-y-2">
            {!view.passed && <button onClick={() => setView({ mode: "quiz", id: view.id })} className="w-full py-3.5 rounded-2xl font-black text-white text-lg bg-indigo-500 hover:bg-indigo-600 transition-colors">Try again 🔁</button>}
            <button onClick={() => setView({ mode: "shelf" })} className="w-full py-3 rounded-2xl font-bold text-gray-600 border-2 border-gray-200 hover:bg-gray-50">Back to library</button>
          </div>
        </div>
      </Frame>
    );
  }

  // shelf
  const readCount = stories.filter((s) => progress[s.id]?.completedAt).length;
  const collections: { collection: string; stories: LibraryStory[] }[] = [];
  for (const s of stories) {
    let g = collections.find((x) => x.collection === s.collection);
    if (!g) {
      g = { collection: s.collection, stories: [] };
      collections.push(g);
    }
    g.stories.push(s);
  }
  return (
    <Frame>
      <div className="flex items-center gap-3 mb-4">
        <Link href={backHref} className="text-sm font-bold text-gray-500 shrink-0">← Back</Link>
        <h1 className="text-2xl font-black text-indigo-900 flex-1">Story Library</h1>
      </div>
      <div className="bg-white/80 backdrop-blur rounded-3xl p-4 shadow-sm mb-4">
        <p className="text-gray-700 font-semibold mb-3">Browse the shelf, pick a book, and read to earn stars.</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${(readCount / stories.length) * 100}%` }} />
          </div>
          <span className="text-xs font-black text-gray-500">{readCount}/{stories.length}</span>
        </div>
      </div>
      <div className="space-y-6">
        {collections.map((group) => (
          <div key={group.collection}>
            <div className="text-[11px] font-black uppercase tracking-widest text-indigo-400 mb-2 px-1">{group.collection}</div>
            <div className="grid grid-cols-3 gap-3">
              {group.stories.map((s) => {
                const done = !!progress[s.id]?.completedAt;
                return (
                  <button key={s.id} type="button" onClick={() => openStory(s.id)} className="text-left active:scale-[0.97] transition-transform">
                    <BookCover story={s} className="aspect-[2/3] w-full">
                      {done && (
                        <span className="absolute top-1.5 right-2 w-4 h-4 rounded-full bg-white/90 text-emerald-600 text-[10px] font-black flex items-center justify-center shadow">✓</span>
                      )}
                    </BookCover>
                    <div className="mt-1.5 px-0.5">
                      <div className="text-[11px] text-gray-400">
                        {s.chapters ? `${s.chapters.length} ch.` : s.level} · ~{s.minutes} min
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function Frame({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className={`min-h-screen bg-gradient-to-b from-sky-50 to-indigo-50 ${center ? "flex items-center" : ""}`}>
      <div className="max-w-lg mx-auto p-4 pt-5 w-full">{children}</div>
    </div>
  );
}

function StoryQuiz({
  story,
  kidId,
  onDone,
  onCancel,
}: {
  story: LibraryStory;
  kidId: string | null;
  onDone: (score: number, passed: boolean, starsAwarded: number, total: number) => void;
  onCancel: () => void;
}) {
  const quiz = story.quiz ?? [];
  const total = quiz.length;
  const [qi, setQi] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const question = quiz[qi];
  const answered = picked !== null;

  const shuffled = useMemo(() => {
    const arr = question.options.map((text, i) => ({ text, correct: i === question.answer }));
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qi]);

  const choose = (i: number) => {
    if (answered) return;
    setPicked(i);
    if (shuffled[i].correct) setScore((s) => s + 1);
  };

  const next = async () => {
    const finalScore = score;
    if (qi + 1 < total) {
      setQi(qi + 1);
      setPicked(null);
      return;
    }
    const passed = total > 0 && finalScore / total >= 0.6;
    let starsAwarded = 0;
    if (kidId) {
      setSubmitting(true);
      const res = await completeStory(kidId, story.id, finalScore);
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
    <Frame>
      <div className="flex items-center justify-between mb-2">
        <button onClick={onCancel} className="text-sm font-bold text-gray-500">← Story</button>
        <span className="text-sm font-black text-gray-500">Question {qi + 1}/{total}</span>
      </div>
      <p className="text-xs font-black uppercase text-indigo-400 mb-3">{story.title}</p>
      <div className="h-2 rounded-full bg-gray-200 overflow-hidden mb-4">
        <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${(qi / total) * 100}%` }} />
      </div>
      <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
        <p className="text-lg font-black text-gray-900">{question.q}</p>
      </div>
      <div className="space-y-2 mb-4">
        {shuffled.map((opt, i) => (
          <button key={i} type="button" onClick={() => choose(i)} disabled={answered} className={`w-full text-left rounded-2xl border-2 p-3.5 font-semibold text-gray-800 transition-all ${optionClass(i)}`}>
            {opt.text}
            {answered && opt.correct && <span className="ml-2">✅</span>}
            {answered && i === picked && !opt.correct && <span className="ml-2">❌</span>}
          </button>
        ))}
      </div>
      {answered && (
        <>
          {question.explain && <p className="text-sm text-gray-600 mb-3 px-1">{question.explain}</p>}
          <button onClick={next} disabled={submitting} className="w-full py-4 rounded-2xl font-black text-white text-lg bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 disabled:opacity-50 transition-colors">
            {submitting ? "Saving…" : qi + 1 < total ? "Next question ▶" : "Finish 🎯"}
          </button>
        </>
      )}
    </Frame>
  );
}
