import Link from "next/link";
import { listQuizSets, listQuizBanks, getKid } from "@/lib/data/stub";
import KidShell from "@/components/kid/KidShell";
import QuizFilters from "@/components/play/QuizFilters";
import { getQuizTheme } from "@/lib/registry/quiz-theme-registry";
import { QUIZ_DIFFICULTIES } from "@/lib/registry/quiz-difficulty-registry";

const DIFFICULTY_ORDER: Record<string, number> = Object.fromEntries(
  QUIZ_DIFFICULTIES.map((d, i) => [d.id, i])
);

export default async function QuizSetsPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string; theme?: string; diff?: string }>;
}) {
  const { kid: kidParam, theme = "", diff: difficulty = "" } = await searchParams;

  const [sets, banks, kid] = await Promise.all([
    listQuizSets(),
    listQuizBanks(),
    kidParam ? getKid(kidParam) : Promise.resolve(null),
  ]);

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

  const header = (
    <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <Link href={backHref} className="text-sm font-bold text-gray-600 hover:text-gray-900 flex items-center gap-1">
        ← Games
      </Link>
      <span className="font-black text-gray-900">🎮 Quiz Battles</span>
      <div className="w-16" />
    </header>
  );

  const content = (
    <div className="flex flex-col">
      {header}
      <div className="max-w-3xl mx-auto w-full p-4 pb-8">
        <QuizFilters theme={theme} difficulty={difficulty} kidParam={kidParam2} />

        {filteredSets.length > 0 && (
          <>
            <h2 className="text-sm font-bold text-gray-500 mb-2">QUIZ SETS</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              {filteredSets.map((set) => {
                const firstTheme = set.themes[0] ?? "custom";
                const cat = getQuizTheme(firstTheme);
                const href = kidParam
                  ? `/play/quiz/${set.id}?kid=${kidParam}`
                  : `/play/quiz/${set.id}`;
                return (
                  <Link
                    key={set.id}
                    href={href}
                    className="bg-white rounded-2xl p-4 shadow hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-3 min-h-[72px]"
                  >
                    <div className="text-4xl shrink-0">{set.emoji || cat.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{set.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{set.description ?? ""}</div>
                    </div>
                    <span className="text-fuchsia-500 shrink-0">→</span>
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
                    className="bg-white rounded-2xl p-4 shadow hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-3 min-h-[72px]"
                  >
                    <div className="text-4xl shrink-0">{cat.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{bank.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{bank.description ?? ""}</div>
                    </div>
                    <span className="text-fuchsia-500 shrink-0">→</span>
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
