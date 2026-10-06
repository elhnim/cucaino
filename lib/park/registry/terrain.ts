// Cucaino Island's terrain. Round the park (the south-west end of the island): rolling hills and
// valleys, mountains rising behind it to the north, gentle slopes down to the beaches, the Rainbow
// Falls mesa and the beds of the river, the plunge pool, Rainbow Lake and its outlet
// (./waterways.ts) — while every trail, building, land, the plaza and the Dream Park sit on
// smoothly levelled ground so walking stays easy. Beyond the park, the Wildlands (island.ts): the
// Great Ridge of snowy peaks running away to the north-east, a lone peak, the north-west uplands
// and broad rolling plains down to a long coast. `groundY(x, z)` samples a height field that is
// baked lazily, tile by tile, as anything asks for it; far-off ground can use groundYFar(), which
// works the height out on the spot without baking anything. Pure maths, deterministic, no three.js.
import { LANDS, PLACES } from "./places";
import { ISLAND_R, TRAIL_POINTS, coastR, seaDist } from "./island";
import { mesaY, waterBedY, waterSdf } from "./waterways";
import { wildGorgeWallY, wildShelfY } from "./wildWater";
import { RAIL_POINTS, STATIONS, railIndexAt } from "./railway";
import { DREAM_ZONE } from "../builder/rules";
import { SETTLEMENTS, settlePadHeight } from "./settlements";
import { paricutinY } from "./paricutin";
import { CANYON_FOOTPATH, grandCanyonGroundY, nearGrandCanyon } from "./grandCanyon";
import { CART_ROAD } from "./cartRoad";
import { FOOTPATHS } from "./footpaths";
import { rawHeight, smooth, smoothedHeight } from "./landform";
import { kartTrackWorld, KART_PAD_HEIGHT } from "./kartTrack";
import { TRACK_WIDTH } from "../karts/track";

// the natural, unlevelled island (no stamps, no settlements) lives in ./landform.ts — a leaf module
// registry/settlements.ts (and footpaths.ts) can import too, with no cycle back to this file (whose
// own stamps() reads SETTLEMENTS). Re-exported here so anything that already imported these from
// terrain.ts keeps working.
export { rawHeight, smooth };

/** the deepest sea floor (past the reef wall, and off the edge of the height field) */
export const DEEP_FLOOR = -22;
/** the sea's surface height (the water mesh's resting level) */
export const WATER_Y = -0.25;
/** The ocean has no edge: sail, swim or fly past this radius and you come back in from the
 *  opposite side of the world (like going round a little planet) — see wrapWorld(). */
export const WRAP_R = 3600;
/** where you reappear after crossing WRAP_R: the antipode, just inside the edge, same heading */
export function wrapWorld(p: { x: number; z: number }): boolean {
  const r = Math.hypot(p.x, p.z);
  if (r <= WRAP_R) return false;
  const k = -(WRAP_R - 2) / r;
  p.x *= k;
  p.z *= k;
  return true;
}

// ── the height field: a regular grid over the island and its reef, baked lazily ──
/** the grid's cell size (world units) */
export const TERRAIN_CELL = 400 / 319;
/** how far past the coast the field reaches (the reef wall is at +46) */
const FIELD_PAD = 64;
const FIELD = (() => {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let k = 0; k < 2048; k++) {
    const a = (k / 2048) * Math.PI * 2;
    const c = coastR(a);
    x0 = Math.min(x0, Math.sin(a) * c);
    x1 = Math.max(x1, Math.sin(a) * c);
    z0 = Math.min(z0, Math.cos(a) * c);
    z1 = Math.max(z1, Math.cos(a) * c);
  }
  // (snapped to the old little island's grid, so the park's samples sit where they always did)
  const snapLo = (v: number) => -200 + Math.floor((v - FIELD_PAD + 200) / TERRAIN_CELL) * TERRAIN_CELL;
  const ox = snapLo(x0);
  const oz = snapLo(z0);
  return { x0: ox, z0: oz, nx: Math.ceil((x1 + FIELD_PAD - ox) / TERRAIN_CELL) + 1, nz: Math.ceil((z1 + FIELD_PAD - oz) / TERRAIN_CELL) + 1 };
})();
/** the field's first sample (its north-west corner) and its size in samples */
export const TERRAIN_X0 = FIELD.x0;
export const TERRAIN_Z0 = FIELD.z0;
export const TERRAIN_NX = FIELD.nx;
export const TERRAIN_NZ = FIELD.nz;
export const TERRAIN_X1 = TERRAIN_X0 + (TERRAIN_NX - 1) * TERRAIN_CELL;
export const TERRAIN_Z1 = TERRAIN_Z0 + (TERRAIN_NZ - 1) * TERRAIN_CELL;
/** is (x, z) over the height field (else it's the deep sea floor) */
export function inTerrain(x: number, z: number): boolean {
  return x > TERRAIN_X0 && z > TERRAIN_Z0 && x < TERRAIN_X1 && z < TERRAIN_Z1;
}
const CELL = TERRAIN_CELL;

