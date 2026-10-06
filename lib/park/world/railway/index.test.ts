import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildRailway } from "./index";

describe("railway: a called train", () => {
  const run = (rw: ReturnType<typeof buildRailway>, seconds: number, until?: () => boolean) => {
    const focus = new THREE.Vector3(1e6, 0, 1e6);
    for (let t = 0; t < seconds; t += 0.05) {
      rw.update(0.05, t, focus);
      if (until?.()) return true;
    }
    return false;
  };

  it("called while it already stands at the platform, it still leaves once the kid is aboard", () => {
    const rw = buildRailway(new THREE.Scene(), { lowQuality: true });
    expect(run(rw, 600, () => !!rw.train.at)).toBe(true);
    const st = rw.train.at!;
    rw.call(st); // "Ride the train" with the train already here
    expect(run(rw, 60, () => !rw.train.at), "a called train waits for the kid").toBe(false);
    rw.release(); // aboard
    expect(run(rw, 60, () => !rw.train.at), "the train never left").toBe(true);
  });

  it("called from far off, it comes in, waits, and leaves after the kid boards", () => {
    const rw = buildRailway(new THREE.Scene(), { lowQuality: true });
    expect(run(rw, 600, () => !!rw.train.at)).toBe(true);
    const here = rw.train.at!;
    run(rw, 60, () => !rw.train.at);
    rw.call(here); // it has just left: it must come all the way round (or be brought round)
    expect(run(rw, 900, () => rw.train.at === here)).toBe(true);
    rw.release();
    expect(run(rw, 60, () => !rw.train.at)).toBe(true);
  });
});
