// PANEL POP — an original panel-swapping puzzle (in the spirit of panel-matching classics,
// own art and a cute host character, no outside names or characters). A 6-wide well of
// coloured, symbol-marked panels slowly rises from below. A 2-wide cursor slides over any
// two neighbours; A swaps them (even with an empty cell). Get 3+ of a kind in a row or
// column and they pop; whatever was sitting above tumbles down, and if THAT makes a new
// match it's a CHAIN (x2, x3…) — pop 4+ panels in one go and it's a COMBO. Both pause the
// rise for a beat and score big. Let the stack touch the top for ~2s and it's game over.
// Endless play, level up every ~30s, reach level 10 to win.
import { H, PAL, W, clamp, rng, type GameInstance, type Gfx, type IO, type RetroGameDef, type Sprite } from "../engine";
import { bake, hash2, mixHex, outlined, shade } from "../art";

const COLS = 6;
const ROWS = 10;
const CELL = 20;
const WX = (W - COLS * CELL) / 2; // 68
const WY = 18;
const START_ROWS = 5;

const HANG_FRAMES = 8; // grace period before a floating panel starts to fall
const FALL_STEP = 3; // frames per row of falling
const CLEAR_FRAMES = 14; // flash-before-pop duration (before the pop-stagger kicks in)
const POP_STAGGER = 3; // extra frames of flash per panel, so a match pops one-by-one, not at once
const POP_SHRINK = 6; // last frames of a panel's life: it shrinks to a point instead of just vanishing
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
  popIdx: number;
}
const mkCell = (color: number): Cell => ({ color, hang: HANG_FRAMES, fallT: 0, dropY: 0, swapX: 0, clearT: 0, popIdx: 0 });

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
  const base = grey ? PAL.grey : p.color;
  if (cell.clearT > 0) {
    // the last few frames: the gem collapses to a bright point rather than just vanishing
    if (cell.clearT <= POP_SHRINK) {
      const k = cell.clearT / POP_SHRINK;
      const sz = Math.max(2, Math.round((size - 2) * k));
      const off = (size - sz) / 2;
      g.rect(x + off, y + off, sz, sz, PAL.white);
      return;
    }
    const flashing = Math.floor(cell.clearT / 3) % 2 === 0;
    if (flashing) {
      g.rect(x + 1, y + 1, size - 2, size - 2, PAL.white);
      return;
    }
  }
  // muted blue-grey frame (never a flat darkened copy of the fill — that's what reads as "glitchy")
  const edge = mixHex(shade(base, -0.5), PAL.navy, 0.4);
  const dark = shade(base, -0.3);
  const hi = shade(base, 0.6);
  g.rect(x + 1, y + 1, size - 2, size - 2, edge);
  g.rect(x + 2, y + 2, size - 4, size - 4, base);
  // a strong glass bevel: a bright 2px edge top+left, a dark 2px edge bottom+right
  g.rect(x + 2, y + 2, size - 4, 2, hi);
  g.rect(x + 2, y + 2, 2, size - 4, hi);
  g.rect(x + 2, y + size - 4, size - 4, 2, dark);
  g.rect(x + size - 4, y + 2, 2, size - 4, dark);
  // a bright specular dot in the top-left corner, like light caught on a cut gem's facet
  g.rect(x + 3, y + 3, 2, 2, PAL.white);
  // clip the four corners square so the chiclet reads as rounded against the well floor
  g.rect(x, y, 1, 1, bg);
  g.rect(x + size - 1, y, 1, 1, bg);
  g.rect(x, y + size - 1, 1, 1, bg);
  g.rect(x + size - 1, y + size - 1, 1, 1, bg);
  // embossed symbol: a dark offset copy under a lit copy
  p.icon(g, x + 1, y + 1, size, grey ? PAL.night : dark);
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

