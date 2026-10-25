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
//   B_KEEP    the park's own "keep clear" ground (the free() rule: rides parked in the meadows,
//             the Sky Coaster's corridor, ruins ...) — trails and their verges excepted
//   B_WET     inland water: the meadow lakes (the sea's beaches don't count)
//   B_SHORE   dry ground right at the edge of the pond, the stream or a lake (drinking spots)
//   B_JUNGLE  under the rainforest's canopy (lib/park/registry/jungle.ts)
import { ISLAND_R, POND, STREAM_POINTS, STREAM_WIDTH, seaDist } from "../../registry/island";
import { LANDS, PLACES } from "../../registry/places";
import { zoneBounds } from "../../builder/rules";
import { WATER_Y, groundY, slopeAt } from "../../registry/terrain";
import { fieldAt, gridIndex, openFields, type FreeFn } from "../storybook/plan";
import { waterSdf } from "../../registry/waterways";
import { underCanopy } from "../../registry/jungle";

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
export const B_KEEP = 128;
export const B_WET = 256;
export const B_SHORE = 512;
/** under the rainforest's canopy (its trails included): too close-packed for the safari's giants */
export const B_JUNGLE = 1024;

export interface WalkGrid {
  bits: Uint16Array;
  /** slope 0..1 quantised to 0..255 */
  slope: Uint8Array;
  /**
   * Head room: how high (0.1-unit steps above the ground) the lowest leaves hang over each cell —
   * the storybook trees' crowns (a little wider than the leaves, for a reaching head) and the
   * rainforest's canopy. 255 = open sky. A tall animal only walks where its head clears them.
   */
  crown: Uint8Array;
  /** the pond's water surface */
  pondY: number;
}

/** a tree whose crown the animals keep their heads out of (the storybook forest's) */
export interface CrownTree {
  x: number;
  z: number;
  y: number;
  kind: number;
  s: number;
  sy: number;
}

/** the rainforest's leaves hang this low (units) — and its edge trees reach this far out over the meadow */
export const JUNGLE_CROWN = 4.5;
const JUNGLE_REACH = 3;
/** how far past its leaves a crown counts (a head reaching forward, a neck swinging round) */
export const CROWN_PAD = 0.7;

/**
 * The lowest leaves of a storybook tree at `rho` units from its trunk, above the tree's foot
 * (matches storybook/geometry.ts buildForestTree: round crowns are squashed spheres, pines
 * stacked cones from 1.2 up), and how far out its crown reaches. Unit-scale numbers × t.s.
 */
export function crownShape(kind: number): { r: number; cy: number; ry: number; cone: boolean } {
  if (kind === 0) return { r: 1.85, cy: 3.35, ry: 1.6, cone: false };
  if (kind === 1) return { r: 1.75, cy: 3.15, ry: 1.4, cone: false };
  if (kind === 2) return { r: 1.4, cy: 3.5, ry: 1.25, cone: false };
  return { r: kind === 4 ? 1.25 : 1.75, cy: kind === 4 ? 1.3 : 1.2, ry: 0, cone: true };
}

/** bake the head room grid (see WalkGrid.crown) */
function bakeCrowns(crown: Uint8Array, trees: readonly CrownTree[]) {
  crown.fill(255);
  for (const t of trees) {
    const c = crownShape(t.kind);
    const rx = c.r * t.s;
    const R = rx + CROWN_PAD;
    const foot = t.y - 0.15 * t.s;
    const i0 = Math.max(0, Math.floor(t.x - R + WHALF));
    const i1 = Math.min(WN - 1, Math.floor(t.x + R + WHALF));
    const j0 = Math.max(0, Math.floor(t.z - R + WHALF));
    const j1 = Math.min(WN - 1, Math.floor(t.z + R + WHALF));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = -WHALF + i + 0.5;
        const z = -WHALF + j + 0.5;
        const rho = Math.hypot(x - t.x, z - t.z);
        if (rho > R) continue;
        // (inside the leaves: the squashed sphere's underside; in the pad: its rim)
        const u = Math.min(1, rho / rx);
        const under = c.cone ? c.cy : c.cy - c.ry * Math.sqrt(1 - u * u);
        const h = foot + under * t.s * t.sy - groundY(x, z);
        const q = Math.max(0, Math.min(254, Math.round(h * 10)));
        const k = j * WN + i;
        if (q < crown[k]) crown[k] = q;
      }
  }
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
  if (seaDist(x, z) > -2.5) return false;
  if (groundY(x, z) < WATER_Y + 0.3) return false;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.3) return false;
  if (waterSdf(x, z) < 0.35) return false;
  return true;
}

const ZB = zoneBounds();
/** inside (or within half a metre of) a land, a place, the plaza or the Dream Park */
function nearLand(x: number, z: number): boolean {
  if (x > ZB.minX - 0.8 && x < ZB.maxX + 0.8 && z > ZB.minZ - 0.8 && z < ZB.maxZ + 0.8) return true;
  if (x * x + z * z < 14.5 * 14.5) return true;
  for (const l of LANDS) if ((x - l.x) ** 2 + (z - l.z) ** 2 < (l.radius + 0.6) ** 2) return true;
  for (const p of PLACES) if (!p.sky && (x - p.x) ** 2 + (z - p.z) ** 2 < (Math.max(p.radius, 1.5) + 1.6) ** 2) return true;
  return false;
}

