import { describe, expect, it } from "vitest";
import { EVEREST_PEAK, EVEREST_SUMMIT, LONE_PEAK, rawHeight, ridgeAt } from "./landform";

describe("Mount Everest's terrain (registry/landform.ts)", () => {
  it("sits ON the Great Ridge's own spine (not off to the side, not a separate hill)", () => {
    const atNominal = ridgeAt(EVEREST_PEAK.x, EVEREST_PEAK.z);
    expect(atNominal.d).toBeLessThan(200);
    expect(atNominal.u).toBeGreaterThan(0);
    expect(atNominal.u).toBeLessThan(1);
  });

  it("is the island's tallest point by a clear margin (LONE_PEAK, the ridge's own ordinary crest, and every village site)", () => {
    const summitH = rawHeight(EVEREST_SUMMIT.x, EVEREST_SUMMIT.z);
    const lonePeakH = rawHeight(LONE_PEAK.x, LONE_PEAK.z);
    expect(summitH).toBeGreaterThan(lonePeakH * 2); // "~1.5-2x Lone Peak's height" was the floor; aim well past it
    // a coarse sweep of the whole Wildlands + park (everywhere a village, the kart track or the
    // town could ever plausibly sit) never beats the summit
    let maxElsewhere = -Infinity;
    for (let x = -2200; x <= 2200; x += 40) {
      for (let z = -2200; z <= 2200; z += 40) {
        if (Math.hypot(x - EVEREST_SUMMIT.x, z - EVEREST_SUMMIT.z) < 250) continue; // skip the summit's own massif
        const h = rawHeight(x, z);
        if (h > maxElsewhere) maxElsewhere = h;
      }
    }
    expect(summitH).toBeGreaterThan(maxElsewhere * 1.3);
  });

  it("the summit's own registered coordinate (EVEREST_SUMMIT) really is (very close to) the local maximum near EVEREST_PEAK", () => {
    const h0 = rawHeight(EVEREST_SUMMIT.x, EVEREST_SUMMIT.z);
    for (let dx = -20; dx <= 20; dx += 4)
      for (let dz = -20; dz <= 20; dz += 4) expect(rawHeight(EVEREST_SUMMIT.x + dx, EVEREST_SUMMIT.z + dz)).toBeLessThanOrEqual(h0 + 0.5);
  });

  it("is steep and craggy near the top (a real mountain profile, not a smooth dome)", () => {
    const e = 1.5;
    const steepness = (x: number, z: number) => {
      const dx = rawHeight(x + e, z) - rawHeight(x - e, z);
      const dz = rawHeight(x, z + e) - rawHeight(x, z - e);
      return Math.hypot(dx, dz) / (2 * e);
    };
    // partway down the upper flank (not right at the very summit, which is deliberately a clean
    // point, nor far down where it blends back into the ordinary ridge)
    let steepSomewhere = false;
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const x = EVEREST_PEAK.x + Math.sin(a) * EVEREST_PEAK.r * 0.35;
      const z = EVEREST_PEAK.z + Math.cos(a) * EVEREST_PEAK.r * 0.35;
      if (steepness(x, z) > 0.9) steepSomewhere = true;
    }
    expect(steepSomewhere).toBe(true);
  });
});
