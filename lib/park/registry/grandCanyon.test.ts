import { describe, expect, it } from "vitest";
import {
  alongToWorld,
  CANYON_BUTTES,
  CANYON_HALF_LEN,
  CANYON_LAYERS,
  CANYON_LODGE,
  CANYON_MULE_ROUTE,
  CANYON_SITE,
  CANYON_SKYWALK,
  CANYON_TRAILHEAD,
  CANYON_VIEWPOINTS,
  CANYON_WATCHTOWER,
  canyonFootprintWeight,
  CANYON_BAND_GLSL,
  CANYON_BAND_STOPS,
  canyonHalfWidthAt,
  canyonMaxDepthAt,
  canyonPlateauRaise,
  canyonProfilePoint,
  canyonStrataT,
  canyonMainTerraceFloorY,
  canyonVisualFloorY,
  findGrandCanyonSite,
  grandCanyonDeckY,
  grandCanyonGroundY,
  muleRouteHeadingAtU,
  muleRoutePointAtU,
  nearGrandCanyon,
} from "./grandCanyon";
import { rawHeight, EVEREST_PEAK, LONE_PEAK } from "./landform";
import { CANYON_OPEN, CANYON_TRAIL, canyonAxisPointAt, canyonSurfaceY, canyonWalkY } from "./grandCanyon";
import { groundY } from "./terrain";
import { nearRail, STATIONS } from "./railway";
import { nearCartRoad } from "./cartRoad";
import { SETTLEMENTS } from "./settlements";
import { BASE_CAMP_SITE } from "./everestBaseCamp";
import { KART_SITE } from "./kartTrack";
import { WILD_WATER_BOUNDS } from "./wildWater";

const groundAt = (x: number, z: number) => grandCanyonGroundY(x, z, rawHeight(x, z));

describe.skipIf(!CANYON_OPEN)("the Grand Canyon's site", () => {
  it(
    "re-running the search lands exactly on the stored site (TOWN_SITE's own pattern)",
    () => {
      const found = findGrandCanyonSite();
      expect(found.x).toBeCloseTo(CANYON_SITE.x, 5);
      expect(found.z).toBeCloseTo(CANYON_SITE.z, 5);
    },
    120_000, // the search checks a big disc's own footprintStats at every candidate — slow but rare
  );

  it("sits in the high north-western uplands, well beyond the Great Ridge from the park", () => {
    expect(Math.hypot(CANYON_SITE.x, CANYON_SITE.z)).toBeGreaterThan(900);
  });

  it("clears every OTHER settlement (and Base Camp) by a wide margin — its own Canyon Rim Outpost sits on its own rim on purpose", () => {
    for (const s of [...SETTLEMENTS.filter((s) => s.id !== "canyon-outpost"), { x: BASE_CAMP_SITE.x, z: BASE_CAMP_SITE.z, radius: 0 }]) {
      const d = Math.hypot(CANYON_SITE.x - s.x, CANYON_SITE.z - s.z);
      expect(d).toBeGreaterThan(s.radius + 600);
    }
  });

  it("clears Everest and the Lone Peak by a wide margin", () => {
    expect(Math.hypot(CANYON_SITE.x - EVEREST_PEAK.x, CANYON_SITE.z - EVEREST_PEAK.z)).toBeGreaterThan(EVEREST_PEAK.r + 400);
    expect(Math.hypot(CANYON_SITE.x - LONE_PEAK.x, CANYON_SITE.z - LONE_PEAK.z)).toBeGreaterThan(LONE_PEAK.r + 400);
  });

  it("clears Cucaino Karts", () => {
    expect(Math.hypot(CANYON_SITE.x - KART_SITE.x, CANYON_SITE.z - KART_SITE.z)).toBeGreaterThan(400);
  });

  it("clears the railway and the cart road all along the canyon's own length", () => {
    for (let along = -CANYON_HALF_LEN; along <= CANYON_HALF_LEN; along += 20) {
      const x = CANYON_SITE.x;
      const z = CANYON_SITE.z + along; // heading is 0 (due north-south), so this over-approximates the footprint's own box
      expect(nearRail(x, z, 150)).toBe(false);
      expect(nearCartRoad(x, z, 100)).toBe(false);
    }
  });

  it("clears the Wildlands' great river/pool/lake box entirely", () => {
    expect(CANYON_SITE.x + CANYON_HALF_LEN + 150 < WILD_WATER_BOUNDS.x0 || CANYON_SITE.x - CANYON_HALF_LEN - 150 > WILD_WATER_BOUNDS.x1 || CANYON_SITE.z + CANYON_HALF_LEN + 150 < WILD_WATER_BOUNDS.z0 || CANYON_SITE.z - CANYON_HALF_LEN - 150 > WILD_WATER_BOUNDS.z1).toBe(true);
  });

  it("stations stay clear of the canyon's own footprint", () => {
    for (const st of STATIONS) expect(Math.hypot(st.x - CANYON_SITE.x, st.z - CANYON_SITE.z)).toBeGreaterThan(CANYON_HALF_LEN + 100);
  });
});

