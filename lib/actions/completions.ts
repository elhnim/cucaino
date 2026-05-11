"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const BADGE_CATEGORY_MAP: Record<string, string> = {
  chore: "chores",
  exercise: "physical",
  music: "music",
  personal: "hygiene",
  activity: "mindfulness",
};

export async function completeTask(
  taskId: string,
  kidId: string,
  pointsAwarded: number,
  familyPointsAwarded: number,
  taskCategory?: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };

  // Idempotent — skip if already completed today
  const { data: existing } = await supabase
    .from("task_completions")
    .select("id")
    .eq("task_id", taskId)
    .eq("kid_id", kidId)
    .eq("date", today)
    .maybeSingle();
  if (existing) return { ok: true };

  const { error } = await supabase.from("task_completions").insert({
    family_id: fam.id,
    task_id: taskId,
    kid_id: kidId,
    date: today,
    completed_at: new Date().toISOString(),
    points_awarded: pointsAwarded,
    family_points_awarded: familyPointsAwarded,
    duration_actual_seconds: null,
  });
  if (error) return { ok: false, error: error.message };

  // Atomic point increments — avoids a read round-trip per completion
  if (pointsAwarded > 0) {
    await supabase.rpc("increment_kid_points", { p_kid_id: kidId, p_amount: pointsAwarded });
  }
  if (familyPointsAwarded > 0) {
    await supabase.rpc("increment_family_points", { p_kid_id: kidId, p_amount: familyPointsAwarded });
  }

  // Update total_stars_earned and streak (single atomic call)
  await supabase.rpc("update_kid_gamification", { p_kid_id: kidId, p_points: pointsAwarded });

  // Increment badge progress if category is provided
  if (taskCategory) {
    const badgeCategory = BADGE_CATEGORY_MAP[taskCategory];
    if (badgeCategory) {
      await supabase.rpc("increment_badge_progress", { p_kid_id: kidId, p_category: badgeCategory });
    }
  }

  revalidatePath(`/kid/${kidId}/todo`);
  return { ok: true };
}

export async function uncompleteTask(
  taskId: string,
  kidId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: completion } = await supabase
    .from("task_completions")
    .select("id, points_awarded")
    .eq("task_id", taskId)
    .eq("kid_id", kidId)
    .eq("date", today)
    .maybeSingle();

  if (!completion) return { ok: true };

  const { error } = await supabase
    .from("task_completions")
    .delete()
    .eq("id", completion.id);
  if (error) return { ok: false, error: error.message };

  // Atomic deduction — clamped to 0 in the SQL function
  if (completion.points_awarded > 0) {
    await supabase.rpc("decrement_kid_points", { p_kid_id: kidId, p_amount: completion.points_awarded });
    await supabase.rpc("decrement_kid_stars", { p_kid_id: kidId, p_amount: completion.points_awarded });
  }

  revalidatePath(`/kid/${kidId}/todo`);
  return { ok: true };
}
