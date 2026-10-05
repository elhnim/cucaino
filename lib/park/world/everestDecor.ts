// Mount Everest's own small hand-built decorations: the summit flag (planted right at the true
// top — registry/landform.ts's EVEREST_SUMMIT), the glacier (a smooth, winding ribbon of ice lying
// ON the terrain, dark crevasse stripes across it), the Khumbu Icefall's jumble of seracs where the
// glacier is steepest, and a short meltwater stream from its snout past Base Camp. The mountain's
// actual SHAPE (the pyramid, the ridgelines, the snowfields, the dark rock faces) is the island's
// ordinary height-field terrain (lib/park/world/fantasy/terrainChunks.ts) + its existing
// height/slope colouring, with an Everest-local override added in terrainMesh.ts's groundColor()
// (a clean dark grey, no purple banding, and Everest's own crisp high snow line — scoped to its own
// massif only, so Highstone/the Lone Peak keep their ordinary look). Built once, unconditionally
// (a handful of cheap static meshes): no streaming needed, no per-frame cost beyond the meltwater's
// gentle shimmer.
import * as THREE from "three";
import { EVEREST_SUMMIT } from "../registry/landform";
import { BASE_CAMP_SITE } from "../registry/everestBaseCamp";
import { groundY } from "../registry/terrain";

export interface EverestDecor {
  group: THREE.Group;
  update(t: number): void;
  dispose(): void;
}

/** a tiny seeded PRNG (xorshift), matching every other registry/world module's own */
function rngOf(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function buildSummitFlag(): THREE.Group {
  const group = new THREE.Group();
  group.name = "everest-summit-flag";
  const y = groundY(EVEREST_SUMMIT.x, EVEREST_SUMMIT.z);
  const poleMat = new THREE.MeshStandardMaterial({ color: "#8a6238", roughness: 0.8 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.2, 6), poleMat);
  pole.position.set(EVEREST_SUMMIT.x, y + 1.6, EVEREST_SUMMIT.z);
  pole.castShadow = true;
  group.add(pole);
  const flagMat = new THREE.MeshStandardMaterial({ color: "#e8485f", roughness: 0.7, side: THREE.DoubleSide });
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1.1, -0.12, 0, 0, -0.62, 0, 1.1, -0.12, 0, 1.1, -0.74, 0, 0, -0.62, 0], 3));
  flagGeo.computeVertexNormals();
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(EVEREST_SUMMIT.x, y + 3.05, EVEREST_SUMMIT.z);
  flag.castShadow = true;
  group.add(flag);
  // a little cairn of rope/gear at the pole's foot (the kid's "I was here" photo spot)
  const gearMat = new THREE.MeshStandardMaterial({ color: "#2a6a8a", roughness: 0.85 });
  const gear = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), gearMat);
  gear.position.set(EVEREST_SUMMIT.x + 0.5, y + 0.25, EVEREST_SUMMIT.z + 0.3);
  gear.castShadow = true;
  group.add(gear);
  return group;
}

export interface GlacierPoint {
  x: number;
  z: number;
  /** ribbon half-width here (the average of its own left/right — buildGlacierRibbon wobbles the
   *  two edges independently round this) */
  half: number;
  /** 0 (the snout, by Base Camp) .. 1 (high on the flank) */
  t: number;
}

/** the glacier's own centreline, from high on the flank down to its snout just above Base Camp —
 *  a real valley glacier's wandering course (never a dead-straight line, and not a uniform width:
 *  it swells into wide basins and pinches through narrow necks), exported so the 3D climb route and
 *  the streamed Icefall decorations (world/everestClimbDecor.ts isn't this — that's the walking
 *  route; this is the ice itself) read the same shape */
