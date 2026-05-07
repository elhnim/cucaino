"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Reward } from "@/lib/domain/types";

export interface RewardFormData {
  name: string;
  icon: string;
  description: string | null;
  costPoints: number;
  type: Reward["type"];
  kidId: string | null;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createReward(data: RewardFormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };

  const { error } = await supabase.from("rewards").insert({
    family_id: fam.id,
    kid_id: data.kidId,
    name: data.name,
    icon: data.icon,
    description: data.description || null,
    cost_points: data.costPoints,
    type: data.type,
    active: true,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/rewards");
  return { ok: true };
}

export async function updateReward(
  id: string,
  data: RewardFormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("rewards")
    .update({
      kid_id: data.kidId,
      name: data.name,
      icon: data.icon,
      description: data.description || null,
      cost_points: data.costPoints,
      type: data.type,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/rewards");
  return { ok: true };
}

export async function deleteReward(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("rewards")
    .update({ active: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/rewards");
  return { ok: true };
}
