// COMET PATROL — a horizontally-scrolling space shooter. Fly your little starship rightward
// through open space, an asteroid belt, crystal caves, a volcano and the frozen reaches,
// dodging terrain and blasting robot drones, sine-snakes and terrain turrets. Shoot enough
// foes and a capsule pops out; each capsule slides a highlight along the POWER BAR at the
// bottom (SPEED, MISSILE, DOUBLE, LASER, OPTION, SHIELD) — press B to cash in whatever's lit.
// Options are little drones that trail behind the ship and copy its shots (max 2). Clear a
// stage's shielded boss to open its core, then move on; beat the last one to win the patrol.
// (Original game in the spirit of 8-bit side-scrolling shooters.)
import { H, PAL, W, clamp, overlap, rng, spriteH, spriteW, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Rng, type Sprite } from "../engine";
import { bake, bayer, drawStrip, fbm, hash2, mixHex, outlined, shade, tinted } from "../art";

const T = 16;
const PLAY_TOP = 10;
const PLAY_BOT = H - 15;
const BOSS_W = 56;
const BOSS_H = 68;
const BOSS_BASE_Y = (PLAY_TOP + PLAY_BOT) / 2 - BOSS_H / 2;
// the ship's hitbox is smaller than its sprite and centred on the thick part of its hull,
// so grazing the edge of the art never feels like a cheap hit.
const HIT_DX = 6;
const HIT_DY = 4;
const HIT_W = 8;
const HIT_H = 5;

// ── ship sprites: a chunky jet, nose to the right, orange nose cone like the cabinet painting.
// Drawn at SHIP_SCALE so it reads as a proper hero on screen; the hitbox stays the old small
// size (HIT_DX/DY/W/H below), inset inside the bigger art, so the kid never takes a cheap hit.
const SHIP_W = 20;
const SHIP_H = 12;
const SHIP_SCALE = 1.6;
// outlined() grows the sprite by 1px on every side; these keep the bigger, scaled art centred
// on the same small hitbox the ship has always had.
const SHIP_DRAW_DX = ((SHIP_W + 2) * SHIP_SCALE - SHIP_W) / 2;
const SHIP_DRAW_DY = ((SHIP_H + 2) * SHIP_SCALE - SHIP_H) / 2;
const SP = { k: PAL.black, w: PAL.white, b: PAL.blue, c: PAL.cyan, g: PAL.grey, o: PAL.orange, h: "#cfe6ff" };
const SHIP = outlined(
  sprite(
    [
      "......kkwwkk........",
      "....kkwwhwwwkk......",
      "....kkwwwwwwkk......",
      "..kkbbbbbbbbwwwwkk..",
      "..kkbbbbbbbbwwwwkk..",
      "kkkkbbbbbbbbbbbbccoo",
      "kkkkbbbbbbbbbbbbccoo",
      "..kkbbbbbbbbwwwwkk..",
      "..kkbbbbbbbbwwwwkk..",
      "....kkwwwwwwkk......",
      "....kkwwhwwwkk......",
      "......kkwwkk........",
    ],
    SP,
  ),
);
const SHIP_BANK = outlined(
  sprite(
    [
      "....kkwwkk..........",
      "..kkbbbbbbwwwwkk....",
      "..kkbbbbbbwwhwkk....",
      "kkkkbbbbbbbbwwccoo..",
      "kkkkbbbbbbbbwwccoo..",
      "..kkbbbbbbbbbbbbccoo",
      "..kkbbbbbbbbbbbbccoo",
      "kk..bbbbbbbbwwwwkk..",
      "kk..bbbbbbbbwwwwkk..",
      "..kkwwwwwwkk........",
      "..kkwwwwwwkk........",
      "....kk..kk..........",
    ],
    SP,
  ),
);

// enemy hit-boxes stay exactly the sizes passed to mkFoe (w/h below); the sprites are drawn a
// little bigger and outlined (via drawBig) so they pop against the new busy backdrops without
// ever hurting the kid over a bigger area than before.
const DRONE_PAL = { k: PAL.black, w: PAL.grey, y: PAL.yellow, h: "#d8dce8" };
const DRONE = [
  sprite(
    ["..kkkkkkkk......", "..khkkkkkkk.....", "kkwwyyyyyywwkk..", "kkwwyyyyyywwkk..", "kk..wwwwwwww..kk", "kk..wwwwwwww..kk", "....kk....kk....", "....kk....kk...."],
    DRONE_PAL,
  ),
  sprite(
    ["..kkkkkkkk......", "..khkkkkkkk.....", "kkwwyyyyyywwkk..", "kkwwyyyyyywwkk..", "kk..wwwwwwww..kk", "kk..wwwwwwww..kk", "..kk........kk..", "..kk........kk.."],
    DRONE_PAL,
  ),
].map((s) => outlined(s));
const WALKER_PAL = { k: PAL.black, w: PAL.purple, b: PAL.pink, d: "#4a1f6e" };
const WALKER = [
  sprite(
    ["..kkkkkkkk......", "..kdkkkkkkk.....", "kkwwwwwwwwwwkk..", "kkwwwwwwwwwwkk..", "kkwwkkkkkkwwkk..", "kkwwkkkkkkwwkk..", "..kk..kkkk..kk..", "..kk..kkkk..kk.."],
    WALKER_PAL,
  ),
  sprite(
    ["..kkkkkkkk......", "..kdkkkkkkk.....", "kkwwwwwwwwwwkk..", "kkwwwwwwwwwwkk..", "kkwwkkkkkkwwkk..", "kkwwkkkkkkwwkk..", "kk..kk....kk..kk", "kk..kk....kk..kk"],
    WALKER_PAL,
  ),
].map((s) => outlined(s));
const TURRET_PAL = { k: PAL.black, y: PAL.orange, g: PAL.grey, r: PAL.red, d: PAL.dark, h: "#ffd9a0" };
const TURRET = outlined(
  sprite(
    [
      "....kkkkkkkk........",
      "....khhkkkkk........",
      "..kkyyyyyyyyyykk....",
      "..kkyyyyyyyyyykk....",
      "kkyyggggggggggyykk..",
      "kkyyggggggggggyykk..",
      "kkyyggrrrrrrggyykk..",
      "kkyyggrrrrrrggyykk..",
      "kkyyggggggggggyykk..",
      "kkyyggggggggggyykk..",
      "kkkkddddddddddddkkkk",
      "kkkkddddddddddddkkkk",
      "..kkddddddddddkk....",
      "..kkddddddddddkk....",
    ],
    TURRET_PAL,
  ),
);
const DRONE_FLASH = DRONE.map((s) => tinted(s, PAL.white));
const WALKER_FLASH = WALKER.map((s) => tinted(s, PAL.white));
const TURRET_FLASH = tinted(TURRET, PAL.white);
/** draws a (possibly outlined) sprite scaled up, centred on its old w x h hitbox — the hitbox
 *  never grows even though the art does */
function drawBig(g: Gfx, s: Sprite, x: number, y: number, w: number, h: number, scale: number, flipY = false) {
  const dw = spriteW(s) * scale;
  const dh = spriteH(s) * scale;
  g.sprite(s, x - (dw - w) / 2, y - (dh - h) / 2, { scale, flipY });
}

type Kind = "drone" | "snake" | "turret" | "hatch" | "walker" | "rock" | "icicle";
type Mount = "floor" | "ceil" | "float";
type StageKind = "space" | "belt" | "cave" | "volcano" | "ice";

interface StageTheme {
  kind: StageKind;
  name: string;
  bg: string;
  accent: string;
  floorColor: string;
  ceilColor: string;
  /** a second, deeper rock/ice/lava tone the terrain bake shades toward */
  rockColor: string;
  /** small bright glints/veins/sparkle colour baked into the terrain and distant wall */
  glowColor: string;
  len: number;
  scroll: number;
  bossName: string;
}
// planet colours sampled straight from the cabinet painting (a dusky teal gas giant + a small
// rusty moon on a flat deep-navy sky)
const PLANET_TEAL = "#2c5668";
const PLANET_BROWN = "#9a5a32";
const STAGES: StageTheme[] = [
  { kind: "space", name: "Comet Fields", bg: "#120f24", accent: PAL.cyan, floorColor: PAL.dark, ceilColor: PAL.dark, rockColor: "#2a2440", glowColor: PAL.cyan, len: 1900, scroll: 1.0, bossName: "SENTRY DRONE" },
  { kind: "belt", name: "Asteroid Belt", bg: "#0d0b1a", accent: PAL.tan, floorColor: PAL.brown, ceilColor: PAL.brown, rockColor: "#5a3a22", glowColor: PAL.tan, len: 2000, scroll: 1.05, bossName: "ROCK CRUSHER" },
  { kind: "cave", name: "Crystal Caves", bg: "#1a1230", accent: PAL.purple, floorColor: "#4a3a6a", ceilColor: "#4a3a6a", rockColor: "#2a2048", glowColor: PAL.pink, len: 2150, scroll: 1.1, bossName: "CRYSTAL GOLEM" },
  { kind: "volcano", name: "Molten Core", bg: "#2a0e0e", accent: PAL.orange, floorColor: "#5a2a18", ceilColor: "#4a2018", rockColor: "#241012", glowColor: PAL.yellow, len: 2150, scroll: 1.15, bossName: "MAGMA HATCH" },
  { kind: "ice", name: "Frozen Reaches", bg: "#0e1d30", accent: PAL.sky, floorColor: "#7fb8d8", ceilColor: "#7fb8d8", rockColor: "#3a5f7a", glowColor: PAL.white, len: 2250, scroll: 1.2, bossName: "COMET CORE" },
];

