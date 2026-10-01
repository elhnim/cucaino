import { describe, expect, it } from "vitest";
import {
  DINO_CALM_GLSL,
  DINO_DECKS,
  DINO_FENCE_POSTS,
  DINO_ISLAND,
  DINO_LAGOON,
  DINO_OBSTACLES,
  DINO_PADDOCK,
  DINO_PROPS,
  DINO_RANGES,
  DINO_SEA_R,
  DINO_SPECIES,
  DINO_SPOTS,
  DINO_SPOT_FACTS,
  DINO_TORCHES,
  DINO_TRAIL,
  DINO_VOLCANO,
  DINO_WATER_Y,
  dinoCalm,
  dinoCoastR,
  dinoGroundY,
  dinoHeightAt,
  dinoInLagoon,
  dinoLandY,
  dinoSeaFloorY,
  dinoSnow,
  dinoWaterAt,
} from "./dinoIsland";
import { DEEP_FLOOR, TERRAIN_EXTENT, WATER_Y, WRAP_R } from "./terrain";
import { SKY_ISLANDS } from "./skyIslands";
import { ISLAND_R } from "./island";
import { VILLAGE_ISLAND, VILLAGE_SEA_R, villageGroundY, villageSeaFloorY } from "./villageIsland";

const I = DINO_ISLAND;
const hyp = Math.hypot;
const segDist = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const ux = bx - ax;
  const uz = bz - az;
  const t = Math.min(1, Math.max(0, ((px - ax) * ux + (pz - az) * uz) / (ux * ux + uz * uz || 1)));
  return hyp(ax + ux * t - px, az + uz * t - pz);
};
const propAt = (o: { x: number; z: number }) => DINO_PROPS.find((p) => p.x === o.x && p.z === o.z)?.kind ?? "(fence/rail)";

