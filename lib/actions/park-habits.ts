"use server";

/**
 * Cucaino Park habit loop (migration 0050):
 * - streak calendar computed from real completion days in the FAMILY timezone (lib/park/streak.ts)
 * - streak milestone rewards (tickets), each claimable once
 * - the daily mystery chest, unlocked only when every one of today's quests is done
 * Everything is re-checked here, so none of it can be claimed from devtools.
 */
import { createClient } from "@/lib/supabase/server";
import { getFamily, getKid, listTasksForKid, listCompletionsToday } from "@/lib/data/stub";
import { isoWeekday } from "@/lib/domain/schedule";
import { questsToday } from "@/lib/park/questsToday";
import { addDays, claimableMilestones, computeStreak, ymdIn, type StreakInfo } from "@/lib/park/streak";
import { awardPetXp } from "@/lib/data/park-tickets";

export interface HabitState {
  streak: StreakInfo;
  claims: number[];
  chestOpenedToday: boolean;
  quests: { total: number; done: number };
  tickets: number;
}

type HabitRow = { tickets: number; chest_day: string | null; streak_claims: number[] | null };

async function db() {
  return (await createClient()) as unknown as {
    from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

async function loadHabitRow(kidId: string): Promise<HabitRow> {
  const sb = await db();
  const pick = () => sb.from("kid_parks").select("tickets, chest_day, streak_claims").eq("kid_id", kidId).maybeSingle();
  let { data } = await pick();
  if (!data) {
    await sb.rpc("increment_kid_tickets", { p_kid_id: kidId, p_amount: 0 }); // creates the row
    ({ data } = await pick());
  }
  return (data as HabitRow) ?? { tickets: 0, chest_day: null, streak_claims: [] };
}

async function completionDays(kidId: string, sinceYmd: string): Promise<string[]> {
  const sb = await db();
  const { data } = await sb.from("task_completions").select("date").eq("kid_id", kidId).gte("date", sinceYmd);
  return [...new Set(((data as { date: string }[] | null) ?? []).map((r) => r.date))];
}

export async function getHabits(kidId: string): Promise<HabitState | null> {
  const [kid, family] = await Promise.all([getKid(kidId), getFamily()]);
  if (!kid) return null;
  const tz = family?.timezone ?? "Australia/Sydney";
  const today = ymdIn(new Date(), tz);
  const [days, row, tasks, completions] = await Promise.all([
    completionDays(kidId, addDays(today, -120)),
    loadHabitRow(kidId),
    listTasksForKid(kidId),
    listCompletionsToday(kidId, tz),
  ]);
  return {
    streak: computeStreak(days, today),
    claims: Array.isArray(row.streak_claims) ? row.streak_claims.map(Number) : [],
    chestOpenedToday: row.chest_day === today,
    quests: questsToday(tasks, completions, isoWeekday(new Date(), tz)),
    tickets: row.tickets,
  };
}

export type ClaimResult = { ok: true; tickets: number; title: string } | { ok: false; error: string };

export async function claimStreakReward(kidId: string, days: number): Promise<ClaimResult> {
  const h = await getHabits(kidId);
  if (!h) return { ok: false, error: "Kid not found." };
  const m = claimableMilestones(h.streak.current, h.claims).find((x) => x.days === days);
  if (!m) return { ok: false, error: "Keep your streak going to unlock this one!" };
  const sb = await db();
  const claims = [...h.claims, m.days];
  // guarded on the old claims so a double tap can't claim twice
  const { data, error } = await sb
    .from("kid_parks")
    .update({ streak_claims: claims, tickets: h.tickets + m.tickets, updated_at: new Date().toISOString() })
    .eq("kid_id", kidId)
    .eq("tickets", h.tickets)
    .select("tickets")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Oops, try that again." };
  return { ok: true, tickets: (data as { tickets: number }).tickets, title: m.title };
}

// ── the mystery chest ──
const RARE_STICKERS = ["🦄", "🐉", "🌟", "💎", "🧁", "🪐", "🦋", "🍀", "🎠", "🏆"];

export type ChestPrize =
  | { kind: "tickets"; amount: number; text: string }
  | { kind: "pet"; amount: number; text: string }
  | { kind: "sticker"; sticker: string; text: string };

export type ChestResult = { ok: true; prize: ChestPrize; tickets: number } | { ok: false; error: string };

function roll(n: number) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
}

export async function openMysteryChest(kidId: string): Promise<ChestResult> {
  const [kid, family] = await Promise.all([getKid(kidId), getFamily()]);
  if (!kid) return { ok: false, error: "Kid not found." };
  const tz = family?.timezone ?? "Australia/Sydney";
  const today = ymdIn(new Date(), tz);
  const [row, tasks, completions] = await Promise.all([loadHabitRow(kidId), listTasksForKid(kidId), listCompletionsToday(kidId, tz)]);
  const q = questsToday(tasks, completions, isoWeekday(new Date(), tz));
  if (q.total === 0 || q.done < q.total) return { ok: false, error: "Finish all of today's quests to open the chest!" };
  if (row.chest_day === today) return { ok: false, error: "You've opened today's chest — a new one appears tomorrow!" };

  const r = roll(100);
  let prize: ChestPrize;
  let addTickets = 0;
  if (r < 10) {
    addTickets = 8;
    prize = { kind: "tickets", amount: 8, text: "JACKPOT! 8 tickets!" };
  } else if (r < 60) {
    addTickets = 2 + roll(3);
    prize = { kind: "tickets", amount: addTickets, text: `${addTickets} bonus tickets!` };
  } else if (r < 82) {
    prize = { kind: "pet", amount: 60, text: "A treat feast for your pet! +60 XP" };
  } else {
    const sticker = RARE_STICKERS[roll(RARE_STICKERS.length)];
    prize = { kind: "sticker", sticker, text: `A rare ${sticker} sticker for your album!` };
  }
  const sb = await db();
  const { data, error } = await sb
    .from("kid_parks")
    .update({ chest_day: today, tickets: row.tickets + addTickets, updated_at: new Date().toISOString() })
    .eq("kid_id", kidId)
    .eq("tickets", row.tickets)
    .select("tickets")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Oops, try that again." };
  if (prize.kind === "pet") await awardPetXp(sb as never, kidId, prize.amount);
  return { ok: true, prize, tickets: (data as { tickets: number }).tickets };
}
