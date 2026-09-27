import { describe, expect, it } from "vitest";
import { canPlace, cellCenter, isUnlocked, levelFor, refundFor, worldToCell, DREAM_ZONE, type Placed } from "./rules";
import { PIECES, getPiece } from "../registry/pieces";

describe("dream park builder rules", () => {
  it("every piece has a sane footprint, cost and a unique id", () => {
    const ids = new Set<string>();
    for (const p of PIECES) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(p.w).toBeGreaterThan(0);
      expect(p.d).toBeGreaterThan(0);
      expect(p.cost).toBeGreaterThan(0);
    }
  });

  it("allows placement on empty lawn and blocks overlaps", () => {
    const layout: Placed[] = [];
    expect(canPlace(layout, "donut", 2, 2, 0)).toEqual({ ok: true });
    layout.push({ uid: "a", piece: "donut", gx: 2, gz: 2, r: 0 });
    expect(canPlace(layout, "lollipop", 3, 3, 0)).toEqual({ ok: false, reason: "overlap" });
    expect(canPlace(layout, "lollipop", 4, 2, 0)).toEqual({ ok: true });
  });

  it("ignores the piece being moved when checking its new spot", () => {
    const layout: Placed[] = [{ uid: "a", piece: "donut", gx: 2, gz: 2, r: 0 }];
    expect(canPlace(layout, "donut", 3, 2, 0, "a")).toEqual({ ok: true });
  });

  it("keeps pieces inside the fenced zone, including rotated footprints", () => {
    expect(canPlace([], "lollipop", -1, 0, 0).ok).toBe(false);
    expect(canPlace([], "lollipop", DREAM_ZONE.cols, 0, 0).ok).toBe(false);
    // cart is 1x2; rotated it's 2x1 and must still fit at the last column
    expect(canPlace([], "cart", DREAM_ZONE.cols - 1, 0, 1).ok).toBe(false);
    expect(canPlace([], "cart", DREAM_ZONE.cols - 1, 0, 0).ok).toBe(true);
  });

  it("rejects unknown pieces", () => {
    expect(canPlace([], "nope", 0, 0, 0)).toEqual({ ok: false, reason: "unknown" });
  });

  it("world <-> cell round-trips", () => {
    for (const id of ["lollipop", "donut", "cart"]) {
      for (const r of [0, 1]) {
        const c = cellCenter(id, 5, 7, r);
        expect(worldToCell(id, c.x, c.z, r)).toEqual({ gx: 5, gz: 7 });
      }
    }
  });

  it("levels and unlocks follow lifetime stars and streak", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(150)).toBe(2);
    expect(levelFor(5000)).toBe(5);
    const station = getPiece("station")!;
    expect(isUnlocked(station, 4, 5)).toBe(true);
    expect(isUnlocked(station, 4, 2)).toBe(false);
    expect(isUnlocked(getPiece("lollipop")!, 1, 0)).toBe(true);
  });

  it("refunds half (rounded down)", () => {
    expect(refundFor("station")).toBe(7);
    expect(refundFor("lollipop")).toBe(0);
  });
});
