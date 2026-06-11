"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { localDateString } from "@/lib/data/queries";
import {
  CUDDLE_HAPPINESS,
  CUDDLE_XP,
  PET_ACCESSORIES,
  PET_FOODS,
  PET_SPECIES,
  PET_TRICKS,
  PLAY_COST,
  PLAY_ENERGY,
  PLAY_MIN_ENERGY,
  TRICK_HAPPINESS,
  TRICK_XP,
  WASH_COST,
  WASH_XP,
} from "@/lib/pet/config";
import {
  applyCareStreak,
  applyDecay,
  levelFromXp,
  playReward,
  rowToPet,
  type Pet,
} from "@/lib/pet/logic";

export type PetActionResult =
  | { ok: true; pet: Pet; pointsBalance: number }
  | { ok: false; error: string };

export type GiftReward =
  | { kind: "xp"; amount: number }
  | { kind: "happiness"; amount: number }
  | { kind: "energy"; amount: number }
  | { kind: "accessory"; accessoryId: string };

export type GiftResult =
  | { ok: true; pet: Pet; pointsBalance: number; reward: GiftReward }
  | { ok: false; error: string };

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

async function loadKidAndPet(kidId: string) {
  const supabase = await createClient();
  const [{ data: kid }, { data: petRow }] = await Promise.all([
    supabase
      .from("kids")
      .select("points_balance, family_id, families(timezone)")
      .eq("id", kidId)
      .maybeSingle(),
    supabase.from("kid_pets").select("*").eq("kid_id", kidId).maybeSingle(),
  ]);
  const timezone = (kid?.families as { timezone?: string } | null)?.timezone ?? "Australia/Sydney";
  return { supabase, kid, petRow, today: localDateString(timezone) };
}

/** Persist mutated state, charge stars, and return fresh state for the client */
async function savePet(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kidId: string,
  pet: Pet,
  starCost: number,
  pointsBalance: number,
): Promise<{ ok: true; pet: Pet; pointsBalance: number } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("kid_pets")
    .update({
      hunger: pet.hunger,
      happiness: pet.happiness,
      energy: pet.energy,
      cleanliness: pet.cleanliness,
      xp: pet.xp,
      accessories: pet.accessories,
      tricks: pet.tricks,
      is_sleeping: pet.isSleeping,
      total_stars_spent: pet.totalStarsSpent,
      care_streak: pet.careStreak,
      last_care_date: pet.lastCareDate,
      last_gift_date: pet.lastGiftDate,
      last_tick_at: pet.lastTickAt,
    })
    .eq("kid_id", kidId);
  if (error) return { ok: false, error: "Couldn't save — try again!" };

  if (starCost > 0) {
    const { error: decErr } = await supabase.rpc("decrement_kid_points", {
      p_kid_id: kidId,
      p_amount: starCost,
    });
    if (decErr) return { ok: false, error: "Couldn't spend stars — try again!" };
  }

  revalidatePath("/play/pet");
  return { ok: true, pet, pointsBalance: pointsBalance - starCost };
}

export async function adoptPet(
  kidId: string,
  speciesId: string,
  name: string,
  personalities: string[],
): Promise<PetActionResult> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 20) {
    return { ok: false, error: "Pick a name between 1 and 20 letters" };
  }
  if (!PET_SPECIES.some((s) => s.id === speciesId)) {
    return { ok: false, error: "Pick a pet first!" };
  }
  if (personalities.length !== 3) {
    return { ok: false, error: "Pick exactly 3 personality traits!" };
  }

  const { supabase, kid, petRow } = await loadKidAndPet(kidId);
  if (!kid) return { ok: false, error: "Kid not found" };
  if (petRow) return { ok: false, error: "You already have a pet!" };

  const { data, error } = await supabase
    .from("kid_pets")
    .insert({ kid_id: kidId, family_id: kid.family_id, name: trimmed, species: speciesId, personalities })
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't adopt — try again!" };

  revalidatePath("/play/pet");
  return { ok: true, pet: rowToPet(data), pointsBalance: kid.points_balance };
}

export async function feedPet(kidId: string, foodId: string): Promise<PetActionResult> {
  const food = PET_FOODS.find((f) => f.id === foodId);
  if (!food) return { ok: false, error: "Unknown food" };

  const { supabase, kid, petRow, today } = await loadKidAndPet(kidId);
  if (!kid || !petRow) return { ok: false, error: "Pet not found" };
  if (kid.points_balance < food.starCost) return { ok: false, error: "not_enough_stars" };

  let pet = applyDecay(rowToPet(petRow));
  if (pet.isSleeping) return { ok: false, error: `${pet.name} is asleep — wake them first!` };
  if (pet.hunger >= 100) return { ok: false, error: `${pet.name} is completely full!` };

  pet.hunger = clamp(pet.hunger + food.hunger);
  pet.happiness = clamp(pet.happiness + food.happiness);
  pet.xp += food.xp;
  pet.totalStarsSpent += food.starCost;
  pet = applyCareStreak(pet, today).pet;
  return savePet(supabase, kidId, pet, food.starCost, kid.points_balance);
}

