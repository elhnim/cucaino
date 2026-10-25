// SNAKE TRAIL — a grid snake game in a candy garden. Steer the snake to munch apples and
// grow longer; a golden apple sometimes appears for a short time and is worth lots of
// points. Every 10 apples you reach a new garden with a new pattern of rock walls, and the
// snake slithers a little faster. Don't bump into walls or your own tail! Turns are queued
// (up to two), so quick taps on the D-pad always count. Three lives.
import { PAL, W, rng, sprite, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

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

const APPLE = sprite(["....g...", "...gn...", ".rrnrrr.", "rrwrrrrr", "rwrrrrrr", "rrrrrrrr", ".rrrrrr.", "..rr.rr."], { g: PAL.green, n: PAL.brown, r: PAL.red, w: PAL.white });
const GOLD = sprite(["....g...", "...gn...", ".yynyyy.", "yywyyyyy", "ywyyyyyo", "yyyyyyyo", ".yyyyoo.", "..yo.oo."], { g: PAL.green, n: PAL.brown, y: PAL.yellow, o: PAL.orange, w: PAL.white });

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
  let walls = wallsFor(level);
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
      io.sfx.play("die");
      burst(head.c, head.r, PAL.lime, 14);
      return;
    }
    snake.unshift({ c: nc, r: nr });
    if (grow > 0) grow--;
    else snake.pop();
    io.sfx.tone(160 + (snake.length % 4) * 20, 0.02, "triangle", 0.03);

    if (nc === apple.c && nr === apple.r) {
      grow += 1;
      applesInLevel++;
      const pts = 10 * level;
      io.score(pts);
      pops.push({ x: nc * CELL + 4, y: OY + nr * CELL, text: `+${pts}`, t: 0 });
      io.sfx.play("coin");
      burst(nc, nr, PAL.red, 10);
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
      const pts = 50 * level;
      io.score(pts);
      pops.push({ x: nc * CELL + 4, y: OY + nr * CELL, text: `+${pts}`, t: 0 });
      io.sfx.play("powerup");
      burst(nc, nr, PAL.yellow, 18);
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
        }
        return;
      }
      if (levelUp >= 0) {
        levelUp++;
        if (levelUp > 100) {
          levelUp = -1;
          level++;
          applesInLevel = 0;
          walls = wallsFor(level);
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
      }
      stepT++;
      if (stepT >= interval()) {
        stepT -= interval();
        step(io);
      }
    },

    draw(g) {
      // grass checkerboard
      g.clear("#2f9a5a");
      for (let rr = 0; rr < ROWS; rr++)
        for (let c = (rr % 2); c < COLS; c += 2) g.rect(c * CELL, OY + rr * CELL, CELL, CELL, "#35a862");
      // walls: hedge border and candy rocks inside
      for (let rr = 0; rr < ROWS; rr++)
        for (let c = 0; c < COLS; c++) {
          if (!walls[rr][c]) continue;
          const x = c * CELL;
          const y = OY + rr * CELL;
          const edge = rr === 0 || rr === ROWS - 1 || c === 0 || c === COLS - 1;
          if (edge) {
            g.rect(x, y, CELL, CELL, "#1f6a3a");
            g.rect(x + 1, y + 1, 3, 3, "#2b8a4a");
            g.rect(x + 4, y + 4, 3, 3, "#2b8a4a");
            if ((c + rr) % 5 === 0) g.rect(x + 3, y + 2, 2, 2, PAL.pink);
          } else {
            g.rect(x, y, CELL, CELL, PAL.dark);
            g.rect(x, y, CELL - 1, CELL - 1, PAL.grey);
            g.rect(x + 1, y + 1, 2, 2, PAL.white);
          }
        }

      g.sprite(APPLE, apple.c * CELL, OY + apple.r * CELL + (Math.floor(frame / 15) % 2));
      if (gold && (gold.t > 90 || Math.floor(gold.t / 5) % 2)) {
        g.sprite(GOLD, gold.c * CELL, OY + gold.r * CELL);
        if (frame % 20 < 10) g.rect(gold.c * CELL + 6, OY + gold.r * CELL - 2, 2, 2, PAL.white);
      }

      // snake
      const hidden = crash >= 0 && Math.floor(crash / 5) % 2 === 1;
      if (!hidden) {
        for (let i = snake.length - 1; i >= 0; i--) {
          const s = snake[i];
          const x = s.c * CELL;
          const y = OY + s.r * CELL;
          if (i === 0) continue;
          const col = crash >= 0 ? PAL.grey : i % 3 === 0 ? PAL.yellow : PAL.lime;
          g.rect(x + 1, y + 1, CELL - 2, CELL - 2, col);
          // join to the next segment so the body looks continuous
          const n = snake[i - 1];
          if (Math.abs(n.c - s.c) + Math.abs(n.r - s.r) === 1) {
            const jx = Math.min(n.c, s.c) * CELL + (n.c !== s.c ? 5 : 1);
            const jy = OY + Math.min(n.r, s.r) * CELL + (n.r !== s.r ? 5 : 1);
            g.rect(jx, jy, n.c !== s.c ? 6 : CELL - 2, n.r !== s.r ? 6 : CELL - 2, col);
          }
        }
        const h = snake[0];
        const hx = h.c * CELL;
        const hy = OY + h.r * CELL;
        g.rect(hx, hy, CELL, CELL, crash >= 0 ? PAL.grey : PAL.green);
        g.rect(hx + 1, hy + 1, CELL - 2, CELL - 2, crash >= 0 ? PAL.grey : PAL.lime);
        // eyes look where we're going
        const ex = DX[dir];
        const ey = DY[dir];
        const front = ex > 0 || ey > 0 ? 5 : 1;
        if (ex !== 0) {
          g.rect(hx + front, hy + 1, 2, 2, PAL.black);
          g.rect(hx + front, hy + 5, 2, 2, PAL.black);
        } else {
          g.rect(hx + 1, hy + front, 2, 2, PAL.black);
          g.rect(hx + 5, hy + front, 2, 2, PAL.black);
        }
        if (frame % 40 < 12 && crash < 0) g.rect(hx + 3 + ex * 5, hy + 3 + ey * 5, 2, 2, PAL.red);
      }

      for (const s of sparks) g.rect(s.x - 1, s.y - 1, 2, 2, s.life % 6 < 3 ? PAL.white : s.color);
      for (const p of pops) g.text(p.text, p.x, p.y - p.t * 0.4, PAL.white, { align: "center" });

      // HUD
      g.rect(0, 0, W, OY, PAL.night);
      g.text(`GARDEN ${level}`, 4, 4, PAL.yellow);
      for (let i = 0; i < 10; i++) g.rect(88 + i * 8, 5, 6, 6, i < applesInLevel ? PAL.red : PAL.dark);
      for (let i = 0; i < lives; i++) g.text("♥", 244 - i * 9, 4, PAL.pink);
      if (gold) {
        g.rect(172, 6, 40, 4, PAL.dark);
        g.rect(172, 6, (40 * gold.t) / 330, 4, PAL.yellow);
      }
      if (ready > 0) {
        g.rect(W / 2 - 60, 100, 120, 22, "rgba(13,11,26,0.7)");
        g.text(`GARDEN ${level}`, W / 2, 104, PAL.yellow, { align: "center" });
        g.text("PRESS A DIRECTION", W / 2, 114, Math.floor(frame / 10) % 2 ? PAL.white : PAL.lime, { align: "center" });
      }
      if (levelUp >= 0) {
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
