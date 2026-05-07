import ParentShell from "@/components/parent/ParentShell";
import { listQuizBanks, listQuizQuestions } from "@/lib/data/stub";

export default async function ParentQuizzesPage() {
  const banks = await listQuizBanks();
  const banksWithCounts = await Promise.all(
    banks.map(async (b) => ({
      ...b,
      count: (await listQuizQuestions(b.id)).length,
    })),
  );

  return (
    <ParentShell active="quizzes" title="Quiz banks">
      <div className="p-4">
        <p className="text-xs text-gray-500 mb-3">
          Built-in banks ship with the app. Add custom banks (e.g., school spelling list, times tables).
        </p>
        <div className="space-y-2">
          {banksWithCounts.map((b) => (
            <div key={b.id} className="bg-white rounded-2xl shadow p-3">
              <div className="flex items-center gap-3">
                <div className="text-3xl">
                  {b.category === "maths"
                    ? "🧮"
                    : b.category === "spelling"
                      ? "📝"
                      : b.category === "geography"
                        ? "🌍"
                        : b.category === "science"
                          ? "🔬"
                          : b.category === "silly"
                            ? "🎉"
                            : "🎯"}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-bold">{b.name}</div>
                    {b.isBuiltin ? (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                        Built-in
                      </span>
                    ) : (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">
                        Custom
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {b.count} question{b.count === 1 ? "" : "s"} · ages {b.minAge}–{b.maxAge}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-lg font-bold"
                >
                  {b.isBuiltin ? "View" : "Edit"}
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="mt-4 w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold py-3 rounded-xl"
        >
          + Create custom bank
        </button>
      </div>
    </ParentShell>
  );
}
