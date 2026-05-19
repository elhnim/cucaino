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
  costCashCents: number;
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
    cost_cash_cents: data.costCashCents,
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
  const { data: fam, error: famErr } = await supabase.from("families").select("id").maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };
  const { error } = await supabase
    .from("rewards")
    .update({
      kid_id: data.kidId,
      name: data.name,
      icon: data.icon,
      description: data.description || null,
      cost_points: data.costPoints,
      cost_cash_cents: data.costCashCents,
      type: data.type,
      reward_type: data.rewardType,
      who: data.who,
      recurrence: data.recurrence,
      redemption_limit: data.redemptionLimit,
      redemption_period: data.redemptionPeriod,
      requires_approval: data.requiresApproval,
      available_to: data.availableTo,
    })
    .eq("id", id)
    .eq("family_id", fam.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/rewards");
  return { ok: true };
}

export async function deleteReward(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase.from("families").select("id").maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };
  const { error } = await supabase
    .from("rewards")
    .update({ active: false })
    .eq("id", id)
    .eq("family_id", fam.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/rewards");
  return { ok: true };
}

export async function approveRequest(requestId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: req, error: reqErr } = await supabase
    .from("reward_requests")
    .select("kid_id, reward_id, payment_type")
    .eq("id", requestId)
    .single();
  if (reqErr || !req) return { ok: false, error: "Request not found." };

  const [{ data: kid, error: kErr }, { data: reward, error: rErr }] = await Promise.all([
    supabase.from("kids").select("points_balance, cash_balance").eq("id", req.kid_id).single(),
    supabase.from("rewards").select("cost_points, cost_cash_cents").eq("id", req.reward_id).single(),
  ]);
  if (kErr || !kid) return { ok: false, error: "Kid not found." };
  if (rErr || !reward) return { ok: false, error: "Reward not found." };

  const paymentType = (req.payment_type ?? "stars") as "stars" | "cash";
  const now = new Date().toISOString();

  if (paymentType === "stars") {
    const [{ error: deductErr }, { error: updateErr }] = await Promise.all([
      supabase
        .from("kids")
        .update({ points_balance: Math.max(0, kid.points_balance - reward.cost_points) })
        .eq("id", req.kid_id),
      supabase
        .from("reward_requests")
        .update({ status: "approved", points_deducted_at: now, resolved_at: now })
        .eq("id", requestId),
    ]);
    if (deductErr) return { ok: false, error: deductErr.message };
    if (updateErr) return { ok: false, error: updateErr.message };
  } else {
    const [{ error: deductErr }, { error: updateErr }] = await Promise.all([
      supabase.rpc("increment_kid_cash", {
        p_kid_id: req.kid_id,
        p_amount_cents: -(reward.cost_cash_cents),
      }),
      supabase
        .from("reward_requests")
        .update({ status: "approved", points_deducted_at: now, resolved_at: now })
        .eq("id", requestId),
    ]);
    if (deductErr) return { ok: false, error: deductErr.message };
    if (updateErr) return { ok: false, error: updateErr.message };
  }

  revalidatePath("/parent");
  revalidatePath("/parent/requests");
  revalidatePath(`/kid/${req.kid_id}/rewards`);
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

export async function claimReward(
  kidId: string,
  rewardId: string,
  paymentType: "stars" | "cash" = "stars",
): Promise<ActionResult> {
  const supabase = await createClient();

  const [{ data: reward, error: rErr }, { data: kid, error: kErr }] = await Promise.all([
    supabase.from("rewards").select("*").eq("id", rewardId).single(),
    supabase.from("kids").select("id, family_id, points_balance, cash_balance").eq("id", kidId).single(),
  ]);
  if (rErr || !reward) return { ok: false, error: "Reward not found." };
  if (kErr || !kid) return { ok: false, error: "Kid not found." };

  if (paymentType === "stars" && kid.points_balance < reward.cost_points) {
    return { ok: false, error: "Not enough stars." };
  }
  if (paymentType === "cash" && kid.cash_balance < reward.cost_cash_cents) {
    return { ok: false, error: "Not enough cash." };
  }

  if (reward.requires_approval) {
    const { error } = await supabase.from("reward_requests").insert({
      family_id: kid.family_id,
      reward_id: rewardId,
      kid_id: kidId,
      payment_type: paymentType,
    });
    if (error) return { ok: false, error: error.message };
  } else {
    if (paymentType === "stars") {
      const { error } = await supabase
        .from("kids")
        .update({ points_balance: kid.points_balance - reward.cost_points })
        .eq("id", kidId);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.rpc("increment_kid_cash", {
        p_kid_id: kidId,
        p_amount_cents: -(reward.cost_cash_cents),
      });
      if (error) return { ok: false, error: error.message };
    }

    const { error } = await supabase.from("reward_requests").insert({
      family_id: kid.family_id,
      reward_id: rewardId,
      kid_id: kidId,
      status: "delivered",
      points_deducted_at: new Date().toISOString(),
      payment_type: paymentType,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/kid/${kidId}/rewards`);
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
