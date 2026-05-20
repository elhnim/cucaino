import Link from "next/link";
import { listQuizSets, listQuizBanks, listQuizQuestions2, getKid } from "@/lib/data/stub";
import KidShell from "@/components/kid/KidShell";
import QuizFilters from "@/components/play/QuizFilters";
import { getQuizTheme } from "@/lib/registry/quiz-theme-registry";
import { getAgeBandMin } from "@/lib/registry/quiz-age-band-registry";
import { QUIZ_DIFFICULTIES } from "@/lib/registry/quiz-difficulty-registry";

const DIFFICULTY_ORDER: Record<string, number> = Object.fromEntries(
  QUIZ_DIFFICULTIES.map((d, i) => [d.id, i])
);

type Q2Row = { ageBand: string; difficulty: string; choices: unknown[] | null };
function ageMatchedCount(questions: Q2Row[], kidAge: number, maxDiff?: string): number {
  const maxDiffIdx = maxDiff ? (DIFFICULTY_ORDER[maxDiff] ?? 2) : 2;
  return questions.filter((q) => {
    const minAge = getAgeBandMin(q.ageBand);
    const qDiff = DIFFICULTY_ORDER[q.difficulty] ?? 0;
    return kidAge >= minAge && qDiff <= maxDiffIdx && q.choices && q.choices.length > 0;
  }).length;
}

export default async function QuizSetsPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string; theme?: string; diff?: string }>;
}) {
  const { kid: kidParam, theme = "", diff: difficulty = "" } = await searchParams;

  const [sets, banks, kid, allQ] = await Promise.all([
    listQuizSets(),
    listQuizBanks(),
    kidParam ? getKid(kidParam) : Promise.resolve(null),
    listQuizQuestions2(),
  ]);

  const kidAge = kid?.age ?? null;

  // Filter sets by theme
  const filteredSets = sets.filter((set) => {
    if (theme && !set.themes.includes(theme as typeof set.themes[number])) return false;
    if (difficulty && set.maxDifficulty) {
      const setMaxIdx = DIFFICULTY_ORDER[set.maxDifficulty] ?? 2;
      const filterIdx = DIFFICULTY_ORDER[difficulty] ?? 0;
      if (filterIdx > setMaxIdx) return false;
    }
    return true;
  });

  // Filter banks by theme (legacy — category match)
  const filteredBanks = banks.filter((bank) => {
    if (theme) return bank.category === theme;
    return true;
  });

  const kidParam2 = kidParam ?? "";
  const backHref = kidParam ? `/kid/${kidParam}/play` : "/select-kid";

  const content = (
    <div className="max-w-3xl mx-auto p-4">
      <div className="flex items-center gap-3 mb-4">
        <Link
          href={backHref}
          className="text-sm font-bold text-gray-500 hover:text-gray-700 flex items-center gap-1 shrink-0"
        >
          ← Games
        </Link>
        <h1 className="text-2xl font-black text-gray-900">🎮 Quiz Battles</h1>
      </div>

        <QuizFilters theme={theme} difficulty={difficulty} kidParam={kidParam2} />

        {filteredSets.length > 0 && (
          <>
            <h2 className="text-sm font-bold text-gray-500 mb-2">QUIZ SETS</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              {filteredSets.map((set) => {
                const firstTheme = set.themes[0] ?? "custom";
                const cat = getQuizTheme(firstTheme);
                // Age-matched count for this set
                const setQuestions = allQ.filter((q) => set.themes.includes(q.theme as typeof set.themes[number]));
                const forYouCount = kidAge !== null
                  ? ageMatchedCount(setQuestions, kidAge, difficulty || set.maxDifficulty)
                  : setQuestions.filter((q) => q.choices && q.choices.length > 0).length;
                const href = kidParam
                  ? `/play/quiz/${set.id}?kid=${kidParam}`
                  : `/play/quiz/${set.id}`;
                return (
                  <Link
                    key={set.id}
                    href={href}
                    className="bg-white rounded-2xl p-4 shadow hover:shadow-lg hover:-translate-y-0.5 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-4xl">{set.emoji || cat.emoji}</div>
                      <div className="flex-1">
                        <div className="font-bold">{set.name}</div>
                        {set.description ? (
                          <div className="text-xs text-gray-500 mt-0.5">{set.description}</div>
                        ) : (
                          <div className="text-xs text-gray-400">
                            {set.themes.map((t) => getQuizTheme(t).label).join(", ")}
                          </div>
                        )}
                      </div>
                      <span className="text-fuchsia-500 shrink-0">→</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {filteredBanks.length > 0 && (
          <>
            <h2 className="text-sm font-bold text-gray-500 mb-2">CLASSIC BANKS</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredBanks.map((bank) => {
                const cat = getQuizTheme(bank.category);
                const href = kidParam
                  ? `/play/quiz/${bank.id}?kid=${kidParam}`
                  : `/play/quiz/${bank.id}`;
                return (
                  <Link
                    key={bank.id}
                    href={href}
                    className="bg-white rounded-2xl p-4 shadow hover:shadow-lg hover:-translate-y-0.5 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-4xl">{cat.emoji}</div>
                      <div className="flex-1">
                        <div className="font-bold">{bank.name}</div>
                        {bank.description ? (
                          <div className="text-xs text-gray-500 mt-0.5">{bank.description}</div>
                        ) : (
                          <div className="text-xs text-gray-400">
                            {cat.label} · ages {bank.minAge}–{bank.maxAge}
                          </div>
                        )}
                      </div>
                      <span className="text-fuchsia-500 shrink-0">→</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {filteredSets.length === 0 && filteredBanks.length === 0 && (
          <p className="text-center text-gray-400 py-12">
            No quizzes match your filters. Try changing the theme or difficulty!
          </p>
        )}
    </div>
  );

  if (kid) {
    return <KidShell kid={kid} active="play">{content}</KidShell>;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-violet-100 via-fuchsia-100 to-orange-100 font-fun">
      {content}
    </main>
  );
}
