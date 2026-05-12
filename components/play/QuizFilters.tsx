"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ACTIVE_QUIZ_THEMES } from "@/lib/registry/quiz-theme-registry";
import { QUIZ_DIFFICULTIES } from "@/lib/registry/quiz-difficulty-registry";

export default function QuizFilters({
  theme,
  difficulty,
  kidParam,
  basePath = "/play/quiz",
}: {
  theme: string;
  difficulty: string;
  kidParam: string;
  basePath?: string;
}) {
  const router = useRouter();

  const update = (key: string, value: string) => {
    const params = new URLSearchParams();
    if (kidParam) params.set("kid", kidParam);
    if (key === "theme") {
      if (value) params.set("theme", value);
      if (difficulty) params.set("diff", difficulty);
    } else {
      if (theme) params.set("theme", theme);
      if (value) params.set("diff", value);
    }
    const qs = params.toString();
    router.push(`${basePath}${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="flex gap-2 mb-4">
      <select
        value={theme}
        onChange={(e) => update("theme", e.target.value)}
        className="flex-1 bg-white border border-gray-200 rounded-2xl px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm"
      >
        <option value="">All themes</option>
        {ACTIVE_QUIZ_THEMES.map((t) => (
          <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>
        ))}
      </select>
      <select
        value={difficulty}
        onChange={(e) => update("diff", e.target.value)}
        className="flex-1 bg-white border border-gray-200 rounded-2xl px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm"
      >
        <option value="">Any difficulty</option>
        {QUIZ_DIFFICULTIES.map((d) => (
          <option key={d.id} value={d.id}>{d.stars} {d.label}</option>
        ))}
      </select>
    </div>
  );
}
