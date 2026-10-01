import { describe, expect, it } from "vitest";
import {
  FROST_ASCENT,
  FROST_BERGS,
  FROST_CALM_GLSL,
  FROST_CAVE,
  FROST_COLONY,
  FROST_FISHING,
  FROST_FLOES,
  FROST_ISLAND,
  FROST_OBSTACLES,
  FROST_POND,
  FROST_PROPS,
  FROST_SEA_R,
  FROST_SHORE,
  FROST_SLIDES,
  FROST_SPOTS,
  FROST_SWIMS,
  FROST_TERRACE,
  FROST_WATER_Y,
  SLIDE_FLOOR,
  frostCalm,
  frostChuteDistance,
  frostCliffK,
  frostCoastR,
  frostFacts,
  frostFloeAt,
  frostGroundY,
  frostHeightAt,
  frostLandY,
  frostOnPond,
  frostSeaFloorY,
  frostSlideSplash,
} from "./frostIsland";
import { DEEP_FLOOR, TERRAIN_EXTENT, WATER_Y, WRAP_R } from "./terrain";
import { SKY_ISLANDS } from "./skyIslands";
import { ISLAND_R } from "./island";
import { VILLAGE_ISLAND, VILLAGE_SEA_R } from "./villageIsland";

const I = FROST_ISLAND;
const hyp = Math.hypot;
const segDist = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const ux = bx - ax;
  const uz = bz - az;
  const t = Math.min(1, Math.max(0, ((px - ax) * ux + (pz - az) * uz) / (ux * ux + uz * uz || 1)));
  return hyp(ax + ux * t - px, az + uz * t - pz);
};
const polyDist = (x: number, z: number, pts: { x: number; z: number }[]) => {
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, segDist(x, z, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z));
  return d;
};

