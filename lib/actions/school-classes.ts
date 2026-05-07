"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DayOfWeek, Subject } from "@/lib/domain/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface SchoolClassInput {
  id?: string;
  dayOfWeek: DayOfWeek;
  subject: Subject;
  customLabel: string | null;
  startTime: string;
  endTime: string;
  room: string | null;
  teacher: string | null;
}

export async function upsertSchoolClass(
  kidId: string,
  data: SchoolClassInput,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };

  if (data.id) {
    const { error } = await supabase
      .from("school_classes")
      .update({
        day_of_week: data.dayOfWeek,
        subject: data.subject,
        custom_label: data.customLabel || null,
        start_time: data.startTime,
        end_time: data.endTime,
        room: data.room || null,
        teacher: data.teacher || null,
      })
      .eq("id", data.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("school_classes").insert({
      family_id: fam.id,
      kid_id: kidId,
      day_of_week: data.dayOfWeek,
      subject: data.subject,
      custom_label: data.customLabel || null,
      start_time: data.startTime,
      end_time: data.endTime,
      room: data.room || null,
      teacher: data.teacher || null,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/kid/${kidId}/timetable`);
  revalidatePath(`/kid/${kidId}/today`);
  revalidatePath(`/kid/${kidId}/week`);
  return { ok: true };
}

export async function deleteSchoolClass(
  kidId: string,
  classId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("school_classes")
    .delete()
    .eq("id", classId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${kidId}/timetable`);
  revalidatePath(`/kid/${kidId}/today`);
  revalidatePath(`/kid/${kidId}/week`);
  return { ok: true };
}

export async function clearKidTimetable(kidId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("school_classes")
    .delete()
    .eq("kid_id", kidId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${kidId}/timetable`);
  revalidatePath(`/kid/${kidId}/today`);
  revalidatePath(`/kid/${kidId}/week`);
  return { ok: true };
}
