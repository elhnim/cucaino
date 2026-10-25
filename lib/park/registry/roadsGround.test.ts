import { describe, expect, it } from "vitest";
import * as R from "./roads";
import { groundY } from "./terrain";

// The roads' frozen heights against the FINAL ground (after every carve and raise in terrain.ts's
// finish): roads.test.ts only checks the frozen numbers against each other, which let a road sit on
// a 68-unit embankment (the canyon plateau's lift applied twice), run into a raised gorge wall and
// drop 7 units off the end of a bridge with every test green.
describe("roads on the real ground", () => {
  it("every ordinary road point lies on the ground it was laid out for", () => {
    for (const seg of R.ROAD_SEGMENTS) {
      for (const p of R.densifyRoad(seg.points, 5)) {
        if (R.roadDeckY(p.x, p.z) !== null) continue;
        // (a tunnel's own approach cutting is dug below the road's line on purpose)
        if (R.TUNNELS.some((t) => Math.hypot(t.x0 - p.x, t.z0 - p.z) < 14 || Math.hypot(t.x1 - p.x, t.z1 - p.z) < 14)) continue;
        expect(Math.abs(groundY(p.x, p.z) - p.y), `${seg.id} at (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`).toBeLessThan(2.5);
      }
    }
  });

  it("every water bridge reaches from bank to bank: the ground at each end is up at deck height", () => {
    for (const b of R.BRIDGES) {
      if (b.style === "overpass") continue;
      for (const [sign, y] of [[-1, b.y0], [1, b.y1]] as const) {
        const x = b.x + Math.sin(b.heading) * sign * (b.span / 2 + 0.5);
        const z = b.z + Math.cos(b.heading) * sign * (b.span / 2 + 0.5);
        expect(Math.abs(groundY(x, z) - y), `${b.id} end ${sign}`).toBeLessThan(1);
      }
    }
  });

  it("every car park and roundabout stands on ground at its own height", () => {
    for (const c of R.CAR_PARKS) expect(Math.abs(groundY(c.x, c.z) - c.y), c.id).toBeLessThan(2);
    for (const j of R.ROAD_JUNCTIONS) expect(Math.abs(groundY(j.x, j.z) - j.y), j.id).toBeLessThan(2);
  });
});
