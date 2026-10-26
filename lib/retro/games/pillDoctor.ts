// PILL DOCTOR — an original falling-capsule puzzle (in the spirit of the classic virus-busting
// bottle games, no borrowed names or characters). Dr. Cotton the bunny drops two-colour
// capsules into an 8x16 glass bottle seeded with wiggling germs. Slide and spin the capsule to
// line up 4 or more of one colour in a row or column (germs count too) — they pop, loose
// capsule halves tumble down, and bigger cascades score more. Clear every germ to cure the
// stage; let the bottle fill to the neck and it's game over. Ten stages cured wins the cup.
import { H, PAL, W, clamp, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, bayer, drawStrip, mixHex, shade } from "../art";

const COLS = 8;
const ROWS = 16;
const CELL = 12; // big, thumb-friendly cells so germ faces and capsule marks read on a phone
const WX = (W - COLS * CELL) / 2; // 80
const WY = 28; // leaves room above for the top status bar + bottle neck, no overlap
const NECK_TOP = WY - 14;
const NECK_W = CELL * 3;
const GERM_TOP = ROWS - 10; // germs only seed in the bottom 10 rows — the neck stays clear
const MAX_STAGE = 10;
const FLASH_FRAMES = 22;
const GRAVITY_TICK = 4; // frames between gravity drop steps while pieces settle
const GERM_SCALE = CELL / 10; // germ sprites are 10x10, scaled 1:1 to fill the (bigger) cell
const DANCER_SCALE = 1.3; // the germ "dancers" inside the shared magnifying lens
const LENS_D = 46; // the magnifying-glass lens diameter in the GERMS LEFT panel
const GLASS_T = 7; // bottle glass thickness
const BUNNY_SCALE = 2.6; // Dr. Cotton portrait scale (14x16 native -> ~36x42 px)

// ── clinic palette (cheerful wallpaper + paper clipboards, with the play area kept dark so the
// bright pills/germs still pop against it) ──
const WALL_A = "#dff2ea"; // mint wallpaper
const WALL_B = "#eef6ff"; // pale sky wallpaper
const WALL_MARK = "#c3e3da"; // faint cross/heart print on the wallpaper
const PAPER = "#f4e9d6"; // clipboard paper
const PAPER_LINE = "#d8c7a4"; // ruled chart lines
const CLIP_METAL = "#aeb4c4"; // clipboard clip
const WOOD = "#8a5a3a"; // clipboard board edge
const GLASS_RIM = "#bfe9ff";
const GLASS_DARK = "#0a1a33"; // tinted glass interior

type Color = 0 | 1 | 2; // 0 red, 1 yellow, 2 blue
type Conn = "L" | "R" | "U" | "D" | null;
const COLOR_HEX: Record<Color, string> = { 0: PAL.red, 1: PAL.yellow, 2: PAL.blue };
const COLOR_NAMES = ["RED", "YELLOW", "BLUE"];

interface Cell {
  kind: "germ" | "pill";
  color: Color;
  conn: Conn;
}
interface Piece {
  px: number;
  py: number;
  ori: 0 | 1 | 2 | 3; // 0: other at +x, 1: other at -y, 2: other at -x, 3: other at +y
  colorA: Color; // at the pivot (px,py)
  colorB: Color; // at the other cell
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}
/** a sparkle-pop burst where a germ was zapped — an expanding ring plus a couple of ★ sparkles */
interface GermPop {
  x: number;
  y: number;
  color: string;
  t: number;
}
/** a floating combo/score callout that drifts up and fades — stacking these during a cascade
 *  reads as a chain of combo text rising out of the bottle */
interface ComboText {
  x: number;
  y: number;
  t: number;
  text: string;
  color: string;
}
// offset of the "other" half relative to the pivot, per orientation
const OFFS: [number, number][] = [
  [1, 0],
  [0, -1],
  [-1, 0],
  [0, 1],
];
// which end owns the connection (gravity only moves a pair from its owner, see applyGravityPass)
const PIVOT_CONN: Conn[] = ["R", "U", "L", "D"];
const OTHER_CONN: Conn[] = ["L", "D", "R", "U"];
const NEIGHBOR: Record<Exclude<Conn, null>, [number, number]> = { R: [1, 0], L: [-1, 0], U: [0, -1], D: [0, 1] };

// ── germ pixel art: one round (red), one blocky (yellow) and one spiky (blue) silhouette so
// colours read even if you can't tell them apart — each is a 10x10 square (fills its cell at
// GERM_SCALE) with bright button eyes and a little mouth so it reads as a face, not a blob; frame
// B is the "blink/munch" half of its idle wiggle loop
const RED_A = ["...kkkk...", "..kkkkkk..", ".kcccccck.", "kcwk..kwck", "kcccccccck", "kcckkkkcck", "kcccccccck", ".kcccccck.", "..kkkkkk..", "...kkkk..."];
const RED_B = ["...kkkk...", "..kkkkkk..", ".kcccccck.", "kcccccccck", "kcccccccck", "kcckkkkcck", "kcccccccck", ".kcccccck.", "..kkkkkk..", "...kkkk..."];
const YEL_A = ["kkkkkkkkkk", "kkkkkkkkkk", "kcccccccck", "kc.kwwk.ck", "kcccccccck", "kcc.cc.cck", "kccckkccck", "kcccccccck", "kkkkkkkkkk", "kkkkkkkkkk"];
const YEL_B = ["kkkkkkkkkk", "kkkkkkkkkk", "kcccccccck", "kc.kkkk.ck", "kcccccccck", "kcc.cc.cck", "kccckkccck", "kcccccccck", "kkkkkkkkkk", "kkkkkkkkkk"];
const BLU_A = ["..k....k..", "k.kk..kk.k", ".kcccccck.", "kcwk..kwck", "kcccccccck", "kcckkkkcck", "kcccccccck", ".kcccccck.", "..kkkkkk..", "...kkkk..."];
const BLU_B = ["..k....k..", "kk..kk..kk", ".kcccccck.", "kcwk..kwck", "kcccccccck", "kcccccccck", "kcccccccck", ".kcccccck.", "..kkkkkk..", "...kkkk..."];
const GERM_A = [RED_A, YEL_A, BLU_A];
const GERM_B = [RED_B, YEL_B, BLU_B];
const germPal = (c: string) => ({ k: PAL.black, c, w: PAL.white });
const GERM_FRAMES: Sprite[][] = [0, 1, 2].map((c) => [sprite(GERM_A[c], germPal(COLOR_HEX[c as Color])), sprite(GERM_B[c], germPal(COLOR_HEX[c as Color]))]);

