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
