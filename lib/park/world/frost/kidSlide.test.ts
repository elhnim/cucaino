import { describe, expect, it } from "vitest";
import { KID_CHUTES, SLIDE_GAP, SLIDE_LAT_MAX, SLIDE_START_R, SLIDE_VMAX, makeKidSlide, slideStartAt, stepKidSlide } from "./kidSlide";
import { FROST_SLIDES, FROST_TERRACE, FROST_WATER_Y, SLIDE_HALF, frostSlideSplash } from "../../registry/frostIsland";
import { S_QUEUE, S_SLIDE, colonyAheadOn, colonyChuteClear, colonyKidChute, makeColony, stepColony } from "./colony";

const dt = 1 / 30;
/** distance from (x, z) to a chute's centreline */
function offLine(c: number, x: number, z: number) {
  const P = FROST_SLIDES[c].path;
  let best = Infinity;
  for (let i = 0; i + 1 < P.length; i++) {
    const ux = P[i + 1].x - P[i].x;
    const uz = P[i + 1].z - P[i].z;
    const t = Math.max(0, Math.min(1, ((x - P[i].x) * ux + (z - P[i].z) * uz) / (ux * ux + uz * uz)));
    best = Math.min(best, Math.hypot(P[i].x + ux * t - x, P[i].z + uz * t - z));
  }
  return best;
}
function behindStart(c: number, back: number) {
  const C = KID_CHUTES[c];
  return { x: C.x[0] - Math.sin(C.head[0]) * back, z: C.z[0] - Math.cos(C.head[0]) * back };
}

