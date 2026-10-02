// The far islands' own ground vs the ocean's sandy deep floor (./deepFloor.ts).
//
// The deep floor is a coarse patch (6-8 unit cells) that follows seaFloorY — and seaFloorY counts
// every island's land and flanks as sea floor (so creatures steer round them). Its long flat
// triangles cut chords across the island's own, finer ground mesh, so the sand used to poke up
// through Coralcove's harbour, Frostpeak's snow and Dino Isle's beaches.
//
// The general fix: every island with its own ground registers it here (`registerIslandFloor`), and
// the deep floor's material gets ONE cut (`cutIslandFloors`, called once in ../underwater): a mask
// per island, baked (progressively, when the kid first comes near), discards the sand wherever the
// island's own ground rises above the open plain (the island draws that part itself, so however
// the coarse cells cut across it - or bulge up round a jetty - none of their sand shows). Out where the island's flanks sink under
// the open plain the plain is the floor: the sand stays, so no ditch or hole opens up.
//
// Coralcove, Frostpeak and Dino Isle are registered below straight from their registries; a new
// island only needs one `registerIslandFloor` call.
import * as THREE from "three";
import { VILLAGE_ISLAND, VILLAGE_SEA_R, villageSeaFloorY } from "../../registry/villageIsland";
import { FROST_ISLAND, FROST_SEA_R, frostSeaFloorY } from "../../registry/frostIsland";
import { DINO_GX0, DINO_GX1, DINO_GZ0, DINO_GZ1, DINO_ISLAND, dinoSeaFloorY } from "../../registry/dinoIsland";
import { dunes, seaFloorY } from "./wander";
import { DEEP_FLOOR } from "../../registry/terrain";

export interface IslandFloor {
  id: string;
  /** world bounds of everything the island draws as ground (its land + its submerged skirt) */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** the island's own ground height there (land, beach, flanks), or null where it draws none */
  floorY(x: number, z: number): number | null;
}

/** how many islands the deep floor's shader can cut at once */
export const MAX_ISLAND_FLOORS = 4;
/** the island counts as the sea floor where its ground is no more than this below the open plain */
export const CUT_MARGIN = 0.4;

const islands: IslandFloor[] = [];
const listeners: (() => void)[] = [];

/** add (or replace, by id) an island whose own ground the deep sand floor must never poke through */
export function registerIslandFloor(f: IslandFloor): void {
  const i = islands.findIndex((g) => g.id === f.id);
  if (i >= 0) islands[i] = f;
  else if (islands.length < MAX_ISLAND_FLOORS) islands.push(f);
  else throw new Error(`islandFloors: more than ${MAX_ISLAND_FLOORS} islands (raise MAX_ISLAND_FLOORS)`);
  for (const l of listeners) l();
}
export const islandFloors = (): readonly IslandFloor[] => islands;

// the islands we have (straight from their registries)
registerIslandFloor({
  id: VILLAGE_ISLAND.id,
  minX: VILLAGE_ISLAND.x - VILLAGE_SEA_R - 3,
  maxX: VILLAGE_ISLAND.x + VILLAGE_SEA_R + 3,
  minZ: VILLAGE_ISLAND.z - VILLAGE_SEA_R - 3,
  maxZ: VILLAGE_ISLAND.z + VILLAGE_SEA_R + 3,
  floorY: villageSeaFloorY,
});
registerIslandFloor({
  id: FROST_ISLAND.id,
  minX: FROST_ISLAND.x - FROST_SEA_R - 3,
  maxX: FROST_ISLAND.x + FROST_SEA_R + 3,
  minZ: FROST_ISLAND.z - FROST_SEA_R - 3,
  maxZ: FROST_ISLAND.z + FROST_SEA_R + 3,
  floorY: frostSeaFloorY,
});
registerIslandFloor({
  id: DINO_ISLAND.id,
  minX: DINO_ISLAND.x + DINO_GX0,
  maxX: DINO_ISLAND.x + DINO_GX1,
  minZ: DINO_ISLAND.z + DINO_GZ0,
  maxZ: DINO_ISLAND.z + DINO_GZ1,
  floorY: dinoSeaFloorY,
});

