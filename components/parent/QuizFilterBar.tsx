"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ACTIVE_QUIZ_THEMES } from "@/lib/registry/quiz-theme-registry";
import { QUIZ_DIFFICULTIES } from "@/lib/registry/quiz-difficulty-registry";

export default function QuizFilterBar({
  themes,
  difficulty,
}: {
  themes: string[];
  difficulty: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function push(t: string[], d: string) {
    const params = new URLSearchParams();
    if (t.length) params.set("theme", t.join(","));
    if (d) params.set("difficulty", d);
    const qs = params.toString();
    router.push(`/parent/quizzes${qs ? `?${qs}` : ""}`);
  }

  const toggleTheme = (id: string) => {
    const next = themes.includes(id) ? themes.filter((t) => t !== id) : [...themes, id];
    push(next, difficulty);
  };

  return (
    <div className="px-4 py-2.5 bg-white border-b border-gray-100 flex gap-3 items-center">
      {/* Theme multi-select dropdown */}
      <div ref={ref} className="relative flex-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between border-[1.5px] border-gray-200 rounded-xl bg-white text-sm font-semibold text-gray-800 px-3 py-1.5 focus:outline-none focus:border-indigo-400"
        >
          <span className="text-gray-500">
            Themes{themes.length > 0 && <span className="ml-1.5 bg-indigo-600 text-white text-[10px] font-black rounded-full px-1.5 py-0.5">{themes.length}</span>}
          </span>
          <span className="text-gray-400 text-xs ml-2">▾</span>
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg min-w-[180px] py-1 overflow-hidden">
            {ACTIVE_QUIZ_THEMES.map((t) => {
              const selected = themes.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTheme(t.id)}
                  className={`w-full flex items-center gap-2 px-4 py-2 text-sm font-semibold text-left hover:bg-gray-50 ${selected ? "text-indigo-600" : "text-gray-700"}`}
                >
                  <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${selected ? "bg-indigo-600 border-indigo-600" : "border-gray-300"}`}>
                    {selected && <span className="text-white text-[10px] leading-none">✓</span>}
                  </span>
                  {t.emoji} {t.label}
                </button>
              );
            })}
            {themes.length > 0 && (
              <>
                <div className="border-t border-gray-100 my-1" />
                <button
                  type="button"
                  onClick={() => { push([], difficulty); setOpen(false); }}
                  className="w-full px-4 py-2 text-xs font-bold text-gray-400 hover:text-gray-600 text-left"
                >
                  Clear selection
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Difficulty dropdown */}
      <div className="relative w-40 flex-shrink-0">
        <select
          className="w-full border-[1.5px] border-gray-200 rounded-xl bg-white text-sm font-semibold text-gray-800 px-3 py-1.5 appearance-none cursor-pointer focus:outline-none focus:border-indigo-400"
          value={difficulty}
          onChange={(e) => push(themes, e.target.value)}
        >
          <option value="">All Difficulties</option>
          {QUIZ_DIFFICULTIES.map((d) => (
            <option key={d.id} value={d.id}>{d.stars} {d.label}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>
      </div>
    </div>
  );
}