describe("the Park kid on the penguin slides", () => {
  it("each chute's start zone is just behind its arch on Slide Top (and nowhere else)", () => {
    for (let c = 0; c < FROST_SLIDES.length; c++) {
      const p = behindStart(c, 1.2);
      expect(slideStartAt(p.x, p.z)).toBe(c);
      expect(Math.hypot(p.x - FROST_TERRACE.x, p.z - FROST_TERRACE.z)).toBeLessThan(FROST_TERRACE.r + 3);
      // (well down the chute: not a start)
      const mid = FROST_SLIDES[c].path[20];
      expect(slideStartAt(mid.x, mid.z)).toBe(-1);
    }
    expect(slideStartAt(FROST_TERRACE.x + 40, FROST_TERRACE.z)).toBe(-1);
    expect(SLIDE_START_R).toBeGreaterThan(1.5);
  });

  it("follows the chute all the way down, speeding up with the slope (capped), and splashes into the sea", () => {
    for (let c = 0; c < FROST_SLIDES.length; c++) {
      const p = behindStart(c, 1.2);
      const k = makeKidSlide(c, p.x, p.z);
      let vMax = 0;
      let splashes = 0;
      const splashAt = { x: 0, z: 0 };
      let lastY = Infinity;
      let steps = 0;
      while (!k.done && steps++ < 4000) {
        stepKidSlide(k, dt, 0, true, Infinity);
        if (k.splash) {
          splashes++;
          splashAt.x = k.x;
          splashAt.z = k.z;
        }
        if (k.s > 0) {
          expect(offLine(c, k.x, k.z)).toBeLessThan(SLIDE_LAT_MAX + 0.05);
          // always downhill
          expect(k.y).toBeLessThanOrEqual(lastY + 1e-4);
          lastY = k.y;
        }
        vMax = Math.max(vMax, k.v);
      }
      expect(k.done).toBe(true);
      expect(splashes).toBe(1);
      // the splash is where the chute meets the sea; then a glide on under the water
      const sp = FROST_SLIDES[c].path[frostSlideSplash(FROST_SLIDES[c])];
      expect(Math.hypot(splashAt.x - sp.x, splashAt.z - sp.z)).toBeLessThan(1.5);
      // ...and deep enough to swim on (the engine's SWIM_DEPTH is 0.9)
      expect(k.y).toBeLessThan(FROST_WATER_Y - 1.1);
      expect(vMax).toBeGreaterThan(7);
      expect(vMax).toBeLessThanOrEqual(SLIDE_VMAX);
      // a quick, thrilling ride: under half a minute
      expect(steps * dt).toBeLessThan(30);
    }
  });

  it("the joystick nudges the kid across the chute, and the walls always keep them in", () => {
    for (const steer of [1, -1]) {
      const p = behindStart(0, 1);
      const k = makeKidSlide(0, p.x, p.z);
      let bumps = 0;
      let maxLat = 0;
      let flipT = 0;
      while (!k.done) {
        // (hard over, then flipping side to side)
        flipT += dt;
        const s = flipT < 3 ? steer : Math.sin(flipT * 3) > 0 ? 1 : -1;
        stepKidSlide(k, dt, s, true, Infinity);
        if (k.bump) bumps++;
        maxLat = Math.max(maxLat, Math.abs(k.lat));
        expect(Math.abs(k.lat)).toBeLessThanOrEqual(SLIDE_LAT_MAX + 1e-6);
        if (k.s > 0) expect(offLine(0, k.x, k.z)).toBeLessThan(SLIDE_HALF);
      }
      expect(maxLat).toBeGreaterThan(SLIDE_LAT_MAX * 0.95);
      expect(bumps).toBeGreaterThan(0);
    }
    // left is left: steering + moves the kid to the left of the way down
    const p = behindStart(1, 1);
    const k = makeKidSlide(1, p.x, p.z);
    for (let i = 0; i < 40; i++) stepKidSlide(k, dt, 1, true, Infinity);
    expect(k.lat).toBeGreaterThan(0.2);
  });

  it("leans into the bends (the wiggly one most of all)", () => {
    const p = behindStart(2, 1);
    const k = makeKidSlide(2, p.x, p.z);
    let maxLean = 0;
    while (!k.done) {
      stepKidSlide(k, dt, 0, true, Infinity);
      maxLean = Math.max(maxLean, Math.abs(k.lean));
    }
    expect(maxLean).toBeGreaterThan(0.15);
  });

  it("waits for its turn, and never catches up with a penguin sliding ahead", () => {
    const col = makeColony(false);
    let t = 0;
    // let the colony get going, then find a chute with a penguin just setting off
    let c = -1;
    for (let k = 0; k < 4000 && c < 0; k++) {
      stepColony(col, dt, (t += dt), null);
      const p = col.penguins.find((q) => q.state === S_SLIDE && q.ps > 0 && q.ps < 3);
      if (p) c = p.chute;
    }
    expect(c).toBeGreaterThanOrEqual(0);
    colonyKidChute(col, c);
    const st = behindStart(c, 1);
    const kid = makeKidSlide(c, st.x, st.z);
    let waited = 0;
    let minGap = Infinity;
    let started = false;
    for (let k = 0; k < 3000 && !kid.done; k++) {
      t += dt;
      stepColony(col, dt, t, { x: kid.x, z: kid.z });
      const ahead = colonyAheadOn(col, c, kid.s);
      stepKidSlide(kid, dt, 0, colonyChuteClear(col, c), ahead);
      if (kid.waiting) waited += dt;
      else started = true;
      // nobody starts down the kid's chute while the kid is on it
      for (const p of col.penguins) if (p.state === S_SLIDE && p.chute === c && p.ps < kid.s && p.ps > -1 && started) throw new Error("a penguin set off behind the kid");
      if (started && Number.isFinite(ahead)) minGap = Math.min(minGap, ahead - kid.s);
    }
    expect(kid.done).toBe(true);
    expect(waited).toBeGreaterThan(0.5);
    expect(minGap).toBeGreaterThan(SLIDE_GAP - 0.6);
    // while the kid had the chute, its queue stood aside
    colonyKidChute(col, c);
    for (let k = 0; k < 120; k++) stepColony(col, dt, (t += dt), null);
    const C = KID_CHUTES[c];
    for (const p of col.penguins) if (p.state === S_QUEUE && p.chute === c) expect(Math.hypot(p.x - C.x[0], p.z - C.z[0]), "queue aside").toBeGreaterThan(2.2);
    colonyKidChute(col, -1);
  });
});
