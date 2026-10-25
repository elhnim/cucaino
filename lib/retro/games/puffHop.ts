// PUFF HOP — an original side-scrolling platformer. A round, puffy cloud-sprite hero bounces
// through candy worlds: A jumps (tap again in the air to puff up and float, flap by flap,
// until the puff runs out), B sucks small critters and blocks in through a mouth cone, B again
// spits whatever's held out as a bouncing star that pops things, and ▼ swallows it — plain
// things just vanish but special critters hand over a copy power (fire breath, a zap ring, a
// sword swipe) used with B until it's spat out (▼+B) or knocked loose by a hit. Four candy
// worlds, each ending with a friendly boss. (Original game, not affiliated with any series.)
import { H, PAL, W, clamp, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, bakeGradient, drawStrip, hash2, mixHex, shade } from "../art";

const T = 16; // tile size
const ROWS = 14; // 14 x 16 = 224 = screen height
const GRAV = 0.3;
const GRAV_FLOAT = 0.05;
const MAXFALL = 5;
const COYOTE = 6;
const BUFFER = 6;
const PUFF_MAX = 6; // flaps per float
const FLAP_VY = -2.1;
const JUMP_VY = -5;
const SOLID = new Set(["#", "=", "x", "^"]);
const HP_MAX = 6;
const ARENA_W = 16; // tiles of flat boss arena appended after the chunks
const INHALE_RANGE = 58;
const CAPTURE_DIST = 11;
const STAR_SPEED = 2.6;

type MobKind = "puff" | "flame" | "spark" | "blade" | "fruit";
type HoldKind = MobKind | "block";
type PowerKind = "flame" | "spark" | "blade";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Mob extends Box {
  kind: MobKind;
  vx: number;
  vy: number;
  t: number;
  active: boolean;
  dead: boolean;
  pulled: boolean;
  flying: boolean;
}
interface StarShot extends Box {
  vx: number;
  vy: number;
  life: number;
  power: PowerKind | null;
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
interface Fx {
  type: PowerKind;
  x: number;
  y: number;
  t: number;
  facing: number;
}
interface Boss {
  type: "tree" | "king";
  name: string;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  range: number;
  t: number;
  active: boolean;
  dead: boolean;
  hitFlash: number;
  fruitColor: string;
}

// ── chunks: 10 rows each = map rows 4..13 (rows 0..3 are open sky), 16 cols ──
// # ground  = floating platform (solid)  x inhalable block  ^ bouncer (solid + launches up)
// o food (heals)  * star (points)  p plain puff critter  f flame critter (copy power)
// z spark critter  b blade critter  C checkpoint  S start
const CH: Record<string, string[]> = {
  // a themed starting gate prepended to every world, so the camera has room to sit the
  // hero about a third in from the left instead of pinned flush against x=0
  margin: [
    ".....",
    ".....",
    ".....",
    "=....",
    "=....",
    "=....",
    "=....",
    "=....",
    "#####",
    "#####",
  ],
  start: [
    "................",
    "................",
    "................",
    "................",
    "......*.........",
    "................",
    "................",
    ".S............o.",
    "################",
    "################",
  ],
  walk1: [
    "................",
    "................",
    "................",
    "................",
    "....p......z....",
    "................",
    "................",
    "................",
    "################",
    "################",
  ],
  gap: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "......****......",
    "................",
    "................",
    "#####......#####",
    "#####......#####",
  ],
  blocks: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "..........xx....",
    "....f.....xx....",
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
    "..p.....======..",
    "################",
    "################",
  ],
  sparkblade: [
    "................",
    "................",
    "................",
    "................",
    "....o......o....",
    "................",
    "................",
    "..z.........b...",
    "################",
    "################",
  ],
  pit2: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....***.........",
    "................",
    "###....#########",
    "###....#########",
  ],
  check: [
    "................",
    "................",
    "................",
    "................",
    "......*.*.*.....",
    "................",
    "................",
    "..C.........p...",
    "################",
    "################",
  ],
  spring: [
    "................",
    "................",
    "..........==....",
    "......==........",
    "................",
    "................",
    "..^.........^...",
    "................",
    "################",
    "################",
  ],
  finish: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "............f...",
    "################",
    "################",
  ],
};

type Theme = "meadow" | "sweets" | "cloud" | "castle";
interface WorldDef {
  name: string;
  theme: Theme;
  chunks: string[];
  sky: [string, string];
  hills: [string, string];
  ground: string;
  icing: string;
  bossType: "tree" | "king";
  bossName: string;
  bossHp: number;
  fruitColor: string;
  speed: number;
}
const WORLDS: WorldDef[] = [
  {
    name: "CANDY MEADOW",
    theme: "meadow",
    chunks: ["start", "walk1", "stairs", "sparkblade", "check", "gap", "blocks", "spring", "pit2", "finish"],
    sky: ["#8fd8ff", "#c9ecff"],
    hills: ["#8fe07a", "#3ecf55"],
    ground: "#8a5a2c",
    icing: "#3ecf55",
    bossType: "tree",
    bossName: "OLD APPLE TREE",
    bossHp: 5,
    fruitColor: PAL.red,
    speed: 0.32,
  },
  {
    name: "SWEET SWEETS",
    theme: "sweets",
    chunks: ["start", "sparkblade", "blocks", "gap", "stairs", "check", "walk1", "spring", "pit2", "finish"],
    sky: ["#ffb3e0", "#ffe8f6"],
    hills: ["#c89aff", "#9a5cff"],
    ground: "#e8b98a",
    icing: PAL.pink,
    bossType: "tree",
    bossName: "GUMMY TREE",
    bossHp: 6,
    fruitColor: PAL.orange,
    speed: 0.38,
  },
  {
    name: "CLOUD KINGDOM",
    theme: "cloud",
    chunks: ["start", "gap", "check", "sparkblade", "spring", "pit2", "stairs", "walk1", "finish"],
    sky: ["#bfe8ff", "#eaf8ff"],
    hills: ["#ffffff", "#dff0ff"],
    ground: "#ffffff",
    icing: "#dff0ff",
    bossType: "king",
    bossName: "CLOUD PUFFER",
    bossHp: 6,
    fruitColor: PAL.cyan,
    speed: 0.42,
  },
  {
    name: "SKY CASTLE",
    theme: "castle",
    chunks: ["start", "stairs", "gap", "sparkblade", "check", "blocks", "spring", "pit2", "walk1", "finish"],
    sky: ["#ffe9a8", "#fff6e0"],
    hills: ["#ffd27a", "#ffb84a"],
    ground: "#8a8aa0",
    icing: "#ffd27a",
    bossType: "king",
    bossName: "CLOUD KING",
    bossHp: 9,
    fruitColor: PAL.pink,
    speed: 0.46,
  },
];

// ── theme backdrops & ground tiles: baked ONCE per theme the first time that world is shown
// (cached in themeArtCache), never at module load and never inside draw() — the arcade imports
// 34 games at once, so only tiny string-building may happen eagerly. A screen-wide strip tiles
// seamlessly at SW px, so drawStrip can scroll it at any parallax speed for free. ──
const SW = 256;
const GROUND_OVERHANG = 6; // how far the grass cap pokes up above its tile, Mario-style

interface ThemeArt {
  sky: Sprite;
  cloudsBack: Sprite;
  cloudsFront: Sprite;
  farRange: Sprite;
  hillsBack: Sprite;
  hillsFront: Sprite;
  groundTop: Sprite[];
  groundUnder: Sprite[];
  floatTile: Sprite;
  blockTile: Sprite;
  bouncer: [Sprite, Sprite];
}
const themeArtCache = new Map<Theme, ThemeArt>();
function getThemeArt(def: WorldDef): ThemeArt {
  let a = themeArtCache.get(def.theme);
  if (!a) {
    a = buildThemeArt(def);
    themeArtCache.set(def.theme, a);
  }
  return a;
}

/** a wrap-around puffy cloud strip: a few overlapping-circle puffs with a bright top highlight
 *  and a soft underside shadow (drawn in that order so the highlight/shadow only shows at each
 *  puff's fringe), checked at x-SW/x/x+SW so puffs crossing the seam still tile cleanly. */
