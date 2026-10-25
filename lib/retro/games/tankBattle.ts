// TANK BATTLE — a top-down tank-maze shoot-'em-up in the spirit of the 8-bit battle-city classics.
// Drive your gold tank round a brick-and-steel battlefield, blast every enemy tank before it
// blasts you, and above all keep your base (the bird emblem in its little brick nest at the
// bottom) safe. Bullets chew bricks away 4 px at a time, steel only gives to a fully powered-up
// tank, water stops tanks but not bullets, trees hide everything, ice makes you slide.
// Flashing red tanks drop power-ups: star (power up), helmet (shield), shovel (steel nest),
// clock (freeze), grenade (boom!) and tank (extra life). 8 stages, then you win.
// (Original art and stages — no borrowed names or graphics.)
import { H, W, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";

// ── layout ──
const T = 16; // one map tile
const COLS = 13;
const ROWS = 13;
const ARENA = COLS * T; // 208 x 208 battlefield
const Q = 4; // terrain cell: bricks chip away a 4 px strip at a time
const QN = ARENA / Q; // 52 x 52 cells
const OX = 16; // the arena sits in a grey frame, the HUD panel on the right
const OY = 8;
const TOTAL_STAGES = 8;
const PLAYER_X = 4 * T;
const PLAYER_Y = 12 * T;
const BASE_X = 6 * T;
const BASE_Y = 12 * T;
const SPAWN_X = [6 * T, 12 * T, 0];

const GREY = "#7c7c7c";
const INK = "#000000";

// terrain codes, one per 4x4 cell
const EMPTY = 0,
  BRICK = 1,
  STEEL = 2,
  WATER = 3,
  BUSH = 4,
  ICE = 5,
  BASE = 6;

// ── battlefields: 13x13 tiles. '.' empty  '#' brick  '%' steel  '~' water  '*' trees  '-' ice
//    half tiles: brick u(pper) b(ottom) l(eft) r(ight), steel U N L R (top bottom left right) ──
const STAGES: string[][] = [
  [
    ".............",
    ".#.#.#.#.#.#.",
    ".#.#.#.#.#.#.",
    ".#.#.#%#.#.#.",
    ".#.#.....#.#.",
    ".....#.#.....",
    "b.bb.....bb.b",
    "...u.#.#.u...",
    ".#.#.###.#.#.",
    ".#.#.#.#.#.#.",
    ".#.#.....#.#.",
    ".#.#.....#.#.",
    ".............",
  ],
  [
    ".....%.%.....",
    ".#.#.%.%.#.#.",
    ".#.#.....#.#.",
    ".#.#.###.#.#.",
    "NN.........NN",
    "...#.*.*.#...",
    ".*.#.***.#.*.",
    "...#.*.*.#...",
    "UU.........UU",
    ".#.#.###.#.#.",
    ".#.#.....#.#.",
    ".#.#.....#.#.",
    ".............",
  ],
  [
    ".............",
    ".##.##.##.##.",
    ".bb.##.##.bb.",
    ".............",
    "~~~.~~~~~.~~~",
    "~~~.~~~~~.~~~",
    "...#.....#...",
    ".*.#.%.%.#.*.",
    ".*...%.%...*.",
    "**.#.....#.**",
    "...#.....#...",
    ".##.......##.",
    ".............",
  ],
  [
    ".............",
    ".%%.#####.%%.",
    ".%.........%.",
    "...--###--...",
    ".#.-------.#.",
    ".#.-#...#-.#.",
    ".#.-#.%.#-.#.",
    ".#.-#...#-.#.",
    ".#.-------.#.",
    "...--###--...",
    ".%.........%.",
    ".%%.#...#.%%.",
    ".............",
  ],
  [
    "..*.......*..",
    ".***.#.#.***.",
    ".***.#.#.***.",
    "..*..#.#..*..",
    ".....###.....",
    "##.*.....*.##",
    "uu.***.***.uu",
    ".....*.*.....",
    ".#.#.....#.#.",
    ".#.#.%%%.#.#.",
    ".#.#.....#.#.",
    ".#.........#.",
    ".............",
  ],
  [
    ".............",
    ".###.%.%.###.",
    ".#.........#.",
    ".#.##.#.##.#.",
    "...#..#..#...",
    "R#.#.###.#.#L",
    ".........~...",
    ".#.#.###.#.#.",
    ".#.#..#..#.#.",
    ".#.##.#.##.#.",
    ".#.........#.",
    ".###.....###.",
    ".............",
  ],
  [
    ".............",
    "..#.#...#.#..",
    ".%#.#.%.#.#%.",
    "..#.......#..",
    "....~~~~~....",
    ".#.~~~~~~~.#.",
    ".#.~~*%*~~.#.",
    ".#.~~~~~~~.#.",
    "....~~~~~....",
    "..#.#...#.#..",
    ".%#.#...#.#%.",
    "..#.......#..",
    ".............",
  ],
  [
    ".............",
    ".%%%.#.#.%%%.",
    ".#.#.#.#.#.#.",
    ".#.#.....#.#.",
    "...#.%%%.#...",
    "##...#*#...##",
    ".*.#.***.#.*.",
    "##...#*#...##",
    "...#.%%%.#...",
    ".#.#.....#.#.",
    ".#.#.###.#.#.",
    ".%%%.....%%%.",
    ".............",
  ],
];
for (const s of STAGES) if (s.length !== ROWS || s.some((row) => row.length !== COLS)) throw new Error("tankBattle: bad stage layout size");

// char -> [code, cell x0, x1, y0, y1] within the tile's 4x4 cells
const TILE_CODES: Record<string, [number, number, number, number, number]> = {
  "#": [BRICK, 0, 4, 0, 4],
  u: [BRICK, 0, 4, 0, 2],
  b: [BRICK, 0, 4, 2, 4],
  l: [BRICK, 0, 2, 0, 4],
  r: [BRICK, 2, 4, 0, 4],
  "%": [STEEL, 0, 4, 0, 4],
  U: [STEEL, 0, 4, 0, 2],
  N: [STEEL, 0, 4, 2, 4],
  L: [STEEL, 0, 2, 0, 4],
  R: [STEEL, 2, 4, 0, 4],
  "~": [WATER, 0, 4, 0, 4],
  "*": [BUSH, 0, 4, 0, 4],
  "-": [ICE, 0, 4, 0, 4],
};

// the base's brick nest: a ring 8 px thick round the 16x16 base (cells), as in the classics
const NEST: number[] = [];
for (let cy = 46; cy < 52; cy++)
  for (let cx = 22; cx < 30; cx++) {
    const inBase = cx >= 24 && cx < 28 && cy >= 48;
    if (!inBase) NEST.push(cy * QN + cx);
  }

function buildMap(stage: number): Uint8Array {
  const m = new Uint8Array(QN * QN);
  const layout = STAGES[stage % STAGES.length];
  const fill = (tx: number, ty: number, code: number, x0 = 0, x1 = 4, y0 = 0, y1 = 4) => {
    for (let cy = y0; cy < y1; cy++) for (let cx = x0; cx < x1; cx++) m[(ty * 4 + cy) * QN + tx * 4 + cx] = code;
  };
  for (let ty = 0; ty < ROWS; ty++)
    for (let tx = 0; tx < COLS; tx++) {
      const d = TILE_CODES[layout[ty][tx]];
      if (d) fill(tx, ty, d[0], d[1], d[2], d[3], d[4]);
    }
  for (const x of SPAWN_X) fill(x / T, 0, EMPTY);
  fill(PLAYER_X / T, PLAYER_Y / T, EMPTY);
  for (let ty = 11; ty < 13; ty++) for (let tx = 5; tx < 8; tx++) fill(tx, ty, EMPTY);
  for (const i of NEST) m[i] = BRICK;
  fill(BASE_X / T, BASE_Y / T, BASE);
  return m;
}

// ── pixel art ──
const transpose = (rows: string[]) => rows[0].split("").map((_, x) => rows.map((r) => r[x]).join(""));
const quarters = (rows: string[]) => [0, 1].flatMap((qy) => [0, 1].map((qx) => rows.slice(qy * 4, qy * 4 + 4).map((r) => r.slice(qx * 4, qx * 4 + 4))));

// 8x8 terrain patterns (they repeat every 8 px, so a 4x4 cell takes the matching quarter and
// chewed walls keep a continuous pattern)
const BRICK_ROWS = ["ooooooog", "rrrrrrrg", "rrrrrrdg", "gggggggg", "ooogoooo", "rrrgrrrr", "rrdgrrrd", "gggggggg"];
const BRICK_PAL = { o: "#d8703a", r: "#a8401a", d: "#6a2408", g: "#9c9c9c" };
const STEEL_ROWS = ["wwwwwwwd", "whhhhhad", "whaaaaad", "whaaaaad", "whaaaaad", "whaaaaad", "waaaaaad", "dddddddd"];
const STEEL_PAL = { w: "#ffffff", h: "#e4e4ec", a: "#b4b4c0", d: "#5c5c6c" };
const WATER_ROWS = [
  ["bbbbbbbb", "bwwbbbbb", "wbbwbbbd", "bbbbbwwb", "bdbbwbbw", "bbbbbbbb", "bbwwbbdb", "bwbbwbbb"],
  ["bbbbbbbb", "bbbwwbbb", "dbbwbbwb", "wwbbbbbb", "bbwbdbbb", "bbbbbbbb", "dbbbbwwb", "bbbbwbbw"],
];
const WATER_PAL = { b: "#2848d8", w: "#a8c8ff", d: "#1830a0" };
const BUSH_ROWS = [".mml.mm.", "mlmmmlmd", "mmdmmmdm", ".mmdlmm.", "lmm.mmdm", "mdmmlmm.", "mmmdmmdm", ".dm.mdm."];
const BUSH_PAL = { m: "#2a9a2a", l: "#8ad84a", d: "#0a5a1a" };
const ICE_ROWS = ["iiiiiijw", "iiiiijwi", "iiiijwii", "iiijwiii", "iijwiiii", "ijwiiiii", "jwiiiiij", "wiiiiiji"];
const ICE_PAL = { i: "#c8d0e0", j: "#8890a8", w: "#ffffff" };

interface TileArt {
  full: Sprite[];
  q: Sprite[][];
}
const tileArt = (frames: string[][], pal: Record<string, string>): TileArt => ({ full: frames.map((f) => sprite(f, pal)), q: frames.map((f) => quarters(f).map((r) => sprite(r, pal))) });
const ART: Record<number, TileArt> = {
  [BRICK]: tileArt([BRICK_ROWS], BRICK_PAL),
  [STEEL]: tileArt([STEEL_ROWS], STEEL_PAL),
  [WATER]: tileArt(WATER_ROWS, WATER_PAL),
  [BUSH]: tileArt([BUSH_ROWS], BUSH_PAL),
  [ICE]: tileArt([ICE_ROWS], ICE_PAL),
};

// the base: a bird with its wings raised; and what's left of it
const BASE_SPR = sprite(
  [
    "................",
    ".k....kkkk....k.",
    ".kk..kwwwwk..kk.",
    ".khk.kwkwwk.khk.",
    ".khhkkwwwwkkhhk.",
    ".khhhkkwwkkhhhk.",
    "..khhhhkkhhhhk..",
    "..khahhhhhhahk..",
    "...khahhhhahk...",
    "....khhkkhhk....",
    ".....khhhhk.....",
    "....khakkahk....",
    "...khak..kahk...",
    "...kkk....kkk...",
    "..dddddddddddd..",
    "................",
  ],
  { k: "#202020", h: "#b8b8b8", a: "#7c7c7c", w: "#ffffff", d: "#4c4c4c" },
);
const BASE_DEAD_SPR = sprite(
  [
    "................",
    "................",
    "................",
    ".......k........",
    "......kwk.......",
    "......kwwk..r...",
    ".......kk..r.r..",
    "....k.......r...",
    "...kak..k.......",
    "..khhak.kak..k..",
    ".khhahkkhahkkak.",
    "khahhhhhhhahhhak",
    "kaahhakhahhaahhk",
    "kddddddddddddddk",
    "................",
    "................",
  ],
  { k: "#202020", h: "#9c9c9c", a: "#5c5c5c", w: "#ffffff", d: "#4c4c4c", r: "#e8401a" },
);

// tanks: built from a few parameters so every kind has its own silhouette; drawn barrel-up,
// transposed for the sideways facings, mirrored for the other two
interface Design {
  tread0: number;
  hx0: number;
  hx1: number;
  hy0: number;
  hy1: number;
  tr: number;
  tcy: number;
  barY0: number;
  thick?: boolean;
  brake?: boolean;
  rivets?: boolean;
  grille?: boolean;
  stripe?: boolean;
}
const DESIGNS: Record<string, Design> = {
  p0: { tread0: 2, hx0: 3, hx1: 12, hy0: 4, hy1: 14, tr: 3.6, tcy: 9.5, barY0: 1 },
  p1: { tread0: 2, hx0: 3, hx1: 12, hy0: 4, hy1: 14, tr: 3.6, tcy: 9.5, barY0: 0, grille: true },
  p2: { tread0: 1, hx0: 3, hx1: 12, hy0: 3, hy1: 14, tr: 4.1, tcy: 9.5, barY0: 0, grille: true, rivets: true },
  p3: { tread0: 1, hx0: 3, hx1: 12, hy0: 3, hy1: 15, tr: 4.6, tcy: 9.5, barY0: 0, thick: true, brake: true, rivets: true },
  basic: { tread0: 3, hx0: 3, hx1: 12, hy0: 5, hy1: 14, tr: 3.2, tcy: 10, barY0: 2, grille: true },
  fast: { tread0: 1, hx0: 4, hx1: 11, hy0: 2, hy1: 15, tr: 2.7, tcy: 10.5, barY0: 0, stripe: true },
  power: { tread0: 2, hx0: 3, hx1: 12, hy0: 4, hy1: 14, tr: 3.6, tcy: 10, barY0: 0, brake: true },
  armor: { tread0: 1, hx0: 3, hx1: 12, hy0: 2, hy1: 15, tr: 4.6, tcy: 9.5, barY0: 0, thick: true, rivets: true },
};
function tankRows(d: Design, phase: number): string[] {
  const g: string[][] = Array.from({ length: 16 }, () => Array(16).fill("."));
  const put = (x: number, y: number, c: string) => {
    if (x >= 0 && x < 16 && y >= 0 && y < 16) g[y][x] = c;
  };
  // treads: 3 px each side with ridges that roll as the tank drives
  for (let y = d.tread0; y < 16; y++)
    for (let i = 0; i < 3; i++) {
      const end = y === d.tread0 || y === 15;
      const c = i === 0 || end ? "k" : (y + phase) % 3 === 0 ? "T" : "t";
      put(i, y, c);
      put(15 - i, y, c);
    }
  // hull
  for (let y = d.hy0; y <= d.hy1; y++)
    for (let x = d.hx0; x <= d.hx1; x++) {
      const corner = (x === d.hx0 || x === d.hx1) && (y === d.hy0 || y === d.hy1);
      put(x, y, corner ? "k" : x === d.hx0 || y === d.hy0 ? "h" : x === d.hx1 || y === d.hy1 ? "d" : "a");
    }
  if (d.grille) for (let x = d.hx0 + 2; x <= d.hx1 - 2; x += 2) put(x, d.hy1 - 1, "d");
  if (d.stripe) for (let y = d.hy0 + 1; y < d.hy1; y++) put(8, y, "h");
  if (d.rivets)
    for (const [x, y] of [
      [d.hx0 + 1, d.hy0 + 1],
      [d.hx1 - 1, d.hy0 + 1],
      [d.hx0 + 1, d.hy1 - 1],
      [d.hx1 - 1, d.hy1 - 1],
    ])
      put(x, y, "w");
  // barrel (drawn before the turret so the turret sits over its root)
  const bx0 = d.thick ? 6 : 7;
  const bx1 = d.thick ? 9 : 8;
  for (let y = d.barY0; y < d.tcy; y++)
    for (let x = bx0; x <= bx1; x++) put(x, y, d.thick && (x === bx0 || x === bx1) ? "k" : x === bx0 || (d.thick && x === bx0 + 1) ? "h" : "g");
  if (d.brake) for (let x = bx0 - 1; x <= bx1 + 1; x++) put(x, d.barY0 + 1, x === bx0 - 1 || x === bx1 + 1 ? "k" : "g");
  // turret
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - 8;
      const dy = y + 0.5 - d.tcy;
      const r = Math.hypot(dx, dy);
      if (r > d.tr) continue;
      put(x, y, r > d.tr - 1 ? "k" : dx + dy < -d.tr * 0.45 ? "h" : dx + dy > d.tr * 0.4 ? "d" : "a");
    }
  put(Math.round(8 - d.tr * 0.45) - 1, Math.round(d.tcy - d.tr * 0.45) - 1, "w");
  return g.map((row) => row.join(""));
}
const TANK_PALS: Record<string, Record<string, string>> = {
  gold: { k: "#3a2600", a: "#e8b818", h: "#fff07a", d: "#a07000", g: "#8a6000", t: "#c89a30", T: "#5a4410", w: "#ffffff" },
  silver: { k: "#1a1a2a", a: "#bcbcc8", h: "#ffffff", d: "#6c6c7c", g: "#5a5a6a", t: "#9c9cac", T: "#3c3c4c", w: "#ffffff" },
  red: { k: "#2a0800", a: "#e83a1a", h: "#ff9a7a", d: "#8a1a08", g: "#6a1a08", t: "#c06040", T: "#5a1a08", w: "#ffffff" },
  green: { k: "#08200c", a: "#3aa84a", h: "#9ae07a", d: "#1a6a2a", g: "#1a5a24", t: "#5a9a5a", T: "#1a3a1a", w: "#ffffff" },
  amber: { k: "#2a1a00", a: "#d8a030", h: "#ffe08a", d: "#8a5a10", g: "#6a4a10", t: "#b08a40", T: "#4a3a10", w: "#ffffff" },
  violet: { k: "#1a0830", a: "#9a6ae0", h: "#d8c0ff", d: "#5a3a9a", g: "#4a2a7a", t: "#8a7ab0", T: "#3a2a5a", w: "#ffffff" },
};
const tankCache = new Map<string, { up: Sprite; side: Sprite }>();
function tankSprite(design: string, pal: string, phase: number) {
  const key = `${design}|${pal}|${phase}`;
  let s = tankCache.get(key);
  if (!s) {
    const rows = tankRows(DESIGNS[design], phase);
    s = { up: sprite(rows, TANK_PALS[pal]), side: sprite(transpose(rows), TANK_PALS[pal]) };
    tankCache.set(key, s);
  }
  return s;
}

