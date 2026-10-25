// roads.ts is deliberately a leaf module (see its own banner): it does NOT import settlements.ts,
// wonders.ts, grandCanyon.ts or terrain.ts, so every destination coordinate it freezes is a plain
// copied number. This test is where those copies are checked against the LIVE registries (safe to
// import here — a test file is never imported back by anything, so there's no cycle risk), and
// where the frozen road/bridge/tunnel data is checked for grade, clearance, connectivity and the
// hard rules from the spec (no road point inside the park's own island, bridges really over water,
// tunnels really under real high ground).
import { describe, it, expect } from "vitest";
import * as R from "./roads";
import { rawHeight } from "./landform";
import { wildWaterSdf } from "./wildWater";
import { ISLAND_R } from "./island";
import { STATIONS, nearestRail } from "./railway";
import { SETTLEMENTS } from "./settlements";
import { WONDERS } from "./wonders";
import { KART_SITE, kartTrackWorld } from "./kartTrack";
import { PLACES } from "./places";
import { CANYON_SITE, CANYON_REACH } from "./grandCanyon";
import { WILDLANDS } from "./island";
import { VILLAGE_ISLAND } from "./villageIsland";
import { FROST_ISLAND } from "./frostIsland";
import { DINO_ISLAND } from "./dinoIsland";

const GRADE_CAP = 0.121; // the spec's "hard cap ~12%" (a hair of float slack)

describe("roads: grade + geometry", () => {
  it("never exceeds the hard grade cap, and never runs inside the park's own island", () => {
    let maxGrade = 0;
    for (const seg of R.ROAD_SEGMENTS) {
      for (let i = 0; i + 1 < seg.points.length; i++) {
        const a = seg.points[i];
        const b = seg.points[i + 1];
        const d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const g = Math.abs(b.y - a.y) / d;
        maxGrade = Math.max(maxGrade, g);
        expect(g, `${seg.id} @ point ${i} exceeds the grade cap`).toBeLessThan(GRADE_CAP);
        expect(Math.hypot(a.x, a.z), `${seg.id} point ${i} is inside the park's own island (ISLAND_R)`).toBeGreaterThan(ISLAND_R - 1);
      }
    }
    expect(maxGrade).toBeLessThan(GRADE_CAP);
  });

  it("the two tunnels really run under real high ground (>= 6 units clearance through the bored middle)", () => {
    for (const t of R.TUNNELS) {
      let minClear = Infinity;
      // the portal FACES themselves meet the hillside at ~0 clearance by design (that's the mouth);
      // only the bored middle (15%..85% along) needs to clear real rock overhead
      for (let i = 0; i <= 14; i++) {
        const u = 0.15 + (i / 14) * 0.7;
        const x = t.x0 + (t.x1 - t.x0) * u;
        const z = t.z0 + (t.z1 - t.z0) * u;
        const y = t.y0 + (t.y1 - t.y0) * u;
        minClear = Math.min(minClear, rawHeight(x, z) - y);
      }
      expect(minClear, `${t.id} doesn't clear real ground by 6+ units through its bored middle`).toBeGreaterThanOrEqual(6);
      const len = Math.hypot(t.x1 - t.x0, t.z1 - t.z0);
      const grade = Math.abs(t.y1 - t.y0) / len;
      expect(grade, `${t.id}'s own grade`).toBeLessThan(GRADE_CAP);
    }
  });

  it("every water bridge genuinely spans water (or the gorge it crosses)", () => {
    for (const b of R.BRIDGES.filter((b) => b.style !== "overpass")) {
      let minSdf = Infinity;
      for (let i = 2; i <= 8; i++) {
        const u = i / 10;
        const along = (u - 0.5) * b.span;
        const x = b.x + Math.sin(b.heading) * along;
        const z = b.z + Math.cos(b.heading) * along;
        minSdf = Math.min(minSdf, wildWaterSdf(x, z));
      }
      expect(minSdf, `${b.id} never actually crosses water`).toBeLessThan(10);
    }
  });

  it("the overpass genuinely crosses the railway, clear above it", () => {
    const b = R.BRIDGES.find((b) => b.style === "overpass")!;
    expect(b, "no overpass bridge found").toBeTruthy();
    const n = nearestRail(b.x, b.z);
    expect(n.d, "the overpass isn't actually over the rail").toBeLessThan(3);
    const u = 0.5;
    const deckY = b.y0 + (b.y1 - b.y0) * u + Math.sin(u * Math.PI) * b.rise;
    // (the rails there lie on ground ~3 units up; the deck clears them by a train's height)
    expect(deckY - Math.max(rawHeight(b.x, b.z), 0.4), "the overpass deck doesn't clear the rail").toBeGreaterThan(4.5);
  });

  it("has one grand bridge, one overpass, and real tunnels through real mountains", () => {
    expect(R.BRIDGES.some((b) => b.style === "grand")).toBe(true);
    expect(R.BRIDGES.some((b) => b.style === "overpass")).toBe(true);
    expect(R.BRIDGES.length).toBeGreaterThanOrEqual(3);
    // (the Great Ridge Tunnel led only to the Grand Canyon, which is switched off for now —
    // CANYON_OPEN in registry/grandCanyon.ts — so its spur waits with it; Lone Peak's stays)
    expect(R.TUNNELS.length).toBeGreaterThanOrEqual(2);
  });
});

