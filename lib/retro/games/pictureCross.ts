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
import { bake, hash2, shade, bayer, gradientColor, outlined, bakeShadow } from "../art";

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

// ───────────────────────── dig-site cabinet look ─────────────────────────
// The puzzle tablet sits on a sunbaked excavation site: a dark timber-and-stone frame, a sun
// badge where the row/column clue gutters meet, aged ruler parchment behind the clue numbers,
// speckled sandstone for the grid, a dark carved block (with a chipped corner) for a correct
// cell, and a scratched chalk "X" for a cell the kid has marked as empty. Everything below is
// baked once (lazily, the first time a given size/puzzle/pose is needed) and reused every frame.
const WOOD_DARK = "#5a3418";
const WOOD_MID = "#8c5a2c";
const WOOD_LIGHT = "#c98f4a";
const PAPER_HEADER = "#e8caa0";
const PAPER_GRID = "#e4c788";
const GOLD = "#ffd76a";
const GRID_LINE = "#b68a52";
const INK = "#3a2210";
const INK_DONE = "#a98f66";
const CHALK_LIGHT = "#fffdf5";
const CHALK_SHADOW = "#8c7f61";
/** a correct cell is chiselled into this one neutral dark basalt while playing — the picture's
 * real colours stay hidden (so they can't be used to cheat) until the reveal screen */
const CHISEL_BASE = "#352c21";

/** the timber-and-stone frame + parchment background for one puzzle's clue gutters + grid —
 *  baked once per puzzle (geometry only depends on its clue shape) and blitted as a single sprite. */
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
      // a carved sun badge: a disc with radiating rays, where the clue gutters meet
      const cw = gutterW;
      const ch = headerH;
      const dx = x - (B + cw / 2);
      const dy = y - (B + ch / 2);
      const r = Math.min(cw, ch) * 0.4;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) return GOLD;
      const ang = Math.atan2(dy, dx);
      if (d2 < r * r * 2.6 && Math.abs(Math.cos(ang * 4)) > 0.86) return GOLD;
      return PAPER_HEADER;
    }
    if (inHeader || inGutter) {
      // ruler/scroll parchment: a thin binding rule near each edge + a little paper grain
      const eh = inHeader ? Math.min(y - B, B + headerH - 1 - y) : 99;
      const eg = inGutter ? Math.min(x - B, B + gutterW - 1 - x) : 99;
      if (eh === 1 || eg === 1) return shade(PAPER_HEADER, -0.2);
      return hash2(x, y, 7) > 0.9 ? shade(PAPER_HEADER, -0.1) : PAPER_HEADER;
    }
    // sandstone grid: speckled grain, like sunbaked carved stone
    const n = hash2(x, y, 13);
    return n > 0.94 ? shade(PAPER_GRID, -0.22) : n > 0.86 ? shade(PAPER_GRID, 0.14) : PAPER_GRID;
  });
}
const frameCache = new Map<number, Sprite>();

/** a chiselled stone block: lit top/left edge, shadowed bottom/right, fleck texture and a
 *  couple of chipped corners (transparent, so the sandstone shows through underneath) */
function bakeFillTile(size: number): Sprite {
  const hi = shade(CHISEL_BASE, 0.38);
  const lo = shade(CHISEL_BASE, -0.38);
  return bake(size, size, (x, y) => {
    const corner = (x < 2 || y < 2 || x > size - 3 || y > size - 3) && hash2(x, y, 21) > 0.93;
    if (corner) return null;
    if (x === 0 || y === 0) return hi;
    if (x === size - 1 || y === size - 1) return lo;
    const n = hash2(x, y, 11);
    return n > 0.9 ? shade(CHISEL_BASE, 0.2) : n < 0.1 ? shade(CHISEL_BASE, -0.2) : CHISEL_BASE;
  });
}
/** the kid's own ✕ note — a dashed chalk scratch, not a solid cross, so it reads as a hand mark */
function bakeMarkTile(size: number): Sprite {
  return bake(size, size, (x, y) => {
    if (x < 2 || y < 2 || x > size - 3 || y > size - 3) return null;
    const onA = Math.abs(x - y) <= 1;
    const onB = Math.abs(size - 1 - x - y) <= 1;
    if (!onA && !onB) return null;
    // a slightly uneven, hand-scratched stroke: mostly solid so it reads instantly as an ✕,
    // with the odd gap and a two-tone chalk/shadow mix so it still looks hand-drawn, not printed
    if (Math.floor((x + y) / 3) % 5 === 0 && Math.abs(x - y) === 1) return null;
    return hash2(x, y, 31) > 0.3 ? CHALK_LIGHT : CHALK_SHADOW;
  });
}
/** a wrong chisel — a bold flashing cracked ✕ (two colour frames swapped in draw()) */
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

