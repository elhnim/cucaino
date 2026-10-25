import { describe, expect, it } from "vitest";
import { buildKartTrackShape, trackAt, WALL_MARGIN } from "./track";
import { BOOST_MAX_SPEED, GRASS_MAX_SPEED, KART_RADIUS, MAX_SPEED, cornerSpeed, gridStartState, initialKartState, isWrongWay, stepKart, turnRadius, type KartInput, type KartPhysState } from "./physics";

const track = buildKartTrackShape();
const id = (p: { x: number; z: number }) => p;
const DT = 1 / 60;
const NONE: KartInput = { steer: 0, brake: false };

/** a kart sitting on the centreline at distance s, pointing down the road */
function onRoad(s: number, speed = 0, lateral = 0): KartPhysState {
  const at = trackAt(track, s);
  const st = initialKartState(at.x + at.dz * lateral, at.z - at.dx * lateral, Math.atan2(at.dx, at.dz));
  st.speed = speed;
  st.sLocal = s;
  st.lapDist = s;
  st.distTotal = s;
  return st;
}
/** a simple driver: aim at the road a little way ahead (proportional steering, no brakes) */
function follow(s: KartPhysState): KartInput {
  const at = trackAt(track, s.sLocal + 8 + s.speed * 0.4);
  let d = Math.atan2(at.x - s.x, at.z - s.z) - s.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return { steer: Math.max(-1, Math.min(1, d * 2.5)), brake: false };
}
/** a small kid: reacts late, steers full-lock or not at all, never brakes */
function smallKid(react = 0.3) {
  const queue: { t: number; steer: number }[] = [];
  let cur = 0;
  return (s: KartPhysState, t: number): KartInput => {
    const at = trackAt(track, s.sLocal + 9 + s.speed * 0.35);
    let d = Math.atan2(at.x - s.x, at.z - s.z) - s.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    queue.push({ t: t + react, steer: Math.abs(d) < 0.16 ? 0 : Math.sign(d) });
    while (queue.length && queue[0].t <= t) cur = queue.shift()!.steer;
    return { steer: cur, brake: false };
  };
}

describe("kart physics: going and stopping", () => {
  it("goes by itself from a stop: quick off the line, up to (never past) top speed", () => {
    let s = onRoad(20);
    for (let i = 0; i < 60; i++) s = stepKart(s, NONE, track, DT);
    expect(s.speed).toBeGreaterThan(8); // a second in: properly moving
    s = onRoad(20);
    let top = 0;
    for (let i = 0; i < 60 * 3; i++) {
      s = stepKart({ ...s, x: trackAt(track, 20).x, z: trackAt(track, 20).z, sLocal: 20 }, NONE, track, DT); // (held on the straight)
      top = Math.max(top, s.speed);
    }
    expect(top).toBeGreaterThan(MAX_SPEED * 0.97);
    expect(top).toBeLessThanOrEqual(MAX_SPEED + 1e-6);
  });

  it("the brake stops it quickly, then backs it up slowly (to get out of a corner you nosed into)", () => {
    let s = onRoad(30, MAX_SPEED);
    let t = 0;
    while (s.speed > 0.01 && t < 3) {
      s = stepKart(s, { steer: 0, brake: true }, track, DT);
      t += DT;
    }
    expect(t).toBeLessThan(1.2);
    for (let i = 0; i < 90; i++) s = stepKart(s, { steer: 0, brake: true }, track, DT);
    expect(s.speed).toBeLessThan(-1);
    expect(s.speed).toBeGreaterThanOrEqual(-5.01);
    // letting go: it rolls forward again by itself
    for (let i = 0; i < 60; i++) s = stepKart(s, NONE, track, DT);
    expect(s.speed).toBeGreaterThan(3);
  });
});

