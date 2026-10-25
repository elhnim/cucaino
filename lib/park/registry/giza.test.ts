import { describe, expect, it } from "vitest";
import {
  BOAT_PITS,
  CAUSEWAYS,
  GIZA_BLOCKS,
  GIZA_ORIGIN,
  GIZA_SCALE,
  MASTABAS,
  PYRAMIDS,
  SPHINX_E,
  SPHINX_S,
  TEMPLES,
  gizaGroundY,
  gizaLocal,
  gizaPlateauY,
  gizaSolidY,
  gizaWorld,
  inGizaSolid,
  pyramidCourses,
} from "./giza";
import { seaDist } from "./island";
import { nearRail } from "./railway";
import { nearRoad } from "./roads";
import { SETTLEMENTS } from "./settlements";
import { EVEREST_PEAK } from "./landform";
import { wildWaterSdf } from "./wildWater";
import { nearCartRoad } from "./cartRoad";
import { nearFootpath } from "./footpaths";
import { CANYON_REACH, CANYON_SITE } from "./grandCanyon";
import { WONDERS } from "./wonders";
import { groundY } from "./terrain";
import { worldFloorY } from "./harbours";

/** every footprint (real metres): [id, e, s, halfE, halfS] */
function footprints(): [string, number, number, number, number][] {
  const out: [string, number, number, number, number][] = [];
  for (const p of PYRAMIDS) out.push([p.id, p.e, p.s, p.halfE, p.halfS]);
  for (const t of TEMPLES) out.push([t.id, t.e, t.s, t.halfE, t.halfS]);
  MASTABAS.forEach((m, i) => out.push([`mastaba-${i}`, m.e, m.s, m.halfE, m.halfS]));
  out.push(["sphinx", SPHINX_E, SPHINX_S, 37, 10]);
  for (const b of BOAT_PITS) {
    const along = b.angle === 0;
    out.push([`pit-${b.e},${b.s}`, b.e, b.s, along ? b.len / 2 : b.width / 2, along ? b.width / 2 : b.len / 2]);
  }
  return out;
}

