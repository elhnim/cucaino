// My Home: pure placement rules (no three.js, no I/O). Shared by the 3D room (ghost preview,
// walking), the decorating bar and the server actions (authoritative checks). Unit tested.
//
// The cottage is two rooms side by side, joined by an arch in the wall between them:
//
//     x: -9.5 ............ -0.5 | 0.5 ............. 9.5      (back wall at z = -4)
//        [    My Bedroom      ] ▒ [    Pet Corner      ]      rows 0..7 run from the back wall
//         cols 0..8             ▒  cols 0..8                  towards the camera (z = +4)
//                              arch (rows 3–4)                front door: Pet Corner back wall
//
// Each room is a grid of 1 x 1 cells. Floor items cover w x d cells (swapped when turned a
// quarter); rugs sit underneath furniture; wall items take `w` slots along one of the room's
// walls (never over a window or the door). A few floor cells stay clear (the arch and the space
// inside the front door), and solid furniture may never cut the door off from the arch.
import { getHomeItem, isPlaceable, isSolid, isStyle, type HomeItemDef } from "./catalog";

export type RoomId = "bedroom" | "den";
export type WallId = "back" | "left" | "right";

export interface RoomDef {
  id: RoomId;
  name: string;
  emoji: string;
  /** world x of the room's left edge; z0 is the back wall */
  x0: number;
  z0: number;
  cols: number;
  rows: number;
  /** walls you can hang things on */
  walls: WallId[];
}

export const CELL = 1;
export const WALL_H = 3.8;
export const ROOM_IDS: RoomId[] = ["bedroom", "den"];
export const ROOMS: Record<RoomId, RoomDef> = {
  bedroom: { id: "bedroom", name: "My Bedroom", emoji: "🛏️", x0: -9.5, z0: -4, cols: 9, rows: 8, walls: ["back", "left"] },
  den: { id: "den", name: "Pet Corner", emoji: "🐾", x0: 0.5, z0: -4, cols: 9, rows: 8, walls: ["back", "right"] },
};

/** windows and the front door, as slot ranges along each wall (inclusive) */
export interface WallFeature {
  from: number;
  to: number;
  kind: "window" | "door";
}
export const WALL_FEATURES: Record<RoomId, Partial<Record<WallId, WallFeature[]>>> = {
  bedroom: { back: [{ from: 3, to: 5, kind: "window" }], left: [{ from: 2, to: 4, kind: "window" }] },
  den: {
    back: [
      { from: 1, to: 3, kind: "window" },
      { from: 6, to: 7, kind: "door" },
    ],
    right: [{ from: 3, to: 5, kind: "window" }],
  },
};

/** rows of the arch through the middle wall */
export const ARCH_ROWS = [3, 4];

/** floor cells that always stay clear (except for rugs): beside the arch, inside the front door */
export const RESERVED: Record<RoomId, [number, number][]> = {
  bedroom: [
    [8, 3],
    [8, 4],
  ],
  den: [
    [0, 3],
    [0, 4],
    [6, 0],
    [7, 0],
    [6, 1],
    [7, 1],
  ],
};

/** where the kid appears: just inside the front door */
export const SPAWN = { x: 7.5, z: -2.5 };

export const MAX_PLACED = 80;
export const MAX_PER_ROOM = 45;

export interface HomePlaced {
  uid: string;
  item: string;
  room: RoomId;
  /** floor: cell column; wall: first slot along the wall */
  gx: number;
  /** floor: cell row (0 = against the back wall); wall: 0 */
  gz: number;
  /** quarter turns 0..3 (wall items: 0) */
  r: number;
  /** set for wall items */
  wall?: WallId;
}

export interface RoomStyle {
  wall: string;
  floor: string;
}

/** what's saved in kid_parks.home */
export interface HomeLayout {
  v: 1;
  placed: HomePlaced[];
  rooms: Record<RoomId, RoomStyle>;
}

/** what's saved in kid_parks.home_owned: copies bought, per item id */
export type Owned = Record<string, number>;

export const DEFAULT_STYLES: Record<RoomId, RoomStyle> = {
  bedroom: { wall: "wp-stripes", floor: "fl-wood" },
  den: { wall: "wp-cream", floor: "fl-checker" },
};

// ───────────────────────────── footprints & coordinates ─────────────────────────────

