// JUMPY JELLY — a side-scrolling candy platformer. Hop a jelly-bean hero through four
// handcrafted lands: bump "?" candy blocks for coins and gumdrop power-ups, stomp gumdrop
// blobs, kick shelled beetles, ride moving platforms, bounce on springs and reach the
// flag at the end of every level. 100 coins = an extra life. (Original game in the spirit
// of 8-bit platformers.)
import { H, PAL, W, clamp, overlap, sprite, spriteH, spriteW, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, drawStrip, hash2, mixHex, shade } from "../art";

const T = 16; // tile size
const ROWS = 14; // 14 x 16 = 224 = the whole screen height
const GRAV = 0.32;
const MAXFALL = 5.5;
const COYOTE = 6;
const BUFFER = 6;
const SOLID = new Set(["#", "B", "?", "P", "U", "=", "[", "]"]);

// ── level chunks: 10 rows each = map rows 4..13 (rows 0..3 are open sky) ──
// # ground  B brick  ? coin block  P power-up block  = candy stone  [ ] candy-cane pipe
// o coin  g gumdrop blob  k beetle  ^ spring  - platform (short ride)  ~ platform (long ride)
// | lift (up and down)  C checkpoint  F goal flag  S start
const CH: Record<string, string[]> = {
  start: [
    "................",
    "................",
    "................",
    "................",
    "......?.........",
    "................",
    "................",
    ".S..........o.o.",
    "################",
    "################",
  ],
  blocks: [
    "................",
    "................",
    "........o.......",
    "................",
    "....B?BPB.......",
    "................",
    "................",
    "...........g....",
    "################",
    "################",
  ],
  gap: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "......ooo.......",
    "................",
    "................",
    "######...#######",
    "######...#######",
  ],
  hop: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "....o.....o.....",
    "................",
    "..........g.....",
    "###..###..######",
    "###..###..######",
  ],
  pipes: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....[]....[]....",
    "....[]..g.[]..g.",
    "################",
    "################",
  ],
  heights: [
    "...BB?BB........",
    "................",
    "................",
    "................",
    "...?..P..?......",
    "................",
    "................",
    "........g...g...",
    "################",
    "################",
  ],
  check: [
    "................",
    "................",
    "................",
    "................",
    ".....o.o.o......",
    "................",
    "................",
    "..C.......g.....",
    "################",
    "################",
  ],
  spring: [
    "................",
    "...oooo.........",
    "................",
    "..........oo....",
    "..........B?B...",
    "................",
    "................",
    "...^............",
    "################",
    "################",
  ],
  stairs: [
    "................",
    "................",
    "................",
    "............==..",
    "...........===..",
    "..........====..",
    ".........=====..",
    "..g.....======..",
    "################",
    "################",
  ],
  pyramid: [
    "................",
    "................",
    "................",
    "......ooo.......",
    "....=...=.......",
    "...==...==......",
    "..===...===.....",
    ".====...====.g..",
    "#####...########",
    "#####...########",
  ],
  beetles: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "..k........k..=.",
    "################",
    "################",
  ],
  mixed: [
    "................",
    "................",
    "................",
    "................",
    "......B?B.......",
    "................",
    "................",
    "...g.g....k.....",
    "################",
    "################",
  ],
  ferry: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "......o.o.o.....",
    "................",
    "...~............",
    "###..........###",
    "###..........###",
  ],
  twoFerry: [
    "................",
    "................",
    "................",
    ".........ooo....",
    "................",
    "................",
    "........-.......",
    "..-.............",
    "##............##",
    "##............##",
  ],
  lift: [
    "................",
    "................",
    "..........oooo..",
    ".........######.",
    "................",
    "................",
    "................",
    "....|...........",
    "####.....#######",
    "####.....#######",
  ],
  islands: [
    "................",
    "................",
    "................",
    "........ooo.....",
    "................",
    ".......####.....",
    "................",
    "..###.......###.",
    "................",
    "................",
  ],
  islands2: [
    "................",
    "................",
    ".....ooo........",
    "................",
    "....####....ooo.",
    "................",
    ".##.........###.",
    "........##......",
    "................",
    "................",
  ],
  finish: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "..=.............",
    ".==.............",
    "===.......F.....",
    "################",
    "################",
  ],
};

interface LevelDef {
  name: string;
  chunks: string[];
  sky: [string, string];
  hills: [string, string];
  /** near-hill dome colour variety (pastel candy domes); falls back to [hills[1]] when absent */
  domeColors?: string[];
  icing: string;
  dirt: string;
  speed: number;
}
const LEVELS: LevelDef[] = [
  {
    name: "CANDY MEADOW",
    chunks: ["start", "blocks", "hop", "pipes", "heights", "check", "spring", "pyramid", "mixed", "stairs", "finish"],
    sky: ["#7a4a9e", "#ffc3ea"],
    hills: ["#dba6d8", "#8a5a34"],
    domeColors: ["#ff9fd0", "#c9a6e8", "#ffcf9e", "#9df0c9"],
    icing: "#fff0f6",
    dirt: "#5c3620",
    speed: 0.45,
  },
  {
    name: "SUNSET SWIRL",
    chunks: ["start", "mixed", "beetles", "gap", "ferry", "heights", "check", "pipes", "hop", "stairs", "twoFerry", "beetles", "finish"],
    sky: ["#ff9a3c", "#ffc1e6"],
    hills: ["#c89aff", "#9a5cff"],
    icing: PAL.pink,
    dirt: "#8a4a3a",
    speed: 0.55,
  },
  {
    name: "ROCK CANDY CAVE",
    chunks: ["start", "beetles", "lift", "blocks", "twoFerry", "pipes", "check", "mixed", "ferry", "pyramid", "beetles", "spring", "finish"],
    sky: ["#1b1535", "#26306b"],
    hills: ["#3a3f6a", "#4a4e7a"],
    icing: PAL.cyan,
    dirt: "#4a3a5a",
    speed: 0.6,
  },
  {
    name: "CLOUD CASTLE",
    chunks: ["start", "islands", "heights", "islands2", "ferry", "check", "twoFerry", "lift", "islands", "mixed", "islands2", "stairs", "finish"],
    sky: ["#5ec8ff", "#c8f4ff"],
    hills: ["#ffffff", "#e4f2ff"],
    icing: PAL.white,
    dirt: "#c07ab0",
    speed: 0.65,
  },
];

