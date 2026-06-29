import type { LibraryStory } from "@/lib/stories/types";
import { AESOP_STORIES } from "@/lib/stories/content/aesop";

// Add more public-domain stories here (a content file + this list).
export const STORIES: LibraryStory[] = [...AESOP_STORIES];

export function getStory(id: string): LibraryStory | undefined {
  return STORIES.find((s) => s.id === id);
}
