"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import NavIcon from "@/components/ui/NavIcon";
import { signOut } from "@/lib/actions/auth";

const NAV = [
  { path: "/parent",          key: "overview",  label: "Home",     icon: "home"     as const },
  { path: "/parent/tasks",    key: "tasks",     label: "Tasks",    icon: "checklist" as const },
  { path: "/parent/rewards",  key: "rewards",   label: "Rewards",  icon: "gift"     as const },
  { path: "/parent/quizzes",  key: "quizzes",   label: "Quizzes",  icon: "question" as const },
  { path: "/parent/settings", key: "settings",  label: "Settings", icon: "cog"      as const },
];

const EXTRA_TITLES: Record<string, string> = {
  "/parent/feedback":     "Feature ideas",
  "/parent/school-items": "School bag items",
  "/parent/kids":         "Kids",
  "/parent/requests":     "Reward requests",
};

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
        className="relative flex-shrink-0"
        aria-label="Account menu"
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
          style={{ background: "linear-gradient(135deg, #7c3aed, #a78bfa)" }}
        >
          {avatar ?? "🧙"}
        </div>
        <span className="absolute bottom-0 right-0 w-5 h-5 bg-white rounded-full flex items-center justify-center text-xs shadow">
          ✏️
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-14 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 min-w-[180px] py-2 flex flex-col">
          <Link
            href="/parent/profile"
            onClick={() => setOpen(false)}
            className="px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            ✏️ Edit profile
          </Link>
          <Link
            href="/select-kid"
            onClick={() => { clearLock(); setOpen(false); }}
            className="px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            ⇄ Switch profile
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              onClick={clearLock}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              🚪 Sign out
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
  });

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <ParentAvatarMenu avatar={avatar ?? "🧙"} />
        <div className="min-w-0">
          <div className="font-bold text-gray-900 truncate">Hi, {displayName || "Parent"}! 👋</div>
          <div className="text-xs text-gray-400 truncate">{dateStr}</div>
        </div>
      </header>

      <nav className="bg-white border-b border-gray-200 px-3 py-2 grid grid-cols-5 gap-2">
        {NAV.map((item) => {
          const isActive = item.path === pathname;
          return (
            <Link
              key={item.key}
              href={item.path}
              prefetch={false}
              className="flex flex-col items-center gap-1"
            >
              <span
                className="flex items-center justify-center transition-colors"
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: isActive ? "#4338ca" : "#f3f4f6",
                  color: isActive ? "#fff" : "#9ca3af",
                  boxShadow: isActive ? "0 4px 14px rgba(67,56,202,0.3)" : undefined,
                }}
              >
                <NavIcon name={item.icon} size={22} />
              </span>
              <span
                className="text-[10px] font-medium"
                style={{ color: isActive ? "#4338ca" : "#9ca3af" }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="flex-1 overflow-y-auto scroll-area">{children}</div>
    </main>
  );
}