// Dr. Cotton the bunny doctor — a bigger 14x16 portrait: ears, a round face with eyes + a smile,
// a white coat collar and a little grey stethoscope. Rows 0-5 (ears/head) and the nose row (8)
// and rows 10-15 (jaw/coat) are shared; eyes (6,7) and mouth (9) swap per pose.
const DOC_TOP = ["..k........k..", ".kfk......kfk.", ".kpk......kpk.", "..............", ".kffkkkkkkffk.", "kffffffffffffk"];
const DOC_NOSE = "kfffffppfffffk";
const DOC_BOTTOM = [".kffffffffffk.", ".kwwwwwwwwwwk.", ".kwwwwssswwwk.", "kwwwwwsswwwwwk", "kwwwwsssswwwwk", "kkkkkkkkkkkkkk"];
const EYES_OPEN = "kffwwffffwwffk";
const PUPILS = "kffwkffffkwffk";
const EYES_SHUT = "kffffffffffffk";
const MOUTH_SMILE = "kffffkkkkffffk";
const MOUTH_WORRIED = "kfffffkkfffffk";
const MOUTH_OPEN = "kfffkkkkkkfffk";
const doc = (eyes1: string, eyes2: string, mouth: string) => [...DOC_TOP, eyes1, eyes2, DOC_NOSE, mouth, ...DOC_BOTTOM];
const BUNNY_A = doc(EYES_OPEN, PUPILS, MOUTH_SMILE); // idle, eyes open
const BUNNY_B = doc(EYES_SHUT, EYES_SHUT, MOUTH_SMILE); // idle, mid-blink
const BUNNY_WORRIED = doc(EYES_OPEN, PUPILS, MOUTH_WORRIED);
const BUNNY_THROW = doc(EYES_SHUT, EYES_SHUT, MOUTH_OPEN); // eyes shut with the effort of the toss
const BUNNY_PAL = { k: PAL.black, f: PAL.tan, p: PAL.pink, w: PAL.white, s: CLIP_METAL };
const BUNNY: Sprite[] = [sprite(BUNNY_A, BUNNY_PAL), sprite(BUNNY_B, BUNNY_PAL), sprite(BUNNY_WORRIED, BUNNY_PAL), sprite(BUNNY_THROW, BUNNY_PAL)];

// ── lazily-baked art ──
// which corners of a cell-filling piece are ROUNDED (the outer end) vs kept square (the flat
// side where it's cut, because the other half of the capsule sits there)
function pillRadii(flat: Conn | "O", r: number) {
  if (flat === "R") return { tl: r, tr: 0, bl: r, br: 0 };
  if (flat === "L") return { tl: 0, tr: r, bl: 0, br: r };
  if (flat === "D") return { tl: r, tr: r, bl: 0, br: 0 };
  if (flat === "U") return { tl: 0, tr: 0, bl: r, br: r };
  return { tl: r, tr: r, bl: r, br: r }; // "O": an orphan half, rounded all round like a bead
}
function insidePill(x: number, y: number, n: number, inset: number, flat: Conn | "O", r: number): boolean {
  const left = inset;
  const right = n - inset;
  const top = inset;
  const bottom = n - inset;
  if (x < left || x >= right || y < top || y >= bottom) return false;
  const { tl, tr, bl, br } = pillRadii(flat, r);
  if (tl > 0 && x < left + tl && y < top + tl) {
    const dx = x - (left + tl);
    const dy = y - (top + tl);
    if (dx * dx + dy * dy > tl * tl) return false;
  }
  if (tr > 0 && x >= right - tr && y < top + tr) {
    const dx = x - (right - tr);
    const dy = y - (top + tr);
    if (dx * dx + dy * dy > tr * tr) return false;
  }
  if (bl > 0 && x < left + bl && y >= bottom - bl) {
    const dx = x - (left + bl);
    const dy = y - (bottom - bl);
    if (dx * dx + dy * dy > bl * bl) return false;
  }
  if (br > 0 && x >= right - br && y >= bottom - br) {
    const dx = x - (right - br);
    const dy = y - (bottom - br);
    if (dx * dx + dy * dy > br * br) return false;
  }
  return true;
}
/** one capsule piece filling its cell (inset <1px): round on its free end(s), a flat straight cut
 *  on the side(s) where it's joined to its other half, 3-tone diagonal shading and a specular dot
 *  so the pair reads as one fat glossy capsule rather than two separate dots on a stick */
function bakePillPiece(color: Color, flat: Conn | "O"): Sprite {
  const hex = COLOR_HEX[color];
  const light = shade(hex, 0.34);
  const dark = shade(hex, -0.32);
  const n = CELL;
  const inset = 0.6;
  const r = n / 2 - inset;
  return bake(n, n, (px, py) => {
    const x = px + 0.5;
    const y = py + 0.5;
    if (!insidePill(x, y, n, inset, flat, r)) return null;
    if (!insidePill(x, y, n, inset + 1.1, flat, Math.max(0, r - 1.1))) return PAL.black; // outline
    const lv = (n - x - y) / n; // ~1 top-left corner .. ~-1 bottom-right corner
    let fill = lv > 0.22 ? light : lv < -0.22 ? dark : hex;
    const hdx = x - n * 0.32;
    const hdy = y - n * 0.3;
    if (Math.sqrt(hdx * hdx + hdy * hdy) < 1.7) fill = PAL.white; // specular dot
    // small colour-blind-friendly mark near the centre, subtle so it doesn't fight the gloss
    const cdx = x - n / 2;
    const cdy = y - n / 2;
    const cd = Math.sqrt(cdx * cdx + cdy * cdy);
    if (color === 0 && cd < 1.3) fill = PAL.white; // dot
    else if (color === 1 && Math.abs(cdy) < 1 && Math.abs(cdx) < n * 0.22) fill = PAL.white; // stripe
    else if (color === 2 && cd < 2.1 && cd > 1) fill = PAL.white; // ring
    return fill;
  });
}
function buildPillSprites(): Record<Color, Record<"L" | "R" | "U" | "D" | "O", Sprite>> {
  const conns: ("L" | "R" | "U" | "D" | "O")[] = ["L", "R", "U", "D", "O"];
  const out = {} as Record<Color, Record<"L" | "R" | "U" | "D" | "O", Sprite>>;
  for (const c of [0, 1, 2] as Color[]) {
    out[c] = {} as Record<"L" | "R" | "U" | "D" | "O", Sprite>;
    for (const k of conns) out[c][k] = bakePillPiece(c, k);
  }
  return out;
}
/** one 8x8-tiling wallpaper square: a two-tone checker with a small cross print, like a cheerful
 *  clinic wallpaper (only slivers of it show past the bottle + clipboards, but it reads at the
 *  top band and side edges, and scrolls slowly past in draw()) */
