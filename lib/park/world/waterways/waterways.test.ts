import { describe, expect, it } from "vitest";
import { WATER_Y } from "../../registry/terrain";
import { LAKE, waterDepthAt, waterSdf } from "../../registry/waterways";
import { F_KOI, F_PERCH, F_TROUT, U, planFish, stepFish } from "./fish";

describe("lake fish", { timeout: 60000 }, () => {
  it("koi, perch and trout at true size, every one of them always in the water", () => {
    const W = planFish({});
    const kinds = new Set(W.fish.map((f) => f.kind));
    expect(kinds.has(F_KOI) && kinds.has(F_PERCH) && kinds.has(F_TROUT)).toBe(true);
    expect(W.fish.length).toBeGreaterThanOrEqual(20);
    const dt = 1 / 15;
    let jumps = 0;
    let splashes = 0;
    let lastSplash = -1;
    for (let i = 0; i < 15 * 180; i++) {
      const t = i * dt;
      // a kid swims across the lake for a bit (the fish scatter)
      const swimming = t > 60 && t < 90;
      stepFish(W, dt, t, LAKE.x + (t - 60) * 0.8 - 12, LAKE.z, swimming);
      for (const f of W.fish) {
        const at = `${f.kind} @ ${f.x.toFixed(1)},${f.y.toFixed(2)},${f.z.toFixed(1)} t ${t.toFixed(1)}`;
        expect(waterSdf(f.x, f.z), at).toBeLessThan(-0.3);
        if (f.jump >= 0) {
          jumps++;
          continue;
        }
        // under the surface, above the bed
        expect(f.y, at).toBeLessThan(WATER_Y - 0.15);
        expect(f.y, at).toBeGreaterThan(WATER_Y - waterDepthAt(f.x, f.z) + 0.1);
      }
      if (W.splash[2 + ((W.nextSplash + 3) % 4) * 4] !== lastSplash) {
        lastSplash = W.splash[2 + ((W.nextSplash + 3) % 4) * 4];
        splashes++;
      }
    }
    // now and then one leaps clean out (with a splash going in and coming down)
    expect(jumps).toBeGreaterThan(0);
    expect(splashes).toBeGreaterThan(4);
  });

  it("are sized like the real fish", () => {
    // (the model is 1 unit long: x 1.6 per metre)
    expect(0.6 * U).toBeGreaterThan(0.9);
    expect(0.25 * U).toBeLessThan(0.5);
  });
});