const BAR_LABELS = ["SPD", "MSL", "DBL", "LSR", "OPT", "SHD"];
const BAR_COLORS = [PAL.lime, PAL.orange, PAL.cyan, PAL.pink, PAL.purple, PAL.sky];
const SPEEDS = [1.3, 1.65, 2.0, 2.4];
const FOE_SCORE: Record<Kind, number> = { drone: 90, snake: 70, turret: 150, hatch: 200, walker: 60, rock: 60, icicle: 40 };
const DROP_CHANCE: Record<Kind, number> = { drone: 0.14, snake: 0.12, turret: 0.4, hatch: 0.5, walker: 0.1, rock: 0.1, icicle: 0.06 };

interface Foe {
  kind: Kind;
  wx: number;
  y: number;
  baseY: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  t: number;
  phase: number;
  amp: number;
  drift: number;
  mount: Mount;
  spawnT: number;
  vy: number;
  r: number;
  flash: number;
  falling: boolean;
  forceDrop: boolean;
}
function mkFoe(kind: Kind, wx: number, y: number, over: Partial<Foe>): Foe {
  return { kind, wx, y, baseY: y, w: 8, h: 8, hp: 1, maxHp: 1, t: 0, phase: 0, amp: 0, drift: 0, mount: "float", spawnT: 0, vy: 0, r: 0, flash: 0, falling: false, forceDrop: false, ...over };
}
interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  pierce: number;
  laser: boolean;
}
interface Missile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}
interface EShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}
interface Cap {
  wx: number;
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
}
/** an expanding dithered shockwave ring (a big kill, a boss panel/core popping) — grows and fades,
 *  drawn as a dotted circle rather than a filled disc so it never reads as a flat glow dome */
interface Ring {
  x: number;
  y: number;
  r: number;
  life: number;
  maxLife: number;
  color: string;
}
interface Terrain {
  ceil: number[];
  floor: number[];
}
interface Decor {
  wx: number;
  y: number;
  s: Sprite;
  par: number;
}
interface StageArt {
  /** a tileable glow/dust/asteroid strip drawn behind the terrain, scrolled slower than it */
  ambient: Sprite | null;
  /** the whole stage's rock/ice/lava walls baked once, pixel-exact to ceilAt/floorAt */
  terrain: Sprite | null;
  /** background planets/moons placed along the stage, parallax-scrolled */
  decor: Decor[];
  /** a big painted nebula cloud, the farthest and slowest layer — every stage gets one */
  nebula: Sprite | null;
  /** a thin foreground strip (asteroid chunks / girders) kept to the top+bottom slivers */
  fg: Sprite | null;
}
interface Ember {
  x: number;
  y: number;
  vy: number;
}
interface StageData {
  terrain: Terrain | null;
  floorAt: (wx: number) => number;
  ceilAt: (wx: number) => number;
  foes: Foe[];
  art: StageArt;
  /** rising embers (volcano) or falling snow (ice) drifting across the whole screen */
  embers: Ember[];
}

// ── backdrop art: baked once per stage (not per frame) from that stage's own theme/terrain, so
// a 16-bit cartridge backdrop costs one or two drawImage calls a frame instead of hundreds of
// rects. Planets are shaded spheres (lit from the upper-left) with a few dimpled craters; the
// terrain bake turns the flat floor/ceil bands into mottled rock with a jagged, glowing lip.
function bakePlanet(d: number, base: string, seed: number, craterN = 4): Sprite {
  const r = d / 2;
  const cx = d / 2 - 0.5;
  const cy = cx;
  const craters = Array.from({ length: craterN }, (_, i) => {
    const a = hash2(i, 1, seed) * Math.PI * 2;
    const rr = hash2(i, 2, seed) * r * 0.62;
    return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, r: r * (0.14 + hash2(i, 3, seed) * 0.16) };
  });
  return bake(d, d, (x, y) => {
    const dx = (x - cx) / r;
    const dy = (y - cy) / r;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1) return null;
    const z = Math.sqrt(Math.max(0, 1 - d2));
    const light = dx * -0.55 + dy * -0.65 + z * 0.55;
    // quantized into 4 bands so the sphere reads as banded pixel-art shading, not a smooth
    // render — and kept close to the painting's base colour (mostly flat, just a soft terminator)
    const band = Math.round(clamp((light + 1) / 2, 0, 1) * 3) / 3;
    let col = shade(base, (band - 0.5) * 0.3);
    for (const c of craters) {
      const cdx = x - c.x;
      const cdy = y - c.y;
      const cd2 = (cdx * cdx + cdy * cdy) / (c.r * c.r);
      if (cd2 < 1) col = shade(col, cd2 < 0.55 ? -0.22 : -0.08);
    }
    if (d2 > 0.88 && light > 0.3) col = shade(col, 0.12);
    return col;
  });
}
/** a jagged, cratered, visibly-tumbling rock hazard — deliberately spiky (never a smooth sphere)
 *  so a kid never mistakes it for a harmless background planet */
function bakeAsteroid(d: number, seed: number, rotFrame: number): Sprite {
  const r = d / 2;
  const cx = d / 2 - 0.5;
  const cy = cx;
  const rot = rotFrame * 0.5;
  const base = mixHex(PAL.dark, PAL.brown, 0.42);
  return bake(d, d, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const ang = Math.atan2(dy, dx) - rot;
    const jitter = 0.72 + 0.22 * Math.sin(ang * 5 + seed) + 0.1 * Math.cos(ang * 9 - seed * 2);
    const dist = Math.hypot(dx, dy);
    if (dist > r * jitter) return null;
    const light = (-dx / r) * 0.5 + (-dy / r) * 0.6;
    let col = shade(base, light > 0.15 ? 0.14 : light < -0.2 ? -0.26 : -0.04);
    if (dist > r * jitter - 1.2 && light > 0.25) col = shade(col, 0.18);
    return col;
  });
}
// the "rock" hazard only ever spawns with r in [8, 10, 12] (see buildStage); two tumble frames each
const ASTEROIDS: Record<number, [Sprite, Sprite]> = Object.fromEntries([8, 10, 12].map((rr) => [rr, [outlined(bakeAsteroid(rr * 2, rr, 0)), outlined(bakeAsteroid(rr * 2, rr, 1))]]));
// precise white hit-flash silhouettes (shaped to each sprite, not a blocky rect overlay)
const ASTEROID_FLASH: Record<number, [Sprite, Sprite]> = Object.fromEntries(Object.entries(ASTEROIDS).map(([k, [a, b]]) => [k, [tinted(a, PAL.white), tinted(b, PAL.white)]]));
/** a tapered ice shard, tip down — baked once, reused by every icicle */
function bakeIcicle(w: number, h: number): Sprite {
  const cx = w / 2 - 0.5;
  return bake(w, h, (x, y) => {
    const t = y / (h - 1);
    const halfW = (w / 2) * (1 - t * 0.82);
    const dx = Math.abs(x - cx);
    if (dx > halfW) return null;
    if (halfW - dx < 0.9) return shade(PAL.sky, 0.3);
    if (dx < halfW * 0.4) return shade(PAL.sky, 0.12);
    return shade(PAL.sky, -0.12);
  });
}
const ICICLE = outlined(bakeIcicle(8, 12));
const ICICLE_FLASH = tinted(ICICLE, PAL.white);
/** the power capsule: a glossy pill with a bright white stripe, dark rim and a two-tone glow */
function bakeCapsule(d: number): Sprite {
  const cx = d / 2 - 0.5;
  const r = d / 2 - 0.5;
  return bake(d, d, (x, y) => {
    const dx = x - cx;
    const dy = y - cx;
    const dist = Math.hypot(dx, dy);
    if (dist > r) return null;
    if (dist > r - 1.1) return PAL.black;
    if (Math.abs(dy) < 1.6) return PAL.white;
    return dy < 0 ? shade(PAL.yellow, 0.1) : shade(PAL.yellow, -0.18);
  });
}
const CAPSULE = bakeCapsule(11);
/** a riveted metal hatch plate — the dynamic glowing slit is still drawn on top each frame */
function bakeHatchPlate(w: number, h: number): Sprite {
  return bake(w, h, (x, y) => {
    const edge = x === 0 || x === w - 1 || y === 0 || y === h - 1;
    if (edge) return shade(PAL.dark, -0.3);
    if ((x === 2 || x === w - 3) && (y === 2 || y === h - 3)) return shade(PAL.grey, 0.2);
    return (x + y) % 5 === 0 ? shade(PAL.dark, 0.08) : PAL.dark;
  });
}
const HATCH_PLATE = outlined(bakeHatchPlate(16, 10));
const HATCH_PLATE_FLASH = tinted(HATCH_PLATE, PAL.white);
/** a sparse field of jagged dark rock silhouettes — the Asteroid Belt's mid-ground */
function bakeAsteroidField(w: number, h: number, seed: number, base: string): Sprite {
  const n = 7;
  const rocks = Array.from({ length: n }, (_, i) => ({
    x: hash2(i, 1, seed) * w,
    y: 4 + hash2(i, 2, seed) * (h - 8),
    r: 2.5 + hash2(i, 3, seed) * 4.5,
    id: i,
  }));
  return bake(w, h, (x, y) => {
    for (const rk of rocks) {
      const dxw = Math.min(Math.abs(x - rk.x), w - Math.abs(x - rk.x));
      const dy = y - rk.y;
      const ang = Math.atan2(dy, dxw * Math.sign(x - rk.x || 1));
      const jitter = 0.78 + 0.26 * hash2(Math.round((ang + Math.PI) * 3), rk.id, seed);
      const d = Math.hypot(dxw, dy) / (rk.r * jitter);
      if (d < 1) return d < 0.5 ? shade(base, 0.08) : shade(base, -0.18);
    }
    return null;
  });
}
/** sparse, dithered glow motes (crystal glints, embers, ice sparkle) — never a flat glow dome */
function bakeAmbient(w: number, h: number, glow: string, seed: number, density: number): Sprite {
  const spots = Array.from({ length: density }, (_, i) => ({ x: hash2(i, 1, seed) * w, y: hash2(i, 2, seed) * h, r: 1.1 + hash2(i, 3, seed) * 2 }));
  return bake(w, h, (x, y) => {
    for (const s of spots) {
      const dxw = Math.min(Math.abs(x - s.x), w - Math.abs(x - s.x));
      const dy = y - s.y;
      const d2 = (dxw * dxw + dy * dy) / (s.r * s.r);
      if (d2 < 1 && 1 - d2 > bayer(x, y) * 0.65) return glow;
    }
    return null;
  });
}
/** the whole stage's rock walls, baked pixel-exact to the terrain's ceil/floor arrays: a mottled
 *  3-tone body, a jagged glowing lip (icicles / crystal shards / crusted lava) and rare glints —
 *  one big sprite instead of flat rows of rects. */
