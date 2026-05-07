"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function setParentPinDb(pin: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("families")
    .update({ parent_pin: pin });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/settings");
  revalidatePath("/select-kid");
  return { ok: true };
}

export async function clearParentPinDb(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("families")
    .update({ parent_pin: null });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/settings");
  revalidatePath("/select-kid");
  return { ok: true };
}
