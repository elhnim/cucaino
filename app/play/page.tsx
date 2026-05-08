import Link from "next/link";
import KidShell from "@/components/kid/KidShell";
import { getKid } from "@/lib/data/stub";

export default async function PlayHubPage({
  searchParams,
}: {
  searchParams: Promise<{ kid?: string }>;
}) {
  const { kid: kidId } = await searchParams;
  const kid = kidId ? await getKid(kidId) : null;

  const content = (
    <div className="max-w-3xl mx-auto p-4">
      {!kid && (
        <div className="flex items-center gap-3 py-4 mb-2">
          <Link
            href="/select-kid"
            className="text-2xl leading-none text-indigo-400 hover:text-indigo-600 transition-colors"
          >
            ←
          </Link>
          <h1 className="text-3xl font-black text-indigo-900">🎮 Games</h1>
        </div>
      )}

      {kid && (
        <div className="py-4 mb-2">
          <h1 className="text-3xl font-black text-indigo-900">🎮 Games</h1>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-6 shadow-lg flex flex-col gap-3">
          <div className="text-5xl">🎯</div>
          <div>
            <div className="text-2xl font-black text-amber-900">Quiz</div>
            <div className="text-sm text-amber-700 mt-1">
              Test your knowledge · 14 topics · 3 modes
            </div>
          </div>
          <Link
            href={`/play/quiz${kidId ? `?kid=${kidId}` : ""}`}
            className="mt-auto w-full text-center bg-amber-400 hover:bg-amber-500 text-amber-900 font-bold rounded-2xl py-3 transition-colors"
          >
            Play Quiz →
          </Link>
        </div>

        <div className="bg-purple-50 border-2 border-purple-200 rounded-3xl p-6 shadow-lg flex flex-col gap-3">
          <div className="text-5xl">🃏</div>
          <div>
            <div className="text-2xl font-black text-purple-900">Flashcards</div>
            <div className="text-sm text-purple-700 mt-1">
              Flip through topics and learn as you go
            </div>
          </div>
          <button
            disabled
            className="mt-auto w-full text-center bg-gray-200 text-gray-400 font-bold rounded-2xl py-3 cursor-not-allowed"
          >
            Coming soon
          </button>
        </div>

        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-3xl p-6 shadow-lg flex flex-col gap-3">
          <div className="text-5xl">🧩</div>
          <div>
            <div className="text-2xl font-black text-emerald-900">Memory Match</div>
            <div className="text-sm text-emerald-700 mt-1">
              Flip tiles and find the pairs
            </div>
          </div>
          <button
            disabled
            className="mt-auto w-full text-center bg-gray-200 text-gray-400 font-bold rounded-2xl py-3 cursor-not-allowed"
          >
            Coming soon
          </button>
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-3xl p-6 flex flex-col items-center justify-center gap-2 text-center">
          <div className="text-3xl">🎲 🎪 🎨</div>
          <div className="text-gray-400 font-semibold">More games coming soon! 🚀</div>
        </div>
      </div>
    </div>
  );

  if (kid) {
    return <KidShell kid={kid} active="play">{content}</KidShell>;
  }

  return <main className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50">{content}</main>;
}