function bakeTerrainArt(theme: StageTheme, terrain: Terrain, stageSeed: number): Sprite {
  const cols = terrain.ceil.length;
  const w = cols * T;
  const toothLen = (col: number, k: number) => 2 + Math.floor(hash2(col, k, stageSeed) * 6);
  const toothOn = (col: number, lx: number, k: number) => {
    const c0 = Math.floor(2 + hash2(col, k + 1, stageSeed) * (T - 4));
    const w2 = 3 + Math.floor(hash2(col, k + 2, stageSeed) * 4);
    return Math.abs(lx - c0) < w2 / 2;
  };
  return bake(w, H, (x, y) => {
    const col = Math.min(cols - 1, Math.floor(x / T));
    const lx = x - col * T;
    const ceilH = terrain.ceil[col];
    const floorH = terrain.floor[col];
    const mottle = hash2(Math.floor(x / 3), Math.floor(y / 3), stageSeed + 5);
    const rock = mottle > 0.78 ? shade(theme.rockColor, 0.14) : mottle < 0.22 ? shade(theme.rockColor, -0.16) : theme.rockColor;
    if (y < ceilH) {
      const depth = ceilH - y;
      if (depth <= toothLen(col, 10) && toothOn(col, lx, 10)) return depth <= 1 ? theme.accent : shade(theme.glowColor, depth > 3 ? -0.2 : 0.1);
      if (depth <= 2) return shade(theme.ceilColor, 0.18);
      if (Math.abs(Math.sin(x * 0.22 + y * 0.12 + stageSeed) - 0.98) < 0.01) return theme.glowColor;
      return rock;
    }
    if (y >= floorH) {
      const depth = y - floorH;
      if (depth <= toothLen(col, 20) && toothOn(col, lx, 20)) return depth <= 1 ? theme.accent : shade(theme.glowColor, depth > 3 ? -0.2 : 0.1);
      if (depth <= 2) return shade(theme.floorColor, 0.18);
      if (Math.abs(Math.sin(x * 0.22 - y * 0.12 + stageSeed) - 0.98) < 0.01) return theme.glowColor;
      return rock;
    }
    return null;
  });
}
/** the painting's big gas giant, upgraded with a thin dithered ring system: two dust bands that
 *  pass BEHIND the globe on the far side (dim, broken up by dithering so they read as translucent)
 *  and IN FRONT of it on the near side (brighter, occluding the sphere) — never a solid glow dome. */
function bakePlanetRinged(d: number, base: string, ringColor: string, seed: number, craterN = 5): Sprite {
  const r = d / 2;
  const w = Math.round(d * 1.9);
  const h = Math.round(d * 1.32);
  const cx = w / 2 - 0.5;
  const cy = h / 2 - 0.5;
  const craters = Array.from({ length: craterN }, (_, i) => {
    const a = hash2(i, 1, seed) * Math.PI * 2;
    const rr = hash2(i, 2, seed) * r * 0.62;
    return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, r: r * (0.14 + hash2(i, 3, seed) * 0.16) };
  });
  const oa = r * 1.6;
  const ob = r * 0.3;
  const ia = r * 1.14;
  const ib = r * 0.2;
  const inBand = (dx: number, dy: number) => {
    const to = (dx / oa) ** 2 + (dy / ob) ** 2;
    const ti = (dx / ia) ** 2 + (dy / ib) ** 2;
    return to <= 1 && ti >= 1;
  };
  return bake(w, h, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const distP = Math.hypot(dx, dy);
    const band = inBand(dx, dy);
    if (distP <= r) {
      // the near arc of the ring passes in front of the lower half of the globe
      if (dy > r * 0.08 && band) return shade(ringColor, dy > r * 0.3 ? 0.1 : -0.05);
      const ndx = dx / r;
      const ndy = dy / r;
      const z = Math.sqrt(Math.max(0, 1 - ndx * ndx - ndy * ndy));
      const light = ndx * -0.55 + ndy * -0.65 + z * 0.55;
      const bandv = Math.round(clamp((light + 1) / 2, 0, 1) * 3) / 3;
      let col = shade(base, (bandv - 0.5) * 0.3);
      for (const c of craters) {
        const cdx = x - c.x;
        const cdy = y - c.y;
        const cd2 = (cdx * cdx + cdy * cdy) / (c.r * c.r);
        if (cd2 < 1) col = shade(col, cd2 < 0.55 ? -0.22 : -0.08);
      }
      if (distP / r > 0.88 && light > 0.3) col = shade(col, 0.12);
      return col;
    }
    if (band) return 1 - bayer(x, y) < 0.55 ? shade(ringColor, dy < 0 ? -0.22 : -0.08) : null;
    // a soft dithered atmosphere glow, ONLY on the sunlit side (same light direction as the globe's
    // own shading) and only a thin band just outside the limb — never a solid dome
    const edge = (distP - r) / (r * 0.26);
    if (edge < 1) {
      const ndx = dx / r;
      const ndy = dy / r;
      const litSide = clamp((ndx * -0.55 + ndy * -0.65 - 0.1) / 0.5, 0, 1);
      const fall = (1 - edge) * litSide;
      if (fall > 0.1 && fall > bayer(x, y) * 0.85) return shade(base, 0.3 + fall * 0.15);
    }
    return null;
  });
}
/** a tiny, distant spiral galaxy: a tilted dust disc with two dithered arms round a bright core —
 *  pure background flavour, baked once and reused */
function bakeGalaxy(d: number, seed: number): Sprite {
  const w = d;
  const h = Math.round(d * 0.5);
  const cx = w / 2 - 0.5;
  const cy = h / 2 - 0.5;
  return bake(w, h, (x, y) => {
    const dx = (x - cx) / (w / 2);
    const dy = (y - cy) / (h / 2);
    const distN = Math.hypot(dx, dy);
    if (distN > 1) return null;
    if (distN < 0.16) return shade(PAL.white, distN < 0.07 ? 0.3 : 0);
    const ang = Math.atan2(dy, dx);
    const arm = Math.sin(ang * 2 + distN * 8 + seed) * 0.5 + 0.5;
    if (arm > 0.52 && 1 - distN > bayer(x, y) * 0.75) return distN < 0.55 ? shade(PAL.sky, -0.1) : shade(PAL.purple, -0.2);
    return null;
  });
}
/** a big, SOFT dithered nebula: a few large gentle blobs (never thin wormy tendrils — the edge is
 *  one smooth radial falloff, only gently warped by a very low-frequency wobble), each fading from
 *  a slightly brighter core out to nothing through several dithered bands. Two hues blend across
 *  the cloud (deep violet -> dusky teal, say), the whole thing kept darker and less saturated than
 *  any play object, and a few small bright star-cluster flecks sit inside for interest. Covers
 *  roughly a third of the screen — this is the fix for a sky that was mostly black with dots. */
function bakeNebula(w: number, h: number, colorDeep: string, colorDusk: string, glow: string, seed: number): Sprite {
  // horizontal distance wrapped round the strip's width, so a blob (and the low-freq wobble
  // sampled relative to it) is continuous across the x=0/x=w seam — drawStrip tiles this
  // sprite side by side, so without wraparound a blob near an edge gets hard-clipped there,
  // which is exactly the straight seam/wedge artifact this fixes
  const wrapDx = (x: number, bx: number) => {
    let d = x - bx;
    if (d > w / 2) d -= w;
    else if (d < -w / 2) d += w;
    return d;
  };
  // varied, overlapping blob sizes (not one repeated disc size) — some big soft bases, some
  // smaller ones overlapping them for an irregular, cloud-like silhouette
  const n = 5;
  const blobs = Array.from({ length: n }, (_, i) => ({
    x: hash2(i, 1, seed) * w,
    y: (0.08 + hash2(i, 2, seed) * 0.84) * h,
    r: h * (0.15 + hash2(i, 3, seed) * 0.28),
    hue: hash2(i, 4, seed),
  }));
  const clusters = Array.from({ length: 3 }, (_, i) => {
    const b = blobs[i];
    const a = hash2(i, 5, seed) * Math.PI * 2;
    const rr = hash2(i, 6, seed) * b.r * 0.35;
    return { x: (b.x + Math.cos(a) * rr + w) % w, y: b.y + Math.sin(a) * rr };
  });
  return bake(w, h, (x, y) => {
    for (const c of clusters) {
      const cd = Math.hypot(wrapDx(x, c.x), y - c.y);
      if (cd < 1.4) return shade(glow, 0.3);
      if (cd < 2.6 && (x + y) % 2 === 0) return shade(glow, 0.05);
    }
    let density = 0;
    let hue = 0;
    for (const b of blobs) {
      const dxw = wrapDx(x, b.x);
      const dyw = y - b.y;
      // a slow, low-frequency wobble on the radius (+-25%), sampled relative to the blob centre
      // (using the wrapped dx) so it stays seamless across the tile edge — a lumpy, uneven cloud
      // edge instead of a perfect disc
      const wob = 1 + (fbm(dxw * 0.022 + 40, dyw * 0.022 + 40, 2, seed + b.hue * 97) - 0.5) * 0.5;
      const d = Math.hypot(dxw, dyw) / (b.r * wob);
      const soft = clamp(1 - d, 0, 1);
      const v = soft * soft * (3 - 2 * soft); // smoothstep: no hard rim
      if (v > density) {
        density = v;
        hue = b.hue;
      }
    }
    if (density < 0.1) return null;
    // a soft dithered fade over the outer ~15% of density, rather than a hard cutoff
    const edgeFade = clamp((density - 0.1) / 0.15, 0, 1);
    if (edgeFade < 1 && edgeFade < bayer(x, y)) return null;
    const base = mixHex(colorDeep, colorDusk, hue);
    const desat = mixHex(base, PAL.night, 0.3);
    // a clearly brighter core fading out to a darker edge (then to nothing)
    return shade(desat, (density - 0.55) * 0.3);
  });
}
/** a thin foreground silhouette strip kept to the very top/bottom slivers of the screen (never the
 *  ship's flight lane) — tumbling asteroid chunks for the Belt, girder struts for open space */
