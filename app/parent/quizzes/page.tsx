import Link from "next/link";
import { listQuizQuestions2, listQuizSets } from "@/lib/data/stub";

const THEMES = [
  { id: "maths",        label: "Maths",           emoji: "🧮" },
  { id: "english",      label: "English",          emoji: "📖" },
  { id: "science",      label: "Science",          emoji: "🔬" },
  { id: "history",      label: "History",          emoji: "🏛" },
  { id: "geography",    label: "Geography",        emoji: "🌍" },
  { id: "sports",       label: "Sports",           emoji: "⚽" },
  { id: "music",        label: "Music",            emoji: "🎵" },
  { id: "french",       label: "French",           emoji: "🥖" },
  { id: "spanish",      label: "Spanish",          emoji: "💃" },
  { id: "mandarin",     label: "Mandarin",         emoji: "🀄" },
  { id: "fun_facts",    label: "Fun Facts",        emoji: "🤩" },
  { id: "pop_culture",  label: "Pop Culture",      emoji: "⭐" },
  { id: "technology",   label: "Technology",       emoji: "💻" },
  { id: "food_culture", label: "Food & Culture",   emoji: "🍜" },
];

const DIFFICULTY_STYLE: Record<string, { bg: string; color: string }> = {
  easy:   { bg: "#d1fae5", color: "#065f46" },
  medium: { bg: "#fef3c7", color: "#92400e" },
  hard:   { bg: "#fee2e2", color: "#991b1b" },
};

