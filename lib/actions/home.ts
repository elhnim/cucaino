"use server";

/**
 * My Home actions (kid_parks.home + kid_parks.home_owned, migration 0051). The decorating bar
 * previews every move with the same pure rules (lib/park/home/rules.ts); these actions re-check
 * everything — known items, ownership, unlocks, positions, size limits, ticket balance — so a
 * home can't be cheated from devtools. Every call first checks the kid belongs to the caller's
 * own family (RLS alone isn't enough: friends' kids are readable).
 */
import { createClient } from "@/lib/supabase/server";
import { getHomeItem, isStyle } from "@/lib/park/home/catalog";
import { canBuyMore, isItemUnlocked, itemUnlockHint, sanitizeLayout, sanitizeOwned, validateLayout, type HomeLayout, type Owned } from "@/lib/park/home/rules";
import { levelFor } from "@/lib/park/builder/rules";

export interface HomeData {
  layout: HomeLayout;
  owned: Owned;
  tickets: number;
  level: number;
  streak: number;
}

type HomeRow = { tickets: number; home: unknown; home_owned: unknown };

/** biggest layout we'll store (80 items is ~7 KB) */
const MAX_JSON = 24_000;

// kid_parks is newer than the generated database types — use an untyped handle for it
async function db() {
  return (await createClient()) as unknown as {
    from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

/** The kid, only if they're in the signed-in grown-up's own family. */
async function ownKid(kidId: unknown): Promise<{ level: number; streak: number } | null> {
  if (typeof kidId !== "string" || !kidId) return null;
  const sb = await db();
  const { data: familyId } = await sb.rpc("current_family_id");
  if (!familyId) return null;
  const { data } = await sb.from("kids").select("total_stars_earned, current_streak").eq("id", kidId).eq("family_id", familyId).maybeSingle();
  if (!data) return null;
  const k = data as { total_stars_earned: number | null; current_streak: number | null };
  return { level: levelFor(k.total_stars_earned ?? 0), streak: k.current_streak ?? 0 };
}

async function loadRow(kidId: string): Promise<HomeRow | null> {
  const sb = await db();
  const pick = () => sb.from("kid_parks").select("tickets, home, home_owned").eq("kid_id", kidId).maybeSingle();
  let { data } = await pick();
  if (!data) {
    // first visit to the park at all: create the row (adds 0 tickets, sets family_id from the kid)
    await sb.rpc("increment_kid_tickets", { p_kid_id: kidId, p_amount: 0 });
    ({ data } = await pick());
  }
  return (data as HomeRow) ?? null;
}

export async function getHome(kidId: string): Promise<HomeData | null> {
  const kid = await ownKid(kidId);
  if (!kid) return null;
  const row = await loadRow(kidId);
  if (!row) return null;
  const owned = sanitizeOwned(row.home_owned);
  return { layout: sanitizeLayout(row.home, owned), owned, tickets: row.tickets ?? 0, level: kid.level, streak: kid.streak };
}

export type SaveHomeResult = { ok: true; layout: HomeLayout } | { ok: false; error: string };

/** Save the whole layout (placed items + room styles) after checking every rule. */
export async function saveHome(kidId: string, layout: HomeLayout): Promise<SaveHomeResult> {
  const kid = await ownKid(kidId);
  if (!kid) return { ok: false, error: "Couldn't find your home — go back and try again." };
  let size = 0;
  try {
    size = JSON.stringify(layout ?? null).length;
  } catch {
    return { ok: false, error: "Your home got muddled — try again." };
  }
  if (size > MAX_JSON) return { ok: false, error: "That's a lot of stuff! Try putting some things away." };
  const row = await loadRow(kidId);
  if (!row) return { ok: false, error: "Couldn't find your home — go back and try again." };
  const check = validateLayout(layout, sanitizeOwned(row.home_owned));
  if (!check.ok) return check;
  const sb = await db();
  // only the layout column: purchases (home_owned) and tickets are never written from here
  const { error } = await sb.from("kid_parks").update({ home: check.layout, updated_at: new Date().toISOString() }).eq("kid_id", kidId);
  if (error) return { ok: false, error: "Oops, that didn't save — try again." };
  return { ok: true, layout: check.layout };
}

export type BuyHomeResult = { ok: true; tickets: number; owned: Owned } | { ok: false; error: string; tickets?: number };

/** Buy one more copy of an item (or a wallpaper / floor) with park tickets. */
export async function buyHomeItem(kidId: string, itemId: string): Promise<BuyHomeResult> {
  const def = typeof itemId === "string" ? getHomeItem(itemId) : undefined;
  if (!def) return { ok: false, error: "That isn't in the catalogue." };
  if (def.cost <= 0) return { ok: false, error: "That one's free — just place it!" };
  const kid = await ownKid(kidId);
  if (!kid) return { ok: false, error: "Couldn't find your home — go back and try again." };
  if (!isItemUnlocked(def, kid.level, kid.streak)) return { ok: false, error: `${itemUnlockHint(def)} — keep doing your quests!` };
  const row = await loadRow(kidId);
  if (!row) return { ok: false, error: "Couldn't find your home — go back and try again." };
  const owned = sanitizeOwned(row.home_owned);
  if (!canBuyMore(def, owned)) return { ok: false, error: isStyle(def) ? `You already have ${def.name}!` : `You've got as many ${def.name}s as fit!`, tickets: row.tickets };
  if ((row.tickets ?? 0) < def.cost) return { ok: false, error: "Not enough tickets yet — finish more quests!", tickets: row.tickets };
  const sb = await db();
  // one atomic UPDATE (balance + copies re-checked in SQL), so a double tap can't double-spend
  const { data, error } = await sb.rpc("buy_home_item", { p_kid_id: kidId, p_item: def.id, p_cost: def.cost, p_max: isStyle(def) ? 1 : def.max });
  if (error || data === null || data === undefined) {
    const again = await loadRow(kidId);
    return { ok: false, error: "Oops, try that again.", tickets: again?.tickets };
  }
  const after = await loadRow(kidId);
  const nextOwned = after ? sanitizeOwned(after.home_owned) : { ...owned, [def.id]: (owned[def.id] ?? 0) + 1 };
  return { ok: true, tickets: Number(data), owned: nextOwned };
}