describe("kart physics: steering", () => {
  it("eases in and out: a tap doesn't jerk the kart, a held input reaches full lock in under half a second", () => {
    let s = onRoad(20, 15);
    s = stepKart(s, { steer: 1, brake: false }, track, DT);
    expect(s.steer).toBeGreaterThan(0);
    expect(s.steer).toBeLessThan(0.15); // one frame in: barely turned
    for (let i = 0; i < 30; i++) s = stepKart(s, { steer: 1, brake: false }, track, DT);
    expect(s.steer).toBeCloseTo(1, 5);
    for (let i = 0; i < 20; i++) s = stepKart(s, NONE, track, DT);
    expect(Math.abs(s.steer)).toBeLessThan(0.05); // back to straight quickly when you let go
  });

  it("turns tighter when slow and wider when fast, and never spins on the spot", () => {
    expect(turnRadius(0)).toBeGreaterThan(4);
    expect(turnRadius(MAX_SPEED)).toBeGreaterThan(turnRadius(10) + 6);
    // the speed a bend of each radius can be taken at is consistent with that
    expect(turnRadius(cornerSpeed(14))).toBeCloseTo(14, 5);
    const stopped = stepKart(onRoad(20, 0), { steer: 1, brake: true }, track, DT);
    expect(Math.abs(stopped.yaw - onRoad(20).yaw)).toBeLessThan(0.01);
  });

  it("nothing invisible slows you: flat out and straight through a bend's zone the kart keeps its speed until it steers or leaves the road", () => {
    // straight down the main straight at top speed for a second: still at top speed
    let s = onRoad(10, MAX_SPEED);
    for (let i = 0; i < 60; i++) s = stepKart(s, NONE, track, DT);
    expect(s.speed).toBeGreaterThan(MAX_SPEED * 0.99);
  });

  it("turning hard scrubs speed off by itself (so steering alone gets you round the hairpin)", () => {
    let s = onRoad(10, MAX_SPEED);
    for (let i = 0; i < 90; i++) s = stepKart({ ...s, offTrack: false, x: trackAt(track, 10).x, z: trackAt(track, 10).z, sLocal: 10 }, { steer: 1, brake: false }, track, DT);
    expect(s.speed).toBeLessThan(MAX_SPEED * 0.8);
    expect(s.speed).toBeGreaterThan(11); // …but never to a crawl
  });
});

describe("kart physics: a kid can always get round", () => {
  it("a driver who just follows the road laps cleanly: no grass, no walls, no rescues, ~33 s a lap", () => {
    let s = gridStartState(track, id, 0);
    let t = 0;
    let grass = 0;
    let walls = 0;
    let rescues = 0;
    while (s.lap <= 2 && t < 120) {
      s = stepKart(s, follow(s), track, DT, [], { assist: 1 });
      t += DT;
      if (s.offTrack) grass += DT;
      if (s.wallHit > 0) walls++;
      if (s.rescued) rescues++;
    }
    expect(s.lap).toBe(3);
    expect(t).toBeGreaterThan(55);
    expect(t).toBeLessThan(80);
    expect(grass).toBeLessThan(1.5);
    expect(walls).toBe(0);
    expect(rescues).toBe(0);
  });

  it("a small kid (slow reactions, full-lock steering, never brakes) finishes 3 laps in under two minutes without a single rescue", () => {
    for (const react of [0.3, 0.45]) {
      const drive = smallKid(react);
      let s = gridStartState(track, id, 0);
      let t = 0;
      let rescues = 0;
      while (s.lap <= 3 && t < 200) {
        s = stepKart(s, drive(s, t), track, DT, [], { assist: 1 });
        t += DT;
        if (s.rescued) rescues++;
      }
      expect(s.lap, `react ${react}`).toBe(4);
      expect(t, `react ${react}`).toBeLessThan(135);
      expect(rescues, `react ${react}`).toBe(0);
    }
  });

  it("with no input at all the steering helper still gets the kart round a lap (it can't get stuck)", () => {
    let s = gridStartState(track, id, 0);
    let t = 0;
    while (s.lap <= 1 && t < 90) {
      s = stepKart(s, NONE, track, DT, [], { assist: 1 });
      t += DT;
    }
    expect(s.lap).toBe(2);
  });

  it("the helper never fights the kid: steering the same way it would is left alone, and it's off without `assist`", () => {
    const start = onRoad(20, 15, 3.5); // near the right-hand kerb, pointing straight
    start.yaw += 0.25; // …and drifting further right
    const helped = stepKart(start, NONE, track, DT, [], { assist: 1 });
    const alone = stepKart(start, NONE, track, DT, [], {});
    expect(helped.yaw).toBeLessThan(alone.yaw); // eased back left, toward the road's direction
    expect(alone.yaw).toBeCloseTo(start.yaw, 6); // no assist: untouched
  });
});