// ── backdrop: a fairy-garden dawn behind the well — dithered sky, a distant candy castle on the
// farthest hill, three rolling flowered hills — baked once (lazily) into one Sprite so draw()
// costs a single blit. Deliberately darkened/desaturated so the glossy panels pop in front of it. ──
let BG: Sprite | null = null;
const CASTLE_X = 222; // sits in the right-hand backdrop strip, beside the NEXT sign
function bakeGarden(): Sprite {
  const SKY_H = 190;
  const skyStops = [
    shade(mixHex(PAL.navy, PAL.night, 0.5), -0.1),
    shade(mixHex(PAL.purple, PAL.navy, 0.5), -0.12),
    shade(mixHex(PAL.purple, PAL.pink, 0.5), -0.18),
    shade(mixHex(PAL.pink, PAL.orange, 0.45), -0.16),
    shade(mixHex(PAL.orange, PAL.yellow, 0.35), -0.2),
  ];
  const skyAt = (x: number, y: number) => {
    const t = Math.max(0, Math.min(0.9999, y / SKY_H)) * (skyStops.length - 1);
    const i = Math.floor(t);
    const frac = t - i;
    return frac > bayerLite(x, y) ? skyStops[Math.min(skyStops.length - 1, i + 1)] : skyStops[i];
  };
  // three rolling hill horizons, each a slow wave STACKED on top of the farther one (never the
  // raw wave compared directly — that let a near wiggle cross a far one and swallow the layer
  // whole) so farTop < midTop < nearTop everywhere and every layer always gets its own band.
  const wave = (x: number, seed: number) => 0.6 * Math.sin(x * 0.018 + seed * 3.1) + 0.4 * Math.sin(x * 0.044 + seed * 7.7 + 1.3);
  const farTop = Array.from({ length: W }, (_, x) => 170 + 9 * wave(x, 0));
  const midTop = Array.from({ length: W }, (_, x) => farTop[x] + 15 + 6 * wave(x, 1));
  const nearTop = Array.from({ length: W }, (_, x) => midTop[x] + 17 + 6 * wave(x, 2));
  const hillBase = [
    shade(mixHex(PAL.purple, PAL.navy, 0.55), -0.22), // farthest hill, dusk-blue
    shade(mixHex(PAL.green, PAL.purple, 0.3), -0.14), // mid hill
    shade(PAL.green, -0.26), // nearest hill, richest/darkest so the frame reads in front of it
  ];
  const castleBase = farTop[CASTLE_X];
  const castleInk = shade(mixHex(PAL.purple, PAL.navy, 0.6), -0.3);
  const roofInk = shade(PAL.pink, -0.28);
  const castlePixel = (x: number, y: number): string | null => {
    const dx = x - CASTLE_X;
    if (Math.abs(dx) > 15) return null;
    const wallTop = castleBase - 9;
    if (dx >= -13 && dx <= 13 && y >= wallTop && y < castleBase) {
      const merlon = Math.floor((dx + 13) / 3) % 2 === 0;
      if (y < wallTop + 2 && !merlon) return null;
      if (y > wallTop + 4 && y < wallTop + 6 && Math.abs(dx) % 6 < 2 && Math.abs(dx) > 3) return mixHex(castleInk, PAL.yellow, 0.55);
      return castleInk;
    }
    if (Math.abs(Math.abs(dx) - 10) <= 3) {
      const turretTop = wallTop - 7;
      if (y >= turretTop + 3 && y < wallTop) return castleInk;
      if (y >= turretTop && y < turretTop + 3 && Math.abs(Math.abs(dx) - 10) <= turretTop + 3 - y) return roofInk;
    }
    if (Math.abs(dx) <= 4) {
      const keepTop = wallTop - 11;
      if (y >= keepTop + 3 && y < wallTop) return castleInk;
      if (y >= keepTop && y < keepTop + 3 && Math.abs(dx) <= (keepTop + 3 - y) * 0.85) return roofInk;
    }
    return null;
  };
  return bake(W, H, (x, y) => {
    if (y >= nearTop[x]) {
      // nearest hill: a scatter of tiny flowers on the richest green
      const h = hash2(Math.floor(x / 2), Math.floor(y / 2), 11);
      if (h > 0.985) return PAL.pink;
      if (h > 0.975) return PAL.yellow;
      return hillBase[2];
    }
    if (y >= midTop[x]) {
      const h = hash2(Math.floor(x / 3), Math.floor(y / 3), 22);
      if (h > 0.99) return mixHex(hillBase[1], PAL.pink, 0.5);
      return hillBase[1];
    }
    const castle = castlePixel(x, y);
    if (castle) return castle;
    if (y >= farTop[x]) return hillBase[0];
    return skyAt(x, y);
  });
}
/** a cheap 2x2 ordered dither (lighter than art.ts's bayer, enough for a sky gradient) */
function bayerLite(x: number, y: number) {
  const m = [0, 2, 3, 1];
  return (m[(y & 1) * 2 + (x & 1)] + 0.5) / 4;
}
const backdrop = () => (BG ??= bakeGarden());

