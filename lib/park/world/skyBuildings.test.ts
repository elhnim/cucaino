import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { buildSkyBuilding, SKY_BUILDING_IDS, type SkyBuilding } from "./skyBuildings";

// the pads they stand on (lib/park/registry/skyIslands.ts PAD_DEFS)
const PAD_R: Record<string, number> = { arcade: 6, "retro-arcade": 5.5, "story-theatre": 6, library: 6, "learning-tree": 4 };

function meshes(b: SkyBuilding): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  b.group.traverse((o) => (o as THREE.Mesh).isMesh && o.visible && out.push(o as THREE.Mesh));
  return out;
}
const tris = (b: SkyBuilding) => meshes(b).reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute("position").count) / 3, 0);

/** max horizontal reach, min and max height over a few animation frames */
function extent(b: SkyBuilding) {
  let reach = 0, minY = Infinity, maxY = -Infinity;
  let finite = true;
  const v = new THREE.Vector3();
  for (const t of [0, 0.7, 1.9, 3.3, 5.1, 8.4, 13.7, 21.2, 40.5]) {
    b.update(1 / 60, t, t % 2 ? 1 : 0);
    b.group.updateMatrixWorld(true);
    for (const m of meshes(b)) {
      const p = m.geometry.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        if (!Number.isFinite(v.x + v.y + v.z)) finite = false;
        reach = Math.max(reach, Math.hypot(v.x, v.z));
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
    }
  }
  return { reach, minY, maxY, finite };
}

describe("sky buildings", () => {
  it("has no building for other places", () => {
    expect(buildSkyBuilding("quest-board", 6)).toBeNull();
  });

  for (const id of SKY_BUILDING_IDS)
    for (const low of [false, true])
      describe(`${id}${low ? " (low)" : ""}`, () => {
        const r = PAD_R[id];
        it("fits its pad, stands on y=0, 6–11 m tall, finite", () => {
          const b = buildSkyBuilding(id, r, low)!;
          const e = extent(b);
          // eslint-disable-next-line no-console
          if (!low) console.log(id, { reach: e.reach.toFixed(2), maxY: e.maxY.toFixed(2), tris: tris(b), calls: meshes(b).length });
          expect(e.finite).toBe(true);
          expect(e.reach).toBeLessThanOrEqual(r - 0.4);
          expect(e.minY).toBeGreaterThanOrEqual(-0.01);
          expect(e.minY).toBeLessThan(0.05);
          expect(e.maxY).toBeGreaterThanOrEqual(6);
          expect(e.maxY).toBeLessThanOrEqual(11);
          b.dispose();
        });
        it("keeps to the draw-call and triangle budget", () => {
          const b = buildSkyBuilding(id, r, low)!;
          expect(meshes(b).length).toBeLessThanOrEqual(5);
          expect(tris(b)).toBeLessThanOrEqual(low ? 6000 : 12000);
          for (const m of meshes(b)) {
            const e = (m.material as THREE.MeshBasicMaterial).color;
            b.update(0, 1, 1);
            // modest HDR for bloom
            expect(Math.max(e.r, e.g, e.b)).toBeLessThanOrEqual(1.4);
          }
          b.dispose();
        });
        it("is deterministic", () => {
          const a = buildSkyBuilding(id, r, low)!;
          const b = buildSkyBuilding(id, r, low)!;
          a.update(0, 2.5, 0.3);
          b.update(0, 2.5, 0.3);
          const ma = meshes(a), mb = meshes(b);
          expect(ma.length).toBe(mb.length);
          ma.forEach((m, i) => {
            expect(Array.from(m.geometry.getAttribute("position").array)).toEqual(Array.from(mb[i].geometry.getAttribute("position").array));
            expect(Array.from(m.geometry.getAttribute("color").array)).toEqual(Array.from(mb[i].geometry.getAttribute("color").array));
          });
          a.dispose();
          b.dispose();
        });
        it("disposes every geometry and material", () => {
          const b = buildSkyBuilding(id, r, low)!;
          const parent = new THREE.Group();
          parent.add(b.group);
          const spies: ReturnType<typeof vi.fn>[] = [];
          const seen = new Set<object>();
          for (const m of meshes(b))
            for (const d of [m.geometry, m.material as THREE.Material]) {
              if (seen.has(d)) continue;
              seen.add(d);
              const s = vi.spyOn(d, "dispose");
              spies.push(s as unknown as ReturnType<typeof vi.fn>);
            }
          b.dispose();
          for (const s of spies) expect(s).toHaveBeenCalled();
          expect(b.group.parent).toBeNull();
        });
      });

  it("shrinks to fit a smaller pad", () => {
    const b = buildSkyBuilding("library", 4.5)!;
    expect(extent(b).reach).toBeLessThanOrEqual(4.1);
    b.dispose();
  });
});
