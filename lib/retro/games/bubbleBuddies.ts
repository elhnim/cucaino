// BUBBLE BUDDIES — an original single-screen platformer in the spirit of 8-bit "catch the
// critter in a bubble" classics. A chubby baby dino-like hero waddles round one screen of
// candy platforms, blows bubbles that float forward then drift up toward the ceiling, and
// traps any critter they touch. Jump into a trapped bubble to pop it — the critter floats
// off happily and drops a piece of fruit for points (pop several in a row for a chain
// bonus). Hold A to bounce on an empty bubble like a trampoline. Walk off either edge of
// the screen and you wrap round to the other side; fall through a gap in the floor and you
// wrap back in at the top. A trapped critter that isn't popped in time escapes and comes
// back faster and angrier. Clear every critter on screen to move on — twelve rounds, with
// walkers, jumpers, flyers and critters that lob things joining in as you go. No critter is
// ever really hurt: caught ones simply float away and turn into fruit.
import { H, PAL, W, clamp, overlap, rng, type GameInstance, type Gfx, type IO, type RetroGameDef, type Rng } from "../engine";

const T = 16; // tile size
const COLS = 16; // 16 * 16 = 256 = W
const ROWS = 14; // 14 * 16 = 224 = H
const GRAV = 0.3;
const MAXFALL = 5.2;
const COYOTE = 6;
const BUFFER = 6;
const WALK = 1.05;
const HW = 12; // hero hitbox
const HH = 13;
const TOTAL_ROUNDS = 12;
const MAX_BUBBLES = 3; // empty bubbles the hero can have drifting at once
const BUBBLE_FLY_FRAMES = 26;
const DRIFT_LIFE = 240;
const CHAIN_WINDOW = 110;
const FRUIT_LIFE = 260;
const FRUIT_BASE = 100;
const HURRY_AT = 2100; // ~35s of play before the level hurries you along

// ── single-screen tile maps: "#" is a one-way platform (land on top when falling, jump
// straight up through it from below), "." is open air. Walking off either edge of the
// screen wraps round to the other side; falling through a gap in the floor wraps back in
// at the top — exactly like the arcade games this is an homage to.
const LAYOUTS: string[][] = [
  [
    "................",
    "................",
    "....########....",
    "................",
    "................",
    "..####......####",
    "................",
    "................",
    "########........",
    "................",
    "................",
    "........########",
    "................",
    "######....######",
  ],
  [
    "................",
    "..########......",
    "................",
    "................",
    "......####......",
    "................",
    "####........####",
    "................",
    "................",
    "........####....",
    "................",
    "####......####..",
    "................",
    "########..######",
  ],
  [
    "................",
    "................",
    "..##........##..",
    "................",
    "................",
    "....####....####",
    "................",
    "................",
    "####....####....",
    "................",
    "................",
    "..####....####..",
    "................",
    "#######..#######",
  ],
  [
    "................",
    "....####....####",
    "................",
    "##....####....##",
    "................",
    "................",
    "..####....####..",
    "................",
    "................",
    "####....####....",
    "................",
    "....########....",
    "................",
    "#####..#########",
  ],
];
for (const l of LAYOUTS) {
  if (l.length !== ROWS || l.some((row) => row.length !== COLS)) throw new Error("bubbleBuddies: bad layout size");
}
const STARTS = [40, 40, 40, 24];
const SKYS: [string, string][] = [
  ["#6cb6ff", "#a8dcff"],
  ["#ff9a3c", "#ffc1e6"],
  ["#5ec8ff", "#c8f4ff"],
  ["#9a5cff", "#c89aff"],
];

type CritterKind = "walker" | "jumper" | "flyer" | "thrower";
const KIND_COLOR: Record<CritterKind, string> = { walker: PAL.purple, jumper: PAL.teal, flyer: PAL.pink, thrower: PAL.orange };
const KIND_DARK: Record<CritterKind, string> = { walker: "#5f36a8", jumper: "#136b61", flyer: "#b8459a", thrower: "#b8601e" };
const FRUIT_COLORS = [PAL.red, PAL.purple, PAL.orange, PAL.yellow];

