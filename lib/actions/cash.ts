"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function logCashTransaction(
  kidId: string,
  amountCents: number,
  description: string,
  type: "credit" | "debit",
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: fam, error: famErr } = await supabase
    .from("families")
    .select("id")
    .maybeSingle();
  if (famErr || !fam) return { ok: false, error: "Family not found." };

  const signedAmount = type === "debit" ? -Math.abs(amountCents) : Math.abs(amountCents);

  const [{ error: txErr }] = await Promise.all([
    supabase.from("cash_transactions").insert({
      family_id: fam.id,
      kid_id: kidId,
      amount_cents: signedAmount,
      description,
      type,
    }),
  ]);
  if (txErr) return { ok: false, error: txErr.message };

  await supabase.rpc("increment_kid_cash", {
    p_kid_id: kidId,
    p_amount_cents: signedAmount,
  });

  revalidatePath("/parent");
  revalidatePath(`/kid/${kidId}/rewards`);
  return { ok: true };
}
