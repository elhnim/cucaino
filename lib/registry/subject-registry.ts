/**
 * Subject registry — adding a new school subject is one entry here.
 *
 * UI components (timetable cards, week chips, today section) read display
 * info from this registry rather than hardcoding emojis or colours.
 */

import type { Subject } from "@/lib/domain/types";

export interface SubjectDisplay {
  id: Subject;
  label: string;
  icon: string;
  /** Tailwind background class for chips/cards */
  bgClass: string;
  /** Tailwind text class for chips */
  textClass: string;
  /** Tailwind border class */
  borderClass: string;
}

export const SUBJECTS: Record<Subject, SubjectDisplay> = {
  math: {
    id: "math",
    label: "Maths",
    icon: "🧮",
    bgClass: "bg-blue-100",
    textClass: "text-blue-800",
    borderClass: "border-blue-300",
  },
  english: {
    id: "english",
    label: "English",
    icon: "📚",
    bgClass: "bg-rose-100",
    textClass: "text-rose-800",
    borderClass: "border-rose-300",
  },
  science: {
    id: "science",
    label: "Science",
    icon: "🔬",
    bgClass: "bg-green-100",
    textClass: "text-green-800",
    borderClass: "border-green-300",
  },
  history: {
    id: "history",
    label: "History",
    icon: "🏛️",
    bgClass: "bg-amber-100",
    textClass: "text-amber-800",
    borderClass: "border-amber-300",
  },
  geography: {
    id: "geography",
    label: "Geography",
    icon: "🌍",
    bgClass: "bg-emerald-100",
    textClass: "text-emerald-800",
    borderClass: "border-emerald-300",
  },
  art: {
    id: "art",
    label: "Art",
    icon: "🎨",
    bgClass: "bg-pink-100",
    textClass: "text-pink-800",
    borderClass: "border-pink-300",
  },
  pe: {
    id: "pe",
    label: "PE / Sport",
    icon: "⚽",
    bgClass: "bg-orange-100",
    textClass: "text-orange-800",
    borderClass: "border-orange-300",
  },
  music: {
    id: "music",
    label: "Music",
    icon: "🎵",
    bgClass: "bg-purple-100",
    textClass: "text-purple-800",
    borderClass: "border-purple-300",
  },
  library: {
    id: "library",
    label: "Library",
    icon: "📖",
    bgClass: "bg-yellow-100",
    textClass: "text-yellow-800",
    borderClass: "border-yellow-300",
  },
  computing: {
    id: "computing",
    label: "Computing",
    icon: "💻",
    bgClass: "bg-cyan-100",
    textClass: "text-cyan-800",
    borderClass: "border-cyan-300",
  },
  language: {
    id: "language",
    label: "Language",
    icon: "🗣️",
    bgClass: "bg-violet-100",
    textClass: "text-violet-800",
    borderClass: "border-violet-300",
  },
  religion: {
    id: "religion",
    label: "RE",
    icon: "🕊️",
    bgClass: "bg-sky-100",
    textClass: "text-sky-800",
    borderClass: "border-sky-300",
  },
  lunch: {
    id: "lunch",
    label: "Lunch",
    icon: "🍱",
    bgClass: "bg-lime-100",
    textClass: "text-lime-800",
    borderClass: "border-lime-300",
  },
  recess: {
    id: "recess",
    label: "Recess",
    icon: "🏃",
    bgClass: "bg-teal-100",
    textClass: "text-teal-800",
    borderClass: "border-teal-300",
  },
  other: {
    id: "other",
    label: "Other",
    icon: "✨",
    bgClass: "bg-gray-100",
    textClass: "text-gray-800",
    borderClass: "border-gray-300",
  },
};

export function getSubject(id: Subject): SubjectDisplay {
  return SUBJECTS[id];
}

export function listSubjects(): SubjectDisplay[] {
  return Object.values(SUBJECTS);
}
