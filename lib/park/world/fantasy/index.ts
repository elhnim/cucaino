// Cucaino Park's fantasy nature & landmarks kit: a wind-swept grass field that follows the
// player, groves of stylised trees, mossy boulders, glowing crystals, ancient rune ruins, the
// Glow Forest's giant ancient trees (with glowing mushrooms, hanging vines, light shafts and
// ground mist) and the floating sky islands you can land on (registry/skyIslands.ts, sky.ts:
// mountains, meadows, ruins, crystals, gardens, waterfalls, treasure chests). Everything is procedural,
// instanced and merged (~18 draw calls + shadow casters), placed by planFantasy() (pure,
// tested) and animated by a handful of shared uniforms in update().
import * as THREE from "three";
import { grassMask, type GrassMask } from "./mask";
import { buildTerrainWindows } from "./terrainWindow";
import { buildWilds, type Wilds } from "./wilds";
import { addJungleCut, makeJungleCut } from "../jungle/cutaway";
import { planFantasy, SPECIES, type FantasyPlan, type FreeFn } from "./placement";
import { buildGrassField } from "./grass";
import { buildGiantTreeGeometry, buildMushroomClusterGeometry, buildTreeGeometry, tintFor } from "./trees";
import { buildCrystalGeometry, buildRockGeometry, buildRuinsGeometry, CRYSTAL_HUES } from "./stones";
import { buildSkyIslands } from "./sky";
import { buildLeaves, buildShafts, buildSprites, SPRITE_FOREST_MIST, SPRITE_HALO, type SpriteDef } from "./particles";
import { fxMaterial, ISL_WORLD, makeUniforms } from "./shaders";
import { col } from "./geo";
import { LANDS } from "../../registry/places";

export { buildTerrainMesh, groundColor } from "./terrainMesh";
export { defaultFantasyFree, planFantasy } from "./placement";
export { bakeGrassMask } from "./mask";
export type { FantasyPlan, FreeFn } from "./placement";

export interface FantasyWorld {
  /** call every frame; `focus` = the player's position (grass follows the player); glow 0 = day .. 1 = twilight */
  update(dt: number, t: number, focus: THREE.Vector3, glow: number): void;
  /** round obstacles the player should walk around (big rocks, ruin pillars), x/z/r */
  obstacles: { x: number; z: number; r: number }[];
  dispose(): void;
  /** everything the kit added, in one group */
  group: THREE.Group;
  /** where things went (for the map, walk-to routes, debugging) */
  plan: FantasyPlan;
  /** numbers for perf reporting */
  stats: { blades: number; trees: number; rocks: number; crystals: number; ruins: number; islands: number; meshes: number };
  /** the Wildlands' trees and boulders, streamed round the player (./wilds.ts) */
  wilds: Wilds;
  /** the grass mask (CPU copy) — pass to buildTerrainMesh({ mask }) to paint bare earth under trails */
  mask: GrassMask;
  /** the floating islands (registry/skyIslands.ts): opened chests, found discoveries (a found
   *  nest shows its hatchling, a found rune circle stays lit), the kid's feet (lights rune stones)
   *  and the rune circles' progress */
  sky: {
    setOpened(ids: string[]): void;
    setSpotsFound(ids: string[]): void;
    setKid(x: number, y: number, z: number): void;
    puzzleState(): { id: string; lit: number; total: number; done: boolean }[];
  };
}

export interface FantasyOptions {
  free: FreeFn;
  lowQuality?: boolean;
  /** grass/foliage receive shadows (default: on at standard quality, off at low) */
  receiveShadow?: boolean;
  /** grass blades (default on); off keeps just the wildflowers, for the flat diorama look */
  blades?: boolean;
  /** the kit's everyday trees (default on); off for the storybook look, whose own chunky forest
   *  fills the island (their candy colours and sizes clashed with it). The Glow Forest's giants stay. */
  trees?: boolean;
}

const MUSHROOM_HUES = [col("#46f0ff"), col("#b680ff"), col("#ffb347")];

