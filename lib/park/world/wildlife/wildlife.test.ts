import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { seaDist } from "../../registry/island";
import { nearRail, stationAt } from "../../registry/railway";
import { groundYFar, WATER_Y } from "../../registry/terrain";
import { wildWaterSdf } from "../../registry/wildWater";
import { WILD_FROM } from "../fantasy/wilds";
import { buildWildlife } from "./index";
import { birdCell, duckRafts, eagleAnchors, herdCell } from "./placement";
import { pushFromAnimal, stepBirdFlock, stepDuckRaft, stepEagle, stepLandHerd } from "./sim";
import { ST_FLEE, ST_REST, WILD_SPECIES_DEFS, type WHerd } from "./types";

const FAR = { x: 99999, z: 99999, speed: 0, dx: 0, dz: 1 };

/** every herd in a block of cells round the Wildlands' near edge and across the plains */
function scanHerds(): WHerd[] {
  const out: WHerd[] = [];
  for (let ci = -2; ci < 14; ci++) for (let cj = -16; cj < 6; cj++) out.push(...herdCell(ci, cj));
  return out;
}

describe("wildlife placement", () => {
  it("is deterministic (the same square gives the same herd every time)", () => {
    for (const [ci, cj] of [
      [3, -5],
      [6, -10],
      [1, -2],
      [10, -1],
    ]) {
      const a = JSON.stringify(herdCell(ci, cj));
      const b = JSON.stringify(herdCell(ci, cj));
      expect(a).toBe(b);
    }
  });

  it("puts herds only on dry Wildlands land, clear of the river/lake, the railway and the park", () => {
    const herds = scanHerds();
    expect(herds.length).toBeGreaterThan(8);
    for (const h of herds) {
      expect(Math.hypot(h.hx, h.hz)).toBeGreaterThan(WILD_FROM);
      expect(seaDist(h.hx, h.hz)).toBeLessThan(0);
      expect(wildWaterSdf(h.hx, h.hz)).toBeGreaterThan(0);
      expect(nearRail(h.hx, h.hz, 2)).toBe(false);
      expect(stationAt(h.hx, h.hz, 2)).toBeNull();
      expect(h.members.length).toBeGreaterThan(0);
    }
  });

  it("puts parrot flocks only in the rainforest canopy, on dry ground", () => {
    let found = 0;
    for (let ci = 8; ci < 24; ci++)
      for (let cj = -18; cj < -4; cj++) {
        for (const h of birdCell(ci, cj)) {
          found++;
          expect(wildWaterSdf(h.hx, h.hz)).toBeGreaterThan(0);
        }
      }
    expect(found).toBeGreaterThan(0);
  });

  it("gives the lake a handful of duck rafts and the ridge a couple of eagles", () => {
    const ducks = duckRafts();
    expect(ducks.length).toBeGreaterThan(2);
    for (const r of ducks) expect(wildWaterSdf(r.hx, r.hz)).toBeLessThan(0); // (rafts sit on the water)
    const eagles = eagleAnchors();
    expect(eagles.length).toBe(2);
    for (const e of eagles) expect(e.members.length).toBe(1);
  });
});

