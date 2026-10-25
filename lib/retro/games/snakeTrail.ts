// SNAKE TRAIL — a grid snake game in a candy garden. Steer the snake to munch apples and
// grow longer; a golden apple sometimes appears for a short time and is worth lots of
// points. Every 10 apples you reach a new garden with a new pattern of rock walls, and the
// snake slithers a little faster. Don't bump into walls or your own tail! Turns are queued
// (up to two), so quick taps on the D-pad always count. Three lives.
//
// Look: a calm, dark checkerboard lawn (two close greens, a few flowers/grass tufts — never
// red/orange/gold, so nothing is mistaken for an apple), chunky bevelled stone walls, a shiny
// round apple + sparkling golden apple, and a bright lime snake of rounded squares chained
// edge to edge with a bigger, cute directional head. The whole garden floor + walls bake into
// ONE picture per level (`buildBg`) so the busy maze costs a single drawImage a frame instead
// of hundreds of rects.
import { PAL, W, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, hash2, outlined, shade, tinted } from "../art";

const CELL = 8;
const COLS = 32;
const ROWS = 26;
const OY = 16;
const START = { c: 5, r: 21 };

type Dir = 0 | 1 | 2 | 3; // up, left, down, right
const DX = [0, -1, 0, 1];
const DY = [-1, 0, 1, 0];
const BTN = ["up", "left", "down", "right"] as const;
const opp = (d: number) => (d + 2) % 4;

// ── small hand-drawn decorations (cheap: plain string tables, baked into canvases lazily by
// the host the first time they're drawn). Never red/orange/gold here — those colours are
// reserved for apples, so a kid never mistakes a decoration for something to chase. ──
const FLOWER_DECO = sprite(
  ["........", "...ww...", "..wwww..", ".wwyyww.", ".wwyyww.", "..wwww..", "...ll...", "........"],
  { w: PAL.white, y: PAL.yellow, l: shade(PAL.green, -0.15) },
);
const TUFT_DECO = sprite(
  ["........", "........", "...d....", "..ldl...", ".ldldl..", "ldlldld.", "........", "........"],
  { d: shade(PAL.green, -0.3), l: shade(PAL.green, 0.3) },
);

// ── bigger procedural sprites, baked once lazily (see makeArt below). The hero and food are
// drawn well past the 8px grid cell (never past a kid-friendly hitbox) so they read at the
// painting's chunky proportions instead of looking like tiny flat chips. ──
/** a round, shiny apple (or golden apple) a good deal bigger than one grid cell */
function buildApple(golden: boolean): Sprite {
  const w = 10;
  const h = 10;
  const cx = 4.6;
  const cy = 5.6;
  const rx = 4.1;
  const ry = 3.7;
  const base = golden ? PAL.yellow : PAL.red;
  const dark = golden ? PAL.orange : shade(PAL.red, -0.3);
  const light = golden ? shade(PAL.yellow, 0.35) : shade(PAL.red, 0.3);
  return bake(w, h, (x, y) => {
    const dx = (x + 0.5 - cx) / rx;
    const dy = (y + 0.5 - cy) / ry;
    const d = dx * dx + dy * dy;
    if (d <= 1) {
      const hl = Math.hypot(x + 0.5 - (cx - 1.5), y + 0.5 - (cy - 1.6));
      if (hl < 1.2) return light;
      return d > 0.78 ? dark : base;
    }
    if (x >= 4 && x <= 5 && y <= 1) return shade(PAL.brown, -0.1);
    const lx = x - 6.4;
    const ly = y - 0.8;
    if (lx * lx * 1.6 + ly * ly < 2.6 && y <= 2) return PAL.green;
    return null;
  });
}
/** is (px, py) inside a w x h square with its 4 corners rounded off to radius R? */
function insideRoundedSquare(px: number, py: number, w: number, h: number, R: number): boolean {
  const nearX = px < R ? R : px > w - R ? w - R : null;
  const nearY = py < R ? R : py > h - R ? h - R : null;
  if (nearX === null || nearY === null) return true;
  return Math.hypot(px - nearX, py - nearY) <= R;
}
/** a bright lime rounded square that fills the grid cell almost edge to edge — one snake body
 * segment, chained end to end with no gaps (see the painting's blocky chain) */
