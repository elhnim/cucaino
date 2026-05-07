"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ThemeId } from "@/lib/domain/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

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
  const { error } = await supabase
    .from("kids")
    .update({
      name: data.name,
      avatar: data.avatar,
      theme_id: data.themeId,
      date_of_birth: data.dateOfBirth,
    })
    .eq("id", kidId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${kidId}/profile`);
  revalidatePath(`/select-kid`);
  return { ok: true };
}

export async function setKidPin(
  kidId: string,
  pin: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("kids")
    .update({ pin_hash: pin })
    .eq("id", kidId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/select-kid`);
  revalidatePath(`/kid/${kidId}/profile`);
  return { ok: true };
}

export async function clearKidPin(kidId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("kids")
    .update({ pin_hash: null })
    .eq("id", kidId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/select-kid`);
  revalidatePath(`/kid/${kidId}/profile`);
  return { ok: true };
}
