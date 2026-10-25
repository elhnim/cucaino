import { describe, expect, it } from "vitest";
import { bigFrame, bigReach, occFade, type BigBody } from "./bigSea";
import { whaleLen } from "./whales";

const kid = { x: 0, y: -9, z: 0 };
const out = { dist: 0, fov: 0, w: 0 };
const body = (x: number, y: number, z: number, len: number): BigBody => ({ x, y, z, len, yaw: 0 });

describe("the underwater camera frames a diving kid with the giants", () => {
  it("stays close in (murky water) with nothing big about", () => {
    expect(bigFrame(kid, [], 13, 36, out).dist).toBe(13);
    // (a turtle or a reef fish doesn't count)
    expect(bigFrame(kid, [body(3, -9, 2, 2)], 13, 36, out).dist).toBe(13);
    expect(out.fov).toBe(0);
  });
  it("pulls right back (and wider) for a true-size blue whale gliding past beside the kid", () => {
    const L = whaleLen("blue");
    expect(L).toBeGreaterThan(38);
    const f = bigFrame(kid, [body(12, -10, -8, L)], 13, 36, out);
    // far enough back to see ~40 units of whale whole (not a wall at 13)
    expect(f.dist).toBeGreaterThan(30);
    expect(f.dist).toBeLessThanOrEqual(36);
    expect(f.fov).toBeGreaterThan(5);
  });
  it("…and for the 26-unit megalodon", () => {
    expect(bigFrame(kid, [body(-9, -8, 6, 26)], 13, 36, out).dist).toBeGreaterThan(24);
  });
  it("eases back in smoothly as the giant swims away (no snapping)", () => {
    const L = whaleLen("blue");
    let prev = Infinity;
    for (let d = 5; d <= bigReach(L) + 10; d += 2) {
      const v = bigFrame(kid, [body(d, -9, 0, L)], 13, 36, out).dist;
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      if (prev !== Infinity) expect(prev - v).toBeLessThan(4);
      prev = v;
    }
    expect(prev).toBe(13);
  });
});

describe("big creatures fade out of the way between the camera and the kid", () => {
  // (camera space: the kid 20 units straight ahead)
  const k = { x: 0, y: 0, z: -20 };
  it("gone where it would hide the kid: on the line to them, and right at the lens", () => {
    expect(occFade({ x: 0, y: 0, z: -10 }, k)).toBe(1);
    expect(occFade({ x: 1, y: -0.6, z: -12 }, k)).toBe(1);
    // (right in front of the kid, and level with them)
    expect(occFade({ x: 0.4, y: 0.5, z: -19.2 }, k)).toBe(1);
    expect(occFade({ x: 0.5, y: 0.3, z: -1.5 }, k)).toBe(1);
  });
  it("kept everywhere else: behind the kid, well off to the side", () => {
    expect(occFade({ x: 0, y: 0, z: -21.5 }, k)).toBe(0);
    expect(occFade({ x: 9, y: 0, z: -12 }, k)).toBe(0);
    expect(occFade({ x: -14, y: 3, z: -18 }, k)).toBe(0);
  });
});