// ── floating petals + sparkles drifting across the garden, cheap per-frame sprites over the baked sky ──
let PETAL: Sprite | null = null;
const petalSprite = () => (PETAL ??= bake(3, 3, (x, y) => ((x === 1 && y === 0) || (x === 0 && y === 1) || (x === 2 && y === 1) || (x === 1 && y === 2) ? PAL.pink : x === 1 && y === 1 ? PAL.white : null)));
let TWINKLE: Sprite | null = null;
const twinkleSprite = () => (TWINKLE ??= bake(3, 3, (x, y) => (x === 1 || y === 1 ? PAL.white : null)));
const DRIFTER_N = 7;
function drawDrifters(g: Gfx, frame: number) {
  for (let i = 0; i < DRIFTER_N; i++) {
    const speed = 0.14 + hash2(i, 1, 51) * 0.12;
    const span = W + 12;
    const raw = hash2(i, 2, 51) * span + frame * speed;
    const x = (((raw % span) + span) % span) - 6;
    const y = hash2(i, 3, 51) * (H - 16) + Math.sin(frame * 0.02 + i * 1.7) * 5;
    g.alpha(0.4 + 0.3 * Math.max(0, Math.sin(frame * 0.07 + i)));
    g.sprite(i % 3 === 0 ? twinkleSprite() : petalSprite(), x, y);
    g.alpha(1);
  }
}

// ── a faceted candy gem for the frame's four corners: dark ring, lit body, a bright nick of
// highlight, and a little sparkle cross that twinkles on a slow, deterministic cycle ──
function drawGem(g: Gfx, cx: number, cy: number, r: number, color: string, frame: number, phase: number) {
  g.circle(cx, cy, r, shade(color, -0.45));
  g.circle(cx, cy, r - 1, color);
  g.circle(cx - r * 0.3, cy - r * 0.3, r * 0.45, shade(color, 0.5));
  g.rect(cx - 1, cy - 1, 2, 2, PAL.white);
  const tw = Math.sin(frame * 0.05 + phase);
  if (tw > 0.6) {
    const a = (tw - 0.6) / 0.4;
    g.alpha(a);
    g.rect(cx - r - 2, cy - 0.5, r * 2 + 4, 1, PAL.white);
    g.rect(cx - 0.5, cy - r - 2, 1, r * 2 + 4, PAL.white);
    g.alpha(1);
  }
}

// the well's own "glass": a deep navy pane with a faint vertical gradient (lighter near the top,
// like garden sky-glow filtering down through it) and a soft diagonal sheen — still dark enough
// that the glossy panels read clearly in front of it, baked once since the well's size never changes
let WELL_GLASS: Sprite | null = null;
function bakeWellGlass(w: number, h: number): Sprite {
  return bake(w, h, (x, y) => {
    const t = y / h;
    let c = mixHex(shade(PAL.navy, -0.2), PAL.black, 0.2 + 0.55 * t);
    const diag = (((x * 0.5 - y * 0.8) % 50) + 50) % 50;
    if (diag < 14) c = mixHex(c, PAL.sky, 0.09 * (1 - diag / 14));
    return c;
  });
}
const wellGlass = (w: number, h: number) => (WELL_GLASS ??= bakeWellGlass(w, h));

