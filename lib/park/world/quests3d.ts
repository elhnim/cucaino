// Exploration in the world itself:
// - 30 Star Shards hidden in the most interesting places on the island — mountain peaks, the
//   floating islands (you'll need a flying mount), ancient ruins, the roots of the giant trees,
//   hidden coves and hilltops. Each glows and spins; walk (or fly) into it to collect it.
// - Sky Rings: a course of golden hoops weaving round the island in the sky. Fly through them in
//   order against the clock; the next ring glows brightest.
// Positions are deterministic; which shards a kid has found is kept by the app (per device).
import * as THREE from "three";
import { groundY, terrainGrid, TERRAIN_EXTENT, TERRAIN_N } from "../registry/terrain";
import { LANDS, PLACES } from "../registry/places";
import { coastR, nearTrail } from "../registry/island";
import type { FantasyPlan } from "./fantasy/placement";

export const SHARD_COUNT = 30;
export const RING_COUNT = 12;

export interface ShardSpot {
  id: number;
  x: number;
  y: number;
  z: number;
  /** where it is, for the hint text */
  where: "peak" | "sky island" | "ruins" | "ancient tree" | "cove" | "hilltop" | "crystals";
}

/** The 30 shard spots (deterministic for a given fantasy plan). */
export function shardSpots(plan: FantasyPlan): ShardSpot[] {
  const out: ShardSpot[] = [];
  const push = (x: number, y: number, z: number, where: ShardSpot["where"]) => {
    if (out.length >= SHARD_COUNT) return;
    if (out.some((s) => Math.hypot(s.x - x, s.z - z) < 7 && Math.abs(s.y - y) < 6)) return;
    if (PLACES.some((p) => Math.hypot(p.x - x, p.z - z) < p.radius + 3)) return;
    out.push({ id: out.length, x, y, z, where });
  };
  // floating islands first (the big "you need to fly" goals)
  for (const isl of plan.islands) push(isl.x, isl.y + 3, isl.z, "sky island");
  // mountain peaks and hilltops: local maxima of the terrain
  const g = terrainGrid();
  const N = TERRAIN_N;
  const cell = (TERRAIN_EXTENT * 2) / (N - 1);
  const maxima: { x: number; z: number; h: number }[] = [];
  for (let j = 6; j < N - 6; j += 3)
    for (let i = 6; i < N - 6; i += 3) {
      const h = g[j * N + i];
      if (h < 5) continue;
      let top = true;
      for (let dj = -6; dj <= 6 && top; dj += 2) for (let di = -6; di <= 6; di += 2) if ((di || dj) && g[(j + dj) * N + i + di] > h) top = false;
      if (top) maxima.push({ x: -TERRAIN_EXTENT + i * cell, z: -TERRAIN_EXTENT + j * cell, h });
    }
  maxima.sort((a, b) => b.h - a.h);
  for (const m of maxima.slice(0, 7)) push(m.x, m.h + 1.6, m.z, m.h > 16 ? "peak" : "hilltop");
  // ruins, the giant trees and crystal groves
  for (const r of plan.ruins) push(r.x + 1.5, r.y + 1.4, r.z + 1.5, "ruins");
  for (const gi of plan.giants) push(gi.x + 5, groundY(gi.x + 5, gi.z + 3) + 1.4, gi.z + 3, "ancient tree");
  for (const c of plan.crystals.filter((_, i) => i % 3 === 0)) push(c.x + 1.5, groundY(c.x + 1.5, c.z) + 1.4, c.z, "crystals");
  // hidden coves along the beach
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.35;
    const r = coastR(a) - 4;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (nearTrail(x, z, 4)) continue;
    push(x, groundY(x, z) + 1.4, z, "cove");
  }
  // top up with more hilltops if needed
  for (const m of maxima.slice(7)) push(m.x, m.h + 1.6, m.z, "hilltop");
  // last resort: quiet meadow corners inside lands' outskirts
  for (let k = 0; out.length < SHARD_COUNT && k < 200; k++) {
    const l = LANDS[k % LANDS.length];
    const a = k * 2.4;
    const x = l.x + Math.sin(a) * (l.radius + 8);
    const z = l.z + Math.cos(a) * (l.radius + 8);
    push(x, groundY(x, z) + 1.4, z, "hilltop");
  }
  return out;
}

/** The Sky Rings course: a weaving loop round the island, high up. */
export function ringCourse(): { x: number; y: number; z: number; heading: number }[] {
  return Array.from({ length: RING_COUNT }, (_, i) => {
    const a = (i / RING_COUNT) * Math.PI * 2;
    const r = 88 + Math.sin(a * 3) * 18;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    const y = Math.max(groundY(x, z) + 12, 22 + Math.sin(a * 2 + 1) * 8);
    // hoops face along the course
    return { x, y, z, heading: a + Math.PI / 2 };
  });
}

