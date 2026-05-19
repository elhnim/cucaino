"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function issueStrike(data: {
  kidId: string;
  reason: string;
  penaltyStars: number;
  penaltyCashCents: number;
  issuedBy?: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };

  if (data.penaltyStars > 0 || data.penaltyCashCents > 0) {
    const { data: kid, error: kidErr } = await supabase
      .from("kids")
      .select("points_balance, cash_balance")
      .eq("id", data.kidId)
      .single();
    if (!kidErr && kid) {
      await supabase.from("kids").update({
        points_balance: Math.max(0, kid.points_balance - data.penaltyStars),
        cash_balance: Math.max(0, kid.cash_balance - data.penaltyCashCents),
      }).eq("id", data.kidId);
    }
  }

  const { error } = await supabase.from("strikes").insert({
    family_id: fam.id,
    kid_id: data.kidId,
    issued_by: data.issuedBy ?? "Parent",
    reason: data.reason.trim(),
    penalty_stars: data.penaltyStars,
    penalty_cash_cents: data.penaltyCashCents,
    deducted_at: data.penaltyStars > 0 || data.penaltyCashCents > 0 ? new Date().toISOString() : null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/parent");
  revalidatePath(`/kid/${data.kidId}/home`);
  return { ok: true };
}

export async function clearStrike(strikeId: string, kidId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("strikes")
    .update({ cleared_at: new Date().toISOString() })
    .eq("id", strikeId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/parent");
  revalidatePath(`/kid/${kidId}/home`);
  return { ok: true };
}
