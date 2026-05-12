export interface QuizTheme {
  id: string;
  label: string;
  emoji: string;
}

export const QUIZ_THEMES: QuizTheme[] = [
  { id: "maths",        label: "Maths",          emoji: "🧮" },
  { id: "english",      label: "English",         emoji: "📖" },
  { id: "science",      label: "Science",         emoji: "🔬" },
  { id: "history",      label: "History",         emoji: "🏛️" },
  { id: "geography",    label: "Geography",       emoji: "🌍" },
  { id: "sports",       label: "Sports",          emoji: "⚽" },
  { id: "music",        label: "Music",           emoji: "🎵" },
  { id: "fun_facts",    label: "Fun Facts",       emoji: "🎉" },
  { id: "pop_culture",  label: "Pop Culture",     emoji: "🎬" },
  { id: "technology",   label: "Technology",      emoji: "💻" },
  { id: "food_culture", label: "Food & Culture",  emoji: "🍜" },
  { id: "french",       label: "French",          emoji: "🇫🇷" },
  { id: "spanish",      label: "Spanish",         emoji: "🇪🇸" },
  { id: "mandarin",     label: "Mandarin",        emoji: "🇨🇳" },
  // Legacy / fallback
  { id: "spelling",     label: "Spelling",        emoji: "📝" },
  { id: "silly",        label: "Silly Trivia",    emoji: "🎊" },
  { id: "custom",       label: "Custom",          emoji: "🎯" },
];

/** Lookup by id — returns a fallback if not found */
export function getQuizTheme(id: string): QuizTheme {
  return QUIZ_THEMES.find((t) => t.id === id) ?? { id, label: id, emoji: "🎯" };
}

/** Themes shown in filters and pickers (excludes legacy entries) */
export const ACTIVE_QUIZ_THEMES = QUIZ_THEMES.filter(
  (t) => !["spelling", "silly", "custom"].includes(t.id),
);
