// PANEL POP — an original panel-swapping puzzle (in the spirit of panel-matching classics,
// own art and a cute host character, no outside names or characters). A 6-wide well of
// coloured, symbol-marked panels slowly rises from below. A 2-wide cursor slides over any
// two neighbours; A swaps them (even with an empty cell). Get 3+ of a kind in a row or
// column and they pop; whatever was sitting above tumbles down, and if THAT makes a new
// match it's a CHAIN (x2, x3…) — pop 4+ panels in one go and it's a COMBO. Both pause the
// rise for a beat and score big. Let the stack touch the top for ~2s and it's game over.
// Endless play, level up every ~30s, reach level 10 to win.
import { H, PAL, W, clamp, rng, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, hash2, mixHex, shade } from "../art";

const COLS = 6;
const ROWS = 10;
const CELL = 20;
const WX = (W - COLS * CELL) / 2; // 68
const WY = 18;
const START_ROWS = 5;

const HANG_FRAMES = 8; // grace period before a floating panel starts to fall
const FALL_STEP = 3; // frames per row of falling
const CLEAR_FRAMES = 20; // flash-before-pop duration
const PAUSE_FRAMES = 18; // rise pauses this long after every pop in a cascade
const DANGER_LIMIT = 120; // ~2s touching the top = game over

// ── six colour-blind-friendly symbols, drawn from plain rects/circles/lines ──
type Icon = (g: Gfx, x: number, y: number, s: number, color: string) => void;
const iconHeart: Icon = (g, x, y, s, c) => {
  const cx = x + s / 2;
  const top = y + s * 0.3;
  const r = s * 0.18;
  g.circle(cx - r * 0.95, top, r, c);
  g.circle(cx + r * 0.95, top, r, c);
  for (let i = 0; i < 4; i++) {
    const w = s * 0.56 * (1 - i / 4);
    g.rect(cx - w / 2, top - s * 0.02 + i * (s * 0.14), w, s * 0.16, c);
  }
};
const iconStar: Icon = (g, x, y, s, c) => {
  const cx = x + s / 2;
  const cy = y + s / 2;
  const r = s * 0.34;
  g.line(cx - r, cy, cx + r, cy, c);
  g.line(cx, cy - r, cx, cy + r, c);
  g.line(cx - r * 0.7, cy - r * 0.7, cx + r * 0.7, cy + r * 0.7, c);
  g.line(cx - r * 0.7, cy + r * 0.7, cx + r * 0.7, cy - r * 0.7, c);
  g.circle(cx, cy, r * 0.3, c);
};
const iconCircle: Icon = (g, x, y, s, c) => {
  const cx = x + s / 2;
  const cy = y + s / 2;
  const r = s * 0.32;
  g.circle(cx, cy, r, c);
  // tiny cardinal tick marks, like the painting's target dial
  g.rect(cx - 1, y + s * 0.1, 2, s * 0.08, c);
  g.rect(cx - 1, y + s * 0.82, 2, s * 0.08, c);
  g.rect(x + s * 0.1, cy - 1, s * 0.08, 2, c);
  g.rect(x + s * 0.82, cy - 1, s * 0.08, 2, c);
};
const iconTriangle: Icon = (g, x, y, s, c) => {
  const rows = 6;
  for (let i = 0; i < rows; i++) {
    const w = s * 0.62 * ((i + 1) / rows);
    g.rect(x + s / 2 - w / 2, y + s * 0.2 + i * (s * 0.095), w, s * 0.11, c);
  }
};
const iconCross: Icon = (g, x, y, s, c) => {
  const cx = x + s / 2;
  const cy = y + s / 2;
  const arm = s * 0.56;
  const t = s * 0.26;
  g.rect(cx - t / 2, cy - arm / 2, t, arm, c);
  g.rect(cx - arm / 2, cy - t / 2, arm, t, c);
};
const iconSquare: Icon = (g, x, y, s, c) => g.rect(x + s * 0.24, y + s * 0.24, s * 0.52, s * 0.52, c);

