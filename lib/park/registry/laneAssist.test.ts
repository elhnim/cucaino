import { describe, expect, it } from "vitest";
import { ROAD_SEGMENTS, ROAD_JUNCTIONS, ROUNDABOUT_OUTER, carParkAt, laneAssist, roadAt, roadConfine, ROAD_HALF } from "./roads";

/** drive a car along a road with the stick held `offDeg` off the road's heading at the start (as
 *  a kid does: "roughly forward", never exactly), the way ParkWorld moves it, and report how far
 *  from the centre-line it got and how often it scraped the edge */
function drive(segIdx: number, offDeg: number, assist: boolean) {
  const seg = ROAD_SEGMENTS[segIdx];
  const P = seg.points;
  // (start just past the roundabout or car park at the road's own end)
  let si = 1;
  while (si < P.length - 2 && (ROAD_JUNCTIONS.some((j) => Math.hypot(P[si].x - j.x, P[si].z - j.z) < ROUNDABOUT_OUTER + 12) || carParkAt(P[si].x, P[si].z, 8))) si++;
  const start = P[si];
  let x = start.x;
  let z = start.z;
  // the stick: fixed in the world, offDeg off the road's heading where the car starts (the camera
  // mostly follows behind, so a held stick is roughly fixed relative to the road ahead)
  let worst = 0;
  let scrapes = 0;
  let travelled = 0;
  const dt = 1 / 30;
  const sp = 9;
  for (let i = 0; i < 400; i++) {
    const h = roadAt(x, z);
    if (ROAD_JUNCTIONS.some((j) => Math.hypot(x - j.x, z - j.z) < ROUNDABOUT_OUTER + 10)) break;
    // (the end of the road: a car park or the next piece of road takes over)
    if (carParkAt(x, z, 6) || Math.hypot(x - P[P.length - 1].x, z - P[P.length - 1].z) < 15) break;
    // the stick follows the road the way a camera behind the car does, but always offDeg off
    const a = h.heading + (offDeg * Math.PI) / 180;
    let vx = Math.sin(a);
    let vz = Math.cos(a);
    if (assist) ({ vx, vz } = laneAssist(x, z, vx, vz));
    const px = x;
    const pz = z;
    x += vx * sp * dt;
    z += vz * sp * dt;
    const c = roadConfine(x, z, px, pz);
    if (Math.hypot(c.x - x, c.z - z) > 0.01) scrapes++;
    x = c.x;
    z = c.z;
    travelled += Math.hypot(x - px, z - pz);
    worst = Math.max(worst, roadAt(x, z).d);
  }
  return { worst, scrapes, travelled };
}

describe("lane-keeping", () => {
  it("keeps a car with a sloppy stick off the kerb on every road", () => {
    for (let s = 0; s < ROAD_SEGMENTS.length; s++) {
      if (ROAD_SEGMENTS[s].points.length < 12) continue;
      for (const off of [-35, 25, 50]) {
        const r = drive(s, off, true);
        expect(r.scrapes, `${ROAD_SEGMENTS[s].id} at ${off}° scraped the edge`).toBe(0);
        expect(r.worst, `${ROAD_SEGMENTS[s].id} at ${off}° drifted`).toBeLessThan(ROAD_HALF - 1);
        expect(r.travelled, `${ROAD_SEGMENTS[s].id} at ${off}° never got going`).toBeGreaterThan(20);
      }
    }
  });

  it("was the problem: without it the same sloppy stick scrapes the kerb", () => {
    let scrapes = 0;
    for (let s = 0; s < ROAD_SEGMENTS.length; s++) if (ROAD_SEGMENTS[s].points.length >= 12) scrapes += drive(s, 35, false).scrapes;
    expect(scrapes).toBeGreaterThan(100);
  });

  it("still lets a clearly sideways push turn off", () => {
    const seg = ROAD_SEGMENTS.find((s) => s.id === "spur-giza")!;
    const p = seg.points[40];
    const h = roadAt(p.x, p.z);
    const side = h.heading + Math.PI / 2;
    const r = laneAssist(p.x, p.z, Math.sin(side), Math.cos(side));
    expect(r.vx).toBeCloseTo(Math.sin(side), 6);
    expect(r.vz).toBeCloseTo(Math.cos(side), 6);
  });
});
