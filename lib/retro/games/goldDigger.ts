// GOLD DIGGER — a single-screen puzzle-platformer. A kid miner with a helmet lamp runs,
// climbs ladders, hangs on bars and digs escape holes to trap the grumpy goblins chasing
// her — nobody gets hurt, a trapped goblin just gets stuck in the dirt for a couple of
// seconds and climbs back out. Grab every gold bag, then a hidden ladder appears so you can
// climb to the top and clear the level. Ten handcrafted levels ramp from a gentle one-goblin
// tutorial to fast multi-goblin digging puzzles with bars and stone blockers.
// (Original game in the spirit of classic dig-and-run platformers.)
import { H, PAL, W, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, bayer, fbm, hash2, outlined, shade } from "../art";

export const TILE = 16;
export const COLS = 16; // 256 / 16
export const ROWS = 13; // (224 - 16 HUD) / 16
export const GY = 16; // the grid starts just below the HUD strip
const STEP = 2; // px/frame — 8 frames to cross one tile, so 16 divides evenly
const HOLE_LIFE = 240; // a dug hole refills after 4s
const STUCK_LIFE = 120; // a trapped goblin is stuck for 2s

// ── terrain ──
// '.' empty   '#' brick (diggable)   'X' stone (solid, never diggable)
// 'H' ladder (climb up/down)         '-' bar (hang + move sideways, down drops off)
// Row 0 is always a solid ceiling; it opens into a ladder at `escapeCol` once all gold is taken.
export type Dir = "L" | "R" | "U" | "D";
export type Pt = [number, number]; // [col, row]

export interface LevelDef {
  terrain: string[]; // 13 rows x 16 cols
  start: Pt;
  goblins: Pt[];
  gold: Pt[];
  escapeCol: number;
  hint?: string;
}

const fit = (rows: string[], w: number) => rows.map((r) => (r.length >= w ? r.slice(0, w) : r.padEnd(w, ".")));

/** An open row: mostly empty, with a ladder column wherever one passes through, and an
 * optional bar strung between two ladder columns. */
function rowOpen(ladders: number[], bar?: [number, number]): string {
  const cells = Array.from({ length: COLS }, () => ".");
  if (bar) for (let c = bar[0] + 1; c < bar[1]; c++) cells[c] = "-";
  for (const c of ladders) cells[c] = "H";
  return cells.join("");
}
/** A floor row: brick everywhere (with a few stone patches for variety), except ladder gaps. */
function rowFloor(ladders: number[], stone: number[] = []): string {
  const cells = Array.from({ length: COLS }, () => "#");
  for (const c of stone) cells[c] = "X";
  for (const c of ladders) cells[c] = "H";
  return cells.join("");
}
const CEILING = "#".repeat(COLS);

/** Build a classic 3-tier level: floors at rows 5, 8 and 11, ladders running the full
 * height, optional bars across some of the open rows, optional stone patches in the floors. */
function buildTerrain(opts: { ladders: number[]; stone?: number[]; bars?: Partial<Record<4 | 6 | 7 | 9 | 10 | 12, [number, number]>> }): string[] {
  const { ladders, stone = [], bars = {} } = opts;
  const open = (row: number) => rowOpen(ladders, bars[row as 4 | 6 | 7 | 9 | 10 | 12]);
  return [
    CEILING, // row 0
    open(1),
    open(2),
    open(3),
    open(4),
    rowFloor(ladders, stone), // row 5
    open(6),
    open(7),
    rowFloor(ladders, stone), // row 8
    open(9),
    open(10),
    rowFloor(ladders, stone), // row 11
    open(12),
  ];
}

// ── terrain predicates (shared by the live game and the pure solvability check) ──
function isSolidCh(ch: string) {
  return ch === "#" || ch === "X";
}
type Getter = (c: number, r: number) => string;
const inBounds = (c: number, r: number) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
export function isSolidAt(get: Getter, c: number, r: number) {
  return !inBounds(c, r) || isSolidCh(get(c, r));
}
export function isLadderAt(get: Getter, c: number, r: number) {
  return inBounds(c, r) && get(c, r) === "H";
}
export function isBarAt(get: Getter, c: number, r: number) {
  return inBounds(c, r) && get(c, r) === "-";
}
export function isSupportedAt(get: Getter, c: number, r: number) {
  return isLadderAt(get, c, r) || isBarAt(get, c, r) || isSolidAt(get, c, r + 1) || isLadderAt(get, c, r + 1);
}

/** A flood fill over every move the kid can make (walk / climb / hang / fall), ignoring
 * goblins and digging, used to prove every gold bag in a level can actually be reached. */
export function levelReachability(level: LevelDef): boolean[][] {
  const get: Getter = (c, r) => level.terrain[r][c];
  const seen: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const [sc, sr] = level.start;
  seen[sr][sc] = true;
  const stack: Pt[] = [[sc, sr]];
  while (stack.length) {
    const [c, r] = stack.pop()!;
    const push = (nc: number, nr: number) => {
      if (!inBounds(nc, nr) || isSolidAt(get, nc, nr) || seen[nr][nc]) return;
      seen[nr][nc] = true;
      stack.push([nc, nr]);
    };
    const sup = isSupportedAt(get, c, r);
    if (sup) {
      push(c - 1, r);
      push(c + 1, r);
    }
    if (isLadderAt(get, c, r) && !isSolidAt(get, c, r - 1)) push(c, r - 1);
    if ((isLadderAt(get, c, r) || isLadderAt(get, c, r + 1) || isBarAt(get, c, r)) && !isSolidAt(get, c, r + 1)) push(c, r + 1);
    if (!sup && !isSolidAt(get, c, r + 1)) push(c, r + 1); // gravity
  }
  return seen;
}

// ── sprites ── (3-4 tone shaded: a bright highlight down the left, a dark shadow down the
// right, a 1px outline added at bake time so the miner and goblins pop off the brick walls).
// Drawn a bit bigger than the grid and scaled up further at draw time (HERO_SCALE) so the
// miner and goblins read as real SNES-size characters — their collision boxes stay grid-sized
// (heroBox/goblinBox below), so the bigger art never changes the gameplay.
const HP = {
  h: PAL.yellow,
  H: "#ffe98a", // hard hat highlight
  J: "#caa23a", // hard hat shadow
  L: "#fff3b0", // lamp glass
  f: PAL.tan, // skin
  k: PAL.black, // eyes / jaw shadow
  u: "#4a2e18", // moustache
  b: PAL.blue, // overalls
  c: "#7fb0ff", // sleeve
  m: "#1c2f73", // strap / sleeve shadow
  n: PAL.dark, // trousers under the overalls
  p: PAL.grey, // pickaxe handle
  g: PAL.tan, // pickaxe head
  o: PAL.brown, // boots
  v: "#e8e8ea", // glove (lit)
  V: "#aab0bf", // glove (shadow)
};
export const HERO_SCALE = 1.15;
// a rounded hard-hat dome, a brim that sticks out past the dome's own width (so the silhouette
// reads as a hat, not a flat square), a bright lamp band, then a real face: skin, eyes and a
// moustache — instead of a blank yellow block
const HEAD = ["..HHHHHHHH..", "HHHHHHHHHHHH", ".hhLLLLhhh..", ".JhhhhhhJ...", ".fffffffff..", ".fkkffffkkf.", ".fffuuffff.."];
// overalls with shoulder straps and a belt buckle; the glove row swaps which hand leads between
// the two walk frames so the arms actually swing as the legs stride
const BODY_SHOULDERS = ".ccbbbbbbmm.";
const BODY_BASE = ["ccb.bbbb.mmb", "ccb.bbbb.mmb", "ccbbbbbbbbmm", ".cb.bbbb.bm.", "..boooob...."];
const BODY_STAND_A = [BODY_SHOULDERS, "vcbbbbbbbbcV", ...BODY_BASE];
const BODY_STAND_B = [BODY_SHOULDERS, "cvbbbbbbbbVc", ...BODY_BASE];
// a real 2-frame run cycle: frame A plants the legs wide apart (stride open), frame B crosses
// them together mid-swing — not just a 1px nudge
const LEGS_A = [".nn.....nn..", ".nnn.....nn.", "..nnn...nn..", "..nn.....nn.", ".oo......oo."];
const LEGS_B = ["..nn....nn..", "...nnnnnn...", "...nnnnnn...", "....nnnn....", "...oooo....."];
/** 2-frame run cycle */
export const HERO_RUN: Sprite[] = [sprite(fit([...HEAD, ...BODY_STAND_A, ...LEGS_A], 12), HP), sprite(fit([...HEAD, ...BODY_STAND_B, ...LEGS_B], 12), HP)];

