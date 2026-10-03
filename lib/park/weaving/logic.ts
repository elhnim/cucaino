// Weaving mini-game state (pure, no I/O). A loom is a grid of cells; each cell is either empty
// (plain warp thread) or dyed with one wool colour. The kid can paint a single cell, or weave a
// whole row across in one go (the shuttle passing over the warp) — tapping single cells is how
// the alternating patterns (checks, zigzag, diamonds, waves) get built.
//
// Two modes: "pattern" (follow a Peakfolk pattern card — matching earns a star) and "free" (no
// card, no scoring, always celebrated). Undo/clear are plain grid history ops.
import { PATTERNS, WOOL_COLORS, getPattern, type PatternDef } from "../registry/weaveFacts";

export const GRID_COLS = 10;
export const GRID_ROWS = 8;

/** how close a woven pattern has to be to the card to earn a star */
export const MATCH_THRESHOLD = 0.85;

/** how many finished weaves the gallery remembers, per kid */
export const GALLERY_CAP = 12;

export type WeaveMode = "pattern" | "free";

/** one loom cell: a wool colour id, or null for plain (unwoven) warp */
export type Cell = string | null;
export type Grid = Cell[][]; // rows x cols

export function emptyGrid(cols: number = GRID_COLS, rows: number = GRID_ROWS): Grid {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null as Cell));
}

function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.slice());
}

export interface WeaveState {
  mode: WeaveMode;
  grid: Grid;
  cols: number;
  rows: number;
  history: Grid[];
  currentColor: string;
  patternId: string | null;
  baseColor: string;
  accentColor: string;
  done: boolean;
  lastResult: { isMatch: boolean; score: number } | null;
}

export function initialWeaveState(): WeaveState {
  return {
    mode: "free",
    grid: emptyGrid(),
    cols: GRID_COLS,
    rows: GRID_ROWS,
    history: [],
    currentColor: WOOL_COLORS[0].id,
    patternId: null,
    baseColor: WOOL_COLORS[0].id,
    accentColor: WOOL_COLORS[1].id,
    done: false,
    lastResult: null,
  };
}

/** Start (or restart) free design: a clean grid, no card, any colour. */
export function startFree(s: WeaveState): WeaveState {
  return {
    ...s,
    mode: "free",
    grid: emptyGrid(s.cols, s.rows),
    history: [],
    patternId: null,
    done: false,
    lastResult: null,
  };
}

/**
 * Start a pattern card: a clean grid and the card's two wool colours (deterministic per card so
 * the "Base"/"Accent" swatches shown on the card match what's actually paintable).
 */
export function startPattern(s: WeaveState, patternId: string): WeaveState {
  const pattern = getPattern(patternId);
  if (!pattern) return s;
  const idx = PATTERNS.findIndex((p) => p.id === patternId);
  const baseColor = WOOL_COLORS[idx % WOOL_COLORS.length].id;
  const accentColor = WOOL_COLORS[(idx + 2) % WOOL_COLORS.length].id;
  return {
    ...s,
    mode: "pattern",
    grid: emptyGrid(s.cols, s.rows),
    history: [],
    patternId,
    baseColor,
    accentColor,
    currentColor: accentColor,
    done: false,
    lastResult: null,
  };
}

/** Pick the active wool colour. In pattern mode only the card's own two colours are accepted. */
export function selectColor(s: WeaveState, colorId: string): WeaveState {
  if (s.mode === "pattern" && colorId !== s.baseColor && colorId !== s.accentColor) return s;
  if (!WOOL_COLORS.some((w) => w.id === colorId)) return s;
  return { ...s, currentColor: colorId };
}

function pushHistory(s: WeaveState): Grid[] {
  const next = [...s.history, cloneGrid(s.grid)];
  // no real cap needed (a single weave never gets long enough to matter), but keep it bounded
  return next.length > 200 ? next.slice(next.length - 200) : next;
}

/** Paint one cell with the current colour. */
export function paintCell(s: WeaveState, row: number, col: number): WeaveState {
  if (row < 0 || row >= s.rows || col < 0 || col >= s.cols) return s;
  if (s.grid[row][col] === s.currentColor) return s;
  const grid = cloneGrid(s.grid);
  grid[row][col] = s.currentColor;
  return { ...s, grid, history: pushHistory(s) };
}

