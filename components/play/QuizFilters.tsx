"use client";

import { useRouter, useSearchParams } from "next/navigation";

const THEMES = [
  { value: "", label: "All themes" },
  { value: "maths", label: "🧮 Maths" },
  { value: "english", label: "📖 English" },
  { value: "science", label: "🔬 Science" },
  { value: "history", label: "🏛️ History" },
  { value: "geography", label: "🌍 Geography" },
  { value: "sports", label: "⚽ Sports" },
  { value: "music", label: "🎵 Music" },
  { value: "fun_facts", label: "🎉 Fun Facts" },
  { value: "pop_culture", label: "🎬 Pop Culture" },
  { value: "technology", label: "💻 Technology" },
  { value: "food_culture", label: "🍜 Food & Culture" },
  { value: "french", label: "🇫🇷 French" },
  { value: "spanish", label: "🇪🇸 Spanish" },
  { value: "mandarin", label: "🇨🇳 Mandarin" },
];

const DIFFICULTIES = [
  { value: "", label: "Any difficulty" },
  { value: "easy", label: "⭐ Easy" },
  { value: "medium", label: "⭐⭐ Medium" },
  { value: "hard", label: "⭐⭐⭐ Hard" },
];

export default function QuizFilters({
  theme,
  difficulty,
  kidParam,
}: {
  theme: string;
  difficulty: string;
  kidParam: string;
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
    router.push(`/play/quiz?${params.toString()}`);
  };

  return (
    <div className="flex gap-2 mb-4">
      <select
        value={theme}
        onChange={(e) => update("theme", e.target.value)}
        className="flex-1 bg-white border border-gray-200 rounded-2xl px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm"
      >
        {THEMES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <select
        value={difficulty}
        onChange={(e) => update("diff", e.target.value)}
        className="flex-1 bg-white border border-gray-200 rounded-2xl px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm"
      >
        {DIFFICULTIES.map((d) => (
          <option key={d.value} value={d.value}>{d.label}</option>
        ))}
      </select>
    </div>
  );
}
