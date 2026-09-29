import { afterEach, describe, expect, it } from "vitest";
import { arcadeSecret, markUsedOnce, openToken, releaseUsed, sealToken } from "./token";

const SECRET = "test-secret-that-is-long-enough";

describe("sealed tokens", () => {
  it("round-trips a payload", () => {
    const t = sealToken({ culprit: "s2", n: [1, 2] }, SECRET, "mystery", 60_000);
    expect(openToken(t, SECRET, "mystery")).toEqual({ culprit: "s2", n: [1, 2] });
  });
  it("can't be read without the key (no plaintext in the token)", () => {
    const t = sealToken({ culprit: "Penny Peacock" }, SECRET, "mystery", 60_000);
    const decoded = Buffer.from(t.slice(3).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1");
    expect(decoded).not.toContain("Penny");
    expect(t).not.toContain("Penny");
  });
  it("rejects tampering, a wrong key, a wrong purpose and junk", () => {
    const t = sealToken({ a: 1 }, SECRET, "mystery", 60_000);
    const i = 10;
    const flipped = t.slice(0, i) + (t[i] === "A" ? "B" : "A") + t.slice(i + 1);
    expect(openToken(flipped, SECRET, "mystery")).toBeNull();
    expect(openToken(t, "another-secret-entirely-123", "mystery")).toBeNull();
    expect(openToken(t, SECRET, "doodle")).toBeNull();
    expect(openToken("v1.abc", SECRET, "mystery")).toBeNull();
    expect(openToken(42, SECRET, "mystery")).toBeNull();
    expect(openToken("", SECRET, "mystery")).toBeNull();
  });
  it("expires", () => {
    const now = 1_000_000;
    const t = sealToken({ a: 1 }, SECRET, "doodle", 1_000, now);
    expect(openToken(t, SECRET, "doodle", now + 999)).toEqual({ a: 1 });
    expect(openToken(t, SECRET, "doodle", now + 1_001)).toBeNull();
  });
  it("uses fresh randomness (same payload, different tokens)", () => {
    expect(sealToken({ a: 1 }, SECRET, "x", 1000)).not.toBe(sealToken({ a: 1 }, SECRET, "x", 1000));
  });
});

describe("arcadeSecret", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });
  it("prefers ARCADE_SECRET, then falls back to other server-only secrets", () => {
    process.env.ARCADE_SECRET = "a".repeat(32);
    expect(arcadeSecret()).toBe("a".repeat(32));
    delete process.env.ARCADE_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "b".repeat(40);
    expect(arcadeSecret()).toBe("b".repeat(40));
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(arcadeSecret()).toBeNull();
  });
});

describe("markUsedOnce", () => {
  it("allows a step once until released", () => {
    expect(markUsedOnce("t:1")).toBe(true);
    expect(markUsedOnce("t:1")).toBe(false);
    releaseUsed("t:1");
    expect(markUsedOnce("t:1")).toBe(true);
  });
});
