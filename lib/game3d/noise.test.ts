import { describe, it, expect } from "vitest";
import { createNoise2D, fbm2D, seedFromString } from "./noise";

describe("createNoise2D", () => {
  it("is deterministic: same seed + coordinates always returns the same value", () => {
    const noise = createNoise2D(42);
    expect(noise(3.14, -7.2)).toBe(noise(3.14, -7.2));
  });

  it("produces different values for different seeds at the same coordinates", () => {
    const a = createNoise2D(1);
    const b = createNoise2D(2);
    expect(a(5, 5)).not.toBe(b(5, 5));
  });

  it("stays within the expected [-1, 1] range across a spread of samples", () => {
    const noise = createNoise2D(7);
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 20; y++) {
        const v = noise(x * 0.37, y * 0.61);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("fbm2D", () => {
  it("is deterministic given the same noise sampler and coordinates", () => {
    const noise = createNoise2D(9);
    const a = fbm2D(noise, 12.5, -4.25);
    const b = fbm2D(noise, 12.5, -4.25);
    expect(a).toBe(b);
  });

  it("stays within roughly [-1, 1]", () => {
    const noise = createNoise2D(11);
    for (let i = 0; i < 50; i++) {
      const v = fbm2D(noise, i * 0.83, -i * 1.21);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("seedFromString", () => {
  it("is deterministic for the same input", () => {
    expect(seedFromString("kid-123")).toBe(seedFromString("kid-123"));
  });

  it("differs for different inputs", () => {
    expect(seedFromString("kid-123")).not.toBe(seedFromString("kid-456"));
  });

  it("always returns a non-negative 32-bit integer", () => {
    const seed = seedFromString("a-fairly-long-kid-id-value-1234567890");
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });
});
