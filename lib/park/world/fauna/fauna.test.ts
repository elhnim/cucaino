import { describe, expect, it } from "vitest";
import { LANDS, PLACES } from "../../registry/places";
import { ISLAND_R, POND, TRAIL_POINTS, nearMesa, nearStream, nearTrail, seaDist } from "../../registry/island";
import { WATER_Y, groundY } from "../../registry/terrain";
import { rideableKeepOut } from "../../registry/rideables";
import { zoneBounds } from "../../builder/rules";
import { inJungle } from "../../registry/jungle";
import { WATER_BODIES, waterBodyAt, waterSdf } from "../../registry/waterways";
import { carvePasture, planFlocks, planForest, planMeadows, planPasture, planWindmills, stepFlock, trunkObstacles, type FreeFn } from "../storybook/plan";
import { B_BLOCK, B_KEEP, B_LAND, B_OPEN, B_TRAIL, bitsAt, buildWalkGrid, dryLandAt } from "./ground";
import { RMAX, planFauna, sheepKeepOut } from "./plan";
import { activeNow, kidInsideAny, makeEnv, passable, pushKid, stepFauna, type FaunaEnv } from "./brain";
import { TAG_PATH, TAG_WATER, componentSizes, nearestNode, route, segmentOk } from "./roam";
import { buildMeshGeometries, measureModel } from "./species";
import {
  BLOCKS_KID,
  BODY_LEN_MULT,
  C_GIANT,
  C_LARGE,
  C_NONE,
  KINDS,
  KIND_NAMES,
  K_BEAR,
  K_CHICKEN,
  K_COW,
  K_DEER,
  K_DUCK,
  K_ELEPHANT,
  K_FROG,
  K_GIRAFFE,
  K_HORSE,
  K_KANGAROO,
  K_KOALA,
  K_KOOKABURRA,
  K_OWL,
  K_PLATYPUS,
  K_RABBIT,
  K_SHEEP,
  K_SQUIRREL,
  K_TURTLE,
  K_WOMBAT,
  MESHES,
  MESH_OF,
  R_DUCKLING,
  R_LAMB,
  SIZES,
  S_CLIMB_DOWN,
  S_CLIMB_UP,
  S_FOLLOW,
  S_HOP,
  S_IN_TREE,
  TUNE,
  UNITS_PER_M,
  inPaddock,
  type Agent,
  type KidSense,
} from "./types";

// a stand-in for the park's free() predicate (trails, places, plaza, Dream Park, the river and the lake, beach, rides parked about, the rainforest)
const zb = zoneBounds();
const inDream = (x: number, z: number, pad = 0) => x > zb.minX - pad && x < zb.maxX + pad && z > zb.minZ - pad && z < zb.maxZ + pad;
const free: FreeFn = (x, z, pad) => {
  const r = Math.hypot(x, z);
  // (as the park's storyFree: within the park's own land — the Wildlands beyond have their own life)
  if (r < 12 + pad || r > ISLAND_R - 2) return false;
  if (inDream(x, z, pad)) return false;
  if (nearTrail(x, z, pad + 1.6) || nearStream(x, z, pad) || rideableKeepOut(x, z, pad) || inJungle(x, z, pad) || nearMesa(x, z, pad)) return false;
  return !PLACES.some((p) => Math.hypot(x - p.x, z - p.z) < Math.max(p.radius, 1.5) + pad + 1.2);
};

const meadows = planMeadows(free, { count: 8 });
const forest = planForest(free, { meadows });
// (the storybook's trunk obstacles + a windmill-sized one, as the park passes them)
const obstacles = [...trunkObstacles(forest.trees, 1400), { x: -40, z: 40, r: 2.6 }];
const grid = buildWalkGrid(forest.covered, obstacles, free, forest.trees);
// the storybook's sheep, as the fauna re-plans them
const pasture = planPasture(free, forest.covered);
const mills = planWindmills(pasture, { count: 4, avoid: [{ x: 0, z: 30, r: 20 }] });
const flockPlan = () => planFlocks(pasture, { count: 7, avoid: [...mills.map((m) => ({ x: m.x, z: m.z, r: 1.7 * 1.55 + 2 })), { x: 0, z: 30, r: 20 }], sites: meadows });
const flocks0 = flockPlan();
const flockCircles = flocks0.map((f) => ({ x: f.x, z: f.z, r: f.r + 2 }));
const fresh = () => planFauna(free, grid, { trees: forest.trees, meadows }, { obstacles, flocks: flockCircles });
const plan = fresh();
const lowMeadows = planMeadows(free, { count: 6 });
const lowForest = planForest(free, { meadows: lowMeadows, lowQuality: true });
const lowPlan = planFauna(free, buildWalkGrid(lowForest.covered, [], free, lowForest.trees), { trees: lowForest.trees, meadows: lowMeadows }, { lowQuality: true });
const nSheep = flocks0.reduce((n, f) => n + f.sheep.length, 0);