// Nothing is baked up front: a tile of TERRAIN_TILE cells a side is worked out the first time
// anything asks for a height inside it (the park only pays for the ground near the kid, and
// loading stays light however big the island is). Each tile bakes a padded patch, so the soft
// blur and the stamps give exactly the values one whole-grid bake would. Tiles nobody has used
// for a while are let go (a re-bake gives the same values).

/** cells per tile side (a tile holds TERRAIN_TILE + 1 samples a side, sharing its edges with the next) */
export const TERRAIN_TILE = 48;
/** the blur's reach (two passes, one cell each) */
const PAD = 2;
const TILES_X = Math.ceil((TERRAIN_NX - 1) / TERRAIN_TILE);
const TILES_Z = Math.ceil((TERRAIN_NZ - 1) / TERRAIN_TILE);
const TS = TERRAIN_TILE + 1;
const tiles: (Float32Array | undefined)[] = new Array(TILES_X * TILES_Z);
const tileUsed = new Float64Array(TILES_X * TILES_Z);
/** at most this many tiles are kept baked (~10 KB each) */
const KEEP_TILES = 900;
let baked = 0;
let useClock = 0;

interface Stamp {
  x: number;
  z: number;
  rIn: number;
  rOut: number;
  h: number;
  /** (a height worked out only when a tile it reaches is first baked: NaN until then) */
  hf?: () => number;
}
/** a stamp's target height (lazy ones are worked out the first time they're needed) */
const stampH = (st: Stamp) => (st.hf ? ((st.h = st.hf()), (st.hf = undefined), st.h) : st.h);
/** every levelling stamp, in bake order (the strongest wins; on a tie the first), bucketed by tile */
let stampBuckets: Stamp[][] | null = null;
function stamps(): Stamp[][] {
  if (stampBuckets) return stampBuckets;
  const list: Stamp[] = [];
  const stamp = (x: number, z: number, rIn: number, rOut: number, h: number) => list.push({ x, z, rIn, rOut, h });
  // (lazy: far out in the Wildlands, sampling the natural ground there means working out the land
  //  and its water, which the park itself never needs — so only when a tile there is first baked)
  const stampLazy = (x: number, z: number, rIn: number, rOut: number, hf: () => number) => list.push({ x, z, rIn, rOut, h: NaN, hf });
  const sample = (x: number, z: number) => rawHeight(x, z);
  // trails: follow the land softly, so paths roll with the hills but never get steep
  for (const pts of TRAIL_POINTS) {
    const hs = pts.map(([x, z]) => sample(x, z) * 0.55);
    // smooth along the trail
    for (let pass = 0; pass < 6; pass++) for (let i = 1; i + 1 < hs.length; i++) hs[i] = (hs[i - 1] + hs[i] * 2 + hs[i + 1]) / 4;
    pts.forEach(([x, z], i) => stamp(x, z, 2.6, 7, hs[i]));
  }
  // the Wildlands Railway: the ground levelled under the track and the platforms (not over the
  // water: the trestle bridges cross the river and the outlet)
  const RH = railHeights();
  for (let i = 0; i < RAIL_POINTS.length; i++) {
    const [x, z] = RAIL_POINTS[i];
    if (waterSdf(x, z) < 16) continue;
    stamp(x, z, 3.4, 8.5, RH[i] - 0.3);
  }
  for (const st of STATIONS) stamp(st.x, st.z, 14, 21, railY(st.s) - 0.3);
  // lands, places, plaza, Dream Park: flat terraces
  const landH: Record<string, number> = {};
  for (const l of LANDS) {
    // Cucaino Karts is a long thin loop with a big natural infield, not a compact cluster of
    // buildings like every other land here — levelling the WHOLE land disc flat (radius 95, out to
    // 105) reached all the way to Park Station and starved it of the gentle ground its own dragon
    // needs. Its ground is levelled separately, in a narrow band that follows the actual track (see
    // the kart track stamps below), so this land contributes no disc of its own.
    if (l.id === "karts") {
      landH[l.id] = KART_PAD_HEIGHT;
      continue;
    }
    const h = l.id === "gate" ? 0 : sample(l.x, l.z) * 0.45;
    landH[l.id] = h;
    stamp(l.x, l.z, l.radius + 1, l.radius + 10, h);
  }
  // Cucaino Karts: the outdoor scenery is a flat ribbon mesh at a fixed world Y
  // (lib/park/world/karts/index.ts, like mini golf's own room floor), so the real ground under it
  // is levelled the same way the railway levels under its own track — a narrow band following the
  // loop, not a disc, so it never floats over a dip, digs into a rise, or crowds out anything sited
  // nearby on the real ground.
  for (const pt of kartTrackWorld().points) stamp(pt.x, pt.z, TRACK_WIDTH / 2 + 3, TRACK_WIDTH / 2 + 11, KART_PAD_HEIGHT);
  for (const p of PLACES) if (!p.sky) stamp(p.x, p.z, p.radius + 2, p.radius + 7, landH[p.land] ?? 0);
  stamp(0, 0, 13, 24, 0);
  // Wildlands settlements: the ground under the fire/plaza, every hut and every work spot but the
  // fishing one (its pier crosses the real shore on purpose, sloping down to the water like any
  // beach) is gently levelled to ONE shared pad height per settlement (registry/landform.ts's
  // smoothedHeight at the settlement's own centre) — every hut and work spot settling to the SAME
  // number, not its own local sample, is what keeps neighbouring huts from stepping against each
  // other (a village is sited somewhere the real ground is already gentle — registry/settlements.ts
  // — so one shared pad reads as natural, not a sunken disc). Never below the waterline; a stilt
  // hut right at the water keeps its own lower floor (it's sited BY the shore on purpose, where the
  // land is falling away to the lake, so it needs its own locally-smoothed height, not the pad's).
  for (const st of SETTLEMENTS) {
    const padH = () => settlePadHeight(st.style, st.x, st.z);
    stampLazy(st.x, st.z, 7, 22, padH);
    for (const hut of st.huts) {
      if (hut.shore) {
        stampLazy(hut.x, hut.z, hut.size + 2.6, hut.size + 13, () => Math.max(smoothedHeight(hut.x, hut.z) * 0.75, WATER_Y + 0.45));
      } else {
        stampLazy(hut.x, hut.z, hut.size + 2.6, hut.size + 11, padH);
      }
    }
    for (const w of st.work) {
      if (w.id === "fishing") continue;
      stampLazy(w.x, w.z, 3.2, 14, padH);
    }
    // any extra area a settlement wants levelled flush with its own pad (Highstone's yak pasture,
    // which reaches further out than any one hut/work spot's own stamp) — registry/settlements.ts
    for (const lp of st.levelPatches) stampLazy(lp.x, lp.z, lp.rIn, lp.rOut, lp.h !== undefined ? () => lp.h! : padH);
  }
  // the Lakeside <-> Market Street cart road (registry/cartRoad.ts): levelled gently like a trail,
  // each point settling to a SMOOTHED version of its own natural height (not sampled until its
  // tile is actually baked — the road runs most of its length out in the Wildlands, and nothing
  // there should cost anything until the kid is close enough to see it). Skip the stretch already
  // inside a land's own flat terrace (it heads straight for Market Street's) — stamping both there
  // would just have the two fight over the same ground.
  // (no height is scaled down here, unlike a park trail's gentle *0.55: out in the Wildlands the
  // land itself rolls a lot more, and shrinking it would cut a cliff-like step at the road's
  // edge — a wide, soft blend (rOut 11) just lets the road follow a locally-smoothed version of
  // whatever the land is already doing)
  for (const [x, z] of CART_ROAD.points) {
    if (LANDS.some((l) => Math.hypot(x - l.x, z - l.z) < l.radius + 10)) continue;
    stampLazy(x, z, 2.2, 11, () => Math.max(smoothedHeight(x, z), WATER_Y + 0.5));
  }
  // every other settlement's own footpath to its station (registry/footpaths.ts) — narrower than
  // the cart road (a kid's and a trader's own walk, not a cart's), same lazy local-smoothed levelling
  for (const fp of FOOTPATHS) for (const [x, z] of fp.points) stampLazy(x, z, 1.6, 8, () => Math.max(smoothedHeight(x, z), WATER_Y + 0.5));
  // the Grand Canyon's own footpath in from Park Station (registry/grandCanyon.ts's
  // CANYON_FOOTPATH — it has to go round the Great Ridge's own south-western tail, not through it,
  // so it's authored separately from the settlements' short footpaths.ts walks). Stops short of the
  // canyon's own footprint: the rim there is already gentle, carved ground (grandCanyonGroundY,
  // above) — levelling it again with the natural, pre-carve smoothedHeight would dig a pit right at
  // the trailhead.
  for (const [x, z] of CANYON_FOOTPATH) {
    if (nearGrandCanyon(x, z, 40)) continue;
    stampLazy(x, z, 1.6, 8, () => Math.max(smoothedHeight(x, z), WATER_Y + 0.5));
  }
  const dz = { cx: DREAM_ZONE.x0 + (DREAM_ZONE.cols * DREAM_ZONE.cell) / 2, cz: DREAM_ZONE.z0 + (DREAM_ZONE.rows * DREAM_ZONE.cell) / 2 };
  stamp(dz.cx, dz.cz, DREAM_ZONE.cols * DREAM_ZONE.cell * 0.75, DREAM_ZONE.cols * DREAM_ZONE.cell * 0.75 + 8, landH.dream ?? 0);
  // (each stamp goes in every tile whose padded patch it reaches, keeping the bake order)
  const b: Stamp[][] = Array.from({ length: TILES_X * TILES_Z }, () => []);
  const tw = TERRAIN_TILE * CELL;
  for (const st of list) {
    const lo = (v: number, o: number) => Math.floor((v - st.rOut - o) / tw) - 1;
    const hi = (v: number, o: number) => Math.floor((v + st.rOut - o) / tw) + 1;
    for (let tj = Math.max(0, lo(st.z, TERRAIN_Z0)); tj <= Math.min(TILES_Z - 1, hi(st.z, TERRAIN_Z0)); tj++)
      for (let ti = Math.max(0, lo(st.x, TERRAIN_X0)); ti <= Math.min(TILES_X - 1, hi(st.x, TERRAIN_X0)); ti++) {
        const x0 = TERRAIN_X0 + (ti * TERRAIN_TILE - PAD - 1) * CELL;
        const z0 = TERRAIN_Z0 + (tj * TERRAIN_TILE - PAD - 1) * CELL;
        const x1 = TERRAIN_X0 + (ti * TERRAIN_TILE + TERRAIN_TILE + PAD + 1) * CELL;
        const z1 = TERRAIN_Z0 + (tj * TERRAIN_TILE + TERRAIN_TILE + PAD + 1) * CELL;
        if (st.x + st.rOut < x0 || st.x - st.rOut > x1 || st.z + st.rOut < z0 || st.z - st.rOut > z1) continue;
        b[tj * TILES_X + ti].push(st);
      }
  }
  stampBuckets = b;
  return b;
}

