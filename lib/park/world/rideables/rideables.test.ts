import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildRideables } from "./index";
import { pickSeaCall, angleTo, turnTowards, SEA_MIN_DEPTH, type SeaCall } from "./plan";
import { RIDEABLE_SPOTS } from "../../registry/rideables";
import { RIDEABLE_KINDS, buildMount, mountStatueGeometry } from "../../characters/mounts";
import { atSea } from "../underwater/plan";
import { seaDepth } from "../sea/wander";
import { WATER_Y, groundY } from "../../registry/terrain";

const spot = (id: string) => RIDEABLE_SPOTS.find((s) => s.id === id)!;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** draw calls the group would issue: visible meshes (instanced meshes with count 0 are hidden) */
function drawCalls(root: THREE.Object3D) {
  let n = 0;
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !((o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).count === 0)) n++;
    o.children.forEach(walk);
  };
  walk(root);
  return n;
}

describe("mount rigs", () => {
  it("every kind builds as one skinned mesh + a shadow, with a seat above its feet", () => {
    for (const k of [...RIDEABLE_KINDS, "pony" as const]) {
      const rig = buildMount(k);
      let meshes = 0;
      rig.root.traverse((o) => (o as THREE.Mesh).isMesh && meshes++);
      expect(meshes, k).toBe(2);
      expect(rig.root.getObjectByName("mount-body")).toBeTruthy();
      for (let i = 0; i < 20; i++) rig.update(0.05, 6, k === "manta" || k === "dragon", 0.5, 0);
      expect(rig.seat.y, k).toBeGreaterThan(0.3);
      expect(Number.isFinite(rig.seat.x + rig.seat.y + rig.seat.z + rig.petSeat.y)).toBe(true);
      rig.dispose();
      const g = mountStatueGeometry(k);
      expect(g.attributes.position.count).toBeGreaterThan(100);
      expect(g.attributes.glow).toBeTruthy();
      g.dispose();
    }
  });
  it("flies = the engine's 3D-altitude movement (dragon in the air, manta under water)", () => {
    expect(buildMount("dragon").flies).toBe(true);
    expect(buildMount("manta").flies).toBe(true);
    for (const k of ["bike", "car", "unicorn", "pony", "whale", "dolphin"] as const) expect(buildMount(k).flies, k).toBe(false);
  });
});

describe("sea call planning", () => {
  it("comes up seaward of the kid, in deep enough water, 8-14 m away", () => {
    const kid = atSea(0.9, 60);
    const out: SeaCall = { x: 0, z: 0, sx: 0, sz: 0 };
    let ok = 0;
    for (let i = 0; i < 40; i++) {
      const c = pickSeaCall(kid.x, kid.z, "dolphin", (i % 8) / 8, (i % 5) / 5, out);
      if (!c) continue;
      ok++;
      const d = Math.hypot(c.x - kid.x, c.z - kid.z);
      expect(d).toBeGreaterThanOrEqual(8);
      expect(d).toBeLessThanOrEqual(14);
      expect(seaDepth(c.x, c.z)).toBeGreaterThanOrEqual(SEA_MIN_DEPTH.dolphin);
      expect(Math.hypot(c.sx, c.sz)).toBeGreaterThan(Math.hypot(c.x, c.z) - 10);
    }
    expect(ok).toBeGreaterThan(20);
  });
  it("whales only come up in the deep blue", () => {
    const out: SeaCall = { x: 0, z: 0, sx: 0, sz: 0 };
    const shallow = atSea(0.9, 16); // the lagoon
    for (let i = 0; i < 20; i++) expect(pickSeaCall(shallow.x, shallow.z, "whale", i / 20, 0.5, out)).toBeNull();
  });
  it("angle helpers wrap", () => {
    expect(angleTo(3, -3)).toBeCloseTo(2 * Math.PI - 6, 5);
    expect(turnTowards(0, 1, 2, 0.1)).toBeCloseTo(0.2, 5);
    expect(turnTowards(0, 0.05, 2, 0.1)).toBeCloseTo(0.05, 5);
  });
});