describe("the Giza Plateau", () => {
  it("keeps the real pyramids' proportions", () => {
    const k = PYRAMIDS.find((p) => p.id === "khufu")!;
    const kh = PYRAMIDS.find((p) => p.id === "khafre")!;
    const m = PYRAMIDS.find((p) => p.id === "menkaure")!;
    // the built height follows from the base and the face angle (a true pyramid), within 1%
    for (const p of [k, kh, m]) {
      const h = Math.min(p.halfE, p.halfS) * Math.tan((p.slopeDeg * Math.PI) / 180);
      expect(Math.abs(h - p.hBuilt) / p.hBuilt).toBeLessThan(0.025);
    }
    expect(k.halfE * 2).toBeGreaterThan(kh.halfE * 2);
    expect(k.hBuilt).toBeGreaterThan(kh.hBuilt);
    // Khafre still LOOKS taller: its top stands higher, on its higher bedrock
    const kc = pyramidCourses(k);
    const khc = pyramidCourses(kh);
    expect(khc.baseY + khc.top[khc.top.length - 1]).toBeGreaterThan(kc.baseY + kc.top[kc.top.length - 1]);
    // today's stepped core reaches today's real height, at half scale
    expect(kc.top[kc.top.length - 1]).toBeCloseTo(138.5 * GIZA_SCALE, 3);
    expect(khc.top[khc.top.length - 1]).toBeCloseTo(136.4 * GIZA_SCALE, 3);
  });

  it("lays the three pyramids out on their real diagonal", () => {
    const k = gizaWorld(0, 0);
    const kh = PYRAMIDS.find((p) => p.id === "khafre")!;
    const m = PYRAMIDS.find((p) => p.id === "menkaure")!;
    // Khafre ~467 m and Menkaure ~936 m from Khufu, both to the south-west
    expect(Math.hypot(kh.e, kh.s)).toBeGreaterThan(450);
    expect(Math.hypot(kh.e, kh.s)).toBeLessThan(480);
    expect(Math.hypot(m.e, m.s)).toBeGreaterThan(900);
    expect(Math.hypot(m.e, m.s)).toBeLessThan(960);
    const khw = gizaWorld(kh.e, kh.s);
    expect(khw.x).toBeLessThan(k.x);
    expect(khw.z).toBeGreaterThan(k.z);
    // the Sphinx faces east, below the pyramids to the south-east, on the lowest ground
    expect(gizaPlateauY(SPHINX_E, SPHINX_S)).toBeLessThan(gizaPlateauY(0, 0) - 15);
  });

  it("never lets two monuments overlap", () => {
    const fp = footprints();
    for (let i = 0; i < fp.length; i++)
      for (let j = i + 1; j < fp.length; j++) {
        const [a, ae, as, aw, ah] = fp[i];
        const [b, be, bs, bw, bh] = fp[j];
        const overlap = Math.abs(ae - be) < aw + bw && Math.abs(as - bs) < ah + bh;
        expect(overlap, `${a} overlaps ${b}`).toBe(false);
      }
  });

  it("keeps the causeways off the pyramids and tombs", () => {
    for (const c of CAUSEWAYS) {
      const [a, b] = c.pts;
      for (let t = 0.04; t <= 0.96; t += 0.02) {
        const e = a[0] + (b[0] - a[0]) * t;
        const s = a[1] + (b[1] - a[1]) * t;
        for (const p of PYRAMIDS) expect(Math.abs(e - p.e) < p.halfE + 2 && Math.abs(s - p.s) < p.halfS + 2, `${c.id} crosses ${p.id}`).toBe(false);
        for (const m of MASTABAS) expect(Math.abs(e - m.e) < m.halfE + 2 && Math.abs(s - m.s) < m.halfS + 2, `${c.id} crosses a mastaba`).toBe(false);
      }
    }
  });

  it("sits on its frozen site, clear of everything else on the island", () => {
    expect(GIZA_ORIGIN).toEqual({ x: 2070, z: -1500 });
    for (const [id, e, s, hw, hh] of footprints()) {
      for (const fe of [-1, 0, 1])
        for (const fs of [-1, 0, 1]) {
          const p = gizaWorld(e + fe * hw, s + fs * hh);
          expect(seaDist(p.x, p.z), `${id} too near the sea`).toBeLessThan(-50);
          expect(wildWaterSdf(p.x, p.z), `${id} in water`).toBeGreaterThan(20);
          expect(nearRail(p.x, p.z, 10) || nearRoad(p.x, p.z, 10) || nearCartRoad(p.x, p.z, 8) || nearFootpath(p.x, p.z, 6), `${id} on a path`).toBe(false);
          expect(Math.hypot(p.x - EVEREST_PEAK.x, p.z - EVEREST_PEAK.z), `${id} on Everest`).toBeGreaterThan(EVEREST_PEAK.r + 60);
          expect(Math.hypot(p.x - CANYON_SITE.x, p.z - CANYON_SITE.z)).toBeGreaterThan(CANYON_REACH + 200);
          for (const st of SETTLEMENTS) expect(Math.hypot(p.x - st.x, p.z - st.z), `${id} in ${st.id}`).toBeGreaterThan(120);
        }
    }
    for (const w of WONDERS) if (w.id !== "giza") expect(Math.hypot(w.x - gizaWorld(-60, 330).x, w.z - gizaWorld(-60, 330).z)).toBeGreaterThan(500);
  });

  it("levels the plateau under the monuments and blends it back to the land", () => {
    // the bake reaches the plateau's own level under each pyramid
    for (const p of PYRAMIDS) {
      const w = gizaWorld(p.e, p.s);
      expect(Math.abs(groundY(w.x, w.z) - gizaPlateauY(p.e, p.s))).toBeLessThan(0.6);
    }
    // far out, nothing changes
    const far = gizaWorld(-1100, 400);
    expect(gizaGroundY(far.x, far.z, 7)).toBeNull();
  });

  it("stands the kid on the courses, and treats every monument as a wall", () => {
    const k = pyramidCourses(PYRAMIDS[0]);
    // just in from the corner of the core: on the first course
    const y1 = gizaSolidY(k.cx + k.hx - k.inset[0] - 0.05, k.cz);
    expect(y1).toBeCloseTo(k.baseY + k.top[0], 4);
    // in the middle: the flat top platform
    expect(gizaSolidY(k.cx, k.cz)).toBeCloseTo(k.baseY + k.top[k.top.length - 1], 4);
    expect(worldFloorY(k.cx, k.cz)).toBeCloseTo(k.baseY + k.top[k.top.length - 1], 3);
    // the courses rise in steps no shallower than the cliff rule allows (0.12 + 1.6 × a stride)
    for (let i = 1; i < 40; i++) expect(k.top[i] - k.top[i - 1]).toBeGreaterThan(0.24);
    // every monument is inside the cliff-rule zone
    for (const b of GIZA_BLOCKS) expect(inGizaSolid(b.x, b.z)).toBe(true);
    // open sand between them is not
    const sand = gizaWorld(60, -150);
    expect(inGizaSolid(sand.x, sand.z)).toBe(false);
    expect(gizaSolidY(sand.x, sand.z)).toBeNull();
  });

  it("round-trips its own coordinates", () => {
    const p = gizaWorld(123, -45);
    const l = gizaLocal(p.x, p.z);
    expect(l.e).toBeCloseTo(123, 6);
    expect(l.s).toBeCloseTo(-45, 6);
  });
});