const SHELL_UP = ["khk", "hwh", "hwh", "kdk"];
const SHELL_PAL = { k: "#5c5c5c", h: "#d8d8d8", w: "#ffffff", d: "#8a8a8a" };
const SHELL = { up: sprite(SHELL_UP, SHELL_PAL), side: sprite(transpose(SHELL_UP), SHELL_PAL) };

// explosions: white-hot centre, red, then a ragged purple edge (seeded noise so they're stable)
function boomRows(r: number, seed: number) {
  const n = r * 2 + 1;
  const rows: string[] = [];
  for (let y = 0; y < n; y++) {
    let row = "";
    for (let x = 0; x < n; x++) {
      const h = Math.abs(Math.sin(x * 12.9898 + y * 78.233 + seed * 37.7) * 43758.5453) % 1;
      const d = Math.hypot(x - r, y - r) + (h - 0.5) * r * 0.55;
      row += h < 0.1 && d > r * 0.45 ? "." : d < r * 0.38 ? "w" : d < r * 0.68 ? "r" : d < r ? "p" : ".";
    }
    rows.push(row);
  }
  return rows;
}
const BOOM_PAL = { w: "#ffffff", r: "#e8401a", p: "#7a2ab0" };
const BOOM_SMALL = [3, 5, 7].map((r) => sprite(boomRows(r, r), BOOM_PAL));
const BOOM_BIG = [11, 15].map((r) => sprite(boomRows(r, r + 3), BOOM_PAL));

