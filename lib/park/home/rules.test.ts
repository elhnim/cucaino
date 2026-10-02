import { describe, expect, it } from "vitest";
import { HOME_CATEGORIES, HOME_ITEMS, getHomeItem, isStyle } from "./catalog";
import {
  GRID_W,
  RESERVED,
  ROOMS,
  SPAWN,
  WALL_FEATURES,
  available,
  blockedGrid,
  canBuyMore,
  canPlace,
  clearLine,
  defaultLayout,
  doorReachesArch,
  findPath,
  findSpot,
  footprint,
  isItemUnlocked,
  nearestWall,
  SIDE_SPLAY,
  wallAlong,
  placedTransform,
  sanitizeLayout,
  sanitizeOwned,
  snapFloor,
  snapWall,
  validateLayout,
  worldToGlobal,
  type HomePlaced,
} from "./rules";
import { choosePetActivity, petSpotFor } from "./pet";

const P = (uid: string, item: string, room: "bedroom" | "den", gx: number, gz: number, r = 0, wall?: "back" | "left" | "right"): HomePlaced =>
  wall ? { uid, item, room, gx, gz, r, wall } : { uid, item, room, gx, gz, r };

describe("catalogue", () => {
  it("has unique ids, known categories and sane footprints", () => {
    const ids = new Set<string>();
    const cats = new Set(HOME_CATEGORIES.map((c) => c.id));
    for (const it of HOME_ITEMS) {
      expect(ids.has(it.id)).toBe(false);
      ids.add(it.id);
      expect(cats.has(it.category)).toBe(true);
      expect(it.cost).toBeGreaterThanOrEqual(0);
      expect(it.max).toBeGreaterThanOrEqual(1);
      if (isStyle(it)) expect(it.swatch).toBeDefined();
      else {
        expect(it.w).toBeGreaterThanOrEqual(1);
        expect(it.d).toBeGreaterThanOrEqual(1);
        expect(it.w).toBeLessThanOrEqual(ROOMS.den.rows);
      }
      if (it.surface === "wall") expect(it.wallY).toBeGreaterThan(0.5);
      if (it.petUse === "sleep") expect(it.seatY).toBeGreaterThan(0);
    }
  });
  it("gives every room a free wallpaper and flooring and a free pet starter set", () => {
    expect(HOME_ITEMS.some((i) => i.surface === "wallpaper" && i.cost === 0)).toBe(true);
    expect(HOME_ITEMS.some((i) => i.surface === "flooring" && i.cost === 0)).toBe(true);
    for (const use of ["sleep", "eat", "play"]) expect(HOME_ITEMS.some((i) => i.petUse === use && i.cost === 0)).toBe(true);
  });
});

describe("footprints and coordinates", () => {
  it("swaps the footprint on a quarter turn", () => {
    const bed = getHomeItem("bed")!;
    expect(footprint(bed, 0)).toEqual({ w: 2, d: 3 });
    expect(footprint(bed, 1)).toEqual({ w: 3, d: 2 });
    expect(footprint(bed, 2)).toEqual({ w: 2, d: 3 });
  });
  it("snaps floor items inside the room and round-trips with placedTransform", () => {
    const s = snapFloor("bed", -8.5, -1.5, 0);
    expect(s).toEqual({ room: "bedroom", gx: 0, gz: 1 });
    const t = placedTransform({ item: "bed", ...s, r: 0 });
    expect(t.x).toBeCloseTo(-8.5);
    expect(t.z).toBeCloseTo(-1.5);
    // way outside the room still lands on the edge
    expect(snapFloor("bed", -40, 40, 0)).toEqual({ room: "bedroom", gx: 0, gz: 5 });
    expect(snapFloor("sofa", 30, -30, 0)).toEqual({ room: "den", gx: 6, gz: 0 });
  });
  it("puts wall items on the right wall, facing into the room", () => {
    expect(placedTransform({ item: "poster-star", room: "bedroom", gx: 0, gz: 0, r: 0, wall: "back" })).toMatchObject({ x: -9, z: -4, rotY: 0 });
    // (the side walls are splayed out like a dollhouse's: hinged at the back corner, turned toward the front)
    const l = placedTransform({ item: "poster-star", room: "bedroom", gx: 0, gz: 0, r: 0, wall: "left" });
    expect(l.x).toBeCloseTo(-9.5 - 0.5 * Math.sin(SIDE_SPLAY));
    expect(l.z).toBeCloseTo(-4 + 0.5 * Math.cos(SIDE_SPLAY));
    expect(l.rotY).toBeCloseTo(Math.PI / 2 - SIDE_SPLAY);
    const r = placedTransform({ item: "poster-star", room: "den", gx: 0, gz: 0, r: 0, wall: "right" });
    expect(r.x).toBeCloseTo(9.5 + 0.5 * Math.sin(SIDE_SPLAY));
    expect(r.rotY).toBeCloseTo(-(Math.PI / 2 - SIDE_SPLAY));
    // ...and a point on the splayed wall measures back to where it is along it
    expect(wallAlong("bedroom", "left", l.x, l.z)).toBeCloseTo(0.5);
    expect(nearestWall("bedroom", -9.2, 1)).toBe("left");
    expect(nearestWall("den", 5, -3.6)).toBe("back");
    expect(nearestWall("den", 9.1, 2)).toBe("right");
    expect(snapWall("bunting", "den", "back", 100)).toMatchObject({ gx: 6 });
  });
});

