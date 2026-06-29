import type { Course } from "@/lib/courses/types";
import { HOW_TO_WIN_FRIENDS } from "@/lib/courses/content/how-to-win-friends";
import { SEVEN_HABITS } from "@/lib/courses/content/seven-habits";
import { BIG_LIFE_SKILLS } from "@/lib/courses/content/big-life-skills";

// Add a new book here: write a content file, then append it to this list.
export const COURSES: Course[] = [
  HOW_TO_WIN_FRIENDS,
  SEVEN_HABITS,
  BIG_LIFE_SKILLS,
];

export function getCourse(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
}

export type { Course } from "@/lib/courses/types";
