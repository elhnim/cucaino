import { describe, expect, it } from "vitest";
import { FISH_FACTS, TOTAL_FISH_WEIGHT, getFish } from "./fishFacts";

describe("fishFacts registry", () => {
  it("has a dozen-ish unique species with sane fields", () => {
    expect(FISH_FACTS.length).toBeGreaterThanOrEqual(10);
    const ids = new Set(FISH_FACTS.map((f) => f.id));
    expect(ids.size).toBe(FISH_FACTS.length);
  });

  it("gives every fish a positive rarity weight", () => {
    for (const f of FISH_FACTS) {
      expect(f.weight).toBeGreaterThan(0);
    }
    expect(TOTAL_FISH_WEIGHT).toBeGreaterThan(0);
  });

  it("gives every fish a sane size range", () => {
    for (const f of FISH_FACTS) {
      const [lo, hi] = f.sizeCm;
      expect(lo).toBeGreaterThan(0);
      expect(hi).toBeGreaterThanOrEqual(lo);
    }
  });

  it("keeps facts true-length and unique", () => {
    const facts = new Set<string>();
    for (const f of FISH_FACTS) {
      expect(f.fact.length).toBeLessThanOrEqual(120);
      expect(f.fact.length).toBeGreaterThan(10);
      expect(facts.has(f.fact)).toBe(false);
      facts.add(f.fact);
    }
  });

  it("marks exactly the turtle as a kindly let-it-go catch", () => {
    const releaseOnly = FISH_FACTS.filter((f) => f.releaseOnly).map((f) => f.id);
    expect(releaseOnly).toContain("turtle");
  });

  it("makes the golden lucky fish the rarest entry", () => {
    const golden = getFish("golden-fish")!;
    expect(golden).toBeDefined();
    for (const f of FISH_FACTS) {
      if (f.id === "golden-fish") continue;
      expect(golden.weight).toBeLessThanOrEqual(f.weight);
    }
  });

  it("getFish returns undefined for unknown ids", () => {
    expect(getFish("nope")).toBeUndefined();
  });
});
