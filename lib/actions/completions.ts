"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  TASK_CATEGORY_TO_BADGE,
  BADGE_META,
  BADGE_THRESHOLDS,
  getTierFromCount,
} from "@/lib/domain/badge-config";
import type { UnlockedBadge } from "@/lib/domain/types";

export type ActionResult = { ok: true; newTiers?: UnlockedBadge[] } | { ok: false; error: string };

export async function completeTask(
  taskId: string,
  kidId: string,
  pointsAwarded: number,
  familyPointsAwarded: number,
  taskCategory?: string,
  maxCompletions = 1,
  cashValueCents = 0,
  requiresParentApproval = false,
): Promise<ActionResult> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };

  // For frequency tasks allow multiple completions up to maxCompletions; otherwise idempotent
  const { count } = await supabase
    .from("task_completions")
    .select("id", { count: "exact", head: true })
    .eq("task_id", taskId)
    .eq("kid_id", kidId)
    .eq("date", today);
  if ((count ?? 0) >= maxCompletions) return { ok: true };

  const { error } = await supabase.from("task_completions").insert({
    family_id: fam.id,
    task_id: taskId,
    kid_id: kidId,
    date: today,
    completed_at: new Date().toISOString(),
    points_awarded: pointsAwarded,
    family_points_awarded: familyPointsAwarded,
    duration_actual_seconds: null,
    cash_awarded_cents: cashValueCents,
    pending_parent_approval: requiresParentApproval,
  });
  if (error) return { ok: false, error: error.message };

  // When parent approval is required, skip all RPCs — parent awards on approval
  if (requiresParentApproval) {
    revalidatePath(`/kid/${kidId}/todo`);
    return { ok: true };
  }

  // Atomic point increments
  if (pointsAwarded > 0) {
    await supabase.rpc("increment_kid_points", { p_kid_id: kidId, p_amount: pointsAwarded });
  }
  if (familyPointsAwarded > 0) {
    await supabase.rpc("increment_family_points", { p_kid_id: kidId, p_amount: familyPointsAwarded });
  }

  if (cashValueCents > 0) {
    await Promise.all([
      supabase.from("cash_transactions").insert({
        family_id: fam.id,
        kid_id: kidId,
        amount_cents: cashValueCents,
        description: "Earned from task",
        type: "credit",
      }),
      supabase.rpc("increment_kid_cash", {
        p_kid_id: kidId,
        p_amount_cents: cashValueCents,
      }),
    ]);
  }

  // Update total_stars_earned + streak
  await supabase.rpc("update_kid_gamification", { p_kid_id: kidId, p_points: pointsAwarded });
  // Atomic increment for total_completions (fails silently if migration not yet applied)
  try {
    await supabase.rpc("increment_kid_total_completions", { p_kid_id: kidId });
  } catch {
    // Function may not exist yet
  }

  const newTiers: UnlockedBadge[] = [];

  // --- Task badge ---
  if (taskCategory) {
    const badgeCategory = TASK_CATEGORY_TO_BADGE[taskCategory];
    if (badgeCategory) {
      const { data: tierResult } = await supabase.rpc("increment_badge_progress", {
        p_kid_id: kidId,
        p_category: badgeCategory,
      });
      if (tierResult) {
        const tier = tierResult as "bronze" | "silver" | "gold";
        newTiers.push({
          category: badgeCategory,
          tier,
          tierName: BADGE_META[badgeCategory].tierNames[tier],
          icon: BADGE_META[badgeCategory].icon,
        });
      }
    }
  }

  // --- Streak badge ---
  const { data: kidRow } = await supabase
    .from("kids")
    .select("current_streak, total_stars_earned, total_completions")
    .eq("id", kidId)
    .maybeSingle();

  if (kidRow) {
    const streakUnlock = await checkMilestoneBadge(
      supabase, kidId, "streak", kidRow.current_streak ?? 0,
    );
    if (streakUnlock) newTiers.push(streakUnlock);

    const starUnlock = await checkMilestoneBadge(
      supabase, kidId, "star_collector", kidRow.total_stars_earned ?? 0,
    );
    if (starUnlock) newTiers.push(starUnlock);

    const titanUnlock = await checkMilestoneBadge(
      supabase, kidId, "task_titan", kidRow.total_completions ?? 0,
    );
    if (titanUnlock) newTiers.push(titanUnlock);
  }

  revalidatePath(`/kid/${kidId}/todo`);
  return { ok: true, newTiers: newTiers.length > 0 ? newTiers : undefined };
}

