"use server";

import { createClient } from "@/lib/supabase/server";

export async function logMood(kidId: string, mood: string): Promise<void> {
  const supabase = await createClient();
  const { data: fam } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (!fam) return;
  await supabase.from("mood_entries").insert({
    family_id: fam.id,
    kid_id: kidId,
    mood,
  });
}
