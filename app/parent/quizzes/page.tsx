import Link from "next/link";

type QuizTheme =
  | "maths" | "english" | "science" | "history" | "geography"
  | "sports" | "music" | "french" | "spanish" | "mandarin"
  | "fun_facts" | "pop_culture" | "technology" | "food_culture";

const THEMES: { id: QuizTheme; label: string; emoji: string }[] = [
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
  { id: "food_culture", label: "Food Culture", emoji: "🍜" },
];

export default async function ParentQuizzesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; theme?: string }>;
}) {
  const { tab, theme } = await searchParams;
  const activeTab = tab === "sets" ? "sets" : "library";
  const activeTheme = theme as QuizTheme | undefined;

  return (
    <div className="p-4 space-y-4">
        {/* Tab bar */}
        <div className="flex gap-2 bg-gray-100 p-1 rounded-2xl">
          <Link
            href="?tab=library"
            className={`flex-1 text-center text-sm font-semibold py-2 rounded-xl transition-colors ${
              activeTab === "library"
                ? "bg-indigo-600 text-white"
                : "text-gray-500"
            }`}
          >
            📚 Question Library
          </Link>
          <Link
            href="?tab=sets"
            className={`flex-1 text-center text-sm font-semibold py-2 rounded-xl transition-colors ${
              activeTab === "sets"
                ? "bg-indigo-600 text-white"
                : "text-gray-500"
            }`}
          >
            🎯 Quiz Sets
          </Link>
        </div>

        {activeTab === "library" && (
          <div className="space-y-4">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">📚 Question Library</h2>
              <Link
                href="/parent/quizzes/question/new"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-3 py-1.5 rounded-xl"
              >
                + Add Question
              </Link>
            </div>

            {/* Theme filter pills */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              <Link
                href="?tab=library"
                className={`shrink-0 text-sm font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  !activeTheme
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                All
              </Link>
              {THEMES.map((t) => (
                <Link
                  key={t.id}
                  href={`?tab=library&theme=${t.id}`}
                  className={`shrink-0 text-sm font-semibold px-3 py-1.5 rounded-full transition-colors ${
                    activeTheme === t.id
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {t.emoji} {t.label}
                </Link>
              ))}
            </div>

            {/* Empty state */}
            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center space-y-2">
              <p className="text-xl font-bold">🎯 No questions yet</p>
              <p className="text-sm text-gray-500">Built-in questions are loading...</p>
              <Link
                href="/parent/quizzes/question/new"
                className="inline-block mt-2 text-sm font-semibold text-indigo-600 hover:underline"
              >
                + Add your own questions
              </Link>
            </div>
          </div>
        )}

        {activeTab === "sets" && (
          <div className="space-y-4">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">🎯 Quiz Sets</h2>
              <Link
                href="/parent/quizzes/set/new"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-3 py-1.5 rounded-xl"
              >
                + Create Set
              </Link>
            </div>

            {/* Empty state */}
            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center space-y-2">
              <p className="text-xl font-bold">📋 No quiz sets yet</p>
              <p className="text-sm text-gray-500">
                Create a quiz set to control which questions appear in game sessions
              </p>
              <Link
                href="/parent/quizzes/set/new"
                className="inline-block mt-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl"
              >
                + Create your first quiz set
              </Link>
            </div>

            {/* How quiz sets work */}
            <div className="bg-white rounded-2xl shadow p-4 space-y-2">
              <p className="font-bold">💡 How Quiz Sets Work</p>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                <li>A quiz set is a named filter — it picks questions from the library at runtime</li>
                <li>Filter by theme, age band, and difficulty</li>
                <li>Set how many questions per session (e.g. 10)</li>
                <li>Same set works for all kids — each gets age-matched questions automatically</li>
              </ul>
            </div>
          </div>
        )}
    </div>
  );
}
