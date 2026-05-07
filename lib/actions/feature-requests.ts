"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

type Status = "new" | "considering" | "in_progress" | "shipped" | "wont_do";
type Category = "kid_view" | "parent_view" | "quiz" | "rewards" | "music" | "other";

export async function createFeatureRequest(data: {
  title: string;
  description: string;
  category: Category;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };

  const { error } = await supabase.from("feature_requests").insert({
    family_id: fam.id,
    title: data.title,
    description: data.description,
    category: data.category,
    status: "new",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/feedback");
  return { ok: true };
}

export async function updateFeatureRequestStatus(
  id: string,
  status: Status,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("feature_requests")
    .update({ status })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/feedback");
  return { ok: true };
}

export async function deleteFeatureRequest(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("feature_requests")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent/feedback");
  return { ok: true };
}
