import { describe, expect, it } from "vitest";
import { extractJsonObject } from "./json";
import {
  validateClueRound,
  validateStoryEnd,
  validateStoryStart,
  validateStumpMove,
} from "./validate";

const clues = [
  "I wear a tuxedo all day",
  "I can't fly but I swim fast",
  "I live where it's icy",
  "I waddle on my feet",
  "I'm a black and white bird of Antarctica",
];

describe("validateStoryStart", () => {
  it("accepts a good start", () => {
    const s = validateStoryStart({
      title: "The Great Donut Heist",
      paragraphs: ["One.", "Two.", "Three."],
      question: "What should Max do?",
      choices: [
        { emoji: "🚀", text: "Fly away" },
        { emoji: "🍩", text: "Eat the donut" },
      ],
    });
    expect(s?.choices).toHaveLength(2);
    expect(s?.title).toBe("The Great Donut Heist");
  });
  it("accepts string choices and fills emoji", () => {
    const s = validateStoryStart({ title: "T", paragraphs: ["a", "b"], choices: ["Left", "Right"] });
    expect(s?.choices[0]).toEqual({ emoji: "👉", text: "Left" });
    expect(s?.question).toBe("What should happen next?");
  });
  it("rejects missing choices or paragraphs", () => {
    expect(validateStoryStart({ title: "T", paragraphs: ["a", "b"], choices: ["only one"] })).toBeNull();
    expect(validateStoryStart({ title: "T", paragraphs: ["a"], choices: ["x", "y"] })).toBeNull();
    expect(validateStoryStart(null)).toBeNull();
  });
});

describe("validateStoryEnd", () => {
  it("needs at least one paragraph", () => {
    expect(validateStoryEnd({ paragraphs: ["The end."], moral: "Be kind" })).toEqual({ paragraphs: ["The end."], moral: "Be kind" });
    expect(validateStoryEnd({ paragraphs: [] })).toBeNull();
  });
});

describe("validateClueRound", () => {
  it("accepts a good round", () => {
    const r = validateClueRound({ answer: "penguin", aliases: ["emperor penguin", "Penguin"], emoji: "🐧", clues, fun_fact: "They propose with pebbles!" });
    expect(r?.aliases).toEqual(["emperor penguin"]);
    expect(r?.clues).toHaveLength(5);
    expect(r?.funFact).toMatch(/pebbles/);
  });
  it("rejects clues that give the answer away", () => {
    expect(validateClueRound({ answer: "penguin", clues: [...clues.slice(0, 4), "I'm a penguin!"] })).toBeNull();
  });
  it("rejects too few clues", () => {
    expect(validateClueRound({ answer: "penguin", clues: clues.slice(0, 3) })).toBeNull();
  });
});

describe("validateStumpMove", () => {
  it("accepts questions and adds a question mark", () => {
    expect(validateStumpMove({ type: "question", text: "Does it live in water" }, false)).toEqual({
      type: "question",
      text: "Does it live in water?",
      reaction: "",
    });
  });
  it("cleans up guesses", () => {
    expect(validateStumpMove({ type: "guess", guess: "My final guess is: a penguin!" }, false)?.text).toBe("a penguin");
    expect(validateStumpMove({ type: "guess", content: "Is it a toaster?" }, false)?.text).toBe("a toaster");
  });
  it("enforces a guess when required", () => {
    expect(validateStumpMove({ type: "question", text: "Is it red?" }, true)).toBeNull();
  });
  it("rejects bad types and prose", () => {
    expect(validateStumpMove({ type: "chat", text: "hi" }, false)).toBeNull();
    expect(validateStumpMove(extractJsonObject("I think it's a cat"), false)).toBeNull();
  });
});
