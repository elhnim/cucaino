import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { PAINTED_BUILDINGS } from "./paintedBuildings";
import { PLACES } from "./places";

describe("painted buildings", () => {
  it("each stands at a real place, once, and fits roughly inside that place's own footprint", () => {
    const seen = new Set<string>();
    for (const b of PAINTED_BUILDINGS) {
      const place = PLACES.find((p) => p.id === b.place);
      expect(place, b.place).toBeTruthy();
      expect(seen.has(b.place), `${b.place} twice`).toBe(false);
      seen.add(b.place);
      // (its corners may poke a little past the circle the kid is pushed out of, never far)
      expect(Math.hypot(b.w / 2, b.d / 2), b.place).toBeLessThan(place!.radius + 1.6);
      // a door a kid can walk up to: the wall is at least a couple of kid-heights tall
      expect(b.h).toBeGreaterThan(3);
      for (const i of b.replaces ?? [0]) expect(i, b.place).toBeLessThan(Math.max(1, place!.models.length));
    }
  });

  it("each has its three pictures, and stays light (the whole building well under 250 KB)", () => {
    for (const b of PAINTED_BUILDINGS) {
      let total = 0;
      for (const part of [b.front ?? "front", "side", "roof"]) {
        const path = `public/park-assets/buildings/${b.art}-${part}.webp`;
        expect(existsSync(path), path).toBe(true);
        total += statSync(path).size;
      }
      expect(total, b.art).toBeLessThan(250_000);
    }
  });
});