export function footprint(def: Pick<HomeItemDef, "w" | "d">, r: number): { w: number; d: number } {
  return ((r % 4) + 4) % 2 === 0 ? { w: def.w, d: def.d } : { w: def.d, d: def.w };
}

export function wallLength(room: RoomId, wall: WallId): number {
  const R = ROOMS[room];
  return wall === "back" ? R.cols : R.rows;
}

function floorCells(def: HomeItemDef, gx: number, gz: number, r: number): [number, number][] {
  const { w, d } = footprint(def, r);
  const out: [number, number][] = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) out.push([gx + i, gz + j]);
  return out;
}

/** World-space centre + facing of a placed item (floor items: y = 0; wall items: on the wall). */
/**
 * The side walls are splayed outward like a dollhouse's (hinged at the back corners, the front ends
 * swung out by this angle), so they turn toward the camera at the front and what hangs on them reads
 * (instead of being seen edge-on).
 */
export const SIDE_SPLAY = 0.36;
/**
 * A wall's frame: its inner face at the back corner (x, z), the unit direction along it (dx, dz),
 * and the way things hung on it face (rotY). Side walls run along their splayed line.
 */
export function wallFrame(room: RoomId, wall: WallId): { x: number; z: number; dx: number; dz: number; rotY: number } {
  const R = ROOMS[room] ?? ROOMS.bedroom;
  if (wall === "back") return { x: R.x0, z: R.z0, dx: 1, dz: 0, rotY: 0 };
  const s = Math.sin(SIDE_SPLAY);
  const c = Math.cos(SIDE_SPLAY);
  if (wall === "left") return { x: R.x0, z: R.z0, dx: -s, dz: c, rotY: Math.PI / 2 - SIDE_SPLAY };
  return { x: R.x0 + R.cols, z: R.z0, dx: s, dz: c, rotY: -(Math.PI / 2 - SIDE_SPLAY) };
}

export function placedTransform(p: Pick<HomePlaced, "item" | "room" | "gx" | "gz" | "r" | "wall">): { x: number; y: number; z: number; rotY: number } {
  const def = getHomeItem(p.item);
  const R = ROOMS[p.room] ?? ROOMS.bedroom;
  if (def?.surface === "wall" && p.wall) {
    const along = p.gx + def.w / 2;
    const y = def.wallY ?? 2.2;
    const f = wallFrame(p.room, p.wall);
    return { x: f.x + f.dx * along, y, z: f.z + f.dz * along, rotY: f.rotY };
  }
  const { w, d } = footprint(def ?? { w: 1, d: 1 }, p.r);
  return { x: R.x0 + p.gx + w / 2, y: 0, z: R.z0 + p.gz + d / 2, rotY: (((p.r % 4) + 4) % 4) * (Math.PI / 2) };
}

/** Which room a world point is in (the middle wall counts as the nearer room). */
export function roomAt(x: number): RoomId {
  return x < 0 ? "bedroom" : "den";
}

/** Snap a floor item so its footprint centres on (x, z), kept inside the room. */
export function snapFloor(itemId: string, x: number, z: number, r: number, room: RoomId = roomAt(x)): { room: RoomId; gx: number; gz: number } {
  const def = getHomeItem(itemId);
  const R = ROOMS[room];
  const { w, d } = footprint(def ?? { w: 1, d: 1 }, r);
  const gx = Math.round(x - R.x0 - w / 2);
  const gz = Math.round(z - R.z0 - d / 2);
  return { room, gx: clampInt(gx, 0, Math.max(0, R.cols - w)), gz: clampInt(gz, 0, Math.max(0, R.rows - d)) };
}

/** Distance along a wall of a world point (x, z). */
export function wallAlong(room: RoomId, wall: WallId, x: number, z: number): number {
  const f = wallFrame(room, wall);
  return (x - f.x) * f.dx + (z - f.z) * f.dz;
}