// ── the railway's rails: their height along the loop, from the land under them ──
let railH: Float32Array | null = null;
/** the rails' height at every RAIL_POINTS point: the wild land under them, smoothed a long way
 *  and kept to a gentle grade (a toy steam train can't climb cliffs), at least a few metres over
 *  any water it bridges */
export function railHeights(): Float32Array {
  if (railH) return railH;
  const n = RAIL_POINTS.length;
  let h: Float32Array = new Float32Array(n);
  for (let i = 0; i < n; i++) h[i] = Math.max(rawHeight(RAIL_POINTS[i][0], RAIL_POINTS[i][1]), WATER_Y + 1.2) + 0.35;
  // (a long running average, round the loop)
  const W = 12;
  for (let pass = 0; pass < 4; pass++) {
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -W; k <= W; k++) sum += h[(i + k + n) % n];
      o[i] = sum / (2 * W + 1);
    }
    h = o;
  }
  // over the water: well clear of it (the bridges)
  for (let i = 0; i < n; i++) {
    const [x, z] = RAIL_POINTS[i];
    const ws = waterSdf(x, z);
    if (ws < 30) h[i] = Math.max(h[i], WATER_Y + 3.6 * (1 - smooth(10, 30, ws)) + (h[i] - WATER_Y) * smooth(10, 30, ws));
  }
  // at most a 4% grade, both ways round (each segment by its own length; until it settles)
  const segL = new Float32Array(n);
  for (let i = 0; i < n; i++) segL[i] = Math.hypot(RAIL_POINTS[(i + 1) % n][0] - RAIL_POINTS[i][0], RAIL_POINTS[(i + 1) % n][1] - RAIL_POINTS[i][1]);
  for (let pass = 0; pass < 30; pass++) {
    let changed = false;
    for (let i = 1; i <= 2 * n; i++) {
      const a = (i - 1) % n;
      const k = i % n;
      const lim = h[a] - 0.04 * segL[a];
      if (h[k] < lim) {
        h[k] = lim;
        changed = true;
      }
    }
    for (let i = 2 * n - 1; i >= 0; i--) {
      const k = i % n;
      const b = (i + 1) % n;
      const lim = h[b] - 0.04 * segL[k];
      if (h[k] < lim) {
        h[k] = lim;
        changed = true;
      }
    }
    if (!changed) break;
  }
  railH = h;
  return h;
}
/** the rails' height at distance s along the loop */
export function railY(s: number): number {
  const H = railHeights();
  const { i, u } = railIndexAt(s);
  return H[i] + (H[(i + 1) % H.length] - H[i]) * u;
}