/** Fetch mini-game finish — score (server-clamped) drives a variable reward */
export async function playWithPet(kidId: string, score: number): Promise<PetActionResult> {
  const { supabase, kid, petRow, today } = await loadKidAndPet(kidId);
  if (!kid || !petRow) return { ok: false, error: "Pet not found" };
  if (kid.points_balance < PLAY_COST) return { ok: false, error: "not_enough_stars" };

  let pet = applyDecay(rowToPet(petRow));
  if (pet.isSleeping) return { ok: false, error: `${pet.name} is asleep — wake them first!` };
  if (pet.energy < PLAY_MIN_ENERGY) {
    return { ok: false, error: `${pet.name} is too tired to play. Try a nap!` };
  }

  const reward = playReward(score);
  pet.happiness = clamp(pet.happiness + reward.happiness);
  pet.energy = clamp(pet.energy + PLAY_ENERGY);
  pet.xp += reward.xp;
  pet.totalStarsSpent += PLAY_COST;
  pet = applyCareStreak(pet, today).pet;
  return savePet(supabase, kidId, pet, PLAY_COST, kid.points_balance);
}

export async function washPet(kidId: string): Promise<PetActionResult> {
  const { supabase, kid, petRow, today } = await loadKidAndPet(kidId);
  if (!kid || !petRow) return { ok: false, error: "Pet not found" };
  if (kid.points_balance < WASH_COST) return { ok: false, error: "not_enough_stars" };

  let pet = applyDecay(rowToPet(petRow));
  if (pet.isSleeping) return { ok: false, error: `${pet.name} is asleep — wake them first!` };
  if (pet.cleanliness >= 95) return { ok: false, error: `${pet.name} is already squeaky clean!` };

  pet.cleanliness = 100;
  pet.xp += WASH_XP;
  pet.totalStarsSpent += WASH_COST;
  pet = applyCareStreak(pet, today).pet;
  return savePet(supabase, kidId, pet, WASH_COST, kid.points_balance);
}

export async function toggleSleep(kidId: string): Promise<PetActionResult> {
  const { supabase, kid, petRow } = await loadKidAndPet(kidId);
  if (!kid || !petRow) return { ok: false, error: "Pet not found" };

  const pet = applyDecay(rowToPet(petRow));
  pet.isSleeping = !pet.isSleeping;
  return savePet(supabase, kidId, pet, 0, kid.points_balance);
}

/** Free affection — small boost so kids without stars can still bond */
export async function cuddlePet(kidId: string): Promise<PetActionResult> {
  const { supabase, kid, petRow } = await loadKidAndPet(kidId);
  if (!kid || !petRow) return { ok: false, error: "Pet not found" };

  const pet = applyDecay(rowToPet(petRow));
  if (pet.isSleeping) return { ok: false, error: "sleeping" };

  pet.happiness = clamp(pet.happiness + CUDDLE_HAPPINESS);
  pet.xp += CUDDLE_XP;
  return savePet(supabase, kidId, pet, 0, kid.points_balance);
}

export async function buyAccessory(kidId: string, accessoryId: string): Promise<PetActionResult> {
  const accessory = PET_ACCESSORIES.find((a) => a.id === accessoryId);
  if (!accessory) return { ok: false, error: "Unknown item" };

  const { supabase, kid, petRow } = await loadKidAndPet(kidId);
  if (!kid || !petRow) return { ok: false, error: "Pet not found" };
  if (kid.points_balance < accessory.starCost) return { ok: false, error: "not_enough_stars" };

  const pet = applyDecay(rowToPet(petRow));
  if (pet.accessories.includes(accessoryId)) {
    return { ok: false, error: "You already own that!" };
  }
  if (levelFromXp(pet.xp) < accessory.minLevel) {
    return { ok: false, error: `Reach level ${accessory.minLevel} to unlock that!` };
  }

  pet.accessories = [...pet.accessories, accessoryId];
  pet.happiness = clamp(pet.happiness + 10);
  pet.xp += 5;
  pet.totalStarsSpent += accessory.starCost;
  return savePet(supabase, kidId, pet, accessory.starCost, kid.points_balance);
}

