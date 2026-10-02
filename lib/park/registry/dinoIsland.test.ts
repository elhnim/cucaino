import { describe, expect, it } from "vitest";
import {
  DINO_CALM_GLSL,
  DINO_DECKS,
  DINO_FENCE_E,
  DINO_FENCE_POSTS,
  DINO_GORGE,
  DINO_ICE_LINE,
  DINO_ISLAND,
  DINO_JEEPS,
  DINO_LAGOON,
  DINO_OBSTACLES,
  DINO_OUTLINE,
  DINO_PROPS,
  DINO_RIVER,
  DINO_SEA_PAD,
  DINO_SEA_R,
  DINO_SPECIES,
  DINO_SPOTS,
  DINO_SPOT_FACTS,
  DINO_TORCHES,
  DINO_TRAIL,
  DINO_TRAIL_HALF,
  DINO_TREES,
  DINO_VOLCANO,
  DINO_WATER_Y,
  DINO_ZONES,
  dinoCalm,
  dinoGorgeE,
  dinoGroundY,
  dinoHeightAt,
  dinoInLagoon,
  dinoLandY,
  dinoOutline,
  dinoSeaFloorY,
  dinoShoreDist,
  dinoSnow,
  dinoTrailDistance,
  dinoWaterAt,
} from "./dinoIsland";
import { DEEP_FLOOR, WATER_Y, WRAP_R, terrainCovers } from "./terrain";
import { seaDist } from "./island";
import { SKY_ISLANDS } from "./skyIslands";
import { ISLAND_R } from "./island";
import { VILLAGE_ISLAND, VILLAGE_SEA_R, villageGroundY, villageSeaFloorY } from "./villageIsland";
import { FROST_ISLAND, FROST_SEA_R, frostGroundY, frostSeaFloorY } from "./frostIsland";
import { ABYSS, abyssFloorY } from "./abyss";

const I = DINO_ISLAND;
const hyp = Math.hypot;
const segDist = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const ux = bx - ax;
  const uz = bz - az;
  const t = Math.min(1, Math.max(0, ((px - ax) * ux + (pz - az) * uz) / (ux * ux + uz * uz || 1)));
  return hyp(ax + ux * t - px, az + uz * t - pz);
};
const propAt = (o: { x: number; z: number }) => DINO_PROPS.find((p) => p.x === o.x && p.z === o.z)?.kind ?? DINO_TREES.find((p) => p.x === o.x && p.z === o.z)?.kind ?? "(fence/rail)";
/** the island's whole footprint (where its slopes reach the deep floor), and its coast */
const FOOT = dinoOutline(DINO_SEA_PAD, 240);
const COAST = dinoOutline(0, 240);
/** the old Dino Isle, for comparison (a disc of radius 86 m) */
const OLD_LAND = Math.PI * 86 * 86;