const BODY_CLIMB = ["g.ccbbmm.g.g", "g.ccbbmm.g.g", "..ccbbbbmm..", "..bb.bb.bb..", "..bb.bb.bb..", "..bb.bb.bb..", "..boooob...."];
const LEGS_CLIMB1 = ["..nn....nn..", "nnnn....nnnn", "..nn....nn..", "..nn....nn..", ".oo....oo..."];
const LEGS_CLIMB2 = ["..nn....nn..", "..nn....nn..", "nnnn....nnnn", "..nn....nn..", "oo......oo.."];
/** 2-frame climb cycle — hands on the ladder, feet alternating */
export const HERO_CLIMB: Sprite[] = [sprite(fit([...HEAD, ...BODY_CLIMB, ...LEGS_CLIMB1], 12), HP), sprite(fit([...HEAD, ...BODY_CLIMB, ...LEGS_CLIMB2], 12), HP)];

const BODY_HANG = ["g.ccbbmm.g.g", "..ccbbbbmm..", "..ccbbbbmm..", "..bbbbbbbb..", "..bbbbbbbb..", "..bb....bb..", "..b......b.."];
const LEGS_HANG = ["..nn....nn..", "..nn....nn..", "...nnnnnn...", "...oooooo...", "............"];
/** hanging from a bar, dangling */
export const HERO_HANG: Sprite = sprite(fit([...HEAD, ...BODY_HANG, ...LEGS_HANG], 12), HP);

const BODY_DIG = ["..ccbbmm....", ".ccbbbbbbbbp", "ccbbbbbbbbpp", "bb.bbbb.bb.p", "bb.bbbb.bb..", ".bb.bbbb.bb.", "..boooob...."];
const LEGS_DIG = [".nnn....nnn.", "nnnn....nnnn", "nn........nn", "o..........o", "............"];
/** swinging the pickaxe to the right; flip for the other side */
export const HERO_DIG: Sprite = sprite(fit([...HEAD, ...BODY_DIG, ...LEGS_DIG], 12), HP);

// a pickaxe slung across the back whenever the miner isn't mid-swing (HERO_DIG already carries
// its own swinging pickaxe) — a distinct grey handle and a contrasting head so the silhouette
// reads as a miner even at a glance, not a plain yellow-over-blue block
const BACK_PICK_PAL = { p: PAL.grey, g: "#b36a1e", k: PAL.black };
export const BACK_PICK: Sprite = sprite(
  ["......gg", ".....ggg", "......p.", ".....p..", "....p...", "...p....", "..p.....", ".p......", "p.......", "p.......", "........"],
  BACK_PICK_PAL
);

// goblins: bigger (12 rows, scaled further), with pointy ears, a toothy mean grin and glowing
// eyes (two alt frames toggle the eye glow so it reads as flickering rather than static dots)
const GP = { g: PAL.green, G: "#8df26a", d: PAL.teal, D: "#0f8075", k: PAL.black, w: PAL.white, r: PAL.red, n: PAL.dark, y: "#faff4a", Y: "#fffdbf" };
const GOBLIN_A = [
  "..n......n..",
  ".nGGGGGGGGn.",
  ".GGggggggGG.",
  "ggkYggggYkgg",
  "gggggggggggg",
  "gg.wrwrwr.gg",
  "ggdddddddgg.",
  ".dD.gggg.Dd.",
  "nn........nn",
  ".nn......nn.",
  "oo........oo",
  ".oo......oo.",
];
const GOBLIN_B = [
  "..n......n..",
  ".nGGGGGGGGn.",
  ".GGggggggGG.",
  "ggkyggggykgg",
  "gggggggggggg",
  "gg.rwrwrw.gg",
  "ggdddddddgg.",
  ".dD.gggg.Dd.",
  "nn........nn",
  "..nn....nn..",
  ".oo......oo.",
  "..oo....oo..",
];
/** 2-frame grumpy-goblin shuffle */
export const GOBLIN_WALK: Sprite[] = [sprite(fit(GOBLIN_A, 12), GP), sprite(fit(GOBLIN_B, 12), GP)];
/** stuck in a hole: just the annoyed head and waving arms poking out */
export const GOBLIN_STUCK: Sprite = sprite(
  fit(["..n......n..", ".nGGGGGGGGn.", ".GGggggggGG.", "ggkYggggYkgg", "n.ggggggggn.", "............", "............", "............", "............", "............", "............", "............"], 12),
  GP
);

const GOLD_PAL = { y: PAL.yellow, o: PAL.orange, k: PAL.black, w: PAL.white, d: "#b36a1e" };
const GOLD_ROWS = [
  ".okoooko..",
  "okyyyyyko.",
  "SHINE_ROW2",
  "okyywyyyko",
  "okywwwwyko",
  "okyywyyyko",
  "okyddddyko",
  ".okddddo..",
  "..kdkkd...",
  "...kkkk...",
];
/** a heap of gold with a bright star-burst emblem stamped through the middle (where a sack
 *  would carry a $ mark) plus a 3-frame roaming glint so it twinkles in the dark */
export const GOLD_SPRITE: Sprite = sprite(GOLD_ROWS.map((r) => (r === "SHINE_ROW2" ? "okyywyyyko" : r)), GOLD_PAL);
export const GOLD_SPRITE_2: Sprite = sprite(GOLD_ROWS.map((r) => (r === "SHINE_ROW2" ? "okyyyywyko" : r)), GOLD_PAL);
export const GOLD_SPRITE_3: Sprite = sprite(GOLD_ROWS.map((r) => (r === "SHINE_ROW2" ? "okyyyyywko" : r)), GOLD_PAL);

// hero/goblin art is 12 px wide; hero is 19 px tall (helmet to boots), goblin 9 px tall — both
// bigger than their 16 px cell, scaled up a little further and bottom-anchored to the cell floor
// so the miner and goblins have real presence without ever touching their (grid-based) hitboxes.
const HERO_W = 12;
const HERO_H = 19;
const GOBLIN_W = 12;
const GOBLIN_H = 12;
export const GOBLIN_SCALE = 1.25;
/** draw a sprite bottom-anchored and horizontally centred on a 16px cell at (cellX, cellY) */
function drawAnchored(g: Gfx, s: Sprite, cellX: number, cellY: number, w: number, h: number, scale: number, opts?: { flipX?: boolean }) {
  const dw = w * scale;
  const dh = h * scale;
  g.sprite(s, cellX - (dw - w) / 2, cellY + TILE - dh, { ...opts, scale });
}
/** a soft dithered helmet-lamp beam fanning out from the miner's head, drawn with alpha so it
 *  reads as a warm glow rather than a hard-edged wedge */
function bakeLampCone(): Sprite {
  const w = 18;
  const h = 11;
  const cy = 5;
  return bake(w, h, (x, y) => {
    const spread = 1.1 + x * 0.6;
    const dy = Math.abs(y - cy) / spread;
    const fall = Math.max(0, 1 - dy) * Math.max(0, 1 - x / w);
    if (fall <= 0.04) return null;
    const v = fall > 0.55 ? "#fff3b0" : "#ffe14d";
    return fall > bayer(x, y) * 0.85 ? v : null;
  });
}