function bakeCloudStrip(w: number, h: number, base: string, spread: number): Sprite {
  const hi = shade(base, 0.45);
  const shadow = shade(base, -0.1);
  type C = [number, number, number];
  const main: C[] = [];
  const hiC: C[] = [];
  const shC: C[] = [];
  [0.16, 0.48, 0.8].forEach((f, i) => {
    const cx = f * w;
    const cy = h * 0.5 + (i % 2 === 0 ? -2 : 3);
    const r = h * (0.26 + (i === 1 ? 0.1 : 0)) * spread;
    for (const [ox, rf] of [
      [-0.95, 0.75],
      [0, 1],
      [0.95, 0.7],
      [0.4, 0.55],
      [-0.4, 0.55],
    ] as [number, number][]) {
      const rr = r * rf;
      const px = cx + ox * r;
      main.push([px, cy, rr]);
      hiC.push([px - rr * 0.3, cy - rr * 0.45, rr * 0.42]);
      shC.push([px, cy + rr * 0.4, rr * 0.82]);
    }
  });
  const hit = (list: C[], x: number, y: number) => {
    for (const dx of [-w, 0, w]) for (const [cx, cy, r] of list) if ((x + dx - cx) ** 2 + (y - cy) ** 2 <= r * r) return true;
    return false;
  };
  return bake(w, h, (x, y) => (hit(hiC, x, y) ? hi : hit(main, x, y) ? base : hit(shC, x, y) ? shadow : null));
}

/** a wrap-around rolling-hill strip: round, overlapping domes (jittered centres/radii, never
 *  identical semicircles) instead of a sine ridge — a sine silhouette reads as sharp mountain
 *  spikes at this scale, domes read as soft candy hills. A thin lit rim traces each dome's top
 *  edge; `textured` adds grass-blade streaks just under the rim plus the odd flower. */
function bakeHillStrip(w: number, h: number, base: string, baseY: number, count: number, rMin: number, rMax: number, seed: number, textured: boolean, flower?: string): Sprite {
  const rim = shade(base, 0.26);
  const blade = shade(base, -0.1);
  type C = [number, number, number];
  const domes: C[] = Array.from({ length: count }, (_, i) => {
    const cx = ((i + 0.5) / count) * w + (hash2(i, seed, 3) - 0.5) * (w / count) * 0.6;
    const r = rMin + hash2(i, seed, 7) * (rMax - rMin);
    return [cx, baseY + (hash2(i, seed, 13) - 0.5) * 6, r];
  });
  const inDome = (x: number, y: number) => {
    for (const dx of [-w, 0, w]) for (const [cx, cy, r] of domes) if ((x + dx - cx) ** 2 + (y - cy) ** 2 <= r * r) return true;
    return false;
  };
  return bake(w, h, (x, y) => {
    if (!inDome(x, y)) return null;
    if (!inDome(x, y - 2)) return rim;
    if (textured) {
      if (!inDome(x, y - 7) && (x + y) % 5 < 2) return blade;
      if (flower && !inDome(x, y - 5) && hash2(x, 19, seed) < 0.05) return flower;
    }
    return base;
  });
}

/** the ground tile the kid stands on: a thick overhanging cap (grass / icing drizzle / stone
 *  battlement / cloud puff, by theme) over a textured body (soil with stones+roots+strata,
 *  a chocolate-chip biscuit, coarse masonry, or soft cloud fluff). `variant` just reseeds the
 *  noise so a few baked tiles can be mixed so the ground isn't visibly repeating. */
function bakeGroundTop(theme: Theme, def: WorldDef, variant: number): Sprite {
  const h = T + GROUND_OVERHANG;
  const cap = def.icing;
  const capHi = shade(cap, 0.3);
  const capLo = shade(cap, -0.18);
  const body = def.ground;
  const bodyHi = shade(body, 0.14);
  const bodyLo = shade(body, -0.2);
  return bake(T, h, (x, y) => {
    if (theme === "cloud") {
      const wob = Math.sin(x * 0.9 + variant * 3) * 2;
      const capLine = GROUND_OVERHANG - 2 + wob;
      if (y < capLine) return null;
      if (y < capLine + 5) return y < capLine + 1 ? capHi : "#ffffff";
      const n = hash2(x, y - capLine + variant * 9, 21);
      return n > 0.82 ? bodyHi : body;
    }
    if (theme === "castle") {
      if (y < GROUND_OVERHANG - 2) return null;
      if (y < GROUND_OVERHANG + 2) return y < GROUND_OVERHANG - 1 ? capHi : cap;
      const brick = (x + (Math.floor((y + variant * 2) / 4) % 2) * 3) % 8 < 1 || y % 4 === 0;
      return brick ? bodyLo : body;
    }
    if (theme === "sweets") {
      const wob = Math.sin(x * 1.1 + variant * 5) * 1.5;
      const capLine = GROUND_OVERHANG - 1 + wob;
      if (y < capLine) return hash2(x, variant, 6) < 0.3 && y > capLine - 3 ? capHi : null;
      if (y < capLine + 4) return y < capLine + 1 ? capHi : cap;
      const sy = y - (capLine + 4);
      const n = hash2(x, sy + variant * 13, 17);
      if (n > 0.9) return "#5a3a22";
      return sy % 5 === 0 ? bodyLo : body;
    }
    // meadow: a thick grass cap with a few tufts poking above the line, over soil full of
    // stone flecks, root-dark specks and horizontal strata bands
    const wob = Math.sin(x * 1.3 + variant * 7) * 1.6;
    const capLine = GROUND_OVERHANG - 2 + wob;
    if (y < capLine) return hash2(x, variant, 5) < 0.3 && y > capLine - 3 ? capLo : null;
    if (y < capLine + 2) return capHi;
    if (y < capLine + 5) return cap;
    if (y < GROUND_OVERHANG + 7) return capLo;
    const sy = y - (GROUND_OVERHANG + 7);
    const n = hash2(x, sy + variant * 13, 9);
    if (n > 0.93) return bodyLo;
    if (n < 0.06) return bodyHi;
    if (sy % 6 === 0) return bodyLo;
    return body;
  });
}
/** the same ground, one tile below the surface: no cap, just the textured body. */
function bakeGroundUnder(theme: Theme, def: WorldDef, variant: number): Sprite {
  const body = def.ground;
  const bodyHi = shade(body, 0.1);
  const bodyLo = shade(body, -0.18);
  return bake(T, T, (x, y) => {
    if (theme === "cloud") {
      const n = hash2(x, y + variant * 9, 21);
      return n > 0.82 ? bodyHi : body;
    }
    if (theme === "castle") {
      const brick = (x + (Math.floor((y + variant * 2) / 4) % 2) * 3) % 8 < 1 || y % 4 === 0;
      return brick ? bodyLo : body;
    }
    const n = hash2(x, y + variant * 13, theme === "sweets" ? 17 : 9);
    if (n > (theme === "sweets" ? 0.92 : 0.93)) return theme === "sweets" ? "#5a3a22" : bodyLo;
    if (n < 0.06) return bodyHi;
    if (y % 6 === variant % 6) return bodyLo;
    return body;
  });
}
function bakeFloatTile(theme: Theme, def: WorldDef): Sprite {
  const icing = def.icing;
  return bake(T, T, (x, y) => {
    const cx = x + 0.5;
    const cy = y + 0.5;
    if (theme === "sweets") {
      if (y < 3) return icing;
      if ((x === 3 || x === 4) && y >= 3 && y < 8) return icing;
      if ((x === 10 || x === 11) && y >= 2 && y < 8) return icing;
      return "#f2c48d";
    }
    if (theme === "cloud") {
      const inC = (ccx: number, ccy: number, r: number) => (cx - ccx) ** 2 + (cy - ccy) ** 2 <= r * r;
      if (inC(8, 5, 8)) return shade("#ffffff", 0.2);
      if (inC(4, 9, 6.5) || inC(12, 9, 6.5)) return "#ffffff";
      return null;
    }
    if (theme === "castle") {
      if (y === 0) return "#c8c8dc";
      if (y < 3) return "#b0b0c4";
      return y % 4 === 0 ? shade("#9a9ab0", -0.12) : "#9a9ab0";
    }
    if (y < 3) return icing;
    if (y === 3) return shade(icing, -0.15);
    return hash2(x, y, 31) > 0.85 ? shade("#8a5a2c", -0.15) : "#8a5a2c";
  });
}
function bakeBlockTile(theme: Theme): Sprite {
  const edge = (x: number, y: number) => x < 1 || y < 1 || x > T - 2 || y > T - 2;
  return bake(T, T, (x, y) => {
    const cx = x + 0.5;
    const cy = y + 0.5;
    if (theme === "sweets") {
      if (edge(x, y)) return "#caa06a";
      if ((cx - 5) ** 2 + (cy - 5) ** 2 <= 1.4) return "#8a5a2c";
      if ((cx - 11) ** 2 + (cy - 9) ** 2 <= 1.4) return "#8a5a2c";
      if ((cx - 8) ** 2 + (cy - 11) ** 2 <= 1.4) return "#8a5a2c";
      return hash2(x, y, 41) > 0.9 ? shade("#e8c48a", -0.1) : "#e8c48a";
    }
    if (theme === "cloud") {
      if ((cx - 8) ** 2 + (cy - 8) ** 2 <= 49) return "#eaf8ff";
      if (edge(x, y)) return "#9ecfe8";
      return "#bfe8ff";
    }
    if (theme === "castle") {
      if (edge(x, y)) return "#7a7a90";
      if (y === 8 || x === 8) return "#9a9ab0";
      return hash2(x, y, 51) > 0.88 ? shade("#b0b0c4", 0.08) : "#b0b0c4";
    }
    if (edge(x, y)) return "#8a6a3a";
    return hash2(x, y, 51) > 0.88 ? shade("#caa06a", -0.15) : "#caa06a";
  });
}
/** a bouncer tile: mushroom (meadow), gumdrop (sweets), cloud puff (cloud), banner (castle) —
 *  two baked bob frames so the idle animation is a sprite swap, not per-frame circle math. */