/** Rainbow Falls' mesa rises out of the west coast; the waterways are carved in; and no other
 *  inland hollow dips below the waterline (the only inland water is the river, the pool and the
 *  lake, so you never "swim" on dry grass) — the last step for every sample, on its own */
function finish(x: number, z: number, h: number): number {
  const r = Math.hypot(x, z);
  const inland = 1 - smooth(-7, -2, seaDist(x, z));
  // (the park's river, falls and lake, and the Wildlands' great river, falls and lake: each answers
  // at once anywhere away from its own box)
  const bed = waterBedY(x, z);
  if (bed !== null) {
    // inland the beds are shaped exactly (an old hollow mustn't make a deep hole in the
    // lake's shallows); out by the sea the outlet only ever carves down
    const carved = Math.min(h, bed);
    h = waterSdf(x, z) < 0 ? carved + (bed - carved) * inland : carved;
  }
  // (the mesa after the carving: its cliffs stand right down into the plunge pool)
  const m = r < ISLAND_R + 60 ? mesaY(x, z, h) : wildShelfY(x, z, h);
  if (m !== null) h = Math.max(h, m);
  // the Batoka Gorge's own tall rock walls, flanking the river's narrow first stretch (Agent V)
  const gw = wildGorgeWallY(x, z, h);
  if (gw !== null) h = Math.max(h, gw);
  // Parícutin: the cinder cone + its lava field apron, raised the same way
  const pv = paricutinY(x, z, h);
  if (pv !== null) h = Math.max(h, pv);
  // the Grand Canyon: its own plateau raise, carved down by the main gorge, its two side canyons
  // and the buttes (Agent G) — a full replacement of the sample, not a min()/max(), since nothing
  // else out in the high north-western uplands reaches this far (registry/grandCanyon.ts's
  // findGrandCanyonSite keeps it clear of everything else with a wide margin)
  const gc = grandCanyonGroundY(x, z, h);
  if (gc !== null) h = gc;
  if (inland > 0) {
    const d = bed === null ? 9 : waterSdf(x, z);
    const floor = WATER_Y + 0.35 + 0.04 * Math.min(Math.max(d, 0), 6);
    if (d > 0.4 && h < floor) h += (floor - h) * inland;
  }
  return h;
}