// power-ups
type PowKind = "star" | "helmet" | "shovel" | "clock" | "grenade" | "tank";
const POW_PAL = { k: "#000000", y: "#ffd82a", h: "#c8c8d8", w: "#ffffff", r: "#e8401a", b: "#9a5a2a", g: "#3aa84a", G: "#1a6a2a" };
const POW_ART: Record<PowKind, string[]> = {
  star: ["......k......", ".....kyk.....", ".....kyk.....", "....kyyyk....", "kkkkkyyykkkkk", "kyyyyyyyyyyyk", ".kyyywyyyyyk.", "..kyyyyyyyk..", "...kyyyyyk...", "..kyyykyyyk..", "..kyykkkyyk..", ".kyk.....kyk.", ".kk.......kk."],
  helmet: [".............", "....kkkkk....", "..kkhhhhhkk..", ".khwwhhhhhhk.", ".khwhhhhhhhk.", "khwhhhhhhhhhk", "khhhhhhhhhhhk", "khhhhhhkkkkkk", "khhhhhk......", "khhhhhk......", "kkkkkkk......", ".............", "............."],
  clock: ["....kkkkk....", "..kkwwwwwkk..", ".kwwwwkwwwwk.", ".kwwwwkwwwwk.", "kwwwwwkwwwwwk", "kwwwwwkwwwwwk", "kwwwwwkkkkwwk", "kwwwwwwwwwwwk", "kwwwwwwwwwwwk", ".kwwwwwwwwwk.", ".kwwwwwwwwwk.", "..kkwwwwwkk..", "....kkkkk...."],
  shovel: [".........kkk.", "........kbbk.", ".......kbbk..", "......kbbk...", ".....kbbk....", "..kkkbbk.....", ".khhkbk......", "khhhhkk......", "khwhhhk......", "khwhhhk......", ".khhhk.......", "..kkk........", "............."],
  grenade: ["......kkk....", ".....khhk....", "....kkkkkk...", "...kGgggGk.k.", "..kgggggggkhk", "..kgGgggGgk..", "..kgggggggk..", "..kgGgggGgk..", "..kgggggggk..", "..kgGgggGgk..", "...kgggggk...", "....kkkkk....", "............."],
  tank: ["......kk.....", "......yk.....", "......yk.....", ".kkk.kykk.kkk", ".kyk.kyyk.kyk", ".kykkyyyykkyk", ".kykyyyyyykyk", ".kykyywyyykyk", ".kykyyyyyykyk", ".kykkyyyykkyk", ".kyk.kkkk.kyk", ".kkk......kkk", "............."],
};
const POW_SPR = Object.fromEntries(Object.entries(POW_ART).map(([k, rows]) => [k, sprite(rows, POW_PAL)])) as Record<PowKind, Sprite>;