function bakeBouncer(theme: Theme, bob: number): Sprite {
  const oy = bob; // bob offset (0 or 1 px), matching the old animation
  return bake(T, 16, (x, y) => {
    const cx = x + 0.5;
    const cy = y + 0.5 - oy;
    const inC = (ccx: number, ccy: number, r: number) => (cx - ccx) ** 2 + (cy - ccy) ** 2 <= r * r;
    if (theme === "sweets") {
      if (inC(8, 10, 6)) return inC(8, 10, 3) ? "#ffffff" : shade(PAL.pink, -0.1);
      return null;
    }
    if (theme === "cloud") {
      if (inC(8, 10, 7) || inC(5, 9, 3) || inC(11, 9, 3)) return inC(7, 8, 3) ? shade("#ffffff", 0.3) : "#ffffff";
      return null;
    }
    if (theme === "castle") {
      if (x >= 3 && x <= 12 && y >= 3 - oy && y <= 5 - oy) return PAL.red;
      if (x >= 6 && x <= 9 && y >= 4 - oy && y <= 13 - oy) return shade(PAL.red, -0.12);
      return null;
    }
    if (x >= 6 && x <= 9 && y >= 8 - oy && y <= 13 - oy) return "#f2c48d";
    if (inC(8, 4 - oy, 7)) return inC(8, 3 - oy, 7) && cy < 4 - oy ? shade(PAL.red, 0.18) : PAL.red;
    if (inC(5, 3 - oy, 1.2) || inC(11, 3 - oy, 1.2) || inC(8, 5 - oy, 1.2)) return PAL.white;
    return null;
  });
}
function buildThemeArt(def: WorldDef): ThemeArt {
  const theme = def.theme;
  const skyStops = [def.sky[0], mixHex(def.sky[0], def.sky[1], 0.5), def.sky[1]];
  const sky = bakeGradient(SW, H, skyStops);
  const cloudCol = theme === "castle" ? "#fff6e0" : theme === "sweets" ? "#fff0fa" : "#ffffff";
  const cloudsBack = bakeCloudStrip(SW, 34, cloudCol, 0.6);
  const cloudsFront = bakeCloudStrip(SW, 44, cloudCol, 0.95);
  const farBase = mixHex(def.hills[0], def.sky[1], 0.4);
  const farRange = bakeHillStrip(SW, 58, farBase, 48, 4, 26, 36, 1, false);
  const hillsBack = bakeHillStrip(SW, 88, def.hills[0], 78, 5, 36, 48, 2, true);
  const hillsFront = bakeHillStrip(SW, 100, def.hills[1], 86, 5, 24, 31, 3, true, theme === "meadow" ? "#ff8f7a" : undefined);
  const groundTop = [0, 1, 2].map((v) => bakeGroundTop(theme, def, v));
  const groundUnder = [0, 1].map((v) => bakeGroundUnder(theme, def, v));
  return {
    sky,
    cloudsBack,
    cloudsFront,
    farRange,
    hillsBack,
    hillsFront,
    groundTop,
    groundUnder,
    floatTile: bakeFloatTile(theme, def),
    blockTile: bakeBlockTile(theme),
    bouncer: [bakeBouncer(theme, 0), bakeBouncer(theme, 1)],
  };
}

// ── hero sprite: a big round, puffy cloud, drawn from repeat-counts so every row comes
// out exactly 18 wide (no hand-counted pixel art to miscount) ──
const CP = (cheek: string) => ({ k: PAL.black, w: PAL.white, c: cheek });
const rep = (ch: string, n: number) => ch.repeat(Math.max(0, n));
const bodyRow = (margin: number, mid: string) => rep(".", margin) + "k" + mid + "k" + rep(".", margin);
const MID_PLAIN = rep("w", 14);
const MID_EYES = rep("w", 2) + rep("k", 2) + rep("w", 6) + rep("k", 2) + rep("w", 2);
const MID_CHEEKS = rep("w", 3) + rep("c", 2) + rep("w", 4) + rep("c", 2) + rep("w", 3);
const MOUTH_SHUT = [bodyRow(1, rep("w", 5) + rep("k", 4) + rep("w", 5)), bodyRow(1, MID_PLAIN)];
const MOUTH_O = [bodyRow(1, rep("w", 6) + rep("k", 2) + rep("w", 6)), bodyRow(1, rep("w", 5) + rep("k", 4) + rep("w", 5))];
const MOUTH_OPEN = [bodyRow(1, rep("w", 3) + rep("k", 8) + rep("w", 3)), bodyRow(1, rep("w", 3) + rep("k", 8) + rep("w", 3))];
const BUMPS = rep(".", 2) + rep("k", 2) + rep(".", 2) + rep("k", 2) + rep(".", 2) + rep("k", 2) + rep(".", 2) + rep("k", 2) + rep(".", 2);
const PLAIN = bodyRow(1, MID_PLAIN);
const EYES = bodyRow(1, MID_EYES);
const CHEEKS = bodyRow(1, MID_CHEEKS);
const TOP2 = bodyRow(2, rep("w", 12));
const TAPER2 = bodyRow(3, rep("w", 10));
const TAPER3 = bodyRow(4, rep("w", 8));
const feetRow = (gap: number) => {
  const margin = (14 - gap) / 2;
  return rep(".", margin) + "kk" + rep(".", gap) + "kk" + rep(".", margin);
};
const bodyRows = (mouth: string[], feet: string) => [BUMPS, TOP2, PLAIN, EYES, CHEEKS, PLAIN, mouth[0], mouth[1], TOP2, TAPER2, TAPER3, feet];
if (bodyRows(MOUTH_SHUT, feetRow(2)).some((row) => row.length !== 18)) throw new Error("puffHop: hero sprite rows must all be 18 wide");
/** turns the flat white body fill into 3 tones (lit from the top-left, like every other baked
 *  shape here) — a bright highlight on the upper-left puff, a soft shadow on the lower-right
 *  underside, a gentle off-white in between — without touching the outline/eyes/cheek pixels. */
function shadeBody(s: Sprite): Sprite {
  const w = s.rows[0]?.length ?? 0;
  const h = s.rows.length;
  const rows = s.rows.map((row, y) =>
    row
      .split("")
      .map((ch, x) => {
        if (ch !== "w") return ch;
        const cx = x - w / 2;
        if (y <= 2 && cx <= 1) return "h";
        if (y >= h - 3 || cx >= 4) return "s";
        return "w";
      })
      .join(""),
  );
  const mid = "#f4f7ff";
  return sprite(rows, { ...s.pal, w: mid, h: "#ffffff", s: shade(mid, -0.16) });
}
const puffSprite = (mouth: string[], feet: string, cheek: string = PAL.pink) => shadeBody(sprite(bodyRows(mouth, feet), CP(cheek)));
const HERO_WALK = [puffSprite(MOUTH_SHUT, feetRow(4)), puffSprite(MOUTH_SHUT, feetRow(0))];
const HERO_AIR = puffSprite(MOUTH_SHUT, feetRow(0));
const HERO_INHALE = puffSprite(MOUTH_OPEN, feetRow(2));
const HERO_PUFFED = puffSprite(MOUTH_O, feetRow(2));
const CHEEK: Record<HoldKind, string> = { puff: PAL.pink, flame: PAL.orange, spark: PAL.yellow, blade: PAL.grey, fruit: PAL.red, block: PAL.tan };
const HERO_FULL: Record<HoldKind, ReturnType<typeof sprite>> = Object.fromEntries(
  (Object.keys(CHEEK) as HoldKind[]).map((k) => [k, puffSprite(MOUTH_SHUT, feetRow(2), CHEEK[k])]),
) as Record<HoldKind, ReturnType<typeof sprite>>;
const HERO_SPRITE_W = 18;
const HERO_SPRITE_H = 12;