describe("roads: a single connected graph", () => {
  it("every road segment, bridge, tunnel and car park is reachable from every other", () => {
    type Pt = { x: number; z: number };
    const nodes: Pt[] = [];
    const forcedEdges: [number, number][] = [];
    for (const seg of R.ROAD_SEGMENTS) {
      const i0 = nodes.length;
      nodes.push(seg.points[0]);
      nodes.push(seg.points[seg.points.length - 1]);
      forcedEdges.push([i0, i0 + 1]);
    }
    // the overpass is deliberately excluded here: unlike the two water bridges (which replace a real
    // gap between two road segments, so their own bank points must line up with those segments'
    // ends), the overpass just rides OVER an otherwise-continuous segment (ring-h0-h1) — that
    // segment is already one connected piece on its own, with or without the overpass sitting on it
    for (const b of R.BRIDGES.filter((b) => b.style !== "overpass")) {
      const i0 = nodes.length;
      nodes.push({ x: b.x - Math.sin(b.heading) * (b.span / 2), z: b.z - Math.cos(b.heading) * (b.span / 2) });
      nodes.push({ x: b.x + Math.sin(b.heading) * (b.span / 2), z: b.z + Math.cos(b.heading) * (b.span / 2) });
      forcedEdges.push([i0, i0 + 1]);
    }
    for (const t of R.TUNNELS) {
      const i0 = nodes.length;
      nodes.push({ x: t.x0, z: t.z0 });
      nodes.push({ x: t.x1, z: t.z1 });
      forcedEdges.push([i0, i0 + 1]);
    }
    // a road may also end ON another road (a T-junction): its end point lies on that road's line
    R.ROAD_SEGMENTS.forEach((seg, si) => {
      for (const end of [0, 1]) {
        const e = end ? seg.points[seg.points.length - 1] : seg.points[0];
        R.ROAD_SEGMENTS.forEach((other, oi) => {
          if (oi === si) return;
          for (let k = 0; k + 1 < other.points.length; k++) {
            const a = other.points[k];
            const b = other.points[k + 1];
            const ex = b.x - a.x;
            const ez = b.z - a.z;
            const u = Math.max(0, Math.min(1, ((e.x - a.x) * ex + (e.z - a.z) * ez) / (ex * ex + ez * ez || 1)));
            if (Math.hypot(e.x - a.x - ex * u, e.z - a.z - ez * u) < 1) {
              forcedEdges.push([si * 2 + end, oi * 2]);
              return;
            }
          }
        });
      }
    });
    const carParkStart = nodes.length;
    for (const cp of R.CAR_PARKS) nodes.push({ x: cp.x, z: cp.z });

    const parent = nodes.map((_, i) => i);
    const find = (i: number): number => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]];
      return i;
    };
    const union = (a: number, b: number) => (parent[find(a)] = find(b));
    const EPS = 1.0;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z) < EPS) union(i, j);
    // round 3/4: a station car park sits off to the side of its own road (clear of the roundabout
    // ring there, not ON the hub point any more — "never a giant slab under the junction") — so
    // instead of coinciding with a road node (this graph only has SEGMENT ENDPOINTS as nodes, not
    // every point along one), it's within a driveway's reach of the nearest endpoint node
    // (a station's car park is a lay-by beside the road a little way from the platform, clear of
    // the rails and the roundabout — so it can be a fair way from a segment END, though it always
    // touches the road itself: see the entrance test below)
    const CP_REACH = 130;
    for (let c = carParkStart; c < nodes.length; c++) {
      let best = Infinity;
      let bestJ = -1;
      for (let j = 0; j < carParkStart; j++) {
        const d = Math.hypot(nodes[c].x - nodes[j].x, nodes[c].z - nodes[j].z);
        if (d < best) { best = d; bestJ = j; }
      }
      expect(best, `${R.CAR_PARKS[c - carParkStart].id} is too far from any road to have a driveway`).toBeLessThan(CP_REACH);
      union(c, bestJ);
    }
    for (const [a, b] of forcedEdges) union(a, b);
    const roots = new Set(nodes.map((_, i) => find(i)));
    expect(roots.size, "the road network has disconnected pieces").toBe(1);
  });
});

