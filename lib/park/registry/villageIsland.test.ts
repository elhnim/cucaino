import { describe, expect, it } from "vitest";
import {
  VILLAGE_DECKS,
  VILLAGE_FIRE,
  VILLAGE_HOMES,
  VILLAGE_ISLAND,
  VILLAGE_LAGOON,
  VILLAGE_LANTERNS,
  VILLAGE_OBSTACLES,
  VILLAGE_PATHS,
  VILLAGE_PROPS,
  VILLAGE_SEA_R,
  VILLAGE_SMOKE,
  VILLAGE_SPOTS,
  VILLAGE_WATER_Y,
  VILLAGE_WORK,
  VILLAGERS_TALK,
  villageCoastR,
  villageGroundY,
  villageHeightAt,
  villageInLagoon,
  villageLandY,
  villageNode,
  villageSeaFloorY,
} from "./villageIsland";
import { DEEP_FLOOR, TERRAIN_EXTENT, WATER_Y, WRAP_R } from "./terrain";
import { SKY_ISLANDS } from "./skyIslands";
import { ISLAND_R } from "./island";

const I = VILLAGE_ISLAND;
const hyp = Math.hypot;
const segDist = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const ux = bx - ax;
  const uz = bz - az;
  const t = Math.min(1, Math.max(0, ((px - ax) * ux + (pz - az) * uz) / (ux * ux + uz * uz || 1)));
  return hyp(ax + ux * t - px, az + uz * t - pz);
};
const propAt = (o: { x: number; z: number }) => VILLAGE_PROPS.find((p) => p.x === o.x && p.z === o.z)!;