/** Weave a whole row in one go — the shuttle passing right across the warp. */
export function paintRow(s: WeaveState, row: number): WeaveState {
  if (row < 0 || row >= s.rows) return s;
  const grid = cloneGrid(s.grid);
  let changed = false;
  for (let c = 0; c < s.cols; c++) {
    if (grid[row][c] !== s.currentColor) {
      grid[row][c] = s.currentColor;
      changed = true;
    }
  }
  if (!changed) return s;
  return { ...s, grid, history: pushHistory(s) };
}

/** Undo the last paint (cell or row). No-op with nothing to undo. */
export function undo(s: WeaveState): WeaveState {
  if (s.history.length === 0) return s;
  const prev = s.history[s.history.length - 1];
  return { ...s, grid: prev, history: s.history.slice(0, -1) };
}

/** Clear the whole loom back to plain warp (itself undoable). */
export function clearGrid(s: WeaveState): WeaveState {
  const isEmpty = s.grid.every((row) => row.every((c) => c === null));
  if (isEmpty) return s;
  return { ...s, grid: emptyGrid(s.cols, s.rows), history: pushHistory(s) };
}

/** Fraction of cells (0..1) where "is this the accent colour" matches the pattern card's shape. */
export function matchScore(grid: Grid, pattern: PatternDef, accentColor: string): number {
  let total = 0;
  let matches = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      total++;
      const isAccent = grid[r][c] === accentColor;
      if (isAccent === pattern.template(c, r)) matches++;
    }
  }
  return total ? matches / total : 0;
}

/** Finish the weave: score it against the card if there is one; free design always celebrates. */
export function finishWeave(s: WeaveState): WeaveState {
  if (s.mode !== "pattern" || !s.patternId) {
    return { ...s, done: true, lastResult: { isMatch: true, score: 1 } };
  }
  const pattern = getPattern(s.patternId);
  if (!pattern) return { ...s, done: true, lastResult: { isMatch: true, score: 1 } };
  const score = matchScore(s.grid, pattern, s.accentColor);
  return { ...s, done: true, lastResult: { isMatch: score >= MATCH_THRESHOLD, score } };
}

/** A small, saved record of one finished weave — compact enough for localStorage. */
export interface GalleryEntry {
  id: string;
  createdAt: number;
  patternId: string | null;
  patternName: string | null;
  isMatch: boolean;
  cols: number;
  rows: number;
  /** flattened row-major palette indices; -1 means plain (unwoven) */
  cells: number[];
}

function colorIndex(colorId: Cell): number {
  if (colorId == null) return -1;
  const idx = WOOL_COLORS.findIndex((w) => w.id === colorId);
  return idx;
}

export function encodeGrid(grid: Grid): number[] {
  const flat: number[] = [];
  for (const row of grid) for (const cell of row) flat.push(colorIndex(cell));
  return flat;
}

export function decodeGrid(cells: number[], cols: number, rows: number): Grid {
  const grid = emptyGrid(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = cells[r * cols + c];
      grid[r][c] = idx != null && idx >= 0 && idx < WOOL_COLORS.length ? WOOL_COLORS[idx].id : null;
    }
  }
  return grid;
}

export function makeGalleryEntry(s: WeaveState, now: number = Date.now()): GalleryEntry {
  const pattern = s.patternId ? getPattern(s.patternId) : undefined;
  return {
    id: `${now}-${Math.round(Math.random() * 1e6)}`,
    createdAt: now,
    patternId: s.patternId,
    patternName: pattern?.name ?? null,
    isMatch: s.lastResult?.isMatch ?? false,
    cols: s.cols,
    rows: s.rows,
    cells: encodeGrid(s.grid),
  };
}

/** Add a finished weave to the front of the gallery, capped to GALLERY_CAP entries. */
export function addToGallery(gallery: GalleryEntry[], entry: GalleryEntry): GalleryEntry[] {
  return [entry, ...gallery].slice(0, GALLERY_CAP);
}