describe("Dino Isle (the Lost World island)", () => {
  it("shares the sea level and deep floor with the terrain", () => {
    expect(DINO_WATER_Y).toBe(WATER_Y);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      expect(dinoHeightAt(I.x + Math.sin(a) * (DINO_SEA_R - 1), I.z + Math.cos(a) * (DINO_SEA_R - 1))).toBeLessThan(DEEP_FLOOR + 0.5);
    }
  });

  it("sits far out at sea, clear of the main island's grid, Coralcove, the sky islands and the world wrap", () => {
    const d = hyp(I.x, I.z);
    expect(hyp(I.x - -330, I.z - 300)).toBeLessThan(40);
    expect(I.r).toBeGreaterThanOrEqual(70);
    expect(I.r).toBeLessThanOrEqual(110);
    const gx = Math.max(-TERRAIN_EXTENT, Math.min(TERRAIN_EXTENT, I.x));
    const gz = Math.max(-TERRAIN_EXTENT, Math.min(TERRAIN_EXTENT, I.z));
    expect(hyp(I.x - gx, I.z - gz)).toBeGreaterThan(DINO_SEA_R + 1);
    expect(d - DINO_SEA_R).toBeGreaterThan(ISLAND_R + 80);
    expect(d + DINO_SEA_R).toBeLessThan(WRAP_R - 60);
    expect(hyp(VILLAGE_ISLAND.x - I.x, VILLAGE_ISLAND.z - I.z)).toBeGreaterThan(DINO_SEA_R + VILLAGE_SEA_R + 100);
    for (const s of SKY_ISLANDS) expect(hyp(s.x - I.x, s.z - I.z), s.id).toBeGreaterThan(s.r + DINO_SEA_R + 10);
    // (and the two far islands don't claim each other's water)
    expect(villageGroundY(I.x, I.z)).toBeNull();
    expect(villageSeaFloorY(I.x, I.z)).toBeNull();
    expect(dinoGroundY(VILLAGE_ISLAND.x, VILLAGE_ISLAND.z)).toBeNull();
    expect(dinoSeaFloorY(VILLAGE_ISLAND.x, VILLAGE_ISLAND.z)).toBeNull();
  });

  it("has land above the sea inside the coast and a shallow reef ring round the beach", () => {
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const c = dinoCoastR(a);
      const at = (s: number) => [I.x + Math.sin(a) * c * s, I.z + Math.cos(a) * c * s] as const;
      const inl = at(0.7);
      expect(dinoGroundY(inl[0], inl[1]), `inland ${k}`).not.toBeNull();
      expect(dinoGroundY(inl[0], inl[1])!).toBeGreaterThan(0.9);
      for (const s of [1.05, 1.12, 1.2]) {
        const p = at(s);
        const f = dinoSeaFloorY(p[0], p[1])!;
        expect(f, `reef ${k} ${s}`).toBeLessThan(WATER_Y);
        expect(f, `reef ${k} ${s}`).toBeGreaterThan(-4.5);
      }
      const out = at(1.38);
      expect(dinoSeaFloorY(out[0], out[1])!).toBeLessThan(-12);
      const sea = at(1.1);
      if (!DINO_DECKS.some((d) => segDist(sea[0], sea[1], d.ax, d.az, d.bx, d.bz) < (d.r ?? d.half) + 0.1)) expect(dinoGroundY(sea[0], sea[1])).toBeNull();
    }
    expect(dinoSeaFloorY(I.x + DINO_SEA_R + 5, I.z)).toBeNull();
    expect(dinoGroundY(0, 0)).toBeNull();
    expect(dinoSeaFloorY(0, 0)).toBeNull();
  });

  it("the sea floor is continuous from the land out to the deep", () => {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + 0.1;
      let prev = dinoSeaFloorY(I.x + Math.sin(a) * 60, I.z + Math.cos(a) * 60)!;
      for (let r = 60; r < DINO_SEA_R; r += 0.5) {
        const f = dinoSeaFloorY(I.x + Math.sin(a) * r, I.z + Math.cos(a) * r)!;
        expect(Math.abs(f - prev), `${k} @ ${r}`).toBeLessThan(3.0);
        prev = f;
      }
    }
  });

  it("has two eras: warm jungle + plains in the south-east, snowy Ice Age land in the north-west", () => {
    expect(dinoSnow(I.x - 26, I.z - 44)).toBeGreaterThan(0.9);
    expect(dinoSnow(DINO_PADDOCK.x, DINO_PADDOCK.z)).toBe(0);
    expect(dinoSnow(DINO_VOLCANO.x, DINO_VOLCANO.z)).toBe(0);
    expect(dinoSnow(DINO_LAGOON.x, DINO_LAGOON.z)).toBeLessThan(0.1);
    // the volcano stands tall with a crater; its lava lake is an obstacle
    expect(DINO_VOLCANO.rimY).toBeGreaterThan(20);
    expect(DINO_VOLCANO.lavaY).toBeLessThan(DINO_VOLCANO.rimY);
    expect(DINO_OBSTACLES.some((o) => hyp(o.x - DINO_VOLCANO.x, o.z - DINO_VOLCANO.z) < 0.5 && o.r >= DINO_VOLCANO.lavaR)).toBe(true);
  });

  it("the lagoon is knee-deep and walkable, with dry banks (but for the river's outflow)", () => {
    const L = DINO_LAGOON;
    expect(dinoInLagoon(L.x, L.z)).toBe(true);
    const g = dinoGroundY(L.x, L.z)!;
    expect(L.waterY - g).toBeGreaterThan(0.3);
    expect(L.waterY - g).toBeLessThan(0.8);
    expect(dinoWaterAt(L.x, L.z)).toBe(L.waterY);
    let dry = 0;
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      const c = Math.cos(L.rot);
      const s = Math.sin(L.rot);
      const u = Math.sin(a) * L.rx * 1.5;
      const v = Math.cos(a) * L.rz * 1.5;
      if ((dinoLandY(L.x + u * c + v * s, L.z - u * s + v * c) ?? 0) > L.waterY + 0.1) dry++;
    }
    expect(dry).toBeGreaterThanOrEqual(28);
  });

  it("decks are walkable at their own height, and the jetty reaches out over the sea", () => {
    for (const d of DINO_DECKS) {
      const mx = (d.ax + d.bx) / 2;
      const mz = (d.az + d.bz) / 2;
      const y = dinoGroundY(mx, mz)!;
      expect(y, d.id).not.toBeNull();
      expect(y, d.id).toBeGreaterThan(0.7);
    }
    const jetty = DINO_DECKS.find((d) => d.id === "jetty")!;
    expect(dinoLandY(jetty.bx, jetty.bz)!).toBeLessThan(-1);
    // ramps meet the ground at their feet
    for (const d of DINO_DECKS.filter((q) => q.kind === "ramp" || q.kind === "bridge")) {
      if (d.id.endsWith("-a")) expect(Math.abs(d.ya - dinoLandY(d.ax, d.az)!), d.id).toBeLessThan(0.3);
      else expect(Math.abs(d.yb - dinoLandY(d.bx, d.bz)!), d.id).toBeLessThan(0.3);
      expect(Math.abs(d.yb - d.ya) / Math.hypot(d.bx - d.ax, d.bz - d.az), d.id).toBeLessThan(0.45);
    }
  });

  it("is full of things: the gate, torches, the hut, the paddock, nests, the dig, the camp, jungle, pines", () => {
    const count = (k: string) => DINO_PROPS.filter((p) => p.kind === k).length;
    for (const k of ["gate", "hut", "paddock", "platform", "tower", "dig", "tent", "campfire", "paintrock", "jeep"]) expect(count(k), k).toBeGreaterThanOrEqual(1);
    expect(count("nest")).toBeGreaterThanOrEqual(3);
    expect(count("bonehut")).toBeGreaterThanOrEqual(2);
    expect(count("palm")).toBeGreaterThanOrEqual(20);
    expect(count("araucaria") + count("jungletree") + count("treefern")).toBeGreaterThanOrEqual(60);
    expect(count("cycad") + count("fern") + count("bigleaf")).toBeGreaterThanOrEqual(60);
    expect(count("pine")).toBeGreaterThanOrEqual(25);
    expect(count("swamptree")).toBeGreaterThanOrEqual(6);
    expect(DINO_TORCHES.length).toBeGreaterThanOrEqual(6);
    // palms and ferns stay out of the snow; pines stay in it
    for (const p of DINO_PROPS) {
      if (p.kind === "palm" || p.kind === "cycad" || p.kind === "treefern") expect(dinoSnow(p.x, p.z), p.kind).toBeLessThan(0.5);
      if (p.kind === "pine") expect(dinoSnow(p.x, p.z)).toBeGreaterThan(0.3);
    }
  });

  it("props stand on dry ground (or on their decks)", () => {
    for (const p of DINO_PROPS) {
      if (p.kind === "reeds" || p.kind === "swamptree" || p.kind === "paddock" || p.kind === "fence" || p.kind === "dig") continue;
      const g = dinoGroundY(p.x, p.z);
      expect(g, `${p.kind} ${p.x - I.x},${p.z - I.z}`).not.toBeNull();
      expect(Math.abs(g! - p.y), p.kind).toBeLessThan(0.05);
      expect(g!, p.kind).toBeGreaterThan(0.8);
    }
  });

  it("obstacles don't overlap each other", () => {
    const O = DINO_OBSTACLES;
    for (let i = 0; i < O.length; i++)
      for (let j = i + 1; j < O.length; j++) expect(hyp(O[i].x - O[j].x, O[i].z - O[j].z), `${propAt(O[i])} / ${propAt(O[j])} @ ${(O[i].x - I.x).toFixed(1)},${(O[i].z - I.z).toFixed(1)}`).toBeGreaterThan(O[i].r + O[j].r - 0.3);
  });

  it("the paddock fence is closed: no gap a kid could squeeze through", () => {
    const P = DINO_FENCE_POSTS;
    for (let i = 0; i < P.length; i++) {
      const q = P[(i + 1) % P.length];
      expect(hyp(P[i].x - q.x, P[i].z - q.z)).toBeLessThan(0.72 * 2);
    }
  });

  it("the trail graph is connected, on walkable ground, and clear of obstacles", () => {
    const { nodes, edges } = DINO_TRAIL;
    expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
    const seen = new Set([0]);
    const stack = [0];
    while (stack.length) {
      const a = stack.pop()!;
      for (const [p, q] of edges) {
        const b = p === a ? q : q === a ? p : -1;
        if (b >= 0 && !seen.has(b)) {
          seen.add(b);
          stack.push(b);
        }
      }
    }
    expect(seen.size).toBe(nodes.length);
    for (const [a, b] of edges) {
      let prev: number | null = null;
      for (let k = 0; k <= 40; k++) {
        const x = nodes[a].x + ((nodes[b].x - nodes[a].x) * k) / 40;
        const z = nodes[a].z + ((nodes[b].z - nodes[a].z) * k) / 40;
        const g = dinoGroundY(x, z);
        expect(g, `${nodes[a].id}-${nodes[b].id} ${k}`).not.toBeNull();
        // (no sudden cliffs along the way)
        if (prev !== null) expect(Math.abs(g! - prev), `${nodes[a].id}-${nodes[b].id} step ${k}`).toBeLessThan(1.2);
        prev = g;
      }
      for (const o of DINO_OBSTACLES) expect(segDist(o.x, o.z, nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z), `${nodes[a].id}-${nodes[b].id} x ${propAt(o)}`).toBeGreaterThan(o.r + 0.3);
    }
  });

  it("the herds' ranges are open, dry land (clear of obstacles, water and cliffs)", () => {
    for (const [id, r] of Object.entries(DINO_RANGES)) {
      if (id === "trex") expect(hyp(r.x - DINO_PADDOCK.x, r.z - DINO_PADDOCK.z) + r.r).toBeLessThan(DINO_PADDOCK.r - 2);
      let wet = 0;
      let n = 0;
      for (let k = 0; k < 60; k++) {
        const a = k * 2.399;
        const rr = Math.sqrt((k + 0.5) / 60) * r.r;
        const x = r.x + Math.sin(a) * rr;
        const z = r.z + Math.cos(a) * rr;
        const g = dinoLandY(x, z);
        expect(g, `${id} ${k}`).not.toBeNull();
        expect(g!, `${id} ${k}`).toBeGreaterThan(0.9);
        if (dinoWaterAt(x, z) !== null) wet++;
        n++;
      }
      expect(wet / n, id).toBeLessThan(0.35);
      for (const o of DINO_OBSTACLES) {
        if (id === "sabre" && o.r > 1.5) continue; // (the cats lounge on their rock)
        if (id === "nests" && propAt(o) === "nest") continue; // (the babies play among the nests)
        expect(hyp(o.x - r.x, o.z - r.z), `${id} x ${propAt(o)}`).toBeGreaterThan(o.r + r.r * 0.5);
      }
    }
  });

  it("names spots for landing, the HUD and discoveries, all on walkable ground and clear of obstacles", () => {
    expect(new Set(DINO_SPOTS.map((s) => s.id)).size).toBe(DINO_SPOTS.length);
    for (const k of ["gate", "lookout", "nests", "volcano", "lagoon", "dig", "beach", "paddock", "glacier", "icecave", "camp"]) expect(DINO_SPOTS.some((s) => s.kind === k), k).toBe(true);
    for (const s of DINO_SPOTS) {
      expect(dinoGroundY(s.x, s.z), s.id).not.toBeNull();
      for (const o of DINO_OBSTACLES) expect(hyp(o.x - s.x, o.z - s.z), `${s.id} x ${propAt(o)}`).toBeGreaterThan(o.r + 0.8);
      expect(DINO_SPOT_FACTS[s.id], s.id).toBeTruthy();
    }
    for (const t of [...Object.values(DINO_SPOT_FACTS), ...Object.values(DINO_SPECIES).map((s) => s.fact)]) expect(t.length).toBeLessThan(100);
    expect(Object.values(DINO_SPECIES).filter((s) => s.era === "iceage").length).toBeGreaterThanOrEqual(6);
  });

  it("calms the swell over its reef (JS and GLSL agree on the shape)", () => {
    expect(dinoCalm(I.x, I.z)).toBeCloseTo(0.12, 5);
    expect(dinoCalm(I.x + I.r + 100, I.z)).toBeCloseTo(1, 5);
    expect(dinoCalm(0, 0)).toBe(1);
    expect(DINO_CALM_GLSL).toContain("float dinoCalm( vec2 p )");
    expect(DINO_CALM_GLSL).toContain(I.x.toFixed(2));
  });
});
