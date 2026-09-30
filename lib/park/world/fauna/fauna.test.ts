import { describe, expect, it } from "vitest";
import { PLACES } from "../../registry/places";
import { POND, coastR, nearStream, nearTrail } from "../../registry/island";
import { WATER_Y, groundY } from "../../registry/terrain";
import { zoneBounds } from "../../builder/rules";
import { planForest, planMeadows, trunkObstacles, type FreeFn } from "../storybook/plan";
import { B_BLOCK, B_LAND, bitsAt, buildWalkGrid, dryLandAt } from "./ground";
import { planFauna } from "./plan";
import { activeNow, passable, stepFauna, type FaunaEnv } from "./brain";
import {
  KINDS,
  K_BEAR,
  K_COW,
  K_DEER,
  K_DUCK,
  K_FROG,
  K_HORSE,
  K_OWL,
  K_RABBIT,
  K_SQUIRREL,
  K_TURTLE,
  MESHES,
  S_CLIMB_UP,
  S_HOP,
  S_IN_TREE,
  TUNE,
  inPaddock,
  type Agent,
  type KidSense,
} from "./types";

// a stand-in for the park's free() predicate (trails, places, plaza, Dream Park, stream, beach)
const zb = zoneBounds();
const free: FreeFn = (x, z, pad) => {
  const r = Math.hypot(x, z);
  if (r < 12 + pad || r > coastR(Math.atan2(x, z)) - 4 - pad) return false;
  if (x > zb.minX - pad && x < zb.maxX + pad && z > zb.minZ - pad && z < zb.maxZ + pad) return false;
  if (nearTrail(x, z, pad + 1.6) || nearStream(x, z, pad)) return false;
  return !PLACES.some((p) => Math.hypot(x - p.x, z - p.z) < Math.max(p.radius, 1.5) + pad + 1.2);
};

const meadows = planMeadows(free, { count: 8 });
const forest = planForest(free, { meadows });
// (the storybook's trunk obstacles + a windmill-sized one, as the park passes them)
const obstacles = [...trunkObstacles(forest.trees, 1400), { x: -40, z: 40, r: 2.6 }];
const grid = buildWalkGrid(forest.covered, obstacles);
const plan = planFauna(free, grid, { trees: forest.trees, meadows }, { obstacles });
const lowMeadows = planMeadows(free, { count: 6 });
const lowForest = planForest(free, { meadows: lowMeadows, lowQuality: true });
const lowPlan = planFauna(free, buildWalkGrid(lowForest.covered), { trees: lowForest.trees, meadows: lowMeadows }, { lowQuality: true });

const envOf = (p: typeof plan): FaunaEnv => ({ g: grid, trees: forest.trees, paddock: p.paddock, agents: p.agents, shores: p.shores });
const kidAt = (x: number, z: number, speed = 0, still = 0): KidSense => ({ x, y: groundY(x, z), z, speed, still, ground: true });
const FAR: KidSense = { x: 9999, y: 0, z: 9999, speed: 0, still: 0, ground: true };
const fresh = () => planFauna(free, grid, { trees: forest.trees, meadows }, { obstacles });
const count = (p: typeof plan, k: number) => p.agents.filter((a) => a.kind === k).length;

function run(env: FaunaEnv, steps: number, kid: KidSense | ((i: number) => KidSense), glow = 0.1, t0 = 0, check?: (a: Agent) => void) {
  const dt = 1 / 20;
  for (let i = 0; i < steps; i++) {
    stepFauna(env, typeof kid === "function" ? kid(i) : kid, dt, t0 + i * dt, glow);
    if (check) for (const a of env.agents) check(a);
  }
}