/** The hangable wall of `room` nearest to (x, z). */
export function nearestWall(room: RoomId, x: number, z: number): WallId {
  const R = ROOMS[room];
  let best: WallId = "back";
  let bestD = Infinity;
  for (const w of R.walls) {
    // (how far in front of the wall's face, along the way it faces)
    const f = wallFrame(room, w);
    const d = (x - f.x) * Math.sin(f.rotY) + (z - f.z) * Math.cos(f.rotY);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

/** Snap a wall item so it centres at `along` on the wall, kept on the wall. */
export function snapWall(itemId: string, room: RoomId, wall: WallId, along: number): { room: RoomId; wall: WallId; gx: number; gz: 0 } {
  const def = getHomeItem(itemId);
  const w = def?.w ?? 1;
  const len = wallLength(room, wall);
  return { room, wall, gx: clampInt(Math.round(along - w / 2), 0, Math.max(0, len - w)), gz: 0 };
}

// ───────────────────────────── the walking grid ─────────────────────────────
// One grid over the whole cottage: bedroom cols 0..8, the middle wall col 9 (open only at the
// arch), Pet Corner cols 10..18.

export const GRID_W = 19;
export const GRID_H = 8;
const MID_COL = 9;

export function globalCol(room: RoomId, gx: number): number {
  return room === "bedroom" ? gx : MID_COL + 1 + gx;
}
export function cellCenterWorld(c: number, row: number): { x: number; z: number } {
  return { x: -9 + c, z: -3.5 + row };
}
export function worldToGlobal(x: number, z: number): { c: number; row: number } {
  return { c: clampInt(Math.round(x + 9), 0, GRID_W - 1), row: clampInt(Math.round(z + 3.5), 0, GRID_H - 1) };
}

/** 1 = can't walk there (solid furniture, or the middle wall away from the arch). */
export function blockedGrid(placed: HomePlaced[], ignoreUid?: string): Uint8Array {
  const g = new Uint8Array(GRID_W * GRID_H);
  for (let row = 0; row < GRID_H; row++) if (!ARCH_ROWS.includes(row)) g[row * GRID_W + MID_COL] = 1;
  for (const p of placed) {
    if (p.uid === ignoreUid) continue;
    const def = getHomeItem(p.item);
    if (!def || !isSolid(def)) continue;
    for (const [x, z] of floorCells(def, p.gx, p.gz, p.r)) {
      const c = globalCol(p.room, x);
      if (c >= 0 && c < GRID_W && z >= 0 && z < GRID_H) g[z * GRID_W + c] = 1;
    }
  }
  return g;
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** BFS distances (in steps) from a cell over free cells; diagonal steps never cut a corner. */
function flood(g: Uint8Array, c0: number, r0: number): Int16Array {
  const dist = new Int16Array(GRID_W * GRID_H).fill(-1);
  const q: number[] = [r0 * GRID_W + c0];
  dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const c = i % GRID_W;
    const r = (i - c) / GRID_W;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= GRID_W || nr >= GRID_H) continue;
      const ni = nr * GRID_W + nc;
      if (g[ni] || dist[ni] >= 0) continue;
      if (dc && dr && (g[r * GRID_W + nc] || g[nr * GRID_W + c])) continue;
      dist[ni] = dist[i] + 1;
      q.push(ni);
    }
  }
  return dist;
}

/** the free cell nearest (as the crow flies) to (c, row) */
function nearestFree(g: Uint8Array, c: number, row: number, ok?: (i: number) => boolean): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < g.length; i++) {
    if (g[i] || (ok && !ok(i))) continue;
    const cc = i % GRID_W;
    const rr = (i - cc) / GRID_W;
    const d = (cc - c) ** 2 + (rr - row) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * A walking route from (x, z) to (tx, tz) around the furniture, as world points (the first one
 * is the next step, the last is the goal). If the goal is blocked or cut off the route ends at
 * the nearest reachable spot. [] when already there.
 */
export function findPath(g: Uint8Array, x: number, z: number, tx: number, tz: number): { x: number; z: number }[] {
  const s = worldToGlobal(x, z);
  let si = s.row * GRID_W + s.c;
  if (g[si]) {
    si = nearestFree(g, s.c, s.row);
    if (si < 0) return [];
  }
  const dist = flood(g, si % GRID_W, Math.floor(si / GRID_W));
  const t = worldToGlobal(tx, tz);
  let ti = t.row * GRID_W + t.c;
  const exact = !g[ti] && dist[ti] >= 0;
  if (!exact) ti = nearestFree(g, t.c, t.row, (i) => dist[i] >= 0);
  if (ti < 0) return [];
  // walk back down the distance field from the goal
  const cells: number[] = [ti];
  let cur = ti;
  while (dist[cur] > 0) {
    const c = cur % GRID_W;
    const r = (cur - c) / GRID_W;
    let next = -1;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= GRID_W || nr >= GRID_H) continue;
      const ni = nr * GRID_W + nc;
      if (dist[ni] !== dist[cur] - 1) continue;
      if (dc && dr && (g[r * GRID_W + nc] || g[nr * GRID_W + c])) continue;
      next = ni;
      if (!(dc && dr)) break; // prefer straight steps: tidier routes
    }
    if (next < 0) break;
    cells.push(next);
    cur = next;
  }
  cells.reverse(); // start ... goal
  const pts = cells.map((i) => cellCenterWorld(i % GRID_W, Math.floor(i / GRID_W)));
  if (exact) pts[pts.length - 1] = { x: tx, z: tz };
  // drop the start cell and any points we can see straight past
  pts.shift();
  const out: { x: number; z: number }[] = [];
  let from = { x, z };
  for (let i = 0; i < pts.length; i++) {
    const last = i === pts.length - 1;
    if (!last && clearLine(g, from, pts[i + 1])) continue;
    out.push(pts[i]);
    from = pts[i];
  }
  return out;
}