export function glacierCenterline(): GlacierPoint[] {
  const bearing = Math.atan2(EVEREST_SUMMIT.x - BASE_CAMP_SITE.x, EVEREST_SUMMIT.z - BASE_CAMP_SITE.z);
  const sideX = Math.sin(bearing + Math.PI / 2);
  const sideZ = Math.cos(bearing + Math.PI / 2);
  const N = 72;
  const pts: GlacierPoint[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const rad = 20 + t * 232; // from just above Base Camp's own radius, climbing the flank
    // the valley's own wander: one long lazy S-curve plus a shorter, sharper wobble on top (a real
    // glacier's course is never one clean sine wave)
    const wiggle = Math.sin(t * 5.2 + 1.1) * 9 * (0.25 + t * 0.8) + Math.sin(t * 13.3 + 4) * 2.6 * (0.3 + t * 0.5);
    const x = BASE_CAMP_SITE.x + Math.sin(bearing) * rad + sideX * wiggle;
    const z = BASE_CAMP_SITE.z + Math.cos(bearing) * rad + sideZ * wiggle;
    // basins (wide, slower-moving ice) and necks (narrow, faster) — a slow swell with its own
    // period, independent of the position wobble above, plus the general taper (wider at the
    // snout, like a real tongue fanning out at its terminus)
    const basin = 0.5 + 0.5 * Math.sin(t * 7.1 + 2.0);
    const neck = 0.5 + 0.5 * Math.sin(t * 7.1 + 2.0 + Math.PI * 0.7);
    const half = 5.6 - t * 1.6 + basin * 3.4 - neck * 1.6 + Math.sin(t * 19 + 3) * 0.6;
    pts.push({ x, z, half: Math.max(2.4, half), t });
  }
  return pts;
}
let _centerline: GlacierPoint[] | null = null;
/** the cached centreline (computed once — wilds.ts's tree scatter calls `nearGlacier` a great many
 *  times, so this must never re-walk the wiggle maths per query) */
function cachedCenterline(): GlacierPoint[] {
  if (!_centerline) _centerline = glacierCenterline();
  return _centerline;
}
/** is (x, z) on (or right beside) the glacier ribbon? For wilds.ts's tree/boulder scatter, the same
 *  way `nearFallsStructures`/`inSettlement` already keep trees off the falls/villages — a forest
 *  growing straight through the ice reads as a bug, not a view. */
export function nearGlacier(x: number, z: number, pad = 2): boolean {
  const pts = cachedCenterline();
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2));
    const px = a.x + ex * t - x;
    const pz = a.z + ez * t - z;
    const half = a.half + (b.half - a.half) * t;
    if (px * px + pz * pz < (half + pad) ** 2) return true;
  }
  return false;
}

/** 0..1 along the centreline where the Icefall (steep, jumbled seracs) sits */
export const ICEFALL_T0 = 0.06;
export const ICEFALL_T1 = 0.38;

const ICE_DEEP = new THREE.Color("#4f8fb8"); // deep blue, the ice's own thick core
const ICE_MID = new THREE.Color("#bfe6f5");
const ICE_EDGE = new THREE.Color("#f3fbff"); // whiter right at the margins
const SNOW_FRINGE = new THREE.Color("#f7fbff"); // blends into the snowfield beyond
const ICE_CREVASSE = new THREE.Color("#2a5272");
const MORAINE = new THREE.Color("#5e4f3c"); // grey-brown rock debris, striped along the flow
const DIRTY_ICE = new THREE.Color("#8a8070"); // the snout's own dirty, debris-covered terminus

/** a tiny deterministic hash (0..1), for the edges' own independent (not mirrored) wobble and the
 *  moraine streaks' speckle — same little trick landform.ts's noise uses, just inline here since
 *  this is a world builder, not a registry */