async function checkMilestoneBadge(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  kidId: string,
  category: "streak" | "star_collector" | "task_titan",
  currentValue: number,
): Promise<UnlockedBadge | null> {
  const thresholds = BADGE_THRESHOLDS[category];
  const newTier = getTierFromCount(category, currentValue);
  if (newTier === "none") return null;

  // Get current badge row
  const { data: row } = await supabase
    .from("badge_progress")
    .select("completion_count, bronze_earned_at, silver_earned_at, gold_earned_at")
    .eq("kid_id", kidId)
    .eq("category", category)
    .maybeSingle();

  const oldCount = row?.completion_count ?? 0;
  const oldTier = getTierFromCount(category, oldCount);

  // Upsert with latest value
  await supabase
    .from("badge_progress")
    .upsert({ kid_id: kidId, category, completion_count: currentValue }, { onConflict: "kid_id,category" });

  // Determine if a new tier was just crossed
  const tierOrder = { none: 0, bronze: 1, silver: 2, gold: 3 };
  if (tierOrder[newTier] <= tierOrder[oldTier]) return null;

  // Set the earned_at for the newly crossed tier
  const earnedAtField = `${newTier}_earned_at`;
  const alreadySet = row?.[earnedAtField as keyof typeof row];
  if (!alreadySet) {
    await supabase
      .from("badge_progress")
      .update({ [earnedAtField]: new Date().toISOString() })
      .eq("kid_id", kidId)
      .eq("category", category);
  }

  // Only fire unlock event if the tier was just earned this call
  if (alreadySet) return null;

  return {
    category,
    tier: newTier as "bronze" | "silver" | "gold",
    tierName: BADGE_META[category].tierNames[newTier as "bronze" | "silver" | "gold"],
    icon: BADGE_META[category].icon,
  };
}

export async function uncompleteTask(
  taskId: string,
  kidId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: completion } = await supabase
    .from("task_completions")
    .select("id, points_awarded, cash_awarded_cents, pending_parent_approval")
    .eq("task_id", taskId)
    .eq("kid_id", kidId)
    .eq("date", today)
    .maybeSingle();

  if (!completion) return { ok: true };

  if (completion.pending_parent_approval) {
    return { ok: false, error: "Waiting for parent approval." };
  }

  const { error } = await supabase
    .from("task_completions")
    .delete()
    .eq("id", completion.id);
  if (error) return { ok: false, error: error.message };

  if (completion.points_awarded > 0) {
    await supabase.rpc("decrement_kid_points", {
      p_kid_id: kidId,
      p_amount: completion.points_awarded,
    });
    await supabase.rpc("decrement_kid_stars", {
      p_kid_id: kidId,
      p_amount: completion.points_awarded,
    });
  }

  if (completion.cash_awarded_cents > 0) {
    await supabase.rpc("increment_kid_cash", {
      p_kid_id: kidId,
      p_amount_cents: -(completion.cash_awarded_cents),
    });
  }

  revalidatePath(`/kid/${kidId}/todo`);
  return { ok: true };
}

export async function approveCompletion(completionId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: completion, error: cErr } = await supabase
    .from("task_completions")
    .select("kid_id, points_awarded, cash_awarded_cents, family_points_awarded")
    .eq("id", completionId)
    .maybeSingle();
  if (cErr || !completion) return { ok: false, error: "Completion not found." };

  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };

  await supabase
    .from("task_completions")
    .update({ pending_parent_approval: false, parent_approved_at: new Date().toISOString() })
    .eq("id", completionId);

  const { kid_id, points_awarded, family_points_awarded, cash_awarded_cents } = completion;

  if (points_awarded > 0) {
    await supabase.rpc("increment_kid_points", { p_kid_id: kid_id, p_amount: points_awarded });
    await supabase.rpc("update_kid_gamification", { p_kid_id: kid_id, p_points: points_awarded });
  }
  if (family_points_awarded > 0) {
    await supabase.rpc("increment_family_points", { p_kid_id: kid_id, p_amount: family_points_awarded });
  }
  if (cash_awarded_cents > 0) {
    await Promise.all([
      supabase.from("cash_transactions").insert({
        family_id: fam.id,
        kid_id: kid_id,
        amount_cents: cash_awarded_cents,
        description: "Task approved by parent",
        type: "credit",
      }),
      supabase.rpc("increment_kid_cash", {
        p_kid_id: kid_id,
        p_amount_cents: cash_awarded_cents,
      }),
    ]);
  }

  revalidatePath("/parent");
  revalidatePath(`/kid/${kid_id}/todo`);
  return { ok: true };
}

export async function denyCompletion(completionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("task_completions")
    .delete()
    .eq("id", completionId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent");
  return { ok: true };
}