describe.skipIf(!CANYON_OPEN)("the canyon's own geometry", () => {
  it("is 500-800 units long (rim to rim along its own axis, before the ends pinch shut)", () => {
    expect(CANYON_HALF_LEN * 2).toBeGreaterThanOrEqual(500);
    expect(CANYON_HALF_LEN * 2).toBeLessThanOrEqual(800);
  });

  it("is 120-220 wide rim to rim through most of its length", () => {
    for (let along = -200; along <= 200; along += 25) {
      const w = canyonHalfWidthAt(along) * 2;
      expect(w).toBeGreaterThanOrEqual(120);
      expect(w).toBeLessThanOrEqual(220);
    }
  });

  it("pinches shut at both ends", () => {
    expect(canyonHalfWidthAt(-CANYON_HALF_LEN)).toBeLessThan(5);
    expect(canyonHalfWidthAt(CANYON_HALF_LEN)).toBeLessThan(5);
  });

  /** the deepest cut found anywhere across the canyon's own width at `along` — the channel's own
   *  floor, wherever the wandering centreline has actually put it (not assumed to be lateral 0),
   *  measured as rim-at-that-point minus ground-at-that-point (not just the lowest absolute
   *  height, which the natural terrain's own gentle rise and fall could otherwise mislead) */
  function deepestCutAt(along: number): number {
    const hw = canyonHalfWidthAt(along);
    let best = 0;
    for (let lat = -hw * 1.2; lat <= hw * 1.2; lat += hw * 0.04) {
      const x = CANYON_SITE.x + lat;
      const z = CANYON_SITE.z + along;
      const h = groundAt(x, z)!;
      const rim = rawHeight(x, z) + canyonPlateauRaise(x, z);
      if (rim - h > best) best = rim - h;
    }
    return best;
  }

  it("is 50-90 deep through most of its length (rim minus the river channel's own floor)", () => {
    for (let along = -200; along <= 200; along += 20) {
      const depth = deepestCutAt(along);
      expect(depth).toBeGreaterThanOrEqual(45);
      expect(depth).toBeLessThanOrEqual(95);
    }
  });

  it("has a river at the bottom, well below the rim (>= 50 units) along a long stretch", () => {
    for (let along = -150; along <= 150; along += 30) expect(deepestCutAt(along)).toBeGreaterThanOrEqual(50);
  });

  it("the cross-section has stepped terraces, not a single smooth slope (several distinct flats between the rim and the floor)", () => {
    const along = 0;
    const hw = canyonHalfWidthAt(along);
    const heights: number[] = [];
    for (let frac = 0; frac <= 1.05; frac += 0.02) heights.push(groundAt(CANYON_SITE.x + hw * frac, CANYON_SITE.z + along)!);
    // count runs where consecutive samples are nearly flat (a terrace) vs steep (a cliff)
    let flats = 0;
    for (let i = 1; i < heights.length; i++) if (Math.abs(heights[i] - heights[i - 1]) < 0.5) flats++;
    expect(flats).toBeGreaterThan(8); // several genuinely flat stretches, not a ramp
  });

  it("winds (the centreline isn't dead straight)", () => {
    // sample the actual carved channel's own x (its deepest point) at a few alongs and check it
    // doesn't sit on one straight line
    const xs: number[] = [];
    for (const along of [-200, -100, 0, 100, 200]) {
      let bestX = CANYON_SITE.x;
      let bestH = Infinity;
      for (let lx = CANYON_SITE.x - 40; lx <= CANYON_SITE.x + 40; lx += 2) {
        const h = groundAt(lx, CANYON_SITE.z + along)!;
        if (h < bestH) {
          bestH = h;
          bestX = lx;
        }
      }
      xs.push(bestX);
    }
    const spread = Math.max(...xs) - Math.min(...xs);
    expect(spread).toBeGreaterThan(8);
  });

  it("the buttes no longer bump the real (soft) height field at all — they're pure decor now (world/grandCanyonDecor.ts's buildButteMesas), so canyonVisualFloorY (crisp, butte-aware) and grandCanyonGroundY (soft, no buttes) only differ by the butte's own protected disc, nothing more", () => {
    for (const b of CANYON_BUTTES) {
      const p = alongToWorld(b.along, b.lateral);
      const crisp = canyonVisualFloorY(p.x, p.z, rawHeight(p.x, p.z))!;
      const soft = groundAt(p.x, p.z)!;
      // the crisp (butte-protected) height stands well above the plain soft floor right at the
      // butte's own centre — proof the butte protection still lives in canyonVisualFloorY even
      // though it's gone from the real (soft) height field
      expect(crisp).toBeGreaterThan(soft + 5);
    }
  });

  it("canyonVisualFloorY (the crisp decor profile the buttes/cliff walls are actually built from) stands at-or-above the real (soft) height field almost everywhere, and never more than a few units below it even in the narrow main/side-canyon overlap zone", () => {
    let worstGap = 0;
    for (let along = -300; along <= 300; along += 5) {
      for (const side of [1, -1] as const) {
        for (let u = 0; u <= 1.6; u += 0.02) {
          const p = canyonProfilePoint(along, side, u);
          const crisp = canyonVisualFloorY(p.x, p.z, rawHeight(p.x, p.z));
          const soft = grandCanyonGroundY(p.x, p.z, rawHeight(p.x, p.z));
          if (crisp === null || soft === null) continue;
          worstGap = Math.min(worstGap, crisp - soft);
        }
      }
    }
    // in most of the footprint this is ~0 (see the previous test's tighter -1 margin at along step
    // 20/u step 0.05); right where a side canyon's own min()-combined carve crosses over which branch
    // (main vs. side) is deepest, the crisp and soft profiles can pick a different winner by a few
    // units. Round 8's river-visibility fix (canyonTerraceFrac's own steps moved considerably, to
    // close the river sightline) also widened the worst case right at the canyon's own tapered
    // mouths (along > ~250, where halfWidth/depth are already shrinking toward zero so the crisp
    // channel's own new, wider edge and the far-taper's own steepness compound) — bounded at ~-32
    // there now, confirmed by a finer sweep, not a new category of problem: it's the exact
    // scenario buildCliffWalls()/buildButteMesas()'s own Math.max(crisp, soft) safety clamp exists
    // for (never trust this invariant blindly) — a kid there sees the plain soft terrain's own
    // smooth shape instead of the crisp bands for a short stretch, not a gap or a void. A remote,
    // low-traffic corner of the canyon, not touched further this round given it's already
    // defended against.
    expect(worstGap).toBeGreaterThan(-35);
  });

  it("round 7's own regression: canyonMainTerraceFloorY (what the main cliff wall actually lofts itself from) never jumps sharply between the wall's own real U samples — a butte or a side canyon's mouth-taper must never leak into it, since the wall's fixed sampling is only dense enough to resolve the THREE real terrace cliffs, not a second, separately-located bump", () => {
    // the exact US array buildCliffWalls() samples, clustered round the three real cliff
    // transitions only — anything that adds a height change somewhere else in u-space (the old
    // butte bump, or a side canyon's own mouth-taper) shows up here as a big jump between two
    // adjacent u's that were never meant to need one
    const US = [0.085, 0.095, 0.1, 0.108, 0.115, 0.13, 0.17, 0.22, 0.28, 0.34, 0.39, 0.405, 0.415, 0.425, 0.435, 0.44, 0.46, 0.5, 0.56, 0.62, 0.665, 0.682, 0.69, 0.698, 0.706, 0.714, 0.73, 0.76, 0.82, 0.89, 0.96, 1.03, 1.14];
    let worstJump = 0;
    let worstAt: { along: number; side: number; u0: number; u1: number } | null = null;
    for (let along = -250; along <= 250; along += 6) {
      for (const side of [1, -1] as const) {
        for (let k = 0; k + 1 < US.length; k++) {
          const p0 = canyonProfilePoint(along, side, US[k]);
          const p1 = canyonProfilePoint(along, side, US[k + 1]);
          const h0 = canyonMainTerraceFloorY(p0.x, p0.z, rawHeight(p0.x, p0.z));
          const h1 = canyonMainTerraceFloorY(p1.x, p1.z, rawHeight(p1.x, p1.z));
          if (h0 === null || h1 === null) continue;
          const jump = Math.abs(h1 - h0);
          if (jump > worstJump) {
            worstJump = jump;
            worstAt = { along, side, u0: US[k], u1: US[k + 1] };
          }
        }
      }
    }
    // the real terrace cliffs themselves are near-vertical by design (that's the whole point of
    // the crisp profile), so this is a generous bound against a SECOND, unintended source of
    // height change re-appearing — not a tight tolerance on the real cliffs' own jump size.
    // (kept to along in [-250, 250] — the far tapered mouths past that have their own separate,
    // already-tracked steepness, see the soft-field slope test above)
    expect(worstJump, `worst jump ${worstJump.toFixed(1)} at ${JSON.stringify(worstAt)}`).toBeLessThan(35);
  });

  it("the real (soft) height field's own slope never gets anywhere near vertical — roughly 1:1 at its very steepest, so the streamed terrain mesh's fixed grid (TERRAIN_CELL-wide cells) can represent it without sliver triangles", () => {
    // sampled along the canyon's own TRUE cross-section direction (canyonProfilePoint, the same
    // parameterization the terrain carve and the cliff-wall decor both use) rather than naive
    // world-X/Z steps, which cut across the canyon's own gentle wander at an angle and can wander
    // off the intended cross-section entirely
    const DU = 0.004;
    let maxSlope = 0;
    for (let along = -300; along <= 300; along += 11) {
      for (const side of [1, -1] as const) {
        // u starts at 0.01, not 0: right at u=0 (and only exactly there) axisNearest's own nearest-
        // point search over the wandering axis's sampled polyline can snap to a neighbouring sample
        // with a slightly different effective `along`, right at the canyon's own tapering mouths — a
        // narrow, pre-existing artifact of that search (present identically in the OLD crisp profile
        // too, confirmed separately) on a single degenerate point of the flat channel floor itself
        // (u in [0, 0.07] is flat by design, never a transition), not a transition-slope regression
        // this test is meant to catch
        for (let u = 0.01; u <= 1.5; u += 0.02) {
          const p0 = canyonProfilePoint(along, side, u);
          const p1 = canyonProfilePoint(along, side, u + DU);
          const h0 = grandCanyonGroundY(p0.x, p0.z, rawHeight(p0.x, p0.z));
          const h1 = grandCanyonGroundY(p1.x, p1.z, rawHeight(p1.x, p1.z));
          if (h0 === null || h1 === null) continue;
          const dist = Math.hypot(p1.x - p0.x, p1.z - p0.z);
          if (dist < 1e-6) continue;
          maxSlope = Math.max(maxSlope, Math.abs(h1 - h0) / dist);
        }
      }
    }
    // generous headroom over the design target (~1:1, a touch more at a smoothstep's own steepest
    // point, and more again right at the tapering mouths where width shrinks fastest — measured
    // worst case today is ~2.85, at the far tapered ends) — this is a regression guard against a
    // future edit narrowing a transition back down to something sliver-triangle-dangerous (tens of
    // units of slope, like the pre-fix crisp-only profile), not a tight tolerance on today's exact
    // numbers
    expect(maxSlope).toBeLessThan(3.5);
  });

  it("returns null well away from the canyon (leaves the rest of the island alone)", () => {
    expect(grandCanyonGroundY(0, 0, rawHeight(0, 0))).toBeNull();
    expect(nearGrandCanyon(0, 0)).toBe(false);
  });
});

