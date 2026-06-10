"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  CUDDLE_HAPPINESS,
  CUDDLE_XP,
  PET_ACCESSORIES,
  PET_FOODS,
  PET_SPECIES,
  PLAY_COST,
  PLAY_ENERGY,
  PLAY_HAPPINESS,
  PLAY_MIN_ENERGY,
  PLAY_XP,
  WASH_COST,
  WASH_XP,
} from "@/lib/pet/config";
import { applyDecay, rowToPet, type Pet } from "@/lib/pet/logic";

export type PetActionResult =
  | { ok: true; pet: Pet; pointsBalance: number }
  | { ok: false; error: string };

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

async function loadKidAndPet(kidId: string) {
  const supabase = await createClient();
  const [{ data: kid }, { data: petRow }] = await Promise.all([
    supabase.from("kids").select("points_balance, family_id").eq("id", kidId).maybeSingle(),
    supabase.from("kid_pets").select("*").eq("kid_id", kidId).maybeSingle(),
  ]);
  return { supabase, kid, petRow };
}

/** Persist mutated stats, charge stars, and return fresh state for the client */
async function savePet(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kidId: string,
  pet: Pet,
  starCost: number,
  pointsBalance: number,
): Promise<PetActionResult> {
  const { error } = await supabase
    .from("kid_pets")
    .update({
      hunger: pet.hunger,
      happiness: pet.happiness,
      energy: pet.energy,
      cleanliness: pet.cleanliness,
      xp: pet.xp,
      accessories: pet.accessories,
      is_sleeping: pet.isSleeping,
      total_stars_spent: pet.totalStarsSpent,
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
): Promise<PetActionResult> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 20) {
    return { ok: false, error: "Pick a name between 1 and 20 letters" };
  }
  if (!PET_SPECIES.some((s) => s.id === speciesId)) {
    return { ok: false, error: "Pick a pet first!" };
  }

  const { supabase, kid, petRow } = await loadKidAndPet(kidId);
  if (!kid) return { ok: false, error: "Kid not found" };
  if (petRow) return { ok: false, error: "You already have a pet!" };

  const { data, error } = await supabase
    .from("kid_pets")
    .insert({ kid_id: kidId, family_id: kid.family_id, name: trimmed, species: speciesId })
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't adopt — try again!" };

  revalidatePath("/play/pet");
  return { ok: true, pet: rowToPet(data), pointsBalance: kid.points_balance };
}

export async function feedPet(kidId: string, foodId: string): Promise<PetActionResult> {
  const food = PET_FOODS.find((f) => f.id === foodId);
  if (!food) return { ok: false, error: "Unknown food" };

  const { supabase, kid, petRow } = await loadKidAndPet(kidId);
  if (!kid || !petRow) return { ok: false, error: "Pet not found" };
  if (kid.points_balance < food.starCost) return { ok: false, error: "not_enough_stars" };

  const pet = applyDecay(rowToPet(petRow));
  if (pet.isSleeping) return { ok: false, error: `${pet.name} is asleep — wake them first!` };
  if (pet.hunger >= 100) return { ok: false, error: `${pet.name} is completely full!` };

  pet.hunger = clamp(pet.hunger + food.hunger);
  pet.happiness = clamp(pet.happiness + food.happiness);
  pet.xp += food.xp;
  pet.totalStarsSpent += food.starCost;
  return savePet(supabase, kidId, pet, food.starCost, kid.points_balance);
}

export async function playWithPet(kidId: string): Promise<PetActionResult> {
  const { supabase, kid, petRow } = await loadKidAndPet(kidId);
  if (!kid || !petRow) return { ok: false, error: "Pet not found" };
  if (kid.points_balance < PLAY_COST) return { ok: false, error: "not_enough_stars" };

  const pet = applyDecay(rowToPet(petRow));
  if (pet.isSleeping) return { ok: false, error: `${pet.name} is asleep — wake them first!` };
  if (pet.energy < PLAY_MIN_ENERGY) {
    return { ok: false, error: `${pet.name} is too tired to play. Try a nap!` };
  }

  pet.happiness = clamp(pet.happiness + PLAY_HAPPINESS);
  pet.energy = clamp(pet.energy + PLAY_ENERGY);
  pet.xp += PLAY_XP;
  pet.totalStarsSpent += PLAY_COST;
  return savePet(supabase, kidId, pet, PLAY_COST, kid.points_balance);
}

export async function washPet(kidId: string): Promise<PetActionResult> {
  const { supabase, kid, petRow } = await loadKidAndPet(kidId);
  if (!kid || !petRow) return { ok: false, error: "Pet not found" };
  if (kid.points_balance < WASH_COST) return { ok: false, error: "not_enough_stars" };

  const pet = applyDecay(rowToPet(petRow));
  if (pet.isSleeping) return { ok: false, error: `${pet.name} is asleep — wake them first!` };
  if (pet.cleanliness >= 95) return { ok: false, error: `${pet.name} is already squeaky clean!` };

  pet.cleanliness = 100;
  pet.xp += WASH_XP;
  pet.totalStarsSpent += WASH_COST;
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

  pet.accessories = [...pet.accessories, accessoryId];
  pet.happiness = clamp(pet.happiness + 10);
  pet.xp += 5;
  pet.totalStarsSpent += accessory.starCost;
  return savePet(supabase, kidId, pet, accessory.starCost, kid.points_balance);
}
