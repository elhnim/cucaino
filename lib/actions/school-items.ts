"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DayOfWeek } from "@/lib/domain/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function upsertSchoolItem(
  kidId: string,
  item: {
    id?: string;
    name: string;
    icon: string;
    daysOfWeek: DayOfWeek[];
  },
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: family } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (!family) return { ok: false, error: "Family not found" };

  const payload = {
    family_id: family.id,
    kid_id: kidId,
    name: item.name.trim(),
    icon: item.icon.trim() || "📦",
    days_of_week: item.daysOfWeek,
    active: true,
  };

  if (item.id) {
    const { error } = await supabase
      .from("school_items")
      .update(payload)
      .eq("id", item.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("school_items").insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/parent/school-items");
  revalidatePath(`/kid/${kidId}/today`);
  return { ok: true };
}

export async function deleteSchoolItem(itemId: string, kidId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("school_items").delete().eq("id", itemId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/school-items");
  revalidatePath(`/kid/${kidId}/today`);
  return { ok: true };
}
