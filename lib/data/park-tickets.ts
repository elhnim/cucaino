// Server-side helper: add/remove Dream Park tickets for a kid via the increment_kid_tickets
// RPC (migration 0049). Never throws — tickets are a bonus layer and must never break
// completing a chore.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function awardTickets(supabase: SupabaseClient<any, any, any>, kidId: string, amount: number): Promise<void> {
  if (!amount) return;
  try {
    await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)("increment_kid_tickets", {
      p_kid_id: kidId,
      p_amount: amount,
    });
  } catch {
    // best effort
  }
}

/** XP a pet gets as a "treat" for every finished quest (the pet grows with your chores). */
export const PET_TREAT_XP = 15;

/**
 * Give (or with a negative amount, take back) pet XP. Never throws, never below 0, and a kid
 * without a pet yet is simply skipped.
 */
export async function awardPetXp(supabase: SupabaseClient<any, any, any>, kidId: string, amount: number): Promise<void> {
  if (!amount) return;
  try {
    const { data } = await supabase.from("kid_pets").select("id, xp").eq("kid_id", kidId).maybeSingle();
    if (!data) return;
    const row = data as { id: string; xp: number };
    await supabase.from("kid_pets").update({ xp: Math.max(0, (row.xp ?? 0) + amount) }).eq("id", row.id);
  } catch {
    // best effort
  }
}