describe("kart physics: grass, walls, bumps, boosts", () => {
  it("the grass is slow, not a trap", () => {
    const at = trackAt(track, 20);
    let s = initialKartState(at.x + at.dz * (track.width / 2 + 1.2), at.z - at.dx * (track.width / 2 + 1.2), Math.atan2(at.dx, at.dz));
    s.speed = MAX_SPEED;
    s.sLocal = 20;
    for (let i = 0; i < 90; i++) s = stepKart(s, NONE, track, DT);
    expect(s.offTrack).toBe(true);
    expect(s.speed).toBeLessThanOrEqual(GRASS_MAX_SPEED + 0.01);
    expect(s.speed).toBeGreaterThan(GRASS_MAX_SPEED * 0.8); // still rolling along
    expect(s.rescued).toBe(false);
  });

  it("the tyre wall can't be passed; a glancing touch costs little, a head-on hit about half, and the kart slides along it", () => {
    const at = trackAt(track, 25);
    const wall = track.width / 2 + WALL_MARGIN;
    const base = Math.atan2(at.dx, at.dz);
    const drive = (angle: number) => {
      let s = initialKartState(at.x + at.dz * (wall - 0.3), at.z - at.dx * (wall - 0.3), base + angle);
      s.speed = 12;
      s.sLocal = 25;
      const v0 = s.speed;
      let hit = 0;
      let maxLat = 0;
      for (let i = 0; i < 40; i++) {
        s = stepKart(s, { steer: 0, brake: false }, track, DT);
        hit = Math.max(hit, s.wallHit);
        maxLat = Math.max(maxLat, Math.abs(s.lateral));
      }
      return { s, hit, maxLat, v0 };
    };
    const glance = drive(0.15);
    const square = drive(1.3);
    expect(glance.maxLat).toBeLessThanOrEqual(wall + 0.05);
    expect(square.maxLat).toBeLessThanOrEqual(wall + 0.05);
    expect(glance.hit).toBeGreaterThan(0);
    expect(square.hit).toBeGreaterThan(glance.hit);
    // after the hit both are running roughly along the wall, still moving
    for (const r of [glance, square]) {
      let d = r.s.yaw - base;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      expect(Math.abs(d)).toBeLessThan(0.6);
      expect(r.s.speed).toBeGreaterThan(3);
    }
  });

  it("a kart that's properly stuck off the road for a few seconds is put back on it, pointing the right way", () => {
    const at = trackAt(track, 40);
    // (out on the grass against the right-hand tyre wall, with the steering held INTO the wall)
    let s = initialKartState(at.x + at.dz * 7.5, at.z - at.dx * 7.5, Math.atan2(at.dx, at.dz) + 0.5);
    s.sLocal = 40;
    let rescued = false;
    for (let i = 0; i < 60 * 5 && !rescued; i++) {
      s = stepKart(s, { steer: 1, brake: false }, track, DT);
      rescued = s.rescued;
    }
    expect(rescued).toBe(true);
    expect(Math.abs(s.lateral)).toBeLessThan(0.5);
    expect(s.speed).toBeGreaterThan(3);
  });

  it("a boost pad gives one shove per pass (not one every frame), and the extra speed fades", () => {
    const pad = track.boostPads[0];
    let s = onRoad(pad.s - 12, MAX_SPEED);
    let top = 0;
    let boosts = 0;
    let was = false;
    for (let i = 0; i < 60 * 4; i++) {
      s = stepKart(s, NONE, track, DT);
      top = Math.max(top, s.speed);
      if (s.boostT > 0 && !was) boosts++;
      was = s.boostT > 0;
    }
    expect(boosts).toBe(1);
    expect(top).toBeGreaterThan(MAX_SPEED + 4);
    expect(top).toBeLessThanOrEqual(BOOST_MAX_SPEED + 1e-6);
    expect(s.speed).toBeLessThanOrEqual(MAX_SPEED + 0.5); // faded back
  });

  it("bumps apart from another kart instead of driving through it", () => {
    const a = onRoad(20, 10);
    const other = { x: a.x + Math.sin(a.yaw) * (KART_RADIUS * 1.2), z: a.z + Math.cos(a.yaw) * (KART_RADIUS * 1.2) };
    let s = a;
    for (let i = 0; i < 10; i++) s = stepKart(s, NONE, track, DT, [other]);
    expect(Math.hypot(s.x - other.x, s.z - other.z)).toBeGreaterThan(KART_RADIUS * 1.6);
  });
});

