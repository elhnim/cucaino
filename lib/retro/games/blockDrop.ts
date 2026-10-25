// BLOCK DROP — a falling-blocks puzzle. Seven kinds of four-square blocks tumble into a
// 10x20 well: slide, spin and drop them to fill whole rows, which sparkle and vanish.
// Every 10 rows cleared the level goes up and the blocks fall a little faster. Hold a block
// for later, peek at the next three, and follow the ghost outline to see where it lands.
import { H, PAL, W, rng, spriteW, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, gradientColor, hash2, mixHex, shade } from "../art";

const COLS = 10;
const ROWS = 20;
const CELL = 10;
const MINI = 7; // preview-tray gem size
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
const PILLAR_W = 7; // stone pillars flanking the well
const STONE = "#5c6886";

// ── baked pictures: glassy gem blocks, the dark well grid, a star-flecked backdrop, riveted
// metal side panels and stacked-stone pillars. Built once, lazily, by art() — never at module
// load. Every bake() call keeps its palette to a small, FIXED set of colours (quantised bands,
// not a continuous per-pixel blend): bake() only holds ~90 colours, and a smooth unquantised
// gradient over a big sprite silently blows past that cap and collapses into a flat slab. ──
function bakeGem(color: string, size: number): Sprite {
  const edge = shade(color, -0.68);
  const dk = shade(color, -0.32);
  const lt = shade(color, 0.45);
  const hi = shade(color, 0.9);
  const shellLt = mixHex(lt, color, 0.5);
  const shellDk = mixHex(color, dk, 0.5);
  return bake(size, size, (x, y) => {
    if (x === 0 || y === 0 || x === size - 1 || y === size - 1) return edge;
    const nx = (x - 1) / Math.max(1, size - 3);
    const ny = (y - 1) / Math.max(1, size - 3);
    const diag = nx + ny;
    // five fixed diagonal bands (never a continuous mixHex per pixel)
    let c = diag < 0.45 ? lt : diag < 0.8 ? shellLt : diag < 1.3 ? color : diag < 1.7 ? shellDk : dk;
    // a bright inner bevel line, like the painting's crisp candy sheen
    if ((x === 1 && y > 0 && y < size - 1) || (y === 1 && x > 0 && x < size - 1)) c = mixHex(c, PAL.white, 0.3);
    // a quantised (ringed, not continuous) gloss highlight
    const gx = x - size * 0.32;
    const gy = y - size * 0.3;
    const gd = Math.hypot(gx, gy) / (size * 0.3);
    if (gd < 0.4) c = mixHex(c, hi, 0.9);
    else if (gd < 0.7) c = mixHex(c, hi, 0.55);
    else if (gd < 1) c = mixHex(c, hi, 0.22);
    return c;
  });
}
function bakeWell(): Sprite {
  const w = COLS * CELL;
  const h = ROWS * CELL;
  return bake(w, h, (x, y) => {
    if (x % CELL === 0 || y % CELL === 0) return "#15214a";
    return "#070a18";
  });
}
const SKY_STOPS = ["#0b1030", "#070a1e", "#05060f"];
function bakeBackdrop(): Sprite {
  return bake(W, H, (x, y) => {
    let c = gradientColor(SKY_STOPS, y / (H - 1), x, y);
    const s = hash2(x, y, 11);
    if (s > 0.9975) c = mixHex(c, PAL.white, 0.7);
    else if (s > 0.993) c = mixHex(c, PAL.sky, 0.45);
    return c;
  });
}
function bakePanel(w: number, h: number): Sprite {
  return bake(w, h, (x, y) => {
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return PAL.sky;
    if (x === 1 || y === 1 || x === w - 2 || y === h - 2) return mixHex(PAL.navy, PAL.sky, 0.3);
    const corner = (cx: number, cy: number) => Math.hypot(x - cx, y - cy) < 1.3;
    if (corner(3.5, 3.5) || corner(w - 4.5, 3.5) || corner(3.5, h - 4.5) || corner(w - 4.5, h - 4.5)) return mixHex(PAL.sky, PAL.white, 0.5);
    return y % 4 === 3 ? shade(PAL.navy, -0.12) : PAL.navy;
  });
}
/** a stack of bevelled, rivetted stone blocks, like the painting's well pillars (draw the right
 *  pillar as this sprite flipped). */