/** bake one tile: its padded patch of the field, levelled, blurred and carved; returns its samples */
function bakeTile(ti: number, tj: number): Float32Array {
  // the padded patch, in whole-grid indices (clamped to the grid: its outer rim is never blurred)
  const pi0 = Math.max(0, ti * TERRAIN_TILE - PAD);
  const pj0 = Math.max(0, tj * TERRAIN_TILE - PAD);
  const pi1 = Math.min(TERRAIN_NX - 1, ti * TERRAIN_TILE + TERRAIN_TILE + PAD);
  const pj1 = Math.min(TERRAIN_NZ - 1, tj * TERRAIN_TILE + TERRAIN_TILE + PAD);
  const W = pi1 - pi0 + 1;
  const H = pj1 - pj0 + 1;
  const raw = new Float32Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) raw[j * W + i] = rawHeight(TERRAIN_X0 + (pi0 + i) * CELL, TERRAIN_Z0 + (pj0 + j) * CELL);

  // level the walkable things: stamp "target height + weight" discs, then blend
  const target = new Float32Array(W * H);
  const weight = new Float32Array(W * H);
  for (const st of stamps()[tj * TILES_X + ti]) {
    const i0 = Math.max(pi0, Math.floor((st.x - st.rOut - TERRAIN_X0) / CELL));
    const i1 = Math.min(pi1, Math.ceil((st.x + st.rOut - TERRAIN_X0) / CELL));
    const j0 = Math.max(pj0, Math.floor((st.z - st.rOut - TERRAIN_Z0) / CELL));
    const j1 = Math.min(pj1, Math.ceil((st.z + st.rOut - TERRAIN_Z0) / CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(TERRAIN_X0 + i * CELL - st.x, TERRAIN_Z0 + j * CELL - st.z);
        if (d > st.rOut) continue;
        const w = 1 - smooth(st.rIn, st.rOut, d);
        const k = (j - pj0) * W + (i - pi0);
        if (w > weight[k]) {
          // the strongest stamp wins (a land beats the trail running into it)
          target[k] = stampH(st);
          weight[k] = w;
        }
      }
  }
  const out = new Float32Array(W * H);
  for (let k = 0; k < out.length; k++) out[k] = raw[k] + (target[k] - raw[k]) * weight[k];
  // two soft blur passes so nothing has a hard edge (except the mountain cliffs, which stay bold)
  // (the grid's own outer rim is never blurred; the patch's padding soaks up the patch's rim)
  const tmp = new Float32Array(W * H);
  for (let pass = 0; pass < 2; pass++) {
    tmp.set(out);
    for (let j = 1; j < H - 1; j++)
      for (let i = 1; i < W - 1; i++) {
        const k = j * W + i;
        tmp[k] = (out[k] * 4 + out[k - 1] + out[k + 1] + out[k - W] + out[k + W]) / 8;
      }
    out.set(tmp);
  }
  const tile = new Float32Array(TS * TS).fill(DEEP_FLOOR);
  for (let j = 0; j < TS; j++) {
    const gj = tj * TERRAIN_TILE + j;
    if (gj > TERRAIN_NZ - 1) break;
    for (let i = 0; i < TS; i++) {
      const gi = ti * TERRAIN_TILE + i;
      if (gi > TERRAIN_NX - 1) break;
      tile[j * TS + i] = finish(TERRAIN_X0 + gi * CELL, TERRAIN_Z0 + gj * CELL, out[(gj - pj0) * W + (gi - pi0)]);
    }
  }
  return tile;
}

