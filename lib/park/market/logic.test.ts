import { describe, expect, it } from "vitest";
import { GOODS, getGood } from "./goods";
import {
  addToBasket,
  beginLevels,
  collectPayment,
  confirmBasket,
  enterJam,
  exitJam,
  extractProgress,
  generateOrder,
  giveCoin,
  hintForBasket,
  initialMarketState,
  levelSpec,
  mulberry32,
  nextCustomer,
  orderSentence,
  paymentForOrder,
  removeFromBasket,
  removeLastCoin,
  resumeLevels,
  seedFromProgress,
  startLevel,
  type MarketState,
  type Order,
} from "./logic";

/** Fill the basket exactly per the order and confirm it — lands in "pay". */
function serveCorrectly(s: MarketState): MarketState {
  let state = s;
  const order = state.order!;
  for (const line of order.lines) {
    for (let i = 0; i < line.qty; i++) state = addToBasket(state, line.good);
  }
  return confirmBasket(state);
}

/** From "pay", hand over whatever change is owed (greedily, largest coins first) and finish. */
function payExactChange(s: MarketState): MarketState {
  let state = s;
  const target = state.payment - state.order!.total;
  if (target === 0) return collectPayment(state);
  let remaining = target;
  const coins = [10, 5, 2, 1] as const;
  for (const c of coins) {
    while (remaining >= c) {
      state = giveCoin(state, c);
      remaining -= c;
    }
  }
  return state;
}

describe("order generation", () => {
  it("is deterministic for a given seed", () => {
    const a = generateOrder(3, mulberry32(7));
    const b = generateOrder(3, mulberry32(7));
    expect(a).toEqual(b);
  });

  it("varies with the seed", () => {
    const a = generateOrder(3, mulberry32(1));
    const b = generateOrder(3, mulberry32(2));
    expect(a).not.toEqual(b);
  });

  it("respects each level's line count, max quantity and money cap", () => {
    for (let level = 1; level <= 10; level++) {
      const spec = levelSpec(level);
      const rng = mulberry32(100 + level);
      for (let trial = 0; trial < 50; trial++) {
        const order = generateOrder(level, mulberry32((100 + level) * 1000 + trial));
        expect(order.lines.length).toBeLessThanOrEqual(spec.lineCount);
        expect(order.lines.length).toBeGreaterThan(0);
        for (const line of order.lines) {
          expect(line.qty).toBeGreaterThanOrEqual(1);
          expect(line.qty).toBeLessThanOrEqual(spec.maxQty);
        }
        expect(order.total).toBeLessThanOrEqual(spec.moneyCap);
        // no good repeated within one order
        const ids = order.lines.map((l) => l.good);
        expect(new Set(ids).size).toBe(ids.length);
      }
      void rng; // (kept for symmetry with other seeded-draw tests)
    }
  });

  it("totals match the registry prices", () => {
    const order = generateOrder(5, mulberry32(42));
    const expected = order.lines.reduce((sum, l) => sum + (getGood(l.good)?.price ?? 0) * l.qty, 0);
    expect(order.total).toBe(expected);
  });

  it("builds a kid-readable sentence with pictures-worthy words", () => {
    const order: Order = { lines: [{ good: "apple", qty: 2 }, { good: "bread", qty: 1 }], total: 5, level: 3 };
    expect(orderSentence(order)).toBe("2 apples and a loaf of bread, please!");
    const single: Order = { lines: [{ good: "fish", qty: 1 }], total: 4, level: 1 };
    expect(orderSentence(single)).toBe("a fish, please!");
  });
});

