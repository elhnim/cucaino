import { describe, expect, it } from "vitest";
import { COURSE, KINGDOM, greenHeight, type HoleDef } from "./courses";
import { MAX_SHOT_DIST, maxStrokes, pointInPolygon, rollDistance, scoreName, shoot, speedForDistance, stepBall, type BallState } from "./physics";
import { solveHole } from "./solver";

function simulate(ball: BallState, hole: HoleDef, maxSeconds = 20) {
  let t = 0;
  let splash = false;
  while (t < maxSeconds) {
    const r = stepBall(ball, hole, 1 / 60, t);
    t += 1 / 60;
    if (r.splash) splash = true;
    if (r.sunk) return { sunk: true, t, splash };
    if (!r.moving) return { sunk: false, t, splash };
  }
  return { sunk: false, t, splash };
}

const flat: HoleDef = { name: "flat", par: 2, color: "#fff", outline: [{ x: -2, z: -30 }, { x: 2, z: -30 }, { x: 2, z: 30 }, { x: -2, z: 30 }], tee: { x: 0, z: 25 }, cup: { x: 0, z: -99 } };

describe("mini golf physics", () => {
  it("has 18 holes", () => {
    expect(COURSE).toHaveLength(18);
  });

  it("power sets distance: a putt rolls the distance the aim promises", () => {
    for (const power of [0.2, 0.5, 1]) {
      const ball: BallState = { x: 0, z: 25, vx: 0, vz: 0 };
      shoot(ball, 0, -1, power);
      simulate(ball, flat, 30);
      expect(25 - ball.z).toBeCloseTo(power * MAX_SHOT_DIST, 0);
    }
    expect(rollDistance(speedForDistance(7))).toBeCloseTo(7, 3);
  });

  it("slows smoothly: rolling resistance, not a long glide then a sudden stop", () => {
    const ball: BallState = { x: 0, z: 25, vx: 0, vz: 0 };
    shoot(ball, 0, -1, 1);
    const speeds: number[] = [];
    for (let f = 0; f < 60 * 10; f++) {
      stepBall(ball, flat, 1 / 60, 0);
      speeds.push(Math.abs(ball.vz));
    }
    const stopAt = speeds.findIndex((s) => s === 0);
    expect(stopAt).toBeGreaterThan(60); // rolls for a while...
    expect(stopAt).toBeLessThan(60 * 6); // ...but settles within a few seconds
    expect(speeds[stopAt - 1]).toBeLessThan(0.1); // and was barely moving when it stopped
  });

  it("a slow ball drops in the cup, a fast one rattles over it", () => {
    const hole = COURSE[0];
    const slow: BallState = { x: hole.cup.x, z: hole.cup.z + 1, vx: 0, vz: -2 };
    expect(simulate(slow, hole).sunk).toBe(true);
    const fast: BallState = { x: hole.cup.x, z: hole.cup.z + 0.6, vx: 0, vz: -9 };
    stepBall(fast, hole, 0.1, 0);
    expect(fast.z).toBeLessThan(hole.cup.z); // flew past the cup instead of vanishing
  });

  it("never lets the ball leave the green, even on full-power shots into walls", () => {
    for (const hole of COURSE) {
      for (const [dx, dz] of [
        [1, 0.3],
        [-1, -0.2],
        [0.2, -1],
      ]) {
        const ball: BallState = { x: hole.tee.x, z: hole.tee.z, vx: 0, vz: 0 };
        shoot(ball, dx, dz, 1);
        let t = 0;
        for (let f = 0; f < 600; f++, t += 1 / 60) {
          const r = stepBall(ball, hole, 1 / 60, t);
          if (r.splash || r.sunk) break;
          expect(pointInPolygon(ball, hole.outline)).toBe(true);
        }
      }
    }
  });

  it("sand slows the ball down more than grass", () => {
    const hole = COURSE[4];
    const onSand: BallState = { x: 0, z: 1.2, vx: 2, vz: 0 };
    const onGrass: BallState = { x: 0, z: 5, vx: 2, vz: 0 };
    stepBall(onSand, hole, 0.2, 0);
    stepBall(onGrass, hole, 0.2, 0);
    expect(Math.abs(onSand.vx)).toBeLessThan(Math.abs(onGrass.vx));
  });

  it("water splashes, portals teleport, zoom pads speed the ball up, hills roll it back", () => {
    const splash = COURSE.find((h) => h.name === "Splash Bridge")!;
    const wet: BallState = { x: -2, z: 3, vx: 0, vz: -3 };
    expect(simulate(wet, splash).splash).toBe(true);

    const portal = COURSE.find((h) => h.name === "Portal Pop")!;
    const p = portal.portals![0];
    const tp: BallState = { x: p.from.x, z: p.from.z + 0.8, vx: 0, vz: -2 };
    let went = false;
    for (let f = 0; f < 60 && !went; f++) went = stepBall(tp, portal, 1 / 60, 0).teleported;
    expect(went).toBe(true);
    expect(tp.x).toBeGreaterThan(0);

    const zoom = COURSE.find((h) => h.name === "Zoom Pad")!;
    const bz: BallState = { x: 0, z: zoom.boosts![0].at.z + 0.7, vx: 0, vz: -1 };
    let boosted = false;
    for (let f = 0; f < 60 && !boosted; f++) boosted = stepBall(bz, zoom, 1 / 60, 0).boosted;
    expect(boosted).toBe(true);
    expect(Math.abs(bz.vz)).toBeGreaterThan(5);

    const hill = COURSE.find((h) => h.name === "Hill Climb")!;
    const weak: BallState = { x: 0, z: 1.8, vx: 0, vz: -1 };
    simulate(weak, hill);
    expect(weak.z).toBeGreaterThan(1.8); // rolled back down towards the tee
  });

  it("every hole can be sunk within the pick-up limit (robot golfer)", { timeout: 120_000 }, () => {
    for (const hole of COURSE) {
      const r = solveHole(hole, maxStrokes(hole.par));
      expect(r.strokes, hole.name).not.toBeNull();
      expect(r.strokes!, hole.name).toBeLessThanOrEqual(hole.par);
    }
  });

  it("names scores kindly", () => {
    expect(scoreName(1, 3)).toContain("HOLE IN ONE");
    expect(scoreName(3, 3)).toContain("Par");
    expect(scoreName(7, 3)).toContain("You did it");
  });
});

