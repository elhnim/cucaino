// Market stall mini-game data: the seven goods a kid can sell from the shelves. Pure data, no
// logic (lib/park/market/logic.ts does the ordering/pricing) — same split as
// lib/park/registry/fishFacts.ts feeding lib/park/fishing/logic.ts. Prices are small whole coins
// so every order's total stays simple arithmetic for 6-10 year olds.
export type GoodId = "apple" | "shell" | "cheese" | "bread" | "fish" | "wool" | "toy";

export interface GoodDef {
  id: GoodId;
  /** singular display name, capitalised */
  name: string;
  /** plural display name, lowercase, used in hint sentences */
  plural: string;
  /** the natural "a/an ..." phrase for exactly one, e.g. "a loaf of bread" */
  article: string;
  emoji: string;
  /** price in coins, always a whole number */
  price: number;
  /** flat two-tone colours for drawing this good's little shelf icon */
  colors: { a: string; b: string };
}

export const GOODS: readonly GoodDef[] = [
  { id: "apple", name: "Apple", plural: "apples", article: "an apple", emoji: "🍎", price: 1, colors: { a: "#ff6161", b: "#8a2a2a" } },
  { id: "shell", name: "Shell", plural: "shells", article: "a shell", emoji: "🐚", price: 2, colors: { a: "#ffd9c2", b: "#e8a37a" } },
  { id: "cheese", name: "Cheese", plural: "wedges of cheese", article: "a wedge of cheese", emoji: "🧀", price: 2, colors: { a: "#ffd766", b: "#e8a93a" } },
  { id: "bread", name: "Bread", plural: "loaves of bread", article: "a loaf of bread", emoji: "🍞", price: 3, colors: { a: "#d8a35c", b: "#9a6a2f" } },
  { id: "fish", name: "Fish", plural: "fish", article: "a fish", emoji: "🐟", price: 4, colors: { a: "#6fb8e0", b: "#3f86b5" } },
  { id: "wool", name: "Wool", plural: "balls of wool", article: "a ball of wool", emoji: "🧶", price: 5, colors: { a: "#f2ecff", b: "#b8a6e0" } },
  { id: "toy", name: "Toy", plural: "toys", article: "a toy", emoji: "🧸", price: 6, colors: { a: "#c98a4a", b: "#8a5a2a" } },
] as const;

export function getGood(id: GoodId): GoodDef | undefined {
  return GOODS.find((g) => g.id === id);
}

/** "apple" for 1, "apples" for anything else — used when building hint/order sentences. */
export function nameForQty(good: GoodDef, qty: number): string {
  return qty === 1 ? good.name.toLowerCase() : good.plural;
}
