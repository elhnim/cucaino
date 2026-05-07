"use client";

import Link from "next/link";
import { signOut } from "@/lib/actions/auth";

const SESSION_KEY = "parent-unlocked";

export default function ParentHeaderActions({
  pendingCount,
}: {
  pendingCount?: number;
}) {
  const clearLock = () => sessionStorage.removeItem(SESSION_KEY);

  return (
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
        onClick={clearLock}
        className="bg-white/20 hover:bg-white/30 px-3 py-2 rounded-full text-xs font-bold flex items-center gap-1"
      >
        🔄 Kids view
      </Link>
      <form action={signOut}>
        <button
          type="submit"
          onClick={clearLock}
          className="bg-white/20 hover:bg-white/30 px-3 py-2 rounded-full text-xs font-bold flex items-center gap-1"
        >
          🚪 Sign out
        </button>
      </form>
    </div>
  );
}