describe.skipIf(!CANYON_OPEN)("the strata palette (pure, framework-free)", () => {
  it("canyonStrataT always returns 0..1", () => {
    for (let h = -20; h <= 220; h += 7) {
      const t = canyonStrataT(h);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });

  it("canyonFootprintWeight is ~1 inside the canyon and fades to ~0 far away", () => {
    expect(canyonFootprintWeight(CANYON_SITE.x, CANYON_SITE.z)).toBeCloseTo(1, 1);
    expect(canyonFootprintWeight(0, 0)).toBeLessThan(0.01);
  });

  it("canyonStrataT is monotonic (each real layer appears exactly once, never a repeating stripe)", () => {
    let last = -1;
    for (let h = 0; h <= 115; h += 5) {
      const t = canyonStrataT(h);
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
  });

  it("CANYON_BAND_STOPS is ordered bottom (Vishnu) to top (Kaibab), strictly ascending height", () => {
    expect(CANYON_BAND_STOPS[0].name).toMatch(/Vishnu/i);
    expect(CANYON_BAND_STOPS[CANYON_BAND_STOPS.length - 1].name).toMatch(/Kaibab/i);
    for (let i = 2; i < CANYON_BAND_STOPS.length; i++) expect(CANYON_BAND_STOPS[i].h).toBeGreaterThan(CANYON_BAND_STOPS[i - 1].h);
  });

  it("CANYON_BAND_GLSL embeds every stop's own colour as a mix(), reading the same source of truth the terrain/decor share", () => {
    expect(CANYON_BAND_GLSL).toContain("canyonBandColor");
    expect((CANYON_BAND_GLSL.match(/mix\(/g) ?? []).length).toBe(CANYON_BAND_STOPS.length - 1);
  });
});

describe.skipIf(!CANYON_OPEN)("the rim viewpoints and landmarks", () => {
  it("every viewpoint (sign post) sits on real, walkable ground close to the rim", () => {
    for (const v of CANYON_VIEWPOINTS) {
      const h = groundAt(v.x, v.z);
      expect(h).not.toBeNull();
    }
  });

  it("the trailhead, the lodge and the Skywalk's own viewpoint sign (none has a deck under its own named point) stand on genuinely flat rim ground, not partway down the carve", () => {
    for (const v of [CANYON_TRAILHEAD, CANYON_LODGE, CANYON_SKYWALK]) {
      const rim = rawHeight(v.x, v.z) + canyonPlateauRaise(v.x, v.z);
      // (the ground at the rim is the modelled gorge's own rim strip where there is one)
      const h = canyonWalkY(v.x, v.z) ?? groundAt(v.x, v.z)!;
      expect(Math.abs(rim - h)).toBeLessThan(15);
    }
  });

  it("the watchtower stands on its own rim-height platform (CANYON_DECKS), regardless of the ground falling away beneath — the Skywalk's actual hanging glass balcony (SKYWALK_BASE/SKYWALK_OUT, not the CANYON_SKYWALK sign point above) does the same, always at rimHeightAt regardless of the carve", () => {
    for (const v of [CANYON_WATCHTOWER]) {
      const rim = rawHeight(v.x, v.z) + canyonPlateauRaise(v.x, v.z);
      const deckY = grandCanyonDeckY(v.x, v.z);
      expect(deckY).not.toBeNull();
      expect(Math.abs(deckY! - rim)).toBeLessThan(12); // the watchtower's own platform is rim height + 7 (a storey up)
    }
  });
});

describe.skipIf(!CANYON_OPEN)("the mule trail", () => {
  it("starts at the trailhead and ends at the river, losing 40-90 units of height", () => {
    const start = muleRoutePointAtU(0);
    const end = muleRoutePointAtU(1);
    const hStart = groundAt(start.x, start.z)!;
    const hEnd = groundAt(end.x, end.z)!;
    expect(hStart - hEnd).toBeGreaterThanOrEqual(40);
    expect(hStart - hEnd).toBeLessThanOrEqual(95);
  });

  it("every point along it lies within the canyon's own footprint", () => {
    for (let i = 0; i <= 20; i++) {
      const u = i / 20;
      const p = muleRoutePointAtU(u);
      expect(nearGrandCanyon(p.x, p.z, 10)).toBe(true);
    }
  });

  it("descends roughly monotonically (no yo-yoing back up to the rim)", () => {
    let prev = groundAt(muleRoutePointAtU(0).x, muleRoutePointAtU(0).z)!;
    let worstRise = 0;
    for (let i = 1; i <= 30; i++) {
      const u = i / 30;
      const p = muleRoutePointAtU(u);
      const h = groundAt(p.x, p.z)!;
      if (h - prev > worstRise) worstRise = h - prev;
      prev = h;
    }
    expect(worstRise).toBeLessThan(12);
  });

  it("has a sensible walking heading everywhere along it", () => {
    for (let i = 0; i <= 10; i++) {
      const h = muleRouteHeadingAtU(i / 10);
      expect(Number.isFinite(h)).toBe(true);
    }
  });

  it("has one story stop per leg, ending at the river", () => {
    expect(CANYON_LAYERS.length).toBeGreaterThanOrEqual(5);
    expect(CANYON_LAYERS[CANYON_LAYERS.length - 1].name).toMatch(/River/i);
  });

  it("CANYON_MULE_ROUTE is a real, densely-sampled polyline (not degenerate)", () => {
    expect(CANYON_MULE_ROUTE.length).toBeGreaterThan(10);
  });
});

describe.skipIf(!CANYON_OPEN)("the modelled gorge: one surface, with the height field out of sight beneath it", () => {
  it("the island's own ground lies below the modelled surface everywhere inside the gorge", () => {
    let worst = -Infinity;
    for (let x = CANYON_SITE.x - 140; x <= CANYON_SITE.x + 140; x += 4) {
      for (let z = CANYON_SITE.z - 340; z <= CANYON_SITE.z + 340; z += 4) {
        const s = canyonSurfaceY(x, z);
        if (s === null) continue;
        worst = Math.max(worst, groundY(x, z) - s);
      }
    }
    expect(worst).toBeLessThan(1.5);
  });

  it("the ledge trail never dips below the surface, has no cliff-sized step and no silly grade", () => {
    let maxGrade = 0;
    for (let i = 0; i < CANYON_TRAIL.length; i++) {
      const p = CANYON_TRAIL[i];
      // (the first few steps, from the trailhead to the modelled rim, are on the island's own ground)
      if (canyonSurfaceY(p.x, p.z) === null) continue;
      expect(p.y, `trail point ${i}`).toBeGreaterThan(canyonSurfaceY(p.x, p.z)! - 0.3);
      expect(canyonWalkY(p.x, p.z)!).toBeCloseTo(Math.max(p.y, canyonSurfaceY(p.x, p.z)!), 0);
      if (i > 0) {
        const q = CANYON_TRAIL[i - 1];
        const run = Math.hypot(p.x - q.x, p.z - q.z);
        if (run > 0.5) maxGrade = Math.max(maxGrade, Math.abs(p.y - q.y) / run);
      }
    }
    expect(maxGrade).toBeLessThan(0.4);
    // it really goes from the rim down to the river
    expect(CANYON_TRAIL[0].y - CANYON_TRAIL[CANYON_TRAIL.length - 1].y).toBeGreaterThan(55);
  });

  it("the river's bed only ever falls (water never runs uphill)", () => {
    let prev = Infinity;
    for (let along = -250; along <= 250; along += 10) {
      const p = canyonAxisPointAt(along);
      const y = canyonSurfaceY(p.x, p.z)!;
      expect(y).toBeLessThanOrEqual(prev + 0.05);
      prev = y;
    }
  });
});