interface Hero {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;
  coyote: number;
  buffer: number;
  jumping: boolean;
  anim: number;
  blowT: number;
  blowCd: number;
  inv: number;
}
interface Critter {
  kind: CritterKind;
  x: number;
  y: number;
  w: number;
  h: number;
  dir: 1 | -1;
  spd: number;
  vy: number;
  onGround: boolean;
  angry: boolean;
  t: number;
  jumpT?: number;
  baseY?: number;
  sway?: number;
  shootT?: number;
}
interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  state: "fly" | "drift" | "trapped";
  t: number;
  sway: number;
  kind?: CritterKind;
  angry?: boolean;
  dead: boolean;
}
interface Fruit {
  x: number;
  y: number;
  w: number;
  h: number;
  vy: number;
  t: number;
  kind: number;
  dead: boolean;
}
interface Projectile {
  x: number;
  y: number;
  vx: number;
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
interface Pop {
  x: number;
  y: number;
  t: number;
  text: string;
}
interface Seg {
  x1: number;
  x2: number;
  y: number;
}

// ── pure helpers (grid, wrap, physics) ──

function platformsOf(grid: string[]): Seg[] {
  const segs: Seg[] = [];
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    while (c < COLS) {
      if (grid[r][c] === "#") {
        let c2 = c;
        while (c2 < COLS && grid[r][c2] === "#") c2++;
        segs.push({ x1: c * T, x2: c2 * T, y: r * T });
        c = c2;
      } else c++;
    }
  }
  return segs;
}
const wrapCol = (x: number) => (((Math.floor(x / T) % COLS) + COLS) % COLS);
function wrapLeft(e: { x: number; w: number }) {
  if (e.x + e.w < 0) e.x += W;
  else if (e.x > W) e.x -= W;
}
function wrapCenter(e: { x: number }, margin: number) {
  if (e.x < -margin) e.x += W;
  else if (e.x > W + margin) e.x -= W;
}
function wrapYBox(e: { y: number; h: number }) {
  if (e.y > H) e.y = -e.h + 2;
}
/** One-way platform landing: falling onto a "#" row lands on it; jumping up (dy<0) passes
 * straight through, which is how the hero (and critters) hop up through floors from below. */
function landOn<E extends { x: number; y: number; w: number; h: number }>(e: E, dy: number, grid: string[]): 0 | 1 {
  const prevBottom = e.y + e.h;
  e.y += dy;
  if (dy < 0) return 0;
  const bottom = e.y + e.h;
  const row = Math.floor(bottom / T);
  if (row < 0 || row >= ROWS || prevBottom > row * T + 2) return 0;
  const c1 = wrapCol(e.x + 2);
  const c2 = wrapCol(e.x + e.w - 2);
  if (grid[row][c1] === "#" || grid[row][c2] === "#") {
    e.y = row * T - e.h;
    return 1;
  }
  return 0;
}
function typesForRound(round: number): CritterKind[] {
  if (round <= 2) return ["walker"];
  if (round <= 4) return ["walker", "jumper"];
  if (round <= 7) return ["walker", "jumper", "flyer"];
  return ["walker", "jumper", "flyer", "thrower"];
}
function spawnCritter(kind: CritterKind, x: number, y: number, angry: boolean, speedMul: number, r: Rng): Critter {
  const base = kind === "walker" ? 0.55 : kind === "jumper" ? 0.5 : kind === "flyer" ? 0.8 : 0.32;
  const dims: Record<CritterKind, [number, number]> = { walker: [12, 11], jumper: [12, 11], flyer: [12, 10], thrower: [12, 12] };
  const [w, h] = dims[kind];
  const c: Critter = { kind, x, y, w, h, dir: r.chance(0.5) ? 1 : -1, spd: base * speedMul, vy: 0, onGround: false, angry, t: 0 };
  if (kind === "jumper") c.jumpT = r.int(40, 90);
  if (kind === "flyer") {
    c.baseY = y;
    c.sway = r.range(0, 10);
  }
  if (kind === "thrower") c.shootT = r.int(90, 170);
  return c;
}
const bubbleBox = (b: Bubble) => ({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 });
const projBox = (p: Projectile) => ({ x: p.x - 3, y: p.y - 3, w: 6, h: 6 });