// ── levels ── (ten handcrafted single-screen maps that ramp up)
export const LEVELS: LevelDef[] = [
  {
    terrain: buildTerrain({ ladders: [3, 12] }),
    start: [1, 12],
    goblins: [[14, 4]],
    gold: [
      [3, 2],
      [12, 2],
      [7, 4],
      [2, 7],
      [10, 10],
      [13, 12],
    ],
    escapeCol: 8,
    hint: "A/B DIG HOLES TO TRAP GOBLINS",
  },
  {
    terrain: buildTerrain({ ladders: [2, 8, 13] }),
    start: [14, 12],
    goblins: [[8, 4]],
    gold: [
      [2, 2],
      [8, 2],
      [13, 2],
      [5, 4],
      [11, 7],
      [2, 10],
      [15, 12],
    ],
    escapeCol: 5,
  },
  {
    terrain: buildTerrain({ ladders: [4, 11], stone: [7, 12] }),
    start: [1, 12],
    goblins: [
      [14, 4],
      [1, 7],
    ],
    gold: [
      [4, 2],
      [11, 2],
      [8, 4],
      [1, 4],
      [14, 7],
      [6, 10],
      [11, 10],
      [9, 12],
    ],
    escapeCol: 9,
  },
  {
    terrain: buildTerrain({ ladders: [1, 7, 14], stone: [3, 10] }),
    start: [8, 12],
    goblins: [
      [1, 4],
      [14, 10],
    ],
    gold: [
      [1, 2],
      [7, 2],
      [14, 2],
      [4, 4],
      [11, 7],
      [2, 10],
      [13, 10],
      [5, 12],
      [10, 12],
    ],
    escapeCol: 12,
  },
  {
    terrain: buildTerrain({ ladders: [5, 9], stone: [2], bars: { 6: [5, 9] } }),
    start: [2, 12],
    goblins: [
      [13, 4],
      [5, 2],
    ],
    gold: [
      [5, 2],
      [9, 2],
      [7, 6],
      [2, 4],
      [13, 7],
      [5, 10],
      [9, 10],
      [0, 12],
      [15, 12],
    ],
    escapeCol: 3,
  },
  {
    terrain: buildTerrain({ ladders: [2, 6, 10, 14], stone: [4, 12], bars: { 6: [2, 6], 9: [10, 14] } }),
    start: [8, 12],
    goblins: [
      [2, 4],
      [14, 4],
      [6, 10],
    ],
    gold: [
      [2, 2],
      [6, 2],
      [10, 2],
      [14, 2],
      [4, 6],
      [12, 9],
      [8, 4],
      [0, 12],
      [15, 12],
      [8, 7],
    ],
    escapeCol: 12,
  },
  {
    terrain: buildTerrain({ ladders: [3, 8, 13], stone: [5, 11], bars: { 4: [3, 8], 9: [8, 13] } }),
    start: [1, 12],
    goblins: [
      [13, 4],
      [3, 7],
      [8, 10],
    ],
    gold: [
      [3, 2],
      [8, 2],
      [13, 2],
      [5, 4],
      [10, 9],
      [1, 7],
      [14, 7],
      [3, 10],
      [12, 10],
      [7, 12],
    ],
    escapeCol: 6,
  },
  {
    terrain: buildTerrain({ ladders: [1, 5, 9, 13], stone: [3, 7, 11], bars: { 4: [1, 5], 7: [5, 9], 10: [9, 13] } }),
    start: [1, 12],
    goblins: [
      [13, 4],
      [1, 7],
      [13, 10],
    ],
    gold: [
      [1, 2],
      [5, 2],
      [9, 2],
      [13, 2],
      [3, 4],
      [7, 7],
      [11, 10],
      [14, 12],
      [2, 12],
      [9, 7],
      [5, 10],
    ],
    escapeCol: 15,
  },
  {
    terrain: buildTerrain({ ladders: [4, 11], stone: [2, 6, 9, 13], bars: { 4: [4, 11], 7: [4, 11], 9: [4, 11] } }),
    start: [0, 12],
    goblins: [
      [11, 4],
      [4, 7],
      [11, 9],
      [7, 12],
    ],
    gold: [
      [4, 2],
      [11, 2],
      [7, 4],
      [8, 7],
      [6, 9],
      [1, 10],
      [15, 10],
      [13, 12],
      [2, 12],
      [9, 4],
      [9, 9],
    ],
    escapeCol: 0,
  },
  {
    terrain: buildTerrain({ ladders: [2, 6, 9, 13], stone: [4, 8, 11, 14], bars: { 4: [2, 6], 7: [6, 9], 9: [9, 13], 10: [2, 6] } }),
    start: [15, 12],
    goblins: [
      [2, 4],
      [9, 4],
      [6, 7],
      [13, 9],
    ],
    gold: [
      [2, 2],
      [6, 2],
      [9, 2],
      [13, 2],
      [4, 4],
      [7, 7],
      [11, 9],
      [4, 10],
      [0, 12],
      [15, 4],
      [0, 7],
      [13, 12],
    ],
    escapeCol: 10,
  },
];

// ── live actors: a grid position (col,row) plus an offset sliding toward the next tile ──
interface Actor {
  col: number;
  row: number;
  ox: number; // -TILE..TILE, offset toward the next cell
  oy: number;
  dir: Dir | null;
  facing: 1 | -1;
}
const actorPx = (a: Actor) => a.col * TILE + a.ox;
const actorPy = (a: Actor) => GY + a.row * TILE + a.oy;
function stepActor(a: Actor, speed: number) {
  if (a.dir === "L") {
    a.ox -= speed;
    if (a.ox <= -TILE) {
      a.col -= 1;
      a.ox = 0;
      a.dir = null;
    }
  } else if (a.dir === "R") {
    a.ox += speed;
    if (a.ox >= TILE) {
      a.col += 1;
      a.ox = 0;
      a.dir = null;
    }
  } else if (a.dir === "U") {
    a.oy -= speed;
    if (a.oy <= -TILE) {
      a.row -= 1;
      a.oy = 0;
      a.dir = null;
    }
  } else if (a.dir === "D") {
    a.oy += speed;
    if (a.oy >= TILE) {
      a.row += 1;
      a.oy = 0;
      a.dir = null;
    }
  }
}
const holeKey = (c: number, r: number) => `${c},${r}`;
interface Goblin extends Actor {
  stuck: number;
  anim: number;
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  let levelIdx = 0;
  let lives = 3;
  let over = false;
  let won = false;
  let tick = 0;
  let level: LevelDef = LEVELS[0];
  let goldGrid: boolean[][] = [];
  let goldLeft = 0;
  let holes = new Map<string, number>();
  let escapeActive = false;
  const hero = { col: 0, row: 0, ox: 0, oy: 0, dir: null as Dir | null, facing: 1 as 1 | -1, digT: 0, digSide: 1 as 1 | -1, anim: 0 };
  let goblins: Goblin[] = [];
  let state: "ready" | "play" | "caught" | "clear" = "ready";
  let stateT = 0;
  let pops: { x: number; y: number; t: number; text: string }[] = [];
  /** debris, dust and sparkle bursts — dig chips, coin sparkle, trap-poof, hole-collapse dust */
  let fx: { x: number; y: number; vx: number; vy: number; t: number; life: number; color: string; size: number }[] = [];
  let shake = 0;
  let combo = 0; // gold picked up in quick succession — each one chimes a little higher
  let comboT = 0;

  const loadLevel = () => {
    level = LEVELS[levelIdx];
    goldGrid = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    for (const [c, rr] of level.gold) goldGrid[rr][c] = true;
    goldLeft = level.gold.length;
    holes = new Map();
    escapeActive = false;
    hero.col = level.start[0];
    hero.row = level.start[1];
    hero.ox = 0;
    hero.oy = 0;
    hero.dir = null;
    hero.facing = 1;
    hero.digT = 0;
    hero.anim = 0;
    goblins = level.goblins.map((gp) => ({ col: gp[0], row: gp[1], ox: 0, oy: 0, dir: null, facing: -1, stuck: 0, anim: 0 }));
    state = "ready";
    stateT = 0;
  };
  loadLevel();

