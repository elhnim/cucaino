import { describe, expect, it } from "vitest";
import { candyColor, candyPixels, hslToRgb, rgbToHsl } from "./candy";

// the full candy effect (the park now uses a light touch by default: DEFAULT_CANDY.strength)
const FULL = { neutralHue: 0.9, strength: 1 };

describe("candy recolouring", () => {
  it("round-trips HSL", () => {
    const [h, s, l] = rgbToHsl(0.2, 0.6, 0.4);
    const [r, g, b] = hslToRgb(h, s, l);
    expect(r).toBeCloseTo(0.2, 5);
    expect(g).toBeCloseTo(0.6, 5);
    expect(b).toBeCloseTo(0.4, 5);
  });

  it("keeps white icing white", () => {
    expect(candyColor(1, 1, 1)).toEqual([1, 1, 1]);
  });

  it("never produces murky dark colours (everything is bright candy)", () => {
    for (const c of [[0, 0, 0], [0.2, 0.2, 0.22], [0.4, 0.25, 0.15], [0.1, 0.3, 0.1], [0.1, 0.1, 0.5]]) {
      const [, , l] = rgbToHsl(...(candyColor(c[0], c[1], c[2], FULL) as [number, number, number]));
      expect(l).toBeGreaterThanOrEqual(0.54);
    }
  });

  it("turns greys into saturated candy, not grey", () => {
    const [, s] = rgbToHsl(...(candyColor(0.5, 0.5, 0.5, FULL) as [number, number, number]));
    expect(s).toBeGreaterThan(0.3);
  });

  it("strength 0 leaves colours untouched", () => {
    const [r, g, b] = candyColor(0.3, 0.5, 0.2, { neutralHue: 0.9, strength: 0 });
    expect([r, g, b].map((v) => +v.toFixed(5))).toEqual([0.3, 0.5, 0.2]);
  });

  it("recolours RGBA pixel buffers in place and keeps alpha", () => {
    const px = new Uint8ClampedArray([128, 128, 128, 77]);
    candyPixels(px);
    expect(px[3]).toBe(77);
    expect(px[0] === px[1] && px[1] === px[2]).toBe(false);
  });
});