/**
 * Bake the grid. `covered` is the storybook forest's canopy grid (its 2 m grid, 1 = under a tree);
 * pass null to treat everything as open. `free` is the park's placement rule: where it says no
 * (away from the trails) the ground is B_KEEP.
 */
export function buildWalkGrid(covered: Uint8Array | null, obstacles: readonly { x: number; z: number; r: number }[] = [], free?: FreeFn, trees: readonly CrownTree[] = []): WalkGrid {
  const f = openFields();
  const bits = new Uint16Array(WN * WN);
  const slope = new Uint8Array(WN * WN);
  const crown = new Uint8Array(WN * WN);
  bakeCrowns(crown, trees);
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
      if (sd < STREAM_WIDTH / 2 || (nearS && waterSdf(x, z) < 0 && groundY(x, z) < WATER_Y)) b |= B_STREAM;
      const shore = seaDist(x, z);
      const low = lowest(x, z);
      const lf = fieldAt(f.land, x, z);
      // (near a land's edge the 2 m distance field is coarse: check the real shapes)
      const land = shore < -2.5 && low > WATER_Y + 0.4 && pd > POND.r + 0.3 && waterSdf(x, z) > 0.35 && lf > 0 && (lf > 5 || !nearLand(x, z));
      if (land) {
        b |= B_LAND;
        if (waterSdf(x, z) < 2.6) b |= B_BANK;
      } else if (shore < -8 && groundY(x, z) < WATER_Y - 0.05) b |= B_WET;
      const g = gridIndex(x, z);
      if (!covered || g < 0 || !covered[g]) b |= B_OPEN;
      if (fieldAt(f.trail, x, z) < 2.1) b |= B_TRAIL;
      if (underCanopy(x, z)) b |= B_JUNGLE;
      bits[k] = b;
    }
  }
  // the rainforest's roof (and the edge trees' boughs, reaching a few metres out over the meadow)
  const JQ = Math.round(JUNGLE_CROWN * 10);
  for (let j = 0; j < WN; j++)
    for (let i = 0; i < WN; i++) {
      if (!(bits[j * WN + i] & B_JUNGLE)) continue;
      for (let dj = -JUNGLE_REACH; dj <= JUNGLE_REACH; dj++)
        for (let di = -JUNGLE_REACH; di <= JUNGLE_REACH; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= WN || jj >= WN || di * di + dj * dj > JUNGLE_REACH * JUNGLE_REACH) continue;
          const k = jj * WN + ii;
          if (crown[k] > JQ) crown[k] = JQ;
        }
    }
  // the shore: dry land with water a step or two away
  const WATERY = B_WET | B_POND | B_STREAM;
  for (let j = 4; j < WN - 4; j++)
    for (let i = 4; i < WN - 4; i++) {
      const k = j * WN + i;
      if (!(bits[k] & B_LAND)) continue;
      for (let d = 2; d <= 4; d++) {
        const D = d * WN;
        if (bits[k + d] & WATERY || bits[k - d] & WATERY || bits[k + D] & WATERY || bits[k - D] & WATERY || bits[k + d + D] & WATERY || bits[k - d - D] & WATERY || bits[k + d - D] & WATERY || bits[k - d + D] & WATERY) {
          bits[k] |= B_SHORE;
          break;
        }
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
  // the park's keep-clear ground (2 m cells; trails and their verges are always crossable)
  if (free)
    for (let j = 0; j < WN; j += 2)
      for (let i = 0; i < WN; i += 2) {
        const k = j * WN + i;
        const any = (bits[k] | bits[k + 1] | bits[k + WN] | bits[k + WN + 1]) & B_LAND;
        if (!any) continue;
        const x = -WHALF + i + 1;
        const z = -WHALF + j + 1;
        // (the stream and the pond are water already; their banks are fine)
        if (fieldAt(f.trail, x, z) < 3.6 || fieldAt(f.stream, x, z) < 6) continue;
        if (free(x, z, 0.6)) continue;
        bits[k] |= B_KEEP;
        bits[k + 1] |= B_KEEP;
        bits[k + WN] |= B_KEEP;
        bits[k + WN + 1] |= B_KEEP;
      }
  // (the pond is a bay of Rainbow Lake now: its surface is the water's, not the deep bed's)
  return { bits, slope, crown, pondY: Math.max(groundY(POND.x, POND.z), WATER_Y) + 0.065 };
}

/** head room over (x, z) in units (see WalkGrid.crown; 25.5 = open sky) */
export function headroomAt(g: WalkGrid, x: number, z: number): number {
  const i = Math.floor(x + WHALF);
  const j = Math.floor(z + WHALF);
  if (i < 0 || j < 0 || i >= WN || j >= WN) return 25.5;
  return g.crown[j * WN + i] / 10;
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

/** ground a walking animal may use (no water, lands, obstacles or keep-clear ground) */
export const walkable = (b: number) => (b & (B_LAND | B_BLOCK | B_KEEP)) === B_LAND;