describe("canPlace", () => {
  it("rejects unknown items, styles and off-grid spots", () => {
    expect(canPlace([], { item: "nope", room: "den", gx: 0, gz: 0, r: 0 })).toEqual({ ok: false, reason: "unknown" });
    expect(canPlace([], { item: "wp-dots", room: "den", gx: 0, gz: 0, r: 0 })).toEqual({ ok: false, reason: "surface" });
    expect(canPlace([], { item: "bed", room: "bedroom", gx: 8, gz: 0, r: 0 })).toEqual({ ok: false, reason: "outside" });
    expect(canPlace([], { item: "bed", room: "bedroom", gx: 0, gz: 6, r: 0 })).toEqual({ ok: false, reason: "outside" });
    expect(canPlace([], { item: "bed", room: "bedroom", gx: 0.5, gz: 0, r: 0 })).toEqual({ ok: false, reason: "outside" });
    expect(canPlace([], { item: "bed", room: "bedroom", gx: 0, gz: 0, r: 0 })).toEqual({ ok: true });
    // turned, the bed is 3 wide
    expect(canPlace([], { item: "bed", room: "bedroom", gx: 7, gz: 0, r: 1 }).ok).toBe(false);
  });
  it("stops furniture overlapping, but lets it stand on rugs", () => {
    const placed = [P("a", "bed", "bedroom", 0, 0), P("rug", "rug-rainbow", "bedroom", 3, 3)];
    expect(canPlace(placed, { item: "chair", room: "bedroom", gx: 1, gz: 2, r: 0 })).toEqual({ ok: false, reason: "overlap" });
    expect(canPlace(placed, { item: "chair", room: "bedroom", gx: 4, gz: 3, r: 0 })).toEqual({ ok: true });
    expect(canPlace(placed, { item: "rug-round", room: "bedroom", gx: 4, gz: 4, r: 0 })).toEqual({ ok: false, reason: "overlap" });
    // the same cell in the other room is fine
    expect(canPlace(placed, { item: "chair", room: "den", gx: 1, gz: 2, r: 0 })).toEqual({ ok: true });
    // moving an item onto its own old spot is fine
    expect(canPlace(placed, { item: "bed", room: "bedroom", gx: 0, gz: 1, r: 0 }, "a")).toEqual({ ok: true });
  });
  it("keeps the arch and the doorway clear (rugs are allowed there)", () => {
    for (const room of ["bedroom", "den"] as const)
      for (const [gx, gz] of RESERVED[room]) {
        expect(canPlace([], { item: "plant", room, gx, gz, r: 0 })).toEqual({ ok: false, reason: "blocked" });
        expect(canPlace([], { item: "bowl", room, gx, gz, r: 0 })).toEqual({ ok: false, reason: "blocked" });
      }
    expect(canPlace([], { item: "rug-round", room: "den", gx: 6, gz: 0, r: 0 })).toEqual({ ok: true });
  });
  it("never lets solid furniture cut the door off from the arch", () => {
    // a wall of bookshelves across the Pet Corner (row 2, leaving the reserved cells)
    const wall = [P("b1", "bookshelf", "den", 0, 2), P("b2", "bookshelf", "den", 2, 2), P("b3", "bookshelf", "den", 4, 2), P("b4", "bookshelf", "den", 6, 2)];
    expect(doorReachesArch(blockedGrid(wall))).toBe(true); // col 8 is still open
    expect(canPlace(wall, { item: "plant", room: "den", gx: 8, gz: 2, r: 0 })).toEqual({ ok: false, reason: "blocked" });
    // a pet bed isn't solid, so it may go there
    expect(canPlace(wall, { item: "bowl", room: "den", gx: 8, gz: 2, r: 0 })).toEqual({ ok: true });
  });
  it("hangs wall items on the room's own walls, away from windows, the door and each other", () => {
    expect(canPlace([], { item: "poster-star", room: "bedroom", gx: 0, gz: 0, r: 0 })).toEqual({ ok: false, reason: "surface" });
    expect(canPlace([], { item: "poster-star", room: "bedroom", gx: 0, gz: 0, r: 0, wall: "right" })).toEqual({ ok: false, reason: "surface" });
    expect(canPlace([], { item: "chair", room: "bedroom", gx: 0, gz: 0, r: 0, wall: "back" })).toEqual({ ok: false, reason: "surface" });
    const win = WALL_FEATURES.bedroom.back![0];
    expect(canPlace([], { item: "poster-star", room: "bedroom", gx: win.from, gz: 0, r: 0, wall: "back" })).toEqual({ ok: false, reason: "blocked" });
    expect(canPlace([], { item: "wall-shelf", room: "bedroom", gx: win.from - 1, gz: 0, r: 0, wall: "back" })).toEqual({ ok: false, reason: "blocked" });
    expect(canPlace([], { item: "poster-star", room: "den", gx: 6, gz: 0, r: 0, wall: "back" })).toEqual({ ok: false, reason: "blocked" }); // the door
    expect(canPlace([], { item: "bunting", room: "den", gx: 7, gz: 0, r: 0, wall: "back" })).toEqual({ ok: false, reason: "outside" });
    const placed = [P("p", "wall-shelf", "bedroom", 0, 0, 0, "back")];
    expect(canPlace(placed, { item: "poster-star", room: "bedroom", gx: 1, gz: 0, r: 0, wall: "back" })).toEqual({ ok: false, reason: "overlap" });
    expect(canPlace(placed, { item: "poster-star", room: "bedroom", gx: 1, gz: 0, r: 0, wall: "left" })).toEqual({ ok: true });
    // a wall item doesn't clash with furniture standing below it
    expect(canPlace([P("d", "desk", "bedroom", 0, 0)], { item: "poster-star", room: "bedroom", gx: 0, gz: 0, r: 0, wall: "back" })).toEqual({ ok: true });
  });
  it("finds a free spot near the middle, and null when the room is full", () => {
    const s = findSpot([], "sofa", "den");
    expect(s && canPlace([], s).ok).toBe(true);
    const w = findSpot([], "bunting", "bedroom");
    expect(w?.wall).toBeDefined();
    // fill the bedroom with plants
    const full: HomePlaced[] = [];
    let n = 0;
    for (let gx = 0; gx < 9; gx++) for (let gz = 0; gz < 8; gz++) if (canPlace(full, { item: "bowl", room: "bedroom", gx, gz, r: 0 }).ok) full.push(P(`x${n++}`, "bowl", "bedroom", gx, gz));
    expect(findSpot(full, "chair", "bedroom")).toBeNull();
  });
});

