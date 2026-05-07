import { listKids } from "@/lib/data/stub";
import { getTheme } from "@/lib/themes/presets";

export default async function ParentKidsPage() {
  const kids = await listKids();

  return (
    <div className="p-4 space-y-3">
        {kids.map((kid) => {
          const theme = getTheme(kid.themeId);
          return (
            <div
              key={kid.id}
              className={`bg-gradient-to-r ${theme.headerGradient} text-white rounded-2xl p-4 shadow`}
            >
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-white/30 flex items-center justify-center text-3xl">
                  {kid.avatar}
                </div>
                <div className="flex-1">
                  <div className="text-xl font-black">{kid.name}</div>
                  <div className="text-sm opacity-90">
                    Age {kid.age} · Theme: {theme.name} {theme.decoration}
                  </div>
                  <div className="text-sm opacity-90">
                    ⭐ {kid.pointsBalance} · 🔥 {kid.currentStreak}d (best {kid.longestStreak})
                  </div>
                </div>
                <button
                  type="button"
                  className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg font-bold"
                >
                  Edit
                </button>
              </div>
            </div>
          );
        })}
      </div>
  );
}
