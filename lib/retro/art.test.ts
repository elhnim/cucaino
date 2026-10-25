import { describe, expect, it } from "vitest";
import { bake, toHex } from "./art";

describe("retro art", () => {
  it("bakes pictures with hundreds of colours without merging any", () => {
    const s = bake(30, 30, (x, y) => toHex(x * 8, y * 8, 100));
    expect(new Set(s.rows.join("").split("")).size).toBe(900);
    expect(new Set(Object.values(s.pal)).size).toBe(900);
  });
});
