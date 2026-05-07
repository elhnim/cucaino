"use client";

import { useState } from "react";
import type { SchoolItem } from "@/lib/domain/types";

export default function SchoolBagSection({
  section,
}: {
  section: {
    type: "school-bag";
    title: string;
    caption: string;
    items: SchoolItem[];
    mode: "morning" | "evening";
  };
}) {
  const [packed, setPacked] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setPacked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const packAll = () => setPacked(new Set(section.items.map((i) => i.id)));

  const morning = section.mode === "morning";
  const wrapClass = morning
    ? "bg-gradient-to-br from-emerald-100 to-teal-100 border-emerald-400"
    : "bg-gradient-to-br from-indigo-100 to-purple-100 border-indigo-400";
  const titleColor = morning ? "text-emerald-900" : "text-indigo-900";
  const captionColor = morning ? "text-emerald-700" : "text-indigo-700";
  const buttonColor = morning ? "bg-emerald-500 hover:bg-emerald-600" : "bg-indigo-500 hover:bg-indigo-600";
  const accentClass = morning ? "accent-emerald-600" : "accent-indigo-600";

  const packedCount = section.items.filter((i) => packed.has(i.id)).length;

  return (
    <div className={`rounded-2xl p-4 shadow-lg border-2 ${wrapClass}`}>
      <div className="flex items-start gap-3">
        <div className="text-4xl shrink-0">{morning ? "🎒" : "🌙"}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className={`font-black text-base md:text-lg ${titleColor}`}>
                {section.title}
              </div>
              <div className={`text-xs font-bold ${captionColor}`}>
                {section.caption} · {packedCount} of {section.items.length} packed
              </div>
            </div>
            {packedCount < section.items.length ? (
              <button
                type="button"
                onClick={packAll}
                className={`${buttonColor} text-white text-sm font-bold px-3 py-1.5 rounded-lg`}
              >
                Pack all ✓
              </button>
            ) : (
              <span className="text-sm font-bold text-green-700 bg-green-100 px-3 py-1.5 rounded-lg">
                ✅ All packed
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 text-sm">
            {section.items.map((item) => {
              const isPacked = packed.has(item.id);
              return (
                <label
                  key={item.id}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isPacked}
                    onChange={() => toggle(item.id)}
                    className={`w-4 h-4 ${accentClass}`}
                  />
                  <span className={isPacked ? "line-through text-gray-500" : "font-medium"}>
                    {item.icon} {item.name}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
