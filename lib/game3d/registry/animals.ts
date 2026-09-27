// Registry of playable animal characters for the 3D world.
//
// To add a new animal: append one entry below. Everything (the in-world wardrobe, the
// kid-picker scene, the player model) reads from this list, and every look is built from
// the same handful of procedural parts in character.ts — no model files to ship.

export type EarStyle = "pointy" | "round" | "long" | "small" | "none" | "horn";
export type TailStyle = "bushy" | "puff" | "thin" | "curly" | "flat" | "none";
export type Extra = "eye-patches" | "mane" | "beak" | "stripes" | "spikes" | "cheeks" | "snout" | "trunk";

export interface AnimalDef {
  id: string;
  name: string;
  emoji: string;
  body: string;
  belly: string;
  /** ear/tail colour; omit to use the kid's theme accent */
  trim?: string;
  ears: EarStyle;
  tail: TailStyle;
  extras?: Extra[];
}

export const ANIMALS: AnimalDef[] = [
  { id: "fox", name: "Fox", emoji: "🦊", body: "#f39a4c", belly: "#fff6e6", trim: "#e0782f", ears: "pointy", tail: "bushy" },
  { id: "cat", name: "Kitty", emoji: "🐱", body: "#f3cf8f", belly: "#fff6e6", ears: "pointy", tail: "thin", extras: ["cheeks"] },
  { id: "bunny", name: "Bunny", emoji: "🐰", body: "#f5f0f0", belly: "#ffe3ec", trim: "#ffc2d4", ears: "long", tail: "puff", extras: ["cheeks"] },
  { id: "bear", name: "Bear", emoji: "🐻", body: "#a8744a", belly: "#e8c9a0", trim: "#8a5a34", ears: "small", tail: "puff" },
  { id: "panda", name: "Panda", emoji: "🐼", body: "#fbfbf7", belly: "#ffffff", trim: "#2a2a2a", ears: "small", tail: "puff", extras: ["eye-patches"] },
  { id: "koala", name: "Koala", emoji: "🐨", body: "#a9adb5", belly: "#e8eaee", trim: "#8d9199", ears: "round", tail: "none", extras: ["snout"] },
  { id: "lion", name: "Lion", emoji: "🦁", body: "#f2c35c", belly: "#fff0c9", trim: "#c7782a", ears: "small", tail: "thin", extras: ["mane"] },
  { id: "tiger", name: "Tiger", emoji: "🐯", body: "#f59b3a", belly: "#fff3e0", trim: "#2a2016", ears: "small", tail: "thin", extras: ["stripes"] },
  { id: "pig", name: "Piggy", emoji: "🐷", body: "#ffb3c7", belly: "#ffd6e2", trim: "#f58fae", ears: "pointy", tail: "curly", extras: ["snout"] },
  { id: "frog", name: "Froggy", emoji: "🐸", body: "#6cc04a", belly: "#dff5c8", trim: "#4f9a33", ears: "none", tail: "none", extras: ["cheeks"] },
  { id: "penguin", name: "Penguin", emoji: "🐧", body: "#2f3440", belly: "#ffffff", trim: "#ffb02e", ears: "none", tail: "flat", extras: ["beak"] },
  { id: "unicorn", name: "Unicorn", emoji: "🦄", body: "#fdf7ff", belly: "#ffffff", trim: "#c084fc", ears: "horn", tail: "bushy", extras: ["mane"] },
  { id: "dragon", name: "Dragon", emoji: "🐲", body: "#4fc38a", belly: "#f6e7a8", trim: "#2f9d68", ears: "horn", tail: "thin", extras: ["spikes"] },
  { id: "dog", name: "Puppy", emoji: "🐶", body: "#d9a066", belly: "#fff2dc", trim: "#8a5a34", ears: "round", tail: "thin" },
  { id: "raccoon", name: "Raccoon", emoji: "🦝", body: "#9b9aa3", belly: "#e8e6ea", trim: "#3a3940", ears: "pointy", tail: "bushy", extras: ["eye-patches", "stripes"] },
  { id: "cow", name: "Moo", emoji: "🐮", body: "#fbfbf7", belly: "#ffd6e2", trim: "#3a3a3a", ears: "small", tail: "thin", extras: ["snout", "eye-patches"] },
  { id: "wolf", name: "Wolf", emoji: "🐺", body: "#9aa4b5", belly: "#eef1f6", trim: "#6b7588", ears: "pointy", tail: "bushy" },
  { id: "hamster", name: "Hammy", emoji: "🐹", body: "#f2c890", belly: "#fff6e6", trim: "#e0a86a", ears: "round", tail: "none", extras: ["cheeks"] },
  { id: "chick", name: "Chick", emoji: "🐥", body: "#ffe066", belly: "#fff3b0", trim: "#ffb02e", ears: "none", tail: "flat", extras: ["beak"] },
  { id: "elephant", name: "Ellie", emoji: "🐘", body: "#a9b4c6", belly: "#d6dde8", trim: "#8f9bb0", ears: "round", tail: "thin", extras: ["trunk"] },
  { id: "hippo", name: "Hippo", emoji: "🦛", body: "#b59ad0", belly: "#e8dcf3", trim: "#9b7fb8", ears: "small", tail: "thin", extras: ["snout"] },
  { id: "monkey", name: "Monkey", emoji: "🐵", body: "#a9745b", belly: "#f2d4b8", trim: "#f2d4b8", ears: "round", tail: "curly" },
  { id: "owl", name: "Owly", emoji: "🦉", body: "#b0875a", belly: "#f3e3c3", trim: "#ffb02e", ears: "pointy", tail: "flat", extras: ["beak"] },
  { id: "turtle", name: "Turtle", emoji: "🐢", body: "#7cc26b", belly: "#e7f5c8", trim: "#5b8f3e", ears: "none", tail: "thin", extras: ["stripes"] },
];

/** Star Pets species (lib/pet/config.ts) -> the 3D look used for the pet following the kid. */
const PET_SPECIES_LOOK: Record<string, string> = {
  dragon: "dragon",
  kitten: "cat",
  puppy: "dog",
  bunny: "bunny",
  panda: "panda",
  unicorn: "unicorn",
  elephant: "elephant",
  lion: "lion",
  hippo: "hippo",
  monkey: "monkey",
};

export function animalForPetSpecies(species: string): AnimalDef | undefined {
  const id = PET_SPECIES_LOOK[species];
  return id ? getAnimal(id) : undefined;
}

export const DEFAULT_ANIMAL_ID = "fox";

export function getAnimal(id: string | null | undefined): AnimalDef {
  return ANIMALS.find((a) => a.id === id) ?? ANIMALS[0];
}

/** Kids already have an emoji avatar — if it's an animal, start them as that animal. */
export function animalForAvatar(avatar: string | null | undefined): AnimalDef {
  return ANIMALS.find((a) => a.emoji === avatar) ?? getAnimal(DEFAULT_ANIMAL_ID);
}

const STORAGE_PREFIX = "cucaino.world.animal.";

/** The kid's picked animal is a per-device cosmetic, so it lives in localStorage (no DB change). */
export function loadAnimalChoice(kidId: string, avatar: string): AnimalDef {
  try {
    const saved = window.localStorage.getItem(STORAGE_PREFIX + kidId);
    if (saved) return getAnimal(saved);
  } catch {
    // storage blocked (private mode etc.) — fall through to the avatar default
  }
  return animalForAvatar(avatar);
}

export function saveAnimalChoice(kidId: string, animalId: string) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + kidId, animalId);
  } catch {
    // non-essential; the kid just re-picks next time
  }
}
