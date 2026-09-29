import { describe, expect, it } from "vitest";
import {
  CLUE_COUNT,
  STUMP_MAX_GUESSES,
  STUMP_MAX_QUESTIONS,
  clueRank,
  cluePoints,
  coerceStatement,
  maxLetterHints,
  pickRevealIndex,
  revealPattern,
  stumpProgress,
  wyrVerdict,
  type StumpTurn,
} from "./rules";

describe("cluePoints", () => {
  it("rewards solving early", () => {
    expect(cluePoints(1)).toBe(5);
    expect(cluePoints(3)).toBe(3);
    expect(cluePoints(CLUE_COUNT)).toBe(1);
  });
  it("charges for hints but never goes below 1", () => {
    expect(cluePoints(1, 2)).toBe(3);
    expect(cluePoints(5, 3)).toBe(1);
    expect(cluePoints(99)).toBe(1);
    expect(cluePoints(0)).toBe(5);
  });
  it("ranks", () => {
    expect(clueRank(5).title).toBe("Genius Detective");
    expect(clueRank(1).title).toBe("Got There!");
  });
});

describe("letter reveal", () => {
  it("shows blanks and revealed letters, keeps spaces", () => {
    expect(revealPattern("ice cream", new Set([0, 4]))).toEqual(["I", "_", "_", " ", "C", "_", "_", "_", "_"]);
  });
  it("picks a hidden letter and keeps one hidden", () => {
    expect(pickRevealIndex("cat", new Set([0]), () => 0)).toBe(1);
    expect(pickRevealIndex("cat", new Set([0]), () => 0.999)).toBe(2);
    expect(pickRevealIndex("cat", new Set([0, 1]))).toBe(-1);
  });
  it("allows about a third of the letters", () => {
    expect(maxLetterHints("volcano")).toBe(2);
    expect(maxLetterHints("cat")).toBe(1);
    expect(maxLetterHints("telescope")).toBe(3);
  });
});

describe("wyrVerdict", () => {
  it("scales with how often the kid held firm", () => {
    expect(wyrVerdict(5, 5).title).toBe("Unshakeable!");
    expect(wyrVerdict(0, 5).title).toBe("Mind Changer");
    expect(wyrVerdict(2, 5).title).toBe("Open Mind");
    expect(wyrVerdict(0, 0).title).toBe("Ready?");
  });
});

describe("stumpProgress", () => {
  const q = (answer: StumpTurn["answer"] = "No"): StumpTurn => ({ kind: "question", text: "Is it big?", answer });
  const g = (text: string, answer: StumpTurn["answer"] = "No"): StumpTurn => ({ kind: "guess", text, answer });

  it("starts fresh", () => {
    const p = stumpProgress([]);
    expect(p.left).toBe(STUMP_MAX_QUESTIONS);
    expect(p.guessesLeft).toBe(STUMP_MAX_GUESSES);
    expect(p.mustGuess).toBe(false);
    expect(p.kidWon).toBe(false);
  });
  it("forces a guess on the last turn", () => {
    const turns = Array.from({ length: STUMP_MAX_QUESTIONS - 1 }, () => q());
    expect(stumpProgress(turns).mustGuess).toBe(true);
    expect(stumpProgress(turns).kidWon).toBe(false);
  });
  it("kid wins when the AI runs out of turns", () => {
    const turns = Array.from({ length: STUMP_MAX_QUESTIONS }, () => q());
    expect(stumpProgress(turns).kidWon).toBe(true);
  });
  it("kid wins after 3 wrong guesses", () => {
    const p = stumpProgress([q(), g("cat"), g("dog"), g("owl")]);
    expect(p.wrongGuesses).toEqual(["cat", "dog", "owl"]);
    expect(p.guessesLeft).toBe(0);
    expect(p.kidWon).toBe(true);
  });
});

describe("coerceStatement", () => {
  it("accepts numbers and messy strings", () => {
    expect(coerceStatement(2)).toBe(2);
    expect(coerceStatement("3")).toBe(3);
    expect(coerceStatement("Statement 1")).toBe(1);
  });
  it("rejects anything else", () => {
    expect(coerceStatement(4)).toBeNull();
    expect(coerceStatement("four")).toBeNull();
    expect(coerceStatement(null)).toBeNull();
  });
});
