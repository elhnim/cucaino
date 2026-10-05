import { describe, expect, it } from "vitest";
import { buildKartTrackShape, cornerAt, nearestOnTrack, onBoostPad, progressFraction, trackAt, TRACK_WIDTH } from "./track";

describe("kart track geometry", () => {
  const track = buildKartTrackShape();

  it("is closed and reasonably long for a kid-sized circuit", () => {
    expect(track.length).toBeGreaterThan(700);
    expect(track.length).toBeLessThan(880);
    const first = track.points[0];
    const last = track.points[track.points.length - 1];
    // the loop closes back to (near) its start — smooth(..., closed=true) wraps round, so the gap
    // between the last sample and the first is just one more ordinary step
    const gap = Math.hypot(first[0] - last[0], first[1] - last[1]);
    expect(gap).toBeLessThan(6);
  });

  it("is smooth: no point-to-point jump bigger than a gentle step", () => {
    for (let i = 0; i < track.points.length; i++) {
      const a = track.points[i];
      const b = track.points[(i + 1) % track.points.length];
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThan(6);
    }
  });

  it("never crosses itself (no two non-adjacent segments closer than half the road width)", () => {
    const n = track.points.length;
    // points within this many samples of each other (circularly) are "the same stretch of road",
    // not a crossing — the start/finish straight's own two ends naturally sample close together
    const MARGIN = 16;
    let worst = Infinity;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const gap = Math.min(j - i, n - (j - i));
        if (gap < MARGIN) continue;
        const a = track.points[i];
        const b = track.points[j];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (d < worst) worst = d;
      }
    }
    expect(worst).toBeGreaterThan(TRACK_WIDTH * 0.55);
  });

  it("is a proper kart road: about five karts wide (a 15 m road made the corners meaningless)", () => {
    expect(track.width).toBeGreaterThanOrEqual(10);
    expect(track.width).toBeLessThanOrEqual(12);
  });

  it("is a real circuit: ~790 m (about 38 s a lap), a true hairpin, several medium bends and a long straight", () => {
    expect(track.length).toBeGreaterThan(740);
    expect(track.length).toBeLessThan(840);
    const r = Array.from(track.radius);
    expect(Math.min(...r)).toBeGreaterThan(9); // nothing a kart can't turn
    expect(Math.min(...r)).toBeLessThan(14); // …but a real hairpin
    // a straight of at least 60 m (radius huge the whole way)
    const step = track.length / track.points.length;
    let run = 0;
    let best = 0;
    for (let i = 0; i < r.length * 2; i++) {
      run = r[i % r.length] > 200 ? run + step : 0;
      best = Math.max(best, run);
    }
    expect(best).toBeGreaterThan(60);
    // at least four separate bends tighter than 25 m
    let bends = 0;
    let inBend = false;
    for (const v of r) {
      if (v < 25 && !inBend) bends++;
      inBend = v < 25;
    }
    expect(bends).toBeGreaterThanOrEqual(4);
  });

  it("trackAt and nearestOnTrack round-trip (on the centerline, lateral ~0)", () => {
    for (let s = 0; s < track.length; s += 17) {
      const at = trackAt(track, s);
      const near = nearestOnTrack(track, at.x, at.z);
      expect(Math.abs(near.lateral)).toBeLessThan(0.6);
      // s should match (mod length), allowing for the sampling step
      const diff = Math.min(Math.abs(near.s - s), track.length - Math.abs(near.s - s));
      expect(diff).toBeLessThan(3);
    }
  });

  it("progressFraction wraps 0..1 and matches distance travelled", () => {
    expect(progressFraction(track, 0)).toBeCloseTo(0, 5);
    expect(progressFraction(track, track.length)).toBeCloseTo(0, 5);
    expect(progressFraction(track, track.length / 2)).toBeCloseTo(0.5, 2);
  });

  it("every corner zone sits inside the lap and has positive length", () => {
    for (const c of track.corners) {
      expect(c.s0).toBeGreaterThanOrEqual(0);
      expect(c.s0).toBeLessThan(track.length);
    }
  });

  it("has a hairpin and a chicane (the spec's required features)", () => {
    const kinds = new Set(track.corners.map((c) => c.kind));
    expect(kinds.has("hairpin")).toBe(true);
    expect(kinds.has("chicane")).toBe(true);
  });

  it("boost pads sit on the road, centered", () => {
    for (const p of track.boostPads) {
      expect(onBoostPad(track, p.s, 0)).toBe(true);
    }
  });

  it("cornerAt finds the corner a boosted straight point is NOT in", () => {
    // the very first metre of the lap is the start/finish straight, not a corner
    expect(cornerAt(track, 1)).toBeNull();
  });

  it("the starting grid sits behind the line, alternating sides, off the centerline", () => {
    expect(track.grid.length).toBe(4);
    for (const g of track.grid) {
      expect(g.s).toBeLessThan(0);
      expect(Math.abs(g.lateral)).toBeGreaterThan(1);
      expect(Math.abs(g.lateral)).toBeLessThan(track.width / 2);
    }
  });

  it("buildKartTrackShape is deterministic (same shape every call)", () => {
    const a = buildKartTrackShape();
    const b = buildKartTrackShape();
    expect(a).toBe(b); // memoised
    expect(a.length).toBe(b.length);
  });
});
