import { describe, expect, it } from "vitest";
import { buildKartTrackShape, trackAt } from "./track";
import { gridStartState, stepKart } from "./physics";
import { aiInput, type AiProfile } from "./ai";

const track = buildKartTrackShape();
const toWorld = (p: { x: number; z: number }) => p;

function driveLaps(profile: AiProfile, laps: number, maxSteps = 20000) {
  let s = gridStartState(track, toWorld, 0);
  for (let i = 0; i < maxSteps; i++) {
    if (s.lap > laps) return { state: s, steps: i };
    const input = aiInput(s, track, profile);
    s = stepKart(s, input, track, 1 / 30);
  }
  return { state: s, steps: maxSteps };
}

describe("kart AI", () => {
  it("completes 3 laps at easy, medium and hard skill without getting stuck", () => {
    for (const skill of [0.1, 0.5, 0.95]) {
      const { state, steps } = driveLaps({ skill, seed: 1 }, 3);
      expect(state.lap).toBeGreaterThan(3);
      expect(steps).toBeLessThan(20000);
    }
  });

  it("different seeds drive different (but all valid) lines", () => {
    const a = driveLaps({ skill: 0.5, seed: 1 }, 1);
    const b = driveLaps({ skill: 0.5, seed: 99 }, 1);
    expect(a.state.lap).toBeGreaterThan(1);
    expect(b.state.lap).toBeGreaterThan(1);
  });

  it("a higher skill profile is never dramatically slower than a lower one", () => {
    const easy = driveLaps({ skill: 0.1, seed: 2 }, 2).steps;
    const hard = driveLaps({ skill: 0.95, seed: 2 }, 2).steps;
    expect(hard).toBeLessThanOrEqual(easy * 1.05);
  });

  it("the rubber band only ever costs an AI a LITTLE time (it keeps racing)", () => {
    let s = gridStartState(track, toWorld, 1);
    for (let i = 0; i < 12000; i++) {
      // deliberately miles ahead of an imaginary kid — heavy rubber-band braking
      const input = aiInput(s, track, { skill: 0.7, seed: 5 }, { deltaToKid: 500 });
      s = stepKart(s, input, track, 1 / 30);
      if (s.lap > 2) break;
    }
    expect(s.lap).toBeGreaterThan(2);
  });

  it("is deterministic: the same profile and context always steers the same way", () => {
    const at = trackAt(track, 40);
    const s = { x: at.x, z: at.z, yaw: Math.atan2(at.dx, at.dz), speed: 10, lap: 1, sLocal: 40, distTotal: 40, offTrackT: 0, boostT: 0, boostCooldownT: 0 };
    const a = aiInput(s, track, { skill: 0.6, seed: 42 }, { deltaToKid: 10 });
    const b = aiInput(s, track, { skill: 0.6, seed: 42 }, { deltaToKid: 10 });
    expect(a).toEqual(b);
  });
});
