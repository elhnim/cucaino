import Link from "next/link";
import { listQuizSets, listQuizBanks, listQuizQuestions2, getKid } from "@/lib/data/stub";
import KidShell from "@/components/kid/KidShell";
import QuizFilters from "@/components/play/QuizFilters";

const THEME_LABEL: Record<string, { icon: string; label: string }> = {
  maths:        { icon: "🧮", label: "Maths" },
  english:      { icon: "📖", label: "English" },
  science:      { icon: "🔬", label: "Science" },
  history:      { icon: "🏛️", label: "History" },
  geography:    { icon: "🌍", label: "Geography" },
  sports:       { icon: "⚽", label: "Sports" },
  music:        { icon: "🎵", label: "Music" },
  french:       { icon: "🇫🇷", label: "French" },
  spanish:      { icon: "🇪🇸", label: "Spanish" },
  mandarin:     { icon: "🇨🇳", label: "Mandarin" },
  fun_facts:    { icon: "🎉", label: "Fun Facts" },
  pop_culture:  { icon: "🎬", label: "Pop Culture" },
  technology:   { icon: "💻", label: "Technology" },
  food_culture: { icon: "🍜", label: "Food & Culture" },
  // Legacy
  spelling:     { icon: "📝", label: "Spelling" },
  silly:        { icon: "🎊", label: "Silly Trivia" },
  custom:       { icon: "🎯", label: "Custom" },
};

const AGE_BAND_MIN: Record<string, number> = {
  "5_6": 5, "7_8": 7, "9_10": 9, "11_12": 11,
};

const DIFFICULTY_ORDER: Record<string, number> = { easy: 0, medium: 1, hard: 2 };

type Q2Row = { ageBand: string; difficulty: string; choices: unknown[] | null };
function ageMatchedCount(questions: Q2Row[], kidAge: number, maxDiff?: string): number {
  const maxDiffIdx = maxDiff ? (DIFFICULTY_ORDER[maxDiff] ?? 2) : 2;
  return questions.filter((q) => {
    const minAge = AGE_BAND_MIN[q.ageBand] ?? 0;
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
  const backHref = kidParam ? `/play?kid=${kidParam}` : "/play";

  const content = (
    <div className="max-w-3xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className="text-2xl font-black text-gray-900">🎮 Quiz Battles</h1>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 bg-fuchsia-100 hover:bg-fuchsia-200 text-fuchsia-700 font-bold text-sm px-4 py-2 rounded-2xl transition-colors shrink-0"
        >
          ← Games
        </Link>
      </div>

        <QuizFilters theme={theme} difficulty={difficulty} kidParam={kidParam2} />

        {filteredSets.length > 0 && (
          <>
            <h2 className="text-sm font-bold text-gray-500 mb-2">QUIZ SETS</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              {filteredSets.map((set) => {
                const firstTheme = set.themes[0] ?? "custom";
                const cat = THEME_LABEL[firstTheme] ?? { icon: "🎯", label: firstTheme };
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
                      <div className="text-4xl">{set.emoji || cat.icon}</div>
                      <div className="flex-1">
                        <div className="font-bold">{set.name}</div>
                        {set.description ? (
                          <div className="text-xs text-gray-500 mt-0.5">{set.description}</div>
                        ) : (
                          <div className="text-xs text-gray-400">
                            {set.themes.map((t) => THEME_LABEL[t]?.label ?? t).join(", ")}
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
                const cat = THEME_LABEL[bank.category] ?? { icon: "🎯", label: bank.category };
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
                      <div className="text-4xl">{cat.icon}</div>
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
