/**
 * Star Pets registry — species, foods, accessories, tricks, personalities and tuning.
 * Pure data; all game maths lives in lib/pet/logic.ts.
 */

export interface PetSpecies {
  id: string;
  name: string;
  babyEmoji: string;
  adultEmoji: string;
  personality: string;
  /** CSS color for the species (used in adopt screen etc.) */
  color: string;
}

export const PET_SPECIES: PetSpecies[] = [
  { id: "dragon",  name: "Dragon",  babyEmoji: "🐲", adultEmoji: "🐉", personality: "Brave & fiery",     color: "#4CAF50" },
  { id: "kitten",  name: "Kitten",  babyEmoji: "🐱", adultEmoji: "🐈", personality: "Curious & cuddly",  color: "#F0A060" },
  { id: "puppy",   name: "Puppy",   babyEmoji: "🐶", adultEmoji: "🐕", personality: "Loyal & playful",   color: "#C87840" },
  { id: "bunny",   name: "Bunny",   babyEmoji: "🐰", adultEmoji: "🐇", personality: "Quick & gentle",    color: "#C890A0" },
  { id: "panda",   name: "Panda",   babyEmoji: "🐼", adultEmoji: "🐼", personality: "Chill & hungry",    color: "#666666" },
  { id: "unicorn", name: "Unicorn", babyEmoji: "🦄", adultEmoji: "🦄", personality: "Magical & rare",    color: "#9070F0" },
];

export interface PetPersonality {
  id: string;
  label: string;
  emoji: string;
  description: string;
}

export const PET_PERSONALITIES: PetPersonality[] = [
  { id: "brave",    label: "Brave",    emoji: "🦁", description: "Bold & adventurous" },
  { id: "cheerful", label: "Cheerful", emoji: "🌞", description: "Always happy & bubbly" },
  { id: "curious",  label: "Curious",  emoji: "🔍", description: "Loves to learn & explore" },
  { id: "gentle",   label: "Gentle",   emoji: "🌸", description: "Kind-hearted & calm" },
  { id: "playful",  label: "Playful",  emoji: "🎮", description: "Silly & loves jokes" },
  { id: "wise",     label: "Wise",     emoji: "🦉", description: "Thoughtful & gives advice" },
];

/** Level at which the pet starts talking to its kid */
export const SPEECH_UNLOCK_LEVEL = 5;

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
  minLevel: number;
}

export const PET_ACCESSORIES: PetAccessory[] = [
  { id: "ball",       emoji: "🎾", label: "Bouncy ball", starCost: 5,  minLevel: 1 },
  { id: "plant",      emoji: "🪴", label: "House plant", starCost: 8,  minLevel: 2 },
  { id: "bow",        emoji: "🎀", label: "Bow",         starCost: 8,  minLevel: 2 },
  { id: "teddy",      emoji: "🧸", label: "Teddy",       starCost: 12, minLevel: 3 },
  { id: "hat",        emoji: "🎩", label: "Top hat",     starCost: 12, minLevel: 4 },
  { id: "sunglasses", emoji: "🕶️", label: "Sunglasses",  starCost: 15, minLevel: 5 },
  { id: "skateboard", emoji: "🛹", label: "Skateboard",  starCost: 20, minLevel: 6 },
  { id: "slide",      emoji: "🛝", label: "Slide",       starCost: 25, minLevel: 7 },
  { id: "crown",      emoji: "👑", label: "Crown",       starCost: 30, minLevel: 8 },
  { id: "rainbow",    emoji: "🌈", label: "Rainbow",     starCost: 35, minLevel: 10 },
  { id: "castle",     emoji: "🏰", label: "Castle",      starCost: 45, minLevel: 12 },
  { id: "rocket",     emoji: "🚀", label: "Rocket",      starCost: 60, minLevel: 15 },
];

export interface PetTrick {
  id: string;
  emoji: string;
  label: string;
  starCost: number;
  minLevel: number;
}

export const PET_TRICKS: PetTrick[] = [
  { id: "spin",     emoji: "🌀", label: "Spin",      starCost: 5,  minLevel: 2 },
  { id: "dance",    emoji: "🎵", label: "Dance",     starCost: 8,  minLevel: 4 },
  { id: "highfive", emoji: "✋", label: "High five", starCost: 12, minLevel: 6 },
  { id: "backflip", emoji: "🤸", label: "Backflip",  starCost: 18, minLevel: 8 },
  { id: "sing",     emoji: "🎤", label: "Sing",      starCost: 25, minLevel: 10 },
  { id: "magic",    emoji: "🪄", label: "Magic",     starCost: 40, minLevel: 13 },
];

export const TRICK_HAPPINESS = 5;
export const TRICK_XP = 1;

export const PLAY_COST = 2;
export const PLAY_ENERGY = -15;
export const PLAY_MIN_ENERGY = 10;
export const PLAY_MAX_SCORE = 25;
export const PLAY_SECONDS = 15;

export const WASH_COST = 2;
export const WASH_XP = 4;

export const CUDDLE_HAPPINESS = 3;
export const CUDDLE_XP = 1;

export const STREAK_XP_PER_DAY = 2;
export const STREAK_XP_CAP_DAYS = 7;

export const DECAY_PER_HOUR = {
  hunger: 4,
  happiness: 3,
  energy: 3,
  cleanliness: 2,
};

export const SLEEP_ENERGY_PER_HOUR = 12;

export const MAX_LEVEL = 30;