describe("Dino Isle (the Lost World island)", () => {
  it("shares the sea level and deep floor with the terrain", () => {
    expect(DINO_WATER_Y).toBe(WATER_Y);
    for (const p of dinoOutline(DINO_SEA_PAD - 1, 48)) expect(dinoHeightAt(p.x, p.z)).toBeLessThan(DEEP_FLOOR + 0.5);
  });

  it("is 2.5–4x the old island's land, long and wild (a land bridge to its Ice Age valley)", () => {
    let land = 0;
    const step = 2;
    for (let x = I.x - 180; x < I.x + 180; x += step) for (let z = I.z - 300; z < I.z + 280; z += step) if (dinoShoreDist(x, z) < 0) land += step * step;
    expect(land / OLD_LAND).toBeGreaterThan(2.5);
    expect(land / OLD_LAND).toBeLessThan(4);
    // ~350 m end to end
    let zMin = Infinity;
    let zMax = -Infinity;
    for (const p of COAST) {
      zMin = Math.min(zMin, p.z);
      zMax = Math.max(zMax, p.z);
    }
    expect((zMax - zMin) / 1.6).toBeGreaterThan(280);
    // the land bridge: narrow, with sea on both sides
    const zb = DINO_ICE_LINE;
    let w = 0;
    for (let x = I.x - 100; x < I.x + 100; x += 0.5) if (dinoShoreDist(x, zb) < 0) w += 0.5;
    expect(w).toBeGreaterThan(14);
    expect(w).toBeLessThan(60);
  });

  it("sits in open ocean: clear of the main island, Coralcove, Frostpeak, the Midnight Rift, the sky islands and the world wrap", () => {
    for (const p of FOOT) {
      const d = hyp(p.x, p.z);
      // (its slopes stay off the main island's own ground — its land and reef — and its coast)
      expect(terrainCovers(p.x, p.z), "the main island's ground").toBe(false);
      expect(seaDist(p.x, p.z), "the main island's coast").toBeGreaterThan(120);
      expect(d, "the main island").toBeGreaterThan(ISLAND_R + 80);
      expect(d, "the world wrap").toBeLessThan(WRAP_R - 60);
      expect(hyp(VILLAGE_ISLAND.x - p.x, VILLAGE_ISLAND.z - p.z), "Coralcove").toBeGreaterThan(VILLAGE_SEA_R + 60);
      expect(hyp(FROST_ISLAND.x - p.x, FROST_ISLAND.z - p.z), "Frostpeak").toBeGreaterThan(FROST_SEA_R + 60);
      for (const q of ABYSS.path) expect(hyp(q.x - p.x, q.z - p.z), "the Midnight Rift").toBeGreaterThan(ABYSS.width / 2 + 40);
    }
    for (const s of SKY_ISLANDS) for (const p of FOOT) expect(hyp(s.x - p.x, s.z - p.z), s.id).toBeGreaterThan(s.r + 10);
    // (and nobody claims anybody else's water)
    for (const [x, z] of [
      [I.x, I.z],
      [I.x, I.z - 210],
      [I.x + 20, I.z + 170],
    ]) {
      expect(villageGroundY(x, z)).toBeNull();
      expect(villageSeaFloorY(x, z)).toBeNull();
      expect(frostGroundY(x, z)).toBeNull();
      expect(frostSeaFloorY(x, z)).toBeNull();
      expect(abyssFloorY(x, z)).toBeNull();
    }
    for (const o of [VILLAGE_ISLAND, FROST_ISLAND, { x: 0, z: 0 }]) {
      expect(dinoGroundY(o.x, o.z)).toBeNull();
      expect(dinoSeaFloorY(o.x, o.z)).toBeNull();
    }
    expect(DINO_SEA_R).toBeGreaterThan(200);
  });

  it("has land above the sea inside the coast and a shallow reef ring round the beach", () => {
    const rings = [-14, 5, 12, 20, 38].map((l) => dinoOutline(l, 96));
    for (let k = 0; k < 96; k++) {
      const [inl, a, b, c, out] = rings.map((r) => r[k]);
      expect(dinoGroundY(inl.x, inl.z), `inland ${k}`).not.toBeNull();
      // (but where the river runs out to sea)
      if (!DINO_RIVER.some((q) => hyp(q.x - inl.x, q.z - inl.z) < q.half + 12)) expect(dinoGroundY(inl.x, inl.z)!, `inland ${k}`).toBeGreaterThan(0.9);
      for (const p of [a, b, c]) {
        const f = dinoSeaFloorY(p.x, p.z)!;
        expect(f, `reef ${k}`).toBeLessThan(WATER_Y);
        expect(f, `reef ${k}`).toBeGreaterThan(-4.8);
      }
      expect(dinoSeaFloorY(out.x, out.z)!).toBeLessThan(-12);
      if (!DINO_DECKS.some((d) => segDist(a.x, a.z, d.ax, d.az, d.bx, d.bz) < (d.r ?? d.half) + 0.1)) expect(dinoGroundY(a.x, a.z)).toBeNull();
    }
    for (const p of dinoOutline(DINO_SEA_PAD + 6, 48)) expect(dinoSeaFloorY(p.x, p.z)).toBeNull();
  });

  it("the sea floor is continuous from the land out to the deep", () => {
    // (every half metre out along 120 rays, from inland to the edge of the shelf: never a step of 3 m or more)
    const rings: { x: number; z: number }[][] = [];
    for (let s = -8; s <= DINO_SEA_PAD - 1; s += 0.5) rings.push(dinoOutline(s, 120));
    for (let k = 0; k < 120; k++)
      for (let i = 1; i < rings.length; i++) {
        const p = rings[i][k];
        const q = rings[i - 1][k];
        const fp = dinoSeaFloorY(p.x, p.z);
        const fq = dinoSeaFloorY(q.x, q.z);
        expect(fp, `${k} @ ${i}`).not.toBeNull();
        expect(Math.abs(fp! - fq!), `${k} @ ${i}`).toBeLessThan(3.0);
      }
  });

  it("has warm dinosaur country in the south and middle, a snowy Ice Age valley over the land bridge in the north", () => {
    const ice = DINO_ZONES.filter((z) => z.realm === "ice" && z.id !== "bridge");
    for (const z of ice) expect(dinoSnow(z.x, z.z), z.id).toBeGreaterThan(0.6);
    for (const z of DINO_ZONES.filter((q) => q.realm === "dino")) expect(dinoSnow(z.x, z.z), z.id).toBeLessThan(0.05);
    expect(dinoSnow(DINO_GORGE.x, DINO_GORGE.z)).toBe(0);
    expect(dinoSnow(DINO_VOLCANO.x, DINO_VOLCANO.z)).toBe(0);
    expect(dinoSnow(DINO_LAGOON.x, DINO_LAGOON.z)).toBeLessThan(0.1);
    // the volcano stands tall with a crater; its lava lake is an obstacle
    expect(DINO_VOLCANO.rimY).toBeGreaterThan(30);
    expect(DINO_VOLCANO.lavaY).toBeLessThan(DINO_VOLCANO.rimY);
    expect(DINO_OBSTACLES.some((o) => hyp(o.x - DINO_VOLCANO.x, o.z - DINO_VOLCANO.z) < 0.5 && o.r >= DINO_VOLCANO.lavaR)).toBe(true);
  });

  it("the T-rex's valley is walled and fenced: a deep floor, sheer walls, a closed rim fence (the Rex Bridge's railings span its one gap)", () => {
    const G = DINO_GORGE;
    expect(G.rimY - G.floorY).toBeGreaterThan(10);
    expect(dinoLandY(G.x, G.z)!).toBeLessThan(G.floorY + 1);
    // (big enough for a 12 m T-rex to roam: ~37 m x 72 m)
    expect(G.rx * 2).toBeGreaterThan(55);
    expect(G.rz * 2).toBeGreaterThan(110);
    // every gap between rim posts is too narrow for a kid — except where the bridge's railed deck crosses
    const P = DINO_FENCE_POSTS;
    const bridge = DINO_DECKS.filter((d) => d.id.startsWith("rexbridge"));
    let gaps = 0;
    for (let i = 0; i < P.length; i++) {
      const q = P[(i + 1) % P.length];
      const d = hyp(P[i].x - q.x, P[i].z - q.z);
      if (d < 0.72 * 2) continue;
      gaps++;
      // (the gap is spanned by the bridge — its midpoint is on the deck — or by the north overlook's railed deck)
      const mx = (P[i].x + q.x) / 2;
      const mz = (P[i].z + q.z) / 2;
      const ov = DINO_DECKS.find((d) => d.id === "rex-north")!;
      expect(bridge.some((b) => segDist(mx, mz, b.ax, b.az, b.bx, b.bz) < b.half + 0.1) || hyp(mx - ov.ax, mz - ov.az) < ov.r! + 1.5, `fence gap @ ${(mx - I.x).toFixed(0)},${(mz - I.z).toFixed(0)}`).toBe(true);
    }
    expect(gaps).toBe(3);
    // (the overlook's own rail closes its gap: on the valley side, no way past it)
    const ov = DINO_DECKS.find((d) => d.id === "rex-north")!;
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const x = ov.ax + Math.sin(a) * (ov.r! + 0.35);
      const z = ov.az + Math.cos(a) * (ov.r! + 0.35);
      if (dinoGorgeE(x, z) < DINO_FENCE_E) expect(DINO_OBSTACLES.some((o) => hyp(o.x - x, o.z - z) < o.r), `overlook rail @ ${a.toFixed(2)}`).toBe(true);
    }
    // the bridge's railings: nobody steps off it into the valley (a point just past the rail is blocked)
    for (const b of bridge) {
      const L = hyp(b.bx - b.ax, b.bz - b.az);
      const ux = (b.bx - b.ax) / L;
      const uz = (b.bz - b.az) / L;
      for (let u = 2; u < L - 2; u += 0.35)
        for (const s of [-1, 1]) {
          const x = b.ax + ux * u + uz * s * (b.half + 0.4);
          const z = b.az + uz * u - ux * s * (b.half + 0.4);
          expect(DINO_OBSTACLES.some((o) => hyp(o.x - x, o.z - z) < o.r), `${b.id} rail @ ${u.toFixed(1)}`).toBe(true);
        }
    }
    // no walkable ground inside the fence but the valley floor itself (which nobody can reach on foot)
    for (const p of P) expect(dinoGorgeE(p.x, p.z)).toBeCloseTo(DINO_FENCE_E, 1);
  });

  it("the lagoon is knee-deep and walkable, with dry banks (but for the river's outflow)", () => {
    const L = DINO_LAGOON;
    expect(dinoInLagoon(L.x, L.z)).toBe(true);
    const g = dinoGroundY(L.x, L.z)!;
    expect(L.waterY - g).toBeGreaterThan(0.3);
    expect(L.waterY - g).toBeLessThan(0.8);
    expect(dinoWaterAt(L.x, L.z)).toBe(L.waterY);
    let dry = 0;
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      const c = Math.cos(L.rot);
      const s = Math.sin(L.rot);
      const u = Math.sin(a) * L.rx * 1.5;
      const v = Math.cos(a) * L.rz * 1.5;
      if ((dinoLandY(L.x + u * c + v * s, L.z - u * s + v * c) ?? 0) > L.waterY + 0.1) dry++;
    }
    expect(dry).toBeGreaterThanOrEqual(26);
  });

  it("decks are walkable at their own height, and the jetty reaches out over the sea towards the main island", () => {
    for (const d of DINO_DECKS) {
      const mx = (d.ax + d.bx) / 2;
      const mz = (d.az + d.bz) / 2;
      const y = dinoGroundY(mx, mz)!;
      expect(y, d.id).not.toBeNull();
      expect(y, d.id).toBeGreaterThan(0.7);
    }
    const jetty = DINO_DECKS.find((d) => d.id === "jetty")!;
    expect(dinoLandY(jetty.bx, jetty.bz)!).toBeLessThan(-1);
    expect(hyp(jetty.bx, jetty.bz)).toBeLessThan(hyp(jetty.ax, jetty.az));
    // ramps and bridges meet the ground at their feet, gently
    for (const d of DINO_DECKS.filter((q) => q.kind === "ramp" || q.kind === "bridge")) {
      if (d.id.endsWith("-a")) expect(Math.abs(d.ya - dinoLandY(d.ax, d.az)!), d.id).toBeLessThan(0.3);
      else expect(Math.abs(d.yb - dinoLandY(d.bx, d.bz)!), d.id).toBeLessThan(0.3);
      expect(Math.abs(d.yb - d.ya) / Math.hypot(d.bx - d.ax, d.bz - d.az), d.id).toBeLessThan(0.45);
    }
    // the Rex Bridge hangs high over the valley floor
    const rb = DINO_DECKS.find((d) => d.id === "rexbridge-a")!;
    expect(rb.yb - DINO_GORGE.floorY).toBeGreaterThan(12);
  });

  it("is full of things — and its trees are true size (giant conifers 30–50 m, tree ferns 5–8 m)", () => {
    const count = (k: string) => DINO_PROPS.filter((p) => p.kind === k).length;
    for (const k of ["gate", "hut", "platform", "tower", "hidehut", "dig", "tent", "campfire", "paintrock"]) expect(count(k), k).toBeGreaterThanOrEqual(1);
    expect(count("nest")).toBeGreaterThanOrEqual(3);
    expect(count("bonehut")).toBeGreaterThanOrEqual(2);
    expect(count("swamptree")).toBeGreaterThanOrEqual(6);
    expect(count("cycad") + count("fern") + count("bigleaf")).toBeGreaterThanOrEqual(80);
    expect(DINO_TORCHES.length).toBeGreaterThanOrEqual(6);
    const trees = (k: string) => DINO_TREES.filter((t) => t.kind === k);
    expect(DINO_TREES.length).toBeGreaterThanOrEqual(220);
    const m = (t: (typeof DINO_TREES)[number]) => ({ araucaria: 60, spire: 58, treefern: 11, broadleaf: 24 })[t.kind] * t.s / 1.6;
    const giants = [...trees("araucaria"), ...trees("spire")].filter((t) => !t.snow && m(t) > 20);
    expect(giants.length).toBeGreaterThanOrEqual(40);
    for (const t of giants) {
      expect(m(t)).toBeGreaterThan(18);
      expect(m(t)).toBeLessThan(52);
    }
    expect(giants.filter((t) => m(t) >= 30).length).toBeGreaterThanOrEqual(20);
    for (const t of trees("treefern")) {
      expect(m(t)).toBeGreaterThan(4.5);
      expect(m(t)).toBeLessThan(8.5);
    }
    // young monkey-puzzles in the long-necks' groves (their crowns at a brachiosaur's head: 10–16 m)
    for (const g of DINO_ZONES.filter((z) => z.kind === "grove")) {
      const young = trees("araucaria").filter((t) => m(t) > 9 && m(t) < 17 && hyp(t.x - g.x, t.z - g.z) < g.r + 14);
      expect(young.length, g.id).toBeGreaterThanOrEqual(2);
    }
    // tree ferns and cycads out of the snow; spruces in it
    for (const p of DINO_PROPS) if (p.kind === "cycad") expect(dinoSnow(p.x, p.z), p.kind).toBeLessThan(0.5);
    for (const t of trees("treefern")) expect(dinoSnow(t.x, t.z)).toBeLessThan(0.5);
    expect(DINO_TREES.filter((t) => t.snow).length).toBeGreaterThanOrEqual(20);
    for (const t of DINO_TREES.filter((q) => q.snow)) expect(dinoSnow(t.x, t.z)).toBeGreaterThan(0.3);
  });

  it("props and trees stand on dry ground (or on their decks)", () => {
    for (const p of DINO_PROPS) {
      if (p.kind === "reeds" || p.kind === "swamptree" || p.kind === "fence" || p.kind === "dig") continue;
      const g = dinoGroundY(p.x, p.z);
      expect(g, `${p.kind} ${p.x - I.x},${p.z - I.z}`).not.toBeNull();
      expect(Math.abs(g! - p.y), p.kind).toBeLessThan(0.05);
      expect(g!, p.kind).toBeGreaterThan(0.8);
    }
    for (const t of DINO_TREES) {
      const g = dinoLandY(t.x, t.z)!;
      expect(g, t.kind).toBeGreaterThan(1.4);
      expect(Math.abs(g - 0.2 - t.y), t.kind).toBeLessThan(0.05);
      expect(dinoWaterAt(t.x, t.z), t.kind).toBeNull();
      expect(dinoGorgeE(t.x, t.z), t.kind).toBeGreaterThan(DINO_FENCE_E);
    }
  });

  it("obstacles don't overlap each other", () => {
    const O = DINO_OBSTACLES;
    const bad: string[] = [];
    for (let i = 0; i < O.length; i++)
      for (let j = i + 1; j < O.length; j++) if (hyp(O[i].x - O[j].x, O[i].z - O[j].z) <= O[i].r + O[j].r - 0.3) bad.push(`${propAt(O[i])} / ${propAt(O[j])} @ ${(O[i].x - I.x).toFixed(1)},${(O[i].z - I.z).toFixed(1)}`);
    expect(bad).toEqual([]);
  });

  it("the safari trail is connected, a jeep-wide road on walkable ground, clear of obstacles, round the whole island", () => {
    const { nodes, edges } = DINO_TRAIL;
    expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
    const seen = new Set([0]);
    const stack = [0];
    while (stack.length) {
      const a = stack.pop()!;
      for (const [p, q] of edges) {
        const b = p === a ? q : q === a ? p : -1;
        if (b >= 0 && !seen.has(b)) {
          seen.add(b);
          stack.push(b);
        }
      }
    }
    expect(seen.size).toBe(nodes.length);
    let length = 0;
    for (const [a, b] of edges) {
      const L = hyp(nodes[b].x - nodes[a].x, nodes[b].z - nodes[a].z);
      length += L;
      const n = Math.max(10, Math.ceil(L / 1.2));
      let prev: number | null = null;
      for (let k = 0; k <= n; k++) {
        const x = nodes[a].x + ((nodes[b].x - nodes[a].x) * k) / n;
        const z = nodes[a].z + ((nodes[b].z - nodes[a].z) * k) / n;
        const g = dinoGroundY(x, z);
        expect(g, `${nodes[a].id}-${nodes[b].id} ${k}`).not.toBeNull();
        // (no sudden cliffs along the way)
        if (prev !== null) expect(Math.abs(g! - prev), `${nodes[a].id}-${nodes[b].id} step ${k}`).toBeLessThan(1.0);
        prev = g;
        // (never into the T-rex's valley: over it only on the bridge)
        if (dinoGorgeE(x, z) < DINO_FENCE_E) expect(DINO_DECKS.some((d) => d.id.startsWith("rexbridge") && segDist(x, z, d.ax, d.az, d.bx, d.bz) < d.half), `${nodes[a].id}-${nodes[b].id} in the valley`).toBe(true);
      }
      const hits = DINO_OBSTACLES.filter((o) => segDist(o.x, o.z, nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z) <= o.r + 0.3).map((o) => `${nodes[a].id}-${nodes[b].id} x ${propAt(o)}`);
      expect(hits).toEqual([]);
    }
    // a long winding safari (~800 m of trail), out to both ends of the island
    expect(length / 1.6).toBeGreaterThan(700);
    const zs = nodes.map((n) => n.z - I.z);
    expect(Math.min(...zs)).toBeLessThan(-200);
    expect(Math.max(...zs)).toBeGreaterThan(150);
    expect(DINO_TRAIL_HALF * 2 / 1.6).toBeGreaterThan(2.5);
  });

  it("the herds' places are open, dry land (clear of obstacles, water, the valley and cliffs)", () => {
    for (const z of DINO_ZONES) {
      let wet = 0;
      let n = 0;
      for (let k = 0; k < 60; k++) {
        const a = k * 2.399;
        const rr = Math.sqrt((k + 0.5) / 60) * z.r;
        const x = z.x + Math.sin(a) * rr;
        const zz = z.z + Math.cos(a) * rr;
        const g = dinoLandY(x, zz);
        expect(g, `${z.id} ${k}`).not.toBeNull();
        if (z.kind !== "water") expect(g!, `${z.id} ${k}`).toBeGreaterThan(1.3);
        if (dinoWaterAt(x, zz) !== null) wet++;
        n++;
      }
      expect(wet / n, z.id).toBeLessThan(z.kind === "water" ? 0.8 : 0.2);
      expect(dinoGorgeE(z.x, z.z), z.id).toBeGreaterThan(DINO_FENCE_E + 0.3);
      for (const o of DINO_OBSTACLES) {
        if (z.id === "sabre-rocks" && o.r > 1.5) continue; // (the cats lounge on their rocks)
        if (z.id === "bear-den" && o.r > 1.5) continue;
        if (z.id === "nests" && propAt(o) === "nest") continue; // (the babies play among the nests)
        expect(hyp(o.x - z.x, o.z - z.z), `${z.id} x ${propAt(o)}`).toBeGreaterThan(o.r + z.r * 0.5);
      }
    }
  });

  it("names spots for landing, the HUD and discoveries, all on walkable ground and clear of obstacles", () => {
    expect(new Set(DINO_SPOTS.map((s) => s.id)).size).toBe(DINO_SPOTS.length);
    for (const k of ["gate", "lookout", "nests", "volcano", "lagoon", "dig", "beach", "paddock", "glacier", "icecave", "camp", "ford", "grove", "landbridge"]) expect(DINO_SPOTS.some((s) => s.kind === k), k).toBe(true);
    for (const s of DINO_SPOTS) {
      expect(dinoGroundY(s.x, s.z), s.id).not.toBeNull();
      for (const o of DINO_OBSTACLES) expect(hyp(o.x - s.x, o.z - s.z), `${s.id} x ${propAt(o)}`).toBeGreaterThan(o.r + 0.8);
      expect(DINO_SPOT_FACTS[s.id], s.id).toBeTruthy();
    }
    for (const t of [...Object.values(DINO_SPOT_FACTS), ...Object.values(DINO_SPECIES).map((s) => s.fact)]) expect(t.length).toBeLessThan(100);
    expect(Object.values(DINO_SPECIES).filter((s) => s.era === "iceage").length).toBeGreaterThanOrEqual(6);
  });

  it("parks two safari jeeps at the plaza, right beside the trail, on open level ground", () => {
    expect(DINO_JEEPS.length).toBe(2);
    for (const j of DINO_JEEPS) {
      const d = dinoTrailDistance(j.x, j.z);
      expect(d, j.id).toBeGreaterThan(DINO_TRAIL_HALF + 1);
      expect(d, j.id).toBeLessThan(DINO_TRAIL_HALF + 6);
      expect(j.y).toBeCloseTo(dinoGroundY(j.x, j.z)!, 3);
      expect(j.y).toBeGreaterThan(1.5);
      for (const o of DINO_OBSTACLES) expect(hyp(o.x - j.x, o.z - j.z), j.id).toBeGreaterThan(o.r + 2.5);
      // (level: the ground round it is flat enough to park on)
      for (const [dx, dz] of [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ])
        expect(Math.abs(dinoGroundY(j.x + dx, j.z + dz)! - j.y)).toBeLessThan(0.6);
    }
    expect(hyp(DINO_JEEPS[0].x - DINO_JEEPS[1].x, DINO_JEEPS[0].z - DINO_JEEPS[1].z)).toBeGreaterThan(3.5);
  });

  it("calms the swell over its reef (JS and GLSL agree on the shape)", () => {
    for (const p of COAST.filter((_, i) => i % 20 === 0)) expect(dinoCalm(p.x, p.z)).toBeCloseTo(0.12, 1);
    expect(dinoCalm(I.x, I.z)).toBeCloseTo(0.12, 5);
    for (const p of dinoOutline(70, 30)) expect(dinoCalm(p.x, p.z)).toBeCloseTo(1, 1);
    expect(dinoCalm(0, 0)).toBe(1);
    expect(DINO_CALM_GLSL).toContain("float dinoCalm( vec2 p )");
    expect(DINO_CALM_GLSL).toContain(I.x.toFixed(2));
    expect(DINO_OUTLINE.length).toBeGreaterThan(60);
  });
});
