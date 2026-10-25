import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { storiesByCollection } from "@/lib/stories/registry";
import { storyCoverSrc, collectionCoverSrc } from "@/lib/stories/covers";

function existsOnDisk(src: string): boolean {
  // src looks like "/park-assets/games/covers/heidi.webp" — resolve against public/.
  const file = path.join(__dirname, "../../public", src);
  return fs.existsSync(file);
}

describe("storyCoverSrc", () => {
  it("resolves a cover that exists on disk for every story in the registry", () => {
    const groups = storiesByCollection();
    expect(groups.length).toBeGreaterThan(0);
    for (const { collection, stories } of groups) {
      for (const s of stories) {
        const src = storyCoverSrc(s);
        expect(src, `${collection} / ${s.id} should resolve a cover`).toBeTruthy();
        expect(existsOnDisk(src!), `${src} (for ${collection} / ${s.id}) should exist on disk`).toBe(true);
      }
    }
  });

  // One assertion per collection/book named explicitly, so a renamed id or moved cover
  // file fails loudly here instead of silently falling back to the emoji cover.
  const singleBookIds = [
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
  ];
  it.each(singleBookIds)("has a cover file for book id %s", (id) => {
    const src = storyCoverSrc({ id, collection: "" });
    expect(src).toBe(`/park-assets/games/covers/${id}.webp`);
    expect(existsOnDisk(src!)).toBe(true);
  });

  const anthologyCollections: [string, string][] = [
    ["Aesop's Fables", "aesop"],
    ["Chapter Books", "chapter-books"],
    ["Egyptian Myths", "egyptian-myths"],
    ["Greek Myths & Heroes", "greek-myths"],
    ["Just So Stories", "just-so"],
    ["Tales with a Twist", "tales-with-a-twist"],
  ];
  it.each(anthologyCollections)("has a shared cover file for collection %s", (collection, slug) => {
    const src = collectionCoverSrc(collection);
    expect(src).toBe(`/park-assets/games/covers/${slug}.webp`);
    expect(existsOnDisk(src!)).toBe(true);
  });

  it("falls back gracefully (undefined) for an unknown story", () => {
    expect(storyCoverSrc({ id: "not-a-real-book", collection: "Not a real collection" })).toBeUndefined();
    expect(collectionCoverSrc("Not a real collection")).toBeUndefined();
  });
});
