import type { TaskCategory } from "@/lib/domain/types";

export interface CategoryDisplay {
  id: TaskCategory;
  /** Plain text label, no emoji */
  label: string;
  /** Category-level emoji (used in pills, buttons, filter chips) */
  emoji: string;
  /** Default icon for new tasks in this category */
  defaultIcon: string;
  /** Hex background for inline-style icon tiles */
  bg: string;
  /** Hex text colour for inline-style icon tiles */
  color: string;
  /** Tailwind classes for category badge pills */
  badgeClass: string;
  /** Tailwind border colour for task cards */
  borderClass: string;
  /** Info-only by default — no completion checkbox */
  isInfoByDefault: boolean;
  /** Managed by kids (timetable) — hidden from parent add/edit/filter */
  kidManaged: boolean;
}

export const CATEGORIES: Record<TaskCategory, CategoryDisplay> = {
  chore: {
    id: "chore",
    label: "Chore",
    emoji: "🧹",
    defaultIcon: "🧹",
    bg: "#f3f4f6",
    color: "#374151",
    badgeClass: "bg-gray-100 text-gray-700",
    borderClass: "border-gray-200",
    isInfoByDefault: false,
    kidManaged: false,
  },
  exercise: {
    id: "exercise",
    label: "Exercise",
    emoji: "🏃",
    defaultIcon: "🏃",
    bg: "#dcfce7",
    color: "#15803d",
    badgeClass: "bg-green-100 text-green-700",
    borderClass: "border-green-200",
    isInfoByDefault: false,
    kidManaged: false,
  },
  music: {
    id: "music",
    label: "Music",
    emoji: "🎹",
    defaultIcon: "🎹",
    bg: "#fef3c7",
    color: "#92400e",
    badgeClass: "bg-amber-100 text-amber-700",
    borderClass: "border-amber-300",
    isInfoByDefault: false,
    kidManaged: false,
  },
  activity: {
    id: "activity",
    label: "Activity",
    emoji: "🎒",
    defaultIcon: "🎒",
    bg: "#dbeafe",
    color: "#1d4ed8",
    badgeClass: "bg-blue-100 text-blue-700",
    borderClass: "border-blue-300",
    isInfoByDefault: false,
    kidManaged: false,
  },
  personal: {
    id: "personal",
    label: "Habit",
    emoji: "🌱",
    defaultIcon: "🌱",
    bg: "#ede9fe",
    color: "#5b21b6",
    badgeClass: "bg-purple-100 text-purple-700",
    borderClass: "border-purple-200",
    isInfoByDefault: false,
    kidManaged: false,
  },
  school_subject: {
    id: "school_subject",
    label: "School Subject",
    emoji: "📚",
    defaultIcon: "📚",
    bg: "#e0e7ff",
    color: "#3730a3",
    badgeClass: "bg-indigo-100 text-indigo-700",
    borderClass: "border-indigo-200",
    isInfoByDefault: true,
    kidManaged: true,
  },
};

/** All categories visible to parents (excludes kid-managed ones) */
export const PARENT_CATEGORIES = Object.values(CATEGORIES).filter(
  (c) => !c.kidManaged,
);

export function getCategory(id: TaskCategory): CategoryDisplay {
  return CATEGORIES[id];
}
