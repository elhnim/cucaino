import { describe, expect, it } from "vitest";
import {
  CHICK,
  EMPEROR,
  LITTLE,
  ROLE_CHICK,
  S_ASCEND,
  S_FISH,
  S_HOME,
  S_HOP,
  S_HUDDLE,
  S_QUEUE,
  S_SLIDE,
  S_SLIP,
  S_SWIM,
  S_WALKHOME,
  STATE_NAMES,
  PENGUIN_K,
  PENGUIN_TRUE_M,
  makeColony,
  penguinRoot,
  stepColony,
  type Colony,
} from "./colony";
import { BEAST_K, makeWildlife, stepWildlife, SEAL_LOUNGE, SEAL_SWIM } from "./wildlife";
import { PENGUIN_RIG } from "./critters";
import { FROST_ISLAND, FROST_SEA_R, FROST_SLIDES, FROST_WATER_Y, SLIDE_HALF, frostGroundY, frostLandY, frostSeaFloorY } from "../../registry/frostIsland";

const dt = 1 / 30;
const WY = FROST_WATER_Y;

function run(col: Colony, secs: number, each?: (t: number) => void, t0 = 0) {
  let t = t0;
  for (let k = 0; k < secs / dt; k++) {
    t += dt;
    stepColony(col, dt, t, null);
    each?.(t);
  }
  return t;
}

describe("the penguin colony", { timeout: 60_000 }, () => {
  it("is a big colony of emperors, fluffy chicks and little penguins (about half on low quality)", () => {
    const hi = makeColony(false);
    const lo = makeColony(true);
    expect(hi.penguins.length).toBeGreaterThanOrEqual(60);
    expect(hi.penguins.length).toBeLessThanOrEqual(120);
    expect(lo.penguins.length).toBeLessThan(hi.penguins.length * 0.6);
    for (const k of [EMPEROR, CHICK, LITTLE]) expect(hi.penguins.filter((p) => p.kind === k).length).toBeGreaterThanOrEqual(8);
    for (const p of hi.penguins.filter((q) => q.role === ROLE_CHICK)) expect(hi.penguins[p.parent].kind).toBe(EMPEROR);
  });

  it("are true size next to the Park kid (2.26 units = 1.4 m): emperors 1.15 m, chicks 0.6 m, little penguins 0.33 m", () => {
    const col = makeColony(false);
    for (const k of [EMPEROR, CHICK, LITTLE]) {
      const ps = col.penguins.filter((p) => p.kind === k);
      const mean = ps.reduce((a, p) => a + p.size * PENGUIN_RIG[k].height, 0) / ps.length;
      expect(mean / 1.6).toBeGreaterThan(PENGUIN_TRUE_M[k] * 0.9);
      expect(mean / 1.6).toBeLessThan(PENGUIN_TRUE_M[k] * 1.1);
    }
    // an emperor comes up to the kid's chest; a little penguin to its knee
    expect((PENGUIN_RIG[EMPEROR].height * PENGUIN_K[EMPEROR]) / 2.26).toBeCloseTo(1.15 / 1.4, 1);
    expect((PENGUIN_RIG[LITTLE].height * PENGUIN_K[LITTLE]) / 2.26).toBeLessThan(0.3);
    // the biggest emperor, sliding on its belly with its flippers out, fits its chute (0.6-unit-wide
    // body, flippers out 0.45 each side at the model's 1 m) with room to spare
    const big = Math.max(...col.penguins.filter((p) => p.kind === EMPEROR).map((p) => p.size));
    expect((0.6 / 2 + 0.42 * Math.sin(0.3)) * big).toBeLessThan(SLIDE_HALF - 0.3);
    // seals ~2.2 m, narwhals ~4.5 m + tusk
    expect((2.66 * BEAST_K.seal) / 1.6).toBeCloseTo(2.2, 1);
    expect((4.45 * BEAST_K.narwhal) / 1.6).toBeCloseTo(4.5, 1);
  });

  it("waddle up, queue, toboggan down the chutes into the sea, swim and hop back out — over and over", () => {
    const col = makeColony(false);
    const seen = new Set<number>();
    let splashes = 0;
    let underwaterMax = 0;
    const chutes = new Set<number>();
    run(col, 300, () => {
      let under = 0;
      for (const p of col.penguins) {
        seen.add(p.state);
        if (p.under) under++;
        if (p.state === S_SLIDE) chutes.add(p.chute);
      }
      underwaterMax = Math.max(underwaterMax, under);
      for (let e = 0; e < col.ev.n; e++) if (col.ev.buf[e * 5 + 4] === 0) splashes++;
    });
    for (const s of [S_HOME, S_ASCEND, S_QUEUE, S_SLIDE, S_SWIM, S_FISH, S_HOP, S_WALKHOME, S_SLIP, S_HUDDLE]) expect(seen.has(s), STATE_NAMES[s]).toBe(true);
    expect(col.slides_done).toBeGreaterThan(40);
    expect(col.hops_done).toBeGreaterThan(40);
    expect(splashes).toBe(col.slides_done);
    expect(underwaterMax).toBeGreaterThanOrEqual(5);
    // every chute gets used
    expect(chutes.size).toBe(FROST_SLIDES.length);
  });

  it("stands on the snow, slides on the chutes, swims in the water — never through anything", () => {
    const col = makeColony(false);
    const root = { x: 0, y: 0, z: 0 };
    let checks = 0;
    const bad: string[] = [];
    const fail = (why: string) => bad.length < 5 && bad.push(why);
    run(col, 180, () => {
      for (const p of col.penguins) {
        if (!Number.isFinite(p.x + p.y + p.z + p.yaw + p.pitch + p.roll + p.headYaw + p.flipOut)) fail(`nan ${p.i}`);
        if (Math.hypot(p.x - FROST_ISLAND.x, p.z - FROST_ISLAND.z) > FROST_SEA_R) fail(`strayed ${p.i}`);
        if (p.state === S_HOME || p.state === S_WALKHOME || p.state === S_ASCEND || p.state === S_QUEUE || p.state === S_HUDDLE) {
          const g = frostGroundY(p.x, p.z) ?? frostLandY(p.x, p.z)!;
          if (Math.abs(p.y - g) > 0.05) fail(`${STATE_NAMES[p.state]} off the ground ${p.i}`);
          if (g < WY + 0.2) fail(`${STATE_NAMES[p.state]} in the sea ${p.i}`);
          checks++;
        } else if (p.state === S_SWIM || p.state === S_FISH) {
          const f = frostSeaFloorY(p.x, p.z) ?? -22;
          if (p.y < f + 0.3) fail(`through the sea floor ${p.i}`);
          if (p.y > WY + 1.4) fail(`flying ${p.i}`);
          checks++;
        } else if (p.state === S_SLIDE && p.ps >= 0) {
          const path = FROST_SLIDES[p.chute].path;
          let best = Infinity;
          for (const q of path) best = Math.min(best, Math.hypot(q.x - p.x, q.z - p.z));
          if (best > 0.9) fail(`off its chute ${p.i} ${best}`);
          checks++;
        }
        penguinRoot(p, root);
        if (!Number.isFinite(root.x + root.y + root.z)) fail(`root ${p.i}`);
      }
    });
    expect(bad).toEqual([]);
    expect(checks).toBeGreaterThan(10000);
  });

  it("chicks stay close to their parents; nobody gets stuck", () => {
    const col = makeColony(false);
    let far = 0;
    let samples = 0;
    const lastChange = new Float32Array(col.penguins.length);
    const lastState = col.penguins.map((p) => p.state);
    run(col, 240, (t) => {
      for (const p of col.penguins) {
        if (p.state !== lastState[p.i]) {
          lastState[p.i] = p.state;
          lastChange[p.i] = t;
        }
        if (p.role !== ROLE_CHICK) continue;
        const par = col.penguins[p.parent];
        samples++;
        if (Math.hypot(par.x - p.x, par.z - p.z) > 3) far++;
      }
    });
    expect(far / samples).toBeLessThan(0.05);
    // every traveller has changed what it's doing in the last 2 minutes
    for (const p of col.penguins) if (p.role === 0) expect(240 - lastChange[p.i], `${p.i} ${STATE_NAMES[p.state]}`).toBeLessThan(120);
  });

  it("keeps each chute's queue short and its sliders spaced out", () => {
    const col = makeColony(false);
    let longQ = 0;
    let bunched = 0;
    run(col, 200, () => {
      for (let c = 0; c < FROST_SLIDES.length; c++) {
        if (col.qLen[c] > 4) longQ++;
        const on = col.penguins.filter((p) => p.state === S_SLIDE && p.chute === c).map((p) => p.ps).sort((a, b) => a - b);
        for (let k = 1; k < on.length; k++) if (on[k] - on[k - 1] < 2.5) bunched++;
      }
    });
    expect(longQ).toBe(0);
    expect(bunched).toBe(0);
  });

  it("is deterministic", () => {
    const a = makeColony(false);
    const b = makeColony(false);
    run(a, 60);
    run(b, 60);
    for (let i = 0; i < a.penguins.length; i++) {
      expect(a.penguins[i].x).toBe(b.penguins[i].x);
      expect(a.penguins[i].y).toBe(b.penguins[i].y);
      expect(a.penguins[i].state).toBe(b.penguins[i].state);
    }
  });

  it("turns to look at the Park kid when they come close", () => {
    const col = makeColony(false);
    run(col, 5);
    const p = col.penguins.find((q) => q.state === S_HUDDLE)!;
    const kid = { x: p.x + Math.sin(p.yaw + 0.8) * 2, z: p.z + Math.cos(p.yaw + 0.8) * 2 };
    let t = 5;
    for (let k = 0; k < 30; k++) stepColony(col, dt, (t += dt), kid);
    expect(p.headYaw).toBeGreaterThan(0.5);
  });
});

