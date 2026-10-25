import type { LibraryStory } from "@/lib/stories/types";

// Maps a library story to its painted cover image (public/park-assets/games/covers/*.webp),
// or returns undefined so the caller falls back to the emoji/gradient cover it already shows.
// Pure and side-effect free — see covers.test.ts for the disk-existence check.

const COVERS_BASE = "/park-assets/games/covers";

// Anthology shelves where one painted cover stands in for every short story inside it,
// keyed by LibraryStory.collection and valued by the cover file's base name.
const COLLECTION_COVER_SLUG: Record<string, string> = {
  "Aesop's Fables": "aesop",
  "Chapter Books": "chapter-books",
  "Egyptian Myths": "egyptian-myths",
  "Greek Myths & Heroes": "greek-myths",
  "Just So Stories": "just-so",
  "Tales with a Twist": "tales-with-a-twist",
};

// Single-book stories that each get their own painted cover. The story id doubles as the
// content file's base name (e.g. lib/stories/content/heidi.ts -> id "heidi" -> heidi.webp),
// which is also the cover file's base name.
const BOOK_COVER_IDS = new Set<string>([
  "wizard-of-oz",
  "peter-and-wendy",
  "alices-adventures-in-wonderland",
  "through-the-looking-glass",
  "the-princess-and-the-goblin",
  "at-the-back-of-the-north-wind",
  "the-water-babies",
  "pinocchio-the-tale-of-a-puppet",
  "kidnapped",
  "robinson-crusoe",
  "the-swiss-family-robinson",
  "around-the-world-in-eighty-days",
  "twenty-thousand-leagues-under-the-sea",
  "the-adventures-of-tom-sawyer",
  "adventures-of-huckleberry-finn",
  "kim",
  "little-women",
  "little-men",
  "eight-cousins",
  "anne-of-green-gables",
  "the-secret-garden",
  "heidi",
  "understood-betsy",
  "five-children-and-it",
  "the-phoenix-and-the-carpet",
  "the-story-of-the-treasure-seekers",
  "the-railway-children",
]);

/** Cover image path for a story's shelf card / reading-screen header, or undefined to fall back. */
export function storyCoverSrc(story: Pick<LibraryStory, "id" | "collection">): string | undefined {
  if (BOOK_COVER_IDS.has(story.id)) return `${COVERS_BASE}/${story.id}.webp`;
  const slug = COLLECTION_COVER_SLUG[story.collection];
  return slug ? `${COVERS_BASE}/${slug}.webp` : undefined;
}

/** Cover for a whole shelf header — only set where one painted cover serves the whole collection. */
export function collectionCoverSrc(collection: string): string | undefined {
  const slug = COLLECTION_COVER_SLUG[collection];
  return slug ? `${COVERS_BASE}/${slug}.webp` : undefined;
}
