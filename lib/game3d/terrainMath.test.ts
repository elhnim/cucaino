import { describe, it, expect } from "vitest";
import { createNoise2D } from "./noise";
import {
  CHUNK_SIZE,
  VILLAGE_CLEAR_RADIUS,
  GROUND_BASE_Y,
  chunkCoordAt,
  chunkKey,
  chunkCenter,
  chunkSeed,
  heightAt,
} from "./terrainMath";

describe("chunkCoordAt", () => {
  it("maps the origin to chunk (0, 0)", () => {
    expect(chunkCoordAt(0, 0)).toEqual({ cx: 0, cz: 0 });
  });

  it("maps a point just inside the next chunk over", () => {
    expect(chunkCoordAt(CHUNK_SIZE + 1, 0)).toEqual({ cx: 1, cz: 0 });
  });

  it("handles negative coordinates without an off-by-one at the boundary", () => {
    expect(chunkCoordAt(-1, -1)).toEqual({ cx: -1, cz: -1 });
    expect(chunkCoordAt(-CHUNK_SIZE, 0)).toEqual({ cx: -1, cz: 0 });
  });
});

describe("chunkKey", () => {
  it("is stable and distinguishes coordinates", () => {
    expect(chunkKey(2, -3)).toBe("2,-3");
    expect(chunkKey(2, -3)).not.toBe(chunkKey(-3, 2));
  });
});

describe("chunkCenter", () => {
  it("returns the midpoint of the chunk's world-space span", () => {
    const center = chunkCenter(0, 0);
    expect(center.x).toBeCloseTo(CHUNK_SIZE / 2);
    expect(center.z).toBeCloseTo(CHUNK_SIZE / 2);
  });
});

describe("chunkSeed", () => {
  it("is deterministic for the same world seed + chunk coordinates", () => {
    expect(chunkSeed(1337, 4, -2)).toBe(chunkSeed(1337, 4, -2));
  });

  it("differs across chunks and across world seeds", () => {
    expect(chunkSeed(1337, 4, -2)).not.toBe(chunkSeed(1337, 5, -2));
    expect(chunkSeed(1337, 4, -2)).not.toBe(chunkSeed(7, 4, -2));
  });
});

describe("heightAt", () => {
  it("is exactly flat at the village ground level near the origin", () => {
    const noise = createNoise2D(5);
    expect(heightAt(0, 0, noise)).toBe(GROUND_BASE_Y);
    expect(heightAt(VILLAGE_CLEAR_RADIUS - 1, 0, noise)).toBe(GROUND_BASE_Y);
  });

  it("is deterministic far from the origin, where terrain varies", () => {
    const noise = createNoise2D(5);
    const far = VILLAGE_CLEAR_RADIUS + 200;
    expect(heightAt(far, far, noise)).toBe(heightAt(far, far, noise));
  });

  it("never produces NaN or infinite values", () => {
    const noise = createNoise2D(3);
    for (const [x, z] of [[0, 0], [1000, -1000], [-500, 500], [VILLAGE_CLEAR_RADIUS + 1, 0]]) {
      const h = heightAt(x, z, noise);
      expect(Number.isFinite(h)).toBe(true);
    }
  });
});
