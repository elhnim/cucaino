import { describe, expect, it } from "vitest";
import { RUNE_STONE_RING, SKY_BRIDGES, SKY_GRID, SKY_HOME, SKY_ISLANDS, SKY_OBSTACLES, SKY_PADS, SKY_PROPS, SKY_RUNE_STONES, SKY_SPOTS, runeStoneAt, skyBaseY, skyRim, skyRimMax, skyRimRadius, SKY_RIM_N, skyBob, skyBridgeY, skyIslandAt, skyIslandById, skyLocalHeight, skyNodeHeight, skyStreamEnd, skyTopY, skyWalkable, stonesLit } from "./skyIslands";
import { groundY, groundYFar } from "./terrain";
import { seaDist } from "./island";
import { STATIONS } from "./railway";
import { skyLoopXZ, SKY_LOOP_N, PLACES } from "./places";

const hyp = Math.hypot;

describe("sky islands registry", () => {
  it("has ~14 islands with unique ids, including several big floating mountains", () => {
    expect(SKY_ISLANDS.length).toBeGreaterThanOrEqual(12);
    expect(SKY_ISLANDS.length).toBeLessThanOrEqual(15);
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

  it("has lobed, bay-and-promontory outlines (not circles), pinned where bridges and waterfalls meet the edge", () => {
    for (const s of SKY_ISLANDS) {
      const R = skyRim(s);
      expect(R.length).toBe(SKY_RIM_N);
      const lo = Math.min(...R);
      const hi = Math.max(...R);
      expect(hi / lo, s.id).toBeGreaterThan(1.15);
      expect(lo).toBeGreaterThan(s.r * 0.75);
      expect(hi).toBeLessThan(s.r * 1.3);
      // the waterfall pours off the old lip, and bridge decks meet the rim
      expect(Math.abs(skyRimRadius(s, Math.sin(s.fall), Math.cos(s.fall)) - s.r), `${s.id} fall`).toBeLessThan(0.3);
    }
    for (const br of SKY_BRIDGES) {
      const a = skyIslandById(br.a)!;
      const b = skyIslandById(br.b)!;
      expect(Math.abs(skyRimRadius(a, br.ax - a.x, br.az - a.z) - a.r), br.id).toBeLessThan(0.3);
      expect(Math.abs(skyRimRadius(b, br.bx - b.x, br.bz - b.z) - b.r), br.id).toBeLessThan(0.3);
    }
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
      for (const b of SKY_ISLANDS)
        if (a !== b) expect(hyp(a.x - b.x, a.z - b.z) - skyRimRadius(a, b.x - a.x, b.z - a.z) - skyRimRadius(b, a.x - b.x, a.z - b.z), `${a.id} / ${b.id}`).toBeGreaterThan(8);
  });

  it("keep clear of the Sky Coaster ring (r 90–115, below 35 m)", () => {
    for (const s of SKY_ISLANDS) {
      const d = hyp(s.x, s.z);
      const overlapsRing = d + skyRimMax(s) > 88 && d - skyRimMax(s) < 117;
      if (overlapsRing) expect(s.y - s.depth, s.id).toBeGreaterThan(36);
      // and clear of the actual track's control points by height
      for (let i = 0; i < SKY_LOOP_N; i++) {
        const [x, z] = skyLoopXZ(i);
        if (hyp(x - s.x, z - s.z) < skyRimMax(s) + 6) expect(s.y - s.depth, s.id).toBeGreaterThan(36);
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
      const out = skyRimRadius(s, 1, 0) + 0.5;
      expect(skyTopY(s.x + out, s.z, 0)).toBeNull();
      expect(skyIslandAt(s.x + out, s.z)).toBeNull();
      expect(skyIslandAt(s.x + out - 1, s.z)?.id).toBe(s.id);
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
      expect(SKY_PROPS.some((p) => p.island === s.id && (p.kind === "sign" || p.kind === "altar")) || SKY_SPOTS.some((p) => p.island === s.id), s.id).toBe(true);
      const end = skyStreamEnd(s);
      expect(hyp(end.x - s.x, end.z - s.z)).toBeGreaterThan(s.r);
      expect(skyTopY(s.spring.x, s.spring.z, 0)?.id, `${s.id} spring`).toBe(s.id);
    }
  });

  it("floats over the Great Lake, well away from the park, high above the ground and clear of the peaks", () => {
    for (const s of SKY_ISLANDS) {
      // nowhere near the park (it used to hang right over it) …
      expect(hyp(s.x, s.z), s.id).toBeGreaterThan(1000);
      // … a short flight from Lake Station and its dragon
      const st = STATIONS.find((q) => q.id === "lake-station")!;
      expect(hyp(s.x - st.x, s.z - st.z), s.id).toBeLessThan(520);
      // … over land or lake (never out at sea), with clear air under its rock all the way round
      expect(seaDist(s.x, s.z), s.id).toBeLessThan(-40);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        for (const f of [0, 0.5, 1.15]) expect(s.y - s.depth - groundYFar(s.x + Math.sin(a) * s.r * f, s.z + Math.cos(a) * s.r * f), s.id).toBeGreaterThan(12);
      }
    }
    expect(Math.abs(SKY_HOME.x % SKY_GRID)).toBe(0);
    expect(Math.abs(SKY_HOME.z % SKY_GRID)).toBe(0);
  });

  it("carries no park buildings (they stand in the park); any pad added later is flat, clear and walkable", () => {
    expect(SKY_PADS.map((p) => p.placeId)).toEqual([]);
    for (const id of ["arcade", "retro-arcade", "story-theatre", "library", "learning-tree"]) {
      const p = PLACES.find((q) => q.id === id)!;
      expect(p.sky, id).toBeUndefined();
      expect(hyp(p.x, p.z), id).toBeLessThan(150);
    }
    for (const p of SKY_PADS) {
      const s = skyIslandById(p.island)!;
      expect(p.r).toBeGreaterThanOrEqual(p.placeId === "learning-tree" ? 3.5 : 5);
      const h0 = skyBaseY(s, p.x, p.z);
      for (let k = 0; k < 60; k++) {
        const a = k * 2.399;
        const d = Math.sqrt((k + 0.5) / 60) * p.r;
        const x = p.x + Math.sin(a) * d;
        const z = p.z + Math.cos(a) * d;
        expect(skyTopY(x, z, 0)?.id, `${p.placeId} walkable`).toBe(s.id);
        expect(Math.abs(skyBaseY(s, x, z) - h0), `${p.placeId} flat`).toBeLessThan(1e-6);
      }
      for (const o of SKY_OBSTACLES) expect(hyp(o.x - p.x, o.z - p.z) - o.r, `${p.placeId} vs obstacle`).toBeGreaterThan(p.r);
      for (const pr of SKY_PROPS) expect(hyp(pr.x - p.x, pr.z - p.z), `${p.placeId} vs ${pr.kind}`).toBeGreaterThan(p.r + 0.5);
      expect(hyp(p.x - s.treasure.x, p.z - s.treasure.z)).toBeGreaterThan(p.r + 2);
      expect(hyp(p.x - s.landing.x, p.z - s.landing.z)).toBeGreaterThan(p.r + 4);
      expect(hyp(p.x - s.spring.x, p.z - s.spring.z)).toBeGreaterThan(p.r + 1);
      if (s.peak) expect(hyp(p.x - s.peak.x, p.z - s.peak.z)).toBeGreaterThan(p.r + s.peak.r + 1);
      expect(hyp(p.x - s.x, p.z - s.z) + p.r).toBeLessThan(s.r - 2);
      // the door faces the landing spot
      expect(Math.cos(p.face - Math.atan2(s.landing.x - p.x, s.landing.z - p.z))).toBeGreaterThan(0.999);
      for (const q of SKY_PADS) if (q !== p) expect(hyp(q.x - p.x, q.z - p.z)).toBeGreaterThan(q.r + p.r + 1.5);
    }
  });

  it("has 2–4 things to discover on every island (30+), each on walkable ground with open ground round it", () => {
    expect(SKY_SPOTS.length).toBeGreaterThanOrEqual(30);
    expect(new Set(SKY_SPOTS.map((s) => s.id)).size).toBe(SKY_SPOTS.length);
    for (const s of SKY_ISLANDS) {
      const n = SKY_SPOTS.filter((p) => p.island === s.id).length;
      expect(n, s.id).toBeGreaterThanOrEqual(2);
      expect(n, s.id).toBeLessThanOrEqual(4);
    }
    const kinds = new Set<string>(SKY_SPOTS.map((s) => s.kind));
    for (const k of ["cave", "nest", "stones", "telescope", "launcher", "hotspring", "bell", "swing", "garden", "lookout", "shrine"]) expect(kinds.has(k), k).toBe(true);
    for (const sp of SKY_SPOTS) {
      expect(sp.name.length).toBeGreaterThan(3);
      expect(sp.text.length).toBeGreaterThan(10);
      expect(skyTopY(sp.x, sp.z, 0)?.id, sp.id).toBe(sp.island);
      if (sp.kind === "telescope" || sp.kind === "launcher") {
        expect(skyIslandById(sp.target!), sp.id).toBeDefined();
        expect(sp.target).not.toBe(sp.island);
      }
      // somewhere inside its discovery radius you can stand (walkable and clear of obstacles)
      let open = 0;
      for (let k = 0; k < 40; k++) {
        const a = k * 2.399;
        const d = Math.sqrt((k + 0.5) / 40) * sp.r;
        const x = sp.x + Math.sin(a) * d;
        const z = sp.z + Math.cos(a) * d;
        if (skyTopY(x, z, 0) && !SKY_OBSTACLES.some((o) => hyp(o.x - x, o.z - z) < o.r + 0.4)) open++;
      }
      expect(open, `${sp.id} has room to stand`).toBeGreaterThan(4);
      // clear of the pads, the chest and the landing spot
      for (const p of SKY_PADS) expect(hyp(p.x - sp.x, p.z - sp.z), sp.id).toBeGreaterThan(p.r + 1.5);
      const s = skyIslandById(sp.island)!;
      expect(hyp(s.treasure.x - sp.x, s.treasure.z - sp.z), sp.id).toBeGreaterThan(2.5);
      expect(hyp(s.landing.x - sp.x, s.landing.z - sp.z), sp.id).toBeGreaterThan(3);
    }
    // the caves sit at the foot of their peaks
    for (const c of SKY_SPOTS.filter((s) => s.kind === "cave")) {
      const s = skyIslandById(c.island)!;
      expect(s.peak).toBeDefined();
      expect(hyp(c.x - s.peak!.x, c.z - s.peak!.z)).toBeLessThan(s.peak!.r + 4.5);
    }
  });

  it("rune circles: five walkable stones each, clear of obstacles, and the lit-count logic", () => {
    const circles = SKY_SPOTS.filter((s) => s.kind === "stones");
    expect(circles.length).toBeGreaterThanOrEqual(2);
    for (const c of circles) {
      const stones = SKY_RUNE_STONES.filter((s) => s.spot === c.id);
      expect(stones.length).toBe(5);
      for (const st of stones) {
        expect(hyp(st.x - c.x, st.z - c.z)).toBeCloseTo(RUNE_STONE_RING, 6);
        expect(skyTopY(st.x, st.z, 0)?.id).toBe(c.island);
        expect(runeStoneAt(st.x + 0.3, st.z)).toEqual(st);
        for (const o of SKY_OBSTACLES) expect(hyp(o.x - st.x, o.z - st.z), `${c.id} stone ${st.i}`).toBeGreaterThan(o.r + 0.3);
      }
      expect(stonesLit(c.id, [])).toEqual({ lit: 0, total: 5, done: false });
      expect(stonesLit(c.id, [`${c.id}#0`, `${c.id}#0`, `${c.id}#3`])).toEqual({ lit: 2, total: 5, done: false });
      expect(stonesLit(c.id, stones.map((s) => `${c.id}#${s.i}`)).done).toBe(true);
    }
    expect(runeStoneAt(0, 0)).toBeNull();
  });

  it("rope bridges: short, gentle, walkable decks that meet both tops and clear every obstacle", () => {
    expect(SKY_BRIDGES.length).toBeGreaterThanOrEqual(4);
    for (const br of SKY_BRIDGES) {
      const len = hyp(br.bx - br.ax, br.bz - br.az);
      expect(len - 2, br.id).toBeLessThan(25);
      const ya = skyBridgeY(br, 0, 0);
      const yb = skyBridgeY(br, 1, 0);
      expect(Math.abs(yb - ya) / len, `${br.id} slope`).toBeLessThan(0.4);
      // the ends meet the grass
      expect(ya).toBeCloseTo(skyTopY(br.ax, br.az, 0)!.y, 6);
      expect(yb).toBeCloseTo(skyTopY(br.bx, br.bz, 0)!.y, 6);
      // mid-deck is walkable; the bob of both ends is blended
      for (const t of [0, 7.3]) {
        const on = skyTopY((br.ax + br.bx) / 2, (br.az + br.bz) / 2, t);
        expect(on?.bridge).toBe(br.id);
        expect(on!.y).toBeCloseTo(skyBridgeY(br, 0.5, t), 6);
        expect([br.a, br.b]).toContain(on!.id);
      }
      // off the side of the deck: nothing to stand on
      const px = -(br.bz - br.az) / len;
      const pz = (br.bx - br.ax) / len;
      expect(skyTopY((br.ax + br.bx) / 2 + px * (br.half + 0.4), (br.az + br.bz) / 2 + pz * (br.half + 0.4), 0)).toBeNull();
      // nothing solid on the deck or the path onto it
      const dx = br.bx - br.ax;
      const dz = br.bz - br.az;
      for (const o of SKY_OBSTACLES) {
        const u = Math.max(-0.2, Math.min(1.2, ((o.x - br.ax) * dx + (o.z - br.az) * dz) / (len * len)));
        const d = hyp(o.x - br.ax - dx * u, o.z - br.az - dz * u);
        expect(d, `${br.id} vs obstacle`).toBeGreaterThan(o.r + br.half - 0.05);
      }
    }
  });

  it("is deterministic and keeps the Star Shard spots clear of places below (quests3d skips those)", () => {
    for (const s of SKY_ISLANDS) for (const p of PLACES) expect(hyp(p.x - s.landing.x, p.z - s.landing.z), `${s.id} over ${p.id}`).toBeGreaterThan(p.radius + 3);
    expect(skyTopY(SKY_ISLANDS[0].landing.x, SKY_ISLANDS[0].landing.z, 12.5)).toEqual(skyTopY(SKY_ISLANDS[0].landing.x, SKY_ISLANDS[0].landing.z, 12.5));
  });
});
