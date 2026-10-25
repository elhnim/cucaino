import { describe, expect, it } from "vitest";
import { buildKartTrackShape, nearestOnTrack, onBoostPad, TRACK_WIDTH } from "./track";
import { BOOST_MAX_SPEED, initialKartState } from "./physics";
import {
  addCoin,
  airHeight,
  applyShove,
  bananaDrop,
  buildKartCourse,
  canUseItem,
  crossedRamp,
  driftTier,
  funPower,
  hitKart,
  inAir,
  KART_ITEMS,
  MAX_COINS,
  newKartFun,
  rollItem,
  stepDrift,
  takeBox,
  takeOff,
  tickFun,
  useItem,
} from "./items";

const track = buildKartTrackShape();
const course = buildKartCourse(track);

describe("kart course (boxes, coins, the ramp)", () => {
  it("every box and coin sits on the road, clear of the kerbs", () => {
    for (const p of [...course.boxes, ...course.coins]) {
      const n = nearestOnTrack(track, p.x, p.z);
      expect(Math.abs(n.lateral)).toBeLessThan(TRACK_WIDTH / 2 - 1);
      expect(Math.abs(n.lateral - p.lateral)).toBeLessThan(0.6);
    }
  });
  it("four rows of four boxes, spread across the road and round the lap", () => {
    expect(course.boxes.length).toBe(16);
    const rows = [...new Set(course.boxes.map((b) => Math.round(b.s)))];
    expect(rows.length).toBe(4);
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) expect(Math.abs(rows[i] - rows[j])).toBeGreaterThan(100);
  });
  it("nothing sits on a boost pad or on the ramp, and no two things overlap", () => {
    const all = [...course.boxes, ...course.coins];
    for (const p of all) {
      expect(onBoostPad(track, p.s, p.lateral)).toBe(false);
      expect(Math.abs(p.s - course.ramp.s)).toBeGreaterThan(20);
    }
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z)).toBeGreaterThan(2);
  });
  it("the ramp is on the main straight, before the first boost pad", () => {
    expect(course.ramp.s).toBeGreaterThan(8);
    expect(course.ramp.s).toBeLessThan(track.boostPads[0].s - 12);
  });
});

describe("items", () => {
  it("the leader never gets a star; last place mostly gets rockets and stars", () => {
    const count = (pos: number) => {
      const c: Record<string, number> = { rocket: 0, banana: 0, shield: 0, star: 0 };
      for (let i = 0; i < 1000; i++) c[rollItem(pos, 4, (i + 0.5) / 1000)]++;
      return c;
    };
    const first = count(1);
    const last = count(4);
    expect(first.star).toBe(0);
    expect(first.banana + first.shield).toBeGreaterThan(700);
    expect(last.rocket + last.star).toBeGreaterThan(700);
    for (const it of KART_ITEMS) expect(count(2)[it]).toBeGreaterThan(50);
  });
  it("a box item rolls for a moment before it can be used, and a second box doesn't replace it", () => {
    let f = takeBox(newKartFun(), "rocket");
    expect(canUseItem(f)).toBe(false);
    f = takeBox(f, "star");
    expect(f.held).toBe("rocket");
    for (let i = 0; i < 80; i++) f = tickFun(f, 1 / 60);
    expect(canUseItem(f)).toBe(true);
    const used = useItem(f);
    expect(used.item).toBe("rocket");
    expect(used.fun.held).toBe(null);
    expect(useItem(used.fun).item).toBe(null);
  });
  it("coins make the kart a little faster, up to ten; a spin drops three", () => {
    let f = newKartFun();
    expect(funPower(f)).toBe(1);
    for (let i = 0; i < 14; i++) f = addCoin(f);
    expect(f.coins).toBe(MAX_COINS);
    expect(funPower(f)).toBeGreaterThan(1.04);
    expect(funPower(f)).toBeLessThan(1.08);
    const hit = hitKart(f);
    expect(hit.result).toBe("spin");
    expect(hit.fun.coins).toBe(MAX_COINS - 3);
    expect(funPower(hit.fun)).toBeLessThan(0.5);
  });
  it("a bubble swallows one hit; a star shrugs every hit off; a spun kart can't be hit again straight away", () => {
    let f = useItem({ ...newKartFun(), held: "shield" }).fun;
    expect(f.shieldT).toBeGreaterThan(5);
    const a = hitKart(f);
    expect(a.result).toBe("shield");
    expect(a.fun.shieldT).toBe(0);
    f = useItem({ ...newKartFun(), held: "star" }).fun;
    expect(hitKart(f).result).toBe("none");
    expect(funPower(f)).toBeGreaterThan(1.1);
    const spun = hitKart(newKartFun()).fun;
    expect(hitKart(spun).result).toBe("none");
    let later = spun;
    for (let i = 0; i < 60 * 3; i++) later = tickFun(later, 1 / 60);
    expect(later.spinT).toBe(0);
    expect(hitKart(later).result).toBe("spin");
  });
  it("a banana lands behind the kart, and the kart that dropped it is safe for a moment", () => {
    const b = bananaDrop({ x: 10, z: 20, yaw: 0 });
    expect(b.z).toBeLessThan(18);
    expect(b.x).toBeCloseTo(10);
    const used = useItem({ ...newKartFun(), held: "banana" });
    expect(used.item).toBe("banana");
    expect(hitKart(used.fun).result).toBe("none");
  });
  it("a shove adds speed and boost time but never past the boost top speed", () => {
    const k = { ...initialKartState(0, 0, 0), speed: 28 };
    const s = applyShove(k, 11, 2.3);
    expect(s.speed).toBe(BOOST_MAX_SPEED);
    expect(s.boostT).toBe(2.3);
    expect(applyShove({ ...k, boostT: 3 }, 1, 0.5).boostT).toBe(3);
  });
});