// HUD icons
const ICON_ENEMY = sprite(["k.kkk.k", "kkkkkkk", "kkk.kkk", "kk...kk", "kkk.kkk", "kkkkkkk", "k.....k"], { k: INK });
const ICON_LIFE = sprite(["k.kkk.k", "kkkkkkk", "kkk.kkk", "kk...kk", "kkkkkkk", "k.....k"], { k: INK });
const ICON_FLAG = sprite(["kooooo..", "kooooooo", "koooooo.", "kooo....", "k.......", "k.......", "k.......", "k.......", "kkk....."], { k: INK, o: "#e86a1a" });

// ── game ──
type Dir = "up" | "down" | "left" | "right";
type EnemyKind = "basic" | "fast" | "power" | "armor";
const DIRS: Dir[] = ["up", "down", "left", "right"];
const DV: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const ENEMY: Record<EnemyKind, { hp: number; speed: number; shot: number; pts: number }> = {
  basic: { hp: 1, speed: 0.5, shot: 2.4, pts: 100 },
  fast: { hp: 1, speed: 1.15, shot: 2.6, pts: 200 },
  power: { hp: 1, speed: 0.65, shot: 4, pts: 300 },
  armor: { hp: 4, speed: 0.5, shot: 2.6, pts: 400 },
};
const KINDS: EnemyKind[] = ["basic", "fast", "power", "armor"];

interface Tank {
  x: number; // sprite top-left (16x16); the hitbox is the 14x14 inside it
  y: number;
  dir: Dir;
  kind: "player" | EnemyKind;
  hp: number;
  speed: number;
  cool: number;
  turnT: number;
  spawnT: number; // twinkling in (not solid, can't be hit)
  step: number; // distance driven, rolls the treads
  bonus: boolean;
  alive: boolean;
  shots: number;
}
interface Bullet {
  x: number;
  y: number;
  dir: Dir;
  speed: number;
  owner: Tank;
  pierce: boolean;
  dead: boolean;
}