describe("basket matching", () => {
  const order: Order = { lines: [{ good: "apple", qty: 3 }, { good: "cheese", qty: 1 }], total: 5, level: 3 };

  it("is null (no hint) when the basket matches exactly", () => {
    expect(hintForBasket(order, { apple: 3, cheese: 1 })).toBeNull();
  });

  it("gently names a missing/short good, with the full count", () => {
    const hint = hintForBasket(order, { apple: 1, cheese: 1 });
    expect(hint).toMatch(/count again/i);
    expect(hint).toContain("3 apples");
    expect(hint).toContain("🍎🍎🍎");
  });

  it("gently names an overfilled good", () => {
    const hint = hintForBasket(order, { apple: 3, cheese: 2 });
    expect(hint).toMatch(/too many/i);
    expect(hint).toContain("wedges of cheese");
  });

  it("gently flags an item that was never ordered", () => {
    const hint = hintForBasket(order, { apple: 3, cheese: 1, wool: 1 });
    expect(hint).toMatch(/doesn't need/i);
    expect(hint).toContain("wool");
  });

  it("addToBasket / removeFromBasket only apply during 'serving'", () => {
    let s = initialMarketState();
    expect(addToBasket(s, "apple")).toBe(s); // not serving yet, no-op
    s = startLevel(s, 1, mulberry32(1));
    s = addToBasket(s, "apple");
    expect(s.basket.apple).toBe(1);
    s = addToBasket(s, "apple");
    expect(s.basket.apple).toBe(2);
    s = removeFromBasket(s, "apple");
    expect(s.basket.apple).toBe(1);
    // removing past zero is a safe no-op
    s = removeFromBasket(s, "apple");
    s = removeFromBasket(s, "apple");
    expect(s.basket.apple).toBe(0);
  });

  it("confirmBasket stays on 'serving' with a hint when wrong, never fails hard", () => {
    let s = startLevel(initialMarketState(), 1, mulberry32(9));
    const wantedGood = s.order!.lines[0].good;
    s = confirmBasket(s); // empty basket
    expect(s.phase).toBe("serving");
    expect(s.hint).toBeTruthy();
    expect(s.order).toBeTruthy(); // same order, never thrown away
    s = addToBasket(s, wantedGood);
    // (may still be wrong if order needs more than 1, or more lines — but it must not crash)
    const result = confirmBasket(s);
    expect(["serving", "pay"]).toContain(result.phase);
  });
});

describe("change calculation and validation", () => {
  it("level 1 needs no change — payment equals the total exactly", () => {
    const s = startLevel(initialMarketState(), 1, mulberry32(3));
    const spec = levelSpec(1);
    expect(spec.needsChange).toBe(false);
    expect(paymentForOrder(s.order!.total, 1)).toBe(s.order!.total);
  });

  it("levels 2+ hand over a bill bigger than the total, so change is owed", () => {
    for (let level = 2; level <= 8; level++) {
      const rng = mulberry32(level * 17);
      const order = generateOrder(level, rng);
      const payment = paymentForOrder(order.total, level);
      expect(payment).toBeGreaterThanOrEqual(order.total);
    }
  });

  it("tapping coins that exactly cover the change finishes the sale", () => {
    let s = startLevel(initialMarketState(), 2, mulberry32(11));
    s = serveCorrectly(s);
    expect(s.phase).toBe("pay");
    const target = s.payment - s.order!.total;
    expect(target).toBeGreaterThan(0);
    s = payExactChange(s);
    expect(s.phase).toBe("fact");
    expect(s.coins).toBeGreaterThan(0);
    expect(s.stars).toBe(1);
  });

  it("a coin that would overshoot the change owed is refused, not applied", () => {
    let s = startLevel(initialMarketState(), 2, mulberry32(21));
    s = serveCorrectly(s);
    const target = s.payment - s.order!.total;
    // a 10-coin almost certainly overshoots a small single-item level-2 order
    if (target < 10) {
      const before = s.changeGiven;
      s = giveCoin(s, 10);
      expect(s.changeGiven).toBe(before); // rejected, not partially applied
      expect(s.hint).toMatch(/too much/i);
      expect(s.phase).toBe("pay"); // still paying, never punished into a fail state
    }
  });

  it("removeLastCoin undoes a tapped coin", () => {
    let s = startLevel(initialMarketState(), 2, mulberry32(33));
    s = serveCorrectly(s);
    const target = s.payment - s.order!.total;
    if (target >= 1) {
      s = giveCoin(s, 1);
      expect(s.changeGiven).toBe(1);
      s = removeLastCoin(s);
      expect(s.changeGiven).toBe(0);
      expect(s.changeCoins.length).toBe(0);
    }
  });

  it("collectPayment only finishes the sale when nothing is owed", () => {
    let s = startLevel(initialMarketState(), 1, mulberry32(4));
    s = serveCorrectly(s);
    expect(s.payment - s.order!.total).toBe(0);
    s = collectPayment(s);
    expect(s.phase).toBe("fact");
  });

  it("collectPayment is a no-op while change is still owed", () => {
    let s = startLevel(initialMarketState(), 3, mulberry32(44));
    s = serveCorrectly(s);
    const target = s.payment - s.order!.total;
    if (target > 0) {
      const before = s;
      s = collectPayment(s);
      expect(s).toBe(before);
    }
  });
});

describe("level progression", () => {
  it("startLevel resets served/queue/mistakes and seeds a fresh order", () => {
    let s = initialMarketState();
    s = { ...s, served: 9, mistakes: 9 };
    s = startLevel(s, 2, mulberry32(5));
    expect(s.level).toBe(2);
    expect(s.served).toBe(0);
    expect(s.mistakes).toBe(0);
    expect(s.queue).toBe(levelSpec(2).customersPerLevel);
    expect(s.phase).toBe("serving");
    expect(s.order).toBeTruthy();
  });

  it("beginLevels always starts at level 1; resumeLevels picks up the best level reached", () => {
    const fresh = beginLevels(initialMarketState(), mulberry32(1));
    expect(fresh.level).toBe(1);
    const resumed = resumeLevels({ ...initialMarketState(), level: 4 }, mulberry32(1));
    expect(resumed.level).toBe(4);
    // never below 1, even from a never-played state
    const neverPlayed = resumeLevels(initialMarketState(), mulberry32(1));
    expect(neverPlayed.level).toBe(1);
  });

  it("serving enough customers completes a level and nextCustomer advances it", () => {
    const rng = mulberry32(77);
    let s = startLevel(initialMarketState(), 1, rng);
    const goal = levelSpec(1).customersPerLevel;
    for (let i = 0; i < goal; i++) {
      s = serveCorrectly(s);
      s = payExactChange(s);
      expect(s.phase).toBe("fact");
      if (i < goal - 1) {
        expect(s.pendingLevelUp).toBe(false);
        s = nextCustomer(s, rng);
        expect(s.phase).toBe("serving");
        expect(s.level).toBe(1);
      }
    }
    expect(s.pendingLevelUp).toBe(true);
    s = nextCustomer(s, rng);
    expect(s.level).toBe(2);
    expect(s.phase).toBe("serving");
    expect(s.bestLevel).toBe(2);
  });

  it("jam mode never sets pendingLevelUp and tracks no queue", () => {
    const rng = mulberry32(8);
    let s = enterJam(initialMarketState(), rng);
    expect(s.mode).toBe("jam");
    expect(s.queue).toBe(0);
    s = serveCorrectly(s);
    s = payExactChange(s);
    expect(s.phase).toBe("fact");
    expect(s.pendingLevelUp).toBe(false);
    s = nextCustomer(s, rng);
    expect(s.phase).toBe("serving");
    expect(s.mode).toBe("jam");
  });

  it("exitJam returns to the ready screen without touching stars/coins/level", () => {
    const rng = mulberry32(8);
    let s = enterJam(initialMarketState(), rng);
    s = serveCorrectly(s);
    s = payExactChange(s);
    const { stars, coins, level } = s;
    s = exitJam(s);
    expect(s.phase).toBe("ready");
    expect(s.mode).toBe("levels");
    expect(s.stars).toBe(stars);
    expect(s.coins).toBe(coins);
    expect(s.level).toBe(level);
  });
});

describe("persistence shape", () => {
  it("seedFromProgress / extractProgress round-trip a kid's saved progress", () => {
    const progress = { level: 4, stars: 12, totalCoins: 88, bestDay: 30 };
    const seeded = seedFromProgress(progress);
    expect(seeded.level).toBe(4);
    expect(seeded.bestLevel).toBe(4);
    expect(seeded.stars).toBe(12);
    expect(seeded.coins).toBe(88);
    expect(seeded.bestDay).toBe(30);
    expect(seeded.sessionCoins).toBe(0); // a fresh visit hasn't earned anything yet
    expect(extractProgress(seeded)).toEqual(progress);
  });

  it("seedFromProgress tolerates a missing/partial record (first ever visit)", () => {
    const seeded = seedFromProgress({});
    expect(seeded).toEqual(initialMarketState());
  });

  it("bestDay only ever grows, tracking the best single visit", () => {
    const rng = mulberry32(55);
    let s = seedFromProgress({ bestDay: 10 });
    s = startLevel(s, 1, rng);
    const orderTotal = s.order!.total;
    s = serveCorrectly(s);
    s = payExactChange(s);
    expect(s.sessionCoins).toBe(orderTotal); // first sale this visit
    expect(s.bestDay).toBe(Math.max(10, orderTotal));
  });
});

describe("goods registry sanity", () => {
  it("every good has a positive whole-coin price and a unique id", () => {
    const ids = new Set(GOODS.map((g) => g.id));
    expect(ids.size).toBe(GOODS.length);
    for (const g of GOODS) {
      expect(Number.isInteger(g.price)).toBe(true);
      expect(g.price).toBeGreaterThan(0);
    }
  });
});
