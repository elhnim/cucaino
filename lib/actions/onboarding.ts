"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveParentGoals(
  goals: string[],
  goalsOther: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };
  const { error } = await supabase
    .from("families")
    .update({
      parent_goals: goals,
      parent_goals_other: goalsOther || null,
    })
    .eq("id", fam.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markParentTourSeen(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };
  const { error } = await supabase
    .from("families")
    .update({ parent_tour_seen: true })
    .eq("id", fam.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/parent", "layout");
  return { ok: true };
}

export async function saveKidGoals(
  kidId: string,
  goals: string[],
  goalsOther: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };
  const { error } = await supabase
    .from("kids")
    .update({
      goals,
      goals_other: goalsOther || null,
    })
    .eq("id", kidId)
    .eq("family_id", fam.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function saveKidInterests(
  kidId: string,
  interests: string[],
  interestsOther: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };
  const { error } = await supabase
    .from("kids")
    .update({
      interests,
      interests_other: interestsOther || null,
    })
    .eq("id", kidId)
    .eq("family_id", fam.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markFriendsFeatureSeen(kidId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };
  const { error } = await supabase
    .from("kids")
    .update({ friends_feature_seen: true })
    .eq("id", kidId)
    .eq("family_id", fam.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${kidId}`, "layout");
  return { ok: true };
}

export async function markKidTourSeen(kidId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };
  const { error } = await supabase
    .from("kids")
    .update({ tour_seen: true })
    .eq("id", kidId)
    .eq("family_id", fam.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/kid/${kidId}`, "layout");
  return { ok: true };
}
