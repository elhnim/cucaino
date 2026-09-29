import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildChibi, CHIBI_IDS, type ChibiAction } from "./chibi";
import { PARK_ANIMALS, parkAnimalForPet } from "@/lib/park/registry/animals";
import { PET_SPECIES } from "@/lib/pet/config";

const ROLES = ["kid", "pet", "visitor"] as const;
const ACTIONS: ChibiAction[] = ["idle", "walk", "run", "wave", "cheer", "eat", "dance", "sad", "sleep", "fetch"];

function stats(root: THREE.Object3D) {
  let meshes = 0, tris = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return { meshes, tris };
}

function finite(root: THREE.Object3D) {
  let ok = true;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    for (const v of o.matrixWorld.elements) if (!Number.isFinite(v)) ok = false;
  });
  return ok;
}

describe("chibi characters", () => {
  it("supports all 24 park animals + the 3 Star Pets-only designs", () => {
    expect(CHIBI_IDS.length).toBe(27);
    expect(new Set(CHIBI_IDS).size).toBe(27);
    for (const a of PARK_ANIMALS) expect(CHIBI_IDS).toContain(a.id);
  });

  it("gives every Star Pets species its own design (no stand-ins)", () => {
    for (const s of PET_SPECIES) expect(CHIBI_IDS).toContain(parkAnimalForPet(s.id));
    expect(parkAnimalForPet("dragon")).toBe("animal-dragon");
    expect(parkAnimalForPet("unicorn")).toBe("animal-unicorn");
    expect(parkAnimalForPet("hippo")).toBe("animal-hippo");
    expect(new Set(PET_SPECIES.map((s) => parkAnimalForPet(s.id))).size).toBe(PET_SPECIES.length);
  });

  it("keeps the pet-only designs out of the kid animal picker", () => {
    const kid = PARK_ANIMALS.map((a) => a.id as string);
    for (const id of ["animal-dragon", "animal-unicorn", "animal-hippo"]) expect(kid).not.toContain(id);
  });

  it("dragon wings flap", () => {
    const rig = buildChibi("animal-dragon", { height: 1.25, role: "pet", seed: 3 });
    const wing = rig.root.getObjectByName("wingL")!;
    expect(wing).toBeTruthy();
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) {
      rig.update(1 / 30, 0);
      seen.add(Math.round(wing.rotation.z * 100));
    }
    expect(seen.size).toBeGreaterThan(5);
    rig.dispose();
  });

  for (const id of CHIBI_IDS) {
    for (const role of ROLES) {
      it(`${id} (${role}) fits the budget and animates cleanly`, () => {
        for (const seed of role === "visitor" ? [1, 2, 3, 4, 5, 6, 7] : [1]) {
          const height = role === "pet" ? 1.25 : 2.1;
          const rig = buildChibi(id, { height, role, accent: "#4f46e5", seed });
          const { meshes, tris } = stats(rig.root);
          expect(meshes).toBeLessThanOrEqual(40);
          expect(tris).toBeLessThanOrEqual(6000);

          // stands on the ground and is about the requested height
          rig.root.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(rig.root);
          expect(box.min.y).toBeGreaterThan(-0.05 * height);
          expect(box.max.y).toBeGreaterThan(height * 0.8);
          expect(box.max.y).toBeLessThan(height * 1.35);

          let frame = 0;
          for (const a of ACTIONS) {
            rig.play(a, frame % 2 === 0);
            for (let i = 0; i < 40; i++, frame++) {
              const speed = [0, 0.1, 1.5, 3, 5, 8][Math.floor(frame / 7) % 6];
              rig.setGlow((frame % 60) / 60);
              rig.update(i === 3 ? 0.5 : 1 / 60, speed);
            }
          }
          rig.update(NaN, NaN);
          rig.update(-1, -5);
          expect(finite(rig.root)).toBe(true);
          rig.dispose();
        }
      });
    }
  }
});