  // terrain lookup layered with dug holes and the escape ladder overlay
  const get: Getter = (c, rr) => {
    if (escapeActive && c === level.escapeCol) return "H";
    if (holes.has(holeKey(c, rr))) return ".";
    return level.terrain[rr][c];
  };
  const isSolid = (c: number, rr: number) => isSolidAt(get, c, rr);
  const isLadder = (c: number, rr: number) => isLadderAt(get, c, rr);
  const isBar = (c: number, rr: number) => isBarAt(get, c, rr);
  const supported = (c: number, rr: number) => isSupportedAt(get, c, rr);
  const isBrickBase = (c: number, rr: number) => inBounds(c, rr) && level.terrain[rr][c] === "#";
  const goblinSpeed = () => Math.min(1.8, 0.75 + levelIdx * 0.11);

  /** a little burst of particles radiating out from a tile centre — used for every bit of juice */
  const burst = (cx: number, cy: number, n: number, speed: number, life: number, colors: string[], size = 2) => {
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + 0.3;
      fx.push({ x: cx, y: cy, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed - speed * 0.4, t: 0, life, color: colors[i % colors.length], size });
    }
  };

  const collectGold = (c: number, rr: number, io: IO) => {
    if (!inBounds(c, rr) || !goldGrid[rr][c]) return;
    goldGrid[rr][c] = false;
    goldLeft--;
    io.sfx.play("coin");
    combo = comboT > 0 ? Math.min(combo + 1, 7) : 0; // reset the chime if the kid paused between pickups
    comboT = 50;
    io.sfx.slide?.(520 + combo * 70, 640 + combo * 70, 0.12, "square", 0.22); // a little rising jingle, higher each nugget
    io.score(50);
    pops.push({ x: c * TILE + 4, y: GY + rr * TILE, t: 0, text: "+50" });
    burst(c * TILE + 8, GY + rr * TILE + 8, 6, 0.7, 18, [PAL.yellow, PAL.white, PAL.orange]);
    if (goldLeft <= 0) {
      escapeActive = true;
      io.sfx.play("powerup");
      io.sfx.slide?.(400, 900, 0.5, "square", 0.22);
    }
  };
  const trapGoblin = (gb: Goblin, io: IO) => {
    gb.stuck = STUCK_LIFE;
    gb.dir = null;
    io.sfx.play("hit");
    io.sfx.noise?.(0.15, 0.2, 320, 120);
    io.score(75);
    pops.push({ x: gb.col * TILE + 2, y: GY + gb.row * TILE, t: 0, text: "+75" });
    burst(gb.col * TILE + 8, GY + gb.row * TILE + 8, 5, 0.55, 20, themeArt(themeForLevel(levelIdx)).dust);
    shake = Math.max(shake, 4);
  };
  const respawnGoblin = (gb: Goblin) => {
    gb.col = r.int(0, COLS - 1);
    gb.row = 1;
    gb.ox = 0;
    gb.oy = 0;
    gb.dir = null;
    gb.stuck = 0;
  };

  const tryDig = (side: 1 | -1, io: IO) => {
    if (hero.ox !== 0 || hero.oy !== 0) return;
    const tc = hero.col + side;
    const tr = hero.row + 1;
    if (!inBounds(tc, tr)) return;
    if (!isBrickBase(tc, tr) || holes.has(holeKey(tc, tr))) return;
    if (isSolid(tc, hero.row)) return; // need open space beside the kid to break through
    holes.set(holeKey(tc, tr), HOLE_LIFE);
    hero.digT = 14;
    hero.digSide = side;
    io.sfx.play("blip");
    io.sfx.noise?.(0.12, 0.2, 900, 240);
    burst(tc * TILE + 8, GY + tr * TILE + 6, 6, 0.65, 16, themeArt(themeForLevel(levelIdx)).dust);
    for (const gb of goblins) if (gb.stuck <= 0 && gb.ox === 0 && gb.oy === 0 && gb.col === tc && gb.row === tr) trapGoblin(gb, io);
  };

  const decideHeroDir = (io: IO): Dir | null => {
    const c = hero.col,
      rr = hero.row;
    const inp = io.input;
    if (!supported(c, rr)) return !isSolid(c, rr + 1) ? "D" : null;
    if (inp.held.up && isLadder(c, rr) && !isSolid(c, rr - 1)) return "U";
    if (inp.held.down && (isLadder(c, rr) || isLadder(c, rr + 1) || isBar(c, rr)) && !isSolid(c, rr + 1)) return "D";
    if (inp.held.left && !isSolid(c - 1, rr)) {
      hero.facing = -1;
      return "L";
    }
    if (inp.held.right && !isSolid(c + 1, rr)) {
      hero.facing = 1;
      return "R";
    }
    return null;
  };

  const updateHero = (io: IO) => {
    if (hero.digT > 0) hero.digT--;
    if (hero.ox === 0 && hero.oy === 0) {
      if (io.input.pressed.a) tryDig(-1, io);
      else if (io.input.pressed.b) tryDig(1, io);
      if (hero.dir === null) hero.dir = decideHeroDir(io);
    }
    if (hero.dir) {
      const movingDir = hero.dir;
      hero.anim += 0.15;
      stepActor(hero, STEP);
      if ((movingDir === "L" || movingDir === "R") && tick % 8 === 0) io.sfx.play("step");
      else if ((movingDir === "U" || movingDir === "D") && tick % 10 === 0) {
        io.sfx.play("step"); // a footstep on the wooden rung...
        io.sfx.tone(260, 0.045, "square", 0.12); // ...with a little rung clank on top
      }
      if (hero.dir === null) collectGold(hero.col, hero.row, io);
    }
  };

  const nearestLadderCol = (rr: number, fromCol: number): number | null => {
    let best: number | null = null;
    let bestD = Infinity;
    for (let c = 0; c < COLS; c++) {
      if (!isLadderAt(get, c, rr)) continue;
      const d = Math.abs(c - fromCol);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  };
  const chooseGoblinDir = (gb: Goblin): Dir | null => {
    const c = gb.col,
      rr = gb.row;
    if (!supported(c, rr)) return !isSolid(c, rr + 1) ? "D" : null;
    const hc = hero.col,
      hr = hero.row;
    if (hr !== rr) {
      const bestC = nearestLadderCol(rr, c);
      if (bestC !== null && bestC !== c) {
        return bestC > c ? (!isSolid(c + 1, rr) ? "R" : null) : !isSolid(c - 1, rr) ? "L" : null;
      }
      if (bestC === c) {
        if (hr < rr && isLadder(c, rr) && !isSolid(c, rr - 1)) return "U";
        if (hr > rr && (isLadder(c, rr) || isLadder(c, rr + 1)) && !isSolid(c, rr + 1)) return "D";
      }
    }
    if (hc > c && !isSolid(c + 1, rr)) return "R";
    if (hc < c && !isSolid(c - 1, rr)) return "L";
    if (isLadder(c, rr)) {
      if (hr < rr && !isSolid(c, rr - 1)) return "U";
      if (hr > rr && !isSolid(c, rr + 1)) return "D";
    }
    return null;
  };
  const updateGoblin = (gb: Goblin, io: IO) => {
    if (gb.stuck > 0) {
      gb.stuck--;
      return;
    }
    gb.anim += 0.1;
    if (gb.ox === 0 && gb.oy === 0 && gb.dir === null) gb.dir = chooseGoblinDir(gb);
    if (gb.dir === "L") gb.facing = -1;
    else if (gb.dir === "R") gb.facing = 1;
    if (gb.dir) {
      stepActor(gb, goblinSpeed());
      if (gb.dir === null && holes.has(holeKey(gb.col, gb.row))) trapGoblin(gb, io);
    }
  };

  const updateHoles = (io: IO) => {
    for (const [k, t] of holes) {
      const nt = t - 1;
      if (nt <= 0) {
        holes.delete(k);
        const [cs, rs] = k.split(",").map(Number);
        io.sfx.play("thud");
        burst(cs * TILE + 8, GY + rs * TILE + 12, 4, 0.35, 14, [PAL.dark, "#140f22"]);
        for (const gb of goblins)
          if (gb.stuck > 0 && gb.col === cs && gb.row === rs) {
            io.sfx.play("pop");
            respawnGoblin(gb);
          }
      } else holes.set(k, nt);
    }
  };

  const heroBox = () => ({ x: actorPx(hero) + 2, y: actorPy(hero) + 1, w: TILE - 4, h: TILE - 2 });
  const goblinBox = (gb: Goblin) => ({ x: actorPx(gb) + 2, y: actorPy(gb) + 1, w: TILE - 4, h: TILE - 2 });

  return {
    update(io) {
      if (over || won) return;
      tick++;
      if (shake > 0) shake--;
      if (comboT > 0) comboT--;
      for (const p of pops) p.t++;
      pops = pops.filter((p) => p.t < 40);
      for (const d of fx) {
        d.t++;
        d.x += d.vx;
        d.y += d.vy;
        d.vy += 0.05; // a little gravity so debris and dust arc and fall
      }
      fx = fx.filter((d) => d.t < d.life);

      if (state === "ready") {
        stateT++;
        if (stateT > 60) {
          state = "play";
          stateT = 0;
        }
        return;
      }
      if (state === "caught") {
        stateT++;
        if (stateT === 1) io.sfx.noise?.(0.3, 0.3, 480, 90);
        if (stateT > 70) {
          lives--;
          if (lives <= 0) {
            over = true;
            io.gameOver();
            return;
          }
          loadLevel();
        }
        return;
      }
      if (state === "clear") {
        stateT++;
        if (stateT === 1) io.sfx.slide?.(440, 1100, 0.4, "square", 0.26);
        if (stateT > 90) {
          levelIdx++;
          if (levelIdx >= LEVELS.length) {
            won = true;
            io.score(1000);
            io.win();
            return;
          }
          loadLevel();
        }
        return;
      }

      updateHero(io);
      updateHoles(io);
      for (const gb of goblins) updateGoblin(gb, io);

      for (const gb of goblins) {
        if (gb.stuck > 0) continue;
        if (overlap(heroBox(), goblinBox(gb))) {
          state = "caught";
          stateT = 0;
          io.sfx.play("die");
          return;
        }
      }

      if (escapeActive && hero.row === 0 && hero.ox === 0 && hero.oy === 0) {
        state = "clear";
        stateT = 0;
        io.sfx.play("win");
        io.score(500);
      }
    },

    draw(g: Gfx) {
      drawGame(g, {
        level,
        get,
        holes,
        goldGrid,
        goblins,
        hero,
        state,
        stateT,
        levelIdx,
        lives,
        goldLeft,
        escapeActive,
        pops,
        fx,
        shake,
        tick,
      });
    },
  };
}

