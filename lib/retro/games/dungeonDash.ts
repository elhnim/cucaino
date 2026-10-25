// DUNGEON DASH — a top-down dungeon adventure. Explore eleven flip-screen rooms, swing your
// sword at slimes, bats and skeleton-bots, throw a boomerang that stuns enemies and grabs
// gems, push a block onto a switch, find three keys for the locked doors, beat the
// Goo Giant (it splits when hit hard!) and grab the Golden Star.
// (Original game in the spirit of 8-bit top-down adventures.)
import { H, PAL, W, clamp, overlap, rng, sprite, spriteH, spriteW, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, fbm, hash2, shade, tinted } from "../art";

const T = 16;
const COLS = 16;
const ROWS = 13;
const OY = 16; // HUD strip height
const RW = COLS * T; // 256
const RH = ROWS * T; // 208

type Side = "N" | "S" | "E" | "W";
type DoorKind = "open" | "locked" | "shut";
interface Edge {
  kind: DoorKind;
  open: boolean;
}

// ── the dungeon: interior maps are 14 x 11 (walls and doors are added around them) ──
// . floor  # pillar  t torch  w water  M push block  _ switch  c gem chest  H big-heart chest
// g gem  h heart  s slime  b bat  k skeleton-bot  B Goo Giant  * Golden Star
interface RoomDef {
  x: number;
  y: number;
  name: string;
  map: string[];
  clearKey?: boolean; // a key appears when every enemy is gone
  lockIn?: boolean; // doors slam shut until every enemy is gone
}
const ROOMS: RoomDef[] = [
  {
    x: 1,
    y: 2,
    name: "ENTRY HALL",
    map: ["..............", ".t..........t.", "..............", "....g....g....", "..............", "..............", "..............", "....#....#....", "..............", ".t..........t.", ".............."],
  },
  {
    x: 0,
    y: 2,
    name: "SLIME POND",
    map: ["..............", "..s.......s...", "....wwwwww....", "....wwwwww....", "..............", "...g......s...", "..............", "....wwwwww....", "....wwwwww..c.", "..s...........", ".............."],
  },
  {
    x: 2,
    y: 2,
    name: "GEM GALLERY",
    map: ["..............", ".g.#......#.g.", "...#......#...", "...#..s...#...", "..............", "..............", "..............", "...#...s..#...", "...#......#...", ".g.#......#.c.", ".............."],
  },
  {
    x: 3,
    y: 2,
    name: "BAT CAVE",
    clearKey: true,
    map: ["..............", "..b........b..", "..............", "....#....#....", "..............", "......b.......", "..............", "....#....#....", "..............", "..b........g..", ".............."],
  },
  {
    x: 0,
    y: 1,
    name: "BLOCK ROOM",
    map: ["..............", ".........###..", ".........#_#..", ".........#.#..", "..............", "..........M...", "...M..........", "..............", "..............", "..............", ".............."],
  },
  {
    x: 0,
    y: 0,
    name: "HEART VAULT",
    map: ["..............", "..#........#..", "..#...H....#..", "..#........#..", "..............", "....s....s....", "..............", "..g.g....g.g..", "..............", "..............", ".............."],
  },
  {
    x: 1,
    y: 1,
    name: "BONE HALL",
    map: ["..............", ".t..........t.", "..............", "..#..k...#....", "..............", "..............", "..............", "....#...k.#...", "..............", ".t..........t.", ".............."],
  },
  {
    x: 2,
    y: 1,
    name: "CROSSROADS",
    map: ["..............", "..s..wwww..b..", ".....wwww.....", "..............", "..#........#..", "..............", "..#........#..", "..............", ".....wwww.....", "..b..wwww..s..", ".............."],
  },
  {
    x: 3,
    y: 1,
    name: "KEY LAB",
    clearKey: true,
    map: ["..............", "..k.......k...", "..............", "...##....##...", "..............", "......s.......", "..............", "...##....##...", "..............", "..g.......g...", ".............."],
  },
  {
    x: 1,
    y: 0,
    name: "GOO GIANT",
    lockIn: true,
    map: ["..............", ".t..........t.", "..............", "..............", "..............", "......B.......", "..............", "..............", "..............", ".t..........t.", ".............."],
  },
  {
    x: 2,
    y: 0,
    name: "STAR ROOM",
    map: ["..............", "..g........g..", "..............", "..............", "....t....t....", "......*.......", "....t....t....", "..............", "..............", "..g........g..", ".............."],
  },
];
const EDGES: [number, number, number, number, DoorKind][] = [
  [1, 2, 0, 2, "open"],
  [1, 2, 2, 2, "open"],
  [2, 2, 3, 2, "open"],
  [0, 2, 0, 1, "open"],
  [0, 1, 0, 0, "locked"],
  [1, 2, 1, 1, "locked"],
  [1, 1, 2, 1, "open"],
  [2, 1, 3, 1, "open"],
  [1, 1, 1, 0, "locked"],
  [1, 0, 2, 0, "shut"],
];
const BOSS_ROOM = "1,0";

