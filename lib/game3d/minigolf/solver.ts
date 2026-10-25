// A brute-force "robot golfer" used by the tests to prove every hole can be sunk, and to sanity
// check pars. Beam search over putts (angle x power), ranking where the ball stops by walking
// distance to the cup over the green (a flood fill that respects walls, water and portals).
import type { HoleDef, Vec2 } from "./courses";
import { inZone, pointInPolygon, shoot, staticWalls, stepBall, type BallState } from "./physics";

const CELL = 0.25;

function segCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** Walking distance from every cell of the green to the cup. */
export function distanceField(hole: HoleDef) {
  const xs = hole.outline.map((p) => p.x);
  const zs = hole.outline.map((p) => p.z);
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const w = Math.ceil((Math.max(...xs) - minX) / CELL) + 1;
  const h = Math.ceil((Math.max(...zs) - minZ) / CELL) + 1;
  const walls = staticWalls(hole);
  const center = (i: number, j: number): Vec2 => ({ x: minX + i * CELL, z: minZ + j * CELL });
  const ok = (p: Vec2) => pointInPolygon(p, hole.outline) && !(hole.water ?? []).some((z) => inZone(p, z));
  const dist = new Float32Array(w * h).fill(Infinity);
  const idx = (p: Vec2) => {
    const i = Math.round((p.x - minX) / CELL);
    const j = Math.round((p.z - minZ) / CELL);
    return i >= 0 && j >= 0 && i < w && j < h ? j * w + i : -1;
  };
  // Dijkstra-lite (BFS with sqrt(2) diagonals, good enough for ranking)
  const start = idx(hole.cup);
  const queue: number[] = [start];
  dist[start] = 0;
  const portalsTo = (hole.portals ?? []).map((pt) => ({ from: idx(pt.from), to: idx(pt.to) }));
  while (queue.length) {
    queue.sort((a, b) => dist[a] - dist[b]);
    const cur = queue.shift()!;
    const ci = cur % w;
    const cj = Math.floor(cur / w);
    const cp = center(ci, cj);
    const next: [number, number][] = [];
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const np = center(ni, nj);
        if (!ok(np) || walls.some(([a, b]) => segCross(cp, np, a, b))) continue;
        next.push([nj * w + ni, Math.hypot(di, dj) * CELL]);
      }
    // reverse portal edge: standing at a portal's mouth is as good as standing at its exit
    for (const pt of portalsTo) if (pt.to === cur && pt.from >= 0) next.push([pt.from, 0]);
    for (const [n, c] of next) {
      if (dist[cur] + c < dist[n]) {
        if (dist[n] === Infinity) queue.push(n);
        dist[n] = dist[cur] + c;
      }
    }
  }
  return (p: Vec2) => {
    const k = idx(p);
    return k < 0 ? Infinity : dist[k];
  };
}

export interface SolveResult {
  /** fewest strokes the robot found, or null if it couldn't sink it within the limit */
  strokes: number | null;
  /** what the robot's best first putt looked like */
  shots: number;
}

/** Simulate one putt to rest. t0 staggers moving obstacles between shots. */
export function playShot(hole: HoleDef, from: Vec2, angle: number, power: number, t0: number) {
  const b: BallState = { x: from.x, z: from.z, vx: 0, vz: 0 };
  shoot(b, Math.sin(angle), -Math.cos(angle), power);
  let t = t0;
  for (let f = 0; f < 30 * 14; f++) {
    const r = stepBall(b, hole, 1 / 30, t);
    t += 1 / 30;
    if (r.sunk) return { sunk: true, splash: false, at: { x: b.x, z: b.z } };
    if (r.splash) return { sunk: false, splash: true, at: from };
    if (!r.moving) break;
  }
  return { sunk: false, splash: false, at: { x: b.x, z: b.z } };
}

export function solveHole(hole: HoleDef, maxStrokes: number, opts: { angles?: number; powers?: number[]; beam?: number } = {}): SolveResult {
  const angles = opts.angles ?? 48;
  const powers = opts.powers ?? [0.1, 0.18, 0.28, 0.4, 0.55, 0.72, 0.88, 1];
  const beam = opts.beam ?? 6;
  const field = distanceField(hole);
  let states: Vec2[] = [hole.tee];
  let shots = 0;
  for (let stroke = 1; stroke <= maxStrokes; stroke++) {
    const found: { at: Vec2; d: number }[] = [];
    for (const s of states) {
      for (let a = 0; a < angles; a++) {
        for (const p of powers) {
          shots++;
          const r = playShot(hole, s, (a / angles) * Math.PI * 2, p, stroke * 2.3);
          if (r.sunk) return { strokes: stroke, shots };
          if (!r.splash) found.push({ at: r.at, d: field(r.at) });
        }
      }
    }
    // keep the best few, spread out (one per 0.75 cell) so the beam doesn't collapse
    found.sort((x, y) => x.d - y.d);
    const next: Vec2[] = [];
    const seen = new Set<string>();
    for (const f of found) {
      const key = `${Math.round(f.at.x / 0.75)},${Math.round(f.at.z / 0.75)}`;
      if (seen.has(key) || !Number.isFinite(f.d)) continue;
      seen.add(key);
      next.push(f.at);
      if (next.length >= beam) break;
    }
    states = next;
    if (!states.length) break;
  }
  return { strokes: null, shots };
}
