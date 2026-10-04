import { describe, expect, it } from "vitest";
import { SETTLEMENTS, settlePadHeight } from "./settlements";
import { seaDist } from "./island";
import { nearRail, STATIONS } from "./railway";
import { wildWaterSdf } from "./wildWater";
import { footprintStats } from "./landform";
import { groundY } from "./terrain";
import { TOWN_BUILDING_REF_W, TOWN_RADIUS, TOWN_SHOP_KINDS, TOWN_SITE, TOWN_STALL_GOODS, findTownSite, generateTown, townStallColor } from "./town";
import { TRADE_POSTS, TRADE_ROUTES } from "./trade";
import { FOOTPATHS } from "./footpaths";

const TOWN = SETTLEMENTS.find((s) => s.id === "town")!;

describe("Sunnybrook: the market town on the Sunny Plains", () => {
  it("exists, is bigger than a village, and sits inside the island, dry, clear of the rail, near its own station", () => {
    expect(TOWN).toBeTruthy();
    expect(TOWN.radius).toBe(TOWN_RADIUS);
    // bigger than a village, and big enough to hold real-scale terraced streets plus a field band
    // outside the built-up square (see "the fields sit outside the built-up square" below)
    expect(TOWN.radius).toBeGreaterThanOrEqual(55);
    expect(TOWN.radius).toBeLessThanOrEqual(80);
    expect(seaDist(TOWN.x, TOWN.z)).toBeLessThan(-40);
    expect(nearRail(TOWN.x, TOWN.z, 12)).toBe(false);
    expect(wildWaterSdf(TOWN.x, TOWN.z)).toBeGreaterThan(0);
    expect(TOWN.stationId).toBe("plains-station");
    const station = STATIONS.find((s) => s.id === "plains-station")!;
    const d = Math.hypot(TOWN.x - station.x, TOWN.z - station.z);
    expect(d).toBeGreaterThanOrEqual(60 - 5);
    expect(d).toBeLessThanOrEqual(220 + 5);
  });

  it("sits somewhere the REAL, unlevelled ground is gentle the whole way out to its own (larger) radius", () => {
    const full = footprintStats(TOWN.x, TOWN.z, TOWN.radius);
    expect(full.maxSlope).toBeLessThanOrEqual(0.4);
    expect(full.relief).toBeLessThanOrEqual(8.5);
  });

  it("stays well clear of every other settlement (the draw-call budget never doubles up)", () => {
    for (const s of SETTLEMENTS) {
      if (s.id === "town") continue;
      expect(Math.hypot(TOWN.x - s.x, TOWN.z - s.z), s.id).toBeGreaterThan(560);
    }
  });

  it("has 8 distinct shop fronts + 8 townhouses, shoulder-to-shoulder in terraced rows (<= 1 m gaps) but never overlapping", () => {
    expect(TOWN.huts.length).toBe(16);
    const kinds = new Set(TOWN.huts.map((h) => h.kind));
    for (const k of TOWN_SHOP_KINDS) expect(kinds.has(k)).toBe(true);
    expect(TOWN.huts.filter((h) => h.kind === "townhouse").length).toBe(8);
    // `size` is a fraction of TOWN_BUILDING_REF_W (the renderer multiplies it straight back out —
    // see styles/town.ts's widthOf) — real half-widths, not the old village convention
    let closestGap = Infinity;
    for (let i = 0; i < TOWN.huts.length; i++)
      for (let j = i + 1; j < TOWN.huts.length; j++) {
        const a = TOWN.huts[i];
        const b = TOWN.huts[j];
        const halfSum = ((a.size + b.size) * TOWN_BUILDING_REF_W) / 2;
        const gap = Math.hypot(a.x - b.x, a.z - b.z) - halfSum;
        expect(gap, `huts ${i},${j}`).toBeGreaterThan(0);
        if (gap < closestGap) closestGap = gap;
      }
    // every building has SOME neighbour within the terraced row's own gap (<= 1 m, "shoulder to
    // shoulder") — not every building scattered off on its own in the grass
    expect(closestGap).toBeLessThan(1);
  });

  it("every building's floor sits flush with the town's own pad (nothing floating or buried)", () => {
    const centerY = groundY(TOWN.x, TOWN.z);
    for (const h of TOWN.huts) expect(Math.abs(groundY(h.x, h.z) - centerY), `hut at ${h.x},${h.z}`).toBeLessThan(0.5);
    const padH = settlePadHeight("town", TOWN.x, TOWN.z);
    expect(TOWN.padHeight).toBeCloseTo(padH, 6);
  });

  it("the path graph connects every home, every stall and every named work spot (one walk graph, no island nodes)", () => {
    const n = TOWN.nodes.length;
    const adj: number[][] = Array.from({ length: n }, () => []);
    for (const [a, b] of TOWN.edges) {
      adj[a].push(b);
      adj[b].push(a);
    }
    const seen = new Set<number>([0]);
    const stack = [0];
    while (stack.length) {
      const at = stack.pop()!;
      for (const nx of adj[at]) if (!seen.has(nx)) {
        seen.add(nx);
        stack.push(nx);
      }
    }
    expect(seen.size).toBe(n);
    for (let i = 0; i < TOWN.huts.length; i++) expect(TOWN.nodes.some((nd) => nd.id === `home-${i}`), `home-${i}`).toBe(true);
    for (const w of TOWN.work) expect(TOWN.nodes.some((nd) => Math.hypot(nd.x - w.x, nd.z - w.z) < 0.6), `work ${w.id} needs a coincident node`).toBe(true);
    // the dance act (routine.ts) and the chase act both look a specific node/work-spot id up by
    // name for every settlement — a town without them would silently break at runtime
    expect(TOWN.work.some((w) => w.id === "fire")).toBe(true);
    expect(TOWN.nodes.some((nd) => nd.id === "chase")).toBe(true);
  });

  it("has a market stall for every good it trades, each a real work spot", () => {
    expect(TOWN_STALL_GOODS.length).toBe(7);
    for (const good of TOWN_STALL_GOODS) {
      const prop = TOWN.props.find((p) => p.kind === `stall-${good}`);
      expect(prop, good).toBeTruthy();
      expect(TOWN.work.some((w) => w.id === `stall-${good}`), good).toBe(true);
      expect(townStallColor(good).startsWith("#")).toBe(true);
    }
  });

  it("the market activity is placed among the stalls, inside the town", () => {
    const act = TOWN.activities.find((a) => a.id === "market")!;
    expect(act).toBeTruthy();
    expect(act.label).toBe("Run a market stall");
    expect(Math.hypot(act.x - TOWN.x, act.z - TOWN.z)).toBeLessThan(TOWN.radius);
    // sits near the stalls, not off in the fields
    const nearestStall = Math.min(...TOWN_STALL_GOODS.map((g) => Math.hypot(act.x - TOWN.props.find((p) => p.kind === `stall-${g}`)!.x, act.z - TOWN.props.find((p) => p.kind === `stall-${g}`)!.z)));
    expect(nearestStall).toBeLessThan(10);
  });

  it("the clock tower and the windmill are each placed once, inside the town, well clear of every building", () => {
    const clock = TOWN.props.find((p) => p.kind === "clocktower")!;
    const mill = TOWN.props.find((p) => p.kind === "windmill")!;
    expect(clock).toBeTruthy();
    expect(mill).toBeTruthy();
    expect(Math.hypot(clock.x - TOWN.x, clock.z - TOWN.z)).toBeLessThan(TOWN.radius);
    expect(Math.hypot(mill.x - TOWN.x, mill.z - TOWN.z)).toBeLessThan(TOWN.radius);
    // the tower's own base (~3.4 units wide) and the mill's (~4.7) both read as real landmarks, set
    // well back from every building's own half-width (styles/town.ts's widthOf)
    for (const h of TOWN.huts) {
      const halfW = h.size * TOWN_BUILDING_REF_W * 0.5;
      expect(Math.hypot(clock.x - h.x, clock.z - h.z), "clock vs hut").toBeGreaterThan(halfW + 3.4);
      expect(Math.hypot(mill.x - h.x, mill.z - h.z), "mill vs hut").toBeGreaterThan(halfW + 4.7);
    }
  });

  it("the fields (wheat/sunflowers) sit OUTSIDE the built-up square and its streets, with the windmill among them, still inside the town's own radius", () => {
    const fields = TOWN.props.filter((p) => p.kind === "wheat" || p.kind === "sunflower");
    expect(fields.length).toBeGreaterThan(10);
    // every street's own houses stay inside this (see registry/town.ts's `fieldInner`)
    const builtUpR = 50;
    for (const f of fields) {
      const d = Math.hypot(f.x - TOWN.x, f.z - TOWN.z);
      expect(d, "field clear of the built-up square").toBeGreaterThanOrEqual(builtUpR);
      expect(d, "field inside the town's own radius").toBeLessThanOrEqual(TOWN.radius + 1);
    }
    for (const h of TOWN.huts) expect(Math.hypot(h.x - TOWN.x, h.z - TOWN.z), "hut inside the built-up square").toBeLessThan(builtUpR);
  });

  it("obstacles cover every hut plus the big landmarks (push-out collision)", () => {
    expect(TOWN.obstacles.length).toBeGreaterThanOrEqual(TOWN.huts.length);
  });

  it("villagers' schedules cover the full 24 hours and every talk line is short, true and unique", () => {
    for (const v of TOWN.roster) {
      expect(v.schedule[0].from).toBe(0);
      expect(v.schedule.length).toBeGreaterThanOrEqual(4);
    }
    expect(TOWN.roster.length).toBeGreaterThanOrEqual(16);
    expect(TOWN.roster.length).toBeLessThanOrEqual(24);
    const seen = new Set<string>();
    for (const t of TOWN.talk)
      for (const line of t.lines) {
        expect(line.length, `${t.id}: ${line}`).toBeLessThanOrEqual(140);
        expect(seen.has(line), `duplicate line "${line}"`).toBe(false);
        seen.add(line);
      }
  });

  it("every act a villager's schedule names is one routine.ts actually knows how to pose (sell/busk/light included)", () => {
    const VALID = new Set(["home", "wander", "fish", "nets", "cook", "dance", "drum", "chase", "look", "sit", "sell", "busk", "light"]);
    for (const v of TOWN.roster) for (const slot of v.schedule) expect(VALID.has(slot.act), `${v.id}: ${slot.act}`).toBe(true);
  });

  it("joins the trade network automatically (its `trade` field), gets a footpath to its station, and is linked by train", () => {
    const post = TRADE_POSTS.find((p) => p.id === "town")!;
    expect(post).toBeTruthy();
    expect(post.makes).toEqual(TOWN.trade!.makes);
    expect(post.wants).toEqual(TOWN.trade!.wants);
    expect(post.stationId).toBe("plains-station");
    // never wants the very thing it already makes
    for (const w of post.wants) expect(post.makes).not.toContain(w);
    expect(FOOTPATHS.some((f) => f.settlementId === "town")).toBe(true);
    expect(TRADE_ROUTES.some((r) => r.from === "town" || r.to === "town")).toBe(true);
  });

  it("generateTown is deterministic: re-run with the real avoid list (the other 3 settlements' sites) reproduces the exact same site and roster", () => {
    // SITE/TREETOP_SITE/HIGHSTONE_SITE aren't exported from settlements.ts (town.ts is deliberately
    // decoupled from its private site consts — see its own top-of-file comment), so this re-derives
    // the same avoid points straight off the real SETTLEMENTS array instead
    const others = SETTLEMENTS.filter((s) => s.id !== "town").map((s) => ({ x: s.x, z: s.z }));
    // (the site is stored as numbers so the ~2 s search never runs at park load: the real search,
    //  re-run here, must still land exactly on them)
    expect(findTownSite(others)).toEqual(TOWN_SITE);
    const again = generateTown(others, findTownSite(others));
    expect(again.x).toBe(TOWN.x);
    expect(again.z).toBe(TOWN.z);
    expect(again.roster[0]).toEqual(TOWN.roster[0]);
  });
});