interface Sim {
  env: FaunaEnv;
  flocks: ReturnType<typeof flockPlan>;
}
const simOf = (p: typeof plan): Sim => {
  const env = makeEnv({ g: grid, trees: forest.trees, paddock: p.paddock, agents: p.agents, shores: p.shores, graph: p.graph, routes: p.routes, farm: p.farm, maxSheep: nSheep });
  // (the sheep graze round the paddock and the farm corner, as in the park)
  const flocks = flockPlan();
  carvePasture(pasture, sheepKeepOut(p), flocks);
  return { env, flocks };
};
const kidAt = (x: number, z: number, speed = 0, still = 0, dx = 0, dz = 1): KidSense => ({ x, y: groundY(x, z), z, speed, dx, dz, still, ground: true });
const FAR: KidSense = { x: 9999, y: 0, z: 9999, speed: 0, dx: 0, dz: 1, still: 0, ground: true };
const count = (p: typeof plan, k: number) => p.agents.filter((a) => a.kind === k).length;
/** the park hour at time t, if a whole day lasts `day` seconds starting at `h0` */
const hourAt = (t: number, h0: number, day = 900) => (h0 + (t / day) * 24) % 24;
const glowOf = (h: number) => {
  const s = (a: number, b: number, x: number) => {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  return h >= 12 ? s(16.5, 19.5, h) : 1 - s(5.5, 7.5, h);
};

function run(sim: Sim, steps: number, kid: KidSense | ((i: number) => KidSense), opts: { h0?: number; t0?: number; day?: number; glow?: number; dt?: number; check?: (a: Agent, t: number) => void; every?: (t: number) => void } = {}) {
  const dt = opts.dt ?? 1 / 20;
  const t0 = opts.t0 ?? 0;
  for (let i = 0; i < steps; i++) {
    const t = t0 + i * dt;
    const h = hourAt(t, opts.h0 ?? 9, opts.day ?? 900);
    // (step the sheep exactly as the fauna module does)
    let k = 0;
    sim.flocks.forEach((f, fi) => {
      stepFlock(f, pasture, dt, t);
      sim.env.flocks[fi * 3] = f.x;
      sim.env.flocks[fi * 3 + 1] = f.z;
      sim.env.flocks[fi * 3 + 2] = f.r + 2;
      for (const s of f.sheep) {
        sim.env.sheep[k * 2] = s.x;
        sim.env.sheep[k * 2 + 1] = s.z;
        k++;
      }
    });
    sim.env.nSheep = k;
    sim.env.nFlocks = sim.flocks.length;
    stepFauna(sim.env, typeof kid === "function" ? kid(i) : kid, dt, t, opts.glow ?? glowOf(h), h);
    if (opts.check) for (const a of sim.env.agents) opts.check(a, t);
    opts.every?.(t);
  }
}

const inLand = (x: number, z: number) => LANDS.some((l) => Math.hypot(x - l.x, z - l.z) < l.radius) || PLACES.some((p) => !p.sky && Math.hypot(x - p.x, z - p.z) < Math.max(p.radius, 1.5));

describe("fauna plan", { timeout: 30000 }, () => {
  it("puts 110-150 animals of every kind on the island (about half on low quality)", () => {
    expect(plan.agents.length).toBeGreaterThanOrEqual(110);
    expect(plan.agents.length).toBeLessThanOrEqual(150);
    for (let k = 0; k < KINDS; k++) expect(count(plan, k), KIND_NAMES[k]).toBeGreaterThan(0);
    expect(lowPlan.agents.length).toBeGreaterThanOrEqual(plan.agents.length * 0.4);
    expect(lowPlan.agents.length).toBeLessThanOrEqual(plan.agents.length * 0.65);
  });

  it("is deterministic", () => {
    const again = fresh();
    expect(again.agents.map((a) => [a.kind, a.x, a.z, a.s])).toEqual(plan.agents.map((a) => [a.kind, a.x, a.z, a.s]));
    expect(again.paddock).toEqual(plan.paddock);
    expect(Array.from(again.graph.x)).toEqual(Array.from(plan.graph.x));
  });

  it("stands every land animal on dry land, out of the lands, the Dream Park and the park's keep-clear ground", () => {
    for (const a of plan.agents) {
      if (a.kind === K_OWL || a.kind === K_KOOKABURRA || a.kind === K_KOALA) continue;
      if (a.kind === K_DUCK || a.kind === K_PLATYPUS) {
        expect(Math.hypot(a.x - POND.x, a.z - POND.z)).toBeLessThan(POND.r);
        continue;
      }
      const at = `${KIND_NAMES[a.kind]} at ${a.x.toFixed(1)},${a.z.toFixed(1)}`;
      expect(groundY(a.x, a.z), at).toBeGreaterThan(WATER_Y + 0.3);
      expect(dryLandAt(a.x, a.z), at).toBe(true);
      expect(inDream(a.x, a.z), at).toBe(false);
      expect(inLand(a.x, a.z), at).toBe(false);
      expect(bitsAt(grid, a.x, a.z) & B_KEEP, at).toBe(0);
      expect(seaDist(a.x, a.z)).toBeLessThan(-2);
    }
  });

  it("keeps homes well clear of windmills and buildings", () => {
    for (const a of plan.agents) expect(Math.hypot(a.x + 40, a.z - 40), `${KIND_NAMES[a.kind]}`).toBeGreaterThan(2.6 + 3);
  });

  it("builds the horses a paddock and keeps them in it, with a farm corner beside it", () => {
    expect(plan.paddock).not.toBeNull();
    for (const a of plan.agents.filter((a) => a.kind === K_HORSE)) expect(inPaddock(plan.paddock!, a.x, a.z)).toBe(true);
    expect(plan.farm).not.toBeNull();
    expect(Math.hypot(plan.farm!.x - plan.paddock!.x, plan.farm!.z - plan.paddock!.z)).toBeLessThan(60);
  });

  it("perches the birds up in trees, gives squirrels and koalas trees and bears the stream", () => {
    for (const o of plan.agents.filter((a) => a.kind === K_OWL || a.kind === K_KOOKABURRA)) {
      expect(o.tree).toBeGreaterThanOrEqual(0);
      expect(o.y - groundY(o.x, o.z)).toBeGreaterThan(3);
    }
    for (const s of plan.agents.filter((a) => a.kind === K_SQUIRREL || a.kind === K_KOALA)) expect(s.tree).toBeGreaterThanOrEqual(0);
    for (const b of plan.agents.filter((a) => a.kind === K_BEAR)) expect(nearStream(b.x, b.z, 8)).toBe(true);
    for (const f of plan.agents.filter((a) => a.kind === K_FROG)) expect(nearStream(f.x, f.z, 3)).toBe(true);
    for (const t of plan.agents.filter((a) => a.kind === K_TURTLE)) expect(nearTrail((t.ax + t.bx) / 2, (t.az + t.bz) / 2, 1)).toBe(true);
  });

  it("numbers the instances of every mesh", () => {
    expect(plan.counts.length).toBe(MESHES);
    for (let m = 0; m < MESHES; m++) {
      const slots = plan.agents.filter((a) => a.mesh === m).map((a) => a.slot);
      expect(slots).toEqual(slots.map((_, i) => i));
    }
    plan.agents.forEach((a, i) => expect(a.id).toBe(i));
  });
});

describe("true size", { timeout: 30000 }, () => {
  const geos = buildMeshGeometries();
  it("measures every model the way the size table says", () => {
    for (let k = 0; k < KINDS; k++) {
      const sz = SIZES[k];
      const m = measureModel(geos[MESH_OF[k]], sz.variant, sz.measure);
      expect(m / sz.model, KIND_NAMES[k]).toBeGreaterThan(0.97);
      expect(m / sz.model, KIND_NAMES[k]).toBeLessThan(1.03);
    }
  });

  it("draws every grown-up at its real size × 1.6 units a metre (a kid is 2.26)", () => {
    expect(UNITS_PER_M).toBeCloseTo(1.614, 2);
    for (const a of plan.agents) {
      const sz = SIZES[a.kind];
      const drawn = measureModel(geos[a.mesh], a.variant, sz.measure) * a.s;
      const real = sz.m * UNITS_PER_M;
      const young = drawn < real * 0.8;
      if (young) continue; // (youngsters, ponies and the like)
      expect(drawn / real, `${KIND_NAMES[a.kind]} role ${a.role}`).toBeGreaterThan(0.9);
      expect(drawn / real, `${KIND_NAMES[a.kind]} role ${a.role}`).toBeLessThan(1.1);
    }
    // a few landmarks: a giraffe towers over the kid, a rabbit comes up to its shin
    const tall = (k: number) => SIZES[k].m * UNITS_PER_M;
    expect(tall(K_GIRAFFE)).toBeGreaterThan(7.5);
    expect(tall(K_ELEPHANT)).toBeGreaterThan(4.3);
    expect(tall(K_HORSE)).toBeCloseTo(2.58, 1);
    expect(tall(K_KANGAROO)).toBeGreaterThan(2.26);
    expect(tall(K_RABBIT)).toBeLessThan(0.7);
  });
});

describe("the roaming map", { timeout: 30000 }, () => {
  const G = plan.graph;
  it("has drinking places on Rainbow Lake's shores and the river's open banks — the giants included", () => {
    const water = [...Array(G.n).keys()].filter((i) => G.tag[i] & TAG_WATER);
    const lake = water.filter((i) => waterBodyAt(G.x[i], G.z[i]) === WATER_BODIES.lake);
    const river = water.filter((i) => waterBodyAt(G.x[i], G.z[i]) === WATER_BODIES.river);
    expect(lake.length).toBeGreaterThan(8);
    expect(river.length).toBeGreaterThan(0);
    // each faces the water, a step from it
    for (const i of water) expect(waterSdf(G.x[i] + Math.sin(G.face[i]) * 4, G.z[i] + Math.cos(G.face[i]) * 4), `spot ${i}`).toBeLessThan(waterSdf(G.x[i], G.z[i]));
    // the elephants and giraffes can walk from where they live down to the lake or the river to drink
    for (const a of plan.agents.filter((q) => q.kind === K_ELEPHANT || q.kind === K_GIRAFFE)) {
      const home = nearestNode(G, grid, C_GIANT, a.x, a.z, 40);
      expect(home, `${KIND_NAMES[a.kind]} near the roaming map`).toBeGreaterThanOrEqual(0);
      const comp = G.comp[C_GIANT][home];
      expect([...lake, ...river].some((i) => G.ok[C_GIANT][i] && G.comp[C_GIANT][i] === comp), `${KIND_NAMES[a.kind]} @ ${a.x.toFixed(0)},${a.z.toFixed(0)} can reach the water`).toBe(true);
    }
  });

  it("covers the island and joins it up for the medium-sized travellers", () => {
    expect(G.n).toBeGreaterThan(300);
    const big = componentSizes(G, C_LARGE)[0];
    expect(big).toBeGreaterThan(200);
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    const main = G.comp[C_LARGE][plan.agents.find((a) => a.kind === K_DEER)!.goal];
    for (let i = 0; i < G.n; i++) {
      if (G.comp[C_LARGE][i] !== main) continue;
      x0 = Math.min(x0, G.x[i]);
      x1 = Math.max(x1, G.x[i]);
      z0 = Math.min(z0, G.z[i]);
      z1 = Math.max(z1, G.z[i]);
    }
    expect(x1 - x0).toBeGreaterThan(160);
    expect(z1 - z0).toBeGreaterThan(160);
    expect([...G.tag].filter((t) => t & TAG_WATER).length).toBeGreaterThan(20);
  });

  it("never puts a spot in the water, the lands, the Dream Park or on keep-clear ground", () => {
    for (let i = 0; i < G.n; i++) {
      const x = G.x[i];
      const z = G.z[i];
      const b = bitsAt(grid, x, z);
      expect(b & B_LAND, `${x},${z}`).toBeTruthy();
      expect(b & (B_BLOCK | B_KEEP), `${x},${z}`).toBe(0);
      expect(inDream(x, z)).toBe(false);
      expect(inLand(x, z)).toBe(false);
      if (!(G.tag[i] & TAG_PATH)) expect(b & B_TRAIL).toBe(0);
    }
  });

  it("routes along edges an animal of that size can walk", () => {
    const out = new Int16Array(RMAX);
    const comp = componentSizes(G, C_LARGE);
    expect(comp.length).toBeGreaterThan(0);
    let tried = 0;
    for (let a = 0; a < G.n && tried < 40; a += 3) {
      const b = (a * 31 + 11) % G.n;
      if (!G.ok[C_LARGE][a] || G.comp[C_LARGE][a] !== G.comp[C_LARGE][b] || a === b) continue;
      const n = route(G, C_LARGE, a, b, out, 0, RMAX);
      expect(n).toBeGreaterThan(0);
      let prev = a;
      for (let k = 0; k < n; k++) {
        expect(segmentOk(grid, C_LARGE, G.x[prev], G.z[prev], G.x[out[k]], G.z[out[k]])).toBe(true);
        prev = out[k];
      }
      if (n < RMAX) expect(out[n - 1]).toBe(b);
      tried++;
    }
    expect(tried).toBeGreaterThan(20);
  });
});

describe("fauna behaviour", { timeout: 60000 }, () => {
  it("is deterministic", () => {
    const a = simOf(fresh());
    const b = simOf(fresh());
    run(a, 400, (i) => kidAt(-10 + i * 0.1, 30, 2, 0, 1, 0));
    run(b, 400, (i) => kidAt(-10 + i * 0.1, 30, 2, 0, 1, 0));
    expect(a.env.agents.map((x) => [x.x, x.z, x.st])).toEqual(b.env.agents.map((x) => [x.x, x.z, x.st]));
  });

  // a whole park day (15 minutes), everyone checked every step
  const day = simOf(fresh());
  const bad: string[] = [];
  const start = day.env.agents.map((a) => ({ x: a.x, z: a.z }));
  const maxAway = new Float32Array(day.env.agents.length);
  const crossings = new Uint16Array(day.env.agents.length);
  const onTrail = new Uint8Array(day.env.agents.length);
  const piles: string[] = [];
  let minSheep = Infinity;
  let sheepWho = "";
  const coverage: number[] = [];
  const trailSamples: [number, number][] = [];
  for (const pts of TRAIL_POINTS) for (let i = 0; i < pts.length; i += 4) if (!inLand(pts[i][0], pts[i][1]) && Math.hypot(pts[i][0], pts[i][1]) > 14) trailSamples.push(pts[i]);
  // (at 10 steps a second: the slowest frame rate the park allows)
  run(day, 900 * 10, FAR, {
    h0: 6,
    dt: 0.1,
    check: (a) => {
      if (bad.length > 8 || a.kind === K_OWL || a.kind === K_KOOKABURRA) return;
      // (squirrels and koalas at / up their own trunks)
      if ((a.kind === K_SQUIRREL || a.kind === K_KOALA) && (a.climb > 0 || a.st === S_CLIMB_UP || a.st === S_IN_TREE || a.st === S_CLIMB_DOWN)) return;
      const at = () => `${KIND_NAMES[a.kind]} @ ${a.x.toFixed(1)},${a.z.toFixed(1)} st${a.st}`;
      if (a.kind === K_DUCK || a.kind === K_PLATYPUS) {
        if (Math.hypot(a.x - POND.x, a.z - POND.z) > POND.r + 7) bad.push(`duck strayed ${at()}`);
        return;
      }
      if (a.present < 0.02 || (a.kind === K_FROG && a.want === 0)) return;
      const b = bitsAt(grid, a.x, a.z);
      if (!(b & B_LAND) && !(a.kind === K_FROG && a.st === S_HOP)) bad.push(`off the land ${at()}`);
      if (groundY(a.x, a.z) <= WATER_Y + 0.3) bad.push(`in the water ${at()}`);
      if (a.kind !== K_SQUIRREL && b & B_BLOCK) bad.push(`inside an obstacle ${at()}`);
      if (b & B_KEEP) bad.push(`on keep-clear ground ${at()}`);
      if (inDream(a.x, a.z)) bad.push(`in the Dream Park ${at()}`);
      if (a.kind === K_HORSE && !inPaddock(day.env.paddock!, a.x, a.z)) bad.push(`out of the paddock ${at()}`);
      if (a.kind !== K_HORSE && day.env.paddock && inPaddock(day.env.paddock, a.x, a.z, 0.5)) bad.push(`in the paddock ${at()}`);
      if (a.cls === C_GIANT && !(b & (B_OPEN | B_TRAIL))) bad.push(`giant under the trees ${at()}`);
      const i = a.id;
      maxAway[i] = Math.max(maxAway[i], Math.hypot(a.x - start[i].x, a.z - start[i].z));
      const tr = b & B_TRAIL ? 1 : 0;
      if (tr && !onTrail[i]) crossings[i]++;
      onTrail[i] = tr;
      // (the storybook's sheep graze right through the horses' paddock: the horses can only shuffle)
      if (a.present > 0.5 && a.kind !== K_HORSE)
        for (let k = 0; k < day.env.nSheep; k++) {
          const d = Math.hypot(a.x - day.env.sheep[k * 2], a.z - day.env.sheep[k * 2 + 1]) - TUNE[a.kind].body * a.s;
          if (d < minSheep) {
            minSheep = d;
            sheepWho = at();
          }
        }
    },
    every: (t) => {
      if (Math.round(t * 20) % 200 !== 0 || t < 60) return;
      // no pile-ups: no two ground animals deep inside each other
      const g = day.env.agents.filter((a) => a.present > 0.5 && a.kind !== K_OWL && a.kind !== K_KOOKABURRA && a.kind !== K_DUCK && a.kind !== K_PLATYPUS && !(a.kind === K_SQUIRREL && a.climb > 0) && !(a.kind === K_KOALA && a.climb > 0.01));
      for (let i = 0; i < g.length; i++)
        for (let j = i + 1; j < g.length; j++) {
          const A = g[i];
          const B = g[j];
          if (A.role === R_DUCKLING || B.role === R_DUCKLING) continue;
          const d = Math.hypot(A.x - B.x, A.z - B.z);
          // (a youngster may snuggle right up to its mum)
          const mum = (A.lead === B.id || B.lead === A.id) && A.kind === B.kind && (A.s < B.s * 0.75 || B.s < A.s * 0.75);
          if (d < (TUNE[A.kind].body * A.s + TUNE[B.kind].body * B.s) * (mum ? 0.3 : 0.5) && piles.length < 12) piles.push(`${KIND_NAMES[A.kind]}#${A.id} st${A.st} + ${KIND_NAMES[B.kind]}#${B.id} st${B.st} @ ${A.x.toFixed(1)},${A.z.toFixed(1)} d ${d.toFixed(2)}`);
        }
      // the trails: how much of them has an animal (out and about) within 35 m
      let seen = 0;
      for (const [x, z] of trailSamples) if (g.some((a) => a.present > 0.9 && Math.hypot(a.x - x, a.z - z) < 35)) seen++;
      coverage.push(seen / trailSamples.length);
    },
  });

  it("never walks anyone into the water, a building, the Dream Park or keep-clear ground over a whole day", () => {
    expect(bad.join(" | ")).toBe("");
  });

  it("roams: herds and wanderers travel far across the island and over the trails", () => {
    const roamers = day.env.agents.filter((a) => a.cls !== C_NONE);
    expect(roamers.length).toBeGreaterThan(40);
    const leaders = roamers.filter((a) => a.lead < 0);
    for (const a of leaders) {
      expect(maxAway[a.id], `${KIND_NAMES[a.kind]} travelled`).toBeGreaterThan(a.cls === C_LARGE && a.kind !== K_SHEEP ? 35 : 20);
    }
    const crossers = leaders.filter((a) => crossings[a.id] >= 2).length;
    expect(crossers / leaders.length).toBeGreaterThan(0.7);
  });

  it("never piles animals up, and walks everyone round the sheep", () => {
    expect(piles).toEqual([]);
    expect(minSheep, sheepWho).toBeGreaterThan(-0.15);
  });

  it("leaves no stretch of trail empty for long", () => {
    const avg = coverage.reduce((s, c) => s + c, 0) / coverage.length;
    expect(avg).toBeGreaterThan(0.85);
    expect(Math.min(...coverage)).toBeGreaterThan(0.6);
  });

  it("scatters from a running kid: rabbits and deer get away", () => {
    for (const kind of [K_RABBIT, K_DEER]) {
      const sim = simOf(fresh());
      run(sim, 60, FAR, { glow: 0.55, h0: 18 });
      const a = sim.env.agents.find((x) => x.kind === kind && x.present > 0.9)!;
      const kx = a.x + 4;
      const kz = a.z;
      const before = Math.hypot(a.x - kx, a.z - kz);
      run(sim, 60, kidAt(kx, kz, 7), { glow: 0.55, t0: 10, h0: 18 });
      expect(Math.hypot(a.x - kx, a.z - kz), KIND_NAMES[kind]).toBeGreaterThan(before + 3);
    }
  });

  it("never lets an animal walk through the kid, even a herd walking into it", () => {
    const sim = simOf(fresh());
    const cow = sim.env.agents.find((a) => a.kind === K_COW)!;
    const ele = sim.env.agents.find((a) => a.kind === K_ELEPHANT)!;
    const dt = 1 / 20;
    let worst = Infinity;
    let who = "";
    for (const target of [cow, ele]) {
      for (let i = 0; i < 1200; i++) {
        const k = kidAt(target.x - 10 + (i % 600) * 0.03, target.z, 0.6, 0, 1, 0);
        stepFauna(sim.env, k, dt, i * dt, 0.1, 10);
        for (const a of sim.env.agents) {
          if (a.kind === K_OWL || a.kind === K_KOOKABURRA || a.present < 0.5 || (a.kind === K_SQUIRREL && a.climb > 0) || (a.kind === K_KOALA && a.climb > 0.01) || a.kind === K_PLATYPUS) continue;
          const d = Math.hypot(a.x - k.x, a.z - k.z) - (TUNE[a.kind].body * a.s + 0.8);
          if (d < worst) {
            worst = d;
            who = `${KIND_NAMES[a.kind]}#${a.id} st${a.st} @ ${a.x.toFixed(1)},${a.z.toFixed(1)}`;
          }
        }
      }
    }
    expect(worst, who).toBeGreaterThan(-0.01);
  });

  it("sends animals across the path in front of a kid walking the trail", () => {
    const sim = simOf(fresh());
    run(sim, 200, FAR, { h0: 10 });
    const loop = TRAIL_POINTS[0];
    // the kid walks the loop trail (~4 units/s) for 3 minutes
    const path: [number, number][] = [];
    for (let i = 0; i < 3600; i++) {
      const u = (i * 0.2) / 2.4;
      const k = Math.floor(u) % loop.length;
      const k2 = (k + 1) % loop.length;
      const f = u - Math.floor(u);
      path.push([loop[k][0] + (loop[k2][0] - loop[k][0]) * f, loop[k][1] + (loop[k2][1] - loop[k][1]) * f]);
    }
    const side = new Float32Array(sim.env.agents.length);
    let crossedAhead = 0;
    const seen = new Set<number>();
    run(
      sim,
      3600,
      (i) => {
        const [x, z] = path[i];
        const [nx, nz] = path[Math.min(path.length - 1, i + 1)];
        const l = Math.hypot(nx - x, nz - z) || 1;
        return kidAt(x, z, 4, 0, (nx - x) / l, (nz - z) / l);
      },
      {
        h0: 10,
        t0: 10,
        every: (t) => {
          const i = Math.min(path.length - 2, Math.round((t - 10) * 20));
          const [x, z] = path[i];
          const [nx, nz] = path[i + 1];
          const l = Math.hypot(nx - x, nz - z) || 1;
          const dx = (nx - x) / l;
          const dz = (nz - z) / l;
          for (const a of sim.env.agents) {
            if (a.cls === C_NONE || a.present < 0.9) continue;
            const ahead = dx * (a.x - x) + dz * (a.z - z);
            const s = dx * (a.z - z) - dz * (a.x - x);
            if (ahead > 2 && ahead < 40 && Math.abs(s) < 12 && side[a.id] && Math.sign(s) !== Math.sign(side[a.id]) && !seen.has(a.id)) {
              crossedAhead++;
              seen.add(a.id);
            }
            side[a.id] = s;
          }
        },
      },
    );
    expect(crossedAhead).toBeGreaterThanOrEqual(3);
  });

  it("brings curious animals slowly closer to a kid standing still (but not too close)", () => {
    const sim = simOf(fresh());
    const env = sim.env;
    const cow = env.agents.find((a) => a.kind === K_COW && a.lead >= 0)!;
    let ang = 0;
    for (let k = 0; k < 16; k++) {
      ang = (k / 16) * Math.PI * 2;
      let clear = true;
      for (let d = 1; d <= 10; d += 0.5) clear &&= passable(env, cow, cow.x + Math.sin(ang) * d, cow.z + Math.cos(ang) * d);
      if (clear) break;
    }
    const kx = cow.x + Math.sin(ang) * 10;
    const kz = cow.z + Math.cos(ang) * 10;
    const k = kidAt(kx, kz, 0, 10);
    const before = Math.hypot(cow.x - kx, cow.z - kz);
    run(sim, 600, k, { h0: 10, t0: 50 });
    const after = Math.hypot(cow.x - kx, cow.z - kz);
    expect(after).toBeLessThan(before - 2);
    expect(after).toBeGreaterThan(TUNE[K_COW].body * cow.s + 0.8);
  });

  it("has a lamb tag along behind the kid for a bit", () => {
    const sim = simOf(fresh());
    const lamb = sim.env.agents.find((a) => a.kind === K_SHEEP && a.role === R_LAMB)!;
    lamb.cool = 0;
    let followed = 0;
    let near = 0;
    let steps = 0;
    const kx0 = lamb.x + 5;
    const kz0 = lamb.z;
    // (stroll off over dry, open meadow — whichever way that is from wherever the flock grazes:
    // the lamb can't follow into the lake or the sea)
    let dir = { x: 0.707, z: 0.707 };
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const d = { x: Math.sin(a), z: Math.cos(a) };
      let dry = true;
      for (let w = 0; w <= 96 && dry; w += 2) dry = dryLandAt(kx0 + d.x * w, kz0 + d.z * w) && waterSdf(kx0 + d.x * w, kz0 + d.z * w) > 3;
      if (dry) {
        dir = d;
        break;
      }
    }
    run(
      sim,
      1600,
      (i) => {
        // stand a while, then stroll slowly off
        const walk = Math.max(0, i - 400) * 0.08;
        const x = kx0 + walk * dir.x;
        const z = kz0 + walk * dir.z;
        return kidAt(x, z, i > 400 ? 1.6 : 0, i > 400 ? 0 : i / 20, dir.x, dir.z);
      },
      {
        h0: 10,
        every: (t) => {
          if (lamb.st === S_FOLLOW) followed++;
          const i = Math.round(t * 20);
          if (i > 600 && lamb.st === S_FOLLOW) {
            const walk = Math.max(0, i - 400) * 0.08;
            steps++;
            if (Math.hypot(lamb.x - (kx0 + walk * dir.x), lamb.z - (kz0 + walk * dir.z)) < 9) near++;
          }
        },
      },
    );
    expect(followed).toBeGreaterThan(100);
    expect(near / Math.max(1, steps)).toBeGreaterThan(0.8);
  });

  it("keeps day and night routines", () => {
    const sim = simOf(fresh());
    const env = sim.env;
    run(sim, 200, FAR, { glow: 0.02, h0: 12, day: 1e9 });
    for (const o of env.agents.filter((a) => a.kind === K_OWL)) expect(o.present).toBe(0);
    for (const f of env.agents.filter((a) => a.kind === K_FROG)) expect(activeNow(f, 0.02)).toBe(false);
    for (const w of env.agents.filter((a) => a.kind === K_WOMBAT)) expect(activeNow(w, 0.02, 12.5)).toBe(false);
    for (const k of env.agents.filter((a) => a.kind === K_KOOKABURRA)) expect(k.present).toBe(1);
    // (koalas doze up their trees all day)
    for (const k of env.agents.filter((a) => a.kind === K_KOALA)) expect(k.climb).toBeGreaterThan(0.5);
    run(sim, 1200, FAR, { glow: 1, h0: 23, t0: 20, day: 1e9 });
    for (const o of env.agents.filter((a) => a.kind === K_OWL)) expect(o.present).toBe(1);
    for (const s of env.agents.filter((a) => a.kind === K_SQUIRREL)) expect([S_CLIMB_UP, S_IN_TREE]).toContain(s.st);
    for (const c of env.agents.filter((a) => a.kind === K_CHICKEN)) expect(c.present).toBeLessThan(0.1);
  });

  it("walks ducklings in a line behind their mother, and chicks behind the hen", () => {
    const sim = simOf(fresh());
    const env = sim.env;
    run(sim, 1500, FAR, { glow: 0.2, h0: 10, day: 1e9 });
    for (const d of env.agents.filter((a) => (a.kind === K_DUCK || a.kind === K_CHICKEN) && a.role === R_DUCKLING)) {
      const L = env.agents[d.lead];
      expect(Math.hypot(d.x - L.x, d.z - L.z), KIND_NAMES[d.kind]).toBeLessThan(2.5);
      expect(passable(env, d, d.x, d.z)).toBe(true);
    }
  });

  it("keeps the platypus at the water's surface, where it can be seen", () => {
    const sim = simOf(fresh());
    const ps = sim.env.agents.filter((a) => a.kind === K_PLATYPUS);
    expect(ps.length).toBeGreaterThan(0);
    run(sim, 600, FAR, { glow: 0.3, h0: 18 });
    for (const p of ps) {
      expect(p.y).toBeGreaterThan(WATER_Y - 0.6);
      expect(p.y).toBeLessThan(WATER_Y + 0.6);
    }
  });

  it("hops the kangaroos", () => {
    const sim = simOf(fresh());
    const roos = sim.env.agents.filter((a) => a.kind === K_KANGAROO);
    let hopping = 0;
    run(sim, 2400, FAR, { h0: 9, every: () => roos.forEach((r) => r.v > 0.6 && r.bound > 0.9 && r.lift > 0.05 && hopping++) });
    expect(hopping).toBeGreaterThan(50);
  });

  it("only sends the big ones where they fit", () => {
    for (const a of plan.agents) {
      if (a.kind === K_GIRAFFE || a.kind === K_ELEPHANT || a.kind === K_COW) expect(a.cls).toBe(C_GIANT);
      if (a.kind === K_DEER || a.kind === K_KANGAROO) expect(a.cls).toBe(C_LARGE);
    }
  });
});