export function buildFantasyWorld(scene: THREE.Scene, opts: FantasyOptions): FantasyWorld {
  const low = !!opts.lowQuality;
  const shadowsIn = opts.receiveShadow ?? !low;
  const U = makeUniforms();
  const plan = planFantasy(opts.free, { lowQuality: low });
  const group = new THREE.Group();
  group.name = "fantasy-world";
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T) => (disposables.push(d), d);

  // ── the ground's textures: windows of the height field and the grass mask that follow the
  //    player (baked lazily from their tiles, so nothing over the whole island is built up front) ──
  const mask = grassMask(low ? 512 : 1024);
  const win = track(buildTerrainWindows(mask.n, low ? 256 : 512));
  win.update(0, 0);

  // ── grass + wildflowers ──
  const grass = buildGrassField(U, win, { lowQuality: low, receiveShadow: shadowsIn });
  disposables.push(grass);
  for (const m of grass.meshes) if (opts.blades !== false || m.name === "fantasy-flowers") group.add(m);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const c = new THREE.Color();
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, name: string, cast = true) => {
    const im = new THREE.InstancedMesh(track(geo), mat, Math.max(1, n));
    im.count = n;
    im.castShadow = cast;
    im.receiveShadow = true;
    im.name = name;
    group.add(im);
    return im;
  };
  const finish = (im: THREE.InstancedMesh) => {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
  };

  // ── trees: one instanced mesh per species (bark + canopy + pods in one geometry) ──
  const foliageMat = track(fxMaterial(U, { roughness: 0.82, metalness: 0 }));
  for (const sp of opts.trees === false ? [] : SPECIES) {
    const list = plan.trees.filter((t) => t.species === sp);
    if (!list.length) continue;
    const im = instanced(buildTreeGeometry(sp, low).geometry, foliageMat, list.length, `fantasy-trees-${sp}`);
    list.forEach((t, i) => {
      e.set(0, t.rot, 0);
      m4.compose(v.set(t.x, t.y - 0.12 * t.s, t.z), q.setFromEuler(e), s3.setScalar(t.s));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, tintFor(sp, t.tint, c));
    });
    finish(im);
  }

  // ── the Wildlands beyond the park: forests, groves and boulders, streamed round the player ──
  // (the rainforest round the Great Falls gets the park rainforest's see-through cut)
  const wildCut = makeJungleCut();
  // (you can walk anywhere in this one, under the low palms and ferns too: a wider window)
  wildCut.uJR.value.set(3.2, 9.5, 8);
  const wildJungleMat = track(addJungleCut(fxMaterial(U, { roughness: 0.9, metalness: 0 }), wildCut, { shadeBelow: true }));
  const wilds = buildWilds(foliageMat, { lowQuality: low, jungleMaterial: wildJungleMat, cut: wildCut });
  disposables.push(wilds);
  group.add(...wilds.meshes);

  // ── the Glow Forest: giant ancient trees + glowing mushroom clusters + light shafts ──
  if (plan.giants.length) {
    const im = instanced(buildGiantTreeGeometry(low), foliageMat, plan.giants.length, "fantasy-giant-trees");
    plan.giants.forEach((g, i) => {
      e.set(0, g.rot, 0);
      m4.compose(v.set(g.x, g.y - 0.3, g.z), q.setFromEuler(e), s3.setScalar(g.s));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, c.set("#3f9e4c").lerp(new THREE.Color("#2e9078"), (i % 3) / 2));
    });
    finish(im);
  }
  if (plan.mushrooms.length) {
    const im = instanced(buildMushroomClusterGeometry(), foliageMat, plan.mushrooms.length, "fantasy-mushrooms", false);
    plan.mushrooms.forEach((mu, i) => {
      e.set(0, mu.rot, 0);
      m4.compose(v.set(mu.x, mu.y - 0.05, mu.z), q.setFromEuler(e), s3.setScalar(mu.s));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, MUSHROOM_HUES[mu.hue]);
    });
    finish(im);
  }
  if (plan.shafts.length) {
    const shafts = buildShafts(U, plan.shafts);
    track(shafts.geometry);
    track(shafts.material as THREE.Material);
    group.add(shafts);
  }

  // ── rocks & boulders (one faceted rock, instanced at every size) ──
  const stoneMat = track(fxMaterial(U, { roughness: 0.9, metalness: 0 }));
  if (plan.rocks.length) {
    const im = instanced(buildRockGeometry(low), stoneMat, plan.rocks.length, "fantasy-rocks");
    plan.rocks.forEach((r, i) => {
      e.set(r.tilt, r.rot, r.tilt * 0.6, "YXZ");
      m4.compose(v.set(r.x, r.y, r.z), q.setFromEuler(e), s3.set(r.s * r.sx, r.s * r.sy, r.s * r.sz));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, c.setRGB(0.95 + (i % 5) * 0.025, 0.95 + (i % 3) * 0.02, 0.98 + (i % 4) * 0.02));
    });
    finish(im);
  }

  // ── crystals ──
  const crystalMat = track(fxMaterial(U, { roughness: 0.22, metalness: 0.05 }));
  if (plan.crystals.length) {
    const im = instanced(buildCrystalGeometry(), crystalMat, plan.crystals.length, "fantasy-crystals");
    plan.crystals.forEach((cr, i) => {
      e.set(cr.tiltX, cr.rot, cr.tiltZ, "YXZ");
      m4.compose(v.set(cr.x, cr.y, cr.z), q.setFromEuler(e), s3.setScalar(cr.s));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, CRYSTAL_HUES[cr.hue]);
    });
    finish(im);
  }

  // ── ancient ruins (all sites merged: 1 draw call) ──
  const ruinsGeo = buildRuinsGeometry(plan.ruins);
  if (ruinsGeo) {
    const ruins = new THREE.Mesh(track(ruinsGeo), stoneMat);
    ruins.castShadow = true;
    ruins.receiveShadow = true;
    ruins.name = "fantasy-ruins";
    group.add(ruins);
  }

  // ── floating islands + waterfalls ──
  const sky = buildSkyIslands(U, { lowQuality: low });
  disposables.push(sky);
  group.add(sky.mesh, sky.falls, ...sky.chests);

  // ── soft sprites: waterfall mist, forest ground mist, glow halos ──
  const sprites: SpriteDef[] = [];
  sprites.push(...sky.sprites);
  const forest = LANDS.find((l) => l.id === "forest")!;
  const mistN = low ? 14 : 30;
  for (let i = 0; i < mistN; i++) {
    const a = (i / mistN) * Math.PI * 2 * 3.7;
    const d = Math.sqrt((i + 0.5) / mistN) * (forest.radius + 6);
    const x = forest.x + Math.sin(a) * d;
    const z = forest.z + Math.cos(a) * d;
    const gy = plan.giants.length ? plan.giants[0].y : 0;
    sprites.push({ x, y: gy + 1.6 + (i % 3) * 0.9, z, isl: ISL_WORLD, size: 9 + (i % 4) * 2.5, color: col("#dff2e8"), kind: SPRITE_FOREST_MIST });
  }
  for (const cr of plan.crystals) if (cr.s > 0.9) sprites.push({ x: cr.x, y: cr.y + 1.6 * cr.s, z: cr.z, isl: ISL_WORLD, size: 5.5 * cr.s, color: CRYSTAL_HUES[cr.hue], kind: SPRITE_HALO });
  plan.mushrooms.forEach((mu, i) => {
    if (i % 2 === 0) sprites.push({ x: mu.x, y: mu.y + 1.2 * mu.s, z: mu.z, isl: ISL_WORLD, size: 3.6 * mu.s, color: MUSHROOM_HUES[mu.hue], kind: SPRITE_HALO });
  });
  for (const site of plan.ruins)
    for (const p of site.parts) if (p.kind === "altar") sprites.push({ x: p.x, y: p.y + 2 * p.h, z: p.z, isl: ISL_WORLD, size: 4.5, color: site.kind === "shrine" ? col("#ffcf5a") : col("#5ff4ff"), kind: SPRITE_HALO });
  const spriteMesh = buildSprites(U, sprites);
  track(spriteMesh.geometry);
  track(spriteMesh.material as THREE.Material);
  group.add(spriteMesh);

  // ── drifting leaves & petals round the player ──
  const leaves = buildLeaves(U, win, low ? 110 : 260);
  track(leaves.geometry);
  track(leaves.material as THREE.Material);
  group.add(leaves);

  scene.add(group);
  U.uIslMat.value[ISL_WORLD].identity();
  sky.update(0);

  let meshes = 0;
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) meshes++;
  });

  return {
    group,
    plan,
    mask,
    wilds,
    sky: {
      setOpened: (ids) => sky.setOpened(ids),
      setSpotsFound: (ids) => sky.setSpotsFound(ids),
      setKid: (x, y, z) => sky.setKid(x, y, z),
      puzzleState: () => sky.puzzleState(),
    },
    // (without the trees, their trunks mustn't stay behind as invisible walls)
    obstacles: opts.trees === false ? plan.obstacles.filter((o) => !plan.trees.some((t) => Math.abs(t.x - o.x) < 0.01 && Math.abs(t.z - o.z) < 0.01)) : plan.obstacles,
    stats: { blades: grass.blades, trees: plan.trees.length + plan.giants.length, rocks: plan.rocks.length, crystals: plan.crystals.length, ruins: plan.ruins.length, islands: plan.islands.length, meshes },
    update(_dt, t, focus, glow) {
      U.uTime.value = t;
      U.uGlow.value = glow;
      U.uGlowK.value = 0.8 + glow * 1.7;
      U.uPulse.value = glow;
      U.uFocus.value.set(focus.x, focus.z);
      win.update(focus.x, focus.z);
      wilds.update(focus);
      sky.update(t);
    },
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
    },
  };
}
