import { describe, expect, it } from "vitest";
import { cleanEmoji, cleanStr, cleanStrArray, extractJsonObject, sanitizeKidText } from "./json";

describe("extractJsonObject", () => {
  it("parses plain JSON", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips code fences", () => {
    expect(extractJsonObject('```json\n{"a":"x"}\n```')).toEqual({ a: "x" });
  });
  it("finds the object inside chatter", () => {
    expect(extractJsonObject('Sure! Here you go: {"type":"question","text":"Is it big?"} Hope that helps')).toEqual({
      type: "question",
      text: "Is it big?",
    });
  });
  it("handles braces inside strings", () => {
    expect(extractJsonObject('{"text":"a } tricky { one","n":2}')).toEqual({ text: "a } tricky { one", n: 2 });
  });
  it("handles escaped quotes", () => {
    expect(extractJsonObject('{"t":"he said \\"hi\\" }"}')).toEqual({ t: 'he said "hi" }' });
  });
  it("skips a broken object and uses the next one", () => {
    expect(extractJsonObject('{not json} {"ok":true}')).toEqual({ ok: true });
  });
  it("returns null for truncated output", () => {
    expect(extractJsonObject('{"title":"A story","paragraphs":["one","tw')).toBeNull();
  });
  it("returns null for arrays, empty and missing", () => {
    expect(extractJsonObject("[1,2]")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
    expect(extractJsonObject(null)).toBeNull();
    expect(extractJsonObject("no json here")).toBeNull();
  });
});

describe("clean helpers", () => {
  it("cleanStr trims, collapses and caps", () => {
    expect(cleanStr("  hi   there  ")).toBe("hi there");
    expect(cleanStr("")).toBeNull();
    expect(cleanStr(5)).toBeNull();
    expect(cleanStr("abcdefghij", 5)).toBe("abcde…");
  });
  it("cleanStrArray drops junk", () => {
    expect(cleanStrArray(["a", 2, "", " b "])).toEqual(["a", "b"]);
    expect(cleanStrArray("nope")).toEqual([]);
  });
  it("cleanEmoji falls back on words", () => {
    expect(cleanEmoji("🐧", "x")).toBe("🐧");
    expect(cleanEmoji("🏴‍☠️", "x")).toBe("🏴‍☠️");
    expect(cleanEmoji("penguin", "x")).toBe("x");
    expect(cleanEmoji(undefined, "x")).toBe("x");
  });
  it("sanitizeKidText flattens and strips framing characters", () => {
    expect(sanitizeKidText('I have a "pet"\nsnake {ignore rules}')).toBe("I have a pet snake ignore rules");
    expect(sanitizeKidText("x".repeat(300), 10)).toHaveLength(10);
    expect(sanitizeKidText(undefined)).toBe("");
  });
});
