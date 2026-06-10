/**
 * Star Pets game maths — pure functions, no I/O.
 * Shared by server actions (authoritative) and the client (live ticking).
 */

import {
  DECAY_PER_HOUR,
  MAX_LEVEL,
  PET_SPECIES,
  PLAY_MAX_SCORE,
  SLEEP_ENERGY_PER_HOUR,
  STREAK_XP_CAP_DAYS,
  STREAK_XP_PER_DAY,
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
  tricks: string[];
  isSleeping: boolean;
  totalStarsSpent: number;
  careStreak: number;
  lastCareDate: string | null;
  lastGiftDate: string | null;
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
    tricks: Array.isArray(row.tricks) ? (row.tricks as string[]) : [],
    isSleeping: row.is_sleeping,
    totalStarsSpent: row.total_stars_spent,
    careStreak: row.care_streak,
    lastCareDate: row.last_care_date,
    lastGiftDate: row.last_gift_date,
    lastTickAt: row.last_tick_at,
    createdAt: row.created_at,
  };
}

/**
 * Bank the daily care streak. Call on the first PAID care action of a day:
 * consecutive days extend the streak (capped XP bonus), gaps reset it to 1.
 * Returns the same pet if today is already banked.
 */
export function applyCareStreak(pet: Pet, today: string): { pet: Pet; bonusXp: number } {
  if (pet.lastCareDate === today) return { pet, bonusXp: 0 };

  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const streak = pet.lastCareDate === yesterdayStr ? pet.careStreak + 1 : 1;
  const bonusXp = STREAK_XP_PER_DAY * Math.min(streak, STREAK_XP_CAP_DAYS);
  return {
    pet: { ...pet, careStreak: streak, lastCareDate: today, xp: pet.xp + bonusXp },
    bonusXp,
  };
}

/** Variable reward for the fetch mini-game — better score, bigger boost */
export function playReward(score: number): { happiness: number; xp: number } {
  const s = Math.max(0, Math.min(PLAY_MAX_SCORE, Math.round(score)));
  return {
    happiness: Math.min(35, 10 + s),
    xp: Math.min(14, 3 + Math.floor(s / 2)),
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
