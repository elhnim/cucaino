import { describe, expect, it } from "vitest";
import { doodlePrompt, stumpPrompt } from "./prompts";

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

describe("doodlePrompt", () => {
  it("never needs the target word and carries earlier guesses", () => {
    const p = doodlePrompt({ previous: ["potato", 'rock"'], final: true, look: 3 });
    expect(p).toContain("look number 3");
    expect(p).toContain("potato, rock");
    expect(p).toContain("final look");
  });
});