describe("roads: joins — every road end genuinely overlaps what it joins (round 4)", () => {
  const JOIN_OVERLAP = 1; // world/roads/index.ts's own buildSection trims at ROUNDABOUT_OUTER - this

  it("every roundabout has at least one connecting road point at least JOIN_OVERLAP inside its ring (so the renderer's trim leaves a real overlap, not a hairline seam)", () => {
    for (const j of R.ROAD_JUNCTIONS) {
      let best = Infinity;
      for (const seg of R.ROAD_SEGMENTS) for (const p of seg.points) {
        const d = Math.hypot(p.x - j.x, p.z - j.z);
        if (d < best) best = d;
      }
      // "distance to what it joins is <= 0" relative to the ring's own inner join boundary
      // (ROUNDABOUT_OUTER - JOIN_OVERLAP): the nearest road point must be AT or INSIDE it
      expect(best - (R.ROUNDABOUT_OUTER - JOIN_OVERLAP), `${j.id} has no road point reaching the overlap zone`).toBeLessThanOrEqual(0);
    }
  });

  it("every bridge's own bank point lands exactly on its approach road's end (<=0 gap)", () => {
    for (const b of R.BRIDGES) {
      if (b.style === "overpass") continue; // rides over a continuous segment, not a gap — see the connectivity test's own note
      for (const sign of [-1, 1]) {
        const bx = b.x + Math.sin(b.heading) * sign * (b.span / 2);
        const bz = b.z + Math.cos(b.heading) * sign * (b.span / 2);
        let best = Infinity;
        for (const seg of R.ROAD_SEGMENTS) {
          const d0 = Math.hypot(seg.points[0].x - bx, seg.points[0].z - bz);
          const d1 = Math.hypot(seg.points[seg.points.length - 1].x - bx, seg.points[seg.points.length - 1].z - bz);
          best = Math.min(best, d0, d1);
        }
        expect(best, `${b.id} bank (sign ${sign}) doesn't land exactly on a road end`).toBeLessThan(1.0);
      }
    }
  });

  it("every tunnel portal lands exactly on its approach road's end (<=0 gap)", () => {
    for (const t of R.TUNNELS) {
      for (const [px, pz] of [[t.x0, t.z0], [t.x1, t.z1]] as const) {
        let best = Infinity;
        for (const seg of R.ROAD_SEGMENTS) {
          const d0 = Math.hypot(seg.points[0].x - px, seg.points[0].z - pz);
          const d1 = Math.hypot(seg.points[seg.points.length - 1].x - px, seg.points[seg.points.length - 1].z - pz);
          best = Math.min(best, d0, d1);
        }
        expect(best, `${t.id} portal doesn't land exactly on a road end`).toBeLessThan(1.0);
      }
    }
  });

  it("every car park entrance is within its own apron radius of the nearest road point (a real overlap, not a gap)", () => {
    for (const cp of R.CAR_PARKS) {
      let best = Infinity;
      for (const seg of R.ROAD_SEGMENTS) for (const p of seg.points) best = Math.min(best, Math.hypot(p.x - cp.x, p.z - cp.z));
      // the car park's free circle must overlap the road's own drivable corridor (shoulder included),
      // with room to spare: a lay-by sits beside the carriageway, not on it
      expect(best - cp.r, `${cp.id} entrance doesn't overlap any road`).toBeLessThanOrEqual(R.ROAD_CORRIDOR_HALF + 3 - 1.5);
    }
  });

  it("every roundabout clears the railway and the platform by at least its own outer radius + 12", () => {
    for (const j of R.ROAD_JUNCTIONS) {
      if (j.id === "j-parwp") continue; // not a station — nearestRail finds nothing nearby to clear
      const d = nearestRail(j.x, j.z).d;
      expect(d, `${j.id} is too close to the railway`).toBeGreaterThanOrEqual(R.ROUNDABOUT_OUTER + 12);
    }
  });
});

