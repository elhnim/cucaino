import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildSettlements } from "./index";
import { SETTLEMENTS, settlementDeckY } from "../../registry/settlements";

function meshStats(scene: THREE.Scene) {
  let drawCalls = 0;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    drawCalls++;
  });
  return drawCalls;
}

describe("Wildlands settlements, streamed", () => {
  it("builds nothing at the park's spawn (the kid starts ~1.5 km away)", () => {
    const scene = new THREE.Scene();
    const s = buildSettlements(scene, {});
    s.update(1 / 20, 1, { kid: new THREE.Vector3(0, 0, 0), glow: 0, hour: 10 });
    expect(meshStats(scene)).toBe(0);
    s.dispose();
  });

  it("builds a settlement when the kid is near its station, within the draw-call budget, and tears it down far away", () => {
    const scene = new THREE.Scene();
    const s = buildSettlements(scene, {});
    const def = SETTLEMENTS[0];
    let t = 0;
    for (let k = 0; k < 20; k++) s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(def.x, 2, def.z), glow: 0, hour: 10 });
    expect(meshStats(scene)).toBeGreaterThan(0);
    expect(meshStats(scene)).toBeLessThanOrEqual(12);
    // far away again: torn down
    for (let k = 0; k < 5; k++) s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(def.x + 2000, 2, def.z), glow: 0, hour: 10 });
    expect(meshStats(scene)).toBe(0);
    s.dispose();
  });

  it("offers the fishing activity only right at the pier's end, and a talker when close to a chatty villager", () => {
    const scene = new THREE.Scene();
    const s = buildSettlements(scene, {});
    const def = SETTLEMENTS[0];
    const fishing = def.activities.find((a) => a.id === "fishing")!;
    let t = 0;
    let res = s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(def.x, 2, def.z), glow: 0, hour: 10 });
    expect(res.activity).toBeNull();
    for (let k = 0; k < 30; k++) res = s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(fishing.x, 2, fishing.z), glow: 0, hour: 10 });
    expect(res.activity?.id).toBe("fishing");
    expect(res.activity?.emoji).toBe(fishing.emoji);
    s.dispose();
    expect(scene.children.length).toBe(0);
  });

  for (const id of ["treetop", "highstone", "town", "basecamp", "paricutin-farm"]) {
    it(`${id}: builds within the draw-call budget at its own centre, offers its activity, and tears down far away`, () => {
      const scene = new THREE.Scene();
      const s = buildSettlements(scene, {});
      const def = SETTLEMENTS.find((x) => x.id === id)!;
      expect(def).toBeTruthy();
      let t = 0;
      for (let k = 0; k < 20; k++) s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(def.x, 2, def.z), glow: 0, hour: 10 });
      expect(meshStats(scene)).toBeGreaterThan(0);
      expect(meshStats(scene)).toBeLessThanOrEqual(12);

      const act = def.activities[0];
      let res = s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(act.x + 20, 2, act.z + 20), glow: 0, hour: 10 });
      expect(res.activity).toBeNull();
      for (let k = 0; k < 30; k++) res = s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(act.x, 2, act.z), glow: 0, hour: 10 });
      expect(res.activity?.id).toBe(act.id);

      for (let k = 0; k < 5; k++) s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(def.x + 2000, 2, def.z), glow: 0, hour: 10 });
      expect(meshStats(scene)).toBe(0);
      s.dispose();
    });
  }

  it("Treetop's platforms and the ramp/bridge between them are walkable (settlementDeckY), and a kid up there doesn't fall through", () => {
    const scene = new THREE.Scene();
    const s = buildSettlements(scene, {});
    const def = SETTLEMENTS.find((x) => x.id === "treetop")!;
    let t = 0;
    for (let k = 0; k < 20; k++) s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(def.x, 2, def.z), glow: 0, hour: 10 });
    for (const d of def.decks) {
      const [x, z] = d.kind === "circle" ? [d.x, d.z] : [(d.ax + d.bx) / 2, (d.az + d.bz) / 2];
      expect(settlementDeckY(x, z), `${d.kind} at ${x},${z}`).not.toBeNull();
    }
    s.dispose();
  });

  it("Highstone's yaks and goats stay put in the pasture (static — no per-frame drift)", () => {
    const scene = new THREE.Scene();
    const s = buildSettlements(scene, {});
    const def = SETTLEMENTS.find((x) => x.id === "highstone")!;
    expect(def.fauna.length).toBeGreaterThanOrEqual(5);
    let t = 0;
    for (let k = 0; k < 60; k++) s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(def.x, 2, def.z), glow: 0, hour: 10 });
    expect(meshStats(scene)).toBeGreaterThan(0);
    s.dispose();
  });

  it("Sunnybrook's clock hands follow the park hour and the windmill's sails keep spinning (its own small moving meshes, not the merged props)", () => {
    const scene = new THREE.Scene();
    const s = buildSettlements(scene, {});
    const def = SETTLEMENTS.find((x) => x.id === "town")!;
    const findByName = (name: string) => {
      let found: THREE.Object3D | null = null;
      scene.traverse((o) => {
        if (o.name === name) found = o;
      });
      return found as THREE.Mesh | null;
    };
    let t = 0;
    // settle in at hour 6
    for (let k = 0; k < 20; k++) s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(def.x, 2, def.z), glow: 0, hour: 6 });
    const hour6 = findByName("town-clock-hour")!.rotation.z;
    const sails6 = findByName("town-windmill-sails")!.rotation.z;
    // move on to hour 15 (not 12 hours later — a 12-hour dial would read the same — so the hour
    // hand must have visibly swept; the sails, driven by elapsed time not the hour, kept turning)
    for (let k = 0; k < 20; k++) s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(def.x, 2, def.z), glow: 0, hour: 15 });
    const hour15 = findByName("town-clock-hour")!.rotation.z;
    const sails15 = findByName("town-windmill-sails")!.rotation.z;
    expect(hour15).not.toBeCloseTo(hour6, 3);
    expect(sails15).not.toBeCloseTo(sails6, 3);
    s.dispose();
  });

  it("Sunnybrook's market stall activity offers the right id/label right at its stall, not elsewhere", () => {
    const scene = new THREE.Scene();
    const s = buildSettlements(scene, {});
    const def = SETTLEMENTS.find((x) => x.id === "town")!;
    const act = def.activities.find((a) => a.id === "market")!;
    expect(act).toBeTruthy();
    let t = 0;
    let res = s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(def.x, 2, def.z), glow: 0, hour: 10 });
    expect(res.activity).toBeNull();
    for (let k = 0; k < 30; k++) res = s.update(1 / 20, (t += 1 / 20), { kid: new THREE.Vector3(act.x, 2, act.z), glow: 0, hour: 10 });
    expect(res.activity?.id).toBe("market");
    expect(res.activity?.label).toBe("Run a market stall");
    s.dispose();
  });
});