/**
 * The deep floor mesh's height at (x, z): its vertices sit on world multiples of `cell` at
 * floor(x, z) and each cell is split along its (i+1, j) – (i, j+1) diagonal (as buildDeepFloor).
 */
export function deepFloorMeshY(x: number, z: number, cell: number, floor: (x: number, z: number) => number = seaFloorY): number {
  const fi = x / cell;
  const fj = z / cell;
  const i = Math.floor(fi);
  const j = Math.floor(fj);
  const u = fi - i;
  const v = fj - j;
  const h00 = floor(i * cell, j * cell);
  const h10 = floor((i + 1) * cell, j * cell);
  const h01 = floor(i * cell, (j + 1) * cell);
  if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
  const h11 = floor((i + 1) * cell, (j + 1) * cell);
  return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}

/** a baked cut mask: 255 where the sand must go (the island's ground is at / above it) */
export interface FloorMask {
  data: Uint8Array;
  w: number;
  h: number;
  /** world x, z of texel (0, 0)'s centre and the texel size */
  x0: number;
  z0: number;
  texel: number;
}

/** the mask's size and spacing for an island (texels <= 512 a side, ~1 unit apart) */
export function maskLayout(f: IslandFloor): { w: number; h: number; texel: number } {
  const span = Math.max(f.maxX - f.minX, f.maxZ - f.minZ);
  const texel = Math.max(0.8, span / 511);
  return { w: Math.ceil((f.maxX - f.minX) / texel) + 1, h: Math.ceil((f.maxZ - f.minZ) / texel) + 1, texel };
}

/** the open ocean's sandy plain out round the far islands (= seaFloorY there, islands aside) */
export const openPlainY = (x: number, z: number) => DEEP_FLOOR + dunes(x, z);

/**
 * Is the sand cut at (x, z): the island draws its own ground there, above the open plain (so it,
 * not the plain, is the sea floor: its land, beaches, shelves and flanks - and under its jetties,
 * where seaFloorY follows the planks and the sand cells bulged up round them).
 */
export function sandCutAt(f: IslandFloor, x: number, z: number, plain: (x: number, z: number) => number = openPlainY): boolean {
  const g = f.floorY(x, z);
  return g !== null && g >= plain(x, z) - CUT_MARGIN;
}

/** Bake rows [j0, j1) of an island's mask (call with the whole range, or a few rows a frame). */
export function bakeFloorRows(f: IslandFloor, m: FloorMask, j0: number, j1: number, plain: (x: number, z: number) => number = openPlainY): void {
  for (let j = j0; j < Math.min(j1, m.h); j++) {
    const z = m.z0 + j * m.texel;
    for (let i = 0; i < m.w; i++) m.data[j * m.w + i] = sandCutAt(f, m.x0 + i * m.texel, z, plain) ? 255 : 0;
  }
}

export function makeFloorMask(f: IslandFloor): FloorMask {
  const { w, h, texel } = maskLayout(f);
  return { data: new Uint8Array(w * h), w, h, x0: f.minX, z0: f.minZ, texel };
}

export interface IslandFloorCut {
  /** bake (a few rows a frame) the masks of the islands near the focus; returns true once all near ones are ready */
  update(focus: { x: number; z: number }): boolean;
  dispose(): void;
}

/** how near (beyond its bounds) an island's mask is baked: well before the sand under it shows */
const BAKE_R = 260;
/** mask rows baked per frame (spreads the work over a few frames) */
const ROWS_PER_FRAME = 16;

/**
 * Cut the deep sand floor's material away over every registered island's own ground. One call, for
 * the one deep floor material (`floor` = what its vertices follow); masks are baked as the kid comes near.
 */