// ── sprites ──
const HP_ = { k: PAL.black, b: PAL.blue, w: PAL.white, s: PAL.tan, o: PAL.orange };
const HERO_DOWN = sprite(["...kkkkkk...", "..kbbbbbbk..", ".kbbwbbbbbk.", ".kbbbbbbbbk.", ".kssssssssk.", ".kskssssksk.", ".kssssssssk.", "..kooooook..", ".kbbbbbbbbk.", "ksbbbbbbbbsk", ".kbbk..kbbk.", "..kk....kk.."], HP_);
const HERO_UP = sprite(["...kkkkkk...", "..kbbbbbbk..", ".kbbwbbbbbk.", ".kbbbbbbbbk.", ".kbbbbbbbbk.", ".kbbbbbbbbk.", ".kbbbbbbbbk.", "..kooooook..", ".kbbbbbbbbk.", "ksbbbbbbbbsk", ".kbbk..kbbk.", "..kk....kk.."], HP_);
const HERO_SIDE = sprite(["...kkkkk....", "..kbbbbbk...", ".kbbwbbbbk..", ".kbbbbbbbbk.", ".kbbbsssssk.", ".kbbssssksk.", ".kbbsssssk..", "..kooooook..", "..kbbbbbk...", "..ksbbbbk...", "..kbbkbbk...", "..kk..kk...."], HP_);
/** replace one character of a fixed-width ascii row by index (safer than hand-retyping strings) */
const setCh = (row: string, i: number, ch: string) => row.slice(0, i) + ch + row.slice(i + 1);
const slimeSprites = (body: string, shine: string) => {
  const p = { k: PAL.black, g: body, w: shine, e: "#140c28" };
  const f0 = ["....kkkk....", "..kkggggkk..", ".kgwwgggggk.", "kgwggggggggk", "kggkggggkggk", "kggkggggkggk", "kggggggggggk", "kggggkkggggk", ".kggggggggk.", "..kkkkkkkk.."];
  const f1 = ["............", "............", "...kkkkkk...", ".kkggggggkk.", "kgwwgggggggk", "kggkggggkggk", "kggkggggkggk", "kggggkkggggk", "kggggggggggk", ".kkkkkkkkkk."];
  // a round goo face: two dot eyes over a tiny dark mouth notch, built by index so the
  // silhouette (and row widths) never drift from the hand-tuned art above
  const addFace = (rows: string[], eyeRow: number, mouthRow: number) => {
    const out = [...rows];
    out[eyeRow] = setCh(setCh(out[eyeRow], 3, "e"), 8, "e");
    out[eyeRow + 1] = setCh(setCh(out[eyeRow + 1], 3, "e"), 8, "e");
    out[mouthRow] = setCh(setCh(out[mouthRow], 5, "e"), 6, "e");
    return out;
  };
  return [sprite(addFace(f0, 4, 7), p), sprite(addFace(f1, 5, 7), p)];
};
const SLIME = slimeSprites(PAL.green, PAL.lime);
const KING = slimeSprites(PAL.lime, "#eeffc4"); // the Goo Giant family: a brighter, glowing green so it reads as the big feature slime, not a recolour of the small ones
const BP_ = { k: PAL.black, p: shade(PAL.purple, -0.3), w: PAL.yellow };
const BAT = [
  sprite(["k..........k", "kk........kk", "kpk.kkkk.kpk", "kppkppppkppk", ".kppwppwppk.", "..kppppppk..", "...kpkkpk...", "....k..k...."], BP_),
  sprite(["............", "....kkkk....", "...kppppk...", "kkkpwppwpkkk", "kppppppppppk", "kpk.kppk.kpk", "k....kk....k", "............"], BP_),
];
const SKP = { k: PAL.black, w: PAL.white, g: PAL.grey, r: PAL.red };
const SKEL = [
  sprite(["...kkkkkk...", "..kwwwwwwk..", ".kwrkwwkrwk.", ".kwwwwwwwwk.", "..kwkwkwkk..", "...kkkkkk...", "..kggggggk..", ".kgkwwwwkgk.", "kgkkwwwwkkgk", "kk.kwwwwk.kk", "...kwwwwk...", "...kwkkwk...", "...kwk.kwk..", "..kkk..kkk.."], SKP),
  sprite(["...kkkkkk...", "..kwwwwwwk..", ".kwrkwwkrwk.", ".kwwwwwwwwk.", "..kwkwkwkk..", "...kkkkkk...", "..kggggggk..", ".kgkwwwwkgk.", "kgkkwwwwkkgk", "kk.kwwwwk.kk", "...kwwwwk...", "...kwkkwk...", "..kwk..kwk..", "..kkk...kkk."], SKP),
];
// a brief white hit-flash (instead of blinking the enemy away to nothing) when something is hurt
const WHITE_SLIME = SLIME.map((s) => tinted(s, "#ffffff"));
const WHITE_KING = KING.map((s) => tinted(s, "#ffffff"));
const WHITE_BAT = BAT.map((s) => tinted(s, "#ffffff"));
const WHITE_SKEL = SKEL.map((s) => tinted(s, "#ffffff"));
const BOOMER = sprite(["kkkk.....", "kyywk....", "kyyywk...", ".kyyywk..", "..kyyywk.", "...kyywk.", "..kyywk..", ".kkkkk..."], { k: PAL.black, y: PAL.orange, w: PAL.yellow });
const GEM = sprite(["..kk..", ".kwck.", "kcwcck", "kcccck", ".kcdk.", "..kk.."], { k: PAL.black, c: PAL.cyan, w: PAL.white, d: shade(PAL.cyan, -0.3) });
const RGEM = sprite(["..kk..", ".kwck.", "kcwcck", "kcccck", ".kcdk.", "..kk.."], { k: PAL.black, c: PAL.red, w: PAL.white, d: shade(PAL.red, -0.3) });
const KEY = sprite([".kkk....", "kyyyk...", "kywykkkk", "kyyyyyyk", ".kkkkyky", "....kkk."], { k: PAL.black, y: PAL.yellow, w: shade(PAL.yellow, 0.35) });

// ── lazily-baked backdrop art (one drawImage per tile after the first bake) ──
// the painting is cold SLATE blue-grey stone (sampled from tiles/dungeonDash.png), never purple
const STONE = "#2d3340"; // dark ashlar wall background
const BLOCK = "#5b6472"; // lit grey-blue block face (pilasters + interior pillars)
const WATER_C = "#1a5186";
function bakeFloor(variant: 0 | 1): Sprite {
  const base = variant ? "#3a4150" : "#343b49";
  const light = shade(base, 0.22);
  const dark = shade(base, -0.28);
  const mortar = shade(base, -0.42);
  return bake(T, T, (x, y) => {
    if (x === 0 || y === 0) return mortar; // grid seam between flagstones
    if (x === T - 1 || y === T - 1) return dark; // bottom-right bevel shadow
    if (x === 1 || y === 1) return light; // top-left bevel highlight
    const n = hash2(x + variant * 40, y, 71);
    if (n > 0.95) return dark; // a little crack / grime fleck
    return base;
  });
}
/** 4 ashlar-block variants, only the last carrying a faint rune glint (picked by tile position in
 *  drawRoom) so the accent reads as a rare, scattered detail, not a repeating grid */
function bakeWallBlock(seed: number, glint: boolean): Sprite {
  const light = shade(STONE, 0.3);
  const dark = shade(STONE, -0.28);
  const mortar = shade(STONE, -0.5);
  return bake(T, T, (x, y) => {
    if (x === 0 || y === 0) return mortar;
    if (x === T - 1 || y === T - 1) return dark;
    if (x === 1 || y === 1) return light;
    if (glint && x === 9 && y === 8) return "#7fd8ff";
    const n = hash2(x, y, seed);
    return n > 0.92 ? light : n < 0.12 ? dark : STONE;
  });
}
const wallVariants = () => [0, 1, 2, 3].map((i) => bakeWallBlock(51 + i * 7, i === 3)) as [Sprite, Sprite, Sprite, Sprite];
const wallVariant = (c: number, rr: number) => (c * 5 + rr * 11) % 4;
/** a chunky raised block with a lit bevel frame and a sunken inner panel, like the painting's grey
 *  pedestal pillars — distinct from the flush wall blocks so obstacles read apart from walls */
function bakePillarBlock(): Sprite {
  const light = shade(BLOCK, 0.3);
  const dark = shade(BLOCK, -0.32);
  const panel = shade(BLOCK, -0.3);
  const panelLight = shade(BLOCK, -0.12);
  const panelDark = shade(BLOCK, -0.42);
  return bake(T, T, (x, y) => {
    if (x === 0 || y === 0) return "#15181f";
    if (x === T - 1 || y === T - 1) return dark;
    if (x === 1 || y === 1) return light;
    if (x >= 4 && x <= T - 5 && y >= 4 && y <= T - 5) {
      if (x === 4 || y === 4) return panelLight;
      if (x === T - 5 || y === T - 5) return panelDark;
      return panel;
    }
    return BLOCK;
  });
}
function bakeWaterTile(frame: number): Sprite {
  return bake(T, T, (x, y) => {
    const n = fbm((x + frame * 6) * 0.5, y * 0.5, 2, 31);
    if (n > 0.62) return shade(WATER_C, 0.18);
    if (n < 0.22) return shade(WATER_C, -0.22);
    if (hash2(x, y, frame * 13 + 5) > 0.97) return PAL.cyan; // a little glinting ripple, like the painting's lit water
    return WATER_C;
  });
}
const FLAME = [
  sprite(["..y..", ".yoy.", "yoooy", ".ooo.", "..o.."], { y: PAL.yellow, o: PAL.orange }),
  sprite(["..o..", ".yyy.", "yoooy", ".ooy.", "..o.."], { y: PAL.yellow, o: PAL.orange }),
  sprite(["..y..", ".oyo.", "yooy.", ".ooo.", "..o.."], { y: PAL.yellow, o: PAL.orange }),
];
function bakeHud(): Sprite {
  return bake(W, OY, (x, y) => {
    if (y === OY - 1) return "#5ad8c8"; // a teal rule, echoes the painting's trim
    if (y === OY - 2) return shade(PAL.black, -0.15);
    const n = hash2(x, y, 13);
    return shade("#171231", y === 0 ? 0.08 : n > 0.92 ? 0.05 : 0);
  });
}
function makeArt() {
  return {
    floor: [bakeFloor(0), bakeFloor(1)] as [Sprite, Sprite],
    wallOuter: wallVariants(),
    pillar: bakePillarBlock(),
    water: [bakeWaterTile(0), bakeWaterTile(1), bakeWaterTile(2)] as [Sprite, Sprite, Sprite],
    hud: bakeHud(),
  };
}
let ART: ReturnType<typeof makeArt> | null = null;
const art = () => (ART ??= makeArt());