describe("Frostpeak Isle (the snowy penguin island)", () => {
  it("shares the sea level and deep floor with the terrain", () => {
    expect(FROST_WATER_Y).toBe(WATER_Y);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      expect(frostHeightAt(I.x + Math.sin(a) * (FROST_SEA_R - 1), I.z + Math.cos(a) * (FROST_SEA_R - 1)), `rim ${k}`).toBeLessThan(DEEP_FLOOR + 0.5);
    }
  });

  it("sits far out at sea, clear of the main island, the other far islands, the Abyss, the sky islands and the world wrap", () => {
    const d = hyp(I.x, I.z);
    expect(I.r).toBeGreaterThanOrEqual(60);
    expect(I.r).toBeLessThanOrEqual(80);
    // about (400, 240)
    expect(hyp(I.x - 400, I.z - 240)).toBeLessThan(25);
    const gx = Math.max(-TERRAIN_EXTENT, Math.min(TERRAIN_EXTENT, I.x));
    const gz = Math.max(-TERRAIN_EXTENT, Math.min(TERRAIN_EXTENT, I.z));
    expect(hyp(I.x - gx, I.z - gz)).toBeGreaterThan(FROST_SEA_R + 1);
    expect(d - FROST_SEA_R).toBeGreaterThan(ISLAND_R + 80);
    expect(d + FROST_SEA_R).toBeLessThan(WRAP_R - 60);
    expect(hyp(I.x - VILLAGE_ISLAND.x, I.z - VILLAGE_ISLAND.z)).toBeGreaterThan(FROST_SEA_R + VILLAGE_SEA_R + 50);
    // the Lost World (about (-330, 300), r <= 110 with its slopes to ~140) and the Abyss (a trench
    // between about (-150, -420) and (180, -520))
    expect(hyp(I.x + 330, I.z - 300)).toBeGreaterThan(FROST_SEA_R + 150 + 50);
    expect(segDist(I.x, I.z, -150, -420, 180, -520)).toBeGreaterThan(FROST_SEA_R + 150);
    for (const s of SKY_ISLANDS) expect(hyp(s.x - I.x, s.z - I.z), s.id).toBeGreaterThan(s.r + FROST_SEA_R + 10);
    // everything offshore (floes, bergs) stays inside its own slopes
    for (const f of [...FROST_FLOES, ...FROST_BERGS]) expect(hyp(f.x - I.x, f.z - I.z) + f.r).toBeLessThan(FROST_SEA_R);
  });

  it("has snowy land inside the coast, shallows round the beaches and sheer ice cliffs in the east", () => {
    let cliffs = 0;
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2 - Math.PI;
      const c = frostCoastR(a);
      const at = (s: number) => [I.x + Math.sin(a) * c * s, I.z + Math.cos(a) * c * s] as const;
      const inl = at(0.72);
      expect(frostGroundY(inl[0], inl[1]), `inland ${k}`).not.toBeNull();
      expect(frostGroundY(inl[0], inl[1])!).toBeGreaterThan(1);
      const top = at(0.86);
      expect(frostLandY(top[0], top[1])!, `beach ${k}`).toBeGreaterThan(0.8);
      const out = at(1.65);
      expect(frostSeaFloorY(out[0], out[1])!).toBeLessThan(-15);
      if (frostCliffK(a) > 0.95) {
        cliffs++;
        // a cliff: high snow right at the edge, deep water just off it
        expect(frostLandY(...at(0.94))!, `cliff top ${k}`).toBeGreaterThan(5);
        expect(frostSeaFloorY(...at(1.06))!, `cliff foot ${k}`).toBeLessThan(-4);
      } else if (frostCliffK(a) < 0.05) {
        // a beach: wadeable shallows (0 .. -4.5)
        for (const s of [1.04, 1.12, 1.2]) {
          const p = at(s);
          const f = frostSeaFloorY(p[0], p[1])!;
          expect(f, `shallows ${k} ${s}`).toBeLessThan(WATER_Y);
          expect(f, `shallows ${k} ${s}`).toBeGreaterThan(-4.5);
        }
      }
    }
    expect(cliffs).toBeGreaterThanOrEqual(8);
    expect(frostGroundY(0, 0)).toBeNull();
    expect(frostSeaFloorY(0, 0)).toBeNull();
    expect(frostSeaFloorY(I.x + FROST_SEA_R + 5, I.z)).toBeNull();
  });

  it("has a tall snowy peak", () => {
    let top = 0;
    for (let x = -30; x <= 40; x += 1) for (let z = -30; z <= 40; z += 1) top = Math.max(top, frostLandY(I.x + x, I.z + z) ?? 0);
    expect(top).toBeGreaterThan(30);
  });

  it("the sea floor is continuous from the land out to the deep", () => {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + 0.1;
      let prev = frostSeaFloorY(I.x + Math.sin(a) * 30, I.z + Math.cos(a) * 30)!;
      for (let r = 30.5; r < FROST_SEA_R; r += 0.5) {
        const f = frostSeaFloorY(I.x + Math.sin(a) * r, I.z + Math.cos(a) * r)!;
        // (the ice cliffs are sheer)
        expect(Math.abs(f - prev), `${k} @ ${r}`).toBeLessThan(frostCliffK(a) > 0.3 ? 6 : 1.4);
        prev = f;
      }
    }
  });

  it("has three slide chutes from Slide Top all the way down into the sea — always downhill", () => {
    expect(FROST_SLIDES.length).toBeGreaterThanOrEqual(3);
    expect(new Set(FROST_SLIDES.map((s) => s.id)).size).toBe(FROST_SLIDES.length);
    for (const s of FROST_SLIDES) {
      const P = s.path;
      expect(P.length, s.id).toBeGreaterThan(40);
      // starts on the terrace, high up
      expect(hyp(P[0].x - FROST_TERRACE.x, P[0].z - FROST_TERRACE.z), s.id).toBeLessThan(FROST_TERRACE.r + 1.5);
      expect(P[0].y, s.id).toBeGreaterThan(9);
      // ends in the sea (a splash), well out past the beach
      const last = P[P.length - 1];
      expect(last.y, s.id).toBeLessThan(WATER_Y - 0.8);
      const sp = frostSlideSplash(s);
      expect(sp, s.id).toBeGreaterThan(30);
      expect(P[sp].y).toBeLessThan(WATER_Y);
      expect(P[sp - 1].y).toBeGreaterThanOrEqual(WATER_Y);
      let steep = 0;
      for (let i = 1; i < P.length; i++) {
        const run = hyp(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z);
        expect(run, `${s.id} spacing ${i}`).toBeGreaterThan(0.5);
        expect(run, `${s.id} spacing ${i}`).toBeLessThan(1.6);
        const drop = (P[i - 1].y - P[i].y) / run;
        expect(drop, `${s.id} downhill ${i}`).toBeGreaterThan(0.02);
        expect(drop, `${s.id} not a cliff ${i}`).toBeLessThan(0.64);
        steep = Math.max(steep, drop);
      }
      expect(steep, `${s.id} has a thrilling drop`).toBeGreaterThan(0.4);
      // the chute's floor lies on the carved ground (the grid's triangles round off the steep
      // top a little)
      for (let i = 0; i < sp; i++) {
        if (P[i].y < WATER_Y + 0.2) continue; // (the last bit, sloping into the water)
        const g = frostGroundY(P[i].x, P[i].z);
        expect(g, `${s.id} ground ${i}`).not.toBeNull();
        expect(Math.abs(g! + SLIDE_FLOOR - P[i].y), `${s.id} on the snow ${i}`).toBeLessThan(i < 14 ? 0.35 : 0.15);
      }
    }
    // the chutes don't run into each other (except where they all start, on the terrace)
    for (let a = 0; a < FROST_SLIDES.length; a++)
      for (let b = a + 1; b < FROST_SLIDES.length; b++)
        for (const p of FROST_SLIDES[a].path.slice(8)) expect(polyDist(p.x, p.z, FROST_SLIDES[b].path), `${a}/${b}`).toBeGreaterThan(5);
  });

  it("the penguins' ramp climbs gently from the colony to Slide Top, beside (never on) the chutes", () => {
    const A = FROST_ASCENT;
    expect(hyp(A[0].x - FROST_COLONY.x, A[0].z - FROST_COLONY.z)).toBeLessThan(FROST_COLONY.r);
    expect(hyp(A[A.length - 1].x - FROST_TERRACE.x, A[A.length - 1].z - FROST_TERRACE.z)).toBeLessThan(FROST_TERRACE.r + 1);
    for (let i = 0; i + 1 < A.length; i++) {
      const L = hyp(A[i + 1].x - A[i].x, A[i + 1].z - A[i].z);
      for (let u = 0; u < L; u += 0.5) {
        const x = A[i].x + ((A[i + 1].x - A[i].x) * u) / L;
        const z = A[i].z + ((A[i + 1].z - A[i].z) * u) / L;
        const g = frostGroundY(x, z)!;
        expect(g, `ramp ${i} ${u}`).toBeGreaterThan(1.5);
        const g2 = frostGroundY(x + ((A[i + 1].x - A[i].x) / L) * 0.5, z + ((A[i + 1].z - A[i].z) / L) * 0.5)!;
        expect(Math.abs(g2 - g) / 0.5, `ramp grade ${i} ${u}`).toBeLessThan(0.6);
        expect(frostChuteDistance(x, z), `ramp ${i} ${u}`).toBeGreaterThan(2.4);
      }
    }
  });

  it("the swims home stay in the water, and the penguins hop out onto the colony's beach", () => {
    for (const sw of FROST_SWIMS) {
      expect(sw.length).toBeGreaterThanOrEqual(3);
      for (let i = 0; i + 1 < sw.length; i++)
        for (let u = 0; u <= 1; u += 0.1) {
          const x = sw[i].x + (sw[i + 1].x - sw[i].x) * u;
          const z = sw[i].z + (sw[i + 1].z - sw[i].z) * u;
          expect(frostSeaFloorY(x, z)!, `swim ${i}`).toBeLessThan(WATER_Y - 1);
          expect(frostFloeAt(x, z)).toBeNull();
        }
    }
    expect(frostSeaFloorY(FROST_SHORE.entry.x, FROST_SHORE.entry.z)!).toBeLessThan(WATER_Y - 0.8);
    expect(frostGroundY(FROST_SHORE.land.x, FROST_SHORE.land.z)!).toBeGreaterThan(0.3);
    expect(frostSeaFloorY(FROST_FISHING.x, FROST_FISHING.z)!).toBeLessThan(WATER_Y - 6);
    expect(frostGroundY(FROST_COLONY.x, FROST_COLONY.z)!).toBeCloseTo(FROST_COLONY.y, 1);
  });

  it("the frozen pond's ice is walkable, with snowy banks all round", () => {
    expect(frostOnPond(FROST_POND.x, FROST_POND.z)).toBe(true);
    expect(frostGroundY(FROST_POND.x, FROST_POND.z)!).toBeCloseTo(FROST_POND.iceY, 3);
    expect(frostLandY(FROST_POND.x, FROST_POND.z)!).toBeLessThan(FROST_POND.iceY);
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      const c = Math.cos(FROST_POND.rot);
      const s = Math.sin(FROST_POND.rot);
      const u = Math.sin(a) * FROST_POND.rx * 1.4;
      const v = Math.cos(a) * FROST_POND.rz * 1.4;
      expect(frostLandY(FROST_POND.x + u * c + v * s, FROST_POND.z - u * s + v * c)!, `bank ${k}`).toBeGreaterThan(FROST_POND.iceY + 0.05);
    }
  });

  it("ice floes float in open water and you can climb onto them", () => {
    for (const f of FROST_FLOES) {
      expect(frostGroundY(f.x, f.z), f.id).toBe(f.top);
      expect(f.top).toBeGreaterThan(WATER_Y + 0.4);
      expect(frostSeaFloorY(f.x, f.z)!).toBeLessThan(WATER_Y - 2);
      for (const g of FROST_FLOES) if (g !== f) expect(hyp(g.x - f.x, g.z - f.z)).toBeGreaterThan((f.r + g.r) * 1.25 + 2);
      for (const b of FROST_BERGS) expect(hyp(b.x - f.x, b.z - f.z)).toBeGreaterThan(f.r * 1.3 + b.r + 3);
    }
  });

  it("props stand on the snow (clear of the chutes), and obstacles don't overlap", () => {
    const count = (k: string) => FROST_PROPS.filter((p) => p.kind === k).length;
    expect(count("igloo")).toBeGreaterThanOrEqual(3);
    expect(count("hut")).toBe(1);
    expect(count("cave")).toBe(1);
    expect(count("pine")).toBeGreaterThanOrEqual(30);
    expect(count("slidegate")).toBe(FROST_SLIDES.length);
    // the way back up to Slide Top is marked; the ski run has its huts, lift and gates
    expect(count("arrow")).toBeGreaterThanOrEqual(4);
    expect(count("skihut")).toBe(1);
    expect(count("lodge")).toBe(1);
    expect(count("liftstation")).toBe(2);
    expect(count("pylon")).toBeGreaterThanOrEqual(3);
    expect(count("skigate")).toBeGreaterThanOrEqual(5);
    for (const p of FROST_PROPS) {
      const g = frostGroundY(p.x, p.z);
      expect(g, `${p.kind} ${p.x - I.x},${p.z - I.z}`).not.toBeNull();
      expect(Math.abs(g! - p.y), p.kind).toBeLessThan(0.05);
      expect(g!, p.kind).toBeGreaterThan(0.5);
      if (p.kind !== "slidegate" && p.kind !== "flag" && p.kind !== "sign") expect(frostChuteDistance(p.x, p.z), p.kind).toBeGreaterThan(3);
    }
    const O = FROST_OBSTACLES;
    for (let i = 0; i < O.length; i++) for (let j = i + 1; j < O.length; j++) expect(hyp(O[i].x - O[j].x, O[i].z - O[j].z), `${i}/${j}`).toBeGreaterThan(O[i].r + O[j].r - 0.8);
    // the ice cave has a way in
    const doorX = FROST_CAVE.x + Math.sin(FROST_CAVE.rot) * FROST_CAVE.r;
    const doorZ = FROST_CAVE.z + Math.cos(FROST_CAVE.rot) * FROST_CAVE.r;
    for (const o of O) expect(hyp(o.x - doorX, o.z - doorZ)).toBeGreaterThan(o.r + 0.6);
  });

  it("has discoveries everywhere worth finding, each with real facts", () => {
    expect(new Set(FROST_SPOTS.map((s) => s.id)).size).toBe(FROST_SPOTS.length);
    const kinds = new Set(FROST_SPOTS.map((s) => s.kind));
    for (const k of ["colony", "slide", "icecave", "igloo", "peak", "floe", "aurora", "ski"]) expect(kinds.has(k as never), k).toBe(true);
    for (const s of FROST_SPOTS) {
      expect(hyp(s.x - I.x, s.z - I.z), s.id).toBeLessThan(FROST_SEA_R);
      const f = frostFacts(s.id);
      expect(f.length, s.id).toBeGreaterThan(0);
      for (const line of f) expect(line.length, s.id).toBeGreaterThan(20);
    }
    expect(frostFacts("frost-colony").some((l) => /500 m/.test(l))).toBe(true);
  });

  it("calms the sea round the island", () => {
    expect(frostCalm(I.x, I.z)).toBeCloseTo(0.12, 5);
    expect(frostCalm(I.x + 400, I.z)).toBeCloseTo(1, 5);
    const near = frostCalm(I.x + I.r + 20, I.z);
    expect(near).toBeGreaterThan(0.12);
    expect(near).toBeLessThan(0.6);
    expect(FROST_CALM_GLSL).toContain("frostCalm");
    expect(FROST_CALM_GLSL).toContain(I.x.toFixed(2));
  });
});