/** can you walk in a straight line from a to b without touching a blocked cell? */
export function clearLine(g: Uint8Array, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / 0.2));
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    const px = a.x + (b.x - a.x) * u;
    const pz = a.z + (b.z - a.z) * u;
    // a little body width either side
    for (const [ox, oz] of [
      [0, 0],
      [0.28, 0],
      [-0.28, 0],
      [0, 0.28],
      [0, -0.28],
    ]) {
      const { c, row } = worldToGlobal(px + ox, pz + oz);
      if (g[row * GRID_W + c]) return false;
    }
  }
  return true;
}

/** the door-front cell and the bedroom side of the arch must stay connected */
export function doorReachesArch(g: Uint8Array): boolean {
  const door = RESERVED.den[2];
  const dist = flood(g, globalCol("den", door[0]), door[1]);
  return dist[ARCH_ROWS[0] * GRID_W + globalCol("bedroom", RESERVED.bedroom[0][0])] >= 0;
}

// ───────────────────────────── placement ─────────────────────────────

export interface PlaceSpec {
  item: string;
  room: RoomId;
  gx: number;
  gz: number;
  r: number;
  wall?: WallId;
}

export type PlaceReason = "unknown" | "outside" | "overlap" | "blocked" | "surface";
export type PlaceCheck = { ok: true } | { ok: false; reason: PlaceReason };

export const PLACE_MESSAGES: Record<PlaceReason, string> = {
  unknown: "That isn't in the catalogue.",
  outside: "That doesn't fit there.",
  overlap: "Something's already there.",
  blocked: "Keep the doorway and the arch clear!",
  surface: "That goes somewhere else.",
};

/** Can this item go here, given what's already placed (optionally ignoring one being moved)? */
export function canPlace(placed: HomePlaced[], spec: PlaceSpec, ignoreUid?: string): PlaceCheck {
  const def = getHomeItem(spec.item);
  if (!def) return { ok: false, reason: "unknown" };
  if (!isPlaceable(def)) return { ok: false, reason: "surface" };
  const R = ROOMS[spec.room];
  if (!R) return { ok: false, reason: "outside" };
  if (!Number.isInteger(spec.gx) || !Number.isInteger(spec.gz) || !Number.isInteger(spec.r)) return { ok: false, reason: "outside" };
  const others = placed.filter((p) => p.uid !== ignoreUid && p.room === spec.room);

  if (def.surface === "wall") {
    if (!spec.wall || !R.walls.includes(spec.wall)) return { ok: false, reason: "surface" };
    const len = wallLength(spec.room, spec.wall);
    const a = spec.gx;
    const b = spec.gx + def.w - 1;
    if (a < 0 || b >= len) return { ok: false, reason: "outside" };
    for (const f of WALL_FEATURES[spec.room][spec.wall] ?? []) if (a <= f.to && b >= f.from) return { ok: false, reason: "blocked" };
    for (const o of others) {
      const od = getHomeItem(o.item);
      if (!od || od.surface !== "wall" || o.wall !== spec.wall) continue;
      if (a <= o.gx + od.w - 1 && b >= o.gx) return { ok: false, reason: "overlap" };
    }
    return { ok: true };
  }

  if (spec.wall) return { ok: false, reason: "surface" };
  const mine = floorCells(def, spec.gx, spec.gz, spec.r);
  if (mine.some(([x, z]) => x < 0 || z < 0 || x >= R.cols || z >= R.rows)) return { ok: false, reason: "outside" };
  const layer = def.surface; // rugs only clash with rugs; furniture only with furniture
  const taken = new Set<string>();
  for (const o of others) {
    const od = getHomeItem(o.item);
    if (!od || od.surface !== layer) continue;
    for (const [x, z] of floorCells(od, o.gx, o.gz, o.r)) taken.add(`${x},${z}`);
  }
  if (mine.some(([x, z]) => taken.has(`${x},${z}`))) return { ok: false, reason: "overlap" };
  if (layer === "floor") {
    const reserved = new Set(RESERVED[spec.room].map(([x, z]) => `${x},${z}`));
    if (mine.some(([x, z]) => reserved.has(`${x},${z}`))) return { ok: false, reason: "blocked" };
    if (isSolid(def)) {
      const trial: HomePlaced[] = [...placed.filter((p) => p.uid !== ignoreUid), { uid: "__trial", item: spec.item, room: spec.room, gx: spec.gx, gz: spec.gz, r: spec.r }];
      if (!doorReachesArch(blockedGrid(trial))) return { ok: false, reason: "blocked" };
    }
  }
  return { ok: true };
}