function create(seed: number): GameInstance {
  const rnd = rng(seed);
  let stage = 0;
  let map = buildMap(0);
  let state: "curtain" | "play" | "over" | "tally" | "won" = "curtain";
  let stateT = 0;
  let frame = 0;
  let lives = 3;
  let level = 0; // 0..3 stars
  let baseAlive = true;
  let shieldT = 0;
  let shovelT = 0;
  let freezeT = 0;
  let clearT = 0;
  let slideT = 0;
  let gameOverSent = false;

  const player: Tank = { x: PLAYER_X, y: PLAYER_Y, dir: "up", kind: "player", hp: 1, speed: 1.1, cool: 0, turnT: 0, spawnT: 40, step: 0, bonus: false, alive: true, shots: 0 };
  let respawnT = -1;
  let enemies: Tank[] = [];
  let bullets: Bullet[] = [];
  let roster: EnemyKind[] = [];
  let spawned = 0;
  let spawnTimer = 0;
  let spawnSlot = 0;
  let kills: Record<EnemyKind, number> = { basic: 0, fast: 0, power: 0, armor: 0 };
  let pow: { x: number; y: number; kind: PowKind; t: number } | null = null;
  const booms: { x: number; y: number; t: number; big: boolean }[] = [];
  let pops: { x: number; y: number; t: number; text: string }[] = [];

  const makeRoster = (s: number) => {
    const n = Math.min(20, 12 + s);
    const out: EnemyKind[] = [];
    for (let i = 0; i < n; i++) {
      const v = rnd.next();
      const armor = Math.min(0.4, 0.04 + s * 0.06);
      const power = Math.min(0.3, 0.08 + s * 0.035);
      const fast = Math.min(0.3, 0.14 + s * 0.03);
      out.push(v < armor ? "armor" : v < armor + power ? "power" : v < armor + power + fast ? "fast" : "basic");
    }
    return out;
  };

  const resetPlayer = () => {
    Object.assign(player, { x: PLAYER_X, y: PLAYER_Y, dir: "up", alive: true, spawnT: 40, shots: 0, cool: 0 });
    respawnT = -1;
  };

  const newStage = () => {
    map = buildMap(stage);
    baseAlive = true;
    shovelT = freezeT = clearT = shieldT = 0;
    enemies = [];
    bullets = [];
    pow = null;
    pops = [];
    roster = makeRoster(stage);
    spawned = 0;
    spawnTimer = 20;
    spawnSlot = 0;
    kills = { basic: 0, fast: 0, power: 0, armor: 0 };
    resetPlayer();
    state = "curtain";
    stateT = 0;
  };
  newStage();

  // ── terrain ──
  const cell = (cx: number, cy: number) => (cx < 0 || cy < 0 || cx >= QN || cy >= QN ? STEEL : map[cy * QN + cx]);
  const solid = (c: number) => c === BRICK || c === STEEL || c === WATER || c === BASE;
  const blocked = (x: number, y: number) => {
    if (x < 0 || y < 0 || x > ARENA - 16 || y > ARENA - 16) return true;
    const cx0 = Math.floor((x + 1) / Q);
    const cx1 = Math.floor((x + 14.99) / Q);
    const cy0 = Math.floor((y + 1) / Q);
    const cy1 = Math.floor((y + 14.99) / Q);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) if (solid(cell(cx, cy))) return true;
    return false;
  };
  const box = (t: Tank) => ({ x: t.x + 1, y: t.y + 1, w: 14, h: 14 });
  const tankAt = (self: Tank | null, x: number, y: number) => {
    const b = { x: x + 1, y: y + 1, w: 14, h: 14 };
    for (const t of [player, ...enemies]) if (t !== self && t.alive && t.spawnT <= 0 && overlap(b, box(t))) return true;
    return false;
  };

  const boom = (x: number, y: number, big = false) => booms.push({ x, y, t: 0, big });
  const pop = (x: number, y: number, text: string) => pops.push({ x, y, t: 0, text });

  const moveTank = (t: Tank, dir: Dir, dist = t.speed) => {
    if (t.dir !== dir) {
      t.dir = dir;
      // turning snaps to the 8 px grid across the travel, so a tank lines up with every gap
      if (dir === "up" || dir === "down") {
        const sx = Math.round(t.x / 8) * 8;
        if (!blocked(sx, t.y)) t.x = sx;
      } else {
        const sy = Math.round(t.y / 8) * 8;
        if (!blocked(t.x, sy)) t.y = sy;
      }
    }
    if (dist <= 0) return true;
    const [dx, dy] = DV[dir];
    const nx = t.x + dx * dist;
    const ny = t.y + dy * dist;
    if (!blocked(nx, ny) && !tankAt(t, nx, ny)) {
      t.x = nx;
      t.y = ny;
      t.step += dist;
      return true;
    }
    return false;
  };

  const fire = (io: IO, t: Tank) => {
    const [dx, dy] = DV[t.dir];
    const isP = t.kind === "player";
    bullets.push({
      x: t.x + 8 + dx * 7,
      y: t.y + 8 + dy * 7,
      dir: t.dir,
      speed: isP ? (level >= 1 ? 4.6 : 3.2) : ENEMY[t.kind as EnemyKind].shot,
      owner: t,
      pierce: isP && level >= 3,
      dead: false,
    });
    t.shots++;
    if (isP) io.sfx.play("shoot");
  };

  const dropPower = () => {
    const kinds: PowKind[] = ["star", "star", "helmet", "shovel", "clock", "grenade", "tank"];
    for (let tries = 0; tries < 20; tries++) {
      const x = rnd.int(0, 24) * 8;
      const y = rnd.int(0, 22) * 8;
      if (y > 150 && x > 64 && x < 136) continue; // never on the base
      pow = { x, y, kind: rnd.pick(kinds), t: 0 };
      return;
    }
  };

  const killEnemy = (io: IO, e: Tank, scored = true) => {
    e.alive = false;
    const k = e.kind as EnemyKind;
    kills[k]++;
    boom(e.x + 8, e.y + 8, true);
    io.sfx.play("explode");
    if (scored) {
      io.score(ENEMY[k].pts);
      pop(e.x + 2, e.y + 4, String(ENEMY[k].pts));
    }
  };

  const hitEnemy = (io: IO, e: Tank) => {
    if (e.bonus) {
      e.bonus = false;
      dropPower();
      io.sfx.play("powerup");
    }
    e.hp--;
    if (e.hp <= 0) killEnemy(io, e);
    else io.sfx.play("hit");
  };

  const killPlayer = (io: IO) => {
    if (shieldT > 0 || player.spawnT > 0 || !player.alive) return;
    player.alive = false;
    boom(player.x + 8, player.y + 8, true);
    io.sfx.play("die");
    lives--;
    level = 0;
    if (lives <= 0) {
      if (state === "play") {
        state = "over";
        stateT = 0;
      }
    } else respawnT = 0;
  };

  const loseBase = (io: IO) => {
    if (!baseAlive) return;
    baseAlive = false;
    boom(BASE_X + 8, BASE_Y + 8, true);
    io.sfx.play("explode");
    if (state === "play") {
      state = "over";
      stateT = 0;
    }
  };

  const setNest = (code: number) => {
    for (const i of NEST) map[i] = code;
  };

  const applyPower = (io: IO, kind: PowKind) => {
    io.sfx.play("powerup");
    io.score(500);
    pop(player.x, player.y - 4, "500");
    if (kind === "star") level = Math.min(3, level + 1);
    else if (kind === "helmet") shieldT = 600;
    else if (kind === "shovel") {
      shovelT = 1200;
      setNest(STEEL);
    } else if (kind === "clock") freezeT = 600;
    else if (kind === "tank") lives = Math.min(9, lives + 1);
    else for (const e of enemies) if (e.alive && e.spawnT <= 0) killEnemy(io, e, false);
  };

  // a bullet's impact: bricks lose a 4 px strip 16 px wide (two strips deep for a full-power
  // tank, which also cuts steel 8 px at a time)
  const impact = (io: IO, b: Bullet, cx: number, cy: number) => {
    const vertical = b.dir === "up" || b.dir === "down";
    const along = vertical ? Math.floor(b.x / Q) : Math.floor(b.y / Q);
    const deep = b.pierce ? 2 : 1;
    const step = b.dir === "up" || b.dir === "left" ? -1 : 1;
    let any = false;
    for (let k = 0; k < deep; k++)
      for (let o = -2; o < 2; o++) {
        const x = vertical ? along + o : cx + step * k;
        const y = vertical ? cy + step * k : along + o;
        if (x < 0 || y < 0 || x >= QN || y >= QN) continue;
        const c = map[y * QN + x];
        if (c === BRICK) {
          map[y * QN + x] = EMPTY;
          any = true;
        } else if (c === STEEL && b.pierce) {
          const x0 = x & ~1;
          const y0 = y & ~1;
          for (const [ax, ay] of [
            [x0, y0],
            [x0 + 1, y0],
            [x0, y0 + 1],
            [x0 + 1, y0 + 1],
          ])
            if (map[ay * QN + ax] === STEEL) map[ay * QN + ax] = EMPTY;
          any = true;
        }
      }
    boom(b.x, b.y);
    if (b.owner === player) io.sfx.play(any ? "hit" : "blip");
  };

  const updateBullets = (io: IO) => {
    for (const b of bullets) {
      if (b.dead) continue;
      const [dx, dy] = DV[b.dir];
      let left = b.speed;
      while (left > 0 && !b.dead) {
        const s = Math.min(2, left);
        left -= s;
        b.x += dx * s;
        b.y += dy * s;
        if (b.x < 0 || b.y < 0 || b.x >= ARENA || b.y >= ARENA) {
          b.dead = true;
          boom(Math.max(0, Math.min(ARENA, b.x)), Math.max(0, Math.min(ARENA, b.y)));
          if (b.owner === player) io.sfx.play("blip");
          break;
        }
        // the bullet's nose, 4 px wide across its travel
        const vertical = dy !== 0;
        const fx = b.x + dx * 2;
        const fy = b.y + dy * 2;
        for (const o of [-2, 1.9]) {
          const cx = Math.floor((vertical ? fx + o : fx) / Q);
          const cy = Math.floor((vertical ? fy : fy + o) / Q);
          const c = cell(cx, cy);
          if (c === BASE) {
            if (b.owner !== player) loseBase(io);
            b.dead = true;
            boom(b.x, b.y);
            break;
          }
          if (c === BRICK || c === STEEL) {
            impact(io, b, cx, cy);
            b.dead = true;
            break;
          }
        }
        if (b.dead) break;
        const bb = { x: b.x - 2, y: b.y - 2, w: 4, h: 4 };
        if (b.owner === player) {
          for (const e of enemies)
            if (e.alive && e.spawnT <= 0 && overlap(bb, box(e))) {
              hitEnemy(io, e);
              b.dead = true;
              boom(b.x, b.y);
              break;
            }
        } else if (player.alive && player.spawnT <= 0 && overlap(bb, box(player))) {
          if (shieldT > 0) io.sfx.play("blip");
          else killPlayer(io);
          b.dead = true;
        }
      }
    }
    // shells meeting nose to nose cancel out (only the kid's against the enemies')
    for (const a of bullets)
      for (const c of bullets)
        if (a !== c && !a.dead && !c.dead && (a.owner === player) !== (c.owner === player) && Math.abs(a.x - c.x) < 4 && Math.abs(a.y - c.y) < 4) {
          a.dead = c.dead = true;
        }
    for (const b of bullets) if (b.dead) b.owner.shots = Math.max(0, b.owner.shots - 1);
    bullets = bullets.filter((b) => !b.dead);
  };

  const enemyAI = (io: IO, e: Tank) => {
    if (e.spawnT > 0) {
      e.spawnT--;
      return;
    }
    if (freezeT > 0) return;
    e.turnT--;
    const moved = moveTank(e, e.dir);
    if (!moved || e.turnT <= 0) {
      // like the classics: mostly they head for your base, sometimes for you, sometimes anywhere
      const v = rnd.next();
      let d: Dir;
      if (v < 0.4) {
        const dx = BASE_X - e.x;
        d = rnd.chance(0.5) && Math.abs(dx) > 8 ? (dx > 0 ? "right" : "left") : "down";
      } else if (v < 0.6 && player.alive) {
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      } else d = rnd.pick(DIRS);
      if (!moved && d === e.dir) d = rnd.pick(DIRS);
      e.turnT = moved ? rnd.int(60, 200) : rnd.int(8, 40);
      moveTank(e, d, 0);
    }
    e.cool--;
    if (e.cool <= 0 && e.shots === 0) {
      fire(io, e);
      e.cool = rnd.int(30, 110);
    }
  };

  const trySpawn = () => {
    if (spawned >= roster.length || enemies.length >= 4) return;
    if (--spawnTimer > 0) return;
    const x = SPAWN_X[spawnSlot % 3];
    spawnSlot++;
    if (tankAt(null, x, 0)) {
      spawnTimer = 10;
      return;
    }
    const kind = roster[spawned];
    enemies.push({ x, y: 0, dir: "down", kind, hp: ENEMY[kind].hp, speed: ENEMY[kind].speed, cool: rnd.int(30, 80), turnT: rnd.int(40, 120), spawnT: 40, step: 0, bonus: spawned % 7 === 3, alive: true, shots: 0 });
    spawned++;
    spawnTimer = Math.max(40, 150 - stage * 12);
  };

  return {
    update(io) {
      frame++;
      for (let i = booms.length - 1; i >= 0; i--) if (++booms[i].t > (booms[i].big ? 32 : 12)) booms.splice(i, 1);
      for (const p of pops) p.t++;
      pops = pops.filter((p) => p.t < 50);
      stateT++;

      if (state === "won") return;
      if (state === "curtain") {
        if (stateT === 30) io.sfx.play("powerup");
        if (stateT >= 110) {
          state = "play";
          stateT = 0;
        }
        return;
      }
      if (state === "tally") {
        if (stateT % 30 === 0 && stateT <= 120) io.sfx.play("coin");
        if (stateT > 220) {
          stage++;
          if (stage >= TOTAL_STAGES) {
            state = "won";
            io.score(1000 + lives * 500);
            io.sfx.play("win");
            io.win();
            return;
          }
          newStage();
        }
        return;
      }
      if (state === "over" && stateT >= 150 && !gameOverSent) {
        gameOverSent = true;
        io.gameOver();
      }

      if (shieldT > 0) shieldT--;
      if (freezeT > 0) freezeT--;
      if (shovelT > 0) {
        shovelT--;
        if (shovelT < 180) setNest(Math.floor(shovelT / 16) % 2 ? STEEL : BRICK);
        if (shovelT === 0) setNest(BRICK);
      }

      // ── the kid's tank ──
      if (state === "play") {
        if (!player.alive) {
          if (respawnT >= 0 && ++respawnT > 60) resetPlayer();
        } else if (player.spawnT > 0) {
          if (--player.spawnT === 0) shieldT = Math.max(shieldT, 180);
        } else {
          const h = io.input.held;
          const dir: Dir | null = h.up ? "up" : h.down ? "down" : h.left ? "left" : h.right ? "right" : null;
          const onIce = cell(Math.floor((player.x + 8) / Q), Math.floor((player.y + 8) / Q)) === ICE;
          if (dir) {
            moveTank(player, dir);
            slideT = onIce ? 22 : 0;
          } else if (slideT > 0) {
            slideT--;
            if (!moveTank(player, player.dir)) slideT = 0;
          }
          player.cool = Math.max(0, player.cool - 1);
          if ((io.input.held.a || io.input.held.b) && player.cool === 0 && player.shots < (level >= 2 ? 2 : 1)) {
            fire(io, player);
            player.cool = level >= 2 ? 10 : 16;
          }
        }
      }

      // ── enemies ──
      if (state === "play") trySpawn();
      for (const e of enemies) if (e.alive) enemyAI(io, e);
      enemies = enemies.filter((e) => e.alive);
      updateBullets(io);

      if (pow) {
        pow.t++;
        if (pow.t > 900) pow = null;
        else if (state === "play" && player.alive && player.spawnT <= 0 && overlap({ x: pow.x, y: pow.y, w: 16, h: 16 }, box(player))) {
          const k = pow.kind;
          pow = null;
          applyPower(io, k);
        }
      }

      if (state === "play" && spawned >= roster.length && enemies.length === 0 && ++clearT > 90) {
        state = "tally";
        stateT = 0;
        io.score(500 * (stage + 1));
      }
    },

    draw(g: Gfx) {
      g.clear(GREY);
      g.rect(OX, OY, ARENA, ARENA, INK);
      g.camera(-OX, -OY);

      // pass 0: ice, walls and water under the tanks; pass 1: the trees over them
      const layer = (pass: 0 | 1) => {
        const want = (code: number) => (pass === 1 ? code === BUSH : code !== BUSH && code !== EMPTY && code !== BASE);
        const fr = (code: number) => (code === WATER ? Math.floor(frame / 30) % 2 : 0);
        for (let by = 0; by < QN / 2; by++)
          for (let bx = 0; bx < QN / 2; bx++) {
            const i = by * 2 * QN + bx * 2;
            const c = [map[i], map[i + 1], map[i + QN], map[i + QN + 1]];
            if (c[0] === c[1] && c[0] === c[2] && c[0] === c[3]) {
              if (want(c[0])) g.sprite(ART[c[0]].full[fr(c[0])], bx * 8, by * 8);
              continue;
            }
            for (let k = 0; k < 4; k++) if (want(c[k])) g.sprite(ART[c[k]].q[fr(c[k])][k], bx * 8 + (k % 2) * 4, by * 8 + (k >> 1) * 4);
          }
      };
      layer(0);
      g.sprite(baseAlive ? BASE_SPR : BASE_DEAD_SPR, BASE_X, BASE_Y);

      const twinkle = (x: number, y: number, t: number) => {
        const s = [1, 2, 3, 4, 3, 2][Math.floor(t / 3) % 6];
        const cx = x + 8;
        const cy = y + 8;
        g.rect(cx - s * 2, cy, s * 4 + 1, 1, "#8ad0ff");
        g.rect(cx, cy - s * 2, 1, s * 4 + 1, "#8ad0ff");
        g.rect(cx - 1, cy - 1, 3, 3, "#ffffff");
        g.rect(cx - s, cy - s, 1, 1, "#ffffff");
        g.rect(cx + s, cy - s, 1, 1, "#ffffff");
        g.rect(cx - s, cy + s, 1, 1, "#ffffff");
        g.rect(cx + s, cy + s, 1, 1, "#ffffff");
      };
      const drawTank = (t: Tank, design: string, pal: string) => {
        if (t.spawnT > 0) return twinkle(t.x, t.y, t.spawnT);
        const s = tankSprite(design, pal, Math.floor(t.step / 1.5) % 3);
        if (t.dir === "up") g.sprite(s.up, t.x, t.y);
        else if (t.dir === "down") g.sprite(s.up, t.x, t.y, { flipY: true });
        else if (t.dir === "left") g.sprite(s.side, t.x, t.y);
        else g.sprite(s.side, t.x, t.y, { flipX: true });
      };
      for (const e of enemies) {
        let pal = "silver";
        if (e.bonus && Math.floor(frame / 8) % 2) pal = "red";
        else if (e.kind === "armor") pal = e.hp >= 4 ? "green" : e.hp === 3 ? "amber" : e.hp === 2 ? "violet" : "silver";
        drawTank(e, e.kind, pal);
      }
      if (player.alive) {
        drawTank(player, `p${level}`, "gold");
        if (shieldT > 0 && player.spawnT <= 0) {
          const ph = Math.floor(frame / 2) % 2;
          for (let k = 0; k < 18; k++)
            if ((k + ph * 2) % 4 < 2) {
              const c = k % 3 ? "#ffffff" : "#5ef2ff";
              g.rect(player.x - 1 + k, player.y - 1, 1, 1, c);
              g.rect(player.x - 1 + k, player.y + 16, 1, 1, c);
              g.rect(player.x - 1, player.y - 1 + k, 1, 1, c);
              g.rect(player.x + 16, player.y - 1 + k, 1, 1, c);
            }
        }
      }
      for (const b of bullets) {
        if (b.dir === "up") g.sprite(SHELL.up, b.x - 1.5, b.y - 2);
        else if (b.dir === "down") g.sprite(SHELL.up, b.x - 1.5, b.y - 2, { flipY: true });
        else if (b.dir === "left") g.sprite(SHELL.side, b.x - 2, b.y - 1.5);
        else g.sprite(SHELL.side, b.x - 2, b.y - 1.5, { flipX: true });
      }
      layer(1);
      for (const b of booms) {
        let s: Sprite;
        if (!b.big) s = BOOM_SMALL[Math.min(2, Math.floor(b.t / 4))];
        else s = b.t < 12 ? BOOM_SMALL[Math.floor(b.t / 4)] : b.t < 20 ? BOOM_BIG[0] : b.t < 28 ? BOOM_BIG[1] : BOOM_SMALL[2];
        const n = s.rows.length;
        g.sprite(s, b.x - (n - 1) / 2, b.y - (n - 1) / 2);
      }
      if (pow && (pow.t < 720 ? Math.floor(frame / 10) % 3 !== 0 : Math.floor(frame / 5) % 2 === 0)) g.sprite(POW_SPR[pow.kind], pow.x + 1, pow.y + 1);
      g.camera(0, 0);
      for (const p of pops) g.text(p.text, OX + p.x, OY + p.y - Math.min(10, p.t * 0.4), "#ffffff");

      // the HUD panel: enemies still to come, lives, stage flag
      const left = roster.length - spawned;
      for (let i = 0; i < left; i++) g.sprite(ICON_ENEMY, 230 + (i % 2) * 9, 18 + Math.floor(i / 2) * 9);
      g.text("IP", 230, 128, INK);
      g.sprite(ICON_LIFE, 230, 139);
      g.text(String(lives), 240, 138, INK);
      g.sprite(ICON_FLAG, 230, 168);
      g.text(String(stage + 1), 250, 180, INK, { align: "right" });

      // overlays
      if (state === "curtain") {
        const t = stateT;
        const cover = t < 20 ? t / 20 : t < 90 ? 1 : Math.max(0, 1 - (t - 90) / 20);
        const hh = Math.ceil((H / 2) * cover);
        g.rect(0, 0, W, hh, GREY);
        g.rect(0, H - hh, W, hh, GREY);
        if (cover >= 1) g.text(`STAGE ${stage + 1}`, W / 2, H / 2 - 7, INK, { align: "center", size: 2 });
      } else if (state === "tally") {
        g.rect(0, 0, W, H, INK);
        g.text(`STAGE ${stage + 1}`, W / 2, 24, "#ffffff", { align: "center", size: 2 });
        g.text("CLEAR!", W / 2, 46, "#ffd82a", { align: "center" });
        KINDS.forEach((k, i) => {
          if (stateT < 20 + i * 30) return;
          const y = 72 + i * 26;
          g.text(`${ENEMY[k].pts} PTS`, 40, y + 4, "#ffffff");
          g.text(`${kills[k]}`, 150, y + 4, "#ffffff", { align: "right" });
          g.sprite(tankSprite(k, k === "armor" ? "green" : "silver", 0).up, 162, y);
        });
        if (stateT > 150) g.text(`BONUS ${500 * (stage + 1)}`, W / 2, 186, "#ffd82a", { align: "center" });
      } else if (state === "over") {
        const y = Math.max(OY + 86, OY + ARENA - stateT * 1.4);
        g.text("GAME", OX + ARENA / 2, y, "#e8401a", { align: "center", size: 2 });
        g.text("OVER", OX + ARENA / 2, y + 18, "#e8401a", { align: "center", size: 2 });
      }
    },
  };
}

export const tankBattle: RetroGameDef = {
  id: "tank-battle",
  title: "Tank Battle",
  blurb: "Blast enemy tanks, chew through brick walls and guard your base!",
  genre: "Action",
  emoji: "🛡️",
  color: "#6a9a4a",
  controls: "✚ drive · A or B fire · protect the bird base!",
  pad: { dpad: "4", a: "Fire", b: "Fire" },
  create,
};
