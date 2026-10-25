// Market stall mini-game state machine (pure, no I/O, no timers — same shape as
// lib/park/fishing/logic.ts and lib/park/drumming/logic.ts, no clock ticks needed here since
// nothing in a market sale is time-pressured).
//
// ready -> serving (a customer's order is shown; tap shelf goods into the basket, "Serve" checks
// it) -> pay (the order was right: the customer hands over coins — exact at first, later more
// than owed) -> [give change by tapping coins, if any is owed] -> fact (a happy customer, coins in
// the jar, a star, and a fact card) -> back to serving with the next customer, or a level-up.
//
// Getting the basket or the change wrong is always a gentle hint, never a fail: the kid just tries
// again on the very same order. A free "Open shop" (jam) mode serves endless customers with mixed
// difficulty and no level-up banner, just for fun.
import { GOODS, getGood, nameForQty, type GoodDef, type GoodId } from "./goods";

export type RNGFn = () => number;

/** Deterministic seeded PRNG (mulberry32) — same seed always gives the same sequence. */
export function mulberry32(seed: number): RNGFn {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(arr: readonly T[], rng: RNGFn): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type MarketPhase = "ready" | "serving" | "pay" | "fact";
export type MarketMode = "levels" | "jam";

/** how one level shapes its orders — grows gently from "1 kind of thing" to "a proper shop run" */
export interface LevelSpec {
  /** how many different goods appear in one order */
  lineCount: number;
  /** most of any one good an order will ask for */
  maxQty: number;
  /** order totals (and so payments) stay within this many coins */
  moneyCap: number;
  /** from here on, the customer's payment needs change back, not just "exact coins" */
  needsChange: boolean;
  /** how many customers served completes this level */
  customersPerLevel: number;
}

const MAX_SPEC_LEVEL = 10;

export function levelSpec(level: number): LevelSpec {
  const l = Math.max(1, Math.min(level, MAX_SPEC_LEVEL));
  return {
    lineCount: l <= 2 ? 1 : l <= 5 ? 2 : 3,
    maxQty: l <= 1 ? 2 : l <= 3 ? 3 : l <= 6 ? 4 : 5,
    moneyCap: l <= 4 ? 20 : 50,
    needsChange: l >= 2,
    customersPerLevel: l <= 2 ? 3 : l <= 6 ? 4 : 5,
  };
}

export interface OrderLine {
  good: GoodId;
  qty: number;
}

export interface Order {
  lines: readonly OrderLine[];
  total: number;
  /** the difficulty level this order was generated for (jam mode mixes levels per order) */
  level: number;
}

/** Build a fresh order for a level (seeded, so this is deterministic in tests). Retries a few
 * random quantity rolls to land within the level's money cap, then falls back to "one each". */
export function generateOrder(level: number, rng: RNGFn, pool: readonly GoodDef[] = GOODS): Order {
  const spec = levelSpec(level);
  const lineCount = Math.max(1, Math.min(spec.lineCount, pool.length));
  const chosen = shuffled(pool, rng).slice(0, lineCount);
  let lines: OrderLine[] = [];
  let total = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    lines = chosen.map((g) => ({ good: g.id, qty: 1 + Math.floor(rng() * spec.maxQty) }));
    total = lines.reduce((sum, l) => sum + (getGood(l.good)?.price ?? 0) * l.qty, 0);
    if (total <= spec.moneyCap) break;
  }
  if (total > spec.moneyCap) {
    lines = chosen.map((g) => ({ good: g.id, qty: 1 }));
    total = lines.reduce((sum, l) => sum + (getGood(l.good)?.price ?? 0) * l.qty, 0);
  }
  return { lines, total, level };
}

/** A spoken + pictured order line, e.g. "2 apples" or "a loaf of bread" — for the speech bubble. */
export function orderLineText(line: OrderLine): string {
  const good = getGood(line.good);
  if (!good) return "";
  return line.qty === 1 ? good.article : `${line.qty} ${nameForQty(good, line.qty)}`;
}

/** The whole order as one kid-friendly sentence, e.g. "2 apples and a loaf of bread, please!" */
export function orderSentence(order: Order): string {
  const parts = order.lines.map((l) => orderLineText(l));
  if (parts.length === 1) return `${parts[0]}, please!`;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}, please!`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}, please!`;
}

export type Basket = Partial<Record<GoodId, number>>;

/** What's wrong with the basket right now, in one gentle sentence — or null when it's exactly
 * right. Checked only when the kid taps "Serve", never while they're still filling it. */