// ───────────────────────── excavation-site backdrop ─────────────────────────
// A full-screen desert sky baked once: a warm dithered gradient, a sun, two rows of distant
// pyramids catching the light, a palm by the dig camp and an explorer's tent, and two
// overlapping dune ridges in the foreground. Static — the puzzle frame sits on top of it, so
// it only shows at the edges, but it reads as one continuous sunny dig site behind the tablet.
const SKY_TOP = "#bfe7f8";
const SKY_HORIZON = "#ffdca0";
const SUN_COLOR = "#ffeeaa";
const PYRAMID_LIT = "#d9a85f";
const PYRAMID_SHADE = "#a9773f";
const PALM_TRUNK = "#6b4a28";
const PALM_FROND = "#45542c";
const TENT_A = "#b2492f";
const TENT_B = "#8a3420";
const DUNE_FAR = "#e3c285";
const DUNE_NEAR = "#c89a5a";

// the near pyramid is bigger and sits right where the tablet's left edge typically falls, so
// part of it reads as behind the board for depth; the other two stay further back
const PEAKS: readonly [number, number, number][] = [
  [26, 64, 52],
  [92, 58, 42],
  [146, 46, 26],
];
/** the tallest peak covering x, and its own height there — so the caller can tell which
 *  pyramid it's drawing (for the lit/shaded face split) even where two peaks overlap */
function pyramidAt(x: number): { h: number; px: number } {
  let best = { h: 0, px: 0 };
  for (const [px, pw, ph] of PEAKS) {
    const h = ph * Math.max(0, 1 - Math.abs(x - px) / (pw / 2));
    if (h > best.h) best = { h, px };
  }
  return best;
}
const duneTop1 = (x: number) => 160 + Math.sin(x * 0.05) * 7 + Math.sin(x * 0.12 + 1.3) * 4;
const duneTop2 = (x: number) => 184 + Math.sin(x * 0.07 + 2.1) * 6 + Math.sin(x * 0.19) * 3;

function bakeDesert(): Sprite {
  return bake(W, H, (x, y) => {
    const d2 = duneTop2(x);
    if (y >= d2) {
      const n = hash2(x, y, 41);
      return n > 0.92 ? shade(DUNE_NEAR, -0.16) : n < 0.08 ? shade(DUNE_NEAR, 0.12) : DUNE_NEAR;
    }
    const d1 = duneTop1(x);
    if (y >= d1) {
      const n = hash2(x, y, 42);
      return n > 0.93 ? shade(DUNE_FAR, -0.12) : DUNE_FAR;
    }
    // the camp's palm and the explorer's tent sit nearer than the pyramids, so they're checked
    // first and win wherever they overlap one
    if (x >= 10 && x <= 13 && y >= d1 - 28 && y < d1) return PALM_TRUNK;
    const fdx = x - 11;
    const fdy = y - (d1 - 30);
    if (y < d1 - 22 && fdx * fdx * 2 + fdy * fdy < 60) return PALM_FROND;
    const tx = x - 238;
    const ty = d1 - y;
    if (ty >= 0 && ty <= 20 && Math.abs(tx) <= 20 - ty) return Math.floor(tx / 4) % 2 === 0 ? TENT_A : TENT_B;
    // distant pyramids: a lit face toward the sun (upper right), a shaded face away from it,
    // and faint horizontal courses like stacked stone blocks
    const peak = pyramidAt(x);
    if (peak.h > 2 && y >= d1 - peak.h) {
      const top = d1 - peak.h;
      const face = x >= peak.px ? PYRAMID_LIT : PYRAMID_SHADE;
      return Math.floor((y - top) / 3) % 2 === 0 ? face : shade(face, -0.1);
    }
    // sky gradient + sun disc with a soft dithered halo
    const sdx = x - 206;
    const sdy = y - 30;
    const sd2 = sdx * sdx + sdy * sdy;
    if (sd2 < 110) return SUN_COLOR;
    if (sd2 < 200 && hash2(x, y, 5) > bayer(x, y)) return shade(SUN_COLOR, -0.05);
    return gradientColor([SKY_TOP, SKY_HORIZON], Math.max(0, Math.min(1, y / 165)), x, y);
  });
}
let DESERT: Sprite | null = null;
const desert = () => (DESERT ??= bakeDesert());

