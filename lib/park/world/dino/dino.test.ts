import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { NEAR_MESHES, buildDinoIsland, dinoMeshStats } from "./index";
import { brachiosaurus, irishElk, mammoth, raptor, sabreCat, stegosaurus, trex, triceratops, parasaurolophus, ankylosaurus, compy, woollyRhino, groundSloth, caveBear } from "./species";
import { BODY, DINO_M, TRUE_SIZE, trueK } from "./herd";
import { DINO_DECKS, DINO_ISLAND, DINO_SPECIES, DINO_SPOTS, DINO_SPOT_FACTS, DINO_TRAIL, DINO_ZONES, dinoGroundY, type DinoSpeciesId } from "../../registry/dinoIsland";

const v = (x: number, z: number) => new THREE.Vector3(x, dinoGroundY(x, z) ?? 3, z);

/** the worst draw calls / triangles seen with the kid standing at many places round the island, all day */
function worstCase(low: boolean) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 150, 430);
  const w = buildDinoIsland(scene, { lowQuality: low });
  const group = scene.getObjectByName("dino-island")!;
  let calls = 0;
  let tris = 0;
  let t = 0;
  const places = [...DINO_TRAIL.nodes.filter((_, i) => i % 3 === 0), ...DINO_ZONES.filter((_, i) => i % 2 === 0)];
  for (const [k, p] of places.entries()) {
    const h = (k * 5) % 24;
    for (let f = 0; f < 6; f++) w.update(1 / 20, (t += 1 / 20), { kid: v(p.x, p.z), glow: h > 18 || h < 6 ? 1 : 0, hour: h });
    const s = dinoMeshStats(group);
    calls = Math.max(calls, s.drawCalls);
    tris = Math.max(tris, s.triangles);
  }
  // (and from out at sea, and from the main island)
  for (const p of [v(DINO_ISLAND.x + 200, DINO_ISLAND.z), v(-150, 0)]) {
    for (let f = 0; f < 4; f++) w.update(1 / 20, (t += 1 / 20), { kid: p, glow: 0, hour: 12 });
    const s = dinoMeshStats(group);
    calls = Math.max(calls, s.drawCalls);
    tris = Math.max(tris, s.triangles);
  }
  w.dispose();
  return { calls, tris, left: scene.children.length };
}