describe("buildRideables", () => {
  it("finds, takes and releases a bike", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const b = spot("bike-plaza-1");
    const kid = V(b.x + 1, b.y!, b.z);
    w.update(0.03, 1, { kid, under: false, atSea: false, glow: 0 });
    const n = w.nearest(kid, 3)!;
    expect(n.id).toBe("bike-plaza-1");
    expect(n.kind).toBe("bike");
    expect(n.label).toContain("Bike");
    w.take(n.id);
    w.update(0.03, 1.03, { kid, under: false, atSea: false, glow: 0 });
    expect(w.nearest(kid, 3)?.id ?? null).not.toBe("bike-plaza-1");
    // ride it away and hop off
    const x = 30;
    const z = 30;
    const y = groundY(x, z);
    w.release("bike-plaza-1", x, y, z, 1.2);
    const kid2 = V(x + 1, y, z);
    w.update(0.03, 2, { kid: kid2, under: false, atSea: false, glow: 0 });
    const m = w.nearest(kid2, 3)!;
    expect(m.id).toBe("bike-plaza-1");
    expect(m.x).toBeCloseTo(x, 5);
    expect(m.y).toBeCloseTo(y, 5);
    w.dispose();
    expect(scene.children.length).toBe(0);
  });

  it("a unicorn trots over when the kid stands near its meadow, and stays on land", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const u = spot("unicorn-meadow-west");
    const kid = V(u.x + 12, groundY(u.x + 12, u.z), u.z);
    let t = 0;
    for (let i = 0; i < 400; i++) w.update(0.05, (t += 0.05), { kid, under: false, atSea: false, glow: 0 });
    const n = w.nearest(kid, 4.5);
    expect(n?.id).toBe("unicorn-meadow-west");
    expect(n!.y).toBeGreaterThan(WATER_Y);
    w.dispose();
  });

  it("a released manta swims off, then comes back to its reef spot later", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const m = spot("manta-wreck-2");
    const kid = V(m.x, m.y!, m.z);
    w.update(0.05, 0, { kid, under: true, atSea: true, glow: 0 });
    expect(w.nearest(kid, 6)?.id).toBe("manta-wreck-2");
    w.take("manta-wreck-2");
    w.release("manta-wreck-2", m.x, m.y!, m.z, 0);
    w.update(0.05, 0.05, { kid, under: true, atSea: true, glow: 0 });
    expect(w.nearest(kid, 6)?.id ?? null).not.toBe("manta-wreck-2");
    // the kid swims away; much later it's back home
    const far = V(0, 0, 0);
    let t = 0;
    for (let i = 0; i < 1000; i++) w.update(0.1, (t += 0.1), { kid: far, under: false, atSea: false, glow: 0 });
    w.update(0.1, (t += 0.1), { kid, under: true, atSea: true, glow: 0 });
    expect(w.nearest(kid, 6)?.id).toBe("manta-wreck-2");
    w.dispose();
  });

  it("out at sea a dolphin comes up 8-14 m away and waits; in the deep a whale comes too", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const k0 = atSea(0.9, 70);
    const kid = V(k0.x, WATER_Y - 0.6, k0.z);
    const seen = new Set<string>();
    let t = 0;
    for (let i = 0; i < 3000; i++) {
      w.update(0.1, (t += 0.1), { kid, under: false, atSea: true, glow: 0 });
      const n = w.nearest(kid, 15);
      if (n && (n.kind === "dolphin" || n.kind === "whale")) {
        const d = Math.hypot(n.x - kid.x, n.z - kid.z);
        expect(d).toBeGreaterThan(7);
        expect(d).toBeLessThan(15.5);
        seen.add(n.kind);
      }
    }
    expect(seen.has("dolphin")).toBe(true);
    expect(seen.has("whale")).toBe(true);
    // back on land: nobody from the sea waits for you
    const land = V(0, 0, 20);
    for (let i = 0; i < 200; i++) w.update(0.1, (t += 0.1), { kid: land, under: false, atSea: false, glow: 0 });
    for (let i = 0; i < 1; i++) {
      const n = w.nearest(kid, 30);
      expect(n?.kind === "dolphin" || n?.kind === "whale").toBe(false);
    }
    w.dispose();
  });

  it("stays within the draw-call budget wherever the kid is", () => {
    const scene = new THREE.Scene();
    const w = buildRideables(scene, {});
    const group = scene.getObjectByName("rideables")!;
    let t = 0;
    const probes = [V(0, 0, 0), V(spot("bike-plaza-1").x, 0, spot("bike-plaza-1").z), V(-78, 0, 30), atSea(0.9, 70) as unknown as THREE.Vector3];
    for (const p of probes) {
      const kid = V(p.x, (p as THREE.Vector3).y ?? 0, p.z);
      const sea = seaDepth(kid.x, kid.z) > 1;
      for (let i = 0; i < 600; i++) {
        w.update(0.1, (t += 0.1), { kid, under: false, atSea: sea, glow: 0.5 });
        expect(drawCalls(group)).toBeLessThanOrEqual(25);
      }
    }
    w.dispose();
  });
});