// ── wall-mounted set dressing (drawn ONLY on border wall tiles, which are always solid, so none
// of this can ever block a lane) ──
const BANNER = sprite(
  ["kkkkkkkk", "kyyyyyyk", "kybbbbyk", "kybwwbyk", "kybwwbyk", "kybbbbyk", "kyyyyyyk", ".kyyyyk.", "..kbbk..", "...kk..."],
  { k: PAL.black, y: "#d8b24a", b: "#2a5ea8", w: "#cfd8e6" },
);
const BARRELS = sprite(
  ["..kkkk..kkkk..", ".kbbbbkkbbbbk.", "kbdbbbkkbbdbkk", "kbbbbbkkbbbbbk", "kbdbbbkkbbdbkk", ".kbbbbkkbbbbk.", "..kkkk..kkkk.."],
  { k: PAL.black, b: PAL.brown, d: shade(PAL.brown, -0.3) },
);
const SHIELD = sprite(["..kkk..", ".kgggk.", "kgggggk", "kggyggk", ".kgggk.", "..kkk.."], { k: PAL.black, g: PAL.grey, y: PAL.yellow });

type EKind = "slime" | "bat" | "skel" | "boss" | "mslime" | "sslime";
interface Enemy {
  kind: EKind;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  vx: number;
  vy: number;
  t: number;
  move: number; // frames left in the current hop/walk
  stun: number;
  hurt: number;
  kbx: number;
  kby: number;
  dead: boolean;
  charge: number;
}
interface Item {
  kind: "gem" | "heart" | "key" | "star";
  x: number;
  y: number;
  t: number;
  taken: boolean;
}
interface Room {
  def: RoomDef;
  key: string;
  grid: string[][];
  start: string[][];
  doors: Partial<Record<Side, Edge>>;
  enemies: Enemy[];
  items: Item[];
  cleared: boolean;
  solved: boolean;
  visited: boolean;
}
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const ESIZE: Record<EKind, [number, number, number]> = {
  slime: [12, 10, 2],
  bat: [12, 8, 1],
  skel: [12, 13, 3],
  boss: [32, 26, 8],
  mslime: [20, 16, 3],
  sslime: [12, 10, 1],
};
const makeEnemy = (kind: EKind, x: number, y: number): Enemy => {
  const [w, h, hp] = ESIZE[kind];
  return { kind, x, y, w, h, hp, vx: 0, vy: 0, t: 0, move: 0, stun: 0, hurt: 0, kbx: 0, kby: 0, dead: false, charge: 0 };
};

function buildRooms() {
  const rooms = new Map<string, Room>();
  for (const def of ROOMS) {
    const grid: string[][] = [];
    for (let r = 0; r < ROWS; r++) {
      const row: string[] = [];
      for (let c = 0; c < COLS; c++) {
        if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) row.push("#");
        else row.push(def.map[r - 1]?.[c - 1] ?? ".");
      }
      grid.push(row);
    }
    const room: Room = { def, key: `${def.x},${def.y}`, grid, start: [], doors: {}, enemies: [], items: [], cleared: false, solved: false, visited: false };
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = grid[r][c];
        const x = c * T;
        const y = r * T;
        if (ch === "s") room.enemies.push(makeEnemy("slime", x + 2, y + 3));
        else if (ch === "b") room.enemies.push(makeEnemy("bat", x + 2, y + 4));
        else if (ch === "k") room.enemies.push(makeEnemy("skel", x + 2, y + 2));
        else if (ch === "B") room.enemies.push(makeEnemy("boss", x - 8, y - 4));
        else if (ch === "g") room.items.push({ kind: "gem", x: x + 5, y: y + 4, t: 0, taken: false });
        else if (ch === "h") room.items.push({ kind: "heart", x: x + 4, y: y + 4, t: 0, taken: false });
        else if (ch === "*") room.items.push({ kind: "star", x: x + 10, y: y + 2, t: 0, taken: false });
        else continue;
        grid[r][c] = ".";
      }
    }
    room.start = grid.map((row) => [...row]);
    rooms.set(room.key, room);
  }
  for (const [ax, ay, bx, by, kind] of EDGES) {
    const e: Edge = { kind, open: kind === "open" };
    const a = rooms.get(`${ax},${ay}`)!;
    const b = rooms.get(`${bx},${by}`)!;
    if (bx > ax) {
      a.doors.E = e;
      b.doors.W = e;
    } else if (bx < ax) {
      a.doors.W = e;
      b.doors.E = e;
    } else if (by > ay) {
      a.doors.S = e;
      b.doors.N = e;
    } else {
      a.doors.N = e;
      b.doors.S = e;
    }
  }
  return rooms;
}

const doorSide = (c: number, r: number): Side | null => {
  if (r === 0 && (c === 7 || c === 8)) return "N";
  if (r === ROWS - 1 && (c === 7 || c === 8)) return "S";
  if (c === 0 && r >= 5 && r <= 7) return "W";
  if (c === COLS - 1 && r >= 5 && r <= 7) return "E";
  return null;
};

type Mode = "hero" | "walk" | "fly" | "boom";

