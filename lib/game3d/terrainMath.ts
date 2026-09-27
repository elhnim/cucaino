// Pure, dependency-free terrain math: chunk coordinates and ground-height sampling.
// Kept separate from terrain.ts (which pulls in three.js + canvas textures) so it can
// be unit tested directly, and separate from village.ts so the two modules don't need
// to import each other.
import { fbm2D } from "./noise";

export const CHUNK_SIZE = 40;
export const CHUNK_SEGMENTS = 10;
export const LOAD_RADIUS_CHUNKS = 2; // 2 -> a 5x5 window of chunks stays loaded around the player
export const GROUND_BASE_Y = 1.5; // matches the hand-built village's plaza/landmark ground level
/** Must stay >= village.ts's ISLAND_RADIUS so procedural terrain never displaces/decorates under the hand-built village. */
export const VILLAGE_CLEAR_RADIUS = 34;
export const BLEND_MARGIN = 16; // world units over which terrain ramps from flat to full noise past the clear radius
export const HEIGHT_SCALE = 2.6;
export const TERRAIN_TEXTURE_WORLD_SIZE = 9; // world units per ground-texture tile, for seamless cross-chunk UVs
export const SLOT_TREE_CAP = 16;
export const SLOT_ROCK_CAP = 5;
export const SLOT_BUSH_CAP = 10;
export const SLOT_FLOWER_CAP = 36;

export interface ChunkCoord {
  cx: number;
  cz: number;
}

export function chunkCoordAt(x: number, z: number): ChunkCoord {
  return { cx: Math.floor(x / CHUNK_SIZE), cz: Math.floor(z / CHUNK_SIZE) };
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function chunkCenter(cx: number, cz: number): { x: number; z: number } {
  return { x: cx * CHUNK_SIZE + CHUNK_SIZE / 2, z: cz * CHUNK_SIZE + CHUNK_SIZE / 2 };
}

/** Deterministic per-chunk seed, independent of load order (spatial hash of the world seed + chunk coords). */
export function chunkSeed(worldSeed: number, cx: number, cz: number): number {
  return (worldSeed ^ Math.imul(cx, 0x2545f491) ^ Math.imul(cz, 0x9e3779b1)) >>> 0;
}

/**
 * Deterministic ground height in world units. Flat at GROUND_BASE_Y within VILLAGE_CLEAR_RADIUS
 * of the origin (so the hand-built village sits on level ground), then ramps into rolling
 * fbm-noise terrain over BLEND_MARGIN world units.
 */
export function heightAt(x: number, z: number, noise: (x: number, y: number) => number): number {
  const r = Math.hypot(x, z);
  const blend = Math.max(0, Math.min(1, (r - VILLAGE_CLEAR_RADIUS) / BLEND_MARGIN));
  if (blend <= 0) return GROUND_BASE_Y;
  const n = fbm2D(noise, x / 55, z / 55, 4, 2.1, 0.5);
  return GROUND_BASE_Y + n * HEIGHT_SCALE * blend;
}
