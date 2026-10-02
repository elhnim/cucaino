// The Wildlands' wildlife, streamed in round the kid like its trees and rocks (lib/park/world/
// fantasy/wilds.ts): herds of deer, zebras, giraffes, elephants and kangaroos out on the plains, a
// few mountain goats on the Great Ridge's lower slopes, ducks on the Great Lake, parrots flitting
// through the rainforest canopy and a couple of eagles soaring over the ridge. Reuses the park's
// own species meshes, rig and true-size table (lib/park/world/fauna) wherever a Wildlands animal
// shares a body plan with a park one; the parrot/eagle is new (./birdGeometry.ts). One draw call
// per mesh (7 total), nothing baked up front beyond the small species table.
import * as THREE from "three";
import { buildDeer, buildDuck, buildGoat, buildHorse, trisOf } from "../fauna/geometry";
import { rigDepthMaterial, rigMaterial } from "../fauna/rig";
import { buildRoo, buildSafari } from "../fauna/species";
import { buildFlier } from "./birdGeometry";
import { BIRD_CELL, HERD_CELL, birdCell, duckRafts, eagleAnchors, herdCell } from "./placement";
import { pushFromAnimal, stepBirdFlock, stepDuckRaft, stepEagle, stepLandHerd, type KidSense, setWildTrunks } from "./sim";
import { WILD_MESH_NAMES, WILD_SPECIES_DEFS, WM_DEER, WM_GOAT, WM_HORSE, WM_ROO, WM_SAFARI, type WAnimal, type WHerd } from "./types";

export interface Wildlife {
  update(dt: number, t: number, o: { kid: THREE.Vector3; glow: number; hour: number }): void;
  /** keep the kid out of a large animal's body (an approximate circle: see sim.ts pushFromAnimal) */
  pushKid(pos: { x: number; y: number; z: number }, kidR: number, kidY?: number): boolean;
  stats(): WildlifeStats;
  dispose(): void;
}

export interface WildlifeStats {
  /** every animal known right now (drawn or not: the active herds, the ducks, the birds, the eagles) */
  animals: number;
  /** drawn this frame */
  live: number;
  calls: number;
  triangles: number;
  cells: number;
  /** average update() cost (ms), over the last 120 frames */
  updateMs: number;
}

/** the squares drawn (and simulated) round the kid, and how many of each species at most
 *  (mesh order: deer, zebras, safari, roos, goats, ducks, birds) */
export const WILD_VIEW = {
  std: { r: 260, caps: [10, 8, 6, 8, 8, 14, 10] },
  low: { r: 190, caps: [5, 4, 3, 4, 4, 7, 5] },
};
/** only this many land/bird squares are kept cached (plenty for the view radius above) */
const KEEP_CELLS = 400;

function ckey(ci: number, cj: number): number {
  return (cj + 8192) * 16384 + (ci + 8192);
}