/**
 * The nearest good spot for a new item in `room`, starting from the middle of the room (or a
 * given point) and spiralling out. null when the room is full.
 */
export function findSpot(placed: HomePlaced[], itemId: string, room: RoomId, r = 0, near?: { x: number; z: number }, ignoreUid?: string): PlaceSpec | null {
  const def = getHomeItem(itemId);
  if (!def || !isPlaceable(def)) return null;
  const R = ROOMS[room];
  if (def.surface === "wall") {
    const cands: PlaceSpec[] = [];
    for (const wall of R.walls) for (let gx = 0; gx <= wallLength(room, wall) - def.w; gx++) cands.push({ item: itemId, room, gx, gz: 0, r: 0, wall });
    const cx = near?.x ?? R.x0 + R.cols / 2;
    const cz = near?.z ?? R.z0;
    const score = (s: PlaceSpec) => {
      const t = placedTransform({ ...s, item: itemId });
      return (t.x - cx) ** 2 + (t.z - cz) ** 2 + (s.wall === "back" ? 0 : 4);
    };
    cands.sort((a, b) => score(a) - score(b));
    return cands.find((s) => canPlace(placed, s, ignoreUid).ok) ?? null;
  }
  for (const rot of [r, (r + 1) % 4]) {
    const { w, d } = footprint(def, rot);
    const cx = near?.x ?? R.x0 + R.cols / 2;
    const cz = near?.z ?? R.z0 + R.rows / 2;
    const cands: PlaceSpec[] = [];
    for (let gx = 0; gx <= R.cols - w; gx++) for (let gz = 0; gz <= R.rows - d; gz++) cands.push({ item: itemId, room, gx, gz, r: rot });
    const score = (s: PlaceSpec) => (R.x0 + s.gx + w / 2 - cx) ** 2 + (R.z0 + s.gz + d / 2 - cz) ** 2;
    cands.sort((a, b) => score(a) - score(b));
    const hit = cands.find((s) => canPlace(placed, s, ignoreUid).ok);
    if (hit) return hit;
  }
  return null;
}

// ───────────────────────────── ownership & unlocks ─────────────────────────────

/** Copies of an item this home may use: free items up to `max`, paid ones as many as bought. */
export function available(def: HomeItemDef, owned: Owned): number {
  if (def.cost === 0) return def.max;
  return Math.max(0, Math.min(def.max, Math.floor(Number(owned[def.id]) || 0)));
}

export function ownsStyle(def: HomeItemDef, owned: Owned): boolean {
  return isStyle(def) && (def.cost === 0 || (Number(owned[def.id]) || 0) >= 1);
}

export function placedCount(placed: HomePlaced[], itemId: string, ignoreUid?: string): number {
  return placed.reduce((n, p) => n + (p.item === itemId && p.uid !== ignoreUid ? 1 : 0), 0);
}

