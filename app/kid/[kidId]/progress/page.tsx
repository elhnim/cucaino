import { notFound } from "next/navigation";
import KidShell from "@/components/kid/KidShell";
import { getKid, listKids } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";

const LEVELS = [
  { min: 0,    max: 99,   emoji: "🌱", name: "Seedling",  color: "#16a34a" },
  { min: 100,  max: 299,  emoji: "🗺️", name: "Explorer",  color: "#2563eb" },
  { min: 300,  max: 599,  emoji: "🏅", name: "Champion",  color: "#d97706" },
  { min: 600,  max: 999,  emoji: "🌟", name: "Legend",    color: "#7c3aed" },
  { min: 1000, max: Infinity, emoji: "🚀", name: "Superstar", color: "#dc2626" },
];

const BADGE_CATEGORIES = [
  { emoji: "🪥", label: "Hygiene",     bronze: "Clean Start",  silver: "Squeaky Clean", gold: "Hygiene Hero" },
  { emoji: "💪", label: "Physical",    bronze: "On the Move",  silver: "Athlete",        gold: "Sports Star"  },
  { emoji: "📚", label: "Learning",    bronze: "Bookworm",     silver: "Scholar",        gold: "Genius"       },
  { emoji: "🧹", label: "Chores",      bronze: "Helper",       silver: "House Pro",      gold: "Home Hero"    },
  { emoji: "🎵", label: "Music",       bronze: "First Notes",  silver: "Musician",       gold: "Maestro"      },
  { emoji: "🧘", label: "Mindfulness", bronze: "Good Rest",    silver: "Calm Mind",      gold: "Zen Master"   },
];

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function ProgressPage({
  params,
}: {
  params: Promise<{ kidId: string }>;
}) {
  const { kidId } = await params;
  const [kid, allKids] = await Promise.all([getKid(kidId), listKids()]);
  if (!kid) notFound();

  const theme = getTheme(kid.themeId);
  const stars = kid.totalStarsEarned;

  const levelIdx = LEVELS.findIndex((l) => stars >= l.min && stars <= l.max);
  const level = LEVELS[levelIdx];
  const nextLevel = LEVELS[levelIdx + 1] ?? null;

  const progressPct = nextLevel
    ? Math.min(100, ((stars - level.min) / (nextLevel.min - level.min)) * 100)
    : 100;

  const sortedKids = [...allKids].sort((a, b) => b.pointsBalance - a.pointsBalance);

  return (
    <KidShell kid={kid} active="home">
      <div className="p-4 space-y-5">

        {/* Level card */}
        <div
          className="rounded-2xl p-5 text-center shadow"
          style={{ backgroundColor: level.color + "20" }}
        >
          <div className="text-5xl">{level.emoji}</div>
          <div className="text-2xl font-black mt-1">{level.name}</div>
          <div className="text-sm text-gray-500 mt-1">⭐ {stars} earned</div>

          <div className="mt-4 w-full bg-gray-200 rounded-full h-3">
            <div
              className="h-3 rounded-full transition-all"
              style={{ width: `${progressPct}%`, backgroundColor: level.color }}
            />
          </div>

          {nextLevel ? (
            <div className="text-sm text-gray-500 mt-2">
              {nextLevel.min - stars} more ⭐ to {nextLevel.name}
            </div>
          ) : (
            <div className="text-sm text-gray-500 mt-2">You&apos;re at the top! 🎉</div>
          )}
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          <StatTile icon="🔥" value={`${kid.currentStreak}d`} label="STREAK" />
          <StatTile icon="🏆" value={`${kid.longestStreak}d`} label="BEST" />
          <StatTile icon="⭐" value={kid.totalStarsEarned} label="EARNED" />
        </div>

        {/* Badge grid */}
        <div>
          <div className="font-bold mb-3">🎖 My Badges</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {BADGE_CATEGORIES.map((cat) => (
              <div
                key={cat.label}
                className="bg-white rounded-2xl shadow p-3 text-center"
              >
                <div className="text-3xl">{cat.emoji}</div>
                <div className="text-xs font-bold text-gray-500 mt-1">{cat.label}</div>
                <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-gray-300" style={{ width: "0%" }} />
                </div>
                <div className="text-xs text-gray-400 mt-1">0/10 to Bronze</div>
                <div className="text-xs text-gray-400 italic mt-0.5">{cat.bronze}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Family board */}
        <div>
          <div className="font-bold mb-3">👨‍👩‍👧 Family This Week</div>
          <div className="space-y-2">
            {sortedKids.map((k, i) => {
              const kidTheme = getTheme(k.themeId);
              const isCurrentKid = k.id === kid.id;
              return (
                <div
                  key={k.id}
                  className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow"
                  style={
                    isCurrentKid
                      ? {
                          borderLeft: `4px solid ${theme.accent}`,
                          backgroundColor: theme.accentSoft + "40",
                        }
                      : undefined
                  }
                >
                  <span className="text-xl w-6 text-center">{MEDALS[i] ?? ""}</span>
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
                    style={{ backgroundColor: kidTheme.accentSoft }}
                  >
                    {k.avatar}
                  </span>
                  <span className="flex-1 font-bold text-sm">{k.name}</span>
                  <span className="text-sm text-gray-500">⭐ {k.pointsBalance}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </KidShell>
  );
}

function StatTile({
  icon,
  value,
  label,
}: {
  icon: string;
  value: string | number;
  label: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 text-center shadow">
      <div className="text-3xl">{icon}</div>
      <div className="text-2xl font-black mt-1">{value}</div>
      <div className="text-xs text-gray-500 font-bold">{label}</div>
    </div>
  );
}
