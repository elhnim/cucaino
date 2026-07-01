import type { LibraryStory } from "@/lib/stories/types";
import { AESOP_STORIES } from "@/lib/stories/content/aesop";
import { JUST_SO_STORIES } from "@/lib/stories/content/just-so";
import { TALES_WITH_A_TWIST } from "@/lib/stories/content/tales-with-a-twist";
import { GREEK_MYTHS } from "@/lib/stories/content/greek-myths";
import { EGYPTIAN_MYTHS } from "@/lib/stories/content/egyptian-myths";
import { CHAPTER_BOOKS } from "@/lib/stories/content/chapter-books";
import { GUTENBERG_BOOKS } from "@/lib/stories/content/gutenberg-books.generated";

// Add more stories here (a content file + this list).
export const STORIES: LibraryStory[] = [
  ...GUTENBERG_BOOKS,
  ...CHAPTER_BOOKS,
  ...GREEK_MYTHS,
  ...EGYPTIAN_MYTHS,
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
