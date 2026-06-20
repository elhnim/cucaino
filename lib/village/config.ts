// Village Pillage — card + balance config. Pure data, safe to import anywhere.

export type CardId = "farmer" | "bandit" | "wall" | "catapult" | "granny";

export interface CardMeta {
  id: CardId;
  name: string;
  emoji: string;
  /** Tailwind colour stem used to build gradients/rings in the UI. */
  color: "emerald" | "rose" | "stone" | "amber" | "violet";
  needsTarget: boolean;
  blurb: string;
}

export const CARDS: CardMeta[] = [
  { id: "farmer",   name: "Farmer",   emoji: "🌾", color: "emerald", needsTarget: false, blurb: "Harvest 3 turnips — unless a bandit robs you!" },
  { id: "bandit",   name: "Bandit",   emoji: "🦹", color: "rose",    needsTarget: true,  blurb: "Rob a rival. Steals a farmer's whole harvest! Blocked by walls." },
  { id: "wall",     name: "Wall",     emoji: "🧱", color: "stone",   needsTarget: false, blurb: "Block a bandit. +1 turnip if nobody attacks you." },
  { id: "catapult", name: "Catapult", emoji: "🎯", color: "amber",   needsTarget: true,  blurb: "Smash a wall and steal 2! Useless against the unwalled." },
  { id: "granny",   name: "Granny",   emoji: "👵", color: "violet",  needsTarget: false, blurb: "Scares off bandits & catapults — and grabs their loot!" },
];

export const CARD_BY_ID: Record<CardId, CardMeta> = Object.fromEntries(
  CARDS.map((c) => [c.id, c]),
) as Record<CardId, CardMeta>;

// Balance
export const START_TURNIPS = 5;
export const FARM_YIELD = 3;
export const GOAL = 20;
export const MAX_ROUNDS = 15;
export const WALL_BONUS = 1;
export const GRANNY_BONUS = 1;
export const CATAPULT_STEAL = 2;
export const GRANNY_COUNTER = 2;
export const BANDIT_STASH_STEAL = 1;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

// Fun village avatars assigned by seat order.
export const VILLAGE_AVATARS = ["🦊", "🐻", "🐼", "🐸", "🦉", "🐲"];
