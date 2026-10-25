// BLOCK DROP — a falling-blocks puzzle. Seven kinds of four-square blocks tumble into a
// 10x20 well: slide, spin and drop them to fill whole rows, which sparkle and vanish.
// Every 10 rows cleared the level goes up and the blocks fall a little faster. Hold a block
// for later, peek at the next three, and follow the ghost outline to see where it lands.
import { H, PAL, W, clamp, rng, type GameInstance, type Gfx, type IO, type RetroGameDef } from "../engine";

const COLS = 10;
const ROWS = 20;
const CELL = 10;
const WX = (W - COLS * CELL) / 2; // 78
const WY = 14;

// block shapes in their spawn orientation (square boxes so rotation is a simple matrix turn)
const SHAPES: { cells: number[][]; color: string }[] = [
  { cells: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], color: PAL.cyan }, // long
  { cells: [[1, 1], [1, 1]], color: PAL.yellow }, // square
  { cells: [[0, 1, 0], [1, 1, 1], [0, 0, 0]], color: PAL.purple }, // tee
  { cells: [[0, 1, 1], [1, 1, 0], [0, 0, 0]], color: PAL.green }, // zig
  { cells: [[1, 1, 0], [0, 1, 1], [0, 0, 0]], color: PAL.red }, // zag
  { cells: [[1, 0, 0], [1, 1, 1], [0, 0, 0]], color: PAL.blue }, // hook
  { cells: [[0, 0, 1], [1, 1, 1], [0, 0, 0]], color: PAL.orange }, // crook
];
const LINE_POINTS = [0, 100, 300, 500, 800];
// lighter / darker shades for the bevel on each colour
const LIGHT: Record<string, string> = {};
const DARK: Record<string, string> = {};
function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => clamp(Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)), 0, 255);
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
for (const s of SHAPES) {
  LIGHT[s.color] = shade(s.color, 0.5);
  DARK[s.color] = shade(s.color, -0.4);
}

const rotate = (m: number[][]) => m.map((row, y) => row.map((_, x) => m[m.length - 1 - x][y]));

interface Piece {
  kind: number;
  cells: number[][];
  x: number;
  y: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

function drawCell(g: Gfx, x: number, y: number, color: string, size = CELL) {
  g.rect(x, y, size, size, DARK[color] ?? color);
  g.rect(x, y, size - 1, size - 1, color);
  g.rect(x, y, size - 1, 1, LIGHT[color] ?? PAL.white);
  g.rect(x, y, 1, size - 1, LIGHT[color] ?? PAL.white);
  if (size >= 8) g.rect(x + 2, y + 2, 2, 2, PAL.white);
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  const grid: (string | null)[][] = Array.from({ length: ROWS }, () => new Array<string | null>(COLS).fill(null));
  let bag: number[] = [];
  const queue: number[] = [];
  const nextKind = () => {
    if (!bag.length) {
      bag = [0, 1, 2, 3, 4, 5, 6];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = r.int(0, i);
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop()!;
  };
  while (queue.length < 3) queue.push(nextKind());

  let cur: Piece | null = null;
  let hold: number | null = null;
  let holdUsed = false;
  let level = 1;
  let lines = 0;
  let fallT = 0;
  let lockT = 0;
  let lockMoves = 0;
  let dasDir = 0;
  let dasT = 0;
  let softT = 0;
  let clearing: number[] = [];
  let clearT = 0;
  let over = false;
  let overT = 0;
  let sentOver = false;
  let frame = 0;
  let banner = "";
  let bannerT = 0;
  const sparks: Spark[] = [];

  const fits = (cells: number[][], px: number, py: number) => {
    for (let y = 0; y < cells.length; y++)
      for (let x = 0; x < cells[y].length; x++) {
        if (!cells[y][x]) continue;
        const gx = px + x;
        const gy = py + y;
        if (gx < 0 || gx >= COLS || gy >= ROWS) return false;
        if (gy >= 0 && grid[gy][gx]) return false;
      }
    return true;
  };
  const gravity = () => Math.max(3, Math.round(48 * Math.pow(0.84, level - 1)));

  const spawn = (kind: number, io: IO) => {
    const cells = SHAPES[kind].cells.map((row) => row.slice());
    const p: Piece = { kind, cells, x: Math.floor((COLS - cells.length) / 2), y: kind === 0 ? -1 : 0 };
    cur = p;
    fallT = 0;
    lockT = 0;
    lockMoves = 0;
    if (!fits(p.cells, p.x, p.y)) {
      over = true;
      io.sfx.play("die");
    }
  };
  const takeNext = (io: IO) => {
    const k = queue.shift()!;
    queue.push(nextKind());
    spawn(k, io);
  };

  const tryMove = (dx: number, dy: number) => {
    if (!cur || !fits(cur.cells, cur.x + dx, cur.y + dy)) return false;
    cur.x += dx;
    cur.y += dy;
    return true;
  };
  const onFloor = () => !!cur && !fits(cur.cells, cur.x, cur.y + 1);
  const touched = () => {
    // moving/turning on the floor gives a little more time (limited, so it can't stall forever)
    if (onFloor() && lockMoves < 15) {
      lockT = 0;
      lockMoves++;
    }
  };

  const tryRotate = (io: IO) => {
    if (!cur || cur.kind === 1) return;
    const turned = rotate(cur.cells);
    for (const [kx, ky] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]]) {
      if (fits(turned, cur.x + kx, cur.y + ky)) {
        cur.cells = turned;
        cur.x += kx;
        cur.y += ky;
        io.sfx.tone(520, 0.04, "square", 0.08);
        touched();
        return;
      }
    }
  };

