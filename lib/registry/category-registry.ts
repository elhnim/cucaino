/**
 * Task category registry — adding a new category is one entry here.
 *
 * UI components (TaskCard, ActivityCard, badges, filters) read display
 * info from this registry. No more hard-coded category-specific styling
 * scattered across components.
 */

import type { TaskCategory } from "@/lib/domain/types";

export interface CategoryDisplay {
  id: TaskCategory;
  label: string;
  defaultIcon: string;
  /** Tailwind classes for the category pill/badge */
  badgeClass: string;
  /** Tailwind border colour for cards of this category */
  borderClass: string;
  /** Whether tasks in this category render as info-only by default (no checkbox) */
  isInfoByDefault: boolean;
}

export const CATEGORIES: Record<TaskCategory, CategoryDisplay> = {
  chore: {
    id: "chore",
    label: "Chore",
    defaultIcon: "🧹",
    badgeClass: "bg-gray-100 text-gray-700",
    borderClass: "border-gray-200",
    isInfoByDefault: false,
  },
  exercise: {
    id: "exercise",
    label: "Exercise",
    defaultIcon: "🏃",
    badgeClass: "bg-green-100 text-green-700",
    borderClass: "border-green-200",
    isInfoByDefault: false,
  },
  music: {
    id: "music",
    label: "Music",
    defaultIcon: "🎹",
    badgeClass: "bg-amber-100 text-amber-700",
    borderClass: "border-amber-300",
    isInfoByDefault: false,
  },
  activity: {
    id: "activity",
    label: "Activity",
    defaultIcon: "🎒",
    badgeClass: "bg-blue-100 text-blue-700",
    borderClass: "border-blue-300",
    isInfoByDefault: false,
  },
  personal: {
    id: "personal",
    label: "Personal goal",
    defaultIcon: "⭐",
    badgeClass: "bg-purple-100 text-purple-700",
    borderClass: "border-purple-200",
    isInfoByDefault: false,
  },
};

export function getCategory(id: TaskCategory): CategoryDisplay {
  return CATEGORIES[id];
}
