"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { HOLIDAY_PACK } from "@/lib/holiday/pack";

export type ImportResult =
  | { ok: true; imported: number; skipped: number }
  | { ok: false; error: string };

/**
 * Import the curated holiday activities as flexible, family-level tasks
 * (kids self-add them each day). Skips any whose name already exists so it's
 * safe to run more than once.
 */
export async function importHolidayPack(): Promise<ImportResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase.from("families").select("id").maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };

  const { data: existing } = await supabase
    .from("tasks")
    .select("name")
    .eq("family_id", fam.id)
    .eq("active", true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingNames = new Set((existing ?? []).map((r: any) => String(r.name).toLowerCase()));

  const toInsert = HOLIDAY_PACK.filter((t) => !existingNames.has(t.name.toLowerCase())).map((t) => ({
    family_id: fam.id,
    kid_ids: null,
    name: t.name,
    icon: t.icon,
    category: t.category,
    schedule_type: "daily",
    days_of_week: [],
    time_block: "anytime",
    start_time: null,
    points: t.points,
    family_points_contribution: 0,
    requires_timer: false,
    duration_minutes: null,
    requires_completion: true,
    location: null,
    packing_list: null,
    default_bpm: null,
    default_time_signature: null,
    active: true,
    kid_can_add: true,
    frequency_per_day: 1,
    rule: "flexible",
    flexible_min_per_week: null,
    target: "none",
    target_duration_minutes: null,
    target_reps: null,
    target_rep_label: null,
    checklist_items: null,
    music_enabled: false,
    description: null,
    time_slots: [],
    subject: null,
    custom_label: null,
    end_time: null,
    room: null,
    teacher: null,
    cash_value_cents: 0,
    requires_parent_approval: false,
  }));

  const skipped = HOLIDAY_PACK.length - toInsert.length;
  if (toInsert.length === 0) return { ok: true, imported: 0, skipped };

  const { error } = await supabase.from("tasks").insert(toInsert);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/parent/tasks");
  return { ok: true, imported: toInsert.length, skipped };
}