function buildBody(): Sprite {
  const w = 9;
  const h = 9;
  return bake(w, h, (x, y) => {
    if (!insideRoundedSquare(x + 0.5, y + 0.5, w, h, 1.6)) return null;
    const diag = x + y;
    if (diag <= 5) return shade(PAL.lime, 0.3);
    if (diag >= 11) return shade(PAL.lime, -0.3);
    return PAL.lime;
  });
}
/** a bigger lime rounded square with a cute face looking the way the snake is heading (ex, ey
 * = the direction's unit vector); the perpendicular vector always places the two eyes side-on
 * to the direction of travel, so one function covers all four facings */
function buildHead(ex: number, ey: number): Sprite {
  const w = 12;
  const h = 12;
  const cx = 5.5;
  const cy = 5.5;
  const px = -ey;
  const py = ex;
  const fwd = 2.3;
  const spread = 2.2;
  const eye1 = { x: cx + ex * fwd + px * spread, y: cy + ey * fwd + py * spread };
  const eye2 = { x: cx + ex * fwd - px * spread, y: cy + ey * fwd - py * spread };
  const mouth = { x: cx + ex * 4.6, y: cy + ey * 4.6 };
  return bake(w, h, (x, y) => {
    const px5 = x + 0.5;
    const py5 = y + 0.5;
    if (!insideRoundedSquare(px5, py5, w, h, 2.2)) return null;
    const d1 = Math.hypot(px5 - eye1.x, py5 - eye1.y);
    if (d1 < 1.3) return d1 < 0.55 ? PAL.black : PAL.white;
    const d2 = Math.hypot(px5 - eye2.x, py5 - eye2.y);
    if (d2 < 1.3) return d2 < 0.55 ? PAL.black : PAL.white;
    const dm = Math.hypot(px5 - mouth.x, py5 - mouth.y);
    if (dm < 1.15) return PAL.pink;
    const diag = x + y;
    if (diag <= 7) return shade(PAL.lime, 0.3);
    if (diag >= 15) return shade(PAL.lime, -0.3);
    return PAL.lime;
  });
}

type Deco = "flower" | "tuft";
/** garden palette per pattern (0 = the classic candy-garden green, matching the cabinet art):
 * two CLOSE, deep, rich greens per pair — a calm checkerboard, never pale or minty, so the
 * lime snake and red apples pop against it */
const GARDEN_TINTS: [string, string][] = [
  ["#1d6b3a", "#246f3e"],
  ["#145c4e", "#1b6b58"],
  ["#2e6b1f", "#357423"],
  ["#1f5c3d", "#276844"],
  ["#1a6456", "#1f7562"],
  ["#184a2e", "#1f5536"],
];

/** wall patterns, one per garden; later gardens repeat them at higher speed */
function wallsFor(level: number): boolean[][] {
  const w = Array.from({ length: ROWS }, () => new Array<boolean>(COLS).fill(false));
  const set = (c: number, r: number) => {
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) w[r][c] = true;
  };
  for (let c = 0; c < COLS; c++) {
    set(c, 0);
    set(c, ROWS - 1);
  }
  for (let r = 0; r < ROWS; r++) {
    set(0, r);
    set(COLS - 1, r);
  }
  const hline = (r: number, c0: number, c1: number) => {
    for (let c = c0; c <= c1; c++) set(c, r);
  };
  const vline = (c: number, r0: number, r1: number) => {
    for (let r = r0; r <= r1; r++) set(c, r);
  };
  const pattern = (level - 1) % 6;
  if (pattern === 1) {
    hline(8, 8, 23);
    hline(17, 8, 23);
  } else if (pattern === 2) {
    hline(5, 5, 10);
    vline(5, 5, 9);
    hline(5, 21, 26);
    vline(26, 5, 9);
    hline(19, 21, 26);
    vline(26, 15, 19);
    hline(19, 5, 10);
    vline(5, 15, 19);
  } else if (pattern === 3) {
    vline(15, 4, 9);
    vline(16, 4, 9);
    vline(15, 16, 21);
    vline(16, 16, 21);
    hline(12, 4, 10);
    hline(13, 4, 10);
    hline(12, 21, 27);
    hline(13, 21, 27);
  } else if (pattern === 4) {
    for (let c = 5; c < COLS - 3; c += 6)
      for (let r = 5; r < ROWS - 5; r += 6) {
        set(c, r);
        set(c + 1, r);
        set(c, r + 1);
        set(c + 1, r + 1);
      }
  } else if (pattern === 5) {
    vline(10, 4, 10);
    vline(10, 15, 20);
    vline(21, 4, 10);
    vline(21, 15, 20);
    hline(3, 13, 18);
    hline(22, 13, 18);
  }
  // always leave the starting lane clear
  for (let c = 1; c <= 14; c++) w[START.r][c] = false;
  return w;
}

