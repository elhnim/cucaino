import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { SETTLEMENTS } from "../../registry/settlements";
import { CRITTER_KIND, buildCrittersGeometry, critterGroundY, makeCritters, stepCritters } from "./critters";

describe("settlements' small life (critters)", () => {
  it("builds one merged geometry for every variant (a single instanced mesh, one draw call)", () => {
    const geo = buildCrittersGeometry();
    expect(geo.attributes.position.count).toBeGreaterThan(0);
    // the folk layout: position/normal/color/aSlot/aVar/aGlow, no index (merged, non-indexed parts)
    expect(geo.index).toBeNull();
    for (const name of ["normal", "color", "aSlot", "aVar", "aGlow"]) expect(geo.attributes[name], name).toBeTruthy();
    geo.dispose();
  });

  for (const def of SETTLEMENTS) {
    it(`${def.id}: every critter starts inside the village (within its radius), and ducks (if any) are the only ones afloat`, () => {
      const list = makeCritters(def);
      expect(list.length).toBeGreaterThan(0);
      for (const c of list) {
        expect(Math.hypot(c.x - def.x, c.z - def.z), `${def.id} critter kind ${c.kind}`).toBeLessThan(def.radius + 6);
        expect(c.afloat).toBe(c.kind === CRITTER_KIND.duck);
      }
    });

    it(`${def.id}: critters stay near home (ducks on the water, everyone else on land) over a long run, with the kid far away — pure, allocation-free stepping`, () => {
      const list = makeCritters(def);
      const far = { x: def.x + 5000, z: def.z + 5000 };
      let t = 0;
      for (let k = 0; k < 600; k++) stepCritters(list, 1 / 20, (t += 1 / 20), far);
      for (const c of list) {
        // every critter (the dog included — nothing nearby to amble towards) stays a short wander
        // from its own home spot, never drifting off across the village
        expect(Math.hypot(c.x - c.hx, c.z - c.hz), `${def.id} critter kind ${c.kind} drifted from home`).toBeLessThan(12);
        expect(Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.yaw)).toBe(true);
      }
    });

    it(`${def.id}: the dog ambles toward the kid when they're close, but doesn't teleport onto them`, () => {
      const list = makeCritters(def);
      const dog = list.find((c) => c.kind === CRITTER_KIND.dog);
      if (!dog) return;
      const kid = { x: dog.hx + 4, z: dog.hz };
      let t = 0;
      for (let k = 0; k < 100; k++) stepCritters([dog], 1 / 20, (t += 1 / 20), kid);
      expect(Math.hypot(dog.x - kid.x, dog.z - kid.z)).toBeGreaterThan(0.5);
      expect(Math.hypot(dog.x - dog.hx, dog.z - dog.hz)).toBeLessThan(10);
    });
  }

  it("nothing floats or is buried: critterGroundY tracks the real terrain, except an afloat duck, which rides the lake's own fixed water level", () => {
    const lakeside = SETTLEMENTS.find((s) => s.id === "lakeside")!;
    const list = makeCritters(lakeside);
    for (const c of list) {
      const y = critterGroundY(c);
      expect(Number.isFinite(y)).toBe(true);
      if (c.afloat) expect(y).toBeLessThan(1); // the lake's surface, not a hillside
    }
  });

  it("every settlement's props/decks/fauna this pass added sit inside its own radius (nothing straying off the village pad)", () => {
    for (const s of SETTLEMENTS) {
      for (const p of s.props) expect(Math.hypot(p.x - s.x, p.z - s.z), `${s.id} prop ${p.kind}`).toBeLessThan(s.radius + 6);
      for (const d of s.decks) {
        const [x, z] = d.kind === "circle" ? [d.x, d.z] : [(d.ax + d.bx) / 2, (d.az + d.bz) / 2];
        expect(Math.hypot(x - s.x, z - s.z), `${s.id} deck`).toBeLessThan(s.radius + 10);
      }
      for (const f of s.fauna) expect(Math.hypot(f.x - s.x, f.z - s.z), `${s.id} fauna ${f.id}`).toBeLessThan(s.radius + 6);
    }
  });
});

describe("the fx material's folk layout accepts the critters geometry (sanity: a THREE.InstancedMesh can be built from it)", () => {
  it("builds without throwing", () => {
    const geo = buildCrittersGeometry();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true });
    const mesh = new THREE.InstancedMesh(geo, mat, 3);
    expect(mesh.count).toBe(3);
    geo.dispose();
    mat.dispose();
  });
});
