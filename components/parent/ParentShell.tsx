/**
 * ParentShell — standard chrome for /parent/* pages.
 *
 * Mobile-first (it's the parent's phone). Add a new parent page = use this
 * shell + the right `active` value. No layout work needed.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/lib/actions/auth";

type NavKey =
  | "overview"
  | "tasks"
  | "rewards"
  | "requests"
  | "kids"
  | "quizzes"
  | "feedback"
  | "settings";

const NAV: { key: NavKey; label: string; href: string }[] = [
  { key: "overview", label: "Home", href: "/parent" },
  { key: "tasks", label: "Tasks", href: "/parent/tasks" },
  { key: "rewards", label: "Rewards", href: "/parent/rewards" },
  { key: "requests", label: "Requests", href: "/parent/requests" },
  { key: "quizzes", label: "Quizzes", href: "/parent/quizzes" },
  { key: "kids", label: "Kids", href: "/parent/kids" },
  { key: "feedback", label: "Ideas", href: "/parent/feedback" },
  { key: "settings", label: "Settings", href: "/parent/settings" },
];

export default function ParentShell({
  active,
  title,
  subtitle,
  pendingCount,
  children,
}: {
  active: NavKey;
  title: string;
  subtitle?: string;
  pendingCount?: number;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-indigo-600 text-white p-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {active !== "overview" ? (
            <Link
              href="/parent"
              className="text-2xl shrink-0"
              aria-label="Back to overview"
            >
              ←
            </Link>
          ) : null}
          <div className="min-w-0">
            <div className="text-lg font-bold truncate">{title}</div>
            {subtitle ? (
              <div className="text-xs opacity-80 truncate">{subtitle}</div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pendingCount && pendingCount > 0 ? (
            <Link
              href="/parent/requests"
              className="relative bg-white/20 w-10 h-10 rounded-full flex items-center justify-center"
              aria-label="Pending requests"
            >
              🔔
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {pendingCount}
              </span>
            </Link>
          ) : null}
          <Link
            href="/select-kid"
            className="bg-white/20 hover:bg-white/30 px-3 py-2 rounded-full text-xs font-bold flex items-center gap-1"
            title="Switch to kid view"
          >
            🔄 <span className="hidden sm:inline">Switch</span>
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="bg-white/20 hover:bg-white/30 px-3 py-2 rounded-full text-xs font-bold flex items-center gap-1"
              title="Sign out"
            >
              🚪 <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scroll-area">{children}</div>

      <nav className="sticky bottom-0 bg-white border-t border-gray-200 px-1 py-2 grid grid-cols-8 gap-0 text-[11px]">
        {NAV.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`text-center py-1.5 rounded-lg ${
                isActive ? "text-indigo-700 font-bold bg-indigo-50" : "text-gray-500"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