export function hintForBasket(order: Order, basket: Basket): string | null {
  for (const line of order.lines) {
    const good = getGood(line.good);
    if (!good) continue;
    const have = basket[line.good] ?? 0;
    if (have < line.qty) {
      return `Count again: you need ${line.qty} ${nameForQty(good, line.qty)} ${good.emoji.repeat(line.qty)}`;
    }
    if (have > line.qty) {
      return `Oops, too many ${good.plural}! You only need ${line.qty} ${good.emoji.repeat(line.qty)} — tap one to put it back.`;
    }
  }
  const ordered = new Set(order.lines.map((l) => l.good));
  for (const id of Object.keys(basket) as GoodId[]) {
    const have = basket[id] ?? 0;
    if (have > 0 && !ordered.has(id)) {
      const good = getGood(id);
      return `This order doesn't need any ${good ? good.plural : "of that"} — tap it to put it back on the shelf.`;
    }
  }
  return null;
}

/** bill a customer can hand over (kid gives change back only in coins 1/2/5/10, see COIN_VALUES) */
export const BILL_VALUES = [1, 2, 5, 10, 20, 50] as const;
export const COIN_VALUES = [10, 5, 2, 1] as const;
export type CoinValue = (typeof COIN_VALUES)[number];

/** What the customer pays: exact coins while a level doesn't need change yet, otherwise the
 * smallest bill (within the level's money cap) that's actually more than the total. */
export function paymentForOrder(total: number, level: number): number {
  const spec = levelSpec(level);
  if (!spec.needsChange) return total;
  const candidates = BILL_VALUES.filter((v) => v > total && v <= spec.moneyCap);
  if (candidates.length === 0) return total;
  return Math.min(...candidates);
}

export interface MarketProgress {
  /** best level reached so far */
  level: number;
  stars: number;
  totalCoins: number;
  /** most coins earned in a single visit to the stall */
  bestDay: number;
}

export interface MarketState {
  phase: MarketPhase;
  mode: MarketMode;
  level: number;
  bestLevel: number;
  stars: number;
  /** lifetime coins in the jar (persisted; keeps growing across visits, like `stars`) */
  coins: number;
  /** coins earned just this visit — compared against `bestDay` when the stall is closed */
  sessionCoins: number;
  bestDay: number;
  /** customers served so far in the current level */
  served: number;
  /** customers left to serve this level, including whoever's at the counter now */
  queue: number;
  mistakes: number;
  /** the current customer finished the level's last sale — the fact card's button should say so */
  pendingLevelUp: boolean;
  order: Order | null;
  basket: Basket;
  /** what the customer handed over */
  payment: number;
  /** how much change the kid has tapped out so far */
  changeGiven: number;
  changeCoins: readonly CoinValue[];
  hint: string | null;
}

export function initialMarketState(): MarketState {
  return {
    phase: "ready",
    mode: "levels",
    level: 0,
    bestLevel: 0,
    stars: 0,
    coins: 0,
    sessionCoins: 0,
    bestDay: 0,
    served: 0,
    queue: 0,
    mistakes: 0,
    pendingLevelUp: false,
    order: null,
    basket: {},
    payment: 0,
    changeGiven: 0,
    changeCoins: [],
    hint: null,
  };
}

/** Seed a fresh state from a kid's saved progress (resumes at their best level). */
export function seedFromProgress(p: Partial<MarketProgress>): MarketState {
  return {
    ...initialMarketState(),
    level: p.level ?? 0,
    bestLevel: p.level ?? 0,
    stars: p.stars ?? 0,
    coins: p.totalCoins ?? 0,
    bestDay: p.bestDay ?? 0,
  };
}

/** What to persist right now — call after every sale (phase "fact") and on close. */
export function extractProgress(s: MarketState): MarketProgress {
  return { level: s.bestLevel, stars: s.stars, totalCoins: s.coins, bestDay: s.bestDay };
}

function beginOrder(s: MarketState, rng: RNGFn): MarketState {
  const genLevel = s.mode === "jam" ? 1 + Math.floor(rng() * 5) : s.level;
  return { ...s, phase: "serving", order: generateOrder(genLevel, rng), basket: {}, hint: null };
}

/** Start (or restart) a given level with a brand-new first order. */
export function startLevel(s: MarketState, level: number, rng: RNGFn): MarketState {
  const spec = levelSpec(level);
  return beginOrder(
    { ...s, mode: "levels", level, bestLevel: Math.max(s.bestLevel, level), served: 0, queue: spec.customersPerLevel, mistakes: 0, pendingLevelUp: false },
    rng,
  );
}

/** From the ready screen, begin level 1. */
export function beginLevels(s: MarketState, rng: RNGFn): MarketState {
  return startLevel(s, 1, rng);
}