describe("pushKid: the kid can't walk through an animal's body", { timeout: 30000 }, () => {
  const kidR = 0.4;
  const blockingKinds = [...Array(KINDS).keys()].filter((k) => BLOCKS_KID[k]);

  it("blocks cows, elephants, giraffes, kangaroos, sheep (and every other blocking kind)", () => {
    expect(blockingKinds.map((k) => KIND_NAMES[k]).sort()).toEqual(["bear", "cow", "deer", "elephant", "emu", "fox", "giraffe", "goat", "horse", "kangaroo", "koala", "sheep", "wombat", "zebra"].sort());
  });

  it("pushes the kid outside every blocking animal's body footprint, sampled from any angle and depth", () => {
    for (const kind of blockingKinds) {
      const src = plan.agents.find((a) => a.kind === kind);
      expect(src, KIND_NAMES[kind]).toBeTruthy();
      const a: Agent = { ...src! };
      a.present = 1;
      if (kind === K_KOALA) a.climb = 0; // (on the ground, not up its tree — it blocks there too)
      const hw = TUNE[a.kind].body * a.s;
      const hl = hw * (BODY_LEN_MULT[a.kind] ?? 1);
      const sy = Math.sin(a.yaw);
      const cy = Math.cos(a.yaw);
      // many points inside the animal's bare body ellipse (no kid radius added — pushKid's own
      // footprint, inflated by kidR, is strictly bigger, so these are inside it too): every angle
      // round it, from dead centre out almost to the skin
      for (let k = 0; k < 24; k++) {
        const ang = (k / 24) * Math.PI * 2;
        for (const frac of [0, 0.4, 0.85, 0.99]) {
          const along = Math.cos(ang) * hl * frac;
          const side = Math.sin(ang) * hw * frac;
          const pos = { x: a.x + along * sy + side * cy, z: a.z + along * cy - side * sy };
          pushKid([a], pos, kidR);
          expect(kidInsideAny([a], pos.x, pos.z, kidR), `${KIND_NAMES[kind]} angle ${k} depth ${frac}`).toBe(false);
        }
      }
    }
  });

  it("copes wedged between two animals (a few passes resolve it, like the dinosaurs' pushKid)", () => {
    const cow = plan.agents.find((a) => a.kind === K_COW)!;
    const a: Agent = { ...cow, present: 1 };
    const b: Agent = { ...cow, present: 1 };
    const hw = TUNE[K_COW].body * a.s;
    // two cows side by side, a gap between them too narrow for the kid: dropped right in the middle
    b.x = a.x + hw * 1.3;
    b.z = a.z;
    const pos = { x: a.x + hw * 0.65, z: a.z };
    pushKid([a, b], pos, kidR);
    expect(kidInsideAny([a, b], pos.x, pos.z, kidR)).toBe(false);
  });

  it("doesn't block for tiny animals (rabbits, frogs, squirrels, turtles, ducks, chicks)", () => {
    for (const kind of [K_RABBIT, K_FROG, K_SQUIRREL, K_TURTLE, K_DUCK, K_CHICKEN]) {
      const src = plan.agents.find((a) => a.kind === kind);
      if (!src) continue;
      const a: Agent = { ...src, present: 1 };
      const pos = { x: a.x, z: a.z };
      expect(pushKid([a], pos, kidR), KIND_NAMES[kind]).toBe(false);
      expect(pos.x).toBe(a.x);
      expect(pos.z).toBe(a.z);
    }
  });

  it("doesn't block for perched/climbing animals (owls, kookaburras, birds in trees) or a climbing koala", () => {
    for (const kind of [K_OWL, K_KOOKABURRA]) {
      const src = plan.agents.find((a) => a.kind === kind);
      if (!src) continue;
      const a: Agent = { ...src, present: 1 };
      const pos = { x: a.x, z: a.z };
      expect(pushKid([a], pos, kidR), KIND_NAMES[kind]).toBe(false);
    }
    const koala = plan.agents.find((a) => a.kind === K_KOALA)!;
    const a: Agent = { ...koala, present: 1, climb: 0.5 };
    const pos = { x: a.x, z: a.z };
    expect(pushKid([a], pos, kidR)).toBe(false);
  });

  it("skips an animal well above or below the kid's feet (kidY given)", () => {
    const giraffe = plan.agents.find((a) => a.kind === K_GIRAFFE)!;
    const a: Agent = { ...giraffe, present: 1 };
    const pos = { x: a.x, z: a.z };
    // the kid, up on a high bridge well over the giraffe's head
    expect(pushKid([a], pos, kidR, a.y + a.head + 20)).toBe(false);
    expect(pos.x).toBe(a.x);
  });

  it("is fast: comfortably under 0.05 ms per call, even next to a cluster of big animals", () => {
    const agents = plan.agents;
    const cow = agents.find((a) => a.kind === K_COW)!;
    const pos = { x: 0, z: 0 };
    const reset = () => {
      pos.x = cow.x + 0.3;
      pos.z = cow.z + 0.3;
    };
    // warm up (the JIT optimises the hot path the way a running park would)
    for (let i = 0; i < 3000; i++) {
      reset();
      pushKid(agents, pos, 0.4, cow.y);
    }
    let ms = Infinity;
    for (let b = 0; b < 8; b++) {
      const t0 = performance.now();
      for (let i = 0; i < 500; i++) {
        reset();
        pushKid(agents, pos, 0.4, cow.y);
      }
      ms = Math.min(ms, (performance.now() - t0) / 500);
    }
    console.log(`pushKid: ${ms.toFixed(4)} ms / call (${agents.length} animals)`);
    expect(ms).toBeLessThan(0.05);
  });
});
