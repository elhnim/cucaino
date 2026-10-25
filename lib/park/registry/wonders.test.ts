import { describe, expect, it } from "vitest";
import { WONDERS, wonderAt, wonderById, wonderSignAt } from "./wonders";
import { seaDist } from "./island";
import { WATER_Y, groundY } from "./terrain";
import {
  GORGE_REACH,
  VIC_BRIDGE,
  WILD_FALLS,
  WILD_FALLS_ISLANDS,
  WILD_FALLS_SECTIONS,
  WILD_LAKE,
  WILD_RIVER_LENGTH,
  WILD_RIVER_POINTS,
  WILD_SHELF,
  wildBridgeDeckY,
  wildRiverHalfWidth,
  wildShelfRadius,
  wildWaterSdf,
} from "./wildWater";

describe("the Natural Wonders registry", () => {
  it("every wonder is well-formed: true, kid-level facts, a discovery spot on dry land, a unique id", () => {
    expect(WONDERS.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const w of WONDERS) {
      expect(ids.has(w.id), `duplicate id ${w.id}`).toBe(false);
      ids.add(w.id);
      expect(w.name.length).toBeGreaterThan(0);
      expect(w.emoji.length).toBeGreaterThan(0);
      expect(w.realPlace.length).toBeGreaterThan(0);
      expect(w.facts.length).toBeGreaterThanOrEqual(5);
      for (const f of w.facts) expect(f.length, f).toBeLessThanOrEqual(120);
      expect(seaDist(w.x, w.z), `${w.name} discovery spot`).toBeLessThan(0);
      expect(w.r).toBeGreaterThan(20);
    }
  });

  it("wonderById / wonderAt / wonderSignAt find the right thing", () => {
    const vf = wonderById("victoria-falls")!;
    expect(vf).toBeTruthy();
    expect(wonderAt(vf.x, vf.z)?.id).toBe("victoria-falls");
    expect(wonderAt(vf.x + 10000, vf.z + 10000)).toBeNull();
    for (const vp of vf.viewpoints ?? []) {
      const sign = wonderSignAt(vp.x, vp.z, 6);
      expect(sign?.wonder.id, `sign at ${vp.x},${vp.z}`).toBe("victoria-falls");
      expect(vf.facts).toContain(sign?.fact);
    }
    expect(wonderSignAt(vf.x + 10000, vf.z + 10000)).toBeNull();
  });
});