function hash1(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** a wide, organic ribbon of ice lying flat on the real ground (groundY + a hair): both edges
 *  wobble independently (not a mirrored pair) so the margin reads as a real messy glacier edge, not
 *  a drawn line; a soft outer fringe blends toward the snowfield instead of cutting hard; colour
 *  runs deep blue down the middle to white at the margins, with grey-brown moraine streaks running
 *  the whole length and dark crevasse cracks confined to the Icefall's own stretch; the snout (t≈0)
 *  tints dirty, like a real glacier's debris-covered terminus. */
function buildGlacierRibbon(pts: GlacierPoint[]): THREE.Mesh {
  const n = pts.length;
  const pos: number[] = [];
  const col: number[] = [];
  // lateral offsets as a FRACTION of the local half-width, outer-fringe -> centre -> outer-fringe
  const LANES = [-1.45, -1, -0.55, 0, 0.55, 1, 1.45];
  let distAlong = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(n - 1, i + 1)];
    if (i > 0) distAlong += Math.hypot(p.x - prev.x, p.z - prev.z);
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const l = Math.hypot(dx, dz) || 1;
    const sx = dz / l;
    const sz = -dx / l;
    // independent left/right wobble (never a mirrored pair — a real glacier's two banks don't match)
    const leftHalf = p.half * (0.78 + hash1(i * 7.1) * 0.5);
    const rightHalf = p.half * (0.78 + hash1(i * 11.3 + 50) * 0.5);
    // crevasse cracks: only in the Icefall's own stretch (steep, jumbled), a few dark bands crossing
    // the flow, softened at the fringes
    const icefallK = Math.max(0, Math.min(1, (p.t - (ICEFALL_T0 - 0.03)) / 0.06)) * Math.max(0, Math.min(1, ((ICEFALL_T1 + 0.03) - p.t) / 0.06));
    const stripe = icefallK * Math.max(0, Math.sin((distAlong / 11) * Math.PI * 2)) ** 5;
    // the dirty, debris-covered snout (real glaciers are grubby grey-brown right at the terminus)
    const dirty = Math.max(0, 1 - p.t / 0.07);
    for (const lane of LANES) {
      const half = lane < 0 ? leftHalf : rightHalf;
      const off = lane * half;
      const gy = groundY(p.x + sx * off, p.z + sz * off) + 2.6 + (Math.abs(lane) > 1 ? -1.1 : 0); // the fringe settles a touch lower, into the snow
      pos.push(p.x + sx * off, gy, p.z + sz * off);
      const centreK = 1 - Math.min(1, Math.abs(lane)); // 1 at the centre, 0 at |lane|=1, negative beyond (fringe)
      let c: THREE.Color;
      if (Math.abs(lane) >= 1.2) c = SNOW_FRINGE.clone(); // the blended-out snow margin
      else if (Math.abs(lane) >= 1) c = ICE_EDGE.clone().lerp(SNOW_FRINGE, 0.4);
      else c = ICE_DEEP.clone().lerp(ICE_MID, 1 - Math.max(0, centreK)).lerp(ICE_EDGE, Math.max(0, 1 - centreK * 1.3));
      // moraine streaks: two fixed bands (one each side) running the glacier's whole length
      const moraineAmt = Math.exp(-(((Math.abs(lane) - 0.62) / 0.1) ** 2)) * (0.35 + hash1(i * 3.3 + (lane > 0 ? 90 : 0)) * 0.4);
      if (Math.abs(lane) < 1.2) c.lerp(MORAINE, moraineAmt * (1 - icefallK * 0.6));
      c.lerp(ICE_CREVASSE, stripe * (Math.abs(lane) < 1 ? 1 : 0.3));
      c.lerp(DIRTY_ICE, dirty * (Math.abs(lane) < 1.3 ? 0.6 : 0.3));
      col.push(c.r, c.g, c.b);
    }
  }
  const idx: number[] = [];
  const W = LANES.length;
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < W - 1; k++) {
      const a = i * W + k;
      const b = (i + 1) * W + k;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "everest-glacier";
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

/** a scatter of soft snow-patch blobs along the glacier's own margins, so the ice-to-snow edge
 *  reads as blended, not a ruled line (the ribbon's own outer "fringe" lane already fades colour;
 *  these add a little real geometry breaking up the edge) */
function buildSnowPatches(pts: GlacierPoint[]): THREE.InstancedMesh {
  const rnd = rngOf(40404);
  const n = pts.length;
  const COUNT = 46;
  const geo = new THREE.SphereGeometry(1, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const mat = new THREE.MeshToonMaterial({ color: "#f7fbff" });
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  mesh.name = "everest-snow-patches";
  mesh.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < COUNT; i++) {
    const fi = rnd() * (n - 1);
    const i0 = Math.floor(fi);
    const f = fi - i0;
    const a = pts[i0];
    const b = pts[Math.min(n - 1, i0 + 1)];
    const px = a.x + (b.x - a.x) * f;
    const pz = a.z + (b.z - a.z) * f;
    const half = a.half + (b.half - a.half) * f;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const sx = dz / l;
    const sz = -dx / l;
    const side = (rnd() < 0.5 ? -1 : 1) * half * (1.05 + rnd() * 0.45);
    const cx = px + sx * side;
    const cz = pz + sz * side;
    const s = 1.2 + rnd() * 2.0;
    m4.compose(new THREE.Vector3(cx, groundY(cx, cz) + 0.1, cz), q.set(0, 0, 0, 1), new THREE.Vector3(s, s * 0.45, s));
    mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** the Khumbu Icefall: a jumble of chunky, angular blue-white seracs beside the smooth ribbon,
 *  confined to the glacier's own steepest stretch (ICEFALL_T0..ICEFALL_T1) — one InstancedMesh,
 *  cheap, static (real icefalls do shift, but that's far too much for a kid-sized park to
 *  simulate; the "jumbled" look comes from each block's own random jitter, not motion) */
function buildSeracs(pts: GlacierPoint[]): THREE.InstancedMesh {
  const rnd = rngOf(90909);
  const n = pts.length;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshToonMaterial({ color: "#dff2f7" });
  const COUNT = 56;
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  mesh.name = "everest-icefall-seracs";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const colors: THREE.Color[] = [];
  for (let i = 0; i < COUNT; i++) {
    const t = ICEFALL_T0 + (i / (COUNT - 1)) * (ICEFALL_T1 - ICEFALL_T0);
    const fi = t * (n - 1);
    const i0 = Math.floor(fi);
    const f = fi - i0;
    const a = pts[i0];
    const b = pts[Math.min(n - 1, i0 + 1)];
    const cx0 = a.x + (b.x - a.x) * f;
    const cz0 = a.z + (b.z - a.z) * f;
    const half = a.half + (b.half - a.half) * f;
    const side = (rnd() - 0.5) * 2 * half * 0.9;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const sx = dz / l;
    const sz = -dx / l;
    const cx = cx0 + sx * side;
    const cz = cz0 + sz * side;
    const gy = groundY(cx, cz);
    const s = 1.0 + rnd() * 2.0;
    e.set((rnd() - 0.5) * 0.7, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.7, "YXZ");
    pos.set(cx, gy + s * 0.38, cz);
    scale.set(s, s * (0.8 + rnd() * 0.7), s);
    m4.compose(pos, q.setFromEuler(e), scale);
    mesh.setMatrixAt(i, m4);
    const shade = 0.82 + rnd() * 0.22;
    colors.push(new THREE.Color("#dff2f7").multiplyScalar(shade));
  }
  for (let i = 0; i < COUNT; i++) mesh.setColorAt(i, colors[i]);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/** a short meltwater stream running on from the glacier's own snout, past Base Camp's edge — a
 *  thin, gently shimmering blue ribbon (reuses buildGlacierRibbon's geometry approach but as plain
 *  water, not ice) */
function buildMeltwater(pts: GlacierPoint[]): THREE.Mesh {
  const snout = pts[0];
  const bearing = Math.atan2(EVEREST_SUMMIT.x - BASE_CAMP_SITE.x, EVEREST_SUMMIT.z - BASE_CAMP_SITE.z);
  const away = bearing + Math.PI;
  const N = 10;
  const streamPts: GlacierPoint[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const rad = t * 46;
    const wiggle = Math.sin(t * 6 + 0.4) * 2.4;
    const sideX = Math.sin(away + Math.PI / 2);
    const sideZ = Math.cos(away + Math.PI / 2);
    streamPts.push({ x: snout.x + Math.sin(away) * rad + sideX * wiggle, z: snout.z + Math.cos(away) * rad + sideZ * wiggle, half: 1.6 - t * 0.9, t: 0 });
  }
  const n = streamPts.length;
  const pos: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = streamPts[i];
    const prev = streamPts[Math.max(0, i - 1)];
    const next = streamPts[Math.min(n - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const l = Math.hypot(dx, dz) || 1;
    const sx = dz / l;
    const sz = -dx / l;
    const gy = groundY(p.x, p.z) + 0.25;
    pos.push(p.x - sx * p.half, gy, p.z - sz * p.half, p.x + sx * p.half, gy, p.z + sz * p.half);
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshToonMaterial({ color: "#4fb4e8", transparent: true, opacity: 0.88, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "everest-meltwater";
  return mesh;
}

/** the glacier's snout: a rounded lip of dirty, debris-covered ice where the tongue ends and the
 *  meltwater stream starts */
function buildSnoutLip(snout: GlacierPoint): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, 9, 6);
  geo.scale(snout.half * 1.25, 1.7, snout.half * 0.9);
  const mat = new THREE.MeshToonMaterial({ color: DIRTY_ICE });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(snout.x, groundY(snout.x, snout.z) + 0.5, snout.z);
  mesh.name = "everest-glacier-snout";
  return mesh;
}

export function buildEverestDecor(scene: THREE.Scene): EverestDecor {
  const group = new THREE.Group();
  group.name = "everest-decor";
  group.add(buildSummitFlag());
  const pts = glacierCenterline();
  const glacier = buildGlacierRibbon(pts);
  group.add(glacier);
  group.add(buildSeracs(pts));
  group.add(buildSnowPatches(pts));
  group.add(buildSnoutLip(pts[0]));
  const meltwater = buildMeltwater(pts);
  group.add(meltwater);
  scene.add(group);
  return {
    group,
    update(t: number) {
      // a gentle shimmer on the meltwater, like every other water surface in the park
      const mat = meltwater.material as THREE.MeshToonMaterial;
      mat.opacity = 0.8 + Math.sin(t * 1.4) * 0.06;
    },
    dispose() {
      group.parent?.remove(group);
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) m.dispose();
        }
      });
    },
  };
}