export function cutIslandFloors(mat: THREE.Material, plain: (x: number, z: number) => number = openPlainY): IslandFloorCut {
  const tex: (THREE.DataTexture | null)[] = Array.from({ length: MAX_ISLAND_FLOORS }, () => null);
  const masks: (FloorMask | null)[] = Array.from({ length: MAX_ISLAND_FLOORS }, () => null);
  const done: number[] = Array.from({ length: MAX_ISLAND_FLOORS }, () => 0);
  const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RedFormat);
  blank.needsUpdate = true;
  const uTex = { value: Array.from({ length: MAX_ISLAND_FLOORS }, () => blank as THREE.Texture) };
  // (x0, z0, 1 / width, 1 / depth) of each mask in world units; z = 0: not ready
  const uBox = { value: Array.from({ length: MAX_ISLAND_FLOORS }, () => new THREE.Vector4(0, 0, 0, 0)) };
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey;
  const N = MAX_ISLAND_FLOORS;
  mat.onBeforeCompile = function (shader, renderer) {
    prev.call(this, shader, renderer);
    shader.uniforms.uIslCut = uTex;
    shader.uniforms.uIslBox = uBox;
    shader.vertexShader = shader.vertexShader.replace(/void\s+main\s*\(\s*\)\s*\{/, (s) => `varying vec2 vIslXZ;\n${s}\n  vIslXZ = ( modelMatrix * vec4( position, 1.0 ) ).xz;`);
    let body = "";
    // (unrolled: sampler arrays need constant indices)
    for (let k = 0; k < N; k++)
      body += `
    if ( uIslBox[${k}].z > 0.0 ) {
      vec2 isUv = ( vIslXZ - uIslBox[${k}].xy ) * uIslBox[${k}].zw;
      if ( isUv.x > 0.0 && isUv.y > 0.0 && isUv.x < 1.0 && isUv.y < 1.0 && texture2D( uIslCut[${k}], isUv ).r > 0.5 ) discard;
    }`;
    shader.fragmentShader = shader.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/, (s) => `varying vec2 vIslXZ; uniform sampler2D uIslCut[${N}]; uniform vec4 uIslBox[${N}];\n${s}\n  {${body}\n  }`);
  };
  mat.customProgramCacheKey = function () {
    return prevKey.call(this) + "-island-cut";
  };
  mat.needsUpdate = true;
  const reset = () => {
    for (let k = 0; k < N; k++) {
      tex[k]?.dispose();
      tex[k] = null;
      masks[k] = null;
      done[k] = 0;
      uTex.value[k] = blank;
      uBox.value[k].set(0, 0, 0, 0);
    }
  };
  listeners.push(reset);
  return {
    update(focus) {
      let ready = true;
      const list = islands;
      for (let k = 0; k < list.length; k++) {
        const f = list[k];
        if (tex[k]) continue;
        const dx = Math.max(f.minX - focus.x, 0, focus.x - f.maxX);
        const dz = Math.max(f.minZ - focus.z, 0, focus.z - f.maxZ);
        if (dx > BAKE_R || dz > BAKE_R) continue;
        const m = (masks[k] ??= makeFloorMask(f));
        bakeFloorRows(f, m, done[k], done[k] + ROWS_PER_FRAME, plain);
        done[k] += ROWS_PER_FRAME;
        if (done[k] < m.h) {
          ready = false;
          continue;
        }
        // (texel centres at x0 + i * texel: a half-texel border puts them on the uv grid)
        const t = new THREE.DataTexture(m.data, m.w, m.h, THREE.RedFormat);
        t.magFilter = t.minFilter = THREE.LinearFilter;
        t.needsUpdate = true;
        tex[k] = t;
        uTex.value[k] = t;
        uBox.value[k].set(m.x0 - m.texel / 2, m.z0 - m.texel / 2, 1 / (m.w * m.texel), 1 / (m.h * m.texel));
      }
      return ready;
    },
    dispose() {
      reset();
      blank.dispose();
      const i = listeners.indexOf(reset);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
}