export function buildWildlife(scene: THREE.Scene, opts: { lowQuality?: boolean; trunkAt?: (x: number, z: number, r: number) => { x: number; z: number; r: number } | null } = {}): Wildlife {
  const low = !!opts.lowQuality;
  setWildTrunks(opts.trunkAt ?? null);
  const V = low ? WILD_VIEW.low : WILD_VIEW.std;

  const geos: THREE.BufferGeometry[] = [buildDeer(), buildHorse(), buildSafari(), buildRoo(), buildGoat(), buildDuck(), buildFlier()];
  const U = { uEye: { value: 0 } };
  const mat = rigMaterial(U);
  const depthMat = rigDepthMaterial();
  const SHADOW = new Set([WM_DEER, WM_HORSE, WM_SAFARI, WM_ROO, WM_GOAT]);

  interface MeshRig {
    im: THREE.InstancedMesh;
    a: THREE.InstancedBufferAttribute;
    b: THREE.InstancedBufferAttribute;
    c: THREE.InstancedBufferAttribute;
    cap: number;
    n: number;
  }
  const meshes: MeshRig[] = geos.map((geo, m) => {
    const cap = V.caps[m];
    const mk = () => {
      const at = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      at.setUsage(THREE.DynamicDrawUsage);
      return at;
    };
    const a = mk();
    const b = mk();
    const c = mk();
    geo.setAttribute("iA", a);
    geo.setAttribute("iB", b);
    geo.setAttribute("iC", c);
    const im = new THREE.InstancedMesh(geo, mat, cap);
    im.name = `wildlife-${WILD_MESH_NAMES[m]}`;
    im.count = 0;
    im.customDepthMaterial = depthMat;
    im.castShadow = !low && SHADOW.has(m);
    im.receiveShadow = !low;
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.setColorAt(0, new THREE.Color());
    scene.add(im);
    return { im, a, b, c, cap, n: 0 };
  });

  // ── the land herds and the rainforest's parrot flocks: cached per square, lazily worked out ──
  const herdCells = new Map<number, WHerd[]>();
  const birdCells = new Map<number, WHerd[]>();
  const herdAt = (ci: number, cj: number) => {
    const k = ckey(ci, cj);
    let c = herdCells.get(k);
    if (!c) {
      c = herdCell(ci, cj);
      if (herdCells.size > KEEP_CELLS) herdCells.delete(herdCells.keys().next().value as number);
      herdCells.set(k, c);
    }
    return c;
  };
  const birdAt = (ci: number, cj: number) => {
    const k = ckey(ci, cj);
    let c = birdCells.get(k);
    if (!c) {
      c = birdCell(ci, cj);
      if (birdCells.size > KEEP_CELLS) birdCells.delete(birdCells.keys().next().value as number);
      birdCells.set(k, c);
    }
    return c;
  };

  const ducks = duckRafts();
  const eagles = eagleAnchors();
  let activeHerds: WHerd[] = [];
  let activeBirds: WHerd[] = [];
  let lastHCi = NaN;
  let lastHCj = NaN;
  let lastBCi = NaN;
  let lastBCj = NaN;

  function refillHerds(fx: number, fz: number) {
    const R = Math.ceil(V.r / HERD_CELL) + 1;
    const ci0 = Math.floor(fx / HERD_CELL);
    const cj0 = Math.floor(fz / HERD_CELL);
    const out: WHerd[] = [];
    for (let dj = -R; dj <= R; dj++)
      for (let di = -R; di <= R; di++) for (const h of herdAt(ci0 + di, cj0 + dj)) if (Math.hypot(h.hx - fx, h.hz - fz) < V.r + h.hr) out.push(h);
    activeHerds = out;
  }
  function refillBirds(fx: number, fz: number) {
    const R = Math.ceil((V.r * 0.8) / BIRD_CELL) + 1;
    const ci0 = Math.floor(fx / BIRD_CELL);
    const cj0 = Math.floor(fz / BIRD_CELL);
    const out: WHerd[] = [];
    for (let dj = -R; dj <= R; dj++)
      for (let di = -R; di <= R; di++) for (const h of birdAt(ci0 + di, cj0 + dj)) if (Math.hypot(h.hx - fx, h.hz - fz) < V.r * 0.85) out.push(h);
    activeBirds = out;
  }

  // the kid, smoothed (speed + heading), as lib/park/world/fauna/index.ts tracks it
  const kid: KidSense = { x: 0, z: 0, speed: 0, dx: 0, dz: 1 };
  let kidInit = false;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const c3 = new THREE.Color();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  function writeInstance(mesh: MeshRig, a: WAnimal, variant: number) {
    if (mesh.n >= mesh.cap) {
      a.live = false;
      return;
    }
    const k = mesh.n;
    const sc = a.scale;
    v.set(a.x, a.y, a.z);
    e.set(0, a.yaw, 0, "YXZ");
    m4.compose(v, q.setFromEuler(e), s3.set(sc, sc, sc));
    mesh.im.setMatrixAt(k, m4);
    mesh.im.setColorAt(k, c3.set(a.coat));
    const A = mesh.a.array as Float32Array;
    const B = mesh.b.array as Float32Array;
    const C = mesh.c.array as Float32Array;
    const j = k * 4;
    A[j] = a.phase;
    A[j + 1] = a.stride;
    A[j + 2] = a.headYaw;
    A[j + 3] = a.headPitch;
    B[j] = a.ear;
    B[j + 1] = a.tail;
    B[j + 2] = 0;
    B[j + 3] = variant;
    C[j] = a.wing;
    C[j + 1] = a.tailLift;
    C[j + 2] = a.tuck;
    C[j + 3] = a.bound;
    mesh.n++;
    a.live = true;
  }

  function writeIfNear(h: WHerd, px: number, pz: number, r2: number) {
    const def = WILD_SPECIES_DEFS[h.species];
    const mesh = meshes[def.mesh];
    for (const a of h.members) {
      const d2 = (a.x - px) * (a.x - px) + (a.z - pz) * (a.z - pz);
      if (d2 > r2) {
        a.live = false;
        continue;
      }
      writeInstance(mesh, a, def.variant);
    }
  }

  let sumMs = 0;
  let frames = 0;
  let lastUpdateMs = 0;
  let lastCells = 0;
  const api: Wildlife = {
    update(dtIn, t, o) {
      const dt = Math.min(Math.max(dtIn, 0), 0.1);
      const tu = typeof performance !== "undefined" ? performance.now() : 0;
      const p = o.kid;
      if (!kidInit) {
        kid.x = p.x;
        kid.z = p.z;
        kidInit = true;
      }
      const dx = p.x - kid.x;
      const dz = p.z - kid.z;
      const moved = Math.hypot(dx, dz);
      const inst = moved > 15 ? 0 : moved / Math.max(dt, 1e-4);
      kid.speed += (inst - kid.speed) * Math.min(1, dt * 8);
      if (moved > 1e-4 && moved < 15) {
        const k = Math.min(1, dt * 5);
        kid.dx += (dx / moved - kid.dx) * k;
        kid.dz += (dz / moved - kid.dz) * k;
        const l = Math.hypot(kid.dx, kid.dz) || 1;
        kid.dx /= l;
        kid.dz /= l;
      }
      kid.x = p.x;
      kid.z = p.z;

      const hci = Math.floor(p.x / (HERD_CELL / 2));
      const hcj = Math.floor(p.z / (HERD_CELL / 2));
      if (hci !== lastHCi || hcj !== lastHCj) {
        lastHCi = hci;
        lastHCj = hcj;
        refillHerds(p.x, p.z);
      }
      const bci = Math.floor(p.x / (BIRD_CELL / 2));
      const bcj = Math.floor(p.z / (BIRD_CELL / 2));
      if (bci !== lastBCi || bcj !== lastBCj) {
        lastBCi = bci;
        lastBCj = bcj;
        refillBirds(p.x, p.z);
      }

      for (const h of activeHerds) stepLandHerd(h, dt, t, kid, o.hour);
      for (const h of ducks) stepDuckRaft(h, dt, t);
      for (const h of activeBirds) stepBirdFlock(h, dt, t);
      for (const h of eagles) stepEagle(h, dt, t);

      for (const m of meshes) m.n = 0;
      const r2 = V.r * V.r;
      // (the eagles first: there are only two of them, and they should never be crowded out of
      // their shared mesh by a big flock of parrots)
      for (const h of eagles) writeIfNear(h, p.x, p.z, Infinity);
      for (const h of activeHerds) writeIfNear(h, p.x, p.z, r2);
      for (const h of ducks) writeIfNear(h, p.x, p.z, r2);
      for (const h of activeBirds) writeIfNear(h, p.x, p.z, r2);

      for (const m of meshes) {
        for (let k = m.n; k < m.cap; k++) m.im.setMatrixAt(k, ZERO);
        m.im.count = m.cap;
        m.im.instanceMatrix.needsUpdate = true;
        if (m.im.instanceColor) m.im.instanceColor.needsUpdate = true;
        m.a.needsUpdate = true;
        m.b.needsUpdate = true;
        m.c.needsUpdate = true;
      }
      lastCells = herdCells.size + birdCells.size;
      if (tu) {
        lastUpdateMs = performance.now() - tu;
        sumMs += lastUpdateMs;
        if (++frames >= 120) {
          sumMs = sumMs / frames;
          frames = 1;
        }
      }
    },
    pushKid(pos, kidR, py) {
      const savedY = pos.y;
      if (py !== undefined) pos.y = py;
      let pushed = false;
      for (const h of activeHerds) {
        const def = WILD_SPECIES_DEFS[h.species];
        if (!def.giant && def.body < 0.65) continue; // (small stuff doesn't need a body block)
        for (const a of h.members) {
          if (!a.live) continue;
          if (pushFromAnimal(pos, kidR, a.x, a.z, a.y, def.body * (a.scale / def.scale))) pushed = true;
        }
      }
      pos.y = savedY;
      return pushed;
    },
    stats() {
      const triangles = meshes.reduce((s, m) => s + m.im.count * trisOf(m.im.geometry as THREE.BufferGeometry), 0);
      const animals = activeHerds.reduce((s, h) => s + h.members.length, 0) + activeBirds.reduce((s, h) => s + h.members.length, 0) + ducks.reduce((s, h) => s + h.members.length, 0) + eagles.length;
      return { animals, live: meshes.reduce((s, m) => s + m.n, 0), calls: meshes.filter((m) => m.n > 0).length, triangles, cells: lastCells, updateMs: Math.round((sumMs || lastUpdateMs) * 1000) / 1000 };
    },
    dispose() {
      for (const m of meshes) {
        scene.remove(m.im);
        m.im.geometry.dispose();
        m.im.dispose();
      }
      mat.dispose();
      depthMat.dispose();
      herdCells.clear();
      birdCells.clear();
    },
  };
  return api;
}
