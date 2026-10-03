import { describe, expect, it } from "vitest";
import { PATTERNS } from "../registry/weaveFacts";
import {
  GALLERY_CAP,
  GRID_COLS,
  GRID_ROWS,
  MATCH_THRESHOLD,
  addToGallery,
  clearGrid,
  decodeGrid,
  emptyGrid,
  encodeGrid,
  finishWeave,
  initialWeaveState,
  makeGalleryEntry,
  matchScore,
  paintCell,
  paintRow,
  selectColor,
  startFree,
  startPattern,
  undo,
  type GalleryEntry,
} from "./logic";

describe("grid ops", () => {
  it("starts empty", () => {
    const s = initialWeaveState();
    expect(s.grid.length).toBe(GRID_ROWS);
    expect(s.grid[0].length).toBe(GRID_COLS);
    expect(s.grid.every((row) => row.every((c) => c === null))).toBe(true);
  });

  it("paints a single cell with the current colour", () => {
    let s = initialWeaveState();
    s = selectColor(s, "gold");
    s = paintCell(s, 2, 3);
    expect(s.grid[2][3]).toBe("gold");
    // everything else untouched
    expect(s.grid[2][4]).toBeNull();
  });

  it("paintRow fills the whole row (the shuttle pass)", () => {
    let s = initialWeaveState();
    s = selectColor(s, "sky");
    s = paintRow(s, 4);
    expect(s.grid[4].every((c) => c === "sky")).toBe(true);
    expect(s.grid[3].every((c) => c === null)).toBe(true);
  });

  it("ignores out-of-range cells/rows", () => {
    const s = initialWeaveState();
    expect(paintCell(s, 99, 0)).toBe(s);
    expect(paintRow(s, -1)).toBe(s);
  });

  it("selectColor in pattern mode only accepts the card's own two colours", () => {
    const s = startPattern(initialWeaveState(), "stripes");
    const before = s.currentColor;
    const outsider = ["ruby", "gold", "sky", "moss", "plum", "snow"].find((c) => c !== s.baseColor && c !== s.accentColor)!;
    expect(selectColor(s, outsider).currentColor).toBe(before);
    expect(selectColor(s, s.baseColor).currentColor).toBe(s.baseColor);
    expect(selectColor(s, s.accentColor).currentColor).toBe(s.accentColor);
  });
});

describe("undo / clear", () => {
  it("undo reverts the last paint", () => {
    let s = initialWeaveState();
    s = selectColor(s, "ruby");
    s = paintCell(s, 0, 0);
    expect(s.grid[0][0]).toBe("ruby");
    s = undo(s);
    expect(s.grid[0][0]).toBeNull();
  });

  it("undo with nothing to undo is a no-op", () => {
    const s = initialWeaveState();
    expect(undo(s)).toBe(s);
  });

  it("undo after several paints steps back one at a time", () => {
    let s = initialWeaveState();
    s = selectColor(s, "moss");
    s = paintCell(s, 0, 0);
    s = paintCell(s, 0, 1);
    s = paintCell(s, 0, 2);
    s = undo(s);
    expect(s.grid[0][2]).toBeNull();
    expect(s.grid[0][1]).toBe("moss");
    s = undo(s);
    expect(s.grid[0][1]).toBeNull();
    expect(s.grid[0][0]).toBe("moss");
  });

  it("clearGrid empties everything and is itself undoable", () => {
    let s = initialWeaveState();
    s = selectColor(s, "gold");
    s = paintRow(s, 0);
    s = clearGrid(s);
    expect(s.grid.every((row) => row.every((c) => c === null))).toBe(true);
    s = undo(s);
    expect(s.grid[0].every((c) => c === "gold")).toBe(true);
  });

  it("clearGrid on an already-empty grid is a no-op", () => {
    const s = initialWeaveState();
    expect(clearGrid(s)).toBe(s);
  });
});

describe("pattern matching / scoring", () => {
  it("a perfectly woven stripes pattern scores 1 and matches", () => {
    let s = startPattern(initialWeaveState(), "stripes");
    const pattern = PATTERNS.find((p) => p.id === "stripes")!;
    for (let r = 0; r < s.rows; r++) {
      s = selectColor(s, pattern.template(0, r) ? s.accentColor : s.baseColor);
      s = paintRow(s, r);
    }
    const score = matchScore(s.grid, pattern, s.accentColor);
    expect(score).toBeCloseTo(1, 5);
    const finished = finishWeave(s);
    expect(finished.done).toBe(true);
    expect(finished.lastResult?.isMatch).toBe(true);
  });

  it("an empty grid scores low against a dense pattern (no harsh failure state, just no star)", () => {
    const s = startPattern(initialWeaveState(), "checks");
    const pattern = PATTERNS.find((p) => p.id === "checks")!;
    const score = matchScore(s.grid, pattern, s.accentColor);
    expect(score).toBeLessThan(MATCH_THRESHOLD);
    const finished = finishWeave(s);
    expect(finished.lastResult?.isMatch).toBe(false);
  });

  it("free design always finishes as a celebrated match, never graded", () => {
    let s = startFree(initialWeaveState());
    s = selectColor(s, "plum");
    s = paintCell(s, 0, 0);
    const finished = finishWeave(s);
    expect(finished.lastResult).toEqual({ isMatch: true, score: 1 });
  });

  it("every registered pattern has both true and false cells somewhere in the grid", () => {
    for (const pattern of PATTERNS) {
      let hasTrue = false;
      let hasFalse = false;
      for (let r = 0; r < GRID_ROWS && !(hasTrue && hasFalse); r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          if (pattern.template(c, r)) hasTrue = true;
          else hasFalse = true;
        }
      }
      expect(hasTrue).toBe(true);
      expect(hasFalse).toBe(true);
    }
  });
});

describe("gallery cap", () => {
  it("keeps newest-first order", () => {
    const e1 = makeGalleryEntry(startFree(initialWeaveState()), 1);
    const e2 = makeGalleryEntry(startFree(initialWeaveState()), 2);
    const gallery = addToGallery(addToGallery([], e1), e2);
    expect(gallery[0]).toBe(e2);
    expect(gallery[1]).toBe(e1);
  });

  it("never grows past GALLERY_CAP", () => {
    let gallery: GalleryEntry[] = [];
    for (let i = 0; i < GALLERY_CAP + 7; i++) {
      gallery = addToGallery(gallery, makeGalleryEntry(startFree(initialWeaveState()), i));
    }
    expect(gallery.length).toBe(GALLERY_CAP);
    // the most recent entries win, oldest fall off the back
    expect(gallery[0].createdAt).toBe(GALLERY_CAP + 6);
  });

  it("round-trips through encodeGrid/decodeGrid", () => {
    let s = initialWeaveState();
    s = selectColor(s, "ruby");
    s = paintCell(s, 1, 1);
    s = selectColor(s, "sky");
    s = paintCell(s, 2, 5);
    const flat = encodeGrid(s.grid);
    const back = decodeGrid(flat, s.cols, s.rows);
    expect(back).toEqual(s.grid);
  });
});
