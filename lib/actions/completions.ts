"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function completeTask(
  taskId: string,
  kidId: string,
  pointsAwarded: number,
  familyPointsAwarded: number,
): Promise<ActionResult> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

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
    task_id: taskId,
    kid_id: kidId,
    date: today,
    completed_at: new Date().toISOString(),
    points_awarded: pointsAwarded,
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

  revalidatePath(`/kid/${kidId}/today`);
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
  }

  revalidatePath(`/kid/${kidId}/today`);
  return { ok: true };
}