function bakePillar(w: number, rows: number, cellH: number): Sprite {
  const edge = shade(STONE, -0.55);
  const lt = shade(STONE, 0.32);
  const dk = shade(STONE, -0.3);
  const rivet = shade(STONE, 0.65);
  const rivetDk = shade(STONE, -0.5);
  const midX = Math.round(w / 2);
  return bake(w, rows * cellH, (x, y) => {
    const ly = y % cellH;
    if (ly === 0 || x === 0 || x === w - 1) return edge;
    if (ly === 1) return lt;
    if (ly === cellH - 1) return dk;
    if (x === 1) return mixHex(STONE, lt, 0.5);
    if (x === w - 2) return mixHex(STONE, dk, 0.5);
    if (Math.abs(x - midX) <= 1 && ly === Math.floor(cellH / 2)) return x === midX ? rivet : rivetDk;
    return STONE;
  });
}
/** a stone lintel/plinth capping the pillars top and bottom. */
function bakePlate(w: number, h: number): Sprite {
  const edge = shade(STONE, -0.55);
  const lt = shade(STONE, 0.3);
  const dk = shade(STONE, -0.3);
  const rivet = shade(STONE, 0.65);
  return bake(w, h, (x, y) => {
    if (x === 0 || x === w - 1 || y === 0 || y === h - 1) return edge;
    if (y === 1) return lt;
    if (y === h - 2) return dk;
    if (x % 10 === 4 && y === Math.floor(h / 2)) return rivet;
    return STONE;
  });
}

interface Art {
  backdrop: Sprite;
  well: Sprite;
  gems: Record<string, Sprite>;
  minis: Record<string, Sprite>;
  panelSmall: Sprite;
  panelMed: Sprite;
  panelTall: Sprite;
  pillar: Sprite;
  plate: Sprite;
}
function makeArt(): Art {
  const gems: Record<string, Sprite> = {};
  const minis: Record<string, Sprite> = {};
  for (const color of [...SHAPES.map((s) => s.color), PAL.grey]) {
    gems[color] = bakeGem(color, CELL);
    minis[color] = bakeGem(color, MINI);
  }
  return {
    backdrop: bakeBackdrop(),
    well: bakeWell(),
    gems,
    minis,
    panelSmall: bakePanel(60, 44),
    panelMed: bakePanel(60, 64),
    panelTall: bakePanel(60, 110),
    pillar: bakePillar(PILLAR_W, ROWS, CELL),
    plate: bakePlate(COLS * CELL + PILLAR_W * 2, 8),
  };
}
let A: Art | null = null;
const art = () => (A ??= makeArt());

/** a small twinkling 4-point sparkle, like the shine on the painting's candy stack */
function drawSparkle(g: Gfx, x: number, y: number, frame: number, seed: number, big = false) {
  const s = big ? 1 : 0.5 + 0.5 * Math.sin(frame * 0.07 + seed);
  const len = big ? 4 : 1 + Math.round(s * 2);
  const dim = big ? PAL.white : mixHex(PAL.white, "#0d0b1a", 0.35);
  g.rect(x - len, y, len, 1, dim);
  g.rect(x + 1, y, len, 1, dim);
  g.rect(x, y - len, 1, len, dim);
  g.rect(x, y + 1, 1, len, dim);
  g.rect(x, y, 1, 1, PAL.white);
  if (s > 0.75) {
    g.rect(x - 1, y - 1, 1, 1, PAL.cyan);
    g.rect(x + 1, y - 1, 1, 1, PAL.cyan);
    g.rect(x - 1, y + 1, 1, 1, PAL.cyan);
    g.rect(x + 1, y + 1, 1, 1, PAL.cyan);
  }
  if (big) {
    g.rect(x - 2, y - 2, 1, 1, PAL.yellow);
    g.rect(x + 2, y - 2, 1, 1, PAL.yellow);
    g.rect(x - 2, y + 2, 1, 1, PAL.yellow);
    g.rect(x + 2, y + 2, 1, 1, PAL.yellow);
  }
}

