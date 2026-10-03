// The Wildlands' trees and rocks, streamed round the kid. The island beyond the park is ~100x the
// park's area, so nothing out there is placed up front: the land is cut into WILD_CELL squares,
// and the first time a square comes near, its trees and boulders are worked out from a seed of its
// own (same square, same trees, every time). Big forests and smaller groves come from broad noise;
// pines take the high and steep ground, there are no trees on the snow, the beaches or the cliffs,
// and boulders lie mostly on the slopes. Only the squares round the kid are drawn (thinning out in
// the distance), as a handful of instanced meshes of the storybook's chunky low-poly trees, so it
// stays light however far you roam. trunkAt() lets the kid bump into trunks and boulders.
import * as THREE from "three";
import { buildForestTree } from "../storybook/geometry";
import { KIND_PINE, KIND_SPIRE, LEAF_GREENS, LEAF_YELLOWS, PINE_GREENS, TREE_KINDS } from "../storybook/plan";
import { buildRockGeometry } from "./stones";
import { fbm2, noise2, rngOf } from "./noise";
import { groundYFar } from "../../registry/terrain";
import { ISLAND_R, seaDist } from "../../registry/island";
import { wildRainforestK, wildWaterSdf } from "../../registry/wildWater";
import { nearRail, stationAt } from "../../registry/railway";
import { inSettlement } from "../../registry/settlements";
import { nearCartRoad } from "../../registry/cartRoad";
import { nearFootpath } from "../../registry/footpaths";
import { buildClump, buildJungleTree } from "../jungle/geometry";
import { TREE_DIMS, T_CANOPY, T_FERN, T_GIANT, T_PALM } from "../jungle/plan";
import type { JungleCut } from "../jungle/cutaway";

/** a square of the Wildlands (world units) */
export const WILD_CELL = 64;
/** the trees and rocks start this far from the plaza (the park has its own) */
export const WILD_FROM = ISLAND_R + 28;
const ROCK = TREE_KINDS;
/** the rainforest's own kinds: its four tree types (../jungle: giant, canopy, palm, tree fern) and undergrowth */
const J0 = ROCK + 1;
const CLUMP = J0 + 4;
const isJungle = (k: number) => k >= J0 && k < CLUMP;

