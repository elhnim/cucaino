/**
 * Star Pets registry — species, foods, accessories and tuning constants.
 * Pure data; all game maths lives in lib/pet/logic.ts.
 *
 * Design rules (kids 5–12):
 * - The pet never dies or runs away — neglect makes it sad, never gone.
 * - Stars are the only currency; caring for the pet is the star sink that
 *   motivates earning more via tasks.
 */

export interface PetSpecies {
  id: string;
  name: string;
  /** Shown for baby/child stages */
  babyEmoji: string;
  /** Shown for teen/adult stages — the evolution moment */
  adultEmoji: string;
  personality: string;
}

export const PET_SPECIES: PetSpecies[] = [
  { id: "dragon",  name: "Dragon",  babyEmoji: "🐲", adultEmoji: "🐉", personality: "Brave & fiery" },
  { id: "kitten",  name: "Kitten",  babyEmoji: "🐱", adultEmoji: "🐈", personality: "Curious & cuddly" },
  { id: "puppy",   name: "Puppy",   babyEmoji: "🐶", adultEmoji: "🐕", personality: "Loyal & playful" },
  { id: "bunny",   name: "Bunny",   babyEmoji: "🐰", adultEmoji: "🐇", personality: "Quick & gentle" },
  { id: "panda",   name: "Panda",   babyEmoji: "🐼", adultEmoji: "🐼", personality: "Chill & hungry" },
  { id: "unicorn", name: "Unicorn", babyEmoji: "🦄", adultEmoji: "🦄", personality: "Magical & rare" },
];

export interface PetFood {
  id: string;
  emoji: string;
  label: string;
  starCost: number;
  hunger: number;
  happiness: number;
  xp: number;
}

export const PET_FOODS: PetFood[] = [
  { id: "apple", emoji: "🍎", label: "Apple",     starCost: 1, hunger: 15, happiness: 0,  xp: 3 },
  { id: "meal",  emoji: "🍝", label: "Big meal",  starCost: 3, hunger: 40, happiness: 5,  xp: 6 },
  { id: "treat", emoji: "🍪", label: "Treat",     starCost: 2, hunger: 10, happiness: 15, xp: 4 },
];

export interface PetAccessory {
  id: string;
  emoji: string;
  label: string;
  starCost: number;
}

export const PET_ACCESSORIES: PetAccessory[] = [
  { id: "ball",       emoji: "🎾", label: "Bouncy ball", starCost: 5 },
  { id: "bow",        emoji: "🎀", label: "Bow",         starCost: 8 },
  { id: "hat",        emoji: "🎩", label: "Top hat",     starCost: 12 },
  { id: "sunglasses", emoji: "🕶️", label: "Sunglasses",  starCost: 15 },
  { id: "skateboard", emoji: "🛹", label: "Skateboard",  starCost: 20 },
  { id: "crown",      emoji: "👑", label: "Crown",       starCost: 30 },
];

/** Action costs & effects (besides food, which is per-item above) */
export const PLAY_COST = 2;
export const PLAY_HAPPINESS = 25;
export const PLAY_ENERGY = -15;
export const PLAY_XP = 6;
export const PLAY_MIN_ENERGY = 10;

export const WASH_COST = 2;
export const WASH_XP = 4;

export const CUDDLE_HAPPINESS = 3;
export const CUDDLE_XP = 1;

/** Stat decay per hour while awake */
export const DECAY_PER_HOUR = {
  hunger: 4,
  happiness: 3,
  energy: 3,
  cleanliness: 2,
};

/** Energy regenerated per hour while sleeping (hunger decays at half rate) */
export const SLEEP_ENERGY_PER_HOUR = 12;

export const MAX_LEVEL = 30;
