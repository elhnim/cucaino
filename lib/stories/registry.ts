import type { LibraryStory } from "@/lib/stories/types";
import { AESOP_STORIES } from "@/lib/stories/content/aesop";
import { JUST_SO_STORIES } from "@/lib/stories/content/just-so";
import { TALES_WITH_A_TWIST } from "@/lib/stories/content/tales-with-a-twist";

// Add more stories here (a content file + this list).
export const STORIES: LibraryStory[] = [
  ...AESOP_STORIES,
  ...JUST_SO_STORIES,
  ...TALES_WITH_A_TWIST,
];

export function getStory(id: string): LibraryStory | undefined {
  return STORIES.find((s) => s.id === id);
}

/** Stories grouped by collection, preserving registry order. */
export function storiesByCollection(): { collection: string; stories: LibraryStory[] }[] {
  const groups: { collection: string; stories: LibraryStory[] }[] = [];
  for (const s of STORIES) {
    let g = groups.find((x) => x.collection === s.collection);
    if (!g) {
      g = { collection: s.collection, stories: [] };
      groups.push(g);
    }
    g.stories.push(s);
  }
  return groups;
}
