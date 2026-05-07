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

  // Award points to kid
  if (pointsAwarded > 0) {
    const { data: kid } = await supabase
      .from("kids")
      .select("points_balance")
      .eq("id", kidId)
      .single();
    if (kid) {
      await supabase
        .from("kids")
        .update({ points_balance: kid.points_balance + pointsAwarded })
        .eq("id", kidId);
    }
  }

  // Award family points
  if (familyPointsAwarded > 0) {
    const { data: fam } = await supabase
      .from("families")
      .select("id, family_points_balance")
      .maybeSingle();
    if (fam) {
      await supabase
        .from("families")
        .update({ family_points_balance: fam.family_points_balance + familyPointsAwarded })
        .eq("id", fam.id);
    }
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

  // Deduct points
  if (completion.points_awarded > 0) {
    const { data: kid } = await supabase
      .from("kids")
      .select("points_balance")
      .eq("id", kidId)
      .single();
    if (kid) {
      await supabase
        .from("kids")
        .update({ points_balance: Math.max(0, kid.points_balance - completion.points_awarded) })
        .eq("id", kidId);
    }
  }

  revalidatePath(`/kid/${kidId}/today`);
  return { ok: true };
}
