// GOLD DIGGER — a single-screen puzzle-platformer. A kid miner with a helmet lamp runs,
// climbs ladders, hangs on bars and digs escape holes to trap the grumpy goblins chasing
// her — nobody gets hurt, a trapped goblin just gets stuck in the dirt for a couple of
// seconds and climbs back out. Grab every gold bag, then a hidden ladder appears so you can
// climb to the top and clear the level. Ten handcrafted levels ramp from a gentle one-goblin
// tutorial to fast multi-goblin digging puzzles with bars and stone blockers.
// (Original game in the spirit of classic dig-and-run platformers.)
import { H, PAL, W, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, fbm, hash2, outlined, shade } from "../art";

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
// right, a 1px outline added at bake time so the miner and goblins pop off the brick walls)
const HP = { h: PAL.yellow, L: "#fff3b0", l: PAL.white, f: PAL.tan, k: PAL.black, b: PAL.blue, c: "#7fb0ff", m: "#1c2f73", n: PAL.dark, p: PAL.grey, g: PAL.tan };
const HEAD = ["..hLLhhhhh..", ".hLhhhhhhh..", ".hlhhhhhhh..", ".hffffffhh..", ".kfkffkfkh..", "..kkkkkk...."];
const BODY_STAND = [".ccbbbbbbmm.", "ccbbbbbbbbmm", "ccb.bbbb.mmb", "ccb.bbbb.mmb", "ccbbbbbbbbmm", ".cb.bbbb.bm."];
const LEGS_A = ["..nn....nn..", "..nn....nn..", ".nnn....nnn.", "nnnn....nnnn"];
const LEGS_B = [".nn......nn.", "nnn......nnn", "nnn......nnn", ".nn......nn."];
/** 2-frame run cycle */
export const HERO_RUN: Sprite[] = [sprite(fit([...HEAD, ...BODY_STAND, ...LEGS_A], 12), HP), sprite(fit([...HEAD, ...BODY_STAND, ...LEGS_B], 12), HP)];

const BODY_CLIMB = ["g.ccbbmm.g.g", "g.ccbbmm.g.g", "..ccbbbbmm..", "..bb.bb.bb..", "..bb.bb.bb..", "..bb.bb.bb.."];
const LEGS_CLIMB1 = ["..nn....nn..", "nnnn....nnnn", "..nn....nn..", "..nn....nn.."];
const LEGS_CLIMB2 = ["..nn....nn..", "..nn....nn..", "nnnn....nnnn", "..nn....nn.."];
/** 2-frame climb cycle — hands on the ladder, feet alternating */
export const HERO_CLIMB: Sprite[] = [sprite(fit([...HEAD, ...BODY_CLIMB, ...LEGS_CLIMB1], 12), HP), sprite(fit([...HEAD, ...BODY_CLIMB, ...LEGS_CLIMB2], 12), HP)];

const BODY_HANG = ["g.ccbbmm.g.g", "..ccbbbbmm..", "..ccbbbbmm..", "..bbbbbbbb..", "..bbbbbbbb..", "..bb....bb.."];
const LEGS_HANG = ["..nn....nn..", "..nn....nn..", "...nnnnnn...", "............"];
/** hanging from a bar, dangling */
export const HERO_HANG: Sprite = sprite(fit([...HEAD, ...BODY_HANG, ...LEGS_HANG], 12), HP);

const BODY_DIG = ["..ccbbmm....", ".ccbbbbbbbbp", "ccbbbbbbbbpp", "bb.bbbb.bb.p", "bb.bbbb.bb..", ".bb.bbbb.bb."];
const LEGS_DIG = [".nnn....nnn.", "nnnn....nnnn", "nn........nn", "............"];
/** swinging the pickaxe to the right; flip for the other side */
export const HERO_DIG: Sprite = sprite(fit([...HEAD, ...BODY_DIG, ...LEGS_DIG], 12), HP);

