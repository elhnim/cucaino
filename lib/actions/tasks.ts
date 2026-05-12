"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TaskCategory, TimeBlock, ScheduleType, TaskRule, TaskTarget, TaskTimeSlot, DayOfWeek } from "@/lib/domain/types";

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
  kidCanAdd: boolean;
  frequencyPerDay?: number;
  // New fields
  rule?: TaskRule;
  flexibleMinPerWeek?: number | null;
  target?: TaskTarget;
  targetDurationMinutes?: number | null;
  targetReps?: number | null;
  targetRepLabel?: string | null;
  checklistItems?: string[] | null;
  musicEnabled?: boolean;
  description?: string | null;
  timeSlots?: TaskTimeSlot[];
  // school_subject only
  subject?: string | null;
  customLabel?: string | null;
  endTime?: string | null;
  room?: string | null;
  teacher?: string | null;
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
    kid_can_add: data.kidCanAdd,
    frequency_per_day: data.frequencyPerDay ?? 1,
    rule: data.rule ?? "strict",
    flexible_min_per_week: data.flexibleMinPerWeek ?? null,
    target: data.target ?? "none",
    target_duration_minutes: data.targetDurationMinutes ?? null,
    target_reps: data.targetReps ?? null,
    target_rep_label: data.targetRepLabel ?? null,
    checklist_items: data.checklistItems ?? null,
    music_enabled: data.musicEnabled ?? false,
    description: data.description ?? null,
    time_slots: data.timeSlots ?? [],
    subject: data.subject ?? null,
    custom_label: data.customLabel ?? null,
    end_time: data.endTime ?? null,
    room: data.room ?? null,
    teacher: data.teacher ?? null,
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
      kid_can_add: data.kidCanAdd,
      frequency_per_day: data.frequencyPerDay ?? 1,
      rule: data.rule ?? "strict",
      flexible_min_per_week: data.flexibleMinPerWeek ?? null,
      target: data.target ?? "none",
      target_duration_minutes: data.targetDurationMinutes ?? null,
      target_reps: data.targetReps ?? null,
      target_rep_label: data.targetRepLabel ?? null,
      checklist_items: data.checklistItems ?? null,
      music_enabled: data.musicEnabled ?? false,
      description: data.description ?? null,
      time_slots: data.timeSlots ?? [],
      subject: data.subject ?? null,
      custom_label: data.customLabel ?? null,
      end_time: data.endTime ?? null,
      room: data.room ?? null,
      teacher: data.teacher ?? null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/tasks");
  return { ok: true };
}

export async function addTaskToDay(taskId: string, kidId: string, date?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };

  const targetDate = date ?? new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("kid_daily_task_additions").upsert(
    { family_id: fam.id, kid_id: kidId, task_id: taskId, date: targetDate },
    { onConflict: "kid_id,task_id,date" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${kidId}/todo`);
  return { ok: true };
}

export interface SchoolSubjectInput {
  id?: string;
  kidId: string;
  dayOfWeek: DayOfWeek;
  subject: string;
  customLabel: string | null;
  startTime: string;
  endTime: string;
  room: string | null;
  teacher: string | null;
  packingList: string[] | null;
}

export async function upsertSchoolSubjectTask(data: SchoolSubjectInput): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };

  const taskName = data.customLabel?.trim() || data.subject;

  if (data.id) {
    const { error } = await supabase
      .from("tasks")
      .update({
        name: taskName,
        days_of_week: [data.dayOfWeek],
        start_time: data.startTime,
        end_time: data.endTime,
        subject: data.subject,
        custom_label: data.customLabel?.trim() || null,
        room: data.room?.trim() || null,
        teacher: data.teacher?.trim() || null,
        packing_list: data.packingList ?? null,
      })
      .eq("id", data.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("tasks").insert({
      family_id: fam.id,
      kid_id: data.kidId,
      name: taskName,
      icon: "📚",
      category: "school_subject",
      schedule_type: "specific_days",
      days_of_week: [data.dayOfWeek],
      time_block: "morning",
      start_time: data.startTime,
      end_time: data.endTime || null,
      points: 0,
      family_points_contribution: 0,
      requires_timer: false,
      duration_minutes: null,
      requires_completion: false,
      location: null,
      packing_list: data.packingList ?? null,
      default_bpm: null,
      default_time_signature: null,
      active: true,
      kid_can_add: false,
      rule: "strict",
      flexible_min_per_week: null,
      target: "none",
      target_duration_minutes: null,
      target_reps: null,
      target_rep_label: null,
      checklist_items: null,
      music_enabled: false,
      description: null,
      time_slots: [],
      subject: data.subject,
      custom_label: data.customLabel?.trim() || null,
      room: data.room?.trim() || null,
      teacher: data.teacher?.trim() || null,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/kid/${data.kidId}/timetable`);
  revalidatePath(`/kid/${data.kidId}/todo`);
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