describe("roads: destinations", () => {
  it("every railway station has a car park right there", () => {
    for (const st of STATIONS) {
      // round 4: the roundabout itself moved clear of the railway/platform (>= ring radius + 12),
      // and the car park moved out beside IT instead (see CAR_PARKS's own comment) — still
      // unmistakably "this station's car park", just further from the platform than before. Park
      // Station is the worst case at ~78 units (its own platform, at [128,-68] in railway.ts, was
      // already ~21 units from the old road hub H0, before the roundabout's own 40-unit move and the
      // car park's further 20-unit offset from that stack up) — real measured distances, not a
      // guess: see the comment in this test file's own history for how each was computed.
      const cp = R.carParkAt(st.x, st.z, 85);
      expect(cp, `no car park near ${st.name}`).toBeTruthy();
    }
  });

  it("every settlement has a car park serving it, reasonably close to its own edge", () => {
    for (const s of SETTLEMENTS) {
      const best = R.CAR_PARKS.reduce<{ cp: R.CarPark; d: number } | null>((best, cp) => {
        const d = Math.hypot(cp.x - s.x, cp.z - s.z) - s.radius;
        return !best || d < best.d ? { cp, d } : best;
      }, null);
      expect(best, `no car park at all for ${s.name}`).toBeTruthy();
      // a sensible walk from the car park to the settlement's own edge — most are within ~15-25
      // units; Treetop and Everest Base Camp's final stretch is deliberately foot-only (see roads.ts)
      expect(best!.d, `${s.name}'s nearest car park (${best!.cp.id}) is ${best!.d.toFixed(0)} units from its edge`).toBeLessThan(110);
    }
  });

  it("every land-bound wonder has a car park within a short walk of it", () => {
    for (const w of WONDERS) {
      const best = R.CAR_PARKS.reduce((min, cp) => Math.min(min, Math.hypot(cp.x - w.x, cp.z - w.z)), Infinity);
      expect(best, `${w.name} has no nearby car park`).toBeLessThan(200);
    }
  });

  it("the kart track's car park is a short walk from its own door, and no road touches the circuit", () => {
    const door = PLACES.find((p) => p.id === "go-karts")!;
    const cp = R.CAR_PARKS.find((c) => c.id === "cp-kart")!;
    // (the pit door is INSIDE the circuit's loop, so the car park sits just outside the track
    // and the kid walks in across it, as at a real kart track)
    expect(Math.hypot(cp.x - door.x, cp.z - door.z)).toBeLessThan(70);
    const track = kartTrackWorld().points;
    const kartD = (x: number, z: number) => Math.min(...track.map((t) => Math.hypot(t.x - x, t.z - z)));
    for (const seg of R.ROAD_SEGMENTS) for (const q of seg.points) expect(kartD(q.x, q.z), `${seg.id} runs into the kart circuit`).toBeGreaterThan(20);
    for (const j of R.ROAD_JUNCTIONS) expect(kartD(j.x, j.z), `${j.id}`).toBeGreaterThan(R.ROUNDABOUT_OUTER + 12);
    for (const c of R.CAR_PARKS) expect(kartD(c.x, c.z), `${c.id}`).toBeGreaterThan(c.r + 12);
  });

  it("every roundabout is a real junction: at least three road legs end exactly at its centre, and each station has one close by", () => {
    for (const j of R.ROAD_JUNCTIONS) {
      let legs = 0;
      for (const seg of R.ROAD_SEGMENTS) for (const e of [seg.points[0], seg.points[seg.points.length - 1]]) if (Math.hypot(e.x - j.x, e.z - j.z) < 0.5) legs++;
      expect(legs, `${j.id} is not where its roads meet`).toBeGreaterThanOrEqual(3);
      expect(j.signs.length, `${j.id} signs`).toBeGreaterThanOrEqual(legs);
    }
    for (const st of STATIONS) {
      const d = Math.min(...R.ROAD_JUNCTIONS.map((j) => Math.hypot(j.x - st.x, j.z - st.z)));
      expect(d, `${st.name} has no roundabout near it`).toBeLessThan(80);
    }
    // no road runs along a platform any more (the old hubs sat right on them)
    for (const st of STATIONS) {
      if (st.id === "park-station") continue;
      for (const seg of R.ROAD_SEGMENTS) for (const q of R.densifyRoad(seg.points, 2.5)) expect(Math.hypot(q.x - st.x, q.z - st.z), `${seg.id} runs over ${st.name}'s platform`).toBeGreaterThan(18);
    }
    expect(Math.hypot(R.H0.x, R.H0.z)).toBeGreaterThan(ISLAND_R);
  });
});