const GP = { g: PAL.green, G: "#8df26a", d: PAL.teal, D: "#0f8075", k: PAL.black, w: PAL.white, r: PAL.red, n: PAL.dark };
const GOBLIN_A = ["..GGgggg....", ".GGggggggg..", "ggkggggkggg.", "ggggggggggg.", "gg.rrrr.ggg.", "ggdddddddgg.", ".dD.gggg.Dd.", "nn........nn"];
const GOBLIN_B = ["..GGgggg....", ".GGggggggg..", "ggkggggkggg.", "ggggggggggg.", "gg.rrrr.ggg.", "ggdddddddgg.", ".dD.gggg.Dd.", ".nn......nn."];
/** 2-frame grumpy-goblin shuffle */
export const GOBLIN_WALK: Sprite[] = [sprite(fit(GOBLIN_A, 12), GP), sprite(fit(GOBLIN_B, 12), GP)];
/** stuck in a hole: just the annoyed head and waving arms poking out */
export const GOBLIN_STUCK: Sprite = sprite(fit(["..GGgggg....", ".GGggggggg..", "ggkggggkggg.", "n.ggggggg.n.", "............", "............", "............", "............"], 12), GP);

const GOLD_PAL = { y: PAL.yellow, o: PAL.orange, k: PAL.black, w: PAL.white, d: "#b36a1e" };
const GOLD_ROWS = [
  "..kooook..",
  ".okyyyyko.",
  "SHINE_ROW2",
  "okyyyyyyko",
  "okyoyyoyko",
  "okyyyyyyko",
  ".okddddo..",
  "..kdkkd...",
  "...kkkk...",
];
/** a fatter, shinier sack of gold with a 2-frame glint so it twinkles in the dark */
export const GOLD_SPRITE: Sprite = sprite(GOLD_ROWS.map((r) => (r === "SHINE_ROW2" ? "okyywyyyko" : r)), GOLD_PAL);
export const GOLD_SPRITE_2: Sprite = sprite(GOLD_ROWS.map((r) => (r === "SHINE_ROW2" ? "okyyyywyko" : r)), GOLD_PAL);

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
    burst(gb.col * TILE + 8, GY + gb.row * TILE + 8, 5, 0.55, 20, [PAL.tan, PAL.brown]);
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
    burst(tc * TILE + 8, GY + tr * TILE + 6, 6, 0.65, 16, [PAL.tan, PAL.brown, "#6e3a1c"]);
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
      else if ((movingDir === "U" || movingDir === "D") && tick % 10 === 0) io.sfx.tone(300, 0.05, "square", 0.14);
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

// ── baked environment art — a dark mineshaft behind everything, running-bond brick walls,
// cracked stone blockers, round-railed gold ladders and a twisted rope bar, all baked once
// (lazily, on first draw) from the painting's warm brick / gold-ladder / deep-navy palette so
// the whole screen reads as a real cartridge mine instead of flat coloured rects.
const BRICK_FACE = "#b06a36";
const BRICK_TOP = "#d08a4e";
const BRICK_MORTAR = "#5a2f17";
const STONE_BASE = PAL.grey;
const STONE_LIGHT = "#b7bdd4";
const STONE_DARK = "#4a4e6a";
const LADDER_RAIL = "#e0a84e";
const LADDER_RUNG = "#8a6a30";
const BAR_ROPE = "#c9a35a";
const BAR_HI = "#efd08a";
const HOLE_DIRT = "#1c1430";
const HOLE_DIRT_LO = "#0a0716";
const BRICK_VARIANTS = 3;
const STONE_VARIANTS = 2;

/** a 16x16 brick course, two half-height rows in a running bond so adjacent cells tile into a
 *  continuous wall; each individual brick gets its own bevel, shaded underside and a touch of
 *  per-brick colour speckle (from `variant` + its position) instead of one flat slab. */