describe("kart physics: laps can't be fooled", () => {
  it("starting behind the line and crossing it is NOT a lap", () => {
    let s = gridStartState(track, id, 3);
    expect(s.lapDist).toBeLessThan(0);
    for (let i = 0; i < 60 * 3; i++) s = stepKart(s, follow(s), track, DT);
    expect(s.sLocal).toBeGreaterThan(20); // well past the line
    expect(s.lap).toBe(1);
  });

  it("driving straight off into the infield never hands out a lap (the bug that gave 'Lap 3/3' in five seconds)", () => {
    for (let slot = 0; slot < 4; slot++) {
      let s = gridStartState(track, id, slot);
      for (let i = 0; i < 60 * 30; i++) s = stepKart(s, { steer: slot % 2 ? 0.4 : -0.4, brake: false }, track, DT);
      expect(s.lap, `slot ${slot}`).toBe(1);
    }
  });

  it("a rescue never moves you forward round the lap, and reversing over the line doesn't count", () => {
    let s = onRoad(4, 0);
    s.lapDist = 4;
    for (let i = 0; i < 60 * 4; i++) s = stepKart(s, { steer: 0, brake: true }, track, DT); // back up over the line
    expect(s.lap).toBe(1);
    expect(s.lapDist).toBeLessThan(4);
    for (let i = 0; i < 60 * 3; i++) s = stepKart(s, follow(s), track, DT); // …and forward again
    expect(s.lap).toBe(1);
  });

  it("a real lap counts exactly once, and distTotal only rises by really driving", () => {
    let s = gridStartState(track, id, 0);
    let laps = 0;
    let last = s.distTotal;
    let t = 0;
    let lap = s.lap;
    while (t < 100 && laps < 2) {
      s = stepKart(s, follow(s), track, DT, [], { assist: 1 });
      t += DT;
      expect(s.distTotal - last).toBeLessThan(1.5); // never a jump (a tick is ~0.5 m; a little more on the inside of a tight bend)
      last = s.distTotal;
      if (s.lap !== lap) {
        laps++;
        lap = s.lap;
      }
    }
    expect(laps).toBe(2);
  });

  it("notices the wrong way round, and turns a kart that keeps going the wrong way back round", () => {
    let s = onRoad(30, 8);
    s.yaw += Math.PI; // facing backwards
    let flagged = false;
    let rescued = false;
    for (let i = 0; i < 60 * 5 && !rescued; i++) {
      s = stepKart(s, NONE, track, DT);
      flagged = flagged || isWrongWay(s);
      rescued = s.rescued;
    }
    expect(flagged).toBe(true);
    expect(rescued).toBe(true);
    expect(s.lap).toBe(1);
  });
});

describe("kart physics: determinism", () => {
  it("the same state/input/dt sequence always gives the same result", () => {
    const run = () => {
      let s = gridStartState(track, id, 1);
      for (let i = 0; i < 600; i++) s = stepKart(s, { steer: Math.sin(i * 0.05), brake: i % 97 < 6 }, track, DT, [{ x: 5, z: -38 }], { assist: 1 });
      return s;
    };
    expect(run()).toEqual(run());
  });
});
