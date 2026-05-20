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
    <div className="max-w-3xl mx-auto p-4 pt-5">
      <h1 className="text-2xl font-black text-gray-900 mb-4">🎮 Play</h1>

      <div className="grid grid-cols-2 gap-3">
        {/* Quiz */}
        <Link
          href={`/play/quiz${kidId ? `?kid=${kidId}` : ""}`}
          className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-5 shadow-sm flex flex-col gap-3 active:scale-95 transition-transform"
        >
          <div className="text-4xl">🎯</div>
          <div>
            <div className="text-lg font-black text-amber-900">Quiz</div>
            <div className="text-xs text-amber-700 mt-0.5">14 topics · 3 difficulties</div>
          </div>
        </Link>

        {/* Nugget Market */}
        <Link
          href={`/play/trading${kidId ? `?kid=${kidId}` : ""}`}
          className="bg-green-50 border-2 border-green-200 rounded-3xl p-5 shadow-sm flex flex-col gap-3 active:scale-95 transition-transform"
        >
          <div className="text-4xl">📈</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-green-900">Nugget Market</span>
              <span className="text-[10px] font-bold bg-green-500 text-white px-1.5 py-0.5 rounded-full leading-none">NEW</span>
            </div>
            <div className="text-xs text-green-700 mt-0.5">Buy · Sell · Profit 🪙</div>
          </div>
        </Link>

        {/* AI Arcade */}
        <Link
          href={`/play/arcade${kidId ? `?kid=${kidId}` : ""}`}
          className="bg-cyan-50 border-2 border-cyan-200 rounded-3xl p-5 shadow-sm flex flex-col gap-3 active:scale-95 transition-transform"
        >
          <div className="text-4xl">🕹️</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-cyan-900">AI Arcade</span>
              <span className="text-[10px] font-bold bg-cyan-500 text-white px-1.5 py-0.5 rounded-full leading-none">NEW</span>
            </div>
            <div className="text-xs text-cyan-700 mt-0.5">6 AI games · Spend ⚡ Sparks</div>
          </div>
        </Link>

        {/* Flashcards */}
        <div className="bg-purple-50 border-2 border-purple-100 rounded-3xl p-5 flex flex-col gap-3 opacity-50">
          <div className="text-4xl">📇</div>
          <div>
            <div className="text-lg font-black text-purple-900">Flashcards</div>
            <div className="text-xs text-purple-500 mt-0.5">Coming soon</div>
          </div>
        </div>

        {/* Memory Match */}
        <div className="bg-emerald-50 border-2 border-emerald-100 rounded-3xl p-5 flex flex-col gap-3 opacity-50">
          <div className="text-4xl">🧩</div>
          <div>
            <div className="text-lg font-black text-emerald-900">Match</div>
            <div className="text-xs text-emerald-500 mt-0.5">Coming soon</div>
          </div>
        </div>

        {/* Spelling */}
        <div className="bg-rose-50 border-2 border-rose-100 rounded-3xl p-5 flex flex-col gap-3 opacity-50">
          <div className="text-4xl">✏️</div>
          <div>
            <div className="text-lg font-black text-rose-900">Spelling</div>
            <div className="text-xs text-rose-500 mt-0.5">Coming soon</div>
          </div>
        </div>
      </div>
    </div>
  );

  if (kid) {
    return (
      <KidShell kid={kid} active="play">
        {content}
      </KidShell>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 font-fun">
      <div className="flex items-center gap-3 px-4 pt-10 pb-2">
        <Link href="/select-kid" className="text-2xl text-indigo-400">←</Link>
      </div>
      {content}
    </main>
  );
}
