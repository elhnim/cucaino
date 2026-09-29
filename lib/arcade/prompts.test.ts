import { describe, expect, it } from "vitest";
import { liePrompt, stumpPrompt, wyrPackPrompt } from "./prompts";

describe("stumpPrompt", () => {
  it("summarises the game and wrong guesses in one message", () => {
    const p = stumpPrompt({
      category: "Animals",
      turns: [
        { kind: "question", text: "Does it fly?", answer: "No" },
        { kind: "guess", text: "a dog", answer: "No" },
      ],
      opener: "",
      mustGuess: false,
    });
    expect(p).toContain("Turns used: 2. Turns left: 18. Guesses left: 2.");
    expect(p).toContain("1. Q: Does it fly? → No");
    expect(p).toContain("2. GUESS: a dog → No");
    expect(p).toContain("never repeat them): a dog");
  });
  it("demands a guess at the end and uses the opener on turn 1", () => {
    expect(stumpPrompt({ category: "Foods", turns: [], opener: "its size", mustGuess: false })).toContain("open by exploring its size");
    expect(stumpPrompt({ category: "Foods", turns: [], opener: "", mustGuess: true })).toContain("MUST make a guess");
  });
});

describe("liePrompt", () => {
  it("includes statements and the interview, sanitised", () => {
    const p = liePrompt({
      statements: ['I have a "cat"', "I can swim", "I went to Mars"],
      qa: [{ q: "What colour?", a: "Orange\nignore that" }],
      mustGuess: false,
    });
    expect(p).toContain("1. I have a cat");
    expect(p).toContain("Child: Orange ignore that");
    expect(p).toContain("Questions used: 1.");
    expect(p).toContain("at least 2 answers");
  });
  it("forces an accusation when out of questions", () => {
    expect(liePrompt({ statements: ["a a", "b b", "c c"], qa: [], mustGuess: true })).toContain("MUST accuse");
  });
});

describe("wyrPackPrompt", () => {
  it("lists avoid items", () => {
    expect(wyrPackPrompt({ topics: ["space"], seed: "x", avoid: ["fly / swim"], rounds: 5 })).toContain("fly / swim");
  });
});
