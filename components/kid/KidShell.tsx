/**
 * KidShell — the standard chrome for any /kid/[id]/* page.
 *
 * Wraps a page in:
 *   - Themed gradient header with avatar + points + streak
 *   - Optional family-goal strip
 *   - Scrollable content area
 *   - Bottom nav (Today / Week / Rewards / Progress / Play)
 *
 * Adding a new kid-side page = use this shell, drop content in `children`,
 * pass the right `active` value, and you're done. No layout work.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import type { Kid } from "@/lib/domain/types";
import { getTheme } from "@/lib/themes/presets";
import KidOverridesApplier from "@/components/kid/KidOverridesApplier";

type NavKey = "today" | "week" | "rewards" | "progress" | "play" | "profile";

const NAV_ITEMS: { key: NavKey; label: string; icon: string; href: (kidId: string) => string }[] = [
  { key: "today", label: "Today", icon: "🏠", href: (id) => `/kid/${id}/today` },
  { key: "week", label: "Week", icon: "📅", href: (id) => `/kid/${id}/week` },
  { key: "rewards", label: "Rewards", icon: "🎁", href: (id) => `/kid/${id}/rewards` },
  { key: "progress", label: "Progress", icon: "🏆", href: (id) => `/kid/${id}/progress` },
  { key: "play", label: "Play", icon: "🎮", href: () => "/play" },
  { key: "profile", label: "Profile", icon: "⚙️", href: (id) => `/kid/${id}/profile` },
];

export default function KidShell({
  kid,
  active,
  children,
  familyGoal,
}: {
  kid: Kid;
  active: NavKey;
  children: ReactNode;
  familyGoal?: { name: string; emoji: string; current: number; target: number };
}) {
  const theme = getTheme(kid.themeId);

  return (
    <main className={`min-h-screen bg-gradient-to-br ${theme.pageGradient} font-fun flex flex-col`}>
      {/* Header */}
      <header
        className={`bg-gradient-to-r ${theme.headerGradient} text-white p-4 md:p-5 flex items-center justify-between gap-3`}
      >
        <Link
          href="/select-kid"
          className="flex items-center gap-3 min-w-0 hover:bg-white/10 active:bg-white/20 rounded-2xl py-1 px-1 -mx-1 transition-colors"
          title="Switch profile"
        >
          <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-full bg-white/30 flex items-center justify-center text-3xl md:text-4xl shrink-0">
            <span data-kid-avatar={kid.id}>{kid.avatar}</span>
            <span className="absolute -bottom-1 -right-1 bg-white text-gray-700 rounded-full w-5 h-5 flex items-center justify-center text-xs shadow">
              🔄
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-xl md:text-2xl font-black truncate">
              Hi, <span data-kid-name={kid.id}>{kid.name}</span>! {theme.decoration}
            </div>
            <div className="text-xs md:text-sm opacity-90">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <span className="bg-white/20 backdrop-blur px-3 py-1.5 md:px-4 md:py-2 rounded-full font-bold text-base md:text-lg">
            ⭐ {kid.pointsBalance}
          </span>
          <span className="hidden sm:inline-flex bg-white/20 backdrop-blur px-3 py-1.5 md:px-4 md:py-2 rounded-full font-bold">
            🔥 {kid.currentStreak}d
          </span>
        </div>
      </header>

      {/* Family goal strip */}
      {familyGoal ? (
        <div className="px-4 md:px-5 py-3 bg-purple-100 border-b-2 border-purple-200">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-purple-900">
              {familyGoal.emoji} Family goal: {familyGoal.name}
            </span>
            <span className="text-purple-700 font-bold">
              {familyGoal.current} / {familyGoal.target}
            </span>
          </div>
          <div className="bg-white rounded-full h-2.5 mt-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-purple-500 to-pink-500 h-full"
              style={{
                width: `${Math.min(100, (familyGoal.current / familyGoal.target) * 100)}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Birthday banner + override patcher (client) */}
      <KidOverridesApplier kid={kid} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto scroll-area">{children}</div>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 bg-white border-t-2 border-gray-100 p-2 md:p-3 flex justify-around">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href(kid.id)}
              className={`flex flex-col items-center px-2 py-1 rounded-lg transition-colors ${
                isActive ? "font-bold" : "text-gray-500 hover:text-gray-700"
              }`}
              style={isActive ? { color: theme.accent } : undefined}
            >
              <span className="text-2xl">{item.icon}</span>
              <span className="text-xs">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