interface DrawState {
  level: LevelDef;
  get: Getter;
  holes: Map<string, number>;
  goldGrid: boolean[][];
  goblins: Goblin[];
  hero: { col: number; row: number; ox: number; oy: number; dir: Dir | null; facing: 1 | -1; digT: number; digSide: 1 | -1; anim: number };
  state: "ready" | "play" | "caught" | "clear";
  stateT: number;
  levelIdx: number;
  lives: number;
  goldLeft: number;
  escapeActive: boolean;
  pops: { x: number; y: number; t: number; text: string }[];
  fx: { x: number; y: number; vx: number; vy: number; t: number; life: number; color: string; size: number }[];
  shake: number;
  tick: number;
}

// ── themed environment art — a dark mineshaft behind everything, running-bond brick walls,
// cracked stone blockers, wooden rope-lashed ladders and a twisted rope bar, all baked once
// per theme (lazily, the first time a level needs that theme) so the mine's rock/crystal
// colours change with depth: EARTH (levels 1-3), CRYSTAL CAVE (4-6), LAVA (7-8), ICE (9-10).
interface ThemePal {
  name: string;
  brickFace: string;
  brickTop: string;
  mortar: string;
  stoneBase: string;
  stoneLight: string;
  stoneDark: string;
  bg: string; // back-wall base colour
  rockLo: string; // strata band shading (darker)
  rockHi: string; // strata band shading (lighter)
  crack: string;
  crystalA: string;
  crystalB: string;
  crystalGlow: string;
  lantern: string;
  beam: string;
  dirt: string;
  dirtLo: string;
  moss: string; // speckle on a diggable block's top edge
  dust: [string, string, string]; // dig-chip particle colours
}
const THEMES: ThemePal[] = [
  {
    // earth — a warm, deep umber mine lit by lantern pools
    name: "earth",
    brickFace: "#b06a36",
    brickTop: "#d08a4e",
    mortar: "#4a2611",
    stoneBase: "#8a7260",
    stoneLight: "#cdb49a",
    stoneDark: "#4a3524",
    bg: "#2a1810",
    rockLo: "#1c0f0a",
    rockHi: "#3a2414",
    crack: "#160b06",
    crystalA: "#8fd8ff",
    crystalB: "#dff6ff",
    crystalGlow: "#fff8d8",
    lantern: "#ffb347",
    beam: "#6e3a1c",
    dirt: "#1c1430",
    dirtLo: "#0a0716",
    moss: "#5a6a2e",
    dust: [PAL.tan, PAL.brown, "#6e3a1c"],
  },
  {
    // crystal cave — cool violet rock studded with glowing gems
    name: "crystal",
    brickFace: "#4a3f7a",
    brickTop: "#6a5aa8",
    mortar: "#241c40",
    stoneBase: "#394a7a",
    stoneLight: "#8fa8e8",
    stoneDark: "#1c2450",
    bg: "#160f33",
    rockLo: "#0f0a26",
    rockHi: "#271a4e",
    crack: "#0c0820",
    crystalA: "#7fe0ff",
    crystalB: "#ff9ef2",
    crystalGlow: "#f0e8ff",
    lantern: "#b58cff",
    beam: "#352a5c",
    dirt: "#1c1440",
    dirtLo: "#0c0820",
    moss: "#4a3a6a",
    dust: ["#7fe0ff", "#b58cff", "#ff9ef2"],
  },
  {
    // lava — charred rock with an ember glow in every gap
    name: "lava",
    brickFace: "#7a3020",
    brickTop: "#a85030",
    mortar: "#2a0c08",
    stoneBase: "#5a2a20",
    stoneLight: "#d8703a",
    stoneDark: "#2a0f08",
    bg: "#24100c",
    rockLo: "#180907",
    rockHi: "#36140e",
    crack: "#b8441c",
    crystalA: "#ffb23c",
    crystalB: "#ff5a2c",
    crystalGlow: "#fff2a8",
    lantern: "#ff7a3c",
    beam: "#2a1410",
    dirt: "#2a0f08",
    dirtLo: "#140604",
    moss: "#5a4a42",
    dust: [PAL.orange, "#ff5a2c", "#ffd24a"],
  },
  {
    // ice — pale frozen blocks and a cold blue glow
    name: "ice",
    brickFace: "#6a8cc0",
    brickTop: "#aacdf0",
    mortar: "#2a3f66",
    stoneBase: "#c8dff5",
    stoneLight: "#eaf6ff",
    stoneDark: "#4a6a9a",
    bg: "#0e1830",
    rockLo: "#091124",
    rockHi: "#182542",
    crack: "#0a1530",
    crystalA: "#bdeaff",
    crystalB: "#ffffff",
    crystalGlow: "#eaf8ff",
    lantern: "#9adcff",
    beam: "#3a506e",
    dirt: "#16233f",
    dirtLo: "#0a1326",
    moss: "#cfe8ff",
    dust: ["#eaf8ff", "#bdeaff", PAL.white],
  },
];
/** earth for the first three levels, then crystal/lava/ice as the dig gets deeper */
export const themeForLevel = (levelIdx: number) => (levelIdx < 3 ? 0 : levelIdx < 6 ? 1 : levelIdx < 8 ? 2 : 3);

const LADDER_WOOD = "#8a5a2e";
const LADDER_WOOD_HI = "#b37d40";
const LADDER_WOOD_LO = "#5c3a1c";
const LADDER_ROPE = "#d8c07a";
const LADDER_ROPE_LO = "#a68a4e";
const BAR_ROPE = "#c9a35a";
const BAR_HI = "#efd08a";

