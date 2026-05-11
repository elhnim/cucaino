"use client";

import { useState } from "react";
import Link from "next/link";

export default function AvatarMenu({
  kidId,
  avatar,
}: {
  kidId: string;
  avatar: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
        style={{ background: "rgba(255,255,255,0.2)" }}
      >
        {avatar}
      </button>

      {open && (
        <>
          {/* dismiss overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute top-12 right-0 z-50 bg-white rounded-2xl overflow-hidden"
            style={{ minWidth: 180, boxShadow: "0 8px 32px -4px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)" }}
          >
            <Link
              href={`/kid/${kidId}/profile`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3.5 text-sm font-bold text-gray-800 border-b border-gray-50 hover:bg-gray-50"
            >
              <span className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-base">✏️</span>
              Edit profile
            </Link>
            <Link
              href="/select-kid"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3.5 text-sm font-bold text-gray-800 hover:bg-gray-50"
            >
              <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-base">🔄</span>
              Switch profile
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
