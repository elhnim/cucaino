import Link from "next/link";
import { listKids } from "@/lib/data/stub";

interface GameCard {
  id: string;
  title: string;
  description: string;
  emoji: string;
  href?: string;
  comingSoon?: boolean;
  /** Tailwind classes for the card body when active */
  activeClass?: string;
}

const GAMES: GameCard[] = [
  {
    id: "quiz",
    title: "Quiz battles",
    description: "Take turns or solo — maths, spelling, silly trivia and more",
    emoji: "🎮",
    href: "/play/quiz",
    activeClass: "from-fuchsia-500 to-purple-600 text-white",
  },
  {
    id: "memory",
    title: "Memory match",
    description: "Flip cards, find pairs, beat the clock",
    emoji: "🃏",
    comingSoon: true,
  },
  {
    id: "draw",
    title: "Drawing duel",
    description: "Guess what your sibling drew",
    emoji: "🎨",
    comingSoon: true,
  },
  {
    id: "words",
    title: "Word jumble",
    description: "Unscramble words against the timer",
    emoji: "🔤",
    comingSoon: true,
  },
  {
    id: "rps",
    title: "Rock paper scissors",
    description: "Best of 5 on one tablet",
    emoji: "✊",
    comingSoon: true,
  },
  {
    id: "story",
    title: "Story builder",
    description: "Take turns adding one line to a silly story",
    emoji: "📖",
    comingSoon: true,
  },
];

export default async function PlayHubPage() {
  const kids = await listKids();

  return (
    <main className="min-h-screen bg-gradient-to-br from-violet-100 via-fuchsia-100 to-orange-100 font-fun p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-fuchsia-900">
              🎮 Play together
            </h1>
            <p className="text-sm md:text-base text-fuchsia-700">
              Pick a game and battle for the high score!
            </p>
          </div>
          <Link
            href="/select-kid"
            className="text-sm bg-white/70 hover:bg-white px-4 py-2 rounded-full shadow shrink-0"
          >
            ← Back
          </Link>
        </div>

        {/* Players */}
        <div className="bg-white rounded-2xl p-4 shadow mb-6">
          <div className="text-sm font-bold text-gray-500 mb-2">PLAYERS</div>
          <div className="flex gap-3 flex-wrap">
            {kids.map((kid) => (
              <div
                key={kid.id}
                className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2"
              >
                <div className="text-2xl">{kid.avatar}</div>
                <div>
                  <div className="text-sm font-bold">{kid.name}</div>
                  <div className="text-xs text-gray-500">⭐ {kid.pointsBalance}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Game grid */}
        <h2 className="text-sm font-bold text-gray-500 mb-2">GAMES</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {GAMES.map((game) => {
            if (game.comingSoon) {
              return (
                <div
                  key={game.id}
                  className="bg-white rounded-2xl p-4 shadow opacity-60 relative"
                >
                  <span className="absolute top-2 right-2 text-[10px] font-bold bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
                    SOON
                  </span>
                  <div className="text-4xl">{game.emoji}</div>
                  <div className="font-bold text-gray-700 mt-1">{game.title}</div>
                  <div className="text-xs text-gray-500">{game.description}</div>
                </div>
              );
            }
            return (
              <Link
                key={game.id}
                href={game.href!}
                className={`rounded-2xl p-5 shadow hover:shadow-xl hover:-translate-y-0.5 transition-all relative bg-gradient-to-br ${game.activeClass}`}
              >
                <div className="text-5xl mb-2">{game.emoji}</div>
                <div className="font-black text-xl">{game.title}</div>
                <div className="text-sm opacity-90">{game.description}</div>
                <div className="absolute top-3 right-3 text-2xl">→</div>
              </Link>
            );
          })}
        </div>

        <p className="text-xs text-center text-gray-500 mt-6">
          More games rolling out — got an idea?{" "}
          <Link
            href="/parent/feedback"
            className="font-bold text-indigo-600 hover:underline"
          >
            Send it via Feature ideas
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