/** Can one more copy be bought? (styles: once) */
export function canBuyMore(def: HomeItemDef, owned: Owned): boolean {
  if (def.cost === 0) return false;
  const have = Math.floor(Number(owned[def.id]) || 0);
  return have < (isStyle(def) ? 1 : def.max);
}

export function isItemUnlocked(def: HomeItemDef, level: number, streak: number): boolean {
  if (def.unlock?.level && level < def.unlock.level) return false;
  if (def.unlock?.streak && streak < def.unlock.streak) return false;
  return true;
}

export function itemUnlockHint(def: HomeItemDef): string {
  const parts: string[] = [];
  if (def.unlock?.level) parts.push(`level ${def.unlock.level}`);
  if (def.unlock?.streak) parts.push(`${def.unlock.streak}-day streak`);
  return parts.length ? `Unlocks at ${parts.join(" + ")}` : "";
}

// ───────────────────────────── the starter home, validation ─────────────────────────────

/** A new kid's home: the free starter set, arranged nicely. */
export function defaultLayout(): HomeLayout {
  const P = (uid: string, item: string, room: RoomId, gx: number, gz: number, r = 0, wall?: WallId): HomePlaced => (wall ? { uid, item, room, gx, gz, r, wall } : { uid, item, room, gx, gz, r });
  return {
    v: 1,
    placed: [
      P("s-bed", "bed", "bedroom", 0, 0),
      P("s-night", "nightstand", "bedroom", 2, 0),
      P("s-rug", "rug-round", "bedroom", 3, 4),
      P("s-desk", "desk", "bedroom", 6, 0),
      P("s-chair", "chair", "bedroom", 6, 1, 2),
      P("s-lamp", "lamp", "bedroom", 8, 0),
      P("s-plant", "plant", "bedroom", 0, 7),
      P("s-poster", "poster-star", "bedroom", 1, 0, 0, "back"),
      P("s-petbed", "pet-bed", "den", 1, 5),
      P("s-bowl", "bowl", "den", 4, 0),
      P("s-ball", "pet-ball", "den", 4, 4),
      P("s-rug2", "rug-round", "den", 3, 3),
      P("s-plant2", "plant", "den", 8, 7),
      P("s-lamp2", "lamp", "den", 0, 0),
    ],
    rooms: { bedroom: { ...DEFAULT_STYLES.bedroom }, den: { ...DEFAULT_STYLES.den } },
  };
}

const UID_RE = /^[A-Za-z0-9_-]{1,40}$/;

export type ValidateResult = { ok: true; layout: HomeLayout } | { ok: false; error: string };

function readPlaced(raw: unknown): HomePlaced | string {
  if (!raw || typeof raw !== "object") return "Something odd is in your home.";
  const o = raw as Record<string, unknown>;
  if (typeof o.uid !== "string" || !UID_RE.test(o.uid)) return "Something odd is in your home.";
  if (typeof o.item !== "string" || !getHomeItem(o.item)) return "One of those things isn't in the catalogue.";
  if (o.room !== "bedroom" && o.room !== "den") return "That room doesn't exist.";
  const num = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : NaN);
  const gx = num(o.gx);
  const gz = num(o.gz ?? 0);
  const r = num(o.r ?? 0);
  if (!Number.isFinite(gx) || !Number.isFinite(gz) || !Number.isFinite(r) || r < 0 || r > 3) return "Something is in a funny spot.";
  const def = getHomeItem(o.item)!;
  if (def.surface === "wall") {
    if (o.wall !== "back" && o.wall !== "left" && o.wall !== "right") return "A picture is missing its wall.";
    return { uid: o.uid, item: o.item, room: o.room, gx, gz: 0, r: 0, wall: o.wall };
  }
  if (o.wall !== undefined && o.wall !== null) return "That can't go on a wall.";
  return { uid: o.uid, item: o.item, room: o.room, gx, gz, r };
}