function create(seed: number): GameInstance {
  const rnd = rng(seed);
  let tick = 0;
  let lives = 3;
  let round = 1;
  let over = false;
  let won = false;
  let state: "ready" | "play" | "dead" | "clear" = "ready";
  let stateT = 0;
  let grid: string[] = LAYOUTS[0];
  let spawnX = 40;
  let spawnY = (ROWS - 1) * T - HH;
  let roundSpeedMul = 1;
  let hurried = false;
  let hurryBanner = 0;
  let roundTimer = 0;
  let chain = 1;
  let lastPop = -999;

  const hero: Hero = { x: spawnX, y: spawnY, w: HW, h: HH, vx: 0, vy: 0, facing: 1, onGround: false, coyote: 0, buffer: 0, jumping: false, anim: 0, blowT: 0, blowCd: 0, inv: 0 };
  let critters: Critter[] = [];
  let bubbles: Bubble[] = [];
  let fruits: Fruit[] = [];
  let projectiles: Projectile[] = [];
  let parts: Part[] = [];
  let pops: Pop[] = [];

  const burst = (x: number, y: number, color: string, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      parts.push({ x, y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6 - 0.6, life: 24, color });
    }
  };
  const popText = (x: number, y: number, text: string) => pops.push({ x, y, t: 0, text });
  const trapLifetime = () => (hurried ? 340 : 560);

  const setupRound = (n: number) => {
    round = n;
    const li = (round - 1) % LAYOUTS.length;
    grid = LAYOUTS[li];
    spawnX = STARTS[li];
    spawnY = (ROWS - 1) * T - HH;
    hero.x = spawnX;
    hero.y = spawnY;
    hero.vx = 0;
    hero.vy = 0;
    hero.onGround = false;
    hero.facing = 1;
    hero.blowCd = 0;
    hero.blowT = 0;
    hero.inv = 60;
    roundSpeedMul = 1 + (round - 1) * 0.035;
    const segs = platformsOf(grid);
    const types = typesForRound(round);
    const count = Math.min(3 + round, 10);
    critters = [];
    for (let i = 0; i < count; i++) {
      const seg = rnd.pick(segs);
      const kind = rnd.pick(types);
      const hi = Math.max(seg.x1 + 2, seg.x2 - 14);
      const x = rnd.range(seg.x1 + 2, hi);
      critters.push(spawnCritter(kind, x, seg.y - 12, false, roundSpeedMul, rnd));
    }
    bubbles = [];
    fruits = [];
    projectiles = [];
    chain = 1;
    lastPop = -999;
    hurried = false;
    hurryBanner = 0;
    roundTimer = 0;
    state = "ready";
    stateT = 0;
  };
  setupRound(1);

  const spawnBubble = (): Bubble => ({
    x: hero.x + (hero.facing > 0 ? hero.w + 2 : -2),
    y: hero.y + 4,
    vx: hero.facing * 2.3,
    vy: 0,
    r: 9,
    state: "fly",
    t: 0,
    sway: rnd.range(0, 10),
    dead: false,
  });
  const spawnFruit = (x: number, y: number): Fruit => ({ x: x - 5, y: y - 5, w: 10, h: 10, vy: -1.2, t: 0, kind: rnd.int(0, FRUIT_COLORS.length - 1), dead: false });

  const hurt = (io: IO) => {
    if (hero.inv > 0 || state !== "play") return;
    io.sfx.play("die");
    lives--;
    burst(hero.x + hero.w / 2, hero.y + hero.h / 2, PAL.red, 10);
    if (lives <= 0) {
      state = "dead";
      stateT = 0;
    } else {
      hero.x = spawnX;
      hero.y = spawnY;
      hero.vx = 0;
      hero.vy = 0;
      hero.onGround = false;
      hero.inv = 100;
    }
  };

  const updateHero = (io: IO) => {
    const inp = io.input;
    if (inp.held.left && !inp.held.right) {
      hero.vx = Math.max(-WALK, hero.vx - 0.3);
      hero.facing = -1;
    } else if (inp.held.right && !inp.held.left) {
      hero.vx = Math.min(WALK, hero.vx + 0.3);
      hero.facing = 1;
    } else {
      hero.vx *= 0.78;
      if (Math.abs(hero.vx) < 0.05) hero.vx = 0;
    }
    hero.x += hero.vx;
    wrapLeft(hero);
    hero.anim += Math.abs(hero.vx) * 0.15;

    hero.buffer = inp.pressed.a ? BUFFER : Math.max(0, hero.buffer - 1);
    hero.coyote = hero.onGround ? COYOTE : Math.max(0, hero.coyote - 1);
    if (hero.buffer > 0 && hero.coyote > 0) {
      hero.vy = -5.3;
      hero.buffer = 0;
      hero.coyote = 0;
      hero.onGround = false;
      hero.jumping = true;
      io.sfx.play("jump");
    }
    if (hero.jumping && !inp.held.a && hero.vy < -2) hero.vy = -2;
    hero.vy = Math.min(MAXFALL, hero.vy + GRAV);
    const landed = landOn(hero, hero.vy, grid);
    if (landed === 1) {
      hero.vy = 0;
      hero.onGround = true;
      hero.jumping = false;
    } else hero.onGround = false;
    wrapYBox(hero);
    if (hero.y < 0) {
      hero.y = 0;
      if (hero.vy < 0) hero.vy = 0;
    }

    hero.blowCd = Math.max(0, hero.blowCd - 1);
    hero.blowT = Math.max(0, hero.blowT - 1);
    const blown = bubbles.filter((b) => !b.dead && b.state !== "trapped").length;
    if (inp.pressed.b && hero.blowCd === 0 && blown < MAX_BUBBLES) {
      bubbles.push(spawnBubble());
      hero.blowCd = 22;
      hero.blowT = 14;
      io.sfx.play("shoot");
    }
    hero.inv = Math.max(0, hero.inv - 1);
  };

  const updateCritters = (io: IO) => {
    for (const c of critters) {
      c.t++;
      const spd = c.spd * (c.angry ? 1.6 : 1) * (hurried ? 1.35 : 1);
      if (c.kind === "flyer") {
        c.baseY = c.baseY ?? c.y;
        c.y = clamp(c.baseY + Math.sin((tick + (c.sway ?? 0)) * 0.06) * 10, 10, H - 24);
        c.x += c.dir * spd;
        wrapLeft(c);
        if (rnd.chance(0.006)) c.dir = (-c.dir) as 1 | -1;
        continue;
      }
      c.vy = Math.min(MAXFALL, c.vy + GRAV);
      const landed = landOn(c, c.vy, grid);
      if (landed === 1) {
        c.vy = 0;
        c.onGround = true;
      } else c.onGround = false;
      wrapYBox(c);
      if (c.onGround) {
        const aheadX = c.x + (c.dir > 0 ? c.w + 2 : -2);
        const col = wrapCol(aheadX);
        const rowBelow = Math.floor((c.y + c.h + 2) / T);
        if (rowBelow >= ROWS || grid[rowBelow][col] !== "#") c.dir = (-c.dir) as 1 | -1;
      }
      if (c.kind === "jumper") {
        c.jumpT = (c.jumpT ?? 0) - 1;
        if (c.onGround && c.jumpT <= 0) {
          c.vy = -4.3;
          c.jumpT = rnd.int(50, 110);
        }
      }
      const moveSpd = c.kind === "thrower" ? spd * 0.4 : spd;
      c.x += c.dir * moveSpd;
      wrapLeft(c);
      if (c.kind === "thrower") {
        c.shootT = (c.shootT ?? 0) - 1;
        if (c.shootT <= 0) {
          const dir: 1 | -1 = hero.x < c.x ? -1 : 1;
          projectiles.push({ x: c.x + (dir > 0 ? c.w : 0), y: c.y + c.h / 2, vx: dir * 1.7, t: 0 });
          io.sfx.play("laser");
          c.shootT = Math.round(rnd.int(110, 190) / (c.angry ? 1.4 : 1));
        }
      }
    }
  };

  const updateProjectiles = () => {
    for (const p of projectiles) {
      p.x += p.vx;
      wrapCenter(p, 4);
      p.t++;
    }
    projectiles = projectiles.filter((p) => p.t < 240);
  };

  const updateBubbles = () => {
    for (const b of bubbles) {
      if (b.dead) continue;
      b.t++;
      if (b.state === "fly") {
        b.x += b.vx;
        wrapCenter(b, b.r);
        for (const c of critters) {
          if (overlap(bubbleBox(b), c)) {
            b.state = "trapped";
            b.kind = c.kind;
            b.angry = c.angry;
            b.vx = 0;
            b.vy = -0.25;
            critters.splice(critters.indexOf(c), 1);
            break;
          }
        }
        if (b.state === "fly" && b.t > BUBBLE_FLY_FRAMES) b.state = "drift";
      } else {
        b.vy = Math.max(-0.8, b.vy - 0.02);
        b.y += b.vy;
        b.x += Math.sin((tick + b.sway) * 0.05) * 0.4;
        wrapCenter(b, b.r);
        if (b.y < 22) {
          b.y = 22;
          b.vy = 0;
        }
        if (b.state === "drift" && b.t > BUBBLE_FLY_FRAMES + DRIFT_LIFE) b.dead = true;
        if (b.state === "trapped" && b.t > trapLifetime()) {
          critters.push(spawnCritter(b.kind!, b.x - 6, b.y - 5, true, roundSpeedMul, rnd));
          b.dead = true;
        }
      }
    }
    bubbles = bubbles.filter((b) => !b.dead);
  };

  const updateFruit = () => {
    for (const f of fruits) {
      f.t++;
      f.vy = Math.min(MAXFALL, f.vy + GRAV * 0.7);
      const landed = landOn(f, f.vy, grid);
      if (landed === 1) f.vy = 0;
      wrapYBox(f);
    }
    fruits = fruits.filter((f) => !f.dead && f.t < FRUIT_LIFE);
  };

  const hurtCheck = (io: IO) => {
    if (hero.inv > 0 || state !== "play") return;
    for (const c of critters) {
      if (overlap(hero, c)) return hurt(io);
    }
    for (const p of projectiles) {
      if (overlap(hero, projBox(p))) return hurt(io);
    }
  };
  const bubbleCheck = (io: IO) => {
    if (state !== "play") return;
    for (const b of bubbles) {
      if (!overlap(hero, bubbleBox(b))) continue;
      if (b.state === "trapped") {
        io.sfx.play("explode");
        fruits.push(spawnFruit(b.x, b.y));
        chain = tick - lastPop < CHAIN_WINDOW ? Math.min(chain + 1, 8) : 1;
        lastPop = tick;
        io.score(10 * chain);
        popText(b.x, b.y - 10, `+${10 * chain}`);
        b.dead = true;
      } else if (io.input.held.a && hero.vy > 0.4 && hero.y + hero.h - hero.vy <= b.y + 2) {
        hero.vy = -5.6;
        hero.onGround = false;
        hero.jumping = false;
        io.sfx.play("bounce");
      }
    }
    bubbles = bubbles.filter((b) => !b.dead);
  };
  const fruitCheck = (io: IO) => {
    for (const f of fruits) {
      if (f.dead || !overlap(hero, f)) continue;
      io.sfx.play("coin");
      const pts = FRUIT_BASE * chain;
      io.score(pts);
      popText(f.x, f.y - 8, `+${pts}`);
      f.dead = true;
    }
  };
  const checkClear = (io: IO) => {
    if (state !== "play") return;
    if (critters.length === 0 && bubbles.every((b) => b.state !== "trapped")) {
      state = "clear";
      stateT = 0;
      io.sfx.play("win");
      io.score(300 + lives * 50);
    }
  };

  return {
    update(io) {
      if (over || won) return;
      tick++;
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.life--;
      }
      parts = parts.filter((p) => p.life > 0);
      for (const p of pops) p.t++;
      pops = pops.filter((p) => p.t < 36);
      hurryBanner = Math.max(0, hurryBanner - 1);

      if (state === "ready") {
        stateT++;
        if (stateT > 80) {
          state = "play";
          stateT = 0;
        }
        return;
      }
      if (state === "dead") {
        stateT++;
        if (stateT > 90) {
          over = true;
          io.gameOver();
        }
        return;
      }
      if (state === "clear") {
        stateT++;
        if (stateT > 130) {
          if (round >= TOTAL_ROUNDS) {
            won = true;
            io.score(lives * 500);
            io.win();
            return;
          }
          setupRound(round + 1);
        }
        return;
      }

      roundTimer++;
      if (!hurried && roundTimer > HURRY_AT) {
        hurried = true;
        hurryBanner = 150;
      }

      updateHero(io);
      updateCritters(io);
      updateProjectiles();
      updateBubbles();
      updateFruit();
      hurtCheck(io);
      bubbleCheck(io);
      fruitCheck(io);
      checkClear(io);
    },

    draw(g: Gfx) {
      const sky = SKYS[(round - 1) % SKYS.length];
      g.clear(sky[0]);
      g.rect(0, H - 28, W, 28, sky[1]);
      for (let i = 0; i < 4; i++) {
        const x = (i * 70 + 24) % W;
        g.circle(x, 18, 9, sky[1]);
        g.circle(x + 10, 14, 7, sky[1]);
      }

      // platforms
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c] !== "#") continue;
          const x = c * T;
          const y = r * T;
          g.rect(x, y, T, 5, PAL.pink);
          g.rect(x, y, T, 1, "#ffd4ec");
          g.rect(x, y + 5, T, 4, "#d078a8");
        }
      }

      // fruit
      for (const f of fruits) {
        const cx = f.x + f.w / 2;
        const cy = f.y + f.h / 2;
        g.circle(cx, cy, 5, FRUIT_COLORS[f.kind]);
        g.rect(cx - 1, cy - 7, 2, 3, PAL.green);
      }

      // bubbles (wobbly and translucent; a trapped critter shows faintly inside)
      for (const b of bubbles) {
        const wob = Math.sin((tick + b.sway) * 0.15);
        g.alpha(0.3);
        g.circle(b.x, b.y, b.r + wob, PAL.cyan);
        g.alpha(1);
        g.alpha(0.8);
        g.circle(b.x - 3, b.y - 3, 2, PAL.white);
        g.alpha(1);
        if (b.state === "trapped" && b.kind) {
          const col = b.angry ? PAL.red : KIND_COLOR[b.kind];
          g.circle(b.x, b.y, 4, col);
        }
      }

      // critters
      for (const c of critters) {
        const col = c.angry ? PAL.red : KIND_COLOR[c.kind];
        const dark = c.angry ? "#a82a3a" : KIND_DARK[c.kind];
        const cx = c.x + c.w / 2;
        const cy = c.y + c.h / 2;
        if (c.kind === "flyer") {
          const wing = Math.sin(c.t * 0.3) * 3;
          g.circle(cx - 6, cy - wing, 4, col);
          g.circle(cx + 6, cy - wing, 4, col);
          g.circle(cx, cy, 5, col);
        } else if (c.kind === "thrower") {
          g.circle(cx, cy, 6, col);
          g.rect(c.dir > 0 ? cx + 4 : cx - 8, cy - 1, 4, 2, dark);
        } else if (c.kind === "jumper") {
          g.circle(cx, cy - 1, 5, col);
          g.rect(cx - 3, cy + 4, 2, 3, dark);
          g.rect(cx + 1, cy + 4, 2, 3, dark);
        } else {
          g.circle(cx, cy, 5, col);
          const leg = Math.floor(c.t / 8) % 2;
          g.rect(cx - 3, cy + 3, 2, 2 + leg, dark);
          g.rect(cx + 1, cy + 3, 2, 3 - leg, dark);
        }
        g.rect(cx - 2, cy - 2, 1, 2, PAL.black);
        g.rect(cx + 1, cy - 2, 1, 2, PAL.black);
      }

      // thrown pebbles
      for (const p of projectiles) g.circle(p.x, p.y, 3, PAL.brown);

      // hero — a chubby baby dino, "Bubblo"
      const blink = hero.inv > 0 && Math.floor(hero.inv / 4) % 2 === 1;
      if (!blink) {
        const dir = hero.facing;
        const cx = hero.x + hero.w / 2;
        const cy = hero.y + hero.h / 2 + 2;
        const legSwing = hero.onGround && Math.abs(hero.vx) > 0.1 ? Math.sin(hero.anim * 2) : 0;
        g.rect(cx - 4, hero.y + hero.h - 3, 3, legSwing > 0 ? 4 : 3, PAL.dark);
        g.rect(cx + 1, hero.y + hero.h - 3, 3, legSwing < 0 ? 4 : 3, PAL.dark);
        g.rect(cx - dir * 7, hero.y + hero.h - 7, 3, 3, PAL.green);
        g.circle(cx, cy, 6, PAL.green);
        g.circle(cx, cy + 2, 4, PAL.lime);
        g.rect(cx - 2, hero.y + 1, 2, 3, PAL.orange);
        g.rect(cx + 2, hero.y + 1, 2, 3, PAL.orange);
        const headX = cx + dir * 4;
        g.circle(headX, hero.y + 5, 5, PAL.green);
        g.circle(headX + dir * 2, hero.y + 3, 2, PAL.white);
        g.rect(headX + dir * 2, hero.y + 3, 1, 1, PAL.black);
        g.rect(headX + dir * 5, hero.y + 5, 2, 2, PAL.lime);
        if (hero.blowT > 0) {
          g.circle(headX + dir * 3, hero.y + 6, 3, PAL.lime);
          const bubR = 2 + (14 - hero.blowT) * 0.35;
          g.alpha(0.5);
          g.circle(headX + dir * (6 + bubR), hero.y + 6, bubR, PAL.cyan);
          g.alpha(1);
        }
      }

      for (const p of parts) g.rect(p.x, p.y, 2, 2, p.color);
      for (const p of pops) g.text(p.text, p.x, p.y - p.t * 0.5, PAL.white);

      // HUD
      g.rect(0, 0, W, 12, "rgba(13,11,26,0.55)");
      g.text(`♥X${lives}`, 4, 2, PAL.red);
      const left = critters.length + bubbles.filter((b) => b.state === "trapped").length;
      g.text(`${left} LEFT`, 70, 2, PAL.cyan);
      g.text(`ROUND ${round}/${TOTAL_ROUNDS}`, W - 4, 2, PAL.white, { align: "right" });

      if (state === "ready") {
        g.rect(40, 94, W - 80, 30, "rgba(13,11,26,0.75)");
        g.text(`ROUND ${round}`, W / 2, 100, PAL.yellow, { align: "center" });
        g.text("TRAP THE CRITTERS!", W / 2, 112, PAL.white, { align: "center" });
      }
      if (state === "clear") {
        g.rect(40, 94, W - 80, 30, "rgba(13,11,26,0.75)");
        g.text(round >= TOTAL_ROUNDS ? "YOU DID IT!" : "ROUND CLEAR!", W / 2, 100, PAL.pink, { align: "center" });
        g.text(round >= TOTAL_ROUNDS ? "ALL BUDDIES SAVED" : "NICE BUBBLING!", W / 2, 112, PAL.white, { align: "center" });
      }
      if (state === "dead" && lives <= 0) {
        g.rect(40, 94, W - 80, 24, "rgba(13,11,26,0.75)");
        g.text("OUT OF BUBBLES!", W / 2, 102, PAL.red, { align: "center" });
      }
      if (hurryBanner > 0 && Math.floor(hurryBanner / 10) % 2 === 0) {
        g.text("HURRY UP!", W / 2, 16, PAL.yellow, { align: "center", size: 1 });
      }
    },
  };
}

export const bubbleBuddies: RetroGameDef = {
  id: "bubble-buddies",
  title: "Bubble Buddies",
  blurb: "Blow bubbles to trap critters, pop them for fruit, and clear 12 rounds!",
  genre: "Platformer",
  emoji: "🫧",
  color: "#5ef2ff",
  controls: "◀ ▶ walk · A jump (jump up through platforms) · B blow a bubble · hold A to bounce on bubbles",
  pad: { dpad: "lr", a: "Jump", b: "Bubble" },
  create,
};