describe("roads: the Wildlands zone (where a car is road-bound)", () => {
  it("covers the park's own plaza as NOT Wildlands, and every real road destination as Wildlands", () => {
    expect(R.inWildlandsZone(0, 0)).toBe(false);
    expect(R.inWildlandsZone(R.H1.x, R.H1.z)).toBe(true);
    expect(R.inWildlandsZone(R.H4.x, R.H4.z)).toBe(true);
    const cpTown = R.CAR_PARKS.find((c) => c.id === "cp-town")!;
    expect(R.inWildlandsZone(cpTown.x, cpTown.z)).toBe(true);
  });

  it("never claims the separate far-sea islands (Coralcove, Frostpeak, Dino Isle) — they have no road network", () => {
    expect(R.inWildlandsZone(VILLAGE_ISLAND.x, VILLAGE_ISLAND.z)).toBe(false);
    expect(R.inWildlandsZone(FROST_ISLAND.x, FROST_ISLAND.z)).toBe(false);
    expect(R.inWildlandsZone(DINO_ISLAND.x, DINO_ISLAND.z)).toBe(false);
  });

  it("its copied WILDLANDS centre stays in step with registry/island.ts's own", () => {
    expect(R.inWildlandsZone(WILDLANDS.x, WILDLANDS.z)).toBe(true);
    // a point just past the real Wildlands' own radius, on the far side from the park, reads as not-Wildlands
    const a = Math.atan2(WILDLANDS.x, WILDLANDS.z) + Math.PI; // dead opposite heading, away from the park
    const far = { x: WILDLANDS.x + Math.sin(a) * (WILDLANDS.r + 120), z: WILDLANDS.z + Math.cos(a) * (WILDLANDS.r + 120) };
    expect(R.inWildlandsZone(far.x, far.z)).toBe(false);
  });
});

describe("roads: the driving corridor (pure, allocation-free)", () => {
  it("a point on the centre-line stays exactly where it is", () => {
    const seg = R.ROAD_SEGMENTS.find((q) => q.id === "ring-h1-h2a")!;
    const c = seg.points[Math.floor(seg.points.length / 2)];
    const p = R.roadAt(c.x, c.z);
    expect(p.d).toBeLessThan(0.5);
    const r = R.roadConfine(c.x, c.z, c.x, c.z);
    expect(r.x).toBeCloseTo(c.x, 1);
    expect(r.z).toBeCloseTo(c.z, 1);
  });

  it("a step off the road's edge slides back along the edge, never teleporting to the centre", () => {
    const seg = R.ROAD_SEGMENTS.find((s) => s.id === "ring-h1-h2a")!;
    const mid = seg.points[Math.floor(seg.points.length / 2)];
    const nextP = seg.points[Math.floor(seg.points.length / 2) + 1];
    const heading = Math.atan2(nextP.x - mid.x, nextP.z - mid.z);
    // well past the shoulder, 90 degrees off the road
    const farX = mid.x + Math.cos(heading) * 40;
    const farZ = mid.z - Math.sin(heading) * 40;
    const result = R.roadConfine(farX, farZ, mid.x, mid.z);
    const hit = R.roadAt(result.x, result.z);
    expect(hit.d).toBeLessThanOrEqual(R.ROAD_CORRIDOR_HALF + 0.3);
    // it slid along the edge (stayed near the same point along the road), not back to dead centre
    expect(Math.abs(hit.lateral)).toBeGreaterThan(R.ROAD_CORRIDOR_HALF - 0.5);
  });

  it("inside a car park, anywhere is free (no clamping)", () => {
    const cp = R.CAR_PARKS[0];
    const x = cp.x + cp.r * 0.6;
    const z = cp.z + cp.r * 0.3;
    expect(R.inRoadCorridor(x, z)).toBe(true);
    const r = R.roadConfine(x, z, cp.x, cp.z);
    expect(r.x).toBeCloseTo(x, 3);
    expect(r.z).toBeCloseTo(z, 3);
  });

  it("a bridge deck can't be driven off sideways", () => {
    const b = R.BRIDGES[0];
    expect(R.inRoadCorridor(b.x, b.z)).toBe(true);
    const off = R.inRoadCorridor(b.x + Math.cos(b.heading) * (b.half + 6), b.z - Math.sin(b.heading) * (b.half + 6));
    expect(off).toBe(false);
  });

  it("a tunnel's walls hold (off to the side of the bore is not drivable)", () => {
    const t = R.TUNNELS[0];
    const mx = (t.x0 + t.x1) / 2;
    const mz = (t.z0 + t.z1) / 2;
    expect(R.inRoadCorridor(mx, mz)).toBe(true);
    const dx = t.x1 - t.x0;
    const dz = t.z1 - t.z0;
    const len = Math.hypot(dx, dz);
    const px = -dz / len;
    const pz = dx / len;
    expect(R.inRoadCorridor(mx + px * (t.half + 8), mz + pz * (t.half + 8))).toBe(false);
  });

  it("nearRoad is a cheap, consistent early-out", () => {
    expect(R.nearRoad(R.H2.x, R.H2.z, 1)).toBe(true);
    expect(R.nearRoad(0, 0, 1)).toBe(false); // the plaza is nowhere near the Wildlands road network
  });
});