// ───────────────────────── explorer mascot ─────────────────────────
// A pith-helmeted dig companion stood in the margin beside the tablet: idle bob while the kid
// chisels, arms thrown up to cheer when a line completes, arms crossed over its face to wince
// at a wrong chisel.
type MascotPose = "idle" | "cheer" | "wince";
function bakeMascot(pose: MascotPose): Sprite {
  const w = 22;
  const h = 32;
  const cx = 11;
  const FUR = "#caa06a";
  const FUR_DK = shade(FUR, -0.28);
  const FUR_LT = shade(FUR, 0.18);
  const SHIRT = "#8c9a5a";
  const SHIRT_DK = shade(SHIRT, -0.26);
  const SHIRT_LT = shade(SHIRT, 0.16);
  const POCKET = shade(SHIRT, 0.3);
  const HELM = "#cdbd82";
  const HELM_DK = shade(HELM, -0.3);
  const HELM_LT = shade(HELM, 0.22);
  const EYE = "#2a1c10";
  const GLASS_RING = "#d8ecec";
  const GLASS_HANDLE = "#6b4a28";
  return bake(w, h, (x, y) => {
    // arms crossed over the face (wince) take priority over the head so they read clearly
    if (pose === "wince" && y >= 17 && y <= 20 && x >= 6 && x <= 16) return EYE;
    // the magnifying glass at its hip — a small ring on a handle, worn in every pose
    const gdx = x - 16;
    const gdy = y - 29;
    const gd2 = gdx * gdx + gdy * gdy;
    if (gd2 <= 5 && gd2 >= 2) return GLASS_RING;
    if ((x === 18 && y === 31) || (x === 19 && y === 31)) return GLASS_HANDLE;
    // helmet dome + brim
    const hdx = (x - cx) / 8;
    const hdy = (y - 7) / 6;
    if (y <= 11 && hdx * hdx + hdy * hdy < 1) return hdy < -0.25 ? HELM_LT : HELM;
    if (y === 12 && x >= 2 && x <= 19) return HELM_DK;
    if (y === 11 && (x === 2 || x === 19)) return HELM_DK;
    // arms (pose-dependent) — checked before the head/body so a raised cheer arm reads past them
    if (pose === "cheer") {
      // both arms thrown straight up well past the helmet, for a clear "hooray"
      const dy = 26 - y;
      if (dy >= 0 && dy <= 24) {
        const idx = Math.floor(dy / 2);
        const armX = Math.max(0, 4 - idx);
        const hand = y <= 5;
        if (x === armX || x === armX + 1) return hand ? FUR : SHIRT_DK;
        const armXr = w - 1 - armX;
        if (x === armXr || x === armXr - 1) return hand ? FUR : SHIRT_DK;
      }
    } else if (pose === "idle") {
      if (y >= 25 && y <= 30 && (x === 2 || x === 3)) return SHIRT_DK;
      if (y >= 25 && y <= 30 && (x === 18 || x === 19)) return SHIRT_DK;
      if (y === 31 && (x === 2 || x === 3)) return FUR;
      if (y === 31 && (x === 18 || x === 19)) return FUR;
    }
    // head
    const fx = (x - cx) / 6.3;
    const fy = (y - 19.5) / 6.6;
    if (y >= 13 && y <= 26 && fx * fx + fy * fy < 1) {
      if (y >= 18 && y <= 19 && (x === 8 || x === 9)) return EYE;
      if (y >= 18 && y <= 19 && (x === 13 || x === 14)) return EYE;
      if (y >= 22 && y <= 23 && x === cx) return FUR_DK;
      if (y === 24 && x >= 9 && x <= 13) return FUR_DK;
      return x < cx ? FUR : FUR_LT;
    }
    // khaki shirt — a collar notch, a chest pocket, and a soft rounded body
    if (y === 26 && x >= 9 && x <= 13) return SHIRT_DK;
    const bx = (x - cx) / 8.5;
    const by = (y - 29.5) / 5.5;
    if (y >= 25 && y <= 31 && bx * bx + by * by < 1) {
      if (y >= 27 && y <= 29 && x >= 8 && x <= 10) return POCKET;
      return x < cx ? SHIRT : SHIRT_LT;
    }
    return null;
  });
}
const mascotCache = new Map<MascotPose, Sprite>();
function mascotSprite(pose: MascotPose): Sprite {
  let s = mascotCache.get(pose);
  if (!s) {
    s = outlined(bakeMascot(pose));
    mascotCache.set(pose, s);
  }
  return s;
}
let MASCOT_SHADOW: Sprite | null = null;
const mascotShadow = () => (MASCOT_SHADOW ??= bakeShadow(20, 6, "#2a1c10"));