describe("Dino Isle rendering", () => {
  it("stays within budget wherever the kid is: ≤ 24 draw calls, ≤ 230k triangles (≤ 120k low quality)", { timeout: 60_000 }, () => {
    const hi = worstCase(false);
    const lo = worstCase(true);
    // (for the report)
    console.log(`dino budget: standard ${hi.calls} calls / ${hi.tris} tris, low ${lo.calls} calls / ${lo.tris} tris`);
    expect(hi.calls).toBeLessThanOrEqual(24);
    expect(hi.tris).toBeLessThanOrEqual(230_000);
    expect(lo.calls).toBeLessThanOrEqual(24);
    expect(lo.tris).toBeLessThanOrEqual(120_000);
    expect(hi.left).toBe(0);
    expect(lo.left).toBe(0);
  });

  it("draws far herds as cheap far beasts, near ones with their full rigs (at most NEAR_MESHES species at once)", () => {
    const scene = new THREE.Scene();
    const w = buildDinoIsland(scene, {});
    const group = scene.getObjectByName("dino-island")!;
    const far = scene.getObjectByName("dino-far") as THREE.InstancedMesh;
    const fullMeshes = () => group.children.filter((o) => (o as THREE.InstancedMesh).isInstancedMesh && o.name.startsWith("dino-") && !o.name.startsWith("dino-trees") && o.name !== "dino-far" && o.visible && (o as THREE.InstancedMesh).count > 0);
    let t = 0;
    // from the main island's west beach: everything is far away
    for (let f = 0; f < 4; f++) w.update(1 / 20, (t += 1 / 20), { kid: v(-150, 0), glow: 0, hour: 11 });
    expect(far.count).toBeGreaterThan(30);
    expect(fullMeshes().every((m) => m.name === "dino-ptero" || m.name === "dino-plesio")).toBe(true);
    // in the middle of the island: the herds round about are full; never more than the cap
    for (const p of DINO_TRAIL.nodes) {
      w.update(1 / 20, (t += 1 / 20), { kid: v(p.x, p.z), glow: 0, hour: 11 });
      expect(fullMeshes().length, p.id).toBeLessThanOrEqual(NEAR_MESHES + 2);
    }
    w.dispose();
  });

  it("updates quickly (well under half a millisecond on average)", { timeout: 30_000 }, () => {
    const scene = new THREE.Scene();
    const w = buildDinoIsland(scene, {});
    const kid = v(DINO_TRAIL.nodes.find((n) => n.id === "ford-n")!.x, DINO_TRAIL.nodes.find((n) => n.id === "ford-n")!.z);
    let t = 0;
    // (warmed up the way the park is: it runs for minutes, so the JIT has optimised the hot paths)
    for (let f = 0; f < 1500; f++) w.update(1 / 30, (t += 1 / 30), { kid, glow: 0, hour: 10 });
    // (the quickest of several batches: the machine is busy running every other test in parallel)
    let ms = Infinity;
    for (let b = 0; b < 8; b++) {
      const t0 = performance.now();
      for (let f = 0; f < 60; f++) w.update(1 / 30, (t += 1 / 30), { kid, glow: 0, hour: 10 });
      ms = Math.min(ms, (performance.now() - t0) / 60);
    }
    console.log(`dino update: ${ms.toFixed(3)} ms / frame`);
    expect(ms).toBeLessThan(0.5);
    w.dispose();
  });

  it("the models match the true-size table and the bodies' capsules (measured from the geometry)", () => {
    const geos: Partial<Record<DinoSpeciesId, () => { geo: THREE.BufferGeometry }>> = {
      brachio: brachiosaurus,
      trike: triceratops,
      stego: stegosaurus,
      para: parasaurolophus,
      ankylo: ankylosaurus,
      trex,
      compy,
      raptor,
      mammoth,
      rhino: woollyRhino,
      sloth: groundSloth,
      sabre: sabreCat,
      bear: caveBear,
      elk: irishElk,
    };
    for (const [id, make] of Object.entries(geos) as [DinoSpeciesId, () => { geo: THREE.BufferGeometry }][]) {
      const g = make().geo;
      g.computeBoundingBox();
      const b = g.boundingBox!;
      const t = TRUE_SIZE[id];
      const m = t.dim === "h" ? b.max.y : t.dim === "l" ? b.max.z - b.min.z : b.max.x - b.min.x;
      if (id !== "sabre") expect(m, id).toBeCloseTo(t.model, 0);
      expect(m * trueK(id), id).toBeGreaterThan(t.real * DINO_M * (id === "sabre" ? 1 : 0.9));
      // (the spacing capsule: nose reach, tail reach, half-width)
      expect(b.max.z, `${id} nose`).toBeCloseTo(BODY[id][0], 1);
      expect(-b.min.z, `${id} tail`).toBeCloseTo(BODY[id][1], 1);
      expect(Math.max(b.max.x, -b.min.x), `${id} width`).toBeCloseTo(BODY[id][2], 1);
      g.dispose();
    }
  });

  it("hides itself far away, shows from the main island", () => {
    const scene = new THREE.Scene();
    const w = buildDinoIsland(scene, {});
    const group = scene.getObjectByName("dino-island")!;
    const far = new THREE.Vector3(285, 0, -300);
    const r = w.update(1 / 30, 1, { kid: far, glow: 0, hour: 10 });
    expect(r.spot).toBeNull();
    expect(r.roar).toBe(false);
    expect(group.visible).toBe(false);
    w.update(1 / 30, 1.1, { kid: new THREE.Vector3(-120, 0, 0), glow: 0, hour: 10 });
    expect(group.visible).toBe(true);
    w.dispose();
  });

  it("the T-rex roars when the kid comes to the Rex Lookout (roar true on that frame only)", { timeout: 30_000 }, () => {
    const scene = new THREE.Scene();
    const w = buildDinoIsland(scene, {});
    const d = DINO_DECKS.find((q) => q.id === "rex-look")!;
    const kid = new THREE.Vector3(d.ax, d.ya, d.az);
    let roars = 0;
    let t = 0;
    let streak = 0;
    let maxStreak = 0;
    for (let k = 0; k < 30 * 40; k++) {
      const r = w.update(1 / 30, (t += 1 / 30), { kid, glow: 0, hour: 11 });
      if (r.roar) {
        roars++;
        streak++;
      } else streak = 0;
      maxStreak = Math.max(maxStreak, streak);
    }
    expect(roars).toBeGreaterThanOrEqual(1);
    expect(roars).toBeLessThanOrEqual(3);
    expect(maxStreak).toBe(1);
    w.dispose();
  });

  it("keeps the kid out of the animals' bodies (it nudges the kid's position)", () => {
    const scene = new THREE.Scene();
    const w = buildDinoIsland(scene, {});
    let t = 0;
    const kid = v(DINO_ISLAND.x, DINO_ISLAND.z);
    for (let k = 0; k < 20; k++) w.update(1 / 30, (t += 1 / 30), { kid, glow: 0, hour: 11 });
    // walk the kid straight into the middle of a grazing triceratops
    const m = scene.getObjectByName("dino-trike") as THREE.InstancedMesh;
    const M = new THREE.Matrix4();
    let moved = false;
    for (let tries = 0; tries < 3 && !moved; tries++) {
      // (put the kid where the herd is, then nudge)
      const zone = DINO_ZONES.find((z) => z.id === "plains-mid")!;
      kid.set(zone.x, 3, zone.z);
      for (let k = 0; k < 4; k++) w.update(1 / 30, (t += 1 / 30), { kid, glow: 0, hour: 11 });
      if (m.count > 0) {
        m.getMatrixAt(0, M);
        const p = new THREE.Vector3().setFromMatrixPosition(M).add(new THREE.Vector3(DINO_ISLAND.x, 0, DINO_ISLAND.z));
        kid.set(p.x + 0.2, 3, p.z + 0.2);
        const before = kid.clone();
        w.update(1 / 30, (t += 1 / 30), { kid, glow: 0, hour: 11 });
        moved = kid.distanceTo(before) > 0.5;
      }
    }
    expect(moved).toBe(true);
    w.dispose();
  });

  it("discovers places and animals with real facts when the kid is close", { timeout: 30_000 }, () => {
    const scene = new THREE.Scene();
    const w = buildDinoIsland(scene, {});
    const gate = DINO_SPOTS.find((s) => s.kind === "gate")!;
    let t = 0;
    let spot = null as { id: string; name: string; text: string } | null;
    for (let k = 0; k < 10; k++) spot = w.update(1 / 30, (t += 1 / 30), { kid: v(gate.x, gate.z), glow: 0, hour: 10 }).spot;
    expect(spot).not.toBeNull();
    expect(spot!.text.length).toBeGreaterThan(10);
    expect([...Object.values(DINO_SPOT_FACTS), ...Object.values(DINO_SPECIES).map((s) => s.fact)]).toContain(spot!.text);
    const found = new Set<string>();
    const visits = [...DINO_SPOTS, ...DINO_ZONES.filter((z) => z.kind === "home")];
    for (const s of visits) {
      for (let k = 0; k < 6; k++) {
        const r = w.update(1 / 30, (t += 1 / 30), { kid: v(s.x, s.z), glow: 0, hour: 12 });
        if (r.spot) found.add(r.spot.id);
      }
    }
    expect(found.size).toBeGreaterThanOrEqual(16);
    expect([...found].filter((id) => id.startsWith("herd-")).length).toBeGreaterThanOrEqual(3);
    expect(w.update(1 / 30, (t += 1 / 30), { kid: new THREE.Vector3(DINO_ISLAND.x + 260, 0, DINO_ISLAND.z), glow: 0, hour: 12 }).spot).toBeNull();
    w.dispose();
  });

  it("is deterministic (two islands built and run the same way match)", () => {
    const run = () => {
      const scene = new THREE.Scene();
      const w = buildDinoIsland(scene, {});
      let t = 0;
      for (let k = 0; k < 90; k++) w.update(1 / 30, (t += 1 / 30), { kid: v(DINO_ISLAND.x + 20, DINO_ISLAND.z - 10), glow: 0.3, hour: 17 });
      const m = scene.getObjectByName("dino-far") as THREE.InstancedMesh;
      const out = Array.from(m.instanceMatrix.array.slice(0, 64));
      w.dispose();
      return out;
    };
    expect(run()).toEqual(run());
  });
});
