import { describe, expect, it } from "vitest";
import { SKY_GRID, SKY_ISLANDS, SKY_OBSTACLES, SKY_PROPS, skyBaseY, skyBob, skyIslandAt, skyLocalHeight, skyNodeHeight, skyStreamEnd, skyTopY, skyWalkable } from "./skyIslands";
import { groundY } from "./terrain";
import { skyLoopXZ, SKY_LOOP_N, PLACES } from "./places";

const hyp = Math.hypot;

describe("sky islands registry", () => {
  it("has 8–10 islands with unique ids, including several big floating mountains", () => {
    expect(SKY_ISLANDS.length).toBeGreaterThanOrEqual(8);
    expect(SKY_ISLANDS.length).toBeLessThanOrEqual(10);
    expect(new Set(SKY_ISLANDS.map((s) => s.id)).size).toBe(SKY_ISLANDS.length);
    const mountains = SKY_ISLANDS.filter((s) => s.kind === "mountain");
    expect(mountains.length).toBeGreaterThanOrEqual(3);
    for (const m of mountains) {
      expect(m.r).toBeGreaterThanOrEqual(18);
      expect(m.r).toBeLessThanOrEqual(35);
      expect(m.peak).toBeDefined();
      expect(m.peak!.h).toBeGreaterThanOrEqual(10);
      expect(m.peak!.h).toBeLessThanOrEqual(25);
      // the peak sits on one side of the top, leaving a big meadow
      expect(hyp(m.peak!.x - m.x, m.peak!.z - m.z)).toBeGreaterThan(m.r * 0.3);
      expect(hyp(m.peak!.x - m.x, m.peak!.z - m.z) + m.peak!.r).toBeLessThanOrEqual(m.r + 0.01);
    }
    for (const s of SKY_ISLANDS.filter((s) => s.kind !== "mountain")) {
      expect(s.r).toBeGreaterThanOrEqual(8);
      expect(s.r).toBeLessThanOrEqual(14);
    }
    expect(new Set(SKY_ISLANDS.map((s) => s.kind)).size).toBe(5);
  });

  it("floats 45–110 m up, well above the ground and the sea", () => {
    for (const s of SKY_ISLANDS) {
      expect(s.y).toBeGreaterThanOrEqual(45);
      expect(s.y).toBeLessThanOrEqual(110);
      let ground = -30;
      for (let k = 0; k < 16; k++) ground = Math.max(ground, groundY(s.x + Math.sin(k) * s.r * (k / 16), s.z + Math.cos(k) * s.r * (k / 16)));
      // the underside's tip stays well clear of the land under it
      expect(s.y - s.depth - ground, s.id).toBeGreaterThan(10);
    }
    // a couple float out over the sea
    expect(SKY_ISLANDS.filter((s) => groundY(s.x, s.z) < -1).length).toBeGreaterThanOrEqual(2);
  });

  it("don't overlap each other", () => {
    for (const a of SKY_ISLANDS)
      for (const b of SKY_ISLANDS) if (a !== b) expect(hyp(a.x - b.x, a.z - b.z), `${a.id} / ${b.id}`).toBeGreaterThan(a.r + b.r + 8);
  });

  it("keep clear of the Sky Coaster ring (r 90–115, below 35 m)", () => {
    for (const s of SKY_ISLANDS) {
      const d = hyp(s.x, s.z);
      const overlapsRing = d + s.r > 88 && d - s.r < 117;
      if (overlapsRing) expect(s.y - s.depth, s.id).toBeGreaterThan(36);
      // and clear of the actual track's control points by height
      for (let i = 0; i < SKY_LOOP_N; i++) {
        const [x, z] = skyLoopXZ(i);
        if (hyp(x - s.x, z - s.z) < s.r + 6) expect(s.y - s.depth, s.id).toBeGreaterThan(36);
      }
    }
  });

  it("skyTopY: inside a top it returns the heightfield (+ bob); outside it returns null", () => {
    for (const s of SKY_ISLANDS) {
      const at = skyTopY(s.landing.x, s.landing.z, 0);
      expect(at, s.id).not.toBeNull();
      expect(at!.id).toBe(s.id);
      expect(Math.abs(at!.y - s.y)).toBeLessThan(4);
      expect(at!.y).toBeCloseTo(skyBaseY(s, s.landing.x, s.landing.z) + skyBob(s.id, 0), 6);
      // just outside the rim, and far away
      expect(skyTopY(s.x + s.r + 0.5, s.z, 0)).toBeNull();
      expect(skyIslandAt(s.x + s.r + 0.5, s.z)).toBeNull();
      expect(skyIslandAt(s.x, s.z)?.id).toBe(s.id);
    }
    expect(skyTopY(0, 0, 0)).toBeNull();
    expect(skyTopY(500, 500, 3)).toBeNull();
  });

  it("the tops are gentle (walkable) heightfields that match the grid triangles exactly", () => {
    for (const s of SKY_ISLANDS) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = 0; k < 400; k++) {
        const a = k * 2.399;
        const d = Math.sqrt((k + 0.5) / 400) * s.r;
        const x = s.x + Math.sin(a) * d;
        const z = s.z + Math.cos(a) * d;
        if (!skyWalkable(s, x, z)) continue;
        const h = skyBaseY(s, x, z);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
        // slope over half a metre stays gentle
        const h2 = skyBaseY(s, x + 0.5, z);
        const h3 = skyBaseY(s, x, z + 0.5);
        expect(hyp(h2 - h, h3 - h) / 0.5, `${s.id} slope`).toBeLessThan(0.75);
      }
      expect(hi - lo, s.id).toBeLessThan(s.peak ? 6 : 3.5);
      // at grid nodes the surface IS the node height (the mesh vertices)
      for (let i = -2; i <= 2; i++)
        for (let j = -2; j <= 2; j++) expect(skyLocalHeight(s, i * SKY_GRID, j * SKY_GRID)).toBeCloseTo(skyNodeHeight(s, i, j), 9);
    }
  });

  it("puts every treasure (and landing spot) on walkable ground, clear of obstacles", () => {
    for (const s of SKY_ISLANDS) {
      for (const p of [s.treasure, s.landing]) {
        expect(skyTopY(p.x, p.z, 0)?.id, s.id).toBe(s.id);
        expect(hyp(p.x - s.x, p.z - s.z)).toBeLessThan(s.r - 1.5);
        for (const o of SKY_OBSTACLES) expect(hyp(o.x - p.x, o.z - p.z), `${s.id} treasure/landing vs obstacle`).toBeGreaterThan(o.r + 1);
      }
      // near (but not on) each other: the shard goes by the landing spot
      const d = hyp(s.treasure.x - s.landing.x, s.treasure.z - s.landing.z);
      expect(d).toBeGreaterThan(3);
      expect(d).toBeLessThan(12);
    }
  });

  it("peaks are not walkable and are obstacles", () => {
    for (const s of SKY_ISLANDS.filter((s) => s.peak)) {
      const p = s.peak!;
      expect(skyTopY(p.x, p.z, 0)).toBeNull();
      expect(skyTopY(p.x + p.r * 0.7, p.z, 1)).toBeNull();
      expect(skyIslandAt(p.x, p.z)?.id).toBe(s.id);
      expect(SKY_OBSTACLES.some((o) => o.id === s.id && o.x === p.x && o.z === p.z && o.r === p.r)).toBe(true);
    }
  });

  it("bobs gently and never more than 0.6 m", () => {
    for (const s of SKY_ISLANDS) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let t = 0; t < 60; t += 0.25) {
        const b = skyBob(s.id, t);
        lo = Math.min(lo, b);
        hi = Math.max(hi, b);
        expect(Math.abs(skyBob(s.id, t + 0.1) - b)).toBeLessThan(0.02); // slow
      }
      expect(Math.max(-lo, hi)).toBeLessThanOrEqual(0.6);
      expect(hi - lo).toBeGreaterThan(0.2);
    }
  });

  it("stands every prop on its own walkable top, off the peak, the stream and each other's trunks", () => {
    expect(SKY_PROPS.length).toBeGreaterThan(60);
    for (const p of SKY_PROPS) {
      const s = SKY_ISLANDS.find((i) => i.id === p.island)!;
      expect(skyWalkable(s, p.x, p.z), `${p.kind} on ${s.id}`).toBe(true);
    }
    for (const o of SKY_OBSTACLES) {
      expect(Number.isFinite(o.x) && Number.isFinite(o.z)).toBe(true);
      expect(o.r).toBeGreaterThan(0.25);
      expect(skyIslandAt(o.x, o.z)?.id).toBe(o.id);
    }
    // every island has something to find and something to walk round
    for (const s of SKY_ISLANDS) {
      expect(SKY_PROPS.filter((p) => p.island === s.id).length, s.id).toBeGreaterThanOrEqual(6);
      expect(SKY_OBSTACLES.filter((o) => o.id === s.id).length, s.id).toBeGreaterThanOrEqual(3);
      expect(SKY_PROPS.some((p) => p.island === s.id && (p.kind === "sign" || p.kind === "shrine" || p.kind === "altar")), s.id).toBe(true);
      const end = skyStreamEnd(s);
      expect(hyp(end.x - s.x, end.z - s.z)).toBeGreaterThan(s.r);
      expect(skyTopY(s.spring.x, s.spring.z, 0)?.id, `${s.id} spring`).toBe(s.id);
    }
  });

  it("is deterministic and keeps the Star Shard spots clear of places below (quests3d skips those)", () => {
    for (const s of SKY_ISLANDS) for (const p of PLACES) expect(hyp(p.x - s.landing.x, p.z - s.landing.z), `${s.id} over ${p.id}`).toBeGreaterThan(p.radius + 3);
    expect(skyTopY(SKY_ISLANDS[0].landing.x, SKY_ISLANDS[0].landing.z, 12.5)).toEqual(skyTopY(SKY_ISLANDS[0].landing.x, SKY_ISLANDS[0].landing.z, 12.5));
  });
});