/** scattered cosmetic flowers/cherries/candies on open grass (never on walls or the start lane) */
function decosFor(walls: boolean[][]): Map<string, Deco> {
  const m = new Map<string, Deco>();
  for (let rr = 1; rr < ROWS - 1; rr++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (walls[rr][c]) continue;
      if (rr === START.r && c <= 14) continue;
      // sparse (~2% of free cells) and only flowers/tufts — never red/orange/gold, so nothing
      // but an apple ever looks like an apple
      const h = hash2(c, rr, 503);
      if (h > 0.99) m.set(`${c},${rr}`, "flower");
      else if (h > 0.98) m.set(`${c},${rr}`, "tuft");
    }
  }
  return m;
}

/** one chunky, bevelled stone block filling its cell — a round-ish boulder with a light
 * top-left face, a dark bottom-right face and its own dark outline, so a run of them in the
 * maze (or the border) reads as a pile of separate stones, not a flat slab */
function wallColor(c: number, rr: number, lx: number, ly: number, walls: boolean[][]): string {
  const OUTLINE = "#1c1830";
  const exposedTop = rr > 0 && !walls[rr - 1][c];
  if (lx === 0 || ly === 0 || lx === 7 || ly === 7) {
    if (exposedTop && ly === 0) {
      const moss = hash2(c * 7 + lx, rr * 7, 97);
      if (moss > 0.6) return shade(PAL.green, -0.1);
    }
    return OUTLINE;
  }
  const diag = lx + ly; // 2..12 across the 6x6 interior
  let col = diag <= 5 ? shade(PAL.grey, 0.32) : diag >= 9 ? shade(PAL.grey, -0.28) : PAL.grey;
  const fleck = hash2(c * 13 + lx, rr * 13 + ly, 211);
  if (fleck > 0.93) col = shade(col, -0.15);
  return col;
}

/** a calm, dark checkerboard lawn of two close greens (like the painting) with a sprinkle of
 * tiny, very subtle blade flecks — never the loud, pale mottling of open noise, so the snake
 * and apples are what pop */
function grassColor(x: number, y: number, tintA: string, tintB: string): string {
  const c = Math.floor(x / CELL);
  const rr = Math.floor(y / CELL);
  let col = (c + rr) % 2 === 0 ? tintA : tintB;
  const fleck = hash2(x, y, 601);
  if (fleck > 0.985) col = shade(col, 0.22);
  else if (fleck > 0.965) col = shade(col, -0.15);
  return col;
}

interface Art {
  apple: Sprite;
  gold: Sprite;
  body: Sprite;
  bodyCrash: Sprite;
  head: [Sprite, Sprite, Sprite, Sprite]; // indexed by Dir
  headCrash: Sprite;
  hudBar: Sprite;
}

function makeArt(): Art {
  const hudBar = bake(W, OY, (x, y) => {
    if (y === 0) return shade(PAL.night, 0.35);
    if (y === OY - 1) return shade(PAL.night, -0.3);
    const n = hash2(x, y, 909);
    return n > 0.9 ? shade(PAL.night, 0.08) : PAL.night;
  });
  const body = outlined(buildBody());
  const headRight = outlined(buildHead(1, 0));
  return {
    apple: outlined(buildApple(false)),
    gold: outlined(buildApple(true)),
    body,
    bodyCrash: tinted(body, PAL.grey),
    head: [outlined(buildHead(0, -1)), outlined(buildHead(-1, 0)), outlined(buildHead(0, 1)), headRight],
    headCrash: tinted(headRight, PAL.grey),
    hudBar,
  };
}
let A: Art | null = null;
const art = () => (A ??= makeArt());

/** the whole garden floor for a level — grass + chunky stone walls + scattered decorations —
 * baked into ONE picture so draw() costs a single drawImage instead of ~800 rects a frame. */