/** a single carved stone block — mottled rock (never a flat slab), a short zigzag crack, a
 *  couple of chipped divots, a jittery dark rim (so neighbours read as separate chunks, not a
 *  brick course), and — per this exact cell's hash, not a reused variant — a mossy top edge or
 *  a glinting gold fleck here and there. Baked once per grid cell so no two blocks look alike. */
function bakeBrickTile(t: ThemePal, c: number, rr: number): Sprite {
  const h = (n: number) => hash2(c, rr, n);
  const hueShift = (h(410) - 0.5) * 0.14;
  const hasMoss = h(411) > 0.68;
  const hasFleck = h(412) > 0.86;
  const fleckX = 4 + Math.floor(h(413) * 8);
  const fleckY = 6 + Math.floor(h(414) * 7);
  const crackX0 = 2 + Math.floor(h(415) * 9);
  const crackY0 = 3 + Math.floor(h(416) * 8);
  const crackDir = h(417) > 0.5 ? 1 : -1;
  const crackLen = 5 + Math.floor(h(418) * 5);
  const chipA: [number, number] = [1 + Math.floor(h(420) * 13), 1 + Math.floor(h(421) * 13)];
  const chipB: [number, number] = [1 + Math.floor(h(422) * 13), 1 + Math.floor(h(423) * 13)];
  return bake(TILE, TILE, (x, y) => {
    const rimEdge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
    if (rimEdge && hash2(x + c * 31, y + rr * 17, 430) > 0.55) return t.mortar; // a jittery carved rim, not a straight joint
    const n = fbm(x * 0.28 + c * 5.1, y * 0.28 + rr * 5.1, 2, 440);
    let base = n > 0.6 ? shade(t.brickFace, 0.08 + hueShift) : n < 0.35 ? shade(t.brickFace, -0.12 + hueShift) : shade(t.brickFace, hueShift);
    for (let i = 0; i < crackLen; i++) {
      const cxp = crackX0 + i;
      const cyp = crackY0 + Math.round(Math.sin(i * 0.9) * 1.4) * crackDir;
      if (x === cxp && y === cyp) return t.mortar;
    }
    if ((Math.abs(x - chipA[0]) <= 1 && Math.abs(y - chipA[1]) <= 1) || (Math.abs(x - chipB[0]) <= 1 && Math.abs(y - chipB[1]) <= 1)) base = shade(base, -0.22);
    if (hasMoss && y <= 2 && hash2(x, y, 450 + c * 7 + rr * 3) > 0.4) return shade(t.moss, y === 0 ? 0.12 : -0.05);
    if (hasFleck && Math.abs(x - fleckX) <= 1 && Math.abs(y - fleckY) <= 1) return x === fleckX && y === fleckY ? "#fff3b0" : PAL.yellow;
    if (y === 1 && x > 0 && x < TILE - 1) return shade(base, 0.16); // lit top bevel
    if (x === 1 && y > 1 && y < TILE - 2) return shade(base, 0.08);
    if (y === TILE - 2 && x > 0 && x < TILE - 1) return shade(base, -0.18); // dark undercut
    if (x === TILE - 2 && y > 1 && y < TILE - 2) return shade(base, -0.1);
    return base;
  });
}
/** a cracked stone blocker, never diggable: mottled light/dark patches, a dark rim, and
 *  sometimes a fossil's curled imprint — varied per cell the same way the brick blocks are. */
function bakeStoneTile(t: ThemePal, c: number, rr: number): Sprite {
  const h = (n: number) => hash2(c, rr, n);
  const hasFossil = h(460) > 0.72;
  const fossilCx = 5 + Math.floor(h(461) * 6);
  const fossilCy = 6 + Math.floor(h(462) * 5);
  const fossilR = 3 + Math.floor(h(463) * 2);
  return bake(TILE, TILE, (x, y) => {
    if (x === 0 || x === TILE - 1 || y === 0 || y === TILE - 1) return t.stoneDark;
    const n = fbm(x * 0.4 + c * 7.3, y * 0.4 + rr * 7.3, 2, 470);
    let base = n > 0.68 ? t.stoneLight : n < 0.32 ? t.stoneDark : t.stoneBase;
    if (hasFossil) {
      const d = Math.hypot(x - fossilCx, (y - fossilCy) * 1.6);
      if (d > fossilR - 0.6 && d < fossilR + 0.6) base = shade(t.stoneLight, 0.08); // a curled fossil rim
    }
    if (y === 1) base = shade(base, 0.12);
    if (y === TILE - 2) base = shade(base, -0.16);
    return base;
  });
}
/** a wooden ladder lashed with rope: round rails with a lit edge, rope-wrapped rungs */
function bakeLadderTile(): Sprite {
  return bake(TILE, TILE, (x, y) => {
    if (x >= 2 && x < 4) return x === 2 ? LADDER_WOOD_HI : LADDER_WOOD_LO;
    if (x >= TILE - 4 && x < TILE - 2) return x === TILE - 4 ? LADDER_WOOD_HI : LADDER_WOOD_LO;
    const ry = y - 2;
    if (ry >= 0 && ry % 5 < 2 && x >= 4 && x < TILE - 4) {
      if (ry % 5 === 0) return x === 5 || x === TILE - 6 ? LADDER_ROPE_LO : LADDER_WOOD; // rung
      return x === 5 || x === TILE - 6 ? LADDER_ROPE : shade(LADDER_WOOD, -0.08); // rope lashing at each end
    }
    return null;
  });
}
/** a twisted rope bar with a lit top strand */
function bakeBarTile(): Sprite {
  return bake(TILE, TILE, (x, y) => {
    if (y === 6) return BAR_HI;
    if (y >= 7 && y <= 9) return (x + y) % 4 < 2 ? BAR_ROPE : shade(BAR_ROPE, -0.18);
    return null;
  });
}
/** a dug pit: a crumbly broken rim over loose dark dirt */
function bakeHoleTile(t: ThemePal): Sprite {
  return bake(TILE, TILE, (x, y) => {
    if (x < 1 || x >= TILE - 1 || y < 2) return null;
    const n = fbm(x * 0.5, y * 0.5, 2, 19);
    if (y < 4) return n > 0.5 ? t.dirt : null;
    return n > 0.75 ? shade(t.dirt, 0.12) : t.dirtLo;
  });
}
/** a chunky wooden post, ~5px wide with grain rings and a bevelled edge (left lit, right dark) */
function woodPostPx(x: number, y: number, cx: number, t: ThemePal): string | null {
  const dx = x - cx;
  if (dx < -2 || dx > 2) return null;
  let v = dx <= -2 ? shade(t.beam, 0.3) : dx === -1 ? shade(t.beam, 0.12) : dx >= 2 ? shade(t.beam, -0.26) : dx === 1 ? shade(t.beam, -0.1) : t.beam;
  if (y % 4 === 0) v = shade(v, -0.12); // a grain ring every few pixels
  return v;
}
/** the mineshaft's back wall behind every empty cell: layered warm rock strata, cracks, hanging
 *  stalactites right under the shaft ceiling, embedded crystal clusters with a glow halo, chunky
 *  timber support frames (posts + crossbeam, wood-grained) carrying big lantern light pools, and
 *  a distant mine-cart track silhouette — all baked into one picture, one sprite blit a frame. */
