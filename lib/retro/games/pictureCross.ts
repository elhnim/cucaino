// PICTURE CROSS — an original nonogram (picture logic) puzzle, in the spirit of the classic
// SNES picture-crossword games but with its own 20 hand-drawn pictures. Every puzzle is a grid
// of clue numbers down each row and column: the numbers say how many cells in a row are filled
// and how long each filled streak is, and filling the right cells reveals a hidden picture.
// D-pad moves the chisel cursor (auto-repeats when held); A chisels a cell in (hold + move to
// chisel a whole line); B marks a cell with an ✕ (hold + move to mark a line). Tapping a cell
// moves the cursor there and chisels it (hold B while tapping to mark instead). A wrong chisel
// is never undone — the cell shows a red ✕ and the countdown clock loses time — so a completed
// picture is always the one true answer the clues describe. Finished rows/columns grey out, and
// solving the whole grid reveals the picture in colour with its name and a little fanfare.
import { H, PAL, W, clamp, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, hash2, shade, bayer } from "../art";

// ───────────────────────── puzzles ─────────────────────────

export interface PicturePuzzle {
  /** shown on the reveal banner, e.g. "A HEART!" */
  name: string;
  /** one string per row: "#" filled, "." empty. Every puzzle has exactly one line-logic solution. */
  rows: string[];
  /** colour of a filled cell once revealed/solved */
  color: (x: number, y: number) => string;
  /** a two-line tip (kept short so both lines fit the 256px screen), shown on the first couple of puzzles */
  hint?: readonly [string, string];
}