// ── baked backdrop art (lazy memo: baked once, the SAME Sprite objects are reused every frame) ──
const SPRINKLE_DOTS = [PAL.yellow, PAL.cyan, PAL.white, PAL.orange, PAL.pink];

interface Dome { cx: number; cy: number; r: number; color: string }
/** lay out overlapping round dome/cupcake/gumdrop bumps in one or more staggered rows */
function layoutDomes(w: number, baseline: number, rows: { n: number; r: number; yOff: number }[], colors: string[], seed: number): Dome[] {
  const domes: Dome[] = [];
  let idx = 0;
  for (const row of rows) {
    for (let i = 0; i < row.n; i++) {
      const cx = ((i + 0.5) / row.n) * w + (hash2(i, seed + idx, 3) - 0.5) * (w / row.n) * 0.35;
      const r = row.r * (0.78 + 0.46 * hash2(i, seed + idx, 11));
      const cy = baseline - r * 0.8 + row.yOff;
      const color = colors[Math.floor(hash2(i, seed + idx, 17) * colors.length) % colors.length];
      domes.push({ cx, cy, r, color });
      idx++;
    }
  }
  return domes; // earlier = further back, later = painted on top
}
/** bake a row of round, overlapping candy domes — never a ridge silhouette or a triangle.
 *  `detailed` adds a thick icing cap with hanging drips (for the near row); the far row is a
 *  flatter, hazier silhouette of the same round shapes. */
function bakeDomes(w: number, h: number, domes: Dome[], icing: string, detailed: boolean): Sprite {
  return bake(w, h, (x, y) => {
    for (let i = domes.length - 1; i >= 0; i--) {
      const dm = domes[i];
      const dx = x - dm.cx;
      const dy = y - dm.cy;
      const d = Math.hypot(dx, dy);
      if (d > dm.r) continue;
      if (detailed) {
        const icy = dm.cy - dm.r * 0.55;
        const ex = dx / (dm.r * 0.86);
        const ey = (y - icy) / (dm.r * 0.5);
        if (ex * ex + ey * ey <= 1 && y < dm.cy - dm.r * 0.05) return ey > 0.5 ? shade(icing, -0.14) : icing;
        for (let k = 0; k < 3; k++) {
          const dcx = dm.cx + (k - 1) * dm.r * 0.55;
          const dripLen = dm.r * (0.22 + 0.3 * hash2(i, k, 9));
          const dripBot = icy + dm.r * 0.36 + dripLen;
          const dripR = dm.r * 0.13;
          const kdx = x - dcx;
          const kdy = y - (dripBot - dripR);
          if (y > icy + dm.r * 0.14 && y < dripBot && kdx * kdx + kdy * kdy * 1.4 <= dripR * dripR) return icing;
        }
      }
      const nx = dx / dm.r;
      const ny = dy / dm.r;
      const light = -(nx * 0.55 + ny * 0.8);
      return shade(dm.color, light * (detailed ? 0.3 : 0.16));
    }
    return null;
  });
}
const bakeFarHill = (d: LevelDef, seed: number) => {
  const w = 220, h = 100, baseline = 86;
  const colors = d.name === "CANDY MEADOW" ? [d.hills[0], "#8a5a34"] : [d.hills[0]];
  return bakeDomes(w, h, layoutDomes(w, baseline, [{ n: 4, r: 46, yOff: 0 }], colors, seed), d.icing, false);
};
const bakeNearHill = (d: LevelDef, seed: number) => {
  const w = 192, h = 128, baseline = 112;
  const colors = d.domeColors ?? [d.hills[1]];
  const rows = [
    { n: 3, r: 34, yOff: -8 },
    { n: 4, r: 30, yOff: 8 },
  ];
  return bakeDomes(w, h, layoutDomes(w, baseline, rows, colors, seed + 101), d.icing, true);
};
const LOLLI_COLORS: [string, string][] = [
  ["#ff5075", "#fff6fa"],
  ["#8a5cff", "#f3ecff"],
  ["#2fd0c0", "#eafffa"],
  ["#ff9a3c", "#fff3e0"],
];
const bakeLollipop = ([head, swirl]: [string, string]) => {
  const w = 56, h = 70, cx = 26, cy = 24, R = 15;
  return bake(w, h, (x, y) => {
    const dx = x - cx + 0.5;
    const dy = y - cy + 0.5;
    const r = Math.hypot(dx, dy);
    if (r <= R) {
      if (r > R - 1.3) return shade(head, -0.35);
      const ang = Math.atan2(dy, dx);
      return Math.floor(r * 0.85 + ang * 2.1) % 2 ? head : swirl;
    }
    if (x >= cx - 2 && x < cx + 2 && y >= cy + R - 2 && y < h - 4) return "#fff6fa";
    if ((x === cx - 3 || x === cx + 1) && y >= cy + R - 2 && y < h - 4) return "#d8c6d0";
    return null;
  });
};
const bakeCandyBeam = () =>
  bake(48, 8, (x, y) => {
    if (y === 0) return "#ffd9ec";
    if (y === 7) return "#7a2f5a";
    return Math.floor((x + y * 2) / 6) % 2 ? PAL.red : PAL.white;
  });
/** a glossy pink/gold candy square with diagonal stripes and a bevelled edge */
const bakeCoinFrame = () => {
  const w = 16, h = 16;
  return bake(w, h, (x, y) => {
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    if (edge) return "#7a2f5a";
    const stripe = Math.floor((x + y) / 4) % 2;
    const base = stripe ? "#ff6fb0" : "#ffd34d";
    if (x === 1 || y === 1) return shade(base, 0.35);
    if (x === w - 2 || y === h - 2) return shade(base, -0.3);
    return base;
  });
};
/** a big shiny gold coin, several widths so a spin cycle can pick between them */
const COIN_WIDTHS = [12, 8, 3, 8];
const bakeCoin = (w: number, h: number) =>
  bake(w, h, (x, y) => {
    const dx = (x + 0.5 - w / 2) / (w / 2);
    const dy = (y + 0.5 - h / 2) / (h / 2);
    const d = dx * dx + dy * dy;
    if (d > 1) return null;
    if (d > 0.76) return "#b3720f";
    if (dx < -0.05 && dy < -0.1 && d < 0.42) return "#fff3b0";
    return PAL.yellow;
  });