function bakeCaveBg(t: ThemePal): Sprite {
  const w = COLS * TILE;
  const h = ROWS * TILE;
  const lonePosts = [246]; // just one rhythm post — the two frames below carry the rest
  const frames = [
    { l: 42, r: 98, y: 19 },
    { l: 160, r: 216, y: 19 },
  ];
  return bake(w, h, (x, y) => {
    // distant mine-cart track along the shaft floor
    if (y >= h - 6 && y < h - 2) {
      const railY = y === h - 6 || y === h - 3;
      if (railY) return shade(t.bg, -0.14);
      if ((x + 3) % 7 === 0) return shade(t.bg, -0.2); // sleepers
    }
    for (const px of lonePosts) {
      const p = woodPostPx(x, y, px, t);
      if (p) return p;
    }
    for (const fr of frames) {
      const pl = woodPostPx(x, y, fr.l, t);
      if (pl) return pl;
      const pr = woodPostPx(x, y, fr.r, t);
      if (pr) return pr;
      // the crossbeam joining the two posts
      if (x >= fr.l - 2 && x <= fr.r + 2 && y >= fr.y && y <= fr.y + 4) {
        let v = y === fr.y ? shade(t.beam, 0.25) : y === fr.y + 4 ? shade(t.beam, -0.2) : t.beam;
        if (x % 5 === 0) v = shade(v, -0.1);
        return v;
      }
      // a hanging lantern at the frame's centre: a chain, then a small metal-frame cage with a
      // visible flame inside, then a big ROUND light pool fading out in three dither steps
      // (bright core, dithered mid band, sparse dithered edge) instead of a hard-edged patch
      const cxp = (fr.l + fr.r) / 2;
      const dx = x - cxp;
      const by = fr.y + 5;
      if (Math.abs(dx) <= 1 && y >= by && y <= by + 2) return shade(t.beam, -0.15); // chain
      const cy = y - (by + 3); // local y inside the lantern cage, 0..7
      if (Math.abs(dx) <= 3 && cy >= 0 && cy <= 7) {
        const cageEdge = Math.abs(dx) === 3 || cy === 0 || cy === 7;
        if (cageEdge) return "#241a12"; // the cage frame
        const fd = Math.hypot(dx / 2, (cy - 3.5) / 3);
        if (fd < 0.55) return t.crystalGlow; // the flame's bright core
        if (fd < 1) return t.lantern; // the flame's outer lick
        return "#1a120a"; // dark gap between the flame and the cage bars
      }
      const poolCy = by + 3.5;
      const pd = Math.hypot(dx / 16, (y - poolCy) / 13.5);
      if (pd < 0.35) return t.lantern; // step 1: solid bright core
      if (pd < 0.65) {
        if (0.85 > bayer(x, y)) return pd < 0.5 ? t.lantern : shade(t.lantern, -0.18); // step 2: dense dither
      } else if (pd < 1) {
        const cov = ((1 - pd) / 0.35) * 0.55;
        if (cov > bayer(x, y)) return shade(t.lantern, -0.3); // step 3: sparse dither fading into the rock
      }
    }
    // stalactites hanging right under the always-solid ceiling, so they read clearly at the top
    const sb = Math.floor(x / 22);
    if (hash2(sb, 0, 601) > 0.4) {
      const tipX = sb * 22 + Math.floor(hash2(sb, 0, 602) * 18) + 3;
      const len = 10 + Math.floor(hash2(sb, 0, 603) * 16);
      const ddx = x - tipX;
      const ddy = y - TILE;
      if (ddy >= 0 && ddy < len && Math.abs(ddx) < (len - ddy) * 0.32 + 1) {
        return ddx < 0 ? shade(t.rockHi, -0.05) : shade(t.rockLo, -0.1);
      }
    }
    const grad = shade(t.bg, -0.08 + 0.1 * (y / h));
    // horizontal rock strata, gently wavy
    const waveY = y + 5 * Math.sin(x * 0.05 + 1.7);
    const band = Math.floor(waveY / 15) % 2;
    const strata = band === 0 ? shade(grad, 0.05) : shade(grad, -0.05);
    // thin meandering cracks
    const crackN = fbm(x * 0.07, y * 0.07, 2, 31);
    if (Math.abs(crackN - 0.5) < 0.009) return t.crack;
    // small rocky outcrops hanging down from scattered points, deeper in the shaft
    const ox = Math.floor(x / 34);
    const oy = Math.floor(y / 46);
    if (hash2(ox, oy, 61) > 0.6) {
      const originX = ox * 34 + Math.floor(hash2(ox, oy, 62) * 30) + 2;
      const originY = oy * 46;
      const len = 8 + Math.floor(hash2(ox, oy, 63) * 10);
      const ddx = x - originX;
      const ddy = y - originY;
      if (ddy >= 0 && ddy < len && Math.abs(ddx) < (len - ddy) * 0.4 + 0.5) {
        return ddx < 0 ? shade(t.rockHi, -0.1) : shade(t.rockLo, -0.05);
      }
    }
    // embedded crystal clusters — bigger (8-14px) faceted gem groups with a soft glow halo,
    // not a round blob
    const cx = Math.floor(x / 36);
    const cy = Math.floor(y / 40);
    if (hash2(cx, cy, 81) > 0.68) {
      const gx = cx * 36 + Math.floor(hash2(cx, cy, 82) * 22) + 7;
      const gy = cy * 40 + Math.floor(hash2(cx, cy, 83) * 26) + 7;
      const hd = Math.hypot(x - gx, (y - gy) * 1.2);
      if (hd < 9 && hd > 4.2 && (9 - hd) / 4.8 > bayer(x, y)) return shade(t.crystalA, -0.22); // outer glow halo
      for (let k = 0; k < 3; k++) {
        const fx = gx + Math.round((hash2(cx, cy, 85 + k) - 0.5) * 11);
        const fy = gy + Math.round((hash2(cx, cy, 95 + k) - 0.5) * 7);
        const m = Math.abs(x - fx) + Math.abs(y - fy) * 1.4; // a squat diamond facet
        if (m < 1.1) return t.crystalGlow;
        if (m < 2.6) return k === 1 ? t.crystalB : t.crystalA;
        if (m < 3.6) return shade(t.crystalA, -0.35); // the facet's embedded dark edge
      }
    }
    return strata;
  });
}
/** a riveted dark metal strip behind the HUD, instead of a flat black bar */
function bakeHudPanel(): Sprite {
  return bake(W, GY, (x, y) => {
    if (y === GY - 1) return "#5a2f17";
    const base = shade(PAL.black, 0.07 + 0.1 * (1 - y / GY));
    if (y === 3 && x % 18 === 9) return shade(PAL.brown, 0.25);
    return base;
  });
}
const PICK_ICON: Sprite = sprite(["..kk....", ".kppppk.", "kpp..ppk", ".k....k.", "...nn...", "...nh...", "...nn...", "........"], { k: PAL.black, p: PAL.grey, n: PAL.brown, h: "#b36a1e" });

/** art shared by every theme: the miner, the goblins and the HUD — baked once at first draw */
function buildHeroArt() {
  return {
    hudPanel: bakeHudPanel(),
    lampCone: bakeLampCone(),
    backPick: outlined(BACK_PICK),
    heroRun: HERO_RUN.map((sp) => outlined(sp)),
    heroClimb: HERO_CLIMB.map((sp) => outlined(sp)),
    heroHang: outlined(HERO_HANG),
    heroDig: outlined(HERO_DIG),
    goblinWalk: GOBLIN_WALK.map((sp) => outlined(sp)),
    goblinStuck: outlined(GOBLIN_STUCK),
  };
}
let HA: ReturnType<typeof buildHeroArt> | null = null;
const heroArt = () => (HA ??= buildHeroArt());

/** the mine's environment art for one theme (recoloured brick/stone/cave/hole), baked lazily
 *  the first time a level of that theme is reached and cached for the rest of the run */
function buildThemeArt(theme: ThemePal) {
  return {
    // one unique block baked per grid cell (not a handful of repeated variants) so the wall
    // reads as individually carved rock, never a tiled pattern
    brickTiles: Array.from({ length: ROWS }, (_, rr) => Array.from({ length: COLS }, (_, c) => bakeBrickTile(theme, c, rr))),
    stoneTiles: Array.from({ length: ROWS }, (_, rr) => Array.from({ length: COLS }, (_, c) => bakeStoneTile(theme, c, rr))),
    ladderTile: bakeLadderTile(),
    barTile: bakeBarTile(),
    holeTile: bakeHoleTile(theme),
    caveBg: bakeCaveBg(theme),
    dust: theme.dust,
  };
}
const themeCache = new Map<number, ReturnType<typeof buildThemeArt>>();
const themeArt = (idx: number) => {
  let a = themeCache.get(idx);
  if (!a) {
    a = buildThemeArt(THEMES[idx]);
    themeCache.set(idx, a);
  }
  return a;
};

