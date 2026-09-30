// Where the animals can put their feet: a 1 m grid over the island baked once, so every step of
// every animal is a couple of array lookups (no trail / stream scans per frame). Pure, no three.js.
//   B_LAND    dry island ground above the sea, out of the stream and the pond, out of the lands,
//             places, the plaza and the Dream Park (animals may cross trails and meadows)
//   B_OPEN    not under the storybook forest's canopy
//   B_POND    pond water (ducks)
//   B_STREAM  stream water
//   B_BANK    dry ground within ~2.5 m of the stream / pond (frogs, the bears' fishing spot)
//   B_TRAIL   on a trail (within ~2 m of its centre line)
//   B_BLOCK   inside one of the park's round obstacles (trunks, windmills, rocks, ruins ...)
import { ISLAND_R, POND, STREAM_POINTS, STREAM_WIDTH, coastR } from "../../registry/island";
import { WATER_Y, groundY, slopeAt } from "../../registry/terrain";
import { fieldAt, gridIndex, openFields } from "../storybook/plan";

export const WHALF = 160;
export const WN = 320;
export const B_LAND = 1;
export const B_OPEN = 2;
export const B_POND = 4;
export const B_STREAM = 8;
export const B_BANK = 16;
export const B_TRAIL = 32;
/** a tree trunk, windmill, rock, ruin or building stands here */
export const B_BLOCK = 64;

export interface WalkGrid {
  bits: Uint8Array;
  /** slope 0..1 quantised to 0..255 */
  slope: Uint8Array;
  /** the pond's water surface */
  pondY: number;
}

/** metres from (x, z) to the stream's centre line (exact, segment distance) */
export function streamDist(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < STREAM_POINTS.length; i++) {
    const [ax, az] = STREAM_POINTS[i];
    const [bx, bz] = STREAM_POINTS[i + 1];
    const ex = bx - ax;
    const ez = bz - az;
    const l2 = ex * ex + ez * ez || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
    const dx = ax + ex * u - x;
    const dz = az + ez * u - z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/** the lowest ground in the 1 m cell round (x, z) (its corners and centre) */
function lowest(x: number, z: number): number {
  return Math.min(groundY(x, z), groundY(x - 0.5, z - 0.5), groundY(x + 0.5, z - 0.5), groundY(x - 0.5, z + 0.5), groundY(x + 0.5, z + 0.5));
}

/** is dry, walkable island ground here (the rule the grid bakes, for one point) */
export function dryLandAt(x: number, z: number): boolean {
  const r = Math.hypot(x, z);
  if (r > coastR(Math.atan2(x, z)) - 2.5) return false;
  if (groundY(x, z) < WATER_Y + 0.3) return false;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.3) return false;
  if (streamDist(x, z) < STREAM_WIDTH / 2 + 0.35) return false;
  return true;
}

/**
 * Bake the grid. `covered` is the storybook forest's canopy grid (its 2 m grid, 1 = under a tree);
 * pass null to treat everything as open.
 */
export function buildWalkGrid(covered: Uint8Array | null, obstacles: readonly { x: number; z: number; r: number }[] = []): WalkGrid {
  const f = openFields();
  const bits = new Uint8Array(WN * WN);
  const slope = new Uint8Array(WN * WN);
  for (let j = 0; j < WN; j++) {
    const z = -WHALF + j + 0.5;
    for (let i = 0; i < WN; i++) {
      const x = -WHALF + i + 0.5;
      const k = j * WN + i;
      const r = Math.hypot(x, z);
      if (r > ISLAND_R + 6) continue;
      slope[k] = Math.round(Math.min(1, slopeAt(x, z)) * 255);
      const pd = Math.hypot(x - POND.x, z - POND.z);
      const nearS = fieldAt(f.stream, x, z) < 8;
      const sd = nearS ? streamDist(x, z) : 1e6;
      let b = 0;
      if (pd < POND.r - 0.5) b |= B_POND;
      if (sd < STREAM_WIDTH / 2) b |= B_STREAM;
      const land = r < coastR(Math.atan2(x, z)) - 2.5 && lowest(x, z) > WATER_Y + 0.3 && pd > POND.r + 0.3 && sd > STREAM_WIDTH / 2 + 0.35 && fieldAt(f.land, x, z) > 0;
      if (land) {
        b |= B_LAND;
        if (sd < STREAM_WIDTH / 2 + 2.6 || pd < POND.r + 2.6) b |= B_BANK;
      }
      const g = gridIndex(x, z);
      if (!covered || g < 0 || !covered[g]) b |= B_OPEN;
      if (fieldAt(f.trail, x, z) < 2.1) b |= B_TRAIL;
      bits[k] = b;
    }
  }
  for (const o of obstacles) {
    const R = o.r + 0.25;
    const i0 = Math.max(0, Math.floor(o.x - R + WHALF));
    const i1 = Math.min(WN - 1, Math.floor(o.x + R + WHALF));
    const j0 = Math.max(0, Math.floor(o.z - R + WHALF));
    const j1 = Math.min(WN - 1, Math.floor(o.z + R + WHALF));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const dx = -WHALF + i + 0.5 - o.x;
        const dz = -WHALF + j + 0.5 - o.z;
        if (dx * dx + dz * dz < R * R) bits[j * WN + i] |= B_BLOCK;
      }
  }
  return { bits, slope, pondY: groundY(POND.x, POND.z) + 0.065 };
}

export function bitsAt(g: WalkGrid, x: number, z: number): number {
  const i = Math.floor(x + WHALF);
  const j = Math.floor(z + WHALF);
  if (i < 0 || j < 0 || i >= WN || j >= WN) return 0;
  return g.bits[j * WN + i];
}

export function slopeOf(g: WalkGrid, x: number, z: number): number {
  const i = Math.floor(x + WHALF);
  const j = Math.floor(z + WHALF);
  if (i < 0 || j < 0 || i >= WN || j >= WN) return 1;
  return g.slope[j * WN + i] / 255;
}

/** share (0..1) of grid cells within r of (x, z) that have all of `need` bits */
export function shareAround(g: WalkGrid, x: number, z: number, r: number, need: number, step = 1.5): number {
  let n = 0;
  let ok = 0;
  for (let dz = -r; dz <= r; dz += step)
    for (let dx = -r; dx <= r; dx += step) {
      if (dx * dx + dz * dz > r * r) continue;
      n++;
      if ((bitsAt(g, x + dx, z + dz) & need) === need) ok++;
    }
  return n ? ok / n : 0;
}
