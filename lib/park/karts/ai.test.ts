import { describe, expect, it } from "vitest";
import { buildKartTrackShape, trackAt } from "./track";
import { gridStartState, stepKart, type KartInput, type KartPhysState } from "./physics";
import { aiInput, aiPower, type AiProfile } from "./ai";

const track = buildKartTrackShape();
const id = (p: { x: number; z: number }) => p;
const DT = 1 / 60;

function race(profile: AiProfile, laps: number, power = aiPower(profile)) {
  let s = gridStartState(track, id, 0);
  let t = 0;
  let grass = 0;
  let walls = 0;
  let rescues = 0;
  while (s.lap <= laps && t < 300) {
    s = stepKart(s, aiInput(s, track, profile), track, DT, [], { power });
    t += DT;
    if (s.offTrack) grass += DT;
    if (s.wallHit > 0.05) walls++;
    if (s.rescued) rescues++;
  }
  return { s, t, grass, walls, rescues };
}

describe("kart AI", () => {
  it("drives 3 clean laps at easy, medium and hard: on the road, off the walls, never rescued", () => {
    for (const skill of [0.3, 0.55, 0.8, 1]) {
      const r = race({ skill, seed: 11 }, 3);
      expect(r.s.lap, `skill ${skill}`).toBe(4);
      expect(r.grass, `skill ${skill}`).toBeLessThan(2.5);
      expect(r.walls, `skill ${skill}`).toBe(0);
      expect(r.rescues, `skill ${skill}`).toBe(0);
    }
  });

  it("a better driver is quicker, and all of them are a touch slower than a kid who drives well (the kid's kart is the fastest)", () => {
    const easy = race({ skill: 0.3, seed: 11 }, 3).t;
    const medium = race({ skill: 0.55, seed: 29 }, 3).t;
    const hard = race({ skill: 0.8, seed: 47 }, 3).t;
    expect(medium).toBeLessThan(easy);
    expect(hard).toBeLessThan(medium);
    expect(easy - hard).toBeGreaterThan(2);
    expect(easy - hard).toBeLessThan(14);
    // the same best driver in the kid's own full-power kart beats them all
    const best = race({ skill: 1, seed: 3 }, 3, 1).t;
    expect(best).toBeLessThan(hard);
    // …and a race is a bit under two minutes
    expect(hard).toBeGreaterThan(85);
    expect(easy).toBeLessThan(125);
  });

  it("different drivers pick different lines across the road", () => {
    const lat = (seed: number) => {
      let s = gridStartState(track, id, 0);
      for (let i = 0; i < 60 * 6; i++) s = stepKart(s, aiInput(s, track, { skill: 0.6, seed }), track, DT, [], { power: 0.9 });
      return s.lateral;
    };
    const lats = [11, 29, 47, 5, 90].map(lat);
    expect(Math.max(...lats) - Math.min(...lats)).toBeGreaterThan(1.2);
  });

  it("steers round a kart that's just ahead in its lane", () => {
    const s = gridStartState(track, id, 0);
    const moving: KartPhysState = { ...s, speed: 14 };
    const fx = Math.sin(s.yaw);
    const fz = Math.cos(s.yaw);
    const clear = aiInput(moving, track, { skill: 0.6, seed: 4 });
    const blocked = aiInput(moving, track, { skill: 0.6, seed: 4 }, { deltaToKid: 0, others: [{ x: s.x + fx * 5 + fz * 0.6, z: s.z + fz * 5 - fx * 0.6 }] });
    // the kart ahead sits a little to our right: we steer further left than we otherwise would
    expect(blocked.steer).toBeLessThan(clear.steer);
  });

  it("the rubber band keeps the race close: well ahead of the kid it eases off, well behind it tries harder — by a little", () => {
    const p: AiProfile = { skill: 0.55, seed: 29 };
    const level = aiPower(p, { deltaToKid: 0 });
    const ahead = aiPower(p, { deltaToKid: 120 });
    const behind = aiPower(p, { deltaToKid: -150 });
    expect(ahead).toBeLessThan(level);
    expect(behind).toBeGreaterThan(level);
    expect(level - ahead).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(behind - level).toBeLessThanOrEqual(0.06 + 1e-9);
    // never faster than the kid's own kart
    expect(aiPower({ skill: 1, seed: 1 }, { deltaToKid: -999 })).toBeLessThanOrEqual(1);
  });

  it("brakes for the hairpin (arrives at a speed the kart can turn at) and is flat out on the straight", () => {
    const profile: AiProfile = { skill: 0.8, seed: 47 };
    let s = gridStartState(track, id, 0);
    let minInHairpin = Infinity;
    let maxOnStraight = 0;
    const hairpin = track.corners.find((c) => c.kind === "hairpin")!;
    let t = 0;
    while (s.lap <= 2 && t < 120) {
      s = stepKart(s, aiInput(s, track, profile), track, DT, [], { power: aiPower(profile) });
      t += DT;
      if (s.lap === 2) {
        if (s.sLocal > hairpin.s0 && s.sLocal < hairpin.s1) minInHairpin = Math.min(minInHairpin, s.speed);
        if (s.sLocal > 15 && s.sLocal < 60) maxOnStraight = Math.max(maxOnStraight, s.speed);
      }
    }
    expect(minInHairpin).toBeLessThan(17);
    expect(minInHairpin).toBeGreaterThan(8);
    expect(maxOnStraight).toBeGreaterThan(20);
  });

  it("is deterministic: the same state, profile and context always gives the same input", () => {
    const s = { ...gridStartState(track, id, 2), speed: 12 };
    const a: KartInput = aiInput(s, track, { skill: 0.5, seed: 9 }, { deltaToKid: 30 });
    const b: KartInput = aiInput(s, track, { skill: 0.5, seed: 9 }, { deltaToKid: 30 });
    expect(a).toEqual(b);
    void trackAt;
  });
});