interface PanelKind {
  color: string;
  ink: string;
  icon: Icon;
}
const PANELS: PanelKind[] = [
  { color: PAL.red, ink: PAL.white, icon: iconHeart },
  { color: PAL.yellow, ink: PAL.night, icon: iconStar },
  { color: PAL.sky, ink: PAL.navy, icon: iconCircle },
  { color: PAL.green, ink: PAL.night, icon: iconTriangle },
  { color: PAL.purple, ink: PAL.white, icon: iconCross },
  { color: PAL.orange, ink: PAL.night, icon: iconSquare },
];

interface Cell {
  color: number;
  hang: number;
  fallT: number;
  dropY: number;
  swapX: number;
  clearT: number;
}
const mkCell = (color: number): Cell => ({ color, hang: HANG_FRAMES, fallT: 0, dropY: 0, swapX: 0, clearT: 0 });

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

function drawPanel(g: Gfx, x: number, y: number, size: number, cell: Cell, grey: boolean, bg = PAL.black) {
  const p = PANELS[cell.color];
  const flashing = cell.clearT > 0 && Math.floor(cell.clearT / 3) % 2 === 0;
  const base = grey ? PAL.grey : p.color;
  if (flashing) {
    g.rect(x + 1, y + 1, size - 2, size - 2, PAL.white);
    return;
  }
  // muted blue-grey frame (never a flat darkened copy of the fill — that's what reads as "glitchy")
  const edge = mixHex(shade(base, -0.5), PAL.navy, 0.4);
  const dark = shade(base, -0.22);
  const light = shade(base, 0.3);
  const hi = shade(base, 0.55);
  g.rect(x + 1, y + 1, size - 2, size - 2, edge);
  g.rect(x + 2, y + 2, size - 4, size - 4, base);
  const band = Math.max(2, Math.round(size * 0.3));
  g.rect(x + 2, y + 2, size - 4, band, light);
  g.rect(x + 2, y + 2, size - 4, 2, hi);
  g.rect(x + 2, y + size - 4, size - 4, 2, dark);
  // clip the four corners square so the chiclet reads as rounded against the well floor
  g.rect(x, y, 1, 1, bg);
  g.rect(x + size - 1, y, 1, 1, bg);
  g.rect(x, y + size - 1, 1, 1, bg);
  g.rect(x + size - 1, y + size - 1, 1, 1, bg);
  p.icon(g, x, y, size, grey ? PAL.dark : p.ink);
}

function generateRow(r: ReturnType<typeof rng>, above1: number[], above2: number[]): number[] {
  const row: number[] = [];
  for (let c = 0; c < COLS; c++) {
    let color = r.int(0, PANELS.length - 1);
    let tries = 0;
    while (
      tries < 20 &&
      ((c >= 2 && row[c - 1] === color && row[c - 2] === color) || (above1[c] === color && above2[c] === color))
    ) {
      color = r.int(0, PANELS.length - 1);
      tries++;
    }
    row.push(color);
  }
  return row;
}

// ── backdrop: dark hazard-stripe navy with a scattered static twinkle and a soft vignette,
// baked once (lazily) into one Sprite so draw() costs a single blit, like the painting's panel ──
let BG: Sprite | null = null;
function bakeBackdrop(): Sprite {
  const cx = W / 2;
  const cy = H / 2;
  const maxD = Math.hypot(cx, cy);
  return bake(W, H, (x, y) => {
    const diag = (((x + y) % 24) + 24) % 24;
    let c = diag < 1 ? mixHex(PAL.night, PAL.navy, 0.5) : PAL.night;
    const h = hash2(x, y, 7);
    if (h > 0.997) c = mixHex(c, PAL.cyan, 0.6);
    else if (h > 0.992) c = mixHex(c, PAL.sky, 0.3);
    const d = Math.hypot(x - cx, y - cy) / maxD;
    if (d > 0.5) c = mixHex(c, "#000000", Math.min(0.5, (d - 0.5) * 0.9));
    return c;
  });
}
const backdrop = () => (BG ??= bakeBackdrop());