  const ghostY = () => {
    if (!cur) return 0;
    let y = cur.y;
    while (fits(cur.cells, cur.x, y + 1)) y++;
    return y;
  };

  const lock = (io: IO) => {
    if (!cur) return;
    const p = cur;
    let above = false;
    p.cells.forEach((row, y) =>
      row.forEach((v, x) => {
        if (!v) return;
        const gy = p.y + y;
        if (gy < 0) above = true;
        else grid[gy][p.x + x] = SHAPES[p.kind].color;
      }),
    );
    cur = null;
    holdUsed = false;
    io.sfx.play("step");
    if (above) {
      over = true;
      io.sfx.play("die");
      return;
    }
    clearing = [];
    for (let y = 0; y < ROWS; y++) if (grid[y].every((c) => c)) clearing.push(y);
    if (clearing.length) {
      clearT = 22;
      const n = clearing.length;
      io.score(LINE_POINTS[n] * level);
      io.sfx.play(n >= 4 ? "win" : n >= 2 ? "powerup" : "coin");
      banner = ["", "NICE!", "DOUBLE!", "TRIPLE!", "SUPER DROP!"][n];
      bannerT = 60;
      for (const y of clearing)
        for (let x = 0; x < COLS; x++)
          for (let k = 0; k < 3; k++)
            sparks.push({ x: WX + x * CELL + 5, y: WY + y * CELL + 5, vx: r.range(-1.8, 1.8), vy: r.range(-2.6, 0.4), life: r.int(20, 40), color: grid[y][x] ?? PAL.white });
    } else takeNext(io);
  };

  const hardDrop = (io: IO) => {
    if (!cur) return;
    const gy = ghostY();
    io.score((gy - cur.y) * 2);
    for (let i = 0; i < 6; i++) sparks.push({ x: WX + (cur.x + r.range(0, cur.cells.length)) * CELL, y: WY + gy * CELL + 12, vx: r.range(-1, 1), vy: r.range(-1.5, -0.3), life: 16, color: PAL.white });
    cur.y = gy;
    io.sfx.play("bounce");
    lock(io);
  };

  const doHold = (io: IO) => {
    if (!cur || holdUsed) return;
    const k = cur.kind;
    if (hold === null) {
      hold = k;
      takeNext(io);
    } else {
      const h = hold;
      hold = k;
      spawn(h, io);
    }
    holdUsed = true;
    io.sfx.play("blip");
  };