export interface WildItem {
  /** 0..TREE_KINDS-1 a storybook tree kind, TREE_KINDS = a boulder, then the rainforest's four
   *  tree types and its undergrowth clumps */
  kind: number;
  x: number;
  y: number;
  z: number;
  s: number;
  sy: number;
  rot: number;
  /** colour index (trees: into LEAF_GREENS / +100 LEAF_YELLOWS / +200 PINE_GREENS) */
  hue: number;
  /** 0..1 — which ones are kept when the far squares are thinned */
  keep: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const isPineKind = (k: number) => k === KIND_PINE || k === KIND_SPIRE;

/** Work out one square's trees and boulders (deterministic, pure). */
export function wildCell(ci: number, cj: number): WildItem[] {
  const out: WildItem[] = [];
  const x0 = ci * WILD_CELL;
  const z0 = cj * WILD_CELL;
  // (squares wholly inside the park, or wholly out at sea: nothing)
  const cx = x0 + WILD_CELL / 2;
  const cz = z0 + WILD_CELL / 2;
  if (Math.hypot(cx, cz) < WILD_FROM - WILD_CELL * 0.72) return out;
  if (seaDist(cx, cz) > WILD_CELL * 0.72) return out;
  const r = rngOf(((ci * 73856093) ^ (cj * 19349663) ^ 0x5bd1e995) >>> 0);
  const slopeAt = (x: number, z: number) => {
    const dx = groundYFar(x + 2, z) - groundYFar(x - 2, z);
    const dz = groundYFar(x, z + 2) - groundYFar(x, z - 2);
    return Math.min(1, Math.hypot(dx, dz) / 4 / 1.4);
  };
  // (and off the railway and its platforms)
  const ok = (x: number, z: number) => Math.hypot(x, z) >= WILD_FROM && seaDist(x, z) < -7 && wildWaterSdf(x, z) > 4 && !nearRail(x, z, 4) && !stationAt(x, z, 8) && !inSettlement(x, z, 6) && !nearCartRoad(x, z, 3) && !nearFootpath(x, z, 3);
  // the rainforest round the Great Falls and along the Wild River: giants, canopy trees, palms and
  // tree ferns over thick undergrowth (true size: you walk under it)
  if (wildRainforestK(cx, cz) > 0.02 || wildRainforestK(x0, z0) > 0.02 || wildRainforestK(x0 + WILD_CELL, z0 + WILD_CELL) > 0.02) {
    for (let k = 0; k < 90; k++) {
      const x = x0 + r() * WILD_CELL;
      const z = z0 + r() * WILD_CELL;
      const K = wildRainforestK(x, z);
      if (K <= 0 || r() > K * 0.9 || !ok(x, z)) continue;
      const h = groundYFar(x, z);
      if (h < 0.5) continue;
      if (slopeAt(x, z) > 0.6) continue;
      const u = r();
      const type = u < 0.1 ? T_GIANT : u < 0.45 ? T_CANOPY : u < 0.75 ? T_PALM : T_FERN;
      const s = 0.8 + r() * 0.35;
      const room = TREE_DIMS[type].crownR * s * (type === T_GIANT ? 0.85 : 0.7);
      if (out.some((t) => isJungle(t.kind) && Math.hypot(t.x - x, t.z - z) < Math.max(room, TREE_DIMS[t.kind - J0].crownR * t.s * 0.5))) continue;
      out.push({ kind: J0 + type, x, y: h, z, s, sy: 0.9 + r() * 0.2, rot: r() * Math.PI * 2, hue: Math.floor(r() * 8), keep: r() });
    }
    for (let k = 0; k < 60; k++) {
      const x = x0 + r() * WILD_CELL;
      const z = z0 + r() * WILD_CELL;
      const K = wildRainforestK(x, z);
      if (K <= 0 || r() > K || !ok(x, z)) continue;
      if (out.some((t) => isJungle(t.kind) && Math.hypot(t.x - x, t.z - z) < TREE_DIMS[t.kind - J0].trunkR * t.s + 1.2)) continue;
      out.push({ kind: CLUMP, x, y: groundYFar(x, z), z, s: 0.8 + r() * 0.9, sy: 0.8 + r() * 0.5, rot: r() * Math.PI * 2, hue: Math.floor(r() * 8), keep: r() });
    }
  }
  // trees: big forests and smaller groves, a few loners on the open plains
  for (let k = 0; k < 70; k++) {
    const x = x0 + r() * WILD_CELL;
    const z = z0 + r() * WILD_CELL;
    const forest = smooth(0.5, 0.68, fbm2(x / 300 + 5.3, z / 300 - 2.1, 3, 41));
    const grove = smooth(0.6, 0.76, fbm2(x / 70 - 3.7, z / 70 + 8.2, 3, 42));
    const dense = Math.max(forest * 0.95, grove * 0.7) + 0.035;
    if (r() > dense || !ok(x, z)) continue;
    // (the rainforest has its own trees)
    if (wildRainforestK(x, z) > 0.25) continue;
    const h = groundYFar(x, z);
    if (h < 0.6 || h > 62) continue;
    const slope = slopeAt(x, z);
    if (slope > 0.55) continue;
    const sp = noise2(x / 90 + 2.2, z / 90 - 6.1, 43);
    const kind = h > 34 || slope > 0.3 ? (r() < 0.5 ? KIND_PINE : KIND_SPIRE) : sp < 0.3 ? KIND_PINE : sp < 0.5 ? 0 : sp < 0.7 ? 1 : 2;
    const s = 0.95 + r() * 0.6;
    // (room for the canopy: pines are slimmer)
    const room = (isPineKind(kind) ? 2.3 : 3.2) * s;
    if (out.some((t) => t.kind !== ROCK && Math.hypot(t.x - x, t.z - z) < room)) continue;
    const autumn = r() < 0.08;
    const hue = isPineKind(kind) ? 200 + Math.floor(r() * PINE_GREENS.length) : autumn ? 100 + Math.floor(r() * LEAF_YELLOWS.length) : Math.floor(r() * LEAF_GREENS.length);
    out.push({ kind, x, y: h, z, s, sy: 0.9 + r() * 0.25, rot: r() * Math.PI * 2, hue, keep: r() });
  }
  // boulders: mostly on the slopes and up in the mountains
  for (let k = 0; k < 14; k++) {
    const x = x0 + r() * WILD_CELL;
    const z = z0 + r() * WILD_CELL;
    if (!ok(x, z)) continue;
    const slope = slopeAt(x, z);
    if (r() > 0.05 + slope * 0.7) continue;
    const h = groundYFar(x, z);
    if (h < 0.4) continue;
    const s = 0.7 + r() * r() * 2.6;
    if (out.some((t) => Math.hypot(t.x - x, t.z - z) < s * 1.4 + (t.kind === ROCK ? t.s * 1.4 : 1.2))) continue;
    out.push({ kind: ROCK, x, y: h - s * 0.25, z, s, sy: 0.55 + r() * 0.4, rot: r() * Math.PI * 2, hue: 0, keep: r() });
  }
  return out;
}

export interface Wilds {
  meshes: THREE.InstancedMesh[];
  /** stream the squares round `focus` (cheap when nothing changed) */
  update(focus: { x: number; y?: number; z: number }): void;
  /** a trunk or boulder within `r` of (x, z)? returns the nearest one's centre and radius */
  trunkAt(x: number, z: number, r: number): { x: number; z: number; r: number } | null;
  stats(): { trees: number; rocks: number; triangles: number; cells: number };
  dispose(): void;
}

/** the squares drawn round the kid, and how many instances at most */
export const WILD_VIEW = { std: { r: 300, trees: 2600, rocks: 700 }, low: { r: 210, trees: 1100, rocks: 320 } };
/** far squares keep only some of their trees (the canopy still reads from afar) */
const THIN_FROM = 170;

/** the rainforest's trees in full within this of the kid (beyond: chunky stand-ins), its
 *  undergrowth within RF_CLUMP_R; at most this many of each */
const RF = { std: { near: 110, caps: [16, 70, 80, 70], clumps: 420 }, low: { near: 80, caps: [8, 36, 40, 36], clumps: 200 } };
const RF_CLUMP_R = 60;
const RF_LEAF = ["#3f8f3a", "#2f7a3e", "#4f9e32", "#2a6e48", "#5aa83a", "#367f2c", "#1f6a44", "#64b03e"].map((h) => new THREE.Color(h));

/**
 * @param material the storybook trees' and the rocks' (wind-swayed) material
 * @param opts.jungleMaterial the rainforest's material (with `cut`: see-through round the kid and
 *   the camera, like the park's rainforest), default `material`
 */
export function buildWilds(material: THREE.Material, opts: { lowQuality?: boolean; jungleMaterial?: THREE.Material; cut?: JungleCut } = {}): Wilds {
  const low = !!opts.lowQuality;
  const V = low ? WILD_VIEW.low : WILD_VIEW.std;
  const geos = Array.from({ length: TREE_KINDS }, (_, k) => buildForestTree(k, low));
  const rockGeo = buildRockGeometry(low);
  const triOf = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  const meshes: THREE.InstancedMesh[] = [];
  const caps = geos.map(() => Math.ceil(V.trees / 2));
  const make = (g: THREE.BufferGeometry, cap: number, name: string) => {
    const m = new THREE.InstancedMesh(g, material, cap);
    m.count = 0;
    m.name = name;
    m.castShadow = false;
    m.receiveShadow = !low;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, new THREE.Color());
    meshes.push(m);
    return m;
  };
  const treeMeshes = geos.map((g, k) => make(g, caps[k], `wild-trees-${k}`));
  const rocks = make(rockGeo, V.rocks, "wild-rocks");
  // the rainforest: its four tree types and the undergrowth, near the kid
  const R0 = low ? RF.low : RF.std;
  const jGeos = [T_GIANT, T_CANOPY, T_PALM, T_FERN].map((t) => buildJungleTree(t, low));
  const clumpGeo = buildClump(low);
  const jMat = opts.jungleMaterial ?? material;
  const grabCam = (_r: THREE.WebGLRenderer, _s: THREE.Scene, cam: THREE.Camera) => void opts.cut?.uJCam.value.setFromMatrixPosition(cam.matrixWorld);
  const makeJ = (g: THREE.BufferGeometry, cap: number, name: string) => {
    const m = make(g, cap, name);
    m.material = jMat;
    m.onBeforeRender = grabCam;
    return m;
  };
  const jMeshes = jGeos.map((g, k) => makeJ(g, R0.caps[k], `wild-rainforest-${k}`));
  const clumps = makeJ(clumpGeo, R0.clumps, "wild-undergrowth");