// Picture pixel art, authored by hand and checked (see pictureCross.tmp.test.ts while this game
// was built) to be solvable by pure line logic alone — no guessing ever required.
export const PICTURE_PUZZLES: PicturePuzzle[] = [
  // ── 5x5 — gentle introduction ──
  {
    name: "HEART",
    hint: ["NUMBERS = HOW MANY IN A ROW", "TRY ROW 2 FIRST"],
    rows: [".#.#.", "#####", "#####", ".###.", "..#.."],
    color: (_x, y) => (y === 0 ? PAL.pink : PAL.red),
  },
  {
    name: "STAR",
    hint: ["FILL WHERE THE CLUES SAY", "GREY NUMBERS MEAN DONE"],
    rows: ["..#..", ".###.", "#####", ".###.", "..#.."],
    color: () => PAL.yellow,
  },
  {
    name: "APPLE",
    rows: ["..#..", ".###.", "#####", "#####", ".###."],
    color: (_x, y) => (y === 0 ? PAL.brown : PAL.red),
  },
  {
    name: "DUCK",
    rows: ["...##", "..###", ".####", "#####", ".###."],
    color: (x, y) => (y === 0 && x === 4 ? PAL.orange : PAL.yellow),
  },
  {
    name: "HOUSE",
    rows: ["..#..", ".###.", "#####", "#####", "##.##"],
    color: (_x, y) => (y <= 1 ? PAL.red : PAL.tan),
  },
  {
    name: "TREE",
    rows: ["..#..", ".###.", "#####", "..#..", "..#.."],
    color: (_x, y) => (y <= 2 ? PAL.green : PAL.brown),
  },

  // ── 10x10 ──
  {
    name: "CAT",
    rows: [
      "..#....#..",
      ".##....##.",
      ".########.",
      ".########.",
      "..######..",
      "...####...",
      "..######..",
      ".########.",
      ".########.",
      ".##....###",
    ],
    color: (x, y) => (y === 0 && (x === 2 || x === 7) ? PAL.dark : PAL.orange),
  },
  {
    name: "FISH",
    rows: [
      "..........",
      "....##....",
      "..#######.",
      ".#########",
      "##########",
      ".#########",
      "..#######.",
      "....##....",
      "..........",
      "..........",
    ],
    color: (x, y) => (x === 7 && y === 3 ? PAL.black : PAL.cyan),
  },
  {
    name: "ROCKET",
    rows: [
      "....##....",
      "...####...",
      "..######..",
      "..######..",
      "..######..",
      "..######..",
      "..######..",
      "..######..",
      ".########.",
      "...####...",
    ],
    color: (_x, y) => (y <= 1 ? PAL.red : y <= 7 ? PAL.sky : y === 8 ? PAL.red : PAL.orange),
  },
  {
    name: "CAR",
    rows: [
      "..........",
      "..........",
      "..######..",
      ".########.",
      "##########",
      "##########",
      ".##....##.",
      ".##....##.",
      "..........",
      "..........",
    ],
    color: (_x, y) => (y >= 6 ? PAL.dark : PAL.red),
  },
  {
    name: "FLOWER",
    rows: [
      "..######..",
      ".########.",
      "##########",
      "##.####.##",
      "...####...",
      "...####...",
      "...####...",
      "...####...",
      "..........",
      "..........",
    ],
    color: (_x, y) => (y <= 3 ? PAL.pink : PAL.green),
  },
  {
    name: "SAILBOAT",
    rows: [
      "....#.....",
      "....##....",
      "....###...",
      "....####..",
      "....#####.",
      "....#.....",
      "..#######.",
      ".#########",
      "..........",
      "..........",
    ],
    color: (x, y) => (x === 4 && y <= 5 ? PAL.brown : y <= 4 ? PAL.white : PAL.blue),
  },
  {
    name: "ROBOT",
    rows: [
      "....##....",
      ".########.",
      ".#.####.#.",
      ".########.",
      "...####...",
      "##.####.##",
      "..######..",
      "..######..",
      "..##..##..",
      "..##..##..",
    ],
    color: (_x, y) => (y === 0 ? PAL.red : PAL.grey),
  },
  {
    name: "CROWN",
    rows: [
      "#.#.#.#.#.",
      "#.#.#.#.#.",
      "##########",
      "##.##.##.#",
      "##########",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
    ],
    color: (_x, y) => (y <= 1 ? PAL.orange : PAL.yellow),
  },
  {
    name: "TURTLE",
    rows: [
      "....##....",
      "...####...",
      "##.####.##",
      "..######..",
      ".########.",
      ".########.",
      "..######..",
      "##.####.##",
      "...####...",
      "....##....",
    ],
    color: (x, y) => ((y <= 1 || y >= 8) ? PAL.lime : (y === 2 || y === 7) && (x <= 1 || x >= 8) ? PAL.brown : PAL.green),
  },
  {
    name: "ICE CREAM",
    rows: [
      "..######..",
      ".########.",
      ".########.",
      "..######..",
      "...####...",
      "...####...",
      "....##....",
      "....##....",
      ".....#....",
      "..........",
    ],
    color: (_x, y) => (y <= 3 ? PAL.pink : PAL.tan),
  },

  // ── 15x15 — the big ones ──
  {
    name: "DINOSAUR",
    rows: [
      "...............",
      "..........##...",
      ".........####..",
      "........####...",
      ".......####....",
      "......####.....",
      ".....######....",
      "....########...",
      "...##########..",
      "..############.",
      "..############.",
      "..############.",
      "#..##..##..##..",
      "...##..##..##..",
      "...............",
    ],
    color: (_x, y) => (y >= 12 ? PAL.brown : PAL.green),
  },
  {
    name: "DRAGON",
    rows: [
      "...............",
      "...........##..",
      "..........####.",
      ".........####..",
      "....#...####...",
      "...###.####....",
      "..##########...",
      "..###########..",
      ".#############.",
      ".#############.",
      ".#############.",
      "#...##..##.##..",
      "....##..##.##..",
      "...............",
      "...............",
    ],
    color: (x, y) => ((y === 4 && x === 4) || (y === 5 && x <= 5) ? PAL.purple : y >= 11 ? PAL.brown : PAL.red),
  },
  {
    name: "CASTLE",
    rows: [
      ".#.#......#.#..",
      ".####.....####.",
      ".####.....####.",
      ".####.#.#.####.",
      ".#############.",
      ".#############.",
      ".#####...#####.",
      ".#####...#####.",
      ".#####...#####.",
      "...............",
      "...............",
      "...............",
      "...............",
      "...............",
      "...............",
    ],
    color: (x) => (x <= 4 || x >= 10 ? PAL.tan : PAL.grey),
  },
  {
    name: "RAINBOW",
    rows: [
      "...............",
      "...............",
      "...............",
      "...............",
      "...............",
      ".....#####.....",
      ".....#####.....",
      "...#########...",
      "...#########...",
      ".#############.",
      ".#############.",
      "###############",
      "###############",
      "...............",
      "...............",
    ],
    color: (_x, y) => (y <= 6 ? PAL.purple : y <= 8 ? PAL.green : y <= 10 ? PAL.yellow : PAL.red),
  },
];

