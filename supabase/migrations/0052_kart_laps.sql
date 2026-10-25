-- Go-kart best laps: one row per (kid, track), used for family ghosts + the leaderboard.
-- Live race state (poses, invites, countdowns) never touches the database — that runs over a
-- Supabase Realtime Broadcast + Presence channel instead (lib/park/karts/net.ts). This migration
-- also authorizes that channel (Realtime Authorization, see below).

CREATE TABLE IF NOT EXISTS public.kart_laps (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid        NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  kid_id     uuid        NOT NULL REFERENCES public.kids(id) ON DELETE CASCADE,
  track_id   text        NOT NULL,
  lap_ms     integer     NOT NULL CHECK (lap_ms > 0),
  -- the full GhostLap (lib/park/karts/types.ts): kidId, name, animal, colour, trackId, lapMs,
  -- samples (<= 1,500 points at ~10 Hz) — enough to replay the lap as a see-through ghost kart.
  ghost      jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kid_id, track_id)
);

-- Family leaderboard for a track, fastest first.
CREATE INDEX IF NOT EXISTS kart_laps_leaderboard_idx ON public.kart_laps (family_id, track_id, lap_ms);

ALTER TABLE public.kart_laps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family_scope" ON public.kart_laps
  FOR ALL USING (family_id = public.current_family_id())
  WITH CHECK (family_id = public.current_family_id());

-- ---------------------------------------------------------------------------------------------
-- Realtime Authorization for the live race channel (lib/park/karts/net.ts).
--
-- Live races between family kids talk over a single Supabase Realtime channel per family, topic
-- `karts:<familyId>`, using Presence (who's in the park / at the track right now) + Broadcast
-- (invite/accept/start/pose/finish/leave) — no table involved, so `postgres_changes` doesn't
-- apply here the way it does for e.g. game_rooms (0046_game_rooms.sql).
--
-- Every device in a family shares the same parent Supabase Auth session (see
-- lib/supabase/client.ts, middleware.ts — Cucaino has no separate per-kid auth), so
-- `current_family_id()` resolves on any device the same way it does for `kids` / `kid_parks` /
-- every other family-scoped table. To make the channel just as protected (rather than merely
-- "secret because the family id is an unguessable UUID"), the client opens it as a *private*
-- channel (`supabase.channel(topic, { config: { private: true, ... } })`) and we authorize it
-- here with RLS policies on `realtime.messages` — Supabase's "Realtime Authorization" feature —
-- scoped the same way as every other table's `family_scope` policy.
--
-- IMPORTANT — not exercised against a live project: this migration is not applied by this
-- change (by design — see the task). Before relying on live races in production:
--   1. Confirm this Supabase project's Realtime version supports policies on `realtime.messages`
--      and the `realtime.topic()` helper (Dashboard -> Realtime -> this is a stable, documented
--      feature as of 2024+, but double-check against the project's actual Postgres/extension
--      version before applying).
--   2. Apply this migration, then test a real two-device race on staging.
-- If anything here doesn't match (e.g. the function/table don't exist yet on this project's
-- Realtime version), the channel fails closed: no leak, no crash — createKartNet just can't
-- subscribe, reconnects on a backoff, and the race screen still works with AI karts only.

DO $$
BEGIN
  ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "kart family channel read" ON realtime.messages
    FOR SELECT TO authenticated
    USING (realtime.topic() = 'karts:' || (SELECT public.current_family_id())::text);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "kart family channel write" ON realtime.messages
    FOR INSERT TO authenticated
    WITH CHECK (realtime.topic() = 'karts:' || (SELECT public.current_family_id())::text);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