// ── which tiles the island's ground covers: the land and its reef. The rest of the rectangle is
// open deep sea (about half of it): never baked — it's DEEP_FLOOR, drawn by the deep sea floor
// (lib/park/world/sea/deepFloor.ts) along with the other islands' slopes ──
let cover: Uint8Array | null = null;
const DEEP_TILE = new Float32Array(TS * TS).fill(DEEP_FLOOR);
function coverGrid(): Uint8Array {
  if (cover) return cover;
  const c = new Uint8Array(TILES_X * TILES_Z);
  const tw = TERRAIN_TILE * CELL;
  // (a tile is covered if any of it, padding and all, is within the reef's reach of the coast — the
  // reef wall ends 46 m out — checked at points across it, with a margin for the blur and the
  // coast's wobble between them)
  const reach = 46 + 6 + (PAD + 1) * CELL;
  for (let tj = 0; tj < TILES_Z; tj++)
    for (let ti = 0; ti < TILES_X; ti++) {
      let hit = false;
      for (let v = 0; v <= 6 && !hit; v++)
        for (let u = 0; u <= 6 && !hit; u++) {
          const x = TERRAIN_X0 + (ti + u / 6) * tw;
          const z = TERRAIN_Z0 + (tj + v / 6) * tw;
          if (seaDist(x, z) < reach + tw / 12) hit = true;
        }
      if (hit) c[tj * TILES_X + ti] = 1;
    }
  cover = c;
  return c;
}
/** the cover grid, for the shaders: one byte per tile (1 = the island's ground is drawn there),
 *  tile (ti, tj) spanning x from TERRAIN_X0 + ti * size (and z likewise) */
