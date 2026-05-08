"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function getFamilyId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data } = await supabase.from("families").select("id").maybeSingle();
  return data?.id ?? null;
}

export async function setParentPinDb(pin: string): Promise<ActionResult> {
  const supabase = await createClient();
  const familyId = await getFamilyId(supabase);
  if (!familyId) return { ok: false, error: "Family not found" };
  const { error } = await supabase
    .from("families")
    .update({ parent_pin: pin })
    .eq("id", familyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent", "layout");
  revalidatePath("/parent/profile");
  revalidatePath("/select-kid");
  return { ok: true };
}

export async function updateParentProfile(data: {
  displayName: string;
  avatar: string;
}): Promise<ActionResult> {
  const trimmed = data.displayName.trim();
  if (!trimmed) return { ok: false, error: "Name cannot be empty" };
  const supabase = await createClient();
  const familyId = await getFamilyId(supabase);
  if (!familyId) return { ok: false, error: "Family not found" };
  const { error } = await supabase
    .from("families")
    .update({ parent_display_name: trimmed, parent_avatar: data.avatar })
    .eq("id", familyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent", "layout");
  revalidatePath("/parent/profile");
  revalidatePath("/parent/settings");
  return { ok: true };
}

export async function updateFamilyName(name: string): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name cannot be empty" };
  const supabase = await createClient();
  const familyId = await getFamilyId(supabase);
  if (!familyId) return { ok: false, error: "Family not found" };
  const { error } = await supabase
    .from("families")
    .update({ name: trimmed })
    .eq("id", familyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent", "layout");
  revalidatePath("/parent/settings");
  revalidatePath("/select-kid");
  return { ok: true };
}

export async function clearParentPinDb(): Promise<ActionResult> {
  const supabase = await createClient();
  const familyId = await getFamilyId(supabase);
  if (!familyId) return { ok: false, error: "Family not found" };
  const { error } = await supabase
    .from("families")
    .update({ parent_pin: null })
    .eq("id", familyId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent", "layout");
  revalidatePath("/parent/profile");
  revalidatePath("/select-kid");
  return { ok: true };
}
