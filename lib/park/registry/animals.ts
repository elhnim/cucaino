// Playable animals in Cucaino Park — the 24 animated Kenney "Cube Pets" (public/park-assets/pets).
// Kids pick one as themselves; their Star Pet is shown as the matching animal too.
// To add an animal: add its model to scripts/park-assets.json ("pets" kit) and an entry here.
import type { AnimalId } from "../assets/loader";

export interface ParkAnimal {
  id: AnimalId;
  name: string;
  emoji: string;
}

export const PARK_ANIMALS: ParkAnimal[] = [
  { id: "animal-fox", name: "Fox", emoji: "🦊" },
  { id: "animal-bunny", name: "Bunny", emoji: "🐰" },
  { id: "animal-cat", name: "Kitty", emoji: "🐱" },
  { id: "animal-dog", name: "Puppy", emoji: "🐶" },
  { id: "animal-panda", name: "Panda", emoji: "🐼" },
  { id: "animal-koala", name: "Koala", emoji: "🐨" },
  { id: "animal-lion", name: "Lion", emoji: "🦁" },
  { id: "animal-tiger", name: "Tiger", emoji: "🐯" },
  { id: "animal-pig", name: "Piggy", emoji: "🐷" },
  { id: "animal-penguin", name: "Penguin", emoji: "🐧" },
  { id: "animal-chick", name: "Chick", emoji: "🐥" },
  { id: "animal-monkey", name: "Monkey", emoji: "🐵" },
  { id: "animal-elephant", name: "Ellie", emoji: "🐘" },
  { id: "animal-giraffe", name: "Giraffe", emoji: "🦒" },
  { id: "animal-deer", name: "Deer", emoji: "🦌" },
  { id: "animal-cow", name: "Moo", emoji: "🐮" },
  { id: "animal-polar", name: "Polar Bear", emoji: "🐻‍❄️" },
  { id: "animal-beaver", name: "Beaver", emoji: "🦫" },
  { id: "animal-hog", name: "Hog", emoji: "🐗" },
  { id: "animal-parrot", name: "Parrot", emoji: "🦜" },
  { id: "animal-bee", name: "Bee", emoji: "🐝" },
  { id: "animal-caterpillar", name: "Wiggles", emoji: "🐛" },
  { id: "animal-crab", name: "Crab", emoji: "🦀" },
  { id: "animal-fish", name: "Fishy", emoji: "🐟" },
];

export function getParkAnimal(id: string | null | undefined): ParkAnimal {
  return PARK_ANIMALS.find((a) => a.id === id) ?? PARK_ANIMALS[0];
}

/** Kids already have an emoji avatar — start them as that animal when it matches. */
export function parkAnimalForAvatar(avatar: string | null | undefined): ParkAnimal {
  return PARK_ANIMALS.find((a) => a.emoji === avatar) ?? PARK_ANIMALS[0];
}

/** Star Pets species (lib/pet/config.ts) -> the Cube Pets model that plays them. */
const PET_LOOK: Record<string, AnimalId> = {
  kitten: "animal-cat",
  puppy: "animal-dog",
  bunny: "animal-bunny",
  panda: "animal-panda",
  elephant: "animal-elephant",
  lion: "animal-lion",
  monkey: "animal-monkey",
  hippo: "animal-hog",
  unicorn: "animal-deer",
  dragon: "animal-caterpillar",
};

export function parkAnimalForPet(species: string): AnimalId {
  return PET_LOOK[species] ?? "animal-dog";
}

const KEY = "cucaino.park.animal.";

export function loadParkAnimalChoice(kidId: string, avatar: string): ParkAnimal {
  try {
    const saved = window.localStorage.getItem(KEY + kidId);
    if (saved) return getParkAnimal(saved);
  } catch {
    // storage blocked — fall back to the avatar match
  }
  return parkAnimalForAvatar(avatar);
}

export function saveParkAnimalChoice(kidId: string, id: string) {
  try {
    window.localStorage.setItem(KEY + kidId, id);
  } catch {
    // cosmetic; they just pick again next time
  }
}