describe("fauna plan", () => {
  it("puts 60-100 animals of every kind on the island (about half on low quality)", () => {
    expect(plan.agents.length).toBeGreaterThanOrEqual(60);
    expect(plan.agents.length).toBeLessThanOrEqual(100);
    for (let k = 0; k < KINDS; k++) expect(count(plan, k), `kind ${k}`).toBeGreaterThan(0);
    expect(lowPlan.agents.length).toBeGreaterThanOrEqual(plan.agents.length * 0.4);
    expect(lowPlan.agents.length).toBeLessThanOrEqual(plan.agents.length * 0.62);
  });

  it("is deterministic", () => {
    const again = fresh();
    expect(again.agents.map((a) => [a.kind, a.x, a.z, a.s])).toEqual(plan.agents.map((a) => [a.kind, a.x, a.z, a.s]));
    expect(again.paddock).toEqual(plan.paddock);
  });

  it("stands every land animal on dry land (never in the sea, the stream or the pond)", () => {
    for (const a of plan.agents) {
      if (a.kind === K_OWL) continue;
      if (a.kind === K_DUCK) {
        expect(Math.hypot(a.x - POND.x, a.z - POND.z)).toBeLessThan(POND.r);
        continue;
      }
      expect(groundY(a.x, a.z), `${a.kind} at ${a.x},${a.z}`).toBeGreaterThan(WATER_Y + 0.3);
      expect(dryLandAt(a.x, a.z), `${a.kind} at ${a.x},${a.z}`).toBe(true);
      expect(Math.hypot(a.x, a.z)).toBeLessThan(coastR(Math.atan2(a.x, a.z)) - 2);
    }
  });

  it("keeps homes well clear of windmills and buildings", () => {
    for (const a of plan.agents) expect(Math.hypot(a.x + 40, a.z - 40), `${a.kind}`).toBeGreaterThan(2.6 + 5);
  });

  it("builds the horses a paddock and keeps them in it", () => {
    expect(plan.paddock).not.toBeNull();
    for (const a of plan.agents.filter((a) => a.kind === K_HORSE)) expect(inPaddock(plan.paddock!, a.x, a.z)).toBe(true);
  });

  it("perches the owls up in trees, gives squirrels trees and bears the stream", () => {
    for (const o of plan.agents.filter((a) => a.kind === K_OWL)) {
      expect(o.tree).toBeGreaterThanOrEqual(0);
      expect(o.y - groundY(o.x, o.z)).toBeGreaterThan(3);
    }
    for (const s of plan.agents.filter((a) => a.kind === K_SQUIRREL)) expect(s.tree).toBeGreaterThanOrEqual(0);
    for (const b of plan.agents.filter((a) => a.kind === K_BEAR)) expect(nearStream(b.x, b.z, 7)).toBe(true);
    for (const f of plan.agents.filter((a) => a.kind === K_FROG)) expect(nearStream(f.x, f.z, 3)).toBe(true);
    for (const t of plan.agents.filter((a) => a.kind === K_TURTLE)) expect(nearTrail((t.ax + t.bx) / 2, (t.az + t.bz) / 2, 1)).toBe(true);
  });

  it("numbers the instances of every mesh", () => {
    expect(plan.counts.length).toBe(MESHES);
    for (let m = 0; m < MESHES; m++) {
      const slots = plan.agents.filter((a) => a.mesh === m).map((a) => a.slot);
      expect(slots).toEqual(slots.map((_, i) => i));
    }
  });
});