function bakeForegroundAsteroids(w: number, bandH: number, seed: number): Sprite {
  const n = 7;
  const rocks = Array.from({ length: n }, (_, i) => ({ x: hash2(i, 1, seed) * w, y: hash2(i, 2, seed) * bandH, r: 2.5 + hash2(i, 3, seed) * 4 }));
  return bake(w, bandH, (x, y) => {
    for (const rk of rocks) {
      const dxw = Math.min(Math.abs(x - rk.x), w - Math.abs(x - rk.x));
      const dy = y - rk.y;
      const dd = Math.hypot(dxw, dy) / rk.r;
      if (dd < 1) return dd < 0.5 ? shade(PAL.dark, -0.12) : shade(PAL.dark, -0.34);
    }
    return null;
  });
}
/** chunky lit station girders (never thin dashed ticks): wide riveted I-beams, spaced well apart,
 *  with a bright lit face, a dark shadow face and a couple of bolt heads each */
function bakeForegroundGirders(w: number, bandH: number, seed: number): Sprite {
  const spacing = 56;
  const beamW = 9;
  return bake(w, bandH, (x, y) => {
    const col = Math.floor(x / spacing);
    const lx = x - col * spacing;
    if (lx >= beamW) return null;
    if (lx === 0 || lx === 1) return shade(PAL.grey, 0.3 - lx * 0.15);
    if (lx === beamW - 1) return shade(PAL.black, -0.1);
    if (lx === beamW - 2) return shade(PAL.dark, -0.25);
    const boltRow = y % 7 === 3;
    if (boltRow && (lx === 3 || lx === 6)) return shade(PAL.yellow, hash2(col, lx, seed) > 0.5 ? -0.1 : -0.3);
    return (y + col) % 4 === 0 ? shade(PAL.dark, 0.08) : PAL.dark;
  });
}
// baked once at module load — a single small sprite, well inside the 25ms budget
const GALAXY = bakeGalaxy(34, 7);
/** background decor for the open (terrain-less) stages: the painting's big dusky ringed planet +
 *  its small rust moon for Comet Fields (plus a distant galaxy), a tumbling rocky moon for the
 *  Asteroid Belt */
function buildDecor(theme: StageTheme): Decor[] {
  if (theme.kind === "space") {
    return [
      { wx: 760, y: 24, s: GALAXY, par: 0.12 },
      { wx: 60, y: 40, s: bakePlanetRinged(70, PLANET_TEAL, shade(PLANET_TEAL, 0.45), 1, 5), par: 0.22 },
      { wx: 760, y: 150, s: bakePlanet(26, PLANET_BROWN, 2, 3), par: 0.3 },
      { wx: 1420, y: 60, s: bakePlanet(46, PAL.purple, 3, 4), par: 0.25 },
    ];
  }
  if (theme.kind === "belt") {
    return [{ wx: 820, y: 70, s: bakePlanet(40, PAL.grey, 4, 6), par: 0.25 }];
  }
  return [];
}
interface Panel {
  dx: number;
  dy: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  interval: number;
}
interface Boss {
  x: number;
  y: number;
  t: number;
  entered: boolean;
  panels: Panel[];
  core: { dx: number; dy: number; w: number; h: number; hp: number; maxHp: number; exposed: boolean };
}

function buildTerrain(theme: StageTheme, r: Rng): Terrain | null {
  if (theme.kind === "space" || theme.kind === "belt") return null;
  const cols = Math.ceil(theme.len / T) + 20;
  const ceil = new Array<number>(cols).fill(16);
  const floor = new Array<number>(cols).fill(H - 16);
  let cy = 26;
  let fy = H - 40;
  for (let c = 5; c < cols; c++) {
    if (c % 5 === 0) {
      cy = clamp(cy + r.int(-10, 10), 14, 70);
      fy = clamp(fy + r.int(-10, 10), H - 74, H - 14);
    }
    const minGap = c < 20 ? 92 : theme.kind === "ice" ? 64 : 58;
    if (fy - cy < minGap) fy = Math.min(H - 14, cy + minGap);
    ceil[c] = cy;
    floor[c] = fy;
  }
  for (let c = 0; c < 5; c++) {
    ceil[c] = 16;
    floor[c] = H - 16;
  }
  return { ceil, floor };
}

function buildStage(stageIdx: number, theme: StageTheme, r: Rng): StageData {
  const terrain = buildTerrain(theme, r);
  const at = (arr: number[], wx: number) => arr[clamp(Math.floor(wx / T), 0, arr.length - 1)];
  const floorAt = (wx: number) => (terrain ? at(terrain.floor, wx) : H - 16);
  const ceilAt = (wx: number) => (terrain ? at(terrain.ceil, wx) : 16);
  const foes: Foe[] = [];
  const terrainStage = theme.kind === "cave" || theme.kind === "volcano" || theme.kind === "ice";
  // open space/belt stages spawn a formation roughly every 2-3 seconds (scroll is ~1px/frame,
  // ~60px/s) right from the start, so kids meet enemies — and capsules — fast.
  let wx = terrainStage ? 420 : 130;
  while (wx < theme.len - 220) {
    const roll = r.int(0, 6 + stageIdx);
    if (terrainStage) {
      if (roll <= 1) {
        const onCeil = r.chance(0.5);
        const y = onCeil ? ceilAt(wx) + 2 : floorAt(wx) - 14;
        foes.push(mkFoe("turret", wx, y, { w: 20, h: 14, hp: 3, maxHp: 3, mount: onCeil ? "ceil" : "floor" }));
        wx += r.int(190, 270);
      } else if (roll === 2) {
        const onFloor = r.chance(0.6);
        const y = onFloor ? floorAt(wx) - 10 : ceilAt(wx) + 2;
        foes.push(mkFoe("hatch", wx, y, { w: 16, h: 10, hp: 5, maxHp: 5, spawnT: r.int(90, 170), mount: onFloor ? "floor" : "ceil" }));
        wx += r.int(230, 310);
      } else if (roll === 3 && theme.kind === "ice") {
        foes.push(mkFoe("icicle", wx, ceilAt(wx) + 2, { w: 8, h: 12, hp: 1, maxHp: 1, mount: "ceil" }));
        wx += r.int(90, 160);
      } else if (roll >= 4) {
        const midY = (ceilAt(wx) + floorAt(wx)) / 2;
        foes.push(mkFoe("drone", wx, midY, { w: 16, h: 8, hp: 1, maxHp: 1, baseY: midY, phase: r.range(0, 6), amp: Math.min(16, (floorAt(wx) - ceilAt(wx)) / 2 - 8) }));
        wx += r.int(150, 230);
      } else {
        wx += 110;
      }
    } else {
      if (roll <= 2) {
        // a sine-wave snake formation — the main wave of the open stages
        const n = 5 + Math.min(3, stageIdx);
        const baseY = r.range(40, 150);
        const amp = r.range(14, 30);
        const seedPhase = r.range(0, 6);
        for (let i = 0; i < n; i++) foes.push(mkFoe("snake", wx + i * 14, baseY, { w: 10, h: 10, hp: 1, maxHp: 1, baseY, amp, phase: seedPhase + i * 0.5, forceDrop: i === n - 1 }));
        wx += r.int(150, 210);
      } else if (roll === 3) {
        foes.push(mkFoe("rock", wx, r.range(30, 170), { w: 0, h: 0, hp: 3, maxHp: 3, r: r.pick([8, 10, 12]), phase: r.range(0, 6) }));
        wx += r.int(110, 170);
      } else if (roll === 4) {
        foes.push(mkFoe("turret", wx, r.range(40, 160), { w: 20, h: 14, hp: 3, maxHp: 3, mount: "float" }));
        wx += r.int(150, 210);
      } else {
        // a drone, often paired with a wingmate for a fuller-feeling wave
        const y = r.range(30, 170);
        foes.push(mkFoe("drone", wx, y, { w: 16, h: 8, hp: 1, maxHp: 1, baseY: y, phase: r.range(0, 6), amp: 16 }));
        if (r.chance(0.5)) {
          const y2 = clamp(y + r.pick([-28, 28]), 30, 170);
          foes.push(mkFoe("drone", wx + 22, y2, { w: 16, h: 8, hp: 1, maxHp: 1, baseY: y2, phase: r.range(0, 6), amp: 16 }));
        }
        wx += r.int(110, 170);
      }
    }
  }
  // each stage's nebula blends two muted hues (never the bright saturated play-object colours):
  // a deep violet/navy base into a dusky second tone that nods at the stage's own palette
  const NEBULA_HUES: Record<StageKind, [string, string]> = {
    space: ["#2a1f52", "#1f4a52"],
    belt: ["#3a2a1a", "#4a3220"],
    cave: ["#2a1f52", "#3a2050"],
    volcano: ["#3a1424", "#44201a"],
    ice: ["#1a2440", "#20384a"],
  };
  const [nebA, nebB] = NEBULA_HUES[theme.kind];
  const nebula = bakeNebula(220, H, nebA, nebB, theme.glowColor, stageIdx * 53 + 9);
  const fg = theme.kind === "belt" ? bakeForegroundAsteroids(180, 20, stageIdx * 71 + 3) : theme.kind === "space" ? bakeForegroundGirders(224, 18, stageIdx * 83 + 5) : null;
  let art: StageArt;
  if (terrain) {
    art = { terrain: bakeTerrainArt(theme, terrain, stageIdx * 97 + 3), ambient: bakeAmbient(128, H, theme.glowColor, stageIdx * 31 + 7, 9), decor: [], nebula, fg };
  } else if (theme.kind === "belt") {
    art = { terrain: null, ambient: bakeAsteroidField(170, 150, stageIdx * 41 + 11, theme.rockColor), decor: buildDecor(theme), nebula, fg };
  } else {
    art = { terrain: null, ambient: null, decor: buildDecor(theme), nebula, fg };
  }
  const embers: Ember[] =
    theme.kind === "volcano" || theme.kind === "ice"
      ? Array.from({ length: 16 }, () => ({ x: r.range(0, W), y: r.range(PLAY_TOP, PLAY_BOT), vy: theme.kind === "volcano" ? -(0.2 + r.range(0, 0.35)) : 0.3 + r.range(0, 0.45) }))
      : [];
  return { terrain, floorAt, ceilAt, foes, art, embers };
}

