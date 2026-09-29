import { describe, expect, it } from "vitest";
import {
  DOODLE_DIFFICULTIES,
  DOODLE_SECONDS,
  DOODLE_WORDS,
  DOODLE_WORDS_PER_ROUND,
  coerceDifficulty,
  doodleCropBox,
  doodleGuessMatches,
  doodlePoints,
  doodleRank,
  findDoodleMatch,
  findDoodleWord,
  hasInk,
  isPngBase64,
  pickDoodleRound,
  validateDoodleLook,
} from "./doodle";
import { normalizeGuess } from "./match";

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("doodle word list", () => {
  it("has plenty of unique, kid-drawable words per level", () => {
    const all = new Set<string>();
    for (const d of DOODLE_DIFFICULTIES) {
      expect(DOODLE_WORDS[d].length).toBeGreaterThanOrEqual(20);
      for (const w of DOODLE_WORDS[d]) {
        const k = normalizeGuess(w.word);
        expect(all.has(k), `duplicate ${w.word}`).toBe(false);
        all.add(k);
        expect(w.emoji.length).toBeGreaterThan(0);
      }
    }
  });
  it("aliases never collide with another word (would score the wrong drawing)", () => {
    for (const d of DOODLE_DIFFICULTIES) {
      for (const w of DOODLE_WORDS[d]) {
        for (const other of DOODLE_DIFFICULTIES.flatMap((x) => DOODLE_WORDS[x])) {
          if (other === w) continue;
          expect(doodleGuessMatches(other.word, w), `${other.word} would win for ${w.word}`).toBe(false);
        }
      }
    }
  });
  it("mixes several categories per level", () => {
    for (const d of DOODLE_DIFFICULTIES) expect(new Set(DOODLE_WORDS[d].map((w) => w.category)).size).toBeGreaterThanOrEqual(4);
  });
  it("finds curated words only", () => {
    expect(findDoodleWord("Ice Cream")?.word).toBe("ice cream");
    expect(findDoodleWord("password123")).toBeNull();
    expect(coerceDifficulty("hard")).toBe("hard");
    expect(coerceDifficulty("nightmare")).toBe("easy");
  });
});

describe("pickDoodleRound", () => {
  it("deals 5 distinct words, no category twice in a row when possible", () => {
    for (let seed = 1; seed < 30; seed++) {
      const r = pickDoodleRound("easy", [], seeded(seed));
      expect(r).toHaveLength(DOODLE_WORDS_PER_ROUND);
      expect(new Set(r.map((w) => w.word)).size).toBe(DOODLE_WORDS_PER_ROUND);
      for (let i = 1; i < r.length; i++) expect(r[i].category).not.toBe(r[i - 1].category);
    }
  });
  it("avoids recently drawn words", () => {
    const avoid = DOODLE_WORDS.medium.slice(0, 20).map((w) => w.word);
    const r = pickDoodleRound("medium", avoid, seeded(7));
    for (const w of r) expect(avoid).not.toContain(w.word);
  });
  it("falls back to the whole list when everything is recent", () => {
    const avoid = DOODLE_WORDS.hard.map((w) => w.word);
    expect(pickDoodleRound("hard", avoid, seeded(3))).toHaveLength(DOODLE_WORDS_PER_ROUND);
  });
});