// ───────────────────────── clue logic ─────────────────────────

/** Run-lengths of filled cells in a line, e.g. [1,0,1,1,0] -> [1,2]. Empty line -> []. */
function cluesOf(line: number[]): number[] {
  const groups: number[] = [];
  let run = 0;
  for (const v of line) {
    if (v) run++;
    else {
      if (run) groups.push(run);
      run = 0;
    }
  }
  if (run) groups.push(run);
  return groups;
}
function sameClue(a: number[], b: number[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
function bitsOf(rows: string[]): number[][] {
  return rows.map((r) => [...r].map((c) => (c === "#" ? 1 : 0)));
}

// ───────────────────────── layout ─────────────────────────

/** How many pixels to reserve per clue number, by puzzle size (bigger grids need smaller type). */
function slotSize(n: number) {
  if (n <= 5) return { cell: 28, rowSlot: 11, colSlot: 10 };
  if (n <= 10) return { cell: 14, rowSlot: 9, colSlot: 9 };
  return { cell: 10, rowSlot: 8, colSlot: 8 };
}

// young kids are still learning the logic, so the clocks are generous
const TIME_PER_SIZE: Record<number, number> = { 5: 60 * 180, 10: 60 * 360, 15: 60 * 600 };
const MISTAKE_PENALTY = 60 * 10; // 10 seconds off the clock

// ───────────────────────── carved-wood cabinet look ─────────────────────────
// The cabinet painting shows a carved wooden puzzle frame holding cream tablets: a dark amber
// border, a gold corner badge where the row/column clue gutters meet, warm cream paper for the
// grid and tan parchment behind the clue numbers, a chiselled navy block for a correct cell, and
// a dashed red "X" scratched onto a cell the kid has marked as empty. Everything below is baked
// once (lazily, the first time a given size/puzzle is needed) and reused every frame after.
const WOOD_DARK = "#4a2510";
const WOOD_MID = "#8a4a1e";
const WOOD_LIGHT = "#d08a3e";
const PAPER_HEADER = "#e7cf9c";
const PAPER_GRID = "#f7ecd2";
const GOLD = "#ffd76a";
const GRID_LINE = "#c9ad78";
const INK = "#8a2518";
const INK_DONE = "#b7a98a";
const MARK_RED = "#d9503f";
/** a correct cell is chiselled in this one neutral navy while playing — the picture's real
 * colours stay hidden (so they can't be used to cheat) until the reveal screen */
const CHISEL_BASE = "#2c3a68";

/** the carved wood frame + parchment background for one puzzle's clue gutters + grid — baked
 *  once per puzzle (geometry only depends on its clue shape) and blitted as a single sprite. */
function bakeFrame(gutterW: number, headerH: number, gw: number, gh: number): Sprite {
  const panelW = gutterW + gw + 8;
  const panelH = headerH + gh + 8;
  const B = 4;
  return bake(panelW, panelH, (x, y) => {
    const edge = Math.min(x, y, panelW - 1 - x, panelH - 1 - y);
    if (edge < B) {
      if (edge === 0) return WOOD_DARK;
      const grain = hash2(x, y, 3) > 0.85 ? shade(WOOD_MID, -0.2) : null;
      if (grain) return grain;
      return x - y < panelW - panelH ? WOOD_LIGHT : WOOD_MID;
    }
    const inHeader = y < B + headerH;
    const inGutter = x < B + gutterW;
    if (inHeader && inGutter) {
      const cw = gutterW;
      const ch = headerH;
      const dx = x - (B + cw / 2);
      const dy = y - (B + ch / 2);
      return Math.abs(dx) / (cw / 2) + Math.abs(dy) / (ch / 2) < 0.85 ? GOLD : PAPER_HEADER;
    }
    if (inHeader || inGutter) return PAPER_HEADER;
    return PAPER_GRID;
  });
}
const frameCache = new Map<number, Sprite>();

/** a chiselled stone block: lit top/left edge, shadowed bottom/right, a little flecked texture */
function bakeFillTile(size: number): Sprite {
  const hi = shade(CHISEL_BASE, 0.4);
  const lo = shade(CHISEL_BASE, -0.4);
  return bake(size, size, (x, y) => {
    if (x === 0 || y === 0) return hi;
    if (x === size - 1 || y === size - 1) return lo;
    return hash2(x, y, 11) > 0.88 ? shade(CHISEL_BASE, 0.14) : CHISEL_BASE;
  });
}
/** the kid's own ✕ note — a dashed scratch, not a solid cross, so it reads as a hand mark */
function bakeMarkTile(size: number): Sprite {
  return bake(size, size, (x, y) => {
    if (x < 2 || y < 2 || x > size - 3 || y > size - 3) return null;
    const onA = Math.abs(x - y) <= 1;
    const onB = Math.abs(size - 1 - x - y) <= 1;
    if (!onA && !onB) return null;
    return Math.floor((x + y) / 2) % 2 === 0 ? MARK_RED : null;
  });
}
/** a wrong chisel — a bold flashing ✕ (two colour frames swapped in draw()) */
function bakeMissTile(size: number, color: string): Sprite {
  return bake(size, size, (x, y) => {
    if (x < 1 || y < 1 || x > size - 2 || y > size - 2) return null;
    const onA = Math.abs(x - y) <= 1;
    const onB = Math.abs(size - 1 - x - y) <= 1;
    return onA || onB ? color : null;
  });
}
interface TileSet {
  fill: Sprite;
  mark: Sprite;
  missA: Sprite;
  missB: Sprite;
}
const tileCache = new Map<number, TileSet>();
function tilesFor(size: number): TileSet {
  let t = tileCache.get(size);
  if (!t) {
    t = { fill: bakeFillTile(size), mark: bakeMarkTile(size), missA: bakeMissTile(size, PAL.red), missB: bakeMissTile(size, PAL.orange) };
    tileCache.set(size, t);
  }
  return t;
}
/** a few fixed, twinkling background stars (positions are deterministic, not per-frame random) */
const STARS = Array.from({ length: 26 }, (_, i) => ({
  x: Math.floor(hash2(i, 1, 51) * W),
  y: Math.floor(hash2(i, 2, 51) * 150) + 6,
  ph: Math.floor(hash2(i, 3, 51) * 90),
}));

// cell states
const EMPTY = 0;
const FILLED = 1;
const MARK = 2; // player's own ✕ note — freely toggled
const MISS = 3; // a wrong chisel — locked in, already cost its time

interface Toast {
  x: number;
  y: number;
  t: number;
  s: string;
  c: string;
}

function create(seed: number): GameInstance {
  let puzzleIndex = 0;
  let frame = 0;

  // per-puzzle state, (re)built by loadPuzzle()
  let target: number[][] = [];
  let w = 0;
  let h = 0;
  let grid: number[][] = [];
  let rowClue: number[][] = [];
  let colClue: number[][] = [];
  let rowDone: boolean[] = [];
  let colDone: boolean[] = [];
  let totalFilled = 0;
  let filledCount = 0;
  let timeLeft = 0;
  let cell = 14;
  let gutterW = 0;
  let headerH = 0;
  let gridX = 0;
  let gridY = 0;
  let cx = 0;
  let cy = 0;
  let frameSprite: Sprite | null = null;
  let tiles: TileSet = tilesFor(14);

  let phase: "play" | "reveal" | "done" = "play";
  let revealT = 0;
  let shake = 0;
  let sentOver = false;
  let sentWin = false;
  const toasts: Toast[] = [];
  const sparkles: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];

  const dasX = { dir: 0, t: 0 };
  const dasY = { dir: 0, t: 0 };

  function recomputeLine(y: number) {
    rowDone[y] = sameClue(cluesOf(grid[y].map((v) => (v === FILLED ? 1 : 0))), rowClue[y]);
  }
  function recomputeCol(x: number) {
    const col = grid.map((row) => (row[x] === FILLED ? 1 : 0));
    colDone[x] = sameClue(cluesOf(col), colClue[x]);
  }
  function recomputeAll() {
    for (let y = 0; y < h; y++) recomputeLine(y);
    for (let x = 0; x < w; x++) recomputeCol(x);
  }

  function loadPuzzle(io: IO | null) {
    const p = PICTURE_PUZZLES[puzzleIndex];
    target = bitsOf(p.rows);
    h = target.length;
    w = target[0].length;
    grid = Array.from({ length: h }, () => new Array<number>(w).fill(EMPTY));
    rowClue = target.map((r) => cluesOf(r));
    colClue = [];
    for (let x = 0; x < w; x++) colClue.push(cluesOf(target.map((r) => r[x])));
    rowDone = new Array(h).fill(false);
    colDone = new Array(w).fill(false);
    recomputeAll();
    totalFilled = target.reduce((s, r) => s + r.reduce((a, b) => a + b, 0), 0);
    filledCount = 0;
    timeLeft = TIME_PER_SIZE[Math.max(w, h)] ?? 60 * 240;
    const sizes = slotSize(Math.max(w, h));
    cell = sizes.cell;
    const maxRowGroups = Math.max(1, ...rowClue.map((c) => c.length));
    const maxColGroups = Math.max(1, ...colClue.map((c) => c.length));
    gutterW = maxRowGroups * sizes.rowSlot + 6;
    headerH = maxColGroups * sizes.colSlot + 6;
    const totalW = gutterW + w * cell;
    gridX = Math.floor((W - totalW) / 2) + gutterW;
    gridY = 36 + headerH; // leaves room for the HUD line + a 2-line hint above the clue header
    cx = 0;
    cy = 0;
    phase = "play";
    revealT = 0;
    tiles = tilesFor(cell);
    let fr = frameCache.get(puzzleIndex);
    if (!fr) {
      fr = bakeFrame(gutterW, headerH, w * cell, h * cell);
      frameCache.set(puzzleIndex, fr);
    }
    frameSprite = fr;
    if (io) io.sfx.play("blip");
  }

  function spark(x: number, y: number, c: string, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      sparkles.push({ x, y, vx: Math.cos(a) * 1.4, vy: Math.sin(a) * 1.4 - 0.4, life: 22, c });
    }
  }

  function tryFill(x: number, y: number, io: IO) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const s = grid[y][x];
    if (s === FILLED || s === MISS) return;
    const px = gridX + x * cell + cell / 2;
    const py = gridY + y * cell + cell / 2;
    if (target[y][x]) {
      grid[y][x] = FILLED;
      filledCount++;
      const wasRowDone = rowDone[y];
      const wasColDone = colDone[x];
      recomputeLine(y);
      recomputeCol(x);
      io.sfx.play("pop");
      io.sfx.tone(520 + Math.min(10, filledCount) * 18, 70, "square", 0.25);
      io.score(5);
      spark(px, py, "#9fc4ff", 6);
      spark(px, py, PAL.white, 2);
      if ((!wasRowDone && rowDone[y]) || (!wasColDone && colDone[x])) {
        io.sfx.play("coin");
        if (!wasRowDone && rowDone[y]) spark(gridX, py, GOLD, 10);
        if (!wasColDone && colDone[x]) spark(px, gridY, GOLD, 10);
      }
      if (filledCount >= totalFilled) {
        io.sfx.play("win");
        io.sfx.play("cheer");
        io.score(Math.max(0, Math.floor(timeLeft / 60)) * 10);
        phase = "reveal";
        revealT = 190;
        spark(gridX + (w * cell) / 2, gridY + (h * cell) / 2, PAL.yellow, 30);
      }
    } else {
      grid[y][x] = MISS;
      timeLeft = Math.max(0, timeLeft - MISTAKE_PENALTY);
      io.sfx.play("hit");
      io.sfx.noise?.(140, 0.35, 700, 160);
      shake = 14;
      toasts.push({ x: px, y: py - 10, t: 45, s: "-10s", c: PAL.red });
    }
  }
  function tryMark(x: number, y: number, io: IO) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const s = grid[y][x];
    if (s === FILLED || s === MISS) return;
    const marking = s !== MARK;
    grid[y][x] = marking ? MARK : EMPTY;
    io.sfx.tone(marking ? 300 : 220, 40, "triangle", 0.15);
  }

  loadPuzzle(null);

  return {
    update(io) {
      frame++;
      if (shake > 0) shake--;
      for (const t of toasts) t.t--;
      for (let i = toasts.length - 1; i >= 0; i--) if (toasts[i].t <= 0) toasts.splice(i, 1);
      for (const s of sparkles) {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.08;
        s.life--;
      }
      for (let i = sparkles.length - 1; i >= 0; i--) if (sparkles[i].life <= 0) sparkles.splice(i, 1);

      if (phase === "done") return;

      if (phase === "reveal") {
        revealT--;
        if (revealT <= 0) {
          if (puzzleIndex >= PICTURE_PUZZLES.length - 1) {
            phase = "done";
            if (!sentWin) {
              sentWin = true;
              io.win();
            }
          } else {
            puzzleIndex++;
            loadPuzzle(io);
          }
        }
        return;
      }

      // ── playing: move the cursor, chisel with A, mark with B ──
      const inp = io.input;
      const prevX = cx;
      const prevY = cy;
      const dx = inp.held.right ? 1 : inp.held.left ? -1 : 0;
      const dy = inp.held.down ? 1 : inp.held.up ? -1 : 0;
      const moveX = (d: number) => (cx = clamp(cx + d, 0, w - 1));
      const moveY = (d: number) => (cy = clamp(cy + d, 0, h - 1));
      if (dx !== dasX.dir) {
        dasX.dir = dx;
        dasX.t = 0;
        if (dx) moveX(dx);
      } else if (dx) {
        dasX.t++;
        if (dasX.t >= 14 && (dasX.t - 14) % 6 === 0) moveX(dx);
      }
      if (dy !== dasY.dir) {
        dasY.dir = dy;
        dasY.t = 0;
        if (dy) moveY(dy);
      } else if (dy) {
        dasY.t++;
        if (dasY.t >= 14 && (dasY.t - 14) % 6 === 0) moveY(dy);
      }

      if (inp.held.a) tryFill(cx, cy, io);
      if (inp.pressed.b) tryMark(cx, cy, io);
      else if (inp.held.b && (cx !== prevX || cy !== prevY)) tryMark(cx, cy, io);

      if (inp.tap) {
        const gx = Math.floor((inp.tap.x - gridX) / cell);
        const gy = Math.floor((inp.tap.y - gridY) / cell);
        if (gx >= 0 && gx < w && gy >= 0 && gy < h) {
          cx = gx;
          cy = gy;
          if (inp.held.b) tryMark(gx, gy, io);
          else tryFill(gx, gy, io);
        }
      }

      if (phase === "play") {
        timeLeft--;
        if (timeLeft <= 0) {
          timeLeft = 0;
          if (!sentOver) {
            sentOver = true;
            io.sfx.play("die");
            io.gameOver();
          }
        } else if (timeLeft <= 10 * 60 && timeLeft % 60 === 0) {
          io.sfx.tone(880, 90, "square", 0.3);
        }
      }
    },

    draw(g: Gfx) {
      const puzzle = PICTURE_PUZZLES[puzzleIndex];
      const sx = shake > 0 && frame % 2 ? (shake % 4 < 2 ? -1 : 1) : 0;

      // ── night backdrop: dithered diagonal bands + a scatter of twinkling stars ──
      g.clear(PAL.night);
      for (let i = -H; i < W + H; i += 22) {
        const dim = bayer(i, 0) > 0.5;
        g.line(i, 0, i + H, H, dim ? "#201a3c" : "#2a2350");
      }
      for (const s of STARS) {
        const tw = (frame + s.ph) % 90;
        if (tw < 60) g.rect(s.x, s.y, 1, 1, tw < 20 || tw > 45 ? "#6a63a8" : PAL.white);
      }

      if (phase === "reveal") {
        // big reveal: the whole picture in colour, in the same carved-wood frame, with its name
        const scale = Math.min(10, Math.floor(140 / Math.max(w, h)));
        const pw = w * scale;
        const ph = h * scale;
        const ox = Math.floor((W - pw) / 2);
        const oy = 54;
        g.rect(ox - 8, oy - 8, pw + 16, ph + 16, WOOD_DARK);
        g.rect(ox - 5, oy - 5, pw + 10, ph + 10, WOOD_LIGHT);
        g.rect(ox - 2, oy - 2, pw + 4, ph + 4, PAPER_GRID);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++)
            if (target[y][x]) g.rect(ox + x * scale, oy + y * scale, scale, scale, puzzle.color(x, y));
        // a slow diagonal shine sweeping across the revealed picture
        const shineX = ox - pw + ((frame * 2) % (pw * 2));
        g.alpha(0.18);
        for (let d = 0; d < 10; d++) g.line(shineX + d, oy, shineX + d + ph, oy + ph, PAL.white);
        g.alpha(1);
        for (const s of sparkles) g.rect(s.x - 1, s.y - 1, 2, 2, s.life % 6 < 3 ? PAL.white : s.c);
        const article = /^[AEIOU]/.test(puzzle.name) ? "AN" : "A";
        const bob = Math.floor(frame / 6) % 2;
        g.text(`${article} ${puzzle.name}!`, W / 2, 24 + bob, GOLD, { align: "center", size: 2 });
        g.text(`PICTURE ${puzzleIndex + 1} OF ${PICTURE_PUZZLES.length} SOLVED`, W / 2, oy + ph + 16, PAL.sky, { align: "center" });
        return;
      }

      // ── playing: the carved wooden frame holding the clue parchment + grid, baked once ──
      const panelX = gridX - gutterW - 4;
      const panelY = gridY - headerH - 4;
      const panelH = headerH + h * cell + 8;
      if (frameSprite) g.sprite(frameSprite, panelX + sx, panelY);

      // cursor highlight band across its row and column
      g.rect(panelX + sx, gridY + cy * cell, gutterW + w * cell + 8, cell, "rgba(255,225,77,0.3)");
      g.rect(gridX + cx * cell + sx, panelY, cell, panelH, "rgba(255,225,77,0.3)");

      // grid cells: a chiselled stone block, a dashed ✕ note, or a flashing wrong-chisel ✕
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const px = gridX + x * cell + sx;
          const py = gridY + y * cell;
          const s = grid[y][x];
          if (s === FILLED) g.sprite(tiles.fill, px, py);
          else if (s === MARK) g.sprite(tiles.mark, px, py);
          else if (s === MISS) g.sprite(frame % 10 < 6 ? tiles.missA : tiles.missB, px, py);
        }
      }
      // gridlines (thicker every 5 cells)
      for (let x = 0; x <= w; x++) g.rect(gridX + x * cell + sx, gridY, x % 5 === 0 ? 2 : 1, h * cell, x % 5 === 0 ? WOOD_MID : GRID_LINE);
      for (let y = 0; y <= h; y++) g.rect(gridX + sx, gridY + y * cell, w * cell, y % 5 === 0 ? 2 : 1, y % 5 === 0 ? WOOD_MID : GRID_LINE);
      // cursor box — a thin gold ring inside a dark outline
      g.box(gridX + cx * cell + sx, gridY + cy * cell, cell, cell, WOOD_DARK);
      g.box(gridX + cx * cell + sx + 1, gridY + cy * cell + 1, cell - 2, cell - 2, GOLD);

      // row clues (right-aligned just left of the grid)
      for (let y = 0; y < h; y++) {
        const clue = rowClue[y].length ? rowClue[y] : [0];
        const ink = rowDone[y] ? INK_DONE : INK;
        const cyText = gridY + y * cell + cell / 2 - 4;
        for (let i = 0; i < clue.length; i++) {
          g.text(String(clue[clue.length - 1 - i]), gridX - 6 - i * slotSize(Math.max(w, h)).rowSlot + sx, cyText, ink, { align: "right" });
        }
      }
      // column clues (stacked above the grid, bottom-aligned)
      for (let x = 0; x < w; x++) {
        const clue = colClue[x].length ? colClue[x] : [0];
        const ink = colDone[x] ? INK_DONE : INK;
        const cxText = gridX + x * cell + cell / 2 + sx;
        for (let i = 0; i < clue.length; i++) {
          const row = clue.length - 1 - i;
          g.text(String(clue[row]), cxText, gridY - 10 - i * slotSize(Math.max(w, h)).colSlot, ink, { align: "center" });
        }
      }

      // HUD — small framed badges either end of the wood panel's top edge
      g.rect(2, 2, 76, 11, WOOD_DARK);
      g.rect(3, 3, 74, 9, PAPER_HEADER);
      g.text(`PIC ${puzzleIndex + 1}/${PICTURE_PUZZLES.length}`, 6, 4, INK);
      const secs = Math.ceil(timeLeft / 60);
      const mm = Math.floor(secs / 60);
      const ss = secs % 60;
      const low = secs <= 20;
      g.rect(W - 46, 2, 44, 11, WOOD_DARK);
      g.rect(W - 45, 3, 42, 9, PAPER_HEADER);
      g.text(`${mm}:${ss < 10 ? "0" : ""}${ss}`, W - 6, 4, low && frame % 20 < 10 ? PAL.red : INK, { align: "right" });
      if (puzzle.hint && puzzleIndex <= 1) {
        g.text(puzzle.hint[0], W / 2, 15, PAL.lime, { align: "center" });
        g.text(puzzle.hint[1], W / 2, 24, PAL.lime, { align: "center" });
      }

      for (const t of toasts) g.text(t.s, t.x, t.y - (45 - t.t) * 0.3, t.c, { align: "center" });
      for (const s of sparkles) g.rect(s.x - 1, s.y - 1, 2, 2, s.life % 6 < 3 ? PAL.white : s.c);
    },
  };
}

export const pictureCross: RetroGameDef = {
  id: "picture-cross",
  title: "Picture Cross",
  blurb: "Chisel the right squares to reveal a hidden picture before the clock runs out!",
  genre: "Puzzle",
  emoji: "🖼️",
  color: "#ffd36e",
  controls: "D-pad move · hold A + move to fill squares · hold B + move to mark ✕ · tap to fill (hold B to mark)",
  pad: { dpad: "4", a: "Fill", b: "Mark ✕", tap: true },
  create,
};