const makeArt = () => ({
  farHills: LEVELS.map((d, i) => bakeFarHill(d, i * 97 + 13)),
  nearHills: LEVELS.map((d, i) => bakeNearHill(d, i * 131 + 53)),
  lollipops: LOLLI_COLORS.map(bakeLollipop),
  candyBeam: bakeCandyBeam(),
  coinFrame: bakeCoinFrame(),
  coins: COIN_WIDTHS.map((w) => bakeCoin(w, 12)),
});
let A: ReturnType<typeof makeArt> | null = null;
const art = () => (A ??= makeArt());

/** draw a sprite scaled up, anchored at the bottom-centre of a (small, unchanged) hitbox —
 *  so the art reads bigger while the collision box stays exactly as before. */
function drawBig(g: Gfx, s: Sprite, boxX: number, boxY: number, boxW: number, boxH: number, sc: number, opts?: { flipX?: boolean; flipY?: boolean }) {
  const w = spriteW(s) * sc;
  const h = spriteH(s) * sc;
  g.sprite(s, boxX + boxW / 2 - w / 2, boxY + boxH - h, { ...opts, scale: sc });
}

// ── sprites ──
const JP = { k: PAL.black, r: PAL.red, w: PAL.white, p: "#c2282f" };
const J_TOP = ["...kkkkkk...", "..krrrrrrk..", ".krwwrrrrrk.", "krwrrrwkrwkk", "krrrrrwkrwkk"];
const J_R5 = "krrrrrrrrrrk";
const J_MID = [J_R5, "krrrrprrrrpk", "krrrrrrkkkrk", "krrrrrrrrrrk"];
const J_BOT = [".krrrrrrrrk.", "..kkkkkkkk.."];
const FEET = ["...kk..kk...", "..kk....kk..", "....kkkk...."];
const jelly = (big: boolean, feet: string) =>
  sprite(big ? [...J_TOP, J_R5, J_R5, ...J_MID, J_R5, J_R5, ...J_BOT, feet] : [...J_TOP, ...J_MID, ...J_BOT, feet], JP);
const HERO = { small: FEET.map((f) => jelly(false, f)), big: FEET.map((f) => jelly(true, f)) };

const BP = { k: PAL.black, g: PAL.green, w: PAL.white };
const BP2 = { k: PAL.black, g: "#8a4fd6", w: PAL.white };
const BLOB_BODY = ["....kkkk....", "..kkggggkk..", ".kgwggggwgk.", "kggggggggggk", "kgkkggggkkgk", "kgwkggggwkgk", "kggggggggggk", "kggggkkggggk", "kggggggggggk", ".kkkkkkkkkk."];
const BLOB = [sprite([...BLOB_BODY, ".kk......kk."], BP), sprite([...BLOB_BODY, "...kk..kk..."], BP)];
const BLOB_PURPLE = [sprite([...BLOB_BODY, ".kk......kk."], BP2), sprite([...BLOB_BODY, "...kk..kk..."], BP2)];
const BLOB_FLAT = sprite([".kkkkkkkkkk.", "kgwgggggwggk", "kgkkggggkkgk", "kggggggggggk", ".kkkkkkkkkk."], BP);
const BEP = { k: PAL.black, p: "#9a6a42", w: PAL.white, y: "#6fbf5a" };
const BEETLE_BODY = ["......kkkk..", "....kkppppk.", "...kpwpppppk", "..kpwppppppk", "kyykpppppppk", "kywkpppppppk", "kykkpppppppk", "kyykkkkkkkkk"];
const BEETLE = [sprite([...BEETLE_BODY, ".kk.k..k..k.", ".k...k..k..."], BEP), sprite([...BEETLE_BODY, "..k..k..k.k.", "..k.k..k..k."], BEP)];
const SHELL = sprite(["...kkkkkk...", "..kpwppppk..", ".kpwppppppk.", "kppppppppppk", "kpppyyyypppk", "kppppppppppk", "kkkkkkkkkkkk"], BEP);
const GUM = sprite(
  ["....kkkk....", "..kkowookk..", ".koowoooook.", "kooooooooook", "kookooookook", "kookooookook", "koooookkoook", "kooooooooook", ".kkkkkkkkkk."],
  { k: PAL.black, o: PAL.orange, w: PAL.white },
);

type MobKind = "blob" | "beetle" | "shell" | "gum";
interface Mob {
  kind: MobKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  t: number;
  active: boolean;
  dead: number; // >0 = squashed/popped animation frames left; -1 = alive
  grace: number;
  flip: boolean; // popped enemies fly off upside down
  tint: 0 | 1; // blob colour variant (green/purple), fixed by spawn position
}
interface Plat {
  x: number;
  y: number;
  x0: number;
  y0: number;
  axis: "x" | "y";
  range: number;
  off: number;
  dir: number;
  dx: number;
  dy: number;
}
interface Spring {
  x: number;
  y: number;
  t: number;
}
interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}
interface Pop {
  x: number;
  y: number;
  t: number;
  text: string;
}
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
}

function buildLevel(li: number) {
  const def = LEVELS[li];
  const rows: string[] = new Array(ROWS).fill("");
  for (const name of def.chunks) {
    const ch = CH[name];
    const w = Math.max(...ch.map((r) => r.length));
    for (let r = 0; r < ROWS; r++) {
      const src = r < ROWS - ch.length ? "" : ch[r - (ROWS - ch.length)];
      rows[r] += src.padEnd(w, ".").slice(0, w);
    }
  }
  const cols = rows[0].length;
  const grid = rows.map((r) => r.split(""));
  const mobs: Mob[] = [];
  const plats: Plat[] = [];
  const springs: Spring[] = [];
  let start = { x: 24, y: 180 };
  let check = { x: -1, y: 0 };
  let goalX = (cols - 6) * T;
  const mob = (kind: MobKind, x: number, y: number): Mob => ({
    kind,
    x,
    y,
    vx: -def.speed,
    vy: 0,
    w: 12,
    h: 11,
    t: 0,
    active: false,
    dead: -1,
    grace: 0,
    flip: false,
    tint: kind === "blob" && hash2(Math.floor(x / T), Math.floor(y / T), 55) > 0.5 ? 1 : 0,
  });
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = grid[r][c];
      const bx = c * T;
      const by = (r + 1) * T;
      if (ch === "S") start = { x: bx + 3, y: by - 12 };
      else if (ch === "g") mobs.push(mob("blob", bx + 2, by - 11));
      else if (ch === "k") mobs.push(mob("beetle", bx + 2, by - 11));
      else if (ch === "^") springs.push({ x: bx, y: r * T + 6, t: 0 });
      else if (ch === "-" || ch === "~") plats.push({ x: bx, y: r * T, x0: bx, y0: r * T, axis: "x", range: (ch === "-" ? 3 : 7) * T, off: 0, dir: 1, dx: 0, dy: 0 });
      else if (ch === "|") plats.push({ x: bx, y: r * T, x0: bx, y0: r * T, axis: "y", range: 4 * T, off: 0, dir: 1, dx: 0, dy: 0 });
      else if (ch === "C") check = { x: bx, y: by };
      else if (ch === "F") goalX = bx + 6;
      else continue;
      grid[r][c] = ".";
    }
  }
  return { def, grid, cols, mobs, plats, springs, start, check, goalX };
}