describe("Victoria Falls (Mosi-oa-Tunya)", () => {
  it("is one very wide curtain in several sections along the shelf's own rim, with rocky islands between them", () => {
    expect(WILD_FALLS_SECTIONS.length).toBeGreaterThanOrEqual(3);
    // every section's lip sits right on the shelf's rim (real rock, however the brow bulges)
    for (const s of WILD_FALLS_SECTIONS) {
      const dx = s.lip.x - WILD_SHELF.x;
      const dz = s.lip.z - WILD_SHELF.z;
      const r = Math.hypot(dx, dz);
      expect(r, `section at heading ${s.heading}`).toBeCloseTo(wildShelfRadius(Math.atan2(dx, dz)) - 0.8, 0);
      // the shelf's own top is solid ground right behind the lip (not a cliff someone could glitch through)
      expect(groundY(WILD_SHELF.x + dx * 0.7, WILD_SHELF.z + dz * 0.7)).toBeGreaterThan(30);
    }
    // the main (original, unchanged) lip is still exactly where every other system expects it
    expect(WILD_FALLS_SECTIONS[0].lip.x).toBeCloseTo(WILD_FALLS.lip.x, 5);
    expect(WILD_FALLS_SECTIONS[0].lip.z).toBeCloseTo(WILD_FALLS.lip.z, 5);
    // sections are genuinely spread out, not stacked on each other
    for (let i = 0; i + 1 < WILD_FALLS_SECTIONS.length; i++) {
      const a = WILD_FALLS_SECTIONS[i].lip;
      const b = WILD_FALLS_SECTIONS[i + 1].lip;
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(20);
    }
    // the overall curtain (first section to last, plus their own widths) reads as a genuinely wide falls
    const first = WILD_FALLS_SECTIONS[0];
    const last = WILD_FALLS_SECTIONS[WILD_FALLS_SECTIONS.length - 1];
    const span = Math.hypot(first.lip.x - last.lip.x, first.lip.z - last.lip.z) + first.width / 2 + last.widthBottom / 2;
    expect(span).toBeGreaterThan(70);
    // the islands sit between the sections, on the same clifftop rock
    expect(WILD_FALLS_ISLANDS.length).toBeGreaterThanOrEqual(2);
    for (const isl of WILD_FALLS_ISLANDS) expect(groundY(isl.x, isl.z)).toBeGreaterThan(30);
  });

  it("the shelf's cliff is still highest right at the lip (Treetop, far away, keeps its own clearing)", () => {
    // groundY right over the lip is roughly the shelf top (sheer, not a gentle slope)
    const L = WILD_FALLS.lip;
    expect(groundY(WILD_SHELF.x + (L.x - WILD_SHELF.x) * 0.5, WILD_SHELF.z + (L.z - WILD_SHELF.z) * 0.5)).toBeGreaterThan(38);
  });

  it("pours into a narrow, deep, zig-zagging gorge that then opens into the ordinary river valley", () => {
    // narrow AND deep right by the pool
    const near = wildRiverHalfWidth(10);
    const far = wildRiverHalfWidth(300);
    expect(near, "the gorge is narrower than the open valley").toBeLessThan(far - 1.5);
    expect(near).toBeGreaterThan(2); // still wide enough to be a real channel, not a crack
    // it zig-zags: the first ~90 units of the river's path aren't a straight line
    let maxDev = 0;
    const a = WILD_RIVER_POINTS[0];
    const b = WILD_RIVER_POINTS[Math.min(WILD_RIVER_POINTS.length - 1, 22)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    for (let k = 0; k < 22 && k < WILD_RIVER_POINTS.length; k++) {
      const [x, z] = WILD_RIVER_POINTS[k];
      maxDev = Math.max(maxDev, Math.abs(((x - a[0]) * (b[1] - a[1]) - (z - a[1]) * (b[0] - a[0])) / L));
    }
    expect(maxDev, "the gorge should swing well off the straight line between its ends").toBeGreaterThan(8);
    // deeper than the ordinary river close to the pool
    const nearPt = WILD_RIVER_POINTS[6];
    expect(WATER_Y - groundY(nearPt[0], nearPt[1]), "the gorge pool/channel runs deep").toBeGreaterThan(2.2);
    expect(GORGE_REACH).toBeGreaterThan(50);
  });

  it("still reaches the Great Lake exactly as before (river/lake/pool tests keep passing)", () => {
    expect(WILD_RIVER_LENGTH).toBeGreaterThan(300);
    const end = WILD_RIVER_POINTS[WILD_RIVER_POINTS.length - 1];
    expect(wildWaterSdf(end[0], end[1])).toBeLessThan(0);
    expect(Math.hypot(end[0] - WILD_LAKE.x, end[1] - WILD_LAKE.z)).toBeLessThan(260);
  });

  it("the Victoria Falls Bridge spans the gorge, high above the water, and is walkable end to end", () => {
    const b = VIC_BRIDGE;
    expect(b.y0 - WATER_Y).toBeGreaterThan(20); // dramatically above the river, like the real bridge
    // every point along the deck resolves to a sensible height between its two (possibly different —
    // the gorge's two rims aren't always exactly level) bank heights, plus the arch's own small camber
    const mid = wildBridgeDeckY(b.x, b.z)!;
    const end0 = wildBridgeDeckY(b.x - Math.sin(b.heading) * (b.span / 2 - 0.3), b.z - Math.cos(b.heading) * (b.span / 2 - 0.3))!;
    const end1 = wildBridgeDeckY(b.x + Math.sin(b.heading) * (b.span / 2 - 0.3), b.z + Math.cos(b.heading) * (b.span / 2 - 0.3))!;
    expect(mid).not.toBeNull();
    expect(end0).not.toBeNull();
    expect(end1).not.toBeNull();
    expect(end0).toBeCloseTo(b.y0, 0);
    expect(end1).toBeCloseTo(b.y1, 0);
    expect(mid).toBeGreaterThan(Math.min(end0, end1));
    // off the deck (too far to the side, or well past either end) isn't walkable
    expect(wildBridgeDeckY(b.x + Math.cos(b.heading) * (b.half + 3), b.z - Math.sin(b.heading) * (b.half + 3))).toBeNull();
    expect(wildBridgeDeckY(b.x + Math.sin(b.heading) * (b.span / 2 + 10), b.z + Math.cos(b.heading) * (b.span / 2 + 10))).toBeNull();
    // the bridge sits within the Victoria Falls wonder's discovery/viewpoint reach
    const vf = wonderById("victoria-falls")!;
    expect(Math.hypot(vf.x - b.x, vf.z - b.z)).toBeLessThan(vf.r);
  });
});
