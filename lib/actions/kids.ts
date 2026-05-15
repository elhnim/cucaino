"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ThemeId } from "@/lib/domain/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createKid(data: {
  name: string;
  avatar: string;
  themeId: ThemeId;
  dateOfBirth: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam } = await supabase.from("families").select("id").maybeSingle();
  if (!fam) return { ok: false, error: "Family not found" };
  const { error } = await supabase.from("kids").insert({
    family_id: fam.id,
    name: data.name,
    avatar: data.avatar,
    theme_id: data.themeId,
    date_of_birth: data.dateOfBirth,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/select-kid");
  revalidatePath("/parent/settings");
  revalidatePath("/parent/kids");
  return { ok: true };
}

export async function updateKidProfile(
  kidId: string,
  data: {
    name: string;
    avatar: string;
    themeId: ThemeId;
    dateOfBirth: string | null;
  },
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase.from("families").select("id").maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };
  const { error } = await supabase
    .from("kids")
    .update({
      name: data.name,
      avatar: data.avatar,
      theme_id: data.themeId,
      date_of_birth: data.dateOfBirth,
    })
    .eq("id", kidId)
    .eq("family_id", fam.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${kidId}/profile`);
  revalidatePath(`/select-kid`);
  revalidatePath(`/parent/settings`);
  return { ok: true };
}

export async function setKidPin(
  kidId: string,
  pin: string,
): Promise<ActionResult> {
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: "PIN must be exactly 4 digits." };
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase.from("families").select("id").maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };
  const { error } = await supabase
    .from("kids")
    .update({ pin_hash: pin })
    .eq("id", kidId)
    .eq("family_id", fam.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/select-kid`);
  revalidatePath(`/kid/${kidId}/profile`);
  return { ok: true };
}

export async function clearKidPin(kidId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase.from("families").select("id").maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };
  const { error } = await supabase
    .from("kids")
    .update({ pin_hash: null })
    .eq("id", kidId)
    .eq("family_id", fam.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/select-kid`);
  revalidatePath(`/kid/${kidId}/profile`);
  return { ok: true };
}