describe("roads: the level crossing's boom and the tunnel-camera ceiling", () => {
  it("the boom is down when the train's close, up otherwise", () => {
    const c = R.LEVEL_CROSSINGS[0];
    expect(R.crossingBoomDown(c, c.railS - 50)).toBe(true); // ~2s out at TRAIN_V=24
    expect(R.crossingBoomDown(c, c.railS + 3)).toBe(true); // just passed
    expect(R.crossingBoomDown(c, c.railS - 500)).toBe(false); // far off
    expect(R.levelCrossingBlocks(c.x, c.z, c.railS - 50)).toBe(true);
    expect(R.levelCrossingBlocks(c.x, c.z, c.railS - 500)).toBe(false);
    expect(R.levelCrossingBlocks(c.x + 200, c.z, c.railS - 50)).toBe(false); // far from the gate itself
  });

  it("tunnelCeilingAt answers only inside a tunnel, well above its own deck", () => {
    const t = R.TUNNELS[0];
    const mx = (t.x0 + t.x1) / 2;
    const mz = (t.z0 + t.z1) / 2;
    const ceil = R.tunnelCeilingAt(mx, mz);
    expect(ceil).not.toBeNull();
    const deck = R.roadAt(mx, mz).deckY;
    expect(ceil!).toBeGreaterThan(deck + 3);
    expect(R.tunnelCeilingAt(R.H1.x, R.H1.z)).toBeNull();
  });
});

describe("roads: roundabouts are driven round, not across", () => {
  it("the planted island is never drivable and the ring always is, all the way round", () => {
    const mid = (R.ROUNDABOUT_INNER + R.ROUNDABOUT_OUTER) / 2;
    for (const j of R.ROAD_JUNCTIONS) {
      expect(R.inRoadCorridor(j.x, j.z), `${j.id} centre`).toBe(false);
      for (let a = 0; a < Math.PI * 2; a += 0.2) {
        const c = Math.cos(a);
        const s = Math.sin(a);
        expect(R.inRoadCorridor(j.x + c * (R.ROUNDABOUT_INNER - 1), j.z + s * (R.ROUNDABOUT_INNER - 1)), `${j.id} island`).toBe(false);
        expect(R.inRoadCorridor(j.x + c * mid, j.z + s * mid), `${j.id} ring`).toBe(true);
      }
    }
  });

  it("a car driven straight at the island is carried round the ring, never across it", () => {
    for (const j of R.ROAD_JUNCTIONS) {
      // start on the ring's west side and keep pushing east (slightly off-axis, as a real thumb is)
      let x = j.x - (R.ROUNDABOUT_OUTER - 1);
      let z = j.z + 0.5;
      let closest = Infinity;
      for (let i = 0; i < 400 && x < j.x + R.ROUNDABOUT_INNER; i++) {
        const c = R.roadConfine(x + 0.3, z + 0.01, x, z);
        x = c.x;
        z = c.z;
        closest = Math.min(closest, Math.hypot(x - j.x, z - j.z));
        expect(R.inRoadCorridor(x, z), `${j.id} left the road`).toBe(true);
      }
      expect(closest, `${j.id} cut across the island`).toBeGreaterThan(R.ROUNDABOUT_INNER);
      // (it gets at least round to the island's far half — or out along a road that leaves on the way)
      expect(x, `${j.id} got stuck`).toBeGreaterThan(j.x - 8);
    }
  });
});

