import { describe, expect, it } from "vitest";
import { COURSE } from "./courses";
import { pointInPolygon, scoreName, shoot, stepBall, type Ball } from "./physics";

function simulate(ball: Ball, holeIndex: number, maxSeconds = 20) {
  const hole = COURSE[holeIndex];
  let t = 0;
  while (t < maxSeconds) {
    const r = stepBall(ball, hole, 1 / 60, t);
    t += 1 / 60;
    if (r.sunk) return { sunk: true, t };
    if (!r.moving) return { sunk: false, t };
  }
  return { sunk: false, t };
}

describe("mini golf physics", () => {
  it("sinks a straight putt on hole 1 when aimed past the bumper", () => {
    const hole = COURSE[0];
    const ball: Ball = { x: -0.5, z: hole.tee.z, vx: 0, vz: 0 };
    shoot(ball, hole.cup.x - ball.x, hole.cup.z - ball.z, 0.5);
    expect(simulate(ball, 0).sunk).toBe(true);
  });

  it("never lets the ball leave the green, even on a full-power shot into a wall", () => {
    for (let i = 0; i < COURSE.length; i++) {
      const hole = COURSE[i];
      const ball: Ball = { x: hole.tee.x, z: hole.tee.z, vx: 0, vz: 0 };
      shoot(ball, 1, 0.3, 1);
      let t = 0;
      for (let f = 0; f < 600; f++, t += 1 / 60) {
        stepBall(ball, hole, 1 / 60, t);
        expect(pointInPolygon(ball, hole.outline)).toBe(true);
      }
    }
  });

  it("friction always brings the ball to rest", () => {
    const hole = COURSE[3];
    const ball: Ball = { x: 0, z: hole.tee.z, vx: 0, vz: 0 };
    shoot(ball, 0.2, 1, 1);
    const r = simulate(ball, 3, 30);
    expect(r.t).toBeLessThan(30);
  });

  it("sand slows the ball down more than grass", () => {
    const hole = COURSE[4];
    const onSand: Ball = { x: 0, z: 1.2, vx: 2, vz: 0 };
    const onGrass: Ball = { x: 0, z: 5, vx: 2, vz: 0 };
    stepBall(onSand, hole, 0.2, 0);
    stepBall(onGrass, hole, 0.2, 0);
    expect(Math.abs(onSand.vx)).toBeLessThan(Math.abs(onGrass.vx));
  });

  it("names scores kindly", () => {
    expect(scoreName(1, 3)).toContain("HOLE IN ONE");
    expect(scoreName(3, 3)).toContain("Par");
    expect(scoreName(7, 3)).toContain("You did it");
  });
});