describe("drift boost", () => {
  const hold = (seconds: number, steer = 1, speed = 18) => {
    let f = newKartFun();
    for (let i = 0; i < seconds * 60; i++) f = stepDrift(f, steer, speed, false, 1 / 60).fun;
    return f;
  };
  it("holding a turn builds blue then orange sparks; letting go cashes them in", () => {
    expect(driftTier(hold(0.5))).toBe(0);
    expect(driftTier(hold(1.2))).toBe(1);
    expect(driftTier(hold(2.2))).toBe(2);
    expect(stepDrift(hold(0.5), 0, 18, false, 1 / 60).released).toBe(0);
    expect(stepDrift(hold(1.2), 0, 18, false, 1 / 60).released).toBe(1);
    const r = stepDrift(hold(2.2), 0, 18, false, 1 / 60);
    expect(r.released).toBe(2);
    expect(r.fun.driftT).toBe(0);
    expect(stepDrift(r.fun, 0, 18, false, 1 / 60).released).toBe(0);
  });
  it("flicking the other way cashes it in too; going slowly or on the grass loses it", () => {
    expect(stepDrift(hold(1.2), -1, 18, false, 1 / 60).released).toBe(1);
    expect(stepDrift(hold(2.2), 1, 5, false, 1 / 60).released).toBe(0);
    expect(stepDrift(hold(2.2), 1, 5, false, 1 / 60).fun.driftT).toBe(0);
    expect(stepDrift(hold(2.2), 1, 18, true, 1 / 60).fun.driftT).toBe(0);
    expect(driftTier(hold(3, 0.3))).toBe(0); // a gentle steer isn't a drift
  });
});

describe("the jump", () => {
  it("a kart crossing the lip fast enough takes off; a slow or reversing one doesn't", () => {
    const s = course.ramp.s;
    expect(crossedRamp(course, track.length, s - 0.2, s + 0.2, 20)).toBe(true);
    expect(crossedRamp(course, track.length, s - 0.2, s + 0.2, 5)).toBe(false);
    expect(crossedRamp(course, track.length, s + 0.2, s - 0.2, 20)).toBe(false);
    expect(crossedRamp(course, track.length, s + 1, s + 1.4, 20)).toBe(false);
    expect(crossedRamp(course, track.length, s - 3, s - 2.6, 20)).toBe(false);
  });
  it("flies in an arc and comes back down; faster = higher and longer", () => {
    let f = takeOff(newKartFun(), 24);
    expect(inAir(f)).toBe(true);
    let peak = 0;
    let t = 0;
    while (inAir(f) && t < 3) {
      peak = Math.max(peak, airHeight(f));
      f = tickFun(f, 1 / 60);
      t += 1 / 60;
    }
    expect(airHeight(f)).toBe(0);
    expect(peak).toBeGreaterThan(1.2);
    expect(peak).toBeLessThan(2.4);
    expect(t).toBeGreaterThan(0.6);
    expect(t).toBeLessThan(1.1);
    expect(takeOff(newKartFun(), 12).airH).toBeLessThan(takeOff(newKartFun(), 24).airH);
  });
});
