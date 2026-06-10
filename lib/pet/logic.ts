/**
 * Star Pets game maths — pure functions, no I/O.
 * Shared by server actions (authoritative) and the client (live ticking).
 */

import {
  DECAY_PER_HOUR,
  MAX_LEVEL,
  PET_SPECIES,
  SLEEP_ENERGY_PER_HOUR,
  type PetSpecies,
} from "@/lib/pet/config";
import type { Database } from "@/lib/supabase/database.types";

export type PetRow = Database["public"]["Tables"]["kid_pets"]["Row"];

export interface Pet {
  id: string;
  kidId: string;
  name: string;
  species: string;
  hunger: number;
  happiness: number;
  energy: number;
  cleanliness: number;
  xp: number;
  accessories: string[];
  isSleeping: boolean;
  totalStarsSpent: number;
  lastTickAt: string;
  createdAt: string;
}

export type PetStage = "baby" | "child" | "teen" | "adult";

export function rowToPet(row: PetRow): Pet {
  return {
    id: row.id,
    kidId: row.kid_id,
    name: row.name,
    species: row.species,
    hunger: row.hunger,
    happiness: row.happiness,
    energy: row.energy,
    cleanliness: row.cleanliness,
    xp: row.xp,
    accessories: Array.isArray(row.accessories) ? (row.accessories as string[]) : [],
    isSleeping: row.is_sleeping,
    totalStarsSpent: row.total_stars_spent,
    lastTickAt: row.last_tick_at,
    createdAt: row.created_at,
  };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Advance stat decay/regen from pet.lastTickAt to `now`. Pure — returns a new Pet. */
export function applyDecay(pet: Pet, now: Date = new Date()): Pet {
  const hours = Math.max(0, (now.getTime() - new Date(pet.lastTickAt).getTime()) / 3_600_000);
  if (hours === 0) return pet;

  if (pet.isSleeping) {
    return {
      ...pet,
      hunger: clamp(pet.hunger - (DECAY_PER_HOUR.hunger / 2) * hours),
      energy: clamp(pet.energy + SLEEP_ENERGY_PER_HOUR * hours),
      cleanliness: clamp(pet.cleanliness - DECAY_PER_HOUR.cleanliness * hours),
      lastTickAt: now.toISOString(),
    };
  }

  return {
    ...pet,
    hunger: clamp(pet.hunger - DECAY_PER_HOUR.hunger * hours),
    happiness: clamp(pet.happiness - DECAY_PER_HOUR.happiness * hours),
    energy: clamp(pet.energy - DECAY_PER_HOUR.energy * hours),
    cleanliness: clamp(pet.cleanliness - DECAY_PER_HOUR.cleanliness * hours),
    lastTickAt: now.toISOString(),
  };
}

export function levelFromXp(xp: number): number {
  return Math.min(MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, xp) / 12)) + 1);
}

/** Cumulative XP needed to reach a level (inverse of levelFromXp) */
export function xpForLevel(level: number): number {
  return 12 * (level - 1) * (level - 1);
}

export function stageFromLevel(level: number): PetStage {
  if (level >= 12) return "adult";
  if (level >= 8) return "teen";
  if (level >= 4) return "child";
  return "baby";
}

export function getSpecies(id: string): PetSpecies {
  return PET_SPECIES.find((s) => s.id === id) ?? PET_SPECIES[0];
}

export function petEmoji(pet: Pet): string {
  const species = getSpecies(pet.species);
  const stage = stageFromLevel(levelFromXp(pet.xp));
  return stage === "teen" || stage === "adult" ? species.adultEmoji : species.babyEmoji;
}

export interface PetMood {
  id: "sleeping" | "starving" | "dirty" | "tired" | "lonely" | "ecstatic" | "happy";
  emoji: string;
  message: string;
}

/** Highest-priority need wins — drives the mood bubble and nudge text */
export function moodFor(pet: Pet): PetMood {
  if (pet.isSleeping) return { id: "sleeping", emoji: "💤", message: `Shh… ${pet.name} is snoozing.` };
  if (pet.hunger < 25) return { id: "starving", emoji: "🍽️", message: `${pet.name} is really hungry!` };
  if (pet.cleanliness < 30) return { id: "dirty", emoji: "🛁", message: `${pet.name} needs a bath!` };
  if (pet.energy < 20) return { id: "tired", emoji: "🥱", message: `${pet.name} is sleepy. Time for a nap?` };
  if (pet.happiness < 30) return { id: "lonely", emoji: "😢", message: `${pet.name} misses you. Play together?` };
  if (pet.hunger > 70 && pet.happiness > 70 && pet.energy > 70 && pet.cleanliness > 70) {
    return { id: "ecstatic", emoji: "🤩", message: `${pet.name} feels amazing! Best buddy ever.` };
  }
  return { id: "happy", emoji: "😊", message: `${pet.name} is happy to see you!` };
}