function buildWorld(wi: number, r: ReturnType<typeof rng>) {
  const def = WORLDS[wi];
  const rows: string[] = new Array(ROWS).fill("");
  for (const name of ["margin", ...def.chunks]) {
    const ch = CH[name];
    const w = ch[0].length;
    for (let row = 0; row < ROWS; row++) {
      const src = row < ROWS - ch.length ? "" : ch[row - (ROWS - ch.length)];
      rows[row] += src.padEnd(w, ".").slice(0, w);
    }
  }
  for (let row = 0; row < ROWS; row++) rows[row] += (row === ROWS - 2 || row === ROWS - 1 ? "#" : ".").repeat(ARENA_W);
  const cols = rows[0].length;
  const grid = rows.map((row) => row.split(""));
  const mobs: Mob[] = [];
  let start = { x: 90, y: 170 };
  let checkpoint = { x: -1, y: 0 };
  const mkMob = (kind: MobKind, x: number, y: number): Mob => ({ kind, x, y, w: 18, h: 16, vx: kind === "blade" ? 0 : -def.speed, vy: 0, t: 0, active: false, dead: false, pulled: false, flying: false });
  const arenaStartX = (cols - ARENA_W) * T;
  for (let row = 0; row < ROWS; row++) {
    for (let c = 0; c < cols - ARENA_W; c++) {
      const ch = grid[row][c];
      const bx = c * T;
      const by = (row + 1) * T;
      if (ch === "S") start = { x: bx + 1, y: by - 20 };
      else if (ch === "p" || ch === "f" || ch === "z" || ch === "b") mobs.push(mkMob(ch === "p" ? "puff" : ch === "f" ? "flame" : ch === "z" ? "spark" : "blade", bx, by - 17));
      else if (ch === "C") checkpoint = { x: bx, y: by };
      else continue;
      grid[row][c] = ".";
    }
  }
  // guarantee there's always something to inhale within about half a screen's walk
  const kinds: MobKind[] = ["puff", "flame", "spark", "blade"];
  for (let col = 8; col < cols - ARENA_W - 3; col += 8) {
    if (mobs.some((m) => Math.abs(m.x - col * T) < 7 * T)) continue;
    let row = 4;
    while (row < ROWS - 1 && !SOLID.has(grid[row + 1][col])) row++;
    if (row >= ROWS - 1) continue;
    mobs.push(mkMob(kinds[Math.floor(r.next() * kinds.length)], col * T, row * T - 17));
  }
  const boss: Boss =
    def.bossType === "tree"
      ? { type: "tree", name: def.bossName, hp: def.bossHp, maxHp: def.bossHp, x: arenaStartX + (ARENA_W - 5) * T, y: (ROWS - 2) * T, baseX: 0, baseY: 0, range: 0, t: r.int(0, 30), active: false, dead: false, hitFlash: 0, fruitColor: def.fruitColor }
      : { type: "king", name: def.bossName, hp: def.bossHp, maxHp: def.bossHp, x: 0, y: 0, baseX: arenaStartX + ARENA_W * T * 0.55, baseY: 68, range: ARENA_W * T * 0.3, t: r.int(0, 30), active: false, dead: false, hitFlash: 0, fruitColor: def.fruitColor };
  const bgStars = Array.from({ length: 12 }, () => ({ x: r.range(0, cols * T), y: r.range(8, 64), s: r.pick([1, 1, 2]) }));
  return { def, grid, cols, mobs, start, checkpoint, doorX: (cols - 2) * T, arenaStartX, boss, bgStars };
}
type Level = ReturnType<typeof buildWorld>;

