import Link from "next/link";
import { listQuizBanks, listQuizQuestions } from "@/lib/data/stub";

const CATEGORY_LABEL: Record<string, { icon: string; label: string }> = {
  maths: { icon: "🧮", label: "Maths" },
  spelling: { icon: "📝", label: "Spelling" },
  geography: { icon: "🌍", label: "Geography" },
  science: { icon: "🔬", label: "Science" },
  silly: { icon: "🎉", label: "Silly trivia" },
  custom: { icon: "🎯", label: "Custom" },
};

export default async function QuizBanksPage() {
  const banks = await listQuizBanks();
  const banksWithCounts = await Promise.all(
    banks.map(async (b) => ({
      ...b,
      count: (await listQuizQuestions(b.id)).length,
    })),
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-violet-100 via-fuchsia-100 to-orange-100 font-fun p-6">
      <div className="max-w-3xl mx-auto">
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
            href="/play"
            className="text-sm bg-white/70 hover:bg-white px-4 py-2 rounded-full shadow shrink-0"
          >
            ← Games
          </Link>
        </div>

        <h2 className="text-sm font-bold text-gray-500 mb-2">PICK A QUIZ</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {banksWithCounts.map((bank) => {
            const cat = CATEGORY_LABEL[bank.category];
            return (
              <Link
                key={bank.id}
                href={`/play/quiz/${bank.id}`}
                className="bg-white rounded-2xl p-4 shadow hover:shadow-lg hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="text-4xl">{cat.icon}</div>
                  <div className="flex-1">
                    <div className="font-bold">{bank.name}</div>
                    <div className="text-xs text-gray-500">
                      {cat.label} · ages {bank.minAge}–{bank.maxAge} ·{" "}
                      {bank.count} q
                    </div>
                  </div>
                  <span className="text-fuchsia-500 shrink-0">→</span>
                </div>
              </Link>
            );
          })}
        </div>

        <p className="text-xs text-center text-gray-500 mt-6">
          🚀 Multi-device Kahoot mode coming in Phase 4. For now, gather around the same tablet!
          <br />
          Parents can add custom banks at{" "}
          <Link
            href="/parent/quizzes"
            className="font-bold text-indigo-600 hover:underline"
          >
            /parent/quizzes
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
