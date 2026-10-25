"use server";

/**
 * Kart lap persistence (table kart_laps, migration 0052_kart_laps.sql). Only a finished lap
 * report is ever written here — live race state (poses, invites, countdowns) never touches the
 * database; see lib/park/karts/net.ts, which runs over its own Realtime channel.
 *
 * Every write re-validates with the pure helpers in lib/park/karts/laps.ts and checks the kid
 * belongs to the caller's own family server-side (RLS alone isn't enough: a sibling's kidId is
 * still a readable uuid), same pattern as lib/actions/home.ts. Per CLAUDE.md's "Task completion
 * insert" note, `family_id` is NOT NULL with no default — it's always resolved server-side here,
 * never trusted from the client.
 */
import { createClient } from "@/lib/supabase/server";
import { sanitizeLap, sanitizeTrackId } from "@/lib/park/karts/laps";
import type { GhostLap } from "@/lib/park/karts/types";

// kart_laps is newer than the generated database types — use an untyped handle for it, same
// as lib/actions/park.ts and lib/actions/home.ts do for kid_parks.
async function db() {
  return (await createClient()) as unknown as {
    from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

/** The kid's family id, only if they're in the signed-in grown-up's own family. */
async function ownKidFamily(kidId: string): Promise<string | null> {
  const sb = await db();
  const { data: familyId } = await sb.rpc("current_family_id");
  if (!familyId || typeof familyId !== "string") return null;
  const { data } = await sb.from("kids").select("id").eq("id", kidId).eq("family_id", familyId).maybeSingle();
  return data ? familyId : null;
}

export type SaveKartLapResult = { ok: true; saved: boolean } | { ok: false; error: string };

/**
 * Save a finished lap as the kid's new best on this track, if it is one. Keeps only one row per
 * (kid, track) — the fastest (the UNIQUE (kid_id, track_id) constraint + this check mean a
 * slower lap is simply dropped: `saved: false`, not an error).
 */
export async function saveKartLap(input: unknown): Promise<SaveKartLapResult> {
  const check = sanitizeLap(input);
  if (!check.ok) return check;
  const lap = check.lap;

  const familyId = await ownKidFamily(lap.kidId);
  if (!familyId) return { ok: false, error: "Couldn't find your racer." };

  const sb = await db();
  const { data: existing } = await sb
    .from("kart_laps")
    .select("lap_ms")
    .eq("kid_id", lap.kidId)
    .eq("track_id", lap.trackId)
    .maybeSingle();
  const existingMs = (existing as { lap_ms: number } | null)?.lap_ms;
  if (typeof existingMs === "number" && existingMs <= lap.lapMs) {
    return { ok: true, saved: false };
  }

  const ghost: GhostLap = lap;
  const { error } = await sb.from("kart_laps").upsert(
    {
      family_id: familyId,
      kid_id: lap.kidId,
      track_id: lap.trackId,
      lap_ms: lap.lapMs,
      ghost,
      created_at: new Date().toISOString(),
    },
    { onConflict: "kid_id,track_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, saved: true };
}

/**
 * The family's best laps on a track, one per kid. No familyId param needed: the `family_scope`
 * RLS policy on kart_laps already restricts every query to the caller's own family.
 */
export async function getKartGhosts(trackId: unknown): Promise<GhostLap[]> {
  const id = sanitizeTrackId(trackId);
  if (!id) return [];
  const sb = await db();
  const { data, error } = await sb.from("kart_laps").select("ghost").eq("track_id", id);
  if (error || !Array.isArray(data)) return [];
  return (data as { ghost: GhostLap | null }[]).map((r) => r.ghost).filter((g): g is GhostLap => !!g);
}

/**
 * The ranking: best lap per kid, fastest first, for every kid in the family AND their accepted
 * friends (the `kart_leaderboard` function, migration 0053 — it returns only a name, the kart
 * animal and the time for friends, never their ghost). Falls back to the family's own laps if the
 * function isn't there.
 */
export async function getKartLeaderboard(
  trackId: unknown,
): Promise<{ kidId: string; name: string; animal: string; lapMs: number; friend: boolean }[]> {
  const id = sanitizeTrackId(trackId);
  if (!id) return [];
  const sb = await db();
  const ranked = await sb.rpc("kart_leaderboard", { p_track: id });
  if (!ranked.error && Array.isArray(ranked.data)) {
    return (ranked.data as { kid_id: string; name: string | null; animal: string | null; lap_ms: number; is_friend: boolean }[]).map((r) => ({
      kidId: r.kid_id,
      name: r.name ?? "Racer",
      animal: r.animal ?? "",
      lapMs: r.lap_ms,
      friend: !!r.is_friend,
    }));
  }
  const { data, error } = await sb
    .from("kart_laps")
    .select("kid_id, lap_ms, ghost")
    .eq("track_id", id)
    .order("lap_ms", { ascending: true });
  if (error || !Array.isArray(data)) return [];
  return (data as { kid_id: string; lap_ms: number; ghost: GhostLap | null }[]).map((r) => ({
    kidId: r.kid_id,
    name: r.ghost?.name ?? "Racer",
    animal: r.ghost?.animal ?? "",
    lapMs: r.lap_ms,
    friend: false,
  }));
}