/** the ornate gold-and-candy bevelled frame around the well, with a gem at each corner */
function drawWellFrame(g: Gfx, x0: number, y0: number, w: number, h: number, danger: boolean, frame: number) {
  const gold = PAL.yellow;
  const M = 7; // frame thickness
  g.rect(x0 - M - 1, y0 - M - 1, w + (M + 1) * 2, h + (M + 1) * 2, shade(gold, -0.55));
  g.rect(x0 - M, y0 - M, w + M * 2, h + M * 2, shade(gold, -0.15));
  g.rect(x0 - M, y0 - M, w + M * 2, 2, shade(gold, 0.4));
  g.rect(x0 - M, y0 - M, 2, h + M * 2, shade(gold, 0.4));
  g.rect(x0 - M, y0 + h + M - 2, w + M * 2, 2, shade(gold, -0.4));
  g.rect(x0 + w + M - 2, y0 - M, 2, h + M * 2, shade(gold, -0.4));
  // candy trim ring, right at the well's lip — pulses red in danger
  const trim = danger && frame % 10 < 5 ? PAL.red : PAL.pink;
  g.rect(x0 - 3, y0 - 3, w + 6, h + 6, trim);
  g.sprite(wellGlass(w, h), x0, y0);
  const gemColors = [PAL.red, PAL.sky, PAL.green, PAL.purple];
  const corners: [number, number][] = [
    [x0 - M + 1, y0 - M + 1],
    [x0 + w + M - 2, y0 - M + 1],
    [x0 - M + 1, y0 + h + M - 2],
    [x0 + w + M - 2, y0 + h + M - 2],
  ];
  corners.forEach(([gx, gy], i) => drawGem(g, gx, gy, 3.5, gemColors[i], frame, i * 1.6));
}