describe("walking", () => {
  it("walks round furniture and through the arch", () => {
    const placed = [P("s", "sofa", "den", 3, 3)];
    const g = blockedGrid(placed);
    const path = findPath(g, SPAWN.x, SPAWN.z, -6, 2);
    expect(path.length).toBeGreaterThan(0);
    const end = path[path.length - 1];
    expect(end).toEqual({ x: -6, z: 2 });
    // every leg is walkable, and the route goes through the arch
    let from = { x: SPAWN.x, z: SPAWN.z };
    let archSeen = false;
    for (const p of path) {
      expect(clearLine(g, from, p)).toBe(true);
      from = p;
    }
    for (let k = 0; k <= 40; k++) {
      const pts = [{ x: SPAWN.x, z: SPAWN.z }, ...path];
      for (let i = 1; i < pts.length; i++) {
        const u = k / 40;
        const x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u;
        const z = pts[i - 1].z + (pts[i].z - pts[i - 1].z) * u;
        if (Math.abs(x) < 0.5 && z > -1.5 && z < 1.5) archSeen = true;
      }
    }
    expect(archSeen).toBe(true);
  });
  it("stops at the nearest spot when the goal is inside furniture", () => {
    const g = blockedGrid([P("b", "bed", "bedroom", 0, 0)]);
    const path = findPath(g, -5, 2, -8.5, -2.5);
    const end = path[path.length - 1];
    const { c, row } = worldToGlobal(end.x, end.z);
    expect(g[row * GRID_W + c]).toBe(0);
  });
  it("never walks through the middle wall away from the arch", () => {
    const g = blockedGrid([]);
    expect(clearLine(g, { x: -3, z: -3 }, { x: 3, z: -3 })).toBe(false);
    expect(clearLine(g, { x: -3, z: 0 }, { x: 3, z: 0 })).toBe(true);
  });
});