describe("Storybook Kingdom Golf (the second course)", () => {
  it("has 18 holes, every one with humps or hills, each sinkable within par by the robot golfer", { timeout: 240_000 }, () => {
    expect(KINGDOM).toHaveLength(18);
    for (const hole of KINGDOM) {
      expect((hole.mounds?.length ?? 0) + (hole.slopes?.length ?? 0), hole.name).toBeGreaterThan(0);
      const r = solveHole(hole, maxStrokes(hole.par));
      expect(r.strokes, hole.name).not.toBeNull();
      expect(r.strokes!, hole.name).toBeLessThanOrEqual(hole.par);
    }
  });

  it("a ball left on a hump rolls off it and comes to rest; the green is flat at the tee and never below the floor", () => {
    for (const hole of [...COURSE, ...KINGDOM]) {
      expect(greenHeight(hole, hole.tee.x, hole.tee.z), hole.name).toBeLessThan(0.02);
      for (const m of hole.mounds ?? []) {
        expect(greenHeight(hole, m.at.x, m.at.z), hole.name).toBeGreaterThan(0.2);
        const ball: BallState = { x: m.at.x + 0.2, z: m.at.z + 0.1, vx: 0, vz: 0 };
        let moving = true;
        let t = 0;
        for (let f = 0; f < 60 * 20 && moving; f++, t += 1 / 60) {
          const st = stepBall(ball, hole, 1 / 60, t);
          moving = st.moving && !st.sunk && !st.splash;
        }
        expect(moving, `${hole.name}: still rolling after 20 s`).toBe(false);
      }
    }
  });
});
