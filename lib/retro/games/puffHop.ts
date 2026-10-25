// PUFF HOP — an original side-scrolling platformer. A round, puffy cloud-sprite hero bounces
// through candy worlds: A jumps (tap again in the air to puff up and float, flap by flap,
// until the puff runs out), B sucks small critters and blocks in through a mouth cone, B again
// spits whatever's held out as a bouncing star that pops things, and ▼ swallows it — plain
// things just vanish but special critters hand over a copy power (fire breath, a zap ring, a
// sword swipe) used with B until it's spat out (▼+B) or knocked loose by a hit. Four candy
// worlds, each ending with a friendly boss. (Original game, not affiliated with any series.)
import { H, PAL, W, clamp, overlap, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

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
const puffSprite = (mouth: string[], feet: string, cheek: string = PAL.pink) => sprite(bodyRows(mouth, feet), CP(cheek));
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
    io.sfx.play("hit");
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
    io.sfx.play("hit");
    addScore(io, 100, m.x, m.y - 6);
    burst(m.x + m.w / 2, m.y + m.h / 2, mobColor(m.kind, lvl.boss.fruitColor), 7);
  };
  const damageBoss = (io: IO, amt: number) => {
    const b = lvl.boss;
    if (!b.active || b.dead) return;
    b.hp -= amt;
    b.hitFlash = 12;
    io.sfx.play("hit");
    burst(b.x, b.y - 30, PAL.white, 6, 1);
    if (b.hp <= 0) {
      b.dead = true;
      io.sfx.play("explode");
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
    } else io.sfx.play("step");
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
    io.sfx.play("hit");
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
    io.sfx.play(type === "spark" ? "laser" : type === "blade" ? "hit" : "shoot");
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
      io.sfx.play("jump");
    } else if (inp.pressed.a && !hero.onGround && hero.puffCharges > 0) {
      hero.puffed = true;
      hero.vy = FLAP_VY;
      hero.puffCharges--;
      io.sfx.play("bounce");
      burst(hero.x + hero.w / 2, hero.y + hero.h, PAL.white, 4, 0.8);
      if (hero.puffCharges <= 0) hero.puffed = false;
    }
    if (hero.jumping && !inp.held.a && hero.vy < -2) hero.vy = -2;
    hero.vy = Math.min(MAXFALL, hero.vy + (hero.puffed ? GRAV_FLOAT : GRAV));

    if (moveX(hero, hero.vx)) hero.vx = 0;
    hero.anim += Math.abs(hero.vx) * 0.09;
    hero.onGround = false;
    const res = moveY(hero, hero.vy);
    if (res === 1) {
      const landTile = tileAt(hero.x + hero.w / 2, hero.y + hero.h + 1);
      if (landTile === "^") {
        hero.vy = -7.2;
        hero.onGround = false;
        hero.jumping = true;
        io.sfx.play("bounce");
        burst(hero.x + hero.w / 2, hero.y + hero.h, PAL.white, 6);
      } else {
        hero.vy = 0;
        hero.onGround = true;
        hero.jumping = false;
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
        io.sfx.play("powerup");
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
      if (hero.x > lvl.arenaStartX - 30) b.active = true;
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
        }
      }
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
      g.clear(d.sky[0]);
      g.rect(0, 80, W, 144, d.sky[1]);
      for (const s of lvl.bgStars) {
        const x = (((s.x - cam * 0.15) % (lvl.cols * T)) + lvl.cols * T) % (lvl.cols * T);
        if (x < cam - 20 || x > cam + W + 20) continue;
        g.rect(x - cam * 0.15 - (x - cam), s.y, s.s, s.s, "#ffffffaa");
      }
      for (let i = 0; i < 6; i++) {
        const x = ((i * 110 - cam * 0.25) % 660 + 660) % 660 - 80;
        g.circle(x, 200, 70, d.hills[0]);
      }
      for (let i = 0; i < 8; i++) {
        const x = ((i * 76 - cam * 0.5) % 608 + 608) % 608 - 50;
        g.circle(x, 205, 36, d.hills[1]);
      }
      for (let i = 0; i < 5; i++) {
        const x = ((i * 150 - cam * 0.45) % 750 + 750) % 750 - 60;
        drawThemeProp(g, d.theme, x, 196);
      }

      g.camera(cam, 0);
      const c0 = Math.floor(cam / T);
      for (let row = 0; row < ROWS; row++) {
        for (let c = c0; c <= c0 + W / T + 1 && c < lvl.cols; c++) {
          const ch = lvl.grid[row][c];
          if (ch === ".") continue;
          const x = c * T;
          const y = row * T;
          const above = row > 0 ? lvl.grid[row - 1][c] : ".";
          if (ch === "#") drawGroundTile(g, x, y, d.theme, d.ground, d.icing, above !== "#", c);
          else if (ch === "=") drawFloatTile(g, x, y, d.theme, d.icing);
          else if (ch === "x") drawBlockTile(g, x, y, d.theme);
          else if (ch === "^") drawBouncer(g, x, y, d.theme, tick);
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
        const scale = hero.puffed ? 1.6 : 1.4;
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
// one background prop per theme, drawn as a small parallax layer: a candy-cane post for the
// meadow, a lollipop for the sweets world, a little rainbow for the clouds, a castle tower
// with a banner for the sky castle.
function drawThemeProp(g: Gfx, theme: Theme, x: number, baseY: number) {
  if (theme === "sweets") {
    g.rect(x - 1, baseY - 26, 2, 26, "#caa06a");
    g.circle(x, baseY - 32, 8, PAL.pink);
    g.circle(x, baseY - 32, 4, PAL.white);
  } else if (theme === "cloud") {
    const colors = [PAL.pink, PAL.orange, PAL.yellow, PAL.green, PAL.blue];
    for (let i = 0; i < 5; i++) g.rect(x - 20 + i * 10, baseY - 20 - Math.abs(i - 2) * 4, 10, 4, colors[i]);
  } else if (theme === "castle") {
    g.rect(x - 8, baseY - 50, 16, 50, "#8a8aa0");
    g.rect(x - 10, baseY - 56, 20, 8, "#6a6e8a");
    g.rect(x - 1, baseY - 70, 2, 16, PAL.red);
    g.rect(x - 1, baseY - 70, 9, 6, PAL.red);
  } else {
    g.rect(x - 1, baseY - 30, 2, 30, PAL.white);
    for (let i = 0; i < 4; i++) g.rect(x - 2, baseY - 28 + i * 7, 6, 3, i % 2 ? PAL.red : PAL.white);
  }
}
function drawGroundTile(g: Gfx, x: number, y: number, theme: Theme, ground: string, icing: string, topExposed: boolean, c: number) {
  if (theme === "sweets") {
    g.rect(x, y, T, T, ground);
    if (!topExposed) return;
    g.rect(x, y, T, 6, icing);
    g.rect(x + 2 + (c % 3) * 2, y + 5, 2, 3 + (c % 3), icing);
    g.rect(x + 10 - (c % 2) * 2, y + 5, 2, 4, icing);
  } else if (theme === "cloud") {
    g.circle(x + 4, y + 9, 7, ground);
    g.circle(x + 12, y + 9, 7, ground);
    g.circle(x + 8, y + 5, 8, ground);
  } else if (theme === "castle") {
    g.rect(x, y, T, T, ground);
    g.box(x, y, T, T, "#5a5a70");
    if (topExposed) g.rect(x, y, T, 3, "#b0b0c4");
  } else {
    g.rect(x, y, T, T, ground);
    if (!topExposed) return;
    g.rect(x, y, T, 5, icing);
    if (c % 3 === 0) {
      g.circle(x + 8, y - 1, 2, PAL.pink);
      g.circle(x + 8, y - 1, 1, PAL.yellow);
    }
  }
}
function drawFloatTile(g: Gfx, x: number, y: number, theme: Theme, icing: string) {
  if (theme === "sweets") {
    g.rect(x, y, T, T, "#f2c48d");
    g.rect(x, y, T, 3, icing);
    g.rect(x + 3, y + 3, 2, 5, icing);
    g.rect(x + 10, y + 2, 2, 6, icing);
  } else if (theme === "cloud") {
    g.circle(x + 4, y + 8, 6, "#ffffff");
    g.circle(x + 12, y + 8, 6, "#ffffff");
    g.circle(x + 8, y + 5, 7, "#ffffff");
  } else if (theme === "castle") {
    g.rect(x, y, T, T, "#9a9ab0");
    g.rect(x, y, T, 3, "#c8c8dc");
    g.rect(x + 2, y - 3, 3, 3, "#9a9ab0");
    g.rect(x + 11, y - 3, 3, 3, "#9a9ab0");
  } else {
    g.rect(x, y, T, T, "#8a5a2c");
    g.rect(x, y, T, 3, icing);
    g.circle(x + 8, y - 1, 3, PAL.white);
  }
}
function drawBlockTile(g: Gfx, x: number, y: number, theme: Theme) {
  if (theme === "sweets") {
    g.rect(x + 1, y + 1, T - 2, T - 2, "#e8c48a");
    g.circle(x + 5, y + 5, 1, "#8a5a2c");
    g.circle(x + 11, y + 9, 1, "#8a5a2c");
    g.circle(x + 8, y + 11, 1, "#8a5a2c");
  } else if (theme === "cloud") {
    g.circle(x + 8, y + 8, 7, "#eaf8ff");
    g.box(x + 1, y + 1, T - 2, T - 2, "#bfe8ff");
  } else if (theme === "castle") {
    g.rect(x + 1, y + 1, T - 2, T - 2, "#b0b0c4");
    g.line(x + 1, y + 8, x + 15, y + 8, "#7a7a90");
    g.line(x + 8, y + 1, x + 8, y + 8, "#7a7a90");
  } else {
    g.rect(x + 1, y + 1, T - 2, T - 2, "#caa06a");
    g.box(x + 1, y + 1, T - 2, T - 2, "#8a6a3a");
  }
}
/** a bouncer tile: mushroom (meadow), gumdrop (sweets), cloud puff (cloud), banner (castle). */
function drawBouncer(g: Gfx, x: number, y: number, theme: Theme, tick: number) {
  const bob = Math.floor(tick / 6) % 2;
  if (theme === "sweets") {
    g.circle(x + 8, y + 10 - bob, 6, PAL.pink);
    g.circle(x + 8, y + 10 - bob, 3, PAL.white);
  } else if (theme === "cloud") {
    g.circle(x + 8, y + 10 - bob, 7, "#ffffff");
    g.circle(x + 5, y + 9 - bob, 3, "#ffffff");
    g.circle(x + 11, y + 9 - bob, 3, "#ffffff");
  } else if (theme === "castle") {
    g.rect(x + 3, y + 3 - bob, 10, 3, PAL.red);
    g.rect(x + 6, y + 4 - bob, 4, 10, PAL.red);
  } else {
    g.rect(x + 6, y + 8 - bob, 4, 6, "#f2c48d");
    g.circle(x + 8, y + 4 - bob, 7, PAL.red);
    g.circle(x + 5, y + 3 - bob, 1, PAL.white);
    g.circle(x + 11, y + 3 - bob, 1, PAL.white);
    g.circle(x + 8, y + 5 - bob, 1, PAL.white);
  }
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
  const rad = m.w / 2;
  const cx = m.x + rad;
  const cy = m.y + m.h / 2 + bob;
  g.circle(cx, cy, rad, color);
  g.circle(cx - rad * 0.4, cy - rad * 0.2, rad * 0.18, PAL.black);
  g.circle(cx + rad * 0.4, cy - rad * 0.2, rad * 0.18, PAL.black);
  g.line(cx - rad * 0.3, cy + rad * 0.4, cx + rad * 0.3, cy + rad * 0.4, PAL.black);
  const top = cy - m.h * 0.75;
  if (m.kind === "flame") {
    g.rect(cx - 2, top, 3, 7, PAL.red);
    g.circle(cx, top - 2, 3, PAL.yellow);
  } else if (m.kind === "spark") {
    g.line(cx - 4, top + 6, cx + 2, top, PAL.yellow);
    g.line(cx + 2, top, cx - 2, top + 3, PAL.yellow);
  } else if (m.kind === "blade") {
    g.rect(cx - 1, top - 3, 3, 9, PAL.white);
    g.rect(cx - 4, top - 4, 9, 3, PAL.grey);
  } else if (m.kind === "fruit") {
    g.rect(cx - 1, top - 1, 2, 4, PAL.green);
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