function bossHurtbox(b: Boss): Box {
  return b.type === "tree" ? { x: b.x - 18, y: b.y - 74, w: 40, h: 78 } : { x: b.x - 24, y: b.y - 20, w: 48, h: 40 };
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  let wi = 0;
  let lvl: Level = buildWorld(0, r);
  let lives = 3;
  let hp = HP_MAX;
  let over = false;
  let won = false;
  let checkpointReached = false;
  let tick = 0;
  let camX = 0;
  let banner = 150;
  let phase: "play" | "clear" = "play";
  let stateT = 0;
  const hero = {
    x: lvl.start.x,
    y: lvl.start.y,
    vx: 0,
    vy: 0,
    w: 12,
    h: 13,
    onGround: false,
    coyote: 0,
    buffer: 0,
    jumping: false,
    facing: 1,
    inv: 0,
    anim: 0,
    puffed: false,
    puffCharges: PUFF_MAX,
    inhaling: false,
    hold: null as HoldKind | null,
    power: null as PowerKind | null,
    powerCD: 0,
    // purely cosmetic squash/stretch pulse: >0 squashes (just landed), <0 stretches (just
    // launched); eases back to 0 every frame. Never read by physics/collision.
    squash: 0,
  };
  let lastSafe = { x: hero.x, y: hero.y };
  // keep the hero about a third of the way in from the left, with a little look-ahead in
  // the direction of travel, clamped so it never shows past the level's edges
  const camTarget = () => clamp(hero.x - W / 3 + hero.facing * 16, 0, lvl.cols * T - W);
  let parts: Part[] = [];
  let pops: Pop[] = [];
  let stars: StarShot[] = [];
  let fx: Fx[] = [];

  const resetHero = (p: { x: number; y: number }) => {
    hero.x = p.x;
    hero.y = p.y;
    hero.vx = 0;
    hero.vy = 0;
    hero.puffed = false;
    hero.puffCharges = PUFF_MAX;
    hero.hold = null;
    hero.power = null;
    hero.powerCD = 0;
    hero.inv = 120;
    hero.facing = 1;
    lastSafe = { x: p.x, y: p.y };
  };

  const loadWorld = (wIndex: number) => {
    wi = wIndex;
    lvl = buildWorld(wi, r);
    resetHero(lvl.start);
    hp = HP_MAX;
    checkpointReached = false;
    camX = camTarget();
    phase = "play";
    stateT = 0;
    banner = 140;
    parts = [];
    pops = [];
    stars = [];
    fx = [];
  };

  // ── tile collision (shared by hero, mobs and falling fruit) ──
  const tileAt = (px: number, py: number) => {
    const c = Math.floor(px / T);
    const row = Math.floor(py / T);
    if (c < 0 || c >= lvl.cols) return "#";
    if (row < 0 || row >= ROWS) return ".";
    return lvl.grid[row][c];
  };
  const solidAt = (px: number, py: number) => SOLID.has(tileAt(px, py));
  const moveX = (e: Box, dx: number) => {
    e.x += dx;
    if (dx > 0) {
      const right = e.x + e.w - 0.01;
      if (solidAt(right, e.y + 1) || solidAt(right, e.y + e.h - 1)) {
        e.x = Math.floor(right / T) * T - e.w;
        return true;
      }
    } else if (dx < 0) {
      if (solidAt(e.x, e.y + 1) || solidAt(e.x, e.y + e.h - 1)) {
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

  const heroBox = (): Box => ({ x: hero.x, y: hero.y, w: hero.w, h: hero.h });
  const burst = (x: number, y: number, color: string, n: number, spd = 1.6) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + tick;
      parts.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 1, life: 22, color, size: 2 });
    }
  };
  const addScore = (io: IO, pts: number, x: number, y: number) => {
    io.score(pts);
    pops.push({ x, y, t: 0, text: String(pts) });
  };

  const hitHero = (io: IO, dmg: number, pit = false) => {
    if (hero.inv > 0 || phase !== "play") return;
    hp -= dmg;
    hero.inv = 100;
    io.sfx.play("hurt");
    burst(hero.x + hero.w / 2, hero.y + hero.h / 2, PAL.white, 8);
    if (hero.power) {
      stars.push({ x: hero.x, y: hero.y, w: 7, h: 7, vx: -hero.facing * 2, vy: -2, life: 260, power: hero.power });
      hero.power = null;
    }
    if (hp <= 0) {
      lives--;
      if (lives <= 0) {
        over = true;
        io.gameOver();
        return;
      }
      hp = HP_MAX;
      resetHero(checkpointReached ? lvl.checkpoint : lvl.start);
      camX = camTarget();
    } else if (pit) {
      hero.x = lastSafe.x;
      hero.y = lastSafe.y;
      hero.vx = 0;
      hero.vy = 0;
      hero.puffed = false;
    }
  };

  const popMob = (io: IO, m: Mob) => {
    if (m.dead) return;
    m.dead = true;
    io.sfx.play("pop");
    addScore(io, 100, m.x, m.y - 6);
    burst(m.x + m.w / 2, m.y + m.h / 2, mobColor(m.kind, lvl.boss.fruitColor), 7);
  };
  const damageBoss = (io: IO, amt: number) => {
    const b = lvl.boss;
    if (!b.active || b.dead) return;
    b.hp -= amt;
    b.hitFlash = 12;
    io.sfx.play("thud");
    burst(b.x, b.y - 30, PAL.white, 6, 1);
    if (b.hp <= 0) {
      b.dead = true;
      io.sfx.play("explode");
      io.sfx.play("cheer");
      addScore(io, 2000, b.x, b.y - 40);
      burst(b.x, b.y - 30, PAL.yellow, 18, 2.5);
    }
  };

  const inCone = (mx: number, my: number, tx: number, ty: number, facing: number) => {
    const dx = tx - mx;
    if (facing > 0 && dx < -6) return false;
    if (facing < 0 && dx > 6) return false;
    if (Math.abs(dx) > INHALE_RANGE) return false;
    if (Math.abs(ty - my) > 20) return false;
    return true;
  };
  const capture = (io: IO, kind: HoldKind, x: number, y: number) => {
    hero.hold = kind;
    hero.inhaling = false;
    io.sfx.play("blip");
    burst(x, y, mobColor(kind === "block" ? "puff" : kind, lvl.boss.fruitColor), 8, 1.2);
  };
  const doInhale = (io: IO) => {
    const facing = hero.facing;
    const mx = hero.x + (facing > 0 ? hero.w + 2 : -2);
    const my = hero.y + hero.h * 0.5;
    if (tick % 18 === 0) io.sfx.tone(180, 90, "triangle", 0.18);
    for (let d = 1; d <= 2; d++) {
      const tx = Math.floor((mx + facing * d * T) / T);
      const ty = Math.floor(my / T);
      if (lvl.grid[ty]?.[tx] === "x") {
        lvl.grid[ty][tx] = ".";
        capture(io, "block", tx * T + 8, ty * T + 8);
        return;
      }
    }
    let target: Mob | null = null;
    let best = INHALE_RANGE + 1;
    for (const m of lvl.mobs) {
      if (!m.active || m.dead) continue;
      const cx = m.x + m.w / 2;
      const cy = m.y + m.h / 2;
      if (!inCone(mx, my, cx, cy, facing)) continue;
      const dd = Math.abs(cx - mx);
      if (dd < best) {
        best = dd;
        target = m;
      }
    }
    if (target) {
      const cx = target.x + target.w / 2;
      const cy = target.y + target.h / 2;
      const dx = mx - cx;
      const dy = my - cy;
      const dd = Math.hypot(dx, dy) || 1;
      if (dd < CAPTURE_DIST) {
        capture(io, target.kind, cx, cy);
        target.dead = true;
      } else {
        target.x += (dx / dd) * 3.1;
        target.y += (dy / dd) * 3.1;
        target.pulled = true;
      }
    }
    if (tick % 2 === 0) parts.push({ x: mx + facing * 26, y: my + ((tick * 7) % 14) - 7, vx: -facing * 3.2, vy: 0, life: 9, color: "suck", size: 2 });
  };
  const swallow = (io: IO) => {
    const k = hero.hold;
    hero.hold = null;
    if (k === "flame" || k === "spark" || k === "blade") {
      hero.power = k;
      hero.powerCD = 0;
      io.sfx.play("powerup");
      burst(hero.x + hero.w / 2, hero.y, PAL.yellow, 10);
    } else io.sfx.play("pickup");
  };
  const spit = (io: IO) => {
    const mx = hero.x + (hero.facing > 0 ? hero.w : -8);
    stars.push({ x: mx, y: hero.y + hero.h * 0.4, w: 7, h: 7, vx: hero.facing * STAR_SPEED, vy: -1.5, life: 220, power: null });
    hero.hold = null;
    io.sfx.play("shoot");
  };
  const ejectPower = (io: IO) => {
    const mx = hero.x + (hero.facing > 0 ? hero.w : -8);
    stars.push({ x: mx, y: hero.y + hero.h * 0.4, w: 7, h: 7, vx: hero.facing * 2.3, vy: -2, life: 260, power: hero.power });
    hero.power = null;
    io.sfx.play("whoosh");
  };
  const usePower = (io: IO, type: PowerKind) => {
    const facing = hero.facing;
    const box: Box =
      type === "spark"
        ? { x: hero.x - 22, y: hero.y - 22, w: hero.w + 44, h: hero.h + 44 }
        : { x: hero.x + (facing > 0 ? hero.w : -28), y: hero.y - 4, w: 28, h: hero.h + 8 };
    for (const m of lvl.mobs) if (!m.dead && overlap(box, m)) popMob(io, m);
    if (overlap(box, bossHurtbox(lvl.boss))) damageBoss(io, 1);
    fx.push({ type, x: hero.x + hero.w / 2, y: hero.y + hero.h / 2, t: 0, facing });
    io.sfx.play(type === "spark" ? "zap" : type === "blade" ? "kick" : "whoosh");
  };

  const updateHero = (io: IO) => {
    const inp = io.input;
    const maxV = 1.4;
    const acc = hero.onGround ? 0.14 : 0.1;
    if (inp.held.left && !inp.held.right) {
      hero.vx = Math.max(-maxV, hero.vx - acc);
      hero.facing = -1;
    } else if (inp.held.right && !inp.held.left) {
      hero.vx = Math.min(maxV, hero.vx + acc);
      hero.facing = 1;
    } else {
      hero.vx *= hero.onGround ? 0.78 : 0.95;
      if (Math.abs(hero.vx) < 0.05) hero.vx = 0;
    }

    hero.buffer = inp.pressed.a ? BUFFER : Math.max(0, hero.buffer - 1);
    hero.coyote = hero.onGround ? COYOTE : Math.max(0, hero.coyote - 1);
    if (hero.buffer > 0 && hero.coyote > 0) {
      hero.vy = JUMP_VY;
      hero.buffer = 0;
      hero.coyote = 0;
      hero.onGround = false;
      hero.jumping = true;
      hero.puffed = false;
      hero.puffCharges = PUFF_MAX;
      hero.squash = -6;
      io.sfx.play("jump");
    } else if (inp.pressed.a && !hero.onGround && hero.puffCharges > 0) {
      hero.puffed = true;
      hero.vy = FLAP_VY;
      hero.puffCharges--;
      hero.squash = -4;
      io.sfx.play("bounce");
      burst(hero.x + hero.w / 2, hero.y + hero.h, PAL.white, 4, 0.8);
      if (hero.puffCharges <= 0) {
        hero.puffed = false;
        io.sfx.slide?.(640, 260, 140, "sine", 0.22);
      }
    }
    if (hero.jumping && !inp.held.a && hero.vy < -2) hero.vy = -2;
    hero.vy = Math.min(MAXFALL, hero.vy + (hero.puffed ? GRAV_FLOAT : GRAV));

    if (moveX(hero, hero.vx)) hero.vx = 0;
    hero.anim += Math.abs(hero.vx) * 0.09;
    if (hero.onGround && Math.abs(hero.vx) > 0.3 && tick % 14 === 0) io.sfx.play("step");
    hero.onGround = false;
    const res = moveY(hero, hero.vy);
    if (res === 1) {
      const landTile = tileAt(hero.x + hero.w / 2, hero.y + hero.h + 1);
      if (landTile === "^") {
        hero.vy = -7.2;
        hero.onGround = false;
        hero.jumping = true;
        hero.squash = -7;
        io.sfx.play("bounce");
        burst(hero.x + hero.w / 2, hero.y + hero.h, PAL.white, 6);
      } else {
        hero.vy = 0;
        hero.onGround = true;
        hero.jumping = false;
        hero.squash = 8;
        lastSafe = { x: hero.x, y: hero.y };
      }
      hero.puffed = false;
      hero.puffCharges = PUFF_MAX;
    } else if (res === -1) hero.vy = 0.5;

    // pickups: food heals, stars score
    for (const [px, py] of [
      [hero.x + 2, hero.y + 2],
      [hero.x + hero.w - 2, hero.y + 2],
      [hero.x + 2, hero.y + hero.h - 2],
    ]) {
      const c = Math.floor(px / T);
      const row = Math.floor(py / T);
      const ch = lvl.grid[row]?.[c];
      if (ch === "o") {
        lvl.grid[row][c] = ".";
        hp = Math.min(HP_MAX, hp + 1);
        io.sfx.play("pickup");
        burst(c * T + 8, row * T + 8, PAL.pink, 6);
      } else if (ch === "*") {
        lvl.grid[row][c] = ".";
        addScore(io, 50, c * T + 8, row * T);
        io.sfx.play("coin");
      }
    }

    hero.inv = Math.max(0, hero.inv - 1);
    if (hero.y > H + 20) hitHero(io, 1, true);
    if (!checkpointReached && lvl.checkpoint.x >= 0 && hero.x > lvl.checkpoint.x) {
      checkpointReached = true;
      io.sfx.play("blip");
      addScore(io, 100, lvl.checkpoint.x, lvl.checkpoint.y - 30);
    }

    // mouth state machine: power in use, something held, or free to inhale
    if (hero.power) {
      hero.powerCD = Math.max(0, hero.powerCD - 1);
      if (inp.held.down && inp.pressed.b) ejectPower(io);
      else if (hero.power === "flame" && inp.held.b && hero.powerCD === 0) {
        usePower(io, "flame");
        hero.powerCD = 8;
      } else if ((hero.power === "spark" || hero.power === "blade") && inp.pressed.b && hero.powerCD === 0) {
        usePower(io, hero.power);
        hero.powerCD = hero.power === "spark" ? 42 : 18;
      }
      hero.inhaling = false;
    } else if (hero.hold) {
      if (inp.pressed.down) swallow(io);
      else if (inp.pressed.b) spit(io);
      hero.inhaling = false;
    } else {
      hero.inhaling = inp.held.b;
      if (hero.inhaling) doInhale(io);
    }

    if (phase === "play" && lvl.boss.dead && hero.x + hero.w >= lvl.doorX) {
      phase = "clear";
      stateT = 0;
    }
  };

  const updateMobs = (io: IO) => {
    const hb = heroBox();
    for (const m of lvl.mobs) {
      if (!m.active) {
        if (m.x < camX + W + 24) m.active = true;
        else continue;
      }
      m.t++;
      if (m.pulled) {
        m.pulled = false;
        continue;
      }
      if (m.kind === "fruit") {
        if (m.flying) {
          m.x += m.vx;
          m.y += m.vy;
        } else {
          m.vy = Math.min(MAXFALL, m.vy + GRAV);
          if (moveY(m, m.vy) !== 0) m.vy = 0;
        }
        if (m.t > 460) m.dead = true;
      } else {
        if (moveX(m, m.vx)) m.vx = -m.vx;
        m.vy = Math.min(MAXFALL, m.vy + GRAV);
        if (moveY(m, m.vy) !== 0) m.vy = 0;
        if (!solidAt(m.x + (m.vx > 0 ? m.w + 1 : -1), m.y + m.h + 2)) m.vx = -m.vx;
      }
      if (m.x < camX - 60 || m.y > H + 30) m.dead = true;
      if (phase === "play" && !m.dead && overlap(hb, m)) hitHero(io, 1);
    }
    lvl.mobs = lvl.mobs.filter((m) => !m.dead);
  };

  const spawnBossShot = (io: IO) => {
    const b = lvl.boss;
    if (b.type === "tree") {
      lvl.mobs.push({ kind: "fruit", x: b.x + r.range(-18, 18), y: b.y - 70, w: 15, h: 15, vx: 0, vy: 0, t: 0, active: true, dead: false, pulled: false, flying: false });
    } else {
      const a = Math.atan2(hero.y - b.y, hero.x - b.x);
      lvl.mobs.push({ kind: "fruit", x: b.x, y: b.y, w: 14, h: 14, vx: Math.cos(a) * 1.5, vy: Math.sin(a) * 1.5, t: 0, active: true, dead: false, pulled: false, flying: true });
    }
    io.sfx.play("laser");
  };
  const updateBoss = (io: IO) => {
    const b = lvl.boss;
    if (!b.active) {
      if (hero.x > lvl.arenaStartX - 30) {
        b.active = true;
        io.sfx.play("thud");
        io.sfx.slide?.(220, 90, 260, "sawtooth", 0.5);
      }
      return;
    }
    if (b.dead) return;
    b.t++;
    b.hitFlash = Math.max(0, b.hitFlash - 1);
    if (b.type === "king") {
      b.x = b.baseX + Math.sin(b.t * 0.018) * b.range;
      b.y = b.baseY + Math.sin(b.t * 0.05) * 6;
    }
    const interval = b.type === "tree" ? 95 : 70;
    if (b.t % interval === interval - 1) spawnBossShot(io);
  };

  const updateStars = (io: IO) => {
    for (const s of stars) {
      s.vy = Math.min(4, s.vy + 0.25);
      s.x += s.vx;
      s.y += s.vy;
      if (solidAt(s.x + s.w / 2, s.y + s.h)) {
        s.y = Math.floor((s.y + s.h) / T) * T - s.h;
        s.vy = -Math.abs(s.vy) * 0.55;
        s.vx *= 0.92;
      }
      s.life--;
      for (const m of lvl.mobs) if (!m.dead && overlap(s, m)) popMob(io, m);
      const b = lvl.boss;
      if (b.active && !b.dead && overlap(s, bossHurtbox(b))) {
        damageBoss(io, s.power ? 2 : 1);
        s.life = 0;
      }
      if (s.x < camX - 24 || s.x > camX + W + 260 || s.y > H + 40) s.life = 0;
    }
    stars = stars.filter((s) => s.life > 0);
  };

  return {
    update(io) {
      if (over || won) return;
      tick++;
      if (tick === 1) io.sfx.play("select");
      banner = Math.max(0, banner - 1);
      if (phase === "play") {
        updateHero(io);
        updateMobs(io);
        updateBoss(io);
        updateStars(io);
      } else {
        stateT++;
        if (stateT < 60) {
          hero.x += 0.6;
          hero.anim += 0.08;
        }
        if (stateT === 50) io.sfx.play("win");
        if (stateT > 130) {
          if (wi >= WORLDS.length - 1) {
            won = true;
            io.score(lives * 500 + hp * 50);
            io.win();
            return;
          }
          loadWorld(wi + 1);
          io.sfx.play("select");
        }
      }
      hero.squash += hero.squash > 0 ? -1 : hero.squash < 0 ? 1 : 0;
      for (const f of fx) f.t++;
      fx = fx.filter((f) => f.t < 20);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.color !== "suck") p.vy += 0.15;
        p.life--;
      }
      parts = parts.filter((p) => p.life > 0);
      for (const p of pops) p.t++;
      pops = pops.filter((p) => p.t < 36);
      camX += (camTarget() - camX) * 0.12;
      camX = clamp(camX, 0, lvl.cols * T - W);
    },

    draw(g: Gfx) {
      const d = lvl.def;
      const cam = Math.round(camX);
      const art = getThemeArt(d);
      // 6 parallax depth layers behind the playfield: dithered sky gradient, two cloud decks,
      // a hazy far candy-mountain range, then the two textured rolling-hill bands up front.
      g.sprite(art.sky, 0, 0);
      drawStrip(g, art.cloudsBack, cam * 0.04, 14);
      for (const s of lvl.bgStars) {
        const x = (((s.x - cam * 0.15) % (lvl.cols * T)) + lvl.cols * T) % (lvl.cols * T);
        if (x < cam - 20 || x > cam + W + 20) continue;
        g.rect(x - cam * 0.15 - (x - cam), s.y, s.s, s.s, "#ffffffaa");
      }
      drawStrip(g, art.cloudsFront, cam * 0.09, 30);
      drawStrip(g, art.farRange, cam * 0.18, 170 - 58);
      for (let i = 0; i < 6; i++) {
        const x = ((i * 130 - cam * 0.3) % 780 + 780) % 780 - 70;
        drawThemeProp(g, d.theme, x, 182, 1);
      }
      drawStrip(g, art.hillsBack, cam * 0.38, 196 - 88);
      for (let i = 0; i < 5; i++) {
        const x = ((i * 150 - cam * 0.5) % 750 + 750) % 750 - 60;
        drawThemeProp(g, d.theme, x, 198, 0);
      }
      drawStrip(g, art.hillsFront, cam * 0.62, 202 - 100);

      g.camera(cam, 0);
      const c0 = Math.floor(cam / T);
      for (let row = 0; row < ROWS; row++) {
        for (let c = c0; c <= c0 + W / T + 1 && c < lvl.cols; c++) {
          const ch = lvl.grid[row][c];
          if (ch === ".") continue;
          const x = c * T;
          const y = row * T;
          const above = row > 0 ? lvl.grid[row - 1][c] : ".";
          if (ch === "#") {
            const variant = Math.floor(hash2(c, row, 2) * 3) % 3;
            if (above !== "#") {
              g.sprite(art.groundTop[variant], x, y - GROUND_OVERHANG);
              if (d.theme === "meadow") drawGroundSparkle(g, x, y, c, tick);
            } else {
              g.sprite(art.groundUnder[variant % art.groundUnder.length], x, y);
            }
          } else if (ch === "=") g.sprite(art.floatTile, x, y);
          else if (ch === "x") g.sprite(art.blockTile, x, y);
          else if (ch === "^") g.sprite(art.bouncer[Math.floor(tick / 6) % 2], x, y);
          else if (ch === "o") {
            const f = Math.floor(tick / 10) % 2;
            g.circle(x + 8, y + 9 - f, 6, PAL.pink);
            g.circle(x + 8, y + 9 - f, 3, PAL.white);
          } else if (ch === "*") {
            const tw = Math.floor((tick + c * 5) / 8) % 2;
            g.rect(x + 6, y + 4 + tw, 4, 8 - tw * 2, PAL.yellow);
            g.rect(x + 4, y + 7, 8, 3 - tw, PAL.yellow);
          }
        }
      }
      // checkpoint lollipop
      if (lvl.checkpoint.x >= 0) {
        const cx = lvl.checkpoint.x + 8;
        g.rect(cx - 1, lvl.checkpoint.y - 26, 2, 26, PAL.white);
        g.circle(cx, lvl.checkpoint.y - 30, 6, checkpointReached ? PAL.pink : PAL.grey);
      }
      // star door
      const dx = lvl.doorX;
      const open = lvl.boss.dead;
      g.rect(dx, 8 * T, 18, 6 * T, open ? "#ffe14d" : "#6a6e8a");
      g.box(dx, 8 * T, 18, 6 * T, PAL.black);
      g.circle(dx + 9, 8 * T - 2, 7, open ? PAL.yellow : PAL.dark);
      if (open) for (let i = 0; i < 5; i++) g.rect(dx + 3 + ((i * 7 + tick) % 14), 8 * T + 4 + ((i * 11) % (6 * T - 8)), 2, 2, PAL.white);

      drawBoss(g, lvl.boss, tick);
      for (const m of lvl.mobs) if (m.active) drawMob(g, m, lvl.boss.fruitColor, tick);
      for (const s of stars) drawStar(g, s, tick);
      for (const f of fx) drawFx(g, f, hero);

      // hero — drawn ~2x the old size and centred over its (unchanged, smaller) hitbox
      const blink = hero.inv > 0 && Math.floor(hero.inv / 3) % 2 === 1;
      if (!blink) {
        const spr = hero.hold
          ? HERO_FULL[hero.hold]
          : hero.inhaling
            ? HERO_INHALE
            : hero.puffed
              ? HERO_PUFFED
              : !hero.onGround
                ? HERO_AIR
                : Math.abs(hero.vx) > 0.1
                  ? HERO_WALK[Math.floor(hero.anim) % 2]
                  : HERO_WALK[0];
        const squashK = hero.squash > 0 ? 1 - (hero.squash / 8) * 0.16 : hero.squash < 0 ? 1 + (-hero.squash / 7) * 0.12 : 1;
        const scale = (hero.puffed ? 1.9 : 1.7) * squashK;
        const drawX = hero.x + hero.w / 2 - (HERO_SPRITE_W * scale) / 2;
        const drawY = hero.y + hero.h - HERO_SPRITE_H * scale;
        drawArms(g, hero.x + hero.w / 2, hero.y + hero.h * 0.6, scale, hero.anim, hero.onGround);
        g.sprite(spr, drawX, drawY, { flipX: hero.facing < 0, scale });
        if (hero.power) drawHat(g, hero.x + hero.w / 2, drawY, hero.power);
      }
      if (hero.inhaling) drawCone(g, hero, tick);

      for (const p of parts) {
        if (p.color === "suck") g.circle(p.x, p.y, 1.5, "#ffffffcc");
        else g.rect(p.x, p.y, p.size, p.size, p.color);
      }
      for (const p of pops) g.text(p.text, p.x - cam, p.y - p.t * 0.6, PAL.white);
      g.camera(0, 0);

      // HUD
      g.rect(0, 0, W, 13, "rgba(13,11,26,0.55)");
      g.text("HP", 2, 2, PAL.grey);
      for (let i = 0; i < HP_MAX; i++) g.circle(20 + i * 8, 6, 3, i < hp ? PAL.pink : PAL.dark);
      g.text(`x${lives}`, 76, 2, PAL.white);
      g.text(d.name, W / 2, 2, "#ffffffcc", { align: "center" });
      if (hero.power) {
        const powerColor = hero.power === "flame" ? PAL.orange : hero.power === "spark" ? PAL.yellow : PAL.grey;
        g.text(`PWR ${hero.power.toUpperCase()}`, W - 4, 2, powerColor, { align: "right" });
      } else if (lvl.boss.active && !lvl.boss.dead) {
        g.text(lvl.boss.name, W - 4, 2, PAL.white, { align: "right" });
        const p = clamp(lvl.boss.hp / lvl.boss.maxHp, 0, 1);
        g.rect(W - 54, 9, 50, 3, PAL.dark);
        g.rect(W - 54, 9, 50 * p, 3, PAL.red);
      }
      if (banner > 0 && phase === "play") {
        g.rect(0, 80, W, 30, "rgba(13,11,26,0.6)");
        g.text(`WORLD ${wi + 1}`, W / 2, 86, PAL.yellow, { align: "center" });
        g.text(d.name, W / 2, 98, PAL.white, { align: "center" });
      }
      if (phase === "clear" && stateT > 50) g.text(wi >= WORLDS.length - 1 ? "YOU DID IT!" : "WORLD CLEAR!", W / 2, 90, PAL.yellow, { align: "center", size: 2 });
    },
  };
}