function bakeBrickTile(variant: number): Sprite {
  return bake(TILE, TILE, (x, y) => {
    if (y === 0) return BRICK_TOP; // the course's own top rim catches the lamp light
    if (y === 7 || y === TILE - 1) return BRICK_MORTAR; // the two brick rows' grout lines
    const rowB = y < 7 ? 0 : 1;
    const shiftedX = rowB === 0 ? x : x + 4;
    const bx = ((shiftedX % 8) + 8) % 8;
    if (bx === 0) return BRICK_MORTAR; // vertical joints, offset for a running bond
    const brickId = Math.floor(shiftedX / 8) + rowB * 2;
    const tone = hash2(brickId, variant, 71);
    const base = tone > 0.78 ? shade(BRICK_FACE, 0.07) : tone < 0.22 ? shade(BRICK_FACE, -0.09) : BRICK_FACE;
    if (y === 1 || y === 8) return shade(base, 0.16); // each brick's own bevel
    if (y === 6 || y === 13) return shade(base, -0.14); // each brick's shaded underside
    return base;
  });
}
/** a cracked stone blocker: mottled light/dark patches over a dark rim, never diggable */
function bakeStoneTile(variant: number): Sprite {
  return bake(TILE, TILE, (x, y) => {
    if (x === 0 || x === TILE - 1 || y === 0 || y === TILE - 1) return STONE_DARK;
    const n = fbm(x * 0.4 + variant * 11, y * 0.4 + variant * 7, 2, variant * 13 + 4);
    if (n > 0.68) return STONE_LIGHT;
    if (n < 0.32) return STONE_DARK;
    return STONE_BASE;
  });
}
/** a round-railed ladder: each rail has a lit edge and a shadow edge, rungs shaded top-to-bottom */
function bakeLadderTile(): Sprite {
  return bake(TILE, TILE, (x, y) => {
    if (x >= 2 && x < 4) return x === 2 ? shade(LADDER_RAIL, 0.3) : shade(LADDER_RAIL, -0.1);
    if (x >= TILE - 4 && x < TILE - 2) return x === TILE - 4 ? shade(LADDER_RAIL, 0.3) : shade(LADDER_RAIL, -0.1);
    const ry = y - 2;
    if (ry >= 0 && ry % 5 < 2 && x >= 4 && x < TILE - 4) return ry % 5 === 0 ? shade(LADDER_RUNG, 0.15) : LADDER_RUNG;
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
function bakeHoleTile(): Sprite {
  return bake(TILE, TILE, (x, y) => {
    if (x < 1 || x >= TILE - 1 || y < 2) return null;
    const n = fbm(x * 0.5, y * 0.5, 2, 19);
    if (y < 4) return n > 0.5 ? HOLE_DIRT : null;
    return n > 0.75 ? shade(HOLE_DIRT, 0.12) : HOLE_DIRT_LO;
  });
}
/** the mineshaft's back wall behind every empty cell: a vertical gradient, soft distant rock
 *  shadows and a scatter of mineral sparkle — three depth layers baked into one big picture so
 *  the whole playfield's background costs a single sprite blit a frame. */
function bakeCaveBg(): Sprite {
  const w = COLS * TILE;
  const h = ROWS * TILE;
  return bake(w, h, (x, y) => {
    const grad = shade(PAL.night, -0.08 + 0.1 * (y / h));
    const rock = fbm(x * 0.045, y * 0.045, 3, 5);
    const wall = rock > 0.66 ? shade(grad, -0.05) : rock < 0.3 ? shade(grad, 0.02) : grad;
    if (hash2(x, y, 3) > 0.9994) return hash2(x, y, 4) > 0.5 ? "#dff6ff" : "#8fd8ff"; // a rare mineral glint
    return wall;
  });
}
/** a riveted dark metal strip behind the HUD, instead of a flat black bar */
function bakeHudPanel(): Sprite {
  return bake(W, GY, (x, y) => {
    if (y === GY - 1) return BRICK_MORTAR;
    const base = shade(PAL.black, 0.07 + 0.1 * (1 - y / GY));
    if (y === 3 && x % 18 === 9) return shade(PAL.brown, 0.25);
    return base;
  });
}
const PICK_ICON: Sprite = sprite(["..kk....", ".kppppk.", "kpp..ppk", ".k....k.", "...nn...", "...nh...", "...nn...", "........"], { k: PAL.black, p: PAL.grey, n: PAL.brown, h: "#b36a1e" });

function buildArt() {
  return {
    brickTiles: Array.from({ length: BRICK_VARIANTS }, (_, i) => bakeBrickTile(i)),
    stoneTiles: Array.from({ length: STONE_VARIANTS }, (_, i) => bakeStoneTile(i)),
    ladderTile: bakeLadderTile(),
    barTile: bakeBarTile(),
    holeTile: bakeHoleTile(),
    caveBg: bakeCaveBg(),
    hudPanel: bakeHudPanel(),
    heroRun: HERO_RUN.map((sp) => outlined(sp)),
    heroClimb: HERO_CLIMB.map((sp) => outlined(sp)),
    heroHang: outlined(HERO_HANG),
    heroDig: outlined(HERO_DIG),
    goblinWalk: GOBLIN_WALK.map((sp) => outlined(sp)),
    goblinStuck: outlined(GOBLIN_STUCK),
  };
}
let A: ReturnType<typeof buildArt> | null = null;
const art = () => (A ??= buildArt());

function drawGame(g: Gfx, s: DrawState) {
  const { level, get, holes, goldGrid, goblins, hero, state, stateT, levelIdx, lives, goldLeft, escapeActive, pops, fx, shake, tick } = s;
  const A = art();
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
      if (t === "#") g.sprite(A.brickTiles[Math.floor(hash2(c, rr, 41) * BRICK_VARIANTS)], x, y);
      else if (t === "X") g.sprite(A.stoneTiles[Math.floor(hash2(c, rr, 53) * STONE_VARIANTS)], x, y);
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
        const shine = Math.floor((tick + Math.floor(hash2(c, rr, 77) * 40)) / 20) % 2 === 0;
        g.sprite(shine ? GOLD_SPRITE : GOLD_SPRITE_2, c * TILE + 3, GY + rr * TILE + 5);
      }

  for (const d of fx) {
    g.alpha(Math.max(0.2, 1 - d.t / d.life));
    g.rect(Math.round(d.x - d.size / 2), Math.round(d.y - d.size / 2), d.size, d.size, d.color);
  }
  g.alpha(1);

  for (const gb of goblins) {
    const x = actorPx(gb) + 1;
    const y = actorPy(gb);
    if (gb.stuck > 0) {
      g.sprite(A.goblinStuck, x, y, { flipX: gb.facing < 0 });
      for (let i = 0; i < 3; i++) {
        const ang = tick * 0.12 + (i * Math.PI * 2) / 3;
        g.text("★", x + 5 + Math.cos(ang) * 7, y - 2 + Math.sin(ang) * 3, PAL.yellow, { align: "center" });
      }
    } else g.sprite(A.goblinWalk[Math.floor(gb.anim) % 2], x, y, { flipX: gb.facing < 0 });
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
    if (hero.digT > 0) g.sprite(A.heroDig, x, y, { flipX: hero.digSide < 0 });
    else if (pose === "climb") g.sprite(A.heroClimb[Math.floor(hero.anim) % 2], x, y);
    else if (pose === "hang") g.sprite(A.heroHang, x, y, { flipX: hero.facing < 0 });
    else g.sprite(A.heroRun[Math.floor(hero.anim) % 2], x, y, { flipX: hero.facing < 0 });
  }

  g.camera(0, 0); // the HUD, popups and banners never shake

  for (const p of pops) g.text(p.text, p.x, p.y - p.t * 0.6, PAL.white, { align: "center" });

  g.sprite(A.hudPanel, 0, 0);
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