function spawnBoss(stageIdx: number, r: Rng): Boss {
  const n = stageIdx >= 2 ? 4 : 3;
  const hp = 4 + stageIdx * 2;
  const coreHp = 10 + stageIdx * 7;
  const slots = [
    { dx: 2, dy: 2 },
    { dx: 2, dy: BOSS_H - 22 },
    { dx: BOSS_W - 22, dy: 2 },
    { dx: BOSS_W - 22, dy: BOSS_H - 22 },
  ].slice(0, n);
  return {
    x: W + 40,
    y: BOSS_BASE_Y,
    t: 0,
    entered: false,
    panels: slots.map((s) => ({ dx: s.dx, dy: s.dy, w: 20, h: 20, hp, maxHp: hp, interval: r.int(75, 115) })),
    core: { dx: BOSS_W / 2 - 10, dy: BOSS_H / 2 - 10, w: 20, h: 20, hp: coreHp, maxHp: coreHp, exposed: false },
  };
}

const MAX_PARTS = 150;

function create(seed: number): GameInstance {
  const r = rng(seed);
  let stageIdx = 0;
  let sx = 0;
  let stageData = buildStage(0, STAGES[0], r);
  let boss: Boss | null = null;
  let phase: "fly" | "bossIn" | "boss" | "clear" = "fly";
  let clearT = 0;
  let introT = 90;
  let frame = 0;
  let shake = 0;
  let flash = 0;
  let over = false;

  const ship = { x: 26, y: H / 2 - SHIP_H / 2, lives: 3, inv: 120, dead: -1, cool: 0, missileCool: 0, speedLevel: 0, gunLevel: 0, missileLevel: 0, optionsCount: 0, shieldHits: 0, barIndex: -1, bank: 0, buyFlash: 0 };
  let hintT = 0;
  let firstCapsule = true;
  const trail: { x: number; y: number }[] = [];
  const shots: Shot[] = [];
  const missiles: Missile[] = [];
  const eshots: EShot[] = [];
  const caps: Cap[] = [];
  const parts: Part[] = [];
  const rings: Ring[] = [];
  const stars = Array.from({ length: 80 }, (_, i) => ({ x: r.range(0, W), y: r.range(0, H), layer: i % 3, tw: r.int(0, 140) }));

  const burst = (x: number, y: number, n: number, colors: string[]) => {
    for (let i = 0; i < n && parts.length < MAX_PARTS; i++) {
      const a = r.range(0, Math.PI * 2);
      const s = r.range(0.4, 2.3);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: r.int(12, 28), color: r.pick(colors) });
    }
  };
  const addRing = (x: number, y: number, maxLife: number, color: string) => {
    if (rings.length < 6) rings.push({ x, y, r: 2, life: maxLife, maxLife, color });
  };
  const screenX = (f: Foe) => f.wx + f.drift - sx;
  const shipHit = () => ({ x: ship.x + HIT_DX, y: ship.y + HIT_DY, w: HIT_W, h: HIT_H });

  const killFoe = (f: Foe, io: IO) => {
    if (f.hp <= 0) return;
    f.hp = 0;
    const sxp = screenX(f);
    const cx = sxp + (f.kind === "rock" ? 0 : f.w / 2);
    const cy = f.y + (f.kind === "rock" ? 0 : f.h / 2);
    burst(cx, cy, 10, [PAL.yellow, PAL.orange, PAL.white]);
    if (f.kind === "turret" || f.kind === "hatch" || f.kind === "rock") addRing(cx, cy, 16, PAL.orange);
    io.score(FOE_SCORE[f.kind]);
    io.sfx.play("explode");
    if (f.forceDrop || r.chance(DROP_CHANCE[f.kind])) caps.push({ wx: f.wx + f.drift, y: f.y, t: 0 });
  };

  const hurtShip = (io: IO) => {
    if (ship.dead >= 0 || ship.inv > 0) return;
    if (ship.shieldHits > 0) {
      ship.shieldHits--;
      ship.inv = 55;
      burst(ship.x + 10, ship.y + 6, 10, [PAL.cyan, PAL.white]);
      io.sfx.play("zap");
      return;
    }
    ship.dead = 0;
    shake = 14;
    burst(ship.x + 10, ship.y + 6, 26, [PAL.white, PAL.yellow, PAL.orange, PAL.red]);
    io.sfx.play("die");
    io.sfx.noise?.(260, 0.3, 500, 60);
  };

  const respawn = () => {
    ship.dead = -1;
    ship.x = 26;
    ship.y = H / 2 - SHIP_H / 2;
    ship.inv = 150;
    ship.gunLevel = Math.max(0, ship.gunLevel - 1);
    ship.speedLevel = Math.max(0, ship.speedLevel - 1);
    ship.optionsCount = 0;
    ship.shieldHits = 0;
    ship.barIndex = -1;
    trail.length = 0;
  };

  const optionPos = (i: number) => {
    const idx = trail.length - 1 - (i + 1) * 14;
    return idx >= 0 ? trail[idx] : null;
  };

  const buyUpgrade = (io: IO) => {
    const k = ship.barIndex;
    if (k === 0) ship.speedLevel = Math.min(3, ship.speedLevel + 1);
    else if (k === 1) ship.missileLevel = Math.min(2, ship.missileLevel + 1);
    else if (k === 2) ship.gunLevel = Math.max(ship.gunLevel, 1);
    else if (k === 3) ship.gunLevel = 2;
    else if (k === 4) ship.optionsCount = Math.min(2, ship.optionsCount + 1);
    else if (k === 5) ship.shieldHits = 3;
    ship.barIndex = -1;
    ship.buyFlash = 14;
    io.sfx.play("powerup");
    burst(ship.x + 10, ship.y + 6, 10, [PAL.yellow, PAL.white, BAR_COLORS[k]]);
  };

  const collectCap = (io: IO) => {
    ship.barIndex = ship.barIndex < 0 ? 0 : (ship.barIndex + 1) % 6;
    io.score(120);
    io.sfx.play("pickup");
    io.sfx.tone(520 + ship.barIndex * 60, 8, "square", 0.12);
    if (firstCapsule) {
      firstCapsule = false;
      hintT = 200;
    }
  };

  const fireShip = (io: IO) => {
    const sxp = ship.x + SHIP_W + 2;
    const syp = ship.y + 5;
    const spd = 4.2;
    const pierce = ship.gunLevel >= 2 ? 3 : 0;
    const laser = ship.gunLevel >= 2;
    if (ship.gunLevel === 1) {
      shots.push({ x: sxp, y: syp, vx: spd, vy: 0, life: 60, pierce: 0, laser: false });
      shots.push({ x: sxp, y: syp, vx: spd * 0.9, vy: -spd * 0.55, life: 60, pierce: 0, laser: false });
    } else {
      shots.push({ x: sxp, y: syp, vx: spd, vy: 0, life: 60, pierce, laser });
    }
    io.sfx.play(laser ? "laser" : "shoot");
    const n = Math.min(2, ship.optionsCount);
    for (let i = 0; i < n; i++) {
      const p = optionPos(i);
      if (!p) continue;
      shots.push({ x: p.x + 4, y: p.y + 4, vx: spd, vy: 0, life: 60, pierce, laser });
    }
    if (ship.missileLevel > 0 && ship.missileCool <= 0) {
      for (let i = 0; i < ship.missileLevel; i++) missiles.push({ x: sxp, y: syp + 4, vx: 2.5, vy: -1.3 - i * 0.9, life: 200 });
      ship.missileCool = 42;
      io.sfx.play("blip");
    }
  };

  const spawnWalker = (h: Foe) => {
    stageData.foes.push(mkFoe("walker", h.wx, h.y, { w: 16, h: 8, hp: 1, maxHp: 1, mount: h.mount }));
  };

  const hitFoes = (x: number, y: number, w: number, h: number, io: IO): boolean => {
    for (const f of stageData.foes) {
      if (f.hp > 0 && overlap({ x, y, w, h }, { x: screenX(f), y: f.y, w: f.w, h: f.h })) {
        f.hp--;
        f.flash = 6;
        if (f.hp <= 0) killFoe(f, io);
        else io.sfx.play("hit");
        return true;
      }
    }
    return false;
  };

  const hitBoss = (x: number, y: number, w: number, h: number, io: IO): boolean => {
    if (!boss || phase !== "boss") return false;
    const b = boss;
    for (const p of b.panels) {
      if (p.hp > 0 && overlap({ x, y, w, h }, { x: b.x + p.dx, y: b.y + p.dy, w: p.w, h: p.h })) {
        p.hp--;
        io.sfx.play("hit");
        if (p.hp <= 0) {
          burst(b.x + p.dx + p.w / 2, b.y + p.dy + p.h / 2, 12, [PAL.orange, PAL.yellow, PAL.white]);
          addRing(b.x + p.dx + p.w / 2, b.y + p.dy + p.h / 2, 18, PAL.yellow);
          io.score(300);
          if (r.chance(0.5)) caps.push({ wx: sx + b.x + p.dx, y: b.y + p.dy, t: 0 });
        }
        return true;
      }
    }
    if (b.core.exposed && overlap({ x, y, w, h }, { x: b.x + b.core.dx, y: b.y + b.core.dy, w: b.core.w, h: b.core.h })) {
      b.core.hp--;
      io.sfx.play("hit");
      if (b.core.hp <= 0) defeatBoss(io);
      return true;
    }
    return false;
  };

  const defeatBoss = (io: IO) => {
    const b = boss!;
    shake = 26;
    flash = 16;
    for (let i = 0; i < 8; i++) burst(b.x + r.range(0, BOSS_W), b.y + r.range(0, BOSS_H), 14, [PAL.yellow, PAL.orange, PAL.white, PAL.purple]);
    addRing(b.x + BOSS_W / 2, b.y + BOSS_H / 2, 26, PAL.white);
    addRing(b.x + BOSS_W / 2, b.y + BOSS_H / 2, 20, PAL.orange);
    io.score(2000 + stageIdx * 500);
    io.sfx.play("win");
    io.sfx.slide?.(500, 1100, 350, "square", 0.22);
    caps.push({ wx: sx + b.x + 20, y: b.y + 20, t: 0 }, { wx: sx + b.x + 36, y: b.y + 10, t: 0 });
    eshots.length = 0;
    if (stageIdx >= STAGES.length - 1) {
      over = true;
      io.win();
    } else {
      phase = "clear";
      clearT = 130;
    }
  };

  return {
    update(io) {
      if (over) return;
      frame++;
      shake = Math.max(0, shake - 1);
      flash = Math.max(0, flash - 1);
      ship.buyFlash = Math.max(0, ship.buyFlash - 1);
      hintT = Math.max(0, hintT - 1);
      introT = Math.max(0, introT - 1);
      for (const s of stars) {
        s.x -= 0.15 + s.layer * 0.25;
        if (s.x < 0) {
          s.x = W;
          s.y = r.range(0, H);
        }
      }
      for (const e of stageData.embers) {
        e.y += e.vy;
        e.x += Math.sin(frame * 0.04 + e.y * 0.1) * 0.15;
        if (e.y < PLAY_TOP - 4 || e.y > PLAY_BOT + 4) {
          e.y = e.vy < 0 ? PLAY_BOT + 2 : PLAY_TOP - 2;
          e.x = r.range(0, W);
        }
      }

      const theme = STAGES[stageIdx];
      const inp = io.input;

      // ── ship ──
      if (ship.dead >= 0) {
        ship.dead++;
        if (ship.dead > 70) {
          ship.lives--;
          if (ship.lives <= 0) {
            over = true;
            io.gameOver();
            return;
          }
          respawn();
        }
      } else {
        ship.inv = Math.max(0, ship.inv - 1);
        const dx = (inp.held.right ? 1 : 0) - (inp.held.left ? 1 : 0);
        const dy = (inp.held.down ? 1 : 0) - (inp.held.up ? 1 : 0);
        const spd = SPEEDS[ship.speedLevel];
        const k = dx && dy ? 0.75 : 1;
        ship.x = clamp(ship.x + dx * spd * k, 12, 150);
        ship.y = clamp(ship.y + dy * spd * k, PLAY_TOP + 2, PLAY_BOT - SHIP_H - 1);
        ship.bank = dy;
        ship.cool = Math.max(0, ship.cool - 1);
        ship.missileCool = Math.max(0, ship.missileCool - 1);
        if (inp.held.a && ship.cool === 0) {
          fireShip(io);
          ship.cool = 9;
        }
        // a small thruster puff every few frames, and a soft low engine hum every couple seconds
        if (frame % 4 === 0) burst(ship.x - 2, ship.y + 6, 1, [PAL.orange, "#c9541f"]);
        if (frame % 50 === 0) io.sfx.tone?.(70 + ship.speedLevel * 8, 5, "sawtooth", 0.05);
        if (inp.pressed.b && ship.barIndex >= 0) buyUpgrade(io);
        if (stageData.terrain) {
          const wxAt = sx + ship.x + HIT_DX;
          const top = stageData.ceilAt(wxAt);
          const bot = stageData.floorAt(wxAt);
          if (ship.y + HIT_DY < top || ship.y + HIT_DY + HIT_H > bot) hurtShip(io);
        }
      }
      trail.push({ x: ship.x, y: ship.y });
      if (trail.length > 220) trail.shift();

      // ── stage progression ──
      if (phase === "fly") {
        sx += theme.scroll;
        if (sx >= theme.len) {
          phase = "bossIn";
          boss = spawnBoss(stageIdx, r);
          io.sfx.noise?.(50, 0.3, 300, 900);
          io.sfx.play("hurt");
          // a rising-falling warning siren (two quick slides) rather than one flat tone
          io.sfx.slide?.(380, 760, 180, "square", 0.16);
          io.sfx.slide?.(760, 380, 180, "square", 0.14);
        }
      } else if (phase === "bossIn") {
        const b = boss!;
        b.x -= 1.4;
        if (b.x <= W - 80) {
          b.x = W - 80;
          b.entered = true;
          phase = "boss";
        }
      } else if (phase === "boss") {
        const b = boss!;
        b.t++;
        b.y = BOSS_BASE_Y + Math.sin(b.t * 0.015) * 24;
        b.core.exposed = b.panels.every((p) => p.hp <= 0);
        for (const p of b.panels) {
          if (p.hp > 0 && b.t % p.interval === 0 && ship.dead < 0) {
            const px = b.x + p.dx + p.w / 2;
            const py = b.y + p.dy + p.h / 2;
            const a = Math.atan2(ship.y + 4 - py, ship.x + 5 - px);
            eshots.push({ x: px, y: py, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6, life: 240 });
            io.sfx.play("laser");
          }
        }
        if (b.core.exposed && b.t % 75 === 0 && ship.dead < 0) {
          const cx = b.x + b.core.dx + b.core.w / 2;
          const cy = b.y + b.core.dy + b.core.h / 2;
          for (const a of [-0.3, 0, 0.3]) eshots.push({ x: cx, y: cy, vx: -2 * Math.cos(a), vy: 2 * Math.sin(a), life: 220 });
        }
        if (ship.dead < 0 && overlap(shipHit(), { x: b.x, y: b.y, w: BOSS_W, h: BOSS_H })) hurtShip(io);
      } else if (phase === "clear") {
        clearT--;
        if (clearT <= 0) {
          stageIdx++;
          sx = 0;
          boss = null;
          stageData = buildStage(stageIdx, STAGES[stageIdx], r);
          phase = "fly";
          introT = 90;
        }
      }

      // ── foes ──
      for (const f of stageData.foes) {
        if (f.hp <= 0) continue;
        f.t++;
        f.flash = Math.max(0, f.flash - 1);
        switch (f.kind) {
          case "drone":
            f.y = f.baseY + Math.sin(f.t * 0.05 + f.phase) * f.amp;
            if (ship.dead < 0 && f.t % 150 === 0 && screenX(f) > 4 && screenX(f) < W) {
              const px = screenX(f) + f.w / 2;
              const py = f.y + f.h / 2;
              const a = Math.atan2(ship.y + 4 - py, ship.x + 5 - px);
              eshots.push({ x: px, y: py, vx: Math.cos(a) * (1.2 + stageIdx * 0.1), vy: Math.sin(a) * (1.2 + stageIdx * 0.1), life: 220 });
            }
            break;
          case "snake":
            f.y = f.baseY + Math.sin(frame * 0.06 + f.phase) * f.amp;
            break;
          case "turret":
            if (ship.dead < 0 && f.t % 100 === 0 && screenX(f) > 0 && screenX(f) < W) {
              const px = screenX(f) + f.w / 2;
              const py = f.y + f.h / 2;
              const a = Math.atan2(ship.y + 4 - py, ship.x + 5 - px);
              eshots.push({ x: px, y: py, vx: Math.cos(a) * (1.4 + stageIdx * 0.1), vy: Math.sin(a) * (1.4 + stageIdx * 0.1), life: 240 });
              io.sfx.play("laser");
            }
            break;
          case "hatch":
            f.spawnT--;
            if (f.spawnT <= 0 && screenX(f) > 0 && screenX(f) < W) {
              spawnWalker(f);
              f.spawnT = r.int(170, 270);
            }
            break;
          case "walker": {
            f.drift -= 0.3;
            const wAt = f.wx + f.drift;
            f.y = f.mount === "ceil" ? stageData.ceilAt(wAt) + 2 : stageData.floorAt(wAt) - f.h;
            break;
          }
          case "rock":
            f.y = f.baseY + Math.sin(f.t * 0.03 + f.phase) * 6;
            break;
          case "icicle":
            if (f.falling) {
              f.vy = Math.min(4, f.vy + 0.22);
              f.y += f.vy;
            } else if (screenX(f) < ship.x + 50) f.falling = true;
            break;
        }
        const sxp = screenX(f);
        if (ship.dead < 0 && sxp > -20 && sxp < W + 20 && overlap(shipHit(), { x: sxp, y: f.y, w: f.w || f.r * 2, h: f.h || f.r * 2 })) {
          hurtShip(io);
          if (f.kind !== "turret" && f.kind !== "hatch") killFoe(f, io);
        }
      }

      // ── player shots ──
      for (const s of shots) {
        s.x += s.vx;
        s.y += s.vy;
        s.life--;
        if (s.x > W + 10 || s.life <= 0) {
          s.life = 0;
          continue;
        }
        const w = s.laser ? 10 : 4;
        let hit = hitFoes(s.x - 1, s.y - 1, w, 2, io);
        if (!hit) hit = hitBoss(s.x - 1, s.y - 1, w, 2, io);
        if (hit) {
          if (s.pierce > 0) s.pierce--;
          else s.life = 0;
        }
      }

      // ── missiles (arc down, blow up on terrain or foes) ──
      for (const m of missiles) {
        m.vy += 0.12;
        m.x += m.vx;
        m.y += m.vy;
        m.life--;
        if (m.x > W + 10 || m.y > PLAY_BOT + 12 || m.life <= 0) {
          m.life = 0;
          continue;
        }
        let hit = hitFoes(m.x - 2, m.y - 2, 4, 4, io);
        if (!hit) hit = hitBoss(m.x - 2, m.y - 2, 4, 4, io);
        if (!hit && stageData.terrain) {
          const wxAt = sx + m.x;
          if (m.y <= stageData.ceilAt(wxAt) || m.y >= stageData.floorAt(wxAt)) {
            burst(m.x, m.y, 8, [PAL.orange, PAL.yellow]);
            hit = true;
          }
        }
        if (hit) m.life = 0;
      }

      // ── enemy shots ──
      for (const s of eshots) {
        s.x += s.vx;
        s.y += s.vy;
        s.life--;
        if (ship.dead < 0 && overlap({ x: s.x - 1, y: s.y - 1, w: 3, h: 3 }, shipHit())) {
          s.life = 0;
          hurtShip(io);
        }
      }

      // ── capsules ──
      for (const c of caps) {
        c.t++;
        c.y += Math.sin(c.t * 0.08) * 0.4;
        const sxp = c.wx - sx;
        if (ship.dead < 0 && overlap({ x: ship.x + 2, y: ship.y + 1, w: SHIP_W - 4, h: SHIP_H - 2 }, { x: sxp, y: c.y, w: 11, h: 11 })) {
          collectCap(io);
          c.t = -1;
        }
      }

      // ── particles ──
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.life--;
      }
      for (const ring of rings) {
        ring.r += 1.7;
        ring.life--;
      }

      // ── cleanup ──
      const keep = <X,>(arr: X[], ok: (x: X) => boolean) => {
        for (let i = arr.length - 1; i >= 0; i--) if (!ok(arr[i])) arr.splice(i, 1);
      };
      keep(shots, (s) => s.life > 0);
      keep(missiles, (m) => m.life > 0);
      keep(eshots, (s) => s.life > 0 && s.x > -20 && s.x < W + 20 && s.y > -20 && s.y < H + 20);
      keep(caps, (c) => c.t >= 0 && c.wx - sx > -30);
      keep(parts, (p) => p.life > 0);
      keep(rings, (ring) => ring.life > 0);
      keep(stageData.foes, (f) => f.hp > 0);
    },

    draw(g: Gfx) {
      const theme = STAGES[stageIdx];
      g.clear(theme.bg);
      // backdrop: a painted nebula (farthest, slowest), then planets / asteroid field / glow
      // motes, parallax-scrolled slower than the foreground so the stage reads with real depth
      // instead of one flat band of colour
      const art = stageData.art;
      if (art.nebula) drawStrip(g, art.nebula, sx * 0.1, 0);
      if (art.ambient) drawStrip(g, art.ambient, sx * (stageData.terrain ? 0.4 : 0.3), stageData.terrain ? 0 : H / 2 - 75);
      for (const d of art.decor) {
        const dxp = d.wx - sx * d.par;
        if (dxp > -80 && dxp < W + 80) g.sprite(d.s, dxp, d.y);
      }
      // stars are the open-space/belt sky; underground stages get their own ambient glow + embers
      if (!stageData.terrain) {
        for (const s of stars) {
          const sparkle = s.layer === 2 && (frame + s.tw) % 140 < 5;
          if (sparkle) {
            g.rect(s.x - 1, s.y, 3, 1, PAL.white);
            g.rect(s.x, s.y - 1, 1, 3, PAL.white);
          } else {
            g.rect(s.x, s.y, s.layer === 2 ? 2 : 1, 1, s.layer === 0 ? PAL.dark : s.layer === 1 ? PAL.grey : PAL.white);
          }
        }
      }

      const sxs = shake ? r.range(-2, 2) : 0;
      const sys = shake ? r.range(-2, 2) : 0;
      g.camera(sxs, sys);

      // terrain: one big sprite baked pixel-exact to ceilAt/floorAt (see bakeTerrainArt)
      if (art.terrain) g.sprite(art.terrain, -sx, 0);

      // rising embers (volcano) / falling snow (ice) drifting through the whole corridor
      for (const e of stageData.embers) {
        if (theme.kind === "volcano") g.rect(e.x, e.y, 1, 1, frame % 8 < 4 ? PAL.yellow : PAL.orange);
        else g.rect(e.x, e.y, 1, 1, PAL.white);
      }

      // foes
      for (const f of stageData.foes) {
        const sxp = screenX(f);
        if (sxp < -24 || sxp > W + 24) continue;
        // a hit flash swaps in a precise white silhouette of the same sprite, not a blocky
        // rectangle, so bigger/jagged art still reads cleanly when it takes a hit
        const flashed = f.flash % 2 === 1;
        const frm2 = Math.floor(frame / 8) % 2;
        if (f.kind === "drone") drawBig(g, (flashed ? DRONE_FLASH : DRONE)[frm2], sxp, f.y, f.w, f.h, 1.45);
        else if (f.kind === "snake") {
          // a bigger, shaded, outlined bead: dark rim, mid body, a bright highlight dot
          const cxp = sxp + 5;
          const cyp = f.y + 5;
          if (flashed) g.circle(cxp, cyp, 6.5, PAL.white);
          else {
            g.circle(cxp, cyp, 6.5, "#140c28");
            g.circle(cxp, cyp, 5.5, shade(PAL.pink, -0.2));
            g.circle(cxp - 1, cyp - 1, 3, PAL.pink);
            g.circle(cxp - 2, cyp - 2, 1.2, PAL.white);
          }
        } else if (f.kind === "turret") drawBig(g, flashed ? TURRET_FLASH : TURRET, sxp, f.y, f.w, f.h, 1.4, f.mount === "ceil");
        else if (f.kind === "hatch") {
          g.sprite(flashed ? HATCH_PLATE_FLASH : HATCH_PLATE, sxp - 1, f.y - 1);
          g.rect(sxp + 2, f.y + (f.mount === "ceil" ? f.h - 3 : 0), f.w - 4, 3, frame % 10 < 5 ? PAL.orange : PAL.yellow);
        } else if (f.kind === "walker") drawBig(g, (flashed ? WALKER_FLASH : WALKER)[Math.floor(f.t / 6) % 2], sxp, f.y, f.w, f.h, 1.45, f.mount === "ceil");
        else if (f.kind === "rock") {
          const set = (flashed ? ASTEROID_FLASH : ASTEROIDS)[f.r] ?? ASTEROIDS[8];
          g.sprite(set[Math.floor(f.t / 10) % 2], sxp - f.r, f.y - f.r);
        } else if (f.kind === "icicle") g.sprite(flashed ? ICICLE_FLASH : ICICLE, sxp - 1, f.y - 1);
      }

      // boss: a riveted plated hull with a bright centre keel, each panel shaded/outlined with a
      // real horizontal health strip, and a dithered pulsing glow once the core is exposed
      if (boss && (phase === "bossIn" || phase === "boss")) {
        const b = boss;
        g.rect(b.x, b.y, BOSS_W, BOSS_H, "#1c1f36");
        g.rect(b.x + 3, b.y + 2, BOSS_W - 6, BOSS_H - 4, "#2a2e4a");
        g.rect(b.x + BOSS_W / 2 - 5, b.y + 2, 10, BOSS_H - 4, "#3a3f66");
        for (let yy = 4; yy < BOSS_H - 2; yy += 7) {
          g.rect(b.x + 1, b.y + yy, 2, 2, PAL.grey);
          g.rect(b.x + BOSS_W - 3, b.y + yy, 2, 2, PAL.grey);
        }
        g.box(b.x, b.y, BOSS_W, BOSS_H, PAL.black);
        for (const p of b.panels) {
          if (p.hp <= 0) continue;
          const hurt = p.hp < p.maxHp;
          g.rect(b.x + p.dx, b.y + p.dy, p.w, p.h, hurt ? shade(PAL.grey, -0.18) : PAL.grey);
          g.rect(b.x + p.dx + 2, b.y + p.dy + 2, p.w - 4, 2, shade(PAL.grey, 0.3));
          g.rect(b.x + p.dx + 2, b.y + p.dy + p.h - 5, Math.max(2, ((p.w - 4) * p.hp) / p.maxHp), 3, PAL.red);
          g.box(b.x + p.dx, b.y + p.dy, p.w, p.h, PAL.black);
        }
        const cc = b.core;
        const ccx = b.x + cc.dx + cc.w / 2;
        const ccy = b.y + cc.dy + cc.h / 2;
        if (cc.exposed) {
          const pr = cc.w / 2 + 3 + Math.sin(frame * 0.3) * 1.5;
          for (let a = 0; a < Math.PI * 2; a += 0.35) if (Math.sin(a * 4 + frame * 0.1) > 0) g.rect(ccx + Math.cos(a) * pr, ccy + Math.sin(a) * pr, 1, 1, PAL.orange);
        }
        g.circle(ccx, ccy, cc.w / 2, cc.exposed ? (frame % 10 < 5 ? PAL.yellow : PAL.orange) : PAL.dark);
        g.circle(ccx, ccy, cc.w / 2 - 3, cc.exposed ? PAL.white : shade(PAL.dark, -0.15));
      }

      // capsules: a soft breathing halo (never a flat glow dome) behind a glossy pill sprite
      for (const c of caps) {
        const sxp = c.wx - sx;
        if (sxp < -14 || sxp > W + 14) continue;
        const pulse = Math.abs((frame % 20) - 10);
        g.alpha(0.45 - pulse * 0.03);
        g.circle(sxp + 5, c.y + 5, 7, PAL.yellow);
        g.alpha(1);
        g.sprite(CAPSULE, sxp, c.y);
      }

      for (const s of eshots) g.circle(s.x, s.y, 2, Math.floor(frame / 4) % 2 ? PAL.pink : PAL.red);
      for (const m of missiles) g.circle(m.x, m.y, 2.5, PAL.orange);
      for (const s of shots) {
        if (s.laser) g.rect(s.x - 6, s.y - 1, 10, 2, PAL.pink);
        else g.rect(s.x - 2, s.y - 1, 4, 2, PAL.yellow);
      }

      // ship
      if (ship.dead < 0 && !(ship.inv > 0 && Math.floor(ship.inv / 4) % 2)) {
        // options: small glowing orbs (~8px) trailing the ship along its recorded path
        for (let i = 0; i < Math.min(2, ship.optionsCount); i++) {
          const p = optionPos(i);
          if (p) {
            g.circle(p.x + 4, p.y + 4, 4, PAL.blue);
            g.circle(p.x + 4, p.y + 4, 2, PAL.cyan);
          }
        }
        // layered engine flame: a longer dim tail with a hot bright core, flickering each frame
        const flameLen = 5 + (frame % 4 < 2 ? 3 : 0) + (ship.speedLevel >= 2 ? 2 : 0);
        const tailX = ship.x - 3;
        g.rect(tailX - flameLen, ship.y + 5, flameLen, 3, frame % 6 < 3 ? PAL.orange : "#c9541f");
        g.rect(tailX - flameLen * 0.55, ship.y + 5.5, flameLen * 0.55, 2, PAL.yellow);
        g.rect(tailX - 2, ship.y + 6, 2, 1, PAL.white);
        g.sprite(ship.bank > 0 ? SHIP_BANK : SHIP, ship.x - SHIP_DRAW_DX, ship.y - SHIP_DRAW_DY, { flipY: ship.bank > 0, scale: SHIP_SCALE });
        // a quick white muzzle flash right after firing, at the orange nose
        if (ship.cool > 6) {
          g.alpha((ship.cool - 6) / 3);
          g.circle(ship.x + SHIP_W + 2, ship.y + 5, 3, PAL.white);
          g.alpha(1);
        }
        if (ship.shieldHits > 0) {
          // a dithered bubble (never a flat glow dome) that pulses gently
          const pr = 15 + Math.sin(frame * 0.2) * 1.5;
          for (let a = 0; a < Math.PI * 2; a += 0.26) {
            const d = 1 - (0.5 + 0.5 * Math.sin(a * 5 + frame * 0.1));
            if (d > 0.35) g.rect(ship.x + 10 + Math.cos(a) * pr, ship.y + 6 + Math.sin(a) * pr * 0.85, 1, 1, PAL.cyan);
          }
        }
      }
      for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
      // shockwave rings: a dotted circle that expands and fades — never a filled glow disc
      for (const ring of rings) {
        const t = ring.life / ring.maxLife;
        const step = 0.5 + (1 - t) * 0.3;
        for (let a = 0; a < Math.PI * 2; a += step) g.rect(ring.x + Math.cos(a) * ring.r, ring.y + Math.sin(a) * ring.r * 0.85, 1, 1, ring.color);
      }
      // foreground parallax band: kept to the top/bottom slivers only, so it's pure decor that
      // never crosses the ship's own flight lane
      if (art.fg) {
        const bandH = art.fg.rows.length;
        g.alpha(0.8);
        drawStrip(g, art.fg, sx * 1.5, PLAY_TOP);
        drawStrip(g, art.fg, -sx * 1.5 + 40, PLAY_BOT - bandH);
        g.alpha(1);
      }
      g.camera(0, 0);

      if (flash) {
        g.alpha(flash / 30);
        g.rect(0, 0, W, H, PAL.white);
        g.alpha(1);
      }

      // top HUD: a framed panel (thin lit edge + corner ticks) rather than a plain band
      g.rect(0, 0, W, PLAY_TOP, "rgba(13,11,26,0.72)");
      g.rect(0, PLAY_TOP - 1, W, 1, shade(theme.accent, -0.3));
      g.rect(0, 0, 3, 1, theme.accent);
      g.rect(W - 3, 0, 3, 1, theme.accent);
      for (let i = 0; i < ship.lives; i++) g.text("♥", 4 + i * 8, 1, PAL.red);
      if (phase === "boss" || phase === "bossIn") g.text(theme.bossName, W / 2, 1, PAL.red, { align: "center" });
      else g.text(theme.name, W / 2, 1, theme.accent, { align: "center" });
      g.text(`${stageIdx + 1}/5`, W - 4, 1, PAL.white, { align: "right" });

      if (phase === "boss" && boss) {
        const b = boss;
        const sumHp = b.panels.reduce((a, p) => a + p.hp, 0) + b.core.hp;
        const sumMax = b.panels.reduce((a, p) => a + p.maxHp, 0) + b.core.maxHp;
        g.rect(70, 9, 116, 3, PAL.dark);
        g.rect(70, 9, (116 * sumHp) / sumMax, 3, PAL.red);
      } else if (phase === "fly") {
        g.rect(70, 9, 116, 2, PAL.dark);
        g.rect(70, 9, (116 * clamp(sx / theme.len, 0, 1)), 2, theme.accent);
      }

      // bottom power bar — the lit slot pulses so it's unmistakable even on a small screen
      const barY = H - 13;
      g.rect(0, barY - 1, W, 14, "rgba(13,11,26,0.7)");
      const cellW = 36;
      const startX = (W - cellW * 6) / 2;
      const pulse = frame % 20 < 10;
      for (let i = 0; i < 6; i++) {
        const cx = startX + i * cellW;
        const lit = ship.barIndex === i;
        if (lit) {
          g.alpha(0.5);
          g.rect(cx - 1, barY - 2, cellW, 15, PAL.white);
          g.alpha(1);
          g.rect(cx + 1, barY, cellW - 2, 11, pulse ? PAL.white : BAR_COLORS[i]);
          g.rect(cx + 2, barY + 1, cellW - 4, 2, shade(pulse ? PAL.white : BAR_COLORS[i], 0.35));
          g.box(cx, barY - 1, cellW - 1, 13, PAL.white);
          g.text(BAR_LABELS[i], cx + cellW / 2, barY + 2, pulse ? BAR_COLORS[i] : PAL.black, { align: "center" });
        } else {
          g.rect(cx + 1, barY, cellW - 2, 11, PAL.dark);
          g.rect(cx + 2, barY + 1, cellW - 4, 1, shade(PAL.dark, 0.15));
          g.box(cx + 1, barY, cellW - 2, 11, PAL.black);
          g.text(BAR_LABELS[i], cx + cellW / 2, barY + 2, BAR_COLORS[i], { align: "center" });
        }
      }
      if (ship.buyFlash > 0) g.text("POWER UP!", W / 2, barY - 9, PAL.yellow, { align: "center" });
      else if (hintT > 0) g.text("B = POWER UP!", W / 2, barY - 9, pulse ? PAL.yellow : PAL.white, { align: "center" });

      if (phase === "clear") g.text(`STAGE CLEAR! +${2000 + stageIdx * 500}`, W / 2, H / 2 - 4, PAL.yellow, { align: "center", size: 2 });
      else if (phase === "fly" && introT > 0 && sx < 10) g.text(theme.name.toUpperCase(), W / 2, H / 2 - 4, theme.accent, { align: "center", size: 2 });
      else if (phase === "bossIn") g.text("INCOMING!", W / 2, H / 2 - 4, PAL.red, { align: "center", size: 2 });
    },
  };
}

export const cometPatrol: RetroGameDef = {
  id: "comet-patrol",
  title: "Comet Patrol",
  blurb: "Fly through 5 stages, grab power capsules and smash the shielded bosses!",
  genre: "Shooter",
  emoji: "☄️",
  color: PAL.cyan,
  controls: "✚ fly · A fire (hold) · B power up from the bar",
  pad: { dpad: "4", a: "Fire", b: "Power up" },
  create,
};