// ── shared drawing helpers (pure, no engine state) ──
/** a tiny 4-point sparkle/twinkle cross — the little magic-dust mark scattered through the
 *  candy worlds (ground flowers, ambient dust around puffs), drawn as two thin crossed bars
 *  so it stays a crisp plus-shape at any size instead of a blobby circle. */
function drawSparkle(g: Gfx, cx: number, cy: number, color: string, arm = 2) {
  g.rect(cx - 0.5, cy - arm, 1, arm * 2 + 1, color);
  g.rect(cx - arm, cy - 0.5, arm * 2 + 1, 1, color);
}
// two background props per theme, drawn as small parallax decorations: a near one (variant 0)
// and a smaller/further one (variant 1) — a candy-cane post + a lollipop tree for the meadow,
// a lollipop + a candy cane for the sweets world, a rainbow + a little cloud puff for the
// clouds, a castle tower with a banner + a lone flag spire for the sky castle.
function drawThemeProp(g: Gfx, theme: Theme, x: number, baseY: number, variant: number) {
  if (theme === "sweets") {
    if (variant === 1) {
      g.rect(x - 1, baseY - 20, 2, 20, "#caa06a");
      for (let i = 0; i < 3; i++) g.rect(x - 4, baseY - 19 + i * 6, 8, 3, i % 2 ? PAL.white : PAL.pink);
      return;
    }
    g.rect(x - 1, baseY - 26, 2, 26, "#caa06a");
    g.circle(x, baseY - 32, 8, PAL.pink);
    g.circle(x, baseY - 32, 4, PAL.white);
    g.circle(x - 2, baseY - 35, 2, "#ffffffaa");
  } else if (theme === "cloud") {
    if (variant === 1) {
      g.circle(x + 3, baseY - 12, 5, "#ffffff");
      g.circle(x - 3, baseY - 11, 4, "#ffffff");
      g.circle(x, baseY - 16, 5, shade("#ffffff", 0.2));
      return;
    }
    const colors = [PAL.pink, PAL.orange, PAL.yellow, PAL.green, PAL.blue];
    for (let i = 0; i < 5; i++) g.rect(x - 20 + i * 10, baseY - 20 - Math.abs(i - 2) * 4, 10, 4, colors[i]);
  } else if (theme === "castle") {
    if (variant === 1) {
      g.rect(x - 1, baseY - 24, 2, 24, "#8a8aa0");
      g.rect(x - 1, baseY - 32, 7, 5, PAL.red);
      return;
    }
    g.rect(x - 8, baseY - 50, 16, 50, "#8a8aa0");
    g.rect(x - 10, baseY - 56, 20, 8, "#6a6e8a");
    g.rect(x - 1, baseY - 70, 2, 16, PAL.red);
    g.rect(x - 1, baseY - 70, 9, 6, PAL.red);
    g.line(x - 7, baseY - 44, x - 7, baseY - 8, "#6a6e8a");
  } else if (variant === 1) {
    // a lollipop tree: a brown trunk under a big swirled candy canopy
    g.rect(x - 2, baseY - 18, 4, 18, "#8a5a2c");
    g.circle(x, baseY - 28, 12, "#ff8fb8");
    g.circle(x, baseY - 28, 8, "#ffffff");
    g.circle(x, baseY - 28, 4, "#ff8fb8");
  } else {
    g.rect(x - 1, baseY - 30, 2, 30, PAL.white);
    for (let i = 0; i < 4; i++) g.rect(x - 2, baseY - 28 + i * 7, 6, 3, i % 2 ? PAL.red : PAL.white);
    g.circle(x, baseY + 1, 2, "#ff8f7a");
  }
}
/** the little twinkling coral sparkle that sits in the grass on top of a meadow ground tile —
 *  animated (so it can't be baked into the static tile sprite), drawn on top of it every 3rd
 *  column, matching the cabinet painting's scattered ground twinkles. */
