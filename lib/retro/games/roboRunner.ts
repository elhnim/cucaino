// ROBO RUNNER — an original action-platformer in the spirit of the classic 8-bit robot-blaster
// games. A little blue robot kid with an arm cannon picks a boss from the Stage Select screen,
// runs a themed stage full of platforms, gaps, ladders and robot enemies to a shutter door, then
// fights the boss behind it. Beating a boss grants its weapon (own ammo bar) — each weapon is the
// secret weakness of exactly one other boss, classic rock-paper-scissors. Beat all four and the
// Fortress unlocks: a tougher run, a rematch with all four bosses, then a final boss that cycles
// through their attacks (and their weaknesses) as it fights. Enemies "fizz" into bolts and sparks
// — no real-world violence. (Original game, original art, original characters.)
import { H, PAL, W, clamp, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

const T = 16;
const ROWS = 14; // chunks are 9 rows tall (7 content + 2 ground); top 5 rows are sky
const GRAV = 0.3;
const MAXFALL = 5.5;
const COYOTE = 6;
const BUFFER = 6;
const SOLID = new Set(["#", "=", "D"]);
const MAXHP = 28;
const HERO_W = 12;
const HERO_H = 22; // a head taller than the old build — proper NES-hero proportions

/** pad every row to a fixed width so pixel art can be authored loosely — never breaks on a short row */
const padRows = (rows: string[], w: number) => rows.map((r) => r.padEnd(w, ".").slice(0, w));
const spr = (rows: string[], w: number, pal: Record<string, string>) => sprite(padRows(rows, w), pal);

// ── weapons: the buster is free & infinite, the rest are boss rewards with their own ammo bar ──
type WeaponId = "buster" | "bubble" | "leaf" | "spark" | "ice";
interface WeaponDef { id: WeaponId; name: string; color: string; dmg: number; cost: number; speed: number; angles: number[]; arc?: boolean }
const WEAPONS: WeaponDef[] = [
  { id: "buster", name: "BUSTER", color: PAL.yellow, dmg: 1, cost: 0, speed: 3.4, angles: [0] },
  { id: "bubble", name: "BUBBLE", color: PAL.cyan, dmg: 2, cost: 5, speed: 2.1, angles: [0], arc: true },
  { id: "leaf", name: "LEAF", color: PAL.lime, dmg: 2, cost: 5, speed: 2.6, angles: [-0.26, 0.26] },
  { id: "spark", name: "SPARK", color: PAL.purple, dmg: 2, cost: 6, speed: 3.6, angles: [-0.22, 0, 0.22] },
  { id: "ice", name: "ICE", color: PAL.white, dmg: 2, cost: 7, speed: 3, angles: [0] },
];
const WEAPON_BY_STAGE: WeaponId[] = ["bubble", "leaf", "spark", "ice"]; // beating boss i grants this
const AMMO_MAX = 100;

// ── bosses: each weak to exactly one weapon, forming a 4-way rock-paper-scissors ring ──
// one shared face template (two eyes + a mouth), recoloured per boss with its own "fin" on top
const FACE_BASE = [".kaaaaaaaak.", "kaawwaawwaak", "kaawwaawwaak", "kaaaaaaaaaak", ".kaakkkkaak.", "..kaaaaaak..", "...kkkkkk..."];
const BOSS_FINS = ["..kk.kk.kk..", "...kkkkkk...", ".kk.kkkk.kk.", "..k.kkkkkk.."];
interface BossShot { vx: number; vy: number; arc?: boolean }
interface BossDef {
  id: number;
  name: string;
  body: string;
  accent: string;
  weak: WeaponId;
  cooldown: number;
  icon: string[];
  fire: (b: { x: number; y: number }, h: { x: number; y: number }, t: number) => BossShot[];
}
const aimed = (b: { x: number; y: number }, h: { x: number; y: number }, spd: number): BossShot => {
  const a = Math.atan2(h.y - b.y, h.x - b.x);
  return { vx: Math.cos(a) * spd, vy: Math.sin(a) * spd };
};
const BOSS_DEFS: BossDef[] = [
  {
    id: 0,
    name: "BUBBLE BOT",
    body: PAL.cyan,
    accent: PAL.navy,
    weak: "spark",
    cooldown: 85,
    icon: [BOSS_FINS[0], ...FACE_BASE],
    fire: (b, h) => {
      const dx = Math.sign(h.x - b.x) || 1;
      return [{ vx: dx * 1.6, vy: -2.6, arc: true }];
    },
  },
  {
    id: 1,
    name: "LEAF BOT",
    body: PAL.green,
    accent: PAL.lime,
    weak: "ice",
    cooldown: 130,
    icon: [BOSS_FINS[1], ...FACE_BASE],
    fire: () => {
      const n = 6;
      const out: BossShot[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        out.push({ vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6 });
      }
      return out;
    },
  },
  {
    id: 2,
    name: "SPARK BOT",
    body: PAL.purple,
    accent: PAL.yellow,
    weak: "leaf",
    cooldown: 60,
    icon: [BOSS_FINS[2], ...FACE_BASE],
    fire: (b, h, t) => {
      if (t % (60 * 3) === 0) {
        const a = Math.atan2(h.y - b.y, h.x - b.x);
        return [-0.25, 0, 0.25].map((o) => ({ vx: Math.cos(a + o) * 3.2, vy: Math.sin(a + o) * 3.2 }));
      }
      return [aimed(b, h, 3.4)];
    },
  },
  {
    id: 3,
    name: "ICE BOT",
    body: PAL.sky,
    accent: PAL.white,
    weak: "bubble",
    cooldown: 95,
    icon: [BOSS_FINS[3], ...FACE_BASE],
    fire: (b, h) => {
      const a = Math.atan2(h.y - b.y, h.x - b.x);
      return [-0.3, 0, 0.3].map((o) => ({ vx: Math.cos(a + o) * 2.6, vy: Math.sin(a + o) * 2.6 }));
    },
  },
];
const bossPal = (d: BossDef) => ({ k: PAL.black, a: d.body, w: PAL.white });
const bossIcon = (d: BossDef) => spr(d.icon, 12, bossPal(d));

// ── themed tile/background art: one shared renderer per stage "look" ──
type ThemeId = "coral" | "jungle" | "factory" | "ice" | "fortress";
interface Theme { id: ThemeId; sky: [string, string]; ground: string; groundDark: string; block: string; blockLight: string; detail: string }
const THEMES: Record<ThemeId, Theme> = {
  coral: { id: "coral", sky: ["#0d2a4a", "#1f5a8a"], ground: "#2a5a6a", groundDark: "#163a4a", block: "#3a8a9a", blockLight: "#7ad4e4", detail: PAL.pink },
  jungle: { id: "jungle", sky: ["#0d3a1a", "#1f7a3c"], ground: "#4a3a1e", groundDark: "#2a2410", block: "#5a7a2c", blockLight: "#8fe07a", detail: PAL.lime },
  factory: { id: "factory", sky: ["#19182a", "#3a2a4a"], ground: "#4a4a5a", groundDark: "#262636", block: "#6a6a7e", blockLight: "#a0a0b8", detail: PAL.yellow },
  ice: { id: "ice", sky: ["#3a6a9a", "#bfe8ff"], ground: "#7a9ac0", groundDark: "#4a6a9a", block: "#aee4ff", blockLight: "#ffffff", detail: PAL.cyan },
  fortress: { id: "fortress", sky: ["#0d0b1a", "#2a1b3a"], ground: "#3a3a4e", groundDark: "#1a1a2a", block: "#5a4a6a", blockLight: "#9a5cff", detail: PAL.red },
};
function drawTile(g: Gfx, th: Theme, ch: string, x: number, y: number) {
  if (ch === "#") {
    g.rect(x, y, T, T, th.ground);
    g.rect(x, y, T, 3, th.groundDark === th.ground ? "#ffffff22" : th.groundDark);
    if (th.id === "coral") {
      g.circle(x + 4, y + 10, 2, th.detail);
      g.circle(x + 11, y + 7, 1, PAL.white);
    } else if (th.id === "jungle") {
      g.rect(x + 2, y + 4, 2, 11, th.groundDark);
      g.rect(x + 9, y + 2, 2, 13, th.groundDark);
    } else if (th.id === "factory") {
      g.rect(x + 1, y + 1, 2, 2, th.detail);
      g.rect(x + 13, y + 1, 2, 2, th.detail);
      g.rect(x + 1, y + 13, 2, 2, th.detail);
      g.rect(x + 13, y + 13, 2, 2, th.detail);
    } else if (th.id === "ice") {
      g.line(x + 2, y + 2, x + 7, y + 9, "#ffffffaa");
      g.line(x + 10, y + 3, x + 14, y + 10, "#ffffffaa");
    } else {
      g.rect(x + 6, y + 2, 4, 2, th.detail);
      g.rect(x + 2, y + 9, 3, 3, th.groundDark);
    }
  } else if (ch === "=") {
    g.rect(x, y, T, T, th.block);
    g.rect(x, y, T, 3, th.blockLight);
    g.rect(x, y + T - 2, T, 2, th.groundDark);
    g.rect(x + 1, y + T / 2, T - 2, 1, th.groundDark);
  }
}
function drawBG(g: Gfx, th: Theme, cam: number) {
  g.clear(th.sky[0]);
  g.rect(0, 90, W, 70, th.sky[1]);
  for (let i = 0; i < 6; i++) {
    const x = (((i * 90 - cam * 0.22) % 540) + 540) % 540 - 60;
    if (th.id === "coral") {
      g.circle(x + 20, 160, 26, th.block);
      g.circle(x + 40, 150, 16, th.groundDark);
    } else if (th.id === "jungle") {
      g.rect(x + 16, 60, 8, 100, th.groundDark);
      g.circle(x + 20, 54, 26, th.ground);
    } else if (th.id === "factory") {
      g.rect(x + 10, 70, 12, 90, th.groundDark);
      g.rect(x + 12, 40, 8, 32, th.block);
      g.circle(x + 16, 38, 5, th.detail);
    } else if (th.id === "ice") {
      g.rect(x + 20, 90, 14, 70, th.block);
      g.circle(x + 27, 86, 10, th.blockLight);
    } else {
      g.rect(x + 14, 46, 8, 114, th.groundDark);
      g.circle(x + 18, 42, 4, th.detail);
    }
  }
  for (let i = 0; i < 12; i++) {
    const x = (((i * 47 - cam * 0.08) % 564) + 564) % 564 - 20;
    const y = ((i * 37) % 110) + 10;
    const c = th.id === "coral" ? PAL.cyan : th.id === "jungle" ? PAL.lime : th.id === "factory" ? PAL.yellow : th.id === "ice" ? PAL.white : th.detail;
    g.circle(x, y, th.id === "ice" ? 1 : 1.5, c);
  }
}

// ── level chunks: # ground  = metal block  H ladder  e energy pellet  C checkpoint  D shutter ──
// h hopper  f flyer  u turret  s shielded walker  S start — every chunk carries at least one hazard
const CH: Record<string, string[]> = {
  start: ["................", "................", "................", "................", "................", "................", ".S....h......e.", "################", "################"],
  gapJump: ["................", "......f.........", "................", "................", "................", "................", "................", "######...#######", "######...#######"],
  twoLevel: ["..h.....e......", "..========......", "..H.............", "..H.......s.....", "..H.............", "..H.......e.....", "................", "################", "################"],
  turretTower: ["................", "................", "....====........", "....=u=.........", "....=.=.........", "....=.=.........", "...............u", "################", "################"],
  flyerCanyon: ["................", "......f.....f..", "................", "...==...==...==", "................", "................", "................", "###..........###", "###..........###"],
  shieldBridge: ["................", "................", "................", "................", "................", "................", "........s.......", "####========####", "####........####"],
  checkpt: ["................", "................", "................", "................", "....e...e...e..", "................", "..C.........h..", "################", "################"],
  stairsGap: ["..............e", "............===", "...........====", "..........=====", ".........======", "h....=..........", "................", "####....========", "####....========"],
  doorway: ["................", "................", "................", "................", ".............DD.", ".............DD.", ".............DD.", "################", "################"],
};

interface StageDef { name: string; boss: BossDef; theme: ThemeId; chunks: string[]; hpMul: number; spdMul: number }
const STAGES: StageDef[] = [
  { name: "CORAL CAVERNS", boss: BOSS_DEFS[0], theme: "coral", chunks: ["start", "gapJump", "checkpt", "twoLevel", "doorway"], hpMul: 0.75, spdMul: 0.8 },
  { name: "JUNGLE RUINS", boss: BOSS_DEFS[1], theme: "jungle", chunks: ["start", "twoLevel", "stairsGap", "checkpt", "flyerCanyon", "doorway"], hpMul: 1, spdMul: 1 },
  { name: "CIRCUIT CITY", boss: BOSS_DEFS[2], theme: "factory", chunks: ["start", "turretTower", "gapJump", "checkpt", "stairsGap", "doorway"], hpMul: 1.1, spdMul: 1.1 },
  { name: "FROST PEAK", boss: BOSS_DEFS[3], theme: "ice", chunks: ["start", "twoLevel", "shieldBridge", "stairsGap", "checkpt", "turretTower", "doorway"], hpMul: 1.25, spdMul: 1.2 },
];
const FORTRESS: StageDef = { name: "ROBO FORTRESS", boss: BOSS_DEFS[0], theme: "fortress", chunks: ["start", "turretTower", "shieldBridge", "stairsGap", "twoLevel", "checkpt", "flyerCanyon", "doorway"], hpMul: 1.4, spdMul: 1.3 };

// ── hero sprite: ~2x the old build, built fresh each draw with the weapon colour as the chest core ──
const HERO_TOP = [
  "....kkkkk....",
  "...kwwwwwk...",
  "..kwwwwwwwk..",
  "..kw.vv.vwk..",
  "..kwwwwwwwk..",
  "...kkkkkkk...",
  "....kbbbk....",
  "...kbbbbbk...",
  "..kbbbbbbbk..",
  ".kbbbbcbbbkg.",
  ".kbbbbbbbbkgg",
  ".kbbbbbbbbkgg",
  "..kbbbbbbbk..",
  "..kbbbbbbbk..",
  "...kbbbbbk...",
];
const LEGS_STAND = ["..kgg...ggk..", ".kgg.....ggk.", ".kgg.....ggk.", ".kgg.....ggk.", ".kyy.....yyk.", ".kyy.....yyk.", "..kk.....kk.."];
const LEGS_RUN_A = ["..kgg........", ".kgg....k....", ".kgg....gk...", ".kg....ggk...", ".ky...yyk....", ".k...yyk.....", "....kk......."];
const LEGS_RUN_B = ["...kgg.gk....", "..kgg...gk...", "..kgg...gk...", "..kyy...yk...", "..kyy...yk...", "...kk...kk...", ".............."];
const LEGS_RUN_C = ["........ggk..", "....k....ggk.", "...kg....ggk.", "...kgg....k..", "....kyy...ky.", ".....kyy...k.", ".......kk...."];
const LEGS_JUMP = ["...kgggggk...", "..kgg...ggk..", "..kgg...ggk..", "..kgg...ggk..", "..kyy...yyk..", "..kyy...yyk..", "...kk...kk..."];
const LEGS_HURT = ["..kg.......gk", ".kgg.......gg", ".kg.........k", ".ky.........y", ".ky.........y", "..k.........k", ".............."];
const RUN_CYCLE = [LEGS_RUN_A, LEGS_RUN_B, LEGS_RUN_C, LEGS_RUN_B];
const heroPal = (c: string) => ({ k: PAL.black, w: PAL.white, v: PAL.cyan, b: PAL.blue, g: PAL.grey, y: PAL.yellow, c });
const heroSprite = (legs: string[], color: string) => spr([...HERO_TOP, ...legs], 13, heroPal(color));

// ── enemy sprites ──
const BOTC = { k: PAL.black, m: PAL.grey, e: PAL.red, d: PAL.dark };
const HOPPER = [spr(["..kkkk..", ".kmmmmk.", "kmmeemmk", "kmmmmmmk", ".kmmmmk.", "kk....kk"], 8, BOTC), spr(["..kkkk..", ".kmmmmk.", "kmmeemmk", "kmmmmmmk", "k.mmmm.k", ".k....k."], 8, BOTC)];
const FLYER = [spr(["kk......kk", ".kmmmmmmk.", "kmeemmeemk", ".kmmmmmmk.", "..kk..kk.."], 11, BOTC), spr([".kk....kk.", "kkmmmmmmkk", "kmeemmeemk", ".kmmmmmmk.", "...kkkk..."], 11, BOTC)];
const TURRET = spr(["..kkkk..", ".kddddk.", "kddeeddk", "kddddddk", "mmmmmmmm", "kk....kk"], 8, BOTC);
const SHIELD = [spr(["..kkkk....", ".kmmmmk...", "kmmeemmk..", "kmmmmmmk..", ".kg..gk...", ".kk..kk.."], 10, BOTC), spr(["..kkkk....", ".kmmmmk...", "kmmeemmk..", "kmmmmmmk..", "..kg.gk...", "..kk.kk.."], 10, BOTC)];

type MobKind = "hopper" | "flyer" | "turret" | "shield";
interface Mob {
  kind: MobKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  hp: number;
  t: number;
  baseY: number;
  active: boolean;
  shieldUp: boolean;
  dead: number;
}
interface Bullet { x: number; y: number; vx: number; vy: number; life: number; dmg: number; color: string; size: number; arc?: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string }
interface Pop { x: number; y: number; t: number; text: string }

function buildRun(def: StageDef, r: ReturnType<typeof rng>) {
  const rowsAll: string[] = new Array(ROWS).fill("");
  for (const name of def.chunks) {
    const ch = CH[name];
    const w = Math.max(...ch.map((row) => row.length));
    for (let row = 0; row < ROWS; row++) {
      const src = row < ROWS - ch.length ? "" : ch[row - (ROWS - ch.length)];
      rowsAll[row] += src.padEnd(w, ".").slice(0, w);
    }
  }
  const cols = rowsAll[0].length;
  const grid = rowsAll.map((row) => row.split(""));
  const mobs: Mob[] = [];
  let start = { x: 24, y: 150 };
  let checkpoint: { x: number; y: number } | null = null;
  let doorX = (cols - 2) * T;
  const mk = (kind: MobKind, hp: number, w: number, h: number, bx: number, by: number): Mob => ({ kind, x: bx, y: by, vx: 0, vy: 0, w, h, hp: Math.ceil(hp * def.hpMul), t: r.range(0, 40), baseY: by, active: false, shieldUp: false, dead: -1 });
  for (let row = 0; row < ROWS; row++) {
    for (let c = 0; c < cols; c++) {
      const ch = grid[row][c];
      const bx = c * T;
      const by = (row + 1) * T;
      if (ch === "S") start = { x: bx + 2, y: by - HERO_H };
      else if (ch === "h") mobs.push(mk("hopper", 2, 8, 8, bx + 2, by - 8));
      else if (ch === "f") mobs.push(mk("flyer", 2, 11, 6, bx, row * T + 8));
      else if (ch === "u") mobs.push(mk("turret", 3, 8, 8, bx + 2, by - 8));
      else if (ch === "s") mobs.push(mk("shield", 4, 10, 9, bx + 2, by - 9));
      else if (ch === "C") checkpoint = { x: bx, y: by - HERO_H };
      else if (ch === "D") doorX = Math.min(doorX, bx);
      else continue;
      if (ch !== "D") grid[row][c] = ".";
    }
  }
  return { def, grid, cols, mobs, start, checkpoint, doorX };
}
type RunState = ReturnType<typeof buildRun>;

function create(seed: number): GameInstance {
  const r = rng(seed);
  // ── persistent progress across the whole playthrough ──
  const defeated = [false, false, false, false];
  const unlocked = (): WeaponId[] => ["buster", ...WEAPON_BY_STAGE.filter((_, i) => defeated[i])];
  const ammo: Record<WeaponId, number> = { buster: 0, bubble: 0, leaf: 0, spark: 0, ice: 0 };
  let lives = 3;
  let over = false;
  let won = false;
  let tick = 0;

  // ── scene machine ──
  type Scene = "select" | "run" | "boss";
  let scene: Scene = "select";
  let runCtx: "stage" | "fortress" = "stage";
  let stageIdx = 0;
  let rushIdx = 0;
  let finalBoss = false;
  let cursor = 0;

  // ── hero (shared across run & boss rooms) ──
  const hero = { x: 24, y: 150, vx: 0, vy: 0, w: HERO_W, h: HERO_H, hp: MAXHP, onGround: false, coyote: 0, buffer: 0, jumping: false, facing: 1, climbing: false, inv: 0, anim: 0, weaponIdx: 0, chargeT: 0, shootCd: 0, shootFlash: 0, dying: -1 };
  let run: RunState | null = null;
  let camX = 0;
  let doorTimer = 0;

  interface BossRoom { def: BossDef; baseDef: BossDef; hp: number; maxHp: number; x: number; y: number; baseX: number; baseY: number; t: number; dead: boolean }
  let boss: BossRoom | null = null;

  let shots: Bullet[] = [];
  let enemyShots: Bullet[] = [];
  let parts: Particle[] = [];
  let pops: Pop[] = [];

  const curWeapon = () => WEAPONS.find((w) => w.id === unlocked()[hero.weaponIdx])!;

  const burst = (x: number, y: number, n: number, color: string) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + tick * 0.3;
      parts.push({ x, y, vx: Math.cos(a) * 1.8, vy: Math.sin(a) * 1.8 - 0.6, life: 22, color });
    }
  };
  const addScore = (io: IO, pts: number, x: number, y: number) => {
    io.score(pts);
    pops.push({ x, y, t: 0, text: String(pts) });
  };

  const resetRunLevel = (def: StageDef) => {
    run = buildRun(def, r);
    hero.x = run.start.x;
    hero.y = run.start.y;
    hero.vx = hero.vy = 0;
    hero.hp = MAXHP;
    hero.inv = 90;
    hero.climbing = false;
    hero.facing = 1;
    doorTimer = 0;
    shots = [];
    enemyShots = [];
    camX = 0;
  };

  const spawnBoss = (def: BossDef, hpMul: number) => {
    const maxHp = Math.ceil(26 * hpMul);
    boss = { def, baseDef: def, hp: maxHp, maxHp, x: W - 74, y: 100, baseX: W - 74, baseY: 100, t: 0, dead: false };
    hero.x = 30;
    hero.y = H - 32 - hero.h;
    hero.vx = hero.vy = 0;
    hero.hp = MAXHP;
    hero.inv = 90;
    shots = [];
    enemyShots = [];
  };

  const enterScene = (io: IO, s: Scene) => {
    scene = s;
    if (s === "run") resetRunLevel(runCtx === "stage" ? STAGES[stageIdx] : FORTRESS);
    else if (s === "boss") {
      if (runCtx === "stage") spawnBoss(STAGES[stageIdx].boss, 1);
      else if (finalBoss) spawnBoss(BOSS_DEFS[0], 1.8);
      else spawnBoss(BOSS_DEFS[rushIdx], 0.55);
    }
  };

  const hurtHero = (io: IO, dmg: number) => {
    if (hero.inv > 0 || hero.dying >= 0 || scene === "select") return;
    hero.hp -= dmg;
    hero.inv = 80;
    io.sfx.play("hit");
    burst(hero.x + hero.w / 2, hero.y + hero.h / 2, 6, PAL.yellow);
    if (hero.hp <= 0) {
      hero.dying = 0;
      io.sfx.play("die");
    }
  };

  const respawn = () => {
    hero.dying = -1;
    hero.inv = 100;
    hero.vx = hero.vy = 0;
    hero.hp = MAXHP;
    if (scene === "run" && run) {
      const p = run.checkpoint ?? run.start;
      hero.x = p.x;
      hero.y = p.y;
    } else if (scene === "boss" && boss) {
      boss.hp = boss.maxHp;
      boss.t = 0;
      boss.def = boss.baseDef;
      hero.x = 30;
      hero.y = H - 32 - hero.h;
      enemyShots = [];
    }
  };

  const fireHero = (io: IO) => {
    const inp = io.input;
    const w = curWeapon();
    if (w.id === "buster") {
      if (inp.held.b) hero.chargeT = Math.min(70, hero.chargeT + 1);
      else if (hero.chargeT > 0) {
        const big = hero.chargeT >= 42;
        const ox = hero.x + (hero.facing > 0 ? hero.w : -4);
        shots.push({ x: ox, y: hero.y + 11, vx: hero.facing * (big ? 4.2 : 3.4), vy: 0, life: 70, dmg: big ? 3 : 1, color: big ? PAL.cyan : PAL.yellow, size: big ? 6 : 4 });
        io.sfx.play("shoot");
        hero.chargeT = 0;
        hero.shootFlash = 6;
      }
      return;
    }
    hero.shootCd = Math.max(0, hero.shootCd - 1);
    if (inp.held.b && hero.shootCd === 0 && ammo[w.id] >= w.cost) {
      ammo[w.id] -= w.cost;
      hero.shootCd = 13;
      const ox = hero.x + (hero.facing > 0 ? hero.w : -4);
      for (const a of w.angles) shots.push({ x: ox, y: hero.y + 11, vx: hero.facing * w.speed * Math.cos(a), vy: w.speed * Math.sin(a), life: 70, dmg: w.dmg, color: w.color, size: 5, arc: w.arc });
      io.sfx.play("shoot");
      hero.shootFlash = 6;
    }
  };
  const regenAmmo = () => {
    for (const w of WEAPONS) if (w.id !== "buster") ammo[w.id] = Math.min(AMMO_MAX, ammo[w.id] + 0.12);
  };
  const cycleWeapon = (io: IO, onLadder: boolean) => {
    if (io.input.pressed.up && !onLadder) {
      const list = unlocked();
      hero.weaponIdx = (hero.weaponIdx + 1) % list.length;
      io.sfx.play("blip");
    }
  };

  // ── run-mode tile collision (same shape as a classic platformer) ──
  const tileAt = (px: number, py: number) => {
    if (!run) return ".";
    const c = Math.floor(px / T);
    const row = Math.floor(py / T);
    if (c < 0 || c >= run.cols) return "#";
    if (row < 0 || row >= ROWS) return ".";
    return run.grid[row][c];
  };
  const solidAt = (px: number, py: number) => SOLID.has(tileAt(px, py));
  const moveX = (e: { x: number; y: number; w: number; h: number }, dx: number) => {
    e.x += dx;
    if (dx > 0) {
      const right = e.x + e.w - 0.01;
      if (solidAt(right, e.y + 2) || solidAt(right, e.y + e.h - 2)) {
        e.x = Math.floor(right / T) * T - e.w;
        return true;
      }
    } else if (dx < 0) {
      if (solidAt(e.x, e.y + 2) || solidAt(e.x, e.y + e.h - 2)) {
        e.x = (Math.floor(e.x / T) + 1) * T;
        return true;
      }
    }
    return false;
  };
  const moveY = (e: { x: number; y: number; w: number; h: number }, dy: number) => {
    e.y += dy;
    if (dy >= 0) {
      const bottom = e.y + e.h;
      if (solidAt(e.x + 1, bottom) || solidAt(e.x + e.w - 1, bottom)) {
        e.y = Math.floor(bottom / T) * T - e.h;
        return 1;
      }
    } else if (solidAt(e.x + 1, e.y) || solidAt(e.x + e.w - 1, e.y)) {
      e.y = (Math.floor(e.y / T) + 1) * T;
      return -1;
    }
    return 0;
  };

  const STAGE_SPD = () => (run ? run.def.spdMul : 1);

  const updateRun = (io: IO) => {
    if (!run) return;
    const lvl = run;
    const inp = io.input;
    if (hero.dying >= 0) {
      hero.dying++;
      hero.vy += GRAV;
      hero.y += hero.vy;
      if (hero.dying > 70) {
        lives--;
        if (lives <= 0) {
          over = true;
          io.gameOver();
          return;
        }
        respawn();
      }
      return;
    }
    const onLadder = tileAt(hero.x + hero.w / 2, hero.y + hero.h / 2) === "H";
    cycleWeapon(io, onLadder);
    if (onLadder && (inp.held.up || inp.held.down)) {
      hero.climbing = true;
      hero.vy = 0;
      hero.vx = 0;
      hero.y += (inp.held.up ? -1 : 1) * 1.3;
      hero.x += (Math.floor((hero.x + hero.w / 2) / T) * T + T / 2 - hero.w / 2 - hero.x) * 0.4;
      hero.onGround = false;
      if (inp.pressed.a) {
        hero.climbing = false;
        hero.vy = -3.6;
      }
    } else {
      hero.climbing = onLadder && hero.climbing && !inp.pressed.a;
      const maxV = 1.8;
      if (inp.held.left && !inp.held.right) {
        hero.vx = Math.max(-maxV, hero.vx - 0.22);
        hero.facing = -1;
      } else if (inp.held.right && !inp.held.left) {
        hero.vx = Math.min(maxV, hero.vx + 0.22);
        hero.facing = 1;
      } else hero.vx *= 0.8;
      if (Math.abs(hero.vx) < 0.05) hero.vx = 0;
      hero.buffer = inp.pressed.a ? BUFFER : Math.max(0, hero.buffer - 1);
      hero.coyote = hero.onGround ? COYOTE : Math.max(0, hero.coyote - 1);
      if (hero.buffer > 0 && hero.coyote > 0 && !hero.climbing) {
        hero.vy = -6.1;
        hero.buffer = 0;
        hero.coyote = 0;
        hero.jumping = true;
        io.sfx.play("jump");
      }
      if (hero.jumping && !inp.held.a && hero.vy < -2) hero.vy = -2;
      if (!hero.climbing) hero.vy = Math.min(MAXFALL, hero.vy + GRAV);
      if (moveX(hero, hero.vx)) hero.vx = 0;
      hero.anim += Math.abs(hero.vx) * 0.1;
      hero.onGround = false;
      const res = moveY(hero, hero.vy);
      if (res === 1) {
        hero.vy = 0;
        hero.onGround = true;
        hero.jumping = false;
      } else if (res === -1) hero.vy = 0.5;
    }
    fireHero(io);
    regenAmmo();
    hero.inv = Math.max(0, hero.inv - 1);
    hero.shootFlash = Math.max(0, hero.shootFlash - 1);
    // pellets + checkpoint
    for (const [px, py] of [
      [hero.x + 2, hero.y + 2],
      [hero.x + hero.w - 2, hero.y + hero.h - 2],
    ]) {
      const c = Math.floor(px / T);
      const row = Math.floor(py / T);
      if (lvl.grid[row]?.[c] === "e") {
        lvl.grid[row][c] = ".";
        hero.hp = Math.min(MAXHP, hero.hp + 6);
        io.sfx.play("coin");
        burst(c * T + 8, row * T + 8, 5, PAL.lime);
      } else if (lvl.grid[row]?.[c] === "C") {
        lvl.checkpoint = { x: c * T, y: (row + 1) * T - HERO_H };
        lvl.grid[row][c] = ".";
        io.sfx.play("blip");
      }
    }
    if (hero.y > H + 20) hurtHero(io, MAXHP);
    // door
    const nearDoor = Math.abs(hero.x + hero.w - lvl.doorX) < 12 && hero.onGround;
    doorTimer = nearDoor ? doorTimer + 1 : Math.max(0, doorTimer - 2);
    if (doorTimer > 35) {
      io.sfx.play("powerup");
      enterScene(io, "boss");
      return;
    }
    // camera
    const target = clamp(hero.x - W / 2 + 20 * hero.facing, 0, lvl.cols * T - W);
    camX += (target - camX) * 0.12;
    camX = clamp(camX, 0, lvl.cols * T - W);

    // mobs
    const hb = { x: hero.x, y: hero.y, w: hero.w, h: hero.h };
    for (const m of lvl.mobs) {
      if (!m.active) {
        if (m.x < camX + W + 20) m.active = true;
        else continue;
      }
      m.t++;
      if (m.dead >= 0) {
        m.dead--;
        continue;
      }
      if (m.x < camX - 60) continue;
      const spd = 0.5 * STAGE_SPD();
      if (m.kind === "hopper") {
        m.vy = Math.min(MAXFALL, m.vy + GRAV);
        if (moveY(m, m.vy) !== 0) {
          m.vy = 0;
          if (m.t % 55 === 0) {
            m.vy = -3.4;
            m.vx = (hero.x < m.x ? -1 : 1) * spd * 2;
          }
        }
        moveX(m, m.vx);
      } else if (m.kind === "flyer") {
        m.y = m.baseY + Math.sin((m.t + m.x) * 0.05) * 14;
        m.x -= spd * 1.2;
        if (m.t % 140 === 0) enemyShots.push({ x: m.x, y: m.y + 4, vx: 0, vy: 2, life: 160, dmg: 3, color: PAL.red, size: 5 });
      } else if (m.kind === "turret") {
        if (m.t % 110 === 0 && Math.abs(m.x - hero.x) < 140) {
          const a = Math.atan2(hero.y - m.y, hero.x - m.x);
          enemyShots.push({ x: m.x, y: m.y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 180, dmg: 3, color: PAL.red, size: 5 });
          io.sfx.play("laser");
        }
      } else if (m.kind === "shield") {
        m.shieldUp = Math.floor(m.t / 90) % 2 === 0;
        m.vx = m.t % 220 < 110 ? -spd : spd;
        if (moveX(m, m.vx)) m.vx = -m.vx;
      }
      if (overlap(hb, { x: m.x, y: m.y, w: m.w, h: m.h })) hurtHero(io, m.kind === "turret" ? 2 : 3);
    }
    // hero shots vs mobs
    for (const s of shots) {
      for (const m of lvl.mobs) {
        if (m.active && m.dead < 0 && overlap({ x: s.x, y: s.y, w: s.size, h: s.size }, { x: m.x, y: m.y, w: m.w, h: m.h })) {
          if (m.kind === "shield" && m.shieldUp && Math.sign(s.vx) === (hero.facing >= 0 ? 1 : -1)) {
            io.sfx.play("blip");
            s.life = 0;
            continue;
          }
          m.hp -= s.dmg;
          s.life = 0;
          io.sfx.play("hit");
          if (m.hp <= 0) {
            m.dead = 20;
            burst(m.x + m.w / 2, m.y + m.h / 2, 8, PAL.white);
            addScore(io, 150, m.x, m.y - 6);
            io.sfx.play("explode");
          }
        }
      }
    }
    lvl.mobs = lvl.mobs.filter((m) => m.dead !== 0);
  };

  const updateBossPhase = (io: IO) => {
    if (!boss) return;
    const bs = boss;
    const inp = io.input;
    if (hero.dying >= 0) {
      hero.dying++;
      hero.vy += GRAV;
      hero.y += hero.vy;
      if (hero.dying > 70) {
        lives--;
        if (lives <= 0) {
          over = true;
          io.gameOver();
          return;
        }
        respawn();
      }
      return;
    }
    cycleWeapon(io, false);
    const maxV = 1.6;
    if (inp.held.left && !inp.held.right) {
      hero.vx = Math.max(-maxV, hero.vx - 0.25);
      hero.facing = -1;
    } else if (inp.held.right && !inp.held.left) {
      hero.vx = Math.min(maxV, hero.vx + 0.25);
      hero.facing = 1;
    } else hero.vx *= 0.8;
    hero.buffer = inp.pressed.a ? BUFFER : Math.max(0, hero.buffer - 1);
    hero.coyote = hero.onGround ? COYOTE : Math.max(0, hero.coyote - 1);
    if (hero.buffer > 0 && hero.coyote > 0) {
      hero.vy = -5.8;
      hero.buffer = 0;
      hero.coyote = 0;
      hero.jumping = true;
      io.sfx.play("jump");
    }
    if (hero.jumping && !inp.held.a && hero.vy < -2) hero.vy = -2;
    hero.vy = Math.min(MAXFALL, hero.vy + GRAV);
    hero.x = clamp(hero.x + hero.vx, 16, W - 16 - hero.w);
    hero.anim += Math.abs(hero.vx) * 0.1;
    hero.y += hero.vy;
    const groundY = H - 32 - hero.h;
    hero.onGround = false;
    if (hero.y >= groundY) {
      hero.y = groundY;
      hero.vy = 0;
      hero.onGround = true;
      hero.jumping = false;
    }
    const introT = 55;
    if (bs.t >= introT) fireHero(io);
    regenAmmo();
    hero.inv = Math.max(0, hero.inv - 1);
    hero.shootFlash = Math.max(0, hero.shootFlash - 1);

    // boss move + fire (final boss swaps its attack pattern every 220 frames through the ring)
    bs.t++;
    if (finalBoss) bs.def = BOSS_DEFS[Math.floor(bs.t / 220) % 4];
    if (bs.t >= introT) {
      bs.x = bs.baseX + Math.sin(bs.t * 0.014) * 22;
      bs.y = bs.baseY + Math.sin(bs.t * 0.03) * 10;
      if (!bs.dead && bs.t % bs.def.cooldown === 0) {
        for (const s of bs.def.fire(bs, hero, bs.t)) enemyShots.push({ x: bs.x, y: bs.y, vx: s.vx, vy: s.vy, life: 220, dmg: 4, color: bs.def.accent, size: 5, arc: s.arc });
        io.sfx.play("laser");
      }
      if (!bs.dead && overlap({ x: hero.x, y: hero.y, w: hero.w, h: hero.h }, { x: bs.x - 18, y: bs.y - 18, w: 36, h: 36 })) hurtHero(io, 4);
    }

    // bullets
    for (const s of shots) {
      if (s.arc) s.vy += 0.05;
      s.x += s.vx;
      s.y += s.vy;
      s.life--;
      if (!bs.dead && bs.t >= introT && overlap({ x: s.x, y: s.y, w: s.size, h: s.size }, { x: bs.x - 18, y: bs.y - 18, w: 36, h: 36 })) {
        const mult = curWeapon().id === bs.def.weak ? 2.5 : 1;
        bs.hp -= s.dmg * mult;
        s.life = 0;
        io.sfx.play("hit");
        if (bs.hp <= 0) bossDefeated(io);
      }
      if (s.x < 0 || s.x > W || s.y < 0 || s.y > H) s.life = 0;
    }
    for (const s of enemyShots) {
      if (s.arc) s.vy += 0.05;
      s.x += s.vx;
      s.y += s.vy;
      s.life--;
      if (overlap({ x: s.x, y: s.y, w: s.size, h: s.size }, { x: hero.x, y: hero.y, w: hero.w, h: hero.h })) {
        s.life = 0;
        hurtHero(io, s.dmg);
      }
      if (s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20) s.life = 0;
    }
  };

  const bossDefeated = (io: IO) => {
    if (!boss || boss.dead) return;
    const bs = boss;
    bs.dead = true;
    for (let i = 0; i < 4; i++) burst(bs.x + r.range(-10, 10), bs.y + r.range(-10, 10), 10, PAL.white);
    io.sfx.play("explode");
    if (runCtx === "stage") {
      defeated[stageIdx] = true;
      addScore(io, 2000, bs.x, bs.y);
      hero.weaponIdx = 0;
      scene = "select";
    } else if (finalBoss) {
      addScore(io, 8000 + lives * 1000, bs.x, bs.y);
      won = true;
      io.win();
    } else {
      addScore(io, 1200, bs.x, bs.y);
      rushIdx++;
      if (rushIdx < 4) spawnBoss(BOSS_DEFS[rushIdx], 0.55);
      else {
        finalBoss = true;
        spawnBoss(BOSS_DEFS[0], 1.8);
      }
    }
  };

  const NEIGH: Record<number, Partial<Record<"left" | "right" | "up" | "down", number>>> = {
    0: { right: 1, down: 2 },
    1: { left: 0, down: 3 },
    2: { up: 0, right: 3, down: 4 },
    3: { up: 1, left: 2, down: 4 },
    4: { up: 2 },
  };
  const updateSelect = (io: IO) => {
    const inp = io.input;
    for (const dir of ["left", "right", "up", "down"] as const) {
      if (inp.pressed[dir] && NEIGH[cursor][dir] !== undefined) {
        cursor = NEIGH[cursor][dir]!;
        io.sfx.play("blip");
      }
    }
    if (inp.pressed.a) {
      if (cursor < 4) {
        stageIdx = cursor;
        runCtx = "stage";
        finalBoss = false;
        enterScene(io, "run");
      } else if (defeated.every(Boolean)) {
        runCtx = "fortress";
        rushIdx = 0;
        finalBoss = false;
        enterScene(io, "run");
      } else io.sfx.play("blip");
    }
  };

  const updateFx = () => {
    shots = shots.filter((s) => s.life > 0);
    enemyShots = enemyShots.filter((s) => s.life > 0);
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life--;
    }
    parts = parts.filter((p) => p.life > 0);
    for (const p of pops) p.t++;
    pops = pops.filter((p) => p.t < 40);
  };

  return {
    update(io: IO) {
      if (over || won) return;
      tick++;
      if (scene === "select") updateSelect(io);
      else if (scene === "run") updateRun(io);
      else if (scene === "boss") updateBossPhase(io);
      updateFx();
    },

    draw(g: Gfx) {
      if (scene === "select") drawSelect(g);
      else if (scene === "run") drawRun(g);
      else if (scene === "boss") drawBossRoom(g);
      if (scene !== "select") drawHUD(g);
      if (over) {
        g.rect(0, 90, W, 30, "rgba(13,11,26,0.75)");
        g.text("GAME OVER", W / 2, 100, PAL.red, { align: "center", size: 2 });
      }
    },
  };

  function drawSelect(g: Gfx) {
    g.clear(PAL.night);
    for (let i = 0; i < 16; i++) g.rect((i * 37 + Math.floor(tick * 0.1)) % (W + 10) - 5, (i * 53) % 190 + 4, 1, 1, "#ffffff44");
    g.text("ROBO RUNNER", W / 2, 4, PAL.white, { align: "center", size: 2 });
    g.text("PICK YOUR BOSS", W / 2, 20, PAL.grey, { align: "center" });
    const pos = [
      { x: 16, y: 32 },
      { x: 136, y: 32 },
      { x: 16, y: 110 },
      { x: 136, y: 110 },
    ];
    STAGES.forEach((s, i) => {
      const p = pos[i];
      const sel = cursor === i;
      const th = THEMES[s.theme];
      g.rect(p.x, p.y, 104, 74, th.ground);
      g.rect(p.x + 3, p.y + 3, 98, 68, th.sky[0]);
      g.rect(p.x + 3, p.y + 46, 98, 25, th.sky[1]);
      g.box(p.x, p.y, 104, 74, sel && Math.floor(tick / 8) % 2 ? PAL.yellow : th.blockLight);
      for (const [cx, cy] of [
        [p.x, p.y],
        [p.x + 98, p.y],
        [p.x, p.y + 68],
        [p.x + 98, p.y + 68],
      ])
        g.rect(cx, cy, 6, 6, th.blockLight);
      g.sprite(bossIcon(s.boss), p.x + 40, p.y + 6, { scale: 3 });
      g.rect(p.x + 3, p.y + 46, 98, 1, PAL.black);
      g.text(`STAGE ${i + 1}`, p.x + 52, p.y + 49, PAL.grey, { align: "center" });
      g.text(s.boss.name, p.x + 52, p.y + 59, defeated[i] ? PAL.lime : PAL.white, { align: "center" });
      if (defeated[i]) g.text("★ CLEARED ★", p.x + 52, p.y + 68, PAL.yellow, { align: "center" });
    });
    const fp = { x: 16, y: 192 };
    const ready = defeated.every(Boolean);
    g.rect(fp.x, fp.y, 224, 28, ready ? "#3a1b6a" : "#201830");
    g.box(fp.x, fp.y, 224, 28, cursor === 4 && ready && Math.floor(tick / 8) % 2 ? PAL.yellow : ready ? PAL.purple : PAL.dark);
    g.text(ready ? "★ ROBO FORTRESS — FINAL CHALLENGE ★" : "ROBO FORTRESS — LOCKED", W / 2, 206, ready ? PAL.white : PAL.grey, { align: "center" });
  }

  function drawRun(g: Gfx) {
    if (!run) return;
    const d = run.def;
    const th = THEMES[d.theme];
    const cam = Math.round(camX);
    drawBG(g, th, cam);
    g.camera(cam, 0);
    const c0 = Math.floor(cam / T);
    for (let row = 0; row < ROWS; row++) {
      for (let c = c0; c <= c0 + W / T + 1 && c < run.cols; c++) {
        const ch = run.grid[row][c];
        if (ch === ".") continue;
        const x = c * T;
        const y = row * T;
        if (ch === "#" || ch === "=") drawTile(g, th, ch, x, y);
        else if (ch === "H") {
          g.rect(x + 5, y, 2, T, PAL.grey);
          g.rect(x + 9, y, 2, T, PAL.grey);
          g.rect(x + 3, y + 7, 10, 2, PAL.grey);
        } else if (ch === "e") {
          const bob = Math.sin((tick + c * 9) * 0.1) * 2;
          g.rect(x + 5, y + 5 + bob, 6, 6, PAL.lime);
          g.rect(x + 7, y + 6 + bob, 2, 2, PAL.white);
        } else if (ch === "C") {
          g.rect(x + 7, y - 20, 2, 20, PAL.grey);
          g.circle(x + 8, y - 24, 6, run.checkpoint ? PAL.lime : PAL.dark);
        } else if (ch === "D") {
          const above = row > 0 ? run.grid[row - 1][c] : ".";
          if (above !== "D") g.rect(x - 1, y - 2, T + 2, 4, PAL.yellow);
          g.rect(x, y, T, T, "#8a3a3a");
          g.rect(x + 2, y + 2, T - 4, T - 4, "#c45a5a");
        }
      }
    }
    for (const m of run.mobs) {
      if (!m.active || m.dead === 0) continue;
      const f = Math.floor(m.t / 8) % 2;
      if (m.dead > 0) {
        g.circle(m.x + m.w / 2, m.y + m.h / 2, (20 - m.dead) * 0.6, PAL.white);
        continue;
      }
      if (m.kind === "hopper") g.sprite(HOPPER[f], m.x, m.y, { flipX: m.vx > 0 });
      else if (m.kind === "flyer") g.sprite(FLYER[f], m.x, m.y);
      else if (m.kind === "turret") g.sprite(TURRET, m.x, m.y);
      else {
        g.sprite(SHIELD[f], m.x, m.y, { flipX: m.vx > 0 });
        g.circle(m.x + (m.vx >= 0 ? m.w + 2 : -2), m.y + m.h / 2, 5, m.shieldUp ? PAL.cyan : "#3a3f5a");
      }
    }
    for (const s of shots) g.rect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size, s.color);
    for (const s of enemyShots) g.rect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size, s.color);
    drawHero(g);
    for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
    for (const p of pops) g.text(p.text, p.x - cam, p.y - p.t * 0.6, PAL.white);
    g.camera(0, 0);
    if (tick < 90) {
      g.rect(0, 60, W, 20, "rgba(13,11,26,0.6)");
      g.text(d.name, W / 2, 65, PAL.white, { align: "center" });
    }
  }

  function drawBossRoom(g: Gfx) {
    if (!boss) return;
    const bs = boss;
    const th = THEMES[runCtx === "stage" ? STAGES[stageIdx].theme : "fortress"];
    const introT = 55;
    // arena: floor, side walls, shutter door behind the hero
    g.clear(th.sky[0]);
    g.rect(0, 20, W, H - 52, th.sky[1]);
    for (let x = 0; x < W; x += T) drawTile(g, th, "#", x, H - 32);
    g.rect(0, 20, 10, H - 52, th.groundDark);
    g.rect(W - 10, 20, 10, H - 52, th.groundDark);
    g.rect(2, H - 62, 14, 30, "#8a3a3a");
    g.rect(4, H - 60, 10, 26, "#c45a5a");
    // vertical health bar, classic style
    const hbX = W - 22;
    const hbY0 = 26;
    const hbH = H - 66;
    g.rect(hbX, hbY0 - 2, 10, hbH + 4, PAL.black);
    const fillH = hbH * clamp(bs.hp / bs.maxHp, 0, 1);
    g.rect(hbX + 1, hbY0 + (hbH - fillH), 8, fillH, bs.def.accent);
    for (let i = 1; i < 10; i++) g.rect(hbX, hbY0 + (i * hbH) / 10, 10, 1, PAL.black);
    if (bs.t < introT) {
      const s = 3 + Math.sin(bs.t * 0.3) * 0.5;
      g.sprite(bossIcon(bs.def), bs.x - 18, bs.y - 18, { scale: s, flipX: true });
      g.rect(0, 96, W, 24, "rgba(13,11,26,0.75)");
      g.text(bs.def.name, W / 2, 100, PAL.white, { align: "center", size: 2 });
      g.text(finalBoss ? "FINAL BOSS" : runCtx === "fortress" ? `BOSS RUSH ${rushIdx + 1}/4` : "STAGE BOSS", W / 2, 113, PAL.yellow, { align: "center" });
    } else if (!bs.dead) {
      const flash = bs.t % bs.def.cooldown >= bs.def.cooldown - 14;
      g.sprite(bossIcon(bs.def), bs.x - 18, bs.y - 18, { scale: 3, flipX: bs.x < hero.x });
      if (flash && Math.floor(tick / 4) % 2) g.circle(bs.x, bs.y, 22, "#ffffff55");
    }
    for (const s of shots) g.rect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size, s.color);
    for (const s of enemyShots) g.circle(s.x, s.y, s.size, s.color);
    drawHero(g);
    for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
    for (const p of pops) g.text(p.text, p.x, p.y - p.t * 0.6, PAL.white);
    if (bs.t >= introT) {
      if (finalBoss) g.text("FINAL BOSS!", W / 2, 10, PAL.red, { align: "center" });
      else if (runCtx === "fortress") g.text(`BOSS RUSH ${rushIdx + 1}/4`, W / 2, 10, PAL.orange, { align: "center" });
      else g.text(bs.def.name, W / 2, 10, PAL.white, { align: "center" });
    }
  }

  function drawHero(g: Gfx) {
    if (hero.dying >= 0 && Math.floor(hero.dying / 3) % 2) return;
    if (hero.inv > 0 && Math.floor(hero.inv / 3) % 2) return;
    let legs: string[];
    if (hero.dying >= 0) legs = LEGS_HURT;
    else if (hero.climbing) legs = Math.floor(hero.anim * 4) % 2 ? LEGS_RUN_A : LEGS_RUN_B;
    else if (!hero.onGround) legs = LEGS_JUMP;
    else if (Math.abs(hero.vx) > 0.1) legs = RUN_CYCLE[Math.floor(hero.anim) % RUN_CYCLE.length];
    else legs = LEGS_STAND;
    const color = curWeapon().color;
    g.sprite(heroSprite(legs, color), hero.x - 1, hero.y, { flipX: hero.facing < 0 });
    if (hero.shootFlash > 0) {
      const fx = hero.x + (hero.facing > 0 ? hero.w + 1 : -6);
      g.rect(fx, hero.y + 9, 5, 5, PAL.yellow);
      g.rect(fx + 1, hero.y + 10, 3, 3, PAL.white);
    }
    if (hero.chargeT >= 42) g.circle(hero.x + (hero.facing > 0 ? hero.w + 2 : -2), hero.y + 11, 4, PAL.cyan);
  }

  function drawHUD(g: Gfx) {
    g.rect(0, 0, W, 13, "rgba(13,11,26,0.6)");
    g.text(`x${lives}`, 4, 2, PAL.white);
    g.rect(16, 3, 30, 6, PAL.dark);
    g.rect(16, 3, 30 * clamp(hero.hp / MAXHP, 0, 1), 6, hero.hp > MAXHP * 0.3 ? PAL.lime : PAL.red);
    const w = curWeapon();
    g.text(w.name, 52, 2, w.color);
    if (w.id !== "buster") {
      g.rect(90, 3, 26, 6, PAL.dark);
      g.rect(90, 3, 26 * clamp(ammo[w.id] / AMMO_MAX, 0, 1), 6, w.color);
    }
    g.text(`${defeated.filter(Boolean).length}/4`, W - 4, 2, PAL.yellow, { align: "right" });
  }
}

export const roboRunner: RetroGameDef = {
  id: "robo-runner",
  title: "Robo Runner",
  blurb: "Pick a boss, blast through its themed stage, and steal its weapon!",
  genre: "Action",
  emoji: "🤖",
  color: "#3c6cf0",
  controls: "◀ ▶ run · A jump (tap = short hop) · hold B shoot (buster charges!) · ▲/▼ climb ladders · ▲ off a ladder cycles weapon",
  pad: { dpad: "4", a: "Jump", b: "Shoot" },
  create,
};