function bakeWallTile(): Sprite {
  const ts = 16;
  return bake(ts, ts, (x, y) => {
    const cx = Math.floor(x / 8);
    const cy = Math.floor(y / 8);
    const base = (cx + cy) & 1 ? WALL_A : WALL_B;
    const dx = x - 8;
    const dy = y - 8;
    if ((dx === 0 && Math.abs(dy) <= 2) || (dy === 0 && Math.abs(dx) <= 2)) return WALL_MARK;
    return base;
  });
}
/** a little clinic window (sky pane + cross mullion) tucked into the top wallpaper band */
function bakeWindow(): Sprite {
  const w = 34;
  const h = 20;
  return bake(w, h, (x, y) => {
    if (x < 2 || x >= w - 2 || y < 2 || y >= h - 2) return "#6b7390"; // frame
    const midX = Math.floor(w / 2);
    const midY = Math.floor(h / 2);
    if (x === midX || y === midY) return "#6b7390"; // mullion cross
    const t = (y - 2) / (h - 4);
    return mixHex("#bfe3ff", "#eef8ff", t);
  });
}
/** the tinted-glass gradient that fills the bottle's interior behind the grid contents */
function bakeBottleInner(): Sprite {
  const w = COLS * CELL;
  const h = ROWS * CELL;
  return bake(w, h, (x, y) => {
    const t = y / h;
    let c = mixHex(GLASS_DARK, "#17284a", t * 0.7);
    const diag = x - y * 0.35; // a soft diagonal glass-reflection streak
    if (diag > 16 && diag < 34) c = shade(c, 0.05 + 0.05 * bayer(x, y));
    return c;
  });
}
/** a real glass bottle outline: a lip + straight neck, rounded shoulders easing out to the full
 *  body width, straight glass sides down to a solid base cap — the interior is left transparent
 *  (null) so the tinted backdrop + grid contents show through; only the "glass" itself is painted,
 *  drawn once at (WX - GLASS_T, NECK_TOP) so it frames the well exactly */
function bakeBottleGlass(): Sprite {
  const t = GLASS_T;
  const neckH = 8;
  const shoulderH = WY - NECK_TOP - neckH; // 6
  const bodyW = COLS * CELL;
  const neckOuterW = NECK_W + 2 * t;
  const w = bodyW + 2 * t;
  const totalH = H - NECK_TOP;
  return bake(w, totalH, (px, py) => {
    const x = px + 0.5;
    const y = py + 0.5;
    let outerX0: number;
    let outerX1: number;
    let innerX0 = 0;
    let innerX1 = 0;
    let hasInterior = true;
    let diagonal = false; // true on the shoulder, where the band's x position races between rows
    if (y < 2) {
      const lipW = neckOuterW + 4; // the lip flares a touch wider than the neck
      outerX0 = (w - lipW) / 2;
      outerX1 = outerX0 + lipW;
      innerX0 = (w - NECK_W) / 2;
      innerX1 = innerX0 + NECK_W;
    } else if (y < neckH) {
      outerX0 = (w - neckOuterW) / 2;
      outerX1 = outerX0 + neckOuterW;
      innerX0 = (w - NECK_W) / 2;
      innerX1 = innerX0 + NECK_W;
    } else if (y < neckH + shoulderH) {
      diagonal = true;
      const f = (y - neckH) / shoulderH;
      // plain linear, NOT smoothstep: smoothstep concentrates the width change in the middle
      // rows, and with only ~6 rows to cover the whole shoulder that made the per-row horizontal
      // jump bigger than the glass is thick there, so the band stopped overlapping row-to-row
      // and read as a dashed/broken line instead of a solid curve
      const ease = f;
      const curOuterW = neckOuterW + (w - neckOuterW) * ease;
      const curInnerW = NECK_W + (bodyW - NECK_W) * ease;
      outerX0 = (w - curOuterW) / 2;
      outerX1 = outerX0 + curOuterW;
      innerX0 = (w - curInnerW) / 2;
      innerX1 = innerX0 + curInnerW;
    } else if (y < neckH + shoulderH + ROWS * CELL) {
      outerX0 = 0;
      outerX1 = w;
      innerX0 = t;
      innerX1 = w - t;
    } else {
      outerX0 = 0;
      outerX1 = w;
      hasInterior = false; // the solid base cap
    }
    if (x < outerX0 || x >= outerX1) return null;
    if (hasInterior && x >= innerX0 && x < innerX1) return null; // the well shows through here
    const distOuterEdge = Math.min(x - outerX0, outerX1 - x);
    if (distOuterEdge < 1.8) return "#0d0b1a"; // outline
    if (y < 2) return "#eaffffee"; // the lip, bright all the way across
    // a bright highlight next to the interior — but only off the diagonal shoulder: a thin
    // stripe THERE would shift faster between rows than it is wide and read as a dashed line
    // (same reason the shoulder's own colour band is kept to just outline + solid fill)
    if (!diagonal && hasInterior && Math.min(Math.abs(x - innerX0), Math.abs(x - innerX1)) < 1.4) return "#eafcffcc";
    return PAL.sky;
  });
}
/** a magnifying-glass ring (transparent lens, bright rim, short handle) framing the dancing germs */
function bakeLensRing(d: number): Sprite {
  const w = d + 12;
  const h = d + 18;
  const cx = d / 2 + 2;
  const cy = d / 2 + 2;
  const R = d / 2;
  return bake(w, h, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < R - 2) return null; // lens glass stays clear so the dancers show through
    if (dist < R + 1.6) return GLASS_RIM;
    // the handle hangs mostly straight down with only a slight rightward lean, so it never
    // reaches as far right as the colour/count labels drawn beside the lens
    const hx = x - (cx + R * 0.15);
    const hy = y - (cy + R * 0.85);
    if (hy > 0 && hy < 13 && Math.abs(hx - hy * 0.3) < 2) return WOOD;
    return null;
  });
}
function makeArt() {
  return {
    pill: buildPillSprites(),
    wallTile: bakeWallTile(),
    window: bakeWindow(),
    bottleInner: bakeBottleInner(),
    bottleGlass: bakeBottleGlass(),
    lens: bakeLensRing(LENS_D),
  };
}
let ART: ReturnType<typeof makeArt> | null = null;
const art = () => (ART ??= makeArt());