describe("doodle matching", () => {
  const cat = findDoodleWord("cat")!;
  const house = findDoodleWord("house")!;
  const iceCream = findDoodleWord("ice cream")!;
  const jumping = findDoodleWord("jumping")!;
  it("accepts the word, plurals, aliases and filler words", () => {
    expect(doodleGuessMatches("cat", cat)).toBe(true);
    expect(doodleGuessMatches("Cats", cat)).toBe(true);
    expect(doodleGuessMatches("a cute little kitten", cat)).toBe(true);
    expect(doodleGuessMatches("cat drawing", cat)).toBe(true);
    expect(doodleGuessMatches("icecream", iceCream)).toBe(true);
    expect(doodleGuessMatches("ice-cream cone", iceCream)).toBe(true);
    expect(doodleGuessMatches("person jumping", jumping)).toBe(true);
    expect(doodleGuessMatches("stick figure jumping", jumping)).toBe(true);
  });
  it("is strict — no typo tolerance and no partial words", () => {
    expect(doodleGuessMatches("horse", house)).toBe(false);
    expect(doodleGuessMatches("car", cat)).toBe(false);
    expect(doodleGuessMatches("catfish", cat)).toBe(false);
    expect(doodleGuessMatches("hot dog", cat)).toBe(false);
    expect(doodleGuessMatches("", cat)).toBe(false);
  });
  it("reports which guess matched", () => {
    expect(findDoodleMatch(["potato", "rock", "turtle"], findDoodleWord("turtle")!)).toBe(2);
    expect(findDoodleMatch(["potato", "rock"], findDoodleWord("turtle")!)).toBe(-1);
    expect(findDoodleMatch(["tortoise"], findDoodleWord("turtle")!)).toBe(0);
  });
});

describe("validateDoodleLook", () => {
  it("cleans, lowercases and dedupes guesses", () => {
    expect(validateDoodleLook({ guesses: ["A Turtle", "turtle", "the Rock.", "  "], line: "Is it… a TURTLE?" })).toEqual({
      guesses: ["turtle", "rock"],
      line: "Is it… a TURTLE?",
    });
  });
  it("tolerates object guesses and a missing line", () => {
    const v = validateDoodleLook({ guesses: [{ name: "cat" }, { guess: "dog" }] });
    expect(v?.guesses).toEqual(["cat", "dog"]);
    expect(v?.line).toBeTruthy();
  });
  it("rejects replies with no usable guess", () => {
    expect(validateDoodleLook({ guesses: [] })).toBeNull();
    expect(validateDoodleLook({ guesses: ["a very long description of a round shape with lines"] })).toBeNull();
    expect(validateDoodleLook(null)).toBeNull();
  });
});

describe("scoring", () => {
  it("rewards speed and streaks", () => {
    expect(doodlePoints(DOODLE_SECONDS, 0)).toBe(150);
    expect(doodlePoints(0, 0)).toBe(50);
    expect(doodlePoints(30, 0)).toBe(100);
    expect(doodlePoints(30, 2)).toBe(150);
    expect(doodlePoints(30, 99)).toBe(200);
    expect(doodlePoints(-5, -1)).toBe(50);
  });
  it("ranks", () => {
    expect(doodleRank(800, 5).title).toBe("Legendary Artist");
    expect(doodleRank(0, 0).title).toBe("Mystery Painter");
  });
});

describe("image checks + crop", () => {
  it("accepts only reasonable PNG base64", () => {
    expect(isPngBase64("iVBORw0KGgo" + "A".repeat(200))).toBe(true);
    expect(isPngBase64("/9j/" + "A".repeat(200))).toBe(false); // jpeg
    expect(isPngBase64("iVBORw0KGgo" + "A".repeat(500_000))).toBe(false); // too big
    expect(isPngBase64("iVBORw0KGgo<script>" + "A".repeat(200))).toBe(false);
    expect(isPngBase64(42)).toBe(false);
  });
  it("crops to the drawing with padding, clamped to the canvas", () => {
    const box = doodleCropBox([{ color: "#000", width: 0, pts: [[0.1, 0.1], [0.3, 0.3]] }]);
    expect(box.size).toBeCloseTo(0.3);
    expect(box.x).toBeCloseTo(0.05);
    const edge = doodleCropBox([{ color: "#000", width: 0.02, pts: [[0, 0], [1, 1]] }]);
    expect(edge).toEqual({ x: 0, y: 0, size: 1 });
    expect(doodleCropBox([])).toEqual({ x: 0, y: 0, size: 1 });
  });
  it("ignores eraser strokes for ink and crop", () => {
    const rub = { color: "#fff", width: 0.05, pts: [[0.9, 0.9]] as [number, number][], eraser: true };
    expect(hasInk([rub])).toBe(false);
    expect(doodleCropBox([rub])).toEqual({ x: 0, y: 0, size: 1 });
  });
});
