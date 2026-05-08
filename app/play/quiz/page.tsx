import Link from "next/link";
import KidShell from "@/components/kid/KidShell";
import { listQuizSets, listQuizBanks, getKid } from "@/lib/data/stub";

const THEME_LABEL: Record<string, { icon: string; label: string }> = {
  maths:       { icon: "🧮", label: "Maths" },
  english:     { icon: "📖", label: "English" },
  science:     { icon: "🔬", label: "Science" },
  history:     { icon: "🏛️", label: "History" },
  geography:   { icon: "🌍", label: "Geography" },
  sports:      { icon: "⚽", label: "Sports" },
  music:       { icon: "🎵", label: "Music" },
  french:      { icon: "🇫🇷", label: "French" },
  spanish:     { icon: "🇪🇸", label: "Spanish" },
  mandarin:    { icon: "🇨🇳", label: "Mandarin" },
  fun_facts:   { icon: "🎉", label: "Fun Facts" },
  pop_culture: { icon: "🎬", label: "Pop Culture" },
  technology:  { icon: "💻", label: "Technology" },
  food_culture:{ icon: "🍜", label: "Food & Culture" },
  // Legacy categories
  spelling:    { icon: "📝", label: "Spelling" },
  silly:       { icon: "🎊", label: "Silly trivia" },
  custom:      { icon: "🎯", label: "Custom" },
};

export default async function QuizSetsPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;
  const [sets, banks, kid] = await Promise.all([
    listQuizSets(),
    listQuizBanks(),
    kidId ? getKid(kidId) : Promise.resolve(null),
  ]);

  const qs = kidId ? `?kid=${kidId}` : "";

  const content = (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-fuchsia-900">
            🎮 Quiz battles
          </h1>
          <p className="text-sm md:text-base text-fuchsia-700">
            Pick a quiz, take turns, and battle for the high score!
          </p>
        </div>
        <Link
          href={`/play${qs}`}
          className="text-sm bg-white/70 hover:bg-white px-4 py-2 rounded-full shadow shrink-0"
        >
          ← Games
        </Link>
      </div>

      {sets.length > 0 && (
        <>
          <h2 className="text-sm font-bold text-gray-500 mb-2">QUIZ SETS</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {sets.map((set) => {
              const firstTheme = set.themes[0] ?? "custom";
              const cat = THEME_LABEL[firstTheme] ?? { icon: "🎯", label: firstTheme };
              return (
                <Link
                  key={set.id}
                  href={`/play/quiz/${set.id}${qs}`}
                  className="bg-white rounded-2xl p-4 shadow hover:shadow-lg hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-4xl">{set.emoji || cat.icon}</div>
                    <div className="flex-1">
                      <div className="font-bold">{set.name}</div>
                      <div className="text-xs text-gray-500">
                        {set.themes.map((t) => THEME_LABEL[t]?.label ?? t).join(", ")} ·{" "}
                        {set.questionsPerSession} q per session
                      </div>
                    </div>
                    <span className="text-fuchsia-500 shrink-0">→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {banks.length > 0 && (
        <>
          <h2 className="text-sm font-bold text-gray-500 mb-2">CLASSIC BANKS</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {banks.map((bank) => {
              const cat = THEME_LABEL[bank.category] ?? { icon: "🎯", label: bank.category };
              return (
                <Link
                  key={bank.id}
                  href={`/play/quiz/${bank.id}${qs}`}
                  className="bg-white rounded-2xl p-4 shadow hover:shadow-lg hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-4xl">{cat.icon}</div>
                    <div className="flex-1">
                      <div className="font-bold">{bank.name}</div>
                      <div className="text-xs text-gray-500">
                        {cat.label} · ages {bank.minAge}–{bank.maxAge}
                      </div>
                    </div>
                    <span className="text-fuchsia-500 shrink-0">→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {sets.length === 0 && banks.length === 0 && (
        <p className="text-center text-gray-400 py-12">
          No quizzes yet. Add some at{" "}
          <Link href="/parent/quizzes" className="font-bold text-indigo-600 underline">
            /parent/quizzes
          </Link>
          .
        </p>
      )}

      <p className="text-xs text-center text-gray-500 mt-6">
        🚀 Multi-device Kahoot mode coming in Phase 4. For now, gather around the same tablet!
        <br />
        Parents can manage quizzes at{" "}
        <Link href="/parent/quizzes" className="font-bold text-indigo-600 hover:underline">
          /parent/quizzes
        </Link>
        .
      </p>
    </div>
  );

  if (kid) {
    return (
      <KidShell kid={kid} active="play">
        <div className="min-h-full bg-gradient-to-br from-violet-100 via-fuchsia-100 to-orange-100 font-fun">
          {content}
        </div>
      </KidShell>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-violet-100 via-fuchsia-100 to-orange-100 font-fun">
      {content}
    </main>
  );
}