describe("roads: a car can never leave the network, and is never thrown", () => {
  it("a small step off any ring's outer edge is answered with a small slide (all the way round)", () => {
    for (const j of R.ROAD_JUNCTIONS) {
      for (let a = 0; a < Math.PI * 2; a += 0.02) {
        const r0 = R.ROUNDABOUT_OUTER - 0.75;
        const x0 = j.x + Math.cos(a) * r0;
        const z0 = j.z + Math.sin(a) * r0;
        if (!R.inRoadCorridor(x0, z0)) continue;
        const c = R.roadConfine(j.x + Math.cos(a) * (r0 + 0.3), j.z + Math.sin(a) * (r0 + 0.3), x0, z0);
        expect(R.inRoadCorridor(c.x, c.z), `${j.id} off the road`).toBe(true);
        expect(Math.hypot(c.x - x0, c.z - z0), `${j.id} thrown at angle ${a.toFixed(2)}`).toBeLessThan(0.7);
      }
    }
  });

  it("driving straight on past the end of every dead-end road stops at its car park", () => {
    for (const seg of R.ROAD_SEGMENTS) {
      for (const end of [0, 1]) {
        const n = seg.points.length;
        const e = end ? seg.points[n - 1] : seg.points[0];
        const b = end ? seg.points[n - 2] : seg.points[1];
        const cp = R.CAR_PARKS.find((c) => Math.hypot(c.x - e.x, c.z - e.z) < 1);
        if (!cp) continue;
        const l = Math.hypot(e.x - b.x, e.z - b.z);
        const ux = (e.x - b.x) / l;
        const uz = (e.z - b.z) / l;
        let x = e.x;
        let z = e.z;
        for (let i = 0; i < 400; i++) {
          const c = R.roadConfine(x + ux * 0.3, z + uz * 0.3, x, z);
          x = c.x;
          z = c.z;
          expect(R.inRoadCorridor(x, z), `${seg.id} left the network`).toBe(true);
        }
        expect(R.onCarPark(cp, x, z), `${seg.id} drove off past ${cp.id}`).toBe(true);
      }
    }
  });

  it("random pushes from anywhere on the network always land back on it, close by", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (const seg of R.ROAD_SEGMENTS) {
      for (let k = 0; k < 60; k++) {
        const p = seg.points[Math.floor(rnd() * seg.points.length)];
        if (!R.inRoadCorridor(p.x, p.z)) continue; // (a leg's last points under a ring's island)
        const a = rnd() * Math.PI * 2;
        const step = 0.2 + rnd() * 6;
        const tx = p.x + Math.cos(a) * step;
        const tz = p.z + Math.sin(a) * step;
        const c = R.roadConfine(tx, tz, p.x, p.z);
        expect(R.inRoadCorridor(c.x, c.z), `${seg.id} pushed off the network`).toBe(true);
        // (aimed at a roundabout's island the whole step is spent going round it instead)
        if (R.ROAD_JUNCTIONS.some((j) => Math.hypot(tx - j.x, tz - j.z) < R.ROUNDABOUT_INNER + 1)) continue;
        // (the answer is the nearest point of the network, and where it started is one `step` away)
        expect(Math.hypot(c.x - tx, c.z - tz), `${seg.id} thrown`).toBeLessThan(step + 0.1);
      }
    }
  });

  it("a tunnel ends at its portals: no floor, ceiling or road beyond them", () => {
    for (const t of R.TUNNELS) {
      const len = Math.hypot(t.x1 - t.x0, t.z1 - t.z0);
      const ux = (t.x1 - t.x0) / len;
      const uz = (t.z1 - t.z0) / len;
      expect(R.tunnelDeckAt(t, t.x0 + ux * 5, t.z0 + uz * 5)).not.toBeNull();
      for (const d of [-100, -20, len + 20, len + 100]) {
        const x = t.x0 + ux * d;
        const z = t.z0 + uz * d;
        expect(R.tunnelDeckAt(t, x, z), `${t.id} floor at ${d}`).toBeNull();
        expect(R.tunnelCeilingAt(x, z), `${t.id} ceiling at ${d}`).toBeNull();
      }
      // off to the side of the line beyond a portal there is no road at all
      expect(R.inRoadCorridor(t.x0 - ux * 100 + uz * 3, t.z0 - uz * 100 - ux * 3) && R.roadAt(t.x0 - ux * 100, t.z0 - uz * 100).kind === "tunnel").toBe(false);
    }
  });
});