function drawGroundSparkle(g: Gfx, x: number, y: number, c: number, tick: number) {
  if (c % 3 !== 0) return;
  const big = (tick + c * 11) % 90 < 45;
  drawSparkle(g, x + 8, y - 1, "#ff8f7a", big ? 2 : 1);
  g.rect(x + 7, y - 2, 1, 1, "#fff3d6");
}
function mobColor(kind: HoldKind, fruitColor: string) {
  if (kind === "puff") return "#c9d4ea";
  if (kind === "flame") return PAL.orange;
  if (kind === "spark") return PAL.yellow;
  if (kind === "blade") return PAL.grey;
  if (kind === "block") return "#caa06a";
  return fruitColor;
}
function drawMob(g: Gfx, m: Mob, fruitColor: string, tick: number) {
  const bob = Math.sin(tick * 0.2 + m.x) * 1;
  const color = mobColor(m.kind, fruitColor);
  const rad = m.w / 2; // the (unchanged) hazard hitbox radius
  const cx = m.x + rad;
  const cy = m.y + m.h / 2 + bob;
  // drawn ~1.4x the hitbox for readability — purely cosmetic, the hurt-box above stays put
  const vrad = rad * 1.4;
  g.circle(cx, cy, vrad + 1.3, PAL.black);
  g.circle(cx + 1, cy + 1.3, vrad, shade(color, -0.24));
  g.circle(cx - 0.4, cy - 0.4, vrad * 0.93, color);
  g.circle(cx - vrad * 0.32, cy - vrad * 0.4, vrad * 0.4, shade(color, 0.42));
  g.circle(cx - vrad * 0.4, cy - vrad * 0.2, vrad * 0.16, PAL.black);
  g.circle(cx + vrad * 0.4, cy - vrad * 0.2, vrad * 0.16, PAL.black);
  g.line(cx - vrad * 0.3, cy + vrad * 0.42, cx + vrad * 0.3, cy + vrad * 0.42, PAL.black);
  const top = cy - vrad - 3;
  if (m.kind === "flame") {
    g.rect(cx - 2, top, 3, 7, PAL.red);
    g.circle(cx, top - 2, 3, PAL.yellow);
  } else if (m.kind === "spark") {
    // a little sparkler: a white wick topped with a warm, flickering bead
    g.rect(cx - 1, top - 2, 2, 8, PAL.white);
    const flick = Math.floor(tick / 4 + m.x) % 3;
    g.circle(cx, top - 4, 2 + (flick === 0 ? 1 : 0), "#ff6a4a");
    if (flick === 1) drawSparkle(g, cx + 3, top - 5, PAL.yellow, 1);
  } else if (m.kind === "blade") {
    g.rect(cx - 1, top - 3, 3, 9, PAL.white);
    g.rect(cx - 4, top - 4, 9, 3, PAL.grey);
  } else if (m.kind === "fruit") {
    g.rect(cx - 1, top - 1, 2, 4, PAL.green);
  }
  if (m.kind === "puff") {
    // ambient magic dust drifting around the puff — purely cosmetic, deterministic per mob
    const seed = hash2(Math.floor(m.x), Math.floor(m.y));
    for (let i = 0; i < 3; i++) {
      const ph = seed * 6.28 + i * 2.1;
      const a = tick * 0.03 + ph;
      const dx = Math.cos(a) * (vrad + 5 + i * 2);
      const dy = Math.sin(a * 1.3) * (vrad * 0.7) - vrad * 0.3;
      const tw = Math.floor(tick / 10 + i * 3) % 2;
      if (tw === 0) drawSparkle(g, cx + dx, cy + dy, "#ffffffcc", 1);
    }
  }
}
function drawBoss(g: Gfx, b: Boss, tick: number) {
  const flash = b.hitFlash > 0 && Math.floor(b.hitFlash / 3) % 2 === 0;
  const main = flash ? PAL.white : b.type === "tree" ? "#2f9a5a" : "#ffffff";
  if (b.type === "tree") {
    g.rect(b.x - 8, b.y - 46, 16, 46, "#7a4a2a");
    const sway = b.dead ? 0 : Math.sin(tick * 0.03) * 3;
    for (const [ox, oy, rr] of [[0, -68, 30], [-22, -52, 21], [22, -52, 21], [0, -92, 21]] as [number, number, number][]) g.circle(b.x + ox + sway, b.y + oy, rr, main);
    if (!b.dead) {
      g.circle(b.x - 8, b.y - 64, 3, PAL.black);
      g.circle(b.x + 8, b.y - 64, 3, PAL.black);
      g.line(b.x - 7, b.y - 54, b.x + 7, b.y - 54, PAL.black);
    } else {
      g.line(b.x - 9, b.y - 66, b.x - 5, b.y - 62, PAL.black);
      g.line(b.x - 5, b.y - 66, b.x - 9, b.y - 62, PAL.black);
      g.line(b.x + 5, b.y - 66, b.x + 9, b.y - 62, PAL.black);
      g.line(b.x + 9, b.y - 66, b.x + 5, b.y - 62, PAL.black);
    }
  } else {
    if (!b.active) return;
    for (const [ox, oy, rr] of [[0, 0, 24], [-20, 5, 17], [20, 5, 17], [-10, -13, 15], [10, -13, 15]] as [number, number, number][]) g.circle(b.x + ox, b.y + oy, rr, main);
    g.rect(b.x - 13, b.y - 32, 26, 9, PAL.yellow);
    g.circle(b.x, b.y - 35, 5, PAL.yellow);
    if (!b.dead) {
      g.circle(b.x - 7, b.y - 2, 3, PAL.black);
      g.circle(b.x + 7, b.y - 2, 3, PAL.black);
    }
  }
}
function drawStar(g: Gfx, s: StarShot, tick: number) {
  const color = s.power === "flame" ? PAL.orange : s.power === "spark" ? PAL.yellow : s.power === "blade" ? PAL.grey : PAL.white;
  const spin = Math.floor(tick / 3) % 2;
  g.rect(s.x + (spin ? 1 : 0), s.y, 5, 7, color);
  g.rect(s.x - 1 + (spin ? 0 : 1), s.y + 2, 9, 3, color);
}
function drawCone(g: Gfx, hero: { x: number; y: number; w: number; h: number; facing: number }, tick: number) {
  const mx = hero.x + (hero.facing > 0 ? hero.w : 0);
  const my = hero.y + hero.h * 0.55;
  const len = hero.facing * 30;
  for (let i = 0; i < 3; i++) {
    const t = ((tick * 2 + i * 7) % 24) / 24;
    g.line(mx + len * (1 - t), my - 7 + i * 7, mx, my, "#ffffff88");
  }
}
/** y is the top of the drawn (scaled) hero sprite, so the hat sits right on its head. */
function drawHat(g: Gfx, x: number, y: number, power: PowerKind) {
  if (power === "flame") {
    g.circle(x, y + 2, 4, PAL.orange);
    g.circle(x, y - 2, 3, PAL.yellow);
  } else if (power === "spark") {
    g.rect(x - 1, y - 4, 2, 7, PAL.yellow);
    g.rect(x - 4, y + 1, 8, 3, PAL.yellow);
  } else {
    g.rect(x - 1, y - 3, 2, 9, PAL.grey);
    g.rect(x - 4, y - 3, 8, 3, PAL.white);
  }
}
/** little stub arms that swing while walking. */
function drawArms(g: Gfx, cx: number, cy: number, scale: number, anim: number, onGround: boolean) {
  const swing = onGround ? Math.sin(anim * 2) * 3 : 2;
  const r = 2.4 * scale * 0.7;
  const spread = 10 * scale * 0.55;
  g.circle(cx - spread, cy - swing, r, PAL.white);
  g.circle(cx + spread, cy + swing, r, PAL.white);
}
function drawFx(g: Gfx, f: Fx, hero: { x: number; y: number; w: number; h: number }) {
  const t = f.t / 20;
  if (f.type === "flame") {
    const len = 26 * (1 - t * 0.3);
    for (let i = 0; i < 4; i++) g.circle(f.x + f.facing * (10 + i * 6), f.y + Math.sin(f.t + i) * 3, 4 - t * 2, i % 2 ? PAL.orange : PAL.yellow);
    void len;
  } else if (f.type === "spark") {
    g.circle(f.x, f.y, 10 + t * 30, "#ffe14d55");
  } else {
    g.line(f.x + f.facing * 6, f.y - 10, f.x + f.facing * 26, f.y + 6, PAL.white);
    g.line(f.x + f.facing * 6, f.y + 6, f.x + f.facing * 26, f.y - 10, PAL.white);
  }
  void hero;
}

export const puffHop: RetroGameDef = {
  id: "puff-hop",
  title: "Puff Hop",
  blurb: "Float, inhale and copy powers across four candy worlds!",
  genre: "Platformer",
  emoji: "☁️",
  color: "#9a5cff",
  controls: "◀ ▶ walk · A jump (tap again to float) · B inhale, spit or use power · ▼ swallow for a copy power",
  pad: { dpad: "4", a: "Jump/Float", b: "Inhale" },
  create,
};