export interface Quests3D {
  /** mark shards already found (they don't appear) */
  setFound(ids: number[]): void;
  /** returns a collected shard id this frame, and ring progress events */
  update(dt: number, t: number, kid: THREE.Vector3, flying: boolean, glow: number): { shard: number | null; ring: { passed: number; lap?: number } | null };
  spots: ShardSpot[];
  dispose(): void;
}

export function buildQuests3D(scene: THREE.Scene, plan: FantasyPlan): Quests3D {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d);
  const spots = shardSpots(plan);

  // ── shards: a faceted star gem, a soft beam of light above it ──
  const gemGeo = track(new THREE.OctahedronGeometry(0.7, 0));
  gemGeo.scale(0.75, 1.25, 0.75);
  const gemMat = track(new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffe27a").multiplyScalar(2.2) }));
  const gems = new THREE.InstancedMesh(gemGeo, gemMat, spots.length);
  gems.frustumCulled = false;
  const beamGeo = track(new THREE.CylinderGeometry(0.35, 0.9, 16, 10, 1, true));
  beamGeo.translate(0, 8, 0);
  const beamMat = track(new THREE.MeshBasicMaterial({ color: "#ffe9a8", transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, spots.length);
  beams.frustumCulled = false;
  scene.add(gems, beams);
  const found = new Set<number>();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3(0, 0, 0);

  // ── sky rings ──
  const course = ringCourse();
  const ringGeo = track(new THREE.TorusGeometry(4.2, 0.28, 10, 36));
  const ringMats = course.map(() => track(new THREE.MeshBasicMaterial({ color: "#ffd36b", transparent: true, opacity: 0.55 })));
  const rings = course.map((c, i) => {
    const r = new THREE.Mesh(ringGeo, ringMats[i]);
    r.position.set(c.x, c.y, c.z);
    r.rotation.y = c.heading;
    scene.add(r);
    return r;
  });
  let nextRing = 0;
  let lapStart = -1;

  const gold = new THREE.Color("#ffd36b");
  const next = new THREE.Color("#5ef2ff");

  return {
    spots,
    setFound(ids) {
      found.clear();
      for (const id of ids) found.add(id);
    },
    update(dt, t, kid, flying, glow) {
      let got: number | null = null;
      spots.forEach((s, i) => {
        if (found.has(s.id)) {
          m.compose(v.set(s.x, -500, s.z), q.identity(), zero);
          gems.setMatrixAt(i, m);
          beams.setMatrixAt(i, m);
          return;
        }
        const bob = Math.sin(t * 1.8 + i) * 0.3;
        m.compose(v.set(s.x, s.y + bob, s.z), q.setFromEuler(e.set(0, t * 1.4 + i, 0)), one);
        gems.setMatrixAt(i, m);
        m.compose(v.set(s.x, s.y - 0.6, s.z), q.identity(), one);
        beams.setMatrixAt(i, m);
        if (got === null && Math.hypot(kid.x - s.x, kid.z - s.z) < 2.6 && Math.abs(kid.y + 1 - s.y) < 3.2) {
          got = s.id;
          found.add(s.id);
        }
      });
      gems.instanceMatrix.needsUpdate = true;
      beams.instanceMatrix.needsUpdate = true;
      beamMat.opacity = 0.12 + glow * 0.14;

      // rings: only a flying kid can take them; the next one glows cyan and pulses
      let ring: { passed: number; lap?: number } | null = null;
      rings.forEach((r, i) => {
        const isNext = i === nextRing;
        ringMats[i].color.copy(isNext ? next : gold).multiplyScalar(isNext ? 1.6 + Math.sin(t * 6) * 0.4 : 1.1);
        ringMats[i].opacity = flying ? (isNext ? 0.95 : 0.55) : 0.3;
        r.scale.setScalar(isNext && flying ? 1 + Math.sin(t * 4) * 0.05 : 1);
      });
      if (flying) {
        const c = course[nextRing];
        const d = Math.hypot(kid.x - c.x, kid.y + 1 - c.y, kid.z - c.z);
        if (d < 5.2) {
          if (nextRing === 0) lapStart = t;
          nextRing++;
          if (nextRing >= RING_COUNT) {
            ring = { passed: RING_COUNT, lap: lapStart >= 0 ? t - lapStart : undefined };
            nextRing = 0;
            lapStart = -1;
          } else ring = { passed: nextRing };
        }
      }
      return { shard: got, ring };
    },
    dispose() {
      scene.remove(gems, beams, ...rings);
      for (const d of disposables) d.dispose();
    },
  };
}
