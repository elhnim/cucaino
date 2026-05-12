import Link from "next/link";
import { listQuizSets } from "@/lib/data/stub";
import { ACTIVE_QUIZ_THEMES } from "@/lib/registry/quiz-theme-registry";
import { getQuizDifficulty } from "@/lib/registry/quiz-difficulty-registry";
import QuizFilterBar from "@/components/parent/QuizFilterBar";

export default async function ParentQuizzesPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string; difficulty?: string }>;
}) {
  const { theme, difficulty } = await searchParams;
  const activeThemes = theme ? theme.split(",").filter(Boolean) : [];
  const activeDifficulty = difficulty ?? "";

  const sets = await listQuizSets();

  const filteredSets = sets.filter((s) => {
    if (activeThemes.length > 0 && !activeThemes.some((t) => s.themes.includes(t as typeof s.themes[number]))) return false;
    if (activeDifficulty && s.maxDifficulty !== activeDifficulty) return false;
    return true;
  });

  return (
    <div className="flex flex-col min-h-full">
      <>
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2.5">
            <h1 className="text-base font-extrabold text-gray-900">🎯 Quizzes</h1>
            <Link
              href="/parent/quizzes/set/new"
              className="bg-indigo-600 text-white rounded-full px-4 py-2 text-sm font-bold hover:bg-indigo-700"
            >
              + Create Quiz
            </Link>
          </div>

          {/* Filter bar */}
          <QuizFilterBar themes={activeThemes} difficulty={activeDifficulty} />

          {/* Age note */}
          <div className="px-4 py-2 bg-white border-b border-gray-100 text-[11px] text-gray-400">
            Questions are auto-matched to each kid&apos;s age from their profile.
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
                const themeEmoji = ACTIVE_QUIZ_THEMES.find((t) => s.themes.includes(t.id as typeof s.themes[number]))?.emoji ?? "🎯";
                const diffStyle = getQuizDifficulty(s.maxDifficulty);
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
                          const thMeta = ACTIVE_QUIZ_THEMES.find((t) => t.id === th);
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
                          {diffStyle.stars} {diffStyle.label}
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

    </div>
  );
}