// ───────────────────────── hammer-and-chisel cursor ─────────────────────────
function bakeToolRaw(): Sprite {
  const w = 11;
  const h = 12;
  const HANDLE = "#8a5a2c";
  const HANDLE_DK = shade(HANDLE, -0.3);
  const HEAD = PAL.grey;
  const HEAD_LT = shade(HEAD, 0.35);
  const HEAD_DK = shade(HEAD, -0.35);
  return bake(w, h, (x, y) => {
    // a stubby chisel handle, running diagonally down to the tip
    if ((x === y + 2 || x === y + 3) && y >= 4 && y <= 10) return x === y + 2 ? HANDLE : HANDLE_DK;
    // the mallet head, top-right, with a lit top and a shaded underside
    if (x >= 5 && x <= 10 && y >= 0 && y <= 4) {
      if (y === 0) return HEAD_LT;
      if (y === 4 || x === 10) return HEAD_DK;
      return HEAD;
    }
    return null;
  });
}
let TOOL_RAW: Sprite | null = null;
let TOOL: Sprite | null = null;
const tool = () => (TOOL ??= outlined((TOOL_RAW ??= bakeToolRaw())));

// ───────────────────────── sand-timer HUD ─────────────────────────
const GLASS_ROWS = 14;
function bakeHourglass(): Sprite {
  const w = 10;
  const h = GLASS_ROWS;
  const half = (y: number) => {
    if (y === 0 || y === h - 1) return 5;
    if (y <= 5) return 4.2 - (y - 1) * 0.75;
    if (y <= 7) return 1;
    return 1 + (y - 8) * 0.75;
  };
  return bake(w, h, (x, y) => {
    const hw = half(y);
    const d = Math.abs(x - (w - 1) / 2);
    if (y === 0 || y === h - 1) return WOOD_DARK;
    if (d > hw) return null;
    if (d > hw - 1) return WOOD_DARK;
    return null;
  });
}
let GLASS: Sprite | null = null;
const glass = () => (GLASS ??= bakeHourglass());

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
  let timeTotal = 1;
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
  let mascotPose: MascotPose = "idle";
  let mascotT = 0;
  let chiseling = false;
  const toasts: Toast[] = [];
  const sparkles: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];
  const cracks: { x: number; y: number; t: number }[] = [];

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
    timeTotal = timeLeft;
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
      io.sfx.noise?.(40, 0.15, 2200, 1000);
      io.score(5);
      // stone chips flying off the chisel strike
      spark(px, py, shade(CHISEL_BASE, 0.3), 5);
      spark(px, py, PAPER_GRID, 3);
      if ((!wasRowDone && rowDone[y]) || (!wasColDone && colDone[x])) {
        io.sfx.play("coin");
        if (!wasRowDone && rowDone[y]) spark(gridX, py, GOLD, 10);
        if (!wasColDone && colDone[x]) spark(px, gridY, GOLD, 10);
        mascotPose = "cheer";
        mascotT = 50;
      }
      if (filledCount >= totalFilled) {
        io.sfx.play("win");
        io.sfx.play("cheer");
        io.score(Math.max(0, Math.floor(timeLeft / 60)) * 10);
        phase = "reveal";
        revealT = 190;
        mascotPose = "cheer";
        mascotT = 200;
        spark(gridX + (w * cell) / 2, gridY + (h * cell) / 2, PAL.yellow, 30);
      }
    } else {
      grid[y][x] = MISS;
      timeLeft = Math.max(0, timeLeft - MISTAKE_PENALTY);
      io.sfx.play("hit");
      io.sfx.noise?.(140, 0.35, 700, 160);
      shake = 14;
      cracks.push({ x: px, y: py, t: 16 });
      spark(px, py, DUNE_NEAR, 6);
      toasts.push({ x: px, y: py - 10, t: 45, s: "-10s", c: PAL.red });
      mascotPose = "wince";
      mascotT = 30;
    }
  }
  function tryMark(x: number, y: number, io: IO) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const s = grid[y][x];
    if (s === FILLED || s === MISS) return;
    const marking = s !== MARK;
    grid[y][x] = marking ? MARK : EMPTY;
    io.sfx.tone(marking ? 300 : 220, 40, "triangle", 0.15);
    if (marking) io.sfx.noise?.(50, 0.1, 1400, 2600);
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
      for (const c of cracks) c.t--;
      for (let i = cracks.length - 1; i >= 0; i--) if (cracks[i].t <= 0) cracks.splice(i, 1);
      chiseling = io.input.held.a;
      if (mascotT > 0) {
        mascotT--;
        if (mascotT <= 0) mascotPose = "idle";
      }

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

      // ── dig-site backdrop: sunny sky, distant pyramids, a palm, a tent, two dune ridges ──
      g.sprite(desert(), 0, 0);

      // the explorer mascot stands in the margin beside the tablet and reacts to the kid's play
      const drawMascot = () => {
        const marginW = Math.max(0, gridX - gutterW - 4);
        const mascotX = clamp(Math.floor((marginW - 22) / 2), 1, Math.max(1, marginW - 24));
        const mascotBaseY = gridY - headerH - 4 + headerH + h * cell + 8 - 32;
        const bob = mascotPose === "idle" ? (Math.floor(frame / 20) % 2 === 0 ? 0 : -1) : mascotT % 10 < 5 ? -1 : 0;
        g.sprite(mascotShadow(), mascotX, mascotBaseY + 29);
        g.sprite(mascotSprite(mascotPose), mascotX, mascotBaseY + bob);
      };

      if (phase === "reveal") {
        drawMascot();
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
      drawMascot();

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
      // an animated hammer-and-chisel hovers over the cursor: a quick downward tap while
      // chiselling (A held), a slow idle bob otherwise
      const toolBob = chiseling ? (frame % 6 < 3 ? -3 : 1) : Math.floor(frame / 15) % 2 === 0 ? 0 : -1;
      const toolY = Math.max(panelY + 1, gridY + cy * cell - 9 + toolBob);
      g.sprite(tool(), gridX + cx * cell + sx + cell - 7, toolY);

      // cracks: a quick flash of radiating lines where a wrong chisel just struck
      for (const c of cracks) {
        const t = c.t / 16;
        g.alpha(t);
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          g.line(c.x, c.y, c.x + dx * (4 + (1 - t) * 4), c.y + dy * (4 + (1 - t) * 4), PAL.white);
        }
        g.alpha(1);
      }

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
      g.rect(W - 58, 1, 56, 13, WOOD_DARK);
      g.rect(W - 57, 2, 54, 11, PAPER_HEADER);
      // the sand timer: an hourglass with sand draining from the top chamber to the bottom
      const gx = W - 55;
      const gy = 1;
      g.sprite(glass(), gx, gy);
      const frac = clamp(timeLeft / timeTotal, 0, 1);
      const topH = Math.round(frac * 5);
      const botH = 5 - topH;
      if (topH > 0) g.rect(gx + 2, gy + 6 - topH, 6, topH, DUNE_NEAR);
      if (botH > 0) g.rect(gx + 2, gy + 13 - botH, 6, botH, DUNE_NEAR);
      if (phase === "play" && timeLeft > 0 && frame % 4 < 2) g.rect(gx + 4, gy + 6 + (frame % 2), 1, 1, DUNE_NEAR);
      g.text(`${mm}:${ss < 10 ? "0" : ""}${ss}`, W - 6, 4, low && frame % 20 < 10 ? PAL.red : INK, { align: "right" });
      if (puzzle.hint && puzzleIndex <= 1) {
        // a parchment banner below the PIC/timer badges (the sky band there is always open,
        // whatever the puzzle size) so the tip reads over the dig site instead of floating on it
        g.rect(16, 12, W - 32, 20, WOOD_DARK);
        g.rect(17, 13, W - 34, 18, PAPER_HEADER);
        g.text(puzzle.hint[0], W / 2, 14, INK, { align: "center" });
        g.text(puzzle.hint[1], W / 2, 22, INK, { align: "center" });
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