describe("fauna behaviour", () => {
  it("is deterministic", () => {
    const a = fresh();
    const b = fresh();
    run(envOf(a), 300, (i) => kidAt(-10 + i * 0.1, 30, 2), 0.3);
    run(envOf(b), 300, (i) => kidAt(-10 + i * 0.1, 30, 2), 0.3);
    expect(a.agents.map((x) => [x.x, x.z, x.st])).toEqual(b.agents.map((x) => [x.x, x.z, x.st]));
  });

  it("never walks anyone into the water or off their ground over a long day", () => {
    const p = fresh();
    const env = envOf(p);
    const bad: string[] = [];
    for (const glow of [0.05, 0.55, 1]) {
      run(env, 1200, FAR, glow, glow * 1000, (a) => {
        if (bad.length > 5 || a.kind === K_OWL || (a.kind === K_SQUIRREL && a.climb > 0)) return;
        const at = () => `${a.kind} @ ${a.x.toFixed(1)},${a.z.toFixed(1)} st${a.st} glow ${glow}`;
        if (a.kind === K_DUCK) {
          if (Math.hypot(a.x - POND.x, a.z - POND.z) > POND.r + 7) bad.push(`duck strayed ${at()}`);
          return;
        }
        if (a.present < 0.02 || (a.kind === K_FROG && a.want === 0)) return; // (a frog plops into the stream to hide)
        const b = bitsAt(grid, a.x, a.z);
        // (a frog in mid-hop may sail over the corner of a wet cell)
        if (!(b & B_LAND) && !(a.kind === K_FROG && a.st === S_HOP)) bad.push(`off the land ${at()}`);
        if (groundY(a.x, a.z) <= WATER_Y + 0.3) bad.push(`in the water ${at()}`);
        if (a.kind !== K_SQUIRREL && b & B_BLOCK) bad.push(`inside an obstacle ${at()}`);
        if (a.kind === K_HORSE && !inPaddock(p.paddock!, a.x, a.z)) bad.push(`out of the paddock ${at()}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it("scatters from a running kid: rabbits and deer get away", () => {
    for (const kind of [K_RABBIT, K_DEER]) {
      const p = fresh();
      const env = envOf(p);
      run(env, 60, FAR, 0.55);
      const a = p.agents.find((x) => x.kind === kind && x.present > 0.9)!;
      const kx = a.x + 4;
      const kz = a.z;
      const before = Math.hypot(a.x - kx, a.z - kz);
      run(env, 60, kidAt(kx, kz, 7), 0.55, 10);
      expect(Math.hypot(a.x - kx, a.z - kz), `kind ${kind}`).toBeGreaterThan(before + 3);
    }
  });

  it("never lets an animal walk through the kid", () => {
    const p = fresh();
    const env = envOf(p);
    // the kid strolls slowly right through the cows' hillside (and everyone's checked every step)
    const cow = p.agents.find((a) => a.kind === K_COW)!;
    const dt = 1 / 20;
    let worst = Infinity;
    for (let i = 0; i < 1200; i++) {
      const k = kidAt(cow.hx - 12 + i * 0.02, cow.hz, 0.4, 0);
      stepFauna(env, k, dt, i * dt, 0.2);
      for (const a of p.agents) {
        if (a.kind === K_OWL || a.present < 0.5 || (a.kind === K_SQUIRREL && a.climb > 0)) continue;
        worst = Math.min(worst, Math.hypot(a.x - k.x, a.z - k.z) - (TUNE[a.kind].body * a.s + 0.8));
      }
    }
    expect(worst).toBeGreaterThan(-0.01);
  });

  it("brings curious animals slowly closer to a kid standing still (but not too close)", () => {
    const p = fresh();
    const env = envOf(p);
    const cow = p.agents.find((a) => a.kind === K_COW)!;
    // stand 9 m away across open grass
    let ang = 0;
    for (let k = 0; k < 16; k++) {
      ang = (k / 16) * Math.PI * 2;
      let clear = true;
      for (let d = 1; d <= 9; d += 0.5) clear &&= passable(env, cow, cow.x + Math.sin(ang) * d, cow.z + Math.cos(ang) * d);
      if (clear) break;
    }
    const kx = cow.x + Math.sin(ang) * 9;
    const kz = cow.z + Math.cos(ang) * 9;
    const k = kidAt(kx, kz, 0, 10);
    const before = Math.hypot(cow.x - kx, cow.z - kz);
    run(env, 600, k, 0.1, 50);
    const after = Math.hypot(cow.x - kx, cow.z - kz);
    expect(after).toBeLessThan(before - 2);
    expect(after).toBeGreaterThan(TUNE[K_COW].body * cow.s + 0.8);
  });

  it("keeps day and night routines: owls by night, squirrels up their trees at night", () => {
    const p = fresh();
    const env = envOf(p);
    run(env, 200, FAR, 0.02);
    for (const o of p.agents.filter((a) => a.kind === K_OWL)) expect(o.present).toBe(0);
    for (const f of p.agents.filter((a) => a.kind === K_FROG)) expect(activeNow(f, 0.02)).toBe(false);
    run(env, 800, FAR, 1, 20);
    for (const o of p.agents.filter((a) => a.kind === K_OWL)) expect(o.present).toBe(1);
    for (const s of p.agents.filter((a) => a.kind === K_SQUIRREL)) expect([S_CLIMB_UP, S_IN_TREE]).toContain(s.st);
  });

  it("walks ducklings in a line behind their mother", () => {
    const p = fresh();
    const env = envOf(p);
    run(env, 1500, FAR, 0.2);
    const ducks = p.agents.filter((a) => a.kind === K_DUCK);
    for (const d of ducks) {
      if (d.lead < 0) continue;
      const L = p.agents[d.lead];
      expect(Math.hypot(d.x - L.x, d.z - L.z)).toBeLessThan(2.5);
      expect(passable(env, d, d.x, d.z)).toBe(true);
    }
  });
});
