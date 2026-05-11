"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import type { Kid } from "@/lib/domain/types";
import { getTheme } from "@/lib/themes/presets";
import KidOverridesApplier from "@/components/kid/KidOverridesApplier";

type NavKey = "home" | "todo" | "rewards" | "play";

const NAV_ITEMS: { key: NavKey; label: string; icon: string; href: (kidId: string) => string }[] = [
  { key: "home",    label: "Home",     icon: "🏠", href: (id) => `/kid/${id}/home` },
  { key: "todo",    label: "Schedule", icon: "📅", href: (id) => `/kid/${id}/todo` },
  { key: "rewards", label: "Rewards",  icon: "🎁", href: (id) => `/kid/${id}/rewards` },
  { key: "play",    label: "Play",     icon: "🎮", href: (id) => `/play?kid=${id}` },
];

export function KidAvatarMenu({ kid, accent }: { kid: Kid; accent: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-12 h-12 rounded-full flex items-center justify-center text-3xl border-2 border-white/40"
        style={{ background: "rgba(255,255,255,0.2)" }}
      >
        <span data-kid-avatar={kid.id}>{kid.avatar}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 bg-white rounded-2xl overflow-hidden z-50"
          style={{ minWidth: 180, boxShadow: "0 8px 32px -4px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)" }}
        >
          <Link
            href={`/kid/${kid.id}/profile`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3.5 text-sm font-bold text-gray-800 border-b border-gray-50 hover:bg-gray-50"
          >
            <span className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-sm">✏️</span>
            Edit profile
          </Link>
          <Link
            href="/select-kid"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3.5 text-sm font-bold text-gray-800 hover:bg-gray-50"
          >
            <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm">🔄</span>
            Switch profile
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
  customHeader,
}: {
  kid: Kid;
  active: NavKey;
  children: ReactNode;
  familyGoal?: { name: string; emoji: string; current: number; target: number };
  customHeader?: ReactNode;
}) {
  const theme = getTheme(kid.themeId);

  return (
    <main className={`min-h-screen bg-gradient-to-br ${theme.pageGradient} font-fun flex flex-col`}>

      {customHeader ?? (
        <header
          className={`bg-gradient-to-br ${theme.headerGradient} text-white flex-shrink-0`}
          style={{ paddingTop: 36, paddingLeft: 20, paddingRight: 20, paddingBottom: 20 }}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-sm font-semibold opacity-75">Good morning,</div>
              <div className="text-[22px] font-black leading-tight mt-0.5">
                <span data-kid-name={kid.id}>{kid.name}</span> {kid.avatar}
              </div>
            </div>
            <KidAvatarMenu kid={kid} accent={theme.accent} />
          </div>

          {familyGoal && (
            <>
              <div className="text-[11px] font-semibold opacity-70 mb-1.5">
                Family goal — {familyGoal.emoji} {familyGoal.name} · {familyGoal.current.toLocaleString()} / {familyGoal.target.toLocaleString()} ⭐
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.25)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (familyGoal.current / familyGoal.target) * 100)}%`,
                    background: "rgba(255,255,255,0.85)",
                  }}
                />
              </div>
            </>
          )}
        </header>
      )}

      <KidOverridesApplier kid={kid} />

      <div className="flex-1 overflow-y-auto scroll-area">{children}</div>

      {/* Bottom nav */}
      <nav className="bg-white border-t border-gray-100 flex flex-shrink-0" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href(kid.id)}
              prefetch={false}
              className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5"
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span
                className="text-[10px] font-bold tracking-wide"
                style={{ color: isActive ? theme.accent : "#9ca3af" }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