  const cells = new Map<number, WildItem[]>();
  const ckey = (ci: number, cj: number) => (cj + 2048) * 4096 + (ci + 2048);
  const cellOf = (ci: number, cj: number) => {
    const k = ckey(ci, cj);
    let c = cells.get(k);
    if (!c) {
      c = wildCell(ci, cj);
      if (cells.size > 900) cells.delete(cells.keys().next().value as number);
      cells.set(k, c);
    }
    return c;
  };

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const c = new THREE.Color();
  const hueColor = (h: number, out: THREE.Color) => out.set(h >= 200 ? PINE_GREENS[h - 200] : h >= 100 ? LEAF_YELLOWS[h - 100] : LEAF_GREENS[h]);
  const rockCol = new THREE.Color("#c9c2b8");
  let lastCi = NaN;
  let lastCj = NaN;
  let pending = false;
  let shownCells = 0;

  function refill(fx: number, fz: number) {
    const ci0 = Math.floor(fx / WILD_CELL);
    const cj0 = Math.floor(fz / WILD_CELL);
    const R = Math.ceil(V.r / WILD_CELL);
    const list: { ci: number; cj: number; d: number }[] = [];
    for (let dj = -R; dj <= R; dj++)
      for (let di = -R; di <= R; di++) {
        const ci = ci0 + di;
        const cj = cj0 + dj;
        const x0 = ci * WILD_CELL;
        const z0 = cj * WILD_CELL;
        const d = Math.hypot(Math.max(x0 - fx, 0, fx - x0 - WILD_CELL), Math.max(z0 - fz, 0, fz - z0 - WILD_CELL));
        if (d <= V.r) list.push({ ci, cj, d });
      }
    list.sort((a, b) => a.d - b.d);
    const counts = treeMeshes.map(() => 0);
    const jc = jMeshes.map(() => 0);
    let nc = 0;
    let nr = 0;
    let made = 0;
    pending = false;
    shownCells = 0;
    for (const L of list) {
      // (a few new squares a frame: the rest come in over the next frames, nearest first)
      if (!cells.has(ckey(L.ci, L.cj))) {
        if (made >= 6) {
          pending = true;
          continue;
        }
        made++;
      }
      const items = cellOf(L.ci, L.cj);
      shownCells++;
      for (const t of items) {
        const d = Math.hypot(t.x - fx, t.z - fz);
        if (d > V.r) continue;
        if (t.kind === ROCK) {
          if (nr >= V.rocks || (d > THIN_FROM && t.keep > 0.6)) continue;
          e.set(t.rot * 0.3, t.rot, t.rot * 0.17, "YXZ");
          m4.compose(v.set(t.x, t.y, t.z), q.setFromEuler(e), s3.set(t.s, t.s * t.sy, t.s * 1.1));
          rocks.setMatrixAt(nr, m4);
          rocks.setColorAt(nr, c.copy(rockCol).multiplyScalar(0.92 + t.keep * 0.12));
          nr++;
          continue;
        }
        if (t.kind === CLUMP) {
          if (d > RF_CLUMP_R || nc >= R0.clumps) continue;
          e.set(0, t.rot, 0);
          m4.compose(v.set(t.x, t.y - 0.1, t.z), q.setFromEuler(e), s3.set(t.s, t.s * t.sy, t.s));
          clumps.setMatrixAt(nc, m4);
          clumps.setColorAt(nc, c.copy(RF_LEAF[t.hue % 8]).multiplyScalar(0.85 + t.keep * 0.25));
          nc++;
          continue;
        }
        if (isJungle(t.kind)) {
          const type = t.kind - J0;
          if (d < R0.near && jc[type] < R0.caps[type]) {
            e.set(0, t.rot, 0);
            m4.compose(v.set(t.x, t.y - 0.2, t.z), q.setFromEuler(e), s3.set(t.s, t.s * t.sy, t.s));
            jMeshes[type].setMatrixAt(jc[type], m4);
            c.copy(RF_LEAF[t.hue % 8]);
            if (type >= 2) c.offsetHSL(0.02, 0.05, 0.04);
            jMeshes[type].setColorAt(jc[type], c);
            jc[type]++;
            continue;
          }
          // (further off: the giants and canopy trees as big chunky storybook trees — the canopy
          // still reads from afar — and the little palms and ferns not at all)
          if (type >= 2) continue;
          const sk = type === T_GIANT ? 2 : 1;
          const n = counts[sk];
          if (n >= caps[sk]) continue;
          const big = (TREE_DIMS[type].h / 6.4) * t.s * 0.85;
          e.set(0, t.rot, 0);
          m4.compose(v.set(t.x, t.y - 0.4, t.z), q.setFromEuler(e), s3.set(big * 0.9, big, big * 0.9));
          treeMeshes[sk].setMatrixAt(n, m4);
          treeMeshes[sk].setColorAt(n, c.copy(RF_LEAF[t.hue % 8]).multiplyScalar(0.8));
          counts[sk] = n + 1;
          continue;
        }
        const n = counts[t.kind];
        if (n >= caps[t.kind] || (d > THIN_FROM && t.keep > 0.5 + 0.5 * (1 - (d - THIN_FROM) / (V.r - THIN_FROM)))) continue;
        e.set(0, t.rot, 0);
        m4.compose(v.set(t.x, t.y - 0.15 * t.s, t.z), q.setFromEuler(e), s3.set(t.s, t.s * t.sy, t.s));
        treeMeshes[t.kind].setMatrixAt(n, m4);
        treeMeshes[t.kind].setColorAt(n, hueColor(t.hue, c).multiplyScalar(0.9 + t.keep * 0.2));
        counts[t.kind] = n + 1;
      }
    }
    treeMeshes.forEach((m, k) => {
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
    rocks.count = nr;
    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    jMeshes.forEach((m, k) => {
      m.count = jc[k];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
    clumps.count = nc;
    clumps.instanceMatrix.needsUpdate = true;
    if (clumps.instanceColor) clumps.instanceColor.needsUpdate = true;
  }

  return {
    meshes,
    update(focus) {
      // (the rainforest's see-through cut follows the kid)
      if (opts.cut) opts.cut.uJKid.value.set(focus.x, focus.y ?? 0, focus.z);
      // (refill when the kid crosses into another half-square, or while squares are still coming)
      const ci = Math.floor(focus.x / (WILD_CELL / 2));
      const cj = Math.floor(focus.z / (WILD_CELL / 2));
      if (ci === lastCi && cj === lastCj && !pending) return;
      lastCi = ci;
      lastCj = cj;
      refill(focus.x, focus.z);
    },
    trunkAt(x, z, r) {
      if (Math.hypot(x, z) < WILD_FROM - 6) return null;
      let best: { x: number; z: number; r: number } | null = null;
      let bd = Infinity;
      const ci0 = Math.floor(x / WILD_CELL);
      const cj0 = Math.floor(z / WILD_CELL);
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const items = cells.get(ckey(ci0 + di, cj0 + dj));
          if (!items) continue;
          for (const t of items) {
            if (t.kind === CLUMP) continue;
            const tr = t.kind === ROCK ? t.s * 1.05 : isJungle(t.kind) ? TREE_DIMS[t.kind - J0].trunkR * t.s : (isPineKind(t.kind) ? 0.3 : 0.38) * t.s;
            const d = Math.hypot(t.x - x, t.z - z) - tr;
            if (d < r && d < bd) {
              bd = d;
              best = { x: t.x, z: t.z, r: tr };
            }
          }
        }
      return best;
    },
    stats() {
      const trees = treeMeshes.reduce((s, m) => s + m.count, 0);
      const triangles = treeMeshes.reduce((s, m, k) => s + m.count * triOf(geos[k]), 0) + rocks.count * triOf(rockGeo) + jMeshes.reduce((s, m, k) => s + m.count * triOf(jGeos[k]), 0) + clumps.count * triOf(clumpGeo);
      return { trees, rocks: rocks.count, triangles, cells: shownCells };
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const g of jGeos) g.dispose();
      clumpGeo.dispose();
      rockGeo.dispose();
      for (const m of meshes) m.dispose();
    },
  };
}