function create(_seed: number): GameInstance {
  const ART = art();
  let li = 0;
  let lv = buildLevel(0);
  let lives = 3;
  let coins = 0;
  let over = false;
  let won = false;
  let tick = 0;
  let camX = 0;
  let checkpoint = false;
  let banner = 150;
  let state: "play" | "dead" | "clear" = "play";
  let stateT = 0;
  const hero = { x: 0, y: 0, vx: 0, vy: 0, w: 10, h: 12, big: false, onGround: false, coyote: 0, buffer: 0, jumping: false, facing: 1, inv: 0, anim: 0, plat: null as Plat | null, pop: 0, popDir: 1 as 1 | -1 };
  let parts: Part[] = [];
  let pops: Pop[] = [];
  let bumps: { c: number; r: number; t: number }[] = [];

  const loadLevel = (fromCheck: boolean) => {
    lv = buildLevel(li);
    const p = fromCheck && lv.check.x >= 0 ? { x: lv.check.x + 3, y: lv.check.y - 12 } : lv.start;
    hero.x = p.x;
    hero.y = p.y;
    hero.vx = hero.vy = 0;
    hero.big = false;
    hero.h = 12;
    hero.inv = 0;
    hero.plat = null;
    hero.facing = 1;
    parts = [];
    pops = [];
    bumps = [];
    camX = clamp(hero.x - W / 2, 0, lv.cols * T - W);
    state = "play";
    stateT = 0;
  };
  loadLevel(false);

  // ── tile collision ──
  const tileAt = (px: number, py: number) => {
    const c = Math.floor(px / T);
    const r = Math.floor(py / T);
    if (c < 0 || c >= lv.cols) return "#";
    if (r < 0 || r >= ROWS) return ".";
    return lv.grid[r][c];
  };
  const solidAt = (px: number, py: number) => SOLID.has(tileAt(px, py));
  const moveX = (e: Box, dx: number) => {
    e.x += dx;
    if (dx > 0) {
      const right = e.x + e.w - 0.01;
      if (solidAt(right, e.y + 1) || solidAt(right, e.y + e.h - 1) || solidAt(right, e.y + e.h / 2)) {
        e.x = Math.floor(right / T) * T - e.w;
        return true;
      }
    } else if (dx < 0) {
      if (solidAt(e.x, e.y + 1) || solidAt(e.x, e.y + e.h - 1) || solidAt(e.x, e.y + e.h / 2)) {
        e.x = (Math.floor(e.x / T) + 1) * T;
        return true;
      }
    }
    return false;
  };
  /** 1 = landed, -1 = bonked head, 0 = free */
  const moveY = (e: Box, dy: number) => {
    e.y += dy;
    if (dy >= 0) {
      const bottom = e.y + e.h;
      if (bottom >= 0 && (solidAt(e.x + 1, bottom) || solidAt(e.x + e.w - 1, bottom))) {
        e.y = Math.floor(bottom / T) * T - e.h;
        return 1;
      }
    } else if (e.y >= 0 && (solidAt(e.x + 1, e.y) || solidAt(e.x + e.w - 1, e.y))) {
      e.y = (Math.floor(e.y / T) + 1) * T;
      return -1;
    }
    return 0;
  };

  const burst = (x: number, y: number, color: string, n: number, spd = 1.5) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + tick;
      parts.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 1, life: 24, color, size: 2 });
    }
  };
  const addScore = (io: IO, pts: number, x: number, y: number) => {
    io.score(pts);
    pops.push({ x, y, t: 0, text: String(pts) });
  };
  const addCoin = (io: IO) => {
    coins++;
    io.sfx.play("coin");
    io.score(50);
    if (coins >= 100) {
      coins -= 100;
      lives++;
      io.sfx.play("powerup");
      pops.push({ x: hero.x, y: hero.y - 10, t: 0, text: "1UP" });
    }
  };

  const hurt = (io: IO) => {
    if (hero.inv > 0 || state !== "play") return;
    if (hero.big) {
      hero.big = false;
      hero.y += 4;
      hero.h = 12;
      hero.inv = 110;
      io.sfx.play("hit");
      burst(hero.x + 5, hero.y + 4, PAL.orange, 8);
    } else die(io, true);
  };
  const die = (io: IO, hop: boolean) => {
    state = "dead";
    stateT = 0;
    hero.vy = hop ? -5 : 0;
    hero.vx = 0;
    io.sfx.play("die");
  };

  const bumpTile = (io: IO, c: number, r: number) => {
    const ch = lv.grid[r]?.[c];
    if (!ch || !SOLID.has(ch)) return false;
    // anything standing on the bumped block gets popped
    for (const m of lv.mobs) {
      if (m.dead >= 0 || !m.active || m.kind === "gum") continue;
      if (m.x + m.w > c * T && m.x < c * T + T && Math.abs(m.y + m.h - r * T) < 3) popMob(io, m);
    }
    if (ch === "?") {
      lv.grid[r][c] = "U";
      addCoin(io);
      parts.push({ x: c * T + 4, y: r * T - 8, vx: 0, vy: -4, life: 22, color: "coin", size: 8 });
    } else if (ch === "P") {
      lv.grid[r][c] = "U";
      io.sfx.play("powerup");
      lv.mobs.push({ kind: "gum", x: c * T + 2, y: r * T, vx: 0.9, vy: 0, w: 12, h: 9, t: 0, active: true, dead: -1, grace: 0, flip: false, tint: 0 });
    } else if (ch === "B") {
      if (hero.big) {
        lv.grid[r][c] = ".";
        io.sfx.play("explode");
        io.score(50);
        for (const [vx, vy] of [[-1.5, -4], [1.5, -4], [-1, -2.5], [1, -2.5]]) parts.push({ x: c * T + 8, y: r * T + 8, vx, vy, life: 50, color: "#c0703a", size: 5 });
        return true;
      }
      io.sfx.play("bounce");
    } else io.sfx.play("step");
    bumps.push({ c, r, t: 0 });
    return true;
  };

  const popMob = (io: IO, m: Mob) => {
    m.dead = 60;
    m.flip = true;
    m.vy = -3.5;
    m.vx = m.vx > 0 ? 0.8 : -0.8;
    io.sfx.play("hit");
    addScore(io, 200, m.x, m.y - 6);
  };

  const heroBox = () => ({ x: hero.x, y: hero.y, w: hero.w, h: hero.h });

  const updateHero = (io: IO) => {
    const inp = io.input;
    const prevBottom = hero.y + hero.h;
    // ride the platform we are standing on
    if (hero.plat) {
      moveX(hero, hero.plat.dx);
      hero.y += hero.plat.dy;
    }
    const maxV = inp.held.b ? 2.4 : 1.5;
    const acc = hero.onGround ? 0.13 : 0.09;
    if (inp.held.left && !inp.held.right) {
      hero.vx = Math.max(-maxV, hero.vx - (hero.vx > 0 ? acc * 2.2 : acc));
      hero.facing = -1;
    } else if (inp.held.right && !inp.held.left) {
      hero.vx = Math.min(maxV, hero.vx + (hero.vx < 0 ? acc * 2.2 : acc));
      hero.facing = 1;
    } else {
      hero.vx *= hero.onGround ? 0.82 : 0.97;
      if (Math.abs(hero.vx) < 0.05) hero.vx = 0;
    }
    if (Math.abs(hero.vx) > maxV) hero.vx *= 0.95; // let go of B: ease back to walking pace

    hero.buffer = inp.pressed.a ? BUFFER : Math.max(0, hero.buffer - 1);
    hero.coyote = hero.onGround ? COYOTE : Math.max(0, hero.coyote - 1);
    if (hero.buffer > 0 && hero.coyote > 0) {
      hero.vy = -(5.5 + Math.abs(hero.vx) * 0.26);
      hero.buffer = 0;
      hero.coyote = 0;
      hero.onGround = false;
      hero.jumping = true;
      hero.plat = null;
      hero.pop = 8;
      hero.popDir = 1;
      io.sfx.play("jump");
    }
    if (hero.jumping && !inp.held.a && hero.vy < -2) hero.vy = -2; // short hop when A is let go early
    hero.vy = Math.min(MAXFALL, hero.vy + GRAV);

    if (moveX(hero, hero.vx)) hero.vx = 0;
    hero.anim += Math.abs(hero.vx) * 0.09;
    const wasGround = hero.onGround;
    hero.onGround = false;
    hero.plat = null;
    const res = moveY(hero, hero.vy);
    if (res === 1) {
      if (!wasGround && hero.vy > 3) {
        parts.push({ x: hero.x + 5, y: hero.y + hero.h, vx: 0, vy: 0, life: 12, color: "dust", size: 3 });
        if (hero.vy > 4.2) io.sfx.play("thud");
        hero.pop = 8;
        hero.popDir = -1;
      }
      hero.vy = 0;
      hero.onGround = true;
      hero.jumping = false;
    } else if (res === -1) {
      hero.vy = 0.5;
      const cx = hero.x + hero.w / 2;
      const r = Math.floor((hero.y - 1) / T);
      if (!bumpTile(io, Math.floor(cx / T), r)) {
        if (!bumpTile(io, Math.floor((hero.x + 1) / T), r)) bumpTile(io, Math.floor((hero.x + hero.w - 1) / T), r);
      }
    }
    // moving platforms (solid from the top only)
    if (hero.vy >= 0) {
      for (const p of lv.plats) {
        if (hero.x + hero.w > p.x && hero.x < p.x + 48 && prevBottom <= p.y - p.dy + 2 && hero.y + hero.h >= p.y) {
          hero.y = p.y - hero.h;
          hero.vy = 0;
          hero.onGround = true;
          hero.jumping = false;
          hero.plat = p;
        }
      }
      for (const s of lv.springs) {
        if (hero.x + hero.w > s.x + 1 && hero.x < s.x + 15 && prevBottom <= s.y + 3 && hero.y + hero.h >= s.y) {
          hero.y = s.y - hero.h;
          hero.vy = inp.held.a || hero.buffer > 0 ? -9 : -7;
          hero.onGround = false;
          hero.jumping = false;
          hero.coyote = 0;
          s.t = 12;
          io.sfx.play("bounce");
          if (hero.vy <= -9) io.sfx.play("whoosh");
        }
      }
    }
    // coins
    for (const [px, py] of [[hero.x + 2, hero.y + 2], [hero.x + hero.w - 2, hero.y + 2], [hero.x + 2, hero.y + hero.h - 2], [hero.x + hero.w - 2, hero.y + hero.h - 2]]) {
      const c = Math.floor(px / T);
      const r = Math.floor(py / T);
      if (lv.grid[r]?.[c] === "o") {
        lv.grid[r][c] = ".";
        addCoin(io);
        burst(c * T + 8, r * T + 8, PAL.yellow, 5, 1);
      }
    }
    hero.inv = Math.max(0, hero.inv - 1);
    hero.pop = Math.max(0, hero.pop - 1);
    if (hero.y > H + 16) die(io, false);
    // checkpoint + goal
    if (!checkpoint && lv.check.x >= 0 && hero.x > lv.check.x) {
      checkpoint = true;
      io.sfx.play("blip");
      addScore(io, 100, lv.check.x, lv.check.y - 40);
    }
    if (hero.x + hero.w >= lv.goalX) {
      state = "clear";
      stateT = 0;
      hero.x = lv.goalX - hero.w + 2;
      hero.vx = 0;
      const height = clamp(Math.floor((12 * T - hero.y) / T), 0, 8);
      addScore(io, 100 + height * 200, hero.x, hero.y - 10);
      io.sfx.play("powerup");
    }
  };

  const updateMobs = (io: IO) => {
    const hb = heroBox();
    const heroFalling = hero.vy > 0.3;
    for (const m of lv.mobs) {
      if (!m.active) {
        if (m.x < camX + W + 24) m.active = true;
        else continue;
      }
      m.t++;
      if (m.dead >= 0) {
        m.dead--;
        if (m.flip) {
          m.vy += GRAV;
          m.y += m.vy;
          m.x += m.vx;
        }
        continue;
      }
      if (m.kind === "gum" && m.t < 16) {
        m.y -= 1; // rise out of the block
        continue;
      }
      if (m.x < camX - 120 || m.y > H + 24) {
        m.dead = 0;
        continue;
      }
      m.grace = Math.max(0, m.grace - 1);
      m.vy = Math.min(MAXFALL, m.vy + GRAV);
      if (moveY(m, m.vy) !== 0) m.vy = 0;
      if (moveX(m, m.vx)) {
        m.vx = -m.vx;
        if (m.kind === "shell") io.sfx.play("step");
      }
      if (m.kind === "shell" && m.vx === 0 && m.t > 420) {
        m.kind = "beetle"; // wakes up and walks again
        m.y -= 2;
        m.h = 11;
        m.vx = hero.x < m.x ? -lv.def.speed : lv.def.speed;
      }
      // a kicked shell bowls over everything in its path
      if (m.kind === "shell" && m.vx !== 0) {
        for (const o of lv.mobs) {
          if (o !== m && o.active && o.dead < 0 && o.kind !== "gum" && overlap(m, o)) popMob(io, o);
        }
      }
      // walkers turn around when they meet
      if (m.kind === "blob" || m.kind === "beetle") {
        for (const o of lv.mobs) {
          if (o !== m && o.active && o.dead < 0 && (o.kind === "blob" || o.kind === "beetle") && overlap(m, o) && Math.sign(o.x - m.x) === Math.sign(m.vx)) m.vx = -m.vx;
        }
      }
      if (state !== "play" || !overlap(hb, m)) continue;
      const stomp = heroFalling && hero.y + hero.h - hero.vy <= m.y + 6;
      const bounce = () => {
        hero.vy = io.input.held.a ? -6.5 : -4.2;
        hero.y = m.y - hero.h;
        hero.onGround = false;
        hero.jumping = false;
      };
      if (m.kind === "gum") {
        m.dead = 0;
        io.sfx.play("powerup");
        if (hero.big) addScore(io, 1000, m.x, m.y - 6);
        else {
          hero.big = true;
          hero.y -= 4;
          hero.h = 16;
          addScore(io, 500, m.x, m.y - 6);
        }
        burst(m.x + 6, m.y + 4, PAL.orange, 10);
      } else if (m.kind === "blob") {
        if (stomp) {
          m.dead = 30;
          bounce();
          io.sfx.play("bounce");
          addScore(io, 100, m.x, m.y - 6);
          burst(m.x + 6, m.y + 8, PAL.lime, 6);
        } else hurt(io);
      } else if (m.kind === "beetle") {
        if (stomp) {
          m.kind = "shell";
          m.vx = 0;
          m.t = 0;
          m.y += 2;
          m.h = 9;
          bounce();
          io.sfx.play("bounce");
          addScore(io, 100, m.x, m.y - 6);
        } else hurt(io);
      } else if (m.kind === "shell") {
        if (m.vx === 0) {
          m.vx = hero.x + hero.w / 2 < m.x + m.w / 2 ? 3.4 : -3.4;
          m.grace = 14;
          m.t = 0;
          if (stomp) bounce();
          io.sfx.play("kick");
          addScore(io, 100, m.x, m.y - 6);
        } else if (stomp) {
          m.vx = 0;
          m.t = 0;
          bounce();
          io.sfx.play("bounce");
        } else if (m.grace === 0) hurt(io);
      }
    }
    lv.mobs = lv.mobs.filter((m) => !(m.dead === 0 || (m.dead > 0 && m.y > H + 40)));
  };

  const updatePlats = () => {
    for (const p of lv.plats) {
      p.off += p.dir * 0.6;
      if (p.off >= p.range) {
        p.off = p.range;
        p.dir = -1;
      } else if (p.off <= 0) {
        p.off = 0;
        p.dir = 1;
      }
      const nx = p.axis === "x" ? p.x0 + p.off : p.x0;
      const ny = p.axis === "y" ? p.y0 - p.off : p.y0;
      p.dx = nx - p.x;
      p.dy = ny - p.y;
      p.x = nx;
      p.y = ny;
    }
  };

  return {
    update(io) {
      if (over || won) return;
      tick++;
      banner = Math.max(0, banner - 1);
      updatePlats();
      if (state === "play") updateHero(io);
      else if (state === "dead") {
        stateT++;
        if (stateT > 20) {
          hero.vy += 0.25;
          hero.y += hero.vy;
        }
        if (stateT > 110) {
          lives--;
          if (lives <= 0) {
            over = true;
            io.gameOver();
            return;
          }
          loadLevel(checkpoint);
          banner = 90;
        }
      } else if (state === "clear") {
        stateT++;
        const ground = 12 * T - hero.h;
        if (hero.y < ground) hero.y = Math.min(ground, hero.y + 2.5);
        else if (stateT > 30) {
          hero.x += 1;
          hero.facing = 1;
          hero.anim += 0.1;
        }
        if (stateT === 60) io.sfx.play("win");
        if (stateT > 150) {
          if (li >= LEVELS.length - 1) {
            won = true;
            io.score(lives * 1000);
            io.win();
            return;
          }
          li++;
          checkpoint = false;
          const big = hero.big;
          loadLevel(false);
          hero.big = big;
          hero.h = big ? 16 : 12;
          hero.y = lv.start.y + 12 - hero.h;
          banner = 150;
        }
      }
      updateMobs(io);
      for (const s of lv.springs) s.t = Math.max(0, s.t - 1);
      for (const b of bumps) b.t++;
      bumps = bumps.filter((b) => b.t < 10);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.color !== "dust") p.vy += p.color === "coin" ? 0.35 : 0.2;
        p.life--;
      }
      parts = parts.filter((p) => p.life > 0);
      for (const p of pops) p.t++;
      pops = pops.filter((p) => p.t < 40);
      // camera looks a little ahead, scrolls both ways
      const target = clamp(hero.x + hero.w / 2 - W / 2 + hero.facing * 20, 0, lv.cols * T - W);
      camX += (target - camX) * 0.1;
      camX = clamp(camX, 0, lv.cols * T - W);
    },

    draw(g: Gfx) {
      const d = lv.def;
      const cam = Math.round(camX);
      // sky bands + parallax backdrop (baked round candy-dome hills, lollipops, a lake, clouds/stars)
      g.clear(d.sky[0]);
      g.rect(0, 70, W, 20, d.sky[1]);
      g.rect(0, 96, W, 128, d.sky[1]);
      if (li === 2) {
        // ROCK CANDY CAVE stays a night cave — gem-coloured stars
        for (let i = 0; i < 20; i++) g.rect(((i * 53 - cam * 0.1) % 300 + 300) % 300 - 20, (i * 37) % 120 + 10, 2, 2, i % 3 ? PAL.cyan : PAL.pink);
      } else if (li === 0) {
        // bright pastel candy-land sky: no sun, no moon — just puffy pink/lilac clouds
        for (let i = 0; i < 6; i++) {
          const x = ((i * 72 - cam * 0.12) % 432 + 432) % 432 - 60;
          const y = 18 + (i * 19) % 46;
          const c = i % 2 ? "#f6cdee" : "#ffffff";
          g.circle(x, y, 9, c);
          g.circle(x + 11, y - 3, 11, c);
          g.circle(x + 23, y, 8, c);
        }
      } else {
        g.circle(210, 40, 14, li === 1 ? "#fff0a0" : "#fff6c8");
        for (let i = 0; i < 5; i++) {
          const x = ((i * 80 - cam * 0.12) % 400 + 400) % 400 - 60;
          const y = 30 + (i * 23) % 50;
          g.circle(x, y, 10, PAL.white);
          g.circle(x + 12, y - 4, 12, PAL.white);
          g.circle(x + 24, y, 9, PAL.white);
        }
      }
      const far = ART.farHills[li];
      const near = ART.nearHills[li];
      drawStrip(g, far, cam * 0.2, 192 - spriteH(far), W);
      // a lake glimpsed in the middle distance, peeking between the far and near hill rows
      for (let yy = 0; yy < 12; yy++) g.rect(0, 168 + yy, W, 1, mixHex("#ffe0f6", "#c87ec0", yy / 11));
      drawStrip(g, near, cam * 0.4, 192 - spriteH(near), W);
      if (li !== 3) {
        for (let i = 0; i < 7; i++) {
          const sp = ART.lollipops[i % ART.lollipops.length];
          const sc = 0.75 + ((i * 37) % 3) * 0.18;
          const spacing = 92;
          const x = ((i * spacing - cam * 0.4) % (spacing * 7) + spacing * 7) % (spacing * 7) - 60;
          g.sprite(sp, x, 190 - spriteH(sp) * sc, { scale: sc });
        }
      }

      g.camera(cam, 0);
      // tiles
      const c0 = Math.floor(cam / T);
      for (let r = 0; r < ROWS; r++) {
        for (let c = c0; c <= c0 + W / T + 1 && c < lv.cols; c++) {
          const ch = lv.grid[r][c];
          if (ch === ".") continue;
          const x = c * T;
          let y = r * T;
          const bmp = bumps.find((b) => b.c === c && b.r === r);
          if (bmp) y -= Math.round(Math.sin((bmp.t / 10) * Math.PI) * 5);
          const above = r > 0 ? lv.grid[r - 1][c] : ".";
          if (ch === "#") {
            g.rect(x, y, T, T, d.dirt);
            if (above !== "#") {
              // thick icing cap with rounded hanging drips
              g.rect(x, y, T, 6, d.icing);
              g.rect(x, y + 5, T, 1, shade(d.icing, -0.18));
              g.circle(x + 3, y + 7, 3, d.icing);
              g.circle(x + 9, y + 8, 3 + (c % 2), d.icing);
              g.circle(x + 13, y + 6, 2, d.icing);
            } else {
              if (r % 2 === 0) g.rect(x, y, T, 1, shade(d.dirt, -0.12));
              const sp = SPRINKLE_DOTS[(c * 7 + r * 3) % SPRINKLE_DOTS.length];
              g.rect(x + ((c * 5) % 11) + 2, y + ((r * 7) % 9) + 3, 3, 2, sp);
              if (hash2(c, r, 42) > 0.5) {
                const sp2 = SPRINKLE_DOTS[(c * 11 + r * 5 + 2) % SPRINKLE_DOTS.length];
                g.rect(x + ((c * 9 + 3) % 11) + 2, y + ((r * 11 + 2) % 9) + 3, 2, 2, sp2);
              }
            }
          } else if (ch === "B") {
            g.rect(x, y, T, T, "#d0763a");
            g.rect(x, y + 7, T, 1, "#7a3a1a");
            g.rect(x, y + 15, T, 1, "#7a3a1a");
            g.rect(x + 7, y, 1, 7, "#7a3a1a");
            g.rect(x + 3, y + 8, 1, 7, "#7a3a1a");
            g.rect(x + 12, y + 8, 1, 7, "#7a3a1a");
            g.rect(x, y, T, 1, "#f0a060");
          } else if (ch === "?" || ch === "P") {
            const shine = Math.floor(tick / 10) % 4 === 0;
            g.sprite(ART.coinFrame, x, y);
            g.text("?", x + 5, y + 4, shine ? "#ffffff" : "#7a2f5a");
          } else if (ch === "U") {
            g.rect(x, y, T, T, PAL.black);
            g.rect(x + 1, y + 1, 14, 14, "#b08a60");
          } else if (ch === "=") {
            g.rect(x, y, T, T, "#e889c8");
            g.rect(x, y, T, 2, "#ffc4ec");
            g.rect(x, y + 14, T, 2, "#a8508a");
            g.rect(x + 5, y + 5, 6, 6, "#ffc4ec");
          } else if (ch === "[" || ch === "]") {
            const top = above !== "[" && above !== "]";
            g.rect(x, y, T, T, PAL.white);
            for (let s = 0; s < 4; s++) g.rect(x, y + ((s * 4 + (ch === "]" ? 2 : 0)) % 16), T, 2, PAL.red);
            if (top) {
              g.rect(ch === "[" ? x - 2 : x, y, T + 2, 5, PAL.red);
              g.rect(ch === "[" ? x - 2 : x, y, T + 2, 1, "#ff9a9a");
            }
            g.rect(ch === "[" ? x : x + 15, y, 1, T, PAL.black);
          } else if (ch === "o") {
            const coin = ART.coins[Math.floor((tick + c * 5) / 8) % 4];
            g.sprite(coin, x + 8 - spriteW(coin) / 2, y + 2);
          }
        }
      }
      // platforms, springs
      for (const p of lv.plats) {
        g.circle(p.x - 2, p.y + 4, 5, "#e85fa0");
        g.circle(p.x + 50, p.y + 4, 5, "#e85fa0");
        g.sprite(ART.candyBeam, p.x, p.y);
      }
      for (const s of lv.springs) {
        const sq = s.t > 6 ? 5 : 0;
        g.rect(s.x + 2, s.y + 7, 12, 3, "#7a2222");
        for (let i = 0; i < 3; i++) g.rect(s.x + 4, s.y + 3 + sq / 2 + i * (2 - sq / 5), 8, 1, PAL.white);
        g.rect(s.x + 1, s.y + sq, 14, 3, PAL.red);
      }
      // checkpoint lollipop + goal flag + candy house
      if (lv.check.x >= 0) {
        const cx = lv.check.x + 8;
        g.rect(cx - 1, lv.check.y - 28, 2, 28, PAL.white);
        g.circle(cx, lv.check.y - 32, 7, checkpoint ? PAL.pink : PAL.grey);
        g.circle(cx, lv.check.y - 32, 4, checkpoint ? PAL.yellow : PAL.dark);
      }
      const gx = lv.goalX;
      g.rect(gx, 3 * T, 3, 9 * T, PAL.white);
      g.circle(gx + 1, 3 * T - 2, 4, PAL.yellow);
      const fy = state === "clear" ? Math.min(11 * T, 3 * T + 4 + stateT * 2.5) : 3 * T + 4;
      for (let i = 0; i < 6; i++) g.rect(gx - 2 - (6 - i) * 2, fy + i * 2, (6 - i) * 2, 2, PAL.pink);
      g.rect(gx + 64, 8 * T, 48, 4 * T, "#ffc4ec");
      for (let i = 0; i < 6; i++) g.rect(gx + 60 + i * 4, 8 * T - 4 - i * 4, 56 - i * 8, 4, i % 2 ? PAL.red : PAL.white);
      g.rect(gx + 82, 10 * T, 12, 2 * T, PAL.brown);
      g.circle(gx + 72, 9 * T, 4, PAL.yellow);
      g.circle(gx + 104, 9 * T, 4, PAL.yellow);

      // mobs (bigger, readable art; collision boxes are unchanged — see `drawBig`)
      for (const m of lv.mobs) {
        if (!m.active) continue;
        const flipY = m.flip;
        if (m.kind === "blob") {
          if (m.dead >= 0 && !m.flip) g.sprite(BLOB_FLAT, m.x, m.y + 6);
          else drawBig(g, (m.tint ? BLOB_PURPLE : BLOB)[Math.floor(m.t / 10) % 2], m.x, m.y, m.w, m.h, 1.3, { flipY });
        } else if (m.kind === "beetle") drawBig(g, BEETLE[Math.floor(m.t / 8) % 2], m.x, m.y, m.w, m.h + 1, 1.3, { flipX: m.vx > 0, flipY });
        else if (m.kind === "shell") {
          const wob = m.vx === 0 && m.t > 340 && Math.floor(m.t / 4) % 2 ? 1 : 0;
          drawBig(g, SHELL, m.x + wob, m.y, m.w, m.h + 2, 1.3, { flipY });
        } else drawBig(g, GUM, m.x, m.y, m.w, m.h, 1.25);
      }
      // hero — same hitbox (hero.w/hero.h), art drawn bigger via drawBig
      const blink = hero.inv > 0 && Math.floor(hero.inv / 3) % 2 === 1;
      if (!blink) {
        const set = hero.big ? HERO.big : HERO.small;
        let f = 0;
        if (state === "dead" || !hero.onGround) f = 2;
        else if (Math.abs(hero.vx) > 0.1) f = Math.floor(hero.anim) % 2;
        const pop = 1 + (hero.pop / 8) * 0.12 * hero.popDir; // a quick squash (landing) / stretch (jump) pop
        const sc = (hero.big ? 1.7 : 1.85) * pop;
        drawBig(g, set[f], hero.x, hero.y, hero.w, hero.h, sc, { flipX: hero.facing < 0, flipY: state === "dead" && stateT > 20 });
      }
      // particles + score pops
      for (const p of parts) {
        if (p.color === "coin") {
          g.rect(p.x, p.y, 6, 10, PAL.orange);
          g.rect(p.x + 1, p.y + 1, 4, 8, PAL.yellow);
        } else if (p.color === "dust") {
          g.circle(p.x - 4 - (12 - p.life) * 0.6, p.y - 2, 2, PAL.white);
          g.circle(p.x + 4 + (12 - p.life) * 0.6, p.y - 2, 2, PAL.white);
        } else g.rect(p.x, p.y, p.size, p.size, p.color);
      }
      for (const p of pops) g.text(p.text, p.x - cam, p.y - p.t * 0.6, PAL.white); // text ignores the camera
      g.camera(0, 0);

      // HUD
      g.rect(0, 0, W, 12, "rgba(13,11,26,0.55)");
      g.text(`♥X${lives}`, 4, 2, PAL.red);
      g.rect(44, 3, 5, 7, PAL.yellow);
      g.text(`X${coins}`, 52, 2, PAL.yellow);
      if (hero.big) g.sprite(GUM, 92, 1, { scale: 1 });
      g.text(`LEVEL ${li + 1}-${LEVELS.length}`, W - 4, 2, PAL.white, { align: "right" });
      const prog = clamp(hero.x / lv.goalX, 0, 1);
      g.rect(112, 5, 40, 3, PAL.dark);
      g.rect(112, 5, 40 * prog, 3, PAL.pink);
      if (banner > 0 && state === "play") {
        g.rect(0, 70, W, 34, "rgba(13,11,26,0.6)");
        g.text(`LEVEL ${li + 1}`, W / 2, 76, PAL.yellow, { align: "center" });
        g.text(d.name, W / 2, 90, PAL.white, { align: "center" });
      }
      if (state === "clear" && stateT > 40) g.text(li >= LEVELS.length - 1 ? "YOU DID IT!" : "LEVEL CLEAR!", W / 2, 80, PAL.yellow, { align: "center", size: 2 });
    },
  };
}

export const jumpyJelly: RetroGameDef = {
  id: "jumpy-jelly",
  title: "Jumpy Jelly",
  blurb: "Hop, stomp and bounce through four candy lands to the flag!",
  genre: "Platformer",
  emoji: "🍬",
  color: "#ff4a4a",
  controls: "◀ ▶ run · A jump (hold = higher) · hold B to run fast · bump ? blocks · stomp blobs · kick shells",
  pad: { dpad: "lr", a: "Jump", b: "Run" },
  create,
};