/** a dashed white outline round the shape's silhouette (not a per-cell box), like the painting's
 *  landing-spot guide. `cells` are absolute grid coordinates (y >= 0 only). */
function drawGhostOutline(g: Gfx, cells: { x: number; y: number }[], color: string, frame: number) {
  const set = new Set(cells.map((c) => `${c.x},${c.y}`));
  let i = Math.floor(frame / 4);
  for (const { x, y } of cells) {
    const px = WX + x * CELL;
    const py = WY + y * CELL;
    const edges: [boolean, number, number, number, number][] = [
      [!set.has(`${x - 1},${y}`), px, py, px, py + CELL],
      [!set.has(`${x + 1},${y}`), px + CELL, py, px + CELL, py + CELL],
      [!set.has(`${x},${y - 1}`), px, py, px + CELL, py],
      [!set.has(`${x},${y + 1}`), px, py + CELL, px + CELL, py + CELL],
    ];
    for (const [on, x1, y1, x2, y2] of edges) {
      if (!on) continue;
      const len = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
      for (let t = 0; t <= len; t++) {
        if (Math.floor((t + i) / 2) % 2 === 0) {
          g.rect(Math.round(x1 + ((x2 - x1) * t) / len), Math.round(y1 + ((y2 - y1) * t) / len), 1, 1, color);
        }
      }
      i++;
    }
  }
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

function drawCell(g: Gfx, a: Art, x: number, y: number, color: string, mini = false) {
  const table = mini ? a.minis : a.gems;
  g.sprite(table[color] ?? table[PAL.grey], x, y);
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
  let shake = 0;
  const sparks: Spark[] = [];
  const lockFlash: { x: number; y: number; t: number }[] = [];

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
      io.sfx.noise?.(0.5, 0.45, 520, 70);
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
    io.sfx.play("thud");
    p.cells.forEach((row, y) => row.forEach((v, x) => { if (v && p.y + y >= 0) lockFlash.push({ x: p.x + x, y: p.y + y, t: 8 }); }));
    if (above) {
      over = true;
      io.sfx.play("die");
      io.sfx.noise?.(0.5, 0.45, 520, 70);
      return;
    }
    clearing = [];
    for (let y = 0; y < ROWS; y++) if (grid[y].every((c) => c)) clearing.push(y);
    if (clearing.length) {
      clearT = 22;
      const n = clearing.length;
      io.score(LINE_POINTS[n] * level);
      io.sfx.play(n >= 4 ? "win" : n >= 3 ? "powerup" : n >= 2 ? "pickup" : "coin");
      io.sfx.slide?.(n >= 4 ? 420 : 620, n >= 4 ? 1400 : 980, n >= 4 ? 0.35 : 0.18, "square", 0.2);
      if (n >= 4) {
        shake = 14;
        io.sfx.noise?.(0.3, 0.3, 300, 1800);
      }
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
    io.sfx.play("whoosh");
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
    io.sfx.play("select");
    io.sfx.tone(700, 0.05, "triangle", 0.1);
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
      for (const f of lockFlash) f.t--;
      for (let i = lockFlash.length - 1; i >= 0; i--) if (lockFlash[i].t <= 0) lockFlash.splice(i, 1);
      if (shake > 0) shake--;
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
            io.sfx.play("cheer");
            io.sfx.slide?.(440 + level * 16, 880 + level * 16, 0.25, "square", 0.2);
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
          if (softT % 6 === 1) io.sfx.tone(180, 0.02, "square", 0.04);
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
      const a = art();
      g.clear("#05070f");
      g.sprite(a.backdrop, 0, 0);

      // a big clear rattles the well (world only, never the HUD)
      const sk = shake > 0 ? Math.ceil(shake / 3) : 0;
      g.camera(sk ? (frame % 2 ? sk : -sk) : 0, sk ? -Math.floor(sk / 2) : 0);

      // well frame: stacked stone pillars either side (right one mirrored), a stone lintel on
      // top and a matching plinth underneath, then the baked grid
      g.sprite(a.plate, WX - PILLAR_W, WY - 8);
      g.sprite(a.plate, WX - PILLAR_W, WY + ROWS * CELL);
      g.sprite(a.pillar, WX - PILLAR_W, WY);
      g.sprite(a.pillar, WX + COLS * CELL, WY, { flipX: true });
      g.sprite(a.well, WX, WY);

      // twinkling shine over the pile's corners, like the painting
      if (!over) {
        drawSparkle(g, WX + 7, WY + ROWS * CELL - 9, frame, 0);
        drawSparkle(g, WX + COLS * CELL - 7, WY + ROWS * CELL - 9, frame, 3.4);
      }

      // stack (clearing rows flash white with a bright sparkle burst at both ends)
      const flash = clearT > 0 && Math.floor(clearT / 3) % 2 === 0;
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
          const c = grid[y][x];
          if (!c) continue;
          if (clearing.includes(y) && flash) g.rect(WX + x * CELL, WY + y * CELL, CELL, CELL, PAL.white);
          else drawCell(g, a, WX + x * CELL, WY + y * CELL, c);
        }
      if (clearT > 0)
        for (const y of clearing) {
          const cy = WY + y * CELL + CELL / 2;
          drawSparkle(g, WX + 3, cy, frame, 0, true);
          drawSparkle(g, WX + COLS * CELL - 3, cy, frame, 0, true);
        }
      // a bright flash fading out of every cell right after it locks
      for (const f of lockFlash) {
        g.alpha(f.t / 8);
        g.rect(WX + f.x * CELL, WY + f.y * CELL, CELL, CELL, PAL.white);
        g.alpha(1);
      }

      // ghost + current block
      if (cur && !over) {
        const p = cur;
        const gy = ghostY();
        const col = SHAPES[p.kind].color;
        const ghostCells: { x: number; y: number }[] = [];
        p.cells.forEach((row, y) =>
          row.forEach((v, x) => {
            if (!v) return;
            if (gy + y >= 0) ghostCells.push({ x: p.x + x, y: gy + y });
          }),
        );
        if (ghostCells.length) drawGhostOutline(g, ghostCells, mixHex(col, PAL.white, 0.55), frame);
        p.cells.forEach((row, y) =>
          row.forEach((v, x) => {
            if (!v || p.y + y < 0) return;
            drawCell(g, a, WX + (p.x + x) * CELL, WY + (p.y + y) * CELL, col);
          }),
        );
      }

      for (const s of sparks) g.rect(s.x - 1, s.y - 1, 2, 2, s.life % 6 < 3 ? PAL.white : s.color);

      g.camera(0, 0);

      // side panels: riveted metal plates
      const panel = (img: Sprite, x: number, y: number, title: string) => {
        g.sprite(img, x, y);
        if (title) g.text(title, x + spriteW(img) / 2, y + 3, PAL.yellow, { align: "center" });
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
        const ox = cx - ((maxX - minX + 1) * MINI) / 2;
        const oy = cy - ((maxY - minY + 1) * MINI) / 2;
        cells.forEach((row, y) => row.forEach((v, x) => v && drawCell(g, a, ox + (x - minX) * MINI, oy + (y - minY) * MINI, dim ? PAL.grey : SHAPES[kind].color, true)));
      };
      panel(a.panelSmall, 10, 14, "HOLD");
      if (hold !== null) mini(hold, 40, 40, holdUsed);
      panel(a.panelMed, 10, 68, "");
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

      panel(a.panelTall, 186, 14, "NEXT");
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
