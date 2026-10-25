// JUMPY JELLY — a side-scrolling candy platformer. Hop a jelly-bean hero through four
// handcrafted lands: bump "?" candy blocks for coins and gumdrop power-ups, stomp gumdrop
// blobs, kick shelled beetles, ride moving platforms, bounce on springs and reach the
// flag at the end of every level. 100 coins = an extra life. (Original game in the spirit
// of 8-bit platformers.)
import { H, PAL, W, clamp, overlap, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

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
  icing: string;
  dirt: string;
  speed: number;
}
const LEVELS: LevelDef[] = [
  {
    name: "CANDY MEADOW",
    chunks: ["start", "blocks", "hop", "pipes", "heights", "check", "spring", "pyramid", "mixed", "stairs", "finish"],
    sky: ["#6cb6ff", "#a8dcff"],
    hills: ["#8fe07a", "#3ecf55"],
    icing: PAL.lime,
    dirt: "#b0703e",
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

// ── sprites ──
const JP = { k: PAL.black, r: PAL.red, w: PAL.white, p: PAL.pink };
const J_TOP = ["...kkkkkk...", "..krrrrrrk..", ".krwwrrrrrk.", "krwrrrwkrwkk", "krrrrrwkrwkk"];
const J_R5 = "krrrrrrrrrrk";
const J_MID = [J_R5, "krrrrprrrrpk", "krrrrrrkkkrk", "krrrrrrrrrrk"];
const J_BOT = [".krrrrrrrrk.", "..kkkkkkkk.."];
const FEET = ["...kk..kk...", "..kk....kk..", "....kkkk...."];
const jelly = (big: boolean, feet: string) =>
  sprite(big ? [...J_TOP, J_R5, J_R5, ...J_MID, J_R5, J_R5, ...J_BOT, feet] : [...J_TOP, ...J_MID, ...J_BOT, feet], JP);
const HERO = { small: FEET.map((f) => jelly(false, f)), big: FEET.map((f) => jelly(true, f)) };

const BP = { k: PAL.black, g: PAL.green, w: PAL.white };
const BLOB_BODY = ["....kkkk....", "..kkggggkk..", ".kgwggggwgk.", "kggggggggggk", "kgkkggggkkgk", "kgwkggggwkgk", "kggggggggggk", "kggggkkggggk", "kggggggggggk", ".kkkkkkkkkk."];
const BLOB = [sprite([...BLOB_BODY, ".kk......kk."], BP), sprite([...BLOB_BODY, "...kk..kk..."], BP)];
const BLOB_FLAT = sprite([".kkkkkkkkkk.", "kgwgggggwggk", "kgkkggggkkgk", "kggggggggggk", ".kkkkkkkkkk."], BP);
const BEP = { k: PAL.black, p: PAL.purple, w: PAL.white, y: PAL.yellow };
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
  const mob = (kind: MobKind, x: number, y: number): Mob => ({ kind, x, y, vx: -def.speed, vy: 0, w: 12, h: 11, t: 0, active: false, dead: -1, grace: 0, flip: false });
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
  const hero = { x: 0, y: 0, vx: 0, vy: 0, w: 10, h: 12, big: false, onGround: false, coyote: 0, buffer: 0, jumping: false, facing: 1, inv: 0, anim: 0, plat: null as Plat | null };
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
      lv.mobs.push({ kind: "gum", x: c * T + 2, y: r * T, vx: 0.9, vy: 0, w: 12, h: 9, t: 0, active: true, dead: -1, grace: 0, flip: false });
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
      if (!wasGround && hero.vy > 3) parts.push({ x: hero.x + 5, y: hero.y + hero.h, vx: 0, vy: 0, life: 12, color: "dust", size: 3 });
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
          io.sfx.play("hit");
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
      // sky bands + parallax
      g.clear(d.sky[0]);
      g.rect(0, 70, W, 20, d.sky[1]);
      g.rect(0, 96, W, 128, d.sky[1]);
      if (li === 2) {
        for (let i = 0; i < 20; i++) g.rect(((i * 53 - cam * 0.1) % 300 + 300) % 300 - 20, (i * 37) % 120 + 10, 2, 2, i % 3 ? PAL.cyan : PAL.pink);
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
      for (let i = 0; i < 6; i++) {
        const x = ((i * 110 - cam * 0.25) % 660 + 660) % 660 - 80;
        g.circle(x, 200, 70, d.hills[0]);
      }
      for (let i = 0; i < 8; i++) {
        const x = ((i * 76 - cam * 0.5) % 608 + 608) % 608 - 50;
        g.circle(x, 205, 38, d.hills[1]);
        if (li !== 3) {
          // lollipop trees / crystals on the near hills
          g.rect(x - 1, 150, 2, 20, li === 2 ? PAL.purple : PAL.white);
          g.circle(x, 148, 6, li === 2 ? PAL.cyan : i % 2 ? PAL.pink : PAL.orange);
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
              g.rect(x, y, T, 5, d.icing);
              g.rect(x + 3, y + 5, 3, (c % 3) + 2, d.icing);
              g.rect(x + 10, y + 5, 2, ((c + 1) % 3) + 2, d.icing);
            } else {
              const sp = [PAL.yellow, PAL.pink, PAL.cyan, PAL.white][(c * 7 + r * 3) % 4];
              g.rect(x + ((c * 5) % 11) + 2, y + ((r * 7) % 9) + 3, 3, 2, sp);
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
            g.rect(x, y, T, T, PAL.black);
            g.rect(x + 1, y + 1, 14, 14, shine ? "#fff09a" : PAL.yellow);
            g.rect(x + 1, y + 13, 14, 2, PAL.orange);
            g.text("?", x + 5, y + 4, PAL.orange);
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
            const f = Math.floor((tick + c * 5) / 8) % 4;
            const cw = [8, 6, 2, 6][f];
            g.rect(x + 8 - cw / 2, y + 3, cw, 10, PAL.orange);
            g.rect(x + 8 - cw / 2 + (cw > 2 ? 1 : 0), y + 4, Math.max(1, cw - 2), 8, PAL.yellow);
          }
        }
      }
      // platforms, springs
      for (const p of lv.plats) {
        g.rect(p.x, p.y, 48, 8, PAL.pink);
        g.rect(p.x, p.y, 48, 2, "#ffc4ec");
        for (let s = 0; s < 4; s++) g.rect(p.x + 4 + s * 12, p.y + 3, 5, 3, PAL.white);
      }
      for (const s of lv.springs) {
        const sq = s.t > 6 ? 5 : 0;
        g.rect(s.x + 2, s.y + 7, 12, 3, PAL.dark);
        for (let i = 0; i < 3; i++) g.rect(s.x + 4, s.y + 3 + sq / 2 + i * (2 - sq / 5), 8, 1, PAL.grey);
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

      // mobs
      for (const m of lv.mobs) {
        if (!m.active) continue;
        const flipY = m.flip;
        if (m.kind === "blob") {
          if (m.dead >= 0 && !m.flip) g.sprite(BLOB_FLAT, m.x, m.y + 6);
          else g.sprite(BLOB[Math.floor(m.t / 10) % 2], m.x, m.y, { flipY });
        } else if (m.kind === "beetle") g.sprite(BEETLE[Math.floor(m.t / 8) % 2], m.x, m.y - 1, { flipX: m.vx > 0, flipY });
        else if (m.kind === "shell") {
          const wob = m.vx === 0 && m.t > 340 && Math.floor(m.t / 4) % 2 ? 1 : 0;
          g.sprite(SHELL, m.x + wob, m.y + 2, { flipY });
        } else g.sprite(GUM, m.x, m.y);
      }
      // hero
      const blink = hero.inv > 0 && Math.floor(hero.inv / 3) % 2 === 1;
      if (!blink) {
        const set = hero.big ? HERO.big : HERO.small;
        let f = 0;
        if (state === "dead" || !hero.onGround) f = 2;
        else if (Math.abs(hero.vx) > 0.1) f = Math.floor(hero.anim) % 2;
        g.sprite(set[f], hero.x - 1, hero.y, { flipX: hero.facing < 0, flipY: state === "dead" && stateT > 20 });
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
