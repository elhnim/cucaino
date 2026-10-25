"use server";

/**
 * Dream Park builder actions (table kid_parks, migration 0049). The client previews moves
 * with the same pure rules (lib/park/builder/rules.ts); these actions re-check everything
 * (unlocks, ticket balance, grid collisions) so the park can't be cheated from devtools.
 */
import { createClient } from "@/lib/supabase/server";
import { getKid } from "@/lib/data/stub";
import { getPiece } from "@/lib/park/registry/pieces";
import { canPlace, isUnlocked, levelFor, refundFor, type Placed } from "@/lib/park/builder/rules";

export interface DreamPark {
  tickets: number;
  ticketsEarned: number;
  layout: Placed[];
  level: number;
  streak: number;
}

type ParkRow = { kid_id: string; family_id: string; tickets: number; tickets_earned: number; layout: Placed[] };

// kid_parks is newer than the generated database types — use an untyped handle for it
async function db() {
  return (await createClient()) as unknown as {
    from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

async function loadRow(kidId: string): Promise<ParkRow | null> {
  const sb = await db();
  const { data } = await sb.from("kid_parks").select("kid_id, family_id, tickets, tickets_earned, layout").eq("kid_id", kidId).maybeSingle();
  if (data) return data as ParkRow;
  // first visit: create the row through the RPC (adds 0 tickets, sets family_id from the kid)
  await sb.rpc("increment_kid_tickets", { p_kid_id: kidId, p_amount: 0 });
  const again = await sb.from("kid_parks").select("kid_id, family_id, tickets, tickets_earned, layout").eq("kid_id", kidId).maybeSingle();
  return (again.data as ParkRow) ?? null;
}

export async function getDreamPark(kidId: string): Promise<DreamPark | null> {
  const [kid, row] = await Promise.all([getKid(kidId), loadRow(kidId)]);
  if (!kid || !row) return null;
  return {
    tickets: row.tickets,
    ticketsEarned: row.tickets_earned,
    layout: Array.isArray(row.layout) ? row.layout : [],
    level: levelFor(kid.totalStarsEarned ?? 0),
    streak: kid.currentStreak ?? 0,
  };
}

export type BuildResult = { ok: true; park: DreamPark } | { ok: false; error: string };

async function save(kidId: string, tickets: number, layout: Placed[]) {
  const sb = await db();
  const { error } = await sb.from("kid_parks").update({ tickets, layout, updated_at: new Date().toISOString() }).eq("kid_id", kidId);
  return error ? error.message : null;
}

export async function placePiece(kidId: string, pieceId: string, gx: number, gz: number, r: number): Promise<BuildResult> {
  const piece = getPiece(pieceId);
  if (!piece) return { ok: false, error: "Unknown piece." };
  const park = await getDreamPark(kidId);
  if (!park) return { ok: false, error: "Park not found." };
  if (!isUnlocked(piece, park.level, park.streak)) return { ok: false, error: "That piece is still locked." };
  if (park.tickets < piece.cost) return { ok: false, error: "Not enough tickets yet — finish more quests!" };
  const rot = ((Math.round(r) % 4) + 4) % 4;
  const check = canPlace(park.layout, pieceId, Math.round(gx), Math.round(gz), rot);
  if (!check.ok) return { ok: false, error: check.reason === "overlap" ? "Something's already there." : "That's outside your park." };
  const layout = [...park.layout, { uid: crypto.randomUUID(), piece: pieceId, gx: Math.round(gx), gz: Math.round(gz), r: rot }];
  const err = await save(kidId, park.tickets - piece.cost, layout);
  if (err) return { ok: false, error: err };
  return { ok: true, park: { ...park, tickets: park.tickets - piece.cost, layout } };
}

export async function movePiece(kidId: string, uid: string, gx: number, gz: number, r: number): Promise<BuildResult> {
  const park = await getDreamPark(kidId);
  if (!park) return { ok: false, error: "Park not found." };
  const item = park.layout.find((p) => p.uid === uid);
  if (!item) return { ok: false, error: "Piece not found." };
  const rot = ((Math.round(r) % 4) + 4) % 4;
  const check = canPlace(park.layout, item.piece, Math.round(gx), Math.round(gz), rot, uid);
  if (!check.ok) return { ok: false, error: check.reason === "overlap" ? "Something's already there." : "That's outside your park." };
  const layout = park.layout.map((p) => (p.uid === uid ? { ...p, gx: Math.round(gx), gz: Math.round(gz), r: rot } : p));
  const err = await save(kidId, park.tickets, layout);
  if (err) return { ok: false, error: err };
  return { ok: true, park: { ...park, layout } };
}

export async function removePiece(kidId: string, uid: string): Promise<BuildResult> {
  const park = await getDreamPark(kidId);
  if (!park) return { ok: false, error: "Park not found." };
  const item = park.layout.find((p) => p.uid === uid);
  if (!item) return { ok: false, error: "Piece not found." };
  const tickets = park.tickets + refundFor(item.piece);
  const layout = park.layout.filter((p) => p.uid !== uid);
  const err = await save(kidId, tickets, layout);
  if (err) return { ok: false, error: err };
  return { ok: true, park: { ...park, tickets, layout } };
}

/** What one paid play costs (a Candy Golf round, a coaster ride, 3 arcade credits). */
const PLAY_COST = 1;

export type PlayResult = { ok: true; tickets: number } | { ok: false; error: string; tickets: number };

/**
 * Spend a ticket on a play. Tickets only come from finishing quests, so this is the
 * "chores -> play" loop. (Each game's first play of the day is free; the client tracks that.)
 */
export async function payForPlay(kidId: string): Promise<PlayResult> {
  const row = await loadRow(kidId);
  if (!row) return { ok: false, error: "Park not found.", tickets: 0 };
  if (row.tickets < PLAY_COST) return { ok: false, error: "Not enough tickets — finish a quest to earn more!", tickets: row.tickets };
  const sb = await db();
  // only succeeds if nobody spent tickets in between (no double-spend from two taps)
  const { data, error } = await sb
    .from("kid_parks")
    .update({ tickets: row.tickets - PLAY_COST, updated_at: new Date().toISOString() })
    .eq("kid_id", kidId)
    .eq("tickets", row.tickets)
    .select("tickets")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Oops, try that again.", tickets: row.tickets };
  return { ok: true, tickets: (data as { tickets: number }).tickets };
}