export function terrainCoverGrid(): { data: Uint8Array; nx: number; nz: number; size: number } {
  return { data: coverGrid(), nx: TILES_X, nz: TILES_Z, size: TERRAIN_TILE * CELL };
}
/** is the island's ground (land or reef) drawn at (x, z)? (else it's the open deep sea floor) */
export function terrainCovers(x: number, z: number): boolean {
  if (!inTerrain(x, z)) return false;
  const tw = TERRAIN_TILE * CELL;
  return coverGrid()[Math.floor((z - TERRAIN_Z0) / tw) * TILES_X + Math.floor((x - TERRAIN_X0) / tw)] === 1;
}

function tileAt(ti: number, tj: number): Float32Array {
  const k = tj * TILES_X + ti;
  if (!coverGrid()[k]) return DEEP_TILE;
  let t = tiles[k];
  tileUsed[k] = ++useClock;
  if (!t) {
    if (baked >= KEEP_TILES) evict();
    t = bakeTile(ti, tj);
    tiles[k] = t;
    baked++;
  }
  return t;
}
/** let the least recently used quarter of the tiles go */
function evict() {
  const used: number[] = [];
  for (let k = 0; k < tiles.length; k++) if (tiles[k]) used.push(tileUsed[k]);
  used.sort((a, b) => a - b);
  const cut = used[Math.floor(used.length / 4)];
  for (let k = 0; k < tiles.length; k++)
    if (tiles[k] && tileUsed[k] <= cut) {
      tiles[k] = undefined;
      baked--;
    }
  lastK = -1;
}

/** Bake ahead: up to `max` of the not-yet-baked tiles within `r` of (x, z), nearest first, so the
 *  ground near the kid is ready before anything needs it (call it with spare time each frame).
 *  Returns how many it baked. */
export function terrainPrefetch(x: number, z: number, r: number, max = 1): number {
  const tw = TERRAIN_TILE * CELL;
  const c = coverGrid();
  const ti0 = Math.max(0, Math.floor((x - r - TERRAIN_X0) / tw));
  const ti1 = Math.min(TILES_X - 1, Math.floor((x + r - TERRAIN_X0) / tw));
  const tj0 = Math.max(0, Math.floor((z - r - TERRAIN_Z0) / tw));
  const tj1 = Math.min(TILES_Z - 1, Math.floor((z + r - TERRAIN_Z0) / tw));
  let made = 0;
  while (made < max) {
    let best = -1;
    let bd = Infinity;
    for (let tj = tj0; tj <= tj1; tj++)
      for (let ti = ti0; ti <= ti1; ti++) {
        const k = tj * TILES_X + ti;
        if (!c[k] || tiles[k]) continue;
        const d = Math.hypot(TERRAIN_X0 + (ti + 0.5) * tw - x, TERRAIN_Z0 + (tj + 0.5) * tw - z);
        if (d < r + tw * 0.71 && d < bd) {
          bd = d;
          best = k;
        }
      }
    if (best < 0) break;
    tileAt(best % TILES_X, Math.floor(best / TILES_X));
    made++;
  }
  return made;
}