  return {
    update(io) {
      frame++;
      for (const s of sparks) {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.12;
        s.life--;
      }
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
      if (bannerT > 0) bannerT--;

      if (over) {
        // the stack turns grey from the bottom up, then the host shows GAME OVER
        overT++;
        if (overT % 3 === 0) {
          const row = ROWS - 1 - Math.floor(overT / 3);
          if (row >= 0) for (let x = 0; x < COLS; x++) if (grid[row][x]) grid[row][x] = PAL.grey;
        }
        if (overT > 75 && !sentOver) {
          sentOver = true;
          io.gameOver();
        }
        return;
      }

      if (clearT > 0) {
        clearT--;
        if (clearT === 0) {
          for (const y of clearing) {
            grid.splice(y, 1);
            grid.unshift(new Array<string | null>(COLS).fill(null));
          }
          lines += clearing.length;
          const newLevel = Math.floor(lines / 10) + 1;
          if (newLevel > level) {
            level = newLevel;
            banner = `LEVEL ${level}!`;
            bannerT = 90;
            io.sfx.play("win");
          }
          clearing = [];
          takeNext(io);
        }
        return;
      }
      if (!cur) takeNext(io);
      if (!cur || over) return;

      const inp = io.input;
      // hold / rotate / hard drop
      if (inp.pressed.up) {
        doHold(io);
        if (!cur || over) return;
      }
      if (inp.pressed.a) tryRotate(io);
      if (inp.pressed.b) {
        hardDrop(io);
        return;
      }

      // sideways with auto-repeat
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

      // falling: soft drop when holding down
      if (inp.held.down) {
        softT++;
        if (softT % 3 === 1 && tryMove(0, 1)) {
          io.score(1);
          fallT = 0;
        }
      } else softT = 0;
      fallT++;
      if (fallT >= gravity()) {
        fallT = 0;
        tryMove(0, 1);
      }
      if (onFloor()) {
        lockT++;
        if (lockT >= (inp.held.down ? 10 : 30)) lock(io);
      } else lockT = 0;
    },

    draw(g) {
      // candy-stripe backdrop
      g.clear(PAL.night);
      for (let i = -H; i < W; i += 24) g.line(i, 0, i + H, H, "#231c45");
      // well frame
      g.rect(WX - 5, WY - 3, COLS * CELL + 10, ROWS * CELL + 7, PAL.purple);
      g.rect(WX - 3, WY - 1, COLS * CELL + 6, ROWS * CELL + 3, PAL.pink);
      g.rect(WX, WY, COLS * CELL, ROWS * CELL, PAL.black);
      for (let x = 1; x < COLS; x++) g.rect(WX + x * CELL, WY, 1, ROWS * CELL, "#15122a");
      for (let y = 1; y < ROWS; y++) g.rect(WX, WY + y * CELL, COLS * CELL, 1, "#15122a");

      // stack (clearing rows flash white)
      const flash = clearT > 0 && Math.floor(clearT / 3) % 2 === 0;
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
          const c = grid[y][x];
          if (!c) continue;
          if (clearing.includes(y)) {
            if (flash) g.rect(WX + x * CELL, WY + y * CELL, CELL, CELL, PAL.white);
            else drawCell(g, WX + x * CELL, WY + y * CELL, c);
          } else drawCell(g, WX + x * CELL, WY + y * CELL, c);
        }

      // ghost + current block
      if (cur && !over) {
        const p = cur;
        const gy = ghostY();
        const col = SHAPES[p.kind].color;
        p.cells.forEach((row, y) =>
          row.forEach((v, x) => {
            if (!v) return;
            const px = WX + (p.x + x) * CELL;
            if (gy + y >= 0) g.box(px, WY + (gy + y) * CELL, CELL, CELL, col);
            if (p.y + y >= 0) drawCell(g, px, WY + (p.y + y) * CELL, col);
          }),
        );
      }

      for (const s of sparks) g.rect(s.x - 1, s.y - 1, 2, 2, s.life % 6 < 3 ? PAL.white : s.color);

      // side panels
      const panel = (x: number, y: number, w: number, h: number, title: string) => {
        g.rect(x, y, w, h, PAL.navy);
        g.box(x, y, w, h, PAL.sky);
        g.text(title, x + w / 2, y + 3, PAL.yellow, { align: "center" });
      };
      const mini = (kind: number, cx: number, cy: number, dim = false) => {
        const cells = SHAPES[kind].cells;
        let minX = 9, maxX = -1, minY = 9, maxY = -1;
        cells.forEach((row, y) => row.forEach((v, x) => {
          if (v) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }));
        const s = 7;
        const ox = cx - ((maxX - minX + 1) * s) / 2;
        const oy = cy - ((maxY - minY + 1) * s) / 2;
        cells.forEach((row, y) => row.forEach((v, x) => v && drawCell(g, ox + (x - minX) * s, oy + (y - minY) * s, dim ? PAL.grey : SHAPES[kind].color, s)));
      };
      panel(10, 14, 60, 44, "HOLD");
      if (hold !== null) mini(hold, 40, 40, holdUsed);
      panel(10, 68, 60, 64, "");
      g.text("LEVEL", 40, 74, PAL.cyan, { align: "center" });
      g.text(String(level), 40, 85, PAL.white, { align: "center" });
      g.text("LINES", 40, 102, PAL.cyan, { align: "center" });
      g.text(String(lines), 40, 113, PAL.white, { align: "center" });
      // progress to next level
      g.rect(16, 124, 48, 3, PAL.dark);
      g.rect(16, 124, 48 * ((lines % 10) / 10), 3, PAL.lime);
      g.text("UP HOLD", 40, 146, PAL.grey, { align: "center" });
      g.text("A SPIN", 40, 158, PAL.grey, { align: "center" });
      g.text("B DROP", 40, 170, PAL.grey, { align: "center" });

      panel(186, 14, 60, 110, "NEXT");
      queue.forEach((k, i) => mini(k, 216, 38 + i * 30));

      // banner
      if (bannerT > 0 && banner) {
        const y = WY + 70;
        g.rect(WX - 6, y - 4, COLS * CELL + 12, 16, "rgba(13,11,26,0.75)");
        g.text(banner, W / 2, y, Math.floor(frame / 4) % 2 ? PAL.yellow : PAL.pink, { align: "center" });
      }
    },
  };
}

export const blockDrop: RetroGameDef = {
  id: "block-drop",
  title: "Block Drop",
  blurb: "Spin and stack falling blocks to clear sparkly rows!",
  genre: "Puzzle",
  emoji: "🧱",
  color: "#9a5cff",
  controls: "◀ ▶ move · ▼ drop faster · ▲ hold · A spin · B drop down",
  pad: { dpad: "4", a: "Spin", b: "Drop" },
  create,
};