function drawGame(g: Gfx, s: DrawState) {
  const { level, get, holes, goldGrid, goblins, hero, state, stateT, levelIdx, lives, goldLeft, escapeActive, pops, fx, shake, tick } = s;
  const HA = heroArt();
  const A = themeArt(themeForLevel(levelIdx));
  g.clear(PAL.black);

  // a tiny shake on a caught kid or a trapped goblin — applied only to the playfield, never the HUD
  const sx = shake > 0 ? (tick % 2 === 0 ? 1 : -1) * Math.min(2, shake) : 0;
  const sy = shake > 1 ? (tick % 2 === 0 ? -1 : 1) : 0;
  g.camera(sx, sy);

  g.sprite(A.caveBg, 0, GY);

  for (let rr = 0; rr < ROWS; rr++) {
    for (let c = 0; c < COLS; c++) {
      const t = get(c, rr);
      const x = c * TILE;
      const y = GY + rr * TILE;
      if (t === "#") g.sprite(A.brickTiles[rr][c], x, y);
      else if (t === "X") g.sprite(A.stoneTiles[rr][c], x, y);
      else if (t === "H") g.sprite(A.ladderTile, x, y);
      else if (t === "-") g.sprite(A.barTile, x, y);
      const life = holes.get(holeKey(c, rr));
      if (life !== undefined) {
        g.sprite(A.holeTile, x, y);
        if (life < 40 && Math.floor(tick / 6) % 2 === 0) g.box(x + 1, y + 1, TILE - 2, TILE - 2, PAL.orange); // telegraph the refill
      }
    }
  }

  if (escapeActive) {
    // a few lights climbing the newly-opened escape ladder so it reads as the goal
    const ecol = level.escapeCol;
    for (let i = 0; i < 3; i++) {
      const travel = (tick * 2 + i * 70) % (ROWS * TILE);
      g.rect(ecol * TILE + 7, GY + ROWS * TILE - travel, 2, 2, i % 2 === 0 ? PAL.lime : PAL.yellow);
    }
  }

  for (let rr = 0; rr < ROWS; rr++)
    for (let c = 0; c < COLS; c++)
      if (goldGrid[rr][c]) {
        const glint = Math.floor((tick + Math.floor(hash2(c, rr, 77) * 60)) / 16) % 3;
        const sp = glint === 0 ? GOLD_SPRITE : glint === 1 ? GOLD_SPRITE_2 : GOLD_SPRITE_3;
        g.sprite(sp, c * TILE + 3, GY + rr * TILE + 4);
      }

  for (const d of fx) {
    g.alpha(Math.max(0.2, 1 - d.t / d.life));
    g.rect(Math.round(d.x - d.size / 2), Math.round(d.y - d.size / 2), d.size, d.size, d.color);
  }
  g.alpha(1);

  for (const gb of goblins) {
    const x = actorPx(gb);
    const y = actorPy(gb);
    if (gb.stuck > 0) {
      drawAnchored(g, HA.goblinStuck, x, y, GOBLIN_W, GOBLIN_H, GOBLIN_SCALE, { flipX: gb.facing < 0 });
      for (let i = 0; i < 3; i++) {
        const ang = tick * 0.12 + (i * Math.PI * 2) / 3;
        g.text("★", x + 7 + Math.cos(ang) * 7, y - 3 + Math.sin(ang) * 3, PAL.yellow, { align: "center" });
      }
    } else drawAnchored(g, HA.goblinWalk[Math.floor(gb.anim) % 2], x, y, GOBLIN_W, GOBLIN_H, GOBLIN_SCALE, { flipX: gb.facing < 0 });
  }

  {
    const x = actorPx(hero);
    const y = actorPy(hero);
    const onLadder = isLadderAt(get, hero.col, hero.row);
    const onBar = isBarAt(get, hero.col, hero.row);
    let pose: "run" | "climb" | "hang" = "run";
    if (hero.dir === "U" || hero.dir === "D") pose = "climb";
    else if (onBar) pose = "hang";
    else if (hero.dir === null && onLadder) pose = "climb";
    // the helmet lamp's beam, fanning out in the direction the miner's facing
    const beamFacing = hero.digT > 0 ? hero.digSide : hero.facing;
    g.alpha(0.5);
    g.sprite(HA.lampCone, beamFacing > 0 ? x + 9 : x + 7 - 18, y - 3, { flipX: beamFacing < 0 });
    g.alpha(1);
    // a pickaxe slung on the back, behind the opposite shoulder from the one he's facing, so the
    // silhouette reads as a miner even when he's not mid-swing (the dig pose has its own pickaxe)
    if (hero.digT <= 0) {
      const pickX = hero.facing > 0 ? x - 1 : x + TILE - 7;
      g.sprite(HA.backPick, pickX, y + TILE - 20, { flipX: hero.facing > 0 });
    }
    if (hero.digT > 0) drawAnchored(g, HA.heroDig, x, y, HERO_W, HERO_H, HERO_SCALE, { flipX: hero.digSide < 0 });
    else if (pose === "climb") drawAnchored(g, HA.heroClimb[Math.floor(hero.anim) % 2], x, y, HERO_W, HERO_H, HERO_SCALE);
    else if (pose === "hang") drawAnchored(g, HA.heroHang, x, y, HERO_W, HERO_H, HERO_SCALE, { flipX: hero.facing < 0 });
    else drawAnchored(g, HA.heroRun[Math.floor(hero.anim) % 2], x, y, HERO_W, HERO_H, HERO_SCALE, { flipX: hero.facing < 0 });
  }

  g.camera(0, 0); // the HUD, popups and banners never shake

  for (const p of pops) g.text(p.text, p.x, p.y - p.t * 0.6, PAL.white, { align: "center" });

  g.sprite(HA.hudPanel, 0, 0);
  g.text(`L${levelIdx + 1}`, 4, 4, PAL.yellow);
  g.sprite(PICK_ICON, 42, 3);
  g.text(`x${lives}`, 56, 4, PAL.red);
  g.text(`GOLD ${goldLeft}`, 160, 4, PAL.cyan, { align: "right" });
  g.sprite(GOLD_SPRITE, 166, 1, { scale: 0.65 });

  if (escapeActive && state === "play") {
    const blink = Math.floor(tick / 15) % 2 === 0;
    if (blink) g.text("ESCAPE LADDER!", W / 2, 4, PAL.lime, { align: "center" });
  }
  if (state === "ready") {
    g.rect(16, 80, W - 32, level.hint ? 46 : 32, "rgba(13,11,26,0.82)");
    g.text(`LEVEL ${levelIdx + 1}`, W / 2, 90, PAL.yellow, { align: "center" });
    g.text(level.hint ?? "GRAB ALL THE GOLD!", W / 2, 104, PAL.white, { align: "center" });
  }
  if (state === "caught") {
    g.rect(30, 90, W - 60, 30, "rgba(13,11,26,0.82)");
    g.text("GOBLINS GOT YOU!", W / 2, 100, PAL.red, { align: "center" });
    g.text(`${lives - 1} ${lives - 1 === 1 ? "LIFE" : "LIVES"} LEFT`, W / 2, 112, PAL.white, { align: "center" });
  }
  if (state === "clear") {
    g.rect(30, 90, W - 60, 30, "rgba(13,11,26,0.82)");
    g.text("LEVEL CLEAR!", W / 2, 100, PAL.lime, { align: "center" });
    g.text(levelIdx + 1 >= LEVELS.length ? "YOU WIN!" : "NEXT LEVEL...", W / 2, 112, PAL.white, { align: "center" });
  }
}

export const goldDigger: RetroGameDef = {
  id: "gold-digger",
  title: "Gold Digger",
  blurb: "Dig sneaky holes to trap the grumpy (but harmless!) goblins and grab every gold bag!",
  genre: "Puzzle",
  emoji: "⛏️",
  color: "#9a5a32",
  controls: "✚ run & climb · A dig left · B dig right · grab all the gold!",
  pad: { dpad: "4", a: "Dig left", b: "Dig right" },
  create,
};