describe("wildlife simulation", () => {
  it("keeps every grazing animal's feet on the ground and close to home, by day and by night", () => {
    const herds = scanHerds().filter((h) => h.members.length > 0);
    expect(herds.length).toBeGreaterThan(0);
    for (const h of herds.slice(0, 12)) {
      const maxRange = h.hr + 18 + (h.shoreX !== null ? Math.hypot(h.shoreX - h.hx, (h.shoreZ ?? h.hz) - h.hz) : 0);
      for (let i = 0; i < 2400; i++) {
        const t = i * 0.5;
        const hour = (9 + (t / 600) * 24) % 24;
        stepLandHerd(h, 0.5, t, FAR, hour);
      }
      for (const a of h.members) {
        expect(a.y).toBeCloseTo(groundYFar(a.x, a.z), 5);
        expect(Math.hypot(a.x - h.hx, a.z - h.hz)).toBeLessThan(maxRange);
      }
    }
  });

  it("flees when the kid runs straight at a herd, and settles down again", () => {
    const herds = scanHerds().filter((h) => WILD_SPECIES_DEFS[h.species].fleeR > 0);
    expect(herds.length).toBeGreaterThan(0);
    const h = herds[0];
    const kid = { x: h.hx - 6, z: h.hz, speed: 6, dx: 1, dz: 0 };
    stepLandHerd(h, 0.1, 0, kid, 12);
    expect(h.state).toBe(ST_FLEE);
    for (let i = 0; i < 100; i++) stepLandHerd(h, 0.1, i * 0.1, FAR, 12);
    expect(h.state).not.toBe(ST_FLEE);
  });

  it("settles herds down to rest at night", () => {
    const h = scanHerds().find((x) => x.members.length > 0)!;
    for (let i = 0; i < 400; i++) stepLandHerd(h, 0.5, i * 0.5, FAR, 2); // 2am
    expect(h.state).toBe(ST_REST);
  });

  it("keeps ducks afloat on the lake's surface", () => {
    const rafts = duckRafts();
    for (const r of rafts) {
      for (let i = 0; i < 50; i++) stepDuckRaft(r, 0.1, i * 0.1);
      for (const a of r.members) expect(Math.abs(a.y - WATER_Y)).toBeLessThan(0.2);
    }
  });

  it("flits parrots between nearby perches and keeps eagles circling over the ridge", () => {
    let flock: WHerd | undefined;
    for (let ci = 8; ci < 24 && !flock; ci++) for (let cj = -18; cj < -4 && !flock; cj++) flock = birdCell(ci, cj)[0];
    expect(flock).toBeTruthy();
    const h = flock!;
    let sawFly = false;
    for (let i = 0; i < 400; i++) {
      stepBirdFlock(h, 0.1, i * 0.1);
      if (h.members.some((a) => a.wing > 1)) sawFly = true;
    }
    expect(sawFly).toBe(true);

    const eagles = eagleAnchors();
    const e = eagles[0];
    const ys: number[] = [];
    for (let i = 0; i < 200; i++) {
      stepEagle(e, 0.1, i * 0.1);
      ys.push(e.members[0].y);
    }
    expect(Math.min(...ys)).toBeGreaterThan(groundYFar(e.hx, e.hz) + 50);
    expect(Math.hypot(e.members[0].x - e.hx, e.members[0].z - e.hz)).toBeCloseTo(e.hr, 0);
  });
});

describe("wildlife pushKid", () => {
  it("pushes the kid clear of a large animal's body, and leaves it alone when it's already clear", () => {
    const pos = { x: 1.0, y: 5, z: 0 };
    const pushed = pushFromAnimal(pos, 0.4, 0, 0, 5, 1.2);
    expect(pushed).toBe(true);
    expect(Math.hypot(pos.x, pos.z)).toBeCloseTo(1.6, 3);
    const far = { x: 10, y: 5, z: 0 };
    expect(pushFromAnimal(far, 0.4, 0, 0, 5, 1.2)).toBe(false);
    expect(far.x).toBe(10);
  });
});

describe("wildlife budgets", () => {
  const spots: [number, number, number][] = [
    [WILD_FROM + 40, -40, 20],
    [700, -500, 60],
    [1400, -300, 20], // the Great Lake
    [1750, -400, 90], // the Lone Peak / Great Ridge
    [300, -250, 20], // just past the park's edge
  ];

  it("keeps the mesh count small (<= 8 draw calls) and the triangle count within budget, std and low", () => {
    for (const low of [false, true]) {
      const scene = new THREE.Scene();
      const w = buildWildlife(scene, { lowQuality: low });
      let maxTris = 0;
      let maxCalls = 0;
      for (const [x, z, y] of spots) {
        for (let i = 0; i < 3; i++) w.update(1 / 20, i * 0.05, { kid: new THREE.Vector3(x, y, z), glow: 0, hour: 12 });
        const s = w.stats();
        maxTris = Math.max(maxTris, s.triangles);
        maxCalls = Math.max(maxCalls, s.calls);
        expect(s.calls).toBeLessThanOrEqual(8);
      }
      expect(maxTris).toBeLessThanOrEqual(low ? 30000 : 60000);
      w.dispose();
    }
  });

  it("updates quickly with the kid roaming the Wildlands (sanity: well under a few ms on average)", () => {
    const scene = new THREE.Scene();
    const w = buildWildlife(scene);
    const t0 = performance.now();
    const N = 240;
    for (let i = 0; i < N; i++) {
      const x = 700 + Math.sin(i * 0.07) * 180;
      const z = -520 + Math.cos(i * 0.05) * 180;
      w.update(1 / 20, i * 0.05, { kid: new THREE.Vector3(x, 0, z), glow: 0, hour: 10 + (i % 24) });
    }
    const avg = (performance.now() - t0) / N;
    expect(avg).toBeLessThan(4);
    w.dispose();
  });
});