/** From the ready screen, pick up at the best level reached before (or start at 1 if brand new). */
export function resumeLevels(s: MarketState, rng: RNGFn): MarketState {
  return startLevel(s, Math.max(1, s.level), rng);
}

/** Switch to free-play "Open shop" — endless mixed-difficulty customers, no level-up banner. */
export function enterJam(s: MarketState, rng: RNGFn): MarketState {
  return beginOrder({ ...s, mode: "jam", served: 0, queue: 0, mistakes: 0, pendingLevelUp: false }, rng);
}

/** Leave Open shop back to the ready screen (level, stars and coins are untouched). */
export function exitJam(s: MarketState): MarketState {
  return { ...s, mode: "levels", phase: "ready", order: null, basket: {}, hint: null };
}

/** Tap a shelf good into the basket. */
export function addToBasket(s: MarketState, good: GoodId): MarketState {
  if (s.phase !== "serving") return s;
  return { ...s, basket: { ...s.basket, [good]: (s.basket[good] ?? 0) + 1 }, hint: null };
}

/** Tap a basket item to put one back on the shelf (fixing an overfilled or wrong basket). */
export function removeFromBasket(s: MarketState, good: GoodId): MarketState {
  if (s.phase !== "serving") return s;
  const have = s.basket[good] ?? 0;
  if (have <= 0) return s;
  return { ...s, basket: { ...s.basket, [good]: have - 1 }, hint: null };
}

/** Check the basket against the order. Right -> move to paying; wrong -> a gentle hint, same order. */
export function confirmBasket(s: MarketState): MarketState {
  if (s.phase !== "serving" || !s.order) return s;
  const hint = hintForBasket(s.order, s.basket);
  if (hint) return { ...s, hint, mistakes: s.mistakes + 1 };
  return { ...s, phase: "pay", payment: paymentForOrder(s.order.total, s.order.level), changeGiven: 0, changeCoins: [], hint: null };
}

function finishSale(s: MarketState): MarketState {
  if (!s.order) return s;
  const earned = s.order.total;
  const coins = s.coins + earned;
  const sessionCoins = s.sessionCoins + earned;
  const stars = s.stars + 1;
  const spec = levelSpec(s.level);
  const servedNow = s.served + 1;
  const leveledUp = s.mode === "levels" && servedNow >= spec.customersPerLevel;
  return {
    ...s,
    phase: "fact",
    order: null,
    basket: {},
    payment: 0,
    changeGiven: 0,
    changeCoins: [],
    hint: null,
    coins,
    sessionCoins,
    stars,
    bestLevel: Math.max(s.bestLevel, s.level),
    bestDay: Math.max(s.bestDay, sessionCoins),
    served: leveledUp ? 0 : servedNow,
    queue: leveledUp ? 0 : Math.max(0, spec.customersPerLevel - servedNow),
    pendingLevelUp: leveledUp,
  };
}

/** Collect an exact payment (no change owed) — the level-1 "just hand it over" case. */
export function collectPayment(s: MarketState): MarketState {
  if (s.phase !== "pay" || !s.order) return s;
  if (s.payment - s.order.total !== 0) return s;
  return finishSale(s);
}

/** Tap one coin (1/2/5/10) onto the counter as change. Reaching the exact amount owed finishes the
 * sale on the spot; a coin that would overshoot is gently refused (not applied) with a hint. */
export function giveCoin(s: MarketState, coin: CoinValue): MarketState {
  if (s.phase !== "pay" || !s.order) return s;
  const target = s.payment - s.order.total;
  if (target <= 0) return s;
  const prospective = s.changeGiven + coin;
  if (prospective > target) {
    return { ...s, hint: "That's too much change! Try a smaller coin.", mistakes: s.mistakes + 1 };
  }
  const changeCoins = [...s.changeCoins, coin];
  const next: MarketState = { ...s, changeGiven: prospective, changeCoins, hint: null };
  return prospective === target ? finishSale(next) : next;
}

/** Undo the last coin tapped down, in case the kid changes their mind. */
export function removeLastCoin(s: MarketState): MarketState {
  if (s.phase !== "pay" || s.changeCoins.length === 0) return s;
  const removed = s.changeCoins[s.changeCoins.length - 1];
  return { ...s, changeCoins: s.changeCoins.slice(0, -1), changeGiven: s.changeGiven - removed, hint: null };
}

/** From the fact card, welcome the next customer (or start the next, slightly busier level). */
export function nextCustomer(s: MarketState, rng: RNGFn): MarketState {
  if (s.phase !== "fact") return s;
  if (s.pendingLevelUp) return startLevel({ ...s, pendingLevelUp: false }, s.level + 1, rng);
  return beginOrder(s, rng);
}