function buildBg(walls: boolean[][], decos: Map<string, Deco>, pattern: number): Sprite {
  const [tintA, tintB] = GARDEN_TINTS[pattern % GARDEN_TINTS.length];
  return bake(W, ROWS * CELL, (x, y) => {
    const c = Math.min(COLS - 1, Math.floor(x / CELL));
    const rr = Math.min(ROWS - 1, Math.floor(y / CELL));
    const lx = x - c * CELL;
    const ly = y - rr * CELL;
    if (walls[rr][c]) return wallColor(c, rr, lx, ly, walls);
    const deco = decos.get(`${c},${rr}`);
    if (deco) {
      const spr = deco === "flower" ? FLOWER_DECO : TUFT_DECO;
      const ch = spr.rows[ly]?.[lx] ?? ".";
      if (ch !== ".") return spr.pal[ch] ?? null;
    }
    return grassColor(x, y, tintA, tintB);
  });
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  let level = 1;
  let walls: boolean[][] = [];
  let decos = new Map<string, Deco>();
  let bg: Sprite;
  const setupLevel = () => {
    walls = wallsFor(level);
    decos = decosFor(walls);
    bg = buildBg(walls, decos, level - 1);
  };
  setupLevel();
  let snake: { c: number; r: number }[] = [];
  let dir: Dir = 3;
  let queue: Dir[] = [];
  let grow = 0;
  let stepT = 0;
  let lives = 3;
  let applesInLevel = 0;
  let apple = { c: 0, r: 0 };
  let gold: { c: number; r: number; t: number } | null = null;
  let ready = 90;
  let crash = -1;
  let levelUp = -1;
  let over = false;
  let frame = 0;
  let shake = 0;
  let munch = 0;
  const sparks: Spark[] = [];
  const pops: { x: number; y: number; text: string; t: number }[] = [];

  const occupied = (c: number, rr: number) => walls[rr][c] || snake.some((s) => s.c === c && s.r === rr) || (apple.c === c && apple.r === rr) || (!!gold && gold.c === c && gold.r === rr);
  const freeCell = () => {
    for (let i = 0; i < 400; i++) {
      const c = r.int(1, COLS - 2);
      const rr = r.int(1, ROWS - 2);
      if (!occupied(c, rr)) return { c, r: rr };
    }
    for (let rr = 1; rr < ROWS - 1; rr++) for (let c = 1; c < COLS - 1; c++) if (!occupied(c, rr)) return { c, r: rr };
    return { c: 1, r: 1 };
  };
  const resetSnake = () => {
    snake = [];
    for (let i = 0; i < 4; i++) snake.push({ c: START.c - i, r: START.r });
    dir = 3;
    queue = [];
    grow = 0;
    stepT = 0;
  };
  resetSnake();
  apple = freeCell();

  const interval = () => Math.max(3.2, 9 - (level - 1) * 0.8 - applesInLevel * 0.06);
  const burst = (c: number, rr: number, color: string, n: number) => {
    for (let i = 0; i < n; i++) sparks.push({ x: c * CELL + 4, y: OY + rr * CELL + 4, vx: r.range(-1.6, 1.6), vy: r.range(-2, 0.8), life: r.int(15, 30), color });
  };

  const readTurns = (io: IO) => {
    for (let d = 0; d < 4; d++) {
      if (!io.input.pressed[BTN[d]]) continue;
      const last = queue.length ? queue[queue.length - 1] : dir;
      if (d !== last && d !== opp(last) && queue.length < 2) queue.push(d as Dir);
    }
  };

  const step = (io: IO) => {
    if (queue.length) dir = queue.shift()!;
    const head = snake[0];
    const nc = head.c + DX[dir];
    const nr = head.r + DY[dir];
    const tailMoves = grow === 0;
    const bodyHit = snake.some((s, i) => (i < snake.length - 1 || !tailMoves) && s.c === nc && s.r === nr);
    if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || walls[nr][nc] || bodyHit) {
      crash = 0;
      shake = 14;
      io.sfx.play("die");
      io.sfx.noise?.(0.3, 0.45, 600, 90);
      burst(head.c, head.r, PAL.lime, 10);
      burst(head.c, head.r, PAL.white, 6);
      return;
    }
    snake.unshift({ c: nc, r: nr });
    if (grow > 0) grow--;
    else snake.pop();
    io.sfx.tone(160 + (snake.length % 4) * 20, 0.02, "square", 0.03);

    if (nc === apple.c && nr === apple.r) {
      grow += 1;
      applesInLevel++;
      munch = 10;
      const pts = 10 * level;
      io.score(pts);
      pops.push({ x: nc * CELL + 4, y: OY + nr * CELL, text: `+${pts}`, t: 0 });
      io.sfx.play("coin");
      io.sfx.slide?.(620, 920, 0.07, "square", 0.12);
      burst(nc, nr, PAL.red, 8);
      burst(nc, nr, PAL.white, 4);
      if (applesInLevel >= 10) {
        levelUp = 0;
        io.sfx.play("win");
        io.score(100 * level);
        return;
      }
      apple = freeCell();
      if (!gold && r.chance(0.25)) {
        const f = freeCell();
        gold = { ...f, t: 330 };
      }
    } else if (gold && nc === gold.c && nr === gold.r) {
      grow += 3;
      munch = 14;
      const pts = 50 * level;
      io.score(pts);
      pops.push({ x: nc * CELL + 4, y: OY + nr * CELL, text: `+${pts}`, t: 0 });
      io.sfx.play("powerup");
      io.sfx.slide?.(500, 1300, 0.18, "square", 0.18);
      io.sfx.noise?.(0.15, 0.1, 4000, 1200);
      burst(nc, nr, PAL.yellow, 14);
      burst(nc, nr, PAL.orange, 6);
      gold = null;
    }
  };

  return {
    update(io) {
      frame++;
      for (const s of sparks) {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.1;
        s.life--;
      }
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
      for (const p of pops) p.t++;
      for (let i = pops.length - 1; i >= 0; i--) if (pops[i].t > 40) pops.splice(i, 1);
      if (shake > 0) shake--;
      if (munch > 0) munch--;
      if (over) return;

      if (crash >= 0) {
        crash++;
        if (crash > 70) {
          crash = -1;
          lives--;
          if (lives <= 0) {
            over = true;
            io.gameOver();
            return;
          }
          resetSnake();
          gold = null;
          if (snake.some((s) => s.c === apple.c && s.r === apple.r)) apple = freeCell();
          ready = 70;
          io.sfx.play("blip");
        }
        return;
      }
      if (levelUp >= 0) {
        levelUp++;
        if (levelUp === 8) io.sfx.tone(660, 0.08, "square", 0.15);
        if (levelUp === 16) io.sfx.tone(880, 0.08, "square", 0.15);
        if (levelUp === 24) io.sfx.tone(1100, 0.1, "square", 0.18);
        if (levelUp > 100) {
          levelUp = -1;
          level++;
          applesInLevel = 0;
          setupLevel();
          resetSnake();
          gold = null;
          apple = freeCell();
          ready = 70;
        }
        return;
      }
      if (ready > 0) {
        ready--;
        readTurns(io);
        if (queue.length) ready = 0;
        return;
      }

      readTurns(io);
      if (gold) {
        gold.t--;
        if (gold.t <= 0) gold = null;
        else if (frame % 8 === 0) burst(gold.c, gold.r, PAL.yellow, 1);
      }
      stepT++;
      if (stepT >= interval()) {
        stepT -= interval();
        step(io);
      }
    },

    draw(g: Gfx) {
      const a = art();
      const [tintA] = GARDEN_TINTS[(level - 1) % GARDEN_TINTS.length];
      g.clear(tintA);

      // a few decaying frames of screen shake on a crash — world only, never the HUD
      const sk = shake > 0 ? Math.min(2, Math.ceil(shake / 5)) : 0;
      const shx = sk ? (frame % 2 ? sk : -sk) : 0;
      const shy = sk ? (frame % 4 < 2 ? sk : -sk) : 0;
      g.camera(shx, shy);

      g.sprite(bg, 0, OY);

      // apple/gold sprites are baked bigger than one cell (12x12 vs an 8px cell) so they read
      // as chunky and juicy, like the painting — offset by half the overflow to stay centred
      const bob = Math.floor(frame / 15) % 2;
      g.sprite(a.apple, apple.c * CELL - 2, OY + apple.r * CELL - 2 + bob);
      if (gold && (gold.t > 90 || Math.floor(gold.t / 5) % 2)) {
        g.sprite(a.gold, gold.c * CELL - 2, OY + gold.r * CELL - 2);
        if (frame % 10 < 5) g.rect(gold.c * CELL + 6, OY + gold.r * CELL - 2, 2, 2, PAL.white);
      }

      // snake: baked rounded segments (also bigger than the cell, so they overlap into a
      // continuous plump chain) with a thin connector filling any gap at corners
      const hidden = crash >= 0 && Math.floor(crash / 5) % 2 === 1;
      if (!hidden) {
        for (let i = snake.length - 1; i >= 1; i--) {
          const s = snake[i];
          const x = s.c * CELL;
          const y = OY + s.r * CELL;
          g.sprite(crash >= 0 ? a.bodyCrash : a.body, x - 1.5, y - 1.5);
          const n = snake[i - 1];
          if (Math.abs(n.c - s.c) + Math.abs(n.r - s.r) === 1) {
            const col = crash >= 0 ? PAL.grey : PAL.lime;
            const jx = Math.min(n.c, s.c) * CELL + (n.c !== s.c ? 5 : 1);
            const jy = OY + Math.min(n.r, s.r) * CELL + (n.r !== s.r ? 5 : 1);
            g.rect(jx, jy, n.c !== s.c ? 6 : CELL - 2, n.r !== s.r ? 6 : CELL - 2, col);
          }
        }
        const h = snake[0];
        const hx = h.c * CELL;
        const hy = OY + h.r * CELL;
        const pulse = munch > 0 ? 1 + Math.min(0.3, (munch / 14) * 0.3) : 1;
        const cx = hx + 4; // the cell's centre (head sprite is 14x14, centred on it)
        const cy = hy + 4;
        const headSpr = crash >= 0 ? a.headCrash : a.head[dir];
        g.sprite(headSpr, cx - 7 * pulse, cy - 7 * pulse, { scale: pulse });
        if (frame % 40 < 10 && crash < 0) g.rect(cx + DX[dir] * 7 - 1, cy + DY[dir] * 7 - 1, 2, 2, PAL.red);
      }

      for (const s of sparks) g.rect(s.x - 1, s.y - 1, 2, 2, s.life % 6 < 3 ? PAL.white : s.color);
      for (const p of pops) g.text(p.text, p.x, p.y - p.t * 0.4, PAL.white, { align: "center" });

      g.camera(0, 0);
      // HUD: a framed bar with apple pips, hearts and a golden-apple countdown
      g.sprite(a.hudBar, 0, 0);
      g.text(`GARDEN ${level}`, 4, 4, PAL.yellow);
      for (let i = 0; i < 10; i++) {
        const got = i < applesInLevel;
        g.rect(88 + i * 8, 5, 6, 6, got ? PAL.red : shade(PAL.dark, -0.1));
        if (got) g.rect(89 + i * 8, 6, 2, 2, PAL.white);
      }
      for (let i = 0; i < lives; i++) g.text("♥", 244 - i * 9, 4, PAL.pink);
      if (gold) {
        g.rect(172, 6, 40, 4, PAL.dark);
        g.rect(172, 6, (40 * gold.t) / 330, 4, PAL.yellow);
        g.rect(172, 6, (40 * gold.t) / 330, 1, shade(PAL.yellow, 0.4));
      }
      if (ready > 0) {
        g.rect(W / 2 - 62, 98, 124, 26, "#140c28");
        g.rect(W / 2 - 60, 100, 120, 22, "rgba(13,11,26,0.7)");
        g.text(`GARDEN ${level}`, W / 2, 104, PAL.yellow, { align: "center" });
        g.text("PRESS A DIRECTION", W / 2, 114, Math.floor(frame / 10) % 2 ? PAL.white : PAL.lime, { align: "center" });
      }
      if (levelUp >= 0) {
        g.rect(W / 2 - 62, 98, 124, 18, "#140c28");
        g.rect(W / 2 - 60, 100, 120, 14, "rgba(13,11,26,0.7)");
        g.text("GARDEN CLEAR!", W / 2, 104, Math.floor(frame / 5) % 2 ? PAL.yellow : PAL.pink, { align: "center" });
      }
    },
  };
}

export const snakeTrail: RetroGameDef = {
  id: "snake-trail",
  title: "Snake Trail",
  blurb: "Munch apples, grow a super long snake, and don't bump your tail!",
  genre: "Classic",
  emoji: "🐍",
  color: "#3ecf55",
  controls: "◀ ▶ ▲ ▼ turn · golden apples are worth extra · 10 apples = next garden",
  pad: { dpad: "4" },
  create,
};
