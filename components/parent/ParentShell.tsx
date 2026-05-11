"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { signOut } from "@/lib/actions/auth";

function HomeIcon({ active }: { active: boolean }) {
  const color = active ? "#6366f1" : "#9ca3af";
  return (
    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />
    </svg>
  );
}

function TasksIcon({ active }: { active: boolean }) {
  const color = active ? "#6366f1" : "#9ca3af";
  return (
    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="2.2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}

function RewardsIcon({ active }: { active: boolean }) {
  const color = active ? "#6366f1" : "#9ca3af";
  return (
    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="2.2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a4 4 0 00-4-4H5.45a1 1 0 00-.95 1.316l.86 2.38A2 2 0 007.24 7H12zm0 0V6a4 4 0 014-4h2.55a1 1 0 01.95 1.316l-.86 2.38A2 2 0 0116.76 7H12zM3 11h18M5 11v9a2 2 0 002 2h10a2 2 0 002-2v-9" />
    </svg>
  );
}

function QuizzesIcon({ active }: { active: boolean }) {
  const color = active ? "#6366f1" : "#9ca3af";
  return (
    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="2.2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function SettingsIcon({ active }: { active: boolean }) {
  const color = active ? "#6366f1" : "#9ca3af";
  return (
    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth="2.2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2.2" />
    </svg>
  );
}

const NAV = [
  { path: "/parent",          key: "home",     label: "Home",     Icon: HomeIcon },
  { path: "/parent/tasks",    key: "tasks",    label: "Tasks",    Icon: TasksIcon },
  { path: "/parent/rewards",  key: "rewards",  label: "Rewards",  Icon: RewardsIcon },
  { path: "/parent/quizzes",  key: "quizzes",  label: "Quizzes",  Icon: QuizzesIcon },
  { path: "/parent/settings", key: "settings", label: "Settings", Icon: SettingsIcon },
];

function ParentAvatarMenu({ avatar }: { avatar: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const clearLock = () => sessionStorage.removeItem("parent-unlocked");

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        className="w-10 h-10 rounded-full flex items-center justify-center text-xl border-2 border-indigo-400"
        style={{ background: "#eef2ff" }}
      >
        {avatar}
      </button>

      {open && (
        <div
          className="absolute right-0 top-12 z-50 bg-white rounded-2xl overflow-hidden"
          style={{ minWidth: 180, boxShadow: "0 8px 32px -4px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)" }}
        >
          <Link
            href="/parent/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3.5 text-sm font-bold text-gray-800 border-b border-gray-50 hover:bg-gray-50"
          >
            <span className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-sm">✏️</span>
            Edit profile
          </Link>
          <Link
            href="/select-kid"
            onClick={() => { clearLock(); setOpen(false); }}
            className="flex items-center gap-2.5 px-4 py-3.5 text-sm font-bold text-gray-800 border-b border-gray-50 hover:bg-gray-50"
          >
            <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm">⇄</span>
            Switch profile
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              onClick={clearLock}
              className="w-full text-left flex items-center gap-2.5 px-4 py-3.5 text-sm font-bold text-gray-800 hover:bg-gray-50"
            >
              <span className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-sm">🚪</span>
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function ParentShell({
  children,
  displayName,
  avatar,
}: {
  pendingCount?: number;
  displayName?: string | null;
  avatar?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header
        className="bg-white border-b border-gray-100 px-5 flex items-center justify-between flex-shrink-0"
        style={{ paddingTop: 16, paddingBottom: 12 }}
      >
        <div>
          <div className="font-extrabold text-gray-900" style={{ fontSize: 18, lineHeight: 1.2 }}>
            Good morning, {displayName || "Parent"}! 👋
          </div>
          <div className="text-gray-400 font-medium mt-0.5" style={{ fontSize: 12 }}>
            {dateStr}
          </div>
        </div>
        <ParentAvatarMenu avatar={avatar ?? "🧙"} />
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scroll-area pb-20">{children}</div>

      {/* Bottom nav */}
      <nav
        className="bg-white border-t border-gray-200 flex flex-shrink-0 fixed bottom-0 left-0 right-0 z-20"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {NAV.map((item) => {
          const isActive = item.path === "/parent"
            ? pathname === "/parent"
            : pathname.startsWith(item.path);
          return (
            <Link
              key={item.key}
              href={item.path}
              prefetch={false}
              className="flex-1 flex flex-col items-center justify-center gap-0.5"
              style={{ padding: "10px 4px 12px" }}
            >
              <div className="w-6 h-6 flex items-center justify-center">
                <item.Icon active={isActive} />
              </div>
              <span
                className="text-[10px] font-semibold"
                style={{ color: isActive ? "#6366f1" : "#9ca3af" }}
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