function readStyles(raw: unknown, owned: Owned): Record<RoomId, RoomStyle> | string {
  const out = { bedroom: { ...DEFAULT_STYLES.bedroom }, den: { ...DEFAULT_STYLES.den } };
  if (raw === undefined || raw === null) return out;
  if (typeof raw !== "object") return "Your room colours got muddled.";
  for (const room of ROOM_IDS) {
    const s = (raw as Record<string, unknown>)[room];
    if (s === undefined) continue;
    if (!s || typeof s !== "object") return "Your room colours got muddled.";
    const { wall, floor } = s as Record<string, unknown>;
    for (const [id, surface, key] of [
      [wall, "wallpaper", "wall"],
      [floor, "flooring", "floor"],
    ] as const) {
      if (id === undefined) continue;
      const def = typeof id === "string" ? getHomeItem(id) : undefined;
      if (!def || def.surface !== surface) return "That paint isn't in the catalogue.";
      if (!ownsStyle(def, owned)) return `Buy ${def.name} first!`;
      out[room][key] = def.id;
    }
  }
  return out;
}

/**
 * Strict check of a layout a kid wants to save: known items only, no more copies than they own,
 * every position valid (no overlaps, off the reserved cells, doorway kept open), size limits,
 * and room styles they own. Returns the cleaned layout.
 */
export function validateLayout(raw: unknown, owned: Owned): ValidateResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Your home got muddled — try again." };
  const o = raw as Record<string, unknown>;
  const list = o.placed ?? [];
  if (!Array.isArray(list)) return { ok: false, error: "Your home got muddled — try again." };
  if (list.length > MAX_PLACED) return { ok: false, error: `That's a lot of stuff! Your home fits ${MAX_PLACED} things.` };
  const accepted: HomePlaced[] = [];
  const uids = new Set<string>();
  const perRoom: Record<RoomId, number> = { bedroom: 0, den: 0 };
  for (const item of list) {
    const p = readPlaced(item);
    if (typeof p === "string") return { ok: false, error: p };
    if (uids.has(p.uid)) return { ok: false, error: "Something odd is in your home." };
    uids.add(p.uid);
    const def = getHomeItem(p.item)!;
    if (placedCount(accepted, p.item) + 1 > available(def, owned)) return { ok: false, error: def.cost ? `Buy another ${def.name} first!` : `You can only have ${def.max} ${def.name}${def.max === 1 ? "" : "s"}.` };
    if (++perRoom[p.room] > MAX_PER_ROOM) return { ok: false, error: `That room is full — ${MAX_PER_ROOM} things max.` };
    const check = canPlace(accepted, p);
    if (!check.ok) return { ok: false, error: `${def.name}: ${PLACE_MESSAGES[check.reason]}` };
    accepted.push(p);
  }
  const rooms = readStyles(o.rooms, owned);
  if (typeof rooms === "string") return { ok: false, error: rooms };
  return { ok: true, layout: { v: 1, placed: accepted, rooms } };
}

/**
 * Tolerant read of a stored layout: a fresh (empty) home gets the starter set, anything that no
 * longer fits the rules (a retired item, a moved window...) is quietly dropped.
 */
export function sanitizeLayout(raw: unknown, owned: Owned): HomeLayout {
  if (!raw || typeof raw !== "object" || (raw as { v?: unknown }).v !== 1) return defaultLayout();
  const o = raw as Record<string, unknown>;
  const accepted: HomePlaced[] = [];
  const uids = new Set<string>();
  for (const item of Array.isArray(o.placed) ? o.placed.slice(0, MAX_PLACED) : []) {
    const p = readPlaced(item);
    if (typeof p === "string" || uids.has(p.uid)) continue;
    const def = getHomeItem(p.item)!;
    if (placedCount(accepted, p.item) + 1 > available(def, owned)) continue;
    if (accepted.filter((a) => a.room === p.room).length >= MAX_PER_ROOM) continue;
    if (!canPlace(accepted, p).ok) continue;
    uids.add(p.uid);
    accepted.push(p);
  }
  const rooms = readStyles(o.rooms, owned);
  return { v: 1, placed: accepted, rooms: typeof rooms === "string" ? { bedroom: { ...DEFAULT_STYLES.bedroom }, den: { ...DEFAULT_STYLES.den } } : rooms };
}

/** Tolerant read of kid_parks.home_owned. */
export function sanitizeOwned(raw: unknown): Owned {
  const out: Owned = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const def = getHomeItem(k);
    const n = Math.floor(Number(v));
    if (def && def.cost > 0 && n > 0) out[k] = Math.min(n, isStyle(def) ? 1 : def.max);
  }
  return out;
}

/** a fresh uid for a newly placed item */
export function newUid(): string {
  return `h${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`.slice(0, 40);
}

function clampInt(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}
