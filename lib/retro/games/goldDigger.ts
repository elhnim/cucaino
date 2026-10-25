// GOLD DIGGER — a single-screen puzzle-platformer. A kid miner with a helmet lamp runs,
// climbs ladders, hangs on bars and digs escape holes to trap the grumpy goblins chasing
// her — nobody gets hurt, a trapped goblin just gets stuck in the dirt for a couple of
// seconds and climbs back out. Grab every gold bag, then a hidden ladder appears so you can
// climb to the top and clear the level. Ten handcrafted levels ramp from a gentle one-goblin
// tutorial to fast multi-goblin digging puzzles with bars and stone blockers.
// (Original game in the spirit of classic dig-and-run platformers.)
import { H, PAL, W, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";

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

// ── sprites ──
const HP = { h: PAL.yellow, l: PAL.white, f: PAL.tan, k: PAL.black, b: PAL.blue, n: PAL.dark, p: PAL.grey, g: PAL.tan };
const HEAD = ["..hhhhhhhh..", ".hhhhhhhhhh.", ".hlhhhhhhh..", ".hffffffhh..", ".kfkffkfkh..", "..kkkkkk...."];
const BODY_STAND = [".bbbbbbbbbb.", "bbbbbbbbbbbb", "bbb.bbbb.bbb", "bbb.bbbb.bbb", "bbbbbbbbbbbb", ".bb.bbbb.bb."];
const LEGS_A = ["..nn....nn..", "..nn....nn..", ".nnn....nnn.", "nnnn....nnnn"];
const LEGS_B = [".nn......nn.", "nnn......nnn", "nnn......nnn", ".nn......nn."];
/** 2-frame run cycle */
export const HERO_RUN: Sprite[] = [sprite(fit([...HEAD, ...BODY_STAND, ...LEGS_A], 12), HP), sprite(fit([...HEAD, ...BODY_STAND, ...LEGS_B], 12), HP)];

const BODY_CLIMB = ["g.bbbbbbbb.g", "g.bbbbbbbb.g", "..bbbbbbbb..", "..bb.bb.bb..", "..bb.bb.bb..", "..bb.bb.bb.."];
const LEGS_CLIMB1 = ["..nn....nn..", "nnnn....nnnn", "..nn....nn..", "..nn....nn.."];
const LEGS_CLIMB2 = ["..nn....nn..", "..nn....nn..", "nnnn....nnnn", "..nn....nn.."];
/** 2-frame climb cycle — hands on the ladder, feet alternating */
export const HERO_CLIMB: Sprite[] = [sprite(fit([...HEAD, ...BODY_CLIMB, ...LEGS_CLIMB1], 12), HP), sprite(fit([...HEAD, ...BODY_CLIMB, ...LEGS_CLIMB2], 12), HP)];

const BODY_HANG = ["g.bbbbbbbb.g", "..bbbbbbbb..", "..bbbbbbbb..", "..bbbbbbbb..", "..bbbbbbbb..", "..bb....bb.."];
const LEGS_HANG = ["..nn....nn..", "..nn....nn..", "...nnnnnn...", "............"];
/** hanging from a bar, dangling */
export const HERO_HANG: Sprite = sprite(fit([...HEAD, ...BODY_HANG, ...LEGS_HANG], 12), HP);

const BODY_DIG = ["..bbbbbbbb..", ".bbbbbbbbbbp", "bbbbbbbbbbpp", "bb.bbbb.bb.p", "bb.bbbb.bb..", ".bb.bbbb.bb."];
const LEGS_DIG = [".nnn....nnn.", "nnnn....nnnn", "nn........nn", "............"];
/** swinging the pickaxe to the right; flip for the other side */
export const HERO_DIG: Sprite = sprite(fit([...HEAD, ...BODY_DIG, ...LEGS_DIG], 12), HP);

const GP = { g: PAL.green, d: PAL.teal, k: PAL.black, w: PAL.white, r: PAL.red, n: PAL.dark };
const GOBLIN_A = ["..gggggg....", ".gggggggg...", "ggkggggkggg.", "ggggggggggg.", "gg.rrrr.ggg.", "ggggggggggg.", ".dd.gggg.dd.", "nn........nn"];
const GOBLIN_B = ["..gggggg....", ".gggggggg...", "ggkggggkggg.", "ggggggggggg.", "gg.rrrr.ggg.", "ggggggggggg.", ".dd.gggg.dd.", ".nn......nn."];
/** 2-frame grumpy-goblin shuffle */
export const GOBLIN_WALK: Sprite[] = [sprite(fit(GOBLIN_A, 12), GP), sprite(fit(GOBLIN_B, 12), GP)];
/** stuck in a hole: just the annoyed head and waving arms poking out */
export const GOBLIN_STUCK: Sprite = sprite(fit(["..gggggg....", ".gggggggg...", "ggkggggkggg.", "n.ggggggg.n.", "............", "............", "............", "............"], 12), GP);

const GOLD_PAL = { y: PAL.yellow, o: PAL.orange, k: PAL.black };
/** a little sack of gold */
export const GOLD_SPRITE: Sprite = sprite(["..oooo..", ".oyyyyo.", "oyyyyyyo", "oyyyyyyo", "oyoyyoyo", ".oyyyyo.", "..kook..", "...kk..."], GOLD_PAL);

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
  let digFx: { x: number; y: number; t: number }[] = [];

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

  const collectGold = (c: number, rr: number, io: IO) => {
    if (!inBounds(c, rr) || !goldGrid[rr][c]) return;
    goldGrid[rr][c] = false;
    goldLeft--;
    io.sfx.play("coin");
    io.score(50);
    pops.push({ x: c * TILE + 4, y: GY + rr * TILE, t: 0, text: "+50" });
    if (goldLeft <= 0) {
      escapeActive = true;
      io.sfx.play("powerup");
    }
  };
  const trapGoblin = (gb: Goblin, io: IO) => {
    gb.stuck = STUCK_LIFE;
    gb.dir = null;
    io.sfx.play("hit");
    io.score(75);
    pops.push({ x: gb.col * TILE + 2, y: GY + gb.row * TILE, t: 0, text: "+75" });
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
    digFx.push({ x: tc * TILE + 4, y: GY + tr * TILE + 4, t: 0 });
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
      hero.anim += 0.15;
      stepActor(hero, STEP);
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

  const updateHoles = () => {
    for (const [k, t] of holes) {
      const nt = t - 1;
      if (nt <= 0) {
        holes.delete(k);
        const [cs, rs] = k.split(",").map(Number);
        for (const gb of goblins) if (gb.stuck > 0 && gb.col === cs && gb.row === rs) respawnGoblin(gb);
      } else holes.set(k, nt);
    }
  };

  const heroBox = () => ({ x: actorPx(hero) + 2, y: actorPy(hero) + 1, w: TILE - 4, h: TILE - 2 });
  const goblinBox = (gb: Goblin) => ({ x: actorPx(gb) + 2, y: actorPy(gb) + 1, w: TILE - 4, h: TILE - 2 });

  return {
    update(io) {
      if (over || won) return;
      tick++;
      for (const p of pops) p.t++;
      pops = pops.filter((p) => p.t < 40);
      for (const d of digFx) d.t++;
      digFx = digFx.filter((d) => d.t < 16);

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
      updateHoles();
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
        digFx,
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
  digFx: { x: number; y: number; t: number }[];
  tick: number;
}

const BRICK_FACE = "#b06a36";
const BRICK_TOP = "#d08a4e";
const BRICK_MORTAR = "#6e3a1c";
const STONE_LIGHT = "#b7bdd4";
const LADDER_RAIL = "#caa15a";
const LADDER_RUNG = "#8a6a30";
const BAR_ROPE = "#c9a35a";
const BAR_HI = "#efd08a";

function drawGame(g: Gfx, s: DrawState) {
  const { level, get, holes, goldGrid, goblins, hero, state, stateT, levelIdx, lives, goldLeft, escapeActive, pops, digFx, tick } = s;
  g.clear(PAL.night);
  g.rect(0, 0, W, GY, PAL.black);

  for (let rr = 0; rr < ROWS; rr++) {
    for (let c = 0; c < COLS; c++) {
      const t = get(c, rr);
      const x = c * TILE;
      const y = GY + rr * TILE;
      if (t === "#") {
        g.rect(x, y, TILE, TILE, BRICK_FACE);
        g.rect(x, y, TILE, 2, BRICK_TOP);
        g.rect(x, y + 7, TILE, 1, BRICK_MORTAR);
        g.rect(x, y + TILE - 1, TILE, 1, BRICK_MORTAR);
        g.rect(x + 7, y, 1, 7, BRICK_MORTAR);
        g.rect(x + 3, y + 8, 1, 8, BRICK_MORTAR);
        g.rect(x + 11, y + 8, 1, 8, BRICK_MORTAR);
      } else if (t === "X") {
        g.rect(x, y, TILE, TILE, PAL.grey);
        g.box(x + 1, y + 1, TILE - 2, TILE - 2, PAL.dark);
        g.rect(x + 2, y + 2, 5, 5, STONE_LIGHT);
        g.rect(x + 9, y + 9, 5, 5, STONE_LIGHT);
      } else if (t === "H") {
        g.rect(x + 2, y, 2, TILE, LADDER_RAIL);
        g.rect(x + TILE - 4, y, 2, TILE, LADDER_RAIL);
        for (let i = 2; i < TILE; i += 5) g.rect(x + 2, y + i, TILE - 4, 2, LADDER_RUNG);
      } else if (t === "-") {
        g.rect(x, y + 6, TILE, 1, BAR_HI);
        g.rect(x, y + 7, TILE, 3, BAR_ROPE);
      }
      if (holes.has(holeKey(c, rr))) g.rect(x + 1, y + 2, TILE - 2, TILE - 3, "#140f22");
    }
  }

  for (let rr = 0; rr < ROWS; rr++) for (let c = 0; c < COLS; c++) if (goldGrid[rr][c]) g.sprite(GOLD_SPRITE, c * TILE + 4, GY + rr * TILE + 6);

  for (const d of digFx) {
    g.rect(d.x - d.t, d.y - d.t * 0.6, 2, 2, PAL.tan);
    g.rect(d.x + d.t, d.y - d.t * 0.6, 2, 2, PAL.brown);
  }

  for (const gb of goblins) {
    const x = actorPx(gb) + 1;
    const y = actorPy(gb);
    if (gb.stuck > 0) g.sprite(GOBLIN_STUCK, x, y, { flipX: gb.facing < 0 });
    else g.sprite(GOBLIN_WALK[Math.floor(gb.anim) % 2], x, y, { flipX: gb.facing < 0 });
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
    if (hero.digT > 0) g.sprite(HERO_DIG, x, y, { flipX: hero.digSide < 0 });
    else if (pose === "climb") g.sprite(HERO_CLIMB[Math.floor(hero.anim) % 2], x, y);
    else if (pose === "hang") g.sprite(HERO_HANG, x, y, { flipX: hero.facing < 0 });
    else g.sprite(HERO_RUN[Math.floor(hero.anim) % 2], x, y, { flipX: hero.facing < 0 });
  }

  for (const p of pops) g.text(p.text, p.x, p.y - p.t * 0.6, PAL.white, { align: "center" });

  g.text(`L${levelIdx + 1}`, 4, 4, PAL.yellow);
  g.text(`x${lives}`, 56, 4, PAL.red);
  g.text(`GOLD ${goldLeft}`, 160, 4, PAL.cyan, { align: "right" });

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


