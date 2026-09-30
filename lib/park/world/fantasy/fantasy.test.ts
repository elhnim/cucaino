import { describe, expect, it } from "vitest";
import { POND, STREAM_POINTS, TRAIL_POINTS, nearTrail, nearStream } from "../../registry/island";
import { LANDS, PLACES } from "../../registry/places";
import { groundY } from "../../registry/terrain";
import { zoneBounds } from "../../builder/rules";
import { defaultFantasyFree, planFantasy } from "./placement";
import { bakeGrassMask, maskAt } from "./mask";
import { SKY_ISLANDS, skyTopY } from "../../registry/skyIslands";

const free = defaultFantasyFree();
const zb = zoneBounds();
const inZone = (x: number, z: number) => x > zb.minX && x < zb.maxX && z > zb.minZ && z < zb.maxZ;
const forest = LANDS.find((l) => l.id === "forest")!;

describe("fantasy placement", () => {
  const plan = planFantasy(free);
  const low = planFantasy(free, { lowQuality: true });

  it("is deterministic", () => {
    const again = planFantasy(free);
    expect(again.trees.map((t) => [t.x, t.z])).toEqual(plan.trees.map((t) => [t.x, t.z]));
    expect(again.obstacles).toEqual(plan.obstacles);
  });

  it("places a sensible amount of everything (less at low quality)", () => {
    expect(plan.trees.length).toBeGreaterThanOrEqual(60);
    expect(plan.trees.length).toBeLessThanOrEqual(120);
    expect(new Set(plan.trees.map((t) => t.species)).size).toBe(4);
    expect(plan.ruins.length).toBeGreaterThanOrEqual(3);
    expect(plan.ruins.length).toBeLessThanOrEqual(5);
    expect(plan.giants.length).toBeGreaterThanOrEqual(3);
    expect(plan.islands.length).toBeGreaterThanOrEqual(3);
    expect(plan.crystals.length).toBeGreaterThan(10);
    expect(plan.rocks.some((r) => r.big)).toBe(true);
    expect(low.trees.length).toBeLessThan(plan.trees.length);
    expect(low.rocks.length).toBeLessThan(plan.rocks.length);
  });

  it("keeps trees, rocks, crystals, mushrooms and ruins off trails, water, places, the plaza and the Dream Park", () => {
    const things = [
      ...plan.trees.map((t) => ({ x: t.x, z: t.z, pad: 1.5 })),
      ...plan.rocks.map((r) => ({ x: r.x, z: r.z, pad: r.s * 0.5 })),
      ...plan.crystals.map((c) => ({ x: c.x, z: c.z, pad: 0.8 })),
      ...plan.mushrooms.map((m) => ({ x: m.x, z: m.z, pad: 0.5 })),
      ...plan.giants.map((g) => ({ x: g.x, z: g.z, pad: 5 })),
      ...plan.ruins.flatMap((s) => s.parts.map((p) => ({ x: p.x, z: p.z, pad: 1 }))),
    ];
    for (const t of things) {
      expect(nearTrail(t.x, t.z, 1.5 + t.pad), `on a trail at ${t.x.toFixed(1)},${t.z.toFixed(1)}`).toBe(false);
      expect(nearStream(t.x, t.z, t.pad * 0.5), `in the stream at ${t.x.toFixed(1)},${t.z.toFixed(1)}`).toBe(false);
      expect(Math.hypot(t.x, t.z)).toBeGreaterThan(12);
      expect(inZone(t.x, t.z)).toBe(false);
      for (const p of PLACES) expect(Math.hypot(t.x - p.x, t.z - p.z), `on ${p.id}`).toBeGreaterThan(Math.max(p.radius, 1.5));
    }
  });

  it("puts every ruin part through the free check with its site radius", () => {
    for (const s of plan.ruins) expect(free(s.x, s.z, s.r)).toBe(true);
  });

  it("sits everything on the terrain", () => {
    for (const t of plan.trees) expect(Math.abs(t.y - groundY(t.x, t.z))).toBeLessThan(0.01);
    for (const r of plan.rocks) expect(r.y).toBeLessThanOrEqual(groundY(r.x, r.z));
    for (const s of plan.ruins) for (const p of s.parts) expect(Math.abs(p.y - groundY(p.x, p.z))).toBeLessThan(0.01);
  });

  it("gives the Glow Forest to the giants", () => {
    for (const g of plan.giants) expect(Math.hypot(g.x - forest.x, g.z - forest.z)).toBeLessThan(forest.radius + 14);
    for (const t of plan.trees) expect(Math.hypot(t.x - forest.x, t.z - forest.z)).toBeGreaterThan(forest.radius + 3.9);
    // giants stand well apart
    for (const a of plan.giants) for (const b of plan.giants) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(20);
  });

  it("returns a sane obstacle list", () => {
    expect(plan.obstacles.length).toBeGreaterThan(20);
    for (const o of plan.obstacles) {
      expect(Number.isFinite(o.x) && Number.isFinite(o.z)).toBe(true);
      expect(o.r).toBeGreaterThan(0.3);
      expect(o.r).toBeLessThan(6);
      expect(Math.hypot(o.x, o.z)).toBeLessThan(160);
      // never block a trail
      expect(nearTrail(o.x, o.z, 1.5 + o.r * 0.5)).toBe(false);
    }
    // every big boulder is an obstacle
    for (const b of plan.rocks.filter((r) => r.big)) expect(plan.obstacles.some((o) => o.x === b.x && o.z === b.z)).toBe(true);
  });

  it("floats the islands high, away from the centre and clear of the mountains", () => {
    expect(plan.islands.map((s) => s.id)).toEqual(SKY_ISLANDS.map((s) => s.id));
    for (const s of plan.islands) {
      expect(s.y).toBeGreaterThanOrEqual(42);
      expect(s.y).toBeLessThanOrEqual(115);
      expect(Math.hypot(s.x, s.z)).toBeGreaterThan(50);
      // the spot is on the island's walkable top
      expect(skyTopY(s.x, s.z, 0)?.id).toBe(s.id);
      expect(s.y - groundY(s.x, s.z)).toBeGreaterThan(30);
    }
  });
});

describe("grass mask", () => {
  const mask = bakeGrassMask(512);

  it("has no grass on trails, the stream, the pond, the plaza, places or the Dream Park", () => {
    for (const pts of TRAIL_POINTS) for (const [x, z] of pts.filter((_, i) => i % 3 === 0)) expect(maskAt(mask, x, z)).toBeLessThan(0.05);
    for (const [x, z] of STREAM_POINTS.filter((_, i) => i % 4 === 0)) expect(maskAt(mask, x, z)).toBeLessThan(0.05);
    expect(maskAt(mask, POND.x, POND.z)).toBe(0);
    expect(maskAt(mask, 0, 0)).toBe(0);
    for (const p of PLACES) expect(maskAt(mask, p.x, p.z)).toBe(0);
    expect(maskAt(mask, (zb.minX + zb.maxX) / 2, (zb.minZ + zb.maxZ) / 2)).toBe(0);
  });

  it("grows grass in the open meadows and none in the sea", () => {
    let grassy = 0;
    let n = 0;
    for (let x = -120; x <= 120; x += 12)
      for (let z = -120; z <= 120; z += 12) {
        if (Math.hypot(x, z) > 130 || Math.hypot(x, z) < 20) continue;
        n++;
        if (maskAt(mask, x, z) > 0.5) grassy++;
      }
    expect(grassy / n).toBeGreaterThan(0.45);
    expect(maskAt(mask, 0, 164)).toBe(0);
    expect(maskAt(mask, 200, 0)).toBe(0);
  });
});