describe("seals, narwhals and terns", { timeout: 60_000 }, () => {
  it("seals lounge on their floes, slide in, swim round and haul out again", () => {
    const w = makeWildlife(false);
    const seen = new Set<number>();
    let t = 0;
    let splashes = 0;
    const bad: string[] = [];
    const fail = (why: string) => bad.length < 5 && bad.push(why);
    for (let k = 0; k < 240 / dt; k++) {
      stepWildlife(w, dt, (t += dt));
      splashes += w.ev.n;
      for (const s of w.seals) {
        seen.add(s.state);
        if (!Number.isFinite(s.x + s.y + s.z + s.yaw)) fail("nan");
        if (s.state === SEAL_LOUNGE && (s.y !== s.floe.top || Math.hypot(s.x - s.floe.x, s.z - s.floe.z) > s.floe.r)) fail("off its floe");
        if (s.state === SEAL_SWIM && (s.y > WY - 0.5 || s.y < (frostSeaFloorY(s.x, s.z) ?? -22) + 0.3)) fail("out of the water");
      }
      for (const n of w.narwhals) if (n.y > WY + 0.2 || n.y < (frostSeaFloorY(n.x, n.z) ?? -22) + 1) fail("narwhal out of the water");
      for (const b of w.terns) if (b.y < WY - 0.05) fail("tern under the sea");
    }
    expect(bad).toEqual([]);
    for (let s = 0; s <= 4; s++) expect(seen.has(s), `seal state ${s}`).toBe(true);
    expect(splashes).toBeGreaterThan(5);
  });
});