function create(seed: number): GameInstance {
  const r = rng(seed);
  const rooms = buildRooms();
  let room = rooms.get("1,2")!;
  room.visited = true;
  const hero = { x: 122, y: 98, facing: "S" as Side, hp: 6, maxHp: 6, inv: 0, kbx: 0, kby: 0, kbT: 0, swing: 0, cool: 0, anim: 0, push: 0, lastDir: "" as string };
  let entry = { x: hero.x, y: hero.y };
  let lives = 3;
  let gems = 0;
  let keys = 0;
  let tick = 0;
  let over = false;
  let won = false;
  let state: "play" | "slide" | "dead" | "win" = "play";
  let stateT = 0;
  let slide = { from: room, dx: 0, dy: 0 };
  let msg = "FIND 3 KEYS AND THE GOLDEN STAR!";
  let msgT = 200;
  let boom: { x: number; y: number; dx: number; dy: number; t: number; back: boolean; hit: Set<Enemy> } | null = null;
  let parts: Part[] = [];
  let pushAnim: { c: number; r: number; dx: number; dy: number; t: number } | null = null;

  const say = (s: string, t = 120) => {
    msg = s;
    msgT = t;
  };
  const burst = (x: number, y: number, color: string, n: number, spd = 1.4) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r.next();
      parts.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 20 + r.int(0, 8), color });
    }
  };
  const alive = (rm: Room) => rm.enemies.some((e) => !e.dead);
  const doorClosed = (rm: Room, side: Side) => {
    const e = rm.doors[side];
    if (!e) return true;
    if (rm.def.lockIn && alive(rm)) return true;
    if (e.kind === "locked") return !e.open;
    if (e.kind === "shut") return alive(rooms.get(BOSS_ROOM)!);
    return false;
  };
  const solidFor = (rm: Room, c: number, rr: number, mode: Mode) => {
    if (c < 0 || c >= COLS || rr < 0 || rr >= ROWS) return mode !== "hero";
    const side = doorSide(c, rr);
    if (side) return mode !== "hero" || doorClosed(rm, side);
    const ch = rm.grid[rr][c];
    if (ch === "." || ch === "_") return false;
    if (ch === "w") return mode === "hero" || mode === "walk";
    return true;
  };
  const blocked = (rm: Room, x: number, y: number, w: number, h: number, mode: Mode) => {
    const c0 = Math.floor(x / T);
    const c1 = Math.floor((x + w - 0.01) / T);
    const r0 = Math.floor(y / T);
    const r1 = Math.floor((y + h - 0.01) / T);
    for (let rr = r0; rr <= r1; rr++) for (let c = c0; c <= c1; c++) if (solidFor(rm, c, rr, mode)) return true;
    return false;
  };
  /** moves on each axis separately; returns which axes hit something */
  const moveBox = (e: { x: number; y: number; w: number; h: number }, dx: number, dy: number, mode: Mode) => {
    let hx = false;
    let hy = false;
    if (dx) {
      if (!blocked(room, e.x + dx, e.y, e.w, e.h, mode)) e.x += dx;
      else hx = true;
    }
    if (dy) {
      if (!blocked(room, e.x, e.y + dy, e.w, e.h, mode)) e.y += dy;
      else hy = true;
    }
    return { hx, hy };
  };

  const HB = { w: 12, h: 12 };
  const heroBox = () => ({ x: hero.x, y: hero.y, w: HB.w, h: HB.h });
  const dirVec = (s: Side) => (s === "N" ? [0, -1] : s === "S" ? [0, 1] : s === "E" ? [1, 0] : [-1, 0]);
  const swordBox = () => {
    const f = hero.facing;
    if (f === "E") return { x: hero.x + 11, y: hero.y - 1, w: 15, h: 14 };
    if (f === "W") return { x: hero.x - 14, y: hero.y - 1, w: 15, h: 14 };
    if (f === "N") return { x: hero.x - 1, y: hero.y - 14, w: 14, h: 15 };
    return { x: hero.x - 1, y: hero.y + 11, w: 14, h: 15 };
  };

  const hurtHero = (io: IO, dmg: number, fromX: number, fromY: number) => {
    if (hero.inv > 0 || state !== "play") return;
    hero.hp -= dmg;
    hero.inv = 70;
    const a = Math.atan2(hero.y + 6 - fromY, hero.x + 6 - fromX);
    hero.kbx = Math.cos(a) * 2.6;
    hero.kby = Math.sin(a) * 2.6;
    hero.kbT = 9;
    io.sfx.play("hit");
    if (hero.hp <= 0) {
      hero.hp = 0;
      state = "dead";
      stateT = 0;
      boom = null;
      io.sfx.play("die");
      burst(hero.x + 6, hero.y + 6, PAL.white, 14, 2);
    }
  };

  const dropLoot = (e: Enemy) => {
    const roll = r.next();
    const x = e.x + e.w / 2 - 4;
    const y = e.y + e.h / 2 - 4;
    if (roll < 0.35) room.items.push({ kind: "gem", x, y, t: 0, taken: false });
    else if (roll < 0.55 && hero.hp < hero.maxHp) room.items.push({ kind: "heart", x, y, t: 0, taken: false });
  };

  const damageEnemy = (io: IO, e: Enemy, dmg: number, fromX: number, fromY: number) => {
    if (e.hurt > 0 || e.dead) return;
    e.hp -= dmg;
    e.hurt = 18;
    const a = Math.atan2(e.y + e.h / 2 - fromY, e.x + e.w / 2 - fromX);
    const kb = e.kind === "boss" ? 1 : 3;
    e.kbx = Math.cos(a) * kb;
    e.kby = Math.sin(a) * kb;
    io.sfx.play("hit");
    burst(e.x + e.w / 2, e.y + e.h / 2, PAL.white, 4, 1);
    if (e.hp > 0) return;
    e.dead = true;
    burst(e.x + e.w / 2, e.y + e.h / 2, e.kind === "bat" ? PAL.purple : e.kind === "skel" ? PAL.white : e.kind === "slime" ? PAL.lime : PAL.pink, 10);
    io.sfx.play("explode");
    const pts = { slime: 100, bat: 100, skel: 300, boss: 2000, mslime: 400, sslime: 150 }[e.kind];
    io.score(pts);
    // the Goo Giant splits: big -> two medium -> four small
    const split = e.kind === "boss" ? "mslime" : e.kind === "mslime" ? "sslime" : null;
    if (split) {
      for (const s of [-1, 1]) {
        const k = makeEnemy(split, 0, 0);
        k.x = clamp(e.x + e.w / 2 - k.w / 2 + s * 10, 18, RW - 18 - k.w);
        k.y = clamp(e.y + e.h / 2 - k.h / 2, 18, RH - 18 - k.h);
        if (blocked(room, k.x, k.y, k.w, k.h, "walk")) {
          k.x = e.x;
          k.y = e.y;
        }
        k.kbx = s * 2.5;
        k.hurt = 24;
        room.enemies.push(k);
      }
      if (e.kind === "boss") {
        say("THE GOO GIANT SPLITS!", 90);
        io.sfx.noise?.(0.2, 0.2, 500, 120);
      }
    } else dropLoot(e);
  };

  const enterRoom = (side: Side, io: IO) => {
    const [gx, gy] = [room.def.x + (side === "E" ? 1 : side === "W" ? -1 : 0), room.def.y + (side === "S" ? 1 : side === "N" ? -1 : 0)];
    const next = rooms.get(`${gx},${gy}`);
    if (!next) return;
    slide = { from: room, dx: side === "E" ? 1 : side === "W" ? -1 : 0, dy: side === "S" ? 1 : side === "N" ? -1 : 0 };
    room = next;
    // unsolved push-block rooms reset their blocks so the puzzle can never get stuck
    if (!room.solved && room.start.some((row) => row.includes("M"))) room.grid = room.start.map((row) => [...row]);
    // step fully inside the new room (doors behind us may slam shut)
    if (side === "E") hero.x = T + 1;
    if (side === "W") hero.x = RW - T - HB.w - 1;
    if (side === "S") hero.y = T + 1;
    if (side === "N") hero.y = RH - T - HB.h - 1;
    entry = { x: hero.x, y: hero.y };
    boom = null;
    pushAnim = null;
    state = "slide";
    stateT = 0;
    if (!room.visited) {
      room.visited = true;
      say(room.def.name, 90);
    }
    if (room.def.lockIn && alive(room)) {
      io.sfx.play("explode");
      say("THE DOORS SLAM SHUT!", 90);
    }
  };

  /** the tile just in front of the hero (off = sideways offset in pixels) */
  const frontTile = (dx: number, dy: number, off = 0) => ({
    c: Math.floor((hero.x + 6 + dx * 9 + (dy ? off : 0)) / T),
    r: Math.floor((hero.y + 6 + dy * 9 + (dx ? off : 0)) / T),
  });
  const tryPush = (io: IO, dx: number, dy: number) => {
    for (const off of [0, -5, 5]) {
      const f = frontTile(dx, dy, off);
      if (doorSide(f.c, f.r) || "cH".includes(room.grid[f.r]?.[f.c] ?? ".")) return tryFront(io, dx, dy, f.c, f.r);
    }
    const f = frontTile(dx, dy);
    tryFront(io, dx, dy, f.c, f.r);
  };
  const tryFront = (io: IO, dx: number, dy: number, c: number, rr: number) => {
    const unlockSide = doorSide(c, rr);
    if (unlockSide) {
      const e = room.doors[unlockSide];
      if (e && e.kind === "locked" && !e.open && !(room.def.lockIn && alive(room))) {
        if (keys > 0) {
          keys--;
          e.open = true;
          io.sfx.play("powerup");
          say("UNLOCKED!", 60);
          burst(c * T + 8, rr * T + 8, PAL.yellow, 10);
        } else if (hero.push % 60 === 1) say("LOCKED. FIND A KEY!", 70);
      }
      return;
    }
    const ch = room.grid[rr]?.[c];
    if (ch === "c" || ch === "H") {
      room.grid[rr][c] = "o";
      io.sfx.play("coin");
      if (ch === "c") {
        gems += 5;
        io.score(250);
        say("5 GEMS!", 70);
      } else {
        hero.maxHp = Math.min(12, hero.maxHp + 2);
        hero.hp = hero.maxHp;
        io.score(500);
        io.sfx.play("powerup");
        say("BIG HEART! MORE HEALTH!", 110);
      }
      burst(c * T + 8, rr * T + 8, PAL.yellow, 12);
      return;
    }
    if (ch === "M" && hero.push > 14 && !pushAnim) {
      const tc = c + dx;
      const tr = rr + dy;
      const target = room.grid[tr]?.[tc];
      const busy = room.enemies.some((e) => !e.dead && overlap(e, { x: tc * T, y: tr * T, w: T, h: T }));
      if ((target === "." || target === "_") && !doorSide(tc, tr) && !busy) {
        room.grid[rr][c] = ".";
        room.grid[tr][tc] = target === "_" ? "m" : "M";
        pushAnim = { c: tc, r: tr, dx, dy, t: 12 };
        hero.push = 0;
        io.sfx.play("step");
        if (target === "_") {
          room.solved = true;
          io.sfx.play("powerup");
          say("CLICK! A KEY APPEARED!", 110);
          room.items.push({ kind: "key", x: 5 * T + 4, y: 3 * T + 4, t: 0, taken: false });
        }
      }
    }
  };

  const updateHero = (io: IO) => {
    const inp = io.input;
    hero.inv = Math.max(0, hero.inv - 1);
    hero.cool = Math.max(0, hero.cool - 1);
    if (hero.kbT > 0) {
      hero.kbT--;
      const b = heroBox();
      moveBox(b, hero.kbx, hero.kby, "hero");
      hero.x = clamp(b.x, 0, RW - HB.w);
      hero.y = clamp(b.y, 0, RH - HB.h);
      return;
    }
    // sword + boomerang
    if (inp.pressed.a && hero.swing === 0 && hero.cool === 0) {
      hero.swing = 14;
      hero.cool = 18;
      io.sfx.play("whoosh");
      io.sfx.slide?.(900, 320, 0.08, "sine", 0.05);
    }
    if (inp.pressed.b && !boom && hero.swing === 0) {
      const [dx, dy] = dirVec(hero.facing);
      boom = { x: hero.x + 2, y: hero.y + 2, dx: dx * 3.2, dy: dy * 3.2, t: 0, back: false, hit: new Set() };
      io.sfx.play("laser");
      io.sfx.slide?.(400, 760, 0.12, "square", 0.04);
    }
    if (hero.swing > 0) {
      hero.swing--;
      if (hero.swing < 12 && hero.swing > 3) {
        const sb = swordBox();
        for (const e of room.enemies) if (!e.dead && overlap(sb, e)) damageEnemy(io, e, 1, hero.x + 6, hero.y + 6);
      }
      return;
    }
    // 4-way movement: the most recently pressed direction wins
    for (const d of ["left", "right", "up", "down"] as const) if (inp.pressed[d]) hero.lastDir = d;
    let dir: "left" | "right" | "up" | "down" | "" = "";
    if (hero.lastDir && inp.held[hero.lastDir as "left"]) dir = hero.lastDir as "left";
    else dir = inp.held.left ? "left" : inp.held.right ? "right" : inp.held.up ? "up" : inp.held.down ? "down" : "";
    if (!dir) {
      hero.push = 0;
      return;
    }
    hero.facing = dir === "left" ? "W" : dir === "right" ? "E" : dir === "up" ? "N" : "S";
    const [dx, dy] = dirVec(hero.facing);
    const sp = 1.35;
    const b = heroBox();
    const res = moveBox(b, dx * sp, dy * sp, "hero");
    hero.anim += 0.12;
    if ((dx && res.hx) || (dy && res.hy)) {
      // corner assist: slide around the edge of a pillar or into a doorway (not off a block we're pushing)
      const ft = frontTile(dx, dy);
      const pushing = room.grid[ft.r]?.[ft.c] === "M";
      let slid = false;
      for (let k = 1; k <= 7 && !slid && !pushing; k++) {
        for (const s of [-1, 1]) {
          const ox = dy ? s * k : 0;
          const oy = dx ? s * k : 0;
          if (!blocked(room, b.x + ox + dx * sp, b.y + oy + dy * sp, HB.w, HB.h, "hero")) {
            moveBox(b, dy ? s : 0, dx ? s : 0, "hero");
            slid = true;
            break;
          }
        }
      }
      if (!slid) {
        hero.push++;
        tryPush(io, dx, dy);
      }
    } else hero.push = 0;
    hero.x = b.x;
    hero.y = b.y;
    if (Math.floor(hero.anim * 2) !== Math.floor((hero.anim - 0.12) * 2) && Math.floor(hero.anim * 2) % 3 === 0) {
      io.sfx.play("step");
      burst(hero.x + 6, hero.y + 12, shade(PAL.dark, -0.1), 3, 0.4);
    }
  };

  const updateBoomerang = (io: IO) => {
    if (!boom) return;
    boom.t++;
    if (!boom.back) {
      boom.x += boom.dx;
      boom.y += boom.dy;
      if (boom.t > 26 || blocked(room, boom.x, boom.y, 8, 8, "boom")) boom.back = true;
    } else {
      const tx = hero.x + 2;
      const ty = hero.y + 2;
      const d = Math.hypot(tx - boom.x, ty - boom.y);
      if (d < 7) {
        boom = null;
        return;
      }
      boom.x += ((tx - boom.x) / d) * 3.6;
      boom.y += ((ty - boom.y) / d) * 3.6;
    }
    if (boom.t % 8 === 0) io.sfx.tone(880 - (boom.t % 16) * 20, 0.03, "square", 0.05);
    if (boom.t % 3 === 0) parts.push({ x: boom.x + 3, y: boom.y + 3, vx: 0, vy: 0, life: 10, color: PAL.yellow });
    const bb = { x: boom.x, y: boom.y, w: 8, h: 8 };
    for (const e of room.enemies) {
      if (e.dead || boom.hit.has(e) || !overlap(bb, e)) continue;
      boom.hit.add(e);
      boom.back = true;
      if (e.kind === "bat" || e.kind === "sslime") damageEnemy(io, e, 1, boom.x, boom.y);
      else {
        e.stun = 120;
        io.sfx.play("blip");
      }
    }
    for (const it of room.items) if (!it.taken && it.kind !== "star" && overlap(bb, { x: it.x, y: it.y, w: 8, h: 8 })) collect(io, it);
  };

  const collect = (io: IO, it: Item) => {
    it.taken = true;
    if (it.kind === "gem") {
      gems++;
      io.score(20);
      io.sfx.play("coin");
    } else if (it.kind === "heart") {
      hero.hp = Math.min(hero.maxHp, hero.hp + 2);
      io.sfx.play("powerup");
    } else if (it.kind === "key") {
      keys++;
      io.score(200);
      io.sfx.play("powerup");
      io.sfx.tone(660, 0.07, "square", 0.06);
      io.sfx.slide?.(660, 1100, 0.12, "square", 0.05);
      say("GOT A KEY!", 80);
    } else {
      state = "win";
      stateT = 0;
      io.sfx.play("win");
      io.sfx.play("cheer");
      io.score(5000 + gems * 10 + lives * 1000);
      say("YOU FOUND THE GOLDEN STAR!", 400);
    }
    burst(it.x + 4, it.y + 4, it.kind === "gem" ? PAL.cyan : PAL.yellow, 6);
  };

  const updateEnemies = (io: IO) => {
    const hcx = hero.x + 6;
    const hcy = hero.y + 6;
    for (const e of room.enemies) {
      if (e.dead) continue;
      e.t++;
      e.hurt = Math.max(0, e.hurt - 1);
      const mode: Mode = e.kind === "bat" ? "fly" : "walk";
      if (Math.abs(e.kbx) + Math.abs(e.kby) > 0.1) {
        moveBox(e, e.kbx, e.kby, mode);
        e.kbx *= 0.8;
        e.kby *= 0.8;
      }
      if (e.stun > 0) {
        e.stun--;
      } else {
        const ex = e.x + e.w / 2;
        const ey = e.y + e.h / 2;
        const toward = () => {
          const a = Math.atan2(hcy - ey, hcx - ex);
          return [Math.cos(a), Math.sin(a)];
        };
        const pick4 = (chase: number) => {
          if (r.chance(chase)) {
            if (Math.abs(hcx - ex) > Math.abs(hcy - ey)) return [Math.sign(hcx - ex), 0];
            return [0, Math.sign(hcy - ey)];
          }
          return r.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        };
        if (e.kind === "slime" || e.kind === "sslime" || e.kind === "mslime") {
          // hop, rest, hop
          if (e.move <= 0 && e.t % (e.kind === "sslime" ? 30 : 50) === 0) {
            const [dx, dy] = pick4(e.kind === "slime" ? 0.35 : 0.6);
            const sp = e.kind === "sslime" ? 1.1 : e.kind === "mslime" ? 0.9 : 0.7;
            e.vx = dx * sp;
            e.vy = dy * sp;
            e.move = 26;
          }
          if (e.move > 0) {
            e.move--;
            const h = moveBox(e, e.vx, e.vy, "walk");
            if (h.hx) e.vx = -e.vx;
            if (h.hy) e.vy = -e.vy;
          }
        } else if (e.kind === "bat") {
          if (e.t % 70 === 0 || e.move <= 0) {
            const [tx, ty] = r.chance(0.6) ? toward() : [r.range(-1, 1), r.range(-1, 1)];
            e.vx = tx * 1.0;
            e.vy = ty * 1.0;
            e.move = r.int(40, 70);
          }
          e.move--;
          if (e.move > 12) {
            const h = moveBox(e, e.vx + Math.sin(e.t * 0.2) * 0.6, e.vy + Math.cos(e.t * 0.2) * 0.6, "fly");
            if (h.hx) e.vx = -e.vx;
            if (h.hy) e.vy = -e.vy;
          }
        } else if (e.kind === "skel") {
          if (e.charge > 0) {
            e.charge--;
            const h = moveBox(e, e.vx * 2.4, e.vy * 2.4, "walk");
            if (h.hx || h.hy) e.charge = 0;
          } else {
            if (e.move <= 0) {
              const [dx, dy] = pick4(0.3);
              e.vx = dx * 0.55;
              e.vy = dy * 0.55;
              e.move = r.int(40, 100);
            }
            e.move--;
            const h = moveBox(e, e.vx, e.vy, "walk");
            if (h.hx || h.hy) e.move = 0;
            // lined up with the hero? charge!
            if (e.t % 20 === 0 && (Math.abs(hcx - ex) < 7 || Math.abs(hcy - ey) < 7) && Math.hypot(hcx - ex, hcy - ey) < 110) {
              const horiz = Math.abs(hcy - ey) < 7;
              e.vx = horiz ? Math.sign(hcx - ex) * 0.55 : 0;
              e.vy = horiz ? 0 : Math.sign(hcy - ey) * 0.55;
              e.charge = 40;
              io.sfx.play("laser");
            }
          }
        } else if (e.kind === "boss") {
          // big slow hops toward the hero
          const cycle = e.t % 80;
          if (cycle === 0) {
            const [tx, ty] = toward();
            e.vx = tx * 1.3;
            e.vy = ty * 1.3;
            io.sfx.play("bounce");
          }
          if (cycle < 30) moveBox(e, e.vx, e.vy, "walk");
        }
      }
      if (state === "play" && overlap(heroBox(), { x: e.x + 1, y: e.y + 1, w: e.w - 2, h: e.h - 2 }) && e.stun <= 0) {
        hurtHero(io, e.kind === "skel" || e.kind === "boss" || e.kind === "mslime" ? 2 : 1, e.x + e.w / 2, e.y + e.h / 2);
      }
    }
    if (!room.cleared && room.enemies.length && !alive(room)) {
      room.cleared = true;
      if (room.def.clearKey) {
        room.items.push({ kind: "key", x: 7 * T + 4, y: 6 * T + 4, t: 0, taken: false });
        io.sfx.play("powerup");
        say("A KEY APPEARED!", 100);
      } else if (room.def.lockIn) {
        io.sfx.play("win");
        say("THE GOO GIANT IS BEATEN!", 120);
      }
    }
  };

  // ── drawing helpers ──
  // wall-mounted set dressing: picked purely by (column, row), drawn only where the border wall
  // sprite already sits (always solid, every room), so none of this can ever sit in a walkable lane
  const drawWallProp = (g: Gfx, c: number, rr: number, x: number, y: number) => {
    if (rr === 2 && (c === 0 || c === COLS - 1)) g.sprite(BANNER, x, y - 2);
    else if (rr === 1 && c === 0) g.sprite(BARRELS, x - 2, y + 3);
    else if (rr === ROWS - 1 && (c === 4 || c === COLS - 5)) {
      for (let i = 0; i < 3; i++) g.rect(x + 3 + i * 4, y + 1 + (i % 2), 2, 7 - (i % 2) * 2, "#b9c2cc");
      g.rect(x + 2, y + 8, 12, 3, "#2a2e38");
      g.rect(x + 2, y + 8, 12, 1, shade(BLOCK, 0.2));
    }
  };
  const drawRoom = (g: Gfx, rm: Room, ox: number, oy: number) => {
    for (let rr = 0; rr < ROWS; rr++) {
      for (let c = 0; c < COLS; c++) {
        const x = ox + c * T;
        const y = oy + rr * T;
        const side = doorSide(c, rr);
        const border = rr === 0 || rr === ROWS - 1 || c === 0 || c === COLS - 1;
        if (side) {
          const e = rm.doors[side];
          g.sprite(art().floor[(c + rr) % 2], x, y);
          if (!e) {
            g.sprite(art().wallOuter[wallVariant(c, rr)], x, y);
            drawWallProp(g, c, rr, x, y);
          } else if (doorClosed(rm, side)) {
            if (e.kind === "locked" && !e.open) {
              g.rect(x, y, T, T, "#1b1f27");
              g.rect(x + 1, y, 1, T, "#5ad8c8");
              g.rect(x + T - 2, y, 1, T, "#5ad8c8");
              g.rect(x + 2, y + 1, 12, 14, PAL.brown);
              g.rect(x + 2, y + 1, 12, 2, shade(PAL.brown, 0.25));
              g.rect(x + 2, y + 13, 12, 1, "#2a1608");
              g.rect(x + 7, y + 1, 2, 14, "#6a3a1a");
              g.circle(x + 8, y + 7, 3, "rgba(255,225,77,0.25)");
              g.rect(x + 6, y + 5, 4, 5, PAL.yellow);
              g.rect(x + 7, y + 7, 2, 2, PAL.black);
            } else {
              g.rect(x, y, T, T, "#1b1f27");
              for (let i = 0; i < 4; i++) g.rect(x + 1 + i * 4, y, 2, T, PAL.grey);
              g.rect(x, y + 6, T, 2, PAL.dark);
            }
          }
          continue;
        }
        const ch = rm.grid[rr][c];
        if (border) {
          g.sprite(art().wallOuter[wallVariant(c, rr)], x, y);
          drawWallProp(g, c, rr, x, y);
          continue;
        }
        g.sprite(art().floor[(c + rr) % 2], x, y);
        if (ch === "#") g.sprite(art().pillar, x, y);
        else if (ch === "t") {
          g.sprite(art().pillar, x, y);
          const fl = Math.floor((tick + c * 7) / 6) % 3;
          // a warm light pool spilling onto the floor, like the painting's lit torches
          g.circle(x + 8, y + 9, 13, "rgba(255,140,40,0.07)");
          g.circle(x + 8, y + 8, 8, "rgba(255,160,50,0.14)");
          g.circle(x + 8, y + 7, 4, "rgba(255,210,100,0.22)");
          g.rect(x + 7, y + 8, 2, 5, "#3a2414");
          g.rect(x + 6, y + 12, 4, 2, PAL.black);
          g.sprite(FLAME[fl], x + 6, y + (fl === 1 ? 3 : 2));
        } else if (ch === "w") {
          const wf = Math.floor((tick + c * 4 + rr * 6) / 10) % 3;
          g.sprite(art().water[wf as 0 | 1 | 2], x, y);
          const up = rm.grid[rr - 1]?.[c];
          const down = rm.grid[rr + 1]?.[c];
          const left = rm.grid[rr]?.[c - 1];
          const right = rm.grid[rr]?.[c + 1];
          const foam = "rgba(180,230,255,0.55)";
          if (up !== "w") g.rect(x, y, T, 1, foam);
          if (down !== "w") g.rect(x, y + T - 1, T, 1, foam);
          if (left !== "w") g.rect(x, y, 1, T, foam);
          if (right !== "w") g.rect(x + T - 1, y, 1, T, foam);
        } else if (ch === "M" || ch === "m") {
          let px = x;
          let py = y;
          if (pushAnim && rm === room && pushAnim.c === c && pushAnim.r === rr) {
            px -= pushAnim.dx * pushAnim.t * (T / 12);
            py -= pushAnim.dy * pushAnim.t * (T / 12);
          }
          g.rect(px, py, T, T, ch === "m" ? "#5a8a4a" : "#a8784a");
          g.rect(px + 1, py + 1, 14, 2, ch === "m" ? PAL.lime : PAL.tan);
          g.rect(px + 1, py + 13, 14, 2, "#6a4a2a");
          g.box(px + 4, py + 5, 8, 6, "#6a4a2a");
        } else if (ch === "_") {
          g.circle(x + 8, y + 8, 7, "rgba(255,74,74,0.12)");
          g.rect(x + 2, y + 2, 12, 12, PAL.dark);
          g.rect(x + 4, y + 4, 8, 8, PAL.grey);
          g.circle(x + 8, y + 8, 2, PAL.red);
        } else if (ch === "c" || ch === "H" || ch === "o") {
          g.rect(x + 1, y + 3, 14, 12, PAL.black);
          g.rect(x + 2, y + 4, 12, 10, ch === "o" ? "#5a3a1a" : PAL.brown);
          if (ch !== "o") {
            g.rect(x + 2, y + 4, 12, 2, shade(PAL.brown, 0.3));
            g.rect(x + 2, y + 7, 12, 2, ch === "H" ? PAL.pink : PAL.yellow);
            g.rect(x + 7, y + 7, 2, 4, PAL.yellow);
            g.rect(x + 2, y + 13, 12, 1, "#1a0e06");
          } else g.rect(x + 3, y + 5, 10, 4, PAL.black);
        }
      }
    }
  };
  const heroSprite = (): { s: Sprite; flipX: boolean } => {
    const step = Math.floor(hero.anim * 2) % 2 === 1;
    if (hero.facing === "N") return { s: HERO_UP, flipX: step };
    if (hero.facing === "S") return { s: HERO_DOWN, flipX: step };
    return { s: HERO_SIDE, flipX: hero.facing === "W" };
  };

  return {
    update(io) {
      if (over || won) return;
      tick++;
      msgT = Math.max(0, msgT - 1);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.life--;
      }
      parts = parts.filter((p) => p.life > 0);
      if (pushAnim && --pushAnim.t <= 0) pushAnim = null;
      for (const it of room.items) it.t++;

      if (state === "slide") {
        stateT++;
        if (stateT >= 32) state = "play";
        return;
      }
      if (state === "dead") {
        stateT++;
        if (stateT > 100) {
          lives--;
          if (lives <= 0) {
            over = true;
            io.gameOver();
            return;
          }
          hero.hp = hero.maxHp;
          hero.x = entry.x;
          hero.y = entry.y;
          hero.inv = 120;
          hero.swing = 0;
          state = "play";
          say(`${lives} ${lives === 1 ? "TRY" : "TRIES"} LEFT`, 80);
        }
        return;
      }
      if (state === "win") {
        stateT++;
        if (stateT % 10 === 0) burst(hero.x + 6 + r.range(-30, 30), hero.y + r.range(-30, 10), r.pick([PAL.yellow, PAL.pink, PAL.cyan]), 6);
        if (stateT > 150) {
          won = true;
          io.win();
        }
        return;
      }
      updateHero(io);
      updateBoomerang(io);
      updateEnemies(io);
      if (state !== "play") return;
      for (const it of room.items) if (!it.taken && overlap(heroBox(), { x: it.x, y: it.y, w: it.kind === "star" ? 12 : 8, h: it.kind === "star" ? 12 : 8 })) collect(io, it);
      room.items = room.items.filter((it) => !it.taken);
      room.enemies = room.enemies.filter((e) => !e.dead);
      // leave through a doorway
      const cx = hero.x + 6;
      const cy = hero.y + 6;
      if (cx < 0) enterRoom("W", io);
      else if (cx > RW) enterRoom("E", io);
      else if (cy < 0) enterRoom("N", io);
      else if (cy > RH) enterRoom("S", io);
    },

    draw(g: Gfx) {
      g.clear(PAL.black);
      if (state === "slide") {
        const k = Math.min(1, stateT / 32);
        const ox = -slide.dx * RW * k;
        const oy = -slide.dy * RH * k;
        drawRoom(g, slide.from, ox, OY + oy);
        drawRoom(g, room, ox + slide.dx * RW, OY + oy + slide.dy * RH);
      } else {
        drawRoom(g, room, 0, OY);
        g.camera(0, -OY);
        for (const it of room.items) {
          const bob = Math.floor(it.t / 12) % 2;
          if (it.kind === "gem") {
            const s = hash2(it.x, it.y, 3) > 0.5 ? RGEM : GEM;
            const sc = 1.6;
            const sw = spriteW(s) * sc;
            const sh = spriteH(s) * sc;
            g.sprite(s, it.x + 4 - sw / 2, it.y + bob + 3 - sh / 2, { scale: sc });
          } else if (it.kind === "heart") g.text("♥", it.x + 1, it.y + bob + OY, PAL.red); // text ignores the camera
          else if (it.kind === "key") {
            const sc = 1.3;
            const sw = spriteW(KEY) * sc;
            const sh = spriteH(KEY) * sc;
            g.sprite(KEY, it.x + 4 - sw / 2, it.y + bob + 4 - sh / 2, { scale: sc });
          }
          else {
            const pulse = Math.floor(it.t / 8) % 2;
            g.circle(it.x + 6, it.y + 6, 9 + pulse, "rgba(255,225,77,0.14)");
            g.circle(it.x + 6, it.y + 6, 4 + pulse, "rgba(255,245,180,0.3)");
            g.text("★", it.x + 1, it.y - 1 + OY, PAL.yellow, { size: 2 });
          }
        }
        for (const e of room.enemies) {
          if (e.dead) continue;
          const flash = e.hurt > 6; // a brief white hit-flash, then the enemy keeps fighting (not a vanishing blink)
          const fr = e.stun > 0 ? 0 : Math.floor(e.t / 12) % 2;
          const pick = <T,>(norm: T[], white: T[], i: number) => (flash ? white[i] : norm[i]);
          if (e.kind === "slime" || e.kind === "sslime") {
            const s = pick(e.kind === "slime" ? SLIME : KING, e.kind === "slime" ? WHITE_SLIME : WHITE_KING, fr);
            const sc = 1.35;
            const sw = spriteW(s) * sc;
            const sh = spriteH(s) * sc;
            g.sprite(s, e.x + e.w / 2 - sw / 2, e.y + e.h - sh, { scale: sc });
          } else if (e.kind === "mslime") g.sprite(pick(KING, WHITE_KING, fr), e.x - 2, e.y - 4, { scale: 2 });
          else if (e.kind === "boss") {
            const squash = e.t % 80 < 30 ? 1 : 0;
            g.sprite(pick(KING, WHITE_KING, squash), e.x - 2, e.y - 4, { scale: 3 });
            // a jeweled crown + star, so the Goo Giant reads as the big boss the painting shows
            const cx = e.x + e.w / 2;
            const cy = e.y - 9 + squash * 6;
            g.rect(cx - 11, cy + 4, 22, 3, PAL.yellow);
            for (let i = 0; i < 3; i++) g.rect(cx - 9 + i * 9, cy - (i === 1 ? 3 : 0), 5, 7 - (i % 2) * 2, PAL.yellow);
            g.text("★", cx - 4, cy - 14 + OY, PAL.white);
          } else if (e.kind === "bat") {
            const s = pick(BAT, WHITE_BAT, Math.floor(e.t / 6) % 2);
            const sc = 1.3;
            const sw = spriteW(s) * sc;
            const sh = spriteH(s) * sc;
            g.sprite(s, e.x + e.w / 2 - sw / 2, e.y + e.h / 2 - sh / 2, { scale: sc });
          } else {
            g.sprite(SHIELD, e.x - 3, e.y + 4, { flipX: e.vx < 0 });
            g.sprite(pick(SKEL, WHITE_SKEL, e.charge > 0 ? Math.floor(e.t / 3) % 2 : fr), e.x, e.y - 1, { flipX: e.vx < 0 });
          }
          if (e.stun > 0) g.text("*", e.x + e.w / 2 - 3 + Math.sin(e.t * 0.3) * 4, e.y - 8 + OY, PAL.yellow);
        }
        // hero + sword
        if (state !== "dead" && !(hero.inv > 0 && Math.floor(hero.inv / 3) % 2)) {
          const hs = heroSprite();
          if (hero.swing > 0) {
            const sb = swordBox();
            const f = hero.facing;
            const ext = hero.swing > 10 ? 0.5 : 1;
            const blade = PAL.white;
            if (f === "E" || f === "W") {
              const len = Math.round(12 * ext);
              const bx = f === "E" ? hero.x + 11 : hero.x + 1 - len;
              g.rect(bx, hero.y + 6, len, 3, blade);
              g.rect(f === "E" ? hero.x + 10 : hero.x, hero.y + 4, 2, 7, PAL.yellow);
            } else {
              const len = Math.round(12 * ext);
              const by = f === "S" ? hero.y + 11 : hero.y + 1 - len;
              g.rect(hero.x + 5, by, 3, len, blade);
              g.rect(hero.x + 3, f === "S" ? hero.y + 10 : hero.y, 7, 2, PAL.yellow);
            }
            if (hero.swing > 3 && hero.swing < 12) g.box(sb.x + 2, sb.y + 2, sb.w - 4, sb.h - 4, "rgba(255,255,255,0.25)");
          }
          // drawn bigger than the hitbox (HB) so the knight reads clearly, feet anchored to the hitbox floor
          const scale = 1.6;
          const sw = spriteW(hs.s) * scale;
          const sh = spriteH(hs.s) * scale;
          g.sprite(hs.s, hero.x + HB.w / 2 - sw / 2, hero.y + HB.h - sh, { flipX: hs.flipX, scale });
        }
        if (boom) {
          const spin = Math.floor(boom.t / 3) % 4;
          g.sprite(BOOMER, boom.x, boom.y, { flipX: spin === 1 || spin === 2, flipY: spin >= 2 });
        }
        for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
        g.camera(0, 0);
      }
      // HUD — a framed panel (baked texture + teal rule) with small dividers between the groups
      g.sprite(art().hud, 0, 0);
      for (let i = 0; i < hero.maxHp / 2; i++) {
        const hx = 4 + i * 9;
        const full = hero.hp >= i * 2 + 2;
        const half = hero.hp === i * 2 + 1;
        g.text("♥", hx, 4, full || half ? PAL.red : PAL.dark);
        if (half) g.rect(hx + 3, 4, 4, 8, PAL.black);
      }
      g.rect(60, 2, 1, 12, "#2e2548");
      g.sprite(GEM, 64, 4);
      g.text(`${gems}`, 74, 4, PAL.cyan);
      g.rect(92, 2, 1, 12, "#2e2548");
      g.sprite(KEY, 96, 5);
      g.text(`${keys}`, 106, 4, PAL.yellow);
      g.rect(122, 2, 1, 12, "#2e2548");
      g.text(`X${lives}`, 126, 4, PAL.white);
      g.rect(148, 2, 1, 12, "#2e2548");
      g.sprite(HERO_DOWN, 152, 2);
      // mini map, boxed so it reads as its own gadget on the panel
      g.rect(208, 0, 1, OY - 1, "#2e2548");
      g.box(210, 0, 42, 13, "#2e2548");
      for (const rm of rooms.values()) {
        const mx = 212 + rm.def.x * 10;
        const my = 1 + rm.def.y * 4;
        g.rect(mx, my, 9, 3, rm === room ? PAL.yellow : rm.visited ? PAL.grey : PAL.dark);
      }
      if (msgT > 0) {
        const y = H - 22;
        g.rect(0, y - 3, W, 13, "rgba(13,11,26,0.8)");
        g.text(msg, W / 2, y, PAL.white, { align: "center" });
      }
      if (state === "win") g.text("YOU WIN!", W / 2, 100, PAL.yellow, { align: "center", size: 2 });
    },
  };
}

export const dungeonDash: RetroGameDef = {
  id: "dungeon-dash",
  title: "Dungeon Dash",
  blurb: "Explore the dungeon, find the keys, beat the Goo Giant and grab the Golden Star!",
  genre: "Adventure",
  emoji: "🗡️",
  color: "#1fb3a3",
  controls: "✚ walk · A swing sword · B throw boomerang (stuns, grabs gems) · push blocks, open chests",
  pad: { dpad: "4", a: "Sword", b: "Boomer" },
  create,
};