export async function learnTrick(kidId: string, trickId: string): Promise<PetActionResult> {
  const trick = PET_TRICKS.find((t) => t.id === trickId);
  if (!trick) return { ok: false, error: "Unknown trick" };

  const { supabase, kid, petRow } = await loadKidAndPet(kidId);
  if (!kid || !petRow) return { ok: false, error: "Pet not found" };
  if (kid.points_balance < trick.starCost) return { ok: false, error: "not_enough_stars" };

  const pet = applyDecay(rowToPet(petRow));
  if (pet.isSleeping) return { ok: false, error: `${pet.name} is asleep — wake them first!` };
  if (pet.tricks.includes(trickId)) return { ok: false, error: "Already learned!" };
  if (levelFromXp(pet.xp) < trick.minLevel) {
    return { ok: false, error: `Reach level ${trick.minLevel} to learn that!` };
  }

  pet.tricks = [...pet.tricks, trickId];
  pet.happiness = clamp(pet.happiness + 10);
  pet.xp += 8;
  pet.totalStarsSpent += trick.starCost;
  return savePet(supabase, kidId, pet, trick.starCost, kid.points_balance);
}

/** Performing a learned trick is always free */
export async function performTrick(kidId: string, trickId: string): Promise<PetActionResult> {
  const { supabase, kid, petRow } = await loadKidAndPet(kidId);
  if (!kid || !petRow) return { ok: false, error: "Pet not found" };

  const pet = applyDecay(rowToPet(petRow));
  if (pet.isSleeping) return { ok: false, error: `${pet.name} is asleep — wake them first!` };
  if (!pet.tricks.includes(trickId)) return { ok: false, error: "Not learned yet!" };

  pet.happiness = clamp(pet.happiness + TRICK_HAPPINESS);
  pet.xp += TRICK_XP;
  return savePet(supabase, kidId, pet, 0, kid.points_balance);
}

/** Set (or reset) personalities for an existing pet — called once after adoption for legacy pets */
export async function setPersonalities(kidId: string, personalities: string[]): Promise<PetActionResult> {
  if (personalities.length !== 3) return { ok: false, error: "Pick exactly 3 personality traits!" };

  const { supabase, kid, petRow } = await loadKidAndPet(kidId);
  if (!kid || !petRow) return { ok: false, error: "Pet not found" };

  const { error } = await supabase
    .from("kid_pets")
    .update({ personalities })
    .eq("kid_id", kidId);
  if (error) return { ok: false, error: "Couldn't save — try again!" };

  const pet = { ...applyDecay(rowToPet(petRow)), personalities };
  revalidatePath("/play/pet");
  return { ok: true, pet, pointsBalance: kid.points_balance };
}

/** Release the pet entirely — deletes the kid_pets row (tricks/accessories/XP live on it) */
export async function sayGoodbyeToPet(
  kidId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, kid } = await loadKidAndPet(kidId);
  if (!kid) return { ok: false, error: "Kid not found" };

  const { error } = await supabase.from("kid_pets").delete().eq("kid_id", kidId);
  if (error) return { ok: false, error: "Could not say goodbye — try again." };

  revalidatePath("/play/pet");
  return { ok: true }; // idempotent: deleting a missing row is still ok
}

/** Once-a-day surprise — the main "come back tomorrow" hook, always free */
export async function claimDailyGift(kidId: string): Promise<GiftResult> {
  const { supabase, kid, petRow, today } = await loadKidAndPet(kidId);
  if (!kid || !petRow) return { ok: false, error: "Pet not found" };

  const pet = applyDecay(rowToPet(petRow));
  if (pet.lastGiftDate === today) return { ok: false, error: "Come back tomorrow for the next gift! 🎁" };

  const level = levelFromXp(pet.xp);
  const unownedUnlocked = PET_ACCESSORIES.filter(
    (a) => !pet.accessories.includes(a.id) && a.minLevel <= level,
  );

  const roll = Math.random();
  let reward: GiftReward;
  if (roll < 0.12 && unownedUnlocked.length > 0) {
    const item = unownedUnlocked[Math.floor(Math.random() * unownedUnlocked.length)];
    pet.accessories = [...pet.accessories, item.id];
    reward = { kind: "accessory", accessoryId: item.id };
  } else if (roll < 0.45) {
    const amount = 10 + Math.floor(Math.random() * 16);
    pet.xp += amount;
    reward = { kind: "xp", amount };
  } else if (roll < 0.75) {
    const amount = 10 + Math.floor(Math.random() * 16);
    pet.happiness = clamp(pet.happiness + amount);
    reward = { kind: "happiness", amount };
  } else {
    const amount = 10 + Math.floor(Math.random() * 11);
    pet.energy = clamp(pet.energy + amount);
    reward = { kind: "energy", amount };
  }

  pet.lastGiftDate = today;
  const saved = await savePet(supabase, kidId, pet, 0, kid.points_balance);
  if (!saved.ok) return saved;
  return { ...saved, reward };
}
