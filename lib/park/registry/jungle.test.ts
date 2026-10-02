import { describe, expect, it } from "vitest";
import { PLACES } from "./places";
import { TRAILS, TRAIL_POINTS, routeBetween } from "./island";
import { WATER_Y } from "./terrain";
import { worldFloorY } from "./harbours";
import { waterSdf } from "./waterways";
import { FALLS_CLEARING, TG_HALF, TG_N, TRAIL_CLEAR, findWalkPath, inJungle, pushOutOfThicket, thicketAt, thicketGrid, thicketSdf, underCanopy, walkClear } from "./jungle";

/** the engine's swim threshold: deeper than this you're swimming, not walking */
const SWIM_DEPTH = 0.9;

function trailDist(x: number, z: number): number {
  let best = Infinity;
  for (const pts of TRAIL_POINTS)
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i];
      const ex = pts[i + 1][0] - ax;
      const ez = pts[i + 1][1] - az;
      const u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
      best = Math.min(best, Math.hypot(ax + ex * u - x, az + ez * u - z));
    }
  return best;
}

describe("the rainforest and its thicket", { timeout: 60000 }, () => {
  it("is a real forest: a big patch of the island under the canopy", () => {
    const g = thicketGrid();
    let canopy = 0;
    let blocked = 0;
    for (let k = 0; k < g.canopy.length; k++) {
      canopy += g.canopy[k];
      blocked += g.blocked[k];
    }
    // (1 cell = 1 unit²; 1 m² = 2.56 units²)
    expect(canopy / 2.56).toBeGreaterThan(1500);
    expect(blocked).toBeGreaterThan(canopy * 0.6);
  });

  it("blocks the ground between the trails, but never a trail, the water or the falls clearing", () => {
    let checked = 0;
    for (let zz = -150; zz <= 150; zz += 2)
      for (let xx = -150; xx <= 150; xx += 2) {
        // (cell centres: the grid is 1 unit)
        const x = xx + 0.5;
        const z = zz + 0.5;
        if (!underCanopy(x, z)) continue;
        const td = trailDist(x, z);
        const at = `${x.toFixed(1)},${z.toFixed(1)}`;
        if (td < TRAIL_CLEAR - 1) expect(thicketAt(x, z), `trail ${at}`).toBe(false);
        if (waterSdf(x, z) < -0.5) expect(thicketAt(x, z), `water ${at}`).toBe(false);
        if (Math.hypot(x - FALLS_CLEARING.x, z - FALLS_CLEARING.z) < FALLS_CLEARING.r - 1) expect(thicketAt(x, z), `clearing ${at}`).toBe(false);
        if (td > TRAIL_CLEAR + 1.5 && waterSdf(x, z) > 1.5 && inJungle(x, z, -3) && Math.hypot(x - FALLS_CLEARING.x, z - FALLS_CLEARING.z) > FALLS_CLEARING.r + 1) {
          expect(thicketAt(x, z), `off-trail ${at}`).toBe(true);
          checked++;
        }
      }
    expect(checked).toBeGreaterThan(300);
    // the jungle's own trails stay open end to end
    for (const t of TRAILS.filter((q) => q.id.startsWith("jungle") || q.id.startsWith("lake"))) {
      const pts = TRAIL_POINTS[TRAILS.indexOf(t)];
      for (const [x, z] of pts) expect(thicketSdf(x, z), `${t.id} ${x.toFixed(0)},${z.toFixed(0)}`).toBeGreaterThan(1);
    }
  });

  it("stops a kid walking into it and slides them smoothly along its edge", () => {
    // find an edge cell beside a jungle trail and walk diagonally into the thicket
    const pts = TRAIL_POINTS[TRAILS.findIndex((t) => t.id === "jungle-river")];
    let slid = 0;
    for (let i = 3; i < pts.length - 3; i += 3) {
      const [x, z] = pts[i];
      const [nx, nz] = pts[i + 1];
      const l = Math.hypot(nx - x, nz - z);
      const tx = (nx - x) / l;
      const tz = (nz - z) / l;
      // heading 45° off the trail, into the woods
      const dx = (tx - tz) / Math.SQRT2;
      const dz = (tz + tx) / Math.SQRT2;
      // (only where the woods really close in on that side)
      if (!thicketAt(x + dx * 5, z + dz * 5) || !thicketAt(x + dx * 8, z + dz * 8)) continue;
      const p = { x, z };
      let along = 0;
      for (let k = 0; k < 60; k++) {
        const bx = p.x;
        const bz = p.z;
        p.x += dx * 0.12;
        p.z += dz * 0.12;
        pushOutOfThicket(p, 0.55);
        along += (p.x - bx) * tx + (p.z - bz) * tz;
        expect(thicketSdf(p.x, p.z), `step ${k} @ ${i}`).toBeGreaterThan(0.3);
      }
      // it can't push off the trail into the trees ...
      expect(trailDist(p.x, p.z), `stopped @ ${i}`).toBeLessThan(TRAIL_CLEAR + 1);
      // ... but it keeps sliding along the edge
      if (along > 1.5) slid++;
    }
    expect(slid).toBeGreaterThan(3);
  });

  it("lets a kid reach every door on foot from the park gate (flood fill over walkable ground)", () => {
    const N = TG_N;
    const walk = new Uint8Array(N * N);
    const cx = (i: number) => -TG_HALF + i + 0.5;
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = cx(i);
        const z = cx(j);
        if (Math.hypot(x, z) > 158) continue;
        if (thicketAt(x, z)) continue;
        // on foot: no swimming (bridges and the jetty count as ground)
        if (WATER_Y - worldFloorY(x, z) > SWIM_DEPTH) continue;
        if (PLACES.some((p) => !p.sky && p.radius > 0 && Math.hypot(x - p.x, z - p.z) < p.radius)) continue;
        walk[j * N + i] = 1;
      }
    const seen = new Uint8Array(N * N);
    const gate = PLACES.find((p) => p.id === "gate")!;
    const start = Math.floor(gate.z - 4 + TG_HALF) * N + Math.floor(gate.x + TG_HALF);
    expect(walk[start]).toBe(1);
    const q = [start];
    seen[start] = 1;
    while (q.length) {
      const k = q.pop()!;
      const i = k % N;
      const j = (k - i) / N;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const v = jj * N + ii;
        if (walk[v] && !seen[v]) {
          seen[v] = 1;
          q.push(v);
        }
      }
    }
    for (const p of PLACES) {
      if (p.sky) continue;
      let ok = false;
      const R = Math.max(p.doorRadius, p.radius + 0.6);
      for (let dz = -R; dz <= R && !ok; dz += 0.5)
        for (let dx = -R; dx <= R && !ok; dx += 0.5) {
          if (dx * dx + dz * dz > R * R) continue;
          const i = Math.floor(p.x + dx + TG_HALF);
          const j = Math.floor(p.z + dz + TG_HALF);
          if (i >= 0 && j >= 0 && i < N && j < N && seen[j * N + i]) ok = true;
        }
      expect(ok, `${p.id}'s door`).toBe(true);
    }
    // and every trail (the falls viewpoint, the jungle loop, the lake shore) is reachable too
    for (const pts of TRAIL_POINTS)
      for (const [x, z] of pts.filter((_, i) => i % 4 === 0)) {
        if (WATER_Y - worldFloorY(x, z) > SWIM_DEPTH) continue;
        const k = Math.floor(z + TG_HALF) * N + Math.floor(x + TG_HALF);
        expect(seen[k] === 1 || seen[k + 1] === 1 || seen[k + N] === 1, `trail ${x.toFixed(0)},${z.toFixed(0)}`).toBe(true);
      }
  });

  it("routes a tap-to-walk round the thicket along the trails", () => {
    // from the loop end of the falls trail to the falls viewpoint: straight through is all thicket
    const pts = TRAIL_POINTS[TRAILS.findIndex((t) => t.id === "jungle-river")];
    const [fx, fz] = pts[0];
    const [tx, tz] = pts[pts.length - 1];
    expect(walkClear(fx, fz, tx, tz)).toBe(false);
    const path = findWalkPath(fx, fz, tx, tz)!;
    expect(path).not.toBeNull();
    expect(path.length).toBeGreaterThanOrEqual(2);
    let px = fx;
    let pz = fz;
    for (const [x, z] of path) {
      expect(walkClear(px, pz, x, z, 0.3), `leg to ${x.toFixed(0)},${z.toFixed(0)}`).toBe(true);
      px = x;
      pz = z;
    }
    expect(Math.hypot(px - tx, pz - tz)).toBeLessThan(1.5);
    // open meadow: just walk straight there
    expect(findWalkPath(0, 20, 10, 30)).toEqual([[10, 30]]);
    // tapping deep in the thicket walks you to the nearest open ground instead
    const deep = findWalkPath(-41, 30, -118, 80);
    expect(deep).not.toBeNull();
    const end = deep![deep!.length - 1];
    expect(thicketSdf(end[0], end[1])).toBeGreaterThan(0.4);
    // the map's trail routes still join up (the land hubs link the jungle and lake trails in)
    const r = routeBetween({ x: 0, z: 0 }, FALLS_CLEARING);
    expect(Math.hypot(r[r.length - 2][0] - FALLS_CLEARING.x, r[r.length - 2][1] - FALLS_CLEARING.z)).toBeLessThan(6);
    const lake = routeBetween({ x: 0, z: 0 }, { x: -40, z: 123 });
    expect(Math.hypot(lake[lake.length - 2][0] + 40, lake[lake.length - 2][1] - 123)).toBeLessThan(4);
  });
});
