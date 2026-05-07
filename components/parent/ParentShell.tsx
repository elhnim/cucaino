"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import ParentHeaderActions from "@/components/parent/ParentHeaderActions";

const NAV = [
  { path: "/parent", key: "overview", label: "Home", icon: "🏠", title: "Family overview" },
  { path: "/parent/tasks", key: "tasks", label: "Tasks", icon: "✅", title: "Tasks" },
  { path: "/parent/rewards", key: "rewards", label: "Rewards", icon: "🎁", title: "Rewards" },
  { path: "/parent/requests", key: "requests", label: "Requests", icon: "🔔", title: "Reward requests" },
  { path: "/parent/kids", key: "kids", label: "Kids", icon: "👧", title: "Kids" },
  { path: "/parent/settings", key: "settings", label: "Settings", icon: "⚙️", title: "Settings" },
] as const;

const EXTRA_TITLES: Record<string, string> = {
  "/parent/feedback": "Feature ideas",
  "/parent/quizzes": "Quiz banks",
};

export default function ParentShell({
  pendingCount,
  children,
}: {
  pendingCount?: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const route = NAV.find((r) => r.path === pathname);
  const title = route?.title ?? EXTRA_TITLES[pathname] ?? "Parent";
  const isOverview = pathname === "/parent";
  const subtitle = isOverview
    ? new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    : undefined;

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-indigo-600 text-white p-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {!isOverview ? (
            <Link href="/parent" className="text-2xl shrink-0" aria-label="Back to overview">
              ←
            </Link>
          ) : null}
          <div className="min-w-0">
            <div className="text-lg font-bold truncate">{title}</div>
            {subtitle ? <div className="text-xs opacity-80 truncate">{subtitle}</div> : null}
          </div>
        </div>
        <ParentHeaderActions pendingCount={pendingCount} />
      </header>

      <nav className="bg-white border-b border-gray-200 px-1 py-1 grid grid-cols-6 gap-0 text-[10px]">
        {NAV.map((item) => {
          const isActive = item.path === pathname;
          return (
            <Link
              key={item.key}
              href={item.path}
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

      <div className="flex-1 overflow-y-auto scroll-area">{children}</div>
    </main>
  );
}
