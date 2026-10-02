import { describe, expect, it } from "vitest";
import { groundY } from "../../registry/terrain";
import { TRAIL_POINTS } from "../../registry/island";
import { thicketSdf, trailDistance, underCanopy } from "../../registry/jungle";
import { FALLS, waterSdf } from "../../registry/waterways";
import { TREE_DIMS, T_CANOPY, T_GIANT, U, planJungle } from "./plan";
import { M_PEEK, M_SIT, planMonkeys, stepMonkeys } from "./monkeys";
import { planJungleBirds, stepJungleBirds } from "./birds";

const plan = planJungle({});
const low = planJungle({ lowQuality: true });

describe("the rainforest plan", { timeout: 60000 }, () => {
  it("is true size: giants 35-41 m, the canopy roof 26-32 m, trunks metres across", () => {
    expect(TREE_DIMS[T_GIANT].h / U).toBeGreaterThan(35);
    expect(TREE_DIMS[T_GIANT].h / U).toBeLessThan(41);
    expect(TREE_DIMS[T_CANOPY].h / U).toBeGreaterThan(25);
    expect(TREE_DIMS[T_CANOPY].h / U).toBeLessThan(33);
    for (const t of plan.trees.filter((q) => q.type <= T_CANOPY)) {
      // the kid (2.26 units) walks under crowns 15+ m up
      expect(t.crownY - t.crownR * 0.6, `crown underside ${t.x.toFixed(0)}`).toBeGreaterThan(15 * U);
      expect(t.trunkR * 2).toBeGreaterThan(1.6);
    }
  });

  it("grows under the canopy only, never on a trail, in the water or on a bridge", () => {
    expect(plan.trees.filter((t) => t.type === T_GIANT).length).toBeGreaterThanOrEqual(4);
    expect(plan.trees.filter((t) => t.type === T_CANOPY).length).toBeGreaterThanOrEqual(10);
    for (const t of plan.trees) {
      const at = `${t.type} @ ${t.x.toFixed(1)},${t.z.toFixed(1)}`;
      expect(underCanopy(t.x, t.z), at).toBe(true);
      expect(trailDistance(t.x, t.z, 12), at).toBeGreaterThan(t.trunkR + 2.4);
      expect(waterSdf(t.x, t.z), at).toBeGreaterThan(t.trunkR);
      expect(t.y).toBeCloseTo(groundY(t.x, t.z), 3);
    }
    // the undergrowth fills the thicket (never the walkable trails)
    expect(plan.clumps.length).toBeGreaterThan(250);
    for (const c of plan.clumps) expect(thicketSdf(c.x, c.z)).toBeLessThan(0);
    // (low quality: about half)
    expect(low.clumps.length).toBeLessThan(plan.clumps.length * 0.75);
    expect(low.trees.length).toBeLessThan(plan.trees.length);
  });

  it("closes the canopy over most of the forest, with sunbeams in its gaps over the trails", () => {
    const big = plan.trees.filter((t) => t.type <= T_CANOPY);
    let n = 0;
    let covered = 0;
    for (let z = -160; z < 160; z += 2)
      for (let x = -160; x < 160; x += 2) {
        // (the open sky over the plunge pool, in front of the falls, is meant to be open)
        if (!underCanopy(x, z) || Math.hypot(x - FALLS.lip.x, z - FALLS.lip.z) < 22) continue;
        n++;
        if (big.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < (t.crownR * 1.3) ** 2)) covered++;
      }
    expect(covered / n).toBeGreaterThan(0.85);
    expect(plan.shafts.length).toBeGreaterThan(5);
    const trailPts = TRAIL_POINTS.flat();
    for (const s of plan.shafts) expect(trailPts.some(([x, z]) => Math.hypot(x - s.x, z - s.z) < 9)).toBe(true);
  });
});

describe("monkeys", { timeout: 60000 }, () => {
  it("stay up in the trees all day — running, swinging, leaping, peeking down at a kid on the trail", () => {
    const W = planMonkeys(plan, {});
    expect(W.monkeys.length).toBeGreaterThanOrEqual(8);
    // the kid walks the jungle-falls trail and back
    const trail = TRAIL_POINTS.flat().filter(([x, z]) => underCanopy(x, z));
    const modes = new Set<number>();
    let peeks = 0;
    let near = 0;
    const dt = 1 / 15;
    for (let i = 0; i < 15 * 240; i++) {
      const t = i * dt;
      const [kx, kz] = trail[Math.floor(i / 40) % trail.length];
      stepMonkeys(W, dt, t, kx, groundY(kx, kz), kz, true);
      for (const m of W.monkeys) {
        modes.add(m.mode);
        const g = groundY(m.x, m.z);
        const at = `monkey @ ${m.x.toFixed(1)},${m.y.toFixed(1)},${m.z.toFixed(1)} mode ${m.mode} t ${t.toFixed(1)}`;
        // never down on the forest floor (~4.5 m up at the very lowest, hanging by the tail)
        expect(m.y - g, at).toBeGreaterThan(4.4 * U);
        // in a tree, or on the way between two linked perches (in the air mid-swing)
        const a = plan.perches[m.from];
        const b = plan.perches[m.to];
        const ex = b.x - a.x;
        const ez = b.z - a.z;
        const u = Math.max(0, Math.min(1, ((m.x - a.x) * ex + (m.z - a.z) * ez) / (ex * ex + ez * ez || 1)));
        expect(Math.hypot(a.x + ex * u - m.x, a.z + ez * u - m.z), at).toBeLessThan(0.6);
        const crowns = plan.trees.filter((tr) => tr.type <= T_CANOPY);
        expect(crowns.some((tr) => Math.hypot(tr.x - m.x, tr.z - m.z) < tr.crownR * 1.6), at).toBe(true);
        if (m.mode === M_PEEK && m.drop > 0.8) peeks++;
        if (Math.hypot(m.x - kx, m.z - kz) < 14) near++;
      }
    }
    expect(modes.has(M_SIT)).toBe(true);
    expect(modes.size).toBeGreaterThanOrEqual(4);
    // they come to the kid, and peek
    expect(near).toBeGreaterThan(200);
    expect(peeks).toBeGreaterThan(0);
  });
});

describe("jungle birds", { timeout: 60000 }, () => {
  it("fly between the crowns, perch, flit in the sunbeams, and burst out of the canopy as the kid walks by", () => {
    const W = planJungleBirds(plan, {});
    expect(W.birds.length).toBeGreaterThan(20);
    expect(W.flockTree).toBeGreaterThanOrEqual(0);
    const ft = plan.trees[W.flockTree];
    const dt = 1 / 15;
    let burst = false;
    let flying = 0;
    for (let i = 0; i < 15 * 60; i++) {
      const t = i * dt;
      // the kid walks up under the flock's tree after 20 s
      const kx = t > 20 ? ft.x : ft.x + 60;
      stepJungleBirds(W, dt, t, kx, ft.z, true);
      if (W.flockAway > 0) burst = true;
      for (const b of W.birds) {
        expect(Number.isFinite(b.x + b.y + b.z)).toBe(true);
        // never in the ground
        expect(b.y, `${b.kind} @ ${b.x.toFixed(0)},${b.z.toFixed(0)}`).toBeGreaterThan(groundY(b.x, b.z) + 1.5);
        if (b.st === 1) flying++;
      }
    }
    expect(burst).toBe(true);
    expect(flying).toBeGreaterThan(100);
  });
});