export default async function ParentQuizzesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; theme?: string; difficulty?: string }>;
}) {
  const { tab, theme, difficulty } = await searchParams;
  const activeTab = tab === "library" ? "library" : "sets";
  const activeTheme = theme ?? "";
  const activeDifficulty = difficulty ?? "";

  const [questions, sets] = await Promise.all([
    activeTab === "library" ? listQuizQuestions2(activeTheme ? { theme: activeTheme } : undefined) : Promise.resolve([]),
    activeTab === "sets" ? listQuizSets() : Promise.resolve([]),
  ]);

  const filteredSets = sets.filter((s) => {
    if (activeTheme && !s.themes.includes(activeTheme)) return false;
    if (activeDifficulty && s.maxDifficulty !== activeDifficulty) return false;
    return true;
  });

  return (
    <div className="flex flex-col min-h-full">
      {/* Tab toggle */}
      <div className="px-4 pt-4 pb-0">
        <div className="flex gap-2 bg-gray-100 p-1 rounded-2xl">
          <Link
            href="?tab=sets"
            className={`flex-1 text-center text-sm font-semibold py-2 rounded-xl transition-colors ${activeTab === "sets" ? "bg-indigo-600 text-white" : "text-gray-500"}`}
          >
            🎯 Quiz Sets
          </Link>
          <Link
            href="?tab=library"
            className={`flex-1 text-center text-sm font-semibold py-2 rounded-xl transition-colors ${activeTab === "library" ? "bg-indigo-600 text-white" : "text-gray-500"}`}
          >
            📚 Question Library
          </Link>
        </div>
      </div>

      {/* ── SETS TAB ── */}
      {activeTab === "sets" && (
        <>
          {/* Filter bar */}
          <div className="flex gap-2 px-4 py-2.5 bg-white border-b border-gray-100 mt-3">
            <div className="flex-1 relative">
              <select
                className="w-full border-[1.5px] border-gray-200 rounded-xl bg-white text-sm font-semibold text-gray-800 px-3 py-2 appearance-none cursor-pointer focus:outline-none focus:border-indigo-400"
                defaultValue={activeTheme}
              >
                <option value="">All Themes</option>
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
            </div>
            <div className="flex-1 relative">
              <select
                className="w-full border-[1.5px] border-gray-200 rounded-xl bg-white text-sm font-semibold text-gray-800 px-3 py-2 appearance-none cursor-pointer focus:outline-none focus:border-indigo-400"
                defaultValue={activeDifficulty}
              >
                <option value="">All Difficulties</option>
                <option value="easy">⭐ Easy</option>
                <option value="medium">⭐⭐ Medium</option>
                <option value="hard">⭐⭐⭐ Hard</option>
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
            </div>
          </div>

          {/* Age note */}
          <div className="px-4 py-2 bg-white border-b border-gray-100 text-[11px] text-gray-400">
            Questions are auto-matched to each kid&apos;s age from their profile.
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h1 className="text-base font-extrabold text-gray-900">🎯 Quizzes</h1>
            <Link
              href="/parent/quizzes/set/new"
              className="bg-indigo-600 text-white rounded-full px-4 py-2 text-sm font-bold hover:bg-indigo-700"
            >
              + Add Set
            </Link>
          </div>

          {/* Set cards */}
          <div className="px-4 pb-4 space-y-2">
            {filteredSets.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center space-y-2">
                <p className="text-xl font-bold">📋 No quiz sets yet</p>
                <p className="text-sm text-gray-500">A quiz set groups questions by theme, age and difficulty.</p>
                <Link href="/parent/quizzes/set/new" className="inline-block mt-2 bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-xl">
                  + Create your first quiz set
                </Link>
              </div>
            ) : (
              filteredSets.map((s) => {
                const themeEmoji = THEMES.find((t) => s.themes.includes(t.id))?.emoji ?? "🎯";
                const diffStyle = DIFFICULTY_STYLE[s.maxDifficulty] ?? { bg: "#f3f4f6", color: "#374151" };
                return (
                  <Link
                    key={s.id}
                    href={`/parent/quizzes/set/${s.id}/edit`}
                    className="flex items-center gap-3 bg-white rounded-[14px] p-3"
                    style={{ border: "1.5px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
                  >
                    <div className="w-11 h-11 rounded-[13px] flex items-center justify-center text-2xl flex-shrink-0" style={{ background: "#eef2ff" }}>
                      {s.emoji ?? themeEmoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-extrabold text-gray-900 mb-1">{s.name}</div>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {s.themes.slice(0, 2).map((th) => {
                          const thMeta = THEMES.find((t) => t.id === th);
                          return (
                            <span key={th} className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-600">
                              {thMeta?.emoji} {thMeta?.label ?? th}
                            </span>
                          );
                        })}
                        <span
                          className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: diffStyle.bg, color: diffStyle.color }}
                        >
                          {s.maxDifficulty}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400">{s.questionsPerSession} questions per session</div>
                    </div>
                    <span className="text-gray-300 text-xl">›</span>
                  </Link>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ── LIBRARY TAB ── */}
      {activeTab === "library" && (
        <div className="flex flex-1 overflow-hidden mt-3">
          {/* Left: theme filter */}
          <div className="w-28 shrink-0 border-r border-gray-100 overflow-y-auto py-2">
            <Link
              href="?tab=library"
              className={`flex flex-col items-center gap-1 px-2 py-2.5 text-center ${!activeTheme ? "bg-indigo-50 text-indigo-700 font-bold" : "text-gray-500"}`}
            >
              <span className="text-lg">🔍</span>
              <span className="text-[10px] font-semibold leading-tight">All</span>
            </Link>
            {THEMES.map((t) => (
              <Link
                key={t.id}
                href={`?tab=library&theme=${t.id}`}
                className={`flex flex-col items-center gap-1 px-2 py-2.5 text-center ${activeTheme === t.id ? "bg-indigo-50 text-indigo-700 font-bold" : "text-gray-500"}`}
              >
                <span className="text-lg">{t.emoji}</span>
                <span className="text-[10px] font-semibold leading-tight">{t.label}</span>
              </Link>
            ))}
          </div>

          {/* Right: question list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 font-semibold">{questions.length} question{questions.length !== 1 ? "s" : ""}</span>
              <Link href="/parent/quizzes/question/new" className="bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl">
                + Add
              </Link>
            </div>

            {questions.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <p className="text-2xl">🎯</p>
                <p className="font-bold text-gray-700">No questions yet</p>
                <p className="text-sm text-gray-400">Add your first question to get started.</p>
              </div>
            ) : (
              questions.map((q) => {
                const diffStyle = DIFFICULTY_STYLE[q.difficulty] ?? { bg: "#f3f4f6", color: "#374151" };
                return (
                  <Link
                    key={q.id}
                    href={`/parent/quizzes/question/${q.id}/edit`}
                    className="block bg-white rounded-2xl p-3 border-[1.5px] border-gray-200"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 line-clamp-2">{q.questionText}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: diffStyle.bg, color: diffStyle.color }}>
                            {q.difficulty}
                          </span>
                          <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-500">{q.ageBand}</span>
                          <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-500">{q.type === "mc" ? "MC" : "Fill blank"}</span>
                          {q.isBuiltin && <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-600">Built-in</span>}
                        </div>
                      </div>
                      <span className="text-gray-300 text-lg shrink-0">›</span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