describe("ownership, unlocks and validation", () => {
  it("counts free and bought copies", () => {
    expect(available(getHomeItem("plant")!, {})).toBe(4);
    expect(available(getHomeItem("sofa")!, {})).toBe(0);
    expect(available(getHomeItem("sofa")!, { sofa: 1 })).toBe(1);
    expect(available(getHomeItem("beanbag")!, { beanbag: 99 })).toBe(3);
    expect(canBuyMore(getHomeItem("beanbag")!, { beanbag: 2 })).toBe(true);
    expect(canBuyMore(getHomeItem("beanbag")!, { beanbag: 3 })).toBe(false);
    expect(canBuyMore(getHomeItem("plant")!, {})).toBe(false);
    expect(canBuyMore(getHomeItem("wp-dots")!, { "wp-dots": 1 })).toBe(false);
    expect(isItemUnlocked(getHomeItem("drums")!, 5, 4)).toBe(false);
    expect(isItemUnlocked(getHomeItem("drums")!, 1, 5)).toBe(true);
    expect(isItemUnlocked(getHomeItem("bed-canopy")!, 2, 0)).toBe(false);
  });
  it("accepts the starter home as-is", () => {
    const res = validateLayout(defaultLayout(), {});
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.layout.placed.length).toBe(defaultLayout().placed.length);
  });
  it("rejects items that aren't owned, unknown or badly placed", () => {
    expect(validateLayout({ v: 1, placed: [P("a", "sofa", "den", 2, 5)] }, {}).ok).toBe(false);
    expect(validateLayout({ v: 1, placed: [P("a", "sofa", "den", 2, 5)] }, { sofa: 1 }).ok).toBe(true);
    expect(validateLayout({ v: 1, placed: [P("a", "sofa", "den", 2, 5), P("b", "sofa", "den", 2, 6)] }, { sofa: 1 }).ok).toBe(false);
    expect(validateLayout({ v: 1, placed: [P("a", "rocket-ship", "den", 2, 5)] }, {}).ok).toBe(false);
    expect(validateLayout({ v: 1, placed: [P("a", "bed", "bedroom", 0, 0), P("b", "chair", "bedroom", 1, 1)] }, {}).ok).toBe(false);
    expect(validateLayout({ v: 1, placed: [P("a", "bed", "kitchen" as "den", 0, 0)] }, {}).ok).toBe(false);
    expect(validateLayout({ v: 1, placed: [P("a", "chair", "den", 1, 1), P("a", "chair", "den", 3, 3)] }, {}).ok).toBe(false);
    expect(validateLayout({ v: 1, placed: [{ uid: "x", item: "chair", room: "den", gx: "1", gz: 0, r: 0 }] }, {}).ok).toBe(false);
    expect(validateLayout({ v: 1, placed: [{ uid: "<script>", item: "chair", room: "den", gx: 1, gz: 0, r: 0 }] }, {}).ok).toBe(false);
    expect(validateLayout({ v: 1, placed: [P("a", "chair", "den", 1, 1, 7)] }, {}).ok).toBe(false);
    expect(validateLayout({ v: 1, placed: [P("a", "poster-star", "den", 0, 0)] }, {}).ok).toBe(false); // needs a wall
    expect(validateLayout("nope", {}).ok).toBe(false);
  });
  it("enforces the size limits", () => {
    const many = Array.from({ length: 81 }, (_, i) => P(`p${i}`, "plant", "den", i % 9, Math.floor(i / 9)));
    expect(validateLayout({ v: 1, placed: many }, {}).ok).toBe(false);
  });
  it("only allows room styles that are owned", () => {
    expect(validateLayout({ v: 1, placed: [], rooms: { den: { wall: "wp-stars", floor: "fl-wood" } } }, {}).ok).toBe(false);
    const ok = validateLayout({ v: 1, placed: [], rooms: { den: { wall: "wp-stars", floor: "fl-wood" } } }, { "wp-stars": 1 });
    expect(ok.ok && ok.layout.rooms.den.wall).toBe("wp-stars");
    expect(ok.ok && ok.layout.rooms.bedroom.wall).toBe("wp-stripes"); // untouched rooms keep the default
    expect(validateLayout({ v: 1, placed: [], rooms: { den: { wall: "fl-wood" } } }, {}).ok).toBe(false); // a floor isn't wallpaper
  });
  it("reads stored homes tolerantly", () => {
    expect(sanitizeLayout({}, {}).placed.length).toBe(defaultLayout().placed.length); // fresh home -> starter set
    const kept = sanitizeLayout({ v: 1, placed: [P("a", "bed", "bedroom", 0, 0), P("b", "chair", "bedroom", 1, 1), P("c", "retired-thing", "den", 0, 0), P("d", "sofa", "den", 2, 5)] }, {});
    expect(kept.placed.map((p) => p.uid)).toEqual(["a"]);
    expect(sanitizeLayout({ v: 1, placed: [] }, {}).placed).toEqual([]); // an emptied home stays empty
    expect(sanitizeOwned({ sofa: 2, plant: 3, nope: 1, beanbag: -1, "wp-dots": 5 })).toEqual({ sofa: 1, "wp-dots": 1 });
  });
});

