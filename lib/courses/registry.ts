import type { Course } from "@/lib/courses/types";
import { HOW_TO_WIN_FRIENDS } from "@/lib/courses/content/how-to-win-friends";

// Add a new book here: write a content file, then append it to this list.
export const COURSES: Course[] = [
  HOW_TO_WIN_FRIENDS,
];

export function getCourse(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
}

export type { Course } from "@/lib/courses/types";
