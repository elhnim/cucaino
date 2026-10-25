// Buildable pieces for each kid's Dream Park. One entry = one thing kids can place with
// tickets. `w`/`d` = footprint in grid cells; `unlock` gates by level (lifetime stars) or
// streak so there's always something new to work towards. Add freely — just make sure the
// model is listed in scripts/park-assets.json.
import type { KitName } from "../assets/loader";

export type PieceCategory = "candy" | "nature" | "fun" | "stalls" | "rides";

export interface PieceDef {
  id: string;
  name: string;
  emoji: string;
  category: PieceCategory;
  kit: KitName;
  model: string;
  scale: number;
  cost: number;
  w: number;
  d: number;
  unlock?: { level?: number; streak?: number };
}

export const PIECE_CATEGORIES: { id: PieceCategory; label: string; emoji: string }[] = [
  { id: "candy", label: "Candy", emoji: "🍭" },
  { id: "nature", label: "Garden", emoji: "🌸" },
  { id: "fun", label: "Fun", emoji: "🎈" },
  { id: "stalls", label: "Stalls", emoji: "🏪" },
  { id: "rides", label: "Rides", emoji: "🎢" },
];

export const PIECES: PieceDef[] = [
  // candy — cheap and cheerful, the first things every kid can place
  { id: "lollipop", name: "Giant Lollipop", emoji: "🍭", category: "candy", kit: "food", model: "lollypop", scale: 10, cost: 1, w: 1, d: 1 },
  { id: "cupcake", name: "Cupcake House", emoji: "🧁", category: "candy", kit: "food", model: "cupcake", scale: 5, cost: 2, w: 1, d: 1 },
  { id: "donut", name: "Sprinkle Donut", emoji: "🍩", category: "candy", kit: "food", model: "donut-sprinkles", scale: 9, cost: 2, w: 2, d: 2 },
  { id: "choco-donut", name: "Choco Donut", emoji: "🍩", category: "candy", kit: "food", model: "donut-chocolate", scale: 9, cost: 2, w: 2, d: 2 },
  { id: "ice-cream", name: "Ice Cream Tower", emoji: "🍦", category: "candy", kit: "food", model: "ice-cream", scale: 6, cost: 3, w: 1, d: 1, unlock: { level: 2 } },
  { id: "sundae", name: "Mega Sundae", emoji: "🍨", category: "candy", kit: "food", model: "sundae", scale: 5.5, cost: 4, w: 1, d: 1, unlock: { level: 2 } },
  { id: "popsicle", name: "Popsicle", emoji: "🍡", category: "candy", kit: "food", model: "popsicle", scale: 7, cost: 2, w: 1, d: 1 },
  { id: "birthday-cake", name: "Birthday Cake", emoji: "🎂", category: "candy", kit: "food", model: "cake-birthday", scale: 4.5, cost: 6, w: 2, d: 2, unlock: { level: 3 } },
  { id: "candy-cane", name: "Candy Cane", emoji: "🍬", category: "candy", kit: "holiday", model: "candy-cane-red", scale: 6, cost: 1, w: 1, d: 1 },
  { id: "mint-cane", name: "Mint Cane", emoji: "🍬", category: "candy", kit: "holiday", model: "candy-cane-green", scale: 6, cost: 1, w: 1, d: 1 },
  { id: "cookie", name: "Cookie Stone", emoji: "🍪", category: "candy", kit: "food", model: "cookie-chocolate", scale: 9, cost: 1, w: 1, d: 1 },
  { id: "strawberry", name: "Strawberry", emoji: "🍓", category: "candy", kit: "food", model: "strawberry", scale: 9, cost: 2, w: 1, d: 1 },
  { id: "watermelon", name: "Melon Dome", emoji: "🍉", category: "candy", kit: "food", model: "watermelon", scale: 4.5, cost: 3, w: 2, d: 2, unlock: { level: 2 } },

  // garden
  { id: "candy-tree", name: "Candy Tree", emoji: "🌳", category: "nature", kit: "nature", model: "tree_default", scale: 3.2, cost: 1, w: 1, d: 1 },
  { id: "puff-tree", name: "Puff Tree", emoji: "🌳", category: "nature", kit: "nature", model: "tree_fat", scale: 3.2, cost: 1, w: 1, d: 1 },
  { id: "cone-tree", name: "Cone Tree", emoji: "🌲", category: "nature", kit: "nature", model: "tree_cone", scale: 3.2, cost: 1, w: 1, d: 1 },
  { id: "flowers", name: "Flower Patch", emoji: "🌸", category: "nature", kit: "coaster", model: "flowers", scale: 2.6, cost: 1, w: 1, d: 1 },
  { id: "mushrooms", name: "Mushroom Ring", emoji: "🍄", category: "nature", kit: "nature", model: "mushroom_redGroup", scale: 5, cost: 1, w: 1, d: 1 },
  { id: "bush", name: "Candy Bush", emoji: "🌿", category: "nature", kit: "nature", model: "plant_bushLarge", scale: 5, cost: 1, w: 1, d: 1 },
  { id: "hedge", name: "Hedge", emoji: "🟩", category: "nature", kit: "town", model: "hedge", scale: 2, cost: 1, w: 1, d: 1 },

  // fun
  { id: "fountain", name: "Sparkle Fountain", emoji: "⛲", category: "fun", kit: "town", model: "fountain-round-detail", scale: 2.2, cost: 8, w: 3, d: 3, unlock: { level: 2 } },
  { id: "lantern", name: "Lantern", emoji: "🏮", category: "fun", kit: "town", model: "lantern", scale: 2.2, cost: 1, w: 1, d: 1 },
  { id: "bench", name: "Bench", emoji: "🪑", category: "fun", kit: "coaster", model: "bench", scale: 2.6, cost: 1, w: 1, d: 1 },
  { id: "present", name: "Gift Pile", emoji: "🎁", category: "fun", kit: "holiday", model: "present-a-round", scale: 2.4, cost: 2, w: 1, d: 1 },
  { id: "gingerbread", name: "Gingerbread Pal", emoji: "🍪", category: "fun", kit: "holiday", model: "gingerbread-man", scale: 5, cost: 3, w: 1, d: 1, unlock: { streak: 3 } },
  { id: "windmill", name: "Windmill", emoji: "🌀", category: "fun", kit: "town", model: "windmill", scale: 1.6, cost: 10, w: 2, d: 2, unlock: { level: 3 } },

  // stalls
  { id: "food-stall", name: "Snack Stall", emoji: "🍔", category: "stalls", kit: "coaster", model: "stall-food", scale: 2.6, cost: 6, w: 2, d: 2, unlock: { level: 2 } },
  { id: "drink-stall", name: "Juice Stall", emoji: "🧃", category: "stalls", kit: "coaster", model: "stall-drinks", scale: 2.6, cost: 6, w: 2, d: 2, unlock: { level: 2 } },
  { id: "market-stall", name: "Candy Stall", emoji: "🍬", category: "stalls", kit: "town", model: "stall-red", scale: 2.6, cost: 5, w: 2, d: 2 },
  { id: "cart", name: "Candy Cart", emoji: "🛒", category: "stalls", kit: "town", model: "cart", scale: 2.4, cost: 4, w: 1, d: 2 },

  // rides — the big goals
  { id: "mini-train", name: "Choo-choo Train", emoji: "🚂", category: "rides", kit: "coaster", model: "coaster-train-front", scale: 2.4, cost: 12, w: 1, d: 2, unlock: { level: 3 } },
  { id: "station", name: "Ride Station", emoji: "🎢", category: "rides", kit: "coaster", model: "station", scale: 2.4, cost: 15, w: 2, d: 2, unlock: { level: 4, streak: 5 } },
  { id: "info-booth", name: "Info Booth", emoji: "ℹ️", category: "rides", kit: "coaster", model: "stall-information", scale: 2.6, cost: 8, w: 2, d: 2, unlock: { streak: 7 } },
];

export function getPiece(id: string): PieceDef | undefined {
  return PIECES.find((p) => p.id === id);
}