describe("the pet", () => {
  it("lies in the middle of its bed and stands beside its bowl", () => {
    const placed = [P("bed", "pet-bed", "den", 1, 5), P("bowl", "bowl", "den", 4, 0)];
    const g = blockedGrid(placed);
    const bed = petSpotFor(placed[0], g)!;
    expect(bed).toMatchObject({ x: 2.5, z: 2 });
    expect(bed.y).toBeGreaterThan(0);
    const bowl = petSpotFor(placed[1], g)!;
    expect(bowl.y).toBe(0);
    expect(Math.hypot(bowl.x - 5, bowl.z - -3.5)).toBeGreaterThan(0.5);
    expect(petSpotFor(P("c", "chair", "den", 0, 0), g)).toBeNull();
  });
  it("goes to its bowl when hungry and its bed when tired", () => {
    const placed = [P("bed", "pet-bed", "den", 1, 5), P("bowl", "bowl", "den", 4, 0), P("ball", "pet-ball", "den", 4, 4)];
    const hungry = Array.from({ length: 100 }, (_, i) => choosePetActivity({ hunger: 10, happiness: 90, energy: 90 }, placed, i / 100, 0.5).kind);
    expect(hungry.filter((k) => k === "eat").length).toBeGreaterThan(40);
    const tired = Array.from({ length: 100 }, (_, i) => choosePetActivity({ hunger: 90, happiness: 90, energy: 10 }, placed, i / 100, 0.5).kind);
    expect(tired.filter((k) => k === "rest").length).toBeGreaterThan(40);
    expect(tired.includes("play")).toBe(false); // too tired to play
    expect(choosePetActivity({ hunger: 10, happiness: 10, energy: 10 }, [], 0.99, 0.5).kind).toMatch(/follow|wander/);
  });
});
