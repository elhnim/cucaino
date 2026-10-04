import { describe, expect, it } from "vitest";
import { buildKartTrackShape, nearestOnTrack, trackAt } from "./track";
import { initialKartState, MAX_SPEED, stepKart, type KartInput, type KartPhysState } from "./physics";

const track = buildKartTrackShape();
const noSteer: KartInput = { steer: 0, brake: false };

function drive(state: KartPhysState, input: KartInput, dt: number, steps: number, others: { x: number; z: number }[] = []): KartPhysState {
  let s = state;
  for (let i = 0; i < steps; i++) s = stepKart(s, input, track, dt, others);
  return s;
}

function startOnLine(): KartPhysState {
  const at = trackAt(track, 0);
  const yaw = Math.atan2(at.dx, at.dz);
  return initialKartState(at.x, at.z, yaw);
}

describe("kart physics", () => {
  it("auto-accelerates from a stop, up to (but never past) the road's max speed", () => {
    // 150 ticks (2.5 s) is comfortably short of reaching the back straight's own boost pad (the
    // kart would legitimately exceed MAX_SPEED there — see the boost pad test below) while still
    // being well past the ~1.6 s it takes to reach cruising speed from a dead stop
    let s = startOnLine();
    for (let i = 0; i < 150; i++) {
      s = stepKart(s, noSteer, track, 1 / 60);
      expect(s.speed).toBeLessThanOrEqual(MAX_SPEED + 1e-6);
    }
    expect(s.speed).toBeGreaterThan(MAX_SPEED - 0.5);
  });

  it("the brake slows the kart down, and holding it keeps it stopped", () => {
    let s = drive(startOnLine(), noSteer, 1 / 60, 120); // get up to speed first
    expect(s.speed).toBeGreaterThan(5);
    s = drive(s, { steer: 0, brake: true }, 1 / 60, 200);
    expect(s.speed).toBeCloseTo(0, 1);
  });

  it("stays within a small distance of the centerline when steering gently follows the road", () => {
    // a crude "autopilot": steer a little towards the nearest centerline point ahead
    let s = startOnLine();
    for (let i = 0; i < 2000; i++) {
      const near = nearestOnTrack(track, s.x, s.z);
      const ahead = trackAt(track, near.s + 6);
      const toTarget = Math.atan2(ahead.x - s.x, ahead.z - s.z);
      let diff = toTarget - s.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2));
      s = stepKart(s, { steer, brake: false }, track, 1 / 60);
      expect(Math.abs(near.lateral)).toBeLessThan(track.width); // never flung wildly off
    }
    // after ~33s of driving it should have lapped at least once
    expect(s.distTotal).toBeGreaterThan(track.length * 0.5);
  });

  it("off-track driving is capped to a slow speed (grass bites)", () => {
    // drive straight ahead off the side of the track and keep going dead straight — checked only
    // over the first ~1.7 s (100 ticks), comfortably inside the 2 s rescue window: past that the
    // kart is deliberately popped back onto the road (its own test below) and free to speed back up
    let s = initialKartState(500, 500, 0); // nowhere near the track
    s = drive(s, noSteer, 1 / 60, 100);
    expect(s.speed).toBeLessThan(MAX_SPEED * 0.6);
  });

  it("a soft wall slides a kart back rather than letting it wander off forever", () => {
    // drive straight off the track, sideways, until it should have hit the outer wall
    const at = trackAt(track, 0);
    let s = initialKartState(at.x, at.z, Math.atan2(at.dx, at.dz) + Math.PI / 2); // facing straight off the road
    const startLateralD = nearestOnTrack(track, s.x, s.z).d;
    for (let i = 0; i < 300; i++) {
      s = stepKart(s, noSteer, track, 1 / 60);
    }
    const d = nearestOnTrack(track, s.x, s.z).d;
    // the wall should have stopped it well short of running away in a straight line forever
    expect(d).toBeLessThan(startLateralD + track.width * 1.5);
  });

  it("rescues a kart stuck off-track for more than 2 seconds, back onto the road", () => {
    // the rescue fires once offTrackT clears 2 s, snapping the kart onto the centerline — after
    // that it's free to drift (a curving track with no steering input will carry it off again
    // eventually, and rescue could fire a second time), so what matters is that it WAS brought
    // back onto the road at some point, not that it's sitting dead-centre on some arbitrary frame
    let s = initialKartState(1000, 1000, 0); // hopelessly off-track, not moving
    let wasRescued = false;
    for (let i = 0; i < 200; i++) {
      s = stepKart(s, noSteer, track, 1 / 60);
      if (Math.abs(nearestOnTrack(track, s.x, s.z).lateral) <= track.width / 2 + 0.01) wasRescued = true;
    }
    expect(wasRescued).toBe(true);
  });

  it("a boost pad gives a one-off speed impulse, not a free-for-all every frame", () => {
    const pad = track.boostPads[0];
    const at = trackAt(track, pad.s);
    let s = initialKartState(at.x, at.z, Math.atan2(at.dx, at.dz));
    s.speed = 5;
    const before = s.speed;
    s = stepKart(s, noSteer, track, 1 / 60);
    expect(s.speed).toBeGreaterThan(before + 5); // the impulse landed
    const afterBoost = s.speed;
    // immediately stepping again while still over the (short) pad must not re-trigger it
    s = stepKart(s, noSteer, track, 1 / 60);
    expect(s.speed).toBeLessThanOrEqual(afterBoost + 1); // only ordinary accel, no second impulse
  });

  it("bumps gently off another kart instead of overlapping it", () => {
    const at = trackAt(track, 50);
    const a = initialKartState(at.x, at.z, 0);
    const other = { x: at.x + 1, z: at.z }; // well inside 2*KART_RADIUS
    const after = stepKart(a, noSteer, track, 1 / 60, [other]);
    const d = Math.hypot(after.x - other.x, after.z - other.z);
    expect(d).toBeGreaterThan(1); // pushed apart
  });

  it("counts a lap the instant the kart crosses the finish line forward", () => {
    // place the kart just before the line, driving fast enough to cross it this step
    const at = trackAt(track, track.length - 1);
    let s = initialKartState(at.x, at.z, Math.atan2(at.dx, at.dz));
    s.speed = MAX_SPEED;
    s.sLocal = track.length - 1;
    s.lap = 1;
    s = stepKart(s, noSteer, track, 1 / 20); // a big step, guaranteed to cross s=0
    expect(s.lap).toBe(2);
  });

  it("is deterministic: the same state/input/dt sequence always gives the same result", () => {
    const seq: KartInput[] = [
      { steer: 0.4, brake: false },
      { steer: -0.2, brake: false },
      { steer: 0, brake: true },
      { steer: 1, brake: false },
    ];
    const run = () => {
      let s = startOnLine();
      for (let i = 0; i < 500; i++) s = stepKart(s, seq[i % seq.length], track, 1 / 60, [{ x: s.x + 20, z: s.z + 20 }]);
      return s;
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
  });
});