interface Ring {
  x: number;
  y: number;
  t: number;
  max: number;
  color: string;
}

function create(seed: number): GameInstance {
  const r = rng(seed);
  const grid: (Cell | null)[][] = Array.from({ length: ROWS }, () => new Array<Cell | null>(COLS).fill(null));
  const colorsOf = (row: (Cell | null)[] | undefined): number[] =>
    row ? row.map((c) => (c ? c.color : -1)) : new Array(COLS).fill(-1);

  // fill the starting stack top-down, each row checked against the one(s) already above it
  let above1 = new Array(COLS).fill(-1);
  let above2 = new Array(COLS).fill(-1);
  for (let i = 0; i < START_ROWS; i++) {
    const rIdx = ROWS - START_ROWS + i;
    const row = generateRow(r, above1, above2);
    grid[rIdx] = row.map(mkCell);
    above2 = above1;
    above1 = row;
  }
  let nextRow = generateRow(r, above1, above2);

  let cx = Math.floor(COLS / 2) - 1;
  let cy = ROWS - 3;
  const rep = { left: 0, right: 0, up: 0, down: 0 };

  let riseOffset = 0;
  let pauseRiseT = 0;
  let cascading = false;
  let chainCount = 0;
  let level = 1;
  let dangerT = 0;
  let over = false;
  let overT = 0;
  let sentOver = false;
  let won = false;
  let timeNow = 0;
  let frame = 0;
  let banner = "";
  let bannerT = 0;
  let shakeT = 0;
  const sparks: Spark[] = [];
  const rings: Ring[] = [];

  const burst = (x: number, y: number, color: string, n = 6) => {
    for (let i = 0; i < n; i++) sparks.push({ x, y, vx: r.range(-1.6, 1.6), vy: r.range(-2.2, -0.2), life: r.int(16, 32), color });
  };

  // a few notes scheduled a handful of frames apart, for little fanfares/arpeggios without
  // ever blocking update() — never Math.random, purely frame-counted
  interface Note { at: number; freq: number; dur: number; wave?: OscillatorType; vol?: number }
  const noteQueue: Note[] = [];
  const queueNote = (delay: number, freq: number, dur: number, wave?: OscillatorType, vol?: number) =>
    noteQueue.push({ at: frame + delay, freq, dur, wave, vol });
  const fanfare = (notes: number[], step = 5, wave: OscillatorType = "square", dur = 0.1, vol = 0.14) =>
    notes.forEach((f, i) => queueNote(i * step, f, dur, wave, vol));

  const anyClearing = () => grid.some((row) => row.some((c) => c && c.clearT > 0));

  /** one gravity pass: floating panels hang briefly, then drop a row at a time. */
  const gravityStep = () => {
    let falling = false;
    for (let c = 0; c < COLS; c++) {
      for (let row = ROWS - 2; row >= 0; row--) {
        const cell = grid[row][c];
        if (!cell || cell.clearT > 0) continue;
        if (grid[row + 1][c] === null) {
          falling = true;
          if (cell.hang > 0) cell.hang--;
          else {
            cell.fallT++;
            if (cell.fallT >= FALL_STEP) {
              cell.fallT = 0;
              cell.dropY = CELL;
              cell.hang = HANG_FRAMES;
              grid[row + 1][c] = cell;
              grid[row][c] = null;
            }
          }
        } else {
          cell.hang = HANG_FRAMES;
          cell.fallT = 0;
        }
      }
    }
    return falling;
  };

  /** run-length scan for 3+ in a row/column; returns the set of cells to pop. */
  const scanMatches = (): Set<number> => {
    const idx = (row: number, c: number) => row * COLS + c;
    const marked = new Set<number>();
    for (let row = 0; row < ROWS; row++) {
      let c = 0;
      while (c < COLS) {
        const cell = grid[row][c];
        if (!cell || cell.clearT > 0) {
          c++;
          continue;
        }
        let c2 = c + 1;
        while (c2 < COLS && grid[row][c2] && grid[row][c2]!.clearT === 0 && grid[row][c2]!.color === cell.color) c2++;
        if (c2 - c >= 3) for (let k = c; k < c2; k++) marked.add(idx(row, k));
        c = c2;
      }
    }
    for (let c = 0; c < COLS; c++) {
      let row = 0;
      while (row < ROWS) {
        const cell = grid[row][c];
        if (!cell || cell.clearT > 0) {
          row++;
          continue;
        }
        let r2 = row + 1;
        while (r2 < ROWS && grid[r2][c] && grid[r2][c]!.clearT === 0 && grid[r2][c]!.color === cell.color) r2++;
        if (r2 - row >= 3) for (let k = row; k < r2; k++) marked.add(idx(k, c));
        row = r2;
      }
    }
    return marked;
  };

  const doSwap = (io: IO) => {
    const a = grid[cy][cx];
    const b = grid[cy][cx + 1];
    if ((a && a.clearT > 0) || (b && b.clearT > 0)) return;
    grid[cy][cx] = b;
    grid[cy][cx + 1] = a;
    if (a) {
      a.swapX = CELL;
      a.hang = HANG_FRAMES;
    }
    if (b) {
      b.swapX = -CELL;
      b.hang = HANG_FRAMES;
    }
    if (io.sfx.slide) io.sfx.slide(320, 480, 0.05, "square", 0.09);
    else io.sfx.tone(380, 0.04, "square", 0.08);
  };

  const moveRepeat = (pressed: boolean, held: boolean, key: keyof typeof rep, move: () => void) => {
    if (pressed) {
      move();
      rep[key] = 0;
    } else if (held) {
      rep[key]++;
      if (rep[key] > 13 && (rep[key] - 13) % 6 === 0) move();
    } else rep[key] = 0;
  };

  const riseSpeed = () => 0.12 + (level - 1) * 0.03;

  return {
    update(io) {
      frame++;
      timeNow = io.time;
      for (const s of sparks) {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.1;
        s.life--;
      }
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
      for (const ring of rings) ring.t++;
      for (let i = rings.length - 1; i >= 0; i--) if (rings[i].t >= rings[i].max) rings.splice(i, 1);
      if (bannerT > 0) bannerT--;
      if (shakeT > 0) shakeT--;
      for (let i = noteQueue.length - 1; i >= 0; i--) {
        const n = noteQueue[i];
        if (frame >= n.at) {
          io.sfx.tone(n.freq, n.dur, n.wave, n.vol);
          noteQueue.splice(i, 1);
        }
      }

      if (won) return;

      if (over) {
        overT++;
        if (overT === 1 && io.sfx.slide) io.sfx.slide(260, 60, 0.4, "sawtooth", 0.18);
        if (overT > 55 && !sentOver) {
          sentOver = true;
          io.sfx.play("die");
          io.gameOver();
        }
        return;
      }

      const inp = io.input;

      // ── cursor + swap (buttons and tap both work) ──
      moveRepeat(inp.pressed.left, inp.held.left, "left", () => (cx = clamp(cx - 1, 0, COLS - 2)));
      moveRepeat(inp.pressed.right, inp.held.right, "right", () => (cx = clamp(cx + 1, 0, COLS - 2)));
      moveRepeat(inp.pressed.up, inp.held.up, "up", () => (cy = clamp(cy - 1, 0, ROWS - 1)));
      moveRepeat(inp.pressed.down, inp.held.down, "down", () => (cy = clamp(cy + 1, 0, ROWS - 1)));
      if (inp.pressed.a) doSwap(io);
      if (inp.tap) {
        const tc = Math.floor((inp.tap.x - WX) / CELL);
        const tr = Math.floor((inp.tap.y - WY + riseOffset) / CELL);
        if (tc >= 0 && tc < COLS && tr >= 0 && tr < ROWS) {
          if (tr === cy && (tc === cx || tc === cx + 1)) doSwap(io);
          else {
            cx = clamp(tc === COLS - 1 ? COLS - 2 : tc, 0, COLS - 2);
            cy = tr;
          }
        }
      }

      // ── decay the little slide animations ──
      for (const row of grid)
        for (const cell of row)
          if (cell) {
            if (cell.dropY > 0) cell.dropY = Math.max(0, cell.dropY - 6);
            if (cell.swapX !== 0) {
              cell.swapX *= 0.55;
              if (Math.abs(cell.swapX) < 0.6) cell.swapX = 0;
            }
          }

      // ── clearing countdown → gravity → rescan (this is where chains happen) ──
      for (const row of grid)
        for (const cell of row)
          if (cell && cell.clearT > 0) {
            cell.clearT--;
            if (cell.clearT === 0) {
              const i = row.indexOf(cell);
              row[i] = null;
            }
          }
      const falling = gravityStep();
      if (!falling && !anyClearing()) {
        const matches = scanMatches();
        if (matches.size > 0) {
          const size = matches.size;
          chainCount = cascading ? chainCount + 1 : 1;
          cascading = true;
          for (const key of matches) {
            const row = Math.floor(key / COLS);
            const c = key % COLS;
            const cell = grid[row][c]!;
            cell.clearT = CLEAR_FRAMES;
            const px = WX + c * CELL + CELL / 2;
            const py = WY + row * CELL - riseOffset + CELL / 2;
            burst(px, py, PANELS[cell.color].color, 8);
            rings.push({ x: px, y: py, t: 0, max: 16, color: PANELS[cell.color].color });
          }
          const combo = size >= 4;
          const pts = Math.round(10 * size * level * (combo ? 1 + (size - 3) * 0.25 : 1) * (chainCount >= 2 ? chainCount : 1));
          io.score(pts);
          // chain pitch climbs with every link; a crunchy noise burst underlines a 4+ combo
          const base = 420 + Math.min(chainCount, 6) * 70;
          if (io.sfx.slide) io.sfx.slide(base, base * 1.5, 0.1, "square", 0.14);
          else io.sfx.play(chainCount >= 3 ? "win" : combo ? "powerup" : "coin");
          if (combo) io.sfx.noise?.(0.16, 0.14, 1400, 400);
          if (chainCount >= 3) fanfare([base * 1.5, base * 1.5 * 1.26, base * 1.5 * 1.5], 4, "square", 0.08, 0.12);
          pauseRiseT = PAUSE_FRAMES;
          shakeT = Math.max(shakeT, combo ? 10 : chainCount >= 2 ? 7 : 3);
          const label = chainCount >= 2 && combo ? `CHAIN x${chainCount} COMBO!` : chainCount >= 2 ? `CHAIN x${chainCount}!` : combo ? "COMBO!" : "";
          if (label) {
            banner = label;
            bannerT = 55;
          }
        } else {
          cascading = false;
          chainCount = 0;
        }
      }

      // ── danger: the stack is touching the top (an alarm beep over a low heartbeat thud) ──
      if (grid[0].some((c) => c !== null)) {
        dangerT++;
        if (dangerT % 20 === 1) {
          io.sfx.tone(880, 0.05, "square", 0.09);
          io.sfx.tone(110, 0.09, "sine", 0.14);
        }
        if (dangerT >= DANGER_LIMIT) over = true;
      } else dangerT = 0;

      // ── level, every ~30s, win at 10 ──
      const newLevel = Math.min(10, Math.floor(io.time / 30) + 1);
      if (newLevel > level) {
        level = newLevel;
        banner = level >= 10 ? "LEVEL 10!" : `LEVEL ${level}!`;
        bannerT = 80;
        fanfare([523, 659, 784, 1046], 5, "square", 0.1, 0.16);
        io.score(150 * level);
        if (level >= 10) {
          won = true;
          fanfare([523, 659, 784, 1046, 1318, 1568], 6, "square", 0.14, 0.18);
          io.win();
          return;
        }
      }

      // ── the stack slowly rises; B hurries it ──
      if (pauseRiseT > 0) pauseRiseT--;
      else if (!grid[0].some((c) => c !== null)) {
        if (inp.held.b && frame % 8 === 0) io.sfx.noise?.(0.05, 0.05, 220, 150);
        riseOffset += riseSpeed() * (inp.held.b ? 3 : 1);
        while (riseOffset >= CELL) {
          riseOffset -= CELL;
          for (let row = 0; row < ROWS - 1; row++) grid[row] = grid[row + 1];
          grid[ROWS - 1] = nextRow.map(mkCell);
          nextRow = generateRow(r, colorsOf(grid[ROWS - 2]), colorsOf(grid[ROWS - 3]));
          if (inp.held.b) io.score(2);
        }
      }
    },

    draw(g) {
      g.clear(PAL.night);
      g.sprite(backdrop(), 0, 0);

      // a hit lands with a little camera punch, same deterministic jitter every replay
      const shk = shakeT > 0 ? (hash2(frame, 1) - 0.5) * 2 * (shakeT / 10) * 3 : 0;
      const shky = shakeT > 0 ? (hash2(frame, 2) - 0.5) * 2 * (shakeT / 10) * 3 : 0;
      g.camera(shk, shky);

      // well frame
      g.rect(WX - 5, WY - 3, COLS * CELL + 10, ROWS * CELL + 7, PAL.purple);
      g.rect(WX - 3, WY - 1, COLS * CELL + 6, ROWS * CELL + 3, dangerT > 0 && frame % 10 < 5 ? PAL.red : PAL.pink);
      g.rect(WX, WY, COLS * CELL, ROWS * CELL, PAL.black);

      // panels (shifted up by riseOffset so the stack visibly climbs)
      for (let row = 0; row < ROWS; row++)
        for (let c = 0; c < COLS; c++) {
          const cell = grid[row][c];
          if (!cell) continue;
          const x = WX + c * CELL + cell.swapX;
          const y = WY + row * CELL - riseOffset - cell.dropY;
          drawPanel(g, x, y, CELL, cell, over);
        }
      // the sliver of the next row, peeking up from under the floor as the stack rises
      if (riseOffset > 0.5)
        for (let c = 0; c < COLS; c++)
          g.rect(WX + c * CELL + 1, WY + ROWS * CELL - riseOffset, CELL - 2, riseOffset, shade(PANELS[nextRow[c]].color, -0.1));

      for (let x = 1; x < COLS; x++) g.rect(WX + x * CELL, WY, 1, ROWS * CELL, "rgba(0,0,0,0.3)");
      g.box(WX, WY, COLS * CELL, ROWS * CELL, PAL.pink);

      // pop shockwave rings
      for (const ring of rings) {
        const t = ring.t / ring.max;
        g.alpha(Math.max(0, 0.6 * (1 - t)));
        g.circle(ring.x, ring.y, 2 + t * (CELL * 0.9), ring.color);
        g.alpha(1);
      }

      // cursor (bounces a little, spans the two selected panels)
      if (!over) {
        const bob = Math.sin(frame * 0.25) * 1.2;
        const cxp = WX + cx * CELL;
        const cyp = WY + cy * CELL - riseOffset + bob;
        g.box(cxp - 1, cyp - 1, CELL * 2 + 2, CELL + 2, PAL.white);
        g.box(cxp - 2, cyp - 2, CELL * 2 + 4, CELL + 4, PAL.yellow);
      }

      for (const s of sparks) g.rect(s.x - 1, s.y - 1, 2, 2, s.life % 6 < 3 ? PAL.white : s.color);

      // danger: the well floods with a pulsing red wash as time runs out
      if (dangerT > 0) {
        g.alpha(0.1 + 0.12 * (frame % 20 < 10 ? 1 : 0) * Math.min(1, dangerT / DANGER_LIMIT));
        g.rect(WX, WY, COLS * CELL, ROWS * CELL, PAL.red);
        g.alpha(1);
      }

      g.camera(0, 0);

      // side panels
      const panel = (x: number, y: number, w: number, h: number, title: string) => {
        g.rect(x, y, w, h, PAL.navy);
        g.box(x, y, w, h, PAL.sky);
        if (title) g.text(title, x + w / 2, y + 3, PAL.yellow, { align: "center" });
      };
      panel(4, WY, 60, 44, "LEVEL");
      g.text(String(level), 34, WY + 16, PAL.white, { align: "center", size: 2 });
      g.rect(10, WY + 34, 48, 3, PAL.dark);
      g.rect(10, WY + 34, 48 * ((timeNow % 30) / 30), 3, PAL.lime);

      panel(4, WY + 50, 60, 70, "");
      g.text("MOVE", 34, WY + 56, PAL.grey, { align: "center" });
      g.text("4-WAY", 34, WY + 66, PAL.grey, { align: "center" });
      g.text("A SWAP", 34, WY + 82, PAL.cyan, { align: "center" });
      g.text("B RAISE", 34, WY + 98, PAL.orange, { align: "center" });
      if (chainCount >= 2) {
        g.text("CHAIN", 34, WY + 112, PAL.pink, { align: "center" });
        g.text(`x${chainCount}`, 34, WY + 122, PAL.pink, { align: "center", size: 2 });
      }

      panel(192, WY, 60, 44, "NEXT");
      for (let c = 0; c < COLS; c++) {
        const p = PANELS[nextRow[c]];
        const x = 198 + (c % 3) * 17;
        const y = WY + 15 + Math.floor(c / 3) * 16;
        g.rect(x, y, 13, 13, shade(p.color, -0.3));
        g.rect(x + 1, y + 1, 11, 11, p.color);
        g.rect(x + 1, y + 1, 11, 4, shade(p.color, 0.3));
        p.icon(g, x - 2, y - 3, 17, p.ink);
      }
      panel(192, WY + 50, 60, 70, "");
      g.text("ENDLESS", 222, WY + 58, PAL.grey, { align: "center" });
      g.text("REACH", 222, WY + 74, PAL.grey, { align: "center" });
      g.text("LEVEL 10", 222, WY + 84, PAL.lime, { align: "center" });
      g.text("TO WIN!", 222, WY + 94, PAL.lime, { align: "center" });
      if (dangerT > 0) {
        g.text("TOP!", 222, WY + 112, frame % 10 < 5 ? PAL.red : PAL.white, { align: "center", size: 2 });
      }

      // banner
      if (bannerT > 0 && banner) {
        const y = WY + ROWS * CELL / 2 - 6;
        g.rect(WX - 6, y - 6, COLS * CELL + 12, 16, "rgba(13,11,26,0.8)");
        g.text(banner, W / 2, y, Math.floor(frame / 4) % 2 ? PAL.yellow : PAL.pink, { align: "center" });
      }
      if (won) {
        g.rect(50, 90, W - 100, 40, "rgba(13,11,26,0.85)");
        g.text("YOU POPPED LEVEL 10!", W / 2, 104, PAL.lime, { align: "center" });
      }
    },
  };
}

export const panelPop: RetroGameDef = {
  id: "panel-pop",
  title: "Panel Pop",
  blurb: "Swap candy panels to match 3+ and chain pops before the stack tops out!",
  genre: "Puzzle",
  emoji: "🟪",
  color: "#ff6fcf",
  controls: "◀▶▲▼ move cursor · A swap two panels · B raise the stack faster",
  pad: { dpad: "4", a: "Swap", b: "Raise", tap: true },
  create,
};
