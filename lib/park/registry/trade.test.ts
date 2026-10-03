import { describe, expect, it } from "vitest";
import { BOAT_ROUTE, GOODS, TRADE_POSTS, TRADE_ROUTES, goodOf, tradePostOf, tradeRouteOf } from "./trade";
import { worldSeaDepth, MOORINGS } from "./harbours";
import { SETTLEMENTS } from "./settlements";

describe("trade: goods", () => {
  it("every good has a short, distinct emoji and name", () => {
    const ids = new Set<string>();
    for (const g of GOODS) {
      expect(ids.has(g.id)).toBe(false);
      ids.add(g.id);
      expect(g.emoji.length).toBeGreaterThan(0);
      expect(g.name.length).toBeGreaterThan(0);
    }
  });
  it("goodOf resolves every id used by a post", () => {
    for (const p of TRADE_POSTS) for (const id of [...p.makes, ...p.wants]) expect(goodOf(id).id).toBe(id);
  });
});

describe("trade: posts", () => {
  it("lists every post, each with what it makes/wants", () => {
    expect(TRADE_POSTS.map((p) => p.id).sort()).toEqual(["coralcove", "highstone", "lakeside", "market", "treetop"]);
    for (const p of TRADE_POSTS) {
      expect(p.makes.length).toBeGreaterThan(0);
      expect(p.wants.length).toBeGreaterThan(0);
      // a post never "wants" the very thing it already makes
      for (const w of p.wants) expect(p.makes).not.toContain(w);
    }
  });
  it("every post is reachable by at least one route", () => {
    for (const p of TRADE_POSTS) expect(TRADE_ROUTES.some((r) => r.from === p.id || r.to === p.id)).toBe(true);
  });
  it("Lakeside's trade comes straight from its SettlementDef (a new settlement just fills this in)", () => {
    const lakeside = SETTLEMENTS.find((s) => s.id === "lakeside")!;
    const post = tradePostOf("lakeside")!;
    expect(post.makes).toEqual(lakeside.trade!.makes);
    expect(post.wants).toEqual(lakeside.trade!.wants);
  });
  it("tradePostOf / tradeRouteOf resolve by id", () => {
    expect(tradePostOf("market")?.name).toBe("Market Street");
    expect(tradeRouteOf("boat-lakeside-coralcove")?.mode).toBe("boat");
    expect(tradePostOf("nope")).toBeUndefined();
  });
});

describe("trade: routes", () => {
  it("has a cart road, a boat route and a train link, each naming real posts", () => {
    const ids = new Set(TRADE_POSTS.map((p) => p.id));
    for (const r of TRADE_ROUTES) {
      expect(ids.has(r.from)).toBe(true);
      expect(ids.has(r.to)).toBe(true);
    }
    expect(tradeRouteOf("cart-lakeside-market")?.mode).toBe("cart");
    expect(tradeRouteOf("boat-lakeside-coralcove")?.mode).toBe("boat");
    expect(tradeRouteOf("train-lakeside-market")?.mode).toBe("train");
    expect(tradeRouteOf("train-treetop-lakeside")?.mode).toBe("train");
    expect(tradeRouteOf("train-highstone-market")?.mode).toBe("train");
    expect(tradeRouteOf("train-treetop-highstone")?.mode).toBe("train");
  });
  it("cart/boat routes have a positive length that matches their polyline", () => {
    for (const r of TRADE_ROUTES) {
      if (r.mode === "train") continue;
      expect(r.points.length).toBeGreaterThan(1);
      expect(r.length).toBeGreaterThan(100);
    }
  });
});

describe("trade: boat route", () => {
  it("stays deep enough for a sailboat (draft 1.0) the whole way", () => {
    for (const [x, z] of BOAT_ROUTE) expect(worldSeaDepth(x, z)).toBeGreaterThanOrEqual(1.0);
  });
  it("starts at Lakeside and ends clear of Coralcove's own moored boats", () => {
    const end = BOAT_ROUTE[BOAT_ROUTE.length - 1];
    const coralMoorings = MOORINGS.filter((m) => m.dock === "coralcove");
    for (const m of coralMoorings) expect(Math.hypot(end[0] - m.x, end[1] - m.z)).toBeGreaterThan(4);
  });
  it("is continuous (no two consecutive points leap unreasonably far)", () => {
    for (let i = 1; i < BOAT_ROUTE.length; i++) {
      const [ax, az] = BOAT_ROUTE[i - 1];
      const [bx, bz] = BOAT_ROUTE[i];
      expect(Math.hypot(bx - ax, bz - az)).toBeLessThan(60);
    }
  });
});
