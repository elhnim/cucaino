"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Reward, RewardType, RewardWho, RewardRecurrence, RewardPeriodLimit } from "@/lib/domain/types";

export interface RewardFormData {
  name: string;
  icon: string;
  description: string | null;
  costPoints: number;
  type: Reward["type"];
  kidId: string | null;
  rewardType: RewardType;
  who: RewardWho;
  recurrence: RewardRecurrence;
  redemptionLimit: number | null;
  redemptionPeriod: RewardPeriodLimit;
  requiresApproval: boolean;
  availableTo: string[];
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
    reward_type: data.rewardType,
    who: data.who,
    recurrence: data.recurrence,
    redemption_limit: data.redemptionLimit,
    redemption_period: data.redemptionPeriod,
    requires_approval: data.requiresApproval,
    available_to: data.availableTo,
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
      reward_type: data.rewardType,
      who: data.who,
      recurrence: data.recurrence,
      redemption_limit: data.redemptionLimit,
      redemption_period: data.redemptionPeriod,
      requires_approval: data.requiresApproval,
      available_to: data.availableTo,
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

export async function approveRequest(requestId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("reward_requests")
    .update({ status: "approved" })
    .eq("id", requestId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent");
  revalidatePath("/parent/requests");
  return { ok: true };
}

export async function denyRequest(requestId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("reward_requests")
    .update({ status: "denied" })
    .eq("id", requestId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent");
  revalidatePath("/parent/requests");
  return { ok: true };
}

export async function addToWishlist(kidId: string, rewardId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { count } = await supabase
    .from("wishlist_items")
    .select("*", { count: "exact", head: true })
    .eq("kid_id", kidId);
  if ((count ?? 0) >= 3) return { ok: false, error: "Wishlist is full." };

  const { data: existing } = await supabase
    .from("wishlist_items")
    .select("position")
    .eq("kid_id", kidId);
  const usedPositions = new Set((existing ?? []).map((r: any) => r.position as number));
  const position = [1, 2, 3].find((p) => !usedPositions.has(p)) ?? 1;

  const { error } = await supabase.from("wishlist_items").insert({
    kid_id: kidId,
    reward_id: rewardId,
    position,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/kid/${kidId}/rewards`);
  return { ok: true };
}

export async function removeFromWishlist(kidId: string, rewardId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("wishlist_items")
    .delete()
    .eq("kid_id", kidId)
    .eq("reward_id", rewardId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${kidId}/rewards`);
  return { ok: true };
}