// ── the garden fairy mascot perched on the frame: idle bob, cheers on a chain/combo, frets when
// the stack nears the top. Three small baked expressions, reused every frame (never per-pixel). ──
let FAIRY_IDLE: Sprite | null = null;
let FAIRY_CHEER: Sprite | null = null;
let FAIRY_FRET: Sprite | null = null;
function bakeFairy(mood: "idle" | "cheer" | "fret"): Sprite {
  const W2 = 20,
    H2 = 20;
  const skin = mixHex(PAL.pink, PAL.white, 0.6); // pale candy-cream so dark features read clearly
  const cheek = PAL.pink;
  const wing = mixHex(PAL.cyan, PAL.white, 0.3);
  const raw = bake(W2, H2, (x, y) => {
    const cx = 10,
      cy = 11;
    const dx = x - cx,
      dy = y - cy;
    // wings (two soft ovals either side), drooped for fret, flared for cheer
    const wingY = mood === "fret" ? dy - 3 : dy;
    if (Math.abs(dx) > 5 && Math.abs(dx) < 10.5 && wingY * wingY * 1.8 + (Math.abs(dx) - 7.7) ** 2 * 2.4 < 10) return wing;
    // a little starry antenna on top, idle only
    if (mood === "idle" && (x === 10 || x === 9) && (y === 0 || y === 1)) return PAL.yellow;
    // arms up, cheering
    if (mood === "cheer" && y >= 3 && y <= 8 && (x === 1 || x === 2 || x === 17 || x === 18)) return skin;
    // round head/body blob
    if (dx * dx * 1.05 + dy * dy < 30) {
      if (y === 7 && (x === 7 || x === 13)) return PAL.night; // eyes
      if (mood === "fret" && y === 6 && (x === 7 || x === 13)) return PAL.night; // furrowed brow
      if (mood === "fret" && y === 13 && x >= 8 && x <= 12) return PAL.night; // worried frown
      if (mood === "cheer" && y >= 10 && y <= 11 && x >= 7 && x <= 13) return PAL.night; // open cheering mouth
      if (mood === "idle" && y === 12 && x >= 9 && x <= 11) return PAL.night; // little smile
      if (y >= 9 && y <= 10 && (x === 4 || x === 16)) return cheek; // rosy cheeks
      return skin;
    }
    return null;
  });
  return outlined(raw);
}
const fairy = (mood: "idle" | "cheer" | "fret") =>
  mood === "idle" ? (FAIRY_IDLE ??= bakeFairy("idle")) : mood === "cheer" ? (FAIRY_CHEER ??= bakeFairy("cheer")) : (FAIRY_FRET ??= bakeFairy("fret"));

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
  let bannerStart = 1;
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

      // ── clearing countdown → pop one-by-one into sparkles → gravity → rescan (chains happen here) ──
      for (let rIdx = 0; rIdx < ROWS; rIdx++) {
        const row = grid[rIdx];
        for (let c = 0; c < COLS; c++) {
          const cell = row[c];
          if (!cell || cell.clearT <= 0) continue;
          cell.clearT--;
          if (cell.clearT === 0) {
            row[c] = null;
            const px = WX + c * CELL + CELL / 2;
            const py = WY + rIdx * CELL - riseOffset + CELL / 2;
            const color = PANELS[cell.color].color;
            burst(px, py, color, 8);
            rings.push({ x: px, y: py, t: 0, max: 16, color });
            // a rising pop tone per panel, pitched by its order in the match — a little run up the scale
            io.sfx.tone(520 + cell.popIdx * 55, 0.05, "square", 0.09);
          }
        }
      }
      const falling = gravityStep();
      if (!falling && !anyClearing()) {
        const matches = scanMatches();
        if (matches.size > 0) {
          const size = matches.size;
          chainCount = cascading ? chainCount + 1 : 1;
          cascading = true;
          let popIdx = 0;
          for (const key of matches) {
            const row = Math.floor(key / COLS);
            const c = key % COLS;
            const cell = grid[row][c]!;
            cell.popIdx = popIdx;
            cell.clearT = CLEAR_FRAMES + popIdx * POP_STAGGER;
            popIdx++;
          }
          const combo = size >= 4;
          const pts = Math.round(10 * size * level * (combo ? 1 + (size - 3) * 0.25 : 1) * (chainCount >= 2 ? chainCount : 1));
          io.score(pts);
          // a quick whoosh marks the match; the rising pop tones (above) carry the actual pops
          const base = 420 + Math.min(chainCount, 6) * 70;
          if (io.sfx.slide) io.sfx.slide(base, base * 1.5, 0.08, "square", 0.1);
          else io.sfx.play(chainCount >= 3 ? "win" : combo ? "powerup" : "coin");
          if (combo) io.sfx.noise?.(0.16, 0.14, 1400, 400);
          if (chainCount >= 2) io.sfx.play("cheer");
          if (chainCount === 2) fanfare([base * 1.4, base * 1.76], 5, "square", 0.09, 0.13); // a two-note chime
          if (chainCount >= 3) fanfare([base * 1.5, base * 1.5 * 1.26, base * 1.5 * 1.5], 4, "square", 0.08, 0.12); // a bigger fanfare
          pauseRiseT = PAUSE_FRAMES;
          shakeT = Math.max(shakeT, combo ? 10 : chainCount >= 2 ? 7 : 3);
          const label = chainCount >= 2 && combo ? `CHAIN x${chainCount} COMBO!` : chainCount >= 2 ? `CHAIN x${chainCount}!` : combo ? `${size} COMBO!` : "";
          if (label) {
            banner = label;
            bannerStart = 55;
            bannerT = 55;
          }
        } else {
          cascading = false;
          chainCount = 0;
        }
      }

      // ── danger: the stack is touching the top (an alarm beep over a low heartbeat thud, and the
      // fairy frets while the whole stack trembles) ──
      if (grid[0].some((c) => c !== null)) {
        if (dangerT === 0) io.sfx.play("hurt");
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
        bannerStart = 80;
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
      drawDrifters(g, frame);

      // a hit lands with a little camera punch; danger adds its own constant tremble — both
      // deterministic (same jitter every replay, never Math.random)
      const hitShk = shakeT > 0 ? (shakeT / 10) * 3 : 0;
      const dangerShk = dangerT > 0 ? Math.min(1, dangerT / 40) * 1.1 : 0;
      const shk = (hash2(frame, 1) - 0.5) * 2 * (hitShk + dangerShk);
      const shky = (hash2(frame, 2) - 0.5) * 2 * (hitShk + dangerShk);
      g.camera(shk, shky);

      // the ornate gold-and-candy well frame, gems glinting at its corners
      drawWellFrame(g, WX, WY, COLS * CELL, ROWS * CELL, dangerT > 0, frame);

      // panels (shifted up by riseOffset so the stack visibly climbs)
      for (let row = 0; row < ROWS; row++)
        for (let c = 0; c < COLS; c++) {
          const cell = grid[row][c];
          if (!cell) continue;
          const x = WX + c * CELL + cell.swapX;
          const y = WY + row * CELL - riseOffset - cell.dropY;
          drawPanel(g, x, y, CELL, cell, over);
        }
      // the sliver of the next row, dimmed, peeking up from under the floor as the stack rises
      if (riseOffset > 0.5)
        for (let c = 0; c < COLS; c++)
          g.rect(WX + c * CELL + 1, WY + ROWS * CELL - riseOffset, CELL - 2, riseOffset, shade(PANELS[nextRow[c]].color, -0.35));

      for (let x = 1; x < COLS; x++) g.rect(WX + x * CELL, WY, 1, ROWS * CELL, "rgba(0,0,0,0.3)");
      g.box(WX, WY, COLS * CELL, ROWS * CELL, PAL.pink);

      // pop shockwave rings
      for (const ring of rings) {
        const t = ring.t / ring.max;
        g.alpha(Math.max(0, 0.6 * (1 - t)));
        g.circle(ring.x, ring.y, 2 + t * (CELL * 0.9), ring.color);
        g.alpha(1);
      }

      // cursor: pulsing corner brackets around the two selected panels
      if (!over) {
        const bob = Math.sin(frame * 0.25) * 1.2;
        const cxp = WX + cx * CELL;
        const cyp = WY + cy * CELL - riseOffset + bob;
        const pulse = 1 + 0.25 * Math.sin(frame * 0.3);
        const reach = Math.round(3 * pulse);
        const bw = CELL * 2;
        const bh = CELL;
        const col = PAL.yellow;
        const corner = (bx: number, by: number, dx: number, dy: number) => {
          g.rect(bx, by, reach * dx, 2, col);
          g.rect(bx, by, 2, reach * dy, col);
        };
        corner(cxp - 2, cyp - 2, 1, 1);
        corner(cxp + bw + 1, cyp - 2, -1, 1);
        corner(cxp - 2, cyp + bh + 1, 1, -1);
        corner(cxp + bw + 1, cyp + bh + 1, -1, -1);
        g.box(cxp - 1, cyp - 1, bw + 2, bh + 2, "rgba(255,255,255,0.5)");
      }

      for (const s of sparks) g.rect(s.x - 1, s.y - 1, 2, 2, s.life % 6 < 3 ? PAL.white : s.color);

      // danger: the well floods with a pulsing red wash as time runs out
      if (dangerT > 0) {
        g.alpha(0.1 + 0.12 * (frame % 20 < 10 ? 1 : 0) * Math.min(1, dangerT / DANGER_LIMIT));
        g.rect(WX, WY, COLS * CELL, ROWS * CELL, PAL.red);
        g.alpha(1);
      }

      g.camera(0, 0);

      // side panels, framed like little storybook signs: dark wood, a gold trim and a ribbon title
      const panel = (x: number, y: number, w: number, h: number, title: string) => {
        g.rect(x + 2, y + 3, w, h, "rgba(10,8,20,0.4)");
        g.rect(x, y, w, h, shade(PAL.brown, -0.4));
        g.rect(x + 1, y + 1, w - 2, h - 2, PAL.brown);
        g.rect(x + 1, y + 1, w - 2, Math.max(2, Math.round(h * 0.22)), shade(PAL.brown, 0.3));
        g.rect(x + 1, y + h - 3, w - 2, 2, shade(PAL.brown, -0.3));
        g.box(x, y, w, h, PAL.yellow);
        if (title) {
          g.rect(x + 4, y - 2, w - 8, 10, PAL.purple);
          g.box(x + 4, y - 2, w - 8, 10, PAL.pink);
          signText(title, x + w / 2, y, PAL.yellow, { align: "center" });
        }
      };
      // every label on the wood signs gets a dark drop shadow so it reads against the brown grain —
      // a plain cream (PAL.tan) for neutral labels, kept accent colours (cyan/orange/lime/pink/red)
      // elsewhere since they're useful colour-coding, not the readability problem
      const signText = (str: string, x: number, y: number, color: string, opts?: { align?: "left" | "center" | "right"; size?: number }) => {
        g.text(str, x + 1, y + 1, PAL.night, opts);
        g.text(str, x, y, color, opts);
      };
      panel(4, WY, 60, 44, "LEVEL");
      signText(String(level), 34, WY + 16, PAL.white, { align: "center", size: 2 });
      g.rect(10, WY + 34, 48, 3, PAL.dark);
      g.rect(10, WY + 34, 48 * ((timeNow % 30) / 30), 3, PAL.lime);
      // the garden fairy, seated on top of the LEVEL sign — cheers on a chain/combo, frets near the top
      const mood = dangerT > 10 ? "fret" : bannerT > 20 && (banner.includes("CHAIN") || banner.includes("COMBO")) ? "cheer" : "idle";
      const fBob = mood === "fret" ? (hash2(frame, 9) - 0.5) * 2 : Math.sin(frame * 0.08) * 1.5;
      g.sprite(fairy(mood), 23, WY - 20 + fBob);

      panel(4, WY + 50, 60, 70, "");
      signText("MOVE", 34, WY + 56, PAL.tan, { align: "center" });
      signText("4-WAY", 34, WY + 66, PAL.tan, { align: "center" });
      signText("A SWAP", 34, WY + 82, PAL.cyan, { align: "center" });
      signText("B RAISE", 34, WY + 98, PAL.orange, { align: "center" });
      if (chainCount >= 2) {
        signText("CHAIN", 34, WY + 112, PAL.pink, { align: "center" });
        signText(`x${chainCount}`, 34, WY + 122, PAL.pink, { align: "center", size: 2 });
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
      signText("ENDLESS", 222, WY + 58, PAL.tan, { align: "center" });
      signText("REACH", 222, WY + 74, PAL.tan, { align: "center" });
      signText("LEVEL 10", 222, WY + 84, PAL.lime, { align: "center" });
      signText("TO WIN!", 222, WY + 94, PAL.lime, { align: "center" });
      if (dangerT > 0) {
        signText("TOP!", 222, WY + 112, frame % 10 < 5 ? PAL.red : PAL.white, { align: "center", size: 2 });
      }

      // chain/combo banner: a bouncy sticker that pops in and settles
      if (bannerT > 0 && banner) {
        const age = bannerStart - bannerT;
        const decay = Math.max(0, 1 - age / bannerStart);
        const bounce = Math.abs(Math.sin(age * 0.5)) * 5 * decay;
        const by = WY + (ROWS * CELL) / 2 - 10 - bounce;
        const bg = banner.includes("COMBO") ? PAL.orange : PAL.purple;
        const bw = Math.min(COLS * CELL + 16, banner.length * 7 + 16);
        const bx = W / 2 - bw / 2;
        g.rect(bx + 2, by + 3, bw, 16, "rgba(10,8,20,0.45)");
        g.rect(bx, by, bw, 16, shade(bg, -0.4));
        g.rect(bx + 1, by + 1, bw - 2, 14, bg);
        g.rect(bx + 1, by + 1, bw - 2, 4, shade(bg, 0.35));
        g.box(bx, by, bw, 16, PAL.white);
        g.text(banner, W / 2, by + 4, PAL.yellow, { align: "center" });
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
