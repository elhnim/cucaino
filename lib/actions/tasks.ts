"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TaskCategory, TimeBlock, ScheduleType } from "@/lib/domain/types";

export interface TaskFormData {
  name: string;
  icon: string;
  category: TaskCategory;
  scheduleType: ScheduleType;
  daysOfWeek: number[];
  timeBlock: TimeBlock;
  startTime: string | null;
  points: number;
  familyPointsContribution: number;
  requiresTimer: boolean;
  durationMinutes: number | null;
  requiresCompletion: boolean;
  location: string | null;
  packingList: string[] | null;
  defaultBpm: number | null;
  defaultTimeSignature: string | null;
  kidId: string | null;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createTask(data: TaskFormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };

  const { error } = await supabase.from("tasks").insert({
    family_id: fam.id,
    kid_id: data.kidId,
    name: data.name,
    icon: data.icon,
    category: data.category,
    schedule_type: data.scheduleType,
    days_of_week: data.daysOfWeek,
    time_block: data.timeBlock,
    start_time: data.startTime || null,
    points: data.points,
    family_points_contribution: data.familyPointsContribution,
    requires_timer: data.requiresTimer,
    duration_minutes: data.durationMinutes,
    requires_completion: data.requiresCompletion,
    location: data.location || null,
    packing_list: data.packingList,
    default_bpm: data.defaultBpm,
    default_time_signature: data.defaultTimeSignature,
    active: true,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/tasks");
  if (data.kidId) revalidatePath(`/kid/${data.kidId}/today`);
  return { ok: true };
}

export async function updateTask(
  id: string,
  data: TaskFormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({
      kid_id: data.kidId,
      name: data.name,
      icon: data.icon,
      category: data.category,
      schedule_type: data.scheduleType,
      days_of_week: data.daysOfWeek,
      time_block: data.timeBlock,
      start_time: data.startTime || null,
      points: data.points,
      family_points_contribution: data.familyPointsContribution,
      requires_timer: data.requiresTimer,
      duration_minutes: data.durationMinutes,
      requires_completion: data.requiresCompletion,
      location: data.location || null,
      packing_list: data.packingList,
      default_bpm: data.defaultBpm,
      default_time_signature: data.defaultTimeSignature,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/tasks");
  return { ok: true };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ active: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/tasks");
  return { ok: true };
}