describe("roads: car parks and ring joins", () => {
  it("a car park is drivable exactly where its apron is drawn (plus a narrow verge), and nowhere round it", () => {
    for (const cp of R.CAR_PARKS) {
      const at = (along: number, side: number) => ({ x: cp.x + Math.sin(cp.heading) * along + Math.cos(cp.heading) * side, z: cp.z + Math.cos(cp.heading) * along - Math.sin(cp.heading) * side });
      const hl = cp.r * R.CAR_PARK_HALF_LEN;
      const hw = cp.r * R.CAR_PARK_HALF_WIDTH;
      // every corner and edge of the apron can be driven on
      for (const [a, s] of [[hl, hw], [-hl, hw], [hl, -hw], [-hl, -hw], [0, hw], [0, -hw], [hl, 0], [-hl, 0], [0, 0]]) {
        const p = at(a * 0.99, s * 0.99);
        expect(R.inRoadCorridor(p.x, p.z), `${cp.id} apron point (${a.toFixed(0)}, ${s.toFixed(0)}) is not drivable`).toBe(true);
      }
      // well past the apron's side there is no car park (only a road or ring, if one is there)
      for (const s of [hw + 4, -hw - 4]) {
        const p = at(0, s);
        expect(R.onCarPark(cp, p.x, p.z), `${cp.id} is drivable ${Math.abs(s) - hw} past its side`).toBe(false);
      }
      // and it joins the network: some point of the apron or its verge is also on a road or a ring
      let joined = false;
      for (let a = -hl - 1.9; a <= hl + 1.9 && !joined; a += 1) for (let s = -hw - 1.9; s <= hw + 1.9; s += 1) {
        const p = at(a, s);
        if (R.roadCentreDist(p.x, p.z) < R.ROAD_CORRIDOR_HALF || R.ROAD_JUNCTIONS.some((j) => { const d = Math.hypot(p.x - j.x, p.z - j.z); return d > R.ROUNDABOUT_INNER + 1 && d < R.ROUNDABOUT_OUTER - 1; })) {
          joined = true;
          break;
        }
      }
      expect(joined, `${cp.id} does not touch a road`).toBe(true);
    }
  });

  it("every road's ribbon is cut exactly on its ring's join circle: no gap, on either leg end", () => {
    const R_JOIN = R.ROUNDABOUT_OUTER - R.RING_JOIN_OVERLAP;
    for (const seg of R.ROAD_SEGMENTS) {
      const pts = R.trimAtRings(seg, R.densifyRoad(seg.points, 2.5));
      expect(pts.length, seg.id).toBeGreaterThan(1);
      for (const [end, p] of [[seg.points[0], pts[0]], [seg.points[seg.points.length - 1], pts[pts.length - 1]]] as const) {
        const j = R.ROAD_JUNCTIONS.find((q) => Math.hypot(q.x - end.x, q.z - end.z) < 1);
        if (!j) continue;
        expect(Math.hypot(p.x - j.x, p.z - j.z), `${seg.id} at ${j.id}`).toBeCloseTo(R_JOIN, 2);
      }
      // nothing of the ribbon is left under the island
      for (const p of pts) for (const j of R.ROAD_JUNCTIONS) if (Math.hypot(seg.points[0].x - j.x, seg.points[0].z - j.z) < 1 || Math.hypot(seg.points[seg.points.length - 1].x - j.x, seg.points[seg.points.length - 1].z - j.z) < 1) expect(Math.hypot(p.x - j.x, p.z - j.z), `${seg.id} under ${j.id}`).toBeGreaterThan(R_JOIN - 0.01);
    }
  });
});
