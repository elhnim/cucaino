"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface BadgeFormData {
  name: string;
  icon: string;
  description: string | null;
  taskId: string;
  trackType: "count" | "streak";
  bronzeThreshold: number;
  silverThreshold: number;
  goldThreshold: number;
  kidIds: string[] | null;
}

export async function createCustomBadge(data: BadgeFormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase.from("families").select("id").maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };

  const { error } = await supabase.from("custom_badges").insert({
    family_id: fam.id,
    name: data.name.trim(),
    icon: data.icon,
    description: data.description?.trim() || null,
    task_id: data.taskId,
    track_type: data.trackType,
    bronze_threshold: data.bronzeThreshold,
    silver_threshold: data.silverThreshold,
    gold_threshold: data.goldThreshold,
    kid_ids: data.kidIds,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/badges");
  return { ok: true };
}

export async function updateCustomBadge(id: string, data: BadgeFormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("custom_badges").update({
    name: data.name.trim(),
    icon: data.icon,
    description: data.description?.trim() || null,
    task_id: data.taskId,
    track_type: data.trackType,
    bronze_threshold: data.bronzeThreshold,
    silver_threshold: data.silverThreshold,
    gold_threshold: data.goldThreshold,
    kid_ids: data.kidIds,
  }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/badges");
  return { ok: true };
}

export async function deleteCustomBadge(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("custom_badges").update({ active: false }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/badges");
  return { ok: true };
}

export interface BuiltinBadgeOverrideData {
  bronzeThreshold: number;
  silverThreshold: number;
  goldThreshold: number;
  bronzeName: string;
  silverName: string;
  goldName: string;
}

export async function updateBuiltinBadgeOverride(
  category: string,
  data: BuiltinBadgeOverrideData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase.from("families").select("id").maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };

  const { error } = await supabase
    .from("badge_config_overrides")
    .upsert(
      {
        family_id: fam.id,
        category,
        bronze_threshold: data.bronzeThreshold,
        silver_threshold: data.silverThreshold,
        gold_threshold: data.goldThreshold,
        bronze_name: data.bronzeName || null,
        silver_name: data.silverName || null,
        gold_name: data.goldName || null,
      },
      { onConflict: "family_id,category" },
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/rewards");
  return { ok: true };
}
