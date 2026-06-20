import Link from "next/link";
import { getKid } from "@/lib/data/stub";
import { notFound } from "next/navigation";

export default async function KidPlayPage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const kid = await getKid(kidId);
  if (!kid) notFound();

  return (
    <div className="max-w-3xl mx-auto p-4 pt-5">
      <h1 className="text-2xl font-black text-gray-900 mb-4">🎮 Play</h1>

      <div className="grid grid-cols-2 gap-3">
        {/* Star Pets */}
        <Link
          href={`/play/pet?kid=${kid.id}`}
          className="bg-pink-50 border-2 border-pink-200 rounded-3xl p-5 shadow-sm flex flex-col gap-3 active:scale-95 transition-transform"
        >
          <div className="text-4xl"><span className="avatar-idle inline-block">🐾</span></div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-pink-900">Star Pets</span>
              <span className="text-[10px] font-bold bg-pink-500 text-white px-1.5 py-0.5 rounded-full leading-none">NEW</span>
            </div>
            <div className="text-xs text-pink-700 mt-0.5">Adopt · Feed · Grow ⭐</div>
          </div>
        </Link>

        <Link
          href={`/kid/${kid.id}/play/quiz`}
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
          href={`/play/trading?kid=${kid.id}`}
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

        {/* Invest */}
        <Link
          href={`/play/invest?kid=${kid.id}`}
          className="bg-indigo-50 border-2 border-indigo-200 rounded-3xl p-5 shadow-sm flex flex-col gap-3 active:scale-95 transition-transform"
        >
          <div className="text-4xl">📊</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-indigo-950">Invest</span>
              <span className="text-[10px] font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded-full leading-none">NEW</span>
            </div>
            <div className="text-xs text-indigo-700 mt-0.5">Real prices · Learn first</div>
          </div>
        </Link>

        {/* AI Arcade */}
        <Link
          href={`/play/arcade?kid=${kid.id}`}
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

        {/* Dream Life */}
        <Link
          href={`/play/dream-life?kid=${kid.id}`}
          className="bg-violet-50 border-2 border-violet-200 rounded-3xl p-5 shadow-sm flex flex-col gap-3 active:scale-95 transition-transform"
        >
          <div className="text-4xl"><span className="avatar-idle inline-block">🌟</span></div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-violet-900">Dream Life</span>
              <span className="text-[10px] font-bold bg-violet-500 text-white px-1.5 py-0.5 rounded-full leading-none">NEW</span>
            </div>
            <div className="text-xs text-violet-700 mt-0.5">Live a whole life · deep strategy · 30–60 min</div>
          </div>
        </Link>

        {/* Money Town */}
        <Link
          href={`/play/money-town?kid=${kid.id}`}
          className="bg-yellow-50 border-2 border-yellow-200 rounded-3xl p-5 shadow-sm flex flex-col gap-3 active:scale-95 transition-transform"
        >
          <div className="text-4xl">💰</div>
          <div>
            <div className="text-lg font-black text-yellow-900">Money Town</div>
            <div className="text-xs text-yellow-700 mt-0.5">Quick game · 5–10 min · 2–4 players</div>
          </div>
        </Link>

        {/* Family Talking Point */}
        <Link
          href={`/play/family-talking-point?kid=${kid.id}`}
          className="bg-teal-50 border-2 border-teal-200 rounded-3xl p-5 shadow-sm flex flex-col gap-3 active:scale-95 transition-transform"
        >
          <div className="text-4xl">💬</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-teal-900">Family Talking Point</span>
              <span className="text-[10px] font-bold bg-teal-500 text-white px-1.5 py-0.5 rounded-full leading-none">NEW</span>
            </div>
            <div className="text-xs text-teal-700 mt-0.5">A question for the whole family 💬</div>
          </div>
        </Link>

        {/* Village Pillage */}
        <Link
          href={`/play/village-pillage?kid=${kid.id}`}
          className="bg-emerald-50 border-2 border-emerald-200 rounded-3xl p-5 shadow-sm flex flex-col gap-3 active:scale-95 transition-transform"
        >
          <div className="text-4xl">🏰</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-emerald-900">Village Pillage</span>
              <span className="text-[10px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full leading-none">NEW</span>
            </div>
            <div className="text-xs text-emerald-700 mt-0.5">Card duel · multi-device · 2–6 players 🥔</div>
          </div>
        </Link>

        <div className="bg-purple-50 border-2 border-purple-100 rounded-3xl p-5 flex flex-col gap-3 opacity-50">
          <div className="text-4xl">📇</div>
          <div>
            <div className="text-lg font-black text-purple-900">Flashcards</div>
            <div className="text-xs text-purple-500 mt-0.5">Coming soon</div>
          </div>
        </div>

        <div className="bg-emerald-50 border-2 border-emerald-100 rounded-3xl p-5 flex flex-col gap-3 opacity-50">
          <div className="text-4xl">🧩</div>
          <div>
            <div className="text-lg font-black text-emerald-900">Match</div>
            <div className="text-xs text-emerald-500 mt-0.5">Coming soon</div>
          </div>
        </div>

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
}
