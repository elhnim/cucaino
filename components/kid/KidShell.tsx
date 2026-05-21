"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import type { Kid, BadgeProgress, UnlockedBadge } from "@/lib/domain/types";
import { getTheme } from "@/lib/themes/presets";
import KidOverridesApplier from "@/components/kid/KidOverridesApplier";
import NavIcon from "@/components/ui/NavIcon";
import BadgeUnlockModal from "@/components/kid/BadgeUnlockModal";
import { BADGE_META } from "@/lib/domain/badge-config";

type NavKey = "home" | "todo" | "rewards" | "play";

function wmoIcon(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code <= 3) return "☁️";
  if (code <= 49) return "🌫️";
  if (code <= 59) return "🌦️";
  if (code <= 69) return "🌧️";
  if (code <= 79) return "🌨️";
  if (code <= 82) return "🌧️";
  if (code <= 89) return "⛈️";
  return "🌩️";
}

const NAV_ITEMS: { key: NavKey; label: string; icon: "home" | "calendar" | "gift" | "play"; href: (kidId: string) => string }[] = [
  { key: "home",    label: "Home",     icon: "home",     href: (id) => `/kid/${id}/home` },
  { key: "todo",    label: "Schedule", icon: "calendar", href: (id) => `/kid/${id}/todo` },
  { key: "rewards", label: "Store",    icon: "gift",     href: (id) => `/kid/${id}/rewards` },
  { key: "play",    label: "Play",     icon: "play",     href: (id) => `/kid/${id}/play` },
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
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
        style={{ background: "rgba(255,255,255,0.2)" }}
      >
        <span data-kid-avatar={kid.id}>{kid.avatar}</span>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 bg-white rounded-2xl overflow-hidden z-50"
          style={{ minWidth: 180, boxShadow: "0 8px 32px -4px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)" }}
        >
          <Link
            href={`/kid/${kid.id}/history`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3.5 text-sm font-bold text-gray-800 border-b border-gray-50 hover:bg-gray-50"
          >
            <span className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-sm">📋</span>
            My history
          </Link>
          <Link
            href={`/kid/${kid.id}/feedback`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3.5 text-sm font-bold text-gray-800 border-b border-gray-50 hover:bg-gray-50"
          >
            <span className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-sm">💬</span>
            Send feedback
          </Link>
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
  active: activeProp,
  children,
  familyGoal,
  headerExtra,
  todayProgress,
  badges,
  weatherLocation,
}: {
  kid: Kid;
  active?: NavKey;
  children: ReactNode;
  familyGoal?: { name: string; emoji: string; current: number; target: number };
  headerExtra?: ReactNode;
  todayProgress?: { done: number; total: number };
  badges?: BadgeProgress[];
  weatherLocation?: { lat: number; lon: number };
}) {
  const pathname = usePathname();
  const router = useRouter();

  const navigateWithTransition = useCallback((href: string) => {
    if (typeof document !== "undefined" && "startViewTransition" in document) {
      (document as Document & { startViewTransition: (cb: () => Promise<void>) => void })
        .startViewTransition(async () => { router.push(href); });
    } else {
      router.push(href);
    }
  }, [router]);

  const active: NavKey = activeProp ?? (
    pathname.includes("/todo") ? "todo"
    : pathname.includes("/rewards") ? "rewards"
    : pathname.includes("/play") ? "play"
    : "home"
  );
  const theme = getTheme(kid.themeId);
  const progressPct = todayProgress && todayProgress.total > 0
    ? Math.round((todayProgress.done / todayProgress.total) * 100)
    : null;

  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [unlockedBadges, setUnlockedBadges] = useState<UnlockedBadge[]>([]);
  const handleBadgeUnlocked = useCallback((e: Event) => {
    const badges = (e as CustomEvent).detail?.badges as UnlockedBadge[];
    if (badges?.length) setUnlockedBadges(badges);
  }, []);
  useEffect(() => {
    window.addEventListener("badge-unlocked", handleBadgeUnlocked);
    return () => window.removeEventListener("badge-unlocked", handleBadgeUnlocked);
  }, [handleBadgeUnlocked]);

  const [isQuizActive, setIsQuizActive] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => setIsQuizActive((e as CustomEvent).detail?.active ?? false);
    window.addEventListener("quiz-active", handler);
    return () => window.removeEventListener("quiz-active", handler);
  }, []);

  const [weather, setWeather] = useState<{ icon: string; temp: number } | null>(null);
  useEffect(() => {
    const doFetch = async (latitude: number, longitude: number) => {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`
        );
        const json = await res.json();
        const code: number = json.current_weather?.weathercode ?? 0;
        const temp: number = Math.round(json.current_weather?.temperature ?? 0);
        setWeather({ icon: wmoIcon(code), temp });
      } catch {}
    };
    if (weatherLocation) {
      doFetch(weatherLocation.lat, weatherLocation.lon);
    } else if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(({ coords }) =>
        doFetch(coords.latitude, coords.longitude)
      );
    }
  }, [weatherLocation?.lat, weatherLocation?.lon]);

  return (
    <main className={`h-dvh bg-gradient-to-br ${theme.pageGradient} font-fun flex flex-col`}>

      <header
        className={`bg-gradient-to-br ${theme.headerGradient} text-white flex-shrink-0`}
        style={{ paddingTop: 32, paddingLeft: 16, paddingRight: 16, paddingBottom: headerExtra ? 12 : 16 }}
      >
        <div className="flex items-center gap-3">
          {/* Avatar — opens dropdown menu */}
          <KidAvatarMenu kid={kid} accent={theme.accent} />

          {/* Greeting + name + date/time/weather */}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold opacity-70 leading-none">
              {now
                ? now.getHours() < 12 ? "Good morning,"
                  : now.getHours() < 17 ? "Good afternoon,"
                  : "Good evening,"
                : "Good morning,"}
            </div>
            <div className="text-xl font-black leading-tight mt-0.5 truncate">
              <span data-kid-name={kid.id}>{kid.name}</span>
            </div>
            {now && (
              <div className="flex items-center gap-1.5 text-[10px] font-bold opacity-75 mt-0.5 flex-wrap">
                <span>{now.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</span>
                <span>·</span>
                <span>{now.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</span>
                {weather && (
                  <>
                    <span>·</span>
                    <span>{weather.icon} {weather.temp}°</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <span
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black"
                style={{ background: "rgba(255,255,255,0.2)" }}
              >
                ⭐ {kid.pointsBalance.toLocaleString()}
              </span>
              <span
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black"
                style={{ background: "rgba(255,255,255,0.2)" }}
              >
                💵 ${(kid.cashBalance / 100).toFixed(2)}
              </span>
              <span
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black"
                style={{ background: "rgba(255,255,255,0.2)" }}
              >
                🔥 {kid.currentStreak}d
              </span>
            </div>
            {todayProgress && todayProgress.total > 0 && (
              <div className="flex items-center gap-2 w-full justify-end">
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ width: 80, background: "rgba(255,255,255,0.25)" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${progressPct}%`,
                      background: progressPct === 100 ? "#86efac" : "rgba(255,255,255,0.85)",
                    }}
                  />
                </div>
                <span className="text-[10px] font-bold opacity-80 leading-none">
                  {todayProgress.done}/{todayProgress.total}
                </span>
              </div>
            )}
            {badges && badges.filter((b) => b.currentTier !== "none").length > 0 && (
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {badges
                  .filter((b) => b.currentTier !== "none")
                  .map((b) => {
                    const icon = BADGE_META[b.category as keyof typeof BADGE_META]?.icon ?? "⭐";
                    const tierColor =
                      b.currentTier === "gold" ? "#f59e0b"
                      : b.currentTier === "silver" ? "#9ca3af"
                      : "#cd7c3f";
                    return (
                      <span
                        key={b.id}
                        className="text-sm leading-none"
                        title={`${b.category} – ${b.currentTier}`}
                        style={{ filter: `drop-shadow(0 0 2px ${tierColor})` }}
                      >
                        {icon}
                      </span>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {familyGoal && (
          <div className="mt-3">
            <div className="text-[10px] font-semibold opacity-70 mb-1">
              {familyGoal.emoji} {familyGoal.name} · {familyGoal.current.toLocaleString()} / {familyGoal.target.toLocaleString()} ⭐
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
          </div>
        )}

        {headerExtra}
      </header>

      <KidOverridesApplier kid={kid} />

      <div className="flex-1 overflow-y-auto scroll-area">{children}</div>

      {/* Bottom nav */}
      <nav className="bg-white border-t border-gray-100 flex flex-shrink-0" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          const href = item.href(kid.id);
          return (
            <button
              key={item.key}
              type="button"
              onPointerDown={() => router.prefetch(href)}
              onClick={() => {
                if (isQuizActive && !window.confirm("Leave the quiz? Your progress will be lost.")) {
                  return;
                }
                navigateWithTransition(href);
              }}
              className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 bg-transparent border-0 cursor-pointer"
            >
              <span style={{ color: isActive ? theme.accent : "#9ca3af" }}>
                <NavIcon name={item.icon} size={22} />
              </span>
              <span
                className="text-[10px] font-bold tracking-wide"
                style={{ color: isActive ? theme.accent : "#9ca3af" }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {unlockedBadges.length > 0 && (
        <BadgeUnlockModal
          badges={unlockedBadges}
          onDismiss={() => setUnlockedBadges([])}
        />
      )}
    </main>
  );
}
