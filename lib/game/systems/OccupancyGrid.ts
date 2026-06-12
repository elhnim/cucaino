/**
 * A coarse collision grid for laying out the town. Roads, the plaza, plots and
 * landmarks are stamped as "occupied"; buildings/props/scenery are only placed
 * where their whole footprint is free, then stamped — so nothing overlaps a road
 * or another object. The grid is invisible; it only governs placement.
 */
export class OccupancyGrid {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  private occ: Uint8Array;

  constructor(width: number, height: number, cell = 64) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(height / cell);
    this.occ = new Uint8Array(this.cols * this.rows);
  }

  private bounds(x: number, y: number, w: number, h: number) {
    return {
      c0: Math.floor((x - w / 2) / this.cell),
      c1: Math.floor((x + w / 2) / this.cell),
      r0: Math.floor((y - h / 2) / this.cell),
      r1: Math.floor((y + h / 2) / this.cell),
    };
  }

  markRect(x: number, y: number, w: number, h: number) {
    const { c0, c1, r0, r1 } = this.bounds(x, y, w, h);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if (c >= 0 && c < this.cols && r >= 0 && r < this.rows) this.occ[r * this.cols + c] = 1;
  }

  markCircle(x: number, y: number, rad: number) {
    const c0 = Math.floor((x - rad) / this.cell), c1 = Math.floor((x + rad) / this.cell);
    const r0 = Math.floor((y - rad) / this.cell), r1 = Math.floor((y + rad) / this.cell);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) continue;
        const cx = (c + 0.5) * this.cell, cy = (r + 0.5) * this.cell;
        if (Math.hypot(cx - x, cy - y) <= rad) this.occ[r * this.cols + c] = 1;
      }
  }

  /** stamp a poly-line (road) with a given half-width */
  markPath(points: [number, number][], halfWidth: number) {
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1], [bx, by] = points[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (this.cell / 2)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        this.markCircle(ax + (bx - ax) * t, ay + (by - ay) * t, halfWidth);
      }
    }
  }

  isFree(x: number, y: number, w: number, h: number) {
    const { c0, c1, r0, r1 } = this.bounds(x, y, w, h);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return false;
        if (this.occ[r * this.cols + c]) return false;
      }
    return true;
  }
}
