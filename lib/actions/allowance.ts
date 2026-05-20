"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { localDateString } from "@/lib/data/queries";

// Strike penalty tiers: strikes → allowance multiplier
function strikeMultiplier(strikes: number): number {
  if (strikes >= 3) return 0;
  if (strikes === 2) return 0.5;
  if (strikes === 1) return 0.75;
  return 1;
}

export async function processPayday(): Promise<void> {
  const supabase = await createClient();

  const { data: family } = await supabase
    .from("families")
    .select("id, timezone, pay_day_of_week, weekly_allowance_cents")
    .maybeSingle();
  if (!family || family.pay_day_of_week === null || family.weekly_allowance_cents <= 0) return;

  const today = localDateString((family as any).timezone ?? "Australia/Sydney");
  const todayDayOfWeek = new Date().getDay(); // JS: 0=Sun … 6=Sat
  if (todayDayOfWeek !== family.pay_day_of_week) return;

  const { data: kids } = await supabase
    .from("kids")
    .select("id")
    .eq("family_id", family.id);
  if (!kids || kids.length === 0) return;

  for (const kid of kids) {
    // Idempotent: skip if already paid today
    const { data: existing } = await supabase
      .from("allowance_payouts")
      .select("id")
      .eq("kid_id", kid.id)
      .eq("pay_date", today)
      .maybeSingle();
    if (existing) continue;

    // Count strikes issued in the last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { count: strikeCount } = await supabase
      .from("strikes")
      .select("id", { count: "exact", head: true })
      .eq("kid_id", kid.id)
      .gte("created_at", weekAgo.toISOString());

    const strikes = strikeCount ?? 0;
    const multiplier = strikeMultiplier(strikes);
    const allowanceCents = Math.round(family.weekly_allowance_cents * multiplier);

    // Record payout regardless (even if 0, to mark as processed)
    await supabase.from("allowance_payouts").insert({
      family_id: family.id,
      kid_id: kid.id,
      pay_date: today,
      allowance_cents: allowanceCents,
      strike_count: strikes,
    });

    if (allowanceCents > 0) {
      // Credit cash_balance
      const { data: kidRow } = await supabase
        .from("kids")
        .select("cash_balance")
        .eq("id", kid.id)
        .maybeSingle();
      if (!kidRow) continue;

      await supabase
        .from("kids")
        .update({ cash_balance: (kidRow.cash_balance ?? 0) + allowanceCents })
        .eq("id", kid.id);

      // Ledger entry
      await supabase.from("cash_transactions").insert({
        family_id: family.id,
        kid_id: kid.id,
        amount_cents: allowanceCents,
        description: strikes > 0
          ? `Weekly allowance (${strikes} strike${strikes > 1 ? "s" : ""}, ${Math.round(multiplier * 100)}%)`
          : "Weekly allowance",
        type: "credit",
      });
    }
  }

  revalidatePath("/parent");
  revalidatePath("/parent/overview");
}