/** one capsule piece, filling its cell: `flat` is the direction its other half sits in (so that
 *  side is cut flat), or null for a lone orphan half (rendered as an all-round bead) */
function drawPillHalf(g: Gfx, cx: number, cy: number, color: Color, flat: Conn, alpha = 1) {
  g.alpha(alpha);
  g.sprite(art().pill[color][flat ?? "O"], cx - CELL / 2, cy - CELL / 2);
  g.alpha(1);
}

/** Pure matching rule, exported so it can be unit-tested directly: any run of 4+ cells of the
 * same colour in a row or column (germs and capsule halves both count) pops. `null` is empty. */
export function findColorRuns(colors: (Color | null)[][]): Set<string> {
  const rows = colors.length;
  const cols = colors[0]?.length ?? 0;
  const matched = new Set<string>();
  for (let y = 0; y < rows; y++) {
    let x = 0;
    while (x < cols) {
      const c = colors[y][x];
      if (c === null) {
        x++;
        continue;
      }
      let x2 = x + 1;
      while (x2 < cols && colors[y][x2] === c) x2++;
      if (x2 - x >= 4) for (let k = x; k < x2; k++) matched.add(`${k},${y}`);
      x = x2;
    }
  }
  for (let x = 0; x < cols; x++) {
    let y = 0;
    while (y < rows) {
      const c = colors[y][x];
      if (c === null) {
        y++;
        continue;
      }
      let y2 = y + 1;
      while (y2 < rows && colors[y2][x] === c) y2++;
      if (y2 - y >= 4) for (let k = y; k < y2; k++) matched.add(`${x},${k}`);
      y = y2;
    }
  }
  return matched;
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  let grid: (Cell | null)[][] = Array.from({ length: ROWS }, () => new Array<Cell | null>(COLS).fill(null));
  let stage = 1;
  let germsLeft = 0;
  let germsByColor: [number, number, number] = [0, 0, 0];
  let piece: Piece | null = null;
  let nextColors: [Color, Color] = [r.pick([0, 1, 2]) as Color, r.pick([0, 1, 2]) as Color];
  let fallT = 0;
  let lockT = 0;
  let lockMoves = 0;
  let dasDir = 0;
  let dasT = 0;
  let softT = 0;
  let combo = 0;
  let flashCells: Set<string> | null = null;
  let flashT = 0;
  let gravActive = false;
  let gravTickT = 0;
  let over = false;
  let overT = 0;
  let sentOver = false;
  let greyFromRow = ROWS;
  let stageClearT = 0;
  let sentWin = false;
  let started = false;
  let frame = 0;
  let banner = "";
  let bannerT = 0;
  let cheerT = 0; // Dr. Cotton bounces and sparkles for a moment after a pop
  let shakeT = 0; // brief screen shake on a germ zap / combo
  let shakeMag = 0;
  let warned = false; // one "!" chime per close call, not every frame
  const sparks: Spark[] = [];
  const germPops: GermPop[] = [];
  const comboTexts: ComboText[] = [];
  let throwT = 0; // Dr. Cotton's toss pose + flying-capsule animation after a new piece spawns
  let thrownColors: [Color, Color] = [0, 0]; // which capsule colours that toss is carrying
  let bubbleT = 0; // throttle for the ambient fizz/bubble sound
  const germClearT: [number, number, number] = [99, 99, 99]; // frames since each colour hit 0 (big = already settled)
  const germWasCleared: [boolean, boolean, boolean] = [false, false, false];

  function topFilledRow(): number {
    for (let y = 0; y < ROWS; y++) if (grid[y].some((c) => c)) return y;
    return ROWS;
  }

  const gravityFrames = () => Math.max(8, 34 - (stage - 1) * 3);
  const germCountFor = (s: number) => Math.min(4 + (s - 1) * 4, 60);

  function fits(px: number, py: number, ori: 0 | 1 | 2 | 3) {
    const [dx, dy] = OFFS[ori];
    const pts: [number, number][] = [
      [px, py],
      [px + dx, py + dy],
    ];
    for (const [x, y] of pts) {
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
      if (grid[y][x]) return false;
    }
    return true;
  }
  function onFloor() {
    return !!piece && !fits(piece.px, piece.py + 1, piece.ori);
  }
  function touched() {
    if (piece && onFloor() && lockMoves < 15) {
      lockT = 0;
      lockMoves++;
    }
  }
  function tryMove(dx: number, dy: number) {
    if (!piece || !fits(piece.px + dx, piece.py + dy, piece.ori)) return false;
    piece.px += dx;
    piece.py += dy;
    return true;
  }
  function tryRotate(dir: 1 | -1, io: IO) {
    if (!piece) return;
    const newOri = (((piece.ori + dir) % 4) + 4) % 4 as 0 | 1 | 2 | 3;
    const kicks: [number, number][] = [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, 1],
      [-2, 0],
      [2, 0],
    ];
    for (const [kx, ky] of kicks) {
      if (fits(piece.px + kx, piece.py + ky, newOri)) {
        piece.px += kx;
        piece.py += ky;
        piece.ori = newOri;
        io.sfx.tone(520, 0.04, "square", 0.08);
        touched();
        return;
      }
    }
  }
  function ghostY() {
    if (!piece) return 0;
    let y = piece.py;
    while (fits(piece.px, y + 1, piece.ori)) y++;
    return y;
  }

  function wouldMakeRun(x: number, y: number, color: Color): boolean {
    let run = 1;
    let i = x - 1;
    while (i >= 0 && grid[y][i]?.color === color) {
      run++;
      i--;
    }
    i = x + 1;
    while (i < COLS && grid[y][i]?.color === color) {
      run++;
      i++;
    }
    if (run >= 3) return true;
    run = 1;
    i = y - 1;
    while (i >= 0 && grid[i][x]?.color === color) {
      run++;
      i--;
    }
    i = y + 1;
    while (i < ROWS && grid[i][x]?.color === color) {
      run++;
      i++;
    }
    return run >= 3;
  }
  function placeGerms(count: number) {
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < 6000) {
      guard++;
      const y = r.int(GERM_TOP, ROWS - 1);
      const x = r.int(0, COLS - 1);
      if (grid[y][x]) continue;
      const order = ([0, 1, 2] as Color[]).sort(() => r.next() - 0.5);
      let chosen: Color = order[0];
      for (const c of order) {
        if (!wouldMakeRun(x, y, c)) {
          chosen = c;
          break;
        }
      }
      grid[y][x] = { kind: "germ", color: chosen, conn: null };
      germsByColor[chosen]++;
      placed++;
    }
    germsLeft = placed;
  }

  function findMatches(): Set<string> {
    return findColorRuns(grid.map((row) => row.map((c) => (c ? c.color : null))));
  }
  function removeCells(keys: Set<string>) {
    for (const key of keys) {
      const [xs, ys] = key.split(",");
      const x = +xs;
      const y = +ys;
      const cell = grid[y][x];
      if (!cell) continue;
      const cx = WX + x * CELL + CELL / 2;
      const cy = WY + y * CELL + CELL / 2;
      if (cell.kind === "germ") {
        germsLeft--;
        germsByColor[cell.color]--;
        germPops.push({ x: cx, y: cy, color: COLOR_HEX[cell.color], t: 0 }); // sparkle pop + ring
      }
      if (cell.conn) {
        const [dx, dy] = NEIGHBOR[cell.conn];
        const nx = x + dx;
        const ny = y + dy;
        const nb = grid[ny]?.[nx];
        if (nb && !keys.has(`${nx},${ny}`)) nb.conn = null;
      }
      for (let k = 0; k < 3; k++) sparks.push({ x: cx, y: cy, vx: r.range(-1.8, 1.8), vy: r.range(-2.4, 0.3), life: r.int(18, 34), color: COLOR_HEX[cell.color] });
      grid[y][x] = null;
    }
  }
  function applyGravityPass(): boolean {
    let moved = false;
    for (let y = ROWS - 2; y >= 0; y--) {
      for (let x = 0; x < COLS; x++) {
        const cell = grid[y][x];
        if (!cell || cell.kind === "germ") continue;
        if (cell.conn === "L" || cell.conn === "U") continue; // the owner half handles the pair
        const unit: [number, number][] = [[x, y]];
        if (cell.conn === "R") unit.push([x + 1, y]);
        else if (cell.conn === "D") unit.push([x, y + 1]);
        let canFall = true;
        for (const [ux, uy] of unit) {
          const ny = uy + 1;
          if (ny >= ROWS) {
            canFall = false;
            break;
          }
          if (unit.some(([ix, iy]) => ix === ux && iy === ny)) continue; // internal to this unit
          if (grid[ny][ux]) {
            canFall = false;
            break;
          }
        }
        if (!canFall) continue;
        const data = unit.map(([ux, uy]) => ({ x: ux, y: uy, cell: grid[uy][ux]! }));
        for (const d of data) grid[d.y][d.x] = null;
        for (const d of data) grid[d.y + 1][d.x] = d.cell;
        moved = true;
      }
    }
    return moved;
  }

  function checkMatches(io: IO) {
    if (germsLeft <= 0) {
      stageClearT = 110;
      banner = "STAGE CLEAR!";
      bannerT = 110;
      cheerT = 110;
      io.sfx.play("win");
      io.sfx.slide?.(520, 1180, 0.45, "triangle", 0.2); // a rising "cured!" sweep
      return;
    }
    const m = findMatches();
    if (m.size) {
      let germN = 0;
      let sx = 0;
      let sy = 0;
      for (const key of m) {
        const [xs, ys] = key.split(",");
        if (grid[+ys][+xs]?.kind === "germ") germN++;
        sx += +xs;
        sy += +ys;
      }
      const mult = combo + 1;
      io.score(Math.round((m.size * 50 + germN * 80) * mult));
      banner = mult >= 4 ? "MEGA COMBO!" : mult >= 2 ? `COMBO x${mult}!` : m.size >= 7 ? "SUPER CLEAR!" : germN > 0 ? "GERM ZAPPED!" : "NICE!";
      bannerT = 50;
      // a cascading combo callout floats up from where THIS match happened — during a multi-step
      // chain each pass stacks another one above the last, so the whole cascade reads on screen
      comboTexts.push({
        x: WX + (sx / m.size) * CELL + CELL / 2,
        y: WY + (sy / m.size) * CELL,
        t: 0,
        text: mult >= 2 ? `${banner} +${Math.round((m.size * 50 + germN * 80) * mult)}` : banner,
        color: mult >= 4 ? PAL.pink : mult >= 2 ? PAL.yellow : germN > 0 ? PAL.cyan : PAL.lime,
      });
      if (mult >= 2) {
        io.sfx.play("win");
        io.sfx.slide?.(360 + combo * 40, 680 + combo * 70, 0.2, "square", 0.14); // combo chime rises with the streak
      } else if (germN > 0) {
        io.sfx.play("zap");
      } else {
        io.sfx.play("pop");
      }
      if (mult >= 4) io.sfx.play("cheer");
      flashCells = m;
      flashT = FLASH_FRAMES;
      combo++;
      cheerT = germN > 0 || mult >= 2 ? 60 : 36;
      shakeT = germN > 0 || mult >= 2 ? 10 : 0;
      shakeMag = mult >= 4 ? 3 : mult >= 2 ? 2 : 1.4;
    } else {
      spawnNext(io);
    }
  }
  function spawnNext(io: IO) {
    const colorA = nextColors[0];
    const colorB = nextColors[1];
    nextColors = [r.pick([0, 1, 2]) as Color, r.pick([0, 1, 2]) as Color];
    const px = Math.floor(COLS / 2) - 1;
    const py = 0;
    if (grid[py][px] || grid[py][px + 1]) {
      piece = null;
      over = true;
      overT = 0;
      sentOver = false;
      banner = "GAME OVER";
      bannerT = 9999;
      io.sfx.play("die");
      return;
    }
    piece = { px, py, ori: 0, colorA, colorB };
    fallT = 0;
    lockT = 0;
    lockMoves = 0;
    dasDir = 0;
    dasT = 0;
    softT = 0;
    throwT = 16; // Dr. Cotton tosses the fresh capsule in — see the draw() flying-capsule arc
    thrownColors = [colorA, colorB];
    io.sfx.noise?.(0.1, 0.06, 1000, 320); // a soft toss whoosh
  }
  function lockPiece(io: IO) {
    const p = piece!;
    const [dx, dy] = OFFS[p.ori];
    const ox = p.px + dx;
    const oy = p.py + dy;
    grid[p.py][p.px] = { kind: "pill", color: p.colorA, conn: PIVOT_CONN[p.ori] };
    grid[oy][ox] = { kind: "pill", color: p.colorB, conn: OTHER_CONN[p.ori] };
    for (const [lx, ly] of [[p.px, p.py], [ox, oy]] as [number, number][])
      for (let k = 0; k < 2; k++)
        sparks.push({ x: WX + lx * CELL + CELL / 2 + r.range(-3, 3), y: WY + ly * CELL + CELL - 1, vx: r.range(-0.6, 0.6), vy: r.range(-0.7, -0.1), life: r.int(8, 14), color: PAL.grey });
    piece = null;
    combo = 0;
    io.sfx.play("thud");
    checkMatches(io);
  }
  function startStage(io: IO) {
    grid = Array.from({ length: ROWS }, () => new Array<Cell | null>(COLS).fill(null));
    germsByColor = [0, 0, 0];
    placeGerms(germCountFor(stage));
    banner = `STAGE ${stage}`;
    bannerT = 80;
    combo = 0;
    flashCells = null;
    flashT = 0;
    gravActive = false;
    gravTickT = 0;
    warned = false;
    io.sfx.tone(660, 0.05, "square", 0.1); // a little chime as a fresh bottle arrives
    spawnNext(io);
  }

  return {
    update(io) {
      frame++;
      if (!started) {
        started = true;
        startStage(io);
      }
      for (const s of sparks) {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.12;
        s.life--;
      }
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
      for (const p of germPops) p.t++;
      for (let i = germPops.length - 1; i >= 0; i--) if (germPops[i].t > 24) germPops.splice(i, 1);
      for (const c of comboTexts) c.t++;
      for (let i = comboTexts.length - 1; i >= 0; i--) if (comboTexts[i].t > 46) comboTexts.splice(i, 1);
      if (bannerT > 0) bannerT--;
      if (cheerT > 0) cheerT--;
      if (shakeT > 0) shakeT--;
      if (throwT > 0) throwT--;
      // the magnifying-glass viewer shrinks a germ type's dancer the moment its colour hits zero
      for (let c = 0; c < 3; c++) {
        if (germsByColor[c as Color] > 0) {
          germWasCleared[c] = false;
          germClearT[c] = 99;
        } else if (!germWasCleared[c]) {
          germWasCleared[c] = true;
          germClearT[c] = 0;
        } else if (germClearT[c] < 40) germClearT[c]++;
      }

      if (over) {
        overT++;
        if (overT % 3 === 0 && greyFromRow > 0) greyFromRow--;
        if (overT > 90 && !sentOver) {
          sentOver = true;
          io.gameOver();
        }
        return;
      }
      if (stageClearT > 0) {
        stageClearT--;
        // a little rising "cured!" jingle, spaced out across the stage-clear banner
        if (stageClearT === 90) io.sfx.tone(523, 0.12, "square", 0.18);
        else if (stageClearT === 75) io.sfx.tone(659, 0.12, "square", 0.18);
        else if (stageClearT === 60) io.sfx.tone(784, 0.12, "square", 0.18);
        else if (stageClearT === 40) io.sfx.tone(1047, 0.24, "square", 0.2);
        if (stageClearT <= 0) {
          if (stage >= MAX_STAGE) {
            if (!sentWin) {
              sentWin = true;
              banner = "ALL CLEAR! YOU WIN!";
              bannerT = 9999;
              io.win();
            }
          } else {
            stage++;
            startStage(io);
          }
        }
        return;
      }
      if (sentWin) return;

      if (flashT > 0) {
        flashT--;
        if (flashT <= 0) {
          removeCells(flashCells!);
          flashCells = null;
          gravActive = true;
          gravTickT = 0;
        }
        return;
      }
      if (gravActive) {
        gravTickT++;
        if (gravTickT >= GRAVITY_TICK) {
          gravTickT = 0;
          if (!applyGravityPass()) {
            gravActive = false;
            checkMatches(io);
          }
        }
        return;
      }
      if (!piece) {
        spawnNext(io);
        if (!piece) return;
      }

      const tr = topFilledRow();
      if (tr <= 3 && !warned) {
        warned = true;
        io.sfx.play("hurt"); // one warning chime when the bottle gets dangerously full
      } else if (tr > 6) warned = false;

      bubbleT++;
      if (bubbleT >= 70) {
        bubbleT = 0;
        io.sfx.noise?.(0.12, 0.025, 1800, 2600); // a quiet fizz bubble rising up the bottle
      }

      const inp = io.input;
      if (inp.pressed.a) tryRotate(1, io);
      if (inp.pressed.b) tryRotate(-1, io);

      const dir = inp.held.left ? -1 : inp.held.right ? 1 : 0;
      if (dir !== dasDir) {
        dasDir = dir;
        dasT = 0;
        if (dir && tryMove(dir, 0)) {
          io.sfx.tone(300, 0.02, "square", 0.05);
          touched();
        }
      } else if (dir) {
        dasT++;
        if (dasT >= 10 && (dasT - 10) % 4 === 0 && tryMove(dir, 0)) {
          io.sfx.tone(300, 0.02, "square", 0.05);
          touched();
        }
      }

      if (inp.held.down) {
        softT++;
        if (softT % 2 === 0 && tryMove(0, 1)) {
          io.score(1);
          fallT = 0;
        }
      } else softT = 0;
      fallT++;
      if (fallT >= gravityFrames()) {
        fallT = 0;
        tryMove(0, 1);
      }
      if (onFloor()) {
        lockT++;
        if (lockT >= (inp.held.down ? 10 : 26)) lockPiece(io);
      } else lockT = 0;
    },

    draw(g: Gfx) {
      g.clear(WALL_B);
      // a slow-scrolling clinic wallpaper (checker squares + little crosses) and a window either
      // side — only slivers show past the bottle and the clipboards, but that's enough to say
      // "clinic" instead of "plain dark box"
      const tile = art().wallTile;
      const th = tile.rows.length;
      const scrollY = Math.floor(frame / 10) % th;
      for (let ty = -th; ty < H; ty += th) drawStrip(g, tile, 0, ty + scrollY, W);
      g.sprite(art().window, 14, 11);
      g.sprite(art().window, W - 14 - 34, 11);
      g.rect(0, 0, W, 13, "#11183599"); // a translucent header strip keeps the top HUD text crisp

      // a short screen shake on a germ zap / big combo (camera resets once shakeT runs out)
      if (shakeT > 0) {
        const m = shakeMag * (shakeT / 10);
        g.camera(Math.sin(frame * 7.3) * m, Math.cos(frame * 5.1) * m);
      } else g.camera(0, 0);

      // bottle: a real glass outline (lip, neck, rounded shoulders, straight sides, a base cap)
      // with a tinted interior showing through — kept well clear of the top status bar
      const neckX = WX + (COLS * CELL - NECK_W) / 2; // Dr. Cotton's toss target is the neck centre
      // the neck + shoulder interior gets the SAME dark tint as the body (not a separate colour),
      // so the whole bottle reads as one continuous glass tube rather than a dark slot above a
      // tinted well; widened a touch for the shoulder (still safely inside its narrowest point)
      g.rect(neckX - 4, NECK_TOP, NECK_W + 8, WY - NECK_TOP, GLASS_DARK);
      g.sprite(art().bottleInner, WX, WY);
      g.sprite(art().bottleGlass, WX - GLASS_T, NECK_TOP);

      // grid contents
      const wiggle = Math.floor(frame / 18) % 2;
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (y >= greyFromRow) {
            if (grid[y][x]) g.rect(WX + x * CELL + 1, WY + y * CELL + 1, CELL - 2, CELL - 2, PAL.grey);
            continue;
          }
          const cell = grid[y][x];
          if (!cell) continue;
          const flashing = flashCells?.has(`${x},${y}`);
          if (flashing) {
            g.rect(WX + x * CELL, WY + y * CELL, CELL, CELL, Math.floor(flashT / 3) % 2 ? PAL.white : COLOR_HEX[cell.color]);
            continue;
          }
          const cx = WX + x * CELL + CELL / 2;
          const cy = WY + y * CELL + CELL / 2;
          if (cell.kind === "germ") {
            const bob = Math.sin(frame * 0.12 + x * 0.9 + y * 0.6) * 0.8;
            const baseX = WX + x * CELL;
            const baseY = WY + y * CELL + bob; // the 10x10 sprite already fills the cell
            g.sprite(GERM_FRAMES[cell.color][wiggle], baseX, baseY, { scale: GERM_SCALE });
            // two little waving arms poking out past the body (they swap raised/lowered each
            // wiggle frame), cheap (4 rects), drawn on top so they read clearly against the body
            const armY = cy + bob + (wiggle ? -1.6 : 1.6);
            g.rect(cx - 7.4, armY - 1, 2, 3, COLOR_HEX[cell.color]);
            g.rect(cx + 5.4, armY - 1, 2, 3, COLOR_HEX[cell.color]);
            g.rect(cx - 7.4, armY - 1.7, 2, 1, PAL.black);
            g.rect(cx + 5.4, armY - 1.7, 2, 1, PAL.black);
          } else {
            drawPillHalf(g, cx, cy, cell.color, cell.conn);
          }
        }
      }

      // active + ghost capsule
      if (piece && !over) {
        const p = piece;
        const [dx, dy] = OFFS[p.ori];
        const flatA = PIVOT_CONN[p.ori];
        const flatB = OTHER_CONN[p.ori];
        const gy = ghostY();
        const gdy = gy - p.py;
        if (gdy > 0) {
          const gcx = WX + p.px * CELL + CELL / 2;
          const gcy = WY + gy * CELL + CELL / 2;
          const ocx = WX + (p.px + dx) * CELL + CELL / 2;
          const ocy = WY + (gy + dy) * CELL + CELL / 2;
          drawPillHalf(g, gcx, gcy, p.colorA, flatA, 0.3);
          drawPillHalf(g, ocx, ocy, p.colorB, flatB, 0.3);
        }
        const pcx = WX + p.px * CELL + CELL / 2;
        const pcy = WY + p.py * CELL + CELL / 2;
        const ocx = WX + (p.px + dx) * CELL + CELL / 2;
        const ocy = WY + (p.py + dy) * CELL + CELL / 2;
        drawPillHalf(g, pcx, pcy, p.colorA, flatA);
        drawPillHalf(g, ocx, ocy, p.colorB, flatB);
      }
      for (const s of sparks) g.rect(s.x - 1, s.y - 1, 2, 2, s.life % 6 < 3 ? PAL.white : s.color);

      // sparkle pops: a fading flash where a germ was zapped, plus two little ★ flying outward
      for (const p of germPops) {
        const t = p.t / 24;
        g.alpha(Math.max(0, 1 - t));
        g.circle(p.x, p.y, 2 + t * 9, p.color);
        g.alpha(1);
        if (p.t < 16) {
          g.text("★", p.x - 7 - p.t * 0.6, p.y - 6 - p.t * 0.7, PAL.white);
          g.text("★", p.x + 7 + p.t * 0.6, p.y - 6 - p.t * 0.7, PAL.yellow);
        }
      }
      // cascading combo callouts: each match in a chain spawns one that drifts up and fades, so a
      // multi-step cascade reads as a little stack of rising text
      for (const c of comboTexts) {
        g.alpha(Math.max(0, 1 - c.t / 46));
        g.text(c.text, c.x, c.y - c.t * 0.9, c.color, { align: "center" });
        g.alpha(1);
      }

      // ── HUD ──
      g.text(`STAGE ${stage}`, 8, 4, PAL.yellow, { align: "left" });
      g.text(`GERMS ${germsLeft}`, W / 2, 4, PAL.cyan, { align: "center" });
      if (combo > 1) g.text(`COMBO x${combo}`, W - 8, 4, PAL.pink, { align: "right" });

      // framed clipboard/medical-chart panels: a wood board, paper insert with ruled lines, and
      // a little metal clip + coloured header tab holding the title
      const panel = (x: number, y: number, w: number, h: number, title: string) => {
        g.rect(x - 1, y - 1, w + 2, h + 2, WOOD);
        g.rect(x, y, w, h, PAPER);
        for (let ly = y + 15; ly < y + h - 3; ly += 7) g.rect(x + 4, ly, w - 8, 1, PAPER_LINE);
        if (title) {
          g.rect(x, y, w, 10, shade(PAL.navy, -0.1));
          g.rect(x + w / 2 - 8, y - 2, 16, 4, CLIP_METAL);
          g.rect(x + w / 2 - 6, y - 1, 12, 2, shade(CLIP_METAL, 0.3));
          g.text(title, x + w / 2, y + 2, PAL.white, { align: "center" });
        }
      };

      const bottom = WY + ROWS * CELL;
      const ink = (hex: string) => shade(hex, -0.2); // a readable ink tone for bright colours on paper

      // left: next capsule + controls (words, not font glyphs the pixel font can't draw)
      const LX = 6;
      const LW = WX - LX - 6;
      panel(LX, WY, LW, 56, "NEXT");
      {
        const ncx = LX + LW / 2;
        const ncy = WY + 32;
        drawPillHalf(g, ncx - CELL / 2, ncy, nextColors[0], "R");
        drawPillHalf(g, ncx + CELL / 2, ncy, nextColors[1], "L");
      }
      panel(LX, WY + 60, LW, bottom - (WY + 60), "");
      const lcx = LX + LW / 2;
      g.text("L R MOVE", lcx, WY + 78, ink(PAL.navy), { align: "center" });
      g.text("DOWN DROP", lcx, WY + 96, ink(PAL.navy), { align: "center" });
      g.text("A SPIN >", lcx, WY + 118, PAL.dark, { align: "center" });
      g.text("B SPIN <", lcx, WY + 136, PAL.dark, { align: "center" });
      g.text("4+ TO POP", lcx, WY + 160, ink(PAL.green), { align: "center" });

      // right: Dr. Cotton — a bigger (~40px) portrait: a white coat, a stethoscope, a face with
      // eyes and a smile. Tosses each fresh capsule in, bounces + sparkles after a pop, droops
      // when the bottle is nearly full.
      const RX = W - 6 - LW;
      const RW = LW;
      const worried = topFilledRow() <= 3 && !over;
      const cheering = cheerT > 0;
      const throwing = throwT > 0;
      panel(RX, WY, RW, 88, "DR. COTTON");
      {
        const bw = 14 * BUNNY_SCALE; // ~36
        const bh = 16 * BUNNY_SCALE; // ~42
        const bounce = cheering ? Math.abs(Math.sin(frame * 0.5)) * 5 : throwing ? (16 - throwT) * 0.5 : 0;
        const mx = RX + RW / 2 - bw / 2;
        const my = WY + 14 - bounce;
        // worried takes priority over the brief toss pose so the face always matches the "!" /
        // drip decoration below (never shut-eyed throw art next to a worried marker)
        const frameIdx = cheering ? Math.floor(frame / 6) % 2 : worried ? 2 : throwing ? 3 : Math.floor(frame / 24) % 2;
        g.sprite(BUNNY[frameIdx], mx, my, { scale: BUNNY_SCALE });
        if (cheering) {
          g.rect(mx - 4, my + bh * 0.2, 2, 2, PAL.yellow);
          g.rect(mx + bw + 2, my + bh * 0.2, 2, 2, PAL.yellow);
          g.rect(mx + bw / 2, my - 9, 2, 2, PAL.yellow);
        } else if (worried) {
          g.rect(mx + bw - 2, my + 6, 2, 6, PAL.sky);
          g.text("!", mx + bw / 2, my - 9, PAL.red, { align: "center" });
        } else if (throwing) {
          // a little capsule flies from Dr. Cotton's hand down toward the bottle neck
          const t = 1 - throwT / 16;
          const handX = mx + bw - 2;
          const handY = my + bh * 0.7;
          const targetX = neckX + NECK_W / 2;
          const targetY = WY - 4;
          const fx = handX + t * (targetX - handX);
          const fy = handY + t * (targetY - handY);
          g.line(handX, handY, fx, fy, "#ffffff55");
          g.rect(fx - 3, fy - 1, 2, 3, COLOR_HEX[thrownColors[0]]);
          g.rect(fx + 1, fy - 1, 2, 3, COLOR_HEX[thrownColors[1]]);
        }
      }
      panel(RX, WY + 92, RW, bottom - (WY + 92), "GERMS LEFT");
      // a magnifying-glass viewer: all three germ types dance inside one shared lens (sat clear
      // of the header above it), each shrinking away the moment its colour is fully cleared
      {
        const lensW = LENS_D + 12;
        const lensX = RX + (RW - lensW) / 2;
        const lensY = WY + 92 + 13;
        g.sprite(art().lens, lensX, lensY);
        const lensCx = lensX + LENS_D / 2 + 2;
        const lensCy = lensY + LENS_D / 2 + 2;
        for (let c = 0; c < 3; c++) {
          const ry = lensCy + (c - 1) * 15;
          const clearing = germClearT[c] < 18;
          const scale = germsByColor[c as Color] > 0 ? DANCER_SCALE : clearing ? DANCER_SCALE * (1 - germClearT[c] / 18) : 0;
          if (scale > 0.05) g.sprite(GERM_FRAMES[c][wiggle], lensCx - 5 * scale, ry - 5 * scale, { scale });
          if (germsByColor[c as Color] > 0) g.text(`x${germsByColor[c as Color]}`, RX + RW - 6, ry + 3, ink(COLOR_HEX[c as Color]), { align: "right" });
          else if (!clearing) g.text("CLEAR", RX + RW - 6, ry + 3, ink(PAL.green), { align: "right" });
        }
      }

      if (bannerT > 0 && banner) {
        const by = WY + ROWS * CELL - 80;
        g.rect(WX - 8, by - 5, COLS * CELL + 16, 16, "#0d0b1acc");
        g.text(banner, W / 2, by, Math.floor(frame / 4) % 2 ? PAL.yellow : PAL.pink, { align: "center" });
      }
    },
  };
}

export const pillDoctor: RetroGameDef = {
  id: "pill-doctor",
  title: "Pill Doctor",
  blurb: "Drop candy capsules to zap wiggling germs — match 4 to cure the bottle!",
  genre: "Puzzle",
  emoji: "💊",
  color: "#5ef2ff",
  controls: "◀ ▶ move · ▼ drop · A/B spin · match 4 colours to beat the germs",
  pad: { dpad: "4", a: "Spin", b: "Spin back" },
  create,
};
