import { describe, expect, it } from "vitest";
import { leaksAnswer, levenshtein, matchGuess, normalizeGuess, wordForms } from "./match";

describe("normalizeGuess", () => {
  it("lowercases, strips punctuation, accents and lead-ins", () => {
    expect(normalizeGuess("A Penguin!")).toBe("penguin");
    expect(normalizeGuess("I think it's a crêpe")).toBe("crepe");
    expect(normalizeGuess("  the   Eiffel-Tower ")).toBe("eiffel tower");
  });
});

describe("wordForms", () => {
  it("covers common plurals", () => {
    expect(wordForms("cookies")).toContain("cookie");
    expect(wordForms("berries")).toContain("berry");
    expect(wordForms("boxes")).toContain("box");
    expect(wordForms("buses")).toContain("bus");
    expect(wordForms("glass")).toEqual(["glass"]);
  });
});

describe("levenshtein", () => {
  it("counts edits", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("same", "same")).toBe(0);
  });
});

describe("matchGuess", () => {
  it("accepts exact, articles and case", () => {
    expect(matchGuess("Penguin", "penguin")).toBe("correct");
    expect(matchGuess("a penguin", "Penguin")).toBe("correct");
  });
  it("accepts plurals both ways", () => {
    expect(matchGuess("penguins", "penguin")).toBe("correct");
    expect(matchGuess("cookie", "cookies")).toBe("correct");
    expect(matchGuess("cookies", "cookie")).toBe("correct");
  });
  it("accepts small typos on longer words", () => {
    expect(matchGuess("girafe", "giraffe")).toBe("correct");
    expect(matchGuess("telescop", "telescope")).toBe("correct");
    expect(matchGuess("helecopter", "helicopter")).toBe("correct");
  });
  it("does not forgive typos on short words", () => {
    expect(matchGuess("cat", "car")).toBe("wrong");
    expect(matchGuess("bat", "cat")).toBe("wrong");
  });
  it("ignores spaces in compound words", () => {
    expect(matchGuess("icecream", "ice cream")).toBe("correct");
  });
  it("accepts aliases", () => {
    expect(matchGuess("sea turtle", "turtle", ["sea turtle"])).toBe("correct");
    expect(matchGuess("choo choo train", "steam train", ["train", "choo choo train"])).toBe("correct");
  });
  it("flags near misses as close", () => {
    expect(matchGuess("penguin", "emperor penguin")).toBe("close");
    expect(matchGuess("grafe", "giraffe")).toBe("close");
  });
  it("rejects wrong and empty guesses", () => {
    expect(matchGuess("dog", "penguin")).toBe("wrong");
    expect(matchGuess("   ", "penguin")).toBe("wrong");
    expect(matchGuess("!!!", "penguin")).toBe("wrong");
  });
});

describe("leaksAnswer", () => {
  it("spots the answer in a clue", () => {
    expect(leaksAnswer("I am a penguin who loves ice", "penguin")).toBe(true);
    expect(leaksAnswer("Penguins like me waddle", "penguin")).toBe(true);
    expect(leaksAnswer("Scoop me into a cone of ice cream!", "ice cream")).toBe(true);
    expect(leaksAnswer("I zoom through the sky", "rocket", ["space rocket"])).toBe(false);
  });
  it("does not flag partial words", () => {
    expect(leaksAnswer("I love catching fish", "cat")).toBe(false);
  });
});
