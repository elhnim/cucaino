import Link from "next/link";
import { listQuizQuestions2, listQuizSets } from "@/lib/data/stub";

const THEMES = [
  { id: "maths",        label: "Maths",        emoji: "🧮" },
  { id: "english",      label: "English",      emoji: "📖" },
  { id: "science",      label: "Science",      emoji: "🔬" },
  { id: "history",      label: "History",      emoji: "🏛" },
  { id: "geography",    label: "Geography",    emoji: "🌍" },
  { id: "sports",       label: "Sports",       emoji: "⚽" },
  { id: "music",        label: "Music",        emoji: "🎵" },
  { id: "french",       label: "French",       emoji: "🥖" },
  { id: "spanish",      label: "Spanish",      emoji: "💃" },
  { id: "mandarin",     label: "Mandarin",     emoji: "🀄" },
  { id: "fun_facts",    label: "Fun Facts",    emoji: "🤩" },
  { id: "pop_culture",  label: "Pop Culture",  emoji: "⭐" },
  { id: "technology",   label: "Technology",   emoji: "💻" },
  { id: "food_culture", label: "Food & Culture", emoji: "🍜" },
];

const DIFFICULTY_BADGE: Record<string, string> = {
  easy:   "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  hard:   "bg-red-100 text-red-700",
};

export default async function ParentQuizzesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; theme?: string }>;
}) {
  const { tab, theme } = await searchParams;
  const activeTab = tab === "sets" ? "sets" : "library";
  const activeTheme = theme ?? "";

  const [questions, sets] = await Promise.all([
    activeTab === "library" ? listQuizQuestions2(activeTheme ? { theme: activeTheme } : undefined) : Promise.resolve([]),
    activeTab === "sets" ? listQuizSets() : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex gap-2 bg-gray-100 p-1 rounded-2xl">
          <Link
            href="?tab=library"
            className={`flex-1 text-center text-sm font-semibold py-2 rounded-xl transition-colors ${activeTab === "library" ? "bg-indigo-600 text-white" : "text-gray-500"}`}
          >
            📚 Question Library
          </Link>
          <Link
            href="?tab=sets"
            className={`flex-1 text-center text-sm font-semibold py-2 rounded-xl transition-colors ${activeTab === "sets" ? "bg-indigo-600 text-white" : "text-gray-500"}`}
          >
            🎯 Quiz Sets
          </Link>
        </div>
      </div>

      {activeTab === "library" && (
        <div className="flex flex-1 overflow-hidden">
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
              <Link
                href="/parent/quizzes/question/new"
                className="bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl"
              >
                + Add
              </Link>
            </div>

            {questions.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <p className="text-2xl">🎯</p>
                <p className="font-bold text-gray-700">No questions yet</p>
                <p className="text-sm text-gray-400">Add your first question to get started.</p>
                <Link href="/parent/quizzes/question/new" className="inline-block mt-2 bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-xl">
                  + Add question
                </Link>
              </div>
            ) : (
              questions.map((q) => (
                <Link
                  key={q.id}
                  href={`/parent/quizzes/question/${q.id}/edit`}
                  className="block bg-white rounded-2xl shadow-sm p-3 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 line-clamp-2">{q.questionText}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${DIFFICULTY_BADGE[q.difficulty] ?? "bg-gray-100 text-gray-600"}`}>
                          {q.difficulty}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold">
                          {q.ageBand}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold">
                          {q.type === "mc" ? "MC" : "Fill blank"}
                        </span>
                        {q.isBuiltin && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-semibold">Built-in</span>
                        )}
                      </div>
                    </div>
                    <span className="text-gray-300 text-lg shrink-0">›</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "sets" && (
        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold">{sets.length} set{sets.length !== 1 ? "s" : ""}</span>
            <Link
              href="/parent/quizzes/set/new"
              className="bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl"
            >
              + Create Set
            </Link>
          </div>

          {sets.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center space-y-2">
              <p className="text-xl font-bold">📋 No quiz sets yet</p>
              <p className="text-sm text-gray-500">A quiz set groups questions by theme, age and difficulty — kids pick a set to play.</p>
              <Link href="/parent/quizzes/set/new" className="inline-block mt-2 bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-xl">
                + Create your first quiz set
              </Link>
            </div>
          ) : (
            sets.map((s) => (
              <Link
                key={s.id}
                href={`/parent/quizzes/set/${s.id}/edit`}
                className="flex items-center gap-3 bg-white rounded-2xl shadow-sm p-4 hover:shadow-md transition-shadow"
              >
                <span className="text-3xl">{s.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900">{s.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {s.themes.slice(0, 3).join(", ")}{s.themes.length > 3 ? ` +${s.themes.length - 3}` : ""} · {s.questionsPerSession} q/session · {s.maxDifficulty}
                  </p>
                </div>
                <span className="text-gray-300 text-lg">›</span>
              </Link>
            ))
          )}

          <div className="bg-white rounded-2xl shadow p-4 space-y-2">
            <p className="font-bold text-sm">💡 How Quiz Sets Work</p>
            <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
              <li>A set filters the question library at runtime — new matching questions are picked up automatically</li>
              <li>Each kid gets age-matched questions; older kids get harder questions from the same set</li>
              <li>Set how many questions per session</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
