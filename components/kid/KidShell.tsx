"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import type { Kid } from "@/lib/domain/types";
import { getTheme } from "@/lib/themes/presets";
import KidOverridesApplier from "@/components/kid/KidOverridesApplier";
import NavIcon from "@/components/ui/NavIcon";

type NavKey = "home" | "todo" | "rewards" | "play";

const NAV_ITEMS: { key: NavKey; label: string; icon: "home" | "calendar" | "gift" | "play"; href: (kidId: string) => string }[] = [
  { key: "home",    label: "Home",    icon: "home",     href: (id) => `/kid/${id}/home` },
  { key: "todo",    label: "Todo",    icon: "calendar", href: (id) => `/kid/${id}/todo` },
  { key: "rewards", label: "Rewards", icon: "gift",     href: (id) => `/kid/${id}/rewards` },
  { key: "play",    label: "Play",    icon: "play",     href: () => "/play" },
];

function KidAvatarMenu({ kid, accent, accentSoft }: { kid: Kid; accent: string; accentSoft: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-3xl md:text-4xl shrink-0"
        style={{ background: accentSoft }}
      >
        <span data-kid-avatar={kid.id}>{kid.avatar}</span>
        <span className="absolute -bottom-1 -right-1 bg-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow">
          ✏️
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 bg-white rounded-2xl shadow-xl z-50 min-w-[170px] overflow-hidden">
          <Link
            href={`/kid/${kid.id}/profile`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 active:bg-gray-100"
          >
            ✏️ Edit profile
          </Link>
          <Link
            href="/select-kid"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 active:bg-gray-100 border-t border-gray-100"
          >
            ⇄ Switch profile
          </Link>
        </div>
      )}
    </div>
  );
}

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
        <div className="flex items-center gap-3 min-w-0">
          <KidAvatarMenu kid={kid} accent={theme.accent} accentSoft={theme.accentSoft} />
          <div className="min-w-0">
            <div className="text-xl md:text-2xl font-black truncate">
              Hi <span data-kid-name={kid.id}>{kid.name}</span>! 👋
            </div>
            <div className="text-xs md:text-sm opacity-90">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </div>
          </div>
        </div>
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

      {/* Top nav */}
      <nav className="bg-white/80 backdrop-blur border-b-2 border-gray-100 px-3 py-2 flex justify-around">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href(kid.id)}
              prefetch={false}
              className="flex flex-col items-center gap-1"
            >
              <span
                className="flex items-center justify-center transition-all"
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: isActive ? theme.accent : "#f3f4f6",
                  boxShadow: isActive ? `0 4px 14px ${theme.accent}66` : "none",
                  color: isActive ? "#fff" : "#9ca3af",
                }}
              >
                <NavIcon name={item.icon} size={24} />
              </span>
              <span
                className="text-[10px] font-bold"
                style={{ color: isActive ? theme.accent : "#9ca3af" }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scroll-area">{children}</div>
    </main>
  );
}