/** how many of the field's tiles are baked right now (load-cost checks) */
export function terrainTilesBaked(): number {
  return baked;
}

/** the height at grid sample (i, j) — DEEP_FLOOR off the grid */
export function terrainSample(i: number, j: number): number {
  if (i < 0 || j < 0 || i > TERRAIN_NX - 1 || j > TERRAIN_NZ - 1) return DEEP_FLOOR;
  const ti = Math.min(TILES_X - 1, Math.floor(i / TERRAIN_TILE));
  const tj = Math.min(TILES_Z - 1, Math.floor(j / TERRAIN_TILE));
  return tileAt(ti, tj)[(j - tj * TERRAIN_TILE) * TS + (i - ti * TERRAIN_TILE)];
}

// (a one-tile memo: most lookups land in the same tile as the last one)
let lastK = -1;
let lastT: Float32Array = new Float32Array(TS * TS);

/** ground height at (x, z) — everything that stands on the island uses this */
export function groundY(x: number, z: number): number {
  const fx = (x - TERRAIN_X0) / CELL;
  const fz = (z - TERRAIN_Z0) / CELL;
  if (!(fx >= 0 && fz >= 0 && fx < TERRAIN_NX - 1 && fz < TERRAIN_NZ - 1)) return DEEP_FLOOR;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const ti = (i / TERRAIN_TILE) | 0;
  const tj = (j / TERRAIN_TILE) | 0;
  const tk = tj * TILES_X + ti;
  let g = lastT;
  if (tk !== lastK || !tiles[tk]) {
    g = tileAt(ti, tj);
    lastK = tk;
    lastT = g;
  }
  const u = fx - i;
  const v = fz - j;
  const k = (j - tj * TERRAIN_TILE) * TS + (i - ti * TERRAIN_TILE);
  return (g[k] * (1 - u) + g[k + 1] * u) * (1 - v) + (g[k + TS] * (1 - u) + g[k + TS + 1] * u) * v;
}

/** The ground's height at (x, z) worked out on the spot (no tiles baked): everything but the soft
 *  blur, so it's within a few centimetres of groundY() — for far-off ground and maps. */
export function groundYFar(x: number, z: number): number {
  if (!terrainCovers(x, z)) return DEEP_FLOOR;
  let h = rawHeight(x, z);
  const ti = Math.floor((x - TERRAIN_X0) / CELL / TERRAIN_TILE);
  const tj = Math.floor((z - TERRAIN_Z0) / CELL / TERRAIN_TILE);
  let w = 0;
  let target = 0;
  for (const st of stamps()[Math.min(TILES_Z - 1, tj) * TILES_X + Math.min(TILES_X - 1, ti)]) {
    const d = Math.hypot(x - st.x, z - st.z);
    if (d > st.rOut) continue;
    const s = 1 - smooth(st.rIn, st.rOut, d);
    if (s > w) {
      w = s;
      target = stampH(st);
    }
  }
  h += (target - h) * w;
  return finish(x, z, h);
}

/** how steep the ground is at (x, z): 0 flat .. 1 cliff (for rock vs grass colouring) */
export function slopeAt(x: number, z: number): number {
  const e = CELL;
  const dx = groundY(x + e, z) - groundY(x - e, z);
  const dz = groundY(x, z + e) - groundY(x, z - e);
  return Math.min(1, Math.hypot(dx, dz) / (2 * e) / 1.4);
}

export const ISLAND_RADIUS = ISLAND_R;