describe("Coralcove Isle (the village island)", () => {
  it("shares the sea level and deep floor with the terrain", () => {
    expect(VILLAGE_WATER_Y).toBe(WATER_Y);
    // far out on its flanks the island meets the deep floor
    expect(villageHeightAt(I.x + VILLAGE_SEA_R - 1, I.z)).toBeLessThan(DEEP_FLOOR + 0.5);
  });

  it("sits far out at sea, clear of the main island's grid, the sky islands and the world wrap", () => {
    const d = hyp(I.x, I.z);
    expect(d).toBeGreaterThanOrEqual(360);
    expect(d).toBeLessThanOrEqual(420);
    expect(I.r).toBeGreaterThanOrEqual(45);
    expect(I.r).toBeLessThanOrEqual(70);
    // the submerged slopes don't reach the main island's height grid
    const gx = Math.max(-TERRAIN_EXTENT, Math.min(TERRAIN_EXTENT, I.x));
    const gz = Math.max(-TERRAIN_EXTENT, Math.min(TERRAIN_EXTENT, I.z));
    expect(hyp(I.x - gx, I.z - gz)).toBeGreaterThan(VILLAGE_SEA_R + 1);
    expect(d - VILLAGE_SEA_R).toBeGreaterThan(ISLAND_R + 80);
    // and never touch the wrap edge
    expect(d + VILLAGE_SEA_R).toBeLessThan(WRAP_R - 60);
    for (const s of SKY_ISLANDS) expect(hyp(s.x - I.x, s.z - I.z), s.id).toBeGreaterThan(s.r + VILLAGE_SEA_R + 10);
  });

  it("has land above the sea inside the coast and a shallow reef ring round the beach", () => {
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const c = villageCoastR(a);
      const at = (s: number) => [I.x + Math.sin(a) * c * s, I.z + Math.cos(a) * c * s] as const;
      // inland: dry ground you can walk on
      const inl = at(0.7);
      expect(villageGroundY(inl[0], inl[1]), `inland ${k}`).not.toBeNull();
      expect(villageGroundY(inl[0], inl[1])!).toBeGreaterThan(0.9);
      // top of the beach above the swell
      const top = at(0.86);
      expect(villageLandY(top[0], top[1])!, `beach ${k}`).toBeGreaterThan(0.8);
      // the reef ring: wadeable shallows (0 .. -4)
      for (const s of [1.05, 1.15, 1.25]) {
        const p = at(s);
        const f = villageSeaFloorY(p[0], p[1])!;
        expect(f, `reef ${k} ${s}`).toBeLessThan(WATER_Y);
        expect(f, `reef ${k} ${s}`).toBeGreaterThan(-4.5);
      }
      // then down into the deep
      const out = at(1.9);
      expect(villageSeaFloorY(out[0], out[1])!).toBeLessThan(-15);
      // not ground in the sea (off the decks)
      const sea = at(1.1);
      if (!VILLAGE_DECKS.some((d) => segDist(sea[0], sea[1], d.ax, d.az, d.bx, d.bz) < (d.r ?? d.half) + 0.1)) expect(villageGroundY(sea[0], sea[1])).toBeNull();
    }
    // far away: nothing
    expect(villageSeaFloorY(I.x + VILLAGE_SEA_R + 5, I.z)).toBeNull();
    expect(villageGroundY(0, 0)).toBeNull();
    expect(villageSeaFloorY(0, 0)).toBeNull();
  });

  it("the sea floor is continuous from the land out to the deep", () => {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + 0.1;
      let prev = villageSeaFloorY(I.x, I.z)!;
      for (let r = 1; r < VILLAGE_SEA_R; r += 0.5) {
        const f = villageSeaFloorY(I.x + Math.sin(a) * r, I.z + Math.cos(a) * r)!;
        expect(Math.abs(f - prev), `${k} @ ${r}`).toBeLessThan(1.3);
        prev = f;
      }
    }
  });

  it("the lagoon is knee-deep and walkable, with dry banks all round", () => {
    const L = VILLAGE_LAGOON;
    // (off the boardwalk that crosses its middle)
    expect(villageInLagoon(L.x, L.z + 2.5)).toBe(true);
    const g = villageGroundY(L.x, L.z + 2.5)!;
    expect(g).not.toBeNull();
    expect(L.waterY - g).toBeGreaterThan(0.3);
    expect(L.waterY - g).toBeLessThan(0.7);
    // the lagoon's water never spills over its banks: ground above its surface just outside
    for (let k = 0; k < 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      const c = Math.cos(L.rot);
      const s = Math.sin(L.rot);
      for (const e of [1.4, 1.5]) {
        const u = Math.sin(a) * L.rx * e;
        const v = Math.cos(a) * L.rz * e;
        const x = L.x + u * c + v * s;
        const z = L.z - u * s + v * c;
        expect(villageLandY(x, z)!, `bank ${k}`).toBeGreaterThan(L.waterY + 0.1);
      }
    }
  });

  it("decks are walkable at their own height, and the jetty reaches out over the sea", () => {
    for (const d of VILLAGE_DECKS) {
      const mx = (d.ax + d.bx) / 2;
      const mz = (d.az + d.bz) / 2;
      const y = villageGroundY(mx, mz)!;
      expect(y, d.id).not.toBeNull();
      expect(y, d.id).toBeGreaterThan(0.7);
    }
    const jetty = VILLAGE_DECKS.find((d) => d.id === "jetty")!;
    expect(villageLandY(jetty.bx, jetty.bz)!).toBeLessThan(-1);
    // lagoon decks stand above the lagoon's water
    for (const d of VILLAGE_DECKS.filter((d) => d.kind === "deck")) expect(d.ya).toBeGreaterThan(VILLAGE_LAGOON.waterY + 0.8);
  });

  it("has 2–3 villages full of things: huts, stilt houses, stalls, a bakery, a lighthouse, lanterns, trees", () => {
    const count = (k: string) => VILLAGE_PROPS.filter((p) => p.kind === k).length;
    expect(new Set(VILLAGE_PROPS.map((p) => p.village).filter(Boolean)).size).toBeGreaterThanOrEqual(3);
    expect(count("hut") + count("bighut")).toBeGreaterThanOrEqual(8);
    expect(count("stilthut")).toBeGreaterThanOrEqual(3);
    expect(count("stall")).toBeGreaterThanOrEqual(3);
    expect(count("bakery")).toBe(1);
    expect(count("oven")).toBe(1);
    expect(count("lighthouse")).toBe(1);
    expect(count("firepit")).toBe(1);
    expect(count("lantern")).toBeGreaterThanOrEqual(12);
    expect(count("palm")).toBeGreaterThanOrEqual(15);
    expect(count("moontree") + count("coraltree")).toBeGreaterThanOrEqual(12);
    expect(count("washline")).toBeGreaterThanOrEqual(2);
    expect(count("garden")).toBeGreaterThanOrEqual(2);
    expect(VILLAGE_LANTERNS.length).toBe(count("lantern"));
    expect(VILLAGE_SMOKE[0].big).toBe(true);
    expect(VILLAGE_SMOKE.length).toBeGreaterThanOrEqual(5);
  });

  it("props stand on dry ground (or on their decks)", () => {
    for (const p of VILLAGE_PROPS) {
      if (p.kind === "washline" || p.kind === "bunting") continue;
      const g = villageGroundY(p.x, p.z);
      expect(g, `${p.kind} ${p.x - I.x},${p.z - I.z}`).not.toBeNull();
      expect(Math.abs(g! - p.y), p.kind).toBeLessThan(0.05);
      if (p.kind !== "stilthut") expect(g!, p.kind).toBeGreaterThan(0.8);
    }
  });

  it("obstacles don't overlap each other", () => {
    const O = VILLAGE_OBSTACLES;
    for (let i = 0; i < O.length; i++)
      for (let j = i + 1; j < O.length; j++) expect(hyp(O[i].x - O[j].x, O[i].z - O[j].z), `${propAt(O[i]).kind} / ${propAt(O[j]).kind}`).toBeGreaterThan(O[i].r + O[j].r - 0.25);
  });

  it("the path graph is connected, on walkable ground, and clear of obstacles", () => {
    const { nodes, edges } = VILLAGE_PATHS;
    expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
    // connected
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
    for (const [a, b] of edges) {
      for (let k = 0; k <= 24; k++) {
        const x = nodes[a].x + ((nodes[b].x - nodes[a].x) * k) / 24;
        const z = nodes[a].z + ((nodes[b].z - nodes[a].z) * k) / 24;
        expect(villageGroundY(x, z), `${nodes[a].id}-${nodes[b].id} ${k}`).not.toBeNull();
      }
      for (const o of VILLAGE_OBSTACLES) expect(segDist(o.x, o.z, nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z), `${nodes[a].id}-${nodes[b].id} x ${propAt(o).kind}`).toBeGreaterThan(o.r + 0.3);
    }
  });

  it("doorsteps and work spots are reachable in a straight line from their nodes", () => {
    const { nodes } = VILLAGE_PATHS;
    for (const h of VILLAGE_HOMES) {
      const n = nodes[villageNode(h.node)];
      expect(villageGroundY(h.x, h.z)).not.toBeNull();
      for (const o of VILLAGE_OBSTACLES) {
        if (o === VILLAGE_OBSTACLES.find((q) => q.x === VILLAGE_PROPS[h.prop].x && q.z === VILLAGE_PROPS[h.prop].z)) continue;
        expect(segDist(o.x, o.z, h.x, h.z, n.x, n.z), `home ${h.node} x ${propAt(o).kind}`).toBeGreaterThan(o.r + 0.2);
      }
    }
    for (const w of VILLAGE_WORK) {
      expect(villageNode(w.node), w.id).toBeGreaterThanOrEqual(0);
      expect(villageGroundY(w.x, w.z), w.id).not.toBeNull();
      const n = nodes[villageNode(w.node)];
      const legs: [number, number, number, number][] = w.via ? [[n.x, n.z, w.via.x, w.via.z]] : [[n.x, n.z, w.x, w.z]];
      for (const [ax, az, bx, bz] of legs)
        for (const o of VILLAGE_OBSTACLES) {
          const p = propAt(o);
          // (sitters sit on their bench; stall keepers stand in their stall)
          if (w.sit && p.kind === "bench" && hyp(o.x - w.x, o.z - w.z) < 0.6) continue;
          if (w.id.startsWith("stall") && p.kind === "stall" && hyp(o.x - w.x, o.z - w.z) < 1.5) continue;
          expect(segDist(o.x, o.z, ax, az, bx, bz), `${w.id} x ${p.kind}`).toBeGreaterThan(o.r * 0.9);
        }
    }
    // every house has a doorstep
    expect(VILLAGE_HOMES.length).toBe(VILLAGE_PROPS.filter((p) => ["hut", "bighut", "stilthut", "bakery"].includes(p.kind)).length);
  });

  it("names spots for landing and the HUD, all on walkable ground and clear of obstacles", () => {
    expect(new Set(VILLAGE_SPOTS.map((s) => s.id)).size).toBe(VILLAGE_SPOTS.length);
    for (const k of ["beach", "square", "jetty", "lookout", "fire", "market"]) expect(VILLAGE_SPOTS.some((s) => s.kind === k), k).toBe(true);
    for (const s of VILLAGE_SPOTS) {
      expect(villageGroundY(s.x, s.z), s.id).not.toBeNull();
      for (const o of VILLAGE_OBSTACLES) expect(hyp(o.x - s.x, o.z - s.z), `${s.id} x ${propAt(o).kind}`).toBeGreaterThan(o.r + 0.8);
    }
    // the fire spot is by the fire, not in it
    const f = VILLAGE_SPOTS.find((s) => s.kind === "fire")!;
    expect(hyp(f.x - VILLAGE_FIRE.x, f.z - VILLAGE_FIRE.z)).toBeGreaterThan(VILLAGE_FIRE.danceR + 1);
  });

  it("has a few named villagers to talk to (an elder, a fisher, a musician, a baker, children)", () => {
    expect(VILLAGERS_TALK.length).toBeGreaterThanOrEqual(5);
    expect(new Set(VILLAGERS_TALK.map((v) => v.id)).size).toBe(VILLAGERS_TALK.length);
    for (const r of ["elder", "fisher", "musician", "baker", "child"]) expect(VILLAGERS_TALK.some((v) => v.role === r), r).toBe(true);
    for (const v of VILLAGERS_TALK) {
      expect(v.lines.length).toBeGreaterThanOrEqual(2);
      for (const l of v.lines) expect(l.length).toBeLessThan(90);
    }
  });

  it("lanterns stand beside the paths, not on them", () => {
    for (const l of VILLAGE_LANTERNS) {
      expect(villageGroundY(l.x, l.z)).not.toBeNull();
      const { nodes, edges } = VILLAGE_PATHS;
      for (const [a, b] of edges) expect(segDist(l.x, l.z, nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z)).toBeGreaterThan(0.5);
    }
  });
});
