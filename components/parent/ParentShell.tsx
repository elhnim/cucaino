/**
 * ParentShell — standard chrome for /parent/* pages.
 *
 * Mobile-first (it's the parent's phone). Add a new parent page = use this
 * shell + the right `active` value. No layout work needed.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import ParentHeaderActions from "@/components/parent/ParentHeaderActions";

type NavKey =
  | "overview"
  | "tasks"
  | "rewards"
  | "requests"
  | "kids"
  | "quizzes"
  | "feedback"
  | "settings";

const NAV: { key: NavKey; label: string; icon: string; href: string }[] = [
  { key: "overview", label: "Home", icon: "🏠", href: "/parent" },
  { key: "tasks", label: "Tasks", icon: "✅", href: "/parent/tasks" },
  { key: "rewards", label: "Rewards", icon: "🎁", href: "/parent/rewards" },
  { key: "requests", label: "Requests", icon: "🔔", href: "/parent/requests" },
  { key: "kids", label: "Kids", icon: "👧", href: "/parent/kids" },
  { key: "settings", label: "Settings", icon: "⚙️", href: "/parent/settings" },
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
        <ParentHeaderActions pendingCount={pendingCount} />
      </header>

      <div className="flex-1 overflow-y-auto scroll-area">{children}</div>

      <nav className="sticky bottom-0 bg-white border-t border-gray-200 px-1 py-1 grid grid-cols-6 gap-0 text-[10px]">
        {NAV.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              prefetch={false}
              className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-colors ${
                isActive ? "text-indigo-700 font-bold bg-indigo-50" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
